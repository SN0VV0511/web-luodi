import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createRandom } from "../physics/math";

export type LeafShape = "lanceolate" | "ovate" | "maple" | "ginkgo" | "reed";

export function createBotanicalLeaf(shape: LeafShape): THREE.BufferGeometry {
  const segments = shape === "maple" || shape === "ginkgo" ? 12 : 8;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const width = leafWidth(shape, t);
    const centerBend = Math.sin(t * Math.PI) * 0.045 + t * t * 0.065;
    for (const side of [-1, 0, 1]) {
      const edgeRipple = side === 0 ? 0 : Math.sin(t * Math.PI * 9) * 0.006 * width;
      const x = side * width;
      const y = t;
      const z = centerBend + (side === 0 ? 0.018 * Math.sin(t * Math.PI) : edgeRipple);
      positions.push(x, y, z);
      normals.push(0, 0, 1);
      uvs.push(side * 0.5 + 0.5, t);
      const edgeShade = side === 0 ? 1 : 0.86;
      const growthShade = 0.75 + t * 0.25;
      colors.push(edgeShade * growthShade, growthShade, edgeShade * 0.88);
      if (row < segments && side < 1) {
        const index = row * 3 + side + 1;
        indices.push(index, index + 3, index + 1, index + 1, index + 3, index + 4);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function leafWidth(shape: LeafShape, t: number): number {
  if (shape === "reed") return Math.sin(t * Math.PI) * (0.038 + t * 0.012);
  if (shape === "lanceolate") return Math.sin(t * Math.PI) ** 0.8 * 0.16 * (1 - t * 0.25);
  if (shape === "ovate") return Math.sin(t * Math.PI) ** 0.68 * 0.28 * (1 - t * 0.3);
  if (shape === "ginkgo") {
    const fan = Math.sin(Math.min(1, t * 1.2) * Math.PI * 0.7);
    const notch = 1 - Math.exp(-(((t - 0.94) / 0.045) ** 2)) * 0.13;
    return t < 0.15 ? 0.014 : fan * 0.43 * notch;
  }
  const lobes = 0.68 + Math.sin(t * Math.PI * 6 - 0.9) * 0.24;
  const stem = t < 0.17 ? 0.018 : Math.sin((t - 0.17) / 0.83 * Math.PI) ** 0.72;
  return stem * lobes * 0.42;
}

export function createGrassTuft(seed: number, blades = 7): THREE.BufferGeometry {
  const random = createRandom(seed);
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let blade = 0; blade < blades; blade++) {
    const angle = random() * Math.PI * 2;
    const width = 0.014 + random() * 0.02;
    const height = 0.18 + random() * 0.42;
    const lean = 0.08 + random() * 0.19;
    const baseX = Math.cos(angle) * random() * 0.07;
    const baseZ = Math.sin(angle) * random() * 0.07;
    const sideX = Math.cos(angle + Math.PI / 2);
    const sideZ = Math.sin(angle + Math.PI / 2);
    const start = positions.length / 3;
    for (let row = 0; row <= 3; row++) {
      const t = row / 3;
      const centerX = baseX + Math.cos(angle) * t * t * lean;
      const centerZ = baseZ + Math.sin(angle) * t * t * lean;
      for (const side of [-1, 1]) {
        const halfWidth = width * (1 - t * 0.98) * 0.5;
        positions.push(centerX + sideX * halfWidth * side, t * height, centerZ + sideZ * halfWidth * side);
        uvs.push(side > 0 ? 1 : 0, t);
        colors.push(0.5 + t * 0.43, 0.65 + t * 0.35, 0.38 + t * 0.43);
      }
      if (row < 3) {
        const index = start + row * 2;
        indices.push(index, index + 2, index + 1, index + 1, index + 2, index + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createWoodyStem(seed: number, height: number, spread: number): THREE.BufferGeometry {
  const random = createRandom(seed);
  const parts: THREE.BufferGeometry[] = [];
  const base = new THREE.Vector3(0, 0, 0);
  const top = new THREE.Vector3((random() - 0.5) * 0.08, height, (random() - 0.5) * 0.08);
  const trunk = new THREE.CatmullRomCurve3([base, new THREE.Vector3(0.04, height * 0.42, -0.02), top]);
  parts.push(taperedTube(trunk, 7, 0.035, 0.008));
  for (let branch = 0; branch < 5; branch++) {
    const angle = branch * 2.399963 + random() * 0.3;
    const start = trunk.getPoint(0.3 + branch * 0.11);
    const reach = spread * (0.72 + random() * 0.28) * (1 - branch * 0.07);
    const end = new THREE.Vector3(Math.cos(angle) * reach, start.y + height * 0.28, Math.sin(angle) * reach);
    const middle = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.08, 0));
    parts.push(taperedTube(new THREE.CatmullRomCurve3([start, middle, end]), 4, 0.012, 0.002));
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Botanical branch merge failed");
  return merged;
}

function taperedTube(curve: THREE.CatmullRomCurve3, segments: number, startRadius: number, endRadius: number): THREE.BufferGeometry {
  const geometry = new THREE.TubeGeometry(curve, segments, 1, 5, false);
  const positions = geometry.getAttribute("position");
  const center = new THREE.Vector3();
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    curve.getPointAt(t, center);
    const radius = startRadius + (endRadius - startRadius) * t;
    for (let side = 0; side <= 5; side++) {
      const index = row * 6 + side;
      positions.setXYZ(index,
        center.x + (positions.getX(index) - center.x) * radius,
        center.y + (positions.getY(index) - center.y) * radius,
        center.z + (positions.getZ(index) - center.z) * radius,
      );
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createFlowerHead(petals: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let petal = 0; petal < petals; petal++) {
    const leaf = createBotanicalLeaf("ovate");
    leaf.scale(0.075, 0.075, 0.075);
    leaf.rotateX(-Math.PI / 2 + 0.25);
    leaf.rotateY(petal / petals * Math.PI * 2);
    leaf.translate(0, 0.025, 0);
    parts.push(leaf);
  }
  const core = new THREE.SphereGeometry(0.018, 8, 4);
  core.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(core.getAttribute("position").count * 3).fill(0.92), 3));
  core.translate(0, 0.03, 0);
  parts.push(core);
  const result = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!result) throw new Error("Flower head merge failed");
  return result;
}
