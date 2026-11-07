import * as THREE from "three";
import { ConservativeTransportGrid } from "../physics/transport-grid";
import { SedimentTransport, createSedimentSample } from "../physics/sediment-transport";
import { WaterColumnOptics, type WaterOpticalComposition } from "../physics/water-optics";
import type { ShallowWaterPatch } from "../physics/shallow-water";
import type { WeatherField } from "./weather-field";
import { clamp, saturate } from "../physics/math";

export type CoastalQualitySample = {
  temperature: number;
  salinity: number;
  oxygen: number;
  chlorophyll: number;
  turbidity: number;
  transparency: number;
  foamAlbedo: number;
  color: THREE.Color;
};

export function createCoastalQualitySample(): CoastalQualitySample {
  return { temperature: 18, salinity: 29, oxygen: 8, chlorophyll: 1.2, turbidity: 0, transparency: 0.7, foamAlbedo: 0.85, color: new THREE.Color(0.08, 0.24, 0.29) };
}

export class CoastalWaterQuality {
  readonly sediment: SedimentTransport;
  readonly heat: ConservativeTransportGrid;
  readonly salt: ConservativeTransportGrid;
  readonly oxygen: ConservativeTransportGrid;
  readonly chlorophyll: ConservativeTransportGrid;
  readonly nutrient: ConservativeTransportGrid;
  private readonly grids: ConservativeTransportGrid[];
  private readonly columns = 20;
  private readonly rows = 10;
  private readonly organic: Float64Array;
  private readonly colorR: Float32Array;
  private readonly colorG: Float32Array;
  private readonly colorB: Float32Array;
  private readonly transparency: Float32Array;
  private readonly foamAlbedo: Float32Array;
  private readonly sedimentSample = createSedimentSample();
  private readonly optics = new WaterColumnOptics();
  private readonly composition: WaterOpticalComposition = {
    chlorophyll: 1,
    sediment: 0,
    dissolvedOrganic: 0.4,
    salinity: 29,
    temperature: 18,
    depth: 1,
    bottomAlbedo: 0.22,
    solarElevation: 0.5,
    bubbles: 0,
  };
  private elapsed = 0;
  private readonly flow = { x: 0, z: 0, depth: 1, foam: 0 };
  private readonly initialDepth: Float32Array;
  private readonly flowSampler = (x: number, z: number, target: { x: number; z: number; depth: number; foam: number }) => {
    const column = clamp(Math.round((x - this.patch.bounds.minimumX) / this.patch.cellX), 0, this.patch.columns - 1);
    const row = clamp(Math.round((z - this.patch.bounds.minimumZ) / this.patch.cellZ), 0, this.patch.rows - 1);
    const index = row * this.patch.columns + column;
    target.x = this.patch.velocityX[index];
    target.z = this.patch.velocityZ[index];
    target.depth = this.patch.depth[index];
    target.foam = this.patch.foam[index];
  };

  constructor(readonly patch: ShallowWaterPatch, readonly weather: WeatherField) {
    this.sediment = new SedimentTransport(patch.bounds, this.columns, this.rows);
    this.heat = this.createGrid(291.15);
    this.salt = this.createGrid(29);
    this.oxygen = this.createGrid(8);
    this.chlorophyll = this.createGrid(1.2);
    this.nutrient = this.createGrid(0.3);
    this.grids = [this.heat, this.salt, this.oxygen, this.chlorophyll, this.nutrient];
    const count = this.columns * this.rows;
    this.organic = new Float64Array(count).fill(0.4);
    this.colorR = new Float32Array(count).fill(0.08);
    this.colorG = new Float32Array(count).fill(0.24);
    this.colorB = new Float32Array(count).fill(0.29);
    this.transparency = new Float32Array(count).fill(0.7);
    this.foamAlbedo = new Float32Array(count).fill(0.85);
    this.initialDepth = patch.depth.slice();
  }

