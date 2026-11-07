import { ArchitectureContext } from "./context";
import {
  buildCantileverBracket,
  buildFaceFastener,
  buildFoldedFlashing,
  buildGroundBolt,
  buildPerforatedStrip,
  buildRailSplice,
  buildSlottedConnection,
} from "./exterior-fixings";
import {
  exteriorDetailHeight,
  exteriorFaceDepth,
  facadePanelLayout,
  horizontalFacadeIntervals,
  type ExteriorOptions,
  type FacadePanel,
} from "./exterior-layout";

export function buildFoldedCassettePanel(context: ArchitectureContext, width: number, height: number, depth = 0.035): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(aluminum, 0, height / 2, depth, width, height, 0.005);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * (width / 2 - 0.004), height / 2, depth / 2, 0.008, height, depth);
    context.box(aluminum, 0, height / 2 + side * (height / 2 - 0.004), depth / 2, width, 0.008, depth);
    context.box(rubber, side * (width / 2 + 0.003), height / 2, depth * 0.2, 0.006, height + 0.004, 0.008);
  }
  const cornerSize = Math.min(0.045, width / 5, height / 5);
  for (const side of [-1, 1]) {
    for (const top of [false, true]) {
      const x = side * (width / 2 - cornerSize / 2);
      const y = top ? height - cornerSize / 2 : cornerSize / 2;
      context.box(steel, x, y, depth - 0.004, cornerSize, cornerSize, 0.008);
      buildFaceFastener(context, x, y, depth + 0.006, Math.min(0.006, cornerSize * 0.16));
    }
  }
  if (width > 0.2 && height > 0.2) {
    const folds = Math.max(1, Math.floor(width / 0.8));
    for (let fold = 0; fold < folds; fold++) {
      const x = -width / 2 + (fold + 0.5) * width / folds;
      context.box(aluminum, x, 0.007, depth * 0.52, 0.025, 0.013, depth * 0.65);
      context.box(rubber, x, -0.003, depth * 0.62, 0.016, 0.008, 0.012);
    }
  }
}

export function buildCassetteOpenJoint(context: ArchitectureContext, height: number, depth = 0.045): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, height / 2, 0, 0.022, height, 0.012);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * 0.016, height / 2, depth / 2, 0.008, height, depth);
    context.box(steel, side * 0.023, height / 2, depth - 0.005, 0.006, height, 0.012);
  }
  const brackets = Math.max(1, Math.ceil(height / 0.7));
  for (let bracket = 0; bracket < brackets; bracket++) {
    const y = (bracket + 0.5) * height / brackets;
    context.box(aluminum, 0, y, depth * 0.3, 0.025, 0.04, 0.012);
    buildFaceFastener(context, 0, y, depth * 0.3 + 0.012, 0.005);
  }
}

export function buildVentilatedPanelSill(context: ArchitectureContext, width: number, depth: number): void {
  const { aluminum, rubber } = context.palette;
  buildFoldedFlashing(context, width, [
    [0.045, 0],
    [-0.025, 0],
    [-0.03, depth],
    [-0.05, depth + 0.006],
  ], 0.004, aluminum);
  buildPerforatedStrip(context.at({ x: 0, y: 0.008, z: depth - 0.015 }), width - 0.012, 0.04, 0.01);
  context.box(rubber, 0, 0.049, 0.005, width, 0.008, 0.01);
}

export function buildCassetteDrainClip(context: ArchitectureContext): void {
  const { aluminum, rubber } = context.palette;
  context.box(aluminum, 0, 0, 0.008, 0.045, 0.065, 0.016);
  context.box(aluminum, 0, -0.025, 0.035, 0.045, 0.012, 0.06);
  context.box(rubber, 0, -0.018, 0.04, 0.035, 0.008, 0.035);
  buildFaceFastener(context, 0, 0.017, 0.021, 0.007);
}

export function buildVisibleStoneAnchor(context: ArchitectureContext, width: number, projection: number): void {
  const { steel, aluminum, rubber } = context.palette;
  context.box(steel, 0, 0, 0.005, width, 0.045, 0.01);
  context.box(aluminum, 0, -0.008, projection / 2, width * 0.58, 0.012, projection);
  context.box(rubber, 0, 0.003, projection - 0.013, width * 0.72, 0.008, 0.03);
  context.box(aluminum, 0, 0.018, projection, width * 0.38, 0.035, 0.012);
  buildFaceFastener(context, 0, 0.008, 0.015, 0.006, true);
}

export function buildStonePanelSoffit(context: ArchitectureContext, width: number, projection: number): void {
  const { limestone, aluminum, rubber } = context.palette;
  context.box(limestone, 0, -0.025, projection / 2, width, 0.05, projection);
  context.box(rubber, 0, -0.053, projection - 0.025, width - 0.025, 0.006, 0.009);
  const anchors = Math.max(2, Math.ceil(width / 0.7));
  for (let anchor = 0; anchor < anchors; anchor++) {
    const x = -width / 2 + 0.06 + anchor * (width - 0.12) / (anchors - 1);
    buildVisibleStoneAnchor(context.at({ x, y: -0.025, z: 0 }), 0.055, projection * 0.68);
    context.box(aluminum, x, -0.058, projection * 0.55, 0.05, 0.012, 0.04);
  }
}

