import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import type { CityBuiltSite } from "../contracts";
import { buildWallWithOpenings, buildSlab, buildParapet, buildBalcony, type WallOpening } from "./structure";
import { buildGlassCanopy, buildOperableWindow, buildRainwaterDownpipe, buildCavityVent } from "./envelope";
import { buildAutomaticSlidingDoor, buildFireExit } from "./doors";
import { buildFireEscape, buildTactilePaving } from "./circulation";
import { buildStudioApartment } from "./rooms";
import { buildAirHandlingUnit, buildLightningProtection, buildRoofAccessHatch, buildRoofDrain, buildSolarArray, buildSplitCondenser } from "./roof-plant";
import { buildBookshelf, buildSofa } from "./furniture";
import { buildPlanterBox, buildBicycleRack, buildLitterBin, buildSlattedBench, buildCourtyardPaving } from "./landscape";
import { buildPendantLight, buildRecessedDownlight, buildWallSconce } from "./lighting";
import { buildMechanicalPlant } from "./mechanical-components";
import { buildPassengerLift, buildServiceStair } from "./vertical-transport";
import { buildBuildingEntryControls, buildBuildingServiceRoom } from "./building-utilities";
import { buildAnalogClock } from "./display-instruments";
import { buildDetailedWindowWall } from "./window-assemblies";
import { buildBalconyLife } from "./balcony-life";
import { buildAccessibleEntryDetails, buildLaminatedCanopy } from "./entrance-details";
import { buildDetailedDownpipe, buildRoofDrainageSystem } from "./roof-drainage";
import { buildRoofMaintenanceArea } from "./roof-maintenance";
import { buildRevolvingVestibule } from "./revolving-entrance";
import { buildExteriorConstruction } from "./exterior-construction";
import { buildResidentialCorridor } from "./interior-finishes";
import { buildCourtyardBicycleShelter } from "./courtyard-shelter";

export type ApartmentResult = {
  site: CityBuiltSite;
  animate: Animation[];
  height: number;
};

