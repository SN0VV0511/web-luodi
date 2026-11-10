import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * 程序化城市公交与厢式面包车：低地板公交（分格侧窗 + 立柱、双开玻璃门、前挡与电子路牌、
 * 顶置空调舱、轮拱护边、前后保险杠、后视镜杆、尾部散热格栅），面包车（短引擎盖 + 斜前挡、
 * 侧滑门轨道与门缝、对开后门、高位刹车灯、格栅与踏步）。
 * 全部由封闭长方体 / 圆柱拼装（每块都是闭合网格），按材质分为 body / glass / trim / chrome 四组，
 * 坐标与既有车壳一致：车头 +z，车宽沿 x，地面 y = 0。
 */
type Part = THREE.BufferGeometry;
type Groups = { body: Part[]; glass: Part[]; trim: Part[]; chrome: Part[] };

function prepare(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  if (flat !== geometry) geometry.dispose();
  const count = flat.getAttribute("position").count;
  if (!flat.getAttribute("uv")) flat.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
  flat.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  return flat;
}

class Builder {
  readonly groups: Groups = { body: [], glass: [], trim: [], chrome: [] };
  private readonly matrix = new THREE.Matrix4();
  private readonly euler = new THREE.Euler();

  box(group: keyof Groups, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, segments = 1): void {
    const g = new THREE.BoxGeometry(w, h, d, segments, segments);
    this.place(g, x, y, z, rx, ry, rz);
    this.groups[group].push(g);
  }

  /** 左右对称各放一块（x 取正值）。 */
  pair(group: keyof Groups, w: number, h: number, d: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
    this.box(group, w, h, d, x, y, z, rx, ry, rz);
    this.box(group, w, h, d, -x, y, z, rx, -ry, -rz);
  }

  cylinder(group: keyof Groups, r: number, len: number, x: number, y: number, z: number, axis: "x" | "y" | "z", segments = 12): void {
    const g = new THREE.CylinderGeometry(r, r, len, segments, 1, false);
    this.place(g, x, y, z, axis === "z" ? Math.PI / 2 : 0, 0, axis === "x" ? Math.PI / 2 : 0);
    this.groups[group].push(g);
  }

  private place(g: THREE.BufferGeometry, x: number, y: number, z: number, rx: number, ry: number, rz: number): void {
    this.euler.set(rx, ry, rz);
    this.matrix.makeRotationFromEuler(this.euler).setPosition(x, y, z);
    g.applyMatrix4(this.matrix);
  }

  build(): { body: Part; glass: Part; trim: Part; chrome: Part } {
    const merge = (parts: Part[]) => {
      const merged = mergeGeometries(parts.map(prepare), false)!;
      for (const part of parts) part.dispose();
      return merged;
    };
    return { body: merge(this.groups.body), glass: merge(this.groups.glass), trim: merge(this.groups.trim), chrome: merge(this.groups.chrome) };
  }
}

type Meta = { length: number; width: number; height: number; wheelR: number; wheels: { x: number; z: number }[] };

/** 轮拱：在轮心上方一圈短块，y 以轮心为圆心。 */
function wheelArch(b: Builder, halfWidth: number, wheelZ: number, wheelR: number, archR: number): void {
  const steps = 9;
  for (const side of [1, -1]) {
    for (let i = 0; i < steps; i++) {
      const a = Math.PI * (i + 0.5) / steps; // 0 → 后方，π → 前方
      const len = (Math.PI * archR) / steps * 1.12;
      b.box("trim", 0.06, 0.075, len, side * (halfWidth + 0.012), wheelR + archR * Math.sin(a), wheelZ - archR * Math.cos(a), a - Math.PI / 2, 0, 0);
    }
  }
}

