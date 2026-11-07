import type { CityBuiltSite } from "../contracts";
import { clamp, distanceSquared, insideBounds, inverseLocal, localDirection, localPoint, point, segmentDistanceSquared, type Bounds2, type Point2 } from "./math";
import type { PedestrianNetwork } from "./navigation";

export interface CircleObstacle {
  id: number;
  center: Point2;
  radius: number;
  movable: boolean;
  active: boolean;
  expiresAt: number;
  ownerId: number;
}

export interface WallObstacle {
  id: number;
  from: Point2;
  to: Point2;
  thickness: number;
  active: boolean;
  expiresAt: number;
}

interface OrientedBuilding {
  center: Point2;
  angle: number;
  halfWidth: number;
  halfDepth: number;
  bounds: Bounds2;
  entrances: { position: Point2; width: number; outward: Point2 }[];
}

export class LifeObstacles {
  private nextId = 1;
  private readonly circles = new Map<number, CircleObstacle>();
  private readonly walls = new Map<number, WallObstacle>();
  private readonly buildings: OrientedBuilding[] = [];
  private readonly local = point();
  private readonly correction = point();
  private readonly nearest = point();
  private readonly worldCorrection = point();

  constructor(network: PedestrianNetwork, sites: readonly CityBuiltSite[] = []) {
    if (sites.length > 0) {
      for (const site of sites) {
        const cosine = Math.abs(Math.cos(site.rotationY));
        const sine = Math.abs(Math.sin(site.rotationY));
        const ex = site.width * cosine / 2 + site.depth * sine / 2;
        const ez = site.width * sine / 2 + site.depth * cosine / 2;
        this.buildings.push({
          center: { x: site.x, z: site.z },
          angle: site.rotationY,
          halfWidth: site.width / 2,
          halfDepth: site.depth / 2,
          bounds: { minX: site.x - ex, maxX: site.x + ex, minZ: site.z - ez, maxZ: site.z + ez },
          entrances: site.entrances.map((entrance) => ({ position: { x: entrance.position.x, z: entrance.position.z }, width: entrance.width, outward: { ...entrance.outward } })),
        });
      }
    } else {
      for (const bounds of network.buildingBounds) {
        this.buildings.push({
          center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
          angle: 0,
          halfWidth: (bounds.maxX - bounds.minX) / 2,
          halfDepth: (bounds.maxZ - bounds.minZ) / 2,
          bounds,
          entrances: [],
        });
      }
    }
  }

  addCircle(center: Point2, radius: number, seconds: number, duration: number, ownerId = -1, movable = false): number {
    const id = this.nextId++;
    this.circles.set(id, {
      id,
      center: { ...center },
      radius: Math.max(0.05, radius),
      movable,
      active: true,
      expiresAt: seconds + duration,
      ownerId,
    });
    return id;
  }

  moveCircle(id: number, center: Point2, radius?: number): void {
    const circle = this.circles.get(id);
    if (!circle) return;
    circle.center.x = center.x;
    circle.center.z = center.z;
    if (radius !== undefined) circle.radius = Math.max(0.05, radius);
  }

  addWall(from: Point2, to: Point2, thickness: number, seconds: number, duration: number): number {
    const id = this.nextId++;
    this.walls.set(id, {
      id,
      from: { ...from },
      to: { ...to },
      thickness: Math.max(0.01, thickness),
      active: true,
      expiresAt: seconds + duration,
    });
    return id;
  }

  remove(id: number): void {
    this.circles.delete(id);
    this.walls.delete(id);
  }

  removeOwner(ownerId: number): void {
    for (const circle of this.circles.values()) {
      if (circle.ownerId === ownerId) this.circles.delete(circle.id);
    }
  }

  tick(seconds: number): void {
    for (const circle of this.circles.values()) {
      if (circle.expiresAt <= seconds) this.circles.delete(circle.id);
    }
    for (const wall of this.walls.values()) {
      if (wall.expiresAt <= seconds) this.walls.delete(wall.id);
    }
  }

  constrain(position: Point2, radius: number, ownerId = -1): boolean {
    let collided = false;
    for (const building of this.buildings) {
      if (!insideBounds(position, building.bounds, radius + 0.1)) continue;
      if (this.insideEntrance(position, building, radius)) continue;
      inverseLocal(building.center, building.angle, position, this.local);
      const halfWidth = building.halfWidth + radius;
      const halfDepth = building.halfDepth + radius;
      if (Math.abs(this.local.x) >= halfWidth || Math.abs(this.local.z) >= halfDepth) continue;
      const xPenetration = halfWidth - Math.abs(this.local.x);
      const zPenetration = halfDepth - Math.abs(this.local.z);
      if (xPenetration < zPenetration) this.local.x = (this.local.x < 0 ? -1 : 1) * halfWidth;
      else this.local.z = (this.local.z < 0 ? -1 : 1) * halfDepth;
      localPoint(building.center, building.angle, this.local.x, this.local.z, position);
      collided = true;
    }
    for (const circle of this.circles.values()) {
      if (!circle.active || circle.ownerId === ownerId) continue;
      const dx = position.x - circle.center.x;
      const dz = position.z - circle.center.z;
      const required = radius + circle.radius;
      const squared = dx * dx + dz * dz;
      if (squared >= required * required) continue;
      const length = Math.sqrt(Math.max(1e-8, squared));
      const scale = (required - length) / length;
      if (squared < 1e-8) position.x += required;
      else {
        position.x += dx * scale;
        position.z += dz * scale;
      }
      collided = true;
    }
    for (const wall of this.walls.values()) {
      if (!wall.active) continue;
      const required = radius + wall.thickness;
      if (segmentDistanceSquared(position, wall.from, wall.to) >= required * required) continue;
      const dx = wall.to.x - wall.from.x;
      const dz = wall.to.z - wall.from.z;
      const denominator = dx * dx + dz * dz;
      const t = denominator > 1e-6 ? clamp(((position.x - wall.from.x) * dx + (position.z - wall.from.z) * dz) / denominator, 0, 1) : 0;
      const nx = position.x - wall.from.x - dx * t;
      const nz = position.z - wall.from.z - dz * t;
      const length = Math.hypot(nx, nz);
      if (length < 1e-6) {
        const inverse = 1 / Math.max(1e-6, Math.hypot(dx, dz));
        position.x += -dz * inverse * required;
        position.z += dx * inverse * required;
      } else {
        const scale = (required - length) / length;
        position.x += nx * scale;
        position.z += nz * scale;
      }
      collided = true;
    }
    return collided;
  }

