import { clamp, distance, localPoint, point, type Point2 } from "./math";
import type { Actor, LifeContext } from "./types";
import type { LifePlace, PlaceDirectory } from "./places";
import type { CityBuiltSite } from "../contracts";

interface Passage {
  id: string;
  placeId: string;
  entrance: Point2;
  outside: Point2;
  inside: Point2;
  heading: number;
  width: number;
  accessible: boolean;
  capacity: number;
  queue: number[];
  active: Set<number>;
  opening: number;
  openingTarget: number;
  keepOpenUntil: number;
  nextAdmission: number;
  exitsWaiting: number;
  admitted: number;
  heldFor: number;
  heldUntil: number;
}

interface EntranceIntent {
  actorId: number;
  passageId: string;
  requestedAt: number;
  readyAt: number;
  admittedAt: number;
  expiresAt: number;
  direction: "enter" | "exit";
  phase: "waiting" | "admitted" | "crossing" | "complete";
  priority: number;
  clearance: number;
  queuePosition: Point2;
  startedPosition: Point2;
  progress: number;
}

export class BuildingPassages {
  private readonly passages = new Map<string, Passage>();
  private readonly intents = new Map<number, EntranceIntent>();
  private readonly recentlyInside = new Map<number, { position: Point2; until: number; y: number }>();
  private readonly sensors: { x: number; y?: number; z: number }[] = [];
  private readonly target = point();

  constructor(places: PlaceDirectory, sites: readonly CityBuiltSite[]) {
    for (const place of places.all) {
      if (!["home", "office", "restaurant", "cafe", "grocery", "bookshop", "florist", "school", "clinic", "police", "workshop"].includes(place.kind)) continue;
      const built = sites.find((site) => site.id === place.id || site.entrances.some((entrance) => distance(entrance.position, place.entrance) < 1));
      const door = built?.entrances.find((entrance) => distance(entrance.position, place.entrance) < 2);
      const heading = door ? Math.atan2(door.outward.x, door.outward.z) : place.heading;
      const width = door?.width ?? (place.kind === "office" || place.kind === "school" ? 1.8 : 1.1);
      const entrance = { ...place.entrance };
      const outside = localPoint(entrance, heading, 0, 0.6, point());
      const inside = localPoint(entrance, heading, 0, -0.5, point());
      this.passages.set(place.id, {
        id: `passage-${place.id}`,
        placeId: place.id,
        entrance,
        outside,
        inside,
        heading,
        width,
        accessible: door?.accessible ?? place.wheelchairAccess,
        capacity: width >= 1.6 ? 2 : 1,
        queue: [],
        active: new Set(),
        opening: 0,
        openingTarget: 0,
        keepOpenUntil: 0,
        nextAdmission: 0,
        exitsWaiting: 0,
        admitted: 0,
        heldFor: -1,
        heldUntil: 0,
      });
    }
  }

  reset(): void {
    this.intents.clear();
    this.recentlyInside.clear();
    this.sensors.length = 0;
    for (const passage of this.passages.values()) {
      passage.queue.length = 0;
      passage.active.clear();
      passage.opening = 0;
      passage.openingTarget = 0;
      passage.keepOpenUntil = 0;
      passage.nextAdmission = 0;
      passage.exitsWaiting = 0;
      passage.admitted = 0;
      passage.heldFor = -1;
      passage.heldUntil = 0;
    }
  }

  mayEnter(actor: Actor, place: LifePlace, context: LifeContext): boolean {
    const passage = this.passages.get(place.id);
    if (!passage) return true;
    if (!passage.accessible && actor.mobility !== "ordinary") return false;
    if (distance(actor.position, passage.entrance) > 1.6) return false;
    let intent = this.intents.get(actor.id);
    if (intent && intent.passageId !== passage.id) {
      this.release(actor.id);
      intent = undefined;
    }
    if (!intent) {
      intent = {
        actorId: actor.id,
        passageId: passage.id,
        requestedAt: context.time.seconds,
        readyAt: context.time.seconds + 0.3,
        admittedAt: -1,
        expiresAt: context.time.seconds + 18,
        direction: "enter",
        phase: "waiting",
        priority: actor.task?.priority ?? 1,
        clearance: actor.mobility === "stroller" ? 0.9 : actor.mobility === "cane" ? 0.7 : 0.55,
        queuePosition: { ...actor.position },
        startedPosition: { ...actor.position },
        progress: 0,
      };
      this.intents.set(actor.id, intent);
      passage.queue.push(actor.id);
      passage.keepOpenUntil = Math.max(passage.keepOpenUntil, context.time.seconds + 4);
      actor.navigation.yieldUntil = Math.max(actor.navigation.yieldUntil, context.time.seconds + 0.3);
    }
    intent.expiresAt = context.time.seconds + 12;
    if (intent.phase === "complete") {
      this.recentlyInside.set(actor.id, { position: { ...passage.entrance }, until: context.time.seconds + 1.8, y: place.groundY });
      this.release(actor.id);
      return true;
    }
    if (intent.phase === "waiting") {
      actor.mode = "waiting";
      actor.targetHeading = passage.heading + Math.PI;
      actor.velocity.x = 0;
      actor.velocity.z = 0;
      actor.speed = 0;
      return false;
    }
    if (intent.phase === "admitted" || intent.phase === "crossing") {
      const duration = actor.mobility === "ordinary" ? 0.65 : 1.1;
      const progress = clamp((context.time.seconds - intent.admittedAt) / duration, 0, 1);
      intent.progress = progress;
      actor.mode = "walking";
      actor.position.x = intent.startedPosition.x + (passage.entrance.x - intent.startedPosition.x) * progress;
      actor.position.z = intent.startedPosition.z + (passage.entrance.z - intent.startedPosition.z) * progress;
      actor.speed = progress < 1 ? 0.7 : 0;
      actor.gaitPhase += context.time.dt * 3.5;
      intent.phase = progress >= 1 ? "complete" : "crossing";
      return false;
    }
    return false;
  }

