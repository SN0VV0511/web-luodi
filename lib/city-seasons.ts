import * as THREE from "three";
import { sampleEarthWind, type SeasonId } from "./city-physics";

export type { SeasonId };
export type SeasonMode = "auto" | SeasonId;

export type SeasonState = {
  season: SeasonId;
  nextSeason: SeasonId;
  blend: number;
  temperatureC: number;
  precipitation: number;
  label: { zh: string; en: string };
  weather: { zh: string; en: string };
  canopyColors: [THREE.Color, THREE.Color, THREE.Color, THREE.Color];
  shrubColor: THREE.Color;
  grassColor: THREE.Color;
  turfColor: THREE.Color;
  paleRoofColor: THREE.Color;
  asphaltRoughness: number;
  sunPosition: THREE.Vector3;
  sunIntensity: number;
  sunColor: THREE.Color;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  fogDayColor: THREE.Color;
  fogDensity: number;
  particleColorA: THREE.Color;
  particleColorB: THREE.Color;
  groundCoverOpacity: number;
};

type SeasonPreset = {
  id: SeasonId;
  tempC: number;
  label: { zh: string; en: string };
  weather: { zh: string; en: string };
  canopy: [string, string, string, string];
  shrub: string;
  grass: string;
  turf: string;
  paleRoof: string;
  asphaltRoughness: number;
  sunElevDeg: number;
  sunAzimuthDeg: number;
  sunIntensity: number;
  sunColor: string;
  skyZenith: string;
  skyHorizon: string;
  fogDay: string;
  fogDensity: number;
  particleA: string;
  particleB: string;
  groundCover: number;
};

const SEASON_ORDER: readonly SeasonId[] = ["spring", "summer", "autumn", "winter"];
export const SEASON_CYCLE_SECONDS = 144; // 每季 36 秒平滑轮转，可手动锁定任一季节

const PRESETS: Record<SeasonId, SeasonPreset> = {
  spring: {
    id: "spring",
    tempC: 19,
    label: { zh: "春季 · 樱吹新绿", en: "Spring · Sakura Bloom" },
    weather: { zh: "微风拂面 · 落樱纷飞", en: "Gentle Breeze · Falling Petals" },
    canopy: ["#ef9ebb", "#68b556", "#f5bfd2", "#4d9844"],
    shrub: "#5da64d",
    grass: "#699c56",
    turf: "#80b268",
    paleRoof: "#b2bcc2",
    asphaltRoughness: 0.74,
    sunElevDeg: 54,
    sunAzimuthDeg: -36,
    sunIntensity: 2.35,
    sunColor: "#fff4dc",
    skyZenith: "#2c6cb2",
    skyHorizon: "#f2dec8",
    fogDay: "#c8bfb6",
    fogDensity: 0.00052,
    particleA: "#f8b4cc",
    particleB: "#ffe6ef",
    groundCover: 0.55,
  },
  summer: {
    id: "summer",
    tempC: 31,
    label: { zh: "夏季 · 盛夏骤雨", en: "Summer · Coastal Sunshower" },
    weather: { zh: "海风阵雨 · 湿润反光路面", en: "Warm Sea Shower · Wet Specular Roads" },
    canopy: ["#245d34", "#357840", "#4b8e47", "#61a150"],
    shrub: "#326f3c",
    grass: "#4e8744",
    turf: "#649e54",
    paleRoof: "#a5b2b8",
    asphaltRoughness: 0.34,
    sunElevDeg: 70,
    sunAzimuthDeg: -24,
    sunIntensity: 2.65,
    sunColor: "#fff8e6",
    skyZenith: "#1b58a4",
    skyHorizon: "#dceaf4",
    fogDay: "#b8c8d4",
    fogDensity: 0.00046,
    particleA: "#d6ecff",
    particleB: "#b6dcfa",
    groundCover: 0.0,
  },
  autumn: {
    id: "autumn",
    tempC: 14,
    label: { zh: "秋季 · 银杏丹枫", en: "Autumn · Ginkgo & Maple" },
    weather: { zh: "秋高气爽 · 金叶随风飘旋", en: "Crisp Gusts · Drifting Amber Leaves" },
    canopy: ["#e8ad2c", "#c9472b", "#db762a", "#8d7838"],
    shrub: "#b86b2d",
    grass: "#8d8f4a",
    turf: "#a49c54",
    paleRoof: "#b5b4ac",
    asphaltRoughness: 0.76,
    sunElevDeg: 41,
    sunAzimuthDeg: -48,
    sunIntensity: 2.25,
    sunColor: "#ffe2b0",
    skyZenith: "#255896",
    skyHorizon: "#f0cfa8",
    fogDay: "#cbb8a2",
    fogDensity: 0.00056,
    particleA: "#f0b429",
    particleB: "#d6492c",
    groundCover: 0.85,
  },
  winter: {
    id: "winter",
    tempC: -2,
    label: { zh: "冬季 · 瑞雪初霁", en: "Winter · Fresh Snowfall" },
    weather: { zh: "寒潮瑞雪 · 屋顶覆霜积雪", en: "Crisp Frost · Snow-Dusted Rooftops" },
    canopy: ["#dde7f0", "#466458", "#c8d7e4", "#728b88"],
    shrub: "#cad8e3",
    grass: "#cfdbe4",
    turf: "#dde7ef",
    paleRoof: "#edf3f8",
    asphaltRoughness: 0.56,
    sunElevDeg: 27,
    sunAzimuthDeg: -56,
    sunIntensity: 1.88,
    sunColor: "#eef4ff",
    skyZenith: "#42688f",
    skyHorizon: "#dce4ec",
    fogDay: "#cfd9e2",
    fogDensity: 0.00072,
    particleA: "#ffffff",
    particleB: "#e3effa",
    groundCover: 0.95,
  },
};

