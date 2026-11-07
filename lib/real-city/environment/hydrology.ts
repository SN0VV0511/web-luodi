import { clamp, createRandom, exponentialApproach, saturate } from "../physics/math";
import { CityTerrain, createTerrainPoint, type TerrainKind } from "./terrain";
import { WeatherField } from "./weather-field";
import { SurfaceEnergyField, createSurfaceEnergySample } from "./surface-energy";

export type SurfaceSample = {
  water: number;
  snow: number;
  ice: number;
  wetness: number;
  saturation: number;
  temperature: number;
  runoffX: number;
  runoffZ: number;
  footprint: number;
};

export class SurfaceHydrology {
  readonly columns = 40;
  readonly rows = 32;
  readonly minimumX = -225;
  readonly minimumZ = -220;
  readonly cellWidth = 450 / this.columns;
  readonly cellDepth = 340 / this.rows;
  readonly water = new Float32Array(this.columns * this.rows);
  readonly snow = new Float32Array(this.columns * this.rows);
  readonly ice = new Float32Array(this.columns * this.rows);
  readonly wetness = new Float32Array(this.columns * this.rows);
  readonly saturation = new Float32Array(this.columns * this.rows);
  readonly temperature = new Float32Array(this.columns * this.rows);
  readonly runoffX = new Float32Array(this.columns * this.rows);
  readonly runoffZ = new Float32Array(this.columns * this.rows);
  readonly footprint = new Float32Array(this.columns * this.rows);
  readonly kinds: TerrainKind[] = [];
  readonly heights = new Float32Array(this.columns * this.rows);
  readonly exposed = new Float32Array(this.columns * this.rows);
  private readonly permeability = new Float32Array(this.columns * this.rows);
  private readonly depression = new Float32Array(this.columns * this.rows);
  private readonly deltaWater = new Float32Array(this.columns * this.rows);
  private readonly compacted = new Float32Array(this.columns * this.rows);
  private readonly normalX = new Float32Array(this.columns * this.rows);
  private readonly normalZ = new Float32Array(this.columns * this.rows);
  private readonly dirty = new Uint8Array(this.columns * this.rows);
  private accumulated = 0;
  private lastSeconds: number | undefined;
  readonly energy: SurfaceEnergyField;
  private readonly energySample = createSurfaceEnergySample();
  private readonly waterReader = (x: number, z: number) => {
    const index = this.indexAt(x, z);
    return index < 0 ? 0 : this.water[index];
  };
  private canopyThroughfall: (x: number, z: number) => number = () => 1;
  revision = 0;

