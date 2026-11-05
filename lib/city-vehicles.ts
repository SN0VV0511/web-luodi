import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type VehicleKind = "sedan" | "suv" | "bus" | "truck";
export type VehicleShell = {
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  chrome: THREE.BufferGeometry;
  length: number;
  width: number;
  height: number;
  wheelR: number;
  wheels: { x: number; z: number }[];
  lamps: { x: number; y: number; z: number; tail: boolean }[];
};

type Section = { t: number; roof: number; belt: number; width: number; roofWidth: number };
type Profile = {
  length: number;
  wheelR: number;
  axles: [number, number];
  cabin: [number, number];
  roof: [number, number];
  pillars: number[];
  sections: Section[];
};

const profiles: Record<VehicleKind, Profile> = {
  sedan: {
    length: 4.65, wheelR: 0.34, axles: [-1.38, 1.42], cabin: [0.21, 0.76], roof: [0.35, 0.59], pillars: [0.48],
    sections: [
      { t: 0, roof: 0.79, belt: 0.64, width: 0.8, roofWidth: 0.72 },
      { t: 0.055, roof: 0.91, belt: 0.83, width: 0.89, roofWidth: 0.82 },
      { t: 0.19, roof: 0.96, belt: 0.91, width: 0.92, roofWidth: 0.81 },
      { t: 0.23, roof: 1.02, belt: 0.94, width: 0.92, roofWidth: 0.79 },
      { t: 0.35, roof: 1.45, belt: 0.96, width: 0.91, roofWidth: 0.67 },
      { t: 0.48, roof: 1.49, belt: 0.96, width: 0.91, roofWidth: 0.68 },
      { t: 0.59, roof: 1.46, belt: 0.96, width: 0.91, roofWidth: 0.67 },
      { t: 0.74, roof: 1.01, belt: 0.93, width: 0.92, roofWidth: 0.81 },
      { t: 0.81, roof: 0.95, belt: 0.87, width: 0.91, roofWidth: 0.83 },
      { t: 0.95, roof: 0.84, belt: 0.74, width: 0.87, roofWidth: 0.78 },
      { t: 1, roof: 0.7, belt: 0.6, width: 0.78, roofWidth: 0.69 },
    ],
  },
  suv: {
    length: 4.8, wheelR: 0.38, axles: [-1.42, 1.47], cabin: [0.12, 0.77], roof: [0.22, 0.62], pillars: [0.34, 0.5],
    sections: [
      { t: 0, roof: 1.02, belt: 0.87, width: 0.89, roofWidth: 0.81 },
      { t: 0.07, roof: 1.24, belt: 1.03, width: 0.97, roofWidth: 0.85 },
      { t: 0.22, roof: 1.72, belt: 1.05, width: 0.97, roofWidth: 0.75 },
      { t: 0.45, roof: 1.76, belt: 1.04, width: 0.98, roofWidth: 0.76 },
      { t: 0.62, roof: 1.73, belt: 1.03, width: 0.97, roofWidth: 0.75 },
      { t: 0.77, roof: 1.11, belt: 1, width: 0.97, roofWidth: 0.88 },
      { t: 0.94, roof: 1.03, belt: 0.89, width: 0.95, roofWidth: 0.86 },
      { t: 1, roof: 0.87, belt: 0.71, width: 0.85, roofWidth: 0.77 },
    ],
  },
  bus: {
    length: 8.8, wheelR: 0.46, axles: [-2.7, 2.55], cabin: [0.04, 0.98], roof: [0.08, 0.94], pillars: [0.19, 0.34, 0.49, 0.64, 0.8],
    sections: [
      { t: 0, roof: 2.55, belt: 1.14, width: 1.03, roofWidth: 0.96 },
      { t: 0.05, roof: 2.86, belt: 1.25, width: 1.19, roofWidth: 1.08 },
      { t: 0.5, roof: 2.91, belt: 1.25, width: 1.19, roofWidth: 1.08 },
      { t: 0.94, roof: 2.85, belt: 1.25, width: 1.19, roofWidth: 1.08 },
      { t: 1, roof: 2.53, belt: 1.07, width: 1.04, roofWidth: 0.97 },
    ],
  },
  truck: {
    length: 6.7, wheelR: 0.43, axles: [-1.85, 2.15], cabin: [0.64, 0.96], roof: [0.68, 0.9], pillars: [],
    sections: [
      { t: 0, roof: 2.44, belt: 1.1, width: 1.08, roofWidth: 1.04 },
      { t: 0.025, roof: 2.5, belt: 1.12, width: 1.1, roofWidth: 1.06 },
      { t: 0.57, roof: 2.5, belt: 1.12, width: 1.1, roofWidth: 1.06 },
      { t: 0.61, roof: 2.43, belt: 1.12, width: 1.04, roofWidth: 1 },
      { t: 0.64, roof: 2.05, belt: 1.02, width: 0.97, roofWidth: 0.87 },
      { t: 0.72, roof: 2.17, belt: 1.02, width: 0.99, roofWidth: 0.87 },
      { t: 0.9, roof: 2.12, belt: 1.02, width: 0.98, roofWidth: 0.86 },
      { t: 0.96, roof: 1.31, belt: 0.98, width: 0.95, roofWidth: 0.88 },
      { t: 1, roof: 1.08, belt: 0.88, width: 0.89, roofWidth: 0.82 },
    ],
  },
};

