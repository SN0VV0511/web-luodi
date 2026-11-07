import { clamp, distance, localPoint, point, type Point2 } from "./math";
import { arrived, changePhase, failTask, goTo, pay, phaseFinished, setGesture, stopWalking } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem, LifeVehicle, TaskKind } from "./types";
import type { LifePlace } from "./places";
import { NeighborhoodFleet } from "./vehicles";

interface BusRun {
  vehicleId: number;
  stops: string[];
  cursor: number;
  phase: "travel" | "arrive" | "alight" | "board" | "close";
  phaseUntil: number;
  nextBoardAt: number;
  eventId: number;
  sequence: number;
  skipped: number;
}

interface Journey {
  id: number;
  actorId: number;
  kind: "bus" | "taxi";
  originStop: string;
  destinationStop: string;
  finalVenue: string;
  continuation: TaskKind;
  vehicleId: number;
  requestedAt: number;
  boardedAt: number;
  alightedAt: number;
  price: number;
  paid: boolean;
  eventId: number;
  missed: number;
  waitingPosition: Point2;
  destination: Point2;
}

export class NeighborhoodTransport implements LifeSystem {
  private readonly runs = new Map<number, BusRun>();
  private readonly journeys = new Map<number, Journey>();
  private readonly waiting = new Map<string, number[]>();
  private nextJourney = 1;
  private readonly target = point();

  constructor(private readonly fleet: NeighborhoodFleet) {}

  reset(context: LifeContext): void {
    this.runs.clear();
    this.journeys.clear();
    this.waiting.clear();
    this.nextJourney = 1;
    const stops = context.places.ofKind("bus-stop");
    const ids = stops.map((stop) => stop.id);
    for (const vehicle of context.vehicles) {
      if (vehicle.kind !== "bus" || ids.length < 2) continue;
      const run: BusRun = {
        vehicleId: vehicle.id,
        stops: [...ids],
        cursor: vehicle.id % ids.length,
        phase: "arrive",
        phaseUntil: context.time.seconds + vehicle.id * 3,
        nextBoardAt: 0,
        eventId: -1,
        sequence: 0,
        skipped: 0,
      };
      this.runs.set(vehicle.id, run);
      this.fleet.claim(vehicle, -vehicle.id);
      const stop = context.places.get(run.stops[run.cursor]);
      if (stop) {
        this.fleet.driveTo(vehicle, stop.entrance, context);
        run.phase = "travel";
      }
    }
    for (const stop of stops) this.waiting.set(stop.id, []);
  }

  tick(context: LifeContext): void {
    for (const actor of context.actors) {
      if (!actor.task) continue;
      if (actor.task.kind === "commute" || actor.task.kind === "bus" || actor.task.kind === "taxi") this.passenger(actor, actor.task, context);
    }
    for (const run of this.runs.values()) this.bus(run, context);
    this.taxis(context);
    this.reorderWaiting(context);
  }

