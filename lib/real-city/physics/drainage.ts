import { clamp, exponentialApproach, GRAVITY, smoothstep } from "./math";

export type RoofCatchment = {
  area: number;
  slope: number;
  outletArea: number;
  storageDepth: number;
  thermalMass: number;
};
export type DrainageWeather = {
  rain: number;
  snow: number;
  temperature: number;
  sunlight: number;
  wind: number;
  humidity: number;
};
export type RoofWaterState = {
  waterDepth: number;
  snowDepth: number;
  iceDepth: number;
  surfaceTemperature: number;
  outflow: number;
  overflow: number;
  meltwater: number;
  wetness: number;
  icicleLength: number;
  flowVelocity: number;
};

export class RoofDrainageModel {
  readonly state: RoofWaterState = {
    waterDepth: 0,
    snowDepth: 0,
    iceDepth: 0,
    surfaceTemperature: 15,
    outflow: 0,
    overflow: 0,
    meltwater: 0,
    wetness: 0,
    icicleLength: 0,
    flowVelocity: 0,
  };
  private readonly area: number;
  private readonly outletArea: number;
  private readonly maximumStorage: number;
  private readonly thermalMass: number;
  private readonly slope: number;
  private elapsed = 0;
  private accumulatedInflow = 0;
  private accumulatedOutflow = 0;

  constructor(catchment: RoofCatchment) {
    this.area = Math.max(1, catchment.area);
    this.outletArea = Math.max(0.0001, catchment.outletArea);
    this.maximumStorage = Math.max(0.005, catchment.storageDepth);
    this.thermalMass = Math.max(1, catchment.thermalMass);
    this.slope = clamp(catchment.slope, 0.005, 0.3);
  }

  step(dt: number, weather: DrainageWeather): void {
    const state = this.state;
    const virtualTime = Math.min(9, dt * 36);
    const convective = 0.004 + weather.wind * 0.0012;
    const solarHeating = weather.sunlight * 3.5 * (1 - smoothstep(0.001, 0.03, state.snowDepth));
    const targetTemperature = weather.temperature + solarHeating;
    state.surfaceTemperature = exponentialApproach(state.surfaceTemperature, targetTemperature, convective / this.thermalMass, virtualTime);
    const rainRate = Math.max(0, weather.rain) * 0.000011;
    const snowWaterEquivalent = Math.max(0, weather.snow) * 0.000008;
    const warm = Math.max(0, state.surfaceTemperature);
    const cold = Math.max(0, -state.surfaceTemperature);
    state.snowDepth = Math.min(0.32, state.snowDepth + snowWaterEquivalent * virtualTime * 6.5);
    const meltRate = warm * 0.000008 + weather.sunlight * 0.000012;
    const snowMelt = Math.min(state.snowDepth, meltRate * virtualTime);
    state.snowDepth -= snowMelt;
    const iceMelt = Math.min(state.iceDepth, meltRate * virtualTime * 0.4);
    state.iceDepth -= iceMelt;
    state.meltwater = virtualTime > 0 ? (snowMelt / 6.5 + iceMelt) / virtualTime : 0;
    const inputDepth = rainRate * virtualTime + snowMelt / 6.5 + iceMelt;
    state.waterDepth += inputDepth;
    this.accumulatedInflow += inputDepth * this.area;
    const freeze = Math.min(state.waterDepth, cold * 0.000012 * virtualTime);
    state.waterDepth -= freeze;
    state.iceDepth = Math.min(0.06, state.iceDepth + freeze);
    const blocked = smoothstep(0.003, 0.025, state.iceDepth);
    const effectiveOutlet = this.outletArea * (1 - blocked * 0.97);
    const collectionHead = state.waterDepth + this.slope * 0.15;
    const discharge = 0.62 * effectiveOutlet * Math.sqrt(2 * GRAVITY * Math.max(0, collectionHead));
    const available = state.waterDepth * this.area;
    const drained = Math.min(available, discharge * virtualTime);
    state.waterDepth -= drained / this.area;
    state.outflow = virtualTime > 0 ? drained / virtualTime : 0;
    state.flowVelocity = effectiveOutlet > 0 ? state.outflow / effectiveOutlet : 0;
    this.accumulatedOutflow += drained;
    const overflowDepth = Math.max(0, state.waterDepth - this.maximumStorage);
    state.waterDepth -= overflowDepth;
    state.overflow = virtualTime > 0 ? overflowDepth * this.area / virtualTime : 0;
    this.accumulatedOutflow += overflowDepth * this.area;
    const evaporation = Math.max(0, 1 - weather.humidity) * (0.0000008 + warm * 0.00000008) * (1 + weather.wind * 0.15) * virtualTime;
    state.waterDepth = Math.max(0, state.waterDepth - evaporation);
    const wetTarget = clamp(state.waterDepth * 1400 + rainRate * 90000 + state.meltwater * 50000, 0, 1);
    state.wetness = exponentialApproach(state.wetness, wetTarget, wetTarget > state.wetness ? 0.15 : 0.01, virtualTime);
    const icicleGrowth = cold * Math.min(0.00015, state.outflow * 0.2 + state.meltwater * 0.5) * virtualTime;
    const icicleMelt = warm * 0.00012 * virtualTime;
    state.icicleLength = clamp(state.icicleLength + icicleGrowth - icicleMelt, 0, 0.55);
    this.elapsed += virtualTime;
  }

