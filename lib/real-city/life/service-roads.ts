import { ROAD_SEGMENTS } from "../../city-map";
import { clamp, distance, point, projectOnSegment, quantizedKey, type Point2 } from "./math";

interface RoadNode {
  id: number;
  position: Point2;
  connections: { to: number; distance: number; heading: number }[];
}

export interface CurbAccess {
  sidewalk: Point2;
  road: Point2;
  heading: number;
  nodeId: number;
  distance: number;
  side: number;
}

export class ServiceRoadNetwork {
  private readonly nodes: RoadNode[] = [];
  private readonly nodeKeys = new Map<string, number>();
  private readonly projection = point();
  private readonly laneWidth = 1.75;

  constructor() {
    this.build();
  }

  private node(position: Point2): number {
    const key = quantizedKey(position, 100);
    const existing = this.nodeKeys.get(key);
    if (existing !== undefined) return existing;
    const id = this.nodes.length;
    this.nodes.push({ id, position: { ...position }, connections: [] });
    this.nodeKeys.set(key, id);
    return id;
  }

  private build(): void {
    for (const road of ROAD_SEGMENTS) {
      const start = { x: road.x1, z: road.z1 };
      const end = { x: road.x2, z: road.z2 };
      const along: Point2[] = [start, end];
      for (const other of ROAD_SEGMENTS) {
        const crossing = this.intersection(start, end, { x: other.x1, z: other.z1 }, { x: other.x2, z: other.z2 });
        if (crossing) along.push(crossing);
        for (const endpoint of [{ x: other.x1, z: other.z1 }, { x: other.x2, z: other.z2 }]) {
          projectOnSegment(endpoint, start, end, this.projection);
          if (distance(endpoint, this.projection) < 0.02) along.push({ ...endpoint });
        }
      }
      along.sort((a, b) => distance(start, a) - distance(start, b));
      let previous = this.node(along[0]);
      for (let index = 1; index < along.length; index++) {
        const next = this.node(along[index]);
        if (next === previous) continue;
        this.connect(previous, next);
        this.connect(next, previous);
        previous = next;
      }
    }
  }

  private intersection(a: Point2, b: Point2, c: Point2, d: Point2): Point2 | null {
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const cdx = d.x - c.x;
    const cdz = d.z - c.z;
    const denominator = abx * cdz - abz * cdx;
    if (Math.abs(denominator) < 0.0001) return null;
    const acx = c.x - a.x;
    const acz = c.z - a.z;
    const t = (acx * cdz - acz * cdx) / denominator;
    const u = (acx * abz - acz * abx) / denominator;
    if (t < -0.0001 || t > 1.0001 || u < -0.0001 || u > 1.0001) return null;
    return { x: a.x + abx * t, z: a.z + abz * t };
  }

  private connect(from: number, to: number): void {
    const start = this.nodes[from];
    const end = this.nodes[to];
    if (start.connections.some((edge) => edge.to === to)) return;
    start.connections.push({
      to,
      distance: distance(start.position, end.position),
      heading: Math.atan2(end.position.x - start.position.x, end.position.z - start.position.z),
    });
  }

  nearestCurb(position: Point2, preferredHeading?: number): CurbAccess | undefined {
    let best: CurbAccess | undefined;
    for (const road of ROAD_SEGMENTS) {
      const start = { x: road.x1, z: road.z1 };
      const end = { x: road.x2, z: road.z2 };
      projectOnSegment(position, start, end, this.projection);
      const roadDistance = distance(position, this.projection);
      if (best && roadDistance >= best.distance) continue;
      let dx = end.x - start.x;
      let dz = end.z - start.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      dx /= length;
      dz /= length;
      const sideDot = (position.x - this.projection.x) * dz - (position.z - this.projection.z) * dx;
      const side = sideDot >= 0 ? 1 : -1;
      dx *= side;
      dz *= side;
      if (preferredHeading !== undefined && Math.cos(preferredHeading) * dz + Math.sin(preferredHeading) * dx < -0.8) {
        dx *= -1;
        dz *= -1;
      }
      const point = {
        x: this.projection.x + dz * this.laneWidth,
        z: this.projection.z - dx * this.laneWidth,
      };
      const direction = Math.atan2(dx, dz);
      const nearest = this.nearestNode(this.projection);
      best = {
        sidewalk: { ...position },
        road: point,
        heading: direction,
        nodeId: nearest?.id ?? -1,
        distance: roadDistance,
        side,
      };
    }
    return best;
  }

  private nearestNode(position: Point2): RoadNode | undefined {
    let nearest: RoadNode | undefined;
    let best = Infinity;
    for (const node of this.nodes) {
      const separation = distance(position, node.position);
      if (separation < best) {
        nearest = node;
        best = separation;
      }
    }
    return nearest;
  }

