import * as THREE from "three";
import { AIR_DENSITY, clamp, GRAVITY } from "./math";
import type { WindSampler } from "./world";

export type BranchRoot = { x: number; y: number; z: number; height: number; crownArea: number; stiffness: number; mass: number };
export type BranchState = { bendX: number; bendZ: number; velocityX: number; velocityZ: number; tipX: number; tipZ: number; strain: number };

export class BranchDynamics {
  readonly states: BranchState[];
  private readonly wind = new THREE.Vector3();
  private readonly rotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly relative = new THREE.Vector3();
  private readonly rootPosition = new THREE.Vector3();
  private readonly rotationMatrix = new THREE.Matrix4();
  private readonly translationMatrix = new THREE.Matrix4();
  private readonly snowMass: Float32Array;
  private readonly leafAreas: Float32Array;

  constructor(readonly roots: readonly BranchRoot[]) {
    this.states = roots.map(() => ({ bendX: 0, bendZ: 0, velocityX: 0, velocityZ: 0, tipX: 0, tipZ: 0, strain: 0 }));
    this.snowMass = new Float32Array(roots.length);
    this.leafAreas = new Float32Array(roots.length).fill(1);
  }

  setCanopy(index: number, leafFraction: number, snowDepth: number): void {
    this.leafAreas[index] = clamp(leafFraction, 0.05, 1);
    this.snowMass[index] = clamp(snowDepth, 0, 0.2) * this.roots[index].crownArea * 80;
  }

  step(dt: number, seconds: number, sampleWind: WindSampler): void {
    for (let index = 0; index < this.roots.length; index++) {
      const root = this.roots[index];
      const state = this.states[index];
      sampleWind(root.x, root.y + root.height, root.z, seconds, this.wind);
      const speed = Math.hypot(this.wind.x, this.wind.z);
      const drag = 0.5 * AIR_DENSITY * root.crownArea * this.leafAreas[index] * 0.8 * speed;
      const lever = root.height * 0.68;
      const effectiveMass = root.mass + this.snowMass[index];
      const inertia = Math.max(0.04, effectiveMass * root.height * root.height / 3);
      const stiffness = root.stiffness * (1 + Math.abs(state.bendX) * 2 + Math.abs(state.bendZ) * 2);
      const damping = 2 * Math.sqrt(stiffness * inertia) * 0.36;
      const snowTorqueX = -Math.sin(state.bendX) * this.snowMass[index] * GRAVITY * lever;
      const snowTorqueZ = -Math.sin(state.bendZ) * this.snowMass[index] * GRAVITY * lever;
      const torqueX = this.wind.z * drag * lever - stiffness * state.bendX - damping * state.velocityX + snowTorqueX;
      const torqueZ = -this.wind.x * drag * lever - stiffness * state.bendZ - damping * state.velocityZ + snowTorqueZ;
      state.velocityX = clamp(state.velocityX + torqueX / inertia * dt, -1.2, 1.2);
      state.velocityZ = clamp(state.velocityZ + torqueZ / inertia * dt, -1.2, 1.2);
      state.bendX = clamp(state.bendX + state.velocityX * dt, -0.3, 0.3);
      state.bendZ = clamp(state.bendZ + state.velocityZ * dt, -0.3, 0.3);
      state.tipX = -Math.sin(state.bendZ) * root.height;
      state.tipZ = Math.sin(state.bendX) * root.height;
      state.strain = Math.hypot(state.bendX, state.bendZ) / 0.3;
    }
  }

  transformPoint(index: number, point: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const root = this.roots[index];
    const state = this.states[index];
    const heightFactor = clamp((point.y - root.y) / Math.max(0.1, root.height), 0, 1.3);
    const bendFactor = heightFactor * heightFactor;
    target.copy(point);
    target.x += state.tipX * bendFactor;
    target.z += state.tipZ * bendFactor;
    target.y -= root.height * (1 - Math.cos(Math.hypot(state.bendX, state.bendZ))) * heightFactor * 0.5;
    return target;
  }

  transformMatrix(index: number, source: THREE.Matrix4, target: THREE.Matrix4, height = 1): THREE.Matrix4 {
    const root = this.roots[index];
    const state = this.states[index];
    this.euler.set(state.bendX * height, 0, state.bendZ * height);
    this.rotation.setFromEuler(this.euler);
    this.rootPosition.set(root.x, root.y, root.z);
    target.makeTranslation(-root.x, -root.y, -root.z);
    target.premultiply(this.rotationMatrix.makeRotationFromQuaternion(this.rotation));
    target.premultiply(this.translationMatrix.makeTranslation(root.x, root.y, root.z));
    target.multiply(source);
    return target;
  }

  angularVelocityAt(index: number, point: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
    const root = this.roots[index];
    const state = this.states[index];
    this.relative.set(point.x - root.x, point.y - root.y, point.z - root.z);
    target.set(state.velocityX, 0, state.velocityZ);
    return target.cross(this.relative);
  }

  reset(): void {
    for (const state of this.states) {
      state.bendX = 0;
      state.bendZ = 0;
      state.velocityX = 0;
      state.velocityZ = 0;
      state.tipX = 0;
      state.tipZ = 0;
      state.strain = 0;
    }
    this.snowMass.fill(0);
    this.leafAreas.fill(1);
  }
}
