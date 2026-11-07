export type FloorRect = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

export type FloorPoint = { x: number; z: number };

export type FurnitureKind = "single-bed" | "double-bed" | "sofa" | "wardrobe" | "desk" | "table" | "chair" | "kitchen" | "fridge" | "bathroom" | "bookcase" | "nightstand";

export type FurniturePlacement = {
  id: string;
  kind: FurnitureKind;
  footprint: FloorRect;
  yaw: number;
  score: number;
  essential: boolean;
  approach: FloorPoint;
};

export type FurnitureRequirement = {
  id: string;
  kind: FurnitureKind;
  width: number;
  depth: number;
  essential: boolean;
  rotations: readonly number[];
  wallPreference?: "front" | "back" | "left" | "right";
  daylightPreference?: number;
  near?: FloorPoint;
  clearance?: number;
};

export type RoomPlan = {
  bounds: FloorRect;
  entry: FloorPoint;
  placements: FurniturePlacement[];
  circulation: FloorPoint[];
  missingEssentials: string[];
  clearWidth: number;
};

function left(rect: FloorRect): number {
  return rect.x - rect.width / 2;
}

function right(rect: FloorRect): number {
  return rect.x + rect.width / 2;
}

function back(rect: FloorRect): number {
  return rect.z - rect.depth / 2;
}

function front(rect: FloorRect): number {
  return rect.z + rect.depth / 2;
}

export function expandFloorRect(rect: FloorRect, margin: number): FloorRect {
  return { x: rect.x, z: rect.z, width: rect.width + margin * 2, depth: rect.depth + margin * 2 };
}

export function containsFloorPoint(rect: FloorRect, point: FloorPoint, margin = 0): boolean {
  return point.x >= left(rect) + margin && point.x <= right(rect) - margin && point.z >= back(rect) + margin && point.z <= front(rect) - margin;
}

export function floorRectsOverlap(a: FloorRect, b: FloorRect, gap = 0): boolean {
  return Math.abs(a.x - b.x) < (a.width + b.width) / 2 + gap && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2 + gap;
}

export function floorRectDistance(a: FloorRect, b: FloorRect): number {
  const dx = Math.max(0, Math.abs(a.x - b.x) - (a.width + b.width) / 2);
  const dz = Math.max(0, Math.abs(a.z - b.z) - (a.depth + b.depth) / 2);
  return Math.hypot(dx, dz);
}

