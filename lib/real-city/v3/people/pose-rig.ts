import * as THREE from "three";
import type { WorldPose } from "../../life/skinned-people";
import type { Appearance } from "../../life/types";

/**
 * 关节角度 → 世界关节坐标的通用人体姿态装配。
 * 约定：局部 +z 为面朝方向；角度 0 = 竖直向下，负值 = 向前摆（-π/2 水平前伸，-π 举过头顶）。
 * armOut / legOut 为侧向外展角；bodyPitch 让整个人绕髋部前后倾倒（+π/2 俯卧，-π/2 仰卧）。
 */
export type LimbSpec = { thigh: number; shin: number; upper: number; lower: number; armOut?: number; legOut?: number; footPitch?: number };
export type PoseSpec = {
  x: number; y: number; z: number; heading: number;
  hipsY: number; lean?: number; bodyPitch?: number; bodyRoll?: number;
  left: LimbSpec; right: LimbSpec;
  headYaw?: number; headPitch?: number; scale?: number;
};

const THIGH = 0.43, SHIN = 0.43, UPPER = 0.29, LOWER = 0.31;

export function writePose(pose: WorldPose, spec: PoseSpec): WorldPose {
  const s = spec.scale ?? 1;
  const sinH = Math.sin(spec.heading), cosH = Math.cos(spec.heading);
  const pitch = spec.bodyPitch ?? 0, roll = spec.bodyRoll ?? 0;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const hy = spec.hipsY;
  /** 身体坐标（以髋为原点）→ 世界 */
  const put = (lx: number, ly: number, lz: number, target: THREE.Vector3) => {
    // 侧滚（绕 z）再前倾（绕 x）
    const rx = lx * cr - ly * sr, ry = lx * sr + ly * cr;
    const py = ry * cp - lz * sp, pz = ry * sp + lz * cp;
    const X = rx * s, Y = py * s + hy * s, Z = pz * s;
    target.set(spec.x + cosH * X + sinH * Z, spec.y + Y, spec.z - sinH * X + cosH * Z);
    return target;
  };
  const tp = spec.lean ?? 0;
  put(0, 0, 0, pose.hips);
  put(0, Math.cos(tp) * 0.36, Math.sin(tp) * 0.36, pose.chest);
  put(0, Math.cos(tp) * 0.71, Math.sin(tp) * 0.71, pose.head);
  const shoulderY = Math.cos(tp) * 0.5, shoulderZ = Math.sin(tp) * 0.5;
  for (const side of [-1, 1] as const) {
    const left = side < 0;
    const limb = left ? spec.left : spec.right;
    const lo = limb.legOut ?? 0;
    const hx = side * 0.1;
    // 大腿方向
    let dy = -Math.cos(limb.thigh); const dz = -Math.sin(limb.thigh);
    const dx = side * -dy * Math.sin(lo); dy *= Math.cos(lo);
    const kx = hx + dx * THIGH, ky = dy * THIGH, kz = dz * THIGH;
    let sy = -Math.cos(limb.shin); const sz = -Math.sin(limb.shin);
    const sx = side * -sy * Math.sin(lo); sy *= Math.cos(lo);
    put(hx, 0, 0, left ? pose.leftHip : pose.rightHip);
    put(kx, ky, kz, left ? pose.leftKnee : pose.rightKnee);
    put(kx + sx * SHIN, ky + sy * SHIN, kz + sz * SHIN, left ? pose.leftAnkle : pose.rightAnkle);
    const ao = limb.armOut ?? 0;
    const shx = side * 0.21;
    let ay = -Math.cos(limb.upper); const az = -Math.sin(limb.upper);
    const ax = side * -ay * Math.sin(ao); ay *= Math.cos(ao);
    const ex = shx + side * 0.03 + ax * UPPER, ey = shoulderY + ay * UPPER, ez = shoulderZ + az * UPPER;
    let fy = -Math.cos(limb.lower); const fz = -Math.sin(limb.lower);
    const fx = side * -fy * Math.sin(ao); fy *= Math.cos(ao);
    put(shx, shoulderY, shoulderZ, left ? pose.leftShoulder : pose.rightShoulder);
    put(ex, ey, ez, left ? pose.leftElbow : pose.rightElbow);
    put(ex + fx * LOWER, ey + fy * LOWER, ez + fz * LOWER, left ? pose.leftHand : pose.rightHand);
  }
  pose.heading = spec.heading;
  pose.headYaw = spec.headYaw ?? 0;
  pose.headPitch = (spec.headPitch ?? 0) + pitch;
  pose.leftFootPitch = (spec.left.footPitch ?? 0) + pitch;
  pose.rightFootPitch = (spec.right.footPitch ?? 0) + pitch;
  pose.scale = s;
  return pose;
}

