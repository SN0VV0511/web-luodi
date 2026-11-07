import { clamp, exponentialApproach, saturate, smoothstep } from "./math";
import { PorousMoistureColumn, type PorousBoundary } from "./porous-moisture";

export type WeatheringSubstrate = "steel" | "aluminium" | "zinc" | "wood" | "paint" | "rubber" | "fabric" | "paper" | "rope";

export type MaterialExposure = {
  temperature: number;
  humidity: number;
  rain: number;
  snow: number;
  sun: number;
  wind: number;
  salt: number;
  dust: number;
  pressure: number;
  shelter: number;
};

export type WeatheredMaterialState = {
  film: number;
  absorbedWater: number;
  deepMoisture: number;
  swelling: number;
  oxidation: number;
  patina: number;
  saltCrystals: number;
  dissolvedSalt: number;
  dirt: number;
  bleaching: number;
  roughness: number;
  metalLoss: number;
  coatingLoss: number;
  cracking: number;
  frost: number;
  biologicalFilm: number;
  flexibility: number;
  adhesion: number;
  surfaceTemperature: number;
};

export class MaterialWeathering {
  readonly state: WeatheredMaterialState = {
    film: 0,
    absorbedWater: 0.15,
    deepMoisture: 0.12,
    swelling: 0,
    oxidation: 0,
    patina: 0,
    saltCrystals: 0,
    dissolvedSalt: 0,
    dirt: 0,
    bleaching: 0,
    roughness: 0,
    metalLoss: 0,
    coatingLoss: 0,
    cracking: 0,
    frost: 0,
    biologicalFilm: 0,
    flexibility: 1,
    adhesion: 1,
    surfaceTemperature: 18,
  };
  private readonly initial = { oxidation: 0, dirt: 0, bleaching: 0, coatingLoss: 0, cracking: 0 };
  private wetHours = 0;
  private dryHours = 0;
  private frostCycles = 0;
  private thermalStress = 0;
  private priorTemperature = 18;
  private priorFrozen = false;
  private priorWet = false;
  private saltReservoir = 0;
  private organicCarbon = 0;
  private exposureHours = 0;
  private readonly porous: PorousMoistureColumn | undefined;
  private readonly porousBoundary: PorousBoundary = {
    humidity: 0.6,
    temperature: 18,
    surfaceTemperature: 18,
    film: 0,
    wind: 2,
    salt: 0,
    shelter: 0,
  };

  constructor(readonly substrate: WeatheringSubstrate, age: number) {
    const years = clamp(age, 0, 20);
    if (substrate === "wood" || substrate === "paper" || substrate === "fabric" || substrate === "rope") {
      this.porous = new PorousMoistureColumn(substrate);
    }
    this.initial.oxidation = substrate === "steel" ? saturate(years * 0.035) : substrate === "aluminium" || substrate === "zinc" ? saturate(years * 0.025) : 0;
    this.initial.dirt = Math.min(0.22, years * 0.018);
    this.initial.bleaching = substrate === "wood" || substrate === "fabric" || substrate === "rope" ? Math.min(0.55, years * 0.05) : Math.min(0.25, years * 0.018);
    this.initial.coatingLoss = substrate === "paint" ? Math.min(0.28, years * 0.024) : 0;
    this.initial.cracking = substrate === "wood" || substrate === "rubber" ? Math.min(0.3, years * 0.025) : Math.min(0.1, years * 0.005);
    this.reset();
  }

  step(seconds: number, exposure: MaterialExposure): WeatheredMaterialState {
    const dt = clamp(seconds, 0, 120);
    if (dt <= 0) return this.state;
    const state = this.state;
    const hours = dt / 3600;
    this.exposureHours += hours;
    const direct = 1 - saturate(exposure.shelter);
    const thermalMass = this.thermalMass();
    const solarAbsorption = this.solarAbsorption();
    const convection = 4 + Math.sqrt(Math.max(0, exposure.wind)) * 5;
    const absorbed = exposure.sun * 650 * solarAbsorption * direct;
    const radiativeCooling = (1 - exposure.humidity) * direct * 35;
    const evaporativeCooling = state.film * (1 - exposure.humidity) * 18;
    const targetTemperature = exposure.temperature + (absorbed - radiativeCooling - evaporativeCooling) / (convection + 6);
    state.surfaceTemperature = exponentialApproach(state.surfaceTemperature, targetTemperature, 1 / thermalMass, dt);
    this.updateSurfaceWater(dt, exposure, direct);
    this.updateAbsorption(dt, exposure);
    this.updateSalt(dt, exposure, direct);
    this.updateCorrosion(dt, exposure);
    this.updateCoating(dt, exposure, direct);
    this.updateMechanicalWeathering(dt, exposure);
    this.updateBiologicalFilm(dt, exposure, direct);
    this.updateDirt(dt, exposure, direct);
    this.updateAppearance();
    const wet = state.film > 0.08 || state.absorbedWater > 0.4;
    if (wet) {
      this.wetHours += hours;
      this.dryHours = 0;
    } else this.dryHours += hours;
    if (wet !== this.priorWet) {
      const cycling = Math.abs(state.absorbedWater - state.deepMoisture);
      state.cracking = saturate(state.cracking + cycling * 0.0002);
      this.priorWet = wet;
    }
    this.priorTemperature = state.surfaceTemperature;
    return state;
  }

