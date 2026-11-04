import * as THREE from "three";

export type FloorInteriorContext = {
  unitBox: THREE.BufferGeometry;
  unitCyl: THREE.BufferGeometry;
  unitSphere: THREE.BufferGeometry;
  unitOcta: THREE.BufferGeometry;
  unitTorus: THREE.BufferGeometry;
  darkSteelMat: THREE.MeshStandardMaterial;
  brushedSteelMat: THREE.MeshStandardMaterial;
  deskMat: THREE.MeshStandardMaterial;
  warmWoodMat: THREE.MeshStandardMaterial;
  glassMat: THREE.MeshStandardMaterial;
  cyanGlowMat: THREE.MeshStandardMaterial;
  goldGlowMat: THREE.MeshStandardMaterial;
  blueGlowMat: THREE.MeshStandardMaterial;
  iceCrystalMat: THREE.MeshStandardMaterial;
  tagPickable: (obj: THREE.Object3D, floorIndex?: number, isElevator?: boolean) => void;
  makeBeam: (
    parent: THREE.Object3D,
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    mat: THREE.Material,
  ) => THREE.Mesh;
};

export type FloorInteriorRig = {
  update: (worldTime: number, isActive: boolean) => void;
};

/**
 * 构建带五星脚轮底座、气压杆、坐垫、弧形靠背与双扶手的 3D 人体工学椅
 */
function addErgonomicChair(
  parent: THREE.Object3D,
  ctx: FloorInteriorContext,
  x: number,
  y: number,
  z: number,
  rotY: number,
  floorIdx: number,
) {
  const chair = new THREE.Group();
  chair.position.set(x, y, z);
  chair.rotation.y = rotY;
  parent.add(chair);

  const stem = new THREE.Mesh(ctx.unitCyl, ctx.brushedSteelMat);
  stem.scale.set(0.05, 0.42, 0.05);
  stem.position.set(0, 0.21, 0);
  chair.add(stem);

  for (let leg = 0; leg < 5; leg++) {
    const a = (leg / 5) * Math.PI * 2;
    const legBar = new THREE.Mesh(ctx.unitBox, ctx.brushedSteelMat);
    legBar.scale.set(0.05, 0.04, 0.28);
    legBar.position.set(Math.sin(a) * 0.13, 0.04, Math.cos(a) * 0.13);
    legBar.rotation.y = a;
    chair.add(legBar);
  }

  const seat = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
  seat.scale.set(0.46, 0.07, 0.46);
  seat.position.set(0, 0.44, 0);
  ctx.tagPickable(seat, floorIdx);
  chair.add(seat);

  const back = new THREE.Mesh(ctx.unitBox, ctx.deskMat);
  back.scale.set(0.44, 0.54, 0.07);
  back.position.set(0, 0.74, -0.2);
  back.rotation.x = -0.1;
  ctx.tagPickable(back, floorIdx);
  chair.add(back);

  for (const sx of [-0.24, 0.24]) {
    const arm = new THREE.Mesh(ctx.unitBox, ctx.brushedSteelMat);
    arm.scale.set(0.05, 0.22, 0.28);
    arm.position.set(sx, 0.56, -0.02);
    chair.add(arm);
  }
}

/**
 * 构建 1F (Biglink 财税多智能体指挥中心) 与 2F (LoRA 低秩微调实验室) 的高精度 3D 室内场景
 */
