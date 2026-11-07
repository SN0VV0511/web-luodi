import * as THREE from "three";
import type { CivicKit } from "../../city-civic";
import type { VehicleKind, VehicleShell } from "../../city-forms";
import type { TrafficRoute, TrafficState } from "./types";

type WiperSurface = {
  baseY: number;
  baseZ: number;
  upY: number;
  upZ: number;
  length: number;
};

type DetailPose = {
  x: number;
  y: number;
  z: number;
  pitch: number;
  roll: number;
  heading: number;
};

export function buildTrafficDetails(kit: CivicKit, routes: readonly TrafficRoute[], shells: Record<VehicleKind, VehicleShell>) {
  const root = new THREE.Group();
  root.name = "Vehicle weather and road signals";
  kit.group.add(root);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const rubber = new THREE.MeshStandardMaterial({ color: "#1c2429", roughness: 0.78, metalness: 0.12 });
  const indicator = new THREE.MeshStandardMaterial({
    color: "#ffb13b",
    emissive: "#ff7b08",
    emissiveIntensity: 2.2,
    roughness: 0.22,
    metalness: 0.08,
  });
  const brake = new THREE.MeshStandardMaterial({
    color: "#e12c21",
    emissive: "#ff1c0a",
    emissiveIntensity: 2.6,
    roughness: 0.2,
    metalness: 0.08,
  });
  const mistGeometry = new THREE.PlaneGeometry(1, 1);
  const mistTexture = kit.canvasTexture(64, 64, context => {
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, "rgba(220,235,240,0.32)");
    gradient.addColorStop(0.35, "rgba(210,225,235,0.2)");
    gradient.addColorStop(1, "rgba(200,215,225,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
  });
  const mist = new THREE.MeshBasicMaterial({
    color: "#d1dce2",
    map: mistTexture,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const footprintTexture = kit.canvasTexture(128, 64, context => {
    context.clearRect(0, 0, 128, 64);
    const fade = context.createLinearGradient(0, 0, 128, 0);
    fade.addColorStop(0, "rgba(12,20,28,0)");
    fade.addColorStop(0.8, "rgba(12,20,28,0.24)");
    fade.addColorStop(1, "rgba(12,20,28,0.34)");
    context.fillStyle = fade;
    context.fillRect(0, 5, 128, 54);
    context.globalCompositeOperation = "destination-out";
    for (let stripe = 0; stripe < 24; stripe++) context.fillRect(stripe * 6, 0, 1.1, 64);
    context.globalCompositeOperation = "source-over";
  });
  const wetTrack = new THREE.MeshBasicMaterial({
    map: footprintTexture,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  kit.geometries.add(geometry);
  kit.geometries.add(mistGeometry);
  for (const material of [rubber, indicator, brake, mist, wetTrack]) kit.materials.add(material);
  const wipers = batch("Windscreen wipers", geometry, rubber, routes.length * 4);
  const signals = batch("Vehicle turn indicators", geometry, indicator, routes.length * 4);
  const brakeLights = batch("Variable brake lamps", geometry, brake, routes.length * 2);
  const roadMist = batch("Wet tyre spray", mistGeometry, mist, routes.length * 4);
  const tracks = batch("Wet tyre contact marks", mistGeometry, wetTrack, routes.length * 2);
  const transform = new THREE.Object3D();
  const chassis = new THREE.Quaternion();
  const chassisEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const local = new THREE.Vector3();
  const endpoint = new THREE.Vector3();
  const startpoint = new THREE.Vector3();
  const worldOffset = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const color = new THREE.Color();
  const pose: DetailPose = { x: 0, y: 0.42, z: 0, pitch: 0, roll: 0, heading: 0 };
  const surfaces = new Map<VehicleKind, WiperSurface>();
  for (const kind of Object.keys(shells) as VehicleKind[]) surfaces.set(kind, windshield(shells[kind], kind));

  function batch(name: string, buffer: THREE.BufferGeometry, material: THREE.Material, count: number) {
    const mesh = new THREE.InstancedMesh(buffer, material, Math.max(1, count));
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 0), 450);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    root.add(mesh);
    return mesh;
  }

  function place(lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) {
    local.set(lx, ly, lz).applyQuaternion(chassis);
    transform.position.set(pose.x + local.x, pose.y + local.y, pose.z + local.z);
    transform.quaternion.copy(chassis);
    transform.scale.set(sx, sy, sz);
  }

  function wiperPart(index: number, from: THREE.Vector3, to: THREE.Vector3, thickness: number) {
    direction.copy(to).sub(from);
    const length = direction.length();
    transform.position.copy(from).add(to).multiplyScalar(0.5);
    transform.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1 / Math.max(0.001, length)));
    transform.scale.set(thickness, length, thickness);
    transform.updateMatrix();
    wipers.setMatrixAt(index, transform.matrix);
  }

  return {
    animate(seconds: number, states: readonly TrafficState[]) {
      for (let index = 0; index < routes.length; index++) {
        const route = routes[index];
        const state = states[index];
        const shell = shells[route.shell as VehicleKind];
        const surface = surfaces.get(route.shell as VehicleKind)!;
        pose.x = state.pose.x;
        pose.z = state.pose.z;
        pose.heading = state.pose.heading;
        pose.pitch = THREE.MathUtils.clamp(-state.acceleration * 0.0085, -0.035, 0.05);
        pose.roll = THREE.MathUtils.clamp(state.lateralAcceleration * 0.014, -0.04, 0.04);
        worldOffset.set(pose.x, pose.y, pose.z);
        chassis.setFromEuler(chassisEuler.set(pose.pitch, pose.heading, pose.roll));
        for (const side of [-1, 1]) {
          const slot = side > 0 ? 1 : 0;
          const pivotX = side * shell.width * 0.22;
          const angle = -0.9 + state.wiperPhase * 1.55;
          const across = Math.cos(angle) * surface.length;
          const rise = Math.sin(angle + 0.9) * surface.length;
          place(pivotX, surface.baseY, surface.baseZ, 1, 1, 1);
          const from = startpoint.copy(transform.position);
          endpoint.set(pivotX - across * 0.6, surface.baseY + rise * surface.upY, surface.baseZ + rise * surface.upZ)
            .applyQuaternion(chassis).add(worldOffset);
          wiperPart(index * 4 + slot * 2, from, endpoint, 0.018);
          local.set(-0.15, surface.upY * 0.2, surface.upZ * 0.2).applyQuaternion(chassis);
          from.copy(endpoint).addScaledVector(local, -0.5);
          endpoint.addScaledVector(local, 0.5);
          wiperPart(index * 4 + slot * 2 + 1, from, endpoint, 0.024);
          const indicatorSide = state.turnSignal > 0 ? -1 : 1;
          for (const end of [-1, 1]) {
            const signalSlot = index * 4 + slot * 2 + (end > 0 ? 1 : 0);
            if (!state.indicatorOn || side !== indicatorSide) signals.setMatrixAt(signalSlot, hiddenMatrix);
            else {
              place(side * shell.width * 0.43, shell.height * 0.4, end * shell.length * 0.48, 0.12, 0.075, 0.065);
              transform.updateMatrix();
              signals.setMatrixAt(signalSlot, transform.matrix);
            }
          }
          const tail = shell.lamps.find(lamp => lamp.tail && (lamp.x > 0 ? 1 : -1) === side);
          if (tail && state.braking > 0.025) {
            place(tail.x, tail.y, tail.z - 0.009, 0.27, 0.095, 0.08);
            transform.updateMatrix();
            brakeLights.setMatrixAt(index * 2 + slot, transform.matrix);
            color.setScalar(0.35 + state.braking * 0.65);
            brakeLights.setColorAt(index * 2 + slot, color);
          } else brakeLights.setMatrixAt(index * 2 + slot, hiddenMatrix);
          const rearWheel = shell.wheels.find(wheel => wheel.z < 0 && (wheel.x > 0 ? 1 : -1) === side);
          const spraySlot = index * 4 + slot * 2;
          if (rearWheel && state.spray > 0.02 && state.speed > 1) {
            for (let particle = 0; particle < 2; particle++) {
              const phase = (seconds * 2.8 + index * 0.31 + particle * 0.5) % 1;
              const radius = 0.16 + phase * state.spray * 0.8;
              place(rearWheel.x, 0.12 + phase * 0.35, rearWheel.z - 0.25 - phase * Math.min(2.8, state.speed * 0.35), radius, radius * 0.8, 1);
              transform.rotateY(particle * 0.7 - 0.35);
              transform.updateMatrix();
              roadMist.setMatrixAt(spraySlot + particle, transform.matrix);
            }
          } else {
            roadMist.setMatrixAt(spraySlot, hiddenMatrix);
            roadMist.setMatrixAt(spraySlot + 1, hiddenMatrix);
          }
          if (rearWheel && state.wetTires > 0.45 && state.speed > 0.7 && Math.abs(state.pose.curvature) < 0.01) {
            const length = Math.min(3.8, state.speed * 0.5);
            place(rearWheel.x, 0.02, rearWheel.z - length * 0.5, 0.22, length, 1);
            transform.rotation.set(-Math.PI / 2, 0, -pose.heading);
            transform.updateMatrix();
            tracks.setMatrixAt(index * 2 + slot, transform.matrix);
          } else tracks.setMatrixAt(index * 2 + slot, hiddenMatrix);
        }
      }
      for (const mesh of [wipers, signals, brakeLights, roadMist, tracks]) mesh.instanceMatrix.needsUpdate = true;
      if (brakeLights.instanceColor) brakeLights.instanceColor.needsUpdate = true;
    },
    dispose() {
      for (const mesh of [wipers, signals, brakeLights, roadMist, tracks]) mesh.dispose();
      root.removeFromParent();
    },
  };
}

