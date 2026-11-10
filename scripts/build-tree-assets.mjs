#!/usr/bin/env node
/**
 * 用 EZ-Tree（MIT，Daniel Greenheck）的程序化生成器离线烘焙三种行道树，写成 meshopt 压缩容器。
 *
 * 用法：node scripts/build-tree-assets.mjs <已准备好的 ez-tree src/lib 目录>
 * 准备步骤见 THIRD_PARTY_ASSETS.md（npm pack @dgreenheck/ez-tree，复制 src/lib，
 * 把 textures.js 换成空实现并给相对 import 补 .js 后缀，使其能在 Node 中运行）。
 *
 * - spreading → 橡树（Oak Medium），upright → 白蜡树形（Ash Medium）配圆叶（山杨叶图转夏绿），conifer → 云杉（Pine Medium）；
 * - 枝干用 meshoptimizer 简化成 LOD0 / LOD1；叶卡 LOD0 保留全部，LOD1 每 3 张保留 1 张并放大，
 *   远处轮廓与密度保持一致而三角形减少约 2/3；
 * - 叶卡法线改为「树冠球面法线」与原法线混合，顶点色写入树冠内部遮蔽，避免叶卡逐张明暗跳变；
 * - 叶卡 UV 映射到 2×2 叶片图集（scripts/build-tree-textures.py 生成）。
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MeshoptSimplifier } from "meshoptimizer";
import { writeContainer } from "./meshopt-container.mjs";

const lib = process.argv[2];
if (!lib) throw new Error("usage: build-tree-assets.mjs <ez-tree src/lib directory>");
const { Tree } = await import(pathToFileURL(resolve(lib, "tree.js")).href);
await MeshoptSimplifier.ready;

const outDir = join(process.cwd(), "public/models/trees");
mkdirSync(outDir, { recursive: true });

// 图集单元：[u0, v0]（左下角），每格 0.5。
const CELL = { oak: [0, 0.5], ash: [0.5, 0.5], pine: [0, 0], aspen: [0.5, 0] };
const FORMS = [
  { form: "spreading", preset: "Oak Medium", leaf: "oak", height: 7.0, tweak: (o) => { o.leaves.count = 5; o.leaves.size *= 1.9; } },
  { form: "upright", preset: "Ash Medium", leaf: "aspen", height: 7.6, tweak: (o) => { o.leaves.count = 7; o.leaves.size *= 1.7; o.branch.sections = { 0: 9, 1: 6, 2: 4, 3: 3 }; o.branch.segments = { 0: 8, 1: 5, 2: 3, 3: 3 }; } },
  { form: "conifer", preset: "Pine Medium", leaf: "pine", height: 8.6, tweak: (o) => { o.leaves.count = 10; o.leaves.size *= 1.7; o.branch.sections = { 0: 10, 1: 6, 2: 4, 3: 3 }; o.branch.segments = { 0: 8, 1: 4, 2: 3, 3: 3 }; } },
];

const manifest = { forms: {} };
const streams = {};

/** 顶点 16 字节：pos u16×3（按该网格包围盒量化）+ pad | uv u16×2 | normal i8×3 + 遮蔽 i8。 */
function pack(name, positions, normals, uvs, colors, indices) {
  const count = positions.length / 3;
  const stride = 16;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < count; v++) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], positions[v * 3 + c]); max[c] = Math.max(max[c], positions[v * 3 + c]); }
  const ext = max.map((m, c) => Math.max(1e-4, m - min[c]));
  const buffer = new ArrayBuffer(count * stride);
  const view = new DataView(buffer);
  for (let v = 0; v < count; v++) {
    const o = v * stride;
    for (let c = 0; c < 3; c++) view.setUint16(o + c * 2, Math.round(((positions[v * 3 + c] - min[c]) / ext[c]) * 65535), true);
    view.setUint16(o + 8, Math.round(Math.min(1, Math.max(0, uvs[v * 2])) * 65535), true);
    view.setUint16(o + 10, Math.round(Math.min(1, Math.max(0, uvs[v * 2 + 1])) * 65535), true);
    for (let c = 0; c < 3; c++) view.setInt8(o + 12 + c, Math.round(Math.max(-1, Math.min(1, normals[v * 3 + c])) * 127));
    view.setInt8(o + 15, Math.round(Math.min(1, colors[v * 3]) * 127));
  }
  const index = count > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  streams[`${name}.vertex`] = { kind: "v", data: new Uint8Array(buffer), count, size: stride };
  streams[`${name}.index`] = { kind: "i", data: index, count: index.length, size: index.BYTES_PER_ELEMENT };
  return { vertices: count, triangles: indices.length / 3, min, ext };
}

