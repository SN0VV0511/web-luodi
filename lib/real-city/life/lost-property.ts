import { clamp, distance, point, type Point2 } from "./math";
import { arrived, changePhase, facePoint, finishSatisfied, goTo, lookAtActor, phaseFinished, remember, setGesture, stopWalking, worldHand } from "./actions";
import type { Actor, ActorTask, InventoryItem, LifeContext, LifeSystem } from "./types";

interface LostProperty {
  id: number;
  ownerId: number;
  finderId: number;
  item: InventoryItem;
  position: Point2;
  lastSeen: Point2;
  droppedAt: number;
  noticedAt: number;
  foundAt: number;
  returnedAt: number;
  phase: "unnoticed" | "searching" | "found" | "returning" | "returned";
  eventId: number;
  searchPoints: Point2[];
  searchCursor: number;
  finderTask: number;
  ownerTask: number;
  verified: boolean;
  returnAttempt: number;
  originalProp: number;
}

export class NeighborhoodLostProperty implements LifeSystem {
  private readonly records = new Map<number, LostProperty>();
  private readonly ownerRecords = new Map<number, number>();
  private readonly finderRecords = new Map<number, number>();
  private readonly cooldowns = new Map<number, number>();
  private readonly candidates: Actor[] = [];
  private readonly releasing = new Set<number>();
  private nextId = 1;
  private nextObservation = 15;

  reset(context: LifeContext): void {
    for (const record of this.records.values()) {
      if (record.phase !== "returned") this.restore(record, context);
    }
    this.records.clear();
    this.ownerRecords.clear();
    this.finderRecords.clear();
    this.cooldowns.clear();
    this.releasing.clear();
    this.nextId = 1;
    this.nextObservation = context.time.seconds + 15;
  }

  tick(context: LifeContext): void {
    if (context.time.seconds >= this.nextObservation) {
      this.nextObservation = context.time.seconds + 8;
      this.observeAccidentalDrops(context);
    }
    for (const record of [...this.records.values()]) this.recordTick(record, context);
    for (const actor of context.actors) {
      if (actor.task?.option === "searching-property") this.search(actor, actor.task, context);
      else if (actor.task?.option === "returning-property") this.returnProperty(actor, actor.task, context);
    }
  }

  private observeAccidentalDrops(context: LifeContext): void {
    if (this.records.size >= 2) return;
    for (const actor of context.actors) {
      if (!actor.visible || actor.vehicleId >= 0 || actor.groupId >= 0 || actor.conversationId >= 0) continue;
      if (actor.age !== "adult" || actor.mode !== "walking" || actor.speed < 0.7) continue;
      if (actor.task && actor.task.priority >= 3) continue;
      if ((this.cooldowns.get(actor.id) ?? 0) > context.time.seconds || this.ownerRecords.has(actor.id)) continue;
      const carried = actor.inventory.find((entry) => entry.kind === "book" || entry.kind === "flowers");
      if (!carried) continue;
      context.neighbors.query(actor.position, 1.2, this.candidates, actor.id);
      const crowded = this.candidates.length >= 3;
      const wind = context.weather.gust > 0.85 && carried.kind === "flowers";
      if (!crowded && !wind) continue;
      if (!actor.random.probability(crowded ? 0.08 : 0.04)) continue;
      this.drop(actor, carried, context);
      break;
    }
  }

  private drop(actor: Actor, entry: InventoryItem, context: LifeContext): void {
    const prop = context.props.get(entry.propId);
    if (!prop) return;
    const index = actor.inventory.findIndex((candidate) => candidate.id === entry.id);
    if (index < 0) return;
    actor.inventory.splice(index, 1);
    const hand = worldHand(actor, prop.attachment === "left-hand");
    context.props.attach(prop.id, -1, "world");
    context.props.detach(prop.id, hand, true);
    prop.velocity.x = actor.velocity.x * 0.45;
    prop.velocity.y = 0.05;
    prop.velocity.z = actor.velocity.z * 0.45;
    prop.restitution = 0.15;
    prop.friction = 0.85;
    prop.expiresAt = context.time.seconds + 180;
    const id = this.nextId++;
    const record: LostProperty = {
      id,
      ownerId: actor.id,
      finderId: -1,
      item: { ...entry },
      position: { x: prop.position.x, z: prop.position.z },
      lastSeen: { ...actor.position },
      droppedAt: context.time.seconds,
      noticedAt: 0,
      foundAt: 0,
      returnedAt: 0,
      phase: "unnoticed",
      eventId: -1,
      searchPoints: [],
      searchCursor: 0,
      finderTask: -1,
      ownerTask: -1,
      verified: false,
      returnAttempt: 0,
      originalProp: prop.id,
    };
    this.records.set(id, record);
    this.ownerRecords.set(actor.id, id);
    this.cooldowns.set(actor.id, context.time.seconds + 300);
  }