  private passenger(actor: Actor, task: ActorTask, context: LifeContext): void {
    let journey = this.journeys.get(actor.id);
    if (task.phase === "start") {
      journey = this.planJourney(actor, task, context);
      if (!journey) {
        this.walkInstead(actor, task, context);
        return;
      }
      this.journeys.set(actor.id, journey);
      task.serviceId = journey.id;
      changePhase(task, "to-stop", context);
    }
    if (!journey) return;
    if (task.phase === "to-stop") {
      goTo(actor, journey.waitingPosition, context, 4);
      if (arrived(actor, journey.waitingPosition, 0.7)) {
        stopWalking(actor, "waiting");
        changePhase(task, "waiting", context, actor.personality.patience * 75 + 50);
        this.joinStop(journey.originStop, actor.id);
        journey.eventId = context.events.publish(`journey-${journey.id}`, "transport",
          journey.kind === "bus" ? { zh: "乘客在站台等候公交", en: "Passengers wait at the bus stop" } : { zh: "居民等候出租车", en: "A resident waits for a taxi" },
          journey.kind === "bus" ? { zh: "车辆进站后先下后上，乘客排队刷票、入座，再在目的站下车。", en: "The bus lets passengers off before the queue boards; riders pay, take a seat and leave at their destination." }
            : { zh: "出租车接到请求后靠边停车，乘客上车，再沿道路送到目的街区。", en: "A taxi pulls to the curb, picks up the passenger and follows the roads to their destination." },
          actor.position, context.time.seconds, 180, [actor.id], 1);
      }
      return;
    }
    if (task.phase === "waiting") {
      stopWalking(actor, "waiting");
      setGesture(actor, Math.floor(context.time.seconds / 4 + actor.id) % 3 === 0 ? "watch" : "type", context.time.seconds, 0.5);
      const index = this.waiting.get(journey.originStop)?.indexOf(actor.id) ?? 0;
      if (index >= 0) {
        const stop = context.places.get(journey.originStop);
        if (stop) {
          localPoint(stop.entrance, stop.heading, 0, -index * 0.65, this.target);
          if (distance(actor.position, this.target) > 0.3) goTo(actor, this.target, context, 3);
        }
      }
      if (journey.kind === "taxi" && journey.vehicleId < 0) this.requestTaxi(actor, journey, context);
      context.events.update(journey.eventId, actor.position, Math.min(0.3, (context.time.seconds - journey.requestedAt) / 300), context.time.seconds, "waiting");
      if (phaseFinished(task, context) && journey.vehicleId < 0) this.walkInstead(actor, task, context);
      return;
    }
    if (task.phase === "boarding") {
      setGesture(actor, journey.paid ? "carry" : "pay", context.time.seconds, 0.7);
      const vehicle = context.vehicles.find((candidate) => candidate.id === journey.vehicleId);
      if (!vehicle) {
        failTask(actor, context, "transport-vehicle-missing");
        return;
      }
      if (!phaseFinished(task, context)) return;
      if (!journey.paid && !pay(actor, journey.price)) {
        this.walkInstead(actor, task, context);
        return;
      }
      journey.paid = true;
      if (this.fleet.board(vehicle, actor.id, context)) {
        journey.boardedAt = context.time.seconds;
        changePhase(task, "riding", context, 180);
        this.leaveStop(journey.originStop, actor.id);
      }
      return;
    }
    if (task.phase === "riding") {
      task.deadline = Math.max(task.deadline, context.time.seconds + 90);
      const vehicle = context.vehicles.find((candidate) => candidate.id === actor.vehicleId);
      if (!vehicle) {
        actor.vehicleId = -1;
        actor.visible = true;
        failTask(actor, context, "transport-ride-interrupted");
        return;
      }
      const progress = 0.3 + this.fleet.progress(vehicle) * 0.55;
      context.events.update(journey.eventId, vehicle.position, progress, context.time.seconds, "riding");
      return;
    }
    if (task.phase === "alighted") {
      if (phaseFinished(task, context)) this.finishJourney(actor, journey, context);
    }
  }

  private planJourney(actor: Actor, task: ActorTask, context: LifeContext): Journey | undefined {
    const finalPlace = context.places.get(task.venueId);
    if (!finalPlace) return undefined;
    const origin = this.nearestStop(actor.position, context);
    const destination = this.nearestStop(finalPlace.entrance, context);
    const busUseful = origin && destination && origin.id !== destination.id
      && distance(actor.position, origin.entrance) + distance(finalPlace.entrance, destination.entrance) < distance(actor.position, finalPlace.entrance) * 1.25;
    const kind = task.kind === "taxi" || !busUseful && actor.budget > 20 ? "taxi" : "bus";
    if (kind === "bus" && (!origin || !destination || origin.id === destination.id)) return undefined;
    const taxiOrigin = kind === "taxi" ? this.nearestTaxiStand(actor.position, context) : undefined;
    const originPlace = kind === "bus" ? origin! : taxiOrigin ?? finalPlace;
    const waitingPosition = kind === "taxi" && !taxiOrigin ? { ...actor.position } : { ...originPlace.entrance };
    const destinationPoint = kind === "bus" ? destination!.entrance : finalPlace.entrance;
    const price = kind === "bus" ? 2 : Math.max(8, distance(waitingPosition, destinationPoint) * 0.05);
    if (actor.budget < price) return undefined;
    let continuation: TaskKind = task.option === "work" || task.kind === "commute" ? "work" : "walk";
    if (finalPlace.kind === "home") continuation = "home";
    if (finalPlace.kind === "restaurant" || finalPlace.kind === "cafe") continuation = "meal";
    return {
      id: this.nextJourney++,
      actorId: actor.id,
      kind,
      originStop: originPlace.id,
      destinationStop: kind === "bus" ? destination!.id : finalPlace.id,
      finalVenue: finalPlace.id,
      continuation,
      vehicleId: -1,
      requestedAt: context.time.seconds,
      boardedAt: 0,
      alightedAt: 0,
      price,
      paid: false,
      eventId: -1,
      missed: 0,
      waitingPosition,
      destination: { ...destinationPoint },
    };
  }

  private nearestStop(position: Point2, context: LifeContext): LifePlace | undefined {
    let best: LifePlace | undefined;
    let bestDistance = Infinity;
    for (const stop of context.places.ofKind("bus-stop")) {
      const separation = distance(position, stop.entrance);
      if (separation < bestDistance && context.routes.isReachable(position, stop.entrance)) {
        best = stop;
        bestDistance = separation;
      }
    }
    return best;
  }

