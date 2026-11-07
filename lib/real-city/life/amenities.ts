import { clamp, distance, localPoint, point, type Point2 } from "./math";
import { addItem, arrived, changePhase, consumeItem, facePoint, failTask, finishSatisfied, goTo, item, phaseFinished, phaseProgress, setGesture, stopWalking } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem } from "./types";
import type { LifePlace } from "./places";

interface WaterPoint {
  id: string;
  placeId: string;
  position: Point2;
  capacity: number;
  volume: number;
  pressure: number;
  quality: number;
  queueId: string;
  propId: number;
  usedToday: number;
  lastDay: number;
  frostClosed: boolean;
  maintenanceClosed: boolean;
}

interface PublicBin {
  id: string;
  placeId: string;
  position: Point2;
  volume: number;
  capacity: number;
  propId: number;
  lastCleanliness: number;
  lastEmptied: number;
  paper: number;
  organic: number;
  packaging: number;
}

interface WaterVisit {
  actorId: number;
  fountainId: string;
  eventId: number;
  initialThirst: number;
  volume: number;
  queueJoined: boolean;
  originalVenue: string;
}

interface CarriedWaste {
  actorId: number;
  kind: "paper" | "organic" | "packaging";
  volume: number;
  createdAt: number;
  disposeAfter: number;
  binId: string;
  taskId: number;
  originalTarget: Point2 | null;
  originalPhase: string;
  phase: "carrying" | "approaching" | "discarding";
  phaseUntil: number;
  propId: number;
}

export class NeighborhoodAmenities implements LifeSystem {
  private readonly fountains = new Map<string, WaterPoint>();
  private readonly bins = new Map<string, PublicBin>();
  private readonly visits = new Map<number, WaterVisit>();
  private readonly waste = new Map<number, CarriedWaste>();
  private readonly inventoryHistory = new Map<number, Map<number, string>>();
  private readonly target = point();
  private nextStockCheck = 0;

  reset(context: LifeContext): void {
    this.fountains.clear();
    this.bins.clear();
    this.visits.clear();
    this.waste.clear();
    this.inventoryHistory.clear();
    this.nextStockCheck = context.time.seconds;
    for (const place of context.places.all) {
      if (place.kind !== "park" && place.kind !== "promenade" && place.kind !== "school") continue;
      const waterSlot = place.slots.find((slot) => slot.kind === "water");
      if (waterSlot && this.fountains.size < 8) this.installFountain(place, waterSlot.position, context);
      const binSlot = place.slots.find((slot) => slot.kind === "bin");
      if (binSlot && this.bins.size < 12) this.installBin(place, binSlot.position, context);
    }
  }

  private installFountain(place: LifePlace, position: Point2, context: LifeContext): void {
    const id = `water-${place.id}`;
    const queueId = `water-queue-${place.id}`;
    const prop = context.props.create("fountain", position, context.time.seconds, { color: "#859a92", accent: "#a5afa5", heading: place.heading });
    context.queues.ensure(queueId, place.id, position, place.heading, 3.5, 4);
    this.fountains.set(id, {
      id,
      placeId: place.id,
      position: { ...position },
      capacity: 120,
      volume: 100,
      pressure: 0.8,
      quality: 1,
      queueId,
      propId: prop?.id ?? -1,
      usedToday: 0,
      lastDay: context.time.day,
      frostClosed: false,
      maintenanceClosed: false,
    });
  }

  private installBin(place: LifePlace, position: Point2, context: LifeContext): void {
    const id = `bin-${place.id}`;
    const prop = context.props.create("bin", position, context.time.seconds, { color: "#687a68", accent: "#48594b" });
    this.bins.set(id, {
      id,
      placeId: place.id,
      position: { ...position },
      volume: 0.12,
      capacity: 8,
      propId: prop?.id ?? -1,
      lastCleanliness: place.cleanliness,
      lastEmptied: context.time.seconds,
      paper: 0,
      organic: 0,
      packaging: 0,
    });
  }

  tick(context: LifeContext): void {
    this.monitorResources(context);
    this.findWaterNeeds(context);
    for (const actor of context.actors) {
      if (actor.task?.option === "public-water") this.waterVisit(actor, actor.task, context);
      this.trackConsumption(actor, context);
    }
    this.disposeWaste(context);
  }

