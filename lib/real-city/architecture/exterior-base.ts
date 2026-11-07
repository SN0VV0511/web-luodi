import { ArchitectureContext, type Animation } from "./context";
import {
  buildFaceFastener,
  buildFoldedFlashing,
  buildGroundBolt,
  buildInspectionCover,
  buildPerforatedStrip,
} from "./exterior-fixings";
import {
  exteriorFaceDepth,
  findFacadeServicePosition,
  horizontalFacadeIntervals,
  openingIsDoor,
  type ExteriorOptions,
} from "./exterior-layout";

export function buildPlinthWaterproofing(context: ArchitectureContext, width: number, height: number, face: number): void {
  const { concrete, rubber, limestone } = context.palette;
  context.box(concrete, 0, height / 2, face + 0.006, width, height, 0.024);
  context.box(rubber, 0, 0.022, face + 0.02, width, 0.022, 0.014);
  context.box(limestone, 0, height + 0.015, face + 0.018, width + 0.006, 0.03, 0.05);
  const joints = Math.max(1, Math.ceil(width / 0.9));
  for (let joint = 1; joint < joints; joint++) {
    const x = -width / 2 + joint * width / joints;
    context.box(rubber, x, height / 2, face + 0.02, 0.005, height - 0.015, 0.006);
  }
  context.box(rubber, 0, height + 0.035, face + 0.009, width, 0.008, 0.012);
}

export function buildWallGravelMargin(context: ArchitectureContext, width: number, face: number, variant: number): void {
  const { dark, limestone, concrete } = context.palette;
  const depth = 0.18;
  context.box(dark, 0, 0.012, face + depth / 2 + 0.025, width, 0.018, depth);
  context.box(concrete, 0, 0.025, face + depth + 0.035, width, 0.035, 0.028);
  const pebbles = Math.max(2, Math.floor(width / 0.065));
  for (let pebble = 0; pebble < pebbles; pebble++) {
    const x = -width / 2 + (pebble + 0.5) * width / pebbles;
    const mix = (pebble * 17 + variant * 7) % 19;
    const z = face + 0.055 + mix / 19 * 0.1;
    const radius = 0.018 + mix / 19 * 0.012;
    context.oval(pebble % 3 ? limestone : concrete, x, 0.025, z, radius * 1.3, radius * 0.5, radius);
  }
}

export function buildFacadeDrainChannel(context: ArchitectureContext, width: number, depth: number): void {
  const { concrete, steel, aluminum, dark } = context.palette;
  context.box(concrete, 0, 0.003, 0, width + 0.045, 0.035, depth + 0.045);
  context.box(dark, 0, 0.02, 0, width, 0.008, depth);
  for (const side of [-1, 1]) {
    context.box(steel, 0, 0.03, side * depth / 2, width, 0.025, 0.012);
    context.box(steel, side * width / 2, 0.03, 0, 0.012, 0.025, depth);
  }
  const bars = Math.max(3, Math.ceil(width / 0.055));
  for (let bar = 0; bar < bars; bar++) {
    const x = -width / 2 + (bar + 0.5) * width / bars;
    context.box(aluminum, x, 0.034, 0, 0.012, 0.018, depth - 0.016);
  }
  const sections = Math.max(1, Math.ceil(width / 0.6));
  for (let section = 0; section <= sections; section++) {
    const x = -width / 2 + section * width / sections;
    context.box(steel, x, 0.036, 0, 0.017, 0.02, depth);
    if (section < sections) buildGroundBolt(context, x + 0.035, 0.038, depth * 0.32, 0.006);
  }
}

export function buildBasementAirVent(context: ArchitectureContext, width: number, height: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, height / 2, -0.012, width + 0.045, height + 0.045, 0.025);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, height / 2, 0.014, 0.025, height, 0.06);
    context.box(aluminum, 0, height / 2 + side * height / 2, 0.014, width + 0.025, 0.025, 0.06);
  }
  const slats = Math.max(3, Math.ceil(height / 0.055));
  for (let slat = 0; slat < slats; slat++) {
    const y = (slat + 0.5) * height / slats;
    context.panel(aluminum, [[-width / 2, y - 0.018, 0.04], [width / 2, y - 0.018, 0.04], [width / 2, y + 0.018, -0.012], [-width / 2, y + 0.018, -0.012]]);
  }
  const bars = Math.max(2, Math.floor(width / 0.18));
  for (let bar = 1; bar < bars; bar++) {
    context.box(steel, -width / 2 + bar * width / bars, height / 2, 0.055, 0.008, height, 0.012);
  }
  for (const side of [-1, 1]) {
    for (const y of [0.035, height - 0.035]) buildFaceFastener(context, side * (width / 2 - 0.018), y, 0.048, 0.006);
  }
  buildFoldedFlashing(context.at({ x: 0, y: height + 0.018, z: 0 }), width + 0.06, [[0.035, -0.012], [0.008, -0.012], [-0.008, 0.075], [-0.025, 0.08]], 0.003);
}