  private recordTick(record: LostProperty, context: LifeContext): void {
    const owner = context.actorById.get(record.ownerId);
    if (!owner) {
      context.props.remove(record.item.propId);
      this.records.delete(record.id);
      this.ownerRecords.delete(record.ownerId);
      return;
    }
    const prop = context.props.get(record.item.propId);
    if (prop?.attachment === "world") {
      record.position.x = prop.position.x;
      record.position.z = prop.position.z;
    }
    if (record.phase === "unnoticed" && context.time.seconds - record.droppedAt > 3.5) this.notice(owner, record, context);
    if ((record.phase === "searching" || record.phase === "unnoticed") && record.finderId < 0) this.findHelpfulPasser(record, context);
    if (record.phase === "returned" && context.time.seconds - record.returnedAt > 5) {
      this.records.delete(record.id);
      this.ownerRecords.delete(record.ownerId);
      if (record.finderId >= 0) this.finderRecords.delete(record.finderId);
    }
    if (record.phase !== "returned" && context.time.seconds - record.droppedAt > 100) {
      this.restore(record, context);
      this.complete(record, context);
    }
  }

  private notice(owner: Actor, record: LostProperty, context: LifeContext): void {
    record.noticedAt = context.time.seconds;
    record.phase = "searching";
    const place = context.places.find(owner, ["park", "promenade", "bench"], context.time);
    const venue = place?.id ?? owner.homeId;
    if (owner.task && owner.task.priority >= 4) return;
    const issued = owner.task ? context.interruptTask(owner, "idle", venue, 3) : context.issueTask(owner, "idle", venue, 3);
    if (!issued || !owner.task) return;
    owner.task.option = "searching-property";
    owner.task.serviceId = record.id;
    owner.task.deadline = context.time.seconds + 90;
    record.ownerTask = owner.task.id;
    record.searchPoints = this.searchRoute(owner, record, context);
    record.searchCursor = 0;
    owner.gesture.emotion = "concerned";
    record.eventId = context.events.publish(`lost-property-${record.id}`, "assistance",
      { zh: "街坊帮忙找回掉落物品", en: "Neighbors help recover a dropped item" },
      { zh: "失主沿刚走过的路寻找，路人拾起物品，核对失主后递还。", en: "The owner retraces their steps while a passerby picks up the item, checks who it belongs to and returns it." },
      record.position, context.time.seconds, 75, [owner.id], 2);
  }

  private searchRoute(owner: Actor, record: LostProperty, context: LifeContext): Point2[] {
    const points: Point2[] = [];
    const middle = { x: (owner.position.x + record.lastSeen.x) * 0.5, z: (owner.position.z + record.lastSeen.z) * 0.5 };
    if (context.routes.isReachable(owner.position, middle)) points.push(middle);
    if (context.routes.isReachable(owner.position, record.lastSeen)) points.push({ ...record.lastSeen });
    if (context.routes.isReachable(owner.position, record.position)) points.push({ ...record.position });
    return points;
  }

  private findHelpfulPasser(record: LostProperty, context: LifeContext): void {
    context.neighbors.query(record.position, 5, this.candidates, record.ownerId);
    const candidates = this.candidates.filter((actor) => actor.age !== "child" && actor.visible && actor.vehicleId < 0 && actor.conversationId < 0 && actor.groupId < 0 && (!actor.task || actor.task.priority < 3) && actor.personality.generosity > 0.55);
    candidates.sort((a, b) => distance(a.position, record.position) - distance(b.position, record.position));
    for (const finder of candidates) {
      if (this.finderRecords.has(finder.id) || this.ownerRecords.has(finder.id)) continue;
      if (!context.routes.isReachable(finder.position, record.position)) continue;
      const place = context.places.find(finder, ["park", "promenade", "bench"], context.time);
      if (!place) continue;
      const issued = finder.task ? context.interruptTask(finder, "help", place.id, 3) : context.issueTask(finder, "help", place.id, 3);
      if (!issued || !finder.task) continue;
      finder.task.option = "returning-property";
      finder.task.serviceId = record.id;
      finder.task.partnerId = record.ownerId;
      finder.task.deadline = context.time.seconds + 70;
      record.finderId = finder.id;
      record.finderTask = finder.task.id;
      this.finderRecords.set(finder.id, record.id);
      if (record.eventId >= 0) context.events.addParticipant(record.eventId, finder.id);
      break;
    }
  }