  private monitorResources(context: LifeContext): void {
    const dt = context.time.dt;
    for (const fountain of this.fountains.values()) {
      fountain.frostClosed = context.weather.temperature < -1 && context.weather.snow > 0.1;
      const place = context.places.get(fountain.placeId);
      fountain.maintenanceClosed = (place?.maintenance ?? 1) < 0.4;
      if (fountain.lastDay !== context.time.day) {
        fountain.lastDay = context.time.day;
        fountain.usedToday = 0;
        fountain.quality = Math.min(1, fountain.quality + 0.1);
      }
      fountain.volume = Math.min(fountain.capacity, fountain.volume + dt * 0.025);
      const demand = context.queues.estimateWait(fountain.queueId);
      const targetPressure = fountain.volume < 5 ? 0 : clamp(0.9 - demand * 0.015, 0.3, 1);
      fountain.pressure += (targetPressure - fountain.pressure) * dt * 0.8;
      const prop = context.props.get(fountain.propId);
      if (prop) {
        prop.state = fountain.frostClosed || fountain.maintenanceClosed ? "closed" : "open";
        prop.progress = fountain.pressure;
      }
    }
    if (context.time.seconds < this.nextStockCheck) return;
    this.nextStockCheck = context.time.seconds + 2;
    for (const bin of this.bins.values()) {
      const place = context.places.get(bin.placeId);
      if (!place) continue;
      const cleaned = place.cleanliness - bin.lastCleanliness > 0.1 || place.lastCleaning > bin.lastEmptied;
      if (cleaned) {
        bin.volume = 0;
        bin.paper = 0;
        bin.organic = 0;
        bin.packaging = 0;
        bin.lastEmptied = context.time.seconds;
      }
      bin.lastCleanliness = place.cleanliness;
      if (bin.volume > bin.capacity * 0.8) place.cleanliness = Math.max(0, place.cleanliness - 0.002);
      const prop = context.props.get(bin.propId);
      if (prop) prop.progress = bin.volume / bin.capacity;
      place.stock.set("bin-fill", bin.volume / bin.capacity);
    }
  }

  private findWaterNeeds(context: LifeContext): void {
    for (const actor of context.actors) {
      const task = actor.task;
      if (!task || task.kind !== "coffee" || task.phase !== "start" || task.option === "public-water") continue;
      if (actor.needs.thirst < 0.65 || actor.age === "child" || actor.umbrellaOpen > 0.7) continue;
      let nearest: WaterPoint | undefined;
      let best = Math.min(40, distance(actor.position, task.target));
      for (const fountain of this.fountains.values()) {
        if (!this.operational(fountain)) continue;
        const separation = distance(actor.position, fountain.position);
        if (separation < best && context.routes.isReachable(actor.position, fountain.position)) {
          nearest = fountain;
          best = separation;
        }
      }
      if (!nearest) continue;
      const originalVenue = task.venueId;
      task.option = "public-water";
      task.venueId = nearest.placeId;
      task.target = { ...nearest.position };
      this.visits.set(actor.id, {
        actorId: actor.id,
        fountainId: nearest.id,
        eventId: -1,
        initialThirst: actor.needs.thirst,
        volume: 0,
        queueJoined: false,
        originalVenue,
      });
    }
  }

  private operational(fountain: WaterPoint): boolean {
    return !fountain.frostClosed && !fountain.maintenanceClosed && fountain.volume > 1 && fountain.pressure > 0.2 && fountain.quality > 0.7;
  }

