import { distanceSquared, type Point2 } from "./math";
import type { PlaceDirectory, PlaceFeature, PlaceSlot } from "./places";

export interface DestinationReservation {
  id: number;
  actorId: number;
  placeId: string;
  slotId: string;
  feature: PlaceFeature;
  position: Point2;
  heading: number;
  createdAt: number;
  expiresAt: number;
  arrivalDeadline: number;
  arrived: boolean;
  priority: number;
  groupId: number;
}

interface WaitingReservation {
  actorId: number;
  placeId: string;
  feature: PlaceFeature;
  requestedAt: number;
  duration: number;
  priority: number;
  accessible: boolean;
  origin: Point2;
}

export class DestinationReservations {
  private nextId = 1;
  private readonly reservations = new Map<number, DestinationReservation>();
  private readonly actorReservations = new Map<number, Set<number>>();
  private readonly slotReservations = new Map<string, Set<number>>();
  private readonly waiting: WaitingReservation[] = [];
  private readonly grants = new Map<number, DestinationReservation>();

  constructor(private readonly places: PlaceDirectory) {}

  claim(actorId: number, placeId: string, feature: PlaceFeature, now: number, duration: number, origin?: Point2, priority = 0, accessible = false): DestinationReservation | undefined {
    const existing = this.findActorReservation(actorId, placeId, feature);
    if (existing) {
      existing.expiresAt = Math.max(existing.expiresAt, now + duration);
      return existing;
    }
    const place = this.places.get(placeId);
    if (!place) return undefined;
    const candidates = place.slots.filter((slot) => slot.kind === feature
      && (!accessible || slot.accessible) && slot.condition > 0.15);
    candidates.sort((a, b) => {
      const usageA = (this.slotReservations.get(a.id)?.size ?? 0) / Math.max(1, a.capacity);
      const usageB = (this.slotReservations.get(b.id)?.size ?? 0) / Math.max(1, b.capacity);
      if (usageA !== usageB) return usageA - usageB;
      return origin ? distanceSquared(a.position, origin) - distanceSquared(b.position, origin) : a.id.localeCompare(b.id);
    });
    const slot = candidates.find((candidate) => (this.slotReservations.get(candidate.id)?.size ?? 0) < candidate.capacity);
    if (!slot) return undefined;
    return this.create(actorId, placeId, slot, now, duration, priority);
  }

  private create(actorId: number, placeId: string, slot: PlaceSlot, now: number, duration: number, priority: number): DestinationReservation {
    const reservation: DestinationReservation = {
      id: this.nextId++,
      actorId,
      placeId,
      slotId: slot.id,
      feature: slot.kind,
      position: { ...slot.position },
      heading: slot.heading,
      createdAt: now,
      expiresAt: now + Math.max(1, duration),
      arrivalDeadline: now + Math.max(12, Math.min(90, duration * 0.65)),
      arrived: false,
      priority,
      groupId: -1,
    };
    this.reservations.set(reservation.id, reservation);
    const actorSet = this.actorReservations.get(actorId) ?? new Set();
    actorSet.add(reservation.id);
    this.actorReservations.set(actorId, actorSet);
    const slotSet = this.slotReservations.get(slot.id) ?? new Set();
    slotSet.add(reservation.id);
    this.slotReservations.set(slot.id, slotSet);
    slot.reservedUntil = Math.max(slot.reservedUntil, reservation.expiresAt);
    return reservation;
  }

  claimGroup(actorIds: readonly number[], placeId: string, feature: PlaceFeature, now: number, duration: number, groupId: number): DestinationReservation[] {
    const granted: DestinationReservation[] = [];
    for (const actorId of actorIds) {
      const reservation = this.claim(actorId, placeId, feature, now, duration);
      if (!reservation) {
        for (const previous of granted) this.release(previous.id);
        return [];
      }
      reservation.groupId = groupId;
      granted.push(reservation);
    }
    return granted;
  }

  joinWaitlist(actorId: number, placeId: string, feature: PlaceFeature, now: number, duration: number, origin: Point2, priority = 0, accessible = false): void {
    const existing = this.waiting.find((entry) => entry.actorId === actorId && entry.placeId === placeId && entry.feature === feature);
    if (existing) {
      existing.priority = Math.max(existing.priority, priority);
      return;
    }
    this.waiting.push({
      actorId,
      placeId,
      feature,
      requestedAt: now,
      duration,
      priority,
      accessible,
      origin: { ...origin },
    });
  }

  pollGrant(actorId: number): DestinationReservation | undefined {
    const reservation = this.grants.get(actorId);
    if (reservation) this.grants.delete(actorId);
    return reservation;
  }

