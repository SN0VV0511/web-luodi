import { clamp, distance, localPoint, point, point3, type Point2, type Point3 } from "./math";
import { arrived, changePhase, facePoint, finishSatisfied, goTo, lookAtActor, remember, setGesture, stopWalking, worldHand } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem } from "./types";
import type { LifeProp } from "./props-state";

interface BallPlayer {
  actorId: number;
  position: Point2;
  role: "thrower" | "receiver";
  ready: boolean;
  catches: number;
  throws: number;
  misses: number;
  fatigue: number;
  originalPace: number;
  lastMove: number;
  targetHand: Point3;
}

interface BallSession {
  id: number;
  placeId: string;
  players: BallPlayer[];
  ballId: number;
  eventId: number;
  mode: "bounce" | "chest" | "underarm";
  phase: "gather" | "warmup" | "hold" | "windup" | "flight" | "retrieve" | "cooldown";
  phaseUntil: number;
  startedAt: number;
  endsAt: number;
  throwerId: number;
  receiverId: number;
  lastBounce: number;
  bounceCount: number;
  cycle: number;
  predictedCatch: Point3;
  lastBallY: number;
  lastBallVelocity: number;
  maximumDistance: number;
}

interface FitnessSession {
  actorId: number;
  taskId: number;
  origin: Point2;
  target: Point2;
  phase: "warmup" | "outbound" | "turn" | "return" | "recover";
  phaseUntil: number;
  repetition: number;
  total: number;
  originalPace: number;
  eventId: number;
  heartRate: number;
  effort: number;
}

export class NeighborhoodSports implements LifeSystem {
  private readonly sessions = new Map<number, BallSession>();
  private readonly actorSessions = new Map<number, number>();
  private readonly fitness = new Map<number, FitnessSession>();
  private readonly candidates: Actor[] = [];
  private nextId = 1;
  private releasing = new Set<number>();
  private readonly target = point();

  reset(context: LifeContext): void {
    for (const session of this.sessions.values()) context.props.remove(session.ballId);
    this.sessions.clear();
    this.actorSessions.clear();
    this.fitness.clear();
    this.nextId = 1;
    this.releasing.clear();
  }

  tick(context: LifeContext): void {
    this.discover(context);
    for (const session of [...this.sessions.values()]) this.ballTick(session, context);
    for (const [actorId, session] of [...this.fitness]) {
      const actor = context.actorById.get(actorId);
      if (actor?.task?.id === session.taskId) this.fitnessTick(actor, actor.task, session, context);
      else this.finishFitness(actorId, context);
    }
  }

  private discover(context: LifeContext): void {
    for (const actor of context.actors) {
      const task = actor.task;
      if (!task || task.kind !== "exercise" || task.phase !== "start" || task.option.startsWith("sports-")) continue;
      if (actor.age !== "adult" || actor.needs.energy < 0.5 || context.weather.outdoorComfort < 0.6) continue;
      if (this.actorSessions.has(actor.id) || this.fitness.has(actor.id)) continue;
      if (actor.id % 3 === 0 && this.sessions.size < 3 && this.startBall(actor, context)) continue;
      if (actor.id % 3 === 1 && this.fitness.size < 4) this.startFitness(actor, context);
    }
  }

