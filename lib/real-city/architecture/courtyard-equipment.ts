import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDigitalNumber, buildNeedleMeter } from "./display-instruments";
import { buildCentrifugalPump, buildGateValve } from "./mechanical-components";

export function buildPoolCover(context: ArchitectureContext, width: number, depth: number): Animation {
  const { white, aluminum, steel } = context.palette;
  const rollerRadius = 0.12;
  const slatDepth = 0.12;
  const count = Math.max(4, Math.ceil((depth - 0.16) / slatDepth));
  const spacing = (depth - 0.16) / count;
  const travelLength = depth - 0.16;
  const slats: THREE.Group[] = [];
  for (let slat = 0; slat < count; slat++) {
    slats.push(context.moving("Automatic pool cover slat", [0, 0.065, -depth / 2 + 0.08 + slat * spacing], moving => {
      moving.box(white, 0, 0, 0, width - 0.16, 0.025, spacing - 0.006);
      moving.box(aluminum, 0, -0.006, -spacing * 0.4, width - 0.19, 0.012, 0.012);
    }));
  }
  const origin = context.world([0, 0.065, -depth / 2 + 0.08]);
  const forward = new THREE.Vector3(Math.sin(context.local.yaw ?? 0), 0, Math.cos(context.local.yaw ?? 0));
  for (const side of [-1, 1]) {
    context.box(steel, side * (width / 2 + 0.08), 0.11, -depth / 2 - 0.12, 0.1, 0.22, 0.35);
    context.beam(aluminum, [side * (width / 2 + 0.08), 0.18, -depth / 2 - 0.1], [side * (width / 2 + 0.08), 0.18, -depth / 2 - 0.1 + 0.01], 0.055);
  }
  context.beam(aluminum, [-width / 2 - 0.1, 0.18, -depth / 2 - 0.1], [width / 2 + 0.1, 0.18, -depth / 2 - 0.1], rollerRadius);
  let deployed = 0;
  let last = 0;
  return (seconds, night, season) => {
    const delta = Math.max(0, Math.min(0.15, seconds - last));
    last = seconds;
    const target = season === "winter" ? 1 : night ? 0.92 : 0;
    deployed += Math.sign(target - deployed) * Math.min(Math.abs(target - deployed), delta * 0.025);
    const unrolledLength = deployed * travelLength;
    slats.forEach((slat, index) => {
      const distance = unrolledLength - index * spacing;
      slat.position.copy(origin);
      if (distance >= 0) {
        slat.position.addScaledVector(forward, distance);
        slat.rotation.x = 0;
      } else {
        const wound = -distance;
        const turns = wound / (Math.PI * 2 * rollerRadius);
        const radius = rollerRadius + Math.floor(turns) * 0.025;
        const angle = wound / radius;
        slat.position.addScaledVector(forward, -0.2 + Math.cos(angle) * radius);
        slat.position.y += 0.12 + Math.sin(angle) * radius;
        slat.rotation.x = -angle;
      }
    });
  };
}

export function buildPoolFilter(context: ArchitectureContext, phase: number): Animation[] {
  const { white, steel, aluminum, dark, green } = context.palette;
  let flow = 0.6;
  const animations: Animation[] = [(seconds, night, season) => { flow = season === "winter" ? 0 : night ? 0.3 : 0.65 + Math.sin(seconds * 0.015 + phase) * 0.15; }];
  context.disc(white, 0, 0.36, 0, 0.24, 0.48);
  context.oval(white, 0, 0.6, 0, 0.24, 0.12, 0.24);
  context.oval(white, 0, 0.12, 0, 0.24, 0.08, 0.24);
  for (let leg = 0; leg < 3; leg++) {
    const angle = leg * Math.PI * 2 / 3;
    context.box(steel, Math.cos(angle) * 0.16, 0.055, Math.sin(angle) * 0.16, 0.04, 0.11, 0.04);
  }
  context.disc(dark, 0, 0.77, 0, 0.09, 0.13);
  context.box(aluminum, 0, 0.86, 0, 0.24, 0.025, 0.025, 0.35);
  context.tube(white, [[0.08, 0.77, 0], [0.35, 0.77, 0], [0.35, 0.22, 0], [0.52, 0.22, 0]], 0.025);
  context.tube(white, [[-0.08, 0.77, 0], [-0.33, 0.77, 0], [-0.33, 0.12, -0.24]], 0.025);
  buildGateValve(context.at({ x: -0.33, y: 0.4, z: -0.02 }), 0.025);
  animations.push(buildCentrifugalPump(context.at({ x: 0.65, y: 0, z: 0, yaw: -Math.PI / 2 }), () => flow));
  animations.push(buildNeedleMeter(context.at({ x: 0, y: 0.63, z: 0.25 }), 0.12, 0.08, () => flow * 0.8));
  context.box(green, 0.52, 0.56, -0.2, 0.2, 0.24, 0.1);
  const display = buildDigitalNumber(context.at({ x: 0.52, y: 0.58, z: -0.14 }), 2, 0.024);
  animations.push(() => display.set(Math.round(flow * 30)));
  return animations;
}

