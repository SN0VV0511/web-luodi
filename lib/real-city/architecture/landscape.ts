import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildExteriorBollard } from "./lighting";

export function buildPottedPlant(context: ArchitectureContext, height = 0.8, spread = 0.32): void {
  const { clay, dark, green, oak } = context.palette;
  const potRadius = Math.max(0.09, spread * 0.6);
  const potHeight = Math.max(0.15, height * 0.28);
  const profile = [new THREE.Vector2(potRadius * 0.7, 0), new THREE.Vector2(potRadius * 0.77, potHeight * 0.84), new THREE.Vector2(potRadius, potHeight * 0.94), new THREE.Vector2(potRadius, potHeight), new THREE.Vector2(potRadius * 0.88, potHeight)];
  const pot = context.geometry(new THREE.LatheGeometry(profile, 16));
  context.part(clay, pot, [0, 0, 0]);
  context.disc(dark, 0, potHeight * 0.94, 0, potRadius * 0.87, 0.015);
  context.beam(oak, [0, potHeight, 0], [0, height, 0], 0.009);
  for (let leaf = 0; leaf < 9; leaf++) {
    const angle = leaf * 2.399963;
    const y = potHeight + (height - potHeight) * (0.28 + leaf * 0.07);
    const radius = spread * (0.52 + Math.sin(leaf * 1.6) * 0.2);
    const tipX = Math.cos(angle) * radius;
    const tipZ = Math.sin(angle) * radius;
    const crossX = -Math.sin(angle) * radius * 0.24;
    const crossZ = Math.cos(angle) * radius * 0.24;
    context.beam(oak, [0, y, 0], [tipX * 0.45, y + 0.03, tipZ * 0.45], 0.004);
    context.panel(green, [[0, y, 0], [tipX * 0.5 + crossX, y + 0.06, tipZ * 0.5 + crossZ], [tipX, y - 0.025, tipZ], [tipX * 0.5 - crossX, y + 0.035, tipZ * 0.5 - crossZ]]);
  }
}

export function buildPlanterBox(context: ArchitectureContext, width: number, depth: number, height = 0.5): void {
  const { limestone, dark, green, oak } = context.palette;
  context.box(limestone, 0, height / 2, 0, width, height, depth);
  context.box(dark, 0, height + 0.005, 0, width - 0.12, 0.02, depth - 0.12);
  const plants = Math.max(2, Math.ceil(width / 0.28));
  for (let plant = 0; plant < plants; plant++) {
    const x = -width / 2 + (plant + 0.5) * width / plants;
    const stalkHeight = 0.19 + Math.abs(Math.sin(plant * 2.3)) * 0.22;
    context.beam(oak, [x, height, 0], [x, height + stalkHeight, 0], 0.004);
    for (let blade = 0; blade < 5; blade++) {
      const angle = blade * Math.PI * 2 / 5 + plant;
      const dx = Math.cos(angle) * 0.13;
      const dz = Math.sin(angle) * Math.min(0.13, depth * 0.3);
      context.panel(green, [[x, height + stalkHeight * 0.45, 0], [x + dx * 0.5 - dz * 0.16, height + stalkHeight * 0.9, dz * 0.5 + dx * 0.16], [x + dx, height + stalkHeight, dz], [x + dx * 0.5 + dz * 0.16, height + stalkHeight * 0.9, dz * 0.5 - dx * 0.16]]);
    }
  }
}

export function buildSlattedBench(context: ArchitectureContext, length = 1.8, back = true): void {
  const { oak, steel } = context.palette;
  for (let slat = 0; slat < 5; slat++) context.roundedBox(oak, 0, 0.46, -0.18 + slat * 0.09, length, 0.045, 0.065, 0.018);
  for (const side of [-1, 1]) {
    const x = side * length * 0.35;
    context.box(steel, x, 0.23, 0, 0.07, 0.46, 0.35);
    context.box(steel, x, 0.025, 0, 0.22, 0.05, 0.5);
    if (back) context.rectangularBeam(steel, [x, 0.38, -0.21], [x, 0.89, -0.28], 0.045, 0.055);
  }
  if (back) {
    for (let slat = 0; slat < 4; slat++) context.box(oak, 0, 0.59 + slat * 0.09, -0.235 - slat * 0.012, length, 0.065, 0.035);
  }
}

