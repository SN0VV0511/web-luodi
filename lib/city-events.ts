import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CityFireEffect } from "./real-city/effects/fire-fx";
import type { CivicKit } from "./city-civic";
import { sampleCruiseVoyage } from "./city-cruise";
import type { Locale } from "./site-content";
import { buildStreetActivities, getStreetActivityIncidents } from "./city-street-events";
import { createHead, createTorso, createUpperArm } from "./city-figure";
import { SkinnedPeople, createWorldPose } from "./real-city/life/skinned-people";
import type { Appearance } from "./real-city/life/types";
import { ServiceVehicle } from "./real-city/v3/vehicles/service-fleet";
import { canLoadCityAssets, loadCarModelsOnce } from "./real-city/vehicles/car-models";

export type IncidentKind = "fire" | "burglar" | "medical" | "utility" | "cruise" | "traffic" | "life";

export type ActiveCityIncident = {
  id: string;
  kind: IncidentKind;
  code: string;
  severity: "critical" | "warning" | "info";
  title: string;
  locationName: string;
  phaseLabel: string;
  detail: string;
  progress: number;
  x: number;
  z: number;
  focusDistance: number;
  focusHeight: number;
};

export type CityChirpMessage = {
  id: string;
  author: string;
  handle: string;
  tag: string;
  text: string;
  mood: "alert" | "praise" | "chat";
  x: number;
  z: number;
};

export type CityTelemetrySnapshot = {
  population: number;
  happiness: number;
  powerOutputMw: number;
  powerLoadMw: number;
  windOutputMw: number;
  solarOutputMw: number;
  waterSupplyM3: number;
  sewageTreatedM3: number;
  sewagePurityPct: number;
  fireSafetyPct: number;
  crimeRatePct: number;
  cruisePassengers: number;
  cruiseStatusLabel: { zh: string; en: string };
  rciDemand: {
    residential: number;
    commercial: number;
    office: number;
  };
};

