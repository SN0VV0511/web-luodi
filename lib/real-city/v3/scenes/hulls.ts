import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/** 参数化小船船壳：船首收尖、船尾方形艉板、两端舷弧上翘；返回开口壳体（双面材质）。 */
export function createHull(length: number, width: number, depth: number, rings = 18, around = 10, transom = 0.42): THREE.BufferGeometry {
  const positions: number[] = [];
  const index: number[] = [];
  const half = length / 2;
  const section = (t: number) => {
    const hw = t >= 0 ? width / 2 * Math.sqrt(Math.max(0.0004, 1 - Math.pow(t, 2.4))) : width / 2 * (1 - Math.pow(-t, 3) * (1 - transom));
    const keel = depth * (1 - 0.35 * t * t);
    const sheer = 0.09 * t * t + (t > 0 ? 0.05 * t : 0);
    return { hw, keel, sheer };
  };
  for (let i = 0; i <= rings; i++) {
    const t = -1 + (i / rings) * 2;
    const { hw, keel, sheer } = section(t);
    for (let j = 0; j <= around; j++) {
      const th = (j / around) * Math.PI;
      const x = -Math.cos(th) * hw;
      // 平底船型：截面底部压平
      const y = sheer - Math.pow(Math.sin(th), 0.6) * keel;
      positions.push(x, y + depth, t * half);
    }
  }
  const stride = around + 1;
  for (let i = 0; i < rings; i++) for (let j = 0; j < around; j++) {
    const a = i * stride + j, b = a + 1, c = a + stride, d = c + 1;
    index.push(a, c, b, b, c, d);
  }
  // 艉板
  const base = positions.length / 3;
  const { hw, keel, sheer } = section(-1);
  positions.push(0, sheer + depth - keel * 0.5, -half);
  for (let j = 0; j <= around; j++) {
    const th = (j / around) * Math.PI;
    positions.push(-Math.cos(th) * hw, sheer - Math.pow(Math.sin(th), 0.6) * keel + depth, -half);
  }
  for (let j = 0; j < around; j++) index.push(base, base + 1 + j, base + 2 + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

/** 船舷护木：沿舷缘的管状曲线。 */
export function createGunwale(length: number, width: number, depth: number, radius = 0.035, transom = 0.42): THREE.BufferGeometry {
  const half = length / 2;
  const pts: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const run: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = -1 + (i / 20) * 2;
      const hw = t >= 0 ? width / 2 * Math.sqrt(Math.max(0.0004, 1 - Math.pow(t, 2.4))) : width / 2 * (1 - Math.pow(-t, 3) * (1 - transom));
      run.push(new THREE.Vector3(side * hw, 0.09 * t * t + (t > 0 ? 0.05 * t : 0) + depth, t * half));
    }
    if (side < 0) pts.push(...run.reverse()); else pts.push(...run);
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 64, radius, 5, true);
}

/** 绿头鸭：顶点色合并几何（褐身、绿头、黄喙、白颈环）。 */
export function createDuck(): THREE.BufferGeometry {
  const paint = (g: THREE.BufferGeometry, hex: string) => {
    const c = new THREE.Color(hex);
    const flat = g.index ? g.toNonIndexed() : g;
    const colors = new Float32Array(flat.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    flat.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    flat.deleteAttribute("uv");
    return flat;
  };
  const body = new THREE.SphereGeometry(0.16, 10, 7); body.scale(0.85, 0.6, 1.35); body.translate(0, 0.06, 0);
  const tail = new THREE.ConeGeometry(0.07, 0.16, 6); tail.rotateX(-Math.PI / 2 - 0.5); tail.translate(0, 0.12, -0.24);
  const neck = new THREE.CylinderGeometry(0.045, 0.055, 0.12, 7); neck.translate(0, 0.17, 0.15);
  const ring = new THREE.CylinderGeometry(0.052, 0.052, 0.02, 7); ring.translate(0, 0.2, 0.15);
  const head = new THREE.SphereGeometry(0.075, 9, 7); head.scale(0.9, 0.95, 1.15); head.translate(0, 0.27, 0.17);
  const beak = new THREE.BoxGeometry(0.05, 0.02, 0.09); beak.translate(0, 0.255, 0.27);
  return mergeGeometries([paint(body, "#8a6f55"), paint(tail, "#3b3532"), paint(neck, "#2c5e3a"), paint(ring, "#f2f2ee"), paint(head, "#1f5a36"), paint(beak, "#e2b13a")])!;
}
