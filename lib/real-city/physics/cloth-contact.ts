import * as THREE from "three";
import { createContact, StaticCollisionWorld } from "./colliders";
import { clamp } from "./math";

export class ClothContactSystem {
  private readonly cells = new Map<string, number[]>();
  private readonly recycled: number[][] = [];
  private readonly contact = createContact();
  private readonly delta = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private frame = 0;
  contacts = 0;
  selfContacts = 0;

  constructor(readonly collisions: StaticCollisionWorld, readonly columns: number, readonly thickness = 0.007) {}

  solve(positions: THREE.Vector3[], previous: THREE.Vector3[], pinned: readonly boolean[], massFactor: Float32Array, dt: number): void {
    this.frame++;
    this.contacts = 0;
    this.selfContacts = 0;
    this.solveStatic(positions, previous, pinned, dt);
    if (this.frame % 2 === 0) this.solveSelf(positions, previous, pinned, massFactor);
  }

  reset(): void {
    this.releaseCells();
    this.frame = 0;
    this.contacts = 0;
    this.selfContacts = 0;
  }

  private solveStatic(positions: THREE.Vector3[], previous: THREE.Vector3[], pinned: readonly boolean[], dt: number): void {
    for (let index = 0; index < positions.length; index++) {
      if (pinned[index]) continue;
      const point = positions[index];
      const old = previous[index];
      if (this.collisions.sphereGround(point, this.thickness, this.contact)) this.resolve(point, old, dt);
      const candidates = this.collisions.query(point.x - this.thickness, point.x + this.thickness, point.z - this.thickness, point.z + this.thickness);
      for (const collider of candidates) {
        if (point.y < collider.minimum.y - this.thickness || point.y > collider.maximum.y + this.thickness) continue;
        if (this.collisions.sphereBox(point, this.thickness, collider, this.contact)) this.resolve(point, old, dt);
      }
    }
  }

  private resolve(point: THREE.Vector3, previous: THREE.Vector3, dt: number): void {
    this.velocity.copy(point).sub(previous);
    const normalSpeed = this.velocity.dot(this.contact.normal);
    point.addScaledVector(this.contact.normal, this.contact.penetration);
    if (normalSpeed < 0) this.velocity.addScaledVector(this.contact.normal, -normalSpeed);
    this.tangent.copy(this.velocity).addScaledVector(this.contact.normal, -this.velocity.dot(this.contact.normal));
    const tangentSpeed = this.tangent.length();
    const friction = this.contact.material.dynamicFriction * (1 - this.contact.wetness * 0.2);
    const maximumReduction = Math.max(0.00001, Math.abs(normalSpeed) + this.contact.penetration * dt) * friction;
    if (tangentSpeed > 0) this.velocity.addScaledVector(this.tangent, -Math.min(1, maximumReduction / tangentSpeed));
    previous.copy(point).sub(this.velocity);
    this.contacts++;
  }

  private solveSelf(positions: THREE.Vector3[], previous: THREE.Vector3[], pinned: readonly boolean[], massFactor: Float32Array): void {
    this.releaseCells();
    const cellSize = this.thickness * 4;
    const inverse = 1 / cellSize;
    for (let index = 0; index < positions.length; index++) {
      const point = positions[index];
      const x = Math.floor(point.x * inverse);
      const y = Math.floor(point.y * inverse);
      const z = Math.floor(point.z * inverse);
      const key = `${x}:${y}:${z}`;
      let bucket = this.cells.get(key);
      if (!bucket) {
        bucket = this.recycled.pop() ?? [];
        this.cells.set(key, bucket);
      }
      bucket.push(index);
    }
    const minimumDistance = this.thickness * 2;
    const minimumSquared = minimumDistance * minimumDistance;
    for (let index = 0; index < positions.length; index++) {
      const point = positions[index];
      const gx = Math.floor(point.x * inverse);
      const gy = Math.floor(point.y * inverse);
      const gz = Math.floor(point.z * inverse);
      const row = Math.floor(index / (this.columns + 1));
      const column = index % (this.columns + 1);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const bucket = this.cells.get(`${gx + dx}:${gy + dy}:${gz + dz}`);
            if (!bucket) continue;
            for (const other of bucket) {
              if (other <= index || (pinned[index] && pinned[other])) continue;
              const otherRow = Math.floor(other / (this.columns + 1));
              const otherColumn = other % (this.columns + 1);
              if (Math.abs(otherRow - row) <= 1 && Math.abs(otherColumn - column) <= 1) continue;
              this.delta.copy(point).sub(positions[other]);
              const squared = this.delta.lengthSq();
              if (squared >= minimumSquared) continue;
              const distance = Math.sqrt(Math.max(1e-12, squared));
              if (squared < 1e-12) this.normal.set(0, 0, index % 2 === 0 ? 1 : -1);
              else this.normal.copy(this.delta).multiplyScalar(1 / distance);
              const firstWeight = pinned[index] ? 0 : massFactor[index];
              const secondWeight = pinned[other] ? 0 : massFactor[other];
              const total = firstWeight + secondWeight;
              if (total <= 0) continue;
              const correction = (minimumDistance - distance) * 0.65;
              point.addScaledVector(this.normal, correction * firstWeight / total);
              positions[other].addScaledVector(this.normal, -correction * secondWeight / total);
              this.velocity.copy(point).sub(previous[index]);
              this.tangent.copy(positions[other]).sub(previous[other]);
              this.velocity.sub(this.tangent);
              const relativeNormal = this.velocity.dot(this.normal);
              if (relativeNormal < 0) {
                const reduction = clamp(-relativeNormal * 0.4, 0, minimumDistance);
                previous[index].addScaledVector(this.normal, -reduction * firstWeight / total);
                previous[other].addScaledVector(this.normal, reduction * secondWeight / total);
              }
              this.selfContacts++;
            }
          }
        }
      }
    }
  }

  private releaseCells(): void {
    for (const bucket of this.cells.values()) {
      bucket.length = 0;
      this.recycled.push(bucket);
    }
    this.cells.clear();
  }
}
