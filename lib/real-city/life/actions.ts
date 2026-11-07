import { clamp, distance, heading, point3, type Point2, type Point3 } from "./math";
import type { Actor, ActorMode, ActorTask, GestureKind, InventoryItem, ItemKind, LifeContext, TaskKind } from "./types";
import type { LifePlace, PlaceFeature } from "./places";
import type { DestinationReservation } from "./reservations";
import type { PropAttachment, PropKind } from "./props-state";

let inventorySequence = 1;

export function setGesture(actor: Actor, kind: GestureKind, seconds: number, intensity = 1, duration = 2): void {
  if (actor.gesture.kind === kind) {
    actor.gesture.intensity = intensity;
    return;
  }
  actor.gesture.previous = actor.gesture.kind;
  actor.gesture.kind = kind;
  actor.gesture.startedAt = seconds;
  actor.gesture.duration = duration;
  actor.gesture.intensity = intensity;
  actor.gesture.blend = 0;
  actor.gesture.hasTarget = false;
}

export function gestureToward(actor: Actor, kind: GestureKind, target: Point3, context: LifeContext, hand: "left" | "right" | "both" = "right"): void {
  setGesture(actor, kind, context.time.seconds);
  actor.gesture.hand = hand;
  actor.gesture.target.x = target.x;
  actor.gesture.target.y = target.y;
  actor.gesture.target.z = target.z;
  actor.gesture.hasTarget = true;
}

export function facePoint(actor: Actor, target: Point2): void {
  if (distance(actor.position, target) < 0.02) return;
  actor.targetHeading = heading(actor.position, target);
  actor.gesture.gazePoint.x = target.x;
  actor.gesture.gazePoint.z = target.z;
}

export function lookAtActor(actor: Actor, target: Actor, context: LifeContext, duration = 3): void {
  actor.gesture.gazeId = target.id;
  actor.gesture.gazePoint.x = target.position.x;
  actor.gesture.gazePoint.z = target.position.z;
  actor.gesture.gazeUntil = context.time.seconds + duration;
}

export function goTo(actor: Actor, target: Point2, context: LifeContext, priority = 1): boolean {
  if (actor.vehicleId >= 0) return false;
  if (distance(actor.position, target) < 0.25) {
    actor.navigation.arrived = true;
    actor.navigation.pending = false;
    actor.navigation.failed = false;
    actor.navigation.arrivedAt = context.time.seconds;
    actor.navigation.finalTarget.x = target.x;
    actor.navigation.finalTarget.z = target.z;
    stopWalking(actor);
    return true;
  }
  const sameTarget = distance(actor.navigation.finalTarget, target) < 0.15;
  if (sameTarget && !actor.navigation.failed && (actor.navigation.pending || actor.navigation.points.length > actor.navigation.cursor)) return false;
  context.routes.request(actor, target, context.time.seconds, priority);
  actor.mode = "walking";
  actor.visible = true;
  return false;
}

export function arrived(actor: Actor, target?: Point2, tolerance = 0.5): boolean {
  if (actor.navigation.pending || actor.navigation.failed) return false;
  if (target) return distance(actor.position, target) <= tolerance;
  return actor.navigation.arrived;
}

export function stopWalking(actor: Actor, mode: ActorMode = "waiting"): void {
  actor.velocity.x = 0;
  actor.velocity.z = 0;
  actor.desiredVelocity.x = 0;
  actor.desiredVelocity.z = 0;
  actor.speed = 0;
  actor.mode = mode;
}

export function changePhase(task: ActorTask, phase: string, context: LifeContext, duration = 0): void {
  if (task.phase === phase) return;
  task.phase = phase;
  task.changedAt = context.time.seconds;
  task.until = context.time.seconds + duration;
  task.progress = 0;
}

export function phaseProgress(task: ActorTask, context: LifeContext): number {
  const duration = task.until - task.changedAt;
  task.progress = duration > 0 ? clamp((context.time.seconds - task.changedAt) / duration, 0, 1) : 1;
  return task.progress;
}

export function phaseFinished(task: ActorTask, context: LifeContext): boolean {
  return context.time.seconds >= task.until;
}

export function taskVenue(actor: Actor, context: LifeContext): LifePlace | undefined {
  return actor.task ? context.places.get(actor.task.venueId) : undefined;
}

export function reserve(actor: Actor, place: LifePlace, feature: PlaceFeature, context: LifeContext, duration = 60, priority = 0): DestinationReservation | undefined {
  const reservation = context.reservations.claim(actor.id, place.id, feature, context.time.seconds, duration, actor.position, priority, actor.mobility !== "ordinary");
  if (reservation && actor.task) actor.task.reservationId = reservation.id;
  return reservation;
}

