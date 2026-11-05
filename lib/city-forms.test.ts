import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { createTreeCanopy, createTreeTrunk, createVehicleShell, createVehicleWheel, paintLeafCluster, type VehicleKind } from "./city-forms";

const kinds: VehicleKind[] = ["sedan", "suv", "bus", "truck"];

it("车壳有车窗、轮位和低于车顶的车头，树是分枝加叶片而不是锥体", () => {
  for (const kind of kinds) {
    const shell = createVehicleShell(kind);
    const body = shell.body.getAttribute("position");
    const glass = shell.glass.getAttribute("position");
    expect(body.count).toBeGreaterThan(80);
    expect(glass.count).toBeGreaterThan(30);
    expect(shell.wheels).toHaveLength(4);
    if (kind === "sedan" || kind === "suv") {
      let noseY = 0;
      let midY = 0;
      for (let index = 0; index < body.count; index++) {
        const y = body.getY(index);
        const z = body.getZ(index);
        if (z > shell.length * 0.38) noseY = Math.max(noseY, y);
        if (Math.abs(z) < shell.length * 0.08) midY = Math.max(midY, y);
      }
      expect(midY).toBeGreaterThan(noseY + 0.35);
    }
    shell.body.dispose();
    shell.glass.dispose();
    shell.trim.dispose();
    shell.chrome.dispose();
  }
  const trunk = createTreeTrunk();
  const canopy = createTreeCanopy();
  const crown = canopy.getAttribute("position");
  let minY = Infinity;
  let maxY = 0;
  let span = 0;
  for (let index = 0; index < crown.count; index++) {
    minY = Math.min(minY, crown.getY(index));
    maxY = Math.max(maxY, crown.getY(index));
    span = Math.max(span, Math.hypot(crown.getX(index), crown.getZ(index)));
  }
  expect(maxY - minY).toBeLessThan(span * 2.2);
  expect(trunk.getAttribute("position").count).toBeGreaterThan(40);
  trunk.dispose();
  canopy.dispose();
});

