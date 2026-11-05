import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

/** 部件都放在单位盒里：Y 轴为长度，+Y 靠近关节，+Z 为身体前方。 */
function stitch(rings: THREE.Vector3[][], capEnds = true): THREE.BufferGeometry {
  const pos: number[] = [];
  const center = new THREE.Vector3();
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    if (n.lengthSq() < 1e-8) return;
    n.normalize();
    const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
    const outward = n.dot(mid.clone().sub(center)) >= 0;
    const tri = outward ? [a, b, c] : [a, c, b];
    for (const p of tri) {
      pos.push(p.x, p.y, p.z);
    }
  };
  for (let s = 0; s < rings.length - 1; s++) {
    const a = rings[s];
    const b = rings[s + 1];
    for (let i = 0; i < a.length; i++) {
      const next = (i + 1) % a.length;
      push(a[i], a[next], b[next]);
      push(a[i], b[next], b[i]);
    }
  }
  if (capEnds) {
    for (const [ring, dir] of [[rings[0], -1], [rings[rings.length - 1], 1]] as const) {
      const c = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
      c.y += dir * 0.001;
      for (let i = 0; i < ring.length; i++) push(c, ring[i], ring[(i + 1) % ring.length]);
    }
  }
  // 共用环带顶点后再计算法线，衣料和肌肉连续过渡，不能把每个三角面当成硬折面。
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const smooth = mergeVertices(geo, 0.00001);
  geo.dispose();
  smooth.computeVertexNormals();
  return smooth;
}

function ring(y: number, rx: number, rz: number, sides: number, shape?: (ang: number, x: number, z: number) => [number, number]): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i < sides; i++) {
    const ang = (i / sides) * Math.PI * 2;
    let x = Math.cos(ang) * rx;
    let z = Math.sin(ang) * rz;
    if (shape) [x, z] = shape(ang, x, z);
    points.push(new THREE.Vector3(x, y, z));
  }
  return points;
}

