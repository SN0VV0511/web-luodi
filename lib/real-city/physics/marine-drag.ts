import * as THREE from "three";
import type { RigidBody } from "./body";
import type { HydrostaticResult } from "./hydrostatic-volume";
import type { WaterSample } from "./buoyancy";
import { pointVelocity, inverseInertiaWorld } from "./angular-dynamics";
import { clamp, WATER_DENSITY } from "./math";

export class MarineDrag {
  private readonly relative = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private readonly force = new THREE.Vector3();
  private readonly torque = new THREE.Vector3();
  private readonly inverse = new THREE.Quaternion();
  private readonly previousWaterVelocity = new THREE.Vector3();
  private readonly waterAcceleration = new THREE.Vector3();
  private readonly angularResponse = new THREE.Vector3();
  private initialized = false;
  dragPower = 0;
  slammingForce = 0;
  addedMass = 0;
  private previousSubmerged = 0;

  step(body: RigidBody, hydrostatic: HydrostaticResult, water: WaterSample, dt: number, volumeScale: number): void {
    this.dragPower = 0;
    this.slammingForce = 0;
    if (hydrostatic.submergedVolume <= 0) {
      this.previousSubmerged = 0;
      this.initialized = false;
      return;
    }
    pointVelocity(body, hydrostatic.centre, this.relative);
    this.relative.sub(water.velocity);
    this.inverse.copy(body.rotation).conjugate();
    this.local.copy(this.relative).applyQuaternion(this.inverse);
    const half = body.shape.kind === "box" ? body.shape.halfExtents : body.halfExtents;
    const submerged = hydrostatic.fraction;
    const scale = Math.pow(Math.max(0.01, volumeScale), 2 / 3);
    const areaX = half.y * half.z * 4 * submerged * scale;
    const areaY = half.x * half.z * 4 * Math.sqrt(submerged) * scale;
    const areaZ = half.x * half.y * 4 * submerged * scale;
    const characteristic = Math.max(0.01, body.boundingRadius * 2);
    const speed = this.relative.length();
    const reynolds = Math.max(1, speed * characteristic / 1.05e-6);
    const skinFriction = 0.075 / Math.max(1, (Math.log10(reynolds) - 2) ** 2);
    const shapeDrag = body.shape.kind === "sphere" ? 0.47 : 1.05;
    const coefficient = 0.5 * WATER_DENSITY * shapeDrag;
    this.force.set(
      -coefficient * areaX * this.local.x * Math.abs(this.local.x),
      -coefficient * areaY * this.local.y * Math.abs(this.local.y),
      -coefficient * areaZ * this.local.z * Math.abs(this.local.z),
    );
    this.force.applyQuaternion(body.rotation);
    const skin = 0.5 * WATER_DENSITY * hydrostatic.wettedArea * scale * skinFriction * speed;
    this.force.addScaledVector(this.relative, -skin);
    const maximumImpulseForce = body.mass * speed / Math.max(0.002, dt) * 0.45;
    this.force.clampLength(0, Math.max(0.001, maximumImpulseForce));
    this.dragPower = Math.max(0, -this.force.dot(this.relative));
    body.applyForceAt(this.force, hydrostatic.centre);
    this.rotationalDrag(body, hydrostatic, dt, scale);
    if (!this.initialized) {
      this.previousWaterVelocity.copy(water.velocity);
      this.initialized = true;
    }
    this.waterAcceleration.copy(water.velocity).sub(this.previousWaterVelocity).multiplyScalar(1 / Math.max(0.002, dt));
    this.waterAcceleration.clampLength(0, 3);
    this.previousWaterVelocity.lerp(water.velocity, Math.min(1, dt * 8));
    this.addedMass = WATER_DENSITY * hydrostatic.submergedVolume * volumeScale * (body.shape.kind === "sphere" ? 0.5 : 0.8);
    this.force.copy(this.waterAcceleration).multiplyScalar(this.addedMass * 0.35);
    this.force.clampLength(0, body.mass * 3);
    body.applyForceAt(this.force, hydrostatic.centre);
    const immersionRate = Math.max(0, hydrostatic.submergedVolume - this.previousSubmerged) / Math.max(0.002, dt) * volumeScale;
    const downward = Math.max(0, -this.relative.dot(water.normal));
    const slamming = Math.min(body.mass * 9.80665 * 2, WATER_DENSITY * immersionRate * downward * 0.6);
    if (slamming > 0) {
      this.force.copy(water.normal).multiplyScalar(slamming);
      body.applyForceAt(this.force, hydrostatic.centre);
      this.slammingForce = slamming;
    }
    this.previousSubmerged = hydrostatic.submergedVolume;
  }

  reset(): void {
    this.previousWaterVelocity.set(0, 0, 0);
    this.waterAcceleration.set(0, 0, 0);
    this.previousSubmerged = 0;
    this.initialized = false;
    this.dragPower = 0;
    this.slammingForce = 0;
    this.addedMass = 0;
  }

  private rotationalDrag(body: RigidBody, hydrostatic: HydrostaticResult, dt: number, scale: number): void {
    this.local.copy(body.angularVelocity).applyQuaternion(this.inverse);
    const half = body.shape.kind === "box" ? body.shape.halfExtents : body.halfExtents;
    const coefficient = WATER_DENSITY * hydrostatic.fraction * scale * 0.3;
    const momentX = half.y * half.z * (half.y * half.y + half.z * half.z) ** 1.5;
    const momentY = half.x * half.z * (half.x * half.x + half.z * half.z) ** 1.5;
    const momentZ = half.x * half.y * (half.x * half.x + half.y * half.y) ** 1.5;
    this.torque.set(
      -coefficient * momentX * this.local.x * Math.abs(this.local.x),
      -coefficient * momentY * this.local.y * Math.abs(this.local.y),
      -coefficient * momentZ * this.local.z * Math.abs(this.local.z),
    ).applyQuaternion(body.rotation);
    inverseInertiaWorld(body, this.torque, this.angularResponse);
    const response = this.angularResponse.length() * dt;
    const maximum = body.angularVelocity.length() * 0.4;
    if (response > maximum && response > 0) this.torque.multiplyScalar(clamp(maximum / response, 0, 1));
    body.torque.add(this.torque);
  }
}
