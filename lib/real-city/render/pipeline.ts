import * as THREE from "three";
import { CityBloomPass } from "./bloom";
import { ContactShadowPass } from "./contact-shadows";
import { WetReflectionPass } from "./wet-reflections";
import { FullscreenRenderer, screenMaterial, screenTarget } from "./fullscreen";
import { cityOutputFragment } from "./output-shader";
import type { RenderQuality } from "./quality";
import { CityAntialiasPass } from "./antialias";
import { CityEyeAdaptation } from "./exposure";
import { CityTiltShiftPass } from "./tilt-shift";
import { TIME_OF_DAY_GRADES, type CityGrade } from "./time-of-day";

export type CityLook = { grade: CityGrade; tiltShift: boolean };

export type RenderStatistics = {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  width: number;
  height: number;
  effects: boolean;
};

export class CityRenderPipeline {
  private readonly supported: boolean;
  private readonly color: THREE.WebGLRenderTarget | null;
  private readonly screen: FullscreenRenderer | null;
  private readonly contact: ContactShadowPass | null;
  private readonly bloom: CityBloomPass | null;
  private readonly output: THREE.ShaderMaterial | null;
  private readonly antialias: CityAntialiasPass | null;
  private readonly adaptation: CityEyeAdaptation | null;
  private readonly tilt: CityTiltShiftPass | null;
  private readonly wet: WetReflectionPass | null;
  private readonly white: THREE.DataTexture;
  private readonly black: THREE.DataTexture;
  private readonly viewport = new THREE.Vector4();
  private readonly drawingSize = new THREE.Vector2();
  private readonly statistics: RenderStatistics;
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(readonly renderer: THREE.WebGLRenderer, compact: boolean) {
    this.supported = renderer.extensions.has("EXT_color_buffer_float");
    this.white = this.solidTexture(255);
    this.black = this.solidTexture(0);
    this.statistics = {
      calls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
      width: 1,
      height: 1,
      effects: this.supported,
    };
    if (!this.supported) {
      this.color = null;
      this.screen = null;
      this.contact = null;
      this.bloom = null;
      this.output = null;
      this.antialias = null;
      this.adaptation = null;
      this.tilt = null;
      this.wet = null;
      return;
    }
    this.color = screenTarget("City HDR scene", 1, 1, true);
    this.color.depthBuffer = true;
    this.color.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.color.depthTexture.name = "City scene depth";
    this.color.depthTexture.minFilter = THREE.NearestFilter;
    this.color.depthTexture.magFilter = THREE.NearestFilter;
    this.color.samples = compact ? 0 : Math.min(2, renderer.capabilities.maxSamples);
    this.screen = new FullscreenRenderer();
    this.contact = new ContactShadowPass();
    this.bloom = new CityBloomPass();
    this.antialias = new CityAntialiasPass(compact);
    this.adaptation = new CityEyeAdaptation();
    this.tilt = new CityTiltShiftPass();
    this.wet = compact ? null : new WetReflectionPass();
    this.output = screenMaterial("City photographic output", cityOutputFragment, {
      tColor: { value: this.color.texture },
      tOcclusion: { value: this.white },
      tBloomNear: { value: this.black },
      tBloomFar: { value: this.black },
      occlusionEnabled: { value: 0 },
      bloomStrength: { value: 0 },
      exposure: { value: 1 },
      ditherStrength: { value: 0.8 },
      resolution: { value: new THREE.Vector2(1, 1) },
      tExposure: { value: this.white },
      tDepth: { value: this.color.depthTexture },
      tBlur: { value: this.black },
      tReflection: { value: this.black },
      reflectionEnabled: { value: 0 },
      cameraNear: { value: 0.8 },
      cameraFar: { value: 4000 },
      hazeColor: { value: new THREE.Color() },
      hazeDensity: { value: 0 },
      hazeStart: { value: 140 },
      hazeMax: { value: 0.7 },
      saturation: { value: 1 },
      contrast: { value: 1 },
      shadowTint: { value: new THREE.Color(0.5, 0.5, 0.5) },
      highlightTint: { value: new THREE.Color(1, 1, 1) },
      vignette: { value: 0 },
      tiltShift: { value: 0 },
      focusDistance: { value: 100 },
      focusY: { value: 0.45 },
    });
  }

