import { clamp, saturate } from "./math";

export type SnowLayer = {
  iceMass: number;
  liquidMass: number;
  density: number;
  temperature: number;
  grainRadius: number;
  soot: number;
  age: number;
};

export type SnowForcing = {
  snowfall: number;
  rainfall: number;
  airTemperature: number;
  groundTemperature: number;
  absorbedSolar: number;
  longwave: number;
  windSpeed: number;
  humidity: number;
  pressure: number;
};

export type SnowState = {
  depth: number;
  density: number;
  waterEquivalent: number;
  liquidWater: number;
  albedo: number;
  roughness: number;
  runoff: number;
  sublimation: number;
  melt: number;
  refreeze: number;
  surfaceTemperature: number;
  strength: number;
};

export function createSnowState(): SnowState {
  return {
    depth: 0,
    density: 120,
    waterEquivalent: 0,
    liquidWater: 0,
    albedo: 0.85,
    roughness: 0.003,
    runoff: 0,
    sublimation: 0,
    melt: 0,
    refreeze: 0,
    surfaceTemperature: 0,
    strength: 0,
  };
}

export class SnowColumn {
  readonly layers: SnowLayer[] = [];
  readonly state = createSnowState();
  private totalSnowfall = 0;
  private totalRunoff = 0;
  private totalSublimation = 0;
  private surfaceCompaction = 0;
  private dirtyMass = 0;

  constructor(readonly maximumLayers = 4) {}

  step(seconds: number, forcing: SnowForcing): SnowState {
    const dt = clamp(seconds, 0, 600);
    this.state.runoff = 0;
    this.state.sublimation = 0;
    this.state.melt = 0;
    this.state.refreeze = 0;
    if (dt <= 0) return this.state;
    if (forcing.snowfall > 0) this.deposit(forcing.snowfall * dt, forcing.airTemperature, forcing.windSpeed);
    if (this.layers.length === 0) {
      this.state.runoff = Math.max(0, forcing.rainfall) * dt;
      this.refreshState();
      return this.state;
    }
    this.layers[0].liquidMass += Math.max(0, forcing.rainfall) * dt * 1000;
    this.exchangeSurfaceEnergy(dt, forcing);
    this.exchangeInternalEnergy(dt, forcing.groundTemperature);
    this.drainLiquid();
    this.compactLayers(dt, forcing.windSpeed);
    this.evolveGrains(dt);
    this.removeEmptyLayers();
    this.mergeThinLayers();
    this.refreshState();
    this.totalRunoff += this.state.runoff;
    this.totalSublimation += this.state.sublimation;
    return this.state;
  }

  deposit(waterEquivalent: number, temperature: number, windSpeed: number): void {
    const mass = Math.max(0, waterEquivalent) * 1000;
    if (mass <= 0) return;
    const freshDensity = clamp(65 + Math.max(0, temperature + 15) * 3.1 + windSpeed * 6.5, 55, 230);
    const freshTemperature = Math.min(0, temperature);
    const first = this.layers[0];
    if (first && first.age < 900 && first.density < 230 && first.liquidMass < 0.01) {
      const oldMass = first.iceMass;
      const volume = oldMass / first.density + mass / freshDensity;
      first.iceMass += mass;
      first.density = first.iceMass / Math.max(1e-8, volume);
      first.temperature = (first.temperature * oldMass + freshTemperature * mass) / first.iceMass;
      first.age *= oldMass / first.iceMass;
      first.soot *= oldMass / first.iceMass;
      first.grainRadius = (first.grainRadius * oldMass + 0.00008 * mass) / first.iceMass;
    } else {
      this.layers.unshift({
        iceMass: mass,
        liquidMass: 0,
        density: freshDensity,
        temperature: freshTemperature,
        grainRadius: 0.00008,
        soot: 0,
        age: 0,
      });
    }
    this.totalSnowfall += waterEquivalent;
    this.surfaceCompaction *= Math.exp(-mass * 0.08);
    this.boundLayerCount();
    this.refreshState();
  }