  reset(): void {
    this.porous?.reset();
    this.state.film = 0;
    this.state.absorbedWater = 0.15;
    this.state.deepMoisture = 0.12;
    this.state.swelling = 0;
    this.state.oxidation = this.initial.oxidation;
    this.state.patina = this.initial.oxidation * 0.7;
    this.state.saltCrystals = 0;
    this.state.dissolvedSalt = 0;
    this.state.dirt = this.initial.dirt;
    this.state.bleaching = this.initial.bleaching;
    this.state.roughness = 0;
    this.state.metalLoss = 0;
    this.state.coatingLoss = this.initial.coatingLoss;
    this.state.cracking = this.initial.cracking;
    this.state.frost = 0;
    this.state.biologicalFilm = 0;
    this.state.flexibility = 1;
    this.state.adhesion = 1;
    this.state.surfaceTemperature = 18;
    this.wetHours = 0;
    this.dryHours = 0;
    this.frostCycles = 0;
    this.thermalStress = 0;
    this.priorTemperature = 18;
    this.priorFrozen = false;
    this.priorWet = false;
    this.saltReservoir = 0;
    this.organicCarbon = 0;
    this.exposureHours = 0;
    this.updateAppearance();
  }

  private updateSurfaceWater(dt: number, exposure: MaterialExposure, direct: number): void {
    const state = this.state;
    const temperature = state.surfaceTemperature;
    const wettingAngle = this.wettingAngle();
    const capture = (1 + Math.cos(wettingAngle)) * 0.5;
    const rainfall = exposure.rain * direct * (0.35 + capture * 0.65) * 0.018;
    const condensation = Math.max(0, exposure.humidity - 0.88) * Math.max(0, exposure.temperature - temperature) * 0.0005;
    const evaporation = Math.max(0, 1 - exposure.humidity) * (0.0008 + Math.max(0, temperature) * 0.00005) * (1 + exposure.wind * 0.12);
    const drainage = Math.max(0, state.film - 0.1) * 0.07;
    state.film = clamp(state.film + (rainfall + condensation - evaporation - drainage) * dt, 0, 1);
    const frostPotential = (1 - smoothstep(-3, 0.5, temperature)) * exposure.humidity;
    const frozenFilm = Math.min(state.film, frostPotential * dt * 0.005);
    state.film -= frozenFilm;
    state.frost = clamp(state.frost + frozenFilm + exposure.snow * direct * dt * 0.002 - Math.max(0, temperature) * dt * 0.002, 0, 1);
  }

  private updateAbsorption(dt: number, exposure: MaterialExposure): void {
    const state = this.state;
    if (!this.porous) {
      state.absorbedWater = 0;
      state.deepMoisture = 0;
      state.swelling = 0;
      return;
    }
    this.porousBoundary.humidity = exposure.humidity;
    this.porousBoundary.temperature = exposure.temperature;
    this.porousBoundary.surfaceTemperature = state.surfaceTemperature;
    this.porousBoundary.film = state.film;
    this.porousBoundary.wind = exposure.wind;
    this.porousBoundary.salt = state.dissolvedSalt;
    this.porousBoundary.shelter = exposure.shelter;
    const moisture = this.porous.step(dt, this.porousBoundary);
    state.absorbedWater = moisture.surfaceWater;
    state.deepMoisture = moisture.coreWater;
    state.swelling = clamp(moisture.swelling, -0.1, 0.2);
    state.film = clamp(state.film + (moisture.exudedWater - moisture.absorbedFilm) / 0.12, 0, 1);
    state.frost = Math.max(state.frost, moisture.iceFraction * 0.5);
    state.cracking = Math.max(state.cracking, moisture.damage);
    const thermalCapacity = this.substrate === "wood" ? 23000 : this.substrate === "rope" ? 8500 : 1900;
    state.surfaceTemperature += clamp(moisture.latentHeat / thermalCapacity, -2, 2);
  }