export function buildServiceTap(context: ArchitectureContext, variant: number): void {
  const { aluminum, steel, bronze, rubber, green } = context.palette;
  context.oval(aluminum, 0, 0, 0.008, 0.055, 0.055, 0.008);
  context.beam(bronze, [0, 0, 0.01], [0, 0, 0.12], 0.018);
  context.beam(bronze, [0, 0, 0.12], [0, -0.075, 0.15], 0.016);
  context.disc(aluminum, 0, -0.075, 0.15, 0.022, 0.025);
  context.disc(rubber, 0, -0.09, 0.15, 0.018, 0.012);
  context.disc(bronze, 0, 0.035, 0.09, 0.015, 0.065);
  context.box(variant % 2 ? green : steel, 0, 0.07, 0.09, 0.12, 0.018, 0.025);
  context.disc(aluminum, 0, 0.081, 0.09, 0.009, 0.01);
  const guardWidth = 0.24;
  context.box(steel, 0, 0.135, 0.08, guardWidth, 0.025, 0.22);
  for (const side of [-1, 1]) {
    context.box(steel, side * guardWidth / 2, 0, 0.075, 0.018, 0.27, 0.2);
    buildFaceFastener(context, side * guardWidth / 2, 0.09, 0.183, 0.007, true);
  }
}

export function buildHoseBracket(context: ArchitectureContext, radius = 0.14): void {
  const { aluminum, rubber, green } = context.palette;
  context.box(aluminum, 0, 0.035, 0.015, radius * 1.2, 0.12, 0.025);
  context.box(aluminum, 0, -0.005, 0.08, radius * 1.1, 0.025, 0.14);
  context.box(aluminum, 0, 0.025, 0.15, radius * 1.2, 0.08, 0.018);
  for (let coil = 0; coil < 3; coil++) {
    const points: [number, number, number][] = [];
    for (let point = 0; point <= 16; point++) {
      const angle = point * Math.PI * 2 / 16;
      points.push([Math.cos(angle) * radius, Math.sin(angle) * radius - radius * 0.6, 0.07 + coil * 0.022]);
    }
    context.tube(coil === 2 ? green : rubber, points, 0.012);
  }
  context.tube(green, [[radius, -radius * 0.6, 0.12], [radius + 0.03, -radius * 1.7, 0.14], [radius - 0.02, -radius * 2.1, 0.12]], 0.012);
  context.box(aluminum, radius - 0.02, -radius * 2.2, 0.12, 0.022, 0.07, 0.03);
}

export function buildFacadeServiceCabinet(context: ArchitectureContext, width: number, height: number, variant: number): void {
  const { aluminum, rubber, steel, yellow } = context.palette;
  context.box(rubber, 0, height / 2, -0.002, width + 0.025, height + 0.025, 0.022);
  context.box(aluminum, 0, height / 2, 0.055, width, height, 0.11);
  context.box(rubber, 0, height / 2, 0.115, width - 0.022, height - 0.022, 0.004);
  context.box(aluminum, 0, height / 2, 0.124, width - 0.035, height - 0.035, 0.014);
  for (const y of [height * 0.2, height * 0.8]) {
    context.box(steel, -width / 2 + 0.025, y, 0.134, 0.018, 0.055, 0.02);
  }
  context.oval(steel, width / 2 - 0.06, height * 0.5, 0.14, 0.013, 0.013, 0.005);
  context.box(rubber, width / 2 - 0.06, height * 0.5, 0.147, 0.003, 0.01, 0.002);
  buildPerforatedStrip(context.at({ x: 0, y: height * 0.2, z: 0.133 }), width * 0.65, 0.065, 0.007);
  context.box(yellow, 0, height * 0.71, 0.139, width * 0.27, 0.055, 0.003);
  context.box(steel, 0, height * 0.71, 0.142, width * 0.18, 0.006, 0.002);
  buildFoldedFlashing(context.at({ x: 0, y: height + 0.025, z: 0 }), width + 0.07, [[0.02, -0.012], [0.008, 0.15], [-0.022, 0.16]], 0.004);
  if (variant % 2 === 0) {
    context.tube(steel, [[-width * 0.25, 0, 0.035], [-width * 0.25, -0.075, 0.035], [-width * 0.25, -0.12, -0.015]], 0.013);
  }
}

