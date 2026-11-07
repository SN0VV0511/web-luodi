import * as THREE from "three";
import type { RigidBody } from "./body";
import { clamp } from "./math";
import { tangentBasis } from "./angular-dynamics";

export type HydrostaticResult = {
  submergedVolume: number;
  totalVolume: number;
  fraction: number;
  centre: THREE.Vector3;
  wettedArea: number;
  waterplaneArea: number;
  waterplaneMomentX: number;
  waterplaneMomentZ: number;
  draft: number;
};

export class HydrostaticVolume {
  readonly result: HydrostaticResult = {
    submergedVolume: 0,
    totalVolume: 0,
    fraction: 0,
    centre: new THREE.Vector3(),
    wettedArea: 0,
    waterplaneArea: 0,
    waterplaneMomentX: 0,
    waterplaneMomentZ: 0,
    draft: 0,
  };
  private readonly corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  private readonly clipped = Array.from({ length: 8 }, () => new THREE.Vector3());
  private readonly intersections = Array.from({ length: 24 }, () => new THREE.Vector3());
  private readonly cap = Array.from({ length: 24 }, () => ({ point: new THREE.Vector3(), angle: 0 }));
  private readonly face = Array.from({ length: 4 }, () => new THREE.Vector3());
  private readonly planePoint = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly firstAxis = new THREE.Vector3();
  private readonly secondAxis = new THREE.Vector3();
  private readonly capCentre = new THREE.Vector3();
  private readonly first = new THREE.Vector3();
  private readonly second = new THREE.Vector3();
  private readonly third = new THREE.Vector3();
  private readonly cross = new THREE.Vector3();
  private readonly weightedCentre = new THREE.Vector3();
  private readonly temporary = new THREE.Vector3();
  private intersectionCount = 0;
  private signedVolume = 0;

