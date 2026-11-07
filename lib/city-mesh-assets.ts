import * as THREE from "three";
import { cityMeshData } from "./city-mesh-data";
export { vehicleMeshMetadata } from "./city-mesh-data";

/** Return independently owned attributes; disposing a city never invalidates a later mount. */
export function createCityMesh(name: keyof typeof cityMeshData): THREE.BufferGeometry {
  const data = cityMeshData[name];
  const count = data.vertices.length / 11;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const colors = new Float32Array(count * 3);
  for (let vertex = 0; vertex < count; vertex++) {
    const offset = vertex * 11;
    for (let component = 0; component < 3; component++) {
      positions[vertex * 3 + component] = data.vertices[offset + component];
      normals[vertex * 3 + component] = data.vertices[offset + 3 + component];
      colors[vertex * 3 + component] = data.vertices[offset + 8 + component];
    }
    uvs[vertex * 2] = data.vertices[offset + 6];
    uvs[vertex * 2 + 1] = data.vertices[offset + 7];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = `City asset · ${name}`;
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  if (data.indices) geometry.setIndex(new THREE.BufferAttribute(data.indices.slice(), 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
