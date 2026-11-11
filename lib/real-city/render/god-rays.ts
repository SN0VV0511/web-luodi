import * as THREE from "three";
import { FullscreenRenderer, screenMaterial, screenTarget } from "./fullscreen";

/**
 * 屏幕空间体积光（God rays）：以深度为遮罩取出太阳附近未被遮挡的天空亮度，
 * 在半分辨率下沿“像素 → 太阳”方向做带衰减的径向步进，楼宇与树冠之间便漏出一束束光柱。
 * 黄金时刻最强，白天很弱，夜晚关闭；太阳在画面外但接近边缘时光束仍可从画框外射入。
 */
const godRayFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 sunUv;
uniform float aspect;
uniform float strength;
uniform vec3 tint;

float lightAt(vec2 uv) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  float sky = step(0.99999, texture2D(tDepth, uv).r);
  vec2 d = (uv - sunUv) * vec2(aspect, 1.0);
  float halo = exp(-dot(d, d) * 9.0);
  float luma = dot(texture2D(tColor, uv).rgb, vec3(0.2126, 0.7152, 0.0722));
  return sky * halo * min(luma, 4.0);
}

void main() {
  const int STEPS = 36;
  vec2 delta = (sunUv - vUv) / float(STEPS) * 0.92;
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec2 uv = vUv + delta * jitter;
  float decay = 1.0;
  float sum = 0.0;
  for (int i = 0; i < STEPS; i++) {
    sum += lightAt(uv) * decay;
    decay *= 0.955;
    uv += delta;
  }
  sum /= float(STEPS);
  gl_FragColor = vec4(tint * sum * strength, 1.0);
}
`;

export class CityGodRayPass {
  private readonly target = screenTarget("City god rays", 1, 1, true);
  private readonly material: THREE.ShaderMaterial;
  private readonly projected = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();

  constructor() {
    this.material = screenMaterial("City god rays", godRayFragment, {
      tColor: { value: null },
      tDepth: { value: null },
      sunUv: { value: new THREE.Vector2(0.5, 0.5) },
      aspect: { value: 1 },
      strength: { value: 0 },
      tint: { value: new THREE.Color(1, 0.8, 0.55) },
    });
  }

  resize(width: number, height: number): void {
    this.target.setSize(Math.max(1, Math.ceil(width / 2)), Math.max(1, Math.ceil(height / 2)));
    this.material.uniforms.aspect.value = width / Math.max(1, height);
  }

  /** 返回本帧有效强度（0 表示无需合成）。 */
  render(renderer: THREE.WebGLRenderer, screen: FullscreenRenderer, color: THREE.Texture, depth: THREE.Texture,
    camera: THREE.PerspectiveCamera, sunDirection: THREE.Vector3, amount: number, tint?: THREE.Color): number {
    if (amount <= 0.001 || sunDirection.y < -0.05) return 0;
    camera.getWorldDirection(this.forward);
    const facing = this.forward.dot(sunDirection);
    if (facing <= 0.05) return 0;
    this.projected.copy(camera.position).addScaledVector(sunDirection, 1000).project(camera);
    const sx = this.projected.x * 0.5 + 0.5, sy = this.projected.y * 0.5 + 0.5;
    const outside = Math.max(0, Math.abs(sx - 0.5) - 0.5, Math.abs(sy - 0.5) - 0.5);
    const strength = amount * THREE.MathUtils.smoothstep(facing, 0.05, 0.45) * (1 - THREE.MathUtils.smoothstep(outside, 0, 0.6));
    if (strength <= 0.001) return 0;
    const u = this.material.uniforms;
    u.tColor.value = color;
    u.tDepth.value = depth;
    u.sunUv.value.set(sx, sy);
    u.strength.value = strength;
    if (tint) u.tint.value.copy(tint);
    screen.render(renderer, this.material, this.target);
    return strength;
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  dispose(): void {
    this.material.dispose();
    this.target.dispose();
  }
}
