import * as THREE from "three";
import type { CivicKit } from "../../city-civic";

export type CityModelPart = {
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  root?: THREE.Group;
};

export type CityMovingPart = {
  root: THREE.Group;
  mesh: THREE.BatchedMesh;
  id: number;
  previous: THREE.Matrix4;
  visible: boolean;
};

type VisibilityCell = {
  center: THREE.Vector3;
  radius: number;
  maximumFeature: number;
  instances: number[];
  visible: boolean;
};

type DetailVisibility = {
  mesh: THREE.BatchedMesh;
  cells: VisibilityCell[];
  requested: boolean[];
  allowed: boolean[];
  previousPosition: THREE.Vector3;
  previousPixels: number;
};

const visibilityByMesh = new WeakMap<THREE.BatchedMesh, DetailVisibility>();

function usableGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source.clone();
  const position = geometry.getAttribute("position");
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  if (!geometry.getAttribute("uv")) {
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  }
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv") geometry.deleteAttribute(name);
  }
  geometry.clearGroups();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function geometricFeature(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, size: THREE.Vector3): number {
  geometry.boundingBox!.getSize(size);
  const e = matrix.elements;
  size.x *= Math.hypot(e[0], e[1], e[2]);
  size.y *= Math.hypot(e[4], e[5], e[6]);
  size.z *= Math.hypot(e[8], e[9], e[10]);
  const greatest = Math.max(size.x, size.y, size.z);
  const least = Math.min(size.x, size.y, size.z);
  return Math.max(0.002, size.x + size.y + size.z - greatest - least);
}

