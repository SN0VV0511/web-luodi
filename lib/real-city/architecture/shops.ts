import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import type { CityBuiltSite } from "../contracts";
import { buildWallWithOpenings, buildSlab, buildParapet, buildTimberPergola } from "./structure";
import { buildShopWindow, buildGlassCanopy, buildFabricAwning, buildBrickPier, buildStoneCladding, buildUnitizedGlazing } from "./envelope";
import { buildSwingDoor, buildAutomaticSlidingDoor, buildRollerShutter } from "./doors";
import { buildFlight, buildHandrail } from "./circulation";
import { buildBakeryInterior, buildGroceryInterior, buildPharmacyInterior, buildCoffeeBar, buildCheckout, buildRetailShelving } from "./retail-fixtures";
import { buildBookshelf, buildCafeTable, buildCoffeeCup, buildDiningChair, buildOfficeDesk, buildTaskChair } from "./furniture";
import { buildPlanterBox, buildPottedPlant, buildLitterBin, buildBicycleRack } from "./landscape";
import { buildTrackLighting, buildPendantLight } from "./lighting";
import { buildAirHandlingUnit, buildSolarArray } from "./roof-plant";
import { buildBuildingEntryControls, buildBuildingServiceRoom } from "./building-utilities";
import { buildAnalogClock } from "./display-instruments";
import { buildSpecialistWorkspace } from "./specialist-workspaces";
import { buildEntranceChannelDrain, buildLaminatedCanopy, buildRecessedEntranceMat, buildThresholdStrip } from "./entrance-details";
import { buildVentilatingSkylight } from "./roof-maintenance";
import { buildSteelStringerStair } from "./residential-staircases";
import { buildArticulatedRollerShutter } from "./door-mechanisms";
import { buildExteriorConstruction } from "./exterior-construction";
import { buildAcousticSlatCeiling } from "./interior-finishes";
import { buildRetailEscalator } from "./escalator";
import { buildRetailServiceYard } from "./service-yard";

export type ShopKind = "coffee" | "bakery" | "grocery" | "pharmacy" | "books" | "technology";

function shopName(kind: ShopKind): { zh: string; en: string } {
  if (kind === "coffee") return { zh: "海岸咖啡", en: "COAST COFFEE" };
  if (kind === "bakery") return { zh: "街角烘焙", en: "CORNER BAKERY" };
  if (kind === "grocery") return { zh: "邻里鲜食", en: "DAILY MARKET" };
  if (kind === "pharmacy") return { zh: "社区药房", en: "NEIGHBOR PHARMACY" };
  if (kind === "books") return { zh: "街角书店", en: "CORNER BOOKS" };
  return { zh: "数码工坊", en: "DEVICE WORKSHOP" };
}

function buildBookshopInterior(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  const { oak } = context.palette;
  buildBookshelf(context.at({ x: 0, y: 0, z: -depth / 2 + 0.18 }), width - 0.3, 2.35, 0.3, 3);
  for (const side of [-1, 1]) buildBookshelf(context.at({ x: side * (width / 2 - 0.2), y: 0, z: -depth * 0.1, yaw: -side * Math.PI / 2 }), depth * 0.55, 2.1, 0.3, side + 5);
  context.roundedBox(oak, -width * 0.15, 0.76, 0.2, width * 0.38, 0.06, depth * 0.28, 0.04);
  for (const side of [-1, 1]) context.box(oak, -width * 0.15 + side * width * 0.14, 0.38, 0.2, 0.08, 0.76, depth * 0.2);
  for (let stack = 0; stack < 5; stack++) {
    const x = -width * 0.3 + stack * width * 0.075;
    for (let book = 0; book < 3; book++) {
      context.box(context.palette.white, x, 0.81 + book * 0.03, 0.2, 0.15, 0.025, 0.22);
      context.box(stack % 2 ? context.palette.green : context.palette.red, x, 0.825 + book * 0.03, 0.2, 0.155, 0.004, 0.225);
    }
  }
  buildCheckout(context.at({ x: width * 0.3, y: 0, z: depth * 0.24 }), materials, width * 0.27);
  buildTrackLighting(context.at({ x: 0, y: 2.95, z: -depth * 0.22 }), width * 0.78, 4);
  return [];
}

