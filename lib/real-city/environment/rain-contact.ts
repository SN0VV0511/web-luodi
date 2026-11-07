import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { createRandom, clamp, smoothstep } from "../physics/math";
import { createSurfaceSample } from "./hydrology";
import { createTerrainPoint } from "./terrain";
import { createRaindropCrown, createRippleRing } from "./surface-geometry";
import type { GroundImpact } from "./interactions";
import { PrecipitationPopulation, createDropletState, createDropletImpact } from "../physics/droplet-dynamics";

type Ripple = { x: number; y: number; z: number; born: number; lifetime: number; scale: number; strength: number; active: boolean; speed: number; damping: number; crownHeight: number; crownDuration: number };

export function buildRainContactLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, weather, terrain, water, interactions, budget } = context;
  const capacity = budget.simulatedHz < 60 ? 24 : 48;
  resources.reserveParticles(capacity);
  const random = createRandom(8231);
  const population = new PrecipitationPopulation();
  const drop = createDropletState();
  const impactPhysics = createDropletImpact();
  const ripples: Ripple[] = Array.from({ length: capacity }, () => ({ x: 0, y: 0, z: 0, born: -1, lifetime: 1, scale: 1, strength: 0, active: false, speed: 0.2, damping: 2, crownHeight: 0.05, crownDuration: 0.16 }));
  const ground = createTerrainPoint();
  const surface = createSurfaceSample();
  const dummy = new THREE.Object3D();
  const material = resources.material("water contact highlights", () => new THREE.MeshBasicMaterial({
    color: "#b4cbd2",
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  }));
  const ringGeometry = resources.geometry("capillary impact ring", createRippleRing);
  const ringFade = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  ringFade.setUsage(THREE.DynamicDrawUsage);
  ringGeometry.setAttribute("impactFade", ringFade);
  const crownGeometry = resources.geometry("impact water crown", createRaindropCrown);
  const crownFade = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  crownFade.setUsage(THREE.DynamicDrawUsage);
  crownGeometry.setAttribute("impactFade", crownFade);
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute float impactFade;
      varying float impactOpacity;
    `).replace("#include <begin_vertex>", `#include <begin_vertex>
      impactOpacity = impactFade;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying float impactOpacity;
    `).replace("#include <color_fragment>", `#include <color_fragment>
      diffuseColor.a *= impactOpacity;
    `);
  };
  material.customProgramCacheKey = () => "capillary-ring-instance-fade";
  const rings = resources.batch("rain impact rings", ringGeometry, material, capacity, true);
  const crowns = resources.batch("rain impact crowns", crownGeometry, material, capacity, true);
  rings.frustumCulled = false;
  crowns.frustumCulled = false;
  rings.count = 0;
  crowns.count = 0;
  let cursor = 0;
  let sequence = 0;
  let lastSeconds: number | undefined;
  let emission = 0;
  const sites: { x: number; y: number; z: number }[] = [];
  for (let attempt = 0; attempt < 1600 && sites.length < 72; attempt++) {
    const x = -205 + random() * 410;
    const z = -200 + random() * 300;
    terrain.sample(x, z, ground);
    if (ground.kind !== "road" && ground.kind !== "pavement") continue;
    sites.push({ x, y: ground.height + 0.025, z });
  }
  const emit = (x: number, y: number, z: number, seconds: number, strength: number, scale: number) => {
    const ripple = ripples[cursor];
    ripple.x = x;
    ripple.y = y;
    ripple.z = z;
    ripple.born = seconds;
    ripple.strength = strength;
    ripple.scale = scale;
    ripple.lifetime = 0.65 + scale * 0.55;
    ripple.speed = Math.max(0.1, impactPhysics.capillarySpeed);
    ripple.damping = Math.min(8, impactPhysics.decayRate);
    ripple.crownHeight = Math.max(0.008, impactPhysics.crownHeight * 5);
    ripple.crownDuration = Math.max(0.08, impactPhysics.crownDuration);
    ripple.active = true;
    cursor = (cursor + 1) % capacity;
  };
  const consume = (impact: GroundImpact) => {
    water.sample(impact.x, impact.z, surface);
    if (surface.water < 0.0005 && weather.state.rain < 0.15) return;
    emit(impact.x, impact.y + 0.018, impact.z, impact.seconds, clamp(impact.strength / 4, 0.1, 1), Math.max(0.16, impact.radius * 2));
  };
  return {
    update(seconds, night) {
      const dt = lastSeconds === undefined ? 0 : clamp(seconds - lastSeconds, 0, 0.25);
      lastSeconds = seconds;
      population.update(weather.state.rain, weather.state.temperature, weather.state.airDensity, weather.state.windSpeed, weather.state.humidity);
      sequence = interactions.since(sequence, consume);
      emission += weather.state.rain * dt * (budget.simulatedHz < 60 ? 18 : 32);
      const spawned = Math.min(8, Math.floor(emission));
      emission -= spawned;
      for (let index = 0; index < spawned; index++) {
        const site = sites[Math.floor(random() * sites.length)];
        if (!site) break;
        const x = site.x + (random() - 0.5) * 2;
        const z = site.z + (random() - 0.5) * 2;
        terrain.sample(x, z, ground);
        if (ground.kind !== "road" && ground.kind !== "pavement") continue;
        water.sample(x, z, surface);
        population.sample(random(), 35, drop);
        population.impact(drop, surface.water, ground.kind === "road" ? 0.0003 : 0.00008, 68, impactPhysics);
        const strength = clamp(Math.sqrt(impactPhysics.energy * 85000), 0.12, 0.95);
        const spread = clamp(impactPhysics.maximumRadius * 18, 0.04, 0.26);
        emit(x, ground.height + 0.025, z, seconds, strength, spread);
      }
      let ringCount = 0;
      let crownCount = 0;
      for (const ripple of ripples) {
        if (!ripple.active) continue;
        const age = seconds - ripple.born;
        if (age < 0 || age >= ripple.lifetime) {
          ripple.active = false;
          continue;
        }
        const progress = age / ripple.lifetime;
        const radius = ripple.scale * 0.15 + age * ripple.speed;
        const fade = (1 - progress) ** 2 * ripple.strength * Math.exp(-age * ripple.damping);
        dummy.position.set(ripple.x, ripple.y, ripple.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(radius, 1, radius);
        dummy.updateMatrix();
        rings.setMatrixAt(ringCount, dummy.matrix);
        ringFade.setX(ringCount, fade);
        ringCount++;
        if (age < ripple.crownDuration) {
          const impactProgress = age / ripple.crownDuration;
          const crownRadius = ripple.scale * (0.12 + impactProgress * 0.55);
          const crownHeight = Math.sin(impactProgress * Math.PI) * ripple.crownHeight;
          dummy.scale.set(crownRadius, crownHeight, crownRadius);
          dummy.updateMatrix();
          crowns.setMatrixAt(crownCount, dummy.matrix);
          crownFade.setX(crownCount, (1 - smoothstep(0.35, 1, impactProgress)) * ripple.strength);
          crownCount++;
        }
      }
      rings.count = ringCount;
      crowns.count = crownCount;
      rings.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      ringFade.needsUpdate = true;
      crownFade.needsUpdate = true;
      material.opacity = night ? 0.2 : 0.35;
    },
    reset() {
      for (const ripple of ripples) ripple.active = false;
      cursor = 0;
      sequence = 0;
      emission = 0;
      lastSeconds = undefined;
      rings.count = 0;
      crowns.count = 0;
    },
  };
}