  constructor(readonly terrain: CityTerrain, readonly weather: WeatherField) {
    const ground = createTerrainPoint();
    const random = createRandom(70123);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const x = this.minimumX + (column + 0.5) * this.cellWidth;
        const z = this.minimumZ + (row + 0.5) * this.cellDepth;
        terrain.sample(x, z, ground);
        this.kinds.push(ground.kind);
        this.heights[index] = ground.height;
        this.permeability[index] = ground.permeability;
        this.exposed[index] = ground.exposed;
        this.depression[index] = 0.0008 + random() * 0.004;
        this.normalX[index] = ground.slopeX;
        this.normalZ[index] = ground.slopeZ;
        this.temperature[index] = weather.state.temperature;
        this.saturation[index] = ground.kind === "park" ? 0.4 : 0.05;
      }
    }
    this.energy = new SurfaceEnergyField(terrain, weather);
    terrain.setWaterReader((x, z) => this.wetnessAt(x, z));
  }

  setCanopyThroughfall(reader: (x: number, z: number) => number): void {
    this.canopyThroughfall = reader;
  }

  update(seconds: number): void {
    if (this.lastSeconds === undefined || seconds < this.lastSeconds) {
      this.reset();
      this.lastSeconds = seconds;
      return;
    }
    this.energy.update(seconds, this.waterReader);
    const dt = Math.min(0.5, Math.max(0, seconds - this.lastSeconds));
    this.lastSeconds = seconds;
    this.accumulated += dt;
    if (this.accumulated < 0.1) return;
    const step = Math.min(0.5, this.accumulated);
    this.accumulated = 0;
    this.integrate(step, seconds);
    this.transport(step);
    this.revision++;
  }

  sample(x: number, z: number, result: SurfaceSample): SurfaceSample {
    const column = clamp((x - this.minimumX) / this.cellWidth - 0.5, 0, this.columns - 1);
    const row = clamp((z - this.minimumZ) / this.cellDepth - 0.5, 0, this.rows - 1);
    const x0 = Math.floor(column);
    const z0 = Math.floor(row);
    const x1 = Math.min(this.columns - 1, x0 + 1);
    const z1 = Math.min(this.rows - 1, z0 + 1);
    const fx = column - x0;
    const fz = row - z0;
    const a = z0 * this.columns + x0;
    const b = z0 * this.columns + x1;
    const c = z1 * this.columns + x0;
    const d = z1 * this.columns + x1;
    const interpolate = (values: Float32Array) => {
      const top = values[a] + (values[b] - values[a]) * fx;
      const bottom = values[c] + (values[d] - values[c]) * fx;
      return top + (bottom - top) * fz;
    };
    result.water = interpolate(this.water);
    result.snow = interpolate(this.snow);
    result.ice = interpolate(this.ice);
    result.wetness = interpolate(this.wetness);
    result.saturation = interpolate(this.saturation);
    result.temperature = interpolate(this.temperature);
    result.runoffX = interpolate(this.runoffX);
    result.runoffZ = interpolate(this.runoffZ);
    result.footprint = interpolate(this.footprint);
    return result;
  }

  wetnessAt(x: number, z: number): number {
    const index = this.indexAt(x, z);
    return index < 0 ? 0 : this.wetness[index];
  }

  disturb(x: number, z: number, pressure: number, radius: number): void {
    this.energy.compact(x, z, pressure, 0.15);
    const fromColumn = Math.max(0, Math.floor((x - radius - this.minimumX) / this.cellWidth));
    const toColumn = Math.min(this.columns - 1, Math.floor((x + radius - this.minimumX) / this.cellWidth));
    const fromRow = Math.max(0, Math.floor((z - radius - this.minimumZ) / this.cellDepth));
    const toRow = Math.min(this.rows - 1, Math.floor((z + radius - this.minimumZ) / this.cellDepth));
    for (let row = fromRow; row <= toRow; row++) {
      for (let column = fromColumn; column <= toColumn; column++) {
        const index = row * this.columns + column;
        const amount = saturate(pressure / 85000);
        this.compacted[index] = Math.max(this.compacted[index], amount);
        this.footprint[index] = Math.min(1, this.footprint[index] + amount * 0.15);
        const snowRemoved = this.snow[index] * amount * 0.12;
        this.snow[index] -= snowRemoved;
        this.ice[index] = Math.min(0.02, this.ice[index] + snowRemoved * 0.15);
        this.water[index] = Math.max(0, this.water[index] - amount * 0.0002);
        this.dirty[index] = 1;
      }
    }
  }

  addWater(x: number, z: number, metres: number): void {
    const index = this.indexAt(x, z);
    if (index < 0) return;
    this.water[index] = clamp(this.water[index] + metres, 0, 0.025);
    this.wetness[index] = Math.max(this.wetness[index], saturate(this.water[index] * 600));
    this.dirty[index] = 1;
  }

  consumeDirty(index: number): boolean {
    const value = this.dirty[index] !== 0;
    this.dirty[index] = 0;
    return value;
  }

  reset(): void {
    this.energy.reset();
    this.water.fill(0);
    this.snow.fill(0);
    this.ice.fill(0);
    this.wetness.fill(0);
    this.runoffX.fill(0);
    this.runoffZ.fill(0);
    this.footprint.fill(0);
    this.compacted.fill(0);
    this.temperature.fill(this.weather.state.temperature);
    this.dirty.fill(1);
    this.accumulated = 0;
    this.revision++;
  }

  private integrate(dt: number, seconds: number): void {
    const weather = this.weather.state;
    // Time compression matches the existing 144-second seasonal cycle; material states remain continuous.
    const climateTime = dt * 36;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        if (this.kinds[index] === "water") continue;
        const x = this.minimumX + (column + 0.5) * this.cellWidth;
        const z = this.minimumZ + (row + 0.5) * this.cellDepth;
        const roof = this.kinds[index] === "building";
        const energy = this.energy.sample(x, z, this.energySample);
        const targetTemperature = this.energy.ready ? energy.temperature : this.weather.temperatureAt(this.heights[index], this.exposed[index], x, z);
        this.temperature[index] = exponentialApproach(this.temperature[index], targetTemperature, roof ? 0.12 : 0.06, climateTime);
        const localRain = this.weather.localRain(x, z, seconds);
        const localSnow = this.weather.localSnow(x, z, seconds);
        const waterInput = localRain * 0.000032 * climateTime * this.exposed[index] * this.canopyThroughfall(x, z);
        const snowInput = localSnow * 0.00011 * climateTime * this.exposed[index];
        this.water[index] += waterInput;
        this.snow[index] = this.energy.ready ? energy.snowDepth : Math.min(0.19, this.snow[index] + snowInput);
        if (this.energy.ready) this.water[index] += energy.meltRate * climateTime;
        const temperature = this.temperature[index];
        if (temperature > 0) {
          const meltRate = temperature * 0.000016 + weather.sunExposure * 0.000028;
          const meltedSnow = this.energy.ready ? 0 : Math.min(this.snow[index], meltRate * climateTime);
          this.snow[index] -= meltedSnow;
          this.water[index] += meltedSnow * 0.18;
          const meltedIce = Math.min(this.ice[index], meltRate * climateTime * 0.6);
          this.ice[index] -= meltedIce;
          this.water[index] += meltedIce;
        } else {
          const freezeRate = -temperature * 0.000012 * climateTime;
          const frozen = Math.min(this.water[index], freezeRate);
          this.water[index] -= frozen;
          this.ice[index] = Math.min(0.025, this.ice[index] + frozen);
        }
        const infiltration = this.energy.ready && this.permeability[index] > 0.5
          ? energy.infiltrationRate * climateTime
          : this.permeability[index] * (1 - this.saturation[index]) * 0.00014 * climateTime;
        const infiltrated = Math.min(this.water[index], infiltration);
        this.water[index] -= infiltrated;
        this.saturation[index] = this.energy.ready && this.permeability[index] > 0.5
          ? energy.saturation
          : clamp(this.saturation[index] + infiltrated * 22 - weather.evaporation * climateTime * 0.0012, 0, 1);
        const evaporation = weather.evaporation * (1 + weather.windSpeed * 0.05) * climateTime * 0.000065;
        this.water[index] = Math.max(0, this.water[index] - evaporation);
        if (roof) this.water[index] *= Math.exp(-climateTime * 0.022);
        const dew = this.weather.dewPotential(temperature) * climateTime * 0.000002;
        this.water[index] = Math.min(0.025, this.water[index] + dew);
        const surfaceFilm = saturate(this.water[index] * 650);
        const dampSoil = this.permeability[index] * this.saturation[index] * 0.7;
        const targetWetness = Math.max(surfaceFilm, dampSoil, localRain * 0.7);
        this.wetness[index] = exponentialApproach(this.wetness[index], targetWetness, targetWetness > this.wetness[index] ? 0.7 : 0.035, climateTime);
        this.footprint[index] *= Math.exp(-climateTime * (0.0015 + localSnow * 0.016));
        this.compacted[index] *= Math.exp(-climateTime * 0.001);
        this.dirty[index] = 1;
      }
    }
  }

  private transport(dt: number): void {
    this.deltaWater.fill(0);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const mobile = Math.max(0, this.water[index] - this.depression[index]);
        this.runoffX[index] *= Math.exp(-dt * 3);
        this.runoffZ[index] *= Math.exp(-dt * 3);
        if (mobile <= 0 || this.kinds[index] === "water") continue;
        const surface = this.heights[index] + this.water[index];
        let transferred = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = column + dx;
          const nz = row + dz;
          if (nx < 0 || nx >= this.columns || nz < 0 || nz >= this.rows) continue;
          const neighbor = nz * this.columns + nx;
          const slope = dx * this.normalX[index] + dz * this.normalZ[index];
          const difference = surface - this.heights[neighbor] - this.water[neighbor] - slope * 0.3;
          if (difference <= 0) continue;
          const flow = Math.min((mobile - transferred) * 0.25, difference * dt * 0.018);
          if (flow <= 0) continue;
          this.deltaWater[index] -= flow;
          if (this.kinds[neighbor] !== "water") this.deltaWater[neighbor] += flow;
          transferred += flow;
          this.runoffX[index] += dx * flow / dt;
          this.runoffZ[index] += dz * flow / dt;
        }
      }
    }
    for (let index = 0; index < this.water.length; index++) this.water[index] = clamp(this.water[index] + this.deltaWater[index], 0, 0.025);
  }

  private indexAt(x: number, z: number): number {
    const column = Math.floor((x - this.minimumX) / this.cellWidth);
    const row = Math.floor((z - this.minimumZ) / this.cellDepth);
    if (column < 0 || column >= this.columns || row < 0 || row >= this.rows) return -1;
    return row * this.columns + column;
  }
}

export function createSurfaceSample(): SurfaceSample {
  return { water: 0, snow: 0, ice: 0, wetness: 0, saturation: 0, temperature: 18, runoffX: 0, runoffZ: 0, footprint: 0 };
}
