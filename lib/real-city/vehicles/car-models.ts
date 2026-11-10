import * as THREE from "three";

/**
 * Quaternius「Realistic Car Pack」(CC0) 车型：由 scripts/build-vehicle-assets.mjs 烘焙为 cars.bin + cars.json，
 * 场景就绪后懒加载，替换车流中轿车 / 两厢车 / SUV 的程序化车壳（车漆仍按实例着色，车轮仍为可转动的程序化轮胎）。
 */
export type CarModelKind = "sedan" | "hatchback" | "suv";

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

interface ManifestGroup { position: number; normal: number; index: number; vertices: number; indices: number }
type Manifest = Record<CarModelKind, Omit<CarModel, "body" | "glass" | "trim" | "chrome"> & { groups: Record<"body" | "glass" | "trim" | "chrome", ManifestGroup> }>;

export function canLoadCityAssets(): boolean {
  return typeof window !== "undefined" && typeof fetch === "function" && typeof document !== "undefined" && "WebGL2RenderingContext" in window;
}

export async function loadCarModels(baseUrl = "/models/vehicles/"): Promise<Record<CarModelKind, CarModel>> {
  const [manifest, buffer] = await Promise.all([
    fetch(`${baseUrl}cars.json`).then((r) => { if (!r.ok) throw new Error(`cars.json ${r.status}`); return r.json() as Promise<Manifest>; }),
    fetch(`${baseUrl}cars.bin`).then((r) => { if (!r.ok) throw new Error(`cars.bin ${r.status}`); return r.arrayBuffer(); }),
  ]);
  const build = (group: ManifestGroup) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(buffer, group.position, group.vertices * 3), 3));
    geometry.setAttribute("normal", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int8Array(buffer, group.normal, group.vertices * 4), 4), 3, 0, true));
    geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(buffer, group.index, group.indices), 1));
    geometry.computeBoundingSphere();
    return geometry;
  };
  const out = {} as Record<CarModelKind, CarModel>;
  for (const kind of Object.keys(manifest) as CarModelKind[]) {
    const entry = manifest[kind];
    out[kind] = {
      body: build(entry.groups.body), glass: build(entry.groups.glass), trim: build(entry.groups.trim), chrome: build(entry.groups.chrome),
      length: entry.length, width: entry.width, height: entry.height, wheelR: entry.wheelR, wheels: entry.wheels, lamps: entry.lamps,
    };
  }
  return out;
}
