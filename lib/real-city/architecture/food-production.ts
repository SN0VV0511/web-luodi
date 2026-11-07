import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDigitalNumber, buildNeedleMeter, buildSignalStack, buildThermometer } from "./display-instruments";
import { buildPipeFlange } from "./mechanical-components";

function buildEquipmentFoot(context: ArchitectureContext, x: number, z: number, height: number): void {
  const { aluminum, dark } = context.palette;
  context.disc(aluminum, x, height / 2, z, 0.025, height);
  context.disc(dark, x, 0.012, z, 0.035, 0.024);
}

function buildCaster(context: ArchitectureContext, x: number, z: number, fixed = false): void {
  const { steel, aluminum, rubber } = context.palette;
  context.disc(aluminum, x, 0.13, z, 0.035, 0.055);
  context.box(steel, x, 0.085, z, 0.075, 0.08, 0.025);
  context.beam(rubber, [x - 0.025, 0.05, z + 0.025], [x + 0.025, 0.05, z + 0.025], 0.05);
  context.beam(aluminum, [x - 0.03, 0.05, z + 0.025], [x + 0.03, 0.05, z + 0.025], 0.012);
  if (fixed) context.box(steel, x, 0.085, z + 0.07, 0.055, 0.012, 0.04);
}

export function buildDeckOven(context: ArchitectureContext, width: number, phase: number): Animation[] {
  const { aluminum, steel, dark, glass, warmLight, red } = context.palette;
  const animations: Animation[] = [];
  context.box(aluminum, 0, 0.75, 0, width, 1.3, 0.86);
  for (const x of [-width * 0.4, width * 0.4]) {
    for (const z of [-0.32, 0.32]) buildEquipmentFoot(context, x, z, 0.14);
  }
  const doors: { group: THREE.Group; baseYaw: number }[] = [];
  for (let deck = 0; deck < 3; deck++) {
    const y = 0.35 + deck * 0.34;
    context.box(dark, 0, y, 0.443, width * 0.86, 0.27, 0.016);
    context.box(warmLight, 0, y, 0.45, width * 0.72, 0.12, 0.008);
    const door = context.moving("Bakery deck oven door", [0, y - 0.13, 0.47], moving => {
      moving.box(aluminum, 0, 0.13, 0, width * 0.88, 0.28, 0.035);
      moving.box(glass, 0, 0.14, 0.023, width * 0.65, 0.12, 0.014);
      moving.box(steel, 0, 0.235, 0.07, width * 0.68, 0.025, 0.025);
      for (const side of [-1, 1]) moving.box(steel, side * width * 0.32, 0.235, 0.04, 0.02, 0.03, 0.07);
    });
    doors.push({ group: door, baseYaw: door.rotation.y });
    for (let vent = 0; vent < 4; vent++) context.box(steel, -width * 0.3 + vent * width * 0.2, y - 0.17, 0.442, width * 0.1, 0.012, 0.005);
  }
  const temperature = buildDigitalNumber(context.at({ x: width * 0.32, y: 1.35, z: 0.455 }), 3, 0.03);
  context.box(red, -width * 0.36, 1.35, 0.46, 0.045, 0.045, 0.025);
  context.disc(steel, 0, 1.44, -0.22, 0.065, 0.2);
  context.tube(aluminum, [[0, 1.53, -0.22], [0, 1.75, -0.22], [0, 1.85, -0.45]], 0.065);
  animations.push((seconds, night) => {
    const heat = night ? 35 : 218 + Math.sin(seconds * 0.09 + phase) * 7;
    temperature.set(heat);
    doors.forEach(({ group }, deck) => {
      group.rotation.x = -openingPulse(seconds, 96, phase + deck * 25, 4, 1.4) * 1.35;
    });
  });
  return animations;
}

