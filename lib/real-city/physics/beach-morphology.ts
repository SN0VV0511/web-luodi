import { clamp, exponentialApproach, saturate, smoothstep } from "./math";

export type BeachForcing = {
  tide: number;
  waveHeight: number;
  wavePeriod: number;
  waveAngle: number;
  windSpeed: number;
  rainfall: number;
  evaporation: number;
  temperature: number;
};

export type BeachSample = {
  shoreline: number;
  runup: number;
  backwash: number;
  foamWidth: number;
  wetness: number;
  groundwater: number;
  slope: number;
  elevation: number;
  grainSize: number;
  bermHeight: number;
  erosion: number;
  foamPersistence: number;
};

export function createBeachSample(): BeachSample {
  return {
    shoreline: 124,
    runup: 0,
    backwash: 0,
    foamWidth: 0.6,
    wetness: 0.5,
    groundwater: 0,
    slope: 0.035,
    elevation: 0.24,
    grainSize: 0.0003,
    bermHeight: 0.05,
    erosion: 0,
    foamPersistence: 0.5,
  };
}

export class BeachMorphology {
  readonly shoreline: Float64Array;
  readonly wetness: Float64Array;
  readonly groundwater: Float64Array;
  readonly slope: Float64Array;
  readonly sediment: Float64Array;
  readonly berm: Float64Array;
  readonly grain: Float64Array;
  readonly foam: Float64Array;
  private readonly initialShoreline: Float64Array;
  private readonly longshoreFlux: Float64Array;
  private readonly deltaSediment: Float64Array;
  private readonly waveSetup: Float64Array;
  private readonly lastRunup: Float64Array;
  private readonly maximumSwash: Float64Array;
  private readonly waterStorage: Float64Array;
  private readonly swashPhase: Float64Array;
  private readonly stormDose: Float64Array;
  private elapsed = 0;
  private lastSeconds: number | undefined;
  private forcing: BeachForcing = { tide: 0, waveHeight: 0.12, wavePeriod: 5, waveAngle: 0, windSpeed: 2, rainfall: 0, evaporation: 0.1, temperature: 18 };
  readonly cellWidth: number;

  constructor(readonly minimumX: number, readonly width: number, readonly cells = 64) {
    this.cellWidth = width / Math.max(1, cells - 1);
    this.shoreline = new Float64Array(cells);
    this.wetness = new Float64Array(cells).fill(0.4);
    this.groundwater = new Float64Array(cells).fill(-0.08);
    this.slope = new Float64Array(cells);
    this.sediment = new Float64Array(cells).fill(1.5);
    this.berm = new Float64Array(cells).fill(0.06);
    this.grain = new Float64Array(cells);
    this.foam = new Float64Array(cells);
    this.initialShoreline = new Float64Array(cells);
    this.longshoreFlux = new Float64Array(cells + 1);
    this.deltaSediment = new Float64Array(cells);
    this.waveSetup = new Float64Array(cells);
    this.lastRunup = new Float64Array(cells);
    this.maximumSwash = new Float64Array(cells).fill(124);
    this.waterStorage = new Float64Array(cells).fill(0.02);
    this.swashPhase = new Float64Array(cells);
    this.stormDose = new Float64Array(cells);
    for (let index = 0; index < cells; index++) {
      const x = minimumX + index * this.cellWidth;
      this.initialShoreline[index] = 124 + Math.sin(x * 0.027) * 0.15 + Math.sin(x * 0.071) * 0.06;
      this.shoreline[index] = this.initialShoreline[index];
      this.slope[index] = 0.03 + (0.5 + Math.sin(x * 0.038) * 0.5) * 0.014;
      this.grain[index] = 0.00022 + (0.5 + Math.cos(x * 0.044) * 0.5) * 0.00012;
      this.swashPhase[index] = x * 0.028;
    }
  }

  update(seconds: number, forcing: BeachForcing): void {
    this.forcing = forcing;
    if (this.lastSeconds === undefined || seconds < this.lastSeconds) {
      this.reset();
      this.lastSeconds = seconds;
      return;
    }
    const dt = clamp(seconds - this.lastSeconds, 0, 0.5);
    this.lastSeconds = seconds;
    this.elapsed += dt;
    if (this.elapsed < 0.2) return;
    const duration = this.elapsed;
    this.elapsed = 0;
    this.computeLongshoreTransport(duration);
    this.evolveProfile(duration, seconds);
    this.updateGroundwater(duration);
    this.smoothShoreline(duration);
  }