  arrive(id: number, actorId: number, seconds: number): boolean {
    const reservation = this.reservations.get(id);
    if (!reservation || reservation.actorId !== actorId || reservation.expiresAt <= seconds) return false;
    reservation.arrived = true;
    const slot = this.places.slots.get(reservation.slotId);
    slot?.occupants.add(actorId);
    return true;
  }

  renew(id: number, actorId: number, now: number, duration: number): boolean {
    const reservation = this.reservations.get(id);
    if (!reservation || reservation.actorId !== actorId) return false;
    reservation.expiresAt = Math.max(reservation.expiresAt, now + duration);
    const slot = this.places.slots.get(reservation.slotId);
    if (slot) slot.reservedUntil = Math.max(slot.reservedUntil, reservation.expiresAt);
    return true;
  }

  get(id: number): DestinationReservation | undefined {
    return this.reservations.get(id);
  }

  owns(id: number, actorId: number): boolean {
    return this.reservations.get(id)?.actorId === actorId;
  }

  private findActorReservation(actorId: number, placeId: string, feature: PlaceFeature): DestinationReservation | undefined {
    for (const id of this.actorReservations.get(actorId) ?? []) {
      const reservation = this.reservations.get(id);
      if (reservation?.placeId === placeId && reservation.feature === feature) return reservation;
    }
    return undefined;
  }

  release(id: number): void {
    const reservation = this.reservations.get(id);
    if (!reservation) return;
    this.reservations.delete(id);
    const actorSet = this.actorReservations.get(reservation.actorId);
    actorSet?.delete(id);
    if (actorSet?.size === 0) this.actorReservations.delete(reservation.actorId);
    const slotSet = this.slotReservations.get(reservation.slotId);
    slotSet?.delete(id);
    if (slotSet?.size === 0) this.slotReservations.delete(reservation.slotId);
    const slot = this.places.slots.get(reservation.slotId);
    slot?.occupants.delete(reservation.actorId);
    if (slot) {
      slot.reservedUntil = 0;
      for (const remaining of slotSet ?? []) {
        slot.reservedUntil = Math.max(slot.reservedUntil, this.reservations.get(remaining)?.expiresAt ?? 0);
      }
    }
    if (this.grants.get(reservation.actorId)?.id === id) this.grants.delete(reservation.actorId);
  }

  releaseActor(actorId: number): void {
    const ids = [...(this.actorReservations.get(actorId) ?? [])];
    for (const id of ids) this.release(id);
    for (let index = this.waiting.length - 1; index >= 0; index--) {
      if (this.waiting[index].actorId === actorId) this.waiting.splice(index, 1);
    }
    this.grants.delete(actorId);
  }

  releasePlace(placeId: string): void {
    for (const reservation of this.reservations.values()) {
      if (reservation.placeId === placeId) this.release(reservation.id);
    }
    for (let index = this.waiting.length - 1; index >= 0; index--) {
      if (this.waiting[index].placeId === placeId) this.waiting.splice(index, 1);
    }
  }

  tick(seconds: number): void {
    for (const reservation of this.reservations.values()) {
      if (reservation.expiresAt <= seconds || (!reservation.arrived && reservation.arrivalDeadline <= seconds)) {
        this.release(reservation.id);
      }
    }
    this.waiting.sort((a, b) => {
      const scoreA = a.priority + (seconds - a.requestedAt) / 12;
      const scoreB = b.priority + (seconds - b.requestedAt) / 12;
      return scoreB - scoreA || a.actorId - b.actorId;
    });
    let grantBudget = 4;
    for (let index = 0; index < this.waiting.length && grantBudget > 0;) {
      const entry = this.waiting[index];
      if (seconds - entry.requestedAt > 80) {
        this.waiting.splice(index, 1);
        continue;
      }
      const reservation = this.claim(entry.actorId, entry.placeId, entry.feature, seconds, entry.duration, entry.origin, entry.priority, entry.accessible);
      if (reservation) {
        this.grants.set(entry.actorId, reservation);
        this.waiting.splice(index, 1);
        grantBudget--;
      } else {
        index++;
      }
    }
  }

  availability(placeId: string, feature: PlaceFeature): { free: number; total: number; waiting: number } {
    const place = this.places.get(placeId);
    let free = 0;
    let total = 0;
    for (const slot of place?.slots ?? []) {
      if (slot.kind !== feature) continue;
      total += slot.capacity;
      free += Math.max(0, slot.capacity - (this.slotReservations.get(slot.id)?.size ?? 0));
    }
    const waiting = this.waiting.filter((entry) => entry.placeId === placeId && entry.feature === feature).length;
    return { free, total, waiting };
  }

  reset(): void {
    for (const id of [...this.reservations.keys()]) this.release(id);
    this.waiting.length = 0;
    this.grants.clear();
    this.nextId = 1;
  }

  get size(): number {
    return this.reservations.size;
  }
}
