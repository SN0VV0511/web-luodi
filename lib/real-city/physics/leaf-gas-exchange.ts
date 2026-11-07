import { clamp, exponentialApproach, saturate, smoothstep } from "./math";
import { SafeguardedRootSolver } from "./root-solver";

export type LeafEnvironment = {
  airTemperature: number;
  humidity: number;
  pressure: number;
  irradiance: number;
  windSpeed: number;
  carbonDioxide: number;
  leafWaterPotential: number;
  chlorophyll: number;
  nitrogen: number;
  wetness: number;
};

export type LeafExchangeState = {
  temperature: number;
  assimilation: number;
  respiration: number;
  grossAssimilation: number;
  stomatalConductance: number;
  boundaryConductance: number;
  internalCarbonDioxide: number;
  transpiration: number;
  fluorescence: number;
  photoinhibition: number;
  quantumYield: number;
  electronTransport: number;
  rubiscoLimitation: number;
  lightLimitation: number;
  sugarExport: number;
  waterUseEfficiency: number;
  vaporPressureDeficit: number;
};

export class LeafGasExchange {
  readonly state: LeafExchangeState = {
    temperature: 18,
    assimilation: 0,
    respiration: 0,
    grossAssimilation: 0,
    stomatalConductance: 0.05,
    boundaryConductance: 0.2,
    internalCarbonDioxide: 280,
    transpiration: 0,
    fluorescence: 0,
    photoinhibition: 0,
    quantumYield: 0.05,
    electronTransport: 0,
    rubiscoLimitation: 0,
    lightLimitation: 0,
    sugarExport: 0,
    waterUseEfficiency: 0,
    vaporPressureDeficit: 0,
  };
  private readonly root = new SafeguardedRootSolver();
  private current: LeafEnvironment | undefined;
  private vcmax = 60;
  private jmax = 100;
  private gamma = 42;
  private kc = 404;
  private ko = 278;
  private respiration = 1;
  private electronTransport = 0;
  private hydraulicClosure = 1;
  private sugarPool = 0;
  private damage = 0;
  private acclimatedTemperature = 20;
  private readonly carbonResidual = (internal: number) => this.balanceCarbon(internal);
  private readonly energyResidual = (temperature: number) => this.balanceEnergy(temperature);

  constructor(readonly characteristicLength = 0.08, readonly evergreen = false) {}

