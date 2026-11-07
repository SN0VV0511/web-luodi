import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";
import type { ArchitecturalMaterials } from "./materials";

export interface FinishOpening {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Interval = { low: number; high: number };
type CeilingVoid = { x: number; z: number; width: number; depth: number };

function subtractIntervals(low: number, high: number, cuts: readonly Interval[]): Interval[] {
  const ordered = cuts
    .filter(cut => cut.high > low && cut.low < high)
    .map(cut => ({ low: Math.max(low, cut.low), high: Math.min(high, cut.high) }))
    .sort((a, b) => a.low - b.low);
  const spans: Interval[] = [];
  let cursor = low;
  for (const cut of ordered) {
    if (cut.low > cursor + 0.001) spans.push({ low: cursor, high: cut.low });
    cursor = Math.max(cursor, cut.high);
  }
  if (cursor < high - 0.001) spans.push({ low: cursor, high });
  return spans;
}

function atHeight(openings: readonly FinishOpening[], bottom: number, top: number): Interval[] {
  return openings
    .filter(opening => opening.y < top && opening.y + opening.height > bottom)
    .map(opening => ({ low: opening.x - opening.width / 2, high: opening.x + opening.width / 2 }));
}

export function buildSkirting(context: ArchitectureContext, width: number, openings: readonly FinishOpening[], timber = true): void {
  const material = timber ? context.palette.oak : context.palette.white;
  const spans = subtractIntervals(-width / 2, width / 2, atHeight(openings, 0, 0.12));
  for (const span of spans) {
    const length = span.high - span.low;
    const center = (span.low + span.high) / 2;
    context.box(material, center, 0.05, 0.015, length, 0.1, 0.03);
    context.box(material, center, 0.108, 0.011, length, 0.016, 0.022);
    context.box(context.palette.dark, center, 0.0025, 0.017, length, 0.005, 0.03);
    for (const x of [span.low + 0.018, span.high - 0.018]) {
      if (length > 0.1) context.box(material, x, 0.055, 0.025, 0.025, 0.11, 0.015);
    }
  }
}

export function buildWallDado(context: ArchitectureContext, width: number, height: number, openings: readonly FinishOpening[], oakPanels: boolean): void {
  const { oak, white, dark, aluminum } = context.palette;
  const material = oakPanels ? oak : white;
  const panelHeight = Math.min(0.9, height * 0.34);
  const spans = subtractIntervals(-width / 2, width / 2, atHeight(openings, 0, panelHeight + 0.1));
  for (const span of spans) {
    const length = span.high - span.low;
    const center = (span.high + span.low) / 2;
    context.box(material, center, panelHeight / 2 + 0.12, 0.022, length, panelHeight, 0.025);
    const bays = Math.max(1, Math.floor(length / 0.65));
    for (let bay = 0; bay <= bays; bay++) {
      const x = span.low + bay * length / bays;
      context.box(oakPanels ? dark : aluminum, x, panelHeight / 2 + 0.12, 0.037, 0.006, panelHeight - 0.04, 0.003);
    }
    context.box(material, center, panelHeight + 0.14, 0.035, length, 0.045, 0.05);
  }
  buildSkirting(context, width, openings, oakPanels);
}

export function buildDoorArchitrave(context: ArchitectureContext, width: number, height: number, timber = true): void {
  const { oak, white, dark } = context.palette;
  const material = timber ? oak : white;
  const architrave = 0.055;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + architrave / 2);
    context.box(material, x, height / 2, 0.045, architrave, height + 0.045, 0.035);
    context.box(dark, side * (width / 2 + 0.005), height / 2, 0.028, 0.008, height, 0.015);
    context.box(material, side * (width / 2 - 0.015), height / 2, -0.005, 0.03, height, 0.12);
  }
  context.box(material, 0, height + architrave / 2, 0.045, width + architrave * 2, architrave, 0.035);
  context.box(material, 0, height - 0.015, -0.005, width, 0.03, 0.12);
  context.box(dark, 0, height + 0.005, 0.028, width, 0.008, 0.015);
}

