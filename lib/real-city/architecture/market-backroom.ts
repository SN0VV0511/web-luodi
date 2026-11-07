import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDigitalNumber, buildThermometer } from "./display-instruments";
import { buildSwingDoor } from "./doors";

export function buildPallet(context: ArchitectureContext, width = 0.8, depth = 1.2): void {
  const { oak, steel } = context.palette;
  for (const x of [-width * 0.4, 0, width * 0.4]) {
    for (const z of [-depth * 0.4, 0, depth * 0.4]) context.box(oak, x, 0.07, z, width * 0.16, 0.09, depth * 0.13);
    context.box(oak, x, 0.013, 0, width * 0.18, 0.026, depth);
  }
  for (let plank = 0; plank < 7; plank++) {
    const z = -depth / 2 + (plank + 0.5) * depth / 7;
    context.box(oak, 0, 0.13, z, width, 0.025, depth / 7 * 0.75);
    for (const side of [-1, 1]) context.disc(steel, side * width * 0.4, 0.144, z, 0.002, 0.002);
  }
}

export function buildProduceCrate(context: ArchitectureContext, width: number, depth: number, color: THREE.Material, filled: boolean): void {
  const { dark, green, yellow, red } = context.palette;
  const height = 0.23;
  context.box(color, 0, 0.015, 0, width, 0.03, depth);
  for (const side of [-1, 1]) {
    context.box(color, side * width / 2, height / 2, 0, 0.025, height, depth);
    context.box(color, 0, height / 2, side * depth / 2, width, height, 0.025);
    context.box(dark, 0, height * 0.72, side * (depth / 2 + 0.014), width * 0.35, height * 0.18, 0.003);
    for (let rib = 0; rib < 6; rib++) {
      const x = -width / 2 + (rib + 0.5) * width / 6;
      context.box(dark, x, height * 0.35, side * (depth / 2 + 0.014), width / 6 * 0.52, height * 0.3, 0.003);
    }
  }
  if (filled) {
    const columns = Math.max(3, Math.floor(width / 0.1));
    const rows = Math.max(2, Math.floor(depth / 0.1));
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const x = -width * 0.42 + (column + 0.5) * width * 0.84 / columns;
        const z = -depth * 0.4 + (row + 0.5) * depth * 0.8 / rows;
        context.oval((column + row) % 3 === 0 ? red : (column + row) % 3 === 1 ? yellow : green, x, 0.16, z, 0.035, 0.04, 0.035);
      }
    }
  }
}

export function buildHandPalletTruck(context: ArchitectureContext): void {
  const { yellow, steel, aluminum, rubber } = context.palette;
  for (const side of [-1, 1]) {
    context.roundedBox(yellow, side * 0.18, 0.075, 0.1, 0.14, 0.08, 1.08, 0.04);
    context.beam(rubber, [side * 0.18 - 0.04, 0.045, 0.52], [side * 0.18 + 0.04, 0.045, 0.52], 0.044);
  }
  context.box(yellow, 0, 0.16, -0.42, 0.52, 0.25, 0.23);
  context.disc(aluminum, 0, 0.3, -0.42, 0.07, 0.25);
  for (const side of [-1, 1]) context.beam(rubber, [side * 0.075 - 0.025, 0.08, -0.48], [side * 0.075 + 0.025, 0.08, -0.48], 0.08);
  context.beam(steel, [0, 0.22, -0.44], [0, 0.89, -0.66], 0.025);
  context.tube(rubber, [[-0.16, 0.93, -0.67], [-0.16, 1.07, -0.7], [0.16, 1.07, -0.7], [0.16, 0.93, -0.67]], 0.019);
  context.beam(steel, [-0.16, 0.93, -0.67], [0.16, 0.93, -0.67], 0.019);
  context.box(aluminum, 0.07, 1.055, -0.68, 0.02, 0.05, 0.035);
}

export function buildStockCart(context: ArchitectureContext, boxes: number): void {
  const { steel, aluminum, rubber, oak, white } = context.palette;
  context.box(aluminum, 0, 0.21, 0, 0.65, 0.025, 0.95);
  for (const x of [-0.27, 0.27]) {
    for (const z of [-0.4, 0.4]) {
      context.box(steel, x, 0.14, z, 0.035, 0.13, 0.035);
      context.beam(rubber, [x - 0.022, 0.065, z], [x + 0.022, 0.065, z], 0.06);
    }
    context.beam(steel, [x, 0.21, -0.43], [x, 1.05, -0.43], 0.018);
  }
  context.beam(steel, [-0.27, 1.05, -0.43], [0.27, 1.05, -0.43], 0.02);
  for (let box = 0; box < Math.min(5, boxes); box++) {
    const y = 0.36 + Math.floor(box / 2) * 0.25;
    const z = (box % 2 - 0.5) * 0.43;
    context.box(oak, 0, y, z, 0.5, 0.24, 0.4);
    context.box(white, 0, y + 0.122, z, 0.045, 0.003, 0.4);
    context.box(white, 0.254, y + 0.02, z, 0.003, 0.1, 0.16);
  }
}

