import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import { CITY_DAY_SECONDS, sampleCityClock, type SeasonId } from "../../city-physics";
import type { ArchitecturalMaterials } from "./materials";
import { buildBarGraph, buildDigitalNumber, buildIntercomScreen, buildNeedleMeter, buildRotameter, buildSignalStack, buildThermometer } from "./display-instruments";

type BuildingUse = "apartment" | "villa" | "shop";

export type BuildingUtilityState = {
  indoorTemperature: number;
  outdoorTemperature: number;
  relativeHumidity: number;
  carbonDioxide: number;
  ventilationRate: number;
  coolingDemand: number;
  heatingDemand: number;
  heatPumpPower: number;
  occupied: number;
  lightingPower: number;
  plugPower: number;
  solarPower: number;
  importedPower: number;
  exportedPower: number;
  batteryCharge: number;
  batteryPower: number;
  freshWaterLitres: number;
  hotWaterTemperature: number;
  waterDrawLitresMinute: number;
  pumpPower: number;
  irrigationFlow: number;
  soilMoisture: number;
  greywaterLitres: number;
  energyKwh: number;
  harvestedKwh: number;
  waterUsedLitres: number;
  entryActive: boolean;
};

function finiteClamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, minimum, maximum) : minimum;
}

function seasonTemperature(season: SeasonId): number {
  if (season === "winter") return 5;
  if (season === "summer") return 30;
  if (season === "autumn") return 18;
  return 20;
}

function occupancyAt(hour: number, use: BuildingUse): number {
  if (use === "shop") {
    if (hour < 7 || hour > 22) return 0.02;
    if (hour < 9) return 0.18 + (hour - 7) * 0.16;
    if (hour < 12) return 0.5 + (hour - 9) * 0.08;
    if (hour < 14) return 0.85;
    if (hour < 17) return 0.55;
    if (hour < 20) return 0.92;
    return 0.45 - (hour - 20) * 0.2;
  }
  if (hour < 6) return 0.94;
  if (hour < 9) return 0.94 - (hour - 6) * 0.2;
  if (hour < 16) return use === "villa" ? 0.18 : 0.27;
  if (hour < 20) return 0.3 + (hour - 16) * 0.16;
  return 0.96;
}

export class BuildingUtilities {
  readonly state: BuildingUtilityState;
  private previousTime = 0;
  private waterRefilling = false;
  private irrigationOn = false;
  private readonly floorArea: number;
  private readonly occupants: number;
  private readonly thermalCapacity: number;
  private readonly tankCapacity: number;
  private readonly batteryCapacity: number;
  private readonly solarCapacity: number;
  private readonly heatingCapacity: number;
  private readonly ventilationVolume: number;
  private accumulatedTime = 0;

  constructor(readonly use: BuildingUse, area: number, readonly seed: number) {
    this.floorArea = Math.max(20, area);
    this.occupants = Math.max(2, Math.round(this.floorArea / (use === "shop" ? 13 : 31)));
    this.thermalCapacity = this.floorArea * 0.045;
    this.tankCapacity = this.occupants * 90;
    this.batteryCapacity = use === "apartment" ? 24 : 8;
    this.solarCapacity = use === "apartment" ? 12 : 4.2;
    this.heatingCapacity = this.floorArea * 0.065;
    this.ventilationVolume = this.floorArea * 2.7;
    this.state = {
      indoorTemperature: 22,
      outdoorTemperature: 20,
      relativeHumidity: 0.48,
      carbonDioxide: 450,
      ventilationRate: 0.5,
      coolingDemand: 0,
      heatingDemand: 0,
      heatPumpPower: 0,
      occupied: this.occupants * 0.3,
      lightingPower: 0,
      plugPower: 0,
      solarPower: 0,
      importedPower: 0,
      exportedPower: 0,
      batteryCharge: this.batteryCapacity * 0.65,
      batteryPower: 0,
      freshWaterLitres: this.tankCapacity * 0.72,
      hotWaterTemperature: 54,
      waterDrawLitresMinute: 0,
      pumpPower: 0,
      irrigationFlow: 0,
      soilMoisture: 0.62,
      greywaterLitres: this.tankCapacity * 0.15,
      energyKwh: 0,
      harvestedKwh: 0,
      waterUsedLitres: 0,
      entryActive: false,
    };
  }

