import * as THREE from "three";
import { ConservativeTransportGrid } from "../physics/transport-grid";
import { clamp, saturate, smoothstep } from "../physics/math";
import { CityTerrain, createTerrainPoint } from "./terrain";
import type { WeatherObservation } from "./weather-field";
import type { UrbanMicroclimate } from "./urban-microclimate";
import { createMicroclimateSample } from "./urban-microclimate";

export type AerosolSample = {
  mineralDust: number;
  seaSalt: number;
  pollen: number;
  soot: number;
  extinction: number;
  scattering: number;
  absorption: number;
  anisotropy: number;
  depositedDust: number;
  visibility: number;
};

type AerosolSpecies = {
  transport: ConservativeTransportGrid;
  radius: number;
  density: number;
  hygroscopicity: number;
  background: number;
  deposited: Float64Array;
};

export function createAerosolSample(): AerosolSample {
  return {
    mineralDust: 0,
    seaSalt: 0,
    pollen: 0,
    soot: 0,
    extinction: 0,
    scattering: 0,
    absorption: 0,
    anisotropy: 0.72,
    depositedDust: 0,
    visibility: 18000,
  };
}

export class UrbanAerosolField {
  readonly mineral: AerosolSpecies;
  readonly salt: AerosolSpecies;
  readonly pollen: AerosolSpecies;
  readonly soot: AerosolSpecies;
  readonly mean = createAerosolSample();
  private readonly species: AerosolSpecies[];
  private readonly columns = 20;
  private readonly rows = 16;
  private readonly road = new Float32Array(this.columns * this.rows);
  private readonly vegetation = new Float32Array(this.columns * this.rows);
  private readonly coast = new Float32Array(this.columns * this.rows);
  private readonly erodible = new Float32Array(this.columns * this.rows);
  private readonly micro = createMicroclimateSample();
  private readonly sampleValue = createAerosolSample();
  private readonly depositionDelta = new Float64Array(this.columns * this.rows);
  private lastTime: number | undefined;
  private accumulated = 0;
  private humidity = 0.6;
  private mixHeight = 25;
  private sampleCursor = 0;
  onDeposit?: (x: number, z: number, mass: number) => void;

  constructor(readonly terrain: CityTerrain, readonly microclimate: UrbanMicroclimate) {
    this.mineral = this.createSpecies(1.8e-6, 2650, 0.08, 8e-9);
    this.salt = this.createSpecies(0.6e-6, 2160, 1.1, 2e-9);
    this.pollen = this.createSpecies(12e-6, 850, 0.2, 0.2e-9);
    this.soot = this.createSpecies(0.12e-6, 1700, 0.15, 1.5e-9);
    this.species = [this.mineral, this.salt, this.pollen, this.soot];
    this.initializeSources();
  }

