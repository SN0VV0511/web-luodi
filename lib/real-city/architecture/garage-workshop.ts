import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDigitalNumber, buildNeedleMeter } from "./display-instruments";

export function buildCombinationWrench(context: ArchitectureContext, length: number, size: number, yaw = 0): void {
  const { aluminum } = context.palette;
  const local = context.at({ x: 0, y: 0, z: 0, yaw });
  local.box(aluminum, 0, 0, 0, size * 0.55, size * 0.2, length * 0.65);
  const ring = local.geometry(new THREE.TorusGeometry(size * 0.55, size * 0.16, 6, 12));
  ring.rotateX(Math.PI / 2);
  local.part(aluminum, ring, [0, 0, -length * 0.4]);
  local.box(aluminum, -size * 0.45, 0, length * 0.39, size * 0.25, size * 0.22, size, -0.2);
  local.box(aluminum, size * 0.45, 0, length * 0.39, size * 0.25, size * 0.22, size, 0.2);
  local.box(aluminum, 0, 0, length * 0.29, size, size * 0.22, size * 0.25);
}

export function buildScrewdriver(context: ArchitectureContext, length: number, insulated: boolean): void {
  const { aluminum, red, dark, yellow } = context.palette;
  context.beam(insulated ? yellow : aluminum, [0, 0, -length * 0.45], [0, 0, length * 0.1], length * 0.02);
  context.beam(insulated ? red : dark, [0, 0, length * 0.1], [0, 0, length * 0.48], length * 0.065);
  context.box(aluminum, 0, 0, -length * 0.48, length * 0.08, length * 0.013, length * 0.06);
  for (let groove = 0; groove < 4; groove++) context.box(dark, 0, length * 0.062, length * (0.15 + groove * 0.08), length * 0.06, length * 0.01, length * 0.02);
}

export function buildPliers(context: ArchitectureContext, length: number): void {
  const { steel, red, aluminum } = context.palette;
  for (const side of [-1, 1]) {
    context.box(red, side * length * 0.12, 0, length * 0.2, length * 0.08, length * 0.07, length * 0.55, side * 0.18);
    context.box(steel, side * length * 0.05, 0, -length * 0.2, length * 0.09, length * 0.065, length * 0.32, -side * 0.15);
    context.box(steel, side * length * 0.07, 0, -length * 0.02, length * 0.1, length * 0.075, length * 0.24, side * 0.35);
  }
  context.disc(aluminum, 0, 0.01, -length * 0.05, length * 0.06, length * 0.06);
}

export function buildClawHammer(context: ArchitectureContext, length: number): void {
  const { oak, steel, aluminum, rubber } = context.palette;
  context.box(oak, 0, 0, length * 0.05, length * 0.08, length * 0.07, length * 0.8);
  context.box(rubber, 0, 0, length * 0.3, length * 0.1, length * 0.09, length * 0.35);
  context.beam(steel, [-length * 0.22, 0, -length * 0.35], [length * 0.12, 0, -length * 0.35], length * 0.07);
  context.beam(aluminum, [length * 0.12, 0, -length * 0.35], [length * 0.19, 0, -length * 0.35], length * 0.09);
  for (const side of [-1, 1]) context.tube(steel, [[-length * 0.12, 0, -length * 0.35 + side * length * 0.035], [-length * 0.22, 0, -length * 0.4 + side * length * 0.035], [-length * 0.25, 0, -length * 0.49 + side * length * 0.035]], length * 0.025);
}

export function buildCordlessDrill(context: ArchitectureContext): void {
  const { green, dark, aluminum, yellow } = context.palette;
  context.roundedBox(green, 0, 0.19, 0, 0.08, 0.11, 0.18, 0.02);
  context.beam(dark, [0, 0.19, 0.09], [0, 0.19, 0.14], 0.037);
  context.beam(aluminum, [0, 0.19, 0.14], [0, 0.19, 0.19], 0.008);
  context.box(dark, 0, 0.09, -0.025, 0.055, 0.14, 0.065);
  context.box(green, 0, 0.02, -0.025, 0.09, 0.04, 0.12);
  context.box(yellow, 0, 0.115, 0.015, 0.035, 0.03, 0.022);
  for (let vent = 0; vent < 4; vent++) context.box(dark, 0.043, 0.18, -0.06 + vent * 0.025, 0.003, 0.04, 0.008);
}

