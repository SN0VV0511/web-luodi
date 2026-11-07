import * as THREE from "three";
import type { WeatheredMaterialState, WeatheringSubstrate } from "../physics/material-weathering";

export type WeatheredMaterialBinding = {
  update: (state: WeatheredMaterialState, seconds: number) => void;
  restore: () => void;
};

export function bindWeatheredSurface(material: THREE.MeshStandardMaterial, substrate: WeatheringSubstrate): WeatheredMaterialBinding {
  const water = { value: new THREE.Vector4() };
  const decay = { value: new THREE.Vector4() };
  const deposit = { value: new THREE.Vector4() };
  const time = { value: 0 };
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey.bind(material);
  const previousKeyValue = previousKey();
  const baseRoughness = material.roughness;
  const baseMetalness = material.metalness;
  const isWood = substrate === "wood" || substrate === "rope";
  const isFabric = substrate === "fabric" || substrate === "paper";
  const isMetal = substrate === "steel" || substrate === "aluminium" || substrate === "zinc";
  const isSteel = substrate === "steel" || substrate === "paint";
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.weatheredWater = water;
    shader.uniforms.weatheredDecay = decay;
    shader.uniforms.weatheredDeposit = deposit;
    shader.uniforms.weatheredTime = time;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      varying vec3 weatheredPosition;
      varying vec3 weatheredNormal;
      varying vec3 weatheredLocal;
    `);
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      mat4 weatheredTransform = modelMatrix;
      #ifdef USE_BATCHING
        weatheredTransform *= batchingMatrix;
      #endif
      #ifdef USE_INSTANCING
        weatheredTransform *= instanceMatrix;
      #endif
      weatheredPosition = (weatheredTransform * vec4(position, 1.0)).xyz;
      weatheredLocal = position;
    `);
    shader.vertexShader = shader.vertexShader.replace("#include <defaultnormal_vertex>", `#include <defaultnormal_vertex>
      weatheredNormal = inverseTransformDirection(transformedNormal, viewMatrix);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform vec4 weatheredWater;
      uniform vec4 weatheredDecay;
      uniform vec4 weatheredDeposit;
      uniform float weatheredTime;
      varying vec3 weatheredPosition;
      varying vec3 weatheredNormal;
      varying vec3 weatheredLocal;
      float weatheredHash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 31.32);
        return fract((p.x + p.y) * p.z);
      }
      float weatheredNoise(vec3 p) {
        vec3 cell = floor(p);
        vec3 f = fract(p);
        vec3 b = f * f * (3.0 - 2.0 * f);
        float a = mix(weatheredHash(cell), weatheredHash(cell + vec3(1.0, 0.0, 0.0)), b.x);
        float c = mix(weatheredHash(cell + vec3(0.0, 1.0, 0.0)), weatheredHash(cell + vec3(1.0, 1.0, 0.0)), b.x);
        float d = mix(weatheredHash(cell + vec3(0.0, 0.0, 1.0)), weatheredHash(cell + vec3(1.0, 0.0, 1.0)), b.x);
        float e = mix(weatheredHash(cell + vec3(0.0, 1.0, 1.0)), weatheredHash(cell + vec3(1.0, 1.0, 1.0)), b.x);
        return mix(mix(a, c, b.y), mix(d, e, b.y), b.z);
      }
      float weatheredFractal(vec3 p) {
        float first = weatheredNoise(p);
        float second = weatheredNoise(p * 2.03 + vec3(3.1, 7.4, 1.8));
        float third = weatheredNoise(p * 4.11 + vec3(9.3, 2.6, 4.1));
        return first * 0.57 + second * 0.29 + third * 0.14;
      }
      float weatheredVoronoi(vec3 p) {
        vec3 cell = floor(p);
        vec3 local = fract(p);
        float first = 4.0;
        float second = 4.0;
        for (int z = -1; z <= 1; z++) {
          for (int x = -1; x <= 1; x++) {
            vec3 offset = vec3(float(x), 0.0, float(z));
            vec3 seed = cell + offset;
            vec3 jitter = vec3(weatheredHash(seed), weatheredHash(seed + 1.7), weatheredHash(seed + 3.9));
            float distance = length(offset + jitter - local);
            if (distance < first) {
              second = first;
              first = distance;
            } else second = min(second, distance);
          }
        }
        return second - first;
      }
      float weatheredRunoff(vec3 p) {
        float channel = weatheredNoise(vec3(p.x * 21.0, p.y * 0.22, p.z * 21.0));
        float streak = smoothstep(0.56, 0.77, channel);
        float breaks = smoothstep(0.28, 0.64, weatheredNoise(p * vec3(3.0, 0.7, 3.0)));
        return streak * breaks;
      }
      float weatheredGrain(vec3 p) {
        float waviness = weatheredNoise(p * vec3(1.6, 0.16, 1.6));
        float ring = sin(length(p.xz + waviness * 0.05) * 240.0 + waviness * 4.0);
        float fiber = weatheredNoise(p * vec3(120.0, 3.0, 120.0));
        return smoothstep(-0.65, 0.8, ring) * 0.6 + fiber * 0.4;
      }
      float weatheredWeave(vec3 p) {
        float warp = abs(sin(p.x * 280.0 + sin(p.y * 140.0) * 0.15));
        float weft = abs(sin(p.y * 280.0 + sin(p.x * 140.0) * 0.15));
        return min(warp, weft);
      }
      vec4 weatheredMasks(vec3 p, vec3 facing) {
        float upward = smoothstep(-0.15, 0.8, facing.y);
        float broad = weatheredFractal(p * 4.0);
        float fine = weatheredNoise(p * 48.0);
        float pooling = smoothstep(0.3, 0.75, broad) * upward;
        float waterFilm = weatheredWater.x * (0.45 + pooling * 0.4 + weatheredRunoff(p) * 0.15);
        float corrosion = smoothstep(1.0 - weatheredDecay.x * 0.9, 1.0 - weatheredDecay.x * 0.9 + 0.12, broad * 0.7 + fine * 0.3);
        float dirt = weatheredDeposit.x * (0.45 + upward * 0.35 + (1.0 - broad) * 0.2);
        float salt = weatheredDeposit.y * smoothstep(0.52, 0.72, fine) * (1.0 - waterFilm);
        return vec4(waterFilm, corrosion, dirt, salt);
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec4 weatheredMask = weatheredMasks(weatheredPosition, normalize(weatheredNormal));
      float weatheredBroad = weatheredFractal(weatheredPosition * 3.0);
      float weatheredStreak = weatheredRunoff(weatheredPosition);
      vec3 weatheredRust = mix(vec3(0.12, 0.035, 0.008), vec3(0.39, 0.16, 0.045), weatheredBroad);
      vec3 weatheredOxide = ${isSteel ? "weatheredRust" : "vec3(0.42, 0.46, 0.45)"};
      ${isMetal || substrate === "paint" ? "diffuseColor.rgb = mix(diffuseColor.rgb, weatheredOxide, weatheredMask.y * (0.55 + weatheredStreak * 0.45));" : ""}
      float weatheredBleach = weatheredDeposit.w * (0.6 + max(0.0, weatheredNormal.y) * 0.4);
      vec3 weatheredFaded = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722))), 0.4) * 1.12;
      diffuseColor.rgb = mix(diffuseColor.rgb, weatheredFaded, weatheredBleach);
      diffuseColor.rgb *= 1.0 - weatheredMask.x * ${isWood || isFabric ? "0.3" : "0.12"};
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.21, 0.16), weatheredMask.z * 0.55);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.73, 0.75, 0.7), weatheredMask.w * 0.7);
      float weatheredBio = weatheredDeposit.z * smoothstep(0.28, 0.64, weatheredBroad) * (0.6 + weatheredStreak * 0.4);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.14, 0.22, 0.09), weatheredBio);
      float weatheredFrost = weatheredWater.z * smoothstep(-0.1, 0.75, weatheredNormal.y);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.79, 0.85, 0.87), weatheredFrost * 0.8);
      ${isWood ? `
        float weatheredFiber = weatheredGrain(weatheredLocal);
        diffuseColor.rgb *= 0.85 + weatheredFiber * 0.22;
        float weatheredSplit = smoothstep(0.8, 0.97, weatheredNoise(weatheredLocal * vec3(90.0, 0.8, 90.0)));
        diffuseColor.rgb *= 1.0 - weatheredSplit * weatheredDecay.w * 0.6;
      ` : ""}
      ${isFabric ? `
        float weatheredThread = weatheredWeave(weatheredLocal);
        diffuseColor.rgb *= 0.9 + weatheredThread * 0.15;
      ` : ""}
      ${substrate === "paint" ? `
        float weatheredPeel = smoothstep(0.02, 0.12, weatheredVoronoi(weatheredLocal * 18.0));
        float weatheredCoating = weatheredDecay.z * (1.0 - weatheredPeel);
        diffuseColor.rgb = mix(diffuseColor.rgb, weatheredRust, weatheredCoating);
      ` : ""}
      ${substrate === "rubber" ? `
        float weatheredCraze = 1.0 - smoothstep(0.012, 0.055, weatheredVoronoi(weatheredLocal * 35.0));
        diffuseColor.rgb *= 1.0 - weatheredCraze * weatheredDecay.w * 0.7;
      ` : ""}
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      vec4 weatheredRoughMask = weatheredMasks(weatheredPosition, normalize(weatheredNormal));
      roughnessFactor = clamp(roughnessFactor + weatheredRoughMask.y * 0.28 + weatheredRoughMask.z * 0.1 + weatheredRoughMask.w * 0.15, 0.04, 1.0);
      roughnessFactor = mix(roughnessFactor, 0.16, weatheredRoughMask.x * 0.65);
      roughnessFactor = mix(roughnessFactor, 0.74, weatheredWater.z * 0.4);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
      vec4 weatheredMetalMask = weatheredMasks(weatheredPosition, normalize(weatheredNormal));
      metalnessFactor *= 1.0 - max(weatheredMetalMask.y * 0.88, weatheredMetalMask.w * 0.6);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      float weatheredMicro = weatheredNoise(weatheredPosition * 70.0) * weatheredDecay.x;
      weatheredMicro += weatheredNoise(weatheredPosition * 120.0) * weatheredDeposit.y * 0.4;
      float weatheredDx = dFdx(weatheredMicro);
      float weatheredDy = dFdy(weatheredMicro);
      normal = normalize(normal + vec3(-weatheredDx, -weatheredDy, 0.0) * 0.2);
    `);
  };
  material.customProgramCacheKey = () => `${previousKeyValue}:surface-weathering:${substrate}`;
  material.needsUpdate = true;
  return {
    update(state, seconds) {
      water.value.set(state.film, state.absorbedWater, state.frost, state.swelling);
      decay.value.set(state.oxidation, state.patina, state.coatingLoss, state.cracking);
      deposit.value.set(state.dirt, state.saltCrystals, state.biologicalFilm, state.bleaching);
      time.value = seconds;
      material.roughness = clampRoughness(baseRoughness + state.roughness * 0.35);
      material.metalness = baseMetalness * (1 - state.metalLoss * 0.75);
    },
    restore() {
      material.onBeforeCompile = previousCompile;
      material.customProgramCacheKey = () => previousKeyValue;
      material.roughness = baseRoughness;
      material.metalness = baseMetalness;
      material.needsUpdate = true;
    },
  };
}

function clampRoughness(value: number): number {
  return Math.max(0.04, Math.min(1, value));
}
