import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/** 解码 scripts/meshopt-container.mjs 写出的 meshopt 压缩容器。 */
export interface DecodedContainer<Meta> {
  meta: Meta;
  streams: Map<string, Uint8Array>;
}

interface StreamEntry { kind: "v" | "i"; count: number; size: number; offset: number; length: number }

export async function fetchMeshoptContainer<Meta>(url: string): Promise<DecodedContainer<Meta>> {
  const buffer = await fetch(url).then((response) => {
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return response.arrayBuffer();
  });
  return decodeMeshoptContainer<Meta>(buffer);
}

export async function decodeMeshoptContainer<Meta>(buffer: ArrayBuffer): Promise<DecodedContainer<Meta>> {
  await MeshoptDecoder.ready;
  const header = new DataView(buffer, 0, 8);
  if (header.getUint32(0, true) !== 0x4f4d444c) throw new Error("not a meshopt container");
  const jsonLength = header.getUint32(4, true);
  const table = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, jsonLength))) as { meta: Meta; streams: Record<string, StreamEntry> };
  const base = 8 + jsonLength;
  const streams = new Map<string, Uint8Array>();
  for (const [name, entry] of Object.entries(table.streams)) {
    const source = new Uint8Array(buffer, base + entry.offset, entry.length);
    const target = new Uint8Array(entry.count * entry.size);
    if (entry.kind === "i") MeshoptDecoder.decodeIndexBuffer(target, entry.count, entry.size, source);
    else MeshoptDecoder.decodeVertexBuffer(target, entry.count, entry.size, source);
    streams.set(name, target);
  }
  return { meta: table.meta, streams };
}
