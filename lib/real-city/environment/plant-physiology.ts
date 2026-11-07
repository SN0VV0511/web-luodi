import * as THREE from "three";
import type { SeasonState } from "../../city-seasons";
import { clamp, exponentialApproach, smoothstep } from "../physics/math";
import { createSurfaceSample, SurfaceHydrology } from "./hydrology";
import { WeatherField } from "./weather-field";
import { createSurfaceEnergySample } from "./surface-energy";
import { LeafGasExchange, type LeafEnvironment } from "../physics/leaf-gas-exchange";
import { PlantHydraulics, type RootWaterSupply } from "../physics/plant-hydraulics";
import { CanopyExchange } from "./canopy-exchange";

export type PlantPhysiologySite = { x: number; y: number; z: number; size: number; evergreen: boolean };
export type PlantPhysiologyState = {
  retainedLeaves: number;
  chlorophyll: number;
  hydration: number;
  growth: number;
  flowers: number;
  frost: number;
  snowLoad: number;
  senescence: number;
  dormancy: number;
  rootUptake: number;
  wiltAngle: number;
  leafTemperature: number;
  assimilation: number;
  leafWaterPotential: number;
};

export class PlantPhysiology {
  readonly states: PlantPhysiologyState[];
  readonly canopy: CanopyExchange;
  private readonly surface = createSurfaceSample();
  private readonly energy = createSurfaceEnergySample();
  private readonly degreeDays: Float32Array;
  private readonly chillHours: Float32Array;
  private readonly storedWater: Float32Array;
  private readonly priorSeasons: string[];
  private lastTime: number | undefined;
  private readonly gas: LeafGasExchange[];
  private readonly hydraulic: PlantHydraulics[];
  private readonly leafEnvironment: LeafEnvironment = { airTemperature: 18, humidity: 0.6, pressure: 101325, irradiance: 400, windSpeed: 2, carbonDioxide: 420, leafWaterPotential: -0.3, chlorophyll: 0.8, nitrogen: 1, wetness: 0 };
  private readonly rootSupply: RootWaterSupply = { potential: -0.2, conductivity: 1, temperature: 16, oxygen: 1, salinity: 0 };

  constructor(readonly sites: readonly PlantPhysiologySite[], readonly hydrology: SurfaceHydrology, readonly weather: WeatherField) {
    this.states = sites.map(site => ({
      retainedLeaves: site.evergreen ? 1 : 0.28,
      chlorophyll: 0.75,
      hydration: 0.7,
      growth: 0.2,
      flowers: 0,
      frost: 0,
      snowLoad: 0,
      senescence: 0,
      dormancy: 0,
      rootUptake: 0,
      wiltAngle: 0,
      leafTemperature: 18,
      assimilation: 0,
      leafWaterPotential: -0.3,
    }));
    this.canopy = new CanopyExchange(sites, weather, hydrology);
    hydrology.setCanopyThroughfall(this.canopy.throughfallAt);
    this.gas = sites.map(site => new LeafGasExchange(site.evergreen ? 0.045 : 0.08, site.evergreen));
    this.hydraulic = sites.map(site => new PlantHydraulics(site.size * 1.25, site.size * site.size * 0.9, site.evergreen));
    this.degreeDays = new Float32Array(sites.length);
    this.chillHours = new Float32Array(sites.length);
    this.storedWater = new Float32Array(sites.length).fill(0.6);
    this.priorSeasons = sites.map(() => "spring");
  }