function buildLeverHandle(context: ArchitectureContext, x: number, height: number, face: number): void {
  const { aluminum, dark } = context.palette;
  const z = face * 0.044;
  context.box(aluminum, x, height, z, 0.038, 0.135, 0.008);
  context.box(dark, x, height - 0.035, z + face * 0.007, 0.012, 0.02, 0.004);
  context.box(aluminum, x, height + 0.03, z + face * 0.025, 0.035, 0.025, 0.045);
  context.box(aluminum, x - 0.045, height + 0.03, z + face * 0.045, 0.095, 0.018, 0.018);
}

function buildApartmentDoorLeaf(context: ArchitectureContext, width: number, height: number): THREE.Group {
  const { oak, aluminum, rubber, dark } = context.palette;
  return context.moving("Acoustic apartment entrance door", [-width / 2, 0, 0], moving => {
    moving.box(oak, width / 2, height / 2, 0, width - 0.012, height - 0.014, 0.055);
    moving.box(rubber, width / 2, 0.009, 0, width - 0.02, 0.015, 0.045);
    moving.box(dark, width - 0.008, height / 2, 0, 0.006, height - 0.025, 0.045);
    for (const face of [-1, 1]) {
      for (const y of [0.3, 1.15, height - 0.18]) {
        moving.box(dark, width / 2, y, face * 0.029, width - 0.16, 0.006, 0.003);
      }
      buildLeverHandle(moving, width - 0.1, 0.97, face);
    }
    for (const y of [0.18, height / 2, height - 0.18]) {
      moving.disc(aluminum, 0.008, y, -0.032, 0.012, 0.085);
      moving.box(aluminum, 0.035, y, -0.027, 0.055, 0.072, 0.006);
    }
    moving.box(aluminum, width / 2, 1.54, 0.032, 0.02, 0.02, 0.01);
    moving.box(dark, width / 2, 1.54, 0.039, 0.008, 0.008, 0.006);
    moving.box(aluminum, 0.17, height - 0.08, -0.047, 0.2, 0.035, 0.04);
    moving.box(aluminum, width - 0.055, 0.97, -0.025, 0.03, 0.16, 0.006);
    moving.box(context.palette.white, width / 2, 0.36, -0.029, width - 0.12, 0.015, 0.005);
  });
}

export function buildApartmentEntranceDoor(context: ArchitectureContext, width: number, height: number, apartment: number): Animation {
  buildDoorArchitrave(context, width, height);
  const leaf = buildApartmentDoorLeaf(context, width, height);
  const yaw = leaf.rotation.y;
  const sense = context.doorSensor([0, 0, 0], 1.15, 2.5);
  const { aluminum, steel, screen } = context.palette;
  context.box(steel, width / 2 + 0.11, 1.2, 0.045, 0.09, 0.16, 0.035);
  context.box(aluminum, width / 2 + 0.11, 1.18, 0.067, 0.04, 0.04, 0.01);
  context.box(screen, width / 2 + 0.11, 1.25, 0.065, 0.035, 0.014, 0.008);
  context.label(String(apartment).padStart(3, "0"), 0, height + 0.16, 0.045, 0.28, 0.11, "#d8d4c5", "#4c5148");
  const closerArm = context.moving("Apartment door hydraulic closer link", [-width / 2 + 0.16, height - 0.04, -0.07], moving => {
    moving.box(aluminum, 0.12, 0, 0, 0.24, 0.015, 0.02);
  });
  return seconds => {
    const openness = sense(seconds);
    leaf.rotation.y = yaw - openness * 1.28;
    closerArm.rotation.y = yaw - openness * 0.52;
  };
}

