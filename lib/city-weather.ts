import * as THREE from "three";
import type { CitySurface } from "./city-surfaces";
import type { SeasonState } from "./city-seasons";

/** Shared uniforms let thousands of instanced surfaces change without rebuilding materials. */
export function createCityWeather() {
  const uniforms = {
    citySnow: { value: 0 },
    cityWetness: { value: 0 },
    /** 夜景路面「雨后湿润」光泽：参照夜景概念图，沥青在夜间变暗并带镜面高光。 */
    cityNightWet: { value: 0 },
    cityAutumn: { value: 0 },
    cityWinter: { value: 0 },
    cityWindTime: { value: 0 },
    cityGrass: { value: new THREE.Color("#699c56") },
  };
  const attached = new WeakSet<THREE.Material>();

  function attach(material: THREE.MeshStandardMaterial, kind: CitySurface) {
    if (attached.has(material)) return;
    attached.add(material);
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    const foliage = kind === "foliage";
    const ground = ["asphalt", "path", "concrete", "soil", "grass", "roof"].includes(kind);
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
        varying vec3 vWeatherPosition;
        varying vec3 vWeatherNormal;
        uniform float cityWindTime;`)
        .replace("#include <project_vertex>", `
          ${foliage ? `
            // Leaf clusters move a few centimetres; roots and branches stay grounded.
            transformed.x += sin(cityWindTime * 1.4 + transformed.y * 3.1 + transformed.z) * 0.018;
            transformed.z += sin(cityWindTime * 1.1 + transformed.x * 2.8) * 0.012;
          ` : ""}
          mat4 weatherMatrix = modelMatrix;
          #ifdef USE_INSTANCING
            weatherMatrix *= instanceMatrix;
          #endif
          #ifdef USE_BATCHING
            weatherMatrix *= batchingMatrix;
          #endif
          vWeatherNormal = inverseTransformDirection(transformedNormal, viewMatrix);
          vWeatherPosition = (weatherMatrix * vec4(transformed, 1.0)).xyz;
          #include <project_vertex>`);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
        varying vec3 vWeatherPosition;
        varying vec3 vWeatherNormal;
        uniform float citySnow, cityWetness, cityAutumn, cityWinter, cityNightWet;
        uniform vec3 cityGrass;
        float weatherNoise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          vec4 h = fract(sin(vec4(dot(i, vec2(127.1, 311.7)),
            dot(i + vec2(1., 0.), vec2(127.1, 311.7)),
            dot(i + vec2(0., 1.), vec2(127.1, 311.7)),
            dot(i + vec2(1.), vec2(127.1, 311.7)))) * 43758.5453);
          return mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y);
        }`)
        .replace("#include <alphatest_fragment>", `
          ${foliage ? `
            float retainedLeaves = weatherNoise(floor(vWeatherPosition.xz * 2.4) + floor(vWeatherPosition.y * 2.4));
            if (retainedLeaves < cityWinter * 0.72) discard;
          ` : ""}
          #include <alphatest_fragment>`)
        .replace("#include <lights_physical_fragment>", `
          float weatherUp = smoothstep(0.38, 0.82, normalize(vWeatherNormal).y);
          float weatherPatch = weatherNoise(vWeatherPosition.xz * 0.72);
          ${foliage ? `
            float branchSeed = weatherNoise(floor(vWeatherPosition.xz * 0.7));
            vec3 fallTone = mix(vec3(0.35, 0.09, 0.025), vec3(0.75, 0.38, 0.055), branchSeed);
            diffuseColor.rgb = mix(diffuseColor.rgb, fallTone, cityAutumn * 0.88);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13, 0.17, 0.11), cityWinter * 0.6);
          ` : ""}
          ${kind === "grass" ? `
            float grassLuminance = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            diffuseColor.rgb = cityGrass * (0.66 + grassLuminance * 1.6);
          ` : ""}
          ${ground ? `
            float puddle = smoothstep(0.44, 0.79, weatherPatch) * cityWetness * weatherUp;
            diffuseColor.rgb *= 1.0 - puddle * 0.25;
            roughnessFactor = mix(roughnessFactor, 0.09, puddle * 0.88);
          ` : ""}
          ${kind === "asphalt" ? `
            // 沥青颗粒与修补块：两级噪声打破大面积纯色。
            float asphaltGrain = weatherNoise(vWeatherPosition.xz * 9.0) * 0.6 + weatherNoise(vWeatherPosition.xz * 31.0) * 0.4;
            float asphaltPatch = smoothstep(0.55, 0.8, weatherNoise(vWeatherPosition.xz * 0.11 + 7.0));
            diffuseColor.rgb *= (0.9 + asphaltGrain * 0.18) * (1.0 - asphaltPatch * 0.16);
            float nightSheen = cityNightWet * weatherUp;
            diffuseColor.rgb *= 1.0 - nightSheen * 0.38;
            roughnessFactor = mix(roughnessFactor, 0.14 + weatherPatch * 0.22, nightSheen);
          ` : ""}
          float snowCover = citySnow * weatherUp * smoothstep(0.12, 0.62, weatherPatch + citySnow * 0.35);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.87, 0.9), snowCover);
          roughnessFactor = mix(roughnessFactor, 0.87, snowCover);
          #include <lights_physical_fragment>`);
    };
    material.customProgramCacheKey = () => `${key}:seasonal-weather-3:${kind}`;
    material.needsUpdate = true;
  }

  function update(seconds: number, state: SeasonState, night = false) {
    uniforms.cityNightWet.value = night ? 1 : 0;
    const amount = (season: SeasonState["season"]) =>
      (state.season === season ? 1 - state.blend : 0) + (state.nextSeason === season ? state.blend : 0);
    uniforms.citySnow.value = amount("winter") * 0.82;
    uniforms.cityWetness.value = amount("summer") * (0.24 + state.precipitation * 0.62) + amount("spring") * 0.12;
    uniforms.cityAutumn.value = amount("autumn");
    uniforms.cityWinter.value = amount("winter");
    uniforms.cityGrass.value.copy(state.grassColor);
    uniforms.cityWindTime.value = seconds;
  }
  return { attach, update };
}
