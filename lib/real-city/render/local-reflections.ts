import * as THREE from "three";
import type { CityBuiltSite } from "../contracts";

type ReflectiveSurface = {
  material: THREE.MeshStandardMaterial;
  originalMap: THREE.Texture | null;
  originalIntensity: number;
};

type ReflectionCapture = {
  position: THREE.Vector3;
  texture: THREE.WebGLRenderTarget;
  lighting: string;
  updatedAt: number;
};

export class CityLocalReflections {
  private readonly enabled: boolean;
  private readonly cube: THREE.WebGLCubeRenderTarget | null;
  private readonly camera: THREE.CubeCamera | null;
  private readonly generator: THREE.PMREMGenerator | null;
  private readonly surfaces: ReflectiveSurface[] = [];
  private readonly captures: ReflectionCapture[] = [];
  private readonly candidate = new THREE.Vector3();
  private readonly capturePosition = new THREE.Vector3();
  private readonly viewport = new THREE.Vector4();
  private currentTexture: THREE.Texture | null = null;
  private pendingLighting = "";
  private nextFace = -1;
  private lastFaceAt = -Infinity;
  private lastCaptureAt = -Infinity;
  private disposed = false;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly sites: readonly CityBuiltSite[],
    compact: boolean,
  ) {
    this.enabled = !compact && renderer.extensions.has("EXT_color_buffer_float");
    if (!this.enabled) {
      this.cube = null;
      this.camera = null;
      this.generator = null;
      return;
    }
    this.cube = new THREE.WebGLCubeRenderTarget(64, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
    });
    this.cube.texture.name = "City street reflection capture";
    this.cube.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.camera = new THREE.CubeCamera(0.4, 1800, this.cube);
    this.camera.coordinateSystem = renderer.coordinateSystem;
    this.camera.updateCoordinateSystem();
    this.generator = new THREE.PMREMGenerator(renderer);
    this.generator.compileCubemapShader();
    this.collectSurfaces();
  }

  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3, now: number, lighting: string, effects: boolean): void {
    if (this.disposed || !this.enabled) return;
    if (!effects || camera.position.distanceTo(target) > 180 || camera.position.y > 95) {
      this.nextFace = -1;
      this.useTexture(null);
      return;
    }
    this.findCapturePosition(camera, target);
    const existing = this.closestCapture(this.candidate, lighting, now);
    if (existing) this.useTexture(existing.texture.texture);
    else this.useTexture(null);
    if (this.nextFace >= 0 && (this.pendingLighting !== lighting
      || this.capturePosition.distanceToSquared(this.candidate) > 55 * 55)) {
      this.nextFace = -1;
    }
    if (this.nextFace < 0) {
      const needsUpdate = !existing || now - existing.updatedAt > 45000;
      if (!needsUpdate || now - this.lastCaptureAt < 10000) return;
      this.capturePosition.copy(this.candidate);
      this.camera!.position.copy(this.capturePosition);
      this.camera!.updateMatrixWorld(true);
      this.pendingLighting = lighting;
      this.nextFace = 0;
    }
    if (now - this.lastFaceAt < 180) return;
    this.renderFace(this.nextFace);
    this.lastFaceAt = now;
    this.nextFace++;
    if (this.nextFace < 6) return;
    const texture = this.generator!.fromCubemap(this.cube!.texture);
    texture.texture.name = "City captured street reflections";
    const capture: ReflectionCapture = {
      position: this.capturePosition.clone(),
      texture,
      lighting: this.pendingLighting,
      updatedAt: now,
    };
    this.captures.push(capture);
    this.useTexture(texture.texture);
    while (this.captures.length > 3) {
      const oldest = this.captures.shift()!;
      oldest.texture.dispose();
    }
    this.nextFace = -1;
    this.lastCaptureAt = now;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.useTexture(null);
    for (const capture of this.captures) capture.texture.dispose();
    this.captures.length = 0;
    this.surfaces.length = 0;
    this.cube?.dispose();
    this.generator?.dispose();
  }

  private collectSurfaces(): void {
    const seen = new Set<THREE.Material>();
    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (seen.has(material) || !(material instanceof THREE.MeshStandardMaterial)) continue;
        seen.add(material);
        if (material.roughness > 0.42 || material.envMap) continue;
        const physical = material as THREE.MeshPhysicalMaterial;
        const reflective = material.metalness > 0.35 || material.transparent
          || physical.isMeshPhysicalMaterial && physical.clearcoat > 0.2;
        if (!reflective) continue;
        this.surfaces.push({ material, originalMap: material.envMap, originalIntensity: material.envMapIntensity });
      }
    });
  }

  private findCapturePosition(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
    this.candidate.lerpVectors(target, camera.position, 0.32);
    this.candidate.y = THREE.MathUtils.clamp(camera.position.y * 0.4, 3.2, 12);
    for (let pass = 0; pass < 3; pass++) {
      let corrected = false;
      for (const site of this.sites) {
        if (this.candidate.y > site.baseY + site.height + 0.8) continue;
        const cosine = Math.cos(site.rotationY);
        const sine = Math.sin(site.rotationY);
        const dx = this.candidate.x - site.x;
        const dz = this.candidate.z - site.z;
        const localX = dx * cosine - dz * sine;
        const localZ = dx * sine + dz * cosine;
        const halfWidth = site.width * 0.5 + 1.4;
        const halfDepth = site.depth * 0.5 + 1.4;
        if (Math.abs(localX) >= halfWidth || Math.abs(localZ) >= halfDepth) continue;
        const penetrationX = halfWidth - Math.abs(localX);
        const penetrationZ = halfDepth - Math.abs(localZ);
        let moveX = 0;
        let moveZ = 0;
        if (penetrationX < penetrationZ) moveX = (localX < 0 ? -1 : 1) * penetrationX;
        else moveZ = (localZ < 0 ? -1 : 1) * penetrationZ;
        this.candidate.x += moveX * cosine + moveZ * sine;
        this.candidate.z += -moveX * sine + moveZ * cosine;
        corrected = true;
      }
      if (!corrected) break;
    }
  }

  private closestCapture(position: THREE.Vector3, lighting: string, now: number): ReflectionCapture | null {
    let best: ReflectionCapture | null = null;
    let distanceSquared = 70 * 70;
    for (const capture of this.captures) {
      if (capture.lighting !== lighting || now - capture.updatedAt > 120000) continue;
      const distance = position.distanceToSquared(capture.position);
      if (distance >= distanceSquared) continue;
      distanceSquared = distance;
      best = capture;
    }
    return best;
  }

  private useTexture(texture: THREE.Texture | null): void {
    if (texture === this.currentTexture) return;
    const programChanged = Boolean(texture) !== Boolean(this.currentTexture);
    this.currentTexture = texture;
    for (const surface of this.surfaces) {
      surface.material.envMap = texture ?? surface.originalMap;
      surface.material.envMapIntensity = texture ? surface.originalIntensity * 0.9 : surface.originalIntensity;
      if (programChanged) surface.material.needsUpdate = true;
    }
  }

  private renderFace(face: number): void {
    if (!this.camera || !this.cube) return;
    const renderer = this.renderer;
    const previousTarget = renderer.getRenderTarget();
    const previousFace = renderer.getActiveCubeFace();
    const previousMip = renderer.getActiveMipmapLevel();
    const previousAutoClear = renderer.autoClear;
    const previousShadowUpdate = renderer.shadowMap.needsUpdate;
    const previousXr = renderer.xr.enabled;
    renderer.getViewport(this.viewport);
    for (const surface of this.surfaces) surface.material.envMap = surface.originalMap;
    try {
      renderer.autoClear = true;
      renderer.shadowMap.needsUpdate = false;
      renderer.xr.enabled = false;
      renderer.setRenderTarget(this.cube, face);
      renderer.render(this.scene, this.camera.children[face] as THREE.PerspectiveCamera);
    } finally {
      for (const surface of this.surfaces) surface.material.envMap = this.currentTexture ?? surface.originalMap;
      renderer.setRenderTarget(previousTarget, previousFace, previousMip);
      renderer.setViewport(this.viewport);
      renderer.autoClear = previousAutoClear;
      renderer.shadowMap.needsUpdate = previousShadowUpdate;
      renderer.xr.enabled = previousXr;
    }
  }
}
