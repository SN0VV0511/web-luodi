import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createVehicleShell, createVehicleWheel } from "../../../city-vehicles";
import type { CarModel } from "../../vehicles/car-models";

/**
 * v3 公共服务车队：警车、出租车（CC0 轿车车身 + 着色器涂装 + 车顶警灯 / 顶灯）、
 * 救护车（一体式厢体 + 红色生命带 + 前后警灯排）、厢式货车（平头驾驶室与货厢一体、
 * 大梁 / 轮拱 / 双后轮位正确，后门卷帘可开）、市政工程车。
 * 坐标约定与既有车壳一致：车头 +z，地面 y = 0。
 */
export type ServiceKind = "police" | "taxi" | "ambulance" | "boxtruck" | "utility" | "civilian" | "foodtruck";

export type ServiceShell = {
  kind: ServiceKind;
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  chrome: THREE.BufferGeometry;
  /** 警灯 / 顶灯灯罩（红、蓝或琥珀），由调用方按频闪着色。 */
  lensA: THREE.BufferGeometry;
  lensB: THREE.BufferGeometry;
  length: number;
  width: number;
  height: number;
  wheelR: number;
  wheels: { x: number; z: number }[];
  /** 双后轮：额外内侧轮位。 */
  dualRear: boolean;
  lamps: { x: number; y: number; z: number; tail: boolean }[];
};

type Groups = Record<"body" | "glass" | "trim" | "chrome" | "lensA" | "lensB", THREE.BufferGeometry[]>;

