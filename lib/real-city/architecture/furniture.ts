import * as THREE from "three";
import { ArchitectureContext } from "./context";
import type { ArchitecturalMaterials } from "./materials";

export function buildDiningChair(context: ArchitectureContext, materials: ArchitecturalMaterials, upholstered = false): void {
  const { oak, steel } = context.palette;
  context.roundedBox(upholstered ? materials.upholstery : oak, 0, 0.46, 0, 0.44, 0.065, 0.43, 0.075);
  for (const side of [-1, 1]) {
    context.rectangularBeam(oak, [side * 0.16, 0.03, 0.15], [side * 0.145, 0.43, 0.14], 0.035, 0.035);
    context.rectangularBeam(oak, [side * 0.16, 0.03, -0.17], [side * 0.16, 0.84, -0.23], 0.035, 0.035);
    context.box(oak, side * 0.15, 0.32, -0.01, 0.025, 0.025, 0.34);
  }
  context.box(oak, 0, 0.32, -0.15, 0.32, 0.025, 0.025);
  context.roundedBox(upholstered ? materials.upholstery : oak, 0, 0.71, -0.215, 0.39, 0.2, 0.045, 0.035);
  for (const side of [-1, 1]) context.box(steel, side * 0.15, 0.49, -0.18, 0.018, 0.018, 0.015);
}

export function buildCafeTable(context: ArchitectureContext, radius = 0.42): void {
  const { oak, steel, rubber } = context.palette;
  context.disc(oak, 0, 0.75, 0, radius, 0.045);
  context.disc(steel, 0, 0.72, 0, radius * 0.55, 0.04);
  context.disc(steel, 0, 0.39, 0, 0.035, 0.65);
  context.disc(steel, 0, 0.065, 0, 0.24, 0.055);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) context.disc(rubber, Math.cos(angle) * 0.18, 0.028, Math.sin(angle) * 0.18, 0.025, 0.015);
}

export function buildDiningTable(context: ArchitectureContext, materials: ArchitecturalMaterials, width = 1.6, depth = 0.82): void {
  const { oak, aluminum, rubber } = context.palette;
  context.roundedBox(materials.timber, 0, 0.76, 0, width, 0.055, depth, 0.07);
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.15);
    for (const back of [-1, 1]) {
      const z = back * (depth / 2 - 0.14);
      context.rectangularBeam(oak, [x + side * 0.03, 0.03, z + back * 0.03], [x, 0.73, z], 0.055, 0.055);
      context.box(rubber, x + side * 0.03, 0.022, z + back * 0.03, 0.055, 0.015, 0.055);
      context.box(aluminum, x, 0.695, z, 0.065, 0.04, 0.065);
    }
  }
  context.box(oak, 0, 0.66, 0, width - 0.22, 0.1, depth - 0.22);
}

export function buildPlaceSetting(context: ArchitectureContext): void {
  const { porcelain, aluminum, glass, fabric } = context.palette;
  context.disc(porcelain, 0, 0.015, 0, 0.125, 0.018);
  context.disc(porcelain, 0, 0.027, 0, 0.085, 0.009);
  context.box(aluminum, -0.17, 0.012, 0, 0.012, 0.009, 0.17);
  context.box(aluminum, 0.17, 0.012, 0, 0.014, 0.009, 0.18);
  for (let tine = 0; tine < 3; tine++) context.box(aluminum, -0.178 + tine * 0.008, 0.012, -0.09, 0.004, 0.006, 0.025);
  context.disc(glass, 0.13, 0.07, -0.17, 0.035, 0.12);
  context.box(fabric, -0.18, 0.008, 0.15, 0.085, 0.008, 0.12);
}

export function buildCoffeeCup(context: ArchitectureContext): void {
  const { porcelain, dark } = context.palette;
  context.disc(porcelain, 0, 0.008, 0, 0.075, 0.012);
  context.disc(porcelain, 0, 0.055, 0, 0.043, 0.08);
  context.disc(dark, 0, 0.097, 0, 0.034, 0.004);
  context.tube(porcelain, [[0.035, 0.08, 0], [0.065, 0.077, 0], [0.069, 0.045, 0], [0.035, 0.033, 0]], 0.007);
}

