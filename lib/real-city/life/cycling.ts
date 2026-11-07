import { clamp, distance, localPoint, point, type Point2 } from "./math";
import { arrived, changePhase, facePoint, finishSatisfied, goTo, phaseFinished, phaseProgress, remember, setGesture, stopWalking } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem } from "./types";

interface Bicycle {
  id: number;
  propId: number;
  stationId: string;
  position: Point2;
  ownerId: number;
  reservedBy: number;
  reservedUntil: number;
  locked: boolean;
  chainHealth: number;
  tirePressure: number;
  brakeHealth: number;
  wheelPhase: number;
  odometer: number;
  steering: number;
  lastPosition: Point2;
  lastInspection: number;
}

interface CycleTrip {
  actorId: number;
  bikeId: number;
  eventId: number;
  route: Point2[];
  cursor: number;
  destination: Point2;
  distance: number;
  effort: number;
  cadence: number;
  pedalPhase: number;
  lean: number;
  originalPace: number;
  originalRadius: number;
  originalHat: boolean;
  originalMobility: Actor["mobility"];
  riding: boolean;
  returned: boolean;
  brakeApplied: number;
  bellUntil: number;
  waitStarted: number;
  lastHandSignal: number;
}

export class NeighborhoodCycling implements LifeSystem {
  private readonly bicycles = new Map<number, Bicycle>();
  private readonly trips = new Map<number, CycleTrip>();
  private nextBike = 1;
  private readonly neighbors: Actor[] = [];
  private readonly target = point();

  reset(context: LifeContext): void {
    for (const bike of this.bicycles.values()) context.props.remove(bike.propId);
    this.bicycles.clear();
    this.trips.clear();
    this.nextBike = 1;
    const parks = context.places.ofKind("park");
    for (let index = 0; index < Math.min(4, parks.length); index++) {
      const place = parks[index];
      for (let slot = 0; slot < 2; slot++) {
        localPoint(place.entrance, place.heading, -2.4 - slot * 0.65, 0.5, this.target);
        const prop = context.props.create("bicycle", this.target, context.time.seconds, { color: slot ? "#7c9585" : "#9d815c", accent: "#798580", heading: place.heading });
        if (!prop) continue;
        const id = this.nextBike++;
        this.bicycles.set(id, {
          id,
          propId: prop.id,
          stationId: place.id,
          position: { ...this.target },
          ownerId: -1,
          reservedBy: -1,
          reservedUntil: 0,
          locked: true,
          chainHealth: 0.9,
          tirePressure: 0.85,
          brakeHealth: 0.95,
          wheelPhase: 0,
          odometer: 0,
          steering: 0,
          lastPosition: { ...this.target },
          lastInspection: context.time.seconds,
        });
      }
    }
  }

  tick(context: LifeContext): void {
    for (const actor of context.actors) {
      if (actor.task?.kind === "cycling") this.tripTick(actor, actor.task, context);
    }
    this.maintainBicycles(context);
  }

