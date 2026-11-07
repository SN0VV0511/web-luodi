import { clamp, distance, type Point2 } from "./math";
import { RandomStream, ShuffleBag } from "./random";
import type { Actor, LifeContext, TaskKind } from "./types";
import type { PlaceKind } from "./places";

export type ActivityCategory = "work" | "food" | "retail" | "transport" | "delivery"
  | "maintenance" | "school" | "leisure" | "social" | "assistance" | "weather";
export type LocalizedText = { zh: string; en: string };

export interface NeighborhoodActivity {
  id: number;
  key: string;
  category: ActivityCategory;
  title: LocalizedText;
  detail: LocalizedText;
  position: Point2;
  startedAt: number;
  updatedAt: number;
  duration: number;
  progress: number;
  participants: number[];
  priority: number;
  phase: string;
  finished: boolean;
  finishedAt: number;
  observers: Set<number>;
}

interface Opportunity {
  kind: TaskKind;
  category: ActivityCategory;
  places: PlaceKind[];
  cooldown: number;
  outdoors: boolean;
}

export class NeighborhoodEvents {
  private nextId = 1;
  private readonly active = new Map<number, NeighborhoodActivity>();
  private readonly byKey = new Map<string, number>();
  private readonly history: NeighborhoodActivity[] = [];
  private readonly cooldowns = new Map<string, number>();
  private readonly random = new RandomStream(0x45564e54);
  private readonly opportunities: ShuffleBag<Opportunity>;
  private nextOpportunity = 3;
  private observers: Actor[] = [];

  constructor() {
    this.opportunities = new ShuffleBag([
      { kind: "photo", category: "leisure", places: ["promenade", "park"], cooldown: 28, outdoors: true },
      { kind: "music", category: "leisure", places: ["promenade", "park"], cooldown: 42, outdoors: true },
      { kind: "conversation", category: "social", places: ["park", "cafe", "promenade"], cooldown: 18, outdoors: true },
      { kind: "chess", category: "social", places: ["park", "bench"], cooldown: 35, outdoors: true },
      { kind: "exercise", category: "leisure", places: ["park", "sports"], cooldown: 26, outdoors: true },
      { kind: "dog", category: "leisure", places: ["park", "promenade"], cooldown: 31, outdoors: true },
      { kind: "reading", category: "leisure", places: ["bench", "park"], cooldown: 22, outdoors: true },
      { kind: "shopping", category: "retail", places: ["grocery", "bookshop", "florist"], cooldown: 20, outdoors: false },
      { kind: "coffee", category: "food", places: ["cafe"], cooldown: 18, outdoors: false },
      { kind: "picnic", category: "leisure", places: ["park"], cooldown: 45, outdoors: true },
      { kind: "help", category: "assistance", places: ["bus-stop", "park", "promenade"], cooldown: 34, outdoors: true },
      { kind: "walk", category: "leisure", places: ["park", "promenade"], cooldown: 15, outdoors: true },
    ] as Opportunity[], this.random.fork("opportunities"));
  }

  publish(key: string, category: ActivityCategory, title: LocalizedText, detail: LocalizedText,
    position: Point2, seconds: number, duration: number, participants: readonly number[] = [], priority = 1): number {
    const existingId = this.byKey.get(key);
    const existing = existingId === undefined ? undefined : this.active.get(existingId);
    if (existing && !existing.finished) {
      existing.updatedAt = seconds;
      existing.duration = Math.max(existing.duration, duration);
      existing.position.x = position.x;
      existing.position.z = position.z;
      existing.title = title;
      existing.detail = detail;
      return existing.id;
    }
    if (this.active.size >= 24) this.expireOldest(seconds);
    const activity: NeighborhoodActivity = {
      id: this.nextId++,
      key,
      category,
      title,
      detail,
      position: { ...position },
      startedAt: seconds,
      updatedAt: seconds,
      duration: Math.max(2, duration),
      progress: 0,
      participants: [...participants],
      priority,
      phase: "active",
      finished: false,
      finishedAt: 0,
      observers: new Set(),
    };
    this.active.set(activity.id, activity);
    this.byKey.set(key, activity.id);
    return activity.id;
  }

  update(id: number, position: Point2, progress: number, seconds: number, phase?: string): void {
    const activity = this.active.get(id);
    if (!activity || activity.finished) return;
    activity.position.x = position.x;
    activity.position.z = position.z;
    activity.progress = clamp(progress, 0, 1);
    activity.updatedAt = seconds;
    if (phase) activity.phase = phase;
  }

  describe(id: number, detail: LocalizedText): void {
    const activity = this.active.get(id);
    if (activity) activity.detail = detail;
  }

  finish(id: number, seconds: number): void {
    const activity = this.active.get(id);
    if (!activity || activity.finished) return;
    activity.finished = true;
    activity.finishedAt = seconds;
    activity.progress = 1;
    activity.phase = "completed";
    this.byKey.delete(activity.key);
  }

  finishActor(actorId: number, seconds: number): void {
    for (const activity of this.active.values()) {
      if (activity.participants.length === 1 && activity.participants[0] === actorId) this.finish(activity.id, seconds);
    }
  }

  addParticipant(id: number, actorId: number): void {
    const activity = this.active.get(id);
    if (activity && !activity.participants.includes(actorId)) activity.participants.push(actorId);
  }

  private expireOldest(seconds: number): void {
    let oldest: NeighborhoodActivity | undefined;
    for (const activity of this.active.values()) {
      if (!oldest || activity.priority < oldest.priority
        || (activity.priority === oldest.priority && activity.updatedAt < oldest.updatedAt)) oldest = activity;
    }
    if (!oldest) return;
    this.byKey.delete(oldest.key);
    this.active.delete(oldest.id);
    oldest.finished = true;
    oldest.finishedAt = seconds;
    this.history.push(oldest);
    if (this.history.length > 48) this.history.shift();
  }

