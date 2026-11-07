import * as THREE from "three";
import { EPSILON, clamp } from "./math";
import type { Contact } from "./colliders";

export type OrientedBox = { center: THREE.Vector3; halfExtents: THREE.Vector3; rotation: THREE.Quaternion };

const axesA = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const axesB = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const axis = new THREE.Vector3();
const centerDelta = new THREE.Vector3();
const candidatePointA = new THREE.Vector3();
const candidatePointB = new THREE.Vector3();
const localPoint = new THREE.Vector3();
const inverseRotation = new THREE.Quaternion();
const rotationMatrixA = new THREE.Matrix4();
const rotationMatrixB = new THREE.Matrix4();

function boxAxes(box: OrientedBox, target: THREE.Vector3[], matrix: THREE.Matrix4): void {
  matrix.makeRotationFromQuaternion(box.rotation);
  const e = matrix.elements;
  target[0].set(e[0], e[1], e[2]);
  target[1].set(e[4], e[5], e[6]);
  target[2].set(e[8], e[9], e[10]);
}

function projectedRadius(box: OrientedBox, axes: THREE.Vector3[], direction: THREE.Vector3): number {
  return box.halfExtents.x * Math.abs(axes[0].dot(direction))
    + box.halfExtents.y * Math.abs(axes[1].dot(direction))
    + box.halfExtents.z * Math.abs(axes[2].dot(direction));
}

function supportPoint(box: OrientedBox, direction: THREE.Vector3, target: THREE.Vector3): THREE.Vector3 {
  inverseRotation.copy(box.rotation).invert();
  localPoint.copy(direction).applyQuaternion(inverseRotation);
  target.set(
    localPoint.x >= 0 ? box.halfExtents.x : -box.halfExtents.x,
    localPoint.y >= 0 ? box.halfExtents.y : -box.halfExtents.y,
    localPoint.z >= 0 ? box.halfExtents.z : -box.halfExtents.z,
  );
  return target.applyQuaternion(box.rotation).add(box.center);
}

export function orientedBoxContact(a: OrientedBox, b: OrientedBox, result: Contact): boolean {
  boxAxes(a, axesA, rotationMatrixA);
  boxAxes(b, axesB, rotationMatrixB);
  centerDelta.copy(a.center).sub(b.center);
  let smallestOverlap = Infinity;
  const test = (direction: THREE.Vector3): boolean => {
    const lengthSquared = direction.lengthSq();
    if (lengthSquared < EPSILON) return true;
    axis.copy(direction).multiplyScalar(1 / Math.sqrt(lengthSquared));
    const radius = projectedRadius(a, axesA, axis) + projectedRadius(b, axesB, axis);
    const separation = Math.abs(centerDelta.dot(axis));
    const overlap = radius - separation;
    if (overlap <= 0) return false;
    if (overlap < smallestOverlap) {
      smallestOverlap = overlap;
      result.normal.copy(axis);
      if (centerDelta.dot(result.normal) < 0) result.normal.negate();
    }
    return true;
  };
  for (let index = 0; index < 3; index++) {
    if (!test(axesA[index])) return false;
    if (!test(axesB[index])) return false;
  }
  const cross = new THREE.Vector3();
  for (let first = 0; first < 3; first++) {
    for (let second = 0; second < 3; second++) {
      cross.crossVectors(axesA[first], axesB[second]);
      if (!test(cross)) return false;
    }
  }
  result.penetration = smallestOverlap;
  axis.copy(result.normal).negate();
  supportPoint(a, axis, candidatePointA);
  supportPoint(b, result.normal, candidatePointB);
  result.point.copy(candidatePointA).add(candidatePointB).multiplyScalar(0.5);
  return true;
}

export function sphereOrientedBoxContact(center: THREE.Vector3, radius: number, box: OrientedBox, result: Contact): boolean {
  inverseRotation.copy(box.rotation).invert();
  localPoint.copy(center).sub(box.center).applyQuaternion(inverseRotation);
  candidatePointA.set(
    clamp(localPoint.x, -box.halfExtents.x, box.halfExtents.x),
    clamp(localPoint.y, -box.halfExtents.y, box.halfExtents.y),
    clamp(localPoint.z, -box.halfExtents.z, box.halfExtents.z),
  );
  centerDelta.copy(localPoint).sub(candidatePointA);
  const distanceSquared = centerDelta.lengthSq();
  if (distanceSquared >= radius * radius) return false;
  if (distanceSquared > EPSILON) {
    const distance = Math.sqrt(distanceSquared);
    result.normal.copy(centerDelta).multiplyScalar(1 / distance);
    result.penetration = radius - distance;
  } else {
    const distances = [
      box.halfExtents.x - Math.abs(localPoint.x),
      box.halfExtents.y - Math.abs(localPoint.y),
      box.halfExtents.z - Math.abs(localPoint.z),
    ];
    let nearest = 0;
    if (distances[1] < distances[nearest]) nearest = 1;
    if (distances[2] < distances[nearest]) nearest = 2;
    result.normal.set(0, 0, 0).setComponent(nearest, Math.sign(localPoint.getComponent(nearest)) || 1);
    result.penetration = radius + distances[nearest];
    candidatePointA.copy(localPoint).addScaledVector(result.normal, distances[nearest]);
  }
  result.normal.applyQuaternion(box.rotation);
  result.point.copy(candidatePointA).applyQuaternion(box.rotation).add(box.center);
  return true;
}

export function orientedBoxCorners(box: OrientedBox, target: THREE.Vector3[]): void {
  let cursor = 0;
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        const point = target[cursor] ?? new THREE.Vector3();
        point.set(x * box.halfExtents.x, y * box.halfExtents.y, z * box.halfExtents.z);
        point.applyQuaternion(box.rotation).add(box.center);
        target[cursor++] = point;
      }
    }
  }
}

export function closestPointInOrientedBox(point: THREE.Vector3, box: OrientedBox, target: THREE.Vector3): THREE.Vector3 {
  inverseRotation.copy(box.rotation).invert();
  target.copy(point).sub(box.center).applyQuaternion(inverseRotation);
  target.x = clamp(target.x, -box.halfExtents.x, box.halfExtents.x);
  target.y = clamp(target.y, -box.halfExtents.y, box.halfExtents.y);
  target.z = clamp(target.z, -box.halfExtents.z, box.halfExtents.z);
  return target.applyQuaternion(box.rotation).add(box.center);
}