export function releaseReservation(actor: Actor, context: LifeContext): void {
  if (!actor.task || actor.task.reservationId < 0) return;
  context.reservations.release(actor.task.reservationId);
  actor.task.reservationId = -1;
}

export function useReservation(actor: Actor, reservation: DestinationReservation, context: LifeContext, mode: ActorMode = "waiting"): boolean {
  if (!arrived(actor, reservation.position, 0.35)) {
    goTo(actor, reservation.position, context, 2);
    return false;
  }
  context.reservations.arrive(reservation.id, actor.id, context.time.seconds);
  actor.targetHeading = reservation.heading;
  stopWalking(actor, mode);
  return true;
}

export function enterInterior(actor: Actor, place: LifePlace, context: LifeContext): boolean {
  if (!context.passages.mayEnter(actor, place, context)) return false;
  if (!context.places.enter(place.id, actor.id)) return false;
  actor.interiorId = place.id;
  actor.mode = "inside";
  actor.visible = false;
  actor.navigation.points.length = 0;
  actor.navigation.nodePath.length = 0;
  actor.navigation.edgePath.length = 0;
  actor.navigation.pending = false;
  actor.navigation.arrived = true;
  context.routes.cancel(actor.id);
  context.crossings.releaseActor(actor.id);
  stopWalking(actor, "inside");
  return true;
}

export function leaveInterior(actor: Actor, context: LifeContext): void {
  if (!actor.interiorId) return;
  const place = context.places.get(actor.interiorId);
  context.places.leave(actor.interiorId, actor.id);
  actor.interiorId = "";
  actor.visible = true;
  actor.mode = "idle";
  if (place) {
    const lateral = (actor.id % 3 - 1) * 0.42;
    actor.position.x = place.entrance.x + lateral;
    actor.position.z = place.entrance.z + 0.45;
    actor.previousPosition.x = actor.position.x;
    actor.previousPosition.z = actor.position.z;
    actor.targetHeading = place.heading;
    context.passages.exit(actor, place, context.time.seconds);
  }
}

export function item(actor: Actor, kind: ItemKind): InventoryItem | undefined {
  return actor.inventory.find((candidate) => candidate.kind === kind && candidate.quantity > 0);
}

export function addItem(actor: Actor, kind: ItemKind, context: LifeContext, quantity = 1, attachment: PropAttachment = "right-hand", color?: string): InventoryItem | undefined {
  const existing = item(actor, kind);
  if (existing && kind !== "parcel") {
    existing.quantity += quantity;
    existing.condition = 1;
    return existing;
  }
  if (actor.inventory.length >= 6) return undefined;
  const prop = context.props.ensureOwned(actor, kind, context.time.seconds, attachment, color);
  const perishable = kind === "meal" || kind === "grocery" || kind === "cup";
  const created: InventoryItem = {
    id: inventorySequence++,
    kind,
    quantity,
    weight: kind === "grocery" ? 2.4 : kind === "parcel" ? 1.8 : kind === "book" ? 0.45 : 0.25,
    condition: 1,
    owner: actor.id,
    acquiredAt: context.time.seconds,
    perishAt: perishable ? context.time.seconds + 400 : Infinity,
    propId: prop?.id ?? -1,
  };
  actor.inventory.push(created);
  return created;
}

export function consumeItem(actor: Actor, kind: ItemKind, context: LifeContext, amount = 1): boolean {
  const carried = item(actor, kind);
  if (!carried) return false;
  carried.quantity = Math.max(0, carried.quantity - amount);
  if (carried.quantity === 0) removeItem(actor, carried.id, context);
  return true;
}

export function removeItem(actor: Actor, id: number, context: LifeContext): void {
  const index = actor.inventory.findIndex((candidate) => candidate.id === id);
  if (index < 0) return;
  const removed = actor.inventory.splice(index, 1)[0];
  if (removed.propId >= 0) context.props.remove(removed.propId);
}

export function transferItem(from: Actor, to: Actor, kind: ItemKind, context: LifeContext, hand: PropAttachment = "right-hand"): boolean {
  const carried = item(from, kind);
  if (!carried || to.inventory.length >= 6) return false;
  const index = from.inventory.indexOf(carried);
  from.inventory.splice(index, 1);
  carried.owner = to.id;
  to.inventory.push(carried);
  if (carried.propId >= 0) context.props.transfer(carried.propId, to, hand);
  return true;
}

export function pay(actor: Actor, amount: number): boolean {
  if (!Number.isFinite(amount) || amount < 0 || actor.budget < amount) return false;
  actor.budget -= amount;
  actor.dailySpending += amount;
  return true;
}

export function hasFreeHand(actor: Actor): boolean {
  const held = actor.inventory.filter((carried) => !["phone", "book"].includes(carried.kind)).length;
  return held < 2;
}

