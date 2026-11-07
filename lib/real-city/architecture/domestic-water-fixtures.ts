import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";
import type { ArchitecturalMaterials } from "./materials";

function ellipseBowl(context: ArchitectureContext, width: number, depth: number, height: number, material: THREE.Material): void {
  const profile: THREE.Vector2[] = [];
  profile.push(new THREE.Vector2(0.055, 0.018));
  for (let index = 0; index <= 10; index++) {
    const t = index / 10;
    const radius = 0.18 + Math.sin(t * Math.PI / 2) * 0.82;
    const y = height * Math.pow(t, 1.8);
    profile.push(new THREE.Vector2(radius, y));
  }
  profile.push(new THREE.Vector2(1, height + 0.01));
  profile.push(new THREE.Vector2(0.88, height + 0.01));
  for (let index = 10; index >= 0; index--) {
    const t = index / 10;
    const radius = 0.12 + Math.sin(t * Math.PI / 2) * 0.76;
    const y = 0.035 + (height - 0.035) * Math.pow(t, 1.8);
    profile.push(new THREE.Vector2(radius, y));
  }
  profile.push(new THREE.Vector2(0.055, 0.035));
  profile.push(new THREE.Vector2(0.055, 0.018));
  const bowl = context.geometry(new THREE.LatheGeometry(profile, 28));
  bowl.scale(width / 2, 1, depth / 2);
  context.part(material, bowl, [0, 0, 0]);
}

function buildPopUpDrain(context: ArchitectureContext, radius: number): void {
  const { aluminum, dark } = context.palette;
  context.disc(dark, 0, 0, 0, radius * 1.1, 0.006);
  const rim = context.geometry(new THREE.TorusGeometry(radius, radius * 0.12, 4, 20));
  rim.rotateX(Math.PI / 2);
  context.part(aluminum, rim, [0, 0.004, 0]);
  context.disc(aluminum, 0, 0.007, 0, radius * 0.8, 0.006);
  for (let opening = 0; opening < 6; opening++) {
    const angle = opening * Math.PI * 2 / 6;
    context.disc(dark, Math.sin(angle) * radius * 0.72, 0.011, Math.cos(angle) * radius * 0.72, radius * 0.08, 0.002);
  }
}

function buildMixerTap(context: ArchitectureContext, height: number, reach: number): void {
  const { aluminum, dark, red, green } = context.palette;
  context.disc(aluminum, 0, 0.008, 0, 0.032, 0.016);
  context.disc(aluminum, 0, height * 0.44, 0, 0.023, height * 0.85);
  context.tube(aluminum, [[0, height * 0.74, 0], [0, height, 0.01], [0, height + 0.015, reach * 0.65], [0, height - 0.025, reach]], 0.016);
  context.disc(aluminum, 0, height - 0.035, reach, 0.018, 0.022);
  context.disc(dark, 0, height - 0.049, reach, 0.014, 0.006);
  context.box(aluminum, 0.032, height * 0.55, 0, 0.045, 0.035, 0.035);
  context.box(aluminum, 0.065, height * 0.65, 0, 0.012, height * 0.32, 0.025, 0, -0.25);
  context.box(red, -0.008, height * 0.58, 0.024, 0.004, 0.004, 0.003);
  context.box(green, 0.008, height * 0.58, 0.024, 0.004, 0.004, 0.003);
}

function buildBottleTrap(context: ArchitectureContext): void {
  const { aluminum } = context.palette;
  context.disc(aluminum, 0, -0.09, 0, 0.018, 0.18);
  context.disc(aluminum, 0, -0.21, 0, 0.034, 0.12);
  context.disc(aluminum, 0, -0.277, 0, 0.038, 0.018);
  context.tube(aluminum, [[0, -0.2, 0], [0, -0.2, -0.13], [0, -0.17, -0.2]], 0.017);
  context.beam(aluminum, [0, -0.17, -0.19], [0, -0.17, -0.22], 0.045);
}