  private startBall(actor: Actor, context: LifeContext): boolean {
    const place = context.places.get(actor.task!.venueId);
    if (!place) return false;
    context.neighbors.query(actor.position, 14, this.candidates, actor.id);
    const partner = this.candidates.find((candidate) => this.canPlay(candidate, context));
    if (!partner) return false;
    const issued = partner.task ? context.interruptTask(partner, "exercise", place.id, 2) : context.issueTask(partner, "exercise", place.id, 2);
    if (!issued || !partner.task) return false;
    const id = this.nextId++;
    const heading = actor.heading;
    const center = place.entrance;
    const firstPosition = localPoint(center, heading, -1.9, 0.2, point());
    const secondPosition = localPoint(center, heading, 1.9, 0.2, point());
    if (!context.routes.isReachable(actor.position, firstPosition) || !context.routes.isReachable(partner.position, secondPosition)) {
      context.completeTask(partner, false);
      return false;
    }
    const ball = context.props.create("ball", center, context.time.seconds, {
      serviceId: id + 20000,
      color: "#b48652",
      accent: "#624c38",
      physical: false,
      restitution: 0.76,
      friction: 0.28,
      y: 0.7,
    });
    if (!ball) {
      context.completeTask(partner, false);
      return false;
    }
    const session: BallSession = {
      id,
      placeId: place.id,
      players: [this.player(actor, firstPosition, "thrower"), this.player(partner, secondPosition, "receiver")],
      ballId: ball.id,
      eventId: -1,
      mode: actor.id % 2 ? "chest" : "bounce",
      phase: "gather",
      phaseUntil: context.time.seconds + 20,
      startedAt: context.time.seconds,
      endsAt: context.time.seconds + 75,
      throwerId: actor.id,
      receiverId: partner.id,
      lastBounce: 0,
      bounceCount: 0,
      cycle: 0,
      predictedCatch: point3(),
      lastBallY: ball.position.y,
      lastBallVelocity: 0,
      maximumDistance: 6,
    };
    this.sessions.set(id, session);
    for (const player of session.players) {
      const person = context.actorById.get(player.actorId)!;
      person.task!.option = "sports-ball";
      person.task!.serviceId = id;
      person.task!.deadline = session.endsAt + 25;
      person.task!.phase = "sports-active";
      person.groupId = id + 20000;
      this.actorSessions.set(person.id, id);
    }
    context.props.attach(ball.id, actor.id, "right-hand");
    session.eventId = context.events.publish(`ball-session-${id}`, "leisure",
      { zh: "朋友在公园练习传接球", en: "Friends practice passing in the park" },
      { zh: "两人先拉开距离、热身，再轮流传球与接球；球会按重力飞行并落地反弹，失手后走去捡回。", en: "Friends take their positions, warm up and alternate passes and catches. The ball follows gravity, bounces on the ground and is retrieved after a missed catch." },
      center, context.time.seconds, 80, [actor.id, partner.id], 2);
    return true;
  }

  private canPlay(actor: Actor, context: LifeContext): boolean {
    if (!actor.visible || actor.vehicleId >= 0 || actor.conversationId >= 0 || actor.groupId >= 0) return false;
    if (actor.age !== "adult" || actor.needs.energy < 0.55 || actor.needs.hunger > 0.7) return false;
    if (actor.task && actor.task.priority >= 2) return false;
    if (this.actorSessions.has(actor.id) || this.fitness.has(actor.id)) return false;
    return actor.serviceCooldown <= context.time.seconds;
  }

  private player(actor: Actor, position: Point2, role: BallPlayer["role"]): BallPlayer {
    return {
      actorId: actor.id,
      position,
      role,
      ready: false,
      catches: 0,
      throws: 0,
      misses: 0,
      fatigue: 0,
      originalPace: actor.baseSpeed,
      lastMove: 0,
      targetHand: point3(),
    };
  }

