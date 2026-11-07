import { CityTrafficEngine } from "./real-city/traffic/engine";
import type { TrafficPoint, TrafficRoute } from "./real-city/traffic/types";

export type { TrafficEdge, TrafficRoute, TrafficState } from "./real-city/traffic/types";

export function createCityTraffic(routes: readonly TrafficRoute[], signalIntersections: readonly TrafficPoint[]): CityTrafficEngine {
  return new CityTrafficEngine(routes, signalIntersections);
}
