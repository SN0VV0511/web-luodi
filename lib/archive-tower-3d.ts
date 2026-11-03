import * as THREE from "three";
import type { CityLot } from "./city-map";

export type ArchiveTower3D = {
  group: THREE.Group;
  pickables: THREE.Object3D[];
  animate: (
    dt: number,
    worldTime: number,
    isSelected: boolean,
    activeFloorIndex: number,
  ) => boolean;
  getSpatialAnchors: (activeFloorIndex: number) => {
    elevatorWorld: THREE.Vector3;
    floorStageWorld: THREE.Vector3;
    cameraTargetY: number;
  };
  dispose: () => void;
};

type FloorModule = {
  index: number;
  baseY: number;
  group: THREE.Group;
  curtainLeft: THREE.Mesh;
  curtainRight: THREE.Mesh;
  edgeGlowMat: THREE.MeshStandardMaterial;
  interiorAnimated: THREE.Object3D;
  currentSlideZ: number;
  currentCurtainOpen: number;
};

/**
 * 08号楼 · 技术手稿馆 专属可交互 3D 建筑剖面、室内场景、楼层升降滑轨与外挂观光电梯模型。
 * - 未选中时：玻璃幕墙合拢，作为高精钢构玻璃展馆融入城市天际线；
 * - 选中拉近后：幕墙向两侧滑开露出每层 3D 室内细节（1F 财税多智能体指挥中心 / 2F LoRA 矩阵微调实验室），
 *   选中楼层向前悬挑滑出，外挂 3D 观光电梯执行「关门 -> 钢缆滑轮旋转 & 配重块反向升降 & 轿厢滑行 -> 抵达开门」完整三维动画。
 */
