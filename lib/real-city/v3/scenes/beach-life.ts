import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { appearanceFor, gaitPose, standPose, swimAppearance, type PoseSpec } from "../people/pose-rig";
import type { SceneStage } from "./props";
import { mat } from "./props";
import type { Appearance } from "../../life/types";

/** 海滩：沙面 y≈0.25，海面 y=-0.65；岸线 z(x) 与 city-coast 的沙岸轮廓一致。 */
export const BEACH = { sand: 0.25, sea: -0.65 };
export const shoreZ = (x: number) => { const p = (-77 - x) / 151; return 112 + Math.sin(p * Math.PI) * 47 + Math.sin(p * Math.PI * 3) * 3; };
const fract = (x: number) => x - Math.floor(x);
const hash = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const ease = (k: number) => k * k * (3 - 2 * k);

type Hit = { t: number; side: number; player: number; x: number; z: number; h: number; kind: "serve" | "bump" | "set" | "spike" | "ground"; apex: number };
const NET_Z = 119, COURT_X0 = -179, COURT_X1 = -165;

/** 一局回合：发球 → (接一传 / 二传 / 扣杀) × 3 → 落地；确定性生成。 */
export function volleyRally(cycle: number): { hits: Hit[]; length: number } {
  const hits: Hit[] = [];
  const r = (k: number) => hash(cycle * 17.3 + k);
  const sideZ = (side: number, depth: number) => side === 0 ? NET_Z - depth : NET_Z + depth;
  const randX = (k: number) => THREE.MathUtils.lerp(COURT_X0 + 1.5, COURT_X1 - 1.5, r(k));
  let t = 0;
  const server = cycle % 2;
  hits.push({ t, side: server, player: 0, x: randX(1), z: sideZ(server, 5.6), h: 2.7, kind: "serve", apex: 3.2 });
  t += 1.55;
  let side = 1 - server;
  const exchanges = 2 + Math.floor(r(2) * 3);
  for (let e = 0; e < exchanges; e++) {
    const receiver = r(10 + e) < 0.5 ? 0 : 1;
    const setter = 1 - receiver;
    hits.push({ t, side, player: receiver, x: randX(20 + e), z: sideZ(side, 2.6 + r(30 + e) * 2.4), h: 0.85, kind: "bump", apex: 3.6 });
    t += 1.45;
    hits.push({ t, side, player: setter, x: randX(40 + e) * 0.4 + (COURT_X0 + COURT_X1) * 0.3, z: sideZ(side, 1.4), h: 2.25, kind: "set", apex: 1.9 });
    t += 1.15;
    hits.push({ t, side, player: receiver, x: randX(50 + e) * 0.5 + (COURT_X0 + COURT_X1) * 0.25, z: sideZ(side, 1.0), h: 2.95, kind: "spike", apex: 0.35 });
    t += e === exchanges - 1 ? 0.65 : 0.85;
    side = 1 - side;
  }
  hits.push({ t, side, player: -1, x: randX(90), z: sideZ(side, 1.5 + r(91) * 3.5), h: 0.36, kind: "ground", apex: 0 });
  return { hits, length: t + 3.2 };
}

function createParasol(colors: string[]): THREE.BufferGeometry {
  const segs = colors.length * 2;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const g = new THREE.BufferGeometry();
    const R = 1.25, H = 0.42;
    const p = [0, H, 0, Math.cos(a1) * R, 0, Math.sin(a1) * R, Math.cos(a0) * R, 0, Math.sin(a0) * R];
    // 扇面下缘垂边
    const drop = 0.12;
    p.push(Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, 0, Math.sin(a1) * R, Math.cos(a1) * R, -drop, Math.sin(a1) * R);
    p.push(Math.cos(a0) * R, 0, Math.sin(a0) * R, Math.cos(a1) * R, -drop, Math.sin(a1) * R, Math.cos(a0) * R, -drop, Math.sin(a0) * R);
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    const c = new THREE.Color(colors[i % colors.length]);
    g.setAttribute("color", new THREE.Float32BufferAttribute(Array.from({ length: 9 }, () => [c.r, c.g, c.b]).flat(), 3));
    g.computeVertexNormals();
    parts.push(g);
  }
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 2.3, 6).translate(0, -1.0, 0).toNonIndexed();
  pole.deleteAttribute("uv");
  pole.setAttribute("color", new THREE.Float32BufferAttribute(new Array(pole.getAttribute("position").count * 3).fill(0.92), 3));
  parts.push(pole);
  return mergeGeometries(parts)!;
}

