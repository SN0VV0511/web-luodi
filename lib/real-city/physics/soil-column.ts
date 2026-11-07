import { clamp, saturate } from "./math";

export type SoilLayer = {
  depth: number;
  porosity: number;
  residualWater: number;
  fieldCapacity: number;
  wiltingPoint: number;
  saturatedConductivity: number;
  capillaryScale: number;
  poreExponent: number;
  rootFraction: number;
};

export type SoilForcing = {
  inputWater: number;
  evaporation: number;
  transpiration: number;
  temperature: number;
  rootActivity: number;
  surfacePressure: number;
  groundwaterHead: number;
};

export type SoilFlux = {
  infiltration: number;
  runoff: number;
  evaporation: number;
  rootUptake: number;
  drainage: number;
  capillaryRise: number;
  waterStress: number;
  oxygenStress: number;
  saturation: number;
  storage: number;
};

export function createSoilFlux(): SoilFlux {
  return {
    infiltration: 0,
    runoff: 0,
    evaporation: 0,
    rootUptake: 0,
    drainage: 0,
    capillaryRise: 0,
    waterStress: 0,
    oxygenStress: 0,
    saturation: 0,
    storage: 0,
  };
}

export class SoilColumn {
  readonly water: Float64Array;
  readonly ice: Float64Array;
  readonly pressure: Float64Array;
  readonly conductivity: Float64Array;
  readonly rootExtraction: Float64Array;
  readonly flux = createSoilFlux();
  private readonly transfers: Float64Array;
  private readonly incoming: Float64Array;
  private readonly initialWater: Float64Array;
  private compaction = 0;
  private cumulativeDrainage = 0;
  private cumulativeUptake = 0;
  private surfaceCrust = 0;

  constructor(readonly layers: readonly SoilLayer[], initialSaturation = 0.6) {
    if (layers.length === 0) throw new Error("Soil column requires a layer");
    this.water = new Float64Array(layers.length);
    this.ice = new Float64Array(layers.length);
    this.pressure = new Float64Array(layers.length);
    this.conductivity = new Float64Array(layers.length);
    this.rootExtraction = new Float64Array(layers.length);
    this.transfers = new Float64Array(Math.max(0, layers.length - 1));
    this.incoming = new Float64Array(layers.length);
    this.initialWater = new Float64Array(layers.length);
    for (let index = 0; index < layers.length; index++) {
      const layer = layers[index];
      const fraction = layer.residualWater + (layer.porosity - layer.residualWater) * saturate(initialSaturation);
      this.water[index] = fraction * layer.depth;
      this.initialWater[index] = this.water[index];
    }
    this.refreshHydraulicState();
  }

  step(seconds: number, forcing: SoilForcing): SoilFlux {
    if (!Number.isFinite(seconds) || seconds <= 0) return this.flux;
    const dt = Math.min(seconds, 600);
    Object.assign(this.flux, createSoilFlux());
    this.rootExtraction.fill(0);
    this.partitionFrozenWater(forcing.temperature, dt);
    this.refreshHydraulicState();
    const initialStorage = this.storedWater();
    const surface = this.layers[0];
    const available = Math.max(0, forcing.inputWater);
    const capillaryPull = Math.max(0, -this.pressure[0]);
    const deficit = Math.max(0, surface.porosity * surface.depth - this.water[0] - this.ice[0]);
    const wettingFront = Math.max(0.005, this.water[0] / Math.max(0.01, surface.porosity));
    const suctionFactor = 1 + capillaryPull / wettingFront;
    const conductivity = this.conductivity[0] * Math.exp(-this.compaction * 3.2 - this.surfaceCrust * 1.7);
    const infiltrationCapacity = conductivity * suctionFactor * dt;
    const surfaceInfiltration = Math.min(available, deficit, infiltrationCapacity);
    this.water[0] += surfaceInfiltration;
    this.flux.infiltration = surfaceInfiltration;
    this.flux.runoff = available - surfaceInfiltration;
    this.transport(dt);
    this.evaporate(Math.max(0, forcing.evaporation), dt);
    this.extractRoots(Math.max(0, forcing.transpiration), saturate(forcing.rootActivity), dt);
    this.exchangeGroundwater(forcing.groundwaterHead, dt);
    this.drainExcess(dt);
    this.compaction = clamp(this.compaction + forcing.surfacePressure * dt * 1e-8 - dt * 0.000015, 0, 0.85);
    const surfaceDryness = 1 - this.effectiveSaturation(0);
    this.surfaceCrust = clamp(this.surfaceCrust + (surfaceDryness * 0.00006 - surfaceInfiltration * 12) * dt, 0, 1);
    this.refreshHydraulicState();
    let weightedSaturation = 0;
    let weight = 0;
    for (let index = 0; index < this.layers.length; index++) {
      weightedSaturation += this.effectiveSaturation(index) * this.layers[index].depth;
      weight += this.layers[index].depth;
    }
    this.flux.saturation = weight > 0 ? weightedSaturation / weight : 0;
    this.flux.storage = this.storedWater();
    const storageChange = this.flux.storage - initialStorage;
    const accountedChange = this.flux.infiltration + this.flux.capillaryRise - this.flux.evaporation - this.flux.rootUptake - this.flux.drainage;
    const roundoff = accountedChange - storageChange;
    if (Math.abs(roundoff) < 1e-7 && this.water.length > 0) this.water[0] += roundoff;
    this.cumulativeDrainage += this.flux.drainage;
    this.cumulativeUptake += this.flux.rootUptake;
    return this.flux;
  }