export function createBusShell(meta: Meta) {
  const b = new Builder();
  const L = meta.length, W = meta.width, H = meta.height;
  const hw = W / 2, hl = L / 2;
  const floor = 0.3; // 车身下沿
  const belt = 1.12; // 窗台
  const roof = H - 0.3; // 窗顶
  const [rear, front] = [Math.min(...meta.wheels.map((w) => w.z)), Math.max(...meta.wheels.map((w) => w.z))];
  const archR = meta.wheelR + 0.1;
  // —— 车身下裙：轮拱与车门处断开 ——
  const doorFront = [front + archR + 0.12, hl - 0.38];
  const doorMid = [-0.62, 0.62];
  const cuts: [number, number][] = [[rear - archR, rear + archR], [front - archR, front + archR]];
  const skirtSpans = (exclude: [number, number][]) => {
    const spans: [number, number][] = [];
    let start = -hl + 0.06;
    for (const [a, c] of [...exclude].sort((p, q) => p[0] - q[0])) { if (a > start) spans.push([start, a]); start = Math.max(start, c); }
    if (start < hl - 0.06) spans.push([start, hl - 0.06]);
    return spans;
  };
  for (const side of [1, -1]) {
    const exclude: [number, number][] = side < 0 ? [...cuts, doorFront as [number, number], doorMid as [number, number]] : cuts;
    for (const [a, c] of skirtSpans(exclude)) {
      b.box("body", 0.08, belt - floor - 0.001, c - a, side * (hw - 0.04), (belt + floor) / 2, (a + c) / 2);
    }
    // 轮拱上方的车身条（轮拱顶到窗台）。
    for (const [a, c] of cuts) b.box("body", 0.081, belt - (meta.wheelR + archR) + 0.002, c - a + 0.003, side * (hw - 0.041), (belt + meta.wheelR + archR) / 2, (a + c) / 2);
    // 腰线防擦条（亮色）与底部黑色裙边。
    b.box("chrome", 0.03, 0.05, L - 0.4, side * (hw + 0.006), 0.78, 0.02);
    b.box("trim", 0.03, 0.08, L - 0.3, side * (hw + 0.002), floor + 0.04, 0.01);
  }
  wheelArch(b, hw - 0.04, rear, meta.wheelR, archR);
  wheelArch(b, hw - 0.04, front, meta.wheelR, archR);
  // 轮腔内衬（黑色，遮住车内）。
  for (const z of [rear, front]) b.box("trim", W - 0.3, 0.5, archR * 2 - 0.05, 0, meta.wheelR + 0.35, z + 0.001);
  // 车厢底板 / 内壳（让窗后有深色车内而不是透空）。
  b.box("trim", W - 0.2, roof - floor - 0.1, L - 0.3, 0, (roof + floor) / 2, 0.003);
  // —— 窗带：分格玻璃 + 车身色立柱 ——
  const windowH = roof - belt - 0.06;
  const wy = belt + 0.03 + windowH / 2;
  for (const side of [1, -1]) {
    const exclude: [number, number][] = side < 0 ? [doorFront as [number, number], doorMid as [number, number]] : [];
    for (const [a, c] of skirtSpans(exclude)) {
      const span = c - a;
      const panes = Math.max(1, Math.round(span / 1.25));
      const pw = span / panes;
      for (let i = 0; i < panes; i++) {
        const z0 = a + i * pw;
        b.box("glass", 0.03, windowH, pw - 0.1, side * (hw - 0.025), wy, z0 + pw / 2);
        // 上下分格（上部小开窗）
        b.box("trim", 0.034, 0.03, pw - 0.1, side * (hw - 0.023), wy + windowH * 0.22, z0 + pw / 2 + 0.0007);
        b.box("body", 0.07, windowH + 0.06, 0.1, side * (hw - 0.035), wy, z0 + 0.0003 * i);
      }
      b.box("body", 0.07, windowH + 0.061, 0.1, side * (hw - 0.0351), wy, c - 0.05);
    }
    // 窗台与窗顶的车身横梁。
    b.box("body", 0.09, 0.06, L - 0.12, side * (hw - 0.045), belt, 0);
    b.box("body", 0.09, 0.08, L - 0.12, side * (hw - 0.046), roof + 0.01, 0.0005);
  }
  // —— 车门（右侧 = -x，靠路沿）：双扇玻璃门，黑色门框与中缝 ——
  for (const [a, c] of [doorFront, doorMid]) {
    const dz = c - a, mid = (a + c) / 2, top = roof - 0.04;
    const h = top - floor - 0.08;
    for (const leaf of [-1, 1]) {
      const z = mid + leaf * dz / 4;
      b.box("glass", 0.03, h - 0.12, dz / 2 - 0.08, -(hw - 0.03), floor + 0.08 + h / 2, z);
      b.box("trim", 0.05, h, 0.04, -(hw - 0.028), floor + 0.08 + h / 2, z + leaf * (dz / 4 - 0.02));
      b.box("trim", 0.05, 0.05, dz / 2 - 0.02, -(hw - 0.027), floor + 0.1, z);
      b.box("trim", 0.05, 0.045, dz / 2 - 0.02, -(hw - 0.0271), floor + 0.08 + h * 0.55, z + 0.0004);
    }
    b.box("trim", 0.052, h + 0.04, 0.03, -(hw - 0.026), floor + 0.08 + h / 2, mid);
    b.box("body", 0.09, roof + 0.05 - top, dz + 0.02, -(hw - 0.045), (top + roof + 0.05) / 2, mid);
    // 车门台阶（深色）
    b.box("trim", 0.25, 0.06, dz - 0.05, -(hw - 0.12), floor + 0.03, mid);
  }
  // 圆角：车顶两侧肩线与车头 / 车尾竖向转角用圆柱收边，打破方盒轮廓。
  b.pair("body", 0.14, 0.14, L - 0.1, hw - 0.1, roof + 0.1, 0.0002);
  for (const side of [1, -1]) {
    b.cylinder("body", 0.1, L - 0.14, side * (hw - 0.1), roof + 0.12, 0.0004, "z", 10);
    b.cylinder("body", 0.07, roof - floor - 0.05, side * (hw - 0.07), (roof + floor) / 2, hl - 0.07, "y", 10);
    b.cylinder("body", 0.07, roof - floor - 0.05, side * (hw - 0.07), (roof + floor) / 2 + 0.001, -hl + 0.07, "y", 10);
  }
  b.cylinder("body", 0.09, W - 0.2, 0, roof + 0.12, hl - 0.1, "x", 10);
  b.cylinder("body", 0.09, W - 0.2, 0, roof + 0.12, -hl + 0.1, "x", 10);
  // —— 车顶：两级台阶 + 空调舱 ——
  b.box("body", W - 0.04, 0.1, L - 0.06, 0, roof + 0.1, 0);
  b.box("body", W - 0.24, 0.08, L - 0.3, 0, roof + 0.18, 0.001);
  b.box("chrome", 1.5, 0.22, 2.6, 0, roof + 0.33, -0.6);
  for (let i = 0; i < 5; i++) b.box("trim", 1.3, 0.02, 0.06, 0, roof + 0.445, -1.6 + i * 0.5);
  b.box("chrome", 0.9, 0.1, 0.9, 0, roof + 0.27, 2.6);
  // —— 车头 ——
  const fz = hl - 0.03;
  b.box("body", W - 0.02, belt - floor, 0.08, 0, (belt + floor) / 2, fz);
  // 前挡：大面积玻璃，轻微后倾；上方电子路牌（黑底 + 亮色字条）。
  b.box("glass", W - 0.16, roof - belt - 0.12, 0.04, 0, belt + (roof - belt - 0.12) / 2 + 0.02, fz - 0.02, -0.05, 0, 0, 2);
  b.box("trim", W - 0.12, 0.26, 0.06, 0, roof + 0.02, fz - 0.03);
  b.box("chrome", W * 0.55, 0.08, 0.02, 0, roof + 0.03, fz + 0.005);
  b.pair("body", 0.08, roof - belt + 0.1, 0.1, hw - 0.04, (roof + belt) / 2, fz - 0.03); // A 柱
  b.box("body", W - 0.02, 0.08, 0.1, 0, belt - 0.02, fz - 0.02);
  // 雨刮
  b.pair("trim", 0.02, 0.85, 0.015, 0.35, belt + 0.45, fz + 0.015, 0, 0, 0.35);
  // 保险杠、格栅、牌照、灯组底座
  b.box("trim", W, 0.26, 0.14, 0, floor + 0.12, hl + 0.02);
  b.box("trim", W * 0.5, 0.16, 0.03, 0, floor + 0.42, fz + 0.045);
  for (let i = 0; i < 4; i++) b.box("chrome", W * 0.46, 0.012, 0.012, 0, floor + 0.36 + i * 0.035, fz + 0.065);
  b.box("chrome", 0.44, 0.13, 0.02, 0, floor + 0.16, hl + 0.1);
  b.pair("chrome", 0.42, 0.16, 0.04, hw - 0.3, 1.09, fz + 0.04);
  b.pair("trim", 0.44, 0.18, 0.03, hw - 0.3, 1.09, fz + 0.025);
  // 后视镜：从车顶前角伸出的弯杆 + 镜头（公交典型「兔耳」镜）。
  for (const side of [1, -1]) {
    b.box("trim", 0.04, 0.04, 0.5, side * (hw + 0.02), roof - 0.05, fz + 0.2, 0.25);
    b.box("trim", 0.04, 0.32, 0.04, side * (hw + 0.02), roof - 0.27, fz + 0.43);
    b.box("trim", 0.06, 0.34, 0.2, side * (hw + 0.03), roof - 0.55, fz + 0.43);
    b.box("chrome", 0.02, 0.3, 0.16, side * (hw + 0.065), roof - 0.55, fz + 0.43);
  }
  // —— 车尾 ——
  const rz = -hl + 0.03;
  b.box("body", W - 0.02, roof - floor + 0.08, 0.08, 0, (roof + floor) / 2 + 0.04, rz);
  b.box("glass", W - 0.5, 0.6, 0.03, 0, roof - 0.38, rz - 0.045);
  for (let i = 0; i < 8; i++) b.box("trim", W - 0.7, 0.025, 0.03, 0, floor + 0.45 + i * 0.06, rz - 0.045);
  b.box("trim", W, 0.26, 0.14, 0, floor + 0.12, -hl - 0.02);
  b.pair("chrome", 0.16, 0.36, 0.04, hw - 0.17, 1.18, rz - 0.045);
  b.box("chrome", 0.44, 0.13, 0.02, 0, floor + 0.35, rz - 0.06);
  b.cylinder("trim", 0.05, 0.2, -hw + 0.3, floor + 0.02, -hl + 0.05, "z", 8);
  return b.build();
}

