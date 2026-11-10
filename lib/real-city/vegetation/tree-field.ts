import * as THREE from "three";
import { TREE_MODEL_FORMS, type TreeAssets, type TreeModelForm } from "./tree-models";

export interface TreePlacement { x: number; y: number; z: number; size: number; yaw: number; variant: number }

interface FormLayer {
  placements: TreePlacement[];
  matrices: THREE.Matrix4[];
  colors: THREE.Color[];
  /** 程序化占位：模型加载前（及测试 / 无 WebGL 环境）一直使用。 */
  proceduralStem: THREE.InstancedMesh;
  proceduralCrowns: THREE.InstancedMesh[];
  /** 加载后：[近景, 远景] × [枝干, 叶冠]。 */
  lod: { bark: THREE.InstancedMesh; leaves: THREE.InstancedMesh }[];
}

const NEAR_DISTANCE = 68;
/** 叶色变化：模型叶片贴图本身已是写实绿色，这里只做轻微色相与明度变化；第 4 种偏黄（秋色/行道树品种差异）。 */
const LEAF_TINTS = ["#ffffff", "#e2eed8", "#eef2d6", "#f6e2b0"];

/**
 * 行道树实例场：所有树先以程序化树形实例绘制；CC0/MIT 模型加载后替换为两级细节，
 * 每帧按相机距离把实例分到近景（完整叶卡）与远景（稀疏放大叶卡）两个实例批次。
 */
export class TreeField {
  readonly group = new THREE.Group();
  private readonly layers: FormLayer[] = [];
  private readonly viewer = new THREE.Vector3(Infinity, 0, 0);
  private lastPartition = new THREE.Vector3(Infinity, 0, 0);
  private ready = false;

  constructor(
    parent: THREE.Object3D,
    placements: readonly TreePlacement[],
    procedural: readonly { stem: THREE.BufferGeometry; crown: THREE.BufferGeometry }[],
    trunkMaterial: THREE.Material,
    canopyMaterials: readonly THREE.Material[],
  ) {
    this.group.name = "Street trees";
    parent.add(this.group);
    const transform = new THREE.Object3D();
    TREE_MODEL_FORMS.forEach((_form, formIndex) => {
      const own = placements.filter((tree) => tree.variant % procedural.length === formIndex);
      const matrices = own.map((tree) => {
        transform.position.set(tree.x, tree.y, tree.z);
        transform.rotation.set(0, tree.yaw, 0);
        transform.scale.setScalar(tree.size);
        transform.updateMatrix();
        return transform.matrix.clone();
      });
      const stem = new THREE.InstancedMesh(procedural[formIndex].stem, trunkMaterial, Math.max(1, own.length));
      stem.count = own.length;
      matrices.forEach((matrix, index) => stem.setMatrixAt(index, matrix));
      stem.castShadow = stem.receiveShadow = true;
      this.group.add(stem);
      const crowns = canopyMaterials.map((material, variant) => {
        const subset = own.map((tree, index) => [tree, index] as const).filter(([tree]) => tree.variant % canopyMaterials.length === variant);
        const mesh = new THREE.InstancedMesh(procedural[formIndex].crown, material, Math.max(1, subset.length));
        mesh.count = subset.length;
        subset.forEach(([, index], slot) => mesh.setMatrixAt(slot, matrices[index]));
        mesh.castShadow = mesh.receiveShadow = true;
        mesh.visible = subset.length > 0;
        this.group.add(mesh);
        return mesh;
      });
      this.layers.push({
        placements: own, matrices,
        colors: own.map((tree) => new THREE.Color(LEAF_TINTS[tree.variant % LEAF_TINTS.length]).offsetHSL(0, 0, ((tree.x * 7.13 + tree.z * 3.7) % 1) * 0.06 - 0.03)),
        proceduralStem: stem, proceduralCrowns: crowns, lod: [],
      });
    });
  }

  get treeCount(): number {
    return this.layers.reduce((total, layer) => total + layer.placements.length, 0);
  }

  /** 切换到模型树；barkMaterial / leafMaterial 由调用方创建（以便接入天气与季节着色）。 */
  useModels(assets: TreeAssets, barkMaterial: THREE.Material, leafMaterial: THREE.Material): void {
    TREE_MODEL_FORMS.forEach((form: TreeModelForm, formIndex) => {
      const layer = this.layers[formIndex];
      const model = assets.models[form];
      // 模型树高按程序化树冠顶（约 6.8 m）对齐，保持原有布局里的大小比例。
      const fit = 6.9 / model.height * (form === "conifer" ? 1.12 : 1);
      layer.matrices.forEach((matrix) => matrix.multiply(new THREE.Matrix4().makeScale(fit, fit, fit)));
      for (let level = 0; level < 2; level++) {
        const capacity = Math.max(1, layer.placements.length);
        const barkMesh = new THREE.InstancedMesh(model.bark[level], barkMaterial, capacity);
        const leafMesh = new THREE.InstancedMesh(model.leaves[level], leafMaterial, capacity);
        for (const mesh of [barkMesh, leafMesh]) {
          mesh.count = 0;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.name = `Street trees · ${form} · LOD${level}`;
          this.group.add(mesh);
        }
        // 只有主视角（透视相机）驱动 LOD 分配；阴影相机为正交相机，不参与。
        leafMesh.onBeforeRender = (_renderer, _scene, camera) => {
          if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) this.update(camera);
        };
        leafMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        leafMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        layer.lod.push({ bark: barkMesh, leaves: leafMesh });
      }
      layer.proceduralStem.visible = false;
      layer.proceduralCrowns.forEach((mesh) => { mesh.visible = false; });
    });
    this.ready = true;
    this.lastPartition.set(Infinity, 0, 0);
    this.partition();
  }

  /** 每帧调用；相机移动超过 3 m 才重新分配近景 / 远景实例。 */
  update(camera: THREE.Camera): void {
    if (!this.ready) return;
    this.viewer.setFromMatrixPosition(camera.matrixWorld);
    if (this.viewer.distanceToSquared(this.lastPartition) < 9) return;
    this.partition();
  }

  private partition(): void {
    this.lastPartition.copy(this.viewer);
    const near2 = NEAR_DISTANCE * NEAR_DISTANCE;
    for (const layer of this.layers) {
      const counts = [0, 0];
      layer.placements.forEach((tree, index) => {
        const dx = tree.x - this.viewer.x, dy = tree.y - this.viewer.y, dz = tree.z - this.viewer.z;
        const level = dx * dx + dy * dy + dz * dz < near2 * Math.max(0.6, tree.size) ? 0 : 1;
        const slot = counts[level]++;
        const target = layer.lod[level];
        target.bark.setMatrixAt(slot, layer.matrices[index]);
        target.leaves.setMatrixAt(slot, layer.matrices[index]);
        target.leaves.setColorAt(slot, layer.colors[index]);
      });
      layer.lod.forEach((target, level) => {
        for (const mesh of [target.bark, target.leaves]) {
          mesh.count = counts[level];
          mesh.visible = counts[level] > 0;
          mesh.instanceMatrix.needsUpdate = true;
        }
        if (target.leaves.instanceColor) target.leaves.instanceColor.needsUpdate = true;
      });
    }
  }

  dispose(): void {
    for (const layer of this.layers) {
      layer.proceduralStem.dispose();
      layer.proceduralCrowns.forEach((mesh) => mesh.dispose());
      for (const target of layer.lod) { target.bark.dispose(); target.leaves.dispose(); }
    }
    this.group.removeFromParent();
  }
}
