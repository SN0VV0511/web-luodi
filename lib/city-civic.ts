import * as THREE from "three";
import type { PlaceId } from "./city-content";
import { civicLots } from "./city-map";

/** 公共街区复用主场景的实例批次、纹理登记与统一资源释放。 */
export type CivicKit = {
  group: THREE.Group;
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
  nightMaterials: { material: THREE.MeshStandardMaterial; day: number; night: number }[];
  box: (material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number, place?: PlaceId) => void;
  part: (material: THREE.Material, geometry: THREE.BufferGeometry, x: number, y: number, z: number, sx: number, sy: number, sz: number, place?: PlaceId, rotationY?: number, rotationZ?: number) => void;
  beam: (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) => void;
  tree: (x: number, z: number, size?: number, shade?: number, y?: number) => void;
  solid: (color: string, roughness?: number, metalness?: number) => THREE.MeshStandardMaterial;
  canvasTexture: (width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) => THREE.CanvasTexture;
};
export type CivicLandmark = { name: string; x: number; z: number; height: number };

export type ParkWalk = { id: string; closed: boolean; width: number; points: readonly (readonly [number, number])[] };
const lakePoints = (shore = 0): [number, number][] => Array.from({ length: 64 }, (_, index) => {
  const a = index / 64 * Math.PI * 2;
  const r = 1 + Math.sin(a * 3) * 0.08 + Math.cos(a * 5) * 0.035;
  return [-12 + Math.cos(a) * (27.5 * r + shore), -15 + Math.sin(a) * (37.5 * r + shore)];
});

/** 行人与模型共享同一曲线控制点，环湖步道不会穿过湖面。 */
export const centralParkWalks: readonly ParkWalk[] = [
  { id: "lakeside", closed: true, width: 3, points: lakePoints(5.5) },
  { id: "south", closed: false, width: 3.6, points: [[0,82],[-4,66],[-13,50],[-15,36],[-12,25]] },
  { id: "east", closed: false, width: 3.6, points: [[62,-10],[48,-11],[35,-9],[22,-13]] },
  { id: "west", closed: false, width: 3.6, points: [[-62,10],[-54,5],[-47,-3],[-45,-11]] },
  { id: "north", closed: false, width: 3.6, points: [[0,-100],[-5,-87],[-8,-74],[-12,-61]] },
  { id: "playground", closed: false, width: 2.6, points: [[-4,66],[14,60],[27,48],[35,42],[42,34],[44,16],[48,-11]] },
  { id: "pavilion", closed: false, width: 2.6, points: [[-13,50],[-27,50],[-36,52],[-47,45],[-51,29],[-54,5]] },
  { id: "plaza", closed: false, width: 2.8, points: [[-5,-87],[12,-85],[28,-79],[42,-71],[41,-58],[35,-52],[31,-35],[22,-13]] },
];
/** 座顶为0.78米；与行人坐姿共享位置和旋转角度。 */
export const centralParkBenches = [
  { x: 18.5, z: -2, angle: -Math.PI / 2 },
  { x: -40.2, z: -22, angle: Math.PI / 2 },
  { x: -16, z: 29, angle: Math.PI },
  { x: -34, z: 54.5, angle: -Math.PI / 2 },
  { x: 35, z: -59, angle: Math.PI },
  { x: 35, z: 47, angle: Math.PI / 2 },
] as const;
export const centralParkGatherings = [{x:30,z:-66},{x:39,z:37},{x:-30,z:53},{x:9,z:67}] as const;


