import * as THREE from "three";

export const GRAVITY = 9.80665;
export const EPSILON = 1e-7;
export const AIR_DENSITY = 1.225;
export const WATER_DENSITY = 997;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function saturate(value: number): number {
  return clamp(value, 0, 1);
}

export function smoothstep(minimum: number, maximum: number, value: number): number {
  const t = saturate((value - minimum) / Math.max(EPSILON, maximum - minimum));
  return t * t * (3 - 2 * t);
}

export function exponentialApproach(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-Math.max(0, rate) * dt);
}

export function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

export function deterministicNoise(x: number, z: number, salt = 0): number {
  let value = Math.imul(Math.floor(x), 374761393);
  value += Math.imul(Math.floor(z), 668265263);
  value += Math.imul(salt, 2147483647);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function smoothNoise(x: number, z: number, salt = 0): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = smoothstep(0, 1, x - ix);
  const fz = smoothstep(0, 1, z - iz);
  const a = deterministicNoise(ix, iz, salt);
  const b = deterministicNoise(ix + 1, iz, salt);
  const c = deterministicNoise(ix, iz + 1, salt);
  const d = deterministicNoise(ix + 1, iz + 1, salt);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, fx), THREE.MathUtils.lerp(c, d, fx), fz);
}

export function layeredNoise(x: number, z: number, salt = 0): number {
  return smoothNoise(x, z, salt) * 0.57
    + smoothNoise(x * 2.03 + 3.7, z * 2.03 - 5.1, salt + 1) * 0.28
    + smoothNoise(x * 4.07 - 8.2, z * 4.07 + 2.4, salt + 2) * 0.15;
}

export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function signedAngle(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

export function safeNormalize(vector: THREE.Vector3, fallback: THREE.Vector3): THREE.Vector3 {
  const length = vector.lengthSq();
  if (length < EPSILON || !Number.isFinite(length)) return vector.copy(fallback);
  return vector.multiplyScalar(1 / Math.sqrt(length));
}

export function componentMultiply(target: THREE.Vector3, left: THREE.Vector3, right: THREE.Vector3): THREE.Vector3 {
  return target.set(left.x * right.x, left.y * right.y, left.z * right.z);
}

export function projectedVelocity(velocity: THREE.Vector3, normal: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  return target.copy(velocity).addScaledVector(normal, -velocity.dot(normal));
}

export function closestPointOnSegment(point: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  target.copy(to).sub(from);
  const length = target.lengthSq();
  if (length < EPSILON) return target.copy(from);
  const t = clamp(((point.x - from.x) * target.x + (point.y - from.y) * target.y + (point.z - from.z) * target.z) / length, 0, 1);
  return target.multiplyScalar(t).add(from);
}

export function hermitePosition(from: number, to: number, fromVelocity: number, toVelocity: number, t: number, duration: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * from
    + (t3 - 2 * t2 + t) * fromVelocity * duration
    + (-2 * t3 + 3 * t2) * to
    + (t3 - t2) * toVelocity * duration;
}

export function criticallyDampedStep(position: number, velocity: number, target: number, frequency: number, dt: number): { position: number; velocity: number } {
  const omega = Math.max(0.001, frequency) * Math.PI * 2;
  const displacement = position - target;
  const exponential = Math.exp(-omega * dt);
  const coefficient = velocity + omega * displacement;
  return {
    position: target + (displacement + coefficient * dt) * exponential,
    velocity: (velocity - omega * coefficient * dt) * exponential,
  };
}

export function orientedHalfExtents(halfExtents: THREE.Vector3, rotation: THREE.Quaternion, target: THREE.Vector3, matrix: THREE.Matrix4): THREE.Vector3 {
  matrix.makeRotationFromQuaternion(rotation);
  const e = matrix.elements;
  return target.set(
    Math.abs(e[0]) * halfExtents.x + Math.abs(e[4]) * halfExtents.y + Math.abs(e[8]) * halfExtents.z,
    Math.abs(e[1]) * halfExtents.x + Math.abs(e[5]) * halfExtents.y + Math.abs(e[9]) * halfExtents.z,
    Math.abs(e[2]) * halfExtents.x + Math.abs(e[6]) * halfExtents.y + Math.abs(e[10]) * halfExtents.z,
  );
}

export function finiteVector(vector: THREE.Vector3): boolean {
  return Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z);
}