  sampleDischarge(fraction: number): number {
    const pulse = 0.82 + Math.sin(this.elapsed * 1.2 + fraction * 7.3) * 0.1 + Math.sin(this.elapsed * 3.7 - fraction * 4.1) * 0.08;
    return this.state.outflow * Math.max(0.1, pulse);
  }

  waterBudget(): { received: number; discharged: number; stored: number } {
    return {
      received: this.accumulatedInflow,
      discharged: this.accumulatedOutflow,
      stored: (this.state.waterDepth + this.state.iceDepth + this.state.snowDepth / 6.5) * this.area,
    };
  }

  reset(temperature = 15): void {
    this.state.waterDepth = 0;
    this.state.snowDepth = 0;
    this.state.iceDepth = 0;
    this.state.surfaceTemperature = temperature;
    this.state.outflow = 0;
    this.state.overflow = 0;
    this.state.meltwater = 0;
    this.state.wetness = 0;
    this.state.icicleLength = 0;
    this.state.flowVelocity = 0;
    this.elapsed = 0;
    this.accumulatedInflow = 0;
    this.accumulatedOutflow = 0;
  }
}

export type OpenChannelState = { depth: number; velocity: number; outflow: number; debris: number; ice: number };

export class OpenDrainChannel {
  readonly state: OpenChannelState = { depth: 0, velocity: 0, outflow: 0, debris: 0, ice: 0 };

  constructor(readonly length: number, readonly width: number, readonly slope: number, readonly roughness: number) {}

  step(dt: number, inflow: number, temperature: number, leaves: number): number {
    const area = Math.max(0.01, this.length * this.width);
    this.state.depth += Math.max(0, inflow) * dt / area;
    this.state.debris = clamp(this.state.debris + leaves * dt * 0.004 - this.state.velocity * dt * 0.003, 0, 0.8);
    if (temperature < 0) this.state.ice = clamp(this.state.ice + -temperature * dt * 0.0003, 0, 0.8);
    else this.state.ice = Math.max(0, this.state.ice - temperature * dt * 0.0004);
    const effectiveWidth = this.width * (1 - this.state.debris * 0.6) * (1 - this.state.ice * 0.7);
    const crossSection = effectiveWidth * this.state.depth;
    const wettedPerimeter = effectiveWidth + this.state.depth * 2;
    const hydraulicRadius = crossSection / Math.max(0.001, wettedPerimeter);
    const velocity = Math.pow(Math.max(0, hydraulicRadius), 2 / 3) * Math.sqrt(Math.max(0.0001, this.slope)) / Math.max(0.01, this.roughness);
    this.state.velocity = exponentialApproach(this.state.velocity, velocity, 3, dt);
    const requested = this.state.velocity * crossSection;
    this.state.outflow = Math.min(requested, this.state.depth * area / Math.max(0.001, dt));
    this.state.depth = clamp(this.state.depth - this.state.outflow * dt / area, 0, 0.08);
    return this.state.outflow;
  }

  clearDebris(fraction: number): void {
    this.state.debris *= 1 - clamp(fraction, 0, 1);
  }

  reset(): void {
    this.state.depth = 0;
    this.state.velocity = 0;
    this.state.outflow = 0;
    this.state.debris = 0;
    this.state.ice = 0;
  }
}
