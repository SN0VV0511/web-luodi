import * as THREE from "three";
import { InstancePickingTree } from "./instance-picking";
import { emptyRayBounds, rayBoundsDistance, setRayBounds, visibleForPicking } from "./ray-bounds";

export class CityPickingIndex {
  private readonly instanceTrees = new Map<THREE.InstancedMesh | THREE.BatchedMesh, InstancePickingTree>();
  private readonly boundVersions = new Map<THREE.InstancedMesh, number>();
  private readonly candidates: { object: THREE.Object3D; distance: number }[] = [];
  private readonly candidatePool: { object: THREE.Object3D; distance: number }[] = [];
  private readonly intersections: THREE.Intersection[] = [];
  private readonly box = new THREE.Box3();
  private readonly bounds = emptyRayBounds();
  private disposed = false;
  private readonly statistics = { queries: 0, candidates: 0, instanceTrees: 0 };

  constructor(readonly objects: readonly THREE.Object3D[]) {}

  first(raycaster: THREE.Raycaster): THREE.Intersection | null {
    if (this.disposed) return null;
    this.statistics.queries++;
    this.prepareCandidates(raycaster);
    let closest: THREE.Intersection | null = null;
    let maximum = raycaster.far;
    for (const candidate of this.candidates) {
      if (candidate.distance > maximum) break;
      const object = candidate.object;
      this.statistics.candidates++;
      if (object instanceof THREE.BatchedMesh || object instanceof THREE.InstancedMesh && object.count > 24) {
        let tree = this.instanceTrees.get(object);
        if (!tree) {
          tree = new InstancePickingTree(object);
          this.instanceTrees.set(object, tree);
          this.statistics.instanceTrees = this.instanceTrees.size;
        }
        const intersection = tree.first(raycaster, maximum);
        if (intersection && intersection.distance < maximum) {
          closest = intersection;
          maximum = intersection.distance;
        }
        continue;
      }
      this.intersections.length = 0;
      object.raycast(raycaster, this.intersections);
      for (const intersection of this.intersections) {
        if (intersection.distance < maximum) {
          closest = intersection;
          maximum = intersection.distance;
        }
      }
    }
    this.intersections.length = 0;
    return closest;
  }

  occluded(raycaster: THREE.Raycaster): boolean {
    return this.first(raycaster) !== null;
  }

  snapshot(): Readonly<typeof this.statistics> {
    return this.statistics;
  }

  dispose(): void {
    this.disposed = true;
    for (const tree of this.instanceTrees.values()) tree.dispose();
    this.instanceTrees.clear();
    this.boundVersions.clear();
    this.candidates.length = 0;
    this.candidatePool.length = 0;
    this.intersections.length = 0;
  }

  private prepareCandidates(raycaster: THREE.Raycaster): void {
    this.candidates.length = 0;
    let count = 0;
    for (const object of this.objects) {
      if (!object.layers.test(raycaster.layers) || !visibleForPicking(object)) continue;
      let distance = 0;
      if (object instanceof THREE.Mesh) {
        if (object instanceof THREE.BatchedMesh) {
          let tree = this.instanceTrees.get(object);
          if (!tree) {
            tree = new InstancePickingTree(object);
            this.instanceTrees.set(object, tree);
          }
          const bounds = tree.worldBounds();
          if (!bounds) continue;
          this.box.min.set(bounds.minX, bounds.minY, bounds.minZ);
          this.box.max.set(bounds.maxX, bounds.maxY, bounds.maxZ);
        } else if (object instanceof THREE.InstancedMesh) {
          if (!object.boundingBox || this.boundVersions.get(object) !== object.instanceMatrix.version) {
            object.computeBoundingBox();
            this.boundVersions.set(object, object.instanceMatrix.version);
          }
          if (object.boundingBox) this.box.copy(object.boundingBox).applyMatrix4(object.matrixWorld);
          else this.box.makeEmpty();
        } else {
          if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
          if (object.geometry.boundingBox) this.box.copy(object.geometry.boundingBox).applyMatrix4(object.matrixWorld);
          else this.box.makeEmpty();
        }
        if (!this.box.isEmpty()) {
          setRayBounds(this.bounds, this.box);
          distance = rayBoundsDistance(raycaster.ray, this.bounds, raycaster.far);
          if (distance === Infinity) continue;
        }
      }
      let candidate = this.candidatePool[count];
      if (!candidate) {
        candidate = { object, distance };
        this.candidatePool[count] = candidate;
      } else {
        candidate.object = object;
        candidate.distance = distance;
      }
      this.candidates.push(candidate);
      count++;
    }
    this.candidates.sort((a, b) => a.distance - b.distance);
  }
}