  private ballTick(session: BallSession, context: LifeContext): void {
    const thrower = context.actorById.get(session.throwerId);
    const receiver = context.actorById.get(session.receiverId);
    const ball = context.props.get(session.ballId);
    if (!thrower?.task || !receiver?.task || !ball || thrower.task.option !== "sports-ball" || receiver.task.option !== "sports-ball") {
      this.finishBall(session, context);
      return;
    }
    if (context.time.seconds >= session.endsAt && session.phase !== "cooldown") {
      session.phase = "cooldown";
      session.phaseUntil = context.time.seconds + 4;
      ball.visible = false;
    }
    if (session.phase === "gather") {
      let ready = 0;
      for (const player of session.players) {
        const actor = context.actorById.get(player.actorId)!;
        goTo(actor, player.position, context, 2);
        player.ready = arrived(actor, player.position, 0.45);
        if (player.ready) {
          stopWalking(actor, "performing");
          ready++;
        }
      }
      if (ready === 2) {
        session.phase = "warmup";
        session.phaseUntil = context.time.seconds + 4;
      } else if (context.time.seconds > session.phaseUntil) this.finishBall(session, context);
      return;
    }
    facePoint(thrower, receiver.position);
    facePoint(receiver, thrower.position);
    lookAtActor(thrower, receiver, context, 2);
    lookAtActor(receiver, thrower, context, 2);
    if (session.phase === "warmup") {
      setGesture(thrower, "stretch", context.time.seconds, 0.5);
      setGesture(receiver, "stretch", context.time.seconds, 0.5);
      if (context.time.seconds >= session.phaseUntil) this.beginHold(session, thrower, ball, context);
    } else if (session.phase === "hold") {
      stopWalking(thrower, "performing");
      stopWalking(receiver, "performing");
      setGesture(thrower, "carry", context.time.seconds, 0.7);
      setGesture(receiver, "catch", context.time.seconds, 0.8);
      if (context.time.seconds >= session.phaseUntil) {
        session.phase = "windup";
        session.phaseUntil = context.time.seconds + 0.7;
        setGesture(thrower, "throw", context.time.seconds, 0.8);
      }
    } else if (session.phase === "windup") {
      if (context.time.seconds >= session.phaseUntil) this.releaseBall(session, thrower, receiver, ball, context);
    } else if (session.phase === "flight") {
      this.flight(session, thrower, receiver, ball, context);
    } else if (session.phase === "retrieve") {
      this.retrieve(session, receiver, ball, context);
    } else if (session.phase === "cooldown") {
      setGesture(thrower, "wave", context.time.seconds, 0.5);
      setGesture(receiver, "wave", context.time.seconds, 0.5);
      if (context.time.seconds >= session.phaseUntil) this.finishBall(session, context);
    }
    this.exertion(session, context);
    context.events.update(session.eventId, thrower.position, clamp((context.time.seconds - session.startedAt) / (session.endsAt - session.startedAt), 0, 1), context.time.seconds, session.phase);
    session.lastBallY = ball.position.y;
    session.lastBallVelocity = ball.velocity.y;
  }

  private beginHold(session: BallSession, thrower: Actor, ball: LifeProp, context: LifeContext): void {
    session.phase = "hold";
    session.phaseUntil = context.time.seconds + 1.4;
    ball.physical = false;
    ball.sleeping = false;
    ball.visible = true;
    context.props.attach(ball.id, thrower.id, "right-hand");
    ball.velocity.x = 0;
    ball.velocity.y = 0;
    ball.velocity.z = 0;
    session.bounceCount = 0;
    session.lastBallVelocity = 0;
  }

  private releaseBall(session: BallSession, thrower: Actor, receiver: Actor, ball: LifeProp, context: LifeContext): void {
    const start = worldHand(thrower);
    const receiveHand = worldHand(receiver);
    const target = {
      x: receiveHand.x + receiver.velocity.x * 0.2,
      y: receiver.groundY + 1.1 * receiver.appearance.height / 1.76,
      z: receiveHand.z + receiver.velocity.z * 0.2,
    };
    const range = Math.hypot(target.x - start.x, target.z - start.z);
    const duration = clamp(range / 5.2, 0.5, 1.15);
    context.props.detach(ball.id, start, true);
    if (session.mode === "bounce") {
      const ground = ball.groundY + 0.12;
      const bounceFraction = 0.6;
      const bounceTime = duration * bounceFraction;
      const vy = (ground - start.y + 0.5 * 9.80665 * bounceTime * bounceTime) / bounceTime;
      context.props.throw(ball.id, {
        x: (target.x - start.x) / duration,
        y: vy,
        z: (target.z - start.z) / duration,
      });
      session.phaseUntil = context.time.seconds + duration + 0.5;
    } else {
      context.props.throw(ball.id, {
        x: (target.x - start.x) / duration,
        y: (target.y - start.y + 0.5 * 9.80665 * duration * duration) / duration,
        z: (target.z - start.z) / duration,
      });
      session.phaseUntil = context.time.seconds + duration + 0.3;
    }
    session.phase = "flight";
    session.predictedCatch = target;
    const player = session.players.find((candidate) => candidate.actorId === thrower.id)!;
    player.throws++;
    setGesture(receiver, "catch", context.time.seconds, 0.9);
  }

