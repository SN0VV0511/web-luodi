import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type TreeForm = "spreading" | "upright";
type Bough = { base: THREE.Vector3; elbow: THREE.Vector3; tip: THREE.Vector3 };

function boughs(form: TreeForm): Bough[] {
  return Array.from({ length: 7 }, (_, index) => {
    const angle = index * 2.399963;
    const spread = (1.3 + (index % 3) * 0.24) * (form === "upright" ? 0.72 : 1);
    const y = 4.15 + (index % 4) * 0.45;
    return {
      base: new THREE.Vector3(0.06, 2.05 + index * 0.22, -0.04),
      elbow: new THREE.Vector3(Math.cos(angle) * spread * 0.58, y - 0.55, Math.sin(angle) * spread * 0.58),
      tip: new THREE.Vector3(Math.cos(angle) * spread, y, Math.sin(angle) * spread),
    };
  });
}

function branch(points: THREE.Vector3[], bottom: number, top: number, segments = 3, sides = 5): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(curve, segments, 1, sides, false);
  const position = geometry.getAttribute("position");
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const center = curve.getPointAt(t);
    const radius = THREE.MathUtils.lerp(bottom, top, t);
    for (let side = 0; side <= sides; side++) {
      const index = row * (sides + 1) + side;
      position.setXYZ(index,
        center.x + (position.getX(index) - center.x) * radius,
        center.y + (position.getY(index) - center.y) * radius,
        center.z + (position.getZ(index) - center.z) * radius,
      );
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

function mergeOwned(parts: THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  try {
    const geometry = mergeGeometries(parts, false);
    if (!geometry) throw new Error(`${label}几何合并失败`);
    return geometry;
  } finally {
    parts.forEach((part) => part.dispose());
  }
}

/** 创建米制乔木的根张、弯曲主干、侧枝和次级枝；树型与树冠共用骨架，资源归调用方。 */
export function createTreeTrunk(form: TreeForm = "spreading"): THREE.BufferGeometry {
  const parts = [branch([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.1, 0.7, 0.04),
    new THREE.Vector3(0.07, 2.4, -0.04), new THREE.Vector3(-0.15, 4.2, 0.1),
    new THREE.Vector3(0.08, 5.6, -0.06),
  ], 0.26, 0.035, 8, 8)];
  for (let root = 0; root < 5; root++) {
    const angle = root * 1.2566;
    parts.push(branch([
      new THREE.Vector3(Math.cos(angle) * 0.58, 0.025, Math.sin(angle) * 0.58),
      new THREE.Vector3(Math.cos(angle) * 0.2, 0.12, Math.sin(angle) * 0.2),
      new THREE.Vector3(-0.06, 0.6, 0.02),
    ], 0.025, 0.14, 2, 5));
  }
  for (const [index, limb] of boughs(form).entries()) {
    parts.push(branch([limb.base, limb.elbow, limb.tip], 0.1 - index * 0.005, 0.025));
    for (const side of [-1, 1]) {
      const tip = limb.tip.clone().add(new THREE.Vector3(side * 0.46, 0.65, side * 0.32));
      parts.push(branch([limb.elbow, limb.tip, tip], 0.028, 0.006, 2, 4));
    }
  }
  return mergeOwned(parts, "乔木枝干");
}

/** 创建分枝端点上的立体小叶簇；折面与不规则冠缘避免大片纸片和圆锥轮廓。 */
export function createTreeCanopy(form: TreeForm = "spreading"): THREE.BufferGeometry {
  const cards: THREE.BufferGeometry[] = [];
  const centers = boughs(form).map((limb) => limb.tip.clone().add(new THREE.Vector3(0, 0.3, 0)));
  centers.push(new THREE.Vector3(0, 5.7, 0));
  const orientation = new THREE.Quaternion();
  const front = new THREE.Vector3(0, 0, 1);
  for (const [cluster, center] of centers.entries()) {
    for (let index = 0; index < 16; index++) {
      const angle = index * 2.399963 + cluster * 0.83;
      const ny = 1 - 2 * (index + 0.5) / 16;
      const ring = Math.sqrt(1 - ny * ny);
      const direction = new THREE.Vector3(Math.cos(angle) * ring, ny, Math.sin(angle) * ring);
      const radius = 0.42 + (index % 3) * 0.17;
      const card = new THREE.PlaneGeometry(1.05 + (index % 3) * 0.14, 0.96 + (index % 4) * 0.1, 2, 1);
      const position = card.getAttribute("position");
      const colors: number[] = [];
      for (let vertex = 0; vertex < position.count; vertex++) {
        position.setZ(vertex, Math.abs(position.getX(vertex)) < 0.01 ? 0.13 : -0.03);
        const shade = 0.76 + 0.12 * (direction.y + 1) + (index % 3) * 0.015;
        colors.push(shade, shade, shade * 0.96);
      }
      card.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      card.computeVertexNormals();
      orientation.setFromUnitVectors(front, direction);
      card.applyQuaternion(orientation);
      card.translate(center.x + direction.x * radius, center.y + direction.y * radius * 0.76, center.z + direction.z * radius);
      cards.push(card);
    }
  }
  return mergeOwned(cards, "乔木叶簇");
}

/** 绘制带叶脉和明暗渐变的小枝叶簇透明贴图；每张叶卡包含细叶，而不是一张巨大叶片。 */
export function paintLeafCluster(ctx: CanvasRenderingContext2D): void {
  const size = ctx.canvas.width;
  ctx.save();
  try {
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, size, size);
    const count = 72;
    for (let index = 0; index < count; index++) {
      const angle = index * 2.399963;
      const radius = size * 0.4 * Math.sqrt((index + 0.5) / count);
      const length = size * (0.061 + (index % 4) * 0.007);
      const width = length * (0.38 + (index % 3) * 0.04);
      ctx.save();
      try {
        ctx.translate(size / 2 + Math.cos(angle) * radius, size / 2 + Math.sin(angle) * radius * 0.91);
        ctx.rotate(angle + Math.sin(index * 3.1) * 0.5);
        const gradient = ctx.createLinearGradient(0, -width, 0, width);
        gradient.addColorStop(0, "#b8ca87");
        gradient.addColorStop(0.48, "#8ca35e");
        gradient.addColorStop(0.53, "#627d40");
        gradient.addColorStop(1, "#9aaf68");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(-length, 0);
        ctx.bezierCurveTo(-length * 0.5, -width, length * 0.35, -width, length, 0);
        ctx.bezierCurveTo(length * 0.35, width, -length * 0.5, width, -length, 0);
        ctx.fill();
        ctx.strokeStyle = "rgba(205,220,155,0.5)";
        ctx.lineWidth = size / 600;
        ctx.beginPath();
        ctx.moveTo(-length, 0);
        ctx.lineTo(length * 0.8, 0);
        for (const point of [-0.5, -0.1, 0.3]) {
          ctx.moveTo(length * point, 0);
          ctx.lineTo(length * (point + 0.2), -width * 0.6);
          ctx.moveTo(length * point, 0);
          ctx.lineTo(length * (point + 0.2), width * 0.6);
        }
        ctx.stroke();
      } finally {
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = "destination-in";
    const fade = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.5);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(0.7, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, size, size);
  } finally {
    ctx.restore();
  }
}
