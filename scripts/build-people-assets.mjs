#!/usr/bin/env node
/**
 * 把 Quaternius「Universal Base Characters」(CC0) 的 glTF 人体烘焙成落地页使用的紧凑人体资源。
 *
 * 用法：node scripts/build-people-assets.mjs <UBC 的 "Godot - UE" 目录>
 *
 * - 65 根骨骼的权重被重新分配到 15 段「姿态骨段」(骨盆、胸腔、头、上臂/前臂/手、大腿/小腿/脚 ×2)，
 *   运行时直接由 ActorPose 的关节点构造骨段矩阵，坐姿、手势、步态与原有模拟完全一致；
 * - meshoptimizer 带属性简化出 LOD0 / LOD1 两级索引，共享一份顶点；
 * - 每个顶点写入服装分区（头/上身/手臂/手/下身/腿/脚/眉/眼）与沿肢体的参数，
 *   运行时按每个居民的外观在着色器里上色（袖长、裤长、裙、长大衣、领口）。
 * 纹理由 scripts/build-people-textures.py 缩放为 512 px WebP。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MeshoptSimplifier } from "meshoptimizer";
import { writeContainer } from "./meshopt-container.mjs";

const source = process.argv[2];
if (!source) throw new Error("usage: build-people-assets.mjs <UBC Godot - UE directory>");
const outDir = join(process.cwd(), "public/models/people");
mkdirSync(outDir, { recursive: true });

const SEG = { hips: 0, chest: 1, head: 2, upperR: 3, upperL: 4, foreR: 5, foreL: 6, handR: 7, handL: 8, thighR: 9, thighL: 10, calfR: 11, calfL: 12, footR: 13, footL: 14 };
const ZONE = { head: 0, body: 1, arm: 2, brow: 7, eye: 8 };

function quatMatrix(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** 与运行时 lib/real-city/life/skinned-people.ts 的 frame() 保持一致。 */
function limbFrame(origin, tip, forward, up) {
  const axis = sub(tip, origin);
  const length = len(axis);
  const a = scale(axis, 1 / length);
  const k = smooth(0.6, 0.95, Math.abs(dot(a, forward)));
  const ref = norm([forward[0] * (1 - k) + up[0] * k, forward[1] * (1 - k) + up[1] * k, forward[2] * (1 - k) + up[2] * k]);
  const x = norm(sub(ref, scale(a, dot(ref, a))));
  const z = cross(x, a);
  return [...x, 0, ...scale(a, length), 0, ...z, 0, ...origin, 1];
}
function sideFrame(origin, tip, side) {
  const axis = sub(tip, origin);
  const length = len(axis);
  const a = scale(axis, 1 / length);
  const x = norm(sub(side, scale(a, dot(side, a))));
  const z = cross(x, a);
  return [...x, 0, ...scale(a, length), 0, ...z, 0, ...origin, 1];
}
function rigidFrame(origin) {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, ...origin, 1];
}

function readAccessor(gltf, bin, index) {
  const accessor = gltf.accessors[index];
  const view = gltf.bufferViews[accessor.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type];
  const Type = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[accessor.componentType];
  const size = Type.BYTES_PER_ELEMENT;
  const stride = view.byteStride || comps * size;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const out = new Float64Array(accessor.count * comps);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  for (let i = 0; i < accessor.count; i++) {
    for (let c = 0; c < comps; c++) {
      const at = base + i * stride + c * size;
      let v = size === 4 ? (Type === Float32Array ? dv.getFloat32(at, true) : dv.getUint32(at, true)) : size === 2 ? dv.getUint16(at, true) : dv.getUint8(at);
      if (accessor.normalized) v /= Type === Uint8Array ? 255 : 65535;
      out[i * comps + c] = v;
    }
  }
  return out;
}