function pointDistance(a: FloorPoint, b: FloorPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function nearestPointOnRect(rect: FloorRect, point: FloorPoint): FloorPoint {
  return {
    x: Math.max(left(rect), Math.min(right(rect), point.x)),
    z: Math.max(back(rect), Math.min(front(rect), point.z)),
  };
}

function insideBounds(candidate: FloorRect, room: FloorRect): boolean {
  return left(candidate) >= left(room) - 0.001 && right(candidate) <= right(room) + 0.001 && back(candidate) >= back(room) - 0.001 && front(candidate) <= front(room) + 0.001;
}

function approachPoint(rect: FloorRect, yaw: number, gap: number): FloorPoint {
  const x = Math.sin(yaw);
  const z = Math.cos(yaw);
  const halfExtent = Math.abs(x) * rect.width / 2 + Math.abs(z) * rect.depth / 2;
  return { x: rect.x + x * (halfExtent + gap), z: rect.z + z * (halfExtent + gap) };
}

export class FloorNavigationGrid {
  readonly columns: number;
  readonly rows: number;
  private readonly blocked: Uint8Array;
  private readonly distance: Float64Array;
  private readonly parent: Int32Array;
  private readonly queue: Int32Array;
  private readonly visited: Uint8Array;
  private readonly originX: number;
  private readonly originZ: number;

  constructor(readonly bounds: FloorRect, readonly resolution = 0.16) {
    this.columns = Math.max(2, Math.ceil(bounds.width / resolution));
    this.rows = Math.max(2, Math.ceil(bounds.depth / resolution));
    const size = this.columns * this.rows;
    this.blocked = new Uint8Array(size);
    this.distance = new Float64Array(size);
    this.parent = new Int32Array(size);
    this.queue = new Int32Array(size);
    this.visited = new Uint8Array(size);
    this.originX = left(bounds);
    this.originZ = back(bounds);
  }

  reset(obstacles: readonly FloorRect[], radius: number): void {
    this.blocked.fill(0);
    for (const obstacle of obstacles) {
      const expanded = expandFloorRect(obstacle, radius);
      const x0 = Math.max(0, Math.floor((left(expanded) - this.originX) / this.resolution));
      const x1 = Math.min(this.columns - 1, Math.floor((right(expanded) - this.originX) / this.resolution));
      const z0 = Math.max(0, Math.floor((back(expanded) - this.originZ) / this.resolution));
      const z1 = Math.min(this.rows - 1, Math.floor((front(expanded) - this.originZ) / this.resolution));
      for (let row = z0; row <= z1; row++) {
        for (let column = x0; column <= x1; column++) this.blocked[row * this.columns + column] = 1;
      }
    }
  }

  private index(point: FloorPoint): number {
    const column = Math.max(0, Math.min(this.columns - 1, Math.floor((point.x - this.originX) / this.resolution)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor((point.z - this.originZ) / this.resolution)));
    return row * this.columns + column;
  }

  private point(index: number): FloorPoint {
    return {
      x: this.originX + (index % this.columns + 0.5) * this.resolution,
      z: this.originZ + (Math.floor(index / this.columns) + 0.5) * this.resolution,
    };
  }

  private nearestFree(index: number): number {
    if (!this.blocked[index]) return index;
    const column = index % this.columns;
    const row = Math.floor(index / this.columns);
    for (let radius = 1; radius <= 6; radius++) {
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;
          const x = column + dx;
          const z = row + dz;
          if (x < 0 || x >= this.columns || z < 0 || z >= this.rows) continue;
          const candidate = z * this.columns + x;
          if (!this.blocked[candidate]) return candidate;
        }
      }
    }
    return -1;
  }

  path(start: FloorPoint, end: FloorPoint): FloorPoint[] {
    const source = this.nearestFree(this.index(start));
    const target = this.nearestFree(this.index(end));
    if (source < 0 || target < 0) return [];
    this.visited.fill(0);
    this.parent.fill(-1);
    this.distance.fill(Infinity);
    let read = 0;
    let write = 0;
    this.queue[write++] = source;
    this.visited[source] = 1;
    this.distance[source] = 0;
    while (read < write) {
      const current = this.queue[read++];
      if (current === target) break;
      const column = current % this.columns;
      const row = Math.floor(current / this.columns);
      const candidates = [column > 0 ? current - 1 : -1, column + 1 < this.columns ? current + 1 : -1, row > 0 ? current - this.columns : -1, row + 1 < this.rows ? current + this.columns : -1];
      for (const candidate of candidates) {
        if (candidate < 0 || this.blocked[candidate] || this.visited[candidate]) continue;
        this.visited[candidate] = 1;
        this.parent[candidate] = current;
        this.distance[candidate] = this.distance[current] + this.resolution;
        this.queue[write++] = candidate;
      }
    }
    if (!this.visited[target]) return [];
    const reverse: FloorPoint[] = [];
    let cursor = target;
    while (cursor >= 0) {
      reverse.push(this.point(cursor));
      if (cursor === source) break;
      cursor = this.parent[cursor];
    }
    reverse.reverse();
    if (reverse.length < 3) return reverse;
    const simplified = [reverse[0]];
    let directionX = 0;
    let directionZ = 0;
    for (let index = 1; index < reverse.length; index++) {
      const dx = Math.sign(reverse[index].x - reverse[index - 1].x);
      const dz = Math.sign(reverse[index].z - reverse[index - 1].z);
      if (index > 1 && (dx !== directionX || dz !== directionZ)) simplified.push(reverse[index - 1]);
      directionX = dx;
      directionZ = dz;
    }
    simplified.push(reverse[reverse.length - 1]);
    return simplified;
  }

  reachableArea(start: FloorPoint): number {
    const source = this.nearestFree(this.index(start));
    if (source < 0) return 0;
    this.visited.fill(0);
    let read = 0;
    let write = 0;
    this.queue[write++] = source;
    this.visited[source] = 1;
    while (read < write) {
      const current = this.queue[read++];
      const column = current % this.columns;
      const row = Math.floor(current / this.columns);
      const candidates = [column > 0 ? current - 1 : -1, column + 1 < this.columns ? current + 1 : -1, row > 0 ? current - this.columns : -1, row + 1 < this.rows ? current + this.columns : -1];
      for (const candidate of candidates) {
        if (candidate < 0 || this.blocked[candidate] || this.visited[candidate]) continue;
        this.visited[candidate] = 1;
        this.queue[write++] = candidate;
      }
    }
    return write * this.resolution * this.resolution;
  }
}

