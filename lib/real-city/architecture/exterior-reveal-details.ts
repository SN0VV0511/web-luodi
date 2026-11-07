import { ArchitectureContext } from "./context";
import type { WallOpening } from "./structure";
import {
  buildCantileverBracket,
  buildFaceFastener,
  buildFoldedFlashing,
  buildGroundBolt,
} from "./exterior-fixings";
import { exteriorFaceDepth, openingIsDoor, type ExteriorOptions } from "./exterior-layout";

export function buildWindowSillConsole(context: ArchitectureContext, projection: number): void {
  const { steel, aluminum, rubber } = context.palette;
  buildCantileverBracket(context, projection, 0.15, 0.045);
  context.box(rubber, 0, -0.035, projection * 0.55, 0.065, 0.012, projection * 0.7);
  context.box(aluminum, 0, -0.045, projection * 0.55, 0.065, 0.008, projection * 0.7);
  context.box(steel, 0, -0.075, 0.015, 0.06, 0.025, 0.025);
  buildFaceFastener(context, 0, -0.075, 0.032, 0.008, true);
}

export function buildAdjustableSillBearer(context: ArchitectureContext, width: number, projection: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(aluminum, 0, -0.04, projection / 2, width, 0.02, projection);
  context.box(rubber, 0, -0.025, projection / 2, width - 0.01, 0.01, projection - 0.02);
  for (const side of [-1, 1]) {
    const x = side * width * 0.3;
    context.disc(steel, x, -0.07, projection * 0.65, 0.008, 0.06);
    context.disc(aluminum, x, -0.09, projection * 0.65, 0.015, 0.012);
    context.disc(aluminum, x, -0.048, projection * 0.65, 0.015, 0.01);
    buildGroundBolt(context, x, -0.02, projection * 0.65, 0.008);
  }
}

export function buildSillLateralDam(context: ArchitectureContext, length: number, side: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(aluminum, 0, 0.018, length / 2, 0.012, 0.045, length);
  context.box(aluminum, -side * 0.018, -0.006, length / 2, 0.045, 0.008, length);
  context.box(rubber, side * 0.009, 0.016, length * 0.18, 0.006, 0.04, length * 0.36);
  context.box(aluminum, -side * 0.012, 0.015, length - 0.008, 0.035, 0.04, 0.012);
}

export function buildWindowSillEndCap(context: ArchitectureContext, depth: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, -0.02, depth / 2, 0.015, 0.045, depth);
  context.box(aluminum, 0.009, -0.02, depth / 2, 0.008, 0.045, depth + 0.008);
  context.box(aluminum, -0.015, -0.04, depth / 2, 0.035, 0.008, depth + 0.008);
  const horizontal = context.at({ x: 0.015, y: -0.019, z: depth * 0.56, yaw: Math.PI / 2 });
  buildFaceFastener(horizontal, 0, 0, 0, 0.006);
  context.box(steel, 0.014, -0.042, depth - 0.012, 0.008, 0.01, 0.016);
}

export function buildHeadDripTermination(context: ArchitectureContext, depth: number, side: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(aluminum, 0, 0.022, depth / 2, 0.012, 0.04, depth);
  context.box(aluminum, -side * 0.025, 0.005, depth, 0.06, 0.018, 0.012);
  context.box(rubber, 0, 0.033, 0.012, 0.014, 0.025, 0.025);
  context.box(aluminum, 0, -0.012, depth - 0.012, 0.012, 0.026, 0.025);
}

export function buildRecessedWindowStopBead(context: ArchitectureContext, height: number, side: number): void {
  const { aluminum, white, rubber } = context.palette;
  context.box(aluminum, 0, height / 2, 0, 0.022, height, 0.015);
  context.box(white, side * 0.011, height / 2, 0.012, 0.012, height, 0.025);
  context.box(rubber, -side * 0.009, height / 2, 0.015, 0.006, height, 0.012);
  const screws = Math.max(2, Math.ceil(height / 0.55));
  for (let screw = 0; screw < screws; screw++) {
    const y = 0.1 + screw * (height - 0.2) / (screws - 1);
    buildFaceFastener(context, side * 0.002, y, 0.01, 0.004);
  }
}

export function buildDrainageEndWeir(context: ArchitectureContext, width: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(aluminum, 0, 0.008, 0, width, 0.018, 0.045);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * (width / 2 - 0.006), 0.022, 0, 0.012, 0.04, 0.045);
  }
  context.box(rubber, 0, 0.005, 0.025, width * 0.45, 0.009, 0.006);
  context.box(aluminum, 0, 0.014, 0.035, width * 0.6, 0.008, 0.025);
}

