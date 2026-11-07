import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDetailedShower, buildHollowWashbasin } from "./domestic-water-fixtures";

export function buildWallMirror(context: ArchitectureContext, width: number, height: number): void {
  const { aluminum, reflectiveGlass, warmLight } = context.palette;
  context.roundedBox(aluminum, 0, height / 2, 0, width + 0.045, height + 0.045, 0.045, 0.018);
  context.box(reflectiveGlass, 0, height / 2, 0.03, width, height, 0.008);
  context.box(warmLight, 0, height + 0.015, 0.02, width * 0.82, 0.018, 0.025);
  context.box(aluminum, 0, -0.025, 0.09, width + 0.05, 0.025, 0.18);
}

export function buildToilet(context: ArchitectureContext): void {
  const { porcelain, dark, aluminum } = context.palette;
  context.oval(porcelain, 0, 0.25, 0.08, 0.17, 0.21, 0.26);
  context.roundedBox(porcelain, 0, 0.09, -0.005, 0.27, 0.18, 0.38, 0.085);
  context.oval(dark, 0, 0.424, 0.09, 0.112, 0.008, 0.17);
  const ring = context.geometry(new THREE.TorusGeometry(1, 0.1, 6, 24));
  ring.rotateX(Math.PI / 2);
  context.part(porcelain, ring, [0, 0.432, 0.09], [0.15, 0.12, 0.225]);
  context.roundedBox(porcelain, 0, 0.59, -0.23, 0.35, 0.37, 0.17, 0.035);
  context.box(aluminum, 0, 0.785, -0.23, 0.08, 0.012, 0.035);
  context.tube(aluminum, [[-0.12, 0.45, -0.28], [-0.16, 0.28, -0.31], [-0.16, 0.22, -0.38]], 0.012);
}

export function buildTowelRail(context: ArchitectureContext, heated = false): void {
  const { aluminum, fabric } = context.palette;
  const height = heated ? 0.85 : 0.08;
  for (const side of [-1, 1]) {
    context.beam(aluminum, [side * 0.22, 0, 0.06], [side * 0.22, height, 0.06], 0.012);
    context.beam(aluminum, [side * 0.22, 0, 0], [side * 0.22, 0, 0.06], 0.009);
  }
  const bars = heated ? 8 : 1;
  for (let bar = 0; bar < bars; bar++) context.beam(aluminum, [-0.22, height * (bar + 0.5) / bars, 0.06], [0.22, height * (bar + 0.5) / bars, 0.06], 0.01);
  context.box(fabric, -0.04, height * 0.45 - 0.11, 0.075, 0.23, 0.32, 0.02);
}

export function buildBathroom(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, accessible = false): Animation[] {
  const animations: Animation[] = [];
  context.box(materials.porcelainTile, 0, 0.015, 0, width, 0.03, depth);
  context.box(materials.tealTile, 0, 1.18, -depth / 2, width, 2.36, 0.045);
  context.box(materials.tealTile, -width / 2, 1.18, 0, 0.045, 2.36, depth);
  buildHollowWashbasin(context.at({ x: -width * 0.24, y: 0, z: -depth / 2 + 0.3 }), materials, accessible ? 0.75 : 0.6);
  buildWallMirror(context.at({ x: -width * 0.24, y: 1.1, z: -depth / 2 + 0.055 }), 0.6, 0.76);
  buildToilet(context.at({ x: width * 0.24, y: 0, z: -depth / 2 + 0.38 }));
  buildTowelRail(context.at({ x: -width / 2 + 0.03, y: 1.15, z: depth * 0.15, yaw: Math.PI / 2 }), true);
  if (accessible) {
    for (const side of [-1, 1]) context.beam(context.palette.aluminum, [width * 0.24 + side * 0.28, 0.72, -depth / 2 + 0.15], [width * 0.24 + side * 0.28, 0.72, -depth / 2 + 0.9], 0.018);
  } else {
    animations.push(buildDetailedShower(context.at({ x: width / 2 - 0.48, y: 0, z: depth / 2 - 0.48 }), 0.9, 0.9));
  }
  context.disc(context.palette.warmLight, 0, 2.38, 0, 0.11, 0.025);
  return animations;
}