  sample(body: RigidBody, waterHeight: number, waterNormal: THREE.Vector3): HydrostaticResult {
    this.reset(body.position);
    this.planePoint.set(body.position.x, waterHeight, body.position.z);
    this.normal.copy(waterNormal).normalize();
    if (this.normal.y < 0.2) this.normal.set(0, 1, 0);
    if (body.shape.kind === "sphere") return this.sphere(body, body.shape.radius);
    const half = body.shape.halfExtents;
    this.result.totalVolume = 8 * half.x * half.y * half.z;
    let index = 0;
    let maximumDepth = 0;
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          const corner = this.corners[index++];
          corner.set(x * half.x, y * half.y, z * half.z).applyQuaternion(body.rotation).add(body.position);
          maximumDepth = Math.max(maximumDepth, -this.signedDistance(corner));
        }
      }
    }
    this.result.draft = maximumDepth;
    this.integrateFace(body.position, 0, 1, 3, 2);
    this.integrateFace(body.position, 4, 6, 7, 5);
    this.integrateFace(body.position, 0, 4, 5, 1);
    this.integrateFace(body.position, 2, 3, 7, 6);
    this.integrateFace(body.position, 0, 2, 6, 4);
    this.integrateFace(body.position, 1, 5, 7, 3);
    this.closeWaterplane(body.position);
    const volume = Math.abs(this.signedVolume);
    this.result.submergedVolume = clamp(volume, 0, this.result.totalVolume);
    this.result.fraction = this.result.totalVolume > 0 ? this.result.submergedVolume / this.result.totalVolume : 0;
    if (Math.abs(this.signedVolume) > 1e-12) {
      this.result.centre.copy(this.weightedCentre).multiplyScalar(1 / this.signedVolume).add(body.position);
    }
    return this.result;
  }

  private sphere(body: RigidBody, radius: number): HydrostaticResult {
    const centreDistance = this.signedDistance(body.position);
    const capHeight = clamp(radius - centreDistance, 0, radius * 2);
    const totalVolume = 4 / 3 * Math.PI * radius ** 3;
    const volume = Math.PI * capHeight * capHeight * (radius - capHeight / 3);
    this.result.totalVolume = totalVolume;
    this.result.submergedVolume = volume;
    this.result.fraction = totalVolume > 0 ? volume / totalVolume : 0;
    this.result.wettedArea = 2 * Math.PI * radius * capHeight;
    const waterlineRadiusSquared = Math.max(0, capHeight * (2 * radius - capHeight));
    this.result.waterplaneArea = Math.PI * waterlineRadiusSquared;
    const moment = Math.PI * waterlineRadiusSquared * waterlineRadiusSquared / 4;
    this.result.waterplaneMomentX = moment;
    this.result.waterplaneMomentZ = moment;
    this.result.draft = capHeight;
    if (volume > 1e-12) {
      const upper = -centreDistance;
      const integral = Math.PI * (radius * radius * (upper * upper - radius * radius) * 0.5 - (upper ** 4 - radius ** 4) * 0.25);
      const centreOffset = capHeight >= radius * 2 ? 0 : integral / volume;
      this.result.centre.copy(body.position).addScaledVector(this.normal, centreOffset);
    }
    return this.result;
  }

  private integrateFace(origin: THREE.Vector3, a: number, b: number, c: number, d: number): void {
    this.face[0].copy(this.corners[a]);
    this.face[1].copy(this.corners[b]);
    this.face[2].copy(this.corners[c]);
    this.face[3].copy(this.corners[d]);
    const count = this.clipFace();
    if (count < 3) return;
    for (let index = 1; index < count - 1; index++) {
      this.integrateTriangle(this.clipped[0], this.clipped[index], this.clipped[index + 1], origin, true);
    }
  }

  private clipFace(): number {
    let count = 0;
    let previous = this.face[3];
    let previousDistance = this.signedDistance(previous);
    for (const current of this.face) {
      const currentDistance = this.signedDistance(current);
      const previousInside = previousDistance <= 0;
      const currentInside = currentDistance <= 0;
      if (previousInside !== currentInside) {
        const fraction = previousDistance / (previousDistance - currentDistance);
        this.temporary.lerpVectors(previous, current, clamp(fraction, 0, 1));
        this.clipped[count++].copy(this.temporary);
        this.recordIntersection(this.temporary);
      }
      if (currentInside) this.clipped[count++].copy(current);
      previous = current;
      previousDistance = currentDistance;
    }
    return count;
  }

  private recordIntersection(point: THREE.Vector3): void {
    for (let index = 0; index < this.intersectionCount; index++) {
      if (this.intersections[index].distanceToSquared(point) < 1e-12) return;
    }
    if (this.intersectionCount >= this.intersections.length) return;
    this.intersections[this.intersectionCount++].copy(point);
  }

  private closeWaterplane(origin: THREE.Vector3): void {
    if (this.intersectionCount < 3) return;
    this.capCentre.set(0, 0, 0);
    for (let index = 0; index < this.intersectionCount; index++) this.capCentre.add(this.intersections[index]);
    this.capCentre.multiplyScalar(1 / this.intersectionCount);
    tangentBasis(this.normal, this.firstAxis, this.secondAxis);
    for (let index = 0; index < this.intersectionCount; index++) {
      const item = this.cap[index];
      item.point.copy(this.intersections[index]);
      this.temporary.copy(item.point).sub(this.capCentre);
      item.angle = Math.atan2(this.temporary.dot(this.secondAxis), this.temporary.dot(this.firstAxis));
    }
    for (let index = 1; index < this.intersectionCount; index++) {
      const item = this.cap[index];
      let previous = index - 1;
      while (previous >= 0 && this.cap[previous].angle > item.angle) {
        this.cap[previous + 1] = this.cap[previous];
        previous--;
      }
      this.cap[previous + 1] = item;
    }
    for (let index = 0; index < this.intersectionCount; index++) {
      const a = this.cap[index].point;
      const b = this.cap[(index + 1) % this.intersectionCount].point;
      this.integrateTriangle(this.capCentre, a, b, origin, false);
      this.first.copy(a).sub(this.capCentre);
      this.second.copy(b).sub(this.capCentre);
      const triangleArea = this.cross.crossVectors(this.first, this.second).length() * 0.5;
      this.result.waterplaneArea += triangleArea;
      const x1 = a.x - this.capCentre.x;
      const x2 = b.x - this.capCentre.x;
      const z1 = a.z - this.capCentre.z;
      const z2 = b.z - this.capCentre.z;
      this.result.waterplaneMomentX += triangleArea / 6 * (z1 * z1 + z1 * z2 + z2 * z2);
      this.result.waterplaneMomentZ += triangleArea / 6 * (x1 * x1 + x1 * x2 + x2 * x2);
    }
  }

  private integrateTriangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, origin: THREE.Vector3, wetted: boolean): void {
    this.first.copy(a).sub(origin);
    this.second.copy(b).sub(origin);
    this.third.copy(c).sub(origin);
    this.cross.crossVectors(this.second, this.third);
    const signedVolume = this.first.dot(this.cross) / 6;
    this.signedVolume += signedVolume;
    this.temporary.copy(this.first).add(this.second).add(this.third).multiplyScalar(signedVolume * 0.25);
    this.weightedCentre.add(this.temporary);
    if (wetted) {
      this.first.copy(b).sub(a);
      this.second.copy(c).sub(a);
      this.result.wettedArea += this.cross.crossVectors(this.first, this.second).length() * 0.5;
    }
  }

  private signedDistance(point: THREE.Vector3): number {
    return (point.x - this.planePoint.x) * this.normal.x
      + (point.y - this.planePoint.y) * this.normal.y
      + (point.z - this.planePoint.z) * this.normal.z;
  }

  private reset(position: THREE.Vector3): void {
    this.result.submergedVolume = 0;
    this.result.totalVolume = 0;
    this.result.fraction = 0;
    this.result.centre.copy(position);
    this.result.wettedArea = 0;
    this.result.waterplaneArea = 0;
    this.result.waterplaneMomentX = 0;
    this.result.waterplaneMomentZ = 0;
    this.result.draft = 0;
    this.intersectionCount = 0;
    this.signedVolume = 0;
    this.weightedCentre.set(0, 0, 0);
  }
}