export function buildSocketSet(context: ArchitectureContext): void {
  const { dark, aluminum, steel } = context.palette;
  context.box(dark, 0, 0.025, 0, 0.35, 0.05, 0.23);
  context.box(steel, 0, 0.052, 0, 0.32, 0.004, 0.2);
  for (let socket = 0; socket < 9; socket++) {
    const x = -0.135 + socket * 0.034;
    const radius = 0.009 + socket * 0.0007;
    context.disc(aluminum, x, 0.075, -0.04, radius, 0.045);
    context.disc(dark, x, 0.098, -0.04, radius * 0.6, 0.002);
  }
  context.beam(aluminum, [-0.13, 0.065, 0.06], [0.1, 0.065, 0.06], 0.008);
  context.disc(aluminum, 0.11, 0.066, 0.06, 0.022, 0.018);
  context.disc(dark, 0.11, 0.078, 0.06, 0.008, 0.006);
}

export function buildPegboard(context: ArchitectureContext, width: number, height: number): void {
  const { steel, aluminum, dark } = context.palette;
  context.box(steel, 0, height / 2, 0, width, height, 0.025);
  const columns = Math.max(8, Math.round(width / 0.08));
  const rows = Math.max(5, Math.round(height / 0.08));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = -width / 2 + (column + 0.5) * width / columns;
      const y = (row + 0.5) * height / rows;
      context.box(dark, x, y, 0.014, 0.009, 0.009, 0.002);
    }
  }
  for (let tool = 0; tool < 6; tool++) {
    const x = -width * 0.4 + tool * width * 0.16;
    context.tube(aluminum, [[x, height * 0.75, 0.01], [x, height * 0.75, 0.06], [x, height * 0.78, 0.06]], 0.004);
    const toolContext = context.at({ x, y: height * 0.53, z: 0.05 });
    if (tool % 3 === 0) {
      toolContext.box(context.palette.red, 0, 0.02, 0, 0.03, 0.19, 0.025);
      toolContext.box(aluminum, 0, 0.16, 0, 0.009, 0.12, 0.009);
    } else if (tool % 3 === 1) {
      toolContext.box(aluminum, 0, 0.08, 0, 0.02, 0.25, 0.01);
      toolContext.beam(aluminum, [0, 0.22, -0.006], [0, 0.22, 0.006], 0.028);
      toolContext.beam(dark, [0, 0.22, 0.007], [0, 0.22, 0.009], 0.017);
    } else {
      toolContext.box(context.palette.oak, 0, 0.02, 0, 0.025, 0.24, 0.025);
      toolContext.box(steel, 0, 0.16, 0, 0.12, 0.05, 0.04);
    }
  }
  context.box(aluminum, 0, height * 0.17, 0.08, width * 0.85, 0.025, 0.14);
  for (let container = 0; container < 4; container++) context.box(context.palette.green, -width * 0.3 + container * width * 0.2, height * 0.22, 0.09, width * 0.15, height * 0.1, 0.12);
}

export function buildToolChest(context: ArchitectureContext, width: number, phase: number): Animation {
  const { red, aluminum, dark, rubber, steel } = context.palette;
  context.box(red, 0, 0.48, 0, width, 0.75, 0.48);
  context.box(dark, 0, 0.87, 0, width + 0.025, 0.03, 0.5);
  const drawers: THREE.Group[] = [];
  for (let drawer = 0; drawer < 5; drawer++) {
    const height = drawer < 3 ? 0.1 : 0.16;
    const y = drawer < 3 ? 0.76 - drawer * 0.115 : 0.36 - (drawer - 3) * 0.175;
    drawers.push(context.moving("Workshop tool chest drawer", [0, y, 0.25], moving => {
      moving.box(red, 0, 0, 0, width - 0.035, height, 0.025);
      moving.box(dark, 0, -height / 2 + 0.01, -0.2, width - 0.06, 0.015, 0.38);
      moving.box(aluminum, 0, height * 0.24, 0.023, width * 0.8, 0.018, 0.028);
    }));
  }
  const origins = drawers.map(drawer => drawer.position.clone());
  const direction = new THREE.Vector3(Math.sin(context.local.yaw ?? 0), 0, Math.cos(context.local.yaw ?? 0));
  for (const x of [-width * 0.4, width * 0.4]) {
    for (const z of [-0.18, 0.18]) {
      context.box(steel, x, 0.09, z, 0.025, 0.1, 0.035);
      context.beam(rubber, [x - 0.018, 0.05, z], [x + 0.018, 0.05, z], 0.045);
    }
  }
  context.beam(aluminum, [width / 2 + 0.06, 0.63, -0.15], [width / 2 + 0.06, 0.63, 0.15], 0.015);
  return seconds => {
    drawers.forEach((drawer, index) => {
      const open = index === Math.floor(phase) % drawers.length ? openingPulse(seconds, 63, phase, 7, 0.8) : 0;
      drawer.position.copy(origins[index]).addScaledVector(direction, open * 0.23);
    });
  };
}