  route(from: Point2, destination: Point2): Point2[] {
    const startCurb = this.nearestCurb(from);
    const endCurb = this.nearestCurb(destination);
    if (!startCurb || !endCurb) return [];
    const start = this.nearestNode(startCurb.road);
    const end = this.nearestNode(endCurb.road);
    if (!start || !end) return [];
    const distances = new Float64Array(this.nodes.length);
    const previous = new Int32Array(this.nodes.length);
    const visited = new Uint8Array(this.nodes.length);
    distances.fill(Infinity);
    previous.fill(-1);
    distances[start.id] = 0;
    for (let iteration = 0; iteration < this.nodes.length; iteration++) {
      let current = -1;
      let best = Infinity;
      for (let index = 0; index < this.nodes.length; index++) {
        if (!visited[index] && distances[index] < best) {
          best = distances[index];
          current = index;
        }
      }
      if (current < 0 || current === end.id) break;
      visited[current] = 1;
      for (const edge of this.nodes[current].connections) {
        if (visited[edge.to]) continue;
        let turnPenalty = 0;
        const prior = previous[current];
        if (prior >= 0) {
          const incoming = Math.atan2(this.nodes[current].position.x - this.nodes[prior].position.x, this.nodes[current].position.z - this.nodes[prior].position.z);
          turnPenalty = (1 - Math.cos(edge.heading - incoming)) * 4;
        }
        const next = distances[current] + edge.distance + turnPenalty;
        if (next < distances[edge.to]) {
          distances[edge.to] = next;
          previous[edge.to] = current;
        }
      }
    }
    if (!Number.isFinite(distances[end.id])) return [];
    const nodes: RoadNode[] = [];
    let cursor = end.id;
    for (let guard = 0; guard <= this.nodes.length && cursor >= 0; guard++) {
      nodes.push(this.nodes[cursor]);
      if (cursor === start.id) break;
      cursor = previous[cursor];
    }
    nodes.reverse();
    const centers = [this.centerline(startCurb), ...nodes.map((node) => node.position), this.centerline(endCurb)];
    const unique: Point2[] = [];
    for (const center of centers) if (unique.length === 0 || distance(unique[unique.length - 1], center) > 0.2) unique.push({ ...center });
    const lanePath = this.offsetLane(unique);
    if (lanePath.length < 2) return [];
    lanePath[0] = { ...startCurb.road };
    lanePath[lanePath.length - 1] = { ...endCurb.road };
    return this.roundCorners(lanePath);
  }

  private centerline(access: CurbAccess): Point2 {
    return {
      x: access.road.x - Math.cos(access.heading) * this.laneWidth,
      z: access.road.z + Math.sin(access.heading) * this.laneWidth,
    };
  }

  private offsetLane(points: Point2[]): Point2[] {
    return points.map((current, index) => {
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(points.length - 1, index + 1)];
      let dx = after.x - before.x;
      let dz = after.z - before.z;
      const length = Math.max(0.001, Math.hypot(dx, dz));
      dx /= length;
      dz /= length;
      return { x: current.x + dz * this.laneWidth, z: current.z - dx * this.laneWidth };
    });
  }

  private roundCorners(path: Point2[]): Point2[] {
    if (path.length < 3) return path;
    const result: Point2[] = [{ ...path[0] }];
    for (let index = 1; index < path.length - 1; index++) {
      const before = path[index - 1];
      const corner = path[index];
      const after = path[index + 1];
      const a = distance(before, corner);
      const b = distance(corner, after);
      const radius = Math.min(3.5, a * 0.3, b * 0.3);
      if (radius < 0.2) {
        result.push({ ...corner });
        continue;
      }
      const enter = { x: corner.x + (before.x - corner.x) / a * radius, z: corner.z + (before.z - corner.z) / a * radius };
      const leave = { x: corner.x + (after.x - corner.x) / b * radius, z: corner.z + (after.z - corner.z) / b * radius };
      result.push(enter);
      for (let segment = 1; segment <= 5; segment++) {
        const t = segment / 5;
        const one = 1 - t;
        result.push({
          x: one * one * enter.x + 2 * one * t * corner.x + t * t * leave.x,
          z: one * one * enter.z + 2 * one * t * corner.z + t * t * leave.z,
        });
      }
    }
    result.push({ ...path[path.length - 1] });
    return result;
  }

  routeLength(route: readonly Point2[]): number {
    let total = 0;
    for (let index = 1; index < route.length; index++) total += distance(route[index - 1], route[index]);
    return total;
  }

  approximateArrival(from: Point2, to: Point2, speed = 6): number {
    const path = this.route(from, to);
    if (path.length === 0) return Infinity;
    const travel = this.routeLength(path) / Math.max(1, speed);
    const turns = path.filter((point, index) => index > 0 && index < path.length - 1 && this.turn(path[index - 1], point, path[index + 1]) > 0.15).length;
    return travel + Math.min(20, turns * 0.25);
  }

  private turn(a: Point2, b: Point2, c: Point2): number {
    const ab = distance(a, b);
    const bc = distance(b, c);
    if (ab < 0.001 || bc < 0.001) return 0;
    return Math.acos(clamp(((b.x - a.x) * (c.x - b.x) + (b.z - a.z) * (c.z - b.z)) / (ab * bc), -1, 1));
  }
}