  private nearestTaxiStand(position: Point2, context: LifeContext): LifePlace | undefined {
    let best: LifePlace | undefined;
    let bestDistance = 45;
    for (const stand of context.places.ofKind("taxi-stand")) {
      const separation = distance(position, stand.entrance);
      if (separation < bestDistance && context.routes.isReachable(position, stand.entrance)) {
        best = stand;
        bestDistance = separation;
      }
    }
    return best;
  }

  private joinStop(placeId: string, actorId: number): void {
    const queue = this.waiting.get(placeId) ?? [];
    if (!queue.includes(actorId)) queue.push(actorId);
    this.waiting.set(placeId, queue);
  }

  private leaveStop(placeId: string, actorId: number): void {
    const queue = this.waiting.get(placeId);
    if (!queue) return;
    const index = queue.indexOf(actorId);
    if (index >= 0) queue.splice(index, 1);
  }

  private bus(run: BusRun, context: LifeContext): void {
    const vehicle = context.vehicles.find((candidate) => candidate.id === run.vehicleId);
    const stop = context.places.get(run.stops[run.cursor]);
    if (!vehicle || !stop) return;
    if (run.phase === "travel") {
      if (this.fleet.atDestination(vehicle)) {
        run.phase = "arrive";
        run.phaseUntil = context.time.seconds + 1;
        run.eventId = context.events.publish(`bus-stop-${vehicle.id}`, "transport",
          { zh: "公交车靠站，乘客先下后上", en: "The bus pulls in for its passengers" },
          { zh: "公交车减速停稳后开启车门，等待下车与排队上车完成。", en: "The bus slows to a stop, opens its doors, and waits for passengers to alight and board in order." },
          stop.entrance, context.time.seconds, 15, vehicle.occupancy, 1);
      }
      return;
    }
    if (run.phase === "arrive") {
      if (context.time.seconds < run.phaseUntil) return;
      if (this.fleet.openDoors(vehicle, context, 14)) {
        run.phase = "alight";
        run.phaseUntil = context.time.seconds + 2;
      }
      return;
    }
    if (run.phase === "alight") {
      for (const id of [...vehicle.occupancy]) {
        const journey = this.journeys.get(id);
        const actor = context.actorById.get(id);
        if (!journey || !actor || journey.destinationStop !== stop.id) continue;
        if (this.fleet.alight(vehicle, id, stop.entrance, context)) {
          journey.alightedAt = context.time.seconds;
          if (actor.task) changePhase(actor.task, "alighted", context, 1.5);
        }
        break;
      }
      const remaining = vehicle.occupancy.some((id) => this.journeys.get(id)?.destinationStop === stop.id);
      if (!remaining && context.time.seconds >= run.phaseUntil) {
        run.phase = "board";
        run.phaseUntil = context.time.seconds + 10;
        run.nextBoardAt = context.time.seconds;
      }
      return;
    }
    if (run.phase === "board") {
      this.fleet.openDoors(vehicle, context, 2);
      if (context.time.seconds >= run.nextBoardAt && vehicle.occupancy.length < vehicle.capacity) {
        const waiting = this.waiting.get(stop.id) ?? [];
        const actor = waiting.map((id) => context.actorById.get(id)).find((candidate) => candidate?.task?.phase === "waiting" && this.journeys.get(candidate.id)?.kind === "bus");
        if (actor) {
          const journey = this.journeys.get(actor.id)!;
          if (distance(actor.position, stop.entrance) < 7) {
            journey.vehicleId = vehicle.id;
            changePhase(actor.task!, "boarding", context, actor.mobility === "ordinary" ? 1.6 : 2.8);
            run.nextBoardAt = context.time.seconds + 2.6;
            run.phaseUntil = Math.max(run.phaseUntil, context.time.seconds + 3.5);
          }
        }
      }
      const boarding = context.actors.some((actor) => actor.task?.phase === "boarding" && this.journeys.get(actor.id)?.vehicleId === vehicle.id);
      if (context.time.seconds >= run.phaseUntil && !boarding) {
        this.markMissed(stop.id, context);
        run.phase = "close";
        run.phaseUntil = context.time.seconds + 1.5;
        this.fleet.closeDoors(vehicle);
      }
      return;
    }
    if (run.phase === "close") {
      if (vehicle.doors > 0.02 || context.time.seconds < run.phaseUntil) return;
      run.cursor = (run.cursor + 1) % run.stops.length;
      run.sequence++;
      const next = context.places.get(run.stops[run.cursor]);
      if (!next) return;
      context.events.finish(run.eventId, context.time.seconds);
      if (this.fleet.driveTo(vehicle, next.entrance, context)) run.phase = "travel";
      else {
        run.skipped++;
        run.phaseUntil = context.time.seconds + 2;
      }
    }
  }

