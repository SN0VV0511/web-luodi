import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { CivicKit } from "./city-civic";
import { buildCityCruiseHarbor, sampleCruiseVoyage } from "./city-cruise";
import {
  buildCityEvents,
  getActiveCityIncidents,
  getCityChirps,
  getCityTelemetry,
} from "./city-events";
import { buildCityUtilities } from "./city-utilities";

function createTestKit() {
  const group = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const coordinates: number[] = [];
  const kit: CivicKit = {
    group,
    geometries,
    materials,
    nightMaterials: [],
    solid(color, roughness = 0.82, metalness = 0.04) {
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.add(material);
      return material;
    },
    box(_material, x, y, z, width, height, depth) {
      coordinates.push(x, y, z, width, height, depth);
    },
    part(_material, shape, x, y, z, sx, sy, sz) {
      expect(geometries.has(shape)).toBe(true);
      coordinates.push(x, y, z, sx, sy, sz);
    },
    beam(from, to, radius) {
      coordinates.push(...from.toArray(), ...to.toArray(), radius);
    },
    tree(x, z, scale = 1) {
      coordinates.push(x, z, scale);
    },
    vehicle() {
      return { length: 6.7, width: 2.2, height: 2.5 };
    },
    canvasTexture() {
      return new THREE.CanvasTexture(document.createElement("canvas"));
    },
  };
  return { group, geometries, materials, coordinates, kit };
}

describe("城市天际线级基建、游轮与随机事件系统", () => {
  it("污水处理厂与联合循环发电厂构件有限且动画可确定性重放，资源统一纳入释放集合", () => {
    const { group, geometries, materials, coordinates, kit } = createTestKit();
    const utilities = buildCityUtilities(kit);

    expect(utilities.clarifierCount).toBe(4);
    expect(utilities.windTurbineCount).toBe(5);
    expect(utilities.powerPlantCenter).toEqual({ x: 268, z: -62 });
    expect(utilities.wastewaterCenter).toEqual({ x: 264, z: 54 });
    expect(coordinates.every(Number.isFinite)).toBe(true);

    utilities.animate(0);
    utilities.animate(14.5);

    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(geometries.has(object.geometry)).toBe(true);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        expect(materials.has(mat)).toBe(true);
      }
      if (object instanceof THREE.InstancedMesh) {
        const m = new THREE.Matrix4();
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, m);
          expect(m.elements.every(Number.isFinite)).toBe(true);
        }
        object.dispose();
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  });

  it("豪华游轮在邮轮母港靠泊与海湾巡航之间平滑循环，廊桥同步伸缩", () => {
    const { group, geometries, materials, coordinates, kit } = createTestKit();
    const cruise = buildCityCruiseHarbor(kit);
    expect(coordinates.every(Number.isFinite)).toBe(true);
    expect(cruise.terminalCenter).toEqual({ x: 48, z: 152 });

    const ship = group.getObjectByName("LuxuryCruiseLiner_Odyssey");
    expect(ship).toBeInstanceOf(THREE.Group);

    const berthed = sampleCruiseVoyage(44.4);
    expect(berthed.status).toBe("berthed");
    expect(Math.abs(berthed.x - 48)).toBeLessThan(1.5);
    expect(Math.abs(berthed.z - 195)).toBeLessThan(1.5);

    const cruising = sampleCruiseVoyage(88);
    expect(cruising.status).toBe("cruising");
    expect(cruising.z).toBeGreaterThan(220);

    cruise.animate(44);
    const posAt44 = ship!.position.toArray();
    cruise.animate(88);
    const posAt88 = ship!.position.toArray();
    expect(posAt88).not.toEqual(posAt44);
    cruise.animate(44);
    expect(ship!.position.toArray()).toEqual(posAt44);

    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(geometries.has(object.geometry)).toBe(true);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        expect(materials.has(mat)).toBe(true);
      }
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  });

  it("居民随机事件（火灾救火、小偷追捕、急救、爆管抢修）随时间演进且小人与特效矩阵全部有限", () => {
    const { group, geometries, materials, kit } = createTestKit();
    const events = buildCityEvents(kit);

    for (const t of [0, 5, 14, 24, 35, 52]) {
      events.animate(t);
      const incidentsZh = getActiveCityIncidents(t, "zh");
      const incidentsEn = getActiveCityIncidents(t, "en");
      expect(incidentsZh).toHaveLength(6);
      expect(incidentsEn).toHaveLength(6);
      expect(incidentsZh.map((x) => x.kind)).toEqual([
        "fire",
        "burglar",
        "cruise",
        "medical",
        "utility",
        "traffic",
      ]);
      incidentsZh.forEach((inc) => {
        expect(Number.isFinite(inc.x)).toBe(true);
        expect(Number.isFinite(inc.z)).toBe(true);
        expect(inc.progress).toBeGreaterThanOrEqual(0);
        expect(inc.progress).toBeLessThanOrEqual(1);
      });
    }

    // 验证不同周期自动轮换到不同火灾点位与小偷作案街区
    const firstFireLoc = getActiveCityIncidents(4, "zh")[0]?.locationName;
    const nextFireLoc = getActiveCityIncidents(42, "zh")[0]?.locationName;
    expect(firstFireLoc).not.toEqual(nextFireLoc);

    const telemetry = getCityTelemetry(18, false);
    expect(telemetry.powerOutputMw).toBeGreaterThan(telemetry.powerLoadMw);
    expect(telemetry.sewagePurityPct).toBeGreaterThan(99);

    const chirps = getCityChirps(18, "zh");
    expect(chirps.length).toBeGreaterThanOrEqual(4);

    group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      expect(geometries.has(object.geometry)).toBe(true);
      for (const mat of Array.isArray(object.material) ? object.material : [object.material]) {
        expect(materials.has(mat)).toBe(true);
      }
      if (object instanceof THREE.InstancedMesh) {
        const m = new THREE.Matrix4();
        for (let i = 0; i < object.count; i++) {
          object.getMatrixAt(i, m);
          expect(m.elements.every(Number.isFinite)).toBe(true);
        }
        object.dispose();
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  });
});
