import * as THREE from "three";
import type { WeatherObservation } from "./weather-field";
import { CityTerrain, createTerrainPoint } from "./terrain";
import { clamp, exponentialApproach, saturate, smoothstep } from "../physics/math";

export type MicroclimateSample = {
  temperatureOffset: number;
  humidityOffset: number;
  windShelter: number;
  channelX: number;
  channelZ: number;
  turbulence: number;
  skyView: number;
  shade: number;
  wallRadiation: number;
  surfaceHeat: number;
  roughness: number;
};

export function createMicroclimateSample(): MicroclimateSample {
  return {
    temperatureOffset: 0,
    humidityOffset: 0,
    windShelter: 0,
    channelX: 0,
    channelZ: 0,
    turbulence: 0,
    skyView: 1,
    shade: 0,
    wallRadiation: 0,
    surfaceHeat: 0,
    roughness: 0.15,
  };
}

export class UrbanMicroclimate {
  readonly columns = 24;
  readonly rows = 20;
  readonly minimumX = -225;
  readonly minimumZ = -225;
  readonly width = 450;
  readonly depth = 370;
  readonly temperatureOffset = new Float32Array(this.columns * this.rows);
  readonly humidityOffset = new Float32Array(this.columns * this.rows);
  readonly windShelter = new Float32Array(this.columns * this.rows);
  readonly channelX = new Float32Array(this.columns * this.rows);
  readonly channelZ = new Float32Array(this.columns * this.rows);
  readonly turbulence = new Float32Array(this.columns * this.rows);
  readonly skyView = new Float32Array(this.columns * this.rows).fill(1);
  readonly shade = new Float32Array(this.columns * this.rows);
  readonly wallRadiation = new Float32Array(this.columns * this.rows);
  readonly surfaceHeat = new Float32Array(this.columns * this.rows);
  readonly roughness = new Float32Array(this.columns * this.rows);
  private readonly heights = new Float32Array(this.columns * this.rows);
  private readonly built = new Float32Array(this.columns * this.rows);
  private readonly green = new Float32Array(this.columns * this.rows);
  private readonly water = new Float32Array(this.columns * this.rows);
  private readonly thermalStorage = new Float32Array(this.columns * this.rows);
  private readonly wallAspectX = new Float32Array(this.columns * this.rows);
  private readonly wallAspectZ = new Float32Array(this.columns * this.rows);
  private readonly canyonWidth = new Float32Array(this.columns * this.rows);
  private readonly wind = new THREE.Vector3();
  private readonly sun = new THREE.Vector3();
  private lastSeconds: number | undefined;
  private lastGeometryTime = -1;
  private shadeCursor = 0;
  private previousWindAngle = Infinity;
  revision = 0;

  constructor(readonly terrain: CityTerrain) {
    this.initializeMorphology();
  }

