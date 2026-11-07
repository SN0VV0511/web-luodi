import { clamp, distance, localPoint, point, type Point2 } from "./math";
import { arrived, changePhase, facePoint, finishSatisfied, goTo, lookAtActor, remember, setGesture, stopWalking } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem, TaskKind } from "./types";

interface Participant {
  actorId: number;
  target: Point2;
  joinedAt: number;
  arrivedAt: number;
  leaveAt: number;
  reactionAt: number;
  role: "audience" | "subject" | "opponent" | "companion" | "exerciser";
  engagement: number;
  ready: boolean;
  rewarded: boolean;
}

interface Gathering {
  id: number;
  leaderId: number;
  leaderTask: number;
  kind: "music" | "photo" | "chess" | "picnic" | "exercise";
  placeId: string;
  center: Point2;
  heading: number;
  createdAt: number;
  lastInvitation: number;
  nextAction: number;
  turns: number;
  participants: Participant[];
  eventId: number;
  maximum: number;
  phase: "forming" | "active" | "closing";
  closingAt: number;
}

export class NeighborhoodParticipation implements LifeSystem {
  private readonly gatherings = new Map<number, Gathering>();
  private readonly leaderGatherings = new Map<number, number>();
  private readonly actorGatherings = new Map<number, number>();
  private readonly candidates: Actor[] = [];
  private nextId = 1;
  private nextScan = 2;
  private readonly target = point();
  private releasing = new Set<number>();

  reset(): void {
    this.gatherings.clear();
    this.leaderGatherings.clear();
    this.actorGatherings.clear();
    this.nextId = 1;
    this.nextScan = 2;
    this.releasing.clear();
  }

  tick(context: LifeContext): void {
    if (context.time.seconds >= this.nextScan) {
      this.nextScan = context.time.seconds + 2.5;
      this.findActivities(context);
    }
    for (const gathering of [...this.gatherings.values()]) this.gatheringTick(gathering, context);
    for (const actor of context.actors) {
      if (actor.task?.option === "gathering-participant") this.participantTick(actor, actor.task, context);
    }
  }

  private supported(kind: TaskKind): kind is Gathering["kind"] {
    return kind === "music" || kind === "photo" || kind === "chess" || kind === "picnic" || kind === "exercise";
  }

  private findActivities(context: LifeContext): void {
    if (this.gatherings.size >= 6) return;
    for (const actor of context.actors) {
      const task = actor.task;
      if (!task || !this.supported(task.kind) || task.phase !== "enjoy" || !actor.visible) continue;
      if (this.leaderGatherings.has(actor.id) || this.actorGatherings.has(actor.id)) continue;
      if (task.until - context.time.seconds < 10) continue;
      const gathering: Gathering = {
        id: this.nextId++,
        leaderId: actor.id,
        leaderTask: task.id,
        kind: task.kind,
        placeId: task.venueId,
        center: { ...actor.position },
        heading: actor.heading,
        createdAt: context.time.seconds,
        lastInvitation: -10,
        nextAction: context.time.seconds + 3,
        turns: 0,
        participants: [],
        eventId: -1,
        maximum: task.kind === "chess" ? 1 : task.kind === "photo" ? 3 : task.kind === "music" ? 5 : 3,
        phase: "forming",
        closingAt: 0,
      };
      this.gatherings.set(gathering.id, gathering);
      this.leaderGatherings.set(actor.id, gathering.id);
      this.invite(gathering, context);
      if (this.gatherings.size >= 6) break;
    }
  }

