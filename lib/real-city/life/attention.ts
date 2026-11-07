import { angleDelta, clamp, damping, distance, point, type Point2 } from "./math";
import { lookAtActor, setGesture } from "./actions";
import type { Actor, LifeContext, LifeVehicle } from "./types";

interface AttentionCue {
  kind: "person" | "vehicle" | "activity" | "destination" | "weather" | "object";
  id: number;
  position: Point2;
  salience: number;
  urgency: number;
  expiresAt: number;
}

interface AttentionState {
  actorId: number;
  targetKind: AttentionCue["kind"] | "none";
  targetId: number;
  targetPosition: Point2;
  targetScore: number;
  targetUntil: number;
  nextScan: number;
  nextBlink: number;
  blinkStart: number;
  blinkDuration: number;
  nextMicroSaccade: number;
  eyeOffset: number;
  habituation: Map<string, number>;
  seenActors: Map<number, number>;
  seenEvents: Map<number, number>;
  lastVehicleReaction: number;
  lastGreeting: number;
  pupilEffort: number;
  arousal: number;
  smile: number;
  brow: number;
  lipPhase: number;
}

export class ResidentAttention {
  private readonly states = new Map<number, AttentionState>();
  private readonly cues: AttentionCue[] = [];
  private readonly neighbors: Actor[] = [];
  private readonly vehicles: LifeVehicle[] = [];
  private readonly target = point();

  reset(): void {
    this.states.clear();
  }

  tick(context: LifeContext): void {
    for (const actor of context.actors) {
      if (!actor.visible || actor.vehicleId >= 0) continue;
      const state = this.state(actor, context);
      if (context.time.seconds >= state.nextScan) {
        state.nextScan = context.time.seconds + 0.35 + actor.id % 5 * 0.07;
        this.scan(actor, state, context);
      }
      this.holdAttention(actor, state, context);
      this.blink(actor, state, context);
      this.expression(actor, state, context);
      this.microSaccade(actor, state, context);
      this.decay(state, context);
    }
  }

  private state(actor: Actor, context: LifeContext): AttentionState {
    let state = this.states.get(actor.id);
    if (state) return state;
    state = {
      actorId: actor.id,
      targetKind: "none",
      targetId: -1,
      targetPosition: { ...actor.position },
      targetScore: 0,
      targetUntil: 0,
      nextScan: context.time.seconds + actor.id * 0.01,
      nextBlink: context.time.seconds + 1 + actor.random.next() * 4,
      blinkStart: -1,
      blinkDuration: 0.16,
      nextMicroSaccade: 0,
      eyeOffset: 0,
      habituation: new Map(),
      seenActors: new Map(),
      seenEvents: new Map(),
      lastVehicleReaction: -20,
      lastGreeting: -20,
      pupilEffort: 0,
      arousal: 0.2,
      smile: 0,
      brow: 0,
      lipPhase: actor.id,
    };
    this.states.set(actor.id, state);
    return state;
  }

  private scan(actor: Actor, state: AttentionState, context: LifeContext): void {
    this.cues.length = 0;
    this.personCues(actor, state, context);
    this.vehicleCues(actor, state, context);
    this.activityCues(actor, state, context);
    this.navigationCue(actor, context);
    this.objectCues(actor, context);
    this.weatherCue(actor, context);
    let selected: AttentionCue | undefined;
    let best = 0.12;
    for (const cue of this.cues) {
      const score = this.scoreCue(actor, state, cue, context);
      if (score > best) {
        selected = cue;
        best = score;
      }
    }
    if (!selected) return;
    const currentStillInteresting = state.targetUntil > context.time.seconds && best < state.targetScore * 1.35;
    if (currentStillInteresting && selected.urgency < 0.8) return;
    state.targetKind = selected.kind;
    state.targetId = selected.id;
    state.targetPosition.x = selected.position.x;
    state.targetPosition.z = selected.position.z;
    state.targetScore = best;
    state.targetUntil = Math.min(selected.expiresAt, context.time.seconds + 0.7 + Math.min(2, best));
    state.habituation.set(`${selected.kind}:${selected.id}`, (state.habituation.get(`${selected.kind}:${selected.id}`) ?? 0) + 0.18);
    if (selected.kind === "vehicle" && selected.urgency > 0.7) this.reactToVehicle(actor, state, context);
    if (selected.kind === "person") this.acknowledge(actor, selected.id, state, context);
  }