export function buildFloorInterior3D(
  floorIndex: number,
  modGroup: THREE.Group,
  ctx: FloorInteriorContext,
): FloorInteriorRig {
  // 室内吊顶网格梁与六边形悬浮灯环
  for (let gx = -6; gx <= 6; gx += 3) {
    const ceilingBeam = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
    ceilingBeam.scale.set(0.14, 0.22, 11.2);
    ceilingBeam.position.set(gx, 11.1, 0);
    modGroup.add(ceilingBeam);
  }
  for (const lx of [-4.2, 4.2]) {
    const chandelier = new THREE.Mesh(
      ctx.unitTorus,
      floorIndex === 0 ? ctx.cyanGlowMat : ctx.blueGlowMat,
    );
    chandelier.rotation.x = Math.PI / 2;
    chandelier.scale.set(1.35, 1.35, 0.8);
    chandelier.position.set(lx, 10.65, 0.4);
    modGroup.add(chandelier);
  }

  if (floorIndex === 0) {
    // ==================== 1F: BIGLINK 财税多智能体编排中心 ====================
    // 1) 中央双层八角指挥地台与 12 联屏环形控制台
    const daisBottom = new THREE.Mesh(ctx.unitCyl, ctx.darkSteelMat);
    daisBottom.scale.set(3.4, 0.18, 3.4);
    daisBottom.position.set(0, 0.84, 0.5);
    ctx.tagPickable(daisBottom, 0);
    modGroup.add(daisBottom);

    const daisRing = new THREE.Mesh(ctx.unitTorus, ctx.cyanGlowMat);
    daisRing.rotation.x = Math.PI / 2;
    daisRing.scale.set(3.38, 3.38, 0.65);
    daisRing.position.set(0, 0.92, 0.5);
    modGroup.add(daisRing);

    const holoTable = new THREE.Mesh(ctx.unitCyl, ctx.deskMat);
    holoTable.scale.set(2.25, 0.72, 2.25);
    holoTable.position.set(0, 1.28, 0.5);
    ctx.tagPickable(holoTable, 0);
    modGroup.add(holoTable);

    const holoSurface = new THREE.Mesh(ctx.unitCyl, ctx.glassMat);
    holoSurface.scale.set(2.1, 0.06, 2.1);
    holoSurface.position.set(0, 1.68, 0.5);
    modGroup.add(holoSurface);

    // 环形控制台上的 10 块倾斜监控屏
    for (let m = 0; m < 10; m++) {
      const a = (m / 10) * Math.PI * 2;
      const mon = new THREE.Mesh(
        ctx.unitBox,
        m % 3 === 0 ? ctx.goldGlowMat : ctx.cyanGlowMat,
      );
      mon.scale.set(0.42, 0.28, 0.04);
      mon.position.set(Math.cos(a) * 1.92, 1.84, 0.5 + Math.sin(a) * 1.92);
      mon.rotation.y = -a + Math.PI / 2;
      mon.rotation.x = -0.35;
      modGroup.add(mon);
    }

    // 2) 中央三轴陀螺仪万向节 + 6 智能体节点 + 动态数据脉冲球
    const gimbalCenter = new THREE.Vector3(0, 3.65, 0.5);
    const coreOcta = new THREE.Mesh(ctx.unitOcta, ctx.cyanGlowMat);
    coreOcta.scale.set(0.95, 1.25, 0.95);
    coreOcta.position.copy(gimbalCenter);
    ctx.tagPickable(coreOcta, 0);
    modGroup.add(coreOcta);

    const ringX = new THREE.Mesh(ctx.unitTorus, ctx.cyanGlowMat);
    ringX.scale.set(1.55, 1.55, 0.7);
    ringX.position.copy(gimbalCenter);
    modGroup.add(ringX);

    const ringY = new THREE.Mesh(ctx.unitTorus, ctx.goldGlowMat);
    ringY.scale.set(1.85, 1.85, 0.65);
    ringY.position.copy(gimbalCenter);
    modGroup.add(ringY);

    const ringZ = new THREE.Mesh(ctx.unitTorus, ctx.blueGlowMat);
    ringZ.scale.set(2.15, 2.15, 0.6);
    ringZ.position.copy(gimbalCenter);
    modGroup.add(ringZ);

    const agentPods: {
      pod: THREE.Group;
      packet: THREE.Mesh;
      targetPos: THREE.Vector3;
      phase: number;
    }[] = [];

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const tx = Math.cos(angle) * 3.85;
      const ty = 3.55 + (i % 2 === 0 ? 0.45 : -0.35);
      const tz = 0.5 + Math.sin(angle) * 2.95;
      const targetPos = new THREE.Vector3(tx, ty, tz);

      // 连接主核与子智能体的 3D 光导纤维管
      ctx.makeBeam(modGroup, gimbalCenter, targetPos, 0.032, ctx.cyanGlowMat);

      const pod = new THREE.Group();
      pod.position.copy(targetPos);
      modGroup.add(pod);

      const podCore = new THREE.Mesh(
        ctx.unitOcta,
        i % 2 === 0 ? ctx.goldGlowMat : ctx.cyanGlowMat,
      );
      podCore.scale.set(0.36, 0.46, 0.36);
      ctx.tagPickable(podCore, 0);
      pod.add(podCore);

      const podHalo = new THREE.Mesh(ctx.unitTorus, ctx.brushedSteelMat);
      podHalo.rotation.x = Math.PI / 2;
      podHalo.scale.set(0.54, 0.54, 0.6);
      pod.add(podHalo);

      const packet = new THREE.Mesh(ctx.unitSphere, ctx.goldGlowMat);
      packet.scale.setScalar(0.11);
      modGroup.add(packet);

      agentPods.push({ pod, packet, targetPos, phase: i * 0.55 });

      // 地面对应的 6 座弧形双联屏智能体工程师工位 + 3D 人体工学椅
      const wx = Math.cos(angle) * 4.55;
      const wz = 0.5 + Math.sin(angle) * 3.55;
      const rotY = -angle + Math.PI / 2;

      const deskTop = new THREE.Mesh(ctx.unitBox, ctx.deskMat);
      deskTop.scale.set(1.55, 0.08, 0.78);
      deskTop.position.set(wx, 1.48, wz);
      deskTop.rotation.y = rotY;
      ctx.tagPickable(deskTop, 0);
      modGroup.add(deskTop);

      for (const legSide of [-0.65, 0.65]) {
        const leg = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
        leg.scale.set(0.08, 0.72, 0.68);
        leg.position.set(
          wx + Math.cos(rotY) * legSide,
          1.1,
          wz - Math.sin(rotY) * legSide,
        );
        leg.rotation.y = rotY;
        modGroup.add(leg);
      }

      // 双联曲面屏与键盘
      for (const scrSide of [-0.36, 0.36]) {
        const scr = new THREE.Mesh(
          ctx.unitBox,
          scrSide < 0 ? ctx.cyanGlowMat : ctx.blueGlowMat,
        );
        scr.scale.set(0.64, 0.42, 0.04);
        scr.position.set(
          wx + Math.cos(rotY) * scrSide,
          1.82,
          wz - Math.sin(rotY) * scrSide,
        );
        scr.rotation.y = rotY + (scrSide < 0 ? 0.14 : -0.14);
        ctx.tagPickable(scr, 0);
        modGroup.add(scr);
      }

      const chairDist = 0.65;
      addErgonomicChair(
        modGroup,
        ctx,
        wx + Math.sin(rotY) * chairDist,
        0.75,
        wz + Math.cos(rotY) * chairDist,
        rotY + Math.PI,
        0,
      );
    }

    // 3) 右侧：5 组高密度 42U 财税知识图谱服务器机柜 + 顶部走线桥架 + 闪烁刀片灯阵
    const cableTray = new THREE.Mesh(ctx.unitBox, ctx.brushedSteelMat);
    cableTray.scale.set(1.4, 0.12, 8.8);
    cableTray.position.set(6.45, 5.45, -0.2);
    modGroup.add(cableTray);

    for (let r = 0; r < 5; r++) {
      const rz = -3.8 + r * 1.9;
      const rack = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
      rack.scale.set(1.18, 4.4, 1.05);
      rack.position.set(6.55, 2.95, rz);
      ctx.tagPickable(rack, 0);
      modGroup.add(rack);

      const glassDoor = new THREE.Mesh(ctx.unitBox, ctx.glassMat);
      glassDoor.scale.set(0.05, 4.1, 0.92);
      glassDoor.position.set(5.94, 2.95, rz);
      modGroup.add(glassDoor);

      // 机柜内部 6 层服务器刀片与状态灯
      for (let b = 0; b < 6; b++) {
        const bladeLed = new THREE.Mesh(
          ctx.unitBox,
          (r + b) % 3 === 0 ? ctx.goldGlowMat : ctx.cyanGlowMat,
        );
        bladeLed.scale.set(0.06, 0.12, 0.74);
        bladeLed.position.set(5.98, 1.35 + b * 0.6, rz);
        modGroup.add(bladeLed);
      }
    }

    // 4) 左侧：技术手稿典藏书架墙（多层实木隔板 + 彩色立体书脊阵列）与皮质研讨沙龙区
    const shelfFrame = new THREE.Mesh(ctx.unitBox, ctx.warmWoodMat);
    shelfFrame.scale.set(0.75, 4.5, 6.4);
    shelfFrame.position.set(-6.75, 3.0, -0.8);
    ctx.tagPickable(shelfFrame, 0);
    modGroup.add(shelfFrame);

    for (let level = 0; level < 4; level++) {
      const sy = 1.45 + level * 0.95;
      const plank = new THREE.Mesh(ctx.unitBox, ctx.brushedSteelMat);
      plank.scale.set(0.82, 0.08, 6.2);
      plank.position.set(-6.7, sy, -0.8);
      modGroup.add(plank);

      for (let bk = 0; bk < 8; bk++) {
        const book = new THREE.Mesh(
          ctx.unitBox,
          (level + bk) % 3 === 0
            ? ctx.goldGlowMat
            : (level + bk) % 2 === 0
              ? ctx.cyanGlowMat
              : ctx.blueGlowMat,
        );
        book.scale.set(0.45, 0.56 + (bk % 3) * 0.08, 0.22);
        book.position.set(-6.5, sy + 0.34, -3.3 + bk * 0.72);
        modGroup.add(book);
      }
    }

    return {
      update(worldTime: number, isActive: boolean) {
        const speed = isActive ? 1.15 : 0.45;
        coreOcta.rotation.y = worldTime * speed;
        coreOcta.position.y = gimbalCenter.y + Math.sin(worldTime * 2.2) * 0.14;
        ringX.rotation.x = worldTime * 0.9 * speed;
        ringX.rotation.y = worldTime * 0.5 * speed;
        ringY.rotation.y = -worldTime * 1.1 * speed;
        ringY.rotation.z = worldTime * 0.6 * speed;
        ringZ.rotation.z = worldTime * 0.8 * speed;
        ringZ.rotation.x = -worldTime * 0.4 * speed;

        for (const item of agentPods) {
          item.pod.rotation.y = -worldTime * 1.2;
          const t = (worldTime * 0.85 + item.phase) % 1;
          item.packet.position.lerpVectors(gimbalCenter, item.targetPos, t);
        }
      },
    };
  }

  // ==================== 2F: LoRA 原词拆解与低秩矩阵微调实验室 ====================
  // 1) 中央大型矩阵实验基座与玻璃防护围栏
  const labPedestal = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
  labPedestal.scale.set(7.6, 0.52, 3.2);
  labPedestal.position.set(-0.3, 1.0, 0.1);
  ctx.tagPickable(labPedestal, 1);
  modGroup.add(labPedestal);

  const pedestalEdge = new THREE.Mesh(ctx.unitBox, ctx.blueGlowMat);
  pedestalEdge.scale.set(7.72, 0.1, 3.32);
  pedestalEdge.position.set(-0.3, 1.28, 0.1);
  modGroup.add(pedestalEdge);

  // 2) 左侧：W₀ 冻结预训练权重 3×4×3 三维冰蓝晶格矩阵 (36 颗悬浮晶块)
  const w0Group = new THREE.Group();
  w0Group.position.set(-2.55, 2.85, 0.1);
  modGroup.add(w0Group);

  const w0Cubes: { mesh: THREE.Mesh; baseY: number; phase: number }[] = [];
  for (let ix = -1; ix <= 1; ix++) {
    for (let iy = 0; iy < 4; iy++) {
      for (let iz = -1; iz <= 1; iz++) {
        const cube = new THREE.Mesh(ctx.unitBox, ctx.iceCrystalMat);
        cube.scale.setScalar(0.36);
        const by = (iy - 1.5) * 0.56;
        cube.position.set(ix * 0.56, by, iz * 0.56);
        ctx.tagPickable(cube, 1);
        w0Group.add(cube);
        w0Cubes.push({ mesh: cube, baseY: by, phase: ix * 0.7 + iy * 0.5 + iz * 0.9 });
      }
    }
  }

  // 3) 右侧：ΔW = (α/r) B × A 低秩分解双张量阵列 + 中央秩压缩能量环 (Rank-r Bottleneck Torus)
  const loraGroup = new THREE.Group();
  loraGroup.position.set(1.75, 2.85, 0.1);
  modGroup.add(loraGroup);

  // B 矩阵 (d × r 纵向低秩柱阵)
  for (let col = -1; col <= 1; col++) {
    const bBar = new THREE.Mesh(ctx.unitBox, ctx.goldGlowMat);
    bBar.scale.set(0.28, 2.35, 0.28);
    bBar.position.set(-1.35 + col * 0.42, 0, 0);
    ctx.tagPickable(bBar, 1);
    loraGroup.add(bBar);
  }

  // 中央低秩瓶颈环 r (Rank Bottleneck Ring)
  const rankRing = new THREE.Mesh(ctx.unitTorus, ctx.cyanGlowMat);
  rankRing.rotation.y = Math.PI / 2;
  rankRing.scale.set(0.88, 0.88, 1.1);
  rankRing.position.set(0, 0, 0);
  ctx.tagPickable(rankRing, 1);
  loraGroup.add(rankRing);

  const rankCore = new THREE.Mesh(ctx.unitOcta, ctx.goldGlowMat);
  rankCore.scale.setScalar(0.45);
  loraGroup.add(rankCore);

  // A 矩阵 (r × k 横向低秩梁阵)
  for (let row = -1; row <= 1; row++) {
    const aBar = new THREE.Mesh(ctx.unitBox, ctx.blueGlowMat);
    aBar.scale.set(2.25, 0.28, 0.28);
    aBar.position.set(1.45, row * 0.48, 0);
    ctx.tagPickable(aBar, 1);
    loraGroup.add(aBar);
  }

  // 梯度粒子流球体 (沿着 A -> r -> B 低秩通路穿梭)
  const gradParticles: THREE.Mesh[] = [];
  for (let p = 0; p < 6; p++) {
    const orb = new THREE.Mesh(
      ctx.unitSphere,
      p % 2 === 0 ? ctx.goldGlowMat : ctx.cyanGlowMat,
    );
    orb.scale.setScalar(0.11);
    loraGroup.add(orb);
    gradParticles.push(orb);
  }

  // 4) 前排阶梯式互动课堂：讲师双屏讲台 + 6 组学员代码实验终端与人体工学椅
  const instructorDesk = new THREE.Mesh(ctx.unitBox, ctx.warmWoodMat);
  instructorDesk.scale.set(2.2, 0.88, 0.92);
  instructorDesk.position.set(-5.4, 1.18, 2.8);
  instructorDesk.rotation.y = 0.45;
  ctx.tagPickable(instructorDesk, 1);
  modGroup.add(instructorDesk);

  const podiumScreen = new THREE.Mesh(ctx.unitBox, ctx.goldGlowMat);
  podiumScreen.scale.set(1.3, 0.55, 0.05);
  podiumScreen.position.set(-5.35, 1.85, 2.75);
  podiumScreen.rotation.y = 0.45;
  modGroup.add(podiumScreen);

  for (const dx of [-3.2, 0.2, 3.6]) {
    const bench = new THREE.Mesh(ctx.unitBox, ctx.deskMat);
    bench.scale.set(2.5, 0.76, 0.95);
    bench.position.set(dx, 1.12, 3.75);
    ctx.tagPickable(bench, 1);
    modGroup.add(bench);

    for (const termOffset of [-0.62, 0.62]) {
      const laptopBase = new THREE.Mesh(ctx.unitBox, ctx.brushedSteelMat);
      laptopBase.scale.set(0.56, 0.04, 0.38);
      laptopBase.position.set(dx + termOffset, 1.52, 3.82);
      modGroup.add(laptopBase);

      const laptopScreen = new THREE.Mesh(
        ctx.unitBox,
        termOffset < 0 ? ctx.blueGlowMat : ctx.cyanGlowMat,
      );
      laptopScreen.scale.set(0.56, 0.38, 0.04);
      laptopScreen.position.set(dx + termOffset, 1.72, 3.62);
      laptopScreen.rotation.x = -0.22;
      ctx.tagPickable(laptopScreen, 1);
      modGroup.add(laptopScreen);

      addErgonomicChair(modGroup, ctx, dx + termOffset, 0.75, 4.58, Math.PI, 1);
    }
  }

  // 5) 右侧：H100 液冷 GPU 算力集群 + 顶部发光冷却液歧管 (Overhead Liquid Cooling Manifolds)
  const manifoldPipeA = new THREE.Mesh(ctx.unitCyl, ctx.cyanGlowMat);
  manifoldPipeA.rotation.x = Math.PI / 2;
  manifoldPipeA.scale.set(0.09, 8.2, 0.09);
  manifoldPipeA.position.set(6.15, 5.55, -0.2);
  modGroup.add(manifoldPipeA);

  const manifoldPipeB = new THREE.Mesh(ctx.unitCyl, ctx.blueGlowMat);
  manifoldPipeB.rotation.x = Math.PI / 2;
  manifoldPipeB.scale.set(0.09, 8.2, 0.09);
  manifoldPipeB.position.set(6.55, 5.55, -0.2);
  modGroup.add(manifoldPipeB);

  for (let r = 0; r < 4; r++) {
    const rz = -3.3 + r * 2.2;
    const gpuRack = new THREE.Mesh(ctx.unitBox, ctx.darkSteelMat);
    gpuRack.scale.set(1.32, 4.6, 1.28);
    gpuRack.position.set(6.45, 3.05, rz);
    ctx.tagPickable(gpuRack, 1);
    modGroup.add(gpuRack);

    // 垂直液冷支管连接到机柜顶盖
    const dropPipe = new THREE.Mesh(ctx.unitCyl, r % 2 === 0 ? ctx.cyanGlowMat : ctx.goldGlowMat);
    dropPipe.scale.set(0.06, 0.5, 0.06);
    dropPipe.position.set(6.15, 5.3, rz);
    modGroup.add(dropPipe);

    for (let u = 0; u < 5; u++) {
      const tensorBlade = new THREE.Mesh(
        ctx.unitBox,
        u === 2 ? ctx.goldGlowMat : ctx.blueGlowMat,
      );
      tensorBlade.scale.set(0.08, 0.22, 0.96);
      tensorBlade.position.set(5.78, 1.45 + u * 0.72, rz);
      modGroup.add(tensorBlade);
    }
  }

  return {
    update(worldTime: number, isActive: boolean) {
      const speed = isActive ? 1.15 : 0.45;
      w0Group.rotation.y = Math.sin(worldTime * 0.45) * 0.22;
      for (const item of w0Cubes) {
        item.mesh.position.y =
          item.baseY + Math.sin(worldTime * 2.0 + item.phase) * 0.045;
      }

      rankRing.rotation.x = worldTime * 1.4 * speed;
      rankCore.rotation.y = -worldTime * 1.8 * speed;
      rankCore.rotation.z = worldTime * 1.1 * speed;

      for (let p = 0; p < gradParticles.length; p++) {
        const orb = gradParticles[p]!;
        const progress = ((worldTime * 0.75 * speed + p / gradParticles.length) % 1);
        const x = THREE.MathUtils.lerp(2.4, -1.8, progress);
        const arcY = Math.sin(progress * Math.PI * 2) * 0.55;
        const arcZ = Math.cos(progress * Math.PI * 2) * 0.38;
        orb.position.set(x, arcY, arcZ);
      }
    },
  };
}