  private updateOccupancy(hour: number, seconds: number, deltaHours: number): void {
    const state = this.state;
    const expected = occupancyAt(hour, this.use) * this.occupants;
    const stagger = Math.sin(seconds * 0.043 + this.seed * 3.4) * Math.min(2, this.occupants * 0.08);
    const target = finiteClamp(expected + stagger, 0, this.occupants);
    state.occupied += (target - state.occupied) * (1 - Math.exp(-deltaHours * 18));
    const arrivalWave = Math.abs(target - state.occupied);
    state.entryActive = arrivalWave > 0.7 && Math.sin(seconds * 0.45 + this.seed) > 0.65;
  }

  private updateAir(deltaHours: number, night: boolean, season: SeasonId): void {
    const state = this.state;
    const outdoor = seasonTemperature(season) + (night ? -4.5 : 2.5);
    state.outdoorTemperature += (outdoor - state.outdoorTemperature) * (1 - Math.exp(-deltaHours * 6));
    const carbonDioxideTarget = Math.max(0, (state.carbonDioxide - 700) / 600);
    const humidityTarget = Math.max(0, (state.relativeHumidity - 0.62) * 3);
    const freshAir = Math.max(0.3, Math.min(1.8, 0.4 + carbonDioxideTarget + humidityTarget));
    state.ventilationRate += (freshAir - state.ventilationRate) * (1 - Math.exp(-deltaHours * 10));
    const ventilationM3 = state.ventilationRate * this.ventilationVolume;
    const metabolicCarbonDioxide = state.occupied * 0.018 * 1e6 / this.ventilationVolume;
    const dilution = state.ventilationRate * (state.carbonDioxide - 420);
    state.carbonDioxide = finiteClamp(state.carbonDioxide + (metabolicCarbonDioxide - dilution) * deltaHours, 420, 2500);
    const infiltrationKw = ventilationM3 * 0.000335 * (state.outdoorTemperature - state.indoorTemperature) * 0.26;
    const transmissionKw = this.floorArea * 0.0013 * (state.outdoorTemperature - state.indoorTemperature);
    const internalGainsKw = state.occupied * 0.075 + state.plugPower * 0.75 + state.lightingPower * 0.8;
    const solarGainsKw = state.solarPower * 0.18;
    const targetTemperature = this.use === "shop" && night ? 18 : season === "summer" ? 25 : 21;
    const error = targetTemperature - state.indoorTemperature;
    state.heatingDemand = finiteClamp((error - 0.3) / 3.5, 0, 1);
    state.coolingDemand = finiteClamp((-error - 0.5) / 3.5, 0, 1);
    const heatingKw = state.heatingDemand * this.heatingCapacity;
    const coolingKw = state.coolingDemand * this.heatingCapacity;
    const coefficientOfPerformance = finiteClamp(4.5 - Math.abs(state.outdoorTemperature - targetTemperature) * 0.06, 2.1, 4.5);
    state.heatPumpPower = (heatingKw + coolingKw) / coefficientOfPerformance + ventilationM3 * 0.0003;
    const thermalChange = (transmissionKw + infiltrationKw + internalGainsKw + solarGainsKw + heatingKw - coolingKw) / this.thermalCapacity;
    state.indoorTemperature = finiteClamp(state.indoorTemperature + thermalChange * deltaHours, 8, 38);
    const outdoorHumidity = season === "summer" ? 0.68 : season === "winter" ? 0.4 : 0.54;
    const moistureFromPeople = state.occupied * 0.0009;
    const moistureExchange = (outdoorHumidity - state.relativeHumidity) * state.ventilationRate * 0.2;
    const dehumidification = state.coolingDemand * 0.08;
    state.relativeHumidity = finiteClamp(state.relativeHumidity + (moistureFromPeople + moistureExchange - dehumidification) * deltaHours, 0.2, 0.9);
  }

