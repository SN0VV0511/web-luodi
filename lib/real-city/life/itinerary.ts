import { distance, positiveModulo } from "./math";
import { leaveInterior, rememberedPreference } from "./actions";
import { simulationSecondsForMinutes } from "./clock";
import type { Actor, LifeContext, LifeSystem, ScheduleEntry, TaskKind } from "./types";
import type { PlaceKind, LifePlace } from "./places";
import type { ResidentNeeds } from "./needs";

export class ResidentItineraries implements LifeSystem {
  private readonly failures = new Map<string, number>();

  constructor(private readonly needs: ResidentNeeds) {}

  reset(context: LifeContext): void {
    this.failures.clear();
    for (const actor of context.actors) {
      actor.schedule.length = 0;
      actor.scheduleDay = -1;
      actor.nextDecision = context.time.seconds + actor.id * 0.055;
    }
  }

  tick(context: LifeContext): void {
    for (const actor of context.actors) {
      if (actor.scheduleDay !== context.time.day) this.planDay(actor, context);
      if (actor.nextDecision > context.time.seconds) continue;
      actor.nextDecision = context.time.seconds + 1.1 + actor.id % 5 * 0.17;
      actor.lastDecision = context.time.seconds;
      if (actor.vehicleId >= 0 || actor.conversationId >= 0) continue;
      if (actor.task && actor.task.priority >= 5) continue;
      if (this.assignDueSchedule(actor, context)) continue;
      if (actor.task) continue;
      if (actor.serviceCooldown > context.time.seconds) continue;
      if (actor.interiorId) leaveInterior(actor, context);
      if (this.assignUrgentNeed(actor, context)) continue;
      if (this.assignOccupation(actor, context)) continue;
      if (this.assignLeisure(actor, context)) continue;
      this.assignFallback(actor, context);
    }
  }

  private addSchedule(actor: Actor, kind: TaskKind, minute: number, duration: number, venueId: string, priority: number, flexibility: number, day: number): void {
    actor.schedule.push({
      kind,
      minute: positiveModulo(minute, 1440),
      duration,
      venueId,
      priority,
      flexible: flexibility,
      day,
      completed: false,
    });
  }

  private planDay(actor: Actor, context: LifeContext): void {
    actor.schedule.length = 0;
    actor.scheduleDay = context.time.day;
    const day = context.time.day;
    const jitter = (actor.id % 7 - 3) * (1 - actor.personality.punctuality) * 6;
    const weekend = context.time.weekend;
    const nearestMeal = this.findVenue(actor, ["restaurant", "cafe"], context);
    const nearestShop = this.findVenue(actor, ["grocery"], context);
    const park = this.findVenue(actor, ["park", "promenade"], context);
    if (actor.occupation === "office") {
      if (!weekend) {
        this.addSchedule(actor, "work", 8.2 * 60 + jitter, 185, actor.workplaceId, 5, 28, day);
        if (nearestMeal) this.addSchedule(actor, "meal", 12 * 60 + jitter, 35, nearestMeal.id, 4, 40, day);
        this.addSchedule(actor, "work", 13.1 * 60 + jitter, 215, actor.workplaceId, 5, 35, day);
        if (nearestShop) this.addSchedule(actor, "shopping", 17.9 * 60 + jitter, 25, nearestShop.id, 3, 55, day);
        this.addSchedule(actor, "home", 19.3 * 60 + jitter, 240, actor.homeId, 4, 90, day);
      } else {
        if (park) this.addSchedule(actor, "walk", 9.6 * 60 + jitter, 50, park.id, 2, 70, day);
        if (nearestShop) this.addSchedule(actor, "shopping", 14 * 60 + jitter, 35, nearestShop.id, 2, 90, day);
      }
    } else if (actor.occupation === "student") {
      if (!weekend) {
        this.addSchedule(actor, "school", 7.9 * 60, 360, "civic-school", 6, 35, day);
        this.addSchedule(actor, "pickup", 15.6 * 60, 45, "civic-school", 6, 70, day);
      } else if (park) {
        this.addSchedule(actor, "exercise", 10 * 60, 40, park.id, 2, 90, day);
      }
      this.addSchedule(actor, "home", 18.5 * 60, 300, actor.homeId, 5, 90, day);
    } else if (actor.occupation === "parent") {
      if (!weekend) {
        this.addSchedule(actor, "pickup", 7.7 * 60, 35, "civic-school", 6, 45, day);
        this.addSchedule(actor, "pickup", 15.5 * 60, 45, "civic-school", 6, 70, day);
      }
      if (nearestShop) this.addSchedule(actor, "shopping", 10.2 * 60 + jitter, 35, nearestShop.id, 3, 75, day);
      this.addSchedule(actor, "home", 18 * 60, 180, actor.homeId, 4, 120, day);
    } else if (actor.occupation === "retired") {
      if (park) {
        this.addSchedule(actor, "exercise", 7.6 * 60 + jitter, 40, park.id, 2, 70, day);
        this.addSchedule(actor, "chess", 10.3 * 60 + jitter, 55, park.id, 2, 90, day);
        this.addSchedule(actor, "walk", 16 * 60 + jitter, 45, park.id, 2, 80, day);
      }
      if (nearestMeal) this.addSchedule(actor, "meal", 11.7 * 60, 40, nearestMeal.id, 3, 50, day);
      this.addSchedule(actor, "home", 19 * 60, 240, actor.homeId, 4, 90, day);
    } else if (actor.occupation === "tourist") {
      if (park) {
        this.addSchedule(actor, "photo", 9 * 60 + jitter, 50, park.id, 2, 90, day);
        this.addSchedule(actor, "music", 15.5 * 60 + jitter, 45, park.id, 2, 100, day);
      }
      if (nearestMeal) this.addSchedule(actor, "meal", 12.5 * 60 + jitter, 50, nearestMeal.id, 3, 60, day);
      this.addSchedule(actor, "home", 21 * 60, 240, actor.homeId, 3, 90, day);
    } else {
      const start = actor.occupation === "retail" || actor.occupation === "cook" ? 7 : 6.5;
      const end = actor.occupation === "retail" || actor.occupation === "cook" ? 20 : 17;
      this.addSchedule(actor, "work", start * 60 + jitter, 220, actor.workplaceId, 4, 90, day);
      if (nearestMeal) this.addSchedule(actor, "meal", 11.3 * 60 + jitter, 35, nearestMeal.id, 3, 70, day);
      this.addSchedule(actor, "work", 13.2 * 60 + jitter, 180, actor.workplaceId, 4, 90, day);
      this.addSchedule(actor, "home", end * 60 + jitter, 240, actor.homeId, 4, 120, day);
    }
    actor.schedule.sort((a, b) => a.minute - b.minute);
    for (const entry of actor.schedule) {
      if (context.time.minute > entry.minute + entry.flexible + entry.duration) entry.completed = true;
    }
  }