  exit(actor: Actor, place: LifePlace, seconds: number): void {
    const passage = this.passages.get(place.id);
    if (!passage) return;
    this.release(actor.id);
    const exitPosition = localPoint(passage.outside, passage.heading, passage.width > 1.5 ? -0.25 : 0, 0, this.target);
    actor.position.x = exitPosition.x;
    actor.position.z = exitPosition.z;
    actor.previousPosition.x = exitPosition.x;
    actor.previousPosition.z = exitPosition.z;
    actor.heading = passage.heading;
    actor.previousHeading = passage.heading;
    actor.targetHeading = passage.heading;
    actor.navigation.yieldUntil = seconds + (passage.opening < 0.7 ? 0.8 : 0.2);
    passage.keepOpenUntil = Math.max(passage.keepOpenUntil, seconds + 2.8);
    passage.nextAdmission = Math.max(passage.nextAdmission, seconds + 0.9);
    passage.exitsWaiting++;
    this.recentlyInside.set(actor.id, { position: { ...passage.entrance }, until: seconds + 1.5, y: place.groundY });
  }

  tick(context: LifeContext): void {
    for (const passage of this.passages.values()) {
      this.detectApproach(passage, context);
      this.updateOpening(passage, context);
      this.pruneQueue(passage, context);
      this.positionQueue(passage, context);
      this.admitNext(passage, context);
      this.courtesy(passage, context);
    }
    for (const [actorId, intent] of this.intents) {
      if (intent.expiresAt <= context.time.seconds || !context.actorById.get(actorId)?.task) this.release(actorId);
    }
    for (const [actorId, recent] of this.recentlyInside) if (recent.until <= context.time.seconds) this.recentlyInside.delete(actorId);
  }

  private detectApproach(passage: Passage, context: LifeContext): void {
    let approaching = false;
    for (const actor of context.actors) {
      if (!actor.visible || actor.vehicleId >= 0) continue;
      if (distance(actor.position, passage.entrance) > 2.4) continue;
      const destination = actor.task?.venueId === passage.placeId;
      const movingToward = actor.velocity.x * (passage.entrance.x - actor.position.x) + actor.velocity.z * (passage.entrance.z - actor.position.z) > 0;
      if (destination || movingToward || this.recentlyInside.has(actor.id)) {
        approaching = true;
        passage.keepOpenUntil = Math.max(passage.keepOpenUntil, context.time.seconds + 1.5);
      }
    }
    passage.openingTarget = approaching || passage.active.size > 0 || passage.keepOpenUntil > context.time.seconds ? 1 : 0;
  }

  private updateOpening(passage: Passage, context: LifeContext): void {
    const rate = passage.openingTarget > passage.opening ? 1.6 : 0.75;
    const amount = context.time.dt * rate;
    passage.opening = passage.openingTarget > passage.opening ? Math.min(1, passage.opening + amount) : Math.max(0, passage.opening - amount);
    if (passage.exitsWaiting > 0 && context.time.seconds > passage.nextAdmission) passage.exitsWaiting = 0;
  }

  private pruneQueue(passage: Passage, context: LifeContext): void {
    passage.queue = passage.queue.filter((id) => {
      const actor = context.actorById.get(id);
      const intent = this.intents.get(id);
      return !!actor && !!intent && actor.task?.venueId === passage.placeId && intent.phase === "waiting" && distance(actor.position, passage.entrance) < 5;
    });
    for (const id of [...passage.active]) {
      const intent = this.intents.get(id);
      const actor = context.actorById.get(id);
      if (!intent || !actor || !actor.visible || intent.phase === "complete") passage.active.delete(id);
    }
  }