export function buildOutdoorShower(context: ArchitectureContext): void {
  const { steel, aluminum, oak, dark } = context.palette;
  context.box(oak, 0, 0.03, 0, 0.8, 0.06, 0.8);
  for (let groove = 0; groove < 8; groove++) context.box(dark, -0.35 + groove * 0.1, 0.062, 0, 0.008, 0.004, 0.77);
  context.disc(steel, 0, 1.08, -0.26, 0.035, 2.1);
  context.tube(aluminum, [[0, 2.1, -0.26], [0, 2.2, -0.26], [0, 2.25, -0.08], [0, 2.15, 0.12]], 0.022);
  context.disc(aluminum, 0, 2.13, 0.12, 0.095, 0.018);
  for (let ring = 0; ring < 3; ring++) {
    for (let hole = 0; hole < 8; hole++) {
      const angle = hole * Math.PI / 4;
      context.disc(dark, Math.cos(angle) * (0.025 + ring * 0.023), 2.118, 0.12 + Math.sin(angle) * (0.025 + ring * 0.023), 0.002, 0.002);
    }
  }
  context.beam(aluminum, [0, 1.05, -0.25], [0, 1.05, -0.16], 0.022);
  context.box(aluminum, 0, 1.1, -0.15, 0.012, 0.1, 0.018);
  context.box(aluminum, 0.16, 0.9, -0.26, 0.25, 0.018, 0.15);
}

export function buildGardenHose(context: ArchitectureContext): void {
  const { steel, green, aluminum } = context.palette;
  context.box(steel, 0, 0.24, -0.08, 0.08, 0.48, 0.08);
  for (const side of [-1, 1]) context.box(steel, side * 0.16, 0.025, 0, 0.035, 0.05, 0.36);
  for (let turn = 0; turn < 7; turn++) {
    const geometry = context.geometry(new THREE.TorusGeometry(0.13 + turn * 0.003, 0.008, 5, 20));
    geometry.rotateY(Math.PI / 2);
    context.part(green, geometry, [-0.048 + turn * 0.016, 0.32, 0]);
  }
  context.beam(aluminum, [-0.14, 0.32, 0], [0.14, 0.32, 0], 0.012);
  context.tube(green, [[0.05, 0.2, 0], [0.09, 0.05, 0.12], [0.35, 0.025, 0.18], [0.45, 0.025, 0.02], [0.32, 0.025, -0.08]], 0.008);
  context.box(aluminum, 0.3, 0.03, -0.08, 0.08, 0.025, 0.035);
  context.box(steel, 0.27, 0.06, -0.08, 0.025, 0.07, 0.025);
}