  private tripTick(actor: Actor, task: ActorTask, context: LifeContext): void {
    let trip = this.trips.get(actor.id);
    if (task.phase === "start") {
      trip = this.begin(actor, context);
      if (!trip) {
        const venue = task.venueId;
        context.completeTask(actor, false);
        context.issueTask(actor, "walk", venue, 1);
        return;
      }
      changePhase(task, "collect-bike", context);
    }
    if (!trip) return;
    const bike = this.bicycles.get(trip.bikeId);
    if (!bike) {
      context.completeTask(actor, false);
      return;
    }
    if (task.phase === "collect-bike") {
      goTo(actor, bike.position, context, 2);
      if (arrived(actor, bike.position, 0.8)) {
        stopWalking(actor, "working");
        facePoint(actor, bike.position);
        changePhase(task, "inspect-bike", context, 4);
      }
      return;
    }
    if (task.phase === "inspect-bike") {
      setGesture(actor, "kneel", context.time.seconds, 0.55);
      if (phaseFinished(task, context)) {
        if (bike.tirePressure < 0.55) changePhase(task, "inflate", context, 7);
        else changePhase(task, "unlock", context, 2.5);
      }
      return;
    }
    if (task.phase === "inflate") {
      this.inflate(actor, bike, task, context);
      return;
    }
    if (task.phase === "unlock") {
      setGesture(actor, "type", context.time.seconds, 0.6);
      if (phaseFinished(task, context)) {
        bike.locked = false;
        bike.ownerId = actor.id;
        bike.reservedBy = -1;
        changePhase(task, "mount", context, 2.5);
      }
      return;
    }
    if (task.phase === "mount") {
      setGesture(actor, "push", context.time.seconds, 0.6);
      if (phaseFinished(task, context)) {
        trip.riding = true;
        actor.appearance.hat = true;
        actor.radius = 0.48;
        actor.baseSpeed = 2.8;
        changePhase(task, "ride", context, 90);
        trip.eventId = context.events.publish(`cycling-${actor.id}`, "leisure",
          { zh: "沿公园步道轻松骑行", en: "A gentle bicycle ride through the park" },
          { zh: "居民先检查车胎和刹车，解锁后骑行；遇到行人减速，转弯示意，最后归还并锁好自行车。", en: "The rider checks the tires and brakes, unlocks the bicycle, slows for pedestrians, signals turns and returns the bicycle to its rack." },
          actor.position, context.time.seconds, 100, [actor.id], 1);
      }
      return;
    }
    if (task.phase === "ride") {
      this.ride(actor, task, trip, bike, context);
      return;
    }
    if (task.phase === "return-bike") {
      const station = context.places.get(bike.stationId);
      if (!station) {
        changePhase(task, "dismount", context, 2);
        return;
      }
      goTo(actor, station.entrance, context, 2);
      if (arrived(actor, station.entrance, 1)) changePhase(task, "dismount", context, 2);
      return;
    }
    if (task.phase === "dismount") {
      trip.riding = false;
      actor.baseSpeed = trip.originalPace;
      actor.radius = trip.originalRadius;
      stopWalking(actor, "working");
      setGesture(actor, "push", context.time.seconds, 0.5);
      if (phaseFinished(task, context)) changePhase(task, "lock-bike", context, 2.5);
      return;
    }
    if (task.phase === "lock-bike") {
      setGesture(actor, "kneel", context.time.seconds, 0.5);
      if (phaseFinished(task, context)) {
        bike.locked = true;
        bike.ownerId = -1;
        bike.position.x = actor.position.x + 0.6;
        bike.position.z = actor.position.z;
        trip.returned = true;
        finishSatisfied(actor, context, "cycling-completed", 0.4);
      }
    }
  }

  private begin(actor: Actor, context: LifeContext): CycleTrip | undefined {
    if (actor.mobility !== "ordinary" || actor.age !== "adult") return undefined;
    let selected: Bicycle | undefined;
    let best = Infinity;
    for (const bike of this.bicycles.values()) {
      if (bike.ownerId >= 0 || bike.reservedBy >= 0 || bike.brakeHealth < 0.6 || bike.chainHealth < 0.4) continue;
      const separation = distance(actor.position, bike.position);
      if (separation < best && context.routes.isReachable(actor.position, bike.position)) {
        selected = bike;
        best = separation;
      }
    }
    if (!selected || best > 60) return undefined;
    const route = this.planRoute(selected.position, context);
    if (route.length < 2) return undefined;
    selected.reservedBy = actor.id;
    selected.reservedUntil = context.time.seconds + 50;
    const trip: CycleTrip = {
      actorId: actor.id,
      bikeId: selected.id,
      eventId: -1,
      route,
      cursor: 0,
      destination: { ...selected.position },
      distance: 0,
      effort: 0,
      cadence: 0,
      pedalPhase: 0,
      lean: 0,
      originalPace: actor.baseSpeed,
      originalRadius: actor.radius,
      originalHat: actor.appearance.hat,
      originalMobility: actor.mobility,
      riding: false,
      returned: false,
      brakeApplied: 0,
      bellUntil: 0,
      waitStarted: 0,
      lastHandSignal: 0,
    };
    this.trips.set(actor.id, trip);
    return trip;
  }

  private planRoute(origin: Point2, context: LifeContext): Point2[] {
    const available = context.network.nodes.filter((node) => node.surface === "park" && node.accessible && node.edges.some((id) => context.network.edges[id].width >= 2.6));
    const result: Point2[] = [];
    let current = origin;
    for (let step = 0; step < 5; step++) {
      let best: Point2 | undefined;
      let bestScore = -Infinity;
      for (const node of available) {
        const separation = distance(current, node.position);
        if (separation < 12 || separation > 40 || result.some((target) => distance(target, node.position) < 8)) continue;
        if (!context.routes.isReachable(current, node.position)) continue;
        const score = Math.min(25, separation) - distance(origin, node.position) * 0.08 + node.capacity * 0.1;
        if (score > bestScore) {
          best = node.position;
          bestScore = score;
        }
      }
      if (!best) break;
      result.push({ ...best });
      current = best;
    }
    return result;
  }

