import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { BuildingMeshBuilder, FacadeKind, WallTexture, type Facade } from "../buildings/builder";
import { createFacadeMaterial } from "../buildings/facade-material";
import { ServiceVehicle } from "../vehicles/service-fleet";
import { SceneStage, mat } from "../scenes/props";
import { appearanceFor, gaitPose, standPose } from "../people/pose-rig";
import { createLedMaterial } from "./led-screen";

type CanvasFactory = (width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) => THREE.CanvasTexture;
export type LandmarkResult = { group: THREE.Group; pickables: THREE.Mesh[]; animate: (seconds: number, night: boolean) => void; dispose: () => void };

const facadeMaterial = (() => { let m: THREE.MeshStandardMaterial | null = null; return () => (m ??= createFacadeMaterial()); })();

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, place?: string, shadow = true): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (place) m.userData.place = place;
  return m;
}

// ======================================================================
// 邮局（留言簿 LETTERS TO SN0VV）
// ======================================================================
export function buildPostOffice(x: number, z: number, canvas: CanvasFactory, place = "guestbook"): LandmarkResult {
  const group = new THREE.Group();
  group.name = "v3 landmark · post office";
  const stage = new SceneStage("v3 post office life", 6);
  group.add(stage.group);
  const b = new BuildingMeshBuilder();
  b.setFrame({ x, y: 0.25, z: z + 0.4, yaw: 0 });
  const brick: Facade = { kind: FacadeKind.Punched, tex: WallTexture.Brick, floorH: 3.7, bay: 2.4, winW: 1.1, winH: 2.0, frame: 0, lit: 0.55, seed: 41, sill: 0.22 };
  const stone: Facade = { kind: FacadeKind.Plain, tex: WallTexture.Stone, seed: 42 };
  const roofTiles: Facade = { kind: FacadeKind.RoofTiles, seed: 43 };
  const brickColour = "#a4553c", stoneColour = "#e3d8c2", trimColour = "#f1ebdd", green = "#1f6b45";
  b.box(0, 0, 0, 17.6, 0.55, 9.8, stoneColour, stone, stone);
  b.box(0, 0.55, -0.2, 16, 7.4, 8, brickColour, brick, null);
  // 檐口 + 腰线
  b.box(0, 3.85, -0.2, 16.3, 0.22, 8.3, trimColour, stone, null);
  b.box(0, 7.95, -0.2, 16.6, 0.45, 8.6, trimColour, stone, stone);
  b.hipRoof(0, 8.4, -0.2, 16.6, 8.6, 2.2, 0.15, "#3d5a4e", roofTiles);
  // 入口门廊：石柱 + 三角山花
  b.box(0, 0.55, 4.35, 5.6, 7.4, 0.9, stoneColour, [{ kind: FacadeKind.Punched, tex: WallTexture.Stone, floorH: 3.7, bay: 2.6, winW: 1.3, winH: 2.2, frame: 2, groundH: 3.7, lit: 0.6, seed: 44 }, stone, stone, stone], stone);
  b.box(0, 0.55, 4.85, 2.6, 3.0, 0.08, "#2f3b35", { kind: FacadeKind.Door, seed: 45 }, null);
  for (const px of [-2.4, -0.9, 0.9, 2.4]) b.cylinder(px, 0.55, 5.35, 0.22, 3.6, trimColour, 12, stone);
  b.box(0, 4.15, 5.35, 5.8, 0.4, 0.9, trimColour, stone, stone);
  b.box(0, 7.95, 4.35, 6.0, 0.35, 1.1, trimColour, stone, stone);
  b.triangle([[-3.0, 8.3, 4.88], [3.0, 8.3, 4.88], [0, 9.8, 4.88]], trimColour, stone, "wall");
  // 钟楼
  b.box(0, 8.4, 0.3, 3.2, 5.2, 3.2, trimColour, stone, stone);
  b.box(0, 13.6, 0.3, 3.6, 0.35, 3.6, trimColour, stone, stone);
  b.pyramid(0, 13.95, 0.3, 3.6, 3.6, 3.2, "#3f7a62");
  b.cylinder(0, 17.1, 0.3, 0.06, 1.4, "#c9a248", 6);
  // 一层绿色遮阳棚
  for (const px of [-6.3, -3.9, 3.9, 6.3]) b.shedRoof(px, 2.75, 4.25, 1.9, 0.9, -0.35, 0, green, green, { kind: FacadeKind.Plain, seed: 47 }, { kind: FacadeKind.Plain });
  // 侧面智能快递柜
  b.box(8.6, 0.55, 1.2, 0.7, 2.2, 4.2, "#2c7a52", [{ kind: FacadeKind.Grille, seed: 48 }, { kind: FacadeKind.Grille, seed: 48 }, null, null], { kind: FacadeKind.Plain });
  const shell = mesh(b.build(), facadeMaterial(), place);
  shell.name = "v3 post office shell";
  group.add(shell);

  // 招牌（可点击）
  const signTex = canvas(1024, 192, (c) => {
    c.fillStyle = "#14532d"; c.fillRect(0, 0, 1024, 192);
    c.strokeStyle = "#e5c06a"; c.lineWidth = 6; c.strokeRect(10, 10, 1004, 172);
    c.fillStyle = "#f5d98b"; c.textAlign = "center"; c.textBaseline = "middle";
    c.font = "800 70px 'Noto Serif SC','Songti SC',Georgia,serif"; c.fillText("SN0VV 邮局", 512, 74);
    c.font = "600 34px Georgia, serif"; c.fillText("LETTERS TO SN0VV · POST OFFICE", 512, 144);
  });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: "#ffffff", emissiveIntensity: 0.25, roughness: 0.5 });
  const sign = mesh(new THREE.PlaneGeometry(5.4, 1.0), signMat, place, false);
  sign.position.set(x, 6.4, z + 0.4 + 4.85 + 0.03);
  group.add(sign);

  // 钟面 + 指针（真实时间）
  const clockTex = canvas(256, 256, (c) => {
    c.fillStyle = "#f7f1e1"; c.beginPath(); c.arc(128, 128, 120, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "#2b2b2b"; c.lineWidth = 8; c.stroke();
    c.fillStyle = "#2b2b2b"; c.font = "bold 30px Georgia"; c.textAlign = "center"; c.textBaseline = "middle";
    ["XII", "III", "VI", "IX"].forEach((n, i) => { const a = i * Math.PI / 2; c.fillText(n, 128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92); });
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.fillRect(128 + Math.sin(a) * 108 - 3, 128 - Math.cos(a) * 108 - 3, 6, 6); }
  });
  const clockMat = new THREE.MeshStandardMaterial({ map: clockTex, emissiveMap: clockTex, emissive: "#fff3d6", emissiveIntensity: 0.1, roughness: 0.4 });
  const handMat = new THREE.MeshStandardMaterial({ color: "#1d1d1d", roughness: 0.4, metalness: 0.5 });
  const hands: { hour: THREE.Mesh; minute: THREE.Mesh }[] = [];
  const clockGeo = new THREE.CircleGeometry(1.05, 32);
  const hourGeo = new THREE.BoxGeometry(0.09, 0.55, 0.03).translate(0, 0.25, 0);
  const minuteGeo = new THREE.BoxGeometry(0.06, 0.85, 0.03).translate(0, 0.4, 0);
  for (let i = 0; i < 4; i++) {
    const yaw = i * Math.PI / 2;
    const face = new THREE.Group();
    face.position.set(x + Math.sin(yaw) * 1.62, 11.9, z + 0.4 + 0.3 + Math.cos(yaw) * 1.62);
    face.rotation.y = yaw;
    face.add(mesh(clockGeo, clockMat, place, false));
    const hour = mesh(hourGeo, handMat, undefined, false), minute = mesh(minuteGeo, handMat, undefined, false);
    hour.position.z = 0.02; minute.position.z = 0.04;
    face.add(hour, minute);
    hands.push({ hour, minute });
    group.add(face);
  }
  // 绿色邮筒 ×2
  const pillar = mergeGeometries([
    new THREE.CylinderGeometry(0.36, 0.38, 1.3, 16).translate(0, 0.65, 0).toNonIndexed(),
    new THREE.SphereGeometry(0.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, 1.3, 0).toNonIndexed(),
    new THREE.CylinderGeometry(0.42, 0.42, 0.12, 16).translate(0, 0.06, 0).toNonIndexed(),
  ].map((g) => { g.deleteAttribute("uv"); return g; }))!;
  const pillarMat = new THREE.MeshStandardMaterial({ color: "#1f7a4d", roughness: 0.35, metalness: 0.2 });
  const slotMat = new THREE.MeshStandardMaterial({ color: "#111111", roughness: 0.6 });
  const boxes: THREE.Vector3[] = [];
  for (const dx of [-4.2, 4.2]) {
    const p = new THREE.Vector3(x + dx, 0.8, z + 0.4 + 6.1);
    const m = mesh(pillar, pillarMat, place); m.position.copy(p); group.add(m);
    const slot = mesh(new THREE.BoxGeometry(0.34, 0.05, 0.04), slotMat, undefined, false); slot.position.set(p.x, p.y + 1.05, p.z + 0.37); group.add(slot);
    boxes.push(p);
  }
  // 邮政车
  const van = new ServiceVehicle("boxtruck", "#1f7a4d");
  van.place(x + 12.6, 0.42, z - 1.5, Math.PI);
  van.flash(0, false);
  group.add(van.group);
  // 纸飞机：从邮筒投出的“来信”绕钟楼盘旋后飞向天空
  const planeGeo = new THREE.BufferGeometry();
  planeGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.3, -0.22, 0.02, -0.2, 0, 0, -0.15, 0, 0, 0.3, 0, 0, -0.15, 0.22, 0.02, -0.2, 0, 0, 0.3, 0, -0.06, -0.15, 0, 0, -0.15], 3));
  planeGeo.computeVertexNormals();
  const planeMat = new THREE.MeshStandardMaterial({ color: "#fbfbf7", roughness: 0.7, side: THREE.DoubleSide });
  const planes = new THREE.InstancedMesh(planeGeo, planeMat, 10);
  planes.frustumCulled = false;
  planes.castShadow = true;
  group.add(planes);
  const postman = { ...appearanceFor(1600), coat: "#1f6b45", shirt: "#d8e8d0", trousers: "#2a3a32", hat: true, glasses: false };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const bag = mesh(new THREE.BoxGeometry(0.4, 0.32, 0.16), new THREE.MeshStandardMaterial({ color: "#6b4f2a", roughness: 0.8 }));
  group.add(bag);
  const animate = (seconds: number, night: boolean) => {
    const now = new Date();
    const h = (now.getHours() % 12) + now.getMinutes() / 60, mi = now.getMinutes() + now.getSeconds() / 60;
    for (const hd of hands) { hd.hour.rotation.z = -h / 12 * Math.PI * 2; hd.minute.rotation.z = -mi / 60 * Math.PI * 2; }
    clockMat.emissiveIntensity = night ? 1.1 : 0.1;
    signMat.emissiveIntensity = night ? 1.2 : 0.25;
    for (let i = 0; i < 10; i++) {
      const k = ((seconds / 14 + i / 10) % 1 + 1) % 1;
      const start = boxes[i % 2];
      const a = k * Math.PI * 4 + i;
      const r = 2.5 + k * 6;
      v.set(x + Math.sin(a) * r * (1 - k * 0.3) + (start.x - x) * (1 - Math.min(1, k * 4)), start.y + 1.2 + k * 22, z + 0.7 + Math.cos(a) * r + (start.z - z) * (1 - Math.min(1, k * 4)));
      e.set(-0.2, a + Math.PI / 2, Math.sin(seconds * 3 + i) * 0.3);
      q.setFromEuler(e);
      const s = k > 0.85 ? (1 - k) / 0.15 : Math.min(1, k * 12);
      m4.compose(v, q, one.set(s, s, s));
      planes.setMatrixAt(i, m4);
    }
    planes.instanceMatrix.needsUpdate = true;
    // 邮递员：在邮筒与门廊之间取信
    stage.begin();
    const C = 24, tau = ((seconds % C) + C) % C;
    const a0 = boxes[0], door = new THREE.Vector3(x, 0.8, z + 0.4 + 6.0), a1 = boxes[1];
    const route = [door, a0, a0, door, a1, a1, door];
    const seg = Math.min(5.999, (tau / C) * 6), i = Math.floor(seg), k = seg - i;
    const p0 = route[i], p1 = route[i + 1];
    const px = THREE.MathUtils.lerp(p0.x, p1.x, k), pz = THREE.MathUtils.lerp(p0.z, p1.z, k) + 0.6;
    const moving = p0.distanceTo(p1) > 0.1;
    const heading = moving ? Math.atan2(p1.x - p0.x, p1.z - p0.z) : Math.PI;
    const spec = moving ? gaitPose(px, 0.8, pz, heading, seconds * 6.5, 0) : standPose(px, 0.8, pz, Math.PI, seconds, { right: [-1.2, -1.7, 0.1] });
    const pose = stage.person(spec, postman);
    if (pose) { bag.position.set(pose.hips.x + Math.cos(heading) * 0.28, pose.hips.y + 0.05, pose.hips.z - Math.sin(heading) * 0.28); bag.rotation.y = heading; }
    stage.end();
  };
  return { group, pickables: [sign, shell], animate, dispose: () => { stage.dispose(); van.dispose(); } };
}

