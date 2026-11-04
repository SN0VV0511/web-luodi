import * as THREE from "three";
import type { FloorInteriorContext } from "./archive-tower-interiors";

export type SuperstructureRig = {
  update: (worldTime: number, isSelected: boolean) => void;
};

/**
 * 构建 08号楼 · 技术手稿馆 的高精度 3D 建筑外部重型钢结构、首层门廊雨棚与屋顶机电停机坪
 * - 阶梯式迎宾石材基座 + 不锈钢路桩 + 悬挑拉索玻璃雨棚
 * - 四角重型工字钢巨柱 + 侧面与背面交叉斜撑钢桁架 (Diagrid X-Bracing)
 * - 屋顶停机坪 (发光 H 标与助航灯) + 旋转 3D 雷达抛物面天线 + 双组旋转散热风扇机组 + 太阳能光伏阵列 + 航空障碍灯塔尖
 */
export function buildTowerSuperstructure3D(
  group: THREE.Group,
  ctx: FloorInteriorContext,
): SuperstructureRig {
  const structGroup = new THREE.Group();
  group.add(structGroup);

  const centerX = 1.6;
  const centerZ = 1.2;
  const spanW = 16.8;
  const spanD = 12.8;
  const roofY = 30.2;

  // 1. 首层三级阶梯式石材广场基座与发光迎宾踏步灯带
  for (let step = 0; step < 3; step++) {
    const sw = 21.8 - step * 0.9;
    const sd = 19.2 - step * 0.9;
    const sy = 0.22 + step * 0.24;
    const stepSlab = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
    stepSlab.scale.set(sw, 0.24, sd);
    stepSlab.position.set(0, sy, 0.6);
    stepSlab.receiveShadow = true;
    ctx.tagPickable(stepSlab, 0);
    structGroup.add(stepSlab);

    if (step === 1) {
      const stepGlow = new THREE.Mesh(ctx.unitBox, ctx.cyanGlowMat);
      stepGlow.scale.set(sw + 0.08, 0.06, sd + 0.08);
      stepGlow.position.set(0, sy + 0.08, 0.6);
      structGroup.add(stepGlow);
    }
  }

  // 前广场不锈钢发光路桩 (Perimeter Bollards)
  for (let bx = -9.2; bx <= 9.2; bx += 3.07) {
    const bollard = new THREE.Mesh(ctx.unitCyl, ctx.brushedSteelMat);
    bollard.scale.set(0.11, 0.85, 0.11);
    bollard.position.set(bx, 1.05, 9.6);
    structGroup.add(bollard);

    const cap = new THREE.Mesh(ctx.unitCyl, ctx.goldGlowMat);
    cap.scale.set(0.12, 0.14, 0.12);
    cap.position.set(bx, 1.5, 9.6);
    structGroup.add(cap);
  }

  // 首层前向悬挑斜拉索玻璃迎宾雨棚 (Cantilevered Entrance Canopy)
  const canopyZ = centerZ + spanD / 2 + 1.85;
  const canopyFrame = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
  canopyFrame.scale.set(9.6, 0.22, 3.2);
  canopyFrame.position.set(centerX + 1.2, 2.15, canopyZ);
  ctx.tagPickable(canopyFrame, 0);
  structGroup.add(canopyFrame);

  const canopyGlass = new THREE.Mesh(ctx.unitBox, ctx.glassMat);
  canopyGlass.scale.set(9.2, 0.08, 2.9);
  canopyGlass.position.set(centerX + 1.2, 2.28, canopyZ);
  structGroup.add(canopyGlass);

  for (const rodX of [centerX - 2.8, centerX + 1.2, centerX + 5.2]) {
    ctx.makeBeam(
      structGroup,
      new THREE.Vector3(rodX, 4.6, centerZ + spanD / 2 - 0.1),
      new THREE.Vector3(rodX, 2.25, canopyZ + 1.35),
      0.045,
      ctx.brushedSteelMat,
    );
  }

  // 2. 四角重型工字钢巨柱 (Mega-Columns) 与柱间节点环箍
  const corners = [
    [centerX - spanW / 2, centerZ - spanD / 2],
    [centerX + spanW / 2, centerZ - spanD / 2],
    [centerX - spanW / 2, centerZ + spanD / 2],
    [centerX + spanW / 2, centerZ + spanD / 2],
  ] as const;

  for (const [cx, cz] of corners) {
    const colCore = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
    colCore.scale.set(0.68, roofY, 0.68);
    colCore.position.set(cx, roofY / 2, cz);
    colCore.castShadow = true;
    ctx.tagPickable(colCore);
    structGroup.add(colCore);

    const flangeA = new THREE.Mesh(ctx.unitBox, ctx.brushedSteelMat);
    flangeA.scale.set(0.84, roofY, 0.18);
    flangeA.position.set(cx, roofY / 2, cz);
    structGroup.add(flangeA);

    const flangeB = new THREE.Mesh(ctx.unitBox, ctx.brushedSteelMat);
    flangeB.scale.set(0.18, roofY, 0.84);
    flangeB.position.set(cx, roofY / 2, cz);
    structGroup.add(flangeB);

    // 每隔 3.8m 一道结构铆接环抱箍
    for (let ry = 3.2; ry < roofY; ry += 3.8) {
      const collar = new THREE.Mesh(ctx.unitBox, ctx.goldGlowMat);
      collar.scale.set(0.92, 0.16, 0.92);
      collar.position.set(cx, ry, cz);
      structGroup.add(collar);
    }
  }

  // 3. 右侧面与北立面外露交叉钢桁架 (Diagrid X-Bracing)
  const rightX = centerX + spanW / 2;
  const backZ = centerZ - spanD / 2;
  const tiers = [
    [1.8, 10.6],
    [10.6, 19.8],
    [19.8, 29.2],
  ] as const;

  for (const [y0, y1] of tiers) {
    // 右侧立面 X 交叉圆钢斜撑
    ctx.makeBeam(
      structGroup,
      new THREE.Vector3(rightX, y0, centerZ - spanD / 2 + 0.3),
      new THREE.Vector3(rightX, y1, centerZ + spanD / 2 - 0.3),
      0.14,
      ctx.brushedSteelMat,
    );
    ctx.makeBeam(
      structGroup,
      new THREE.Vector3(rightX, y0, centerZ + spanD / 2 - 0.3),
      new THREE.Vector3(rightX, y1, centerZ - spanD / 2 + 0.3),
      0.14,
      ctx.brushedSteelMat,
    );

    // 背立面双跨 X 交叉斜撑
    for (const half of [-1, 1]) {
      const xStart = half < 0 ? centerX - spanW / 2 + 0.3 : centerX;
      const xEnd = half < 0 ? centerX : centerX + spanW / 2 - 0.3;
      ctx.makeBeam(
        structGroup,
        new THREE.Vector3(xStart, y0, backZ),
        new THREE.Vector3(xEnd, y1, backZ),
        0.13,
        ctx.brushedSteelMat,
      );
      ctx.makeBeam(
        structGroup,
        new THREE.Vector3(xEnd, y0, backZ),
        new THREE.Vector3(xStart, y1, backZ),
        0.13,
        ctx.brushedSteelMat,
      );
    }
  }

  // 背立面中央垂直发光能源主干道 (Vertical Energy Spine)
  for (const sx of [-1.2, 0, 1.2]) {
    const spinePipe = new THREE.Mesh(
      ctx.unitCyl,
      sx === 0 ? ctx.cyanGlowMat : ctx.blueGlowMat,
    );
    spinePipe.scale.set(0.11, roofY - 2, 0.11);
    spinePipe.position.set(centerX + sx, roofY / 2, backZ - 0.28);
    structGroup.add(spinePipe);
  }

  // 4. 屋顶综合机电甲板、直升机停机坪、太阳能阵列、旋转雷达与双冷却塔
  const roofDeck = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
  roofDeck.scale.set(spanW + 1.0, 0.75, spanD + 1.0);
  roofDeck.position.set(centerX, roofY + 0.35, centerZ);
  roofDeck.castShadow = true;
  roofDeck.receiveShadow = true;
  ctx.tagPickable(roofDeck, 1);
  structGroup.add(roofDeck);

  const roofRimGlow = new THREE.Mesh(ctx.unitBox, ctx.cyanGlowMat);
  roofRimGlow.scale.set(spanW + 1.25, 0.16, spanD + 1.25);
  roofRimGlow.position.set(centerX, roofY + 0.78, centerZ);
  structGroup.add(roofRimGlow);

  // 屋顶玻璃护栏
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(ctx.unitBox, ctx.glassMat);
    rail.scale.set(spanW + 0.4, 0.85, 0.08);
    rail.position.set(centerX, roofY + 1.15, centerZ + sz * (spanD / 2 + 0.25));
    structGroup.add(rail);
  }

  // 屋顶右侧：发光直升机停机坪 (Helipad with H Mark)
  const helipadX = centerX + 3.6;
  const helipadZ = centerZ + 1.1;
  const helipadDisc = new THREE.Mesh(ctx.unitCyl, ctx.darkSteelMat);
  helipadDisc.scale.set(3.4, 0.22, 3.4);
  helipadDisc.position.set(helipadX, roofY + 0.85, helipadZ);
  ctx.tagPickable(helipadDisc, 1);
  structGroup.add(helipadDisc);

  const helipadRing = new THREE.Mesh(ctx.unitTorus, ctx.goldGlowMat);
  helipadRing.rotation.x = Math.PI / 2;
  helipadRing.scale.set(3.05, 3.05, 0.75);
  helipadRing.position.set(helipadX, roofY + 0.98, helipadZ);
  structGroup.add(helipadRing);

  // H 字母 3D 标识
  for (const hx of [-0.75, 0.75]) {
    const hLeg = new THREE.Mesh(ctx.unitBox, ctx.cyanGlowMat);
    hLeg.scale.set(0.32, 0.08, 1.9);
    hLeg.position.set(helipadX + hx, roofY + 0.98, helipadZ);
    structGroup.add(hLeg);
  }
  const hCross = new THREE.Mesh(ctx.unitBox, ctx.cyanGlowMat);
  hCross.scale.set(1.5, 0.08, 0.32);
  hCross.position.set(helipadX, roofY + 0.98, helipadZ);
  structGroup.add(hCross);

  // 屋顶后排：4 块倾角光伏阵列板 (Solar Array)
  for (let s = 0; s < 4; s++) {
    const panel = new THREE.Mesh(ctx.unitBox, ctx.blueGlowMat);
    panel.scale.set(1.9, 0.08, 1.35);
    panel.position.set(centerX - 5.2 + s * 2.25, roofY + 1.35, centerZ - 4.2);
    panel.rotation.x = 0.42;
    structGroup.add(panel);
  }

  // 屋顶左侧：双组工业级 HVAC 液冷散热风机组 (带旋转扇叶)
  const hvacFans: THREE.Group[] = [];
  for (let f = 0; f < 2; f++) {
    const fx = centerX - 4.4 + f * 3.1;
    const fz = centerZ + 1.4;
    const housing = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
    housing.scale.set(2.4, 1.45, 2.4);
    housing.position.set(fx, roofY + 1.45, fz);
    ctx.tagPickable(housing, 1);
    structGroup.add(housing);

    const shroud = new THREE.Mesh(ctx.unitTorus, ctx.brushedSteelMat);
    shroud.rotation.x = Math.PI / 2;
    shroud.scale.set(0.88, 0.88, 1.2);
    shroud.position.set(fx, roofY + 2.22, fz);
    structGroup.add(shroud);

    const rotor = new THREE.Group();
    rotor.position.set(fx, roofY + 2.2, fz);
    for (let b = 0; b < 4; b++) {
      const blade = new THREE.Mesh(ctx.unitBox, ctx.brushedSteelMat);
      blade.scale.set(1.55, 0.06, 0.24);
      blade.rotation.y = (b * Math.PI) / 4;
      blade.rotation.x = 0.25;
      rotor.add(blade);
    }
    structGroup.add(rotor);
    hvacFans.push(rotor);
  }

  // 屋顶右后角：3D 旋转卫星雷达天线塔与航空闪光信标灯
  const radarPedestal = new THREE.Mesh(ctx.unitCyl, ctx.brushedSteelMat);
  radarPedestal.scale.set(0.45, 1.8, 0.45);
  radarPedestal.position.set(centerX + 5.8, roofY + 1.6, centerZ - 3.8);
  structGroup.add(radarPedestal);

  const radarHead = new THREE.Group();
  radarHead.position.set(centerX + 5.8, roofY + 2.75, centerZ - 3.8);
  structGroup.add(radarHead);

  const dishRing = new THREE.Mesh(ctx.unitTorus, ctx.goldGlowMat);
  dishRing.scale.set(1.15, 1.15, 0.8);
  dishRing.rotation.x = -0.45;
  radarHead.add(dishRing);

  const dishFeed = new THREE.Mesh(ctx.unitCyl, ctx.cyanGlowMat);
  dishFeed.scale.set(0.08, 1.1, 0.08);
  dishFeed.rotation.x = Math.PI / 2 - 0.45;
  dishFeed.position.set(0, 0.25, 0.45);
  radarHead.add(dishFeed);

  // 超高通信桁架尖塔与顶部脉冲信标球
  const spireX = centerX - 6.4;
  const spireZ = centerZ - 4.4;
  const spireMast = new THREE.Mesh(ctx.unitCyl, ctx.brushedSteelMat);
  spireMast.scale.set(0.14, 6.2, 0.14);
  spireMast.position.set(spireX, roofY + 3.8, spireZ);
  structGroup.add(spireMast);

  const beaconOrb = new THREE.Mesh(ctx.unitSphere, ctx.goldGlowMat);
  beaconOrb.scale.setScalar(0.32);
  beaconOrb.position.set(spireX, roofY + 7.0, spireZ);
  structGroup.add(beaconOrb);

  return {
    update(worldTime: number, isSelected: boolean) {
      const mult = isSelected ? 1.8 : 0.9;
      radarHead.rotation.y = worldTime * 0.95 * mult;
      for (let i = 0; i < hvacFans.length; i++) {
        hvacFans[i]!.rotation.y = worldTime * (i === 0 ? 5.5 : -6.2) * mult;
      }
      const pulse = 0.82 + Math.sin(worldTime * 4.5) * 0.28;
      beaconOrb.scale.setScalar(0.28 * pulse);
    },
  };
}