function ceilingCell(context: ArchitectureContext, width: number, depth: number, material: THREE.Material): void {
  context.box(material, 0, 0, 0, width - 0.008, 0.025, depth - 0.008);
  const { aluminum, dark } = context.palette;
  context.box(aluminum, -width / 2, -0.014, 0, 0.016, 0.012, depth);
  context.box(aluminum, 0, -0.014, -depth / 2, width, 0.012, 0.016);
  context.box(dark, 0, -0.015, depth / 2 - 0.013, width - 0.03, 0.002, 0.004);
}

export function buildSuspendedCeiling(context: ArchitectureContext, width: number, depth: number, voids: readonly CeilingVoid[] = []): void {
  const module = 0.6;
  const columns = Math.max(1, Math.ceil(width / module));
  const rows = Math.max(1, Math.ceil(depth / module));
  const tileWidth = width / columns;
  const tileDepth = depth / rows;
  for (let row = 0; row < rows; row++) {
    const z = -depth / 2 + (row + 0.5) * tileDepth;
    for (let column = 0; column < columns; column++) {
      const x = -width / 2 + (column + 0.5) * tileWidth;
      const cuts = voids.filter(hole => Math.abs(x - hole.x) < (tileWidth + hole.width) / 2 && Math.abs(z - hole.z) < (tileDepth + hole.depth) / 2);
      if (cuts.length === 0) {
        ceilingCell(context.at({ x, y: 0, z }), tileWidth, tileDepth, context.palette.white);
        continue;
      }
      const xs = [x - tileWidth / 2, x + tileWidth / 2];
      const zs = [z - tileDepth / 2, z + tileDepth / 2];
      for (const cut of cuts) {
        for (const edge of [cut.x - cut.width / 2, cut.x + cut.width / 2]) if (edge > xs[0] && edge < xs[1]) xs.push(edge);
        for (const edge of [cut.z - cut.depth / 2, cut.z + cut.depth / 2]) if (edge > zs[0] && edge < zs[1]) zs.push(edge);
      }
      xs.sort((a, b) => a - b);
      zs.sort((a, b) => a - b);
      for (let ix = 1; ix < xs.length; ix++) {
        for (let iz = 1; iz < zs.length; iz++) {
          const cx = (xs[ix] + xs[ix - 1]) / 2;
          const cz = (zs[iz] + zs[iz - 1]) / 2;
          const insideVoid = cuts.some(hole => Math.abs(cx - hole.x) < hole.width / 2 && Math.abs(cz - hole.z) < hole.depth / 2);
          if (insideVoid) continue;
          context.box(context.palette.white, cx, 0, cz, xs[ix] - xs[ix - 1] - 0.003, 0.025, zs[iz] - zs[iz - 1] - 0.003);
        }
      }
    }
  }
  for (const hole of voids) {
    for (const side of [-1, 1]) {
      context.box(context.palette.aluminum, hole.x + side * hole.width / 2, 0.035, hole.z, 0.025, 0.095, hole.depth);
      context.box(context.palette.aluminum, hole.x, 0.035, hole.z + side * hole.depth / 2, hole.width, 0.095, 0.025);
    }
  }
}

function buildSprinkler(context: ArchitectureContext): void {
  const { white, aluminum, red } = context.palette;
  context.disc(white, 0, 0, 0, 0.04, 0.009);
  context.disc(aluminum, 0, -0.018, 0, 0.015, 0.034);
  context.box(red, 0, -0.039, 0, 0.005, 0.028, 0.005);
  context.disc(aluminum, 0, -0.055, 0, 0.027, 0.005);
  for (const side of [-1, 1]) context.box(aluminum, side * 0.017, -0.033, 0, 0.005, 0.035, 0.006);
}

function buildLinearDiffuser(context: ArchitectureContext, length: number): void {
  const { white, dark, aluminum } = context.palette;
  context.box(white, 0, 0, 0, length, 0.035, 0.16);
  for (const z of [-0.045, 0, 0.045]) {
    context.box(dark, 0, -0.02, z, length - 0.05, 0.01, 0.025);
    context.box(aluminum, 0, -0.026, z, length - 0.07, 0.008, 0.007);
  }
  for (const x of [-length / 2 + 0.03, length / 2 - 0.03]) {
    context.disc(aluminum, x, -0.022, 0, 0.006, 0.01);
  }
}