  private inflate(actor: Actor, bike: Bicycle, task: ActorTask, context: LifeContext): void {
    setGesture(actor, "push", context.time.seconds, 0.6);
    let pump = context.props.owned(actor.id, "pump");
    if (!pump) pump = context.props.create("pump", { x: actor.position.x + 0.3, z: actor.position.z }, context.time.seconds, { ownerId: actor.id, attachment: "world", duration: 12, color: "#8e7560" });
    if (pump) pump.progress = (Math.sin(context.time.seconds * 3) + 1) * 0.5;
    bike.tirePressure = Math.min(0.9, bike.tirePressure + context.time.dt * 0.06);
    if (phaseFinished(task, context)) {
      if (pump) context.props.remove(pump.id);
      changePhase(task, "unlock", context, 2.5);
    }
  }

  private ride(actor: Actor, task: ActorTask, trip: CycleTrip, bike: Bicycle, context: LifeContext): void {
    const target = trip.route[trip.cursor];
    if (!target || phaseFinished(task, context) || actor.needs.energy < 0.3) {
      changePhase(task, "return-bike", context);
      return;
    }
    goTo(actor, target, context, 2);
    setGesture(actor, "push", context.time.seconds, 0.7);
    context.neighbors.query(actor.position, 4.5, this.neighbors, actor.id);
    let slow = 1;
    for (const pedestrian of this.neighbors) {
      const dx = pedestrian.position.x - actor.position.x;
      const dz = pedestrian.position.z - actor.position.z;
      const forward = dx * Math.sin(actor.heading) + dz * Math.cos(actor.heading);
      const lateral = Math.abs(dx * Math.cos(actor.heading) - dz * Math.sin(actor.heading));
      if (forward <= 0 || lateral > 1.2) continue;
      const safe = pedestrian.age === "child" || pedestrian.age === "elder" ? 2.4 : 1.6;
      slow = Math.min(slow, clamp((forward - safe) / 2, 0, 1));
      if (forward < 3 && context.time.seconds > trip.bellUntil) trip.bellUntil = context.time.seconds + 5;
    }
    actor.baseSpeed = 2.8 * (0.5 + bike.tirePressure * 0.5) * Math.max(0.15, slow) * (1 - context.weather.wetGround * 0.25);
    trip.brakeApplied = 1 - slow;
    if (slow < 0.05) actor.navigation.yieldUntil = Math.max(actor.navigation.yieldUntil, context.time.seconds + 0.35);
    if (arrived(actor, target, 0.8)) trip.cursor++;
    const travel = distance(actor.position, actor.previousPosition);
    trip.distance += travel;
    bike.odometer += travel;
    trip.effort += (actor.speed / 3 - trip.effort) * context.time.dt * 2;
    trip.cadence += (actor.speed * 1.9 - trip.cadence) * context.time.dt * 4;
    trip.pedalPhase += trip.cadence * context.time.dt;
    bike.wheelPhase += travel / 0.32;
    bike.tirePressure = Math.max(0.35, bike.tirePressure - travel * 0.000015);
    bike.chainHealth = Math.max(0.5, bike.chainHealth - travel * 0.000005);
    actor.needs.energy = clamp(actor.needs.energy - context.time.dt * trip.effort * 0.0014, 0, 1);
    actor.needs.thirst = clamp(actor.needs.thirst + context.time.dt * trip.effort * 0.001, 0, 1);
    actor.needs.stress = clamp(actor.needs.stress - context.time.dt * 0.0018, 0, 1);
    task.progress = trip.cursor / trip.route.length;
    context.events.update(trip.eventId, actor.position, task.progress, context.time.seconds, "cycling");
  }

