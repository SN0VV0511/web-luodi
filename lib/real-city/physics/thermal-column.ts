import { clamp } from "./math";

export type ThermalLayer = {
  thickness: number;
  conductivity: number;
  density: number;
  specificHeat: number;
  waterContent: number;
};

export type ThermalBoundary = {
  airTemperature: number;
  deepTemperature: number;
  solarFlux: number;
  skyTemperature: number;
  windSpeed: number;
  wetness: number;
  evaporation: number;
  snowDepth: number;
  snowDensity: number;
  emissivity: number;
  albedo: number;
};

export type ThermalExchange = {
  solar: number;
  longwave: number;
  convection: number;
  evaporation: number;
  conduction: number;
  storage: number;
  surface: number;
  deep: number;
};

export function createThermalExchange(): ThermalExchange {
  return {
    solar: 0,
    longwave: 0,
    convection: 0,
    evaporation: 0,
    conduction: 0,
    storage: 0,
    surface: 0,
    deep: 0,
  };
}

export class ThermalColumn {
  readonly temperatures: Float64Array;
  readonly capacity: Float64Array;
  readonly conductivity: Float64Array;
  readonly liquidFraction: Float64Array;
  readonly exchange = createThermalExchange();
  private readonly lower: Float64Array;
  private readonly diagonal: Float64Array;
  private readonly upper: Float64Array;
  private readonly right: Float64Array;
  private readonly previous: Float64Array;
  private readonly source: Float64Array;
  private readonly interfaces: Float64Array;
  private initialTemperature: number;
  private initialDeepTemperature: number;

  constructor(readonly layers: readonly ThermalLayer[], temperature: number) {
    if (layers.length === 0) throw new Error("Thermal column requires a layer");
    this.temperatures = new Float64Array(layers.length).fill(temperature);
    this.capacity = new Float64Array(layers.length);
    this.conductivity = new Float64Array(layers.length);
    this.liquidFraction = new Float64Array(layers.length);
    this.lower = new Float64Array(layers.length);
    this.diagonal = new Float64Array(layers.length);
    this.upper = new Float64Array(layers.length);
    this.right = new Float64Array(layers.length);
    this.previous = new Float64Array(layers.length);
    this.source = new Float64Array(layers.length);
    this.interfaces = new Float64Array(Math.max(0, layers.length - 1));
    this.initialTemperature = temperature;
    this.initialDeepTemperature = temperature;
    this.refreshMaterialState();
  }

  setWaterContent(index: number, water: number): void {
    const layer = this.layers[index];
    if (!layer) return;
    layer.waterContent = clamp(water, 0, 0.55);
  }

  addHeat(index: number, joulesPerSquareMetre: number): void {
    if (index < 0 || index >= this.layers.length) return;
    if (!Number.isFinite(joulesPerSquareMetre)) return;
    this.source[index] += joulesPerSquareMetre;
  }

  setInitialTemperature(surface: number, deep = surface): void {
    this.initialTemperature = surface;
    this.initialDeepTemperature = deep;
    this.reset();
  }

