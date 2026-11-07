import * as THREE from "three";

/** 标准地球海平面重力加速度 (m/s²) 与标准大气密度 (kg/m³)。 */
export const EARTH_GRAVITY = 9.80665;
export const EARTH_AIR_DENSITY = 1.225;

export type SeasonId = "spring" | "summer" | "autumn" | "winter";

export type BallisticParams = {
  originX: number;
  originY: number;
  originZ: number;
  vx: number;
  vy: number;
  vz: number;
  /** 线性空气阻力系数 (1/s)，水滴约 0.18，火花约 0.55，落叶约 2.6。 */
  drag?: number;
  /** 地面高度 (m)，触地后按恢复系数弹跳。 */
  groundY?: number;
  /** 恢复系数 e ∈ [0, 0.85]，水滴飞溅约 0.24，电焊钢渣火花约 0.52。 */
  restitution?: number;
  /** 地面切向摩擦保留率 ∈ [0, 1]。 */
  surfaceRetention?: number;
  /** 重力缩放（1.0 = 标准地球重力；负值可用于浮力微粒）。 */
  gravityScale?: number;
  windX?: number;
  windZ?: number;
};

export type BallisticSample = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  bounces: number;
  grounded: boolean;
};

export type ChassisSuspensionPose = {
  /** 俯仰角 (rad)：刹车前倾为正，起步抬头为负。 */
  pitch: number;
  /** 侧倾角 (rad)：转弯时受离心力向外侧倾斜。 */
  roll: number;
  /** 悬挂垂向起伏位移 (m)。 */
  heaveY: number;
  /** 车轮累计滚动角 (rad)。 */
  wheelSpin: number;
  /** 是否处于制动亮刹车灯状态。 */
  braking: boolean;
};

/**
 * 采样海岸城市在地球季风与街道峡谷湍流下的三维瞬时风场 (m/s)。
 */
export function sampleEarthWind(
  seconds: number,
  x = 0,
  z = 0,
  season: SeasonId = "spring",
): { x: number; y: number; z: number } {
  const seasonalStrength =
    season === "autumn" ? 2.45 :
    season === "winter" ? 2.85 :
    season === "spring" ? 1.65 :
    1.35;
  const gust = 0.72 + 0.38 * Math.sin(seconds * 0.43 + x * 0.012) + 0.22 * Math.cos(seconds * 0.91 - z * 0.015);
  const eddyX = Math.sin(seconds * 1.15 + z * 0.04) * 0.42;
  const eddyZ = Math.cos(seconds * 0.88 + x * 0.035) * 0.38;
  const updraft = Math.sin(seconds * 1.4 + (x + z) * 0.05) * 0.16;
  const dirX = season === "winter" ? 0.78 : season === "autumn" ? 0.68 : 0.58;
  const dirZ = season === "winter" ? 0.62 : season === "summer" ? -0.66 : -0.42;
  return {
    x: dirX * seasonalStrength * gust + eddyX,
    y: updraft,
    z: dirZ * seasonalStrength * gust + eddyZ,
  };
}

/**
 * 基于真实地球重力 g=9.80665 m/s²、空气阻力、风场漂移与刚体地面恢复系数弹跳的质点物理求解器。
 * 使用固定步长确定性子步积分，保证任意时刻采样平滑且支持暂停/重放无漂移。
 */
