import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation, type Point } from "./context";

export function buildUnitizedGlazing(context: ArchitectureContext, width: number, height: number, sill: number, depth: number, bayWidth = 1.35): void {
  const { aluminum, rubber, glass, steel, reflectiveGlass } = context.palette;
  const bays = Math.max(1, Math.ceil(width / bayWidth));
  const floors = Math.max(1, Math.ceil(height / 3.1));
  const panelWidth = width / bays;
  const panelHeight = height / floors;
  for (let floor = 0; floor < floors; floor++) {
    const bottom = sill + floor * panelHeight;
    for (let bay = 0; bay < bays; bay++) {
      const left = -width / 2 + bay * panelWidth;
      const center = left + panelWidth / 2;
      const clearWidth = panelWidth - 0.066;
      const clearHeight = panelHeight - 0.24;
      for (const side of [-1, 1]) context.box(rubber, center + side * (panelWidth / 2 - 0.032), bottom + panelHeight / 2, depth - 0.012, 0.025, panelHeight - 0.034, 0.025);
      context.box(floor === 0 ? glass : reflectiveGlass, center, bottom + panelHeight / 2 + 0.07, depth + 0.008, clearWidth, clearHeight, 0.028);
      context.box(steel, center, bottom + 0.085, depth - 0.045, panelWidth - 0.05, 0.17, 0.12);
      context.box(aluminum, center, bottom + panelHeight, depth + 0.032, panelWidth, 0.052, 0.11);
      context.box(aluminum, left, bottom + panelHeight / 2, depth + 0.032, 0.052, panelHeight, 0.11);
      for (const edge of [-1, 1]) {
        const clipX = center + edge * Math.max(0.12, panelWidth / 2 - 0.14);
        context.box(aluminum, clipX, bottom + panelHeight - 0.11, depth - 0.12, 0.07, 0.12, 0.09);
      }
    }
  }
  context.box(aluminum, width / 2, sill + height / 2, depth + 0.032, 0.052, height, 0.11);
  context.box(aluminum, 0, sill, depth + 0.04, width + 0.052, 0.065, 0.14);
}

export function buildShopWindow(context: ArchitectureContext, width: number, height: number, bottom: number, doorWidth = 1.3): void {
  const { bronze, glass, rubber, limestone } = context.palette;
  const fixedWidth = Math.max(0.2, (width - doorWidth) / 2);
  for (const side of [-1, 1]) {
    const center = side * (doorWidth / 2 + fixedWidth / 2);
    context.box(glass, center, bottom + height / 2, 0, fixedWidth - 0.06, height - 0.09, 0.03);
    context.box(bronze, side * width / 2, bottom + height / 2, 0.035, 0.055, height, 0.11);
    context.box(bronze, side * doorWidth / 2, bottom + height / 2, 0.035, 0.065, height, 0.12);
    context.box(rubber, center, bottom + 0.018, 0.01, fixedWidth, 0.035, 0.07);
    context.box(limestone, center, bottom - 0.065, 0.015, fixedWidth + 0.05, 0.13, 0.18);
  }
  context.box(bronze, 0, bottom + height, 0.035, width + 0.055, 0.065, 0.12);
  context.box(bronze, 0, bottom + 2.25, 0.025, doorWidth, 0.065, 0.11);
  if (height > 2.35) context.box(glass, 0, bottom + (height + 2.25) / 2, 0, doorWidth - 0.06, height - 2.32, 0.03);
}

export function buildStoneCladding(context: ArchitectureContext, width: number, height: number, bottom: number, panelWidth = 0.9, panelHeight = 0.6): void {
  const { limestone, dark, aluminum } = context.palette;
  const columns = Math.max(1, Math.ceil(width / panelWidth));
  const rows = Math.max(1, Math.ceil(height / panelHeight));
  const actualWidth = width / columns;
  const actualHeight = height / rows;
  context.box(dark, 0, bottom + height / 2, -0.05, width, height, 0.07);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = -width / 2 + (column + 0.5) * actualWidth;
      const y = bottom + (row + 0.5) * actualHeight;
      context.box(limestone, x, y, 0, actualWidth - 0.008, actualHeight - 0.008, 0.055);
    }
  }
  context.box(aluminum, 0, bottom + height + 0.018, 0.01, width + 0.04, 0.035, 0.105);
}

export function buildBrickPier(context: ArchitectureContext, width: number, height: number, depth: number): void {
  const { clay, limestone } = context.palette;
  const courseHeight = 0.086;
  const courseCount = Math.ceil(height / courseHeight);
  context.box(limestone, 0, height / 2, -depth / 2, width, height, depth);
  for (let row = 0; row < courseCount; row++) {
    const y = Math.min(height - 0.035, row * courseHeight + 0.04);
    const stagger = row % 2 === 0 ? 0 : 0.125;
    for (let start = -width / 2 - stagger; start < width / 2; start += 0.25) {
      const left = Math.max(-width / 2, start + 0.005);
      const right = Math.min(width / 2, start + 0.245);
      if (right - left > 0.025) context.box(clay, (left + right) / 2, y, 0.006, right - left, 0.073, 0.035);
    }
  }
}

