import { clamp, distance, localPoint, point, type Point2 } from "./math";
import { arrived, changePhase, facePoint, finishSatisfied, gestureToward, goTo, lookAtActor, remember, setGesture, stopWalking, usefulPartner, worldHand } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem, Relationship } from "./types";

interface SocialTopic {
  id: string;
  relevance: (actor: Actor, partner: Actor, context: LifeContext) => number;
  agreement: (actor: Actor, partner: Actor) => number;
  title: { zh: string; en: string };
  detail: { zh: string; en: string };
  gesture: "talk" | "point" | "listen" | "photo";
}

interface ConversationMember {
  actorId: number;
  joinedAt: number;
  intendedPosition: Point2;
  heardTurns: number;
  spokenTurns: number;
  patience: number;
  ready: boolean;
  thanked: boolean;
}

interface Conversation {
  id: number;
  placeId: string;
  center: Point2;
  members: ConversationMember[];
  phase: "approach" | "greet" | "talk" | "farewell";
  phaseUntil: number;
  startedAt: number;
  endsAt: number;
  topic: SocialTopic;
  speaker: number;
  nextTurn: number;
  turns: number;
  mood: number;
  eventId: number;
  lastUpdate: number;
  handshake: boolean;
}

export class NeighborhoodSocial implements LifeSystem {
  private readonly conversations = new Map<number, Conversation>();
  private readonly topics: SocialTopic[];
  private readonly neighbors: Actor[] = [];
  private nextConversation = 1;
  private nextEncounter = 3;
  private readonly target = point();
  private ending = false;

  constructor() {
    this.topics = this.createTopics();
  }

  private createTopics(): SocialTopic[] {
    const topics: SocialTopic[] = [];
    topics.push({
      id: "work",
      relevance: (actor, partner) => actor.workplaceId === partner.workplaceId ? 1.2 : actor.occupation === partner.occupation ? 0.6 : 0.1,
      agreement: (actor, partner) => 1 - Math.abs(actor.personality.diligence - partner.personality.diligence),
      title: { zh: "同事在楼前交流工作", en: "Colleagues catch up outside work" },
      detail: { zh: "两人停在步道一侧，轮流讲述并回应，谈完后各自继续行程。", en: "Colleagues step aside, take turns speaking and listening, then continue their day." },
      gesture: "talk",
    });
    topics.push({
      id: "weather",
      relevance: (_actor, _partner, context) => context.weather.precipitation > 0.2 || context.weather.temperature > 28 ? 1 : 0.45,
      agreement: (actor, partner) => 0.6 + (actor.wetness + partner.wetness) * 0.2,
      title: { zh: "街坊聊起今天的天气", en: "Neighbors compare the weather" },
      detail: { zh: "居民看向天空和周围树木，交流雨势、温度与出行安排。", en: "Neighbors glance at the sky and trees while discussing the rain, temperature and their plans." },
      gesture: "point",
    });
    topics.push({
      id: "neighborhood",
      relevance: (actor, partner) => actor.homeId === partner.homeId ? 1.2 : actor.household === partner.household ? 1 : 0.55,
      agreement: (actor, partner) => 0.5 + Math.min(actor.personality.sociability, partner.personality.sociability) * 0.5,
      title: { zh: "邻居偶遇，停下问候", en: "Neighbors stop to say hello" },
      detail: { zh: "熟悉的居民相互挥手，面对面聊天，临走前挥手道别。", en: "Familiar residents wave, have a brief conversation and say goodbye before leaving." },
      gesture: "talk",
    });
    topics.push({
      id: "garden",
      relevance: (actor, partner) => actor.occupation === "gardener" || partner.occupation === "gardener" ? 1.1 : actor.age === "elder" ? 0.7 : 0.25,
      agreement: (actor, partner) => 1 - Math.abs(actor.personality.curiosity - partner.personality.curiosity) * 0.5,
      title: { zh: "居民交流花草养护", en: "Sharing advice about the plants" },
      detail: { zh: "居民指向附近花圃，聊起浇水、季节变化和园艺经验。", en: "Residents point toward the planting beds and exchange advice about watering and seasonal care." },
      gesture: "point",
    });
    topics.push({
      id: "photograph",
      relevance: (actor, partner) => actor.occupation === "tourist" || partner.occupation === "tourist" ? 1.1 : 0.25,
      agreement: (actor, partner) => (actor.personality.curiosity + partner.personality.curiosity) * 0.5,
      title: { zh: "分享刚拍下的照片", en: "Sharing a recent photograph" },
      detail: { zh: "居民靠近查看照片，再抬头讨论拍摄方向。", en: "Residents look at a photograph together and discuss the view it captures." },
      gesture: "photo",
    });
    topics.push({
      id: "family",
      relevance: (actor, partner) => actor.occupation === "parent" && partner.occupation === "parent" ? 1.2 : actor.household === partner.household ? 0.9 : 0.1,
      agreement: (actor, partner) => 0.65 + Math.min(actor.personality.patience, partner.personality.patience) * 0.3,
      title: { zh: "家长在接送路上交流", en: "Parents talk on the school run" },
      detail: { zh: "家长聊起接送安排，同时照看身旁的孩子。", en: "Parents discuss school arrangements while keeping their children close." },
      gesture: "talk",
    });
    topics.push({
      id: "books",
      relevance: (actor, partner) => actor.inventory.some((item) => item.kind === "book") || partner.inventory.some((item) => item.kind === "book") ? 1 : 0.2,
      agreement: (actor, partner) => 1 - Math.abs(actor.personality.curiosity - partner.personality.curiosity),
      title: { zh: "长椅边推荐一本书", en: "Recommending a book by the bench" },
      detail: { zh: "读者把书展示给朋友，交替讲述和聆听，再收好书继续阅读。", en: "A reader shows a friend a book, explains the recommendation and listens to the response." },
      gesture: "talk",
    });
    return topics;
  }

