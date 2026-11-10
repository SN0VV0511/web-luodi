import { clamp, distance, localPoint, point, type Point2 } from "./math";
import type { Actor, LifeContext } from "./types";

export interface QueueEntry {
  actorId: number;
  ticket: number;
  joinedAt: number;
  patienceUntil: number;
  priority: number;
  position: Point2;
  target: Point2;
  arrived: boolean;
  served: boolean;
  skipped: boolean;
  groupId: number;
  distanceToFront: number;
}

export interface CityQueue {
  id: string;
  venueId: string;
  front: Point2;
  heading: number;
  spacing: number;
  columns: number;
  maximumLength: number;
  entries: QueueEntry[];
  activeActor: number;
  activeSince: number;
  serviceDuration: number;
  serviceProgress: number;
  paused: boolean;
  closed: boolean;
  lastAdvance: number;
  servedCount: number;
  totalWait: number;
}

export class QueueManager {
  private nextTicket = 1;
  readonly queues = new Map<string, CityQueue>();
  private readonly actorQueue = new Map<number, string>();
  private readonly completed = new Set<number>();
  private readonly abandoned = new Set<number>();

  ensure(id: string, venueId: string, front: Point2, heading: number, serviceDuration: number, maximumLength = 6): CityQueue {
    const existing = this.queues.get(id);
    if (existing) return existing;
    const queue: CityQueue = {
      id,
      venueId,
      front: { ...front },
      heading,
      spacing: 0.9,
      columns: 1,
      maximumLength,
      entries: [],
      activeActor: -1,
      activeSince: 0,
      serviceDuration,
      serviceProgress: 0,
      paused: false,
      closed: false,
      lastAdvance: 0,
      servedCount: 0,
      totalWait: 0,
    };
    this.queues.set(id, queue);
    return queue;
  }

  join(id: string, actor: Actor, now: number, priority = 0, groupId = -1): QueueEntry | undefined {
    const queue = this.queues.get(id);
    if (!queue || queue.closed) return undefined;
    const currentId = this.actorQueue.get(actor.id);
    if (currentId === id) return queue.entries.find((entry) => entry.actorId === actor.id);
    if (queue.entries.length >= queue.maximumLength) return undefined;
    if (currentId) this.leave(actor.id);
    const target = this.positionFor(queue, queue.entries.length, point());
    const entry: QueueEntry = {
      actorId: actor.id,
      ticket: this.nextTicket++,
      joinedAt: now,
      patienceUntil: now + 18 + actor.personality.patience * 55,
      priority,
      position: { ...actor.position },
      target,
      arrived: false,
      served: false,
      skipped: false,
      groupId,
      distanceToFront: queue.entries.length * queue.spacing,
    };
    if (priority > 0) {
      const position = queue.entries.findIndex((other) => other.priority < priority && other.actorId !== queue.activeActor);
      if (position >= 0) queue.entries.splice(position, 0, entry);
      else queue.entries.push(entry);
    } else {
      queue.entries.push(entry);
    }
    this.actorQueue.set(actor.id, id);
    this.completed.delete(actor.id);
    this.abandoned.delete(actor.id);
    this.reflow(queue);
    return entry;
  }

  private positionFor(queue: CityQueue, index: number, target: Point2): Point2 {
    const row = Math.floor(index / queue.columns);
    const column = index % queue.columns;
    const lateral = queue.columns > 1 ? (column - (queue.columns - 1) / 2) * 0.8 : 0;
    return localPoint(queue.front, queue.heading, lateral, -row * queue.spacing, target);
  }

  private reflow(queue: CityQueue): void {
    queue.entries.forEach((entry, index) => {
      this.positionFor(queue, index, entry.target);
      entry.distanceToFront = index * queue.spacing;
    });
  }

  target(actorId: number): Point2 | undefined {
    const queue = this.forActor(actorId);
    return queue?.entries.find((entry) => entry.actorId === actorId)?.target;
  }

  forActor(actorId: number): CityQueue | undefined {
    const id = this.actorQueue.get(actorId);
    return id ? this.queues.get(id) : undefined;
  }

  isActive(actorId: number): boolean {
    return this.forActor(actorId)?.activeActor === actorId;
  }

  takeCompleted(actorId: number): boolean {
    const completed = this.completed.has(actorId);
    if (completed) this.completed.delete(actorId);
    return completed;
  }

  takeAbandoned(actorId: number): boolean {
    const abandoned = this.abandoned.has(actorId);
    if (abandoned) this.abandoned.delete(actorId);
    return abandoned;
  }

  advanceManually(id: string, seconds: number): number | undefined {
    const queue = this.queues.get(id);
    if (!queue || queue.activeActor < 0) return undefined;
    const actorId = queue.activeActor;
    this.finish(queue, seconds);
    return actorId;
  }