export function buildSpiralMixer(context: ArchitectureContext, phase: number): Animation {
  const { white, aluminum, steel, rubber, yellow } = context.palette;
  context.box(white, 0, 0.16, -0.08, 0.52, 0.28, 0.72);
  context.box(white, 0, 0.68, -0.26, 0.35, 0.9, 0.3);
  context.roundedBox(white, 0, 1.12, -0.03, 0.5, 0.26, 0.66, 0.07);
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.32, 0.23]) context.disc(rubber, x, 0.025, z, 0.045, 0.05);
  }
  const bowl = context.moving("Spiral mixer bowl", [0, 0.33, 0.14], moving => {
    const shape = [new THREE.Vector2(0, 0), new THREE.Vector2(0.14, 0.005), new THREE.Vector2(0.22, 0.08), new THREE.Vector2(0.25, 0.3), new THREE.Vector2(0.245, 0.32), new THREE.Vector2(0.23, 0.3), new THREE.Vector2(0.205, 0.09), new THREE.Vector2(0.13, 0.025), new THREE.Vector2(0, 0.025)];
    moving.part(aluminum, moving.geometry(new THREE.LatheGeometry(shape, 20)), [0, 0, 0]);
    moving.oval(context.palette.porcelain, 0.025, 0.1, 0, 0.15, 0.07, 0.16);
    moving.box(steel, 0.25, 0.21, 0, 0.035, 0.11, 0.1);
  });
  const hook = context.moving("Spiral dough hook", [0.05, 0.96, 0.14], moving => {
    moving.tube(steel, [[0, 0, 0], [0, -0.2, 0], [0.07, -0.3, 0.04], [0.01, -0.43, 0.08], [-0.07, -0.41, 0]], 0.014);
  });
  for (let guard = -3; guard <= 3; guard++) context.beam(steel, [guard * 0.065, 0.71, -0.02], [guard * 0.065, 0.71, 0.34], 0.005);
  context.box(yellow, 0.15, 1.13, 0.31, 0.08, 0.055, 0.012);
  return (seconds, night) => {
    const running = !night && THREE.MathUtils.euclideanModulo(seconds + phase, 48) < 32;
    if (running) {
      bowl.rotation.y = (context.local.yaw ?? 0) + seconds * 0.65;
      hook.rotation.y = (context.local.yaw ?? 0) - seconds * 4.1;
    }
  };
}

export function buildDoughSheeter(context: ArchitectureContext, phase: number): Animation {
  const { white, steel, aluminum, rubber, porcelain } = context.palette;
  context.box(white, 0, 0.53, 0, 0.45, 1.03, 0.5);
  context.box(aluminum, 0, 0.81, 0, 1.62, 0.08, 0.58);
  context.box(rubber, 0, 0.86, 0, 1.5, 0.015, 0.5);
  context.box(white, 0, 1.02, 0, 0.3, 0.3, 0.6);
  const rollers: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    rollers.push(context.moving("Dough sheeter roller", [side * 0.11, 0.94, 0], moving => {
      moving.beam(aluminum, [0, 0, -0.26], [0, 0, 0.26], 0.06);
      moving.box(steel, 0, 0.06, 0, 0.012, 0.005, 0.5);
    }));
    context.beam(steel, [side * 0.74, 0.79, -0.25], [side * 0.74, 0.79, 0.25], 0.035);
    context.beam(steel, [side * 0.15, 0.76, -0.18], [side * 0.66, 0.42, -0.18], 0.018);
    context.beam(steel, [side * 0.15, 0.76, 0.18], [side * 0.66, 0.42, 0.18], 0.018);
  }
  const dough = context.moving("Dough sheeter pastry sheet", [0, 0.879, 0], moving => {
    moving.roundedBox(porcelain, 0, 0, 0, 0.34, 0.012, 0.38, 0.04);
  });
  const rest = dough.position.clone();
  const direction = new THREE.Vector3(Math.cos(context.local.yaw ?? 0), 0, -Math.sin(context.local.yaw ?? 0));
  for (const x of [-0.16, 0.16]) {
    for (const z of [-0.19, 0.19]) buildCaster(context, x, z, true);
  }
  return (seconds, night) => {
    const travel = night ? 0 : Math.sin((seconds + phase) * 0.5);
    dough.position.copy(rest).addScaledVector(direction, travel * 0.5);
    rollers.forEach((roller, index) => { roller.rotation.z = travel * (index === 0 ? 1 : -1) * 5; });
  };
}