  private invite(gathering: Gathering, context: LifeContext): void {
    const leader = context.actorById.get(gathering.leaderId);
    if (!leader || gathering.participants.length >= gathering.maximum) return;
    gathering.lastInvitation = context.time.seconds;
    context.neighbors.query(gathering.center, gathering.kind === "music" ? 16 : 10, this.candidates, leader.id);
    this.candidates.sort((a, b) => this.interest(b, gathering, leader) - this.interest(a, gathering, leader));
    for (const actor of this.candidates) {
      if (!this.canJoin(actor, gathering, context)) continue;
      const interest = this.interest(actor, gathering, leader);
      if (interest < 0.3 || !actor.random.probability(Math.min(0.9, interest))) continue;
      const issued = actor.task
        ? context.interruptTask(actor, "idle", gathering.placeId, 2)
        : context.issueTask(actor, "idle", gathering.placeId, 2);
      if (!issued || !actor.task) continue;
      actor.task.option = "gathering-participant";
      actor.task.serviceId = gathering.id;
      actor.task.partnerId = leader.id;
      actor.task.deadline = leader.task?.until ? leader.task.until + 15 : context.time.seconds + 60;
      const role = gathering.kind === "music" ? "audience" : gathering.kind === "photo" ? "subject" : gathering.kind === "chess" ? "opponent" : gathering.kind === "exercise" ? "exerciser" : "companion";
      const participant: Participant = {
        actorId: actor.id,
        target: { ...actor.position },
        joinedAt: context.time.seconds,
        arrivedAt: 0,
        leaveAt: context.time.seconds + 20 + actor.personality.patience * 25,
        reactionAt: context.time.seconds + 3,
        role,
        engagement: interest,
        ready: false,
        rewarded: false,
      };
      gathering.participants.push(participant);
      this.actorGatherings.set(actor.id, gathering.id);
      actor.groupId = gathering.id + 10000;
      this.arrange(gathering, context);
      if (gathering.eventId >= 0) context.events.addParticipant(gathering.eventId, actor.id);
      if (gathering.participants.length >= gathering.maximum) break;
    }
  }

  private canJoin(actor: Actor, gathering: Gathering, context: LifeContext): boolean {
    if (!actor.visible || actor.interiorId || actor.vehicleId >= 0 || actor.conversationId >= 0) return false;
    if (this.actorGatherings.has(actor.id) || this.leaderGatherings.has(actor.id)) return false;
    if (actor.task && actor.task.priority >= 2) return false;
    if (actor.needs.urgency > 0.6 || actor.needs.hunger > 0.85 || actor.needs.energy < 0.2) return false;
    if (actor.navigation.crossingId >= 0) return false;
    if (actor.age === "child" && gathering.kind === "chess") return false;
    if (actor.serviceCooldown > context.time.seconds) return false;
    return context.routes.isReachable(actor.position, gathering.center);
  }

  private interest(actor: Actor, gathering: Gathering, leader: Actor): number {
    const relationship = actor.relationships.get(leader.id);
    const familiar = relationship?.affinity ?? 0.1;
    const distancePenalty = distance(actor.position, gathering.center) * 0.025;
    if (gathering.kind === "music") return actor.personality.curiosity * 0.6 + actor.needs.social * 0.35 + familiar * 0.2 - distancePenalty;
    if (gathering.kind === "photo") return familiar * 0.6 + actor.personality.sociability * 0.55 + (actor.occupation === "tourist" ? 0.4 : 0) - distancePenalty;
    if (gathering.kind === "chess") return (actor.age === "elder" ? 0.6 : 0.25) + actor.personality.patience * 0.45 + familiar * 0.2 - distancePenalty;
    if (gathering.kind === "exercise") return actor.needs.energy * 0.35 + actor.needs.stress * 0.4 + (actor.age === leader.age ? 0.25 : 0) - distancePenalty;
    return familiar * 0.5 + actor.needs.social * 0.45 + actor.needs.hunger * 0.2 - distancePenalty;
  }

