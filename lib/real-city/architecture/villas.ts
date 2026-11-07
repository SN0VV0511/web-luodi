import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import type { CityBuiltSite } from "../contracts";
import { buildWallWithOpenings, buildSlab, buildParapet, buildPitchedRoof, buildBalcony, buildTimberPergola } from "./structure";
import { buildShopWindow, buildGlassCanopy, buildRainwaterDownpipe, buildBayWindow, buildStoneCladding } from "./envelope";
import { buildSwingDoor, buildSectionalGarageDoor } from "./doors";
import { buildAccessibleRamp, buildParkingBarrier, buildBicycleRamp } from "./circulation";
import { buildVillaInterior, buildVillaUpperFloor } from "./rooms";
import { buildPottedPlant, buildPlanterBox, buildPool, buildSunLounger, buildSlattedBench } from "./landscape";
import { buildExteriorBollard, buildWallSconce, buildRecessedDownlight } from "./lighting";
import { buildSolarArray, buildRoofDrain } from "./roof-plant";
import { buildBuildingEntryControls, buildBuildingServiceRoom } from "./building-utilities";
import { buildGarageWorkshop } from "./garage-workshop";
import { buildCourtyardEquipment, buildLouveredPergola, buildOutdoorKitchen } from "./courtyard-equipment";
import { buildDetailedWindowWall } from "./window-assemblies";
import { buildBalconyLife } from "./balcony-life";
import { buildPitchedRoofDrainage, buildRoofDrainageSystem } from "./roof-drainage";
import { buildVillaStaircase } from "./residential-staircases";
import { buildTrackedGarageDoor } from "./door-mechanisms";
import { buildExteriorConstruction } from "./exterior-construction";
import { buildGardenConservatory } from "./garden-conservatory";

function siteAt(context: ArchitectureContext, id: string, width: number, depth: number, height: number, doorX: number, kind: "residential" | "service"): CityBuiltSite {
  const entrance = context.world([doorX, 0, depth / 2 + 0.15]);
  const yaw = context.local.yaw ?? 0;
  return {
    id,
    kind,
    name: { zh: kind === "residential" ? "海岸庭院住宅" : "住宅车库", en: kind === "residential" ? "Coast Courtyard House" : "Residential Garage" },
    x: context.local.x,
    z: context.local.z,
    width,
    depth,
    height,
    rotationY: yaw,
    baseY: context.local.y,
    entrances: [{ id: `${id}-entry`, position: { x: entrance.x, y: entrance.y, z: entrance.z }, outward: { x: Math.sin(yaw), z: Math.cos(yaw) }, width: kind === "residential" ? 1.25 : 2.5, accessible: true }],
  };
}

export function buildPrivateGarage(context: ArchitectureContext, materials: ArchitecturalMaterials, id: string, width: number, depth: number, phase: number, detailed = false): { site: CityBuiltSite; animate: Animation[] } {
  const { white, concrete, steel } = context.palette;
  const height = 2.65;
  buildSlab(context, concrete, width, depth, 0.16);
  context.box(materials.boardConcrete, 0, 0.012, 0, width - 0.14, 0.025, depth - 0.14);
  context.box(white, 0, height / 2, -depth / 2, width, height, 0.15);
  for (const side of [-1, 1]) context.box(white, side * width / 2, height / 2, 0, 0.15, height, depth);
  const front = context.at({ x: 0, y: 0, z: depth / 2 });
  buildWallWithOpenings(front, white, width, height, 0.15, [{ x: 0, y: 0, width: width - 0.26, height: 2.35 }]);
  const door = detailed ? buildTrackedGarageDoor(front, width - 0.3, 2.31, phase) : buildSectionalGarageDoor(front, width - 0.3, 2.31, phase);
  context.box(materials.ribbedMetal, 0, height + 0.04, 0, width + 0.2, 0.08, depth + 0.2);
  context.box(steel, -width / 2 + 0.18, 1.4, -depth * 0.18, 0.25, 1.25, 1.15);
  for (let shelf = 0; shelf < 3; shelf++) context.box(context.palette.oak, -width / 2 + 0.32, 0.55 + shelf * 0.45, -depth * 0.18, 0.55, 0.035, 1.2);
  buildRecessedDownlight(context.at({ x: 0, y: 2.58, z: 0 }));
  const animations = [door];
  if (detailed) {
    const services = buildBuildingServiceRoom(context.at({ x: 0, y: 0.02, z: -depth / 2 + 1.15 }), materials, "villa", 180, phase);
    animations.push(...services.animations, ...buildBuildingEntryControls(front.at({ x: width / 2 - 0.12, y: 0, z: 0.15 }), services.model));
    animations.push(...buildGarageWorkshop(context, materials, width - 0.2, depth - 0.2, phase));
  }
  return { site: siteAt(context, id, width, depth, height + 0.1, 0, "service"), animate: animations };
}