  private flight(session: BallSession, thrower: Actor, receiver: Actor, ball: LifeProp, context: LifeContext): void {
    if (session.lastBallVelocity < -0.1 && ball.velocity.y > 0.1 && ball.position.y < ball.groundY + 0.25) {
      session.lastBounce = context.time.seconds;
      session.bounceCount++;
    }
    const hand = worldHand(receiver);
    const horizontal = distance(ball.position, receiver.position);
    const catchHeight = ball.position.y > receiver.groundY + 0.55 && ball.position.y < receiver.groundY + receiver.appearance.height;
    if (horizontal < 0.6 && catchHeight && (session.mode !== "bounce" || session.bounceCount > 0)) {
      this.catchBall(session, receiver, ball, context);
      return;
    }
    const intercept = this.predictIntercept(ball, receiver, context);
    if (intercept && distance(intercept, receiver.position) < 1.5) {
      const player = session.players.find((candidate) => candidate.actorId === receiver.id)!;
      if (context.time.seconds - player.lastMove > 0.4) {
        player.lastMove = context.time.seconds;
        goTo(receiver, intercept, context, 3);
        setGesture(receiver, "catch", context.time.seconds, 0.8);
      }
    }
    receiver.gesture.hasTarget = true;
    receiver.gesture.target.x = ball.position.x;
    receiver.gesture.target.y = clamp(ball.position.y, receiver.groundY + 0.7, receiver.groundY + receiver.appearance.height);
    receiver.gesture.target.z = ball.position.z;
    receiver.gesture.hand = "both";
    if (context.time.seconds > session.phaseUntil || distance(ball.position, thrower.position) > session.maximumDistance + 2 || ball.sleeping) {
      session.phase = "retrieve";
      session.phaseUntil = context.time.seconds + 15;
      const player = session.players.find((candidate) => candidate.actorId === receiver.id)!;
      player.misses++;
      receiver.gesture.hasTarget = false;
    }
    if (hand.y < receiver.groundY) receiver.gesture.hasTarget = false;
  }

  private predictIntercept(ball: LifeProp, actor: Actor, context: LifeContext): Point2 | null {
    const desiredHeight = actor.groundY + 1.0 * actor.appearance.height / 1.76;
    const a = -0.5 * 9.80665;
    const b = ball.velocity.y;
    const c = ball.position.y - desiredHeight;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const roots = [(-b + Math.sqrt(discriminant)) / (2 * a), (-b - Math.sqrt(discriminant)) / (2 * a)].filter((time) => time > 0 && time < 1.5);
    if (roots.length === 0) return null;
    const t = Math.min(...roots);
    const target = { x: ball.position.x + ball.velocity.x * t, z: ball.position.z + ball.velocity.z * t };
    const walk = distance(actor.position, target) / Math.max(0.5, actor.baseSpeed);
    if (walk > t + 0.4 || !context.network.walkableSegment(actor.position, target, actor.radius)) return null;
    return target;
  }

  private catchBall(session: BallSession, receiver: Actor, ball: LifeProp, context: LifeContext): void {
    receiver.gesture.hasTarget = false;
    const player = session.players.find((candidate) => candidate.actorId === receiver.id)!;
    player.catches++;
    receiver.gesture.emotion = "happy";
    session.cycle++;
    const formerThrower = session.throwerId;
    session.throwerId = receiver.id;
    session.receiverId = formerThrower;
    session.mode = session.cycle % 3 === 0 ? "bounce" : session.cycle % 3 === 1 ? "chest" : "underarm";
    for (const participant of session.players) participant.role = participant.actorId === receiver.id ? "thrower" : "receiver";
    this.beginHold(session, receiver, ball, context);
  }

