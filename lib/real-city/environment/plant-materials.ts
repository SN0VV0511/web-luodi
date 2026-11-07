import * as THREE from "three";
import type { SeasonState } from "../../city-seasons";
import { clamp, createRandom, smoothstep } from "../physics/math";
import { EnvironmentResources } from "./resources";
import { WeatherField } from "./weather-field";

export type BotanicalMaterials = {
  grass: THREE.MeshStandardMaterial;
  deciduous: THREE.MeshStandardMaterial;
  evergreen: THREE.MeshStandardMaterial;
  reed: THREE.MeshStandardMaterial;
  flowers: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  update: (seconds: number, night: boolean, season: SeasonState) => void;
};

export function createBotanicalMaterials(resources: EnvironmentResources, weather: WeatherField): BotanicalMaterials {
  const leafTexture = resources.canvas("leaf veins", 256, 256, context => {
    context.fillStyle = "#d5deb8";
    context.fillRect(0, 0, 256, 256);
    const random = createRandom(902);
    for (let index = 0; index < 1800; index++) {
      const shade = 110 + Math.floor(random() * 110);
      context.fillStyle = `rgba(${shade},${shade + 12},${shade - 25},0.16)`;
      context.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 2);
    }
    const central = context.createLinearGradient(120, 0, 136, 0);
    central.addColorStop(0, "rgba(110,137,70,0)");
    central.addColorStop(0.45, "rgba(220,230,165,0.8)");
    central.addColorStop(0.55, "rgba(111,135,67,0.6)");
    central.addColorStop(1, "rgba(110,137,70,0)");
    context.fillStyle = central;
    context.fillRect(119, 0, 18, 256);
    context.lineWidth = 1.2;
    for (let row = 0; row < 10; row++) {
      const y = 19 + row * 23;
      for (const side of [-1, 1]) {
        context.strokeStyle = "rgba(230,231,169,0.62)";
        context.beginPath();
        context.moveTo(128, y);
        context.bezierCurveTo(128 + side * 32, y + 5, 128 + side * 69, y + 17, 128 + side * 117, y + 36);
        context.stroke();
        context.strokeStyle = "rgba(117,143,80,0.35)";
        context.beginPath();
        context.moveTo(128, y + 2);
        context.bezierCurveTo(128 + side * 32, y + 7, 128 + side * 69, y + 19, 128 + side * 117, y + 38);
        context.stroke();
      }
    }
  });
  leafTexture.colorSpace = THREE.SRGBColorSpace;
  const barkTexture = resources.canvas("young bark", 128, 256, context => {
    const random = createRandom(713);
    context.fillStyle = "#777365";
    context.fillRect(0, 0, 128, 256);
    for (let line = 0; line < 80; line++) {
      const x = random() * 128;
      const tone = 50 + Math.floor(random() * 90);
      context.strokeStyle = `rgba(${tone},${Math.floor(tone * 0.96)},${Math.floor(tone * 0.82)},0.65)`;
      context.lineWidth = 0.5 + random() * 2;
      context.beginPath();
      context.moveTo(x, 0);
      for (let y = 0; y <= 256; y += 16) context.lineTo(x + Math.sin(y * 0.07 + line) * 2.5, y);
      context.stroke();
    }
    for (let pore = 0; pore < 65; pore++) {
      context.fillStyle = "rgba(204,201,173,0.5)";
      context.fillRect(random() * 128, random() * 256, 2 + random() * 5, 0.8);
    }
  });
  barkTexture.colorSpace = THREE.SRGBColorSpace;
  const shared = {
    time: { value: 0 },
    wind: { value: new THREE.Vector2() },
    frost: { value: 0 },
    autumn: { value: 0 },
    night: { value: 0 },
    wetness: { value: 0 },
    dust: { value: 0 },
  };
  const botanical = (name: string, color: string, bending: number, deciduous: boolean): THREE.MeshStandardMaterial => {
    const material = resources.material(name, () => new THREE.MeshStandardMaterial({
      color,
      map: leafTexture,
      vertexColors: true,
      roughness: 0.79,
      metalness: 0,
      side: THREE.DoubleSide,
    }));
    material.onBeforeCompile = shader => {
      shader.uniforms.botanicalTime = shared.time;
      shader.uniforms.botanicalWind = shared.wind;
      shader.uniforms.botanicalFrost = shared.frost;
      shader.uniforms.botanicalAutumn = shared.autumn;
      shader.uniforms.botanicalNight = shared.night;
      shader.uniforms.botanicalWetness = shared.wetness;
      shader.uniforms.botanicalDust = shared.dust;
      shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
        uniform float botanicalTime;
        uniform vec2 botanicalWind;
        varying float botanicalHeight;
        varying float botanicalVariation;
        varying vec3 botanicalWorldNormal;
      `);
      shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        vec3 botanicalAnchor = vec3(0.0);
        #ifdef USE_BATCHING
          botanicalAnchor = batchingMatrix[3].xyz;
        #endif
        #ifdef USE_INSTANCING
          botanicalAnchor = instanceMatrix[3].xyz;
        #endif
        float botanicalPhase = botanicalAnchor.x * 0.21 + botanicalAnchor.z * 0.17;
        float botanicalFlex = pow(clamp(uv.y, 0.0, 1.0), 1.8);
        float botanicalGust = sin(botanicalTime * 1.8 + botanicalPhase) * 0.58
          + sin(botanicalTime * 3.7 + botanicalPhase * 1.3) * 0.22;
        transformed.x += (botanicalWind.x * 0.055 + botanicalGust * 0.08) * botanicalFlex * ${bending.toFixed(3)};
        transformed.z += (botanicalWind.y * 0.055 + botanicalGust * 0.045) * botanicalFlex * ${bending.toFixed(3)};
        transformed.y -= length(botanicalWind) * botanicalFlex * botanicalFlex * 0.009 * ${bending.toFixed(3)};
        botanicalHeight = uv.y;
        botanicalVariation = fract(sin(dot(botanicalAnchor.xz, vec2(32.17, 71.93))) * 3471.13);

      `);
      shader.vertexShader = shader.vertexShader.replace("#include <defaultnormal_vertex>", `#include <defaultnormal_vertex>
        botanicalWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
        uniform float botanicalFrost;
        uniform float botanicalAutumn;
        uniform float botanicalNight;
        uniform float botanicalWetness;
        uniform float botanicalDust;
        varying float botanicalHeight;
        varying float botanicalVariation;
        varying vec3 botanicalWorldNormal;
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        float botanicalAge = smoothstep(0.16, 0.86, botanicalHeight);
        vec3 botanicalAmber = mix(vec3(0.38, 0.12, 0.025), vec3(0.69, 0.43, 0.055), botanicalVariation);
        diffuseColor.rgb = mix(diffuseColor.rgb, botanicalAmber, botanicalAutumn * botanicalAge * ${deciduous ? "0.88" : "0.12"});
        float frostFacing = smoothstep(-0.1, 0.75, botanicalWorldNormal.y) * 0.7 + botanicalAge * 0.3;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.73, 0.79, 0.78), botanicalFrost * frostFacing);
        diffuseColor.rgb *= 1.0 - botanicalWetness * 0.18;
        float dustFacing = smoothstep(-0.1, 0.7, botanicalWorldNormal.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.37, 0.28), botanicalDust * dustFacing);
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.43, botanicalWetness * 0.6);
      `);
      shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
        float botanicalBacklight = pow(max(0.0, dot(-normal, normalize(vec3(-0.5, 0.8, 0.3)))), 2.0);
        outgoingLight += diffuseColor.rgb * botanicalBacklight * 0.16 * (1.0 - botanicalNight);
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => `botanical-surface-${name}-${bending}-${deciduous}`;
    return material;
  };
  const grass = botanical("grass blade material", "#667e43", 1.2, false);
  const deciduous = botanical("deciduous leaf material", "#78934e", 0.9, true);
  const evergreen = botanical("evergreen leaf material", "#4e6941", 0.4, false);
  const reed = botanical("reed leaf material", "#8a935b", 1.6, false);
  const flowers = resources.material("botanical flowers", () => new THREE.MeshStandardMaterial({
    color: "#d5cbb5", roughness: 0.87, vertexColors: true, side: THREE.DoubleSide,
  }));
  const bark = resources.material("botanical bark", () => new THREE.MeshStandardMaterial({ color: "#9d9482", map: barkTexture, roughness: 0.96 }));
  return {
    grass,
    deciduous,
    evergreen,
    reed,
    flowers,
    bark,
    update(seconds, night, season) {
      shared.time.value = seconds;
      shared.wind.value.set(weather.windDirection.x, weather.windDirection.z).multiplyScalar(weather.state.windSpeed);
      shared.frost.value = (1 - smoothstep(-2, 2, weather.state.temperature)) * clamp(weather.state.humidity, 0, 1);
      shared.autumn.value = season.season === "autumn" ? 0.5 + season.blend * 0.5 : season.nextSeason === "autumn" ? season.blend * 0.5 : 0;
      shared.night.value = night ? 1 : 0;
      shared.wetness.value = weather.state.rain;
      shared.dust.value = Math.min(0.16, (weather.aerosols?.mean.depositedDust ?? 0) * 160000);
      grass.color.copy(season.grassColor).multiplyScalar(0.8);
      reed.color.copy(season.grassColor).lerp(new THREE.Color("#baaa70"), season.season === "autumn" || season.season === "winter" ? 0.7 : 0.2);
      bark.roughness = 0.96 - weather.state.rain * 0.2;
    },
  };
}
