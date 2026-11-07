import * as THREE from "three";
import type { PlaceId } from "./city-content";
import type { CityLot } from "./city-map";
import {
  bindWorldScalePbr,
  createAshlarStonePbr,
  createBrushedMetalPbr,
  createGlassCurtainWallPbr,
  createOrganicShrubGeometry,
} from "./city-pbr";

export type Surface = "stone" | "metal" | "glass" | "light";
export type Point3 = readonly [number, number, number];
type Part = { matrix: THREE.Matrix4; color: THREE.Color; place: PlaceId };
type Batch = { parent: THREE.Group; geometry: THREE.BufferGeometry; surface: Surface; parts: Part[] };

export const finish = {
  stone: "#d8d3c3", ivory: "#eee7d5", steel: "#233843", silver: "#93aab4",
  copper: "#ba7648", oak: "#93704d", dark: "#152a33", glass: "#a3cbd2",
  cyan: "#83e3ef", warm: "#ffe0a2", green: "#668b6b", leaf: "#416b50",
  brick: "#a96450", red: "#7e354b", blue: "#688eae", white: "#e8f0ec",
} as const;

/**
 * 共用几何、材质和静态实例批次；活动机构按父节点分批，避免每颗铆钉一次 draw call。
 * 构造期间只保存实例矩阵，finish() 后才创建 GPU 对象；dispose() 统一释放资源。
 */