export function buildRaisedHerbBed(context: ArchitectureContext, width: number, depth: number, variety: number): void {
  const { oak, dark, green, clay } = context.palette;
  const height = 0.45;
  context.box(dark, 0, height - 0.06, 0, width - 0.06, 0.08, depth - 0.06);
  for (const side of [-1, 1]) {
    for (let plank = 0; plank < 3; plank++) {
      const y = 0.08 + plank * 0.15;
      context.box(oak, 0, y, side * depth / 2, width + 0.05, 0.13, 0.035);
      context.box(oak, side * width / 2, y, 0, 0.035, 0.13, depth);
    }
  }
  const plants = Math.max(3, Math.floor(width / 0.23));
  for (let plant = 0; plant < plants; plant++) {
    const x = -width * 0.42 + (plant + 0.5) * width * 0.84 / plants;
    const z = ((plant + variety) % 2 - 0.5) * depth * 0.35;
    const stemHeight = 0.14 + (plant % 3) * 0.035;
    context.beam(green, [x, height - 0.02, z], [x, height + stemHeight, z], 0.005);
    for (let leaf = 0; leaf < 6; leaf++) {
      const angle = leaf * Math.PI * 2 / 6 + variety;
      context.oval(green, x + Math.cos(angle) * 0.055, height + stemHeight * (0.35 + leaf % 3 * 0.2), z + Math.sin(angle) * 0.055, 0.035, 0.012, 0.022);
    }
    if (variety % 3 === 1) context.oval(clay, x, height + stemHeight + 0.015, z, 0.018, 0.02, 0.018);
  }
  context.beam(context.palette.dark, [-width * 0.42, height - 0.01, 0], [width * 0.42, height - 0.01, 0], 0.008);
  for (let emitter = 0; emitter < plants; emitter++) {
    const x = -width * 0.42 + (emitter + 0.5) * width * 0.84 / plants;
    context.disc(context.palette.aluminum, x, height, 0, 0.01, 0.016);
  }
}

export function buildCompostBin(context: ArchitectureContext): void {
  const { green, dark, oak } = context.palette;
  context.box(green, 0, 0.4, 0, 0.55, 0.8, 0.55);
  context.box(dark, 0, 0.81, 0, 0.58, 0.04, 0.58);
  context.box(oak, 0, 0.85, 0, 0.2, 0.035, 0.06);
  context.box(dark, 0, 0.13, 0.284, 0.37, 0.22, 0.015);
  context.box(green, 0, 0.16, 0.3, 0.33, 0.17, 0.018);
  for (let vent = 0; vent < 7; vent++) context.box(dark, 0, 0.35 + vent * 0.055, 0.282, 0.42, 0.012, 0.006);
}

export function buildGasGrill(context: ArchitectureContext, phase: number): Animation {
  const { aluminum, steel, dark, rubber, red } = context.palette;
  context.box(steel, 0, 0.41, 0, 0.75, 0.62, 0.48);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * 0.19, 0.43, 0.25, 0.35, 0.58, 0.025);
    context.box(steel, side * 0.035, 0.48, 0.28, 0.015, 0.18, 0.025);
    context.box(aluminum, side * 0.54, 0.84, 0, 0.32, 0.035, 0.47);
    for (const z of [-0.19, 0.19]) context.beam(rubber, [side * 0.3 - 0.02, 0.055, z], [side * 0.3 + 0.02, 0.055, z], 0.05);
  }
  context.box(dark, 0, 0.79, 0, 0.72, 0.13, 0.5);
  for (let rod = 0; rod < 15; rod++) context.beam(aluminum, [-0.32 + rod * 0.046, 0.865, -0.2], [-0.32 + rod * 0.046, 0.865, 0.2], 0.004);
  const lid = context.moving("Garden grill hood", [0, 0.85, -0.25], moving => {
    moving.box(aluminum, 0, 0.16, 0.25, 0.75, 0.32, 0.5);
    moving.box(dark, 0, 0.05, 0.505, 0.65, 0.07, 0.015);
    moving.beam(steel, [-0.25, 0.15, 0.58], [0.25, 0.15, 0.58], 0.015);
    for (const side of [-1, 1]) moving.beam(steel, [side * 0.22, 0.15, 0.5], [side * 0.22, 0.15, 0.58], 0.01);
  });
  for (const x of [-0.22, 0, 0.22]) {
    context.beam(aluminum, [x, 0.76, 0.26], [x, 0.76, 0.285], 0.026);
    context.box(red, x, 0.78, 0.29, 0.005, 0.014, 0.004);
  }
  return (seconds, night, season) => { lid.rotation.x = season === "winter" ? 0 : -openingPulse(seconds, 90, phase, 18, 2.5) * 1.15 * (night ? 0.2 : 1); };
}