  private personCues(actor: Actor, state: AttentionState, context: LifeContext): void {
    context.neighbors.query(actor.position, 10, this.neighbors, actor.id);
    for (const neighbor of this.neighbors) {
      const separation = distance(actor.position, neighbor.position);
      if (separation < 0.1 || !this.visible(actor, neighbor.position, context)) continue;
      const relationship = actor.relationships.get(neighbor.id);
      const novelty = state.seenActors.has(neighbor.id) ? 0.1 : 0.35;
      const familiar = relationship?.familiarity ?? 0;
      const speaking = neighbor.mode === "talking" || neighbor.gesture.kind === "wave";
      const partner = actor.task?.partnerId === neighbor.id || actor.conversationId >= 0 && actor.conversationId === neighbor.conversationId;
      const child = actor.dependentId === neighbor.id;
      this.cues.push({
        kind: "person",
        id: neighbor.id,
        position: neighbor.position,
        salience: (partner ? 1.7 : child ? 1.5 : novelty + familiar * 0.6 + (speaking ? 0.35 : 0)) / (1 + separation * 0.12),
        urgency: child && separation > 5 ? 0.8 : partner ? 0.45 : 0,
        expiresAt: context.time.seconds + 3,
      });
      state.seenActors.set(neighbor.id, context.time.seconds);
    }
  }

  private vehicleCues(actor: Actor, state: AttentionState, context: LifeContext): void {
    context.neighbors.queryVehicles(actor.position, 20, this.vehicles);
    for (const vehicle of this.vehicles) {
      const separation = distance(actor.position, vehicle.position);
      const towardX = actor.position.x - vehicle.position.x;
      const towardZ = actor.position.z - vehicle.position.z;
      const approaching = towardX * vehicle.velocity.x + towardZ * vehicle.velocity.z > 0;
      const emergency = vehicle.emergency && vehicle.siren;
      if (!approaching && !emergency && separation > 7) continue;
      this.cues.push({
        kind: "vehicle",
        id: vehicle.id,
        position: vehicle.position,
        salience: emergency ? 2.6 : approaching ? 1.4 / (1 + separation * 0.1) : 0.35,
        urgency: emergency ? 0.95 : approaching && separation < 8 ? 0.85 : 0.2,
        expiresAt: context.time.seconds + 1.5,
      });
    }
    for (let index = 0; index < context.trafficObstacles.length; index++) {
      const vehicle = context.trafficObstacles[index];
      const separation = Math.hypot(actor.position.x - vehicle.x, actor.position.z - vehicle.z);
      if (separation > 13 || (vehicle.speed ?? 0) < 0.2) continue;
      const heading = vehicle.heading ?? 0;
      const forward = (actor.position.x - vehicle.x) * Math.sin(heading) + (actor.position.z - vehicle.z) * Math.cos(heading);
      if (forward < 0) continue;
      this.cues.push({
        kind: "vehicle",
        id: 1000 + index,
        position: vehicle,
        salience: 1.6 / (1 + separation * 0.15),
        urgency: separation < vehicle.radius + 3 ? 0.9 : 0.3,
        expiresAt: context.time.seconds + 1,
      });
    }
    if (context.time.seconds - state.lastVehicleReaction < 1) state.arousal = Math.max(state.arousal, 0.6);
  }

  private activityCues(actor: Actor, state: AttentionState, context: LifeContext): void {
    for (const event of context.events.at(actor.position, 16)) {
      if (event.finished || event.participants.includes(actor.id)) continue;
      if (!this.visible(actor, event.position, context)) continue;
      const seen = state.seenEvents.get(event.id);
      const novelty = seen === undefined ? 0.8 : Math.max(0.15, 0.5 - (context.time.seconds - seen) * 0.01);
      const performance = event.category === "leisure" || event.category === "social";
      const urgency = event.category === "assistance" ? 0.6 : event.category === "maintenance" ? 0.35 : 0;
      this.cues.push({
        kind: "activity",
        id: event.id,
        position: event.position,
        salience: novelty * actor.personality.curiosity + (performance ? 0.35 : 0.1),
        urgency,
        expiresAt: context.time.seconds + 2.5,
      });
      state.seenEvents.set(event.id, context.time.seconds);
    }
  }

