import { ArchitectureContext, type Animation } from "./context";
import type { WallOpening } from "./structure";
import { buildExteriorBaseConstruction } from "./exterior-base";
import { buildCladdingConstruction } from "./exterior-cladding";
import { buildOpeningConstruction } from "./exterior-openings";
import { buildRevealConstructionDetails } from "./exterior-reveal-details";
import { buildExteriorJointConstruction } from "./exterior-joints";
import { buildPointSupportedGlazingDetails, buildUnitizedGlazingDetails } from "./exterior-glazing";
import { buildShadeIrradianceSensor, buildShadeWindSensor } from "./exterior-shading-hardware";
import {
  buildArticulatedAwning,
  buildBriseSoleilShelf,
  buildFixedSolarFins,
  buildOperableExteriorLouvers,
  buildRetractableSolarScreen,
  buildSlidingExteriorShutters,
} from "./exterior-shading";
import {
  exteriorDetailHeight,
  exteriorFaceDepth,
  clippedFacadeOpenings,
  facadePointClear,
  intersectFacade,
  openingBounds,
  openingIsDoor,
  openingIsGlazedDoor,
  visibleFacadeOpenings,
  type ExteriorOptions,
} from "./exterior-layout";

export type { ExteriorOptions } from "./exterior-layout";

function hasShutterTravel(opening: WallOpening, options: ExteriorOptions): boolean {
  const left = opening.x - opening.width;
  const right = opening.x + opening.width;
  if (left < -options.width / 2 + 0.15 || right > options.width / 2 - 0.15) return false;
  const movementArea = {
    left,
    right,
    bottom: opening.y - 0.08,
    top: opening.y + opening.height + 0.15,
  };
  return !options.openings.some(other => other !== opening && intersectFacade(movementArea, openingBounds(other, 0.08)));
}

function facadeShading(context: ArchitectureContext, options: ExteriorOptions, openings: readonly WallOpening[]): Animation[] {
  if (!options.detailed || options.shading === false) return [];
  const eligible = openings.filter(opening => !openingIsDoor(opening)
    && !openingIsGlazedDoor(opening)
    && opening.width >= 0.65
    && opening.height >= 0.75
    && opening.y > 0.38
    && opening.y + opening.height + 0.2 < options.height);
  if (!eligible.length) return [];
  const face = exteriorFaceDepth(options);
  const firstLevel = Math.min(...eligible.map(opening => opening.y));
  const nearGround = eligible.filter(opening => opening.y < firstLevel + 0.5);
  const preferred = nearGround[Math.abs(options.variant) % nearGround.length];
  const hasControlSpace = (opening: WallOpening): boolean => {
    const x = opening.x + opening.width / 2 + 0.2;
    const y = opening.y + opening.height - 0.25;
    return x < options.width / 2 - 0.12 && facadePointClear(x, y, options.openings, 0.12);
  };
  const opening = hasControlSpace(preferred) ? preferred : nearGround.find(hasControlSpace);
  if (!opening) return [];
  const local = context.at({ x: opening.x, y: opening.y, z: face + 0.06 });
  const selection = Math.abs(options.variant) % 5;
  const animations: Animation[] = [];
  buildShadeIrradianceSensor(local.at({ x: -opening.width / 2 - 0.09, y: opening.height + 0.06, z: 0 }));
  if (selection === 0 && hasShutterTravel(opening, options)) {
    animations.push(buildSlidingExteriorShutters(local, opening.width, opening.height, options.variant));
  } else if (selection === 1) {
    animations.push(buildRetractableSolarScreen(local, opening.width, opening.height));
  } else if (selection === 2 && opening.y > 1.5) {
    const head = local.at({ x: 0, y: opening.height + 0.08, z: 0 });
    animations.push(buildArticulatedAwning(head, opening.width + 0.1, Math.min(1.2, opening.height * 0.6), options.variant));
    animations.push(buildShadeWindSensor(head.at({ x: opening.width / 2 - 0.1, y: 0.12, z: 0.08 })));
  } else if (selection === 3) {
    buildFixedSolarFins(local, opening.width, opening.height, 0.24, opening.width < 1.7);
  } else {
    animations.push(buildOperableExteriorLouvers(local, opening.width, opening.height, options.variant));
  }
  const second = nearGround.find(candidate => candidate !== opening);
  if (second && second.width > 1.1) {
    buildBriseSoleilShelf(context.at({ x: second.x, y: second.y + second.height + 0.1, z: face + 0.025 }), second.width + 0.12, 0.35);
  }
  return animations;
}

function facadeGlazing(context: ArchitectureContext, options: ExteriorOptions, openings: readonly WallOpening[]): void {
  if (!options.detailed) return;
  const face = Math.min(0.065, exteriorFaceDepth(options) - 0.04);
  let pointSupported = false;
  for (const opening of openings) {
    if (opening.width < 1.9 || opening.height < 1.35) continue;
    const local = context.at({ x: opening.x, y: opening.y, z: 0 });
    if (!pointSupported && options.style === "metal" && opening.width > 4 && opening.y > 0.7) {
      buildPointSupportedGlazingDetails(local, opening.width, opening.height, face);
      pointSupported = true;
    } else if (!openingIsDoor(opening)) {
      buildUnitizedGlazingDetails(local, opening.width, opening.height, face, opening.y < 3.8);
    }
  }
}

export function buildExteriorConstruction(context: ArchitectureContext, requested: ExteriorOptions): Animation[] {
  if (!Number.isFinite(requested.width)
    || !Number.isFinite(requested.height)
    || requested.width < 0.25
    || requested.height < 0.25) return [];
  const options: ExteriorOptions = {
    ...requested,
    style: requested.style ?? "render",
    openings: clippedFacadeOpenings(requested),
  };
  const openings = visibleFacadeOpenings(options);
  buildCladdingConstruction(context, options);
  for (let index = 0; index < openings.length; index++) {
    buildOpeningConstruction(context, openings[index], options, index);
    buildRevealConstructionDetails(context, openings[index], options);
  }
  facadeGlazing(context, options, openings);
  const animations = buildExteriorBaseConstruction(context, options);
  animations.push(...buildExteriorJointConstruction(context, options));
  animations.push(...facadeShading(context, options, openings));
  const detailTop = exteriorDetailHeight(options);
  for (const opening of options.openings) {
    if (opening.y < detailTop) continue;
    if (options.style !== "render" || options.detailed && opening.y + opening.height > options.height - 0.6) {
      buildOpeningConstruction(context, opening, { ...options, detailed: false }, 0);
    }
  }
  return animations;
}