export function buildCavityVent(context: ArchitectureContext, x: number, y: number, width: number, height: number): void {
  const { dark, aluminum } = context.palette;
  context.box(dark, x, y, 0, width, height, 0.065);
  context.box(aluminum, x, y + height / 2, 0.045, width + 0.045, 0.035, 0.11);
  context.box(aluminum, x, y - height / 2, 0.045, width + 0.045, 0.035, 0.11);
  for (const side of [-1, 1]) context.box(aluminum, x + side * width / 2, y, 0.045, 0.035, height, 0.11);
  const blades = Math.max(2, Math.floor(height / 0.075));
  for (let i = 0; i < blades; i++) {
    const bladeY = y - height / 2 + (i + 0.5) * height / blades;
    context.panel(aluminum, [[x - width / 2, bladeY - 0.025, 0.065], [x + width / 2, bladeY - 0.025, 0.065], [x + width / 2, bladeY + 0.025, -0.015], [x - width / 2, bladeY + 0.025, -0.015]]);
  }
}

export function buildBayWindow(context: ArchitectureContext, width: number, height: number, bottom: number, projection = 0.65): void {
  const { limestone, bronze, glass } = context.palette;
  const middle = width * 0.66;
  const side = (width - middle) / 2;
  context.box(limestone, 0, bottom - 0.075, projection / 2, width + 0.12, 0.15, projection + 0.12);
  context.box(limestone, 0, bottom + height + 0.07, projection / 2, width + 0.16, 0.14, projection + 0.18);
  context.box(glass, 0, bottom + height / 2, projection, middle - 0.05, height - 0.06, 0.028);
  for (const sign of [-1, 1]) {
    const outerX = sign * width / 2;
    const innerX = sign * middle / 2;
    context.panel(glass, [[outerX, bottom, 0], [innerX, bottom, projection], [innerX, bottom + height, projection], [outerX, bottom + height, 0]]);
    context.box(bronze, innerX, bottom + height / 2, projection, 0.045, height, 0.07);
    context.box(bronze, outerX, bottom + height / 2, 0, 0.045, height, 0.07);
    context.rectangularBeam(bronze, [outerX, bottom, 0], [innerX, bottom, projection], 0.045, 0.055);
    context.rectangularBeam(bronze, [outerX, bottom + height, 0], [innerX, bottom + height, projection], 0.045, 0.055);
  }
  context.box(bronze, 0, bottom + height * 0.65, projection + 0.018, middle, 0.04, 0.07);
  if (side > 0.1) context.box(bronze, 0, bottom + height / 2, projection + 0.018, 0.04, height, 0.07);
}

export function buildOperableWindow(context: ArchitectureContext, width: number, height: number, base: Point, phase: number): Animation {
  const { aluminum, rubber, glass } = context.palette;
  const frame = context.at({ x: base[0], y: base[1], z: base[2] });
  for (const side of [-1, 1]) {
    frame.box(aluminum, side * width / 2, height / 2, 0, 0.055, height + 0.055, 0.11);
    frame.box(rubber, side * (width / 2 - 0.035), height / 2, 0.025, 0.015, height, 0.025);
  }
  frame.box(aluminum, 0, 0, 0, width, 0.055, 0.11);
  frame.box(aluminum, 0, height, 0, width, 0.055, 0.11);
  const sash = frame.moving("Top-hung ventilating sash", [0, height, 0], (moving) => {
    moving.box(glass, 0, -height / 2, 0, width - 0.08, height - 0.07, 0.028);
    moving.box(aluminum, 0, -height, 0.03, width, 0.04, 0.07);
    for (const side of [-1, 1]) moving.box(aluminum, side * (width / 2 - 0.02), -height / 2, 0.03, 0.04, height, 0.07);
    moving.box(aluminum, 0, -height + 0.08, -0.07, 0.11, 0.018, 0.045);
  });
  return (seconds, night, season) => {
    const ventilation = night || season === "winter" ? 0 : season === "summer" ? 0.32 : 0.16;
    sash.rotation.x = ventilation * openingPulse(seconds, 86, phase, 42, 6);
  };
}

