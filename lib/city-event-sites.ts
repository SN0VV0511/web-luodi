import { cityBlocks, cityLots, civicLots, ROAD_SEGMENTS, type RoadSegment } from "./city-map";
import {
  BLOCK_FACE_OUT,
  BLOCK_LAYOUTS,
  BLOCK_TO_ROAD,
  layoutFor,
  type BlockFace,
} from "./real-city/v3/buildings/block-layout";
import type { Archetype } from "./real-city/v3/buildings/archetypes";

const STORAGE_KEY = "sn0vv-city-events-recent";
const RECENT_LIMIT = 8;
const CURB_OFFSET = 4.2;
const APPROACH_LENGTH = 34;
const JUNCTION_CLEARANCE = 12;
const ROAD_SLACK = 0.8;

export type FireSiteSpec = {
  id: string;
  zhLoc: string;
  enLoc: string;
  fireX: number;
  fireY: number;
  fireZ: number;
  truckFromX: number;
  truckFromZ: number;
  truckParkX: number;
  truckParkZ: number;
  truckHeading: number;
  crewBaseX: number;
  crewBaseZ: number;
};

export type BurglarSiteSpec = {
  id: string;
  zhLoc: string;
  enLoc: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  carFromX: number;
  carFromZ: number;
  carStopX: number;
  carStopZ: number;
  carHeading: number;
};

export type MedicalSiteSpec = {
  id: string;
  zhLoc: string;
  enLoc: string;
  patientX: number;
  patientZ: number;
  ambFromX: number;
  ambFromZ: number;
  ambParkX: number;
  ambParkZ: number;
  ambHeading: number;
};

export type UtilitySiteSpec = {
  id: string;
  zhLoc: string;
  enLoc: string;
  leakX: number;
  leakZ: number;
  vanFromX: number;
  vanFromZ: number;
  vanParkX: number;
  vanParkZ: number;
  vanHeading: number;
};

export type TrafficCrashSite = {
  id: string;
  zhLoc: string;
  enLoc: string;
  originX: number;
  originZ: number;
  heading: number;
  carRed: { x: number; z: number; heading: number };
  carBlue: { x: number; z: number; heading: number };
  police: { x: number; z: number; heading: number };
  cones: readonly [number, number][];
  people: readonly { x: number; z: number; heading: number; activity: "argue" | "talk"; coat: string; pants: string }[];
  smoke: { x: number; z: number };
  strobes: { policeRed: [number, number]; policeBlue: [number, number]; hazards: readonly [number, number, number][] };
};

export type CurbStopSite = {
  id: string;
  zhLoc: string;
  enLoc: string;
  x: number;
  z: number;
  heading: number;
};

export const EVENT_RECENT_LIMIT = RECENT_LIMIT;

type EventKind = "fire" | "burglar" | "medical" | "utility" | "traffic" | "police-stop" | "delivery" | "taxi" | "street";

type SessionMemory = {
  seed: number;
  recent: Record<string, string[]>;
  picks: Map<string, string>;
  persist: boolean;
};

let memory: SessionMemory | null = null;

function randomSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] >>> 0;
  }
  return ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0) || 1;
}

function readStoredRecent(): Record<string, string[]> {
  if (typeof localStorage === "undefined") return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as { recent?: Record<string, string[]> } | null;
    if (!parsed?.recent || typeof parsed.recent !== "object") return {};
    const recent: Record<string, string[]> = {};
    for (const [kind, ids] of Object.entries(parsed.recent)) {
      if (Array.isArray(ids)) recent[kind] = ids.filter((id): id is string => typeof id === "string").slice(-RECENT_LIMIT);
    }
    return recent;
  } catch {
    return {};
  }
}

function writeStoredRecent(recent: Record<string, string[]>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ recent }));
  } catch {
    // Private mode or quota — the in-memory list still avoids repeats this visit.
  }
}

function loadMemory(): SessionMemory {
  if (!memory) {
    const persist = typeof window !== "undefined" && typeof localStorage !== "undefined";
    memory = { seed: randomSeed(), recent: persist ? readStoredRecent() : {}, picks: new Map(), persist };
  }
  return memory;
}

/** 测试或截图用：重开一次“访问”，可指定种子与最近记录。 */
export function resetEventSession(options?: {
  seed?: number;
  recent?: Record<string, string[]>;
  persist?: boolean;
}): void {
  memory = {
    seed: options?.seed !== undefined ? options.seed >>> 0 || 1 : randomSeed(),
    recent: { ...(options?.recent ?? {}) },
    picks: new Map(),
    persist: options?.persist ?? false,
  };
  if (memory.persist) writeStoredRecent(memory.recent);
}

