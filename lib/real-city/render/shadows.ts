import * as THREE from "three";

export class CityShadowController {
  private readonly direction = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly focus = new THREE.Vector3();
  private readonly previousFocus = new THREE.Vector3(Infinity, Infinity, Infinity);
  private readonly previousDirection = new THREE.Vector3();
  private lastUpdate = -Infinity;
  private radius = 305;
  private initialized = false;
  private force = true;
  /** 动态阴影刷新间隔倍率：中/低画质下远景阴影刷新得更慢（静态阴影本来就不重绘）。 */
  intervalScale = 1;

  constructor(readonly light: THREE.DirectionalLight, private resolution: number) {}

  setResolution(resolution: number): void {
    if (resolution === this.resolution) return;
    this.resolution = resolution;
    this.initialized = false;
    this.force = true;
  }

  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, sunOffset: THREE.Vector3, now: number, moving: boolean): { radius: number; needsUpdate: boolean } {
    const distance = camera.position.distanceTo(target);
    const desiredRadius = THREE.MathUtils.clamp(distance * 0.8, 24, 340);
    const radiusStep = desiredRadius < 60 ? 2 : desiredRadius < 140 ? 5 : 10;
    const quantizedRadius = Math.ceil(desiredRadius / radiusStep) * radiusStep;
    let projectionChanged = false;
    if (!this.initialized || Math.abs(quantizedRadius - this.radius) >= radiusStep) {
      this.radius = quantizedRadius;
      this.setProjection();
      projectionChanged = true;
    }
    this.direction.copy(sunOffset).normalize();
    this.right.crossVectors(this.worldUp, this.direction).normalize();
    if (this.right.lengthSq() < 0.001) this.right.set(1, 0, 0);
    this.up.crossVectors(this.direction, this.right).normalize();
    const texel = this.radius * 2 / this.resolution;
    this.focus.set(target.x, 0, target.z);
    const rightCoordinate = this.focus.dot(this.right);
    const upCoordinate = this.focus.dot(this.up);
    const snappedRight = Math.round(rightCoordinate / texel) * texel;
    const snappedUp = Math.round(upCoordinate / texel) * texel;
    this.focus.addScaledVector(this.right, snappedRight - rightCoordinate);
    this.focus.addScaledVector(this.up, snappedUp - upCoordinate);
    const moved = this.focus.distanceToSquared(this.previousFocus) > texel * texel * 0.5;
    const sunChanged = this.direction.distanceToSquared(this.previousDirection) > 0.00002;
    const interval = (this.radius < 60 ? 100 : 250) * (this.radius < 60 ? 1 : this.intervalScale);
    const elapsed = now - this.lastUpdate;
    const needsUpdate = this.force || !this.initialized || projectionChanged
      || (moving || moved || sunChanged) && elapsed >= interval;
    if (needsUpdate) {
      this.light.target.position.copy(this.focus);
      this.light.position.copy(this.focus).add(sunOffset);
      this.light.target.updateMatrixWorld();
      this.previousFocus.copy(this.focus);
      this.previousDirection.copy(this.direction);
      this.lastUpdate = now;
      this.force = false;
      this.initialized = true;
    }
    return { radius: this.radius, needsUpdate };
  }

  invalidate(): void {
    this.force = true;
  }

  private setProjection(): void {
    const camera = this.light.shadow.camera;
    camera.left = -this.radius;
    camera.right = this.radius;
    camera.top = this.radius;
    camera.bottom = -this.radius;
    camera.updateProjectionMatrix();
    const texel = this.radius * 2 / this.resolution;
    this.light.shadow.normalBias = Math.max(0.012, texel * 0.4);
    this.light.shadow.bias = -0.00002;
    this.light.shadow.radius = this.radius < 60 ? 2 : 3.5;
  }
}