export function buildArchiveTower3D(lot: CityLot): ArchiveTower3D {
  const group = new THREE.Group();
  group.name = "ArchiveTower3D_Slot8";
  group.position.set(lot.x, 0, lot.z);

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const pickables: THREE.Object3D[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(geo: T): T => {
    geometries.add(geo);
    return geo;
  };
  const trackMat = <T extends THREE.Material>(mat: T): T => {
    materials.add(mat);
    return mat;
  };
  const makeCanvasTex = (
    w: number,
    h: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ): THREE.CanvasTexture => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (ctx) draw(ctx);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    textures.add(tex);
    return tex;
  };

  const unitBox = trackGeo(new THREE.BoxGeometry(1, 1, 1));
  const unitCyl = trackGeo(new THREE.CylinderGeometry(1, 1, 1, 20));
  const unitOcta = trackGeo(new THREE.OctahedronGeometry(1, 1));
  const unitTorus = trackGeo(new THREE.TorusGeometry(1, 0.08, 12, 32));

  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#223038", roughness: 0.35, metalness: 0.72 }),
  );
  const brushedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#9eb2bd", roughness: 0.28, metalness: 0.78 }),
  );
  const slabConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#d8d4c8", roughness: 0.65, metalness: 0.08 }),
  );
  const darkFloorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#152329", roughness: 0.42, metalness: 0.22 }),
  );
  const deskMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#2d3e46", roughness: 0.5, metalness: 0.3 }),
  );
  const curtainGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#5fa8c8",
      transparent: true,
      opacity: 0.42,
      roughness: 0.12,
      metalness: 0.68,
      depthWrite: false,
    }),
  );
  const cabGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#a8e6ff",
      transparent: true,
      opacity: 0.38,
      roughness: 0.1,
      metalness: 0.5,
      depthWrite: false,
    }),
  );
  const cyanGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#5ce0a0",
      emissive: "#38c88a",
      emissiveIntensity: 1.6,
      roughness: 0.2,
    }),
  );
  const goldGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#ffd175",
      emissive: "#f0b24a",
      emissiveIntensity: 1.7,
      roughness: 0.2,
    }),
  );
  const blueGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#7ab8ff",
      emissive: "#4892f0",
      emissiveIntensity: 1.5,
      roughness: 0.2,
    }),
  );

  const tagPickable = (obj: THREE.Object3D, floorIndex?: number, isElevator?: boolean) => {
    obj.userData.place = "slot-8";
    if (floorIndex !== undefined) obj.userData.floorIndex = floorIndex;
    if (isElevator) obj.userData.isElevator = true;
    pickables.push(obj);
  };

  // ==================== 1. 垂直升降楼层舱总成 (Deck Group) ====================
  const deckGroup = new THREE.Group();
  group.add(deckGroup);

  const floorConfigs = [
    {
      index: 0,
      code: "1F",
      baseY: 2.0,
      accent: "#5ce0a0",
      title: "1F · BIGLINK 财税多智能体系统",
      subtitle: "MULTI-AGENT ARCHITECTURE & INTERVIEW HANDBOOK",
      badge: "6-LAYER AGENT ORCHESTRATION · LANGGRAPH · RAG",
    },
    {
      index: 1,
      code: "2F",
      baseY: 15.8,
      accent: "#7ab8ff",
      title: "2F · LoRA 微调记录课堂",
      subtitle: "LOW-RANK ADAPTATION · FORMULA & CODE LAB",
      badge: "ΔW = (α/r) B·A · RANK DECOMPOSITION · PYTORCH",
    },
  ] as const;

  const floorW = 16.4;
  const floorD = 12.4;
  const floorH = 11.8;
  const floorCenterX = 1.6; // 右侧主展舱，左侧留给外挂3D观光电梯井
  const floorCenterZ = 1.2;

  const floorModules: FloorModule[] = floorConfigs.map((cfg) => {
    const modGroup = new THREE.Group();
    modGroup.position.set(floorCenterX, cfg.baseY, floorCenterZ);
    deckGroup.add(modGroup);

    // 1) 楼层底板与顶板
    const bottomSlab = new THREE.Mesh(unitBox, slabConcreteMat);
    bottomSlab.scale.set(floorW, 0.65, floorD);
    bottomSlab.position.set(0, 0.325, 0);
    bottomSlab.castShadow = true;
    bottomSlab.receiveShadow = true;
    tagPickable(bottomSlab, cfg.index);
    modGroup.add(bottomSlab);

    const interiorFloor = new THREE.Mesh(unitBox, darkFloorMat);
    interiorFloor.scale.set(floorW - 0.6, 0.12, floorD - 0.6);
    interiorFloor.position.set(0, 0.7, 0);
    tagPickable(interiorFloor, cfg.index);
    modGroup.add(interiorFloor);

    const topSlab = new THREE.Mesh(unitBox, darkSteelMat);
    topSlab.scale.set(floorW, 0.45, floorD);
    topSlab.position.set(0, floorH - 0.225, 0);
    topSlab.castShadow = true;
    tagPickable(topSlab, cfg.index);
    modGroup.add(topSlab);

    // 2) 楼层前沿发光环带与3D立面铭牌
    const edgeGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: cfg.accent,
        emissive: cfg.accent,
        emissiveIntensity: 1.2,
        roughness: 0.25,
      }),
    );
    const frontEdgeGlow = new THREE.Mesh(unitBox, edgeGlowMat);
    frontEdgeGlow.scale.set(floorW + 0.2, 0.22, 0.25);
    frontEdgeGlow.position.set(0, 0.58, floorD / 2 + 0.08);
    modGroup.add(frontEdgeGlow);

    const topEdgeGlow = new THREE.Mesh(unitBox, edgeGlowMat);
    topEdgeGlow.scale.set(floorW + 0.2, 0.18, 0.22);
    topEdgeGlow.position.set(0, floorH - 0.08, floorD / 2 + 0.08);
    modGroup.add(topEdgeGlow);

    // 楼层前沿 3D 铭牌贴图
    const fasciaTex = makeCanvasTex(1024, 128, (ctx) => {
      ctx.fillStyle = "#0b181d";
      ctx.fillRect(0, 0, 1024, 128);
      ctx.strokeStyle = cfg.accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, 1016, 120);
      ctx.fillStyle = cfg.accent;
      ctx.fillRect(18, 20, 130, 88);
      ctx.fillStyle = "#091512";
      ctx.font = "900 54px monospace";
      ctx.textAlign = "center";
      ctx.fillText(cfg.code, 83, 82);
      ctx.fillStyle = "#f2f8f4";
      ctx.font = "bold 40px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(cfg.title, 174, 62);
      ctx.fillStyle = "#9ec2b4";
      ctx.font = "600 22px monospace";
      ctx.fillText(cfg.subtitle, 174, 102);
    });
    const fasciaMat = trackMat(
      new THREE.MeshBasicMaterial({ map: fasciaTex, toneMapped: false }),
    );
    const fasciaGeo = trackGeo(new THREE.PlaneGeometry(floorW - 0.8, 1.45));
    const fasciaMesh = new THREE.Mesh(fasciaGeo, fasciaMat);
    fasciaMesh.position.set(0, 1.38, floorD / 2 + 0.16);
    tagPickable(fasciaMesh, cfg.index);
    modGroup.add(fasciaMesh);

    // 两侧结构钢柱
    for (const sx of [-1, 1]) {
      const col = new THREE.Mesh(unitBox, brushedSteelMat);
      col.scale.set(0.42, floorH, 0.42);
      col.position.set(sx * (floorW / 2 - 0.22), floorH / 2, floorD / 2 - 0.22);
      tagPickable(col, cfg.index);
      modGroup.add(col);
    }

    // 3) 后方巨幅 3D 全息背景墙 (承载该楼层 HTML 的 3D 架构预览看板)
    const backWallTex = makeCanvasTex(1024, 512, (ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 1024, 512);
      grad.addColorStop(0, cfg.index === 0 ? "#0c2228" : "#121d30");
      grad.addColorStop(1, "#071116");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      // 网格背景
      ctx.strokeStyle = "rgba(140, 210, 200, 0.12)";
      ctx.lineWidth = 1;
      for (let x = 0; x < 1024; x += 48) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
      }
      for (let y = 0; y < 512; y += 48) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
      }

      ctx.strokeStyle = cfg.accent;
      ctx.lineWidth = 5;
      ctx.strokeRect(18, 18, 988, 476);

      ctx.fillStyle = cfg.accent;
      ctx.font = "bold 26px monospace";
      ctx.fillText(cfg.badge, 48, 68);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 52px sans-serif";
      ctx.fillText(cfg.title, 48, 136);

      if (cfg.index === 0) {
        // 1F Biglink 多智能体拓扑图绘制
        const nodes = [
          { x: 140, y: 260, label: " Supervisor " },
          { x: 360, y: 205, label: " Tax Policy " },
          { x: 360, y: 325, label: " Invoice OCR" },
          { x: 590, y: 205, label: " Risk Audit " },
          { x: 590, y: 325, label: " Graph RAG  " },
          { x: 825, y: 265, label: " Report Gen " },
        ];
        ctx.strokeStyle = "#5ce0a0";
        ctx.lineWidth = 3;
        [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5]].forEach(([a, b]) => {
          ctx.beginPath();
          ctx.moveTo(nodes[a]!.x, nodes[a]!.y);
          ctx.lineTo(nodes[b]!.x, nodes[b]!.y);
          ctx.stroke();
        });
        nodes.forEach((n) => {
          ctx.fillStyle = "#102d2a";
          ctx.fillRect(n.x - 84, n.y - 30, 168, 60);
          ctx.strokeStyle = "#5ce0a0";
          ctx.strokeRect(n.x - 84, n.y - 30, 168, 60);
          ctx.fillStyle = "#e8fff5";
          ctx.font = "bold 22px monospace";
          ctx.fillText(n.label, n.x - 72, n.y + 8);
        });
      } else {
        // 2F LoRA 矩阵分解公式与低秩通路绘制
        ctx.fillStyle = "#172842";
        ctx.fillRect(54, 185, 210, 180);
        ctx.strokeStyle = "#7ab8ff";
        ctx.strokeRect(54, 185, 210, 180);
        ctx.fillStyle = "#e6f2ff";
        ctx.font = "bold 34px monospace";
        ctx.fillText("W₀ (Frozen)", 72, 285);

        ctx.fillStyle = "#ffd175";
        ctx.font = "bold 46px monospace";
        ctx.fillText("+ (α/r) · B × A", 300, 285);

        ctx.fillStyle = "#2b2214";
        ctx.fillRect(680, 185, 110, 180);
        ctx.strokeStyle = "#ffd175";
        ctx.strokeRect(680, 185, 110, 180);
        ctx.fillStyle = "#ffd175";
        ctx.font = "bold 28px monospace";
        ctx.fillText("B(d×r)", 690, 285);

        ctx.fillStyle = "#2b2214";
        ctx.fillRect(810, 225, 165, 100);
        ctx.strokeStyle = "#ffd175";
        ctx.strokeRect(810, 225, 165, 100);
        ctx.fillStyle = "#ffd175";
        ctx.fillText("A(r×k)", 842, 285);
      }

      ctx.fillStyle = "#ffd175";
      ctx.font = "bold 24px monospace";
      ctx.fillText("▶ 点击本楼层 3D 展厅或右侧全息屏交互体验完整 HTML", 48, 452);
    });
    const backWallMat = trackMat(
      new THREE.MeshBasicMaterial({ map: backWallTex, toneMapped: false }),
    );
    const backWallGeo = trackGeo(new THREE.PlaneGeometry(floorW - 1.6, floorH - 3.2));
    const backWallMesh = new THREE.Mesh(backWallGeo, backWallMat);
    backWallMesh.position.set(0, floorH * 0.54, -floorD / 2 + 0.45);
    tagPickable(backWallMesh, cfg.index);
    modGroup.add(backWallMesh);

    // 4) 室内 3D 专属微缩建模场景 (Interior 3D Diorama)
    const interiorAnimated = new THREE.Group();
    interiorAnimated.position.set(0, 0.75, 0.4);
    modGroup.add(interiorAnimated);

    if (cfg.index === 0) {
      // 1F 室内：财税多智能体圆桌指挥中心 + 6 座 Agent 终端工位 + 全息核心球 + 服务器机柜阵列
      const commandTable = new THREE.Mesh(unitCyl, deskMat);
      commandTable.scale.set(2.4, 0.85, 2.4);
      commandTable.position.set(0, 0.45, 0.4);
      tagPickable(commandTable, 0);
      modGroup.add(commandTable);

      const tableRing = new THREE.Mesh(unitTorus, cyanGlowMat);
      tableRing.rotation.x = Math.PI / 2;
      tableRing.scale.set(2.2, 2.2, 1);
      tableRing.position.set(0, 0.92, 0.4);
      modGroup.add(tableRing);

      // 悬浮旋转的多智能体协同多面体核心
      const coreMesh = new THREE.Mesh(unitOcta, cyanGlowMat);
      coreMesh.scale.set(1.15, 1.45, 1.15);
      coreMesh.position.set(0, 2.6, 0.4);
      tagPickable(coreMesh, 0);
      interiorAnimated.add(coreMesh);

      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const sat = new THREE.Mesh(unitOcta, goldGlowMat);
        sat.scale.set(0.32, 0.32, 0.32);
        sat.position.set(Math.cos(angle) * 2.1, 2.6 + (i % 2 ? 0.35 : -0.35), 0.4 + Math.sin(angle) * 2.1);
        interiorAnimated.add(sat);

        // 周围 6 个智能体工作站桌台与发光双联屏
        const wx = Math.cos(angle) * 4.5;
        const wz = 0.4 + Math.sin(angle) * 3.4;
        const desk = new THREE.Mesh(unitBox, deskMat);
        desk.scale.set(1.6, 0.75, 0.9);
        desk.position.set(wx, 1.12, wz);
        desk.rotation.y = -angle + Math.PI / 2;
        tagPickable(desk, 0);
        modGroup.add(desk);

        const screen = new THREE.Mesh(unitBox, cyanGlowMat);
        screen.scale.set(1.2, 0.65, 0.08);
        screen.position.set(wx, 1.85, wz);
        screen.rotation.y = -angle + Math.PI / 2;
        tagPickable(screen, 0);
        modGroup.add(screen);
      }

      // 两侧财税知识库服务器机柜
      for (const sx of [-1, 1]) {
        for (let r = 0; r < 3; r++) {
          const rack = new THREE.Mesh(unitBox, darkSteelMat);
          rack.scale.set(1.1, 4.2, 1.1);
          rack.position.set(sx * 6.6, 2.8, -2.6 + r * 2.1);
          tagPickable(rack, 0);
          modGroup.add(rack);

          const rackLed = new THREE.Mesh(unitBox, r % 2 === 0 ? cyanGlowMat : goldGlowMat);
          rackLed.scale.set(0.12, 3.4, 0.85);
          rackLed.position.set(sx * 6.0, 2.8, -2.6 + r * 2.1);
          modGroup.add(rackLed);
        }
      }
    } else {
      // 2F 室内：LoRA 低秩矩阵分解 3D 晶体雕塑 (B×A) + H100 GPU 算力集群 + 课堂讲台与课桌
      const podiumBase = new THREE.Mesh(unitBox, deskMat);
      podiumBase.scale.set(4.2, 0.7, 2.6);
      podiumBase.position.set(0, 1.05, 0.5);
      tagPickable(podiumBase, 1);
      modGroup.add(podiumBase);

      // 悬浮旋转的 LoRA 低秩矩阵 B (竖向秩柱) 与 A (横向秩梁) 3D 阵列
      for (let i = -1; i <= 1; i++) {
        const matrixBCol = new THREE.Mesh(unitBox, goldGlowMat);
        matrixBCol.scale.set(0.38, 2.6, 0.38);
        matrixBCol.position.set(-1.1 + i * 0.65, 2.8, 0.5);
        tagPickable(matrixBCol, 1);
        interiorAnimated.add(matrixBCol);

        const matrixARow = new THREE.Mesh(unitBox, blueGlowMat);
        matrixARow.scale.set(2.6, 0.38, 0.38);
        matrixARow.position.set(1.1, 2.8 + i * 0.65, 0.5);
        tagPickable(matrixARow, 1);
        interiorAnimated.add(matrixARow);
      }
      const rankBridge = new THREE.Mesh(unitOcta, cyanGlowMat);
      rankBridge.scale.set(0.75, 0.75, 0.75);
      rankBridge.position.set(0, 2.8, 0.5);
      interiorAnimated.add(rankBridge);

      // 前排课堂实验桌与终端
      for (const dx of [-4.2, 0, 4.2]) {
        const labDesk = new THREE.Mesh(unitBox, deskMat);
        labDesk.scale.set(2.6, 0.75, 1.1);
        labDesk.position.set(dx, 1.12, 3.6);
        tagPickable(labDesk, 1);
        modGroup.add(labDesk);

        const labMonitor = new THREE.Mesh(unitBox, blueGlowMat);
        labMonitor.scale.set(1.8, 0.7, 0.08);
        labMonitor.position.set(dx, 1.85, 3.4);
        tagPickable(labMonitor, 1);
        modGroup.add(labMonitor);
      }

      // 两侧 GPU 算力液冷机柜
      for (const sx of [-1, 1]) {
        for (let r = 0; r < 3; r++) {
          const gpuPod = new THREE.Mesh(unitBox, darkSteelMat);
          gpuPod.scale.set(1.25, 4.6, 1.25);
          gpuPod.position.set(sx * 6.5, 3.0, -2.4 + r * 2.2);
          tagPickable(gpuPod, 1);
          modGroup.add(gpuPod);

          const tensorBar = new THREE.Mesh(unitBox, r === 1 ? goldGlowMat : blueGlowMat);
          tensorBar.scale.set(0.14, 3.8, 0.9);
          tensorBar.position.set(sx * 5.82, 3.0, -2.4 + r * 2.2);
          modGroup.add(tensorBar);
        }
      }
    }

    // 5) 可向两侧滑开的 3D 钢化玻璃幕墙门 (选中大楼时自动向两侧滑开露出 3D 室内)
    const halfCurtainW = (floorW - 0.8) / 2;
    const curtainH = floorH - 2.4;
    const curtainLeft = new THREE.Mesh(unitBox, curtainGlassMat);
    curtainLeft.scale.set(halfCurtainW, curtainH, 0.14);
    curtainLeft.position.set(-halfCurtainW / 2, 2.1 + curtainH / 2, floorD / 2 + 0.05);
    tagPickable(curtainLeft, cfg.index);
    modGroup.add(curtainLeft);

    const curtainRight = new THREE.Mesh(unitBox, curtainGlassMat);
    curtainRight.scale.set(halfCurtainW, curtainH, 0.14);
    curtainRight.position.set(halfCurtainW / 2, 2.1 + curtainH / 2, floorD / 2 + 0.05);
    tagPickable(curtainRight, cfg.index);
    modGroup.add(curtainRight);

    return {
      index: cfg.index,
      baseY: cfg.baseY,
      group: modGroup,
      curtainLeft,
      curtainRight,
      edgeGlowMat,
      interiorAnimated,
      currentSlideZ: 0,
      currentCurtainOpen: 0,
    };
  });

  // ==================== 2. 外挂 3D 观光电梯井、滑轮机房、配重块与双开门轿厢 ====================
  const elevatorGroup = new THREE.Group();
  const shaftX = -8.2;
  const shaftZ = 5.4;
  const shaftW = 3.8;
  const shaftD = 3.4;
  const shaftH = 31.6;
  elevatorGroup.position.set(shaftX, 0, shaftZ);
  group.add(elevatorGroup);

  // 电梯井四角钢结构立柱与水平桁架环
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(unitBox, darkSteelMat);
      post.scale.set(0.24, shaftH, 0.24);
      post.position.set(sx * (shaftW / 2), shaftH / 2, sz * (shaftD / 2));
      tagPickable(post, undefined, true);
      elevatorGroup.add(post);
    }
  }
  for (let y = 2.2; y <= shaftH; y += 3.6) {
    const ringFront = new THREE.Mesh(unitBox, brushedSteelMat);
    ringFront.scale.set(shaftW + 0.15, 0.16, 0.16);
    ringFront.position.set(0, y, shaftD / 2);
    elevatorGroup.add(ringFront);

    const ringBack = new THREE.Mesh(unitBox, brushedSteelMat);
    ringBack.scale.set(shaftW + 0.15, 0.16, 0.16);
    ringBack.position.set(0, y, -shaftD / 2);
    elevatorGroup.add(ringBack);

    for (const sx of [-1, 1]) {
      const ringSide = new THREE.Mesh(unitBox, brushedSteelMat);
      ringSide.scale.set(0.16, 0.16, shaftD + 0.15);
      ringSide.position.set(sx * (shaftW / 2), y, 0);
      elevatorGroup.add(ringSide);
    }
  }

  // 4 根垂直牵引钢缆
  for (const cx of [-0.65, -0.22, 0.22, 0.65]) {
    const cable = new THREE.Mesh(unitCyl, brushedSteelMat);
    cable.scale.set(0.035, shaftH - 1, 0.035);
    cable.position.set(cx, shaftH / 2, -0.15);
    elevatorGroup.add(cable);
  }

  // 屋顶 3D 曳引机房与双旋转滑轮 (Spinning Hoist Sheaves)
  const machineRoom = new THREE.Mesh(unitBox, darkSteelMat);
  machineRoom.scale.set(shaftW + 0.6, 2.8, shaftD + 0.6);
  machineRoom.position.set(0, shaftH + 1.4, 0);
  tagPickable(machineRoom, undefined, true);
  elevatorGroup.add(machineRoom);

  const makePulleyWheel = (xOffset: number) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(xOffset, shaftH + 1.5, 0.2);
    const rim = new THREE.Mesh(unitTorus, goldGlowMat);
    rim.rotation.y = Math.PI / 2;
    rim.scale.set(0.95, 0.95, 1.2);
    wheelGroup.add(rim);
    for (let s = 0; s < 4; s++) {
      const spoke = new THREE.Mesh(unitBox, brushedSteelMat);
      spoke.scale.set(0.1, 1.8, 0.12);
      spoke.rotation.x = (s * Math.PI) / 4;
      wheelGroup.add(spoke);
    }
    elevatorGroup.add(wheelGroup);
    return wheelGroup;
  };
  const pulleyWheelA = makePulleyWheel(-0.55);
  const pulleyWheelB = makePulleyWheel(0.55);

  // 3D 电梯配重块 (与轿厢反向升降)
  const counterweightMesh = new THREE.Mesh(unitBox, goldGlowMat);
  counterweightMesh.scale.set(1.8, 2.4, 0.36);
  counterweightMesh.position.set(0, 20, -shaftD / 2 + 0.42);
  elevatorGroup.add(counterweightMesh);

  // 3D 观光电梯轿厢总成 (Cab Group)
  const cabGroup = new THREE.Group();
  const cabW = 3.35;
  const cabH = 4.8;
  const cabD = 2.95;
  const getFloorElevatorY = (idx: number) => (idx === 0 ? 4.6 : 18.4);
  let currentCabY = getFloorElevatorY(0);
  let startCabY = currentCabY;
  let targetCabY = currentCabY;
  cabGroup.position.set(0, currentCabY, 0.15);
  elevatorGroup.add(cabGroup);

  // 轿厢底盘与发光顶棚
  const cabFloor = new THREE.Mesh(unitBox, darkSteelMat);
  cabFloor.scale.set(cabW, 0.32, cabD);
  cabFloor.position.set(0, -cabH / 2 + 0.16, 0);
  tagPickable(cabFloor, undefined, true);
  cabGroup.add(cabFloor);

  const cabFloorGlow = new THREE.Mesh(unitBox, goldGlowMat);
  cabFloorGlow.scale.set(cabW + 0.12, 0.12, cabD + 0.12);
  cabFloorGlow.position.set(0, -cabH / 2 + 0.34, 0);
  cabGroup.add(cabFloorGlow);

  const cabRoof = new THREE.Mesh(unitBox, darkSteelMat);
  cabRoof.scale.set(cabW, 0.36, cabD);
  cabRoof.position.set(0, cabH / 2 - 0.18, 0);
  tagPickable(cabRoof, undefined, true);
  cabGroup.add(cabRoof);

  const cabCeilingLight = new THREE.Mesh(unitBox, cyanGlowMat);
  cabCeilingLight.scale.set(cabW - 0.5, 0.12, cabD - 0.5);
  cabCeilingLight.position.set(0, cabH / 2 - 0.4, 0);
  cabGroup.add(cabCeilingLight);

  // 轿厢三面透明观光玻璃壁
  for (const sx of [-1, 1]) {
    const sideGlass = new THREE.Mesh(unitBox, cabGlassMat);
    sideGlass.scale.set(0.1, cabH - 0.7, cabD - 0.2);
    sideGlass.position.set(sx * (cabW / 2 - 0.05), 0, 0);
    tagPickable(sideGlass, undefined, true);
    cabGroup.add(sideGlass);
  }
  const backGlass = new THREE.Mesh(unitBox, cabGlassMat);
  backGlass.scale.set(cabW - 0.2, cabH - 0.7, 0.1);
  backGlass.position.set(0, 0, -cabD / 2 + 0.05);
  cabGroup.add(backGlass);

  // 轿厢门楣 3D 动态 LED 矩阵显示屏
  const ledCanvas = document.createElement("canvas");
  ledCanvas.width = 512;
  ledCanvas.height = 96;
  const ledCtx = ledCanvas.getContext("2d");
  const ledTexture = new THREE.CanvasTexture(ledCanvas);
  ledTexture.colorSpace = THREE.SRGBColorSpace;
  textures.add(ledTexture);
  let lastLedText = "";
  const updateLedSign = (text: string, color: string) => {
    if (text === lastLedText || !ledCtx) return;
    lastLedText = text;
    ledCtx.fillStyle = "#061012";
    ledCtx.fillRect(0, 0, 512, 96);
    ledCtx.strokeStyle = color;
    ledCtx.lineWidth = 4;
    ledCtx.strokeRect(4, 4, 504, 88);
    ledCtx.fillStyle = color;
    ledCtx.font = "900 44px monospace";
    ledCtx.textAlign = "center";
    ledCtx.fillText(text, 256, 62);
    ledTexture.needsUpdate = true;
  };
  updateLedSign("01F ● OPEN", "#5ce0a0");

  const ledMat = trackMat(new THREE.MeshBasicMaterial({ map: ledTexture, toneMapped: false }));
  const ledGeo = trackGeo(new THREE.PlaneGeometry(cabW - 0.2, 0.68));
  const ledMesh = new THREE.Mesh(ledGeo, ledMat);
  ledMesh.position.set(0, cabH / 2 + 0.42, cabD / 2 + 0.06);
  cabGroup.add(ledMesh);

  // 轿厢双扇可开合 3D 玻璃滑动门 (Left & Right Sliding 3D Doors)
  const doorW = (cabW - 0.24) / 2;
  const doorH = cabH - 0.76;
  const doorLeft = new THREE.Mesh(unitBox, cabGlassMat);
  doorLeft.scale.set(doorW, doorH, 0.12);
  doorLeft.position.set(-doorW / 2 - 0.55, 0, cabD / 2);
  tagPickable(doorLeft, undefined, true);
  cabGroup.add(doorLeft);

  const doorRight = new THREE.Mesh(unitBox, cabGlassMat);
  doorRight.scale.set(doorW, doorH, 0.12);
  doorRight.position.set(doorW / 2 + 0.55, 0, cabD / 2);
  tagPickable(doorRight, undefined, true);
  cabGroup.add(doorRight);

  // 门缝发光边框条
  const doorTrimLeft = new THREE.Mesh(unitBox, goldGlowMat);
  doorTrimLeft.scale.set(0.08, doorH, 0.16);
  doorLeft.add(doorTrimLeft);
  doorTrimLeft.position.set(0.46, 0, 0);

  const doorTrimRight = new THREE.Mesh(unitBox, goldGlowMat);
  doorTrimRight.scale.set(0.08, doorH, 0.16);
  doorRight.add(doorTrimRight);
  doorTrimRight.position.set(-0.46, 0, 0);

  // ==================== 3. 电梯与楼层 3D 状态机动画 ====================
  let lastTargetFloor = 0;
  let elevatorPhase: "open" | "closing" | "moving" | "opening" = "open";
  let phaseTimer = 0;
  let doorOpenRatio = 1; // 1 = 完全打开, 0 = 完全关闭
  let currentDeckOffsetY = 0;

  function animate(
    dt: number,
    worldTime: number,
    isSelected: boolean,
    activeFloorIndex: number,
  ): boolean {
    const safeDt = Math.min(Math.max(dt, 0.008), 0.06);
    const clampedFloor = Math.max(0, Math.min(floorModules.length - 1, activeFloorIndex));
    let stillAnimating = false;

    // 检测目标楼层变化 -> 触发 3D 电梯关门 -> 升降 -> 开门 完整机械周期
    if (clampedFloor !== lastTargetFloor) {
      lastTargetFloor = clampedFloor;
      startCabY = currentCabY;
      targetCabY = getFloorElevatorY(clampedFloor);
      elevatorPhase = "closing";
      phaseTimer = 0;
    }

    if (elevatorPhase === "closing") {
      phaseTimer += safeDt;
      const p = Math.min(1, phaseTimer / 0.24);
      doorOpenRatio = 1 - p;
      updateLedSign("CLOSING ><", "#ffd175");
      stillAnimating = true;
      if (p >= 1) {
        elevatorPhase = "moving";
        phaseTimer = 0;
      }
    } else if (elevatorPhase === "moving") {
      phaseTimer += safeDt;
      const p = Math.min(1, phaseTimer / 0.62);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      currentCabY = THREE.MathUtils.lerp(startCabY, targetCabY, eased);
      doorOpenRatio = 0;
      const goingUp = targetCabY >= startCabY;
      const spinDir = goingUp ? 1 : -1;
      pulleyWheelA.rotation.x += spinDir * safeDt * 11;
      pulleyWheelB.rotation.x -= spinDir * safeDt * 11;
      updateLedSign(
        goingUp ? `▲ UP -> 0${clampedFloor + 1}F` : `▼ DN -> 0${clampedFloor + 1}F`,
        "#ffd175",
      );
      stillAnimating = true;
      if (p >= 1) {
        currentCabY = targetCabY;
        elevatorPhase = "opening";
        phaseTimer = 0;
      }
    } else if (elevatorPhase === "opening") {
      phaseTimer += safeDt;
      const p = Math.min(1, phaseTimer / 0.26);
      doorOpenRatio = p;
      updateLedSign(`0${clampedFloor + 1}F ● OPEN`, "#5ce0a0");
      stillAnimating = true;
      if (p >= 1) {
        doorOpenRatio = 1;
        elevatorPhase = "open";
      }
    } else {
      const desiredY = getFloorElevatorY(clampedFloor);
      if (Math.abs(currentCabY - desiredY) > 0.02) {
        currentCabY = THREE.MathUtils.lerp(currentCabY, desiredY, safeDt * 10);
        stillAnimating = true;
      }
      doorOpenRatio = THREE.MathUtils.lerp(doorOpenRatio, isSelected ? 1 : 0, safeDt * 8);
      updateLedSign(`0${clampedFloor + 1}F ● OPEN`, "#5ce0a0");
    }

    // 更新 3D 轿厢位置、配重块反向位置与双扇滑动门位置
    cabGroup.position.y = currentCabY + currentDeckOffsetY;
    counterweightMesh.position.y = 26.5 - currentCabY * 0.85;
    const slideOffset = doorOpenRatio * 0.68;
    doorLeft.position.x = -doorW / 2 - slideOffset;
    doorRight.position.x = doorW / 2 + slideOffset;

    // 大楼整体楼层滑轨垂直位移 (大楼可上下滑动将当前选中层对齐至黄金观察高度)
    const targetDeckOffsetY = isSelected ? (clampedFloor === 1 ? -3.2 : 1.2) : 0;
    if (Math.abs(currentDeckOffsetY - targetDeckOffsetY) > 0.015) {
      currentDeckOffsetY = THREE.MathUtils.lerp(currentDeckOffsetY, targetDeckOffsetY, safeDt * 7.5);
      deckGroup.position.y = currentDeckOffsetY;
      stillAnimating = true;
    }

    // 更新每一层 3D 展厅的幕墙开合、悬挑抽屉滑出与室内 3D 核心旋转
    for (const mod of floorModules) {
      const isFloorActive = isSelected && mod.index === clampedFloor;
      const targetCurtainOpen = isSelected ? (isFloorActive ? 1 : 0.68) : 0;
      const targetSlideZ = isFloorActive ? 2.6 : isSelected ? 0.3 : 0;

      if (Math.abs(mod.currentCurtainOpen - targetCurtainOpen) > 0.01) {
        mod.currentCurtainOpen = THREE.MathUtils.lerp(
          mod.currentCurtainOpen,
          targetCurtainOpen,
          safeDt * 7.5,
        );
        stillAnimating = true;
      }
      if (Math.abs(mod.currentSlideZ - targetSlideZ) > 0.01) {
        mod.currentSlideZ = THREE.MathUtils.lerp(mod.currentSlideZ, targetSlideZ, safeDt * 7.5);
        stillAnimating = true;
      }

      const halfW = (floorW - 0.8) / 2;
      const openShift = mod.currentCurtainOpen * (halfW * 0.86);
      mod.curtainLeft.position.x = -halfW / 2 - openShift;
      mod.curtainRight.position.x = halfW / 2 + openShift;
      mod.group.position.z = floorCenterZ + mod.currentSlideZ;
      mod.edgeGlowMat.emissiveIntensity = isFloorActive ? 2.2 : 0.75;

      // 室内 3D 核心（1F 多智能体星环 / 2F LoRA 矩阵晶体）持续微动旋转
      mod.interiorAnimated.rotation.y = worldTime * (isFloorActive ? 0.85 : 0.35);
      mod.interiorAnimated.position.y = 0.75 + Math.sin(worldTime * 2.1 + mod.index) * 0.18;
    }

    return stillAnimating;
  }

  function getSpatialAnchors(activeFloorIndex: number) {
    const clamped = Math.max(0, Math.min(floorModules.length - 1, activeFloorIndex));
    const activeMod = floorModules[clamped] ?? floorModules[0]!;
    const floorWorldY = activeMod.baseY + currentDeckOffsetY + floorH * 0.52;
    const elevatorWorld = new THREE.Vector3(
      lot.x + shaftX - 2.6,
      currentCabY + currentDeckOffsetY + 1.2,
      lot.z + shaftZ + 2.2,
    );
    const floorStageWorld = new THREE.Vector3(
      lot.x + floorCenterX + floorW * 0.52,
      floorWorldY,
      lot.z + floorCenterZ + activeMod.currentSlideZ + 2.2,
    );
    return {
      elevatorWorld,
      floorStageWorld,
      cameraTargetY: floorWorldY,
    };
  }

  function dispose() {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  }

  return {
    group,
    pickables,
    animate,
    getSpatialAnchors,
    dispose,
  };
}