function lerpColor(hexA: string, hexB: string, t: number): THREE.Color {
  return new THREE.Color(hexA).lerp(new THREE.Color(hexB), t);
}

/**
 * 根据世界时间与季节模式采样地球轴倾角太阳高度、植被叶绿素/花青素/积雪色彩与大气参数。
 */
export function sampleSeasonState(seconds: number, mode: SeasonMode = "auto"): SeasonState {
  let season: SeasonId;
  let nextSeason: SeasonId;
  let blend = 0;

  if (mode !== "auto") {
    season = mode;
    nextSeason = mode;
    blend = 0;
  } else {
    const wrapped = THREE.MathUtils.euclideanModulo(seconds, SEASON_CYCLE_SECONDS);
    const segLen = SEASON_CYCLE_SECONDS / 4;
    const idx = Math.floor(wrapped / segLen) % 4;
    const local = wrapped - idx * segLen;
    season = SEASON_ORDER[idx];
    nextSeason = SEASON_ORDER[(idx + 1) % 4];
    // 每季最后 9 秒使用平滑三次插值过渡到下一季节
    blend = local > segLen - 9 ? THREE.MathUtils.smoothstep((local - (segLen - 9)) / 9, 0, 1) : 0;
  }

  const a = PRESETS[season];
  const b = PRESETS[nextSeason];
  const rainPulse = THREE.MathUtils.smoothstep(Math.sin(seconds * Math.PI / 24), -0.2, 0.55);
  const rainAmount = (id: SeasonId) => id === "summer" ? rainPulse : id === "winter" ? 0.6 : 0;

  const elevRad = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(a.sunElevDeg, b.sunElevDeg, blend));
  const azimRad = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(a.sunAzimuthDeg, b.sunAzimuthDeg, blend));
  const sunDist = 390;
  const horiz = Math.cos(elevRad) * sunDist;
  const sunPosition = new THREE.Vector3(
    Math.sin(azimRad) * horiz - 120,
    Math.sin(elevRad) * sunDist,
    Math.cos(azimRad) * horiz * 0.65 + 95,
  );

  return {
    season,
    nextSeason,
    blend,
    temperatureC: Math.round(THREE.MathUtils.lerp(a.tempC, b.tempC, blend)),
    precipitation: THREE.MathUtils.lerp(rainAmount(season), rainAmount(nextSeason), blend),
    label: blend > 0.55 ? b.label : a.label,
    weather: blend > 0.55 ? b.weather : a.weather,
    canopyColors: [
      lerpColor(a.canopy[0], b.canopy[0], blend),
      lerpColor(a.canopy[1], b.canopy[1], blend),
      lerpColor(a.canopy[2], b.canopy[2], blend),
      lerpColor(a.canopy[3], b.canopy[3], blend),
    ],
    shrubColor: lerpColor(a.shrub, b.shrub, blend),
    grassColor: lerpColor(a.grass, b.grass, blend),
    turfColor: lerpColor(a.turf, b.turf, blend),
    paleRoofColor: lerpColor(a.paleRoof, b.paleRoof, blend),
    asphaltRoughness: THREE.MathUtils.lerp(a.asphaltRoughness, b.asphaltRoughness, blend),
    sunPosition,
    sunIntensity: THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, blend),
    sunColor: lerpColor(a.sunColor, b.sunColor, blend),
    skyZenith: lerpColor(a.skyZenith, b.skyZenith, blend),
    skyHorizon: lerpColor(a.skyHorizon, b.skyHorizon, blend),
    fogDayColor: lerpColor(a.fogDay, b.fogDay, blend),
    fogDensity: THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, blend),
    particleColorA: lerpColor(a.particleA, b.particleA, blend),
    particleColorB: lerpColor(a.particleB, b.particleB, blend),
    groundCoverOpacity: THREE.MathUtils.lerp(a.groundCover, b.groundCover, blend),
  };
}