  private updateWater(hour: number, deltaHours: number, season: SeasonId): void {
    const state = this.state;
    const morningPeak = Math.exp(-Math.pow((hour - 7.5) / 1.2, 2));
    const eveningPeak = Math.exp(-Math.pow((hour - 20.5) / 1.7, 2));
    const restaurantPeak = Math.exp(-Math.pow((hour - 12.5) / 2, 2));
    const useRate = this.use === "shop" ? 0.03 + restaurantPeak * 0.13 : 0.025 + morningPeak * 0.19 + eveningPeak * 0.16;
    state.waterDrawLitresMinute = state.occupied * useRate;
    const drawnLitres = Math.min(state.freshWaterLitres, state.waterDrawLitresMinute * deltaHours * 60);
    state.freshWaterLitres -= drawnLitres;
    state.waterUsedLitres += drawnLitres;
    state.greywaterLitres = Math.min(this.tankCapacity * 0.4, state.greywaterLitres + drawnLitres * 0.55);
    if (state.freshWaterLitres < this.tankCapacity * 0.35) this.waterRefilling = true;
    if (state.freshWaterLitres > this.tankCapacity * 0.87) this.waterRefilling = false;
    if (this.waterRefilling) {
      state.freshWaterLitres = Math.min(this.tankCapacity, state.freshWaterLitres + this.occupants * 1.8 * deltaHours * 60);
      state.pumpPower = this.occupants * 0.012;
    } else state.pumpPower = state.waterDrawLitresMinute > 0.02 ? 0.035 : 0;
    const hotFraction = this.use === "shop" ? 0.4 : 0.55;
    const hotTankLitres = this.occupants * 18;
    const mixingLoss = drawnLitres * hotFraction / hotTankLitres * Math.max(0, state.hotWaterTemperature - 15);
    const standingLoss = (state.hotWaterTemperature - state.indoorTemperature) * 0.018 * deltaHours;
    const waterHeating = state.hotWaterTemperature < 50 ? 12 * deltaHours : 0;
    state.hotWaterTemperature = finiteClamp(state.hotWaterTemperature - mixingLoss - standingLoss + waterHeating, 20, 60);
    const evaporation = season === "summer" ? 0.055 : season === "winter" ? 0.008 : 0.025;
    state.soilMoisture = Math.max(0, state.soilMoisture - evaporation * deltaHours);
    if (hour > 5 && hour < 8 && state.soilMoisture < 0.38 && state.greywaterLitres > 5) this.irrigationOn = true;
    if (state.soilMoisture > 0.72 || hour > 8 || state.greywaterLitres < 1) this.irrigationOn = false;
    state.irrigationFlow = this.irrigationOn ? 2.4 : 0;
    const irrigated = Math.min(state.greywaterLitres, state.irrigationFlow * deltaHours * 60);
    state.greywaterLitres -= irrigated;
    state.soilMoisture = Math.min(1, state.soilMoisture + irrigated / Math.max(30, this.floorArea * 0.2));
  }

  private updatePower(hour: number, deltaHours: number, night: boolean, season: SeasonId): void {
    const state = this.state;
    const occupancyRatio = state.occupied / this.occupants;
    state.lightingPower = this.floorArea * 0.005 * Math.max(this.use === "shop" ? 0.2 : 0.04, occupancyRatio) * (night ? 1 : 0.25);
    state.plugPower = this.floorArea * 0.007 * (0.2 + occupancyRatio * 0.8);
    const sun = night ? 0 : Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
    const seasonalIrradiance = season === "winter" ? 0.56 : season === "summer" ? 1 : 0.82;
    const temperatureLoss = Math.max(0.75, 1 - Math.max(0, state.outdoorTemperature - 25) * 0.004);
    state.solarPower = this.solarCapacity * sun * seasonalIrradiance * temperatureLoss;
    const domesticWaterPower = state.hotWaterTemperature < 50 ? this.occupants * 0.11 : 0;
    const demand = state.lightingPower + state.plugPower + state.heatPumpPower + state.pumpPower + domesticWaterPower;
    const balance = state.solarPower - demand;
    state.batteryPower = 0;
    if (balance > 0 && state.batteryCharge < this.batteryCapacity * 0.95) {
      const chargePower = Math.min(balance, this.batteryCapacity * 0.35, (this.batteryCapacity * 0.95 - state.batteryCharge) / Math.max(deltaHours, 1e-8));
      state.batteryPower = -chargePower;
      state.batteryCharge += chargePower * deltaHours * 0.94;
    } else if (balance < 0 && state.batteryCharge > this.batteryCapacity * 0.15) {
      const dischargePower = Math.min(-balance, this.batteryCapacity * 0.35, (state.batteryCharge - this.batteryCapacity * 0.15) / Math.max(deltaHours, 1e-8));
      state.batteryPower = dischargePower;
      state.batteryCharge -= dischargePower * deltaHours / 0.94;
    }
    state.batteryCharge = finiteClamp(state.batteryCharge, 0, this.batteryCapacity);
    const gridBalance = balance + state.batteryPower;
    state.importedPower = Math.max(0, -gridBalance);
    state.exportedPower = Math.max(0, gridBalance);
    state.energyKwh += demand * deltaHours;
    state.harvestedKwh += state.solarPower * deltaHours;
  }

