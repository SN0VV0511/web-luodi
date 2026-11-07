import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { AtmosphericOptics } from "./atmospheric-optics";
import { FogColumn, type FogBoundary, type FogLayerState } from "../physics/fog-column";
import { createSurfaceSample } from "./hydrology";
import { createMicroclimateSample } from "./urban-microclimate";
import { createAerosolSample } from "./aerosol-field";
import { clamp } from "../physics/math";

export function buildLowFogLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, weather, budget } = context;
  const optics = new AtmosphericOptics(weather);
  const uniforms = {
    fogTime: { value: 0 },
    fogDensity: { value: 0 },
    fogColor: { value: new THREE.Color("#abbac2") },
    fogSunColor: { value: new THREE.Color("#e3d7ba") },
    fogWind: { value: new THREE.Vector2() },
    fogSun: { value: new THREE.Vector3(-0.5, 0.7, 0.2) },
    fogAnisotropy: { value: 0.78 },
    fogThermalLayers: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) },
  };
  const material = resources.material("coastal low mist volume", () => new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    vertexShader: `
      attribute float fogProfile;
      varying float fogProfileIndex;
      varying vec3 fogWorldPosition;
      varying vec3 fogBoxCenter;
      varying vec3 fogBoxHalfSize;
      void main() {
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        fogWorldPosition = world.xyz;
        fogProfileIndex = fogProfile;
        fogBoxCenter = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        fogBoxHalfSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz)) * 0.5;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform float fogTime;
      uniform float fogDensity;
      uniform vec3 fogColor;
      uniform vec3 fogSunColor;
      uniform vec2 fogWind;
      uniform vec3 fogSun;
      uniform float fogAnisotropy;
      uniform vec4 fogThermalLayers[24];
      varying float fogProfileIndex;
      varying vec3 fogWorldPosition;
      varying vec3 fogBoxCenter;
      varying vec3 fogBoxHalfSize;
      float mistHash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }
      float mistNoise(vec3 p) {
        vec3 cell = floor(p);
        vec3 f = fract(p);
        vec3 blend = f * f * (3.0 - 2.0 * f);
        float n000 = mistHash(cell);
        float n100 = mistHash(cell + vec3(1.0, 0.0, 0.0));
        float n010 = mistHash(cell + vec3(0.0, 1.0, 0.0));
        float n110 = mistHash(cell + vec3(1.0, 1.0, 0.0));
        float n001 = mistHash(cell + vec3(0.0, 0.0, 1.0));
        float n101 = mistHash(cell + vec3(1.0, 0.0, 1.0));
        float n011 = mistHash(cell + vec3(0.0, 1.0, 1.0));
        float n111 = mistHash(cell + vec3(1.0, 1.0, 1.0));
        float low = mix(mix(n000, n100, blend.x), mix(n010, n110, blend.x), blend.y);
        float high = mix(mix(n001, n101, blend.x), mix(n011, n111, blend.x), blend.y);
        return mix(low, high, blend.z);
      }
      float mistField(vec3 world) {
        vec3 local = (world - fogBoxCenter) / fogBoxHalfSize;
        float lateral = (1.0 - smoothstep(0.5, 1.0, abs(local.x))) * (1.0 - smoothstep(0.5, 1.0, abs(local.z)));
        float vertical = (1.0 - smoothstep(-0.1, 0.85, local.y)) * smoothstep(-1.0, -0.7, local.y);
        vec3 drift = vec3(fogWind.x * fogTime, fogTime * 0.02, fogWind.y * fogTime);
        float broad = mistNoise(world * vec3(0.055, 0.15, 0.055) - drift * 0.035);
        float detail = mistNoise(world * vec3(0.14, 0.24, 0.14) + drift * 0.018);
        float wisps = smoothstep(0.24, 0.72, broad * 0.75 + detail * 0.25);
        float layerHeight = clamp((local.y + 1.0) * 0.5 * 8.0 - 0.5, 0.0, 7.0);
        int profileStart = int(floor(fogProfileIndex + 0.5)) * 8;
        int lower = int(floor(layerHeight));
        int upper = min(7, lower + 1);
        vec4 lowerLayer = fogThermalLayers[profileStart + lower];
        vec4 upperLayer = fogThermalLayers[profileStart + upper];
        vec4 thermal = mix(lowerLayer, upperLayer, fract(layerHeight));
        float physicalDensity = max(fogDensity * 0.35, thermal.x);
        float dropletVariation = 0.8 + thermal.y * 0.2;
        return lateral * vertical * wisps * min(0.06, physicalDensity) * dropletVariation;
      }
      vec2 mistBounds(vec3 origin, vec3 direction) {
        vec3 safeDirection = mix(vec3(0.000001), direction, step(vec3(0.000001), abs(direction)));
        vec3 inverseDirection = 1.0 / safeDirection;
        vec3 first = (fogBoxCenter - fogBoxHalfSize - origin) * inverseDirection;
        vec3 second = (fogBoxCenter + fogBoxHalfSize - origin) * inverseDirection;
        vec3 nearPlane = min(first, second);
        vec3 farPlane = max(first, second);
        float enter = max(max(nearPlane.x, nearPlane.y), nearPlane.z);
        float leave = min(min(farPlane.x, farPlane.y), farPlane.z);
        return vec2(max(0.0, enter), leave);
      }
      float mistPhase(float cosine) {
        float g2 = fogAnisotropy * fogAnisotropy;
        return (1.0 - g2) / (12.56637 * pow(max(0.05, 1.0 + g2 - 2.0 * fogAnisotropy * cosine), 1.5));
      }
      void main() {
        vec3 ray = normalize(fogWorldPosition - cameraPosition);
        vec2 bounds = mistBounds(cameraPosition, ray);
        if (bounds.y <= bounds.x) discard;
        float rayLength = min(90.0, bounds.y - bounds.x);
        float stepLength = rayLength / ${budget.simulatedHz < 60 ? "8.0" : "12.0"};
        float transmission = 1.0;
        vec3 scattered = vec3(0.0);
        float jitter = mistHash(vec3(gl_FragCoord.xy, 0.0));
        float sunPhase = mistPhase(dot(ray, normalize(fogSun)));
        for (int stepIndex = 0; stepIndex < ${budget.simulatedHz < 60 ? 8 : 12}; stepIndex++) {
          float distance = bounds.x + (float(stepIndex) + jitter) * stepLength;
          vec3 world = cameraPosition + ray * distance;
          float density = mistField(world);
          float extinction = density * stepLength;
          float opacity = 1.0 - exp(-extinction);
          float sunlight = exp(-mistField(world + fogSun * 4.0) * 10.0);
          vec3 illumination = fogColor + fogSunColor * sunPhase * sunlight * 0.22;
          scattered += transmission * opacity * illumination;
          transmission *= 1.0 - opacity;
          if (transmission < 0.08) break;
        }
        float alpha = min(0.44, 1.0 - transmission);
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(scattered / max(0.001, 1.0 - transmission), alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  }));
  const geometry = resources.geometry("mist volume bounds", () => new THREE.BoxGeometry(1, 1, 1));
  const count = budget.simulatedHz < 60 ? 2 : 3;
  geometry.setAttribute("fogProfile", new THREE.InstancedBufferAttribute(Float32Array.from({ length: count }, (_, index) => index), 1));
  const mist = resources.batch("shore and lake mist", geometry, material, count);
  const dummy = new THREE.Object3D();
  for (let index = 0; index < count; index++) {
    if (index === 0) {
      dummy.position.set(-145, 2.2, 135);
      dummy.scale.set(105, 5, 32);
    } else if (index === 1) {
      dummy.position.set(90, 2.1, 146);
      dummy.scale.set(120, 5, 42);
    } else {
      dummy.position.set(-12, 1.4, -15);
      dummy.scale.set(46, 3, 60);
    }
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mist.setMatrixAt(index, dummy.matrix);
  }
  resources.finalizeBounds(mist);
  mist.renderOrder = 4;
  mist.visible = false;
  const sky = new THREE.Color();
  const transmittance = new THREE.Color();
  const direction = new THREE.Vector3(0.2, 0.04, -1).normalize();
  const columns = Array.from({ length: count }, (_, index) => new FogColumn(8, index === 2 ? 3 : 5));
  const columnSites = [new THREE.Vector2(-145, 135), new THREE.Vector2(90, 146), new THREE.Vector2(-12, -15)];
  const surface = createSurfaceSample();
  const micro = createMicroclimateSample();
  const aerosol = createAerosolSample();
  const state: FogLayerState = { temperature: 18, humidity: 0.6, vapor: 0, liquid: 0, radius: 0.000002, extinction: 0, scattering: 0, anisotropy: 0.78, turbulence: 0 };
  const boundary: FogBoundary = { airTemperature: 18, humidity: 0.6, pressure: 101325, windSpeed: 2, solarFlux: 0, cloudCover: 0.3, groundTemperature: 16, waterTemperature: 16, waterFraction: 0.7, surfaceWetness: 0, aerosolNumber: 50e6, aerosolExtinction: 0.0001 };
  const aerosolColor = new THREE.Color();
  let lastSeconds: number | undefined;

  return {
    update(seconds, night, season) {
      optics.update(season.sunPosition, night);
      const dt = lastSeconds === undefined ? 0 : clamp(seconds - lastSeconds, 0, 0.5);
      lastSeconds = seconds;
      let physicalDensity = 0;
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
        const column = columns[columnIndex];
        const site = columnSites[columnIndex];
        context.water.sample(site.x, site.y, surface);
        weather.microclimate?.sample(site.x, site.y, micro);
        weather.aerosols?.sample(site.x, site.y, aerosol);
        boundary.airTemperature = weather.state.temperature + micro.temperatureOffset;
        boundary.humidity = clamp(weather.state.humidity + micro.humidityOffset, 0, 0.999);
        boundary.pressure = weather.state.pressure * 100;
        boundary.windSpeed = weather.state.windSpeed * (1 - micro.windShelter * 0.5);
        boundary.solarFlux = weather.state.sunExposure * 700 * (1 - micro.shade);
        boundary.cloudCover = weather.state.cloud;
        boundary.groundTemperature = surface.temperature;
        boundary.waterTemperature = 16 + (weather.state.temperature - 16) * 0.35;
        boundary.waterFraction = columnIndex === 2 ? 0.85 : 0.7;
        boundary.surfaceWetness = surface.wetness;
        boundary.aerosolNumber = 25e6 + (aerosol.mineralDust + aerosol.seaSalt + aerosol.soot) * 1e15;
        boundary.aerosolExtinction = aerosol.extinction;
        column.step(dt, boundary);
        physicalDensity = Math.max(physicalDensity, column.meanExtinction);
        for (let layer = 0; layer < 8; layer++) {
          column.sample((layer + 0.5) / 8 * column.height, state);
          uniforms.fogThermalLayers.value[columnIndex * 8 + layer].set(state.extinction, state.humidity, state.anisotropy, state.temperature);
        }
      }
      const density = Math.max(optics.mistDensity(0.6) * 3, physicalDensity);
      mist.visible = density > 0.003;
      uniforms.fogTime.value = seconds;
      uniforms.fogDensity.value = Math.min(0.05, density);
      optics.fogColor(0.6, uniforms.fogColor.value);
      if (weather.aerosols) {
        weather.aerosols.scatteringTint(-40, 90, aerosolColor);
        uniforms.fogColor.value.multiply(aerosolColor);
      }
      optics.sky(direction, 0.6, sky);
      optics.transmittance(800, 1, transmittance);
      uniforms.fogColor.value.add(sky.multiplyScalar(0.12)).multiply(transmittance);
      optics.cloudAlbedo(weather.state.cloud, uniforms.fogSunColor.value);
      uniforms.fogWind.value.set(weather.windDirection.x, weather.windDirection.z).multiplyScalar(weather.state.windSpeed);
      uniforms.fogSun.value.copy(season.sunPosition).normalize();
      uniforms.fogAnisotropy.value = optics.conditions.anisotropy;
    },
    reset() {
      mist.visible = false;
      uniforms.fogDensity.value = 0;
      lastSeconds = undefined;
      for (const column of columns) column.reset();
    },
  };
}
