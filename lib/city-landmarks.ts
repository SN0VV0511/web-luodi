import * as THREE from "three";
import { getBuildingExperience, clampChapter, type LandmarkKind } from "./building-experience";
import type { PlaceId } from "./city-content";
import type { CityLot } from "./city-map";
import { LandmarkKit } from "./landmark-kit";
import { buildLandmarkDetails } from "./landmark-details";
import { buildExchange, buildPages, buildCore, buildWorkshop, buildCinema, buildObservatory, buildPost, type LandmarkBuilder, type LandmarkPose } from "./landmark-builders";
import { buildCourtyard, buildFold, buildOrrery, buildGreenhouse } from "./landmark-reserves";

type Rig = {
  lot: CityLot;
  root: THREE.Group;
  pose: { open: number; detail: number; feature: number; time: number };
  update: (pose: LandmarkPose) => void;
};
export type CityLandmarks = {
  group: THREE.Group;
  pickables: THREE.Object3D[];
  anchors: Map<PlaceId, THREE.Vector3>;
  animate: (dt: number, time: number, selected: PlaceId | null, chapter: number, instant: boolean) => boolean;
  replay: (id: PlaceId) => void;
  dispose: () => void;
};

const builders: Record<LandmarkKind, LandmarkBuilder> = {
  exchange: buildExchange, pages: buildPages, core: buildCore, workshop: buildWorkshop,
  cinema: buildCinema, observatory: buildObservatory, post: buildPost,
  courtyard: buildCourtyard, fold: buildFold, orrery: buildOrrery, greenhouse: buildGreenhouse,
};
const signHeights: Record<LandmarkKind, number> = {
  exchange: .25, pages: .97, core: .12, workshop: .78, cinema: .73,
  observatory: .55, post: .64, courtyard: .94, fold: .97, orrery: .59, greenhouse: .74,
};

/** 计算可中断、帧率无关的机构收敛；减少动态和暂停时直接呈现用户选择的终态。 */
export function approachMechanism(value: number, target: number, dt: number, instant = false): number {
  if (instant || Math.abs(value - target) < .001) return target;
  const elapsed = Number.isFinite(dt) ? Math.max(0, Math.min(.1, dt)) : 0;
  return THREE.MathUtils.lerp(value, target, 1 - Math.exp(-elapsed * 5.5));
}

/** 创建除手稿馆外的十一栋独立地标，静态细节跨楼实例化，活动机构保留层级。 */
export function buildCityLandmarks(lots: readonly CityLot[]): CityLandmarks {
  const kit = new LandmarkKit();
  const rigs: Rig[] = [];
  const anchors = new Map<PlaceId, THREE.Vector3>();
  try {
    for (const lot of lots) {
      const experience = getBuildingExperience(lot.id);
      if (!experience) continue;
      const root = kit.root(lot);
      kit.foundation(root, lot);
      const update = builders[experience.kind](kit, root, lot);
      buildLandmarkDetails(kit, root, lot, experience.kind);
      const signZ = lot.depth * (experience.kind === "cinema" ? .63 : .49);
      kit.sign(root, lot, experience.subtitle, [0, lot.height * signHeights[experience.kind], signZ], Math.min(12, lot.width * .62));
      const pose = { open: 0, detail: 0, feature: 0, time: 0 };
      update(pose);
      rigs.push({ lot, root, pose, update });
      anchors.set(lot.id, new THREE.Vector3(lot.x, lot.height + 8, lot.z));
    }
    kit.finish();
  } catch (error) {
    kit.dispose();
    throw error;
  }
  return {
    group: kit.group,
    pickables: kit.pickables,
    anchors,
    animate(dt, time, selected, chapter, instant) {
      const index = clampChapter(chapter);
      let transitioning = false;
      for (const rig of rigs) {
        const active = rig.lot.id === selected;
        const targets = { open: Number(active), detail: Number(active && index >= 1), feature: Number(active && index === 2) };
        let changed = false;
        for (const key of ["open", "detail", "feature"] as const) {
          const next = approachMechanism(rig.pose[key], targets[key], dt, instant);
          if (next !== rig.pose[key]) changed = true;
          rig.pose[key] = next;
          if (next !== targets[key]) transitioning = true;
        }
        // 未选中的建筑完全静止；离屏暂停后的世界时间也不会发生跳跃。
        if (active && rig.pose.time !== time) { rig.pose.time = time; changed = true; }
        if (changed) rig.update(rig.pose);
        const live = active || rig.pose.open > 0;
        rig.root.visible = live;
        kit.setLive(rig.lot.id, live);
        rig.root.userData.open = rig.pose.open;
        rig.root.userData.chapter = active ? index : -1;
      }
      return transitioning;
    },
    replay(id) {
      const rig = rigs.find((item) => item.lot.id === id);
      if (!rig) return;
      rig.pose.open = 0;
      rig.pose.detail = 0;
      rig.pose.feature = 0;
      rig.update(rig.pose);
    },
    dispose: () => kit.dispose(),
  };
}

/**
 * 将地块相对镜头转换为世界坐标，并给桌面右侧导览、手机底部导览预留可视空间。
 * 返回新向量，不改变任何共享配置或当前相机。
 */
export function landmarkCamera(lot: CityLot, chapter: number, width: number, height: number): { position: THREE.Vector3; target: THREE.Vector3 } {
  const experience = getBuildingExperience(lot.id);
  if (!experience) throw new Error(`楼位 ${lot.id} 没有空间镜头配置`);
  const frame = experience.chapters[clampChapter(chapter)];
  const vw = Math.max(320, Number.isFinite(width) ? width : 320);
  const vh = Math.max(320, Number.isFinite(height) ? height : 320);
  const mobile = vw <= 760;
  const landscape = mobile && vh < 560;
  const panelWidth = mobile ? (landscape ? vw * .43 : 0) : 396;
  const availableHeight = mobile && !landscape ? Math.max(vh * .4, vh - 360) : vh - 160;
  const availableWidth = Math.max(180, vw - panelWidth - 48);
  const halfFov = THREE.MathUtils.degToRad(43 / 2);
  const span = lot.width * frame.span;
  const distance = span / (2 * Math.tan(halfFov)) * Math.max(vh / Math.max(180, availableHeight), vh / availableWidth);
  const target = new THREE.Vector3(lot.x + frame.target[0] * lot.width, frame.target[1] * lot.height, lot.z + frame.target[2] * lot.depth);
  const direction = new THREE.Vector3(...frame.direction);
  // 窄屏需要更远的取景距离，改用近正面略俯视，避开街区前排建筑与海岸广告牌。
  if (mobile && !landscape) {
    direction.x *= .25;
    direction.y = Math.max(clampChapter(chapter) === 1 ? .36 : .52, direction.y);
  }
  direction.normalize();
  const right = new THREE.Vector3(direction.z, 0, -direction.x).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  target.addScaledVector(right, distance * Math.tan(halfFov) * panelWidth / vh);
  if (mobile && !landscape) target.addScaledVector(up, -distance * Math.tan(halfFov) * Math.min(.38, 270 / vh));
  return { position: target.clone().addScaledVector(direction, distance), target };
}
