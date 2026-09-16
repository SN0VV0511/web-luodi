import { describe, expect, it } from "vitest";
import { cityBuildings } from "@/lib/city-content";
import { CITY_BOUNDS, ROAD_SEGMENTS, PUBLIC_BLOCKS, cityLots, parkLots } from "@/lib/city-map";

describe("城市用地布局", () => {
  it("每个部署入口都有唯一楼宇坐标，12 栋楼位于陆地且避开道路", () => {
    expect(cityLots).toHaveLength(12);
    expect(new Set(cityLots.map((lot) => lot.id)).size).toBe(12);
    expect(cityLots.map((lot) => lot.id).sort()).toEqual(cityBuildings.map((building) => building.id).sort());
    for (const lot of cityLots) {
      expect([lot.x, lot.z, lot.width, lot.depth, lot.height].every(Number.isFinite), lot.id).toBe(true);
      expect(Math.min(lot.width, lot.depth, lot.height), lot.id).toBeGreaterThan(0);
      expect(lot.x - lot.width / 2, lot.id).toBeGreaterThanOrEqual(CITY_BOUNDS.minX);
      expect(lot.x + lot.width / 2, lot.id).toBeLessThanOrEqual(CITY_BOUNDS.maxX);
      expect(lot.z - lot.depth / 2, lot.id).toBeGreaterThanOrEqual(CITY_BOUNDS.minZ);
      // 城市陆地在 z=114 结束，海面并非可以放置办公楼的用地。
      expect(lot.z + lot.depth / 2, lot.id).toBeLessThan(114);
      expect(lot.z + lot.depth / 2, lot.id).toBeLessThanOrEqual(CITY_BOUNDS.maxZ);
      for (const road of ROAD_SEGMENTS) {
        const overlaps = lot.x - lot.width / 2 < Math.max(road.x1, road.x2) + 5.5 && lot.x + lot.width / 2 > Math.min(road.x1, road.x2) - 5.5 && lot.z - lot.depth / 2 < Math.max(road.z1, road.z2) + 5.5 && lot.z + lot.depth / 2 > Math.min(road.z1, road.z2) - 5.5;
        expect(overlaps, `${lot.id} overlaps a road`).toBe(false);
      }
      for (const block of PUBLIC_BLOCKS)
        expect(Math.abs(lot.x - block.x) >= (lot.width + ("width" in block ? block.width : 30)) / 2 || Math.abs(lot.z - block.z) >= (lot.depth + ("depth" in block ? block.depth : 30)) / 2, `${lot.id} occupies public space`).toBe(true);
    }
  });

  it("三个城区都有应用楼，中央公园连片且无机动车道穿过", () => {
    expect(cityLots.filter((lot) => lot.x < -75).length).toBeGreaterThanOrEqual(2);
    expect(cityLots.filter((lot) => lot.x >= -75 && lot.z < -115).length).toBeGreaterThanOrEqual(2);
    expect(cityLots.filter((lot) => lot.x > 75 && lot.z >= -115).length).toBeGreaterThanOrEqual(2);
    expect(parkLots).toHaveLength(1);
    const park = parkLots[0];
    expect(park.width * park.depth).toBeGreaterThan(20000);
    for (const road of ROAD_SEGMENTS) {
      const overlaps = Math.max(road.x1, road.x2) + 5.5 > park.x - park.width / 2 && Math.min(road.x1, road.x2) - 5.5 < park.x + park.width / 2 && Math.max(road.z1, road.z2) + 5.5 > park.z - park.depth / 2 && Math.min(road.z1, road.z2) - 5.5 < park.z + park.depth / 2;
      expect(overlaps, "road crosses central park").toBe(false);
    }
  });

  it("部署楼宇之间没有相交，入口不共享同一建筑空间", () => {
    for (let index = 0; index < cityLots.length; index++) {
      const lot = cityLots[index];
      for (const other of cityLots.slice(index + 1)) {
        const separated = Math.abs(lot.x - other.x) >= (lot.width + other.width) / 2 ||
          Math.abs(lot.z - other.z) >= (lot.depth + other.depth) / 2;
        expect(separated, `${lot.id} overlaps ${other.id}`).toBe(true);
      }
    }
  });
});