export function buildBeachLife(stage: SceneStage) {
  const ballGeo = (() => {
    const g = new THREE.SphereGeometry(0.11, 14, 10).toNonIndexed();
    const pos = g.getAttribute("position");
    const col: number[] = [];
    const yellow = new THREE.Color("#f5d33a"), blue = new THREE.Color("#2a5cc9"), white = new THREE.Color("#f6f6f2");
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, cy = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const a = Math.atan2(cz, cx) + cy * 9;
      const c = [yellow, blue, white][Math.floor(((a / (Math.PI * 2)) * 3 + 3) % 3)];
      for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    return g;
  })();
  const vc = stage.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
  const ballPool = stage.pool("v3 beach volleyball", ballGeo, vc, 3);
  const unit = stage.geometry(new THREE.BoxGeometry(1, 1, 1));
  const towelPool = stage.pool("v3 beach towels", unit, stage.material(mat("#ffffff", 0.95)), 24, false);
  const stripePool = stage.pool("v3 beach towel stripes", unit, stage.material(mat("#ffffff", 0.95)), 24, false);
  const parasols = [["#e94f37", "#f6f1e7"], ["#2d7dd2", "#f6f1e7"], ["#f7b32b", "#2d7dd2"], ["#3bb273", "#f6f1e7"], ["#e15a97", "#ffe066"]];
  const parasolPools = parasols.map((cols, i) => stage.pool(`v3 beach parasol ${i}`, createParasol(cols.concat(cols).concat(cols).concat(cols)), vc, 4));
  const castlePool = stage.pool("v3 beach sandcastle", stage.geometry(new THREE.CylinderGeometry(1, 1.15, 1, 10)), stage.material(mat("#d2b27a", 0.95)), 8);
  const bucketPool = stage.pool("v3 beach toys", stage.geometry(new THREE.CylinderGeometry(1, 0.8, 1, 10)), stage.material(mat("#ffffff", 0.5)), 4);

  // ---------- 沙滩布局 ----------
  type Spot = { x: number; z: number; heading: number; kind: "towel" | "lounger"; pose: "back" | "front" | "sit" | "read"; look: Appearance; towel: [string, string]; parasol: number };
  const spots: Spot[] = [];
  const towelColors: [string, string][] = [["#e94f37", "#f6f1e7"], ["#2d7dd2", "#ffe066"], ["#3bb273", "#f6f1e7"], ["#8e5ad6", "#ffd1dc"], ["#f7b32b", "#2d7dd2"], ["#e15a97", "#f6f1e7"], ["#1b998b", "#fffd82"]];
  const suits = ["#e63946", "#1d3557", "#2a9d8f", "#f4a261", "#8338ec", "#ff006e", "#111111", "#06d6a0"];
  // 已有遮阳伞下的躺椅 (city-coast) → 放上晒太阳的人
  const existing: [number, number][] = [[-198, 126], [-176, 137], [-151, 144], [-121, 134], [-100, 122]];
  for (const [i, [x, z]] of existing.entries()) for (const [k, dx] of [-1.6, 1.6].entries()) {
    if (hash(i * 3 + k) < 0.3) continue;
    const look = swimAppearance(appearanceFor(500 + i * 2 + k), suits[(i * 2 + k) % suits.length]);
    spots.push({ x: x + dx, z: z + 1.9, heading: 0, kind: "lounger", pose: hash(i + k * 7) < 0.3 ? "read" : "back", look, towel: towelColors[0], parasol: -1 });
  }
  // 新增彩色条纹遮阳伞 + 浴巾
  const extra: [number, number][] = [[-214, 128], [-188, 140], [-163, 150], [-138, 150], [-111, 141], [-92, 131], [-206, 140], [-129, 128]];
  for (const [i, [x, z]] of extra.entries()) {
    const zz = Math.min(z, shoreZ(x) - 7);
    for (let k = 0; k < 2; k++) {
      const look = swimAppearance(appearanceFor(600 + i * 2 + k), suits[(i + k * 3) % suits.length]);
      const pose = (["back", "front", "sit", "back", "read"] as const)[Math.floor(hash(i * 5 + k) * 5)];
      spots.push({ x: x + (k ? 1.1 : -1.1), z: zz + 0.9, heading: (hash(i + k) - 0.5) * 0.5, kind: "towel", pose, look, towel: towelColors[(i + k) % towelColors.length], parasol: i % parasols.length });
    }
  }
  const parasolSpots = extra.map(([x, z], i) => ({ x, z: Math.min(z, shoreZ(x) - 7), p: i % parasols.length, tilt: (hash(i) - 0.5) * 0.25 }));

  const players: Appearance[] = [0, 1, 2, 3].map((i) => swimAppearance({ ...appearanceFor(700 + i), hairStyle: i % 2 ? 3 : 0, skirt: false }, i < 2 ? "#e63946" : "#1d3557"));
  const swimmers = Array.from({ length: 7 }, (_, i) => ({ x: -205 + i * 17 + hash(i) * 6, off: 7 + hash(i + 4) * 14, style: i % 3, look: swimAppearance(appearanceFor(800 + i), suits[i % suits.length]), phase: hash(i + 8) * 10 }));
  const kids = [0, 1].map((i) => ({ ...appearanceFor(900 + i, true), coat: ["#ff6b6b", "#4ecdc4"][i], trousers: ["#ffe66d", "#1a535c"][i], shorts: true, sleeveLength: 0.3 }));
  const lifeguard: Appearance = { ...appearanceFor(950), coat: "#e63946", shirt: "#e63946", trousers: "#e63946", shorts: true, sleeveLength: 0.3, hat: true };
  const walkers: Appearance[] = [{ ...appearanceFor(960), coat: "#f1faee", shorts: true }, { ...appearanceFor(961), coat: "#a8dadc", skirt: true, hairStyle: 2 }];
  const castle = { x: -142, z: shoreZ(-142) - 3.2 };

  const lyingPose = (s: Spot, y: number, t: number, i: number): PoseSpec => {
    const prone = s.pose === "front";
    const pitch = prone ? Math.PI / 2 - 0.02 : -Math.PI / 2 + (s.pose === "read" ? 0.5 : 0.04);
    const arms = s.pose === "read" ? { upper: -2.2, lower: -2.9 } : prone ? { upper: -2.6, lower: -2.0 } : { upper: 0.1, lower: -0.05 };
    const legLift = s.pose === "read" ? -(Math.PI / 2 - 0.5) + Math.PI / 2 - 0.5 : 0;
    return {
      x: s.x, y, z: s.z, heading: s.heading + (prone ? Math.PI : 0), hipsY: 0.13, bodyPitch: pitch,
      left: { thigh: legLift, shin: legLift + (i % 3 === 0 && !prone ? -0.6 : 0), upper: arms.upper, lower: arms.lower, armOut: prone ? 0.5 : 0.15, legOut: 0.06 },
      right: { thigh: legLift, shin: legLift + (prone ? 0.9 + Math.sin(t * 0.8 + i) * 0.4 : 0), upper: arms.upper, lower: arms.lower, armOut: prone ? 0.5 : 0.15, legOut: 0.06 },
      headPitch: prone ? 0.25 : s.pose === "read" ? 0.6 : -0.1,
    };
  };

  const animate = (seconds: number) => {
    const t = seconds;
    // 浴巾 / 遮阳伞
    for (const s of spots) if (s.kind === "towel") {
      towelPool.add(s.x, BEACH.sand + 0.012, s.z, s.heading, 0, 0, 0.95, 0.02, 1.95, s.towel[0]);
      for (const dz of [-0.6, 0, 0.6]) stripePool.add(s.x, BEACH.sand + 0.024, s.z + dz, s.heading, 0, 0, 0.95, 0.01, 0.16, s.towel[1]);
    }
    for (const p of parasolSpots) parasolPools[p.p].add(p.x, BEACH.sand + 2.35, p.z, t * 0 + p.x, p.tilt, 0, 1.25);
    // 晒太阳的人
    for (const [i, s] of spots.entries()) {
      const y = s.kind === "lounger" ? 0.72 : BEACH.sand + 0.03;
      if (s.pose === "sit") {
        stage.person({ x: s.x, y: BEACH.sand, z: s.z - 0.3, heading: s.heading + Math.PI, hipsY: 0.12, lean: -0.25,
          left: { thigh: -1.35, shin: -0.4, upper: 0.5, lower: 0.4, armOut: 0.25 }, right: { thigh: -1.5, shin: -1.4, upper: 0.5, lower: 0.4, armOut: 0.25 }, headYaw: Math.sin(t * 0.2 + i) * 0.4 }, s.look);
      } else stage.person(lyingPose(s, y, t, i), s.look);
    }
    // ---------- 排球 ----------
    {
      const RALLY_CYCLE = 20;
      const cycle = Math.floor(t / RALLY_CYCLE);
      const rally = volleyRally(cycle);
      const local = t - cycle * RALLY_CYCLE;
      const hits = rally.hits;
      let i = 0;
      while (i < hits.length - 1 && hits[i + 1].t <= local) i++;
      const cur = hits[i], next = hits[Math.min(i + 1, hits.length - 1)];
      const span = Math.max(0.01, next.t - cur.t);
      const k = THREE.MathUtils.clamp((local - cur.t) / span, 0, 1);
      let bx: number, by: number, bz: number;
      if (cur.kind === "ground") {
        // 落地后轻弹滚动
        const after = local - cur.t;
        bx = cur.x + Math.min(after, 1.2) * 0.6; bz = cur.z + Math.min(after, 1.2) * 0.3;
        by = BEACH.sand + 0.11 + Math.abs(Math.sin(Math.min(after, 1.4) * 6)) * Math.max(0, 0.5 - after * 0.4);
      } else {
        bx = THREE.MathUtils.lerp(cur.x, next.x, k); bz = THREE.MathUtils.lerp(cur.z, next.z, k);
        by = BEACH.sand + THREE.MathUtils.lerp(cur.h, next.h, k) + cur.apex * 4 * k * (1 - k);
      }
      ballPool.add(bx, by, bz, t * 6, t * 4, 0, 1);
      const home = (side: number, p: number): [number, number] => [THREE.MathUtils.lerp(COURT_X0, COURT_X1, p ? 0.68 : 0.32), side === 0 ? NET_Z - (p ? 2.6 : 3.8) : NET_Z + (p ? 2.6 : 3.8)];
      for (let side = 0; side < 2; side++) for (let p = 0; p < 2; p++) {
        const who = side * 2 + p;
        const at = (h: Hit | undefined): [number, number] => h && h.side === side && h.player === p ? [h.x + (h.kind === "spike" || h.kind === "serve" ? 0 : 0), h.z + (side === 0 ? -0.45 : 0.45)] : home(side, p);
        const from = at(cur);
        const to = at(cur.kind === "ground" ? undefined : next);
        const kk = ease(Math.min(1, k * 1.25));
        const px = THREE.MathUtils.lerp(from[0], to[0], kk), pz = THREE.MathUtils.lerp(from[1], to[1], kk);
        const moving = Math.hypot(to[0] - from[0], to[1] - from[1]) > 0.6 && kk < 0.98;
        const face = side === 0 ? 0 : Math.PI;
        const lookAtBall = Math.atan2(bx - px, bz - pz);
        const heading = face + THREE.MathUtils.clamp(((lookAtBall - face + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -0.9, 0.9);
        const hitter = next.side === side && next.player === p && cur.kind !== "ground";
        const timeToHit = next.t - local;
        let spec: PoseSpec;
        if (moving && timeToHit > 0.35) spec = gaitPose(px, BEACH.sand, pz, Math.atan2(to[0] - from[0], to[1] - from[1]), t * 11 + who, 0.8);
        else {
          spec = standPose(px, BEACH.sand, pz, heading, t + who);
          // 准备姿势：屈膝、手前伸
          spec.hipsY = 0.82; spec.lean = 0.25;
          spec.left = { thigh: -0.45, shin: 0.15, upper: -0.6, lower: -1.0, armOut: 0.2 };
          spec.right = { thigh: -0.45, shin: 0.15, upper: -0.6, lower: -1.0, armOut: 0.2 };
          if (hitter && timeToHit < 0.5) {
            const kind = next.kind;
            const j = 1 - timeToHit / 0.5;
            if (kind === "bump") { spec.hipsY = 0.72; spec.left = { thigh: -0.7, shin: 0.3, upper: -0.9, lower: -0.95, armOut: -0.05 }; spec.right = { ...spec.left }; }
            if (kind === "set") { spec.hipsY = 0.9; spec.lean = 0; spec.left = { thigh: -0.2, shin: 0.1, upper: -2.7, lower: -2.9, armOut: 0.25 }; spec.right = { ...spec.left }; }
            if (kind === "spike" || kind === "serve") {
              const jump = Math.sin(j * Math.PI) * 0.75;
              spec.y += jump; spec.hipsY = 0.95; spec.lean = -0.15 + j * 0.3;
              spec.right = { thigh: -0.3, shin: 0.4, upper: -2.9 + j * 1.6, lower: -3.0 + j * 1.4, armOut: 0.1 };
              spec.left = { thigh: -0.4, shin: 0.5, upper: -2.4, lower: -2.6, armOut: 0.3 };
            }
          }
          if (cur.kind === "ground") {
            // 得分：一方欢呼、一方叉腰
            const winner = cur.side !== side;
            if (winner) { spec.left = { thigh: 0, shin: 0, upper: -2.9, lower: -3.0, armOut: 0.35 }; spec.right = { ...spec.left }; spec.y += Math.max(0, Math.sin((local - cur.t) * 7)) * 0.2; }
            else { spec.hipsY = 0.93; spec.lean = 0.1; spec.left = { thigh: 0, shin: 0, upper: 0.3, lower: 1.6, armOut: 0.6 }; spec.right = { ...spec.left }; }
          }
        }
        stage.person(spec, players[who]);
      }
    }
    // ---------- 游泳者 ----------
    for (const [i, s] of swimmers.entries()) {
      const drift = Math.sin(t * 0.05 + s.phase) * 9;
      const x = s.x + drift, z = shoreZ(s.x) + s.off;
      const heading = Math.cos(t * 0.05 + s.phase) > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (s.style < 2) {
        const ph = t * (s.style ? 2.4 : 3.2) + s.phase;
        const armA = -((ph % (Math.PI * 2))), armB = -(((ph + Math.PI) % (Math.PI * 2)));
        const breast = s.style === 1;
        stage.person({ x, y: BEACH.sea - 0.3, z, heading, hipsY: 0.05, bodyPitch: Math.PI / 2 - 0.12, lean: 0,
          left: { thigh: Math.sin(ph * 2) * 0.25 + (breast ? -0.5 * Math.max(0, Math.sin(ph)) : 0), shin: Math.sin(ph * 2 + 1) * 0.3, upper: breast ? -2.6 + Math.sin(ph) * 0.8 : armA, lower: breast ? -2.8 + Math.sin(ph) * 0.6 : armA - 0.2, armOut: breast ? 0.5 + Math.sin(ph) * 0.4 : 0.1, legOut: breast ? 0.25 : 0 },
          right: { thigh: -Math.sin(ph * 2) * 0.25 + (breast ? -0.5 * Math.max(0, Math.sin(ph)) : 0), shin: -Math.sin(ph * 2 + 1) * 0.3, upper: breast ? -2.6 + Math.sin(ph) * 0.8 : armB, lower: breast ? -2.8 + Math.sin(ph) * 0.6 : armB - 0.2, armOut: breast ? 0.5 + Math.sin(ph) * 0.4 : 0.1, legOut: breast ? 0.25 : 0 },
          headPitch: -0.6, headYaw: breast ? 0 : Math.sin(ph) * 0.7 }, s.look);
      } else {
        // 踩水：只露出头肩
        const ph = t * 1.6 + s.phase;
        stage.person({ x, y: BEACH.sea - 1.3 + Math.sin(ph) * 0.04, z, heading: Math.PI, hipsY: 0.0, lean: 0.05,
          left: { thigh: -0.4 + Math.sin(ph) * 0.3, shin: 0.3, upper: -0.2, lower: -1.4, armOut: 1.1 + Math.sin(ph * 2) * 0.25 },
          right: { thigh: -0.4 - Math.sin(ph) * 0.3, shin: 0.3, upper: -0.2, lower: -1.4, armOut: 1.1 - Math.sin(ph * 2) * 0.25 }, headYaw: Math.sin(t * 0.3 + i) * 0.6 }, s.look);
      }
    }
    // ---------- 沙堡与孩子 ----------
    castlePool.add(castle.x, BEACH.sand + 0.15, castle.z, 0, 0, 0, 0.55, 0.3, 0.55);
    castlePool.add(castle.x, BEACH.sand + 0.42, castle.z, 0, 0, 0, 0.32, 0.28, 0.32);
    for (const [dx, dz] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) castlePool.add(castle.x + dx, BEACH.sand + 0.2, castle.z + dz, 0, 0, 0, 0.13, 0.4, 0.13);
    bucketPool.add(castle.x + 1.0, BEACH.sand + 0.1, castle.z - 0.4, 0, 0, 0, 0.12, 0.2, 0.12, "#ff595e");
    bucketPool.add(castle.x - 1.1, BEACH.sand + 0.06, castle.z + 0.5, 0, 0, Math.PI / 2, 0.1, 0.16, 0.1, "#1982c4");
    for (const [i, kid] of kids.entries()) {
      const side = i ? 1 : -1;
      const dig = Math.sin(t * 4 + i * 2) * 0.35;
      stage.person({ x: castle.x + side * 1.0, y: BEACH.sand, z: castle.z + 0.2, heading: side > 0 ? -Math.PI / 2 : Math.PI / 2, hipsY: 0.42, lean: 0.55,
        left: { thigh: -1.6, shin: 1.45, upper: -0.9 + dig, lower: -1.2 + dig, armOut: 0.1 }, right: { thigh: 0.0, shin: 1.5, upper: -0.7 - dig, lower: -1.0 - dig, armOut: 0.1 }, headPitch: 0.4 }, kid);
    }
    // ---------- 救生员 ----------
    stage.person({ x: -204, y: 2.95, z: 114.6, heading: 0.2 + Math.sin(t * 0.15) * 0.5, hipsY: 0.5, lean: 0.05,
      left: { thigh: -1.5, shin: -0.1, upper: -0.4, lower: -1.6, armOut: 0.1 }, right: { thigh: -1.5, shin: -0.1, upper: -0.3, lower: -0.5 }, headYaw: Math.sin(t * 0.4) * 0.5 }, lifeguard);
    // ---------- 沿水边散步的情侣 ----------
    {
      const span = 120;
      const u = fract(t / 160);
      const dir = u < 0.5 ? 1 : -1;
      const along = u < 0.5 ? u * 2 : 2 - u * 2;
      const x = -210 + along * span;
      const z = shoreZ(x) - 1.6;
      const zN = shoreZ(x + dir * 0.5) - 1.6;
      const heading = Math.atan2(dir * 0.5, zN - z);
      for (const [k, w] of walkers.entries()) {
        const ox = Math.cos(heading) * (k ? 0.35 : -0.35), oz = -Math.sin(heading) * (k ? 0.35 : -0.35);
        const spec = gaitPose(x + ox, BEACH.sand, z + oz, heading, t * 5.2 + k * 0.2, 0);
        if (k === 0) spec.left = { ...spec.left, upper: -0.15, lower: -0.25, armOut: -0.2 };
        else spec.right = { ...spec.right, upper: -0.15, lower: -0.25, armOut: -0.2 };
        stage.person(spec, w);
      }
    }
  };
  return { animate, court: { x: (COURT_X0 + COURT_X1) / 2, z: NET_Z }, people: spots.length + 4 + swimmers.length + kids.length + 3 };
}
