import * as THREE from "three";
import type { CityLot } from "./city-map";
import {
  buildFloorInterior3D,
  type FloorInteriorContext,
  type FloorInteriorRig,
} from "./archive-tower-interiors";
import { buildTowerSuperstructure3D } from "./archive-tower-structure";
import {
  ANNEX_FLOOR_HEIGHT,
  annexFloorBaseY,
  buildArchiveAnnex,
  type ArchiveAnnex,
  type ArchiveUploadedFloor,
} from "./archive-tower-annex";

export type { ArchiveUploadedFloor } from "./archive-tower-annex";

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
  /** 用后台上传的页面重建 3F 以上的加建楼层；返回需要从拾取索引移除/加入的对象。 */
  setUploadedFloors: (floors: readonly ArchiveUploadedFloor[]) => {
    removed: THREE.Object3D[];
    added: THREE.Object3D[];
  };
  /** 楼层总数（2 层内置 + 上传楼层）。 */
  floorCount: () => number;
  /** 镜头对准该楼层时的目标高度。 */
  getCameraTargetY: (floorIndex: number) => number;
  dispose: () => void;
};

type FloorModule = {
  index: number;
  baseY: number;
  group: THREE.Group;
  bifoldInnerL: THREE.Group;
  bifoldOuterL: THREE.Group;
  bifoldInnerR: THREE.Group;
  bifoldOuterR: THREE.Group;
  louvers: THREE.Mesh[];
  balconyGroup: THREE.Group;
  landingDoorL: THREE.Mesh;
  landingDoorR: THREE.Mesh;
  edgeGlowMat: THREE.MeshStandardMaterial;
  interiorLight: THREE.PointLight;
  interiorRig: FloorInteriorRig;
  currentSlideZ: number;
  currentCurtainOpen: number;
  currentBalconyOut: number;
};

/**
 * 08号楼 · 技术手稿馆 专属高精度 3D 建筑结构、机械展开立面、室内微缩沙盘与外挂观光电梯模型。
 */