export class LandmarkKit {
  readonly group = new THREE.Group();
  readonly pickables: THREE.Object3D[] = [];
  readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  readonly cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 20);
  readonly sphereGeometry = new THREE.SphereGeometry(1, 16, 10);
  readonly ringGeometry = new THREE.TorusGeometry(1, .035, 6, 48);
  readonly crystalGeometry = new THREE.OctahedronGeometry(1);
  readonly dishGeometry = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * .36);
  readonly shrubGeometry = createOrganicShrubGeometry();
  private readonly roots = new Map<THREE.Group, CityLot>();
  private readonly batches = new Map<string, Batch>();
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly textures = new Set<THREE.Texture>();
  private readonly extraMaterials = new Set<THREE.Material>();
  private readonly transform = new THREE.Object3D();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly restingParts = new Map<PlaceId, { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4; hidden: THREE.Matrix4 }[]>();
  private readonly live = new Set<PlaceId>();
  private finished = false;
  private disposed = false;
  private readonly materials: Record<Surface, THREE.Material>;

  constructor() {
    this.group.name = "InteractiveCityLandmarks";
    [this.boxGeometry, this.cylinderGeometry, this.sphereGeometry, this.ringGeometry, this.crystalGeometry, this.dishGeometry, this.shrubGeometry].forEach((geometry) => this.geometries.add(geometry));

    const stonePbr = createAshlarStonePbr();
    const metalPbr = createBrushedMetalPbr();
    const glassPbr = createGlassCurtainWallPbr(4, 8);
    [stonePbr.normalMap, stonePbr.roughnessMap, metalPbr.normalMap, metalPbr.roughnessMap, glassPbr.normalMap, glassPbr.roughnessMap].forEach((tex) => this.textures.add(tex));

    const stoneMat = new THREE.MeshStandardMaterial({ roughness: .76, metalness: .05 });
    bindWorldScalePbr(stoneMat, stonePbr, 4.8, 3.2, 0.72);

    const metalMat = new THREE.MeshStandardMaterial({ roughness: .34, metalness: .78, envMapIntensity: 1.18 });
    bindWorldScalePbr(metalMat, metalPbr, 3.6, 3.6, 0.55);

    const glassMat = new THREE.MeshPhysicalMaterial({
      roughness: .08,
      metalness: .08,
      clearcoat: 1.0,
      clearcoatRoughness: .05,
      reflectivity: .96,
      ior: 1.52,
      envMapIntensity: 1.45,
      transparent: true,
      opacity: .6,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    bindWorldScalePbr(glassMat, glassPbr, 6.4, 25.6, 0.14);

    this.materials = {
      stone: stoneMat,
      metal: metalMat,
      glass: glassMat,
      light: new THREE.MeshBasicMaterial({ toneMapped: false }),
    };
  }

  /** 注册少量独有轮廓的几何，使定制月牙、穹顶等也遵循统一释放规则。 */
  geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  /** 为单栋楼创建地块坐标系，静态构件会在完成时归并到城市坐标批次。 */
  root(lot: CityLot): THREE.Group {
    const root = new THREE.Group();
    root.name = `Landmark_${lot.id}`;
    root.position.set(lot.x, 0, lot.z);
    root.userData.place = lot.id;
    this.roots.set(root, lot);
    this.group.add(root);
    return root;
  }

  /** 创建独立可动的坐标系；所有后代自动继承拾取楼位。 */
  node(parent: THREE.Group, name: string, position: Point3 = [0, 0, 0]): THREE.Group {
    const node = new THREE.Group();
    node.name = name;
    node.userData.place = parent.userData.place;
    node.position.set(...position);
    parent.add(node);
    return node;
  }

  /** 按局部坐标登记构件；复用几何不会产生逐个 Mesh 的开销。 */
  part(parent: THREE.Group, geometry: THREE.BufferGeometry, color: string, position: Point3, scale: Point3, surface: Surface = "stone", rotation: Point3 = [0, 0, 0]): void {
    this.transform.position.set(...position);
    this.transform.rotation.set(...rotation);
    this.transform.scale.set(...scale);
    this.transform.updateMatrix();
    this.record(parent, geometry, color, surface, this.transform.matrix.clone());
  }

  /** 添加长方体构件，尺寸以米计。 */
  box(parent: THREE.Group, color: string, x: number, y: number, z: number, width: number, height: number, depth: number, surface: Surface = "stone", rotation: Point3 = [0, 0, 0]): void {
    this.part(parent, this.boxGeometry, color, [x, y, z], [width, height, depth], surface, rotation);
  }

  /** 添加圆柱、圆盘或圆形基座。 */
  cylinder(parent: THREE.Group, color: string, x: number, y: number, z: number, radius: number, height: number, surface: Surface = "metal"): void {
    this.part(parent, this.cylinderGeometry, color, [x, y, z], [radius, height, radius], surface);
  }

  /** 添加低面数圆环；默认位于水平面，立面环可传入旋转角。 */
  ring(parent: THREE.Group, color: string, position: Point3, radius: number, rotation: Point3 = [Math.PI / 2, 0, 0], surface: Surface = "metal"): void {
    this.part(parent, this.ringGeometry, color, position, [radius, radius, radius], surface, rotation);
  }

  /** 两端点定义钢梁；圆柱对齐使用四元数，不创建逐帧临时几何。 */
  beam(parent: THREE.Group, color: string, from: Point3, to: Point3, radius = .1): void {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const vector = end.clone().sub(start);
    this.transform.position.copy(start).add(end).multiplyScalar(.5);
    this.transform.scale.set(radius, vector.length(), radius);
    this.transform.quaternion.setFromUnitVectors(this.up, vector.normalize());
    this.transform.updateMatrix();
    this.record(parent, this.cylinderGeometry, color, "metal", this.transform.matrix.clone());
  }

  /** Each insulated glass unit has its own reveal, mullion, sill, and spandrel. */
  glazing(parent: THREE.Group, x: number, y: number, z: number, width: number, height: number, tint: string = finish.glass): void {
    const columns = Math.max(1, Math.ceil(width / 1.5));
    const rows = Math.max(1, Math.ceil(height / 3.2));
    const bayWidth = width / columns;
    const bayHeight = height / rows;
    for (let column = 0; column < columns; column++) {
      for (let row = 0; row < rows; row++) {
        const px = x - width / 2 + (column + 0.5) * bayWidth;
        const py = y - height / 2 + (row + 0.5) * bayHeight;
        this.box(parent, tint, px, py + 0.07, z, bayWidth - 0.055, bayHeight - 0.2, .035, "glass");
        this.box(parent, finish.dark, px, py - bayHeight / 2 + 0.06, z - .025, bayWidth, .14, .08, "metal");
        this.box(parent, finish.silver, px, py - bayHeight / 2, z + .045, bayWidth, .045, .12, "metal");
      }
    }
    for (let column = 0; column <= columns; column++) {
      this.box(parent, finish.silver, x - width / 2 + column * bayWidth, y, z + .045, .055, height + .05, .12, "metal");
    }
    this.box(parent, finish.silver, x, y + height / 2, z + .045, width + .055, .055, .12, "metal");
  }

  /** 具有金属支腿、键盘与屏幕的工作站；屏幕仅使用装饰线条，不伪造数据。 */
  desk(parent: THREE.Group, x: number, y: number, z: number, color: string = finish.cyan, width = 2): void {
    this.box(parent, finish.oak, x, y + 1.3, z, width, .14, 1.15);
    for (const side of [-1, 1]) this.box(parent, finish.steel, x + side * width * .4, y + .63, z, .12, 1.25, .7, "metal");
    this.box(parent, finish.steel, x, y + 1.72, z - .22, .14, .65, .14, "metal");
    this.box(parent, finish.dark, x, y + 2.05, z - .25, width * .72, .88, .13);
    this.box(parent, color, x, y + 2.05, z - .17, width * .62, .7, .02, "light");
    this.box(parent, finish.steel, x, y + 1.4, z + .28, width * .5, .06, .3);
    this.box(parent, finish.dark, x, y + .82, z + 1.15, .75, .16, .75);
    this.box(parent, finish.steel, x, y + .4, z + 1.15, .14, .8, .14, "metal");
    this.box(parent, finish.dark, x, y + 1.2, z + 1.5, .75, .8, .12);
  }

  /** 带石材种植钵与自然簇生枝叶的景观植物，替代卡通球体树冠。 */
  plant(parent: THREE.Group, x: number, y: number, z: number, size = 1): void {
    this.box(parent, finish.ivory, x, y + size * .26, z, size * 1.04, size * .52, size * 1.04);
    this.box(parent, finish.oak, x, y + size * .52, z, size * .88, size * .06, size * .88);
    this.cylinder(parent, finish.oak, x, y + size * .96, z, size * .055, size * .95, "stone");
    this.part(parent, this.shrubGeometry, finish.leaf, [x, y + size * 1.15, z], [size * 1.15, size * 1.25, size * 1.15]);
    this.part(parent, this.shrubGeometry, finish.green, [x, y + size * 1.52, z], [size * .86, size * .92, size * .86], "stone", [0, 1.1, 0]);
  }

  /** 楼前台阶、平台、导向灯与铆接基础，与所有建筑共用同一细节尺度。 */
  foundation(parent: THREE.Group, lot: CityLot): void {
    const { width: w, depth: d } = lot;
    this.box(parent, finish.stone, 0, .55, 0, w + 1.4, .6, d + 1.4);
    this.box(parent, finish.steel, 0, .94, 0, w + .6, .18, d + .6, "metal");
    for (let step = 0; step < 3; step++) this.box(parent, finish.ivory, 0, .22 + step * .2, d / 2 + 1 - step * .36, w * .5, .25, 1.3 - step * .25);
    for (const side of [-1, 1]) {
      this.box(parent, finish.warm, side * w * .45, 1.06, 0, .1, .04, d * .9, "light");
      this.plant(parent, side * w * .4, 1, d * .39, .8);
    }
  }

  /** 本地绘制永久楼牌；使用现有系统字体，不请求外部资源。 */
  sign(parent: THREE.Group, lot: CityLot, subtitle: string, position: Point3, width: number): void {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(`无法创建 ${lot.id} 建筑标牌纹理`);
    ctx.fillStyle = "#182b33";
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = lot.color;
    ctx.fillRect(0, 0, 12, 256);
    ctx.fillStyle = "#f4e7cb";
    ctx.font = '600 58px "Avenir Next", "PingFang SC", sans-serif';
    ctx.fillText(`${lot.name}`, 42, 105, 930);
    ctx.font = '400 28px "Avenir Next", sans-serif';
    ctx.fillStyle = "#b4c9ce";
    ctx.fillText(subtitle, 44, 185, 930);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    this.textures.add(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
    this.extraMaterials.add(material);
    const geometry = new THREE.PlaneGeometry(width, width / 4);
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.userData.place = lot.id;
    parent.add(mesh);
    this.pickables.push(mesh);
  }

  private record(parent: THREE.Group, geometry: THREE.BufferGeometry, color: string, surface: Surface, matrix: THREE.Matrix4): void {
    const lot = this.roots.get(parent);
    // 根节点的静态结构跨楼合批；可动机构保留局部坐标，不重复上传实例矩阵。
    if (lot) matrix.premultiply(new THREE.Matrix4().makeTranslation(lot.x, 0, lot.z));
    const batchParent = lot ? this.group : parent;
    const key = `${batchParent.uuid}:${geometry.uuid}:${surface}`;
    let batch = this.batches.get(key);
    if (!batch) {
      batch = { parent: batchParent, geometry, surface, parts: [] };
      this.batches.set(key, batch);
    }
    batch.parts.push({ matrix, color: new THREE.Color(color), place: parent.userData.place as PlaceId });
  }

  /** 一次性生成实例批次及拾取元数据；重复调用不会重复生成。 */
  finish(): void {
    if (this.finished || this.disposed) return;
    this.finished = true;
    let instances = 0;
    for (const { parent, geometry, surface, parts } of this.batches.values()) {
      const mesh = new THREE.InstancedMesh(geometry, this.materials[surface], parts.length);
      mesh.name = `LandmarkBatch_${surface}`;
      mesh.userData.places = parts.map((part) => part.place);
      mesh.castShadow = surface !== "light" && surface !== "glass";
      mesh.receiveShadow = surface !== "light" && surface !== "glass";
      parts.forEach((part, index) => {
        mesh.setMatrixAt(index, part.matrix);
        mesh.setColorAt(index, part.color);
      });
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      parent.add(mesh);
      if (surface !== "glass" && surface !== "light") this.pickables.push(mesh);
      instances += parts.length;
    }
    this.group.userData.instances = instances;
    this.group.userData.batches = this.batches.size;
    this.batches.clear();
    this.freezeClosedMechanisms();
  }

  private freezeClosedMechanisms(): void {
    const snapshots = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; parts: Part[] }>();
    this.group.updateMatrixWorld(true);
    for (const [root, lot] of this.roots) {
      // 标牌始终可见；活动层只包含机构，不承担永久建筑标识。
      for (const child of [...root.children]) {
        if (child instanceof THREE.Mesh && !(child instanceof THREE.InstancedMesh)) this.group.attach(child);
      }
      root.traverseVisible((object) => {
        if (!(object instanceof THREE.InstancedMesh) || Array.isArray(object.material)) return;
        const key = `${object.geometry.uuid}:${object.material.uuid}`;
        let batch = snapshots.get(key);
        if (!batch) {
          batch = { geometry: object.geometry, material: object.material, parts: [] };
          snapshots.set(key, batch);
        }
        for (let index = 0; index < object.count; index++) {
          const matrix = new THREE.Matrix4();
          const color = new THREE.Color();
          object.getMatrixAt(index, matrix);
          object.getColorAt(index, color);
          matrix.premultiply(object.matrixWorld);
          batch.parts.push({ matrix, color, place: lot.id });
        }
      });
      root.visible = false;
    }
    for (const { geometry, material, parts } of snapshots.values()) {
      const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
      mesh.name = "RestingLandmarkMechanisms";
      mesh.userData.places = parts.map((part) => part.place);
      const opaque = material !== this.materials.glass && material !== this.materials.light;
      mesh.castShadow = mesh.receiveShadow = opaque;
      parts.forEach((part, index) => {
        mesh.setMatrixAt(index, part.matrix);
        mesh.setColorAt(index, part.color);
        const entries = this.restingParts.get(part.place) ?? [];
        entries.push({ mesh, index, matrix: part.matrix, hidden: part.matrix.clone().scale(new THREE.Vector3(0, 0, 0)) });
        this.restingParts.set(part.place, entries);
      });
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      this.group.add(mesh);
      if (opaque) this.pickables.push(mesh);
    }
    this.group.userData.batches += snapshots.size;
  }

  /** 只有展开中的楼宇启用独立活动批次，其余楼宇用跨楼合批的关闭态快照绘制。 */
  setLive(id: PlaceId, active: boolean): void {
    if (this.live.has(id) === active) return;
    if (active) this.live.add(id);
    else this.live.delete(id);
    for (const entry of this.restingParts.get(id) ?? []) {
      entry.mesh.setMatrixAt(entry.index, active ? entry.hidden : entry.matrix);
      entry.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** 释放材质、纹理、几何及实例缓冲；允许在卸载流程重复调用。 */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.group.traverse((object) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.geometries.forEach((geometry) => geometry.dispose());
    Object.values(this.materials).forEach((material) => material.dispose());
    this.extraMaterials.forEach((material) => material.dispose());
    this.textures.forEach((texture) => texture.dispose());
    this.geometries.clear();
    this.extraMaterials.clear();
    this.textures.clear();
    this.pickables.length = 0;
    this.restingParts.clear();
    this.live.clear();
    this.roots.clear();
    this.batches.clear();
    this.group.clear();
  }
}