export function buildColdRoom(context: ArchitectureContext, width: number, depth: number, phase: number): Animation[] {
  const { white, aluminum, dark, steel, glass, warmLight, green } = context.palette;
  const animations: Animation[] = [];
  const height = 2.25;
  context.box(aluminum, 0, 0.035, 0, width, 0.07, depth);
  context.box(white, 0, height, 0, width, 0.1, depth);
  context.box(white, 0, height / 2, -depth / 2, width, height, 0.1);
  for (const side of [-1, 1]) context.box(white, side * width / 2, height / 2, 0, 0.1, height, depth);
  const doorway = Math.min(0.85, width * 0.55);
  const sideWidth = (width - doorway) / 2;
  for (const side of [-1, 1]) context.box(white, side * (doorway / 2 + sideWidth / 2), 1.03, depth / 2, sideWidth, 2.06, 0.1);
  context.box(white, 0, 2.155, depth / 2, width, 0.19, 0.1);
  animations.push(buildSwingDoor(context.at({ x: 0, y: 0.07, z: depth / 2 + 0.02 }), doorway - 0.035, 1.98, phase, false));
  context.box(glass, 0, 1.3, -depth / 2 - 0.052, width * 0.55, 0.5, 0.008);
  const shelfWidth = Math.max(0.65, width - 0.22);
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.32 + shelf * 0.4;
    context.box(aluminum, 0, y, -depth / 2 + 0.27, shelfWidth, 0.025, 0.38);
    const crates = Math.max(1, Math.floor(shelfWidth / 0.48));
    for (let crate = 0; crate < crates; crate++) {
      buildProduceCrate(context.at({ x: -shelfWidth / 2 + (crate + 0.5) * shelfWidth / crates, y: y + 0.015, z: -depth / 2 + 0.27 }), Math.min(0.43, shelfWidth / crates - 0.02), 0.3, green, true);
    }
  }
  context.box(aluminum, 0, 1.94, -depth / 2 + 0.23, width * 0.7, 0.25, 0.36);
  const fan = context.moving("Cold room evaporator fan", [0, 1.93, -depth / 2 + 0.43], moving => {
    for (let blade = 0; blade < 4; blade++) {
      const angle = blade * Math.PI / 2;
      moving.box(steel, Math.cos(angle) * 0.045, Math.sin(angle) * 0.045, 0, 0.1, 0.03, 0.008, 0, angle + 0.2);
    }
  });
  context.box(warmLight, 0, height - 0.08, 0, 0.5, 0.02, 0.07);
  for (const side of [-1, 1]) context.box(dark, side * width * 0.38, height / 2, -depth / 2 + 0.06, 0.016, height - 0.1, 0.016);
  const display = buildDigitalNumber(context.at({ x: width / 2 - 0.18, y: 1.65, z: depth / 2 + 0.08 }), 2, 0.025, 1);
  let temperature = 3.5;
  animations.push((seconds, night) => {
    temperature = 3.5 + Math.sin(seconds * 0.07 + phase) * 0.6;
    fan.rotation.z = seconds * (night ? 9 : 16);
    display.set(temperature);
  });
  animations.push(buildThermometer(context.at({ x: -width / 2 + 0.16, y: 1.45, z: depth / 2 + 0.075 }), () => temperature));
  return animations;
}

export function buildWeighingLabeler(context: ArchitectureContext, phase: number): Animation[] {
  const { aluminum, white, dark, green, yellow } = context.palette;
  context.box(white, 0, 0.07, 0, 0.34, 0.14, 0.35);
  context.box(aluminum, 0, 0.15, -0.04, 0.31, 0.02, 0.24);
  context.box(dark, 0.12, 0.31, -0.1, 0.025, 0.32, 0.025);
  context.box(white, 0.09, 0.46, -0.1, 0.3, 0.14, 0.035);
  const weight = buildDigitalNumber(context.at({ x: 0.09, y: 0.46, z: -0.075 }), 4, 0.024, 3);
  const price = buildDigitalNumber(context.at({ x: -0.02, y: 0.075, z: 0.185 }), 4, 0.016, 2);
  context.box(dark, 0.09, 0.06, 0.18, 0.08, 0.015, 0.012);
  const receipt = context.moving("Produce label printer output", [0.09, 0.055, 0.19], moving => {
    moving.box(white, 0, -0.035, 0, 0.065, 0.07, 0.002);
    for (let bar = 0; bar < 12; bar++) moving.box(dark, -0.026 + bar * 0.0045, -0.035, 0.002, bar % 3 === 0 ? 0.002 : 0.001, 0.025, 0.001);
  });
  context.oval(green, -0.06, 0.2, -0.04, 0.06, 0.055, 0.06);
  context.oval(yellow, 0.06, 0.2, -0.04, 0.06, 0.055, 0.06);
  return [seconds => {
    const weighed = 0.437 + openingPulse(seconds, 27, phase, 8, 1.2) * 0.185;
    weight.set(weighed);
    price.set(weighed * 9.8);
    receipt.scale.y = 0.05 + openingPulse(seconds, 27, phase + 12, 3, 1.5) * 0.95;
  }];
}