export function buildResidentialCorridor(context: ArchitectureContext, width: number, floor: number): Animation[] {
  const animations: Animation[] = [];
  const { white, aluminum, oak, warmLight, red } = context.palette;
  context.box(context.palette.dark, 0, 0.012, 0, width - 0.18, 0.025, 1.25);
  context.box(context.palette.fabric, 0, 0.028, 0, width - 0.22, 0.008, 1.12);
  for (const side of [-1, 1]) {
    const wall = context.at({ x: 0, y: 0, z: side * 0.62, yaw: side > 0 ? Math.PI : 0 });
    const doors = [-1, 1].map(sign => ({ x: sign * width * 0.25, y: 0, width: 0.86, height: 2.1 }));
    if (side > 0) {
      buildWallDado(wall, width - 0.2, 2.7, doors, true);
      for (const door of doors) {
        animations.push(buildApartmentEntranceDoor(wall.at({ x: door.x, y: 0.025, z: 0.015 }), 0.83, 2.075, (floor + 1) * 100 + (door.x > 0 ? 2 : 1)));
      }
    } else {
      buildSkirting(wall, width - 0.2, [...doors, { x: 0, y: 0, width: 1.65, height: 2.5 }, { x: -width / 2 + 1.4, y: 0, width: 1.1, height: 2.1 }], false);
    }
    wall.box(white, 0, 2.66, 0.035, width - 0.18, 0.06, 0.08);
    wall.box(warmLight, 0, 2.62, 0.018, width - 0.3, 0.012, 0.012);
  }
  buildSuspendedCeiling(context.at({ x: 0, y: 2.72, z: 0 }), width - 0.2, 1.24);
  buildLinearDiffuser(context.at({ x: width * 0.24, y: 2.693, z: 0 }), 0.75);
  for (const x of [-width * 0.32, 0, width * 0.32]) buildSprinkler(context.at({ x, y: 2.69, z: 0 }));
  const cabinet = context.at({ x: width / 2 - 0.75, y: 0.02, z: -0.57 });
  cabinet.box(aluminum, 0, 1.15, 0, 0.46, 1.05, 0.1);
  cabinet.box(white, 0, 1.15, 0.061, 0.4, 0.98, 0.018);
  cabinet.box(red, 0, 1.38, 0.074, 0.16, 0.09, 0.008);
  cabinet.box(aluminum, 0.16, 1.17, 0.09, 0.018, 0.14, 0.02);
  cabinet.label("FIRE", 0, 1.38, 0.082, 0.13, 0.055, "#eee8da", "#a94c40");
  context.box(oak, -width / 2 + 0.2, 0.7, 0, 0.2, 1.4, 0.55);
  return animations;
}

export function buildAcousticSlatCeiling(context: ArchitectureContext, width: number, depth: number, openStrip = 0.75): void {
  const { oak, dark, aluminum, warmLight } = context.palette;
  const strip = Math.min(width * 0.5, Math.max(0.35, openStrip));
  const groups = [
    { low: -width / 2, high: -strip / 2 },
    { low: strip / 2, high: width / 2 },
  ];
  for (const group of groups) {
    const span = group.high - group.low;
    context.box(dark, (group.low + group.high) / 2, 0.04, 0, span, 0.02, depth);
    const count = Math.max(1, Math.floor(span / 0.12));
    for (let slat = 0; slat < count; slat++) {
      const x = group.low + (slat + 0.5) * span / count;
      context.box(oak, x, 0, 0, 0.07, 0.08, depth - 0.04);
    }
    for (const z of [-depth * 0.3, depth * 0.3]) {
      context.box(aluminum, (group.low + group.high) / 2, 0.07, z, span, 0.025, 0.025);
    }
  }
  for (const side of [-1, 1]) context.box(warmLight, side * (strip / 2 + 0.015), -0.025, 0, 0.015, 0.015, depth - 0.1);
}
