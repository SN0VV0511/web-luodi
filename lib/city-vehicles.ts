import * as THREE from "three";
import { createCityMesh, vehicleMeshMetadata } from "./city-mesh-assets";

export type VehicleKind = "sedan" | "hatchback" | "van" | "suv" | "bus" | "truck";
export type VehicleShell = {
  body: THREE.BufferGeometry;
  glass: THREE.BufferGeometry;
  trim: THREE.BufferGeometry;
  chrome: THREE.BufferGeometry;
  length: number;
  width: number;
  height: number;
  wheelR: number;
  wheels: { x: number; z: number }[];
  lamps: { x: number; y: number; z: number; tail: boolean }[];
};

/** 四类米制车壳包含连贯轮拱、分格玻璃、后视镜、门缝、格栅与排气。
 * 烘焙源保留材质分组；整座城市的同类车辆通过 InstancedMesh 共享这份网格。 */
export function createVehicleShell(kind: VehicleKind): VehicleShell {
  const metadata = vehicleMeshMetadata[kind];
  return {
    body: createCityMesh(`${kind}body`),
    glass: createCityMesh(`${kind}glass`),
    trim: createCityMesh(`${kind}trim`),
    chrome: createCityMesh(`${kind}chrome`),
    ...metadata,
    wheels: metadata.wheels.map(wheel => ({ ...wheel })),
    lamps: metadata.lamps.map(lamp => ({ ...lamp })),
  };
}

/** 单位半径轮胎，轮轴沿 Y；胎肩、侧壁、五辐轮毂均有实体厚度。 */
export function createVehicleWheel(): { tire: THREE.BufferGeometry; rim: THREE.BufferGeometry } {
  return { tire: createCityMesh("tire"), rim: createCityMesh("rim") };
}