export function createVanShell(meta: Meta) {
  const b = new Builder();
  const L = meta.length, W = meta.width, H = meta.height;
  const hw = W / 2, hl = L / 2;
  const floor = 0.3;
  const belt = 1.12;
  const hood = 1.02; // 引擎盖高度
  const cowl = hl - 0.72; // 前挡下沿 z
  const roofFront = cowl - 0.62; // 车顶前沿 z
  const archR = meta.wheelR + 0.08;
  const [rear, front] = [Math.min(...meta.wheels.map((w) => w.z)), Math.max(...meta.wheels.map((w) => w.z))];
  const spans = (exclude: [number, number][], from: number, to: number) => {
    const out: [number, number][] = [];
    let start = from;
    for (const [a, c] of [...exclude].sort((p, q) => p[0] - q[0])) { if (a > start) out.push([start, a]); start = Math.max(start, c); }
    if (start < to) out.push([start, to]);
    return out;
  };
  const cuts: [number, number][] = [[rear - archR, rear + archR], [front - archR, front + archR]];
  for (const side of [1, -1]) {
    // 下车身（含引擎舱侧面）
    for (const [a, c] of spans(cuts, -hl + 0.05, hl - 0.08)) b.box("body", 0.08, belt - floor, c - a, side * (hw - 0.04), (belt + floor) / 2, (a + c) / 2);
    for (const [a, c] of cuts) b.box("body", 0.081, belt - (meta.wheelR + archR) + 0.003, c - a + 0.002, side * (hw - 0.0405), (belt + meta.wheelR + archR) / 2, (a + c) / 2);
    // 货厢上侧板（车顶前沿之后到车尾）
    b.box("body", 0.08, H - belt - 0.05, roofFront + hl - 0.05, side * (hw - 0.04), (H + belt) / 2 - 0.025, (roofFront - hl + 0.05) / 2);
    // 驾驶室侧窗（前门）
    b.box("glass", 0.03, H - belt - 0.3, roofFront - cowl + 0.62 - 0.25 + 0.2, side * (hw - 0.02), belt + (H - belt - 0.3) / 2 + 0.05, roofFront + 0.12);
    // 前门门缝 + 门把手；侧滑门（右侧）门缝与导轨
    b.box("trim", 0.086, belt - floor + 0.6, 0.012, side * (hw - 0.04), (floor + belt + 0.6) / 2, roofFront - 0.12);
    b.box("chrome", 0.03, 0.03, 0.16, side * (hw + 0.005), belt - 0.08, roofFront - 0.25);
    b.box("trim", 0.03, 0.08, L - 0.3, side * (hw + 0.002), floor + 0.05, 0.002);
    b.box("chrome", 0.025, 0.04, L * 0.5, side * (hw + 0.008), 0.72, -0.25);
  }
  // 侧滑门（-x）
  const slide = [roofFront - 1.45, roofFront - 0.16];
  b.box("trim", 0.086, H - floor - 0.25, 0.012, -(hw - 0.04), (H + floor - 0.25) / 2, slide[0]);
  b.box("trim", 0.086, H - floor - 0.25, 0.012, -(hw - 0.0401), (H + floor - 0.25) / 2, slide[1]);
  b.box("trim", 0.03, 0.03, slide[1] - slide[0] + 0.9, -(hw + 0.006), H - 0.58, (slide[0] + slide[1]) / 2 - 0.4);
  b.box("glass", 0.03, 0.45, slide[1] - slide[0] - 0.3, -(hw - 0.022), H - 0.6, (slide[0] + slide[1]) / 2);
  b.box("chrome", 0.03, 0.03, 0.2, -(hw + 0.006), belt - 0.08, slide[1] - 0.2);
  wheelArch(b, hw - 0.04, rear, meta.wheelR, archR);
  wheelArch(b, hw - 0.04, front, meta.wheelR, archR);
  for (const z of [rear, front]) b.box("trim", W - 0.3, 0.45, archR * 2 - 0.05, 0, meta.wheelR + 0.32, z + 0.002);
  b.box("trim", W - 0.18, H - floor - 0.2, roofFront + hl - 0.2, 0, (H + floor) / 2 - 0.1, (roofFront - hl) / 2 + 0.003);
  // 圆角收边：车顶肩线、车尾竖向转角。
  for (const side of [1, -1]) {
    b.cylinder("body", 0.08, roofFront + hl - 0.1, side * (hw - 0.08), H - 0.07, (roofFront - hl) / 2 + 0.0003, "z", 10);
    b.cylinder("body", 0.06, H - floor - 0.12, side * (hw - 0.06), (H + floor) / 2 - 0.06, -hl + 0.06, "y", 10);
  }
  b.cylinder("body", 0.08, W - 0.16, 0, H - 0.07, -hl + 0.08, "x", 10);
  // 车顶（带两条加强筋）
  b.box("body", W - 0.04, 0.06, roofFront + hl - 0.02, 0, H - 0.03, (roofFront - hl) / 2);
  for (let i = 0; i < 4; i++) b.box("body", W - 0.3, 0.02, 0.06, 0, H + 0.005, roofFront - 0.6 - i * 0.75);
  // 引擎盖（略前倾）与前脸
  b.box("body", W - 0.04, 0.06, hl - cowl + 0.04, 0, hood, (hl + cowl) / 2 - 0.02, -0.06);
  b.box("body", W - 0.02, hood - floor, 0.1, 0, (hood + floor) / 2, hl - 0.1);
  // 前挡：从前挡下沿 (cowl, belt) 斜向车顶前沿 (roofFront, H)
  const rake = Math.atan2(cowl - roofFront, H - hood);
  const glassLen = Math.hypot(cowl - roofFront, H - hood);
  b.box("glass", W - 0.16, glassLen - 0.06, 0.03, 0, (H + hood) / 2, (cowl + roofFront) / 2, -rake, 0, 0, 2);
  b.pair("body", 0.08, glassLen, 0.08, hw - 0.04, (H + hood) / 2, (cowl + roofFront) / 2, -rake); // A 柱
  b.box("trim", W - 0.3, 0.02, 0.5, 0, hood + 0.04, cowl + 0.06); // 雨刮槽
  // 格栅 + 大灯 + 保险杠 + 牌照
  b.box("trim", W * 0.62, 0.24, 0.03, 0, hood - 0.2, hl - 0.04);
  for (let i = 0; i < 3; i++) b.box("chrome", W * 0.6, 0.014, 0.014, 0, hood - 0.27 + i * 0.07, hl - 0.022);
  b.pair("chrome", 0.32, 0.14, 0.04, hw - 0.27, 0.78, hl - 0.06);
  b.box("trim", W + 0.02, 0.22, 0.14, 0, floor + 0.08, hl - 0.02);
  b.box("chrome", 0.4, 0.11, 0.02, 0, floor + 0.1, hl + 0.06);
  // 后视镜
  for (const side of [1, -1]) {
    b.box("trim", 0.22, 0.04, 0.05, side * (hw + 0.09), belt + 0.08, roofFront + 0.5);
    b.box("trim", 0.06, 0.26, 0.14, side * (hw + 0.2), belt + 0.16, roofFront + 0.5);
    b.box("chrome", 0.012, 0.22, 0.11, side * (hw + 0.17), belt + 0.16, roofFront + 0.44 + 0.0003);
  }
  // 车尾：对开门 + 中缝 + 后窗 + 竖排尾灯 + 高位刹车灯 + 踏步
  const rz = -hl + 0.03;
  b.box("body", W - 0.02, H - floor - 0.05, 0.08, 0, (H + floor) / 2 - 0.025, rz);
  b.box("trim", 0.014, H - floor - 0.2, 0.09, 0, (H + floor) / 2 - 0.08, rz - 0.002);
  b.pair("glass", W / 2 - 0.25, 0.42, 0.03, W / 4, H - 0.48, rz - 0.04);
  b.pair("chrome", 0.08, 0.04, 0.03, 0.12, belt - 0.05, rz - 0.045);
  b.pair("chrome", 0.12, 0.5, 0.04, hw - 0.07, 1.06, rz - 0.035);
  b.box("chrome", 0.3, 0.05, 0.03, 0, H - 0.08, rz - 0.045);
  b.box("trim", W + 0.02, 0.2, 0.14, 0, floor + 0.08, -hl + 0.02);
  b.box("trim", 0.7, 0.04, 0.22, 0, floor + 0.12, -hl - 0.06);
  b.box("chrome", 0.4, 0.11, 0.02, 0, floor + 0.38, rz - 0.045);
  return b.build();
}