function registerVisibility(mesh: THREE.BatchedMesh, parts: readonly CityModelPart[], geometries: Map<THREE.BufferGeometry, THREE.BufferGeometry>): void {
  const cells = new Map<string, { bounds: THREE.Box3; maximumFeature: number; instances: number[] }>();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  const worldBounds = new THREE.Box3();
  const requested: boolean[] = [];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const geometry = geometries.get(part.geometry)!;
    const feature = geometricFeature(geometry, part.matrix, size);
    const sizeClass = Math.ceil(Math.log2(feature));
    const maximumFeature = 2 ** sizeClass;
    worldBounds.copy(geometry.boundingBox!).applyMatrix4(part.matrix);
    worldBounds.getCenter(center);
    const key = `${Math.floor(center.x / 32)}:${Math.floor(center.y / 12)}:${Math.floor(center.z / 32)}:${sizeClass}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { bounds: worldBounds.clone(), maximumFeature, instances: [] };
      cells.set(key, cell);
    } else {
      cell.bounds.union(worldBounds);
    }
    cell.instances.push(index);
    requested.push(part.root?.visible ?? true);
  }
  const records: VisibilityCell[] = [];
  for (const cell of cells.values()) {
    const center = cell.bounds.getCenter(new THREE.Vector3());
    const radius = cell.bounds.getSize(new THREE.Vector3()).length() * 0.5 + 1;
    records.push({ center, radius, maximumFeature: cell.maximumFeature, instances: cell.instances, visible: true });
  }
  visibilityByMesh.set(mesh, {
    mesh,
    cells: records,
    requested,
    allowed: parts.map(() => true),
    previousPosition: new THREE.Vector3(Infinity, Infinity, Infinity),
    previousPixels: 0,
  });
}

export function setCityModelPartVisible(mesh: THREE.BatchedMesh, id: number, visible: boolean): void {
  const state = visibilityByMesh.get(mesh);
  if (state) {
    state.requested[id] = visible;
    mesh.setVisibleAt(id, visible && state.allowed[id]);
  } else {
    mesh.setVisibleAt(id, visible);
  }
}

export function buildCityModelBatches(kit: CivicKit, partsByMaterial: Map<THREE.Material, CityModelPart[]>): CityMovingPart[] {
  const normalized = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const moving: CityMovingPart[] = [];
  const normalize = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
    let cached = normalized.get(geometry);
    if (!cached) {
      cached = usableGeometry(geometry);
      normalized.set(geometry, cached);
    }
    return cached;
  };
  try {
    for (const [material, allParts] of partsByMaterial) {
      let cursor = 0;
      while (cursor < allParts.length) {
        const parts: CityModelPart[] = [];
        const unique = new Set<THREE.BufferGeometry>();
        let vertexCount = 0;
        while (cursor < allParts.length && parts.length < 6000) {
          const part = allParts[cursor];
          const geometry = normalize(part.geometry);
          const addedVertices = unique.has(part.geometry) ? 0 : geometry.getAttribute("position").count;
          if (parts.length > 0 && vertexCount + addedVertices > 240000) break;
          parts.push(part);
          unique.add(part.geometry);
          vertexCount += addedVertices;
          cursor++;
        }
        if (!parts.length) continue;
        const mesh = new THREE.BatchedMesh(parts.length, vertexCount, 0, material);
        mesh.name = parts.some((part) => part.root) ? "Architectural moving components batch" : "Architectural spatial detail batch";
        mesh.castShadow = !material.transparent;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.perObjectFrustumCulled = true;
        mesh.sortObjects = material.transparent;
        const geometryIds = new Map<THREE.BufferGeometry, number>();
        for (const part of parts) {
          let geometryId = geometryIds.get(part.geometry);
          if (geometryId === undefined) {
            geometryId = mesh.addGeometry(normalize(part.geometry));
            geometryIds.set(part.geometry, geometryId);
          }
          const id = mesh.addInstance(geometryId);
          mesh.setMatrixAt(id, part.matrix);
          mesh.setVisibleAt(id, part.root?.visible ?? true);
          if (part.root) {
            moving.push({ root: part.root, mesh, id, previous: part.matrix.clone(), visible: part.root.visible });
          }
        }
        registerVisibility(mesh, parts, normalized);
        kit.geometries.add(mesh.geometry);
        kit.group.add(mesh);
      }
    }
  } finally {
    for (const geometry of normalized.values()) geometry.dispose();
  }
  return moving;
}

export class CityModelVisibility {
  private readonly batches: DetailVisibility[] = [];
  private readonly cameraPosition = new THREE.Vector3();
  private lastUpdate = -Infinity;
  private minimumPixels = 0.85;

  constructor(scene: THREE.Object3D) {
    scene.traverse((object) => {
      if (!(object instanceof THREE.BatchedMesh)) return;
      const state = visibilityByMesh.get(object);
      if (state) this.batches.push(state);
    });
  }

  /**
   * minimumPixels：细部的最小屏幕投影尺寸。高档 0.85px 保持原貌；中/低档提高阈值，
   * 远景中只占一两个像素的窗框、栏杆等细部不再提交绘制（阴影通道同样受益）。
   */
  update(camera: THREE.PerspectiveCamera, pixelsHigh: number, now: number, force = false, minimumPixels = 0.85): void {
    if (minimumPixels !== this.minimumPixels) {
      this.minimumPixels = minimumPixels;
      force = true;
    }
    if (!force && now - this.lastUpdate < 120) return;
    this.lastUpdate = now;
    camera.getWorldPosition(this.cameraPosition);
    const projection = pixelsHigh * Math.abs(camera.projectionMatrix.elements[5]) * 0.5;
    for (const state of this.batches) {
      const moved = state.previousPosition.distanceToSquared(this.cameraPosition) > 0.8;
      const resized = Math.abs(state.previousPixels - projection) > 1;
      if (!force && !moved && !resized) continue;
      state.previousPosition.copy(this.cameraPosition);
      state.previousPixels = projection;
      let visibleCount = 0;
      for (const cell of state.cells) {
        const distance = Math.max(0.1, this.cameraPosition.distanceTo(cell.center) - cell.radius);
        const featurePixels = cell.maximumFeature * projection / distance;
        const threshold = cell.visible ? this.minimumPixels : this.minimumPixels * 1.3;
        const visible = featurePixels >= threshold;
        if (visible !== cell.visible) {
          cell.visible = visible;
          for (const id of cell.instances) {
            state.allowed[id] = visible;
            state.mesh.setVisibleAt(id, visible && state.requested[id]);
          }
        }
        if (visible) visibleCount += cell.instances.length;
      }
      state.mesh.visible = visibleCount > 0;
    }
  }
}
