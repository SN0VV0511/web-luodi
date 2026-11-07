import { sampleCityClock, sampleEarthWind, type SeasonId } from "../../city-physics";

export type ShadeKind = "louver" | "awning" | "screen" | "shutter";

export type FacadeClimate = {
  hour: number;
  sunAltitude: number;
  solarIncidence: number;
  irradiance: number;
  ambientTemperature: number;
  glassTemperature: number;
  windNormal: number;
  windAcross: number;
  windSpeed: number;
  windPressure: number;
  daylight: number;
  frost: boolean;
};

export type ShadeControllerState = {
  position: number;
  velocity: number;
  target: number;
  motorLoad: number;
  motorTemperature: number;
  running: boolean;
  lowerLimit: boolean;
  upperLimit: boolean;
  windLocked: boolean;
  cooling: boolean;
};

export type FacadeExposure = {
  x: number;
  y: number;
  z: number;
  yaw: number;
};

function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(upper, value));
}

function smoothstep(lower: number, upper: number, value: number): number {
  const t = clamp((value - lower) / (upper - lower), 0, 1);
  return t * t * (3 - 2 * t);
}

function createClimate(): FacadeClimate {
  return {
    hour: 8,
    sunAltitude: 0,
    solarIncidence: 0,
    irradiance: 0,
    ambientTemperature: 18,
    glassTemperature: 18,
    windNormal: 0,
    windAcross: 0,
    windSpeed: 0,
    windPressure: 0,
    daylight: 0,
    frost: false,
  };
}

export function sampleFacadeClimate(seconds: number, night: boolean, season: SeasonId, exposure: FacadeExposure, target: FacadeClimate): FacadeClimate {
  const hour = sampleCityClock(seconds).hour;
  const seasonalAltitude = season === "summer" ? 1.17 : season === "winter" ? 0.52 : season === "autumn" ? 0.71 : 0.94;
  const dayProgress = (hour - 6) / 12;
  const sunAltitude = Math.max(0, Math.sin(dayProgress * Math.PI)) * seasonalAltitude;
  const sunAzimuth = dayProgress * Math.PI - Math.PI / 2;
  const normalX = Math.sin(exposure.yaw);
  const normalZ = Math.cos(exposure.yaw);
  const sunX = Math.sin(sunAzimuth) * Math.cos(sunAltitude);
  const sunZ = Math.cos(sunAzimuth) * Math.cos(sunAltitude);
  const incidence = Math.max(0, sunX * normalX + sunZ * normalZ);
  const daylight = night ? 0 : smoothstep(0, 0.18, sunAltitude);
  const clearIrradiance = season === "summer" ? 910 : season === "winter" ? 520 : 720;
  const diffuse = daylight * 0.14;
  const irradiance = (incidence * daylight + diffuse) * clearIrradiance;
  const seasonTemperature = season === "summer" ? 31 : season === "winter" ? -2 : season === "autumn" ? 14 : 19;
  const dailyTemperature = Math.sin((hour - 8) * Math.PI / 12) * 3.2;
  const ambient = seasonTemperature + dailyTemperature - (night ? 2.1 : 0);
  const wind = sampleEarthWind(seconds, exposure.x, exposure.z, season);
  const height = Math.max(1.2, exposure.y);
  const heightFactor = clamp(Math.log((height + 0.35) / 0.35) / Math.log(10.35 / 0.35), 0.4, 1.65);
  const normalWind = (wind.x * normalX + wind.z * normalZ) * heightFactor;
  const acrossWind = (wind.x * normalZ - wind.z * normalX) * heightFactor;
  const windSpeed = Math.hypot(normalWind, acrossWind);
  const convectiveTransfer = 5.7 + 3.8 * windSpeed;
  const absorbed = irradiance * 0.22;
  const glassTemperature = ambient + absorbed / Math.max(8, convectiveTransfer);
  target.hour = hour;
  target.sunAltitude = sunAltitude;
  target.solarIncidence = incidence;
  target.irradiance = irradiance;
  target.ambientTemperature = ambient;
  target.glassTemperature = glassTemperature;
  target.windNormal = normalWind;
  target.windAcross = acrossWind;
  target.windSpeed = windSpeed;
  target.windPressure = 0.5 * 1.225 * windSpeed * windSpeed;
  target.daylight = daylight;
  target.frost = ambient < 0 && night;
  return target;
}

export class FacadeShadeController {
  readonly climate = createClimate();
  readonly state: ShadeControllerState = {
    position: 0,
    velocity: 0,
    target: 0,
    motorLoad: 0,
    motorTemperature: 20,
    running: false,
    lowerLimit: true,
    upperLimit: false,
    windLocked: false,
    cooling: false,
  };
  private lastTime = -Infinity;
  private lastSeason: SeasonId | undefined;
  private windHoldUntil = -Infinity;
  private targetHoldUntil = -Infinity;
  private filteredSolar = 0;
  private filteredPressure = 0;
  private positionCommand = 0;

  constructor(readonly kind: ShadeKind, readonly exposure: FacadeExposure, readonly phase = 0) {}