  step(dt: number, environment: LeafEnvironment): LeafExchangeState {
    if (dt <= 0) return this.state;
    this.current = environment;
    const duration = Math.min(120, dt);
    this.acclimatedTemperature = exponentialApproach(this.acclimatedTemperature, environment.airTemperature, 0.00015, duration);
    const waterPotential = environment.leafWaterPotential;
    this.hydraulicClosure = 1 / (1 + Math.exp(-(waterPotential + 1.6) * 3.8));
    const airMoles = environment.pressure / (8.314 * Math.max(230, environment.airTemperature + 273.15));
    const wind = Math.max(0.05, environment.windSpeed);
    this.state.boundaryConductance = 0.135 * Math.sqrt(wind / Math.max(0.01, this.characteristicLength)) * airMoles / 40;
    const energy = this.root.solve(this.energyResidual, environment.airTemperature - 10, environment.airTemperature + 16, this.state.temperature, 0.005, 14);
    this.state.temperature = exponentialApproach(this.state.temperature, energy.value, 0.12, duration);
    this.refreshBiochemistry(this.state.temperature);
    const carbon = this.root.solve(this.carbonResidual, 5, Math.max(10, environment.carbonDioxide + (environment.irradiance < 5 ? 160 : 0)), this.state.internalCarbonDioxide, 0.001, 18);
    this.state.internalCarbonDioxide = carbon.value;
    this.computeAssimilation(carbon.value);
    const stomatalTarget = this.stomatalTarget(this.state.assimilation);
    this.state.stomatalConductance = exponentialApproach(this.state.stomatalConductance, stomatalTarget, stomatalTarget < this.state.stomatalConductance ? 0.07 : 0.025, duration);
    const leafVapor = this.saturationVaporPressure(this.state.temperature);
    const airVapor = this.saturationVaporPressure(environment.airTemperature) * environment.humidity;
    const deficit = Math.max(0, leafVapor - airVapor);
    this.state.vaporPressureDeficit = deficit;
    const totalConductance = 1 / (1 / Math.max(0.001, this.state.stomatalConductance) + 1 / Math.max(0.001, this.state.boundaryConductance));
    this.state.transpiration = Math.max(0, totalConductance * deficit * 1000 / environment.pressure * 0.018);
    this.state.transpiration *= 1 - environment.wetness * 0.7;
    const light = Math.max(0, environment.irradiance) * 4.6 * 0.45;
    const excess = Math.max(0, light - 650) / 1000;
    const cold = 1 - smoothstep(2, 14, this.state.temperature);
    const damageRate = excess * (0.2 + cold * 0.8) * (1 - this.hydraulicClosure * 0.7) * 0.00002;
    const repair = smoothstep(3, 18, this.state.temperature) * (1 - smoothstep(38, 45, this.state.temperature)) * 0.00001;
    this.damage = clamp(this.damage + (damageRate - repair * this.damage) * duration, 0, 0.8);
    this.state.photoinhibition = this.damage;
    this.state.quantumYield = 0.055 * (1 - this.damage) * environment.chlorophyll;
    this.state.fluorescence = light > 0 ? saturate((1 - this.state.electronTransport / Math.max(1, light)) * 0.04) : 0;
    const producedSugar = Math.max(0, this.state.assimilation) * duration * 30e-6;
    const respiratoryLoss = this.state.respiration * duration * 30e-6;
    this.sugarPool = Math.max(0, this.sugarPool + producedSugar - respiratoryLoss * 0.25);
    const exportCapacity = (0.00003 + this.sugarPool * 0.008) * this.hydraulicClosure;
    const exported = Math.min(this.sugarPool, exportCapacity * duration);
    this.sugarPool -= exported;
    this.state.sugarExport = exported / duration;
    this.state.waterUseEfficiency = this.state.transpiration > 1e-10 ? Math.max(0, this.state.assimilation) * 44e-6 / this.state.transpiration : 0;
    return this.state;
  }

  reset(): void {
    this.state.temperature = 18;
    this.state.assimilation = 0;
    this.state.respiration = 0;
    this.state.grossAssimilation = 0;
    this.state.stomatalConductance = 0.05;
    this.state.internalCarbonDioxide = 280;
    this.state.transpiration = 0;
    this.state.photoinhibition = 0;
    this.state.sugarExport = 0;
    this.sugarPool = 0;
    this.damage = 0;
    this.acclimatedTemperature = 20;
  }

  private refreshBiochemistry(temperature: number): void {
    const environment = this.current;
    if (!environment) return;
    const kelvin = clamp(temperature + 273.15, 240, 330);
    const reference = 298.15;
    const gas = 8.314;
    const arrhenius = (activation: number) => Math.exp(activation * (kelvin - reference) / (gas * kelvin * reference));
    const optimum = 303 + (this.acclimatedTemperature - 20) * 0.3;
    const heatInhibition = 1 / (1 + Math.exp((kelvin - optimum) * 0.3));
    const coldInhibition = smoothstep(-3, 9, temperature);
    const nutrient = clamp(environment.nitrogen, 0.1, 1.4);
    const pigment = clamp(environment.chlorophyll, 0.05, 1);
    this.vcmax = (this.evergreen ? 46 : 72) * nutrient * arrhenius(65000) * heatInhibition * coldInhibition * (1 - this.damage * 0.5);
    this.jmax = (this.evergreen ? 85 : 130) * nutrient * arrhenius(43000) * heatInhibition * coldInhibition * (1 - this.damage);
    this.kc = 404.9 * arrhenius(79430);
    this.ko = 278.4 * arrhenius(36380);
    this.gamma = 42.75 * arrhenius(37830);
    this.respiration = (this.evergreen ? 0.7 : 1.2) * Math.pow(2, (temperature - 25) / 10) * nutrient;
    const photons = Math.max(0, environment.irradiance) * 4.6 * 0.45;
    const absorbed = photons * (0.72 + pigment * 0.18) * (1 - environment.wetness * 0.05);
    const potential = absorbed * 0.24;
    const curvature = 0.7;
    const sum = potential + this.jmax;
    const discriminant = Math.max(0, sum * sum - 4 * curvature * potential * this.jmax);
    this.electronTransport = (sum - Math.sqrt(discriminant)) / (2 * curvature);
  }