// ---------- 常用动作 ----------
const L = (thigh: number, shin: number, upper: number, lower: number, extra: Partial<LimbSpec> = {}): LimbSpec => ({ thigh, shin, upper, lower, ...extra });

export function standPose(x: number, y: number, z: number, heading: number, t = 0, arms: { left?: [number, number, number?]; right?: [number, number, number?] } = {}): PoseSpec {
  const sway = Math.sin(t * 1.3) * 0.01;
  const la = arms.left ?? [0.05, -0.08, 0.06], ra = arms.right ?? [0.05, -0.08, 0.06];
  return { x, y, z, heading, hipsY: 0.94 + sway, lean: 0.03, left: L(0.02, 0.02, la[0], la[1], { armOut: la[2] }), right: L(-0.02, -0.02, ra[0], ra[1], { armOut: ra[2] }) };
}

/** 步行 / 跑步：phase 以弧度推进，speed 0..1 由走到跑。 */
export function gaitPose(x: number, y: number, z: number, heading: number, phase: number, run = 0): PoseSpec {
  const amp = 0.42 + run * 0.28;
  const st = Math.sin(phase) * amp;
  const lift = (sgn: number) => Math.max(0, Math.sin(phase) * sgn) * (0.5 + run * 0.7);
  const bob = Math.abs(Math.cos(phase)) * (0.02 + run * 0.04);
  const armAmp = 0.5 + run * 0.4;
  return {
    x, y, z, heading, hipsY: 0.93 - run * 0.04 + bob, lean: 0.05 + run * 0.15,
    left: L(-st, -st + lift(-1), st * armAmp, st * armAmp - 0.25 - run * 1.1),
    right: L(st, st + lift(1), -st * armAmp, -st * armAmp - 0.25 - run * 1.1),
  };
}

export function sitPose(x: number, y: number, z: number, heading: number, seatH = 0.45): PoseSpec {
  return { x, y, z, heading, hipsY: seatH + 0.08, lean: 0.08, left: L(-1.5, -0.1, -0.35, -1.1), right: L(-1.5, -0.1, -0.35, -1.1) };
}

export const isFemale = (a: Appearance) => a.skirt === true || a.hairStyle >= 2;
export const swimAppearance = (base: Appearance, suit: string): Appearance => ({
  ...base, coat: isFemale(base) ? suit : base.skin, shirt: isFemale(base) ? suit : base.skin, skirt: false, trousers: suit, shoes: base.skin,
  sleeveLength: 0, winterCoat: false, coatLength: 0, hat: false, glasses: false, backpack: false, shorts: true,
});

/** 确定性外观生成（眼镜约 8%，配色多样）。 */
const SKINS = ["#f1cfb3", "#e3b896", "#d29e7c", "#b9835f", "#93613f", "#6e452d", "#f5d9c2"];
const HAIRS = ["#16120f", "#2b1f17", "#4a3424", "#6f4b2c", "#a07a4c", "#c9a66d", "#8c8a86", "#3a2a22"];
const COATS = ["#c94f3d", "#2f6fa6", "#e0b23a", "#3f7f5c", "#f2efe7", "#26282c", "#8a5fa8", "#d97a9b", "#5fb0b7", "#9b6b43", "#e37b2f", "#556b8f", "#b3c47a", "#7a2f3a"];
const PANTS = ["#2e3c55", "#24272b", "#5b6470", "#c4b89a", "#3d4a3a", "#7d5f47", "#1d2738", "#a3a9b0"];
export function appearanceFor(seed: number, child = false): Appearance {
  const r = (k: number) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const female = r(1) < 0.5;
  return {
    height: child ? 1.15 + r(2) * 0.25 : (female ? 1.6 : 1.7) + r(2) * 0.14,
    shoulderWidth: female ? 0.39 : 0.43, build: 0.9 + r(3) * 0.2,
    skin: SKINS[Math.floor(r(4) * SKINS.length)], hair: HAIRS[Math.floor(r(5) * HAIRS.length)],
    coat: COATS[Math.floor(r(6) * COATS.length)], trousers: PANTS[Math.floor(r(7) * PANTS.length)],
    shoes: r(8) < 0.4 ? "#efeee9" : "#2a2a2c", hairStyle: female ? 2 + Math.floor(r(9) * 3) : Math.floor(r(9) * 2),
    hat: r(10) < 0.12, glasses: r(11) < 0.08, coatLength: r(12) * 0.3, sleeveLength: r(13) < 0.5 ? 0.3 : 0.95,
    winterCoat: false, skirt: female && r(14) < 0.35, backpack: child && r(15) < 0.5,
  };
}