export function buildVenetianBlinds(context: ArchitectureContext, width: number, height: number, base: Point, phase: number): Animation {
  const { aluminum, fabric, steel } = context.palette;
  const frame = context.at({ x: base[0], y: base[1], z: base[2] });
  frame.box(aluminum, 0, height, 0, width + 0.06, 0.065, 0.07);
  const blades = frame.moving("Venetian blind slats", [0, height, 0], (moving) => {
    const slatCount = Math.ceil(height / 0.065);
    for (let i = 0; i < slatCount; i++) {
      moving.panel(fabric, [[-width / 2, -i * 0.065, -0.025], [width / 2, -i * 0.065, -0.025], [width / 2, -i * 0.065 - 0.024, 0.025], [-width / 2, -i * 0.065 - 0.024, 0.025]]);
    }
  });
  for (const side of [-1, 1]) frame.beam(steel, [side * width * 0.32, 0, 0], [side * width * 0.32, height, 0], 0.003);
  return (seconds, night, season) => {
    const shade = season === "summer" ? 1 : season === "winter" ? 0.2 : 0.55;
    const cycle = 0.5 + 0.5 * Math.sin(seconds * 0.025 + phase);
    blades.scale.y = night ? 0.96 : 0.1 + shade * cycle * 0.85;
  };
}

export function buildFabricAwning(context: ArchitectureContext, width: number, projection: number, height: number, phase: number): Animation {
  const { bronze, fabric, aluminum } = context.palette;
  context.box(bronze, 0, height, -0.04, width + 0.15, 0.16, 0.16);
  const canopy = context.moving("Retractable shop awning", [0, height, 0], (moving) => {
    const panels = Math.ceil(width / 0.45);
    for (let i = 0; i < panels; i++) {
      const left = -width / 2 + i * width / panels;
      const right = left + width / panels;
      moving.panel(i % 2 ? fabric : context.palette.white, [[left, 0, 0], [right, 0, 0], [right, -0.3, projection], [left, -0.3, projection]]);
      moving.box(fabric, (left + right) / 2, -0.38, projection, width / panels, 0.16, 0.02);
    }
    moving.box(aluminum, 0, -0.31, projection, width, 0.045, 0.05);
    for (const side of [-1, 1]) {
      moving.beam(bronze, [side * width * 0.4, -0.05, 0], [side * width * 0.3, -0.15, projection / 2], 0.022);
      moving.beam(bronze, [side * width * 0.3, -0.15, projection / 2], [side * width * 0.4, -0.29, projection], 0.022);
    }
  });
  return (seconds, night, season) => {
    const target = night || season === "winter" ? 0.12 : season === "summer" ? 1 : 0.72;
    canopy.scale.z = target + Math.sin(seconds * 0.05 + phase) * 0.006;
  };
}

export function buildGlassCanopy(context: ArchitectureContext, width: number, projection: number, height: number): void {
  const { glass, aluminum, steel } = context.palette;
  const panels = Math.max(2, Math.ceil(width / 1.2));
  const bay = width / panels;
  for (let i = 0; i < panels; i++) {
    const left = -width / 2 + i * bay;
    context.panel(glass, [[left + 0.008, height, 0], [left + bay - 0.008, height, 0], [left + bay - 0.008, height - 0.07, projection], [left + 0.008, height - 0.07, projection]]);
    context.rectangularBeam(aluminum, [left, height - 0.06, 0], [left, height - 0.13, projection], 0.065, 0.1);
  }
  context.box(aluminum, 0, height - 0.09, projection, width + 0.06, 0.07, 0.085);
  for (const side of [-1, 1]) {
    const x = side * width * 0.38;
    context.beam(steel, [x, height + 0.72, -0.06], [x, height - 0.06, projection * 0.9], 0.013);
    context.disc(steel, x, height - 0.08, projection * 0.9, 0.035, 0.035);
    context.box(steel, x, height + 0.72, -0.05, 0.13, 0.18, 0.055);
  }
}

export function buildRainwaterDownpipe(context: ArchitectureContext, height: number, offset: number, radius = 0.042): void {
  const { aluminum, steel } = context.palette;
  context.tube(aluminum, [[0, height, -offset], [0, height - 0.15, -offset], [0, height - 0.38, 0], [0, 0.25, 0], [0, 0.12, 0.15]], radius);
  const clamps = Math.max(2, Math.ceil(height / 1.8));
  for (let i = 0; i < clamps; i++) {
    const y = 0.5 + i * (height - 1) / (clamps - 1);
    context.box(steel, 0, y, -0.04, radius * 2.5, 0.025, 0.11);
    for (const side of [-1, 1]) context.box(steel, side * radius * 1.5, y, -0.08, 0.024, 0.024, 0.035);
  }
  context.box(steel, 0, 0.025, 0.16, 0.22, 0.045, 0.26);
  for (let i = 0; i < 5; i++) context.box(aluminum, -0.08 + i * 0.04, 0.052, 0.16, 0.012, 0.015, 0.2);
}
