import { clamp, exponentialApproach, saturate } from "./math";

export type FogBoundary = {
  airTemperature: number;
  humidity: number;
  pressure: number;
  windSpeed: number;
  solarFlux: number;
  cloudCover: number;
  groundTemperature: number;
  waterTemperature: number;
  waterFraction: number;
  surfaceWetness: number;
  aerosolNumber: number;
  aerosolExtinction: number;
};

export type FogLayerState = {
  temperature: number;
  humidity: number;
  vapor: number;
  liquid: number;
  radius: number;
  extinction: number;
  scattering: number;
  anisotropy: number;
  turbulence: number;
};

export class FogColumn {
  readonly temperature: Float64Array;
  readonly vapor: Float64Array;
  readonly liquid: Float64Array;
  readonly number: Float64Array;
  readonly radius: Float64Array;
  readonly extinction: Float64Array;
  readonly turbulence: Float64Array;
  readonly heights: Float64Array;
  private readonly nextTemperature: Float64Array;
  private readonly nextVapor: Float64Array;
  private readonly nextLiquid: Float64Array;
  private readonly solar: Float64Array;
  private readonly longwave: Float64Array;
  private readonly baselineNumber: Float64Array;
  private accumulated = 0;
  private initialized = false;
  private pressure = 101325;
  integratedLiquid = 0;
  opticalDepth = 0;
  groundDeposition = 0;
  meanRadius = 0;
  meanExtinction = 0;

  constructor(readonly layers = 8, readonly height = 5) {
    const count = Math.max(3, layers);
    this.temperature = new Float64Array(count).fill(18);
    this.vapor = new Float64Array(count);
    this.liquid = new Float64Array(count);
    this.number = new Float64Array(count).fill(50e6);
    this.radius = new Float64Array(count).fill(2e-6);
    this.extinction = new Float64Array(count);
    this.turbulence = new Float64Array(count);
    this.heights = new Float64Array(count);
    this.nextTemperature = new Float64Array(count);
    this.nextVapor = new Float64Array(count);
    this.nextLiquid = new Float64Array(count);
    this.solar = new Float64Array(count);
    this.longwave = new Float64Array(count);
    this.baselineNumber = new Float64Array(count).fill(50e6);
    for (let index = 0; index < count; index++) this.heights[index] = (index + 0.5) * height / count;
  }

  step(dt: number, boundary: FogBoundary): void {
    if (!this.initialized) this.reset(boundary);
    this.accumulated += clamp(dt, 0, 0.5);
    if (this.accumulated < 0.1) return;
    const duration = Math.min(0.5, this.accumulated);
    this.accumulated = 0;
    this.pressure = boundary.pressure;
    const cellHeight = this.height / this.temperature.length;
    const stable = cellHeight * cellHeight / Math.max(0.01, boundary.windSpeed * 0.2) * 0.35;
    const substeps = clamp(Math.ceil(duration / Math.max(0.01, stable)), 1, 8);
    const step = duration / substeps;
    for (let substep = 0; substep < substeps; substep++) {
      this.computeRadiation(boundary);
      this.computeMixing(boundary);
      this.exchangeBoundary(step, boundary);
      this.diffuse(step, boundary);
      this.condense(step, boundary);
      this.settle(step);
    }
    this.integratedLiquid = 0;
    this.opticalDepth = 0;
    this.meanRadius = 0;
    let weightedNumber = 0;
    for (let index = 0; index < this.temperature.length; index++) {
      const water = Math.max(0, this.liquid[index]);
      const count = Math.max(1e4, this.number[index]);
      const radius = water > 0 ? Math.cbrt(water / (count * 4 / 3 * Math.PI * 1000)) : 0.5e-6;
      this.radius[index] = clamp(radius, 0.5e-6, 25e-6);
      const dropletExtinction = water > 1e-9 ? 2 * Math.PI * this.radius[index] * this.radius[index] * count : 0;
      const humidAerosol = boundary.aerosolExtinction * (1 + this.relativeHumidity(index) ** 4 * 2);
      this.extinction[index] = clamp(dropletExtinction + humidAerosol, 0, 0.16);
      this.integratedLiquid += water * cellHeight;
      this.opticalDepth += this.extinction[index] * cellHeight;
      this.meanRadius += this.radius[index] * water;
      weightedNumber += water;
    }
    this.meanRadius = weightedNumber > 0 ? this.meanRadius / weightedNumber : 0.5e-6;
    this.meanExtinction = this.opticalDepth / this.height;
  }

