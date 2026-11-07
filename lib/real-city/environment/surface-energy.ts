import { ThermalColumn, mineralThermalLayers, type ThermalBoundary } from "../physics/thermal-column";
import { SoilColumn, layeredSoilProfile, type SoilForcing } from "../physics/soil-column";
import { SnowColumn, type SnowForcing } from "../physics/snow-column";
import { clamp, saturate, smoothstep } from "../physics/math";
import { CityTerrain, createTerrainPoint, type TerrainKind } from "./terrain";
import { WeatherField } from "./weather-field";
import { createMicroclimateSample } from "./urban-microclimate";

export type SurfaceEnergySample = {
  temperature: number;
  rootTemperature: number;
  saturation: number;
  rootMoisture: number;
  waterStress: number;
  oxygenStress: number;
  infiltrationRate: number;
  snowDepth: number;
  snowDensity: number;
  snowAlbedo: number;
  snowRoughness: number;
  snowStrength: number;
  meltRate: number;
  bearingStrength: number;
  heatFlux: number;
  evaporationRate: number;
  frostDepth: number;
};

type SurfaceColumn = {
  x: number;
  z: number;
  kind: TerrainKind;
  height: number;
  exposed: number;
  albedo: number;
  thermal: ThermalColumn;
  soil: SoilColumn | undefined;
  snow: SnowColumn;
  lastTime: number;
  sample: SurfaceEnergySample;
};

export function createSurfaceEnergySample(): SurfaceEnergySample {
  return {
    temperature: 18,
    rootTemperature: 16,
    saturation: 0.5,
    rootMoisture: 0.2,
    waterStress: 0,
    oxygenStress: 0,
    infiltrationRate: 0,
    snowDepth: 0,
    snowDensity: 120,
    snowAlbedo: 0.85,
    snowRoughness: 0.003,
    snowStrength: 0,
    meltRate: 0,
    bearingStrength: 60000,
    heatFlux: 0,
    evaporationRate: 0,
    frostDepth: 0,
  };
}

export class SurfaceEnergyField {
  readonly columns = 20;
  readonly rows = 16;
  readonly minimumX = -225;
  readonly minimumZ = -220;
  readonly width = 450;
  readonly depth = 340;
  private readonly cells: SurfaceColumn[] = [];
  private readonly microclimate = createMicroclimateSample();
  private readonly thermalBoundary: ThermalBoundary = {
    airTemperature: 18,
    deepTemperature: 15,
    solarFlux: 0,
    skyTemperature: 5,
    windSpeed: 2,
    wetness: 0,
    evaporation: 0,
    snowDepth: 0,
    snowDensity: 120,
    emissivity: 0.95,
    albedo: 0.2,
  };
  private readonly soilForcing: SoilForcing = {
    inputWater: 0,
    evaporation: 0,
    transpiration: 0,
    temperature: 18,
    rootActivity: 1,
    surfacePressure: 0,
    groundwaterHead: -10,
  };
  private readonly snowForcing: SnowForcing = {
    snowfall: 0,
    rainfall: 0,
    airTemperature: 0,
    groundTemperature: 0,
    absorbedSolar: 0,
    longwave: 0,
    windSpeed: 0,
    humidity: 0.5,
    pressure: 101325,
  };
  private cursor = 0;
  private lastTime: number | undefined;
  private accumulated = 0;
  private initialized = false;
  revision = 0;

