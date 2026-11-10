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
  /** 远景替身（烘焙完成前为 null，远处仍用 LOD1）。 */
  impostor: THREE.InstancedMesh | null;
}

const NEAR_DISTANCE = 68;
/** 超过该距离（米）改用烘焙的十字 + 顶视三面片替身。 */
const IMPOSTOR_DISTANCE = 190;

/** 全城共享的风场 uniform：树叶 onBeforeRender 时按帧推进。 */
export const treeWind = { time: { value: 0 }, strength: { value: 1 } };

/**
 * 轻柔风动：整树按高度平方摆动（低频主摆 + 次频），叶卡再叠加高频抖动；相位取自实例根部位置，
 * 相邻行道树不会同步摆动。必须在 applyCitySurface 之前调用（城市表面着色会串联本补丁）。
 */
export function applyTreeWind(material: THREE.Material, leaf: boolean): void {
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.treeWindTime = treeWind.time;
    shader.uniforms.treeWindStrength = treeWind.strength;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float treeWindTime;\nuniform float treeWindStrength;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 treeRoot = instanceMatrix[3].xyz;
      #else
        vec3 treeRoot = vec3(0.0);
      #endif
      float treePhase = dot(treeRoot.xz, vec2(0.13, 0.171));
      float treeH = max(0.0, position.y) / 8.0;
      float treeSway = (sin(treeWindTime * 0.83 + treePhase) * 0.7 + sin(treeWindTime * 1.91 + treePhase * 1.3) * 0.3) * treeWindStrength;
      transformed.xz += vec2(0.94, 0.33) * treeSway * 0.12 * treeH * treeH;
      ${leaf ? `float treeFlutter = sin(treeWindTime * 7.3 + dot(position, vec3(4.1, 3.3, 5.7))) * 0.03 * treeWindStrength * smoothstep(0.12, 0.6, treeH);
      transformed += vec3(treeFlutter, treeFlutter * 0.6, -treeFlutter * 0.8);` : ""}`);
    // 叶贴图 mip 越小，细碎叶片的平均 alpha 越低，alphaTest 会把整片叶卡裁掉（近景橡树变光秃）：
    // 按屏幕上的纹素密度补偿 alpha（保持远近叶量一致）。
    if (leaf) shader.fragmentShader = shader.fragmentShader.replace("#include <alphatest_fragment>", `
      #ifdef USE_MAP
        vec2 treeTexel = fwidth(vMapUv) * 640.0;
        float treeMip = max(0.0, log2(max(treeTexel.x, treeTexel.y)));
        diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + treeMip * 0.45));
      #endif
      #include <alphatest_fragment>`);
  };
  material.customProgramCacheKey = () => `${previousKey}|tree-wind-${leaf ? "leaf" : "bark"}`;
}
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
  private assets: TreeAssets | null = null;
  private impostorState: "none" | "scheduled" | "done" = "none";
  private readonly impostorTargets: THREE.WebGLRenderTarget[] = [];
  private readonly impostorMaterials: THREE.Material[] = [];
  private readonly impostorGeometries: THREE.BufferGeometry[] = [];

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
        proceduralStem: stem, proceduralCrowns: crowns, lod: [], impostor: null,
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
        // 只有主视角（透视相机）驱动 LOD 分配；阴影相机（正交）与反射立方体相机不参与。
        leafMesh.onBeforeRender = (renderer, _scene, camera) => {
          treeWind.time.value = performance.now() / 1000;
          // 局部反射的立方体相机（6 个透视子相机）也会渲染树：只按主视角分配，否则每帧在探针与主相机间来回切换，近景叶冠闪烁。
          if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera && camera.parent?.type !== "CubeCamera") this.update(camera);
          if (this.impostorState === "none" && typeof requestAnimationFrame === "function") {
            this.impostorState = "scheduled";
            // 不能在渲染调用内部切换渲染目标：下一帧开始前烘焙。
            requestAnimationFrame(() => this.bakeImpostors(renderer));
          }
        };
        leafMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
        leafMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
        layer.lod.push({ bark: barkMesh, leaves: leafMesh });
      }
      layer.proceduralStem.visible = false;
      layer.proceduralCrowns.forEach((mesh) => { mesh.visible = false; });
    });
    this.assets = assets;
    this.ready = true;
    this.lastPartition.set(Infinity, 0, 0);
    this.partition();
  }

  /**
   * 远景替身：把每种树形的 LOD1 用无光照材质（叶贴图 × 顶点遮蔽）分别从侧面与顶面正交渲染进 512² 图集
   * （左半侧视 256×512，右上顶视 256×256），再以「两片十字竖面 + 一片树冠中部水平面」实例化绘制，
   * 航拍俯视与街景远眺都有完整轮廓，每棵树只剩 6 个三角形。
   */
  private bakeImpostors(renderer: THREE.WebGLRenderer): void {
    if (!this.assets || this.impostorState === "done") return;
    this.impostorState = "done";
    const assets = this.assets;
    const previousTarget = renderer.getRenderTarget();
    const previousClear = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    const previousAutoClear = renderer.autoClear;
    const previousShadow = renderer.shadowMap.enabled;
    renderer.shadowMap.enabled = false;
    renderer.autoClear = false;
    TREE_MODEL_FORMS.forEach((form, formIndex) => {
      const layer = this.layers[formIndex];
      const model = assets.models[form];
      const leafSource = layer.lod[1].leaves.material as THREE.MeshStandardMaterial;
      const barkSource = layer.lod[1].bark.material as THREE.MeshStandardMaterial;
      const leafBake = new THREE.MeshBasicMaterial({ map: leafSource.map, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide });
      const barkBake = new THREE.MeshBasicMaterial({ map: barkSource.map, vertexColors: true, color: barkSource.color });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(model.bark[1], barkBake), new THREE.Mesh(model.leaves[1], leafBake));
      const box = new THREE.Box3().setFromObject(scene);
      const radius = Math.max(Math.abs(box.min.x), box.max.x, Math.abs(box.min.z), box.max.z) * 1.02;
      const top = box.max.y * 1.01;
      const target = new THREE.WebGLRenderTarget(512, 512, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.SRGBColorSpace });
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x2f4a2a, 0);
      renderer.clear(true, true, true);
      const side = new THREE.OrthographicCamera(-radius, radius, top, 0, -radius * 2, radius * 2);
      side.position.set(0, 0, radius);
      side.lookAt(0, 0, 0);
      side.position.set(0, 0, 0);
      side.updateMatrixWorld();
      target.viewport.set(0, 0, 256, 512);
      renderer.setRenderTarget(target);
      renderer.render(scene, side);
      const down = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0, top * 2 + 1);
      down.position.set(0, top + 1, 0);
      down.up.set(0, 0, -1);
      down.lookAt(0, 0, 0);
      down.updateMatrixWorld();
      target.viewport.set(256, 256, 256, 256);
      renderer.setRenderTarget(target);
      renderer.render(scene, down);
      target.viewport.set(0, 0, 512, 512);
      leafBake.dispose();
      barkBake.dispose();
      this.impostorTargets.push(target);
      // 几何：两片竖面 (u 0..0.5) + 水平顶面 (u 0.5..1, v 0.5..1)。
      const crownY = THREE.MathUtils.lerp(model.height * 0.5, top, 0.55);
      const positions: number[] = [], uvs: number[] = [], normals: number[] = [];
      const quad = (corners: number[][], uv: number[][], normal: number[]) => {
        for (const k of [0, 1, 2, 0, 2, 3]) { positions.push(...corners[k]); uvs.push(...uv[k]); normals.push(...normal); }
      };
      const sideUv = [[0, 0], [0.5, 0], [0.5, 1], [0, 1]];
      quad([[-radius, 0, 0], [radius, 0, 0], [radius, top, 0], [-radius, top, 0]], sideUv, [0, 0, 1]);
      quad([[0, 0, radius], [0, 0, -radius], [0, top, -radius], [0, top, radius]], sideUv, [1, 0, 0]);
      quad([[-radius, crownY, radius], [radius, crownY, radius], [radius, crownY, -radius], [-radius, crownY, -radius]], [[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1]], [0, 1, 0]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      const material = new THREE.MeshStandardMaterial({ name: "Tree impostor", map: target.texture, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
      this.impostorGeometries.push(geometry);
      this.impostorMaterials.push(material);
      const capacity = Math.max(1, layer.placements.length);
      const mesh = new THREE.InstancedMesh(geometry, material, capacity);
      mesh.name = `Street trees · ${form} · impostor`;
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      this.group.add(mesh);
      layer.impostor = mesh;
    });
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClear, previousAlpha);
    renderer.autoClear = previousAutoClear;
    renderer.shadowMap.enabled = previousShadow;
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
      let far = 0;
      const impostor = layer.impostor;
      const far2 = IMPOSTOR_DISTANCE * IMPOSTOR_DISTANCE;
      layer.placements.forEach((tree, index) => {
        const dx = tree.x - this.viewer.x, dy = tree.y - this.viewer.y, dz = tree.z - this.viewer.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (impostor && d2 > far2) {
          impostor.setMatrixAt(far, layer.matrices[index]);
          impostor.setColorAt(far++, layer.colors[index]);
          return;
        }
        const level = d2 < near2 * Math.max(0.6, tree.size) ? 0 : 1;
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
      if (impostor) {
        impostor.count = far;
        impostor.visible = far > 0;
        impostor.instanceMatrix.needsUpdate = true;
        if (impostor.instanceColor) impostor.instanceColor.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    for (const layer of this.layers) {
      layer.proceduralStem.dispose();
      layer.proceduralCrowns.forEach((mesh) => mesh.dispose());
      for (const target of layer.lod) { target.bark.dispose(); target.leaves.dispose(); }
      layer.impostor?.dispose();
    }
    for (const target of this.impostorTargets) target.dispose();
    for (const material of this.impostorMaterials) material.dispose();
    for (const geometry of this.impostorGeometries) geometry.dispose();
    this.group.removeFromParent();
  }
}