  private positionQueue(passage: Passage, context: LifeContext): void {
    for (let index = 0; index < passage.queue.length; index++) {
      const id = passage.queue[index];
      const actor = context.actorById.get(id);
      const intent = this.intents.get(id);
      if (!actor || !intent) continue;
      const lane = passage.capacity > 1 ? index % 2 : 0;
      const row = Math.floor(index / passage.capacity);
      localPoint(passage.outside, passage.heading, lane === 1 ? 0.3 : passage.capacity > 1 ? -0.3 : 0, row * 0.72, intent.queuePosition);
      if (row > 0 && distance(actor.position, intent.queuePosition) > 0.25) {
        const deltaX = intent.queuePosition.x - actor.position.x;
        const deltaZ = intent.queuePosition.z - actor.position.z;
        const magnitude = Math.max(0.01, Math.hypot(deltaX, deltaZ));
        const step = Math.min(magnitude, context.time.dt * 0.45);
        if (context.network.walkableSegment(actor.position, intent.queuePosition, actor.radius)) {
          actor.position.x += deltaX / magnitude * step;
          actor.position.z += deltaZ / magnitude * step;
          actor.gaitPhase += step * 5;
        }
      }
      actor.targetHeading = passage.heading + Math.PI;
      actor.navigation.yieldUntil = context.time.seconds + 0.2;
    }
  }

  private admitNext(passage: Passage, context: LifeContext): void {
    if (passage.opening < 0.82 || passage.nextAdmission > context.time.seconds || passage.exitsWaiting > 0) return;
    if (passage.active.size >= passage.capacity) return;
    const candidateId = passage.queue[0];
    if (candidateId === undefined) return;
    const actor = context.actorById.get(candidateId);
    const intent = this.intents.get(candidateId);
    if (!actor || !intent || intent.readyAt > context.time.seconds) return;
    if (actor.mobility === "stroller" && passage.active.size > 0) return;
    passage.queue.shift();
    passage.active.add(candidateId);
    passage.admitted++;
    intent.phase = "admitted";
    intent.admittedAt = context.time.seconds;
    intent.startedPosition.x = actor.position.x;
    intent.startedPosition.z = actor.position.z;
    passage.nextAdmission = context.time.seconds + (actor.mobility === "ordinary" ? 0.65 : 1.1);
    passage.keepOpenUntil = Math.max(passage.keepOpenUntil, context.time.seconds + 2);
  }

  private courtesy(passage: Passage, context: LifeContext): void {
    if (passage.heldUntil > context.time.seconds) return;
    if (passage.queue.length === 0 || passage.active.size === 0) return;
    const activeId = [...passage.active][0];
    const waitingId = passage.queue[0];
    const active = context.actorById.get(activeId);
    const waiting = context.actorById.get(waitingId);
    if (!active || !waiting || active.personality.generosity < 0.65) return;
    if (waiting.mobility === "ordinary" && waiting.age !== "elder") return;
    passage.heldFor = waiting.id;
    passage.heldUntil = context.time.seconds + 3;
    passage.keepOpenUntil = Math.max(passage.keepOpenUntil, passage.heldUntil);
    active.gesture.kind = "point";
    active.gesture.intensity = 0.35;
    active.gesture.startedAt = context.time.seconds;
    waiting.gesture.emotion = "happy";
    waiting.needs.stress = Math.max(0, waiting.needs.stress - 0.01);
  }

  sensorPositions(context: LifeContext): { x: number; y?: number; z: number }[] {
    this.sensors.length = 0;
    for (const actor of context.actors) {
      if (actor.vehicleId >= 0 || !actor.visible) continue;
      this.sensors.push({ x: actor.position.x, y: actor.groundY, z: actor.position.z });
    }
    for (const recent of this.recentlyInside.values()) this.sensors.push({ x: recent.position.x, y: recent.y, z: recent.position.z });
    for (const passage of this.passages.values()) {
      if (passage.heldUntil <= context.time.seconds) continue;
      this.sensors.push({ x: passage.entrance.x, z: passage.entrance.z });
    }
    return this.sensors;
  }

  release(actorId: number): void {
    const intent = this.intents.get(actorId);
    if (!intent) return;
    for (const passage of this.passages.values()) {
      if (passage.id !== intent.passageId) continue;
      const index = passage.queue.indexOf(actorId);
      if (index >= 0) passage.queue.splice(index, 1);
      passage.active.delete(actorId);
      break;
    }
    this.intents.delete(actorId);
  }
}