it.each(kinds)("%s 的玻璃与车身共用接缝位置，封闭车壳没有边界裂缝", (kind) => {
  const shell = createVehicleShell(kind);
  try {
    const edges = new Map<string, number>();
    for (const geometry of [shell.body, shell.glass, shell.trim]) {
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      expect(normal.count).toBe(position.count);
      expect(position.count % 3).toBe(0);
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      for (let index = 0; index < normal.count; index++) {
        expect(Math.hypot(normal.getX(index), normal.getY(index), normal.getZ(index))).toBeCloseTo(1, 5);
      }
      for (let index = 0; index < position.count; index += 3) {
        const vertices = [0, 1, 2].map((offset) => [
          position.getX(index + offset), position.getY(index + offset), position.getZ(index + offset),
        ].map((value) => Math.round(value * 100_000)).join(","));
        for (let edge = 0; edge < 3; edge++) {
          const key = [vertices[edge], vertices[(edge + 1) % 3]].sort().join("|");
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
    }
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
    expect(shell.wheels.every((wheel) => Math.abs(wheel.z) < shell.length / 2)).toBe(true);
    expect(shell.lamps.filter((lamp) => lamp.tail)).toHaveLength(2);
    expect(shell.lamps.filter((lamp) => !lamp.tail)).toHaveLength(2);
  } finally {
    shell.body.dispose();
    shell.glass.dispose();
    shell.trim.dispose();
    shell.chrome.dispose();
  }
});

it.each([
  ["树干", createTreeTrunk, 27],
  ["树冠", createTreeCanopy, 128],
] as const)("%s 合并完成后释放临时几何体，保留返回值的所有权", (_name, create, count) => {
  const dispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
  const geometry = create();
  try {
    expect(dispose).toHaveBeenCalledTimes(count);
    expect(dispose.mock.instances).not.toContain(geometry);
  } finally {
    dispose.mockRestore();
    geometry.dispose();
  }
});

it.each(["无", "叶片", "遮罩"] as const)("叶簇覆盖整张叶卡，绘制失败仍恢复全部画布状态（失败位置=%s）", (failure) => {
  const states: GlobalCompositeOperation[] = [];
  const ctx = {
    canvas: { width: 512 },
    globalCompositeOperation: "multiply" as GlobalCompositeOperation,
    save: vi.fn(() => { states.push(ctx.globalCompositeOperation); }),
    restore: vi.fn(() => { ctx.globalCompositeOperation = states.pop()!; }),
    clearRect: vi.fn(), translate: vi.fn(), rotate: vi.fn(), beginPath: vi.fn(),
    moveTo: vi.fn(), bezierCurveTo: vi.fn(), fill: vi.fn(), lineTo: vi.fn(),
    stroke: vi.fn(), fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => {
      if (failure === "叶片") throw new Error("叶片渐变创建失败");
      return { addColorStop: vi.fn() };
    }),
    createRadialGradient: vi.fn(() => {
      if (failure === "遮罩") throw new Error("遮罩渐变创建失败");
      return { addColorStop: vi.fn() };
    }),
  };
  const draw = (): void => paintLeafCluster(ctx as unknown as CanvasRenderingContext2D);
  if (failure === "无") expect(draw).not.toThrow();
  else expect(draw).toThrow("渐变创建失败");
  expect(ctx.globalCompositeOperation).toBe("multiply");
  expect(states).toHaveLength(0);
  expect(ctx.save.mock.calls.length).toBe(ctx.restore.mock.calls.length);
  if (failure !== "叶片") {
    const xs = ctx.translate.mock.calls.map(([x]) => x as number);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(512 * 0.7);
    expect(ctx.fill.mock.calls.length).toBeGreaterThanOrEqual(64);
  }
});

it.each(kinds)("%s 有独立前风挡和金属细节，几何预算不会随实例数重复生成", (kind) => {
  const shell = createVehicleShell(kind);
  try {
    const glass = shell.glass.getAttribute("position");
    const front = Array.from({ length: glass.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(glass, index))
      .filter((point) => Math.abs(point.x) < 0.1 && point.z > shell.length * 0.05);
    expect(front.length).toBeGreaterThan(0);
    expect(shell.chrome.getAttribute("position").count).toBeGreaterThan(100);
    const triangles = [shell.body, shell.glass, shell.trim, shell.chrome].reduce((sum, geometry) => sum + geometry.getAttribute("position").count / 3, 0);
    expect(triangles).toBeLessThan(3200);
    if (kind === "sedan" || kind === "suv") {
      const body = shell.body.getAttribute("position");
      const roof = Array.from({ length: body.count }, (_, index) => new THREE.Vector3().fromBufferAttribute(body, index))
        .filter((point) => point.y > shell.height - 0.05);
      expect(Math.max(...roof.map((point) => Math.abs(point.x)))).toBeGreaterThan(0.55);
    }
  } finally {
    [shell.body, shell.glass, shell.trim, shell.chrome].forEach((geometry) => geometry.dispose());
  }
});

it.each(["spreading", "upright"] as const)("%s 乔木有立体枝叶，冠缘和枝干在米制尺寸与网格预算内", (form) => {
  const stem = createTreeTrunk(form), crown = createTreeCanopy(form);
  try {
    let triangles = 0;
    for (const geometry of [stem, crown]) {
      const position = geometry.getAttribute("position");
      const normal = geometry.getAttribute("normal");
      expect(Array.from(position.array).every(Number.isFinite)).toBe(true);
      expect(Array.from(normal.array).every(Number.isFinite)).toBe(true);
      triangles += (geometry.index?.count ?? position.count) / 3;
      geometry.computeBoundingBox();
    }
    expect(triangles).toBeLessThan(1400);
    expect(stem.boundingBox!.min.y).toBeGreaterThan(-0.3);
    expect(crown.boundingBox!.max.y).toBeGreaterThan(6);
    expect(crown.boundingBox!.getSize(new THREE.Vector3()).x).toBeGreaterThan(3.8);
    expect(crown.getAttribute("color").count).toBe(crown.getAttribute("position").count);
  } finally {
    stem.dispose();
    crown.dispose();
  }
});

it("轮胎有完整侧壁，五辐轮毂填补圆环中心，单位半径与网格预算稳定", () => {
  const wheel = createVehicleWheel();
  try {
    for (const geometry of [wheel.tire, wheel.rim]) {
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.getSize(new THREE.Vector3()).y).toBeLessThan(0.8);
      expect(Array.from(geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    }
    expect(wheel.tire.boundingBox!.max.x).toBeCloseTo(1);
    expect(wheel.tire.boundingBox!.min.x).toBeCloseTo(-1);
    expect(wheel.rim.getAttribute("position").count).toBeGreaterThan(500);
    expect((wheel.tire.index!.count + wheel.rim.getAttribute("position").count) / 3).toBeLessThan(850);
  } finally {
    wheel.tire.dispose();
    wheel.rim.dispose();
  }
});
