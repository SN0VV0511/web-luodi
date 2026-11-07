import { ArchitectureContext } from "./context";
import type { WallOpening } from "./structure";
import { buildDrainSlot, buildFaceFastener, buildFoldedFlashing, buildPerforatedStrip } from "./exterior-fixings";
import { exteriorFaceDepth, openingIsDoor, type ExteriorOptions } from "./exterior-layout";

export function buildSlopedWindowSill(context: ArchitectureContext, width: number, projection: number, face: number, stone = false): void {
  const { limestone, aluminum, rubber } = context.palette;
  const material = stone ? limestone : aluminum;
  const half = width / 2 + 0.045;
  const rear = face - 0.075;
  const front = face + projection;
  context.panel(material, [
    [-half, -0.008, rear],
    [half, -0.008, rear],
    [half, -0.035, front],
    [-half, -0.035, front],
  ]);
  const thickness = stone ? 0.038 : 0.007;
  context.box(material, 0, -0.035 - thickness / 2, front, half * 2, thickness, 0.012);
  context.box(rubber, 0, -0.012, rear + 0.008, width, 0.012, 0.014);
  for (const side of [-1, 1]) {
    context.panel(material, [
      [side * half, -0.008, rear],
      [side * half, -0.035, front],
      [side * half, -0.035 - thickness, front],
      [side * half, -0.008 - thickness, rear],
    ]);
    context.box(material, side * (half - 0.008), 0.008, rear + projection * 0.4, 0.016, 0.035, projection + 0.055);
  }
  context.box(rubber, 0, -0.04 - thickness, front - 0.017, width - 0.02, 0.008, 0.008);
  if (!stone) {
    context.box(aluminum, 0, -0.052, front + 0.002, width + 0.09, 0.03, 0.007);
    for (const side of [-1, 1]) buildFaceFastener(context, side * width * 0.36, -0.048, front + 0.007, 0.006);
  }
}

export function buildHeadFlashing(context: ArchitectureContext, width: number, face: number, projection: number): void {
  const { aluminum, rubber } = context.palette;
  const local = context.at({ x: 0, y: 0, z: face });
  buildFoldedFlashing(local, width + 0.12, [
    [0.075, -0.004],
    [0.012, -0.004],
    [-0.004, projection],
    [-0.03, projection + 0.005],
    [-0.038, projection - 0.009],
  ], 0.004, aluminum);
  local.box(rubber, 0, 0.072, 0.004, width + 0.12, 0.008, 0.01);
  for (const side of [-1, 1]) {
    local.panel(aluminum, [
      [side * (width / 2 + 0.06), 0.012, -0.004],
      [side * (width / 2 + 0.06), -0.004, projection],
      [side * (width / 2 + 0.06), 0.025, projection],
      [side * (width / 2 + 0.06), 0.04, -0.004],
    ]);
  }
  const screws = Math.max(2, Math.ceil(width / 0.6));
  for (let screw = 0; screw < screws; screw++) {
    const x = -width / 2 + 0.08 + (width - 0.16) * screw / (screws - 1);
    buildFaceFastener(local, x, 0.05, 0.008, 0.006);
  }
}

export function buildJambReveal(context: ArchitectureContext, width: number, height: number, face: number, side: number, metal = false): void {
  const { white, aluminum, rubber } = context.palette;
  const x = side * width / 2;
  const rear = 0.026;
  const revealDepth = Math.max(0.025, face - rear);
  const material = metal ? aluminum : white;
  context.box(material, x + side * 0.009, height / 2, rear + revealDepth / 2, 0.018, height, revealDepth);
  context.box(rubber, x - side * 0.008, height / 2, rear + 0.004, 0.009, height - 0.015, 0.009);
  context.box(material, x + side * 0.025, height / 2, face + 0.007, 0.05, height + 0.04, 0.014);
  context.box(rubber, x + side * 0.055, height / 2, face + 0.001, 0.006, height + 0.04, 0.009);
  if (height > 1.2) {
    const fastenerLevels = [0.18, height / 2, height - 0.18];
    for (const y of fastenerLevels) {
      if (metal) buildFaceFastener(context, x + side * 0.025, y, face + 0.016, 0.005);
    }
  }
}

export function buildWindowCornerSeals(context: ArchitectureContext, width: number, height: number, face: number): void {
  const { rubber } = context.palette;
  const radius = 0.032;
  for (const side of [-1, 1]) {
    for (const top of [false, true]) {
      const y = top ? height : 0;
      const vertical = top ? -1 : 1;
      context.box(rubber, side * (width / 2 + 0.034), y + vertical * radius / 2, face + 0.003, 0.007, radius, 0.01);
      context.box(rubber, side * (width / 2 + 0.018), y + vertical * 0.002, face + 0.003, 0.035, 0.007, 0.01);
    }
  }
}

export function buildMasonryLintel(context: ArchitectureContext, width: number, face: number, detailed: boolean): void {
  const { limestone, rubber, aluminum } = context.palette;
  const overlap = 0.15;
  context.box(limestone, 0, 0.065, face + 0.022, width + overlap * 2, 0.13, 0.044);
  context.box(rubber, 0, 0.135, face + 0.045, width + overlap * 2, 0.006, 0.006);
  context.box(aluminum, 0, -0.009, face + 0.02, width + 0.08, 0.008, 0.08);
  if (!detailed) return;
  const stones = Math.max(3, Math.ceil(width / 0.4));
  for (let stone = 1; stone < stones; stone++) {
    const x = -(width + overlap * 2) / 2 + stone * (width + overlap * 2) / stones;
    context.box(rubber, x, 0.065, face + 0.047, 0.005, 0.115, 0.004);
  }
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.08);
    context.box(rubber, x, 0.137, face + 0.045, 0.014, 0.02, 0.009);
  }
}

