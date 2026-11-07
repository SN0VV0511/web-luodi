import * as THREE from "three";
import type { Contact } from "./colliders";
import type { OrientedBox } from "./oriented-contact";
import { clamp } from "./math";

export type ManifoldPoint = {
  position: THREE.Vector3;
  penetration: number;
  feature: number;
};

export class BoxContactManifold {
  readonly points: ManifoldPoint[] = Array.from({ length: 4 }, () => ({ position: new THREE.Vector3(), penetration: 0, feature: 0 }));
  count = 0;
  private readonly axesA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly axesB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private readonly polygonA = Array.from({ length: 12 }, () => new THREE.Vector3());
  private readonly polygonB = Array.from({ length: 12 }, () => new THREE.Vector3());
  private readonly candidates = Array.from({ length: 12 }, () => ({ position: new THREE.Vector3(), penetration: 0, feature: 0 }));
  private readonly referenceCentre = new THREE.Vector3();
  private readonly incidentCentre = new THREE.Vector3();
  private readonly outward = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly edge = new THREE.Vector3();
  private readonly matrix = new THREE.Matrix4();

  build(a: OrientedBox, b: OrientedBox, contact: Contact): number {
    this.count = 0;
    this.axes(a.rotation, this.axesA);
    this.axes(b.rotation, this.axesB);
    let alignmentA = 0;
    let alignmentB = 0;
    let faceA = 0;
    let faceB = 0;
    for (let axis = 0; axis < 3; axis++) {
      const aAlignment = Math.abs(this.axesA[axis].dot(contact.normal));
      const bAlignment = Math.abs(this.axesB[axis].dot(contact.normal));
      if (aAlignment > alignmentA) {
        alignmentA = aAlignment;
        faceA = axis;
      }
      if (bAlignment > alignmentB) {
        alignmentB = bAlignment;
        faceB = axis;
      }
    }
    if (Math.max(alignmentA, alignmentB) < 0.96) {
      this.points[0].position.copy(contact.point);
      this.points[0].penetration = contact.penetration;
      this.points[0].feature = 60 + faceA * 3 + faceB;
      this.count = 1;
      return 1;
    }
    const referenceIsA = alignmentA > alignmentB + 0.001;
    const reference = referenceIsA ? a : b;
    const incident = referenceIsA ? b : a;
    const referenceAxes = referenceIsA ? this.axesA : this.axesB;
    const incidentAxes = referenceIsA ? this.axesB : this.axesA;
    const referenceFace = referenceIsA ? faceA : faceB;
    this.outward.copy(contact.normal).multiplyScalar(referenceIsA ? -1 : 1);
    const referenceSign = Math.sign(referenceAxes[referenceFace].dot(this.outward)) || 1;
    this.normal.copy(referenceAxes[referenceFace]).multiplyScalar(referenceSign);
    this.referenceCentre.copy(reference.center).addScaledVector(this.normal, reference.halfExtents.getComponent(referenceFace));
    let incidentFace = 0;
    let largest = -Infinity;
    for (let axis = 0; axis < 3; axis++) {
      const projection = Math.abs(incidentAxes[axis].dot(this.normal));
      if (projection > largest) {
        incidentFace = axis;
        largest = projection;
      }
    }
    const incidentSign = incidentAxes[incidentFace].dot(this.normal) > 0 ? -1 : 1;
    this.incidentCentre.copy(incident.center).addScaledVector(incidentAxes[incidentFace], incident.halfExtents.getComponent(incidentFace) * incidentSign);
    const incidentU = (incidentFace + 1) % 3;
    const incidentV = (incidentFace + 2) % 3;
    let polygonCount = 0;
    for (const signs of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.polygonA[polygonCount++].copy(this.incidentCentre)
        .addScaledVector(incidentAxes[incidentU], incident.halfExtents.getComponent(incidentU) * signs[0])
        .addScaledVector(incidentAxes[incidentV], incident.halfExtents.getComponent(incidentV) * signs[1]);
    }
    let source = this.polygonA;
    let target = this.polygonB;
    const referenceU = (referenceFace + 1) % 3;
    const referenceV = (referenceFace + 2) % 3;
    for (const axisIndex of [referenceU, referenceV]) {
      for (const sign of [-1, 1]) {
        this.edge.copy(referenceAxes[axisIndex]).multiplyScalar(sign);
        const limit = this.referenceCentre.dot(this.edge) + reference.halfExtents.getComponent(axisIndex);
        polygonCount = this.clip(source, target, polygonCount, this.edge, limit);
        const swap = source;
        source = target;
        target = swap;
        if (polygonCount === 0) break;
      }
      if (polygonCount === 0) break;
    }
    let candidateCount = 0;
    for (let index = 0; index < polygonCount; index++) {
      const distance = this.delta.copy(source[index]).sub(this.referenceCentre).dot(this.normal);
      if (distance > 0.002) continue;
      const point = this.candidates[candidateCount++];
      point.position.copy(source[index]).addScaledVector(this.normal, -distance * 0.5);
      point.penetration = Math.max(0, -distance);
      point.feature = (referenceIsA ? 100 : 200) + referenceFace * 24 + incidentFace * 8 + index;
    }
    if (candidateCount === 0) {
      this.points[0].position.copy(contact.point);
      this.points[0].penetration = contact.penetration;
      this.points[0].feature = 0;
      this.count = 1;
      return 1;
    }
    this.reduce(candidateCount);
    return this.count;
  }

