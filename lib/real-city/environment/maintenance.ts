import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { createHead, createTorso, createPelvis, createUpperArm, createForearm, createThigh, createCalf, createHand, createShoe, createCap } from "../../city-figure";
import { createVehicleShell, createVehicleWheel } from "../../city-vehicles";
import { FootContactTracker, VehicleSuspension } from "../physics/support";
import { clamp, hermitePosition, signedAngle } from "../physics/math";
import { createGroundSample } from "../physics/colliders";

type Worker = { position: THREE.Vector3; heading: number; phase: number; tracker: FootContactTracker; homeX: number; homeZ: number; lastStepTime: number };

export function buildParkMaintenanceLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, terrain, water, interactions, budget, weather } = context;
  const compact = budget.simulatedHz < 60;
  const workerCount = compact ? 2 : 3;
  const dummy = new THREE.Object3D();
  const ground = createGroundSample();
  const skin = resources.material("garden worker skin", () => new THREE.MeshStandardMaterial({ color: "#bc987d", roughness: 0.77, vertexColors: true }));
  const jacket = resources.material("garden maintenance jacket", () => new THREE.MeshStandardMaterial({ color: "#ad6c32", roughness: 0.89, vertexColors: true }));
  const trousers = resources.material("garden work trousers", () => new THREE.MeshStandardMaterial({ color: "#39474a", roughness: 0.95 }));
  const footwear = resources.material("garden work boots", () => new THREE.MeshStandardMaterial({ color: "#c7bfa9", roughness: 0.91, vertexColors: true }));
  const metal = resources.material("garden tool steel", () => new THREE.MeshStandardMaterial({ color: "#5e6a69", roughness: 0.48, metalness: 0.72 }));
  const handles = resources.material("garden tool handles", () => new THREE.MeshStandardMaterial({ color: "#92775a", roughness: 0.86 }));
  const meshes = {
    head: resources.batch("maintenance worker heads", resources.geometry("maintenance head", createHead), skin, workerCount, true),
    torso: resources.batch("maintenance worker jackets", resources.geometry("maintenance torso", createTorso), jacket, workerCount, true),
    pelvis: resources.batch("maintenance worker pelvis", resources.geometry("maintenance pelvis", createPelvis), trousers, workerCount, true),
    upperArm: resources.batch("maintenance worker sleeves", resources.geometry("maintenance upper arm", createUpperArm), jacket, workerCount * 2, true),
    forearm: resources.batch("maintenance worker forearms", resources.geometry("maintenance forearm", createForearm), jacket, workerCount * 2, true),
    hand: resources.batch("maintenance worker hands", resources.geometry("maintenance hand", createHand), skin, workerCount * 2, true),
    thigh: resources.batch("maintenance worker thighs", resources.geometry("maintenance thigh", createThigh), trousers, workerCount * 2, true),
    calf: resources.batch("maintenance worker calves", resources.geometry("maintenance calf", createCalf), trousers, workerCount * 2, true),
    shoe: resources.batch("maintenance worker boots", resources.geometry("maintenance shoe", createShoe), footwear, workerCount * 2, true),
    cap: resources.batch("maintenance worker caps", resources.geometry("maintenance cap", createCap), jacket, workerCount, true),
  };
  for (const mesh of Object.values(meshes)) mesh.frustumCulled = false;
  const shaftGeometry = resources.geometry("rake handle", () => new THREE.CylinderGeometry(0.014, 0.018, 1.15, 7));
  const rakeGeometry = resources.geometry("rake head", () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.19, 0);
    shape.lineTo(0.19, 0);
    shape.lineTo(0.19, 0.045);
    for (let tooth = 6; tooth >= 0; tooth--) {
      const x = -0.18 + tooth * 0.06;
      shape.lineTo(x + 0.02, 0.045);
      shape.lineTo(x + 0.016, 0.13);
      shape.lineTo(x - 0.008, 0.13);
      shape.lineTo(x - 0.012, 0.045);
    }
    shape.lineTo(-0.19, 0.045);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.015, bevelEnabled: false });
  });
  const shafts = resources.batch("garden rake handles", shaftGeometry, handles, workerCount, true);
  const rakes = resources.batch("garden rake tines", rakeGeometry, metal, workerCount, true);
  shafts.frustumCulled = false;
  rakes.frustumCulled = false;
  const workers: Worker[] = [];
  let currentTime = 0;
  for (let index = 0; index < workerCount; index++) {
    const homeX = index === 0 ? -48 : index === 1 ? 43 : 8;
    const homeZ = index === 0 ? 43 : index === 1 ? -70 : 72;
    const tracker = new FootContactTracker(terrain.collisions);
    const worker: Worker = { position: new THREE.Vector3(homeX, 0.39, homeZ), heading: 0, phase: index * 2.1, tracker, homeX, homeZ, lastStepTime: 0 };
    tracker.onStep = point => {
      if (currentTime - worker.lastStepTime < 0.18) return;
      interactions.record("foot", point, 0.62, 0.14, currentTime, worker.heading);
      worker.lastStepTime = currentTime;
    };
    workers.push(worker);
  }
  const place = (mesh: THREE.InstancedMesh, index: number, worker: Worker, x: number, y: number, z: number, sx: number, sy: number, sz: number, pitch = 0) => {
    const sin = Math.sin(worker.heading);
    const cos = Math.cos(worker.heading);
    dummy.position.set(worker.position.x + cos * x + sin * z, worker.position.y + y, worker.position.z - sin * x + cos * z);
    dummy.rotation.set(0, worker.heading, 0);
    dummy.rotateX(pitch);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };
  const shell = createVehicleShell("truck");
  for (const [name, geometry] of Object.entries({ body: shell.body, glass: shell.glass, trim: shell.trim, chrome: shell.chrome })) resources.geometry(`garden cart ${name}`, () => geometry);
  const wheels = createVehicleWheel();
  resources.geometry("garden cart tire", () => wheels.tire);
  resources.geometry("garden cart rim", () => wheels.rim);
  const paint = resources.material("garden service vehicle paint", () => new THREE.MeshPhysicalMaterial({ color: "#899577", roughness: 0.32, metalness: 0.18, clearcoat: 0.7 }));
  const glass = resources.material("garden service vehicle glass", () => new THREE.MeshPhysicalMaterial({ color: "#425a65", roughness: 0.15, metalness: 0.32, clearcoat: 0.9 }));
  const rubber = resources.material("garden service tire rubber", () => new THREE.MeshStandardMaterial({ color: "#272e30", roughness: 0.86 }));
  const vehicleParts = {
    body: resources.mesh("electric park service van", shell.body, paint),
    glass: resources.mesh("service van glazing", shell.glass, glass),
    trim: resources.mesh("service van rubber trims", shell.trim, rubber),
    chrome: resources.mesh("service van hardware", shell.chrome, metal),
  };
  const tireMesh = resources.batch("service van tires", wheels.tire, rubber, 4, true);
  const rimMesh = resources.batch("service van rims", wheels.rim, metal, 4, true);
  tireMesh.frustumCulled = false;
  rimMesh.frustumCulled = false;
  const scale = 0.62;
  const wheelLocations = shell.wheels.map(wheel => ({ x: wheel.x * scale, z: wheel.z * scale }));
  const suspension = new VehicleSuspension(terrain.collisions, wheelLocations, shell.wheelR * scale);
  const vehiclePosition = new THREE.Vector3();
  let lastTime: number | undefined;
  let previousHeading = 0;
  let previousSpeed = 0;
  let odometer = 0;
  let priorX = 0;
  let priorZ = 0;
  let lastWheelImpact = 0;
  return {
    update(seconds, night) {
      currentTime = seconds;
      const dt = lastTime === undefined ? 1 / 60 : clamp(seconds - lastTime, 0, 0.1);
      lastTime = seconds;
      for (let index = 0; index < workers.length; index++) {
        const worker = workers[index];
        const cycle = (seconds + index * 11) % 34;
        const walking = cycle < 12 || cycle > 26;
        const walkPhase = cycle < 12 ? cycle / 12 : cycle > 26 ? (34 - cycle) / 8 : 1;
        const distance = hermitePosition(0, 4.8, 0, 0, clamp(walkPhase, 0, 1), 12);
        worker.position.x = worker.homeX + distance * 0.65;
        worker.position.z = worker.homeZ + distance * 0.75;
        worker.heading = Math.atan2(0.65, 0.75) + (cycle > 26 ? Math.PI : 0);
        terrain.sampleGround(worker.position.x, worker.position.z, ground);
        worker.position.y = ground.height;
        const gait = walking ? seconds * 5 + worker.phase : worker.phase;
        const pelvis = worker.tracker.update(worker.position, worker.heading, gait, walking ? 0.65 : 0.02, dt);
        const lean = walking ? 0.025 : 0.16 + Math.sin(seconds * 1.6 + worker.phase) * 0.06;
        const bob = walking ? Math.abs(Math.sin(gait)) * 0.018 : 0;
        place(meshes.pelvis, index, worker, 0, 0.86 + pelvis, 0, 0.3, 0.2, 0.23);
        place(meshes.torso, index, worker, 0, 1.15 + pelvis + bob, lean * 0.3, 0.42, 0.48, 0.28, lean);
        place(meshes.head, index, worker, 0, 1.53 + pelvis + bob, lean * 0.5, 0.23, 0.25, 0.23, lean * 0.4);
        place(meshes.cap, index, worker, 0, 1.61 + pelvis + bob, lean * 0.5, 0.235, 0.25, 0.235, lean * 0.4);
        for (const [limb, side] of [-1, 1].entries()) {
          const slot = index * 2 + limb;
          const swing = walking ? Math.sin(gait + (side > 0 ? Math.PI : 0)) * 0.38 : 0.05;
          const foot = side < 0 ? worker.tracker.left : worker.tracker.right;
          place(meshes.thigh, slot, worker, side * 0.115, 0.65 + pelvis, Math.sin(swing) * 0.1, 0.2, 0.38, 0.2, swing);
          place(meshes.calf, slot, worker, side * 0.115, 0.29 + pelvis, Math.sin(swing) * 0.16, 0.17, 0.34, 0.17, -swing * 0.6);
          dummy.position.copy(foot.position).add(new THREE.Vector3(0, 0.07, 0));
          dummy.rotation.set(0, worker.heading, 0);
          dummy.scale.set(0.14, 0.14, 0.27);
          dummy.updateMatrix();
          meshes.shoe.setMatrixAt(slot, dummy.matrix);
          const reach = walking ? -swing * 0.5 : -0.5 + Math.sin(seconds * 1.6 + worker.phase) * 0.12;
          place(meshes.upperArm, slot, worker, side * 0.22, 1.16 + pelvis, 0.07, 0.15, 0.28, 0.15, reach);
          place(meshes.forearm, slot, worker, side * 0.23, 0.92 + pelvis, walking ? 0.05 : 0.22, 0.12, 0.25, 0.12, reach - 0.25);
          place(meshes.hand, slot, worker, side * 0.23, 0.77 + pelvis, walking ? 0.08 : 0.3, 0.1, 0.14, 0.09, reach);
        }
        const toolPitch = walking ? -0.25 : -0.55 + Math.sin(seconds * 1.6 + worker.phase) * 0.12;
        place(shafts, index, worker, 0.25, 0.72, walking ? 0.16 : 0.45, 1, 1, 1, toolPitch);
        place(rakes, index, worker, 0.25, 0.16, walking ? 0.3 : 0.73, 1, 1, 1, Math.PI / 2);
        if (!walking) water.disturb(worker.position.x + 0.5, worker.position.z + 0.7, 3000 * dt, 0.3);
      }
      for (const mesh of Object.values(meshes)) mesh.instanceMatrix.needsUpdate = true;
      shafts.instanceMatrix.needsUpdate = true;
      rakes.instanceMatrix.needsUpdate = true;
      const routePhase = seconds * 0.014;
      const x = Math.sin(routePhase) * 47;
      const z = -106.4 + Math.cos(routePhase) * 1.9;
      const dx = Math.cos(routePhase) * 47 * 0.014;
      const dz = -Math.sin(routePhase) * 1.9 * 0.014;
      const heading = Math.atan2(dx, dz);
      const speed = Math.hypot(dx, dz);
      terrain.sampleGround(x, z, ground);
      vehiclePosition.set(x, ground.height, z);
      const acceleration = dt > 0 ? (speed - previousSpeed) / dt : 0;
      const lateral = dt > 0 ? signedAngle(previousHeading, heading) / dt * speed : 0;
      const ride = suspension.update(vehiclePosition, heading, clamp(acceleration, -4, 4), clamp(lateral, -3, 3), dt);
      if (priorX !== 0 || priorZ !== 0) odometer += Math.min(0.5, Math.hypot(x - priorX, z - priorZ));
      priorX = x;
      priorZ = z;
      previousHeading = heading;
      previousSpeed = speed;
      for (const mesh of Object.values(vehicleParts)) {
        mesh.position.set(x, ground.height + ride.heave, z);
        mesh.rotation.set(ride.pitch, heading, ride.roll);
        mesh.scale.setScalar(scale);
      }
      const sin = Math.sin(heading);
      const cos = Math.cos(heading);
      for (let index = 0; index < wheelLocations.length; index++) {
        const wheel = wheelLocations[index];
        dummy.position.set(x + cos * wheel.x + sin * wheel.z, ground.height + shell.wheelR * scale + suspension.wheels[index].compression * 0.3, z - sin * wheel.x + cos * wheel.z);
        dummy.rotation.set(0, heading, Math.PI / 2);
        dummy.rotateY(odometer / (shell.wheelR * scale));
        dummy.scale.setScalar(shell.wheelR * scale);
        dummy.updateMatrix();
        tireMesh.setMatrixAt(index, dummy.matrix);
        rimMesh.setMatrixAt(index, dummy.matrix);
        if (seconds - lastWheelImpact > 0.4 && speed > 0.2) interactions.record("wheel", suspension.wheels[index].ground, speed, 0.2, seconds, heading);
      }
      if (seconds - lastWheelImpact > 0.4) lastWheelImpact = seconds;
      tireMesh.instanceMatrix.needsUpdate = true;
      rimMesh.instanceMatrix.needsUpdate = true;
      paint.roughness = 0.32 - weather.state.rain * 0.1;
      paint.envMapIntensity = night ? 0.3 : 0.8;
    },
    reset() {
      lastTime = undefined;
      odometer = 0;
      priorX = 0;
      priorZ = 0;
      previousHeading = 0;
      previousSpeed = 0;
      lastWheelImpact = 0;
      for (const worker of workers) worker.lastStepTime = 0;
    },
  };
}