  update(seconds: number, weather: WeatherObservation, wind: THREE.Vector3, season: string, night: boolean): void {
    if (this.lastTime === undefined || seconds < this.lastTime) {
      this.reset();
      this.lastTime = seconds;
      return;
    }
    const dt = clamp(seconds - this.lastTime, 0, 0.5);
    this.lastTime = seconds;
    this.accumulated += dt;
    if (this.accumulated < 0.2) return;
    const step = this.accumulated;
    this.accumulated = 0;
    this.humidity = weather.humidity;
    this.mixHeight = 12 + weather.windSpeed * 4 + weather.sunExposure * 28;
    const bloom = season === "spring" ? 1 : season === "summer" ? 0.45 : season === "autumn" ? 0.15 : 0.01;
    const daylightRelease = night ? 0.12 : 0.6 + weather.sunExposure * 0.4;
    const rainSuppression = Math.exp(-weather.rain * 5);
    this.depositionDelta.fill(0);
    const grid = this.mineral.transport;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const x = grid.bounds.minimumX + (column + 0.5) * grid.cellWidth;
        const z = grid.bounds.minimumZ + (row + 0.5) * grid.cellDepth;
        this.microclimate.sample(x, z, this.micro);
        const shelter = 1 - this.micro.windShelter * 0.65;
        const vx = (wind.x * weather.windSpeed * shelter + this.micro.channelX * weather.windSpeed) * 0.8;
        const vz = (wind.z * weather.windSpeed * shelter + this.micro.channelZ * weather.windSpeed) * 0.8;
        const turbulence = 0.8 + this.micro.turbulence * 3 + weather.windSpeed * 0.45;
        const frictionVelocity = Math.max(0, weather.windSpeed * shelter * 0.08);
        const entrainment = Math.max(0, frictionVelocity - 0.22) ** 2;
        const seaSpray = Math.max(0, weather.windSpeed - 2) ** 2.4 * this.coast[index];
        this.mineral.transport.source[index] = (this.erodible[index] * entrainment * 4e-9 + this.road[index] * 2e-10) * rainSuppression;
        this.salt.transport.source[index] = seaSpray * 1.5e-10;
        this.pollen.transport.source[index] = this.vegetation[index] * bloom * daylightRelease * rainSuppression * 1.4e-9;
        this.soot.transport.source[index] = this.road[index] * (night ? 0.3 : 1) * 2.5e-10;
        for (const species of this.species) {
          const transport = species.transport;
          transport.velocityX[index] = vx;
          transport.velocityZ[index] = vz;
          transport.diffusivity[index] = turbulence;
          const growth = this.growthFactor(species.hygroscopicity, weather.humidity);
          const radius = species.radius * growth;
          const settling = this.settlingVelocity(radius, species.density, weather.airDensity, weather.temperature);
          const leafCapture = this.vegetation[index] * (0.0005 + radius * 400) * weather.windSpeed;
          const dryDeposition = (settling + leafCapture) / this.mixHeight;
          const wetScavenging = weather.rain * (0.009 + Math.sqrt(radius / 1e-6) * 0.005);
          const mixingLoss = Math.max(0, this.micro.surfaceHeat) * 0.00015;
          transport.decay[index] = dryDeposition + wetScavenging + mixingLoss;
          const depositFraction = 1 - Math.exp(-(dryDeposition + wetScavenging) * step);
          const deposited = transport.concentration[index] * depositFraction * this.mixHeight;
          species.deposited[index] += deposited;
          species.deposited[index] *= Math.exp(-weather.rain * step * 0.035);
          if (species === this.soot) this.depositionDelta[index] += deposited;
          const resuspension = species.deposited[index] * entrainment * step * 0.015 * rainSuppression;
          species.deposited[index] = Math.max(0, species.deposited[index] - resuspension);
          transport.source[index] += resuspension / Math.max(0.1, step * this.mixHeight);
        }
      }
    }
    for (const species of this.species) species.transport.step(step, seconds);
    this.updateMean();
    if (this.onDeposit) {
      const dispatch = Math.ceil(this.depositionDelta.length / 8);
      for (let cursor = 0; cursor < dispatch; cursor++) {
        const index = this.sampleCursor++ % this.depositionDelta.length;
        const row = Math.floor(index / this.columns);
        const column = index % this.columns;
        const x = grid.bounds.minimumX + (column + 0.5) * grid.cellWidth;
        const z = grid.bounds.minimumZ + (row + 0.5) * grid.cellDepth;
        this.onDeposit(x, z, this.depositionDelta[index] * 8);
      }
    }
  }

  sample(x: number, z: number, result: AerosolSample): AerosolSample {
    result.mineralDust = this.mineral.transport.sample(x, z);
    result.seaSalt = this.salt.transport.sample(x, z);
    result.pollen = this.pollen.transport.sample(x, z);
    result.soot = this.soot.transport.sample(x, z);
    const index = this.indexAt(x, z);
    result.depositedDust = this.mineral.deposited[index] + this.soot.deposited[index];
    this.computeOptics(result);
    return result;
  }

  scatteringTint(x: number, z: number, target: THREE.Color): THREE.Color {
    this.sample(x, z, this.sampleValue);
    const sample = this.sampleValue;
    const total = sample.mineralDust + sample.seaSalt + sample.pollen + sample.soot;
    if (total <= 1e-12) return target.setRGB(0.92, 0.95, 1);
    const mineral = sample.mineralDust / total;
    const soot = sample.soot / total;
    const pollen = sample.pollen / total;
    return target.setRGB(
      clamp(0.94 + mineral * 0.035 + pollen * 0.04 - soot * 0.11, 0.65, 1),
      clamp(0.96 - mineral * 0.035 - soot * 0.13, 0.65, 1),
      clamp(1 - mineral * 0.12 - pollen * 0.08 - soot * 0.15, 0.65, 1),
    );
  }

  disturbGround(x: number, z: number, strength: number): void {
    const index = this.indexAt(x, z);
    const reservoir = this.mineral.deposited[index];
    const released = Math.min(reservoir, Math.max(0, strength) * 1e-7);
    this.mineral.deposited[index] -= released;
    this.mineral.transport.inject(x, z, (released + strength * this.erodible[index] * 2e-8) / this.mixHeight, 6);
  }

  reset(): void {
    this.lastTime = undefined;
    this.accumulated = 0;
    this.sampleCursor = 0;
    for (const species of this.species) {
      species.transport.reset(species.background);
      species.deposited.fill(0);
    }
    Object.assign(this.mean, createAerosolSample());
  }

  private createSpecies(radius: number, density: number, hygroscopicity: number, background: number): AerosolSpecies {
    const transport = new ConservativeTransportGrid({ minimumX: -225, minimumZ: -225, width: 450, depth: 370 }, this.columns, this.rows);
    transport.reset(background);
    transport.setBoundary(() => background);
    return {
      transport,
      radius,
      density,
      hygroscopicity,
      background,
      deposited: new Float64Array(this.columns * this.rows),
    };
  }

  private initializeSources(): void {
    const ground = createTerrainPoint();
    const grid = this.mineral.transport;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const x = grid.bounds.minimumX + (column + 0.5) * grid.cellWidth;
        const z = grid.bounds.minimumZ + (row + 0.5) * grid.cellDepth;
        this.terrain.sample(x, z, ground);
        this.road[index] = ground.kind === "road" ? 1 : ground.kind === "pavement" ? 0.4 : 0.03;
        this.vegetation[index] = ground.kind === "park" ? 1 : ground.kind === "hill" ? 0.8 : 0.02;
        this.erodible[index] = ground.kind === "sand" ? 1 : ground.kind === "park" ? 0.15 : ground.kind === "road" ? 0.1 : 0.02;
        this.coast[index] = smoothstep(100, 145, z);
        this.microclimate.sample(x, z, this.micro);
        const porosity = clamp(this.micro.skyView * 0.8 + 0.2, 0.3, 1);
        for (const species of this.species) species.transport.porosity[index] = porosity;
      }
    }
  }

  private updateMean(): void {
    const grid = this.mineral.transport;
    let area = 0;
    for (const porosity of grid.porosity) area += grid.area * porosity;
    this.mean.mineralDust = this.mineral.transport.totalMass() / Math.max(1, area);
    this.mean.seaSalt = this.salt.transport.totalMass() / Math.max(1, area);
    this.mean.pollen = this.pollen.transport.totalMass() / Math.max(1, area);
    this.mean.soot = this.soot.transport.totalMass() / Math.max(1, area);
    let deposited = 0;
    for (let index = 0; index < this.mineral.deposited.length; index++) deposited += this.mineral.deposited[index] + this.soot.deposited[index];
    this.mean.depositedDust = deposited / this.mineral.deposited.length;
    this.computeOptics(this.mean);
  }

  private computeOptics(sample: AerosolSample): void {
    let scattering = 0;
    let absorption = 0;
    let phaseWeight = 0;
    const concentrations = [sample.mineralDust, sample.seaSalt, sample.pollen, sample.soot];
    for (let index = 0; index < this.species.length; index++) {
      const species = this.species[index];
      const growth = this.growthFactor(species.hygroscopicity, this.humidity);
      const wetRadius = species.radius * growth;
      const particleMass = 4 / 3 * Math.PI * species.radius ** 3 * species.density;
      const number = concentrations[index] / Math.max(1e-24, particleMass);
      const crossSection = Math.PI * wetRadius * wetRadius;
      const sizeParameter = 2 * Math.PI * wetRadius / 550e-9;
      const efficiency = 2 * (1 - Math.exp(-sizeParameter * 0.35));
      const extinction = number * crossSection * efficiency;
      const absorptionFraction = index === 3 ? 0.42 : index === 0 ? 0.07 : 0.008;
      scattering += extinction * (1 - absorptionFraction);
      absorption += extinction * absorptionFraction;
      const anisotropy = clamp(0.35 + Math.log1p(sizeParameter) * 0.12, 0.35, 0.9);
      phaseWeight += extinction * (1 - absorptionFraction) * anisotropy;
    }
    sample.scattering = scattering;
    sample.absorption = absorption;
    sample.extinction = scattering + absorption;
    sample.anisotropy = scattering > 0 ? phaseWeight / scattering : 0.72;
    sample.visibility = clamp(3.912 / Math.max(0.00001, sample.extinction), 600, 50000);
  }

  private growthFactor(kappa: number, humidity: number): number {
    const relative = clamp(humidity, 0, 0.985);
    return Math.cbrt(1 + kappa * relative / Math.max(0.015, 1 - relative));
  }

  private settlingVelocity(radius: number, density: number, airDensity: number, temperature: number): number {
    const kelvin = Math.max(180, temperature + 273.15);
    const viscosity = 1.716e-5 * (kelvin / 273.15) ** 1.5 * (273.15 + 111) / (kelvin + 111);
    const meanFreePath = 6.5e-8 * kelvin / 288.15;
    const knudsen = meanFreePath / Math.max(1e-9, radius);
    const slip = 1 + knudsen * (1.257 + 0.4 * Math.exp(-1.1 / Math.max(1e-8, knudsen)));
    return clamp(2 * Math.max(0, density - airDensity) * 9.80665 * radius * radius * slip / (9 * viscosity), 0, 0.2);
  }

  private indexAt(x: number, z: number): number {
    const grid = this.mineral.transport;
    const column = clamp(Math.floor((x - grid.bounds.minimumX) / grid.cellWidth), 0, this.columns - 1);
    const row = clamp(Math.floor((z - grid.bounds.minimumZ) / grid.cellDepth), 0, this.rows - 1);
    return row * this.columns + column;
  }
}