  step(dt: number, boundary: ThermalBoundary): ThermalExchange {
    if (!Number.isFinite(dt) || dt <= 0) return this.exchange;
    const duration = Math.min(dt, 1800);
    this.previous.set(this.temperatures);
    this.refreshMaterialState();
    this.buildInterfaces();
    const topTemperature = this.temperatures[0];
    const kelvinSurface = clamp(topTemperature + 273.15, 170, 370);
    const kelvinSky = clamp(boundary.skyTemperature + 273.15, 150, 350);
    const sigma = 5.670374419e-8;
    const emissivity = clamp(boundary.emissivity, 0.05, 1);
    const radiationCoefficient = 4 * emissivity * sigma * kelvinSurface ** 3;
    const emittedLongwave = emissivity * sigma * (kelvinSky ** 4 - kelvinSurface ** 4);
    const convectionCoefficient = 5.7 + 3.8 * Math.sqrt(Math.max(0, boundary.windSpeed));
    const snowConductivity = this.snowConductivity(boundary.snowDensity);
    const snowResistance = Math.max(0, boundary.snowDepth) / snowConductivity;
    const atmosphericConductance = convectionCoefficient + radiationCoefficient;
    const surfaceConductance = 1 / (1 / Math.max(0.01, atmosphericConductance) + snowResistance);
    const insulation = surfaceConductance / Math.max(0.01, atmosphericConductance);
    const absorbedSolar = Math.max(0, boundary.solarFlux) * (1 - clamp(boundary.albedo, 0, 0.98));
    const latentFlux = Math.max(0, boundary.evaporation) * 2.45e6 * clamp(boundary.wetness, 0, 1);
    const externalFlux = absorbedSolar + emittedLongwave - latentFlux;
    const equivalentAir = (externalFlux + topTemperature * radiationCoefficient + boundary.airTemperature * convectionCoefficient) / atmosphericConductance;
    const last = this.layers.length - 1;
    const bottomConductance = this.conductivity[last] / Math.max(0.01, this.layers[last].thickness * 0.5);
    for (let index = 0; index < this.layers.length; index++) {
      const storage = this.capacity[index] / duration;
      const before = index === 0 ? surfaceConductance : this.interfaces[index - 1];
      const after = index === last ? bottomConductance : this.interfaces[index];
      this.lower[index] = index === 0 ? 0 : -before;
      this.upper[index] = index === last ? 0 : -after;
      this.diagonal[index] = storage + before + after;
      this.right[index] = storage * this.previous[index] + this.source[index] / duration;
      if (index === 0) this.right[index] += surfaceConductance * equivalentAir;
      if (index === last) this.right[index] += bottomConductance * boundary.deepTemperature;
    }
    this.solveTridiagonal();
    let stored = 0;
    for (let index = 0; index < this.layers.length; index++) {
      this.temperatures[index] = clamp(this.temperatures[index], -65, 95);
      stored += (this.temperatures[index] - this.previous[index]) * this.capacity[index] / duration;
      this.source[index] = 0;
    }
    this.exchange.solar = absorbedSolar * insulation;
    this.exchange.longwave = emittedLongwave * insulation;
    this.exchange.convection = convectionCoefficient * (boundary.airTemperature - topTemperature) * insulation;
    this.exchange.evaporation = -latentFlux * insulation;
    this.exchange.conduction = this.layers.length > 1 ? this.interfaces[0] * (this.temperatures[1] - this.temperatures[0]) : 0;
    this.exchange.storage = stored;
    this.exchange.surface = this.temperatures[0];
    this.exchange.deep = this.temperatures[last];
    return this.exchange;
  }

  temperatureAtDepth(depth: number): number {
    if (depth <= 0) return this.temperatures[0];
    let centre = this.layers[0].thickness * 0.5;
    if (depth <= centre) return this.temperatures[0];
    for (let index = 1; index < this.layers.length; index++) {
      const nextCentre = centre + (this.layers[index - 1].thickness + this.layers[index].thickness) * 0.5;
      if (depth <= nextCentre) {
        const fraction = (depth - centre) / Math.max(0.0001, nextCentre - centre);
        return this.temperatures[index - 1] + (this.temperatures[index] - this.temperatures[index - 1]) * fraction;
      }
      centre = nextCentre;
    }
    return this.temperatures[this.temperatures.length - 1];
  }

  totalStoredEnergy(referenceTemperature = 0): number {
    let total = 0;
    for (let index = 0; index < this.layers.length; index++) {
      const sensible = (this.temperatures[index] - referenceTemperature) * this.capacity[index];
      const waterMass = this.layers[index].waterContent * this.layers[index].thickness * 1000;
      const latent = waterMass * 334000 * this.liquidFraction[index];
      total += sensible + latent;
    }
    return total;
  }

  thermalPenetration(seconds: number): number {
    const top = this.layers[0];
    const capacityDensity = Math.max(1, this.capacity[0] / top.thickness);
    const diffusivity = this.conductivity[0] / capacityDensity;
    return Math.sqrt(Math.max(0, seconds) * diffusivity);
  }

