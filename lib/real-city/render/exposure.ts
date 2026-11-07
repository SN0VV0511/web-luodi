import * as THREE from "three";
import { exposureAdaptFragment, exposureMeterFragment, exposureReduceFragment } from "./exposure-shaders";
import { FullscreenRenderer, screenMaterial, screenTarget } from "./fullscreen";

export class CityEyeAdaptation {
  private readonly meter = screenTarget("City center-weighted luminance", 16, 12, true);
  private readonly measurement = screenTarget("City logarithmic luminance", 1, 1, true);
  private readonly first = screenTarget("City adapted exposure A", 1, 1, true);
  private readonly second = screenTarget("City adapted exposure B", 1, 1, true);
  private readonly neutral: THREE.DataTexture;
  private readonly meterMaterial: THREE.ShaderMaterial;
  private readonly reduceMaterial: THREE.ShaderMaterial;
  private readonly adaptMaterial: THREE.ShaderMaterial;
  private previous: THREE.WebGLRenderTarget;
  private next: THREE.WebGLRenderTarget;
  private updatedAt = -Infinity;
  private initialized = false;
  private previousNight = false;
  private disposed = false;

  constructor() {
    this.neutral = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.neutral.colorSpace = THREE.LinearSRGBColorSpace;
    this.neutral.needsUpdate = true;
    this.previous = this.first;
    this.next = this.second;
    this.meterMaterial = screenMaterial("City luminance metering", exposureMeterFragment, {
      tColor: { value: null },
      tDepth: { value: null },
      inverseMeterSize: { value: new THREE.Vector2(1 / 16, 1 / 12) },
    });
    this.reduceMaterial = screenMaterial("City luminance reduction", exposureReduceFragment, {
      tMeter: { value: this.meter.texture },
    });
    this.adaptMaterial = screenMaterial("City eye adaptation", exposureAdaptFragment, {
      tMeasurement: { value: this.measurement.texture },
      tPrevious: { value: this.neutral },
      elapsed: { value: 0 },
      initialized: { value: 0 },
      night: { value: 0 },
      baseExposure: { value: 1 },
    });
  }

  update(
    renderer: THREE.WebGLRenderer,
    screen: FullscreenRenderer,
    color: THREE.Texture,
    depth: THREE.Texture,
    now: number,
    night: boolean,
    baseExposure: number,
    enabled: boolean,
  ): void {
    if (this.disposed) return;
    if (!enabled) {
      this.initialized = false;
      this.updatedAt = -Infinity;
      return;
    }
    const changedLighting = this.previousNight !== night;
    if (this.initialized && !changedLighting && now - this.updatedAt < 200) return;
    const elapsed = this.initialized ? Math.max(0, (now - this.updatedAt) / 1000) : 0;
    this.meterMaterial.uniforms.tColor.value = color;
    this.meterMaterial.uniforms.tDepth.value = depth;
    screen.render(renderer, this.meterMaterial, this.meter);
    screen.render(renderer, this.reduceMaterial, this.measurement);
    this.adaptMaterial.uniforms.tPrevious.value = this.initialized ? this.previous.texture : this.neutral;
    this.adaptMaterial.uniforms.elapsed.value = elapsed;
    this.adaptMaterial.uniforms.initialized.value = this.initialized && !changedLighting ? 1 : 0;
    this.adaptMaterial.uniforms.night.value = night ? 1 : 0;
    this.adaptMaterial.uniforms.baseExposure.value = Math.max(0.01, baseExposure);
    screen.render(renderer, this.adaptMaterial, this.next);
    const swap = this.previous;
    this.previous = this.next;
    this.next = swap;
    this.initialized = true;
    this.previousNight = night;
    this.updatedAt = now;
  }

  get texture(): THREE.Texture {
    return this.initialized ? this.previous.texture : this.neutral;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.meter.dispose();
    this.measurement.dispose();
    this.first.dispose();
    this.second.dispose();
    this.neutral.dispose();
    this.meterMaterial.dispose();
    this.reduceMaterial.dispose();
    this.adaptMaterial.dispose();
  }
}
