import * as THREE from "three";
import { centralParkWalks, centralParkBenches, centralParkGatherings } from "./city-civic";
import {
  createBackpack, createCalf, createCap, createForearm, createHair, createHairLong, createHairPonytail, createHand, createHead,
  createNeck, createPelvis, createShoe, createThigh, createTorso, createUpperArm,
} from "./city-figure";
import { LEG_LENGTH, sampleWalkingLeg, type WalkingLeg } from "./city-gait";
import { MCDONALDS_SITE, OFFICE_LOBBY_DOORS } from "./city-mcdonalds";
import { EARTH_GRAVITY, CITY_DAY_SECONDS, SHOP_ARRIVAL_OFFSETS, sampleCityClock, sampleShopVisit, type SeasonId } from "./city-physics";
import { getSessionTrafficCrashSite } from "./city-event-sites";

type RouteSegment = {
  x: number;
  z: number;
  dx: number;
  dz: number;
  length: number;
  end: number;
  heading: number;
};
type Route = {
  segments: RouteSegment[];
  length: number;
  closed: boolean;
  ground: number;
  population: number;
  mode?: "walk" | "jog" | "bike" | "shop" | "commute";
};
type RouteSpec = {
  points: readonly (readonly [number, number])[];
  closed?: boolean;
  ground: number;
  population: number;
  mode?: "walk" | "jog" | "bike" | "shop" | "commute";
};
type CrosswalkSpec = {
  x: number;
  z: number;
  horizontal: boolean;
  span: number;
  invertPhase?: boolean;
};
type Resident = {
  route?: Route;
  crosswalk?: CrosswalkSpec;
  mcDoorSlot?: number;
  greetRole?: "host" | "guest";
  greetPartnerX?: number;
  greetPartnerZ?: number;
  selfieRole?: "holder" | "poser";
  x: number;
  z: number;
  heading: number;
  scale: number;
  speed: number;
  offset: number;
  lane: number;
  phase: number;
  activity:
    | "walk"
    | "jog"
    | "bike"
    | "talk"
    | "sit"
    | "volleyball"
    | "argue"
    | "shop"
    | "crosswalk"
    | "commute"
    | "mcdoor"
    | "greet"
    | "selfie";
  hasBag: boolean;
  hasHat: boolean;
  hasDog: boolean;
  hasCart: boolean;
  hasBriefcase?: boolean;
  hasCoffee?: boolean;
  hasPhone?: boolean;
  hasMcBag?: boolean;
  canUseUmbrella?: boolean;
  coatColor?: string;
  pantsColor?: string;
  hatColor?: string;
};

/**
 * 创建高拟真度的小镇居民百态：
 * - 摩天大楼早晚高峰上下班潮汐人流（提公文包、端现磨咖啡、看手机进出四翼旋转玻璃门与地铁口）
 * - 麦当劳旗舰店顾客与黄/蓝头盔外卖骑手推开弹簧玻璃双门进店点餐取袋、露天遮阳伞对坐就餐
 * - 人际深度社交：挥手打招呼 -> 走近握手寒暄、海滨情侣举手机自拍、亲子牵手同行
 * - 街头追尾事故车主争执、社区超市推车采购、斑马线红灯驻足绿灯通行、沙滩排球与遛狗悬链牵引绳
 */
