export type Point2 = { x: number; z: number };
export type Point3 = Point2 & { y: number };
export type Bounds2 = { minX: number; maxX: number; minZ: number; maxZ: number };

export const TAU = Math.PI * 2;
export const EPSILON = 1e-6;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function saturate(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function smoothstep(value: number): number {
  const t = saturate(value);
  return t * t * (3 - 2 * t);
}

export function smootherstep(value: number): number {
  const t = saturate(value);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function distanceSquared(a: Point2, b: Point2): number {
  const x = b.x - a.x;
  const z = b.z - a.z;
  return x * x + z * z;
}

export function distance(a: Point2, b: Point2): number {
  return Math.sqrt(distanceSquared(a, b));
}

export function dot(a: Point2, b: Point2): number {
  return a.x * b.x + a.z * b.z;
}

export function cross(a: Point2, b: Point2): number {
  return a.x * b.z - a.z * b.x;
}

export function point(x = 0, z = 0): Point2 {
  return { x, z };
}

export function point3(x = 0, y = 0, z = 0): Point3 {
  return { x, y, z };
}

export function copyPoint(target: Point2, source: Point2): Point2 {
  target.x = source.x;
  target.z = source.z;
  return target;
}

export function setPoint(target: Point2, x: number, z: number): Point2 {
  target.x = x;
  target.z = z;
  return target;
}

export function normalize(target: Point2, x: number, z: number): Point2 {
  const length = Math.hypot(x, z);
  if (length < EPSILON) {
    target.x = 0;
    target.z = 0;
  } else {
    target.x = x / length;
    target.z = z / length;
  }
  return target;
}

export function limitLength(target: Point2, maximum: number): Point2 {
  const lengthSquared = target.x * target.x + target.z * target.z;
  if (lengthSquared > maximum * maximum && lengthSquared > EPSILON) {
    const scale = maximum / Math.sqrt(lengthSquared);
    target.x *= scale;
    target.z *= scale;
  }
  return target;
}

export function approach(current: number, target: number, maximumDelta: number): number {
  return current < target
    ? Math.min(target, current + maximumDelta)
    : Math.max(target, current - maximumDelta);
}

export function damping(current: number, target: number, rate: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-Math.max(0, rate * dt)));
}

export function angleDelta(current: number, target: number): number {
  return positiveModulo(target - current + Math.PI, TAU) - Math.PI;
}

export function approachAngle(current: number, target: number, maximumDelta: number): number {
  return current + clamp(angleDelta(current, target), -maximumDelta, maximumDelta);
}