  private arrange(gathering: Gathering, context: LifeContext): void {
    const count = gathering.participants.length;
    for (let index = 0; index < count; index++) {
      const participant = gathering.participants[index];
      if (gathering.kind === "music") {
        const angle = -0.7 + (count === 1 ? 0.7 : index / (count - 1) * 1.4);
        localPoint(gathering.center, gathering.heading, Math.sin(angle) * 2.4, Math.cos(angle) * 2.4, participant.target);
      } else if (gathering.kind === "photo") {
        localPoint(gathering.center, gathering.heading, (index - (count - 1) / 2) * 0.7, 3.2, participant.target);
      } else if (gathering.kind === "chess") {
        localPoint(gathering.center, gathering.heading, 0, 1.35, participant.target);
      } else if (gathering.kind === "picnic") {
        const angle = 1.1 + index * 1.4;
        localPoint(gathering.center, gathering.heading, Math.sin(angle) * 0.85, 0.8 + Math.cos(angle) * 0.65, participant.target);
      } else {
        localPoint(gathering.center, gathering.heading, (index + 1) * 1.5, index % 2 * 0.5, participant.target);
      }
      const nearest = context.network.nearest(participant.target, (node) => node.surface !== "crosswalk");
      if (nearest && !context.network.walkableSegment(gathering.center, participant.target, 0.2)) {
        participant.target.x = nearest.position.x;
        participant.target.z = nearest.position.z;
      }
    }
  }

  private gatheringTick(gathering: Gathering, context: LifeContext): void {
    const leader = context.actorById.get(gathering.leaderId);
    const task = leader?.task;
    if (!leader || !task || task.id !== gathering.leaderTask || task.phase === "pack") {
      this.close(gathering, context);
      return;
    }
    if (gathering.phase === "closing") {
      if (context.time.seconds >= gathering.closingAt) this.finish(gathering, context);
      return;
    }
    if (gathering.participants.length < gathering.maximum && context.time.seconds - gathering.lastInvitation > 6 && task.until - context.time.seconds > 10) this.invite(gathering, context);
    const ready = gathering.participants.filter((participant) => participant.ready);
    if (ready.length > 0 && gathering.phase === "forming") {
      gathering.phase = "active";
      gathering.eventId = context.events.publish(`gathering-${gathering.id}`, "social", this.title(gathering.kind), this.detail(gathering.kind), gathering.center, context.time.seconds, Math.max(5, task.until - context.time.seconds), [leader.id, ...ready.map((entry) => entry.actorId)], 2);
    }
    if (gathering.phase !== "active") return;
    if (context.time.seconds >= gathering.nextAction) {
      gathering.nextAction = context.time.seconds + (gathering.kind === "chess" ? 6 : gathering.kind === "photo" ? 7 : 4.5);
      gathering.turns++;
      this.sharedAction(gathering, leader, ready, context);
    }
    const progress = clamp((context.time.seconds - gathering.createdAt) / Math.max(5, task.until - gathering.createdAt), 0, 1);
    context.events.update(gathering.eventId, gathering.center, progress, context.time.seconds, gathering.kind);
    if (context.weather.precipitation > 0.6 && gathering.kind !== "music") this.close(gathering, context);
  }

  private participantTick(actor: Actor, task: ActorTask, context: LifeContext): void {
    const gathering = this.gatherings.get(this.actorGatherings.get(actor.id) ?? -1);
    const participant = gathering?.participants.find((entry) => entry.actorId === actor.id);
    const leader = gathering ? context.actorById.get(gathering.leaderId) : undefined;
    if (!gathering || !participant || !leader) {
      context.completeTask(actor, false);
      return;
    }
    if (task.phase === "start") changePhase(task, "joining", context);
    if (task.phase === "joining") {
      goTo(actor, participant.target, context, 2);
      if (arrived(actor, participant.target, 0.45)) {
        participant.ready = true;
        participant.arrivedAt = context.time.seconds;
        changePhase(task, "participating", context);
      }
      return;
    }
    if (task.phase === "participating") {
      if (gathering.phase === "closing") {
        setGesture(actor, "wave", context.time.seconds, 0.5);
        return;
      }
      if (context.time.seconds > participant.leaveAt || actor.needs.urgency > 0.8) {
        this.leave(actor, gathering, context);
        return;
      }
      stopWalking(actor, gathering.kind === "chess" || gathering.kind === "picnic" ? "seated" : "performing");
      this.perform(actor, leader, participant, gathering, context);
      this.rewards(actor, participant, gathering, context);
      task.progress = leader.task?.progress ?? 0;
    }
  }

