import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ServiceVehicle, type ServiceKind } from "../vehicles/service-fleet";
import { canLoadCityAssets, loadCarModelsOnce } from "../../vehicles/car-models";
import { appearanceFor, gaitPose, sitPose, standPose, type PoseSpec } from "../people/pose-rig";
import type { SceneStage } from "./props";
import { mat } from "./props";
import { shorePoint } from "./lake-life";
import type { Appearance } from "../../life/types";
import { publishEventObstacles, type EventObstacle } from "../../traffic/event-obstacles";
import { pickDeliverySite, pickPoliceStopSite, pickTaxiSite } from "../../../city-event-sites";

/**
 * 城市随机事件导演：一组错峰的循环剧本（快递卸货、交警拦停、出租车接客、餐车排队、集市、
 * 婚礼 / 夜间音乐会、湖畔慢跑遛狗、太极晨练、孩子踢球、塔吊施工、外卖电动车、鸽群海鸥），
 * 保证任意时刻都有多个事件在发生。所有剧本由时间确定性推导，可任意跳转时间。
 */
const ROAD_Y = 0.42, WALK_Y = 0.5, LAWN_Y = 0.42;
const fract = (x: number) => x - Math.floor(x);
const hash = (n: number) => fract(Math.sin(n * 78.233 + 12.9898) * 43758.5453);
const ease = (k: number) => { const c = THREE.MathUtils.clamp(k, 0, 1); return c * c * (3 - 2 * c); };
const seg = (t: number, a: number, b: number) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
const lerp = THREE.MathUtils.lerp;

type Vec2 = [number, number];
/** 折线路径采样（闭合或往返），返回位置与朝向。 */
function along(points: readonly Vec2[], distance: number, closed = true): { x: number; z: number; heading: number } {
  const n = points.length;
  const segs = closed ? n : n - 1;
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i < segs; i++) { const a = points[i], b = points[(i + 1) % n]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); lens.push(l); total += l; }
  let d = closed ? ((distance % total) + total) % total : THREE.MathUtils.clamp(distance, 0, total - 1e-4);
  for (let i = 0; i < segs; i++) {
    if (d <= lens[i]) {
      const a = points[i], b = points[(i + 1) % n], k = d / lens[i];
      return { x: lerp(a[0], b[0], k), z: lerp(a[1], b[1], k), heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
    }
    d -= lens[i];
  }
  return { x: points[0][0], z: points[0][1], heading: 0 };
}
const pathLength = (points: readonly Vec2[], closed = true) => { let t = 0; for (let i = 0; i < (closed ? points.length : points.length - 1); i++) { const a = points[i], b = points[(i + 1) % points.length]; t += Math.hypot(b[0] - a[0], b[1] - a[1]); } return t; };

/** 把车辆局部坐标 (lx 右, lz 前) 变换到世界。 */
const local = (x: number, z: number, heading: number, lx: number, lz: number): Vec2 => [x + Math.cos(heading) * lx + Math.sin(heading) * lz, z - Math.sin(heading) * lx + Math.cos(heading) * lz];

