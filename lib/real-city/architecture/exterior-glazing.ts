import { ArchitectureContext } from "./context";
import { buildAdjustableTieRod, buildAngleCleat, buildFaceFastener, buildFoldedFlashing, buildSlottedConnection } from "./exterior-fixings";

export function buildGlassBearingShoe(context: ArchitectureContext, width: number, depth = 0.095): void {
  const { aluminum, rubber, steel } = context.palette;
  const shoeHeight = 0.065;
  context.box(aluminum, 0, -shoeHeight / 2, 0, width, shoeHeight, depth);
  context.box(rubber, 0, 0.007, 0, width - 0.012, 0.014, depth - 0.015);
  context.box(aluminum, 0, 0.014, depth / 2, width, 0.034, 0.012);
  context.box(aluminum, 0, 0.014, -depth / 2, width, 0.034, 0.012);
  for (const side of [-1, 1]) {
    context.box(steel, side * width * 0.3, -0.025, 0, 0.018, 0.02, depth + 0.012);
    buildFaceFastener(context, side * width * 0.3, -0.025, depth / 2 + 0.008, 0.007, true);
  }
}

export function buildGlassClamp(context: ArchitectureContext, horizontal = true): void {
  const { aluminum, rubber } = context.palette;
  const width = horizontal ? 0.095 : 0.065;
  const height = horizontal ? 0.065 : 0.095;
  context.box(rubber, 0, 0, 0, width, height, 0.012);
  context.roundedBox(aluminum, 0, 0, 0.018, width - 0.005, height - 0.005, 0.025, 0.01);
  for (const side of [-1, 1]) {
    const x = horizontal ? side * 0.026 : 0;
    const y = horizontal ? 0 : side * 0.026;
    buildFaceFastener(context, x, y, 0.033, 0.007, true);
  }
}

export function buildSpiderConnection(context: ArchitectureContext, armLength = 0.16, fourArms = true): void {
  const { steel, aluminum, rubber } = context.palette;
  context.oval(steel, 0, 0, -0.035, 0.035, 0.035, 0.025);
  const signs = fourArms ? [-1, 1] : [1];
  for (const side of [-1, 1]) {
    for (const vertical of signs) {
      const x = side * armLength;
      const y = vertical * armLength * 0.7;
      context.beam(steel, [0, 0, -0.035], [x, y, -0.008], 0.018);
      context.oval(rubber, x, y, 0.006, 0.023, 0.023, 0.006);
      context.oval(aluminum, x, y, 0.017, 0.019, 0.019, 0.009);
      buildFaceFastener(context, x, y, 0.029, 0.01, true);
    }
  }
  context.box(steel, 0, 0, -0.085, 0.035, 0.035, 0.1);
}

export function buildGlazingPressurePlate(context: ArchitectureContext, length: number, vertical: boolean, cover = true): void {
  const { aluminum, rubber, steel } = context.palette;
  const width = vertical ? 0.045 : length;
  const height = vertical ? length : 0.045;
  context.box(rubber, 0, 0, 0, width + (vertical ? 0.018 : 0), height + (vertical ? 0 : 0.018), 0.012);
  context.box(aluminum, 0, 0, 0.012, width, height, 0.018);
  const fasteners = Math.max(2, Math.ceil(length / 0.3));
  for (let index = 0; index < fasteners; index++) {
    const distance = -length / 2 + 0.045 + index * (length - 0.09) / (fasteners - 1);
    const x = vertical ? 0 : distance;
    const y = vertical ? distance : 0;
    if (!cover || index === 0 || index === fasteners - 1) buildFaceFastener(context, x, y, 0.024, 0.006);
  }
  if (cover) {
    context.box(aluminum, 0, 0, 0.036, width + (vertical ? 0.006 : 0), height + (vertical ? 0 : 0.006), 0.018);
    for (const side of [-1, 1]) {
      const x = vertical ? side * 0.022 : 0;
      const y = vertical ? 0 : side * 0.022;
      context.box(steel, x, y, 0.029, vertical ? 0.004 : length, vertical ? length : 0.004, 0.008);
    }
  }
}