  private updateSalt(dt: number, exposure: MaterialExposure, direct: number): void {
    const state = this.state;
    const deposition = Math.max(0, exposure.salt) * direct * (1 + exposure.wind * 0.1) * dt;
    this.saltReservoir += deposition * 300000;
    const solubility = 0.26 + Math.max(0, state.surfaceTemperature) * 0.0003;
    const liquidCapacity = state.film * solubility;
    if (state.dissolvedSalt < liquidCapacity) {
      const dissolution = Math.min(this.saltReservoir, (liquidCapacity - state.dissolvedSalt) * dt * 0.08);
      this.saltReservoir -= dissolution;
      state.dissolvedSalt += dissolution;
    } else {
      const crystal = Math.min(state.dissolvedSalt, (state.dissolvedSalt - liquidCapacity) * dt * 0.12);
      state.dissolvedSalt -= crystal;
      this.saltReservoir += crystal;
      const crystalStress = crystal * this.porosity() * (1 - state.film);
      state.cracking = saturate(state.cracking + crystalStress * 0.008);
    }
    const washing = Math.min(state.dissolvedSalt, exposure.rain * direct * dt * 0.015);
    state.dissolvedSalt -= washing;
    this.saltReservoir *= Math.exp(-exposure.rain * direct * dt * 0.003);
    this.saltReservoir = clamp(this.saltReservoir, 0, 0.8);
    state.saltCrystals = saturate(this.saltReservoir * (1 - state.film));
  }

  private updateCorrosion(dt: number, exposure: MaterialExposure): void {
    if (this.substrate !== "steel" && this.substrate !== "aluminium" && this.substrate !== "zinc" && this.substrate !== "paint") return;
    const state = this.state;
    const kelvin = clamp(state.surfaceTemperature + 273.15, 230, 360);
    const activation = Math.exp(-35000 / 8.314 * (1 / kelvin - 1 / 293.15));
    const electrolyte = smoothstep(0.01, 0.12, state.film) * (1 - smoothstep(0.7, 1, state.film) * 0.6);
    const oxygen = 1 - state.film * 0.65;
    const chloride = 1 + state.dissolvedSalt * 12;
    const exposedMetal = this.substrate === "paint" ? state.coatingLoss : 1;
    const passivation = this.substrate === "aluminium" ? Math.exp(-state.patina * 7) : this.substrate === "zinc" ? Math.exp(-state.patina * 3) : 1 - state.patina * 0.4;
    const baseline = this.substrate === "steel" ? 0.00000018 : this.substrate === "paint" ? 0.00000012 : 0.000000025;
    const corrosion = baseline * activation * electrolyte * oxygen * chloride * exposedMetal * passivation * dt;
    state.oxidation = saturate(state.oxidation + corrosion);
    state.metalLoss = saturate(state.metalLoss + corrosion * 0.4);
    const patinaGrowth = corrosion * (this.substrate === "steel" ? 0.6 : 2.5);
    const patinaWash = exposure.rain * dt * state.patina * 0.0000003;
    state.patina = clamp(state.patina + patinaGrowth - patinaWash, 0, 1);
    if (this.substrate === "paint") state.coatingLoss = saturate(state.coatingLoss + corrosion * 0.7);
  }

  private updateCoating(dt: number, exposure: MaterialExposure, direct: number): void {
    const state = this.state;
    const uv = exposure.sun * direct * (1 - state.dirt * 0.4);
    const thermalAcceleration = Math.exp(clamp((state.surfaceTemperature - 20) / 30, -2, 2));
    const susceptibility = this.substrate === "fabric" ? 0.0000007 : this.substrate === "paper" ? 0.000001 : this.substrate === "wood" ? 0.0000005 : 0.00000015;
    state.bleaching = saturate(state.bleaching + uv * thermalAcceleration * susceptibility * dt);
    if (this.substrate === "paint" || this.substrate === "rubber" || this.substrate === "fabric") {
      const oxidation = uv * thermalAcceleration * dt * 0.00000008;
      const hydrolysis = state.absorbedWater * Math.max(0, state.surfaceTemperature) * dt * 0.000000002;
      state.coatingLoss = saturate(state.coatingLoss + oxidation + hydrolysis);
    }
    const underfilm = state.dissolvedSalt * state.film * (state.cracking + state.coatingLoss);
    state.adhesion = clamp(1 - underfilm * 0.4 - state.coatingLoss * 0.45 - state.frost * 0.12, 0.15, 1);
  }