  sample(height: number, target: FogLayerState): FogLayerState {
    const coordinate = clamp(height / this.height * this.temperature.length - 0.5, 0, this.temperature.length - 1);
    const first = Math.floor(coordinate);
    const second = Math.min(this.temperature.length - 1, first + 1);
    const fraction = coordinate - first;
    const interpolate = (array: Float64Array) => array[first] + (array[second] - array[first]) * fraction;
    target.temperature = interpolate(this.temperature);
    target.vapor = interpolate(this.vapor);
    target.liquid = interpolate(this.liquid);
    target.radius = interpolate(this.radius);
    target.extinction = interpolate(this.extinction);
    target.scattering = target.extinction * 0.995;
    target.anisotropy = clamp(0.73 + target.radius * 9000, 0.73, 0.88);
    target.turbulence = interpolate(this.turbulence);
    target.humidity = saturate(target.vapor / this.saturatedVapor(target.temperature));
    return target;
  }

  reset(boundary?: FogBoundary): void {
    const air = boundary?.airTemperature ?? 18;
    const humidity = boundary?.humidity ?? 0.6;
    this.pressure = boundary?.pressure ?? 101325;
    for (let index = 0; index < this.temperature.length; index++) {
      const temperature = air - this.heights[index] * 0.0065;
      this.temperature[index] = temperature;
      this.vapor[index] = this.saturatedVapor(temperature) * humidity;
      this.liquid[index] = 0;
      this.number[index] = Math.max(1e6, boundary?.aerosolNumber ?? 50e6);
      this.baselineNumber[index] = this.number[index];
      this.radius[index] = 0.5e-6;
      this.extinction[index] = boundary?.aerosolExtinction ?? 0;
      this.turbulence[index] = 0;
    }
    this.accumulated = 0;
    this.integratedLiquid = 0;
    this.opticalDepth = 0;
    this.groundDeposition = 0;
    this.meanRadius = 0.5e-6;
    this.meanExtinction = 0;
    this.initialized = boundary !== undefined;
  }

  private computeRadiation(boundary: FogBoundary): void {
    const cellHeight = this.height / this.temperature.length;
    let solar = Math.max(0, boundary.solarFlux) * (1 - boundary.cloudCover * 0.55);
    const skyTemperature = boundary.airTemperature - (7 + (1 - boundary.humidity) * 10) * (1 - boundary.cloudCover * 0.8);
    let downwardLongwave = 5.670374419e-8 * (skyTemperature + 273.15) ** 4;
    for (let index = this.temperature.length - 1; index >= 0; index--) {
      const opacity = 1 - Math.exp(-this.extinction[index] * cellHeight);
      const absorbedSolar = solar * opacity * 0.08;
      this.solar[index] = absorbedSolar;
      solar *= 1 - opacity * 0.25;
      const emission = 5.670374419e-8 * (this.temperature[index] + 273.15) ** 4;
      const infraredOpacity = 1 - Math.exp(-this.liquid[index] * cellHeight * 130);
      this.longwave[index] = (downwardLongwave - emission) * infraredOpacity;
      downwardLongwave = downwardLongwave * (1 - infraredOpacity) + emission * infraredOpacity;
    }
    const groundTemperature = boundary.groundTemperature * (1 - boundary.waterFraction) + boundary.waterTemperature * boundary.waterFraction;
    let upwardLongwave = 5.670374419e-8 * (groundTemperature + 273.15) ** 4;
    for (let index = 0; index < this.temperature.length; index++) {
      const emission = 5.670374419e-8 * (this.temperature[index] + 273.15) ** 4;
      const opacity = 1 - Math.exp(-this.liquid[index] * cellHeight * 130);
      this.longwave[index] += (upwardLongwave - emission) * opacity;
      upwardLongwave = upwardLongwave * (1 - opacity) + emission * opacity;
    }
  }

  private computeMixing(boundary: FogBoundary): void {
    const cellHeight = this.height / this.temperature.length;
    for (let index = 0; index < this.temperature.length; index++) {
      const below = Math.max(0, index - 1);
      const above = Math.min(this.temperature.length - 1, index + 1);
      const temperatureGradient = (this.temperature[above] - this.temperature[below]) / Math.max(cellHeight, (above - below) * cellHeight);
      const potentialGradient = temperatureGradient + 0.0098;
      const shear = Math.max(0.02, boundary.windSpeed / (this.heights[index] + 0.2));
      const richardson = 9.80665 * potentialGradient / ((this.temperature[index] + 273.15) * shear * shear);
      const stability = richardson > 0 ? 1 / (1 + richardson * 5) ** 2 : Math.sqrt(1 - richardson * 12);
      const mixingLength = 0.4 * this.heights[index] * (1 - this.heights[index] / (this.height * 1.5));
      this.turbulence[index] = clamp(mixingLength * mixingLength * shear * stability, 0.0005, 0.35);
    }
  }

