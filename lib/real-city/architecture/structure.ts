import * as THREE from "three";
import { ArchitectureContext, type Point } from "./context";
import type { ArchitecturalMaterials } from "./materials";

export type WallOpening = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function buildWallWithOpenings(context: ArchitectureContext, material: THREE.Material, width: number, height: number, thickness: number, openings: readonly WallOpening[]): void {
  const cutsX = new Set([-width / 2, width / 2]);
  const cutsY = new Set([0, height]);
  const clipped = openings.map((opening) => ({
    left: Math.max(-width / 2, opening.x - opening.width / 2),
    right: Math.min(width / 2, opening.x + opening.width / 2),
    bottom: Math.max(0, opening.y),
    top: Math.min(height, opening.y + opening.height),
  })).filter((opening) => opening.right > opening.left && opening.top > opening.bottom);
  for (const opening of clipped) {
    cutsX.add(opening.left);
    cutsX.add(opening.right);
    cutsY.add(opening.bottom);
    cutsY.add(opening.top);
  }
  const xs = [...cutsX].sort((a, b) => a - b);
  const ys = [...cutsY].sort((a, b) => a - b);
  for (let row = 1; row < ys.length; row++) {
    let runStart: number | null = null;
    const middleY = (ys[row - 1] + ys[row]) / 2;
    for (let column = 1; column <= xs.length; column++) {
      const middleX = column < xs.length ? (xs[column - 1] + xs[column]) / 2 : Infinity;
      const empty = column === xs.length || clipped.some((opening) => middleX > opening.left && middleX < opening.right && middleY > opening.bottom && middleY < opening.top);
      if (!empty && runStart === null) runStart = xs[column - 1];
      if (empty && runStart !== null) {
        const right = xs[column - 1];
        context.box(material, (runStart + right) / 2, middleY, 0, right - runStart, ys[row] - ys[row - 1], thickness);
        runStart = null;
      }
    }
  }
}

export function buildSlab(context: ArchitectureContext, material: THREE.Material, width: number, depth: number, thickness: number, holes: readonly { x: number; z: number; width: number; depth: number }[] = []): void {
  const xs = new Set([-width / 2, width / 2]);
  const zs = new Set([-depth / 2, depth / 2]);
  for (const hole of holes) {
    xs.add(Math.max(-width / 2, hole.x - hole.width / 2));
    xs.add(Math.min(width / 2, hole.x + hole.width / 2));
    zs.add(Math.max(-depth / 2, hole.z - hole.depth / 2));
    zs.add(Math.min(depth / 2, hole.z + hole.depth / 2));
  }
  const xCuts = [...xs].sort((a, b) => a - b);
  const zCuts = [...zs].sort((a, b) => a - b);
  for (let ix = 1; ix < xCuts.length; ix++) {
    for (let iz = 1; iz < zCuts.length; iz++) {
      const x = (xCuts[ix - 1] + xCuts[ix]) / 2;
      const z = (zCuts[iz - 1] + zCuts[iz]) / 2;
      const inHole = holes.some((hole) => Math.abs(x - hole.x) < hole.width / 2 && Math.abs(z - hole.z) < hole.depth / 2);
      if (inHole) continue;
      context.box(material, x, -thickness / 2, z, xCuts[ix] - xCuts[ix - 1], thickness, zCuts[iz] - zCuts[iz - 1]);
    }
  }
}

export function buildParapet(context: ArchitectureContext, width: number, depth: number, height: number): void {
  const { concrete, limestone, aluminum } = context.palette;
  for (const side of [-1, 1]) {
    context.box(concrete, 0, height / 2, side * depth / 2, width + 0.18, height, 0.18);
    context.box(concrete, side * width / 2, height / 2, 0, 0.18, height, depth);
    context.box(limestone, 0, height + 0.035, side * depth / 2, width + 0.25, 0.07, 0.25);
    context.box(limestone, side * width / 2, height + 0.035, 0, 0.25, 0.07, depth);
    context.box(aluminum, 0, height - 0.025, side * (depth / 2 + 0.13), width + 0.24, 0.025, 0.018);
  }
}