function sample(profile: Profile, t: number): Section {
  let index = 0;
  while (index < profile.sections.length - 2 && t > profile.sections[index + 1].t) index++;
  const a = profile.sections[index], b = profile.sections[index + 1];
  const f = (t - a.t) / (b.t - a.t);
  const mix = (from: number, to: number): number => THREE.MathUtils.lerp(from, to, f);
  return { t, roof: mix(a.roof, b.roof), belt: mix(a.belt, b.belt), width: mix(a.width, b.width), roofWidth: mix(a.roofWidth, b.roofWidth) };
}

function crossSection(profile: Profile, t: number): THREE.Vector3[] {
  const section = sample(profile, t);
  const z = (t - 0.5) * profile.length;
  let arch = 0.22;
  for (const axle of profile.axles) {
    const distance = Math.abs(z - axle);
    const clearance = profile.wheelR + 0.065;
    if (distance < clearance) arch = Math.max(arch, profile.wheelR + Math.sqrt(clearance ** 2 - distance ** 2));
  }
  const { width: w, roofWidth: rw, roof, belt } = section;
  const right = [
    new THREE.Vector3(0, 0.22, z),
    new THREE.Vector3(w * 0.7, 0.22, z),
    new THREE.Vector3(w * 0.98, arch, z),
    new THREE.Vector3(w, Math.max(arch + 0.03, belt * 0.78), z),
    new THREE.Vector3(w * 0.985, Math.max(arch + 0.06, belt), z),
    new THREE.Vector3(w * 0.94, Math.max(arch + 0.08, belt + 0.025), z),
    new THREE.Vector3(rw, roof - 0.065, z),
    new THREE.Vector3(rw * 0.91, roof - 0.006, z),
    new THREE.Vector3(0, roof + 0.025, z),
  ];
  return [...right, ...right.slice(1, 8).reverse().map((p) => new THREE.Vector3(-p.x, p.y, p.z))];
}

function normalized(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const result = geometry.index ? geometry.toNonIndexed() : geometry;
  if (result !== geometry) geometry.dispose();
  result.deleteAttribute("uv");
  return result;
}

function mergeOwned(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  try {
    const result = mergeGeometries(parts, false);
    if (!result) throw new Error("车辆细节几何合并失败");
    return result;
  } finally {
    parts.forEach((part) => part.dispose());
  }
}

function detailBox(width: number, height: number, depth: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const geometry = normalized(new THREE.BoxGeometry(width, height, depth));
  geometry.translate(x, y, z);
  return geometry;
}