  private exchangeBoundary(dt: number, boundary: FogBoundary): void {
    const groundTemperature = boundary.groundTemperature * (1 - boundary.waterFraction) + boundary.waterTemperature * boundary.waterFraction;
    const exchange = (0.002 + boundary.windSpeed * 0.001) * dt;
    const wet = boundary.surfaceWetness * (1 - boundary.waterFraction) + boundary.waterFraction;
    const sourceVapor = this.saturatedVapor(groundTemperature) * (0.55 + wet * 0.45);
    this.temperature[0] += (groundTemperature - this.temperature[0]) * Math.min(0.2, exchange * 3);
    this.vapor[0] += (sourceVapor - this.vapor[0]) * Math.min(0.2, exchange * 2);
    const top = this.temperature.length - 1;
    const aboveVapor = this.saturatedVapor(boundary.airTemperature) * boundary.humidity;
    const entrainment = Math.min(0.1, (0.002 + boundary.windSpeed * 0.001) * dt);
    this.temperature[top] += (boundary.airTemperature - this.temperature[top]) * entrainment;
    this.vapor[top] += (aboveVapor - this.vapor[top]) * entrainment;
    this.liquid[top] *= 1 - entrainment;
  }

  private diffuse(dt: number, boundary: FogBoundary): void {
    const cellHeight = this.height / this.temperature.length;
    this.nextTemperature.set(this.temperature);
    this.nextVapor.set(this.vapor);
    this.nextLiquid.set(this.liquid);
    for (let index = 0; index < this.temperature.length - 1; index++) {
      const diffusivity = Math.min(this.turbulence[index], this.turbulence[index + 1]);
      const factor = Math.min(0.2, diffusivity * dt / (cellHeight * cellHeight));
      const heat = (this.temperature[index] - this.temperature[index + 1]) * factor;
      const vapor = (this.vapor[index] - this.vapor[index + 1]) * factor;
      const liquid = (this.liquid[index] - this.liquid[index + 1]) * factor;
      this.nextTemperature[index] -= heat;
      this.nextTemperature[index + 1] += heat;
      this.nextVapor[index] -= vapor;
      this.nextVapor[index + 1] += vapor;
      this.nextLiquid[index] -= liquid;
      this.nextLiquid[index + 1] += liquid;
    }
    for (let index = 0; index < this.temperature.length; index++) {
      const airDensity = boundary.pressure / (287.05 * (this.temperature[index] + 273.15));
      const heatCapacity = Math.max(100, airDensity * 1005 * cellHeight);
      this.nextTemperature[index] += (this.solar[index] + this.longwave[index]) * dt / heatCapacity;
      this.temperature[index] = clamp(this.nextTemperature[index], boundary.airTemperature - 12, boundary.airTemperature + 12);
      this.vapor[index] = Math.max(0, this.nextVapor[index]);
      this.liquid[index] = Math.max(0, this.nextLiquid[index]);
    }
  }

  private condense(dt: number, boundary: FogBoundary): void {
    for (let index = 0; index < this.temperature.length; index++) {
      const saturation = this.saturatedVapor(this.temperature[index]);
      const supersaturation = this.vapor[index] - saturation;
      const equilibriumFactor = 1 - Math.exp(-dt * (0.3 + this.number[index] / 1e9));
      let condensed = supersaturation * equilibriumFactor;
      if (condensed < 0) condensed = Math.max(-this.liquid[index], condensed);
      this.vapor[index] -= condensed;
      this.liquid[index] = Math.max(0, this.liquid[index] + condensed);
      const airDensity = boundary.pressure / (287.05 * (this.temperature[index] + 273.15));
      this.temperature[index] += condensed * 2.45e6 / Math.max(800, airDensity * 1005);
      const relative = this.vapor[index] / Math.max(1e-8, saturation);
      const activation = saturate((relative - 0.98) / 0.04);
      const targetNumber = Math.max(1e6, boundary.aerosolNumber) * (0.1 + activation * 0.9);
      this.number[index] = exponentialApproach(this.number[index], targetNumber, 0.02, dt);
      const coalescence = this.liquid[index] * this.number[index] * dt * 0.01;
      this.number[index] = Math.max(1e5, this.number[index] - coalescence);
    }
  }

  private settle(dt: number): void {
    const cellHeight = this.height / this.temperature.length;
    for (let index = 0; index < this.temperature.length; index++) {
      const radius = this.radius[index];
      const speed = 2 * 1000 * 9.80665 * radius * radius / (9 * 1.81e-5);
      const fraction = clamp(speed * dt / cellHeight, 0, 0.25);
      const settled = this.liquid[index] * fraction;
      this.liquid[index] -= settled;
      if (index > 0) this.liquid[index - 1] += settled;
      else this.groundDeposition += settled * cellHeight;
    }
  }

  private relativeHumidity(index: number): number {
    return clamp(this.vapor[index] / Math.max(1e-8, this.saturatedVapor(this.temperature[index])), 0, 1.1);
  }

  private saturatedVapor(temperature: number): number {
    const pressure = 610.78 * Math.exp(17.27 * temperature / (temperature + 237.3));
    return Math.max(1e-8, pressure / (461.5 * (temperature + 273.15)));
  }
}
