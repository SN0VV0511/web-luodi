import { clamp, distance, localPoint, point, type Point2 } from "./math";
import { arrived, changePhase, consumeItem, facePoint, finishSatisfied, goTo, item, remember, setGesture, stopWalking } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem, TaskKind } from "./types";

interface Household {
  id: number;
  homeId: string;
  members: number[];
  adults: number[];
  children: number[];
  pantry: number;
  water: number;
  flowers: number;
  books: number;
  parcels: number;
  groceryBuyer: number;
  nextShopping: number;
  lastMeal: number;
  lastGathering: number;
  lastDay: number;
  preparedMeals: number;
  satisfaction: number;
  dailyConsumption: number;
}

interface FamilyWalk {
  id: number;
  householdId: number;
  leaderId: number;
  members: number[];
  destination: string;
  origin: string;
  target: Point2;
  startedAt: number;
  endsAt: number;
  phase: "meet" | "outbound" | "pause" | "return";
  phaseUntil: number;
  eventId: number;
  originalPaces: Map<number, number>;
  lastRally: number;
}

export class NeighborhoodHouseholds implements LifeSystem {
  private readonly households = new Map<number, Household>();
  private readonly walks = new Map<number, FamilyWalk>();
  private readonly actorWalks = new Map<number, number>();
  private nextWalk = 1;
  private nextCoordination = 9;
  private readonly target = point();
  private readonly releasing = new Set<number>();

  reset(context: LifeContext): void {
    this.households.clear();
    this.walks.clear();
    this.actorWalks.clear();
    this.releasing.clear();
    this.nextWalk = 1;
    this.nextCoordination = context.time.seconds + 9;
    for (const actor of context.actors) {
      let household = this.households.get(actor.household);
      if (!household) {
        household = {
          id: actor.household,
          homeId: actor.homeId,
          members: [],
          adults: [],
          children: [],
          pantry: 6,
          water: 12,
          flowers: 0,
          books: 0,
          parcels: 0,
          groceryBuyer: -1,
          nextShopping: context.time.seconds + 40 + actor.household % 7 * 8,
          lastMeal: -100,
          lastGathering: -100,
          lastDay: context.time.day,
          preparedMeals: 0,
          satisfaction: 0.7,
          dailyConsumption: 0,
        };
        this.households.set(actor.household, household);
      }
      household.members.push(actor.id);
      if (actor.age === "child") household.children.push(actor.id);
      else household.adults.push(actor.id);
    }
  }

  tick(context: LifeContext): void {
    this.homeSupplies(context);
    this.familyMeals(context);
    if (context.time.seconds >= this.nextCoordination) {
      this.nextCoordination = context.time.seconds + 11;
      this.coordinateShopping(context);
      this.coordinateWalks(context);
    }
    for (const walk of [...this.walks.values()]) this.walkTick(walk, context);
    for (const actor of context.actors) {
      if (actor.task?.option === "household-walk") this.memberTick(actor, actor.task, context);
    }
  }

  private homeSupplies(context: LifeContext): void {
    if (context.time.tick % 12 !== 0) return;
    for (const actor of context.actors) {
      const household = this.households.get(actor.household);
      if (!household || actor.interiorId !== household.homeId) continue;
      const groceries = item(actor, "grocery");
      if (groceries) {
        household.pantry = Math.min(36, household.pantry + groceries.quantity * 4);
        household.water = Math.min(40, household.water + groceries.quantity * 3);
        consumeItem(actor, "grocery", context, groceries.quantity);
        household.groceryBuyer = -1;
        household.nextShopping = context.time.seconds + 100;
        remember(actor, "groceries-brought-home", household.homeId, context, 0.35);
      }
      const flowers = item(actor, "flowers");
      if (flowers) {
        household.flowers = Math.min(3, household.flowers + flowers.quantity);
        consumeItem(actor, "flowers", context, flowers.quantity);
        household.satisfaction = clamp(household.satisfaction + 0.04, 0, 1);
      }
      const parcel = item(actor, "parcel");
      if (parcel) {
        household.parcels += parcel.quantity;
        consumeItem(actor, "parcel", context, parcel.quantity);
        household.satisfaction = clamp(household.satisfaction + 0.025, 0, 1);
      }
      const home = context.places.get(household.homeId);
      if (home) {
        home.stock.set("household-food", household.pantry);
        home.stock.set("household-water", household.water);
        home.stock.set("household-flowers", household.flowers);
      }
    }
    for (const household of this.households.values()) {
      if (household.lastDay !== context.time.day) {
        household.lastDay = context.time.day;
        household.dailyConsumption = 0;
        household.flowers = Math.max(0, household.flowers - 0.25);
        household.water = Math.min(40, household.water + 5);
        household.satisfaction = clamp(household.satisfaction * 0.98 + 0.01, 0, 1);
      }
      if (household.groceryBuyer >= 0) {
        const buyer = context.actorById.get(household.groceryBuyer);
        if (!buyer || buyer.task?.kind !== "shopping" && !item(buyer, "grocery")) household.groceryBuyer = -1;
      }
    }
  }