// ======================================================================
// 新闻传媒塔（THE CITY PRESS）
// ======================================================================
const HEADLINES = [
  "城市快讯 CITY NEWS", "中央湖畔垂钓赛今日开竿 · Lakeside angling open starts today", "海滩排球联赛进入决赛周 · Beach volleyball league reaches finals",
  "北城塔吊完成主体结构第五层 · Tower crane tops out level five", "今晚南草坪露天音乐会 19:30 · Open-air concert on the South Lawn tonight",
  "交警提示：海滨大道晚高峰缓行 · Coastal avenue slow at rush hour", "120 急救演练圆满完成 · Ambulance drill completed",
  "周末集市：手作、鲜花与咖啡 · Weekend market: crafts, flowers, coffee", "SN0VV 城市 v3 上线 · SN0VV City v3 goes live",
];

export function buildNewsTower(x: number, z: number, canvas: CanvasFactory, place = "news"): LandmarkResult {
  const group = new THREE.Group();
  group.name = "v3 landmark · news media tower";
  const stage = new SceneStage("v3 newsroom life", 6);
  group.add(stage.group);
  const b = new BuildingMeshBuilder();
  const fz = z + 0.4;
  b.setFrame({ x, y: 0.25, z: fz, yaw: 0 });
  const curtain: Facade = { kind: FacadeKind.Curtain, floorH: 3.6, bay: 1.5, frame: 3, lit: 0.85, seed: 61 };
  const ribbon: Facade = { kind: FacadeKind.Ribbon, floorH: 3.6, bay: 2, frame: 1, lit: 0.7, seed: 62, tex: WallTexture.Panels };
  const plain: Facade = { kind: FacadeKind.Plain, tex: WallTexture.Panels, seed: 63 };
  b.box(0, 0, 0, 17.6, 0.55, 9.8, "#cfd3d6", plain, plain);
  b.box(0, 0.55, 0, 16.4, 7.0, 8.6, "#dfe3e6", [curtain, ribbon, ribbon, ribbon], plain);
  b.box(0, 7.55, 0, 16.8, 0.35, 9.0, "#2b3036", plain, plain);
  b.box(-1.8, 7.9, -0.8, 9.6, 24, 6.8, "#c9d2d8", [curtain, curtain, curtain, curtain], plain);
  b.box(-1.8, 31.9, -0.8, 10.0, 0.5, 7.2, "#2b3036", plain, plain);
  b.box(-3.5, 32.4, -1.5, 3.6, 2.4, 3.0, "#8f969c", plain, plain);
  // 竖向 LED 鳍板支架
  b.box(3.6, 7.9, 2.7, 0.5, 23, 0.5, "#2b3036", plain, plain);
  const shell = mesh(b.build(), facadeMaterial(), place);
  shell.name = "v3 news tower shell";
  group.add(shell);
  const metal = new THREE.MeshStandardMaterial({ color: "#b8c0c6", roughness: 0.35, metalness: 0.75 });
  // 天线桅杆 + 卫星天线
  const mast = mesh(mergeGeometries([
    new THREE.CylinderGeometry(0.08, 0.16, 11, 6).translate(0, 5.5, 0).toNonIndexed(),
    ...[2, 4.5, 7].map((y) => new THREE.BoxGeometry(1.2 - y * 0.08, 0.06, 0.06).translate(0, y, 0).toNonIndexed()),
  ].map((g) => { g.deleteAttribute("uv"); return g; }))!, metal);
  mast.position.set(x + 0.8, 32.4, fz - 1.5);
  group.add(mast);
  const beaconMat = new THREE.MeshStandardMaterial({ color: "#ff2b1c", emissive: "#ff2b1c", emissiveIntensity: 1, roughness: 0.3 });
  const beacon = mesh(new THREE.SphereGeometry(0.16, 10, 8), beaconMat, undefined, false);
  beacon.position.set(x + 0.8, 43.5, fz - 1.5);
  group.add(beacon);
  const dishGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, 0.9);
  for (const [dx, dz, s, tilt] of [[-6.2, 1.2, 1.1, 0.7], [-4.6, 1.8, 0.75, 0.9], [1.6, 1.4, 0.9, 0.6]] as const) {
    const dish = mesh(dishGeo, new THREE.MeshStandardMaterial({ color: "#eceff1", roughness: 0.5, side: THREE.DoubleSide }));
    dish.scale.setScalar(s); dish.position.set(x + dx, 32.6 + s * 0.8, fz + dz - 1.5); dish.rotation.set(tilt, 0.6, 0);
    group.add(dish);
  }
  // 环形新闻滚动字幕（裙楼顶部）
  const tickerTex = canvas(4096, 96, (c) => {
    c.fillStyle = "#070a10"; c.fillRect(0, 0, 4096, 96);
    c.textBaseline = "middle"; c.font = "700 52px 'Noto Sans SC','PingFang SC',Arial,sans-serif";
    let cx = 20;
    for (const [i, h] of HEADLINES.entries()) {
      c.fillStyle = i === 0 ? "#ff3b30" : "#ffd166"; c.fillText(i === 0 ? "● " + h : h, cx, 50);
      cx += c.measureText(h).width + 80;
      c.fillStyle = "#4cc9f0"; c.fillText("◆", cx - 55, 50);
    }
  });
  tickerTex.wrapS = THREE.RepeatWrapping;
  const tickerMat = new THREE.MeshBasicMaterial({ map: tickerTex, toneMapped: false });
  const tickers: THREE.Mesh[] = [];
  const band = (w: number, px: number, pz: number, yaw: number, repeat: number) => {
    const t = tickerTex.clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.x = repeat;
    const m = mesh(new THREE.PlaneGeometry(w, 1.0), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), place, false);
    m.position.set(x + px, 6.95, fz + pz); m.rotation.y = yaw; group.add(m); tickers.push(m);
  };
  band(16.4, 0, 4.33, 0, 0.32); band(8.6, 8.23, 0, Math.PI / 2, 0.17); band(8.6, -8.23, 0, -Math.PI / 2, 0.17);
  void tickerMat;
  // 竖向 “NEWS 新闻” LED 鳍板
  const finTex = canvas(128, 1024, (c) => {
    c.fillStyle = "#0b0d12"; c.fillRect(0, 0, 128, 1024);
    c.fillStyle = "#ff3b30"; c.font = "900 96px Arial"; c.textAlign = "center"; c.textBaseline = "middle";
    "NEWS".split("").forEach((ch, i) => c.fillText(ch, 64, 90 + i * 120));
    c.fillStyle = "#ffffff"; c.font = "900 92px 'Noto Sans SC','PingFang SC',sans-serif";
    "新闻".split("").forEach((ch, i) => c.fillText(ch, 64, 640 + i * 130));
  });
  const finMat = createLedMaterial(finTex, 32, 256, { modules: [1, 8], brightness: 1.6 });
  const fin = mesh(new THREE.PlaneGeometry(1.3, 20), finMat, place, false);
  fin.position.set(x + 3.6, 19, fz + 2.97);
  group.add(fin);
  // 塔身大屏：直播画面（每 0.5 s 重绘）
  const liveCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  let liveTex: THREE.Texture;
  if (liveCanvas) { liveCanvas.width = 512; liveCanvas.height = 288; liveTex = new THREE.CanvasTexture(liveCanvas); (liveTex as THREE.CanvasTexture).colorSpace = THREE.SRGBColorSpace; }
  else liveTex = new THREE.Texture();
  const drawLive = (seconds: number) => {
    const c = liveCanvas?.getContext("2d");
    if (!c) return;
    const g = c.createLinearGradient(0, 0, 512, 288); g.addColorStop(0, "#0d1b2a"); g.addColorStop(1, "#1b263b");
    c.fillStyle = g; c.fillRect(0, 0, 512, 288);
    // 主播剪影 + 背景城市
    c.fillStyle = "#24364f"; for (let i = 0; i < 14; i++) c.fillRect(i * 38, 150 - ((i * 37) % 70), 30, 140);
    c.fillStyle = "#e0a96d"; c.beginPath(); c.arc(256, 120, 34, 0, Math.PI * 2); c.fill();
    c.fillStyle = "#2b2d42"; c.beginPath(); c.moveTo(186, 288); c.quadraticCurveTo(256, 150, 326, 288); c.fill();
    const mouth = Math.abs(Math.sin(seconds * 9)) * 6;
    c.fillStyle = "#7a3b2e"; c.fillRect(248, 134, 16, 2 + mouth);
    c.fillStyle = "#d62828"; c.fillRect(0, 230, 512, 58);
    c.fillStyle = "#ffffff"; c.font = "700 28px 'Noto Sans SC',Arial"; c.textBaseline = "middle";
    c.fillText(HEADLINES[1 + Math.floor(seconds / 6) % (HEADLINES.length - 1)].split(" · ")[0], 16, 259);
    c.fillStyle = "#d62828"; c.fillRect(16, 16, 92, 34); c.fillStyle = "#fff"; c.font = "800 24px Arial"; c.fillText("● LIVE", 24, 34);
    const now = new Date(); c.font = "700 22px monospace"; c.textAlign = "right";
    c.fillText(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`, 496, 34); c.textAlign = "left";
    liveTex.needsUpdate = true;
  };
  drawLive(0);
  const screenMat = createLedMaterial(liveTex, 256, 144, { modules: [8, 4], brightness: 1.4 });
  const screen = mesh(new THREE.PlaneGeometry(8.4, 4.7), screenMat, place, false);
  screen.position.set(x - 1.8, 24.5, fz + 2.62);
  group.add(screen);
  // 招牌（可点击）
  const signTex = canvas(1024, 160, (c) => {
    c.fillStyle = "#111418"; c.fillRect(0, 0, 1024, 160);
    c.fillStyle = "#ff3b30"; c.fillRect(0, 0, 150, 160);
    c.fillStyle = "#fff"; c.font = "900 64px Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("CP", 75, 82);
    c.textAlign = "left"; c.font = "800 72px Georgia, serif"; c.fillText("THE CITY PRESS", 180, 66);
    c.font = "600 30px 'Noto Sans SC',Arial"; c.fillStyle = "#c9d1d9"; c.fillText("城市日报 · 新闻传媒中心  NEWSROOM & STUDIOS", 182, 124);
  });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: "#ffffff", emissiveIntensity: 0.3, roughness: 0.4 });
  const sign = mesh(new THREE.PlaneGeometry(10.5, 1.64), signMat, place, false);
  sign.position.set(x - 1.8, 9.2, fz + 2.62);
  group.add(sign);
  // 转播车 + 记者出镜
  const van = new ServiceVehicle("boxtruck", "#f4f4f4");
  van.place(x + 12.2, 0.42, z + 0.5, 0);
  van.flash(0, false);
  group.add(van.group);
  const dish = mesh(dishGeo, new THREE.MeshStandardMaterial({ color: "#f1f1f1", roughness: 0.5, side: THREE.DoubleSide }));
  dish.scale.setScalar(0.8); dish.position.set(x + 12.2, 4.6, z - 1); dish.rotation.set(-0.9, 0.4, 0);
  group.add(dish);
  const reporter = { ...appearanceFor(1700), coat: "#9b2226", skirt: true, hairStyle: 3, glasses: false };
  const camOp = { ...appearanceFor(1701), coat: "#343a40", hat: true, glasses: false };
  const camera = mesh(new THREE.BoxGeometry(0.22, 0.26, 0.55), new THREE.MeshStandardMaterial({ color: "#1c1c1c", roughness: 0.4, metalness: 0.4 }));
  const mic = mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.22, 8), new THREE.MeshStandardMaterial({ color: "#222", roughness: 0.4 }));
  const tripodLight = mesh(new THREE.BoxGeometry(0.45, 0.35, 0.1), new THREE.MeshStandardMaterial({ color: "#eeeeee", emissive: "#fff6e0", emissiveIntensity: 1.2 }), undefined, false);
  group.add(camera, mic, tripodLight);
  tripodLight.position.set(x + 9.6, 2.0, z + 7.5);
  let lastDraw = -1;
  const animate = (seconds: number, night: boolean) => {
    for (const [i, t] of tickers.entries()) { const map = (t.material as THREE.MeshBasicMaterial).map!; map.offset.x = (seconds * 0.035 + i * 0.37) % 1; }
    for (const m of [finMat, screenMat]) { m.uniforms.uTime.value = seconds; m.uniforms.uNight.value = night ? 1 : 0; }
    if (Math.floor(seconds * 2) !== lastDraw) { lastDraw = Math.floor(seconds * 2); drawLive(seconds); }
    beaconMat.emissiveIntensity = Math.sin(seconds * 3) > 0.6 ? (night ? 5 : 2) : 0.05;
    signMat.emissiveIntensity = night ? 1.3 : 0.3;
    stage.begin();
    const rx = x + 8.4, rz = z + 8.6;
    const talk = Math.sin(seconds * 2.2);
    const rp = stage.person(standPose(rx, 0.42, rz, -Math.PI * 0.75, seconds, { right: [-1.4, -2.3, 0.15], left: [0.1 + talk * 0.15, -0.6 + talk * 0.4, 0.15] }), reporter);
    if (rp) { mic.position.copy(rp.rightHand).add(new THREE.Vector3(0, 0.1, 0)); mic.rotation.set(0.4, 0, 0); }
    const cp = stage.person(standPose(rx - 2.2, 0.42, rz - 2.2, Math.PI * 0.25, seconds, { right: [-2.4, -3.0, 0.3], left: [-1.2, -1.9, 0.1] }), camOp);
    if (cp) { camera.position.set(cp.head.x + 0.18, cp.head.y - 0.02, cp.head.z + 0.18); camera.rotation.set(0, Math.PI / 4, 0); }
    stage.end();
  };
  return { group, pickables: [sign, shell, screen], animate, dispose: () => { stage.dispose(); van.dispose(); } };
}

// ======================================================================
// SN0VV 广告牌：背部桁架、检修走道、护栏、LED 模组箱体与夜间光晕
// ======================================================================
export function buildBillboardStructure(cx: number, cy: number, cz: number, width: number, height: number): LandmarkResult {
  const group = new THREE.Group();
  group.name = "v3 landmark · billboard structure";
  const steel = new THREE.MeshStandardMaterial({ color: "#3a4146", roughness: 0.45, metalness: 0.7 });
  const parts: THREE.BufferGeometry[] = [];
  const bar = (a: THREE.Vector3, b: THREE.Vector3, r = 0.12) => {
    const d = new THREE.Vector3().subVectors(b, a); const l = d.length();
    const g = new THREE.BoxGeometry(r, l, r);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g.toNonIndexed());
  };
  const back = cz - 2.4, back2 = cz - 4.0;
  const y0 = cy - height / 2, y1 = cy + height / 2;
  // 背部空间桁架
  for (let x = cx - width / 2; x <= cx + width / 2 + 0.01; x += width / 12) {
    bar(new THREE.Vector3(x, y0, back), new THREE.Vector3(x, y1, back), 0.18);
    bar(new THREE.Vector3(x, y0 + 1, back2), new THREE.Vector3(x, y1 - 1, back2), 0.14);
    for (let y = y0; y < y1 - 0.1; y += height / 6) {
      bar(new THREE.Vector3(x, y, back), new THREE.Vector3(x, y + height / 6, back2), 0.08);
      bar(new THREE.Vector3(x, y, back), new THREE.Vector3(x, y, back2), 0.08);
    }
  }
  for (let y = y0; y <= y1 + 0.01; y += height / 6) bar(new THREE.Vector3(cx - width / 2, y, back), new THREE.Vector3(cx + width / 2, y, back), 0.14);
  // 检修走道 + 护栏
  const walkY = y0 - 0.6;
  parts.push(new THREE.BoxGeometry(width + 1, 0.08, 1.3).translate(cx, walkY, cz + 0.9).toNonIndexed());
  for (let x = cx - width / 2 - 0.4; x <= cx + width / 2 + 0.41; x += 2.5) {
    bar(new THREE.Vector3(x, walkY, cz + 1.5), new THREE.Vector3(x, walkY + 1.1, cz + 1.5), 0.06);
    bar(new THREE.Vector3(x, walkY, cz + 1.5), new THREE.Vector3(x, walkY - 0.4, cz - 0.2), 0.06);
  }
  bar(new THREE.Vector3(cx - width / 2 - 0.4, walkY + 1.1, cz + 1.5), new THREE.Vector3(cx + width / 2 + 0.4, walkY + 1.1, cz + 1.5), 0.06);
  bar(new THREE.Vector3(cx - width / 2 - 0.4, walkY + 0.55, cz + 1.5), new THREE.Vector3(cx + width / 2 + 0.4, walkY + 0.55, cz + 1.5), 0.04);
  // 爬梯
  for (let y = 1; y < walkY; y += 0.4) bar(new THREE.Vector3(cx - width / 2 + 0.2, y, cz - 0.3), new THREE.Vector3(cx - width / 2 + 0.8, y, cz - 0.3), 0.04);
  for (const dx of [0.2, 0.8]) bar(new THREE.Vector3(cx - width / 2 + dx, 0.5, cz - 0.3), new THREE.Vector3(cx - width / 2 + dx, walkY, cz - 0.3), 0.05);
  const truss = mesh(mergeGeometries(parts.map((g) => { g.deleteAttribute("uv"); return g; }))!, steel);
  truss.name = "v3 billboard truss";
  group.add(truss);
  // 顶部检修灯箱 + 夜间光晕
  const haloMat = new THREE.MeshBasicMaterial({ color: "#7fb7ff", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(width + 8, height + 8), haloMat);
  halo.position.set(cx, cy, cz - 3);
  halo.visible = false;
  halo.renderOrder = 3;
  group.add(halo);
  const lampMat = new THREE.MeshStandardMaterial({ color: "#dddddd", emissive: "#fff2cc", emissiveIntensity: 0.1 });
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.25, 0.4), lampMat, 8);
  for (let i = 0; i < 8; i++) lamps.setMatrixAt(i, new THREE.Matrix4().makeTranslation(cx - width / 2 + (i + 0.5) * width / 8, walkY + 0.2, cz + 1.2));
  group.add(lamps);
  const animate = (_seconds: number, night: boolean) => {
    haloMat.opacity = 0;
    lampMat.emissiveIntensity = night ? 1.5 : 0.1;
  };
  return { group, pickables: [], animate, dispose: () => { truss.geometry.dispose(); steel.dispose(); halo.geometry.dispose(); haloMat.dispose(); lamps.geometry.dispose(); lampMat.dispose(); } };
}
void mat;