  private navigationCue(actor: Actor, context: LifeContext): void {
    if (actor.mode !== "walking" || actor.navigation.points.length === 0) return;
    const cursor = Math.min(actor.navigation.points.length - 1, actor.navigation.cursor + 1);
    const target = actor.navigation.points[cursor];
    const turning = Math.abs(angleDelta(actor.heading, Math.atan2(target.x - actor.position.x, target.z - actor.position.z)));
    this.cues.push({
      kind: "destination",
      id: actor.navigation.requestId,
      position: target,
      salience: 0.4 + turning * 0.4 + actor.needs.urgency * 0.5,
      urgency: actor.navigation.crossingId >= 0 ? 0.7 : 0.15,
      expiresAt: context.time.seconds + 1.2,
    });
  }

  private objectCues(actor: Actor, context: LifeContext): void {
    if (actor.mode === "walking" && actor.speed > 1.3) return;
    let found = 0;
    for (const prop of context.props.all) {
      if (!prop.visible || prop.ownerId >= 0 || prop.kind === "cone" || prop.kind === "barrier") continue;
      const separation = distance(actor.position, prop.position);
      if (separation > 4 || separation < 0.2) continue;
      if (!this.visible(actor, prop.position, context)) continue;
      const interesting = prop.kind === "flowers" || prop.kind === "canvas" || prop.kind === "book" || prop.kind === "bicycle";
      if (!interesting) continue;
      this.cues.push({
        kind: "object",
        id: prop.id,
        position: prop.position,
        salience: actor.personality.curiosity * 0.45,
        urgency: 0,
        expiresAt: context.time.seconds + 2,
      });
      if (++found >= 4) break;
    }
  }

  private weatherCue(actor: Actor, context: LifeContext): void {
    if (context.weather.gust < 0.7 && actor.wetness < 0.3) return;
    this.target.x = actor.position.x + context.weather.windX * 0.3;
    this.target.z = actor.position.z + context.weather.windZ * 0.3;
    this.cues.push({
      kind: "weather",
      id: context.time.day,
      position: { ...this.target },
      salience: context.weather.gust * 0.25 + actor.wetness * 0.3,
      urgency: 0.05,
      expiresAt: context.time.seconds + 0.7,
    });
  }

  private scoreCue(actor: Actor, state: AttentionState, cue: AttentionCue, context: LifeContext): number {
    if (cue.expiresAt <= context.time.seconds) return 0;
    const direction = Math.atan2(cue.position.x - actor.position.x, cue.position.z - actor.position.z);
    const relative = Math.abs(angleDelta(actor.heading, direction));
    const forward = relative < 0.85 ? 1 : relative < 1.8 ? 0.65 : 0.15;
    const habituation = state.habituation.get(`${cue.kind}:${cue.id}`) ?? 0;
    const same = cue.kind === state.targetKind && cue.id === state.targetId;
    const stability = same ? 0.15 : 0;
    const taskFocus = actor.mode === "working" || actor.mode === "eating" ? 0.5 : 1;
    return Math.max(0, cue.salience * forward * taskFocus + cue.urgency * 1.6 + stability - habituation * 0.2);
  }

  private visible(actor: Actor, target: Point2, context: LifeContext): boolean {
    if (distance(actor.position, target) > 20 * Math.max(0.35, context.weather.visibility)) return false;
    return context.network.walkableSegment(actor.position, target, 0.03);
  }

  private holdAttention(actor: Actor, state: AttentionState, context: LifeContext): void {
    if (state.targetUntil <= context.time.seconds) {
      state.targetScore *= 0.96;
      state.targetKind = "none";
      return;
    }
    if (actor.conversationId >= 0 && state.targetKind !== "vehicle") return;
    if (actor.gesture.hasTarget && state.targetKind !== "vehicle") return;
    let target = state.targetPosition;
    if (state.targetKind === "person") {
      const person = context.actorById.get(state.targetId);
      if (person?.visible) target = person.position;
    } else if (state.targetKind === "vehicle") {
      const vehicle = context.vehicles.find((candidate) => candidate.id === state.targetId);
      if (vehicle) target = vehicle.position;
    }
    actor.gesture.gazePoint.x = target.x;
    actor.gesture.gazePoint.z = target.z;
    actor.gesture.gazeId = state.targetKind === "person" ? state.targetId : -1;
    actor.gesture.gazeUntil = state.targetUntil;
  }

  private reactToVehicle(actor: Actor, state: AttentionState, context: LifeContext): void {
    if (context.time.seconds - state.lastVehicleReaction < 4) return;
    state.lastVehicleReaction = context.time.seconds;
    state.arousal = Math.min(1, state.arousal + 0.35);
    actor.needs.stress = Math.min(1, actor.needs.stress + 0.015);
    if (actor.navigation.crossingId < 0 && actor.mode === "waiting") setGesture(actor, "listen", context.time.seconds, 0.7);
  }