  private familyMeals(context: LifeContext): void {
    for (const household of this.households.values()) {
      if (context.time.seconds - household.lastMeal < 30 || household.pantry <= 0) continue;
      const atHome = household.members.map((id) => context.actorById.get(id)).filter((actor): actor is Actor => !!actor && actor.interiorId === household.homeId);
      const hungry = atHome.filter((actor) => actor.needs.hunger > 0.4);
      if (hungry.length === 0) continue;
      const portions = Math.min(household.pantry, hungry.length);
      household.pantry -= portions;
      household.dailyConsumption += portions;
      household.preparedMeals += portions;
      household.lastMeal = context.time.seconds;
      for (let index = 0; index < portions; index++) {
        const actor = hungry[index];
        actor.needs.hunger = Math.max(0.1, actor.needs.hunger - 0.35);
        if (household.water > 0) {
          actor.needs.thirst = Math.max(0.1, actor.needs.thirst - 0.2);
          household.water = Math.max(0, household.water - 0.5);
        }
        if (atHome.length > 1) actor.needs.social = Math.max(0, actor.needs.social - 0.1);
        remember(actor, "shared-home-meal", household.homeId, context, 0.3);
      }
      if (hungry.length > 1) household.satisfaction = clamp(household.satisfaction + 0.025, 0, 1);
    }
  }

  private coordinateShopping(context: LifeContext): void {
    if (context.time.hour < 8 || context.time.hour > 20) return;
    for (const household of this.households.values()) {
      if (household.groceryBuyer >= 0 || household.nextShopping > context.time.seconds || household.pantry >= household.members.length * 2) continue;
      const buyer = household.adults.map((id) => context.actorById.get(id)).filter((actor): actor is Actor => !!actor)
        .filter((actor) => actor.vehicleId < 0 && actor.conversationId < 0 && (!actor.task || actor.task.priority < 3) && actor.budget >= 16)
        .sort((a, b) => b.needs.energy - a.needs.energy || a.dailySpending - b.dailySpending)[0];
      if (!buyer) continue;
      const shop = context.places.find(buyer, ["grocery"], context.time);
      if (!shop) continue;
      const issued = buyer.task ? context.interruptTask(buyer, "shopping", shop.id, 3) : context.issueTask(buyer, "shopping", shop.id, 3);
      if (issued) {
        household.groceryBuyer = buyer.id;
        household.nextShopping = context.time.seconds + 90;
        if (buyer.task) buyer.task.option = "household-groceries";
      }
    }
  }

  private coordinateWalks(context: LifeContext): void {
    if (this.walks.size >= 3 || context.weather.outdoorComfort < 0.55) return;
    const suitableTime = context.time.weekend ? context.time.hour > 9 && context.time.hour < 18 : context.time.hour > 17 && context.time.hour < 20;
    if (!suitableTime) return;
    for (const household of this.households.values()) {
      if (household.members.length < 2 || context.time.seconds - household.lastGathering < 180) continue;
      const available = household.members.map((id) => context.actorById.get(id)).filter((actor): actor is Actor => !!actor && this.canWalk(actor, context));
      const leader = available.find((actor) => actor.age === "adult");
      if (!leader || available.length < 2) continue;
      const destination = context.places.find(leader, ["park", "promenade"], context.time);
      if (!destination || distance(leader.position, destination.entrance) > 90) continue;
      const members = available.filter((actor) => distance(actor.position, leader.position) < 15).slice(0, 4);
      if (members.length < 2) continue;
      if (this.beginWalk(household, leader, members, destination.id, context)) break;
    }
  }

