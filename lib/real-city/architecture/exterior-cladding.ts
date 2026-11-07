import type * as THREE from "three";
import { ArchitectureContext } from "./context";
import { buildFaceFastener, buildFoldedFlashing, buildPerforatedStrip } from "./exterior-fixings";
import {
  exteriorDetailHeight,
  exteriorFaceDepth,
  facadeBounds,
  facadePanelLayout,
  horizontalFacadeIntervals,
  solidFacadeRegions,
  verticalFacadeIntervals,
  type ExteriorOptions,
  type FacadePanel,
} from "./exterior-layout";
import { buildCassetteRainscreen, buildFacadeInspectionRebate, buildRainscreenOpeningReturns } from "./exterior-rainscreen";

function buildPanelPerimeter(context: ArchitectureContext, panel: FacadePanel, face: number, thickness: number, material: THREE.Material): void {
  const width = panel.right - panel.left;
  const height = panel.top - panel.bottom;
  if (width < 0.04 || height < 0.04) return;
  const x = (panel.left + panel.right) / 2;
  const y = (panel.bottom + panel.top) / 2;
  context.box(material, x, y, face + thickness / 2, width - 0.009, height - 0.009, thickness);
  context.box(context.palette.rubber, panel.left + 0.001, y, face + 0.002, 0.005, height, 0.008);
  context.box(context.palette.rubber, x, panel.bottom + 0.001, face + 0.002, width, 0.005, 0.008);
}

function buildPanelRivets(context: ArchitectureContext, panel: FacadePanel, face: number, edgeDistance: number, large = false): void {
  const width = panel.right - panel.left;
  const height = panel.top - panel.bottom;
  if (width < edgeDistance * 3 || height < edgeDistance * 3) return;
  const left = panel.left + edgeDistance;
  const right = panel.right - edgeDistance;
  const bottom = panel.bottom + edgeDistance;
  const top = panel.top - edgeDistance;
  for (const x of [left, right]) {
    buildFaceFastener(context, x, bottom, face, large ? 0.009 : 0.006);
    buildFaceFastener(context, x, top, face, large ? 0.009 : 0.006);
    if (height > 1.4) buildFaceFastener(context, x, (bottom + top) / 2, face, large ? 0.009 : 0.006);
  }
}

export function buildFiberCementRainscreen(context: ArchitectureContext, options: ExteriorOptions): void {
  const face = exteriorFaceDepth(options);
  const height = exteriorDetailHeight(options);
  const width = options.width;
  const panels = facadePanelLayout(width, height, 1.2, 0.9, options.openings, options.variant % 2 === 0);
  const primary = options.variant % 3 === 1 ? context.palette.white : context.palette.concrete;
  for (const panel of panels) {
    buildPanelPerimeter(context, panel, face + 0.006, 0.014, primary);
    if (options.detailed && panel.bottom < 3.2) buildPanelRivets(context, panel, face + 0.024, 0.045);
  }
  for (const interval of horizontalFacadeIntervals(width, 0.095, options.openings, 0.04)) {
    const local = context.at({ x: (interval.start + interval.end) / 2, y: 0.075, z: face + 0.005 });
    if (interval.end - interval.start > 0.1) buildPerforatedStrip(local, interval.end - interval.start, 0.055, 0.008);
  }
}

export function buildStonePanelRainscreen(context: ArchitectureContext, options: ExteriorOptions): void {
  const face = exteriorFaceDepth(options);
  const height = exteriorDetailHeight(options);
  const panels = facadePanelLayout(options.width, height, 0.9, 0.52, options.openings, true);
  const { limestone, aluminum, rubber } = context.palette;
  for (const panel of panels) {
    const width = panel.right - panel.left;
    const panelHeight = panel.top - panel.bottom;
    buildPanelPerimeter(context, panel, face + 0.008, 0.034, limestone);
    if (!options.detailed || panel.bottom > 3.2 || width < 0.16 || panelHeight < 0.12) continue;
    const x = (panel.left + panel.right) / 2;
    for (const side of [-1, 1]) {
      const clipX = x + side * Math.min(width * 0.3, 0.25);
      context.box(aluminum, clipX, panel.bottom + 0.006, face + 0.038, 0.033, 0.012, 0.014);
      context.box(rubber, clipX, panel.bottom + 0.013, face + 0.02, 0.05, 0.005, 0.025);
    }
  }
  for (const interval of horizontalFacadeIntervals(options.width, height - 0.025, options.openings)) {
    const local = context.at({ x: (interval.start + interval.end) / 2, y: height, z: face + 0.025 });
    buildFoldedFlashing(local, interval.end - interval.start, [[0.03, -0.025], [0.015, 0.045], [-0.018, 0.052]], 0.004);
  }
}

