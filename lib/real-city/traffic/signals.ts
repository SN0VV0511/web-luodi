export type VehicleSignal = "green" | "amber" | "red";
export type WalkingSignal = "walk" | "clearance" | "stop";

export type SignalPhase = {
  vehicle: VehicleSignal;
  pedestrian: WalkingSignal;
  remaining: number;
  pedestrianRemaining: number;
  localSeconds: number;
};

export const CITY_SIGNAL_PERIOD = 52;

export function sampleSignalPhase(seconds: number, horizontal: boolean): SignalPhase {
  const offset = horizontal ? 0 : 26;
  const local = ((seconds - offset) % CITY_SIGNAL_PERIOD + CITY_SIGNAL_PERIOD) % CITY_SIGNAL_PERIOD;
  let vehicle: VehicleSignal;
  let remaining: number;
  if (local < 15) {
    vehicle = "green";
    remaining = 15 - local;
  } else if (local < 18) {
    vehicle = "amber";
    remaining = 18 - local;
  } else {
    vehicle = "red";
    remaining = CITY_SIGNAL_PERIOD - local;
  }
  let pedestrian: WalkingSignal;
  let pedestrianRemaining: number;
  if (local < 15) {
    pedestrian = "walk";
    pedestrianRemaining = 15 - local;
  } else if (local < 23) {
    pedestrian = "clearance";
    pedestrianRemaining = 23 - local;
  } else {
    pedestrian = "stop";
    pedestrianRemaining = CITY_SIGNAL_PERIOD - local;
  }
  return { vehicle, pedestrian, remaining, pedestrianRemaining, localSeconds: local };
}

export function mustStopForSignal(signal: VehicleSignal, speed: number, distance: number, braking: number, reaction = 0.75): boolean {
  if (signal === "green") return false;
  if (signal === "red") return true;
  const stoppingDistance = speed * reaction + speed * speed / (2 * Math.max(0.5, braking));
  return stoppingDistance <= Math.max(0, distance - 0.8);
}

export function pedestrianPhaseAllowsStart(seconds: number, horizontal: boolean, crossingLength: number, walkingSpeed: number): boolean {
  const phase = sampleSignalPhase(seconds, horizontal);
  if (phase.pedestrian !== "walk") return false;
  const needed = crossingLength / Math.max(0.35, walkingSpeed);
  return needed <= phase.pedestrianRemaining + 8;
}
