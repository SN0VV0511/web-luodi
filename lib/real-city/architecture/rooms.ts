import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildBed, buildBookshelf, buildCafeTable, buildCoffeeCup, buildCoffeeTable, buildDiningChair, buildDiningTable, buildNightstand, buildOfficeDesk, buildPlaceSetting, buildSofa, buildTaskChair, buildWardrobe } from "./furniture";
import { buildKitchenCounter, buildRefrigerator } from "./kitchens";
import { buildBathroom } from "./sanitary";
import { buildCeilingFan, buildFloorLamp, buildPendantLight, buildRecessedDownlight, buildSmokeDetector, buildSocket, buildTrackLighting, buildWallControls, buildWallSconce } from "./lighting";
import { buildVenetianBlinds } from "./envelope";
import { buildFanCoilGrille, buildWallRadiator } from "./mechanical-components";
import { buildAdaptiveStudio } from "./adaptive-interiors";
import { buildDetailedLaundryMachine } from "./laundry-appliance";
import { buildDetailedDomesticFridge } from "./domestic-refrigeration";
import { buildHollowBath } from "./domestic-water-fixtures";

export function buildLivingRoom(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  const animations: Animation[] = [];
  context.box(materials.timber, 0, 0.018, 0, width, 0.035, depth);
  context.box(context.palette.fabric, 0, 0.045, 0.02, width * 0.66, 0.015, depth * 0.58);
  buildSofa(context.at({ x: 0, y: 0.035, z: -depth / 2 + 0.55 }), materials, Math.min(2.2, width - 0.5));
  buildCoffeeTable(context.at({ x: 0, y: 0.035, z: 0.05 }), materials);
  buildCoffeeCup(context.at({ x: 0.24, y: 0.505, z: 0.07 }));
  buildFloorLamp(context.at({ x: -width / 2 + 0.28, y: 0.035, z: -depth / 2 + 0.45 }), true);
  const media = context.at({ x: 0, y: 0.035, z: depth / 2 - 0.22 });
  media.box(context.palette.oak, 0, 0.25, 0, Math.min(1.7, width - 0.4), 0.38, 0.35);
  media.box(context.palette.dark, 0, 0.92, -0.03, 1.05, 0.6, 0.04);
  media.box(context.palette.reflectiveGlass, 0, 0.92, -0.057, 0.99, 0.54, 0.012);
  for (const side of [-1, 1]) media.beam(context.palette.steel, [side * 0.32, 0.6, -0.025], [side * 0.4, 0.46, -0.1], 0.012);
  buildSocket(context.at({ x: width * 0.3, y: 0.3, z: depth / 2 - 0.035, yaw: Math.PI }));
  buildWallControls(context, [-width / 2 + 0.16, 1.16, depth / 2 - 0.035]);
  buildSmokeDetector(context.at({ x: 0, y: 2.63, z: 0 }));
  buildWallRadiator(context.at({ x: -width / 2 + 0.08, y: 0, z: 0.6, yaw: Math.PI / 2 }), 0.75, 0.45);
  buildFanCoilGrille(context.at({ x: width * 0.25, y: 2.62, z: -depth * 0.2 }), 0.6, 0.22);
  buildRecessedDownlight(context.at({ x: width * 0.28, y: 2.63, z: depth * 0.25 }));
  buildRecessedDownlight(context.at({ x: -width * 0.28, y: 2.63, z: depth * 0.25 }));
  animations.push(buildCeilingFan(context.at({ x: 0, y: 2.62, z: -0.15 }), 0.47));
  return animations;
}

export function buildBedroom(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, double = true): Animation[] {
  context.box(materials.timber, 0, 0.018, 0, width, 0.035, depth);
  buildBed(context.at({ x: 0, y: 0.035, z: -depth / 2 + 1.1 }), materials, double);
  const bedHalf = double ? 0.76 : 0.46;
  if (width > 2.5) {
    buildNightstand(context.at({ x: -bedHalf - 0.3, y: 0.035, z: -depth / 2 + 0.35 }), materials);
    buildNightstand(context.at({ x: bedHalf + 0.3, y: 0.035, z: -depth / 2 + 0.35 }), materials);
  } else {
    buildWallSconce(context.at({ x: bedHalf + 0.12, y: 1.05, z: -depth / 2 + 0.035 }));
  }
  buildWardrobe(context.at({ x: 0, y: 0.035, z: depth / 2 - 0.34, yaw: Math.PI }), Math.min(width - 0.25, 2.1), 2.3);
  buildRecessedDownlight(context.at({ x: 0, y: 2.63, z: depth * 0.25 }));
  buildSocket(context.at({ x: -bedHalf - 0.16, y: 0.28, z: -depth / 2 + 0.035 }));
  return [];
}