export function buildRainscreenReturn(context: ArchitectureContext, height: number, projection: number, side: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(aluminum, 0, height / 2, projection / 2, 0.012, height, projection);
  context.box(rubber, side * 0.011, height / 2, projection, 0.01, height, 0.018);
  context.box(steel, -side * 0.018, height / 2, 0.008, 0.025, height, 0.016);
  const anchors = Math.max(2, Math.ceil(height / 0.7));
  for (let anchor = 0; anchor < anchors; anchor++) {
    const y = 0.075 + anchor * (height - 0.15) / (anchors - 1);
    const local = context.at({ x: -side * 0.025, y, z: projection / 2, yaw: side * Math.PI / 2 });
    buildSlottedConnection(local, projection * 0.65, 0.095, 0.01);
  }
}

export function buildInsulationAnchorDisc(context: ArchitectureContext, radius = 0.025): void {
  const { aluminum, rubber, white } = context.palette;
  context.oval(rubber, 0, 0, 0.003, radius, radius, 0.006);
  context.oval(white, 0, 0, 0.009, radius * 0.88, radius * 0.88, 0.005);
  for (let rib = 0; rib < 4; rib++) {
    const angle = rib * Math.PI / 2;
    context.beam(aluminum, [0, 0, 0.014], [Math.cos(angle) * radius * 0.74, Math.sin(angle) * radius * 0.74, 0.014], 0.0018);
  }
  buildFaceFastener(context, 0, 0, 0.017, radius * 0.22);
}

export function buildExposedPanelRebate(context: ArchitectureContext, width: number, height: number): void {
  const { aluminum, concrete, rubber } = context.palette;
  context.box(concrete, 0, height / 2, -0.012, width, height, 0.025);
  context.box(rubber, 0, height / 2, 0.005, width - 0.012, height - 0.012, 0.01);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, height / 2, 0.018, 0.018, height, 0.045);
  }
  const anchors = Math.max(2, Math.ceil(height / 0.65));
  for (let anchor = 0; anchor < anchors; anchor++) {
    const y = 0.06 + anchor * (height - 0.12) / (anchors - 1);
    buildInsulationAnchorDisc(context.at({ x: 0, y, z: 0.012 }), Math.min(0.025, width * 0.32));
  }
}

function panelIsLarge(panel: FacadePanel): boolean {
  return panel.right - panel.left > 0.18 && panel.top - panel.bottom > 0.16;
}

export function buildCassetteRainscreen(context: ArchitectureContext, options: ExteriorOptions): void {
  const face = exteriorFaceDepth(options);
  const height = exteriorDetailHeight(options);
  const panels = facadePanelLayout(options.width, height, 1.15, 0.76, options.openings, false);
  for (const panel of panels) {
    const width = panel.right - panel.left - 0.012;
    const panelHeight = panel.top - panel.bottom - 0.012;
    if (width < 0.03 || panelHeight < 0.03) continue;
    const x = (panel.left + panel.right) / 2;
    const local = context.at({ x, y: panel.bottom + 0.006, z: face });
    buildFoldedCassettePanel(local, width, panelHeight, 0.038);
    if (options.detailed && panel.bottom < 3.4 && panelIsLarge(panel)) {
      for (const side of [-1, 1]) {
        buildCassetteDrainClip(local.at({ x: side * width * 0.3, y: -0.003, z: 0.003 }));
      }
    }
    if (panel.column > 0 && panelIsLarge(panel)) {
      buildCassetteOpenJoint(context.at({ x: panel.left, y: panel.bottom + 0.008, z: face + 0.006 }), panelHeight, 0.028);
    }
  }
  for (const interval of horizontalFacadeIntervals(options.width, 0.08, options.openings, 0.04)) {
    const width = interval.end - interval.start;
    if (width < 0.15) continue;
    buildVentilatedPanelSill(context.at({ x: (interval.start + interval.end) / 2, y: 0.07, z: face }), width, 0.05);
  }
}

export function buildRainscreenOpeningReturns(context: ArchitectureContext, options: ExteriorOptions): void {
  if (!options.detailed || options.style === "render") return;
  const face = exteriorFaceDepth(options);
  const limit = exteriorDetailHeight(options);
  for (const opening of options.openings) {
    if (opening.y >= limit || opening.width < 0.5 || opening.height < 0.5) continue;
    const local = context.at({ x: opening.x, y: opening.y, z: face + 0.012 });
    for (const side of [-1, 1]) {
      buildRainscreenReturn(local.at({ x: side * (opening.width / 2 + 0.045), y: 0, z: -0.04 }), opening.height, 0.045, side);
    }
    if (opening.y > 0.2 && options.style === "stone") {
      buildStonePanelSoffit(local.at({ x: 0, y: -0.055, z: -0.035 }), opening.width + 0.08, 0.11);
    }
    if (options.style === "metal") {
      buildRailSplice(local.at({ x: opening.width / 2 + 0.075, y: opening.height * 0.6, z: 0.025 }), 0.05, 0.1, 0.012);
    }
  }
}

export function buildFacadeInspectionRebate(context: ArchitectureContext, options: ExteriorOptions): void {
  if (!options.detailed || options.style === "render") return;
  const width = 0.075;
  const face = exteriorFaceDepth(options);
  const x = options.width / 2 - 0.09;
  const nearest = options.openings.some(opening => Math.abs(opening.x - x) < opening.width / 2 + 0.1 && opening.y < 1.5);
  if (nearest) return;
  buildExposedPanelRebate(context.at({ x, y: 0.25, z: face + 0.015 }), width, 1.15);
  const mounting = context.at({ x: x - 0.08, y: 1.38, z: face + 0.025 });
  buildCantileverBracket(mounting, 0.13, 0.16, 0.045);
  context.box(context.palette.aluminum, x - 0.08, 1.32, face + 0.14, 0.14, 0.015, 0.07);
  buildGroundBolt(context, x - 0.08, 1.337, face + 0.14, 0.009);
}
