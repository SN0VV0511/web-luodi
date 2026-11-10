import * as THREE from "three";
import type { CivicKit } from "./city-civic";
import { markCitySurface } from "./city-surfaces";
import {
  buildResidentialMaterials,
  type ModernFacadeStyle,
  type RetailBrandId,
} from "./city-residential-textures";

export type ResidentialBlockInput = {
  x: number;
  z: number;
  district: "west" | "east" | "north";
};

export type ResidentialBuildSummary = {
  apartmentCount: number;
  villaCount: number;
  commercialCount: number;
  totalBuildings: number;
  housingMaterials: Set<THREE.Material>;
};

const FACADE_STYLES: readonly ModernFacadeStyle[] = [
  "pearl-condo",
  "graphite-tower",
  "terracotta-modern",
  "coastal-residences",
];

const RETAIL_ORDER: readonly RetailBrandId[] = [
  "coffee",
  "convenience",
  "bakery",
  "pharmacy",
  "tech",
  "bistro",
  "bookstore",
  "florist",
];

/**
 * 构建《城市：天际线》级别的现代住宅与商业街区：
 * 1. 高密度现代商品房住宅小区（悬挑玻璃阳台、外挂空调百叶机位、社区儿童滑梯乐园、智能快递柜、地库坡道、屋顶太阳能热水器）
 * 2. 现代极简奢华泳池别墅区（L型悬挑二层、洞石与雪松木饰面、碧蓝焦散泳池、柚木阳光甲板、躺椅遮阳伞、木格栅廊架、私家车位）
 * 3. 现代街角商业广场与精品底商（发光品牌灯箱、外摆咖啡伞座、冷链送货位、屋顶暖通机组）
 */