  private assignDueSchedule(actor: Actor, context: LifeContext): boolean {
    let selected: ScheduleEntry | undefined;
    for (const entry of actor.schedule) {
      if (entry.completed || entry.day !== context.time.day) continue;
      const delta = context.time.minute - entry.minute;
      if (delta < -entry.flexible * 0.35) continue;
      if (delta > entry.flexible + entry.duration) {
        entry.completed = true;
        continue;
      }
      if (!selected || entry.priority > selected.priority || (entry.priority === selected.priority && entry.minute < selected.minute)) selected = entry;
    }
    if (!selected) return false;
    if (actor.task && actor.task.kind === selected.kind && actor.task.venueId === selected.venueId) return true;
    if (actor.task && actor.task.priority >= selected.priority) return false;
    const venue = context.places.get(selected.venueId);
    if (!venue) {
      selected.completed = true;
      return false;
    }
    if (actor.interiorId) leaveInterior(actor, context);
    const commute = selected.kind === "work" && distance(actor.position, venue.entrance) > 105;
    const kind = commute ? "commute" : selected.kind;
    const issued = actor.task
      ? context.interruptTask(actor, kind, selected.venueId, selected.priority)
      : context.issueTask(actor, kind, selected.venueId, selected.priority);
    if (!issued || !actor.task) return false;
    selected.completed = true;
    actor.task.payload = selected.duration;
    actor.task.deadline = context.time.seconds + Math.max(90, simulationSecondsForMinutes(selected.duration + selected.flexible));
    actor.task.option = commute ? selected.kind : "scheduled";
    return true;
  }

  private assignUrgentNeed(actor: Actor, context: LifeContext): boolean {
    const kind = this.needs.urgentTask(actor);
    if (!kind) return false;
    if (kind === "home") return context.issueTask(actor, kind, actor.homeId, 4);
    const places: PlaceKind[] = kind === "meal" ? ["restaurant", "cafe"] : ["cafe", "restaurant", "grocery"];
    const venue = this.findVenue(actor, places, context);
    return venue ? context.issueTask(actor, kind, venue.id, 4) : false;
  }