  update(seconds: number, night: boolean, weather: WeatherObservation, windDirection: THREE.Vector3, sunDirection: THREE.Vector3): void {
    if (this.lastSeconds === undefined || seconds < this.lastSeconds) {
      this.reset();
      this.lastSeconds = seconds;
    }
    const dt = clamp(seconds - this.lastSeconds!, 0, 0.5);
    this.lastSeconds = seconds;
    this.sun.copy(sunDirection).normalize();
    this.wind.copy(windDirection).normalize();
    const windAngle = Math.atan2(this.wind.z, this.wind.x);
    if (Math.abs(windAngle - this.previousWindAngle) > 0.08 || this.lastGeometryTime < 0) {
      this.updateWindShelter();
      this.previousWindAngle = windAngle;
      this.lastGeometryTime = seconds;
    }
    this.updateSolarShade(night, Math.ceil(this.shade.length / 12));
    if (dt <= 0) return;
    const climateTime = dt * 36;
    for (let index = 0; index < this.temperatureOffset.length; index++) {
      const sky = this.skyView[index];
      const solar = weather.sunExposure * (1 - this.shade[index]);
      const localWind = weather.windSpeed * (1 - this.windShelter[index] * 0.8);
      const vegetation = this.green[index];
      const paved = this.built[index];
      const coastal = this.water[index];
      const solarHeating = solar * (paved * 8.5 + (1 - vegetation) * 2.6);
      const radiativeCooling = night ? sky * (1 - weather.cloud * 0.75) * 3.8 : 0;
      const evaporativeCooling = vegetation * weather.humidity * (weather.rain * 2.8 + solar * 2.1);
      const waterModeration = coastal * (weather.temperature - 16) * 0.16;
      const thermalTarget = solarHeating - radiativeCooling - evaporativeCooling - waterModeration;
      const storageRate = 0.0009 + (1 - paved) * 0.0018 + localWind * 0.00015;
      this.thermalStorage[index] = exponentialApproach(this.thermalStorage[index], thermalTarget, storageRate, climateTime);
      const heatRelease = this.thermalStorage[index] * (night ? 0.9 : 0.3);
      const mixing = 1 / (1 + localWind * 0.35);
      const canyonTrap = (1 - sky) * heatRelease * 0.6;
      const temperatureTarget = clamp((heatRelease + canyonTrap - evaporativeCooling * 0.25) * mixing, -4.5, 8);
      this.temperatureOffset[index] = exponentialApproach(this.temperatureOffset[index], temperatureTarget, 0.08, dt);
      const humidification = vegetation * 0.055 + coastal * 0.11 + weather.rain * (1 - sky) * 0.04;
      const drying = Math.max(0, this.temperatureOffset[index]) * 0.008;
      this.humidityOffset[index] = exponentialApproach(this.humidityOffset[index], clamp(humidification - drying, -0.1, 0.2), 0.16, dt);
      const wallSolar = Math.max(0, this.wallAspectX[index] * this.sun.x + this.wallAspectZ[index] * this.sun.z);
      const wallTarget = (1 - sky) * (solar * wallSolar * 3.5 + this.thermalStorage[index] * 0.5);
      this.wallRadiation[index] = exponentialApproach(this.wallRadiation[index], wallTarget, 0.09, dt);
      this.surfaceHeat[index] = this.thermalStorage[index];
      const wake = this.windShelter[index] * (1 - this.windShelter[index]) * 4;
      const buoyancy = Math.max(0, this.surfaceHeat[index]) * 0.035;
      this.turbulence[index] = clamp(wake * weather.windSpeed * 0.12 + buoyancy, 0, 1.5);
    }
    this.revision++;
  }

  sample(x: number, z: number, result: MicroclimateSample): MicroclimateSample {
    const column = clamp((x - this.minimumX) / this.width * this.columns - 0.5, 0, this.columns - 1);
    const row = clamp((z - this.minimumZ) / this.depth * this.rows - 0.5, 0, this.rows - 1);
    const left = Math.floor(column);
    const top = Math.floor(row);
    const right = Math.min(this.columns - 1, left + 1);
    const bottom = Math.min(this.rows - 1, top + 1);
    const fx = column - left;
    const fz = row - top;
    const a = top * this.columns + left;
    const b = top * this.columns + right;
    const c = bottom * this.columns + left;
    const d = bottom * this.columns + right;
    const interpolate = (values: Float32Array) => {
      const upper = values[a] * (1 - fx) + values[b] * fx;
      const lower = values[c] * (1 - fx) + values[d] * fx;
      return upper * (1 - fz) + lower * fz;
    };
    result.temperatureOffset = interpolate(this.temperatureOffset);
    result.humidityOffset = interpolate(this.humidityOffset);
    result.windShelter = interpolate(this.windShelter);
    result.channelX = interpolate(this.channelX);
    result.channelZ = interpolate(this.channelZ);
    result.turbulence = interpolate(this.turbulence);
    result.skyView = interpolate(this.skyView);
    result.shade = interpolate(this.shade);
    result.wallRadiation = interpolate(this.wallRadiation);
    result.surfaceHeat = interpolate(this.surfaceHeat);
    result.roughness = interpolate(this.roughness);
    return result;
  }