  private perform(actor: Actor, leader: Actor, participant: Participant, gathering: Gathering, context: LifeContext): void {
    if (gathering.kind === "music") {
      facePoint(actor, leader.position);
      lookAtActor(actor, leader, context, 2);
      const reacting = context.time.seconds < participant.reactionAt;
      setGesture(actor, reacting ? "wave" : "listen", context.time.seconds, reacting ? 0.45 : 0.3);
      actor.pose.chestYaw += Math.sin(context.time.seconds * 1.5 + actor.id) * 0.012;
      if (context.time.seconds > participant.reactionAt + 7) participant.reactionAt = context.time.seconds + 1.2;
    } else if (gathering.kind === "photo") {
      facePoint(actor, leader.position);
      lookAtActor(actor, leader, context, 3);
      setGesture(actor, gathering.turns % 3 === 0 ? "wave" : "neutral", context.time.seconds, 0.5);
      actor.gesture.emotion = "happy";
      if (leader.gesture.kind === "type") {
        localPoint(leader.position, leader.heading, actor.id % 2 ? 0.65 : -0.65, 0.4, this.target);
        if (distance(actor.position, leader.position) < 1.3) facePoint(actor, leader.position);
      }
    } else if (gathering.kind === "chess") {
      facePoint(actor, leader.position);
      const turn = gathering.turns % 2 === 1;
      setGesture(actor, turn && context.time.seconds < gathering.nextAction - 3 ? "point" : "listen", context.time.seconds, 0.6);
      actor.gesture.emotion = "focused";
    } else if (gathering.kind === "picnic") {
      facePoint(actor, gathering.center);
      setGesture(actor, gathering.turns % 3 === actor.id % 3 ? "talk" : "eat", context.time.seconds, 0.6);
      actor.gesture.emotion = "happy";
    } else {
      actor.targetHeading = leader.targetHeading;
      setGesture(actor, leader.gesture.kind === "neutral" ? "neutral" : "stretch", context.time.seconds, 0.6);
      actor.gesture.startedAt = leader.gesture.startedAt + actor.id % 3 * 0.11;
    }
  }

  private sharedAction(gathering: Gathering, leader: Actor, participants: Participant[], context: LifeContext): void {
    if (gathering.kind === "photo") {
      setGesture(leader, "photo", context.time.seconds, 0.9);
      for (const participant of participants) {
        const actor = context.actorById.get(participant.actorId);
        if (actor) {
          actor.gesture.emotion = "happy";
          participant.reactionAt = context.time.seconds + 1;
        }
      }
    } else if (gathering.kind === "chess") {
      const moving = gathering.turns % 2 === 0 ? leader : context.actorById.get(participants[0]?.actorId ?? -1);
      if (moving) setGesture(moving, "point", context.time.seconds, 0.7);
      for (const prop of context.props.all) {
        if (prop.kind === "chessboard" && distance(prop.position, gathering.center) < 2) prop.progress = gathering.turns;
      }
    } else if (gathering.kind === "music" && gathering.turns % 3 === 0) {
      for (const participant of participants) participant.reactionAt = context.time.seconds + 1.5;
    } else if (gathering.kind === "picnic") {
      const speaker = participants[gathering.turns % Math.max(1, participants.length)];
      if (speaker) {
        const actor = context.actorById.get(speaker.actorId);
        if (actor) setGesture(actor, "talk", context.time.seconds, 0.8);
      }
    }
  }

  private rewards(actor: Actor, participant: Participant, gathering: Gathering, context: LifeContext): void {
    const dt = context.time.dt;
    actor.needs.social = clamp(actor.needs.social - dt * 0.003 * participant.engagement, 0, 1);
    actor.needs.curiosity = clamp(actor.needs.curiosity - dt * 0.002, 0, 1);
    actor.needs.stress = clamp(actor.needs.stress - dt * 0.0015, 0, 1);
    if (gathering.kind === "picnic") actor.needs.hunger = clamp(actor.needs.hunger - dt * 0.003, 0, 1);
    if (gathering.kind === "chess") actor.needs.energy = clamp(actor.needs.energy + dt * 0.001, 0, 1);
    if (gathering.kind === "exercise") actor.needs.energy = clamp(actor.needs.energy - dt * 0.0008, 0, 1);
    if (!participant.rewarded && context.time.seconds - participant.arrivedAt > 10) {
      participant.rewarded = true;
      remember(actor, `shared-${gathering.kind}`, gathering.placeId, context, 0.45, gathering.leaderId, gathering.eventId);
      const relationship = actor.relationships.get(gathering.leaderId);
      if (relationship) {
        relationship.sharedActivities++;
        relationship.affinity = clamp(relationship.affinity + 0.025, -1, 1);
      }
    }
  }