export function buildOutdoorKitchen(context: ArchitectureContext, materials: ArchitecturalMaterials, length: number, phase: number): Animation[] {
  const { oak, aluminum, dark, white } = context.palette;
  context.box(oak, 0, 0.45, 0, length, 0.9, 0.58);
  context.box(materials.terrazzo, 0, 0.93, 0, length + 0.04, 0.06, 0.64);
  const doors = Math.max(2, Math.floor(length / 0.45));
  for (let door = 0; door < doors; door++) {
    const x = -length / 2 + (door + 0.5) * length / doors;
    context.box(oak, x, 0.48, 0.302, length / doors - 0.018, 0.78, 0.024);
    context.box(aluminum, x + length / doors * 0.33, 0.72, 0.326, 0.012, 0.13, 0.025);
  }
  context.box(dark, length * 0.22, 0.967, 0, length * 0.28, 0.012, 0.38);
  context.box(aluminum, length * 0.22, 0.88, 0, length * 0.26, 0.17, 0.36);
  context.tube(aluminum, [[length * 0.22, 0.97, -0.2], [length * 0.22, 1.2, -0.2], [length * 0.22, 1.23, -0.05], [length * 0.22, 1.15, 0]], 0.012);
  context.box(white, -length * 0.22, 0.972, 0.05, length * 0.25, 0.014, 0.34);
  const animations: Animation[] = [];
  animations.push(buildGasGrill(context.at({ x: -length / 2 - 0.62, y: 0, z: 0 }), phase));
  return animations;
}

export function buildLouveredPergola(context: ArchitectureContext, width: number, depth: number, height: number): Animation {
  const { aluminum, steel, white } = context.palette;
  for (const x of [-width / 2, width / 2]) {
    for (const z of [-depth / 2, depth / 2]) {
      context.box(steel, x, height / 2, z, 0.12, height, 0.12);
      context.box(aluminum, x, 0.025, z, 0.2, 0.05, 0.2);
    }
  }
  for (const side of [-1, 1]) {
    context.box(steel, side * width / 2, height, 0, 0.14, 0.2, depth + 0.14);
    context.box(steel, 0, height, side * depth / 2, width, 0.2, 0.14);
  }
  const bladeCount = Math.max(5, Math.round(depth / 0.18));
  const blades: THREE.Group[] = [];
  for (let blade = 0; blade < bladeCount; blade++) {
    const z = -depth / 2 + (blade + 0.5) * depth / bladeCount;
    blades.push(context.moving("Bioclimatic pergola louver", [0, height + 0.02, z], moving => {
      moving.box(white, 0, 0, 0, width - 0.13, 0.025, depth / bladeCount - 0.008);
      moving.box(aluminum, 0, -0.018, 0, width - 0.18, 0.025, 0.025);
    }));
  }
  for (const side of [-1, 1]) context.box(context.palette.warmLight, side * (width / 2 - 0.1), height - 0.09, 0, 0.025, 0.012, depth - 0.3);
  let angle = 0.5;
  let last = 0;
  return (seconds, night, season) => {
    const delta = Math.max(0, Math.min(0.15, seconds - last));
    last = seconds;
    const target = night || season === "winter" ? 0.08 : season === "summer" ? 0.45 : 1.15;
    angle += (target - angle) * (1 - Math.exp(-delta * 0.2));
    blades.forEach(blade => { blade.rotation.x = angle; });
  };
}

export function buildCourtyardEquipment(context: ArchitectureContext, materials: ArchitecturalMaterials, poolWidth: number, poolDepth: number, phase: number): Animation[] {
  const animations: Animation[] = [buildPoolCover(context, poolWidth, poolDepth)];
  animations.push(...buildPoolFilter(context.at({ x: 0, y: 0, z: -poolDepth / 2 - 0.8 }), phase));
  buildOutdoorShower(context.at({ x: poolWidth / 2 + 0.65, y: 0, z: -poolDepth * 0.22 }));
  buildGardenHose(context.at({ x: poolWidth / 2 + 0.5, y: 0, z: -poolDepth / 2 - 0.35 }));
  buildRaisedHerbBed(context.at({ x: -poolWidth / 2 - 0.65, y: 0, z: -poolDepth / 2 - 0.55 }), 1.1, 0.5, phase);
  buildCompostBin(context.at({ x: -poolWidth / 2 - 0.7, y: 0, z: -poolDepth / 2 - 1.2 }));
  context.box(materials.boardConcrete, 0.1, -0.015, -poolDepth / 2 - 0.8, 1.6, 0.03, 1.1);
  return animations;
}
