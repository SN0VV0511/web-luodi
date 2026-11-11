import * as THREE from "three";

/** 后台上传的 HTML 页面在 3D 大楼上对应的一层（3F 起往上加建）。 */
export type ArchiveUploadedFloor = Readonly<{
  id: string;
  /** 楼层号，如 "3F"。 */
  code: string;
  title: string;
  subtitle: string;
}>;

export const ANNEX_FLOOR_HEIGHT = 4.6;
export const ANNEX_ACCENTS = ["#ffd175", "#6fe3e8", "#ff9f7a", "#c59bff", "#5ce0a0", "#7ab8ff"] as const;

export type AnnexContext = {
  unitBox: THREE.BoxGeometry;
  unitCyl: THREE.CylinderGeometry;
  darkSteelMat: THREE.Material;
  brushedSteelMat: THREE.Material;
  slabConcreteMat: THREE.Material;
  glassMat: THREE.Material;
  cyanGlowMat: THREE.Material;
  blueGlowMat: THREE.Material;
  /** 第一层加建楼板底标高（原屋顶标高）。 */
  baseY: number;
  centerX: number;
  centerZ: number;
  floorW: number;
  floorD: number;
  spanW: number;
  spanD: number;
  columnCorners: readonly (readonly [number, number])[];
  spineZ: number;
  shaft: { x: number; z: number; w: number; d: number; topY: number };
  tag: (obj: THREE.Object3D, floorIndex?: number, isElevator?: boolean) => void;
};

export type AnnexModule = {
  floorIndex: number;
  baseY: number;
  group: THREE.Group;
  glowMat: THREE.MeshStandardMaterial;
  roomMat: THREE.MeshStandardMaterial;
  slideZ: number;
};

export type ArchiveAnnex = {
  group: THREE.Group;
  modules: AnnexModule[];
  pickables: THREE.Object3D[];
  height: number;
  dispose: () => void;
};

export function annexFloorBaseY(baseY: number, annexIndex: number): number {
  return baseY + annexIndex * ANNEX_FLOOR_HEIGHT;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  return `${out}…`;
}

/**
 * 加建段：每个上传页面一层玻璃盒子楼层（发光窗、楼层招牌、室内“网页”全息墙），
 * 同时把四角巨柱、背立面能源管和外挂电梯井向上延伸，屋顶设备由调用方整体抬升。
 */
