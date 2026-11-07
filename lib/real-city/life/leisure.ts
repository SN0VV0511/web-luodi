import { clamp, distance, localPoint, point, type Point2 } from "./math";
import { addItem, arrived, changePhase, facePoint, failTask, finishSatisfied, goTo, item, phaseFinished, phaseProgress, releaseReservation, reserve, setGesture, stopWalking, useReservation } from "./actions";
import type { Actor, ActorTask, GestureKind, LifeAnimal, LifeContext, LifeSystem, TaskKind } from "./types";
import type { LifePlace } from "./places";

interface LeisureSession {
  actorId: number;
  taskId: number;
  eventId: number;
  destination: Point2;
  waypoints: Point2[];
  cursor: number;
  propIds: number[];
  animalId: number;
  repetitions: number;
  lastAction: number;
  exposure: number;
  rhythm: number;
  originalSpeed: number;
  started: number;
}

const LEISURE_KINDS = new Set<TaskKind>(["walk", "jog", "exercise", "dog", "photo", "music", "reading", "chess", "picnic", "idle"]);

export class NeighborhoodLeisure implements LifeSystem {
  private readonly sessions = new Map<number, LeisureSession>();
  private nextAnimal = 1;
  private readonly target = point();

  reset(context: LifeContext): void {
    this.sessions.clear();
    context.animals.length = 0;
    this.nextAnimal = 1;
    this.seedBirds(context);
  }

  tick(context: LifeContext): void {
    for (const actor of context.actors) {
      if (!actor.task || !LEISURE_KINDS.has(actor.task.kind)) continue;
      if (actor.task.option === "gathering-participant") continue;
      if (actor.task.option.startsWith("sports-")) continue;
      if (actor.task.option === "household-walk") continue;
      if (actor.task.option === "searching-property") continue;
      if (actor.task.option === "public-disposal") continue;
      this.activity(actor, actor.task, context);
    }
    this.animateDogs(context);
    this.animateBirds(context);
  }

  private session(actor: Actor, context: LifeContext): LeisureSession {
    let session = this.sessions.get(actor.id);
    if (session?.taskId === actor.task!.id) return session;
    if (session) this.releaseActor(actor, context);
    session = {
      actorId: actor.id,
      taskId: actor.task!.id,
      eventId: -1,
      destination: { ...actor.task!.target },
      waypoints: [],
      cursor: 0,
      propIds: [],
      animalId: -1,
      repetitions: 0,
      lastAction: 0,
      exposure: 0,
      rhythm: actor.random.between(0.85, 1.2),
      originalSpeed: actor.baseSpeed,
      started: context.time.seconds,
    };
    this.sessions.set(actor.id, session);
    return session;
  }

  private activity(actor: Actor, task: ActorTask, context: LifeContext): void {
    const session = this.session(actor, context);
    const place = context.places.get(task.venueId);
    if (!place) {
      failTask(actor, context, "leisure-place-unavailable");
      return;
    }
    if (task.phase === "start") {
      this.prepare(actor, task, session, place, context);
      changePhase(task, "approach", context);
    }
    if (task.phase === "approach") {
      goTo(actor, session.destination, context);
      if (arrived(actor, session.destination, 0.6)) {
        if (task.kind === "walk" || task.kind === "jog" || task.kind === "dog") {
          this.planWalk(actor, session, place, context);
          changePhase(task, "route", context, task.kind === "jog" ? 80 : 58);
        } else {
          stopWalking(actor, this.seated(task.kind) ? "seated" : "performing");
          facePoint(actor, place.position);
          const duration = task.kind === "music" ? 65 : task.kind === "chess" ? 60 : task.kind === "photo" ? 24 : 40;
          changePhase(task, "enjoy", context, duration + actor.random.between(-5, 8));
        }
        this.publish(actor, task, session, context);
      }
      return;
    }
    if (task.phase === "route") {
      this.walkRoute(actor, task, session, context);
      return;
    }
    if (task.phase === "enjoy") {
      this.enjoy(actor, task, session, context);
      if (phaseFinished(task, context)) changePhase(task, "pack", context, 3);
      return;
    }
    if (task.phase === "pack") {
      setGesture(actor, "carry", context.time.seconds, 0.4);
      stopWalking(actor, "waiting");
      if (phaseFinished(task, context)) finishSatisfied(actor, context, `${task.kind}-enjoyed`, 0.35);
    }
  }

  private seated(kind: TaskKind): boolean {
    return kind === "reading" || kind === "chess" || kind === "picnic";
  }

