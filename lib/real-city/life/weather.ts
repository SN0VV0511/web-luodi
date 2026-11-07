import { sampleEarthWind } from "../../city-physics";
import type { SeasonState } from "../../city-seasons";
import { clamp, damping, distance, lerp, smoothstep } from "./math";
import { addItem, goTo, item, removeItem, reserve, setGesture, stopWalking, useReservation } from "./actions";
import type { Actor, LifeContext, LifeSystem, LifeWeather } from "./types";

export function createLifeWeather(): LifeWeather {
  return {
    season: "spring",
    temperature: 19,
    precipitation: 0,
    windX: 0,
    windZ: 0,
    gust: 0,
    visibility: 1,
    wetGround: 0,
    snow: 0,
    heatStress: 0,
    coldStress: 0,
    outdoorComfort: 1,
  };
}

export class ResidentWeather implements LifeSystem {
  private input: SeasonState | undefined;
  private readonly exposure = new Map<number, number>();
  private readonly umbrellaDecisions = new Map<number, number>();
  private readonly shelterAttempts = new Map<number, number>();
  private lastSeason: SeasonState["season"] = "spring";

  setSeason(input: SeasonState): void {
    this.input = input;
  }

  reset(context: LifeContext): void {
    this.exposure.clear();
    this.umbrellaDecisions.clear();
    this.shelterAttempts.clear();
    this.lastSeason = this.input?.season ?? "spring";
    Object.assign(context.weather, createLifeWeather());
    if (this.input) this.updateWeather(context);
  }

  tick(context: LifeContext): void {
    this.updateWeather(context);
    for (const actor of context.actors) {
      this.updateExposure(actor, context);
      this.updateClothing(actor, context);
      this.updateUmbrella(actor, context);
      this.updateThermalComfort(actor, context);
      if (actor.task?.kind === "shelter") this.runShelterTask(actor, context);
      else this.considerShelter(actor, context);
    }
    this.lastSeason = context.weather.season;
  }

  private updateWeather(context: LifeContext): void {
    if (!this.input) return;
    const state = this.input;
    const weather = context.weather;
    const dt = context.time.dt;
    const wind = sampleEarthWind(context.time.seconds, 0, 0, state.season);
    weather.season = state.season;
    weather.temperature = state.temperatureC - (context.time.night ? 4 : 0);
    weather.precipitation = clamp(state.precipitation, 0, 1);
    weather.windX = wind.x;
    weather.windZ = wind.z;
    weather.gust = Math.hypot(wind.x, wind.z);
    weather.snow = damping(weather.snow, state.season === "winter" ? state.groundCoverOpacity : 0, 0.12, dt);
    const wetTarget = weather.precipitation * 0.95 + weather.snow * 0.2;
    weather.wetGround = damping(weather.wetGround, wetTarget, wetTarget > weather.wetGround ? 0.12 : 0.015, dt);
    weather.visibility = clamp(1 - weather.precipitation * 0.3 - weather.snow * 0.16, 0.4, 1);
    weather.heatStress = clamp((weather.temperature - 26) / 11, 0, 1);
    weather.coldStress = clamp((9 - weather.temperature + weather.gust * 0.7) / 18, 0, 1);
    weather.outdoorComfort = clamp(1 - weather.heatStress * 0.55 - weather.coldStress * 0.45
      - weather.precipitation * 0.5 - Math.max(0, weather.gust - 4) * 0.035, 0.12, 1);
  }

  private updateExposure(actor: Actor, context: LifeContext): void {
    const dt = context.time.dt;
    let shelter = actor.interiorId || actor.vehicleId >= 0 ? 1 : 0;
    if (shelter < 1) {
      for (const place of context.places.all) {
        if (place.covered <= shelter) continue;
        const separation = distance(actor.position, place.entrance);
        if (separation > 3.5) continue;
        shelter = Math.max(shelter, place.covered * (1 - smoothstep((separation - 1) / 2.5)));
      }
      shelter = Math.max(shelter, actor.umbrellaOpen * 0.8);
    }
    actor.shelterScore = damping(actor.shelterScore, shelter, 3.5, dt);
    const exposedRain = context.weather.precipitation * (1 - actor.shelterScore);
    const soaking = exposedRain * dt * 0.018;
    const drying = (0.0015 + context.weather.gust * 0.0004 + Math.max(0, context.weather.temperature - 16) * 0.0002) * dt;
    actor.wetness = clamp(actor.wetness + soaking - drying, 0, 1);
    const previous = this.exposure.get(actor.id) ?? 0;
    this.exposure.set(actor.id, Math.max(0, previous + (exposedRain > 0.15 ? dt : -dt * 0.7)));
  }

  private updateClothing(actor: Actor, context: LifeContext): void {
    const winter = context.weather.temperature < 9;
    if (winter !== actor.appearance.winterCoat) {
      actor.appearance.winterCoat = winter;
      actor.appearance.coatLength = winter ? 0.74 : actor.occupation === "office" ? 0.66 : 0.56;
      actor.appearance.sleeveLength = winter || context.weather.temperature < 18 ? 1 : 0.68;
    }
    if (this.lastSeason !== context.weather.season && actor.age === "elder") {
      actor.appearance.hat = winter || context.weather.season === "summer";
    }
  }