  private search(owner: Actor, task: ActorTask, context: LifeContext): void {
    const record = this.records.get(this.ownerRecords.get(owner.id) ?? -1);
    if (!record) {
      context.completeTask(owner, false);
      return;
    }
    if (record.phase === "returned") {
      finishSatisfied(owner, context, "property-recovered", 0.4);
      return;
    }
    if (task.phase === "start") changePhase(task, "look-around", context, 2.5);
    if (task.phase === "look-around") {
      stopWalking(owner, "waiting");
      setGesture(owner, "watch", context.time.seconds, 0.6);
      owner.targetHeading += Math.sin(context.time.seconds * 1.2) * context.time.dt * 0.3;
      if (phaseFinished(task, context)) changePhase(task, "retrace", context);
      return;
    }
    if (record.finderId >= 0 && (record.phase === "found" || record.phase === "returning")) {
      const finder = context.actorById.get(record.finderId);
      if (finder) {
        stopWalking(owner, "waiting");
        facePoint(owner, finder.position);
        setGesture(owner, "wave", context.time.seconds, 0.7);
      }
      return;
    }
    const target = record.searchPoints[record.searchCursor] ?? record.position;
    goTo(owner, target, context, 3);
    if (arrived(owner, target, 0.6)) {
      record.searchCursor++;
      setGesture(owner, "watch", context.time.seconds, 0.4);
      if (record.searchCursor >= record.searchPoints.length && distance(owner.position, record.position) < 1 && record.finderId < 0) {
        changePhase(task, "self-retrieve", context, 2);
      }
    }
    if (task.phase === "self-retrieve") {
      stopWalking(owner, "working");
      setGesture(owner, "kneel", context.time.seconds, 0.6);
      if (phaseFinished(task, context)) {
        this.restore(record, context);
        this.complete(record, context);
      }
    }
  }

  private returnProperty(finder: Actor, task: ActorTask, context: LifeContext): void {
    const record = this.records.get(this.finderRecords.get(finder.id) ?? -1);
    const owner = record ? context.actorById.get(record.ownerId) : undefined;
    if (!record || !owner) {
      context.completeTask(finder, false);
      return;
    }
    if (record.phase === "returned") {
      finishSatisfied(finder, context, "returned-property", 0.4);
      return;
    }
    if (task.phase === "start") changePhase(task, "approach-item", context);
    if (task.phase === "approach-item") {
      goTo(finder, record.position, context, 3);
      if (arrived(finder, record.position, 0.55)) {
        stopWalking(finder, "working");
        facePoint(finder, record.position);
        changePhase(task, "pick-up", context, 2.2);
      }
      return;
    }
    if (task.phase === "pick-up") {
      setGesture(finder, "kneel", context.time.seconds, 0.65);
      if (phaseFinished(task, context)) {
        const prop = context.props.get(record.item.propId);
        if (prop) context.props.attach(prop.id, finder.id, "right-hand");
        record.phase = "found";
        record.foundAt = context.time.seconds;
        changePhase(task, "seek-owner", context, 30);
        setGesture(finder, "wave", context.time.seconds, 0.8);
      }
      return;
    }
    if (task.phase === "seek-owner") {
      record.phase = "returning";
      if (!owner.visible || owner.vehicleId >= 0) {
        setGesture(finder, "phone", context.time.seconds, 0.5);
        if (phaseFinished(task, context)) {
          record.returnAttempt++;
          const home = context.places.get(owner.homeId);
          if (home) goTo(finder, home.entrance, context, 3);
          if (record.returnAttempt > 2) {
            this.restore(record, context);
            this.complete(record, context);
          } else task.until = context.time.seconds + 15;
        }
        return;
      }
      goTo(finder, owner.position, context, 3);
      if (arrived(finder, owner.position, 1.3)) {
        stopWalking(finder, "assisting");
        stopWalking(owner, "waiting");
        changePhase(task, "verify-owner", context, 3.5);
      }
      return;
    }
    if (task.phase === "verify-owner") {
      facePoint(finder, owner.position);
      facePoint(owner, finder.position);
      lookAtActor(finder, owner, context, 2);
      setGesture(finder, "talk", context.time.seconds, 0.6);
      setGesture(owner, "listen", context.time.seconds, 0.4);
      if (phaseFinished(task, context)) {
        record.verified = record.item.owner === owner.id;
        if (record.verified) changePhase(task, "handover", context, 2.3);
        else this.rejectReturn(finder, record, context);
      }
      return;
    }
    if (task.phase === "handover") {
      setGesture(finder, "carry", context.time.seconds, 0.6);
      setGesture(owner, "carry", context.time.seconds, 0.6);
      if (phaseFinished(task, context)) {
        this.restore(record, context);
        this.complete(record, context);
      }
    }
  }