export function buildProofingCabinet(context: ArchitectureContext, phase: number): Animation[] {
  const { aluminum, glass, dark, warmLight } = context.palette;
  context.box(aluminum, 0, 0.88, -0.26, 0.7, 1.65, 0.045);
  for (const side of [-1, 1]) context.box(aluminum, side * 0.34, 0.88, 0, 0.035, 1.65, 0.56);
  context.box(aluminum, 0, 1.72, 0, 0.72, 0.08, 0.6);
  context.box(aluminum, 0, 0.1, 0, 0.72, 0.12, 0.6);
  for (let tray = 0; tray < 9; tray++) {
    const y = 0.23 + tray * 0.15;
    context.box(aluminum, 0, y, 0, 0.6, 0.012, 0.46);
    for (let dough = 0; dough < 3; dough++) context.oval(context.palette.porcelain, -0.18 + dough * 0.18, y + 0.045, 0, 0.06, 0.04, 0.12);
  }
  context.box(glass, 0, 0.88, 0.295, 0.64, 1.55, 0.02);
  context.box(aluminum, 0.27, 0.95, 0.34, 0.018, 0.35, 0.03);
  context.box(warmLight, -0.3, 0.86, 0.2, 0.015, 1.35, 0.018);
  context.box(dark, 0, 1.65, 0.31, 0.26, 0.08, 0.02);
  const display = buildDigitalNumber(context.at({ x: 0, y: 1.65, z: 0.33 }), 3, 0.025, 1);
  return [(seconds, night) => display.set(night ? 20 : 32 + Math.sin(seconds * 0.07 + phase) * 0.6)];
}

export function buildBakingRack(context: ArchitectureContext, loaded = true): void {
  const { steel, aluminum, clay } = context.palette;
  for (const x of [-0.32, 0.32]) {
    for (const z of [-0.22, 0.22]) {
      context.box(steel, x, 0.98, z, 0.028, 1.65, 0.028);
      buildCaster(context, x, z);
    }
  }
  for (let shelf = 0; shelf < 11; shelf++) {
    const y = 0.22 + shelf * 0.14;
    for (const side of [-1, 1]) context.box(aluminum, side * 0.29, y, 0, 0.045, 0.018, 0.48);
    if (loaded && shelf % 2 === 0) {
      context.box(aluminum, 0, y + 0.015, 0, 0.57, 0.012, 0.44);
      for (let loaf = 0; loaf < 3; loaf++) context.oval(clay, -0.18 + loaf * 0.18, y + 0.065, 0, 0.064, 0.045, 0.14);
    }
  }
  context.beam(steel, [-0.32, 1.8, -0.22], [0.32, 1.8, -0.22], 0.016);
  context.beam(steel, [-0.32, 1.8, 0.22], [0.32, 1.8, 0.22], 0.016);
}

export function buildIngredientBin(context: ArchitectureContext, width = 0.42, color?: THREE.Material): void {
  const { white, glass, aluminum } = context.palette;
  const shell = color ?? white;
  context.roundedBox(shell, 0, 0.35, 0, width, 0.55, width * 1.35, 0.035);
  context.box(glass, 0, 0.64, width * 0.15, width * 0.9, 0.025, width * 0.95);
  context.box(shell, 0, 0.66, -width * 0.45, width, 0.08, width * 0.35);
  context.box(aluminum, 0, 0.67, width * 0.5, width * 0.4, 0.02, 0.035);
  for (const x of [-width * 0.35, width * 0.35]) {
    for (const z of [-width * 0.45, width * 0.45]) buildCaster(context, x, z);
  }
}

export function buildPastryTable(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number): void {
  const { aluminum, steel, oak, white } = context.palette;
  context.box(materials.terrazzo, 0, 0.88, 0, width, 0.06, 0.76);
  for (const x of [-width * 0.44, width * 0.44]) {
    for (const z of [-0.3, 0.3]) {
      context.box(steel, x, 0.43, z, 0.035, 0.86, 0.035);
      buildEquipmentFoot(context, x, z, 0.06);
    }
  }
  context.box(aluminum, 0, 0.2, 0, width - 0.1, 0.025, 0.65);
  context.box(oak, -width * 0.2, 0.925, 0, width * 0.35, 0.025, 0.48);
  context.beam(oak, [-width * 0.2, 0.97, -0.18], [-width * 0.2, 0.97, 0.18], 0.035);
  context.beam(oak, [-width * 0.2, 0.97, -0.28], [-width * 0.2, 0.97, -0.18], 0.017);
  context.beam(oak, [-width * 0.2, 0.97, 0.18], [-width * 0.2, 0.97, 0.28], 0.017);
  context.box(white, width * 0.15, 0.925, 0.06, 0.18, 0.012, 0.27);
  context.box(steel, width * 0.28, 0.925, -0.06, 0.1, 0.004, 0.18);
  context.box(oak, width * 0.28, 0.94, -0.16, 0.1, 0.028, 0.045);
  for (let tin = 0; tin < 3; tin++) {
    context.box(aluminum, width * 0.2, 0.235 + tin * 0.05, 0, width * 0.35, 0.03, 0.43);
  }
}

