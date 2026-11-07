import type { TrafficEnvironment, TrafficRoute, TrafficSpecification } from "./types";

export function vehicleSpecification(route: TrafficRoute): TrafficSpecification {
  const bus = route.shell === "bus";
  const truck = route.shell === "truck";
  const suv = route.shell === "suv";
  const heavy = bus || truck;
  const mass = bus ? 9200 : truck ? 5800 : suv ? 1920 : 1480;
  const length = bus ? 8.8 : truck ? 6.7 : suv ? 4.8 : 4.65;
  const width = heavy ? 2.35 : suv ? 1.92 : 1.82;
  const height = bus ? 3.15 : truck ? 2.8 : suv ? 1.72 : 1.48;
  return {
    length,
    width,
    mass,
    wheelbase: length * (heavy ? 0.58 : 0.6),
    wheelRadius: bus ? 0.5 : truck ? 0.43 : suv ? 0.36 : 0.32,
    frontalArea: width * height * 0.83,
    dragCoefficient: heavy ? 0.58 : suv ? 0.36 : 0.29,
    rollingResistance: heavy ? 0.007 : 0.011,
    enginePower: bus ? 185000 : truck ? 135000 : suv ? 128000 : 92000,
    driveForce: mass * (heavy ? 1.7 : 3.1),
    brakeForce: mass * (heavy ? 6.1 : 7.8),
    comfortableAcceleration: heavy ? 1.05 : route.kind === "taxi" ? 1.9 : 1.7,
    comfortableBraking: heavy ? 2.2 : 2.9,
    maximumJerk: heavy ? 1.3 : 2.5,
    lateralAcceleration: heavy ? 1.05 : 1.7,
    idleRpm: heavy ? 650 : 780,
    maximumRpm: heavy ? 2900 : 6200,
    gearRatios: heavy ? [5.4, 3.25, 2.03, 1.35, 1, 0.78] : [3.7, 2.14, 1.4, 1, 0.8, 0.66],
    finalDrive: heavy ? 4.2 : 3.7,
  };
}

export function tireFriction(environment: TrafficEnvironment): number {
  const water = Math.max(0, Math.min(1, environment.wetness));
  const snow = Math.max(0, Math.min(1, environment.snow));
  const freezing = environment.temperature < -0.5 && water > 0.25;
  const dry = 0.86;
  const wet = dry * (1 - water * 0.36);
  const snowy = wet * (1 - snow * 0.66);
  return Math.max(0.16, freezing ? snowy * 0.64 : snowy);
}

export function trafficVisibility(environment: TrafficEnvironment): number {
  const precipitation = Math.max(environment.wetness * 0.6, environment.snow);
  const nightPenalty = environment.night ? 0.1 : 0;
  return Math.max(0.42, 1 - precipitation * 0.36 - nightPenalty);
}

export function stoppingDistance(speed: number, braking: number, reaction: number): number {
  return Math.max(0, speed) * reaction + speed * speed / (2 * Math.max(0.1, braking));
}

export function aerodynamicResistance(speed: number, directionX: number, directionZ: number, specification: TrafficSpecification, environment: TrafficEnvironment): number {
  const windAlong = environment.windX * directionX + environment.windZ * directionZ;
  const relative = speed - windAlong;
  const density = 101325 / (287.05 * Math.max(230, environment.temperature + 273.15));
  return 0.5 * density * specification.dragCoefficient * specification.frontalArea * relative * Math.abs(relative);
}