export function buildCurtainWallTransomEnd(context: ArchitectureContext, width: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(aluminum, 0, 0, -0.035, width, 0.07, 0.1);
  context.box(rubber, 0, -0.025, 0.021, width + 0.01, 0.018, 0.012);
  context.box(steel, 0, 0, -0.09, width * 0.7, 0.035, 0.025);
  for (const side of [-1, 1]) {
    context.box(rubber, side * width / 2, 0.006, -0.03, 0.009, 0.073, 0.12);
    buildFaceFastener(context, side * width * 0.25, 0.006, 0.022, 0.006);
  }
}

export function buildGlazingSillPan(context: ArchitectureContext, width: number, face: number): void {
  const { aluminum, rubber } = context.palette;
  const local = context.at({ x: 0, y: 0, z: face });
  buildFoldedFlashing(local, width + 0.06, [
    [0.055, -0.11],
    [-0.008, -0.11],
    [-0.02, 0.065],
    [-0.045, 0.07],
  ], 0.004, aluminum);
  local.box(rubber, 0, 0.04, -0.1, width, 0.015, 0.012);
  const drainCount = Math.max(2, Math.ceil(width / 0.9));
  for (let index = 0; index < drainCount; index++) {
    const x = -width / 2 + 0.08 + index * (width - 0.16) / (drainCount - 1);
    local.box(rubber, x, -0.032, 0.073, 0.035, 0.009, 0.008);
    local.box(aluminum, x, -0.021, 0.082, 0.05, 0.005, 0.025);
  }
  for (const side of [-1, 1]) {
    local.box(aluminum, side * (width / 2 + 0.025), 0.015, -0.025, 0.008, 0.065, 0.18);
  }
}

export function buildMullionMovementJoint(context: ArchitectureContext, depth: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, 0, -depth / 2, 0.055, 0.018, depth);
  context.box(aluminum, -0.028, 0, -depth / 2, 0.01, 0.085, depth);
  context.box(aluminum, 0.028, 0, -depth / 2, 0.01, 0.085, depth);
  context.box(steel, 0, 0, 0.014, 0.045, 0.065, 0.018);
  buildFaceFastener(context, 0, -0.022, 0.027, 0.006);
  buildFaceFastener(context, 0, 0.022, 0.027, 0.006);
}

export function buildCurtainWallAnchor(context: ArchitectureContext, projection: number): void {
  const { steel, aluminum, rubber } = context.palette;
  buildAngleCleat(context, 0.16, 0.12, projection);
  context.box(steel, 0, 0.012, projection - 0.02, 0.08, 0.11, 0.026);
  buildSlottedConnection(context.at({ x: 0, y: 0.012, z: projection - 0.004 }), 0.09, 0.1, 0.014);
  context.box(rubber, 0, 0.012, projection + 0.02, 0.08, 0.09, 0.012);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * 0.052, -0.038, projection - 0.045, 0.016, 0.028, 0.075);
  }
}

export function buildLaminateEdge(context: ArchitectureContext, width: number, height: number, face: number): void {
  const { glass, rubber, aluminum } = context.palette;
  const lineWidth = 0.007;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.025);
    context.box(glass, x, height / 2, face - 0.005, lineWidth, height - 0.04, 0.026);
    context.box(rubber, x + side * 0.009, height / 2, face - 0.008, 0.008, height - 0.04, 0.024);
  }
  for (const y of [0.025, height - 0.025]) {
    context.box(glass, 0, y, face - 0.005, width - 0.04, lineWidth, 0.026);
    context.box(aluminum, 0, y, face - 0.02, width - 0.04, 0.012, 0.008);
  }
}

export function buildCurtainWallSoffitJoint(context: ArchitectureContext, width: number, face: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(aluminum, 0, -0.025, face - 0.04, width, 0.045, 0.12);
  context.box(rubber, 0, -0.052, face + 0.008, width, 0.012, 0.016);
  const divisions = Math.max(1, Math.ceil(width / 0.6));
  for (let division = 1; division < divisions; division++) {
    const x = -width / 2 + division * width / divisions;
    context.box(rubber, x, -0.026, face + 0.023, 0.006, 0.044, 0.005);
  }
  for (const side of [-1, 1]) buildFaceFastener(context, side * (width / 2 - 0.045), -0.024, face + 0.025, 0.006);
}