  private prepare(actor: Actor, task: ActorTask, session: LeisureSession, place: LifePlace, context: LifeContext): void {
    session.destination = { ...place.entrance };
    if (this.seated(task.kind)) {
      const reservation = reserve(actor, place, task.kind === "chess" ? "table" : "seat", context, 110);
      if (reservation) session.destination = { ...reservation.position };
      else if (task.kind === "reading") {
        const bench = context.places.find(actor, ["bench"], context.time);
        if (bench) {
          const next = reserve(actor, bench, "seat", context, 110);
          if (next) session.destination = { ...next.position };
        }
      }
    }
    if (task.kind === "reading") addItem(actor, "book", context, 1, "left-hand", "#6d8076");
    if (task.kind === "photo") addItem(actor, "camera", context, 1, "right-hand", "#4d5756");
    if (task.kind === "music") addItem(actor, "guitar", context, 1, "front", "#9b7850");
    if (task.kind === "picnic") addItem(actor, "bag", context, 1, "right-hand", "#b89b76");
    if (task.kind === "jog") actor.baseSpeed = Math.max(actor.baseSpeed, 2.3);
    if (task.kind === "dog") this.attachDog(actor, session, context);
  }

  private planWalk(actor: Actor, session: LeisureSession, place: LifePlace, context: LifeContext): void {
    session.waypoints.length = 0;
    const candidates = context.network.nodes.filter((node) => node.surface === "park" || node.surface === "promenade");
    candidates.sort((a, b) => distance(a.position, place.entrance) - distance(b.position, place.entrance));
    for (const node of candidates) {
      if (session.waypoints.length >= 5) break;
      if (distance(node.position, place.entrance) < 5 || distance(node.position, place.entrance) > 70) continue;
      if (session.waypoints.some((candidate) => distance(candidate, node.position) < 12)) continue;
      if (!context.routes.isReachable(actor.position, node.position)) continue;
      session.waypoints.push({ ...node.position });
    }
    actor.random.shuffle(session.waypoints);
    if (session.waypoints.length === 0) session.waypoints.push({ ...place.entrance });
    session.cursor = 0;
  }

  private walkRoute(actor: Actor, task: ActorTask, session: LeisureSession, context: LifeContext): void {
    const destination = session.waypoints[session.cursor];
    if (!destination) {
      changePhase(task, "pack", context, 2);
      return;
    }
    goTo(actor, destination, context);
    if (task.kind === "jog") setGesture(actor, "jog", context.time.seconds);
    if (arrived(actor, destination, 0.7)) {
      session.cursor++;
      session.repetitions++;
      if (session.cursor >= session.waypoints.length) {
        if (context.time.seconds < task.until && session.repetitions < 8) {
          session.waypoints.reverse();
          session.cursor = 0;
        } else {
          stopWalking(actor, "resting");
          changePhase(task, "pack", context, 3);
        }
      }
    }
    const progress = phaseProgress(task, context);
    actor.needs.energy = clamp(actor.needs.energy - context.time.dt * (task.kind === "jog" ? 0.0018 : 0.0004), 0, 1);
    actor.needs.comfort = clamp(actor.needs.comfort + context.time.dt * 0.0015 * context.weather.outdoorComfort, 0, 1);
    actor.needs.curiosity = clamp(actor.needs.curiosity - context.time.dt * 0.002, 0, 1);
    context.events.update(session.eventId, actor.position, progress, context.time.seconds, "walking");
    if (phaseFinished(task, context)) changePhase(task, "pack", context, 3);
  }

  private enjoy(actor: Actor, task: ActorTask, session: LeisureSession, context: LifeContext): void {
    const reservation = context.reservations.get(task.reservationId);
    if (reservation) useReservation(actor, reservation, context, this.seated(task.kind) ? "seated" : "performing");
    const progress = phaseProgress(task, context);
    const elapsed = context.time.seconds - task.changedAt;
    if (task.kind === "exercise") this.exercise(actor, session, elapsed, context);
    else if (task.kind === "photo") this.photograph(actor, session, elapsed, context);
    else if (task.kind === "music") this.music(actor, session, elapsed, context);
    else if (task.kind === "reading") this.read(actor, session, elapsed, context);
    else if (task.kind === "chess") this.chess(actor, session, elapsed, context);
    else if (task.kind === "picnic") this.picnic(actor, session, elapsed, context);
    else setGesture(actor, "watch", context.time.seconds, 0.3);
    actor.needs.stress = clamp(actor.needs.stress - context.time.dt * 0.0025, 0, 1);
    actor.needs.social = clamp(actor.needs.social - context.time.dt * (task.kind === "music" || task.kind === "chess" ? 0.003 : 0.0005), 0, 1);
    actor.needs.curiosity = clamp(actor.needs.curiosity - context.time.dt * 0.002, 0, 1);
    context.events.update(session.eventId, actor.position, progress, context.time.seconds, task.kind);
  }

