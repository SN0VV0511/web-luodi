import * as THREE from "three";
import type { CivicKit } from "./city-civic";
import type { ActiveCityIncident } from "./city-events";
import type { Locale } from "./site-content";
import {
  createCalf, createForearm, createHair, createHand, createHead,
  createPelvis, createShoe, createThigh, createTorso, createUpperArm,
} from "./city-figure";

type Neighborhood = "park" | "promenade" | "commerce" | "office" | "school";
type Activity =
  | "greeting" | "courier" | "coffee" | "music" | "dog" | "running"
  | "photo" | "tour" | "taichi" | "books" | "school" | "bus"
  | "bicycle" | "market" | "sweeping" | "gardening" | "kite"
  | "basketball" | "picnic" | "phone" | "chess" | "painting"
  | "lunch" | "commute";

type ActivitySpec = {
  id: Activity;
  title: [string, string];
  detail: [string, string];
  action: [string, string];
  places: Neighborhood[];
  actors: number;
  color: string;
};

/** Activities use a shared scene/notification clock; opening the drawer never creates an event. */
export const STREET_ACTIVITY_CATALOG: readonly ActivitySpec[] = [
  {
    id: "greeting", title: ["同事偶遇，停下聊一会儿", "Colleagues stop to catch up"],
    detail: ["两人先走近、转身面对面交谈，握手后各自离开。", "Two colleagues meet, turn toward each other, shake hands and continue on their way."],
    action: ["交谈与握手", "Talking and shaking hands"], places: ["office", "commerce"], actors: 2, color: "#526576",
  },
  {
    id: "courier", title: ["快递员交付包裹", "A parcel changes hands"],
    detail: ["快递员从手推车取件，收件人检查包裹并签收。", "A courier takes a parcel off the trolley and the recipient signs for it."],
    action: ["取件与签收", "Delivery and signature"], places: ["office", "commerce", "school"], actors: 2, color: "#bd853e",
  },
  {
    id: "coffee", title: ["街角咖啡短暂休息", "A coffee break outside"],
    detail: ["朋友在高桌旁喝咖啡，边交谈边抬杯，随后一起离开。", "Friends share a standing table, sip their coffee and leave together."],
    action: ["喝咖啡聊天", "Coffee and conversation"], places: ["commerce", "office", "promenade"], actors: 3, color: "#8c6450",
  },
  {
    id: "music", title: ["街头吉他与驻足的听众", "Guitar on the waterfront"],
    detail: ["乐手拨弦演奏，听众围成半圈随节奏轻摆，开放的琴盒放在脚边。", "A guitarist strums while listeners gather in a semicircle beside an open instrument case."],
    action: ["演奏与聆听", "Playing and listening"], places: ["promenade", "park", "commerce"], actors: 4, color: "#a47b50",
  },
  {
    id: "dog", title: ["邻居遛狗相遇", "Neighbors meet on a dog walk"],
    detail: ["狗沿牵绳的范围嗅闻，主人停下交流，再带狗沿步道离开。", "A dog sniffs within its leash while the owners pause for a conversation."],
    action: ["遛狗与交谈", "Walking and chatting"], places: ["park", "promenade"], actors: 2, color: "#a47b58",
  },
  {
    id: "running", title: ["晨跑小组经过步道", "A running group passes by"],
    detail: ["跑者保持前后间距，落脚和摆臂同步，终点缓跑恢复。", "Runners keep their spacing, match their arm swing to footfall and slow to recover."],
    action: ["慢跑与拉伸", "Running and recovering"], places: ["park", "promenade"], actors: 4, color: "#8a674b",
  },
  {
    id: "photo", title: ["给朋友拍一张纪念照", "A photograph with friends"],
    detail: ["摄影者举起相机，朋友调整站姿，拍摄后一起查看照片。", "The photographer raises a camera while friends pose, then everyone checks the picture."],
    action: ["举起相机取景", "Framing the photograph"], places: ["park", "promenade", "school", "commerce"], actors: 3, color: "#4c585f",
  },
  {
    id: "tour", title: ["海湾导览团在此集合", "A waterfront walking tour"],
    detail: ["导游举着小旗讲解，游客围在一旁，随后跟随旗帜出发。", "A guide explains the harbor beneath a small flag before the group follows along."],
    action: ["听讲与集合", "Listening to the guide"], places: ["promenade", "park"], actors: 5, color: "#ad5947",
  },
  {
    id: "taichi", title: ["公园里的太极晨练", "Slow movement in the park"],
    detail: ["晨练者重心缓慢转移，双臂连贯展开，不做机械式原地旋转。", "The group shifts its weight and extends its arms through a continuous slow routine."],
    action: ["舒展与重心转移", "Stretching and shifting weight"], places: ["park"], actors: 4, color: "#949083",
  },
  {
    id: "books", title: ["读书会交换一本书", "A neighborhood book exchange"],
    detail: ["居民从书桌挑书、翻阅，并把读完的书递给身边的人。", "Readers browse the table and pass a finished book to a neighbor."],
    action: ["翻阅与交换", "Browsing and exchanging"], places: ["park", "school", "commerce"], actors: 3, color: "#7a626b",
  },
  {
    id: "school", title: ["家长接孩子放学", "Meeting after school"],
    detail: ["老师带孩子走到家长面前，孩子挥手告别，家长牵着孩子离开。", "A teacher accompanies the child to a parent; they wave goodbye and walk home."],
    action: ["接送与挥手告别", "Meeting and waving goodbye"], places: ["school"], actors: 3, color: "#65758a",
  },
  {
    id: "bus", title: ["下班后的公交等候", "Waiting for the bus after work"],
    detail: ["乘客沿路缘排队，有人查看时间、有人阅读手机，队伍依次向前。", "Passengers queue at the curb, check their watches and move forward in turn."],
    action: ["排队与查看时刻", "Queuing and checking the time"], places: ["office", "school", "commerce"], actors: 5, color: "#606d76",
  },
  {
    id: "bicycle", title: ["给自行车补气", "A quick bicycle repair"],
    detail: ["骑车人停好自行车，维修者俯身检查前轮，用打气筒补气。", "The rider holds the bicycle while a helper inspects the front wheel and works a pump."],
    action: ["检查车轮与打气", "Checking and inflating a tire"], places: ["park", "commerce", "promenade"], actors: 2, color: "#53716f",
  },
  {
    id: "market", title: ["社区花果摊开张", "A small neighborhood market"],
    detail: ["摊主整理木箱中的果蔬，顾客挑选商品、递交购物袋。", "The seller arranges produce in wooden crates as customers choose items and fill their bags."],
    action: ["挑选与装袋", "Choosing and bagging produce"], places: ["commerce", "promenade"], actors: 3, color: "#967346",
  },
  {
    id: "sweeping", title: ["环卫工清扫步道", "Keeping the walkway clean"],
    detail: ["环卫工沿步道扫拢落叶，再把落叶收进簸箕，行人绕侧面通过。", "A worker sweeps leaves into a pan while pedestrians pass on the other side."],
    action: ["清扫与收集落叶", "Sweeping fallen leaves"], places: ["park", "promenade", "commerce", "office", "school"], actors: 2, color: "#be8545",
  },
  {
    id: "gardening", title: ["园丁照料花圃", "Tending the neighborhood flowers"],
    detail: ["园丁俯身松土、扶正花苗，并用喷壶为花根浇水。", "A gardener loosens the soil and waters the roots of newly planted flowers."],
    action: ["栽种与浇水", "Planting and watering"], places: ["park", "school"], actors: 2, color: "#78845c",
  },
  {
    id: "kite", title: ["海风里放一只风筝", "A kite catches the sea breeze"],
    detail: ["风筝随风升降，尾带轻摆，孩子拉住绳轴并调整身体重心。", "The kite rises in the breeze, its tail fluttering as a child holds the reel."],
    action: ["放线与迎风牵引", "Playing out the kite line"], places: ["park", "promenade"], actors: 2, color: "#ae6450",
  },
  {
    id: "basketball", title: ["朋友间的传球练习", "A passing drill with friends"],
    detail: ["两名朋友轮流传球，篮球按重力落地反弹，接球时双手抬起。", "Friends take turns passing as the ball follows a gravity-driven bounce."],
    action: ["传球与运球", "Passing and bouncing"], places: ["park", "school"], actors: 2, color: "#b26f40",
  },
  {
    id: "picnic", title: ["树荫下的午后野餐", "An afternoon picnic"],
    detail: ["朋友围坐在野餐垫旁，分享食物，有人端起杯子。", "Friends sit around a picnic blanket, share food and raise their cups."],
    action: ["分享食物与聊天", "Sharing food and conversation"], places: ["park"], actors: 4, color: "#9b7259",
  },
  {
    id: "phone", title: ["在路边接个电话", "Pausing for a phone call"],
    detail: ["行人走到步道一侧接听电话，空闲的手自然比划，通话后收起手机。", "A pedestrian steps aside for a call, gestures with a free hand and puts the phone away."],
    action: ["接听电话", "Taking a call"], places: ["office", "commerce", "promenade", "school"], actors: 1, color: "#5e6a73",
  },
  {
    id: "chess", title: ["棋盘边的老朋友", "Old friends at the chessboard"],
    detail: ["两人轮流俯身落子，旁观者站在一侧看棋，不时指点棋盘。", "Players lean over the board in turn while a neighbor watches from the side."],
    action: ["思考与落子", "Considering the next move"], places: ["park", "promenade"], actors: 3, color: "#7d6e5a",
  },
  {
    id: "painting", title: ["海湾写生的小画架", "Painting the harbor"],
    detail: ["画家在画架前观察海湾、抬手落笔，路人停下看画。", "An artist alternates between looking at the harbor and putting brush to canvas."],
    action: ["观察与写生", "Observing and painting"], places: ["park", "promenade"], actors: 2, color: "#9b8970",
  },
  {
    id: "lunch", title: ["午休时分享外带午餐", "Sharing a takeaway lunch"],
    detail: ["同事带着纸袋走到小桌旁，打开餐盒边吃边聊，结束后收拾桌面。", "Coworkers open their takeaway boxes at a small table and clear it before leaving."],
    action: ["午餐与交谈", "Lunch and conversation"], places: ["office", "commerce"], actors: 4, color: "#aa8b64",
  },
  {
    id: "commute", title: ["下班后结伴走回家", "Walking home after work"],
    detail: ["同事提着公文包并肩步行，路口停下道别后分向两侧。", "Coworkers walk side by side with their bags, then part at the corner."],
    action: ["步行与道别", "Walking home and saying goodbye"], places: ["office", "commerce"], actors: 4, color: "#586979",
  },
];