export function buildHollowWashbasin(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number): void {
  const { oak, aluminum, dark, white, porcelain } = context.palette;
  context.box(oak, 0, 0.2, -0.025, width, 0.035, 0.44);
  context.box(oak, 0, 0.45, -0.235, width, 0.5, 0.025);
  for (const side of [-1, 1]) context.box(oak, side * (width / 2 - 0.012), 0.45, -0.025, 0.025, 0.5, 0.44);
  context.box(materials.timber, 0, 0.39, 0.21, width - 0.015, 0.35, 0.025);
  context.box(aluminum, 0, 0.51, 0.235, width * 0.45, 0.012, 0.025);
  context.box(dark, 0, 0.575, 0.209, width - 0.015, 0.012, 0.016);
  ellipseBowl(context.at({ x: 0, y: 0.625, z: 0.035 }), width + 0.025, 0.46, 0.2, porcelain);
  buildPopUpDrain(context.at({ x: 0, y: 0.666, z: 0.035 }), 0.018);
  buildMixerTap(context.at({ x: 0, y: 0.8, z: -0.18 }), 0.18, 0.16);
  buildBottleTrap(context.at({ x: 0, y: 0.64, z: 0.035 }));
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width * 0.35, 0.66, -0.2, 0.045, 0.09, 0.1);
    context.box(white, side * width * 0.3, 0.715, -0.18, 0.08, 0.025, 0.1);
  }
  context.disc(white, width * 0.34, 0.85, -0.12, 0.028, 0.08);
  context.box(aluminum, width * 0.34, 0.905, -0.12, 0.015, 0.035, 0.015);
  context.box(aluminum, width * 0.34, 0.922, -0.105, 0.015, 0.012, 0.045);
}

export function buildHollowKitchenSink(context: ArchitectureContext, width: number, depth: number): void {
  const { aluminum, dark } = context.palette;
  ellipseBowl(context.at({ x: 0, y: -0.16, z: 0 }), width, depth, 0.17, aluminum);
  buildPopUpDrain(context.at({ x: 0, y: -0.12, z: 0 }), 0.026);
  buildMixerTap(context.at({ x: 0, y: 0.015, z: -depth / 2 + 0.025 }), 0.24, depth * 0.45);
  const overflow = context.at({ x: 0, y: -0.035, z: -depth * 0.42 });
  overflow.box(dark, 0, 0, 0, 0.035, 0.012, 0.006);
  for (const x of [-0.055, 0.055]) {
    context.beam(aluminum, [x, 0.018, -depth * 0.27], [x, 0.018, depth * 0.27], 0.003);
  }
}

