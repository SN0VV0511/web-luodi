import * as THREE from "three";
import type { CivicKit } from "./city-civic";
import { markCitySurface } from "./city-surfaces";

export type UtilityDistrictHandle = {
  animate: (seconds: number) => void;
  powerPlantCenter: { x: number; z: number };
  wastewaterCenter: { x: number; z: number };
  windTurbineCount: number;
  clarifierCount: number;
};

/**
 * 构建《城市：天际线》核心市政基础设施园区：
 * 1. 东湾生态污水处理厂 (Wastewater Treatment Plant, x=264, z=54)
 *    - 4 座圆形初沉/二沉澄清池 + 实时旋转钢桁架刮泥桥
 *    - 3 组生物曝气反应池 + 实时翻涌微气泡水花
 *    - 2 座厌氧污泥消化球顶罐 + 三色工艺管廊 + 紫外线消毒控制楼 + 达标清澈尾水入海明渠
 * 2. 北湾联合循环发电厂与清洁能源矩阵 (Combined-Cycle Power Station & Grid, x=268, z=-62)
 *    - 2 座双曲线自然通风冷却塔 (LatheGeometry) + 实时升腾白色水蒸气云团
 *    - 燃气轮机主厂房 + 余热锅炉 + 双红白航空警示高烟囱
 *    - 220kV 升压变电站（主变散热器、瓷瓶套管、龙门构架）+ 4 座高压输电角钢铁塔与架空三相导线
 *    - 光伏发电方阵 + 5 座实时旋转三叶兆瓦级风力发电机组
 */