/**
 * 构建四季物理大气粒子场（春樱花瓣、夏骤雨细丝、秋红枫银杏叶、冬六角飞雪）+ 林下地表落花/落叶/积雪斑块。
 */
export function buildSeasonalAtmosphere({
  group,
  geometries,
  materials,
}: {
  group: THREE.Group;
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
}): {
  animate: (seconds: number, state: SeasonState) => void;
} {
  // 折面花瓣/叶片几何体（非平板纸片，带中脉微折角）
  const flakeGeo = new THREE.PlaneGeometry(0.28, 0.18, 2, 1);
  const fPos = flakeGeo.getAttribute("position");
  for (let i = 0; i < fPos.count; i++) {
    if (Math.abs(fPos.getX(i)) < 0.01) fPos.setZ(i, 0.035);
  }
  flakeGeo.computeVertexNormals();
  geometries.add(flakeGeo);

  const particleMat = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.62,
    metalness: 0.05,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.88,
  });
  materials.add(particleMat);

  const count = 420;
  const particles = new THREE.InstancedMesh(flakeGeo, particleMat, count);
  particles.name = "SeasonalPhysicsParticles";
  particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  particles.frustumCulled = false;
  particles.castShadow = false;
  particles.receiveShadow = false;
  group.add(particles);

  const dummy = new THREE.Object3D();
  let seed = 44109;
  const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  const seeds = Array.from({ length: count }, () => ({
    bx: -215 + rand() * 430,
    bz: -165 + rand() * 285,
    phase: rand() * 100,
    spinRate: 1.4 + rand() * 2.8,
    size: 0.75 + rand() * 0.65,
    alt: rand(),
  }));

  let lastColorSignature = "";

  return {
    animate(seconds: number, state: SeasonState) {
      const isSummerRain = state.season === "summer" && state.blend < 0.6;
      particles.count = isSummerRain ? Math.round(count * state.precipitation) : count;
      const terminalFall =
        isSummerRain ? 13.5 :
        state.season === "autumn" ? 1.85 :
        state.season === "winter" ? 1.35 :
        1.12;

      const colorSig = `${state.particleColorA.getHexString()}:${state.particleColorB.getHexString()}`;
      if (colorSig !== lastColorSignature) {
        lastColorSignature = colorSig;
        for (let i = 0; i < count; i++) {
          particles.setColorAt(i, seeds[i].alt > 0.45 ? state.particleColorA : state.particleColorB);
        }
        if (particles.instanceColor) particles.instanceColor.needsUpdate = true;
      }

      particleMat.opacity = isSummerRain ? 0.42 : 0.88;

      const ceiling = 42;
      const wind = sampleEarthWind(seconds, 0, 0, state.season);

      for (let i = 0; i < count; i++) {
        const item = seeds[i];
        const fallDist = (seconds * terminalFall + item.phase * ceiling) % ceiling;
        const y = ceiling - fallDist + 0.45;
        const flightTime = fallDist / terminalFall;

        // 真实风阻漂移与卡门涡街侧向摆动（雨滴受风斜切但几乎不飘摆，花瓣与落叶大幅翻滚飘旋）
        const flutterAmp = isSummerRain ? 0.04 : state.season === "autumn" ? 1.35 : 0.95;
        const wx = item.bx + wind.x * flightTime * (isSummerRain ? 0.16 : 0.65) + Math.sin(seconds * 1.8 + item.phase) * flutterAmp;
        const wz = item.bz + wind.z * flightTime * (isSummerRain ? 0.16 : 0.65) + Math.cos(seconds * 1.5 + item.phase * 1.3) * flutterAmp;

        dummy.position.set(
          THREE.MathUtils.euclideanModulo(wx + 225, 450) - 225,
          y,
          THREE.MathUtils.euclideanModulo(wz + 175, 310) - 175,
        );

        if (isSummerRain) {
          // 雨滴在地球重力终端速度下拉伸为细长微倾雨丝
          dummy.rotation.set(0, 0, -wind.x * 0.05);
          dummy.scale.set(0.08, 3.6 * item.size, 0.08);
        } else {
          // 花瓣、红叶与雪花在空气升力扭矩下三维翻滚
          dummy.rotation.set(
            seconds * item.spinRate + item.phase,
            seconds * item.spinRate * 0.72,
            Math.sin(seconds * 2.4 + item.phase) * 0.85,
          );
          const s = (state.season === "winter" ? 0.72 : 1.05) * item.size;
          dummy.scale.set(s, s, s);
        }
        dummy.updateMatrix();
        particles.setMatrixAt(i, dummy.matrix);
      }
      particles.instanceMatrix.needsUpdate = true;
    },
  };
}