  private rejectReturn(finder: Actor, record: LostProperty, context: LifeContext): void {
    record.finderId = -1;
    record.finderTask = -1;
    record.phase = "searching";
    this.finderRecords.delete(finder.id);
    const prop = context.props.get(record.item.propId);
    if (prop) {
      context.props.attach(prop.id, -1, "world");
      context.props.detach(prop.id, { x: record.position.x, y: prop.groundY + 0.04, z: record.position.z }, false);
    }
    context.completeTask(finder, false);
  }

  private restore(record: LostProperty, context: LifeContext): void {
    const owner = context.actorById.get(record.ownerId);
    if (!owner) return;
    let prop = context.props.get(record.item.propId);
    if (!prop) {
      prop = context.props.create(record.item.kind, owner.position, context.time.seconds, { ownerId: owner.id, attachment: "right-hand" });
      if (prop) record.item.propId = prop.id;
    }
    if (prop) {
      context.props.attach(prop.id, owner.id, "right-hand");
      prop.expiresAt = Infinity;
      prop.physical = false;
      prop.visible = owner.visible;
    }
    if (!owner.inventory.some((entry) => entry.id === record.item.id)) owner.inventory.push({ ...record.item, owner: owner.id });
    record.phase = "returned";
    record.returnedAt = context.time.seconds;
  }

  private complete(record: LostProperty, context: LifeContext): void {
    record.phase = "returned";
    record.returnedAt = context.time.seconds;
    const owner = context.actorById.get(record.ownerId);
    const finder = context.actorById.get(record.finderId);
    if (owner) {
      owner.gesture.emotion = "happy";
      owner.needs.stress = clamp(owner.needs.stress - 0.1, 0, 1);
      remember(owner, "property-returned", owner.task?.venueId ?? "", context, 0.6, record.finderId, record.eventId);
      if (finder) {
        const relationship = owner.relationships.get(finder.id);
        if (relationship) {
          relationship.trust = Math.min(1, relationship.trust + 0.1);
          relationship.affinity = Math.min(1, relationship.affinity + 0.05);
        }
      }
      if (owner.task?.option === "searching-property") {
        this.releasing.add(owner.id);
        context.completeTask(owner, true);
        this.releasing.delete(owner.id);
      }
    }
    if (finder?.task?.option === "returning-property") {
      this.releasing.add(finder.id);
      remember(finder, "helped-return-property", finder.task.venueId, context, 0.45, record.ownerId, record.eventId);
      context.completeTask(finder, true);
      this.releasing.delete(finder.id);
    }
    context.events.finish(record.eventId, context.time.seconds);
    this.ownerRecords.delete(record.ownerId);
    if (record.finderId >= 0) this.finderRecords.delete(record.finderId);
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    if (this.releasing.has(actor.id)) return;
    const ownerRecord = this.records.get(this.ownerRecords.get(actor.id) ?? -1);
    if (ownerRecord && ownerRecord.phase !== "returned") {
      ownerRecord.ownerTask = -1;
      ownerRecord.noticedAt = context.time.seconds;
    }
    const found = this.records.get(this.finderRecords.get(actor.id) ?? -1);
    if (found && found.phase !== "returned") {
      found.finderId = -1;
      found.finderTask = -1;
      found.phase = "searching";
      const prop = context.props.get(found.item.propId);
      if (prop) {
        context.props.attach(prop.id, -1, "world");
        context.props.detach(prop.id, { x: actor.position.x, y: actor.groundY + 0.04, z: actor.position.z }, false);
        found.position.x = actor.position.x;
        found.position.z = actor.position.z;
      }
      this.finderRecords.delete(actor.id);
    }
  }
}