export function buildInsectScreenRecess(context: ArchitectureContext, width: number, height: number, face: number): void {
  const { dark, aluminum } = context.palette;
  const frameWidth = 0.018;
  const screenWidth = Math.min(0.42, width * 0.26);
  const x = width / 2 - screenWidth / 2 - 0.055;
  const y = height - 0.28;
  context.box(dark, x, y, face - 0.045, screenWidth, 0.24, 0.003);
  context.box(aluminum, x, y + 0.12, face - 0.038, screenWidth, frameWidth, 0.012);
  context.box(aluminum, x, y - 0.12, face - 0.038, screenWidth, frameWidth, 0.012);
  for (const side of [-1, 1]) context.box(aluminum, x + side * screenWidth / 2, y, face - 0.038, frameWidth, 0.24, 0.012);
  const rows = 4;
  for (let row = 1; row < rows; row++) {
    context.box(aluminum, x, y - 0.12 + row * 0.24 / rows, face - 0.035, screenWidth - 0.02, 0.0025, 0.003);
  }
  const columns = Math.max(2, Math.floor(screenWidth / 0.065));
  for (let column = 1; column < columns; column++) {
    context.box(aluminum, x - screenWidth / 2 + column * screenWidth / columns, y, face - 0.034, 0.0025, 0.22, 0.003);
  }
}

export function buildFrameDrainage(context: ArchitectureContext, width: number, face: number): void {
  const { aluminum } = context.palette;
  const count = width > 2.3 ? 3 : 2;
  for (let index = 0; index < count; index++) {
    const x = -width * 0.35 + index * width * 0.7 / (count - 1);
    const local = context.at({ x, y: 0.045, z: face });
    buildDrainSlot(local, 0.058, 0.012, 0.012);
    local.box(aluminum, 0, 0.014, 0.022, 0.072, 0.008, 0.022);
  }
}

export function buildThresholdEndDams(context: ArchitectureContext, width: number, face: number): void {
  const { aluminum, rubber } = context.palette;
  const length = 0.1;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.025);
    context.box(rubber, x, 0.014, face - 0.01, 0.04, 0.027, length);
    context.box(aluminum, x, 0.022, face + 0.008, 0.023, 0.018, length - 0.018);
    context.box(aluminum, x - side * 0.018, 0.01, face + 0.008, 0.025, 0.01, length - 0.018);
  }
}

export function buildRevealExpansionJoint(context: ArchitectureContext, width: number, height: number, face: number): void {
  const { rubber, aluminum } = context.palette;
  const gap = 0.012;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.07);
    context.box(rubber, x, height / 2, face + 0.003, gap, height + 0.12, 0.012);
    context.box(aluminum, x + side * 0.011, height / 2, face + 0.008, 0.007, height + 0.12, 0.012);
  }
  context.box(rubber, 0, height + 0.068, face + 0.003, width + 0.15, gap, 0.012);
}

export function buildLoweredHeadVent(context: ArchitectureContext, width: number, face: number): void {
  const ventWidth = Math.max(0.3, Math.min(0.9, width * 0.4));
  const local = context.at({ x: 0, y: -0.045, z: face - 0.045 });
  buildPerforatedStrip(local, ventWidth, 0.055, 0.012);
  local.box(context.palette.aluminum, 0, 0.034, 0.025, ventWidth + 0.025, 0.014, 0.055);
}

export function buildOpeningConstruction(context: ArchitectureContext, opening: WallOpening, options: ExteriorOptions, index: number): void {
  const face = exteriorFaceDepth(options);
  const local = context.at({ x: opening.x, y: opening.y, z: 0 });
  const door = openingIsDoor(opening);
  const detailed = options.detailed && opening.y < 6.6;
  const metal = options.style === "metal";
  for (const side of [-1, 1]) buildJambReveal(local, opening.width, opening.height, face, side, metal);
  buildHeadFlashing(local.at({ x: 0, y: opening.height, z: 0 }), opening.width, face, door ? 0.075 : 0.045);
  buildWindowCornerSeals(local, opening.width, opening.height, face);
  if (door) {
    buildThresholdEndDams(local, opening.width, face);
  } else {
    buildSlopedWindowSill(local, opening.width, options.style === "stone" ? 0.12 : 0.085, face, options.style === "stone");
  }
  if (!detailed) return;
  buildRevealExpansionJoint(local, opening.width, opening.height, face);
  buildFrameDrainage(local, opening.width, Math.min(face - 0.045, 0.065));
  if (options.style === "stone") buildMasonryLintel(local.at({ x: 0, y: opening.height + 0.025, z: 0 }), opening.width, face, true);
  if (!door && opening.width > 0.8 && (index + options.variant) % 3 === 1) {
    buildInsectScreenRecess(local, opening.width, opening.height, face);
  }
  if (!door && opening.height > 1.7 && options.style !== "stone") {
    buildLoweredHeadVent(local.at({ x: 0, y: opening.height, z: 0 }), opening.width, face);
  }
}
