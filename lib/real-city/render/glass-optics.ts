import * as THREE from "three";
import type { SeasonState } from "../../city-seasons";

const glassFunctions = /* glsl */ `
varying vec3 vOpticalWorldPosition;
varying vec3 vOpticalWorldNormal;
uniform float cityGlassWater;
uniform float cityGlassFrost;
uniform float cityGlassTime;
uniform float cityGlassCondensation;

float glassHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float glassNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 fraction = fract(p);
  vec2 blend = fraction * fraction * (3.0 - 2.0 * fraction);
  return mix(mix(glassHash(cell), glassHash(cell + vec2(1.0, 0.0)), blend.x),
    mix(glassHash(cell + vec2(0.0, 1.0)), glassHash(cell + vec2(1.0)), blend.x), blend.y);
}

vec2 glassPlane(vec3 position, vec3 n) {
  vec3 absoluteNormal = abs(n);
  if (absoluteNormal.y > 0.75) return position.xz;
  if (absoluteNormal.x > absoluteNormal.z) return position.zy;
  return position.xy;
}

vec3 glassDrop(vec2 uv, float density) {
  vec2 scaled = uv * vec2(18.0, 12.0);
  vec2 cell = floor(scaled);
  vec2 local = fract(scaled);
  float seed = glassHash(cell);
  vec2 center = vec2(0.2 + glassHash(cell + 17.0) * 0.6,
    0.25 + glassHash(cell + 31.0) * 0.5);
  float radius = 0.06 + seed * 0.18;
  vec2 delta = (local - center) / vec2(1.0, 0.75);
  float distance = length(delta);
  float pixel = max(length(fwidth(scaled)), 0.002);
  float droplet = 1.0 - smoothstep(radius - pixel, radius + pixel, distance);
  float dropPresence = smoothstep(1.0 - density, 1.0 - density + 0.08, seed);
  float resolved = 1.0 - smoothstep(0.35, 1.2, pixel);
  droplet *= dropPresence * resolved;
  vec2 bend = delta / max(radius, 0.01) * droplet;
  return vec3(bend, droplet);
}

vec3 glassRunningDrop(vec2 uv, float flow) {
  float lane = floor(uv.x * 5.0);
  float seed = glassHash(vec2(lane, 9.0));
  float speed = 0.16 + seed * 0.4;
  float phase = fract(cityGlassTime * speed * 0.18 + seed * 7.0);
  float headHeight = (1.0 - phase) * 2.0;
  float x = fract(uv.x * 5.0) - 0.2 - seed * 0.6;
  x += sin(uv.y * 5.0 + seed * 25.0) * 0.025;
  float y = mod(uv.y, 2.0) - headHeight;
  vec2 delta = vec2(x * 2.0, y * 3.5);
  float distance = length(delta);
  float pixel = max(length(fwidth(delta)), 0.002);
  float head = 1.0 - smoothstep(0.14 - pixel, 0.14 + pixel, distance);
  float trailWidth = 0.018 + flow * 0.014;
  float trail = 1.0 - smoothstep(trailWidth - pixel, trailWidth + pixel, abs(x));
  trail *= smoothstep(0.01, 0.09, y) * (1.0 - smoothstep(0.3, 1.3, y));
  float laneActive = smoothstep(1.0 - flow, 1.1 - flow, seed);
  float resolved = 1.0 - smoothstep(0.2, 0.8, pixel);
  float water = max(head, trail * 0.5) * laneActive * resolved;
  return vec3(delta * head + vec2(x * trail * 1.4, 0.0), water) * resolved;
}

float glassCrystal(vec2 p) {
  float pixel = max(length(fwidth(p)), 0.0001);
  float seed = glassHash(floor(p));
  vec2 local = fract(p) - 0.5;
  float rotation = seed * 6.2831853;
  mat2 rotate = mat2(cos(rotation), -sin(rotation), sin(rotation), cos(rotation));
  local = rotate * local;
  float a = abs(local.x);
  float b = abs(dot(local, vec2(0.5, 0.8660254)));
  float c = abs(dot(local, vec2(-0.5, 0.8660254)));
  float branch = min(a, min(b, c));
  float crystal = 1.0 - smoothstep(0.015 - pixel, 0.035 + pixel, branch);
  crystal *= 1.0 - smoothstep(0.2, 0.5, length(local));
  return mix(0.18, crystal, 1.0 - smoothstep(0.2, 0.9, pixel));
}

vec3 glassPerturbNormal(vec3 viewNormal, vec3 worldPosition, vec2 plane, vec2 slope) {
  vec3 eyePosition = (viewMatrix * vec4(worldPosition, 1.0)).xyz;
  vec3 dx = dFdx(eyePosition);
  vec3 dy = dFdy(eyePosition);
  vec2 uvDx = dFdx(plane);
  vec2 uvDy = dFdy(plane);
  vec3 perpendicularX = cross(dy, viewNormal);
  vec3 perpendicularY = cross(viewNormal, dx);
  vec3 tangent = perpendicularX * uvDx.x + perpendicularY * uvDy.x;
  vec3 bitangent = perpendicularX * uvDx.y + perpendicularY * uvDy.y;
  float normalization = inversesqrt(max(0.000001, max(dot(tangent, tangent), dot(bitangent, bitangent))));
  return normalize(viewNormal + (tangent * slope.x + bitangent * slope.y) * normalization);
}
`;