  private waterVisit(actor: Actor, task: ActorTask, context: LifeContext): void {
    const visit = this.visits.get(actor.id);
    const fountain = visit ? this.fountains.get(visit.fountainId) : undefined;
    if (!visit || !fountain) {
      failTask(actor, context, "water-point-unavailable");
      return;
    }
    if (!this.operational(fountain) && task.phase !== "drink") {
      this.fallbackCafe(actor, visit, context);
      return;
    }
    if (task.phase === "start") {
      changePhase(task, "water-approach", context);
      goTo(actor, fountain.position, context, 3);
    }
    if (task.phase === "water-approach") {
      if (arrived(actor, fountain.position, 1.2)) {
        const joined = context.queues.join(fountain.queueId, actor, context.time.seconds, 1);
        if (!joined) {
          this.fallbackCafe(actor, visit, context);
          return;
        }
        visit.queueJoined = true;
        changePhase(task, "water-queue", context, 30);
      } else goTo(actor, fountain.position, context, 3);
      return;
    }
    if (task.phase === "water-queue") {
      const target = context.queues.target(actor.id);
      if (target) {
        goTo(actor, target, context, 3);
        if (arrived(actor, target, 0.4)) stopWalking(actor, "queuing");
      }
      setGesture(actor, context.queues.isActive(actor.id) ? "carry" : "watch", context.time.seconds, 0.4);
      if (context.queues.takeCompleted(actor.id)) {
        visit.queueJoined = false;
        changePhase(task, "fill-cup", context, 4 / Math.max(0.3, fountain.pressure));
        addItem(actor, "cup", context, 1, "right-hand", "#c6cebd");
        visit.eventId = context.events.publish(`water-break-${actor.id}`, "leisure",
          { zh: "在公园饮水点补充水分", en: "A water break at the park fountain" },
          { zh: "居民等候前一位用完饮水点，接水后走到一旁喝水，把杯子带去垃圾桶。", en: "The resident waits their turn, fills a cup, steps aside to drink and carries the empty cup to a bin." },
          fountain.position, context.time.seconds, 20, [actor.id], 1);
      } else if (context.queues.takeAbandoned(actor.id) || phaseFinished(task, context)) this.fallbackCafe(actor, visit, context);
      return;
    }
    if (task.phase === "fill-cup") {
      stopWalking(actor, "working");
      facePoint(actor, fountain.position);
      setGesture(actor, "carry", context.time.seconds, 0.6);
      const flow = Math.min(fountain.volume, context.time.dt * fountain.pressure * 0.1);
      fountain.volume -= flow;
      fountain.usedToday += flow;
      visit.volume += flow;
      const prop = context.props.get(fountain.propId);
      if (prop) prop.state = "flowing";
      if (phaseFinished(task, context)) {
        localPoint(fountain.position, actor.heading, 0.85, -0.2, this.target);
        task.target = { ...this.target };
        changePhase(task, "drink", context, 9);
        goTo(actor, task.target, context, 3);
      }
      return;
    }
    if (task.phase === "drink") {
      if (!arrived(actor, task.target, 0.5)) {
        goTo(actor, task.target, context, 3);
        return;
      }
      stopWalking(actor, "resting");
      setGesture(actor, "sip", context.time.seconds, 0.8);
      actor.needs.thirst = clamp(actor.needs.thirst - context.time.dt * 0.065, 0.1, 1);
      actor.needs.comfort = clamp(actor.needs.comfort + context.time.dt * 0.003, 0, 1);
      context.events.update(visit.eventId, actor.position, phaseProgress(task, context), context.time.seconds, "drinking");
      if (phaseFinished(task, context)) {
        consumeItem(actor, "cup", context);
        this.addWaste(actor, "paper", 0.03, context);
        finishSatisfied(actor, context, "water-break-completed", 0.25);
      }
    }
  }

  private fallbackCafe(actor: Actor, visit: WaterVisit, context: LifeContext): void {
    const original = context.places.get(visit.originalVenue);
    context.queues.leave(actor.id);
    this.visits.delete(actor.id);
    if (!actor.task) return;
    if (original) {
      actor.task.option = "";
      actor.task.venueId = original.id;
      actor.task.target = { ...original.entrance };
      changePhase(actor.task, "start", context);
    } else failTask(actor, context, "water-fallback-unavailable");
  }

  private trackConsumption(actor: Actor, context: LifeContext): void {
    if (context.time.tick % 12 !== actor.id % 12) return;
    const previous = this.inventoryHistory.get(actor.id);
    const current = new Map(actor.inventory.map((entry) => [entry.id, entry.kind as string]));
    if (previous && actor.visible && !actor.interiorId) {
      for (const [id, kind] of previous) {
        if (current.has(id)) continue;
        if (kind === "meal") this.addWaste(actor, "packaging", 0.08, context);
        if (kind === "cup") this.addWaste(actor, "paper", 0.03, context);
      }
    }
    this.inventoryHistory.set(actor.id, current);
  }

