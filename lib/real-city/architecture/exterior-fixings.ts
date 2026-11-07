import * as THREE from "three";
import { ArchitectureContext, type Point } from "./context";

export function buildFaceFastener(context: ArchitectureContext, x: number, y: number, z: number, size = 0.012, hexagonal = false): void {
  const { aluminum, steel, dark } = context.palette;
  context.oval(steel, x, y, z, size * 1.35, size * 1.35, size * 0.24);
  if (hexagonal) {
    const corners: [number, number][] = [];
    for (let corner = 0; corner < 6; corner++) {
      const angle = corner * Math.PI / 3;
      corners.push([Math.cos(angle) * size, Math.sin(angle) * size]);
    }
    context.profile(aluminum, corners, size * 0.55, [x, y, z]);
  } else {
    context.oval(aluminum, x, y, z + size * 0.26, size, size, size * 0.35);
  }
  context.box(dark, x, y, z + size * 0.66, size * 0.95, size * 0.13, size * 0.08);
  if (!hexagonal) context.box(dark, x, y, z + size * 0.67, size * 0.13, size * 0.95, size * 0.08);
}

export function buildGroundBolt(context: ArchitectureContext, x: number, y: number, z: number, radius = 0.018): void {
  const { aluminum, steel, rubber } = context.palette;
  context.disc(rubber, x, y - 0.003, z, radius * 1.6, 0.006);
  context.disc(steel, x, y + 0.004, z, radius * 1.45, 0.008);
  context.disc(aluminum, x, y + 0.014, z, radius, 0.018);
  context.disc(steel, x, y + 0.026, z, radius * 0.35, 0.012);
}

export function buildAnchorPlate(context: ArchitectureContext, width: number, height: number, depth: number, fourBolts = true): void {
  const { steel, rubber } = context.palette;
  context.box(rubber, 0, 0, -0.007, width + 0.008, height + 0.008, 0.008);
  context.box(steel, 0, 0, depth / 2, width, height, depth);
  const x = Math.max(0.02, width / 2 - 0.035);
  const y = Math.max(0.02, height / 2 - 0.035);
  if (fourBolts) {
    for (const side of [-1, 1]) {
      for (const level of [-1, 1]) buildFaceFastener(context, side * x, level * y, depth + 0.003, 0.012, true);
    }
  } else {
    buildFaceFastener(context, 0, -y, depth + 0.003, 0.012, true);
    buildFaceFastener(context, 0, y, depth + 0.003, 0.012, true);
  }
}

export function buildCantileverBracket(context: ArchitectureContext, projection: number, height: number, width = 0.08): void {
  const { aluminum, steel, rubber } = context.palette;
  buildAnchorPlate(context, width + 0.08, height, 0.018, false);
  context.box(aluminum, 0, -height * 0.32, projection / 2, width, 0.028, projection);
  context.box(rubber, 0, -height * 0.32 + 0.022, projection - 0.045, width + 0.015, 0.015, 0.075);
  context.rectangularBeam(steel, [0, height * 0.32, 0.025], [0, -height * 0.32 - 0.016, projection - 0.035], width * 0.45, 0.025);
  buildGroundBolt(context, 0, -height * 0.32 + 0.034, projection - 0.045, 0.012);
}

export function buildFoldedFlashing(context: ArchitectureContext, width: number, points: readonly (readonly [number, number])[], thickness = 0.005, material: THREE.Material = context.palette.aluminum): void {
  for (let segment = 1; segment < points.length; segment++) {
    const previous = points[segment - 1];
    const current = points[segment];
    context.panel(material, [
      [-width / 2, previous[0], previous[1]],
      [width / 2, previous[0], previous[1]],
      [width / 2, current[0], current[1]],
      [-width / 2, current[0], current[1]],
    ]);
    if (thickness > 0) {
      context.rectangularBeam(material, [-width / 2, previous[0], previous[1]], [width / 2, previous[0], previous[1]], thickness, thickness);
    }
  }
  for (const side of [-1, 1]) {
    for (let segment = 1; segment < points.length; segment++) {
      const previous = points[segment - 1];
      const current = points[segment];
      context.rectangularBeam(material, [side * width / 2, previous[0], previous[1]], [side * width / 2, current[0], current[1]], thickness, thickness);
    }
  }
}