export function buildDiningRoom(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  context.box(materials.timber, 0, 0.018, 0, width, 0.035, depth);
  const tableWidth = Math.min(1.7, width - 1.1);
  buildDiningTable(context.at({ x: 0, y: 0.035, z: 0 }), materials, tableWidth, 0.8);
  for (const side of [-1, 1]) {
    const z = side * 0.68;
    const yaw = side > 0 ? Math.PI : 0;
    for (const x of [-tableWidth * 0.27, tableWidth * 0.27]) {
      buildDiningChair(context.at({ x, y: 0.035, z, yaw }), materials, true);
      buildPlaceSetting(context.at({ x, y: 0.83, z: side * 0.25, yaw }));
    }
  }
  buildPendantLight(context.at({ x: 0, y: 2.63, z: 0 }), 0.7, 0.23);
  context.box(context.palette.oak, -width / 2 + 0.2, 0.43, -depth * 0.2, 0.35, 0.75, depth * 0.55);
  return [];
}

export function buildHomeOffice(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  context.box(materials.timber, 0, 0.018, 0, width, 0.035, depth);
  buildOfficeDesk(context.at({ x: 0, y: 0.035, z: -depth / 2 + 0.4 }), materials, Math.min(1.6, width - 0.4));
  buildTaskChair(context.at({ x: 0, y: 0.035, z: -depth / 2 + 1.2, yaw: Math.PI }), materials);
  buildBookshelf(context.at({ x: -width / 2 + 0.2, y: 0.035, z: 0.2, yaw: Math.PI / 2 }), Math.min(1.2, depth - 0.5), 2.05, 0.3, 7);
  buildTrackLighting(context.at({ x: 0, y: 2.6, z: 0 }), width * 0.6, 2);
  buildWallControls(context, [width / 2 - 0.15, 1.15, depth / 2 - 0.03]);
  buildSocket(context.at({ x: 0.6, y: 0.25, z: -depth / 2 + 0.02 }));
  return [];
}

export function buildUtilityRoom(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  context.box(materials.porcelainTile, 0, 0.015, 0, width, 0.03, depth);
  const washer = buildDetailedLaundryMachine(context.at({ x: -width / 2 + 0.34, y: 0.03, z: -depth / 2 + 0.34 }));
  context.box(context.palette.oak, width / 2 - 0.32, 0.48, -depth / 2 + 0.32, 0.55, 0.9, 0.55);
  context.box(materials.porcelainTile, 0, 0.96, -depth / 2 + 0.34, width - 0.08, 0.045, 0.68);
  context.box(context.palette.white, 0, 1.73, -depth / 2 + 0.16, width - 0.08, 0.7, 0.3);
  const basket = context.at({ x: width / 2 - 0.33, y: 0.03, z: depth / 2 - 0.28 });
  basket.box(context.palette.oak, 0, 0.22, 0, 0.39, 0.44, 0.34);
  for (let row = 0; row < 6; row++) basket.box(context.palette.fabric, 0, 0.055 + row * 0.065, 0.176, 0.36, 0.025, 0.012);
  buildRecessedDownlight(context.at({ x: 0, y: 2.55, z: 0 }));
  return [washer];
}

