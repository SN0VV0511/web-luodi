import { angleDelta, clamp, distance, point, projectOnSegment, timeToCollision, type Point2 } from "./math";
import { lookAtActor, setGesture } from "./actions";
import type { Actor, LifeContext } from "./types";

interface PassingAgreement {
  id: string;
  first: number;
  second: number;
  yielding: number;
  proceeding: number;
  createdAt: number;
  until: number;
  releasedAt: number;
  kind: "head-on" | "crossing" | "overtake" | "door" | "mobility";
  firstLane: number;
  secondLane: number;
  progress: number;
  thanked: boolean;
}

interface CourtesyState {
  actorId: number;
  personalSpace: number;
  desiredSpace: number;
  impatience: number;
  lastYield: number;
  lastThanks: number;
  yieldedSeconds: number;
  routeVersion: number;
  originalLane: number;
  temporaryLane: number;
  laneUntil: number;
  lastBlockedAt: number;
  blockedDuration: number;
  frustration: number;
}

export class PedestrianCourtesy {
  private readonly agreements = new Map<string, PassingAgreement>();
  private readonly states = new Map<number, CourtesyState>();
  private readonly actorAgreement = new Map<number, string>();
  private readonly neighbors: Actor[] = [];
  private readonly relativePosition = point();
  private readonly relativeVelocity = point();
  private readonly projection = point();
  private nextNegotiation = 0;

  reset(): void {
    this.agreements.clear();
    this.states.clear();
    this.actorAgreement.clear();
    this.nextNegotiation = 0;
  }

  tick(context: LifeContext): void {
    for (const actor of context.actors) {
      if (!actor.visible || actor.vehicleId >= 0) continue;
      const state = this.state(actor);
      this.personalSpace(actor, state, context);
      this.restoreLane(actor, state, context);
      this.blockedState(actor, state, context);
    }
    if (context.time.seconds >= this.nextNegotiation) {
      this.nextNegotiation = context.time.seconds + 0.4;
      this.negotiate(context);
    }
    for (const agreement of [...this.agreements.values()]) this.advance(agreement, context);
    this.queueRespect(context);
    this.stationaryGroups(context);
  }

  private state(actor: Actor): CourtesyState {
    let state = this.states.get(actor.id);
    if (state) return state;
    state = {
      actorId: actor.id,
      personalSpace: 0.65,
      desiredSpace: 0.65,
      impatience: 0,
      lastYield: -20,
      lastThanks: -20,
      yieldedSeconds: 0,
      routeVersion: actor.navigation.version,
      originalLane: actor.navigation.lane,
      temporaryLane: actor.navigation.lane,
      laneUntil: 0,
      lastBlockedAt: 0,
      blockedDuration: 0,
      frustration: 0,
    };
    this.states.set(actor.id, state);
    return state;
  }

  private personalSpace(actor: Actor, state: CourtesyState, context: LifeContext): void {
    const caution = actor.personality.caution;
    const umbrella = actor.umbrellaOpen > 0.5 ? 0.35 : 0;
    const mobility = actor.mobility === "stroller" ? 0.3 : actor.mobility === "cane" ? 0.16 : 0;
    const carried = actor.inventory.some((entry) => entry.kind === "parcel" || entry.kind === "grocery") ? 0.1 : 0;
    state.desiredSpace = 0.5 + caution * 0.25 + umbrella + mobility + carried;
    state.personalSpace += (state.desiredSpace - state.personalSpace) * context.time.dt * 2;
    state.impatience = clamp((1 - actor.personality.patience) * actor.needs.urgency + state.blockedDuration * 0.005, 0, 1);
    if (actor.needs.stress < 0.3) state.frustration = Math.max(0, state.frustration - context.time.dt * 0.01);
  }

  private negotiate(context: LifeContext): void {
    const start = context.time.tick % Math.max(1, context.actors.length);
    for (let offset = 0; offset < Math.min(32, context.actors.length); offset++) {
      const actor = context.actors[(start + offset) % context.actors.length];
      if (!this.moving(actor) || this.actorAgreement.has(actor.id)) continue;
      context.neighbors.query(actor.position, 3.4, this.neighbors, actor.id);
      for (const other of this.neighbors) {
        if (actor.id > other.id || !this.moving(other) || this.actorAgreement.has(other.id)) continue;
        if (actor.groupId >= 0 && actor.groupId === other.groupId) continue;
        const kind = this.conflictKind(actor, other, context);
        if (!kind) continue;
        this.agree(actor, other, kind, context);
        break;
      }
    }
  }

  private moving(actor: Actor): boolean {
    return actor.visible && actor.vehicleId < 0 && actor.mode === "walking" && !actor.navigation.pending && !actor.navigation.arrived && actor.navigation.crossingId < 0;
  }

