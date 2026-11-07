import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildBookshelf, buildDiningChair, buildTaskChair } from "./furniture";
import { buildDigitalNumber } from "./display-instruments";

export function buildOpenBook(context: ArchitectureContext, width: number, depth: number, cover: THREE.Material, spread = 0.1): void {
  const { white, dark } = context.palette;
  const half = width / 2;
  for (const side of [-1, 1]) {
    context.panel(cover, [[0, 0.012, -depth / 2], [side * half, spread, -depth / 2], [side * half, spread, depth / 2], [0, 0.012, depth / 2]]);
    context.panel(white, [[side * 0.006, 0.025, -depth / 2 + 0.008], [side * (half - 0.007), spread + 0.016, -depth / 2 + 0.008], [side * (half - 0.007), spread + 0.016, depth / 2 - 0.008], [side * 0.006, 0.025, depth / 2 - 0.008]]);
    for (let line = 0; line < 12; line++) {
      const z = -depth * 0.38 + line * depth * 0.062;
      const startX = side * width * 0.045;
      const endX = side * width * (line % 4 === 3 ? 0.34 : 0.43);
      const startY = 0.027 + Math.abs(startX) / half * spread;
      const endY = 0.027 + Math.abs(endX) / half * spread;
      context.beam(dark, [startX, startY, z], [endX, endY, z], 0.0009);
    }
  }
  context.box(cover, 0, 0.009, 0, 0.018, 0.018, depth);
}

export function buildReadingLectern(context: ArchitectureContext, width = 0.6): void {
  const { oak, aluminum, dark } = context.palette;
  context.box(oak, 0, 0.035, 0, width * 0.72, 0.07, 0.45);
  context.box(oak, 0, 0.57, 0, 0.07, 1.08, 0.09);
  context.panel(oak, [[-width / 2, 1.12, 0.2], [width / 2, 1.12, 0.2], [width / 2, 1.3, -0.2], [-width / 2, 1.3, -0.2]]);
  context.box(oak, 0, 1.14, 0.19, width, 0.045, 0.025);
  context.tube(aluminum, [[width * 0.35, 1.25, -0.15], [width * 0.35, 1.55, -0.1], [0, 1.55, 0]], 0.008);
  context.box(dark, 0, 1.53, 0, width * 0.4, 0.035, 0.08);
  context.box(context.palette.warmLight, 0, 1.51, 0, width * 0.34, 0.008, 0.055);
}

export function buildLibraryLadder(context: ArchitectureContext, height: number): void {
  const { oak, steel, rubber, aluminum } = context.palette;
  const run = height * 0.22;
  for (const side of [-1, 1]) {
    context.rectangularBeam(oak, [side * 0.21, 0.05, run / 2], [side * 0.21, height, -run / 2], 0.055, 0.07);
    context.beam(rubber, [side * 0.21 - 0.025, 0.06, run / 2], [side * 0.21 + 0.025, 0.06, run / 2], 0.06);
    context.tube(steel, [[side * 0.21, height - 0.05, -run / 2], [side * 0.21, height + 0.08, -run / 2 - 0.1], [side * 0.21, height + 0.03, -run / 2 - 0.18]], 0.015);
  }
  const steps = Math.max(4, Math.ceil(height / 0.28));
  for (let step = 0; step < steps; step++) {
    const y = 0.12 + step * (height - 0.28) / steps;
    const z = run / 2 - y / height * run;
    context.box(oak, 0, y, z, 0.45, 0.025, 0.15);
    context.box(rubber, 0, y + 0.014, z + 0.04, 0.35, 0.003, 0.03);
  }
  context.beam(aluminum, [-0.3, height + 0.04, -run / 2 - 0.14], [0.3, height + 0.04, -run / 2 - 0.14], 0.025);
}

