import * as THREE from "three";
import { CanopyWaterBalance, type CanopyWaterForcing } from "../physics/canopy-water";
import { clamp, saturate } from "../physics/math";
import type { WeatherField } from "./weather-field";
import type { SurfaceHydrology } from "./hydrology";

export type CanopySite = { x: number; y: number; z: number; size: number; evergreen: boolean };
export type CanopyLeafState = { retainedLeaves: number; chlorophyll: number };
export type CanopyExchangeState = {
  sunlight: number;
  diffuseLight: number;
  transmittedLight: number;
  sunlitLeaves: number;
  shadedLeaves: number;
  leafArea: number;
  wetness: number;
  snowMass: number;
  waterMass: number;
  groundRainFraction: number;
  stemflow: number;
};

export class CanopyExchange {
  readonly states: CanopyExchangeState[];
  private readonly waterModels: CanopyWaterBalance[];
  private readonly neighbors: number[][];
  private readonly cells = new Map<string, number[]>();
  private readonly sun = new THREE.Vector3(0, 1, 0);
  private readonly wind = new THREE.Vector3();
  private readonly forcing: CanopyWaterForcing = { rain: 0, snow: 0, humidity: 0.6, temperature: 18, wind: 2, sunlight: 0.8, leafAreaIndex: 2, branchMotion: 0 };
  private lastTime: number | undefined;
  private accumulated = 0;

  constructor(readonly sites: readonly CanopySite[], readonly weather: WeatherField, readonly water: SurfaceHydrology) {
    this.states = sites.map(() => ({ sunlight: 1, diffuseLight: 0.3, transmittedLight: 1, sunlitLeaves: 1, shadedLeaves: 0, leafArea: 2, wetness: 0, snowMass: 0, waterMass: 0, groundRainFraction: 1, stemflow: 0 }));
    this.waterModels = sites.map(site => new CanopyWaterBalance(site.evergreen, Math.PI * site.size * site.size * 0.25));
    this.neighbors = sites.map((site, index) => {
      const list: number[] = [];
      for (let other = 0; other < sites.length; other++) {
        if (other === index) continue;
        const candidate = sites[other];
        if (Math.hypot(site.x - candidate.x, site.z - candidate.z) < 9 + candidate.size * 2) list.push(other);
      }
      return list;
    });
    sites.forEach((site, index) => {
      const minimumX = Math.floor((site.x - site.size) / 4);
      const maximumX = Math.floor((site.x + site.size) / 4);
      const minimumZ = Math.floor((site.z - site.size) / 4);
      const maximumZ = Math.floor((site.z + site.size) / 4);
      for (let z = minimumZ; z <= maximumZ; z++) {
        for (let x = minimumX; x <= maximumX; x++) {
          const key = `${x}:${z}`;
          const bucket = this.cells.get(key) ?? [];
          bucket.push(index);
          this.cells.set(key, bucket);
        }
      }
    });
  }

  update(seconds: number, sunlight: THREE.Vector3, leaves: readonly CanopyLeafState[]): void {
    if (this.lastTime === undefined || seconds < this.lastTime) {
      this.lastTime = seconds;
      return;
    }
    const dt = clamp(seconds - this.lastTime, 0, 0.5);
    this.lastTime = seconds;
    this.accumulated += dt;
    if (this.accumulated < 0.2) return;
    const duration = this.accumulated;
    this.accumulated = 0;
    this.sun.copy(sunlight).normalize();
    for (let index = 0; index < this.sites.length; index++) {
      this.updateRadiation(index, leaves);
      this.updateWater(index, duration, seconds);
    }
  }

  throughfallAt = (x: number, z: number): number => {
    const bucket = this.cells.get(`${Math.floor(x / 4)}:${Math.floor(z / 4)}`);
    if (!bucket) return 1;
    let transmission = 1;
    for (const index of bucket) {
      const site = this.sites[index];
      const distance = Math.hypot(x - site.x, z - site.z);
      const radius = site.size * 0.6;
      if (distance >= radius) continue;
      const cover = 1 - distance * distance / (radius * radius);
      transmission *= 1 - (1 - this.states[index].groundRainFraction) * cover;
    }
    return clamp(transmission, 0, 1.5);
  };

  shadeAt(x: number, z: number): number {
    const bucket = this.cells.get(`${Math.floor(x / 4)}:${Math.floor(z / 4)}`);
    if (!bucket) return 0;
    let transmission = 1;
    for (const index of bucket) {
      const site = this.sites[index];
      const radius = site.size * 0.65;
      const distance = Math.hypot(x - site.x, z - site.z);
      if (distance > radius) continue;
      const cover = 1 - distance / radius;
      transmission *= 1 - (1 - this.states[index].transmittedLight) * cover;
    }
    return 1 - transmission;
  }