  private addWaste(actor: Actor, kind: CarriedWaste["kind"], volume: number, context: LifeContext): void {
    const existing = this.waste.get(actor.id);
    if (existing) {
      existing.volume += volume;
      return;
    }
    const prop = context.props.create("ticket", actor.position, context.time.seconds, { ownerId: actor.id, attachment: "left-hand", color: "#c5c0aa", duration: 180 });
    this.waste.set(actor.id, {
      actorId: actor.id,
      kind,
      volume,
      createdAt: context.time.seconds,
      disposeAfter: context.time.seconds + 2,
      binId: "",
      taskId: -1,
      originalTarget: null,
      originalPhase: "",
      phase: "carrying",
      phaseUntil: 0,
      propId: prop?.id ?? -1,
    });
  }

  private disposeWaste(context: LifeContext): void {
    for (const [actorId, waste] of this.waste) {
      const actor = context.actorById.get(actorId);
      if (!actor || context.time.seconds - waste.createdAt > 180) {
        context.props.remove(waste.propId);
        this.waste.delete(actorId);
        continue;
      }
      if (!actor.visible || actor.vehicleId >= 0 || actor.conversationId >= 0) continue;
      if (waste.disposeAfter > context.time.seconds || actor.task && actor.task.priority >= 4) continue;
      if (waste.phase === "carrying") this.findBin(actor, waste, context);
      else if (waste.phase === "approaching") this.approachBin(actor, waste, context);
      else this.discard(actor, waste, context);
    }
  }

  private findBin(actor: Actor, waste: CarriedWaste, context: LifeContext): void {
    let best: PublicBin | undefined;
    let bestDistance = 8;
    for (const bin of this.bins.values()) {
      if (bin.volume >= bin.capacity) continue;
      const separation = distance(actor.position, bin.position);
      if (separation < bestDistance && context.network.walkableSegment(actor.position, bin.position, actor.radius)) {
        best = bin;
        bestDistance = separation;
      }
    }
    if (!best) return;
    const previousTarget = actor.navigation.points.length ? { ...actor.navigation.finalTarget } : null;
    const issued = actor.task
      ? context.interruptTask(actor, "idle", best.placeId, 3)
      : context.issueTask(actor, "idle", best.placeId, 3);
    if (!issued || !actor.task) return;
    actor.task.option = "public-disposal";
    waste.binId = best.id;
    waste.taskId = actor.task?.id ?? -1;
    waste.originalTarget = previousTarget;
    waste.originalPhase = actor.task?.phase ?? "";
    waste.phase = "approaching";
    waste.phaseUntil = context.time.seconds + 15;
    goTo(actor, best.position, context, 3);
  }

  private approachBin(actor: Actor, waste: CarriedWaste, context: LifeContext): void {
    const bin = this.bins.get(waste.binId);
    if (!bin || context.time.seconds > waste.phaseUntil || actor.task?.id !== waste.taskId && waste.taskId >= 0) {
      waste.phase = "carrying";
      waste.disposeAfter = context.time.seconds + 10;
      return;
    }
    goTo(actor, bin.position, context, 3);
    if (arrived(actor, bin.position, 0.7)) {
      waste.phase = "discarding";
      waste.phaseUntil = context.time.seconds + 1.8;
      stopWalking(actor, "working");
      facePoint(actor, bin.position);
    }
  }

  private discard(actor: Actor, waste: CarriedWaste, context: LifeContext): void {
    const bin = this.bins.get(waste.binId);
    setGesture(actor, "lift", context.time.seconds, 0.4);
    stopWalking(actor, "working");
    if (context.time.seconds < waste.phaseUntil) return;
    if (bin) {
      bin.volume = Math.min(bin.capacity, bin.volume + waste.volume);
      bin[waste.kind] += waste.volume;
      const place = context.places.get(bin.placeId);
      if (place) place.cleanliness = Math.min(1, place.cleanliness + 0.001);
    }
    context.props.remove(waste.propId);
    this.waste.delete(actor.id);
    if (actor.task?.option === "public-disposal") context.completeTask(actor, true);
    else actor.nextDecision = Math.min(actor.nextDecision, context.time.seconds + 1);
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const visit = this.visits.get(actor.id);
    if (visit) {
      context.queues.leave(actor.id);
      context.events.finish(visit.eventId, context.time.seconds);
      this.visits.delete(actor.id);
    }
  }
}
