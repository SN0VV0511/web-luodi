import * as THREE from "three";
import { emptyRayBounds, includeRayBounds, rayBoundsDistance, setRayBounds, type RayBounds } from "./ray-bounds";

type PickNode = {
  bounds: RayBounds;
  start: number;
  count: number;
  left: number;
  right: number;
};

export class InstancePickingTree {
  private readonly bounds: RayBounds[] = [];
  private readonly nodes: PickNode[] = [];
  private order = new Uint32Array(0);
  private readonly worldMatrix = new THREE.Matrix4();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly composedMatrix = new THREE.Matrix4();
  private readonly box = new THREE.Box3();
  private readonly localBounds = new THREE.Box3();
  private readonly batchProxyGeometry: THREE.BufferGeometry | null;
  private readonly proxy: THREE.Mesh;
  private readonly intersections: THREE.Intersection[] = [];
  private readonly stack: number[] = [];
  private lastVersion = -1;
  private lastCount = -1;
  private disposed = false;

  constructor(readonly source: THREE.InstancedMesh | THREE.BatchedMesh) {
    this.batchProxyGeometry = source instanceof THREE.BatchedMesh ? new THREE.BufferGeometry() : null;
    if (this.batchProxyGeometry) {
      this.batchProxyGeometry.attributes = source.geometry.attributes;
      this.batchProxyGeometry.index = source.geometry.index;
      this.batchProxyGeometry.boundingBox = new THREE.Box3();
      this.batchProxyGeometry.boundingSphere = new THREE.Sphere();
    }
    this.proxy = new THREE.Mesh(this.batchProxyGeometry ?? source.geometry, source.material);
    this.proxy.matrixAutoUpdate = false;
    this.proxy.matrixWorldAutoUpdate = false;
  }

  first(raycaster: THREE.Raycaster, maximum = raycaster.far): THREE.Intersection | null {
    if (this.disposed || this.count === 0) return null;
    this.synchronize();
    if (this.nodes.length === 0 || rayBoundsDistance(raycaster.ray, this.nodes[0].bounds, maximum) === Infinity) return null;
    let closest: THREE.Intersection | null = null;
    let distance = maximum;
    this.proxy.geometry = this.batchProxyGeometry ?? this.source.geometry;
    this.proxy.material = this.source.material;
    this.stack.length = 0;
    this.stack.push(0);
    while (this.stack.length > 0) {
      const nodeIndex = this.stack.pop()!;
      const node = this.nodes[nodeIndex];
      if (rayBoundsDistance(raycaster.ray, node.bounds, distance) === Infinity) continue;
      if (node.count > 0) {
        for (let offset = 0; offset < node.count; offset++) {
          const instanceId = this.order[node.start + offset];
          if (this.source instanceof THREE.BatchedMesh && !this.source.getVisibleAt(instanceId)) continue;
          if (rayBoundsDistance(raycaster.ray, this.bounds[instanceId], distance) === Infinity) continue;
          this.source.getMatrixAt(instanceId, this.instanceMatrix);
          this.proxy.matrixWorld.multiplyMatrices(this.source.matrixWorld, this.instanceMatrix);
          if (this.source instanceof THREE.BatchedMesh && this.batchProxyGeometry) {
            const geometryId = this.source.getGeometryIdAt(instanceId);
            const range = this.source.getGeometryRangeAt(geometryId);
            if (!range) continue;
            this.batchProxyGeometry.setDrawRange(range.start, range.count);
            this.source.getBoundingBoxAt(geometryId, this.batchProxyGeometry.boundingBox!);
            this.source.getBoundingSphereAt(geometryId, this.batchProxyGeometry.boundingSphere!);
          }
          this.intersections.length = 0;
          this.proxy.raycast(raycaster, this.intersections);
          for (const intersection of this.intersections) {
            if (intersection.distance >= distance) continue;
            intersection.object = this.source;
            if (this.source instanceof THREE.BatchedMesh) intersection.batchId = instanceId;
            else intersection.instanceId = instanceId;
            closest = intersection;
            distance = intersection.distance;
          }
        }
        continue;
      }
      const leftDistance = rayBoundsDistance(raycaster.ray, this.nodes[node.left].bounds, distance);
      const rightDistance = rayBoundsDistance(raycaster.ray, this.nodes[node.right].bounds, distance);
      if (leftDistance < rightDistance) {
        if (rightDistance !== Infinity) this.stack.push(node.right);
        if (leftDistance !== Infinity) this.stack.push(node.left);
      } else {
        if (leftDistance !== Infinity) this.stack.push(node.left);
        if (rightDistance !== Infinity) this.stack.push(node.right);
      }
    }
    this.intersections.length = 0;
    return closest;
  }

