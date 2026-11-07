import * as THREE from "three";
import { createRayHit, StaticCollisionWorld } from "./colliders";
import type { RigidBody } from "./body";
import { EPSILON } from "./math";

export class ContinuousContactGuard {
  private readonly direction = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly offsets = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly hit = createRayHit();
  private readonly bestNormal = new THREE.Vector3();
  private readonly lateral = new THREE.Vector3();
  private readonly vertical = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly localNormal = new THREE.Vector3();
  private readonly inverseRotation = new THREE.Quaternion();

  constructor(readonly collisions: StaticCollisionWorld) {}

  constrain(body: RigidBody): void {
    if (!body.enabled || body.sleeping) return;
    this.direction.copy(body.position).sub(body.previousPosition);
    const travel = this.direction.length();
    const minimumExtent = body.shape.kind === "sphere" ? body.shape.radius : Math.min(body.shape.halfExtents.x, body.shape.halfExtents.y, body.shape.halfExtents.z);
    if (travel < 0.00001) return;
    this.direction.multiplyScalar(1 / travel);
    this.lateral.crossVectors(this.direction, this.up);
    if (this.lateral.lengthSq() < EPSILON) this.lateral.set(1, 0, 0);
    else this.lateral.normalize();
    this.vertical.crossVectors(this.lateral, this.direction).normalize();
    const radius = Math.max(0.004, minimumExtent * 0.85);
    this.offsets[0].set(0, 0, 0);
    this.offsets[1].copy(this.lateral).multiplyScalar(radius);
    this.offsets[2].copy(this.lateral).multiplyScalar(-radius);
    this.offsets[3].copy(this.vertical).multiplyScalar(radius);
    this.offsets[4].copy(this.vertical).multiplyScalar(-radius);
    let permitted = travel;
    let found = false;
    for (const offset of this.offsets) {
      this.origin.copy(body.previousPosition).add(offset);
      this.collisions.raycast(this.origin, this.direction, travel + body.boundingRadius, this.hit);
      if (!this.hit.hit) continue;
      if (!body.groundCollision && this.hit.colliderId < 0) continue;
      const closing = -this.direction.dot(this.hit.normal);
      if (closing < 0.00001) continue;
      const support = this.supportRadius(body, this.hit.normal);
      const supportFromRay = support + offset.dot(this.hit.normal);
      const distance = Math.max(0, this.hit.distance - (supportFromRay - 0.0005) / closing);
      if (distance >= permitted) continue;
      permitted = distance;
      this.bestNormal.copy(this.hit.normal);
      found = true;
    }
    if (!found) return;
    const blockedTravel = (travel - permitted) * Math.max(0, -this.direction.dot(this.bestNormal));
    body.position.addScaledVector(this.bestNormal, blockedTravel);
    // Leave a sub-millimetre contact for the manifold solver to handle restitution and friction together.
    if (this.bestNormal.y > 0.6) body.supported = true;
  }

  private supportRadius(body: RigidBody, normal: THREE.Vector3): number {
    if (body.shape.kind === "sphere") return body.shape.radius;
    const half = body.shape.halfExtents;
    this.inverseRotation.copy(body.rotation).conjugate();
    this.localNormal.copy(normal).applyQuaternion(this.inverseRotation);
    const current = Math.abs(this.localNormal.x) * half.x + Math.abs(this.localNormal.y) * half.y + Math.abs(this.localNormal.z) * half.z;
    this.inverseRotation.copy(body.previousRotation).conjugate();
    this.localNormal.copy(normal).applyQuaternion(this.inverseRotation);
    const previous = Math.abs(this.localNormal.x) * half.x + Math.abs(this.localNormal.y) * half.y + Math.abs(this.localNormal.z) * half.z;
    return Math.max(current, previous);
  }
}