/**
 * 重型消防车：平头双排驾驶室（四门、两级脚踏、门把手、前格栅与保险杠）、带卷帘器材箱的上装
 * （每侧三格铝合金卷帘、下层器材箱、反光腰线）、泵浦操作面板与仪表、车顶扶手、云梯转台与托架、
 * 尾部踏板与水带卷盘。车长 / 轮位沿用货车元数据，云梯另由事件系统驱动。
 */
export function createFireEngineShell(meta: Meta) {
  const b = new Builder();
  const L = meta.length, W = meta.width;
  const hw = W / 2, hl = L / 2;
  const [rear, front] = [Math.min(...meta.wheels.map((w) => w.z)), Math.max(...meta.wheels.map((w) => w.z))];
  const archR = meta.wheelR + 0.09;
  const cabBack = 1.2, cabRoof = 2.28, sill = 0.62;
  const bodyTop = 2.2, bodyBottom = 0.58;
  // —— 底盘 ——
  b.pair("trim", 0.12, 0.22, L - 0.5, 0.45, 0.62, -0.05);
  b.cylinder("chrome", 0.22, 0.9, -(hw - 0.35), 0.55, 0.1, "z", 12);
  for (const z of [rear, front]) b.box("trim", W - 0.3, 0.5, archR * 2 - 0.04, 0, meta.wheelR + 0.32, z + 0.001);
  wheelArch(b, hw - 0.04, rear, meta.wheelR, archR);
  wheelArch(b, hw - 0.04, front, meta.wheelR, archR);
  // —— 驾驶室 ——
  const cabLen = hl - cabBack;
  const cabMid = (hl + cabBack) / 2;
  for (const side of [1, -1]) {
    // 轮拱前后的车门下板
    b.box("body", 0.08, 1.45 - sill, front - archR - cabBack, side * (hw - 0.04), (1.45 + sill) / 2, (front - archR + cabBack) / 2);
    b.box("body", 0.08, 1.45 - sill, hl - 0.05 - (front + archR), side * (hw - 0.04), (1.45 + sill) / 2, (hl - 0.05 + front + archR) / 2);
    b.box("body", 0.081, 1.45 - (meta.wheelR + archR), archR * 2 + 0.003, side * (hw - 0.0405), (1.45 + meta.wheelR + archR) / 2, front);
    // 前门 / 后排门车窗与立柱
    const windows: [number, number][] = [[cabBack + 0.12, cabBack + 0.95], [cabBack + 1.07, hl - 0.18]];
    for (const [a, c] of windows) b.box("glass", 0.03, 0.72, c - a, side * (hw - 0.02), 1.86, (a + c) / 2);
    b.box("body", 0.08, 0.86, 0.12, side * (hw - 0.04), 1.86, cabBack + 0.06);
    b.box("body", 0.08, 0.86, 0.12, side * (hw - 0.0401), 1.86, cabBack + 1.01);
    b.box("body", 0.08, 0.86, 0.14, side * (hw - 0.04), 1.86, hl - 0.11);
    b.box("body", 0.09, 0.1, cabLen, side * (hw - 0.045), 1.46, cabMid);
    // 门缝、把手、脚踏
    for (const z of [cabBack + 0.05, cabBack + 1.01, hl - 0.2]) b.box("trim", 0.086, 1.6, 0.012, side * (hw - 0.04), 1.45, z + 0.0005);
    for (const z of [cabBack + 0.85, hl - 0.35]) b.box("chrome", 0.03, 0.04, 0.18, side * (hw + 0.006), 1.38, z);
    for (const z of [cabBack + 0.55, (cabBack + 1.07 + hl - 0.18) / 2]) {
      b.box("chrome", 0.32, 0.03, 0.5, side * (hw - 0.1), 0.42, z);
      b.box("chrome", 0.26, 0.03, 0.5, side * (hw - 0.12), 0.78, z + 0.0004);
    }
    // 门边竖扶手
    b.cylinder("chrome", 0.018, 0.75, side * (hw + 0.03), 1.25, cabBack + 0.12, "y", 8);
    b.cylinder("chrome", 0.018, 0.75, side * (hw + 0.03), 1.25, hl - 0.14, "y", 8);
    // 反光腰线（白）
    b.box("chrome", 0.02, 0.09, L - 0.3, side * (hw + 0.012), 1.08, -0.02);
  }
  // 车顶、车头
  b.box("body", W - 0.02, 0.12, cabLen, 0, cabRoof - 0.06, cabMid);
  b.pair("body", 0.1, 0.1, cabLen - 0.02, hw - 0.08, cabRoof - 0.06, cabMid + 0.0004);
  b.box("trim", W - 0.2, cabRoof - sill - 0.2, cabLen - 0.2, 0, (cabRoof + sill) / 2, cabMid + 0.002);
  const fz = hl - 0.04;
  b.box("glass", W - 0.22, 0.78, 0.04, 0, 1.86, fz, -0.06, 0, 0, 2);
  b.box("body", W - 0.02, 1.45 - sill, 0.08, 0, (1.45 + sill) / 2, fz);
  b.box("body", W - 0.02, 0.08, 0.1, 0, 1.45, fz - 0.01);
  b.box("trim", W * 0.6, 0.38, 0.03, 0, 1.05, fz + 0.045);
  for (let i = 0; i < 6; i++) b.box("chrome", W * 0.58, 0.018, 0.018, 0, 0.9 + i * 0.06, fz + 0.065);
  b.box("chrome", W + 0.04, 0.24, 0.16, 0, 0.5, hl + 0.03);
  b.box("trim", 0.5, 0.2, 0.06, 0, 0.5, hl + 0.12);
  b.pair("chrome", 0.3, 0.16, 0.04, hw - 0.3, 0.9, fz + 0.04);
  b.pair("trim", 0.02, 0.62, 0.015, 0.42, 1.88, fz + 0.03, 0, 0, 0.3);
  // 后视镜（大号，带支架）
  for (const side of [1, -1]) {
    b.box("chrome", 0.32, 0.03, 0.03, side * (hw + 0.14), 1.95, hl - 0.25);
    b.box("chrome", 0.32, 0.03, 0.03, side * (hw + 0.14), 1.6, hl - 0.25);
    b.box("trim", 0.07, 0.5, 0.2, side * (hw + 0.3), 1.78, hl - 0.25);
  }
  // —— 泵浦面板（驾驶室与上装之间）——
  const pz = cabBack - 0.18;
  for (const side of [1, -1]) {
    b.box("chrome", 0.06, 1.3, 0.34, side * (hw - 0.03), 1.3, pz);
    for (let i = 0; i < 3; i++) b.cylinder("trim", 0.045, 0.04, side * (hw + 0.01), 1.6 - i * 0.22, pz, "x", 12);
    b.cylinder("chrome", 0.06, 0.16, side * (hw + 0.06), 0.88, pz, "x", 10);
  }
  b.box("trim", W - 0.1, bodyTop - bodyBottom, 0.34, 0, (bodyTop + bodyBottom) / 2, pz + 0.001);
  // —— 上装：卷帘器材箱 ——
  const bodyFront = pz - 0.17, bodyRear = -hl + 0.05;
  const bays: [number, number][] = [[rear + archR + 0.04, bodyFront - 0.04], [rear - archR - 0.04, rear + archR + 0.04], [bodyRear + 0.04, rear - archR - 0.04]];
  for (const side of [1, -1]) {
    for (const [a, c] of bays) {
      const mid = (a + c) / 2, len = Math.abs(c - a);
      const upperBottom = a < rear && c > rear ? meta.wheelR + archR + 0.05 : 0.72;
      // 卷帘框（车身色）+ 铝合金卷帘板条
      b.box("body", 0.08, bodyTop - upperBottom, len + 0.08, side * (hw - 0.04), (bodyTop + upperBottom) / 2, mid);
      const slats = Math.max(4, Math.round((bodyTop - 0.1 - upperBottom - 0.06) / 0.12));
      const top = bodyTop - 0.1, bottom = upperBottom + 0.06;
      for (let i = 0; i < slats; i++) {
        const y = bottom + (i + 0.5) * (top - bottom) / slats;
        b.box("chrome", 0.025, (top - bottom) / slats - 0.018, len - 0.12, side * (hw + 0.004), y, mid + i * 0.0002);
      }
      b.box("trim", 0.04, 0.04, len * 0.35, side * (hw + 0.02), bottom + 0.05, mid); // 卷帘拉杆
    }
    // 下层器材箱（前轮拱后 / 后轮拱前），黑色踏步边
    b.box("body", 0.12, 0.3, bays[0][1] - bays[0][0] - 0.1, side * (hw - 0.06), 0.62, (bays[0][0] + bays[0][1]) / 2);
    b.box("chrome", 0.14, 0.03, bays[0][1] - bays[0][0] - 0.1, side * (hw - 0.05), 0.78, (bays[0][0] + bays[0][1]) / 2 + 0.0003);
    // 车顶扶手
    b.cylinder("chrome", 0.022, bodyFront - bodyRear - 0.3, side * (hw - 0.08), bodyTop + 0.2, (bodyFront + bodyRear) / 2, "z", 8);
    for (const z of [bodyFront - 0.25, (bodyFront + bodyRear) / 2, bodyRear + 0.25]) b.cylinder("chrome", 0.018, 0.2, side * (hw - 0.08), bodyTop + 0.1, z, "y", 8);
  }
  b.box("trim", W - 0.16, bodyTop - bodyBottom - 0.02, bodyFront - bodyRear - 0.1, 0, (bodyTop + bodyBottom) / 2, (bodyFront + bodyRear) / 2 + 0.002);
  b.box("body", W - 0.02, 0.06, bodyFront - bodyRear, 0, bodyTop + 0.03, (bodyFront + bodyRear) / 2);
  // 云梯转台 + 托架
  b.cylinder("chrome", 0.62, 0.18, 0, bodyTop + 0.15, rear - 0.25, "y", 20);
  b.cylinder("trim", 0.42, 0.2, 0, bodyTop + 0.33, rear - 0.25, "y", 16);
  b.pair("chrome", 0.1, 0.5, 0.12, 0.42, bodyTop + 0.3, bodyFront - 0.35);
  b.box("chrome", 0.94, 0.08, 0.14, 0, bodyTop + 0.56, bodyFront - 0.35);
  // —— 车尾：踏板、尾灯框、水带卷盘 ——
  const rz = -hl + 0.04;
  b.box("body", W - 0.02, bodyTop - bodyBottom, 0.08, 0, (bodyTop + bodyBottom) / 2, rz);
  b.box("chrome", W - 0.1, 0.05, 0.4, 0, 0.55, -hl - 0.12);
  b.box("trim", W, 0.16, 0.1, 0, 0.62, -hl + 0.01);
  // 尾部中央卷帘器材舱（水带卷盘下方）+ 两侧竖向尾灯柱
  for (let i = 0; i < 6; i++) b.box("chrome", W - 0.9, 0.09, 0.025, 0, 0.82 + i * 0.105 + 0.0003 * i, rz - 0.045);
  b.box("trim", W - 0.86, 0.04, 0.04, 0, 0.78, rz - 0.05);
  b.cylinder("trim", 0.26, 0.6, 0, 1.78, rz - 0.06, "x", 16);
  b.cylinder("chrome", 0.28, 0.03, 0.31, 1.78, rz - 0.06, "x", 16);
  b.cylinder("chrome", 0.28, 0.03, -0.31, 1.78, rz - 0.06, "x", 16);
  b.pair("chrome", 0.16, 0.4, 0.04, hw - 0.15, 1.14, rz - 0.045);
  b.pair("chrome", 0.04, 1.1, 0.04, hw - 0.04, 1.4, rz - 0.06);
  return b.build();
}