export function buildCourtyardVilla(context: ArchitectureContext, materials: ArchitecturalMaterials, id: string, lotWidth: number, lotDepth: number, variant: number, detailed: boolean): { sites: CityBuiltSite[]; animate: Animation[] } {
  const animations: Animation[] = [];
  const sites: CityBuiltSite[] = [];
  const { white, concrete, glass, aluminum, oak, limestone } = context.palette;
  const mirror = variant % 2 ? -1 : 1;
  const width = Math.min(11.5, lotWidth * 0.55);
  const depth = Math.min(12.8, lotDepth * 0.43);
  const houseX = -mirror * lotWidth * 0.17;
  const houseZ = -lotDepth * 0.17;
  const groundHeight = 3.05;
  const upperHeight = 2.95;
  const house = context.at({ x: houseX, y: 0.04, z: houseZ });
  const front = house.at({ x: 0, y: 0, z: depth / 2 });
  const upperWidth = width * 0.82;
  const upperDepth = depth * 0.72;
  const upperZ = -depth * 0.14;
  const facade = variant % 3 === 0 ? materials.boardConcrete : white;
  buildSlab(house, concrete, width + 0.16, depth + 0.16, 0.2);
  house.box(materials.timber, 0, 0.014, 0, width - 0.12, 0.028, depth - 0.12);
  const frontOpenings = [{ x: 0, y: 0.04, width: width - 0.45, height: 2.6 }];
  buildWallWithOpenings(front, facade, width, groundHeight, 0.2, frontOpenings);
  if (detailed) animations.push(...buildExteriorConstruction(front, { width, height: groundHeight, openings: frontOpenings, variant, detailed, style: "render", shading: false }));
  buildShopWindow(front, width - 0.48, 2.55, 0.06, 1.25);
  animations.push(buildSwingDoor(front.at({ x: 0, y: 0.06, z: 0.025 }), 1.21, 2.25, variant * 3));
  buildGlassCanopy(front, 2.25, 0.95, 2.76);
  const rear = house.at({ x: 0, y: 0, z: -depth / 2, yaw: Math.PI });
  const rearOpenings = [{ x: -width * 0.25, y: 1.1, width: width * 0.32, height: 1.2 }, { x: width * 0.25, y: 0.85, width: width * 0.28, height: 1.45 }];
  buildWallWithOpenings(rear, facade, width, groundHeight, 0.18, rearOpenings);
  if (detailed) animations.push(...buildExteriorConstruction(rear, { width, height: groundHeight, openings: rearOpenings, variant: variant + 2, detailed, style: "render", shading: true, wallDepth: 0.18 }));
  rear.box(glass, -width * 0.25, 1.7, 0.035, width * 0.32 - 0.04, 1.16, 0.028);
  rear.box(glass, width * 0.25, 1.575, 0.035, width * 0.28 - 0.04, 1.41, 0.028);
  for (const side of [-1, 1]) {
    const wall = house.at({ x: side * width / 2, y: 0, z: 0, yaw: side * Math.PI / 2 });
    const openings = [{ x: depth * 0.22, y: 0.35, width: depth * 0.3, height: 2.15 }, { x: -depth * 0.25, y: 1.15, width: 1.4, height: 1.25 }];
    buildWallWithOpenings(wall, facade, depth, groundHeight, 0.18, openings);
    if (detailed) animations.push(...buildExteriorConstruction(wall, { width: depth, height: groundHeight, openings, variant: variant + side + 5, detailed, style: "stone", shading: side !== mirror, wallDepth: 0.18 }));
    wall.box(glass, depth * 0.22, 1.425, 0.025, depth * 0.3 - 0.04, 2.11, 0.028);
    wall.box(aluminum, depth * 0.22, 1.425, 0.055, 0.035, 2.15, 0.06);
    wall.box(glass, -depth * 0.25, 1.775, 0.025, 1.36, 1.21, 0.028);
    if (side === mirror && detailed) buildBayWindow(wall.at({ x: depth * 0.22, y: 0, z: 0.03 }), depth * 0.3, 2.15, 0.35, 0.3);
  }
  animations.push(...buildVillaInterior(house.at({ x: 0, y: 0.04, z: 0 }), materials, width - 0.35, depth - 0.35, detailed));
  if (detailed) buildVillaStaircase(house, materials, width, depth, groundHeight);
  const upper = house.at({ x: 0, y: groundHeight, z: upperZ });
  buildSlab(house.at({ x: 0, y: groundHeight, z: 0 }), concrete, width + 0.18, depth + 0.18, 0.2, detailed ? [{ x: width * 0.41 - 1, z: depth * 0.22 - 1.2, width: 1.86, depth: 1.86 }] : []);
  const upperFront = upper.at({ x: 0, y: 0, z: upperDepth / 2 });
  buildWallWithOpenings(upperFront, white, upperWidth, upperHeight, 0.18, [{ x: -upperWidth * 0.24, y: 0.25, width: upperWidth * 0.38, height: 2.2 }, { x: upperWidth * 0.24, y: 0.25, width: upperWidth * 0.38, height: 2.2 }]);
  for (const side of [-1, 1]) {
    if (detailed) animations.push(...buildDetailedWindowWall(upperFront.at({ x: side * upperWidth * 0.24, y: 0.25, z: 0.035 }), materials, upperWidth * 0.38, 2.2, variant + (side > 0 ? 1 : 0), side < 0));
    else {
      upperFront.box(glass, side * upperWidth * 0.24, 1.35, 0.035, upperWidth * 0.38 - 0.04, 2.16, 0.028);
      upperFront.box(aluminum, side * upperWidth * 0.24, 1.35, 0.06, 0.035, 2.2, 0.06);
    }
    upper.box(white, side * upperWidth / 2, upperHeight / 2, 0, 0.18, upperHeight, upperDepth);
  }
  upper.box(white, 0, upperHeight / 2, -upperDepth / 2, upperWidth, upperHeight, 0.18);
  animations.push(...buildVillaUpperFloor(upper.at({ x: 0, y: 0.02, z: 0 }), materials, upperWidth - 0.25, upperDepth - 0.25, detailed));
  const terraceDepth = depth / 2 - (upperZ + upperDepth / 2);
  buildBalcony(house.at({ x: 0, y: groundHeight + 0.02, z: upperZ + upperDepth / 2 }), width - 0.12, terraceDepth, true);
  if (detailed) animations.push(...buildBalconyLife(house.at({ x: 0, y: groundHeight + 0.02, z: upperZ + upperDepth / 2 }), materials, width - 0.12, terraceDepth, variant, false));
  if (!detailed) buildPlanterBox(house.at({ x: width * 0.28, y: groundHeight + 0.025, z: depth / 2 - 0.25 }), width * 0.32, 0.32, 0.35);
  const roof = upper.at({ x: 0, y: upperHeight, z: 0 });
  buildSlab(roof, concrete, upperWidth + 0.18, upperDepth + 0.18, 0.16);
  if (variant % 3 === 2) {
    buildPitchedRoof(roof, materials, upperWidth, upperDepth, upperWidth * 0.19);
    if (detailed) buildPitchedRoofDrainage(upper, upperWidth, upperDepth, upperHeight);
  } else {
    roof.box(materials.membrane, 0, 0.015, 0, upperWidth, 0.03, upperDepth);
    buildParapet(roof, upperWidth, upperDepth, 0.28);
    if (detailed) buildRoofDrainageSystem(roof, materials, upperWidth, upperDepth, 0.28, variant);
    buildSolarArray(roof.at({ x: 0, y: 0.04, z: -upperDepth * 0.18 }), Math.max(2, Math.min(4, Math.floor(upperWidth / 1.1))), 1, 0.23);
    buildRoofDrain(roof.at({ x: upperWidth / 2 - 0.35, y: 0.04, z: -upperDepth / 2 + 0.35 }));
  }
  buildRainwaterDownpipe(house.at({ x: -width / 2 - 0.035, y: 0.03, z: -depth / 2 + 0.18, yaw: -Math.PI / 2 }), groundHeight, 0.09);
  front.label(String(variant + 101), -width / 2 + 0.23, 1.5, 0.12, 0.27, 0.19, "#eee6d5", "#62685e");
  for (const side of [-1, 1]) buildWallSconce(front.at({ x: side * 1, y: 1.7, z: 0.13 }));
  const frontPathLength = lotDepth / 2 - (houseZ + depth / 2);
  context.box(materials.terrazzo, houseX, 0.025, houseZ + depth / 2 + frontPathLength / 2, 1.55, 0.05, frontPathLength);
  buildAccessibleRamp(front.at({ x: 0, y: -0.04, z: 0.7, yaw: Math.PI / 2 }), 0.06, 1.3, 1.1);
  const poolWidth = Math.min(3.1, lotWidth * 0.22);
  const poolDepth = Math.min(7.5, lotDepth * 0.27);
  const poolX = mirror * lotWidth * 0.32;
  const poolZ = lotDepth * 0.24;
  animations.push(buildPool(context.at({ x: poolX, y: 0.04, z: poolZ }), materials, poolWidth, poolDepth));
  if (detailed && lotWidth > 18) animations.push(...buildCourtyardEquipment(context.at({ x: poolX, y: 0.04, z: poolZ }), materials, poolWidth, poolDepth, variant));
  buildSunLounger(context.at({ x: poolX - mirror * (poolWidth / 2 + 0.58), y: 0.04, z: poolZ + poolDepth * 0.16 }));
  if (lotWidth > 18) buildSunLounger(context.at({ x: poolX - mirror * (poolWidth / 2 + 0.58), y: 0.04, z: poolZ - poolDepth * 0.23 }));
  const pergolaWidth = Math.max(2.4, width * 0.5);
  if (detailed) {
    animations.push(buildLouveredPergola(context.at({ x: houseX - mirror * width * 0.12, y: 0.04, z: houseZ + depth / 2 + 2.1 }), pergolaWidth, 2.35, 2.45));
    animations.push(...buildOutdoorKitchen(context.at({ x: houseX - mirror * width * 0.18, y: 0.04, z: houseZ + depth / 2 + 1.3 }), materials, 1.6, variant));
  } else {
    buildTimberPergola(context.at({ x: houseX - mirror * width * 0.12, y: 0.04, z: houseZ + depth / 2 + 2.1 }), pergolaWidth, 2.35, 2.45);
    buildSlattedBench(context.at({ x: houseX - mirror * pergolaWidth * 0.4, y: 0.04, z: houseZ + depth / 2 + 2.1, yaw: mirror * Math.PI / 2 }), Math.min(1.8, pergolaWidth - 0.3));
  }
  buildPottedPlant(context.at({ x: houseX + width * 0.32, y: 0.04, z: houseZ + depth / 2 + 0.7 }), 1.05, 0.35);
  buildPlanterBox(context.at({ x: -mirror * lotWidth * 0.38, y: 0.04, z: lotDepth * 0.3 }), lotWidth * 0.17, 0.7, 0.35);
  for (const side of [-1, 1]) {
    const x = houseX + side * 1.05;
    buildExteriorBollard(context.at({ x, y: 0.04, z: lotDepth / 2 - 0.9 }));
  }
  const gateSide = mirror * lotWidth * 0.32;
  const garageWidth = Math.min(3.1, lotWidth * 0.23);
  const garageDepth = Math.min(5.5, lotDepth * 0.2);
  const garageZ = -lotDepth * 0.32;
  const garage = buildPrivateGarage(context.at({ x: gateSide, y: 0.04, z: garageZ, yaw: Math.PI }), materials, `${id}-garage`, garageWidth, garageDepth, variant * 5, detailed);
  animations.push(...garage.animate);
  sites.push(garage.site);
  if (detailed && lotWidth > 18) {
    animations.push(...buildGardenConservatory(context.at({ x: houseX - mirror * 1.2, y: 0.04, z: -lotDepth / 2 + 2.05, yaw: Math.PI / 2 }), materials, 3.35, 4.6));
  }
  const drivewayLength = Math.max(0.4, lotDepth / 2 + garageZ - garageDepth / 2);
  context.box(materials.boardConcrete, gateSide, 0.025, -lotDepth / 2 + drivewayLength / 2, garageWidth, 0.05, drivewayLength);
  if (lotWidth > 18) animations.push(buildParkingBarrier(context.at({ x: gateSide + garageWidth / 2 + 0.2, y: 0.04, z: -lotDepth / 2 + 0.35, yaw: Math.PI }), garageWidth + 0.1, variant * 6));
  buildBicycleRamp(front.at({ x: width / 2 - 0.6, y: -0.04, z: 0.4 }), 0.07, 0.65);
  buildStoneCladding(house.at({ x: -width / 2 - 0.1, y: 0, z: 0, yaw: -Math.PI / 2 }), depth, 0.4, 0);
  sites.push(siteAt(house, id, width + 0.3, depth + 0.3, groundHeight + upperHeight + (variant % 3 === 2 ? upperWidth * 0.19 : 0.4), 0, "residential"));
  return { sites, animate: animations };
}