export function sampleBallisticTrajectory(params: BallisticParams, elapsedSeconds: number): BallisticSample {
  const tMax = Math.max(0, Math.min(12, elapsedSeconds));
  const drag = Math.max(0, params.drag ?? 0.22);
  const groundY = params.groundY ?? 0.38;
  const restitution = THREE.MathUtils.clamp(params.restitution ?? 0.3, 0, 0.88);
  const retention = THREE.MathUtils.clamp(params.surfaceRetention ?? 0.68, 0.1, 0.98);
  const g = EARTH_GRAVITY * (params.gravityScale ?? 1);
  const windX = params.windX ?? 0;
  const windZ = params.windZ ?? 0;

  let x = params.originX;
  let y = params.originY;
  let z = params.originZ;
  let vx = params.vx;
  let vy = params.vy;
  let vz = params.vz;
  let bounces = 0;
  let grounded = false;

  const stepDt = 1 / 60;
  let remaining = tMax;
  while (remaining > 1e-5) {
    const dt = Math.min(stepDt, remaining);
    remaining -= dt;

    const decay = Math.exp(-drag * dt);
    const prevY = y;
    if (drag > 1e-6) {
      const response = -Math.expm1(-drag * dt) / drag;
      x += windX * dt + (vx - windX) * response;
      z += windZ * dt + (vz - windZ) * response;
      y += (vy + g / drag) * response - g * dt / drag;
      vx = windX + (vx - windX) * decay;
      vz = windZ + (vz - windZ) * decay;
      vy = (vy + g / drag) * decay - g / drag;
    } else {
      x += vx * dt;
      z += vz * dt;
      y += vy * dt - g * dt * dt / 2;
      vy -= g * dt;
    }

    if (y <= groundY) {
      const penetration = groundY - y;
      y = groundY + Math.min(0.06, penetration * restitution);
      if (Math.abs(vy) > 0.38 && restitution > 0.02 && bounces < 5) {
        vy = Math.abs(vy) * restitution;
        vx *= retention;
        vz *= retention;
        bounces++;
      } else {
        y = groundY;
        vy = 0;
        vx *= 0.75;
        vz *= 0.75;
        grounded = prevY <= groundY + 0.02;
      }
    }
  }

  return { x, y, z, vx, vy, vz, bounces, grounded };
}

/**
 * 阿基米德热浮力羽流求解（用于火灾浓烟、冷却塔水汽、氢气球脱手升空）。
 */
export function sampleBuoyantPlume(
  originX: number,
  originY: number,
  originZ: number,
  ageSeconds: number,
  buoyancyAccel = 2.4,
  seed = 0,
  windX = 1.2,
  windZ = -0.6,
): { x: number; y: number; z: number; radiusScale: number } {
  const t = Math.max(0, ageSeconds);
  // 浮力上升但受湍流卷吸阻尼趋于终端上升速度
  const terminalV = Math.sqrt(Math.max(0.4, buoyancyAccel) * 2.1);
  const y = originY + terminalV * t + 0.35 * (1 - Math.exp(-t * 1.6));
  const swirl = 0.22 * Math.log1p(t * 2.4);
  const x = originX + windX * t * 0.52 + Math.sin(t * 2.3 + seed * 1.7) * swirl;
  const z = originZ + windZ * t * 0.52 + Math.cos(t * 1.9 + seed * 2.3) * swirl;
  const radiusScale = 0.32 + 0.78 * Math.pow(Math.min(1, t / 3.5), 0.68);
  return { x, y, z, radiusScale };
}

/**
 * 闭门器弹簧-液压阻尼铰链门动力学求解（麦当劳推拉双扇玻璃门、商业门厅门）。
 * 当行人与门口距离进入感应/推门半径时，门扇以欠阻尼弹簧迅速推开并微幅回弹，离开后受液压阻尼平滑闭合。
 */
export function sampleDoorSpringAngle(
  seconds: number,
  passTimes: readonly number[],
  periodSeconds: number,
  maxOpenAngleRad = 1.38,
): number {
  let openness = 0;
  for (const passAt of passTimes) {
    let dt = THREE.MathUtils.euclideanModulo(seconds - passAt, periodSeconds);
    if (dt > periodSeconds * 0.5) dt -= periodSeconds;
    // -0.55s 开始推门，0..1.35s 通行保持开启，1.35..3.1s 液压闭门器缓闭锁舌
    if (dt >= -0.65 && dt <= 3.2) {
      let local = 0;
      if (dt < 0.15) {
        const u = THREE.MathUtils.clamp((dt + 0.65) / 0.8, 0, 1);
        // 带真实惯性微超调的弹簧推开曲线
        local = 1 - Math.exp(-5.4 * u) * Math.cos(4.2 * u);
      } else if (dt < 1.35) {
        local = 1 + 0.025 * Math.sin((dt - 0.15) * 4.5) * Math.exp(-(dt - 0.15) * 2.2);
      } else {
        const closeU = THREE.MathUtils.clamp((dt - 1.35) / 1.75, 0, 1);
        // 双速液压闭门器：前段匀速回摆，末段 15° 阻尼缓冲落锁
        local = Math.pow(1 - closeU, 1.85) * (1 + 0.12 * Math.sin(closeU * Math.PI));
      }
      openness = Math.max(openness, THREE.MathUtils.clamp(local, 0, 1.06));
    }
  }
  return openness * maxOpenAngleRad;
}

