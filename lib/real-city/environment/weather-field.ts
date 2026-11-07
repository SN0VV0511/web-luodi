import * as THREE from "three";
import { UrbanMicroclimate, createMicroclimateSample } from "./urban-microclimate";
import type { CityTerrain } from "./terrain";
import { UrbanAerosolField } from "./aerosol-field";
import { CoastalWeatherFronts, createFrontInfluence } from "./weather-fronts";
import type { SeasonState } from "../../city-seasons";
import { clamp, exponentialApproach, layeredNoise, saturate, smoothNoise, smoothstep } from "../physics/math";

export type WeatherObservation = {
  temperature: number;
  humidity: number;
  pressure: number;
  rain: number;
  snow: number;
  windSpeed: number;
  gust: number;
  cloud: number;
  visibility: number;
  sunExposure: number;
  airDensity: number;
  dewPoint: number;
  evaporation: number;
};

export class WeatherField {
  readonly state: WeatherObservation = {
    temperature: 18,
    humidity: 0.62,
    pressure: 1013.25,
    rain: 0,
    snow: 0,
    windSpeed: 2.6,
    gust: 1,
    cloud: 0.32,
    visibility: 9000,
    sunExposure: 0.8,
    airDensity: 1.225,
    dewPoint: 10,
    evaporation: 0.1,
  };
  readonly windDirection = new THREE.Vector3(0.72, 0, -0.48).normalize();
  readonly fronts = new CoastalWeatherFronts();
  microclimate: UrbanMicroclimate | undefined;
  aerosols: UrbanAerosolField | undefined;
  private readonly micro = createMicroclimateSample();
  private readonly front = createFrontInfluence();
  private readonly localFront = createFrontInfluence();
  private season = "spring";
  private night = false;
  private lastSeconds: number | undefined;
  private cloudDrift = 0;
  private sunDirection = new THREE.Vector3(-0.7, 0.6, 0.4).normalize();
  private readonly curlA = new THREE.Vector3();
  private readonly curlB = new THREE.Vector3();

  attachTerrain(terrain: CityTerrain): void {
    this.microclimate = new UrbanMicroclimate(terrain);
    this.aerosols = new UrbanAerosolField(terrain, this.microclimate);
  }

