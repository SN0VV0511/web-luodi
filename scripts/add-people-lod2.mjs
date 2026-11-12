/**
 * 给已烘焙的居民人体容器追加远景 LOD2（约 300 三角形）：
 * 读取 public/models/people/body-*.bin，在 LOD1 基础上用 meshoptimizer 继续简化，
 * 按与 build-people-assets.mjs 相同的 provoking-vertex 规则重排后写回（其他流原样保留）。
 * 用法：node scripts/add-people-lod2.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import { writeContainer } from "./meshopt-container.mjs";

const ZONE = { head: 0, body: 1, arm: 2 };
const TARGET_TRIANGLES = 300;

async function decode(buffer) {
  await MeshoptDecoder.ready;
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (view.getUint32(0, true) !== 0x4f4d444c) throw new Error("not a meshopt container");
  const jsonLength = view.getUint32(4, true);
  const table = JSON.parse(new TextDecoder().decode(buffer.subarray(8, 8 + jsonLength)));
  const base = 8 + jsonLength;
  const streams = {};
  for (const [name, entry] of Object.entries(table.streams)) {
    const source = buffer.subarray(base + entry.offset, base + entry.offset + entry.length);
    const target = new Uint8Array(entry.count * entry.size);
    if (entry.kind === "i") MeshoptDecoder.decodeIndexBuffer(target, entry.count, entry.size, source);
    else MeshoptDecoder.decodeVertexBuffer(target, entry.count, entry.size, source);
    streams[name] = { kind: entry.kind, data: target, count: entry.count, size: entry.size };
  }
  return { meta: table.meta, streams };
}

for (const name of ["body-male", "body-female"]) {
  const file = new URL(`../public/models/people/${name}.bin`, import.meta.url);
  const { meta, streams } = await decode(new Uint8Array(readFileSync(file)));
  const vertexCount = streams.position.count;
  const qPos = new Uint16Array(streams.position.data.buffer);
  const qNor = new Int8Array(streams.normal.data.buffer);
  const qUv = new Uint16Array(streams.uv.data.buffer);
  const cloth = streams.cloth.data;
  const positions = new Float32Array(vertexCount * 3);
  const attrs = new Float32Array(vertexCount * 6);
  for (let v = 0; v < vertexCount; v++) {
    for (let c = 0; c < 3; c++) positions[v * 3 + c] = meta.min[c] + (qPos[v * 4 + c] / 65535) * meta.ext[c];
    attrs.set([qNor[v * 4] / 127, qNor[v * 4 + 1] / 127, qNor[v * 4 + 2] / 127, qUv[v * 2] / 65535, qUv[v * 2 + 1] / 65535, cloth[v * 4]], v * 6);
  }
  await MeshoptSimplifier.ready;
  const lod1 = new Uint16Array(streams.lod1.data.buffer);
  // 服装分区值权重最高：远景仍要分得清上衣/裤子/皮肤三大色块。
  const [raw, error] = MeshoptSimplifier.simplifyWithAttributes(new Uint32Array(lod1), positions, 3, attrs, 6,
    [0.1, 0.1, 0.1, 0.05, 0.05, 0.6], null, TARGET_TRIANGLES * 3, 0.2, ["Permissive"]);
  const rank = (v) => { const z = cloth[v * 4]; return z === ZONE.body ? 3 : z === ZONE.arm ? 2 : z === ZONE.head ? 1 : 4; };
  const lod2 = new Uint16Array(raw.length);
  for (let t = 0; t < raw.length; t += 3) {
    let best = 2;
    for (let k = 0; k < 2; k++) if (rank(raw[t + k]) > rank(raw[t + best])) best = k;
    const shift = best === 2 ? 0 : best + 1;
    for (let k = 0; k < 3; k++) lod2[t + k] = raw[t + (k + shift) % 3];
  }
  delete streams.lod2;
  streams.lod2 = { kind: "i", data: lod2, count: lod2.length, size: 2 };
  for (const stream of Object.values(streams)) {
    if (stream.kind === "i") stream.data = new Uint16Array(stream.data.buffer, stream.data.byteOffset, stream.data.byteLength / 2);
  }
  const blob = await writeContainer(meta, streams);
  writeFileSync(file, blob);
  console.log(`${name}: LOD1 ${lod1.length / 3} -> LOD2 ${lod2.length / 3} tris (error ${error.toFixed(3)}), ${(blob.length / 1024).toFixed(1)} KiB`);
}