  private canWalk(actor: Actor, context: LifeContext): boolean {
    if (!actor.visible || actor.vehicleId >= 0 || actor.conversationId >= 0 || actor.groupId >= 0) return false;
    if (actor.task && actor.task.priority >= 3) return false;
    if (actor.needs.hunger > 0.7 || actor.needs.energy < 0.35 || actor.serviceCooldown > context.time.seconds) return false;
    return !this.actorWalks.has(actor.id);
  }

  private beginWalk(household: Household, leader: Actor, members: Actor[], destination: string, context: LifeContext): boolean {
    const place = context.places.get(destination);
    if (!place) return false;
    const id = this.nextWalk++;
    const walk: FamilyWalk = {
      id,
      householdId: household.id,
      leaderId: leader.id,
      members: [],
      destination,
      origin: household.homeId,
      target: { ...place.entrance },
      startedAt: context.time.seconds,
      endsAt: context.time.seconds + 140,
      phase: "meet",
      phaseUntil: context.time.seconds + 15,
      eventId: -1,
      originalPaces: new Map(),
      lastRally: 0,
    };
    for (const actor of members) {
      const issued = actor.task ? context.interruptTask(actor, "walk", destination, 3) : context.issueTask(actor, "walk", destination, 3);
      if (!issued || !actor.task) continue;
      actor.task.option = "household-walk";
      actor.task.phase = "family-walk";
      actor.task.serviceId = id;
      actor.task.partnerId = leader.id;
      actor.task.deadline = walk.endsAt + 30;
      actor.groupId = id + 30000;
      walk.members.push(actor.id);
      walk.originalPaces.set(actor.id, actor.baseSpeed);
      this.actorWalks.set(actor.id, id);
    }
    if (walk.members.length < 2) {
      for (const id of walk.members) {
        const actor = context.actorById.get(id);
        if (actor) context.completeTask(actor, false);
      }
      return false;
    }
    this.walks.set(id, walk);
    household.lastGathering = context.time.seconds;
    walk.eventId = context.events.publish(`family-walk-${id}`, "social",
      { zh: "一家人结伴去公园散步", en: "A family takes a walk together" },
      { zh: "家人先集合，按最慢成员的速度前行；有人落后时停下等候，在公园休息后一起返回。", en: "The family gathers, walks at the slowest member's pace, waits for anyone who falls behind and returns after a park break." },
      leader.position, context.time.seconds, 150, walk.members, 2);
    return true;
  }

  private walkTick(walk: FamilyWalk, context: LifeContext): void {
    const leader = context.actorById.get(walk.leaderId);
    const members = walk.members.map((id) => context.actorById.get(id)).filter((actor): actor is Actor => !!actor && actor.task?.option === "household-walk");
    if (!leader || members.length < 2 || context.time.seconds > walk.endsAt) {
      this.finishWalk(walk, context);
      return;
    }
    const slowest = Math.min(...members.map((actor) => walk.originalPaces.get(actor.id) ?? actor.baseSpeed));
    for (const actor of members) actor.baseSpeed = slowest * (actor.id === leader.id ? 0.95 : 1.05);
    const farthest = Math.max(...members.map((actor) => distance(actor.position, leader.position)));
    if (walk.phase === "meet") {
      stopWalking(leader, "waiting");
      setGesture(leader, "wave", context.time.seconds, 0.5);
      if (farthest < 2.5) {
        walk.phase = "outbound";
        walk.phaseUntil = context.time.seconds + 80;
      } else if (context.time.seconds > walk.phaseUntil) this.finishWalk(walk, context);
    } else if (walk.phase === "outbound" || walk.phase === "return") {
      const destination = walk.phase === "return" ? context.places.get(walk.origin)?.entrance : walk.target;
      if (!destination) {
        this.finishWalk(walk, context);
        return;
      }
      if (farthest > 3.2) {
        stopWalking(leader, "waiting");
        if (context.time.seconds - walk.lastRally > 5) {
          walk.lastRally = context.time.seconds;
          setGesture(leader, "wave", context.time.seconds, 0.5);
        }
      } else goTo(leader, destination, context, 3);
      if (arrived(leader, destination, 1) && farthest < 2.5) {
        if (walk.phase === "return") this.finishWalk(walk, context);
        else {
          walk.phase = "pause";
          walk.phaseUntil = context.time.seconds + 16;
        }
      }
    } else {
      stopWalking(leader, "resting");
      setGesture(leader, "talk", context.time.seconds, 0.5);
      if (context.time.seconds >= walk.phaseUntil) walk.phase = "return";
    }
    const progress = walk.phase === "meet" ? 0.05 : walk.phase === "outbound" ? 0.3 : walk.phase === "pause" ? 0.6 : 0.8;
    context.events.update(walk.eventId, leader.position, progress, context.time.seconds, walk.phase);
  }