export function buildDripNose(context: ArchitectureContext, width: number, projection: number): void {
  const { aluminum } = context.palette;
  buildFoldedFlashing(context, width, [
    [0.04, 0],
    [0.006, 0],
    [-0.015, projection - 0.015],
    [-0.047, projection],
    [-0.054, projection - 0.017],
  ], 0.004, aluminum);
}

export function buildPerforatedStrip(context: ArchitectureContext, width: number, height: number, z: number, horizontal = true): void {
  const { aluminum, dark } = context.palette;
  if (width <= 0.02 || height <= 0.02) return;
  const pitch = 0.065;
  const holes = Math.max(1, Math.floor((horizontal ? width : height) / pitch));
  context.box(dark, 0, 0, z - 0.004, width, height, 0.006);
  if (horizontal) {
    context.box(aluminum, 0, height / 2 - 0.008, z, width, 0.016, 0.006);
    context.box(aluminum, 0, -height / 2 + 0.008, z, width, 0.016, 0.006);
    const spacing = width / holes;
    for (let index = 0; index <= holes; index++) {
      context.box(aluminum, -width / 2 + index * spacing, 0, z, 0.018, height, 0.006);
    }
    if (height > 0.09) context.box(aluminum, 0, 0, z, width, 0.012, 0.006);
  } else {
    context.box(aluminum, -width / 2 + 0.008, 0, z, 0.016, height, 0.006);
    context.box(aluminum, width / 2 - 0.008, 0, z, 0.016, height, 0.006);
    const spacing = height / holes;
    for (let index = 0; index <= holes; index++) {
      context.box(aluminum, 0, -height / 2 + index * spacing, z, width, 0.018, 0.006);
    }
  }
}

export function buildCableEnd(context: ArchitectureContext, a: Point, b: Point, radius = 0.008): void {
  const { steel, aluminum } = context.palette;
  const direction = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const distance = direction.length();
  if (distance < 0.04) return;
  direction.normalize();
  const socketLength = Math.min(0.12, distance * 0.2);
  const socketA: Point = [a[0] + direction.x * socketLength, a[1] + direction.y * socketLength, a[2] + direction.z * socketLength];
  const socketB: Point = [b[0] - direction.x * socketLength, b[1] - direction.y * socketLength, b[2] - direction.z * socketLength];
  context.beam(steel, a, b, radius);
  context.beam(aluminum, a, socketA, radius * 2.3);
  context.beam(aluminum, socketB, b, radius * 2.3);
  context.oval(aluminum, a[0], a[1], a[2], radius * 3, radius * 3, radius * 2);
  context.oval(aluminum, b[0], b[1], b[2], radius * 3, radius * 3, radius * 2);
}

export function buildAdjustableTieRod(context: ArchitectureContext, a: Point, b: Point, radius = 0.012): void {
  const { steel, aluminum } = context.palette;
  buildCableEnd(context, a, b, radius);
  const direction = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const length = direction.length();
  if (length < 0.3) return;
  direction.normalize();
  const center: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const halfLength = Math.min(0.1, length * 0.08);
  const start: Point = [center[0] - direction.x * halfLength, center[1] - direction.y * halfLength, center[2] - direction.z * halfLength];
  const end: Point = [center[0] + direction.x * halfLength, center[1] + direction.y * halfLength, center[2] + direction.z * halfLength];
  context.beam(aluminum, start, end, radius * 2.5);
  const threadStart = Math.min(0.18, length * 0.15);
  for (let index = 0; index < 4; index++) {
    const offset = threadStart + index * 0.016;
    const position: Point = [a[0] + direction.x * offset, a[1] + direction.y * offset, a[2] + direction.z * offset];
    context.oval(steel, position[0], position[1], position[2], radius * 1.4, radius * 1.4, radius * 1.4);
  }
}