export function buildMiteredRevealCorner(context: ArchitectureContext, width: number, side: number, upper: boolean): void {
  const { aluminum, rubber } = context.palette;
  const vertical = upper ? -1 : 1;
  const size = Math.max(0.025, Math.min(0.055, width * 0.06));
  context.profile(aluminum, [
    [0, 0],
    [-side * size, 0],
    [-side * size, vertical * size * 0.35],
    [-side * size * 0.35, vertical * size],
    [0, vertical * size],
  ], 0.009, [0, 0, 0]);
  context.box(rubber, -side * size * 0.46, vertical * size * 0.46, 0.011, size * 0.72, 0.003, 0.003, 0, -side * vertical * Math.PI / 4);
}

export function buildSillStoneJoint(context: ArchitectureContext, depth: number): void {
  const { rubber, aluminum, limestone } = context.palette;
  context.box(rubber, 0, -0.02, depth / 2, 0.008, 0.035, depth);
  context.box(aluminum, 0, -0.041, depth / 2, 0.025, 0.005, depth - 0.02);
  for (const side of [-1, 1]) {
    context.box(limestone, side * 0.012, -0.019, depth - 0.005, 0.012, 0.034, 0.018);
  }
}

export function buildRecessedRollerGuideEnd(context: ArchitectureContext, height: number, side: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(aluminum, 0, height / 2, 0, 0.025, height, 0.045);
  context.box(rubber, -side * 0.01, height / 2, 0.025, 0.008, height - 0.02, 0.018);
  context.box(aluminum, 0, 0.015, 0.025, 0.03, 0.03, 0.025);
  context.box(rubber, -side * 0.005, 0.036, 0.03, 0.013, 0.012, 0.016);
  const rows = Math.max(2, Math.ceil(height / 0.7));
  for (let row = 0; row < rows; row++) {
    const y = 0.12 + row * (height - 0.24) / (rows - 1);
    buildFaceFastener(context, side * 0.004, y, 0.028, 0.005);
  }
}

export function buildDoorThresholdDrainage(context: ArchitectureContext, width: number, face: number): void {
  const { aluminum, rubber } = context.palette;
  const usable = Math.max(0.2, width - 0.09);
  const channels = Math.max(2, Math.floor(usable / 0.18));
  for (let channel = 0; channel < channels; channel++) {
    const x = -usable / 2 + (channel + 0.5) * usable / channels;
    context.box(rubber, x, 0.008, face + 0.006, 0.035, 0.012, 0.012);
    context.box(aluminum, x, 0.015, face + 0.014, 0.045, 0.005, 0.018);
  }
  context.box(aluminum, 0, -0.002, face + 0.04, usable, 0.012, 0.045);
  context.box(rubber, 0, 0.005, face + 0.055, usable - 0.02, 0.003, 0.006);
}

export function buildTransomPressureEqualizer(context: ArchitectureContext, width: number): void {
  const { aluminum, rubber } = context.palette;
  const ports = Math.max(2, Math.ceil(width / 1.1));
  for (let port = 0; port < ports; port++) {
    const x = -width / 2 + 0.12 + port * (width - 0.24) / (ports - 1);
    context.box(rubber, x, 0, 0.005, 0.045, 0.015, 0.01);
    context.box(aluminum, x, 0.012, 0.016, 0.06, 0.006, 0.025);
    for (const side of [-1, 1]) {
      context.box(aluminum, x + side * 0.027, 0, 0.016, 0.006, 0.025, 0.025);
    }
  }
}

export function buildSillThermalBreak(context: ArchitectureContext, width: number, projection: number): void {
  const { rubber, aluminum, white } = context.palette;
  context.box(rubber, 0, -0.018, projection / 2, width, 0.016, projection);
  context.box(white, 0, -0.008, projection / 2, width - 0.008, 0.006, projection - 0.01);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, -0.012, projection / 2, 0.006, 0.025, projection);
    context.box(rubber, side * width * 0.3, -0.024, projection * 0.75, 0.018, 0.009, 0.025);
  }
  const channels = Math.max(2, Math.ceil(width / 0.035));
  for (let channel = 0; channel < channels; channel++) {
    const x = -width / 2 + (channel + 0.5) * width / channels;
    context.box(aluminum, x, -0.021, projection, 0.008, 0.012, 0.008);
  }
}

export function buildFrameAnchorCover(context: ArchitectureContext, side: number): void {
  const { aluminum, rubber, white } = context.palette;
  context.box(rubber, 0, 0, 0, 0.052, 0.095, 0.012);
  context.box(aluminum, 0, 0, 0.01, 0.045, 0.085, 0.014);
  context.box(white, side * 0.014, 0, 0.021, 0.014, 0.065, 0.014);
  buildFaceFastener(context, -side * 0.009, -0.024, 0.021, 0.005);
  buildFaceFastener(context, -side * 0.009, 0.024, 0.021, 0.005);
  context.box(rubber, side * 0.023, 0, 0.019, 0.004, 0.082, 0.008);
}