function windshield(shell: VehicleShell, kind: VehicleKind): WiperSurface {
  const position = shell.glass.getAttribute("position");
  let minimumY = Infinity;
  let maximumY = -Infinity;
  let baseZ = 0;
  let topZ = 0;
  const centerWidth = shell.width * 0.28;
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = position.getZ(index);
    if (Math.abs(x) > centerWidth || z < shell.length * 0.05 || y < shell.height * 0.45) continue;
    if (y < minimumY) {
      minimumY = y;
      baseZ = z;
    }
    if (y > maximumY) {
      maximumY = y;
      topZ = z;
    }
  }
  if (!Number.isFinite(minimumY) || maximumY - minimumY < 0.1) {
    minimumY = shell.height * 0.62;
    maximumY = shell.height * 0.91;
    baseZ = shell.length * (kind === "bus" ? 0.46 : 0.2);
    topZ = baseZ - shell.length * 0.08;
  }
  const height = maximumY - minimumY;
  const depth = topZ - baseZ;
  const length = Math.hypot(height, depth);
  return {
    baseY: minimumY + 0.035,
    baseZ: baseZ + 0.02,
    upY: height / Math.max(0.1, length),
    upZ: depth / Math.max(0.1, length),
    length: Math.min(shell.width * 0.33, length * 0.8),
  };
}
