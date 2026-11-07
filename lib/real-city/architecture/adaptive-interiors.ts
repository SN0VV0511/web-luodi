import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { planStudioInterior, type FurniturePlacement } from "./spatial-layout";
import { buildBed, buildBookshelf, buildCafeTable, buildDiningChair, buildNightstand, buildOfficeDesk, buildSofa, buildWardrobe } from "./furniture";
import { buildKitchenCounter, buildRefrigerator } from "./kitchens";
import { buildBathroom } from "./sanitary";
import { buildWallWithOpenings } from "./structure";
import { buildPendantLight, buildRecessedDownlight, buildSocket, buildWallControls } from "./lighting";

function localDimensions(placement: FurniturePlacement): { width: number; depth: number } {
  const rotated = Math.abs(Math.sin(placement.yaw)) > 0.7;
  return { width: rotated ? placement.footprint.depth : placement.footprint.width, depth: rotated ? placement.footprint.width : placement.footprint.depth };
}

function renderBathroom(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  const animations = buildBathroom(context, materials, width - 0.12, depth - 0.12);
  const { white, oak, aluminum } = context.palette;
  const height = 2.5;
  for (const side of [-1, 1]) context.box(white, side * width / 2, height / 2, 0, 0.07, height, depth);
  context.box(white, 0, height / 2, -depth / 2, width, height, 0.07);
  buildWallWithOpenings(context.at({ x: 0, y: 0, z: depth / 2 }), white, width, height, 0.07, [{ x: 0, y: 0, width: 0.72, height: 2.08 }]);
  context.box(oak, -0.35, 1.05, depth / 2 + 0.025, 0.68, 2.06, 0.035);
  context.box(aluminum, -0.08, 1.02, depth / 2 + 0.055, 0.1, 0.018, 0.02);
  context.box(white, 0, height + 0.018, 0, width, 0.035, depth);
  buildRecessedDownlight(context.at({ x: 0, y: height - 0.02, z: 0 }));
  return animations;
}

export function buildAdaptiveStudio(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, detailed: boolean): Animation[] {
  const plan = planStudioInterior(width, depth, detailed);
  const animations: Animation[] = [];
  for (const placement of plan.placements) {
    const furniture = context.at({ x: placement.footprint.x, y: 0.035, z: placement.footprint.z, yaw: placement.yaw });
    const dimensions = localDimensions(placement);
    switch (placement.kind) {
      case "single-bed":
        buildBed(furniture, materials, false);
        break;
      case "double-bed":
        buildBed(furniture, materials, true);
        break;
      case "sofa":
        buildSofa(furniture, materials, dimensions.width);
        break;
      case "wardrobe":
        buildWardrobe(furniture, dimensions.width, 2.3);
        break;
      case "desk":
        buildOfficeDesk(furniture, materials, dimensions.width);
        buildSocket(furniture.at({ x: dimensions.width * 0.3, y: 0.3, z: -dimensions.depth / 2 - 0.035 }));
        break;
      case "table":
        buildCafeTable(furniture, Math.min(dimensions.width, dimensions.depth) / 2);
        break;
      case "chair":
        buildDiningChair(furniture, materials);
        break;
      case "kitchen":
        animations.push(...buildKitchenCounter(furniture, materials, dimensions.width));
        break;
      case "fridge":
        buildRefrigerator(furniture, materials, 1.65);
        break;
      case "bathroom":
        animations.push(...renderBathroom(furniture, materials, dimensions.width, dimensions.depth));
        break;
      case "bookcase":
        buildBookshelf(furniture, dimensions.width, 1.6, dimensions.depth, 2);
        break;
      case "nightstand":
        buildNightstand(furniture, materials);
        break;
    }
  }
  const clearArea = plan.circulation[Math.floor(plan.circulation.length / 2)] ?? { x: 0, z: 0 };
  buildPendantLight(context.at({ x: clearArea.x, y: 2.62, z: clearArea.z }), 0.32, 0.16);
  buildWallControls(context, [0.52, 1.1, -depth / 2 + 0.025]);
  if (plan.missingEssentials.length) {
    context.kit.group.userData.compactApartmentFitWarnings = (context.kit.group.userData.compactApartmentFitWarnings ?? 0) + plan.missingEssentials.length;
  }
  return animations;
}