export function buildBenchScale(context: ArchitectureContext, phase: number): Animation {
  const { aluminum, white, dark } = context.palette;
  context.box(white, 0, 0.045, 0, 0.27, 0.09, 0.24);
  context.box(aluminum, 0, 0.1, -0.025, 0.25, 0.015, 0.2);
  context.box(dark, 0, 0.035, 0.126, 0.19, 0.045, 0.008);
  const number = buildDigitalNumber(context.at({ x: 0, y: 0.035, z: 0.134 }), 4, 0.015);
  const bowl = context.geometry(new THREE.CylinderGeometry(0.095, 0.06, 0.08, 16, 1, true));
  context.part(aluminum, bowl, [0, 0.15, -0.025]);
  return seconds => number.set(450 + Math.round(openingPulse(seconds, 38, phase, 7, 2) * 130));
}

export function buildExtractionHood(context: ArchitectureContext, width: number, depth: number): void {
  const { aluminum, steel, warmLight } = context.palette;
  context.box(aluminum, 0, 0, 0, width, 0.32, depth);
  context.box(steel, 0, -0.17, 0, width - 0.08, 0.02, depth - 0.08);
  const filters = Math.max(2, Math.ceil(width / 0.4));
  for (let filter = 0; filter < filters; filter++) {
    const x = -width / 2 + (filter + 0.5) * width / filters;
    const filterWidth = width / filters - 0.035;
    for (let blade = 0; blade < 7; blade++) context.box(aluminum, x, -0.19, -depth * 0.36 + blade * depth * 0.12, filterWidth, 0.025, 0.025, 0, 0.08);
  }
  context.box(warmLight, 0, -0.19, depth / 2 - 0.06, width - 0.2, 0.012, 0.03);
  context.box(aluminum, 0, 0.43, -depth * 0.2, width * 0.3, 0.56, depth * 0.45);
  for (const side of [-1, 1]) context.beam(steel, [side * width * 0.4, 0.12, -depth * 0.32], [side * width * 0.4, 0.65, -depth * 0.32], 0.008);
}

export function buildCommercialDishwasher(context: ArchitectureContext, phase: number): Animation {
  const { aluminum, dark, white, steel } = context.palette;
  context.box(aluminum, 0, 0.47, 0, 0.64, 0.84, 0.65);
  context.box(dark, 0, 0.71, 0.33, 0.56, 0.18, 0.01);
  for (const x of [-0.25, 0.25]) {
    for (const z of [-0.25, 0.25]) buildEquipmentFoot(context, x, z, 0.1);
  }
  const hood = context.moving("Pass-through dishwasher hood", [0, 0.9, 0], moving => {
    moving.box(aluminum, 0, 0.25, -0.31, 0.65, 0.5, 0.035);
    for (const side of [-1, 1]) moving.box(aluminum, side * 0.31, 0.25, 0, 0.035, 0.5, 0.64);
    moving.box(aluminum, 0, 0.5, 0, 0.65, 0.035, 0.65);
    moving.box(aluminum, 0, 0.25, 0.31, 0.65, 0.5, 0.035);
    moving.beam(steel, [-0.25, 0.2, 0.39], [0.25, 0.2, 0.39], 0.015);
  });
  const base = hood.position.y;
  context.box(white, 0, 0.9, 0, 0.5, 0.08, 0.5);
  for (let plate = 0; plate < 7; plate++) context.beam(white, [-0.2 + plate * 0.065, 0.99, -0.07], [-0.2 + plate * 0.065, 0.99, -0.05], 0.095);
  return seconds => { hood.position.y = base + openingPulse(seconds, 65, phase, 8, 1.2) * 0.48; };
}