  effectiveSaturation(index: number): number {
    const layer = this.layers[index];
    if (!layer) return 0;
    const availablePorosity = Math.max(layer.residualWater + 0.001, layer.porosity - this.ice[index] / layer.depth);
    const fraction = this.water[index] / layer.depth;
    return saturate((fraction - layer.residualWater) / (availablePorosity - layer.residualWater));
  }

  volumetricWater(index: number): number {
    const layer = this.layers[index];
    return layer ? clamp(this.water[index] / layer.depth, 0, layer.porosity) : 0;
  }

  rootZoneMoisture(): number {
    let weighted = 0;
    let total = 0;
    for (let index = 0; index < this.layers.length; index++) {
      weighted += this.volumetricWater(index) * this.layers[index].rootFraction;
      total += this.layers[index].rootFraction;
    }
    return total > 0 ? weighted / total : 0;
  }

  plantAvailableWater(): number {
    let available = 0;
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      available += Math.max(0, this.water[index] - layer.wiltingPoint * layer.depth) * layer.rootFraction;
    }
    return available;
  }

  storedWater(): number {
    let total = 0;
    for (let index = 0; index < this.water.length; index++) total += this.water[index] + this.ice[index];
    return total;
  }

  bearingStrength(): number {
    const wet = this.effectiveSaturation(0);
    const frozen = this.ice[0] / Math.max(0.001, this.layers[0].porosity * this.layers[0].depth);
    const cohesion = 10000 + this.compaction * 75000;
    const saturationLoss = 1 - Math.pow(wet, 3) * 0.82;
    return cohesion * saturationLoss + frozen * 160000;
  }

  compact(pressure: number, contactSeconds: number): void {
    const yieldStrength = this.bearingStrength();
    const excess = Math.max(0, pressure - yieldStrength);
    this.compaction = clamp(this.compaction + excess * Math.max(0, contactSeconds) / 2e6, 0, 0.85);
  }

  reset(): void {
    this.water.set(this.initialWater);
    this.ice.fill(0);
    this.rootExtraction.fill(0);
    this.compaction = 0;
    this.surfaceCrust = 0;
    this.cumulativeDrainage = 0;
    this.cumulativeUptake = 0;
    Object.assign(this.flux, createSoilFlux());
    this.refreshHydraulicState();
  }

  private refreshHydraulicState(): void {
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      const saturation = clamp(this.effectiveSaturation(index), 0.0001, 1);
      const m = 1 - 1 / Math.max(1.1, layer.poreExponent);
      const pressureTerm = Math.max(0, Math.pow(saturation, -1 / m) - 1);
      this.pressure[index] = -Math.pow(pressureTerm, 1 / layer.poreExponent) / Math.max(0.1, layer.capillaryScale);
      const factor = 1 - Math.pow(1 - Math.pow(saturation, 1 / m), m);
      const iceFraction = this.ice[index] / Math.max(0.001, layer.porosity * layer.depth);
      this.conductivity[index] = layer.saturatedConductivity * Math.sqrt(saturation) * factor * factor * Math.exp(-iceFraction * 9);
      this.pressure[index] = clamp(this.pressure[index], -10000, 0);
    }
  }

  private transport(dt: number): void {
    this.incoming.fill(0);
    this.transfers.fill(0);
    for (let index = 0; index < this.layers.length - 1; index++) {
      const distance = (this.layers[index].depth + this.layers[index + 1].depth) * 0.5;
      const left = this.conductivity[index];
      const right = this.conductivity[index + 1];
      const meanConductivity = left + right > 1e-15 ? 2 * left * right / (left + right) : 0;
      const gradient = 1 + (this.pressure[index] - this.pressure[index + 1]) / distance;
      const requested = meanConductivity * gradient * dt;
      if (requested >= 0) {
        const available = Math.max(0, this.water[index] - this.layers[index].residualWater * this.layers[index].depth);
        const capacity = Math.max(0, this.layers[index + 1].porosity * this.layers[index + 1].depth - this.water[index + 1] - this.ice[index + 1]);
        this.transfers[index] = Math.min(requested, available * 0.45, capacity * 0.45);
      } else {
        const available = Math.max(0, this.water[index + 1] - this.layers[index + 1].residualWater * this.layers[index + 1].depth);
        const capacity = Math.max(0, this.layers[index].porosity * this.layers[index].depth - this.water[index] - this.ice[index]);
        this.transfers[index] = -Math.min(-requested, available * 0.45, capacity * 0.45);
      }
    }
    for (let index = 0; index < this.transfers.length; index++) {
      this.incoming[index] -= this.transfers[index];
      this.incoming[index + 1] += this.transfers[index];
    }
    for (let index = 0; index < this.water.length; index++) this.water[index] += this.incoming[index];
  }

  private evaporate(potentialRate: number, dt: number): void {
    const layer = this.layers[0];
    const fraction = this.volumetricWater(0);
    const resistance = saturate((fraction - layer.residualWater) / Math.max(0.001, layer.fieldCapacity - layer.residualWater));
    const available = Math.max(0, this.water[0] - layer.residualWater * layer.depth);
    const extracted = Math.min(available, potentialRate * dt * resistance * resistance);
    this.water[0] -= extracted;
    this.flux.evaporation = extracted;
  }

  private extractRoots(potentialRate: number, activity: number, dt: number): void {
    let totalRootFraction = 0;
    let stress = 0;
    let oxygenStress = 0;
    for (const layer of this.layers) totalRootFraction += layer.rootFraction;
    if (totalRootFraction <= 0 || potentialRate <= 0) return;
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      const fraction = this.volumetricWater(index);
      const rootWeight = layer.rootFraction / totalRootFraction;
      const dryFactor = saturate((fraction - layer.wiltingPoint) / Math.max(0.001, layer.fieldCapacity - layer.wiltingPoint));
      const airFraction = Math.max(0, layer.porosity - fraction - this.ice[index] / layer.depth);
      const oxygenFactor = saturate(airFraction / 0.08);
      const demand = potentialRate * dt * rootWeight * activity * dryFactor * oxygenFactor;
      const available = Math.max(0, this.water[index] - layer.wiltingPoint * layer.depth);
      const extracted = Math.min(available, demand);
      this.water[index] -= extracted;
      this.rootExtraction[index] = extracted;
      this.flux.rootUptake += extracted;
      stress += (1 - dryFactor) * rootWeight;
      oxygenStress += (1 - oxygenFactor) * rootWeight;
    }
    this.flux.waterStress = saturate(stress);
    this.flux.oxygenStress = saturate(oxygenStress);
  }

  private exchangeGroundwater(head: number, dt: number): void {
    if (!Number.isFinite(head)) return;
    const last = this.layers.length - 1;
    const layer = this.layers[last];
    const gradient = (head - this.pressure[last]) / Math.max(0.1, layer.depth);
    const requested = this.conductivity[last] * gradient * dt;
    if (requested <= 0) return;
    const capacity = Math.max(0, layer.porosity * layer.depth - this.water[last] - this.ice[last]);
    const added = Math.min(requested, capacity, 0.002 * dt);
    this.water[last] += added;
    this.flux.capillaryRise = added;
  }

  private drainExcess(dt: number): void {
    const last = this.layers.length - 1;
    const layer = this.layers[last];
    const gravityWater = Math.max(0, this.water[last] - layer.fieldCapacity * layer.depth);
    const drained = Math.min(gravityWater, this.conductivity[last] * dt);
    this.water[last] -= drained;
    this.flux.drainage += drained;
    for (let index = 0; index < this.layers.length; index++) {
      const capacity = this.layers[index].porosity * this.layers[index].depth - this.ice[index];
      const excess = Math.max(0, this.water[index] - capacity);
      this.water[index] -= excess;
      if (index < last) this.water[index + 1] += excess;
      else this.flux.drainage += excess;
    }
  }

  private partitionFrozenWater(temperature: number, dt: number): void {
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      const depthTemperature = temperature + index * 0.8;
      const residual = layer.residualWater * layer.depth;
      if (depthTemperature < -0.2) {
        const mobile = Math.max(0, this.water[index] - residual);
        const frozen = Math.min(mobile, -depthTemperature * dt * 0.000002 * layer.depth);
        this.water[index] -= frozen;
        this.ice[index] += frozen;
      } else if (depthTemperature > 0) {
        const melted = Math.min(this.ice[index], depthTemperature * dt * 0.000003 * layer.depth);
        this.ice[index] -= melted;
        this.water[index] += melted;
      }
    }
  }
}

export function layeredSoilProfile(sand: boolean, rootDensity: number): SoilLayer[] {
  const porosity = sand ? 0.43 : 0.48;
  const residual = sand ? 0.035 : 0.065;
  const capacity = sand ? 0.14 : 0.31;
  const wilting = sand ? 0.055 : 0.12;
  const conductivity = sand ? 0.000075 : 0.000008;
  const layers: SoilLayer[] = [];
  const depths = [0.05, 0.15, 0.4];
  for (let index = 0; index < depths.length; index++) {
    layers.push({
      depth: depths[index],
      porosity: porosity - index * 0.015,
      residualWater: residual,
      fieldCapacity: capacity,
      wiltingPoint: wilting,
      saturatedConductivity: conductivity * Math.pow(0.7, index),
      capillaryScale: sand ? 12 : 3.6,
      poreExponent: sand ? 2.7 : 1.55,
      rootFraction: rootDensity * Math.exp(-index * 0.8),
    });
  }
  return layers;
}