export function buildLibraryBookCart(context: ArchitectureContext, variant: number): void {
  const { steel, aluminum, rubber, oak, white, green, red } = context.palette;
  const width = 0.72;
  const depth = 0.38;
  for (const side of [-1, 1]) {
    context.box(steel, side * width / 2, 0.55, 0, 0.035, 0.95, depth);
    context.beam(aluminum, [side * width / 2, 1.05, -depth * 0.3], [side * width / 2, 1.05, depth * 0.3], 0.018);
    for (const z of [-depth * 0.4, depth * 0.4]) context.beam(rubber, [side * width / 2 - 0.02, 0.05, z], [side * width / 2 + 0.02, 0.05, z], 0.05);
  }
  for (const y of [0.2, 0.58, 0.96]) {
    context.box(oak, 0, y, 0, width, 0.025, depth);
    context.box(steel, 0, y + 0.08, -depth / 2, width, 0.16, 0.018);
    for (let book = 0; book < 12; book++) {
      const x = -width * 0.43 + book * width * 0.075;
      const height = 0.16 + (book + variant) % 4 * 0.02;
      context.box(book % 3 === 0 ? green : book % 3 === 1 ? red : white, x, y + height / 2 + 0.015, 0, 0.035, height, depth * 0.65);
      context.box(white, x, y + height * 0.7, depth * 0.33, 0.027, 0.008, 0.003);
    }
  }
}

export function buildLetterpress(context: ArchitectureContext, phase: number): Animation {
  const { steel, dark, aluminum, green, white, bronze } = context.palette;
  context.box(green, 0, 0.09, 0, 0.65, 0.18, 0.68);
  for (const side of [-1, 1]) {
    context.box(green, side * 0.23, 0.47, -0.1, 0.1, 0.76, 0.42);
    context.beam(steel, [side * 0.23, 0.8, -0.1], [side * 0.23, 1.05, 0.2], 0.03);
  }
  context.box(steel, 0, 0.92, 0.2, 0.55, 0.08, 0.4);
  context.box(aluminum, 0, 0.97, 0.2, 0.48, 0.015, 0.34);
  context.box(white, 0, 0.98, 0.2, 0.34, 0.002, 0.25);
  const platen = context.moving("Letterpress platen", [0, 0.82, -0.05], moving => {
    moving.box(dark, 0, 0.18, 0.17, 0.5, 0.07, 0.36);
    moving.box(aluminum, 0, 0.135, 0.17, 0.46, 0.015, 0.32);
    for (const side of [-1, 1]) moving.beam(steel, [side * 0.2, 0, 0], [side * 0.2, 0.18, 0.17], 0.025);
  });
  const wheel = context.moving("Letterpress flywheel", [0.4, 0.6, -0.1], moving => {
    const geometry = moving.geometry(new THREE.TorusGeometry(0.25, 0.025, 8, 24));
    geometry.rotateY(Math.PI / 2);
    moving.part(steel, geometry, [0, 0, 0]);
    for (let spoke = 0; spoke < 5; spoke++) {
      const angle = spoke * Math.PI * 2 / 5;
      moving.beam(steel, [0, 0, 0], [0, Math.sin(angle) * 0.25, Math.cos(angle) * 0.25], 0.015);
    }
    moving.beam(bronze, [-0.05, 0, 0], [0.05, 0, 0], 0.04);
  });
  context.disc(dark, 0, 1.12, -0.17, 0.19, 0.02);
  context.beam(steel, [-0.22, 1.07, -0.18], [0.22, 1.07, -0.18], 0.035);
  return (seconds, night) => {
    const turn = night ? 0 : (seconds + phase) * 0.9;
    wheel.rotation.x = turn;
    platen.rotation.x = -0.6 + (Math.cos(turn) + 1) * 0.3;
  };
}