  private computeAssimilation(internalCarbon: number): number {
    const rubisco = this.vcmax * Math.max(0, internalCarbon - this.gamma) / Math.max(1, internalCarbon + this.kc * (1 + 210 / this.ko));
    const lightLimited = this.electronTransport * Math.max(0, internalCarbon - this.gamma) / Math.max(1, 4 * internalCarbon + 8 * this.gamma);
    const phosphateLimited = this.vcmax * 0.5;
    const gross = Math.min(rubisco, lightLimited, phosphateLimited);
    this.state.grossAssimilation = gross;
    this.state.respiration = this.respiration;
    this.state.assimilation = gross - this.respiration;
    this.state.rubiscoLimitation = rubisco;
    this.state.lightLimitation = lightLimited;
    this.state.electronTransport = this.electronTransport;
    return this.state.assimilation;
  }

  private balanceCarbon(internalCarbon: number): number {
    const environment = this.current;
    if (!environment) return 0;
    const assimilation = this.computeAssimilation(internalCarbon);
    const stomata = this.stomatalTarget(assimilation);
    const boundary = this.state.boundaryConductance / 1.37;
    const total = 1 / (1.6 / Math.max(0.001, stomata) + 1 / Math.max(0.001, boundary));
    const supplied = total * (environment.carbonDioxide - internalCarbon);
    return supplied - assimilation;
  }

  private stomatalTarget(assimilation: number): number {
    const environment = this.current;
    if (!environment) return 0.01;
    const relativeHumidity = clamp(environment.humidity, 0.1, 1);
    const ballBerry = 0.008 + 8.5 * Math.max(0, assimilation) * relativeHumidity / Math.max(50, environment.carbonDioxide);
    return clamp(ballBerry * this.hydraulicClosure * (1 - environment.wetness * 0.5), 0.003, 0.7);
  }

  private balanceEnergy(temperature: number): number {
    const environment = this.current;
    if (!environment) return 0;
    this.refreshBiochemistry(temperature);
    const absorption = environment.irradiance * (0.45 + environment.chlorophyll * 0.15);
    const skyTemperature = environment.airTemperature - 8 * (1 - environment.humidity);
    const emitted = 2 * 0.96 * 5.670374419e-8 * ((temperature + 273.15) ** 4 - (skyTemperature + 273.15) ** 4);
    const heatConductance = this.state.boundaryConductance * 29.3;
    const sensible = 2 * heatConductance * (temperature - environment.airTemperature);
    const leafVapor = this.saturationVaporPressure(temperature);
    const airVapor = this.saturationVaporPressure(environment.airTemperature) * environment.humidity;
    const combined = 1 / (1 / Math.max(0.003, this.state.stomatalConductance) + 1 / Math.max(0.003, this.state.boundaryConductance));
    const transpiration = Math.max(0, combined * (leafVapor - airVapor) * 1000 / environment.pressure * 0.018);
    const latent = transpiration * 2.45e6;
    return absorption - emitted - sensible - latent;
  }

  private saturationVaporPressure(temperature: number): number {
    return 0.6108 * Math.exp(17.27 * temperature / (temperature + 237.3));
  }
}