/**
 * 汽车四轮弹簧-阻尼悬挂与刚体俯仰/侧倾动力学：
 * - 红灯减速制动时车头因惯性前倾下压 (Brake Dive)
 * - 绿灯起步加速时车尾微蹲 (Acceleration Squat)
 * - 十字路口转向时受离心加速度 v²/R 产生外侧倾 (Centrifugal Body Roll)
 * - 沥青路面微起伏带来高频阻尼垂向振动与真实车轮滚动角速度
 */
export function sampleVehicleSuspension(params: {
  cruiseSpeed: number;
  wheelRadius: number;
  seconds: number;
  distToStopLine: number;
  redLight: boolean;
  turnBlend: number;
  turnAngleDelta: number;
  phase: number;
}): ChassisSuspensionPose {
  const {
    cruiseSpeed,
    wheelRadius,
    seconds,
    distToStopLine,
    redLight,
    turnBlend,
    turnAngleDelta,
    phase,
  } = params;

  let effectiveSpeed = cruiseSpeed;
  let longAccel = 0;
  let braking = false;

  if (redLight && distToStopLine > 7.8 && distToStopLine < 21.0) {
    braking = true;
    if (distToStopLine <= 9.2) {
      effectiveSpeed = 0;
      // 刚刹停瞬间的弹簧回弹微振
      longAccel = -0.6 * Math.sin(seconds * 5.2 + phase) * 0.25;
    } else {
      const decelZone = (distToStopLine - 9.2) / (21.0 - 9.2);
      effectiveSpeed = cruiseSpeed * THREE.MathUtils.smoothstep(decelZone, 0, 1);
      // 制动减速度 a = -v² / (2s)
      longAccel = -Math.min(5.6, (cruiseSpeed * cruiseSpeed) / (2 * 11.8));
    }
  } else if (!redLight && distToStopLine > 7.5 && distToStopLine < 13.5) {
    // 绿灯起步抬头加速
    longAccel = 2.6;
  }

  // 弯道离心加速度 a_lat = v * ω
  const turnRate = turnBlend > 0.01 && turnBlend < 0.99
    ? turnAngleDelta * 6 * turnBlend * (1 - turnBlend) * (effectiveSpeed / 3.2)
    : 0;
  const latAccel = effectiveSpeed * turnRate;

  // 转换纵向/横向加速度为悬挂弹簧角位移（典型轿车俯仰刚度 ~1.8°/0.4g，侧倾刚度 ~3.2°/0.4g）
  const pitch = THREE.MathUtils.clamp(-longAccel * 0.0085, -0.042, 0.052);
  const roll = THREE.MathUtils.clamp(-latAccel * 0.014, -0.068, 0.068);

  // 运动时路面微不平激励 + 怠速发动机微震
  const speedRatio = effectiveSpeed / Math.max(1, cruiseSpeed);
  const heaveY =
    speedRatio * (Math.sin(seconds * 11.5 + phase) * 0.009 + Math.cos(seconds * 17.3 + phase * 1.7) * 0.005) +
    (1 - speedRatio) * Math.sin(seconds * 26 + phase) * 0.0018;

  const wheelSpin = (seconds * effectiveSpeed) / Math.max(0.2, wheelRadius);

  return { pitch, roll, heaveY, wheelSpin, braking };
}

/**
 * 真实重力阻尼单摆求解：ω₀ = √(g / L)，叠加阵风扭矩激励（用于塔吊钢索吊梁、悬挂灯笼等）。
 */
