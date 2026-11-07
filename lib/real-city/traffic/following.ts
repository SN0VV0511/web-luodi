import type { TrafficEnvironment, TrafficLeader, TrafficRoute, TrafficSpecification, TrafficState } from "./types";
import { VehicleRouteGeometry } from "./route";
import { TrafficSpatialIndex } from "./spatial-index";
import { trafficVisibility } from "./specifications";

export class TrafficFollowing {
  private readonly candidates: number[] = [];
  private readonly leader: TrafficLeader = { index: -1, gap: Infinity, speed: 0, stopping: false };

  constructor(
    readonly routes: readonly TrafficRoute[],
    readonly geometry: readonly VehicleRouteGeometry[],
    readonly specifications: readonly TrafficSpecification[],
    readonly spatial: TrafficSpatialIndex,
  ) {}

  find(vehicle: number, states: readonly TrafficState[], maximumDistance: number): TrafficLeader {
    const state = states[vehicle];
    const route = this.routes[vehicle];
    const edge = route.edges[state.pose.edgeIndex];
    const nextEdge = this.geometry[vehicle].nextEdge(state.pose.edgeIndex);
    const ownLength = this.specifications[vehicle].length;
    this.leader.index = -1;
    this.leader.gap = Infinity;
    this.leader.speed = route.speed;
    this.leader.stopping = false;
    this.spatial.query(state.pose.x, state.pose.z, maximumDistance + 12, this.candidates);
    for (const otherIndex of this.candidates) {
      if (otherIndex === vehicle) continue;
      const other = states[otherIndex];
      const otherRoute = this.routes[otherIndex];
      const otherEdge = otherRoute.edges[other.pose.edgeIndex];
      let ahead = Infinity;
      const sameHeading = edge.ux * otherEdge.ux + edge.uz * otherEdge.uz > 0.95;
      if (sameHeading) {
        const dx = other.pose.x - state.pose.x;
        const dz = other.pose.z - state.pose.z;
        const lateral = Math.abs(dx * edge.uz - dz * edge.ux);
        const along = dx * edge.ux + dz * edge.uz;
        if (lateral < 1.1 && along > 0 && along <= state.pose.toCorner + 6) ahead = along;
      }
      const nextHeading = nextEdge.ux * otherEdge.ux + nextEdge.uz * otherEdge.uz > 0.95;
      if (state.pose.toCorner < maximumDistance && nextHeading) {
        const dx = other.pose.x - nextEdge.from.x - nextEdge.uz * 2.35;
        const dz = other.pose.z - nextEdge.from.z + nextEdge.ux * 2.35;
        const lateral = Math.abs(dx * nextEdge.uz - dz * nextEdge.ux);
        const along = dx * nextEdge.ux + dz * nextEdge.uz;
        if (lateral < 1.1 && along >= -2 && along <= nextEdge.len) {
          ahead = Math.min(ahead, state.pose.toCorner + along);
        }
      }
      if (state.pose.curvature !== 0 || other.pose.curvature !== 0) {
        const dx = other.pose.x - state.pose.x;
        const dz = other.pose.z - state.pose.z;
        const headingDot = state.pose.directionX * other.pose.directionX + state.pose.directionZ * other.pose.directionZ;
        const forward = dx * state.pose.directionX + dz * state.pose.directionZ;
        const lateral = Math.abs(dx * state.pose.directionZ - dz * state.pose.directionX);
        if (headingDot > 0.4 && forward > 0 && lateral < 1.6) ahead = Math.min(ahead, Math.hypot(dx, dz));
      }
      const gap = ahead - (ownLength + this.specifications[otherIndex].length) * 0.5;
      if (gap >= this.leader.gap) continue;
      this.leader.index = otherIndex;
      this.leader.gap = Math.max(0, gap);
      this.leader.speed = other.speed;
      this.leader.stopping = other.braking > 0.2 || other.speed < 0.3;
    }
    return this.leader;
  }

  acceleration(state: TrafficState, desiredSpeed: number, leader: TrafficLeader, specification: TrafficSpecification, environment: TrafficEnvironment, driverIndex: number): number {
    const visibility = trafficVisibility(environment);
    const reactionVariation = 0.9 + ((driverIndex * 71) % 101) / 250;
    const timeHeadway = reactionVariation * (1.2 + environment.wetness * 0.6 + environment.snow * 0.9);
    const minimumGap = specification.mass > 4000 ? 2.8 : 1.8;
    const closing = state.speed - leader.speed;
    const acceleration = specification.comfortableAcceleration;
    const braking = specification.comfortableBraking;
    const equilibrium = minimumGap + Math.max(0,
      state.speed * timeHeadway + state.speed * closing / (2 * Math.sqrt(acceleration * braking)),
    );
    const safeDesired = Math.max(0.2, desiredSpeed * visibility);
    const freeRoad = 1 - (state.speed / safeDesired) ** 4;
    const following = Number.isFinite(leader.gap) ? (equilibrium / Math.max(0.05, leader.gap)) ** 2 : 0;
    return acceleration * (freeRoad - following);
  }
}