export function buildThresholdBrushSeal(context: ArchitectureContext, width: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(aluminum, 0, 0.028, 0, width, 0.018, 0.025);
  context.box(rubber, 0, 0.019, 0.008, width - 0.01, 0.009, 0.015);
  const clusters = Math.max(4, Math.ceil(width / 0.024));
  for (let cluster = 0; cluster < clusters; cluster++) {
    const x = -width / 2 + (cluster + 0.5) * width / clusters;
    context.box(rubber, x, 0.009, 0.013, 0.009, 0.018, 0.006);
    if (cluster % 4 === 0) {
      context.box(aluminum, x, 0.027, 0.014, 0.008, 0.006, 0.004);
    }
  }
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, 0.02, 0, 0.008, 0.028, 0.028);
  }
}

export function buildHeadVentRetentionClip(context: ArchitectureContext, width: number): void {
  const { aluminum, steel, rubber } = context.palette;
  const clips = Math.max(2, Math.ceil(width / 0.65));
  for (let clip = 0; clip < clips; clip++) {
    const x = -width / 2 + 0.06 + clip * (width - 0.12) / (clips - 1);
    context.box(steel, x, 0, 0, 0.03, 0.04, 0.012);
    context.box(aluminum, x, -0.012, 0.018, 0.03, 0.012, 0.035);
    context.box(rubber, x, -0.004, 0.025, 0.022, 0.007, 0.018);
    buildFaceFastener(context, x, 0.011, 0.009, 0.005);
  }
}

export function buildRevealConstructionDetails(context: ArchitectureContext, opening: WallOpening, options: ExteriorOptions): void {
  if (!options.detailed || opening.y > 6.6 || opening.width < 0.6 || opening.height < 0.6) return;
  const face = exteriorFaceDepth(options);
  const local = context.at({ x: opening.x, y: opening.y, z: 0 });
  const door = openingIsDoor(opening);
  for (const side of [-1, 1]) {
    const x = side * (opening.width / 2 + 0.005);
    buildRecessedWindowStopBead(local.at({ x, y: 0.025, z: 0.055, yaw: side * Math.PI / 2 }), opening.height - 0.05, side);
    buildHeadDripTermination(local.at({ x: side * (opening.width / 2 + 0.055), y: opening.height + 0.018, z: face - 0.012 }), 0.08, side);
    buildMiteredRevealCorner(local.at({ x, y: opening.height, z: face + 0.016 }), opening.width, side, true);
    for (const y of [0.16, opening.height - 0.16]) {
      buildFrameAnchorCover(local.at({ x: x + side * 0.012, y, z: face - 0.035, yaw: -side * Math.PI / 2 }), side);
    }
    if (door) {
      buildRecessedRollerGuideEnd(local.at({ x: x + side * 0.035, y: 0.01, z: face - 0.025 }), 0.28, side);
    } else {
      buildSillLateralDam(local.at({ x: side * (opening.width / 2 + 0.045), y: -0.012, z: face - 0.045 }), 0.13, side);
      buildWindowSillEndCap(local.at({ x: side * (opening.width / 2 + 0.05), y: -0.015, z: face - 0.04, yaw: side < 0 ? Math.PI : 0 }), 0.13);
      buildMiteredRevealCorner(local.at({ x, y: 0, z: face + 0.016 }), opening.width, side, false);
    }
  }
  if (door) {
    buildDoorThresholdDrainage(local, opening.width, face);
    buildThresholdBrushSeal(local.at({ x: 0, y: 0, z: face - 0.075 }), opening.width - 0.055);
    return;
  }
  const supportCount = Math.max(2, Math.ceil(opening.width / 1.3));
  for (let support = 0; support < supportCount; support++) {
    const x = -opening.width / 2 + 0.15 + support * (opening.width - 0.3) / (supportCount - 1);
    const bracket = local.at({ x, y: -0.09, z: face - 0.012 });
    if (options.style === "stone") buildWindowSillConsole(bracket, 0.12);
    else buildAdjustableSillBearer(bracket, 0.1, 0.11);
    buildSillThermalBreak(bracket.at({ x: 0, y: 0.055, z: 0 }), 0.095, 0.095);
  }
  if (opening.width > 2.5 && options.style === "stone") {
    buildSillStoneJoint(local.at({ x: 0, y: -0.01, z: face - 0.045 }), 0.15);
  }
  buildDrainageEndWeir(local.at({ x: opening.width * 0.35, y: -0.035, z: face + 0.055 }), 0.065);
  buildTransomPressureEqualizer(local.at({ x: 0, y: opening.height - 0.027, z: 0.057 }), opening.width - 0.08);
  buildHeadVentRetentionClip(local.at({ x: 0, y: opening.height - 0.035, z: face - 0.05 }), opening.width - 0.08);
  buildFoldedFlashing(local.at({ x: 0, y: opening.height + 0.045, z: face - 0.015 }), opening.width + 0.08, [[0.015, 0], [0.005, 0.065], [-0.012, 0.07]], 0.003);
}