export function getEventSession(): { seed: number; recent: Record<string, string[]> } {
  const current = loadMemory();
  return { seed: current.seed, recent: { ...current.recent } };
}

function mix(seed: number, salt: number): number {
  let value = Math.imul(seed ^ salt ^ 0x9e3779b9, 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return (value ^ (value >>> 15)) >>> 0;
}

function unitRandom(seed: number, salt: number): number {
  return mix(seed, salt) / 4294967296;
}

export function sessionCycleShift(kind: string, modulus: number): number {
  if (modulus <= 1) return 0;
  return mix(loadMemory().seed, hashString(kind)) % modulus;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function pickCyclingSite<T extends { id: string }>(kind: EventKind, cycle: number, sites: readonly T[]): T {
  if (sites.length === 0) throw new Error(`No candidate sites for ${kind}`);
  const current = loadMemory();
  const key = `${kind}:${cycle}`;
  const cached = current.picks.get(key);
  if (cached) {
    const found = sites.find((site) => site.id === cached);
    if (found) return found;
  }

  const avoided = current.recent[kind] ?? [];
  const blocked = new Set(avoided.slice(-Math.min(RECENT_LIMIT, Math.max(0, sites.length - 1))));
  let pool = sites.filter((site) => !blocked.has(site.id));
  if (pool.length === 0) {
    const last = avoided[avoided.length - 1];
    pool = last ? sites.filter((site) => site.id !== last) : [...sites];
  }
  if (pool.length === 0) pool = [...sites];

  const choice = pool[Math.floor(unitRandom(current.seed, hashString(key)) * pool.length)];
  current.picks.set(key, choice.id);
  const nextRecent = [...(current.recent[kind] ?? []).filter((id) => id !== choice.id), choice.id].slice(-RECENT_LIMIT);
  current.recent[kind] = nextRecent;
  if (current.persist) writeStoredRecent(current.recent);
  return choice;
}

function districtOf(x: number, z: number): { zh: string; en: string } {
  if (x < -75) return { zh: "西城", en: "West Town" };
  if (z < -115) return { zh: "北城", en: "North Quarter" };
  if (x > 75) return { zh: "东湾", en: "East Bay" };
  return { zh: "中城", en: "Central District" };
}

const ARCHETYPE_LABEL: Record<Archetype, { zh: string; en: string }> = {
  detached: { zh: "花园住宅", en: "Garden House" },
  townhouses: { zh: "联排公寓", en: "Townhouses" },
  mixed: { zh: "底商综合楼", en: "Mixed-Use Block" },
  cafe: { zh: "街角商铺", en: "Corner Shop" },
  lowrise: { zh: "多层公寓", en: "Low-Rise Apartments" },
  midrise: { zh: "中高层公寓", en: "Mid-Rise Residences" },
  tower: { zh: "商务塔楼", en: "Office Tower" },
  office: { zh: "写字楼", en: "Office Building" },
  warehouse: { zh: "仓储物流", en: "Warehouse" },
  church: { zh: "社区教堂", en: "Neighborhood Church" },
  gas: { zh: "加油站", en: "Gas Station" },
};

const FIRE_HEIGHT: Partial<Record<Archetype, number>> = {
  detached: 4.8,
  townhouses: 6.6,
  cafe: 6.2,
  mixed: 7.0,
  lowrise: 7.4,
  midrise: 8.4,
  tower: 9.0,
  office: 8.8,
  warehouse: 6.2,
  church: 7.0,
};

function onSegment(x: number, z: number, road: RoadSegment, slack = ROAD_SLACK): boolean {
  const horizontal = road.z1 === road.z2;
  if (horizontal) {
    return Math.abs(z - road.z1) <= slack && x >= Math.min(road.x1, road.x2) - slack && x <= Math.max(road.x1, road.x2) + slack;
  }
  return Math.abs(x - road.x1) <= slack && z >= Math.min(road.z1, road.z2) - slack && z <= Math.max(road.z1, road.z2) + slack;
}

function findRoad(x: number, z: number, slack = ROAD_SLACK): RoadSegment | undefined {
  return ROAD_SEGMENTS.find((road) => onSegment(x, z, road, slack));
}

function extendAlongRoad(x: number, z: number, axis: "x" | "z", direction: number, distance: number): { x: number; z: number } | null {
  let remaining = distance;
  let cx = x;
  let cz = z;
  let guard = 0;
  while (remaining > 0.01 && guard++ < 8) {
    const road = findRoad(cx, cz, 1.2);
    if (!road) return null;
    const horizontal = road.z1 === road.z2;
    if ((axis === "x") !== horizontal) return null;
    const lo = horizontal ? Math.min(road.x1, road.x2) : Math.min(road.z1, road.z2);
    const hi = horizontal ? Math.max(road.x1, road.x2) : Math.max(road.z1, road.z2);
    const here = horizontal ? cx : cz;
    const target = here + direction * remaining;
    if (target >= lo && target <= hi) {
      return horizontal ? { x: target, z: cz } : { x: cx, z: target };
    }
    const edge = direction > 0 ? hi : lo;
    remaining -= Math.abs(edge - here);
    if (horizontal) cx = edge + direction * 0.05;
    else cz = edge + direction * 0.05;
  }
  return null;
}

function snapAlongSegment(value: number, lo: number, hi: number, clearance: number): number | null {
  const innerLo = lo + clearance;
  const innerHi = hi - clearance;
  if (innerHi - innerLo < 4) return null;
  return Math.min(innerHi, Math.max(innerLo, value));
}

function headingToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

type Access = {
  truckFromX: number;
  truckFromZ: number;
  truckParkX: number;
  truckParkZ: number;
  truckHeading: number;
  crewBaseX: number;
  crewBaseZ: number;
};

function curbAccess(fireX: number, fireZ: number, out: { x: number; z: number }, alignX: number, alignZ: number, blockX: number, blockZ: number): Access | null {
  const horizontalStreet = Math.abs(out.z) > Math.abs(out.x);
  const roadX = horizontalStreet ? alignX : blockX + out.x * BLOCK_TO_ROAD;
  const roadZ = horizontalStreet ? blockZ + out.z * BLOCK_TO_ROAD : alignZ;
  const road = findRoad(roadX, roadZ, 1.4);
  if (!road) return null;
  const horizontal = road.z1 === road.z2;
  if (horizontal !== horizontalStreet) return null;

  const lo = horizontal ? Math.min(road.x1, road.x2) : Math.min(road.z1, road.z2);
  const hi = horizontal ? Math.max(road.x1, road.x2) : Math.max(road.z1, road.z2);
  const aligned = snapAlongSegment(horizontal ? alignX : alignZ, lo, hi, JUNCTION_CLEARANCE);
  if (aligned === null) return null;

  const parkX = horizontal ? aligned : road.x1 - out.x * CURB_OFFSET;
  const parkZ = horizontal ? road.z1 - out.z * CURB_OFFSET : aligned;

  const tryApproach = (direction: number, length: number) => {
    const along = extendAlongRoad(horizontal ? aligned : road.x1, horizontal ? road.z1 : aligned, horizontal ? "x" : "z", direction, length);
    if (!along) return null;
    const fromX = horizontal ? along.x : parkX;
    const fromZ = horizontal ? parkZ : along.z;
    if (!findRoad(horizontal ? along.x : road.x1, horizontal ? road.z1 : along.z, 1.4)) return null;
    return { fromX, fromZ };
  };

  const preferred = parkX + parkZ > fireX + fireZ ? 1 : -1;
  const approach =
    tryApproach(preferred, APPROACH_LENGTH) ??
    tryApproach(-preferred, APPROACH_LENGTH) ??
    tryApproach(preferred, 20) ??
    tryApproach(-preferred, 20);
  if (!approach) return null;

  const towardX = fireX - parkX;
  const towardZ = fireZ - parkZ;
  const towardLen = Math.hypot(towardX, towardZ) || 1;
  const crewWalk = Math.min(3.2, towardLen * 0.55);
  return {
    truckFromX: approach.fromX,
    truckFromZ: approach.fromZ,
    truckParkX: parkX,
    truckParkZ: parkZ,
    truckHeading: headingToward(approach.fromX, approach.fromZ, parkX, parkZ),
    crewBaseX: parkX + (towardX / towardLen) * crewWalk,
    crewBaseZ: parkZ + (towardZ / towardLen) * crewWalk,
  };
}

export function isSiteReachable(site: {
  fireX?: number;
  fireZ?: number;
  leakX?: number;
  leakZ?: number;
  patientX?: number;
  patientZ?: number;
  truckParkX?: number;
  truckParkZ?: number;
  ambParkX?: number;
  ambParkZ?: number;
  vanParkX?: number;
  vanParkZ?: number;
  carStopX?: number;
  carStopZ?: number;
  truckFromX?: number;
  truckFromZ?: number;
  ambFromX?: number;
  ambFromZ?: number;
  vanFromX?: number;
  vanFromZ?: number;
  carFromX?: number;
  carFromZ?: number;
}): boolean {
  const parkX = site.truckParkX ?? site.ambParkX ?? site.vanParkX ?? site.carStopX;
  const parkZ = site.truckParkZ ?? site.ambParkZ ?? site.vanParkZ ?? site.carStopZ;
  const fromX = site.truckFromX ?? site.ambFromX ?? site.vanFromX ?? site.carFromX;
  const fromZ = site.truckFromZ ?? site.ambFromZ ?? site.vanFromZ ?? site.carFromZ;
  const targetX = site.fireX ?? site.patientX ?? site.leakX ?? parkX;
  const targetZ = site.fireZ ?? site.patientZ ?? site.leakZ ?? parkZ;
  if ([parkX, parkZ, fromX, fromZ, targetX, targetZ].some((value) => !Number.isFinite(value))) return false;
  // 停车点在路缘（偏离道路中心约 4 m），用半路宽容差判断是否贴路。
  const parkOnRoad = findRoad(parkX!, parkZ!, 6);
  const fromOnRoad = findRoad(fromX!, fromZ!, 6);
  if (!parkOnRoad || !fromOnRoad) return false;
  const straight = Math.abs(parkX! - fromX!) < 0.8 || Math.abs(parkZ! - fromZ!) < 0.8;
  if (!straight) return false;
  const approach = Math.hypot(parkX! - fromX!, parkZ! - fromZ!);
  if (approach < 16 || approach > 80) return false;
  if (site.fireX != null && site.fireZ != null) {
    const standOff = Math.hypot(site.fireX - parkX!, site.fireZ - parkZ!);
    return standOff >= 3.2 && standOff <= 28;
  }
  if ((site.patientX != null && site.patientZ != null) || (site.leakX != null && site.leakZ != null)) {
    const standOff = Math.hypot((targetX ?? 0) - parkX!, (targetZ ?? 0) - parkZ!);
    return standOff >= 1.2 && standOff <= 20;
  }
  return true;
}

const reservedBlocks = new Set([...cityLots, ...civicLots].map((lot) => `${lot.x},${lot.z}`));
const freeBlocks = cityBlocks.filter((block) => !reservedBlocks.has(`${block.x},${block.z}`));

function buildFireSites(): FireSiteSpec[] {
  const sites: FireSiteSpec[] = [];
  freeBlocks.forEach((block, index) => {
    const layout = layoutFor(block.x, block.z, index);
    if (layout === "construction") return;
    BLOCK_LAYOUTS[layout].forEach((slot, slotIndex) => {
      if (slot.type === "gas") return;
      const out = BLOCK_FACE_OUT[slot.face];
      const cx = block.x + slot.x;
      const cz = block.z + slot.z;
      const fireX = cx + out.x * (slot.d / 2 - 0.45);
      const fireZ = cz + out.z * (slot.d / 2 - 0.45);
      const access = curbAccess(fireX, fireZ, out, cx, cz, block.x, block.z);
      if (!access) return;
      const district = districtOf(cx, cz);
      const label = ARCHETYPE_LABEL[slot.type];
      const unit = slotIndex + 1;
      const site = {
        id: `fire-${block.x}-${block.z}-${slotIndex}-${slot.type}`,
        zhLoc: `${district.zh} · ${label.zh} ${unit}号`,
        enLoc: `${district.en} · ${label.en} #${unit}`,
        fireX,
        fireY: FIRE_HEIGHT[slot.type] ?? 7.2,
        fireZ,
        ...access,
      };
      if (isSiteReachable(site)) sites.push(site);
    });
  });

  for (const lot of cityLots) {
    if (lot.vacant) continue;
    const faces: BlockFace[] = ["S", "N", "E", "W"];
    let best: FireSiteSpec | null = null;
    let bestScore = Infinity;
    for (const face of faces) {
      const out = BLOCK_FACE_OUT[face];
      const half = face === "S" || face === "N" ? lot.depth / 2 : lot.width / 2;
      const fireX = lot.x + out.x * (half - 0.5);
      const fireZ = lot.z + out.z * (half - 0.5);
      const access = curbAccess(fireX, fireZ, out, lot.x, lot.z, lot.x, lot.z);
      if (!access) continue;
      const site: FireSiteSpec = {
        id: `fire-lot-${lot.id}-${face}`,
        zhLoc: `${districtOf(lot.x, lot.z).zh} · ${lot.name}`,
        enLoc: `${districtOf(lot.x, lot.z).en} · ${lot.name}`,
        fireX,
        fireY: Math.min(9.2, Math.max(6.4, lot.height * 0.18)),
        fireZ,
        ...access,
      };
      if (!isSiteReachable(site)) continue;
      const score = Math.hypot(site.truckParkX - fireX, site.truckParkZ - fireZ);
      if (score < bestScore) {
        best = site;
        bestScore = score;
      }
    }
    if (best) sites.push(best);
  }
  return sites;
}

function midBlockStops(): { id: string; x: number; z: number; heading: number; roadX: number; roadZ: number; horizontal: boolean; sidewalkX: number; sidewalkZ: number; zhLoc: string; enLoc: string }[] {
  const stops: { id: string; x: number; z: number; heading: number; roadX: number; roadZ: number; horizontal: boolean; sidewalkX: number; sidewalkZ: number; zhLoc: string; enLoc: string }[] = [];
  const seen = new Set<string>();
  for (const road of ROAD_SEGMENTS) {
    const horizontal = road.z1 === road.z2;
    const lo = horizontal ? Math.min(road.x1, road.x2) : Math.min(road.z1, road.z2);
    const hi = horizontal ? Math.max(road.x1, road.x2) : Math.max(road.z1, road.z2);
    if (hi - lo < 36) continue;
    const mid = (lo + hi) / 2;
    const roadX = horizontal ? mid : road.x1;
    const roadZ = horizontal ? road.z1 : mid;
    // Prefer the inner-city curb (away from the sea / map edge).
    const curbSign = horizontal ? (roadZ > 80 ? -1 : roadZ < -150 ? 1 : Math.sign(-roadZ) || 1) : (roadX > 180 ? -1 : roadX < -180 ? 1 : Math.sign(-roadX) || 1);
    const parkX = horizontal ? mid : roadX + curbSign * CURB_OFFSET;
    const parkZ = horizontal ? roadZ + curbSign * CURB_OFFSET : mid;
    const sidewalkX = horizontal ? mid : roadX + curbSign * 7.2;
    const sidewalkZ = horizontal ? roadZ + curbSign * 7.2 : mid;
    const travelHeading = horizontal ? Math.PI / 2 : 0;
    const key = `${parkX.toFixed(1)},${parkZ.toFixed(1)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const district = districtOf(parkX, parkZ);
    stops.push({
      id: `curb-${key}`,
      x: parkX,
      z: parkZ,
      heading: travelHeading,
      roadX,
      roadZ,
      horizontal,
      sidewalkX,
      sidewalkZ,
      zhLoc: horizontal ? `${district.zh} · 道路中段` : `${district.zh} · 街区辅路`,
      enLoc: horizontal ? `${district.en} · Mid-Block` : `${district.en} · Side Street`,
    });
  }
  return stops;
}

const CURB_STOPS = midBlockStops();

function buildBurglarSites(): BurglarSiteSpec[] {
  const sites: BurglarSiteSpec[] = [];
  for (const stop of CURB_STOPS) {
    const alongX = stop.horizontal ? 1 : 0;
    const alongZ = stop.horizontal ? 0 : 1;
    const startX = stop.sidewalkX - alongX * 16;
    const startZ = stop.sidewalkZ - alongZ * 16;
    const endX = stop.sidewalkX + alongX * 16;
    const endZ = stop.sidewalkZ + alongZ * 16;
    const carFromX = (stop.horizontal ? stop.x : stop.roadX) - alongX * 34;
    const carFromZ = (stop.horizontal ? stop.roadZ : stop.z) - alongZ * 34;
    const carStopX = (stop.horizontal ? stop.x : stop.roadX) + alongX * 12;
    const carStopZ = (stop.horizontal ? stop.roadZ : stop.z) + alongZ * 12;
    const fromShiftX = stop.horizontal ? 0 : stop.x - stop.roadX;
    const fromShiftZ = stop.horizontal ? stop.z - stop.roadZ : 0;
    const site: BurglarSiteSpec = {
      id: `heist-${stop.id}`,
      zhLoc: `${districtOf(stop.x, stop.z).zh} · 沿街商铺与住户`,
      enLoc: `${districtOf(stop.x, stop.z).en} · Street Frontage`,
      startX,
      startZ,
      endX,
      endZ,
      carFromX: carFromX + fromShiftX,
      carFromZ: carFromZ + fromShiftZ,
      carStopX: carStopX + fromShiftX,
      carStopZ: carStopZ + fromShiftZ,
      carHeading: headingToward(carFromX, carFromZ, carStopX, carStopZ),
    };
    if (isSiteReachable(site)) sites.push(site);
  }
  return sites;
}

function buildMedicalSites(): MedicalSiteSpec[] {
  const sites: MedicalSiteSpec[] = [];
  for (const stop of CURB_STOPS) {
    const alongX = stop.horizontal ? 1 : 0;
    const alongZ = stop.horizontal ? 0 : 1;
    const fromX = stop.x - alongX * 34;
    const fromZ = stop.z - alongZ * 34;
    const site: MedicalSiteSpec = {
      id: `med-${stop.id}`,
      zhLoc: `${districtOf(stop.x, stop.z).zh} · 人行道急救点`,
      enLoc: `${districtOf(stop.x, stop.z).en} · Sidewalk Aid Point`,
      patientX: stop.sidewalkX,
      patientZ: stop.sidewalkZ,
      ambFromX: fromX,
      ambFromZ: fromZ,
      ambParkX: stop.x,
      ambParkZ: stop.z,
      ambHeading: headingToward(fromX, fromZ, stop.x, stop.z),
    };
    if (isSiteReachable(site)) sites.push(site);
  }
  return sites;
}

function buildUtilitySites(): UtilitySiteSpec[] {
  const sites: UtilitySiteSpec[] = [];
  for (const stop of CURB_STOPS) {
    const alongX = stop.horizontal ? 1 : 0;
    const alongZ = stop.horizontal ? 0 : 1;
    const fromX = stop.x - alongX * 32;
    const fromZ = stop.z - alongZ * 32;
    const leakTowardX = stop.sidewalkX - stop.x;
    const leakTowardZ = stop.sidewalkZ - stop.z;
    const leakLen = Math.hypot(leakTowardX, leakTowardZ) || 1;
    const site: UtilitySiteSpec = {
      id: `util-${stop.id}`,
      zhLoc: `${districtOf(stop.x, stop.z).zh} · 市政管线井`,
      enLoc: `${districtOf(stop.x, stop.z).en} · Utility Vault`,
      leakX: stop.x + (leakTowardX / leakLen) * 1.8,
      leakZ: stop.z + (leakTowardZ / leakLen) * 1.8,
      vanFromX: fromX,
      vanFromZ: fromZ,
      vanParkX: stop.x,
      vanParkZ: stop.z,
      vanHeading: headingToward(fromX, fromZ, stop.x, stop.z),
    };
    if (isSiteReachable(site)) sites.push(site);
  }
  return sites;
}

function rotateOffset(originX: number, originZ: number, heading: number, x: number, z: number): { x: number; z: number } {
  const sin = Math.sin(heading);
  const cos = Math.cos(heading);
  return { x: originX + cos * x + sin * z, z: originZ - sin * x + cos * z };
}

function buildTrafficSites(): TrafficCrashSite[] {
  const template = {
    carRed: { x: 0.4, z: -1.9, heading: 0.32 },
    carBlue: { x: -0.4, z: 1.9, heading: -0.22 },
    police: { x: -3.6, z: -5.3, heading: 0.52 },
    cones: [[-2.4, -2.7], [-2.2, -0.3], [-2.0, 2.3], [-1.0, 4.7], [1.6, 4.1], [2.0, -3.3]] as [number, number][],
    people: [
      { x: 3.2, z: -0.9, heading: 0.12, activity: "argue" as const, coat: "#d94838", pants: "#2b3642" },
      { x: 3.4, z: 0.6, heading: Math.PI + 0.12, activity: "argue" as const, coat: "#e6b43c", pants: "#384048" },
      { x: 2.0, z: -0.15, heading: Math.PI / 2, activity: "talk" as const, coat: "#1e3f66", pants: "#162942" },
      { x: 5.0, z: -1.7, heading: -1.1, activity: "argue" as const, coat: "#45826b", pants: "#494a47" },
      { x: 5.2, z: 1.4, heading: -1.9, activity: "talk" as const, coat: "#c97a63", pants: "#324452" },
    ],
    smoke: { x: 0.1, z: -0.1 },
    policeRed: [-3.85, -5.45] as [number, number],
    policeBlue: [-3.35, -5.15] as [number, number],
    hazards: [[1.0, 0.92, -3.9], [-0.2, 0.92, 0.0], [0.3, 0.98, 4.0], [-1.1, 0.98, 3.9]] as [number, number, number][],
  };

  const junctions: { x: number; z: number; heading: number; zh: string; en: string }[] = [];
  const horizontals = ROAD_SEGMENTS.filter((road) => road.z1 === road.z2);
  const verticals = ROAD_SEGMENTS.filter((road) => road.x1 === road.x2);
  const seen = new Set<string>();
  for (const eastWest of horizontals) {
    for (const northSouth of verticals) {
      const x = northSouth.x1;
      const z = eastWest.z1;
      if (!onSegment(x, z, eastWest, 0.2) || !onSegment(x, z, northSouth, 0.2)) continue;
      // Keep a little room so wrecked cars sit just off the crossing, not inside a park interior.
      if (Math.abs(x) < 70 && z < 90 && z > -110) continue;
      const key = `${x},${z}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const district = districtOf(x, z);
      junctions.push({
        x,
        z,
        heading: 0,
        zh: `${district.zh} · 路口 (${Math.round(x)}, ${Math.round(z)})`,
        en: `${district.en} · Junction`,
      });
    }
  }

  const preferred = [
    { x: -75, z: 65 },
    { x: 75, z: 20 },
    { x: -165, z: -25 },
    { x: 120, z: -70 },
    { x: -30, z: -160 },
    { x: 165, z: 20 },
    { x: -120, z: 20 },
    { x: 15, z: -115 },
  ];
  const picked: typeof junctions = [];
  for (const want of preferred) {
    const match = junctions.find((junction) => Math.hypot(junction.x - want.x, junction.z - want.z) < 8);
    if (match && !picked.some((item) => item.x === match.x && item.z === match.z)) picked.push(match);
  }
  // Fill from remaining junctions if a preferred crossing is missing.
  for (const junction of junctions) {
    if (picked.length >= 8) break;
    if (!picked.some((item) => item.x === junction.x && item.z === junction.z)) picked.push(junction);
  }

  return picked.map((junction) => {
    const at = (x: number, z: number) => rotateOffset(junction.x, junction.z, junction.heading, x, z);
    const carRed = at(template.carRed.x, template.carRed.z);
    const carBlue = at(template.carBlue.x, template.carBlue.z);
    const police = at(template.police.x, template.police.z);
    const smoke = at(template.smoke.x, template.smoke.z);
    const policeRed = at(...template.policeRed);
    const policeBlue = at(...template.policeBlue);
    return {
      id: `traffic-crash-${junction.x}-${junction.z}`,
      zhLoc: junction.zh,
      enLoc: junction.en,
      originX: junction.x,
      originZ: junction.z,
      heading: junction.heading,
      carRed: { ...carRed, heading: junction.heading + template.carRed.heading },
      carBlue: { ...carBlue, heading: junction.heading + template.carBlue.heading },
      police: { ...police, heading: junction.heading + template.police.heading },
      cones: template.cones.map(([x, z]) => {
        const point = at(x, z);
        return [point.x, point.z] as [number, number];
      }),
      people: template.people.map((person) => {
        const point = at(person.x, person.z);
        return { ...person, x: point.x, z: point.z, heading: person.heading + junction.heading };
      }),
      smoke,
      strobes: {
        policeRed: [policeRed.x, policeRed.z],
        policeBlue: [policeBlue.x, policeBlue.z],
        hazards: template.hazards.map(([x, y, z]) => {
          const point = at(x, z);
          return [point.x, y, point.z] as [number, number, number];
        }),
      },
    };
  });
}

function buildPoliceStops(): CurbStopSite[] {
  return CURB_STOPS.filter((stop) => {
    const axis = stop.horizontal ? "x" : "z";
    return extendAlongRoad(stop.roadX, stop.roadZ, axis, -1, 28) && extendAlongRoad(stop.roadX, stop.roadZ, axis, 1, 10);
  }).map((stop) => ({
    id: `police-${stop.id}`,
    zhLoc: `${districtOf(stop.x, stop.z).zh} · 路侧临检`,
    enLoc: `${districtOf(stop.x, stop.z).en} · Roadside Stop`,
    x: stop.x,
    z: stop.z,
    heading: stop.horizontal ? Math.PI / 2 : 0,
  }));
}

function buildDeliveryStops(): CurbStopSite[] {
  const targets = [
    { x: -120 + 4.2, z: -52, heading: 0, zh: "西城 · 办公楼卸货位", en: "West Town · Office Bay" },
    { x: 120 - 4.2, z: -40, heading: Math.PI, zh: "东湾 · 商务楼卸货位", en: "East Bay · Office Bay" },
    { x: -165 + 4.2, z: 0, heading: 0, zh: "西城 · 生活区卸货位", en: "West Town · Residential Bay" },
    { x: 165 - 4.2, z: -85, heading: Math.PI, zh: "东湾 · 仓储卸货位", en: "East Bay · Logistics Bay" },
    { x: -30 + 4.2, z: -160, heading: 0, zh: "北城 · 学院路卸货位", en: "North Quarter · Academy Bay" },
    { x: 105 - 4.2, z: -160, heading: Math.PI, zh: "北城 · 东学院卸货位", en: "North Quarter · East Campus Bay" },
  ];
  return targets.map((target, index) => ({
    id: `delivery-${index}-${target.x}-${target.z}`,
    zhLoc: target.zh,
    enLoc: target.en,
    x: target.x,
    z: target.z,
    heading: target.heading,
  }));
}

function buildTaxiStops(): CurbStopSite[] {
  const targets = [
    { x: 75 - 4.2, z: 2, heading: Math.PI, zh: "中央公园 · 东门出租车站", en: "Central Park · East Gate Taxi" },
    { x: -75 + 4.2, z: -48, heading: 0, zh: "中央公园 · 西门出租车站", en: "Central Park · West Gate Taxi" },
    { x: 210 - 4.2, z: -52, heading: Math.PI, zh: "东湾 · 港区出租车站", en: "East Bay · Port Taxi Stand" },
    { x: -75 + 4.2, z: 20, heading: 0, zh: "西城 · 公园北门出租车站", en: "West Town · North Gate Taxi" },
    { x: 60, z: -115 + 4.2, heading: Math.PI, zh: "北城 · 学院南门出租车站", en: "North Quarter · School Gate Taxi" },
  ];
  return targets.map((target, index) => ({
    id: `taxi-${index}-${target.x}-${target.z}`,
    zhLoc: target.zh,
    enLoc: target.en,
    x: target.x,
    z: target.z,
    heading: target.heading,
  }));
}

export const FIRE_SITES: readonly FireSiteSpec[] = buildFireSites();
export const BURGLAR_SITES: readonly BurglarSiteSpec[] = buildBurglarSites();
export const MEDICAL_SITES: readonly MedicalSiteSpec[] = buildMedicalSites();
export const UTILITY_SITES: readonly UtilitySiteSpec[] = buildUtilitySites();
export const TRAFFIC_SITES: readonly TrafficCrashSite[] = buildTrafficSites();
export const POLICE_STOP_SITES: readonly CurbStopSite[] = buildPoliceStops();
export const DELIVERY_SITES: readonly CurbStopSite[] = buildDeliveryStops();
export const TAXI_SITES: readonly CurbStopSite[] = buildTaxiStops();

export function eventCatalogCounts(): Record<string, number> {
  return {
    fire: FIRE_SITES.length,
    burglar: BURGLAR_SITES.length,
    medical: MEDICAL_SITES.length,
    utility: UTILITY_SITES.length,
    traffic: TRAFFIC_SITES.length,
    policeStop: POLICE_STOP_SITES.length,
    delivery: DELIVERY_SITES.length,
    taxi: TAXI_SITES.length,
  };
}

export function pickFireSite(cycle: number): FireSiteSpec {
  return pickCyclingSite("fire", cycle, FIRE_SITES);
}
export function pickBurglarSite(cycle: number): BurglarSiteSpec {
  return pickCyclingSite("burglar", cycle, BURGLAR_SITES);
}
export function pickMedicalSite(cycle: number): MedicalSiteSpec {
  return pickCyclingSite("medical", cycle, MEDICAL_SITES);
}
export function pickUtilitySite(cycle: number): UtilitySiteSpec {
  return pickCyclingSite("utility", cycle, UTILITY_SITES);
}
export function getSessionTrafficCrashSite(): TrafficCrashSite {
  return pickCyclingSite("traffic", 0, TRAFFIC_SITES);
}
export function pickPoliceStopSite(cycle: number): CurbStopSite {
  return pickCyclingSite("police-stop", cycle, POLICE_STOP_SITES);
}
export function pickDeliverySite(cycle: number): CurbStopSite {
  return pickCyclingSite("delivery", cycle, DELIVERY_SITES);
}
export function pickTaxiSite(cycle: number): CurbStopSite {
  return pickCyclingSite("taxi", cycle, TAXI_SITES);
}