  resize(): void {
    this.renderer.getDrawingBufferSize(this.drawingSize);
    const width = Math.max(1, Math.floor(this.drawingSize.x));
    const height = Math.max(1, Math.floor(this.drawingSize.y));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.color?.setSize(width, height);
    this.contact?.resize(width, height);
    this.bloom?.resize(width, height);
    this.antialias?.resize(width, height);
    this.tilt?.resize(width, height);
    this.wet?.resize(width, height);
    this.output?.uniforms.resolution.value.set(width, height);
    this.statistics.width = width;
    this.statistics.height = height;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera, quality: RenderQuality, night: boolean, look?: CityLook): void {
    if (this.disposed) return;
    const renderer = this.renderer;
    const previousAutoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.info.reset();
    if (!this.color || !this.output || !this.screen || !this.contact || !this.bloom) {
      try {
        renderer.render(scene, camera);
        this.captureStatistics();
      } finally {
        renderer.info.autoReset = previousAutoReset;
      }
      return;
    }
    const previousTarget = renderer.getRenderTarget();
    const previousAutoClear = renderer.autoClear;
    const previousToneMapping = renderer.toneMapping;
    renderer.getViewport(this.viewport);
    renderer.autoClear = true;
    try {
      renderer.setRenderTarget(this.color);
      renderer.render(scene, camera);
      const sceneCalls = renderer.info.render.calls;
      const sceneTriangles = renderer.info.render.triangles;
      renderer.toneMapping = THREE.NoToneMapping;
      this.adaptation?.update(renderer, this.screen, this.color.texture, this.color.depthTexture!,
        performance.now(), night, renderer.toneMappingExposure, quality.bloom);
      this.output.uniforms.tExposure.value = this.adaptation?.texture ?? this.white;
      if (quality.contactShadows) {
        this.contact.render(renderer, this.screen, this.color.depthTexture!, camera);
        this.output.uniforms.tOcclusion.value = this.contact.texture;
      } else {
        this.output.uniforms.tOcclusion.value = this.white;
      }
      if (quality.bloom) {
        this.bloom.render(renderer, this.screen, this.color.texture, night);
        this.output.uniforms.tBloomNear.value = this.bloom.nearTexture;
        this.output.uniforms.tBloomFar.value = this.bloom.farTexture;
      } else {
        this.output.uniforms.tBloomNear.value = this.black;
        this.output.uniforms.tBloomFar.value = this.black;
      }
      this.output.uniforms.occlusionEnabled.value = quality.contactShadows ? 1 : 0;
      const wet = night && quality.bloom && this.wet;
      if (wet && this.wet) {
        this.wet.render(renderer, this.screen, this.color.texture, this.color.depthTexture!, camera, 0.9,
          scene.fog?.color ?? (scene.background instanceof THREE.Color ? scene.background : undefined));
        this.output.uniforms.tReflection.value = this.wet.texture;
      }
      this.output.uniforms.reflectionEnabled.value = wet ? 1 : 0;
      const grade = look?.grade ?? TIME_OF_DAY_GRADES[night ? "night" : "day"];
      const uniforms = this.output.uniforms;
      uniforms.bloomStrength.value = quality.bloom ? (night ? 0.14 : 0.06) * grade.bloom : 0;
      uniforms.cameraNear.value = camera.near;
      uniforms.cameraFar.value = camera.far;
      uniforms.hazeColor.value.copy(grade.hazeColor);
      uniforms.hazeDensity.value = grade.hazeDensity;
      uniforms.hazeMax.value = grade.hazeMax;
      uniforms.saturation.value = grade.saturation;
      uniforms.contrast.value = grade.contrast;
      uniforms.shadowTint.value.copy(grade.shadowTint);
      uniforms.highlightTint.value.copy(grade.highlightTint);
      uniforms.vignette.value = grade.vignette;
      const tilting = Boolean(look?.tiltShift && this.tilt);
      uniforms.tiltShift.value = tilting ? 1 : 0;
      if (tilting && this.tilt) {
        this.tilt.render(renderer, this.screen, this.color.texture);
        uniforms.tBlur.value = this.tilt.texture;
        uniforms.focusDistance.value = this.focusDistance(camera);
      }
      this.output.uniforms.exposure.value = renderer.toneMappingExposure;
      this.screen.render(renderer, this.output, this.antialias?.input ?? previousTarget);
      this.antialias?.render(renderer, this.screen, this.color.depthTexture!, camera, previousTarget);
      this.captureStatistics();
      this.statistics.calls = sceneCalls;
      this.statistics.triangles = sceneTriangles;
      this.statistics.effects = quality.contactShadows || quality.bloom;
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setViewport(this.viewport);
      renderer.toneMapping = previousToneMapping;
      renderer.autoClear = previousAutoClear;
      renderer.info.autoReset = previousAutoReset;
    }
  }

  snapshot(): Readonly<RenderStatistics> {
    return this.statistics;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.color?.depthTexture?.dispose();
    this.color?.dispose();
    this.screen?.dispose();
    this.contact?.dispose();
    this.bloom?.dispose();
    this.output?.dispose();
    this.antialias?.dispose();
    this.adaptation?.dispose();
    this.tilt?.dispose();
    this.wet?.dispose();
    this.white.dispose();
    this.black.dispose();
  }

  /** Focus on the orbit target plane: the camera looks at it, so its distance is the lens focus. */
  focusTarget: THREE.Vector3 | null = null;

  private focusDistance(camera: THREE.PerspectiveCamera): number {
    if (this.focusTarget) return camera.position.distanceTo(this.focusTarget);
    return 120;
  }

  private captureStatistics(): void {
    const info = this.renderer.info.render;
    this.statistics.calls = info.calls;
    this.statistics.triangles = info.triangles;
    this.statistics.points = info.points;
    this.statistics.lines = info.lines;
  }

  private solidTexture(value: number): THREE.DataTexture {
    const texture = new THREE.DataTexture(new Uint8Array([value, value, value, 255]), 1, 1);
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }
}
