import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { createRandom } from "../physics/math";
import { createGroundSample } from "../physics/colliders";
import type { RigidBody } from "../physics/body";

export function buildStreetDebrisLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, physics, terrain, weather, budget } = context;
  const count = budget.simulatedHz < 60 ? 3 : 5;
  resources.reserveBodies(count);
  const random = createRandom(613);
  const ground = createGroundSample();
  const dummy = new THREE.Object3D();
  const canGeometry = resources.geometry("dented aluminium can", () => {
    const profile = [
      new THREE.Vector2(0.026, -0.058),
      new THREE.Vector2(0.032, -0.054),
      new THREE.Vector2(0.034, -0.045),
      new THREE.Vector2(0.034, 0.038),
      new THREE.Vector2(0.03, 0.048),
      new THREE.Vector2(0.029, 0.056),
      new THREE.Vector2(0.032, 0.059),
      new THREE.Vector2(0.025, 0.06),
      new THREE.Vector2(0, 0.057),
    ];
    const geometry = new THREE.LatheGeometry(profile, 14);
    const positions = geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const dent = Math.exp(-(((y - 0.01) / 0.025) ** 2)) * Math.max(0, x) * 0.25;
      positions.setX(index, x - dent);
    }
    geometry.computeVertexNormals();
    return geometry;
  });
  const texture = resources.canvas("worn aluminium label", 128, 128, canvas => {
    canvas.fillStyle = "#8a8f86";
    canvas.fillRect(0, 0, 128, 128);
    canvas.fillStyle = "#8b4939";
    canvas.fillRect(0, 20, 128, 88);
    canvas.fillStyle = "#c7bfa5";
    canvas.fillRect(0, 42, 128, 20);
    canvas.fillStyle = "#d7caa4";
    for (let row = 77; row < 101; row += 5) canvas.fillRect(22, row, 82, 1);
    const random = createRandom(449);
    for (let chip = 0; chip < 90; chip++) {
      canvas.fillStyle = "rgba(190,197,189,0.65)";
      canvas.fillRect(random() * 128, random() * 128, 1 + random() * 4, 0.5);
    }
  });
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = resources.material("discarded aluminium", () => new THREE.MeshPhysicalMaterial({ map: texture, roughness: 0.42, metalness: 0.72, clearcoat: 0.3 }));
  const cans = resources.batch("wind driven contact debris", canGeometry, material, count, true);
  cans.frustumCulled = false;
  const bodies: RigidBody[] = [];
  for (let index = 0; index < count; index++) {
    const x = index < 3 ? -81.8 : 81.8;
    const z = 73 + index * 5.7;
    terrain.sampleGround(x, z, ground);
    const body = physics.createBody({
      shape: { kind: "box", halfExtents: new THREE.Vector3(0.034, 0.06, 0.034) },
      position: new THREE.Vector3(x, ground.height + 0.065, z),
      mass: 0.014,
      material: "metal",
      dragCoefficient: 1.15,
      angularDamping: 0.06,
    });
    body.rotation.setFromEuler(new THREE.Euler(random() * 0.5, random() * Math.PI * 2, random() * 0.9));
    body.angularVelocity.set(0.1, 0.05, 0.08);
    bodies.push(body);
  }
  const spin = new THREE.Vector3();
  physics.beforeStep((_dt, seconds) => {
    for (const body of bodies) {
      weather.windCurl(body.position.x, body.position.y, body.position.z, seconds, spin);
      body.torque.addScaledVector(spin, 0.00005);
      if (body.position.distanceToSquared(body.initialPosition) > 100) body.reset();
    }
  });
  return {
    update(_seconds, night, _season, interpolation) {
      for (let index = 0; index < bodies.length; index++) {
        bodies[index].renderTo(dummy, interpolation);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        cans.setMatrixAt(index, dummy.matrix);
      }
      cans.instanceMatrix.needsUpdate = true;
      material.envMapIntensity = night ? 0.2 : 0.7;
    },
    reset() {
      for (const body of bodies) body.reset();
    },
  };
}