  private finish(queue: CityQueue, seconds: number): void {
    const index = queue.entries.findIndex((entry) => entry.actorId === queue.activeActor);
    if (index >= 0) {
      const entry = queue.entries[index];
      entry.served = true;
      this.completed.add(entry.actorId);
      this.actorQueue.delete(entry.actorId);
      queue.totalWait += seconds - entry.joinedAt;
      queue.servedCount++;
      queue.entries.splice(index, 1);
    }
    queue.activeActor = -1;
    queue.serviceProgress = 0;
    queue.lastAdvance = seconds;
    this.reflow(queue);
  }

  tick(context: LifeContext): void {
    const now = context.time.seconds;
    for (const queue of this.queues.values()) {
      if (queue.closed) continue;
      for (let index = queue.entries.length - 1; index >= 0; index--) {
        const entry = queue.entries[index];
        const actor = context.actorById.get(entry.actorId);
        if (!actor || (!actor.task && actor.mode !== "boarding")) {
          this.leave(entry.actorId);
          continue;
        }
        entry.position.x = actor.position.x;
        entry.position.z = actor.position.z;
        entry.arrived = distance(actor.position, entry.target) < 0.35;
        if (entry.patienceUntil < now && entry.actorId !== queue.activeActor) {
          this.abandoned.add(entry.actorId);
          actor.needs.stress = clamp(actor.needs.stress + 0.12, 0, 1);
          this.leave(entry.actorId);
          continue;
        }
        if (!entry.arrived && !actor.navigation.pending && (!actor.navigation.points.length || distance(actor.navigation.finalTarget, entry.target) > 0.35)) {
          context.routes.request(actor, entry.target, now, 2);
        }
        if (entry.arrived && actor.id !== queue.activeActor) {
          actor.mode = "queuing";
          actor.targetHeading = queue.heading;
        }
      }
      if (queue.paused || queue.entries.length === 0) continue;
      if (queue.activeActor < 0) {
        const first = queue.entries[0];
        if (!first.arrived || now - queue.lastAdvance < 0.35) continue;
        queue.activeActor = first.actorId;
        queue.activeSince = now;
        queue.serviceProgress = 0;
      }
      const actor = context.actorById.get(queue.activeActor);
      if (!actor) {
        queue.activeActor = -1;
        continue;
      }
      actor.mode = "waiting";
      actor.targetHeading = queue.heading;
      queue.serviceProgress = clamp((now - queue.activeSince) / Math.max(0.5, queue.serviceDuration), 0, 1);
      if (queue.serviceProgress >= 1) this.finish(queue, now);
    }
  }

  leave(actorId: number): void {
    const id = this.actorQueue.get(actorId);
    if (!id) return;
    this.actorQueue.delete(actorId);
    const queue = this.queues.get(id);
    if (!queue) return;
    const index = queue.entries.findIndex((entry) => entry.actorId === actorId);
    if (index >= 0) queue.entries.splice(index, 1);
    if (queue.activeActor === actorId) {
      queue.activeActor = -1;
      queue.serviceProgress = 0;
    }
    this.reflow(queue);
  }

  close(id: string): number[] {
    const queue = this.queues.get(id);
    if (!queue) return [];
    const actorIds = queue.entries.map((entry) => entry.actorId);
    for (const actorId of actorIds) {
      this.abandoned.add(actorId);
      this.actorQueue.delete(actorId);
    }
    queue.entries.length = 0;
    queue.closed = true;
    queue.activeActor = -1;
    queue.serviceProgress = 0;
    return actorIds;
  }

  reopen(id: string): void {
    const queue = this.queues.get(id);
    if (queue) queue.closed = false;
  }

  estimateWait(id: string): number {
    const queue = this.queues.get(id);
    if (!queue || queue.closed) return Infinity;
    const currentRemaining = queue.activeActor >= 0 ? (1 - queue.serviceProgress) * queue.serviceDuration : 0;
    return currentRemaining + Math.max(0, queue.entries.length - (queue.activeActor >= 0 ? 1 : 0)) * queue.serviceDuration;
  }

  reset(): void {
    for (const queue of this.queues.values()) {
      queue.entries.length = 0;
      queue.activeActor = -1;
      queue.activeSince = 0;
      queue.serviceProgress = 0;
      queue.lastAdvance = 0;
      queue.servedCount = 0;
      queue.totalWait = 0;
      queue.paused = false;
      queue.closed = false;
    }
    this.actorQueue.clear();
    this.completed.clear();
    this.abandoned.clear();
    this.nextTicket = 1;
  }
}
