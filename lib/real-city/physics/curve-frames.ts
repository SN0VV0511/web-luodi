import * as THREE from "three";
import { clamp } from "./math";

export class ParallelTransportFrames {
  readonly tangents: THREE.Vector3[];
  readonly normals: THREE.Vector3[];
  readonly binormals: THREE.Vector3[];
  readonly arcLength: Float32Array;
  private readonly axis = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly candidate = new THREE.Vector3();
  private readonly reference = new THREE.Vector3();
  private initialized = false;
  totalLength = 0;

  constructor(readonly count: number) {
    this.tangents = Array.from({ length: count }, () => new THREE.Vector3(1, 0, 0));
    this.normals = Array.from({ length: count }, () => new THREE.Vector3(0, 1, 0));
    this.binormals = Array.from({ length: count }, () => new THREE.Vector3(0, 0, 1));
    this.arcLength = new Float32Array(count);
  }

  update(points: readonly THREE.Vector3[], twist = 0): void {
    if (points.length !== this.count || this.count < 2) return;
    this.totalLength = 0;
    this.arcLength[0] = 0;
    for (let index = 0; index < this.count; index++) {
      const before = points[Math.max(0, index - 1)];
      const after = points[Math.min(this.count - 1, index + 1)];
      const tangent = this.tangents[index];
      tangent.copy(after).sub(before);
      if (tangent.lengthSq() < 1e-12) {
        if (index > 0) tangent.copy(this.tangents[index - 1]);
        else tangent.set(1, 0, 0);
      } else tangent.normalize();
      if (index > 0) {
        this.totalLength += points[index].distanceTo(points[index - 1]);
        this.arcLength[index] = this.totalLength;
      }
    }
    const firstTangent = this.tangents[0];
    if (!this.initialized) {
      this.reference.set(Math.abs(firstTangent.x) < 0.7 ? 1 : 0, Math.abs(firstTangent.x) < 0.7 ? 0 : 1, 0);
      this.normals[0].crossVectors(firstTangent, this.reference).normalize();
      this.initialized = true;
    } else {
      this.normals[0].addScaledVector(firstTangent, -this.normals[0].dot(firstTangent));
      if (this.normals[0].lengthSq() < 1e-8) this.normals[0].set(0, 0, 1).cross(firstTangent);
      this.normals[0].normalize();
    }
    this.binormals[0].crossVectors(firstTangent, this.normals[0]).normalize();
    for (let index = 1; index < this.count; index++) {
      const before = this.tangents[index - 1];
      const current = this.tangents[index];
      const normal = this.normals[index];
      this.axis.crossVectors(before, current);
      const sine = this.axis.length();
      const cosine = clamp(before.dot(current), -1, 1);
      normal.copy(this.normals[index - 1]);
      if (sine > 1e-7) {
        this.axis.multiplyScalar(1 / sine);
        this.rotation.setFromAxisAngle(this.axis, Math.atan2(sine, cosine));
        normal.applyQuaternion(this.rotation);
      } else if (cosine < -0.999) {
        this.rotation.setFromAxisAngle(this.binormals[index - 1], Math.PI);
        normal.applyQuaternion(this.rotation);
      }
      normal.addScaledVector(current, -normal.dot(current)).normalize();
      this.binormals[index].crossVectors(current, normal).normalize();
    }
    if (twist !== 0 && this.totalLength > 0) {
      for (let index = 0; index < this.count; index++) {
        const angle = twist * this.arcLength[index] / this.totalLength;
        this.rotation.setFromAxisAngle(this.tangents[index], angle);
        this.normals[index].applyQuaternion(this.rotation);
        this.binormals[index].crossVectors(this.tangents[index], this.normals[index]).normalize();
      }
    }
  }

  offset(index: number, angle: number, radius: number, target: THREE.Vector3): THREE.Vector3 {
    const normal = this.normals[index];
    const binormal = this.binormals[index];
    return target.copy(normal).multiplyScalar(Math.cos(angle) * radius).addScaledVector(binormal, Math.sin(angle) * radius);
  }

  curvature(index: number): number {
    if (index <= 0 || index >= this.count - 1) return 0;
    const distance = Math.max(0.0001, this.arcLength[index + 1] - this.arcLength[index - 1]);
    this.candidate.copy(this.tangents[index + 1]).sub(this.tangents[index - 1]);
    return this.candidate.length() / distance;
  }

  reset(): void {
    this.initialized = false;
    this.totalLength = 0;
    this.arcLength.fill(0);
    for (let index = 0; index < this.count; index++) {
      this.tangents[index].set(1, 0, 0);
      this.normals[index].set(0, 1, 0);
      this.binormals[index].set(0, 0, 1);
    }
  }
}
