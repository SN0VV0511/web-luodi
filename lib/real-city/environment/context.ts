import type { GroundInteractions } from "./interactions";
import type { SeasonState } from "../../city-seasons";
import type { CityDetailBudget } from "../contracts";
import type { EarthPhysicsWorld } from "../physics/world";
import type { EnvironmentResources } from "./resources";
import type { CityTerrain } from "./terrain";
import type { SurfaceHydrology } from "./hydrology";
import type { WeatherField } from "./weather-field";

export type EnvironmentContext = {
  resources: EnvironmentResources;
  terrain: CityTerrain;
  water: SurfaceHydrology;
  weather: WeatherField;
  physics: EarthPhysicsWorld;
  budget: CityDetailBudget;
  interactions: GroundInteractions;
};

export type EnvironmentLayer = {
  update: (seconds: number, night: boolean, season: SeasonState, interpolation: number) => void;
  reset: () => void;
  dispose?: () => void;
};