  update(seconds: number, night: boolean, season: SeasonId): void {
    const deltaSeconds = Math.max(0, Math.min(0.2, seconds - this.previousTime));
    this.previousTime = seconds;
    this.accumulatedTime += deltaSeconds;
    if (this.accumulatedTime < 0.1) return;
    const step = this.accumulatedTime;
    this.accumulatedTime = 0;
    const deltaHours = step * 24 / CITY_DAY_SECONDS;
    const hour = THREE.MathUtils.euclideanModulo(sampleCityClock(seconds).hour + this.seed * 0.15, 24);
    this.updateOccupancy(hour, seconds, deltaHours);
    this.updatePower(hour, deltaHours, night, season);
    this.updateAir(deltaHours, night, season);
    this.updateWater(hour, deltaHours, season);
  }

  batteryFraction(): number {
    return this.state.batteryCharge / this.batteryCapacity;
  }

  reservoirFraction(): number {
    return this.state.freshWaterLitres / this.tankCapacity;
  }

  occupiedFraction(): number {
    return this.state.occupied / this.occupants;
  }
}

export function buildElectricalMeter(context: ArchitectureContext, model: BuildingUtilities): Animation[] {
  const animations: Animation[] = [];
  const { white, dark, aluminum, green, red } = context.palette;
  context.box(white, 0, 0, 0, 0.23, 0.36, 0.1);
  context.box(dark, 0, 0.05, 0.057, 0.19, 0.12, 0.012);
  const display = buildDigitalNumber(context.at({ x: 0, y: 0.055, z: 0.068 }), 5, 0.025, 1);
  context.box(aluminum, 0, -0.12, 0.058, 0.18, 0.065, 0.012);
  for (let terminal = 0; terminal < 4; terminal++) {
    const x = -0.063 + terminal * 0.042;
    context.disc(aluminum, x, -0.178, 0.04, 0.007, 0.025);
    context.box(dark, x, -0.125, 0.068, 0.018, 0.025, 0.006);
  }
  const pulse = context.moving("Electrical meter consumption pulse", [-0.055, -0.025, 0.062], moving => {
    moving.box(red, 0, 0, 0, 0.012, 0.008, 0.004);
  });
  context.box(green, 0.055, -0.025, 0.062, 0.012, 0.008, 0.004);
  animations.push(seconds => {
    display.set(model.state.energyKwh);
    pulse.visible = Math.sin(seconds * Math.max(0.3, model.state.importedPower)) > 0.92;
  });
  return animations;
}

export function buildBreakerBoard(context: ArchitectureContext, circuits: number): void {
  const { aluminum, white, dark, yellow, green, red } = context.palette;
  const columns = Math.min(8, Math.max(3, circuits));
  const rows = Math.ceil(circuits / columns);
  const width = columns * 0.06 + 0.12;
  const height = rows * 0.14 + 0.18;
  context.box(aluminum, 0, 0, 0, width, height, 0.12);
  context.box(dark, 0, 0, 0.065, width - 0.05, height - 0.05, 0.01);
  for (let circuit = 0; circuit < circuits; circuit++) {
    const column = circuit % columns;
    const row = Math.floor(circuit / columns);
    const x = (column - (columns - 1) / 2) * 0.06;
    const y = (rows - 1) * 0.07 - row * 0.14;
    context.box(white, x, y, 0.085, 0.052, 0.11, 0.045);
    context.box(dark, x, y + 0.012, 0.115, 0.026, 0.026, 0.02);
    context.box(circuit % 3 === 0 ? red : green, x, y - 0.026, 0.111, 0.012, 0.008, 0.006);
    context.box(yellow, x, y + 0.039, 0.111, 0.025, 0.008, 0.004);
  }
  for (const side of [-1, 1]) {
    context.box(aluminum, side * (width / 2 - 0.015), 0, 0.12, 0.02, height, 0.08);
    context.disc(dark, side * (width / 2 - 0.025), height / 2 - 0.02, 0.07, 0.006, 0.012);
  }
}