export function buildCoffeeRoaster(context: ArchitectureContext, phase: number): Animation[] {
  const { red, steel, aluminum, bronze, glass, dark } = context.palette;
  context.box(steel, 0, 0.12, 0, 0.72, 0.24, 0.72);
  context.beam(red, [0, 0.68, -0.3], [0, 0.68, 0.18], 0.3);
  context.beam(steel, [0, 0.68, 0.19], [0, 0.68, 0.24], 0.28);
  context.beam(glass, [0, 0.68, 0.246], [0, 0.68, 0.252], 0.2);
  const drum = context.moving("Coffee roaster drum", [0, 0.68, 0.26], moving => {
    for (let rib = 0; rib < 4; rib++) {
      const angle = rib * Math.PI / 2;
      moving.box(bronze, Math.cos(angle) * 0.11, Math.sin(angle) * 0.11, 0, 0.19, 0.022, 0.012, 0, angle);
    }
  });
  const hopper = context.geometry(new THREE.ConeGeometry(0.2, 0.32, 16, 1, true));
  hopper.rotateX(Math.PI);
  context.part(aluminum, hopper, [0, 1.15, -0.03]);
  context.disc(aluminum, 0, 0.97, -0.03, 0.045, 0.16);
  context.disc(steel, 0, 0.4, 0.46, 0.28, 0.1);
  const cooler = context.moving("Coffee bean cooling rake", [0, 0.46, 0.46], moving => {
    moving.box(aluminum, 0, 0, 0, 0.5, 0.025, 0.025);
    for (const side of [-1, 1]) moving.box(aluminum, side * 0.2, -0.02, 0, 0.025, 0.05, 0.16);
  });
  context.tube(steel, [[0, 0.82, -0.3], [0, 1.1, -0.43], [0, 1.65, -0.43]], 0.075);
  buildPipeFlange(context.at({ x: 0, y: 1.45, z: -0.43 }), 0.075);
  context.box(dark, 0.38, 0.79, 0.07, 0.06, 0.23, 0.21);
  const meter = buildNeedleMeter(context.at({ x: 0.16, y: 0.9, z: 0.28 }), 0.15, 0.1, () => 0.7 + Math.sin(phase) * 0.1);
  return [meter, (seconds, night) => {
    drum.rotation.z = night ? 0 : seconds * 0.8 + phase;
    cooler.rotation.y = (context.local.yaw ?? 0) + (night ? 0 : seconds * 0.5);
  }];
}

export function buildCoffeeGrinder(context: ArchitectureContext): void {
  const { aluminum, dark, glass, oak } = context.palette;
  context.roundedBox(dark, 0, 0.035, 0, 0.22, 0.07, 0.3, 0.025);
  context.disc(aluminum, 0, 0.25, -0.05, 0.085, 0.38);
  const hopper = context.geometry(new THREE.ConeGeometry(0.12, 0.2, 16, 1, true));
  hopper.rotateX(Math.PI);
  context.part(glass, hopper, [0, 0.55, -0.05]);
  context.disc(dark, 0, 0.66, -0.05, 0.125, 0.018);
  context.disc(oak, 0, 0.53, -0.05, 0.075, 0.06);
  context.box(aluminum, 0, 0.26, 0.08, 0.09, 0.045, 0.15);
  for (const side of [-1, 1]) context.box(aluminum, side * 0.04, 0.16, 0.1, 0.012, 0.02, 0.1);
  context.box(dark, 0, 0.34, 0.044, 0.065, 0.065, 0.012);
}

export function buildCoffeeCuppingBench(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number): void {
  const { oak, porcelain, aluminum, dark } = context.palette;
  context.box(materials.terrazzo, 0, 0.91, 0, width, 0.05, 0.62);
  for (const side of [-1, 1]) context.box(oak, side * width * 0.4, 0.45, 0, 0.06, 0.9, 0.5);
  const cups = Math.max(3, Math.floor(width / 0.22));
  for (let cup = 0; cup < cups; cup++) {
    const x = -width / 2 + (cup + 0.5) * width / cups;
    context.disc(porcelain, x, 0.965, 0.05, 0.055, 0.08);
    context.disc(dark, x, 1.005, 0.05, 0.046, 0.003);
    context.beam(aluminum, [x, 0.947, -0.08], [x, 0.947, -0.22], 0.006);
    context.oval(aluminum, x, 0.947, -0.24, 0.018, 0.004, 0.025);
  }
  buildCoffeeGrinder(context.at({ x: -width * 0.35, y: 0.94, z: -0.1 }));
}