/** 颅骨、下颌和五官采用连续形变，避免按阈值推拉顶点造成额头尖角与脸部硬折面。 */
export function createHead(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(0.5, 24, 18);
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  const gaussian = (value: number, center: number, width: number): number => Math.exp(-(((value - center) / width) ** 2));
  for (let index = 0; index < position.count; index++) {
    const nx = position.getX(index) * 2, ny = position.getY(index) * 2, nz = position.getZ(index) * 2;
    const front = THREE.MathUtils.smoothstep(nz, 0.4, 0.85);
    const jaw = 1 - Math.max(0, -ny) * 0.26;
    let x = nx * 0.43 * jaw;
    const y = ny * 0.56;
    let z = nz * 0.43;
    const eyeSocket = gaussian(Math.abs(nx), 0.26, 0.14) * gaussian(ny, 0.06, 0.13);
    const brow = gaussian(ny, 0.22, 0.09) * gaussian(Math.abs(nx), 0.25, 0.2);
    const nose = gaussian(nx, 0, 0.11) * gaussian(ny, -0.05, 0.22);
    const lips = gaussian(nx, 0, 0.16) * gaussian(ny, -0.18, 0.055);
    z += front * (nose * 0.115 - eyeSocket * 0.024 + brow * 0.018 + lips * 0.014);
    z += front * gaussian(ny, -0.5, 0.18) * 0.035;
    const ear = gaussian(Math.abs(nx), 0.99, 0.07) * gaussian(ny, 0, 0.22) * gaussian(nz, 0, 0.24);
    x += Math.sign(nx) * ear * 0.055;
    position.setXYZ(index, x, y, z);
    if (front > 0.7 && eyeSocket > 0.8) colors.push(0.22, 0.19, 0.17);
    else if (front > 0.7 && lips > 0.48) colors.push(1, 0.72, 0.68);
    else if (front > 0.7 && brow > 0.7) colors.push(0.74, 0.66, 0.6);
    else colors.push(1, 1, 1);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** 创建上下略扩张的颈部；返回由调用方统一释放的单位几何体。 */
export function createNeck(): THREE.BufferGeometry {
  const rings = [0, 0.35, 0.7, 1].map((t) => {
    const y = -0.5 + t;
    const flare = t < 0.2 ? 0.46 : 0.34 + t * 0.08;
    return ring(y, flare, flare * 0.9, 10);
  });
  return stitch(rings);
}

/** 创建有胸背厚度、肩斜和衣领的上衣；顶点色表达领口与衣料接缝，支持实例染色。 */
export function createTorso(): THREE.BufferGeometry {
  const sections = [
    { y: -0.5, hw: 0.4, hd: 0.42 },
    { y: -0.34, hw: 0.41, hd: 0.44 },
    { y: -0.08, hw: 0.38, hd: 0.4 },
    { y: 0.17, hw: 0.45, hd: 0.47 },
    { y: 0.33, hw: 0.51, hd: 0.44 },
    { y: 0.4, hw: 0.5, hd: 0.4 },
    { y: 0.46, hw: 0.32, hd: 0.3 },
    { y: 0.5, hw: 0.19, hd: 0.23 },
  ];
  const rings = sections.map((section) => ring(section.y, section.hw, section.hd, 16, (angle, x, z) => {
    // 小幅不规则褶皱保留衣料体积，而非让躯干像收腰的硬塑料外壳。
    const fold = Math.sin(angle * 5 + section.y * 12) * 0.009;
    return [x * (1 + fold), z + fold];
  }));
  const geometry = stitch(rings);
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const collar = y > 0.39 && z > 0.1;
    const seam = Math.abs(x) < 0.025 && z > 0.3;
    const hem = y < -0.45;
    const tone = collar ? 0.48 : seam ? 0.72 : hem ? 0.82 : 1;
    colors.push(tone, tone, tone);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** 创建连接腰腹与双腿的骨盆裤装，避免两根腿直接插进上衣形成悬空关节。 */
export function createPelvis(): THREE.BufferGeometry {
  return stitch([
    ring(-0.5, 0.28, 0.26, 16), ring(-0.28, 0.43, 0.42, 16),
    ring(0.08, 0.48, 0.45, 16), ring(0.4, 0.45, 0.43, 16), ring(0.5, 0.42, 0.41, 16),
  ]);
}

/** 创建圆肩背包；通过与躯干一起旋转的实例摆放，不额外引入骨骼和材质批次。 */
export function createBackpack(): THREE.BufferGeometry {
  return stitch([
    ring(-0.5, 0.28, 0.3, 12), ring(-0.4, 0.44, 0.46, 12),
    ring(0.23, 0.44, 0.48, 12), ring(0.4, 0.32, 0.38, 12), ring(0.5, 0.18, 0.22, 12),
  ]);
}

function createLimb(radiusAt: (t: number) => number, bulge: (t: number, ang: number) => number): THREE.BufferGeometry {
  const stacks = 6;
  const sides = 12;
  const rings: THREE.Vector3[][] = [];
  for (let s = 0; s <= stacks; s++) {
    const t = s / stacks;
    const y = -0.5 + t;
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const ang = (i / sides) * Math.PI * 2;
      const radius = Math.max(0.12, radiusAt(t) + bulge(t, ang));
      points.push(new THREE.Vector3(Math.cos(ang) * radius, y, Math.sin(ang) * radius));
    }
    rings.push(points);
  }
  return stitch(rings);
}

/** 创建带肩部和肱二头肌轮廓的上臂，返回单位几何体。 */
export function createUpperArm(): THREE.BufferGeometry {
  return createLimb(
    (t) => 0.28 + t * 0.16 + Math.sin(t * Math.PI) * 0.06,
    (t, ang) => (t > 0.65 ? 0.08 * (t - 0.65) : 0) + Math.max(0, Math.sin(ang)) * 0.03 * Math.sin(t * Math.PI),
  );
}

/** 创建从肘部向腕部收细的小臂，返回单位几何体。 */
export function createForearm(): THREE.BufferGeometry {
  return createLimb(
    (t) => 0.22 + t * 0.14,
    (t) => Math.sin(Math.min(1, t * 1.4) * Math.PI) * 0.04,
  );
}

/** 创建带前侧肌肉弧度的大腿，返回单位几何体。 */
export function createThigh(): THREE.BufferGeometry {
  return createLimb(
    (t) => 0.3 + t * 0.12 + Math.sin(t * Math.PI) * 0.06,
    (t, ang) => Math.max(0, Math.sin(ang)) * 0.1 * Math.sin(t * Math.PI),
  );
}

/** 创建脚踝收细、后侧鼓起的小腿，返回单位几何体。 */
export function createCalf(): THREE.BufferGeometry {
  return createLimb(
    (t) => 0.16 + Math.sin(t * Math.PI) * 0.12 + t * 0.04,
    (t, ang) => Math.max(0, -Math.sin(ang)) * 0.1 * Math.sin(Math.min(1, t * 1.3) * Math.PI),
  );
}

/** 掌心朝前的对称手，手指朝 -Y，能跟着小臂转动。 */
export function createHand(): THREE.BufferGeometry {
  const rings: THREE.Vector3[][] = [];
  const stacks = 7;
  for (let s = 0; s <= stacks; s++) {
    const t = s / stacks;
    const y = 0.5 - t;
    const palm = t > 0.25 && t < 0.7;
    const fingers = t >= 0.7;
    const rx = fingers ? 0.28 - (t - 0.7) * 0.25 : palm ? 0.42 : 0.26;
    const rz = fingers ? 0.16 : palm ? 0.18 : 0.22;
    rings.push(ring(y, rx, rz, 8, (ang, x, z) => {
      if (fingers) x += Math.sin(ang * 4) * 0.04;
      if (palm && Math.cos(ang) > 0.4 && t < 0.55) x += 0.1;
      return [x, z];
    }));
  }
  return stitch(rings);
}

/** 创建平底、圆鞋头与独立鞋底色的鞋，鞋尖朝 +Z，底面固定在单位高度 -0.5。 */
export function createShoe(): THREE.BufferGeometry {
  const sections = [
    { z: -0.48, top: 0.12, width: 0.3 }, { z: -0.28, top: 0.48, width: 0.43 },
    { z: 0, top: 0.37, width: 0.46 }, { z: 0.28, top: 0.15, width: 0.43 },
    { z: 0.48, top: -0.12, width: 0.27 },
  ];
  const geometry = stitch(sections.map((section) => Array.from({ length: 12 }, (_, index) => {
    const angle = index / 12 * Math.PI * 2;
    const y = Math.sin(angle) < 0 ? -0.5 : -0.25 + Math.sin(angle) * (section.top + 0.25);
    return new THREE.Vector3(Math.cos(angle) * section.width, y, section.z);
  })));
  const position = geometry.getAttribute("position");
  const colors: number[] = [];
  for (let index = 0; index < position.count; index++) {
    const sole = position.getY(index) < -0.33;
    colors.push(...(sole ? [0.55, 0.52, 0.46] : [0.08, 0.1, 0.115]));
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** 创建贴合颅骨的发际线、鬓角和后脑包覆，前额留白且不叠一颗悬空的球。 */
export function createHair(): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(0.52, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.66);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
    const azimuth = Math.atan2(z, x);
    const polar = Math.acos(THREE.MathUtils.clamp(y / 0.52, -1, 1));
    const frontal = Math.max(0, Math.sin(azimuth));
    const angle = polar * (1 - frontal * 0.34);
    const radius = 0.52 + Math.sin(azimuth * 3 + polar * 5) * 0.009;
    position.setXYZ(index, Math.cos(azimuth) * Math.sin(angle) * radius * 0.85, Math.cos(angle) * radius * 1.08, Math.sin(azimuth) * Math.sin(angle) * radius * 0.85);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** 创建帽冠与向前伸出的帽檐；临时部件合并后释放，返回独立几何体。 */
export function createCap(): THREE.BufferGeometry {
  const crown = new THREE.SphereGeometry(0.46, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  crown.translate(0, 0.05, 0);
  const brim = new THREE.BoxGeometry(0.72, 0.06, 0.34);
  brim.translate(0, 0.02, 0.34);
  const merged = mergeGeometries([crown, brim], false);
  crown.dispose();
  brim.dispose();
  if (!merged) throw new Error("帽子几何合并失败");
  return merged;
}
