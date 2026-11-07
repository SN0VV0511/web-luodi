import * as THREE from "three";
import { cityFilteredSurfaceFunctions } from "./real-city/render/surface-filtering";

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
    float grit = cityGrain(w * 7.5);
    float pebble = cityCellNoise(w * 26.0);
    float wear = 1.0 - smoothstep(0.0, 0.07, abs(vCityLateral - 0.23));
    float edgeDust = smoothstep(0.4, 0.5, vCityLateral);
    float damage = smoothstep(0.67, 0.9, cityNoise(w * 0.08));
    float crack = cityCrack(w * 0.55, 0.012) * damage;
    diffuseColor.rgb *= 0.84 + grit * 0.2 + pebble * 0.07;
    diffuseColor.rgb *= mix(1.0, 0.74, wear * 0.65);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.12, 1.08, 0.98), edgeDust * 0.45);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, crack);
  `,
  concrete: `
    float grain = cityNoise(w * 3.4);
    vec2 concretePlane = cityWallCoordinates(vCityPos);
    float seam = 1.0 - cityGridJoint(concretePlane * 0.31, vec2(0.018));
    diffuseColor.rgb *= 0.9 + grain * 0.16;
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.68, diffuseColor.rgb, clamp(seam, 0.0, 1.0));
  `,
  grass: `
    float lawn = cityNoise(w * 0.16);
    float tuft = cityNoise(w * 2.8 + vec2(4.0, 1.0));
    float stripe = 0.95 + 0.05 * cityFilteredSine(w.x * 0.62 + w.y * 0.08);
    vec3 dry = diffuseColor.rgb * vec3(1.12, 1.02, 0.72);
    vec3 lush = diffuseColor.rgb * vec3(0.78, 1.06, 0.82);
    diffuseColor.rgb = mix(lush, dry, lawn * lawn);
    diffuseColor.rgb *= (0.9 + tuft * 0.18) * stripe;
  `,
  stucco: `
    vec2 plasterPlane = cityWallCoordinates(vCityPos);
    float plaster = cityNoise(plasterPlane * 5.5);
    float pit = cityCellNoise(plasterPlane * 34.0);
    float trowel = 0.97 + 0.03 * cityFilteredSine(vCityPos.y * 52.0);
    diffuseColor.rgb *= (0.9 + plaster * 0.16) * (0.94 + pit * 0.08) * trowel;
  `,
  brick: `
    float stagger = mod(floor(vCityPos.y * 5.5), 2.0);
    vec2 brickPlane = cityWallCoordinates(vCityPos);
    float mortar = 1.0 - cityBrickMortar(brickPlane, vec2(0.357, 0.1818), 0.012);
    float tone = cityBrickTone(brickPlane, vec2(0.357, 0.1818));
    diffuseColor.rgb *= mix(0.62, 1.0, mortar);
    diffuseColor.rgb *= 0.88 + tone * 0.2;
  `,
  roof: `
    vec2 tile = vec2(vCityPos.x * 1.85 + vCityPos.z * 0.15, vCityPos.z * 2.6 + vCityPos.y * 1.2);
    float grout = 1.0 - cityGridJoint(tile, vec2(0.07, 0.05));
    float tone = cityCellNoise(tile);
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
    float streak = cityDirectionalGrain(vec2(w.x + w.y, vCityPos.y), vec2(0.0, 1.0), 7.0);
    diffuseColor.rgb *= 0.8 + grain * 0.26 + streak * 0.1;
  `,
  path: `
    float grout = 1.0 - cityBrickMortar(w, vec2(0.8), 0.025);
    float tone = cityBrickTone(w, vec2(0.8));
    diffuseColor.rgb *= mix(0.7, 1.0, grout);
    diffuseColor.rgb *= 0.88 + tone * 0.18;
  `,
  sand: `
    float grain = cityNoise(w * 6.0);
    float ripple = 0.96 + 0.04 * cityFilteredSine(w.x * 1.4 + cityNoise(w * 0.4) * 3.0);
    diffuseColor.rgb *= (0.9 + grain * 0.16) * ripple;
  `,
  soil: `
    float clod = cityNoise(w * 3.2);
    float crumb = cityCellNoise(w * 14.0);
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
        mat4 citySurfaceMatrix = modelMatrix;
        #ifdef USE_INSTANCING
          vec3 cityScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          citySurfaceMatrix = modelMatrix * instanceMatrix;
          vCityLateral = abs(cityScale.x > cityScale.z ? transformed.z : transformed.x);
        #else
          vCityLateral = 0.0;
        #endif
        #ifdef USE_BATCHING
          citySurfaceMatrix *= batchingMatrix;
        #endif
        vCityPos = (citySurfaceMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vCityPos;
        varying float vCityLateral;
        ${cityFilteredSurfaceFunctions}`,
      )
      .replace("#include <color_fragment>", `#include <color_fragment>\nvec2 w = vCityPos.xz;\n${body}`);
  };
  material.customProgramCacheKey = () => `${previousKey}:city-surface-v5:${kind}`;
  material.needsUpdate = true;
}
