import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  createBackpack, createCalf, createCap, createForearm, createHair, createHand, createHead,
  createNeck, createPelvis, createShoe, createThigh, createTorso, createUpperArm,
} from "./city-figure";

const parts = {
  head: createHead, neck: createNeck, torso: createTorso, pelvis: createPelvis, backpack: createBackpack,
  upperArm: createUpperArm, forearm: createForearm, hand: createHand,
  thigh: createThigh, calf: createCalf, shoe: createShoe,
  hair: createHair, cap: createCap,
};

describe("居民部件", () => {
  it.each(Object.entries(parts))("%s 的顶点和单位法线有效，重复创建相互独立", (_name, create) => {
    const geometry = create();
    const copy = create();
    try {
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      expect(position.count).toBeGreaterThan(20);
      expect(normal.count).toBe(position.count);
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      // 球面接缝会保留未被索引引用的极点，只检查实际参与绘制的顶点。
      const used = geometry.index ? new Set(geometry.index.array) : Array.from({ length: normal.count }, (_, index) => index);
      for (const index of used) {
        expect(Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index))).toBeCloseTo(1, 5);
      }
      expect(copy).not.toBe(geometry);
      expect(copy.getAttribute("position").array).not.toBe(position.array);
      expect(copy.getAttribute("position").array).toEqual(position.array);
    } finally {
      geometry.dispose();
      copy.dispose();
    }
  });

  it("低面数头部确实采样出双眼与嘴唇，而不是仅声明未命中的特征区间", () => {
    const head = createHead();
    try {
      const position = head.getAttribute("position");
      const color = head.getAttribute("color");
      const eyes: THREE.Vector3[] = [];
      const lips: THREE.Vector3[] = [];
      for (let index = 0; index < position.count; index++) {
        const point = new THREE.Vector3().fromBufferAttribute(position, index);
        if (color.getX(index) < 0.3) eyes.push(point);
        if (color.getX(index) === 1 && color.getY(index) < 0.8) lips.push(point);
      }
      expect(eyes.some((point) => point.x < 0 && point.z > 0)).toBe(true);
      expect(eyes.some((point) => point.x > 0 && point.z > 0)).toBe(true);
      expect(lips.some((point) => point.y < 0 && point.z > 0)).toBe(true);
      // 保持原有网格预算，面部修正不能依赖增加所有居民的面数。
      expect(position.count).toBeLessThanOrEqual(475);
    } finally {
      head.dispose();
    }
  });
});