  constructor(readonly terrain: CityTerrain, readonly weather: WeatherField) {
    const ground = createTerrainPoint();
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const x = this.minimumX + (column + 0.5) * this.width / this.columns;
        const z = this.minimumZ + (row + 0.5) * this.depth / this.rows;
        terrain.sample(x, z, ground);
        const porous = ground.kind === "park" || ground.kind === "hill";
        const sand = ground.kind === "sand";
        const roof = ground.kind === "building";
        const thermal = new ThermalColumn(mineralThermalLayers(porous, sand, roof), weather.state.temperature);
        const soil = porous || sand ? new SoilColumn(layeredSoilProfile(sand, porous ? 1 : 0.05), 0.55) : undefined;
        const sample = createSurfaceEnergySample();
        sample.temperature = weather.state.temperature;
        sample.rootTemperature = weather.state.temperature;
        this.cells.push({
          x,
          z,
          kind: ground.kind,
          height: ground.height,
          exposed: ground.exposed,
          albedo: sand ? 0.38 : porous ? 0.23 : ground.kind === "road" ? 0.11 : 0.29,
          thermal,
          soil,
          snow: new SnowColumn(3),
          lastTime: 0,
          sample,
        });
      }
    }
  }

  update(seconds: number, waterAt: (x: number, z: number) => number): void {
    if (this.lastTime === undefined || seconds < this.lastTime) {
      this.reset(seconds);
      return;
    }
    const dt = clamp(seconds - this.lastTime, 0, 0.5);
    this.lastTime = seconds;
    this.accumulated += dt;
    if (this.accumulated < 0.1) return;
    this.accumulated = 0;
    const count = Math.ceil(this.cells.length / 8);
    for (let step = 0; step < count; step++) {
      const cell = this.cells[this.cursor++ % this.cells.length];
      const elapsed = clamp(seconds - cell.lastTime, 0, 1.5);
      cell.lastTime = seconds;
      if (cell.kind === "water") continue;
      this.integrateCell(cell, elapsed * 36, seconds, waterAt(cell.x, cell.z));
    }
    this.initialized = true;
    this.revision++;
  }

  sample(x: number, z: number, result: SurfaceEnergySample): SurfaceEnergySample {
    const index = this.indexAt(x, z);
    const cell = this.cells[index];
    if (!cell) return result;
    Object.assign(result, cell.sample);
    return result;
  }

  compact(x: number, z: number, pressure: number, seconds: number): void {
    const cell = this.cells[this.indexAt(x, z)];
    if (!cell) return;
    cell.soil?.compact(pressure, seconds);
    cell.snow.compress(pressure, seconds);
    cell.sample.snowDepth = cell.snow.state.depth;
    cell.sample.snowStrength = cell.snow.state.strength;
    if (cell.soil) cell.sample.bearingStrength = cell.soil.bearingStrength();
  }

  settleDust(x: number, z: number, mass: number): void {
    const cell = this.cells[this.indexAt(x, z)];
    if (!cell) return;
    cell.snow.addSoot(mass);
  }

  erodeSnow(x: number, z: number, requested: number): number {
    const cell = this.cells[this.indexAt(x, z)];
    if (!cell) return 0;
    const removed = cell.snow.erode(requested);
    cell.sample.snowDepth = cell.snow.state.depth;
    return removed;
  }

  get ready(): boolean {
    return this.initialized;
  }

  reset(seconds = 0): void {
    this.lastTime = seconds;
    this.cursor = 0;
    this.accumulated = 0;
    this.initialized = false;
    for (const cell of this.cells) {
      cell.thermal.setInitialTemperature(this.weather.state.temperature, this.weather.state.temperature * 0.65 + 15 * 0.35);
      cell.soil?.reset();
      cell.snow.reset();
      cell.lastTime = seconds;
      Object.assign(cell.sample, createSurfaceEnergySample());
      cell.sample.temperature = this.weather.state.temperature;
      cell.sample.rootTemperature = this.weather.state.temperature;
    }
    this.revision++;
  }

  private integrateCell(cell: SurfaceColumn, dt: number, seconds: number, availableWater: number): void {
    if (dt <= 0) return;
    const weather = this.weather.state;
    const local = this.weather.microclimate?.sample(cell.x, cell.z, this.microclimate);
    const airTemperature = weather.temperature + (local?.temperatureOffset ?? 0) - cell.height * 0.0065;
    const humidity = clamp(weather.humidity + (local?.humidityOffset ?? 0), 0.05, 1);
    const shadow = Math.max(local?.shade ?? 0, this.weather.cloudShadow(cell.x, cell.z, seconds));
    const solar = weather.sunExposure * (1 - shadow) * 850 * cell.exposed;
    const wind = weather.windSpeed * (1 - (local?.windShelter ?? 0) * 0.7);
    const precipitationExposure = this.weather.microclimate?.precipitationExposure(cell.x, cell.z, cell.height, weather.windSpeed) ?? 1;
    const snowRate = this.weather.localSnow(cell.x, cell.z, seconds) * 0.000018 * cell.exposed * precipitationExposure;
    const wetness = saturate(availableWater * 650);
    const evaporation = this.potentialEvaporation(airTemperature, humidity, wind, solar);
    const skyView = local?.skyView ?? 1;
    const skyTemperature = airTemperature - (6 + (1 - humidity) * 12) * skyView * (1 - weather.cloud * 0.85);
    const boundary = this.thermalBoundary;
    boundary.airTemperature = airTemperature + (local?.wallRadiation ?? 0) * 0.25;
    boundary.deepTemperature = 15 + (weather.temperature - 15) * 0.3;
    boundary.solarFlux = solar;
    boundary.skyTemperature = skyTemperature;
    boundary.windSpeed = wind;
    boundary.wetness = wetness;
    boundary.evaporation = evaporation * 1000;
    boundary.snowDepth = cell.snow.state.depth;
    boundary.snowDensity = cell.snow.state.density;
    boundary.emissivity = cell.kind === "road" ? 0.95 : 0.92;
    boundary.albedo = cell.snow.state.depth > 0.001 ? cell.snow.state.albedo : cell.albedo * (1 - wetness * 0.18);
    if (cell.soil) {
      for (let index = 0; index < cell.thermal.layers.length; index++) cell.thermal.setWaterContent(index, cell.soil.volumetricWater(index));
    }
    const exchange = cell.thermal.step(dt, boundary);
    const snow = this.snowForcing;
    snow.snowfall = snowRate;
    snow.rainfall = 0;
    snow.airTemperature = airTemperature;
    snow.groundTemperature = exchange.surface;
    snow.absorbedSolar = solar * (1 - cell.snow.state.albedo);
    snow.longwave = 5.670374419e-8 * 0.98 * ((skyTemperature + 273.15) ** 4 - (Math.min(0, airTemperature) + 273.15) ** 4);
    snow.windSpeed = wind;
    snow.humidity = humidity;
    snow.pressure = weather.pressure * 100;
    const snowState = cell.snow.step(dt, snow);
    const sample = cell.sample;
    sample.temperature = exchange.surface;
    sample.rootTemperature = cell.thermal.temperatureAtDepth(0.15);
    sample.snowDepth = Math.min(0.22, snowState.depth);
    sample.snowDensity = snowState.density;
    sample.snowAlbedo = snowState.albedo;
    sample.snowRoughness = snowState.roughness;
    sample.snowStrength = snowState.strength;
    sample.meltRate = snowState.runoff / dt;
    sample.heatFlux = exchange.storage;
    sample.evaporationRate = evaporation;
    sample.frostDepth = exchange.surface < 0 ? Math.min(0.4, cell.thermal.thermalPenetration(dt)) : 0;
    if (cell.soil) {
      const forcing = this.soilForcing;
      forcing.inputWater = Math.max(0, availableWater + snowState.runoff);
      forcing.evaporation = evaporation;
      forcing.transpiration = solar * 0.000000002 * smoothstep(2, 18, airTemperature);
      forcing.temperature = sample.rootTemperature;
      forcing.rootActivity = smoothstep(-1, 10, sample.rootTemperature) * (1 - smoothstep(32, 42, sample.rootTemperature));
      forcing.surfacePressure = 0;
      forcing.groundwaterHead = cell.kind === "sand" ? -0.4 : -3;
      const flux = cell.soil.step(dt, forcing);
      sample.saturation = flux.saturation;
      sample.rootMoisture = cell.soil.rootZoneMoisture();
      sample.waterStress = flux.waterStress;
      sample.oxygenStress = flux.oxygenStress;
      sample.infiltrationRate = flux.infiltration / dt;
      sample.bearingStrength = cell.soil.bearingStrength();
      if (cell.soil.plantAvailableWater() < 0.001) sample.waterStress = Math.max(sample.waterStress, 0.8);
    } else {
      sample.infiltrationRate = 0;
      sample.rootMoisture = 0;
      sample.saturation = 0;
      sample.waterStress = 1;
      sample.oxygenStress = 0;
      sample.bearingStrength = cell.kind === "dock" ? 160000 : 220000;
    }
  }

  private potentialEvaporation(temperature: number, humidity: number, wind: number, solar: number): number {
    const saturationPressure = 0.6108 * Math.exp(17.27 * temperature / (temperature + 237.3));
    const slope = 4098 * saturationPressure / (temperature + 237.3) ** 2;
    const vaporDeficit = saturationPressure * (1 - humidity);
    const psychrometric = 0.066;
    const netRadiation = Math.max(0, solar * 0.77) * 0.0864;
    const aerodynamic = 900 / Math.max(180, temperature + 273) * wind * vaporDeficit;
    const numerator = 0.408 * slope * netRadiation + psychrometric * aerodynamic;
    const denominator = slope + psychrometric * (1 + 0.34 * wind);
    const millimetresPerDay = Math.max(0, numerator / Math.max(0.01, denominator));
    return clamp(millimetresPerDay / 86400000, 0, 0.000002);
  }

  private indexAt(x: number, z: number): number {
    const column = clamp(Math.floor((x - this.minimumX) / this.width * this.columns), 0, this.columns - 1);
    const row = clamp(Math.floor((z - this.minimumZ) / this.depth * this.rows), 0, this.rows - 1);
    return row * this.columns + column;
  }
}