  sample(x: number, seconds: number, result: BeachSample): BeachSample {
    const coordinate = clamp((x - this.minimumX) / this.cellWidth, 0, this.cells - 1);
    const first = Math.floor(coordinate);
    const second = Math.min(this.cells - 1, first + 1);
    const fraction = coordinate - first;
    const interpolate = (array: Float64Array) => array[first] + (array[second] - array[first]) * fraction;
    const slope = interpolate(this.slope);
    const phase = interpolate(this.swashPhase);
    const period = Math.max(2, this.forcing.wavePeriod);
    const primary = Math.sin(seconds * Math.PI * 2 / period + phase);
    const infragravity = Math.sin(seconds * Math.PI * 2 / (period * 4.7) + phase * 0.35) * 0.28;
    const runupHeight = this.runupHeight(this.forcing.waveHeight, period, slope);
    const swash = (primary + infragravity) * runupHeight;
    const horizontalRunup = swash / Math.max(0.02, slope) * 0.1;
    const phaseVelocity = Math.cos(seconds * Math.PI * 2 / period + phase) * runupHeight * Math.PI * 2 / period;
    result.shoreline = interpolate(this.shoreline) + this.forcing.tide * 8 + horizontalRunup;
    result.runup = Math.max(0, horizontalRunup);
    result.backwash = Math.max(0, -phaseVelocity);
    result.foamWidth = clamp(0.25 + Math.abs(horizontalRunup) * 0.3 + this.forcing.waveHeight * 2, 0.2, 1.8);
    result.wetness = interpolate(this.wetness);
    result.groundwater = interpolate(this.groundwater);
    result.slope = slope;
    result.elevation = 0.24 + clamp(interpolate(this.sediment) - 1.5, -0.02, 0.02);
    result.grainSize = interpolate(this.grain);
    result.bermHeight = interpolate(this.berm);
    result.erosion = 1.5 - interpolate(this.sediment);
    result.foamPersistence = clamp(interpolate(this.foam) + Math.max(0, primary) * 0.35, 0, 1);
    return result;
  }

  reset(): void {
    this.shoreline.set(this.initialShoreline);
    this.wetness.fill(0.4);
    this.groundwater.fill(-0.08);
    this.sediment.fill(1.5);
    this.berm.fill(0.06);
    this.foam.fill(0);
    this.waveSetup.fill(0);
    this.lastRunup.fill(0);
    this.maximumSwash.fill(124);
    this.waterStorage.fill(0.02);
    this.stormDose.fill(0);
    this.elapsed = 0;
    this.lastSeconds = undefined;
  }

  private computeLongshoreTransport(dt: number): void {
    this.deltaSediment.fill(0);
    this.longshoreFlux.fill(0);
    const forcing = this.forcing;
    const waveEnergy = 1025 * 9.80665 * forcing.waveHeight * forcing.waveHeight / 8;
    for (let face = 1; face < this.cells; face++) {
      const left = face - 1;
      const right = face;
      const shoreAngle = Math.atan2(this.shoreline[right] - this.shoreline[left], this.cellWidth);
      const incidence = forcing.waveAngle - shoreAngle;
      const breakerDepth = Math.max(0.1, forcing.waveHeight / 0.78);
      const groupVelocity = Math.sqrt(9.80665 * breakerDepth);
      const energyFlux = waveEnergy * groupVelocity * Math.sin(incidence * 2);
      const mobility = 0.0000004 / Math.sqrt((this.grain[left] + this.grain[right]) * 0.5 / 0.0003);
      const requested = energyFlux * mobility;
      const donor = requested >= 0 ? left : right;
      const maximum = this.sediment[donor] * this.cellWidth / Math.max(0.001, dt) * 0.05;
      this.longshoreFlux[face] = clamp(requested, -maximum, maximum);
    }
    for (let index = 0; index < this.cells; index++) {
      const change = (this.longshoreFlux[index] - this.longshoreFlux[index + 1]) * dt / this.cellWidth;
      this.deltaSediment[index] += change;
    }
    for (let index = 0; index < this.cells; index++) this.sediment[index] = clamp(this.sediment[index] + this.deltaSediment[index], 1.1, 1.9);
  }