export function buildStreetEvents(stage: SceneStage) {
  const vehicles: ServiceVehicle[] = [];
  const vehicle = (kind: ServiceKind, color?: string) => {
    const v = new ServiceVehicle(kind, color);
    v.track(stage);
    stage.group.add(v.group);
    vehicles.push(v);
    return v;
  };
  // 本帧事件占用：交通据此绕行 / 减速 / 排队，行人据此绕开。
  const occupied: EventObstacle[] = [];
  const occupy = (x: number, z: number, radius: number, slow?: number, zone = false) => { occupied.push({ x, z, radius, slow, zone }); };
  /** 车辆沿车身中线放 3 个圆（车头 / 中 / 车尾），比单个大圆更贴合狭长车体。 */
  const occupyVehicle = (v: ServiceVehicle, slow?: number) => {
    if (!v.group.visible) return;
    const { x, z } = v.group.position, h = v.group.rotation.y;
    const half = v.shell.length * 0.5 - v.shell.width * 0.5;
    for (const k of [-1, 0, 1]) occupy(x + Math.sin(h) * half * k, z + Math.cos(h) * half * k, v.shell.width * 0.5, slow);
  };
  const deliveryTruck = vehicle("boxtruck", "#2f5f8f");
  const policeStop = vehicle("police");
  const stoppedCar = vehicle("civilian", "#8c1c22");
  const taxi = vehicle("taxi", "#f2c12e");
  const foodTruck = vehicle("foodtruck", "#d9c27a");
  if (canLoadCityAssets()) loadCarModelsOnce().then((m) => { policeStop.upgrade(m.sedan); stoppedCar.upgrade(m.sedan); taxi.upgrade(m.sedan); }).catch(() => undefined);

  const unit = stage.geometry(new THREE.BoxGeometry(1, 1, 1));
  const cyl = stage.geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  const sphere = stage.geometry(new THREE.SphereGeometry(1, 10, 8));
  const cone = stage.geometry(new THREE.ConeGeometry(1, 1, 4, 1, true));
  const parcels = stage.pool("v3 events parcels", unit, stage.material(mat("#c49a64", 0.85)), 48);
  const darkPool = stage.pool("v3 events openings", unit, stage.material(mat("#15181b", 0.9)), 8, false);
  const props = stage.pool("v3 events props", unit, stage.material(mat("#ffffff", 0.7)), 220);
  const rods = stage.pool("v3 events poles", cyl, stage.material(mat("#ffffff", 0.5, 0.3)), 160);
  const balls = stage.pool("v3 events balls", sphere, stage.material(mat("#ffffff", 0.5)), 90);
  const tents = stage.pool("v3 events tent roofs", stage.geometry(new THREE.ConeGeometry(1, 1, 4, 1, false).rotateY(Math.PI / 4)), stage.material(mat("#ffffff", 0.8, 0, { side: THREE.DoubleSide })), 12);
  const glow = stage.material(mat("#ffffff", 0.4, 0, { emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.4 }));
  const lights = stage.pool("v3 events lights", sphere, glow, 40, false);
  const beamMat = stage.material(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const beams = stage.pool("v3 events stage beams", stage.geometry(new THREE.ConeGeometry(1, 1, 16, 1, true).translate(0, -0.5, 0)), beamMat, 8, false);
  void cone;

  // ---------- 鸟 ----------
  const wingGeo = stage.geometry((() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0.12, 0.5, 0, -0.02, 0, 0, -0.14, 0, 0, 0.12, 0, 0, -0.14, 0.5, 0, -0.02], 3));
    g.computeVertexNormals();
    return g;
  })());
  const birdMat = stage.material(mat("#6d6f73", 0.8, 0, { side: THREE.DoubleSide }));
  const wingL = stage.pool("v3 birds wing L", wingGeo, birdMat, 60, false);
  const wingR = stage.pool("v3 birds wing R", wingGeo, birdMat, 60, false);
  const birdBody = stage.pool("v3 birds bodies", sphere, birdMat, 72, false);

  // ---------- 狗 ----------
  const dogBody = stage.pool("v3 dogs", sphere, stage.material(mat("#ffffff", 0.85)), 12);
  const dogLegs = stage.pool("v3 dog legs", cyl, stage.material(mat("#ffffff", 0.85)), 24);
  const leash = stage.pool("v3 leashes", cyl, stage.material(mat("#c0392b", 0.6)), 4, false);

  // ---------- 塔吊与在建楼 ----------
  const site = { x: 187.5, z: 42.5 - 7.4 };
  const craneMat = stage.material(mat("#e0b12b", 0.55, 0.35));
  {
    const lattice: THREE.BufferGeometry[] = [];
    const mastH = 40, m = 1.7;
    const bar = (a: THREE.Vector3, b: THREE.Vector3, r = 0.07) => {
      const d = new THREE.Vector3().subVectors(b, a); const l = d.length();
      const g = new THREE.BoxGeometry(r, l, r);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
      g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
      lattice.push(g);
    };
    const mx = site.x + 8, mz = site.z;
    for (const [cx, cz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) bar(new THREE.Vector3(mx + cx * m / 2, 0.5, mz + cz * m / 2), new THREE.Vector3(mx + cx * m / 2, mastH, mz + cz * m / 2), 0.16);
    for (let y = 0.5; y < mastH; y += 2) {
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      for (let i = 0; i < 4; i++) {
        const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
        bar(new THREE.Vector3(mx + ax * m / 2, y, mz + az * m / 2), new THREE.Vector3(mx + bx * m / 2, y, mz + bz * m / 2));
        bar(new THREE.Vector3(mx + ax * m / 2, y, mz + az * m / 2), new THREE.Vector3(mx + bx * m / 2, y + 2, mz + bz * m / 2));
      }
    }
    stage.static(new THREE.Mesh(mergeGeometries(lattice)!, craneMat));
    // 在建楼：柱网 + 楼板 + 安全网 + 围挡
    const concrete = stage.material(mat("#a9a7a0", 0.9));
    const frame: THREE.BufferGeometry[] = [];
    const floors = 5;
    for (let f = 0; f < floors; f++) {
      const y = 0.5 + f * 3.4;
      if (f > 0) frame.push(new THREE.BoxGeometry(f === floors - 1 ? 10 : 18, 0.3, 11).translate(site.x - 4 - (f === floors - 1 ? 4 : 0), y, site.z));
      if (f < floors - 1) for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) frame.push(new THREE.BoxGeometry(0.5, 3.4, 0.5).translate(site.x - 12.5 + i * 5.8, y + 1.7, site.z - 5 + j * 5));
    }
    frame.push(new THREE.BoxGeometry(5, 9, 5).translate(site.x - 4, 0.5 + 4.5 + 13.6 - 9 + 9, site.z)); // 核心筒
    stage.static(new THREE.Mesh(mergeGeometries(frame)!, concrete));
    const rebar: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 4; k++) rebar.push(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4).translate(site.x - 12.5 + i * 5.8 + (k % 2 - 0.5) * 0.3, 0.5 + 4 * 3.4 + 0.85, site.z - 5 + j * 5 + (k > 1 ? 0.15 : -0.15)));
    stage.static(new THREE.Mesh(mergeGeometries(rebar)!, stage.material(mat("#5b3f2e", 0.7, 0.4))));
    const net = new THREE.Mesh(new THREE.PlaneGeometry(18, 13.6), stage.material(mat("#2f7d4a", 0.9, 0, { transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false })));
    net.position.set(site.x - 4, 0.5 + 6.8, site.z + 5.8);
    stage.static(net, false);
    const fence = new THREE.Mesh(mergeGeometries([
      new THREE.BoxGeometry(28, 2.2, 0.08).translate(site.x, 1.6, site.z + 6.8), new THREE.BoxGeometry(28, 2.2, 0.08).translate(site.x, 1.6, site.z - 6.6),
      new THREE.BoxGeometry(0.08, 2.2, 13.4).translate(site.x - 14, 1.6, site.z), new THREE.BoxGeometry(0.08, 2.2, 13.4).translate(site.x + 14, 1.6, site.z),
    ])!, stage.material(mat("#2b6a8c", 0.6)));
    stage.static(fence);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(5.8, 2.6, 2.4).translate(site.x + 9, 1.8, site.z + 4.6), stage.material(mat("#e9e6dc", 0.6)));
    stage.static(cabin);
  }
  const slew = new THREE.Group();
  slew.position.set(site.x + 8, 40, site.z);
  {
    const jib: THREE.BufferGeometry[] = [];
    jib.push(new THREE.BoxGeometry(1.2, 1.2, 32).translate(0, 0.8, 11));
    jib.push(new THREE.BoxGeometry(1.2, 1.0, 11).translate(0, 0.6, -6.5));
    jib.push(new THREE.BoxGeometry(2.2, 2.0, 3).translate(0, 0.2, -10));      // 配重
    jib.push(new THREE.BoxGeometry(2.0, 2.0, 2.0).translate(1.2, -0.6, 0.6)); // 驾驶室
    jib.push(new THREE.CylinderGeometry(0.25, 0.4, 6, 4).translate(0, 4, 0));
    for (const z of [14, -8]) {
      const d = new THREE.Vector3(0, -3.2, z); const l = d.length();
      jib.push(new THREE.CylinderGeometry(0.05, 0.05, l, 4).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize())).translate(0, 7 - 1.6, z / 2));
    }
    const mesh = new THREE.Mesh(mergeGeometries(jib.map((g) => g.index ? g.toNonIndexed() : g))!, craneMat);
    mesh.castShadow = true;
    stage.geometry(mesh.geometry);
    slew.add(mesh);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6).translate(0, 7.2, 0), glow);
    slew.add(beacon);
  }
  stage.group.add(slew);

  // ---------- 人物外观 ----------
  const courier = (i: number): Appearance => ({ ...appearanceFor(1000 + i), coat: "#f2b705", shirt: "#f2b705", trousers: "#2b3442", hat: true, glasses: false, sleeveLength: 0.95, skirt: false, hairStyle: 0 });
  const officer: Appearance = { ...appearanceFor(1010), coat: "#1b2a4a", shirt: "#cfd8e3", trousers: "#1b2a4a", hat: true, glasses: false, skirt: false, hairStyle: 0, sleeveLength: 0.95 };
  const worker = (i: number): Appearance => ({ ...appearanceFor(1020 + i), coat: "#ff7a1a", shirt: "#ff7a1a", trousers: "#3a3f47", hat: true, glasses: false, skirt: false });
  const crowd = Array.from({ length: 60 }, (_, i) => appearanceFor(1100 + i));
  const bride: Appearance = { ...appearanceFor(1200), coat: "#fbfaf6", shirt: "#fbfaf6", trousers: "#fbfaf6", skirt: true, hairStyle: 3, coatLength: 0.95, shoes: "#fbfaf6", hat: false, glasses: false };
  const groom: Appearance = { ...appearanceFor(1201), coat: "#16181d", shirt: "#f5f5f5", trousers: "#16181d", skirt: false, hairStyle: 0, hat: false, glasses: false, coatLength: 0.5 };
  const runner = (i: number): Appearance => ({ ...appearanceFor(1300 + i), coat: ["#ff4d6d", "#4cc9f0", "#80ed99", "#f9c74f", "#b5179e"][i % 5], sleeveLength: 0.3, shorts: true, shoes: "#f4f4f4", hat: false, glasses: false });
  const elder = (i: number): Appearance => ({ ...appearanceFor(1400 + i), coat: i % 2 ? "#f1f1ec" : "#c0392b", trousers: "#2c2c2c", hair: "#d8d8d4", hat: false, glasses: i % 3 === 0 });
  const kid = (i: number, team: number): Appearance => ({ ...appearanceFor(1500 + i, true), coat: team ? "#1d4ed8" : "#dc2626", shirt: team ? "#1d4ed8" : "#dc2626", trousers: "#f1f1f1", shorts: true, sleeveLength: 0.3, hat: false, glasses: false });

  // 雨伞（下雨时行人撑伞）
  const umbrellaPool = stage.pool("v3 events umbrellas", stage.geometry(new THREE.ConeGeometry(0.55, 0.28, 10, 1, true)), stage.material(mat("#ffffff", 0.6, 0, { side: THREE.DoubleSide })), 40);
  const umbrellaColours = ["#1f3b73", "#c0392b", "#2d3436", "#f1c40f", "#16a085", "#8e44ad"];
  let rain = 0;
  /** 加一个人；下雨时步行者撑伞。 */
  const person = (spec: PoseSpec, look: Appearance, i: number, canUmbrella = true) => {
    const umbrella = canUmbrella && rain > 0.35 && hash(i * 3.1) < 0.8;
    if (umbrella) spec.right = { ...spec.right, upper: -1.0, lower: -2.4, armOut: 0.1 };
    const pose = stage.person(spec, look);
    if (pose && umbrella) {
      const h = pose.rightHand;
      rods.segment(new THREE.Vector3(h.x, h.y - 0.1, h.z), new THREE.Vector3(h.x, h.y + 0.75, h.z), 0.012, "#222222");
      umbrellaPool.add(h.x, h.y + 0.85, h.z, 0, 0, 0, 1, 1, 1, umbrellaColours[i % umbrellaColours.length]);
    }
    return pose;
  };

  // ======================================================================
  // 剧本
  // ======================================================================
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

  const animateDelivery = (t: number) => {
    const C = 72;
    const cycle = Math.floor(t / C), tau = t - cycle * C;
    const picked = pickDeliverySite(cycle);
    const s = { x: picked.x, z: picked.z, heading: picked.heading };
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    // 进站减速 → 停靠 → 出站
    const arrive = ease(seg(tau, 0, 7)), depart = seg(tau, 60, 68);
    const offset = -(1 - arrive) * 38 + depart * depart * 45;
    deliveryTruck.group.visible = tau < 68;
    const tx = s.x + fx * offset, tz = s.z + fz * offset;
    deliveryTruck.place(tx, ROAD_Y, tz, s.heading);
    deliveryTruck.flash(t, tau > 7 && tau < 60, false);
    const open = tau > 8 && tau < 58;
    const [rx, rz] = local(tx, tz, s.heading, 0, -3.55 - 0.03);
    if (open) {
      darkPool.add(rx, ROAD_Y + 1.12 + 1.1, rz, s.heading, 0, 0, 2.1, 2.0, 0.02);
      // 车厢尾部堆叠的包裹
      for (let k = 0; k < 6; k++) { const [px, pz] = local(tx, tz, s.heading, -0.7 + (k % 3) * 0.55, -3.3); parcels.add(px, ROAD_Y + 1.32 + Math.floor(k / 3) * 0.42, pz, s.heading + k * 0.2, 0, 0, 0.48, 0.38, 0.4); }
      const [dx, dz] = local(tx, tz, s.heading, 0, -3.62);
      darkPool.add(dx, ROAD_Y + 3.1, dz, s.heading, 0, 0, 2.2, 0.35, 0.3); // 卷帘收卷箱
    }
    // 门口包裹堆
    const [ox, oz] = local(s.x, s.z, s.heading, 7.6, -4.5);
    const tripLen = 9;
    for (let c = 0; c < 2; c++) {
      const start = 9 + c * 4.5;
      const trips = tau < start ? 0 : Math.min(Math.floor((Math.min(tau, 56) - start) / tripLen), 5);
      const k = tau < start || tau > 56 ? -1 : ((tau - start) % tripLen) / tripLen;
      const [bx, bz] = local(tx, tz, s.heading, c ? 0.5 : -0.5, -4.3);
      const [gx, gz] = local(s.x, s.z, s.heading, 7.0, -4.5 + (c ? 0.9 : -0.9));
      let px: number, pz: number, heading: number, spec: PoseSpec; let carrying = false;
      if (tau < 7.5 || tau > 59) continue; // 在驾驶室
      if (k < 0) { // 下车 / 上车
        const [cx, cz] = local(tx, tz, s.heading, 1.6, 2.5);
        spec = standPose(cx, ROAD_Y, cz, s.heading + Math.PI / 2, t);
      } else if (k < 0.12) { px = bx; pz = bz; heading = s.heading; spec = standPose(px, ROAD_Y, pz, heading, t, { left: [-2.0, -2.2, 0.1], right: [-2.0, -2.2, 0.1] }); }
      else if (k < 0.5) { const q = (k - 0.12) / 0.38; px = lerp(bx, gx, q); pz = lerp(bz, gz, q); heading = Math.atan2(gx - bx, gz - bz); spec = gaitPose(px, ROAD_Y + (q > 0.6 ? 0.08 : 0), pz, heading, t * 7.5 + c, 0); spec.left = { ...spec.left, upper: -0.75, lower: -1.45, armOut: 0.15 }; spec.right = { ...spec.right, upper: -0.75, lower: -1.45, armOut: 0.15 }; carrying = true; }
      else if (k < 0.6) { px = gx; pz = gz; heading = Math.atan2(ox - gx, oz - gz); spec = standPose(px, WALK_Y, pz, heading, t); spec.hipsY = 0.6; spec.lean = 0.7; spec.left = { thigh: -1.3, shin: 0.4, upper: -1.0, lower: -1.1 }; spec.right = { ...spec.left }; }
      else { const q = (k - 0.6) / 0.4; px = lerp(gx, bx, q); pz = lerp(gz, bz, q); heading = Math.atan2(bx - gx, bz - gz); spec = gaitPose(px, ROAD_Y + (q < 0.4 ? 0.08 : 0), pz, heading, t * 7.5 + c, 0); }
      const pose = person(spec, courier(c), 900 + c, false);
      if (pose && (carrying || (k >= 0 && k < 0.12))) {
        tmpA.copy(pose.leftHand).add(pose.rightHand).multiplyScalar(0.5);
        parcels.add(tmpA.x, tmpA.y + 0.12, tmpA.z, spec.heading, 0, 0, 0.5, 0.36, 0.4);
      }
      // 已送达包裹堆在门口
      for (let p = 0; p < trips; p++) { const [px2, pz2] = local(ox, oz, s.heading, (c ? 0.55 : -0.55) + (p % 2) * 0.2, 0); parcels.add(px2, WALK_Y + 0.18 + Math.floor(p / 2) * 0.36, pz2 + (p % 2) * 0.1, s.heading + p, 0, 0, 0.5, 0.36, 0.4); }
    }
    // 手推车
    if (open) { const [hx, hz] = local(tx, tz, s.heading, 1.7, -3.2); props.add(hx, ROAD_Y + 0.08, hz, s.heading, 0, 0, 0.6, 0.06, 0.5, "#30343a"); rods.segment(new THREE.Vector3(...[hx, ROAD_Y, hz] as [number, number, number]).setY(ROAD_Y + 0.1), tmpB.set(hx, ROAD_Y + 1.2, hz), 0.025, "#30343a"); }
  };

  const animatePoliceStop = (t: number) => {
    const C = 84, tau = t % C;
    const cycle = Math.floor(t / C);
    const picked = pickPoliceStopSite(cycle);
    const x0 = picked.x, z = picked.z, heading = picked.heading;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const arrive = ease(seg(tau, 0, 8)), depart = seg(tau, 66, 76);
    const off = -(1 - arrive) * 40 + depart * depart * 55;
    const vis = tau < 76;
    const carX = x0 + fx * off, carZ = z + fz * off;
    const copTravel = off * (tau > 66 ? 0.9 : 1) - 7.2;
    const copX = x0 + fx * copTravel, copZ = z + fz * copTravel;
    stoppedCar.group.visible = policeStop.group.visible = vis;
    stoppedCar.place(carX, ROAD_Y, carZ, heading);
    policeStop.place(copX, ROAD_Y, copZ, heading);
    policeStop.flash(t, tau < 66, false);
    stoppedCar.flash(t, false);
    if (!vis) return;
    // 驾驶员（车内）
    const [dx, dz] = local(carX, carZ, heading, -0.38, 0.1);
    stage.person({ ...sitPose(dx, ROAD_Y + 0.12, dz, heading, 0.4), headYaw: tau > 14 && tau < 60 ? -0.8 : 0 }, crowd[3]);
    // 警察：下车 → 走到驾驶窗 → 开罚单 → 回车
    const doorL = local(x0 - fx * 7.2, z - fz * 7.2, heading, -1.3, 0.3), win = local(x0, z, heading, -1.45, 0.4);
    if (tau > 10 && tau < 62) {
      const go = seg(tau, 11, 16), back = seg(tau, 54, 60);
      const k = go - back;
      const px = lerp(doorL[0], win[0], k), pz = lerp(doorL[1], win[1], k);
      const walking = (tau > 11 && tau < 16) || (tau > 54 && tau < 60);
      const spec = walking ? gaitPose(px, ROAD_Y, pz, back > 0 ? heading + Math.PI : heading, t * 7, 0) : standPose(px, ROAD_Y, pz, heading + 0.9, t, { left: [-0.9, -1.7, 0.1], right: [-0.8, -1.9, 0.05] });
      occupy(px, pz, 0.45, 2.5);
      const pose = stage.person(spec, officer);
      if (pose && !walking) props.add(pose.leftHand.x, pose.leftHand.y + 0.05, pose.leftHand.z, heading + 0.9, -0.6, 0, 0.2, 0.02, 0.28, "#f4f1e8");
    } else if (tau <= 10 || tau >= 62) {
      // 坐在警车内
      const [px, pz] = local(copX, copZ, heading, -0.38, 0.1);
      stage.person(sitPose(px, ROAD_Y + 0.12, pz, heading, 0.4), officer);
    }
    // 三角警示牌
    if (tau > 16 && tau < 64) { const [cx, cz] = local(x0 - fx * 7.2, z - fz * 7.2, heading, 0, -6); occupy(cx, cz, 0.4, 3); props.add(cx, ROAD_Y + 0.25, cz, heading, 0, 0, 0.5, 0.45, 0.04, "#e74c3c"); }
  };

  const animateTaxi = (t: number) => {
    const C = 46, tau = t % C, cycle = Math.floor(t / C);
    const picked = pickTaxiSite(cycle);
    const s = { x: picked.x, z: picked.z, heading: picked.heading };
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const arrive = ease(seg(tau, 2, 10)), depart = seg(tau, 26, 34);
    const off = -(1 - arrive) * 40 + depart * depart * 50;
    taxi.group.visible = tau > 2 && tau < 34;
    taxi.place(s.x + fx * off, ROAD_Y, s.z + fz * off, s.heading);
    taxi.flash(t, false, false);
    // 乘客：招手 → 拖箱走向后门 → 上车
    const [wx, wz] = local(s.x, s.z, s.heading, 2.9, -0.6);
    const [ex, ez] = local(s.x, s.z, s.heading, 1.3, -0.5);
    const look = crowd[(cycle * 7) % crowd.length];
    let spec: PoseSpec | null = null;
    if (tau < 11) spec = standPose(wx, WALK_Y, wz, s.heading - Math.PI / 2, t, tau > 3 ? { right: [-2.6 + Math.sin(t * 8) * 0.25, -2.9, 0.3] } : {});
    else if (tau < 16) { const k = seg(tau, 11, 16); spec = gaitPose(lerp(wx, ex, k), lerp(WALK_Y, ROAD_Y, k), lerp(wz, ez, k), s.heading - Math.PI / 2 - 0.4, t * 6, 0); }
    else if (tau < 19) spec = standPose(ex, ROAD_Y, ez, s.heading - Math.PI / 2, t);
    if (spec) {
      const pose = person(spec, look, 700 + cycle, false);
      if (pose) { const h = pose.leftHand; props.add(h.x, ROAD_Y + 0.38, h.z, spec.heading, 0, 0, 0.42, 0.62, 0.24, "#34495e"); }
    }
  };

  // 餐车 + 排队 + 野餐桌
  const truckX = 30, truckZ = 95 - 4.2, truckH = Math.PI / 2;
  const animateFoodTruck = (t: number, night: boolean) => {
    foodTruck.place(truckX, ROAD_Y, truckZ, truckH);
    foodTruck.flash(t, false, night);
    // 侧面出餐口（朝公园一侧 = 车辆右侧 +x）
    const [hx, hz] = local(truckX, truckZ, truckH, 1.19, -1.2);
    darkPool.add(hx, ROAD_Y + 2.15, hz, truckH + Math.PI / 2, 0, 0, 2.6, 1.0, 0.02);
    const [ax, az] = local(truckX, truckZ, truckH, 1.75, -1.2);
    props.add(ax, ROAD_Y + 2.78, az, truckH, 0, 0.5, 1.3, 0.05, 2.9, "#e8a33c"); // 遮阳翻板
    const [cx, cz] = local(truckX, truckZ, truckH, 1.4, -1.2);
    props.add(cx, ROAD_Y + 1.62, cz, truckH, 0, 0, 0.45, 0.06, 2.6, "#b7b7b7");     // 出餐台
    const [mx, mz] = local(truckX, truckZ, truckH, 2.3, 1.8);
    props.add(mx, WALK_Y + 0.6, mz, truckH + 0.3, 0, 0, 0.06, 1.0, 0.7, "#2c3e50"); // 菜单板
    // 厨师（窗内）
    const [kx, kz] = local(truckX, truckZ, truckH, 0.55, -1.2 + Math.sin(t * 0.7) * 0.6);
    stage.person(standPose(kx, ROAD_Y + 0.75, kz, truckH + Math.PI / 2, t, { left: [-1.0, -1.5, 0.1], right: [-0.7 + Math.sin(t * 5) * 0.3, -1.4, 0.1] }), { ...crowd[10], coat: "#fafafa", hat: true });
    // 队伍：每 10 秒前移一位
    const step = 10, q = Math.floor(t / step), k = (t % step) / step;
    for (let i = 0; i < 5; i++) {
      const id = q + i;
      const look = crowd[(id * 5) % crowd.length];
      const slot = i - ease(seg(k, 0.75, 1));
      const [px, pz] = local(truckX, truckZ, truckH, 6.4, -1.2 - slot * 0.85);
      if (i === 0) {
        // 取餐后走入公园
        const leave = seg(k, 0.4, 1);
        const lx = px + leave * 3, lz = pz - leave * 9;
        const spec = leave > 0 ? gaitPose(lx, WALK_Y, lz, Math.atan2(3, -9), t * 6 + i, 0) : standPose(px, WALK_Y, pz, truckH - Math.PI / 2 - 0.3, t);
        if (leave > 0) spec.left = { ...spec.left, upper: -1.0, lower: -1.6 };
        const pose = person(spec, look, 400 + id);
        if (pose && k > 0.3) { const h = pose.leftHand; props.add(h.x, h.y + 0.05, h.z, 0, 0, 0, 0.16, 0.08, 0.2, "#f5deb3"); }
      } else person(standPose(px, WALK_Y, pz, Math.atan2(truckX - px, truckZ - 1.2 - pz) + Math.sin(t * 0.3 + i), t + i, i % 2 ? { left: [-0.8, -1.9, 0.1] } : {}), look, 400 + id);
    }
  };

  // 集市：5 顶帐篷 + 摊主 + 逛街人群
  const stalls: { x: number; z: number; colour: string; goods: string[] }[] = [
    { x: 40, z: -17, colour: "#e74c3c", goods: ["#f39c12", "#27ae60", "#c0392b"] }, { x: 46, z: -17, colour: "#f1c40f", goods: ["#8e44ad", "#d35400", "#16a085"] },
    { x: 52, z: -17, colour: "#3498db", goods: ["#ecf0f1", "#e67e22", "#2ecc71"] }, { x: 43, z: -3.5, colour: "#2ecc71", goods: ["#e74c3c", "#f1c40f", "#9b59b6"] },
    { x: 49, z: -3.5, colour: "#9b59b6", goods: ["#1abc9c", "#f39c12", "#ecf0f1"] },
  ];
  const animateMarket = (t: number, night: boolean) => {
    for (const [i, s] of stalls.entries()) {
      const face = s.z < -10 ? 0 : Math.PI;
      for (const [dx, dz] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) rods.segment(tmpA.set(s.x + dx, LAWN_Y, s.z + dz), tmpB.set(s.x + dx, LAWN_Y + 2.3, s.z + dz), 0.035, "#dddddd");
      tents.add(s.x, LAWN_Y + 2.7, s.z, 0, 0, 0, 2.0, 0.8, 1.7, s.colour);
      const [tx2, tz2] = [s.x, s.z + (face === 0 ? 0.8 : -0.8)];
      props.add(tx2, LAWN_Y + 0.8, tz2, 0, 0, 0, 2.3, 0.06, 0.8, "#8d6e63");
      for (let g = 0; g < 6; g++) balls.add(tx2 - 0.9 + g * 0.36, LAWN_Y + 0.92, tz2 + (g % 2 ? 0.15 : -0.15), 0, 0, 0, 0.12, 0.1, 0.12, s.goods[g % 3]);
      if (night) lights.add(s.x, LAWN_Y + 2.2, s.z, 0, 0, 0, 0.12, 0.12, 0.12, "#ffd27f");
      stage.person(standPose(s.x, LAWN_Y, s.z + (face === 0 ? -0.3 : 0.3), face, t + i, { right: [-0.9 + Math.sin(t * 2 + i) * 0.3, -1.6, 0.1] }), crowd[20 + i]);
    }
    // 逛集市的人：沿摊位往返
    const route: Vec2[] = [[36, -10], [56, -10], [56, -11], [36, -11]];
    const L = pathLength(route);
    for (let i = 0; i < 9; i++) {
      const d = t * (0.6 + hash(i) * 0.4) + i * L / 9;
      const p = along(route, d);
      const browse = Math.sin(t * 0.4 + i * 2) > 0.55;
      const spec = browse ? standPose(p.x, LAWN_Y, p.z + (i % 2 ? -1.3 : 1.3), i % 2 ? Math.PI : 0, t + i, { left: [-0.6, -1.4, 0.05] }) : gaitPose(p.x, LAWN_Y, p.z + (i % 2 ? -1.3 : 1.3), p.heading, d * 2.6, 0);
      const pose = person(spec, crowd[30 + i], 30 + i);
      if (pose && i % 3 === 0) { const h = pose.leftHand; props.add(h.x, h.y - 0.15, h.z, spec.heading, 0, 0, 0.3, 0.35, 0.12, "#f5f0e1"); }
    }
  };

  // 婚礼（白天）/ 音乐会（夜晚）—— 南草坪
  const lawn = { x: 18, z: 40 };
  const animateLawn = (t: number, night: boolean) => {
    if (!night) {
      // 花拱门 + 红毯 + 两侧座椅
      for (const dx of [-1.4, 1.4]) rods.segment(tmpA.set(lawn.x + dx, LAWN_Y, lawn.z + 7), tmpB.set(lawn.x + dx, LAWN_Y + 2.6, lawn.z + 7), 0.06, "#f8f4ec");
      for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; balls.add(lawn.x - Math.cos(a) * 1.4, LAWN_Y + 2.6 + Math.sin(a) * 0.9, lawn.z + 7, 0, 0, 0, 0.2, 0.2, 0.2, i % 2 ? "#f7c6d0" : "#ffffff"); }
      props.add(lawn.x, LAWN_Y + 0.02, lawn.z + 1, 0, 0, 0, 1.3, 0.02, 12, "#b03a48");
      let g = 0;
      for (const side of [-1, 1]) for (let row = 0; row < 4; row++) for (let c = 0; c < 3; c++) {
        const cx = lawn.x + side * (1.5 + c * 0.75), cz = lawn.z - 4 + row * 1.5;
        props.add(cx, LAWN_Y + 0.45, cz, 0, 0, 0, 0.45, 0.06, 0.45, "#f5f5f0");
        props.add(cx, LAWN_Y + 0.75, cz - 0.22, 0, 0, 0, 0.45, 0.6, 0.05, "#f5f5f0");
        if (hash(g * 1.7) < 0.85) stage.person({ ...sitPose(cx, LAWN_Y, cz, 0, 0.46), headYaw: Math.sin(t * 0.5 + g) * 0.2 }, crowd[g % crowd.length]);
        g++;
      }
      // 新人：缓步走向拱门 → 交换戒指 → 亲吻 → 撒花
      const C = 60, tau = t % C;
      const walk = ease(seg(tau, 2, 22));
      const z = lerp(lawn.z - 6, lawn.z + 5.8, walk);
      const atArch = tau > 22;
      const kiss = tau > 34 && tau < 40;
      const bspec = atArch ? standPose(lawn.x - 0.35, LAWN_Y, z, Math.PI / 2, t, kiss ? { left: [-1.0, -1.5, 0.3], right: [-1.0, -1.5, 0.3] } : { right: [-0.5, -1.4, 0.1] }) : gaitPose(lawn.x - 0.35, LAWN_Y, z, 0, t * 3.2, 0);
      const gspec = atArch ? standPose(lawn.x + 0.35, LAWN_Y, z, -Math.PI / 2, t, kiss ? { left: [-1.0, -1.5, 0.3], right: [-1.0, -1.5, 0.3] } : {}) : gaitPose(lawn.x + 0.35, LAWN_Y, z, 0, t * 3.2 + Math.PI, 0);
      if (!atArch) { bspec.right = { ...bspec.right, upper: -0.5, lower: -1.5, armOut: -0.15 }; gspec.left = { ...gspec.left, upper: -0.2, lower: -0.9, armOut: -0.2 }; }
      if (kiss) { bspec.lean = 0.15; gspec.lean = 0.15; }
      const bp = stage.person(bspec, bride);
      if (bp) { const h = bp.rightHand; balls.add(h.x, h.y + 0.08, h.z, 0, 0, 0, 0.13, 0.13, 0.13, "#f4a6b8"); }
      stage.person(gspec, groom);
      stage.person(standPose(lawn.x, LAWN_Y, lawn.z + 7.8, Math.PI, t, { left: [-0.8, -1.6, 0.1], right: [-0.8, -1.6, 0.1] }), { ...crowd[50], coat: "#2c3e50" });
      // 摄影师
      const ph = Math.sin(t * 0.2);
      stage.person(standPose(lawn.x + 4.5 + ph, LAWN_Y, lawn.z + 3.5, -Math.PI / 2 - 0.5, t, { left: [-1.5, -2.3, 0.15], right: [-1.5, -2.3, -0.1] }), crowd[51]);
      // 路过的人被婚礼吸引：在草坪边驻足，有人举手机拍照
      for (let o = 0; o < 6; o++) {
        const stopAt = 6 + o * 5 + hash(o + 41) * 4, goAt = 44 + hash(o + 43) * 12;
        if (tau < stopAt - 8 || tau > goAt + 8) continue;
        const side = o % 2 ? 1 : -1;
        const sx = lawn.x + side * (7.5 + (o % 3) * 0.9), sz = lawn.z - 1 + (o % 3) * 1.6;
        const ex = sx + side * 9, ez = sz - 6;
        const k = tau < stopAt ? seg(tau, stopAt - 8, stopAt) : tau > goAt ? 1 - seg(tau, goAt, goAt + 8) : 1;
        const px = lerp(ex, sx, k), pz = lerp(ez, sz, k);
        const face = Math.atan2(lawn.x - px, lawn.z + 6 - pz);
        if (k < 1) person(gaitPose(px, LAWN_Y, pz, tau < stopAt ? Math.atan2(sx - ex, sz - ez) : Math.atan2(ex - sx, ez - sz), t * 6 + o, 0), crowd[(o * 11 + 5) % crowd.length], 860 + o, false);
        else {
          const film = o % 3 !== 1;
          const pose = stage.person(standPose(px, LAWN_Y, pz, face, t + o, film ? { right: [-2.2, -2.6, 0.15] } : { left: [-0.4, -1.2, 0.3] }), crowd[(o * 11 + 5) % crowd.length]);
          if (pose && film) props.add(pose.rightHand.x, pose.rightHand.y + 0.06, pose.rightHand.z, face, 0, 0, 0.08, 0.15, 0.015, "#111111");
        }
      }
      // 花瓣
      if (tau > 38 && tau < 50) for (let p = 0; p < 24; p++) {
        const life = fract((t * 0.5 + p / 24));
        const a = p * 2.399;
        balls.add(lawn.x + Math.cos(a) * (0.6 + life * 2), LAWN_Y + 3.0 - life * 2.8, z + Math.sin(a) * (0.6 + life * 1.5), 0, 0, 0, 0.05, 0.015, 0.05, p % 2 ? "#ff8fab" : "#ffffff");
      }
    } else {
      // 舞台 + 桁架 + 灯光 + 乐队 + 人群
      props.add(lawn.x, LAWN_Y + 0.5, lawn.z + 7, 0, 0, 0, 10, 1, 4.5, "#1d1d22");
      for (const dx of [-5, 5]) for (const dz of [-2.2, 2.2]) rods.segment(tmpA.set(lawn.x + dx, LAWN_Y + 1, lawn.z + 7 + dz), tmpB.set(lawn.x + dx, LAWN_Y + 6, lawn.z + 7 + dz), 0.08, "#9aa0a6");
      props.add(lawn.x, LAWN_Y + 6, lawn.z + 4.8, 0, 0, 0, 10.4, 0.3, 0.3, "#9aa0a6");
      props.add(lawn.x, LAWN_Y + 6, lawn.z + 9.2, 0, 0, 0, 10.4, 0.3, 0.3, "#9aa0a6");
      props.add(lawn.x, LAWN_Y + 3.5, lawn.z + 9.2, 0, 0, 0, 9.5, 4.5, 0.1, "#0b0b10");
      const beat = Math.floor(t * 2);
      const colours = ["#ff2e63", "#08d9d6", "#f9ed69", "#a66cff", "#3ec70b"];
      for (let i = 0; i < 6; i++) {
        const c = colours[(beat + i) % colours.length];
        const lx = lawn.x - 4.5 + i * 1.8;
        lights.add(lx, LAWN_Y + 5.75, lawn.z + 4.8, 0, 0, 0, 0.22, 0.22, 0.22, c);
        const sway = Math.sin(t * 1.3 + i) * 0.5;
        beams.add(lx, LAWN_Y + 5.75, lawn.z + 4.8, 0, -0.35 + Math.cos(t * 0.9 + i) * 0.25, sway, 1.4, 9, 1.4, c);
      }
      for (let b = 0; b < 3; b++) {
        const bx = lawn.x - 2.5 + b * 2.5;
        const jam = Math.sin(t * 8 + b);
        const pose = stage.person(standPose(bx, LAWN_Y + 1, lawn.z + 7, Math.PI, t * 3 + b, b === 1 ? { left: [-2.2 + jam * 0.2, -2.8, 0.3], right: [-0.8, -1.6, 0.1] } : { left: [-0.9, -1.7, 0.4], right: [-0.4 + jam * 0.25, -1.2, 0.2] }), crowd[40 + b]);
        if (pose && b !== 1) { const h = pose.leftHand; props.add(h.x + 0.15, h.y - 0.1, h.z, Math.PI, 0, 0.9, 0.85, 0.08, 0.3, b ? "#c0392b" : "#f39c12"); }
        if (b === 1) rods.segment(tmpA.set(bx, LAWN_Y + 1, lawn.z + 6.3), tmpB.set(bx, LAWN_Y + 2.5, lawn.z + 6.3), 0.015, "#222");
      }
      // 人群随演出逐渐聚集：前排早到，后排陆续从两侧步道走来；散场时三三两两离开。
      const show = t % 240;
      for (let i = 0; i < 40; i++) {
        const cx = lawn.x - 5 + (i % 7) * 1.6 + hash(i) * 0.5, cz = lawn.z + 2.5 - Math.floor(i / 7) * 1.4 - hash(i + 3) * 0.4;
        const arriveAt = i < 10 ? -20 : 4 + (i - 10) * 3.1 + hash(i + 9) * 3;
        const leaveAt = 205 + hash(i + 17) * 25;
        const fromX = lawn.x + (i % 2 ? 1 : -1) * (16 + hash(i) * 6), fromZ = lawn.z - 14 - hash(i + 5) * 8;
        const inK = seg(show, arriveAt, arriveAt + 11), outK = seg(show, leaveAt, leaveAt + 11);
        if (show < arriveAt || outK >= 1) continue;
        if (inK < 1 || outK > 0) {
          const k = inK < 1 ? inK : 1 - outK;
          const px = lerp(fromX, cx, k), pz = lerp(fromZ, cz, k);
          const heading = inK < 1 ? Math.atan2(cx - fromX, cz - fromZ) : Math.atan2(fromX - cx, fromZ - cz);
          person(gaitPose(px, LAWN_Y, pz, heading, t * 6.5 + i, 0), crowd[i % crowd.length], 800 + i, false);
          continue;
        }
        const hop = Math.max(0, Math.sin(t * 2 * Math.PI + i)) * 0.18;
        const raise = i % 3 === 0;
        stage.person(standPose(cx, LAWN_Y + hop, cz, 0, t + i, raise ? { left: [-2.8, -3.0, 0.25], right: [-2.8, -3.0, 0.25] } : { right: [-2.6 + Math.sin(t * 6 + i) * 0.3, -2.9, 0.2] }), crowd[i % crowd.length]);
        if (raise && i % 2 === 0) lights.add(cx + 0.2, LAWN_Y + hop + 2.3, cz, 0, 0, 0, 0.03, 0.05, 0.03, "#cfe9ff");
      }
    }
  };

  // 湖畔跑步、遛狗；太极晨练
  const lakeLoop: Vec2[] = Array.from({ length: 64 }, (_, i) => shorePoint((i / 64) * Math.PI * 2, 5.5));
  const lakeLen = pathLength(lakeLoop);
  const animatePark = (t: number) => {
    for (let i = 0; i < 5; i++) {
      const speed = 2.6 + hash(i) * 0.9;
      const dir = i % 2 ? -1 : 1;
      const d = dir * t * speed + i * lakeLen / 5;
      const p = along(lakeLoop, d);
      const lateral = (i % 2 ? 0.7 : -0.7);
      const h = p.heading + (dir < 0 ? Math.PI : 0);
      person(gaitPose(p.x + Math.cos(h) * lateral, LAWN_Y, p.z - Math.sin(h) * lateral, h, Math.abs(d) * 2.1, 1), runner(i), 200 + i, false);
    }
    const dogColours = ["#c8a165", "#2b2b2b", "#f2efe8"];
    for (let i = 0; i < 3; i++) {
      const d = -t * 1.05 + i * lakeLen / 3 + 40;
      const p = along(lakeLoop, d);
      const h = p.heading + Math.PI;
      const sniff = Math.sin(t * 0.5 + i * 2) > 0.7;
      const walkerSpec = sniff ? standPose(p.x, LAWN_Y, p.z, h, t, { right: [-0.5, -0.9, 0.2] }) : gaitPose(p.x, LAWN_Y, p.z, h, Math.abs(d) * 2.6, 0);
      walkerSpec.right = { ...walkerSpec.right, upper: -0.45, lower: -0.8, armOut: 0.2 };
      const pose = person(walkerSpec, crowd[45 + i], 300 + i);
      // 狗：在主人前方 1.8 m，四腿交替
      const dx = p.x + Math.sin(h) * 1.9 + Math.cos(h) * 0.6, dz = p.z + Math.cos(h) * 1.9 - Math.sin(h) * 0.6;
      const sz = i === 1 ? 0.75 : 1;
      const col = dogColours[i];
      const ph = t * (sniff ? 0 : 9) + i;
      const bodyY = LAWN_Y + 0.42 * sz;
      dogBody.add(dx, bodyY, dz, h, 0, 0, 0.17 * sz, 0.16 * sz, 0.36 * sz, col);
      const [hx, hz] = [dx + Math.sin(h) * 0.38 * sz, dz + Math.cos(h) * 0.38 * sz];
      dogBody.add(hx, bodyY + (sniff ? -0.18 : 0.14) * sz, hz, h, 0, 0, 0.11 * sz, 0.11 * sz, 0.15 * sz, col);
      dogBody.add(dx - Math.sin(h) * 0.38 * sz, bodyY + 0.12 * sz, dz - Math.cos(h) * 0.38 * sz, h, -0.8 + Math.sin(t * 12) * 0.3, 0, 0.03 * sz, 0.03 * sz, 0.14 * sz, col);
      for (const [lx, lz, o] of [[-0.09, 0.24, 0], [0.09, 0.24, Math.PI], [-0.09, -0.24, Math.PI], [0.09, -0.24, 0]] as const) {
        const [ax, az] = local(dx, dz, h, lx * sz, lz * sz);
        const swing = Math.sin(ph + o) * 0.35;
        const [fx2, fz2] = local(dx, dz, h, lx * sz, lz * sz + Math.sin(swing) * 0.3 * sz);
        dogLegs.segment(tmpA.set(ax, bodyY - 0.05, az), tmpB.set(fx2, LAWN_Y, fz2), 0.035 * sz, col);
      }
      if (pose) leash.segment(tmpA.copy(pose.rightHand), tmpB.set(hx, bodyY + 0.05, hz), 0.008, "#c0392b");
    }
    // 太极：清晨与傍晚，6 位老人慢动作同步
    const tc = { x: -40, z: 32 };
    for (let i = 0; i < 6; i++) {
      const ph = t * 0.35;
      const a = Math.sin(ph), b = Math.cos(ph * 0.5);
      const x = tc.x + (i % 3) * 2.2, z = tc.z + Math.floor(i / 3) * 2.2;
      stage.person({ x, y: LAWN_Y, z, heading: Math.PI / 2 + b * 0.4, hipsY: 0.8 + a * 0.06, lean: 0.05,
        left: { thigh: -0.35 + a * 0.2, shin: 0.2, upper: -1.2 + a * 0.6, lower: -1.6 + a * 0.5, armOut: 0.4 + b * 0.3, legOut: 0.12 },
        right: { thigh: 0.15 - a * 0.2, shin: 0.25, upper: -0.9 - a * 0.5, lower: -1.4 - a * 0.4, armOut: 0.3 - b * 0.2, legOut: 0.12 } }, elder(i));
    }
  };

  // 孩子踢球（社区运动场）
  const pitch = { x: 37.5, z: -137.5, y: 0.53 };
  const animateKids = (t: number) => {
    const bx = pitch.x + Math.sin(t * 0.37) * 4.5 + Math.sin(t * 1.1) * 1.2;
    const bz = pitch.z + Math.sin(t * 0.23 + 1) * 8.5 + Math.cos(t * 0.9) * 1.5;
    const bounce = Math.abs(Math.sin(t * 3.1)) * 0.25 * (Math.sin(t * 0.5) > 0.6 ? 1 : 0.15);
    balls.add(bx, pitch.y + 0.11 + bounce, bz, t * 5, t * 3, 0, 0.11, 0.11, 0.11, "#f8f8f8");
    for (let i = 0; i < 10; i++) {
      const team = i % 2;
      const keeper = i < 2;
      let tx: number, tz: number;
      if (keeper) { tx = pitch.x + (bx - pitch.x) * 0.3; tz = pitch.z + (team ? 10.5 : -10.5); }
      else { const a = i * 1.9 + t * 0.2; tx = bx + Math.cos(a) * (1.2 + (i % 4) * 1.1); tz = bz + Math.sin(a) * (1.2 + (i % 3) * 1.3) + (team ? 1.5 : -1.5); }
      const toBall = Math.atan2(bx - tx, bz - tz);
      const fast = !keeper && Math.hypot(bx - tx, bz - tz) < 3;
      person(fast || !keeper ? gaitPose(tx, pitch.y, tz, toBall, t * (fast ? 12 : 8) + i, fast ? 1 : 0.4) : standPose(tx, pitch.y, tz, toBall, t, { left: [-0.6, -1.0, 0.4], right: [-0.6, -1.0, 0.4] }), kid(i, team), 600 + i, false);
    }
  };

  // 施工：塔吊回转、吊钩起落；楼面工人
  const animateConstruction = (t: number, night: boolean) => {
    const C = 40, tau = t % C;
    const swing = Math.sin(seg(tau, 0, 18) * Math.PI) * 1.4 - 0.4;
    slew.rotation.y = swing;
    const trolley = 8 + ease(seg(tau, 4, 14)) * 12 - ease(seg(tau, 24, 34)) * 12;
    const hookDrop = 10 + Math.sin(seg(tau, 0, 40) * Math.PI * 2) * 8 + (tau > 18 && tau < 24 ? 12 : 0) * ease(Math.min(seg(tau, 18, 20), 1 - seg(tau, 22, 24)));
    const jx = slew.position.x + Math.sin(swing) * trolley, jz = slew.position.z + Math.cos(swing) * trolley;
    const hy = 40 - hookDrop;
    rods.segment(tmpA.set(jx, 40.2, jz), tmpB.set(jx, hy, jz), 0.025, "#333");
    props.add(jx, 40.25, jz, swing, 0, 0, 0.9, 0.4, 1.1, "#3d3d3d");
    props.add(jx, hy - 0.25, jz, swing, 0, 0, 0.3, 0.5, 0.3, "#d4a017");
    const loaded = tau < 21;
    if (loaded) for (let k = 0; k < 4; k++) props.add(jx, hy - 0.9 - k * 0.18, jz, swing, 0, 0, 0.3, 0.16, 5, "#7f8c8d");
    for (const [i, base] of [[0, -10], [1, -4], [2, 1]].entries()) {
      const wx = site.x + base[1] + Math.sin(t * 0.3 + i * 2) * 2, wz = site.z - 2 + i * 1.6;
      const level = i === 2 ? 0.5 + 4 * 3.4 + 0.15 : 0.5 + 3 * 3.4 + 0.15;
      const work = Math.sin(t * 0.3 + i * 2) > 0.3;
      const spec = work ? standPose(wx, level, wz, i * 1.3, t) : gaitPose(wx, level, wz, Math.cos(t * 0.3 + i * 2) > 0 ? Math.PI / 2 : -Math.PI / 2, t * 6 + i, 0);
      if (work) { spec.hipsY = 0.65; spec.lean = 0.7; spec.left = { thigh: -1.2, shin: 0.4, upper: -1.0 + Math.sin(t * 7 + i) * 0.3, lower: -1.3 }; spec.right = { ...spec.left, upper: -1.0 - Math.sin(t * 7 + i) * 0.3 }; }
      stage.person(spec, worker(i));
    }
    if (night) lights.add(slew.position.x, 47.3, slew.position.z, 0, 0, 0, 0.3, 0.3, 0.3, Math.sin(t * 3) > 0 ? "#ff3b30" : "#5a1410");
  };

  // 外卖电动车：沿街区外环送餐
  const scooterLoops: Vec2[][] = [
    [[-165 + 3.6, -70], [-165 + 3.6, -25], [-120 - 3.6, -25 + 0.1], [-120 - 3.6, -70]].map(([x, z]) => [x, z] as Vec2),
    [[120 + 3.6, -70], [165 - 3.6, -70], [165 - 3.6, -25], [120 + 3.6, -25]].map(([x, z]) => [x, z] as Vec2),
    [[-75 + 3.6, -115], [-75 + 3.6, 20], [-75 + 3.0, 20], [-75 + 3.0, -115]].map(([x, z]) => [x, z] as Vec2),
  ];
  const scooterBody = stage.pool("v3 delivery scooters", unit, stage.material(mat("#ffffff", 0.45, 0.2)), 18);
  const animateScooters = (t: number) => {
    for (const [i, loop] of scooterLoops.entries()) {
      const L = pathLength(loop);
      const d = t * 6.5 + i * 37;
      const stopAt = fract(d / L) > 0.47 && fract(d / L) < 0.5;
      const p = along(loop, stopAt ? Math.floor(d / L) * L + 0.47 * L : d);
      const h = p.heading;
      const brand = i % 2 ? "#ffc300" : "#1e90ff";
      scooterBody.add(p.x, ROAD_Y + 0.42, p.z, h, 0, 0, 0.32, 0.22, 1.35, brand);
      scooterBody.add(p.x - Math.sin(h) * 0.42, ROAD_Y + 1.05, p.z - Math.cos(h) * 0.42, h, 0, 0, 0.45, 0.42, 0.42, brand);
      const [hx, hz] = local(p.x, p.z, h, 0, 0.6);
      rods.segment(tmpA.set(hx, ROAD_Y + 0.3, hz), tmpB.set(hx, ROAD_Y + 1.05, hz), 0.025, "#2d3436");
      rods.segment(tmpA.set(hx - Math.cos(h) * 0.3, ROAD_Y + 1.05, hz + Math.sin(h) * 0.3), tmpB.set(hx + Math.cos(h) * 0.3, ROAD_Y + 1.05, hz - Math.sin(h) * 0.3), 0.02, "#2d3436");
      for (const lz of [0.55, -0.5]) { const [wx, wz] = local(p.x, p.z, h, 0, lz); rods.add(wx, ROAD_Y + 0.2, wz, h, 0, Math.PI / 2, 0.2, 0.08, 0.2, "#1b1b1b"); }
      const spec = sitPose(p.x, ROAD_Y + 0.08, p.z - Math.cos(h) * 0.05, h, 0.58);
      spec.lean = 0.2;
      spec.left = { thigh: -1.35, shin: -0.3, upper: -1.05, lower: -1.25, armOut: 0.25 };
      spec.right = { ...spec.left };
      stage.person(spec, { ...crowd[15 + i], coat: brand, shirt: brand, hat: true, glasses: false });
    }
  };

  // 鸟：海鸥盘旋海滩、鸽群在餐车附近起落、湖上空的燕群
  const animateBirds = (t: number) => {
    const flocks = [
      { cx: -150, cz: 150, y: 14, r: 18, n: 9, speed: 0.22, grey: true },
      { cx: -12, cz: -15, y: 20, r: 26, n: 12, speed: -0.3, grey: false },
      { cx: 100, cz: 200, y: 12, r: 22, n: 8, speed: 0.18, grey: true },
    ];
    let k = 0;
    for (const f of flocks) for (let i = 0; i < f.n; i++) {
      const a = t * f.speed + i * 0.45 + Math.sin(t * 0.3 + i) * 0.2;
      const r = f.r + Math.sin(i * 1.7 + t * 0.2) * 4;
      const x = f.cx + Math.cos(a) * r, z = f.cz + Math.sin(a) * r, y = f.y + Math.sin(t * 0.5 + i) * 2;
      const heading = Math.atan2(-Math.sin(a), Math.cos(a)) * Math.sign(f.speed) + (f.speed > 0 ? 0 : Math.PI);
      const flap = Math.sin(t * (f.grey ? 5 : 11) + i * 1.3) * (Math.sin(t * 0.7 + i) > 0.2 ? 0.6 : 0.05);
      const s = f.grey ? 1.5 : 0.8;
      birdBody.add(x, y, z, heading, 0, 0, 0.06 * s, 0.05 * s, 0.18 * s, f.grey ? "#f3f3f1" : "#2d3436");
      wingR.add(x, y, z, heading, 0, flap, s, s, s, f.grey ? "#d5d8dc" : "#2d3436");
      wingL.add(x, y, z, heading + Math.PI, 0, -flap, s, s, -s, f.grey ? "#d5d8dc" : "#2d3436");
      k++;
    }
    // 鸽群：每 30 秒受惊起飞一次
    const C = 30, tau = t % C;
    const fly = tau > 20 ? ease(seg(tau, 20, 23)) * (1 - ease(seg(tau, 27, 30))) : 0;
    for (let i = 0; i < 12; i++) {
      const gx = truckX + 4 + (hash(i) - 0.5) * 6, gz = 87 - hash(i + 5) * 4;
      const a = i * 0.9 + t * 0.6;
      const x = gx + fly * Math.cos(a) * 5, z = gz + fly * Math.sin(a) * 5, y = WALK_Y + 0.08 + fly * (5 + hash(i) * 3);
      const peck = fly < 0.05 ? Math.max(0, Math.sin(t * 6 + i * 3)) * 0.5 : 0;
      const heading = fly > 0.05 ? a + Math.PI / 2 : hash(i + 9) * 6 + Math.sin(t * 0.3 + i);
      birdBody.add(x, y, z, heading, peck, 0, 0.07, 0.07, 0.13, "#7b7f86");
      const flap = fly > 0.05 ? Math.sin(t * 14 + i) * 0.7 : 0.9;
      // 落地时翅膀收拢贴身（缩短、几乎水平），飞行时展开拍打
      const ws = fly > 0.05 ? 0.4 : 0.16;
      wingR.add(x, y + 0.04, z, heading, 0, fly > 0.05 ? flap : 0.25, ws, 0.4, 0.4, "#6b6f76");
      wingL.add(x, y + 0.04, z, heading + Math.PI, 0, fly > 0.05 ? -flap : -0.25, ws, 0.4, -0.4, "#6b6f76");
      if (fly < 0.05) birdBody.add(x + Math.sin(heading) * 0.11, y + 0.09 - peck * 0.08, z + Math.cos(heading) * 0.11, heading, 0, 0, 0.04, 0.04, 0.045, "#55595f");
    }
    void k;
  };

  const animate = (seconds: number, night: boolean, precipitation = 0) => {
    rain = precipitation;
    glow.emissiveIntensity = night ? 3.5 : 0.5;
    beamMat.opacity = night ? 0.14 : 0;
    animateDelivery(seconds);
    animatePoliceStop(seconds);
    animateTaxi(seconds);
    animateFoodTruck(seconds, night);
    animateMarket(seconds, night);
    animateLawn(seconds, night);
    animatePark(seconds);
    animateKids(seconds);
    animateConstruction(seconds, night);
    animateScooters(seconds);
    animateBirds(seconds);
    occupyVehicle(deliveryTruck, deliveryTruck.group.visible ? 4 : undefined);
    occupyVehicle(policeStop, 3.5);
    occupyVehicle(stoppedCar, 3.5);
    occupyVehicle(taxi, 5);
    occupyVehicle(foodTruck);
    // 草坪 / 广场人群区域：只让行人绕开
    occupy(lawn.x, lawn.z + 2, 8.5, undefined, true);
    occupy(46, -10.5, 7, undefined, true);
    for (const [qx, qz] of [local(truckX, truckZ, truckH, 6.4, -2.5)]) occupy(qx, qz, 2.6, undefined, true);
    occupy(-37.8, 33.1, 3.6, undefined, true);
    publishEventObstacles("v3 street events", occupied.slice());
    occupied.length = 0;
  };
  return { animate, vehicles, site, lawn, truck: { x: truckX, z: truckZ } };
}
