import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LakeWater } from "../water/lake-water";
import { appearanceFor, sitPose, standPose, type PoseSpec } from "../people/pose-rig";
import type { SceneStage } from "./props";
import { mat } from "./props";
import { createDuck, createGunwale, createHull } from "./hulls";
import type { Appearance } from "../../life/types";

/** 中央湖几何（与 city-civic 的 lakePoints 一致）。 */
export const LAKE = { cx: -12, cz: -15, rx: 27.5, rz: 37.5, y: 0.37, sand: 0.32 };
const lakeR = (a: number) => 1 + Math.sin(a * 3) * 0.08 + Math.cos(a * 5) * 0.035;
export const shorePoint = (a: number, offset = 0): [number, number] => [LAKE.cx + Math.cos(a) * (LAKE.rx * lakeR(a) + offset), LAKE.cz + Math.sin(a) * (LAKE.rz * lakeR(a) + offset)];
const headingTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);
const fract = (x: number) => x - Math.floor(x);
const hash = (n: number) => fract(Math.sin(n * 91.345) * 47453.5453);

type Angler = {
  x: number; y: number; z: number; heading: number; seated: boolean; period: number; offset: number; cast: number;
  look: Appearance; lastPhase: string; lastCycle: number;
};

export function buildLakeLife(stage: SceneStage, lake: LakeWater) {
  const timber = stage.material(mat("#8a6646", 0.82));
  const darkTimber = stage.material(mat("#5d4330", 0.85));
  const iron = stage.material(mat("#2d3133", 0.5, 0.6));
  const lampGlass = stage.material(mat("#fff3d0", 0.3, 0, { emissive: new THREE.Color("#ffd68a"), emissiveIntensity: 0.2 }));
  // ---------- 木栈桥（钓鱼平台） ----------
  const pierAngle = -0.18;
  const [bx, bz] = shorePoint(pierAngle, 3.2);
  const [ex, ez] = shorePoint(pierAngle, -10.5);
  const pierHeading = headingTo(bx, bz, ex, ez);
  const pierLength = Math.hypot(ex - bx, ez - bz);
  const deckY = 0.72;
  {
    const parts: THREE.BufferGeometry[] = [];
    const darkParts: THREE.BufferGeometry[] = [];
    const ironParts: THREE.BufferGeometry[] = [];
    const place = (g: THREE.BufferGeometry, lx: number, y: number, lz: number) => {
      g.translate(lx, y, lz);
      g.rotateY(pierHeading);
      g.translate(bx, 0, bz);
      return g;
    };
    for (let s = 0; s < pierLength; s += 0.24) {
      const plank = new THREE.BoxGeometry(2.4 + (hash(s) - 0.5) * 0.04, 0.05, 0.21);
      parts.push(place(plank, 0, deckY, s + 0.12));
    }
    // T 形平台端头
    for (let s = 0; s < 3.2; s += 0.24) parts.push(place(new THREE.BoxGeometry(5.2, 0.05, 0.21), 0, deckY + 0.002, pierLength - 3.2 + s + 0.12));
    for (const lx of [-1.1, 1.1]) darkParts.push(place(new THREE.BoxGeometry(0.12, 0.18, pierLength), lx, deckY - 0.12, pierLength / 2));
    for (let s = 0.4; s < pierLength; s += 2.1) for (const lx of [-1.15, 1.15]) darkParts.push(place(new THREE.CylinderGeometry(0.1, 0.11, 1.4, 8), lx, deckY - 0.6, s));
    for (const lx of [-2.5, 2.5]) for (const s of [pierLength - 3, pierLength - 0.2]) darkParts.push(place(new THREE.CylinderGeometry(0.1, 0.11, 1.4, 8), lx, deckY - 0.6, s));
    // 栏杆：栈桥一侧 + 平台三面（留出钓位缺口）
    for (let s = 0.3; s < pierLength - 3.2; s += 1.6) darkParts.push(place(new THREE.BoxGeometry(0.08, 0.95, 0.08), -1.15, deckY + 0.48, s));
    darkParts.push(place(new THREE.BoxGeometry(0.07, 0.07, pierLength - 3.3), -1.15, deckY + 0.95, (pierLength - 3.2) / 2));
    darkParts.push(place(new THREE.BoxGeometry(0.06, 0.06, pierLength - 3.3), -1.15, deckY + 0.55, (pierLength - 3.2) / 2));
    for (const lx of [-2.55, 2.55]) {
      for (const s of [pierLength - 3.1, pierLength - 1.7, pierLength - 0.15]) darkParts.push(place(new THREE.BoxGeometry(0.08, 0.95, 0.08), lx, deckY + 0.48, s));
      darkParts.push(place(new THREE.BoxGeometry(0.07, 0.07, 3), lx, deckY + 0.95, pierLength - 1.65));
    }
    // 长椅与灯柱
    parts.push(place(new THREE.BoxGeometry(1.6, 0.06, 0.42), -1.9, deckY + 0.45, pierLength - 2.6));
    darkParts.push(place(new THREE.BoxGeometry(1.6, 0.4, 0.06), -1.9, deckY + 0.7, pierLength - 2.82));
    for (const dx of [-0.7, 0.7]) darkParts.push(place(new THREE.BoxGeometry(0.06, 0.45, 0.4), -1.9 + dx, deckY + 0.22, pierLength - 2.6));
    ironParts.push(place(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 8), 2.5, deckY + 1.6, pierLength - 3.05));
    ironParts.push(place(new THREE.BoxGeometry(0.5, 0.05, 0.05), 2.3, deckY + 3.15, pierLength - 3.05));
    // 救生圈架
    ironParts.push(place(new THREE.BoxGeometry(0.05, 1.2, 0.05), 1.15, deckY + 0.6, 2.5));
    const deck = new THREE.Mesh(mergeGeometries(parts)!, timber);
    deck.name = "v3 lake pier deck";
    stage.static(deck);
    const frame = new THREE.Mesh(mergeGeometries(darkParts)!, darkTimber);
    frame.name = "v3 lake pier frame";
    stage.static(frame);
    stage.static(new THREE.Mesh(mergeGeometries(ironParts)!, iron));
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), lampGlass);
    const lampLocal = new THREE.Vector3(2.08, deckY + 3.0, pierLength - 3.05).applyAxisAngle(new THREE.Vector3(0, 1, 0), pierHeading);
    globe.position.set(bx + lampLocal.x, lampLocal.y, bz + lampLocal.z);
    stage.static(globe, false);
    const ringLocal = new THREE.Vector3(1.2, deckY + 0.85, 2.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), pierHeading);
    const buoy = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 20), stage.material(mat("#e8562e", 0.6)));
    buoy.position.set(bx + ringLocal.x, ringLocal.y, bz + ringLocal.z);
    buoy.rotation.y = pierHeading + Math.PI / 2;
    stage.static(buoy);
  }
  const pierPoint = (lx: number, ls: number): [number, number] => [bx + Math.cos(pierHeading) * lx + Math.sin(pierHeading) * ls, bz - Math.sin(pierHeading) * lx + Math.cos(pierHeading) * ls];

  // ---------- 钓客 ----------
  const anglers: Angler[] = [];
  const addAngler = (x: number, y: number, z: number, heading: number, seated: boolean, i: number) => {
    anglers.push({ x, y, z, heading, seated, period: 27 + hash(i + 3) * 18, offset: hash(i + 9) * 40, cast: 5.5 + hash(i) * 2.5, look: { ...appearanceFor(300 + i), hat: hash(i + 1) < 0.55, coat: ["#5d6b4a", "#3f4f63", "#8b6a43", "#6e3c32", "#d5c8a8"][i % 5], glasses: false }, lastPhase: "", lastCycle: -1 });
  };
  {
    const [p1x, p1z] = pierPoint(-1.6, pierLength - 0.45);
    addAngler(p1x, deckY, p1z, pierHeading, false, 0);
    const [p2x, p2z] = pierPoint(1.7, pierLength - 0.5);
    addAngler(p2x, deckY, p2z, pierHeading + 0.25, true, 1);
    const [p3x, p3z] = pierPoint(2.35, pierLength - 2.2);
    addAngler(p3x, deckY, p3z, pierHeading + Math.PI / 2, true, 2);
    for (const [k, a] of [1.85, 3.25, 4.35].entries()) {
      const [sx, sz] = shorePoint(a, 1.1);
      addAngler(sx, LAKE.sand, sz, headingTo(sx, sz, LAKE.cx, LAKE.cz) + (hash(a) - 0.5) * 0.4, true, 3 + k);
    }
  }
  // 钓凳、水桶、渔具箱（静态）
  {
    const stool: THREE.BufferGeometry[] = [], bucket: THREE.BufferGeometry[] = [], box: THREE.BufferGeometry[] = [];
    for (const [i, a] of anglers.entries()) {
      const fx = Math.sin(a.heading), fz = Math.cos(a.heading), sx = Math.cos(a.heading), sz = -Math.sin(a.heading);
      if (a.seated) {
        const g = new THREE.CylinderGeometry(0.2, 0.17, 0.06, 10); g.translate(a.x - fx * 0.05, a.y + 0.43, a.z - fz * 0.05); stool.push(g);
        for (const [lx, lz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) { const l = new THREE.CylinderGeometry(0.015, 0.015, 0.42, 5); l.translate(a.x + sx * lx + fx * lz - fx * 0.05, a.y + 0.21, a.z + sz * lx + fz * lz - fz * 0.05); stool.push(l); }
      }
      const b = new THREE.CylinderGeometry(0.17, 0.14, 0.32, 12, 1, true); b.translate(a.x + sx * 0.6 - fx * 0.2, a.y + 0.16, a.z + sz * 0.6 - fz * 0.2); bucket.push(b);
      const t = new THREE.BoxGeometry(0.42, 0.22, 0.26); t.rotateY(a.heading + 0.3); t.translate(a.x - sx * 0.55 - fx * 0.3, a.y + 0.11, a.z - sz * 0.55 - fz * 0.3); box.push(t);
      void i;
    }
    if (stool.length) stage.static(new THREE.Mesh(mergeGeometries(stool)!, stage.material(mat("#3c4a5c", 0.6, 0.3))));
    const bucketMat = stage.material(mat("#3f86c4", 0.5)); bucketMat.side = THREE.DoubleSide;
    stage.static(new THREE.Mesh(mergeGeometries(bucket)!, bucketMat));
    stage.static(new THREE.Mesh(mergeGeometries(box)!, stage.material(mat("#3d6b45", 0.55))));
  }
  const unit = stage.geometry(new THREE.CylinderGeometry(1, 1, 1, 6));
  const rodPool = stage.pool("v3 lake fishing rods", unit, stage.material(mat("#1d1f22", 0.35, 0.3)), anglers.length * 4);
  const linePool = stage.pool("v3 lake fishing lines", stage.geometry(new THREE.CylinderGeometry(1, 1, 1, 3)), stage.material(mat("#e9eef0", 0.4, 0, { transparent: true, opacity: 0.38, depthWrite: false })), anglers.length + 4, false);
  const bobberPool = stage.pool("v3 lake bobbers", stage.geometry(new THREE.SphereGeometry(1, 10, 8)), stage.material(mat("#ffffff", 0.35, 0, { emissive: new THREE.Color("#ff3b1f"), emissiveIntensity: 0.15 })), anglers.length * 2, false);
  const fishGeo = (() => {
    const body = new THREE.SphereGeometry(0.06, 10, 6); body.scale(0.55, 1, 3.2);
    const tail = new THREE.ConeGeometry(0.07, 0.12, 4); tail.rotateX(Math.PI / 2); tail.scale(0.25, 1, 1); tail.translate(0, 0, -0.24);
    return mergeGeometries([body.toNonIndexed(), tail.toNonIndexed()])!;
  })();
  const fishPool = stage.pool("v3 lake caught fish", fishGeo, stage.material(mat("#b8c2c4", 0.25, 0.55)), anglers.length + 6);

  // ---------- 小船 ----------
  const rowHull = stage.geometry(createHull(3.6, 1.3, 0.46));
  const rowHullMat = stage.material(mat("#f1ede2", 0.45)); rowHullMat.side = THREE.DoubleSide;
  const rowboat = new THREE.Group();
  rowboat.name = "v3 lake rowboat";
  const hullMesh = new THREE.Mesh(rowHull, rowHullMat); hullMesh.castShadow = true; hullMesh.receiveShadow = true;
  const stripe = new THREE.Mesh(stage.geometry(createGunwale(3.6, 1.3, 0.46, 0.045)), stage.material(mat("#2c5f7d", 0.5)));
  const seats = new THREE.Mesh(stage.geometry(mergeGeometries([
    new THREE.BoxGeometry(1.15, 0.05, 0.3).translate(0, 0.33, 0.05), new THREE.BoxGeometry(0.7, 0.05, 0.28).translate(0, 0.36, -1.15),
    new THREE.BoxGeometry(0.85, 0.05, 0.25).translate(0, 0.36, 1.05), new THREE.BoxGeometry(0.06, 0.12, 0.12).translate(0.62, 0.52, 0.0), new THREE.BoxGeometry(0.06, 0.12, 0.12).translate(-0.62, 0.52, 0.0),
  ])!), timber);
  rowboat.add(hullMesh, stripe, seats);
  stage.group.add(rowboat);
  const swan = new THREE.Group();
  swan.name = "v3 lake swan pedal boat";
  {
    const swanMat = stage.material(mat("#f6f5f0", 0.4)); swanMat.side = THREE.DoubleSide;
    const hull = new THREE.Mesh(stage.geometry(createHull(2.9, 1.7, 0.55, 18, 10, 0.75)), swanMat); hull.castShadow = true;
    const neckCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.6, 1.1), new THREE.Vector3(0, 1.1, 1.35), new THREE.Vector3(0, 1.75, 1.2), new THREE.Vector3(0, 2.0, 1.45)]);
    const neck = new THREE.Mesh(stage.geometry(new THREE.TubeGeometry(neckCurve, 20, 0.13, 8)), swanMat);
    const head = new THREE.Mesh(stage.geometry(new THREE.SphereGeometry(0.2, 12, 8).scale(0.8, 0.85, 1.2).translate(0, 2.02, 1.52)), swanMat);
    const beak = new THREE.Mesh(stage.geometry(new THREE.ConeGeometry(0.07, 0.25, 8).rotateX(Math.PI / 2).translate(0, 1.98, 1.76)), stage.material(mat("#e8742a", 0.5)));
    const wings = new THREE.Mesh(stage.geometry(mergeGeometries([-1, 1].map((s) => new THREE.SphereGeometry(0.5, 10, 6).scale(0.18, 0.55, 1.4).rotateZ(s * 0.35).translate(s * 0.8, 0.85, -0.3).toNonIndexed()))!), swanMat);
    const canopy = new THREE.Mesh(stage.geometry(new THREE.BoxGeometry(1.4, 0.05, 1.3).translate(0, 1.85, -0.25)), stage.material(mat("#d24d4d", 0.6)));
    const posts = new THREE.Mesh(stage.geometry(mergeGeometries([-0.62, 0.62].flatMap((x) => [-0.8, 0.3].map((z) => new THREE.CylinderGeometry(0.025, 0.025, 1.3, 6).translate(x, 1.2, z))))!), iron);
    const bench = new THREE.Mesh(stage.geometry(new THREE.BoxGeometry(1.25, 0.08, 0.45).translate(0, 0.55, -0.3)), stage.material(mat("#3e78a8", 0.5)));
    swan.add(hull, neck, head, beak, wings, canopy, posts, bench);
    for (const o of swan.children) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; }
  }
  stage.group.add(swan);
  const oarPool = stage.pool("v3 lake oars", unit, timber, 4);
  const bladePool = stage.pool("v3 lake oar blades", stage.geometry(new THREE.BoxGeometry(1, 1, 1)), timber, 4);
  const duckPool = stage.pool("v3 lake ducks", stage.geometry(createDuck()), stage.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })), 9);

  const rower: Appearance = { ...appearanceFor(411), coat: "#d9534f", hat: true, glasses: false };
  const rider2: Appearance = { ...appearanceFor(412), coat: "#f2c94c", skirt: true, hairStyle: 3, glasses: false };
  const rider3: Appearance = { ...appearanceFor(413), coat: "#5fb0b7", glasses: false };
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), tip = new THREE.Vector3(), bob = new THREE.Vector3();
  let lastStroke = -1;
  let lastJump = -1;

  const animate = (seconds: number, night: boolean) => {
    lampGlass.emissiveIntensity = night ? 3.2 : 0.2;
    const t = seconds;
    // ---------- 钓鱼循环 ----------
    for (const [i, an] of anglers.entries()) {
      const local = t + an.offset;
      const cycle = Math.floor(local / an.period);
      const tau = local - cycle * an.period;
      const P = an.period;
      const catches = hash(cycle * 7 + i) < 0.6;
      const phase = tau < 2.4 ? "cast" : tau < P - 9 ? "wait" : tau < P - 7.6 ? "bite" : tau < P - 3 ? "reel" : "unhook";
      const fx = Math.sin(an.heading), fz = Math.cos(an.heading);
      // 姿态
      let spec: PoseSpec;
      const reel = phase === "reel" ? Math.sin(t * 9) * 0.25 : 0;
      const castSwing = phase === "cast" ? Math.max(0, 1 - tau / 0.9) : 0;
      const armUpper = -0.75 - castSwing * 1.6 + (phase === "reel" || phase === "bite" ? -0.25 : 0);
      if (an.seated) spec = sitPose(an.x - fx * 0.05, an.y, an.z - fz * 0.05, an.heading, 0.43);
      else spec = standPose(an.x, an.y, an.z, an.heading, t);
      spec.left = { ...spec.left, upper: armUpper, lower: armUpper - 0.6, armOut: 0.12 };
      spec.right = { ...spec.right, upper: armUpper + 0.15 + reel, lower: armUpper - 0.75 - reel, armOut: 0.1 };
      spec.lean = (spec.lean ?? 0) + (phase === "reel" ? -0.12 : 0.06);
      spec.headPitch = phase === "wait" ? 0.25 : 0.1;
      const pose = stage.person(spec, an.look);
      if (!pose) continue;
      a.copy(pose.leftHand).add(pose.rightHand).multiplyScalar(0.5);
      // 鱼竿仰角与弯曲
      const tension = phase === "reel" ? 0.55 + Math.sin(t * 5) * 0.15 : phase === "bite" ? 0.35 : 0;
      const elevation = phase === "cast" ? 0.55 + castSwing * 1.4 : phase === "reel" ? 0.95 : phase === "unhook" ? 1.25 : 0.55 + Math.sin(t * 0.7 + i) * 0.03;
      const rodLen = 3.3;
      b.copy(a).addScaledVector(new THREE.Vector3(-fx, 0, -fz), 0.35);
      const segs = 3;
      let prev = b.clone();
      for (let k = 1; k <= segs; k++) {
        const s = k / segs;
        const el = elevation - tension * s * s * 1.2;
        c.set(fx * Math.cos(el), Math.sin(el), fz * Math.cos(el)).multiplyScalar(rodLen / segs).add(prev);
        rodPool.segment(prev, c, 0.022 * (1 - s * 0.7), "#1f2326");
        prev = c.clone();
      }
      tip.copy(prev);
      // 浮漂
      const water = LAKE.y + 0.02;
      const target = new THREE.Vector3(an.x + fx * (an.cast + rodLen * 0.6), water, an.z + fz * (an.cast + rodLen * 0.6));
      if (phase === "cast") {
        const k = Math.max(0, (tau - 0.7) / 1.7);
        bob.lerpVectors(tip, target, k);
        bob.y = THREE.MathUtils.lerp(tip.y, water, k) + Math.sin(k * Math.PI) * 2.2;
      } else if (phase === "wait") {
        bob.copy(target); bob.y = water + Math.sin(t * 2.1 + i) * 0.012;
        if (tau > P - 12.5 && tau < P - 11.8) bob.y -= 0.05; // 试探咬钩
      } else if (phase === "bite") {
        bob.copy(target); bob.y = water - 0.12 - Math.abs(Math.sin(t * 11)) * 0.06;
      } else if (phase === "reel") {
        const k = (tau - (P - 7.6)) / 4.6;
        bob.lerpVectors(target, new THREE.Vector3(tip.x, water, tip.z), k * 0.85);
        bob.x += Math.sin(t * 3.3 + i) * 0.4 * (1 - k); bob.z += Math.cos(t * 2.7) * 0.3 * (1 - k);
        bob.y = water + (k > 0.75 && catches ? (k - 0.75) * 4 * (tip.y - water - 0.6) : -0.02);
      } else {
        bob.copy(tip); bob.y -= 0.9;
      }
      linePool.segment(tip, bob, 0.0045, "#f2f6f8");
      bobberPool.add(bob.x, bob.y + 0.03, bob.z, 0, 0, 0, 0.045, 0.045, 0.045, "#ff4a2a");
      bobberPool.add(bob.x, bob.y - 0.01, bob.z, 0, 0, 0, 0.04, 0.03, 0.04, "#f4f4f0");
      // 鱼
      if (catches && (phase === "unhook" || (phase === "reel" && bob.y > water + 0.05))) {
        const flap = Math.sin(t * 22) * 0.6;
        if (phase === "unhook") {
          const k = (tau - (P - 3)) / 3;
          const sx = Math.cos(an.heading), sz = -Math.sin(an.heading);
          const hand = pose.rightHand;
          const bx2 = an.x + sx * 0.6 - fx * 0.2, bz2 = an.z + sz * 0.6 - fz * 0.2;
          const fxp = THREE.MathUtils.lerp(hand.x, bx2, Math.max(0, k * 1.6 - 0.6));
          const fzp = THREE.MathUtils.lerp(hand.z, bz2, Math.max(0, k * 1.6 - 0.6));
          const fyp = THREE.MathUtils.lerp(hand.y, an.y + 0.3, Math.max(0, k * 1.6 - 0.6));
          if (k < 0.95) fishPool.add(fxp, fyp, fzp, an.heading + 1.2, 1.2, flap * 0.5, 1 + hash(cycle) * 0.6);
        } else fishPool.add(bob.x, bob.y - 0.22, bob.z, an.heading, Math.PI / 2 - 0.2, flap, 1 + hash(cycle) * 0.6);
      }
      // 涟漪事件
      if (an.lastPhase !== phase || an.lastCycle !== cycle) {
        if (phase === "wait") lake.ripple(target.x, target.z, t, 0.9);
        if (phase === "bite") lake.ripple(target.x, target.z, t, 1.4);
        if (phase === "reel") lake.ripple(target.x, target.z, t, 1.2);
        an.lastPhase = phase; an.lastCycle = cycle;
      }
    }

    // ---------- 划艇 ----------
    {
      const speed = 0.045;
      const th = t * speed;
      const px = LAKE.cx - 2 + Math.cos(th) * 13.5, pz = LAKE.cz - 4 + Math.sin(th) * 21;
      const heading = Math.atan2(-Math.sin(th) * 13.5, Math.cos(th) * 21);
      const stroke = fract(t / 2.6);
      const drive = stroke < 0.45;
      const k = drive ? stroke / 0.45 : (stroke - 0.45) / 0.55;
      const surge = drive ? Math.sin(k * Math.PI) * 0.03 : 0;
      rowboat.position.set(px, LAKE.y - 0.18 + Math.sin(t * 1.3) * 0.015, pz);
      rowboat.rotation.set(Math.sin(t * 0.9) * 0.015 + surge, heading, Math.sin(t * 1.1) * 0.02);
      const sweep = drive ? THREE.MathUtils.lerp(-0.7, 0.55, k) : THREE.MathUtils.lerp(0.55, -0.7, k);
      const dip = drive ? -0.18 : 0.12;
      const fx = Math.sin(heading), fz = Math.cos(heading), sx = Math.cos(heading), sz = -Math.sin(heading);
      const oarLocal = (side: number, along: number, up: number): THREE.Vector3 => {
        // 桨架 (±0.62, 0.55, 0) 处，向外伸出 along 米
        const ox = side * (0.62 + Math.cos(sweep) * along), oz = -Math.sin(sweep) * along * 1, oy = 0.55 + up;
        return new THREE.Vector3(px + sx * ox + fx * oz, rowboat.position.y + oy, pz + sz * ox + fz * oz);
      };
      for (const side of [-1, 1]) {
        const inner = oarLocal(side, -0.62, -dip * 0.4);
        const outer = oarLocal(side, 1.7, dip);
        oarPool.segment(inner, outer, 0.028, "#8a6646");
        const blade = oarLocal(side, 1.55, dip * 0.92);
        bladePool.add(blade.x, blade.y, blade.z, heading + side * Math.PI / 2 - side * sweep, 0, side * (dip > 0 ? 0.3 : 0.1), 0.5, 0.025, 0.16);
      }
      const strokeIndex = Math.floor(t / 2.6);
      if (strokeIndex !== lastStroke) {
        lastStroke = strokeIndex;
        const l = oarLocal(-1, 1.6, 0), r = oarLocal(1, 1.6, 0);
        lake.ripple(l.x, l.z, t, 1); lake.ripple(r.x, r.z, t, 1);
      }
      // 划手：面向船尾
      const lean = drive ? THREE.MathUtils.lerp(0.45, -0.3, k) : THREE.MathUtils.lerp(-0.3, 0.45, k);
      const reach = drive ? THREE.MathUtils.lerp(-1.4, -0.55, k) : THREE.MathUtils.lerp(-0.55, -1.4, k);
      const spec = sitPose(px - fx * 0.05, rowboat.position.y + 0.02, pz - fz * 0.05, heading + Math.PI, 0.33);
      spec.lean = lean;
      spec.left = { thigh: -1.25, shin: 0.35, upper: reach, lower: reach - 0.35, armOut: 0.35 };
      spec.right = { thigh: -1.25, shin: 0.35, upper: reach, lower: reach - 0.35, armOut: 0.35 };
      stage.person(spec, rower);
    }
    // ---------- 天鹅脚踏船 ----------
    {
      const th = -t * 0.035 + 2.0;
      const px = LAKE.cx + 3 + Math.cos(th) * 9, pz = LAKE.cz - 14 + Math.sin(th) * 12;
      const heading = Math.atan2(Math.sin(th) * 9, -Math.cos(th) * 12);
      swan.position.set(px, LAKE.y - 0.25 + Math.sin(t * 1.1) * 0.02, pz);
      swan.rotation.set(Math.sin(t * 0.8) * 0.012, heading, Math.sin(t * 0.95) * 0.018);
      const sx = Math.cos(heading), sz = -Math.sin(heading), fx = Math.sin(heading), fz = Math.cos(heading);
      for (const [k, look] of [rider2, rider3].entries()) {
        const lx = k ? 0.33 : -0.33;
        const pedal = t * 4 + k * Math.PI;
        const spec = sitPose(px + sx * lx - fx * 0.3, swan.position.y + 0.12, pz + sz * lx - fz * 0.3, heading, 0.5);
        spec.left = { thigh: -1.3 + Math.sin(pedal) * 0.3, shin: -0.3 + Math.sin(pedal) * 0.35, upper: k ? -0.1 : -0.5, lower: k ? -0.2 : -1.2 };
        spec.right = { thigh: -1.3 - Math.sin(pedal) * 0.3, shin: -0.3 - Math.sin(pedal) * 0.35, upper: k ? -0.5 : -0.1, lower: k ? -1.2 : -0.2 };
        spec.headYaw = Math.sin(t * 0.3 + k) * 0.5;
        stage.person(spec, look);
      }
    }
    // ---------- 鸭群 ----------
    for (let d = 0; d < 9; d++) {
      const group = d < 5 ? 0 : 1;
      const th = t * (group ? -0.02 : 0.026) + group * 2.6 + (d % 5) * 0.035;
      const rr = 0.72 + (d % 5) * 0.015;
      const ang = th;
      const dx = LAKE.cx + Math.cos(ang) * LAKE.rx * rr + Math.sin(d * 3.1) * 0.6;
      const dz = LAKE.cz + Math.sin(ang) * LAKE.rz * rr + Math.cos(d * 2.3) * 0.6;
      const heading = Math.atan2(-Math.sin(ang) * LAKE.rx, Math.cos(ang) * LAKE.rz) + (group ? Math.PI : 0);
      duckPool.add(dx, LAKE.y - 0.03 + Math.sin(t * 2 + d) * 0.01, dz, heading + Math.sin(t * 0.7 + d) * 0.2, 0, 0, d % 5 === 0 ? 1.05 : 0.85);
    }
    // ---------- 跃鱼 ----------
    const jumpSlot = Math.floor(t / 7);
    if (jumpSlot !== lastJump) {
      lastJump = jumpSlot;
      const ang = hash(jumpSlot) * Math.PI * 2, rr = 0.2 + hash(jumpSlot + 1) * 0.55;
      lake.ripple(LAKE.cx + Math.cos(ang) * LAKE.rx * rr, LAKE.cz + Math.sin(ang) * LAKE.rz * rr, t, 0.8);
    }
  };
  return { animate, pier: { x: bx, z: bz, endX: ex, endZ: ez, heading: pierHeading }, anglerCount: anglers.length };
}
