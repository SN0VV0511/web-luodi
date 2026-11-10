import * as THREE from "three";
import { SkinnedPeople, createWorldPose, type WorldPose } from "../../life/skinned-people";
import type { Appearance } from "../../life/types";
import { writePose, type PoseSpec } from "../people/pose-rig";

/** 每帧重写的实例化道具池：begin → add / segment → end，未使用的实例自动隐藏。 */
export class PropPool {
  readonly mesh: THREE.InstancedMesh;
  private used = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly d = new THREE.Vector3();

  constructor(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, readonly capacity: number, shadow = true) {
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.name = name;
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.c.set("#ffffff"));
  }

  begin(): void { this.used = 0; }

  add(x: number, y: number, z: number, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx, color?: string | THREE.Color): number {
    if (this.used >= this.capacity) return -1;
    this.e.set(pitch, yaw, roll, "YXZ");
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz));
    const i = this.used++;
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.setColorAt(i, color === undefined ? this.c.set("#ffffff") : typeof color === "string" ? this.c.set(color) : color);
    return i;
  }

  /** 单位圆柱（高 1，沿 y）拉伸为 a→b 的杆件。 */
  segment(a: THREE.Vector3, b: THREE.Vector3, radius: number, color?: string): number {
    if (this.used >= this.capacity) return -1;
    this.d.subVectors(b, a);
    const length = this.d.length();
    if (length < 1e-5) return -1;
    this.q.setFromUnitVectors(this.up, this.d.divideScalar(length));
    this.m.compose(this.p.addVectors(a, b).multiplyScalar(0.5), this.q, this.s.set(radius, length, radius));
    const i = this.used++;
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.setColorAt(i, this.c.set(color ?? "#ffffff"));
    return i;
  }

  end(): void {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** v3 场景共享资源：几何 / 材质登记、道具池与一组实例化蒙皮人体。 */
export class SceneStage {
  readonly group = new THREE.Group();
  readonly people: SkinnedPeople;
  private readonly pools: PropPool[] = [];
  private readonly pose: WorldPose = createWorldPose();
  readonly geometries = new Set<THREE.BufferGeometry>();
  readonly materials = new Set<THREE.Material>();
  peopleCount = 0;

  constructor(name: string, capacity: number) {
    this.group.name = name;
    this.people = new SkinnedPeople(this.group, capacity);
  }

  geometry<T extends THREE.BufferGeometry>(g: T): T { this.geometries.add(g); return g; }
  material<T extends THREE.Material>(m: T): T { this.materials.add(m); return m; }

  pool(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number, shadow = true): PropPool {
    const pool = new PropPool(name, this.geometry(geometry), this.material(material), capacity, shadow);
    this.pools.push(pool);
    this.group.add(pool.mesh);
    return pool;
  }

  static(mesh: THREE.Mesh, shadow = true): THREE.Mesh {
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.geometry(mesh.geometry);
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) this.material(m);
    this.group.add(mesh);
    return mesh;
  }

  begin(): void {
    this.people.begin();
    this.peopleCount = 0;
    for (const pool of this.pools) pool.begin();
  }

  /** 写入一个人；返回其世界姿态（供挂接道具），未就绪时返回 null。 */
  person(spec: PoseSpec, appearance: Appearance): WorldPose | null {
    writePose(this.pose, { ...spec, scale: (spec.scale ?? 1) * appearance.height / 1.76 });
    if (!this.people.ready) return this.pose;
    if (this.people.add(this.pose, appearance)) this.peopleCount++;
    return this.pose;
  }

  end(): void {
    this.people.end();
    for (const pool of this.pools) pool.end();
  }

  dispose(): void {
    this.people.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

export const mat = (color: string, roughness = 0.7, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