  update(seconds: number, night: boolean, season: SeasonState): void {
    const reset = this.lastSeconds === undefined || seconds < this.lastSeconds || (seconds === this.lastSeconds && season.season !== this.season);
    const dt = reset ? 1 : Math.min(0.5, Math.max(0, seconds - this.lastSeconds!));
    this.lastSeconds = seconds;
    this.season = season.season;
    this.night = night;
    this.sunDirection.copy(season.sunPosition).normalize();
    this.fronts.update(seconds, season.season);
    this.fronts.sample(0, 0, seconds, this.front);
    const regionalTemperature = season.temperatureC - (night ? 4.2 : 0) + this.front.temperature;
    const precipitation = saturate(season.precipitation);
    const freezing = 1 - smoothstep(-1.6, 1.4, regionalTemperature);
    const rain = clamp(precipitation * (1 - freezing) + this.front.rain * (1 - freezing), 0, 1);
    const snow = clamp(precipitation * freezing + this.front.snow, 0, 1);
    const warmAir = smoothstep(5, 28, regionalTemperature);
    const targetHumidity = clamp(0.47 + precipitation * 0.4 + (night ? 0.12 : 0) - warmAir * 0.05 + this.front.humidity, 0.35, 0.99);
    const front = smoothNoise(seconds * 0.009, 4.9, 331);
    const targetCloud = clamp(0.18 + precipitation * 0.68 + front * 0.21 + this.front.cloud, 0.08, 0.98);
    const baseWind = season.season === "autumn" ? 3.7 : season.season === "winter" ? 4.2 : season.season === "summer" ? 2.2 : 2.8;
    const gust = 0.76 + smoothNoise(seconds * 0.14, 9.2, 55) * 0.63 + Math.max(0, Math.sin(seconds * 0.31 + 0.8)) * 0.17;
    const approach = (current: number, target: number, rate = 1) => reset ? target : exponentialApproach(current, target, rate, dt);
    this.state.temperature = approach(this.state.temperature, regionalTemperature, 0.32);
    this.state.humidity = approach(this.state.humidity, targetHumidity, 0.5);
    this.state.pressure = approach(this.state.pressure, 1017 - precipitation * 12 + (front - 0.5) * 6, 0.25);
    this.state.rain = approach(this.state.rain, rain, 1.3);
    this.state.snow = approach(this.state.snow, snow, 1.1);
    this.state.windSpeed = approach(this.state.windSpeed, baseWind * gust + this.front.gust, 0.7);
    this.state.gust = gust;
    this.state.cloud = approach(this.state.cloud, targetCloud, 0.42);
    this.state.sunExposure = night ? 0 : Math.max(0.05, season.sunIntensity / 2.8) * (1 - this.state.cloud * 0.78);
    this.state.airDensity = (this.state.pressure * 100) / (287.05 * (this.state.temperature + 273.15));
    const gamma = Math.log(Math.max(0.01, this.state.humidity)) + 17.62 * this.state.temperature / (243.12 + this.state.temperature);
    this.state.dewPoint = 243.12 * gamma / (17.62 - gamma);
    this.state.evaporation = Math.max(0.002, (1 - this.state.humidity) * (0.04 + Math.max(0, this.state.temperature) * 0.004) * (1 + this.state.windSpeed * 0.09));
    this.state.visibility = clamp(18000 * (1 - this.state.humidity * 0.67) * (1 - precipitation * 0.78), 900, 18000);
    const angle = season.season === "winter" ? 0.78 : season.season === "summer" ? -0.9 : season.season === "autumn" ? -0.25 : -0.58;
    this.windDirection.set(Math.cos(angle), 0, Math.sin(angle));
    this.cloudDrift = seconds * this.state.windSpeed * 0.08;
    this.microclimate?.update(seconds, night, this.state, this.windDirection, this.sunDirection);
    this.aerosols?.update(seconds, this.state, this.windDirection, season.season, night);
    if (this.aerosols) this.state.visibility = Math.min(this.state.visibility, this.aerosols.mean.visibility);
  }

  wind = (x: number, y: number, z: number, seconds: number, target: THREE.Vector3): THREE.Vector3 => {
    const roughness = 0.35;
    const height = Math.max(0.45, y);
    const profile = Math.log((height + roughness) / roughness) / Math.log((10 + roughness) / roughness);
    const speed = this.state.windSpeed * clamp(profile, 0.18, 1.8);
    const advectedX = x * 0.022 - seconds * this.windDirection.x * 0.12;
    const advectedZ = z * 0.022 - seconds * this.windDirection.z * 0.12;
    const eddyA = smoothNoise(advectedX, advectedZ, 14) - 0.5;
    const eddyB = smoothNoise(advectedX + 18.1, advectedZ - 7.7, 23) - 0.5;
    const thermal = this.state.sunExposure * Math.max(0, this.state.temperature - 12) * 0.008;
    const uplift = thermal * Math.sin(x * 0.041 + seconds * 0.2) * Math.cos(z * 0.036 - seconds * 0.16);
    target.copy(this.windDirection).multiplyScalar(speed);
    target.x += eddyA * speed * 0.38;
    target.z += eddyB * speed * 0.38;
    target.y = uplift + (eddyA - eddyB) * 0.12;
    this.fronts.sample(x, z, seconds, this.localFront);
    target.x += this.localFront.windX * profile;
    target.z += this.localFront.windZ * profile;
    if (this.microclimate) {
      this.microclimate.sample(x, z, this.micro);
      const groundInfluence = Math.exp(-Math.max(0, y - 2) / 18);
      const attenuation = 1 - this.micro.windShelter * groundInfluence * 0.72;
      target.x = target.x * attenuation + this.micro.channelX * speed * groundInfluence;
      target.z = target.z * attenuation + this.micro.channelZ * speed * groundInfluence;
      const wakePhase = seconds * 1.9 + x * 0.12 + z * 0.09;
      target.x += Math.sin(wakePhase) * this.micro.turbulence * groundInfluence;
      target.z += Math.cos(wakePhase * 0.83) * this.micro.turbulence * groundInfluence;
      target.y += Math.max(0, this.micro.surfaceHeat) * 0.014 * groundInfluence;
    }
    return target;
  };

