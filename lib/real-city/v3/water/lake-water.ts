import * as THREE from "three";

/**
 * v3 中央湖水面：基于 MeshPhysicalMaterial（自动获得天空环境反射、太阳高光、阴影与雾），
 * 叠加三层滚动的程序化法线贴图波纹、Schlick 菲涅尔（IOR 1.33）、按离岸距离的深浅水色、
 * 岸线白沫、岸边树影倒影、夜间城市灯光碎影，以及由浮漂 / 船桨 / 跃鱼驱动的同心涟漪。
 */
export type LakeShape = { cx: number; cz: number; rx: number; rz: number };
export const LAKE_RINGS = 16;

export type LakeWater = {
  material: THREE.MeshPhysicalMaterial;
  normalMap: THREE.DataTexture;
  uniforms: {
    uTime: { value: number };
    uNight: { value: number };
    uRings: { value: THREE.Vector4[] };
  };
  /** 在湖面 (x, z) 触发一圈涟漪（strength 0..1）。 */
  ripple(x: number, z: number, seconds: number, strength?: number): void;
  dispose(): void;
};

/** 可平铺的波浪高度场 → 法线贴图（只用整数频率，保证四方连续）。 */
export function createWaveNormalTexture(size = 256, seed = 7): THREE.DataTexture {
  let state = seed >>> 0;
  const random = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const waves: { kx: number; ky: number; amp: number; phase: number }[] = [];
  for (let i = 0; i < 40; i++) {
    const f = 1 + Math.floor(random() * (i < 10 ? 4 : i < 25 ? 9 : 18));
    const angle = random() * Math.PI * 2;
    const kx = Math.round(Math.cos(angle) * f), ky = Math.round(Math.sin(angle) * f);
    if (!kx && !ky) continue;
    waves.push({ kx, ky, amp: 1 / Math.pow(Math.hypot(kx, ky), 1.35), phase: random() * Math.PI * 2 });
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dx = 0, dy = 0, h = 0;
      for (const w of waves) {
        const arg = (w.kx * x + w.ky * y) / size * Math.PI * 2 + w.phase;
        // 尖峰波形：|sin| 的平滑版本更像风浪
        const s = Math.sin(arg), c = Math.cos(arg);
        h += w.amp * s;
        dx += w.amp * c * w.kx;
        dy += w.amp * c * w.ky;
      }
      const strength = 0.11;
      const n = new THREE.Vector3(-dx * strength, -dy * strength, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = Math.round((n.x * 0.5 + 0.5) * 255);
      data[i + 1] = Math.round((n.y * 0.5 + 0.5) * 255);
      data[i + 2] = Math.round((n.z * 0.5 + 0.5) * 255);
      data[i + 3] = Math.round(THREE.MathUtils.clamp(h * 0.25 + 0.5, 0, 1) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.name = "v3 lake wave normals";
  texture.needsUpdate = true;
  return texture;
}

export type WaterOptions = {
  /** GLSL：由 vLakeWorld 计算 q（0 = 深水，1 = 岸线）与 a（沿岸角度参数，用于白沫变化）。 */
  profile?: string;
  /** 波纹尺度倍数（海面 > 1）。 */
  waveScale?: number;
  /** 是否绘制远岸树影倒影。 */
  treeLine?: boolean;
  deep?: string;
  shallow?: string;
};
const glslColour = (hex: string) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`; };

export function createLakeWater(shape: LakeShape, options: WaterOptions = {}): LakeWater {
  const profile = options.profile ?? `
  vec2 rel = vLakeWorld.xz - vec2(${shape.cx.toFixed(2)}, ${shape.cz.toFixed(2)});
  float a = atan(rel.y, rel.x);
  float r = 1.0 + sin(a * 3.0) * 0.08 + cos(a * 5.0) * 0.035;
  float q = length(vec2(rel.x / ${shape.rx.toFixed(2)}, rel.y / ${shape.rz.toFixed(2)})) / r;`;
  const ws = options.waveScale ?? 1;
  const normalMap = createWaveNormalTexture();
  const uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uRings: { value: Array.from({ length: LAKE_RINGS }, () => new THREE.Vector4(0, 0, -999, 0)) },
  };
  const material = new THREE.MeshPhysicalMaterial({
    name: "v3 lake water",
    color: "#ffffff",
    roughness: 0.035,
    metalness: 0,
    ior: 1.333,
    specularIntensity: 1,
    envMapIntensity: 1.15,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
  });
  let ringCursor = 0;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms, { uWaveMap: { value: normalMap } });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLakeWorld;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLakeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vLakeWorld;
uniform float uTime;
uniform float uNight;
uniform vec4 uRings[${LAKE_RINGS}];
uniform sampler2D uWaveMap;
float lakeShore;      // 0 = 湖心, 1 = 岸线
float lakeFoam;
vec3 lakeWorldNormal;
vec3 waveSample(vec2 uv) { return texture2D(uWaveMap, uv).xyz * 2.0 - 1.0; }`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  ${profile}
  lakeShore = clamp(q, 0.0, 1.0);
  float depth = smoothstep(1.0, 0.55, q);
  vec3 shallow = ${options.shallow ? glslColour(options.shallow) : "vec3(0.16, 0.30, 0.25)"};
  vec3 sandy = vec3(0.42, 0.40, 0.30);
  vec3 deep = ${options.deep ? glslColour(options.deep) : "vec3(0.015, 0.075, 0.095)"};
  vec3 water = mix(mix(sandy, shallow, smoothstep(0.995, 0.93, q)), deep, depth);
  // 岸线白沫：随时间推拉的破碎带
  float t = uTime;
  vec2 fuv = vLakeWorld.xz * 0.35;
  float breakup = texture2D(uWaveMap, fuv * 0.7 + vec2(t * 0.02, -t * 0.015)).a;
  float edge = q + sin(a * 31.0 + t * 0.9) * 0.004 + (breakup - 0.5) * 0.03;
  float pulse = 0.55 + 0.45 * sin(q * 260.0 - t * 1.7 + breakup * 6.0);
  lakeFoam = smoothstep(0.962, 0.992, edge) * pulse + smoothstep(0.985, 1.0, q) * 0.6;
  lakeFoam = clamp(lakeFoam, 0.0, 1.0) * (1.0 - uNight * 0.55);
  diffuseColor.rgb = mix(water * (1.0 - uNight * 0.7), vec3(0.9, 0.93, 0.92), lakeFoam);
  diffuseColor.a = mix(0.9, 0.74, smoothstep(0.9, 1.0, q)) + lakeFoam * 0.2;
}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.6, lakeFoam);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
{
  vec2 p = vLakeWorld.xz;
  float t = uTime;
  float dist = length(vViewPosition);
  float fade = 1.0 - smoothstep(60.0, 260.0, dist) * 0.65;
  vec3 n1 = waveSample(p / (9.0 * ${ws.toFixed(2)}) + vec2(t * 0.021, t * 0.013));
  vec3 n2 = waveSample(p / (3.7 * ${ws.toFixed(2)}) + vec2(-t * 0.031, t * 0.026));
  vec3 n3 = waveSample(p / (23.0 * ${ws.toFixed(2)}) + vec2(t * 0.008, -t * 0.011));
  vec3 n4 = waveSample(p / (1.3 * ${ws.toFixed(2)}) + vec2(t * 0.05, t * 0.043));
  vec2 slope = (n1.xy * 0.9 + n2.xy * 0.75 + n3.xy * 0.6 + n4.xy * 0.35 * (1.0 - smoothstep(10.0, 40.0, dist))) * fade;
  // 同心涟漪（浮漂、船桨、跃鱼）
  for (int i = 0; i < ${LAKE_RINGS}; i++) {
    vec4 ring = uRings[i];
    float age = t - ring.z;
    if (age < 0.0 || age > 6.0) continue;
    vec2 d = p - ring.xy;
    float rr = length(d) + 1e-4;
    float front = age * 1.1;
    float w = exp(-pow((rr - front) * 2.2, 2.0)) * exp(-age * 0.55) * ring.w;
    slope += d / rr * sin((rr - front) * 9.0) * w * 1.6;
  }
  slope *= 1.0 - lakeFoam * 0.7;
  lakeWorldNormal = normalize(vec3(-slope.x * 0.55, 1.0, -slope.y * 0.55));
  normal = normalize((viewMatrix * vec4(lakeWorldNormal, 0.0)).xyz);
}`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
{
  // 夜晚：岸边路灯 / 楼宇灯光在波面上的拉长碎影
  vec3 viewDir = normalize(cameraPosition - vLakeWorld);
  float shimmer = pow(max(0.0, lakeWorldNormal.x * 0.8 + lakeWorldNormal.z * 0.6 + 0.12), 6.0);
  float nearShore = smoothstep(0.6, 0.97, lakeShore);
  totalEmissiveRadiance += vec3(1.0, 0.72, 0.38) * shimmer * nearShore * uNight * 1.6;
}`)
      .replace("#include <opaque_fragment>", `{
  // 远岸树线与建筑在掠射角下的倒影（天空盒反射之外的近景遮挡）
  vec3 viewDir = normalize(cameraPosition - vLakeWorld);
  vec3 refl = reflect(-viewDir, lakeWorldNormal);
  float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(viewDir, lakeWorldNormal), 0.0, 1.0), 5.0);
  float treeLine = ${options.treeLine === false ? "0.0" : "(1.0 - smoothstep(0.02, 0.2, refl.y)) * smoothstep(0.25, 0.9, lakeShore)"};
  vec3 treeColour = mix(vec3(0.07, 0.12, 0.07), vec3(0.015, 0.02, 0.03), uNight);
  outgoingLight = mix(outgoingLight, treeColour, treeLine * fres * 0.85 * (1.0 - lakeFoam));
}
#include <opaque_fragment>`);
  };
  const key = `v3-water-2-${ws}-${options.treeLine === false ? 0 : 1}-${profile.length}-${options.deep ?? ""}`;
  material.customProgramCacheKey = () => key;
  material.addEventListener("dispose", () => normalMap.dispose());
  return {
    material,
    normalMap,
    uniforms,
    ripple(x, z, seconds, strength = 1) {
      uniforms.uRings.value[ringCursor].set(x, z, seconds, strength);
      ringCursor = (ringCursor + 1) % LAKE_RINGS;
    },
    dispose() {
      material.dispose();
      normalMap.dispose();
    },
  };
}