export function buildFoodPackagingStation(context: ArchitectureContext, width: number, phase: number): Animation {
  const { aluminum, dark, white, green } = context.palette;
  context.box(aluminum, 0, 0.86, 0, width, 0.045, 0.65);
  for (const x of [-width * 0.43, width * 0.43]) {
    for (const z of [-0.25, 0.25]) context.box(aluminum, x, 0.43, z, 0.03, 0.86, 0.03);
  }
  context.box(dark, -width * 0.2, 0.92, 0, 0.44, 0.08, 0.15);
  const bar = context.moving("Impulse package sealer arm", [-width * 0.42, 0.96, 0], moving => {
    moving.box(green, 0.22, 0, 0, 0.44, 0.035, 0.09);
    moving.box(dark, 0.4, 0.025, 0, 0.09, 0.035, 0.065);
  });
  for (let bag = 0; bag < 5; bag++) context.box(white, width * 0.28, 0.9 + bag * 0.008, 0.03, width * 0.24, 0.006, 0.35);
  context.box(context.palette.oak, width * 0.22, 0.2, 0, width * 0.35, 0.25, 0.45);
  return seconds => { bar.rotation.z = openingPulse(seconds, 18, phase, 3, 0.6) * 0.6; };
}

export function buildBakeryProduction(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, phase: number): Animation[] {
  const animations: Animation[] = [];
  const back = -depth / 2 + 0.48;
  animations.push(...buildDeckOven(context.at({ x: -width * 0.33, y: 0, z: back }), Math.min(1.4, width * 0.24), phase));
  buildExtractionHood(context.at({ x: -width * 0.33, y: 2.25, z: back }), Math.min(1.65, width * 0.28), 0.95);
  animations.push(buildSpiralMixer(context.at({ x: -width * 0.1, y: 0, z: back }), phase));
  animations.push(...buildProofingCabinet(context.at({ x: width * 0.1, y: 0, z: back }), phase));
  buildBakingRack(context.at({ x: width * 0.32, y: 0, z: back }), true);
  const tableWidth = Math.min(2.1, width * 0.35);
  if (depth > 3) {
    buildPastryTable(context.at({ x: 0, y: 0, z: depth * 0.23 }), materials, tableWidth);
    animations.push(buildBenchScale(context.at({ x: tableWidth * 0.3, y: 0.92, z: depth * 0.23 }), phase));
    buildIngredientBin(context.at({ x: -tableWidth * 0.37, y: 0, z: depth * 0.23 }));
    animations.push(buildDoughSheeter(context.at({ x: -width * 0.32, y: 0, z: depth * 0.23, yaw: Math.PI / 2 }), phase));
    animations.push(buildFoodPackagingStation(context.at({ x: width * 0.33, y: 0, z: depth * 0.23 }), 1.15, phase));
  } else {
    buildPastryTable(context.at({ x: width * 0.33, y: 0, z: depth * 0.22 }), materials, 1.1);
    animations.push(buildBenchScale(context.at({ x: width * 0.33, y: 0.92, z: depth * 0.22 }), phase));
  }
  return animations;
}

export function buildCoffeeProduction(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, phase: number): Animation[] {
  const animations: Animation[] = [];
  const back = -depth / 2 + 0.5;
  animations.push(...buildCoffeeRoaster(context.at({ x: -width * 0.3, y: 0, z: back }), phase));
  animations.push(buildCommercialDishwasher(context.at({ x: width * 0.32, y: 0, z: back }), phase));
  buildCoffeeCuppingBench(context.at({ x: width * 0.04, y: 0, z: back }), materials, Math.min(1.8, width * 0.34));
  buildExtractionHood(context.at({ x: -width * 0.3, y: 2.25, z: back }), 1, 0.9);
  if (depth > 3) {
    animations.push(buildFoodPackagingStation(context.at({ x: -width * 0.2, y: 0, z: depth * 0.24 }), 1.4, phase));
    buildIngredientBin(context.at({ x: width * 0.2, y: 0, z: depth * 0.24 }), 0.45, context.palette.green);
    buildIngredientBin(context.at({ x: width * 0.32, y: 0, z: depth * 0.24 }), 0.45, context.palette.oak);
  }
  let tankTemperature = 91;
  animations.push((seconds, night) => { tankTemperature = night ? 24 : 91 + Math.sin(seconds * 0.08 + phase) * 1.3; });
  animations.push(buildThermometer(context.at({ x: width * 0.04, y: 1.65, z: back - 0.18 }), () => tankTemperature));
  animations.push(buildSignalStack(context.at({ x: -width * 0.3 + 0.34, y: 1.4, z: back }), () => tankTemperature > 80 ? "green" : "amber"));
  return animations;
}