/** 创建四类米制车辆；圆角截面、前后风挡、侧窗和车柱共享接缝，返回资源由调用方释放。 */
export function createVehicleShell(kind: VehicleKind): VehicleShell {
  const profile = profiles[kind];
  const positions: number[] = [];
  const bodyIndices: number[] = [], glassIndices: number[] = [], trimIndices: number[] = [];
  const cuts = new Set(Array.from({ length: 49 }, (_, index) => index / 48));
  profile.sections.forEach((section) => cuts.add(section.t));
  [...profile.cabin, ...profile.roof].forEach((t) => cuts.add(t));
  profile.pillars.forEach((t) => { cuts.add(t - 0.009); cuts.add(t + 0.009); });
  const samples = [...cuts].sort((a, b) => a - b);
  const rings = samples.map((t) => crossSection(profile, t));
  rings.forEach((ring) => ring.forEach((point) => positions.push(point.x, point.y, point.z)));
  const sides = rings[0].length;
  for (let row = 0; row < rings.length - 1; row++) {
    const t = (samples[row] + samples[row + 1]) / 2;
    const section = sample(profile, t);
    const cabin = t > profile.cabin[0] && t < profile.cabin[1] && section.roof - section.belt > 0.15;
    const pillar = profile.pillars.some((center) => Math.abs(t - center) < 0.009);
    const windshield = cabin && (t < profile.roof[0] || t > profile.roof[1]);
    for (let side = 0; side < sides; side++) {
      const sideWindow = [5, 6, 9, 10].includes(side);
      const topWindow = side === 7 || side === 8;
      const target = cabin && sideWindow && pillar ? trimIndices
        : cabin && ((sideWindow && !pillar) || (topWindow && windshield)) ? glassIndices : bodyIndices;
      const a = row * sides + side, b = row * sides + (side + 1) % sides;
      const c = b + sides, d = a + sides;
      target.push(a, b, c, a, c, d);
    }
  }
  const cap = (row: number, polygon: number[], target: number[], front: boolean): void => {
    const center = polygon.reduce((sum, index) => sum.add(rings[row][index]), new THREE.Vector3()).divideScalar(polygon.length);
    const centerIndex = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    for (let i = 0; i < polygon.length; i++) {
      const a = row * sides + polygon[i], b = row * sides + polygon[(i + 1) % polygon.length];
      target.push(centerIndex, front ? a : b, front ? b : a);
    }
  };
  for (const row of [0, rings.length - 1]) {
    if (kind === "bus") {
      cap(row, [0, 1, 2, 3, 4, 5, 11, 12, 13, 14, 15], bodyIndices, row > 0);
      cap(row, [5, 6, 7, 8, 9, 10, 11], glassIndices, row > 0);
    } else cap(row, Array.from({ length: sides }, (_, i) => i), bodyIndices, row > 0);
  }
  const all = new THREE.BufferGeometry();
  all.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  all.setIndex([...bodyIndices, ...glassIndices, ...trimIndices]);
  all.computeVertexNormals();
  const select = (indices: number[]): THREE.BufferGeometry => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", all.getAttribute("position"));
    geometry.setAttribute("normal", all.getAttribute("normal"));
    geometry.setIndex(indices);
    return normalized(geometry);
  };
  const body = select(bodyIndices), glass = select(glassIndices);
  const trimParts = trimIndices.length ? [select(trimIndices)] : [];
  all.dispose();
  const width = Math.max(...profile.sections.map((section) => section.width)) * 2;
  const height = Math.max(...profile.sections.map((section) => section.roof));
  const half = profile.length / 2;
  trimParts.push(
    detailBox(width * 0.63, 0.16, 0.035, 0, 0.45, half + 0.005),
    detailBox(width * 0.72, 0.1, 0.04, 0, 0.31, -half - 0.005),
  );
  const chromeParts = [
    detailBox(0.39, 0.11, 0.045, 0, 0.59, half + 0.01),
    detailBox(0.39, 0.11, 0.045, 0, 0.59, -half - 0.012),
  ];
  for (const side of [-1, 1]) {
    const doorStops = kind === "truck" ? [0.69, 0.91] : kind === "bus" ? [0.17, 0.83] : [0.3, 0.49, 0.7];
    for (const t of doorStops) {
      const section = sample(profile, t);
      trimParts.push(detailBox(0.012, section.belt - 0.26, 0.012, side * section.width * 1.003, (section.belt + 0.26) / 2, (t - 0.5) * profile.length));
      if (t !== doorStops[doorStops.length - 1]) {
        chromeParts.push(detailBox(0.038, 0.035, 0.18, side * section.width * 1.004, section.belt - 0.075, (t - 0.5) * profile.length + 0.22));
      }
    }
    if (kind === "suv") chromeParts.push(detailBox(0.055, 0.06, 1.9, side * 0.6, height + 0.05, -0.18));
  }
  const track = width / 2 - 0.09;
  return {
    body, glass, trim: mergeOwned(trimParts), chrome: mergeOwned(chromeParts),
    length: profile.length, width, height, wheelR: profile.wheelR,
    wheels: profile.axles.flatMap((z) => [-track, track].map((x) => ({ x, z }))),
    lamps: [-1, 1].flatMap((side) => [
      { x: side * width * 0.32, y: sample(profile, 1).belt + 0.02, z: half + 0.025, tail: false },
      { x: side * width * 0.33, y: sample(profile, 0).belt + 0.04, z: -half - 0.025, tail: true },
    ]),
  };
}

/** 创建半径为 1、轮轴沿 Y 的胎肩侧壁与五辐轮毂；统一按实际轮胎半径缩放。 */
export function createVehicleWheel(): { tire: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  const tire = new THREE.LatheGeometry([
    new THREE.Vector2(0.59, -0.34), new THREE.Vector2(0.84, -0.34),
    new THREE.Vector2(0.96, -0.26), new THREE.Vector2(1, -0.14),
    new THREE.Vector2(1, 0.14), new THREE.Vector2(0.96, 0.26),
    new THREE.Vector2(0.84, 0.34), new THREE.Vector2(0.59, 0.34), new THREE.Vector2(0.59, -0.34),
  ], 20);
  const parts = [normalized(new THREE.LatheGeometry([
    new THREE.Vector2(0.55, -0.34), new THREE.Vector2(0.63, -0.34),
    new THREE.Vector2(0.63, 0.34), new THREE.Vector2(0.55, 0.34),
  ], 20)), normalized(new THREE.CylinderGeometry(0.16, 0.16, 0.72, 12))];
  for (const side of [-1, 1]) for (let spoke = 0; spoke < 5; spoke++) {
    const geometry = detailBox(0.105, 0.055, 0.48, 0, side * 0.32, 0.34);
    geometry.rotateY(spoke * Math.PI * 2 / 5 + side * 0.12);
    parts.push(geometry);
  }
  return { tire, rim: mergeOwned(parts) };
}