export function heading(from: Point2, to: Point2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function localPoint(origin: Point2, angle: number, x: number, z: number, target: Point2): Point2 {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  target.x = origin.x + x * cos + z * sin;
  target.z = origin.z + z * cos - x * sin;
  return target;
}

export function localDirection(angle: number, x: number, z: number, target: Point2): Point2 {
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  target.x = x * cos + z * sin;
  target.z = z * cos - x * sin;
  return target;
}

export function inverseLocal(origin: Point2, angle: number, position: Point2, target: Point2): Point2 {
  const dx = position.x - origin.x;
  const dz = position.z - origin.z;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  target.x = dx * cos - dz * sin;
  target.z = dz * cos + dx * sin;
  return target;
}

export function projectOnSegment(position: Point2, a: Point2, b: Point2, result: Point2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const denominator = dx * dx + dz * dz;
  const t = denominator > EPSILON
    ? saturate(((position.x - a.x) * dx + (position.z - a.z) * dz) / denominator)
    : 0;
  result.x = a.x + dx * t;
  result.z = a.z + dz * t;
  return t;
}

export function segmentDistanceSquared(position: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const denominator = dx * dx + dz * dz;
  const t = denominator > EPSILON
    ? saturate(((position.x - a.x) * dx + (position.z - a.z) * dz) / denominator)
    : 0;
  const x = position.x - a.x - dx * t;
  const z = position.z - a.z - dz * t;
  return x * x + z * z;
}

export function segmentsIntersect(a: Point2, b: Point2, c: Point2, d: Point2): boolean {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const cdx = d.x - c.x;
  const cdz = d.z - c.z;
  const determinant = abx * cdz - abz * cdx;
  if (Math.abs(determinant) < EPSILON) return false;
  const acx = c.x - a.x;
  const acz = c.z - a.z;
  const t = (acx * cdz - acz * cdx) / determinant;
  const u = (acx * abz - acz * abx) / determinant;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function segmentIntersectsBounds(a: Point2, b: Point2, bounds: Bounds2, padding = 0): boolean {
  const minimumX = bounds.minX - padding;
  const maximumX = bounds.maxX + padding;
  const minimumZ = bounds.minZ - padding;
  const maximumZ = bounds.maxZ + padding;
  let near = 0;
  let far = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  for (const [start, delta, low, high] of [
    [a.x, dx, minimumX, maximumX],
    [a.z, dz, minimumZ, maximumZ],
  ]) {
    if (Math.abs(delta) < EPSILON) {
      if (start < low || start > high) return false;
      continue;
    }
    const t1 = (low - start) / delta;
    const t2 = (high - start) / delta;
    near = Math.max(near, Math.min(t1, t2));
    far = Math.min(far, Math.max(t1, t2));
    if (near > far) return false;
  }
  return far >= 0 && near <= 1;
}

export function insideBounds(position: Point2, bounds: Bounds2, padding = 0): boolean {
  return position.x >= bounds.minX - padding && position.x <= bounds.maxX + padding
    && position.z >= bounds.minZ - padding && position.z <= bounds.maxZ + padding;
}

export function nearestBoundsPoint(position: Point2, bounds: Bounds2, target: Point2): Point2 {
  target.x = clamp(position.x, bounds.minX, bounds.maxX);
  target.z = clamp(position.z, bounds.minZ, bounds.maxZ);
  return target;
}

export function signedCircleDistance(position: Point2, center: Point2, radius: number): number {
  return distance(position, center) - radius;
}

export function timeToCollision(relativePosition: Point2, relativeVelocity: Point2, radius: number): number {
  const a = dot(relativeVelocity, relativeVelocity);
  const b = 2 * dot(relativePosition, relativeVelocity);
  const c = dot(relativePosition, relativePosition) - radius * radius;
  if (c <= 0) return 0;
  if (a < EPSILON || b >= 0) return Infinity;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return Infinity;
  const earliest = (-b - Math.sqrt(discriminant)) / (2 * a);
  return earliest >= 0 ? earliest : Infinity;
}

export function cubicBezier(t: number, a: Point2, b: Point2, c: Point2, d: Point2, target: Point2): Point2 {
  const s = 1 - t;
  const aa = s * s * s;
  const bb = 3 * s * s * t;
  const cc = 3 * s * t * t;
  const dd = t * t * t;
  target.x = a.x * aa + b.x * bb + c.x * cc + d.x * dd;
  target.z = a.z * aa + b.z * bb + c.z * cc + d.z * dd;
  return target;
}

export function quadraticArc(t: number, start: Point3, end: Point3, apex: number, target: Point3): Point3 {
  const clamped = saturate(t);
  target.x = lerp(start.x, end.x, clamped);
  target.z = lerp(start.z, end.z, clamped);
  target.y = lerp(start.y, end.y, clamped) + 4 * apex * clamped * (1 - clamped);
  return target;
}

export function springStep(position: number, velocity: number, target: number, frequency: number, dampingRatio: number, dt: number): [number, number] {
  const omega = TAU * Math.max(0.01, frequency);
  const acceleration = (target - position) * omega * omega - 2 * dampingRatio * omega * velocity;
  const nextVelocity = velocity + acceleration * dt;
  return [position + nextVelocity * dt, nextVelocity];
}

export function solveTwoBone(hip: Point3, ankle: Point3, upperLength: number, lowerLength: number, bend: Point3, knee: Point3): void {
  const dx = ankle.x - hip.x;
  const dy = ankle.y - hip.y;
  const dz = ankle.z - hip.z;
  const rawLength = Math.hypot(dx, dy, dz);
  const length = clamp(rawLength, Math.abs(upperLength - lowerLength) + 0.0001, upperLength + lowerLength - 0.0001);
  const along = (upperLength * upperLength - lowerLength * lowerLength + length * length) / (2 * length);
  const perpendicular = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const inverse = rawLength > EPSILON ? 1 / rawLength : 0;
  const nx = dx * inverse;
  const ny = dy * inverse;
  const nz = dz * inverse;
  const projection = bend.x * nx + bend.y * ny + bend.z * nz;
  let bx = bend.x - projection * nx;
  let by = bend.y - projection * ny;
  let bz = bend.z - projection * nz;
  const bendLength = Math.hypot(bx, by, bz);
  if (bendLength < EPSILON) {
    bx = -nz;
    by = 0;
    bz = nx;
  } else {
    bx /= bendLength;
    by /= bendLength;
    bz /= bendLength;
  }
  knee.x = hip.x + nx * along + bx * perpendicular;
  knee.y = hip.y + ny * along + by * perpendicular;
  knee.z = hip.z + nz * along + bz * perpendicular;
}

export function finitePoint(position: Point2): boolean {
  return Number.isFinite(position.x) && Number.isFinite(position.z);
}

export function quadraticEaseOut(value: number): number {
  const t = saturate(value);
  return 1 - (1 - t) * (1 - t);
}

export function bell(value: number, center: number, width: number): number {
  const delta = (value - center) / Math.max(width, EPSILON);
  return Math.exp(-delta * delta);
}

export function triangularPulse(value: number, start: number, peak: number, end: number): number {
  if (value <= start || value >= end) return 0;
  return value < peak ? (value - start) / Math.max(EPSILON, peak - start)
    : (end - value) / Math.max(EPSILON, end - peak);
}

export function quantizedKey(position: Point2, resolution = 10): string {
  return `${Math.round(position.x * resolution)}:${Math.round(position.z * resolution)}`;
}

export function chooseMinimum<T>(items: readonly T[], score: (item: T) => number): T | undefined {
  let best: T | undefined;
  let bestScore = Infinity;
  for (const item of items) {
    const value = score(item);
    if (value < bestScore) {
      best = item;
      bestScore = value;
    }
  }
  return best;
}

export function rotateArray<T>(items: T[], offset: number): void {
  if (items.length === 0) return;
  const count = positiveModulo(offset, items.length);
  if (count === 0) return;
  items.push(...items.splice(0, count));
}

export function removeAtSwap<T>(items: T[], index: number): T | undefined {
  if (index < 0 || index >= items.length) return undefined;
  const item = items[index];
  const last = items.pop()!;
  if (index < items.length) items[index] = last;
  return item;
}
