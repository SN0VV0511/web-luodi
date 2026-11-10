import type * as THREE from "three";

export type VehicleMeshMetadata = {
  length: number;
  width: number;
  height: number;
  wheelR: number;
  wheels: { x: number; z: number }[];
  lamps: { x: number; y: number; z: number; tail: boolean }[];
};

export function authorCityMeshes(): {
  meshes: Map<string, THREE.BufferGeometry>;
  vehicleMetadata: Record<string, VehicleMeshMetadata>;
};