export function buildStudioApartment(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, detailed: boolean): Animation[] {
  const animations: Animation[] = [];
  const { white, oak } = context.palette;
  context.box(materials.timber, 0, 0.018, 0, width, 0.035, depth);
  context.box(white, 0, 2.66, 0, width, 0.035, depth);
  context.box(white, -width / 2, 1.33, 0, 0.08, 2.66, depth);
  context.box(white, width / 2, 1.33, 0, 0.08, 2.66, depth);
  for (const side of [-1, 1]) context.box(oak, side * (width / 2 - 0.045), 0.055, 0, 0.018, 0.11, depth);
  if (!detailed) {
    buildSofa(context.at({ x: width * 0.24, y: 0.035, z: depth * 0.18, yaw: Math.PI }), materials, 1.55);
    buildBed(context.at({ x: -width * 0.24, y: 0.035, z: 0 }), materials, false);
    buildRecessedDownlight(context.at({ x: 0, y: 2.62, z: 0 }));
    return animations;
  }
  if (width >= 4.5) return buildAdaptiveStudio(context, materials, width, depth, true);
  const bathroomWidth = Math.min(1.55, width * 0.3);
  const bathroomDepth = 1.8;
  const bathroomX = width / 2 - bathroomWidth / 2;
  const bathroomZ = -depth / 2 + bathroomDepth / 2;
  animations.push(...buildBathroom(context.at({ x: bathroomX, y: 0.035, z: bathroomZ }), materials, bathroomWidth, bathroomDepth));
  context.box(white, bathroomX - bathroomWidth / 2, 1.32, bathroomZ, 0.08, 2.64, bathroomDepth);
  context.box(white, bathroomX, 2.4, bathroomZ + bathroomDepth / 2, bathroomWidth, 0.48, 0.08);
  context.box(oak, bathroomX + bathroomWidth * 0.2, 1.08, bathroomZ + bathroomDepth / 2, bathroomWidth * 0.52, 2.12, 0.05);
  const kitchenWidth = Math.max(1.8, width - bathroomWidth - 0.8);
  animations.push(...buildKitchenCounter(context.at({ x: -width / 2 + kitchenWidth / 2 + 0.05, y: 0.035, z: -depth / 2 + 0.32 }), materials, kitchenWidth));
  animations.push(buildDetailedDomesticFridge(context.at({ x: width / 2 - bathroomWidth - 0.35, y: 0.035, z: -depth / 2 + 0.35 }), materials, 1.65));
  buildBed(context.at({ x: -width / 2 + 0.58, y: 0.035, z: depth / 2 - 1.12 }), materials, false);
  buildSofa(context.at({ x: width / 2 - 0.95, y: 0.035, z: depth / 2 - 0.53, yaw: Math.PI }), materials, 1.6);
  buildCafeTable(context.at({ x: width / 2 - 0.86, y: 0.035, z: depth / 2 - 1.45 }), 0.32);
  buildCoffeeCup(context.at({ x: width / 2 - 0.82, y: 0.81, z: depth / 2 - 1.45 }));
  buildPendantLight(context.at({ x: width / 2 - 0.86, y: 2.62, z: depth / 2 - 1.45 }), 0.55, 0.15);
  buildWardrobe(context.at({ x: -width / 2 + 0.18, y: 0.035, z: -0.15, yaw: Math.PI / 2 }), 0.9, 2.3);
  buildSmokeDetector(context.at({ x: 0, y: 2.62, z: 0 }));
  animations.push(buildVenetianBlinds(context.at({ x: 0, y: 0, z: depth / 2 - 0.035 }), width * 0.65, 1.8, [0, 0.55, 0], width));
  return animations;
}

export function buildVillaInterior(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, detailed: boolean): Animation[] {
  const animations: Animation[] = [];
  const usableWidth = width - (detailed ? 2.8 : 0);
  const livingWidth = usableWidth * 0.54;
  const diningWidth = usableWidth - livingWidth;
  const frontDepth = depth * 0.55;
  animations.push(...buildLivingRoom(context.at({ x: -width / 2 + livingWidth / 2, y: 0, z: depth / 2 - frontDepth / 2 }), materials, livingWidth, frontDepth));
  animations.push(...buildDiningRoom(context.at({ x: -width / 2 + livingWidth + diningWidth / 2, y: 0, z: depth / 2 - frontDepth / 2 }), materials, diningWidth, frontDepth));
  const kitchenWidth = width * 0.45;
  animations.push(...buildKitchenCounter(context.at({ x: -width / 2 + kitchenWidth / 2 + 0.15, y: 0, z: -depth / 2 + 0.4 }), materials, kitchenWidth - 0.3, detailed));
  if (detailed) animations.push(buildDetailedDomesticFridge(context.at({ x: -width / 2 + kitchenWidth + 0.42, y: 0, z: -depth / 2 + 0.36 }), materials));
  else buildRefrigerator(context.at({ x: -width / 2 + kitchenWidth + 0.42, y: 0, z: -depth / 2 + 0.36 }), materials);
  if (detailed) animations.push(...buildUtilityRoom(context.at({ x: width / 2 - 1, y: 0, z: -depth / 2 + 1 }), materials, 1.75, 1.75));
  return animations;
}

export function buildVillaUpperFloor(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, detailed: boolean): Animation[] {
  const animations: Animation[] = [];
  const roomWidth = width * 0.49;
  const roomDepth = depth * 0.72;
  animations.push(...buildBedroom(context.at({ x: -width / 2 + roomWidth / 2, y: 0, z: depth / 2 - roomDepth / 2 }), materials, roomWidth, roomDepth));
  if (detailed) {
    const officeDepth = Math.max(2.5, roomDepth - 2.4);
    animations.push(...buildHomeOffice(context.at({ x: width / 2 - roomWidth / 2, y: 0, z: -depth / 2 + officeDepth / 2 }), materials, roomWidth, officeDepth));
    buildHollowBath(context.at({ x: width / 2 - 0.9, y: 0, z: -depth / 2 + 0.7, yaw: Math.PI / 2 }), 0.7, Math.min(1.6, roomWidth - 0.2));
  } else {
    animations.push(...buildBedroom(context.at({ x: width / 2 - roomWidth / 2, y: 0, z: depth / 2 - roomDepth / 2 }), materials, roomWidth, roomDepth, false));
  }
  context.box(context.palette.white, 0, 1.32, 0, 0.12, 2.64, depth);
  return animations;
}