export class RoomLayoutSolver {
  readonly placements: FurniturePlacement[] = [];
  readonly reservations: FloorRect[] = [];
  private readonly navigation: FloorNavigationGrid;
  private readonly missing: string[] = [];
  private readonly windowCenters: FloorPoint[] = [];

  constructor(readonly bounds: FloorRect, readonly entry: FloorPoint, readonly clearWidth = 0.72) {
    this.navigation = new FloorNavigationGrid(bounds);
  }

  reserve(rect: FloorRect): void {
    if (rect.width > 0 && rect.depth > 0) this.reservations.push(rect);
  }

  window(point: FloorPoint): void {
    this.windowCenters.push(point);
  }

  private score(rect: FloorRect, yaw: number, requirement: FurnitureRequirement): number {
    let score = 0;
    if (requirement.wallPreference === "back") score += Math.abs(back(rect) - back(this.bounds)) * 5;
    if (requirement.wallPreference === "front") score += Math.abs(front(rect) - front(this.bounds)) * 5;
    if (requirement.wallPreference === "left") score += Math.abs(left(rect) - left(this.bounds)) * 5;
    if (requirement.wallPreference === "right") score += Math.abs(right(rect) - right(this.bounds)) * 5;
    if (requirement.near) score += pointDistance(rect, requirement.near) * 1.4;
    if (requirement.daylightPreference && this.windowCenters.length) {
      let closestWindow = Infinity;
      for (const window of this.windowCenters) closestWindow = Math.min(closestWindow, pointDistance(rect, window));
      score += closestWindow * requirement.daylightPreference;
    }
    const approach = approachPoint(rect, yaw, this.clearWidth / 2);
    if (!containsFloorPoint(this.bounds, approach, 0.05)) score += 100;
    score += pointDistance(approach, this.entry) * 0.05;
    for (const placement of this.placements) {
      const distance = floorRectDistance(rect, placement.footprint);
      if (distance < 0.12) score += (0.12 - distance) * 3;
      if (requirement.kind === "chair" && placement.kind === "table") score += distance * 3;
      if (requirement.kind === "nightstand" && (placement.kind === "single-bed" || placement.kind === "double-bed")) score += distance * 4;
    }
    return score;
  }

  private collisions(rect: FloorRect, gap: number): boolean {
    if (!insideBounds(rect, this.bounds)) return true;
    for (const reserved of this.reservations) if (floorRectsOverlap(rect, reserved)) return true;
    for (const placement of this.placements) if (floorRectsOverlap(rect, placement.footprint, gap)) return true;
    return false;
  }

  placeAt(requirement: FurnitureRequirement, point: FloorPoint, yaw = 0): boolean {
    const quarterTurn = Math.abs(Math.sin(yaw)) > 0.7;
    const footprint = { x: point.x, z: point.z, width: quarterTurn ? requirement.depth : requirement.width, depth: quarterTurn ? requirement.width : requirement.depth };
    if (this.collisions(footprint, requirement.clearance ?? 0.025)) return false;
    this.placements.push({ id: requirement.id, kind: requirement.kind, footprint, yaw, score: this.score(footprint, yaw, requirement), essential: requirement.essential, approach: approachPoint(footprint, yaw, this.clearWidth / 2) });
    return true;
  }

  place(requirement: FurnitureRequirement): boolean {
    let best: FurniturePlacement | undefined;
    const step = 0.18;
    for (const yaw of requirement.rotations) {
      const quarterTurn = Math.abs(Math.sin(yaw)) > 0.7;
      const width = quarterTurn ? requirement.depth : requirement.width;
      const depth = quarterTurn ? requirement.width : requirement.depth;
      if (width > this.bounds.width || depth > this.bounds.depth) continue;
      const xStart = left(this.bounds) + width / 2 + 0.015;
      const xEnd = right(this.bounds) - width / 2 - 0.015;
      const zStart = back(this.bounds) + depth / 2 + 0.015;
      const zEnd = front(this.bounds) - depth / 2 - 0.015;
      const columns = Math.max(1, Math.ceil((xEnd - xStart) / step));
      const rows = Math.max(1, Math.ceil((zEnd - zStart) / step));
      for (let row = 0; row <= rows; row++) {
        for (let column = 0; column <= columns; column++) {
          const rect = { x: xStart + (xEnd - xStart) * column / columns, z: zStart + (zEnd - zStart) * row / rows, width, depth };
          if (this.collisions(rect, requirement.clearance ?? 0.025)) continue;
          const score = this.score(rect, yaw, requirement);
          if (best && best.score <= score) continue;
          const approach = approachPoint(rect, yaw, this.clearWidth / 2);
          if (!containsFloorPoint(this.bounds, approach, 0.04)) continue;
          let approachBlocked = false;
          for (const placement of this.placements) {
            if (containsFloorPoint(expandFloorRect(placement.footprint, this.clearWidth * 0.25), approach)) approachBlocked = true;
          }
          if (approachBlocked) continue;
          best = { id: requirement.id, kind: requirement.kind, footprint: rect, yaw, score, essential: requirement.essential, approach };
        }
      }
    }
    if (!best) {
      if (requirement.essential) this.missing.push(requirement.id);
      return false;
    }
    this.placements.push(best);
    return true;
  }

