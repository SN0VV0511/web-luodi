import { ROAD_SEGMENTS, cityLots, civicLots } from "../../city-map";
import { centralParkWalks } from "../../city-civic";
import { distance, distanceSquared, point, projectOnSegment, quantizedKey, segmentIntersectsBounds, type Bounds2, type Point2 } from "./math";
import type { PlaceDirectory } from "./places";

export type WalkSurface = "sidewalk" | "crosswalk" | "park" | "promenade" | "entrance";

export interface WalkNode {
  id: number;
  position: Point2;
  surface: WalkSurface;
  edges: number[];
  component: number;
  capacity: number;
  shelter: number;
  elevation: number;
  accessible: boolean;
}

export interface WalkEdge {
  id: number;
  from: number;
  to: number;
  distance: number;
  width: number;
  surface: WalkSurface;
  crossingId: number;
  accessible: boolean;
  crowd: number;
  risk: number;
  slope: number;
  closedUntil: number;
  closureReason: string;
  bidirectional: boolean;
}

export interface CrossingLocation {
  id: number;
  center: Point2;
  axis: "x" | "z";
  edgeIds: number[];
  length: number;
  width: number;
  island: boolean;
}

export class PedestrianNetwork {
  readonly nodes: WalkNode[] = [];
  readonly edges: WalkEdge[] = [];
  readonly crossings: CrossingLocation[] = [];
  readonly buildingBounds: Bounds2[] = [];
  private readonly keys = new Map<string, number>();
  private readonly edgeKeys = new Set<string>();
  private readonly spatial = new Map<string, number[]>();
  private readonly projection = point();
  private topologyVersion = 1;

  constructor(places: PlaceDirectory) {
    this.addBuildingBounds(places);
    this.buildSidewalks();
    this.buildIntersectionLinks();
    this.buildParkPaths();
    this.buildPromenade();
    this.joinPathEndpoints();
    this.attachPlaces(places);
    this.markComponents();
    this.buildSpatialIndex();
  }

  private addBuildingBounds(places: PlaceDirectory): void {
    for (const site of cityLots) {
      this.buildingBounds.push({
        minX: site.x - site.width / 2,
        maxX: site.x + site.width / 2,
        minZ: site.z - site.depth / 2,
        maxZ: site.z + site.depth / 2,
      });
    }
    for (const site of civicLots) {
      this.buildingBounds.push({ minX: site.x - 11.5, maxX: site.x + 11.5, minZ: site.z - 11.5, maxZ: site.z + 11.5 });
    }
    for (const place of places.all) {
      if (place.bounds) this.buildingBounds.push(place.bounds);
    }
  }

  private addNode(position: Point2, surface: WalkSurface, width = 2.5): number {
    const key = quantizedKey(position, 10);
    const existing = this.keys.get(key);
    if (existing !== undefined) return existing;
    const id = this.nodes.length;
    this.nodes.push({
      id,
      position: { ...position },
      surface,
      edges: [],
      component: -1,
      capacity: Math.max(2, Math.floor(width * 2)),
      shelter: 0,
      elevation: 0.49,
      accessible: true,
    });
    this.keys.set(key, id);
    return id;
  }

  private addEdge(from: number, to: number, surface: WalkSurface, width: number, crossingId = -1): number {
    if (from === to) return -1;
    const a = Math.min(from, to);
    const b = Math.max(from, to);
    const key = `${a}:${b}`;
    if (this.edgeKeys.has(key)) {
      return this.nodes[from].edges.find((edgeId) => {
        const edge = this.edges[edgeId];
        return edge.from === to || edge.to === to;
      }) ?? -1;
    }
    const length = distance(this.nodes[from].position, this.nodes[to].position);
    if (length < 0.05) return -1;
    const id = this.edges.length;
    const edge: WalkEdge = {
      id,
      from,
      to,
      distance: length,
      width,
      surface,
      crossingId,
      accessible: true,
      crowd: 0,
      risk: surface === "crosswalk" ? 0.35 : 0.02,
      slope: 0,
      closedUntil: 0,
      closureReason: "",
      bidirectional: true,
    };
    this.edges.push(edge);
    this.nodes[from].edges.push(id);
    this.nodes[to].edges.push(id);
    this.edgeKeys.add(key);
    return id;
  }

