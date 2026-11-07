import { distanceSquared, type Bounds2, type Point2 } from "./math";
import type { Actor, LifeVehicle } from "./types";

export class SpatialNeighbors {
  private readonly cellSize = 4;
  private readonly buckets = new Map<string, number[]>();
  private readonly vehicleBuckets = new Map<string, number[]>();
  private readonly actorPositions = new Map<number, Point2>();
  private readonly actorReferences = new Map<number, Actor>();
  private readonly vehicleReferences = new Map<number, LifeVehicle>();
  private readonly occupiedKeys: string[] = [];
  private readonly occupiedVehicleKeys: string[] = [];
  private readonly reusableActorBuckets: number[][] = [];
  private readonly reusableVehicleBuckets: number[][] = [];
  private readonly visited = new Set<number>();

  rebuild(actors: readonly Actor[], vehicles: readonly LifeVehicle[]): void {
    for (const key of this.occupiedKeys) {
      const bucket = this.buckets.get(key)!;
      bucket.length = 0;
      this.reusableActorBuckets.push(bucket);
      this.buckets.delete(key);
    }
    for (const key of this.occupiedVehicleKeys) {
      const bucket = this.vehicleBuckets.get(key)!;
      bucket.length = 0;
      this.reusableVehicleBuckets.push(bucket);
      this.vehicleBuckets.delete(key);
    }
    this.occupiedKeys.length = 0;
    this.occupiedVehicleKeys.length = 0;
    this.actorPositions.clear();
    this.actorReferences.clear();
    this.vehicleReferences.clear();
    for (const actor of actors) {
      if (!actor.visible || actor.vehicleId >= 0 || actor.interiorId) continue;
      const key = this.key(actor.position);
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = this.reusableActorBuckets.pop() ?? [];
        this.buckets.set(key, bucket);
        this.occupiedKeys.push(key);
      }
      bucket.push(actor.id);
      this.actorPositions.set(actor.id, actor.position);
      this.actorReferences.set(actor.id, actor);
    }
    for (const vehicle of vehicles) {
      if (!vehicle.visible) continue;
      const key = this.key(vehicle.position);
      let bucket = this.vehicleBuckets.get(key);
      if (!bucket) {
        bucket = this.reusableVehicleBuckets.pop() ?? [];
        this.vehicleBuckets.set(key, bucket);
        this.occupiedVehicleKeys.push(key);
      }
      bucket.push(vehicle.id);
      this.vehicleReferences.set(vehicle.id, vehicle);
    }
  }

  private key(position: Point2): string {
    return `${Math.floor(position.x / this.cellSize)}:${Math.floor(position.z / this.cellSize)}`;
  }

  query(position: Point2, radius: number, target: Actor[], excludeId = -1): Actor[] {
    target.length = 0;
    const minX = Math.floor((position.x - radius) / this.cellSize);
    const maxX = Math.floor((position.x + radius) / this.cellSize);
    const minZ = Math.floor((position.z - radius) / this.cellSize);
    const maxZ = Math.floor((position.z + radius) / this.cellSize);
    const squared = radius * radius;
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const bucket = this.buckets.get(`${x}:${z}`);
        if (!bucket) continue;
        for (const id of bucket) {
          if (id === excludeId) continue;
          const actor = this.actorReferences.get(id)!;
          if (distanceSquared(position, actor.position) <= squared) target.push(actor);
        }
      }
    }
    return target;
  }

  queryVehicles(position: Point2, radius: number, target: LifeVehicle[]): LifeVehicle[] {
    target.length = 0;
    const minX = Math.floor((position.x - radius) / this.cellSize);
    const maxX = Math.floor((position.x + radius) / this.cellSize);
    const minZ = Math.floor((position.z - radius) / this.cellSize);
    const maxZ = Math.floor((position.z + radius) / this.cellSize);
    const squared = radius * radius;
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (const id of this.vehicleBuckets.get(`${x}:${z}`) ?? []) {
          const vehicle = this.vehicleReferences.get(id)!;
          if (distanceSquared(position, vehicle.position) <= squared) target.push(vehicle);
        }
      }
    }
    return target;
  }

  queryBounds(bounds: Bounds2, target: Actor[]): Actor[] {
    target.length = 0;
    const minX = Math.floor(bounds.minX / this.cellSize);
    const maxX = Math.floor(bounds.maxX / this.cellSize);
    const minZ = Math.floor(bounds.minZ / this.cellSize);
    const maxZ = Math.floor(bounds.maxZ / this.cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (const id of this.buckets.get(`${x}:${z}`) ?? []) {
          const actor = this.actorReferences.get(id)!;
          if (actor.position.x >= bounds.minX && actor.position.x <= bounds.maxX
            && actor.position.z >= bounds.minZ && actor.position.z <= bounds.maxZ) target.push(actor);
        }
      }
    }
    return target;
  }

  nearest(position: Point2, radius: number, predicate?: (actor: Actor) => boolean, excludeId = -1): Actor | undefined {
    let nearest: Actor | undefined;
    let closest = radius * radius;
    const minX = Math.floor((position.x - radius) / this.cellSize);
    const maxX = Math.floor((position.x + radius) / this.cellSize);
    const minZ = Math.floor((position.z - radius) / this.cellSize);
    const maxZ = Math.floor((position.z + radius) / this.cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (const id of this.buckets.get(`${x}:${z}`) ?? []) {
          if (id === excludeId) continue;
          const actor = this.actorReferences.get(id)!;
          if (predicate && !predicate(actor)) continue;
          const squared = distanceSquared(position, actor.position);
          if (squared < closest) {
            nearest = actor;
            closest = squared;
          }
        }
      }
    }
    return nearest;
  }

  density(position: Point2, radius: number): number {
    let count = 0;
    const squared = radius * radius;
    const minX = Math.floor((position.x - radius) / this.cellSize);
    const maxX = Math.floor((position.x + radius) / this.cellSize);
    const minZ = Math.floor((position.z - radius) / this.cellSize);
    const maxZ = Math.floor((position.z + radius) / this.cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (const id of this.buckets.get(`${x}:${z}`) ?? []) {
          if (distanceSquared(position, this.actorPositions.get(id)!) <= squared) count++;
        }
      }
    }
    return count / Math.max(1, Math.PI * squared);
  }

  forEachPair(radius: number, callback: (first: Actor, second: Actor) => void): void {
    const neighbors: Actor[] = [];
    this.visited.clear();
    for (const actor of this.actorReferences.values()) {
      this.visited.add(actor.id);
      this.query(actor.position, radius, neighbors, actor.id);
      for (const neighbor of neighbors) {
        if (!this.visited.has(neighbor.id)) callback(actor, neighbor);
      }
    }
  }

  reset(): void {
    this.buckets.clear();
    this.vehicleBuckets.clear();
    this.actorPositions.clear();
    this.actorReferences.clear();
    this.vehicleReferences.clear();
    this.occupiedKeys.length = 0;
    this.occupiedVehicleKeys.length = 0;
    this.reusableActorBuckets.length = 0;
    this.reusableVehicleBuckets.length = 0;
    this.visited.clear();
  }
}
