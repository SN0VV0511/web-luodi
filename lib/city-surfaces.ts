import * as THREE from "three";

/** 世界坐标表面种类。颜色仍由材质和实例色决定，这里只加颗粒、缝、磨损和叶片层次。 */
export type CitySurface =
  | "asphalt"
  | "concrete"
  | "grass"
  | "stucco"
  | "brick"
  | "roof"
  | "foliage"
  | "bark"
  | "path"
  | "sand"
  | "soil";

const SURFACE_BODY: Record<CitySurface, string> = {
  asphalt: `
    float grit = cityNoise(w * 7.5);
    float pebble = cityHash(floor(w * 26.0));
    float wear = 1.0 - smoothstep(0.0, 0.07, abs(vCityLateral - 0.23));
    float edgeDust = smoothstep(0.4, 0.5, vCityLateral);
    float crack = smoothstep(0.988, 1.0, cityHash(vec2(floor(w.x * 0.85), floor(w.y * 3.4))));
    diffuseColor.rgb *= 0.84 + grit * 0.2 + pebble * 0.07;
    diffuseColor.rgb *= mix(1.0, 0.74, wear * 0.65);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 0.98), edgeDust * 0.45);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, crack);
  `,
  concrete: `
    float grain = cityNoise(w * 3.4);
    float fx = fract(w.x * 0.31);
    float fz = fract(w.y * 0.31);
    float seam = 1.0 - (1.0 - smoothstep(0.0, 0.045, fx)) - (1.0 - smoothstep(0.0, 0.045, fz));
    diffuseColor.rgb *= 0.9 + grain * 0.16;
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.68, diffuseColor.rgb, clamp(seam, 0.0, 1.0));
  `,
  grass: `
    float lawn = cityNoise(w * 0.16);
    float tuft = cityNoise(w * 2.8 + vec2(4.0, 1.0));
    float stripe = 0.95 + 0.05 * sin(w.x * 0.62 + w.y * 0.08);
    vec3 dry = diffuseColor.rgb * vec3(1.12, 1.02, 0.72);
    vec3 lush = diffuseColor.rgb * vec3(0.78, 1.06, 0.82);
    diffuseColor.rgb = mix(lush, dry, lawn * lawn);
    diffuseColor.rgb *= (0.9 + tuft * 0.18) * stripe;
  `,
  stucco: `
    float plaster = cityNoise(w * 5.5 + vCityPos.y * 1.4);
    float pit = cityHash(floor(w * 34.0 + vCityPos.y * 12.0));
    float trowel = 0.97 + 0.03 * sin(vCityPos.y * 52.0);
    diffuseColor.rgb *= (0.9 + plaster * 0.16) * (0.94 + pit * 0.08) * trowel;
  `,
  brick: `
    float row = fract(vCityPos.y * 5.5);
    float stagger = mod(floor(vCityPos.y * 5.5), 2.0);
    float col = fract(vCityPos.x * 2.8 + vCityPos.z * 2.8 + stagger * 0.5);
    float mortar = smoothstep(0.02, 0.1, row) * smoothstep(0.02, 0.1, col);
    float tone = cityHash(floor(vec2(vCityPos.x * 2.8 + vCityPos.z, vCityPos.y * 5.5)));
    diffuseColor.rgb *= mix(0.62, 1.0, mortar);
    diffuseColor.rgb *= 0.88 + tone * 0.2;
  `,
  roof: `
    vec2 tile = vec2(vCityPos.x * 1.85 + vCityPos.z * 0.15, vCityPos.z * 2.6 + vCityPos.y * 1.2);
    vec2 cell = fract(tile);
    float grout = smoothstep(0.0, 0.12, cell.x) * smoothstep(0.0, 0.1, cell.y);
    float tone = cityHash(floor(tile));
    diffuseColor.rgb *= mix(0.58, 1.0, grout);
    diffuseColor.rgb *= 0.84 + tone * 0.24;
  `,
  foliage: `
    float leaf = cityNoise(vCityPos.xz * 0.85 + vCityPos.y * 1.15);
    float clump = cityNoise(vCityPos.xz * 0.28 + 3.0);
    diffuseColor.rgb *= 0.72 + leaf * 0.4;
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.82, diffuseColor.rgb, 0.55 + clump * 0.45);
  `,
  bark: `
    float grain = cityNoise(vec2(w.x * 4.0 + w.y * 4.0, vCityPos.y * 9.0));
    float streak = cityNoise(vec2(floor((w.x + w.y) * 7.0), vCityPos.y * 1.2));
    diffuseColor.rgb *= 0.8 + grain * 0.26 + streak * 0.1;
  `,
  path: `
    vec2 cell = fract(w * vec2(1.25, 1.25) + vec2(0.0, step(0.5, fract(w.x * 0.625)) * 0.5));
    float grout = smoothstep(0.015, 0.09, cell.x) * smoothstep(0.015, 0.09, cell.y);
    float tone = cityHash(floor(w * 1.25));
    diffuseColor.rgb *= mix(0.7, 1.0, grout);
    diffuseColor.rgb *= 0.88 + tone * 0.18;
  `,
  sand: `
    float grain = cityNoise(w * 6.0);
    float ripple = 0.96 + 0.04 * sin(w.x * 1.4 + cityNoise(w * 0.4) * 3.0);
    diffuseColor.rgb *= (0.9 + grain * 0.16) * ripple;
  `,
  soil: `
    float clod = cityNoise(w * 3.2);
    float crumb = cityHash(floor(w * 14.0));
    diffuseColor.rgb *= 0.82 + clod * 0.24 + crumb * 0.08;
  `,
};

type SurfaceState = {
  kind: CitySurface;
  previous: THREE.Material["onBeforeCompile"];
  previousKey: string;
};

// userData 会被材质克隆复制，但编译钩子不会；用实例身份记录安装状态。
const surfaceStates = new WeakMap<THREE.MeshStandardMaterial, SurfaceState>();

/** 标记待合批的表面种类，暂不改变材质的编译钩子。 */
export function markCitySurface(material: THREE.Material, kind: CitySurface): void {
  material.userData.citySurface = kind;
}

/** 在批次合并之后装上表面着色；重复应用幂等，切换种类替换旧效果。 */
export function applyCitySurface(material: THREE.MeshStandardMaterial, kind: CitySurface): void {
  const state = surfaceStates.get(material);
  if (state?.kind === kind) return;
  const previous = state?.previous ?? material.onBeforeCompile;
  const previousKey = state?.previousKey ?? material.customProgramCacheKey();
  surfaceStates.set(material, { kind, previous, previousKey });
  material.userData.citySurfaceApplied = kind;
  material.userData.citySurface = kind;
  const body = SURFACE_BODY[kind];
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCityPos;\nvarying float vCityLateral;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 cityScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vCityPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
          vCityLateral = abs(cityScale.x > cityScale.z ? transformed.z : transformed.x);
        #else
          vCityPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vCityLateral = 0.0;
        #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vCityPos;
        varying float vCityLateral;
        float cityHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float cityNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(cityHash(i), cityHash(i + vec2(1.0, 0.0)), f.x), mix(cityHash(i + vec2(0.0, 1.0)), cityHash(i + vec2(1.0, 1.0)), f.x), f.y);
        }`,
      )
      .replace("#include <color_fragment>", `#include <color_fragment>\nvec2 w = vCityPos.xz;\n${body}`);
  };
  material.customProgramCacheKey = () => `${previousKey}:city-surface-v3:${kind}`;
  material.needsUpdate = true;
}
