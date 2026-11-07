import * as THREE from "three";
import { createCityMesh } from "./city-mesh-assets";

/** 关节部件在单位盒中，Y 为长度、+Y 接近关节、+Z 为前方；由居民批次统一缩放为米。
 * 连续衣料、面部、鞋与帽檐网格在离线构建时生成，调用者拥有并释放返回的几何体。 */
export function createHead(): THREE.BufferGeometry {
  return createCityMesh("head");
}

export function createNeck(): THREE.BufferGeometry {
  return createCityMesh("neck");
}

export function createTorso(): THREE.BufferGeometry {
  return createCityMesh("torso");
}

export function createPelvis(): THREE.BufferGeometry {
  return createCityMesh("pelvis");
}

export function createBackpack(): THREE.BufferGeometry {
  return createCityMesh("backpack");
}

export function createUpperArm(): THREE.BufferGeometry {
  return createCityMesh("upperarm");
}

export function createForearm(): THREE.BufferGeometry {
  return createCityMesh("forearm");
}

export function createThigh(): THREE.BufferGeometry {
  return createCityMesh("thigh");
}

export function createCalf(): THREE.BufferGeometry {
  return createCityMesh("calf");
}

export function createHand(): THREE.BufferGeometry {
  return createCityMesh("hand");
}

export function createShoe(): THREE.BufferGeometry {
  return createCityMesh("shoe");
}

export function createHair(): THREE.BufferGeometry {
  return createCityMesh("hair");
}

export function createCap(): THREE.BufferGeometry {
  return createCityMesh("cap");
}
