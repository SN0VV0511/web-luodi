import * as THREE from "three";
import { createCityMesh } from "./city-mesh-assets";

export type TreeForm = "spreading" | "upright" | "conifer";

/** 米制根张、弯曲枝干与小叶簇；每种树只创建一份几何，交给实例批次复用。 */
export function createTreeTrunk(form: TreeForm = "spreading"): THREE.BufferGeometry {
  return createCityMesh(`${form}Trunk`);
}

export function createTreeCanopy(form: TreeForm = "spreading"): THREE.BufferGeometry {
  return createCityMesh(`${form}Canopy`);
}

/**
 * 叶簇的精简版：叶卡（每张 2×1 分段 = 12 个非索引顶点）每 keepEvery 张留一张，并绕自身中心放大 grow 倍补足覆盖面积。
 * 用于田间作物、林下灌木这类缩到零点几米、却沿用整棵乔木 512 三角形叶簇的实例。
 */
export function thinLeafCards(source: THREE.BufferGeometry, keepEvery: number, grow: number, name = source.name): THREE.BufferGeometry {
  const CARD = 12;
  const position = source.getAttribute("position");
  if (source.index || position.count % CARD !== 0 || keepEvery <= 1) return source.clone();
  const cards = position.count / CARD;
  const kept: number[] = [];
  for (let card = 0; card < cards; card += keepEvery) kept.push(card);
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  for (const [attributeName, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize;
    const array = new Float32Array(kept.length * CARD * size);
    kept.forEach((card, target) => {
      for (let vertex = 0; vertex < CARD; vertex++)
        for (let component = 0; component < size; component++)
          array[(target * CARD + vertex) * size + component] = attribute.getComponent(card * CARD + vertex, component);
    });
    geometry.setAttribute(attributeName, new THREE.BufferAttribute(array, size));
  }
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const center = new THREE.Vector3();
  for (let card = 0; card < kept.length; card++) {
    center.set(0, 0, 0);
    for (let vertex = 0; vertex < CARD; vertex++) {
      const i = card * CARD + vertex;
      center.x += positions.getX(i) / CARD; center.y += positions.getY(i) / CARD; center.z += positions.getZ(i) / CARD;
    }
    for (let vertex = 0; vertex < CARD; vertex++) {
      const i = card * CARD + vertex;
      positions.setXYZ(i, center.x + (positions.getX(i) - center.x) * grow, center.y + (positions.getY(i) - center.y) * grow, center.z + (positions.getZ(i) - center.z) * grow);
    }
  }
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
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