export function buildKitchenTapOperation(context: ArchitectureContext, width: number, depth: number): Animation {
  const { water, dark, aluminum, green } = context.palette;
  const spoutY = 0.206;
  const spoutZ = -depth / 2 + 0.025 + depth * 0.45;
  const basinBottom = -0.118;
  context.box(dark, 0, 0.095, -depth / 2 + 0.05, 0.026, 0.018, 0.008);
  const indicator = context.moving("Domestic tap sensor indicator", [0, 0.095, -depth / 2 + 0.055], moving => {
    moving.box(green, 0, 0, 0, 0.01, 0.004, 0.003);
  });
  const stream: THREE.Group[] = [];
  const segments = 8;
  for (let index = 0; index < segments; index++) {
    stream.push(context.moving("Domestic tap falling water column", [0, 0, spoutZ], moving => {
      moving.disc(water, 0, 0, 0, 1, 1);
    }));
  }
  const splash: THREE.Group[] = [];
  for (let index = 0; index < 6; index++) {
    splash.push(context.moving("Domestic basin impact splash", [0, basinBottom, spoutZ], moving => {
      moving.oval(water, 0, 0, 0, 0.002, 0.004, 0.002);
    }));
  }
  const puddle = context.moving("Domestic basin draining surface", [0, basinBottom, 0], moving => {
    moving.disc(water, 0, 0, 0, 1, 0.003);
  });
  const aerator = context.geometry(new THREE.TorusGeometry(0.014, 0.002, 4, 14));
  aerator.rotateX(Math.PI / 2);
  context.part(aluminum, aerator, [0, spoutY + 0.002, spoutZ]);
  const sensor = context.doorSensor([0, 0, 0.68], Math.min(0.6, width), 0.4);
  let previous = -1;
  let opening = 0;
  let volume = 0;
  let waterHeight = 0;
  const gravity = 9.80665;
  const drainArea = Math.PI * 0.007 * 0.007;
  const flowAtFullOpening = 0.000075;
  return seconds => {
    if (previous < 0 || seconds < previous) previous = seconds;
    const dt = Math.min(0.08, Math.max(0, seconds - previous));
    previous = seconds;
    const requested = sensor(seconds) > 0.65 ? 1 : 0;
    opening += THREE.MathUtils.clamp(requested - opening, -dt * 2, dt * 3);
    const flow = flowAtFullOpening * opening;
    const drainage = 0.62 * drainArea * Math.sqrt(2 * gravity * Math.max(0, waterHeight));
    volume = THREE.MathUtils.clamp(volume + (flow - drainage) * dt, 0, 0.0015);
    const basinArea = width * depth * 0.35;
    waterHeight = volume / Math.max(0.01, basinArea);
    const impactY = basinBottom + waterHeight;
    const fall = Math.max(0.005, spoutY - impactY);
    const initialSpeed = 0.45;
    const flightTime = (-initialSpeed + Math.sqrt(initialSpeed * initialSpeed + 2 * gravity * fall)) / gravity;
    for (let index = 0; index < stream.length; index++) {
      const firstTime = flightTime * index / segments;
      const secondTime = flightTime * (index + 1) / segments;
      const y0 = spoutY - initialSpeed * firstTime - gravity * firstTime * firstTime * 0.5;
      const y1 = spoutY - initialSpeed * secondTime - gravity * secondTime * secondTime * 0.5;
      const speed = initialSpeed + gravity * (firstTime + secondTime) * 0.5;
      const radius = Math.sqrt(Math.max(0.0000001, flow) / (Math.PI * Math.max(0.1, speed)));
      context.world([0, (y0 + y1) / 2, spoutZ], stream[index].position);
      stream[index].scale.set(radius, Math.max(0.001, y0 - y1), radius);
      stream[index].visible = opening > 0.02;
    }
    for (let index = 0; index < splash.length; index++) {
      const drop = splash[index];
      const age = THREE.MathUtils.euclideanModulo(seconds + index * 0.026, 0.16);
      const angle = index * Math.PI * 2 / splash.length + Math.sin(seconds * 0.23) * 0.2;
      const horizontal = age * 0.22;
      const y = impactY + age * 0.64 - gravity * age * age * 0.5;
      context.world([Math.cos(angle) * horizontal, Math.max(impactY, y), spoutZ + Math.sin(angle) * horizontal], drop.position);
      drop.visible = opening > 0.1 && y > impactY;
    }
    context.world([0, impactY + 0.001, 0], puddle.position);
    const spread = THREE.MathUtils.clamp(Math.sqrt(volume / 0.0006), 0.08, 1);
    puddle.scale.set(width * 0.26 * spread, 1, depth * 0.26 * spread);
    puddle.visible = volume > 0.000002;
    indicator.visible = opening > 0.01;
  };
}