  private conflictKind(actor: Actor, other: Actor, context: LifeContext): PassingAgreement["kind"] | null {
    const separation = distance(actor.position, other.position);
    if (separation < 0.1 || separation > 3.4) return null;
    const direction = Math.cos(angleDelta(actor.heading, other.heading));
    const required = this.state(actor).personalSpace + this.state(other).personalSpace;
    this.relativePosition.x = other.position.x - actor.position.x;
    this.relativePosition.z = other.position.z - actor.position.z;
    this.relativeVelocity.x = other.velocity.x - actor.velocity.x;
    this.relativeVelocity.z = other.velocity.z - actor.velocity.z;
    const collision = timeToCollision(this.relativePosition, this.relativeVelocity, required);
    if (!Number.isFinite(collision) || collision > 3) return null;
    const actorForward = this.relativePosition.x * Math.sin(actor.heading) + this.relativePosition.z * Math.cos(actor.heading);
    if (actorForward < -0.4 && direction > 0) return null;
    if (actor.mobility !== "ordinary" || other.mobility !== "ordinary") return "mobility";
    if (actor.task?.venueId === other.task?.venueId && actor.navigation.distanceRemaining < 3 && other.navigation.distanceRemaining < 3) return "door";
    if (direction < -0.7) return "head-on";
    if (direction > 0.8 && Math.abs(actor.speed - other.speed) > 0.3) return "overtake";
    const currentEdge = actor.navigation.edgePath[Math.max(0, actor.navigation.cursor - 1)];
    const edge = context.network.edges[currentEdge];
    if (edge?.width && edge.width > 4 && separation > 1.8) return null;
    return "crossing";
  }

  private priority(actor: Actor, context: LifeContext): number {
    let score = actor.needs.urgency * 3 + (actor.task?.priority ?? 0) * 0.25;
    if (actor.age === "elder") score += 1.4;
    if (actor.age === "child") score += 1.2;
    if (actor.mobility === "cane") score += 1.6;
    if (actor.mobility === "stroller") score += 1.3;
    if (actor.occupation === "medic" && actor.task?.priority === 7) score += 4;
    const state = this.state(actor);
    if (context.time.seconds - state.lastYield < 3) score += 0.8;
    score += state.yieldedSeconds * 0.05;
    return score + actor.id * 0.0001;
  }

  private agree(first: Actor, second: Actor, kind: PassingAgreement["kind"], context: LifeContext): void {
    const firstPriority = this.priority(first, context);
    const secondPriority = this.priority(second, context);
    const yielding = firstPriority < secondPriority ? first : second;
    const proceeding = yielding.id === first.id ? second : first;
    const id = `${Math.min(first.id, second.id)}:${Math.max(first.id, second.id)}`;
    const agreement: PassingAgreement = {
      id,
      first: first.id,
      second: second.id,
      yielding: yielding.id,
      proceeding: proceeding.id,
      createdAt: context.time.seconds,
      until: context.time.seconds + (kind === "overtake" ? 3.5 : 2.4),
      releasedAt: 0,
      kind,
      firstLane: first.navigation.lane,
      secondLane: second.navigation.lane,
      progress: 0,
      thanked: false,
    };
    this.agreements.set(id, agreement);
    this.actorAgreement.set(first.id, id);
    this.actorAgreement.set(second.id, id);
    const yieldingState = this.state(yielding);
    yieldingState.lastYield = context.time.seconds;
    if (kind === "head-on") {
      this.lane(first, 1, agreement.until, context);
      this.lane(second, 1, agreement.until, context);
    } else if (kind === "overtake") {
      const faster = first.speed > second.speed ? first : second;
      this.lane(faster, -1, agreement.until, context);
    } else {
      yielding.navigation.yieldUntil = Math.max(yielding.navigation.yieldUntil, context.time.seconds + 0.8);
      this.lane(yielding, 1, agreement.until, context);
    }
    lookAtActor(yielding, proceeding, context, 1.4);
    if (yielding.speed < 0.4 && yielding.gesture.kind === "neutral") setGesture(yielding, "point", context.time.seconds, 0.25);
  }

  private lane(actor: Actor, lane: number, until: number, context: LifeContext): void {
    const state = this.state(actor);
    if (state.laneUntil <= context.time.seconds) state.originalLane = actor.navigation.lane;
    state.temporaryLane = lane;
    state.laneUntil = until;
    state.routeVersion = actor.navigation.version;
    actor.navigation.lane = lane;
  }

  private restoreLane(actor: Actor, state: CourtesyState, context: LifeContext): void {
    if (state.laneUntil <= 0 || context.time.seconds < state.laneUntil) return;
    if (actor.navigation.lane === state.temporaryLane) actor.navigation.lane = state.originalLane;
    state.laneUntil = 0;
  }

  private advance(agreement: PassingAgreement, context: LifeContext): void {
    const first = context.actorById.get(agreement.first);
    const second = context.actorById.get(agreement.second);
    if (!first || !second || !first.visible || !second.visible) {
      this.finish(agreement);
      return;
    }
    const separation = distance(first.position, second.position);
    agreement.progress = clamp((context.time.seconds - agreement.createdAt) / Math.max(0.1, agreement.until - agreement.createdAt), 0, 1);
    const yielding = context.actorById.get(agreement.yielding)!;
    const proceeding = context.actorById.get(agreement.proceeding)!;
    if (yielding.navigation.yieldUntil > context.time.seconds) this.state(yielding).yieldedSeconds += context.time.dt;
    if (separation > 2.4 && agreement.progress > 0.2) {
      if (!agreement.thanked) this.thank(proceeding, yielding, agreement, context);
      this.finish(agreement);
      return;
    }
    if (context.time.seconds >= agreement.until) {
      if (separation < first.radius + second.radius + 0.2) {
        yielding.navigation.repathAfter = context.time.seconds;
        yielding.navigation.detourCount = Math.min(5, yielding.navigation.detourCount + 1);
      }
      this.finish(agreement);
    }
  }