  update(seconds: number, night: boolean, season: SeasonId): ShadeControllerState {
    const reset = !Number.isFinite(this.lastTime) || seconds < this.lastTime;
    const elapsed = reset ? 0 : Math.max(0, Math.min(0.2, seconds - this.lastTime));
    const seasonChanged = season !== this.lastSeason;
    this.lastTime = seconds;
    this.lastSeason = season;
    sampleFacadeClimate(seconds, night, season, this.exposure, this.climate);
    if (reset) {
      this.filteredSolar = this.climate.irradiance;
      this.filteredPressure = this.climate.windPressure;
      this.windHoldUntil = -Infinity;
      this.targetHoldUntil = -Infinity;
      this.state.velocity = 0;
      this.state.motorTemperature = this.climate.ambientTemperature;
    } else {
      this.filteredSolar += (this.climate.irradiance - this.filteredSolar) * Math.min(1, elapsed * 0.55);
      this.filteredPressure += (this.climate.windPressure - this.filteredPressure) * Math.min(1, elapsed * 1.4);
    }
    this.updateWindInterlock(seconds);
    const desired = this.desiredPosition(night, season);
    const commandChanged = Math.abs(desired - this.positionCommand) > 0.045;
    const safetyRetract = this.state.windLocked || this.climate.frost;
    if (reset || seasonChanged || safetyRetract || commandChanged && seconds >= this.targetHoldUntil) {
      this.positionCommand = desired;
      this.targetHoldUntil = seconds + (this.kind === "louver" ? 0.8 : 2.4);
    }
    this.state.target = this.positionCommand;
    if (reset) {
      this.state.position = this.positionCommand;
      this.state.velocity = 0;
    } else {
      this.advanceMotor(elapsed);
    }
    this.state.lowerLimit = this.state.position <= 0.001;
    this.state.upperLimit = this.state.position >= 0.999;
    this.state.running = Math.abs(this.state.velocity) > 0.0005;
    return this.state;
  }

  private updateWindInterlock(seconds: number): void {
    const cutoff = this.kind === "awning" ? 5.5 : this.kind === "screen" ? 8 : 13;
    const instantaneous = this.climate.windPressure;
    if (instantaneous > cutoff || this.filteredPressure > cutoff * 0.8) {
      this.windHoldUntil = seconds + (this.kind === "awning" ? 12 : 6);
    }
    this.state.windLocked = seconds < this.windHoldUntil;
  }

  private desiredPosition(night: boolean, season: SeasonId): number {
    const solarDemand = smoothstep(120, 690, this.filteredSolar);
    const heatDemand = smoothstep(19, 35, this.climate.glassTemperature);
    const demand = clamp(solarDemand * 0.64 + heatDemand * 0.36, 0, 1);
    if (this.kind === "louver") {
      if (this.state.windLocked) return 0.15;
      if (night || this.climate.frost) return 0.06;
      return 0.08 + demand * (season === "winter" ? 0.28 : 0.9);
    }
    if (this.kind === "awning") {
      if (this.state.windLocked || night || this.climate.frost || season === "winter") return 0.03;
      return 0.24 + demand * 0.76;
    }
    if (this.kind === "screen") {
      if (this.state.windLocked || this.climate.frost) return 0.025;
      if (night) return 0.05;
      return 0.07 + demand * 0.88;
    }
    const sleeping = night && (this.climate.hour > 22 || this.climate.hour < 6);
    if (sleeping) return 0.05;
    if (this.state.windLocked) return 0.08;
    return clamp(1 - demand * 0.82 + Math.sin(this.phase) * 0.025, 0.08, 1);
  }

  private advanceMotor(dt: number): void {
    if (dt <= 0) return;
    const difference = this.state.target - this.state.position;
    const speedLimit = this.kind === "louver" ? 0.18 : this.kind === "awning" ? 0.065 : this.kind === "screen" ? 0.055 : 0.1;
    const acceleration = this.kind === "louver" ? 0.5 : 0.16;
    const brakingSpeed = Math.sqrt(Math.max(0, 2 * acceleration * Math.abs(difference)));
    const desiredSpeed = Math.sign(difference) * Math.min(speedLimit, brakingSpeed);
    this.state.cooling = this.state.motorTemperature > 66 || this.state.cooling && this.state.motorTemperature > 48;
    const velocityTarget = this.state.cooling ? 0 : desiredSpeed;
    const change = velocityTarget - this.state.velocity;
    this.state.velocity += Math.sign(change) * Math.min(Math.abs(change), acceleration * dt);
    const movement = this.state.velocity * dt;
    if (Math.abs(movement) >= Math.abs(difference) && Math.sign(movement) === Math.sign(difference)) {
      this.state.position = this.state.target;
      this.state.velocity = 0;
    } else {
      this.state.position = clamp(this.state.position + movement, 0, 1);
    }
    const windResistance = this.filteredPressure * (this.kind === "awning" ? this.state.position * 0.12 : 0.025);
    const load = Math.abs(this.state.velocity) / speedLimit * (0.32 + windResistance);
    this.state.motorLoad = clamp(load, 0, 1.3);
    const heating = this.state.motorLoad * this.state.motorLoad * 1.1;
    const cooling = (this.state.motorTemperature - this.climate.ambientTemperature) * 0.055;
    this.state.motorTemperature += (heating - cooling) * dt;
  }
}