  reset(): void {
    this.conversations.clear();
    this.nextConversation = 1;
    this.nextEncounter = 3;
    this.ending = false;
  }

  tick(context: LifeContext): void {
    if (context.time.seconds >= this.nextEncounter) {
      this.nextEncounter = context.time.seconds + 3.5;
      this.findEncounters(context);
    }
    for (const actor of context.actors) {
      if (actor.task?.kind === "conversation" && actor.conversationId < 0) this.requestedConversation(actor, actor.task, context);
    }
    for (const conversation of [...this.conversations.values()]) this.converse(conversation, context);
    this.decayRelationships(context);
  }

  private requestedConversation(actor: Actor, task: ActorTask, context: LifeContext): void {
    const place = context.places.get(task.venueId);
    if (!place) {
      context.completeTask(actor, false);
      return;
    }
    if (task.phase === "start") changePhase(task, "find-company", context, 22);
    if (!arrived(actor, place.entrance, 5)) {
      goTo(actor, place.entrance, context);
      return;
    }
    context.neighbors.query(actor.position, 9, this.neighbors, actor.id);
    const candidate = this.bestPartner(actor, this.neighbors, context);
    if (candidate && this.begin(actor, candidate, task.venueId, context)) return;
    stopWalking(actor, "waiting");
    setGesture(actor, "watch", context.time.seconds, 0.3);
    if (context.time.seconds > task.until) finishSatisfied(actor, context, "quiet-pause", 0.1);
  }

  private findEncounters(context: LifeContext): void {
    if (this.conversations.size >= 7 || context.weather.precipitation > 0.7) return;
    const start = Math.floor(context.time.seconds) % Math.max(1, context.actors.length);
    for (let offset = 0; offset < Math.min(18, context.actors.length); offset++) {
      const actor = context.actors[(start + offset) % context.actors.length];
      if (!this.available(actor, context) || actor.age === "child") continue;
      if (actor.needs.social < 0.3 && !actor.random.probability(0.15)) continue;
      context.neighbors.query(actor.position, 4.2, this.neighbors, actor.id);
      const candidate = this.bestPartner(actor, this.neighbors, context);
      if (!candidate) continue;
      const affinity = actor.relationships.get(candidate.id)?.affinity ?? 0;
      const chance = actor.personality.sociability * 0.45 + affinity * 0.2;
      if (!actor.random.probability(chance)) continue;
      const place = context.places.find(actor, ["park", "promenade", "bench", "cafe"], context.time);
      if (!place || distance(place.entrance, actor.position) > 18) continue;
      if (this.begin(actor, candidate, place.id, context)) break;
    }
  }