function bathShell(context: ArchitectureContext, width: number, length: number): void {
  const segments = 40;
  const levels = 16;
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const ring = (index: number): { halfWidth: number; halfLength: number; y: number } => {
    if (index <= 5) {
      const t = index / 5;
      return { halfWidth: width * (0.38 + t * 0.12), halfLength: length * (0.43 + t * 0.07), y: 0.06 + t * 0.51 };
    }
    if (index <= 7) {
      const t = (index - 5) / 2;
      return { halfWidth: width * 0.5 - t * 0.055, halfLength: length * 0.5 - t * 0.055, y: 0.57 + Math.sin(t * Math.PI) * 0.008 };
    }
    const t = (index - 7) / (levels - 7);
    return { halfWidth: (width * 0.5 - 0.055) * (1 - t * 0.38), halfLength: (length * 0.5 - 0.055) * (1 - t * 0.17), y: 0.57 - (1 - Math.cos(t * Math.PI / 2)) * 0.43 };
  };
  for (let level = 0; level <= levels; level++) {
    const shape = ring(level);
    for (let segment = 0; segment <= segments; segment++) {
      const angle = segment / segments * Math.PI * 2;
      const sx = Math.sin(angle);
      const sz = Math.cos(angle);
      const x = Math.sign(sx) * Math.pow(Math.abs(sx), 0.62) * shape.halfWidth;
      const z = Math.sign(sz) * Math.pow(Math.abs(sz), 0.62) * shape.halfLength;
      positions.push(x, shape.y, z);
      uv.push(segment / segments, level / levels);
      if (level < levels && segment < segments) {
        const base = level * (segments + 1) + segment;
        indices.push(base, base + 1, base + segments + 1, base + 1, base + segments + 2, base + segments + 1);
      }
    }
  }
  const center = positions.length / 3;
  positions.push(0, 0.14, 0);
  uv.push(0.5, 1);
  const last = levels * (segments + 1);
  for (let segment = 0; segment < segments; segment++) indices.push(center, last + segment, last + segment + 1);
  const geometry = context.geometry(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  context.part(context.palette.porcelain, geometry, [0, 0, 0]);
}

export function buildHollowBath(context: ArchitectureContext, width: number, length: number): void {
  bathShell(context, width, length);
  const { aluminum, rubber, porcelain } = context.palette;
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      context.box(rubber, side * width * 0.26, 0.035, end * length * 0.31, 0.09, 0.07, 0.1);
    }
  }
  buildPopUpDrain(context.at({ x: 0, y: 0.148, z: -length * 0.28 }), 0.026);
  const overflow = context.at({ x: 0, y: 0.46, z: -length * 0.465 });
  overflow.box(aluminum, 0, 0, 0, 0.06, 0.025, 0.008);
  overflow.box(context.palette.dark, 0, -0.008, 0.006, 0.042, 0.006, 0.004);
  buildMixerTap(context.at({ x: width * 0.4, y: 0.57, z: -length * 0.32, yaw: -Math.PI / 2 }), 0.16, width * 0.28);
  const trayZ = length * 0.2;
  for (const x of [-width * 0.35, 0, width * 0.35]) context.box(context.palette.oak, x, 0.6, trayZ, width * 0.27, 0.025, 0.21);
  for (const z of [trayZ - 0.075, trayZ + 0.075]) context.box(context.palette.oak, 0, 0.577, z, width - 0.02, 0.02, 0.025);
  context.disc(porcelain, -width * 0.2, 0.64, trayZ, 0.035, 0.06);
  context.box(context.palette.fabric, width * 0.15, 0.632, trayZ, 0.18, 0.035, 0.16);
}

function buildShowerTray(context: ArchitectureContext, width: number, depth: number): void {
  const { porcelain, aluminum, dark } = context.palette;
  context.box(porcelain, 0, 0.025, 0, width, 0.05, depth);
  const drainZ = -depth * 0.35;
  for (const side of [-1, 1]) {
    context.box(porcelain, side * (width / 2 - 0.015), 0.05, 0, 0.03, 0.055, depth);
    context.box(porcelain, 0, 0.05, side * (depth / 2 - 0.015), width, 0.055, 0.03);
  }
  context.panel(porcelain, [[-width / 2 + 0.03, 0.047, depth / 2 - 0.03], [width / 2 - 0.03, 0.047, depth / 2 - 0.03], [width / 2 - 0.03, 0.035, drainZ], [-width / 2 + 0.03, 0.035, drainZ]]);
  context.box(dark, 0, 0.037, drainZ, width * 0.58, 0.008, 0.055);
  const slots = Math.max(10, Math.floor(width / 0.05));
  for (let slot = 0; slot < slots; slot++) context.box(aluminum, -width * 0.28 + (slot + 0.5) * width * 0.56 / slots, 0.043, drainZ, 0.012, 0.009, 0.045);
}

