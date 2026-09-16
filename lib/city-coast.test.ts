import * as THREE from "three";
import { expect, it } from "vitest";
import { buildCityCoast } from "./city-coast";
import type { CivicKit } from "./city-civic";

it("海岸货轮可确定性行驶，船体与港区资源可统一释放", () => {
  const group = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const coordinates: number[] = [];
  const kit: CivicKit = {
    group, geometries, materials, nightMaterials: [],
    solid(color, roughness = 0.82, metalness = 0.04) {
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.add(material);
      return material;
    },
    box(_material, x, y, z, width, height, depth) { coordinates.push(x, y, z, width, height, depth); },
    part(_material, shape, x, y, z, sx, sy, sz) {
      expect(geometries.has(shape)).toBe(true);
      coordinates.push(x, y, z, sx, sy, sz);
    },
    beam(from, to, radius) { coordinates.push(...from.toArray(), ...to.toArray(), radius); },
    tree() {},
    canvasTexture() { throw new Error("海岸几何不应依赖外部图像或画布"); },
  };
  const coast = buildCityCoast(kit);
  expect(group.userData.cargoShipCount).toBe(2);
  expect(coordinates.every(Number.isFinite)).toBe(true);
  const ships = group.children.filter((object): object is THREE.Group => object instanceof THREE.Group);
  expect(ships).toHaveLength(2);
  // 码头岸线位于 z=186，泊船船尾必须留在岸线外，不能穿进堆场。
  expect(new THREE.Box3().setFromObject(ships[0]).min.z).toBeGreaterThan(186);
  const snapshot = () => group.children.map((object) => object.position.toArray());
  const initial = snapshot();
  coast.animate(10);
  const moving = snapshot();
  expect(moving).not.toEqual(initial);
  coast.animate(10);
  expect(snapshot()).toEqual(moving);
  coast.animate(0);
  expect(snapshot()).toEqual(initial);
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    expect(geometries.has(object.geometry)).toBe(true);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      expect(materials.has(material)).toBe(true);
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
});