export function buildCityUtilities(kit: CivicKit): UtilityDistrictHandle {
  const { group, geometries, materials, nightMaterials, box, part, beam, solid, canvasTexture } = kit;

  const regGeo = <T extends THREE.BufferGeometry>(geo: T): T => {
    geometries.add(geo);
    return geo;
  };

  const unitBox = regGeo(new THREE.BoxGeometry(1, 1, 1));
  const unitCyl = regGeo(new THREE.CylinderGeometry(1, 1, 1, 24));
  const unitDome = regGeo(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5));
  const puffGeo = regGeo(new THREE.IcosahedronGeometry(1, 1));

  // 双曲线自然通风冷却塔壳体几何 (y: 0..1, 底部半径 1.0, 喉部 y=0.72 半径 0.58, 顶部半径 0.65)
  const hyperboloidPoints: THREE.Vector2[] = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const throatOffset = (t - 0.7) / 0.48;
    const radius = 0.57 * Math.sqrt(1 + throatOffset * throatOffset * 1.45);
    hyperboloidPoints.push(new THREE.Vector2(radius, t));
  }
  const coolingTowerGeo = regGeo(new THREE.LatheGeometry(hyperboloidPoints, 28));

  // 圆形污水沉淀池环形混凝土池壁几何（外径 1.0，内径 0.88，高 1.0）
  const ringShape = new THREE.Shape();
  ringShape.absarc(0, 0, 1.0, 0, Math.PI * 2, false);
  const ringHole = new THREE.Path();
  ringHole.absarc(0, 0, 0.88, 0, Math.PI * 2, true);
  ringShape.holes.push(ringHole);
  const tankWallGeo = regGeo(
    new THREE.ExtrudeGeometry(ringShape, { depth: 1, bevelEnabled: false, curveSegments: 28 }),
  );
  tankWallGeo.rotateX(-Math.PI / 2);

  // 风力发电机流线型锥削叶片几何（根部在原点，沿 +Y 延伸 1.0 单位长）
  const bladeGeo = regGeo(new THREE.BoxGeometry(0.11, 1.0, 0.025));
  bladeGeo.translate(0, 0.5, 0);

  // 材质体系
  const concretePad = solid("#b5b4aa", 0.84, 0.03);
  const concreteWall = solid("#d2cfc4", 0.78, 0.04);
  const concreteDark = solid("#7a8082", 0.82, 0.06);
  const asphaltRoad = solid("#2a3136", 0.84, 0.05);
  const steelFrame = solid("#4a5860", 0.38, 0.62);
  const galvanized = solid("#bcc5ca", 0.3, 0.68);
  const turbineWhite = solid("#f0f2ef", 0.34, 0.18);
  const industrialClad = solid("#cfd6da", 0.42, 0.46);
  const industrialBlue = solid("#2a5e82", 0.38, 0.35);
  const safetyRed = solid("#c93b30", 0.46, 0.14);
  const safetyYellow = solid("#e8b238", 0.48, 0.12);
  const pipeReclaimed = solid("#2889b8", 0.34, 0.48);
  const pipeSludge = solid("#3b845c", 0.38, 0.42);
  const pipeBiogas = solid("#d99b32", 0.36, 0.44);
  const insulatorBrown = solid("#6e4738", 0.32, 0.18);
  const cableDark = solid("#1f2529", 0.6, 0.4);
  const clarifierWater = solid("#1b6c78", 0.14, 0.25);
  const aerationWater = solid("#235866", 0.22, 0.18);
  const cleanOutfallWater = solid("#22a6b8", 0.1, 0.22);

  markCitySurface(concretePad, "concrete");
  markCitySurface(concreteWall, "concrete");
  markCitySurface(asphaltRoad, "asphalt");

  const labGlass = solid("#356882", 0.16, 0.46);
  labGlass.emissive.set("#9be0ff");
  nightMaterials.push({ material: labGlass, day: 0.08, night: 1.35 });

  const aviationBeacon = solid("#ff382c", 0.28, 0.1);
  aviationBeacon.emissive.set("#ff261a");
  nightMaterials.push({ material: aviationBeacon, day: 0.75, night: 3.6 });

  const yardLamp = solid("#fff1cf", 0.28, 0.08);
  yardLamp.emissive.set("#ffd080");
  nightMaterials.push({ material: yardLamp, day: 0.18, night: 3.2 });

  // 光伏阵列纹理材质
  const solarTex = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#112642";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(170, 210, 248, 0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 248, 248);
    ctx.strokeStyle = "rgba(140, 188, 232, 0.25)";
    ctx.lineWidth = 1;
    for (let i = 32; i < 256; i += 32) {
      ctx.beginPath();
      ctx.moveTo(i, 4);
      ctx.lineTo(i, 252);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4, i);
      ctx.lineTo(252, i);
      ctx.stroke();
    }
  });
  const solarMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: solarTex,
    roughness: 0.16,
    metalness: 0.56,
  });
  materials.add(solarMat);

  // ============================================================================
  // 园区一：东湾生态污水处理厂 (Wastewater Treatment Plant, center x=264, z=54)
  // ============================================================================
  const wwX = 264;
  const wwZ = 54;
  // 厂区混凝土硬化地坪与连接 x=210 东环主干道的进厂沥青道路
  box(concretePad, wwX, 0.28, wwZ, 76, 0.2, 76);
  box(asphaltRoad, 219, 0.37, wwZ, 18, 0.08, 8.6);
  box(asphaltRoad, wwX - 24, 0.4, wwZ, 26, 0.06, 7.2);

  // 厂区围界护栏与门卫磅房
  for (const sideZ of [wwZ - 37.4, wwZ + 37.4]) {
    box(concreteWall, wwX, 0.85, sideZ, 75, 0.95, 0.35);
    box(galvanized, wwX, 1.55, sideZ, 75, 0.08, 0.08);
  }
  box(concreteWall, wwX + 37.4, 0.85, wwZ, 0.35, 0.95, 75);
  box(concreteWall, wwX - 37.4, 0.85, wwZ - 21, 0.35, 0.95, 32);
  box(concreteWall, wwX - 37.4, 0.85, wwZ + 21, 0.35, 0.95, 32);
  // 门卫室
  box(turbineWhite, wwX - 33.5, 1.85, wwZ - 7.2, 4.2, 2.7, 3.2);
  box(labGlass, wwX - 33.5, 1.9, wwZ - 5.55, 3.2, 1.4, 0.1);
  box(industrialBlue, wwX - 33.5, 3.32, wwZ - 7.2, 4.8, 0.24, 3.8);

  // 4 座大型圆形辐射流初沉/二沉澄清池 (Clarifier Sedimentation Tanks)
  const clarifierCenters: readonly [number, number][] = [
    [243, 33],
    [263, 33],
    [243, 53],
    [263, 53],
  ];
  const tankRadius = 8.2;
  for (const [cx, cz] of clarifierCenters) {
    // 环形钢筋混凝土池壁、外圈出水三角堰槽、澄清池碧绿水面与中央进水配水筒
    part(concreteWall, tankWallGeo, cx, 0.35, cz, tankRadius, 2.05, tankRadius);
    part(clarifierWater, unitCyl, cx, 1.18, cz, tankRadius * 0.87, 0.24, tankRadius * 0.87);
    part(concreteDark, unitCyl, cx, 1.45, cz, 1.35, 2.35, 1.35);
    part(galvanized, unitCyl, cx, 2.72, cz, 1.55, 0.18, 1.55);
  }

  // 3 组矩形生物好氧曝气池 (Biological Aeration Basins)
  const aerationZs = [28, 44, 60];
  for (const az of aerationZs) {
    const ax = 286;
    box(concreteWall, ax, 1.32, az, 21.5, 1.95, 11.2);
    box(aerationWater, ax, 1.95, az, 19.8, 0.25, 9.6);
    // 池内分廊隔墙与不锈钢罗茨风机曝气主管
    box(concreteWall, ax, 1.45, az, 18.6, 1.85, 0.32);
    box(galvanized, ax, 2.42, az - 2.4, 19.4, 0.18, 0.18);
    box(galvanized, ax, 2.42, az + 2.4, 19.4, 0.18, 0.18);
    // 顶部巡检钢格板走道桥
    box(steelFrame, ax, 2.48, az, 2.1, 0.12, 11.4);
  }

  // 2 座污泥厌氧消化球顶罐 (Anaerobic Sludge Digesters) 与沼气火炬塔
  const digesterXs = [240, 255];
  for (const dx of digesterXs) {
    const dz = 76;
    part(concreteWall, unitCyl, dx, 5.2, dz, 4.8, 9.8, 4.8);
    part(turbineWhite, unitDome, dx, 10.1, dz, 4.85, 3.2, 4.85);
    part(galvanized, unitCyl, dx, 13.4, dz, 1.1, 0.55, 1.1);
    // 罐顶安全护栏与竖向检修爬梯
    box(steelFrame, dx + 4.92, 5.4, dz, 0.25, 9.6, 0.65);
  }
  // 消化池之间跨接三色工业工艺管廊（蓝色中水管、绿色污泥管、金色沼气管）
  beam(new THREE.Vector3(240, 8.8, 76), new THREE.Vector3(255, 8.8, 76), 0.26, pipeSludge);
  beam(new THREE.Vector3(240, 9.5, 76), new THREE.Vector3(255, 9.5, 76), 0.22, pipeBiogas);
  beam(new THREE.Vector3(255, 4.2, 76), new THREE.Vector3(276, 4.2, 76), 0.28, pipeReclaimed);
  // 沼气安全燃烧塔
  part(galvanized, unitCyl, 231, 6.8, 82, 0.38, 13.0, 0.38);
  box(aviationBeacon, 231, 13.5, 82, 0.45, 0.45, 0.45);

  // 紫外线深度消毒车间与水质中控化验大楼
  box(industrialClad, 278, 3.6, 78, 22, 6.4, 12.5);
  box(industrialBlue, 278, 6.95, 78, 22.8, 0.4, 13.2);
  box(labGlass, 278, 3.8, 84.3, 17.5, 3.8, 0.16);
  // 药剂投加立式储罐
  for (const sx of [292.5, 296.5]) {
    part(turbineWhite, unitCyl, sx, 4.1, 76, 1.35, 7.4, 1.35);
    box(pipeReclaimed, sx, 7.9, 76, 0.9, 0.3, 0.9);
  }

  // 生态达标清澈尾水入海排放明渠 (x=294, z=84..115 汇入海湾)
  box(concreteWall, 294, 0.35, 99.5, 5.6, 0.85, 31);
  box(cleanOutfallWater, 294, 0.62, 99.5, 3.8, 0.38, 30.8);
  // 出海口跌水堰桥
  box(galvanized, 294, 1.15, 111.5, 6.2, 0.28, 1.6);

  // 污水厂停放市政吸污罐车
  kit.vehicle("truck", pipeSludge, 232, 63);

  // ============================================================================
  // 园区二：北湾联合循环发电厂与 220kV 变电清洁能源基地 (x=268, z=-62)
  // ============================================================================
  const ppX = 268;
  const ppZ = -62;
  box(concretePad, ppX, 0.28, ppZ, 82, 0.22, 90);
  box(asphaltRoad, 219, 0.37, ppZ, 18, 0.08, 9.2);

  // 2 座 33米高双曲线自然通风冷却塔 (Hyperboloid Natural-Draft Cooling Towers)
  const coolingTowers: readonly [number, number][] = [
    [288, -83],
    [288, -45],
  ];
  for (const [tx, tz] of coolingTowers) {
    // 底部集水池与环向进风斜撑人字柱
    part(concreteDark, unitCyl, tx, 1.1, tz, 11.8, 1.6, 11.8);
    part(clarifierWater, unitCyl, tx, 1.82, tz, 11.1, 0.22, 11.1);
    for (let s = 0; s < 12; s++) {
      const a1 = (s / 12) * Math.PI * 2;
      const a2 = ((s + 0.5) / 12) * Math.PI * 2;
      beam(
        new THREE.Vector3(tx + Math.cos(a1) * 10.9, 1.6, tz + Math.sin(a1) * 10.9),
        new THREE.Vector3(tx + Math.cos(a2) * 10.2, 5.2, tz + Math.sin(a2) * 10.2),
        0.24,
        concreteWall,
      );
    }
    // 双曲线混凝土薄壳塔身 (y: 4.8 .. 33.8)
    part(concreteWall, coolingTowerGeo, tx, 4.8, tz, 10.4, 29.0, 10.4);
    // 塔顶刚性环梁与红色航空障碍灯
    part(turbineWhite, unitCyl, tx, 33.8, tz, 6.8, 0.45, 6.8);
    for (const beaconAngle of [0, Math.PI * 0.66, Math.PI * 1.33]) {
      box(
        aviationBeacon,
        tx + Math.cos(beaconAngle) * 6.6,
        34.35,
        tz + Math.sin(beaconAngle) * 6.6,
        0.42,
        0.48,
        0.42,
      );
    }
  }

  // 燃气-蒸汽联合循环汽轮发电机主厂房 + 双余热锅炉 + 双 42m 高红白警示烟囱
  const hallX = 252;
  const hallZ = -75;
  box(industrialClad, hallX, 8.6, hallZ, 32, 16.5, 24);
  box(industrialBlue, hallX, 17.05, hallZ, 33.2, 0.55, 25.2);
  box(safetyRed, hallX, 15.2, hallZ + 12.1, 31.6, 0.85, 0.22);
  // 厂房高侧采光带与屋顶通风气楼
  box(labGlass, hallX, 12.6, hallZ + 12.08, 27.5, 2.4, 0.16);
  box(labGlass, hallX, 12.6, hallZ - 12.08, 27.5, 2.4, 0.16);
  for (const vx of [-8, 0, 8]) {
    box(steelFrame, hallX + vx, 18.2, hallZ, 4.6, 1.8, 8.4);
  }
  // 余热锅炉钢构架与两座高耸红白相间排气烟囱
  for (const sx of [241, 259]) {
    box(steelFrame, sx, 10.5, -94, 9.5, 20.2, 10.5);
    part(concreteWall, unitCyl, sx, 21.0, -99, 1.85, 41.0, 1.85);
    // 烟囱顶部三道红白航空警示环与障碍灯
    for (const bandY of [33.5, 36.8, 40.0]) {
      part(
        bandY === 36.8 ? turbineWhite : safetyRed,
        unitCyl,
        sx,
        bandY,
        -99,
        1.92,
        1.8,
        1.92,
      );
    }
    box(aviationBeacon, sx, 41.9, -99, 0.48, 0.55, 0.48);
    // 蒸汽主管道接入冷却塔
    beam(new THREE.Vector3(sx, 7.5, -83), new THREE.Vector3(280, 7.5, -83), 0.48, galvanized);
  }

  // 220kV 户外升压变电站开关场 (x=250, z=-36)
  const subX = 250;
  const subZ = -36;
  box(concreteDark, subX, 0.44, subZ, 34, 0.14, 28);
  for (const txOffset of [-10, 0, 10]) {
    const trX = subX + txOffset;
    // 主变压器本体、两侧片式散热器与储油柜枕包
    box(steelFrame, trX, 2.45, subZ, 4.6, 3.8, 5.8);
    box(concreteDark, trX - 2.65, 2.3, subZ, 0.65, 3.1, 4.8);
    box(concreteDark, trX + 2.65, 2.3, subZ, 0.65, 3.1, 4.8);
    part(galvanized, unitCyl, trX, 4.85, subZ - 1.2, 0.68, 4.2, 0.68, undefined, 0, Math.PI / 2);
    // 三相高压瓷瓶绝缘套管
    for (const phase of [-1.3, 0, 1.3]) {
      part(insulatorBrown, unitCyl, trX + phase, 5.35, subZ + 1.1, 0.22, 2.1, 0.22);
    }
    // 防火隔爆墙
    if (txOffset < 10) {
      box(concreteWall, trX + 5, 3.1, subZ, 0.36, 5.4, 7.4);
    }
  }
  // 变电站钢构龙门母线架
  for (const gz of [subZ - 9, subZ + 9]) {
    for (const gx of [subX - 14, subX, subX + 14]) {
      box(galvanized, gx, 6.2, gz, 0.45, 11.6, 0.45);
    }
    box(galvanized, subX, 11.8, gz, 29.2, 0.45, 0.45);
  }

  // 4 座 220kV 高压输电角钢格构铁塔走廊（向北侧山脊与城网输送电力）
  const pylonCoords: readonly [number, number, number][] = [
    [250, 0, -116],
    [232, 0, -156],
    [196, 0, -192],
    [148, 0, -214],
  ];
  const buildTransmissionPylon = (px: number, py: number, pz: number) => {
    const h = 25.5;
    const baseHalf = 2.6;
    const topHalf = 0.75;
    const corners: [number, number][] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [sx, sz] of corners) {
      beam(
        new THREE.Vector3(px + sx * baseHalf, py + 0.3, pz + sz * baseHalf),
        new THREE.Vector3(px + sx * topHalf, py + h, pz + sz * topHalf),
        0.14,
        galvanized,
      );
    }
    // 横担双回路挂线臂
    for (const armY of [py + 16.8, py + 21.6]) {
      const span = armY > py + 19 ? 7.6 : 9.4;
      box(galvanized, px, armY, pz, span, 0.32, 0.36);
      for (const side of [-1, 1]) {
        part(insulatorBrown, unitCyl, px + side * (span * 0.46), armY - 0.85, pz, 0.14, 1.5, 0.14);
      }
    }
    box(aviationBeacon, px, py + h + 0.45, pz, 0.32, 0.36, 0.32);
  };

  pylonCoords.forEach(([px, py, pz]) => buildTransmissionPylon(px, py, pz));

  // 架设变电站至各高压铁塔的三相输电导线
  const wireNodes: [number, number, number][] = [[subX, 11.8, subZ - 9], ...pylonCoords.map(([x, y, z]) => [x, y + 20.8, z] as [number, number, number])];
  for (let i = 0; i < wireNodes.length - 1; i++) {
    const [x1, y1, z1] = wireNodes[i];
    const [x2, y2, z2] = wireNodes[i + 1];
    for (const phaseOffset of [-3.4, 0, 3.4]) {
      const midX = (x1 + x2) * 0.5 + phaseOffset;
      const midY = (y1 + y2) * 0.5 - 1.65; // 真实悬链线垂度
      const midZ = (z1 + z2) * 0.5;
      beam(new THREE.Vector3(x1 + phaseOffset, y1, z1), new THREE.Vector3(midX, midY, midZ), 0.045, cableDark);
      beam(new THREE.Vector3(midX, midY, midZ), new THREE.Vector3(x2 + phaseOffset, y2, z2), 0.045, cableDark);
    }
  }

  // 南坡单晶硅光伏太阳能发电矩阵 (24 组倾角追踪太阳能板 + 逆变器舱)
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const sx = 276 + col * 5.2;
      const sz = -28 + row * 3.8;
      box(galvanized, sx, 0.88, sz, 0.18, 1.1, 0.18);
      part(solarMat, unitBox, sx, 1.48, sz, 4.5, 0.08, 2.5, undefined, 0, 0.36);
    }
  }
  box(turbineWhite, 271, 1.65, -22, 4.4, 2.5, 2.6);
  box(safetyYellow, 271, 1.85, -20.65, 1.2, 0.65, 0.08);

  // 园区高杆投光灯
  for (const [lx, lz] of [
    [232, 22],
    [298, 22],
    [232, -52],
    [302, -52],
  ] as const) {
    box(steelFrame, lx, 5.2, lz, 0.22, 9.8, 0.22);
    box(yardLamp, lx, 10.2, lz, 1.2, 0.22, 0.65);
  }

  // ============================================================================
  // 5 座《城市：天际线》标志性三叶兆瓦级风力发电机组 (山脊风电场 + 外海防波堤风机)
  // ============================================================================
  const windTurbines: readonly { x: number; y: number; z: number; yaw: number; speed: number }[] = [
    { x: 300, y: 0, z: -132, yaw: -0.35, speed: 1.18 },
    { x: 266, y: 0, z: -162, yaw: -0.28, speed: 1.08 },
    { x: 226, y: 0, z: -190, yaw: -0.22, speed: 1.24 },
    { x: -234, y: 0, z: -168, yaw: 0.32, speed: 1.14 },
    { x: 348, y: 1.4, z: 214, yaw: -0.48, speed: 1.32 }, // 外港防波堤海上风电
  ];
  const hubHeight = 34.0;
  const bladeLength = 12.8;

  for (const wt of windTurbines) {
    // 钢筋混凝土八角承台与锥形白色钢塔筒
    part(concreteWall, unitCyl, wt.x, wt.y + 0.85, wt.z, 2.6, 1.5, 2.6);
    part(turbineWhite, unitCyl, wt.x, wt.y + hubHeight * 0.5 + 0.8, wt.z, 1.18, hubHeight, 1.18);
    // 顶部机舱 (Nacelle)、导流轮毂罩与红色航空防撞灯
    const sinY = Math.sin(wt.yaw);
    const cosY = Math.cos(wt.yaw);
    part(turbineWhite, unitBox, wt.x - sinY * 0.8, wt.y + hubHeight + 1.2, wt.z - cosY * 0.8, 2.3, 2.4, 5.4, undefined, wt.yaw);
    part(turbineWhite, unitCyl, wt.x + sinY * 2.2, wt.y + hubHeight + 1.2, wt.z + cosY * 2.2, 0.95, 1.8, 0.95, undefined, wt.yaw, Math.PI / 2);
    box(aviationBeacon, wt.x - sinY * 1.8, wt.y + hubHeight + 2.65, wt.z - cosY * 1.8, 0.36, 0.38, 0.36);
  }

  // ============================================================================
  // 动态 InstancedMesh 批次：风电旋转叶片、澄清池旋转刮泥桥、冷却塔升腾蒸汽、曝气池水泡
  // ============================================================================
  const steamMat = solid("#eef3f6", 0.92, 0.0);
  const foamMat = solid("#e2f7fa", 0.35, 0.08);

  const windBladeMesh = new THREE.InstancedMesh(bladeGeo, turbineWhite, windTurbines.length * 3);
  const clarifierBridgeMesh = new THREE.InstancedMesh(unitBox, galvanized, clarifierCenters.length * 2);
  const coolingSteamCount = coolingTowers.length * 10;
  const coolingSteamMesh = new THREE.InstancedMesh(puffGeo, steamMat, coolingSteamCount);
  const bubbleCount = aerationZs.length * 10;
  const aerationBubbleMesh = new THREE.InstancedMesh(puffGeo, foamMat, bubbleCount);

  const dynamicUtilityMeshes = [
    windBladeMesh,
    clarifierBridgeMesh,
    coolingSteamMesh,
    aerationBubbleMesh,
  ];
  dynamicUtilityMeshes.forEach((mesh) => {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = mesh === windBladeMesh || mesh === clarifierBridgeMesh;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  const dummy = new THREE.Object3D();
  const rotorAxis = new THREE.Vector3(0, 0, 1);
  const yawQuat = new THREE.Quaternion();
  const rollQuat = new THREE.Quaternion();

  const animate = (seconds: number) => {
    // 1. 5 座兆瓦级风力发电机三叶转子平滑旋转
    windTurbines.forEach((wt, wIdx) => {
      const hubX = wt.x + Math.sin(wt.yaw) * 2.35;
      const hubY = wt.y + hubHeight + 1.2;
      const hubZ = wt.z + Math.cos(wt.yaw) * 2.35;
      yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), wt.yaw);

      for (let b = 0; b < 3; b++) {
        const rollAngle = seconds * wt.speed + wIdx * 0.9 + (b * Math.PI * 2) / 3;
        rollQuat.setFromAxisAngle(rotorAxis, rollAngle);
        dummy.position.set(hubX, hubY, hubZ);
        dummy.quaternion.copy(yawQuat).multiply(rollQuat);
        dummy.scale.set(bladeLength, bladeLength, bladeLength);
        dummy.updateMatrix();
        windBladeMesh.setMatrixAt(wIdx * 3 + b, dummy.matrix);
      }
    });

    // 2. 污水处理厂 4 座圆形沉淀池钢桁架刮泥桥缓慢匀速旋转
    clarifierCenters.forEach(([cx, cz], cIdx) => {
      const bridgeAngle = seconds * 0.24 + cIdx * 1.1;
      const armCenterR = tankRadius * 0.44;
      // 主走道钢梁
      dummy.position.set(
        cx + Math.sin(bridgeAngle) * armCenterR,
        2.58,
        cz + Math.cos(bridgeAngle) * armCenterR,
      );
      dummy.rotation.set(0, bridgeAngle, 0);
      dummy.scale.set(1.05, 0.24, tankRadius * 0.88);
      dummy.updateMatrix();
      clarifierBridgeMesh.setMatrixAt(cIdx * 2, dummy.matrix);

      // 桁架安全栏杆上弦杆
      dummy.position.set(
        cx + Math.sin(bridgeAngle) * armCenterR,
        3.15,
        cz + Math.cos(bridgeAngle) * armCenterR,
      );
      dummy.scale.set(1.12, 0.1, tankRadius * 0.86);
      dummy.updateMatrix();
      clarifierBridgeMesh.setMatrixAt(cIdx * 2 + 1, dummy.matrix);
    });

    // 3. 发电厂两座双曲线冷却塔顶部白色水蒸气云柱翻涌升腾
    coolingTowers.forEach(([tx, tz], tIdx) => {
      for (let p = 0; p < 10; p++) {
        const progress = THREE.MathUtils.euclideanModulo(seconds * 0.16 + p / 10 + tIdx * 0.37, 1);
        const driftX = tx + progress * 8.5 + Math.sin(progress * 5.2 + p) * 1.4;
        const driftZ = tz - progress * 4.2 + Math.cos(progress * 4.6 + p) * 1.4;
        const py = 33.2 + progress * 24.0;
        const radius = (2.6 + progress * 4.8) * (1 - progress * 0.38);
        dummy.position.set(driftX, py, driftZ);
        dummy.rotation.set(seconds * 0.35 + p, seconds * 0.25, 0);
        dummy.scale.set(radius, radius * 0.72, radius);
        dummy.updateMatrix();
        coolingSteamMesh.setMatrixAt(tIdx * 10 + p, dummy.matrix);
      }
    });

    // 4. 生物曝气池水面微气泡翻滚水花 + 入海明渠清波
    aerationZs.forEach((az, aIdx) => {
      for (let b = 0; b < 10; b++) {
        const pulse = 0.65 + 0.45 * Math.sin(seconds * 4.6 + b * 1.7 + aIdx * 2.1);
        const bxPos = 278.5 + (b % 5) * 3.8 + Math.sin(seconds * 1.8 + b) * 0.28;
        const bzPos = az + (b < 5 ? -2.3 : 2.3) + Math.cos(seconds * 2.1 + b) * 0.24;
        dummy.position.set(bxPos, 2.12 + pulse * 0.08, bzPos);
        dummy.rotation.set(0, seconds + b, 0);
        dummy.scale.set(0.58 * pulse, 0.14 * pulse, 0.58 * pulse);
        dummy.updateMatrix();
        aerationBubbleMesh.setMatrixAt(aIdx * 10 + b, dummy.matrix);
      }
    });

    dynamicUtilityMeshes.forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
    });
  };

  animate(0);

  return {
    animate,
    powerPlantCenter: { x: ppX, z: ppZ },
    wastewaterCenter: { x: wwX, z: wwZ },
    windTurbineCount: windTurbines.length,
    clarifierCount: clarifierCenters.length,
  };
}
