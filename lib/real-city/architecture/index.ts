import * as THREE from "three";
import type { CivicKit } from "../../city-civic";
import { cityBlocks, cityLots, civicLots } from "../../city-map";
import type { SeasonId } from "../../city-physics";
import { cityDetailBudget, type CityBuiltSite, type CityDetailBudget } from "../contracts";
import { ArchitectureContext, type Animation, type DoorOccupant } from "./context";
import { createArchitecturalMaterials } from "./materials";
import { buildCourtyardVilla } from "./villas";
import { buildV3District } from "../v3/buildings/district";

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
  // v3：空余街区改由程序化多原型街区生成器建造（独栋 / 联排 / 多层 / 中高层 / 底商 / 写字楼 / 塔楼 /
  // 仓库 / 教堂 / 加油站 / 咖啡馆），每栋参数独立，整片街区合并为少量绘制调用。
  const district = buildV3District({
    blocks,
    tree: (x, z, size, shade) => kit.tree(x, z, size, shade, 0.45),
    canvasTexture: kit.canvasTexture,
  });
  kit.group.add(district.group);
  sites.push(...district.sites);
  for (const [type, count] of Object.entries(district.archetypeCounts)) {
    if (type === "mixed" || type === "cafe" || type === "gas") commercialCount += count ?? 0;
    else if (type === "detached" || type === "townhouses") villaCount += count ?? 0;
    else apartmentCount += count ?? 0;
  }
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
    district.animate(seconds, night);
    context.updateMovingDetails();
  };
  animate(0, false);
  kit.group.userData.architectureSiteCount = sites.length;
  kit.group.userData.architectureAnimationCount = animations.length;
  return { sites, summary: { housingMaterials, apartmentCount, villaCount, commercialCount, totalBuildings: apartmentCount + villaCount + commercialCount + district.buildingCount }, animate, setDoorOccupants: points => context.setDoorOccupants(points) };
}
