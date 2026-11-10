import * as THREE from "three";
import { authorCityMeshes, type VehicleMeshMetadata } from "./city-mesh-authoring.mjs";

type VehicleKindName = "sedan" | "hatchback" | "van" | "suv" | "bus" | "truck";
type FigureMesh = "head" | "neck" | "torso" | "pelvis" | "backpack" | "upperarm" | "forearm" | "thigh" | "calf"
  | "hand" | "shoe" | "hair" | "cap" | "hairlong" | "hairbun" | "hairponytail" | "skirt";
type TreeMesh = `${"spreading" | "upright" | "conifer"}${"Trunk" | "Canopy"}`;
type VehicleMesh = `${VehicleKindName}${"body" | "glass" | "trim" | "chrome"}` | "tire" | "rim";
export type CityMeshName = FigureMesh | TreeMesh | VehicleMesh;

type AuthoredLibrary = {
  meshes: Map<string, THREE.BufferGeometry>;
  vehicles: Record<VehicleKindName, VehicleMeshMetadata>;
};

let library: AuthoredLibrary | null = null;

/** Author every shared model once per page, on first use, instead of shipping megabytes of baked vertices.
 * Shapes are deterministic, so every visit (and every test) sees identical meshes. */
function authored(): AuthoredLibrary {
  if (library) return library;
  const { meshes, vehicleMetadata } = authorCityMeshes();
  const prepared = new Map<string, THREE.BufferGeometry>();
  for (const [name, original] of meshes) {
    // The face and tyre keep their shared indexed vertices; everything else is a flat stream for material batching.
    const geometry = original.index && name !== "head" && name !== "tire" ? original.toNonIndexed() : original;
    if (geometry !== original) original.dispose();
    const count = geometry.getAttribute("position").count;
    if (!geometry.getAttribute("uv")) geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
    if (!geometry.getAttribute("color")) geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    for (const attribute of Object.keys(geometry.attributes)) {
      if (!["position", "normal", "uv", "color"].includes(attribute)) geometry.deleteAttribute(attribute);
    }
    geometry.groups.length = 0;
    prepared.set(name, geometry);
  }
  library = { meshes: prepared, vehicles: vehicleMetadata as Record<VehicleKindName, VehicleMeshMetadata> };
  return library;
}

/** Return independently owned attributes; disposing a city never invalidates a later mount. */
export function createCityMesh(name: CityMeshName): THREE.BufferGeometry {
  const source = authored().meshes.get(name);
  if (!source) throw new Error(`Unknown city mesh: ${name}`);
  const geometry = new THREE.BufferGeometry();
  geometry.name = `City asset · ${name}`;
  for (const attribute of ["position", "normal", "uv", "color"]) {
    const original = source.getAttribute(attribute) as THREE.BufferAttribute;
    const array = new Float32Array(original.count * original.itemSize);
    for (let i = 0; i < original.count; i++) {
      for (let c = 0; c < original.itemSize; c++) array[i * original.itemSize + c] = original.getComponent(i, c);
    }
    geometry.setAttribute(attribute, new THREE.BufferAttribute(array, original.itemSize));
  }
  if (source.index) geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(source.index.array), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function vehicleMeshMetadata(kind: VehicleKindName): VehicleMeshMetadata {
  return authored().vehicles[kind];
}