function buildShowerMixer(context: ArchitectureContext, depth: number): void {
  const { aluminum, dark, white } = context.palette;
  const rear = -depth / 2 + 0.035;
  context.beam(aluminum, [-0.12, 1.03, rear + 0.045], [0.12, 1.03, rear + 0.045], 0.021);
  for (const x of [-0.09, 0.09]) context.beam(aluminum, [x, 1.03, rear], [x, 1.03, rear + 0.05], 0.03);
  context.box(dark, 0.1, 1.049, rear + 0.045, 0.012, 0.007, 0.035);
  context.tube(aluminum, [[0, 1.03, rear + 0.035], [0, 1.98, rear + 0.035], [0, 2.1, rear + 0.15], [0, 2.1, rear + 0.36]], 0.012);
  context.disc(aluminum, 0, 2.075, rear + 0.36, 0.11, 0.016);
  context.disc(white, 0, 2.064, rear + 0.36, 0.1, 0.009);
  for (let ring = 1; ring <= 3; ring++) {
    for (let jet = 0; jet < ring * 6; jet++) {
      const angle = jet * Math.PI * 2 / (ring * 6);
      context.disc(dark, Math.cos(angle) * ring * 0.026, 2.057, rear + 0.36 + Math.sin(angle) * ring * 0.026, 0.0025, 0.003);
    }
  }
  context.tube(aluminum, [[0.09, 1.02, rear + 0.045], [0.14, 0.56, rear + 0.12], [0.23, 0.62, rear + 0.11], [0.2, 1.43, rear + 0.055]], 0.006);
  context.beam(aluminum, [0.2, 1.42, rear + 0.06], [0.2, 1.57, rear + 0.14], 0.018);
}

export function buildDetailedShower(context: ArchitectureContext, width: number, depth: number): Animation {
  buildShowerTray(context, width, depth);
  buildShowerMixer(context, depth);
  const { glass, aluminum, rubber } = context.palette;
  context.box(glass, -width / 2 + 0.01, 1.07, 0, 0.018, 1.95, depth - 0.04);
  context.box(glass, -width * 0.27, 1.07, depth / 2, width * 0.47, 1.95, 0.018);
  context.box(aluminum, -width / 2, 1.07, -depth / 2 + 0.02, 0.04, 2.03, 0.04);
  context.box(aluminum, 0, 2.07, depth / 2, width + 0.04, 0.035, 0.045);
  context.box(aluminum, 0, 0.07, depth / 2, width, 0.025, 0.055);
  const door = context.moving("Shower sliding glass leaf", [width * 0.24, 0.09, depth / 2 + 0.027], moving => {
    moving.box(glass, 0, 0.98, 0, width * 0.51, 1.95, 0.018);
    moving.box(rubber, width * 0.25, 0.98, 0, 0.012, 1.95, 0.025);
    moving.box(aluminum, width * 0.12, 1.02, 0.025, 0.015, 0.22, 0.025);
    for (const x of [-width * 0.15, width * 0.15]) {
      moving.oval(aluminum, x, 1.96, 0, 0.023, 0.023, 0.025);
      moving.oval(rubber, x, 1.96, 0.018, 0.016, 0.016, 0.012);
    }
  });
  const origin = door.position.clone();
  const left = new THREE.Vector3(-Math.cos(context.local.yaw ?? 0), 0, Math.sin(context.local.yaw ?? 0));
  const sensor = context.doorSensor([width * 0.2, 0, depth / 2 + 0.45], 0.6, 3);
  return seconds => {
    const opening = sensor(seconds);
    door.position.copy(origin).addScaledVector(left, width * 0.47 * opening);
  };
}