  precipitationExposure(x: number, z: number, height: number, windSpeed: number): number {
    const index = this.indexAt(x, z);
    if (index < 0) return 1;
    const wallProtection = this.windShelter[index] * smoothstep(1, 7, windSpeed);
    const verticalProtection = 1 - this.skyView[index];
    const canopyHeight = Math.max(2, this.heights[index]);
    const aboveCanopy = smoothstep(canopyHeight, canopyHeight + 6, height);
    return clamp(1 - (wallProtection * 0.25 + verticalProtection * 0.45) * (1 - aboveCanopy), 0.2, 1);
  }

  reset(): void {
    this.lastSeconds = undefined;
    this.lastGeometryTime = -1;
    this.shadeCursor = 0;
    this.previousWindAngle = Infinity;
    this.temperatureOffset.fill(0);
    this.humidityOffset.fill(0);
    this.thermalStorage.fill(0);
    this.surfaceHeat.fill(0);
    this.wallRadiation.fill(0);
    this.turbulence.fill(0);
    this.revision++;
  }

  private initializeMorphology(): void {
    const ground = createTerrainPoint();
    const cellWidth = this.width / this.columns;
    const cellDepth = this.depth / this.rows;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const x = this.minimumX + (column + 0.5) * cellWidth;
        const z = this.minimumZ + (row + 0.5) * cellDepth;
        let green = 0;
        let built = 0;
        let water = 0;
        let height = 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            this.terrain.sample(x + dx * cellWidth * 0.3, z + dz * cellDepth * 0.3, ground);
            if (ground.kind === "park" || ground.kind === "hill") green++;
            if (ground.kind === "road" || ground.kind === "building" || ground.kind === "pavement") built++;
            if (ground.kind === "water") water++;
            height += ground.height;
          }
        }
        this.green[index] = green / 9;
        this.built[index] = built / 9;
        this.water[index] = water / 9;
        this.heights[index] = height / 9;
        let obstruction = 0;
        let nearestDistance = 100;
        let nearestNormalX = 0;
        let nearestNormalZ = 0;
        for (const footprint of this.terrain.footprints) {
          const dx = x - footprint.x;
          const dz = z - footprint.z;
          const angle = footprint.rotationY ?? 0;
          const cosine = Math.cos(angle);
          const sine = Math.sin(angle);
          const localX = dx * cosine - dz * sine;
          const localZ = dx * sine + dz * cosine;
          const outsideX = Math.max(0, Math.abs(localX) - footprint.halfWidth);
          const outsideZ = Math.max(0, Math.abs(localZ) - footprint.halfDepth);
          const distance = Math.max(0.5, Math.hypot(outsideX, outsideZ));
          const elevation = Math.atan2(Math.max(0, footprint.height - this.heights[index]), distance);
          const frontage = Math.min(1, (footprint.halfWidth + footprint.halfDepth) / (distance * Math.PI));
          obstruction += Math.sin(elevation) * frontage * 0.35;
          if (distance < nearestDistance) {
            nearestDistance = distance;
            const length = Math.max(0.001, Math.hypot(dx, dz));
            nearestNormalX = dx / length;
            nearestNormalZ = dz / length;
          }
        }
        this.skyView[index] = clamp(1 - obstruction, 0.16, 1);
        this.wallAspectX[index] = nearestNormalX;
        this.wallAspectZ[index] = nearestNormalZ;
        this.canyonWidth[index] = clamp(nearestDistance * 2, 5, 120);
        this.roughness[index] = 0.03 + this.green[index] * 0.3 + (1 - this.skyView[index]) * 1.7;
      }
    }
  }

  private updateWindShelter(): void {
    const cellWidth = this.width / this.columns;
    const cellDepth = this.depth / this.rows;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const x = this.minimumX + (column + 0.5) * cellWidth;
        const z = this.minimumZ + (row + 0.5) * cellDepth;
        let shelter = 0;
        let deflectionX = 0;
        let deflectionZ = 0;
        for (const footprint of this.terrain.footprints) {
          const dx = x - footprint.x;
          const dz = z - footprint.z;
          const downstream = dx * this.wind.x + dz * this.wind.z;
          if (downstream < 0 || downstream > footprint.height * 8 + 20) continue;
          const lateral = -dx * this.wind.z + dz * this.wind.x;
          const wakeWidth = Math.hypot(footprint.halfWidth, footprint.halfDepth) + downstream * 0.14;
          const crossFactor = 1 - smoothstep(wakeWidth * 0.45, wakeWidth * 1.35, Math.abs(lateral));
          const distanceDecay = Math.exp(-downstream / Math.max(6, footprint.height * 4));
          const vertical = smoothstep(this.heights[index], this.heights[index] + 8, footprint.height);
          const blockage = crossFactor * distanceDecay * vertical;
          shelter = 1 - (1 - shelter) * (1 - blockage * 0.72);
          const side = lateral >= 0 ? 1 : -1;
          const edge = Math.exp(-Math.abs(Math.abs(lateral) - wakeWidth) / Math.max(2, wakeWidth * 0.3));
          deflectionX += -this.wind.z * side * edge * distanceDecay * 0.2;
          deflectionZ += this.wind.x * side * edge * distanceDecay * 0.2;
        }
        const wallParallelX = -this.wallAspectZ[index];
        const wallParallelZ = this.wallAspectX[index];
        const alignment = wallParallelX * this.wind.x + wallParallelZ * this.wind.z;
        const canyon = (1 - this.skyView[index]) * Math.min(1, 20 / this.canyonWidth[index]);
        this.windShelter[index] = clamp(shelter, 0, 0.94);
        this.channelX[index] = clamp(deflectionX + wallParallelX * alignment * canyon * 0.35, -0.65, 0.65);
        this.channelZ[index] = clamp(deflectionZ + wallParallelZ * alignment * canyon * 0.35, -0.65, 0.65);
      }
    }
  }

  private updateSolarShade(night: boolean, maximum: number): void {
    for (let count = 0; count < maximum; count++) {
      const index = this.shadeCursor++ % this.shade.length;
      if (night || this.sun.y <= 0.01) {
        this.shade[index] = 1;
        continue;
      }
      const row = Math.floor(index / this.columns);
      const column = index % this.columns;
      const x = this.minimumX + (column + 0.5) * this.width / this.columns;
      const z = this.minimumZ + (row + 0.5) * this.depth / this.rows;
      const groundHeight = this.heights[index] + 0.1;
      let blocked = 0;
      for (const footprint of this.terrain.footprints) {
        const availableHeight = footprint.height + (footprint.baseY ?? 0.4) - groundHeight;
        if (availableHeight <= 0) continue;
        const reach = availableHeight / this.sun.y;
        const angle = footprint.rotationY ?? 0;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const localOriginX = (x - footprint.x) * cosine - (z - footprint.z) * sine;
        const localOriginZ = (x - footprint.x) * sine + (z - footprint.z) * cosine;
        const localDirectionX = this.sun.x * cosine - this.sun.z * sine;
        const localDirectionZ = this.sun.x * sine + this.sun.z * cosine;
        const nearX = this.raySlab(localOriginX, localDirectionX, footprint.halfWidth);
        const nearZ = this.raySlab(localOriginZ, localDirectionZ, footprint.halfDepth);
        const enter = Math.max(0, nearX[0], nearZ[0]);
        const leave = Math.min(reach, nearX[1], nearZ[1]);
        if (leave > enter) {
          const penumbra = Math.min(1, (leave - enter) / 1.5);
          blocked = Math.max(blocked, penumbra);
        }
      }
      this.shade[index] = saturate(blocked);
    }
  }

  private raySlab(origin: number, direction: number, halfSize: number): [number, number] {
    if (Math.abs(direction) < 1e-7) return Math.abs(origin) <= halfSize ? [-Infinity, Infinity] : [Infinity, -Infinity];
    const first = (-halfSize - origin) / direction;
    const second = (halfSize - origin) / direction;
    return first <= second ? [first, second] : [second, first];
  }

  private indexAt(x: number, z: number): number {
    const column = Math.floor((x - this.minimumX) / this.width * this.columns);
    const row = Math.floor((z - this.minimumZ) / this.depth * this.rows);
    if (column < 0 || column >= this.columns || row < 0 || row >= this.rows) return -1;
    return row * this.columns + column;
  }
}