/** 叶卡只存四角坐标（u16×3 + pad）；UV、法线、遮蔽与远景 LOD 在运行时按固定四边形规律重建。 */
function packLeaves(name, positions) {
  const count = positions.length / 3;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let v = 0; v < count; v++) for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], positions[v * 3 + c]); max[c] = Math.max(max[c], positions[v * 3 + c]); }
  const ext = max.map((m, c) => Math.max(1e-4, m - min[c]));
  const data = new Uint16Array(count * 4);
  for (let v = 0; v < count; v++) for (let c = 0; c < 3; c++) data[v * 4 + c] = Math.round(((positions[v * 3 + c] - min[c]) / ext[c]) * 65535);
  streams[`${name}.vertex`] = { kind: "v", data, count, size: 8 };
  return { vertices: count, triangles: count / 2, min, ext };
}

/** 去掉未被索引引用的顶点并重排。 */
function compact(positions, normals, uvs, colors, indices) {
  const remap = new Map();
  const P = [], N = [], U = [], C = [], I = [];
  for (const i of indices) {
    let j = remap.get(i);
    if (j === undefined) {
      j = remap.size; remap.set(i, j);
      P.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
      N.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]);
      U.push(uvs[i * 2], uvs[i * 2 + 1]);
      C.push(colors[i * 3], colors[i * 3 + 1], colors[i * 3 + 2]);
    }
    I.push(j);
  }
  return [P, N, U, C, I];
}

for (const spec of FORMS) {
  const tree = new Tree();
  tree.loadPreset(spec.preset);
  spec.tweak(tree.options);
  tree.generate();
  const b = tree.branches, l = tree.leaves;
  // 统一缩放到米：以叶冠顶为目标树高。
  let top = 0;
  for (let i = 1; i < l.verts.length; i += 3) top = Math.max(top, l.verts[i]);
  for (let i = 1; i < b.verts.length; i += 3) top = Math.max(top, b.verts[i]);
  const s = spec.height / top;

  // ---- 枝干 ----
  const bp = Float32Array.from(b.verts, (v) => v * s);
  const bn = b.normals;
  // 树皮贴图：u 绕一圈 0..1，v 沿树干按米重复（贴图本身 RepeatWrapping，这里只存 0..1 内的值会丢失重复，
  // 因此 v 存「米 / 16」，着色时乘回 16 → 每米约 1 次重复）。
  const bu = new Float32Array(b.uvs.length);
  for (let i = 0; i < b.uvs.length; i += 2) { bu[i] = b.uvs[i] % 1; bu[i + 1] = Math.min(1, bp[(i / 2) * 3 + 1] / 16); }
  const bc = new Float32Array(bp.length).fill(1);
  for (let v = 0; v < bp.length / 3; v++) { const k = 0.72 + 0.28 * Math.min(1, bp[v * 3 + 1] / 2.5); bc[v * 3] = bc[v * 3 + 1] = bc[v * 3 + 2] = k; }
  const bIdx = Uint32Array.from(b.indices);
  const target = (n) => Math.floor(n / 3) * 3;
  const [lod0b] = MeshoptSimplifier.simplify(bIdx, bp, 3, target(Math.min(bIdx.length, 1800 * 3)), 0.01, []);
  const [lod1b] = MeshoptSimplifier.simplify(bIdx, bp, 3, target(320 * 3), 0.05, []);

  // ---- 叶卡 ----
  const lp = Float32Array.from(l.verts, (v) => v * s);
  const quads = lp.length / 12;
  let cx = 0, cy = 0, cz = 0, ymin = Infinity, ymax = -Infinity, rmax = 0;
  for (let v = 0; v < lp.length / 3; v++) { cx += lp[v * 3]; cy += lp[v * 3 + 1]; cz += lp[v * 3 + 2]; ymin = Math.min(ymin, lp[v * 3 + 1]); ymax = Math.max(ymax, lp[v * 3 + 1]); }
  const nv = lp.length / 3; cx /= nv; cy /= nv; cz /= nv;
  for (let v = 0; v < nv; v++) rmax = Math.max(rmax, Math.hypot(lp[v * 3] - cx, (lp[v * 3 + 1] - cy) * 0.8, lp[v * 3 + 2] - cz));
  const [u0, v0] = CELL[spec.leaf];
  const name = spec.form;
  const info = {};
  info.bark0 = pack(`${name}.bark0`, ...compact(bp, bn, bu, bc, lod0b));
  info.bark1 = pack(`${name}.bark1`, ...compact(bp, bn, bu, bc, lod1b));
  info.leaf = packLeaves(`${name}.leaf`, lp);
  manifest.forms[name] = { height: spec.height, crown: [cx, cy, cz, rmax], cell: [u0, v0], perLeaf: tree.options.leaves.billboard === "double" ? 2 : 1, ...info };
  console.log(name, Object.entries(info).map(([k, v]) => `${k} ${v.triangles}`).join(', '));
}

const blob = await writeContainer(manifest, streams);
writeFileSync(join(outDir, "trees.bin"), blob);
console.log(`trees.bin ${(blob.length / 1024).toFixed(1)} KiB`);