const glassResponse = /* glsl */ `
  vec3 opticalNormal = normalize(vOpticalWorldNormal);
  vec2 opticalPlane = glassPlane(vOpticalWorldPosition, opticalNormal);
  float verticalGlass = 1.0 - smoothstep(0.35, 0.85, abs(opticalNormal.y));
  float opticalHeight = mod(vOpticalWorldPosition.y, 3.2) / 3.2;
  float runoff = cityGlassWater * verticalGlass;
  vec3 staticDrop = glassDrop(opticalPlane, runoff * 0.72);
  vec3 runningDrop = glassRunningDrop(opticalPlane, runoff);
  vec2 dropletBend = staticDrop.xy * 0.12 + runningDrop.xy * 0.16;
  normal = glassPerturbNormal(normal, vOpticalWorldPosition, opticalPlane, dropletBend);
  float waterCoverage = max(staticDrop.z, runningDrop.z);
  roughnessFactor = mix(roughnessFactor, 0.055, waterCoverage * 0.75);
  float condensation = cityGlassCondensation * verticalGlass
    * (1.0 - smoothstep(0.12, 0.65, opticalHeight));
  float condensationPatch = glassNoise(opticalPlane * 3.0);
  condensation *= smoothstep(0.2, 0.8, condensationPatch);
  roughnessFactor = mix(roughnessFactor, 0.44, condensation);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.58, 0.58), condensation * 0.18);
  float frostEdge = 1.0 - smoothstep(0.02, 0.28, opticalHeight);
  float crystals = glassCrystal(opticalPlane * 28.0);
  float frost = cityGlassFrost * verticalGlass * frostEdge
    * (0.3 + crystals * 0.7);
  roughnessFactor = mix(roughnessFactor, 0.72, frost);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.65, 0.72, 0.74), frost * 0.6);
  float opticalFacing = abs(dot(normalize(cameraPosition - vOpticalWorldPosition), opticalNormal));
  float opticalFresnel = 0.0426 + 0.9574 * pow(1.0 - opticalFacing, 5.0);
  if (diffuseColor.a < 0.999) {
    diffuseColor.a = mix(diffuseColor.a, 0.95, opticalFresnel * 0.55);
    diffuseColor.a = mix(diffuseColor.a, 0.82, frost * 0.8 + condensation * 0.15);
  }
`;

export class CityGlassOptics {
  private readonly uniforms = {
    cityGlassWater: { value: 0 },
    cityGlassFrost: { value: 0 },
    cityGlassTime: { value: 0 },
    cityGlassCondensation: { value: 0 },
  };
  private previousSeconds: number | null = null;
  private readonly materials = new Set<THREE.MeshStandardMaterial>();

  constructor(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (!(material instanceof THREE.MeshStandardMaterial) || this.materials.has(material)) continue;
        const physical = material as THREE.MeshPhysicalMaterial;
        const glazing = material.userData.cityGlazing === true
          || physical.isMeshPhysicalMaterial && physical.ior > 1.4 && physical.ior < 1.65
          && physical.transparent && physical.roughness < 0.3;
        if (glazing && !/water|puddle|foam|wave/i.test(material.name)) this.attach(material);
      }
    });
  }

  update(seconds: number, season: SeasonState): void {
    const reset = this.previousSeconds === null || seconds < this.previousSeconds;
    const dt = reset ? 0 : Math.min(0.25, Math.max(0, seconds - this.previousSeconds!));
    this.previousSeconds = seconds;
    const rain = season.temperatureC > 1 ? season.precipitation : 0;
    const frost = season.temperatureC < -1 ? Math.min(1, (-season.temperatureC - 1) / 12) : 0;
    const condensation = THREE.MathUtils.clamp((10 - season.temperatureC) / 20, 0, 0.5);
    const waterTarget = THREE.MathUtils.clamp(rain * 1.1, 0, 1);
    const water = this.uniforms.cityGlassWater;
    const drying = waterTarget < water.value;
    const response = reset ? 1 : 1 - Math.exp(-dt / (drying ? 18 : 3));
    water.value += (waterTarget - water.value) * response;
    const thermalBlend = reset ? 1 : 1 - Math.exp(-dt / 12);
    this.uniforms.cityGlassFrost.value += (frost - this.uniforms.cityGlassFrost.value) * thermalBlend;
    this.uniforms.cityGlassCondensation.value += (condensation - this.uniforms.cityGlassCondensation.value) * thermalBlend;
    this.uniforms.cityGlassTime.value = seconds;
  }

  private attach(material: THREE.MeshStandardMaterial): void {
    this.materials.add(material);
    material.forceSinglePass = true;
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
          varying vec3 vOpticalWorldPosition;
          varying vec3 vOpticalWorldNormal;`)
        .replace("#include <project_vertex>", `
          mat4 opticalTransform = modelMatrix;
          #ifdef USE_INSTANCING
            opticalTransform *= instanceMatrix;
          #endif
          #ifdef USE_BATCHING
            opticalTransform *= batchingMatrix;
          #endif
          vOpticalWorldPosition = (opticalTransform * vec4(transformed, 1.0)).xyz;
          vOpticalWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
          #include <project_vertex>`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${glassFunctions}`)
        .replace("#include <lights_physical_fragment>", `${glassResponse}\n#include <lights_physical_fragment>`);
    };
    material.customProgramCacheKey = () => `${key}:weathered-glass-optics-v1`;
    material.needsUpdate = true;
  }
}