export function buildRollerConveyor(context: ArchitectureContext, width: number, length: number, phase: number): Animation {
  const { steel, aluminum, rubber, oak, white } = context.palette;
  const height = 0.72;
  for (const side of [-1, 1]) context.box(steel, side * width / 2, height - 0.04, 0, 0.035, 0.08, length);
  const rollerCount = Math.max(6, Math.ceil(length / 0.09));
  const rollers: THREE.Group[] = [];
  for (let roller = 0; roller < rollerCount; roller++) {
    const z = -length / 2 + (roller + 0.5) * length / rollerCount;
    rollers.push(context.moving("Stock conveyor roller", [0, height, z], moving => {
      moving.beam(aluminum, [-width / 2, 0, 0], [width / 2, 0, 0], 0.035);
      moving.box(rubber, 0, 0.035, 0, width * 0.9, 0.004, 0.008);
    }));
  }
  for (const x of [-width * 0.4, width * 0.4]) {
    for (const z of [-length * 0.4, length * 0.4]) {
      context.box(steel, x, height / 2, z, 0.035, height, 0.035);
      context.disc(rubber, x, 0.02, z, 0.04, 0.04);
    }
  }
  const packageRoot = context.moving("Stock conveyor carton", [0, height + 0.19, -length * 0.3], moving => {
    moving.box(oak, 0, 0, 0, width * 0.76, 0.3, 0.38);
    moving.box(white, 0, 0.152, 0, width * 0.1, 0.004, 0.38);
    moving.box(white, width * 0.383, 0, 0, 0.003, 0.12, 0.18);
  });
  const origin = packageRoot.position.clone();
  const direction = new THREE.Vector3(Math.sin(context.local.yaw ?? 0), 0, Math.cos(context.local.yaw ?? 0));
  return (seconds, night) => {
    const travel = night ? 0.3 : (Math.sin((seconds + phase) * 0.2) + 1) / 2;
    packageRoot.position.copy(origin).addScaledVector(direction, travel * length * 0.6);
    for (const roller of rollers) roller.rotation.x = -travel * length / 0.035;
  };
}

export function buildStoreWashStation(context: ArchitectureContext, width: number): void {
  const { aluminum, steel, white, green } = context.palette;
  context.box(aluminum, 0, 0.88, 0, width, 0.045, 0.65);
  const basinWidth = Math.min(0.5, width * 0.4);
  context.box(steel, -width * 0.2, 0.91, 0, basinWidth, 0.012, 0.44);
  context.box(aluminum, -width * 0.2, 0.79, 0, basinWidth - 0.02, 0.23, 0.42);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width * 0.44, 0.44, -0.26, 0.03, 0.88, 0.03);
    context.box(aluminum, side * width * 0.44, 0.44, 0.26, 0.03, 0.88, 0.03);
  }
  context.tube(aluminum, [[-width * 0.2, 0.91, -0.24], [-width * 0.2, 1.2, -0.24], [-width * 0.2, 1.25, -0.1], [-width * 0.2, 1.15, -0.05]], 0.012);
  context.box(white, width * 0.28, 0.93, 0, width * 0.3, 0.02, 0.45);
  context.disc(green, width * 0.38, 1.02, -0.2, 0.025, 0.17);
  context.box(aluminum, width * 0.38, 1.12, -0.2, 0.04, 0.02, 0.035);
}

export function buildMarketBackroom(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, phase: number): Animation[] {
  const animations: Animation[] = [];
  const coldWidth = Math.min(2.1, width * 0.36);
  const coldDepth = Math.min(1.5, depth * 0.6);
  animations.push(...buildColdRoom(context.at({ x: -width * 0.28, y: 0, z: -depth / 2 + coldDepth / 2 }), coldWidth, coldDepth, phase));
  buildStoreWashStation(context.at({ x: width * 0.08, y: 0, z: -depth / 2 + 0.35 }), Math.min(1.6, width * 0.25));
  animations.push(...buildWeighingLabeler(context.at({ x: width * 0.16, y: 0.91, z: -depth / 2 + 0.35 }), phase));
  buildPallet(context.at({ x: width * 0.36, y: 0, z: -depth / 2 + 0.62 }), 0.65, 0.9);
  for (let level = 0; level < 3; level++) buildProduceCrate(context.at({ x: width * 0.36, y: 0.15 + level * 0.23, z: -depth / 2 + 0.62 }), 0.6, 0.42, context.palette.green, level === 2);
  if (depth > 3) {
    buildHandPalletTruck(context.at({ x: width * 0.28, y: 0, z: depth * 0.23, yaw: Math.PI / 2 }));
    buildStockCart(context.at({ x: -width * 0.32, y: 0, z: depth * 0.22 }), 4);
    animations.push(buildRollerConveyor(context.at({ x: -width * 0.03, y: 0, z: depth * 0.2, yaw: Math.PI / 2 }), 0.5, Math.min(1.9, width * 0.35), phase));
  }
  context.box(materials.porcelainTile, 0, 0.008, 0, width, 0.016, depth);
  return animations;
}
