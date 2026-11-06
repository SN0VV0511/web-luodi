import * as THREE from "three";
import type { CivicKit } from "./city-civic";

export type CruiseShipLiveState = {
  x: number;
  z: number;
  heading: number;
  speedKnots: number;
  status: "approaching" | "berthed" | "departing" | "cruising";
};

export type CruiseHarborHandle = {
  animate: (seconds: number) => void;
  getShipState: (seconds: number) => CruiseShipLiveState;
  terminalCenter: { x: number; z: number };
};

const CRUISE_CYCLE_SECONDS = 120;

const CRUISE_WAYPOINTS: readonly [number, number][] = [
  [-330, 266],
  [-215, 232],
  [-92, 202],
  [-12, 195],
  [48, 195], // 现代国际邮轮母港深水泊位 (Cruise Terminal Berth)
  [106, 204],
  [136, 238],
  [104, 278],
  [-20, 292],
  [-195, 286],
];

let cachedCruiseCurve: THREE.CatmullRomCurve3 | null = null;
let cachedBerthU = 0.4;

function getCruiseCurve(): { curve: THREE.CatmullRomCurve3; berthU: number } {
  if (!cachedCruiseCurve) {
    cachedCruiseCurve = new THREE.CatmullRomCurve3(
      CRUISE_WAYPOINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "centripetal",
      0.45,
    );
    let bestU = 0.4;
    let bestDist = Infinity;
    for (let i = 0; i <= 2000; i++) {
      const candidateU = i / 2000;
      const pt = cachedCruiseCurve.getPointAt(candidateU);
      const dist = Math.hypot(pt.x - 48, pt.z - 195);
      if (dist < bestDist) {
        bestDist = dist;
        bestU = candidateU;
      }
    }
    cachedBerthU = bestU;
  }
  return { curve: cachedCruiseCurve, berthU: cachedBerthU };
}

/**
 * 将周期时间映射为航线曲线参数 u (0..1)：
 * 在邮轮母港泊位处平滑减速停靠接客，随后鸣笛启航驶向外海，全程保持连续可导与确定性。
 */
export function sampleCruiseVoyage(seconds: number): CruiseShipLiveState {
  const { curve, berthU } = getCruiseCurve();
  const phase = THREE.MathUtils.euclideanModulo(seconds, CRUISE_CYCLE_SECONDS) / CRUISE_CYCLE_SECONDS;

  // 分段平滑航程映射：0..0.28 进港减速 -> 0.28..0.46 靠泊母港微幅慢移 -> 0.46..1.0 离港巡航
  let u: number;
  let speedFactor: number;
  let status: CruiseShipLiveState["status"];

  if (phase < 0.28) {
    const t = phase / 0.28;
    const eased = 1 - Math.pow(1 - t, 1.65);
    u = THREE.MathUtils.lerp(0.0, berthU - 0.0006, eased);
    speedFactor = THREE.MathUtils.lerp(1.0, 0.16, t);
    status = t > 0.62 ? "approaching" : "cruising";
  } else if (phase < 0.46) {
    const t = (phase - 0.28) / 0.18;
    const smooth = t * t * (3 - 2 * t);
    u = THREE.MathUtils.lerp(berthU - 0.0006, berthU + 0.0006, smooth);
    speedFactor = 0.04;
    status = "berthed";
  } else {
    const t = (phase - 0.46) / 0.54;
    const eased = Math.pow(t, 1.35);
    u = THREE.MathUtils.lerp(berthU + 0.0006, 1.0, eased);
    speedFactor = THREE.MathUtils.lerp(0.18, 1.0, Math.min(1, t * 2.2));
    status = t < 0.28 ? "departing" : "cruising";
  }

  const wrappedU = THREE.MathUtils.euclideanModulo(u, 1);
  const pos = curve.getPointAt(wrappedU);
  const tangent = curve.getTangentAt(wrappedU);
  const heading = Math.atan2(tangent.x, tangent.z);

  return {
    x: pos.x,
    z: pos.z,
    heading,
    speedKnots: +(speedFactor * 18.4).toFixed(1),
    status,
  };
}

/**
 * 构建现代国际邮轮母港客运中心 (x=48, z=114..183) 与 8 层甲板豪华海上度假游轮「MS SN0VV ODYSSEY」。
 * 独立于 buildCityCoast 调用，确保原有海岸货轮测试契约 100% 不变。
 */
