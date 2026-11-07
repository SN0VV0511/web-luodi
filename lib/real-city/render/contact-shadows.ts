import * as THREE from "three";
import { bilateralOcclusionFragment, contactOcclusionFragment } from "./depth-shaders";
import { FullscreenRenderer, screenMaterial, screenTarget } from "./fullscreen";

export class ContactShadowPass {
  private readonly raw = screenTarget("Contact shadow samples", 1, 1, false);
  private readonly horizontal = screenTarget("Contact shadow horizontal filter", 1, 1, false);
  private readonly filtered = screenTarget("Contact shadow bilateral result", 1, 1, false);
  private readonly material: THREE.ShaderMaterial;
  private readonly filter: THREE.ShaderMaterial;
  private readonly inverseProjection = new THREE.Matrix4();
  private readonly inverseResolution = new THREE.Vector2(1, 1);
  private width = 1;
  private height = 1;

  constructor() {
    this.material = screenMaterial("City contact occlusion", contactOcclusionFragment, {
      tDepth: { value: null },
      inverseProjection: { value: this.inverseProjection },
      inverseResolution: { value: this.inverseResolution },
      cameraNear: { value: 0.8 },
      cameraFar: { value: 4000 },
      projectionScale: { value: 1 },
      radius: { value: 1.4 },
      strength: { value: 1.5 },
    });
    this.filter = screenMaterial("City depth-aware occlusion filter", bilateralOcclusionFragment, {
      tDepth: { value: null },
      tOcclusion: { value: null },
      inverseProjection: { value: this.inverseProjection },
      inverseResolution: { value: this.inverseResolution },
      cameraNear: { value: 0.8 },
      cameraFar: { value: 4000 },
      direction: { value: new THREE.Vector2() },
    });
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.ceil(width * 0.5));
    this.height = Math.max(1, Math.ceil(height * 0.5));
    this.inverseResolution.set(1 / width, 1 / height);
    this.raw.setSize(this.width, this.height);
    this.horizontal.setSize(this.width, this.height);
    this.filtered.setSize(this.width, this.height);
  }

  render(renderer: THREE.WebGLRenderer, screen: FullscreenRenderer, depth: THREE.DepthTexture, camera: THREE.PerspectiveCamera): void {
    this.inverseProjection.copy(camera.projectionMatrixInverse);
    this.material.uniforms.tDepth.value = depth;
    this.material.uniforms.cameraNear.value = camera.near;
    this.material.uniforms.cameraFar.value = camera.far;
    this.material.uniforms.projectionScale.value = this.height * camera.projectionMatrix.elements[5];
    screen.render(renderer, this.material, this.raw);
    this.filter.uniforms.tDepth.value = depth;
    this.filter.uniforms.cameraNear.value = camera.near;
    this.filter.uniforms.cameraFar.value = camera.far;
    this.filter.uniforms.tOcclusion.value = this.raw.texture;
    this.filter.uniforms.direction.value.set(1 / this.width, 0);
    screen.render(renderer, this.filter, this.horizontal);
    this.filter.uniforms.tOcclusion.value = this.horizontal.texture;
    this.filter.uniforms.direction.value.set(0, 1 / this.height);
    screen.render(renderer, this.filter, this.filtered);
  }

  get texture(): THREE.Texture {
    return this.filtered.texture;
  }

  dispose(): void {
    this.material.dispose();
    this.filter.dispose();
    this.raw.dispose();
    this.horizontal.dispose();
    this.filtered.dispose();
  }
}
