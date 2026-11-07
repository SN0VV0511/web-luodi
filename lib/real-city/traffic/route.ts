import type { TrafficEdge, TrafficPoint, TrafficPose, TrafficRoute } from "./types";

export type RouteStopLine = {
  distance: number;
  horizontal: boolean;
  node: TrafficPoint;
  exitDistance: number;
};

export const TRAFFIC_LANE_OFFSET = 2.35;

export function wrapDistance(distance: number, length: number): number {
  return ((distance % length) + length) % length;
}

export class VehicleRouteGeometry {
  readonly starts: Float64Array;
  readonly stopLines: RouteStopLine[] = [];
  readonly turnZone = 5;

  constructor(readonly route: TrafficRoute, intersections: readonly TrafficPoint[], vehicleLength: number) {
    if (!Number.isFinite(route.totalLength) || route.totalLength <= 0 || route.edges.length === 0) {
      throw new Error("A traffic route needs finite positive-length edges");
    }
    this.starts = new Float64Array(route.edges.length);
    let distance = 0;
    for (let index = 0; index < route.edges.length; index++) {
      const edge = route.edges[index];
      if (!Number.isFinite(edge.len) || edge.len <= 0) throw new Error("Traffic edge length must be positive");
      this.starts[index] = distance;
      distance += edge.len;
      for (const node of intersections) {
        const dx = node.x - edge.from.x;
        const dz = node.z - edge.from.z;
        const along = dx * edge.ux + dz * edge.uz;
        const lateral = Math.abs(dx * edge.uz - dz * edge.ux);
        if (along <= 0.01 || along > edge.len + 0.01 || lateral > 0.25) continue;
        const stopDistance = wrapDistance(this.starts[index] + along - 8.4 - vehicleLength / 2, route.totalLength);
        if (this.stopLines.some(stop => this.circularSeparation(stop.distance, stopDistance) < 0.05)) continue;
        this.stopLines.push({
          distance: stopDistance,
          horizontal: Math.abs(edge.ux) > 0.5,
          node,
          exitDistance: wrapDistance(this.starts[index] + along + 8.4 + vehicleLength / 2, route.totalLength),
        });
      }
    }
    this.stopLines.sort((a, b) => a.distance - b.distance);
  }

  sample(distance: number, result: TrafficPose): TrafficPose {
    const wrapped = wrapDistance(distance, this.route.totalLength);
    const edgeIndex = this.findEdge(wrapped);
    const edge = this.route.edges[edgeIndex];
    const along = wrapped - this.starts[edgeIndex];
    const toCorner = edge.len - along;
    result.edgeIndex = edgeIndex;
    result.along = along;
    result.toCorner = toCorner;
    result.directionX = edge.ux;
    result.directionZ = edge.uz;
    result.x = edge.from.x + edge.ux * along + edge.uz * TRAFFIC_LANE_OFFSET;
    result.z = edge.from.z + edge.uz * along - edge.ux * TRAFFIC_LANE_OFFSET;
    result.heading = edge.heading;
    result.curvature = 0;
    result.tangentScale = 1;
    const nextIndex = (edgeIndex + 1) % this.route.edges.length;
    const previousIndex = (edgeIndex + this.route.edges.length - 1) % this.route.edges.length;
    const next = this.route.edges[nextIndex];
    const previous = this.route.edges[previousIndex];
    if (toCorner < this.turnZone && this.isTurn(edge, next)) {
      const t = (this.turnZone - toCorner) / (this.turnZone * 2);
      this.sampleCorner(edge, next, t, result);
    } else if (along < this.turnZone && this.isTurn(previous, edge)) {
      const t = (this.turnZone + along) / (this.turnZone * 2);
      this.sampleCorner(previous, edge, t, result);
    }
    return result;
  }

  upcomingTurn(edgeIndex: number): number {
    const edge = this.route.edges[edgeIndex];
    const next = this.route.edges[(edgeIndex + 1) % this.route.edges.length];
    return edge.ux * next.uz - edge.uz * next.ux;
  }

  cornerRadius(edgeIndex: number): number {
    const direction = this.upcomingTurn(edgeIndex);
    if (Math.abs(direction) < 0.01) return Infinity;
    return Math.max(2.2, this.turnZone + Math.sign(direction) * TRAFFIC_LANE_OFFSET);
  }

  aheadDistance(from: number, to: number): number {
    return wrapDistance(to - from, this.route.totalLength);
  }

  edgeStart(index: number): number {
    return this.starts[index];
  }

  nextEdge(index: number): TrafficEdge {
    return this.route.edges[(index + 1) % this.route.edges.length];
  }

  private findEdge(distance: number): number {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.starts[middle] <= distance) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  private circularSeparation(a: number, b: number): number {
    const direct = Math.abs(a - b);
    return Math.min(direct, this.route.totalLength - direct);
  }

  private isTurn(before: TrafficEdge, after: TrafficEdge): boolean {
    return before.ux * after.ux + before.uz * after.uz < 0.95;
  }

  private sampleCorner(before: TrafficEdge, after: TrafficEdge, t: number, result: TrafficPose): void {
    const corner = before.to;
    const zone = this.turnZone;
    const lane = TRAFFIC_LANE_OFFSET;
    const ax = corner.x - before.ux * zone + before.uz * lane;
    const az = corner.z - before.uz * zone - before.ux * lane;
    const bx = corner.x + (before.uz + after.uz) * lane;
    const bz = corner.z - (before.ux + after.ux) * lane;
    const cx = corner.x + after.ux * zone + after.uz * lane;
    const cz = corner.z + after.uz * zone - after.ux * lane;
    const u = 1 - t;
    result.x = u * u * ax + 2 * u * t * bx + t * t * cx;
    result.z = u * u * az + 2 * u * t * bz + t * t * cz;
    const derivativeX = 2 * (u * (bx - ax) + t * (cx - bx));
    const derivativeZ = 2 * (u * (bz - az) + t * (cz - bz));
    const secondX = 2 * (cx - 2 * bx + ax);
    const secondZ = 2 * (cz - 2 * bz + az);
    const speed = Math.hypot(derivativeX, derivativeZ);
    result.heading = Math.atan2(derivativeX, derivativeZ);
    result.tangentScale = Math.max(0.2, speed / (zone * 2));
    result.curvature = (derivativeX * secondZ - derivativeZ * secondX) / Math.max(0.001, speed ** 3);
    result.directionX = derivativeX / Math.max(0.001, speed);
    result.directionZ = derivativeZ / Math.max(0.001, speed);
  }
}
