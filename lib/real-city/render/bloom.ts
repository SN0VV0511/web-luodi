import * as THREE from "three";
import { bloomBlurFragment, bloomDownsampleFragment, bloomExtractFragment } from "./bloom-shaders";
import { FullscreenRenderer, screenMaterial, screenTarget } from "./fullscreen";

export class CityBloomPass {
  private readonly extracted = screenTarget("City bloom highlights", 1, 1, true);
  private readonly nearHorizontal = screenTarget("City bloom near horizontal", 1, 1, true);
  private readonly near = screenTarget("City bloom near", 1, 1, true);
  private readonly farInput = screenTarget("City bloom far input", 1, 1, true);
  private readonly farHorizontal = screenTarget("City bloom far horizontal", 1, 1, true);
  private readonly far = screenTarget("City bloom far", 1, 1, true);
  private readonly extract: THREE.ShaderMaterial;
  private readonly blur: THREE.ShaderMaterial;
  private readonly downsample: THREE.ShaderMaterial;
  private width = 1;
  private height = 1;
  private farWidth = 1;
  private farHeight = 1;

  constructor() {
    this.extract = screenMaterial("City physical highlight extraction", bloomExtractFragment, {
      tColor: { value: null },
      inverseResolution: { value: new THREE.Vector2(1, 1) },
      threshold: { value: 1.5 },
      knee: { value: 0.6 },
    });
    this.blur = screenMaterial("City optical bloom blur", bloomBlurFragment, {
      tColor: { value: null },
      direction: { value: new THREE.Vector2(1, 0) },
    });
    this.downsample = screenMaterial("City broad bloom downsample", bloomDownsampleFragment, {
      tColor: { value: null },
      inverseResolution: { value: new THREE.Vector2(1, 1) },
    });
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.ceil(width / 4));
    this.height = Math.max(1, Math.ceil(height / 4));
    this.farWidth = Math.max(1, Math.ceil(width / 12));
    this.farHeight = Math.max(1, Math.ceil(height / 12));
    this.extracted.setSize(this.width, this.height);
    this.nearHorizontal.setSize(this.width, this.height);
    this.near.setSize(this.width, this.height);
    this.farInput.setSize(this.farWidth, this.farHeight);
    this.farHorizontal.setSize(this.farWidth, this.farHeight);
    this.far.setSize(this.farWidth, this.farHeight);
    this.extract.uniforms.inverseResolution.value.set(1 / width, 1 / height);
    this.downsample.uniforms.inverseResolution.value.set(1 / this.width, 1 / this.height);
  }

  render(renderer: THREE.WebGLRenderer, screen: FullscreenRenderer, color: THREE.Texture, night: boolean): void {
    this.extract.uniforms.tColor.value = color;
    this.extract.uniforms.threshold.value = night ? 1.1 : 1.9;
    this.extract.uniforms.knee.value = night ? 0.45 : 0.7;
    screen.render(renderer, this.extract, this.extracted);
    this.blur.uniforms.tColor.value = this.extracted.texture;
    this.blur.uniforms.direction.value.set(1 / this.width, 0);
    screen.render(renderer, this.blur, this.nearHorizontal);
    this.blur.uniforms.tColor.value = this.nearHorizontal.texture;
    this.blur.uniforms.direction.value.set(0, 1 / this.height);
    screen.render(renderer, this.blur, this.near);
    this.downsample.uniforms.tColor.value = this.near.texture;
    screen.render(renderer, this.downsample, this.farInput);
    this.blur.uniforms.tColor.value = this.farInput.texture;
    this.blur.uniforms.direction.value.set(1 / this.farWidth, 0);
    screen.render(renderer, this.blur, this.farHorizontal);
    this.blur.uniforms.tColor.value = this.farHorizontal.texture;
    this.blur.uniforms.direction.value.set(0, 1 / this.farHeight);
    screen.render(renderer, this.blur, this.far);
  }

  get nearTexture(): THREE.Texture {
    return this.near.texture;
  }

  get farTexture(): THREE.Texture {
    return this.far.texture;
  }

  dispose(): void {
    this.extract.dispose();
    this.blur.dispose();
    this.downsample.dispose();
    this.extracted.dispose();
    this.nearHorizontal.dispose();
    this.near.dispose();
    this.farInput.dispose();
    this.farHorizontal.dispose();
    this.far.dispose();
  }
}