  private updateMechanicalWeathering(dt: number, exposure: MaterialExposure): void {
    const state = this.state;
    const temperatureChange = state.surfaceTemperature - this.priorTemperature;
    const expansion = this.substrate === "wood" ? 0.000005 : this.substrate === "aluminium" ? 0.000023 : 0.000012;
    const strain = Math.abs(temperatureChange) * expansion + Math.abs(state.absorbedWater - state.deepMoisture) * 0.0002;
    this.thermalStress = exponentialApproach(this.thermalStress, strain, 0.1, dt);
    const frozen = state.surfaceTemperature < -0.5 && state.absorbedWater > 0.1;
    if (frozen && !this.priorFrozen) {
      this.frostCycles++;
      const porePressure = state.absorbedWater * 0.09 * (1 - this.porosity() * 0.5);
      state.cracking = saturate(state.cracking + porePressure * 0.001);
    }
    this.priorFrozen = frozen;
    const fatigue = this.thermalStress * exposure.wind * dt * 0.0001;
    const abrasion = exposure.dust * exposure.wind ** 2 * dt * 0.02;
    state.cracking = saturate(state.cracking + fatigue + abrasion);
    const coldStiffening = 1 - smoothstep(-12, 8, state.surfaceTemperature);
    const waterSoftening = this.substrate === "paper" ? state.absorbedWater * 0.65 : this.substrate === "fabric" ? state.absorbedWater * 0.25 : 0;
    state.flexibility = clamp(1 - coldStiffening * 0.35 - state.bleaching * 0.2 - state.cracking * 0.4 + waterSoftening, 0.15, 1.3);
  }

  private updateBiologicalFilm(dt: number, exposure: MaterialExposure, direct: number): void {
    const state = this.state;
    const porous = this.porosity();
    const hydration = smoothstep(0.25, 0.6, state.absorbedWater + state.film * 0.3);
    const temperature = smoothstep(3, 17, state.surfaceTemperature) * (1 - smoothstep(32, 44, state.surfaceTemperature));
    const substrateFood = this.substrate === "wood" || this.substrate === "rope" ? 1 : 0.15;
    this.organicCarbon = clamp(this.organicCarbon + exposure.dust * dt * 2000 - state.biologicalFilm * dt * 0.000001, 0, 1);
    const nutrient = substrateFood * 0.7 + this.organicCarbon * 0.3;
    const growth = hydration * temperature * nutrient * porous * dt * 0.0000004;
    const sunDamage = exposure.sun * direct * dt * 0.0000002;
    const dryingDamage = Math.max(0, 0.2 - exposure.humidity) * dt * 0.000001;
    state.biologicalFilm = clamp(state.biologicalFilm + growth - (sunDamage + dryingDamage) * state.biologicalFilm, 0, 0.7);
  }

  private updateDirt(dt: number, exposure: MaterialExposure, direct: number): void {
    const state = this.state;
    const adhesion = 0.3 + state.film * 0.7 + this.porosity() * 0.25;
    const deposition = Math.max(0, exposure.dust) * (1 + exposure.wind * 0.15) * adhesion * dt * 28000;
    const wash = exposure.rain * direct * dt * 0.003 * (1 - this.porosity() * 0.45);
    const erosion = Math.max(0, exposure.wind - 6) * (1 - state.film) * dt * 0.0002;
    state.dirt = clamp(state.dirt + deposition - state.dirt * (wash + erosion), 0, 0.75);
  }

  private updateAppearance(): void {
    const state = this.state;
    const corrosionRoughness = state.oxidation * (this.substrate === "steel" ? 0.45 : 0.18);
    const saltRoughness = state.saltCrystals * 0.2;
    const crackRoughness = state.cracking * 0.18;
    const grimeRoughness = state.dirt * 0.08;
    const wetSmoothing = state.film * 0.32;
    state.roughness = clamp(corrosionRoughness + saltRoughness + crackRoughness + grimeRoughness - wetSmoothing, -0.35, 0.65);
  }

  private porosity(): number {
    if (this.substrate === "wood") return 0.58;
    if (this.substrate === "paper") return 0.8;
    if (this.substrate === "fabric") return 0.65;
    if (this.substrate === "rope") return 0.55;
    if (this.substrate === "paint") return 0.04 + this.state.coatingLoss * 0.1;
    return 0.005;
  }

  private wettingAngle(): number {
    const degrees = this.substrate === "rubber" ? 105 : this.substrate === "paint" ? 88 : this.substrate === "wood" ? 52 : this.substrate === "fabric" ? 40 : 72;
    return degrees * Math.PI / 180;
  }

  private thermalMass(): number {
    if (this.substrate === "paper" || this.substrate === "fabric") return 12;
    if (this.substrate === "wood" || this.substrate === "rope") return 220;
    if (this.substrate === "rubber") return 110;
    return 45;
  }

  private solarAbsorption(): number {
    if (this.substrate === "rubber") return 0.92;
    if (this.substrate === "aluminium" || this.substrate === "zinc") return 0.35;
    if (this.substrate === "paper") return 0.32;
    if (this.substrate === "wood" || this.substrate === "rope") return 0.68;
    return 0.55;
  }
}
