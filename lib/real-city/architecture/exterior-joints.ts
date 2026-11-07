import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";
import {
  buildFaceFastener,
  buildDripNose,
  buildFoldedFlashing,
  buildRailSplice,
  buildRubberBellows,
  buildWeldedCorner,
} from "./exterior-fixings";
import {
  exteriorFaceDepth,
  findFacadeServicePosition,
  horizontalFacadeIntervals,
  verticalFacadeIntervals,
  type ExteriorOptions,
} from "./exterior-layout";
import { buildWallVentilationAssembly } from "./exterior-ventilation";

export function buildFacadeMovementJoint(context: ArchitectureContext, height: number, width = 0.045): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, height / 2, 0, width + 0.025, height, 0.016);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * (width / 2 + 0.014), height / 2, 0.013, 0.025, height, 0.026);
    context.box(steel, side * (width / 2 + 0.03), height / 2, 0.019, 0.005, height, 0.006);
  }
  const sections = Math.max(1, Math.ceil(height / 1.2));
  for (let section = 0; section < sections; section++) {
    const bottom = section * height / sections;
    const sectionHeight = height / sections;
    buildRubberBellows(context.at({ x: 0, y: bottom + sectionHeight / 2, z: 0.008 }), width, sectionHeight - 0.006, 0.014, 3);
    for (const side of [-1, 1]) {
      for (const inset of [0.08, sectionHeight - 0.08]) {
        buildFaceFastener(context, side * (width / 2 + 0.014), bottom + inset, 0.03, 0.005);
      }
    }
    if (section > 0) {
      context.box(rubber, 0, bottom, 0.025, width + 0.08, 0.018, 0.008);
      context.box(aluminum, 0, bottom, 0.032, width + 0.09, 0.012, 0.008);
    }
  }
}

export function buildHorizontalFloorJoint(context: ArchitectureContext, width: number): void {
  const { aluminum, rubber, concrete } = context.palette;
  context.box(concrete, 0, 0, -0.004, width, 0.105, 0.025);
  context.box(rubber, 0, 0.002, 0.012, width, 0.025, 0.01);
  context.box(aluminum, 0, 0.036, 0.025, width, 0.014, 0.035);
  context.box(aluminum, 0, -0.031, 0.018, width, 0.014, 0.021);
  buildFoldedFlashing(context.at({ x: 0, y: 0.035, z: 0.04 }), width, [[0, -0.02], [-0.012, 0.012], [-0.028, 0.018]], 0.003);
  const sections = Math.max(1, Math.ceil(width / 1.5));
  for (let section = 1; section < sections; section++) {
    const x = -width / 2 + section * width / sections;
    context.box(rubber, x, 0.035, 0.045, 0.006, 0.014, 0.01);
    context.box(rubber, x, -0.03, 0.03, 0.006, 0.016, 0.006);
  }
}

export function buildExternalPipeSleeve(context: ArchitectureContext, radius: number, projection: number): void {
  const { aluminum, rubber, concrete, steel } = context.palette;
  context.oval(concrete, 0, 0, -0.002, radius + 0.045, radius + 0.045, 0.016);
  context.oval(rubber, 0, 0, 0.012, radius + 0.025, radius + 0.025, 0.018);
  context.beam(aluminum, [0, 0, 0.012], [0, -0.012, projection], radius);
  const points: Point[] = [];
  for (let point = 0; point <= 16; point++) {
    const angle = point * Math.PI * 2 / 16;
    points.push([Math.cos(angle) * (radius + 0.012), Math.sin(angle) * (radius + 0.012), 0.027]);
  }
  context.tube(steel, points, 0.005);
  for (const side of [-1, 1]) {
    buildFaceFastener(context, side * (radius + 0.032), 0, 0.027, 0.006);
  }
  context.box(steel, 0, -radius - 0.028, projection * 0.55, radius * 1.6, 0.012, projection * 0.8);
}

export function buildConduitStandOff(context: ArchitectureContext, radius: number, distance: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(steel, 0, 0, distance / 2, radius * 3.2, 0.025, distance);
  context.box(rubber, 0, 0, distance, radius * 2.4, 0.04, radius * 2.4);
  context.box(aluminum, 0, 0.024, distance, radius * 3, 0.01, radius * 2.7);
  context.box(aluminum, 0, -0.024, distance, radius * 3, 0.01, radius * 2.7);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * radius * 1.35, 0, distance, 0.009, 0.055, radius * 2.7);
    buildFaceFastener(context, side * radius * 1.35, 0, distance + radius * 1.5, 0.005, true);
  }
}

export function buildConduitExpansionCoupler(context: ArchitectureContext, radius: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.disc(aluminum, 0, 0, 0, radius * 1.45, 0.12);
  context.disc(rubber, 0, -0.05, 0, radius * 1.5, 0.013);
  context.disc(rubber, 0, 0.05, 0, radius * 1.5, 0.013);
  context.disc(steel, 0, 0.019, 0, radius * 1.6, 0.015);
  context.disc(steel, 0, -0.019, 0, radius * 1.6, 0.015);
}