  private assignOccupation(actor: Actor, context: LifeContext): boolean {
    if (context.time.hour < 6 || context.time.hour > 21) return false;
    const occupation = actor.occupation;
    if (occupation === "courier") return context.issueTask(actor, "delivery", "service-depot", 3);
    if (occupation === "cleaner") return context.issueTask(actor, "cleaning", "service-depot", 3);
    if (occupation === "gardener") {
      const park = this.findVenue(actor, ["park"], context);
      return park ? context.issueTask(actor, "gardening", park.id, 3) : false;
    }
    if (occupation === "technician") return context.issueTask(actor, "repair", "repair-workshop", 3);
    if (occupation === "officer") return context.issueTask(actor, "patrol", "civic-police", 3);
    if (occupation === "medic") return context.issueTask(actor, "medical", "civic-clinic", 3);
    if (occupation === "teacher" && !context.time.weekend && context.time.hour < 17) return context.issueTask(actor, "school", "civic-school", 4);
    if ((occupation === "retail" || occupation === "cook") && context.time.hour < 20) return context.issueTask(actor, "work", actor.workplaceId, 3);
    return false;
  }

  private assignLeisure(actor: Actor, context: LifeContext): boolean {
    if (actor.age === "child") return false;
    const candidates: { kind: TaskKind; venues: PlaceKind[]; score: number }[] = [];
    const add = (kind: TaskKind, venues: PlaceKind[], bonus = 0) => {
      const score = this.needs.score(actor, kind, context) + bonus;
      if (score > 0.15) candidates.push({ kind, venues, score });
    };
    add("meal", ["restaurant", "cafe"], -0.3);
    add("coffee", ["cafe"], -0.2);
    add("shopping", ["grocery", "bookshop", "florist"]);
    add("reading", ["bench", "park"]);
    add("conversation", ["park", "promenade", "cafe"]);
    if (context.weather.outdoorComfort > 0.45) {
      add("walk", ["park", "promenade"]);
      add("exercise", ["park", "sports"], actor.age === "elder" ? 0.2 : 0);
      add("photo", ["promenade", "park"], actor.occupation === "tourist" ? 0.4 : -0.2);
      add("dog", ["park", "promenade"], actor.id % 11 === 0 ? 0.3 : -0.3);
      if (actor.age === "adult" && actor.mobility === "ordinary" && actor.id % 7 === 0) add("cycling", ["park"], 0.45);
    }
    candidates.sort((a, b) => b.score - a.score);
    for (const candidate of candidates.slice(0, 4)) {
      if (!actor.random.probability(Math.min(0.9, candidate.score * 0.55))) continue;
      const venue = this.findVenue(actor, candidate.venues, context);
      if (!venue) continue;
      if (context.issueTask(actor, candidate.kind, venue.id, 1)) return true;
    }
    return false;
  }

  private assignFallback(actor: Actor, context: LifeContext): void {
    if (actor.age === "child") {
      const guardian = context.actorById.get(actor.guardianId);
      if (guardian?.task) {
        context.issueTask(actor, "walk", guardian.task.venueId, 1);
        return;
      }
    }
    if (context.time.night || actor.needs.energy < 0.35) {
      context.issueTask(actor, "home", actor.homeId, 1);
      return;
    }
    const place = this.findVenue(actor, ["park", "promenade", "bench"], context);
    if (place) context.issueTask(actor, "walk", place.id, 0);
    else actor.nextDecision = context.time.seconds + 8;
  }

  private findVenue(actor: Actor, kinds: readonly PlaceKind[], context: LifeContext): LifePlace | undefined {
    let best: LifePlace | undefined;
    let bestScore = Infinity;
    for (const kind of kinds) {
      for (const place of context.places.ofKind(kind)) {
        if (!context.places.isOpen(place, context.time) || !context.places.hasCapacity(place)) continue;
        if ((this.failures.get(`${actor.id}:${place.id}`) ?? 0) > context.time.seconds) continue;
        if (!context.routes.isReachable(actor.position, place.entrance)) continue;
        const travel = context.routes.estimate(actor.position, place.entrance, actor.baseSpeed);
        const preference = rememberedPreference(actor, place.id);
        const crowd = place.occupants.size / place.capacity;
        const score = travel + crowd * 14 - preference * 12 - place.popularity * 3;
        if (score < bestScore) {
          best = place;
          bestScore = score;
        }
      }
    }
    return best;
  }

  recordFailure(actor: Actor, placeId: string, context: LifeContext): void {
    this.failures.set(`${actor.id}:${placeId}`, context.time.seconds + 45);
  }

  releaseActor(actor: Actor): void {
    actor.nextDecision += 0.75;
  }
}