  update(seconds: number, season: SeasonState): void {
    if (this.lastTime === undefined || seconds < this.lastTime) {
      this.reset();
      this.lastTime = seconds;
    }
    const dt = clamp(seconds - this.lastTime!, 0, 0.5);
    this.lastTime = seconds;
    this.canopy.update(seconds, season.sunPosition, this.states);
    const biologicalHours = dt * 18;
    for (let index = 0; index < this.sites.length; index++) {
      const site = this.sites[index];
      const plant = this.states[index];
      this.hydrology.sample(site.x, site.z, this.surface);
      this.hydrology.energy.sample(site.x, site.z, this.energy);
      const temperature = this.weather.temperatureAt(site.y, 0.65, site.x, site.z);
      const shadow = this.weather.cloudShadow(site.x, site.z, seconds);
      const canopy = this.canopy.states[index];
      const sunlight = this.weather.state.sunExposure * (1 - shadow * 0.7) * canopy.sunlight;
      if (season.season !== this.priorSeasons[index]) {
        if (season.season === "spring") this.degreeDays[index] = 0;
        if (season.season === "autumn") this.chillHours[index] = 0;
        this.priorSeasons[index] = season.season;
      }
      if (temperature > 5) this.degreeDays[index] += (temperature - 5) * biologicalHours / 24;
      if (temperature > -4 && temperature < 8) this.chillHours[index] += biologicalHours;
      const availableWater = clamp(this.surface.saturation * 0.8 + this.surface.wetness * 0.2, 0, 1);
      const rootTemperature = this.hydrology.energy.ready ? this.energy.rootTemperature : temperature;
      const rootWater = this.hydrology.energy.ready ? Math.min(availableWater, this.energy.rootMoisture * 3) : availableWater;
      const oxygenFactor = 1 - this.energy.oxygenStress * 0.7;
      const uptake = rootWater * (0.012 + site.size * 0.004) * smoothstep(-1, 9, rootTemperature) * oxygenFactor;
      const transpiration = sunlight * Math.max(0, temperature - 4) * 0.0014 * (1 - this.weather.state.humidity) * plant.retainedLeaves;
      this.storedWater[index] = clamp(this.storedWater[index] + (uptake - transpiration) * biologicalHours, 0.06, 1);
      plant.rootUptake = uptake;
      plant.hydration = exponentialApproach(plant.hydration, this.storedWater[index], 0.7, dt);
      const waterStress = 1 - smoothstep(0.12, 0.45, plant.hydration);
      const heatStress = smoothstep(30, 42, temperature);
      const coldStress = 1 - smoothstep(-7, 1, temperature);
      const chillReadiness = Math.max(0.35, smoothstep(0, 60, this.chillHours[index]));
      const budburst = smoothstep(3, 18, this.degreeDays[index]) * smoothstep(0.15, 0.5, plant.hydration) * chillReadiness;
      const springGrowth = season.season === "spring" ? Math.max(budburst, smoothstep(0, 0.45, season.blend)) : 1;
      const autumn = season.season === "autumn" ? smoothstep(0.02, 0.9, season.blend) : season.season === "winter" ? 1 : 0;
      const winter = season.season === "winter" ? 1 : season.nextSeason === "winter" ? season.blend : 0;
      const dormancy = clamp(winter * 0.88 + coldStress * 0.35, 0, 1);
      plant.dormancy = exponentialApproach(plant.dormancy, dormancy, 0.9, dt);
      plant.senescence = exponentialApproach(plant.senescence, clamp(autumn + waterStress * 0.24 + heatStress * 0.12, 0, 1), 0.45, dt);
      const evergreenRetention = 1 - coldStress * 0.08 - waterStress * 0.13;
      const deciduousRetention = springGrowth * (1 - autumn * 0.94) * (1 - waterStress * 0.25);
      const targetRetention = site.evergreen ? evergreenRetention : deciduousRetention;
      plant.retainedLeaves = exponentialApproach(plant.retainedLeaves, targetRetention, autumn > 0.2 ? 0.5 : 0.8, dt);
      const targetChlorophyll = clamp(0.82 + plant.hydration * 0.18 - plant.senescence * (site.evergreen ? 0.2 : 0.85) - waterStress * 0.25, 0.05, 1);
      plant.chlorophyll = exponentialApproach(plant.chlorophyll, targetChlorophyll, 0.5, dt);
      const activeGrowth = smoothstep(4, 18, temperature) * (1 - smoothstep(29, 38, temperature)) * plant.hydration * (1 - plant.dormancy);
      plant.growth = exponentialApproach(plant.growth, activeGrowth, 0.4, dt);
      const springFlower = season.season === "spring" ? smoothstep(0.04, 0.26, season.blend) * (1 - smoothstep(0.6, 1, season.blend)) : 0;
      const summerFlower = season.season === "summer" ? (1 - smoothstep(0.1, 0.75, season.blend)) * 0.45 : 0;
      plant.flowers = exponentialApproach(plant.flowers, Math.max(springFlower, summerFlower) * plant.hydration, 0.7, dt);
      const frostTarget = coldStress * this.weather.state.humidity;
      plant.frost = exponentialApproach(plant.frost, frostTarget, frostTarget > plant.frost ? 0.7 : 1.2, dt);
      const snowTarget = this.surface.snow * plant.retainedLeaves * (site.evergreen ? 0.7 : 0.4) + canopy.snowMass * 0.04;
      plant.snowLoad = exponentialApproach(plant.snowLoad, snowTarget, 0.55, dt);
      const leafEnvironment = this.leafEnvironment;
      leafEnvironment.airTemperature = temperature;
      leafEnvironment.humidity = this.weather.state.humidity;
      leafEnvironment.pressure = this.weather.state.pressure * 100;
      leafEnvironment.irradiance = sunlight * 650 * plant.retainedLeaves;
      leafEnvironment.windSpeed = this.weather.state.windSpeed;
      leafEnvironment.carbonDioxide = 420;
      leafEnvironment.leafWaterPotential = this.hydraulic[index].state.leafPotential;
      leafEnvironment.chlorophyll = plant.chlorophyll;
      leafEnvironment.nitrogen = 0.7 + this.energy.rootMoisture;
      leafEnvironment.wetness = canopy.wetness;
      const exchange = this.gas[index].step(dt * 36, leafEnvironment);
      const root = this.rootSupply;
      root.potential = -0.04 - (1 - this.surface.saturation) ** 3 * 2.8;
      root.conductivity = Math.max(0.03, this.surface.saturation ** 2);
      root.temperature = rootTemperature;
      root.oxygen = 1 - this.energy.oxygenStress;
      root.salinity = 0;
      const hydraulic = this.hydraulic[index].step(dt * 36, root, exchange.transpiration, exchange.sugarExport, plant.retainedLeaves);
      plant.hydration = clamp(plant.hydration * 0.6 + hydraulic.relativeWaterContent * 0.4, 0.04, 1);
      plant.wiltAngle = hydraulic.wiltAngle;
      plant.leafTemperature = exchange.temperature;
      plant.assimilation = exchange.assimilation;
      plant.leafWaterPotential = hydraulic.leafPotential;
      plant.growth = Math.min(plant.growth, activeGrowth * (0.65 + hydraulic.carbonReserve * 0.35));
      plant.chlorophyll = exponentialApproach(plant.chlorophyll, targetChlorophyll * (1 - exchange.photoinhibition * 0.08), 0.5, dt);

    }
  }