export function buildBenchVise(context: ArchitectureContext, phase: number): Animation {
  const { steel, aluminum, red } = context.palette;
  context.disc(steel, 0, 0.018, 0, 0.085, 0.035);
  context.box(red, 0, 0.09, 0, 0.14, 0.12, 0.16);
  context.box(steel, 0, 0.17, -0.04, 0.17, 0.045, 0.035);
  const jaw = context.moving("Bench vise sliding jaw", [0, 0.15, 0.055], moving => {
    moving.box(red, 0, 0, 0, 0.15, 0.08, 0.045);
    moving.box(steel, 0, 0.025, -0.02, 0.17, 0.025, 0.02);
    moving.beam(aluminum, [0, -0.025, -0.12], [0, -0.025, 0.07], 0.01);
    moving.beam(aluminum, [-0.07, -0.025, 0.08], [0.07, -0.025, 0.08], 0.007);
  });
  const base = jaw.position.clone();
  const direction = new THREE.Vector3(Math.sin(context.local.yaw ?? 0), 0, Math.cos(context.local.yaw ?? 0));
  return seconds => { jaw.position.copy(base).addScaledVector(direction, openingPulse(seconds, 52, phase, 13, 3) * 0.05); };
}

export function buildAirCompressor(context: ArchitectureContext, phase: number): Animation[] {
  const { red, steel, aluminum, dark, rubber, yellow } = context.palette;
  context.beam(red, [0, 0.25, -0.3], [0, 0.25, 0.3], 0.18);
  context.oval(red, 0, 0.25, -0.3, 0.18, 0.18, 0.09);
  context.oval(red, 0, 0.25, 0.3, 0.18, 0.18, 0.09);
  for (const side of [-1, 1]) context.beam(rubber, [side * 0.18 - 0.02, 0.08, 0.18], [side * 0.18 + 0.02, 0.08, 0.18], 0.08);
  context.box(rubber, 0, 0.04, -0.25, 0.17, 0.08, 0.08);
  context.box(steel, 0, 0.46, 0, 0.28, 0.06, 0.33);
  context.beam(dark, [0, 0.57, 0], [0, 0.57, 0.2], 0.095);
  for (let fin = 0; fin < 6; fin++) context.box(aluminum, 0, 0.52 + fin * 0.025, -0.12, 0.19, 0.012, 0.15);
  context.tube(steel, [[0.04, 0.65, -0.1], [0.13, 0.66, -0.15], [0.13, 0.43, -0.22]], 0.012);
  context.tube(steel, [[-0.15, 0.3, -0.2], [-0.15, 0.58, -0.38], [0.15, 0.58, -0.38], [0.15, 0.3, -0.2]], 0.018);
  context.box(yellow, 0.13, 0.59, 0.08, 0.07, 0.08, 0.1);
  const hose: [number, number, number][] = [];
  for (let step = 0; step <= 42; step++) {
    const t = step / 42;
    const angle = t * Math.PI * 10;
    hose.push([0.28 + Math.cos(angle) * 0.055, 0.05 + Math.sin(angle) * 0.035, -0.28 + t * 0.55]);
  }
  context.tube(yellow, hose, 0.006);
  const fan = context.moving("Compressor motor cooling fan", [0, 0.57, 0.21], moving => {
    for (let blade = 0; blade < 4; blade++) moving.box(aluminum, 0, 0, 0, 0.14, 0.025, 0.008, 0, blade * Math.PI / 4);
  });
  let pressure = 0.6;
  const animations: Animation[] = [(seconds, night) => {
    pressure = night ? 0.4 : 0.72 + Math.sin(seconds * 0.025 + phase) * 0.18;
    fan.rotation.z = seconds * (pressure < 0.7 && !night ? 22 : 0);
  }];
  animations.push(buildNeedleMeter(context.at({ x: 0.11, y: 0.49, z: 0.23 }), 0.12, 0.08, () => pressure));
  return animations;
}

