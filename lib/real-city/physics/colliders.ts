import * as THREE from "three";
import { clamp, EPSILON, safeNormalize } from "./math";
import { contactMaterial, type ContactMaterial, type ContactMaterialName } from "./materials";

export type GroundSample = {
  height: number;
  normal: THREE.Vector3;
  material: ContactMaterialName;
  wetness: number;
};
export type GroundSampler = (x: number, z: number, result: GroundSample) => GroundSample;
export type Contact = {
  normal: THREE.Vector3;
  point: THREE.Vector3;
  penetration: number;
  material: ContactMaterial;
  wetness: number;
  colliderId: number;
};
export type StaticCollider = {
  id: number;
  minimum: THREE.Vector3;
  maximum: THREE.Vector3;
  material: ContactMaterial;
  wetness: number;
  enabled: boolean;
  center?: THREE.Vector3;
  halfExtents?: THREE.Vector3;
  rotationY?: number;
};
export type RayHit = {
  hit: boolean;
  distance: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  material: ContactMaterial;
  colliderId: number;
};

export function createGroundSample(): GroundSample {
  return { height: 0, normal: new THREE.Vector3(0, 1, 0), material: "soil", wetness: 0 };
}

export function createContact(): Contact {
  return {
    normal: new THREE.Vector3(0, 1, 0),
    point: new THREE.Vector3(),
    penetration: 0,
    material: contactMaterial("concrete"),
    wetness: 0,
    colliderId: -1,
  };
}

export function createRayHit(): RayHit {
  return {
    hit: false,
    distance: Infinity,
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(0, 1, 0),
    material: contactMaterial("soil"),
    colliderId: -1,
  };
}

export class StaticCollisionWorld {
  readonly colliders: StaticCollider[] = [];
  private readonly cells = new Map<string, number[]>();
  private readonly cellSize: number;
  private readonly queryIds = new Set<number>();
  private readonly candidates: StaticCollider[] = [];
  private readonly closest = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly sample = createGroundSample();
  private readonly scratchHit = createRayHit();
  private readonly upward = new THREE.Vector3(0, 1, 0);
  private readonly localCenter = new THREE.Vector3();
  private readonly localCollider: StaticCollider = {
    id: -1, minimum: new THREE.Vector3(), maximum: new THREE.Vector3(),
    material: contactMaterial("concrete"), wetness: 0, enabled: true,
  };
  private readonly groundMaterialCache = new Map<ContactMaterialName, ContactMaterial>();

  constructor(readonly sampleGround: GroundSampler, cellSize = 24) {
    this.cellSize = Math.max(2, cellSize);
  }