export function buildCityCruiseHarbor(kit: CivicKit): CruiseHarborHandle {
  const { group, geometries, materials, nightMaterials, box, part, beam, solid, canvasTexture } = kit;

  const regGeo = <T extends THREE.BufferGeometry>(geo: T): T => {
    geometries.add(geo);
    return geo;
  };

  const cube = regGeo(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = regGeo(new THREE.CylinderGeometry(1, 1, 1, 20));
  const sphere = regGeo(new THREE.SphereGeometry(1, 16, 12));
  const cone = regGeo(new THREE.ConeGeometry(1, 1, 14));
  const archVault = regGeo(new THREE.CylinderGeometry(1, 1, 1, 24, 1, false, 0, Math.PI));
  archVault.rotateZ(Math.PI / 2);
  archVault.rotateY(Math.PI / 2);

  // 材质定义
  const hullWhite = solid("#f6f7f4", 0.28, 0.14);
  const hullNavy = solid("#17324d", 0.34, 0.28);
  const antifoulingRed = solid("#8f2d28", 0.56, 0.12);
  const royalGold = solid("#dcb164", 0.32, 0.56);
  const royalBlue = solid("#1e5b8a", 0.32, 0.36);
  const teakWood = solid("#a6784e", 0.68, 0.05);
  const pierConcrete = solid("#bebcb0", 0.8, 0.04);
  const pierDark = solid("#313a40", 0.72, 0.16);
  const steelSilver = solid("#b9c3c8", 0.28, 0.68);
  const lifeboatOrange = solid("#e8662c", 0.38, 0.14);
  const slideCoral = solid("#eb5e55", 0.28, 0.18);
  const slideCyan = solid("#24a8c8", 0.26, 0.2);

  const terminalGlass = solid("#2e6178", 0.16, 0.52);
  terminalGlass.emissive.set("#ffe2ad");
  nightMaterials.push({ material: terminalGlass, day: 0.08, night: 1.42 });

  const cabinWindowMat = solid("#2a546c", 0.18, 0.44);
  cabinWindowMat.emissive.set("#ffd99e");
  nightMaterials.push({ material: cabinWindowMat, day: 0.12, night: 1.85 });

  const lidoPoolMat = solid("#1cc5d8", 0.08, 0.22);
  lidoPoolMat.emissive.set("#28e0f2");
  nightMaterials.push({ material: lidoPoolMat, day: 0.28, night: 1.65 });

  const deckBeacon = solid("#fff2cf", 0.25, 0.08);
  deckBeacon.emissive.set("#ffd17c");
  nightMaterials.push({ material: deckBeacon, day: 0.25, night: 3.4 });

  // ============================================================================
  // 1. 现代海浪拱壳国际邮轮客运母港 (SN0VV CRUISE TERMINAL, x=48, z=114..183)
  // ============================================================================
  const tx = 48;
  // 引桥广场与深水高桩混凝土客运突堤码头 (z=113..183)
  box(pierConcrete, tx, 0.32, 132, 36, 1.35, 38);
  box(pierConcrete, tx, 0.32, 166.5, 22, 1.35, 33);
  // 码头水下承重钢管桩群
  for (const px of [tx - 9.2, tx, tx + 9.2]) {
    for (let pz = 122; pz <= 180; pz += 11) {
      part(pierDark, cylinder, px, -1.1, pz, 0.45, 2.8, 0.45);
    }
  }
  // 泊位前沿黑色橡胶防撞护舷与黄色系船柱 (z=183)
  for (let bxPos = tx - 9; bxPos <= tx + 9; bxPos += 4.5) {
    box(royalGold, bxPos, 1.18, 182.2, 0.48, 0.45, 0.48);
    part(pierDark, cylinder, bxPos, 0.45, 183.15, 0.58, 0.85, 0.58, undefined, 0, Math.PI / 2);
  }

  // 客运航站楼主体（三连跨白色海浪流线型拱顶 + 全景蓝玻幕墙 + 二层观海送客平台）
  box(pierConcrete, tx, 2.85, 131, 30, 3.8, 22);
  box(terminalGlass, tx, 3.1, 120.0, 26.8, 4.2, 0.2);
  box(terminalGlass, tx, 3.1, 142.0, 26.8, 4.2, 0.2);
  box(terminalGlass, tx - 15.05, 3.1, 131, 0.2, 4.2, 18.8);
  box(terminalGlass, tx + 15.05, 3.1, 131, 0.2, 4.2, 18.8);

  // 三跨白色海浪薄壳拱顶
  for (const vaultOffset of [-9.6, 0, 9.6]) {
    part(hullWhite, archVault, tx + vaultOffset, 5.1, 131, 5.2, 2.85, 25.4);
    box(royalBlue, tx + vaultOffset, 5.15, 131, 10.1, 0.22, 25.8);
  }
  // 二层观海迎宾露台与玻璃栏杆
  box(teakWood, tx, 4.85, 146.5, 24, 0.22, 7.6);
  box(terminalGlass, tx, 5.42, 150.2, 23.8, 0.92, 0.08);

  // 航站楼门头标识牌
  const terminalSignTex = canvasTexture(1024, 160, (ctx) => {
    ctx.fillStyle = "#102840";
    ctx.fillRect(0, 0, 1024, 160);
    ctx.strokeStyle = "#dcb164";
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, 1000, 136);
    ctx.fillStyle = "#dcb164";
    ctx.font = "700 22px monospace";
    ctx.textAlign = "left";
    ctx.fillText("PORT OF SN0VV · BERTH 01", 42, 52);
    ctx.textAlign = "right";
    ctx.fillText("INTERNATIONAL PASSENGER PIER", 982, 52);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 56px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("OCEAN CRUISE TERMINAL", 512, 122);
  });
  terminalSignTex.wrapS = terminalSignTex.wrapT = THREE.ClampToEdgeWrapping;
  const terminalSignMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: terminalSignTex,
    emissiveMap: terminalSignTex,
    emissive: "#ffffff",
    emissiveIntensity: 0.24,
    roughness: 0.35,
  });
  materials.add(terminalSignMat);
  nightMaterials.push({ material: terminalSignMat, day: 0.24, night: 1.25 });
  box(terminalSignMat, tx, 6.25, 118.2, 21.5, 2.4, 0.28);

  // 封闭式全玻璃伸缩登船廊桥 (SkyBridge Gangway, 悬挑伸向 z=181 邮轮舷门高度 y=6.8m)
  for (const pyZ of [154, 168, 178]) {
    box(steelSilver, tx + 6.4, 3.9, pyZ, 1.1, 6.2, 1.1);
  }
  box(steelSilver, tx + 6.4, 6.85, 162, 2.8, 0.32, 38);
  box(terminalGlass, tx + 6.4, 7.95, 162, 2.55, 2.1, 37.6);
  box(hullWhite, tx + 6.4, 9.1, 162, 2.95, 0.24, 38.2);
  // 登船口缓冲接驳舱
  box(royalBlue, tx + 6.4, 7.85, 181.6, 3.1, 2.4, 2.2);
  box(deckBeacon, tx + 6.4, 9.25, 182.6, 1.4, 0.2, 0.2);

  // 码头迎宾观光大巴停靠位
  kit.vehicle("bus", royalBlue, tx - 10.5, 116.5);

  // ============================================================================
  // 2. 8 层甲板豪华邮轮「MS SN0VV ODYSSEY」(104m × 18.4m × 25.5m)
  //    船头朝向 +Z，绕自身中心局部建模后按航向实时变换
  // ============================================================================
  const cruiseShip = new THREE.Group();
  cruiseShip.name = "LuxuryCruiseLiner_Odyssey";
  const shipLength = 104;
  const shipWidth = 18.4;

  // 船体流线型外飘球鼻艏轮廓 (z 为纵向: +length/2 为船首，-length/2 为船尾)
  const hullShape = new THREE.Shape();
  const hw = shipWidth * 0.5;
  const hl = shipLength * 0.5;
  hullShape.moveTo(-hw * 0.88, -hl * 0.92);
  hullShape.quadraticCurveTo(0, -hl * 1.0, hw * 0.88, -hl * 0.92);
  hullShape.lineTo(hw, hl * 0.26);
  hullShape.quadraticCurveTo(hw * 0.86, hl * 0.72, 0, hl);
  hullShape.quadraticCurveTo(-hw * 0.86, hl * 0.72, -hw, hl * 0.26);
  hullShape.closePath();

  const hullExtrude = regGeo(
    new THREE.ExtrudeGeometry(hullShape, {
      depth: 6.8,
      bevelEnabled: true,
      bevelSize: 0.55,
      bevelThickness: 0.6,
      bevelSegments: 2,
      steps: 1,
    }),
  );
  // rotateX(PI/2) 使 Shape 的 +Y 映射到世界局部 +Z（船首方向），挤出深度沿 -Y 向下，因此上调 y=+4.6
  hullExtrude.rotateX(Math.PI / 2);
  const mainHullMesh = new THREE.Mesh(hullExtrude, hullWhite);
  mainHullMesh.position.y = 4.8;
  mainHullMesh.castShadow = true;
  mainHullMesh.receiveShadow = true;
  cruiseShip.add(mainHullMesh);

  // 使用材质分组合并船上数百个阳台、救生艇、泳池、滑水道与烟囱构件，仅产生约 10 个 Draw Call！
  const shipBatches = new Map<THREE.Material, THREE.Matrix4[]>();
  const partTransform = new THREE.Object3D();
  const addShipBox = (
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    partTransform.position.set(x, y, z);
    partTransform.rotation.set(rx, ry, rz);
    partTransform.scale.set(w, h, d);
    partTransform.updateMatrix();
    const list = shipBatches.get(mat) ?? [];
    list.push(partTransform.matrix.clone());
    shipBatches.set(mat, list);
  };

  // 水线深海蓝涂装带、防污红底与香槟金舷侧腰线
  addShipBox(antifoulingRed, 0, 0.2, -2, shipWidth * 0.92, 1.2, shipLength * 0.84);
  addShipBox(hullNavy, 0, 1.55, -1, shipWidth * 0.98, 1.85, shipLength * 0.86);
  addShipBox(royalGold, 0, 4.95, 0, shipWidth * 1.03, 0.24, shipLength * 0.88);
  // 前甲板柚木锚泊区
  addShipBox(teakWood, 0, 5.45, hl * 0.68, shipWidth * 0.62, 0.18, 22);

  // 逐层退台客舱甲板 (Decks 5..10, 共 6 层全海景阳台房上层建筑)
  for (let deck = 0; deck < 6; deck++) {
    const dy = 6.3 + deck * 2.35;
    const deckW = shipWidth * (0.94 - deck * 0.022);
    const foreZ = hl * (0.48 - deck * 0.035);
    const aftZ = -hl * (0.86 - deck * 0.035);
    const deckLen = foreZ - aftZ;
    const centerZ = (foreZ + aftZ) * 0.5;

    // 白色甲板层主体与夜间发光海景落地窗芯
    addShipBox(hullWhite, 0, dy, centerZ, deckW - 1.2, 0.42, deckLen);
    addShipBox(cabinWindowMat, 0, dy + 1.15, centerZ, deckW - 1.5, 1.88, deckLen - 1.6);
    addShipBox(hullWhite, 0, dy + 2.18, centerZ, deckW + 0.15, 0.28, deckLen + 0.5);

    // 左右两舷海景玻璃阳台隔板与蓝色玻璃栏板（营造极高细节密度）
    for (const side of [-1, 1]) {
      const balX = side * (deckW * 0.5);
      addShipBox(terminalGlass, balX, dy + 0.72, centerZ, 0.08, 0.96, deckLen - 2.0);
      for (let bz = aftZ + 2.5; bz <= foreZ - 2.5; bz += 4.2) {
        addShipBox(hullWhite, side * (deckW * 0.5 - 0.35), dy + 1.15, bz, 0.72, 1.95, 0.12);
      }
    }

    // 船尾层叠观海阳光退台甲板
    addShipBox(teakWood, 0, dy + 0.24, aftZ - 1.4, deckW * 0.84, 0.14, 2.8);
    addShipBox(terminalGlass, 0, dy + 0.78, aftZ - 2.75, deckW * 0.82, 0.92, 0.08);
  }

  // 第 5 层救生甲板两侧悬挂 8 艘亮橙色全封闭救生艇 (Lifeboats in Davits)
  for (const side of [-1, 1]) {
    for (const lz of [-24, -10, 4, 18]) {
      addShipBox(lifeboatOrange, side * (shipWidth * 0.49), 7.6, lz, 2.1, 1.55, 8.6);
      addShipBox(hullWhite, side * (shipWidth * 0.49), 8.25, lz, 1.85, 0.55, 7.8);
      addShipBox(steelSilver, side * (shipWidth * 0.46), 8.9, lz - 3.2, 0.6, 1.8, 0.22);
      addShipBox(steelSilver, side * (shipWidth * 0.46), 8.9, lz + 3.2, 0.6, 1.8, 0.22);
    }
  }

  // 全景飞翼船长驾驶台 (Navigation Bridge Wing, Deck 10 Forward, y=18.2, z=+21.5)
  const bridgeY = 18.2;
  const bridgeZ = 21.5;
  addShipBox(hullWhite, 0, bridgeY, bridgeZ, shipWidth + 4.4, 2.5, 5.2);
  addShipBox(terminalGlass, 0, bridgeY + 0.25, bridgeZ + 2.65, shipWidth + 3.8, 1.45, 0.22, -0.18, 0, 0);
  addShipBox(hullWhite, 0, bridgeY + 1.45, bridgeZ + 0.3, shipWidth + 4.8, 0.36, 5.8);
  // 前方全景球鼻观景酒廊 (Observation Lounge)
  addShipBox(terminalGlass, 0, 15.8, 25.5, shipWidth * 0.76, 2.1, 6.4);
  addShipBox(hullWhite, 0, 17.0, 25.5, shipWidth * 0.8, 0.35, 6.8);

  // 顶层 Lido 阳光度假水上乐园甲板 (y = 20.4)
  const lidoY = 20.45;
  addShipBox(teakWood, 0, lidoY, -4, shipWidth * 0.84, 0.24, 68);
  addShipBox(terminalGlass, -shipWidth * 0.42, lidoY + 0.8, -4, 0.08, 1.35, 66);
  addShipBox(terminalGlass, shipWidth * 0.42, lidoY + 0.8, -4, 0.08, 1.35, 66);

  // 2 座碧蓝发光露天泳池 + 2 座温泉按摩池 + 20 张度假躺椅
  for (const poolZ of [8.5, -10.5]) {
    addShipBox(hullWhite, 0, lidoY + 0.32, poolZ, 7.6, 0.45, 11.2);
    addShipBox(lidoPoolMat, 0, lidoY + 0.58, poolZ, 6.2, 0.14, 9.6);
    for (const side of [-1, 1]) {
      for (let c = -3.6; c <= 3.6; c += 1.8) {
        addShipBox(hullWhite, side * 5.1, lidoY + 0.34, poolZ + c, 0.85, 0.18, 1.45);
      }
    }
  }
  // 露天巨幕星空影院屏
  addShipBox(pierDark, 0, lidoY + 2.9, 16.2, 6.8, 3.8, 0.35);
  addShipBox(lidoPoolMat, 0, lidoY + 2.9, 16.0, 6.1, 3.1, 0.08);

  // 双座后掠流线型皇家蓝金豪华大烟囱 (Twin Raked Funnels)
  for (const [fz, scaleF] of [
    [-2.0, 1.0],
    [-21.5, 0.88],
  ] as const) {
    addShipBox(hullWhite, 0, lidoY + 3.4 * scaleF, fz, 4.4 * scaleF, 6.4 * scaleF, 8.2 * scaleF, -0.22, 0, 0);
    addShipBox(royalBlue, 0, lidoY + 5.8 * scaleF, fz - 0.6, 4.6 * scaleF, 2.2 * scaleF, 9.2 * scaleF, -0.22, 0, 0);
    // 烟囱侧翼香槟金飞翼标志与黑色排烟管口
    addShipBox(royalGold, 0, lidoY + 4.8 * scaleF, fz - 0.3, 4.8 * scaleF, 0.38, 9.8 * scaleF, -0.18, 0, 0);
    addShipBox(pierDark, 0, lidoY + 7.1 * scaleF, fz - 1.1, 3.2 * scaleF, 0.65, 5.4 * scaleF, -0.22, 0, 0);
  }

  // 船尾盘旋双色水上乐园滑梯 (Aqua-Loop Water Slides)
  for (let seg = 0; seg < 8; seg++) {
    const angle = (seg / 8) * Math.PI * 1.8;
    const sx = Math.cos(angle) * 3.8;
    const sz = -29.5 + Math.sin(angle) * 3.8;
    const sy = lidoY + 4.8 - seg * 0.52;
    addShipBox(seg % 2 === 0 ? slideCoral : slideCyan, sx, sy, sz, 1.15, 0.55, 2.1, 0.18, angle, 0);
  }
  addShipBox(steelSilver, 0, lidoY + 2.6, -29.5, 0.45, 5.2, 0.45);

  // 雷达桅杆与三座白色卫星通讯天线球罩 (Satcom Radomes)
  addShipBox(steelSilver, 0, lidoY + 4.2, 19.5, 0.38, 8.2, 0.38);
  addShipBox(hullWhite, 0, lidoY + 6.8, 19.5, 4.8, 0.25, 0.45);
  addShipBox(deckBeacon, 0, lidoY + 8.5, 19.5, 0.45, 0.45, 0.45);

  for (const [mat, matrices] of shipBatches) {
    const inst = new THREE.InstancedMesh(cube, mat, matrices.length);
    matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.castShadow = true;
    inst.receiveShadow = true;
    cruiseShip.add(inst);
  }

  // 3 颗圆形卫星雷达罩单独挂在船首顶甲板
  const radomes = new THREE.InstancedMesh(sphere, hullWhite, 3);
  [
    [-3.6, lidoY + 1.6, 20.5, 1.05],
    [3.6, lidoY + 1.6, 20.5, 1.05],
    [0, lidoY + 2.4, 13.5, 1.25],
  ].forEach(([rx, ry, rz, rs], idx) => {
    partTransform.position.set(rx, ry, rz);
    partTransform.rotation.set(0, 0, 0);
    partTransform.scale.setScalar(rs);
    partTransform.updateMatrix();
    radomes.setMatrixAt(idx, partTransform.matrix);
  });
  cruiseShip.add(radomes);
  group.add(cruiseShip);

  // ============================================================================
  // 3. 游轮破浪首波、双螺旋桨尾流白沫与微烟动态批次
  // ============================================================================
  const wakeMat = solid("#eef7f8", 0.45, 0.04);
  const wakeCount = 22;
  const wakeMesh = new THREE.InstancedMesh(sphere, wakeMat, wakeCount);
  wakeMesh.name = "CruiseWake";
  wakeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  wakeMesh.frustumCulled = false;
  group.add(wakeMesh);

  const wakeDummy = new THREE.Object3D();

  const animate = (seconds: number) => {
    const state = sampleCruiseVoyage(seconds);
    const heave = Math.sin(seconds * 0.65) * 0.06;
    const roll = Math.sin(seconds * 0.48) * 0.008;

    cruiseShip.position.set(state.x, -0.65 + heave, state.z);
    cruiseShip.rotation.set(0, state.heading, roll);

    const sinH = Math.sin(state.heading);
    const cosH = Math.cos(state.heading);
    const speedRatio = Math.max(0.12, state.speedKnots / 18.4);

    // 船尾双推进器螺旋桨白色浪花尾迹 (0..13) + 船首破浪八字白沫 (14..21)
    for (let i = 0; i < wakeCount; i++) {
      if (i < 14) {
        const progress = THREE.MathUtils.euclideanModulo(seconds * 0.45 + i / 14, 1);
        const side = i % 2 === 0 ? -1 : 1;
        const localZ = -hl * 0.94 - progress * (38 * speedRatio + 6);
        const localX = side * (3.2 + progress * 6.5);
        const wx = state.x + sinH * localZ + cosH * localX;
        const wz = state.z + cosH * localZ - sinH * localX;
        const scaleXZ = (1.4 + progress * 3.8) * (1 - progress * 0.55) * (0.45 + speedRatio * 0.55);
        wakeDummy.position.set(wx, -0.56, wz);
        wakeDummy.rotation.set(0, state.heading, 0);
        wakeDummy.scale.set(scaleXZ, 0.09, scaleXZ * 1.45);
      } else {
        const bIdx = i - 14;
        const side = bIdx % 2 === 0 ? -1 : 1;
        const step = Math.floor(bIdx / 2) / 4;
        const localZ = hl * 0.92 - step * 22;
        const localX = side * (1.8 + step * 9.6);
        const wx = state.x + sinH * localZ + cosH * localX;
        const wz = state.z + cosH * localZ - sinH * localX;
        const pulse = (0.9 + 0.25 * Math.sin(seconds * 4 + bIdx)) * speedRatio;
        wakeDummy.position.set(wx, -0.55, wz);
        wakeDummy.rotation.set(0, state.heading + side * 0.34, 0);
        wakeDummy.scale.set(1.1 * pulse, 0.1, 3.2 * pulse);
      }
      wakeDummy.updateMatrix();
      wakeMesh.setMatrixAt(i, wakeDummy.matrix);
    }
    wakeMesh.instanceMatrix.needsUpdate = true;
  };

  animate(0);

  return {
    animate,
    getShipState: sampleCruiseVoyage,
    terminalCenter: { x: tx, z: 152 },
  };
}