export function buildCableTray(context: ArchitectureContext, length: number, width = 0.25): void {
  const { steel, aluminum, dark, red, green } = context.palette;
  for (const side of [-1, 1]) context.box(aluminum, side * width / 2, 0, 0, 0.015, 0.07, length);
  const crossbars = Math.max(2, Math.ceil(length / 0.2));
  for (let bar = 0; bar <= crossbars; bar++) context.box(steel, 0, -0.025, -length / 2 + bar * length / crossbars, width, 0.018, 0.035);
  const colors = [dark, dark, red, green];
  colors.forEach((material, index) => context.beam(material, [-width * 0.3 + index * width * 0.2, 0.005, -length / 2], [-width * 0.3 + index * width * 0.2, 0.005, length / 2], 0.012));
  for (const end of [-1, 1]) context.box(steel, 0, -0.07, end * length * 0.38, width + 0.08, 0.018, 0.04);
}

export function buildBatteryCabinet(context: ArchitectureContext, model: BuildingUtilities): Animation[] {
  const { white, aluminum, dark, yellow } = context.palette;
  context.box(white, 0, 0.58, 0, 0.65, 1.1, 0.35);
  context.box(aluminum, 0, 0.035, 0, 0.72, 0.07, 0.42);
  context.box(dark, 0, 0.6, 0.184, 0.55, 0.95, 0.016);
  for (let module = 0; module < 4; module++) {
    const y = 0.22 + module * 0.22;
    context.box(white, 0, y, 0.196, 0.52, 0.2, 0.025);
    for (const side of [-1, 1]) context.box(aluminum, side * 0.2, y, 0.22, 0.035, 0.08, 0.025);
    context.box(yellow, 0.11, y, 0.215, 0.055, 0.05, 0.006);
  }
  const graph = buildBarGraph(context.at({ x: -0.04, y: 1.035, z: 0.218 }), 0.26, 0.035, () => model.batteryFraction(), 8);
  const status = buildSignalStack(context.at({ x: 0.2, y: 1.14, z: 0 }), () => Math.abs(model.state.batteryPower) > 0.2 ? "amber" : "green");
  context.tube(dark, [[-0.22, 0.14, -0.16], [-0.3, 0.14, -0.23], [-0.3, 0.06, -0.45]], 0.019);
  return [graph, status];
}

export function buildSolarInverter(context: ArchitectureContext, model: BuildingUtilities): Animation[] {
  const { white, aluminum, dark, yellow } = context.palette;
  context.box(white, 0, 0, 0, 0.48, 0.62, 0.2);
  context.box(aluminum, 0, -0.23, 0.11, 0.43, 0.15, 0.03);
  for (let fin = 0; fin < 11; fin++) context.box(aluminum, -0.2 + fin * 0.04, -0.23, 0.14, 0.015, 0.13, 0.03);
  const display = buildDigitalNumber(context.at({ x: 0, y: 0.08, z: 0.118 }), 3, 0.033, 1);
  context.box(yellow, 0, -0.05, 0.11, 0.08, 0.06, 0.008);
  for (const side of [-1, 1]) context.tube(dark, [[side * 0.14, -0.31, 0], [side * 0.14, -0.44, 0], [side * 0.22, -0.5, 0]], 0.012);
  return [() => display.set(model.state.solarPower)];
}

export function buildHeatRecoveryControl(context: ArchitectureContext, model: BuildingUtilities): Animation[] {
  const { white, dark, aluminum, green } = context.palette;
  context.box(white, 0, 0, 0, 0.42, 0.4, 0.08);
  context.box(dark, -0.04, 0.06, 0.048, 0.24, 0.12, 0.01);
  const temperature = buildDigitalNumber(context.at({ x: -0.04, y: 0.06, z: 0.057 }), 3, 0.026, 1);
  context.beam(aluminum, [0.13, -0.08, 0.045], [0.13, -0.08, 0.072], 0.045);
  context.box(green, 0.13, -0.055, 0.076, 0.008, 0.02, 0.004);
  for (let button = 0; button < 3; button++) context.box(dark, -0.13 + button * 0.07, -0.09, 0.055, 0.04, 0.035, 0.012);
  const airQuality = buildBarGraph(context.at({ x: -0.02, y: -0.15, z: 0.058 }), 0.3, 0.02, () => (model.state.carbonDioxide - 420) / 1200, 12);
  return [() => temperature.set(model.state.indoorTemperature), airQuality];
}

