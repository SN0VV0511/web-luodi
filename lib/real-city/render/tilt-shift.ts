import * as THREE from "three";
import { bloomBlurFragment } from "./bloom-shaders";
import { FullscreenRenderer, screenMaterial, screenTarget } from "./fullscreen";

/** Half-resolution wide gaussian of the HDR scene used by the optional tilt-shift lens. */
export class CityTiltShiftPass {
  private readonly a = screenTarget("Tilt-shift blur A", 1, 1, true);
  private readonly b = screenTarget("Tilt-shift blur B", 1, 1, true);
  private readonly blur: THREE.ShaderMaterial;
  private width = 1;
  private height = 1;

  constructor() {
    this.blur = screenMaterial("City tilt-shift blur", bloomBlurFragment, {
      tColor: { value: null },
      direction: { value: new THREE.Vector2(1, 0) },
    });
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.ceil(width / 2));
    this.height = Math.max(1, Math.ceil(height / 2));
    this.a.setSize(this.width, this.height);
    this.b.setSize(this.width, this.height);
  }

  render(renderer: THREE.WebGLRenderer, screen: FullscreenRenderer, color: THREE.Texture): void {
    let source: THREE.Texture = color;
    for (const step of [1, 2.2]) {
      this.blur.uniforms.tColor.value = source;
      this.blur.uniforms.direction.value.set(step / this.width, 0);
      screen.render(renderer, this.blur, this.a);
      this.blur.uniforms.tColor.value = this.a.texture;
      this.blur.uniforms.direction.value.set(0, step / this.height);
      screen.render(renderer, this.blur, this.b);
      source = this.b.texture;
    }
  }

  get texture(): THREE.Texture {
    return this.b.texture;
  }

  dispose(): void {
    this.blur.dispose();
    this.a.dispose();
    this.b.dispose();
  }
}
