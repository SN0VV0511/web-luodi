import * as THREE from "three";
import { createCityMesh } from "./city-mesh-assets";

export type TreeForm = "spreading" | "upright";

/** 米制根张、弯曲枝干与小叶簇；每种树只创建一份几何，交给实例批次复用。 */
export function createTreeTrunk(form: TreeForm = "spreading"): THREE.BufferGeometry {
  return createCityMesh(`${form}Trunk`);
}

export function createTreeCanopy(form: TreeForm = "spreading"): THREE.BufferGeometry {
  return createCityMesh(`${form}Canopy`);
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