  reset(): void {
    let totalDepth = 0;
    for (const layer of this.layers) totalDepth += layer.thickness;
    let depth = 0;
    for (let index = 0; index < this.layers.length; index++) {
      depth += this.layers[index].thickness * 0.5;
      const fraction = totalDepth > 0 ? depth / totalDepth : 0;
      this.temperatures[index] = this.initialTemperature + (this.initialDeepTemperature - this.initialTemperature) * fraction;
      depth += this.layers[index].thickness * 0.5;
    }
    this.source.fill(0);
    this.refreshMaterialState();
    Object.assign(this.exchange, createThermalExchange());
  }

  private refreshMaterialState(): void {
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      const temperature = this.temperatures[index];
      const liquid = clamp((temperature + 0.5) / 1, 0, 1);
      const waterMass = layer.waterContent * layer.thickness * 1000;
      const dryMass = layer.density * layer.thickness;
      const latentCapacity = temperature > -0.5 && temperature < 0.5 ? waterMass * 334000 : 0;
      const waterHeat = waterMass * (2100 + liquid * 2080);
      this.capacity[index] = Math.max(10, dryMass * layer.specificHeat + waterHeat + latentCapacity);
      this.conductivity[index] = Math.max(0.01, layer.conductivity * (1 + layer.waterContent * 1.8) + (1 - liquid) * layer.waterContent * 1.6);
      this.liquidFraction[index] = liquid;
    }
  }

  private buildInterfaces(): void {
    for (let index = 0; index < this.interfaces.length; index++) {
      const leftResistance = this.layers[index].thickness * 0.5 / this.conductivity[index];
      const rightResistance = this.layers[index + 1].thickness * 0.5 / this.conductivity[index + 1];
      this.interfaces[index] = 1 / Math.max(0.0001, leftResistance + rightResistance);
    }
  }

  private solveTridiagonal(): void {
    for (let index = 1; index < this.layers.length; index++) {
      const pivot = Math.max(1e-9, this.diagonal[index - 1]);
      const multiplier = this.lower[index] / pivot;
      this.diagonal[index] -= multiplier * this.upper[index - 1];
      this.right[index] -= multiplier * this.right[index - 1];
    }
    const last = this.layers.length - 1;
    this.temperatures[last] = this.right[last] / Math.max(1e-9, this.diagonal[last]);
    for (let index = last - 1; index >= 0; index--) {
      this.temperatures[index] = (this.right[index] - this.upper[index] * this.temperatures[index + 1]) / Math.max(1e-9, this.diagonal[index]);
    }
  }

  private snowConductivity(density: number): number {
    const fraction = clamp(density / 1000, 0.03, 0.65);
    return Math.max(0.025, 0.024 + 2.5 * fraction * fraction);
  }
}

export function mineralThermalLayers(porous: boolean, sand: boolean, rooftop: boolean): ThermalLayer[] {
  if (rooftop) {
    return [
      { thickness: 0.03, conductivity: 0.7, density: 1800, specificHeat: 840, waterContent: 0.01 },
      { thickness: 0.1, conductivity: 0.045, density: 50, specificHeat: 1400, waterContent: 0 },
      { thickness: 0.2, conductivity: 1.4, density: 2300, specificHeat: 880, waterContent: 0.01 },
    ];
  }
  if (sand) {
    return [
      { thickness: 0.03, conductivity: 0.27, density: 1600, specificHeat: 830, waterContent: 0.03 },
      { thickness: 0.12, conductivity: 0.4, density: 1680, specificHeat: 840, waterContent: 0.08 },
      { thickness: 0.45, conductivity: 0.75, density: 1750, specificHeat: 850, waterContent: 0.15 },
    ];
  }
  if (porous) {
    return [
      { thickness: 0.03, conductivity: 0.25, density: 1100, specificHeat: 1500, waterContent: 0.18 },
      { thickness: 0.14, conductivity: 0.7, density: 1350, specificHeat: 1200, waterContent: 0.25 },
      { thickness: 0.43, conductivity: 1.1, density: 1550, specificHeat: 950, waterContent: 0.28 },
    ];
  }
  return [
    { thickness: 0.04, conductivity: 0.75, density: 2200, specificHeat: 920, waterContent: 0.01 },
    { thickness: 0.16, conductivity: 1.5, density: 2250, specificHeat: 850, waterContent: 0.02 },
    { thickness: 0.4, conductivity: 1.1, density: 1700, specificHeat: 1000, waterContent: 0.14 },
  ];
}