  tint(index: number, target: THREE.Color): THREE.Color {
    const plant = this.states[index];
    const chlorophyll = plant.chlorophyll;
    const dry = 1 - plant.hydration;
    target.setRGB(
      0.72 + (1 - chlorophyll) * 0.22,
      0.79 + chlorophyll * 0.21 - dry * 0.08,
      0.57 + chlorophyll * 0.18 - dry * 0.13,
    );
    target.lerp(new THREE.Color(0.82, 0.87, 0.88), plant.frost * 0.28);
    return target;
  }

  meanFlowers(): number {
    if (this.states.length === 0) return 0;
    let total = 0;
    for (const state of this.states) total += state.flowers;
    return total / this.states.length;
  }

  reset(): void {
    this.lastTime = undefined;
    this.canopy.reset();
    this.degreeDays.fill(0);
    this.chillHours.fill(0);
    this.storedWater.fill(0.6);
    for (let index = 0; index < this.states.length; index++) {
      const state = this.states[index];
      state.retainedLeaves = this.sites[index].evergreen ? 1 : 0.28;
      state.chlorophyll = 0.75;
      state.hydration = 0.7;
      state.growth = 0.2;
      state.flowers = 0;
      state.frost = 0;
      state.snowLoad = 0;
      state.senescence = 0;
      state.dormancy = 0;
      state.rootUptake = 0;
      state.wiltAngle = 0;
      state.leafTemperature = 18;
      state.assimilation = 0;
      state.leafWaterPotential = -0.3;
      this.gas[index].reset();
      this.hydraulic[index].reset();
      this.priorSeasons[index] = "spring";
    }
  }
}
