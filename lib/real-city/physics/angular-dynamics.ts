import * as THREE from "three";
import type { RigidBody } from "./body";
import { clamp } from "./math";

const inverseRotation = new THREE.Quaternion();
const local = new THREE.Vector3();
const arm = new THREE.Vector3();
const crossed = new THREE.Vector3();
const angular = new THREE.Vector3();
const direction = new THREE.Vector3();
const increment = new THREE.Quaternion();
const omegaBody = new THREE.Vector3();
const momentumBody = new THREE.Vector3();
const gyroscopic = new THREE.Vector3();

export function inverseInertiaWorld(body: RigidBody, vector: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  inverseRotation.copy(body.rotation).conjugate();
  target.copy(vector).applyQuaternion(inverseRotation);
  target.multiply(body.inverseInertia);
  target.applyQuaternion(body.rotation);
  return target;
}

export function inertiaWorld(body: RigidBody, vector: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  inverseRotation.copy(body.rotation).conjugate();
  target.copy(vector).applyQuaternion(inverseRotation);
  target.set(
    target.x / Math.max(1e-12, body.inverseInertia.x),
    target.y / Math.max(1e-12, body.inverseInertia.y),
    target.z / Math.max(1e-12, body.inverseInertia.z),
  );
  return target.applyQuaternion(body.rotation);
}

export function pointVelocity(body: RigidBody, point: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  arm.copy(point).sub(body.position);
  target.crossVectors(body.angularVelocity, arm);
  return target.add(body.velocity);
}

export function pointImpulseDenominator(body: RigidBody, point: THREE.Vector3, axis: THREE.Vector3): number {
  arm.copy(point).sub(body.position);
  crossed.crossVectors(arm, axis);
  inverseInertiaWorld(body, crossed, angular);
  return body.inverseMass + crossed.dot(angular);
}

export function pointAngularDenominator(body: RigidBody, point: THREE.Vector3, axis: THREE.Vector3): number {
  arm.copy(point).sub(body.position);
  crossed.crossVectors(arm, axis);
  inverseInertiaWorld(body, crossed, angular);
  return crossed.dot(angular);
}

export function applyPointImpulse(body: RigidBody, impulse: THREE.Vector3, point: THREE.Vector3, wake = false): void {
  if (!body.enabled) return;
  body.velocity.addScaledVector(impulse, body.inverseMass);
  arm.copy(point).sub(body.position);
  crossed.crossVectors(arm, impulse);
  inverseInertiaWorld(body, crossed, angular);
  body.angularVelocity.add(angular);
  if (wake) body.wake();
}

export function applyAngularImpulse(body: RigidBody, impulse: THREE.Vector3): void {
  if (!body.enabled) return;
  inverseInertiaWorld(body, impulse, angular);
  body.angularVelocity.add(angular);
}

export function integrateAngularMomentum(body: RigidBody, dt: number): void {
  inverseRotation.copy(body.rotation).conjugate();
  omegaBody.copy(body.angularVelocity).applyQuaternion(inverseRotation);
  momentumBody.set(
    omegaBody.x / Math.max(1e-12, body.inverseInertia.x),
    omegaBody.y / Math.max(1e-12, body.inverseInertia.y),
    omegaBody.z / Math.max(1e-12, body.inverseInertia.z),
  );
  gyroscopic.crossVectors(omegaBody, momentumBody);
  local.copy(body.torque).applyQuaternion(inverseRotation).sub(gyroscopic);
  local.multiply(body.inverseInertia).multiplyScalar(dt);
  const maximumChange = Math.max(0.1, omegaBody.length() * 0.35 + 0.1);
  local.clampLength(0, maximumChange);
  omegaBody.add(local);
  body.angularVelocity.copy(omegaBody).applyQuaternion(body.rotation);
}

export function positionImpulse(body: RigidBody, point: THREE.Vector3, impulse: THREE.Vector3, maximumAngle = 0.08): void {
  body.position.addScaledVector(impulse, body.inverseMass);
  arm.copy(point).sub(body.position);
  crossed.crossVectors(arm, impulse);
  inverseInertiaWorld(body, crossed, angular);
  const angle = angular.length();
  if (angle < 1e-9) return;
  direction.copy(angular).multiplyScalar(1 / angle);
  increment.setFromAxisAngle(direction, Math.min(maximumAngle, angle));
  body.rotation.premultiply(increment).normalize();
}

export function rotationalEnergy(body: RigidBody): number {
  inertiaWorld(body, body.angularVelocity, angular);
  return Math.max(0, 0.5 * angular.dot(body.angularVelocity));
}

export function angularDragTorque(body: RigidBody, density: number, target: THREE.Vector3): THREE.Vector3 {
  inverseRotation.copy(body.rotation).conjugate();
  local.copy(body.angularVelocity).applyQuaternion(inverseRotation);
  const half = body.shape.kind === "box" ? body.shape.halfExtents : body.halfExtents;
  const radiusX = Math.hypot(half.y, half.z);
  const radiusY = Math.hypot(half.x, half.z);
  const radiusZ = Math.hypot(half.x, half.y);
  const areaX = 4 * half.y * half.z;
  const areaY = 4 * half.x * half.z;
  const areaZ = 4 * half.x * half.y;
  const coefficient = Math.max(0, density) * body.dragCoefficient * 0.25;
  target.set(
    -coefficient * areaX * radiusX ** 3 * local.x * Math.abs(local.x),
    -coefficient * areaY * radiusY ** 3 * local.y * Math.abs(local.y),
    -coefficient * areaZ * radiusZ ** 3 * local.z * Math.abs(local.z),
  );
  return target.applyQuaternion(body.rotation);
}

export function gyroscopicPrecession(body: RigidBody, torque: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  inertiaWorld(body, body.angularVelocity, angular);
  const momentumSquared = angular.lengthSq();
  if (momentumSquared < 1e-9) return target.set(0, 0, 0);
  target.crossVectors(angular, torque).multiplyScalar(1 / momentumSquared);
  return target;
}

export function impulseEnergyLimit(body: RigidBody, impulse: THREE.Vector3, maximumEnergy: number): number {
  const linearEnergy = impulse.lengthSq() * body.inverseMass * 0.5;
  if (linearEnergy <= maximumEnergy || linearEnergy <= 0) return 1;
  return clamp(Math.sqrt(Math.max(0, maximumEnergy) / linearEnergy), 0, 1);
}

export function tangentBasis(normal: THREE.Vector3, first: THREE.Vector3, second: THREE.Vector3): void {
  if (Math.abs(normal.x) > Math.abs(normal.z)) {
    const length = Math.hypot(normal.x, normal.y);
    first.set(-normal.y / Math.max(1e-9, length), normal.x / Math.max(1e-9, length), 0);
  } else {
    const length = Math.hypot(normal.y, normal.z);
    first.set(0, -normal.z / Math.max(1e-9, length), normal.y / Math.max(1e-9, length));
  }
  second.crossVectors(normal, first).normalize();
}