export function buildArchiveAnnex(floors: readonly ArchiveUploadedFloor[], ctx: AnnexContext): ArchiveAnnex {
  const group = new THREE.Group();
  group.name = "ArchiveTowerAnnex";
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const pickables: THREE.Object3D[] = [];
  const modules: AnnexModule[] = [];
  const H = ANNEX_FLOOR_HEIGHT;
  const height = floors.length * H;
  const tag = (obj: THREE.Object3D, floorIndex?: number, isElevator?: boolean) => {
    ctx.tag(obj, floorIndex, isElevator);
    pickables.push(obj);
  };
  const box = (mat: THREE.Material, sx: number, sy: number, sz: number, x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(ctx.unitBox, mat);
    mesh.scale.set(sx, sy, sz);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  const canvasTexture = (w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const c = canvas.getContext("2d");
    if (c) draw(c);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    textures.add(tex);
    return tex;
  };

  const ceilingMat = new THREE.MeshStandardMaterial({ color: "#fff6e2", emissive: "#fff1d6", emissiveIntensity: 1.3 });
  materials.add(ceilingMat);

  if (floors.length > 0) {
    const { baseY, columnCorners, shaft } = ctx;
    // 巨柱延伸 + 每层金色环箍
    for (const [cx, cz] of columnCorners) {
      const col = box(ctx.darkSteelMat, 0.68, height, 0.68, cx, baseY + height / 2, cz);
      col.castShadow = true;
      box(ctx.darkSteelMat, 0.84, height, 0.18, cx, baseY + height / 2, cz);
      box(ctx.darkSteelMat, 0.18, height, 0.84, cx, baseY + height / 2, cz);
    }
    // 背立面能源主管延伸
    for (const sx of [-1.2, 0, 1.2]) {
      const pipe = new THREE.Mesh(ctx.unitCyl, sx === 0 ? ctx.cyanGlowMat : ctx.blueGlowMat);
      pipe.scale.set(0.11, height + 0.8, 0.11);
      pipe.position.set(ctx.centerX + sx, baseY + height / 2, ctx.spineZ);
      group.add(pipe);
    }
    // 外挂电梯井延伸：四角立柱、导轨、钢丝绳与每层水平环
    const shaftGroup = new THREE.Group();
    shaftGroup.position.set(shaft.x, 0, shaft.z);
    group.add(shaftGroup);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const post = box(ctx.darkSteelMat, 0.26, height, 0.26, sx * (shaft.w / 2), shaft.topY + height / 2, sz * (shaft.d / 2), shaftGroup);
        tag(post, undefined, true);
      }
      box(ctx.brushedSteelMat, 0.12, height, 0.18, sx * (shaft.w / 2 - 0.14), shaft.topY + height / 2, 0.15, shaftGroup);
    }
    for (const cx of [-0.75, -0.45, -0.15, 0.15, 0.45, 0.75]) {
      const cable = new THREE.Mesh(ctx.unitCyl, ctx.brushedSteelMat);
      cable.scale.set(0.028, height, 0.028);
      cable.position.set(cx, shaft.topY + height / 2, -0.12);
      shaftGroup.add(cable);
    }
    for (let y = shaft.topY + 1.2; y < shaft.topY + height; y += 3.4) {
      box(ctx.brushedSteelMat, shaft.w + 0.16, 0.16, 0.16, 0, y, shaft.d / 2, shaftGroup);
      box(ctx.brushedSteelMat, shaft.w + 0.16, 0.16, 0.16, 0, y, -shaft.d / 2, shaftGroup);
    }
  }

  floors.forEach((floor, annexIndex) => {
    const floorIndex = annexIndex + 2;
    const accent = ANNEX_ACCENTS[annexIndex % ANNEX_ACCENTS.length]!;
    const accentColor = new THREE.Color(accent);
    const baseY = annexFloorBaseY(ctx.baseY, annexIndex);
    const mod = new THREE.Group();
    mod.name = `ArchiveAnnexFloor_${floor.code}`;
    mod.position.set(ctx.centerX, baseY, ctx.centerZ);
    group.add(mod);
    const w = ctx.floorW;
    const d = ctx.floorD;
    const glowMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.25 });
    materials.add(glowMat);

    // 楼板（外挑一圈与巨柱齐平）+ 板底钢梁
    const slab = box(ctx.slabConcreteMat, ctx.spanW + 0.6, 0.42, ctx.spanD + 0.6, 0, 0.21, 0, mod);
    slab.castShadow = true;
    slab.receiveShadow = true;
    tag(slab, floorIndex);
    for (let bx = -6.4; bx <= 6.4; bx += 3.2) box(ctx.darkSteelMat, 0.2, 0.22, d, bx, 0.02, 0, mod);

    // 室内：主题色背墙（夜里透出暖光）、天花灯带、两排工位与显示器、正对幕墙的“网页”全息屏
    const roomMat = new THREE.MeshStandardMaterial({
      color: "#16252c",
      emissive: accentColor.clone().multiplyScalar(0.6),
      emissiveIntensity: 0.32,
      roughness: 0.75,
    });
    materials.add(roomMat);
    const roomH = H - 0.95;
    const backWall = box(roomMat, w - 0.6, roomH, 0.14, 0, 0.42 + roomH / 2, -d / 2 + 0.45, mod);
    tag(backWall, floorIndex);
    box(ctx.darkSteelMat, w - 0.4, 0.06, d - 0.5, 0, 0.45, 0, mod);
    box(ctx.darkSteelMat, w - 0.4, 0.12, d - 0.5, 0, 0.42 + roomH - 0.06, 0, mod);
    for (const lz of [-3.2, 0, 3.2]) box(ceilingMat, w - 2.4, 0.05, 0.32, 0, 0.42 + roomH - 0.15, lz, mod);
    for (const rowZ of [-0.6, 2.4]) {
      for (const dx of [-4.6, 0, 4.6]) {
        box(ctx.darkSteelMat, 2.6, 0.08, 1.0, dx, 1.18, rowZ, mod);
        box(ctx.darkSteelMat, 0.08, 0.72, 0.8, dx - 1.2, 0.8, rowZ, mod);
        box(ctx.darkSteelMat, 0.08, 0.72, 0.8, dx + 1.2, 0.8, rowZ, mod);
        for (const mx of [-0.6, 0.6]) {
          const monitor = box(glowMat, 0.78, 0.46, 0.05, dx + mx, 1.52, rowZ - 0.32, mod);
          monitor.rotation.y = mx * -0.15;
        }
      }
    }

    const screenTex = canvasTexture(1024, 256, (c) => {
      const g = c.createLinearGradient(0, 0, 1024, 256);
      g.addColorStop(0, "#0b1a22");
      g.addColorStop(1, "#071015");
      c.fillStyle = g;
      c.fillRect(0, 0, 1024, 256);
      c.fillStyle = "#1a2c35";
      c.fillRect(0, 0, 1024, 30);
      ["#ff6b5e", "#ffd175", "#5ce0a0"].forEach((dot, i) => {
        c.fillStyle = dot;
        c.beginPath();
        c.arc(20 + i * 22, 15, 6, 0, Math.PI * 2);
        c.fill();
      });
      c.fillStyle = "#0b1a22";
      c.fillRect(100, 7, 560, 17);
      c.fillStyle = "#8fb0a6";
      c.font = "600 13px monospace";
      c.fillText(`sn0vv.top/tower/p/${floor.id}.html`, 110, 20);
      c.fillStyle = accent;
      c.font = "bold 46px sans-serif";
      c.fillText(fitText(c, floor.title, 940), 36, 96);
      c.fillStyle = "rgba(232,243,239,0.7)";
      c.font = "600 20px monospace";
      c.fillText(fitText(c, floor.subtitle, 940), 38, 130);
      c.globalAlpha = 0.55;
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i === 0 ? accent : "#24404a";
        c.fillRect(36 + i * 244, 156, 220, 74);
      }
      c.globalAlpha = 1;
    });
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
    materials.add(screenMat);
    const screenGeo = new THREE.PlaneGeometry(10.4, 2.6);
    geometries.add(screenGeo);
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.42 + roomH * 0.56, -d / 2 + 0.56);
    tag(screen, floorIndex);
    mod.add(screen);

    // 幕墙：整片玻璃 + 竖梃/横档
    const glass = box(ctx.glassMat, w, H - 0.9, 0.08, 0, 0.42 + (H - 0.9) / 2, d / 2 + 0.05, mod);
    tag(glass, floorIndex);
    for (let mx = -w / 2; mx <= w / 2 + 0.01; mx += w / 8) box(ctx.brushedSteelMat, 0.07, H - 0.9, 0.14, mx, 0.42 + (H - 0.9) / 2, d / 2 + 0.08, mod);
    box(ctx.brushedSteelMat, w, 0.06, 0.12, 0, 0.42 + (H - 0.9) * 0.66, d / 2 + 0.08, mod);
    // 侧/背立面玻璃
    for (const sx of [-1, 1]) box(ctx.glassMat, 0.08, H - 0.9, d, sx * (w / 2 + 0.04), 0.42 + (H - 0.9) / 2, 0, mod);

    // 楼板前沿发光带（选中时更亮）+ 楼层招牌
    box(glowMat, ctx.spanW + 0.7, 0.14, 0.2, 0, 0.36, ctx.spanD / 2 + 0.32, mod);
    const signTex = canvasTexture(1024, 112, (c) => {
      c.fillStyle = "#091519";
      c.fillRect(0, 0, 1024, 112);
      c.strokeStyle = accent;
      c.lineWidth = 4;
      c.strokeRect(3, 3, 1018, 106);
      c.fillStyle = accent;
      c.fillRect(14, 14, 132, 84);
      c.fillStyle = "#081210";
      c.font = "900 50px monospace";
      c.textAlign = "center";
      c.fillText(floor.code, 80, 74);
      c.textAlign = "left";
      c.fillStyle = "#f2f8f4";
      c.font = "bold 44px sans-serif";
      c.fillText(fitText(c, floor.title, 840), 168, 72);
    });
    const signMat = new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false });
    materials.add(signMat);
    const signGeo = new THREE.PlaneGeometry(w - 1.2, ((w - 1.2) * 112) / 1024);
    geometries.add(signGeo);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, H - 0.5, d / 2 + 0.16);
    tag(sign, floorIndex);
    mod.add(sign);

    // 通往电梯井的候梯连廊
    const bridge = box(ctx.darkSteelMat, 2.4, 0.26, 3.1, -w / 2 - 1.15, 0.45, 4.1, mod);
    tag(bridge, floorIndex, true);
    box(glowMat, 2.45, 0.06, 3.15, -w / 2 - 1.15, 0.6, 4.1, mod);

    modules.push({ floorIndex, baseY, group: mod, glowMat, roomMat, slideZ: 0 });
  });

  return {
    group,
    modules,
    pickables,
    height,
    dispose() {
      group.removeFromParent();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
