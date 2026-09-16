import * as THREE from "three";
import { expect, it } from "vitest";
import { buildCityLife } from "./city-life";

it("行人步态随城市时间变化，暂停可重现同一姿态且所有资源可统一释放", () => {
  const group = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const { animate } = buildCityLife({ group, geometries, materials });
  const meshes = group.children.filter((object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh);
  const snapshot = () => meshes.map((mesh) => Array.from(mesh.instanceMatrix.array));
  expect(group.userData.pedestrianCount).toBeGreaterThan(40);
  expect(meshes.length).toBeGreaterThan(0);
  const initial = snapshot();
  animate(1.25);
  const walking = snapshot();
  expect(walking).not.toEqual(initial);
  animate(1.25);
  expect(snapshot()).toEqual(walking);
  animate(0);
  expect(snapshot()).toEqual(initial);
  animate(10000);
  for (const mesh of meshes) {
    expect(geometries.has(mesh.geometry)).toBe(true);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      expect(materials.has(material)).toBe(true);
    expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite)).toBe(true);
    mesh.dispose();
  }
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
});