export function buildGlazingCornerProtection(context: ArchitectureContext, width: number, height: number, face: number): void {
  const { aluminum, rubber } = context.palette;
  const guard = Math.min(0.095, width * 0.07);
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.018);
    for (const level of [0.04, height - 0.04]) {
      const sign = level < height / 2 ? 1 : -1;
      context.box(rubber, x, level + sign * guard / 2, face + 0.005, 0.027, guard, 0.015);
      context.box(aluminum, x, level + sign * guard / 2, face + 0.018, 0.018, guard, 0.014);
      context.box(aluminum, x - side * guard / 2, level, face + 0.018, guard, 0.018, 0.014);
    }
  }
}

export function buildGlassFinSupport(context: ArchitectureContext, height: number, projection: number): void {
  const { glass, aluminum, rubber } = context.palette;
  context.box(glass, 0, height / 2, -projection / 2, 0.026, height - 0.12, projection);
  for (const y of [0.065, height - 0.065]) {
    context.box(rubber, 0, y, -projection / 2, 0.045, 0.07, projection + 0.025);
    for (const side of [-1, 1]) {
      context.box(aluminum, side * 0.031, y, -projection / 2, 0.018, 0.07, projection + 0.025);
      buildFaceFastener(context.at({ x: side * 0.04, y, z: -projection / 2, yaw: side * Math.PI / 2 }), 0, 0, 0.008, 0.009, true);
    }
  }
}

export function buildPointSupportedGlazingDetails(context: ArchitectureContext, width: number, height: number, face: number): void {
  const bays = Math.max(2, Math.ceil(width / 1.45));
  const bay = width / bays;
  const lower = Math.min(0.24, height * 0.12);
  const upper = height - lower;
  for (let mullion = 1; mullion < bays; mullion++) {
    const x = -width / 2 + mullion * bay;
    const local = context.at({ x, y: 0, z: face - 0.04 });
    buildGlassFinSupport(local, height, 0.22);
    buildSpiderConnection(local.at({ x: 0, y: lower, z: 0.05 }), Math.min(0.16, bay * 0.18));
    buildSpiderConnection(local.at({ x: 0, y: upper, z: 0.05 }), Math.min(0.16, bay * 0.18));
    buildAdjustableTieRod(local, [0, lower, -0.17], [0, upper, -0.17], 0.009);
  }
  for (let pane = 0; pane < bays; pane++) {
    const x = -width / 2 + (pane + 0.5) * bay;
    for (const side of [-1, 1]) {
      buildGlassBearingShoe(context.at({ x: x + side * bay * 0.26, y: 0.035, z: face - 0.025 }), 0.1, 0.075);
    }
  }
}

export function buildUnitizedGlazingDetails(context: ArchitectureContext, width: number, height: number, face: number, detailed: boolean): void {
  buildGlazingSillPan(context, width, face);
  buildLaminateEdge(context, width, height, face);
  buildGlazingCornerProtection(context, width, height, face);
  buildCurtainWallSoffitJoint(context.at({ x: 0, y: height, z: 0 }), width, face);
  if (!detailed) return;
  const bays = Math.max(1, Math.ceil(width / 1.35));
  const bay = width / bays;
  for (let pane = 0; pane < bays; pane++) {
    const center = -width / 2 + (pane + 0.5) * bay;
    for (const side of [-1, 1]) {
      const x = center + side * bay * 0.28;
      buildGlassBearingShoe(context.at({ x, y: 0.025, z: face - 0.025 }), Math.min(0.11, bay * 0.2), 0.075);
    }
  }
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.045);
    buildCurtainWallAnchor(context.at({ x, y: height - 0.12, z: face - 0.1 }), 0.095);
    buildMullionMovementJoint(context.at({ x: side * width / 2, y: height - 0.065, z: face - 0.01 }), 0.1);
    buildCurtainWallTransomEnd(context.at({ x: side * (width / 2 - 0.05), y: 0.025, z: face - 0.015 }), 0.1);
    buildGlazingPressurePlate(context.at({ x: side * (width / 2 - 0.018), y: height / 2, z: face - 0.018 }), height - 0.06, true);
    buildGlassClamp(context.at({ x: side * (width / 2 - 0.055), y: 0.065, z: face - 0.012 }), true);
  }
}
