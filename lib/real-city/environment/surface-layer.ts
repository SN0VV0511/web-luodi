import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { createRandom, smoothstep } from "../physics/math";
import { createTerrainPoint } from "./terrain";
import { createSurfaceSample } from "./hydrology";
import { createSurfaceEnergySample } from "./surface-energy";
import { createPuddlePatch, createSnowPatch } from "./surface-geometry";

type PatchSite = { x: number; y: number; z: number; radiusX: number; radiusZ: number; rotation: number; road: boolean };

export function buildGroundWeatherLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, terrain, water, weather, budget } = context;
  const random = createRandom(77123);
  const ground = createTerrainPoint();
  const surface = createSurfaceSample();
  const energy = createSurfaceEnergySample();
  const dummy = new THREE.Object3D();
  const sites: PatchSite[] = [];
  const snowSites: PatchSite[] = [];
  const count = budget.simulatedHz < 60 ? 54 : 92;
  for (let attempt = 0; attempt < 4000 && sites.length < count; attempt++) {
    const x = -212 + random() * 424;
    const z = -210 + random() * 310;
    terrain.sample(x, z, ground);
    if (ground.kind !== "road" && ground.kind !== "pavement" && ground.kind !== "park") continue;
    if (ground.kind === "park" && random() > 0.2) continue;
    if (sites.some(site => Math.hypot(site.x - x, site.z - z) < 7)) continue;
    sites.push({
      x,
      y: ground.height + 0.014,
      z,
      radiusX: ground.kind === "road" ? 0.65 + random() * 1.6 : 0.35 + random() * 0.8,
      radiusZ: 0.3 + random() * 0.75,
      rotation: random() * Math.PI * 2,
      road: ground.kind === "road",
    });
  }
  for (let attempt = 0; attempt < 3000 && snowSites.length < count; attempt++) {
    const x = -212 + random() * 424;
    const z = -210 + random() * 310;
    terrain.sample(x, z, ground);
    if (ground.kind !== "park" && ground.kind !== "pavement") continue;
    if (terrain.onParkWalk(x, z, 0.3)) continue;
    if (snowSites.some(site => Math.hypot(site.x - x, site.z - z) < 6)) continue;
    snowSites.push({ x, y: ground.height + 0.009, z, radiusX: 1.8 + random() * 3.2, radiusZ: 1.3 + random() * 2.5, rotation: random() * Math.PI * 2, road: false });
  }
  const timeUniform = { value: 0 };
  const rainUniform = { value: 0 };
  const frostUniform = { value: 0 };
  const puddleMaterial = resources.material("shallow puddle water", () => new THREE.MeshPhysicalMaterial({
    color: "#596b72",
    roughness: 0.09,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  }));
  puddleMaterial.onBeforeCompile = shader => {
    shader.uniforms.surfaceTime = timeUniform;
    shader.uniforms.surfaceRain = rainUniform;
    shader.uniforms.surfaceFrost = frostUniform;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      varying vec2 puddleUv;
    `).replace("#include <begin_vertex>", `#include <begin_vertex>
      puddleUv = uv;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform float surfaceTime;
      uniform float surfaceRain;
      uniform float surfaceFrost;
      varying vec2 puddleUv;
      float puddleNoise(vec2 p) {
        return fract(sin(dot(floor(p), vec2(81.23, 13.71))) * 4317.57);
      }
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      vec2 rippleCell = floor(puddleUv * 5.0);
      vec2 rippleCenter = (rippleCell + vec2(puddleNoise(rippleCell), puddleNoise(rippleCell + 12.1))) / 5.0;
      vec2 rippleVector = puddleUv - rippleCenter;
      float rippleDistance = length(rippleVector);
      float rippleAge = fract(surfaceTime * 0.9 + puddleNoise(rippleCell));
      float ripple = sin(rippleDistance * 140.0 - rippleAge * 22.0) * exp(-rippleDistance * 12.0) * (1.0 - rippleAge);
      normal.x += rippleVector.x * ripple * surfaceRain * 0.22;
      normal.y += rippleVector.y * ripple * surfaceRain * 0.22;
      normal = normalize(normal);
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      vec2 fromCenter = puddleUv - 0.5;
      float edge = smoothstep(0.08, 0.45, length(fromCenter));
      diffuseColor.a *= 0.65 + edge * 0.35;
      float iceCrack = smoothstep(0.965, 0.99, abs(sin(puddleUv.x * 38.0 + sin(puddleUv.y * 17.0) * 3.0)));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.65, 0.73, 0.75), surfaceFrost * (0.55 + iceCrack * 0.3));
    `);
  };
  puddleMaterial.customProgramCacheKey = () => "ground-puddle-rain-ice";
  const snowTexture = resources.canvas("snow granular surface", 128, 128, canvas => {
    const random = createRandom(937);
    canvas.fillStyle = "#eeeeeb";
    canvas.fillRect(0, 0, 128, 128);
    for (let index = 0; index < 3200; index++) {
      const shade = 180 + Math.floor(random() * 75);
      canvas.fillStyle = `rgba(${shade},${shade},${Math.min(255, shade + 5)},0.5)`;
      canvas.fillRect(random() * 128, random() * 128, 0.5 + random(), 0.5 + random());
    }
  });
  const snowMaterial = resources.material("granular accumulated snow", () => new THREE.MeshStandardMaterial({
    color: "#edf0ed",
    map: snowTexture,
    bumpMap: snowTexture,
    bumpScale: 0.025,
    vertexColors: true,
    roughness: 0.94,
    metalness: 0,
  }));
  const puddleGeometry = resources.geometry("irregular puddle contour", () => createPuddlePatch(118));
  const snowGeometry = resources.geometry("volumetric snow drift", () => createSnowPatch(37));
  const puddles = resources.batch("rainwater puddles", puddleGeometry, puddleMaterial, sites.length, true);
  const snow = resources.batch("snow accumulation", snowGeometry, snowMaterial, snowSites.length, true);
  const ice = resources.batch("refrozen surface patches", puddleGeometry, puddleMaterial, sites.length, true);
  puddles.frustumCulled = false;
  snow.frustumCulled = false;
  ice.frustumCulled = false;
  puddles.count = 0;
  snow.count = 0;
  ice.count = 0;
  let revision = -1;
  const snowTint = new THREE.Color();
  return {
    update(seconds, night) {
      timeUniform.value = seconds;
      rainUniform.value = weather.state.rain;
      frostUniform.value = 1 - smoothstep(-2, 1, weather.state.temperature);
      puddleMaterial.envMapIntensity = night ? 0.35 : 0.95;
      if (revision === water.revision) return;
      revision = water.revision;
      let puddleCount = 0;
      let iceCount = 0;
      let snowCount = 0;
      for (const site of sites) {
        water.sample(site.x, site.z, surface);
        const pooled = smoothstep(0.0008, 0.006, surface.water);
        if (pooled > 0.025) {
          dummy.position.set(site.x, site.y, site.z);
          dummy.rotation.set(0, site.rotation, 0);
          dummy.scale.set(site.radiusX * pooled, 1, site.radiusZ * pooled);
          dummy.updateMatrix();
          puddles.setMatrixAt(puddleCount++, dummy.matrix);
        }
        const frozen = smoothstep(0.0002, 0.005, surface.ice);
        if (frozen > 0.02) {
          dummy.position.set(site.x, site.y + 0.002, site.z);
          dummy.rotation.set(0, site.rotation, 0);
          dummy.scale.set(site.radiusX * frozen, 1, site.radiusZ * frozen);
          dummy.updateMatrix();
          ice.setMatrixAt(iceCount++, dummy.matrix);
        }
      }
      for (const site of snowSites) {
        water.sample(site.x, site.z, surface);
        water.energy.sample(site.x, site.z, energy);
        const coverage = smoothstep(0.001, 0.035, surface.snow);
        if (coverage < 0.02) continue;
        dummy.position.set(site.x, site.y, site.z);
        dummy.rotation.set(0, site.rotation, 0);
        dummy.scale.set(site.radiusX * Math.sqrt(coverage), Math.max(0.006, surface.snow), site.radiusZ * Math.sqrt(coverage));
        dummy.updateMatrix();
        snow.setMatrixAt(snowCount, dummy.matrix);
        const albedo = water.energy.ready ? Math.max(0.65, energy.snowAlbedo / 0.85) : 1;
        snowTint.setRGB(albedo - surface.footprint * 0.14, albedo - surface.footprint * 0.15, albedo - surface.footprint * 0.12);
        snowMaterial.bumpScale = 0.012 + energy.snowRoughness * 3;
        snow.setColorAt(snowCount, snowTint);
        snowCount++;
      }
      puddles.count = puddleCount;
      puddles.instanceMatrix.needsUpdate = true;
      ice.count = iceCount;
      ice.instanceMatrix.needsUpdate = true;
      snow.count = snowCount;
      snow.instanceMatrix.needsUpdate = true;
      if (snow.instanceColor) snow.instanceColor.needsUpdate = true;
    },
    reset() {
      revision = -1;
      puddles.count = 0;
      snow.count = 0;
      ice.count = 0;
    },
  };
}
