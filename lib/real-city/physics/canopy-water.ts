import { clamp, saturate, smoothstep } from "./math";

export type CanopyWaterForcing = {
  rain: number;
  snow: number;
  humidity: number;
  temperature: number;
  wind: number;
  sunlight: number;
  leafAreaIndex: number;
  branchMotion: number;
};

export type CanopyWaterState = {
  interceptedWater: number;
  snowMass: number;
  iceMass: number;
  throughfall: number;
  stemflow: number;
  drip: number;
  wetLeafFraction: number;
  effectiveRainFraction: number;
  canopyMass: number;
  evaporated: number;
  unloading: number;
};

export class CanopyWaterBalance {
  readonly state: CanopyWaterState = {
    interceptedWater: 0,
    snowMass: 0,
    iceMass: 0,
    throughfall: 0,
    stemflow: 0,
    drip: 0,
    wetLeafFraction: 0,
    effectiveRainFraction: 1,
    canopyMass: 0,
    evaporated: 0,
    unloading: 0,
  };
  private rainReceived = 0;
  private snowReceived = 0;
  private waterReleased = 0;
  private evaporatedTotal = 0;

  constructor(readonly evergreen: boolean, readonly projectedArea: number) {}

  step(dt: number, forcing: CanopyWaterForcing): CanopyWaterState {
    const duration = clamp(dt, 0, 120);
    const state = this.state;
    state.throughfall = 0;
    state.stemflow = 0;
    state.drip = 0;
    state.evaporated = 0;
    state.unloading = 0;
    if (duration <= 0) return state;
    const area = Math.max(0.05, this.projectedArea);
    const leafArea = clamp(forcing.leafAreaIndex, 0, 8);
    const canopyCover = 1 - Math.exp(-leafArea * 0.55);
    const rainRate = Math.max(0, forcing.rain) * 0.000032;
    const snowRate = Math.max(0, forcing.snow) * 0.000018;
    const rainMass = rainRate * duration * area * 1000;
    const snowMass = snowRate * duration * area * 1000;
    this.rainReceived += rainMass;
    this.snowReceived += snowMass;
    const capture = canopyCover * (this.evergreen ? 0.92 : 0.8);
    const waterCapacity = area * leafArea * (this.evergreen ? 0.22 : 0.16);
    const snowCapacity = area * leafArea * (this.evergreen ? 1.3 : 0.65);
    const rainCaptured = rainMass * capture;
    const snowCaptured = snowMass * capture;
    state.interceptedWater += rainCaptured;
    state.snowMass += snowCaptured;
    const directThroughfall = rainMass * (1 - capture);
    state.throughfall = directThroughfall;
    const snowOverflow = Math.max(0, state.snowMass - snowCapacity);
    state.snowMass -= snowOverflow;
    state.unloading += snowOverflow;
    const waterOverflow = Math.max(0, state.interceptedWater - waterCapacity);
    state.interceptedWater -= waterOverflow;
    state.drip += waterOverflow;
    const warm = Math.max(0, forcing.temperature);
    const cold = Math.max(0, -forcing.temperature);
    const meltEnergy = (warm * 8 + forcing.sunlight * 90) * area * duration;
    const snowMelt = Math.min(state.snowMass, meltEnergy / 334000);
    state.snowMass -= snowMelt;
    state.interceptedWater += snowMelt;
    const iceMelt = Math.min(state.iceMass, Math.max(0, meltEnergy - snowMelt * 334000) / 334000);
    state.iceMass -= iceMelt;
    state.interceptedWater += iceMelt;
    const freeze = Math.min(state.interceptedWater, cold * area * duration * 0.0005);
    state.interceptedWater -= freeze;
    state.iceMass += freeze;
    const wetFraction = waterCapacity > 0 ? saturate(state.interceptedWater / waterCapacity) : 0;
    const aerodynamic = (0.00001 + forcing.wind * 0.000003) * (1 - forcing.humidity);
    const radiative = forcing.sunlight * 0.000012;
    const evaporated = Math.min(state.interceptedWater, (aerodynamic + radiative) * wetFraction * area * duration);
    state.interceptedWater -= evaporated;
    state.evaporated = evaporated;
    this.evaporatedTotal += evaporated;
    const gravitationalDrainage = Math.max(0, state.interceptedWater - waterCapacity * 0.55) * (1 - Math.exp(-duration * 0.025));
    state.interceptedWater -= gravitationalDrainage;
    const stemFraction = this.evergreen ? 0.035 : 0.07;
    state.stemflow = gravitationalDrainage * stemFraction;
    state.drip += gravitationalDrainage * (1 - stemFraction);
    const windUnload = (forcing.wind * forcing.wind * 0.00003 + Math.max(0, forcing.branchMotion) * 0.001) * duration;
    const unloaded = state.snowMass * Math.min(0.25, windUnload);
    state.snowMass -= unloaded;
    state.unloading += unloaded;
    const leafDrop = smoothstep(0, 0.2, leafArea);
    if (leafDrop < 1) {
      const released = state.interceptedWater * (1 - leafDrop);
      state.interceptedWater -= released;
      state.drip += released;
    }
    state.wetLeafFraction = waterCapacity > 0 ? saturate(state.interceptedWater / waterCapacity) : 0;
    state.canopyMass = state.interceptedWater + state.snowMass + state.iceMass;
    const released = state.throughfall + state.stemflow + state.drip;
    state.effectiveRainFraction = rainMass > 1e-9 ? clamp(released / rainMass, 0, 2) : 1;
    this.waterReleased += released + state.unloading;
    state.throughfall /= duration;
    state.stemflow /= duration;
    state.drip /= duration;
    state.unloading /= duration;
    return state;
  }

  reset(): void {
    this.state.interceptedWater = 0;
    this.state.snowMass = 0;
    this.state.iceMass = 0;
    this.state.throughfall = 0;
    this.state.stemflow = 0;
    this.state.drip = 0;
    this.state.wetLeafFraction = 0;
    this.state.effectiveRainFraction = 1;
    this.state.canopyMass = 0;
    this.state.evaporated = 0;
    this.state.unloading = 0;
    this.rainReceived = 0;
    this.snowReceived = 0;
    this.waterReleased = 0;
    this.evaporatedTotal = 0;
  }
}
