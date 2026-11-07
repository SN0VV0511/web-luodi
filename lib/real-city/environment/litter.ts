import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { createBotanicalLeaf } from "./plant-geometry";
import { createRandom, clamp } from "../physics/math";
import { createTerrainPoint } from "./terrain";

export function buildGroundLitterLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, physics, terrain, weather, interactions, budget } = context;
  const pool = physics.particles;
  const random = createRandom(77019);
  const dummy = new THREE.Object3D();
  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const color = new THREE.Color();
  const ground = createTerrainPoint();
  const leafGeometry = resources.geometry("fallen maple leaf", () => createBotanicalLeaf("maple"));
  const paperGeometry = resources.geometry("creased street paper", () => {
    const geometry = new THREE.PlaneGeometry(0.16, 0.21, 2, 2);
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      positions.setZ(index, Math.abs(x) < 0.01 ? 0.016 : Math.sin(y * 24) * 0.005);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
  const leafMap = resources.canvas("fallen leaf venation", 128, 128, canvas => {
    canvas.fillStyle = "#b59753";
    canvas.fillRect(0, 0, 128, 128);
    const random = createRandom(711);
    for (let speck = 0; speck < 360; speck++) {
      canvas.fillStyle = speck % 2 ? "rgba(70,47,15,0.17)" : "rgba(228,194,100,0.22)";
      canvas.fillRect(random() * 128, random() * 128, 1 + random() * 2, 1 + random() * 3);
    }
    canvas.strokeStyle = "#d2bd77";
    canvas.lineWidth = 1.2;
    canvas.beginPath();
    canvas.moveTo(64, 128);
    canvas.lineTo(64, 0);
    for (let row = 18; row < 128; row += 20) {
      canvas.moveTo(64, row);
      canvas.lineTo(8, row - 21);
      canvas.moveTo(64, row);
      canvas.lineTo(120, row - 21);
    }
    canvas.stroke();
  });
  const paperMap = resources.canvas("discarded folded leaflet", 128, 128, canvas => {
    canvas.fillStyle = "#d1cbb8";
    canvas.fillRect(0, 0, 128, 128);
    canvas.fillStyle = "#6d7977";
    canvas.fillRect(10, 10, 108, 18);
    canvas.fillStyle = "#92968b";
    for (let row = 38; row < 118; row += 7) {
      canvas.fillRect(11, row, 44, 2);
      canvas.fillRect(66, row, 49, 2);
    }
    canvas.strokeStyle = "#a8a390";
    canvas.lineWidth = 2;
    canvas.beginPath();
    canvas.moveTo(64, 0);
    canvas.lineTo(64, 128);
    canvas.stroke();
  });
  const leafMaterial = resources.material("fallen leaf surface", () => new THREE.MeshStandardMaterial({ color: "#c6aa6f", map: leafMap, roughness: 0.9, side: THREE.DoubleSide }));
  const paperMaterial = resources.material("folded paper surface", () => new THREE.MeshStandardMaterial({ color: "#d3ccba", map: paperMap, roughness: 0.95, side: THREE.DoubleSide }));
  const leaves = resources.batch("ground-contact leaves", leafGeometry, leafMaterial, pool.capacity, true);
  const papers = resources.batch("windblown street paper", paperGeometry, paperMaterial, Math.max(1, Math.floor(pool.capacity / 8)), true);
  leaves.frustumCulled = false;
  papers.frustumCulled = false;
  leaves.count = 0;
  papers.count = 0;
  const emitterSites: { x: number; y: number; z: number }[] = [];
  for (let attempt = 0; attempt < 500 && emitterSites.length < 25; attempt++) {
    const x = -62 + random() * 124;
    const z = -92 + random() * 174;
    if (!terrain.clearForPlant(x, z, 0.4)) continue;
    terrain.sample(x, z, ground);
    emitterSites.push({ x, y: ground.height, z });
  }
  let lastTime: number | undefined;
  let falling = 0;
  let paperTimer = 0;
  let currentSeconds = 0;
  pool.onImpact = impact => {
    interactions.record("debris", impact.position, impact.speed, impact.radius, currentSeconds);
  };
  const emitLeaf = (seconds: number, grounded = false) => {
    const site = emitterSites[Math.floor(random() * emitterSites.length)];
    if (!site) return;
    position.set(site.x + (random() - 0.5) * 2, site.y + (grounded ? 0.035 : 1.2 + random() * 2.2), site.z + (random() - 0.5) * 2);
    velocity.set((random() - 0.5) * 0.4, grounded ? 0 : -0.15, (random() - 0.5) * 0.4);
    const particle = pool.emit({ position, velocity, radius: 0.045 + random() * 0.025, mass: 0.0007, lifetime: 28 + random() * 25, drag: 1.1, material: "leaf", buoyancy: 0.86 });
    particle.spin.set(random() * Math.PI, random() * Math.PI * 2, random() * Math.PI);
    particle.grounded = grounded;
    particle.age = seconds < 0 ? 0 : random() * 0.1;
  };
  return {
    update(seconds, night, season, interpolation) {
      currentSeconds = seconds;
      const dt = lastTime === undefined ? 0 : clamp(seconds - lastTime, 0, 0.25);
      const first = lastTime === undefined;
      lastTime = seconds;
      const seasonRate = season.season === "autumn" ? 2.4 : season.season === "spring" ? 0.6 : season.season === "summer" ? 0.15 : 0.03;
      if (first && season.season === "autumn") for (let index = 0; index < Math.min(18, pool.capacity / 3); index++) emitLeaf(seconds, true);
      falling += seasonRate * dt;
      for (let emitted = 0; emitted < 4 && falling >= 1; emitted++) {
        falling--;
        emitLeaf(seconds);
      }
      paperTimer += dt;
      if (paperTimer > 12 && weather.state.windSpeed > 2.5) {
        paperTimer = 0;
        position.set(-81.6, 0.6, 79 + random() * 10);
        velocity.set(0.15, 0.2, 0.1);
        pool.emit({ position, velocity, radius: 0.08, mass: 0.002, lifetime: 20, drag: 1.3, material: "paper", buoyancy: 0.45 });
      }
      let leafCount = 0;
      let paperCount = 0;
      for (const particle of pool.particles) {
        if (!particle.active) continue;
        dummy.position.lerpVectors(particle.previous, particle.position, interpolation);
        if (particle.grounded) dummy.rotation.set(-Math.PI / 2, particle.spin.y, 0);
        else dummy.rotation.set(particle.spin.x + particle.age * 0.8, particle.spin.y + particle.age * 0.3, particle.spin.z + Math.sin(particle.age * 4) * 0.5);
        const fade = Math.min(1, (particle.lifetime - particle.age) / 2);
        if (particle.material === "paper") {
          if (paperCount >= papers.instanceMatrix.count) continue;
          dummy.scale.setScalar(fade);
          dummy.updateMatrix();
          papers.setMatrixAt(paperCount++, dummy.matrix);
        } else {
          const scale = particle.radius * 3.6 * fade;
          dummy.scale.set(scale, scale, scale);
          dummy.updateMatrix();
          leaves.setMatrixAt(leafCount, dummy.matrix);
          color.set(season.season === "spring" ? "#c4b29c" : particle.age % 3 < 1 ? "#b09343" : "#855b32");
          color.multiplyScalar(1 - particle.wetness * 0.2);
          leaves.setColorAt(leafCount++, color);
        }
      }
      leaves.count = leafCount;
      papers.count = paperCount;
      leaves.instanceMatrix.needsUpdate = true;
      papers.instanceMatrix.needsUpdate = true;
      if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
      leafMaterial.envMapIntensity = night ? 0.15 : 0.35;
    },
    reset() {
      lastTime = undefined;
      falling = 0;
      paperTimer = 0;
      leaves.count = 0;
      papers.count = 0;
    },
  };
}
