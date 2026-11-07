import { clamp, saturate } from "./math";

export type DropletState = {
  diameter: number;
  mass: number;
  speed: number;
  horizontalSpeed: number;
  temperature: number;
  iceFraction: number;
  aspectRatio: number;
  reynolds: number;
  weber: number;
};

export type DropletImpact = {
  energy: number;
  momentum: number;
  contactRadius: number;
  maximumRadius: number;
  crownHeight: number;
  crownDuration: number;
  crownFingers: number;
  splashFraction: number;
  capillarySpeed: number;
  decayRate: number;
  contactTime: number;
  restitution: number;
  wetting: number;
};

export function createDropletState(): DropletState {
  return {
    diameter: 0.001,
    mass: 5.24e-7,
    speed: 4,
    horizontalSpeed: 0,
    temperature: 18,
    iceFraction: 0,
    aspectRatio: 1,
    reynolds: 270,
    weber: 220,
  };
}

export function createDropletImpact(): DropletImpact {
  return {
    energy: 0,
    momentum: 0,
    contactRadius: 0.001,
    maximumRadius: 0.003,
    crownHeight: 0,
    crownDuration: 0.03,
    crownFingers: 6,
    splashFraction: 0,
    capillarySpeed: 0.2,
    decayRate: 2,
    contactTime: 0.03,
    restitution: 0,
    wetting: 1,
  };
}

export class PrecipitationPopulation {
  readonly bins = 32;
  readonly diameter = new Float64Array(this.bins);
  readonly numberDensity = new Float64Array(this.bins);
  readonly massFlux = new Float64Array(this.bins);
  readonly cumulative = new Float64Array(this.bins);
  readonly fallSpeed = new Float64Array(this.bins);
  meanDiameter = 0.001;
  meanSpeed = 4;
  waterFlux = 0;
  kineticFlux = 0;
  numberFlux = 0;
  private temperature = 18;
  private density = 1.225;
  private wind = 0;
  private humidity = 0.6;
  private intensity = -1;
  private priorTemperature = -999;

  constructor() {
    for (let index = 0; index < this.bins; index++) this.diameter[index] = 0.00015 + index / (this.bins - 1) * 0.00535;
    this.update(0.2, 18, 1.225, 2, 0.6);
  }

  update(rain: number, temperature: number, airDensity: number, windSpeed: number, humidity: number): void {
    this.temperature = temperature;
    this.density = airDensity;
    this.wind = windSpeed;
    this.humidity = humidity;
    if (Math.abs(rain - this.intensity) < 0.002 && Math.abs(temperature - this.priorTemperature) < 0.2) return;
    this.intensity = rain;
    this.priorTemperature = temperature;
    const rainRate = Math.max(0.02, rain * 38);
    const lambda = 4.1 * rainRate ** -0.21;
    const binWidth = 5.35 / (this.bins - 1);
    let totalNumberFlux = 0;
    let totalWaterFlux = 0;
    let weightedDiameter = 0;
    let weightedSpeed = 0;
    let kinetic = 0;
    for (let index = 0; index < this.bins; index++) {
      const diameter = this.diameter[index];
      const millimetres = diameter * 1000;
      const concentration = 8000 * Math.exp(-lambda * millimetres) * binWidth;
      const speed = this.terminalVelocity(diameter, airDensity);
      const volume = Math.PI / 6 * diameter ** 3;
      const numberFlux = concentration * speed;
      const massFlux = numberFlux * volume * 1000;
      this.numberDensity[index] = concentration;
      this.massFlux[index] = massFlux;
      this.fallSpeed[index] = speed;
      totalNumberFlux += numberFlux;
      totalWaterFlux += massFlux / 1000;
      weightedDiameter += diameter * massFlux;
      weightedSpeed += speed * massFlux;
      kinetic += massFlux * speed * speed * 0.5;
      this.cumulative[index] = totalNumberFlux;
    }
    for (let index = 0; index < this.bins; index++) this.cumulative[index] /= Math.max(1e-12, totalNumberFlux);
    this.meanDiameter = weightedDiameter / Math.max(1e-12, totalWaterFlux * 1000);
    this.meanSpeed = weightedSpeed / Math.max(1e-12, totalWaterFlux * 1000);
    this.waterFlux = rain > 0.001 ? totalWaterFlux : 0;
    this.kineticFlux = rain > 0.001 ? kinetic : 0;
    this.numberFlux = rain > 0.001 ? totalNumberFlux : 0;
  }