export function buildArchiveTower3D(
  lot: CityLot,
  initialUploadedFloors: readonly ArchiveUploadedFloor[] = [],
): ArchiveTower3D {
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
  const unitSphere = trackGeo(new THREE.SphereGeometry(1, 16, 12));
  const unitOcta = trackGeo(new THREE.OctahedronGeometry(1, 1));
  const unitTorus = trackGeo(new THREE.TorusGeometry(1, 0.08, 12, 32));

  const darkSteelMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#1e2c34", roughness: 0.32, metalness: 0.78 }),
  );
  const brushedSteelMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#a4b8c4", roughness: 0.24, metalness: 0.84 }),
  );
  const slabConcreteMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#d8d4c8", roughness: 0.62, metalness: 0.1 }),
  );
  const darkFloorMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#122026", roughness: 0.36, metalness: 0.28 }),
  );
  const deskMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#293a42", roughness: 0.45, metalness: 0.35 }),
  );
  const warmWoodMat = trackMat(
    new THREE.MeshStandardMaterial({ color: "#6e4f3a", roughness: 0.52, metalness: 0.12 }),
  );
  const curtainGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#6bc2e6",
      transparent: true,
      opacity: 0.36,
      roughness: 0.08,
      metalness: 0.72,
      depthWrite: false,
    }),
  );
  const cabGlassMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#b0ecff",
      transparent: true,
      opacity: 0.34,
      roughness: 0.08,
      metalness: 0.55,
      depthWrite: false,
    }),
  );
  const cyanGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#5ce0a0",
      emissive: "#38c88a",
      emissiveIntensity: 1.65,
      roughness: 0.2,
    }),
  );
  const goldGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#ffd175",
      emissive: "#f0b24a",
      emissiveIntensity: 1.75,
      roughness: 0.2,
    }),
  );
  const blueGlowMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#7ab8ff",
      emissive: "#4892f0",
      emissiveIntensity: 1.55,
      roughness: 0.2,
    }),
  );
  const iceCrystalMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: "#9ad4ff",
      emissive: "#3878d0",
      emissiveIntensity: 1.15,
      roughness: 0.15,
      metalness: 0.65,
      transparent: true,
      opacity: 0.86,
    }),
  );

  const tagPickable = (obj: THREE.Object3D, floorIndex?: number, isElevator?: boolean) => {
    obj.userData.place = "slot-8";
    if (floorIndex !== undefined) obj.userData.floorIndex = floorIndex;
    if (isElevator) obj.userData.isElevator = true;
    pickables.push(obj);
  };

  const upVec = new THREE.Vector3(0, 1, 0);
  const makeBeam = (
    parent: THREE.Object3D,
    from: THREE.Vector3,
    to: THREE.Vector3,
    radius: number,
    mat: THREE.Material,
  ): THREE.Mesh => {
    const diff = new THREE.Vector3().subVectors(to, from);
    const len = diff.length();
    const beam = new THREE.Mesh(unitCyl, mat);
    beam.scale.set(radius, len, radius);
    beam.position.copy(from).addScaledVector(diff, 0.5);
    beam.quaternion.setFromUnitVectors(upVec, diff.normalize());
    parent.add(beam);
    return beam;
  };

  const sharedCtx: FloorInteriorContext = {
    unitBox,
    unitCyl,
    unitSphere,
    unitOcta,
    unitTorus,
    darkSteelMat,
    brushedSteelMat,
    deskMat,
    warmWoodMat,
    glassMat: cabGlassMat,
    cyanGlowMat,
    goldGlowMat,
    blueGlowMat,
    iceCrystalMat,
    tagPickable,
    makeBeam,
  };

  // ==================== 1. 外部重型钢结构、迎宾雨棚与屋顶停机坪/雷达/风机总成 ====================
  const superstructureRig = buildTowerSuperstructure3D(group, sharedCtx);

  // ==================== 2. 垂直升降楼层舱总成 (Deck Group) ====================
  const deckGroup = new THREE.Group();
  group.add(deckGroup);

  const floorConfigs = [
    {
      index: 0,
      code: "1F",
      baseY: 2.2,
      accent: "#5ce0a0",
      lightColor: 0x5ce0a0,
      title: "1F · BIGLINK 财税多智能体系统",
      subtitle: "MULTI-AGENT ARCHITECTURE & INTERVIEW HANDBOOK",
      badge: "6-LAYER AGENT ORCHESTRATION · LANGGRAPH · RAG",
    },
    {
      index: 1,
      code: "2F",
      baseY: 16.0,
      accent: "#7ab8ff",
      lightColor: 0x7ab8ff,
      title: "2F · LoRA 微调记录课堂",
      subtitle: "LOW-RANK ADAPTATION · FORMULA & CODE LAB",
      badge: "ΔW = (α/r) B·A · RANK DECOMPOSITION · PYTORCH",
    },
  ] as const;

  const floorW = 16.4;
  const floorD = 12.4;
  const floorH = 11.8;
  const floorCenterX = 1.6;
  const floorCenterZ = 1.2;

  const floorModules: FloorModule[] = floorConfigs.map((cfg) => {
    const modGroup = new THREE.Group();
    modGroup.position.set(floorCenterX, cfg.baseY, floorCenterZ);
    deckGroup.add(modGroup);

    // 室内专属点光源（镜头拉近选中时自动点亮室内全部 3D 细节）
    const interiorLight = new THREE.PointLight(cfg.lightColor, 0, 22, 1.4);
    interiorLight.position.set(0, 6.2, 2.2);
    modGroup.add(interiorLight);

    // 1) 楼层复合结构底板、蜂窝钢梁托架与微晶石地面
    const bottomSlab = new THREE.Mesh(unitBox, slabConcreteMat);
    bottomSlab.scale.set(floorW, 0.62, floorD);
    bottomSlab.position.set(0, 0.31, 0);
    bottomSlab.castShadow = true;
    bottomSlab.receiveShadow = true;
    tagPickable(bottomSlab, cfg.index);
    modGroup.add(bottomSlab);

    for (let bx = -6.4; bx <= 6.4; bx += 3.2) {
      const rib = new THREE.Mesh(unitBox, darkSteelMat);
      rib.scale.set(0.24, 0.32, floorD + 0.3);
      rib.position.set(bx, 0.14, 0);
      modGroup.add(rib);
    }

    const interiorFloor = new THREE.Mesh(unitBox, darkFloorMat);
    interiorFloor.scale.set(floorW - 0.5, 0.14, floorD - 0.5);
    interiorFloor.position.set(0, 0.68, 0);
    tagPickable(interiorFloor, cfg.index);
    modGroup.add(interiorFloor);

    const topSlab = new THREE.Mesh(unitBox, darkSteelMat);
    topSlab.scale.set(floorW, 0.46, floorD);
    topSlab.position.set(0, floorH - 0.23, 0);
    topSlab.castShadow = true;
    tagPickable(topSlab, cfg.index);
    modGroup.add(topSlab);

    // 2) 楼层前沿发光环带与高分 3D 立面铭牌
    const edgeGlowMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: cfg.accent,
        emissive: cfg.accent,
        emissiveIntensity: 1.2,
        roughness: 0.22,
      }),
    );
    const frontEdgeGlow = new THREE.Mesh(unitBox, edgeGlowMat);
    frontEdgeGlow.scale.set(floorW + 0.25, 0.22, 0.26);
    frontEdgeGlow.position.set(0, 0.58, floorD / 2 + 0.09);
    modGroup.add(frontEdgeGlow);

    const topEdgeGlow = new THREE.Mesh(unitBox, edgeGlowMat);
    topEdgeGlow.scale.set(floorW + 0.25, 0.18, 0.24);
    topEdgeGlow.position.set(0, floorH - 0.08, floorD / 2 + 0.09);
    modGroup.add(topEdgeGlow);

    const fasciaTex = makeCanvasTex(1024, 128, (ctx) => {
      ctx.fillStyle = "#091519";
      ctx.fillRect(0, 0, 1024, 128);
      ctx.strokeStyle = cfg.accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, 1016, 120);
      ctx.fillStyle = cfg.accent;
      ctx.fillRect(18, 20, 130, 88);
      ctx.fillStyle = "#081210";
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
    const fasciaMat = trackMat(new THREE.MeshBasicMaterial({ map: fasciaTex, toneMapped: false }));
    const fasciaMesh = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(floorW - 0.8, 1.42)),
      fasciaMat,
    );
    fasciaMesh.position.set(0, 1.38, floorD / 2 + 0.17);
    tagPickable(fasciaMesh, cfg.index);
    modGroup.add(fasciaMesh);

    // 3) 后方巨幅 3D 全息背景架构图墙
    const backWallTex = makeCanvasTex(1024, 512, (ctx) => {
      const grad = ctx.createLinearGradient(0, 0, 1024, 512);
      grad.addColorStop(0, cfg.index === 0 ? "#0a1f26" : "#101b2e");
      grad.addColorStop(1, "#060e12");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1024, 512);

      ctx.strokeStyle = "rgba(140, 210, 200, 0.13)";
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
      ctx.font = "bold 25px monospace";
      ctx.fillText(cfg.badge, 48, 66);
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 50px sans-serif";
      ctx.fillText(cfg.title, 48, 132);

      if (cfg.index === 0) {
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
      ctx.fillText("▶ 滚轮上下切换楼层 · 点击室内 3D 构件或右侧全息屏深度交互", 48, 452);
    });
    const backWallMat = trackMat(new THREE.MeshBasicMaterial({ map: backWallTex, toneMapped: false }));
    const backWallMesh = new THREE.Mesh(
      trackGeo(new THREE.PlaneGeometry(floorW - 1.6, floorH - 3.2)),
      backWallMat,
    );
    backWallMesh.position.set(0, floorH * 0.54, -floorD / 2 + 0.42);
    tagPickable(backWallMesh, cfg.index);
    modGroup.add(backWallMesh);

    // 4) 室内高精度 3D 沙盘场景 (1F 多智能体指挥中心 / 2F LoRA 实验室)
    const interiorRig = buildFloorInterior3D(cfg.index, modGroup, sharedCtx);

    // 5) 左侧电梯候梯连廊空中天桥 (Glass Skybridge to Elevator Shaft) 与联动层门
    const bridgeGroup = new THREE.Group();
    bridgeGroup.position.set(-floorW / 2 - 1.15, 0.45, 4.1);
    modGroup.add(bridgeGroup);

    const bridgeSlab = new THREE.Mesh(unitBox, darkSteelMat);
    bridgeSlab.scale.set(2.4, 0.28, 3.1);
    bridgeSlab.position.set(0, 0, 0);
    tagPickable(bridgeSlab, cfg.index, true);
    bridgeGroup.add(bridgeSlab);

    const bridgeGlow = new THREE.Mesh(unitBox, edgeGlowMat);
    bridgeGlow.scale.set(2.45, 0.08, 3.15);
    bridgeGlow.position.set(0, 0.16, 0);
    bridgeGroup.add(bridgeGlow);

    // 候梯厅双扇联动玻璃层门
    const landingDoorL = new THREE.Mesh(unitBox, cabGlassMat);
    landingDoorL.scale.set(0.08, 3.8, 1.15);
    landingDoorL.position.set(-floorW / 2 + 0.05, 2.55, 3.5);
    modGroup.add(landingDoorL);

    const landingDoorR = new THREE.Mesh(unitBox, cabGlassMat);
    landingDoorR.scale.set(0.08, 3.8, 1.15);
    landingDoorR.position.set(-floorW / 2 + 0.05, 2.55, 4.7);
    modGroup.add(landingDoorR);

    // 6) 选中楼层自动向前伸出的 3D 悬挑观景玻璃阳台 (Telescoping Skywalk Balcony)
    const balconyGroup = new THREE.Group();
    balconyGroup.position.set(0, 0.42, floorD / 2 - 1.2);
    modGroup.add(balconyGroup);

    const balDeck = new THREE.Mesh(unitBox, darkSteelMat);
    balDeck.scale.set(floorW - 2.4, 0.24, 2.2);
    balDeck.position.set(0, 0, 0);
    tagPickable(balDeck, cfg.index);
    balconyGroup.add(balDeck);

    const balGlow = new THREE.Mesh(unitBox, edgeGlowMat);
    balGlow.scale.set(floorW - 2.3, 0.1, 0.16);
    balGlow.position.set(0, 0.12, 1.08);
    balconyGroup.add(balGlow);

    const balRailGlass = new THREE.Mesh(unitBox, cabGlassMat);
    balRailGlass.scale.set(floorW - 2.5, 1.05, 0.07);
    balRailGlass.position.set(0, 0.62, 1.05);
    tagPickable(balRailGlass, cfg.index);
    balconyGroup.add(balRailGlass);

    const balTopBar = new THREE.Mesh(unitBox, brushedSteelMat);
    balTopBar.scale.set(floorW - 2.4, 0.07, 0.12);
    balTopBar.position.set(0, 1.16, 1.05);
    balconyGroup.add(balTopBar);

    for (let postX = -6.2; postX <= 6.2; postX += 3.1) {
      const post = new THREE.Mesh(unitBox, brushedSteelMat);
      post.scale.set(0.08, 1.15, 0.08);
      post.position.set(postX, 0.58, 1.05);
      balconyGroup.add(post);
    }

    // 7) 四扇可折叠展开的 3D 钢爪点支式玻璃幕墙 (4-Panel Bi-Folding Curtain Wall) + 顶部遮阳百叶翼
    const panelW = (floorW - 0.8) / 4;
    const curtainH = floorH - 2.45;
    const curtainY = 2.12 + curtainH / 2;
    const curtainZ = floorD / 2 + 0.06;

    const makeCurtainPanel = (xOffset: number): THREE.Group => {
      const pGroup = new THREE.Group();
      pGroup.position.set(xOffset, curtainY, curtainZ);

      const glass = new THREE.Mesh(unitBox, curtainGlassMat);
      glass.scale.set(panelW - 0.06, curtainH, 0.1);
      tagPickable(glass, cfg.index);
      pGroup.add(glass);

      // 两侧竖向不锈钢肋条与横向爪件横梁
      for (const sx of [-1, 1]) {
        const mullion = new THREE.Mesh(unitBox, brushedSteelMat);
        mullion.scale.set(0.08, curtainH, 0.16);
        mullion.position.set(sx * (panelW / 2 - 0.04), 0, 0);
        pGroup.add(mullion);
      }
      for (const ty of [-curtainH * 0.25, 0, curtainH * 0.25]) {
        const transom = new THREE.Mesh(unitBox, brushedSteelMat);
        transom.scale.set(panelW, 0.06, 0.14);
        transom.position.set(0, ty, 0);
        pGroup.add(transom);
      }
      modGroup.add(pGroup);
      return pGroup;
    };

    const bifoldOuterL = makeCurtainPanel(-panelW * 1.5);
    const bifoldInnerL = makeCurtainPanel(-panelW * 0.5);
    const bifoldInnerR = makeCurtainPanel(panelW * 0.5);
    const bifoldOuterR = makeCurtainPanel(panelW * 1.5);

    // 顶部 4 片可旋转机械遮阳百叶翼 (Rotatable Sun-Shading Louvers)
    const louvers: THREE.Mesh[] = [];
    for (let l = 0; l < 4; l++) {
      const louver = new THREE.Mesh(unitBox, brushedSteelMat);
      louver.scale.set(floorW - 1.2, 0.06, 0.34);
      louver.position.set(0, floorH - 0.55 - l * 0.32, floorD / 2 + 0.24);
      modGroup.add(louver);
      louvers.push(louver);
    }

    return {
      index: cfg.index,
      baseY: cfg.baseY,
      group: modGroup,
      bifoldInnerL,
      bifoldOuterL,
      bifoldInnerR,
      bifoldOuterR,
      louvers,
      balconyGroup,
      landingDoorL,
      landingDoorR,
      edgeGlowMat,
      interiorLight,
      interiorRig,
      currentSlideZ: 0,
      currentCurtainOpen: 0,
      currentBalconyOut: 0,
    };
  });

  // ==================== 3. 外挂式全透明钢桁架 3D 观光电梯井、曳引机房与轿厢总成 ====================
  const elevatorGroup = new THREE.Group();
  const shaftX = -8.3;
  const shaftZ = 5.3;
  const shaftW = 3.9;
  const shaftD = 3.5;
  const shaftH = 31.8;
  elevatorGroup.position.set(shaftX, 0, shaftZ);
  group.add(elevatorGroup);

  // 电梯井四角主钢柱与 Warren 交叉斜腹杆桁架
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(unitBox, darkSteelMat);
      post.scale.set(0.26, shaftH, 0.26);
      post.position.set(sx * (shaftW / 2), shaftH / 2, sz * (shaftD / 2));
      tagPickable(post, undefined, true);
      elevatorGroup.add(post);
    }
  }

  // 两侧立面 T 型导轨与水平桁架环、交叉斜撑杆
  for (const sx of [-1, 1]) {
    const guideRail = new THREE.Mesh(unitBox, brushedSteelMat);
    guideRail.scale.set(0.12, shaftH - 1, 0.18);
    guideRail.position.set(sx * (shaftW / 2 - 0.14), shaftH / 2, 0.15);
    elevatorGroup.add(guideRail);
  }

  for (let y = 2.0; y <= shaftH - 2.5; y += 3.4) {
    const ringFront = new THREE.Mesh(unitBox, brushedSteelMat);
    ringFront.scale.set(shaftW + 0.16, 0.16, 0.16);
    ringFront.position.set(0, y, shaftD / 2);
    elevatorGroup.add(ringFront);

    const ringBack = new THREE.Mesh(unitBox, brushedSteelMat);
    ringBack.scale.set(shaftW + 0.16, 0.16, 0.16);
    ringBack.position.set(0, y, -shaftD / 2);
    elevatorGroup.add(ringBack);

    for (const sx of [-1, 1]) {
      const ringSide = new THREE.Mesh(unitBox, brushedSteelMat);
      ringSide.scale.set(0.16, 0.16, shaftD + 0.16);
      ringSide.position.set(sx * (shaftW / 2), y, 0);
      elevatorGroup.add(ringSide);

      // 侧面斜拉钢杆 (Warren Truss Diagonal)
      makeBeam(
        elevatorGroup,
        new THREE.Vector3(sx * (shaftW / 2), y, -shaftD / 2),
        new THREE.Vector3(sx * (shaftW / 2), y + 3.4, shaftD / 2),
        0.048,
        brushedSteelMat,
      );
    }
  }

  // 6 根高强钢丝曳引绳
  for (const cx of [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75]) {
    const cable = new THREE.Mesh(unitCyl, brushedSteelMat);
    cable.scale.set(0.028, shaftH - 0.8, 0.028);
    cable.position.set(cx, shaftH / 2, -0.12);
    elevatorGroup.add(cable);
  }

  // 曳引机房独立成组：上传楼层增加时随井道一起抬升。
  const machineGroup = new THREE.Group();
  elevatorGroup.add(machineGroup);

  // 屋顶透明玻璃曳引机房 + 3D 永磁同步电机 + 双辐条曳引轮
  const machineFloor = new THREE.Mesh(unitBox, darkSteelMat);
  machineFloor.scale.set(shaftW + 0.8, 0.38, shaftD + 0.8);
  machineFloor.position.set(0, shaftH + 0.19, 0);
  tagPickable(machineFloor, undefined, true);
  machineGroup.add(machineFloor);

  const machineGlass = new THREE.Mesh(unitBox, cabGlassMat);
  machineGlass.scale.set(shaftW + 0.6, 2.5, shaftD + 0.6);
  machineGlass.position.set(0, shaftH + 1.6, 0);
  tagPickable(machineGlass, undefined, true);
  machineGroup.add(machineGlass);

  const machineRoof = new THREE.Mesh(unitBox, darkSteelMat);
  machineRoof.scale.set(shaftW + 0.9, 0.34, shaftD + 0.9);
  machineRoof.position.set(0, shaftH + 2.95, 0);
  machineGroup.add(machineRoof);

  const tractionMotor = new THREE.Mesh(unitCyl, cyanGlowMat);
  tractionMotor.rotation.z = Math.PI / 2;
  tractionMotor.scale.set(0.55, 1.35, 0.55);
  tractionMotor.position.set(0, shaftH + 1.55, -0.35);
  machineGroup.add(tractionMotor);

  const makePulleyWheel = (xOffset: number) => {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(xOffset, shaftH + 1.55, 0.22);
    const rim = new THREE.Mesh(unitTorus, goldGlowMat);
    rim.rotation.y = Math.PI / 2;
    rim.scale.set(0.96, 0.96, 1.25);
    wheelGroup.add(rim);
    for (let s = 0; s < 6; s++) {
      const spoke = new THREE.Mesh(unitBox, brushedSteelMat);
      spoke.scale.set(0.09, 1.82, 0.11);
      spoke.rotation.x = (s * Math.PI) / 6;
      wheelGroup.add(spoke);
    }
    machineGroup.add(wheelGroup);
    return wheelGroup;
  };
  const pulleyWheelA = makePulleyWheel(-0.58);
  const pulleyWheelB = makePulleyWheel(0.58);

  // 多层叠片式 3D 电梯配重块架 (Multi-Plate Counterweight Assembly)
  const counterweightGroup = new THREE.Group();
  counterweightGroup.position.set(0, 20, -shaftD / 2 + 0.42);
  elevatorGroup.add(counterweightGroup);

  const cwFrame = new THREE.Mesh(unitBox, darkSteelMat);
  cwFrame.scale.set(1.92, 2.65, 0.34);
  counterweightGroup.add(cwFrame);

  for (let p = -3; p <= 3; p++) {
    const plate = new THREE.Mesh(unitBox, p % 2 === 0 ? goldGlowMat : brushedSteelMat);
    plate.scale.set(1.68, 0.24, 0.38);
    plate.position.set(0, p * 0.32, 0);
    counterweightGroup.add(plate);
  }

  // ==================== 4. 全景玻璃观光轿厢总成 (Cab Group) ====================
  const cabGroup = new THREE.Group();
  const cabW = 3.4;
  const cabH = 4.85;
  const cabD = 3.0;
  const getFloorElevatorY = (idx: number) =>
    idx === 0 ? 4.8 : idx === 1 ? 18.6 : annexFloorBaseY(superstructureRig.roofY, idx - 2) + 2.9;
  let currentCabY = getFloorElevatorY(0);
  let startCabY = currentCabY;
  let targetCabY = currentCabY;
  cabGroup.position.set(0, currentCabY, 0.15);
  elevatorGroup.add(cabGroup);

  const cabLight = new THREE.PointLight(0x86e6b8, 0, 8, 1.5);
  cabLight.position.set(0, 0.8, 0);
  cabGroup.add(cabLight);

  // 轿厢底盘、减震靴与发光顶棚
  const cabFloor = new THREE.Mesh(unitBox, darkSteelMat);
  cabFloor.scale.set(cabW, 0.34, cabD);
  cabFloor.position.set(0, -cabH / 2 + 0.17, 0);
  tagPickable(cabFloor, undefined, true);
  cabGroup.add(cabFloor);

  const cabFloorGlow = new THREE.Mesh(unitBox, goldGlowMat);
  cabFloorGlow.scale.set(cabW + 0.14, 0.12, cabD + 0.14);
  cabFloorGlow.position.set(0, -cabH / 2 + 0.36, 0);
  cabGroup.add(cabFloorGlow);

  const cabRoof = new THREE.Mesh(unitBox, darkSteelMat);
  cabRoof.scale.set(cabW, 0.36, cabD);
  cabRoof.position.set(0, cabH / 2 - 0.18, 0);
  tagPickable(cabRoof, undefined, true);
  cabGroup.add(cabRoof);

  const cabCeilingLight = new THREE.Mesh(unitBox, cyanGlowMat);
  cabCeilingLight.scale.set(cabW - 0.48, 0.12, cabD - 0.48);
  cabCeilingLight.position.set(0, cabH / 2 - 0.4, 0);
  cabGroup.add(cabCeilingLight);

  // 上下四角导靴滚轮 (Roller Guide Shoes)
  for (const sx of [-1, 1]) {
    for (const sy of [-cabH / 2 + 0.25, cabH / 2 - 0.25]) {
      const shoe = new THREE.Mesh(unitBox, goldGlowMat);
      shoe.scale.set(0.22, 0.28, 0.26);
      shoe.position.set(sx * (cabW / 2 + 0.08), sy, 0);
      cabGroup.add(shoe);
    }
  }

  // 轿厢内部：不锈钢扶手杆、楼层选层操纵盘 (COP) 与 3D 访客剪影模型
  const handrail = new THREE.Mesh(unitCyl, brushedSteelMat);
  handrail.rotation.z = Math.PI / 2;
  handrail.scale.set(0.045, cabW - 0.5, 0.045);
  handrail.position.set(0, -0.35, -cabD / 2 + 0.22);
  cabGroup.add(handrail);

  const copPanel = new THREE.Mesh(unitBox, darkSteelMat);
  copPanel.scale.set(0.28, 2.2, 0.08);
  copPanel.position.set(cabW / 2 - 0.32, 0.1, cabD / 2 - 0.18);
  cabGroup.add(copPanel);

  for (let btn = 0; btn < 4; btn++) {
    const copBtn = new THREE.Mesh(unitBox, btn % 2 === 0 ? cyanGlowMat : goldGlowMat);
    copBtn.scale.set(0.12, 0.12, 0.04);
    copBtn.position.set(cabW / 2 - 0.32, -0.3 + btn * 0.26, cabD / 2 - 0.23);
    cabGroup.add(copBtn);
  }

  // 轿厢内 3D 极简几何访客人物 (3D Visitor Figure)
  const visitorGroup = new THREE.Group();
  visitorGroup.position.set(-0.35, -cabH / 2 + 0.42, -0.15);
  cabGroup.add(visitorGroup);

  const visitorTorso = new THREE.Mesh(unitCyl, brushedSteelMat);
  visitorTorso.scale.set(0.22, 1.15, 0.16);
  visitorTorso.position.set(0, 0.85, 0);
  visitorGroup.add(visitorTorso);

  const visitorHead = new THREE.Mesh(unitSphere, cyanGlowMat);
  visitorHead.scale.setScalar(0.18);
  visitorHead.position.set(0, 1.62, 0);
  visitorGroup.add(visitorHead);

  // 轿厢三面观光玻璃壁
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
  const ledMesh = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(cabW - 0.2, 0.68)), ledMat);
  ledMesh.position.set(0, cabH / 2 + 0.42, cabD / 2 + 0.06);
  cabGroup.add(ledMesh);

  // 轿厢双扇可开合 3D 玻璃滑动门
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

  const doorTrimLeft = new THREE.Mesh(unitBox, goldGlowMat);
  doorTrimLeft.scale.set(0.08, doorH, 0.16);
  doorTrimLeft.position.set(0.46, 0, 0);
  doorLeft.add(doorTrimLeft);

  const doorTrimRight = new THREE.Mesh(unitBox, goldGlowMat);
  doorTrimRight.scale.set(0.08, doorH, 0.16);
  doorTrimRight.position.set(-0.46, 0, 0);
  doorRight.add(doorTrimRight);

  // ==================== 4b. 上传页面加建楼层（3F 起，每个 HTML 一层） ====================
  const annexLight = new THREE.PointLight(0xffe2a8, 0, 18, 1.4);
  group.add(annexLight);
  let annex: ArchiveAnnex | null = null;
  const tagUserData = (obj: THREE.Object3D, floorIndex?: number, isElevator?: boolean) => {
    obj.userData.place = "slot-8";
    if (floorIndex !== undefined) obj.userData.floorIndex = floorIndex;
    if (isElevator) obj.userData.isElevator = true;
  };
  function setUploadedFloors(floors: readonly ArchiveUploadedFloor[]) {
    const removed = annex?.pickables ?? [];
    annex?.dispose();
    annex = buildArchiveAnnex(floors, {
      unitBox,
      unitCyl,
      darkSteelMat,
      brushedSteelMat,
      slabConcreteMat,
      glassMat: curtainGlassMat,
      cyanGlowMat,
      blueGlowMat,
      baseY: superstructureRig.roofY,
      centerX: floorCenterX,
      centerZ: floorCenterZ,
      floorW,
      floorD,
      spanW: 16.8,
      spanD: 12.8,
      columnCorners: superstructureRig.columnCorners,
      spineZ: floorCenterZ - 12.8 / 2 - 0.28,
      shaft: { x: shaftX, z: shaftZ, w: shaftW, d: shaftD, topY: shaftH },
      tag: tagUserData,
    });
    group.add(annex.group);
    superstructureRig.roofGroup.position.y = annex.height;
    machineGroup.position.y = annex.height;
    return { removed, added: annex.pickables };
  }
  setUploadedFloors(initialUploadedFloors);
  const floorCount = () => floorModules.length + (annex?.modules.length ?? 0);
  const getCameraTargetY = (idx: number) =>
    idx <= 0 ? 9.4 : idx === 1 ? 18.2 : annexFloorBaseY(superstructureRig.roofY, idx - 2) + ANNEX_FLOOR_HEIGHT * 0.5;

  // ==================== 5. 电梯、机械立面与楼层 3D 状态机动画 ====================
  let lastTargetFloor = 0;
  const floorLabel = (idx: number) => `${String(idx + 1).padStart(2, "0")}F`;
  let elevatorPhase: "open" | "closing" | "moving" | "opening" = "open";
  let phaseTimer = 0;
  let doorOpenRatio = 1;
  let currentDeckOffsetY = 0;

  function animate(
    dt: number,
    worldTime: number,
    isSelected: boolean,
    activeFloorIndex: number,
  ): boolean {
    const safeDt = Math.min(Math.max(dt, 0.008), 0.06);
    const clampedFloor = Math.max(0, Math.min(floorCount() - 1, activeFloorIndex));
    let stillAnimating = false;

    // 屋顶雷达、双散热风机与信标灯持续运行
    superstructureRig.update(worldTime, isSelected);

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
      const p = Math.min(1, phaseTimer / (0.62 + Math.min(1.6, Math.abs(targetCabY - startCabY) / 45)));
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      currentCabY = THREE.MathUtils.lerp(startCabY, targetCabY, eased);
      doorOpenRatio = 0;
      const goingUp = targetCabY >= startCabY;
      const spinDir = goingUp ? 1 : -1;
      pulleyWheelA.rotation.x += spinDir * safeDt * 12;
      pulleyWheelB.rotation.x -= spinDir * safeDt * 12;
      tractionMotor.rotation.x += spinDir * safeDt * 16;
      updateLedSign(
        goingUp ? `▲ UP -> ${floorLabel(clampedFloor)}` : `▼ DN -> ${floorLabel(clampedFloor)}`,
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
      updateLedSign(`${floorLabel(clampedFloor)} ● OPEN`, "#5ce0a0");
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
      updateLedSign(`${floorLabel(clampedFloor)} ● OPEN`, "#5ce0a0");
    }

    cabGroup.position.y = currentCabY + currentDeckOffsetY;
    const topCabY = getFloorElevatorY(Math.max(1, floorCount() - 1));
    const cwTravel = THREE.MathUtils.clamp((currentCabY - 4.8) / Math.max(1, topCabY - 4.8), 0, 1);
    counterweightGroup.position.y = THREE.MathUtils.lerp(shaftH + (annex?.height ?? 0) - 9, 3.2, cwTravel);
    cabLight.intensity = THREE.MathUtils.lerp(cabLight.intensity, isSelected ? 2.4 : 0, safeDt * 6);
    visitorGroup.rotation.y = Math.sin(worldTime * 1.4) * 0.25;

    const slideOffset = doorOpenRatio * 0.7;
    doorLeft.position.x = -doorW / 2 - slideOffset;
    doorRight.position.x = doorW / 2 + slideOffset;

    const targetDeckOffsetY = isSelected && clampedFloor < 2 ? (clampedFloor === 1 ? -3.2 : 1.2) : 0;
    if (Math.abs(currentDeckOffsetY - targetDeckOffsetY) > 0.015) {
      currentDeckOffsetY = THREE.MathUtils.lerp(
        currentDeckOffsetY,
        targetDeckOffsetY,
        safeDt * 7.5,
      );
      deckGroup.position.y = currentDeckOffsetY;
      stillAnimating = true;
    }

    const panelW = (floorW - 0.8) / 4;
    for (const mod of floorModules) {
      const isFloorActive = isSelected && mod.index === clampedFloor;
      const targetCurtainOpen = isSelected ? (isFloorActive ? 1 : 0.72) : 0;
      const targetSlideZ = isFloorActive ? 2.6 : isSelected ? 0.35 : 0;
      const targetBalconyOut = isFloorActive ? 1.85 : 0;

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
      if (Math.abs(mod.currentBalconyOut - targetBalconyOut) > 0.01) {
        mod.currentBalconyOut = THREE.MathUtils.lerp(
          mod.currentBalconyOut,
          targetBalconyOut,
          safeDt * 7.0,
        );
        stillAnimating = true;
      }

      // 四扇折叠玻璃幕墙滑移 + 折角打开动画
      const openRatio = mod.currentCurtainOpen;
      const innerShift = openRatio * (panelW * 1.42);
      const outerShift = openRatio * (panelW * 0.92);
      const foldAngle = openRatio * 1.12;

      mod.bifoldInnerL.position.x = -panelW * 0.5 - innerShift;
      mod.bifoldInnerL.rotation.y = foldAngle;
      mod.bifoldOuterL.position.x = -panelW * 1.5 - outerShift;
      mod.bifoldOuterL.rotation.y = -foldAngle * 0.65;

      mod.bifoldInnerR.position.x = panelW * 0.5 + innerShift;
      mod.bifoldInnerR.rotation.y = -foldAngle;
      mod.bifoldOuterR.position.x = panelW * 1.5 + outerShift;
      mod.bifoldOuterR.rotation.y = foldAngle * 0.65;

      // 顶部遮阳百叶翼随镜头拉近自动翻转打开
      for (const louver of mod.louvers) {
        louver.rotation.x = -0.35 + openRatio * 1.05;
      }

      // 悬挑玻璃观景阳台滑出与候梯厅层门同步开合
      mod.balconyGroup.position.z = floorD / 2 - 1.2 + mod.currentBalconyOut;
      const landingDoorShift = isFloorActive ? doorOpenRatio * 0.65 : 0;
      mod.landingDoorL.position.z = 3.5 - landingDoorShift;
      mod.landingDoorR.position.z = 4.7 + landingDoorShift;

      mod.group.position.z = floorCenterZ + mod.currentSlideZ;
      mod.edgeGlowMat.emissiveIntensity = isFloorActive ? 2.3 : 0.8;
      mod.interiorLight.intensity = THREE.MathUtils.lerp(
        mod.interiorLight.intensity,
        isSelected ? (isFloorActive ? 6.5 : 2.6) : 0,
        safeDt * 6,
      );

      mod.interiorRig.update(worldTime, isFloorActive);
    }

    // 上传楼层：选中层前推、发光带与室内灯增强，共享一盏跟随点光源
    let activeAnnexY: number | null = null;
    for (const mod of annex?.modules ?? []) {
      const isFloorActive = isSelected && mod.floorIndex === clampedFloor;
      const targetSlide = isFloorActive ? 1.6 : 0;
      if (Math.abs(mod.slideZ - targetSlide) > 0.01) {
        mod.slideZ = THREE.MathUtils.lerp(mod.slideZ, targetSlide, safeDt * 7);
        mod.group.position.z = floorCenterZ + mod.slideZ;
        stillAnimating = true;
      }
      mod.glowMat.emissiveIntensity = isFloorActive ? 2.4 : 0.9 + Math.sin(worldTime * 1.3 + mod.floorIndex) * 0.12;
      mod.roomMat.emissiveIntensity = isFloorActive ? 0.9 : isSelected ? 0.45 : 0.32;
      if (isFloorActive) activeAnnexY = mod.baseY;
    }
    if (activeAnnexY !== null) annexLight.position.set(floorCenterX, activeAnnexY + 2.8, floorCenterZ + 4.5);
    annexLight.intensity = THREE.MathUtils.lerp(annexLight.intensity, activeAnnexY !== null ? 5 : 0, safeDt * 6);

    return stillAnimating;
  }

  function getSpatialAnchors(activeFloorIndex: number) {
    const clamped = Math.max(0, Math.min(floorCount() - 1, activeFloorIndex));
    const annexMod = clamped >= 2 ? annex?.modules[clamped - 2] : undefined;
    const activeMod = floorModules[Math.min(clamped, floorModules.length - 1)] ?? floorModules[0]!;
    const floorWorldY = annexMod
      ? annexMod.baseY + ANNEX_FLOOR_HEIGHT * 0.5
      : activeMod.baseY + currentDeckOffsetY + floorH * 0.52;
    const elevatorWorld = new THREE.Vector3(
      lot.x + shaftX - 2.6,
      currentCabY + currentDeckOffsetY + 1.2,
      lot.z + shaftZ + 2.2,
    );
    const floorStageWorld = new THREE.Vector3(
      lot.x + floorCenterX + floorW * 0.52,
      floorWorldY,
      lot.z + floorCenterZ + (annexMod ? annexMod.slideZ : activeMod.currentSlideZ) + 2.2,
    );
    return {
      elevatorWorld,
      floorStageWorld,
      cameraTargetY: floorWorldY,
    };
  }

  function dispose() {
    annex?.dispose();
    annex = null;
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  }

  return {
    group,
    pickables,
    animate,
    getSpatialAnchors,
    setUploadedFloors,
    floorCount,
    getCameraTargetY,
    dispose,
  };
}