/** 统一为非索引 Float32 位置 / 法线 / UV（CC0 车身为交错 Int8 法线，需展开后才能与盒体合并）。 */
function prepare(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const index = geometry.index;
  const source = geometry.getAttribute("position");
  const count = index ? index.count : source.count;
  const out = new THREE.BufferGeometry();
  const read = (name: string, size: number) => {
    const attribute = geometry.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
    if (!attribute) return null;
    const array = new Float32Array(count * size);
    for (let i = 0; i < count; i++) {
      const v = index ? index.getX(i) : i;
      array[i * size] = attribute.getX(v);
      if (size > 1) array[i * size + 1] = attribute.getY(v);
      if (size > 2) array[i * size + 2] = attribute.getZ(v);
    }
    return new THREE.BufferAttribute(array, size);
  };
  out.setAttribute("position", read("position", 3)!);
  const normal = read("normal", 3);
  if (normal) out.setAttribute("normal", normal);
  out.setAttribute("uv", read("uv", 2) ?? new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  if (!normal) out.computeVertexNormals();
  geometry.dispose();
  return out;
}

class PartBuilder {
  readonly groups: Groups = { body: [], glass: [], trim: [], chrome: [], lensA: [], lensB: [] };
  private readonly matrix = new THREE.Matrix4();
  private readonly euler = new THREE.Euler();
  box(group: keyof Groups, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    const g = new THREE.BoxGeometry(w, h, d);
    this.euler.set(rx, ry, rz);
    g.applyMatrix4(this.matrix.makeRotationFromEuler(this.euler).setPosition(x, y, z));
    this.groups[group].push(g);
  }
  pair(group: keyof Groups, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.box(group, w, h, d, x, y, z, rx, ry, rz);
    this.box(group, w, h, d, -x, y, z, rx, -ry, -rz);
  }
  cylinder(group: keyof Groups, r: number, len: number, x: number, y: number, z: number, axis: "x" | "y" | "z", segments = 12): void {
    const g = new THREE.CylinderGeometry(r, r, len, segments);
    this.euler.set(axis === "z" ? Math.PI / 2 : 0, 0, axis === "x" ? Math.PI / 2 : 0);
    g.applyMatrix4(this.matrix.makeRotationFromEuler(this.euler).setPosition(x, y, z));
    this.groups[group].push(g);
  }
  add(group: keyof Groups, geometry: THREE.BufferGeometry): void { this.groups[group].push(geometry.clone()); }
  merge(group: keyof Groups): THREE.BufferGeometry {
    const parts = this.groups[group];
    if (!parts.length) return new THREE.BoxGeometry(0.001, 0.001, 0.001).translate(0, -10, 0);
    const merged = mergeGeometries(parts.map(prepare), false)!;
    for (const part of parts) part.dispose();
    merged.computeBoundingSphere();
    return merged;
  }
}

/** 轮拱：围绕轮心的一圈短条。 */
function arch(b: PartBuilder, halfWidth: number, wheelZ: number, wheelR: number, gap = 0.08): void {
  const r = wheelR + gap, steps = 9;
  for (const side of [1, -1]) for (let i = 0; i < steps; i++) {
    const a = Math.PI * (i + 0.5) / steps;
    b.box("trim", 0.07, 0.07, Math.PI * r / steps * 1.15, side * (halfWidth + 0.01), wheelR + r * Math.sin(a), wheelZ - r * Math.cos(a), a - Math.PI / 2);
  }
}

/** 车身侧裙：按轮位挖出轮拱的长条体块（x 半宽 hw，y0..y1，z0..z1）。 */
function bodyWithArches(b: PartBuilder, hw: number, y0: number, y1: number, z0: number, z1: number, wheelZs: number[], wheelR: number, group: keyof Groups = "body"): void {
  const cuts = wheelZs.filter((z) => z > z0 && z < z1).sort((a, c) => a - c);
  let cursor = z0;
  const archTop = wheelR * 2 + 0.1;
  for (const wz of cuts) {
    const a0 = wz - wheelR - 0.1, a1 = wz + wheelR + 0.1;
    if (a0 > cursor) b.box(group, hw * 2, y1 - y0, a0 - cursor, 0, (y0 + y1) / 2, (cursor + a0) / 2);
    if (y1 > archTop) b.box(group, hw * 2, y1 - archTop, a1 - a0, 0, (archTop + y1) / 2, wz);
    cursor = a1;
  }
  if (z1 > cursor) b.box(group, hw * 2, y1 - y0, z1 - cursor, 0, (y0 + y1) / 2, (cursor + z1) / 2);
}

function boxTruckShell(utility: boolean): ServiceShell {
  const b = new PartBuilder();
  const L = 7.1, W = 2.36, H = 3.4, R = 0.5, hl = L / 2;
  const front = hl, cabBack = 1.62;
  const wheels = [{ x: 1.0, z: 2.42 }, { x: -1.0, z: 2.42 }, { x: 1.0, z: -1.9 }, { x: -1.0, z: -1.9 }];
  // 大梁 + 横梁 + 油箱 + 后保险杠
  b.pair("trim", 0.14, 0.26, L - 0.6, 0.48, 0.78, -0.15);
  for (const z of [-3.0, -1.2, 0.6, 2.0]) b.box("trim", 1.1, 0.14, 0.12, 0, 0.78, z);
  b.cylinder("chrome", 0.27, 1.1, 0.92, 0.8, 0.3, "z", 12);
  b.box("trim", W - 0.1, 0.22, 0.2, 0, 0.72, -hl + 0.1);
  for (const s of [-1, 1]) b.box("trim", 0.42, 0.5, 0.03, s * 1.0, 0.55, -2.5);
  // 平头驾驶室：下部带前轮拱，上部前倾挡风玻璃
  bodyWithArches(b, (W - 0.08) / 2, 0.62, 1.62, cabBack, front - 0.05, [2.42], R);
  b.box("body", W - 0.1, 1.12, front - cabBack - 0.15, 0, 2.18, (cabBack + front - 0.15) / 2);
  b.box("body", W - 0.12, 0.12, front - cabBack - 0.45, 0, 2.8, (cabBack + front - 0.45) / 2);
  b.box("glass", W - 0.34, 0.92, 0.05, 0, 2.2, front - 0.16, -0.12);
  b.pair("glass", 0.05, 0.72, 0.95, W / 2 - 0.045, 2.2, front - 0.75);
  b.pair("trim", 0.06, 0.95, 0.05, W / 2 - 0.04, 1.7, cabBack + 0.55);
  b.pair("trim", 0.06, 0.05, 1.3, W / 2 - 0.04, 1.62, front - 0.85);
  b.box("trim", 1.7, 0.42, 0.05, 0, 1.08, front - 0.02);
  for (let i = 0; i < 4; i++) b.box("chrome", 1.6, 0.04, 0.06, 0, 0.92 + i * 0.1, front);
  b.box("trim", W, 0.34, 0.28, 0, 0.62, front + 0.04);
  b.pair("chrome", 0.32, 0.18, 0.05, 0.85, 1.05, front + 0.01);
  b.pair("trim", 0.05, 0.05, 0.5, W / 2 + 0.2, 2.35, front - 0.45, 0, 0.7);
  b.pair("trim", 0.1, 0.42, 0.2, W / 2 + 0.38, 2.25, front - 0.25);
  b.pair("trim", 0.32, 0.06, 0.4, W / 2 - 0.05, 0.42, front - 1.2);
  arch(b, (W - 0.08) / 2, 2.42, R);
  // 货厢：与驾驶室同宽，坐在大梁上，底边高于后轮
  const boxBottom = 1.12, boxFront = cabBack - 0.06, boxBack = -hl;
  b.box("body", W, H - boxBottom, boxFront - boxBack, 0, (H + boxBottom) / 2, (boxFront + boxBack) / 2);
  b.box("trim", W + 0.02, 0.1, boxFront - boxBack + 0.02, 0, boxBottom + 0.05, (boxFront + boxBack) / 2);
  for (const z of [boxFront, boxBack]) for (const s of [-1, 1]) b.box("chrome", 0.07, H - boxBottom, 0.07, s * (W / 2), (H + boxBottom) / 2, z);
  b.box("chrome", W + 0.04, 0.06, 0.06, 0, H, boxBack);
  // 卷帘后门（分条）+ 把手 + 尾灯
  for (let i = 0; i < 10; i++) b.box("trim", W - 0.2, 0.02, 0.02, 0, boxBottom + 0.2 + i * 0.21, boxBack - 0.01);
  b.box("chrome", 0.4, 0.06, 0.06, 0, boxBottom + 0.25, boxBack - 0.03);
  b.box("trim", W - 0.3, 0.12, 0.35, 0, 0.98, boxBack + 0.05);
  // 后轮挡泥板
  for (const s of [-1, 1]) b.box("trim", 0.5, 0.06, 1.3, s * 0.98, 1.08, -1.9);
  // 侧面防护栏
  for (const s of [-1, 1]) for (const y of [0.62, 0.86]) b.box("chrome", 0.04, 0.06, 2.2, s * (W / 2 - 0.05), y, -0.1);
  if (utility) {
    // 市政工程车：车顶琥珀色警灯排 + 侧梯
    b.box("trim", 1.5, 0.12, 0.34, 0, 2.92, front - 0.75);
    b.box("lensA", 0.66, 0.16, 0.28, -0.38, 3.06, front - 0.75);
    b.box("lensB", 0.66, 0.16, 0.28, 0.38, 3.06, front - 0.75);
    for (let i = 0; i < 7; i++) b.box("chrome", 0.04, 0.04, 0.5, -W / 2 - 0.06, 1.3 + i * 0.3, -3.0);
  } else {
    b.box("lensA", 0.12, 0.08, 0.04, -0.6, H - 0.05, front - 0.15);
    b.box("lensB", 0.12, 0.08, 0.04, 0.6, H - 0.05, front - 0.15);
  }
  return {
    kind: utility ? "utility" : "boxtruck",
    body: b.merge("body"), glass: b.merge("glass"), trim: b.merge("trim"), chrome: b.merge("chrome"), lensA: b.merge("lensA"), lensB: b.merge("lensB"),
    length: L, width: W, height: H, wheelR: R, wheels, dualRear: true,
    lamps: [{ x: 0.85, y: 1.05, z: front + 0.03, tail: false }, { x: -0.85, y: 1.05, z: front + 0.03, tail: false }, { x: 0.95, y: 1.2, z: boxBack - 0.04, tail: true }, { x: -0.95, y: 1.2, z: boxBack - 0.04, tail: true }],
  };
}

function ambulanceShell(): ServiceShell {
  const b = new PartBuilder();
  const L = 6.0, W = 2.12, H = 2.82, R = 0.38, hl = L / 2;
  const wheels = [{ x: 0.9, z: 1.95 }, { x: -0.9, z: 1.95 }, { x: 0.9, z: -1.85 }, { x: -0.9, z: -1.85 }];
  const moduleFront = 0.95;
  // 发动机舱 + 驾驶室（厢式车头）
  bodyWithArches(b, (W - 0.12) / 2, 0.38, 1.12, moduleFront, hl - 0.12, [1.95], R);
  b.box("body", W - 0.14, 0.24, hl - 0.12 - 1.95, 0, 1.24, (hl - 0.12 + 1.95) / 2);
  b.box("body", W - 0.12, 0.9, 1.75 - moduleFront, 0, 1.57, (1.75 + moduleFront) / 2);
  // 倾斜风挡：玻璃面 + 其后的车身楔块，避免风挡悬空成"贴片"
  {
    const tilt = -0.5, gy = 1.6, gz = 1.93, ny = Math.sin(-tilt), nz = Math.cos(tilt);
    b.box("body", W - 0.12, 0.92, 0.34, 0, gy - ny * 0.19, gz - nz * 0.19, tilt);
    b.box("glass", W - 0.34, 0.78, 0.04, 0, gy + ny * 0.0, gz + nz * 0.0, tilt);
  }
  b.pair("glass", 0.05, 0.55, 0.62, W / 2 - 0.055, 1.62, 1.38);
  b.box("trim", 1.4, 0.3, 0.05, 0, 0.85, hl - 0.1);
  b.box("trim", W - 0.1, 0.3, 0.24, 0, 0.5, hl - 0.04);
  b.pair("chrome", 0.3, 0.14, 0.05, 0.72, 1.02, hl - 0.11);
  b.pair("trim", 0.1, 0.32, 0.2, W / 2 + 0.12, 1.7, 1.95);
  arch(b, (W - 0.12) / 2, 1.95, R);
  // 方舱医疗厢
  bodyWithArches(b, W / 2, 0.42, 1.2, -hl, moduleFront, [-1.85], R);
  b.box("body", W, H - 1.2, moduleFront + hl, 0, (H + 1.2) / 2, (moduleFront - hl) / 2);
  b.box("body", W - 0.2, 0.15, 0.25, 0, H - 0.05, moduleFront + 0.1);
  arch(b, W / 2, -1.85, R);
  b.pair("glass", 0.04, 0.5, 0.7, W / 2 + 0.005, 2.05, 0.35);
  for (const s of [-1, 1]) b.box("trim", 0.04, 1.75, 0.03, s * (W / 2 + 0.005), 1.6, -0.35);
  b.box("trim", 0.03, H - 0.7, 0.02, 0, (H + 0.7) / 2 - 0.1, -hl - 0.01);
  b.pair("glass", 0.6, 0.45, 0.03, 0.5, 2.15, -hl - 0.01);
  b.box("trim", W - 0.2, 0.18, 0.3, 0, 0.48, -hl - 0.05);
  // 警灯排：前（红 / 蓝）+ 后角
  b.box("trim", W - 0.3, 0.1, 0.32, 0, H + 0.05, moduleFront - 0.2);
  b.box("lensA", (W - 0.4) / 2, 0.14, 0.26, -(W - 0.4) / 4, H + 0.17, moduleFront - 0.2);
  b.box("lensB", (W - 0.4) / 2, 0.14, 0.26, (W - 0.4) / 4, H + 0.17, moduleFront - 0.2);
  b.box("lensA", 0.16, 0.16, 0.12, -W / 2 + 0.1, H - 0.08, -hl - 0.03);
  b.box("lensB", 0.16, 0.16, 0.12, W / 2 - 0.1, H - 0.08, -hl - 0.03);
  b.pair("lensA", 0.04, 0.12, 0.25, W / 2 + 0.01, 2.65, moduleFront - 0.25);
  return {
    kind: "ambulance",
    body: b.merge("body"), glass: b.merge("glass"), trim: b.merge("trim"), chrome: b.merge("chrome"), lensA: b.merge("lensA"), lensB: b.merge("lensB"),
    length: L, width: W, height: H, wheelR: R, wheels, dualRear: false,
    lamps: [{ x: 0.72, y: 1.02, z: hl - 0.09, tail: false }, { x: -0.72, y: 1.02, z: hl - 0.09, tail: false }, { x: 0.9, y: 1.0, z: -hl - 0.02, tail: true }, { x: -0.9, y: 1.0, z: -hl - 0.02, tail: true }],
  };
}

/** 警车 / 出租车：轿车车身（CC0 可替换）+ 车顶灯具。roofY / roofZ 为车顶中心。 */
function sedanService(kind: "police" | "taxi" | "civilian", base: { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; trim: THREE.BufferGeometry; chrome: THREE.BufferGeometry; length: number; width: number; height: number; wheelR: number; wheels: { x: number; z: number }[]; lamps: ServiceShell["lamps"] }, roofZ = -0.05): ServiceShell {
  const b = new PartBuilder();
  b.add("body", base.body); b.add("glass", base.glass); b.add("trim", base.trim); b.add("chrome", base.chrome);
  const y = base.height, z = base.length * roofZ;
  if (kind === "police") {
    for (const s of [-1, 1]) b.box("trim", 0.06, 0.08, 0.3, s * 0.55, y + 0.02, z);
    b.box("trim", 1.22, 0.07, 0.3, 0, y + 0.08, z);
    b.box("lensA", 0.56, 0.13, 0.26, -0.31, y + 0.18, z);
    b.box("lensB", 0.56, 0.13, 0.26, 0.31, y + 0.18, z);
    b.box("chrome", 0.08, 0.1, 0.24, 0, y + 0.17, z);
    // 推杆护栏
    for (const by of [0.42, 0.66]) b.box("trim", base.width * 0.46, 0.05, 0.05, 0, by, base.length / 2 + 0.05);
    for (const s of [-1, 1]) b.box("trim", 0.05, 0.34, 0.05, s * base.width * 0.21, 0.55, base.length / 2 + 0.05);
  } else if (kind === "civilian") {
    b.box("lensA", 0.002, 0.002, 0.002, 0, y - 0.3, z);
    b.box("lensB", 0.002, 0.002, 0.002, 0, y - 0.3, z);
  } else {
    b.box("trim", 0.62, 0.05, 0.3, 0, y + 0.03, z);
    b.box("lensA", 0.58, 0.2, 0.26, 0, y + 0.15, z);
    b.box("lensB", 0.002, 0.002, 0.002, 0, y, z);
  }
  return {
    kind, body: b.merge("body"), glass: b.merge("glass"), trim: b.merge("trim"), chrome: b.merge("chrome"), lensA: b.merge("lensA"), lensB: b.merge("lensB"),
    length: base.length, width: base.width, height: base.height, wheelR: base.wheelR, wheels: base.wheels.map((w) => ({ ...w })), dualRear: false, lamps: base.lamps.map((l) => ({ ...l })),
  };
}

export function createServiceShell(kind: ServiceKind, model?: CarModel): ServiceShell {
  if (kind === "boxtruck" || kind === "utility" || kind === "foodtruck") return { ...boxTruckShell(kind === "utility"), kind };
  if (kind === "ambulance") return ambulanceShell();
  const base = model ?? createVehicleShell("sedan");
  const shell = sedanService(kind, base);
  if (!model) for (const g of [base.body, base.glass, base.trim, base.chrome]) g.dispose();
  return shell;
}

// ---------- 涂装着色器 ----------
const LIVERY_KIND: Record<ServiceKind, number> = { police: 0, taxi: 1, ambulance: 2, boxtruck: 3, utility: 4, civilian: 5, foodtruck: 6 };
/** 侧面字样区域（车长 / 车高比例）：z0, z1, y0, y1 与图集行号。 */
const DECALS: Record<ServiceKind, [number, number, number, number, number]> = {
  police: [-0.2, 0.18, 0.36, 0.5, 0],
  taxi: [-0.12, 0.14, 0.34, 0.46, 1],
  ambulance: [-0.45, 0.1, 0.55, 0.72, 2],
  boxtruck: [-0.45, 0.18, 0.48, 0.82, 3],
  utility: [-0.45, 0.18, 0.5, 0.8, 4],
  civilian: [2, 2.0001, 2, 2.0001, 0],
  foodtruck: [-0.45, 0.18, 0.5, 0.82, 5],
};
const DECAL_ROWS = 6;

let decalTexture: THREE.Texture | null | undefined;
function liveryDecals(): THREE.Texture | null {
  if (decalTexture !== undefined) return decalTexture;
  if (typeof document === "undefined") return (decalTexture = null);
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 128 * DECAL_ROWS;
  const c = canvas.getContext("2d");
  if (!c) return (decalTexture = null);
  c.clearRect(0, 0, canvas.width, canvas.height);
  const row = (i: number, draw: (y: number) => void) => { c.save(); draw(i * 128); c.restore(); };
  c.textBaseline = "middle";
  row(0, (y) => {
    c.fillStyle = "#0d2b6b"; c.font = "800 70px 'Noto Sans SC','PingFang SC',Arial,sans-serif"; c.textAlign = "center";
    c.fillText("警察  POLICE", 512, y + 64);
  });
  row(1, (y) => {
    c.fillStyle = "#1b1b1b"; c.font = "800 64px Arial,'Noto Sans SC',sans-serif"; c.textAlign = "center";
    c.fillText("TAXI  出租", 512, y + 64);
  });
  row(2, (y) => {
    c.fillStyle = "#c8102e"; c.font = "900 84px Arial,sans-serif"; c.textAlign = "left"; c.fillText("120", 40, y + 64);
    c.font = "800 52px 'Noto Sans SC','PingFang SC',sans-serif"; c.fillText("急救  AMBULANCE", 250, y + 64);
    c.fillStyle = "#1a7f3c"; c.fillRect(930, y + 24, 24, 80); c.fillRect(902, y + 52, 80, 24);
  });
  row(3, (y) => {
    c.fillStyle = "#f28c28"; c.fillRect(0, y + 96, 1024, 18);
    c.fillStyle = "#13315c"; c.font = "900 76px Arial,'Noto Sans SC',sans-serif"; c.textAlign = "left"; c.fillText("SWIFT", 40, y + 52);
    c.font = "700 46px 'Noto Sans SC','PingFang SC',sans-serif"; c.fillText("快递 · 同城配送  DELIVERY", 330, y + 56);
  });
  row(4, (y) => {
    c.fillStyle = "#1f1f1f"; c.font = "800 60px 'Noto Sans SC','PingFang SC',sans-serif"; c.textAlign = "left"; c.fillText("市政抢修  CITY WORKS", 40, y + 58);
    c.fillStyle = "#1f1f1f"; for (let i = 0; i < 20; i++) { c.beginPath(); c.moveTo(i * 52, y + 128); c.lineTo(i * 52 + 26, y + 100); c.lineTo(i * 52 + 52, y + 100); c.lineTo(i * 52 + 26, y + 128); c.fill(); }
  });
  row(5, (y) => {
    c.fillStyle = "#7a2e12"; c.font = "900 70px 'Noto Sans SC','PingFang SC',Arial,sans-serif"; c.textAlign = "left"; c.fillText("街角煎饼  CRÊPES", 40, y + 60);
    c.fillStyle = "#e8a33c"; for (let i = 0; i < 16; i++) { c.beginPath(); c.arc(32 + i * 64, y + 118, 24, Math.PI, 0); c.fill(); }
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return (decalTexture = texture);
}

/** 车身涂装材质：对象空间坐标划分色带与字样，兼容实例化（实例色作为可变底色）。 */
export function createLiveryMaterial(kind: ServiceKind, shell: Pick<ServiceShell, "length" | "height" | "width">): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({ name: `v3 livery · ${kind}`, color: "#ffffff", roughness: 0.32, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const size = new THREE.Vector3(shell.length, shell.height, shell.width);
  const decal = liveryDecals();
  const [z0, z1, y0, y1, row] = DECALS[kind];
  material.userData.liverySize = size;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLiverySize = { value: size };
    shader.uniforms.uLiveryDecal = { value: decal };
    shader.uniforms.uLiveryRect = { value: new THREE.Vector4(z0, z1, y0, y1) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLivPos;\nvarying vec3 vLivNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLivPos = position;\nvLivNormal = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vLivPos;
varying vec3 vLivNormal;
uniform vec3 uLiverySize;
uniform vec4 uLiveryRect;
${decal ? "uniform sampler2D uLiveryDecal;" : ""}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec3 p = vLivPos;
  vec3 n = normalize(vLivNormal);
  float zt = p.z / uLiverySize.x;
  float yt = p.y / uLiverySize.y;
  vec3 tint = diffuseColor.rgb;
  vec3 col = tint;
  // 色带 / 字样只画在侧立面与前后面，顶面（引擎盖、车顶）保持底色
  float side = 1.0 - step(0.7, abs(n.y));
  ${LIVERY_KIND[kind] === 0 ? `
  col = vec3(0.93, 0.94, 0.95);
  col = mix(col, vec3(0.03, 0.09, 0.3), step(yt, 0.34));
  col = mix(col, vec3(0.12, 0.45, 0.92), step(0.34, yt) * step(yt, 0.38) * side);
  col = mix(col, vec3(0.03, 0.09, 0.3), step(0.97, abs(zt) * 2.0) * step(yt, 0.5));` : ""}
  ${LIVERY_KIND[kind] === 1 ? `
  vec3 lower = vec3(0.05, 0.36, 0.22);
  col = mix(tint, lower, step(yt, 0.38));
  float chk = mod(floor(p.z / 0.12) + floor((p.y - uLiverySize.y * 0.38) / 0.06), 2.0);
  col = mix(col, mix(vec3(0.95), vec3(0.04), chk), step(0.38, yt) * step(yt, 0.38 + 0.12 / uLiverySize.y * 1.0) * side);` : ""}
  ${LIVERY_KIND[kind] === 2 ? `
  col = vec3(0.95, 0.96, 0.96);
  col = mix(col, vec3(0.78, 0.04, 0.1), step(0.37, yt) * step(yt, 0.46) * side);
  col = mix(col, vec3(0.95, 0.5, 0.05), step(0.46, yt) * step(yt, 0.49) * side);
  // 车尾反光人字纹
  float chev = step(0.5, fract((p.x * 1.6 + p.y * 1.6)));
  col = mix(col, mix(vec3(0.78, 0.04, 0.1), vec3(1.0, 0.82, 0.1), chev), step(0.9, n.z * -1.0) * step(yt, 0.62));` : ""}
  ${LIVERY_KIND[kind] === 3 ? `
  // 货厢白色，驾驶室按实例色
  col = mix(tint, vec3(0.94, 0.94, 0.92), step(zt, 0.21) * step(0.32, yt));` : ""}
  ${LIVERY_KIND[kind] === 4 ? `
  col = vec3(0.92, 0.62, 0.1);
  float hz = step(0.5, fract((p.z + p.y) * 1.4));
  col = mix(col, mix(vec3(0.95, 0.95, 0.9), vec3(0.8, 0.1, 0.08), hz), step(0.36, yt) * step(yt, 0.42) * step(zt, 0.2) * side);` : ""}
  ${LIVERY_KIND[kind] === 6 ? `
  // 餐车：奶油色车身 + 薄荷绿下沿
  col = mix(vec3(0.95, 0.9, 0.78), vec3(0.42, 0.72, 0.62), step(yt, 0.36) * side);
  col = mix(col, tint, step(0.21, zt));` : ""}
  ${decal ? `
  if (abs(n.x) > 0.6) {
    float u = (zt - uLiveryRect.x) / (uLiveryRect.y - uLiveryRect.x);
    if (n.x > 0.0) u = 1.0 - u;
    float v = (yt - uLiveryRect.z) / (uLiveryRect.w - uLiveryRect.z);
    if (u > 0.0 && u < 1.0 && v > 0.0 && v < 1.0) {
      vec4 d = texture2D(uLiveryDecal, vec2(u, 1.0 - (${row.toFixed(1)} + 1.0 - v) / ${DECAL_ROWS.toFixed(1)}));
      col = mix(col, pow(d.rgb, vec3(2.2)), d.a);
    }
  }` : ""}
  diffuseColor.rgb = col;
}`);
  };
  material.customProgramCacheKey = () => `v3-livery-2-${kind}-${decal ? 1 : 0}`;
  return material;
}

// ---------- 独立车辆（事件 / 停放） ----------
const sharedMaterials = {
  glass: new THREE.MeshPhysicalMaterial({ name: "v3 service glass", color: "#5f7684", roughness: 0.06, metalness: 0.1, transmission: 0, transparent: false, clearcoat: 1, reflectivity: 0.6, envMapIntensity: 1.4 }),
  trim: new THREE.MeshStandardMaterial({ name: "v3 service trim", color: "#1d2124", roughness: 0.7, metalness: 0.1 }),
  chrome: new THREE.MeshStandardMaterial({ name: "v3 service chrome", color: "#c9cfd2", roughness: 0.22, metalness: 0.9 }),
  tire: new THREE.MeshStandardMaterial({ name: "v3 service tire", color: "#151719", roughness: 0.9 }),
};
const LENS_COLORS: Record<ServiceKind, [string, string]> = { civilian: ["#222222", "#222222"], foodtruck: ["#ffb020", "#ffb020"], police: ["#ff2a1f", "#1f6dff"], taxi: ["#ffe07a", "#ffe07a"], ambulance: ["#ff2a1f", "#1f6dff"], boxtruck: ["#ffb020", "#ffb020"], utility: ["#ffb020", "#ffb020"] };

export class ServiceVehicle {
  readonly group = new THREE.Group();
  readonly shell: ServiceShell;
  private readonly lensA: THREE.MeshStandardMaterial;
  private readonly lensB: THREE.MeshStandardMaterial;
  private readonly body: THREE.MeshPhysicalMaterial;
  private readonly meshes: Record<"body" | "glass" | "trim" | "chrome" | "lensA" | "lensB", THREE.Mesh>;
  private readonly wheels: THREE.Group[] = [];
  private static wheel?: { tire: THREE.BufferGeometry; rim: THREE.BufferGeometry };

  constructor(readonly kind: ServiceKind, color = "#ffffff") {
    this.shell = createServiceShell(kind);
    this.body = createLiveryMaterial(kind, this.shell);
    this.body.color.set(color);
    const [a, b] = LENS_COLORS[kind];
    this.lensA = new THREE.MeshStandardMaterial({ name: `${kind} lens A`, color: a, emissive: a, emissiveIntensity: 0.15, roughness: 0.2 });
    this.lensB = new THREE.MeshStandardMaterial({ name: `${kind} lens B`, color: b, emissive: b, emissiveIntensity: 0.15, roughness: 0.2 });
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, shadow = true) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };
    this.meshes = {
      body: make(this.shell.body, this.body), glass: make(this.shell.glass, sharedMaterials.glass), trim: make(this.shell.trim, sharedMaterials.trim),
      chrome: make(this.shell.chrome, sharedMaterials.chrome), lensA: make(this.shell.lensA, this.lensA, false), lensB: make(this.shell.lensB, this.lensB, false),
    };
    this.group.name = `v3 service vehicle · ${kind}`;
    this.buildWheels();
  }

  private buildWheels(): void {
    for (const w of this.wheels) this.group.remove(w);
    this.wheels.length = 0;
    ServiceVehicle.wheel ??= createVehicleWheel();
    const geo = ServiceVehicle.wheel;
    const positions = [...this.shell.wheels];
    if (this.shell.dualRear) for (const w of this.shell.wheels.filter((p) => p.z < 0)) positions.push({ x: w.x - Math.sign(w.x) * 0.3, z: w.z });
    for (const p of positions) {
      const g = new THREE.Group();
      for (const [geometry, material] of [[geo.tire, sharedMaterials.tire], [geo.rim, sharedMaterials.chrome]] as const) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.rotation.z = Math.PI / 2;
        g.add(mesh);
      }
      g.position.set(p.x, this.shell.wheelR, p.z);
      g.scale.setScalar(this.shell.wheelR);
      this.group.add(g);
      this.wheels.push(g);
    }
  }

  private tracked?: { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material> };

  /** 把本车几何 / 材质登记到外部资源集合（城市卸载时统一释放；升级后的新几何同样登记）。 */
  track(resources: { geometries: Set<THREE.BufferGeometry>; materials: Set<THREE.Material> }): this {
    this.tracked = resources;
    this.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      resources.geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.materials.add(material);
    });
    return this;
  }

  /** CC0 轿车模型就绪后替换警车 / 出租车车身。 */
  upgrade(model: CarModel): void {
    if (this.kind !== "police" && this.kind !== "taxi" && this.kind !== "civilian") return;
    const next = createServiceShell(this.kind, model);
    for (const key of ["body", "glass", "trim", "chrome", "lensA", "lensB"] as const) {
      this.meshes[key].geometry.dispose();
      this.meshes[key].geometry = next[key];
    }
    Object.assign(this.shell, next);
    (this.body.userData.liverySize as THREE.Vector3).set(next.length, next.height, next.width);
    this.buildWheels();
    if (this.tracked) this.track(this.tracked);
  }

  /** 频闪：on=false 时灯罩微亮（白天可见颜色）。 */
  flash(seconds: number, on: boolean, night = false): void {
    const phase = Math.floor(seconds * 6) % 4;
    const a = on ? (phase === 0 || phase === 2 ? 1 : 0) : 0;
    const b = on ? (phase === 1 || phase === 3 ? 1 : 0) : 0;
    const peak = night ? 6 : 3.2;
    const steady = this.kind === "taxi" ? (night ? 2.2 : 0.6) : 0.12;
    this.lensA.emissiveIntensity = on ? 0.1 + a * peak : steady;
    this.lensB.emissiveIntensity = on ? 0.1 + b * peak : steady;
  }

  place(x: number, y: number, z: number, heading: number): void {
    this.group.position.set(x, y, z);
    this.group.rotation.set(0, heading, 0);
  }

  dispose(): void {
    for (const mesh of Object.values(this.meshes)) mesh.geometry.dispose();
    this.body.dispose();
    this.lensA.dispose();
    this.lensB.dispose();
  }
}