export function buildStandingSeamPanels(context: ArchitectureContext, options: ExteriorOptions): void {
  const face = exteriorFaceDepth(options);
  const height = exteriorDetailHeight(options);
  const { aluminum, rubber, steel } = context.palette;
  const regions = solidFacadeRegions(facadeBounds(options.width, height), options.openings);
  for (const region of regions) {
    context.box(aluminum, (region.left + region.right) / 2, (region.bottom + region.top) / 2, face + 0.008, region.right - region.left, region.top - region.bottom, 0.014);
  }
  const panels = Math.max(1, Math.ceil(options.width / 0.45));
  const panelWidth = options.width / panels;
  for (let panel = 0; panel <= panels; panel++) {
    const x = -options.width / 2 + panel * panelWidth;
    for (const interval of verticalFacadeIntervals(height, x, options.openings, 0.065)) {
      const y = (interval.start + interval.end) / 2;
      const length = interval.end - interval.start;
      context.box(rubber, x, y, face + 0.017, 0.018, length, 0.006);
      context.box(aluminum, x - 0.006, y, face + 0.025, 0.006, length, 0.028);
      context.box(aluminum, x + 0.004, y, face + 0.029, 0.014, length, 0.009);
      if (options.detailed && length > 0.2) {
        for (const edge of [interval.start + 0.065, interval.end - 0.065]) {
          context.box(steel, x, edge, face + 0.018, 0.023, 0.03, 0.012);
        }
      }
    }
  }
  const divisions = Math.max(1, Math.ceil(height / 2.7));
  for (let division = 1; division < divisions; division++) {
    const y = division * height / divisions;
    for (const interval of horizontalFacadeIntervals(options.width, y, options.openings)) {
      const local = context.at({ x: (interval.start + interval.end) / 2, y, z: face + 0.018 });
      buildFoldedFlashing(local, interval.end - interval.start, [[0.025, 0], [0.005, 0.018], [-0.025, 0.018]], 0.003, aluminum);
    }
  }
}

export function buildRenderControlJoints(context: ArchitectureContext, options: ExteriorOptions): void {
  const { concrete, rubber, white } = context.palette;
  const face = exteriorFaceDepth(options);
  const height = options.height;
  const spacing = Math.max(2, Math.min(3.1, height / Math.max(1, Math.round(height / 3.1))));
  for (let y = spacing; y < height - 0.2; y += spacing) {
    const intervals = horizontalFacadeIntervals(options.width, y, options.openings, 0.06);
    for (const interval of intervals) {
      const width = interval.end - interval.start;
      const x = (interval.start + interval.end) / 2;
      context.box(concrete, x, y, face + 0.003, width, 0.025, 0.006);
      context.box(rubber, x, y, face + 0.006, width, 0.006, 0.004);
      context.box(white, x, y - 0.02, face + 0.012, width, 0.012, 0.02);
    }
  }
  const joints = Math.floor(options.width / 6);
  for (let joint = 1; joint <= joints; joint++) {
    const x = -options.width / 2 + joint * options.width / (joints + 1);
    for (const interval of verticalFacadeIntervals(height, x, options.openings, 0.075)) {
      const center = (interval.start + interval.end) / 2;
      const length = interval.end - interval.start;
      context.box(concrete, x, center, face + 0.004, 0.022, length, 0.008);
      context.box(rubber, x, center, face + 0.009, 0.007, length, 0.004);
    }
  }
}

export function buildExternalInsulationBase(context: ArchitectureContext, options: ExteriorOptions): void {
  const face = exteriorFaceDepth(options);
  const { aluminum, concrete, rubber } = context.palette;
  const y = 0.19;
  const intervals = horizontalFacadeIntervals(options.width, y, options.openings, 0.08);
  for (const interval of intervals) {
    const width = interval.end - interval.start;
    if (width < 0.08) continue;
    const local = context.at({ x: (interval.start + interval.end) / 2, y, z: face });
    local.box(concrete, 0, -0.055, -0.005, width, 0.11, 0.025);
    local.box(rubber, 0, -0.012, 0.011, width, 0.012, 0.005);
    buildFoldedFlashing(local, width, [[0.045, -0.01], [-0.02, -0.01], [-0.02, 0.033], [-0.038, 0.04]], 0.004, aluminum);
    if (options.detailed) {
      const screws = Math.max(1, Math.floor(width / 0.6));
      for (let screw = 0; screw < screws; screw++) {
        const x = -width / 2 + (screw + 0.5) * width / screws;
        buildFaceFastener(local, x, 0.025, -0.002, 0.006);
      }
    }
  }
}