export function buildApartmentTower(context: ArchitectureContext, materials: ArchitecturalMaterials, id: string, width: number, depth: number, floors: number, variant: number, detailed: boolean): ApartmentResult {
  const animations: Animation[] = [];
  const { white, concrete, glass, aluminum, steel, limestone } = context.palette;
  const groundHeight = 3.3;
  const floorHeight = 3.1;
  const towerHeight = groundHeight + floors * floorHeight;
  const facade = variant % 3 === 0 ? materials.boardConcrete : variant % 3 === 1 ? white : limestone;
  const front = context.at({ x: 0, y: 0, z: depth / 2 });
  const back = context.at({ x: 0, y: 0, z: -depth / 2, yaw: Math.PI });
  const frontOpenings: WallOpening[] = [{ x: 0, y: 0, width: 4.1, height: 2.55 }];
  const backOpenings: WallOpening[] = [{ x: width * 0.25, y: 0, width: 0.95, height: 2.15 }];
  const bayWidth = width / 2;
  for (let floor = 0; floor < floors; floor++) {
    const level = groundHeight + floor * floorHeight;
    for (const side of [-1, 1]) {
      const x = side * width * 0.25;
      frontOpenings.push({ x, y: level + 0.25, width: bayWidth - 0.55, height: 2.35 });
      backOpenings.push({ x, y: level + 0.75, width: bayWidth - 1.2, height: 1.7 });
    }
  }
  buildWallWithOpenings(front, facade, width, towerHeight, 0.22, frontOpenings);
  buildWallWithOpenings(back, facade, width, towerHeight, 0.22, backOpenings);
  if (detailed) {
    const style = variant % 2 ? "metal" : "stone";
    animations.push(...buildExteriorConstruction(front, { width, height: towerHeight, openings: frontOpenings, variant, detailed, style, shading: false, wallDepth: 0.22 }));
    animations.push(...buildExteriorConstruction(back, { width, height: towerHeight, openings: backOpenings, variant: variant + 1, detailed, style, shading: true, wallDepth: 0.22 }));
  }
  for (const side of [-1, 1]) {
    const sideWall = context.at({ x: side * width / 2, y: 0, z: 0, yaw: side * Math.PI / 2 });
    const openings: WallOpening[] = [];
    for (let floor = 0; floor < floors; floor++) {
      const level = groundHeight + floor * floorHeight;
      for (const position of [-depth * 0.27, depth * 0.27]) {
        const fireDoor = detailed && side === -1 && floor < 4 && position > 0;
        openings.push({ x: position, y: level + (fireDoor ? 0 : 0.85), width: fireDoor ? 0.95 : 1.4, height: fireDoor ? 2.15 : 1.55 });
      }
    }
    buildWallWithOpenings(sideWall, facade, depth, towerHeight, 0.2, openings);
    if (detailed) animations.push(...buildExteriorConstruction(sideWall, { width: depth, height: towerHeight, openings, variant: variant + side + 3, detailed, style: "render", shading: side > 0, wallDepth: 0.2 }));
    for (const opening of openings) {
      if (opening.height > 2) {
        buildFireExit(sideWall.at({ x: opening.x, y: opening.y, z: 0.13 }), opening.width - 0.03, 2.1);
        continue;
      }
      sideWall.box(glass, opening.x, opening.y + opening.height / 2, 0.035, opening.width - 0.06, opening.height - 0.06, 0.025);
      sideWall.box(aluminum, opening.x, opening.y + opening.height / 2, 0.065, 0.035, opening.height, 0.06);
      sideWall.box(aluminum, opening.x, opening.y - 0.025, 0.09, opening.width + 0.1, 0.05, 0.19);
    }
  }
  buildSlab(context, concrete, width + 0.18, depth + 0.18, 0.2);
  if (detailed) animations.push(...buildRevolvingVestibule(front, 2.46));
  else animations.push(buildAutomaticSlidingDoor(front, 2, 2.5, variant * 5));
  if (detailed) {
    buildLaminatedCanopy(front, 4.5, 1.4, 2.86);
    animations.push(...buildAccessibleEntryDetails(front, materials, 2, 2.5, "RESIDENCE", floors));
  } else buildGlassCanopy(front, 4.5, 1.4, 2.86);
  buildFireExit(back.at({ x: width * 0.25, y: 0, z: 0.12 }), 0.92, 2.1);
  buildTactilePaving(front.at({ x: 0, y: 0.016, z: 0.95 }), 1.3, 0.45, true);
  front.label(`RESIDENCE ${String(variant + 1).padStart(2, "0")}`, 0, 3.02, 0.13, 3.3, 0.28, "#d9d2bf", "#3f4845");
  for (const side of [-1, 1]) buildWallSconce(front.at({ x: side * 2.5, y: 1.9, z: 0.16 }));
  const lobby = context.at({ x: 0, y: 0.02, z: depth * 0.23 });
  lobby.box(materials.terrazzo, 0, 0.012, 0, width - 0.3, 0.025, depth * 0.48);
  buildSofa(lobby.at({ x: -width * 0.27, y: 0.02, z: -0.25, yaw: Math.PI / 2 }), materials, 1.6);
  buildBookshelf(lobby.at({ x: width * 0.32, y: 0.02, z: -0.45, yaw: -Math.PI / 2 }), 1.25, 1.5, 0.3, variant);
  buildPendantLight(lobby.at({ x: 0, y: 3.08, z: 0.3 }), 0.55, 0.26);
  if (detailed) animations.push(buildAnalogClock(lobby.at({ x: 0, y: 2.58, z: -depth * 0.22 + 0.04 }), 0.2, 8));
  for (let mailbox = 0; mailbox < 12; mailbox++) {
    const x = -0.66 + (mailbox % 4) * 0.44;
    const y = 0.8 + Math.floor(mailbox / 4) * 0.22;
    lobby.box(aluminum, x, y, -depth * 0.22, 0.41, 0.19, 0.12);
    lobby.box(steel, x, y + 0.035, -depth * 0.22 + 0.066, 0.25, 0.012, 0.01);
  }
  for (let floor = 0; floor < floors; floor++) {
    const level = groundHeight + floor * floorHeight;
    const floorContext = context.at({ x: 0, y: level, z: 0 });
    buildSlab(floorContext, concrete, width, depth, 0.18, detailed ? [
      { x: 0, z: -1.6, width: 2.16, depth: 2.12 },
      { x: -width / 2 + 1.4, z: -2.45, width: 2.5, depth: 4.8 },
    ] : []);
    const passageDoors = [-1, 1].map(side => ({ x: side * width * 0.25, y: 0, width: 0.86, height: 2.1 }));
    buildWallWithOpenings(floorContext.at({ x: 0, y: 0, z: 0.67 }), white, width - 0.2, 2.7, 0.1, passageDoors);
    if (detailed) buildWallWithOpenings(floorContext.at({ x: 0, y: 0, z: -0.67 }), white, width - 0.2, 2.7, 0.1, [
      { x: 0, y: 0, width: 1.65, height: 2.5 },
      { x: -width / 2 + 1.4, y: 0, width: 1.1, height: 2.1 },
      { x: width * 0.25, y: 0, width: 0.86, height: 2.1 },
    ]);
    else buildWallWithOpenings(floorContext.at({ x: 0, y: 0, z: -0.67 }), white, width - 0.2, 2.7, 0.1, passageDoors);
    if (detailed && floor < 2) animations.push(...buildResidentialCorridor(floorContext, width, floor));
    const unitWidth = width / 2 - 0.18;
    const unitDepth = depth / 2 - 0.82;
    for (const side of [-1, 1]) {
      const x = side * width * 0.25;
      const face = floorContext.at({ x, y: 0.25, z: depth / 2 + 0.025 });
      if (detailed && floor < 2) animations.push(...buildDetailedWindowWall(face, materials, bayWidth - 0.55, 2.35, variant + floor * 2 + (side > 0 ? 1 : 0), floor === 0));
      else {
        face.box(glass, 0, 1.175, 0, bayWidth - 0.6, 2.3, 0.028);
        for (const mullion of [-1, 0, 1]) face.box(aluminum, mullion * (bayWidth - 0.55) / 2, 1.175, 0.045, 0.04, 2.35, 0.075);
        face.box(aluminum, 0, 0.015, 0.04, bayWidth - 0.55, 0.04, 0.08);
        face.box(aluminum, 0, 2.335, 0.04, bayWidth - 0.55, 0.04, 0.08);
      }
      if (floor % 3 !== 2) {
        const balcony = floorContext.at({ x, y: 0.02, z: depth / 2 + 0.12 });
        buildBalcony(balcony, bayWidth - 0.3, 0.95, variant % 2 === 0);
        if (detailed && floor < 2) animations.push(...buildBalconyLife(balcony, materials, bayWidth - 0.3, 0.95, variant + floor * 2 + (side > 0 ? 1 : 0), floor === 0));
        if (!(detailed && floor < 2) && (floor + side + variant) % 3 === 0) buildPlanterBox(balcony.at({ x: -0.65, y: 0.02, z: 0.7 }), 0.75, 0.23, 0.25);
      }
      const rear = floorContext.at({ x, y: 0.75, z: -depth / 2 - 0.035, yaw: Math.PI });
      rear.box(glass, 0, 0.85, 0, bayWidth - 1.26, 1.64, 0.028);
      rear.box(aluminum, 0, 0.85, 0.045, 0.04, 1.7, 0.06);
      rear.box(aluminum, 0, -0.02, 0.06, bayWidth - 1.1, 0.045, 0.15);
      if (floor < 2 || floor === floors - 1) {
        const full = detailed && floor === 0;
        animations.push(...buildStudioApartment(floorContext.at({ x, y: 0.02, z: unitDepth / 2 + 0.72 }), materials, unitWidth, unitDepth, full));
      } else {
        floorContext.box(context.palette.oak, x, 0.76, depth / 2 - 1.1, bayWidth * 0.45, 0.045, 0.6);
        floorContext.box(context.palette.fabric, x - 0.4, 0.47, depth / 2 - 1.65, 0.42, 0.075, 0.42);
        floorContext.box(context.palette.warmLight, x, 2.55, depth / 2 - 1.2, 0.22, 0.035, 0.22);
      }
    }
    if (detailed && floor === 0) animations.push(buildOperableWindow(floorContext.at({ x: width / 2 + 0.02, y: 0, z: depth * 0.27, yaw: Math.PI / 2 }), 1.35, 1.5, [0, 0.86, 0], variant * 7));
    if (floor % 2 === 0) buildRecessedDownlight(floorContext.at({ x: 0, y: 2.73, z: 0 }));
  }
  if (detailed) {
    animations.push(...buildPassengerLift(context.at({ x: 0, y: 0, z: -1.6 }), materials, floors, groundHeight, floorHeight, variant));
    buildServiceStair(context.at({ x: -width / 2 + 1.4, y: 0, z: -2.45 }), materials, floors, groundHeight, floorHeight);
    const services = buildBuildingServiceRoom(context.at({ x: width / 2 - 1.7, y: 0.02, z: -depth / 2 + 1.4 }), materials, "apartment", width * depth * floors, variant);
    animations.push(...services.animations, ...buildBuildingEntryControls(front.at({ x: 2.85, y: 0, z: 0.15 }), services.model));
  }
  const roof = context.at({ x: 0, y: towerHeight, z: 0 });
  buildSlab(roof, concrete, width + 0.15, depth + 0.15, 0.2);
  roof.box(materials.membrane, 0, 0.014, 0, width - 0.2, 0.028, depth - 0.2);
  buildParapet(roof, width, depth, 0.48);
  if (detailed) buildRoofDrainageSystem(roof, materials, width, depth, 0.48, variant);
  if (detailed) animations.push(...buildRoofMaintenanceArea(roof, materials, width, depth, towerHeight, variant));
  roof.box(concrete, -width * 0.25, 0.95, -depth * 0.18, 2.5, 1.9, 2.1);
  roof.box(materials.ribbedMetal, -width * 0.25, 1.93, -depth * 0.18, 2.65, 0.06, 2.25);
  buildCavityVent(roof.at({ x: -width * 0.25, y: 0.6, z: -depth * 0.18 + 1.07 }), 0, 0.45, 1.1, 0.75);
  if (detailed) animations.push(...buildMechanicalPlant(roof.at({ x: width * 0.23, y: 0.03, z: -depth * 0.21 }), materials, variant));
  else animations.push(buildAirHandlingUnit(roof.at({ x: width * 0.27, y: 0.03, z: -depth * 0.21 }), 1.2, 2.2, 0.8, variant));
  buildSolarArray(roof.at({ x: width * 0.1, y: 0.03, z: depth * 0.24 }), 3, 1);
  animations.push(buildRoofAccessHatch(roof.at({ x: -width * 0.3, y: 0.02, z: depth * 0.22 }), 0.85, 1.1, 17 + variant * 9));
  buildLightningProtection(roof.at({ x: 0, y: 0.5, z: 0 }), width - 0.08, depth - 0.08);
  for (const side of [-1, 1]) buildRoofDrain(roof.at({ x: side * (width / 2 - 0.5), y: 0.03, z: -depth / 2 + 0.5 }));
  if (detailed) buildDetailedDownpipe(context.at({ x: width / 2 + 0.12, y: 0.05, z: -depth / 2 + 0.35, yaw: Math.PI / 2 }), towerHeight - 0.25, 0.05, 0.1);
  else buildRainwaterDownpipe(context.at({ x: width / 2 + 0.12, y: 0.05, z: -depth / 2 + 0.35, yaw: Math.PI / 2 }), towerHeight, 0.1);
  if (detailed) buildFireEscape(context.at({ x: -width / 2 - 0.82, y: 0, z: depth * 0.27, yaw: 0 }), Math.min(floors, 4), floorHeight, groundHeight);
  const entrance = context.world([0, 0, depth / 2 + 0.3]);
  const site: CityBuiltSite = {
    id,
    kind: "residential",
    name: { zh: `海湾公寓 ${variant + 1}`, en: `Bay Residence ${variant + 1}` },
    x: context.local.x - (detailed ? 0.8 : 0),
    z: context.local.z + 0.45,
    width: width + (detailed ? 1.7 : 0.25),
    depth: depth + 1.2,
    height: towerHeight + 2,
    rotationY: context.local.yaw ?? 0,
    baseY: context.local.y,
    entrances: [{ id: `${id}-lobby`, position: { x: entrance.x, y: entrance.y, z: entrance.z }, outward: { x: 0, z: 1 }, width: 2, accessible: true }],
  };
  return { site, animate: animations, height: towerHeight + 2 };
}