export function buildSofa(context: ArchitectureContext, materials: ArchitecturalMaterials, width = 1.9): void {
  const { oak, rubber } = context.palette;
  context.roundedBox(oak, 0, 0.23, 0, width - 0.12, 0.13, 0.78, 0.055);
  context.roundedBox(materials.upholstery, 0, 0.42, 0.04, width - 0.25, 0.22, 0.72, 0.085);
  context.roundedBox(materials.upholstery, 0, 0.7, -0.31, width - 0.16, 0.53, 0.22, 0.08);
  for (const side of [-1, 1]) {
    context.roundedBox(materials.upholstery, side * (width / 2 - 0.085), 0.57, 0, 0.19, 0.42, 0.83, 0.07);
    for (const rear of [-1, 1]) {
      context.box(oak, side * (width / 2 - 0.22), 0.12, rear * 0.29, 0.065, 0.2, 0.065);
      context.box(rubber, side * (width / 2 - 0.22), 0.022, rear * 0.29, 0.065, 0.014, 0.065);
    }
  }
  const cushions = Math.max(2, Math.round(width / 0.62));
  for (let cushion = 0; cushion < cushions; cushion++) {
    const cushionWidth = (width - 0.4) / cushions;
    const x = (cushion - (cushions - 1) / 2) * cushionWidth;
    context.roundedBox(materials.upholstery, x, 0.545, 0.06, cushionWidth - 0.014, 0.045, 0.61, 0.045);
  }
  context.roundedBox(context.palette.fabric, -width * 0.28, 0.73, -0.15, 0.31, 0.32, 0.11, 0.05, -0.14);
}

export function buildCoffeeTable(context: ArchitectureContext, materials: ArchitecturalMaterials): void {
  const { oak, steel } = context.palette;
  context.roundedBox(materials.timber, 0, 0.42, 0, 0.95, 0.045, 0.52, 0.12);
  for (const side of [-1, 1]) {
    const x = side * 0.34;
    context.beam(steel, [x, 0.03, -0.14], [x, 0.4, -0.14], 0.018);
    context.beam(steel, [x, 0.03, 0.14], [x, 0.4, 0.14], 0.018);
    context.box(oak, x, 0.06, 0, 0.06, 0.03, 0.35);
  }
  context.box(context.palette.white, -0.2, 0.455, 0.04, 0.23, 0.025, 0.16, 0.16);
  context.box(context.palette.green, -0.2, 0.47, 0.04, 0.235, 0.005, 0.165, 0.16);
}

export function buildBookshelf(context: ArchitectureContext, width: number, height: number, depth: number, salt: number): void {
  const { oak, dark, red, green, white, yellow, fabric } = context.palette;
  context.box(dark, 0, height / 2, -depth / 2, width, height, 0.025);
  for (const side of [-1, 1]) context.box(oak, side * width / 2, height / 2, 0, 0.04, height, depth);
  const levels = Math.max(2, Math.floor(height / 0.34));
  const spacing = height / levels;
  for (let shelf = 0; shelf <= levels; shelf++) context.box(oak, 0, shelf * spacing + 0.02, 0, width + 0.04, 0.04, depth);
  for (let shelf = 0; shelf < levels; shelf++) {
    let cursor = -width / 2 + 0.055;
    let book = 0;
    while (cursor < width / 2 - 0.08) {
      const hash = Math.abs(Math.sin((salt + shelf * 13 + book * 7) * 18.12));
      const thickness = 0.025 + hash * 0.038;
      const bookHeight = spacing * (0.62 + hash * 0.25);
      const material = [red, green, white, yellow, fabric][(book + shelf + salt) % 5];
      context.box(material, cursor + thickness / 2, shelf * spacing + 0.05 + bookHeight / 2, depth * 0.06, thickness, bookHeight, depth * 0.72);
      context.box(white, cursor + thickness / 2, shelf * spacing + 0.05 + bookHeight * 0.76, depth * 0.43, thickness * 0.56, 0.013, 0.006);
      cursor += thickness + 0.007;
      book++;
    }
  }
}

export function buildBed(context: ArchitectureContext, materials: ArchitecturalMaterials, double = true): void {
  const width = double ? 1.52 : 0.92;
  const { oak, white, fabric } = context.palette;
  context.roundedBox(oak, 0, 0.25, 0, width + 0.1, 0.16, 2.08, 0.05);
  context.roundedBox(white, 0, 0.45, 0, width, 0.24, 1.98, 0.1);
  context.roundedBox(fabric, 0, 0.59, 0.25, width + 0.02, 0.05, 1.48, 0.08);
  context.roundedBox(materials.upholstery, 0, 0.76, -1.02, width + 0.12, 0.86, 0.1, 0.045);
  const pillows = double ? 2 : 1;
  for (let pillow = 0; pillow < pillows; pillow++) {
    const x = double ? (pillow - 0.5) * 0.65 : 0;
    context.roundedBox(white, x, 0.62, -0.67, 0.58, 0.13, 0.36, 0.1);
  }
  for (const side of [-1, 1]) for (const end of [-1, 1]) context.box(oak, side * (width / 2 - 0.08), 0.105, end * 0.85, 0.08, 0.21, 0.08);
}