  addBox(center: THREE.Vector3, halfExtents: THREE.Vector3, materialName: ContactMaterialName): StaticCollider {
    const collider: StaticCollider = {
      id: this.colliders.length,
      minimum: center.clone().sub(halfExtents),
      maximum: center.clone().add(halfExtents),
      material: contactMaterial(materialName),
      wetness: 0,
      enabled: true,
    };
    this.colliders.push(collider);
    const minX = Math.floor(collider.minimum.x / this.cellSize);
    const maxX = Math.floor(collider.maximum.x / this.cellSize);
    const minZ = Math.floor(collider.minimum.z / this.cellSize);
    const maxZ = Math.floor(collider.maximum.z / this.cellSize);
    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = `${x}:${z}`;
        const entries = this.cells.get(key);
        if (entries) entries.push(collider.id);
        else this.cells.set(key, [collider.id]);
      }
    }
    return collider;
  }

  addOrientedBox(center: THREE.Vector3, halfExtents: THREE.Vector3, rotationY: number, materialName: ContactMaterialName): StaticCollider {
    const cos = Math.abs(Math.cos(rotationY));
    const sin = Math.abs(Math.sin(rotationY));
    const broadExtents = new THREE.Vector3(cos * halfExtents.x + sin * halfExtents.z, halfExtents.y, sin * halfExtents.x + cos * halfExtents.z);
    const collider = this.addBox(center, broadExtents, materialName);
    collider.center = center.clone();
    collider.halfExtents = halfExtents.clone();
    collider.rotationY = rotationY;
    return collider;
  }

  query(minX: number, maxX: number, minZ: number, maxZ: number): readonly StaticCollider[] {
    this.queryIds.clear();
    this.candidates.length = 0;
    const fromX = Math.floor(minX / this.cellSize);
    const toX = Math.floor(maxX / this.cellSize);
    const fromZ = Math.floor(minZ / this.cellSize);
    const toZ = Math.floor(maxZ / this.cellSize);
    for (let x = fromX; x <= toX; x++) {
      for (let z = fromZ; z <= toZ; z++) {
        const entries = this.cells.get(`${x}:${z}`);
        if (!entries) continue;
        for (const id of entries) {
          if (this.queryIds.has(id)) continue;
          this.queryIds.add(id);
          const collider = this.colliders[id];
          if (!collider.enabled) continue;
          if (collider.maximum.x < minX || collider.minimum.x > maxX) continue;
          if (collider.maximum.z < minZ || collider.minimum.z > maxZ) continue;
          this.candidates.push(collider);
        }
      }
    }
    return this.candidates;
  }

  sphereGround(center: THREE.Vector3, radius: number, result: Contact): boolean {
    this.sampleGround(center.x, center.z, this.sample);
    const penetration = this.sample.height + radius - center.y;
    if (penetration <= 0) return false;
    result.penetration = penetration;
    result.normal.copy(this.sample.normal);
    safeNormalize(result.normal, this.upward);
    result.point.copy(center).addScaledVector(result.normal, -radius);
    result.point.y = this.sample.height;
    result.material = this.groundMaterial(this.sample.material);
    result.wetness = this.sample.wetness;
    result.colliderId = -1;
    return true;
  }

  sphereBox(center: THREE.Vector3, radius: number, collider: StaticCollider, result: Contact): boolean {
    if (collider.rotationY && collider.center && collider.halfExtents) {
      this.localCenter.copy(center).sub(collider.center).applyAxisAngle(this.upward, -collider.rotationY);
      this.localCollider.minimum.copy(collider.halfExtents).negate();
      this.localCollider.maximum.copy(collider.halfExtents);
      this.localCollider.material = collider.material;
      this.localCollider.wetness = collider.wetness;
      this.localCollider.id = collider.id;
      if (!this.sphereBox(this.localCenter, radius, this.localCollider, result)) return false;
      result.normal.applyAxisAngle(this.upward, collider.rotationY);
      result.point.applyAxisAngle(this.upward, collider.rotationY).add(collider.center);
      return true;
    }
    this.closest.set(
      clamp(center.x, collider.minimum.x, collider.maximum.x),
      clamp(center.y, collider.minimum.y, collider.maximum.y),
      clamp(center.z, collider.minimum.z, collider.maximum.z),
    );
    this.delta.copy(center).sub(this.closest);
    const distanceSquared = this.delta.lengthSq();
    if (distanceSquared >= radius * radius) return false;
    if (distanceSquared > EPSILON) {
      const distance = Math.sqrt(distanceSquared);
      result.normal.copy(this.delta).multiplyScalar(1 / distance);
      result.penetration = radius - distance;
      result.point.copy(this.closest);
    } else {
      const faces = [
        center.x - collider.minimum.x,
        collider.maximum.x - center.x,
        center.y - collider.minimum.y,
        collider.maximum.y - center.y,
        center.z - collider.minimum.z,
        collider.maximum.z - center.z,
      ];
      let nearest = 0;
      for (let i = 1; i < faces.length; i++) if (faces[i] < faces[nearest]) nearest = i;
      result.normal.set(0, 0, 0);
      const direction = nearest % 2 === 0 ? -1 : 1;
      if (nearest < 2) result.normal.x = direction;
      else if (nearest < 4) result.normal.y = direction;
      else result.normal.z = direction;
      result.penetration = radius + faces[nearest];
      result.point.copy(center).addScaledVector(result.normal, faces[nearest]);
    }
    result.material = collider.material;
    result.wetness = collider.wetness;
    result.colliderId = collider.id;
    return true;
  }

  boxBox(center: THREE.Vector3, halfExtents: THREE.Vector3, collider: StaticCollider, result: Contact): boolean {
    const overlapX = Math.min(center.x + halfExtents.x, collider.maximum.x) - Math.max(center.x - halfExtents.x, collider.minimum.x);
    if (overlapX <= 0) return false;
    const overlapY = Math.min(center.y + halfExtents.y, collider.maximum.y) - Math.max(center.y - halfExtents.y, collider.minimum.y);
    if (overlapY <= 0) return false;
    const overlapZ = Math.min(center.z + halfExtents.z, collider.maximum.z) - Math.max(center.z - halfExtents.z, collider.minimum.z);
    if (overlapZ <= 0) return false;
    result.normal.set(0, 0, 0);
    result.penetration = overlapY;
    result.normal.y = center.y >= (collider.minimum.y + collider.maximum.y) / 2 ? 1 : -1;
    if (overlapX < result.penetration) {
      result.penetration = overlapX;
      result.normal.set(center.x >= (collider.minimum.x + collider.maximum.x) / 2 ? 1 : -1, 0, 0);
    }
    if (overlapZ < result.penetration) {
      result.penetration = overlapZ;
      result.normal.set(0, 0, center.z >= (collider.minimum.z + collider.maximum.z) / 2 ? 1 : -1);
    }
    result.point.set(
      clamp(center.x, collider.minimum.x, collider.maximum.x),
      clamp(center.y, collider.minimum.y, collider.maximum.y),
      clamp(center.z, collider.minimum.z, collider.maximum.z),
    );
    result.material = collider.material;
    result.wetness = collider.wetness;
    result.colliderId = collider.id;
    return true;
  }

  raycastDown(x: number, y: number, z: number, maxDistance: number, result: RayHit): RayHit {
    result.hit = false;
    result.distance = maxDistance;
    this.sampleGround(x, z, this.sample);
    if (y >= this.sample.height && y - this.sample.height <= maxDistance) {
      result.hit = true;
      result.distance = y - this.sample.height;
      result.point.set(x, this.sample.height, z);
      result.normal.copy(this.sample.normal);
      result.material = this.groundMaterial(this.sample.material);
      result.colliderId = -1;
    }
    const candidates = this.query(x, x, z, z);
    for (const collider of candidates) {
      if (x < collider.minimum.x || x > collider.maximum.x) continue;
      if (z < collider.minimum.z || z > collider.maximum.z) continue;
      if (collider.rotationY && collider.center && collider.halfExtents) {
        this.localCenter.set(x, collider.center.y, z).sub(collider.center).applyAxisAngle(this.upward, -collider.rotationY);
        if (Math.abs(this.localCenter.x) > collider.halfExtents.x || Math.abs(this.localCenter.z) > collider.halfExtents.z) continue;
      }
      const distance = y - collider.maximum.y;
      if (distance < 0 || distance > result.distance) continue;
      result.hit = true;
      result.distance = distance;
      result.point.set(x, collider.maximum.y, z);
      result.normal.set(0, 1, 0);
      result.material = collider.material;
      result.colliderId = collider.id;
    }
    return result;
  }

  raycast(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number, result: RayHit): RayHit {
    result.hit = false;
    result.distance = maxDistance;
    const endX = origin.x + direction.x * maxDistance;
    const endZ = origin.z + direction.z * maxDistance;
    const candidates = this.query(Math.min(origin.x, endX), Math.max(origin.x, endX), Math.min(origin.z, endZ), Math.max(origin.z, endZ));
    for (const collider of candidates) {
      let near = 0;
      let far = result.distance;
      let hitAxis = 1;
      let hitSign = 1;
      let rejected = false;
      for (let axis = 0; axis < 3; axis++) {
        const from = origin.getComponent(axis);
        const dir = direction.getComponent(axis);
        const minimum = collider.minimum.getComponent(axis);
        const maximum = collider.maximum.getComponent(axis);
        if (Math.abs(dir) < EPSILON) {
          if (from < minimum || from > maximum) { rejected = true; break; }
          continue;
        }
        let enter = (minimum - from) / dir;
        let leave = (maximum - from) / dir;
        let sign = -1;
        if (enter > leave) {
          const temporary = enter;
          enter = leave;
          leave = temporary;
          sign = 1;
        }
        if (enter > near) {
          near = enter;
          hitAxis = axis;
          hitSign = sign;
        }
        far = Math.min(far, leave);
        if (near > far) { rejected = true; break; }
      }
      if (rejected || near < 0 || near > result.distance) continue;
      result.hit = true;
      result.distance = near;
      result.point.copy(origin).addScaledVector(direction, near);
      result.normal.set(0, 0, 0).setComponent(hitAxis, hitSign);
      result.material = collider.material;
      result.colliderId = collider.id;
    }
    if (direction.y < -EPSILON) {
      const roughDistance = maxDistance / 16;
      let previousDistance = 0;
      for (let index = 1; index <= 16; index++) {
        const distance = Math.min(result.distance, index * roughDistance);
        const x = origin.x + direction.x * distance;
        const y = origin.y + direction.y * distance;
        const z = origin.z + direction.z * distance;
        this.sampleGround(x, z, this.sample);
        if (y <= this.sample.height) {
          let low = previousDistance;
          let high = distance;
          for (let refinement = 0; refinement < 5; refinement++) {
            const middle = (low + high) / 2;
            this.sampleGround(origin.x + direction.x * middle, origin.z + direction.z * middle, this.sample);
            if (origin.y + direction.y * middle > this.sample.height) low = middle;
            else high = middle;
          }
          if (high < result.distance) {
            result.hit = true;
            result.distance = high;
            result.point.copy(origin).addScaledVector(direction, high);
            result.normal.copy(this.sample.normal);
            result.material = this.groundMaterial(this.sample.material);
            result.colliderId = -1;
          }
          break;
        }
        previousDistance = distance;
        if (distance >= result.distance) break;
      }
    }
    return result;
  }

  shelteredFromWind(point: THREE.Vector3, wind: THREE.Vector3, distance = 18): number {
    this.delta.copy(wind);
    if (this.delta.lengthSq() < EPSILON) return 0;
    this.delta.normalize().negate();
    this.raycast(point, this.delta, distance, this.scratchHit);
    if (!this.scratchHit.hit) return 0;
    return 1 - clamp(this.scratchHit.distance / distance, 0, 1);
  }

  clear(): void {
    this.colliders.length = 0;
    this.cells.clear();
    this.queryIds.clear();
    this.candidates.length = 0;
  }

  groundMaterial(name: ContactMaterialName): ContactMaterial {
    let material = this.groundMaterialCache.get(name);
    if (!material) {
      material = contactMaterial(name);
      this.groundMaterialCache.set(name, material);
    }
    return material;
  }
}