/** 分区公共设施与连续中央公园；公共楼保持在各自街区十五米边界内。 */
export function buildCivicDistrict(kit: CivicKit): { landmarks: CivicLandmark[] } {
  const { box, part, beam, tree, solid } = kit;
  const landmarks: CivicLandmark[] = [];
  const civic = (kind: typeof civicLots[number]["kind"]) => {
    const site = civicLots.find((lot) => lot.kind === kind);
    if (!site) throw new Error(`缺少公共设施位置: ${kind}`);
    return site;
  };
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => {
    kit.geometries.add(value);
    return value;
  };
  const cube = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 20));
  const sphere = geometry(new THREE.SphereGeometry(1, 12, 8));
  const dome = geometry(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
  const pavilionRoof = geometry(new THREE.ConeGeometry(1, 1, 6));
  const plane = geometry(new THREE.PlaneGeometry(1, 1));
  const stone = solid("#cfc5b2");
  const ivory = solid("#dedacd");
  const white = solid("#edf0e8");
  const concrete = solid("#b3b3a4");
  const path = solid("#c2b79e");
  const asphalt = solid("#576160");
  const glass = solid("#477183", 0.27, 0.24);
  const litWindow = solid("#547888", 0.3, 0.2);
  litWindow.emissive.set("#ffcd83");
  kit.nightMaterials.push({ material: litWindow, day: 0, night: 0.9 });
  const bulb = solid("#f7dab0");
  bulb.emissive.set("#ffd08d");
  kit.nightMaterials.push({ material: bulb, day: 0, night: 2.4 });
  const slate = solid("#596563");
  const roof = solid("#8c6956");
  const copper = solid("#658978", 0.55, 0.24);
  const red = solid("#b7493c");
  const blue = solid("#365d7e");
  const rubber = solid("#343c3b");
  const metal = solid("#576661", 0.44, 0.42);
  const timber = solid("#9c7650");
  const grass = solid("#829165");
  const grassDark = solid("#6b815b");
  const hedge = solid("#506c47");
  const sand = solid("#d6c39a");
  const water = solid("#5c9190", 0.28, 0.22);
  const clay = solid("#b56d54");
  const yellow = solid("#d8ac4f");
  const flowers = [solid("#d1a05d"), solid("#aa7774"), solid("#c7c8a3")];

  const at = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const line = (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, radius = 0.055, material = metal) =>
    beam(at(x1, y1, z1), at(x2, y2, z2), radius, material);

  function sign(text: string, x: number, y: number, z: number, width: number, height: number, background = "#344f4f", foreground = "#eee8d8") {
    const texture = kit.canvasTexture(768, Math.max(128, Math.round(768 * height / width)), (ctx) => {
      const { width: w, height: h } = ctx.canvas;
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = foreground;
      ctx.lineWidth = 2;
      ctx.strokeRect(12, 12, w - 24, h - 24);
      ctx.fillStyle = foreground;
      ctx.font = `600 ${Math.round(h * 0.49)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, h / 2, w * 0.91);
    });
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.73 });
    kit.materials.add(material);
    const board = new THREE.Mesh(plane, material);
    board.position.set(x, y, z);
    board.scale.set(width, height, 1);
    kit.group.add(board);
    box(slate, x, y, z - 0.12, width + 0.15, height + 0.12, 0.2);
  }

  function windowGrid(x: number, z: number, width: number, depth: number, floors: number, floorHeight = 3.4, base = 0.5) {
    const columns = Math.max(2, Math.floor(width / 3));
    for (let floor = 0; floor < floors; floor++) {
      const y = base + floorHeight * (floor + 0.56);
      for (let col = 0; col < columns; col++) {
        const wx = x - width / 2 + (col + 0.5) * width / columns;
        for (const side of [-1, 1]) {
          box((floor + col) % 3 ? litWindow : glass, wx, y, z + side * (depth / 2 + 0.045), 1.6, 1.65, 0.09);
          box(ivory, wx, y - 0.89, z + side * (depth / 2 + 0.14), 1.85, 0.13, 0.3);
        }
      }
      for (let row = 0; row < Math.floor(depth / 3.2); row++) {
        const wz = z - depth / 2 + 1.8 + row * 3.2;
        for (const side of [-1, 1]) box(glass, x + side * (width / 2 + 0.045), y, wz, 0.09, 1.65, 1.6);
      }
    }
  }

  function bench(x: number, z: number, angle = Math.PI / 2) {
    const member = (material: THREE.Material, dx: number, y: number, dz: number, w: number, h: number, d: number) =>
      part(material, cube, x + dx * Math.cos(angle) + dz * Math.sin(angle), y + 0.2, z - dx * Math.sin(angle) + dz * Math.cos(angle), w, h, d, undefined, angle);
    for (const dz of [-0.17, 0, 0.17]) member(timber, 0, 0.53, dz, 1.9, 0.1, 0.135);
    for (const dx of [-0.65, 0.65]) {
      member(metal, dx, 0.32, 0, 0.09, 0.43, 0.44);
      member(metal, dx, 0.68, -0.25, 0.08, 0.98, 0.08);
      member(metal, dx, 0.84, 0, 0.075, 0.08, 0.58);
    }
    for (const y of [0.78, 0.98]) member(timber, 0, y, -0.25, 1.9, 0.15, 0.085);
  }

  function lamp(x: number, z: number) {
    part(metal, cylinder, x, 1.8, z, 0.065, 3.4, 0.065);
    part(bulb, sphere, x, 3.55, z, 0.23, 0.25, 0.23);
    part(metal, pavilionRoof, x, 3.8, z, 0.4, 0.16, 0.4);
  }

  function cross(x: number, y: number, z: number, size: number, material = red) {
    box(material, x, y, z, size * 0.3, size, 0.16);
    box(material, x, y, z + 0.01, size, size * 0.3, 0.16);
  }

  function vehicle(x: number, z: number, kind: "police" | "ambulance" | "fire") {
    const fire = kind === "fire";
    const ambulance = kind === "ambulance";
    const length = fire ? 6.3 : ambulance ? 5.4 : 4.6;
    const body = fire ? red : white;
    box(rubber, x, 0.72, z, 1.9, 0.26, length);
    box(body, x, fire || ambulance ? 1.63 : 1.11, z, 2, fire || ambulance ? 1.55 : 0.9, length - 0.1);
    box(glass, x, 1.84, z + length * 0.19, 1.86, 0.71, length * 0.3);
    box(body, x, 2.26, z + length * 0.19, 1.95, 0.14, length * 0.34);
    if (!fire && !ambulance) {
      box(blue, x, 1.08, z, 2.03, 0.3, length * 0.88);
      box(white, x, 2.3, z + 0.35, 1.96, 0.15, 1.65);
    }
    for (const side of [-1, 1]) {
      box(side < 0 ? blue : red, x + side * 0.39, 2.49, z + length * 0.15, 0.62, 0.2, 0.24);
      for (const axle of [-1, 1]) {
        part(rubber, cylinder, x + side * 1.02, 0.72, z + axle * length * 0.3, 0.38, 0.22, 0.38, undefined, 0, Math.PI / 2);
        part(concrete, cylinder, x + side * 1.15, 0.72, z + axle * length * 0.3, 0.19, 0.025, 0.19, undefined, 0, Math.PI / 2);
      }
      box(ivory, x + side * 0.68, 1.09, z + length / 2, 0.39, 0.23, 0.1);
      if (ambulance) {
        box(red, x + side * 1.03, 1.4, z - 0.65, 0.06, 0.16, 2.5);
        box(red, x + side * 1.035, 1.93, z - 0.75, 0.065, 0.85, 0.25);
        box(red, x + side * 1.04, 1.93, z - 0.75, 0.065, 0.25, 0.85);
      }
    }
    if (fire) {
      for (const side of [-1, 1]) {
        box(concrete, x + side * 1.035, 1.68, z - 1, 0.065, 0.98, 2.5);
        box(metal, x + side * 0.55, 2.57, z - 0.4, 0.085, 0.12, 4.5);
      }
      for (let rung = 0; rung < 10; rung++) box(concrete, x, 2.57, z - 2.35 + rung * 0.43, 1.12, 0.08, 0.08);
    }
  }

  function publicSite(x: number, z: number, name: string, height: number) {
    landmarks.push({ name, x, z, height });
    box(concrete, x, 0.18, z, 29.4, 0.2, 29.4);
    box(path, x, 0.31, z + 10.8, 28, 0.08, 6.5);
    for (const side of [-1, 1]) {
      tree(x + side * 12, z - 11, 0.85, side < 0 ? 1 : 2);
      lamp(x + side * 12.8, z + 12.5);
    }
  }

  // 市政府：柱廊、铜穹顶、踏步和独立前广场。
  {
    const { x, z } = civic("city-hall");
    publicSite(x, z, "市政府 · CITY HALL", 19);
    box(stone, x, 5.85, z - 3, 23, 10.9, 13);
    box(ivory, x, 11.65, z - 3, 24.1, 0.65, 14.1);
    windowGrid(x, z - 3, 23, 13, 3);
    for (let step = 0; step < 4; step++) box(stone, x, 0.38 + step * 0.16, z + 7.3 - step * 0.45, 13.6, 0.25 + step * 0.26, 3.4 - step * 0.45);
    for (const dx of [-5.4, -3.6, 3.6, 5.4]) {
      part(ivory, cylinder, x + dx, 4.15, z + 5.25, 0.35, 6.4, 0.35);
      part(stone, cylinder, x + dx, 1.05, z + 5.25, 0.5, 0.3, 0.5);
      part(stone, cylinder, x + dx, 7.3, z + 5.25, 0.49, 0.35, 0.49);
    }
    box(ivory, x, 7.8, z + 4.95, 13.7, 0.8, 3.3);
    box(glass, x, 3.1, z + 3.58, 3.4, 4.6, 0.13);
    sign("CITY HALL", x, 9.7, z + 3.61, 11.8, 1.5, "#777b69");
    part(stone, cylinder, x, 12.7, z - 3.5, 4.15, 1.5, 4.15);
    part(copper, dome, x, 13.45, z - 3.5, 4.3, 3.8, 4.3);
    part(ivory, cylinder, x, 17.8, z - 3.5, 0.67, 1.2, 0.67);
    part(copper, pavilionRoof, x, 18.65, z - 3.5, 1, 0.7, 1);
    part(metal, cylinder, x - 10.3, 4.1, z + 8.8, 0.075, 7.5, 0.075);
    box(blue, x - 9.05, 6.75, z + 8.8, 2.45, 1.4, 0.07);
    bench(x + 10.2, z + 7.8, Math.PI / 2);
    for (const dx of [-9, 9]) box(hedge, x + dx, 0.71, z + 3.2, 3.6, 0.85, 1.4);
  }

  // 警察局与停在前院的蓝白巡逻车。
  {
    const { x, z } = civic("police");
    publicSite(x, z, "警察局 · POLICE", 11);
    box(white, x, 4.8, z - 3, 24, 8.9, 15);
    box(blue, x, 1.05, z - 3, 24.3, 1.35, 15.3);
    box(slate, x, 9.45, z - 3, 24.8, 0.45, 15.8);
    windowGrid(x, z - 3, 24, 15, 2, 3.7, 1.2);
    box(glass, x, 2.1, z + 4.6, 4.8, 3.4, 0.12);
    box(blue, x, 4.2, z + 5.45, 8, 0.38, 2.1);
    sign("POLICE", x, 7.85, z + 4.62, 11.5, 1.45, "#345b76");
    part(metal, cylinder, x - 9, 11.4, z - 6, 0.065, 4, 0.065);
    line(x - 9.9, 12.4, z - 6, x - 8.1, 12.4, z - 6, 0.055);
    vehicle(x + 8.5, z + 10.2, "police");
    box(blue, x - 10, 1.6, z + 7, 0.65, 2.5, 0.65);
    sign("P", x - 10, 2.55, z + 7.35, 0.75, 0.8, "#345b76");
  }

  // 医院：双翼、入口雨篷、救护车与有边缘灯的屋顶停机坪。
  {
    const { x, z } = civic("hospital");
    publicSite(x, z, "医院 · HOSPITAL", 17);
    for (const dx of [-8, 8]) {
      box(white, x + dx, 5.7, z - 2, 9, 10.8, 19);
      box(copper, x + dx, 11.3, z - 2, 9.6, 0.4, 19.6);
      windowGrid(x + dx, z - 2, 9, 19, 3);
    }
    box(white, x, 7.65, z - 4, 8, 14.7, 13);
    windowGrid(x, z - 4, 8, 13, 4);
    box(copper, x, 15.3, z - 4, 8.5, 0.6, 13.5);
    cross(x, 12.8, z + 2.64, 3);
    box(glass, x, 2, z + 2.65, 5.8, 3.3, 0.15);
    box(red, x, 4.45, z + 4.1, 8.4, 0.28, 4);
    sign("HOSPITAL", x, 6.1, z + 2.67, 7.3, 1.15, "#677f7f");
    part(asphalt, cylinder, x + 8, 11.65, z - 2, 4.05, 0.14, 4.05);
    const ring = geometry(new THREE.RingGeometry(3.35, 3.45, 48));
    ring.rotateX(-Math.PI / 2);
    part(yellow, ring, x + 8, 11.75, z - 2, 1, 1, 1);
    for (const dx of [-0.7, 0.7]) box(white, x + 8 + dx, 11.76, z - 2, 0.22, 0.03, 2.1);
    box(white, x + 8, 11.77, z - 2, 1.55, 0.03, 0.24);
    for (let i = 0; i < 8; i++) part(yellow, sphere, x + 8 + Math.cos(i * Math.PI / 4) * 3.8, 11.85, z - 2 + Math.sin(i * Math.PI / 4) * 3.8, 0.09, 0.08, 0.09);
    vehicle(x + 9, z + 11, "ambulance");
    bench(x - 7.8, z + 10.4, 0);
  }

  // 消防站保留可辨认的三扇卷帘门、消防车和屋顶训练塔。
  {
    const { x, z } = civic("fire");
    publicSite(x, z, "消防局 · FIRE STATION", 13);
    box(stone, x, 4.1, z - 2.8, 25, 7.55, 17);
    box(red, x, 6.7, z - 2.8, 25.3, 2.3, 17.3);
    box(slate, x, 8.25, z - 2.8, 25.8, 0.4, 17.8);
    for (const dx of [-8, 0, 8]) {
      box(concrete, x + dx, 2.75, z + 5.76, 5.6, 4.7, 0.15);
      for (let stripe = 0; stripe < 7; stripe++) box(slate, x + dx, 0.78 + stripe * 0.61, z + 5.87, 5.45, 0.035, 0.05);
      box(glass, x + dx, 3.72, z + 5.91, 4.6, 0.62, 0.08);
    }
    sign("FIRE STATION", x, 6.65, z + 5.91, 15.3, 1.05, "#9c493f");
    box(stone, x - 9.4, 10.3, z - 7.5, 4.1, 4, 5);
    for (const y of [9.4, 11]) box(glass, x - 9.4, y, z - 4.94, 1.5, 0.8, 0.1);
    vehicle(x + 8, z + 10.9, "fire");
    box(red, x - 12.7, 0.82, z + 8.4, 0.38, 0.85, 0.38);
    box(red, x - 12.7, 1.11, z + 8.4, 0.8, 0.2, 0.26);
  }

  // 小学前院与有独立门柱的校园入口。
  {
    const { x, z } = civic("school");
    publicSite(x, z, "海岸小学 · PRIMARY SCHOOL", 11);
    box(ivory, x, 4.05, z - 5, 26, 7.4, 11.5);
    box(stone, x, 0.7, z - 5, 26.4, 0.9, 12);
    windowGrid(x, z - 5, 26, 11.5, 2, 3.6);
    const profile = new THREE.Shape();
    profile.moveTo(-1, 0); profile.lineTo(0, 1); profile.lineTo(1, 0); profile.closePath();
    const pitchedRoof = geometry(new THREE.ExtrudeGeometry(profile, { depth: 2, bevelEnabled: false }));
    pitchedRoof.translate(0, 0, -1);
    part(roof, pitchedRoof, x, 7.8, z - 5, 13.5, 2.5, 6.15);
    box(glass, x, 2.2, z + 0.8, 3.3, 3.5, 0.13);
    sign("COASTSIDE PRIMARY SCHOOL", x, 6.3, z + 0.9, 19.5, 1.05, "#716949");
    box(clay, x - 5, 0.37, z + 7, 12.5, 0.1, 9.8);
    for (let n = 0; n < 5; n++) {
      box(white, x - 5 + (n % 2 ? 0.32 : -0.32), 0.43, z + 4 + n * 0.7, 0.61, 0.025, 0.64);
      box(clay, x - 5 + (n % 2 ? 0.32 : -0.32), 0.45, z + 4 + n * 0.7, 0.51, 0.025, 0.54);
    }
    for (const dx of [-13, 13]) {
      box(stone, x + dx, 1.3, z + 11.8, 0.7, 2.05, 0.8);
      line(x + dx, 1.2, z + 2, x + dx, 1.2, z + 11.5, 0.06);
      for (let f = 0; f < 9; f++) box(metal, x + dx, 0.96, z + 2 + f, 0.055, 1.35, 0.055);
    }
    box(timber, x + 6.6, 1.45, z + 7, 3, 2.25, 0.18);
    sign("SCHOOL GARDEN", x + 6.6, 1.7, z + 7.13, 2.75, 0.65, "#677249");
    for (const dz of [4, 9.7]) for (const dx of [5, 9.8]) {
      box(timber, x + dx, 0.58, z + dz, 2.6, 0.52, 2);
      box(hedge, x + dx, 0.98, z + dz, 2.2, 0.38, 1.6);
    }
  }

  // 运动场：环形跑道、篮球线、球架与看台，均采用真实尺度。
  {
    const { x, z } = civic("stadium");
    landmarks.push({ name: "社区运动场 · SPORTS GROUND", x, z, height: 5 });
    box(grassDark, x, 0.21, z, 29.4, 0.22, 29.4);
    box(clay, x, 0.36, z, 27.6, 0.1, 26.5);
    box(grass, x, 0.43, z, 20.8, 0.08, 20.2);
    box(asphalt, x, 0.5, z, 14.2, 0.06, 23);
    for (const dx of [-6.4, 6.4]) box(white, x + dx, 0.55, z, 0.1, 0.025, 21.8);
    for (const dz of [-10.9, 0, 10.9]) box(white, x, 0.55, z + dz, 12.9, 0.025, 0.1);
    for (const dz of [-7.5, 7.5]) {
      for (const dx of [-2.25, 2.25]) box(white, x + dx, 0.55, z + dz, 0.1, 0.025, 6.7);
      box(white, x, 0.55, z + Math.sign(dz) * 4.15, 4.5, 0.025, 0.1);
    }
    const centerRing = geometry(new THREE.RingGeometry(1.7, 1.79, 48));
    centerRing.rotateX(-Math.PI / 2);
    part(white, centerRing, x, 0.56, z, 1, 1, 1);
    const hoop = geometry(new THREE.TorusGeometry(0.46, 0.035, 6, 20));
    hoop.rotateX(Math.PI / 2);
    for (const side of [-1, 1]) {
      box(metal, x, 1.92, z + side * 12.4, 0.16, 3.15, 0.16);
      line(x, 3.47, z + side * 12.4, x, 3.47, z + side * 10.5, 0.095);
      box(white, x, 3.75, z + side * 10.5, 1.8, 1.05, 0.11);
      box(red, x, 3.57, z + side * 10.42, 0.6, 0.43, 0.035);
      box(white, x, 3.58, z + side * 10.4, 0.51, 0.35, 0.035);
      part(red, hoop, x, 3.17, z + side * 9.95, 1, 1, 1);
      for (let strand = 0; strand < 8; strand++) {
        const a = strand * Math.PI / 4;
        line(x + Math.cos(a) * 0.44, 3.17, z + side * 9.95 + Math.sin(a) * 0.44, x + Math.cos(a) * 0.26, 2.68, z + side * 9.95 + Math.sin(a) * 0.26, 0.016, ivory);
      }
    }
    for (let lane = 0; lane < 3; lane++) {
      const inset = lane * 0.67;
      for (const side of [-1, 1]) {
        box(ivory, x + side * (13.2 - inset), 0.43, z, 0.07, 0.025, 24.8 - inset * 2);
        box(ivory, x, 0.43, z + side * (12.4 - inset), 26.4 - inset * 2, 0.025, 0.07);
      }
    }
    for (let row = 0; row < 3; row++) {
      box(concrete, x + 9.2 + row * 0.9, 0.6 + row * 0.34, z, 0.85, 0.4 + row * 0.7, 8);
      box(timber, x + 9.2 + row * 0.9, 0.86 + row * 0.69, z, 0.7, 0.12, 7.8);
    }
    sign("COASTSIDE SPORTS", x - 8.5, 1.7, z + 12.6, 6.5, 0.85);
  }

  function trail(walk: ParkWalk) {
    const curve = new THREE.CatmullRomCurve3(walk.points.map(([x, z]) => at(x, 0.39, z)), walk.closed);
    const vertices: number[] = [];
    const steps = Math.max(40, walk.points.length * 12);
    for (let i = 0; i <= steps; i++) {
      const point = curve.getPoint(i / steps);
      const tangent = curve.getTangent(i / steps);
      const normal = at(-tangent.z, 0, tangent.x).normalize().multiplyScalar(walk.width / 2);
      vertices.push(point.x - normal.x, point.y, point.z - normal.z, point.x + normal.x, point.y, point.z + normal.z);
    }
    const indices: number[] = [];
    for (let i = 0; i < steps; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const ribbon = geometry(new THREE.BufferGeometry());
    ribbon.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    ribbon.setIndex(indices); ribbon.computeVertexNormals();
    const mesh = new THREE.Mesh(ribbon, path);
    mesh.receiveShadow = true;
    kit.group.add(mesh);
  }

  function flatShape(points: readonly (readonly [number, number])[]) {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const value = geometry(new THREE.ShapeGeometry(shape));
    value.rotateX(-Math.PI / 2);
    return value;
  }

  function gazebo(x: number, z: number) {
    part(stone, cylinder, x, 0.47, z, 3.35, 0.36, 3.35);
    part(timber, cylinder, x, 0.76, z, 3.05, 0.18, 3.05);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      part(timber, cylinder, x + Math.cos(a) * 2.65, 2.2, z + Math.sin(a) * 2.65, 0.12, 2.85, 0.12);
      if (i < 4) {
        const b = (i + 1) * Math.PI / 3;
        line(x + Math.cos(a) * 2.65, 1.4, z + Math.sin(a) * 2.65, x + Math.cos(b) * 2.65, 1.4, z + Math.sin(b) * 2.65, 0.07, timber);
      }
    }
    part(copper, pavilionRoof, x, 4.22, z, 3.7, 1.75, 3.7);
    part(timber, cylinder, x, 1.25, z, 0.18, 0.75, 0.18);
    part(timber, cylinder, x, 1.68, z, 1.1, 0.12, 1.1);
  }

  function playground(x: number, z: number) {
    box(sand, x, 0.32, z, 10.5, 0.12, 8.5);
    const sx = x - 2.4, sz = z - 1.25;
    for (const dx of [-1.1, 1.1]) for (const dz of [-1.1, 1.1]) box(timber, sx + dx, 1.62, sz + dz, 0.15, 2.55, 0.15);
    box(yellow, sx, 1.82, sz, 2.5, 0.18, 2.5);
    part(red, pavilionRoof, sx, 3.44, sz, 2, 1.15, 2);
    for (const dx of [-0.8, 0.8]) line(sx + dx, 0.38, sz - 2.2, sx + dx, 1.8, sz - 1.2, 0.06);
    for (let i = 0; i < 5; i++) line(sx - 0.8, 0.53 + i * 0.28, sz - 2.1 + i * 0.2, sx + 0.8, 0.53 + i * 0.28, sz - 2.1 + i * 0.2, 0.06);
    const slide = geometry(new THREE.BufferGeometry());
    slide.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.62, 1.8, 1.2, 0.62, 1.8, 1.2, -0.62, 0.48, 3.7, 0.62, 0.48, 3.7,
    ], 3));
    slide.setIndex([0, 2, 1, 1, 2, 3]); slide.computeVertexNormals();
    part(blue, slide, sx, 0, sz, 1, 1, 1);
    for (const dx of [-0.68, 0.68]) line(sx + dx, 2.0, sz + 1.2, sx + dx, 0.66, sz + 3.7, 0.075, yellow);
    const wx = x + 3.2;
    for (const dx of [-1.7, 1.7]) {
      line(wx + dx, 0.4, z - 1.7, wx + dx, 2.95, z, 0.075, timber);
      line(wx + dx, 0.4, z + 1.7, wx + dx, 2.95, z, 0.075, timber);
    }
    line(wx - 1.85, 3, z, wx + 1.85, 3, z, 0.1, timber);
    for (const dx of [-0.8, 0.8]) {
      for (const side of [-1, 1]) line(wx + dx + side * 0.23, 2.95, z, wx + dx + side * 0.23, 0.87, z, 0.022);
      box(rubber, wx + dx, 0.84, z, 0.62, 0.095, 0.35);
    }
  }

  // 一整片中央公园将生活城区分开：湖、大片草坪与相连步道取代重复棋盘绿块。
  landmarks.push({ name: "中央湖畔公园 · CENTRAL PARK", x: -12, z: -15, height: 1 });
  box(grass, 0, 0.18, -9, 132, 0.22, 190);
  const lakeshore = flatShape(lakePoints(2.2));
  const lake = flatShape(lakePoints());
  part(sand, lakeshore, 0, 0.32, 0, 1, 1, 1);
  part(water, lake, 0, 0.355, 0, 1, 1, 1);
  centralParkWalks.forEach(trail);

  // 南部开阔草坪不堆放设施，保留完整的远景呼吸空间。
  const lawn = flatShape([[4,35],[13,26],[27,22],[35,29],[29,43],[15,53],[4,54],[-3,45]]);
  // 覆层与底板保持间距，并用独立深度偏移避免远景下的精度冲突。
  const lawnMaterial = grassDark.clone();
  lawnMaterial.polygonOffset = true;
  lawnMaterial.polygonOffsetFactor = -1;
  lawnMaterial.polygonOffsetUnits = -2;
  kit.materials.add(lawnMaterial);
  part(lawnMaterial, lawn, 0, 0.34, 0, 1, 1, 1);
  gazebo(-40, 52);
  playground(40, 42);
  for (const seat of centralParkBenches) bench(seat.x, seat.z, seat.angle);

  // 湖岸木栈桥从西岸伸向水中，木板、桩、栏杆与端头观景台各有实际厚度。
  for (let n = 0; n < 23; n++) box(timber, -46 + n * 0.72, 0.64, -12, 0.64, 0.16, 3.3);
  for (let n = 0; n < 10; n++) box(timber, -29.8 + n * 0.62, 0.64, -12, 0.55, 0.16, 8);
  for (const z of [-13.6,-10.4]) for (const x of [-45,-40,-35,-30]) {
    part(timber, cylinder, x, 0.27, z, 0.16, 1.4, 0.16);
    box(timber, x, 1.12, z, 0.09, 1.05, 0.09);
  }
  for (const z of [-13.6,-10.4]) line(-45,1.62,z,-30,1.62,z,0.055,timber);
  for (const z of [-16,-8]) {
    line(-29.8,1.62,z,-24.1,1.62,z,0.055,timber);
    for (const x of [-29.5,-26.8,-24.1]) box(timber,x,1.12,z,0.09,1.05,0.09);
  }
  line(-24.1,1.62,-16,-24.1,1.62,-8,0.055,timber);

  // 北侧小拱桥跨过湖湾，连续木面和两侧弧形扶手可在近景观察。
  const bridgeX = -12, bridgeZ = -46, span = 43;
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    const x = bridgeX - span / 2 + t * span;
    const y = 0.56 + Math.sin(t * Math.PI) * 2.1;
    const slope = Math.atan(Math.cos(t * Math.PI) * 2.1 * Math.PI / span);
    part(timber,cube,x,y,bridgeZ,span / 31 + 0.06,0.16,2.6,undefined,0,slope);
    if (i % 3 === 0 || i === 31) for (const side of [-1,1]) box(timber,x,y+0.61,bridgeZ+side*1.27,0.11,1.15,0.11);
    if (i > 0) {
      const previousT = (i - 1) / 31;
      const previousX = bridgeX - span / 2 + previousT * span;
      const previousY = 0.56 + Math.sin(previousT * Math.PI) * 2.1;
      for (const side of [-1,1]) line(previousX,previousY+1.15,bridgeZ+side*1.27,x,y+1.15,bridgeZ+side*1.27,0.06,timber);
    }
  }
  for (const x of [-28,-12,4]) for (const side of [-1,1]) part(stone,cylinder,x,0.6,bridgeZ+side*0.85,0.24,2.2,0.24);

  // 活动广场以铺石圆坪、浅喷泉和花坛形成一个中心，不再重复凉亭。
  part(path,cylinder,35,0.35,-70,11,0.13,11);
  part(stone,cylinder,35,0.6,-70,3.2,0.5,3.2);
  part(water,cylinder,35,0.865,-70,2.9,0.03,2.9);
  part(stone,cylinder,35,1.31,-70,0.32,0.85,0.32);
  part(water,sphere,35,1.88,-70,0.11,0.5,0.11);
  for (const x of [26,44]) {
    box(stone,x,0.5,-75,2.8,0.4,2.8);
    box(hedge,x,0.85,-75,2.5,0.36,2.5);
    for (let i=0;i<7;i++) part(flowers[i%flowers.length],sphere,x+Math.cos(i)*0.9,1.13,-75+Math.sin(i)*0.9,0.18,0.22,0.18);
  }
  sign("CENTRAL PARK",8,1.7,81,11,1.1,"#53664c");
  for (const x of [3.3,12.7]) box(timber,x,0.9,80.8,0.16,1.6,0.16);

  // 林带沿边缘成簇分布，湖岸留出看水的位置；草坪中心保持开阔。
  const treeClusters = [
    [-54,-86,7],[-28,-93,5],[22,-93,5],[54,-86,7],
    [-55,-57,7],[-57,-28,5],[54,-40,6],[57,-3,4],
    [-58,34,7],[-54,68,8],[-24,72,5],[46,68,7],[57,22,4],
  ];
  treeClusters.forEach(([x,z,count],cluster) => {
    for (let i=0;i<count;i++) {
      const a=i*2.399+cluster*0.8;
      const radius=1.8+Math.sqrt(i)*2.1;
      tree(THREE.MathUtils.clamp(x+Math.cos(a)*radius,-62,62),THREE.MathUtils.clamp(z+Math.sin(a)*radius,-100,82),0.9+(i%3)*0.13,(i+cluster)%4);
    }
  });
  for (const [x,z,size,shade] of [[-38,-60,1.15,1],[-48,-41,1.3,0],[-46,21,1.1,2],[16,15,1.05,1],[19,-37,1.2,2],[-3,35,1.1,0]])
    tree(x,z,size,shade);
  for (const [x,z] of [[-58,10],[-45,-5],[-27,24],[16,-1],[33,-11],[58,-10],[0,-93],[-8,-72],[-1,75],[-8,52],[-35,50],[40,51],[29,-62],[43,-75]]) lamp(x,z);

  // 小型鸭群保留自然尺度，不随着湖面放大成巨型装饰。
  for (const [x,z] of [[-21,-8],[-19.8,-7.4],[-18.9,-8.6],[2,-27],[3.5,-26.5],[-8,9]]) {
    part(ivory,sphere,x,0.5,z,0.3,0.16,0.17);
    part(ivory,sphere,x+0.22,0.64,z,0.115,0.16,0.1);
    part(yellow,cube,x+0.33,0.66,z,0.13,0.04,0.06);
  }

  return { landmarks };
}
