import * as THREE from "three";
import { cityLots, civicLots } from "../../city-map";
import type { CityBuiltSite } from "../contracts";

type CameraVolume = {
  x: number;
  z: number;
  bottom: number;
  top: number;
  halfWidth: number;
  halfDepth: number;
  cosine: number;
  sine: number;
};

type CameraContact = {
  time: number;
  normalX: number;
  normalY: number;
  normalZ: number;
};

export class CityCameraSafety {
  private readonly volumes: CameraVolume[] = [];
  private readonly previous = new THREE.Vector3();
  private readonly start = new THREE.Vector3();
  private readonly remaining = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly contact: CameraContact = { time: 1, normalX: 0, normalY: 1, normalZ: 0 };
  private initialized = false;
  private readonly radius = 0.42;

  constructor(sites: readonly CityBuiltSite[]) {
    for (const site of sites) {
      this.volumes.push({
        x: site.x,
        z: site.z,
        bottom: site.baseY,
        top: site.baseY + site.height,
        halfWidth: site.width * 0.5,
        halfDepth: site.depth * 0.5,
        cosine: Math.cos(site.rotationY),
        sine: Math.sin(site.rotationY),
      });
    }
    for (const lot of cityLots) this.addBox(lot.x, lot.z, lot.width, lot.depth, lot.height);
    for (const lot of civicLots) {
      if (lot.kind === "stadium") continue;
      this.addBox(lot.x, lot.z, lot.kind === "school" ? 27 : 24, 21, lot.kind === "city-hall" ? 15 : 10);
    }
  }

  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, allowInterior: boolean): boolean {
    if (!this.initialized || allowInterior) {
      this.previous.copy(camera.position);
      this.initialized = true;
      this.updateClipPlanes(camera, target);
      return false;
    }
    this.start.copy(this.previous);
    this.remaining.copy(camera.position).sub(this.previous);
    let changed = false;
    if (this.remaining.lengthSq() > 0.000001 && this.remaining.lengthSq() < 10000) {
      for (let iteration = 0; iteration < 3; iteration++) {
        const hit = this.findCollision(this.start, this.remaining);
        if (!hit) {
          this.start.add(this.remaining);
          this.remaining.set(0, 0, 0);
          break;
        }
        const safeTime = Math.max(0, hit.time - 0.001);
        this.start.addScaledVector(this.remaining, safeTime);
        this.remaining.multiplyScalar(1 - safeTime);
        this.normal.set(hit.normalX, hit.normalY, hit.normalZ);
        const inward = this.remaining.dot(this.normal);
        if (inward < 0) this.remaining.addScaledVector(this.normal, -inward);
        this.start.addScaledVector(this.normal, 0.004);
        changed = true;
        if (this.remaining.lengthSq() < 0.00001) break;
      }
      camera.position.copy(this.start);
    }
    const minimumY = this.groundHeight(camera.position.x, camera.position.z) + 0.65;
    if (camera.position.y < minimumY) {
      camera.position.y = minimumY;
      changed = true;
    }
    for (const volume of this.volumes) {
      if (this.resolvePenetration(camera.position, volume)) changed = true;
    }
    this.previous.copy(camera.position);
    if (changed) camera.lookAt(target);
    this.updateClipPlanes(camera, target);
    return changed;
  }

  reset(position: THREE.Vector3): void {
    this.previous.copy(position);
    this.initialized = true;
  }

  private addBox(x: number, z: number, width: number, depth: number, height: number): void {
    this.volumes.push({ x, z, bottom: 0.4, top: height + 0.4, halfWidth: width * 0.5, halfDepth: depth * 0.5, cosine: 1, sine: 0 });
  }

  private findCollision(start: THREE.Vector3, delta: THREE.Vector3): CameraContact | null {
    let found = false;
    this.contact.time = 1;
    for (const volume of this.volumes) {
      const dx = start.x - volume.x;
      const dz = start.z - volume.z;
      const originX = dx * volume.cosine - dz * volume.sine;
      const originZ = dx * volume.sine + dz * volume.cosine;
      const velocityX = delta.x * volume.cosine - delta.z * volume.sine;
      const velocityZ = delta.x * volume.sine + delta.z * volume.cosine;
      const extentX = volume.halfWidth + this.radius;
      const extentZ = volume.halfDepth + this.radius;
      const bottom = volume.bottom - this.radius;
      const top = volume.top + this.radius;
      if (Math.abs(originX) < extentX && Math.abs(originZ) < extentZ && start.y > bottom && start.y < top) continue;
      let enter = 0;
      let exit = 1;
      let normalX = 0;
      let normalY = 0;
      let normalZ = 0;
      let misses = false;
      for (let axis = 0; axis < 3; axis++) {
        const origin = axis === 0 ? originX : axis === 1 ? start.y : originZ;
        const velocity = axis === 0 ? velocityX : axis === 1 ? delta.y : velocityZ;
        const minimum = axis === 0 ? -extentX : axis === 1 ? bottom : -extentZ;
        const maximum = axis === 0 ? extentX : axis === 1 ? top : extentZ;
        if (Math.abs(velocity) < 1e-9) {
          if (origin < minimum || origin > maximum) misses = true;
          continue;
        }
        const a = (minimum - origin) / velocity;
        const b = (maximum - origin) / velocity;
        const near = Math.min(a, b);
        const far = Math.max(a, b);
        if (near > enter) {
          enter = near;
          const sign = velocity > 0 ? -1 : 1;
          normalX = axis === 0 ? sign : 0;
          normalY = axis === 1 ? sign : 0;
          normalZ = axis === 2 ? sign : 0;
        }
        exit = Math.min(exit, far);
        if (enter > exit) misses = true;
      }
      if (misses || enter < 0 || enter > this.contact.time || exit < 0) continue;
      this.contact.time = enter;
      this.contact.normalX = normalX * volume.cosine + normalZ * volume.sine;
      this.contact.normalY = normalY;
      this.contact.normalZ = -normalX * volume.sine + normalZ * volume.cosine;
      found = true;
    }
    return found ? this.contact : null;
  }

  private resolvePenetration(position: THREE.Vector3, volume: CameraVolume): boolean {
    if (position.y < volume.bottom - this.radius || position.y > volume.top + this.radius) return false;
    const dx = position.x - volume.x;
    const dz = position.z - volume.z;
    const localX = dx * volume.cosine - dz * volume.sine;
    const localZ = dx * volume.sine + dz * volume.cosine;
    const overlapX = volume.halfWidth + this.radius - Math.abs(localX);
    const overlapZ = volume.halfDepth + this.radius - Math.abs(localZ);
    if (overlapX <= 0 || overlapZ <= 0) return false;
    const overlapY = volume.top + this.radius - position.y;
    if (overlapY < overlapX && overlapY < overlapZ) position.y += overlapY + 0.004;
    else if (overlapX < overlapZ) {
      const shift = (localX < 0 ? -1 : 1) * (overlapX + 0.004);
      position.x += shift * volume.cosine;
      position.z -= shift * volume.sine;
    } else {
      const shift = (localZ < 0 ? -1 : 1) * (overlapZ + 0.004);
      position.x += shift * volume.sine;
      position.z += shift * volume.cosine;
    }
    return true;
  }

  private groundHeight(x: number, z: number): number {
    if (z >= -225) return 0.43;
    const t = THREE.MathUtils.clamp((-z - 225) / 255, 0, 1);
    const rise = t * t * (3 - 2 * t);
    return Math.max(0.15, rise * (34 + 16 * Math.sin(x * 0.008 + z * 0.003) + 12 * Math.cos(z * 0.014)) - 0.15);
  }

  private updateClipPlanes(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
    const distance = camera.position.distanceTo(target);
    const near = THREE.MathUtils.clamp(distance * 0.015, 0.12, 0.8);
    if (Math.abs(camera.near - near) < 0.005) return;
    camera.near = near;
    camera.updateProjectionMatrix();
  }
}