export function buildApartmentCourt(context: ArchitectureContext, materials: ArchitecturalMaterials, id: string, stories: number, variant: number, detailed: boolean): { sites: CityBuiltSite[]; animate: Animation[] } {
  const animations: Animation[] = [];
  const main = buildApartmentTower(context.at({ x: -6.35, y: 0, z: -5.1 }), materials, `${id}-a`, 11.6, 10, stories, variant, detailed);
  const secondary = buildApartmentTower(context.at({ x: 7.1, y: 0, z: -5.6 }), materials, `${id}-b`, 9.2, 9, Math.max(4, stories - 3), variant + 1, false);
  animations.push(...main.animate, ...secondary.animate);
  buildCourtyardPaving(context.at({ x: 0, y: 0.01, z: 7.8 }), materials, 28.8, 12.2, 2.4);
  buildSlattedBench(context.at({ x: -8.8, y: 0.04, z: 9.2 }), 1.8);
  buildSlattedBench(context.at({ x: 8.8, y: 0.04, z: 9.2 }), 1.8);
  if (detailed) animations.push(...buildCourtyardBicycleShelter(context.at({ x: 4.8, y: 0.04, z: 12.1 }), materials, variant));
  else buildBicycleRack(context.at({ x: 4.2, y: 0.04, z: 12.1 }), 3);
  buildLitterBin(context.at({ x: -2, y: 0.04, z: 11.5 }));
  buildLitterBin(context.at({ x: -2.55, y: 0.04, z: 11.5 }), true);
  buildPlanterBox(context.at({ x: -11.8, y: 0.04, z: 3.1 }), 2.1, 0.8, 0.45);
  buildPlanterBox(context.at({ x: 11.8, y: 0.04, z: 3.1 }), 2.1, 0.8, 0.45);
  for (const side of [-1, 1]) {
    const point = context.world([side * 12.8, 0, 11.8]);
    context.kit.tree(point.x, point.z, 0.65, variant + side, point.y);
  }
  if (detailed) animations.push(buildSplitCondenser(context.at({ x: -11.9, y: 0.5, z: -5.2, yaw: -Math.PI / 2 })));
  return { sites: [main.site, secondary.site], animate: animations };
}
