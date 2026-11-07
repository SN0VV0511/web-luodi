import * as THREE from "three";
import { cityAntialiasFragment } from "./antialias-shader";
import { FullscreenRenderer, screenMaterial, screenTarget } from "./fullscreen";

export class CityAntialiasPass {
  readonly input = screenTarget("City display before antialiasing", 1, 1, false);
  private readonly material: THREE.ShaderMaterial;
  private disposed = false;

  constructor(compact: boolean) {
    this.material = screenMaterial("City geometric edge antialiasing", cityAntialiasFragment, {
      tColor: { value: this.input.texture },
      tDepth: { value: null },
      inverseResolution: { value: new THREE.Vector2(1, 1) },
      cameraNear: { value: 0.8 },
      cameraFar: { value: 4000 },
      subpixelStrength: { value: compact ? 0.65 : 0.4 },
    });
  }

  resize(width: number, height: number): void {
    if (this.disposed) return;
    this.input.setSize(width, height);
    this.material.uniforms.inverseResolution.value.set(1 / width, 1 / height);
  }

  render(
    renderer: THREE.WebGLRenderer,
    screen: FullscreenRenderer,
    depth: THREE.DepthTexture,
    camera: THREE.PerspectiveCamera,
    target: THREE.WebGLRenderTarget | null,
  ): void {
    if (this.disposed) return;
    this.material.uniforms.tDepth.value = depth;
    this.material.uniforms.cameraNear.value = camera.near;
    this.material.uniforms.cameraFar.value = camera.far;
    screen.render(renderer, this.material, target);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.input.dispose();
    this.material.dispose();
  }
}