  private available(actor: Actor, context: LifeContext): boolean {
    if (!actor.visible || actor.interiorId || actor.vehicleId >= 0 || actor.conversationId >= 0) return false;
    if (actor.greetingCooldown > context.time.seconds || actor.navigation.crossingId >= 0) return false;
    if (actor.task && actor.task.priority >= 4) return false;
    if (actor.mode === "working" || actor.mode === "assisting" || actor.mode === "boarding") return false;
    return actor.needs.urgency < 0.8;
  }

  private bestPartner(actor: Actor, candidates: readonly Actor[], context: LifeContext): Actor | undefined {
    let best: Actor | undefined;
    let bestScore = 0.05;
    for (const candidate of candidates) {
      if (!usefulPartner(actor, candidate) || !this.available(candidate, context)) continue;
      if (candidate.age === "child" && actor.household !== candidate.household) continue;
      const relationship = actor.relationships.get(candidate.id);
      const score = (relationship?.familiarity ?? 0) * 1.4 + (relationship?.affinity ?? 0) * 0.8
        + candidate.personality.sociability * 0.4 + candidate.needs.social * 0.3 - distance(actor.position, candidate.position) * 0.12;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  private begin(first: Actor, second: Actor, placeId: string, context: LifeContext): boolean {
    if (first.conversationId >= 0 || second.conversationId >= 0) return false;
    if (second.task && second.task.priority >= 4) return false;
    if (first.task?.kind !== "conversation") {
      if (first.task) context.interruptTask(first, "conversation", placeId, 3);
      else context.issueTask(first, "conversation", placeId, 3);
    }
    if (second.task?.kind !== "conversation") {
      if (second.task) context.interruptTask(second, "conversation", placeId, 3);
      else context.issueTask(second, "conversation", placeId, 3);
    }
    if (first.task?.kind !== "conversation" || second.task?.kind !== "conversation") return false;
    const id = this.nextConversation++;
    const center = { x: (first.position.x + second.position.x) * 0.5, z: (first.position.z + second.position.z) * 0.5 };
    const node = context.network.nearest(center, (candidate) => candidate.surface !== "crosswalk");
    if (node && distance(center, node.position) < 4) {
      center.x = node.position.x;
      center.z = node.position.z;
    }
    const topic = first.random.weighted(this.topics, (candidate) => candidate.relevance(first, second, context));
    const conversation: Conversation = {
      id,
      placeId,
      center,
      members: [],
      phase: "approach",
      phaseUntil: context.time.seconds + 12,
      startedAt: context.time.seconds,
      endsAt: context.time.seconds + 22 + (first.personality.sociability + second.personality.sociability) * 12,
      topic,
      speaker: first.id,
      nextTurn: 0,
      turns: 0,
      mood: 0.6,
      eventId: -1,
      lastUpdate: context.time.seconds,
      handshake: first.relationships.get(second.id)?.coworker ?? false,
    };
    this.addMember(conversation, first, context);
    this.addMember(conversation, second, context);
    this.conversations.set(id, conversation);
    this.arrange(conversation);
    conversation.eventId = context.events.publish(`conversation-${id}`, "social", topic.title, topic.detail, center, context.time.seconds, conversation.endsAt - context.time.seconds, [first.id, second.id], 1);
    return true;
  }

  private addMember(conversation: Conversation, actor: Actor, context: LifeContext): void {
    conversation.members.push({
      actorId: actor.id,
      joinedAt: context.time.seconds,
      intendedPosition: { ...actor.position },
      heardTurns: 0,
      spokenTurns: 0,
      patience: actor.personality.patience,
      ready: false,
      thanked: false,
    });
    actor.conversationId = conversation.id;
    actor.groupId = conversation.id;
    if (actor.task) {
      actor.task.partnerId = conversation.members.find((member) => member.actorId !== actor.id)?.actorId ?? -1;
      actor.task.phase = "conversation";
      actor.task.deadline = conversation.endsAt + 30;
    }
  }

  private arrange(conversation: Conversation): void {
    const count = conversation.members.length;
    const radius = count === 2 ? 0.72 : 0.85 + count * 0.06;
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2 + conversation.id * 0.7;
      const position = conversation.members[index].intendedPosition;
      position.x = conversation.center.x + Math.cos(angle) * radius;
      position.z = conversation.center.z + Math.sin(angle) * radius;
    }
  }

  private converse(conversation: Conversation, context: LifeContext): void {
    const members = conversation.members.map((member) => context.actorById.get(member.actorId)).filter((actor): actor is Actor => !!actor && actor.visible && actor.task?.kind === "conversation");
    if (members.length < 2) {
      this.finish(conversation, context);
      return;
    }
    if (conversation.phase === "approach") {
      let ready = 0;
      for (const member of conversation.members) {
        const actor = context.actorById.get(member.actorId);
        if (!actor) continue;
        goTo(actor, member.intendedPosition, context, 3);
        member.ready = arrived(actor, member.intendedPosition, 0.4);
        if (member.ready) {
          ready++;
          stopWalking(actor, "talking");
          facePoint(actor, conversation.center);
          setGesture(actor, "wave", context.time.seconds, 0.6);
        }
      }
      if (ready === members.length || context.time.seconds > conversation.phaseUntil) {
        if (ready < 2) {
          this.finish(conversation, context);
          return;
        }
        conversation.phase = "greet";
        conversation.phaseUntil = context.time.seconds + 3;
      }
      return;
    }
    if (conversation.phase === "greet") {
      this.greet(conversation, members, context);
      if (context.time.seconds >= conversation.phaseUntil) {
        conversation.phase = "talk";
        conversation.nextTurn = context.time.seconds;
      }
      return;
    }
    if (conversation.phase === "talk") {
      if (context.time.seconds >= conversation.nextTurn) this.turn(conversation, members, context);
      this.listen(conversation, members, context);
      if (context.time.seconds > conversation.endsAt || members.some((actor) => actor.needs.urgency > 0.9)) {
        conversation.phase = "farewell";
        conversation.phaseUntil = context.time.seconds + 2.5;
      }
      context.events.update(conversation.eventId, conversation.center, clamp((context.time.seconds - conversation.startedAt) / (conversation.endsAt - conversation.startedAt), 0, 1), context.time.seconds, "talking");
      return;
    }
    for (const actor of members) setGesture(actor, "wave", context.time.seconds, 0.6);
    if (context.time.seconds >= conversation.phaseUntil) this.finish(conversation, context);
  }

  private greet(conversation: Conversation, members: Actor[], context: LifeContext): void {
    const first = members[0];
    const second = members[1];
    for (const actor of members) {
      stopWalking(actor, "talking");
      facePoint(actor, conversation.center);
      setGesture(actor, conversation.handshake ? "handshake" : "wave", context.time.seconds, 0.65);
    }
    if (conversation.handshake && distance(first.position, second.position) < 1.65) {
      const firstHand = worldHand(first);
      const secondHand = worldHand(second);
      const target = { x: (firstHand.x + secondHand.x) * 0.5, y: Math.min(firstHand.y, secondHand.y), z: (firstHand.z + secondHand.z) * 0.5 };
      gestureToward(first, "handshake", target, context);
      gestureToward(second, "handshake", target, context);
    }
    this.relationship(first, second, context);
    this.relationship(second, first, context);
  }

  private turn(conversation: Conversation, members: Actor[], context: LifeContext): void {
    const candidateMembers = conversation.members.filter((member) => member.actorId !== conversation.speaker);
    candidateMembers.sort((a, b) => a.spokenTurns - b.spokenTurns || a.joinedAt - b.joinedAt);
    const next = candidateMembers[0] ?? conversation.members[0];
    conversation.speaker = next.actorId;
    next.spokenTurns++;
    conversation.turns++;
    const speaker = context.actorById.get(next.actorId)!;
    conversation.nextTurn = context.time.seconds + 2.2 + speaker.personality.sociability * 2.2;
    for (const actor of members) {
      const speaking = actor.id === conversation.speaker;
      setGesture(actor, speaking ? conversation.topic.gesture : "listen", context.time.seconds, speaking ? 0.8 : 0.45);
      if (!speaking) {
        lookAtActor(actor, speaker, context, conversation.nextTurn - context.time.seconds + 0.3);
        const member = conversation.members.find((entry) => entry.actorId === actor.id)!;
        member.heardTurns++;
        const agreement = conversation.topic.agreement(actor, speaker);
        const relationship = this.relationship(actor, speaker, context);
        relationship.affinity = clamp(relationship.affinity + (agreement - 0.35) * 0.008, -1, 1);
        relationship.familiarity = Math.min(1, relationship.familiarity + 0.005);
        conversation.mood = lerpMood(conversation.mood, agreement);
      }
    }
    if (conversation.turns % 4 === 0 && members.length === 2) {
      conversation.topic = speaker.random.weighted(this.topics, (topic) => topic.relevance(members[0], members[1], context));
      context.events.describe(conversation.eventId, conversation.topic.detail);
    }
  }

  private listen(conversation: Conversation, members: Actor[], context: LifeContext): void {
    const speaker = context.actorById.get(conversation.speaker);
    for (const actor of members) {
      stopWalking(actor, "talking");
      facePoint(actor, speaker && speaker.id !== actor.id ? speaker.position : conversation.center);
      actor.needs.social = clamp(actor.needs.social - context.time.dt * (0.004 + actor.personality.sociability * 0.004), 0, 1);
      actor.needs.stress = clamp(actor.needs.stress - context.time.dt * conversation.mood * 0.002, 0, 1);
      actor.gesture.emotion = conversation.mood > 0.6 ? "happy" : "neutral";
      if (actor.gesture.hasTarget && conversation.phase === "talk") actor.gesture.hasTarget = false;
    }
  }

  private relationship(actor: Actor, other: Actor, context: LifeContext): Relationship {
    let relationship = actor.relationships.get(other.id);
    if (!relationship) {
      relationship = {
        actorId: other.id,
        affinity: 0.2,
        familiarity: 0.08,
        trust: 0.3,
        lastConversation: context.time.seconds,
        sharedActivities: 0,
        household: actor.household === other.household,
        coworker: actor.workplaceId === other.workplaceId,
        promisedMeeting: -1,
      };
      actor.relationships.set(other.id, relationship);
    }
    return relationship;
  }

  private finish(conversation: Conversation, context: LifeContext): void {
    if (this.ending) return;
    this.ending = true;
    this.conversations.delete(conversation.id);
    context.events.finish(conversation.eventId, context.time.seconds);
    for (const member of conversation.members) {
      const actor = context.actorById.get(member.actorId);
      if (!actor) continue;
      actor.conversationId = -1;
      actor.groupId = -1;
      actor.greetingCooldown = context.time.seconds + 35 + actor.personality.patience * 20;
      for (const otherMember of conversation.members) {
        if (otherMember.actorId === actor.id) continue;
        const other = context.actorById.get(otherMember.actorId);
        if (!other) continue;
        const relationship = this.relationship(actor, other, context);
        relationship.lastConversation = context.time.seconds;
        relationship.sharedActivities++;
        relationship.trust = clamp(relationship.trust + conversation.mood * 0.01, 0, 1);
        remember(actor, `conversation-${conversation.topic.id}`, conversation.placeId, context, conversation.mood * 0.4, other.id, conversation.eventId);
      }
      if (actor.task?.kind === "conversation") context.completeTask(actor, true);
    }
    this.ending = false;
  }

  private decayRelationships(context: LifeContext): void {
    if (context.time.tick % 120 !== 0) return;
    for (const actor of context.actors) {
      for (const relationship of actor.relationships.values()) {
        if (relationship.household || relationship.coworker) continue;
        const elapsed = context.time.seconds - relationship.lastConversation;
        if (elapsed > 300) relationship.familiarity = Math.max(0.02, relationship.familiarity - 0.001);
        if (actor.relationships.size > 24 && relationship.familiarity < 0.04) actor.relationships.delete(relationship.actorId);
      }
    }
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    if (this.ending) return;
    const conversation = this.conversations.get(actor.conversationId);
    if (!conversation) return;
    conversation.members = conversation.members.filter((member) => member.actorId !== actor.id);
    actor.conversationId = -1;
    actor.groupId = -1;
    if (conversation.members.length < 2) this.finish(conversation, context);
    else this.arrange(conversation);
  }
}

function lerpMood(current: number, next: number): number {
  return clamp(current * 0.85 + next * 0.15, 0, 1);
}
