import { clamp, damping } from "./math";
import { carryingWeight, consumeItem, item, removeItem, setGesture } from "./actions";
import type { Actor, LifeContext, LifeSystem, TaskKind } from "./types";

export class ResidentNeeds implements LifeSystem {
  private readonly lastDay = new Map<number, number>();
  private readonly exhaustionCooldown = new Map<number, number>();

  reset(): void {
    this.lastDay.clear();
    this.exhaustionCooldown.clear();
  }

  tick(context: LifeContext): void {
    for (const actor of context.actors) {
      this.advance(actor, context);
      this.decayMemories(actor, context);
      this.maintainInventory(actor, context);
      this.refreshDay(actor, context);
      this.adjustHealth(actor, context);
      this.recoverWhileResting(actor, context);
    }
  }

  private advance(actor: Actor, context: LifeContext): void {
    const dt = context.time.dt;
    const needs = actor.needs;
    const moving = actor.speed > 0.1;
    const exertion = moving ? actor.speed / Math.max(0.6, actor.baseSpeed) : 0;
    const work = actor.mode === "working" || actor.mode === "assisting";
    const sleeping = actor.interiorId === actor.homeId;
    const ageHunger = actor.age === "child" ? 1.2 : actor.age === "elder" ? 0.85 : 1;
    needs.hunger = clamp(needs.hunger + dt * (0.0014 + exertion * 0.0006) * ageHunger, 0, 1);
    needs.thirst = clamp(needs.thirst + dt * (0.0018 + exertion * 0.0008 + context.weather.heatStress * 0.0012), 0, 1);
    if (!sleeping) {
      const load = carryingWeight(actor);
      const fatigue = (0.00045 + exertion * 0.00065 + (work ? 0.00065 : 0) + load * 0.00006) * dt;
      needs.energy = clamp(needs.energy - fatigue * (actor.age === "elder" ? 1.35 : 1), 0, 1);
    }
    if (actor.mode !== "talking") needs.social = clamp(needs.social + dt * (0.0006 + actor.personality.sociability * 0.001), 0, 1);
    if (actor.mode !== "performing") needs.curiosity = clamp(needs.curiosity + dt * actor.personality.curiosity * 0.0009, 0, 1);
    const timePressure = actor.task && actor.task.deadline > 0
      ? clamp(1 - (actor.task.deadline - context.time.seconds) / 25, 0, 1) : 0;
    needs.urgency = damping(needs.urgency, timePressure, 0.6, dt);
    const queueStress = actor.mode === "queuing" ? (1 - actor.personality.patience) * 0.003 : 0;
    const comfortStress = Math.max(0, 0.45 - needs.comfort) * 0.004;
    const hungerStress = Math.max(0, needs.hunger - 0.8) * 0.004;
    const recovery = actor.mode === "resting" || actor.mode === "seated" ? 0.003 : 0.0005;
    needs.stress = clamp(needs.stress + dt * (queueStress + comfortStress + hungerStress - recovery), 0, 1);
  }

  private recoverWhileResting(actor: Actor, context: LifeContext): void {
    const dt = context.time.dt;
    const needs = actor.needs;
    if (actor.interiorId === actor.homeId) {
      needs.energy = Math.min(1, needs.energy + dt * 0.008);
      needs.hunger = Math.max(0.05, needs.hunger - dt * 0.003);
      needs.thirst = Math.max(0.04, needs.thirst - dt * 0.004);
      needs.comfort = damping(needs.comfort, 0.95, 0.2, dt);
      needs.stress = Math.max(0, needs.stress - dt * 0.005);
      return;
    }
    if (actor.mode === "seated" || actor.mode === "resting" || actor.mode === "riding") {
      needs.energy = Math.min(1, needs.energy + dt * 0.0025);
      actor.fatigueDistance = Math.max(0, actor.fatigueDistance - dt * 1.5);
    }
    if (needs.thirst > 0.8 && actor.mode !== "walking" && item(actor, "cup")) {
      setGesture(actor, "sip", context.time.seconds, 0.7);
      needs.thirst = Math.max(0.1, needs.thirst - dt * 0.03);
      if (needs.thirst < 0.2) consumeItem(actor, "cup", context);
    }
  }