  private exercise(actor: Actor, session: LeisureSession, elapsed: number, context: LifeContext): void {
    const phase = Math.floor(elapsed / 8) % 4;
    setGesture(actor, phase === 3 ? "neutral" : "stretch", context.time.seconds, phase === 2 ? 0.9 : 0.6);
    actor.mode = "performing";
    if (phase === 3) actor.needs.energy = clamp(actor.needs.energy + context.time.dt * 0.002, 0, 1);
    if (elapsed - session.lastAction >= 8) {
      session.lastAction = elapsed;
      session.repetitions++;
      actor.targetHeading += phase % 2 ? 0.15 : -0.15;
    }
  }

  private photograph(actor: Actor, session: LeisureSession, elapsed: number, context: LifeContext): void {
    const cycle = elapsed % 8;
    const gesture: GestureKind = cycle < 2 ? "point" : cycle < 5.5 ? "photo" : "type";
    setGesture(actor, gesture, context.time.seconds);
    if (cycle > 4 && cycle < 4.2 && elapsed - session.lastAction > 4) {
      session.exposure += 1;
      session.lastAction = elapsed;
      const camera = item(actor, "camera");
      const prop = camera ? context.props.get(camera.propId) : undefined;
      if (prop) prop.progress = session.exposure;
    }
    if (cycle < 0.2) actor.targetHeading += (session.exposure % 2 ? 1 : -1) * 0.2;
  }

  private music(actor: Actor, session: LeisureSession, elapsed: number, context: LifeContext): void {
    setGesture(actor, "guitar", context.time.seconds, session.rhythm);
    if (session.propIds.length === 0) {
      localPoint(actor.position, actor.heading, 0, 0.75, this.target);
      const caseProp = context.props.create("basket", this.target, context.time.seconds, { serviceId: actor.task!.id, color: "#72583c", scale: 0.7 });
      if (caseProp) session.propIds.push(caseProp.id);
    }
    actor.mode = "performing";
    if (elapsed - session.lastAction > 12) {
      session.lastAction = elapsed;
      session.repetitions++;
    }
  }

  private read(actor: Actor, session: LeisureSession, elapsed: number, context: LifeContext): void {
    setGesture(actor, "read", context.time.seconds);
    const book = item(actor, "book");
    const prop = book ? context.props.get(book.propId) : undefined;
    if (prop) {
      prop.state = "reading";
      prop.progress = (elapsed % 8) / 8;
    }
    actor.mode = "seated";
    actor.needs.energy = clamp(actor.needs.energy + context.time.dt * 0.0015, 0, 1);
    if (elapsed - session.lastAction > 8) {
      session.lastAction = elapsed;
      session.repetitions++;
    }
  }

  private chess(actor: Actor, session: LeisureSession, elapsed: number, context: LifeContext): void {
    if (session.propIds.length === 0) {
      localPoint(actor.position, actor.heading, 0, 0.65, this.target);
      const table = context.props.create("table", this.target, context.time.seconds, { serviceId: actor.task!.id, color: "#8b7860" });
      const board = context.props.create("chessboard", this.target, context.time.seconds, { serviceId: actor.task!.id, y: 1.27, color: "#8c7458" });
      if (table) session.propIds.push(table.id);
      if (board) session.propIds.push(board.id);
    }
    setGesture(actor, elapsed % 9 < 2 ? "point" : "listen", context.time.seconds, 0.5);
    actor.mode = "seated";
    if (elapsed - session.lastAction > 9) {
      session.lastAction = elapsed;
      session.repetitions++;
      for (const id of session.propIds) {
        const prop = context.props.get(id);
        if (prop?.kind === "chessboard") prop.progress = session.repetitions;
      }
    }
  }

  private picnic(actor: Actor, session: LeisureSession, elapsed: number, context: LifeContext): void {
    if (session.propIds.length === 0) {
      localPoint(actor.position, actor.heading, 0, 0.75, this.target);
      const blanket = context.props.create("blanket", this.target, context.time.seconds, { serviceId: actor.task!.id, color: "#9d805f", accent: "#d4c5a7" });
      const basket = context.props.create("basket", this.target, context.time.seconds, { serviceId: actor.task!.id, y: 0.66, color: "#9c835c" });
      if (blanket) session.propIds.push(blanket.id);
      if (basket) session.propIds.push(basket.id);
      addItem(actor, "meal", context, 1, "left-hand");
    }
    setGesture(actor, elapsed % 10 < 6 ? "eat" : "talk", context.time.seconds);
    actor.mode = "seated";
    actor.needs.hunger = clamp(actor.needs.hunger - context.time.dt * 0.006, 0, 1);
    actor.needs.comfort = clamp(actor.needs.comfort + context.time.dt * 0.002, 0, 1);
  }

