import * as THREE from "three";
import type { CivicKit } from "../../city-civic";

export type EnvironmentBudget = {
  maxBatches: number;
  maxTriangles: number;
  maxInstances: number;
  maxTexturePixels: number;
  maxBodies: number;
  maxParticles: number;
  maxClothVertices: number;
};
export type EnvironmentUsage = {
  batches: number;
  triangles: number;
  instances: number;
  texturePixels: number;
  bodies: number;
  particles: number;
  clothVertices: number;
};

export class EnvironmentResources {
  readonly group = new THREE.Group();
  readonly usage: EnvironmentUsage = { batches: 0, triangles: 0, instances: 0, texturePixels: 0, bodies: 0, particles: 0, clothVertices: 0 };
  readonly budget: EnvironmentBudget;
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly objects: THREE.Object3D[] = [];

  constructor(readonly kit: CivicKit, budget?: Partial<EnvironmentBudget>) {
    this.budget = {
      maxBatches: 54,
      maxTriangles: 220000,
      maxInstances: 7000,
      maxTexturePixels: 1572864,
      maxBodies: 48,
      maxParticles: 192,
      maxClothVertices: 400,
      ...budget,
    };
    this.group.name = "Detailed earth environment";
    kit.group.add(this.group);
  }

  geometry<T extends THREE.BufferGeometry>(name: string, factory: () => T): T {
    const existing = this.geometries.get(name);
    if (existing) return existing as T;
    const geometry = factory();
    geometry.name = `Environment · ${name}`;
    this.geometries.set(name, geometry);
    this.kit.geometries.add(geometry);
    return geometry;
  }

  material<T extends THREE.Material>(name: string, factory: () => T): T {
    const existing = this.materials.get(name);
    if (existing) return existing as T;
    const material = factory();
    material.name = `Environment · ${name}`;
    this.materials.set(name, material);
    this.kit.materials.add(material);
    return material;
  }

  forEachMaterial(visitor: (name: string, material: THREE.Material) => void): void {
    for (const [name, material] of this.materials) visitor(name, material);
  }

  canvas(name: string, width: number, height: number, paint: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
    const existing = this.textures.get(name);
    if (existing) return existing as THREE.CanvasTexture;
    this.reserve("texturePixels", width * height, this.budget.maxTexturePixels);
    const texture = this.kit.canvasTexture(width, height, paint);
    texture.name = `Environment · ${name}`;
    texture.anisotropy = 4;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.textures.set(name, texture);
    return texture;
  }

  batch(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, count: number, dynamic = false): THREE.InstancedMesh {
    const capacity = Math.max(1, Math.floor(count));
    this.reserveMesh(geometry, capacity);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.name = `Environment · ${name}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    if (dynamic) mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(mesh);
    this.objects.push(mesh);
    return mesh;
  }

  mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
    this.reserveMesh(geometry, 1);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `Environment · ${name}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.objects.push(mesh);
    return mesh;
  }

  reserveBodies(count: number): void {
    this.reserve("bodies", count, this.budget.maxBodies);
  }

  reserveParticles(count: number): void {
    this.reserve("particles", count, this.budget.maxParticles);
  }

  reserveCloth(count: number): void {
    this.reserve("clothVertices", count, this.budget.maxClothVertices);
  }

  finalizeBounds(mesh: THREE.InstancedMesh): void {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
  }

  detach(): void {
    this.group.removeFromParent();
    for (const object of this.objects) if (object instanceof THREE.InstancedMesh) object.dispose();
    this.objects.length = 0;
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
  }

  private reserveMesh(geometry: THREE.BufferGeometry, count: number): void {
    const triangles = (geometry.index?.count ?? geometry.getAttribute("position").count) / 3;
    this.reserve("batches", 1, this.budget.maxBatches);
    this.reserve("instances", count, this.budget.maxInstances);
    this.reserve("triangles", triangles * count, this.budget.maxTriangles);
  }

  private reserve(key: keyof EnvironmentUsage, count: number, maximum: number): void {
    const next = this.usage[key] + count;
    if (next > maximum) throw new Error(`Detailed environment ${key} budget exceeded: ${next} > ${maximum}`);
    this.usage[key] = next;
  }
}