export function buildModernResidentialDistrict(
  kit: CivicKit & {
    parkVehicle?: (kind: "sedan" | "suv" | "truck", colorHex: string, x: number, z: number, rotY: number) => void;
  },
  blocks: readonly ResidentialBlockInput[],
): ResidentialBuildSummary {
  const { box, part, beam, tree, solid, geometries, nightMaterials } = kit;
  const palette = buildResidentialMaterials(kit);

  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  const cone = new THREE.ConeGeometry(1, 1, 12);
  const torus = new THREE.TorusGeometry(0.65, 0.14, 8, 18, Math.PI);
  [cylinder, cone, torus].forEach((g) => geometries.add(g));

  const whiteStucco = solid("#d3cdc1", 0.7, 0.04);
  const warmConcrete = solid("#d7d2c7", 0.76, 0.04);
  const darkSlate = solid("#2e373d", 0.54, 0.24);
  const aluminum = solid("#b7c1c6", 0.28, 0.66);
  const charcoalMetal = solid("#384248", 0.36, 0.58);
  const turfLush = solid("#6ea15e", 0.86, 0.02);
  const hedgeGreen = solid("#3b6b43", 0.88, 0.02);
  const stonePaver = solid("#c6c1b5", 0.78, 0.03);
  const asphaltRamp = solid("#474d51", 0.88, 0.02);
  const teakDeck = solid("#9e6f47", 0.68, 0.04);
  const safetyYellow = solid("#ebb438", 0.52, 0.08);
  const coralFabric = solid("#d96b52", 0.65, 0.04);
  const navyFabric = solid("#2e5878", 0.65, 0.04);
  const playBlue = solid("#3888c4", 0.44, 0.12);
  const playOrange = solid("#e67c3c", 0.44, 0.12);
  const stainless = solid("#dce3e7", 0.22, 0.78);

  const warmLamp = solid("#fff1cf", 0.28, 0.06);
  warmLamp.emissive.set("#ffcf7c");
  nightMaterials.push({ material: warmLamp, day: 0.18, night: 3.4 });

  markCitySurface(whiteStucco, "stucco");
  const sandstoneTrim = solid("#c8b79a", 0.78, 0.03);
  const greyConcreteTrim = solid("#a9a79f", 0.82, 0.03);
  const brickTrim = solid("#8e5340", 0.84, 0.02);
  markCitySurface(sandstoneTrim, "stucco");
  markCitySurface(greyConcreteTrim, "concrete");
  markCitySurface(brickTrim, "brick");
  const apartmentTrims = [whiteStucco, sandstoneTrim, greyConcreteTrim, brickTrim, sandstoneTrim];
  markCitySurface(warmConcrete, "concrete");
  markCitySurface(darkSlate, "roof");
  markCitySurface(turfLush, "grass");
  markCitySurface(hedgeGreen, "foliage");
  markCitySurface(stonePaver, "path");
  markCitySurface(asphaltRamp, "asphalt");

  const housingMaterials = new Set<THREE.Material>([
    ...Object.values(palette.apartmentFacades),
    ...Object.values(palette.retailSigns),
    whiteStucco,
    sandstoneTrim,
    greyConcreteTrim,
    brickTrim,
    warmConcrete,
    darkSlate,
    palette.villaTravertine,
    palette.villaCedar,
    palette.villaBoardConcrete,
  ]);

  let apartmentCount = 0;
  let villaCount = 0;
  let commercialCount = 0;

  const parkCar = (kind: "sedan" | "suv" | "truck", hex: string, px: number, pz: number, rotY: number) => {
    if (kit.parkVehicle) {
      kit.parkVehicle(kind, hex, px, pz, rotY);
    } else {
      kit.vehicle(kind, solid(hex, 0.28, 0.35), px, pz);
    }
  };

  /**
   * 现代高层/小高层精品公寓组团（带悬挑玻璃阳台、外机百叶、儿童游乐场、智能快递柜与地库坡道）
   */
  const buildModernApartmentComplex = (bx: number, bz: number, stories: number, variant: number) => {
    apartmentCount += 2;
    const styleKey = FACADE_STYLES[variant % FACADE_STYLES.length];
    const facadeMat = palette.apartmentFacades[styleKey];
    const secondaryStyle = FACADE_STYLES[(variant + 1) % FACADE_STYLES.length];
    const secondaryFacade = palette.apartmentFacades[secondaryStyle];
    // 每个组团使用不同的线脚/阳台板材质，避免整片城区都是同一种白色体块。
    const trimStucco = apartmentTrims[variant % apartmentTrims.length];

    // 社区绿地底座、石材步道与围合矮绿篱
    box(turfLush, bx, 0.28, bz, 29.2, 0.16, 29.2);
    box(stonePaver, bx, 0.37, bz + 9.6, 24.5, 0.08, 6.2);
    box(stonePaver, bx + 1.2, 0.37, bz + 1.5, 5.2, 0.08, 16.0);

    // 社区四周景观绿篱（预留南侧人车出入口）
    box(hedgeGreen, bx - 10.2, 0.72, bz + 13.8, 7.6, 0.75, 0.65);
    box(hedgeGreen, bx + 10.2, 0.72, bz + 13.8, 7.6, 0.75, 0.65);
    box(hedgeGreen, bx - 14.1, 0.72, bz, 0.65, 0.75, 27.4);
    box(hedgeGreen, bx + 14.1, 0.72, bz, 0.65, 0.75, 27.4);

    // 主楼（北西侧高层住宅塔楼）
    const mainFloors = stories;
    const floorH = 3.1;
    const mainH = mainFloors * floorH;
    const mainX = bx - 6.4;
    const mainZ = bz - 5.2;
    const mainW = 12.6;
    const mainD = 10.8;

    // 首层架空精装入户大堂基座
    box(palette.villaTravertine, mainX, 2.15, mainZ, mainW + 0.5, 3.4, mainD + 0.5);
    box(palette.warmInteriorGlow, mainX, 2.05, mainZ + mainD / 2 + 0.28, 5.6, 2.8, 0.16);
    box(darkSlate, mainX, 3.68, mainZ + mainD / 2 + 1.05, 6.8, 0.24, 1.85);
    box(warmLamp, mainX, 3.52, mainZ + mainD / 2 + 0.85, 5.2, 0.08, 0.22);

    // 塔楼标准层主体与现代竖向铝板装饰翼墙
    box(facadeMat, mainX, 3.85 + mainH / 2, mainZ, mainW, mainH, mainD);
    for (const finX of [-mainW * 0.48, 0, mainW * 0.48]) {
      box(trimStucco, mainX + finX, 3.85 + mainH / 2, mainZ + mainD / 2 + 0.16, 0.34, mainH + 0.4, 0.38);
      box(trimStucco, mainX + finX, 3.85 + mainH / 2, mainZ - mainD / 2 - 0.16, 0.34, mainH + 0.4, 0.38);
    }

    // 逐层精细外挑玻璃观景阳台、空调外机与绿植花箱
    for (let f = 1; f < mainFloors; f++) {
      const fy = 3.85 + f * floorH;
      for (const balCol of [-3.1, 3.1]) {
        const balX = mainX + balCol;
        const balZ = mainZ + mainD / 2 + 0.72;
        // 阳台混凝土底板与铝合金包边
        box(trimStucco, balX, fy, balZ, 4.4, 0.18, 1.35);
        // 夹胶玻璃阳台护栏与不锈钢扶手
        box(palette.balconyGlass, balX, fy + 0.56, balZ + 0.62, 4.3, 0.92, 0.06);
        box(aluminum, balX, fy + 1.05, balZ + 0.62, 4.36, 0.06, 0.08);
        // 侧向空调机位格栅百叶与白色外机
        const acSide = balCol < 0 ? -2.55 : 2.55;
        box(charcoalMetal, balX + acSide, fy + 0.55, mainZ + mainD / 2 + 0.32, 0.82, 0.62, 0.44);
        part(darkSlate, cylinder, balX + acSide, fy + 0.55, mainZ + mainD / 2 + 0.55, 0.22, 0.04, 0.22, undefined, 0, Math.PI / 2);
        // 隔层点缀阳台花池与休闲晾晒架
        if ((f + variant) % 2 === 0) {
          box(hedgeGreen, balX - 1.1, fy + 0.32, balZ + 0.42, 1.35, 0.34, 0.32);
        }
      }
      // 北立面生活阳台与设备连廊
      box(warmConcrete, mainX, fy, mainZ - mainD / 2 - 0.45, 6.2, 0.16, 0.85);
      box(aluminum, mainX, fy + 0.55, mainZ - mainD / 2 - 0.84, 6.2, 0.88, 0.05);
    }

    // 现代平屋顶女儿墙、电梯机房、不锈钢水箱与真空管太阳能热水器阵列
    const topY = 3.85 + mainH;
    box(trimStucco, mainX, topY + 0.45, mainZ, mainW + 0.6, 0.9, mainD + 0.6);
    box(darkSlate, mainX, topY + 0.94, mainZ, mainW + 0.15, 0.14, mainD + 0.15);
    box(warmConcrete, mainX - 2.4, topY + 1.9, mainZ - 1.4, 4.2, 2.2, 3.8);
    box(darkSlate, mainX - 2.4, topY + 3.08, mainZ - 1.4, 4.5, 0.18, 4.1);
    part(stainless, cylinder, mainX + 3.2, topY + 1.85, mainZ - 2.2, 1.15, 1.8, 1.15);
    for (const sz of [1.2, 3.2]) {
      part(palette.solarPanel, cylinder, mainX + 2.4, topY + 1.42, mainZ + sz, 2.2, 0.08, 1.15, undefined, 0, 0.38);
      box(aluminum, mainX + 2.4, topY + 1.12, mainZ + sz, 3.6, 0.35, 0.14);
    }

    // 副楼（东侧错层洋房单元，营造丰富天际线高低落差）
    const subFloors = Math.max(4, stories - 3);
    const subH = subFloors * floorH;
    const subX = bx + 7.4;
    const subZ = bz - 4.2;
    const subW = 9.8;
    const subD = 10.2;
    box(palette.villaTravertine, subX, 1.95, subZ, subW + 0.4, 3.0, subD + 0.4);
    box(secondaryFacade, subX, 3.45 + subH / 2, subZ, subW, subH, subD);
    for (let sf = 1; sf < subFloors; sf++) {
      const sfy = 3.45 + sf * floorH;
      box(trimStucco, subX, sfy, subZ + subD / 2 + 0.62, 6.6, 0.16, 1.15);
      box(palette.balconyGlass, subX, sfy + 0.52, subZ + subD / 2 + 1.15, 6.5, 0.85, 0.06);
    }
    const subTopY = 3.45 + subH;
    box(trimStucco, subX, subTopY + 0.42, subZ, subW + 0.45, 0.84, subD + 0.45);
    // 副楼屋顶空中花园露台
    box(turfLush, subX, subTopY + 0.88, subZ, subW - 1.2, 0.12, subD - 1.2);

    // 社区门岗、人行门禁亭与丰巢式智能快递柜
    box(darkSlate, bx - 0.4, 1.65, bz + 12.8, 3.4, 2.5, 1.8);
    box(palette.warmInteriorGlow, bx - 0.4, 1.65, bz + 13.72, 2.6, 1.6, 0.08);
    box(playOrange, bx - 4.8, 1.38, bz + 11.8, 2.8, 1.95, 0.65);
    box(warmLamp, bx - 4.8, 1.55, bz + 12.15, 0.65, 0.45, 0.06);

    // 地下车库出入口坡道（带防滑沥青、安全黄黑警示墩与自动道闸杆）
    const rampX = bx + 8.6;
    const rampZ = bz + 9.2;
    box(asphaltRamp, rampX, 0.34, rampZ, 4.4, 0.1, 7.6);
    for (const side of [-2.3, 2.3]) {
      box(trimStucco, rampX + side, 0.95, rampZ - 1.2, 0.28, 1.25, 5.4);
      box(safetyYellow, rampX + side, 0.68, rampZ + 2.4, 0.32, 0.65, 0.42);
    }
    box(palette.balconyGlass, rampX, 2.15, rampZ - 1.6, 4.8, 0.14, 4.6);
    // 自动抬杆道闸
    box(playOrange, rampX - 2.1, 0.92, rampZ + 2.8, 0.32, 1.05, 0.32);
    beam(
      new THREE.Vector3(rampX - 1.95, 1.28, rampZ + 2.8),
      new THREE.Vector3(rampX + 1.65, 1.95, rampZ + 2.8),
      0.045,
      safetyYellow,
    );

    // 社区中心儿童游乐塑胶场地（彩色滑梯、攀爬拱架与家长休息椅）
    const playX = bx - 7.8;
    const playZ = bz + 8.2;
    part(playBlue, cylinder, playX, 0.38, playZ, 3.6, 0.08, 3.6);
    box(teakDeck, playX - 1.1, 1.25, playZ, 1.3, 1.6, 1.3);
    part(coralFabric, cone, playX - 1.1, 2.45, playZ, 1.1, 0.9, 1.1);
    beam(
      new THREE.Vector3(playX - 0.45, 1.45, playZ),
      new THREE.Vector3(playX + 1.65, 0.44, playZ),
      0.24,
      playOrange,
    );
    part(safetyYellow, torus, playX + 0.4, 0.42, playZ + 1.6, 1.0, 1.0, 1.0);
    box(teakDeck, playX - 2.8, 0.68, playZ + 2.4, 2.2, 0.18, 0.52);

    // 庭院景观乔木与草坪矮灯
    tree(bx + 1.8, bz + 4.8, 0.82, variant);
    tree(bx - 12.2, bz + 3.2, 0.75, variant + 2);
    for (const lx of [-3.4, 3.8]) {
      box(charcoalMetal, bx + lx, 0.68, bz + 7.2, 0.14, 0.62, 0.14);
      box(warmLamp, bx + lx, 1.05, bz + 7.2, 0.22, 0.18, 0.22);
    }
  };

  /**
   * 现代极简泳池独栋别墅庄园（L型悬挑体块、碧蓝泳池、柚木甲板、遮阳伞躺椅、木廊架与私家豪车）
   */
  const buildLuxuryVillaEstate = (
    vx: number,
    vz: number,
    lotW: number,
    lotD: number,
    variant: number,
  ) => {
    villaCount++;
    const mirror = variant % 2 === 0 ? 1 : -1;

    // 别墅私家草坪、修剪整齐的冬青围篱与石材门柱
    box(turfLush, vx, 0.28, vz, lotW, 0.16, lotD);
    const hw = lotW / 2 - 0.35;
    const hd = lotD / 2 - 0.35;
    box(hedgeGreen, vx - hw, 0.85, vz, 0.55, 1.05, lotD - 0.6);
    box(hedgeGreen, vx + hw, 0.85, vz, 0.55, 1.05, lotD - 0.6);
    box(hedgeGreen, vx, 0.85, vz - hd, lotW - 0.6, 1.05, 0.55);
    // 前院留出私家车道开口
    const gateSide = mirror * (lotW * 0.24);
    box(hedgeGreen, vx - mirror * (lotW * 0.22), 0.85, vz + hd, lotW * 0.48, 1.05, 0.55);
    for (const pillarDx of [-2.4, 2.4]) {
      box(palette.villaTravertine, vx + gateSide + pillarDx, 1.05, vz + hd, 0.52, 1.45, 0.52);
      box(warmLamp, vx + gateSide + pillarDx, 1.84, vz + hd, 0.28, 0.18, 0.28);
    }

    // 私家石材车道与嵌入式车库
    const driveX = vx + gateSide;
    box(stonePaver, driveX, 0.37, vz + lotD * 0.24, 4.4, 0.08, lotD * 0.46);
    const houseX = vx - mirror * (lotW * 0.14);
    const houseZ = vz - lotD * 0.15;

    // 一层洞石/清水混凝土主厅 + 车库翼楼
    box(palette.villaTravertine, houseX, 2.05, houseZ, lotW * 0.52, 3.3, 9.2);
    box(palette.villaBoardConcrete, driveX, 1.9, vz - 1.2, 5.2, 3.0, 6.8);
    // 车库深色横向分节卷帘门
    box(darkSlate, driveX, 1.65, vz + 2.24, 4.1, 2.35, 0.12);
    for (let slat = 0; slat < 4; slat++) {
      box(aluminum, driveX, 0.85 + slat * 0.52, vz + 2.31, 3.95, 0.04, 0.04);
    }

    // 一层转角全景落地玻璃客厅（夜晚透出温暖居家灯光）
    box(palette.warmInteriorGlow, houseX, 1.95, houseZ + 4.65, lotW * 0.42, 2.75, 0.16);
    box(charcoalMetal, houseX, 1.95, houseZ + 4.72, 0.12, 2.75, 0.12);

    // 二层现代极简悬挑主卧体块（带雪松木底板饰面与隐形灯带）
    const upperX = houseX + mirror * 1.35;
    const upperZ = houseZ + 0.65;
    const upperW = lotW * 0.54;
    const upperD = 8.4;
    box(palette.villaCedar, upperX, 3.78, upperZ, upperW + 0.4, 0.22, upperD + 0.4);
    box(whiteStucco, upperX, 5.35, upperZ, upperW, 2.95, upperD);
    box(darkSlate, upperX, 6.92, upperZ, upperW + 0.9, 0.24, upperD + 0.9);
    box(warmLamp, upperX, 6.76, upperZ + upperD / 2 + 0.35, upperW * 0.72, 0.06, 0.16);

    // 二层全景玻璃窗与观海露台玻璃护栏
    box(palette.warmInteriorGlow, upperX, 5.25, upperZ + upperD / 2 + 0.08, upperW * 0.76, 2.25, 0.14);
    box(whiteStucco, upperX, 3.88, upperZ + upperD / 2 + 1.15, upperW * 0.82, 0.18, 1.85);
    box(palette.balconyGlass, upperX, 4.42, upperZ + upperD / 2 + 2.02, upperW * 0.8, 0.92, 0.06);
    box(aluminum, upperX, 4.9, upperZ + upperD / 2 + 2.02, upperW * 0.82, 0.05, 0.08);

    // 二层屋顶光伏板
    box(palette.solarPanel, upperX - mirror * 1.1, 7.08, upperZ - 0.6, upperW * 0.52, 0.08, 3.6);

    // 庭院柚木阳光甲板与无边际碧水游泳池
    const poolX = vx - mirror * (lotW * 0.16);
    const poolZ = vz + lotD * 0.21;
    const poolW = Math.min(7.4, lotW * 0.48);
    const poolD = 4.6;
    box(teakDeck, poolX, 0.39, poolZ - 2.6, poolW + 2.6, 0.12, 3.4);
    box(palette.villaTravertine, poolX, 0.44, poolZ + 0.8, poolW + 0.75, 0.22, poolD + 0.75);
    box(palette.poolWater, poolX, 0.51, poolZ + 0.8, poolW, 0.12, poolD);

    // 泳池畔白色度假躺椅与遮阳伞
    for (const chairDx of [-1.45, 1.45]) {
      box(whiteStucco, poolX + chairDx, 0.58, poolZ - 2.4, 0.78, 0.14, 1.85);
      part(
        variant % 2 === 0 ? coralFabric : navyFabric,
        cylinder,
        poolX + chairDx,
        0.82,
        poolZ - 3.05,
        0.38,
        0.12,
        0.65,
        undefined,
        0,
        0.35,
      );
    }
    part(aluminum, cylinder, poolX, 1.65, poolZ - 2.5, 0.06, 2.35, 0.06);
    part(variant % 2 === 0 ? coralFabric : navyFabric, cone, poolX, 2.82, poolZ - 2.5, 1.65, 0.68, 1.65);

    // 现代木格栅户外休闲廊架 (Pergola)
    const pergX = houseX - mirror * (lotW * 0.19);
    const pergZ = vz + 0.8;
    for (const px of [-1.4, 1.4]) {
      for (const pz of [-1.4, 1.4]) {
        box(charcoalMetal, pergX + px, 1.62, pergZ + pz, 0.12, 2.45, 0.12);
      }
    }
    for (let l = -1.3; l <= 1.3; l += 0.52) {
      box(palette.villaCedar, pergX, 2.88, pergZ + l, 3.1, 0.12, 0.14);
    }

    // 私家车道停放豪华 SUV 或轿跑
    const carColors = ["#f4f1ea", "#243b4f", "#3d464d", "#9e3b33", "#2b5e55"];
    parkCar(
      variant % 2 === 0 ? "suv" : "sedan",
      carColors[variant % carColors.length],
      driveX,
      vz + lotD * 0.24,
      0,
    );

    // 别墅庭院景观树
    tree(vx - mirror * (lotW * 0.36), vz + lotD * 0.34, 0.76, variant + 1);
  };

  /**
   * 现代街区商业广场与底商街铺（咖啡烘焙坊、24H便利店、法式烘焙、药房、科技体验店）
   */
  const buildModernCommercialPlaza = (bx: number, bz: number, variant: number) => {
    commercialCount += 3;

    // 全铺装现代商业前广场与景观花池
    box(stonePaver, bx, 0.34, bz, 29.2, 0.18, 29.2);

    // 北侧双层L型现代商业街MALL主体
    const brandA = RETAIL_ORDER[(variant * 3) % RETAIL_ORDER.length];
    const brandB = RETAIL_ORDER[(variant * 3 + 1) % RETAIL_ORDER.length];
    const brandC = RETAIL_ORDER[(variant * 3 + 2) % RETAIL_ORDER.length];

    // 旗舰店 A（左侧双层现代商业体）
    const shopAX = bx - 6.8;
    const shopAZ = bz - 4.8;
    box(whiteStucco, shopAX, 4.15, shopAZ, 13.4, 7.6, 12.2);
    box(darkSlate, shopAX, 8.12, shopAZ, 14.0, 0.36, 12.8);
    // 首层挑高通透橱窗与品牌发光门头
    box(palette.warmInteriorGlow, shopAX, 2.25, shopAZ + 6.15, 11.4, 3.5, 0.16);
    box(palette.retailSigns[brandA], shopAX, 4.72, shopAZ + 6.26, 11.8, 1.55, 0.22);
    // 二层现代玻璃幕墙餐饮露台
    box(palette.balconyGlass, shopAX, 6.25, shopAZ + 6.15, 11.4, 2.2, 0.14);
    box(coralFabric, shopAX, 3.72, shopAZ + 6.95, 11.6, 0.22, 1.45);

    // 精品店 B（右侧现代木石混搭商业体）
    const shopBX = bx + 7.2;
    const shopBZ = bz - 5.2;
    box(palette.villaTravertine, shopBX, 3.55, shopBZ, 11.8, 6.4, 11.4);
    box(palette.villaCedar, shopBX, 6.92, shopBZ, 12.4, 0.38, 12.0);
    box(palette.warmInteriorGlow, shopBX, 2.15, shopBZ + 5.75, 9.8, 3.3, 0.16);
    box(palette.retailSigns[brandB], shopBX, 4.48, shopBZ + 5.86, 10.2, 1.45, 0.22);
    box(navyFabric, shopBX, 3.55, shopBZ + 6.52, 10.2, 0.2, 1.35);

    // 街角独立玻璃盒子咖啡馆 C（南侧街角网红打卡亭）
    const kioskX = bx + 7.6;
    const kioskZ = bz + 7.4;
    box(darkSlate, kioskX, 2.45, kioskZ, 8.6, 4.2, 6.8);
    box(palette.warmInteriorGlow, kioskX, 2.1, kioskZ + 3.44, 7.2, 3.1, 0.14);
    box(palette.warmInteriorGlow, kioskX - 4.34, 2.1, kioskZ, 0.14, 3.1, 5.4);
    box(palette.retailSigns[brandC], kioskX, 4.05, kioskZ + 3.55, 7.6, 1.2, 0.2);
    box(palette.villaCedar, kioskX, 4.68, kioskZ, 9.4, 0.26, 7.6);

    // 商业外摆露天咖啡伞座与花箱隔断
    for (const [ux, uz] of [
      [bx - 9.2, bz + 5.6],
      [bx - 4.2, bz + 5.6],
      [bx - 6.7, bz + 9.8],
      [bx + 0.2, bz + 8.4],
    ] as const) {
      part(teakDeck, cylinder, ux, 0.82, uz, 0.82, 0.1, 0.82);
      part(aluminum, cylinder, ux, 1.55, uz, 0.06, 2.1, 0.06);
      part(ux < bx - 5 ? coralFabric : navyFabric, cone, ux, 2.68, uz, 1.48, 0.62, 1.48);
      for (const chairAngle of [0, Math.PI * 0.66, Math.PI * 1.33]) {
        box(
          charcoalMetal,
          ux + Math.cos(chairAngle) * 1.05,
          0.62,
          uz + Math.sin(chairAngle) * 1.05,
          0.42,
          0.46,
          0.42,
        );
      }
    }

    // 屋顶暖通冷却机组与太阳能板
    box(aluminum, shopAX - 3.2, 8.75, shopAZ - 2.2, 2.8, 1.05, 1.9);
    box(aluminum, shopBX + 2.4, 7.55, shopBZ - 2.0, 2.4, 0.95, 1.6);
    box(palette.solarPanel, shopAX + 2.6, 8.36, shopAZ + 1.2, 4.8, 0.1, 3.4);

    // 广场庭院树与路侧临时停靠车辆
    tree(bx - 12.2, bz + 10.6, 0.84, variant);
    tree(bx + 1.2, bz + 3.8, 0.78, variant + 3);
    parkCar("sedan", "#d9dfe4", bx - 1.8, bz + 12.4, Math.PI / 2);
  };

  // ==================== 1. 分配城内 21 个住宅/商业街区（高密度现代公寓 + 现代商业广场 + 独栋泳池别墅） ====================
  blocks.forEach((block, idx) => {
    const nearParkOrBay = Math.abs(block.x) < 115 || (block.district === "east" && block.z > -60);
    if (idx % 5 === 1) {
      // 现代街区商业中心（咖啡烘焙、24h便利店、法式烘焙、药房、科技店）
      buildModernCommercialPlaza(block.x, block.z, idx);
    } else if (nearParkOrBay || idx % 3 === 0) {
      // 现代中高层商品房小区（7~12层，错落塑造《城市：天际线》现代都市住宅天际线）
      const stories = nearParkOrBay ? 9 + (idx % 4) : 7 + (idx % 3);
      buildModernApartmentComplex(block.x, block.z, stories, idx);
    } else {
      // 城内低密度双拼奢华泳池别墅区（每个 29m×29m 街区容纳东西两座独立泳池别墅庄园）
      buildLuxuryVillaEstate(block.x - 7.3, block.z, 14.0, 28.4, idx * 2);
      buildLuxuryVillaEstate(block.x + 7.3, block.z, 14.0, 28.4, idx * 2 + 1);
    }
  });

  // ==================== 2. 西海岸观海半山奢华别墅特区 (West Coastal Luxury Villa Enclave: x = -237, z = -126..50) ====================
  // 紧邻西环大道 (x = -210) 外侧铺设景观私家林荫道与 5 座超大尺度海景泳池独栋庄园
  box(asphaltRamp, -222.5, 0.36, -38, 5.6, 0.08, 198);
  box(stonePaver, -226.2, 0.4, -38, 1.8, 0.12, 198);
  for (const accessZ of [-115, -25, 65]) {
    box(asphaltRamp, -216.2, 0.37, accessZ, 12.4, 0.08, 7.2);
  }
  const coastalVillaZs = [-126, -82, -38, 6, 50];
  coastalVillaZs.forEach((vz, vIdx) => {
    buildLuxuryVillaEstate(-241.5, vz, 25.0, 36.0, 40 + vIdx);
    // 林荫道庭院路灯
    box(charcoalMetal, -226.2, 2.2, vz + 15, 0.14, 3.6, 0.14);
    box(warmLamp, -225.8, 3.95, vz + 15, 0.65, 0.12, 0.26);
  });

  return {
    apartmentCount,
    villaCount,
    commercialCount,
    totalBuildings: apartmentCount + villaCount + commercialCount,
    housingMaterials,
  };
}
