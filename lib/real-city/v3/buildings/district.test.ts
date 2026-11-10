import { describe, expect, it } from "vitest";
import { cityBlocks, cityLots, civicLots } from "../../../city-map";
import { BLOCK_ASSIGNMENT, BLOCK_LAYOUTS, buildV3District } from "./district";

const freeBlocks = cityBlocks.filter((block) => ![...cityLots, ...civicLots].some((r) => r.x === block.x && r.z === block.z));

describe("v3 district generator", () => {
  it("assigns a layout to every free block and uses every archetype", () => {
    for (const block of freeBlocks) expect(BLOCK_ASSIGNMENT[`${block.x},${block.z}`]).toBeDefined();
    const trees: number[] = [];
    const district = buildV3District({ blocks: freeBlocks, tree: (x) => trees.push(x) });
    const types = Object.keys(district.archetypeCounts).sort();
    expect(types).toEqual(["cafe", "church", "detached", "gas", "lowrise", "midrise", "mixed", "office", "tower", "townhouses", "warehouse"]);
    expect(district.sites.length).toBeGreaterThan(90);
    expect(trees.length).toBeGreaterThan(40);
    for (const site of district.sites) {
      expect(site.entrances.length).toBeGreaterThan(0);
      expect(Number.isFinite(site.x) && Number.isFinite(site.z)).toBe(true);
    }
    const geometry = (district.group.children[0] as unknown as { geometry: { attributes: Record<string, { count: number }> } }).geometry;
    // 合并几何保持在浏览器可承受的规模内。
    expect(geometry.attributes.position.count).toBeLessThan(400_000);
    district.dispose();
  });

  it("keeps parcels inside the 29 m buildable block", () => {
    for (const slots of Object.values(BLOCK_LAYOUTS)) {
      for (const slot of slots) {
        const horizontal = slot.face === "E" || slot.face === "W";
        const ex = (horizontal ? slot.d : slot.w) / 2, ez = (horizontal ? slot.w : slot.d) / 2;
        expect(Math.abs(slot.x) + ex).toBeLessThanOrEqual(14.31);
        expect(Math.abs(slot.z) + ez).toBeLessThanOrEqual(14.31);
      }
    }
  });

  it("gives neighbouring houses different looks", () => {
    const district = buildV3District({ blocks: freeBlocks, tree: () => {} });
    const geometry = (district.group.children[0] as unknown as { geometry: { attributes: Record<string, { array: Float32Array; count: number }> } }).geometry;
    const colors = geometry.attributes.color.array;
    const unique = new Set<string>();
    for (let i = 0; i < geometry.attributes.color.count; i += 37) unique.add(`${colors[i * 3].toFixed(2)},${colors[i * 3 + 1].toFixed(2)},${colors[i * 3 + 2].toFixed(2)}`);
    expect(unique.size).toBeGreaterThan(60);
    district.dispose();
  });
});
