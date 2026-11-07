import * as THREE from "three";
import type { CivicKit } from "./city-civic";
import { createGlassCurtainWallPbr, bindWorldScalePbr, createAshlarStonePbr } from "./city-pbr";
import { samplePendulumSwing } from "./city-physics";
import { EntrancePresence, RevolvingEntranceMotion, type EntranceOccupant } from "./real-city/traffic/entrance";
import { DriveThroughTraffic } from "./real-city/traffic/drive-through";
import { createCap, createHead, createTorso, createThigh, createCalf, createUpperArm, createForearm, createShoe } from "./city-figure";
import { createVehicleShell, createVehicleWheel } from "./city-vehicles";

/**
 * 使用三次贝塞尔曲线挤压生成真实抛物线立体麦当劳金拱门 (Golden Arches)，带圆润金属倒角。
 */
export function createGoldenArchesGeometry(scale = 1): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  // 左外腿 -> 左拱顶 -> 中谷 -> 右拱顶 -> 右外腿 -> 右内拱 -> 中尖 -> 左内拱
  shape.moveTo(-1.18 * scale, -0.85 * scale);
  shape.bezierCurveTo(-1.14 * scale, 0.35 * scale, -0.92 * scale, 0.98 * scale, -0.56 * scale, 0.98 * scale);
  shape.bezierCurveTo(-0.26 * scale, 0.98 * scale, -0.11 * scale, 0.42 * scale, 0, -0.18 * scale);
  shape.bezierCurveTo(0.11 * scale, 0.42 * scale, 0.26 * scale, 0.98 * scale, 0.56 * scale, 0.98 * scale);
  shape.bezierCurveTo(0.92 * scale, 0.98 * scale, 1.14 * scale, 0.35 * scale, 1.18 * scale, -0.85 * scale);
  shape.lineTo(0.93 * scale, -0.85 * scale);
  shape.bezierCurveTo(0.89 * scale, 0.16 * scale, 0.76 * scale, 0.72 * scale, 0.55 * scale, 0.72 * scale);
  shape.bezierCurveTo(0.36 * scale, 0.72 * scale, 0.21 * scale, 0.12 * scale, 0.11 * scale, -0.66 * scale);
  shape.lineTo(-0.11 * scale, -0.66 * scale);
  shape.bezierCurveTo(-0.21 * scale, 0.12 * scale, -0.36 * scale, 0.72 * scale, -0.55 * scale, 0.72 * scale);
  shape.bezierCurveTo(-0.76 * scale, 0.72 * scale, -0.89 * scale, 0.16 * scale, -0.93 * scale, -0.85 * scale);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.22 * scale,
    bevelEnabled: true,
    bevelThickness: 0.035 * scale,
    bevelSize: 0.028 * scale,
    bevelSegments: 3,
    curveSegments: 20,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

export const MCDONALDS_SITE = {
  x: 168,
  z: 80.5,
  doorX: 168,
  doorZ: 85.12,
} as const;

export const OFFICE_LOBBY_DOORS = [
  { id: "quant-lobby", x: 142.5, z: 55.6, width: 3.2, height: 3.4, towerHeight: 60, towerW: 27, towerD: 25, towerZ: 42.5 },
  { id: "affine-lobby", x: 97.5, z: -33.9, width: 3.2, height: 3.4, towerHeight: 68, towerW: 26, towerD: 26, towerZ: -47.5 },
  { id: "slot8-east-lobby", x: 187.5, z: -36.8, width: 2.8, height: 3.2, towerHeight: 32, towerW: 22, towerD: 20, towerZ: -47.5 },
  { id: "north-glass-lobby", x: 82.5, z: -174.8, width: 2.6, height: 3.1, towerHeight: 34, towerW: 14, towerD: 14, towerZ: -182.5 },
  { id: "west-glass-lobby", x: -97.5, z: -129.8, width: 2.6, height: 3.1, towerHeight: 22, towerW: 14, towerD: 14, towerZ: -137.5 },
] as const;

/**
 * 构建写实商业与摩天楼立面细节：
 * 1. 麦当劳全球旗舰店 (McDonald's Flagship)：双曲抛物线金拱门、木格栅挑檐、弹簧液压闭门器双扇玻璃门、室内自助点餐机与餐台、24H 得来速取餐车道
 * 2. 西城地铁玻璃出入口雨棚 (Metro Station Entrance) 供上下班潮汐通勤进出
 * 3. 摩天写字楼物理光学单元式玻璃幕墙外挂构件、高空擦窗机吊篮 (BMU) 与四翼水晶旋转门
 */