export function buildCityLife({
  group,
  geometries,
  materials,
}: {
  group: THREE.Group;
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
}): { animate: (seconds: number, season?: SeasonId, precipitation?: number) => void } {
  let seed = 81927;
  const random = (): number => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);

  const parkRoutes: RouteSpec[] = centralParkWalks
    .filter((walk) => ["lakeside", "south", "east", "west", "north"].includes(walk.id))
    .map((walk) => {
      const curve = new THREE.CatmullRomCurve3(walk.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), walk.closed);
      return {
        points: curve.getSpacedPoints(72).map((point) => [point.x, point.z] as const),
        closed: walk.closed,
        ground: 0.39,
        population: walk.id === "lakeside" ? 22 : 4,
        mode: walk.id === "lakeside" ? "jog" : "walk",
      };
    });

  // 严格贴合人行道（距离道路中心线 6.6m），绝不踏入机动车沥青路面
  const streetSegments = [
    [-158.4, -151, -158.4, -124],
    [-154, -108.4, -129, -108.4],
    [-113.4, -61, -113.4, -34],
    [-81.6, -61, -81.6, -34],
    [81.6, -61, 81.6, -34],
    [113.4, -106, 113.4, -79],
    [132, -18.4, 156, -18.4],
    [171.6, 29, 171.6, 56],
    [-23.4, -196, -23.4, -169],
    [25, -153.4, 52, -153.4],
    [-81.6, 29, -81.6, 56],
    [81.6, 29, 81.6, 56],
  ] as const;

  const routeSpecs: RouteSpec[] = [
    ...parkRoutes,
    ...streetSegments.map(([x, z, endX, endZ]) => ({
      points: [[x, z], [endX, endZ]] as const,
      population: 2,
      ground: 0.5,
      mode: "walk" as const,
    })),
    // 社区超市（FRESH MART）门前推购物车采购动线（西城 x=-136..-104, z=87.8 与 东城 x=104..136, z=87.8）
    { points: [[-136, 87.6], [-104, 87.6]], population: 6, ground: 0.47, mode: "shop" },
    { points: [[104, 87.6], [136, 87.6]], population: 4, ground: 0.47, mode: "shop" },
    // 滨海木栈道与观海大道漫步人群
    { points: [[-205, 108.5], [-82, 108.5]], population: 12, ground: 0.56, mode: "walk" },
    { points: [[-68, 106.5], [-10, 106.5]], population: 10, ground: 0.32, mode: "walk" },
    { points: [[10, 106.5], [88, 106.5]], population: 10, ground: 0.32, mode: "walk" },
    { points: [[102, 106.5], [178, 106.5]], population: 8, ground: 0.32, mode: "jog" },
    // 滨海专用骑行绿道（z=103.6，与机动车道 z=95 完全隔离）
    { points: [[-192, 103.6], [172, 103.6]], population: 8, ground: 0.32, mode: "bike" },
    // 金色沙滩漫步线
    { points: [[-194, 125], [-106, 125]], population: 8, ground: 0.26, mode: "walk" },
    // ==================== 写字楼早晚高峰上下班潮汐通勤线 (进出四翼水晶旋转玻璃门与地铁出入口) ====================
    // 1. 东湾 60m 金融大厦 (quant: 142.5, 55.6) <-> 麦当劳旗舰店与公交站通勤流
    { points: [[142.5, 55.4], [142.5, 58.4], [158.4, 58.4]], population: 8, ground: 0.48, mode: "commute" },
    // 2. 东城 68m 双子塔总部 (affine: 97.5, -33.9) <-> 现代住宅区上下班流
    { points: [[97.5, -34.0], [97.5, -31.6], [113.4, -31.6], [113.4, -44]], population: 8, ground: 0.48, mode: "commute" },
    // 3. 东翼科技楼 (187.5, -36.8) <-> 人行道通勤流
    { points: [[187.5, -36.9], [187.5, -31.6], [171.6, -31.6], [171.6, -44]], population: 6, ground: 0.48, mode: "commute" },
    // 4. 西城地铁玻璃出入口 (-168, 84.5) <-> 西城写字楼群早晚高峰通勤人流
    { points: [[-168, 84.2], [-168, 88.2], [-145, 88.2]], population: 10, ground: 0.48, mode: "commute" },
    // 5. 北城学院研发楼 (82.5, -174.8 & -97.5, -129.8) 上下班通勤流
    { points: [[82.5, -174.8], [82.5, -166.6], [66.6, -166.6], [66.6, -180]], population: 6, ground: 0.48, mode: "commute" },
    { points: [[-97.5, -129.8], [-97.5, -121.6], [-81.6, -121.6], [-81.6, -135]], population: 6, ground: 0.48, mode: "commute" },
  ];

  const routes: Route[] = routeSpecs.map((spec) => {
    const points = spec.closed ? [...spec.points, spec.points[0]] : spec.points;
    const segments: RouteSegment[] = [];
    let total = 0;
    for (let index = 1; index < points.length; index++) {
      const [x, z] = points[index - 1];
      const dx = points[index][0] - x;
      const dz = points[index][1] - z;
      const length = Math.hypot(dx, dz);
      if (length < 0.00001) continue;
      total += length;
      segments.push({ x, z, dx: dx / length, dz: dz / length, length, end: total, heading: Math.atan2(dx, dz) });
    }
    if (!segments.length) throw new Error("行人路线必须包含两个不同的位置");
    return {
      segments,
      length: total,
      closed: Boolean(spec.closed),
      ground: spec.ground,
      population: spec.population,
      mode: spec.mode ?? "walk",
    };
  });

  const commuterSuits = ["#1f2d3d", "#2c3947", "#3d4852", "#8c7355", "#243442", "#4a5568"];
  const residents: Resident[] = [];
  let dogCounter = 0;
  for (const route of routes) {
    const pairs = Math.max(1, Math.floor(route.population / 2));
    for (let pair = 0; pair < pairs; pair++) {
      const isBike = route.mode === "bike";
      const isShop = route.mode === "shop";
      const isCommute = route.mode === "commute";
      const isJog = route.mode === "jog" && pair % 2 === 0;
      const baseSpeed = isBike
        ? 3.2 + random() * 0.9
        : isJog
          ? 1.55 + random() * 0.4
          : isCommute
            ? 1.12 + random() * 0.28
            : isShop
              ? 0.58 + random() * 0.18
              : 0.72 + random() * 0.3;
      const offset = route.length * (pair + 0.18) / pairs;
      for (const lane of [-0.42, 0.42]) {
        const canWalkDog = !isBike && !isJog && !isShop && !isCommute && lane > 0 && dogCounter < 8 && random() > 0.6;
        if (canWalkDog) dogCounter++;
        const childCompanion = !isBike && !isJog && !isShop && !isCommute && !canWalkDog && lane < 0 && pair % 5 === 3;
        residents.push({
          route,
          x: route.segments[0].x,
          z: route.segments[0].z,
          heading: route.segments[0].heading,
          scale: childCompanion ? 0.68 : 0.94 + random() * 0.12,
          speed: baseSpeed * (lane > 0 ? 1 : childCompanion ? 1 : 0.94),
          offset: offset + (lane > 0 ? 0 : childCompanion ? 0.15 : 2.5),
          lane: isBike ? lane * 1.1 : childCompanion ? -0.26 : lane,
          phase: random() * Math.PI * 2,
          activity: isBike ? "bike" : isShop ? "shop" : isJog ? "jog" : isCommute ? "commute" : "walk",
          hasBag: !isJog && !isShop && (isCommute ? pair % 2 === 0 : random() > 0.48),
          hasHat: !isCommute && random() > 0.62,
          hasDog: canWalkDog,
          hasCart: isShop,
          hasBriefcase: isCommute && lane > 0,
          hasCoffee: isCommute && lane < 0,
          hasPhone: isCommute && pair % 2 === 1,
          canUseUmbrella: !isBike && !isJog && !isShop && !canWalkDog && pair % 2 === 0,
          coatColor: isCommute ? commuterSuits[(pair + (lane > 0 ? 0 : 3)) % commuterSuits.length] : undefined,
          pantsColor: isCommute ? "#1e2630" : undefined,
        });
      }
    }
  }

  // ==================== 场景 0：麦当劳旗舰店推门进出顾客 + 黄/蓝制服外卖骑手 + 露天遮阳伞食客 ====================
  SHOP_ARRIVAL_OFFSETS.forEach((slotTime, slotIdx) => {
    const isRider = slotIdx === 1 || slotIdx === 3;
    residents.push({
      mcDoorSlot: slotTime,
      x: MCDONALDS_SITE.doorX + (slotIdx % 2 === 0 ? -0.34 : 0.34),
      z: MCDONALDS_SITE.doorZ,
      heading: 0,
      scale: 1.0,
      speed: 1.18,
      offset: slotIdx,
      lane: slotIdx % 2 === 0 ? -0.36 : 0.36,
      phase: slotIdx * 1.4,
      activity: "mcdoor",
      hasBag: !isRider && slotIdx === 0,
      hasHat: isRider,
      hasDog: false,
      hasCart: false,
      hasMcBag: true,
      hasCoffee: !isRider,
      coatColor: isRider ? (slotIdx === 1 ? "#f2b718" : "#1d84e6") : "#c95b42",
      pantsColor: "#232b35",
      hatColor: isRider ? (slotIdx === 1 ? "#f5c428" : "#1d84e6") : undefined,
    });
  });

  // 麦当劳户外遮阳伞餐桌面对面用餐聊天食客
  for (const [ux, uz] of [
    [MCDONALDS_SITE.x - 5.2, MCDONALDS_SITE.z + 7.2],
    [MCDONALDS_SITE.x + 4.4, MCDONALDS_SITE.z + 7.2],
    [MCDONALDS_SITE.x + 8.0, MCDONALDS_SITE.z + 7.2],
  ] as const) {
    for (const side of [-1, 1] as const) {
      residents.push({
        x: ux + side * 0.72,
        z: uz,
        heading: side < 0 ? Math.PI / 2 : -Math.PI / 2,
        scale: 0.98,
        speed: 0,
        offset: 0,
        lane: 0,
        phase: random() * 6,
        activity: "sit",
        hasBag: false,
        hasHat: false,
        hasDog: false,
        hasCart: false,
        hasCoffee: side > 0,
        hasMcBag: side < 0,
      });
    }
  }

  // ==================== 人际深度交流 A：街头偶遇挥手 -> 走近握手寒暄 ====================
  const handshakePairs = [
    { cx: 138.2, cz: 60.2 },   // 金融大厦旋转门广场同事会面握手
    { cx: 94.0, cz: -29.8 },   // 双子塔门前商务握手
    { cx: -162.5, cz: 86.8 },  // 西城地铁口老友重逢挥手握手
    { cx: 6.5, cz: 86.8 },     // 中央公园南门市民寒暄
  ];
  handshakePairs.forEach((spot, pIdx) => {
    residents.push(
      {
        x: spot.cx - 0.95,
        z: spot.cz,
        greetRole: "host",
        greetPartnerX: spot.cx + 0.95,
        greetPartnerZ: spot.cz,
        heading: Math.PI / 2,
        scale: 1.0,
        speed: 0,
        offset: pIdx * 3.1,
        lane: 0,
        phase: pIdx * 1.7,
        activity: "greet",
        hasBag: false,
        hasHat: false,
        hasDog: false,
        hasCart: false,
        hasBriefcase: pIdx < 2,
        coatColor: pIdx < 2 ? "#253649" : "#3d7a68",
        pantsColor: "#1f2730",
      },
      {
        x: spot.cx + 0.95,
        z: spot.cz,
        greetRole: "guest",
        greetPartnerX: spot.cx - 0.95,
        greetPartnerZ: spot.cz,
        heading: -Math.PI / 2,
        scale: 0.99,
        speed: 0,
        offset: pIdx * 3.1,
        lane: 0,
        phase: pIdx * 1.7 + 0.4,
        activity: "greet",
        hasBag: pIdx >= 2,
        hasHat: false,
        hasDog: false,
        hasCart: false,
        hasCoffee: pIdx === 1,
        coatColor: pIdx < 2 ? "#8c6f52" : "#c9664c",
        pantsColor: "#2b3540",
      },
    );
  });

  // ==================== 人际深度交流 B：海滨长廊情侣/好友举手机自拍合影 ====================
  for (const [sx, sz] of [[-18, 108.4], [62, 108.4], [158, 88.6]] as const) {
    residents.push(
      {
        x: sx - 0.34,
        z: sz,
        selfieRole: "holder",
        heading: 0.15,
        scale: 1.0,
        speed: 0,
        offset: 0,
        lane: 0,
        phase: random() * 5,
        activity: "selfie",
        hasBag: true,
        hasHat: false,
        hasDog: false,
        hasCart: false,
        hasPhone: true,
      },
      {
        x: sx + 0.34,
        z: sz,
        selfieRole: "poser",
        heading: -0.18,
        scale: 0.95,
        speed: 0,
        offset: 0,
        lane: 0,
        phase: random() * 5,
        activity: "selfie",
        hasBag: false,
        hasHat: true,
        hasDog: false,
        hasCart: false,
      },
    );
  }

  // ==================== 场景 1：斑马线等红绿灯与过街人群 ====================
  const crosswalks: CrosswalkSpec[] = [
    { x: -75, z: 88.2, horizontal: true, span: 6.4, invertPhase: false },
    { x: 75, z: 88.2, horizontal: true, span: 6.4, invertPhase: false },
    { x: -120, z: 88.2, horizontal: true, span: 6.4, invertPhase: true },
    { x: 120, z: 88.2, horizontal: true, span: 6.4, invertPhase: true },
    { x: -68.2, z: 95, horizontal: false, span: 6.4, invertPhase: true },
    { x: 68.2, z: 95, horizontal: false, span: 6.4, invertPhase: true },
  ];
  for (const cw of crosswalks) {
    for (let idx = 0; idx < 4; idx++) {
      const side = idx < 2 ? -1 : 1;
      const laneOffset = (idx % 2 === 0 ? -0.55 : 0.55);
      residents.push({
        crosswalk: cw,
        x: cw.x,
        z: cw.z,
        heading: cw.horizontal ? (side < 0 ? Math.PI / 2 : -Math.PI / 2) : (side < 0 ? 0 : Math.PI),
        scale: 0.95 + random() * 0.1,
        speed: 1.15 + (idx % 2) * 0.18,
        offset: side,
        lane: laneOffset,
        phase: random() * Math.PI * 2,
        activity: "crosswalk",
        hasBag: idx % 2 === 0,
        hasHat: idx === 1,
        hasDog: false,
        hasCart: false,
      });
    }
  }

  // ==================== 场景 2：街头追尾撞车现场（与本次访问抽中的路口同步） ====================
  const crashSitePeople = getSessionTrafficCrashSite().people;
  for (const person of crashSitePeople) {
    residents.push({
      x: person.x,
      z: person.z,
      heading: person.heading,
      scale: 1.02,
      speed: 0,
      offset: 0,
      lane: 0,
      phase: random() * 6,
      activity: person.activity,
      hasBag: false,
      hasHat: person.coat === "#1e3f66",
      hasDog: false,
      hasCart: false,
      coatColor: person.coat,
      pantsColor: person.pants,
    });
  }

  // ==================== 场景 3：街头情侣/商贩争吵与市民辩论场景 ====================
  const argumentPairs = [
    // 鲜活超市门口讨价还价/争执
    { x1: -115.8, z1: 86.2, x2: -114.6, z2: 86.2 },
    // 东城写字楼广场激烈讨论
    { x1: 91.4, z1: 78.5, x2: 92.6, z2: 78.5 },
    // 滨海步道争执
    { x1: -34.6, z1: 106.8, x2: -33.4, z2: 106.8 },
  ];
  for (const pair of argumentPairs) {
    residents.push(
      {
        x: pair.x1, z: pair.z1, heading: Math.PI / 2, scale: 1.0, speed: 0, offset: 0, lane: 0,
        phase: random() * 6, activity: "argue", hasBag: true, hasHat: false, hasDog: false, hasCart: false,
      },
      {
        x: pair.x2, z: pair.z2, heading: -Math.PI / 2, scale: 0.98, speed: 0, offset: 0, lane: 0,
        phase: random() * 6 + 1.5, activity: "argue", hasBag: false, hasHat: true, hasDog: false, hasCart: false,
      },
    );
  }

  // 公园、写字楼广场与街角交谈人群
  const socialSpots = [
    ...centralParkGatherings,
    { x: -45, z: 78 },
    { x: 45, z: 78 },
    { x: -95, z: 110.5 },
    { x: 95, z: 110.5 },
  ];
  for (const { x: centerX, z: centerZ } of socialSpots) {
    for (let index = 0; index < 3; index++) {
      const angle = index * Math.PI * 2 / 3 + 0.25;
      const x = centerX + Math.cos(angle) * 0.95;
      const z = centerZ + Math.sin(angle) * 0.95;
      residents.push({
        x,
        z,
        heading: Math.atan2(centerX - x, centerZ - z),
        scale: 0.94 + random() * 0.11,
        speed: 0,
        offset: 0,
        lane: 0,
        phase: random() * 6,
        activity: "talk",
        hasBag: index === 0,
        hasHat: index === 2,
        hasDog: false,
        hasCart: false,
      });
    }
  }

  // 沙滩排球场对打人群 (-172, 119)
  const volleyPlayers = [
    { x: -175.5, z: 116.2, heading: 0.15 },
    { x: -168.5, z: 116.4, heading: -0.15 },
    { x: -175.2, z: 121.8, heading: Math.PI - 0.15 },
    { x: -168.8, z: 121.6, heading: Math.PI + 0.15 },
  ];
  for (const player of volleyPlayers) {
    residents.push({
      x: player.x,
      z: player.z,
      heading: player.heading,
      scale: 0.98 + random() * 0.08,
      speed: 1.2,
      offset: 0,
      lane: 0,
      phase: random() * Math.PI * 2,
      activity: "volleyball",
      hasBag: false,
      hasHat: true,
      hasDog: false,
      hasCart: false,
    });
  }

  // 公园长椅与海滨长椅休憩人群
  const benchSeats = [
    ...centralParkBenches,
    { x: -161, z: 108, angle: 0 },
    { x: -89, z: 108, angle: 0 },
    { x: 31, z: 108, angle: 0 },
    { x: 103, z: 108, angle: 0 },
  ];
  for (const { x, z, angle } of benchSeats) {
    residents.push({
      x,
      z,
      heading: angle,
      scale: 0.98,
      speed: 0,
      offset: 0,
      lane: 0,
      phase: random() * 6,
      activity: "sit",
      hasBag: false,
      hasHat: random() > 0.5,
      hasDog: false,
      hasCart: false,
    });
  }

  const headGeo = createHead();
  const neckGeo = createNeck();
  const torsoGeo = createTorso();
  const pelvisGeo = createPelvis();
  const backpackGeo = createBackpack();
  const upperArmGeo = createUpperArm();
  const forearmGeo = createForearm();
  for (const geometry of [upperArmGeo, forearmGeo]) {
    // 上衣共用 vertexColors 材质；袖子也必须提供白色属性，否则 WebGL 默认零值会把双臂染黑。
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute("position").count * 3).fill(1), 3));
  }
  const handGeo = createHand();
  const thighGeo = createThigh();
  const calfGeo = createCalf();
  const shoeGeo = createShoe();
  const hairGeo = createHair();
  const hairLongGeo = createHairLong();
  const hairTailGeo = createHairPonytail();
  const capGeo = createCap();
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 12, 10);
  const capsuleGeo = new THREE.CapsuleGeometry(0.45, 0.55, 6, 12);
  const cupGeo = new THREE.CylinderGeometry(0.42, 0.31, 1, 12);
  const umbrellaCanopyGeo = new THREE.ConeGeometry(0.56, 0.22, 8, 1, true);
  const wheelGeo = new THREE.TorusGeometry(0.32, 0.045, 6, 16);
  for (const geometry of [
    headGeo, neckGeo, torsoGeo, pelvisGeo, backpackGeo, upperArmGeo, forearmGeo,
    handGeo, thighGeo, calfGeo, shoeGeo, hairGeo, hairLongGeo, hairTailGeo, capGeo, cube, sphere, capsuleGeo, cupGeo, umbrellaCanopyGeo, wheelGeo,
  ]) {
    geometries.add(geometry);
  }

  const batch = (name: string, geometry: THREE.BufferGeometry, count: number, color: string, roughness = 0.85, metalness = 0.05, shared?: THREE.Material): THREE.InstancedMesh => {
    const material = shared ?? new THREE.MeshStandardMaterial({ color, roughness, metalness });
    if (!shared) materials.add(material);
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };

  const count = residents.length;
  const bikeCount = residents.filter((r) => r.activity === "bike").length;
  const dogCount = residents.filter((r) => r.hasDog).length;
  const cartCount = residents.filter((r) => r.hasCart).length;
  const briefcaseCount = residents.filter((r) => r.hasBriefcase).length;
  const coffeeCount = residents.filter((r) => r.hasCoffee).length;
  const phoneCount = residents.filter((r) => r.hasPhone).length;
  const mcBagCount = residents.filter((r) => r.hasMcBag).length;
  const umbrellaCount = residents.filter((r) => r.canUseUmbrella).length;

  const skinMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.58 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.55, vertexColors: true });
  materials.add(skinMaterial);
  materials.add(headMaterial);
  const heads = batch("Residents · heads", headGeo, count, "#ffffff", 0.55, 0.02, headMaterial);
  const necks = batch("Residents · necks", neckGeo, count, "#ffffff", 0.58, 0.02, skinMaterial);
  const hands = batch("Residents · hands", handGeo, count * 2, "#ffffff", 0.58, 0.02, skinMaterial);
  const coatMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.96, vertexColors: true });
  materials.add(coatMaterial);
  const torsos = batch("Residents · torsos", torsoGeo, count, "#ffffff", 0.92, 0.02, coatMaterial);
  const upperArms = batch("Residents · upper arms", upperArmGeo, count * 2, "#ffffff", 0.92, 0.02, coatMaterial);
  const forearms = batch("Residents · forearms", forearmGeo, count * 2, "#ffffff", 0.92, 0.02, coatMaterial);
  const pantMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.9 });
  materials.add(pantMaterial);
  const pelvis = batch("Residents · pelvis", pelvisGeo, count, "#ffffff", 0.9, 0.02, pantMaterial);
  const thighs = batch("Residents · thighs", thighGeo, count * 2, "#ffffff", 0.9, 0.02, pantMaterial);
  const calves = batch("Residents · calves", calfGeo, count * 2, "#ffffff", 0.9, 0.02, pantMaterial);
  const shoeMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.82, vertexColors: true });
  materials.add(shoeMaterial);
  const shoes = batch("Residents · shoes", shoeGeo, count * 2, "#ffffff", 0.82, 0, shoeMaterial);
  const hair = batch("Residents · hair", hairGeo, count, "#ffffff", 0.72);
  const hairLong = batch("Residents · long hair", hairLongGeo, count, "#ffffff", 0.74, 0.02, hair.material as THREE.Material);
  const hairTail = batch("Residents · ponytails", hairTailGeo, count, "#ffffff", 0.74, 0.02, hair.material as THREE.Material);
  const hats = batch("Residents · caps", capGeo, count, "#ffffff", 0.7);
  const bags = batch("Residents · bags and packs", backpackGeo, count, "#ffffff", 0.9);
  const bikeFrames = batch("Residents · bicycles", cube, Math.max(1, bikeCount * 2), "#ffffff", 0.35, 0.55);
  const bikeWheels = batch("Residents · bike wheels", wheelGeo, Math.max(1, bikeCount * 2), "#242a2e", 0.6, 0.25);
  // 圆润胶囊肌肉轮廓宠物犬 + 悬链线牵引绳（彻底告别方块狗）
  const dogs = batch("Residents · pet dogs", capsuleGeo, Math.max(1, dogCount * 6), "#ffffff", 0.82);
  const dogLeashes = batch("Residents · dog leashes", cube, Math.max(1, dogCount * 3), "#4b382a", 0.75);
  const shoppingCarts = batch("Residents · shopping carts", cube, Math.max(1, cartCount * 3), "#d4dce2", 0.3, 0.68);
  const cartGoods = batch("Residents · cart groceries", cube, Math.max(1, cartCount * 2), "#ffffff", 0.65);
  const briefcases = batch("Residents · briefcases", cube, Math.max(1, briefcaseCount), "#4e3424", 0.48, 0.16);
  const coffeeCups = batch("Residents · coffee cups", cupGeo, Math.max(1, coffeeCount), "#f2ece1", 0.68, 0.04);
  const phoneMat = new THREE.MeshStandardMaterial({ color: "#1d242b", emissive: "#9ed2ff", emissiveIntensity: 0.65, roughness: 0.2, metalness: 0.4 });
  materials.add(phoneMat);
  const phones = batch("Residents · smartphones", cube, Math.max(1, phoneCount), "#ffffff", 0.2, 0.4, phoneMat);
  const mcBags = batch("Residents · mcdonalds takeout bags", cube, Math.max(1, mcBagCount), "#d6a76c", 0.84, 0.02);
  const umbrellaMat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.64, side: THREE.DoubleSide });
  materials.add(umbrellaMat);
  const umbrellas = batch("Residents · umbrellas", umbrellaCanopyGeo, Math.max(1, umbrellaCount), "#ffffff", 0.64, 0.04, umbrellaMat);
  const volleyBallMesh = batch("Beach · volleyball", sphere, 1, "#f7e39c", 0.5);

  const meshes = [
    heads, necks, hands, torsos, pelvis, upperArms, forearms, thighs, calves, shoes,
    hair, hairLong, hairTail, hats, bags, bikeFrames, bikeWheels, dogs, dogLeashes, shoppingCarts, cartGoods,
    briefcases, coffeeCups, phones, mcBags, umbrellas, volleyBallMesh,
  ];
  const color = new THREE.Color();
  // 写实都市服装色：低饱和的深色外套、衬衫与牛仔，偶尔一抹暖色，避免卡通高饱和配色。
  const coats = [
    "#2f3a4c", "#26282c", "#4a4d52", "#d6d3ca", "#8e9fb2",
    "#a8946f", "#55603f", "#6b3238", "#3e5674", "#93463a",
    "#8b8d8e", "#b2883e", "#1f2f3f", "#716355", "#c5c0b4",
  ];
  const skins = ["#d9a888", "#bb8a68", "#e8c3a4", "#8f634c", "#c99a78", "#a87656"];
  const pants = ["#2e3c55", "#24272b", "#3c4a62", "#8f7f62", "#5f6266", "#4a3d32", "#33363a"];
  const hairs = ["#231d19", "#4d3527", "#8f7457", "#17191a", "#6c3b28", "#b7ad9c"];
  const bagColors = ["#7c5338", "#2f3942", "#9e6b43", "#4c6459", "#b89f7d"];
  const bikeColors = ["#e0533c", "#3b82a6", "#e5b842", "#479c78", "#d8dde0"];
  const dogColors = ["#c89662", "#f0e6d2", "#5c4636", "#a87246"];
  const groceryColors = ["#e8523f", "#f0be3c", "#52a858", "#4888c8"];
  const umbrellaPalette = ["#2b547e", "#b8433e", "#3d6e5c", "#d8c9b0", "#4b5563"];

  let bikeIdx = 0;
  let dogIdx = 0;
  let cartIdx = 0;
  let umbIdx = 0;
  residents.forEach((res, index) => {
    color.set(skins[Math.floor(random() * skins.length)]);
    heads.setColorAt(index, color);
    necks.setColorAt(index, color);
    hands.setColorAt(index * 2, color);
    hands.setColorAt(index * 2 + 1, color);
    color.set(res.coatColor ?? coats[Math.floor(random() * coats.length)]);
    torsos.setColorAt(index, color);
    upperArms.setColorAt(index * 2, color);
    upperArms.setColorAt(index * 2 + 1, color);
    forearms.setColorAt(index * 2, color);
    forearms.setColorAt(index * 2 + 1, color);
    color.set(res.pantsColor ?? pants[Math.floor(random() * pants.length)]);
    pelvis.setColorAt(index, color);
    thighs.setColorAt(index * 2, color);
    thighs.setColorAt(index * 2 + 1, color);
    calves.setColorAt(index * 2, color);
    calves.setColorAt(index * 2 + 1, color);
    hair.setColorAt(index, color.set(hairs[Math.floor(random() * hairs.length)]));
    hairLong.setColorAt(index, color);
    hairTail.setColorAt(index, color);
    hats.setColorAt(index, color.set(res.hatColor ?? (index % 2 ? "#243044" : "#1c1a17")));
    bags.setColorAt(index, color.set(bagColors[Math.floor(random() * bagColors.length)]));
    if (res.activity === "bike") {
      color.set(bikeColors[bikeIdx % bikeColors.length]);
      bikeFrames.setColorAt(bikeIdx * 2, color);
      bikeFrames.setColorAt(bikeIdx * 2 + 1, color);
      bikeIdx++;
    }
    if (res.hasDog) {
      color.set(dogColors[dogIdx % dogColors.length]);
      for (let d = 0; d < 6; d++) dogs.setColorAt(dogIdx * 6 + d, color);
      dogIdx++;
    }
    if (res.hasCart) {
      cartGoods.setColorAt(cartIdx * 2, color.set(groceryColors[cartIdx % groceryColors.length]));
      cartGoods.setColorAt(cartIdx * 2 + 1, color.set(groceryColors[(cartIdx + 1) % groceryColors.length]));
      cartIdx++;
    }
    if (res.canUseUmbrella) {
      umbrellas.setColorAt(umbIdx, color.set(umbrellaPalette[umbIdx % umbrellaPalette.length]));
      umbIdx++;
    }
  });

  const transform = new THREE.Object3D();
  transform.rotation.order = "YXZ";
  let originX = 0;
  let originY = 0;
  let originZ = 0;
  let heading = 0;
  let cosine = 1;
  let sine = 0;
  let scale = 1;

  function place(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    pitch = 0,
    yawOffset = 0,
  ): void {
    transform.position.set(
      originX + (cosine * x + sine * z) * scale,
      originY + y * scale,
      originZ + (-sine * x + cosine * z) * scale,
    );
    transform.rotation.set(pitch, heading + yawOffset, 0);
    transform.scale.set(width * scale, height * scale, depth * scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }

  function limb(
    mesh: THREE.InstancedMesh,
    index: number,
    x: number,
    y: number,
    z: number,
    length: number,
    thickness: number,
    angle: number,
  ): void {
    place(mesh, index, x, y - Math.cos(angle) * length / 2, z - Math.sin(angle) * length / 2, thickness, length, thickness, angle);
  }

  const walkingLeg: WalkingLeg = { thigh: 0, calf: 0, ankleY: 0, ankleZ: 0, footPitch: 0, planted: true };

  function animate(seconds: number, season: SeasonId = "spring", precipitation = 0): void {
    let activeBikeIndex = 0;
    let activeDogIndex = 0;
    let activeCartIndex = 0;
    let activeBriefcaseIndex = 0;
    let activeCoffeeIndex = 0;
    let activePhoneIndex = 0;
    let activeMcBagIndex = 0;
    let activeUmbrellaIndex = 0;
    const umbrellaWeather = precipitation > 0.15 || season === "winter";
    const clock = sampleCityClock(seconds);
    let employeesAtWork = 0;

    residents.forEach((resident, index) => {
      let walking =
        resident.activity === "walk" ||
        resident.activity === "shop" ||
        resident.activity === "commute";
      const jogging = resident.activity === "jog";
      const biking = resident.activity === "bike";
      const seated = resident.activity === "sit";
      const volley = resident.activity === "volleyball";
      const arguing = resident.activity === "argue";
      const shopping = resident.activity === "shop";
      const greeting = resident.activity === "greet";
      const selfie = resident.activity === "selfie";
      let moveSpeed = resident.speed;
      let pushingDoor = false;
      let greetStage: "wave" | "approach" | "shake" | "chat" = "chat";
      let carryBagOut = true;

      const route = resident.route;
      originX = resident.x;
      originZ = resident.z;
      heading = resident.heading;
      originY = seated ? 0 : volley ? 0.26 : route?.ground ?? 0.35;
      scale = resident.scale;

      // The same trajectory supplies customer positions and door passage instants.
      if (resident.activity === "mcdoor" && resident.mcDoorSlot !== undefined) {
        const visit = sampleShopVisit(seconds, resident.mcDoorSlot);
        originX = MCDONALDS_SITE.doorX + visit.x;
        originZ = MCDONALDS_SITE.doorZ + visit.z;
        originY = 0.55;
        heading = visit.heading;
        walking = visit.walking;
        moveSpeed = visit.speed;
        pushingDoor = visit.pushingDoor;
        carryBagOut = visit.hasOrder;
      } else if (greeting && resident.greetPartnerX !== undefined) {
        // 人际互动：远距挥手打招呼 -> 走近会面 -> 伸右手上下握手寒暄 -> 交谈告别
        const gCycle = THREE.MathUtils.euclideanModulo(seconds + resident.offset, 14);
        const dirSign = resident.greetRole === "host" ? 1 : -1;
        originY = 0.48;
        moveSpeed = 0.9 / 2.2;
        heading = resident.greetRole === "host" ? Math.PI / 2 : -Math.PI / 2;
        if (gCycle < 2.8) {
          greetStage = "wave";
          walking = false;
          originX = resident.x - dirSign * 0.48;
        } else if (gCycle < 5.0) {
          greetStage = "approach";
          walking = true;
          const k = (gCycle - 2.8) / 2.2;
          originX = THREE.MathUtils.lerp(resident.x - dirSign * 0.48, resident.x + dirSign * 0.42, k);
        } else if (gCycle < 8.4) {
          greetStage = "shake";
          walking = false;
          originX = resident.x + dirSign * 0.42;
        } else if (gCycle < 11.8) {
          greetStage = "chat";
          walking = false;
          originX = resident.x + dirSign * 0.36;
        } else {
          greetStage = "approach";
          walking = true;
          const k = (gCycle - 11.8) / 2.2;
          originX = THREE.MathUtils.lerp(resident.x + dirSign * 0.36, resident.x - dirSign * 0.48, k);
        }
      } else if (resident.activity === "crosswalk" && resident.crosswalk) {
        const cw = resident.crosswalk;
        const cycle = THREE.MathUtils.euclideanModulo(seconds + (cw.invertPhase ? 10 : 0), 20);
        const greenLight = cycle >= 10;
        const lap = Math.floor((seconds + (cw.invertPhase ? 10 : 0)) / 20);
        const startSide = (resident.offset < 0 ? -1 : 1) * (lap % 2 === 0 ? 1 : -1);
        if (!greenLight) {
          walking = false;
          const waitDist = cw.span + 0.65;
          if (cw.horizontal) {
            originX = cw.x + startSide * waitDist;
            originZ = cw.z + resident.lane;
            heading = startSide < 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            originX = cw.x + resident.lane;
            originZ = cw.z + startSide * waitDist;
            heading = startSide < 0 ? 0 : Math.PI;
          }
          originY = 0.5;
        } else {
          const crossProgress = Math.min(1, (cycle - 10) / 7.5);
          walking = crossProgress < 1;
          moveSpeed = (cw.span + 0.5) * 2 / 7.5;
          const posAlong = THREE.MathUtils.lerp(startSide * (cw.span + 0.5), -startSide * (cw.span + 0.5), crossProgress);
          if (cw.horizontal) {
            originX = cw.x + posAlong;
            originZ = cw.z + resident.lane;
            heading = startSide < 0 ? Math.PI / 2 : -Math.PI / 2;
          } else {
            originX = cw.x + resident.lane;
            originZ = cw.z + posAlong;
            heading = startSide < 0 ? 0 : Math.PI;
          }
          originY = crossProgress > 0.12 && crossProgress < 0.88 ? 0.43 : 0.5;
        }
      } else if (route) {
        const travel = THREE.MathUtils.euclideanModulo(
          seconds * resident.speed + resident.offset,
          route.length * (route.closed ? 1 : 2),
        );
        let returning = !route.closed && travel > route.length;
        let distance = returning ? route.length * 2 - travel : travel;
        if (resident.activity === "commute") {
          const elapsed = THREE.MathUtils.euclideanModulo(seconds, CITY_DAY_SECONDS);
          const stagger = resident.offset / route.length * 8 + (resident.lane > 0 ? 0 : 3);
          const trip = route.length / resident.speed;
          const evening = CITY_DAY_SECONDS * 10 / 24 + stagger;
          if (elapsed < stagger) {
            distance = route.length;
            returning = true;
            walking = false;
          } else if (elapsed < stagger + trip) {
            distance = route.length - (elapsed - stagger) * resident.speed;
            returning = true;
          } else if (elapsed < evening) {
            distance = 0;
            walking = false;
            employeesAtWork++;
            scale = 0.001;
          } else if (elapsed < evening + trip) {
            distance = (elapsed - evening) * resident.speed;
            returning = false;
          } else {
            distance = route.length;
            walking = false;
            scale = 0.001;
          }
        }
        const segment = route.segments.find((part) => distance <= part.end) ?? route.segments[route.segments.length - 1];
        const along = distance - (segment.end - segment.length);
        originX = segment.x + segment.dx * along + segment.dz * resident.lane;
        originZ = segment.z + segment.dz * along - segment.dx * resident.lane;
        heading = segment.heading + (returning ? Math.PI : 0);
      } else if (arguing) {
        const lunge = Math.sin(seconds * 3.8 + resident.phase) * 0.14;
        originX += Math.sin(heading) * lunge;
        originZ += Math.cos(heading) * lunge;
      }

      const moving = walking || jogging || biking;
      const cadence = biking ? 3.8 : jogging ? 8.4 : 4.7 + moveSpeed * 2.3;
      const phase = seconds * cadence + resident.phase;
      const stride = biking
        ? Math.sin(phase) * 0.52
        : jogging
          ? Math.sin(phase) * 0.68
          : walking
            ? Math.sin(phase) * 0.45
            : arguing
              ? Math.sin(seconds * 4.5 + resident.phase) * 0.18
              : volley
                ? Math.sin(seconds * 3.6 + resident.phase) * 0.25
                : 0;

      cosine = Math.cos(heading);
      sine = Math.sin(heading);

      const jump = volley
        ? Math.max(0, Math.sin(seconds * 3.2 + resident.phase)) * 0.38
        : arguing
          ? Math.abs(Math.sin(seconds * 5.2 + resident.phase)) * 0.04
          : 0;
      const bob = jogging
        ? Math.abs(Math.cos(phase)) * 0.065
        : walking
          ? Math.abs(Math.cos(phase)) * 0.015
          : jump;
      const hipShift = seated ? -0.05 : biking ? 0.12 : bob;
      const torsoPitch = biking
        ? 0.26
        : jogging
          ? 0.14
          : greeting && greetStage === "shake"
            ? 0.08 + Math.sin(seconds * 4.5) * 0.03
            : arguing
              ? 0.16 + Math.sin(seconds * 4.2 + resident.phase) * 0.12
              : 0;
      const headYaw = arguing
        ? Math.sin(seconds * 6.5 + resident.phase) * 0.36
        : resident.activity === "crosswalk" && !walking
          ? Math.sin(seconds * 1.8 + resident.phase) * 0.45
          : resident.activity === "talk" || (greeting && greetStage === "chat")
            ? Math.sin(seconds * 1.5 + resident.phase) * 0.28
            : selfie
              ? (resident.selfieRole === "holder" ? 0.12 : -0.18) + Math.sin(seconds * 1.2) * 0.08
              : moving
                ? Math.sin(seconds * 0.9 + resident.phase) * 0.08
                : 0;

      const build = 0.92 + (index % 7) * 0.022;
      // 成年人头高约为身高的 1/7.5：缩小头部并让颈部露出，避免大头娃娃式比例。
      const headY = 1.2 + Math.cos(torsoPitch) * 0.52 + hipShift;
      const headZ = Math.sin(torsoPitch) * 0.52 + 0.015;
      place(torsos, index, 0, 1.2 + hipShift, 0, 0.45 * build, 0.6, 0.27, torsoPitch);
      place(pelvis, index, 0, 0.94 + hipShift, 0, 0.43 * build, 0.25, 0.32, torsoPitch * 0.25);
      place(necks, index, 0, 1.2 + Math.cos(torsoPitch) * 0.37 + hipShift, Math.sin(torsoPitch) * 0.37, 0.125, 0.15, 0.13, torsoPitch * 0.6);
      place(heads, index, 0, headY, headZ, 0.19, 0.2, 0.2, 0, headYaw);
      // 发型按居民序号确定：短发、及肩长发、马尾三类轮流出现。
      const hairStyle = resident.hasHat ? 0 : index % 5 === 1 || index % 7 === 3 ? 1 : index % 5 === 3 ? 2 : 0;
      const hairMesh = hairStyle === 1 ? hairLong : hairStyle === 2 ? hairTail : hair;
      for (const mesh of [hair, hairLong, hairTail]) if (mesh !== hairMesh || resident.hasHat) place(mesh, index, 0, -12, 0, 0.001, 0.001, 0.001);
      if (resident.hasHat) {
        place(hats, index, 0, headY + 0.075, headZ, 0.205, 0.11, 0.215, 0, headYaw);
      } else {
        place(hats, index, 0, -12, 0, 0.001, 0.001, 0.001);
        place(hairMesh, index, 0, headY + 0.004, headZ, 0.2, 0.205, 0.207, 0, headYaw);
      }

      if (resident.hasBag && !seated) {
        place(bags, index, 0, 1.27 + hipShift, -0.2, 0.34, 0.43, 0.25, torsoPitch);
      } else {
        place(bags, index, 0, -10, 0, 0.001, 0.001, 0.001);
      }

      const holdingUmbrella = Boolean(resident.canUseUmbrella && umbrellaWeather && !seated);
      let rightWristX = 0.24;
      let rightWristY = 0.85;
      let rightWristZ = 0.12;
      let leftWristX = -0.24;
      let leftWristY = 0.85;
      let leftWristZ = 0.12;

      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        let legAngle = seated
          ? -Math.PI / 2
          : biking
            ? -0.45 + sign * stride * 0.65
            : sign * stride;
        let kneeAngle = seated
          ? 0
          : biking
            ? legAngle + 0.72 + Math.cos(phase) * sign * 0.32
            : legAngle + Math.max(0, Math.sin(phase) * sign) * (jogging ? 0.85 : 0.58);
        const hipY = (seated ? 0.94 : 0.89) + hipShift;
        const grounded = !seated && !biking && !jogging && !volley && !arguing;
        if (grounded) {
          sampleWalkingLeg(walking ? phase + side * Math.PI : 0, walking ? moveSpeed / scale : 0, hipY, cadence, walkingLeg);
          legAngle = walkingLeg.thigh;
          kneeAngle = walkingLeg.calf;
        }
        const kneeY = hipY - Math.cos(legAngle) * LEG_LENGTH.thigh;
        const kneeZ = -Math.sin(legAngle) * LEG_LENGTH.thigh;
        const lowerLegLength = seated ? 0.38 : LEG_LENGTH.calf;
        const ankleY = kneeY - Math.cos(kneeAngle) * lowerLegLength;
        const ankleZ = kneeZ - Math.sin(kneeAngle) * lowerLegLength;
        limb(thighs, index * 2 + side, sign * 0.092 * build, hipY, 0, LEG_LENGTH.thigh, 0.215 * build, legAngle);
        limb(calves, index * 2 + side, sign * 0.092 * build, kneeY, kneeZ, lowerLegLength, 0.2 * build, kneeAngle);
        place(shoes, index * 2 + side, sign * 0.092 * build, ankleY - 0.025, ankleZ + 0.055, 0.15, 0.14, 0.3, grounded ? walkingLeg.footPitch : kneeAngle * 0.2);

        const talking = (resident.activity === "talk" || (greeting && greetStage === "chat")) && side === 1;
        let armAngle = seated
          ? -0.45 + (side === 1 ? Math.sin(seconds * 1.9 + resident.phase) * 0.18 : 0)
          : shopping
            ? -0.78
            : pushingDoor && side === 1
              ? -1.28
              : greeting && side === 1 && greetStage === "wave"
                ? -2.35 + Math.sin(seconds * 8.5 + resident.phase) * 0.35
                : greeting && side === 1 && greetStage === "shake"
                  ? -0.82 + Math.sin(seconds * 7.2) * 0.14
                  : selfie && side === 1 && resident.selfieRole === "holder"
                    ? -1.48
                    : selfie && side === 0 && resident.selfieRole === "poser"
                      ? -2.1 + Math.sin(seconds * 3.4) * 0.16
                      : holdingUmbrella && side === 0
                        ? -0.65
                        : resident.hasCoffee && side === 0
                          ? -0.58 + Math.max(0, Math.sin(seconds * 0.9 + resident.phase)) * -0.45
                          : resident.hasPhone && side === 0 && !biking
                            ? -0.55
                            : arguing
                              ? -1.05 + Math.sin(seconds * 7.4 + resident.phase + side * 2.1) * 0.65
                              : biking
                                ? -0.68
                                : volley
                                  ? -1.85 - Math.sin(seconds * 3.2 + resident.phase) * 0.55
                                  : talking
                                    ? -0.45 + Math.sin(seconds * 1.6 + resident.phase) * 0.22
                                    : jogging
                                      ? -0.35 - sign * stride * 0.85
                                      : -sign * stride * 0.72 * (resident.hasBriefcase && side === 1 ? 0.32 : 1);

        let forearmAngle = seated
          ? -0.55 + (side === 1 ? Math.sin(seconds * 2.1 + resident.phase) * 0.22 : 0)
          : shopping
            ? -0.62
            : pushingDoor && side === 1
              ? -1.15
              : greeting && side === 1 && greetStage === "wave"
                ? -2.55 + Math.sin(seconds * 8.5 + resident.phase) * 0.45
                : greeting && side === 1 && greetStage === "shake"
                  ? -1.28 + Math.sin(seconds * 7.2) * 0.22
                  : selfie && side === 1 && resident.selfieRole === "holder"
                    ? -1.62
                    : selfie && side === 0 && resident.selfieRole === "poser"
                      ? -2.4
                      : holdingUmbrella && side === 0
                        ? -1.55
                        : resident.hasCoffee && side === 0
                          ? armAngle - 0.95
                          : resident.hasPhone && side === 0 && !biking
                            ? -1.25
                            : arguing
                              ? armAngle - 0.55 + Math.cos(seconds * 8.2 + side) * 0.35
                              : biking
                                ? -0.52
                                : volley
                                  ? armAngle - 0.25
                                  : talking
                                    ? armAngle - 0.92
                                    : jogging
                                      ? armAngle - 0.85
                                      : armAngle - 0.2;

        const shoulderY = 1.2 + Math.cos(torsoPitch) * 0.24 + hipShift;
        const shoulderZ = Math.sin(torsoPitch) * 0.24;
        const upperLen = 0.29;
        const lowerLen = 0.255;
        const armX = sign * 0.218 * build;
        const elbowY = shoulderY - Math.cos(armAngle) * upperLen;
        const elbowZ = shoulderZ - Math.sin(armAngle) * upperLen;
        limb(upperArms, index * 2 + side, armX, shoulderY, shoulderZ, upperLen, 0.145 * build, armAngle);
        limb(forearms, index * 2 + side, armX, elbowY, elbowZ, lowerLen, 0.125 * build, forearmAngle);
        const wristY = elbowY - Math.cos(forearmAngle) * lowerLen;
        const wristZ = elbowZ - Math.sin(forearmAngle) * lowerLen;
        const handLen = 0.14;
        place(
          hands,
          index * 2 + side,
          armX,
          wristY - Math.cos(forearmAngle) * handLen * 0.45,
          wristZ - Math.sin(forearmAngle) * handLen * 0.45,
          0.1,
          handLen,
          0.11,
          forearmAngle,
        );
        if (side === 1) {
          rightWristX = armX;
          rightWristY = wristY;
          rightWristZ = wristZ;
        } else {
          leftWristX = armX;
          leftWristY = wristY;
          leftWristZ = wristZ;
        }
      }

      if (resident.hasBriefcase) {
        place(briefcases, activeBriefcaseIndex, rightWristX + 0.04, rightWristY - 0.18, rightWristZ, 0.09, 0.3, 0.4);
        activeBriefcaseIndex++;
      }
      if (resident.hasCoffee) {
        place(coffeeCups, activeCoffeeIndex, leftWristX, leftWristY - 0.02, leftWristZ - 0.06, 0.11, 0.14, 0.11);
        activeCoffeeIndex++;
      }
      if (resident.hasPhone) {
        const px = resident.selfieRole === "holder" ? rightWristX : leftWristX;
        const py = resident.selfieRole === "holder" ? rightWristY + 0.04 : leftWristY + 0.02;
        const pz = resident.selfieRole === "holder" ? rightWristZ - 0.08 : leftWristZ - 0.08;
        place(phones, activePhoneIndex, px, py, pz, 0.08, 0.15, 0.018, -0.45);
        activePhoneIndex++;
      }
      if (resident.hasMcBag) {
        if (carryBagOut || seated) {
          place(mcBags, activeMcBagIndex, seated ? 0.34 : rightWristX + 0.04, seated ? 1.05 : rightWristY - 0.16, seated ? 0 : rightWristZ, 0.18, 0.26, 0.22);
        } else {
          place(mcBags, activeMcBagIndex, 0, -12, 0, 0.001, 0.001, 0.001);
        }
        activeMcBagIndex++;
      }
      if (resident.canUseUmbrella) {
        if (holdingUmbrella) {
          place(umbrellas, activeUmbrellaIndex, leftWristX * 0.4, 2.02 + hipShift, -0.05, 1.05, 1.0, 1.05, -0.08);
        } else {
          place(umbrellas, activeUmbrellaIndex, 0, -15, 0, 0.001, 0.001, 0.001);
        }
        activeUmbrellaIndex++;
      }

      if (biking) {
        place(bikeFrames, activeBikeIndex * 2, 0, 0.62, -0.05, 0.08, 0.42, 1.15, 0.12);
        place(bikeFrames, activeBikeIndex * 2 + 1, 0, 1.04, -0.46, 0.58, 0.07, 0.08);
        place(bikeWheels, activeBikeIndex * 2, 0, 0.36, -0.58, 1, 1, 1, 0, Math.PI / 2);
        place(bikeWheels, activeBikeIndex * 2 + 1, 0, 0.36, 0.54, 1, 1, 1, 0, Math.PI / 2);
        activeBikeIndex++;
      }

      if (resident.hasDog) {
        const dogPhase = seconds * 8.5 + resident.phase;
        const dogBob = Math.abs(Math.sin(dogPhase)) * 0.025;
        const dx = 0.62 + Math.sin(seconds * 1.4 + resident.phase) * 0.08;
        const dz = -0.38;
        // 胶囊有机躯干、昂首吻部、摇摆狗尾与四肢
        place(dogs, activeDogIndex * 6, dx, 0.34 + dogBob, dz, 0.25, 0.52, 0.25, Math.PI / 2);
        place(dogs, activeDogIndex * 6 + 1, dx, 0.49 + dogBob, dz - 0.28, 0.21, 0.24, 0.22, 0.35);
        place(dogs, activeDogIndex * 6 + 2, dx, 0.46 + dogBob, dz + 0.28, 0.06, 0.22, 0.06, -0.55 + Math.sin(dogPhase * 1.6) * 0.35);
        place(dogs, activeDogIndex * 6 + 3, dx - 0.08, 0.16, dz - 0.16, 0.07, 0.24, 0.07, Math.sin(dogPhase) * 0.45);
        place(dogs, activeDogIndex * 6 + 4, dx + 0.08, 0.16, dz - 0.16, 0.07, 0.24, 0.07, -Math.sin(dogPhase) * 0.45);
        place(dogs, activeDogIndex * 6 + 5, dx, 0.16, dz + 0.18, 0.14, 0.24, 0.08, -Math.sin(dogPhase) * 0.45);
        // 真实重力悬链下垂牵引绳（3段拟合手腕到狗项圈弧线）
        for (let seg = 0; seg < 3; seg++) {
          const u = (seg + 0.5) / 3;
          const sag = Math.sin(u * Math.PI) * 0.12;
          place(
            dogLeashes,
            activeDogIndex * 3 + seg,
            THREE.MathUtils.lerp(rightWristX, dx, u),
            THREE.MathUtils.lerp(rightWristY, 0.44 + dogBob, u) - sag,
            THREE.MathUtils.lerp(rightWristZ, dz - 0.18, u),
            0.018,
            0.018,
            0.28,
            0.42 - u * 0.35,
          );
        }
        activeDogIndex++;
      }

      if (resident.hasCart) {
        place(shoppingCarts, activeCartIndex * 3, 0, 0.64, -0.78, 0.52, 0.42, 0.68);
        place(shoppingCarts, activeCartIndex * 3 + 1, 0, 0.24, -0.78, 0.48, 0.08, 0.66);
        place(shoppingCarts, activeCartIndex * 3 + 2, 0, 0.92, -0.42, 0.54, 0.06, 0.08);
        place(cartGoods, activeCartIndex * 2, -0.1, 0.72, -0.82, 0.22, 0.26, 0.24);
        place(cartGoods, activeCartIndex * 2 + 1, 0.11, 0.7, -0.72, 0.2, 0.22, 0.22);
        activeCartIndex++;
      }
    });

    // A flight starts at each hand contact; its vertical acceleration is exactly -g.
    const flightSeconds = 1.55;
    const flight = Math.floor(seconds / flightSeconds);
    const flightT = THREE.MathUtils.euclideanModulo(seconds, flightSeconds);
    const ballT = flightT / flightSeconds;
    const ballX = -172 + Math.sin(flight * Math.PI + ballT * Math.PI) * 0.9;
    const ballZ = 116.3 + (flight % 2 === 0 ? ballT : 1 - ballT) * 5.4;
    const ballY = 1.55 + EARTH_GRAVITY * flightSeconds * flightT / 2 - EARTH_GRAVITY * flightT * flightT / 2;
    transform.position.set(ballX, ballY, ballZ);
    transform.rotation.set(seconds * 2, seconds * 1.5, 0);
    transform.scale.set(0.24, 0.24, 0.24);
    transform.updateMatrix();
    volleyBallMesh.setMatrixAt(0, transform.matrix);

    group.userData.cityHour = clock.hour;
    group.userData.employeesAtWork = employeesAtWork;
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  group.userData.pedestrianCount = count;
  group.userData.pedestrianRouteCount = routes.length;
  animate(0);
  return { animate };
}