async function bake(name, file) {
  const gltf = JSON.parse(readFileSync(join(source, file), "utf8"));
  const bin = readFileSync(join(source, gltf.buffers[0].uri));
  const nodes = gltf.nodes;
  const parent = new Map();
  nodes.forEach((n, i) => (n.children || []).forEach((c) => parent.set(c, i)));
  const world = (i) => {
    let m = quatMatrix(nodes[i].translation, nodes[i].rotation, nodes[i].scale);
    while (parent.has(i)) { i = parent.get(i); m = mul(quatMatrix(nodes[i].translation, nodes[i].rotation, nodes[i].scale), m); }
    return m;
  };
  const skin = gltf.skins[0];
  const jointNames = skin.joints.map((j) => nodes[j].name);
  const jp = (n) => { const m = world(nodes.findIndex((x) => x.name === n)); return [m[12], m[13], m[14]]; };
  // 绑定姿态：模型朝 +z、左手在 +x；运行时居民朝 +z、leftShoulder 在 -x，故按 x 符号对应（不做镜像）。
  const segOfJoint = (n) => {
    if (n === "root" || n === "pelvis" || n === "spine_01") return [[SEG.hips, 1]];
    if (n === "spine_02") return [[SEG.hips, 0.45], [SEG.chest, 0.55]];
    if (n === "spine_03" || n === "neck_01" || n.startsWith("clavicle")) return [[SEG.chest, 1]];
    if (n === "Head") return [[SEG.head, 1]];
    const plus = n.endsWith("_l"); // +x 侧 = 运行时 right*
    if (n.startsWith("upperarm")) return [[plus ? SEG.upperR : SEG.upperL, 1]];
    if (n.startsWith("lowerarm")) return [[plus ? SEG.foreR : SEG.foreL, 1]];
    if (/^(hand|index|middle|pinky|ring|thumb)/.test(n)) return [[plus ? SEG.handR : SEG.handL, 1]];
    if (n.startsWith("thigh")) return [[plus ? SEG.thighR : SEG.thighL, 1]];
    if (n.startsWith("calf")) return [[plus ? SEG.calfR : SEG.calfL, 1]];
    if (/^(foot|ball)/.test(n)) return [[plus ? SEG.footR : SEG.footL, 1]];
    throw new Error(`unmapped joint ${n}`);
  };

  // 合并 Body / Eyebrows / Eyes 三个图元。
  const positions = [], normals = [], uvs = [], segW = [], kinds = [], indices = [];
  for (const node of nodes.filter((n) => n.mesh !== undefined)) {
    const kind = /eyebrow/i.test(node.name) ? "brow" : /^eyes$/i.test(node.name) ? "eye" : "body";
    for (const prim of gltf.meshes[node.mesh].primitives) {
      const a = prim.attributes;
      const p = readAccessor(gltf, bin, a.POSITION), nr = readAccessor(gltf, bin, a.NORMAL), uv = readAccessor(gltf, bin, a.TEXCOORD_0);
      const j = readAccessor(gltf, bin, a.JOINTS_0), w = readAccessor(gltf, bin, a.WEIGHTS_0);
      const ix = readAccessor(gltf, bin, prim.indices);
      const base = positions.length / 3;
      const count = p.length / 3;
      for (let v = 0; v < count; v++) {
        positions.push(p[v * 3], p[v * 3 + 1], p[v * 3 + 2]);
        normals.push(nr[v * 3], nr[v * 3 + 1], nr[v * 3 + 2]);
        uvs.push(uv[v * 2], uv[v * 2 + 1]);
        const acc = new Float64Array(15);
        for (let k = 0; k < 4; k++) for (const [s, f] of segOfJoint(jointNames[j[v * 4 + k]])) acc[s] += w[v * 4 + k] * f;
        segW.push(acc);
        kinds.push(kind);
      }
      for (const i of ix) indices.push(base + i);
    }
  }
  const vertexCount = positions.length / 3;

  // 骨段绑定框架。
  const headBox = (() => { let mn = [9, 9, 9], mx = [-9, -9, -9]; for (let v = 0; v < vertexCount; v++) if (kinds[v] === "body" && segW[v][SEG.head] > 0.9) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], positions[v * 3 + c]); mx[c] = Math.max(mx[c], positions[v * 3 + c]); } return { mn, mx }; })();
  const head = (() => { let mn = [9, 9, 9], mx = [-9, -9, -9]; for (let v = 0; v < vertexCount; v++) if (kinds[v] === "body" && segW[v][SEG.head] > 0.9) for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], positions[v * 3 + c]); mx[c] = Math.max(mx[c], positions[v * 3 + c]); } return [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2 + 0.0, (mn[2] + mx[2]) / 2]; })();
  const F = [0, 0, 1], U = [0, 1, 0], S = [1, 0, 0];
  const wrist = (s) => jp(`hand_${s}`);
  const frames = [];
  frames[SEG.hips] = sideFrame(jp("pelvis"), jp("spine_03"), S);
  frames[SEG.chest] = sideFrame(jp("spine_03"), head, S);
  frames[SEG.head] = rigidFrame(head);
  for (const [s, R] of [["l", true], ["r", false]]) {
    frames[R ? SEG.upperR : SEG.upperL] = limbFrame(jp(`upperarm_${s}`), jp(`lowerarm_${s}`), F, U);
    frames[R ? SEG.foreR : SEG.foreL] = limbFrame(jp(`lowerarm_${s}`), wrist(s), F, U);
    frames[R ? SEG.handR : SEG.handL] = limbFrame(wrist(s), jp(`middle_01_${s}`), F, U);
    frames[R ? SEG.thighR : SEG.thighL] = limbFrame(jp(`thigh_${s}`), jp(`calf_${s}`), F, U);
    frames[R ? SEG.calfR : SEG.calfL] = limbFrame(jp(`calf_${s}`), jp(`foot_${s}`), F, U);
    frames[R ? SEG.footR : SEG.footL] = rigidFrame(jp(`foot_${s}`));
  }

  // 服装分区与肢体参数：躯干+腿+脚共用一条「体表地标」参数（0 地面、1 踝、2 膝、3 髋、4 腰带、5 颈），
  // 手臂用沿臂参数（0 肩、1 肘、2 腕、3 指尖）。运行时着色器按地标阈值切换鞋/袜/裤/外套/领口/皮肤，
  // 插值参数在像素级给出平滑的分界线，不受简化后网格的三角形走向影响。
  const landmarks = [0, jp("foot_l")[1], jp("calf_l")[1], jp("thigh_l")[1], jp("pelvis")[1] + 0.035, jp("neck_01")[1] - 0.02, head[1] + 0.2];
  const bodyParam = (y) => {
    for (let i = 0; i < landmarks.length - 1; i++) if (y <= landmarks[i + 1]) return i + Math.max(0, (y - landmarks[i]) / (landmarks[i + 1] - landmarks[i]));
    return landmarks.length - 1;
  };
  const armMarks = [jp("upperarm_l")[0], jp("lowerarm_l")[0], jp("hand_l")[0], jp("middle_01_l")[0] + 0.1];
  const armParam = (x) => {
    for (let i = 0; i < armMarks.length - 1; i++) if (x <= armMarks[i + 1]) return i + Math.max(0, (x - armMarks[i]) / (armMarks[i + 1] - armMarks[i]));
    return 3;
  };
  const eyeCenters = {};
  for (const sign of [-1, 1]) {
    let c = [0, 0, 0], n = 0;
    for (let v = 0; v < vertexCount; v++) if (kinds[v] === "eye" && Math.sign(positions[v * 3]) === sign) { c = [c[0] + positions[v * 3], c[1] + positions[v * 3 + 1], c[2] + positions[v * 3 + 2]]; n++; }
    eyeCenters[sign] = scale(c, 1 / Math.max(1, n));
  }
  let browY = 0, browN = 0;
  for (let v = 0; v < vertexCount; v++) if (kinds[v] === "brow") { browY += positions[v * 3 + 1]; browN++; }
  browY /= Math.max(1, browN);
  if (process.env.PROBE) console.log(name, { headBox, head, eyeCenters, browY, neck: jp("neck_01") });
  // 发际线：前额（眉上 4 cm）→ 鬓角（耳上）→ 后颈。头部顶点写入「高出发际线」的连续参数，
  // 运行时按发型阈值把头皮着色为头发并沿法线鼓出发量，发型与头部网格严丝合缝，不再穿插。
  const eyeY = eyeCenters[1][1];
  const frontH = browY + 0.042, sideH = eyeY + 0.014, backH = head[1] - 0.05;
  const scalp = (p) => {
    const dx = p[0] - head[0], dz = p[2] - head[2];
    const f = dz / Math.max(1e-4, Math.hypot(dx, dz));
    const h = f > 0.3 ? sideH + (frontH - sideH) * smooth(0.3, 0.8, f) : backH + (sideH - backH) * smooth(-0.75, 0.15, f);
    return Math.min(1, Math.max(0, 0.5 + (p[1] - h) / 0.08));
  };
  const ARM = new Set([SEG.upperR, SEG.upperL, SEG.foreR, SEG.foreL, SEG.handR, SEG.handL]);
  const cloth = new Uint8Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v++) {
    const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    const w = segW[v];
    let dominant = 0;
    for (let s = 1; s < 15; s++) if (w[s] > w[dominant]) dominant = s;
    let zone, t0 = 0;
    if (kinds[v] === "brow") zone = ZONE.brow;
    else if (kinds[v] === "eye") {
      zone = ZONE.eye;
      const d = norm(sub(p, eyeCenters[Math.sign(p[0]) || 1]));
      t0 = Math.round(Math.max(0, d[2]) * 255);
    } else if (dominant === SEG.head) {
      zone = ZONE.head;
      t0 = Math.round(scalp(p) * 255);
    }
    else if (ARM.has(dominant)) {
      zone = ZONE.arm;
      t0 = Math.round((armParam(Math.abs(p[0])) / 3) * 255);
    } else zone = ZONE.body;
    cloth[v * 4] = zone;
    cloth[v * 4 + 1] = t0;
    // 颈部皮肤只在中线附近露出；肩顶（锁骨/斜方肌）仍属上衣。
    let L = bodyParam(p[1]);
    if (zone === ZONE.body && L > 4.9) L = Math.min(L, 4.9 + Math.max(0, 0.085 - Math.abs(p[0])) * 4);
    cloth[v * 4 + 2] = Math.round(Math.min(1, L / 6) * 255);
    cloth[v * 4 + 3] = Math.round(Math.min(1, Math.max(0, (p[2] + 0.15) / 0.3)) * 255);
  }

  // 前 4 个骨段权重。
  const joints = new Uint8Array(vertexCount * 4), weights = new Uint8Array(vertexCount * 4);
  for (let v = 0; v < vertexCount; v++) {
    const order = [...segW[v].keys()].sort((a, b) => segW[v][b] - segW[v][a]).slice(0, 4);
    const total = order.reduce((s, i) => s + segW[v][i], 0) || 1;
    let left = 255;
    order.forEach((s, k) => {
      joints[v * 4 + k] = s;
      const q = k === 3 ? left : Math.min(left, Math.round((segW[v][s] / total) * 255));
      weights[v * 4 + k] = q;
      left -= q;
    });
  }

  await MeshoptSimplifier.ready;
  const pos32 = new Float32Array(positions);
  const attrs = new Float32Array(vertexCount * 6);
  for (let v = 0; v < vertexCount; v++) {
    attrs.set([normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2], uvs[v * 2], uvs[v * 2 + 1], cloth[v * 4]], v * 6);
  }
  // 分区边界（袖口、裤腰、鞋口）与眼睛不能被简化抹掉：按分区值加大权重。
  const lock = new Uint8Array(vertexCount);
  for (let v = 0; v < vertexCount; v++) if (kinds[v] !== "body") lock[v] = 1;
  const simplify = (target, error) => {
    const [out, err] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(indices), pos32, 3, attrs, 6, [0.4, 0.4, 0.4, 0.6, 0.6, 2], lock, target, error, ["Permissive"]);
    return { out, err };
  };
  const eyeTris = indices.length; // 上限
  const lod0 = simplify(Math.round(4800 * 3), 0.02);
  // LOD1 去掉眼球与眉毛（远景不可见）。
  const bodyOnly = [];
  for (let i = 0; i < indices.length; i += 3) if (kinds[indices[i]] === "body") bodyOnly.push(indices[i], indices[i + 1], indices[i + 2]);
  const [lod1raw] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(bodyOnly), pos32, 3, attrs, 6, [0.2, 0.2, 0.2, 0.1, 0.1, 1], null, 1100 * 3, 0.05, []);
  void eyeTris;
  // 压缩顶点：只保留被任一 LOD 引用的顶点。
  const remap = new Int32Array(vertexCount).fill(-1);
  let kept = 0;
  for (const i of [...lod0.out, ...lod1raw]) if (remap[i] < 0) remap[i] = kept++;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < vertexCount; v++) if (remap[v] >= 0) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], positions[v * 3 + c]); max[c] = Math.max(max[c], positions[v * 3 + c]); }
  const ext = max.map((m, c) => m - min[c]);
  const qPos = new Uint16Array(kept * 4), qNor = new Int8Array(kept * 4), qUv = new Uint16Array(kept * 2);
  const oJ = new Uint8Array(kept * 4), oW = new Uint8Array(kept * 4), oC = new Uint8Array(kept * 4);
  for (let v = 0; v < vertexCount; v++) {
    const o = remap[v];
    if (o < 0) continue;
    for (let c = 0; c < 3; c++) {
      qPos[o * 4 + c] = Math.round(((positions[v * 3 + c] - min[c]) / ext[c]) * 65535);
      qNor[o * 4 + c] = Math.round(Math.max(-1, Math.min(1, normals[v * 3 + c])) * 127);
    }
    qUv[o * 2] = Math.round(Math.min(1, Math.max(0, uvs[v * 2])) * 65535);
    qUv[o * 2 + 1] = Math.round(Math.min(1, Math.max(0, uvs[v * 2 + 1])) * 65535);
    oJ.set(joints.subarray(v * 4, v * 4 + 4), o * 4);
    oW.set(weights.subarray(v * 4, v * 4 + 4), o * 4);
    oC.set(cloth.subarray(v * 4, v * 4 + 4), o * 4);
  }
  const i0 = Uint16Array.from(lod0.out, (i) => remap[i]);
  const i1 = Uint16Array.from(lod1raw, (i) => remap[i]);
  const blob = await writeContainer(
    { bones: 15, min, ext, frames: frames.map((f) => f.map((x) => Math.round(x * 1e5) / 1e5)) },
    {
      position: { kind: "v", data: qPos, count: kept, size: 8 },
      normal: { kind: "v", data: qNor, count: kept, size: 4 },
      uv: { kind: "v", data: qUv, count: kept, size: 4 },
      joints: { kind: "v", data: oJ, count: kept, size: 4 },
      weights: { kind: "v", data: oW, count: kept, size: 4 },
      cloth: { kind: "v", data: oC, count: kept, size: 4 },
      lod0: { kind: "i", data: i0, count: i0.length, size: 2 },
      lod1: { kind: "i", data: i1, count: i1.length, size: 2 },
    },
  );
  writeFileSync(join(outDir, `${name}.bin`), blob);
  console.log(`${name}: ${vertexCount} -> ${kept} verts, LOD0 ${i0.length / 3} tris (err ${lod0.err.toFixed(4)}), LOD1 ${i1.length / 3} tris, ${(blob.length / 1024).toFixed(1)} KiB`);
}

await bake("body-male", "Superhero_Male_FullBody.gltf");
await bake("body-female", "Superhero_Female_FullBody.gltf");