export function buildCommercialAndCurtainWalls(kit: CivicKit): {
  animate: (seconds: number, night: boolean, occupants?: readonly EntranceOccupant[]) => void;
} {
  const { group, geometries, materials, nightMaterials, box, part, solid, canvasTexture } = kit;

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 20);
  const umbrellaCone = new THREE.ConeGeometry(1.65, 0.52, 8, 1, true);
  const archFacadeGeo = createGoldenArchesGeometry(1.15);
  const archPylonGeo = createGoldenArchesGeometry(1.42);
  [cube, cylinder, umbrellaCone, archFacadeGeo, archPylonGeo].forEach((g) => geometries.add(g));

  // PBR 石材与高透镀膜玻璃材质
  const stonePbr = createAshlarStonePbr();
  const curtainPbr = createGlassCurtainWallPbr(6, 12);
  const plazaStone = solid("#cfc8bc", 0.74, 0.04);
  bindWorldScalePbr(plazaStone, stonePbr, 3.2, 3.2, 0.65);

  const bronzeFrame = solid("#24292e", 0.32, 0.78);
  const brushedSteel = solid("#c4ccd2", 0.22, 0.88);
  const cedarWood = solid("#9e683c", 0.58, 0.06);
  const mcRed = solid("#b92b22", 0.42, 0.12);
  const driveAsphalt = solid("#23282d", 0.78, 0.05);
  const lanePaint = solid("#f0c242", 0.55, 0.04);
  const boothLeather = solid("#a53128", 0.52, 0.08);
  const umbrellaCream = solid("#efe9dc", 0.78, 0.02);
  umbrellaCream.side = THREE.DoubleSide;

  const archGold = new THREE.MeshStandardMaterial({
    color: "#ffc72c",
    emissive: "#ffb400",
    emissiveIntensity: 0.35,
    roughness: 0.22,
    metalness: 0.55,
  });
  materials.add(archGold);
  nightMaterials.push({ material: archGold, day: 0.32, night: 2.15 });

  const warmDownlight = solid("#fff1d0", 0.25, 0.05);
  warmDownlight.emissive.set("#ffcf7c");
  nightMaterials.push({ material: warmDownlight, day: 0.45, night: 2.8 });

  const kioskScreen = solid("#eef7ff", 0.2, 0.1);
  kioskScreen.emissive.set("#bfe3ff");
  nightMaterials.push({ material: kioskScreen, day: 0.65, night: 1.9 });

  const clearStorefrontGlass = new THREE.MeshPhysicalMaterial({
    color: "#d9eef4",
    roughness: 0.05,
    metalness: 0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.52,
    reflectivity: 0.95,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  materials.add(clearStorefrontGlass);

  const skyscraperCurtainGlass = new THREE.MeshPhysicalMaterial({
    color: "#a9c3cb",
    roughness: 0.18,
    metalness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
    ior: 1.52,
    reflectivity: 0.98,
    envMapIntensity: 1.55,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  bindWorldScalePbr(skyscraperCurtainGlass, curtainPbr, 9.6, 37.2, 0.12);
  materials.add(skyscraperCurtainGlass);

  // ==================== 1. 麦当劳全球旗舰店 (McDonald's Flagship @ x=168, z=80.5) ====================
  const mx = MCDONALDS_SITE.x;
  const mz = MCDONALDS_SITE.z;

  // 花岗岩商业广场地坪 + 得来速 (Drive-Thru) 环绕车道
  box(plazaStone, mx, 0.34, mz + 1.5, 28.5, 0.22, 16.4);
  // 得来速车道：东侧驶入 -> 北侧点餐/取餐窗 -> 西侧驶出汇入主路
  box(driveAsphalt, mx + 13.8, 0.33, mz + 1.2, 3.8, 0.18, 17.6);
  box(driveAsphalt, mx, 0.33, mz - 6.8, 31.4, 0.18, 3.8);
  box(driveAsphalt, mx - 13.8, 0.33, mz + 1.2, 3.8, 0.18, 17.6);
  // 得来速地面导向黄线与限高杆 (2.8M)
  for (const lx of [-8, 0, 8]) box(lanePaint, mx + lx, 0.43, mz - 6.8, 2.2, 0.02, 0.16);
  box(bronzeFrame, mx + 12.1, 1.85, mz + 6.8, 0.18, 2.9, 0.18);
  box(bronzeFrame, mx + 15.5, 1.85, mz + 6.8, 0.18, 2.9, 0.18);
  box(archGold, mx + 13.8, 3.22, mz + 6.8, 3.6, 0.26, 0.24);
  // 得来速发光电子点餐屏立柱
  box(bronzeFrame, mx + 8.5, 1.35, mz - 8.6, 0.22, 1.8, 0.22);
  box(kioskScreen, mx + 8.5, 1.95, mz - 8.45, 1.15, 0.88, 0.12);

  // 旗舰店建筑主体：底层高透超白玻璃幕墙 + 西翼陶土红砖景墙 + 悬挑原木格栅大屋顶
  const storeW = 19.6;
  const storeD = 9.2;
  const storeH = 5.4;
  // 室内水磨石地面与吊顶
  box(plazaStone, mx, 0.48, mz, storeW - 0.3, 0.14, storeD - 0.3);
  box(cedarWood, mx, storeH - 0.22, mz, storeW + 2.8, 0.24, storeD + 3.2);
  // 建筑外挑深色铝板屋檐与木格栅百叶眉檐
  box(bronzeFrame, mx, storeH + 0.32, mz + 0.3, storeW + 3.2, 0.88, storeD + 3.6);
  for (let slat = -11; slat <= 11; slat++) {
    box(cedarWood, mx + slat * 0.92, storeH + 0.28, mz + storeD / 2 + 2.12, 0.14, 0.72, 0.18);
  }
  // 檐下迎宾暖光筒灯阵列
  for (let lx = -8.5; lx <= 8.5; lx += 2.8) {
    box(warmDownlight, mx + lx, storeH - 0.35, mz + storeD / 2 + 1.15, 0.34, 0.05, 0.34);
  }
  // 旗舰店西侧品牌红肋景墙与后勤背墙
  box(mcRed, mx - storeW / 2 + 1.8, 0.55 + storeH / 2, mz, 3.6, storeH, storeD);
  // Leave a real opening in the rear wall for the sliding pickup window.
  const backZ = mz - storeD / 2 + 0.22;
  box(bronzeFrame, mx - 4.36, 0.55 + storeH / 2, backZ, 4.48, storeH, 0.38);
  box(bronzeFrame, mx + 4.56, 0.55 + storeH / 2, backZ, 10.08, storeH, 0.38);
  box(bronzeFrame, mx - 1.2, 0.89, backZ, 1.5, 0.68, 0.38);
  box(bronzeFrame, mx - 1.2, 4.24, backZ, 1.5, 3.42, 0.38);

  // 门头招牌发光字贴图："McDonald's · McCafé"
  const mcSignTex = canvasTexture(1024, 192, (ctx) => {
    ctx.fillStyle = "#1b1f23";
    ctx.fillRect(0, 0, 1024, 192);
    ctx.fillStyle = "#b92b22";
    ctx.fillRect(0, 152, 1024, 40);
    ctx.fillStyle = "#ffffff";
    ctx.font = '700 76px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText("McDonald's", 56, 110);
    ctx.fillStyle = "#ffc72c";
    ctx.font = '600 42px "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "right";
    ctx.fillText("McCafé · DRIVE-THRU", 968, 106);
  });
  const mcSignMat = new THREE.MeshStandardMaterial({
    map: mcSignTex,
    emissiveMap: mcSignTex,
    emissive: "#fff4d6",
    emissiveIntensity: 0.45,
    roughness: 0.36,
  });
  materials.add(mcSignMat);
  nightMaterials.push({ material: mcSignMat, day: 0.38, night: 1.45 });
  const signPlane = new THREE.PlaneGeometry(9.6, 1.5);
  geometries.add(signPlane);
  const fasciaSign = new THREE.Mesh(signPlane, mcSignMat);
  fasciaSign.position.set(mx + 2.2, storeH + 0.36, mz + storeD / 2 + 2.15);
  group.add(fasciaSign);

  // 立体双抛物线金拱门：1) 门头主标  2) 街角 13m 高空立柱招牌
  const mainArch = new THREE.Mesh(archFacadeGeo, archGold);
  mainArch.position.set(mx - 4.4, storeH + 0.55, mz + storeD / 2 + 2.22);
  group.add(mainArch);

  const pylonX = mx + 11.3;
  const pylonZ = mz + 7.4;
  box(bronzeFrame, pylonX, 6.2, pylonZ, 0.52, 11.8, 0.52);
  box(mcRed, pylonX, 10.6, pylonZ, 3.4, 1.35, 0.58);
  const pylonArch = new THREE.Mesh(archPylonGeo, archGold);
  pylonArch.position.set(pylonX, 12.65, pylonZ);
  group.add(pylonArch);

  // 南立面与东立面超白高透落地玻璃幕墙（正中预留 2.24m 宽物理双开玻璃门洞！）
  const frontZ = mz + storeD / 2;
  // 左段落地玻璃幕墙 (mx - 6.0 .. mx - 1.15)
  box(clearStorefrontGlass, mx - 3.65, 2.75, frontZ, 4.9, 4.4, 0.08);
  // 右段落地玻璃幕墙 (mx + 1.15 .. mx + 9.6)
  box(clearStorefrontGlass, mx + 5.35, 2.75, frontZ, 8.4, 4.4, 0.08);
  // 门洞上方玻璃亮子 (Transom glass)
  box(clearStorefrontGlass, mx, 4.18, frontZ, 2.3, 1.52, 0.08);
  // 东侧落地玻璃幕墙
  box(clearStorefrontGlass, mx + storeW / 2, 2.75, mz + 0.5, 0.08, 4.4, storeD - 1.4);

  // 竖向阳极氧化铝幕墙龙骨梃 (Mullions)
  for (const mullionX of [-6.1, -3.6, -1.16, 1.16, 3.8, 6.6, 9.55]) {
    box(bronzeFrame, mx + mullionX, 2.75, frontZ + 0.04, 0.11, 4.5, 0.16);
  }
  box(bronzeFrame, mx, 3.42, frontZ + 0.04, 2.42, 0.12, 0.18);

  // 室内清晰可见细节：点餐收银吧台、发光菜单灯箱、3台触控自助点餐机、4组卡座餐桌
  box(brushedSteel, mx + 2.4, 1.05, mz - 2.3, 8.6, 1.1, 1.15);
  box(cedarWood, mx + 2.4, 1.64, mz - 1.72, 8.8, 0.08, 0.42);
  for (let m = -1; m <= 1; m++) {
    box(kioskScreen, mx + 2.4 + m * 2.5, 3.65, mz - 3.8, 2.2, 0.95, 0.1);
  }
  // 3 台双面竖屏自助点餐机 (Self-Order Kiosks)
  for (const kx of [-2.8, -1.5, 4.8]) {
    box(bronzeFrame, mx + kx, 1.42, mz + 1.1, 0.58, 1.9, 0.18);
    box(kioskScreen, mx + kx, 1.56, mz + 1.2, 0.48, 0.92, 0.04);
  }
  // 室内四人卡座与吊灯
  for (const bx of [4.2, 7.4]) {
    for (const bz of [0.6, 2.8]) {
      box(cedarWood, mx + bx, 0.92, mz + bz, 1.4, 0.07, 0.85);
      box(brushedSteel, mx + bx, 0.68, mz + bz, 0.12, 0.48, 0.12);
      box(boothLeather, mx + bx, 0.86, mz + bz - 0.65, 1.45, 0.76, 0.38);
      box(boothLeather, mx + bx, 0.86, mz + bz + 0.65, 1.45, 0.76, 0.38);
      box(warmDownlight, mx + bx, 3.45, mz + bz, 0.26, 0.22, 0.26);
    }
  }

  // ==================== 物理双扇弹簧玻璃推拉门 (McDonald's Hinged Double Glass Doors) ====================
  const doorGroup = new THREE.Group();
  doorGroup.name = "McDonalds_Physical_Doors";
  doorGroup.position.set(MCDONALDS_SITE.doorX, 0.52, MCDONALDS_SITE.doorZ);
  group.add(doorGroup);

  const buildDoorLeaf = (side: -1 | 1): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 1.12, 0, 0);
    const leafW = 1.08;
    const leafH = 2.86;
    const cx = -side * (leafW * 0.5);

    // 铝合金门扇上下横档与竖向门梃
    const frameMat = bronzeFrame;
    const mk = (mat: THREE.Material, geo: THREE.BufferGeometry, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(lx, ly, lz);
      m.scale.set(sx, sy, sz);
      m.castShadow = mat !== clearStorefrontGlass;
      pivot.add(m);
    };
    mk(frameMat, cube, cx, 0.09, 0, leafW, 0.18, 0.07);
    mk(frameMat, cube, cx, leafH - 0.06, 0, leafW, 0.12, 0.07);
    mk(frameMat, cube, -side * 0.045, leafH / 2, 0, 0.09, leafH, 0.07);
    mk(frameMat, cube, -side * (leafW - 0.045), leafH / 2, 0, 0.09, leafH, 0.07);
    // 门扇超白钢化玻璃
    mk(clearStorefrontGlass, cube, cx, leafH / 2, 0, leafW - 0.16, leafH - 0.28, 0.026);
    // 防撞金色腰带标贴 (Golden Arches safety strip)
    mk(archGold, cube, cx, 1.18, 0, leafW - 0.18, 0.065, 0.034);
    // 内外双侧拉丝不锈钢长管推拉把手 + 顶部液压闭门器连杆盒
    const handleX = -side * (leafW - 0.18);
    for (const face of [-1, 1]) {
      mk(brushedSteel, cylinder, handleX, 1.18, face * 0.065, 0.018, 0.78, 0.018);
      mk(brushedSteel, cube, handleX, 1.52, face * 0.035, 0.025, 0.025, 0.06);
      mk(brushedSteel, cube, handleX, 0.84, face * 0.035, 0.025, 0.025, 0.06);
    }
    // Concealed hinges and two-speed hydraulic closer at actual hinge positions.
    for (const hingeY of [0.3, leafH * 0.5, leafH - 0.3]) {
      mk(brushedSteel, cylinder, 0, hingeY, 0, 0.025, 0.11, 0.025);
    }
    mk(brushedSteel, cube, -side * 0.24, leafH - 0.09, -0.055, 0.28, 0.075, 0.065);
    mk(brushedSteel, cube, -side * 0.33, leafH - 0.035, -0.18, 0.48, 0.025, 0.035);

    doorGroup.add(pivot);
    return pivot;
  };
  const leftDoorPivot = buildDoorLeaf(-1);
  const rightDoorPivot = buildDoorLeaf(1);

  // 北侧得来速电动侧滑取餐窗 (Drive-Thru Sliding Pickup Window)
  const pickupWindow = new THREE.Mesh(cube, clearStorefrontGlass);
  pickupWindow.scale.set(1.25, 1.35, 0.05);
  pickupWindow.position.set(mx - 1.2, 1.85, mz - storeD / 2 - 0.04);
  group.add(pickupWindow);
  box(archGold, mx - 1.2, 2.68, mz - storeD / 2 - 0.08, 1.55, 0.18, 0.16);

  // Outdoor tables, chairs, and ribs share batches with the architecture.
  for (const [ux, uz] of [[mx - 5.2, mz + 7.2], [mx + 4.4, mz + 7.2], [mx + 8.0, mz + 7.2]] as const) {
    part(bronzeFrame, cylinder, ux, 1.65, uz, 0.045, 2.4, 0.045);
    part(cedarWood, cylinder, ux, 1.12, uz, 0.68, 0.06, 0.68);
    part(umbrellaCream, umbrellaCone, ux, 2.82, uz, 1, 1, 1);
    for (const side of [-1, 1]) {
      const chairX = ux + side * 0.72;
      box(cedarWood, chairX, 0.77, uz, 0.45, 0.07, 0.46);
      box(cedarWood, chairX + side * 0.22, 1.05, uz, 0.06, 0.56, 0.46);
      for (const dx of [-0.17, 0.17]) for (const dz of [-0.17, 0.17]) {
        box(bronzeFrame, chairX + dx, 0.56, uz + dz, 0.035, 0.4, 0.035);
      }
    }
    for (let rib = 0; rib < 8; rib++) {
      const angle = rib * Math.PI / 4;
      kit.beam(new THREE.Vector3(ux, 3.08, uz), new THREE.Vector3(ux + Math.cos(angle) * 1.6, 2.58, uz + Math.sin(angle) * 1.6), 0.012, bronzeFrame);
    }
  }

  // 得来速动态排队取餐轿车 (2 辆真实四轮车辆沿 Drive-Thru 缓行停靠取餐窗)
  const dtSedan = createVehicleShell("sedan");
  const dtSuv = createVehicleShell("suv");
  const { tire: dtTire, rim: dtRim } = createVehicleWheel();
  [dtSedan.body, dtSedan.glass, dtSedan.trim, dtSedan.chrome, dtSuv.body, dtSuv.glass, dtSuv.trim, dtSuv.chrome, dtTire, dtRim].forEach((g) => geometries.add(g));

  const dtCarColors = [solid("#e8ecef", 0.22, 0.38), solid("#2b5678", 0.24, 0.42)];
  const dtCars = [dtSedan, dtSuv].map((shell, idx) => {
    const rig = new THREE.Group();
    const b = new THREE.Mesh(shell.body, dtCarColors[idx]);
    const g = new THREE.Mesh(shell.glass, clearStorefrontGlass);
    const tr = new THREE.Mesh(shell.trim, bronzeFrame);
    const ch = new THREE.Mesh(shell.chrome, brushedSteel);
    b.castShadow = true;
    rig.add(b, g, tr, ch);
    for (const w of shell.wheels) {
      const tireM = new THREE.Mesh(dtTire, bronzeFrame);
      const rimM = new THREE.Mesh(dtRim, brushedSteel);
      tireM.position.set(w.x, shell.wheelR, w.z);
      tireM.rotation.z = Math.PI / 2;
      tireM.scale.setScalar(shell.wheelR);
      rimM.position.copy(tireM.position);
      rimM.rotation.copy(tireM.rotation);
      rimM.scale.copy(tireM.scale);
      rig.add(tireM, rimM);
    }
    rig.userData.wheels = rig.children.slice(4);
    group.add(rig);
    return rig;
  });

  // ==================== 2. 西城地铁玻璃出入口 (Metro Station Entrance @ x=-168, z=81.5) ====================
  const metroX = -168;
  const metroZ = 81.5;
  box(plazaStone, metroX, 0.35, metroZ, 12.4, 0.22, 10.6);
  // 弧坡折面钢化玻璃雨棚与不锈钢龙骨
  for (const side of [-1, 1]) {
    box(clearStorefrontGlass, metroX + side * 2.65, 2.1, metroZ - 0.6, 0.045, 3.1, 6.8);
  }
  box(clearStorefrontGlass, metroX, 2.1, metroZ - 4.0, 5.4, 3.1, 0.045);
  box(skyscraperCurtainGlass, metroX, 3.68, metroZ - 0.4, 5.8, 0.1, 7.4);
  for (const side of [-1, 1]) box(bronzeFrame, metroX + side * 2.85, 3.68, metroZ - 0.4, 0.09, 0.18, 7.4);
  const portal = solid("#18222a", 0.98);
  box(portal, metroX, 1.35, metroZ - 1.9, 4.6, 2.1, 0.06);
  for (const side of [-1, 1]) kit.beam(new THREE.Vector3(metroX + side * 2.35, 1.5, metroZ + 2.8), new THREE.Vector3(metroX + side * 2.35, 0.9, metroZ - 0.5), 0.045, brushedSteel);
  for (const sx of [-2.65, 2.65]) {
    for (const sz of [-3.6, 0, 3.0]) {
      box(brushedSteel, metroX + sx, 2.05, metroZ + sz, 0.12, 3.2, 0.12);
    }
  }
  // 下沉阶梯与发光蓝绿地铁门楣标牌
  for (let step = 0; step < 5; step++) {
    box(plazaStone, metroX, 0.36 - step * 0.12, metroZ + 2.4 - step * 0.55, 4.6, 0.14, 0.58);
  }
  const metroSignMat = solid("#0e6ba8", 0.3, 0.2);
  metroSignMat.emissive.set("#1e90ff");
  nightMaterials.push({ material: metroSignMat, day: 0.55, night: 2.2 });
  box(metroSignMat, metroX, 3.72, metroZ + 3.35, 5.2, 0.48, 0.18);

  // ==================== 3. 摩天写字楼物理玻璃幕墙立面构件 + 四翼水晶旋转门 + 高空擦窗机吊篮 ====================
  const revolvingDoors: THREE.Group[] = [];
  const bmuGondolas: { group: THREE.Group; baseX: number; topY: number; baseZ: number; cableLen: number; phase: number }[] = [];

  for (const [idx, lobby] of OFFICE_LOBBY_DOORS.entries()) {
    // 门厅点支式超白玻璃雨棚与不锈钢拉杆 (Spider-Glass Canopy)
    box(skyscraperCurtainGlass, lobby.x, lobby.height + 0.62, lobby.z + 1.15, lobby.width + 2.4, 0.1, 2.4);
    box(brushedSteel, lobby.x, lobby.height + 0.66, lobby.z + 2.32, lobby.width + 2.5, 0.08, 0.09);
    for (const side of [-1, 1]) {
      // 斜拉不锈钢索杆
      kit.beam(
        new THREE.Vector3(lobby.x + side * (lobby.width * 0.5 + 0.8), lobby.height + 2.1, lobby.z - 0.05),
        new THREE.Vector3(lobby.x + side * (lobby.width * 0.5 + 0.8), lobby.height + 0.68, lobby.z + 2.15),
        0.032,
        brushedSteel,
      );
      // 玻璃旋转门弧形外筒立柱
      box(bronzeFrame, lobby.x + side * (lobby.width * 0.52), lobby.height * 0.5 + 0.45, lobby.z + 0.42, 0.12, lobby.height, 0.95);
    }
    // Match the two exchange towers; a flat sheet across the lot would cover their open atrium.
    if (idx === 0) {
      for (const side of [-1, 1]) {
        const towerX = lobby.x + side * lobby.towerW * 0.33;
        const towerTop = lobby.towerHeight * (side < 0 ? 1 : 0.83);
        const towerWidth = lobby.towerW * 0.25;
        for (let floorY = 4; floorY < towerTop; floorY += 3.4) {
          for (let panel = 0; panel < 4; panel++) {
            const panelWidth = towerWidth / 4;
            const panelX = towerX - towerWidth / 2 + (panel + 0.5) * panelWidth;
            box(skyscraperCurtainGlass, panelX, floorY, lobby.towerZ + lobby.towerD * 0.3 + 0.1, panelWidth - 0.035, 2.58, 0.035);
            box(bronzeFrame, panelX - panelWidth / 2, floorY, lobby.towerZ + lobby.towerD * 0.3 + 0.14, 0.045, 2.72, 0.09);
          }
          box(brushedSteel, towerX, floorY - 1.34, lobby.towerZ + lobby.towerD * 0.3 + 0.15, towerWidth, 0.08, 0.12);
          box(bronzeFrame, towerX, floorY + 1.52, lobby.towerZ + lobby.towerD * 0.3 + 0.11, towerWidth, 0.35, 0.06);
          for (const edge of [-1, 1]) {
            for (let panel = 0; panel < 7; panel++) {
              const panelZ = lobby.towerZ - lobby.towerD * 0.4 + panel * lobby.towerD * 0.105;
              box(skyscraperCurtainGlass, towerX + edge * lobby.towerW * 0.14, floorY, panelZ, 0.035, 2.58, lobby.towerD * 0.105 - 0.05);
            }
          }
        }
      }
    }

    // 四翼水晶旋转门 (4-Wing Revolving Glass Door)
    const revHub = new THREE.Group();
    revHub.position.set(lobby.x, 0.48, lobby.z + 0.42);
    const centerShaft = new THREE.Mesh(cylinder, brushedSteel);
    centerShaft.position.y = lobby.height * 0.48;
    centerShaft.scale.set(0.065, lobby.height * 0.96, 0.065);
    revHub.add(centerShaft);

    const wingRadius = lobby.width * 0.44;
    for (let w = 0; w < 4; w++) {
      const wingHolder = new THREE.Group();
      wingHolder.rotation.y = (w * Math.PI) / 2;
      const glassWing = new THREE.Mesh(cube, clearStorefrontGlass);
      glassWing.position.set(wingRadius * 0.5, lobby.height * 0.46, 0);
      glassWing.scale.set(wingRadius, lobby.height * 0.88, 0.03);
      const topRail = new THREE.Mesh(cube, brushedSteel);
      topRail.position.set(wingRadius * 0.5, lobby.height * 0.9, 0);
      topRail.scale.set(wingRadius, 0.06, 0.05);
      const pushBar = new THREE.Mesh(cube, archGold);
      pushBar.position.set(wingRadius * 0.55, 1.08, 0);
      pushBar.scale.set(wingRadius * 0.72, 0.045, 0.07);
      wingHolder.add(glassWing, topRail, pushBar);
      revHub.add(wingHolder);
    }
    // 旋转门圆形不锈钢华盖顶盘
    const drumCap = new THREE.Mesh(cylinder, bronzeFrame);
    drumCap.position.set(lobby.x, 0.48 + lobby.height, lobby.z + 0.42);
    drumCap.scale.set(wingRadius + 0.08, 0.18, wingRadius + 0.08);
    group.add(revHub, drumCap);
    revolvingDoors.push(revHub);

    // 超高层写字楼配备高空幕墙擦窗机吊篮 (BMU Window-Washing Gondola)，按真实重力单摆微晃
    if (idx === 0) {
      const roofY = lobby.towerHeight + 1.2;
      const bmuX = lobby.x + (idx % 2 === 0 ? -1 : 1) * lobby.towerW * 0.26;
      const bmuZ = lobby.z + 0.35;
      const cableLen = 11.5 + idx * 3.5;
      // 屋顶悬挑吊臂底座
      box(bronzeFrame, bmuX, roofY + 0.8, bmuZ - 1.1, 0.85, 1.2, 2.4);
      box(brushedSteel, bmuX, roofY + 1.45, bmuZ - 0.3, 0.22, 0.22, 2.6);

      const gondolaPivot = new THREE.Group();
      gondolaPivot.position.set(bmuX, roofY + 1.4, bmuZ + 0.75);
      for (const cx of [-0.95, 0.95]) {
        const cable = new THREE.Mesh(cylinder, brushedSteel);
        cable.position.set(cx, -cableLen * 0.5, 0);
        cable.scale.set(0.018, cableLen, 0.018);
        gondolaPivot.add(cable);
      }
      const cradle = new THREE.Mesh(cube, brushedSteel);
      cradle.position.set(0, -cableLen, 0);
      cradle.scale.set(2.2, 0.16, 0.72);
      gondolaPivot.add(cradle);
      for (const railY of [0.4, 0.9]) for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(cube, brushedSteel);
        rail.position.set(0, -cableLen + railY, side * 0.34);
        rail.scale.set(2.2, 0.035, 0.035);
        gondolaPivot.add(rail);
      }
      for (const x of [-1.05, 1.05]) for (const z of [-0.34, 0.34]) {
        const post = new THREE.Mesh(cylinder, brushedSteel);
        post.position.set(x, -cableLen + 0.45, z);
        post.scale.set(0.018, 0.9, 0.018);
        gondolaPivot.add(post);
      }
      const workerHatGeo = createCap();
      const workerBodyGeo = createTorso();
      const workerHeadGeo = createHead();
      [workerHatGeo, workerBodyGeo, workerHeadGeo].forEach((geometry) => geometries.add(geometry));
      const workerHelmet = new THREE.Mesh(workerHatGeo, archGold);
      workerHelmet.position.set(-0.42, -cableLen + 1.72, 0);
      workerHelmet.scale.set(0.26, 0.14, 0.27);
      const workerTorso = new THREE.Mesh(workerBodyGeo, metroSignMat);
      workerTorso.position.set(-0.42, -cableLen + 1.15, 0);
      workerTorso.scale.set(0.45, 0.6, 0.3);
      const workerHead = new THREE.Mesh(workerHeadGeo, solid("#d6ab87", 0.7));
      workerHead.position.set(-0.42, -cableLen + 1.6, 0);
      workerHead.scale.set(0.24, 0.24, 0.24);
      gondolaPivot.add(workerHelmet, workerTorso, workerHead);
      const workerLimbGeometry = [createThigh(), createCalf(), createUpperArm(), createForearm(), createShoe()];
      workerLimbGeometry.forEach((geometry) => geometries.add(geometry));
      const workerPants = solid("#29343c", 0.88);
      for (const side of [-1, 1]) {
        for (const [kind, y, height, width, depth] of [[0, 0.67, 0.42, 0.2, 0.2], [1, 0.28, 0.37, 0.16, 0.16], [4, 0.13, 0.13, 0.16, 0.3]] as const) {
          const leg = new THREE.Mesh(workerLimbGeometry[kind], workerPants);
          leg.position.set(-0.42 + side * 0.12, -cableLen + y, 0.02);
          leg.scale.set(width, height, depth);
          gondolaPivot.add(leg);
        }
        const sleeve = new THREE.Mesh(workerLimbGeometry[2], metroSignMat);
        sleeve.position.set(-0.42 + side * 0.27, -cableLen + 1.15, -0.12);
        sleeve.scale.set(0.14, 0.29, 0.14);
        sleeve.rotation.x = 0.65;
        const forearm = new THREE.Mesh(workerLimbGeometry[3], workerPants);
        forearm.position.set(-0.42 + side * 0.27, -cableLen + 1.03, -0.32);
        forearm.scale.set(0.11, 0.26, 0.11);
        forearm.rotation.x = 1.25;
        gondolaPivot.add(sleeve, forearm);
      }
      const pole = new THREE.Mesh(cylinder, brushedSteel);
      pole.position.set(-0.15, -cableLen + 1.4, -0.39);
      pole.scale.set(0.012, 1.1, 0.012);
      const blade = new THREE.Mesh(cube, bronzeFrame);
      blade.position.set(-0.15, -cableLen + 1.95, -0.39);
      blade.scale.set(0.45, 0.04, 0.06);
      gondolaPivot.add(pole, blade);
      group.add(gondolaPivot);
      bmuGondolas.push({ group: gondolaPivot, baseX: bmuX, topY: roofY + 1.4, baseZ: bmuZ + 0.75, cableLen, phase: idx * 1.7 });
    }
  }

  const entrancePresence = new EntrancePresence(MCDONALDS_SITE.doorX, 0.52, MCDONALDS_SITE.doorZ);
  const revolvingMotion = OFFICE_LOBBY_DOORS.map(door => new RevolvingEntranceMotion(door.x, 0.52, door.z));
  const dtCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(mx + 13.8, 0.44, mz + 7.8),
    new THREE.Vector3(mx + 13.8, 0.44, mz - 4.5),
    new THREE.Vector3(mx + 11.5, 0.44, mz - 6.8),
    new THREE.Vector3(mx + 8.5, 0.44, mz - 6.8),
    new THREE.Vector3(mx - 1.2, 0.44, mz - 6.8),
    new THREE.Vector3(mx - 11.5, 0.44, mz - 6.8),
    new THREE.Vector3(mx - 13.8, 0.44, mz - 4.5),
    new THREE.Vector3(mx - 13.8, 0.44, mz + 7.8),
    new THREE.Vector3(mx - 11.4, 0.44, mz + 11.9),
    new THREE.Vector3(mx + 11.4, 0.44, mz + 11.9),
  ], true, "catmullrom", 0.14);
  const driveThrough = new DriveThroughTraffic(dtCurve, dtCars.length);

  return {
    animate(seconds: number, _night: boolean, occupants: readonly EntranceOccupant[] = []) {
      // 1. 麦当劳双扇玻璃门弹簧-液压闭门器真实物理开合
      const doorAngle = entrancePresence.update(seconds, occupants) * 1.36;
      leftDoorPivot.rotation.y = -doorAngle;
      rightDoorPivot.rotation.y = doorAngle;

      // 2. 得来速车道车辆排队点餐、取餐窗自动滑开递餐
      const driveStates = driveThrough.update(seconds);
      dtCars.forEach((carRig, idx) => {
        const motion = driveStates[idx];
        carRig.position.copy(motion.position);
        carRig.rotation.y = Math.atan2(motion.tangent.x, motion.tangent.z);
        carRig.rotation.x = THREE.MathUtils.clamp(-motion.acceleration * 0.0085, -0.03, 0.04);
        const wheelPhase = motion.travelled / (idx ? dtSuv.wheelR : dtSedan.wheelR);
        (carRig.userData.wheels as THREE.Mesh[]).forEach((wheel) => { wheel.rotation.x = wheelPhase; });
      });
      pickupWindow.position.x = mx - 1.2 + driveThrough.pickupWindowOpen * 0.88;
      doorGroup.userData.completedOrders = driveThrough.completedOrders;

      // 3. 写字楼旋转门在人靠近后启动，离开后减速停在完整门位。
      revolvingDoors.forEach((hub, idx) => {
        hub.rotation.y = revolvingMotion[idx].update(seconds, occupants);
      });

      // 4. 高空擦窗机吊篮受重力与海风产生真实重力单摆微晃
      bmuGondolas.forEach((bmu) => {
        const { swingX, swingZ } = samplePendulumSwing(seconds, bmu.cableLen, 0.026, bmu.phase);
        bmu.group.rotation.z = swingX;
        bmu.group.rotation.x = swingZ * 0.45;
      });
    },
  };
}