  private markMissed(stopId: string, context: LifeContext): void {
    for (const id of this.waiting.get(stopId) ?? []) {
      const journey = this.journeys.get(id);
      const actor = context.actorById.get(id);
      if (!journey || !actor || journey.kind !== "bus" || actor.task?.phase !== "waiting") continue;
      journey.missed++;
      context.stats.missedBuses++;
      actor.needs.stress = clamp(actor.needs.stress + 0.04, 0, 1);
      if (journey.missed >= 2 && actor.budget > 15) {
        journey.kind = "taxi";
        journey.price = Math.max(8, distance(actor.position, journey.destination) * 0.05);
      }
    }
  }

  private requestTaxi(actor: Actor, journey: Journey, context: LifeContext): void {
    const vehicle = this.fleet.available("taxi", actor.position, context);
    if (!vehicle || !this.fleet.claim(vehicle, journey.id)) return;
    if (!this.fleet.driveTo(vehicle, journey.waitingPosition, context)) {
      this.fleet.release(vehicle, context);
      return;
    }
    journey.vehicleId = vehicle.id;
  }

  private taxis(context: LifeContext): void {
    for (const journey of this.journeys.values()) {
      if (journey.kind !== "taxi" || journey.vehicleId < 0) continue;
      const actor = context.actorById.get(journey.actorId);
      const vehicle = context.vehicles.find((candidate) => candidate.id === journey.vehicleId);
      if (!actor?.task || !vehicle) continue;
      if (actor.task.phase === "waiting" && this.fleet.atDestination(vehicle)) {
        if (this.fleet.openDoors(vehicle, context, 6)) changePhase(actor.task, "boarding", context, 2);
      }
      if (actor.task.phase === "riding" && journey.boardedAt > 0 && journey.alightedAt === 0) {
        if (vehicle.serviceId === journey.id && this.fleet.atDestination(vehicle) && distance(vehicle.position, journey.waitingPosition) < 12) {
          this.fleet.closeDoors(vehicle);
          if (vehicle.doors < 0.05) {
            if (!this.fleet.driveTo(vehicle, journey.destination, context)) {
              this.fleet.openDoors(vehicle, context, 4);
              this.fleet.alight(vehicle, actor.id, journey.waitingPosition, context);
              this.walkInstead(actor, actor.task, context);
            }
          }
        } else if (this.fleet.atDestination(vehicle)) {
          if (this.fleet.openDoors(vehicle, context, 5) && this.fleet.alight(vehicle, actor.id, journey.destination, context)) {
            journey.alightedAt = context.time.seconds;
            changePhase(actor.task, "alighted", context, 2);
            this.fleet.release(vehicle, context);
          }
        }
      }
    }
  }

  private reorderWaiting(context: LifeContext): void {
    if (context.time.tick % 12 !== 0) return;
    for (const [placeId, queue] of this.waiting) {
      const live = queue.filter((id) => {
        const actor = context.actorById.get(id);
        const journey = this.journeys.get(id);
        return actor && journey?.originStop === placeId && (actor.task?.phase === "waiting" || actor.task?.phase === "boarding");
      });
      this.waiting.set(placeId, live);
    }
  }

  private finishJourney(actor: Actor, journey: Journey, context: LifeContext): void {
    const kind = journey.continuation;
    const venue = journey.finalVenue;
    const priority = actor.task?.priority ?? 3;
    context.events.finish(journey.eventId, context.time.seconds);
    context.completeTask(actor, true);
    context.issueTask(actor, kind, venue, priority);
  }

  private walkInstead(actor: Actor, task: ActorTask, context: LifeContext): void {
    const journey = this.journeys.get(actor.id);
    const venue = journey?.finalVenue ?? task.venueId;
    const kind: TaskKind = journey?.continuation ?? (task.kind === "commute" ? "work" : "walk");
    const priority = task.priority;
    context.completeTask(actor, false);
    context.issueTask(actor, kind, venue, priority);
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const journey = this.journeys.get(actor.id);
    if (!journey) return;
    const vehicle = context.vehicles.find((candidate) => candidate.id === journey.vehicleId);
    if (vehicle && actor.vehicleId >= 0) {
      const curb = this.fleet.curb(vehicle.position);
      vehicle.speed = 0;
      vehicle.doors = 1;
      this.fleet.alight(vehicle, actor.id, curb?.sidewalk ?? journey.waitingPosition, context);
    }
    if (vehicle?.kind === "taxi") this.fleet.release(vehicle, context);
    this.leaveStop(journey.originStop, actor.id);
    context.events.finish(journey.eventId, context.time.seconds);
    this.journeys.delete(actor.id);
  }
}