function buildTechnologyInterior(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  buildRetailShelving(context.at({ x: 0, y: 0, z: -depth / 2 + 0.2 }), width - 0.4, 1.75, 0.3, "technology");
  for (const side of [-1, 1]) {
    const x = side * width * 0.25;
    buildOfficeDesk(context.at({ x, y: 0, z: -depth * 0.08 }), materials, width * 0.35);
    buildTaskChair(context.at({ x, y: 0, z: -depth * 0.08 + 0.7, yaw: Math.PI }), materials);
  }
  buildCheckout(context.at({ x: width * 0.27, y: 0, z: depth * 0.28 }), materials, width * 0.35);
  buildTrackLighting(context.at({ x: 0, y: 2.95, z: 0 }), width * 0.8, 4);
  return [];
}

function buildCoffeeInterior(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  const animations = buildCoffeeBar(context.at({ x: 0, y: 0, z: -depth * 0.3 }), materials, width * 0.8);
  for (const side of [-1, 1]) {
    for (const row of [-1, 1]) {
      const x = side * width * 0.25;
      const z = depth * 0.15 + row * depth * 0.16;
      buildCafeTable(context.at({ x, y: 0, z }), 0.38);
      buildDiningChair(context.at({ x: x - 0.54, y: 0, z, yaw: Math.PI / 2 }), materials);
      buildDiningChair(context.at({ x: x + 0.54, y: 0, z, yaw: -Math.PI / 2 }), materials);
      buildCoffeeCup(context.at({ x: x + 0.12, y: 0.78, z: z + 0.03 }));
      buildPendantLight(context.at({ x, y: 2.95, z }), 0.65, 0.18);
    }
  }
  buildPottedPlant(context.at({ x: -width / 2 + 0.4, y: 0, z: depth / 2 - 0.4 }), 1.3, 0.38);
  return animations;
}

