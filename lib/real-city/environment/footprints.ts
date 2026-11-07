import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import type { GroundImpact } from "./interactions";
import { createFootprintImpression } from "./surface-geometry";
import { createSurfaceSample } from "./hydrology";
import { createSurfaceEnergySample } from "./surface-energy";
import { clamp } from "../physics/math";
import { GroundImpression, type ImpressionGround, type ImpressionWeather } from "../physics/ground-impression";

type FootMark = { x: number; y: number; z: number; heading: number; born: number; strength: number; snow: boolean; active: boolean; impression: GroundImpression };

export function buildFootprintLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, water, weather, interactions, budget } = context;
  const capacity = budget.simulatedHz < 60 ? 40 : 72;
  const marks: FootMark[] = Array.from({ length: capacity }, () => ({ x: 0, y: 0, z: 0, heading: 0, born: 0, strength: 0, snow: false, active: false, impression: new GroundImpression() }));
  const surface = createSurfaceSample();
  const energy = createSurfaceEnergySample();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const ground: ImpressionGround = { snowDepth: 0, snowDensity: 120, snowStrength: 10000, bearingStrength: 50000, saturation: 0, temperature: 18, waterDepth: 0, wetness: 0, roughness: 0 };
  const forcing: ImpressionWeather = { rainfall: 0, snowfall: 0, temperature: 18, humidity: 0.6, windSpeed: 2, evaporation: 0.1 };
  const geometry = resources.geometry("shoe tread footprint", createFootprintImpression);
  const material = resources.material("wet and snowy foot impressions", () => new THREE.MeshStandardMaterial({
    color: "#aaa79b",
    roughness: 0.9,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }));
  const fades = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  const relief = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  fades.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("footprintFade", fades);
  geometry.setAttribute("footprintRelief", relief);
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute float footprintFade;
      attribute vec4 footprintRelief;
      varying float footprintOpacity;
      varying vec3 footprintLocal;
      varying vec4 footprintPhysical;
    `).replace("#include <begin_vertex>", `#include <begin_vertex>
      footprintOpacity = footprintFade;
      footprintLocal = position;
      footprintPhysical = footprintRelief;
      float footprintEnd = smoothstep(-0.1, 0.1, position.z);
      transformed.y += mix(footprintRelief.x, footprintRelief.y, footprintEnd) * 0.08;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying float footprintOpacity;
      varying vec3 footprintLocal;
      varying vec4 footprintPhysical;
    `).replace("#include <color_fragment>", `#include <color_fragment>
      float tread = step(0.3, fract(footprintLocal.z * 58.0 + abs(footprintLocal.x) * 22.0));
      diffuseColor.a *= footprintOpacity * (0.35 + tread * footprintPhysical.z * 0.65);
      diffuseColor.rgb *= 1.0 - footprintPhysical.w * 0.22;
    `);
  };
  material.customProgramCacheKey = () => "shoe-tread-contact-decal";
  const footprints = resources.batch("physical foot impressions", geometry, material, capacity, true);
  footprints.frustumCulled = false;
  footprints.count = 0;
  let cursor = 0;
  let sequence = 0;
  let lastSeconds: number | undefined;
  const consume = (impact: GroundImpact) => {
    if (impact.kind !== "foot") return;
    water.sample(impact.x, impact.z, surface);
    water.energy.sample(impact.x, impact.z, energy);
    water.disturb(impact.x, impact.z, 50000 + impact.strength * 8000, 0.2);
    if (surface.snow < 0.002 && surface.wetness < 0.35) return;
    const mark = marks[cursor];
    mark.x = impact.x;
    mark.y = impact.y + 0.019;
    mark.z = impact.z;
    mark.heading = impact.heading;
    mark.born = impact.seconds;
    const surfaceStrength = surface.snow > 0.002 ? energy.snowStrength : energy.bearingStrength;
    const indentation = clamp(60000 / Math.max(8000, surfaceStrength), 0.25, 1.4);
    mark.strength = clamp(impact.strength * indentation, 0.2, 1);
    mark.snow = surface.snow > 0.002;
    ground.snowDepth = surface.snow;
    ground.snowDensity = energy.snowDensity;
    ground.snowStrength = energy.snowStrength;
    ground.bearingStrength = energy.bearingStrength;
    ground.saturation = surface.saturation;
    ground.temperature = surface.temperature;
    ground.waterDepth = surface.water;
    ground.wetness = surface.wetness;
    ground.roughness = energy.snowRoughness;
    mark.impression.apply(ground, 450 + impact.strength * 280, 0.18, impact.strength * 0.004);
    mark.active = true;
    cursor = (cursor + 1) % capacity;
  };
  return {
    update(seconds) {
      const dt = lastSeconds === undefined ? 0 : clamp(seconds - lastSeconds, 0, 0.5);
      lastSeconds = seconds;
      forcing.rainfall = weather.state.rain;
      forcing.snowfall = weather.state.snow;
      forcing.temperature = weather.state.temperature;
      forcing.humidity = weather.state.humidity;
      forcing.windSpeed = weather.state.windSpeed;
      forcing.evaporation = weather.state.evaporation;
      sequence = interactions.since(sequence, consume);
      let count = 0;
      for (const mark of marks) {
        if (!mark.active) continue;
        const age = seconds - mark.born;
        const impression = mark.impression.step(dt, forcing);
        if (age < 0 || !impression.visible) {
          mark.active = false;
          continue;
        }
        dummy.position.set(mark.x, mark.y, mark.z);
        dummy.rotation.set(0, mark.heading, 0);
        dummy.scale.set(impression.width / 0.12, 1, impression.length / 0.28);
        dummy.updateMatrix();
        footprints.setMatrixAt(count, dummy.matrix);
        color.set(mark.snow ? "#9daab1" : "#4c514c");
        color.multiplyScalar(1 - impression.darkness * 0.18);
        footprints.setColorAt(count, color);
        fades.setX(count, impression.contrast * mark.strength);
        relief.setXYZW(count, impression.heelDepth, impression.toeDepth, impression.sharpness, clamp(impression.water * 600, 0, 1));
        count++;
      }
      footprints.count = count;
      footprints.instanceMatrix.needsUpdate = true;
      if (footprints.instanceColor) footprints.instanceColor.needsUpdate = true;
      fades.needsUpdate = true;
      relief.needsUpdate = true;
    },
    reset() {
      for (const mark of marks) {
        mark.active = false;
        mark.impression.reset();
      }
      cursor = 0;
      sequence = 0;
      lastSeconds = undefined;
      footprints.count = 0;
    },
  };
}