  private publish(actor: Actor, task: ActorTask, session: LeisureSession, context: LifeContext): void {
    const title = this.title(task.kind);
    const detail = this.detail(task.kind);
    session.eventId = context.events.publish(`leisure-${task.id}`, "leisure", title, detail, actor.position, context.time.seconds, task.until - context.time.seconds, [actor.id], task.kind === "walk" ? 0 : 1);
  }

  private title(kind: TaskKind): { zh: string; en: string } {
    if (kind === "jog") return { zh: "沿步道慢跑", en: "Jogging along the path" };
    if (kind === "exercise") return { zh: "公园晨练与舒展", en: "A slow exercise routine" };
    if (kind === "dog") return { zh: "居民带狗散步", en: "Walking a neighborhood dog" };
    if (kind === "photo") return { zh: "拍下海湾风景", en: "Photographing the harbor" };
    if (kind === "music") return { zh: "街头吉他演奏", en: "Guitar on the promenade" };
    if (kind === "reading") return { zh: "长椅上翻阅一本书", en: "Reading on a park bench" };
    if (kind === "chess") return { zh: "棋盘旁的闲暇时光", en: "A quiet game of chess" };
    if (kind === "picnic") return { zh: "公园里享用野餐", en: "A picnic in the park" };
    return { zh: "街坊沿绿道散步", en: "A walk through the neighborhood" };
  }

  private detail(kind: TaskKind): { zh: string; en: string } {
    if (kind === "dog") return { zh: "狗在牵绳范围内嗅闻和跟随，主人放慢脚步等候。", en: "The dog sniffs within reach of its leash while the owner adjusts their pace." };
    if (kind === "photo") return { zh: "摄影者选择取景方向、举起相机、拍摄后查看照片。", en: "The photographer selects a view, raises the camera and checks each exposure." };
    if (kind === "music") return { zh: "乐手拨弦演奏，附近居民可以停下来聆听。", en: "The musician strums while nearby residents can pause to listen." };
    if (kind === "reading") return { zh: "居民先找到空座，再坐下阅读、翻页并休息。", en: "A reader reserves a free seat, opens a book and turns the pages." };
    if (kind === "chess") return { zh: "居民坐在棋盘前思考，轮流落子后收好棋具。", en: "Residents consider their moves and pack the pieces after the game." };
    if (kind === "picnic") return { zh: "铺开野餐垫、取出食物，在结束后收好物品。", en: "A blanket and food are unpacked, enjoyed and collected afterwards." };
    return { zh: "居民沿真实步道行走，在人多和过街处放慢脚步。", en: "Residents use the connected paths and slow around crowds and crossings." };
  }

  private attachDog(actor: Actor, session: LeisureSession, context: LifeContext): void {
    if (context.animals.filter((animal) => animal.kind === "dog").length >= 8) return;
    const id = this.nextAnimal++;
    const animal: LifeAnimal = {
      id,
      kind: "dog",
      ownerId: actor.id,
      position: { x: actor.position.x - 0.6, z: actor.position.z },
      previousPosition: { x: actor.position.x - 0.6, z: actor.position.z },
      velocity: point(),
      heading: actor.heading,
      height: 0,
      scale: actor.random.between(0.65, 0.95),
      gaitPhase: 0,
      tailPhase: 0,
      state: "following",
      stateUntil: context.time.seconds + 12,
      target: { ...actor.position },
      color: actor.random.choice(["#a68459", "#7c705a", "#c2b08b"]),
      visible: true,
    };
    context.animals.push(animal);
    session.animalId = id;
  }

