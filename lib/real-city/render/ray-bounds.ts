import * as THREE from "three";

export type RayBounds = {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

export function emptyRayBounds(): RayBounds {
  return {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
}

export function rayBoundsDistance(ray: THREE.Ray, bounds: RayBounds, maximum: number): number {
  let minimum = 0;
  let farthest = maximum;
  const ox = ray.origin.x;
  const oy = ray.origin.y;
  const oz = ray.origin.z;
  const dx = ray.direction.x;
  const dy = ray.direction.y;
  const dz = ray.direction.z;
  if (Math.abs(dx) < 1e-12) {
    if (ox < bounds.minX || ox > bounds.maxX) return Infinity;
  } else {
    const first = (bounds.minX - ox) / dx;
    const second = (bounds.maxX - ox) / dx;
    minimum = Math.max(minimum, Math.min(first, second));
    farthest = Math.min(farthest, Math.max(first, second));
    if (minimum > farthest) return Infinity;
  }
  if (Math.abs(dy) < 1e-12) {
    if (oy < bounds.minY || oy > bounds.maxY) return Infinity;
  } else {
    const first = (bounds.minY - oy) / dy;
    const second = (bounds.maxY - oy) / dy;
    minimum = Math.max(minimum, Math.min(first, second));
    farthest = Math.min(farthest, Math.max(first, second));
    if (minimum > farthest) return Infinity;
  }
  if (Math.abs(dz) < 1e-12) {
    if (oz < bounds.minZ || oz > bounds.maxZ) return Infinity;
  } else {
    const first = (bounds.minZ - oz) / dz;
    const second = (bounds.maxZ - oz) / dz;
    minimum = Math.max(minimum, Math.min(first, second));
    farthest = Math.min(farthest, Math.max(first, second));
    if (minimum > farthest) return Infinity;
  }
  return farthest < 0 ? Infinity : minimum;
}

export function setRayBounds(target: RayBounds, box: THREE.Box3): void {
  target.minX = box.min.x;
  target.minY = box.min.y;
  target.minZ = box.min.z;
  target.maxX = box.max.x;
  target.maxY = box.max.y;
  target.maxZ = box.max.z;
}

export function includeRayBounds(target: RayBounds, bounds: RayBounds): void {
  target.minX = Math.min(target.minX, bounds.minX);
  target.minY = Math.min(target.minY, bounds.minY);
  target.minZ = Math.min(target.minZ, bounds.minZ);
  target.maxX = Math.max(target.maxX, bounds.maxX);
  target.maxY = Math.max(target.maxY, bounds.maxY);
  target.maxZ = Math.max(target.maxZ, bounds.maxZ);
}

export function visibleForPicking(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}