export function buildExteriorConduit(context: ArchitectureContext, height: number, offset: number, radius = 0.017): void {
  const { steel, aluminum, rubber } = context.palette;
  context.beam(steel, [0, 0.08, offset], [0, height - 0.06, offset], radius);
  context.tube(steel, [[0, height - 0.06, offset], [0, height, offset], [0, height + 0.025, offset - 0.04]], radius);
  context.tube(steel, [[0, 0.08, offset], [0, 0.04, offset], [0, 0.018, offset - 0.035]], radius);
  const clamps = Math.max(2, Math.ceil(height / 0.55));
  for (let clamp = 0; clamp < clamps; clamp++) {
    const y = 0.14 + clamp * Math.max(0, height - 0.28) / (clamps - 1);
    buildConduitStandOff(context.at({ x: 0, y, z: 0 }), radius, offset);
  }
  if (height > 0.8) buildConduitExpansionCoupler(context.at({ x: 0, y: height * 0.45, z: offset }), radius);
  for (const y of [0.06, height - 0.025]) {
    context.disc(aluminum, 0, y, offset, radius * 1.35, 0.025);
    context.disc(rubber, 0, y + 0.016, offset, radius * 1.3, 0.007);
  }
}

export function buildWallJunctionBox(context: ArchitectureContext, width: number, height: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, height / 2, 0, width + 0.015, height + 0.015, 0.02);
  context.roundedBox(aluminum, 0, height / 2, 0.043, width, height, 0.08, 0.012);
  context.box(rubber, 0, height / 2, 0.086, width - 0.012, height - 0.012, 0.005);
  context.roundedBox(aluminum, 0, height / 2, 0.092, width - 0.02, height - 0.02, 0.012, 0.008);
  for (const side of [-1, 1]) {
    for (const level of [-1, 1]) {
      buildFaceFastener(context, side * (width / 2 - 0.025), height / 2 + level * (height / 2 - 0.025), 0.101, 0.006);
    }
  }
  context.box(steel, 0, height * 0.58, 0.102, width * 0.48, 0.028, 0.003);
  context.box(context.palette.white, 0, height * 0.58, 0.105, width * 0.34, 0.006, 0.002);
}

export function buildRainDeflectingCowl(context: ArchitectureContext, width: number, height: number, projection: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, height / 2, 0, width + 0.04, height + 0.04, 0.02);
  context.panel(aluminum, [[-width / 2, height, 0], [width / 2, height, 0], [width / 2, height * 0.58, projection], [-width / 2, height * 0.58, projection]]);
  for (const side of [-1, 1]) {
    context.profile(aluminum, [[0, 0], [projection, height * 0.08], [projection, height * 0.58], [0, height]], 0.008, [side * width / 2, 0, 0], -Math.PI / 2);
    buildFaceFastener(context, side * (width / 2 + 0.012), height * 0.75, 0.015, 0.007);
  }
  buildDripNose(context.at({ x: 0, y: height * 0.58, z: projection - 0.012 }), width, 0.025);
  context.box(steel, 0, height * 0.18, projection - 0.025, width - 0.02, 0.018, 0.025);
  const bars = Math.max(3, Math.ceil(width / 0.07));
  for (let bar = 0; bar < bars; bar++) {
    const x = -width / 2 + (bar + 0.5) * width / bars;
    context.box(steel, x, height * 0.3, projection - 0.028, 0.006, height * 0.28, 0.008);
  }
  for (const y of [height * 0.22, height * 0.32, height * 0.42]) {
    context.box(steel, 0, y, projection - 0.026, width - 0.02, 0.005, 0.008);
  }
}

export function buildExhaustFlapBank(context: ArchitectureContext, width: number, height: number): Animation {
  const { aluminum, rubber } = context.palette;
  context.box(rubber, 0, height / 2, 0, width, height, 0.008);
  const count = Math.max(3, Math.ceil(height / 0.1));
  const pitch = height / count;
  const blades: THREE.Group[] = [];
  for (let blade = 0; blade < count; blade++) {
    const y = (blade + 1) * pitch;
    blades.push(context.moving("Ventilation gravity louver blade", [0, y, 0.02], moving => {
      moving.box(aluminum, 0, -pitch / 2, 0, width - 0.02, pitch - 0.008, 0.012);
      moving.box(rubber, 0, -pitch + 0.004, 0.008, width - 0.025, 0.008, 0.012);
    }));
  }
  let angle = 0;
  let lastTime = -Infinity;
  return (seconds, night, season) => {
    const power = season === "summer" ? 0.58 : season === "winter" ? 0.15 : 0.36;
    const target = power * (night ? 0.35 : 1);
    const delta = Number.isFinite(lastTime) && seconds >= lastTime ? Math.min(0.2, seconds - lastTime) : Infinity;
    lastTime = seconds;
    angle += (target - angle) * (Number.isFinite(delta) ? Math.min(1, delta * 0.7) : 1);
    for (let blade = 0; blade < blades.length; blade++) {
      blades[blade].rotation.x = angle * (1 - blade * 0.015);
    }
  };
}