export function samplePendulumSwing(
  seconds: number,
  cableLengthMeters: number,
  amplitudeRad = 0.075,
  phase = 0,
): { swingX: number; swingZ: number; omega: number } {
  const L = Math.max(0.6, cableLengthMeters);
  const omega = Math.sqrt(EARTH_GRAVITY / L);
  const swingX =
    amplitudeRad * Math.sin(omega * seconds + phase) +
    amplitudeRad * 0.28 * Math.sin(omega * 0.53 * seconds + phase * 1.9);
  const swingZ =
    amplitudeRad * 0.62 * Math.cos(omega * 0.94 * seconds + phase * 0.7) +
    amplitudeRad * 0.2 * Math.sin(omega * 1.41 * seconds);
  return { swingX, swingZ, omega };
}

/**
 * 双端悬链线重力自然下垂插值（用于高压输电线、遛狗牵引绳、工地吊索、节日灯串）。
 */
export function sampleCatenaryPoint(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  u: number,
  sagMeters: number,
): THREE.Vector3 {
  const t = THREE.MathUtils.clamp(u, 0, 1);
  // 双曲余弦悬链线近似归一化曲线 cosh(2t - 1) - cosh(1)
  const cosh1 = Math.cosh(1);
  const sagFactor = (Math.cosh(2 * t - 1) - cosh1) / (1 - cosh1);
  return new THREE.Vector3(
    THREE.MathUtils.lerp(ax, bx, t),
    THREE.MathUtils.lerp(ay, by, t) - sagMeters * sagFactor,
    THREE.MathUtils.lerp(az, bz, t),
  );
}

/** A compressed day preserves the order of morning, work, lunch, and evening. */
export const CITY_DAY_SECONDS = 720;
export const CITY_DAY_START_HOUR = 7 + 35 / 60;
export function sampleCityClock(seconds: number): { hour: number; commute: "inbound" | "lunch" | "outbound" | "rest" } {
  const hour = THREE.MathUtils.euclideanModulo(seconds / CITY_DAY_SECONDS * 24 + CITY_DAY_START_HOUR, 24);
  return {
    hour,
    commute: hour >= 7 && hour < 10 ? "inbound"
      : hour >= 12 && hour < 14 ? "lunch"
        : hour >= 17 && hour < 20 ? "outbound" : "rest",
  };
}

export const SHOP_VISIT_SECONDS = 40;
export const SHOP_ARRIVAL_OFFSETS = [0, 10, 20, 30] as const;
// The passage instants are derived from the same timed path as the customer.
export const SHOP_DOOR_PASSAGES = SHOP_ARRIVAL_OFFSETS.flatMap((offset) => [offset + 4, offset + 29]);
const shopPath: readonly (readonly [time: number, x: number, z: number])[] = [
  [0, -0.42, 4.8], [4, -0.42, 0], [7, -0.42, -2.7],
  [10, 1.25, -3.0], [17, 1.25, -3.0], [20, 2.4, -5.3],
  [24, 2.4, -5.3], [26, 0.42, -3.6], [29, 0.42, 0],
  [33, 0.42, 4.8], [34, 0.42, 4.8], [36, -0.42, 4.8],
  [40, -0.42, 4.8],
];

export function sampleShopVisit(seconds: number, arrivalOffset: number): {
  x: number; z: number; heading: number; speed: number; walking: boolean; pushingDoor: boolean; hasOrder: boolean;
} {
  const time = THREE.MathUtils.euclideanModulo(seconds - arrivalOffset, SHOP_VISIT_SECONDS);
  const i = shopPath.findIndex((point, index) => index > 0 && point[0] > time);
  const a = shopPath[Math.max(0, i - 1)];
  const b = shopPath[i < 0 ? shopPath.length - 1 : i];
  const t = THREE.MathUtils.clamp((time - a[0]) / Math.max(0.01, b[0] - a[0]), 0, 1);
  const dx = b[1] - a[1];
  const dz = b[2] - a[2];
  const z = THREE.MathUtils.lerp(a[2], b[2], t);
  return {
    x: THREE.MathUtils.lerp(a[1], b[1], t), z,
    heading: dx || dz ? Math.atan2(dx, dz) : Math.PI,
    speed: Math.hypot(dx, dz) / Math.max(0.01, b[0] - a[0]),
    walking: Math.hypot(dx, dz) > 0.01,
    pushingDoor: Math.abs(z) < 0.95,
    hasOrder: time >= 22,
  };
}