export function buildBookbindingPress(context: ArchitectureContext, phase: number): Animation {
  const { oak, steel, aluminum, red, white } = context.palette;
  context.box(oak, 0, 0.045, 0, 0.5, 0.09, 0.45);
  for (const side of [-1, 1]) context.disc(steel, side * 0.2, 0.3, 0, 0.015, 0.5);
  context.box(steel, 0, 0.55, 0, 0.5, 0.05, 0.12);
  const platen = context.moving("Bookbinding pressure platen", [0, 0.25, 0], moving => {
    moving.box(oak, 0, 0, 0, 0.47, 0.055, 0.42);
    moving.disc(aluminum, 0, 0.14, 0, 0.018, 0.28);
    moving.beam(steel, [-0.17, 0.3, 0], [0.17, 0.3, 0], 0.014);
  });
  const baseY = platen.position.y;
  for (let book = 0; book < 4; book++) {
    context.box(white, 0, 0.105 + book * 0.022, 0, 0.29, 0.018, 0.34);
    context.box(red, 0, 0.116 + book * 0.022, 0, 0.3, 0.004, 0.35);
  }
  return seconds => { platen.position.y = baseY - openingPulse(seconds, 45, phase, 20, 3) * 0.045; };
}

export function buildPaperGuillotine(context: ArchitectureContext, phase: number): Animation {
  const { aluminum, white, dark, steel, yellow } = context.palette;
  context.box(aluminum, 0, 0.045, 0, 0.56, 0.09, 0.48);
  context.box(white, 0, 0.095, 0, 0.52, 0.01, 0.44);
  for (let line = 0; line < 9; line++) {
    context.box(dark, -0.22 + line * 0.055, 0.102, 0, 0.001, 0.001, 0.42);
    context.box(dark, 0, 0.102, -0.2 + line * 0.05, 0.5, 0.001, 0.001);
  }
  context.box(white, -0.02, 0.12, 0, 0.3, 0.035, 0.35);
  context.box(yellow, 0.21, 0.18, 0, 0.03, 0.16, 0.46);
  const blade = context.moving("Guarded paper guillotine handle", [0.24, 0.12, -0.22], moving => {
    moving.box(steel, 0, 0, 0.22, 0.018, 0.08, 0.44);
    moving.box(dark, 0, 0.02, 0.5, 0.045, 0.045, 0.14);
  });
  return seconds => { blade.rotation.x = -openingPulse(seconds, 30, phase, 4, 0.8) * 0.7; };
}

export function buildLargeFormatPrinter(context: ArchitectureContext, phase: number): Animation[] {
  const { dark, aluminum, white, steel, green } = context.palette;
  const width = 1.1;
  context.box(dark, 0, 0.98, 0, width, 0.28, 0.38);
  context.box(aluminum, 0, 1.13, -0.06, width - 0.12, 0.035, 0.25);
  for (const side of [-1, 1]) {
    context.box(steel, side * width * 0.4, 0.51, 0, 0.04, 0.78, 0.04);
    context.box(steel, side * width * 0.4, 0.12, 0, 0.05, 0.04, 0.5);
    for (const z of [-0.21, 0.21]) context.beam(dark, [side * width * 0.4 - 0.02, 0.06, z], [side * width * 0.4 + 0.02, 0.06, z], 0.05);
  }
  context.beam(white, [-0.42, 0.73, -0.12], [0.42, 0.73, -0.12], 0.08);
  context.beam(aluminum, [-0.5, 1.01, 0.04], [0.5, 1.01, 0.04], 0.008);
  const carriage = context.moving("Wide-format print carriage", [-0.4, 1.02, 0.05], moving => {
    moving.box(dark, 0, 0, 0, 0.12, 0.12, 0.16);
    moving.box(green, 0, 0.065, 0, 0.06, 0.008, 0.05);
  });
  const paper = context.moving("Wide-format print output", [0, 0.94, 0.2], moving => {
    moving.box(white, 0, -0.23, 0, 0.82, 0.46, 0.002);
    for (let band = 0; band < 6; band++) moving.box(band % 2 ? context.palette.green : context.palette.bronze, 0, -0.06 - band * 0.06, 0.003, 0.72, 0.035, 0.001);
  });
  const origin = carriage.position.clone();
  const direction = new THREE.Vector3(Math.cos(context.local.yaw ?? 0), 0, -Math.sin(context.local.yaw ?? 0));
  const display = buildDigitalNumber(context.at({ x: width * 0.37, y: 1.02, z: 0.205 }), 2, 0.017);
  return [(seconds, night) => {
    const cycle = THREE.MathUtils.euclideanModulo(seconds + phase, 40);
    const printing = !night && cycle < 28;
    const travel = printing ? (Math.sin(seconds * 2.2) + 1) / 2 : 0;
    carriage.position.copy(origin).addScaledVector(direction, travel * 0.8);
    paper.scale.y = Math.max(0.02, Math.min(1, cycle / 28));
    display.set(Math.min(99, Math.floor(cycle / 28 * 99)));
  }];
}