  private insideEntrance(position: Point2, building: OrientedBuilding, radius: number): boolean {
    for (const entrance of building.entrances) {
      const dx = position.x - entrance.position.x;
      const dz = position.z - entrance.position.z;
      const lateral = Math.abs(dx * entrance.outward.z - dz * entrance.outward.x);
      const forward = dx * entrance.outward.x + dz * entrance.outward.z;
      if (lateral < entrance.width / 2 - radius * 0.5 && forward > -0.5 && forward < 1.2) return true;
    }
    return false;
  }

  steering(position: Point2, velocity: Point2, radius: number, horizon: number, target: Point2, ownerId = -1): Point2 {
    target.x = 0;
    target.z = 0;
    const predictedX = position.x + velocity.x * horizon;
    const predictedZ = position.z + velocity.z * horizon;
    for (const building of this.buildings) {
      if (predictedX < building.bounds.minX - radius * 3 || predictedX > building.bounds.maxX + radius * 3
        || predictedZ < building.bounds.minZ - radius * 3 || predictedZ > building.bounds.maxZ + radius * 3) continue;
      this.nearest.x = predictedX;
      this.nearest.z = predictedZ;
      if (this.insideEntrance(this.nearest, building, radius)) continue;
      inverseLocal(building.center, building.angle, this.nearest, this.local);
      this.correction.x = clamp(this.local.x, -building.halfWidth, building.halfWidth);
      this.correction.z = clamp(this.local.z, -building.halfDepth, building.halfDepth);
      let dx = this.local.x - this.correction.x;
      let dz = this.local.z - this.correction.z;
      let separation = Math.hypot(dx, dz);
      if (separation < 1e-6) {
        const xMargin = building.halfWidth - Math.abs(this.local.x);
        const zMargin = building.halfDepth - Math.abs(this.local.z);
        dx = xMargin < zMargin ? Math.sign(this.local.x) || 1 : 0;
        dz = xMargin < zMargin ? 0 : Math.sign(this.local.z) || 1;
        separation = 0.02;
      }
      const influence = Math.max(0, 1 - separation / (radius * 3));
      if (influence === 0) continue;
      localDirection(building.angle, dx / separation, dz / separation, this.worldCorrection);
      target.x += this.worldCorrection.x * influence * 2.2;
      target.z += this.worldCorrection.z * influence * 2.2;
    }
    for (const circle of this.circles.values()) {
      if (!circle.active || circle.ownerId === ownerId) continue;
      const dx = predictedX - circle.center.x;
      const dz = predictedZ - circle.center.z;
      const separation = Math.hypot(dx, dz);
      const influence = Math.max(0, 1 - Math.max(0, separation - circle.radius) / (radius * 3));
      if (separation < 1e-5 || influence === 0) continue;
      target.x += dx / separation * influence * 1.8;
      target.z += dz / separation * influence * 1.8;
    }
    return target;
  }

  isClear(position: Point2, radius: number, ownerId = -1): boolean {
    this.nearest.x = position.x;
    this.nearest.z = position.z;
    return !this.constrain(this.nearest, radius, ownerId);
  }

  findFreeSpot(origin: Point2, radius: number, preferredHeading: number, target: Point2, ownerId = -1): boolean {
    if (this.isClear(origin, radius, ownerId)) {
      target.x = origin.x;
      target.z = origin.z;
      return true;
    }
    for (let ring = 1; ring <= 5; ring++) {
      const distance = radius * (1 + ring * 1.2);
      for (let sample = 0; sample < 12; sample++) {
        const angle = preferredHeading + sample * Math.PI / 6;
        target.x = origin.x + Math.sin(angle) * distance;
        target.z = origin.z + Math.cos(angle) * distance;
        if (this.isClear(target, radius, ownerId)) return true;
      }
    }
    target.x = origin.x;
    target.z = origin.z;
    return false;
  }

  nearbyCircles(position: Point2, radius: number): readonly CircleObstacle[] {
    const result: CircleObstacle[] = [];
    for (const circle of this.circles.values()) {
      if (circle.active && distanceSquared(position, circle.center) <= (radius + circle.radius) ** 2) result.push(circle);
    }
    return result;
  }

  reset(): void {
    this.circles.clear();
    this.walls.clear();
    this.nextId = 1;
  }
}
