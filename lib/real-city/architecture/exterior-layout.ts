import type { WallOpening } from "./structure";

export type FacadeRect = {
  left: number;
  right: number;
  bottom: number;
  top: number;
};

export type FacadeInterval = {
  start: number;
  end: number;
};

export type FacadePanel = FacadeRect & {
  row: number;
  column: number;
  edge: boolean;
};

export type ExteriorStyle = "render" | "stone" | "metal";

export type ExteriorOptions = {
  width: number;
  height: number;
  openings: readonly WallOpening[];
  variant: number;
  detailed: boolean;
  style?: ExteriorStyle;
  shading?: boolean;
  wallDepth?: number;
};

export function openingBounds(opening: WallOpening, clearance = 0): FacadeRect {
  return {
    left: opening.x - opening.width / 2 - clearance,
    right: opening.x + opening.width / 2 + clearance,
    bottom: opening.y - clearance,
    top: opening.y + opening.height + clearance,
  };
}

export function facadeBounds(width: number, height: number): FacadeRect {
  return {
    left: -width / 2,
    right: width / 2,
    bottom: 0,
    top: height,
  };
}

export function intersectFacade(a: FacadeRect, b: FacadeRect): FacadeRect | null {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const bottom = Math.max(a.bottom, b.bottom);
  const top = Math.min(a.top, b.top);
  if (right - left < 0.001 || top - bottom < 0.001) return null;
  return { left, right, bottom, top };
}

export function subtractFacade(rect: FacadeRect, opening: FacadeRect): FacadeRect[] {
  const intersection = intersectFacade(rect, opening);
  if (!intersection) return [rect];
  const result: FacadeRect[] = [];
  if (intersection.bottom > rect.bottom + 0.001) {
    result.push({
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      top: intersection.bottom,
    });
  }
  if (intersection.top < rect.top - 0.001) {
    result.push({
      left: rect.left,
      right: rect.right,
      bottom: intersection.top,
      top: rect.top,
    });
  }
  if (intersection.left > rect.left + 0.001) {
    result.push({
      left: rect.left,
      right: intersection.left,
      bottom: intersection.bottom,
      top: intersection.top,
    });
  }
  if (intersection.right < rect.right - 0.001) {
    result.push({
      left: intersection.right,
      right: rect.right,
      bottom: intersection.bottom,
      top: intersection.top,
    });
  }
  return result;
}

export function solidFacadeRegions(rect: FacadeRect, openings: readonly WallOpening[], clearance = 0.025): FacadeRect[] {
  let regions = [rect];
  for (const opening of openings) {
    const bounds = openingBounds(opening, clearance);
    const next: FacadeRect[] = [];
    for (const region of regions) next.push(...subtractFacade(region, bounds));
    regions = next;
    if (!regions.length) break;
  }
  return regions.filter(region => region.right - region.left >= 0.025 && region.top - region.bottom >= 0.025);
}

export function subtractIntervals(source: readonly FacadeInterval[], cut: FacadeInterval): FacadeInterval[] {
  const result: FacadeInterval[] = [];
  for (const interval of source) {
    if (cut.end <= interval.start || cut.start >= interval.end) {
      result.push(interval);
      continue;
    }
    if (cut.start > interval.start) {
      result.push({ start: interval.start, end: Math.min(cut.start, interval.end) });
    }
    if (cut.end < interval.end) {
      result.push({ start: Math.max(cut.end, interval.start), end: interval.end });
    }
  }
  return result.filter(interval => interval.end - interval.start > 0.015);
}

export function horizontalFacadeIntervals(width: number, y: number, openings: readonly WallOpening[], margin = 0.035): FacadeInterval[] {
  let intervals = [{ start: -width / 2, end: width / 2 }];
  for (const opening of openings) {
    if (y < opening.y - margin || y > opening.y + opening.height + margin) continue;
    intervals = subtractIntervals(intervals, {
      start: opening.x - opening.width / 2 - margin,
      end: opening.x + opening.width / 2 + margin,
    });
  }
  return intervals;
}

export function verticalFacadeIntervals(height: number, x: number, openings: readonly WallOpening[], margin = 0.035): FacadeInterval[] {
  let intervals = [{ start: 0, end: height }];
  for (const opening of openings) {
    if (x < opening.x - opening.width / 2 - margin || x > opening.x + opening.width / 2 + margin) continue;
    intervals = subtractIntervals(intervals, {
      start: opening.y - margin,
      end: opening.y + opening.height + margin,
    });
  }
  return intervals;
}