  canopyWind(x: number, y: number, z: number, seconds: number, target: THREE.Vector3): THREE.Vector3 {
    this.wind(x, y, z, seconds, target);
    const shear = Math.sin(seconds * 1.4 + x * 0.03 + z * 0.07) * 0.16;
    target.x += target.z * shear;
    target.z -= target.x * shear * 0.6;
    return target;
  }

  localRain(x: number, z: number, seconds: number): number {
    const rainCell = layeredNoise(x * 0.008 - seconds * 0.015, z * 0.008 + seconds * 0.009, 92);
    this.fronts.sample(x, z, seconds, this.localFront);
    return clamp(this.state.rain * (0.55 + rainCell * 0.9) + this.localFront.rain * 0.35, 0, 1);
  }

  localSnow(x: number, z: number, seconds: number): number {
    const snowCell = smoothNoise(x * 0.012 + seconds * 0.008, z * 0.012 - seconds * 0.011, 207);
    this.fronts.sample(x, z, seconds, this.localFront);
    return clamp(this.state.snow * (0.7 + snowCell * 0.6) + this.localFront.snow * 0.35, 0, 1);
  }

  cloudShadow(x: number, z: number, seconds: number): number {
    const height = 160;
    const solarShift = height / Math.max(0.12, this.sunDirection.y);
    const px = (x - this.sunDirection.x * solarShift + this.cloudDrift) * 0.008;
    const pz = (z - this.sunDirection.z * solarShift + seconds * 0.11) * 0.008;
    const field = layeredNoise(px, pz, 77);
    return smoothstep(0.48 - this.state.cloud * 0.2, 0.68, field) * this.state.cloud;
  }

  relativeHumidityAt(height: number): number {
    const cooling = Math.max(0, height) * 0.0065;
    return clamp(this.state.humidity + cooling * 0.018, 0, 1);
  }

  temperatureAt(height: number, exposed: number, x?: number, z?: number): number {
    const lapse = Math.max(0, height) * 0.0065;
    const solarHeating = this.state.sunExposure * exposed * 2.8;
    const local = x !== undefined && z !== undefined ? this.microclimate?.sample(x, z, this.micro) : undefined;
    return this.state.temperature - lapse + solarHeating + (local?.temperatureOffset ?? 0);
  }

  precipitationImpactSpeed(): number {
    const dropSize = 0.4 + this.state.rain * 1.8;
    return Math.min(8.5, 2.2 + dropSize * 2.4);
  }

  dewPotential(surfaceTemperature: number): number {
    return saturate((this.state.dewPoint - surfaceTemperature) / 4) * this.state.humidity;
  }

  mistPotential(height: number): number {
    const saturation = smoothstep(0.78, 0.98, this.relativeHumidityAt(height));
    const coolness = 1 - smoothstep(6, 22, this.state.temperature);
    return clamp(saturation * (0.35 + coolness * 0.65) * (this.night ? 1 : 0.6) + this.front.mist, 0, 1);
  }

  windCurl(x: number, y: number, z: number, seconds: number, target: THREE.Vector3): THREE.Vector3 {
    const sampleDistance = 0.8;
    this.wind(x + sampleDistance, y, z, seconds, this.curlA);
    this.wind(x - sampleDistance, y, z, seconds, this.curlB);
    const dzdx = (this.curlA.z - this.curlB.z) / (2 * sampleDistance);
    this.wind(x, y, z + sampleDistance, seconds, this.curlA);
    this.wind(x, y, z - sampleDistance, seconds, this.curlB);
    const dxdz = (this.curlA.x - this.curlB.x) / (2 * sampleDistance);
    return target.set(0, dxdz - dzdx, 0);
  }

  get seasonId(): string {
    return this.season;
  }
}
