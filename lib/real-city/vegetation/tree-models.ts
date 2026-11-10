import * as THREE from "three";
import { fetchMeshoptContainer } from "../assets/meshopt-container";

/**
 * 行道树模型：EZ-Tree（MIT）离线生成、scripts/build-tree-assets.mjs 烘焙的 meshopt 容器。
 * 每种树两级细节：LOD0 = 简化枝干 + 全部叶卡，LOD1 = 粗简化枝干 + 每 3 张保留 1 张（放大 1.6 倍）的叶卡。
 */
export type TreeModelForm = "spreading" | "upright" | "conifer";
export const TREE_MODEL_FORMS: readonly TreeModelForm[] = ["spreading", "upright", "conifer"];

export interface TreeModel {
  bark: [THREE.BufferGeometry, THREE.BufferGeometry];
  leaves: [THREE.BufferGeometry, THREE.BufferGeometry];
  height: number;
}

interface PackedInfo { vertices: number; triangles: number; min: number[]; ext: number[] }
interface FormInfo { height: number; crown: [number, number, number, number]; cell: [number, number]; perLeaf: number; bark0: PackedInfo; bark1: PackedInfo; leaf: PackedInfo }
interface Manifest { forms: Record<TreeModelForm, FormInfo> }

function bark(view: Uint8Array, index: Uint8Array, info: PackedInfo): THREE.BufferGeometry {
  const count = info.vertices;
  const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
  const position = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const normal = new Float32Array(count * 3);
  const color = new Float32Array(count * 3);
  for (let v = 0; v < count; v++) {
    const o = v * 16;
    for (let c = 0; c < 3; c++) position[v * 3 + c] = info.min[c] + (data.getUint16(o + c * 2, true) / 65535) * info.ext[c];
    uv[v * 2] = data.getUint16(o + 8, true) / 65535;
    // v 以「米 / 16」存储；还原为米，树皮贴图每米重复一次。
    uv[v * 2 + 1] = (data.getUint16(o + 10, true) / 65535) * 16;
    for (let c = 0; c < 3; c++) normal[v * 3 + c] = data.getInt8(o + 12 + c) / 127;
    const ao = data.getInt8(o + 15) / 127;
    color[v * 3] = color[v * 3 + 1] = color[v * 3 + 2] = ao;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  const indices = count > 65535 ? new Uint32Array(index.buffer, index.byteOffset, index.byteLength / 4) : new Uint16Array(index.buffer, index.byteOffset, index.byteLength / 2);
  geometry.setIndex(new THREE.BufferAttribute(indices.slice(), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

const QUAD_UV = [0, 1, 0, 0, 1, 0, 1, 1];

/** 由叶卡四角坐标重建 UV、树冠球面法线与内部遮蔽；keepEvery/grow 生成远景 LOD。 */
function leaves(view: Uint8Array, info: PackedInfo, form: FormInfo, keepEvery: number, grow: number): THREE.BufferGeometry {
  const raw = new Uint16Array(view.buffer, view.byteOffset, view.byteLength / 2);
  const total = info.vertices;
  const source = new Float32Array(total * 3);
  for (let v = 0; v < total; v++) for (let c = 0; c < 3; c++) source[v * 3 + c] = info.min[c] + (raw[v * 4 + c] / 65535) * info.ext[c];
  const [cx, cy, cz, rmax] = form.crown;
  const [u0, v0] = form.cell;
  let ymin = Infinity, ymax = -Infinity;
  for (let v = 0; v < total; v++) { ymin = Math.min(ymin, source[v * 3 + 1]); ymax = Math.max(ymax, source[v * 3 + 1]); }
  const leafCount = total / 4 / form.perLeaf;
  const kept = Math.ceil(leafCount / keepEvery) * form.perLeaf;
  const position = new Float32Array(kept * 12);
  const normal = new Float32Array(kept * 12);
  const uv = new Float32Array(kept * 8);
  const color = new Float32Array(kept * 12);
  const index = new Uint16Array(kept * 6);
  let q = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), face = new THREE.Vector3();
  for (let leaf = 0; leaf < leafCount; leaf += keepEvery) {
    for (let k = 0; k < form.perLeaf; k++) {
      const base = (leaf * form.perLeaf + k) * 4;
      const ax = (source[(base + 1) * 3] + source[(base + 2) * 3]) / 2;
      const ay = (source[(base + 1) * 3 + 1] + source[(base + 2) * 3 + 1]) / 2;
      const az = (source[(base + 1) * 3 + 2] + source[(base + 2) * 3 + 2]) / 2;
      a.fromArray(source, base * 3); b.fromArray(source, (base + 1) * 3); c.fromArray(source, (base + 2) * 3);
      face.subVectors(b, a).cross(c.sub(a)).normalize();
      for (let corner = 0; corner < 4; corner++) {
        const v = base + corner;
        const x = ax + (source[v * 3] - ax) * grow, y = ay + (source[v * 3 + 1] - ay) * grow, z = az + (source[v * 3 + 2] - az) * grow;
        const o = (q * 4 + corner) * 3;
        position[o] = x; position[o + 1] = y; position[o + 2] = z;
        const dx = x - cx, dy = (y - cy) * 0.8 + 0.25 * rmax, dz = z - cz;
        const d = Math.hypot(dx, dy, dz) || 1;
        const side = Math.sign(face.x * dx + face.y * dy + face.z * dz) || 1;
        let nx = (dx / d) * 0.78 + face.x * side * 0.22, ny = (dy / d) * 0.78 + face.y * side * 0.22, nz = (dz / d) * 0.78 + face.z * side * 0.22;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        normal[o] = nx; normal[o + 1] = ny; normal[o + 2] = nz;
        const radial = Math.min(1, Math.hypot(x - cx, (y - cy) * 0.8, z - cz) / rmax);
        const height = (y - ymin) / Math.max(0.01, ymax - ymin);
        const ao = 0.46 + 0.4 * radial + 0.14 * height;
        color[o] = color[o + 1] = color[o + 2] = ao;
        uv[(q * 4 + corner) * 2] = u0 + QUAD_UV[corner * 2] * 0.49 + 0.005;
        // 叶图集按「图像顶部 = v 0」（flipY = false）采样：CELL 的 v0 以图像底部为 0 定义，这里翻转。
        uv[(q * 4 + corner) * 2 + 1] = 1 - (v0 + QUAD_UV[corner * 2 + 1] * 0.49 + 0.005);
      }
      const s = q * 4;
      index.set([s, s + 1, s + 2, s, s + 2, s + 3], q * 6);
      q++;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position.subarray(0, q * 12), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normal.subarray(0, q * 12), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv.subarray(0, q * 8), 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(color.subarray(0, q * 12), 3));
  geometry.setIndex(new THREE.BufferAttribute(index.subarray(0, q * 6), 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export interface TreeAssets {
  models: Record<TreeModelForm, TreeModel>;
  leafImage: HTMLImageElement | ImageBitmap;
  barkImage: HTMLImageElement | ImageBitmap;
}

export async function loadTreeModels(baseUrl = "/models/trees/"): Promise<TreeAssets> {
  const loader = new THREE.ImageLoader();
  const [{ meta, streams }, leafImage, barkImage] = await Promise.all([
    fetchMeshoptContainer<Manifest>(`${baseUrl}trees.bin`),
    loader.loadAsync(`${baseUrl}leaves.webp`),
    loader.loadAsync(`${baseUrl}bark.webp`),
  ]);
  const take = (name: string) => {
    const data = streams.get(name);
    if (!data) throw new Error(`tree asset missing ${name}`);
    return data;
  };
  const models = {} as Record<TreeModelForm, TreeModel>;
  for (const form of TREE_MODEL_FORMS) {
    const info = meta.forms[form];
    models[form] = {
      height: info.height,
      bark: [bark(take(`${form}.bark0.vertex`), take(`${form}.bark0.index`), info.bark0), bark(take(`${form}.bark1.vertex`), take(`${form}.bark1.index`), info.bark1)],
      leaves: [leaves(take(`${form}.leaf.vertex`), info.leaf, info, 1, 1), leaves(take(`${form}.leaf.vertex`), info.leaf, info, 3, 1.6)],
    };
  }
  return { models, leafImage, barkImage };
}
