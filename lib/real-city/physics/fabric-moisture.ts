import * as THREE from "three";
import { clamp, saturate, smoothstep } from "./math";

export type FabricClimate = {
  temperature: number;
  humidity: number;
  rain: number;
  snow: number;
  sunlight: number;
  windSpeed: number;
};

export class FabricMoistureField {
  readonly moisture: Float32Array;
  readonly film: Float32Array;
  readonly ice: Float32Array;
  readonly temperature: Float32Array;
  readonly massFactor: Float32Array;
  readonly stiffnessFactor: Float32Array;
  readonly color: Float32Array;
  private readonly waterDelta: Float32Array;
  private readonly heatDelta: Float32Array;
  private readonly area: Float32Array;
  private accumulated = 0;
  meanMoisture = 0;
  meanIce = 0;
  totalWaterMass = 0;

  constructor(readonly columns: number, readonly rows: number, width: number, height: number, readonly dryMassPerArea: number) {
    const count = (columns + 1) * (rows + 1);
    this.moisture = new Float32Array(count).fill(0.06);
    this.film = new Float32Array(count);
    this.ice = new Float32Array(count);
    this.temperature = new Float32Array(count).fill(18);
    this.massFactor = new Float32Array(count).fill(1);
    this.stiffnessFactor = new Float32Array(count).fill(1);
    this.color = new Float32Array(count * 3).fill(1);
    this.waterDelta = new Float32Array(count);
    this.heatDelta = new Float32Array(count);
    this.area = new Float32Array(count);
    const areaPerCell = width * height / (columns * rows);
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const edgeX = column === 0 || column === columns ? 0.5 : 1;
        const edgeY = row === 0 || row === rows ? 0.5 : 1;
        this.area[row * (columns + 1) + column] = areaPerCell * edgeX * edgeY;
      }
    }
  }

  step(dt: number, positions: readonly THREE.Vector3[], normals: readonly THREE.Vector3[], climate: FabricClimate): void {
    this.accumulated += clamp(dt, 0, 0.1);
    if (this.accumulated < 0.05) return;
    const duration = this.accumulated;
    this.accumulated = 0;
    const time = duration * 12;
    this.waterDelta.fill(0);
    this.heatDelta.fill(0);
    const count = this.moisture.length;
    for (let index = 0; index < count; index++) {
      const facing = Math.abs(normals[index].y);
      const windCapture = 0.12 + climate.windSpeed * 0.025;
      const rainfall = climate.rain * (facing + windCapture) * time * 0.012;
      this.film[index] = clamp(this.film[index] + rainfall, 0, 0.8);
      const humidity = clamp(climate.humidity, 0, 0.99);
      const equilibrium = 0.06 + humidity * humidity * 0.16;
      const absorptionCapacity = Math.max(0, 1.4 - this.moisture[index]);
      const absorption = Math.min(this.film[index], absorptionCapacity * time * 0.055);
      this.film[index] -= absorption;
      this.moisture[index] += absorption;
      const desorption = (equilibrium - this.moisture[index]) * (1 - Math.exp(-time * 0.004));
      this.moisture[index] = Math.max(0, this.moisture[index] + desorption);
      const convection = 7 + climate.windSpeed * 3;
      const solar = climate.sunlight * 180 * (0.3 + facing * 0.7);
      const evaporation = Math.max(0, 1 - humidity) * (0.0008 + climate.windSpeed * 0.00012) * time;
      const removedFilm = Math.min(this.film[index], evaporation);
      this.film[index] -= removedFilm;
      const removedBound = Math.min(Math.max(0, this.moisture[index] - 0.03), Math.max(0, evaporation - removedFilm) * 0.3);
      this.moisture[index] -= removedBound;
      const latentHeat = (removedFilm + removedBound) * this.dryMassPerArea * 2.45e6 / Math.max(0.001, time);
      const thermalCapacity = this.dryMassPerArea * (1300 + this.moisture[index] * 4180 + this.ice[index] * 2100);
      const target = climate.temperature + (solar - latentHeat) / (convection + 7);
      const thermalRate = 1 - Math.exp(-(convection + 7) * time / Math.max(5, thermalCapacity));
      this.temperature[index] += (target - this.temperature[index]) * thermalRate;
      const cold = Math.max(0, -this.temperature[index]);
      const warm = Math.max(0, this.temperature[index]);
      if (cold > 0) {
        const frozen = Math.min(this.film[index] + this.moisture[index] * 0.25, cold * time * 0.002);
        const filmFrozen = Math.min(this.film[index], frozen);
        this.film[index] -= filmFrozen;
        this.moisture[index] = Math.max(0, this.moisture[index] - (frozen - filmFrozen));
        this.ice[index] += frozen;
        this.temperature[index] += frozen * this.dryMassPerArea * 334000 / Math.max(5, thermalCapacity);
      } else if (warm > 0) {
        const melted = Math.min(this.ice[index], warm * time * 0.003);
        this.ice[index] -= melted;
        this.film[index] += melted;
      }
      this.ice[index] = clamp(this.ice[index] + climate.snow * facing * time * 0.002, 0, 1.2);
    }
    this.diffuseWater(time);
    this.drainFilm(time, positions);
    this.conductHeat(time);
    this.meanMoisture = 0;
    this.meanIce = 0;
    this.totalWaterMass = 0;
    for (let index = 0; index < count; index++) {
      this.moisture[index] = clamp(this.moisture[index] + this.waterDelta[index], 0, 1.5);
      this.temperature[index] = clamp(this.temperature[index] + this.heatDelta[index], -30, 65);
      const waterLoad = this.moisture[index] + this.film[index] + this.ice[index];
      this.massFactor[index] = 1 / (1 + waterLoad);
      const frozenStiffness = 1 + this.ice[index] * 9;
      const softening = 1 - saturate(this.moisture[index]) * 0.3;
      this.stiffnessFactor[index] = clamp(frozenStiffness * softening, 0.5, 12);
      const darkening = 1 - saturate(this.moisture[index] + this.film[index]) * 0.27;
      const frost = smoothstep(0.02, 0.5, this.ice[index]);
      this.color[index * 3] = darkening * (1 - frost) + 0.86 * frost;
      this.color[index * 3 + 1] = darkening * (1 - frost) + 0.91 * frost;
      this.color[index * 3 + 2] = darkening * (1 - frost) + 0.94 * frost;
      this.meanMoisture += this.moisture[index] + this.film[index];
      this.meanIce += this.ice[index];
      this.totalWaterMass += waterLoad * this.dryMassPerArea * this.area[index];
    }
    this.meanMoisture /= count;
    this.meanIce /= count;
  }

  reset(): void {
    this.moisture.fill(0.06);
    this.film.fill(0);
    this.ice.fill(0);
    this.temperature.fill(18);
    this.massFactor.fill(1);
    this.stiffnessFactor.fill(1);
    this.color.fill(1);
    this.waterDelta.fill(0);
    this.heatDelta.fill(0);
    this.accumulated = 0;
    this.meanMoisture = 0.06;
    this.meanIce = 0;
    this.totalWaterMass = 0;
  }

  private diffuseWater(dt: number): void {
    for (let row = 0; row <= this.rows; row++) {
      for (let column = 0; column <= this.columns; column++) {
        const index = row * (this.columns + 1) + column;
        if (column < this.columns) this.exchangeWater(index, index + 1, dt * 0.018);
        if (row < this.rows) this.exchangeWater(index, index + this.columns + 1, dt * 0.024);
      }
    }
  }

  private exchangeWater(first: number, second: number, factor: number): void {
    const requested = (this.moisture[first] - this.moisture[second]) * Math.min(0.2, factor);
    const source = requested >= 0 ? first : second;
    const destination = requested >= 0 ? second : first;
    const transferable = Math.min(Math.abs(requested) * this.area[source], this.moisture[source] * this.area[source] * 0.2);
    this.waterDelta[source] -= transferable / this.area[source];
    this.waterDelta[destination] += transferable / this.area[destination];
  }

  private drainFilm(dt: number, positions: readonly THREE.Vector3[]): void {
    for (let row = 0; row <= this.rows; row++) {
      for (let column = 0; column <= this.columns; column++) {
        const index = row * (this.columns + 1) + column;
        if (this.film[index] < 0.01) continue;
        let lowest = index;
        if (column > 0 && positions[index - 1].y < positions[lowest].y) lowest = index - 1;
        if (column < this.columns && positions[index + 1].y < positions[lowest].y) lowest = index + 1;
        if (row > 0 && positions[index - this.columns - 1].y < positions[lowest].y) lowest = index - this.columns - 1;
        if (row < this.rows && positions[index + this.columns + 1].y < positions[lowest].y) lowest = index + this.columns + 1;
        const mobile = Math.max(0, this.film[index] - 0.03);
        const fraction = 1 - Math.exp(-dt * 0.3);
        const drained = mobile * fraction;
        this.film[index] -= drained;
        if (lowest !== index) this.film[lowest] = Math.min(0.8, this.film[lowest] + drained * this.area[index] / this.area[lowest]);
      }
    }
  }

  private conductHeat(dt: number): void {
    for (let row = 0; row <= this.rows; row++) {
      for (let column = 0; column <= this.columns; column++) {
        const index = row * (this.columns + 1) + column;
        if (column < this.columns) this.exchangeHeat(index, index + 1, dt);
        if (row < this.rows) this.exchangeHeat(index, index + this.columns + 1, dt);
      }
    }
  }

  private exchangeHeat(first: number, second: number, dt: number): void {
    const heatDifference = this.temperature[first] - this.temperature[second];
    const waterConductivity = 1 + (this.moisture[first] + this.moisture[second]) * 0.5;
    const transfer = heatDifference * Math.min(0.1, dt * 0.008 * waterConductivity);
    const totalArea = this.area[first] + this.area[second];
    this.heatDelta[first] -= transfer * this.area[second] / totalArea;
    this.heatDelta[second] += transfer * this.area[first] / totalArea;
  }
}
