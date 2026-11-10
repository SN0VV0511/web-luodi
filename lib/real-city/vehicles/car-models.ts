import * as THREE from "three";
import { fetchMeshoptContainer } from "../assets/meshopt-container";

/**
 * Quaternius「Realistic Car Pack」(CC0) 车型：由 scripts/build-vehicle-assets.mjs 烘焙为 meshopt 压缩的 cars.bin，
 * 场景就绪后懒加载，替换车流中轿车 / 两厢车 / SUV 的程序化车壳（车漆仍按实例着色，车轮仍为可转动的程序化轮胎）。
 */
export type CarModelKind = "sedan" | "hatchback" | "suv" | "truck";

export interface CarModel {
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
}

type Manifest = Record<CarModelKind, Omit<CarModel, "body" | "glass" | "trim" | "chrome">>;

export function canLoadCityAssets(): boolean {
  return typeof window !== "undefined" && typeof fetch === "function" && typeof document !== "undefined" && "WebGL2RenderingContext" in window;
}

export async function loadCarModels(baseUrl = "/models/vehicles/"): Promise<Record<CarModelKind, CarModel>> {
  const { meta, streams } = await fetchMeshoptContainer<Manifest>(`${baseUrl}cars.bin`);
  const take = (name: string) => {
    const data = streams.get(name);
    if (!data) throw new Error(`car asset missing ${name}`);
    return data;
  };
  const build = (kind: CarModelKind, group: string) => {
    const position = take(`${kind}.${group}.position`);
    const normal = take(`${kind}.${group}.normal`);
    const index = take(`${kind}.${group}.index`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(position.buffer as ArrayBuffer, position.byteOffset, position.byteLength / 4), 3));
    geometry.setAttribute("normal", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(normal.buffer as ArrayBuffer, normal.byteOffset, normal.byteLength), 4), 3, 0, true));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(index.buffer as ArrayBuffer, index.byteOffset, index.byteLength / 2), 1));
    geometry.computeBoundingSphere();
    return geometry;
  };
  const out = {} as Record<CarModelKind, CarModel>;
  for (const kind of Object.keys(meta) as CarModelKind[]) {
    const entry = meta[kind];
    out[kind] = {
      body: build(kind, "body"), glass: build(kind, "glass"), trim: build(kind, "trim"), chrome: build(kind, "chrome"),
      length: entry.length, width: entry.width, height: entry.height, wheelR: entry.wheelR, wheels: entry.wheels, lamps: entry.lamps,
    };
  }
  return out;
}

let shared: Promise<Record<CarModelKind, CarModel>> | null = null;
/** 全城共享的一次性加载：车流、停车场与服务车队共用同一份 CC0 车型几何。 */
export function loadCarModelsOnce(baseUrl = "/models/vehicles/"): Promise<Record<CarModelKind, CarModel>> {
  shared ??= loadCarModels(baseUrl).catch((error) => { shared = null; throw error; });
  return shared;
}