type FireSiteSpec = {
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

type BurglarSiteSpec = {
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

type MedicalSiteSpec = {
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

type UtilitySiteSpec = {
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

const FIRE_CYCLE = 38;
const BURGLAR_CYCLE = 34;
const MEDICAL_CYCLE = 32;
const UTILITY_CYCLE = 36;

const FIRE_SITES: readonly FireSiteSpec[] = [
  {
    id: "fire-west-condo",
    zhLoc: "西城 · 现代高层公寓 3栋",
    enLoc: "West Town · Modern Condo #3",
    fireX: -142.5,
    fireY: 8.6,
    fireZ: 48.2,
    truckFromX: -108,
    truckFromZ: 62.6,
    truckParkX: -142.5,
    truckParkZ: 62.6,
    truckHeading: -Math.PI / 2,
    crewBaseX: -142.5,
    crewBaseZ: 57.6,
  },
  {
    id: "fire-east-plaza",
    zhLoc: "东湾 · 商业综合体与公寓",
    enLoc: "East Bay · Mixed-Use Plaza",
    fireX: 142.5,
    fireY: 7.4,
    fireZ: 6.2,
    truckFromX: 176,
    truckFromZ: 17.6,
    truckParkX: 142.5,
    truckParkZ: 17.6,
    truckHeading: -Math.PI / 2,
    crewBaseX: 142.5,
    crewBaseZ: 13.2,
  },
  {
    id: "fire-north-residences",
    zhLoc: "北城 · 学院青年公寓",
    enLoc: "North Quarter · Academy Suites",
    fireX: -52.5,
    fireY: 8.4,
    fireZ: -129.5,
    truckFromX: -18,
    truckFromZ: -117.4,
    truckParkX: -52.5,
    truckParkZ: -117.4,
    truckHeading: -Math.PI / 2,
    crewBaseX: -52.5,
    crewBaseZ: -122.0,
  },
  {
    id: "fire-west-market-block",
    zhLoc: "西城 · 烘焙商业街区",
    enLoc: "West Town · Artisan Bakery Row",
    fireX: -97.5,
    fireY: 6.8,
    fireZ: -38.5,
    truckFromX: -130,
    truckFromZ: -27.4,
    truckParkX: -97.5,
    truckParkZ: -27.4,
    truckHeading: Math.PI / 2,
    crewBaseX: -97.5,
    crewBaseZ: -31.8,
  },
];

const BURGLAR_SITES: readonly BurglarSiteSpec[] = [
  {
    id: "heist-coastal-villa",
    zhLoc: "西海岸 · 观海泳池别墅区",
    enLoc: "West Coast · Ocean Pool Villas",
    startX: -226.2,
    startZ: 14,
    endX: -226.2,
    endZ: -22,
    carFromX: -210,
    carFromZ: 32,
    carStopX: -212.2,
    carStopZ: -21,
    carHeading: Math.PI,
  },
  {
    id: "heist-west-mart",
    zhLoc: "西城 · 鲜活超市商业街",
    enLoc: "West Town · Fresh Mart Promenade",
    startX: -128,
    startZ: 88.3,
    endX: -94,
    endZ: 88.3,
    carFromX: -146,
    carFromZ: 92.6,
    carStopX: -93,
    carStopZ: 92.6,
    carHeading: Math.PI / 2,
  },
  {
    id: "heist-east-boutique",
    zhLoc: "东湾 · 精品买手街铺",
    enLoc: "East Bay · Boutique Avenue",
    startX: 81.7,
    startZ: -18,
    endX: 81.7,
    endZ: 14,
    carFromX: 77.4,
    carFromZ: -34,
    carStopX: 77.4,
    carStopZ: 15,
    carHeading: 0,
  },
  {
    id: "heist-north-villa",
    zhLoc: "北城 · 林荫联排花园宅邸",
    enLoc: "North Quarter · Garden Townhouses",
    startX: 70,
    startZ: -121.7,
    endX: 104,
    endZ: -121.7,
    carFromX: 52,
    carFromZ: -117.4,
    carStopX: 105,
    carStopZ: -117.4,
    carHeading: Math.PI / 2,
  },
];

const MEDICAL_SITES: readonly MedicalSiteSpec[] = [
  {
    id: "med-park-plaza",
    zhLoc: "中央公园 · 南门滨海广场",
    enLoc: "Central Park · South Gate Plaza",
    patientX: 18,
    patientZ: 88.2,
    ambFromX: 54,
    ambFromZ: 92.6,
    ambParkX: 18,
    ambParkZ: 92.6,
    ambHeading: -Math.PI / 2,
  },
  {
    id: "med-east-promenade",
    zhLoc: "东湾 · 海滨慢跑绿道",
    enLoc: "East Bay · Jogging Promenade",
    patientX: 118,
    patientZ: 102.2,
    ambFromX: 154,
    ambFromZ: 97.4,
    ambParkX: 118,
    ambParkZ: 97.4,
    ambHeading: -Math.PI / 2,
  },
  {
    id: "med-stadium-gate",
    zhLoc: "北城 · 社区体育场南门",
    enLoc: "North Quarter · Stadium South Gate",
    patientX: 37.5,
    patientZ: -121.8,
    ambFromX: 72,
    ambFromZ: -117.4,
    ambParkX: 37.5,
    ambParkZ: -117.4,
    ambHeading: -Math.PI / 2,
  },
];

const UTILITY_SITES: readonly UtilitySiteSpec[] = [
  {
    id: "util-port-watermain",
    zhLoc: "东港大道 · 市政供水主干管",
    enLoc: "Port Ave · Municipal Water Main",
    leakX: 171.6,
    leakZ: 74,
    vanFromX: 167.4,
    vanFromZ: 92,
    vanParkX: 167.4,
    vanParkZ: 76,
    vanHeading: Math.PI,
  },
  {
    id: "util-west-conduit",
    zhLoc: "西城中路 · 地埋高压环网柜",
    enLoc: "West Ave · Underground Grid Box",
    leakX: -113.4,
    leakZ: 12,
    vanFromX: -117.6,
    vanFromZ: 34,
    vanParkX: -117.6,
    vanParkZ: 14,
    vanHeading: Math.PI,
  },
  {
    id: "util-north-feeder",
    zhLoc: "北环路 · 220kV 配电分支井",
    enLoc: "North Ring · Grid Feeder Vault",
    leakX: 108,
    leakZ: -121.8,
    vanFromX: 136,
    vanFromZ: -117.4,
    vanParkX: 108,
    vanParkZ: -117.4,
    vanHeading: -Math.PI / 2,
  },
];

function shuffledSite(cycle: number, count: number, salt: number): number {
  const order = Array.from({ length: count }, (_, index) => index);
  let seed = (Math.floor(cycle / count) * 173 + salt) | 0;
  for (let index = count - 1; index > 0; index--) {
    seed = Math.imul(seed ^ (seed >>> 13), 1597334677);
    const other = (seed >>> 0) % (index + 1);
    [order[index], order[other]] = [order[other], order[index]];
  }
  return order[cycle % count];
}

function sampleFireIncident(seconds: number) {
  const safeT = Math.max(0, seconds);
  const slot = shuffledSite(Math.floor(safeT / FIRE_CYCLE), FIRE_SITES.length, 19);
  const local = THREE.MathUtils.euclideanModulo(safeT, FIRE_CYCLE);
  const progress = local / FIRE_CYCLE;
  const site = FIRE_SITES[slot];

  // 0..0.18 火情初起 | 0.18..0.38 消防车疾驰抵达 | 0.38..0.82 高压水炮压制 | 0.82..1.0 余烬冷却复检
  const driveT = THREE.MathUtils.clamp((progress - 0.12) / 0.24, 0, 1);
  const easedDrive = 1 - Math.pow(1 - driveT, 2.2);
  const truckX = THREE.MathUtils.lerp(site.truckFromX, site.truckParkX, easedDrive);
  const truckZ = THREE.MathUtils.lerp(site.truckFromZ, site.truckParkZ, easedDrive);
  const arrived = progress >= 0.36;
  const spraying = progress >= 0.38 && progress < 0.86;
  const fireIntensity =
    progress < 0.18
      ? THREE.MathUtils.lerp(0.45, 1.0, progress / 0.18)
      : progress < 0.42
        ? 1.0
        : progress < 0.86
          ? Math.max(0.08, 1.0 - (progress - 0.42) / 0.44)
          : 0.0;

  return {
    site,
    progress,
    truckX,
    truckZ,
    arrived,
    spraying,
    fireIntensity,
  };
}

function sampleBurglarIncident(seconds: number) {
  const safeT = Math.max(0, seconds + 11);
  const slot = shuffledSite(Math.floor(safeT / BURGLAR_CYCLE), BURGLAR_SITES.length, 29);
  const local = THREE.MathUtils.euclideanModulo(safeT, BURGLAR_CYCLE);
  const progress = local / BURGLAR_CYCLE;
  const site = BURGLAR_SITES[slot];

  // 0..0.68 蒙面小偷扛赃物袋狂奔潜逃 + 警察徒步紧追 + 警车包抄拦截 | 0.68..1.0 合围举手投降抓获
  const runT = THREE.MathUtils.clamp(progress / 0.68, 0, 1);
  const arrested = progress >= 0.68;
  const thiefX = THREE.MathUtils.lerp(site.startX, site.endX, runT);
  const thiefZ = THREE.MathUtils.lerp(site.startZ, site.endZ, runT);
  const runHeading = Math.atan2(site.endX - site.startX, site.endZ - site.startZ);

  const carT = THREE.MathUtils.clamp((progress - 0.08) / 0.56, 0, 1);
  const easedCar = 1 - Math.pow(1 - carT, 2.0);
  const carX = THREE.MathUtils.lerp(site.carFromX, site.carStopX, easedCar);
  const carZ = THREE.MathUtils.lerp(site.carFromZ, site.carStopZ, easedCar);

  const copTrailDist = arrested ? 1.35 : THREE.MathUtils.lerp(9.5, 2.1, runT);
  const cop1X = thiefX - Math.sin(runHeading) * copTrailDist;
  const cop1Z = thiefZ - Math.cos(runHeading) * copTrailDist;
  const cop2X = arrested
    ? thiefX + Math.sin(runHeading) * 1.25
    : thiefX - Math.sin(runHeading) * (copTrailDist + 2.2) + Math.cos(runHeading) * 0.65;
  const cop2Z = arrested
    ? thiefZ + Math.cos(runHeading) * 1.25
    : thiefZ - Math.cos(runHeading) * (copTrailDist + 2.2) - Math.sin(runHeading) * 0.65;

  return {
    site,
    progress,
    arrested,
    thiefX,
    thiefZ,
    runHeading,
    carX,
    carZ,
    cop1X,
    cop1Z,
    cop2X,
    cop2Z,
  };
}

function sampleMedicalIncident(seconds: number) {
  const safeT = Math.max(0, seconds + 19);
  const slot = shuffledSite(Math.floor(safeT / MEDICAL_CYCLE), MEDICAL_SITES.length, 37);
  const local = THREE.MathUtils.euclideanModulo(safeT, MEDICAL_CYCLE);
  const progress = local / MEDICAL_CYCLE;
  const site = MEDICAL_SITES[slot];

  const driveT = THREE.MathUtils.clamp((progress - 0.1) / 0.28, 0, 1);
  const eased = 1 - Math.pow(1 - driveT, 2.0);
  const ambX = THREE.MathUtils.lerp(site.ambFromX, site.ambParkX, eased);
  const ambZ = THREE.MathUtils.lerp(site.ambFromZ, site.ambParkZ, eased);
  const treating = progress >= 0.38;

  return { site, progress, ambX, ambZ, treating };
}

function sampleUtilityIncident(seconds: number) {
  const safeT = Math.max(0, seconds + 25);
  const slot = shuffledSite(Math.floor(safeT / UTILITY_CYCLE), UTILITY_SITES.length, 47);
  const local = THREE.MathUtils.euclideanModulo(safeT, UTILITY_CYCLE);
  const progress = local / UTILITY_CYCLE;
  const site = UTILITY_SITES[slot];

  const driveT = THREE.MathUtils.clamp((progress - 0.12) / 0.28, 0, 1);
  const eased = 1 - Math.pow(1 - driveT, 2.0);
  const vanX = THREE.MathUtils.lerp(site.vanFromX, site.vanParkX, eased);
  const vanZ = THREE.MathUtils.lerp(site.vanFromZ, site.vanParkZ, eased);
  const repairing = progress >= 0.4;
  const geyserScale = progress < 0.78 ? 1 - Math.max(0, (progress - 0.45) / 0.35) * 0.85 : 0.05;

  return { site, progress, vanX, vanZ, repairing, geyserScale };
}

/**
 * 供 React HUD 面板实时读取的城市突发事件快照（与 3D 场景动画完全同源同步）。
 */
export function getActiveCityIncidents(seconds: number, locale: Locale): ActiveCityIncident[] {
  const zh = locale === "zh";
  const fire = sampleFireIncident(seconds);
  const burglar = sampleBurglarIncident(seconds);
  const med = sampleMedicalIncident(seconds);
  const util = sampleUtilityIncident(seconds);
  const cruise = sampleCruiseVoyage(seconds);

  const firePhase =
    fire.progress < 0.18
      ? zh ? "🔥 浓烟报警 · 火势蔓延" : "🔥 Smoke Alert · Outbreak"
      : fire.progress < 0.38
        ? zh ? "🚒 消防云梯车紧急驰援" : "🚒 Fire Engine En Route"
        : fire.progress < 0.86
          ? zh ? "💦 高压水炮压制明火中" : "💦 Water Cannon Suppressing"
          : zh ? "✅ 明火扑灭 · 降温排烟" : "✅ Fire Extinguished";

  const burglarPhase = !burglar.arrested
    ? zh ? "🚓 小偷携赃狂奔 · 警匪追击" : "🚓 Thief Fleeing · Hot Pursuit"
    : zh ? "🚨 警车封堵 · 举手投降抓获" : "🚨 Cornered · Suspect Arrested";

  const medPhase = !med.treating
    ? zh ? "🚑 120 急救车拉响警报赶赴" : "🚑 Ambulance Responding"
    : zh ? "🩺 急救员担架现场施救" : "🩺 Paramedics Treating";

  const utilPhase = !util.repairing
    ? zh ? "💦 供水主管爆裂喷涌 · 抢修出动" : "💦 Water Main Geyser · Dispatch"
    : zh ? "🔧 市政工程车关闭阀门抢修" : "🔧 Crew Repairing Valve";

  const cruisePhase =
    cruise.status === "berthed"
      ? zh ? "⚓ 停靠母港廊桥 · 游客上下船" : "⚓ Berthed at SkyBridge"
      : cruise.status === "approaching"
        ? zh ? "🚢 减速进港靠泊中" : "🚢 Approaching Cruise Pier"
        : cruise.status === "departing"
          ? zh ? "📯 鸣笛离港驶向深海" : "📯 Departing Terminal"
          : zh ? `🌊 海湾巡航 (${cruise.speedKnots} 节)` : `🌊 Bay Cruising (${cruise.speedKnots} kn)`;

  return [
    {
      id: fire.site.id,
      kind: "fire",
      code: "FIRE-119",
      severity: "critical",
      title: zh ? "建筑突发火情与消防扑救" : "Building Fire & Suppression",
      locationName: zh ? fire.site.zhLoc : fire.site.enLoc,
      phaseLabel: firePhase,
      detail: zh
        ? "3D 烈焰浓烟翻涌，重型消防车架设高压抛物线水炮现场灭火"
        : "Dynamic 3D flames & smoke with fire engine parabolic water cannon",
      progress: fire.progress,
      x: (fire.site.fireX + fire.site.truckParkX) * 0.5,
      z: (fire.site.fireZ + fire.site.truckParkZ) * 0.5,
      focusDistance: 31,
      focusHeight: 4.8,
    },
    {
      id: burglar.site.id,
      kind: "burglar",
      code: "PD-110",
      severity: "critical",
      title: zh ? "蒙面小偷行窃与警车围捕" : "Masked Burglar & Police Chase",
      locationName: zh ? burglar.site.zhLoc : burglar.site.enLoc,
      phaseLabel: burglarPhase,
      detail: zh
        ? "黑衣小偷扛赃物袋沿街潜逃，巡逻警车红蓝爆闪拦截抓捕"
        : "Hooded thief fleeing with loot bag pursued by patrol cruiser & officers",
      progress: burglar.progress,
      x: burglar.thiefX,
      z: burglar.thiefZ,
      focusDistance: 24,
      focusHeight: 1.9,
    },
    {
      id: "cruise-odyssey",
      kind: "cruise",
      code: "PORT-01",
      severity: "info",
      title: zh ? "海洋奥德赛号豪华游轮航行" : "MS SN0VV Odyssey Cruise Liner",
      locationName: zh ? "国际邮轮客运母港 · 翡翠海湾" : "Cruise Terminal · Emerald Bay",
      phaseLabel: cruisePhase,
      detail: zh
        ? "8层海景阳台甲板、顶层双露天泳池、旋转滑水道与破浪尾流"
        : "8 balcony decks, twin Lido pools, aqua-slides & bow foam wake",
      progress: THREE.MathUtils.euclideanModulo(seconds, 120) / 120,
      x: cruise.x,
      z: cruise.z,
      focusDistance: 78,
      focusHeight: 11,
    },
    {
      id: med.site.id,
      kind: "medical",
      code: "EMS-120",
      severity: "warning",
      title: zh ? "市民突发不适与急救担架救援" : "Citizen Medical Rescue",
      locationName: zh ? med.site.zhLoc : med.site.enLoc,
      phaseLabel: medPhase,
      detail: zh
        ? "救护车闪灯停靠路缘，两名医护人员携医疗箱与担架紧急处置"
        : "Ambulance at curb with two paramedics & wheeled stretcher",
      progress: med.progress,
      x: med.site.patientX,
      z: med.site.patientZ,
      focusDistance: 25,
      focusHeight: 1.8,
    },
    {
      id: util.site.id,
      kind: "utility",
      code: "UTIL-95",
      severity: "warning",
      title: zh ? "市政供水管网爆裂抢修" : "Water Main Burst & Repair",
      locationName: zh ? util.site.zhLoc : util.site.enLoc,
      phaseLabel: utilPhase,
      detail: zh
        ? "高压水柱喷涌，黄灯工程抢修车与安全帽工程师现场闭阀作业"
        : "Pressurized water geyser contained by municipal engineering crew",
      progress: util.progress,
      x: util.site.leakX,
      z: util.site.leakZ,
      focusDistance: 26,
      focusHeight: 2.2,
    },
    {
      id: "traffic-crash-west",
      kind: "traffic",
      code: "TRAF-07",
      severity: "warning",
      title: zh ? "十字路口追尾与车主争执" : "Roadside Collision & Dispute",
      locationName: zh ? "西城环路 · 南口 (-74, 70)" : "West Ring · South Junction",
      phaseLabel: zh ? "💥 引擎冒烟 · 交警勘查调解" : "💥 Engine Smoke · Police On Scene",
      detail: zh
        ? "两车追尾引擎盖冒浓烟，双方车主当街理论，警车警戒疏导"
        : "Two-car collision with hood smoke, arguing drivers & traffic cones",
      progress: 0.65,
      x: -73.5,
      z: 69.5,
      focusDistance: 25,
      focusHeight: 1.8,
    },
  ];
}

/** Daily encounters and emergency services share one clock and focus coordinates. */
export function getCityTimeline(seconds: number, locale: Locale): ActiveCityIncident[] {
  return [...getStreetActivityIncidents(seconds, locale), ...getActiveCityIncidents(seconds, locale)];
}

/**
 * 模拟《城市：天际线》实时市政运行遥测指标（电力、净水、排污、治安、消防、RCI需求、游轮客流）。
 */
export function getCityTelemetry(seconds: number, night = false): CityTelemetrySnapshot {
  const fire = sampleFireIncident(seconds);
  const burglar = sampleBurglarIncident(seconds);
  const cruise = sampleCruiseVoyage(seconds);

  const windWave = Math.sin(seconds * 0.11) * 4.5;
  const windOutputMw = Math.round(38 + windWave);
  const solarOutputMw = night ? 0 : Math.round(24 + Math.cos(seconds * 0.07) * 3);
  const gasTurbineMw = 132;
  const powerOutputMw = gasTurbineMw + windOutputMw + solarOutputMw;
  const powerLoadMw = Math.round((night ? 148 : 136) + Math.sin(seconds * 0.09) * 4);

  const cruiseStatusLabel =
    cruise.status === "berthed"
      ? { zh: "靠泊上下客中", en: "Berthed at Pier" }
      : cruise.status === "approaching"
        ? { zh: "进港靠泊中", en: "Approaching Berth" }
        : cruise.status === "departing"
          ? { zh: "鸣笛离港中", en: "Departing Bay" }
          : { zh: "海湾巡航中", en: "Cruising Bay" };

  return {
    population: 16480 + Math.floor(Math.sin(seconds * 0.05) * 18),
    happiness: burglar.arrested && fire.fireIntensity < 0.4 ? 96 : 93,
    powerOutputMw,
    powerLoadMw,
    windOutputMw,
    solarOutputMw,
    waterSupplyM3: 52400,
    sewageTreatedM3: 51800,
    sewagePurityPct: 99.4,
    fireSafetyPct: Math.round(98 - fire.fireIntensity * 6),
    crimeRatePct: burglar.arrested ? 3 : 6,
    cruisePassengers: cruise.status === "berthed" ? 3420 : 3180,
    cruiseStatusLabel,
    rciDemand: {
      residential: 74,
      commercial: 62,
      office: 86,
    },
  };
}

/**
 * 模拟《城市：天际线》标志性「啾啾 (Chirper)」市民实时社交吐槽与点赞动态流。
 */
export function getCityChirps(seconds: number, locale: Locale): CityChirpMessage[] {
  const zh = locale === "zh";
  const fire = sampleFireIncident(seconds);
  const burglar = sampleBurglarIncident(seconds);
  const cruise = sampleCruiseVoyage(seconds);

  return [
    {
      id: "chirp-fire",
      author: zh ? "热心市民阿泽" : "Citizen Alex",
      handle: "@bay_watcher",
      tag: "#119消防速报",
      mood: "alert",
      text:
        fire.fireIntensity > 0.35
          ? zh
            ? `天哪！${fire.site.zhLoc}冒烟起火了，好在消防云梯车几秒钟就赶到喷水压制了！🚒💦`
            : `Whoa! Smoke at ${fire.site.enLoc}, thank goodness the fire engine's water cannon is already on it! 🚒`
          : zh
            ? `给市政消防站疯狂点赞！${fire.site.zhLoc}的火情这么快就彻底扑灭了！👏`
            : `Huge props to SN0VV Fire Dept! ${fire.site.enLoc} is already safe and cooled down! 👏`,
      x: fire.site.fireX,
      z: fire.site.fireZ,
    },
    {
      id: "chirp-police",
      author: zh ? "海湾安保巡查" : "Neighborhood Watch",
      handle: "@villa_guard",
      tag: "#平安天际线",
      mood: burglar.arrested ? "praise" : "alert",
      text: !burglar.arrested
        ? zh
          ? `注意！有人看到穿黑帽衫的小偷拎着包裹从${burglar.site.zhLoc}跑出来，两辆警员正在狂追！🚓`
          : `Alert! Masked burglar spotted sprinting near ${burglar.site.enLoc}—police cruisers closing in! 🚓`
        : zh
          ? `大快人心！${burglar.site.zhLoc}的入室小偷被警车堵在路口当场举手投降啦！🙌`
          : `Got 'em! Suspect at ${burglar.site.enLoc} has hands up surrounded by patrol officers! 🙌`,
      x: burglar.thiefX,
      z: burglar.thiefZ,
    },
    {
      id: "chirp-cruise",
      author: zh ? "度假旅拍苏苏" : "Traveler Chloe",
      handle: "@odyssey_deck12",
      tag: "#海洋奥德赛号",
      mood: "praise",
      text:
        cruise.status === "berthed"
          ? zh
            ? "刚从海洋奥德赛号豪华游轮走下玻璃廊桥！顶层露天泳池看这座海滨城市的天际线太美了🚢✨"
            : "Just stepped off MS SN0VV Odyssey onto the glass SkyBridge! The skyline from the Lido pool is unreal 🚢✨"
          : zh
            ? "站在海滨步道看百米白色豪华游轮犁开白色浪花驶过海湾，简直像在玩《城市：天际线》！🌊"
            : "Watching MS SN0VV Odyssey carve white foam across Emerald Bay from the boardwalk—pure magic! 🌊",
      x: cruise.x,
      z: cruise.z,
    },
    {
      id: "chirp-infra",
      author: zh ? "环保工程师林工" : "Eco Engineer Lin",
      handle: "@clean_water_lab",
      tag: "#零污染海湾",
      mood: "chat",
      text: zh
        ? "东湾生态污水处理厂 4 座旋转刮泥沉淀池全负荷运转中，尾水 99.4% 净水达标入海，连海鸥都变多了💧🌿"
        : "All 4 rotating clarifiers at East Bay Wastewater Plant running at 99.4% purity—crystal clear harbor water! 💧🌿",
      x: 264,
      z: 54,
    },
  ];
}

/**
 * 在 3D 世界中构建《城市：天际线》实时突发事件剧场：
 * 包含消防云梯车、高压水炮抛物线水柱、多层跃动火焰与黑烟、警车、蒙面小偷与赃物包、追捕警察、救护车与担架、爆管水柱与工程抢修车。
 * 所有动画完全由 seconds 确定性驱动，满足暂停重现与统一 GPU 资源释放契约。
 */
export function buildCityEvents(kit: CivicKit): { animate: (seconds: number) => void } {
  const { group, geometries, materials, nightMaterials, solid } = kit;
  const streetActivities = buildStreetActivities(kit);

  const regGeo = <T extends THREE.BufferGeometry>(geo: T): T => {
    geometries.add(geo);
    return geo;
  };

  const boxGeo = regGeo(new THREE.BoxGeometry(1, 1, 1));
  const coneGeo = regGeo(new THREE.ConeGeometry(1, 1, 9));
  const puffGeo = regGeo(new THREE.IcosahedronGeometry(1, 1));
  const sphereGeo = regGeo(new THREE.SphereGeometry(1, 10, 8));
  const cylGeo = regGeo(new THREE.CylinderGeometry(1, 1, 1, 14));

  // 应急事件专用材质（全部登记到 kit.materials 与 nightMaterials）
  const fireTruckRed = solid("#d62d24", 0.28, 0.36);
  const ladderSilver = solid("#d4dde2", 0.25, 0.72);
  const policeNavy = solid("#173252", 0.26, 0.42);
  const ambulanceWhite = solid("#f4f6f8", 0.28, 0.18);
  const utilityAmber = solid("#e8a328", 0.34, 0.28);
  const tireDark = solid("#1f2428", 0.78, 0.08);
  const windshieldMat = solid("#3b5d70", 0.14, 0.48);

  const turnoutYellow = solid("#e2a829", 0.68, 0.06);
  const thiefBlack = solid("#1b1e24", 0.85, 0.04);
  const lootBagTan = solid("#c49a5b", 0.75, 0.08);
  const medicGreen = solid("#259c72", 0.62, 0.06);
  const skinMat = solid("#ecc09c", 0.58, 0.02);

  const flameOuterMat = solid("#ff591f", 0.3, 0.0);
  flameOuterMat.emissive.set("#ff4500");
  nightMaterials.push({ material: flameOuterMat, day: 1.85, night: 3.8 });

  const flameCoreMat = solid("#ffe054", 0.2, 0.0);
  flameCoreMat.emissive.set("#ffd026");
  nightMaterials.push({ material: flameCoreMat, day: 2.2, night: 4.2 });

  const darkSmokeMat = solid("#34393e", 0.94, 0.0);
  const whiteSteamMat = solid("#edf4f7", 0.88, 0.0);

  const waterJetMat = solid("#7ee8ff", 0.12, 0.15);
  waterJetMat.emissive.set("#4cd4f7");
  nightMaterials.push({ material: waterJetMat, day: 0.75, night: 2.2 });

  const strobeRedMat = solid("#ff2d20", 0.2, 0.1);
  strobeRedMat.emissive.set("#ff2418");
  nightMaterials.push({ material: strobeRedMat, day: 1.4, night: 4.0 });

  const strobeBlueMat = solid("#148eff", 0.2, 0.1);
  strobeBlueMat.emissive.set("#0a84ff");
  nightMaterials.push({ material: strobeBlueMat, day: 1.4, night: 4.0 });

  const strobeAmberMat = solid("#ffb324", 0.2, 0.1);
  strobeAmberMat.emissive.set("#ffa412");
  nightMaterials.push({ material: strobeAmberMat, day: 1.3, night: 3.6 });

  const makeBatch = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, count: number, shadow = true) => {
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = shadow;
    mesh.receiveShadow = shadow;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  // 1. 火焰、浓烟、水炮与爆管水花批次
  const FLAME_COUNT = 14;
  const SMOKE_COUNT = 14;
  const STEAM_COUNT = 10;
  const WATER_JET_COUNT = 38; // 24 颗消防水炮水珠 + 14 颗市政爆管喷泉水珠
  const flameOuterMesh = makeBatch("Events · outer flames", coneGeo, flameOuterMat, FLAME_COUNT, false);
  const flameCoreMesh = makeBatch("Events · core flames", coneGeo, flameCoreMat, FLAME_COUNT, false);
  const fireSmokeMesh = makeBatch("Events · fire smoke", puffGeo, darkSmokeMat, SMOKE_COUNT, false);
  const fireSteamMesh = makeBatch("Events · steam mist", puffGeo, whiteSteamMat, STEAM_COUNT, false);
  const waterJetMesh = makeBatch("Events · water cannon & geyser", sphereGeo, waterJetMat, WATER_JET_COUNT, false);

  // 2. 四类特种应急车辆批次（重型消防云梯车、巡逻抓捕警车、120急救救护车、市政工程抢修车）
  const fireEngineBody = makeBatch("Events · fire engine body", boxGeo, fireTruckRed, 3);
  const ladderGeometry = regGeo(createAerialLadder());
  const fireEngineLadder = makeBatch("Events · fire ladder", ladderGeometry, ladderSilver, 4);
  const policeCruiserBody = makeBatch("Events · police cruiser", boxGeo, policeNavy, 2);
  const ambulanceBody = makeBatch("Events · ambulance", boxGeo, ambulanceWhite, 3);
  const utilityVanBody = makeBatch("Events · utility truck", boxGeo, utilityAmber, 3);
  const emergencyGlass = makeBatch("Events · vehicle windshields", boxGeo, windshieldMat, 8, false);
  const emergencyWheels = makeBatch("Events · vehicle wheels", cylGeo, tireDark, 16);

  // 应急爆闪警灯批次
  const strobeRed = makeBatch("Events · red strobes", boxGeo, strobeRedMat, 6, false);
  const strobeBlue = makeBatch("Events · blue strobes", boxGeo, strobeBlueMat, 4, false);
  const strobeAmber = makeBatch("Events · amber strobes", boxGeo, strobeAmberMat, 4, false);
  // v3：整车建模的警车 / 救护车 / 工程箱式货车取代旧的盒体拼装（旧槽位保留但每帧隐藏）。
  const policeUnit = new ServiceVehicle("police");
  const ambulanceUnit = new ServiceVehicle("ambulance");
  const utilityUnit = new ServiceVehicle("utility", "#f1efe6");
  for (const unit of [policeUnit, ambulanceUnit, utilityUnit]) group.add(unit.track(kit).group);
  if (canLoadCityAssets()) loadCarModelsOnce().then((models) => policeUnit.upgrade(models.sedan)).catch(() => undefined);

  // 3. 事件角色小人批次（3名消防员 + 1名蒙面小偷 + 2名追捕特警 + 2名急救医护 + 1名患者 + 2名抢修工程师 = 11 人）
  const ACTOR_COUNT = 11;
  const actorHeads = makeBatch("Events · actor heads", regGeo(createHead().scale(2, 2, 2)), skinMat, ACTOR_COUNT);
  const actorHelmets = makeBatch("Events · actor helmets", sphereGeo, strobeRedMat, 5); // 3消防头盔 + 2工程帽
  const actorTorsos = makeBatch("Events · actor torsos", regGeo(createTorso()), ambulanceWhite, ACTOR_COUNT);
  const actorLimbs = makeBatch("Events · actor limbs", regGeo(createUpperArm()), tireDark, ACTOR_COUNT * 4);
  const lootAndProps = makeBatch("Events · loot sack & stretcher", boxGeo, lootBagTan, 6);

  // 给每位事件角色躯干赋予精准职业制服颜色
  const actorCoatColors = [
    "#e2a829", "#e2a829", "#e2a829", // 0..2: 消防员明黄战斗服
    "#191c22",                        // 3: 蒙面小偷黑衣连帽衫
    "#18375e", "#18375e",             // 4..5: 追捕警察藏蓝警服
    "#229a70", "#229a70",             // 6..7: 120急救医护绿白制服
    "#d4684e",                        // 8: 突发不适市民
    "#eb8b28", "#eb8b28",             // 9..10: 市政抢修工程师橙色反光服
  ];
  // 写实蒙皮人体：事件角色（职业制服）与火灾现场围观群众。
  const ONLOOKER_COUNT = 9;
  const eventPeople = new SkinnedPeople(group, ACTOR_COUNT + ONLOOKER_COUNT);
  const eventPose = createWorldPose();
  const uniformTrousers = ["#2f2a1e", "#2f2a1e", "#2f2a1e", "#16181c", "#141c2b", "#141c2b", "#e9ece8", "#e9ece8", "#3a4150", "#2d3138", "#2d3138"];
  const onlookerCoats = ["#3e5674", "#8e9fb2", "#6b3238", "#c5c0b4", "#26282c", "#a8946f", "#55603f", "#d6d3ca", "#93463a"];
  const onlookerSkins = ["#d9a888", "#bb8a68", "#e8c3a4", "#8f634c", "#c99a78"];
  const eventAppearances: Appearance[] = Array.from({ length: ACTOR_COUNT + ONLOOKER_COUNT }, (_, i) => {
    const onlooker = i >= ACTOR_COUNT;
    return {
      height: onlooker ? 1.62 + (i % 4) * 0.06 : 1.78, shoulderWidth: 0.42, build: onlooker ? 0.94 + (i % 3) * 0.04 : 1.04,
      skin: onlookerSkins[i % onlookerSkins.length], hair: i % 3 ? "#231d19" : "#4d3527",
      coat: onlooker ? onlookerCoats[(i - ACTOR_COUNT) % onlookerCoats.length] : actorCoatColors[i],
      trousers: onlooker ? (i % 2 ? "#2e3c55" : "#24272b") : uniformTrousers[i], shoes: i % 4 === 1 ? "#d9d6cf" : "#1f1f21",
      hairStyle: onlooker && i % 3 === 0 ? 2 : 0, hat: false, glasses: false, coatLength: !onlooker && i < 3 ? 0.75 : 0.4,
      sleeveLength: onlooker && i % 4 === 2 ? 0.3 : 0.95, winterCoat: !onlooker && i < 3, skirt: onlooker && i % 5 === 1,
    };
  });
  const eventPoint = (ax: number, ay: number, az: number, sinH: number, cosH: number, lx: number, ly: number, lz: number, target: THREE.Vector3) =>
    target.set(ax + cosH * lx + sinH * lz, ay + ly, az - sinH * lx + cosH * lz);
  /** 由简化的「职业动作」生成 ActorPose 关节并交给实例化蒙皮人体。 */
  const skinnedActor = (
    slot: number, ax: number, ay: number, az: number, heading: number, seconds: number,
    mode: "run" | "spray" | "handsUp" | "kneel" | "work" | "watch" | "film",
  ): THREE.Vector3 | null => {
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const cycle = seconds * (mode === "run" ? 10.5 : 3.6) + slot * 1.3;
    const stride = mode === "run" ? Math.sin(cycle) * 0.62 : 0;
    const bob = mode === "run" ? Math.abs(Math.cos(cycle)) * 0.05 : Math.sin(seconds * 1.4 + slot) * 0.004;
    const kneel = mode === "kneel";
    const hipsY = (kneel ? 0.6 : 0.94) + bob;
    const tp = mode === "run" ? 0.2 : kneel ? 0.3 : mode === "work" ? 0.32 : mode === "spray" ? 0.08 : 0.02;
    const at = (lx: number, ly: number, lz: number, target: THREE.Vector3) => eventPoint(ax, ay, az, sinH, cosH, lx, ly, lz, target);
    at(0, hipsY, 0, eventPose.hips);
    at(0, hipsY + Math.cos(tp) * 0.36, Math.sin(tp) * 0.36, eventPose.chest);
    at(0, hipsY + Math.cos(tp) * 0.71, Math.sin(tp) * 0.71, eventPose.head);
    for (const side of [-1, 1]) {
      const left = side < 0;
      const s = left ? 0 : 1;
      let thigh = kneel ? (s === 0 ? -1.45 : 0.15) : side * stride;
      let shin = kneel ? (s === 0 ? 0 : 1.5) : thigh + Math.max(0, Math.sin(cycle) * side) * (mode === "run" ? 1.0 : 0);
      if (mode === "work") { thigh = -0.35; shin = 0.2; }
      const hx = side * 0.1;
      const kneeY = hipsY - Math.cos(thigh) * 0.43;
      const kneeZ = -Math.sin(thigh) * 0.43;
      at(hx, hipsY, 0, left ? eventPose.leftHip : eventPose.rightHip);
      at(hx, kneeY, kneeZ, left ? eventPose.leftKnee : eventPose.rightKnee);
      at(hx, Math.max(0.085, kneeY - Math.cos(shin) * 0.43), kneeZ - Math.sin(shin) * 0.43, left ? eventPose.leftAnkle : eventPose.rightAnkle);
      const shoulderY = hipsY + Math.cos(tp) * 0.5;
      const shoulderZ = Math.sin(tp) * 0.5;
      let upper = -side * stride * 0.8;
      let lower = upper - 0.25;
      if (mode === "spray") { upper = s === 1 ? -0.95 : -0.75; lower = s === 1 ? -1.45 : -1.35; }
      if (mode === "handsUp") { upper = -2.8; lower = -2.95; }
      if (mode === "kneel" || mode === "work") { upper = -0.85 + Math.sin(seconds * 6 + s) * 0.2; lower = upper - 0.5; }
      if (mode === "watch") { upper = s === 1 && slot % 3 === 0 ? -0.55 : 0.05; lower = s === 1 && slot % 3 === 0 ? -1.9 : -0.1; }
      if (mode === "film") { upper = s === 1 ? -1.2 : 0.05; lower = s === 1 ? -1.5 : -0.1; }
      const sx = side * 0.21;
      const elbowY = shoulderY - Math.cos(upper) * 0.29;
      const elbowZ = shoulderZ - Math.sin(upper) * 0.29;
      at(sx, shoulderY, shoulderZ, left ? eventPose.leftShoulder : eventPose.rightShoulder);
      at(sx + side * 0.03, elbowY, elbowZ, left ? eventPose.leftElbow : eventPose.rightElbow);
      at(sx + (mode === "spray" || mode === "film" ? -side * 0.06 : side * 0.01), elbowY - Math.cos(lower) * 0.31, elbowZ - Math.sin(lower) * 0.31, left ? eventPose.leftHand : eventPose.rightHand);
    }
    const a = eventAppearances[slot];
    eventPose.heading = heading;
    eventPose.headYaw = mode === "watch" ? Math.sin(seconds * 0.4 + slot) * 0.25 : 0;
    eventPose.headPitch = mode === "watch" || mode === "film" || mode === "spray" ? -0.35 : kneel ? 0.35 : 0;
    eventPose.leftFootPitch = 0;
    eventPose.rightFootPitch = 0;
    eventPose.scale = a.height / 1.76;
    return eventPeople.add(eventPose, a) ? eventPose.head : null;
  };

  const tmpColor = new THREE.Color();
  actorCoatColors.forEach((hex, idx) => {
    actorTorsos.setColorAt(idx, tmpColor.set(hex));
  });
  // 抢修工程师安全帽设为明黄色
  [0, 1, 2].forEach((i) => actorHelmets.setColorAt(i, tmpColor.set("#d93226")));
  [3, 4].forEach((i) => actorHelmets.setColorAt(i, tmpColor.set("#f2be32")));

  // 道具颜色：0=小偷鼓鼓囊囊赃物袋, 1=急救推车担架床面, 2=急救医疗箱, 3..5=抢修安全围挡锥
  lootAndProps.setColorAt(0, tmpColor.set("#cfa15a"));
  lootAndProps.setColorAt(1, tmpColor.set("#f5f7f9"));
  lootAndProps.setColorAt(2, tmpColor.set("#e0382d"));
  [3, 4, 5].forEach((i) => lootAndProps.setColorAt(i, tmpColor.set("#eb6a24")));

  // GPU fire replaces the cone flames, sphere smoke and droplet water of the first version.
  for (const legacy of [flameOuterMesh, flameCoreMesh, fireSmokeMesh, fireSteamMesh]) legacy.visible = false;
  const fireFx = new CityFireEffect();
  fireFx.register(materials, geometries);
  group.add(fireFx.group);
  const facadeCache = new Map<string, { origin: THREE.Vector3; normal: THREE.Vector3 }>();
  const facadeRay = new THREE.Raycaster();
  const facadeFor = (site: FireSiteSpec) => {
    const cached = facadeCache.get(site.id);
    if (cached) return cached;
    // Find the real wall behind the authored fire point so flames come out of windows, not mid-air.
    const towardStreet = new THREE.Vector3(site.truckParkX - site.fireX, 0, site.truckParkZ - site.fireZ);
    const normal = Math.abs(towardStreet.x) > Math.abs(towardStreet.z)
      ? new THREE.Vector3(Math.sign(towardStreet.x), 0, 0) : new THREE.Vector3(0, 0, Math.sign(towardStreet.z) || 1);
    const origin = new THREE.Vector3(site.fireX, site.fireY, site.fireZ);
    facadeRay.set(origin.clone().addScaledVector(normal, 14), normal.clone().negate());
    facadeRay.far = 26;
    const hits = facadeRay.intersectObjects(group.children.filter((child) => child !== fireFx.group), true);
    const wall = hits.find((hit) => {
      const material = (hit.object as THREE.Mesh).material as THREE.Material;
      if (!hit.face || Array.isArray(material) || material.transparent || /tree|canopy|leaf|crown|life|traffic|event/i.test(hit.object.name)) return false;
      const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      return worldNormal.dot(normal) > 0.7;
    });
    if (wall) origin.copy(wall.point).setY(site.fireY);
    const entry = { origin, normal };
    facadeCache.set(site.id, entry);
    return entry;
  };
  // v3 消防车：与警车 / 救护车同一套整车构件与涂装（乘员室、卷帘器材厢、转台、拉梯、卷盘、警灯排）。
  const fireUnit = new ServiceVehicle("fireengine");
  group.add(fireUnit.track(kit).group);
  const fireEngine = fireUnit.group;
  fireEngine.name = "Events · fire engine";
  const fireNozzle = new THREE.Vector3();
  const fireHose = new THREE.Vector3();

  const allMeshes = [
    flameOuterMesh, flameCoreMesh, fireSmokeMesh, fireSteamMesh, waterJetMesh,
    fireEngineBody, fireEngineLadder, policeCruiserBody, ambulanceBody, utilityVanBody,
    emergencyGlass, emergencyWheels, strobeRed, strobeBlue, strobeAmber,
    actorHeads, actorHelmets, actorTorsos, actorLimbs, lootAndProps,
  ];

  const dummy = new THREE.Object3D();
  dummy.rotation.order = "YXZ";

  const hideInstance = (mesh: THREE.InstancedMesh, index: number) => {
    dummy.position.set(0, -30, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(0.001, 0.001, 0.001);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  };

  const placeWheelQuad = (baseIdx: number, cx: number, cz: number, heading: number, halfW: number, axleZ: number, r: number) => {
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const offsets: [number, number][] = [
      [-halfW, axleZ],
      [halfW, axleZ],
      [-halfW, -axleZ],
      [halfW, -axleZ],
    ];
    offsets.forEach(([lx, lz], i) => {
      dummy.position.set(cx + sinH * lz + cosH * lx, 0.42 + r, cz + cosH * lz - sinH * lx);
      dummy.rotation.set(0, heading, Math.PI / 2);
      dummy.scale.set(r, 0.24, r);
      dummy.updateMatrix();
      emergencyWheels.setMatrixAt(baseIdx + i, dummy.matrix);
    });
  };

  const poseActor = (
    actorIdx: number,
    ax: number,
    ay: number,
    az: number,
    heading: number,
    seconds: number,
    mode: "run" | "spray" | "handsUp" | "kneel" | "work",
    helmetSlot?: number,
  ) => {
    if (eventPeople.ready) {
      hideInstance(actorTorsos, actorIdx);
      hideInstance(actorHeads, actorIdx);
      for (let limb = 0; limb < 4; limb++) hideInstance(actorLimbs, actorIdx * 4 + limb);
      const head = ay > -5 ? skinnedActor(actorIdx, ax, ay, az, heading, seconds, mode) : null;
      if (helmetSlot !== undefined) {
        if (head) {
          dummy.position.set(head.x, head.y + 0.075, head.z);
          dummy.rotation.set(0, heading, 0);
          dummy.scale.set(0.135, 0.085, 0.15);
          dummy.updateMatrix();
          actorHelmets.setMatrixAt(helmetSlot, dummy.matrix);
        } else hideInstance(actorHelmets, helmetSlot);
      }
      return;
    }
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const cycle = seconds * (mode === "run" ? 10.5 : 3.6) + actorIdx * 1.3;
    const stride = mode === "run" ? Math.sin(cycle) * 0.65 : mode === "work" ? Math.sin(cycle) * 0.15 : 0;
    const bob = mode === "run" ? Math.abs(Math.cos(cycle)) * 0.06 : 0;
    const crouch = mode === "kneel" ? -0.32 : 0;
    const torsoPitch = mode === "run" ? 0.22 : mode === "kneel" ? 0.35 : mode === "work" ? 0.28 : -0.06;

    const toWorld = (lx: number, ly: number, lz: number) => {
      dummy.position.set(ax + cosH * lx + sinH * lz, ay + ly + bob + crouch, az - sinH * lx + cosH * lz);
    };

    // 躯干与头部
    toWorld(0, 1.12, 0);
    dummy.rotation.set(torsoPitch, heading, 0);
    dummy.scale.set(0.46, 0.58, 0.28);
    dummy.updateMatrix();
    actorTorsos.setMatrixAt(actorIdx, dummy.matrix);

    toWorld(0, 1.56, Math.sin(torsoPitch) * 0.12);
    dummy.rotation.set(0, heading, 0);
    dummy.scale.set(0.14, 0.15, 0.14);
    dummy.updateMatrix();
    actorHeads.setMatrixAt(actorIdx, dummy.matrix);

    if (helmetSlot !== undefined) {
      toWorld(0, 1.66, Math.sin(torsoPitch) * 0.12);
      dummy.rotation.set(0, heading, 0);
      dummy.scale.set(0.17, 0.11, 0.19);
      dummy.updateMatrix();
      actorHelmets.setMatrixAt(helmetSlot, dummy.matrix);
    }

    // 双腿与双臂 (4 limbs)
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const legPitch = mode === "kneel" ? (s === 0 ? -0.9 : 0.4) : side * stride;
      toWorld(side * 0.12, 0.52, -Math.sin(legPitch) * 0.14);
      dummy.rotation.set(legPitch, heading, 0);
      dummy.scale.set(0.15, 0.68, 0.16);
      dummy.updateMatrix();
      actorLimbs.setMatrixAt(actorIdx * 4 + s, dummy.matrix);

      const armPitch =
        mode === "handsUp"
          ? -2.75 + Math.sin(seconds * 5 + s) * 0.08 // 举手投降姿态！
          : mode === "spray"
            ? -1.15 // 双手端持高压水枪
            : mode === "kneel" || mode === "work"
              ? -0.95 + Math.sin(seconds * 6 + s) * 0.22
              : -side * stride * 0.85;
      toWorld(side * 0.28, mode === "handsUp" ? 1.56 : 1.16, mode === "spray" ? 0.24 : 0);
      dummy.rotation.set(armPitch, heading, 0);
      dummy.scale.set(0.12, 0.54, 0.12);
      dummy.updateMatrix();
      actorLimbs.setMatrixAt(actorIdx * 4 + 2 + s, dummy.matrix);
    }
  };

  const animate = (seconds: number) => {
    streetActivities.animate(seconds);
    eventPeople.begin();
    const flashA = Math.sin(seconds * 15) > 0;
    const flashB = !flashA;

    // ==========================================================================
    // 事件一：🔥 建筑火灾、重型消防云梯车与抛物线高压水炮灭火
    // ==========================================================================
    const fire = sampleFireIncident(seconds);
    const { site: fSite, fireIntensity, spraying, arrived: fireArrived } = fire;

    // 14 簇双层跃动 3D 火焰
    for (let i = 0; i < FLAME_COUNT; i++) {
      if (fireIntensity <= 0.02) {
        hideInstance(flameOuterMesh, i);
        hideInstance(flameCoreMesh, i);
        continue;
      }
      const spreadX = ((i % 5) - 2) * 0.95 + Math.sin(seconds * 7.2 + i) * 0.22;
      const spreadZ = (Math.floor(i / 5) - 1) * 0.65 + Math.cos(seconds * 6.4 + i * 2) * 0.18;
      const flicker = 0.72 + 0.38 * Math.sin(seconds * 13.5 + i * 1.9);
      const hScale = (1.35 + (i % 3) * 0.65) * fireIntensity * flicker;
      const rScale = (0.48 + (i % 4) * 0.16) * Math.sqrt(fireIntensity);

      dummy.position.set(fSite.fireX + spreadX, fSite.fireY + hScale * 0.38, fSite.fireZ + spreadZ);
      dummy.rotation.set(Math.sin(seconds * 5 + i) * 0.12, seconds * 2 + i, Math.cos(seconds * 4 + i) * 0.12);
      dummy.scale.set(rScale, hScale, rScale);
      dummy.updateMatrix();
      flameOuterMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.y -= 0.12;
      dummy.scale.set(rScale * 0.58, hScale * 0.72, rScale * 0.58);
      dummy.updateMatrix();
      flameCoreMesh.setMatrixAt(i, dummy.matrix);
    }

    // 14 团滚滚升腾黑烟柱
    for (let s = 0; s < SMOKE_COUNT; s++) {
      if (fireIntensity <= 0.01 && fire.progress > 0.94) {
        hideInstance(fireSmokeMesh, s);
        continue;
      }
      const p = THREE.MathUtils.euclideanModulo(seconds * 0.36 + s / SMOKE_COUNT, 1);
      const smokeStrength = Math.max(0.2, fireIntensity);
      const sx = fSite.fireX + Math.sin(p * 6 + s) * (0.9 + p * 2.2) + p * 2.8;
      const sy = fSite.fireY + 1.2 + p * 16.5;
      const sz = fSite.fireZ + Math.cos(p * 5 + s) * (0.8 + p * 1.8);
      const rad = (0.55 + p * 1.95) * smokeStrength * (1 - p * 0.35);
      dummy.position.set(sx, sy, sz);
      dummy.rotation.set(seconds * 0.8 + s, seconds * 0.5, 0);
      dummy.scale.set(rad, rad * 0.82, rad);
      dummy.updateMatrix();
      fireSmokeMesh.setMatrixAt(s, dummy.matrix);
    }

    // 重型消防云梯车建模（驾驶室 + 水罐泵浦车厢 + 车顶旋转云梯与水炮）
    const fSin = Math.sin(fSite.truckHeading);
    const fCos = Math.cos(fSite.truckHeading);
    // 驾驶室
    dummy.position.set(fire.truckX + fSin * 2.55, 1.65, fire.truckZ + fCos * 2.55);
    dummy.rotation.set(0, fSite.truckHeading, 0);
    dummy.scale.set(2.35, 2.25, 2.2);
    dummy.updateMatrix();
    hideInstance(fireEngineBody, 0);
    // 水罐车体
    dummy.position.set(fire.truckX - fSin * 1.15, 1.72, fire.truckZ - fCos * 1.15);
    dummy.scale.set(2.42, 2.35, 4.6);
    dummy.updateMatrix();
    hideInstance(fireEngineBody, 1);
    hideInstance(fireEngineBody, 2);

    // 消防车前风挡
    dummy.position.set(fire.truckX + fSin * 3.68, 1.95, fire.truckZ + fCos * 3.68);
    dummy.rotation.set(0, fSite.truckHeading, 0);
    dummy.scale.set(2.05, 0.88, 0.08);
    dummy.updateMatrix();
    hideInstance(emergencyGlass, 0);

    // 消防云梯（到场后自动仰起瞄准着火点！）
    // 云梯根部固定在器材厢后部的转台上（车身中心后方约 2.35 m）。
    const ladderBaseX = fire.truckX + fSin * (0.7 - 3.05), ladderBaseZ = fire.truckZ + fCos * (0.7 - 3.05);
    const aimAngle = Math.atan2(fSite.fireX - ladderBaseX, fSite.fireZ - ladderBaseZ);
    const ladderPitch = fireArrived ? -0.52 : -0.04;
    const ladderLen = fireArrived ? 8.8 : 5.6;
    dummy.position.set(
      fire.truckX + (fireArrived ? ladderBaseX - fire.truckX + Math.sin(aimAngle) * Math.cos(0.52) * ladderLen / 2 : -fSin * 0.5),
      fireArrived ? 3.3 + Math.sin(0.52) * ladderLen / 2 : 3.25,
      fire.truckZ + (fireArrived ? ladderBaseZ - fire.truckZ + Math.cos(aimAngle) * Math.cos(0.52) * ladderLen / 2 : -fCos * 0.5),
    );
    dummy.rotation.set(ladderPitch, fireArrived ? aimAngle : fSite.truckHeading, 0);
    // 云梯几何按 9 m 建模：展开时伸长，收起时各节套叠（沿长度压缩）。
    dummy.scale.set(1, 1, ladderLen / LADDER_LENGTH);
    dummy.updateMatrix();
    fireEngineLadder.setMatrixAt(0, dummy.matrix);
    // 车侧白色铝合金卷帘器材门条纹
    dummy.position.set(fire.truckX - fSin * 1.15, 1.68, fire.truckZ - fCos * 1.15);
    dummy.rotation.set(0, fSite.truckHeading, 0);
    dummy.scale.set(2.48, 1.15, 3.6);
    dummy.updateMatrix();
    hideInstance(fireEngineLadder, 1);
    hideInstance(fireEngineLadder, 2);
    hideInstance(fireEngineLadder, 3);

    for (let wheel = 0; wheel < 4; wheel++) hideInstance(emergencyWheels, wheel);
    fireUnit.place(fire.truckX + fSin * 0.7, 0.42, fire.truckZ + fCos * 0.7, fSite.truckHeading);
    fireUnit.flash(seconds, true, strobeRedMat.emissiveIntensity > 2.5);

    // 消防车红灯爆闪
    dummy.position.set(fire.truckX + fSin * 3.1, -20, fire.truckZ + fCos * 3.1);
    dummy.rotation.set(0, fSite.truckHeading, 0);
    dummy.scale.set(1.55, 0.22, 0.34);
    dummy.updateMatrix();
    strobeRed.setMatrixAt(0, dummy.matrix);

    // 3 名消防员在路缘部署水枪阵地
    for (let ff = 0; ff < 3; ff++) {
      if (!fireArrived) {
        poseActor(ff, fire.truckX, -25, fire.truckZ, 0, seconds, "spray", ff);
        hideInstance(actorHelmets, ff);
      } else {
        const fx = fSite.crewBaseX + (ff - 1) * 1.85;
        const fz = fSite.crewBaseZ;
        const faceFire = Math.atan2(fSite.fireX - fx, fSite.fireZ - fz);
        poseActor(ff, fx, 0.48, fz, faceFire, seconds, "spray", ff);
      }
    }

    // 围观群众：在消防员身后约 9–13 m 处驻足、举手机拍摄。
    if (fireArrived && fireIntensity > 0.05) {
      const awayX = fSite.crewBaseX - fSite.fireX;
      const awayZ = fSite.crewBaseZ - fSite.fireZ;
      const awayLength = Math.hypot(awayX, awayZ) || 1;
      const ux = awayX / awayLength, uz = awayZ / awayLength;
      for (let o = 0; o < ONLOOKER_COUNT; o++) {
        const back = 6.5 + (o % 3) * 0.9 + Math.sin(o * 2.3) * 0.4;
        const across = (o - (ONLOOKER_COUNT - 1) / 2) * 1.05;
        const ox = fSite.crewBaseX + ux * back - uz * across;
        const oz = fSite.crewBaseZ + uz * back + ux * across;
        const face = Math.atan2(fSite.fireX - ox, fSite.fireZ - oz) + Math.sin(o * 1.7) * 0.2;
        skinnedActor(ACTOR_COUNT + o, ox, 0.48, oz, face, seconds, o % 4 === 1 ? "film" : "watch");
      }
    }

    // 24 颗抛物线消防高压水炮水柱 + 10 团灭火白色水蒸气
    const facade = facadeFor(fSite);
    fireNozzle.set(ladderBaseX + Math.sin(aimAngle) * Math.cos(0.52) * 8.6, 3.3 + Math.sin(0.52) * 8.6, ladderBaseZ + Math.cos(aimAngle) * Math.cos(0.52) * 8.6);
    fireHose.set(fSite.crewBaseX, 1.55, fSite.crewBaseZ);
    fireFx.update({
      seconds, origin: facade.origin, normal: facade.normal, intensity: fireIntensity, progress: fire.progress,
      spraying, nozzle: fireNozzle, hose: fireHose, night: flameOuterMat.emissiveIntensity > 3,
    });
    // The GPU hose streams in fireFx replace the 24 droplet instances.
    for (let w = 0; w < 24; w++) hideInstance(waterJetMesh, w);

    for (let st = 0; st < STEAM_COUNT; st++) {
      if (!spraying) {
        hideInstance(fireSteamMesh, st);
        continue;
      }
      const p = THREE.MathUtils.euclideanModulo(seconds * 0.65 + st / STEAM_COUNT, 1);
      dummy.position.set(
        fSite.fireX + Math.sin(p * 7 + st) * 1.6,
        fSite.fireY + 0.6 + p * 6.8,
        fSite.fireZ + Math.cos(p * 6 + st) * 1.4,
      );
      dummy.rotation.set(seconds + st, seconds * 0.6, 0);
      const sr = (0.45 + p * 1.35) * (1 - p * 0.4);
      dummy.scale.set(sr, sr * 0.85, sr);
      dummy.updateMatrix();
      fireSteamMesh.setMatrixAt(st, dummy.matrix);
    }

    // ==========================================================================
    // 事件二：🦹 入室小偷携赃潜逃 + 巡逻警车爆闪拦截 + 双特警徒步追捕抓获
    // ==========================================================================
    const burg = sampleBurglarIncident(seconds);
    const pSin = Math.sin(burg.site.carHeading);
    const pCos = Math.cos(burg.site.carHeading);

    // 巡逻抓捕警车：CC0 轿车 + 警用涂装 + 红蓝爆闪灯排
    const eventNight = strobeRedMat.emissiveIntensity > 2.5;
    policeUnit.place(burg.carX, 0.42, burg.carZ, burg.site.carHeading);
    policeUnit.flash(seconds, true, eventNight);
    hideInstance(policeCruiserBody, 0);
    hideInstance(policeCruiserBody, 1);
    hideInstance(emergencyGlass, 1);
    for (let wheel = 4; wheel < 16; wheel++) hideInstance(emergencyWheels, wheel);
    hideInstance(strobeRed, 1);
    hideInstance(strobeBlue, 0);
    void pSin; void pCos;

    // 角色 3：蒙面小偷（狂奔潜逃 -> 被包抄后高举双手投降！）
    poseActor(
      3,
      burg.thiefX,
      0.48,
      burg.thiefZ,
      burg.arrested ? burg.runHeading + Math.PI : burg.runHeading,
      seconds,
      burg.arrested ? "handsUp" : "run",
    );
    // 小偷肩背/掉落地面的鼓鼓囊囊赃物包 (lootAndProps[0])
    dummy.position.set(
      burg.thiefX + (burg.arrested ? 0.58 : -Math.sin(burg.runHeading) * 0.28),
      burg.arrested ? 0.72 : 1.38,
      burg.thiefZ + (burg.arrested ? 0.42 : -Math.cos(burg.runHeading) * 0.28),
    );
    dummy.rotation.set(0.25, burg.runHeading, 0.18);
    dummy.scale.set(0.46, 0.52, 0.42);
    dummy.updateMatrix();
    lootAndProps.setMatrixAt(0, dummy.matrix);

    // 角色 4 & 5：两名紧追不舍/前后合围的巡逻警察
    poseActor(
      4,
      burg.cop1X,
      0.48,
      burg.cop1Z,
      Math.atan2(burg.thiefX - burg.cop1X, burg.thiefZ - burg.cop1Z),
      seconds + 0.4,
      burg.arrested ? "spray" : "run",
    );
    poseActor(
      5,
      burg.cop2X,
      0.48,
      burg.cop2Z,
      Math.atan2(burg.thiefX - burg.cop2X, burg.thiefZ - burg.cop2Z),
      seconds + 0.9,
      burg.arrested ? "spray" : "run",
    );

    // ==========================================================================
    // 事件三：🚑 市民突发医疗急救 + 120 救护车 + 双医护担架施救
    // ==========================================================================
    const med = sampleMedicalIncident(seconds);
    const mSin = Math.sin(med.site.ambHeading);
    const mCos = Math.cos(med.site.ambHeading);

    // 120 急救车：一体式厢体 + 红色生命彩带 + 前后灯排
    ambulanceUnit.place(med.ambX, 0.42, med.ambZ, med.site.ambHeading);
    ambulanceUnit.flash(seconds, true, eventNight);
    for (let slot = 0; slot < 3; slot++) hideInstance(ambulanceBody, slot);
    hideInstance(strobeRed, 2);
    hideInstance(emergencyGlass, 2);
    hideInstance(strobeBlue, 1);
    void mSin; void mCos;

    // 角色 8：不适市民，角色 6 & 7：急救医护人员 + 轮式急救担架床
    poseActor(8, med.site.patientX, 0.45, med.site.patientZ, 0.4, seconds, "kneel");
    if (med.treating) {
      poseActor(6, med.site.patientX - 0.85, 0.48, med.site.patientZ + 0.35, 1.2, seconds, "kneel");
      poseActor(7, med.site.patientX + 0.85, 0.48, med.site.patientZ + 0.35, -1.2, seconds, "work");
      // 3D 急救推车担架与红十字急救箱
      dummy.position.set(med.site.patientX, 0.78, med.site.patientZ + 1.25);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.95, 0.22, 0.68);
      dummy.updateMatrix();
      lootAndProps.setMatrixAt(1, dummy.matrix);

      dummy.position.set(med.site.patientX - 0.45, 0.64, med.site.patientZ - 0.55);
      dummy.scale.set(0.48, 0.32, 0.34);
      dummy.updateMatrix();
      lootAndProps.setMatrixAt(2, dummy.matrix);
    } else {
      poseActor(6, med.ambX, -25, med.ambZ, 0, seconds, "work");
      poseActor(7, med.ambX, -25, med.ambZ, 0, seconds, "work");
      hideInstance(lootAndProps, 1);
      hideInstance(lootAndProps, 2);
    }

    // ==========================================================================
    // 事件四：⚡ 市政供水主干管爆裂高压水柱喷泉 + 黄色工程抢修车与安全帽工程师
    // ==========================================================================
    const util = sampleUtilityIncident(seconds);
    const uSin = Math.sin(util.site.vanHeading);
    const uCos = Math.cos(util.site.vanHeading);

    // 市政抢修箱式货车：平头驾驶室与货厢一体、底盘纵梁、双后轮、琥珀灯排与梯架
    utilityUnit.place(util.vanX, 0.42, util.vanZ, util.site.vanHeading);
    utilityUnit.flash(seconds, true, eventNight);
    for (let slot = 0; slot < 3; slot++) hideInstance(utilityVanBody, slot);
    for (let g = 3; g < 8; g++) hideInstance(emergencyGlass, g);
    for (let a = 0; a < 4; a++) hideInstance(strobeAmber, a);
    for (let r = 3; r < 6; r++) hideInstance(strobeRed, r);
    for (let b = 2; b < 4; b++) hideInstance(strobeBlue, b);
    void uSin; void uCos;

    // 爆管冲天高压水柱喷泉 (waterJetMesh 槽位 24..37)
    for (let g = 0; g < 14; g++) {
      const slot = 24 + g;
      if (util.geyserScale <= 0.08) {
        hideInstance(waterJetMesh, slot);
        continue;
      }
      const p = THREE.MathUtils.euclideanModulo(seconds * 1.9 + g / 14, 1);
      const spreadAngle = g * 2.1 + seconds;
      const spreadR = p * 1.35 * util.geyserScale;
      const gy = 0.5 + Math.sin(p * Math.PI * 0.85) * 7.8 * util.geyserScale;
      dummy.position.set(
        util.site.leakX + Math.cos(spreadAngle) * spreadR,
        gy,
        util.site.leakZ + Math.sin(spreadAngle) * spreadR,
      );
      dummy.rotation.set(0, spreadAngle, 0);
      const gs = (0.2 + p * 0.28) * util.geyserScale;
      dummy.scale.set(gs, gs * 2.2, gs);
      dummy.updateMatrix();
      waterJetMesh.setMatrixAt(slot, dummy.matrix);
    }

    // 2 名头戴黄色安全帽的抢修工程师 + 3 个安全围挡路锥
    if (util.repairing) {
      poseActor(9, util.site.leakX - 1.25, 0.48, util.site.leakZ + 0.4, 1.3, seconds, "work", 3);
      poseActor(10, util.site.leakX + 1.25, 0.48, util.site.leakZ - 0.4, -1.7, seconds + 0.8, "work", 4);
      for (let c = 0; c < 3; c++) {
        const ang = (c * Math.PI * 2) / 3 + 0.4;
        dummy.position.set(
          util.site.leakX + Math.cos(ang) * 2.1,
          0.72,
          util.site.leakZ + Math.sin(ang) * 2.1,
        );
        dummy.rotation.set(0, ang, 0);
        dummy.scale.set(0.35, 0.62, 0.35);
        dummy.updateMatrix();
        lootAndProps.setMatrixAt(3 + c, dummy.matrix);
      }
    } else {
      poseActor(9, util.vanX, -25, util.vanZ, 0, seconds, "work", 3);
      poseActor(10, util.vanX, -25, util.vanZ, 0, seconds, "work", 4);
      hideInstance(actorHelmets, 3);
      hideInstance(actorHelmets, 4);
      for (let c = 0; c < 3; c++) hideInstance(lootAndProps, 3 + c);
    }

    eventPeople.end();
    allMeshes.forEach((mesh) => {
      mesh.instanceMatrix.needsUpdate = true;
    });
  };

  animate(0);
  return { animate };
}

const LADDER_LENGTH = 9;

/** 消防车云梯：两节套叠梯身（底梁 + 扶手桁架 + 立柱 + 斜撑 + 踏棍），以中心为原点、+z 为梯头，单位米。 */
function createAerialLadder(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, rx = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    parts.push(g);
  };
  const half = LADDER_LENGTH / 2;
  for (const [width, lift, length, offset] of [[0.72, 0, LADDER_LENGTH, 0], [0.56, 0.07, LADDER_LENGTH * 0.88, 0.4]] as const) {
    const x = width / 2;
    for (const side of [-1, 1]) {
      box(0.07, 0.12, length, side * x, -0.16 + lift, offset);
      box(0.045, 0.045, length, side * x, 0.17 + lift, offset);
      const posts = Math.round(length / 0.9);
      for (let i = 0; i <= posts; i++) {
        const z = offset - length / 2 + (i / posts) * length;
        box(0.03, 0.33, 0.03, side * x, 0.005 + lift, z);
        if (i < posts) {
          const span = length / posts;
          const diagonal = Math.hypot(span, 0.33);
          box(0.022, 0.022, diagonal, side * x, 0.005 + lift, z + span / 2, Math.atan2(0.33, span) * (i % 2 ? 1 : -1));
        }
      }
    }
    if (lift === 0) {
      const rungs = Math.round(length / 0.32);
      for (let i = 0; i <= rungs; i++) {
        const rung = new THREE.CylinderGeometry(0.02, 0.02, width, 6);
        rung.rotateZ(Math.PI / 2);
        rung.translate(0, -0.15, -half + (i / rungs) * length);
        parts.push(rung);
      }
    }
  }
  // 梯根转台与举升油缸
  const turret = new THREE.CylinderGeometry(0.42, 0.48, 0.28, 16);
  turret.translate(0, -0.34, -half + 0.4);
  parts.push(turret);
  box(0.16, 0.16, 2.4, 0, -0.34, -half + 1.6, 0.12);
  const merged = mergeGeometries(parts.map((part) => part.index ? part.toNonIndexed() : part), false)!;
  parts.forEach((part) => part.dispose());
  merged.computeVertexNormals();
  return merged;
}
