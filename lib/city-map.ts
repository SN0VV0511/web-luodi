import { cityBuildings, type PlaceId } from "./city-content";

export const CITY_BOUNDS = { minX: -240, maxX: 320, minZ: -225, maxZ: 350 } as const;
export type CityLot = Readonly<{
  id: PlaceId;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  style: "glass" | "stone" | "terrace" | "brick" | "civic";
  name: string;
  color: string;
  vacant: boolean;
}>;
export type RoadSegment = Readonly<{ x1: number; z1: number; x2: number; z2: number }>;

/** 三个城区各有办公、住宅与生活设施，连续中央公园分隔城市组团。 */
export const districts = [
  { id: "west", name: "西城 · 生活街区", center: { x: -142.5, z: -47.5 }, blocks: [-137.5, -92.5, -47.5, -2.5, 42.5].flatMap((z) => [-187.5, -142.5, -97.5].map((x) => ({ x, z }))) },
  { id: "east", name: "东城 · 海湾中心", center: { x: 142.5, z: -25 }, blocks: [-92.5, -47.5, -2.5, 42.5].flatMap((z) => [97.5, 142.5, 187.5].map((x) => ({ x, z }))) },
  { id: "north", name: "北城 · 学院街区", center: { x: 60, z: -160 }, blocks: [-182.5, -137.5].flatMap((z) => [-52.5, -7.5, 37.5, 82.5, 127.5, 172.5].map((x) => ({ x, z }))) },
] as const;
export const cityBlocks = districts.flatMap((district) => district.blocks.map((block) => ({ ...block, district: district.id })));
export const civicLots = [
  { kind: "city-hall", name: "市政厅", x: -97.5, z: -2.5 },
  { kind: "police", name: "警察局", x: -187.5, z: 42.5 },
  { kind: "hospital", name: "社区医院", x: 187.5, z: -2.5 },
  { kind: "fire", name: "消防站", x: 142.5, z: -92.5 },
  { kind: "school", name: "社区学校", x: 37.5, z: -182.5 },
  { kind: "stadium", name: "社区球场", x: 37.5, z: -137.5 },
] as const;
export const parkLots = [{ name: "中央海岸公园", x: 0, z: -9, width: 132, depth: 190 }] as const;
export const PUBLIC_BLOCKS = [...civicLots, ...parkLots];
const buildingSites = [
  { x: 142.5, z: 42.5, width: 27, depth: 25, height: 60, style: "glass" },
  { x: -142.5, z: -47.5, width: 30, depth: 27, height: 24, style: "terrace" },
  { x: 97.5, z: -47.5, width: 26, depth: 26, height: 68, style: "glass" },
  { x: -97.5, z: 42.5, width: 29, depth: 26, height: 20, style: "brick" },
  { x: -187.5, z: -92.5, height: 18, style: "stone" },
  { x: -97.5, z: -137.5, height: 22, style: "glass" },
  { x: -187.5, z: -2.5, height: 16, style: "terrace" },
  { x: 187.5, z: -47.5, height: 30, style: "glass" },
  { x: 97.5, z: 42.5, height: 24, style: "stone" },
  { x: -7.5, z: -182.5, height: 26, style: "brick" },
  { x: 82.5, z: -182.5, height: 34, style: "glass" },
  { x: 127.5, z: -137.5, height: 24, style: "terrace" },
] as const;

/** 十二栋应用楼分布三城区；配置访问地址不会改变城市模型。 */
export const cityLots: readonly CityLot[] = cityBuildings.map((building, index) => {
  const site = buildingSites[index];
  if (!site) throw new Error("城市楼位不足，请先扩充应用楼位配置");
  return {
    id: building.id, name: building.name, color: building.color, vacant: Boolean(building.vacant),
    width: 14, depth: 14, ...site,
  };
});

const rawRoads: RoadSegment[] = [];
const grid = (xs: readonly number[], zs: readonly number[]) => {
  xs.forEach((x) => rawRoads.push({ x1: x, z1: zs[0], x2: x, z2: zs[zs.length - 1] }));
  zs.forEach((z) => rawRoads.push({ x1: xs[0], z1: z, x2: xs[xs.length - 1], z2: z }));
};
grid([-210, -165, -120, -75], [-160, -115, -70, -25, 20, 65]);
grid([75, 120, 165, 210], [-115, -70, -25, 20, 65]);
grid([-75, -30, 15, 60, 105, 150, 195], [-205, -160, -115]);
for (const x of [-75, 75]) rawRoads.push({ x1: x, z1: -115, x2: x, z2: 95 });
for (const z of [-115, 95]) rawRoads.push({ x1: -210, z1: z, x2: 210, z2: z });
for (const x of [-210, 210]) rawRoads.push({ x1: x, z1: 65, x2: x, z2: 95 });

/** 合并重叠轴线，再在交叉点分段；道路、车辆与小地图共用无重叠边。 */
function roadSegments(): RoadSegment[] {
  const lines = new Map<string, { horizontal: boolean; fixed: number; ranges: [number, number][] }>();
  for (const road of rawRoads) {
    const horizontal = road.z1 === road.z2;
    const fixed = horizontal ? road.z1 : road.x1;
    const key = `${horizontal ? "x" : "z"}:${fixed}`;
    let line = lines.get(key);
    if (!line) { line = { horizontal, fixed, ranges: [] }; lines.set(key, line); }
    line.ranges.push(horizontal ? [road.x1, road.x2] : [road.z1, road.z2]);
  }
  const merged: RoadSegment[] = [];
  for (const { horizontal, fixed, ranges } of lines.values()) {
    ranges.sort((a, b) => a[0] - b[0]);
    const joined: [number, number][] = [];
    for (const range of ranges) {
      const previous = joined[joined.length - 1];
      if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
      else joined.push([...range]);
    }
    for (const [from, to] of joined) merged.push(horizontal ? { x1: from, z1: fixed, x2: to, z2: fixed } : { x1: fixed, z1: from, x2: fixed, z2: to });
  }
  return merged.flatMap((road) => {
    const horizontal = road.z1 === road.z2;
    const cuts = new Set([horizontal ? road.x1 : road.z1, horizontal ? road.x2 : road.z2]);
    for (const other of merged) {
      if ((other.z1 === other.z2) === horizontal) continue;
      const x = horizontal ? other.x1 : road.x1;
      const z = horizontal ? road.z1 : other.z1;
      if (x >= Math.min(road.x1, road.x2) && x <= Math.max(road.x1, road.x2) && z >= Math.min(road.z1, road.z2) && z <= Math.max(road.z1, road.z2) && x >= Math.min(other.x1, other.x2) && x <= Math.max(other.x1, other.x2) && z >= Math.min(other.z1, other.z2) && z <= Math.max(other.z1, other.z2)) cuts.add(horizontal ? x : z);
    }
    const points = [...cuts].sort((a, b) => a - b);
    return points.slice(1).map((to, index) => horizontal ? { x1: points[index], z1: road.z1, x2: to, z2: road.z1 } : { x1: road.x1, z1: points[index], x2: road.x1, z2: to });
  });
}
export const ROAD_SEGMENTS: readonly RoadSegment[] = roadSegments();