  private buildSidewalks(): void {
    for (const road of ROAD_SEGMENTS) {
      const dx = road.x2 - road.x1;
      const dz = road.z2 - road.z1;
      const length = Math.hypot(dx, dz);
      if (length < 12) continue;
      const ux = dx / length;
      const uz = dz / length;
      const nx = -uz;
      const nz = ux;
      for (const side of [-1, 1]) {
        const start = {
          x: road.x1 + ux * 6.1 + nx * side * 5.9,
          z: road.z1 + uz * 6.1 + nz * side * 5.9,
        };
        const end = {
          x: road.x2 - ux * 6.1 + nx * side * 5.9,
          z: road.z2 - uz * 6.1 + nz * side * 5.9,
        };
        const segments = Math.max(1, Math.ceil(distance(start, end) / 14));
        let previous = this.addNode(start, "sidewalk", 2.8);
        for (let segment = 1; segment <= segments; segment++) {
          const t = segment / segments;
          const current = this.addNode({ x: start.x + (end.x - start.x) * t, z: start.z + (end.z - start.z) * t }, "sidewalk", 2.8);
          this.addEdge(previous, current, "sidewalk", 2.8);
          previous = current;
        }
      }
    }
  }

  private buildIntersectionLinks(): void {
    const intersections = new Map<string, Point2>();
    for (const road of ROAD_SEGMENTS) {
      const start = { x: road.x1, z: road.z1 };
      const end = { x: road.x2, z: road.z2 };
      intersections.set(quantizedKey(start), start);
      intersections.set(quantizedKey(end), end);
    }
    for (const center of intersections.values()) {
      const nearby = this.nodes.filter((node) => Math.abs(node.position.x - center.x) < 6.5 && Math.abs(node.position.z - center.z) < 6.5);
      const corners = new Map<string, number[]>();
      for (const node of nearby) {
        const corner = `${Math.sign(node.position.x - center.x)}:${Math.sign(node.position.z - center.z)}`;
        const group = corners.get(corner) ?? [];
        group.push(node.id);
        corners.set(corner, group);
      }
      for (const group of corners.values()) {
        for (let index = 1; index < group.length; index++) this.addEdge(group[0], group[index], "sidewalk", 2.8);
      }
      const representatives = [...corners.values()].map((group) => group[0]);
      for (let a = 0; a < representatives.length; a++) {
        for (let b = a + 1; b < representatives.length; b++) {
          const first = this.nodes[representatives[a]];
          const second = this.nodes[representatives[b]];
          const dx = Math.abs(first.position.x - second.position.x);
          const dz = Math.abs(first.position.z - second.position.z);
          if (dx > 2 && dz > 2) continue;
          if (Math.max(dx, dz) < 8) continue;
          const axis = dx > dz ? "x" : "z";
          const crossingId = this.crossings.length;
          const edgeId = this.addEdge(first.id, second.id, "crosswalk", 3.2, crossingId);
          if (edgeId < 0) continue;
          this.crossings.push({
            id: crossingId,
            center: { x: (first.position.x + second.position.x) / 2, z: (first.position.z + second.position.z) / 2 },
            axis,
            edgeIds: [edgeId],
            length: distance(first.position, second.position),
            width: 3.2,
            island: false,
          });
        }
      }
    }
  }

  private buildParkPaths(): void {
    for (const path of centralParkWalks) {
      let previous = -1;
      let first = -1;
      const points = path.closed ? [...path.points, path.points[0]] : path.points;
      for (let index = 0; index < points.length; index++) {
        const position = { x: points[index][0], z: points[index][1] };
        const current = this.addNode(position, "park", path.width);
        if (first < 0) first = current;
        if (previous >= 0) this.addEdge(previous, current, "park", path.width);
        previous = current;
      }
    }
  }