  private retrieve(session: BallSession, receiver: Actor, ball: LifeProp, context: LifeContext): void {
    if (!context.network.walkableSegment(receiver.position, ball.position, receiver.radius)) {
      const nearest = context.network.nearest(ball.position, (node) => node.surface === "park" || node.surface === "promenade");
      if (nearest && distance(nearest.position, ball.position) < 2) {
        ball.position.x = nearest.position.x;
        ball.position.z = nearest.position.z;
        ball.velocity.x = 0;
        ball.velocity.z = 0;
      } else {
        this.finishBall(session, context);
        return;
      }
    }
    goTo(receiver, ball.position, context, 3);
    if (arrived(receiver, ball.position, 0.65)) {
      stopWalking(receiver, "performing");
      setGesture(receiver, "kneel", context.time.seconds, 0.6);
      if (ball.sleeping || Math.hypot(ball.velocity.x, ball.velocity.z) < 1) this.catchBall(session, receiver, ball, context);
    }
    if (context.time.seconds >= session.phaseUntil) this.finishBall(session, context);
  }

  private exertion(session: BallSession, context: LifeContext): void {
    for (const player of session.players) {
      const actor = context.actorById.get(player.actorId);
      if (!actor) continue;
      const active = session.phase !== "hold" && session.phase !== "cooldown";
      const exertion = active ? 0.0012 : -0.001;
      player.fatigue = clamp(player.fatigue + context.time.dt * exertion, 0, 1);
      actor.needs.energy = clamp(actor.needs.energy - context.time.dt * (active ? 0.0015 : 0.0002), 0, 1);
      actor.needs.thirst = clamp(actor.needs.thirst + context.time.dt * 0.0007, 0, 1);
      actor.needs.social = clamp(actor.needs.social - context.time.dt * 0.003, 0, 1);
      actor.needs.stress = clamp(actor.needs.stress - context.time.dt * 0.0015, 0, 1);
      if (actor.needs.energy < 0.25) session.endsAt = Math.min(session.endsAt, context.time.seconds + 3);
    }
  }

  private startFitness(actor: Actor, context: LifeContext): void {
    const place = context.places.get(actor.task!.venueId);
    if (!place) return;
    const origin = { ...place.entrance };
    const candidates = context.network.nodes.filter((node) => node.surface === "park" && distance(node.position, origin) > 5 && distance(node.position, origin) < 14);
    const target = candidates.find((node) => context.network.walkableSegment(origin, node.position, 0.5));
    if (!target) return;
    const session: FitnessSession = {
      actorId: actor.id,
      taskId: actor.task!.id,
      origin,
      target: { ...target.position },
      phase: "warmup",
      phaseUntil: context.time.seconds + 6,
      repetition: 0,
      total: actor.needs.energy > 0.8 ? 4 : 3,
      originalPace: actor.baseSpeed,
      eventId: -1,
      heartRate: 75,
      effort: 0,
    };
    actor.task!.option = "sports-fitness";
    actor.task!.phase = "sports-active";
    actor.task!.deadline = context.time.seconds + 180;
    this.fitness.set(actor.id, session);
    session.eventId = context.events.publish(`fitness-${actor.id}`, "leisure",
      { zh: "居民沿步道做往返跑练习", en: "A resident practices short shuttle runs" },
      { zh: "先舒展热身，再沿可通行的短路段往返，转弯减速，结束后缓步恢复。", en: "The resident warms up, runs a short connected route, slows before turning and walks to recover afterwards." },
      origin, context.time.seconds, 90, [actor.id], 1);
  }