export function facadePanelLayout(width: number, height: number, panelWidth: number, panelHeight: number, openings: readonly WallOpening[], stagger = false): FacadePanel[] {
  const columns = Math.max(1, Math.ceil(width / panelWidth));
  const rows = Math.max(1, Math.ceil(height / panelHeight));
  const actualWidth = width / columns;
  const actualHeight = height / rows;
  const result: FacadePanel[] = [];
  for (let row = 0; row < rows; row++) {
    const offset = stagger && row % 2 ? -actualWidth * 0.5 : 0;
    const count = offset ? columns + 1 : columns;
    for (let column = 0; column < count; column++) {
      const left = Math.max(-width / 2, -width / 2 + column * actualWidth + offset);
      const right = Math.min(width / 2, -width / 2 + (column + 1) * actualWidth + offset);
      if (right - left < 0.025) continue;
      const candidate = {
        left,
        right,
        bottom: row * actualHeight,
        top: (row + 1) * actualHeight,
      };
      const parts = solidFacadeRegions(candidate, openings);
      for (const part of parts) {
        result.push({
          ...part,
          row,
          column,
          edge: parts.length !== 1 || left === -width / 2 || right === width / 2,
        });
      }
    }
  }
  return result;
}

export function facadePointClear(x: number, y: number, openings: readonly WallOpening[], clearance = 0.12): boolean {
  for (const opening of openings) {
    const bounds = openingBounds(opening, clearance);
    if (x >= bounds.left && x <= bounds.right && y >= bounds.bottom && y <= bounds.top) return false;
  }
  return true;
}

export function findFacadeServicePosition(width: number, height: number, openings: readonly WallOpening[], preferredX: number, serviceWidth: number, serviceHeight: number, bottom = 0.45): number | null {
  if (bottom + serviceHeight > height || serviceWidth > width - 0.15) return null;
  const limit = width / 2 - serviceWidth / 2 - 0.08;
  const step = Math.max(0.12, serviceWidth / 3);
  const candidates = [Math.max(-limit, Math.min(limit, preferredX))];
  for (let offset = step; offset <= width; offset += step) {
    const left = preferredX - offset;
    const right = preferredX + offset;
    if (left >= -limit) candidates.push(left);
    if (right <= limit) candidates.push(right);
  }
  for (const x of candidates) {
    const rect = {
      left: x - serviceWidth / 2 - 0.04,
      right: x + serviceWidth / 2 + 0.04,
      bottom: bottom - 0.04,
      top: bottom + serviceHeight + 0.04,
    };
    if (openings.some(opening => intersectFacade(rect, openingBounds(opening, 0.06)))) continue;
    return x;
  }
  return null;
}

export function openingIsDoor(opening: WallOpening): boolean {
  return opening.y < 0.18 && opening.height > 1.75;
}

export function openingIsGlazedDoor(opening: WallOpening): boolean {
  return opening.width > 2.7 && opening.height > 2.1 && opening.y < 0.4;
}

export function validFacadeOpening(opening: WallOpening, width: number, height: number): boolean {
  return Number.isFinite(opening.x)
    && Number.isFinite(opening.y)
    && Number.isFinite(opening.width)
    && Number.isFinite(opening.height)
    && opening.width > 0.1
    && opening.height > 0.1
    && opening.x + opening.width / 2 > -width / 2
    && opening.x - opening.width / 2 < width / 2
    && opening.y < height
    && opening.y + opening.height > 0;
}

export function clippedFacadeOpenings(options: ExteriorOptions): WallOpening[] {
  const result: WallOpening[] = [];
  for (const opening of options.openings) {
    if (!validFacadeOpening(opening, options.width, options.height)) continue;
    const left = Math.max(-options.width / 2, opening.x - opening.width / 2);
    const right = Math.min(options.width / 2, opening.x + opening.width / 2);
    const bottom = Math.max(0, opening.y);
    const top = Math.min(options.height, opening.y + opening.height);
    const width = right - left;
    const height = top - bottom;
    if (width < 0.1 || height < 0.1) continue;
    result.push({
      x: (left + right) / 2,
      y: bottom,
      width,
      height,
    });
  }
  return result;
}

export function exteriorDetailHeight(options: ExteriorOptions): number {
  return Math.min(options.height, options.detailed ? 6.6 : 3.15);
}

export function exteriorFaceDepth(options: ExteriorOptions): number {
  return Math.max(0.07, (options.wallDepth ?? 0.2) / 2) + 0.006;
}

export function visibleFacadeOpenings(options: ExteriorOptions): WallOpening[] {
  const limit = exteriorDetailHeight(options);
  return options.openings.filter(opening => validFacadeOpening(opening, options.width, options.height) && opening.y < limit);
}