  private memberTick(actor: Actor, task: ActorTask, context: LifeContext): void {
    const walk = this.walks.get(this.actorWalks.get(actor.id) ?? -1);
    const leader = walk ? context.actorById.get(walk.leaderId) : undefined;
    if (!walk || !leader) {
      context.completeTask(actor, false);
      return;
    }
    if (actor.id === leader.id) return;
    const index = walk.members.indexOf(actor.id);
    if (walk.phase === "pause") {
      localPoint(leader.position, leader.heading, (index % 2 ? -1 : 1) * 0.9, index > 1 ? -0.6 : 0.2, this.target);
      goTo(actor, this.target, context, 3);
      if (arrived(actor, this.target, 0.4)) {
        stopWalking(actor, "talking");
        facePoint(actor, leader.position);
        setGesture(actor, index % 2 ? "listen" : "talk", context.time.seconds, 0.4);
        actor.needs.energy = clamp(actor.needs.energy + context.time.dt * 0.0015, 0, 1);
      }
    } else {
      localPoint(leader.position, leader.heading, index % 2 ? -0.65 : 0.65, -0.7 * Math.ceil(index / 2), this.target);
      if (distance(actor.position, this.target) > 0.4) goTo(actor, this.target, context, 3);
      else if (leader.speed < 0.1) stopWalking(actor, "waiting");
    }
    actor.needs.social = clamp(actor.needs.social - context.time.dt * 0.0018, 0, 1);
    actor.needs.stress = clamp(actor.needs.stress - context.time.dt * 0.001, 0, 1);
    task.progress = leader.task?.progress ?? 0;
  }

  private finishWalk(walk: FamilyWalk, context: LifeContext): void {
    this.walks.delete(walk.id);
    const household = this.households.get(walk.householdId);
    if (household) household.satisfaction = clamp(household.satisfaction + 0.04, 0, 1);
    context.events.finish(walk.eventId, context.time.seconds);
    for (const id of walk.members) {
      const actor = context.actorById.get(id);
      this.actorWalks.delete(id);
      if (!actor) continue;
      actor.baseSpeed = walk.originalPaces.get(id) ?? actor.baseSpeed;
      actor.groupId = -1;
      actor.serviceCooldown = context.time.seconds + 12;
      remember(actor, "family-walk", walk.destination, context, 0.4, walk.leaderId, walk.eventId);
      if (actor.task?.option === "household-walk" && !this.releasing.has(id)) {
        this.releasing.add(id);
        finishSatisfied(actor, context, "family-outing-completed", 0.35);
        this.releasing.delete(id);
      }
    }
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    if (this.releasing.has(actor.id)) return;
    const walk = this.walks.get(this.actorWalks.get(actor.id) ?? -1);
    if (!walk) return;
    if (walk.leaderId === actor.id) {
      this.releasing.add(actor.id);
      this.finishWalk(walk, context);
      this.releasing.delete(actor.id);
    } else {
      walk.members = walk.members.filter((id) => id !== actor.id);
      actor.baseSpeed = walk.originalPaces.get(actor.id) ?? actor.baseSpeed;
      this.actorWalks.delete(actor.id);
    }
  }
}