  tick(context: LifeContext): void {
    const now = context.time.seconds;
    for (const activity of this.active.values()) {
      if (!activity.finished && now - activity.updatedAt > Math.max(15, activity.duration)) this.finish(activity.id, now);
      if (activity.finished && now - activity.finishedAt > 4) {
        this.active.delete(activity.id);
        this.history.push(activity);
        if (this.history.length > 48) this.history.shift();
        continue;
      }
      if (context.time.tick % 12 === activity.id % 12) this.observe(activity, context);
    }
    if (now < this.nextOpportunity) return;
    this.nextOpportunity = now + this.random.between(4.5, 8.5);
    this.offerOpportunity(context);
  }

  private observe(activity: NeighborhoodActivity, context: LifeContext): void {
    if (activity.finished) return;
    const radius = activity.category === "leisure" || activity.category === "assistance" ? 9 : 4;
    context.neighbors.query(activity.position, radius, this.observers);
    for (const actor of this.observers) {
      if (activity.participants.includes(actor.id) || activity.observers.has(actor.id)) continue;
      if (actor.task && actor.task.priority >= 5) continue;
      activity.observers.add(actor.id);
      actor.gesture.gazePoint.x = activity.position.x;
      actor.gesture.gazePoint.z = activity.position.z;
      actor.gesture.gazeUntil = context.time.seconds + 1.5 + actor.personality.curiosity * 2;
      actor.needs.curiosity = Math.max(0, actor.needs.curiosity - 0.025);
      if (activity.category === "leisure") actor.needs.stress = Math.max(0, actor.needs.stress - 0.01);
      if (activity.observers.size > 32) break;
    }
  }

  private offerOpportunity(context: LifeContext): void {
    const opportunity = this.opportunities.next();
    const key = opportunity.kind;
    if ((this.cooldowns.get(key) ?? 0) > context.time.seconds) return;
    if (opportunity.outdoors && context.weather.outdoorComfort < 0.35) return;
    if (context.time.night && ["picnic", "exercise", "photo"].includes(opportunity.kind)) return;
    const candidates = context.actors.filter((actor) => this.available(actor, opportunity, context));
    if (candidates.length === 0) return;
    const actor = this.random.weighted(candidates, (candidate) => this.opportunityAffinity(candidate, opportunity));
    const place = context.places.find(actor, opportunity.places, context.time,
      (candidate) => context.routes.isReachable(actor.position, candidate.entrance));
    if (!place || distance(actor.position, place.entrance) > 100) return;
    if (context.issueTask(actor, opportunity.kind, place.id, 2)) {
      this.cooldowns.set(key, context.time.seconds + opportunity.cooldown);
    }
  }

  private available(actor: Actor, opportunity: Opportunity, context: LifeContext): boolean {
    if (!actor.visible || actor.interiorId || actor.vehicleId >= 0 || actor.conversationId >= 0) return false;
    if (actor.task && actor.task.priority >= 2) return false;
    if (actor.age === "child" || actor.serviceCooldown > context.time.seconds) return false;
    if (actor.needs.energy < 0.2 || actor.needs.hunger > 0.8) return false;
    if (opportunity.kind === "music" && actor.occupation !== "tourist" && actor.occupation !== "retired") return false;
    if (opportunity.kind === "help" && actor.personality.generosity < 0.4) return false;
    if (["courier", "cleaner", "gardener", "medic", "officer"].includes(actor.occupation)) return false;
    return true;
  }

  private opportunityAffinity(actor: Actor, opportunity: Opportunity): number {
    let affinity = 0.2 + actor.personality.curiosity;
    if (opportunity.category === "social") affinity += actor.needs.social;
    if (opportunity.kind === "photo" && actor.occupation === "tourist") affinity += 1.5;
    if (opportunity.kind === "chess" && actor.age === "elder") affinity += 1;
    if (opportunity.kind === "reading") affinity += 1 - actor.needs.energy;
    if (opportunity.kind === "coffee") affinity += actor.needs.thirst;
    if (opportunity.kind === "exercise") affinity += actor.needs.energy;
    if (opportunity.kind === "help") affinity += actor.personality.generosity;
    return affinity;
  }

  snapshot(seconds: number): {
    id: string;
    title: LocalizedText;
    detail: LocalizedText;
    x: number;
    z: number;
    progress: number;
  }[] {
    return [...this.active.values()]
      .filter((activity) => !activity.finished || seconds - activity.finishedAt < 2)
      .sort((a, b) => b.priority - a.priority || b.startedAt - a.startedAt)
      .slice(0, 16)
      .map((activity) => ({
        id: `detailed-life-${activity.id}`,
        title: activity.title,
        detail: activity.detail,
        x: activity.position.x,
        z: activity.position.z,
        progress: activity.progress,
      }));
  }

  count(category?: ActivityCategory): number {
    let count = 0;
    for (const activity of this.active.values()) {
      if (!activity.finished && (!category || activity.category === category)) count++;
    }
    return count;
  }

  at(position: Point2, radius: number): NeighborhoodActivity[] {
    return [...this.active.values()].filter((activity) => !activity.finished && distance(activity.position, position) < radius);
  }

  reset(): void {
    this.active.clear();
    this.byKey.clear();
    this.history.length = 0;
    this.cooldowns.clear();
    this.random.reset();
    this.opportunities.reset();
    this.nextId = 1;
    this.nextOpportunity = 3;
  }
}