  sample(quantile: number, fallHeight: number, result: DropletState): DropletState {
    const q = clamp(quantile, 0, 0.999999);
    let low = 0;
    let high = this.bins - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.cumulative[middle] < q) low = middle + 1;
      else high = middle;
    }
    const index = low;
    const prior = index > 0 ? this.cumulative[index - 1] : 0;
    const fraction = (q - prior) / Math.max(1e-9, this.cumulative[index] - prior);
    const radiusBin = 0.00535 / (this.bins - 1);
    const diameter = Math.max(0.00008, this.diameter[index] + (fraction - 0.5) * radiusBin);
    const terminal = this.terminalVelocity(diameter, this.density);
    const flightTime = Math.max(0.02, fallHeight) / Math.max(0.4, terminal);
    const evaporativeLoss = this.evaporationLoss(diameter, flightTime);
    result.diameter = Math.max(0.00004, diameter * Math.cbrt(Math.max(0.03, 1 - evaporativeLoss)));
    result.mass = Math.PI / 6 * result.diameter ** 3 * 998;
    result.speed = terminal * Math.sqrt(1 - Math.exp(-2 * 9.80665 * Math.max(0.01, fallHeight) / Math.max(0.01, terminal * terminal)));
    const responseTime = result.mass / Math.max(1e-10, 3 * Math.PI * 1.81e-5 * diameter);
    result.horizontalSpeed = this.wind * (1 - Math.exp(-flightTime / Math.max(0.01, responseTime)));
    const wetBulbOffset = (1 - this.humidity) * Math.max(0, this.temperature + 15) * 0.18;
    result.temperature = this.temperature - wetBulbOffset;
    result.iceFraction = saturate(-result.temperature / 5) * saturate(flightTime / 3);
    result.aspectRatio = this.equilibriumAspect(result.diameter);
    const airViscosity = 1.81e-5;
    result.reynolds = this.density * result.speed * result.diameter / airViscosity;
    result.weber = 998 * result.speed * result.speed * result.diameter / this.surfaceTension(result.temperature);
    return result;
  }

  impact(drop: DropletState, waterDepth: number, roughness: number, contactAngle: number, result: DropletImpact): DropletImpact {
    const density = 998;
    const viscosity = this.waterViscosity(drop.temperature);
    const tension = this.surfaceTension(drop.temperature);
    const diameter = Math.max(0.00001, drop.diameter);
    const speed = Math.max(0, drop.speed);
    const weber = density * speed * speed * diameter / tension;
    const reynolds = density * speed * diameter / viscosity;
    const ohnesorge = viscosity / Math.sqrt(density * tension * diameter);
    const depthRatio = Math.max(0, waterDepth) / diameter;
    const roughnessRatio = roughness / diameter;
    const contactCosine = Math.cos(clamp(contactAngle, 5, 170) * Math.PI / 180);
    const wettingResistance = Math.max(0.1, 3 * (1 - contactCosine));
    const spreading = Math.sqrt((weber + 12) / (wettingResistance + 4 * weber / Math.sqrt(Math.max(1, reynolds))));
    const maximumRadius = diameter * 0.5 * clamp(spreading, 1, 12);
    const splashParameter = Math.pow(Math.max(0, weber), 0.5) * Math.pow(Math.max(1, reynolds), 0.25);
    const splashThreshold = 57.7 * (1 + Math.min(3, depthRatio) * 0.12) / (1 + Math.min(1, roughnessRatio) * 0.6);
    const splash = saturate((splashParameter - splashThreshold) / Math.max(10, splashThreshold));
    const capillaryTime = Math.sqrt(density * diameter ** 3 / tension);
    result.energy = drop.mass * speed * speed * 0.5;
    result.momentum = drop.mass * speed;
    result.contactRadius = diameter * 0.5;
    result.maximumRadius = maximumRadius;
    result.crownHeight = diameter * Math.sqrt(Math.max(0, weber)) * splash * (0.2 + saturate(depthRatio) * 0.45);
    result.crownDuration = clamp(capillaryTime * (4 + Math.min(3, depthRatio)), 0.02, 0.22);
    result.crownFingers = clamp(Math.round(6 + Math.sqrt(Math.max(0, weber)) * 0.5), 6, 24);
    result.splashFraction = splash * 0.35;
    const waveNumber = 2 * Math.PI / Math.max(0.005, maximumRadius * 8);
    const gravityTerm = 9.80665 / waveNumber;
    const capillaryTerm = tension * waveNumber / density;
    result.capillarySpeed = Math.sqrt((gravityTerm + capillaryTerm) * Math.tanh(waveNumber * Math.max(0.0001, waterDepth)));
    result.decayRate = 2 * viscosity / density * waveNumber * waveNumber + roughnessRatio * 0.25;
    result.contactTime = capillaryTime * (2.2 + ohnesorge * 15);
    result.restitution = contactAngle > 110 ? clamp(0.3 * (1 - splash) * Math.exp(-ohnesorge * 10), 0, 0.35) : 0;
    result.wetting = saturate((1 + contactCosine) * 0.5 * (1 - drop.iceFraction));
    return result;
  }

  terminalVelocity(diameter: number, airDensity: number): number {
    const millimetres = Math.max(0.04, diameter * 1000);
    const largeDropSpeed = 9.65 - 10.3 * Math.exp(-0.6 * millimetres);
    const stokesSpeed = 998 * 9.80665 * diameter * diameter / (18 * 1.81e-5);
    const blend = saturate((millimetres - 0.15) / 0.45);
    const speed = stokesSpeed * (1 - blend) + Math.max(0.1, largeDropSpeed) * blend;
    return clamp(speed * Math.sqrt(1.225 / Math.max(0.5, airDensity)), 0.05, 10.5);
  }

  private evaporationLoss(diameter: number, time: number): number {
    const vaporDeficit = (1 - this.humidity) * Math.exp(this.temperature * 0.045);
    const ventilation = 1 + 0.15 * Math.sqrt(this.terminalVelocity(diameter, this.density) * diameter * 70000);
    const reduction = vaporDeficit * ventilation * time * 1.8e-10 / Math.max(1e-10, diameter * diameter);
    return saturate(reduction);
  }

  private equilibriumAspect(diameter: number): number {
    const millimetres = diameter * 1000;
    if (millimetres < 1) return 1;
    return clamp(1.0048 + 0.0057 * millimetres - 0.02628 * millimetres * millimetres + 0.003682 * millimetres ** 3 - 0.0001677 * millimetres ** 4, 0.55, 1);
  }

  private waterViscosity(temperature: number): number {
    const kelvin = clamp(temperature + 273.15, 253.15, 330);
    return 2.414e-5 * Math.pow(10, 247.8 / (kelvin - 140));
  }

  private surfaceTension(temperature: number): number {
    const relative = 1 - clamp(temperature + 273.15, 253.15, 350) / 647.096;
    return Math.max(0.04, 0.2358 * relative ** 1.256 * (1 - 0.625 * relative));
  }
}