  dispose(): void {
    this.disposed = true;
    this.bounds.length = 0;
    this.nodes.length = 0;
    this.order = new Uint32Array(0);
    this.stack.length = 0;
    this.intersections.length = 0;
    if (this.batchProxyGeometry) {
      this.batchProxyGeometry.attributes = {};
      this.batchProxyGeometry.index = null;
      this.batchProxyGeometry.dispose();
    }
  }

  worldBounds(): RayBounds | null {
    this.synchronize();
    return this.nodes[0]?.bounds ?? null;
  }

  private get count(): number {
    return this.source instanceof THREE.BatchedMesh ? this.source.instanceCount : this.source.count;
  }

  private get version(): number {
    return this.source instanceof THREE.BatchedMesh
      ? Number(this.source.userData.cityDetailMatrixVersion ?? 0)
      : this.source.instanceMatrix.version;
  }

  private synchronize(): void {
    const source = this.source;
    const count = this.count;
    if (this.lastVersion === this.version
      && this.lastCount === count
      && this.worldMatrix.equals(source.matrixWorld)) return;
    this.nodes.length = 0;
    if (count === 0) return;
    if (!(source instanceof THREE.BatchedMesh)) {
      if (!source.geometry.boundingBox) source.geometry.computeBoundingBox();
      if (!source.geometry.boundingBox || source.geometry.boundingBox.isEmpty()) return;
      this.localBounds.copy(source.geometry.boundingBox);
    }
    if (this.order.length !== count) this.order = new Uint32Array(count);
    for (let index = 0; index < count; index++) {
      if (source instanceof THREE.BatchedMesh) source.getBoundingBoxAt(source.getGeometryIdAt(index), this.localBounds);
      source.getMatrixAt(index, this.instanceMatrix);
      this.composedMatrix.multiplyMatrices(source.matrixWorld, this.instanceMatrix);
      this.box.copy(this.localBounds).applyMatrix4(this.composedMatrix);
      const bounds = this.bounds[index] ?? emptyRayBounds();
      setRayBounds(bounds, this.box);
      this.bounds[index] = bounds;
      this.order[index] = index;
    }
    this.bounds.length = count;
    this.buildNode(0, count);
    this.lastVersion = this.version;
    this.lastCount = count;
    this.worldMatrix.copy(source.matrixWorld);
  }

  private buildNode(start: number, count: number): number {
    const index = this.nodes.length;
    const bounds = emptyRayBounds();
    for (let offset = 0; offset < count; offset++) includeRayBounds(bounds, this.bounds[this.order[start + offset]]);
    const node: PickNode = { bounds, start, count, left: -1, right: -1 };
    this.nodes.push(node);
    if (count <= 8) return index;
    const extentX = bounds.maxX - bounds.minX;
    const extentY = bounds.maxY - bounds.minY;
    const extentZ = bounds.maxZ - bounds.minZ;
    const axis = extentX >= extentY && extentX >= extentZ ? 0 : extentY >= extentZ ? 1 : 2;
    const middle = start + Math.floor(count / 2);
    this.partition(start, start + count - 1, middle, axis);
    node.count = 0;
    node.left = this.buildNode(start, middle - start);
    node.right = this.buildNode(middle, start + count - middle);
    return index;
  }

  private partition(low: number, high: number, middle: number, axis: number): void {
    while (low < high) {
      const pivot = this.center(this.order[Math.floor((low + high) / 2)], axis);
      let left = low;
      let right = high;
      while (left <= right) {
        while (this.center(this.order[left], axis) < pivot) left++;
        while (this.center(this.order[right], axis) > pivot) right--;
        if (left > right) break;
        const swap = this.order[left];
        this.order[left] = this.order[right];
        this.order[right] = swap;
        left++;
        right--;
      }
      if (middle <= right) high = right;
      else if (middle >= left) low = left;
      else break;
    }
  }

  private center(index: number, axis: number): number {
    const bounds = this.bounds[index];
    if (axis === 0) return (bounds.minX + bounds.maxX) * 0.5;
    if (axis === 1) return (bounds.minY + bounds.maxY) * 0.5;
    return (bounds.minZ + bounds.maxZ) * 0.5;
  }
}