export function buildRetailUnit(context: ArchitectureContext, materials: ArchitecturalMaterials, id: string, width: number, depth: number, kind: ShopKind, twoFloors: boolean, variant: number): { site: CityBuiltSite; animate: Animation[] } {
  const animations: Animation[] = [];
  const { concrete, white, glass, aluminum, oak } = context.palette;
  const groundHeight = 3.35;
  const height = twoFloors ? 6.5 : 3.65;
  buildSlab(context, concrete, width + 0.1, depth + 0.1, 0.18);
  context.box(kind === "coffee" || kind === "books" ? materials.timber : materials.terrazzo, 0, 0.016, 0, width - 0.14, 0.032, depth - 0.14);
  const front = context.at({ x: 0, y: 0, z: depth / 2 });
  const rear = context.at({ x: 0, y: 0, z: -depth / 2, yaw: Math.PI });
  const openings = [{ x: 0, y: 0, width: width - 0.3, height: 2.65 }];
  if (twoFloors) openings.push({ x: 0, y: groundHeight + 0.35, width: width - 0.7, height: 2.35 });
  buildWallWithOpenings(front, white, width, height, 0.18, openings);
  if (twoFloors) animations.push(...buildExteriorConstruction(front, { width, height, openings, variant, detailed: true, style: "render", shading: false, wallDepth: 0.18 }));
  buildWallWithOpenings(rear, white, width, height, 0.18, [{ x: width * 0.25, y: 0, width: 0.95, height: 2.15 }]);
  for (const side of [-1, 1]) {
    const sideContext = context.at({ x: side * width / 2, y: 0, z: 0, yaw: side * Math.PI / 2 });
    buildWallWithOpenings(sideContext, kind === "bakery" ? materials.boardConcrete : white, depth, height, 0.18, [{ x: depth * 0.23, y: 0.5, width: depth * 0.35, height: 2.1 }]);
    sideContext.box(glass, depth * 0.23, 1.55, 0.025, depth * 0.35 - 0.04, 2.06, 0.028);
    sideContext.box(aluminum, depth * 0.23, 1.55, 0.05, 0.035, 2.1, 0.07);
  }
  buildShopWindow(front, width - 0.34, 2.63, 0.02, 1.25);
  animations.push(buildSwingDoor(front.at({ x: 0, y: 0.02, z: 0.025 }), 1.21, 2.25, variant * 4.3));
  animations.push(twoFloors
    ? buildArticulatedRollerShutter(front.at({ x: 0, y: 0, z: 0.075 }), width - 0.3, 2.65, variant * 11)
    : buildRollerShutter(front.at({ x: 0, y: 0, z: 0.075 }), width - 0.3, 2.65, variant * 11));
  if (kind === "grocery" || kind === "pharmacy") buildLaminatedCanopy(front, width - 0.2, 0.95, 2.9);
  else animations.push(buildFabricAwning(front, width - 0.2, 1.15, 2.95, variant));
  const name = shopName(kind);
  buildRecessedEntranceMat(front.at({ x: 0, y: 0.018, z: -0.43 }), 1.2, 0.7);
  buildThresholdStrip(front, 1.25);
  buildEntranceChannelDrain(front.at({ x: 0, y: 0.012, z: 0.7 }), 1.6);
  animations.push(buildAnalogClock(context.at({ x: width * 0.25, y: 2.55, z: -depth / 2 + 0.13 }), 0.16, 9));
  front.label(name.en, 0, 3.12, 0.15, width - 0.3, 0.35, "#e9e5d6", kind === "pharmacy" ? "#386956" : "#3b413d");
  const retailInterior = twoFloors ? context : context.at({ x: 0, y: 0, z: depth * 0.18 });
  const retailDepth = twoFloors ? depth - 0.35 : depth * 0.62 - 0.15;
  if (kind === "bakery") {
    for (const side of [-1, 1]) buildBrickPier(front.at({ x: side * (width / 2 - 0.12), y: 0, z: 0.04 }), 0.24, 2.8, 0.2);
    animations.push(...buildBakeryInterior(retailInterior, materials, width - 0.35, retailDepth));
  } else if (kind === "grocery") {
    animations.push(...buildGroceryInterior(retailInterior, materials, width - 0.35, retailDepth));
  } else if (kind === "pharmacy") {
    animations.push(...buildPharmacyInterior(retailInterior, materials, width - 0.35, retailDepth));
  } else if (kind === "books") {
    animations.push(...buildBookshopInterior(retailInterior, materials, width - 0.35, retailDepth));
  } else if (kind === "technology") {
    animations.push(...buildTechnologyInterior(retailInterior, materials, width - 0.35, retailDepth));
  } else {
    animations.push(...buildCoffeeInterior(retailInterior, materials, width - 0.35, retailDepth));
  }
  if (!twoFloors) animations.push(...buildSpecialistWorkspace(context.at({ x: 0, y: 0.035, z: -depth * 0.31 }), materials, kind, width - 0.35, depth * 0.36 - 0.1, variant));
  if (twoFloors) {
    const upper = context.at({ x: 0, y: groundHeight, z: 0 });
    buildSlab(upper, concrete, width, depth, 0.18, [{ x: width / 2 - 0.7, z: -depth * 0.1, width: 1.2, depth: depth * 0.65 }]);
    upper.box(materials.timber, 0, 0.02, 0, width - 0.2, 0.035, depth - 0.2);
    buildUnitizedGlazing(front.at({ x: 0, y: groundHeight, z: 0.02 }), width - 0.7, 2.35, 0.35, 0);
    if (kind === "technology") animations.push(buildRetailEscalator(context.at({ x: width / 2 - 0.72, y: 0, z: depth * 0.32 }), groundHeight, 0.82, 4.5));
    else buildSteelStringerStair(context.at({ x: width / 2 - 0.72, y: 0, z: depth * 0.4 }), materials, groundHeight, 1.03, Math.ceil(groundHeight / 0.175) * 0.25);
    buildHandrail(upper.at({ x: width / 2 - 1.3, y: 0, z: -depth * 0.1, yaw: Math.PI / 2 }), depth * 0.65, 1.05);
    animations.push(...buildSpecialistWorkspace(upper.at({ x: -0.55, y: 0.04, z: 0 }), materials, kind, width - 1.45, depth - 0.3, variant));
    buildTrackLighting(upper.at({ x: 0, y: 2.9, z: 0 }), width * 0.75, 4);
    buildAcousticSlatCeiling(upper.at({ x: 0, y: 3.07, z: -depth * 0.24 }), width - 0.25, depth * 0.44, 1.1);
  }
  const roof = context.at({ x: 0, y: height, z: 0 });
  buildSlab(roof, concrete, width + 0.18, depth + 0.18, 0.18, twoFloors ? [{ x: -width * 0.3, z: depth * 0.3, width: 2.1, depth: 1.2 }] : []);
  if (twoFloors) buildSlab(roof.at({ x: 0, y: 0.03, z: 0 }), materials.membrane, width - 0.1, depth - 0.1, 0.03, [{ x: -width * 0.3, z: depth * 0.3, width: 2.1, depth: 1.2 }]);
  else roof.box(materials.membrane, 0, 0.015, 0, width - 0.1, 0.03, depth - 0.1);
  buildParapet(roof, width, depth, 0.22);
  if (twoFloors) {
    animations.push(buildVentilatingSkylight(roof.at({ x: -width * 0.3, y: 0.04, z: depth * 0.3 }), 2.2, 1.3, variant));
    animations.push(buildAirHandlingUnit(roof.at({ x: width * 0.27, y: 0.04, z: -depth * 0.25 }), 0.9, 1.5, 0.65, variant));
    buildSolarArray(roof.at({ x: -width * 0.25, y: 0.04, z: -depth * 0.1 }), 2, 1);
    const services = buildBuildingServiceRoom(roof.at({ x: 0, y: 0.04, z: depth * 0.23 }), materials, "shop", width * depth * 2, variant);
    animations.push(...services.animations, ...buildBuildingEntryControls(front.at({ x: width / 2 - 0.22, y: 0, z: 0.17 }), services.model));
  }
  buildStoneCladding(front.at({ x: 0, y: 0, z: -0.02 }), width, 0.15, 0);
  if (twoFloors) animations.push(...buildRetailServiceYard(context.at({ x: width * 0.25, y: 0.01, z: -depth / 2 - 1.35, yaw: Math.PI }), materials, kind === "coffee" || kind === "bakery" || kind === "grocery"));
  const entrance = context.world([0, 0.04, depth / 2 + 0.18]);
  const yaw = context.local.yaw ?? 0;
  return {
    site: { id, kind: kind === "coffee" || kind === "bakery" ? "restaurant" : "retail", name: { zh: name.zh, en: name.en }, x: context.local.x, z: context.local.z, width: width + 0.25, depth: depth + 0.3, height: height + 0.4, rotationY: yaw, baseY: context.local.y, entrances: [{ id: `${id}-entrance`, position: { x: entrance.x, y: entrance.y, z: entrance.z }, outward: { x: Math.sin(yaw), z: Math.cos(yaw) }, width: 1.25, accessible: true }] },
    animate: animations,
  };
}