export function buildWaterManifold(context: ArchitectureContext, model: BuildingUtilities): Animation[] {
  const { bronze, steel, red, green, aluminum } = context.palette;
  const animations: Animation[] = [];
  for (const side of [-1, 1]) {
    const y = side * 0.1;
    context.beam(bronze, [-0.32, y, 0], [0.32, y, 0], 0.03);
    for (let circuit = 0; circuit < 4; circuit++) {
      const x = -0.24 + circuit * 0.16;
      context.disc(bronze, x, y + side * 0.05, 0, 0.022, 0.07);
      context.disc(side > 0 ? red : green, x, y + side * 0.1, 0, 0.027, 0.025);
      context.tube(side > 0 ? red : green, [[x, y + side * 0.12, 0], [x, y + side * 0.2, 0], [x, y + side * 0.3, -0.1]], 0.012);
    }
    for (const end of [-1, 1]) context.box(steel, end * 0.28, y, -0.06, 0.05, 0.05, 0.12);
  }
  context.box(aluminum, 0, 0, -0.14, 0.75, 0.72, 0.025);
  animations.push(buildRotameter(context.at({ x: 0.42, y: 0, z: 0.01 }), () => Math.min(1, model.state.waterDrawLitresMinute / 8)));
  animations.push(buildThermometer(context.at({ x: -0.42, y: 0, z: 0.01 }), () => model.state.hotWaterTemperature));
  return animations;
}

export function buildBuildingServiceRoom(context: ArchitectureContext, materials: ArchitecturalMaterials, use: BuildingUse, floorArea: number, seed: number): { model: BuildingUtilities; animations: Animation[] } {
  const model = new BuildingUtilities(use, floorArea, seed);
  const animations: Animation[] = [(seconds, night, season) => model.update(seconds, night, season)];
  const { white, steel } = context.palette;
  context.box(materials.porcelainTile, 0, 0.015, 0, 2.8, 0.03, 2.2);
  context.box(white, 0, 1.2, -1.08, 2.8, 2.4, 0.08);
  buildBreakerBoard(context.at({ x: -0.8, y: 1.4, z: -1.01 }), 16);
  animations.push(...buildElectricalMeter(context.at({ x: -0.15, y: 1.45, z: -1.01 }), model));
  animations.push(...buildSolarInverter(context.at({ x: 0.75, y: 1.45, z: -0.93 }), model));
  animations.push(...buildBatteryCabinet(context.at({ x: 0.75, y: 0.03, z: -0.7 }), model));
  animations.push(...buildWaterManifold(context.at({ x: -0.65, y: 0.65, z: -0.9 }), model));
  buildCableTray(context.at({ x: 0, y: 2.16, z: -0.85, yaw: Math.PI / 2 }), 2.5, 0.18);
  context.box(steel, -1.25, 1.1, -0.93, 0.045, 2.2, 0.06);
  context.box(steel, 1.25, 1.1, -0.93, 0.045, 2.2, 0.06);
  animations.push(...buildHeatRecoveryControl(context.at({ x: -1.1, y: 1.35, z: 0.8 }), model));
  animations.push(buildNeedleMeter(context.at({ x: 0.75, y: 2.08, z: -0.92 }), 0.22, 0.16, () => model.state.importedPower, use === "apartment" ? 50 : 12));
  return { model, animations };
}

export function buildBuildingEntryControls(context: ArchitectureContext, model: BuildingUtilities): Animation[] {
  const animations: Animation[] = [];
  animations.push(buildIntercomScreen(context.at({ x: 0, y: 1.3, z: 0 }), () => model.state.entryActive));
  const temperature = buildDigitalNumber(context.at({ x: 0, y: 1.75, z: 0.03 }), 3, 0.035, 1);
  animations.push(() => temperature.set(model.state.outdoorTemperature));
  context.label("AIR / ENERGY", 0, 1.93, 0.02, 0.35, 0.09, "#dcdccc", "#385047");
  animations.push(buildBarGraph(context.at({ x: 0, y: 2.06, z: 0.02 }), 0.32, 0.035, () => model.occupiedFraction(), 10));
  return animations;
}
