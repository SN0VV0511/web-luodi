import * as THREE from "three";
import type { CivicKit } from "../../city-civic";
import type { SeasonState } from "../../city-seasons";
import { cityDetailBudget, type CityBuiltSite, type CityDetailBudget } from "../contracts";
import { FixedStepClock } from "../physics/clock";
import { EarthPhysicsWorld } from "../physics/world";
import { EnvironmentResources, type EnvironmentUsage } from "./resources";
import { CityTerrain } from "./terrain";
import { WeatherField } from "./weather-field";
import { SurfaceHydrology } from "./hydrology";
import { HarborWaveField } from "./waves";
import { GroundInteractions } from "./interactions";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { buildBotanicalGroundLayer } from "./vegetation";
import { buildGroundWeatherLayer } from "./surface-layer";
import { buildRainContactLayer } from "./rain-contact";
import { buildFootprintLayer } from "./footprints";
import { buildHarborPhysicsLayer } from "./harbor-props";
import { buildWindFabricLayer } from "./wind-fabric";
import { buildGroundLitterLayer } from "./litter";
import { buildParkMaintenanceLayer } from "./maintenance";
import { buildCoastalWaterLayer } from "./coastal-water";
import { buildRoofRunoffLayer } from "./runoff";
import { buildLowFogLayer } from "./low-fog";
import { buildStreetDebrisLayer } from "./street-debris";
import { buildSurfaceWeatheringLayer } from "./surface-weathering";

export type DetailedEnvironment = {
  animate: (seconds: number, night: boolean, season: SeasonState) => void;
  footstep: (position: THREE.Vector3, strength: number, seconds: number, heading: number) => void;
  dispose: () => void;
  snapshot: () => { resources: EnvironmentUsage; physics: ReturnType<EarthPhysicsWorld["snapshot"]> };
};

export function buildDetailedEnvironment(
  kit: CivicKit,
  options: { sites?: readonly CityBuiltSite[]; budget?: CityDetailBudget } = {},
): DetailedEnvironment {
  const budget = options.budget ?? cityDetailBudget();
  const compact = budget.simulatedHz < 60;
  const nearParticles = Math.min(compact ? 48 : 96, Math.floor(budget.nearSurfaceParticles * 0.5));
  const resources = new EnvironmentResources(kit, {
    maxBodies: budget.activeRigidBodies,
    maxParticles: budget.nearSurfaceParticles,
    maxClothVertices: compact ? 160 : 400,
    maxBatches: compact ? 54 : 60,
    maxTriangles: compact ? 150000 : 240000,
    maxInstances: compact ? 3500 : 7000,
  });
  resources.reserveParticles(nearParticles);
  const weather = new WeatherField();
  const terrain = new CityTerrain(options.sites);
  weather.attachTerrain(terrain);
  const water = new SurfaceHydrology(terrain, weather);
  if (weather.aerosols) weather.aerosols.onDeposit = (x, z, mass) => water.energy.settleDust(x, z, mass);
  const waves = new HarborWaveField(weather);
  const interactions = new GroundInteractions(compact ? 64 : 112);
  const physics = new EarthPhysicsWorld(terrain.collisions, budget.activeRigidBodies, nearParticles);
  const context: EnvironmentContext = { resources, terrain, water, weather, physics, budget, interactions };
  const clock = new FixedStepClock(1 / Math.min(60, Math.max(30, budget.simulatedHz)), compact ? 6 : 10);
  const layers: EnvironmentLayer[] = [
    buildBotanicalGroundLayer(context),
    buildGroundWeatherLayer(context),
    buildRainContactLayer(context),
    buildFootprintLayer(context),
    buildHarborPhysicsLayer(context, waves),
    buildWindFabricLayer(context),
    buildGroundLitterLayer(context),
    buildParkMaintenanceLayer(context),
    buildStreetDebrisLayer(context),
    buildLowFogLayer(context),
    buildRoofRunoffLayer(context),
    buildCoastalWaterLayer(context, waves),
    buildSurfaceWeatheringLayer(context),
  ];
  let disposed = false;
  let priorSeconds: number | undefined;
  let priorNight: boolean | undefined;
  let priorSeason: string | undefined;
  kit.group.userData.detailedEnvironment = { ...resources.usage };
  return {
    animate(seconds, night, season) {
      if (disposed || !Number.isFinite(seconds)) return;
      weather.update(seconds, night, season);
      resources.group.userData.weatherFronts = weather.fronts.currentKinds(seconds);
      water.update(seconds);
      const result = clock.advance(seconds, (dt, time) => {
        physics.step(dt, time, weather.wind, weather.state.rain, weather.state.airDensity);
      });
      if (result.reset) {
        physics.reset();
        interactions.reset();
        for (const layer of layers) layer.reset();
      }
      const seasonKey = `${season.season}:${season.nextSeason}:${season.blend}`;
      if (priorSeconds !== seconds || priorNight !== night || priorSeason !== seasonKey || result.reset) {
        for (const layer of layers) layer.update(seconds, night, season, result.interpolation);
        priorSeconds = seconds;
        priorNight = night;
        priorSeason = seasonKey;
      }
    },
    footstep(position, strength, seconds, heading) {
      if (disposed) return;
      interactions.record("foot", position, strength, 0.14, seconds, heading);
      weather.aerosols?.disturbGround(position.x, position.z, strength);
    },
    snapshot() {
      return { resources: { ...resources.usage }, physics: physics.snapshot() };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const layer of layers) layer.dispose?.();
      physics.dispose();
      terrain.collisions.clear();
      if (weather.aerosols) weather.aerosols.onDeposit = undefined;
      resources.detach();
    },
  };
}