export function buildWallHoseReel(context: ArchitectureContext, phase: number): Animation {
  const { yellow, steel, aluminum, dark } = context.palette;
  context.box(steel, 0, 0, -0.06, 0.23, 0.25, 0.035);
  for (const side of [-1, 1]) context.beam(steel, [side * 0.095, -0.08, -0.04], [side * 0.095, 0, 0.12], 0.015);
  const spool = context.moving("Retractable workshop hose reel", [0, 0, 0.12], moving => {
    for (const side of [-1, 1]) moving.beam(yellow, [side * 0.08, 0, 0], [side * 0.1, 0, 0], 0.15);
    moving.beam(dark, [-0.08, 0, 0], [0.08, 0, 0], 0.12);
    moving.box(aluminum, 0.106, 0.1, 0, 0.018, 0.03, 0.025);
  });
  context.tube(yellow, [[0, -0.12, 0.12], [0, -0.35, 0.1], [0, -0.58, 0.07]], 0.007);
  context.box(aluminum, 0, -0.62, 0.07, 0.035, 0.08, 0.025);
  return seconds => { spool.rotation.x = openingPulse(seconds, 66, phase, 10, 2) * 0.55; };
}

export function buildBatteryCharger(context: ArchitectureContext, phase: number): Animation {
  const { dark, green, aluminum, red } = context.palette;
  context.box(dark, 0, 0.045, 0, 0.24, 0.09, 0.2);
  for (const side of [-1, 1]) {
    context.box(green, side * 0.065, 0.11, 0, 0.095, 0.065, 0.13);
    context.box(dark, side * 0.065, 0.145, 0, 0.065, 0.008, 0.08);
    for (let contact = 0; contact < 3; contact++) context.box(aluminum, side * 0.065 - 0.02 + contact * 0.02, 0.149, 0.02, 0.008, 0.004, 0.015);
  }
  const led = context.moving("Tool charger status light", [0.06, 0.05, 0.107], moving => moving.box(red, 0, 0, 0, 0.012, 0.005, 0.003));
  return seconds => { led.visible = Math.floor(seconds * 2 + phase) % 2 === 0; };
}

export function buildGarageWorkbench(context: ArchitectureContext, materials: ArchitecturalMaterials, length: number, phase: number): Animation[] {
  const { steel, oak, aluminum } = context.palette;
  const animations: Animation[] = [];
  context.box(materials.timber, 0, 0.9, 0, length, 0.07, 0.55);
  for (const x of [-length * 0.44, length * 0.44]) {
    for (const z of [-0.21, 0.21]) context.box(steel, x, 0.45, z, 0.04, 0.9, 0.04);
  }
  context.box(oak, 0, 0.23, 0, length - 0.1, 0.035, 0.45);
  buildPegboard(context.at({ x: 0, y: 1.03, z: -0.24 }), length - 0.05, 0.8);
  buildCordlessDrill(context.at({ x: -length * 0.28, y: 0.94, z: 0.02 }));
  buildSocketSet(context.at({ x: length * 0.1, y: 0.94, z: 0.01 }));
  animations.push(buildBenchVise(context.at({ x: length * 0.36, y: 0.94, z: 0.13 }), phase));
  buildCombinationWrench(context.at({ x: -length * 0.1, y: 0.95, z: 0.13 }), 0.22, 0.028, 0.2);
  buildPliers(context.at({ x: -length * 0.2, y: 0.95, z: 0.12 }), 0.18);
  buildScrewdriver(context.at({ x: length * 0.22, y: 0.95, z: 0.1 }), 0.2, true);
  buildClawHammer(context.at({ x: -length * 0.38, y: 0.95, z: 0.02 }), 0.28);
  animations.push(buildBatteryCharger(context.at({ x: length * 0.2, y: 0.25, z: 0 }), phase));
  context.box(aluminum, 0, 1.88, -0.12, length - 0.12, 0.035, 0.12);
  context.box(context.palette.warmLight, 0, 1.855, -0.1, length - 0.2, 0.008, 0.07);
  return animations;
}

