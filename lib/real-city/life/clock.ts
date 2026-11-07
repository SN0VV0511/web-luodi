import { bell, clamp, positiveModulo, smoothstep } from "./math";
import type { SimulationTime } from "./types";
import { CITY_DAY_SECONDS, CITY_DAY_START_HOUR } from "../../city-physics";

const STEP_SECONDS = 1 / 12;
const DAY_SECONDS = CITY_DAY_SECONDS;
const START_MINUTE = CITY_DAY_START_HOUR * 60;
const MAX_CATCHUP_STEPS = 6;

export interface ClockAdvance {
  steps: number;
  alpha: number;
  reset: boolean;
  discarded: number;
}

export class CityLifeClock {
  readonly time: SimulationTime = {
    seconds: 0,
    dt: STEP_SECONDS,
    tick: 0,
    day: 0,
    minute: START_MINUTE,
    hour: START_MINUTE / 60,
    weekday: 1,
    weekend: false,
    night: false,
    dawn: 6.1,
    dusk: 18.6,
    daylight: 1,
    rush: 0,
    lunchRush: 0,
    schoolRush: 0,
  };
  private lastInput = 0;
  private accumulator = 0;
  private initialized = false;
  private pendingNight = false;
  private pendingSeason: "spring" | "summer" | "autumn" | "winter" = "spring";

  reset(seconds = 0): void {
    this.lastInput = seconds;
    this.accumulator = 0;
    this.initialized = true;
    this.time.seconds = seconds;
    this.time.tick = Math.floor(seconds / STEP_SECONDS);
    this.updateCalendar();
  }

  advance(seconds: number, night: boolean, season: "spring" | "summer" | "autumn" | "winter"): ClockAdvance {
    this.pendingNight = night;
    this.pendingSeason = season;
    const input = Math.max(0, Number.isFinite(seconds) ? seconds : this.lastInput);
    if (!this.initialized) {
      this.reset(input);
      return { steps: 0, alpha: 0, reset: false, discarded: 0 };
    }
    if (input + 0.001 < this.lastInput) {
      this.reset(input);
      return { steps: 0, alpha: 0, reset: true, discarded: 0 };
    }
    const elapsed = input - this.lastInput;
    this.lastInput = input;
    this.accumulator += elapsed;
    const maximum = STEP_SECONDS * MAX_CATCHUP_STEPS;
    const discarded = Math.max(0, this.accumulator - maximum);
    if (discarded > 0) {
      this.time.seconds += discarded;
      this.accumulator = maximum;
    }
    const steps = Math.min(MAX_CATCHUP_STEPS, Math.floor((this.accumulator + 1e-8) / STEP_SECONDS));
    const remainder = this.accumulator - steps * STEP_SECONDS;
    this.updateCalendar();
    return {
      steps,
      alpha: clamp(remainder / STEP_SECONDS, 0, 1),
      reset: false,
      discarded,
    };
  }

  step(): SimulationTime {
    this.accumulator = Math.max(0, this.accumulator - STEP_SECONDS);
    this.time.seconds += STEP_SECONDS;
    this.time.tick++;
    this.time.dt = STEP_SECONDS;
    this.updateCalendar();
    return this.time;
  }

  private updateCalendar(): void {
    const absoluteMinute = START_MINUTE + this.time.seconds / DAY_SECONDS * 1440;
    const day = Math.floor(absoluteMinute / 1440);
    const minute = positiveModulo(absoluteMinute, 1440);
    const hour = minute / 60;
    this.time.day = day;
    this.time.minute = minute;
    this.time.hour = hour;
    this.time.weekday = positiveModulo(day + 1, 7);
    this.time.weekend = this.time.weekday === 0 || this.time.weekday === 6;
    this.time.night = this.pendingNight;
    switch (this.pendingSeason) {
      case "winter":
        this.time.dawn = 7.1;
        this.time.dusk = 17.1;
        break;
      case "summer":
        this.time.dawn = 5.1;
        this.time.dusk = 19.7;
        break;
      case "autumn":
        this.time.dawn = 6.3;
        this.time.dusk = 17.8;
        break;
      default:
        this.time.dawn = 6.1;
        this.time.dusk = 18.6;
    }
    const sunrise = smoothstep((hour - this.time.dawn + 0.5) / 1.2);
    const sunset = 1 - smoothstep((hour - this.time.dusk + 0.5) / 1.2);
    this.time.daylight = this.pendingNight ? 0 : sunrise * sunset;
    const weekdayFactor = this.time.weekend ? 0.25 : 1;
    this.time.rush = Math.max(bell(hour, 8.2, 0.85), bell(hour, 17.9, 1.05)) * weekdayFactor;
    this.time.lunchRush = bell(hour, 12.25, 0.8);
    this.time.schoolRush = this.time.weekend ? 0
      : Math.max(bell(hour, 7.9, 0.45), bell(hour, 15.8, 0.55));
  }

  secondsUntilMinute(minute: number): number {
    const delta = positiveModulo(minute - this.time.minute, 1440);
    return delta / 1440 * DAY_SECONDS;
  }

  elapsedSinceMinute(minute: number): number {
    const delta = positiveModulo(this.time.minute - minute, 1440);
    return delta / 1440 * DAY_SECONDS;
  }

  isBetween(startMinute: number, endMinute: number): boolean {
    const current = this.time.minute;
    if (endMinute >= startMinute) return current >= startMinute && current < endMinute;
    return current >= startMinute || current < endMinute;
  }

  get interpolation(): number {
    return clamp(this.accumulator / STEP_SECONDS, 0, 1);
  }
}

export function simulationSecondsForMinutes(minutes: number): number {
  return minutes / 1440 * DAY_SECONDS;
}

export function simulationMinutesForSeconds(seconds: number): number {
  return seconds / DAY_SECONDS * 1440;
}

export function minuteInInterval(minute: number, start: number, end: number): boolean {
  const normalized = positiveModulo(minute, 1440);
  const lower = positiveModulo(start, 1440);
  const upper = positiveModulo(end, 1440);
  if (lower === upper) return true;
  return lower < upper ? normalized >= lower && normalized < upper
    : normalized >= lower || normalized < upper;
}

export function nextDailyOccurrence(now: SimulationTime, minute: number): number {
  return now.seconds + simulationSecondsForMinutes(positiveModulo(minute - now.minute, 1440));
}

export function scheduleIsDue(now: SimulationTime, minute: number, tolerance: number): boolean {
  const delta = positiveModulo(now.minute - minute + 720, 1440) - 720;
  return delta >= -tolerance && delta <= tolerance;
}