  reset(): void {
    this.lastTime = undefined;
    this.accumulated = 0;
    for (let index = 0; index < this.states.length; index++) {
      this.waterModels[index].reset();
      const state = this.states[index];
      state.sunlight = 1;
      state.diffuseLight = 0.3;
      state.transmittedLight = 1;
      state.wetness = 0;
      state.snowMass = 0;
      state.waterMass = 0;
      state.groundRainFraction = 1;
      state.stemflow = 0;
    }
  }

  private updateRadiation(index: number, leaves: readonly CanopyLeafState[]): void {
    const site = this.sites[index];
    const state = this.states[index];
    const leaf = leaves[index];
    const leafArea = (site.evergreen ? 3.2 : 2.6) * leaf.retainedLeaves;
    state.leafArea = leafArea;
    const solarHeight = Math.max(0.05, this.sun.y);
    const extinctionCoefficient = 0.5 / solarHeight;
    const clumping = site.evergreen ? 0.72 : 0.88;
    const canopyTransmission = Math.exp(-extinctionCoefficient * leafArea * clumping);
    let neighborTransmission = 1;
    const crownCentreY = site.y + site.size * 0.85;
    for (const neighborIndex of this.neighbors[index]) {
      const neighbor = this.sites[neighborIndex];
      const dx = neighbor.x - site.x;
      const dy = neighbor.y + neighbor.size * 0.85 - crownCentreY;
      const dz = neighbor.z - site.z;
      const along = dx * this.sun.x + dy * this.sun.y + dz * this.sun.z;
      if (along < 0) continue;
      const perpendicularSquared = Math.max(0, dx * dx + dy * dy + dz * dz - along * along);
      const radius = neighbor.size * 0.65;
      if (perpendicularSquared > radius * radius) continue;
      const path = Math.sqrt(radius * radius - perpendicularSquared) * 2;
      const density = leaves[neighborIndex].retainedLeaves * 1.8 / Math.max(0.2, neighbor.size);
      neighborTransmission *= Math.exp(-path * density * 0.45);
    }
    const cloud = this.weather.state.cloud;
    const directFraction = 1 - cloud * 0.75;
    const diffuseFraction = 0.18 + cloud * 0.52;
    const meanDirect = leafArea > 0.001 ? (1 - canopyTransmission) / Math.max(0.001, extinctionCoefficient * leafArea) : 1;
    const diffuseTransmission = Math.exp(-leafArea * clumping * 0.7);
    state.sunlight = clamp(meanDirect * neighborTransmission * directFraction + diffuseFraction * 0.4, 0.02, 1);
    state.diffuseLight = diffuseFraction * (0.4 + diffuseTransmission * 0.6);
    state.transmittedLight = canopyTransmission * directFraction + diffuseTransmission * diffuseFraction;
    state.sunlitLeaves = leafArea > 0 ? (1 - canopyTransmission) / extinctionCoefficient : 0;
    state.shadedLeaves = Math.max(0, leafArea - state.sunlitLeaves);
  }

  private updateWater(index: number, dt: number, seconds: number): void {
    const site = this.sites[index];
    const state = this.states[index];
    const forcing = this.forcing;
    this.weather.canopyWind(site.x, site.y + site.size, site.z, seconds, this.wind);
    forcing.rain = this.weather.localRain(site.x, site.z, seconds);
    forcing.snow = this.weather.localSnow(site.x, site.z, seconds);
    forcing.humidity = this.weather.state.humidity;
    forcing.temperature = this.weather.temperatureAt(site.y, 0.5, site.x, site.z);
    forcing.wind = this.wind.length();
    forcing.sunlight = this.weather.state.sunExposure * state.sunlight;
    forcing.leafAreaIndex = state.leafArea;
    forcing.branchMotion = Math.abs(Math.sin(seconds * 1.7 + index)) * forcing.wind * 0.1;
    const flux = this.waterModels[index].step(dt * 36, forcing);
    state.wetness = flux.wetLeafFraction;
    state.snowMass = flux.snowMass + flux.iceMass;
    state.waterMass = flux.interceptedWater;
    state.groundRainFraction = flux.effectiveRainFraction;
    state.stemflow = flux.stemflow;
    const concentratedWater = (flux.stemflow + flux.drip) * dt * 36 / (1000 * Math.max(0.1, Math.PI * site.size * site.size * 0.25));
    if (concentratedWater > 0) this.water.addWater(site.x, site.z, concentratedWater);
  }
}
