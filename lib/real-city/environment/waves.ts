import * as THREE from "three";
import type { WaterSample } from "../physics/buoyancy";
import { clamp, layeredNoise, smoothstep } from "../physics/math";
import type { ShallowWaterPatch } from "../physics/shallow-water";
import { WeatherField } from "./weather-field";
import { DirectionalWaveSpectrum, createSpectralWaveSample, type WaveWind } from "../physics/wave-spectrum";

export class HarborWaveField {
  private readonly current = new THREE.Vector2();
  private readonly spectrum = new DirectionalWaveSpectrum(6, 2);
  private readonly spectralSample = createSpectralWaveSample();
  private readonly wind: WaveWind = { speed: 2, directionX: 1, directionZ: 0, fetch: 5000, temperature: 18 };
  private readonly normal = new THREE.Vector3();
  private localSurface: ShallowWaterPatch | undefined;

  constructor(readonly weather: WeatherField) {}

  setLocalSurface(surface: ShallowWaterPatch | undefined): void {
    this.localSurface = surface;
  }

  sample = (x: number, z: number, seconds: number, result: WaterSample): WaterSample => {
    if (this.localSurface?.contains(x, z)) return this.localSurface.sample(x, z, seconds, result);
    return this.analyticSample(x, z, seconds, result);
  };

  analyticSample = (x: number, z: number, seconds: number, result: WaterSample): WaterSample => {
    const shoreDistance = Math.max(0, z - 117);
    const depth = this.depthAt(x, z);
    const shelter = this.shelterAt(x, z);
    this.wind.speed = this.weather.state.windSpeed;
    this.wind.directionX = this.weather.windDirection.x;
    this.wind.directionZ = this.weather.windDirection.z;
    this.wind.temperature = this.weather.state.temperature;
    this.wind.fetch = 2500 + Math.max(0, -this.wind.directionZ) * 9000;
    this.spectrum.update(seconds, this.wind);
    const gradientX = (this.depthAt(x + 1, z) - this.depthAt(x - 1, z)) * 0.5;
    const gradientZ = (this.depthAt(x, z + 1) - this.depthAt(x, z - 1)) * 0.5;
    const wave = this.spectrum.sample(x, z, depth, shelter, gradientX, gradientZ, this.spectralSample);
    const shorelineFade = smoothstep(0, 3, shoreDistance);
    const height = (this.tideAt(seconds) + wave.elevation) * shorelineFade;
    this.currentAt(x, z, seconds, this.current);
    result.height = -0.02 + height;
    result.normal.set(-wave.slopeX * shorelineFade, 1, -wave.slopeZ * shorelineFade).normalize();
    result.velocity.set(
      wave.velocityX + this.current.x + wave.driftX,
      wave.velocityY * shorelineFade,
      wave.velocityZ + this.current.y + wave.driftZ,
    );
    result.foam = clamp(wave.breaking * (1.2 - shelter * 0.5), 0, 1);
    return result;
  };

  depthAt(x: number, z: number): number {
    const coast = Math.max(0, z - 119);
    const channel = smoothstep(175, 245, x) * 1.3;
    const sandbar = Math.exp(-(((x + 150) / 90) ** 2)) * Math.exp(-(((z - 142) / 18) ** 2)) * 0.75;
    return Math.max(0.15, 0.2 + coast * 0.085 + channel - sandbar);
  }

  shelterAt(x: number, z: number): number {
    const harbor = smoothstep(60, 135, x) * (1 - smoothstep(175, 240, z));
    const quay = Math.exp(-Math.max(0, z - 125) * 0.075);
    return clamp(harbor * 0.55 + quay * 0.18, 0, 0.85);
  }

  tideAt(seconds: number): number {
    return Math.sin(seconds * Math.PI * 2 / 480) * 0.045 + Math.sin(seconds * Math.PI * 2 / 247 + 0.8) * 0.012;
  }

  currentAt(x: number, z: number, seconds: number, target: THREE.Vector2): THREE.Vector2 {
    const tide = Math.cos(seconds * Math.PI * 2 / 480);
    const shelter = this.shelterAt(x, z);
    const eddy = layeredNoise(x * 0.018 + seconds * 0.006, z * 0.018, 512) - 0.5;
    target.set(0.035 + tide * 0.028, eddy * 0.06);
    target.multiplyScalar(1 - shelter * 0.6);
    return target;
  }

  shorelinePosition(x: number, seconds: number): number {
    const surf = Math.sin(x * 0.025 - seconds * 0.65) * 0.65;
    const secondary = Math.sin(x * 0.061 + seconds * 0.42) * 0.24;
    return 124 + surf + secondary + this.tideAt(seconds) * 8;
  }

  sprayVelocity(x: number, z: number, seconds: number, target: THREE.Vector3): THREE.Vector3 {
    this.sample(x, z, seconds, { height: 0, normal: this.normal, velocity: target, foam: 0 });
    const lift = Math.max(0, target.y) * 2.4;
    target.y = Math.min(2.6, 0.4 + lift);
    target.x += this.weather.windDirection.x * 0.7;
    target.z += this.weather.windDirection.z * 0.7;
    return target;
  }

}