  finalize(): RoomPlan {
    let circulation: FloorPoint[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      this.navigation.reset(this.placements.map(placement => placement.footprint), this.clearWidth * 0.33);
      const unreachable = this.placements.filter(placement => placement.essential && this.navigation.path(this.entry, nearestPointOnRect(this.bounds, placement.approach)).length === 0);
      const accessibleArea = this.navigation.reachableArea(this.entry);
      if (!unreachable.length && accessibleArea > Math.min(2, this.bounds.width * this.bounds.depth * 0.15)) break;
      const optional = this.placements.filter(placement => !placement.essential).sort((a, b) => b.score - a.score)[0];
      if (!optional) break;
      this.placements.splice(this.placements.indexOf(optional), 1);
    }
    const important = this.placements.filter(placement => placement.essential);
    for (const placement of important) {
      const path = this.navigation.path(this.entry, nearestPointOnRect(this.bounds, placement.approach));
      if (path.length > circulation.length) circulation = path;
    }
    return { bounds: this.bounds, entry: this.entry, placements: this.placements.slice(), circulation, missingEssentials: this.missing.slice(), clearWidth: this.clearWidth };
  }
}

export function planStudioInterior(width: number, depth: number, detailed: boolean): RoomPlan {
  const bounds = { x: 0, z: 0, width: Math.max(2.6, width - 0.12), depth: Math.max(2.6, depth - 0.12) };
  const entry = { x: 0, z: -bounds.depth / 2 + 0.12 };
  const solver = new RoomLayoutSolver(bounds, entry, 0.68);
  solver.window({ x: 0, z: bounds.depth / 2 });
  solver.reserve({ x: 0, z: -bounds.depth / 2 + 0.6, width: 0.82, depth: 1.2 });
  const bed: FurnitureRequirement = { id: "sleep", kind: "single-bed", width: 1.02, depth: 2.08, essential: true, rotations: [0, Math.PI, Math.PI / 2, -Math.PI / 2], wallPreference: "left", daylightPreference: 0.3 };
  if (!solver.placeAt(bed, { x: -bounds.width / 2 + 0.53, z: bounds.depth / 2 - 1.07 }, Math.PI)) solver.place(bed);
  if (detailed) {
    const bathroom: FurnitureRequirement = { id: "wash", kind: "bathroom", width: 1.42, depth: 1.72, essential: true, rotations: [0, Math.PI / 2], wallPreference: "back", near: { x: bounds.width / 2, z: -bounds.depth / 2 } };
    solver.place(bathroom);
    solver.place({ id: "cook", kind: "kitchen", width: Math.min(1.8, width * 0.42), depth: 0.62, essential: true, rotations: [0, Math.PI / 2, -Math.PI / 2], wallPreference: "back" });
    solver.place({ id: "cold", kind: "fridge", width: 0.62, depth: 0.66, essential: false, rotations: [0, Math.PI / 2, -Math.PI / 2], wallPreference: "back" });
  }
  solver.place({ id: "store", kind: "wardrobe", width: Math.min(1.1, width * 0.22), depth: 0.59, essential: false, rotations: [0, Math.PI, Math.PI / 2, -Math.PI / 2], wallPreference: "right" });
  solver.place({ id: "sit", kind: "sofa", width: 1.55, depth: 0.82, essential: false, rotations: [0, Math.PI, Math.PI / 2, -Math.PI / 2], wallPreference: "right", daylightPreference: 0.4 });
  solver.place({ id: "work", kind: "desk", width: 1.05, depth: 0.55, essential: false, rotations: [0, Math.PI, Math.PI / 2, -Math.PI / 2], wallPreference: "front", daylightPreference: 1 });
  if (detailed) solver.place({ id: "side-table", kind: "nightstand", width: 0.4, depth: 0.38, essential: false, rotations: [0, Math.PI], wallPreference: "left" });
  return solver.finalize();
}
