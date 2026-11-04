import * as THREE from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cityBuildings } from "./city-content";
import { cityLots } from "./city-map";
import { buildingExperiences, clampChapter, getBuildingExperience } from "./building-experience";
import { approachMechanism, buildCityLandmarks, landmarkCamera, type CityLandmarks } from "./city-landmarks";

let landmarks: CityLandmarks | undefined;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(), fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  landmarks?.dispose();
  landmarks = undefined;
  vi.restoreAllMocks();
});

describe("建筑体验配置与机构", () => {
  it("十一栋楼都有不同的主题和三段空间体验，08 继续使用原电梯", () => {
    const entries = Object.entries(buildingExperiences);
    expect(entries).toHaveLength(11);
    expect(new Set(entries.map(([, value]) => value?.kind)).size).toBe(11);
    expect(getBuildingExperience("slot-8")).toBeUndefined();
    expect(getBuildingExperience(null)).toBeUndefined();
    for (const place of cityBuildings.filter((place) => place.id !== "slot-8")) {
      const experience = getBuildingExperience(place.id)!;
      expect(experience.chapters).toHaveLength(3);
      expect(new Set(experience.chapters.map((chapter) => chapter.label.zh)).size).toBe(3);
      for (const chapter of experience.chapters) {
        expect([...chapter.target, ...chapter.direction, chapter.span].every(Number.isFinite)).toBe(true);
        expect(chapter.description.zh.length).toBeGreaterThan(10);
        expect(chapter.description.en.length).toBeGreaterThan(10);
      }
    }
  });

  it("不合法章节与负时间不会让机构越界，减少动态直接到终态", () => {
    expect([NaN, Infinity, -1, 0, 1.2, 2, 300].map(clampChapter)).toEqual([0, 0, 0, 0, 1, 2, 2]);
    expect(approachMechanism(.2, 1, -1)).toBe(.2);
    expect(approachMechanism(.2, 1, NaN)).toBe(.2);
    expect(approachMechanism(.2, 1, .016, true)).toBe(1);
    expect(approachMechanism(.9999, 1, .016)).toBe(1);
    const slow = approachMechanism(0, 1, 1 / 30);
    const fast = approachMechanism(approachMechanism(0, 1, 1 / 60), 1, 1 / 60);
    expect(slow).toBeCloseTo(fast, 10);
  });

  it("构件合批、拾取归属与坐标均有效，静态细节不按每颗铆钉绘制", () => {
    landmarks = buildCityLandmarks(cityLots);
    expect(landmarks.anchors.size).toBe(11);
    expect(landmarks.group.userData.instances).toBeGreaterThan(2000);
    let visibleBatches = 0;
    landmarks.group.traverseVisible((object) => { if (object instanceof THREE.InstancedMesh) visibleBatches++; });
    expect(visibleBatches).toBeLessThan(40);
    let instancedCount = 0;
    landmarks.group.traverse((object) => {
      if (!(object instanceof THREE.InstancedMesh)) return;
      instancedCount++;
      expect(object.instanceColor).not.toBeNull();
      expect([...object.instanceMatrix.array].every(Number.isFinite)).toBe(true);
      expect(object.userData.places).toHaveLength(object.count);
      expect(object.userData.places.every((id: string) => id !== "slot-8" && id in buildingExperiences)).toBe(true);
      expect(object.boundingSphere?.radius).toBeGreaterThan(0);
    });
    expect(instancedCount).toBe(landmarks.group.userData.batches);
    expect(landmarks.pickables.length).toBeGreaterThan(11);
  });

  it("总览使用关闭态批次，进入与退出只替换当前楼位，其他楼位矩阵不变", () => {
    landmarks = buildCityLandmarks(cityLots);
    const proxy = landmarks.group.children.find((object): object is THREE.InstancedMesh => object instanceof THREE.InstancedMesh && object.name === "RestingLandmarkMechanisms" && object.userData.places.includes("quant"))!;
    const index = proxy.userData.places.indexOf("quant") as number;
    const original = new THREE.Matrix4();
    proxy.getMatrixAt(index, original);
    const root = landmarks.group.getObjectByName("Landmark_quant")!;
    expect(root.visible).toBe(false);
    landmarks.animate(.016, 1, "quant", 0, true);
    expect(root.visible).toBe(true);
    const hidden = new THREE.Matrix4();
    proxy.getMatrixAt(index, hidden);
    expect(hidden.determinant()).toBe(0);
    let visibleBatches = 0;
    landmarks.group.traverseVisible((object) => { if (object instanceof THREE.InstancedMesh) visibleBatches++; });
    expect(visibleBatches).toBeLessThan(65);
    landmarks.animate(.016, 1, null, 0, true);
    proxy.getMatrixAt(index, hidden);
    expect(hidden).toEqual(original);
    expect(root.visible).toBe(false);
  });

  it("每栋楼都可开启、切换、重播、关闭，快速切换不遗留展开机构", () => {
    landmarks = buildCityLandmarks(cityLots);
    for (const lot of cityLots.filter((lot) => getBuildingExperience(lot.id))) {
      const root = landmarks.group.getObjectByName(`Landmark_${lot.id}`)!;
      expect(landmarks.animate(.016, 0, lot.id, 2, true)).toBe(false);
      expect(root.userData.open).toBe(1);
      expect(root.userData.chapter).toBe(2);
      landmarks.group.updateMatrixWorld(true);
      const open = new THREE.Matrix4().copy(root.children[0]?.matrixWorld ?? root.matrixWorld);
      landmarks.animate(.016, 0, lot.id, 2, true);
      expect(root.children[0]?.matrixWorld ?? root.matrixWorld).toEqual(open);
      landmarks.replay(lot.id);
      expect(landmarks.animate(.016, 0, lot.id, 0, false)).toBe(true);
      expect(root.userData.open).toBeLessThan(1);
      landmarks.animate(.016, 0, null, 0, true);
      expect(root.userData.open).toBe(0);
      expect(root.userData.chapter).toBe(-1);
    }
    expect(() => landmarks!.replay("slot-8")).not.toThrow();
  });

  it("暂停时世界时间不变，活动机构不漂移；未选中的楼始终保持静止", () => {
    landmarks = buildCityLandmarks(cityLots);
    landmarks.animate(.016, 10, "openclaw", 1, true);
    const robot = landmarks.group.getObjectByName("robot-shoulder")!;
    const first = robot.rotation.toArray();
    landmarks.animate(.016, 10, "openclaw", 1, true);
    expect(robot.rotation.toArray()).toEqual(first);
    landmarks.animate(.016, 11, "openclaw", 1, true);
    expect(robot.rotation.toArray()).not.toEqual(first);
    landmarks.animate(.016, 11, "affine", 0, true);
    const closed = robot.rotation.toArray();
    landmarks.animate(.016, 20, "affine", 0, true);
    expect(robot.rotation.toArray()).toEqual(closed);
  });

  it("桌面、手机、横屏与零尺寸的镜头均保持有效，不改变地块或配置", () => {
    for (const lot of cityLots.filter((lot) => getBuildingExperience(lot.id))) {
      for (const [width, height] of [[1440, 900], [390, 844], [740, 390], [0, 0]]) {
        for (const chapter of [0, 1, 2, -1, NaN]) {
          const pose = landmarkCamera(lot, chapter, width, height);
          expect([...pose.position.toArray(), ...pose.target.toArray()].every(Number.isFinite)).toBe(true);
          expect(pose.position.distanceTo(pose.target)).toBeGreaterThan(10);
          expect(pose.position.y).toBeGreaterThan(0);
        }
      }
    }
    expect(() => landmarkCamera(cityLots[7], 0, 1440, 900)).toThrow("没有空间镜头配置");
  });

  it("卸载释放共享几何、材质、纹理和实例缓冲，重复释放安全", () => {
    landmarks = buildCityLandmarks(cityLots);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const instances: THREE.InstancedMesh[] = [];
    landmarks.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const list = Array.isArray(object.material) ? object.material : [object.material];
      list.forEach((material) => {
        materials.add(material);
        if (material instanceof THREE.MeshBasicMaterial && material.map) textures.add(material.map);
      });
      if (object instanceof THREE.InstancedMesh) instances.push(object);
    });
    const spies = [...geometries, ...materials, ...textures, ...instances].map((resource) => vi.spyOn(resource, "dispose"));
    landmarks.dispose();
    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
    expect(landmarks.pickables).toHaveLength(0);
    expect(landmarks.group.children).toHaveLength(0);
    expect(() => landmarks!.dispose()).not.toThrow();
    spies.forEach((spy) => expect(spy).toHaveBeenCalledTimes(1));
  });

  it("纹理上下文不可用时明确失败，不留下半初始化的模型", () => {
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    const dispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    expect(() => buildCityLandmarks(cityLots)).toThrow("建筑标牌纹理");
    expect(dispose).toHaveBeenCalled();
  });
});