const SITES: readonly { x: number; z: number; name: [string, string]; kind: Neighborhood; heading: number }[] = [
  { x: 0, z: 76, name: ["中央公园南入口", "South park entrance"], kind: "park", heading: Math.PI / 2 },
  { x: 48, z: -10.5, name: ["中央公园东步道", "East park walk"], kind: "park", heading: 0 },
  { x: -32, z: 52, name: ["湖畔亭廊步道", "Lakeside pavilion walk"], kind: "park", heading: 0 },
  { x: 11, z: -85, name: ["北园林荫小径", "North garden walk"], kind: "park", heading: 0 },
  { x: 36, z: 102, name: ["海湾观景步道", "Harbor promenade"], kind: "promenade", heading: 0 },
  { x: -113, z: 88.3, name: ["西城生活商业街", "West neighborhood shops"], kind: "commerce", heading: 0 },
  { x: 42, z: -166.8, name: ["学院南侧人行道", "School south sidewalk"], kind: "school", heading: 0 },
  { x: 142.5, z: 59.2, name: ["东湾办公楼前", "East Bay office frontage"], kind: "office", heading: 0 },
];

function random(seed: number): number {
  let value = Math.imul(seed ^ 0x9e3779b9, 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

export type StreetActivityState = {
  slot: number;
  id: string;
  spec: ActivitySpec;
  site: typeof SITES[number];
  elapsed: number;
  progress: number;
  phase: "arriving" | "active" | "leaving";
};

/** Independent offsets avoid synchronized resets. Every new cycle draws a reproducible activity. */
export function sampleStreetActivities(seconds: number): StreetActivityState[] {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return SITES.flatMap((site, slot) => {
    const shifted = time + slot * 9.31;
    const cycle = Math.floor(shifted / 74);
    const local = shifted % 74;
    const seed = cycle * 313 + slot * 117 + 41;
    const start = random(seed + 3) * 5;
    const duration = 56 + random(seed + 7) * 12;
    if (local < start || local > start + duration) return [];
    const choices = STREET_ACTIVITY_CATALOG.filter((activity) => activity.places.includes(site.kind));
    const spec = choices[Math.floor(random(seed) * choices.length)];
    const elapsed = local - start;
    const progress = elapsed / duration;
    return [{
      slot, id: `street-${slot}-${cycle}-${spec.id}`, spec, site, elapsed, progress,
      phase: progress < 0.16 ? "arriving" : progress > 0.84 ? "leaving" : "active",
    }];
  });
}

export function getStreetActivityIncidents(seconds: number, locale: Locale): ActiveCityIncident[] {
  const language = locale === "zh" ? 0 : 1;
  return sampleStreetActivities(seconds).map(({ id, spec, site, phase, progress }) => ({
    id, kind: "life", code: locale === "zh" ? "街坊日常" : "CITY LIFE", severity: "info",
    title: spec.title[language], locationName: site.name[language], detail: spec.detail[language],
    phaseLabel: phase === "arriving" ? ["正在走来", "Arriving"][language]
      : phase === "leaving" ? ["告别与离开", "Saying goodbye"][language] : spec.action[language],
    progress, x: site.x, z: site.z, focusDistance: 16, focusHeight: 1.4,
  }));
}

/** Articulated anatomy and shared instancing keep everyday life visible without a mesh per joint. */
export function buildStreetActivities(kit: CivicKit): { animate: (seconds: number) => void } {
  const actorsPerSlot = 5;
  const actorCount = SITES.length * actorsPerSlot;
  const meshes: THREE.InstancedMesh[] = [];
  const register = <T extends THREE.BufferGeometry>(geometry: T): T => {
    kit.geometries.add(geometry);
    return geometry;
  };
  const skin = kit.solid("#d4ad8b", 0.8, 0);
  const fabric = kit.solid("#ffffff", 0.94, 0);
  const trousers = kit.solid("#41494f", 0.94, 0);
  const hair = kit.solid("#3b302b", 0.96, 0);
  const shoe = kit.solid("#363b40", 0.8, 0);
  const propMaterial = kit.solid("#ffffff", 0.75, 0.08);
  const metal = kit.solid("#a5a8a4", 0.38, 0.65);
  const rubber = kit.solid("#2b2d2c", 0.88, 0);

  function batch(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, count: number) {
    const mesh = new THREE.InstancedMesh(register(geometry), material, count);
    mesh.name = `Street life · ${name}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    kit.group.add(mesh);
    meshes.push(mesh);
    return mesh;
  }

  const heads = batch("faces", createHead(), skin, actorCount);
  const hairMesh = batch("hair", createHair(), hair, actorCount);
  const torsos = batch("clothing", createTorso(), fabric, actorCount);
  const pelvis = batch("hips", createPelvis(), trousers, actorCount);
  const upperArms = batch("upper arms", createUpperArm(), fabric, actorCount * 2);
  const forearms = batch("forearms", createForearm(), skin, actorCount * 2);
  const hands = batch("hands", createHand(), skin, actorCount * 2);
  const thighs = batch("thighs", createThigh(), trousers, actorCount * 2);
  const calves = batch("calves", createCalf(), trousers, actorCount * 2);
  const shoes = batch("shoes", createShoe(), shoe, actorCount * 2);
  const boxes = batch("tables books parcels and bags", new THREE.BoxGeometry(1, 1, 1), propMaterial, SITES.length * 20);
  const rounds = batch("cups produce and animal contours", new THREE.SphereGeometry(1, 12, 8), propMaterial, SITES.length * 16);
  const rods = batch("leashes frames handles and tools", new THREE.CylinderGeometry(1, 1, 1, 8), metal, SITES.length * 24);
  const wheels = batch("bicycle and trolley wheels", new THREE.TorusGeometry(1, 0.075, 6, 20), rubber, SITES.length * 4);
  const color = new THREE.Color();
  const dummy = new THREE.Object3D();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const yAxis = new THREE.Vector3(0, 1, 0);
  let activeSite = SITES[0];
  let activeSlot = 0;
  let boxCursor = 0;
  let roundCursor = 0;
  let rodCursor = 0;
  let wheelCursor = 0;
  let actorX = 0;
  let actorZ = 0;
  let actorHeading = 0;
  let actorScale = 1;

  function transformPoint(x: number, y: number, z: number, target: THREE.Vector3) {
    const sin = Math.sin(activeSite.heading), cos = Math.cos(activeSite.heading);
    return target.set(activeSite.x + x * cos + z * sin, 0.49 + y, activeSite.z + z * cos - x * sin);
  }

  function place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, angle = 0, tint?: string) {
    transformPoint(x, y, z, dummy.position);
    dummy.rotation.set(0, activeSite.heading + angle, 0);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
    if (tint) mesh.setColorAt(index, color.set(tint));
  }

  function line(mesh: THREE.InstancedMesh, index: number, a: [number, number, number], b: [number, number, number], radius: number) {
    transformPoint(...a, from);
    transformPoint(...b, to);
    dummy.position.copy(from).add(to).multiplyScalar(0.5);
    direction.subVectors(to, from);
    const length = direction.length();
    dummy.quaternion.setFromUnitVectors(yAxis, direction.normalize());
    dummy.scale.set(radius, length, radius);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }

  function box(x: number, y: number, z: number, w: number, h: number, d: number, tint: string, angle = 0) {
    if (boxCursor >= 20) return;
    place(boxes, activeSlot * 20 + boxCursor++, x, y, z, w, h, d, angle, tint);
  }
  function round(x: number, y: number, z: number, rx: number, ry: number, rz: number, tint: string) {
    if (roundCursor >= 16) return;
    place(rounds, activeSlot * 16 + roundCursor++, x, y, z, rx, ry, rz, 0, tint);
  }
  function rod(a: [number, number, number], b: [number, number, number], radius = 0.018) {
    if (rodCursor >= 24) return;
    line(rods, activeSlot * 24 + rodCursor++, a, b, radius);
  }
  function wheel(x: number, y: number, z: number, radius: number) {
    if (wheelCursor >= 4) return;
    place(wheels, activeSlot * 4 + wheelCursor++, x, y, z, radius, radius, radius, Math.PI / 2);
  }
  function actorPoint(x: number, y: number, z: number): [number, number, number] {
    return [actorX + (x * Math.cos(actorHeading) + z * Math.sin(actorHeading)) * actorScale,
      y * actorScale, actorZ + (z * Math.cos(actorHeading) - x * Math.sin(actorHeading)) * actorScale];
  }
  function joint(mesh: THREE.InstancedMesh, index: number, a: [number, number, number], b: [number, number, number], thickness: number) {
    line(mesh, index, actorPoint(...a), actorPoint(...b), thickness * actorScale);
  }
  function anatomy(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, tint?: string) {
    place(mesh, index, ...actorPoint(x, y, z), sx * actorScale, sy * actorScale, sz * actorScale, actorHeading, tint);
  }

  type Gesture = "walk" | "talk" | "wave" | "hold" | "kneel" | "sit" | "run" | "taichi" | "photo" | "phone" | "work";
  function actor(index: number, x: number, z: number, heading: number, seconds: number, gesture: Gesture, tint: string, scale = 1) {
    actorX = x; actorZ = z; actorHeading = heading; actorScale = scale;
    const moving = gesture === "walk" || gesture === "run";
    const step = Math.sin(seconds * (gesture === "run" ? 8.4 : 5.4) + index);
    const legSwing = moving ? step * (gesture === "run" ? 0.42 : 0.28) : 0;
    const seated = gesture === "sit";
    const kneeling = gesture === "kneel";
    const hipsY = seated ? 0.43 : kneeling ? 0.56 : 0.91;
    const bob = moving ? Math.abs(step) * 0.025 : Math.sin(seconds * 1.5 + index) * 0.005;
    const chestY = hipsY + 0.37 + bob;
    const headY = hipsY + 0.77 + bob;
    const lean = kneeling ? 0.18 : gesture === "run" ? 0.08 : 0;
    anatomy(pelvis, index, 0, hipsY, 0, 0.35, 0.24, 0.28);
    anatomy(torsos, index, 0, chestY, lean, 0.45, 0.58, 0.3, tint);
    anatomy(heads, index, 0, headY, lean, 0.28, 0.31, 0.29);
    anatomy(hairMesh, index, 0, headY + 0.006, lean, 0.282, 0.315, 0.292);
    for (const side of [-1, 1]) {
      const limbIndex = index * 2 + (side + 1) / 2;
      const footZ = seated ? 0.38 : kneeling ? (side === 1 ? 0.3 : -0.2) : legSwing * side;
      const footY = moving ? Math.max(0, -step * side) * 0.08 : 0;
      const kneeY = seated ? 0.35 : kneeling ? 0.19 : 0.49;
      const kneeZ = seated ? 0.36 : kneeling ? 0.22 : footZ * 0.42 + 0.035;
      joint(thighs, limbIndex, [side * 0.095, hipsY, 0], [side * 0.1, kneeY, kneeZ], 0.19);
      joint(calves, limbIndex, [side * 0.1, kneeY, kneeZ], [side * 0.1, 0.1 + footY, footZ], 0.145);
      anatomy(shoes, limbIndex, side * 0.1, 0.065 + footY, footZ + 0.055, 0.15, 0.13, 0.27);
      let handY = chestY - 0.38, handX = side * 0.25, handZ = lean - legSwing * side;
      if (gesture === "talk" || gesture === "work") { handY = chestY - 0.13 + Math.sin(seconds * 2.1 + side + index) * 0.09; handZ = 0.32 + lean; }
      if (gesture === "wave" && side === 1) { handY = headY + 0.2; handX = 0.38 + Math.sin(seconds * 5) * 0.09; }
      if (gesture === "hold" || gesture === "photo") { handY = gesture === "photo" ? headY - 0.03 : chestY - 0.08; handZ = 0.37 + lean; handX = side * 0.14; }
      if (gesture === "kneel" || gesture === "sit") { handY = hipsY + 0.08; handZ = 0.4; }
      if (gesture === "phone" && side === 1) { handY = headY - 0.02; handX = 0.18; handZ = 0.08; }
      if (gesture === "taichi") { handY = chestY + Math.sin(seconds * 0.55 + side) * 0.2; handX = side * (0.38 + Math.sin(seconds * 0.55) * 0.12); handZ = 0.16 + Math.cos(seconds * 0.55 + side) * 0.15; }
      const elbow: [number, number, number] = [side * 0.28, (chestY + handY) / 2 - 0.09, (lean + handZ) / 2 + 0.025];
      joint(upperArms, limbIndex, [side * 0.22, chestY + 0.13, lean], elbow, 0.16);
      joint(forearms, limbIndex, elbow, [handX, handY, handZ], 0.135);
      anatomy(hands, limbIndex, handX, handY - 0.025, handZ, 0.095, 0.15, 0.08);
      upperArms.setColorAt(limbIndex, color.set(tint));
    }
  }

  function table(x: number, z: number, height = 0.79, width = 1.5) {
    box(x, height, z, width, 0.055, 0.78, "#846b4e");
    for (const dx of [-width * 0.4, width * 0.4]) for (const dz of [-0.29, 0.29]) rod([x + dx, 0, z + dz], [x + dx, height, z + dz], 0.025);
  }

  function animate(seconds: number) {
    // Unused instances are zero-sized; resources are allocated only once at construction.
    dummy.position.set(0, -30, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (const mesh of meshes) for (let index = 0; index < mesh.count; index++) mesh.setMatrixAt(index, dummy.matrix);

    for (const event of sampleStreetActivities(seconds)) {
      activeSite = event.site; activeSlot = event.slot;
      boxCursor = 0; roundCursor = 0; rodCursor = 0; wheelCursor = 0;
      const { spec, progress, elapsed } = event;
      const arriving = event.phase === "arriving", leaving = event.phase === "leaving";
      const approach = arriving ? (1 - progress / 0.16) * -5 : leaving ? (progress - 0.84) / 0.16 * 5 : 0;
      const staticAction = !arriving && !leaving;
      const walkingGroup = spec.id === "running" || spec.id === "commute";
      const actorPositions: [number, number, number][] = [];
      for (let member = 0; member < spec.actors; member++) {
        let x = (member % 2 === 0 ? -0.85 : 0.85) + approach;
        let z = Math.floor(member / 2) * 0.72 - 0.4;
        let heading = member % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
        let gesture: Gesture = "talk";
        let scale = 1;
        if (walkingGroup) {
          x = -5 + progress * 10 + member * 0.48;
          z = (member % 2) * 0.65 - 0.4;
          heading = Math.PI / 2;
          gesture = spec.id === "running" ? "run" : "walk";
        } else if (spec.id === "bus") {
          x = member * 0.68 - 1.35 + approach;
          z = 0; heading = Math.PI / 2; gesture = member % 2 ? "phone" : "hold";
        } else if (spec.id === "tour") {
          if (member === 0) { x = approach; z = 0.7; heading = Math.PI; gesture = "wave"; }
          else { x = (member - 2.5) * 0.65 + approach; z = -0.65; heading = 0; }
        } else if (spec.id === "taichi") {
          x = (member % 2) * 1.25 - 0.6 + approach; z = Math.floor(member / 2) * 1.2 - 0.6;
          heading = 0; gesture = "taichi";
        } else if (spec.id === "school") {
          scale = member === 1 ? 0.68 : 1; gesture = member === 1 ? "wave" : "talk";
        } else if (spec.id === "photo") {
          gesture = member === 0 ? "photo" : "wave";
          if (member === 0) { x = -2.3 + approach; z = 0; }
          else { x = 1 + approach; z = (member - 1.5) * 0.7; }
        } else if (spec.id === "picnic" || spec.id === "chess") {
          gesture = "sit";
        } else if (spec.id === "bicycle" || spec.id === "gardening") {
          gesture = member === 0 ? "kneel" : "hold";
        } else if (spec.id === "phone") {
          gesture = "phone";
        } else if (spec.id === "coffee" || spec.id === "lunch" || spec.id === "books" || spec.id === "market" || spec.id === "courier") {
          gesture = "hold";
        } else if (spec.id === "painting" || spec.id === "sweeping" || spec.id === "music") {
          gesture = member === 0 ? "work" : "talk";
        } else if (spec.id === "basketball" || spec.id === "kite") {
          gesture = "hold";
        }
        if (!walkingGroup && !staticAction) { gesture = "walk"; heading = Math.PI / 2; }
        const tint = member === 0 ? spec.color : ["#8d8b78", "#697a81", "#8b6460", "#75816c"][member - 1];
        actor(event.slot * actorsPerSlot + member, x, z, heading, elapsed + member * 0.3, gesture, tint, scale);
        actorPositions.push([x, z, heading]);
      }

      if (spec.id === "dog") {
        const dx = approach - 0.2 + Math.sin(elapsed * 0.48) * 0.7;
        const dz = 0.7 + Math.cos(elapsed * 0.39) * 0.35;
        round(dx, 0.36, dz, 0.38, 0.19, 0.14, "#9c7756");
        round(dx + 0.31, 0.46, dz, 0.14, 0.15, 0.12, "#8a654b");
        round(dx + 0.42, 0.42, dz, 0.1, 0.065, 0.075, "#483d35");
        for (const lx of [-0.23, 0.23]) for (const lz of [-0.09, 0.09]) rod([dx + lx, 0.34, dz + lz], [dx + lx + Math.sin(elapsed * 5 + lx * 9) * 0.045, 0.06, dz + lz], 0.035);
        rod([dx - 0.29, 0.4, dz], [dx - 0.53, 0.5 + Math.sin(elapsed * 5) * 0.04, dz], 0.025);
        rod([actorPositions[0][0] + 0.2, 1.04, actorPositions[0][1]], [dx + 0.26, 0.48, dz], 0.006);
      }
      if (spec.id === "coffee" || spec.id === "lunch" || spec.id === "books" || spec.id === "market" || spec.id === "chess") {
        table(0, 0, spec.id === "chess" ? 0.55 : 0.79);
        if (spec.id === "books") for (let i = 0; i < 5; i++) box((i - 2) * 0.23, 0.85 + (i % 2) * 0.025, 0, 0.2, 0.045, 0.29, ["#5d7177", "#9f7059", "#7b805c"][i % 3]);
        if (spec.id === "market") for (let i = 0; i < 12; i++) round((i % 4 - 1.5) * 0.2, 0.91, (Math.floor(i / 4) - 1) * 0.18, 0.085, 0.08, 0.085, i % 3 ? "#b1a053" : "#a95e46");
        if (spec.id === "chess") {
          box(-0.85, 0.2, -0.4, 0.4, 0.4, 0.4, "#7c6b52");
          box(0.85, 0.2, -0.4, 0.4, 0.4, 0.4, "#7c6b52");
          box(-0.85, 0.2, 0.32, 0.4, 0.4, 0.4, "#7c6b52");
          box(0, 0.59, 0, 0.58, 0.02, 0.58, "#d0b687");
          for (let i = 0; i < 12; i++) round((i % 4 - 1.5) * 0.13, 0.62, (Math.floor(i / 4) - 1) * 0.16, 0.035, 0.05, 0.035, i % 2 ? "#3c3833" : "#e4d7bd");
        }
        if (spec.id === "lunch") for (let i = 0; i < 4; i++) box((i % 2 - 0.5) * 0.6, 0.85, (Math.floor(i / 2) - 0.5) * 0.36, 0.26, 0.09, 0.18, "#c9b89d");
        if (spec.id === "coffee") for (let i = 0; i < 3; i++) round((i - 1) * 0.42, 0.89, 0.05, 0.055, 0.09, 0.055, "#e0d9c5");
      }
      if (spec.id === "courier") {
        const cx = -1.6 + approach;
        box(cx, 0.21, 0.65, 0.65, 0.08, 0.8, "#6f797a");
        rod([cx, 0.2, 1], [cx, 1.02, 1], 0.03);
        wheel(cx, 0.12, 0.35, 0.12); wheel(cx, 0.12, 0.95, 0.12);
        for (let i = 0; i < 3; i++) box(cx, 0.38 + i * 0.26, 0.65, 0.5, 0.25, 0.48, "#ae8b5d");
        const handoff = staticAction ? (Math.sin(elapsed * 0.55) + 1) * 0.5 : 0;
        box(approach - 0.45 + handoff * 0.9, 1.15, -0.4, 0.34, 0.24, 0.26, "#bf9c70");
      }
      if (spec.id === "music") {
        const [x, z] = actorPositions[0];
        round(x + 0.25, 0.97, z, 0.09, 0.21, 0.16, "#9f7448");
        round(x + 0.25, 1.18, z, 0.07, 0.13, 0.12, "#a77c50");
        rod([x + 0.25, 1.17, z], [x + 0.25, 1.63, z - 0.25], 0.035);
        box(x + 0.5, 0.07, z + 0.5, 0.34, 0.1, 0.8, "#4c433b", 0.3);
      }
      if (spec.id === "photo") {
        const [x, z] = actorPositions[0];
        box(x + 0.34, staticAction ? 1.65 : 1.08, z, 0.12, 0.13, 0.2, "#343a3c");
        round(x + 0.43, staticAction ? 1.65 : 1.08, z, 0.07, 0.055, 0.055, "#405461");
      }
      if (spec.id === "tour") {
        rod([approach + 0.2, 0.5, 0.7], [approach + 0.2, 2.7, 0.7], 0.018);
        box(approach + 0.42, 2.5, 0.7 + Math.sin(elapsed * 2) * 0.035, 0.45, 0.28, 0.025, "#a85e4d");
      }
      if (spec.id === "bicycle") {
        wheel(0, 0.37, -0.61, 0.34); wheel(0, 0.37, 0.61, 0.34);
        rod([0, 0.37, -0.61], [0, 0.82, -0.14], 0.023);
        rod([0, 0.82, -0.14], [0, 0.4, 0.04], 0.023);
        rod([0, 0.4, 0.04], [0, 0.37, -0.61], 0.023);
        rod([0, 0.82, -0.14], [0, 0.86, 0.42], 0.023);
        rod([0, 0.86, 0.42], [0, 0.4, 0.04], 0.023);
        rod([0, 0.86, 0.42], [0, 0.37, 0.61], 0.023);
        rod([0, 0.86, 0.42], [0, 1.03, 0.43], 0.023);
        rod([-0.23, 1.03, 0.43], [0.23, 1.03, 0.43], 0.023);
        box(0, 0.87, -0.16, 0.16, 0.05, 0.25, "#3e4242");
        const pumping = 0.37 + Math.sin(elapsed * 3) * 0.12;
        rod([-0.5, 0.07, 0.61], [-0.5, pumping, 0.61], 0.035);
        rod([-0.65, pumping, 0.61], [-0.35, pumping, 0.61], 0.02);
      }
      if (spec.id === "sweeping") {
        const [x, z] = actorPositions[0];
        const sweep = Math.sin(elapsed * 2) * 0.3;
        rod([x + 0.28, 1.2, z], [x + 0.55, 0.08, z + sweep], 0.018);
        box(x + 0.55, 0.07, z + sweep, 0.09, 0.1, 0.38, "#957c53");
        for (let i = 0; i < 8; i++) round(x + 0.65 + (i % 4) * 0.09, 0.025, z + (Math.floor(i / 4) - 0.5) * 0.13, 0.055, 0.008, 0.035, "#9c8155");
      }
      if (spec.id === "gardening") {
        box(0, 0.12, 0, 0.7, 0.24, 0.8, "#99775e");
        for (let i = 0; i < 5; i++) {
          const x = Math.sin(i * 2.4) * 0.24, z = Math.cos(i * 2.4) * 0.26;
          rod([x, 0.21, z], [x, 0.5, z], 0.009);
          round(x, 0.5, z, 0.05, 0.04, 0.055, "#b7a16c");
        }
        round(-0.43, 0.35, -0.1, 0.12, 0.15, 0.1, "#687d75");
        rod([-0.4, 0.36, -0.1], [-0.2, 0.41, -0.1], 0.025);
      }
      if (spec.id === "kite") {
        const kx = 2 + Math.sin(elapsed * 0.6) * 0.8;
        const ky = 7.5 + Math.sin(elapsed * 0.8) * 0.5;
        const kz = 1.4 + Math.cos(elapsed * 0.5) * 0.6;
        box(kx, ky, kz, 0.8, 0.018, 1, "#a65d4d", Math.PI / 4);
        rod([actorPositions[0][0] + 0.2, 1.22, actorPositions[0][1]], [kx, ky, kz], 0.004);
        for (let i = 0; i < 6; i++) {
          const tx = kx + Math.sin(elapsed * 3 - i * 0.8) * 0.1;
          box(tx, ky - i * 0.18, kz + 0.6 + i * 0.08, 0.05, 0.15, 0.02, i % 2 ? "#d7b778" : "#9c6951");
        }
      }
      if (spec.id === "basketball") {
        const phase = (elapsed % 1.1) / 1.1;
        const bounceT = phase * 0.88;
        const ballY = 0.12 + 4.316 * bounceT - 0.5 * 9.80665 * bounceT * bounceT;
        round(approach + Math.sin(elapsed * 1.3) * 0.48, Math.max(0.12, ballY), -0.4, 0.12, 0.12, 0.12, "#ad6b3e");
      }
      if (spec.id === "picnic") {
        box(0, 0.012, 0, 2.4, 0.02, 1.9, "#8e8270");
        box(0, 0.2, 0, 0.45, 0.35, 0.33, "#ab8d60");
        for (let i = 0; i < 4; i++) round((i % 2 - 0.5) * 0.65, 0.08, (Math.floor(i / 2) - 0.5) * 0.4, 0.06, 0.08, 0.06, "#d4c9ad");
      }
      if (spec.id === "painting") {
        rod([0, 0, -0.35], [-0.2, 1.5, 0], 0.025);
        rod([0, 0, 0.35], [0.2, 1.5, 0], 0.025);
        rod([0.4, 0, 0], [0, 1.4, 0], 0.025);
        box(0, 1.3, 0, 0.6, 0.55, 0.035, "#c4c1a8");
        box(0, 1.18, 0.022, 0.5, 0.23, 0.015, "#78959a");
      }
      if (spec.id === "phone" || spec.id === "bus") {
        for (let i = 0; i < actorPositions.length; i++) {
          const [x, z] = actorPositions[i];
          box(x + 0.06, spec.id === "phone" ? 1.67 : 1.15, z - 0.18, 0.025, 0.14, 0.075, "#3b4549");
        }
      }
      if (spec.id === "commute") for (const [x, z] of actorPositions) box(x, 0.76, z - 0.27, 0.14, 0.3, 0.38, "#55504a");
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
  animate(0);
  return { animate };
}