  step(dt: number, seconds: number): void {
    this.sediment.step(dt, seconds, this.flowSampler, this.weather.state.windSpeed * 0.025, this.weather.state.rain);
    this.elapsed += clamp(dt, 0, 0.5);
    if (this.elapsed < 0.4) return;
    const duration = this.elapsed;
    this.elapsed = 0;
    const biologicalTime = duration * 36;
    const weather = this.weather.state;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const x = this.patch.bounds.minimumX + (column + 0.5) * this.heat.cellWidth;
        const z = this.patch.bounds.minimumZ + (row + 0.5) * this.heat.cellDepth;
        this.flowSampler(x, z, this.flow);
        const depth = Math.max(0.2, this.flow.depth);
        const speed = Math.hypot(this.flow.x, this.flow.z);
        const mixing = 0.03 + speed * depth * 0.05 + this.flow.foam * 0.1;
        for (const grid of this.grids) {
          grid.velocityX[index] = this.flow.x;
          grid.velocityZ[index] = this.flow.z;
          grid.diffusivity[index] = mixing;
          grid.source[index] = 0;
          grid.decay[index] = 0;
        }
        const temperature = this.heat.concentration[index] - 273.15;
        const solarHeat = weather.sunExposure * 600 * (1 - weather.cloud * 0.4);
        const convection = (8 + weather.windSpeed * 3) * (temperature - weather.temperature);
        const longwave = 0.96 * 5.670374419e-8 * ((temperature + 273.15) ** 4 - (weather.temperature + 265.15) ** 4);
        const heatChange = (solarHeat - convection - longwave) * biologicalTime / (1025 * 3990 * depth);
        this.heat.concentration[index] = clamp(this.heat.concentration[index] + heatChange, 269.15, 307.15);
        const freshwater = weather.rain * 0.00001 * biologicalTime / depth;
        const evaporation = weather.evaporation * biologicalTime * 0.000001 / depth;
        this.salt.concentration[index] = clamp(this.salt.concentration[index] * (1 - freshwater + evaporation), 4, 37);
        this.sediment.sample(x, z, this.sedimentSample);
        const sediment = this.sedimentSample.sand + this.sedimentSample.silt + this.sedimentSample.clay;
        const extinction = 0.15 + this.chlorophyll.concentration[index] * 0.03 + sediment * 120;
        const averageLight = weather.sunExposure * (1 - Math.exp(-extinction * depth)) / Math.max(0.001, extinction * depth);
        const lightLimitation = averageLight / (0.25 + averageLight);
        const nitrogen = this.nutrient.concentration[index];
        const nutrientLimitation = nitrogen / (0.08 + nitrogen);
        const thermalGrowth = Math.exp(-(((temperature - 21) / 14) ** 2));
        const growthRate = 0.000015 * lightLimitation * nutrientLimitation * thermalGrowth;
        const mortalityRate = 0.000004 + Math.max(0, temperature - 28) * 0.000001;
        const algae = this.chlorophyll.concentration[index];
        const newBiomass = Math.max(0, algae * growthRate * biologicalTime);
        const mortality = Math.min(algae, algae * mortalityRate * biologicalTime);
        this.chlorophyll.concentration[index] = clamp(algae + newBiomass - mortality, 0.05, 14);
        const nutrientUsed = Math.min(nitrogen, newBiomass * 0.08);
        const recycled = mortality * 0.035;
        const landInput = row < 2 ? weather.rain * biologicalTime * 0.00001 : 0;
        this.nutrient.concentration[index] = clamp(nitrogen - nutrientUsed + recycled + landInput, 0.005, 2);
        this.organic[index] = clamp(this.organic[index] + mortality * 0.05 + landInput * 2 - this.organic[index] * biologicalTime * 0.000002, 0.05, 3);
        const oxygenSaturation = this.oxygenSaturation(temperature, this.salt.concentration[index]);
        const surfaceExchange = (0.0005 + weather.windSpeed * weather.windSpeed * 0.00005 + this.flow.foam * 0.004) / depth;
        const reaeration = (oxygenSaturation - this.oxygen.concentration[index]) * (1 - Math.exp(-surfaceExchange * biologicalTime));
        const photosynthesis = newBiomass * 1.4;
        const respiration = this.organic[index] * Math.pow(1.06, temperature - 20) * biologicalTime * 0.000002;
        this.oxygen.concentration[index] = clamp(this.oxygen.concentration[index] + reaeration + photosynthesis - respiration, 0.5, 16);
        this.updateOptics(index, depth, sediment, weather.sunExposure, this.flow.foam);
      }
    }
    for (const grid of this.grids) grid.step(duration, seconds);
    for (let row = 0; row < this.patch.rows; row++) {
      for (let column = 0; column < this.patch.columns; column++) {
        const index = row * this.patch.columns + column;
        const x = this.patch.bounds.minimumX + column * this.patch.cellX;
        const z = this.patch.bounds.minimumZ + row * this.patch.cellZ;
        this.sediment.sample(x, z, this.sedimentSample);
        this.patch.depth[index] = Math.max(0.08, this.initialDepth[index] - this.sedimentSample.bedChange);
      }
    }
  }

  sample(x: number, z: number, result: CoastalQualitySample): CoastalQualitySample {
    result.temperature = this.heat.sample(x, z) - 273.15;
    result.salinity = this.salt.sample(x, z);
    result.oxygen = this.oxygen.sample(x, z);
    result.chlorophyll = this.chlorophyll.sample(x, z);
    this.sediment.sample(x, z, this.sedimentSample);
    result.turbidity = this.sedimentSample.turbidity;
    const column = clamp(Math.floor((x - this.patch.bounds.minimumX) / this.heat.cellWidth), 0, this.columns - 1);
    const row = clamp(Math.floor((z - this.patch.bounds.minimumZ) / this.heat.cellDepth), 0, this.rows - 1);
    const index = row * this.columns + column;
    result.color.setRGB(this.colorR[index], this.colorG[index], this.colorB[index]);
    result.transparency = this.transparency[index];
    result.foamAlbedo = this.foamAlbedo[index];
    return result;
  }

  reset(): void {
    this.elapsed = 0;
    this.sediment.reset();
    this.heat.reset(this.weather.state.temperature + 273.15);
    this.salt.reset(29);
    this.oxygen.reset(8);
    this.chlorophyll.reset(1.2);
    this.nutrient.reset(0.3);
    this.organic.fill(0.4);
    this.patch.depth.set(this.initialDepth);
  }

  private createGrid(initial: number): ConservativeTransportGrid {
    const grid = new ConservativeTransportGrid(this.patch.bounds, this.columns, this.rows);
    grid.reset(initial);
    grid.setBoundary(() => initial);
    return grid;
  }

  private updateOptics(index: number, depth: number, sediment: number, sun: number, bubbles: number): void {
    this.composition.chlorophyll = this.chlorophyll.concentration[index];
    this.composition.sediment = sediment * 1000;
    this.composition.dissolvedOrganic = this.organic[index];
    this.composition.salinity = this.salt.concentration[index];
    this.composition.temperature = this.heat.concentration[index] - 273.15;
    this.composition.depth = depth;
    this.composition.bottomAlbedo = 0.24;
    this.composition.solarElevation = Math.max(0.05, sun);
    this.composition.bubbles = bubbles;
    const optical = this.optics.evaluate(this.composition);
    const fresnel = this.optics.fresnel(0.65);
    this.colorR[index] = optical.color.r * (1 - fresnel);
    this.colorG[index] = optical.color.g * (1 - fresnel);
    this.colorB[index] = optical.color.b * (1 - fresnel);
    this.transparency[index] = optical.transparency;
    this.foamAlbedo[index] = optical.foamAlbedo;
  }

  private oxygenSaturation(temperature: number, salinity: number): number {
    const pure = 14.652 - 0.41022 * temperature + 0.007991 * temperature * temperature - 0.000077774 * temperature ** 3;
    const salineReduction = Math.exp(-salinity * 0.0056);
    return clamp(pure * salineReduction, 3, 15);
  }
}
