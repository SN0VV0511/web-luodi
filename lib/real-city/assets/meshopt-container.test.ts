import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMeshoptContainer } from "./meshopt-container";

const load = (path: string) => {
  const bytes = readFileSync(join(process.cwd(), path));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};

describe("CC0 model containers", () => {
  it("decodes the resident bodies into 15-segment skinned meshes with two LODs", async () => {
    for (const body of ["body-male", "body-female"]) {
      const { meta, streams } = await decodeMeshoptContainer<{ bones: number; frames: number[][] }>(load(`public/models/people/${body}.bin`));
      expect(meta.bones).toBe(15);
      expect(meta.frames).toHaveLength(15);
      const vertices = streams.get("position")!.byteLength / 8;
      const joints = streams.get("joints")!;
      const weights = streams.get("weights")!;
      for (let v = 0; v < vertices; v++) {
        expect(weights[v * 4] + weights[v * 4 + 1] + weights[v * 4 + 2] + weights[v * 4 + 3]).toBe(255);
        for (let k = 0; k < 4; k++) expect(joints[v * 4 + k]).toBeLessThan(15);
      }
      for (const lod of ["lod0", "lod1"]) {
        const index = new Uint16Array(streams.get(lod)!.buffer);
        expect(index.length % 3).toBe(0);
        expect(Math.max(...index)).toBeLessThan(vertices);
      }
      // 远景 LOD 至少减少一半三角形。
      expect(streams.get("lod1")!.byteLength * 2).toBeLessThan(streams.get("lod0")!.byteLength);
    }
  });

  it("decodes the traffic car models with wheel and lamp anchors", async () => {
    const { meta, streams } = await decodeMeshoptContainer<Record<string, { wheels: unknown[]; lamps: { tail: boolean }[]; length: number }>>(load("public/models/vehicles/cars.bin"));
    for (const kind of ["sedan", "hatchback", "suv"]) {
      expect(meta[kind].wheels).toHaveLength(4);
      expect(meta[kind].lamps.filter((lamp) => lamp.tail)).toHaveLength(2);
      expect(meta[kind].length).toBeGreaterThan(3);
      for (const group of ["body", "glass", "trim", "chrome"]) expect(streams.get(`${kind}.${group}.index`)!.byteLength).toBeGreaterThan(0);
    }
  });
});