export function buildSlottedConnection(context: ArchitectureContext, width: number, height: number, offset = 0): void {
  const { steel, dark, aluminum } = context.palette;
  context.box(steel, 0, 0, 0.008, width, height, 0.016);
  const slotLength = Math.max(0.035, height - 0.055);
  context.roundedBox(dark, 0, 0, 0.019, 0.027, slotLength, 0.004, 0.006);
  const travel = Math.max(0, slotLength / 2 - 0.018);
  const position = Math.max(-travel, Math.min(travel, offset));
  context.oval(aluminum, 0, position, 0.023, 0.024, 0.024, 0.004);
  buildFaceFastener(context, 0, position, 0.029, 0.013, true);
}

export function buildAngleCleat(context: ArchitectureContext, width: number, height: number, projection: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(rubber, 0, 0, -0.006, width + 0.01, height, 0.008);
  context.box(aluminum, 0, 0, 0.008, width, height, 0.016);
  context.box(aluminum, 0, -height / 2 + 0.008, projection / 2, width, 0.016, projection);
  for (const side of [-1, 1]) buildFaceFastener(context, side * width * 0.25, 0, 0.019, 0.01, true);
  buildGroundBolt(context, 0, -height / 2 + 0.022, projection * 0.64, 0.012);
}

export function buildProfileEndCap(context: ArchitectureContext, width: number, height: number, z: number, withScrew = true): void {
  const { aluminum, rubber } = context.palette;
  context.box(rubber, 0, 0, z - 0.003, width + 0.003, height + 0.003, 0.004);
  context.roundedBox(aluminum, 0, 0, z + 0.002, width, height, 0.008, 0.004);
  if (withScrew && width > 0.04 && height > 0.04) buildFaceFastener(context, 0, 0, z + 0.008, Math.min(0.008, width * 0.12));
}

export function buildWeldedCorner(context: ArchitectureContext, width: number, depth: number, height: number): void {
  const { steel, aluminum } = context.palette;
  context.box(steel, 0, 0, 0, width, height, depth);
  const seam = Math.min(0.004, height * 0.12);
  for (const side of [-1, 1]) {
    context.beam(aluminum, [-width / 2, side * height * 0.45, depth / 2 + seam], [width / 2, side * height * 0.45, depth / 2 + seam], seam);
  }
}

export function buildDrainSlot(context: ArchitectureContext, width: number, height: number, z: number): void {
  const { rubber, aluminum } = context.palette;
  context.roundedBox(rubber, 0, 0, z, width, height, 0.006, height * 0.4);
  context.box(aluminum, 0, -height / 2 - 0.003, z + 0.003, width + 0.014, 0.006, 0.012);
}

export function buildInspectionCover(context: ArchitectureContext, width: number, height: number, depth: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(rubber, 0, 0, 0, width + 0.012, height + 0.012, 0.014);
  context.box(aluminum, 0, 0, depth / 2, width, height, depth);
  for (const side of [-1, 1]) {
    for (const level of [-1, 1]) {
      buildFaceFastener(context, side * (width / 2 - 0.025), level * (height / 2 - 0.025), depth + 0.002, 0.007);
    }
  }
  context.box(rubber, 0, -height * 0.18, depth + 0.004, width * 0.18, 0.014, 0.004);
}

export function buildRailSplice(context: ArchitectureContext, width: number, height: number, depth: number): void {
  const { steel, aluminum } = context.palette;
  context.box(steel, 0, 0, depth / 2, width, height, depth);
  context.box(aluminum, 0, 0, depth + 0.004, width * 0.94, height * 0.82, 0.008);
  for (const side of [-1, 1]) {
    buildFaceFastener(context, side * width * 0.28, 0, depth + 0.012, 0.01, true);
  }
}

export function buildRubberBellows(context: ArchitectureContext, width: number, height: number, projection: number, folds = 5): void {
  const { rubber } = context.palette;
  const step = width / Math.max(2, folds);
  for (let fold = 0; fold < folds; fold++) {
    const left = -width / 2 + fold * step;
    context.panel(rubber, [
      [left, -height / 2, 0],
      [left + step / 2, -height / 2, projection],
      [left + step / 2, height / 2, projection],
      [left, height / 2, 0],
    ]);
    context.panel(rubber, [
      [left + step / 2, -height / 2, projection],
      [left + step, -height / 2, 0],
      [left + step, height / 2, 0],
      [left + step / 2, height / 2, projection],
    ]);
  }
}
