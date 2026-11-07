import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { ShallowWaterPatch } from "../physics/shallow-water";
import { HarborWaveField } from "./waves";
import { CoastalWaterQuality, createCoastalQualitySample } from "./coastal-water-quality";
import { BeachMorphology, createBeachSample, type BeachForcing } from "../physics/beach-morphology";
import { clamp, createRandom } from "../physics/math";
import type { WaterSample } from "../physics/buoyancy";
import { FoamPopulation, createFoamSample, type FoamForcing } from "../physics/foam-population";

export function buildCoastalWaterLayer(context: EnvironmentContext, waves: HarborWaveField): EnvironmentLayer {
  const { resources, physics, weather, interactions, budget } = context;
  const compact = budget.simulatedHz < 60;
  const patch = new ShallowWaterPatch(
    { minimumX: 96, minimumZ: 120, width: 104, depth: 28 },
    compact ? 40 : 64,
    compact ? 14 : 22,
    waves.analyticSample,
    (x, z) => waves.depthAt(x, z),
  );
  waves.setLocalSurface(patch);
  const quality = new CoastalWaterQuality(patch, weather);
  const qualitySample = createCoastalQualitySample();
  const foam = new FoamPopulation(patch.columns, patch.rows, patch.cellX, patch.cellZ);
  const foamSample = createFoamSample();
  const foamForcing: FoamForcing = { temperature: 18, salinity: 29, organicMatter: 1, windSpeed: 2, rainfall: 0 };
  const foamFlow = { velocityX: patch.velocityX, velocityZ: patch.velocityZ, depth: patch.depth, breaking: patch.foam };
  const beach = new BeachMorphology(-212, 126, compact ? 48 : 72);
  const beachSample = createBeachSample();
  const beachForcing: BeachForcing = { tide: 0, waveHeight: 0.12, wavePeriod: 5, waveAngle: 0, windSpeed: 2, rainfall: 0, evaporation: 0.1, temperature: 18 };
  for (let index = 0; index < (compact ? 5 : 8); index++) patch.obstacle(112 + index * 9.5, 129 + (index % 2) * 3.8, 0.42);
  const positions = new Float32Array(patch.columns * patch.rows * 3);
  const colors = new Float32Array(patch.columns * patch.rows * 3);
  const composition = new Float32Array(patch.columns * patch.rows * 4);
  const bubbles = new Float32Array(patch.columns * patch.rows * 4);
  const uvs = new Float32Array(patch.columns * patch.rows * 2);
  const indices: number[] = [];
  for (let row = 0; row < patch.rows; row++) {
    for (let column = 0; column < patch.columns; column++) {
      const index = row * patch.columns + column;
      positions[index * 3] = patch.bounds.minimumX + column * patch.cellX;
      positions[index * 3 + 1] = 0.02;
      positions[index * 3 + 2] = patch.bounds.minimumZ + row * patch.cellZ;
      uvs[index * 2] = column / (patch.columns - 1);
      uvs[index * 2 + 1] = row / (patch.rows - 1);
      if (row < patch.rows - 1 && column < patch.columns - 1) {
        indices.push(index, index + patch.columns, index + 1, index + 1, index + patch.columns, index + patch.columns + 1);
      }
    }
  }
  const geometry = resources.geometry("shallow water foam grid", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("waterComposition", new THREE.BufferAttribute(composition, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("foamPopulation", new THREE.BufferAttribute(bubbles, 4).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
  const foamTime = { value: 0 };
  const foamWind = { value: new THREE.Vector2() };
  const material = resources.material("advected breaking water foam", () => new THREE.MeshStandardMaterial({
    color: "#d6e0d7",
    roughness: 0.6,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  material.onBeforeCompile = shader => {
    shader.uniforms.coastTime = foamTime;
    shader.uniforms.coastWind = foamWind;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute vec3 color;
      attribute vec4 waterComposition;
      attribute vec4 foamPopulation;
      varying vec4 coastalComposition;
      varying vec4 coastalBubbles;
      varying vec3 coastalSurface;
      varying vec2 coastalUv;
      varying vec3 coastalWorld;
    `).replace("#include <begin_vertex>", `#include <begin_vertex>
      coastalSurface = color;
      coastalComposition = waterComposition;
      coastalBubbles = foamPopulation;
      coastalUv = uv;
      coastalWorld = position;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform float coastTime;
      uniform vec2 coastWind;
      varying vec3 coastalSurface;
      varying vec2 coastalUv;
      varying vec3 coastalWorld;
      varying vec4 coastalComposition;
      varying vec4 coastalBubbles;
      float foamCell(vec2 p) {
        vec2 cell = floor(p);
        vec2 f = fract(p);
        float nearest = 2.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 neighbour = vec2(float(x), float(y));
            vec2 seed = cell + neighbour;
            vec2 jitter = fract(sin(vec2(dot(seed, vec2(127.1, 311.7)), dot(seed, vec2(269.5, 183.3)))) * 43758.5453);
            nearest = min(nearest, length(neighbour + jitter - f));
          }
        }
        return nearest;
      }
    `).replace("#include <color_fragment>", `#include <color_fragment>
      vec2 flow = (coastalSurface.yz * 2.0 - 1.0) * 0.3 + coastWind * 0.06;
      float bubbleScale = mix(5.0, 1.4, clamp(coastalBubbles.x, 0.0, 1.0));
      vec2 advected = coastalWorld.xz * bubbleScale - flow * coastTime;
      float cells = foamCell(advected);
      float bubbles = smoothstep(0.16, 0.29, cells) * (1.0 - smoothstep(0.46, 0.66, cells));
      float breakup = 0.45 + bubbles * 0.55;
      float edge = smoothstep(0.0, 0.06, coastalUv.x) * smoothstep(0.0, 0.06, 1.0 - coastalUv.x)
        * smoothstep(0.0, 0.08, coastalUv.y) * smoothstep(0.0, 0.08, 1.0 - coastalUv.y);
      float coastalFoamAmount = smoothstep(0.035, 0.28, coastalSurface.x) * breakup;
      vec3 coastalWaterColor = coastalComposition.rgb;
      diffuseColor.rgb = mix(coastalWaterColor, diffuseColor.rgb * coastalBubbles.y, coastalFoamAmount);
      float coastalWaterOpacity = (1.0 - coastalComposition.a) * 0.18;
      diffuseColor.a *= mix(coastalWaterOpacity, 0.85 + coastalBubbles.z * 0.15, coastalFoamAmount) * edge;
      if (diffuseColor.a < 0.01) discard;
    `);
  };
  material.customProgramCacheKey = () => "shallow-water-advected-foam";
  const mesh = resources.mesh("harbor shallow water foam", geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  const shorelineGeometry = resources.geometry("beach swash ribbon", () => {
    const segments = compact ? 64 : 96;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let index = 0; index <= segments; index++) {
      const x = -212 + index / segments * 126;
      positions.push(x, 0.27, 122, x, 0.27, 123);
      uvs.push(index / segments, 0, index / segments, 1);
      if (index < segments) {
        const first = index * 2;
        indices.push(first, first + 2, first + 1, first + 1, first + 2, first + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  });
  const swashMaterial = resources.material("beach swash foam", () => new THREE.MeshBasicMaterial({ color: "#d7e4db", transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide }));
  swashMaterial.onBeforeCompile = shader => {
    shader.uniforms.coastTime = foamTime;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      varying vec2 swashUv;
    `).replace("#include <begin_vertex>", `#include <begin_vertex>
      swashUv = uv;
    `);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      varying vec2 swashUv;
      uniform float coastTime;
    `).replace("#include <color_fragment>", `#include <color_fragment>
      float lace = sin(swashUv.x * 670.0 + sin(swashUv.x * 183.0 + coastTime) * 3.0) * 0.5 + 0.5;
      float edge = sin(swashUv.y * 3.14159);
      diffuseColor.a *= edge * (0.28 + lace * 0.72);
    `);
  };
  swashMaterial.customProgramCacheKey = () => "natural-beach-swash-ribbon";
  const shoreline = resources.mesh("wave runup at beach", shorelineGeometry, swashMaterial);
  shoreline.frustumCulled = false;
  shoreline.renderOrder = 2;
  const sample: WaterSample = { height: 0, normal: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), foam: 0 };
  const random = createRandom(9302);
  let rainAccumulator = 0;
  let sequence = 0;
  let lastUpdate = -1;
  physics.beforeStep((dt, seconds) => {
    patch.step(dt, seconds, weather.windDirection.x * weather.state.windSpeed, weather.windDirection.z * weather.state.windSpeed);
    quality.step(dt, seconds);
    quality.sample(148, 134, qualitySample);
    foamForcing.temperature = qualitySample.temperature;
    foamForcing.salinity = qualitySample.salinity;
    foamForcing.organicMatter = qualitySample.chlorophyll;
    foamForcing.windSpeed = weather.state.windSpeed;
    foamForcing.rainfall = weather.state.rain;
    foam.step(dt, foamForcing, foamFlow);
    rainAccumulator += weather.state.rain * dt * 5;
    if (rainAccumulator >= 1) {
      rainAccumulator--;
      patch.impulse(100 + random() * 96, 122 + random() * 24, -0.006, 1.3);
    }
    sequence = interactions.since(sequence, impact => {
      if (patch.contains(impact.x, impact.z)) patch.impulse(impact.x, impact.z, -Math.min(0.05, impact.strength * 0.006), Math.max(1, impact.radius * 4));
    });
  });
  return {
    update(seconds, night) {
      if (lastUpdate < 0) patch.reset(seconds);
      foamTime.value = seconds;
      foamWind.value.set(weather.windDirection.x, weather.windDirection.z).multiplyScalar(weather.state.windSpeed);
      material.color.set(night ? "#697e88" : "#d6e0d7");
      swashMaterial.color.set(night ? "#607d89" : "#d7e4db");
      if (seconds - lastUpdate < 1 / 24 && seconds >= lastUpdate) return;
      lastUpdate = seconds;
      beachForcing.tide = waves.tideAt(seconds);
      beachForcing.waveHeight = 0.08 + weather.state.windSpeed * 0.018;
      beachForcing.wavePeriod = 4.5 + weather.state.windSpeed * 0.15;
      beachForcing.waveAngle = Math.atan2(weather.windDirection.z, weather.windDirection.x) * 0.2;
      beachForcing.windSpeed = weather.state.windSpeed;
      beachForcing.rainfall = weather.state.rain;
      beachForcing.evaporation = weather.state.evaporation;
      beachForcing.temperature = weather.state.temperature;
      beach.update(seconds, beachForcing);
      const positions = geometry.getAttribute("position");
      const colors = geometry.getAttribute("color");
      const composition = geometry.getAttribute("waterComposition");
      const bubbles = geometry.getAttribute("foamPopulation");
      for (let index = 0; index < patch.height.length; index++) {
        positions.setY(index, patch.height[index] + 0.035);
        foam.sample(index % patch.columns, Math.floor(index / patch.columns), foamSample);
        colors.setXYZ(index, Math.max(patch.foam[index], foamSample.coverage), patch.velocityX[index] * 0.5 + 0.5, patch.velocityZ[index] * 0.5 + 0.5);
        bubbles.setXYZW(index, clamp(foamSample.bubbleRadius / 0.0035, 0, 1), foamSample.brightness, foamSample.persistence, foamSample.thickness);
        quality.sample(positions.getX(index), positions.getZ(index), qualitySample);
        const illumination = night ? 0.4 : 1;
        composition.setXYZW(index, qualitySample.color.r * illumination, qualitySample.color.g * illumination, qualitySample.color.b * illumination, qualitySample.transparency);
      }
      positions.needsUpdate = true;
      colors.needsUpdate = true;
      composition.needsUpdate = true;
      bubbles.needsUpdate = true;
      const shore = shorelineGeometry.getAttribute("position");
      for (let index = 0; index < shore.count; index += 2) {
        const x = shore.getX(index);
        beach.sample(x, seconds, beachSample);
        const z = beachSample.shoreline;
        waves.analyticSample(x, z + 3, seconds, sample);
        const runup = clamp(beachSample.foamWidth + sample.velocity.y * 0.2, 0.25, 1.6);
        const elevation = beachSample.elevation + 0.028;
        shore.setXYZ(index, x, elevation, z);
        shore.setXYZ(index + 1, x, elevation + Math.abs(sample.height) * 0.04, z + runup);
      }
      shore.needsUpdate = true;
      swashMaterial.opacity = 0.25 + weather.state.windSpeed * 0.025;
    },
    reset() {
      patch.reset();
      quality.reset();
      foam.reset();
      beach.reset();
      rainAccumulator = 0;
      sequence = 0;
      lastUpdate = -1;
    },
    dispose() {
      waves.setLocalSurface(undefined);
    },
  };
}