export function buildCommercialCourt(context: ArchitectureContext, materials: ArchitecturalMaterials, id: string, variant: number): { sites: CityBuiltSite[]; animate: Animation[] } {
  const kinds: ShopKind[] = ["coffee", "bakery", "grocery", "pharmacy", "books", "technology"];
  const animations: Animation[] = [];
  const sites: CityBuiltSite[] = [];
  context.box(materials.terrazzo, 0, 0.015, 0, 28.8, 0.03, 28.8);
  const stores = [
    buildRetailUnit(context.at({ x: -6.8, y: 0.04, z: -4.8 }), materials, `${id}-a`, 13.1, 11.9, kinds[variant % kinds.length], true, variant * 3),
    buildRetailUnit(context.at({ x: 7.2, y: 0.04, z: -5.2 }), materials, `${id}-b`, 11.5, 11.1, kinds[(variant + 2) % kinds.length], false, variant * 3 + 1),
    buildRetailUnit(context.at({ x: 7.5, y: 0.04, z: 7.5 }), materials, `${id}-c`, 8.2, 6.4, kinds[(variant + 4) % kinds.length], false, variant * 3 + 2),
  ];
  for (const store of stores) {
    sites.push(store.site);
    animations.push(...store.animate);
  }
  buildTimberPergola(context.at({ x: -6.5, y: 0.04, z: 8 }), 7.3, 6.2, 2.8);
  for (const x of [-8.8, -4.2]) {
    for (const z of [6, 10]) {
      buildCafeTable(context.at({ x, y: 0.04, z }), 0.48);
      for (const side of [-1, 1]) buildDiningChair(context.at({ x: x + side * 0.7, y: 0.04, z, yaw: -side * Math.PI / 2 }), materials);
    }
  }
  buildPlanterBox(context.at({ x: -12.8, y: 0.04, z: 7.6 }), 1.2, 5.8, 0.42);
  buildPlanterBox(context.at({ x: -6, y: 0.04, z: 13 }), 6.5, 0.7, 0.35);
  buildBicycleRack(context.at({ x: 0.1, y: 0.04, z: 12.3 }), 3);
  buildLitterBin(context.at({ x: 1.2, y: 0.04, z: 3.5 }), true);
  return { sites, animate: animations };
}