export function buildFacadeCornerTrim(context: ArchitectureContext, options: ExteriorOptions): void {
  const face = exteriorFaceDepth(options);
  const height = options.height;
  const { aluminum, limestone, rubber } = context.palette;
  const material = options.style === "stone" ? limestone : aluminum;
  for (const side of [-1, 1]) {
    const x = side * (options.width / 2 - 0.025);
    for (const interval of verticalFacadeIntervals(height, x, options.openings, 0.04)) {
      const length = interval.end - interval.start;
      const y = (interval.start + interval.end) / 2;
      context.box(rubber, x - side * 0.023, y, face + 0.01, 0.01, length, 0.012);
      context.box(material, x, y, face + 0.015, 0.055, length, 0.026);
      context.box(material, side * (options.width / 2 + 0.002), y, face - 0.007, 0.015, length, 0.055);
      if (options.detailed && options.style === "metal") {
        const fixings = Math.max(2, Math.ceil(Math.min(length, 6) / 0.9));
        for (let index = 0; index < fixings; index++) {
          const fixingY = interval.start + 0.1 + index * Math.max(0.1, Math.min(length, 6) - 0.2) / Math.max(1, fixings - 1);
          if (fixingY < interval.end - 0.05) buildFaceFastener(context, x, fixingY, face + 0.031, 0.006);
        }
      }
    }
  }
}

export function buildWallTopClosure(context: ArchitectureContext, options: ExteriorOptions): void {
  const { aluminum, rubber } = context.palette;
  const face = exteriorFaceDepth(options);
  for (const interval of horizontalFacadeIntervals(options.width, options.height - 0.015, options.openings)) {
    const local = context.at({ x: (interval.start + interval.end) / 2, y: options.height, z: face });
    const width = interval.end - interval.start;
    buildFoldedFlashing(local, width + 0.012, [[0.012, -0.035], [0.012, 0.04], [-0.026, 0.047]], 0.004, aluminum);
    local.box(rubber, 0, -0.025, 0.007, width, 0.012, 0.012);
  }
}

export function buildTerracottaVentBands(context: ArchitectureContext, options: ExteriorOptions): void {
  const face = exteriorFaceDepth(options);
  const { clay, steel } = context.palette;
  const limit = exteriorDetailHeight(options);
  const y = Math.min(limit - 0.28, 2.85);
  if (y < 0.4) return;
  const intervals = horizontalFacadeIntervals(options.width, y, options.openings, 0.16);
  for (const interval of intervals) {
    const width = interval.end - interval.start;
    if (width < 0.3) continue;
    context.box(steel, (interval.start + interval.end) / 2, y, face + 0.012, width, 0.18, 0.015);
    const battens = Math.max(2, Math.floor(width / 0.11));
    for (let batten = 0; batten < battens; batten++) {
      const x = interval.start + (batten + 0.5) * width / battens;
      context.box(clay, x, y, face + 0.035, 0.065, 0.18, 0.055);
      context.box(context.palette.dark, x, y + 0.075, face + 0.065, 0.018, 0.012, 0.004);
    }
  }
}

export function buildCladdingConstruction(context: ArchitectureContext, options: ExteriorOptions): void {
  if (options.style === "stone") buildStonePanelRainscreen(context, options);
  else if (options.style === "metal") {
    if (options.variant % 2) buildCassetteRainscreen(context, options);
    else buildStandingSeamPanels(context, options);
  }
  else {
    buildRenderControlJoints(context, options);
    if (options.detailed && options.variant % 3 === 0) {
      buildFiberCementRainscreen(context, { ...options, height: Math.min(options.height, 0.88) });
    }
  }
  buildExternalInsulationBase(context, options);
  buildFacadeCornerTrim(context, options);
  buildWallTopClosure(context, options);
  buildRainscreenOpeningReturns(context, options);
  buildFacadeInspectionRebate(context, options);
  if (options.detailed && options.style === "stone" && options.variant % 2 === 1) buildTerracottaVentBands(context, options);
}