export function buildAccessibleServiceMarker(context: ArchitectureContext, category: "water" | "electric" | "gas"): void {
  const { aluminum, green, yellow, red, rubber } = context.palette;
  const color = category === "water" ? green : category === "electric" ? yellow : red;
  context.box(aluminum, 0, 0, 0.012, 0.105, 0.105, 0.024);
  context.box(color, 0, 0, 0.026, 0.085, 0.085, 0.006);
  context.box(rubber, 0, 0.005, 0.031, 0.045, 0.006, 0.003);
  context.box(rubber, 0, -0.012, 0.031, 0.006, 0.025, 0.003);
  for (const side of [-1, 1]) buildFaceFastener(context, side * 0.04, 0.04, 0.028, 0.004);
}

export function buildWallCleanout(context: ArchitectureContext, radius = 0.07): void {
  const { aluminum, rubber, steel } = context.palette;
  context.oval(rubber, 0, 0, 0.003, radius + 0.01, radius + 0.01, 0.014);
  context.oval(aluminum, 0, 0, 0.02, radius, radius, 0.015);
  context.box(steel, 0, 0, 0.038, radius * 0.65, radius * 0.65, 0.018);
  for (const side of [-1, 1]) buildFaceFastener(context, side * radius * 0.68, 0, 0.035, 0.006);
}

export function buildExpansionJointAtGrade(context: ArchitectureContext, width: number, face: number): void {
  const { rubber, aluminum, concrete } = context.palette;
  context.box(rubber, 0, 0.017, face + 0.036, width, 0.012, 0.03);
  context.box(aluminum, 0, 0.024, face + 0.06, width, 0.008, 0.015);
  context.box(concrete, 0, 0.012, face + 0.085, width, 0.015, 0.035);
  const joints = Math.max(1, Math.ceil(width / 1.2));
  for (let joint = 1; joint < joints; joint++) {
    context.box(rubber, -width / 2 + joint * width / joints, 0.022, face + 0.077, 0.006, 0.008, 0.04);
  }
}

export function buildRecessedBootScraper(context: ArchitectureContext, width: number): void {
  const { aluminum, steel, rubber } = context.palette;
  const depth = 0.28;
  context.box(rubber, 0, 0.01, 0, width + 0.025, 0.018, depth + 0.025);
  for (const side of [-1, 1]) {
    context.box(steel, 0, 0.024, side * depth / 2, width, 0.025, 0.018);
    context.box(steel, side * width / 2, 0.024, 0, 0.018, 0.025, depth);
  }
  const blades = Math.max(3, Math.floor(depth / 0.04));
  for (let blade = 0; blade < blades; blade++) {
    const z = -depth / 2 + (blade + 0.5) * depth / blades;
    context.box(aluminum, 0, 0.032, z, width - 0.025, 0.018, 0.012);
    context.box(rubber, 0, 0.042, z, width - 0.035, 0.006, 0.01);
  }
}

export function buildBelowGradeVentFlap(context: ArchitectureContext, width: number, height: number): Animation {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, height / 2, 0, width + 0.04, height + 0.04, 0.025);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, height / 2, 0.022, 0.025, height, 0.065);
    context.box(aluminum, 0, height / 2 + side * height / 2, 0.022, width, 0.025, 0.065);
  }
  const flap = context.moving("Exterior backdraft ventilation flap", [0, height, 0.035], moving => {
    moving.box(aluminum, 0, -height / 2, 0.005, width - 0.015, height - 0.015, 0.018);
    moving.box(rubber, 0, -height + 0.015, 0.008, width - 0.02, 0.012, 0.022);
    for (const side of [-1, 1]) moving.box(steel, side * width * 0.3, -0.014, -0.015, 0.035, 0.028, 0.035);
  });
  let angle = 0;
  let lastTime = -Infinity;
  return (seconds, night, season) => {
    const extraction = season === "summer" ? 0.33 : season === "winter" ? 0.07 : 0.2;
    const target = extraction * (night ? 0.45 : 1);
    const dt = Number.isFinite(lastTime) && seconds >= lastTime ? Math.min(seconds - lastTime, 0.2) : Infinity;
    lastTime = seconds;
    angle += (target - angle) * (Number.isFinite(dt) ? Math.min(1, dt * 0.5) : 1);
    flap.rotation.x = angle;
  };
}

