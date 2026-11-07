import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import type { ShopKind } from "./shops";
import { buildBakeryProduction, buildCoffeeProduction } from "./food-production";
import { buildTechnologyWorkshop } from "./electronics-workshop";
import { buildMarketBackroom } from "./market-backroom";
import { buildPharmacyWorkroom } from "./pharmacy-workroom";
import { buildBookshopWorkshop } from "./bookshop-workroom";
import { buildTrackLighting } from "./lighting";

export function buildSpecialistWorkspace(context: ArchitectureContext, materials: ArchitecturalMaterials, kind: ShopKind, width: number, depth: number, phase: number): Animation[] {
  let animations: Animation[];
  if (kind === "coffee") animations = buildCoffeeProduction(context, materials, width, depth, phase);
  else if (kind === "bakery") animations = buildBakeryProduction(context, materials, width, depth, phase);
  else if (kind === "grocery") animations = buildMarketBackroom(context, materials, width, depth, phase);
  else if (kind === "pharmacy") animations = buildPharmacyWorkroom(context, materials, width, depth, phase);
  else if (kind === "books") animations = buildBookshopWorkshop(context, materials, width, depth, phase);
  else animations = buildTechnologyWorkshop(context, materials, width, depth, phase);
  buildTrackLighting(context.at({ x: 0, y: 2.72, z: -depth * 0.16 }), width * 0.72, 4);
  if (depth > 3) buildTrackLighting(context.at({ x: 0, y: 2.72, z: depth * 0.26 }), width * 0.65, 3);
  return animations;
}