  private animateDogs(context: LifeContext): void {
    for (const animal of context.animals) {
      if (animal.kind !== "dog") continue;
      const owner = context.actorById.get(animal.ownerId);
      animal.visible = !!owner?.visible;
      if (!owner || !animal.visible) continue;
      animal.previousPosition.x = animal.position.x;
      animal.previousPosition.z = animal.position.z;
      if (context.time.seconds > animal.stateUntil) {
        animal.state = animal.state === "following" && owner.speed < 0.5 ? "sniffing" : "following";
        animal.stateUntil = context.time.seconds + (animal.state === "sniffing" ? 3 : 9 + animal.id % 5);
      }
      localPoint(owner.position, owner.heading, -0.65, 0.25, animal.target);
      const separation = distance(animal.position, owner.position);
      if (animal.state === "sniffing" && separation < 1.2) {
        animal.velocity.x = Math.sin(context.time.seconds * 2) * 0.025;
        animal.velocity.z = Math.cos(context.time.seconds * 2) * 0.025;
      } else {
        const dx = animal.target.x - animal.position.x;
        const dz = animal.target.z - animal.position.z;
        const length = Math.max(0.01, Math.hypot(dx, dz));
        const speed = Math.min(owner.baseSpeed * 1.5, length * 2.8);
        animal.velocity.x = dx / length * speed;
        animal.velocity.z = dz / length * speed;
        animal.position.x += animal.velocity.x * context.time.dt;
        animal.position.z += animal.velocity.z * context.time.dt;
        if (speed > 0.05) animal.heading = Math.atan2(animal.velocity.x, animal.velocity.z);
      }
      if (separation > 1.8) {
        const ratio = 1.8 / separation;
        animal.position.x = owner.position.x + (animal.position.x - owner.position.x) * ratio;
        animal.position.z = owner.position.z + (animal.position.z - owner.position.z) * ratio;
      }
      animal.gaitPhase += Math.hypot(animal.velocity.x, animal.velocity.z) * context.time.dt * 9;
      animal.tailPhase += context.time.dt * 7;
    }
  }

  private seedBirds(context: LifeContext): void {
    const parks = context.places.ofKind("park");
    for (let index = 0; index < Math.min(12, parks.length * 3); index++) {
      const place = parks[index % parks.length];
      const position = { x: place.entrance.x + (index % 3 - 1) * 0.7, z: place.entrance.z + Math.floor(index / 3) * 0.3 };
      context.animals.push({
        id: this.nextAnimal++,
        kind: "bird",
        ownerId: -1,
        position,
        previousPosition: { ...position },
        velocity: point(),
        heading: index,
        height: 0,
        scale: 0.9 + index % 3 * 0.08,
        gaitPhase: index,
        tailPhase: 0,
        state: "pecking",
        stateUntil: context.time.seconds + 5 + index,
        target: { ...position },
        color: index % 2 ? "#737c78" : "#8c8b79",
        visible: true,
      });
    }
  }

  private animateBirds(context: LifeContext): void {
    for (const bird of context.animals) {
      if (bird.kind !== "bird") continue;
      bird.previousPosition.x = bird.position.x;
      bird.previousPosition.z = bird.position.z;
      const frightened = context.actors.some((actor) => actor.visible && actor.speed > 1 && distance(actor.position, bird.position) < 1.4);
      if (frightened && bird.state !== "flying") {
        bird.state = "flying";
        bird.stateUntil = context.time.seconds + 4;
        bird.target.x = bird.position.x + Math.sin(bird.id * 2.3) * 6;
        bird.target.z = bird.position.z + Math.cos(bird.id * 2.3) * 6;
      }
      if (bird.state === "flying") {
        const remaining = Math.max(0.2, bird.stateUntil - context.time.seconds);
        bird.position.x += (bird.target.x - bird.position.x) / remaining * context.time.dt;
        bird.position.z += (bird.target.z - bird.position.z) / remaining * context.time.dt;
        bird.height = Math.sin(clamp((4 - remaining) / 4, 0, 1) * Math.PI) * 2.2;
        bird.heading = Math.atan2(bird.target.x - bird.position.x, bird.target.z - bird.position.z);
        bird.gaitPhase += context.time.dt * 17;
      } else {
        bird.gaitPhase += context.time.dt * 2;
        bird.height = Math.max(0, Math.sin(bird.gaitPhase)) * 0.025;
      }
      if (context.time.seconds >= bird.stateUntil) {
        bird.state = "pecking";
        bird.height = 0;
        bird.stateUntil = context.time.seconds + 7 + bird.id % 9;
      }
    }
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const session = this.sessions.get(actor.id);
    if (!session) return;
    actor.baseSpeed = session.originalSpeed;
    for (const id of session.propIds) context.props.remove(id);
    context.events.finish(session.eventId, context.time.seconds);
    const animalIndex = context.animals.findIndex((animal) => animal.id === session.animalId);
    if (animalIndex >= 0) context.animals.splice(animalIndex, 1);
    releaseReservation(actor, context);
    this.sessions.delete(actor.id);
  }
}