  private clip(source: THREE.Vector3[], target: THREE.Vector3[], count: number, normal: THREE.Vector3, offset: number): number {
    if (count === 0) return 0;
    let output = 0;
    let previous = source[count - 1];
    let previousDistance = previous.dot(normal) - offset;
    for (let index = 0; index < count; index++) {
      const current = source[index];
      const currentDistance = current.dot(normal) - offset;
      const previousInside = previousDistance <= 0.00001;
      const currentInside = currentDistance <= 0.00001;
      if (previousInside !== currentInside && output < target.length) {
        const fraction = previousDistance / (previousDistance - currentDistance);
        target[output++].lerpVectors(previous, current, clamp(fraction, 0, 1));
      }
      if (currentInside && output < target.length) target[output++].copy(current);
      previous = current;
      previousDistance = currentDistance;
    }
    return output;
  }

  private reduce(candidateCount: number): void {
    if (candidateCount <= 4) {
      for (let index = 0; index < candidateCount; index++) this.copyPoint(this.candidates[index], this.points[index]);
      this.count = candidateCount;
      return;
    }
    let deepest = 0;
    for (let index = 1; index < candidateCount; index++) {
      if (this.candidates[index].penetration > this.candidates[deepest].penetration) deepest = index;
    }
    this.copyPoint(this.candidates[deepest], this.points[0]);
    let farthest = deepest;
    let maximumDistance = -1;
    for (let index = 0; index < candidateCount; index++) {
      const distance = this.candidates[index].position.distanceToSquared(this.points[0].position);
      if (distance > maximumDistance) {
        maximumDistance = distance;
        farthest = index;
      }
    }
    this.copyPoint(this.candidates[farthest], this.points[1]);
    let third = deepest;
    let maximumArea = -1;
    this.edge.copy(this.points[1].position).sub(this.points[0].position);
    for (let index = 0; index < candidateCount; index++) {
      this.delta.copy(this.candidates[index].position).sub(this.points[0].position);
      const area = this.outward.crossVectors(this.edge, this.delta).lengthSq();
      if (area > maximumArea) {
        maximumArea = area;
        third = index;
      }
    }
    this.copyPoint(this.candidates[third], this.points[2]);
    let fourth = deepest;
    let maximumCoverage = -1;
    for (let index = 0; index < candidateCount; index++) {
      if (index === deepest || index === farthest || index === third) continue;
      const candidate = this.candidates[index].position;
      let closest = Infinity;
      for (let selected = 0; selected < 3; selected++) closest = Math.min(closest, candidate.distanceToSquared(this.points[selected].position));
      if (closest > maximumCoverage) {
        maximumCoverage = closest;
        fourth = index;
      }
    }
    this.copyPoint(this.candidates[fourth], this.points[3]);
    this.count = 4;
  }

  private copyPoint(source: ManifoldPoint, target: ManifoldPoint): void {
    target.position.copy(source.position);
    target.penetration = source.penetration;
    target.feature = source.feature;
  }

  private axes(rotation: THREE.Quaternion, target: THREE.Vector3[]): void {
    this.matrix.makeRotationFromQuaternion(rotation);
    const e = this.matrix.elements;
    target[0].set(e[0], e[1], e[2]);
    target[1].set(e[4], e[5], e[6]);
    target[2].set(e[8], e[9], e[10]);
  }
}