  compress(pressure: number, duration: number): number {
    if (this.layers.length === 0) return 0;
    const previousDepth = this.state.depth;
    const force = Math.max(0, pressure);
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      const attenuated = force * Math.exp(-index * 1.7);
      const yieldStress = this.layerStrength(layer);
      const excess = Math.max(0, attenuated - yieldStress);
      const strain = 1 - Math.exp(-excess * Math.max(0, duration) / 160000);
      layer.density = clamp(layer.density + (550 - layer.density) * strain, 55, 650);
    }
    this.surfaceCompaction = saturate(this.surfaceCompaction + force * duration / 250000);
    this.refreshState();
    return Math.max(0, previousDepth - this.state.depth);
  }

  addSoot(massPerArea: number): void {
    const first = this.layers[0];
    if (!first || massPerArea <= 0) return;
    const mass = Math.max(0, massPerArea);
    first.soot += mass / Math.max(0.001, first.iceMass + first.liquidMass);
    this.dirtyMass += mass;
  }

  erode(waterEquivalent: number): number {
    let remainingMass = Math.max(0, waterEquivalent) * 1000;
    let removed = 0;
    for (const layer of this.layers) {
      const amount = Math.min(layer.iceMass, remainingMass);
      layer.iceMass -= amount;
      remainingMass -= amount;
      removed += amount;
      if (remainingMass <= 0) break;
    }
    this.removeEmptyLayers();
    this.refreshState();
    return removed / 1000;
  }

  waterBalanceError(): number {
    const retained = this.state.waterEquivalent;
    return this.totalSnowfall - retained - this.totalRunoff - this.totalSublimation;
  }

  reset(): void {
    this.layers.length = 0;
    this.totalSnowfall = 0;
    this.totalRunoff = 0;
    this.totalSublimation = 0;
    this.surfaceCompaction = 0;
    this.dirtyMass = 0;
    Object.assign(this.state, createSnowState());
  }

  private exchangeSurfaceEnergy(dt: number, forcing: SnowForcing): void {
    const top = this.layers[0];
    const exchangeCoefficient = 4.5 + Math.max(0, forcing.windSpeed) * 3.2;
    const sensible = exchangeCoefficient * (forcing.airTemperature - top.temperature);
    const vaporSaturation = 610.78 * Math.exp(21.875 * top.temperature / (265.5 + top.temperature));
    const airSaturation = 610.78 * Math.exp(17.27 * forcing.airTemperature / (237.3 + forcing.airTemperature));
    const vaporGradient = vaporSaturation - airSaturation * saturate(forcing.humidity);
    const vaporExchange = vaporGradient * (0.0000000015 + forcing.windSpeed * 0.0000000006);
    const sublimation = Math.min(top.iceMass, Math.max(0, vaporExchange) * dt);
    top.iceMass -= sublimation;
    this.state.sublimation += sublimation / 1000;
    const latent = -sublimation * 2.834e6;
    const rainfallHeat = Math.max(0, forcing.rainfall) * dt * 1000 * 4180 * Math.max(0, forcing.airTemperature);
    const incoming = (Math.max(0, forcing.absorbedSolar) + forcing.longwave + sensible) * dt + latent + rainfallHeat;
    this.applyEnergy(top, incoming);
    if (vaporExchange < 0 && top.temperature < 0) {
      const deposited = -vaporExchange * dt;
      top.iceMass += deposited;
      top.grainRadius = Math.min(0.002, top.grainRadius + deposited * 0.00001);
      this.totalSnowfall += deposited / 1000;
    }
  }

  private exchangeInternalEnergy(dt: number, groundTemperature: number): void {
    for (let index = 0; index < this.layers.length - 1; index++) {
      const upper = this.layers[index];
      const lower = this.layers[index + 1];
      const upperDepth = upper.iceMass / Math.max(55, upper.density);
      const lowerDepth = lower.iceMass / Math.max(55, lower.density);
      const upperConductivity = 0.024 + 2.5 * (upper.density / 1000) ** 2;
      const lowerConductivity = 0.024 + 2.5 * (lower.density / 1000) ** 2;
      const resistance = upperDepth * 0.5 / upperConductivity + lowerDepth * 0.5 / lowerConductivity;
      const requested = (lower.temperature - upper.temperature) * dt / Math.max(0.02, resistance);
      const capacity = Math.min(upper.iceMass, lower.iceMass) * 2100;
      const maximum = Math.abs(lower.temperature - upper.temperature) * capacity * 0.4;
      const energy = clamp(requested, -maximum, maximum);
      this.applyEnergy(upper, energy);
      this.applyEnergy(lower, -energy);
    }
    const bottom = this.layers[this.layers.length - 1];
    const depth = bottom.iceMass / Math.max(55, bottom.density);
    const conductivity = 0.024 + 2.5 * (bottom.density / 1000) ** 2;
    const requested = (groundTemperature - bottom.temperature) * conductivity * dt / Math.max(0.03, depth * 0.5);
    const capacity = Math.max(1, bottom.iceMass) * 2100;
    const bounded = clamp(requested, -capacity * 3, capacity * 3);
    this.applyEnergy(bottom, bounded);
  }

  private applyEnergy(layer: SnowLayer, joules: number): void {
    const heatCapacity = Math.max(0.01, layer.iceMass * 2100 + layer.liquidMass * 4180);
    if (joules >= 0) {
      const warming = Math.min(joules, Math.max(0, -layer.temperature) * heatCapacity);
      layer.temperature = Math.min(0, layer.temperature + warming / heatCapacity);
      const remaining = joules - warming;
      const melted = Math.min(layer.iceMass, remaining / 334000);
      layer.iceMass -= melted;
      layer.liquidMass += melted;
      this.state.melt += melted / 1000;
    } else {
      const freeze = Math.min(layer.liquidMass, -joules / 334000);
      layer.liquidMass -= freeze;
      layer.iceMass += freeze;
      const remaining = joules + freeze * 334000;
      layer.temperature = Math.max(-45, layer.temperature + remaining / heatCapacity);
      this.state.refreeze += freeze / 1000;
    }
  }

  private drainLiquid(): void {
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      const poreVolume = Math.max(0, layer.iceMass / layer.density - layer.iceMass / 917);
      const retention = poreVolume * 1000 * 0.045;
      const outflow = Math.max(0, layer.liquidMass - retention);
      layer.liquidMass -= outflow;
      if (index < this.layers.length - 1) {
        this.layers[index + 1].liquidMass += outflow;
      } else {
        this.state.runoff += outflow / 1000;
      }
    }
  }

  private compactLayers(dt: number, windSpeed: number): void {
    let overburden = 0;
    for (const layer of this.layers) {
      const mass = layer.iceMass + layer.liquidMass;
      const wetFraction = layer.liquidMass / Math.max(0.001, mass);
      const viscosity = 3.7e6 * Math.exp(0.08 * -layer.temperature + layer.density / 80);
      const gravityCompaction = overburden * 9.81 / viscosity;
      const metamorphism = 0.00002 * Math.exp(layer.temperature / 12) * (1 + wetFraction * 30);
      const windPacking = overburden === 0 ? Math.max(0, windSpeed - 3) * 0.000015 : 0;
      const rate = gravityCompaction + metamorphism + windPacking;
      layer.density = clamp(layer.density * Math.exp(rate * dt), 55, 650);
      layer.age += dt;
      overburden += mass;
    }
  }

  private evolveGrains(dt: number): void {
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      const wet = layer.liquidMass / Math.max(0.001, layer.iceMass + layer.liquidMass);
      const neighboringTemperature = this.layers[index + 1]?.temperature ?? layer.temperature;
      const gradient = Math.abs(layer.temperature - neighboringTemperature);
      const dryGrowth = 2e-10 * Math.exp(layer.temperature / 10) * (1 + gradient * 0.7);
      const wetGrowth = wet * 3e-8;
      layer.grainRadius = clamp(layer.grainRadius + (dryGrowth + wetGrowth) * dt, 0.00005, 0.003);
    }
  }

  private refreshState(): void {
    let depth = 0;
    let iceMass = 0;
    let liquid = 0;
    for (const layer of this.layers) {
      depth += layer.iceMass / Math.max(55, layer.density);
      iceMass += layer.iceMass;
      liquid += layer.liquidMass;
    }
    const top = this.layers[0];
    this.state.depth = depth;
    this.state.density = depth > 0 ? iceMass / depth : 120;
    this.state.waterEquivalent = (iceMass + liquid) / 1000;
    this.state.liquidWater = liquid / 1000;
    this.state.surfaceTemperature = top?.temperature ?? 0;
    this.state.strength = top ? this.layerStrength(top) : 0;
    if (top) {
      const grainDarkening = Math.sqrt(top.grainRadius / 0.0001) * 0.055;
      const impurityDarkening = Math.sqrt(Math.max(0, top.soot)) * 12;
      const wetDarkening = top.liquidMass / Math.max(0.001, top.iceMass + top.liquidMass) * 0.6;
      this.state.albedo = clamp(0.95 - grainDarkening - impurityDarkening - wetDarkening, 0.4, 0.93);
      this.state.roughness = clamp(0.001 + top.grainRadius * 7 + (1 - this.surfaceCompaction) * 0.003, 0.001, 0.03);
    } else {
      this.state.albedo = 0.85;
      this.state.roughness = 0.003;
    }
  }

  private layerStrength(layer: SnowLayer): number {
    const densityFactor = layer.density / 100;
    const wet = layer.liquidMass / Math.max(0.001, layer.iceMass + layer.liquidMass);
    const bonded = 1 + Math.min(1, layer.age / 3600) * 0.6;
    return Math.max(50, 180 * densityFactor ** 2.4 * bonded * (1 - wet * 0.7));
  }

  private removeEmptyLayers(): void {
    for (let index = this.layers.length - 1; index >= 0; index--) {
      const layer = this.layers[index];
      if (layer.iceMass >= 0.0001) continue;
      if (index < this.layers.length - 1) this.layers[index + 1].liquidMass += layer.liquidMass;
      else this.state.runoff += layer.liquidMass / 1000;
      this.layers.splice(index, 1);
    }
  }

  private mergeThinLayers(): void {
    for (let index = this.layers.length - 2; index >= 0; index--) {
      const layer = this.layers[index];
      const depth = layer.iceMass / layer.density;
      if (depth < 0.002 && layer.age > 300) this.mergeAt(index);
    }
    this.boundLayerCount();
  }

  private boundLayerCount(): void {
    while (this.layers.length > this.maximumLayers) this.mergeAt(this.layers.length - 2);
  }

  private mergeAt(index: number): void {
    const upper = this.layers[index];
    const lower = this.layers[index + 1];
    if (!upper || !lower) return;
    const upperMass = upper.iceMass + upper.liquidMass;
    const lowerMass = lower.iceMass + lower.liquidMass;
    const mass = Math.max(0.0001, upperMass + lowerMass);
    const volume = upper.iceMass / upper.density + lower.iceMass / lower.density;
    upper.temperature = (upper.temperature * upperMass + lower.temperature * lowerMass) / mass;
    upper.grainRadius = (upper.grainRadius * upperMass + lower.grainRadius * lowerMass) / mass;
    upper.soot = (upper.soot * upperMass + lower.soot * lowerMass) / mass;
    upper.age = (upper.age * upperMass + lower.age * lowerMass) / mass;
    upper.iceMass += lower.iceMass;
    upper.liquidMass += lower.liquidMass;
    upper.density = upper.iceMass / Math.max(0.00001, volume);
    this.layers.splice(index + 1, 1);
  }
}