  private evolveProfile(dt: number, seconds: number): void {
    const forcing = this.forcing;
    for (let index = 0; index < this.cells; index++) {
      const slope = this.slope[index];
      const runup = this.runupHeight(forcing.waveHeight, forcing.wavePeriod, slope);
      const threshold = this.berm[index] + 0.03;
      const overwash = Math.max(0, forcing.tide + runup - threshold);
      const settling = this.grainSettling(this.grain[index]);
      const fallVelocityParameter = forcing.waveHeight / Math.max(0.0001, settling * forcing.wavePeriod);
      const erosive = smoothstep(3, 8, fallVelocityParameter);
      const accretive = 1 - smoothstep(1.5, 4, fallVelocityParameter);
      const erosion = erosive * overwash * dt * 0.0008;
      const accretion = accretive * Math.max(0, 1.5 - this.sediment[index]) * dt * 0.00015;
      this.sediment[index] = clamp(this.sediment[index] - erosion + accretion, 1.1, 1.9);
      this.stormDose[index] = Math.max(0, this.stormDose[index] + erosive * dt - accretive * dt * 0.1);
      this.berm[index] = clamp(this.berm[index] - erosion * 0.3 + accretion * 0.2, 0.01, 0.12);
      const equilibriumSlope = clamp(0.028 + this.grain[index] * 50 - erosive * 0.008, 0.02, 0.065);
      this.slope[index] = exponentialApproach(this.slope[index], equilibriumSlope, 0.001, dt);
      const sedimentOffset = (1.5 - this.sediment[index]) / Math.max(0.05, slope) * 0.12;
      const targetShoreline = this.initialShoreline[index] - sedimentOffset;
      this.shoreline[index] = exponentialApproach(this.shoreline[index], targetShoreline, 0.08, dt);
      this.waveSetup[index] = runup * 0.35;
      const phase = seconds * Math.PI * 2 / Math.max(2, forcing.wavePeriod) + this.swashPhase[index];
      const wave = Math.sin(phase);
      const inundation = saturate(wave * 0.5 + 0.5);
      const waterInput = inundation * runup * dt * 0.02 + forcing.rainfall * dt * 0.00002;
      const infiltration = Math.min(this.waterStorage[index], this.permeability(this.grain[index]) * dt);
      this.waterStorage[index] = clamp(this.waterStorage[index] + waterInput - infiltration, 0, 0.1);
      this.groundwater[index] += infiltration * 0.8;
      const evaporation = forcing.evaporation * dt * 0.0002;
      const wetTarget = saturate(this.waterStorage[index] * 20 + Math.max(0, this.groundwater[index] + 0.1) * 4);
      this.wetness[index] = clamp(exponentialApproach(this.wetness[index], wetTarget, 0.4, dt) - evaporation, 0, 1);
      const breakingFoam = Math.max(0, wave - this.lastRunup[index]) * 0.4 + forcing.waveHeight * 0.08;
      this.foam[index] = clamp(this.foam[index] * Math.exp(-dt * (0.35 + forcing.windSpeed * 0.02)) + breakingFoam, 0, 1);
      this.lastRunup[index] = wave;
      this.maximumSwash[index] = Math.max(this.shoreline[index] + runup, this.maximumSwash[index] - dt * 0.002);
    }
  }

  private updateGroundwater(dt: number): void {
    this.deltaSediment.fill(0);
    for (let index = 0; index < this.cells - 1; index++) {
      const conductivity = (this.permeability(this.grain[index]) + this.permeability(this.grain[index + 1])) * 0.5;
      const difference = this.groundwater[index] - this.groundwater[index + 1];
      const transfer = difference * Math.min(0.2, conductivity * dt / (this.cellWidth * this.cellWidth));
      this.deltaSediment[index] -= transfer;
      this.deltaSediment[index + 1] += transfer;
    }
    for (let index = 0; index < this.cells; index++) {
      const tideTarget = this.forcing.tide + this.waveSetup[index] - 0.12;
      const connection = this.permeability(this.grain[index]) * 2;
      this.groundwater[index] = exponentialApproach(this.groundwater[index] + this.deltaSediment[index], tideTarget, connection, dt);
      this.groundwater[index] = clamp(this.groundwater[index], -0.4, 0.15);
    }
  }

  private smoothShoreline(dt: number): void {
    this.deltaSediment.fill(0);
    for (let index = 1; index < this.cells - 1; index++) {
      const curvature = this.shoreline[index - 1] + this.shoreline[index + 1] - this.shoreline[index] * 2;
      this.deltaSediment[index] = curvature * Math.min(0.1, dt * 0.015);
    }
    for (let index = 1; index < this.cells - 1; index++) this.shoreline[index] += this.deltaSediment[index];
  }

  private runupHeight(waveHeight: number, period: number, slope: number): number {
    const wavelength = 9.80665 * period * period / (2 * Math.PI);
    const scale = Math.sqrt(Math.max(0, waveHeight * wavelength));
    const setup = 0.35 * slope * scale;
    const swash = 0.5 * scale * Math.sqrt(0.563 * slope * slope + 0.004);
    return clamp(1.1 * (setup + swash), 0.02, 0.38);
  }

  private permeability(grain: number): number {
    const porosity = 0.4;
    const permeability = grain * grain * porosity ** 3 / (180 * (1 - porosity) ** 2);
    return clamp(permeability * 1000 * 9.80665 / 0.001, 0.00001, 0.003);
  }

  private grainSettling(diameter: number): number {
    const relativeDensity = 2650 / 1025 - 1;
    return relativeDensity * 9.80665 * diameter * diameter / (18 * 1.05e-6 + Math.sqrt(0.75 * relativeDensity * 9.80665 * diameter ** 3));
  }
}