  private adjustHealth(actor: Actor, context: LifeContext): void {
    const stress = actor.needs.stress;
    const fatigue = 1 - actor.needs.energy;
    const mildStrain = stress > 0.9 && fatigue > 0.85;
    actor.health = clamp(actor.health + (mildStrain ? -0.0008 : 0.00015) * context.time.dt, 0.7, 1);
    if (actor.age === "elder" && actor.fatigueDistance > 65 && actor.needs.energy < 0.45) {
      const until = this.exhaustionCooldown.get(actor.id) ?? 0;
      if (context.time.seconds < until || (actor.task && actor.task.priority >= 6)) return;
      const bench = context.places.find(actor, ["bench", "park"], context.time);
      if (bench && context.interruptTask(actor, "reading", bench.id, 4)) {
        this.exhaustionCooldown.set(actor.id, context.time.seconds + 60);
        actor.gesture.emotion = "tired";
      }
    }
  }

  private decayMemories(actor: Actor, context: LifeContext): void {
    if (context.time.tick % 60 !== actor.id % 60) return;
    for (let index = actor.memories.length - 1; index >= 0; index--) {
      const memory = actor.memories[index];
      memory.confidence = Math.exp(-(context.time.seconds - memory.time) / 900);
      if (memory.confidence < 0.1) actor.memories.splice(index, 1);
    }
    for (const relationship of actor.relationships.values()) {
      if (relationship.household) continue;
      if (context.time.seconds - relationship.lastConversation > 300) relationship.familiarity = Math.max(0.1, relationship.familiarity - 0.001);
    }
  }

  private maintainInventory(actor: Actor, context: LifeContext): void {
    if (context.time.tick % 24 !== actor.id % 24) return;
    for (const carried of [...actor.inventory]) {
      if (carried.perishAt < context.time.seconds) {
        carried.condition = Math.max(0, carried.condition - 0.08);
        if (carried.condition <= 0) removeItem(actor, carried.id, context);
      }
      if (carried.kind === "flowers") carried.condition = Math.max(0.25, carried.condition - 0.001 * context.weather.heatStress);
      const prop = context.props.get(carried.propId);
      if (prop) prop.opacity = Math.max(0.75, carried.condition);
    }
  }

  private refreshDay(actor: Actor, context: LifeContext): void {
    if (this.lastDay.get(actor.id) === context.time.day) return;
    this.lastDay.set(actor.id, context.time.day);
    actor.dailySpending = 0;
    const allowance = actor.occupation === "student" ? 15 : actor.occupation === "tourist" ? 95 : 65;
    actor.budget = Math.min(240, actor.budget + allowance);
    actor.fatigueDistance *= 0.2;
    if (actor.needs.energy < 0.55) actor.needs.energy = 0.75;
  }

  score(actor: Actor, kind: TaskKind, context: LifeContext): number {
    const needs = actor.needs;
    switch (kind) {
      case "meal": return needs.hunger * 2.3 + context.time.lunchRush * 0.6;
      case "coffee": return needs.thirst * 1.2 + (1 - needs.energy) * 0.5;
      case "home": return (1 - needs.energy) * 1.6 + (context.time.night ? 0.4 : 0);
      case "conversation": return needs.social * actor.personality.sociability * 1.6;
      case "reading": return (1 - needs.energy) * 0.7 + needs.curiosity * 0.6;
      case "walk": return needs.curiosity * 0.7 + needs.stress * 0.6;
      case "shopping": return Math.max(0, actor.budget - actor.dailySpending) / 150 * 0.5;
      case "exercise": return needs.energy * 0.5 + needs.stress * 0.4;
      case "cycling": return needs.energy * 0.6 + needs.curiosity * 0.4;
      case "shelter": return (1 - needs.comfort) * 2 + actor.wetness;
      case "photo": return needs.curiosity * (actor.occupation === "tourist" ? 1.5 : 0.6);
      default: return 0.2;
    }
  }

  urgentTask(actor: Actor): TaskKind | null {
    if (actor.needs.energy < 0.12) return "home";
    if (actor.needs.hunger > 0.9) return "meal";
    if (actor.needs.thirst > 0.93) return "coffee";
    return null;
  }

  releaseActor(actor: Actor): void {
    this.exhaustionCooldown.delete(actor.id);
  }
}