export function buildLitterBin(context: ArchitectureContext, recycling = false): void {
  const { steel, aluminum, dark, green } = context.palette;
  context.roundedBox(steel, 0, 0.42, 0, 0.4, 0.84, 0.36, 0.055);
  context.box(dark, 0, 0.69, 0.189, 0.28, 0.14, 0.015);
  context.box(aluminum, 0, 0.79, 0.2, 0.34, 0.025, 0.1);
  context.box(recycling ? green : aluminum, 0, 0.44, 0.19, 0.12, 0.12, 0.012);
  for (let rib = 0; rib < 6; rib++) context.box(aluminum, -0.15 + rib * 0.06, 0.35, 0.187, 0.012, 0.45, 0.01);
}

export function buildBicycleRack(context: ArchitectureContext, spaces: number): void {
  const { aluminum, steel } = context.palette;
  for (let space = 0; space < spaces; space++) {
    const x = (space - (spaces - 1) / 2) * 0.65;
    context.tube(aluminum, [[x, 0.035, -0.3], [x, 0.64, -0.3], [x, 0.77, -0.18], [x, 0.77, 0.18], [x, 0.64, 0.3], [x, 0.035, 0.3]], 0.025);
    for (const side of [-1, 1]) context.box(steel, x, 0.02, side * 0.3, 0.14, 0.04, 0.14);
  }
}

export function buildPool(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation {
  const { limestone, water, aluminum, white } = context.palette;
  context.box(materials.tealTile, 0, -0.025, 0, width, 0.035, depth);
  for (const side of [-1, 1]) {
    context.box(limestone, 0, 0.025, side * depth / 2, width + 0.4, 0.05, 0.24);
    context.box(limestone, side * width / 2, 0.025, 0, 0.24, 0.05, depth);
  }
  const surface = context.moving("Courtyard pool surface", [0, 0.025, 0], (moving) => {
    moving.box(water, 0, 0, 0, width - 0.16, 0.012, depth - 0.16);
  });
  for (const side of [-1, 1]) {
    const x = side * 0.2;
    context.tube(aluminum, [[x, -0.16, depth / 2 - 0.18], [x, 0.4, depth / 2 - 0.18], [x, 0.5, depth / 2 - 0.02], [x, 0.4, depth / 2 + 0.18], [x, 0.03, depth / 2 + 0.18]], 0.018);
  }
  for (let step = 0; step < 3; step++) context.box(aluminum, 0, -0.02 - step * 0.1, depth / 2 - 0.18, 0.4, 0.025, 0.06);
  context.box(white, -width * 0.28, 0.065, -depth / 2 - 0.14, 0.25, 0.02, 0.12);
  return (seconds, _night, season) => {
    surface.position.y = context.local.y + 0.025 + Math.sin(seconds * 0.7) * 0.002;
    surface.visible = season !== "winter";
  };
}

export function buildSunLounger(context: ArchitectureContext): void {
  const { oak, fabric, steel } = context.palette;
  context.roundedBox(fabric, 0, 0.27, 0.2, 0.59, 0.05, 1.2, 0.035);
  context.panel(fabric, [[-0.295, 0.29, -0.4], [0.295, 0.29, -0.4], [0.295, 0.66, -0.94], [-0.295, 0.66, -0.94]]);
  for (const side of [-1, 1]) {
    context.box(oak, side * 0.31, 0.23, 0.18, 0.045, 0.06, 1.27);
    context.rectangularBeam(oak, [side * 0.31, 0.25, -0.43], [side * 0.31, 0.64, -0.97], 0.04, 0.045);
    for (const z of [-0.27, 0.62]) context.box(steel, side * 0.25, 0.12, z, 0.025, 0.24, 0.025);
  }
}

export function buildCourtyardPaving(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, pathWidth: number): void {
  const { concrete } = context.palette;
  context.box(concrete, 0, -0.025, 0, width, 0.05, depth);
  context.box(materials.terrazzo, 0, 0.009, 0, pathWidth, 0.018, depth - 0.2);
  context.box(materials.terrazzo, 0, 0.012, depth * 0.27, width - 0.2, 0.018, pathWidth);
  for (const side of [-1, 1]) {
    buildExteriorBollard(context.at({ x: side * (pathWidth / 2 + 0.3), y: 0.03, z: depth * 0.25 }));
    buildPlanterBox(context.at({ x: side * width * 0.32, y: 0.03, z: -depth * 0.25 }), width * 0.24, depth * 0.25, 0.3);
  }
}