export function buildPitchedRoof(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, ridgeHeight: number): void {
  const { oak, aluminum } = context.palette;
  const half = width / 2;
  for (const side of [-1, 1]) {
    const corners: [Point, Point, Point, Point] = [[side * (half + 0.3), 0, -depth / 2 - 0.25], [side * (half + 0.3), 0, depth / 2 + 0.25], [0, ridgeHeight, depth / 2 + 0.25], [0, ridgeHeight, -depth / 2 - 0.25]];
    context.panel(materials.ribbedMetal, side > 0 ? [corners[0], corners[3], corners[2], corners[1]] : corners);
    const rafters = Math.ceil(depth / 0.7);
    for (let rafter = 0; rafter <= rafters; rafter++) {
      const z = -depth / 2 + rafter * depth / rafters;
      context.rectangularBeam(oak, [0, ridgeHeight - 0.07, z], [side * (half + 0.3), -0.07, z], 0.07, 0.11);
    }
    context.box(oak, side * (half + 0.28), -0.075, 0, 0.045, 0.15, depth + 0.5);
    context.box(aluminum, side * (half + 0.38), -0.05, 0, 0.12, 0.08, depth + 0.52);
  }
  context.box(aluminum, 0, ridgeHeight + 0.018, 0, 0.12, 0.035, depth + 0.55);
  for (const end of [-1, 1]) context.profile(context.palette.white, [[-half, 0], [half, 0], [0, ridgeHeight]], 0.12, [0, 0, end * depth / 2 - 0.06]);
}

export function buildTimberPergola(context: ArchitectureContext, width: number, depth: number, height: number): void {
  const { oak, steel } = context.palette;
  for (const xSide of [-1, 1]) {
    for (const zSide of [-1, 1]) {
      const x = xSide * width / 2;
      const z = zSide * depth / 2;
      context.box(oak, x, height / 2, z, 0.12, height, 0.12);
      context.box(steel, x, 0.09, z, 0.14, 0.18, 0.14);
      context.rectangularBeam(oak, [x, height - 0.52, z], [x - xSide * 0.4, height - 0.1, z], 0.07, 0.07);
      context.rectangularBeam(oak, [x, height - 0.52, z], [x, height - 0.1, z - zSide * 0.4], 0.07, 0.07);
    }
    context.box(oak, xSide * width / 2, height - 0.04, 0, 0.1, 0.18, depth + 0.3);
  }
  const joists = Math.ceil(depth / 0.35);
  for (let joist = 0; joist <= joists; joist++) context.box(oak, 0, height + 0.07, -depth / 2 + joist * depth / joists, width + 0.35, 0.1, 0.07);
}

export function buildSteelPortal(context: ArchitectureContext, width: number, depth: number, height: number): void {
  const { steel, aluminum } = context.palette;
  const bays = Math.max(1, Math.ceil(depth / 3));
  for (let bay = 0; bay <= bays; bay++) {
    const z = -depth / 2 + bay * depth / bays;
    for (const side of [-1, 1]) {
      const x = side * width / 2;
      context.box(steel, x, height / 2, z, 0.12, height, 0.22);
      context.box(steel, x, 0.025, z, 0.3, 0.05, 0.3);
      for (const boltX of [-0.1, 0.1]) for (const boltZ of [-0.1, 0.1]) context.disc(aluminum, x + boltX, 0.06, z + boltZ, 0.012, 0.02);
      context.rectangularBeam(steel, [x, height - 0.7, z], [x - side * 0.7, height, z], 0.08, 0.12);
    }
    context.box(steel, 0, height, z, width + 0.15, 0.24, 0.12);
  }
  for (const side of [-1, 1]) context.box(steel, side * width / 2, height, 0, 0.09, 0.14, depth);
}

export function buildBalcony(context: ArchitectureContext, width: number, projection: number, glassRail = true): void {
  const { concrete, glass, aluminum, steel } = context.palette;
  context.box(concrete, 0, -0.1, projection / 2, width, 0.2, projection);
  context.box(aluminum, 0, -0.08, projection + 0.025, width + 0.04, 0.16, 0.04);
  if (glassRail) {
    const panels = Math.ceil(width / 1.1);
    for (let panel = 0; panel < panels; panel++) {
      const x = -width / 2 + (panel + 0.5) * width / panels;
      context.box(glass, x, 0.56, projection, width / panels - 0.015, 1.02, 0.025);
    }
    context.box(steel, 0, 0.06, projection, width, 0.12, 0.06);
  } else {
    const rods = Math.ceil(width / 0.1);
    for (let rod = 0; rod <= rods; rod++) context.beam(steel, [-width / 2 + rod * width / rods, 0.06, projection], [-width / 2 + rod * width / rods, 1.08, projection], 0.009);
  }
  context.beam(aluminum, [-width / 2, 1.1, projection], [width / 2, 1.1, projection], 0.025);
  for (const side of [-1, 1]) {
    if (glassRail) context.box(glass, side * width / 2, 0.56, projection / 2, 0.025, 1.02, projection);
    context.beam(aluminum, [side * width / 2, 1.1, 0], [side * width / 2, 1.1, projection], 0.025);
  }
}