export function buildFoundationInspectionPoint(context: ArchitectureContext, width: number): void {
  const { concrete, rubber, steel } = context.palette;
  context.box(concrete, 0, 0.035, 0, width + 0.05, 0.07, width + 0.05);
  context.box(rubber, 0, 0.073, 0, width, 0.008, width);
  context.box(steel, 0, 0.079, 0, width - 0.015, 0.009, width - 0.015);
  const ribs = Math.max(3, Math.floor(width / 0.035));
  for (let rib = 0; rib < ribs; rib++) {
    const x = -width / 2 + 0.02 + rib * (width - 0.04) / (ribs - 1);
    context.box(concrete, x, 0.087, 0, 0.005, 0.007, width - 0.035);
  }
  for (const side of [-1, 1]) {
    context.box(rubber, side * width * 0.3, 0.092, 0, 0.035, 0.004, 0.015);
  }
}

export function buildExteriorBaseConstruction(context: ArchitectureContext, options: ExteriorOptions): Animation[] {
  const face = exteriorFaceDepth(options);
  const animations: Animation[] = [];
  const intervals = horizontalFacadeIntervals(options.width, 0.14, options.openings, 0.09);
  for (const interval of intervals) {
    const width = interval.end - interval.start;
    if (width < 0.12) continue;
    const local = context.at({ x: (interval.start + interval.end) / 2, y: 0, z: 0 });
    buildPlinthWaterproofing(local, width, 0.12, face);
    buildExpansionJointAtGrade(local, width, face);
    if (options.detailed && width > 0.3) {
      buildWallGravelMargin(local, width - 0.04, face + 0.085, options.variant);
    }
  }
  if (!options.detailed) return animations;
  const cabinetWidth = 0.42;
  const cabinetHeight = 0.52;
  const cabinetX = findFacadeServicePosition(options.width, options.height, options.openings, options.width * 0.36, cabinetWidth, cabinetHeight, 0.42);
  if (cabinetX !== null) {
    const cabinet = context.at({ x: cabinetX, y: 0.42, z: face + 0.035 });
    buildFacadeServiceCabinet(cabinet, cabinetWidth, cabinetHeight, options.variant);
    buildAccessibleServiceMarker(cabinet.at({ x: 0, y: cabinetHeight + 0.13, z: -0.02 }), options.variant % 2 ? "water" : "electric");
    buildFoundationInspectionPoint(context.at({ x: cabinetX, y: -0.075, z: face + 0.53 }), 0.24);
  }
  const tapX = findFacadeServicePosition(options.width, options.height, options.openings, -options.width * 0.35, 0.64, 0.58, 0.38);
  if (tapX !== null && (cabinetX === null || Math.abs(tapX - cabinetX) > 0.85)) {
    const tap = context.at({ x: tapX, y: 0.8, z: face + 0.025 });
    buildServiceTap(tap, options.variant);
    buildHoseBracket(tap.at({ x: 0.26, y: 0.02, z: 0.01 }), 0.12);
    buildWallCleanout(context.at({ x: tapX - 0.12, y: 0.22, z: face + 0.02 }), 0.055);
    buildFacadeDrainChannel(context.at({ x: tapX, y: 0, z: face + 0.5 }), 0.5, 0.17);
  }
  const ventX = findFacadeServicePosition(options.width, options.height, options.openings, 0, 0.58, 0.26, 0.2);
  if (ventX !== null && (cabinetX === null || Math.abs(ventX - cabinetX) > 0.65) && (tapX === null || Math.abs(ventX - tapX) > 0.75)) {
    const vent = context.at({ x: ventX, y: 0.2, z: face + 0.018 });
    if (options.variant % 3 === 0) animations.push(buildBelowGradeVentFlap(vent, 0.5, 0.2));
    else buildBasementAirVent(vent, 0.5, 0.2);
  }
  const accessX = findFacadeServicePosition(options.width, options.height, options.openings, -options.width * 0.16, 0.2, 0.25, 0.32);
  if (accessX !== null && options.variant % 2 === 0) {
    buildInspectionCover(context.at({ x: accessX, y: 0.44, z: face + 0.015 }), 0.18, 0.22, 0.012);
  }
  const door = options.openings.find(opening => openingIsDoor(opening) && opening.width > 0.75);
  if (door) {
    buildRecessedBootScraper(context.at({ x: door.x, y: -0.03, z: face + 0.42 }), Math.min(0.7, door.width - 0.08));
  }
  return animations;
}