  private buildPromenade(): void {
    let previous = -1;
    for (let x = -204; x <= 210; x += 18) {
      const current = this.addNode({ x, z: 102.5 }, "promenade", 4);
      if (previous >= 0) this.addEdge(previous, current, "promenade", 4);
      previous = current;
    }
    const northern = this.nodes.filter((node) => node.surface === "sidewalk" && node.position.z > 87 && node.position.z < 95);
    for (const node of northern) {
      const promenade = this.nearest({ x: node.position.x, z: 102.5 }, (candidate) => candidate.surface === "promenade");
      if (!promenade) continue;
      const crossingId = this.crossings.length;
      const edgeId = this.addEdge(node.id, promenade.id, "crosswalk", 3.2, crossingId);
      if (edgeId < 0) continue;
      this.crossings.push({
        id: crossingId,
        center: { x: (node.position.x + promenade.position.x) / 2, z: 95.6 },
        axis: "z",
        edgeIds: [edgeId],
        length: distance(node.position, promenade.position),
        width: 3.2,
        island: false,
      });
    }
  }

  private joinPathEndpoints(): void {
    const originalCount = this.nodes.length;
    for (let index = 0; index < originalCount; index++) {
      const node = this.nodes[index];
      if (node.surface !== "park") continue;
      const nearby = this.nodes.filter((candidate) => candidate.id !== node.id
        && distanceSquared(candidate.position, node.position) < 17 * 17
        && this.walkableSegment(node.position, candidate.position));
      nearby.sort((a, b) => distanceSquared(a.position, node.position) - distanceSquared(b.position, node.position));
      let added = 0;
      for (const candidate of nearby) {
        if (node.edges.some((edgeId) => this.other(this.edges[edgeId], node.id) === candidate.id)) continue;
        if (candidate.surface === "park" && distance(node.position, candidate.position) > 7) continue;
        this.addEdge(node.id, candidate.id, "park", 2.5);
        added++;
        if (added >= 2) break;
      }
    }
  }

  private attachPlaces(places: PlaceDirectory): void {
    for (const place of places.all) {
      const nearest = this.nearest(place.entrance, (node) => node.surface !== "entrance"
        && this.walkableSegment(place.entrance, node.position));
      if (!nearest) continue;
      const entrance = this.addNode(place.entrance, "entrance", 2.4);
      place.nodeId = entrance;
      this.nodes[entrance].shelter = place.covered;
      this.nodes[entrance].accessible = place.wheelchairAccess;
      if (distance(place.entrance, nearest.position) > 0.1) this.addEdge(entrance, nearest.id, "entrance", 2.4);
      for (const slot of place.slots) {
        const slotNode = this.addNode(slot.position, "entrance", 1.4);
        this.nodes[slotNode].shelter = slot.indoors ? 1 : place.covered;
        this.nodes[slotNode].accessible = slot.accessible;
        if (slotNode !== entrance && this.walkableSegment(slot.position, place.entrance)) {
          this.addEdge(entrance, slotNode, "entrance", 1.4);
        }
      }
    }
  }