  private updateUmbrella(actor: Actor, context: LifeContext): void {
    const now = context.time.seconds;
    const existing = item(actor, "umbrella");
    const suitable = actor.age !== "child" && actor.occupation !== "cleaner" && actor.occupation !== "gardener"
      && actor.vehicleId < 0 && !actor.interiorId;
    const wantsUmbrella = suitable && context.weather.precipitation > 0.18 && actor.shelterScore < 0.9;
    const nextDecision = this.umbrellaDecisions.get(actor.id) ?? 0;
    if (now >= nextDecision) {
      this.umbrellaDecisions.set(actor.id, now + 2 + actor.personality.caution * 2);
      if (wantsUmbrella && !existing) {
        addItem(actor, "umbrella", context, 1, "left-hand", actor.id % 2 ? "#586c73" : "#766b62");
      }
    }
    const carried = item(actor, "umbrella");
    actor.umbrellaOpen = damping(actor.umbrellaOpen, carried && wantsUmbrella ? 1 : 0, 2.8, context.time.dt);
    if (carried) {
      const prop = context.props.get(carried.propId);
      if (prop) {
        prop.visible = actor.visible && actor.vehicleId < 0;
        prop.progress = actor.umbrellaOpen;
      }
      if (actor.umbrellaOpen > 0.4 && actor.mode === "walking") setGesture(actor, "umbrella", now, actor.umbrellaOpen);
      if (!wantsUmbrella && actor.umbrellaOpen < 0.02 && context.weather.precipitation < 0.08) removeItem(actor, carried.id, context);
    }
  }

  private updateThermalComfort(actor: Actor, context: LifeContext): void {
    const weather = context.weather;
    const indoors = Boolean(actor.interiorId || actor.vehicleId >= 0);
    const insulation = actor.appearance.winterCoat ? 0.8 : 0.32;
    const activityWarmth = Math.min(0.18, actor.speed * 0.07);
    const dampPenalty = actor.wetness * 0.35;
    const targetWarmth = indoors ? 0.8 : clamp(0.65 + insulation * weather.coldStress + activityWarmth
      - weather.coldStress * 0.8 - dampPenalty, 0.05, 1);
    actor.warmth = damping(actor.warmth, targetWarmth, 0.1, context.time.dt);
    const desiredComfort = indoors ? 0.9 : weather.outdoorComfort * (1 - actor.wetness * 0.5);
    actor.needs.comfort = damping(actor.needs.comfort, desiredComfort, 0.06, context.time.dt);
    if (!indoors && weather.heatStress > 0.2) actor.needs.thirst = clamp(actor.needs.thirst + weather.heatStress * context.time.dt * 0.0025, 0, 1);
    if (actor.warmth < 0.25) actor.needs.stress = clamp(actor.needs.stress + context.time.dt * 0.001, 0, 1);
  }

  private considerShelter(actor: Actor, context: LifeContext): void {
    if (!actor.visible || actor.interiorId || actor.vehicleId >= 0) return;
    if (actor.task && actor.task.priority >= 6) return;
    if (actor.occupation === "cleaner" || actor.occupation === "gardener" || actor.occupation === "medic") return;
    const exposure = this.exposure.get(actor.id) ?? 0;
    if (actor.needs.comfort >= 0.28 && exposure <= 16) return;
    const previousAttempt = this.shelterAttempts.get(actor.id) ?? -100;
    if (context.time.seconds - previousAttempt < 15) return;
    this.shelterAttempts.set(actor.id, context.time.seconds);
    const place = context.places.find(actor, ["bus-stop", "cafe", "office", "park"], context.time,
      (candidate) => candidate.covered > 0.65 && distance(candidate.entrance, actor.position) < 40);
    if (place) context.interruptTask(actor, "shelter", place.id, 5);
  }

  private runShelterTask(actor: Actor, context: LifeContext): void {
    const task = actor.task!;
    const place = context.places.get(task.venueId);
    if (!place) {
      context.completeTask(actor, false);
      return;
    }
    if (task.phase === "start") {
      const reservation = reserve(actor, place, "shelter", context, 60, 2);
      task.reservationId = reservation?.id ?? -1;
      task.target.x = reservation?.position.x ?? place.entrance.x;
      task.target.z = reservation?.position.z ?? place.entrance.z;
      task.phase = "approach";
      goTo(actor, task.target, context, 3);
    } else if (task.phase === "approach") {
      if (actor.navigation.failed) {
        context.completeTask(actor, false);
        return;
      }
      if (distance(actor.position, task.target) > 0.5) return;
      const reservation = context.reservations.get(task.reservationId);
      if (reservation) useReservation(actor, reservation, context, "sheltering");
      stopWalking(actor, "sheltering");
      task.phase = "wait";
      task.changedAt = context.time.seconds;
      task.until = context.time.seconds + 12 + actor.personality.patience * 22;
      setGesture(actor, "phone", context.time.seconds, 0.5);
    } else {
      actor.shelterScore = Math.max(actor.shelterScore, place.covered);
      actor.wetness = Math.max(0, actor.wetness - context.time.dt * 0.006);
      actor.needs.comfort = lerp(actor.needs.comfort, 0.8, context.time.dt * 0.15);
      const improving = context.weather.precipitation < 0.15 || actor.umbrellaOpen > 0.7;
      if ((improving && context.time.seconds - task.changedAt > 5) || context.time.seconds >= task.until) {
        this.exposure.set(actor.id, 0);
        context.completeTask(actor, true);
      }
    }
  }

  releaseActor(actor: Actor): void {
    this.shelterAttempts.delete(actor.id);
  }
}