  pose(context: LifeContext): void {
    for (const trip of this.trips.values()) {
      if (!trip.riding) continue;
      const actor = context.actorById.get(trip.actorId);
      if (!actor?.visible) continue;
      const pose = actor.pose;
      const scale = actor.appearance.height / 1.76;
      const saddleHeight = 0.9 / scale;
      const drop = pose.hips.y - saddleHeight;
      pose.hips.y = saddleHeight;
      pose.chest.y -= drop + 0.03;
      pose.head.y -= drop + 0.045;
      pose.chestPitch = 0.16;
      pose.chest.z = 0.1;
      pose.head.z = 0.15;
      pose.leftShoulder.y -= drop + 0.04;
      pose.rightShoulder.y -= drop + 0.04;
      pose.leftShoulder.z = 0.12;
      pose.rightShoulder.z = 0.12;
      pose.leftHand.x = -0.23 / scale;
      pose.rightHand.x = 0.23 / scale;
      pose.leftHand.y = 1.02 / scale;
      pose.rightHand.y = 1.02 / scale;
      pose.leftHand.z = 0.39 / scale;
      pose.rightHand.z = 0.39 / scale;
      pose.leftElbow.x = -0.26;
      pose.rightElbow.x = 0.26;
      pose.leftElbow.y = 1.08;
      pose.rightElbow.y = 1.08;
      pose.leftElbow.z = 0.25;
      pose.rightElbow.z = 0.25;
      for (const side of [-1, 1]) {
        const ankle = side < 0 ? pose.leftAnkle : pose.rightAnkle;
        const knee = side < 0 ? pose.leftKnee : pose.rightKnee;
        const phase = trip.pedalPhase + (side > 0 ? Math.PI : 0);
        ankle.x = side * 0.12 / scale;
        ankle.y = (0.29 + Math.sin(phase) * 0.13) / scale;
        ankle.z = (-0.04 + Math.cos(phase) * 0.13) / scale;
        knee.x = side * 0.14;
        knee.y = (saddleHeight + ankle.y) * 0.5;
        knee.z = 0.25 + Math.max(0, Math.sin(phase)) * 0.08;
      }
      pose.leftFootPlanted = false;
      pose.rightFootPlanted = false;
      pose.leftFootPitch = Math.sin(trip.pedalPhase) * 0.08;
      pose.rightFootPitch = -Math.sin(trip.pedalPhase) * 0.08;
    }
  }

  renderState(context: LifeContext): void {
    for (const bike of this.bicycles.values()) {
      const prop = context.props.get(bike.propId);
      if (!prop) continue;
      const actor = context.actorById.get(bike.ownerId);
      const trip = actor ? this.trips.get(actor.id) : undefined;
      prop.previousPosition.x = prop.position.x;
      prop.previousPosition.z = prop.position.z;
      if (actor && trip?.riding) {
        prop.position.x = actor.position.x;
        prop.position.y = actor.groundY;
        prop.position.z = actor.position.z;
        prop.rotation.y = actor.heading;
        prop.rotation.z = -clamp(actor.avoidance.x * Math.cos(actor.heading) - actor.avoidance.z * Math.sin(actor.heading), -0.09, 0.09);
        prop.phase = bike.wheelPhase;
        bike.position.x = actor.position.x;
        bike.position.z = actor.position.z;
      } else {
        prop.position.x = bike.position.x;
        prop.position.z = bike.position.z;
        prop.position.y = 0.49;
        prop.rotation.z = bike.locked ? 0.07 : 0;
      }
      prop.state = bike.locked ? "locked" : "riding";
    }
  }

  private maintainBicycles(context: LifeContext): void {
    for (const bike of this.bicycles.values()) {
      if (bike.reservedBy >= 0 && bike.reservedUntil < context.time.seconds) bike.reservedBy = -1;
      if (bike.ownerId >= 0) continue;
      if (context.time.seconds - bike.lastInspection < 120) continue;
      const technician = context.actors.find((actor) => actor.occupation === "technician" && actor.visible && distance(actor.position, bike.position) < 3 && actor.mode === "working");
      if (technician) {
        bike.tirePressure = Math.min(0.95, bike.tirePressure + 0.2);
        bike.brakeHealth = Math.min(1, bike.brakeHealth + 0.1);
        bike.chainHealth = Math.min(1, bike.chainHealth + 0.1);
        bike.lastInspection = context.time.seconds;
      }
    }
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const trip = this.trips.get(actor.id);
    if (!trip) return;
    const bike = this.bicycles.get(trip.bikeId);
    if (bike) {
      bike.ownerId = -1;
      bike.reservedBy = -1;
      bike.locked = true;
      if (!trip.returned) {
        const station = context.places.get(bike.stationId);
        if (station) {
          bike.position.x = station.entrance.x - 2.4;
          bike.position.z = station.entrance.z + 0.5;
        }
      }
    }
    actor.baseSpeed = trip.originalPace;
    actor.radius = trip.originalRadius;
    actor.appearance.hat = trip.originalHat;
    actor.mobility = trip.originalMobility;
    context.events.finish(trip.eventId, context.time.seconds);
    if (trip.distance > 20) remember(actor, "bicycle-route", actor.task?.venueId ?? "", context, 0.35);
    this.trips.delete(actor.id);
  }
}
