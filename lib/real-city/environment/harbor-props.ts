import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { BuoyancyController, boxBuoyancyPoints } from "../physics/buoyancy";
import { CableSimulation } from "../physics/cable";
import type { RopeClimate } from "../physics/rope-material";
import type { RigidBody } from "../physics/body";
import { HarborWaveField } from "./waves";
import { createRandom, clamp } from "../physics/math";

type Mooring = { body: RigidBody; buoyancy: BuoyancyController; cable: CableSimulation; collar: THREE.Vector3; anchor: THREE.Vector3; color: THREE.Color };

export function buildHarborPhysicsLayer(context: EnvironmentContext, waves: HarborWaveField): EnvironmentLayer {
  const { resources, physics, terrain, weather, budget } = context;
  const compact = budget.simulatedHz < 60;
  const count = compact ? 5 : 8;
  resources.reserveBodies(count + 3);
  const random = createRandom(4312);
  const dummy = new THREE.Object3D();
  const force = new THREE.Vector3();
  const point = new THREE.Vector3();
  const seaNormal = new THREE.Vector3();
  const barkMap = resources.canvas("harbor weathered wood", 256, 128, canvas => {
    const random = createRandom(318);
    canvas.fillStyle = "#8b8272";
    canvas.fillRect(0, 0, 256, 128);
    for (let grain = 0; grain < 130; grain++) {
      const y = random() * 128;
      const tone = 56 + Math.floor(random() * 100);
      canvas.strokeStyle = `rgba(${tone},${Math.floor(tone * 0.94)},${Math.floor(tone * 0.8)},0.62)`;
      canvas.lineWidth = 0.4 + random() * 1.4;
      canvas.beginPath();
      canvas.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) canvas.lineTo(x, y + Math.sin(x * 0.04 + grain) * 1.5);
      canvas.stroke();
    }
    canvas.fillStyle = "rgba(44,53,45,0.32)";
    for (let patch = 0; patch < 30; patch++) canvas.fillRect(random() * 256, random() * 128, 2 + random() * 8, 0.6 + random() * 3);
  });
  barkMap.colorSpace = THREE.SRGBColorSpace;
  const buoyTexture = resources.canvas("marine enamel chips", 128, 128, canvas => {
    const random = createRandom(103);
    canvas.fillStyle = "#ece9db";
    canvas.fillRect(0, 0, 128, 128);
    for (let chip = 0; chip < 240; chip++) {
      canvas.fillStyle = chip % 3 ? "rgba(99,104,95,0.16)" : "rgba(65,71,65,0.25)";
      canvas.fillRect(random() * 128, random() * 128, 0.5 + random() * 2.3, 0.5 + random() * 1.3);
    }
    canvas.fillStyle = "rgba(74,91,63,0.3)";
    canvas.fillRect(0, 100, 128, 28);
  });
  const buoyMaterial = resources.material("marine buoy enamel", () => new THREE.MeshStandardMaterial({
    color: "#dad6c7", map: buoyTexture, roughness: 0.48, metalness: 0.25,
  }));
  const metal = resources.material("marine stainless hardware", () => new THREE.MeshStandardMaterial({ color: "#707e82", roughness: 0.34, metalness: 0.82 }));
  const ropeMaterial = resources.material("braided mooring rope", () => new THREE.MeshStandardMaterial({ color: "#b8ac8f", roughness: 0.95 }));
  const woodMaterial = resources.material("wet floating timber", () => new THREE.MeshStandardMaterial({ color: "#c0ad8a", map: barkMap, roughness: 0.62 }));
  const buoyGeometry = resources.geometry("formed navigation buoy", () => {
    const profile = [
      new THREE.Vector2(0.045, -0.29),
      new THREE.Vector2(0.13, -0.24),
      new THREE.Vector2(0.205, -0.12),
      new THREE.Vector2(0.22, 0.02),
      new THREE.Vector2(0.19, 0.13),
      new THREE.Vector2(0.12, 0.21),
      new THREE.Vector2(0.085, 0.29),
      new THREE.Vector2(0.04, 0.32),
    ];
    return new THREE.LatheGeometry(profile, 20);
  });
  const ringGeometry = resources.geometry("buoy lifting eye", () => new THREE.TorusGeometry(0.048, 0.011, 5, 10));
  const buoyMesh = resources.batch("floating harbor buoys", buoyGeometry, buoyMaterial, count, true);
  const hardware = resources.batch("buoy lifting eyes", ringGeometry, metal, count, true);
  buoyMesh.frustumCulled = false;
  hardware.frustumCulled = false;
  const moorings: Mooring[] = [];
  for (let index = 0; index < count; index++) {
    const x = 112 + index * 9.5;
    const z = 129 + (index % 2) * 3.8;
    const body = physics.createBody({
      shape: { kind: "sphere", radius: 0.22 },
      position: new THREE.Vector3(x, 0.06, z),
      mass: 7.7,
      material: "metal",
      dragCoefficient: 0.52,
      angularDamping: 0.55,
      groundCollision: false,
    });
    const buoyancy = new BuoyancyController(body, [{ local: new THREE.Vector3(0, -0.08, 0), volume: 0.018, radius: 0.22 }], waves.sample);
    const anchor = new THREE.Vector3(x - 1.2, 0.38, 119.8);
    const collar = new THREE.Vector3(0, 0.29, 0);
    const cable = new CableSimulation({ start: anchor, end: body.position.clone().add(collar), slack: 1.035, segments: 16, mass: 2.6, radius: 0.018, endPinned: true }, terrain.collisions);
    cable.setWaterSampler(waves.sample);
    resources.geometry(`mooring rope ${index}`, () => cable.geometry);
    resources.mesh(`mooring rope ${index}`, cable.geometry, ropeMaterial);
    const color = new THREE.Color(index % 2 === 0 ? "#b2503c" : "#c3b98d");
    buoyMesh.setColorAt(index, color);
    moorings.push({ body, buoyancy, cable, collar, anchor, color });
  }
  const timberGeometry = resources.geometry("waterlogged rounded timber", () => {
    const geometry = new THREE.CylinderGeometry(0.12, 0.15, 1.4, 9, 4);
    geometry.rotateZ(Math.PI / 2);
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      positions.setY(index, positions.getY(index) + Math.sin(x * 5.2) * 0.018);
      positions.setZ(index, positions.getZ(index) + Math.sin(x * 7.1) * 0.012);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
  const timbers = resources.batch("floating shore timber", timberGeometry, woodMaterial, 3, true);
  timbers.frustumCulled = false;
  const timberBodies: RigidBody[] = [];
  const timberBuoyancy: BuoyancyController[] = [];
  for (let index = 0; index < 3; index++) {
    const halfExtents = new THREE.Vector3(0.7, 0.13, 0.13);
    const body = physics.createBody({
      shape: { kind: "box", halfExtents },
      position: new THREE.Vector3(-187 + index * 17, 0, 132 + index * 1.3),
      mass: 10.4,
      material: "wood",
      dragCoefficient: 0.9,
      angularDamping: 0.3,
      groundCollision: false,
    });
    body.rotation.setFromEuler(new THREE.Euler(0, random() * 2, 0));
    timberBodies.push(body);
    timberBuoyancy.push(new BuoyancyController(body, boxBuoyancyPoints(halfExtents, 0.024), waves.sample));
  }
  const ropeClimate: RopeClimate = { wetness: 0, temperature: 18, salt: 0, ultraviolet: 0.5 };
  physics.beforeStep((dt, seconds) => {
    ropeClimate.wetness = Math.max(weather.state.rain, 0.3);
    ropeClimate.temperature = weather.state.temperature;
    ropeClimate.salt = weather.aerosols?.mean.seaSalt ?? 0;
    ropeClimate.ultraviolet = weather.state.sunExposure;
    for (const mooring of moorings) {
      mooring.buoyancy.step(dt, seconds);
      point.copy(mooring.collar).applyQuaternion(mooring.body.rotation).add(mooring.body.position);
      mooring.cable.moveStart(mooring.anchor);
      mooring.cable.moveEnd(point);
      mooring.cable.setClimate(ropeClimate);
      mooring.cable.step(dt, seconds, weather.wind);
      mooring.cable.endpointForce(force, 180);
      force.clampLength(0, 45);
      mooring.body.applyForceAt(force, point);
      // A moored buoy has a low centre of mass and cannot stay upside down.
      seaNormal.set(0, 1, 0).applyQuaternion(mooring.body.rotation);
      mooring.body.torque.x += seaNormal.z * 2.6;
      mooring.body.torque.z -= seaNormal.x * 2.6;
    }
    for (let index = 0; index < timberBodies.length; index++) {
      const body = timberBodies[index];
      timberBuoyancy[index].step(dt, seconds);
      const home = body.initialPosition;
      force.set((home.x - body.position.x) * 0.16, 0, (home.z - body.position.z) * 0.16);
      body.applyForce(force);
    }
  });
  let lastRopeUpdate = -1;
  return {
    update(seconds, night, _season, interpolation) {
      moorings.forEach((mooring, index) => {
        mooring.body.renderTo(dummy, interpolation);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        buoyMesh.setMatrixAt(index, dummy.matrix);
        point.copy(mooring.collar).applyQuaternion(dummy.quaternion).add(dummy.position);
        dummy.position.copy(point);
        dummy.updateMatrix();
        hardware.setMatrixAt(index, dummy.matrix);
      });
      timberBodies.forEach((body, index) => {
        body.renderTo(dummy, interpolation);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        timbers.setMatrixAt(index, dummy.matrix);
      });
      buoyMesh.instanceMatrix.needsUpdate = true;
      hardware.instanceMatrix.needsUpdate = true;
      timbers.instanceMatrix.needsUpdate = true;
      if (seconds - lastRopeUpdate >= 1 / 24 || seconds < lastRopeUpdate) {
        for (const mooring of moorings) mooring.cable.writeGeometry();
        lastRopeUpdate = seconds;
      }
      buoyMaterial.roughness = 0.48 - weather.state.rain * 0.12;
      woodMaterial.roughness = 0.68 - clamp(timberBuoyancy[0].submergedFraction, 0, 1) * 0.22;
      metal.envMapIntensity = night ? 0.3 : 0.8;
    },
    reset() {
      for (const mooring of moorings) {
        mooring.cable.reset();
        mooring.buoyancy.reset();
      }
      for (const buoyancy of timberBuoyancy) buoyancy.reset();
      lastRopeUpdate = -1;
    },
  };
}