  private thank(actor: Actor, helper: Actor, agreement: PassingAgreement, context: LifeContext): void {
    agreement.thanked = true;
    const state = this.state(actor);
    if (context.time.seconds - state.lastThanks < 12) return;
    if (!actor.random.probability(actor.personality.generosity * 0.5)) return;
    state.lastThanks = context.time.seconds;
    actor.gesture.emotion = "happy";
    lookAtActor(actor, helper, context, 0.8);
    helper.needs.stress = Math.max(0, helper.needs.stress - 0.005);
    const relationship = helper.relationships.get(actor.id);
    if (relationship) relationship.affinity = Math.min(1, relationship.affinity + 0.005);
  }

  private blockedState(actor: Actor, state: CourtesyState, context: LifeContext): void {
    const expectedMovement = actor.mode === "walking" && !actor.navigation.pending && !actor.navigation.arrived;
    if (expectedMovement && actor.speed < 0.05 && actor.navigation.yieldUntil <= context.time.seconds) {
      if (state.lastBlockedAt === 0) state.lastBlockedAt = context.time.seconds;
      state.blockedDuration = context.time.seconds - state.lastBlockedAt;
      state.frustration = clamp(state.frustration + context.time.dt * 0.005 * (1 - actor.personality.patience), 0, 1);
    } else {
      state.lastBlockedAt = 0;
      state.blockedDuration = 0;
      state.frustration = Math.max(0, state.frustration - context.time.dt * 0.02);
    }
    if (state.blockedDuration > 8 && actor.navigation.repathAfter < context.time.seconds && actor.navigation.crossingId < 0) {
      context.routes.request(actor, actor.navigation.finalTarget, context.time.seconds, 3);
      actor.navigation.repathAfter = context.time.seconds + 8;
      state.lastBlockedAt = context.time.seconds;
    }
  }

  private queueRespect(context: LifeContext): void {
    for (const actor of context.actors) {
      if (!this.moving(actor) || actor.navigation.distanceRemaining < 2) continue;
      context.neighbors.query(actor.position, 2.1, this.neighbors, actor.id);
      for (const queued of this.neighbors) {
        if (queued.mode !== "queuing" || actor.groupId >= 0 && actor.groupId === queued.groupId) continue;
        const target = actor.navigation.points[actor.navigation.cursor];
        if (!target) continue;
        projectOnSegment(queued.position, actor.position, target, this.projection);
        if (distance(queued.position, this.projection) > actor.radius + queued.radius + 0.2) continue;
        const side = (queued.position.x - actor.position.x) * Math.cos(actor.heading) - (queued.position.z - actor.position.z) * Math.sin(actor.heading);
        this.lane(actor, side > 0 ? -1 : 1, context.time.seconds + 1.2, context);
        if (distance(actor.position, queued.position) < 0.9) actor.navigation.yieldUntil = Math.max(actor.navigation.yieldUntil, context.time.seconds + 0.25);
        break;
      }
    }
  }

  private stationaryGroups(context: LifeContext): void {
    if (context.time.tick % 4 !== 0) return;
    const groups = new Map<number, Actor[]>();
    for (const actor of context.actors) {
      if (!actor.visible || actor.groupId < 0 || actor.speed > 0.1) continue;
      const group = groups.get(actor.groupId) ?? [];
      group.push(actor);
      groups.set(actor.groupId, group);
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const center = point();
      for (const member of members) {
        center.x += member.position.x;
        center.z += member.position.z;
      }
      center.x /= members.length;
      center.z /= members.length;
      const radius = Math.max(...members.map((member) => distance(member.position, center))) + 0.55;
      context.neighbors.query(center, radius + 2, this.neighbors);
      for (const passer of this.neighbors) {
        if (!this.moving(passer) || members.some((member) => member.id === passer.id)) continue;
        const target = passer.navigation.points[passer.navigation.cursor];
        if (!target) continue;
        projectOnSegment(center, passer.position, target, this.projection);
        if (distance(center, this.projection) < radius) {
          const side = (center.x - passer.position.x) * Math.cos(passer.heading) - (center.z - passer.position.z) * Math.sin(passer.heading);
          this.lane(passer, side > 0 ? -1 : 1, context.time.seconds + 1.4, context);
        }
      }
    }
  }

  private finish(agreement: PassingAgreement): void {
    this.agreements.delete(agreement.id);
    this.actorAgreement.delete(agreement.first);
    this.actorAgreement.delete(agreement.second);
  }
}