  private fitnessTick(actor: Actor, task: ActorTask, session: FitnessSession, context: LifeContext): void {
    if (session.phase === "warmup") {
      goTo(actor, session.origin, context, 2);
      if (arrived(actor, session.origin, 0.5)) {
        stopWalking(actor, "performing");
        setGesture(actor, "stretch", context.time.seconds, 0.7);
        if (context.time.seconds > session.phaseUntil) {
          session.phase = "outbound";
          actor.baseSpeed = 2.25;
        }
      }
    } else if (session.phase === "outbound") {
      goTo(actor, session.target, context, 2);
      setGesture(actor, "jog", context.time.seconds, 0.8);
      if (arrived(actor, session.target, 0.55)) {
        session.phase = "turn";
        session.phaseUntil = context.time.seconds + 0.9;
        stopWalking(actor, "resting");
      }
    } else if (session.phase === "turn") {
      facePoint(actor, session.origin);
      if (context.time.seconds >= session.phaseUntil) session.phase = "return";
    } else if (session.phase === "return") {
      goTo(actor, session.origin, context, 2);
      setGesture(actor, "jog", context.time.seconds, 0.8);
      if (arrived(actor, session.origin, 0.55)) {
        session.repetition++;
        session.phase = "recover";
        session.phaseUntil = context.time.seconds + 4 + session.repetition;
        actor.baseSpeed = session.originalPace;
      }
    } else {
      stopWalking(actor, "resting");
      setGesture(actor, "stretch", context.time.seconds, 0.35);
      if (context.time.seconds >= session.phaseUntil) {
        if (session.repetition >= session.total || actor.needs.energy < 0.35) {
          finishSatisfied(actor, context, "fitness-completed", 0.4);
          return;
        }
        session.phase = "outbound";
        actor.baseSpeed = 2.25;
      }
    }
    const running = session.phase === "outbound" || session.phase === "return";
    const targetHeart = running ? 115 + actor.speed * 10 : 78;
    session.heartRate += (targetHeart - session.heartRate) * context.time.dt * 0.15;
    session.effort = clamp((session.heartRate - 75) / 90, 0, 1);
    actor.needs.energy = clamp(actor.needs.energy - context.time.dt * session.effort * 0.002, 0, 1);
    actor.needs.thirst = clamp(actor.needs.thirst + context.time.dt * session.effort * 0.0012, 0, 1);
    actor.needs.stress = clamp(actor.needs.stress - context.time.dt * 0.002, 0, 1);
    task.progress = session.repetition / session.total;
    context.events.update(session.eventId, actor.position, task.progress, context.time.seconds, session.phase);
  }

  private finishBall(session: BallSession, context: LifeContext): void {
    this.sessions.delete(session.id);
    context.props.remove(session.ballId);
    context.events.finish(session.eventId, context.time.seconds);
    for (const player of session.players) {
      const actor = context.actorById.get(player.actorId);
      this.actorSessions.delete(player.actorId);
      if (!actor) continue;
      actor.baseSpeed = player.originalPace;
      actor.groupId = -1;
      actor.gesture.hasTarget = false;
      actor.serviceCooldown = context.time.seconds + 12;
      remember(actor, "ball-practice", session.placeId, context, 0.25 + Math.min(0.25, player.catches * 0.025), session.players.find((other) => other.actorId !== actor.id)?.actorId ?? -1, session.eventId);
      if (!this.releasing.has(actor.id) && actor.task?.option === "sports-ball") {
        this.releasing.add(actor.id);
        context.completeTask(actor, true);
        this.releasing.delete(actor.id);
      }
    }
  }

  private finishFitness(actorId: number, context: LifeContext): void {
    const session = this.fitness.get(actorId);
    if (!session) return;
    const actor = context.actorById.get(actorId);
    if (actor) actor.baseSpeed = session.originalPace;
    context.events.finish(session.eventId, context.time.seconds);
    this.fitness.delete(actorId);
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    if (this.releasing.has(actor.id)) return;
    const session = this.sessions.get(this.actorSessions.get(actor.id) ?? -1);
    if (session) {
      this.releasing.add(actor.id);
      this.finishBall(session, context);
      this.releasing.delete(actor.id);
    }
    this.finishFitness(actor.id, context);
  }
}
