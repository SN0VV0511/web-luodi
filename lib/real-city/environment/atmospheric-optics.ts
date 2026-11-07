import * as THREE from "three";
import { clamp } from "../physics/math";
import { WeatherField } from "./weather-field";

export type OpticalConditions = {
  rayleigh: THREE.Vector3;
  mie: THREE.Vector3;
  absorption: THREE.Vector3;
  solarIrradiance: THREE.Color;
  sunDirection: THREE.Vector3;
  aerosolScaleHeight: number;
  molecularScaleHeight: number;
  anisotropy: number;
};

export class AtmosphericOptics {
  readonly conditions: OpticalConditions = {
    rayleigh: new THREE.Vector3(5.8e-6, 13.5e-6, 33.1e-6),
    mie: new THREE.Vector3(2.1e-6, 2.1e-6, 2.1e-6),
    absorption: new THREE.Vector3(0.65e-6, 1.88e-6, 0.085e-6),
    solarIrradiance: new THREE.Color(1, 0.94, 0.83),
    sunDirection: new THREE.Vector3(-0.6, 0.7, 0.3).normalize(),
    aerosolScaleHeight: 1200,
    molecularScaleHeight: 8000,
    anisotropy: 0.76,
  };
  private readonly opticalDepth = new THREE.Vector3();
  private readonly extinction = new THREE.Vector3();
  private readonly rayleighColor = new THREE.Vector3();
  private readonly mieColor = new THREE.Vector3();
  private readonly sunlight = new THREE.Color();
  private night = false;

  constructor(readonly weather: WeatherField) {}

  update(sun: THREE.Vector3, night: boolean): void {
    this.night = night;
    this.conditions.sunDirection.copy(sun).normalize();
    const humidity = this.weather.state.humidity;
    const rain = this.weather.state.rain;
    const aerosolGrowth = 1 + Math.pow(humidity, 3) * 3.8;
    const rainWashout = 1 - rain * 0.42;
    const density = this.weather.state.airDensity / 1.225;
    this.conditions.rayleigh.set(5.8e-6, 13.5e-6, 33.1e-6).multiplyScalar(density);
    this.conditions.mie.set(2.1e-6, 2.25e-6, 2.4e-6).multiplyScalar(aerosolGrowth * rainWashout);
    const aerosol = this.weather.aerosols?.mean;
    if (aerosol) {
      this.conditions.mie.addScalar(aerosol.scattering);
    }
    this.conditions.absorption.set(0.65e-6, 1.88e-6, 0.085e-6).multiplyScalar(density);
    if (aerosol) this.conditions.absorption.addScalar(aerosol.absorption);
    this.conditions.anisotropy = clamp(aerosol ? aerosol.anisotropy * 0.5 + 0.36 + humidity * 0.06 : 0.72 + humidity * 0.12, 0.65, 0.88);
    this.conditions.aerosolScaleHeight = 1000 + this.weather.state.windSpeed * 95;
    this.conditions.molecularScaleHeight = 8000 * (this.weather.state.temperature + 273.15) / 288.15;
    const airMass = this.airMass(this.conditions.sunDirection.y);
    this.transmittance(airMass * 8000, 0, this.sunlight);
    this.conditions.solarIrradiance.setRGB(1, 0.97, 0.91).multiply(this.sunlight);
    if (night) this.conditions.solarIrradiance.setRGB(0.08, 0.12, 0.2);
  }

  transmittance(distance: number, height: number, target: THREE.Color): THREE.Color {
    const molecularDensity = Math.exp(-Math.max(0, height) / this.conditions.molecularScaleHeight);
    const aerosolDensity = Math.exp(-Math.max(0, height) / this.conditions.aerosolScaleHeight);
    this.extinction.copy(this.conditions.rayleigh).multiplyScalar(molecularDensity);
    this.extinction.addScaledVector(this.conditions.mie, aerosolDensity);
    this.extinction.addScaledVector(this.conditions.absorption, molecularDensity * 0.8);
    const path = Math.max(0, distance);
    return target.setRGB(
      Math.exp(-this.extinction.x * path),
      Math.exp(-this.extinction.y * path),
      Math.exp(-this.extinction.z * path),
    );
  }

  sky(direction: THREE.Vector3, height: number, target: THREE.Color): THREE.Color {
    const altitude = Math.max(0.01, direction.y);
    const airMass = this.airMass(altitude);
    const sunCosine = clamp(direction.dot(this.conditions.sunDirection), -1, 1);
    const rayleighPhase = 3 / (16 * Math.PI) * (1 + sunCosine * sunCosine);
    const g = this.conditions.anisotropy;
    const mieDenominator = Math.pow(Math.max(0.001, 1 + g * g - 2 * g * sunCosine), 1.5);
    const miePhase = (1 - g * g) / (4 * Math.PI * mieDenominator);
    const path = airMass * 8000;
    this.transmittance(path, height, this.sunlight);
    this.opticalDepth.set(1 - this.sunlight.r, 1 - this.sunlight.g, 1 - this.sunlight.b);
    this.rayleighColor.copy(this.conditions.rayleigh).multiplyScalar(rayleighPhase * 60000);
    this.mieColor.copy(this.conditions.mie).multiplyScalar(miePhase * 60000);
    this.extinction.copy(this.rayleighColor).add(this.mieColor);
    target.setRGB(
      this.extinction.x * this.opticalDepth.x * this.conditions.solarIrradiance.r,
      this.extinction.y * this.opticalDepth.y * this.conditions.solarIrradiance.g,
      this.extinction.z * this.opticalDepth.z * this.conditions.solarIrradiance.b,
    );
    target.multiplyScalar(this.night ? 0.12 : 1.8);
    return target;
  }

  fogColor(height: number, target: THREE.Color): THREE.Color {
    const sun = this.conditions.solarIrradiance;
    const humidity = this.weather.relativeHumidityAt(height);
    const gray = 0.64 + humidity * 0.2;
    target.setRGB(gray * 0.91, gray * 0.96, gray);
    target.multiply(sun).multiplyScalar(this.night ? 1.2 : 1.05);
    if (this.night) target.add(new THREE.Color(0.035, 0.045, 0.07));
    return target;
  }

  cloudAlbedo(density: number, target: THREE.Color): THREE.Color {
    const scatter = 1 - Math.exp(-Math.max(0, density) * 2.3);
    const shadow = clamp(this.weather.state.cloud * 0.4, 0, 0.4);
    target.copy(this.conditions.solarIrradiance).multiplyScalar(0.68 + scatter * 0.32 - shadow);
    target.r += 0.06 * scatter;
    target.g += 0.075 * scatter;
    target.b += 0.1 * scatter;
    return target;
  }

  visibilityExtinction(): number {
    return 3.912 / Math.max(100, this.weather.state.visibility);
  }

  mistDensity(height: number): number {
    const potential = this.weather.mistPotential(height);
    const layer = Math.exp(-Math.max(0, height) / 3.4);
    return potential * layer * this.visibilityExtinction() * 16;
  }

  private airMass(sunHeight: number): number {
    const elevation = Math.asin(clamp(sunHeight, 0.01, 1)) * 180 / Math.PI;
    const zenith = 90 - elevation;
    return 1 / (Math.cos(zenith * Math.PI / 180) + 0.50572 * Math.pow(96.07995 - zenith, -1.6364));
  }
}