  private title(kind: Gathering["kind"]): { zh: string; en: string } {
    if (kind === "music") return { zh: "路人驻足聆听街头吉他", en: "Passersby gather around the guitarist" };
    if (kind === "photo") return { zh: "朋友在海湾前合影", en: "Friends pose for a harbor photograph" };
    if (kind === "chess") return { zh: "两位街坊对弈", en: "Neighbors take turns at the chessboard" };
    if (kind === "picnic") return { zh: "朋友围坐分享野餐", en: "Friends share a picnic together" };
    return { zh: "邻里小组一起晨练", en: "A neighborhood group exercises together" };
  }

  private detail(kind: Gathering["kind"]): { zh: string; en: string } {
    if (kind === "music") return { zh: "听众从步道走近，站成半圆聆听，曲间回应乐手后继续行程。", en: "Listeners approach from the path, form a semicircle, respond between phrases and then continue their day." };
    if (kind === "photo") return { zh: "朋友先在镜头前站好，等待摄影者举起相机，拍摄后查看结果。", en: "Friends line up in front of the camera, wait for the photographer and check the result afterwards." };
    if (kind === "chess") return { zh: "对手坐到棋盘另一侧，两人交替思考落子，结束后互相致意。", en: "An opponent sits across the board and the players alternate their moves before saying goodbye." };
    if (kind === "picnic") return { zh: "朋友从附近走来，在野餐垫旁坐下，分享食物并轮流聊天。", en: "Friends walk over, sit beside the blanket and share food while taking turns in the conversation." };
    return { zh: "参与者留出舒展空间，跟随领练者动作，保持轻微的自然时间差。", en: "Participants leave room to move and follow the leader with small, natural differences in timing." };
  }

  private close(gathering: Gathering, context: LifeContext): void {
    if (gathering.phase === "closing") {
      if (context.time.seconds >= gathering.closingAt) this.finish(gathering, context);
      return;
    }
    gathering.phase = "closing";
    gathering.closingAt = context.time.seconds + 2;
    context.events.finish(gathering.eventId, context.time.seconds);
  }

  private finish(gathering: Gathering, context: LifeContext): void {
    this.gatherings.delete(gathering.id);
    this.leaderGatherings.delete(gathering.leaderId);
    for (const participant of [...gathering.participants]) {
      const actor = context.actorById.get(participant.actorId);
      if (actor) this.leave(actor, gathering, context);
    }
    gathering.participants.length = 0;
    context.events.finish(gathering.eventId, context.time.seconds);
  }

  private leave(actor: Actor, gathering: Gathering, context: LifeContext): void {
    if (this.releasing.has(actor.id)) return;
    this.releasing.add(actor.id);
    this.actorGatherings.delete(actor.id);
    gathering.participants = gathering.participants.filter((participant) => participant.actorId !== actor.id);
    actor.groupId = -1;
    actor.serviceCooldown = context.time.seconds + 8;
    if (actor.task?.option === "gathering-participant") finishSatisfied(actor, context, `joined-${gathering.kind}`, 0.25);
    this.releasing.delete(actor.id);
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    if (this.releasing.has(actor.id)) return;
    const gathering = this.gatherings.get(this.actorGatherings.get(actor.id) ?? -1);
    if (gathering) {
      this.actorGatherings.delete(actor.id);
      gathering.participants = gathering.participants.filter((participant) => participant.actorId !== actor.id);
    }
    const led = this.gatherings.get(this.leaderGatherings.get(actor.id) ?? -1);
    if (led) this.close(led, context);
  }
}
