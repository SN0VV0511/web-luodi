/**
 * 极简的 meshopt 压缩容器（与 lib/real-city/assets/meshopt-container.ts 对应）：
 * [u32 魔数 "LDMO"][u32 JSON 字节数][JSON][按 4 字节对齐的 meshopt 编码流 …]
 * JSON = { meta, streams: { name: { kind: "v"|"i", count, size, offset, length } } }
 */
import { MeshoptEncoder } from "meshoptimizer";

export async function writeContainer(meta, streams) {
  await MeshoptEncoder.ready;
  const encoded = [];
  const table = {};
  let offset = 0;
  for (const [name, { kind, data, count, size }] of Object.entries(streams)) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const out = kind === "i" ? MeshoptEncoder.encodeIndexBuffer(bytes, count, size) : MeshoptEncoder.encodeVertexBuffer(bytes, count, size);
    const pad = (4 - (out.length % 4)) % 4;
    table[name] = { kind, count, size, offset, length: out.length };
    encoded.push(Buffer.from(out), Buffer.alloc(pad));
    offset += out.length + pad;
  }
  let json = Buffer.from(JSON.stringify({ meta, streams: table }));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(8);
  header.writeUInt32LE(0x4f4d444c, 0);
  header.writeUInt32LE(json.length, 4);
  return Buffer.concat([header, json, ...encoded]);
}
