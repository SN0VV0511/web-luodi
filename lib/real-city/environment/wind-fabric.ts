import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { ClothSimulation } from "../physics/cloth";
import type { FabricClimate } from "../physics/fabric-moisture";
import { createRandom, smoothstep } from "../physics/math";

type FabricFlag = { cloth: ClothSimulation; mesh: THREE.Mesh; x: number; z: number; height: number; rows: number };

export function buildWindFabricLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, terrain, physics, weather, budget } = context;
  const compact = budget.simulatedHz < 60;
  const columns = compact ? 8 : 12;
  const rows = compact ? 5 : 8;
  const count = compact ? 2 : 3;
  resources.reserveCloth((columns + 1) * (rows + 1) * count);
  const texture = resources.canvas("woven harbor fabric", 256, 128, canvas => {
    const random = createRandom(418);
    canvas.fillStyle = "#e2d9bb";
    canvas.fillRect(0, 0, 256, 128);
    canvas.fillStyle = "#4e6e79";
    canvas.fillRect(0, 0, 256, 36);
    canvas.fillStyle = "#a1523e";
    canvas.fillRect(0, 92, 256, 36);
    for (let line = 0; line < 128; line += 2) {
      canvas.strokeStyle = line % 4 === 0 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.09)";
      canvas.lineWidth = 0.7;
      canvas.beginPath();
      canvas.moveTo(0, line + 0.5);
      canvas.lineTo(256, line + 0.5);
      canvas.stroke();
    }
    for (let line = 0; line < 256; line += 2) {
      canvas.strokeStyle = "rgba(35,35,25,0.07)";
      canvas.beginPath();
      canvas.moveTo(line + 0.5, 0);
      canvas.lineTo(line + 0.5, 128);
      canvas.stroke();
    }
    for (let fibre = 0; fibre < 420; fibre++) {
      canvas.fillStyle = fibre % 2 ? "rgba(248,244,225,0.15)" : "rgba(47,48,38,0.09)";
      canvas.fillRect(random() * 256, random() * 128, 0.6, 0.6 + random() * 2.5);
    }
    canvas.strokeStyle = "rgba(74,71,58,0.7)";
    canvas.setLineDash([2, 2]);
    canvas.lineWidth = 1;
    canvas.strokeRect(4, 4, 248, 120);
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  const material = resources.material("physical woven fabric", () => new THREE.MeshStandardMaterial({
    color: "#ded8ca",
    map: texture,
    bumpMap: texture,
    bumpScale: 0.0025,
    roughness: 0.92,
    side: THREE.DoubleSide,
    vertexColors: true,
  }));
  const nightUniform = { value: 0 };
  material.onBeforeCompile = shader => {
    shader.uniforms.fabricNight = nightUniform;
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform float fabricNight;
    `).replace("#include <opaque_fragment>", `
      float transmitted = pow(max(0.0, dot(-normal, normalize(vec3(-0.55, 0.8, 0.3)))), 2.0);
      outgoingLight += diffuseColor.rgb * transmitted * 0.18 * (1.0 - fabricNight);
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey = () => "woven-fabric-transmission";
  const poleMaterial = resources.material("brushed flag pole", () => new THREE.MeshStandardMaterial({ color: "#8a9799", roughness: 0.4, metalness: 0.78 }));
  const poleGeometry = resources.geometry("tapered flag mast", () => new THREE.LatheGeometry([
    new THREE.Vector2(0.18, 0),
    new THREE.Vector2(0.18, 0.07),
    new THREE.Vector2(0.075, 0.07),
    new THREE.Vector2(0.065, 0.2),
    new THREE.Vector2(0.045, 4.9),
    new THREE.Vector2(0.065, 4.96),
    new THREE.Vector2(0.025, 5.04),
    new THREE.Vector2(0, 5.06),
  ], 12));
  const poles = resources.batch("harbor flag masts", poleGeometry, poleMaterial, count);
  const dummy = new THREE.Object3D();
  const flags: FabricFlag[] = [];
  for (let index = 0; index < count; index++) {
    const x = 118 + index * 26;
    const z = 109.7;
    const ground = 0.36;
    dummy.position.set(x, ground, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(index, dummy.matrix);
    const cloth = new ClothSimulation({
      columns,
      rows,
      width: 1.55,
      height: 0.85,
      origin: new THREE.Vector3(x + 0.055, ground + 4.65, z),
      horizontal: new THREE.Vector3(1, 0, 0),
      vertical: new THREE.Vector3(0, -1, 0),
      massPerSquareMetre: 0.19,
      pin: column => column === 0,
      iterations: compact ? 3 : 4,
    }, terrain.collisions);
    resources.geometry(`flag cloth ${index}`, () => cloth.geometry);
    const mesh = resources.mesh(`wind-driven cloth flag ${index}`, cloth.geometry, material);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    flags.push({ cloth, mesh, x, z, height: ground + 4.65, rows });
    terrain.collisions.addBox(new THREE.Vector3(x, ground + 2.5, z), new THREE.Vector3(0.07, 2.5, 0.07), "metal");
  }
  resources.finalizeBounds(poles);
  const pin = new THREE.Vector3();
  const fabricClimate: FabricClimate = { temperature: 18, humidity: 0.6, rain: 0, snow: 0, sunlight: 0.8, windSpeed: 2 };
  physics.beforeStep((dt, seconds) => {
    fabricClimate.temperature = weather.state.temperature;
    fabricClimate.humidity = weather.state.humidity;
    fabricClimate.rain = weather.state.rain;
    fabricClimate.snow = weather.state.snow;
    fabricClimate.sunlight = weather.state.sunExposure;
    fabricClimate.windSpeed = weather.state.windSpeed;
    for (const flag of flags) {
      const mastFlex = Math.sin(seconds * 1.1 + flag.x * 0.1) * weather.state.windSpeed * 0.002;
      for (let row = 0; row <= flag.rows; row++) {
        pin.set(flag.x + 0.055 + mastFlex, flag.height - row / flag.rows * 0.85, flag.z);
        flag.cloth.movePin(0, row, pin);
      }
      flag.cloth.step(dt, seconds, weather.wind, weather.state.rain, fabricClimate);
    }
  });
  let lastGeometryUpdate = -1;
  return {
    update(seconds, night) {
      nightUniform.value = night ? 1 : 0;
      material.roughness = 0.92 - weather.state.rain * 0.16;
      material.color.setScalar(1 - weather.state.rain * 0.14);
      const frozen = 1 - smoothstep(-4, 0, weather.state.temperature);
      material.color.lerp(new THREE.Color("#d2d9dc"), frozen * 0.16);
      if (seconds - lastGeometryUpdate < 1 / 30 && seconds >= lastGeometryUpdate) return;
      for (const flag of flags) flag.cloth.writeGeometry();
      lastGeometryUpdate = seconds;
    },
    reset() {
      for (const flag of flags) flag.cloth.reset();
      lastGeometryUpdate = -1;
    },
  };
}