export function buildNightstand(context: ArchitectureContext, materials: ArchitecturalMaterials): void {
  const { oak, aluminum, porcelain, warmLight } = context.palette;
  context.box(oak, 0, 0.3, 0, 0.42, 0.54, 0.37);
  context.box(materials.timber, 0, 0.58, 0, 0.44, 0.035, 0.39);
  for (const y of [0.19, 0.42]) {
    context.box(oak, 0, y, 0.193, 0.39, 0.2, 0.02);
    context.box(aluminum, 0, y + 0.03, 0.22, 0.12, 0.014, 0.025);
  }
  context.disc(porcelain, 0, 0.625, 0, 0.09, 0.05);
  context.disc(aluminum, 0, 0.73, 0, 0.012, 0.21);
  const shade = context.geometry(new THREE.ConeGeometry(0.14, 0.2, 16, 1, true));
  context.part(porcelain, shade, [0, 0.89, 0]);
  context.oval(warmLight, 0, 0.85, 0, 0.028, 0.038, 0.028);
}

export function buildWardrobe(context: ArchitectureContext, width: number, height: number, sliding = true): void {
  const { oak, white, aluminum, dark } = context.palette;
  context.box(oak, 0, height / 2, -0.02, width, height, 0.6);
  const leaves = Math.max(2, Math.ceil(width / 0.6));
  const leafWidth = width / leaves;
  for (let leaf = 0; leaf < leaves; leaf++) {
    const x = -width / 2 + (leaf + 0.5) * leafWidth;
    const z = 0.29 + (sliding && leaf % 2 ? 0.035 : 0);
    context.box(white, x, height / 2, z, leafWidth - 0.018, height - 0.04, 0.03);
    context.box(aluminum, x + leafWidth / 2 - 0.045, height * 0.5, z + 0.035, 0.018, 0.32, 0.035);
  }
  context.box(dark, 0, 0.065, 0.28, width - 0.03, 0.08, 0.035);
  context.box(aluminum, 0, height - 0.015, 0.31, width, 0.03, 0.04);
}

export function buildOfficeDesk(context: ArchitectureContext, materials: ArchitecturalMaterials, width = 1.4): void {
  const { steel, aluminum, dark, white } = context.palette;
  context.roundedBox(materials.timber, 0, 0.74, 0, width, 0.035, 0.7, 0.04);
  for (const side of [-1, 1]) {
    context.box(steel, side * (width / 2 - 0.12), 0.36, 0, 0.055, 0.72, 0.055);
    context.box(steel, side * (width / 2 - 0.12), 0.035, 0, 0.07, 0.05, 0.58);
  }
  context.box(steel, 0, 0.65, -0.12, width - 0.18, 0.07, 0.055);
  context.box(dark, 0.12, 1.035, -0.2, 0.57, 0.34, 0.035);
  context.box(context.palette.screen, 0.12, 1.035, -0.177, 0.535, 0.3, 0.009);
  context.box(aluminum, 0.12, 0.84, -0.22, 0.035, 0.18, 0.03);
  context.box(aluminum, 0.12, 0.765, -0.18, 0.19, 0.018, 0.15);
  context.box(dark, 0.08, 0.765, 0.11, 0.34, 0.018, 0.13);
  for (let row = 0; row < 3; row++) for (let column = 0; column < 8; column++) context.box(aluminum, -0.06 + column * 0.04, 0.778, 0.075 + row * 0.035, 0.025, 0.004, 0.022);
  context.oval(dark, 0.4, 0.78, 0.12, 0.035, 0.02, 0.055);
  context.box(white, -width * 0.32, 0.765, 0.07, 0.18, 0.015, 0.24, -0.12);
  context.tube(dark, [[0.12, 0.85, -0.23], [0.2, 0.7, -0.28], [0.23, 0.52, -0.25]], 0.004);
}

export function buildTaskChair(context: ArchitectureContext, materials: ArchitecturalMaterials): void {
  const { steel, rubber, aluminum } = context.palette;
  context.roundedBox(materials.upholstery, 0, 0.49, 0, 0.46, 0.075, 0.44, 0.08);
  context.roundedBox(materials.upholstery, 0, 0.78, -0.2, 0.4, 0.48, 0.055, 0.055);
  context.box(steel, 0, 0.62, -0.23, 0.07, 0.25, 0.045);
  context.disc(aluminum, 0, 0.29, 0, 0.025, 0.32);
  for (let leg = 0; leg < 5; leg++) {
    const angle = leg * Math.PI * 2 / 5;
    const x = Math.cos(angle) * 0.26;
    const z = Math.sin(angle) * 0.26;
    context.beam(steel, [0, 0.13, 0], [x, 0.08, z], 0.022);
    context.oval(rubber, x, 0.055, z, 0.035, 0.035, 0.025);
  }
  for (const side of [-1, 1]) {
    context.box(steel, side * 0.26, 0.56, 0, 0.025, 0.2, 0.025);
    context.roundedBox(rubber, side * 0.26, 0.67, 0.015, 0.06, 0.035, 0.25, 0.025);
  }
}
