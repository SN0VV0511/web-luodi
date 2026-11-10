import * as THREE from "three";
import { depthReconstruction } from "./depth-shaders";
import { FullscreenRenderer, screenMaterial, screenTarget } from "./fullscreen";

/**
 * 夜间湿路面的屏幕空间反射（SSR）：只作用于地面高度附近、朝上的低饱和表面（沥青、步道），
 * 沿镜面反射方向在视空间步进并用深度缓冲求交，命中后取 HDR 场景色。
 * 半分辨率计算 + 竖向拉伸模糊（湿沥青的「拖影」高光），在输出合成时按菲涅耳叠加。
 */
const wetReflectionFragment = /* glsl */ `
varying vec2 vUv;
${depthReconstruction}
uniform sampler2D tColor;
uniform mat4 projection;
uniform mat4 viewToWorld;
uniform vec3 upView;
uniform float groundMax;
uniform float strength;
uniform vec3 envHorizon;
uniform vec3 envZenith;

vec2 project(vec3 p) {
  vec4 clip = projection * vec4(p, 1.0);
  return clip.xy / clip.w * 0.5 + 0.5;
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  float depth = texture2D(tDepth, vUv).r;
  if (depth >= 0.99999 || strength <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec3 P = viewPosition(vUv);
  vec3 W = (viewToWorld * vec4(P, 1.0)).xyz;
  if (W.y > groundMax || -P.z > 260.0) { gl_FragColor = vec4(0.0); return; }
  vec3 N = surfaceNormal(vUv, P);
  float facing = dot(N, upView);
  if (facing < 0.96) { gl_FragColor = vec4(0.0); return; }
  vec3 base = texture2D(tColor, vUv).rgb;
  float hi = max(base.r, max(base.g, base.b));
  float sat = (hi - min(base.r, min(base.g, base.b))) / max(hi, 1e-4);
  // 草地与彩色标线不反光；沥青与灰色步道才是湿润镜面。
  float mask = 1.0 - smoothstep(0.18, 0.36, sat);
  if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

  vec3 V = normalize(P);
  // 地面法线用精确的世界向上方向（深度重建法线有噪声），加一点按像素抖动模拟沥青微粗糙。
  vec3 R = normalize(reflect(V, upView));
  float jitter = hash(vUv * 731.0);
  float t = 0.25 + jitter * 0.35;
  vec2 hitUv = vec2(-1.0);
  float travelled = 0.0;
  for (int i = 0; i < 30; i++) {
    vec3 Q = P + R * t;
    if (Q.z > -cameraNear) break;
    vec2 uv = project(Q);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sceneZ = viewPosition(uv).z;
    float thickness = 0.6 + t * 0.08;
    if (sceneZ > Q.z && sceneZ - Q.z < thickness) {
      // 二分细化
      float lo = t * 0.72, hiT = t;
      for (int k = 0; k < 5; k++) {
        float mid = (lo + hiT) * 0.5;
        vec3 M = P + R * mid;
        if (viewPosition(project(M)).z > M.z) hiT = mid; else lo = mid;
      }
      hitUv = project(P + R * hiT);
      travelled = hiT;
      break;
    }
    t *= 1.16;
    t += 0.12;
  }
  float cosine = clamp(dot(-V, upView), 0.0, 1.0);
  float fresnel = 0.05 + 0.95 * pow(1.0 - cosine, 5.0);
  float base_weight = strength * mask * mix(0.35, 1.0, fresnel);
  // 屏幕外 / 未命中的回退：按世界空间反射方向取天空 + 雾色渐变（近似环境探针），
  // 避免射线一离开画面边缘反射就硬切成黑。
  vec3 Rw = normalize((viewToWorld * vec4(R, 0.0)).xyz);
  vec3 envColor = mix(envHorizon, envZenith, smoothstep(0.02, 0.55, Rw.y));
  float hitFade = 0.0;
  vec3 hitColor = envColor;
  if (hitUv.x >= 0.0) {
    vec2 edge = smoothstep(vec2(0.0), vec2(0.08), hitUv) * smoothstep(vec2(0.0), vec2(0.08), 1.0 - hitUv);
    hitFade = edge.x * edge.y * (1.0 - smoothstep(30.0, 90.0, travelled));
    hitColor = texture2D(tColor, hitUv).rgb;
  }
  vec3 reflected = mix(envColor, hitColor, hitFade);
  float weight = base_weight * mix(0.55, 1.0, hitFade);
  gl_FragColor = vec4(reflected * weight, weight);
}
`;

const streakFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tReflection;
uniform vec2 texel;
void main() {
  // 竖向拉长的模糊：路灯与车灯在湿路面上拉出长条倒影。
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int i = -6; i <= 6; i++) {
    float w = exp(-float(i * i) / 18.0);
    sum += texture2D(tReflection, vUv + vec2(float(i) * 0.15, float(i) * 1.15) * texel) * w;
    total += w;
  }
  gl_FragColor = sum / total;
}
`;

export class WetReflectionPass {
  private readonly raw = screenTarget("Wet road reflections", 1, 1, true);
  private readonly streaked = screenTarget("Wet road reflection streaks", 1, 1, true);
  private readonly material: THREE.ShaderMaterial;
  private readonly streak: THREE.ShaderMaterial;
  private readonly inverseResolution = new THREE.Vector2(1, 1);
  private readonly upView = new THREE.Vector3();

  constructor() {
    this.material = screenMaterial("City wet reflections", wetReflectionFragment, {
      tDepth: { value: null },
      tColor: { value: null },
      inverseProjection: { value: new THREE.Matrix4() },
      projection: { value: new THREE.Matrix4() },
      viewToWorld: { value: new THREE.Matrix4() },
      inverseResolution: { value: this.inverseResolution },
      cameraNear: { value: 0.8 },
      cameraFar: { value: 4000 },
      upView: { value: this.upView },
      groundMax: { value: 0.62 },
      strength: { value: 0 },
      envHorizon: { value: new THREE.Color("#2a3446") },
      envZenith: { value: new THREE.Color("#0b1020") },
    });
    this.streak = screenMaterial("City wet reflection streaks", streakFragment, {
      tReflection: { value: this.raw.texture },
      texel: { value: new THREE.Vector2(1, 1) },
    });
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.ceil(width * 0.5)), h = Math.max(1, Math.ceil(height * 0.5));
    this.inverseResolution.set(1 / width, 1 / height);
    this.raw.setSize(w, h);
    this.streaked.setSize(w, h);
    this.streak.uniforms.texel.value.set(1 / w, 1 / h);
  }

  render(renderer: THREE.WebGLRenderer, screen: FullscreenRenderer, color: THREE.Texture, depth: THREE.DepthTexture, camera: THREE.PerspectiveCamera, strength: number, horizon?: THREE.Color): void {
    const u = this.material.uniforms;
    if (horizon) {
      u.envHorizon.value.copy(horizon);
      u.envZenith.value.copy(horizon).multiplyScalar(0.3);
    }
    u.tDepth.value = depth;
    u.tColor.value = color;
    u.inverseProjection.value.copy(camera.projectionMatrixInverse);
    u.projection.value.copy(camera.projectionMatrix);
    u.viewToWorld.value.copy(camera.matrixWorld);
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    u.strength.value = strength;
    this.upView.set(0, 1, 0).transformDirection(camera.matrixWorldInverse);
    screen.render(renderer, this.material, this.raw);
    screen.render(renderer, this.streak, this.streaked);
  }

  get texture(): THREE.Texture {
    return this.streaked.texture;
  }

  dispose(): void {
    this.material.dispose();
    this.streak.dispose();
    this.raw.dispose();
    this.streaked.dispose();
  }
}