  private acknowledge(actor: Actor, id: number, state: AttentionState, context: LifeContext): void {
    const other = context.actorById.get(id);
    if (!other || context.time.seconds - state.lastGreeting < 20) return;
    const relationship = actor.relationships.get(id);
    if (!relationship || relationship.familiarity < 0.4 || distance(actor.position, other.position) > 4) return;
    if (actor.conversationId >= 0 || actor.task && actor.task.priority >= 5) return;
    if (!actor.random.probability(actor.personality.sociability * 0.35)) return;
    state.lastGreeting = context.time.seconds;
    state.smile = Math.max(state.smile, 0.6);
    if (actor.mode === "walking" && actor.speed < 1.5) setGesture(actor, "wave", context.time.seconds, 0.4, 1.2);
    lookAtActor(actor, other, context, 1.4);
  }

  private blink(actor: Actor, state: AttentionState, context: LifeContext): void {
    if (context.time.seconds >= state.nextBlink && state.blinkStart < 0) {
      state.blinkStart = context.time.seconds;
      state.blinkDuration = 0.13 + (1 - actor.needs.energy) * 0.1;
    }
    if (state.blinkStart >= 0) {
      const progress = (context.time.seconds - state.blinkStart) / state.blinkDuration;
      actor.pose.eyeBlink = progress < 1 ? Math.sin(progress * Math.PI) : 0;
      if (progress >= 1) {
        state.blinkStart = -1;
        const discomfort = context.weather.gust + actor.wetness;
        state.nextBlink = context.time.seconds + Math.max(0.8, actor.random.between(2.4, 6) - discomfort);
      }
    } else actor.pose.eyeBlink = 0;
  }

  private expression(actor: Actor, state: AttentionState, context: LifeContext): void {
    let smile = 0;
    let brow = 0;
    if (actor.gesture.emotion === "happy") smile = 0.65;
    if (actor.gesture.emotion === "concerned") brow = 0.45;
    if (actor.gesture.emotion === "focused") brow = -0.2;
    if (actor.gesture.emotion === "tired") brow = -0.15;
    if (actor.conversationId >= 0) smile += 0.15;
    if (state.targetKind === "activity") brow += actor.personality.curiosity * 0.2;
    if (state.arousal > 0.6) brow += 0.3;
    state.smile = damping(state.smile, clamp(smile, 0, 1), 3.5, context.time.dt);
    state.brow = damping(state.brow, clamp(brow, -0.5, 1), 4, context.time.dt);
    actor.pose.smile = state.smile;
    actor.pose.browLift = state.brow;
    const talking = actor.gesture.kind === "talk" || actor.gesture.kind === "phone" || actor.gesture.kind === "point" && actor.mode === "talking";
    state.lipPhase += context.time.dt * (6.5 + actor.id % 3);
    const syllable = Math.max(0, Math.sin(state.lipPhase)) * Math.max(0.1, Math.cos(state.lipPhase * 0.63));
    actor.pose.mouthOpen = damping(actor.pose.mouthOpen, talking ? syllable * 0.7 : 0, 14, context.time.dt);
    state.arousal = damping(state.arousal, actor.needs.stress * 0.5 + actor.needs.urgency * 0.2, 0.7, context.time.dt);
  }

  private microSaccade(actor: Actor, state: AttentionState, context: LifeContext): void {
    if (context.time.seconds >= state.nextMicroSaccade) {
      state.nextMicroSaccade = context.time.seconds + actor.random.between(0.4, 1.2);
      state.eyeOffset = actor.random.between(-0.012, 0.012);
    }
    const fixation = actor.gesture.kind === "read" || actor.gesture.kind === "photo" ? 0.35 : 1;
    actor.pose.headYaw += state.eyeOffset * fixation;
    state.pupilEffort = damping(state.pupilEffort, state.targetKind === "object" ? 0.8 : 0.2, 2, context.time.dt);
  }

  private decay(state: AttentionState, context: LifeContext): void {
    if (context.time.tick % 60 !== state.actorId % 60) return;
    for (const [key, value] of state.habituation) {
      const next = value * 0.8;
      if (next < 0.01) state.habituation.delete(key);
      else state.habituation.set(key, next);
    }
    for (const [id, time] of state.seenActors) if (context.time.seconds - time > 120) state.seenActors.delete(id);
    for (const [id, time] of state.seenEvents) if (context.time.seconds - time > 80) state.seenEvents.delete(id);
  }
}
