import * as THREE from "three";
import type { CivicKit } from "../../city-civic";
import { cityBlocks, cityLots, civicLots } from "../../city-map";
import type { SeasonId } from "../../city-physics";
import { cityDetailBudget, type CityBuiltSite, type CityDetailBudget } from "../contracts";
import { ArchitectureContext, type Animation, type DoorOccupant } from "./context";
import { createArchitecturalMaterials } from "./materials";
import { buildApartmentCourt } from "./apartments";
import { buildCourtyardVilla } from "./villas";
import { buildCommercialCourt } from "./shops";

export type ArchitectureKit = CivicKit & {
  parkVehicle?: (kind: "sedan" | "suv" | "truck", color: string, x: number, z: number, rotationY: number) => void;
};

export type DetailedArchitecture = {
  sites: CityBuiltSite[];
  summary: {
    housingMaterials: Set<THREE.Material>;
    apartmentCount: number;
    villaCount: number;
    commercialCount: number;
    totalBuildings: number;
  };
  animate: (seconds: number, night: boolean, season?: SeasonId) => void;
  setDoorOccupants: (points: readonly DoorOccupant[]) => void;
};

export function buildDetailedArchitecture(kit: ArchitectureKit, budget: CityDetailBudget = cityDetailBudget()): DetailedArchitecture {
  const previousMaterials = new Set(kit.materials);
  const context = new ArchitectureContext(kit);
  const materials = createArchitecturalMaterials(context);
  const sites: CityBuiltSite[] = [];
  const animations: Animation[] = [];
  let apartmentCount = 0;
  let villaCount = 0;
  let commercialCount = 0;
  const blocks = cityBlocks.filter((block) => ![...cityLots, ...civicLots].some((reserved) => reserved.x === block.x && reserved.z === block.z));
  blocks.forEach((block, index) => {
    const nearParkOrBay = Math.abs(block.x) < 115 || block.district === "east" && block.z > -60;
    const section = context.at({ x: block.x, y: 0.43, z: block.z });
    const id = `neighborhood-${block.district}-${index}`;
    const detailed = budget.simulatedHz >= 60 && index % 3 === 0;
    if (index % 5 === 1) {
      const result = buildCommercialCourt(section, materials, id, index);
      sites.push(...result.sites);
      animations.push(...result.animate);
      commercialCount += 3;
    } else if (nearParkOrBay || index % 3 === 0) {
      const stories = nearParkOrBay ? 9 + index % 4 : 7 + index % 3;
      const result = buildApartmentCourt(section, materials, id, stories, index, detailed);
      sites.push(...result.sites);
      animations.push(...result.animate);
      apartmentCount += 2;
    } else {
      for (const side of [-1, 1]) {
        const variant = index * 2 + (side > 0 ? 1 : 0);
        const result = buildCourtyardVilla(section.at({ x: side * 7.3, y: 0, z: 0 }), materials, `${id}-${side < 0 ? "west" : "east"}`, 14, 28.4, variant, detailed);
        sites.push(...result.sites);
        animations.push(...result.animate);
        villaCount++;
      }
    }
  });
  context.box(materials.boardConcrete, -222.5, 0.38, -38, 5.6, 0.06, 198);
  context.box(materials.terrazzo, -226.2, 0.41, -38, 1.8, 0.06, 198);
  for (const accessZ of [-115, -25, 65]) context.box(materials.boardConcrete, -216.2, 0.38, accessZ, 12.4, 0.06, 7.2);
  const coastalZs = [-126, -82, -38, 6, 50];
  coastalZs.forEach((z, index) => {
    const result = buildCourtyardVilla(context.at({ x: -241.5, y: 0.43, z }), materials, `coastal-villa-${index}`, 25, 36, 40 + index, budget.simulatedHz >= 60 && index < 2);
    sites.push(...result.sites);
    animations.push(...result.animate);
    villaCount++;
  });
  context.finishStaticDetails();
  context.finishMovingDetails();
  const housingMaterials = new Set([...kit.materials].filter((material) => !previousMaterials.has(material)));
  const animate = (seconds: number, night: boolean, season: SeasonId = "spring") => {
    for (const animation of animations) animation(seconds, night, season);
    context.updateMovingDetails();
  };
  animate(0, false);
  kit.group.userData.architectureSiteCount = sites.length;
  kit.group.userData.architectureAnimationCount = animations.length;
  return { sites, summary: { housingMaterials, apartmentCount, villaCount, commercialCount, totalBuildings: apartmentCount + villaCount + commercialCount }, animate, setDoorOccupants: points => context.setDoorOccupants(points) };
}
