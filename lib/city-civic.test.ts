import * as THREE from "three";
import { expect, it } from "vitest";
import { buildCivicDistrict, type CivicKit } from "./city-civic";

it("公园草坪覆层离开底板，并在远景保留独立深度偏移", () => {
  const group = new THREE.Group();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures: THREE.Texture[] = [];
  let parkTop = 0;
  const lawns: { height: number; material: THREE.MeshStandardMaterial }[] = [];
  const kit: CivicKit = {
    group, geometries, materials, nightMaterials: [],
    solid(color, roughness = 0.82, metalness = 0.04) {
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.add(material);
      return material;
    },
    box(_material, _x, y, _z, width, height, depth) {
      if (width === 132 && depth === 190) parkTop = y + height / 2;
    },
    part(material, shape, _x, y) {
      if (shape instanceof THREE.ShapeGeometry && material instanceof THREE.MeshStandardMaterial && material.color.getHexString() === "6b815b")
        lawns.push({ height: y, material });
    },
    beam() {},
    tree() {},
    canvasTexture() {
      const texture = new THREE.CanvasTexture(document.createElement("canvas"));
      textures.push(texture);
      return texture;
    },
  };
  try {
    buildCivicDistrict(kit);
    expect(lawns).toHaveLength(1);
    const lawn = lawns[0];
    expect(lawn.height - parkTop).toBeGreaterThanOrEqual(0.03);
    expect(lawn.material.polygonOffset).toBe(true);
    expect(lawn.material.polygonOffsetFactor).toBeLessThan(0);
    expect(lawn.material.polygonOffsetUnits).toBeLessThan(0);
    expect(lawn.material.depthTest && lawn.material.depthWrite).toBe(true);
    expect(materials.has(lawn.material)).toBe(true);
    // 球场也用深绿草材质，公园修复不能改变球场及其他地面的深度规则。
    expect([...materials].some((material) => material instanceof THREE.MeshStandardMaterial && material !== lawn.material && material.color.equals(lawn.material.color) && !material.polygonOffset)).toBe(true);
  } finally {
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    textures.forEach((texture) => texture.dispose());
    group.clear();
  }
});