export function buildGarageStorage(context: ArchitectureContext, width: number): void {
  const { steel, oak, dark, white, yellow, aluminum } = context.palette;
  context.box(steel, 0, 2.12, 0, width, 0.025, 0.72);
  for (const x of [-width * 0.45, width * 0.45]) {
    for (const z of [-0.3, 0.3]) context.beam(steel, [x, 2.12, z], [x, 2.55, z], 0.012);
  }
  for (let box = 0; box < 4; box++) {
    const x = -width * 0.36 + box * width * 0.24;
    context.box(box % 2 ? dark : oak, x, 2.28, 0, width * 0.19, 0.28, 0.5);
    context.box(white, x, 2.28, 0.253, width * 0.1, 0.09, 0.004);
  }
  const ladderWidth = Math.min(1.4, width * 0.75);
  for (const side of [-1, 1]) context.box(aluminum, 0, 1.9 + side * 0.15, -0.18, ladderWidth, 0.035, 0.04);
  for (let rung = 0; rung < 7; rung++) context.box(aluminum, -ladderWidth * 0.43 + rung * ladderWidth * 0.143, 1.9, -0.18, 0.025, 0.3, 0.025);
  for (const side of [-1, 1]) context.tube(yellow, [[side * ladderWidth * 0.3, 1.85, -0.28], [side * ladderWidth * 0.3, 1.85, -0.1], [side * ladderWidth * 0.3, 1.95, -0.1]], 0.012);
}

export function buildBicycleServiceStand(context: ArchitectureContext): void {
  const { steel, aluminum, rubber, red } = context.palette;
  context.disc(steel, 0, 0.67, 0, 0.018, 1.3);
  for (let foot = 0; foot < 3; foot++) {
    const angle = foot * Math.PI * 2 / 3;
    context.beam(steel, [0, 0.22, 0], [Math.cos(angle) * 0.33, 0.025, Math.sin(angle) * 0.33], 0.016);
    context.beam(rubber, [Math.cos(angle) * 0.3, 0.025, Math.sin(angle) * 0.3], [Math.cos(angle) * 0.36, 0.025, Math.sin(angle) * 0.36], 0.023);
  }
  context.beam(aluminum, [0, 1.25, 0], [0, 1.25, 0.22], 0.018);
  for (const side of [-1, 1]) context.box(rubber, side * 0.025, 1.25, 0.23, 0.025, 0.07, 0.08);
  context.beam(red, [-0.07, 1.25, 0.23], [0.07, 1.25, 0.23], 0.008);
  context.box(steel, 0.13, 0.84, 0, 0.25, 0.018, 0.16);
  context.box(rubber, 0.13, 0.85, 0, 0.23, 0.004, 0.14);
}

export function buildGarageWorkshop(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, phase: number): Animation[] {
  const animations: Animation[] = [];
  const benchLength = Math.min(2.1, depth * 0.42);
  animations.push(...buildGarageWorkbench(context.at({ x: -width / 2 + 0.32, y: 0, z: 0.2, yaw: Math.PI / 2 }), materials, benchLength, phase));
  animations.push(buildToolChest(context.at({ x: width / 2 - 0.31, y: 0, z: depth * 0.12, yaw: -Math.PI / 2 }), 0.65, phase));
  animations.push(...buildAirCompressor(context.at({ x: width / 2 - 0.31, y: 0, z: -depth * 0.1 }), phase));
  animations.push(buildWallHoseReel(context.at({ x: width / 2 - 0.06, y: 1.5, z: -depth * 0.1, yaw: -Math.PI / 2 }), phase));
  buildGarageStorage(context.at({ x: 0, y: 0, z: depth * 0.22 }), width * 0.8);
  buildBicycleServiceStand(context.at({ x: -width / 2 + 0.42, y: 0, z: -depth * 0.2 }));
  const charge = buildDigitalNumber(context.at({ x: width / 2 - 0.08, y: 1.2, z: depth * 0.3, yaw: -Math.PI / 2 }), 2, 0.04);
  animations.push(seconds => charge.set(42 + Math.floor(seconds / 24) % 57));
  return animations;
}
