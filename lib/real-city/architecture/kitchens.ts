import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDetailedKitchenCasework } from "./domestic-casework";
import { buildHollowKitchenSink, buildKitchenTapOperation } from "./domestic-water-fixtures";
import { buildDetailedDishwasher } from "./domestic-dishwasher";

export function buildWallCabinets(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, glassDoors = false): void {
  const { oak, white, glass, aluminum, dark } = context.palette;
  const count = Math.max(1, Math.round(width / 0.6));
  const bay = width / count;
  context.box(oak, 0, 0.36, -0.02, width, 0.72, 0.32);
  for (let cabinet = 0; cabinet < count; cabinet++) {
    const x = -width / 2 + (cabinet + 0.5) * bay;
    const material = glassDoors ? glass : white;
    context.box(material, x, 0.36, 0.15, bay - 0.018, 0.69, 0.025);
    if (glassDoors) {
      for (const side of [-1, 1]) context.box(aluminum, x + side * (bay / 2 - 0.025), 0.36, 0.165, 0.025, 0.69, 0.025);
      context.box(aluminum, x, 0.02, 0.165, bay - 0.02, 0.025, 0.025);
      context.box(aluminum, x, 0.7, 0.165, bay - 0.02, 0.025, 0.025);
      context.box(dark, x, 0.35, 0.03, bay - 0.03, 0.025, 0.23);
    }
    context.box(aluminum, x + bay / 2 - 0.055, 0.17, 0.19, 0.012, 0.14, 0.025);
  }
  context.box(context.palette.warmLight, 0, -0.015, 0.08, width - 0.08, 0.015, 0.025);
  context.box(materials.tealTile, 0, -0.27, -0.16, width + 0.02, 0.5, 0.02);
}

export function buildSink(context: ArchitectureContext, width = 0.54, depth = 0.42): void {
  const { aluminum, dark, water } = context.palette;
  context.roundedBox(aluminum, 0, 0.008, 0, width, 0.025, depth, 0.065);
  context.roundedBox(dark, 0, 0.025, 0, width - 0.045, 0.014, depth - 0.045, 0.05);
  context.roundedBox(aluminum, 0, -0.055, 0, width - 0.06, 0.14, depth - 0.06, 0.055);
  context.roundedBox(water, 0, 0.027, 0, width - 0.08, 0.006, depth - 0.08, 0.05);
  context.disc(dark, 0, 0.031, 0.035, 0.022, 0.005);
  context.tube(aluminum, [[0, 0.02, -depth / 2 + 0.025], [0, 0.25, -depth / 2 + 0.025], [0, 0.28, -0.045], [0, 0.21, 0]], 0.014);
  context.disc(aluminum, 0, 0.04, -depth / 2 + 0.025, 0.026, 0.065);
  context.beam(aluminum, [0.026, 0.075, -depth / 2 + 0.025], [0.1, 0.1, -depth / 2 + 0.025], 0.006);
}

export function buildInductionHob(context: ArchitectureContext, width = 0.57, depth = 0.49): void {
  const { dark, aluminum, red } = context.palette;
  context.roundedBox(dark, 0, 0.012, 0, width, 0.024, depth, 0.025);
  for (const x of [-width * 0.24, width * 0.24]) {
    for (const z of [-depth * 0.21, depth * 0.21]) {
      const geometry = context.geometry(new THREE.TorusGeometry(0.085, 0.0016, 4, 24));
      geometry.rotateX(Math.PI / 2);
      context.part(aluminum, geometry, [x, 0.026, z]);
    }
  }
  for (let button = 0; button < 4; button++) context.box(red, -0.09 + button * 0.06, 0.027, depth * 0.4, 0.015, 0.003, 0.006);
}

export function buildExtractorHood(context: ArchitectureContext, width = 0.68): void {
  const { aluminum, dark, warmLight } = context.palette;
  context.profile(aluminum, [[-width / 2, 0], [width / 2, 0], [width * 0.25, 0.2], [-width * 0.25, 0.2]], 0.48, [0, 0, -0.24]);
  context.box(aluminum, 0, 0.49, -0.1, width * 0.48, 0.58, 0.26);
  context.box(dark, 0, -0.008, 0, width * 0.86, 0.018, 0.38);
  for (let filter = 0; filter < 8; filter++) context.box(aluminum, -width * 0.4 + filter * width * 0.115, -0.02, 0, 0.015, 0.008, 0.32);
  for (const side of [-1, 1]) context.disc(warmLight, side * width * 0.32, -0.025, 0.13, 0.028, 0.012);
}