export function carryingWeight(actor: Actor): number {
  let total = 0;
  for (const carried of actor.inventory) total += carried.quantity * carried.weight;
  return total;
}

export function remember(actor: Actor, kind: string, placeId: string, context: LifeContext, valence: number, otherActor = -1, eventId = -1): void {
  const previous = actor.memories.find((memory) => memory.kind === kind && memory.placeId === placeId && memory.actorId === otherActor);
  if (previous && context.time.seconds - previous.time < 15) {
    previous.time = context.time.seconds;
    previous.valence = clamp((previous.valence + valence) * 0.5, -1, 1);
    previous.confidence = Math.min(1, previous.confidence + 0.1);
    return;
  }
  actor.memories.push({
    eventId,
    kind,
    actorId: otherActor,
    placeId,
    time: context.time.seconds,
    valence,
    confidence: 1,
  });
  if (actor.memories.length > 18) actor.memories.splice(0, actor.memories.length - 18);
}

export function rememberedPreference(actor: Actor, placeId: string): number {
  let sum = 0;
  let weight = 0;
  for (const memory of actor.memories) {
    if (memory.placeId !== placeId) continue;
    sum += memory.valence * memory.confidence;
    weight += memory.confidence;
  }
  return weight > 0 ? sum / weight : 0;
}

export function usefulPartner(actor: Actor, candidate: Actor): boolean {
  if (actor.id === candidate.id || !candidate.visible || candidate.vehicleId >= 0 || candidate.interiorId) return false;
  if (candidate.task && candidate.task.priority >= 6) return false;
  return candidate.mode !== "boarding" && candidate.mode !== "assisting" && candidate.conversationId < 0;
}

export function markEmotion(actor: Actor, emotion: Actor["gesture"]["emotion"], amount: number): void {
  actor.gesture.emotion = emotion;
  if (emotion === "happy") actor.needs.stress = clamp(actor.needs.stress - amount, 0, 1);
  if (emotion === "concerned") actor.needs.stress = clamp(actor.needs.stress + amount, 0, 1);
  if (emotion === "tired") actor.needs.energy = clamp(actor.needs.energy - amount, 0, 1);
}

export function taskTimedOut(actor: Actor, context: LifeContext, maximum = 180): boolean {
  const task = actor.task;
  if (!task) return false;
  if (task.deadline > 0 && context.time.seconds > task.deadline) return true;
  return context.time.seconds - task.startedAt > maximum;
}

export function failTask(actor: Actor, context: LifeContext, reason: string): void {
  if (actor.task) remember(actor, reason, actor.task.venueId, context, -0.25);
  actor.serviceCooldown = context.time.seconds + 5;
  actor.needs.stress = clamp(actor.needs.stress + 0.04, 0, 1);
  context.completeTask(actor, false);
}

export function finishSatisfied(actor: Actor, context: LifeContext, kind: string, satisfaction = 0.2): void {
  if (actor.task) remember(actor, kind, actor.task.venueId, context, satisfaction);
  actor.needs.stress = clamp(actor.needs.stress - satisfaction * 0.15, 0, 1);
  actor.gesture.emotion = "happy";
  context.completeTask(actor, true);
}

export function requestAlternative(actor: Actor, kinds: Parameters<LifeContext["places"]["find"]>[1], taskKind: TaskKind, context: LifeContext): boolean {
  const currentId = actor.task?.venueId;
  const place = context.places.find(actor, kinds, context.time, (candidate) => candidate.id !== currentId);
  if (!place) return false;
  const priority = actor.task?.priority ?? 1;
  context.completeTask(actor, false);
  return context.issueTask(actor, taskKind, place.id, priority);
}

export function propAtHand(actor: Actor, kind: PropKind, context: LifeContext, left = false): void {
  context.props.ensureOwned(actor, kind, context.time.seconds, left ? "left-hand" : "right-hand");
}

export function clearTransientProps(actor: Actor, context: LifeContext): void {
  const retained = new Set(actor.inventory.map((carried) => carried.propId));
  for (const prop of [...context.props.all]) {
    if (prop.ownerId !== actor.id || retained.has(prop.id)) continue;
    if (prop.kind === "umbrella" || prop.kind === "cane" || prop.kind === "briefcase") continue;
    context.props.remove(prop.id);
  }
}

export function worldHand(actor: Actor, left = false): Point3 {
  const source = left ? actor.pose.leftHand : actor.pose.rightHand;
  const scale = actor.appearance.height / 1.76;
  const sin = Math.sin(actor.heading);
  const cos = Math.cos(actor.heading);
  return point3(
    actor.position.x + (source.x * cos + source.z * sin) * scale,
    actor.groundY + source.y * scale,
    actor.position.z + (source.z * cos - source.x * sin) * scale,
  );
}

export function inventoryReset(): void {
  inventorySequence = 1;
}
