import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeMeshoptContainer } from "../assets/meshopt-container";

describe("street tree models", () => {
  it("ships three tree forms with a cheaper far LOD and leaf-card quads", async () => {
    const bytes = readFileSync(join(process.cwd(), "public/models/trees/trees.bin"));
    const { meta, streams } = await decodeMeshoptContainer<{ forms: Record<string, { height: number; perLeaf: number; bark0: { triangles: number }; bark1: { triangles: number }; leaf: { vertices: number } }> }>(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    );
    expect(Object.keys(meta.forms).sort()).toEqual(["conifer", "spreading", "upright"]);
    for (const [form, info] of Object.entries(meta.forms)) {
      expect(info.height).toBeGreaterThan(5);
      expect(info.bark1.triangles * 4).toBeLessThan(info.bark0.triangles);
      expect(info.leaf.vertices % (4 * info.perLeaf)).toBe(0);
      expect(streams.get(`${form}.leaf.vertex`)!.byteLength).toBe(info.leaf.vertices * 8);
      // 中等面数：每棵近景树（枝干 + 叶卡）不超过 8k 三角形。
      expect(info.bark0.triangles + info.leaf.vertices / 2).toBeLessThan(8000);
    }
  });
});