  private markComponents(): void {
    let component = 0;
    const queue: number[] = [];
    for (const node of this.nodes) node.component = -1;
    for (const node of this.nodes) {
      if (node.component >= 0) continue;
      node.component = component;
      queue.push(node.id);
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const current = this.nodes[queue[cursor]];
        for (const edgeId of current.edges) {
          const neighbor = this.nodes[this.other(this.edges[edgeId], current.id)];
          if (neighbor.component >= 0) continue;
          neighbor.component = component;
          queue.push(neighbor.id);
        }
      }
      queue.length = 0;
      component++;
    }
  }

  private buildSpatialIndex(): void {
    this.spatial.clear();
    for (const node of this.nodes) {
      const key = `${Math.floor(node.position.x / 20)}:${Math.floor(node.position.z / 20)}`;
      const bucket = this.spatial.get(key) ?? [];
      bucket.push(node.id);
      this.spatial.set(key, bucket);
    }
  }

  nearest(position: Point2, predicate?: (node: WalkNode) => boolean): WalkNode | undefined {
    let best: WalkNode | undefined;
    let bestDistance = Infinity;
    const cellX = Math.floor(position.x / 20);
    const cellZ = Math.floor(position.z / 20);
    if (this.spatial.size > 0) {
      for (let ring = 0; ring <= 3; ring++) {
        for (let x = cellX - ring; x <= cellX + ring; x++) {
          for (let z = cellZ - ring; z <= cellZ + ring; z++) {
            if (ring > 0 && Math.abs(x - cellX) < ring && Math.abs(z - cellZ) < ring) continue;
            for (const id of this.spatial.get(`${x}:${z}`) ?? []) {
              const node = this.nodes[id];
              if (predicate && !predicate(node)) continue;
              const squared = distanceSquared(position, node.position);
              if (squared < bestDistance) {
                best = node;
                bestDistance = squared;
              }
            }
          }
        }
        if (best && bestDistance < Math.max(1, ring * 20 - 20) ** 2) return best;
      }
      if (best) return best;
    }
    for (const node of this.nodes) {
      if (predicate && !predicate(node)) continue;
      const squared = distanceSquared(position, node.position);
      if (squared < bestDistance) {
        bestDistance = squared;
        best = node;
      }
    }
    return best;
  }

  nearestEdge(position: Point2, maximumDistance = 8): { edge: WalkEdge; point: Point2; distance: number } | undefined {
    let best: WalkEdge | undefined;
    let bestDistance = maximumDistance;
    const closest = point();
    const node = this.nearest(position);
    const candidates = new Set<number>(node?.edges ?? []);
    if (node) {
      for (const edgeId of node.edges) {
        const neighbor = this.nodes[this.other(this.edges[edgeId], node.id)];
        for (const secondEdge of neighbor.edges) candidates.add(secondEdge);
      }
    }
    for (const edgeId of candidates) {
      const edge = this.edges[edgeId];
      projectOnSegment(position, this.nodes[edge.from].position, this.nodes[edge.to].position, this.projection);
      const candidateDistance = distance(position, this.projection);
      if (candidateDistance > bestDistance) continue;
      bestDistance = candidateDistance;
      best = edge;
      closest.x = this.projection.x;
      closest.z = this.projection.z;
    }
    return best ? { edge: best, point: closest, distance: bestDistance } : undefined;
  }

  walkableSegment(start: Point2, end: Point2, padding = 0.25): boolean {
    for (const bounds of this.buildingBounds) {
      if (segmentIntersectsBounds(start, end, bounds, padding)) return false;
    }
    const length = distance(start, end);
    const samples = Math.max(1, Math.ceil(length / 3));
    for (let index = 1; index < samples; index++) {
      const t = index / samples;
      const x = start.x + (end.x - start.x) * t;
      const z = start.z + (end.z - start.z) * t;
      const lake = ((x + 12) / 26.7) ** 2 + ((z + 15) / 36.3) ** 2;
      if (lake < 1) return false;
    }
    return true;
  }

  other(edge: WalkEdge, nodeId: number): number {
    return edge.from === nodeId ? edge.to : edge.from;
  }

  reachable(from: number, to: number): boolean {
    const first = this.nodes[from];
    const second = this.nodes[to];
    return Boolean(first && second && first.component === second.component);
  }

  closeEdge(edgeId: number, until: number, reason: string): void {
    const edge = this.edges[edgeId];
    if (!edge) return;
    edge.closedUntil = Math.max(edge.closedUntil, until);
    edge.closureReason = reason;
    this.topologyVersion++;
  }

  openEdge(edgeId: number): void {
    const edge = this.edges[edgeId];
    if (!edge || edge.closedUntil === 0) return;
    edge.closedUntil = 0;
    edge.closureReason = "";
    this.topologyVersion++;
  }

  clearExpiredClosures(seconds: number): void {
    for (const edge of this.edges) {
      if (edge.closedUntil > 0 && edge.closedUntil <= seconds) this.openEdge(edge.id);
    }
  }

  updateCrowding(occupancies: ReadonlyMap<number, number>, smoothing: number): void {
    for (const edge of this.edges) {
      const count = occupancies.get(edge.id) ?? 0;
      const density = count / Math.max(1, edge.width * edge.distance);
      edge.crowd += (density - edge.crowd) * smoothing;
    }
  }

  reset(): void {
    for (const edge of this.edges) {
      edge.crowd = 0;
      edge.closedUntil = 0;
      edge.closureReason = "";
    }
    this.topologyVersion++;
  }

  get version(): number {
    return this.topologyVersion;
  }
}