export function buildOven(context: ArchitectureContext): void {
  const { aluminum, dark, glass, white, screen } = context.palette;
  context.box(aluminum, 0, 0.3, 0, 0.595, 0.59, 0.56);
  context.box(dark, 0, 0.28, 0.289, 0.535, 0.405, 0.02);
  context.box(glass, 0, 0.28, 0.305, 0.455, 0.3, 0.012);
  context.box(aluminum, 0, 0.47, 0.325, 0.42, 0.025, 0.045);
  context.box(screen, 0, 0.555, 0.295, 0.12, 0.035, 0.014);
  for (const side of [-1, 1]) context.oval(aluminum, side * 0.19, 0.55, 0.3, 0.025, 0.025, 0.018);
  context.box(white, 0, 0.155, 0.325, 0.18, 0.14, 0.018);
}

export function buildRefrigerator(context: ArchitectureContext, materials: ArchitecturalMaterials, height = 1.82): void {
  const { aluminum, dark, white } = context.palette;
  context.roundedBox(white, 0, height / 2, 0, 0.62, height, 0.64, 0.04);
  context.box(materials.ribbedMetal, 0, height * 0.62, 0.333, 0.595, height * 0.72, 0.025);
  context.box(materials.ribbedMetal, 0, height * 0.12, 0.333, 0.595, height * 0.22, 0.025);
  context.box(dark, 0, height * 0.245, 0.35, 0.61, 0.009, 0.008);
  context.box(aluminum, -0.24, height * 0.57, 0.37, 0.018, 0.35, 0.045);
  context.box(aluminum, -0.24, height * 0.15, 0.37, 0.018, 0.16, 0.045);
  context.box(dark, 0, 0.04, 0.3, 0.54, 0.06, 0.03);
  for (let vent = 0; vent < 6; vent++) context.box(aluminum, -0.22 + vent * 0.088, 0.04, 0.32, 0.012, 0.04, 0.008);
}

export function buildCoffeeMachine(context: ArchitectureContext, commercial = false): Animation {
  const { aluminum, dark, red, porcelain, warmLight } = context.palette;
  const width = commercial ? 0.72 : 0.3;
  const height = commercial ? 0.48 : 0.34;
  context.roundedBox(aluminum, 0, height / 2, 0, width, height, 0.34, 0.035);
  context.box(dark, 0, height * 0.26, 0.185, width * 0.92, height * 0.46, 0.035);
  context.box(aluminum, 0, 0.035, 0.23, width + 0.02, 0.055, 0.13);
  const groups = commercial ? 2 : 1;
  for (let group = 0; group < groups; group++) {
    const x = (group - (groups - 1) / 2) * width * 0.42;
    context.disc(aluminum, x, height * 0.65, 0.18, 0.035, 0.08);
    context.beam(dark, [x, height * 0.62, 0.18], [x, height * 0.62, 0.3], 0.013);
    context.disc(porcelain, x, 0.105, 0.22, 0.032, 0.07);
    context.box(red, x, height * 0.87, 0.175, 0.018, 0.018, 0.012);
  }
  context.tube(aluminum, [[width * 0.4, height * 0.6, 0.17], [width * 0.46, height * 0.45, 0.24], [width * 0.46, 0.12, 0.24]], 0.008);
  for (let slot = 0; slot < 7; slot++) context.box(dark, -width * 0.4 + slot * width * 0.13, 0.065, 0.23, 0.012, 0.006, 0.09);
  const lamp = context.moving("Espresso brew indicator", [0, height * 0.88, 0.18], (moving) => {
    moving.oval(warmLight, 0, 0, 0, 0.012, 0.012, 0.004);
  });
  return (seconds) => {
    lamp.visible = openingPulse(seconds, 42, 6, 9, 0.1) > 0.5;
  };
}

export function buildKitchenCounter(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, dishwasher = false): Animation[] {
  const dishwasherX = dishwasher && width > 2.8 ? -width / 2 + 0.33 : undefined;
  const cabinetAnimations = buildDetailedKitchenCasework(context, materials, width, 0.9, dishwasherX);
  if (dishwasherX !== undefined) cabinetAnimations.push(buildDetailedDishwasher(context.at({ x: dishwasherX, y: 0.08, z: 0 })));
  buildWallCabinets(context.at({ x: -width * 0.2, y: 1.52, z: -0.14 }), materials, width * 0.58);
  buildHollowKitchenSink(context.at({ x: -width * 0.24, y: 0.94, z: 0 }), 0.54, 0.42);
  cabinetAnimations.push(buildKitchenTapOperation(context.at({ x: -width * 0.24, y: 0.94, z: 0 }), 0.54, 0.42));
  buildInductionHob(context.at({ x: width * 0.25, y: 0.94, z: 0 }));
  buildExtractorHood(context.at({ x: width * 0.25, y: 1.58, z: -0.03 }));
  buildOven(context.at({ x: width * 0.25, y: 0.13, z: 0.02 }));
  const coffee = buildCoffeeMachine(context.at({ x: 0, y: 0.94, z: -0.05 }));
  return [...cabinetAnimations, coffee];
}