export function buildWallPanelTransition(context: ArchitectureContext, height: number, projection: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, height / 2, 0, 0.085, height, 0.02);
  context.box(aluminum, -0.025, height / 2, 0.012, 0.025, height, 0.025);
  context.box(aluminum, 0.022, height / 2, projection / 2, 0.018, height, projection);
  context.box(aluminum, 0.04, height / 2, projection, 0.04, height, 0.012);
  context.box(steel, 0.065, height / 2, projection - 0.003, 0.008, height, 0.01);
  const fixings = Math.max(2, Math.ceil(height / 0.75));
  for (let fixing = 0; fixing < fixings; fixing++) {
    const y = 0.065 + fixing * (height - 0.13) / (fixings - 1);
    buildFaceFastener(context, -0.025, y, 0.027, 0.006);
  }
  if (height > 2.2) {
    buildRailSplice(context.at({ x: 0.04, y: height * 0.5, z: projection }), 0.1, 0.08, 0.008);
  }
}

export function buildVentilationFaceSupport(context: ArchitectureContext, width: number, height: number): void {
  const { steel, aluminum, rubber } = context.palette;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.018);
    context.box(steel, x, height / 2, -0.025, 0.035, height + 0.04, 0.075);
    context.box(rubber, x, height / 2, 0.015, 0.04, height + 0.04, 0.01);
    for (const y of [0.04, height - 0.04]) {
      buildWeldedCorner(context.at({ x, y, z: -0.01 }), 0.05, 0.07, 0.035);
      buildFaceFastener(context, x, y, 0.03, 0.007, true);
    }
  }
  context.box(aluminum, 0, -0.018, 0.015, width + 0.075, 0.035, 0.1);
  context.box(aluminum, 0, height + 0.018, 0.015, width + 0.075, 0.035, 0.1);
}

export function buildExteriorJointConstruction(context: ArchitectureContext, options: ExteriorOptions): Animation[] {
  const face = exteriorFaceDepth(options);
  const animations: Animation[] = [];
  if (options.width > 8.5) {
    const x = options.variant % 2 ? -options.width * 0.12 : options.width * 0.12;
    for (const interval of verticalFacadeIntervals(options.height, x, options.openings, 0.09)) {
      if (interval.end - interval.start < 0.2) continue;
      buildFacadeMovementJoint(context.at({ x, y: interval.start, z: face + 0.025 }), interval.end - interval.start);
    }
  }
  if (!options.detailed) return animations;
  const upperJoint = Math.min(3.15, options.height - 0.3);
  if (upperJoint > 2.5) {
    for (const interval of horizontalFacadeIntervals(options.width, upperJoint, options.openings, 0.08)) {
      if (interval.end - interval.start < 0.18) continue;
      buildHorizontalFloorJoint(context.at({ x: (interval.start + interval.end) / 2, y: upperJoint, z: face + 0.018 }), interval.end - interval.start);
    }
  }
  const cabinetX = findFacadeServicePosition(options.width, options.height, options.openings, options.width * 0.36, 0.42, 0.52, 0.42);
  if (cabinetX !== null) {
    const route = context.at({ x: cabinetX - 0.1, y: 0.02, z: face + 0.035 });
    buildExteriorConduit(route, 0.38, 0.035);
    buildExternalPipeSleeve(route.at({ x: 0, y: 0.045, z: 0 }), 0.027, 0.05);
  }
  const cowlX = findFacadeServicePosition(options.width, options.height, options.openings, -options.width * 0.32, 0.65, 0.62, 2.1);
  if (cowlX !== null) {
    const vent = context.at({ x: cowlX, y: 2.1, z: face + 0.035 });
    buildVentilationFaceSupport(vent, 0.52, 0.42);
    if (options.variant % 5 === 0) {
      buildRainDeflectingCowl(vent, 0.52, 0.42, 0.22);
    } else if (options.variant % 5 === 1) {
      animations.push(buildExhaustFlapBank(vent, 0.52, 0.42));
    } else {
      animations.push(...buildWallVentilationAssembly(vent, options.variant));
    }
    const box = vent.at({ x: 0.38, y: 0.12, z: 0 });
    if (findFacadeServicePosition(options.width, options.height, options.openings, cowlX + 0.38, 0.16, 0.2, 2.22) === cowlX + 0.38) {
      buildWallJunctionBox(box, 0.16, 0.2);
      context.tube(context.palette.steel, [[cowlX + 0.38, 2.22, face + 0.075], [cowlX + 0.38, 2.18, face + 0.075], [cowlX + 0.27, 2.18, face + 0.075]], 0.008);
    }
  }
  if (options.style === "metal") {
    const x = -options.width / 2 + 0.085;
    for (const interval of verticalFacadeIntervals(Math.min(options.height, 6.6), x, options.openings, 0.1)) {
      if (interval.end - interval.start > 0.25) buildWallPanelTransition(context.at({ x, y: interval.start, z: face + 0.015 }), interval.end - interval.start, 0.045);
    }
  }
  return animations;
}