export function buildBookRestorationTable(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, phase: number): Animation[] {
  const { oak, aluminum, white, dark, green } = context.palette;
  context.box(materials.timber, 0, 0.81, 0, width, 0.055, 0.85);
  for (const side of [-1, 1]) context.box(oak, side * width * 0.41, 0.4, 0, 0.06, 0.8, 0.7);
  context.box(green, 0, 0.842, 0, width * 0.55, 0.004, 0.65);
  buildOpenBook(context.at({ x: -width * 0.15, y: 0.845, z: 0 }), 0.34, 0.28, context.palette.red, 0.015);
  context.box(white, width * 0.2, 0.85, 0.1, 0.22, 0.01, 0.3);
  context.beam(aluminum, [width * 0.32, 0.85, -0.2], [width * 0.32, 0.85, 0.22], 0.005);
  context.beam(oak, [width * 0.16, 0.86, -0.15], [width * 0.27, 0.86, -0.23], 0.006);
  context.oval(white, width * 0.285, 0.86, -0.24, 0.024, 0.005, 0.015);
  context.disc(white, width * 0.37, 0.89, -0.22, 0.028, 0.08);
  context.disc(dark, width * 0.37, 0.935, -0.22, 0.03, 0.012);
  const animations: Animation[] = [];
  if (width > 1.5) animations.push(buildPaperGuillotine(context.at({ x: -width * 0.37, y: 0.84, z: -0.06, yaw: Math.PI / 2 }), phase));
  return animations;
}

export function buildBookshopWorkshop(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, phase: number): Animation[] {
  const animations: Animation[] = [];
  const back = -depth / 2 + 0.42;
  buildBookshelf(context.at({ x: -width * 0.3, y: 0, z: -depth / 2 + 0.18 }), width * 0.3, 2.3, 0.3, phase);
  buildLibraryLadder(context.at({ x: -width * 0.3, y: 0, z: back + 0.18 }), 1.9);
  animations.push(...buildBookRestorationTable(context.at({ x: width * 0.1, y: 0, z: back }), materials, Math.min(2.1, width * 0.38), phase));
  buildTaskChair(context.at({ x: width * 0.1, y: 0, z: back + 0.85, yaw: Math.PI }), materials);
  buildLibraryBookCart(context.at({ x: width * 0.4, y: 0, z: depth * 0.2 }), phase);
  if (depth > 3) {
    animations.push(buildLetterpress(context.at({ x: -width * 0.32, y: 0, z: depth * 0.2 }), phase));
    animations.push(...buildLargeFormatPrinter(context.at({ x: width * 0.28, y: 0, z: depth * 0.2 }), phase));
    context.box(context.palette.oak, 0, 0.72, depth * 0.25, 0.8, 0.05, 0.65);
    for (const side of [-1, 1]) context.box(context.palette.oak, side * 0.3, 0.36, depth * 0.25, 0.05, 0.72, 0.5);
    animations.push(buildBookbindingPress(context.at({ x: 0, y: 0.75, z: depth * 0.25 }), phase));
  } else {
    buildReadingLectern(context.at({ x: -width * 0.05, y: 0, z: depth * 0.22 }), 0.55);
    buildDiningChair(context.at({ x: -width * 0.25, y: 0, z: depth * 0.25 }), materials);
  }
  return animations;
}
