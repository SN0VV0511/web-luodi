import * as THREE from "three";
import { canLoadCityAssets, loadCarModelsOnce, type CarModelKind } from "./real-city/vehicles/car-models";
import { buildV3Scenes } from "./real-city/v3/scenes";
import { cityLots, ROAD_SEGMENTS, cityBlocks, districts, civicLots, type CityLot } from "./city-map";
import type { PlaceId } from "./city-content";
import { getBuildingExperience } from "./building-experience";
import { buildCivicDistrict } from "./city-civic";
import { buildDetailedCityLife } from "./real-city/life";
import { buildCityCoast } from "./city-coast";
import { buildDetailedArchitecture } from "./real-city/architecture";
import { buildDetailedEnvironment } from "./real-city/environment";
import { cityDetailBudget, type CityBuiltSite } from "./real-city/contracts";
import { sampleSignalPhase } from "./real-city/traffic/signals";
import { buildTrafficDetails } from "./real-city/traffic/details";
import { CityFacadeInteriors } from "./real-city/render/facade-interiors";
import { buildCityUtilities } from "./city-utilities";
import { buildCityCruiseHarbor } from "./city-cruise";
import { buildCityEvents } from "./city-events";
import { buildCommercialAndCurtainWalls } from "./city-mcdonalds";
import { buildSeasonalAtmosphere, sampleSeasonState, type SeasonMode, type SeasonState } from "./city-seasons";
import { createCityWeather } from "./city-weather";
import { createCityTraffic } from "./city-traffic";
import type { CityLifeSnapshot } from "./real-city/snapshot";
import { bindWorldScalePbr, createGlassCurtainWallPbr, createAshlarStonePbr, createSidewalkPaverPbr } from "./city-pbr";
import { applyCitySurface, markCitySurface, type CitySurface } from "./city-surfaces";
import { TreeField, applyTreeWind, type TreePlacement } from "./real-city/vegetation/tree-field";
import { loadTreeModels } from "./real-city/vegetation/tree-models";
import { createTreeCanopy, createTreeTrunk, createVehicleShell, createVehicleWheel, paintLeafCluster, type VehicleKind, type VehicleShell } from "./city-forms";

export type CityWorld = {
  group: THREE.Group;
  billboardSign: THREE.Mesh;
  anchors: Map<PlaceId, THREE.Vector3>;
  pickables: THREE.Object3D[];
  builtSites: readonly CityBuiltSite[];
  animate: (seconds: number, night: boolean, seasonMode?: SeasonMode, seasonState?: SeasonState) => void;
  setNight: (night: boolean) => void;
  getLifeSnapshot?: () => CityLifeSnapshot;
  dispose: () => void;
};
type Part = { matrix: THREE.Matrix4; place?: PlaceId };
type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material; parts: Part[] };
type Building = Pick<CityLot, "x" | "z" | "width" | "depth" | "height" | "style"> & { id?: PlaceId };

/** 米制街区、独立楼宇与公共设施。重复构件按材质实例化，避免逐窗生成对象。 */
export function buildCityWorld(options: { compact?: boolean } = {}): CityWorld {
  const detailBudget = cityDetailBudget(options.compact);
  const group = new THREE.Group();
  group.name = "SN0VV Coastal City";
  const anchors = new Map<PlaceId, THREE.Vector3>();
  const pickables: THREE.Object3D[] = [];
  const batches = new Map<string, Batch>();
  const textures = new Set<THREE.Texture>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const nightMaterials: { material: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
  const weather = createCityWeather();
  const facadeInteriors = new CityFacadeInteriors();
  const transform = new THREE.Object3D();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 12);
  const crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  const roundTowerGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
  const roundUv = roundTowerGeometry.getAttribute("uv");
  for (let index = 0; index < roundUv.count; index++) roundUv.setX(index, roundUv.getX(index) * Math.PI);
  const coneGeometry = new THREE.ConeGeometry(1, 1, 7);
  [boxGeometry, cylinderGeometry, crownGeometry, coneGeometry, roundTowerGeometry].forEach((value) => geometries.add(value));
  let seed = 92831;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const solid = (color: string, roughness = 0.82, metalness = 0.04) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(value);
    return value;
  };
  const concrete = solid("#c4bfb3", 0.8);
  const lightStone = solid("#dcd4c3", 0.74);
  const darkRoof = solid("#364147", 0.62, 0.18);
  const paleRoof = solid("#aeb8bd", 0.58, 0.14);
  const pavement = solid("#b2b0a6", 0.8);
  const curb = solid("#dcd6c8", 0.74);
  const asphalt = solid("#454b4f", 0.88, 0.02);
  const roadLine = solid("#f2efe6", 0.65);
  const roadYellow = solid("#e6b245", 0.65);
  // 低饱和的橄榄绿草坪，与《都市：天际线》式写实色调一致，纹理变化交给表面着色器。
  const grass = solid("#5a7445", 0.92);
  const turf = solid("#66804c", 0.9);
  const soil = solid("#5f6648", 0.94);
  const trunk = solid("#634c3b", 0.88);
  const leaves = [
    solid("#2b5838"), solid("#3f7245"), solid("#588a4d"),
    solid("#6f9954"), solid("#d49b3d"), solid("#c96b70"),
  ];
  markCitySurface(asphalt, "asphalt");
  markCitySurface(pavement, "concrete");
  markCitySurface(grass, "grass");
  markCitySurface(turf, "grass");
  markCitySurface(soil, "soil");
  markCitySurface(trunk, "bark");
  markCitySurface(darkRoof, "roof");
  markCitySurface(paleRoof, "roof");
  markCitySurface(concrete, "concrete");
  markCitySurface(lightStone, "concrete");
  leaves.forEach((leaf) => markCitySurface(leaf, "foliage"));
  const metal = solid("#3e494d", 0.38, 0.58);
  const railMetal = solid("#b2babd", 0.3, 0.62);
  const glass = solid("#2b5872", 0.16, 0.62);
  glass.userData.cityGlazing = true;
  const orange = solid("#d66c38", 0.52, 0.12);
  const tailRed = solid("#ff3b30", 0.35, 0.1);
  tailRed.emissive.set("#ff2a1f");
  nightMaterials.push({ material: tailRed, day: 0.45, night: 2.8 });
  const lamp = solid("#fff1cf", 0.3);
  lamp.emissive.set("#ffcf78");
  nightMaterials.push({ material: lamp, day: 0.18, night: 3.8 });

  const part = (
    material: THREE.Material, geometry: THREE.BufferGeometry,
    x: number, y: number, z: number, sx: number, sy: number, sz: number,
    place?: PlaceId, rotationY = 0, rotationZ = 0,
  ) => {
    const key = `${geometry.uuid}:${material.uuid}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { geometry, material, parts: [] };
      batches.set(key, batch);
    }
    transform.position.set(x, y, z);
    transform.rotation.set(0, rotationY, rotationZ);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    batch.parts.push({ matrix: transform.matrix.clone(), place });
  };
  const box = (
    material: THREE.Material, x: number, y: number, z: number,
    width: number, height: number, depth: number, place?: PlaceId,
  ) => part(material, boxGeometry, x, y, z, width, height, depth, place);
  const beam = (from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material) => {
    const direction = to.clone().sub(from);
    const key = `${cylinderGeometry.uuid}:${material.uuid}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { geometry: cylinderGeometry, material, parts: [] };
      batches.set(key, batch);
    }
    transform.position.copy(from).add(to).multiplyScalar(0.5);
    transform.scale.set(radius, direction.length(), radius);
    transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    transform.updateMatrix();
    batch.parts.push({ matrix: transform.matrix.clone() });
  };
  const canvasTexture = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建城市建筑纹理");
    draw(ctx);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
    textures.add(texture);
    return texture;
  };

  const facadeMaps = { glass: createGlassCurtainWallPbr(), stone: createAshlarStonePbr(), brick: createAshlarStonePbr() };
  const pavingMaps = createSidewalkPaverPbr();
  bindWorldScalePbr(pavement, pavingMaps, 3.2, 3.2, 0.32);
  const facade = (kind: "glass" | "stone" | "brick", tone: string) => {
    const lit: { on: boolean; blinds: number; warm: number }[] = [];
    const map = canvasTexture(512, 1024, (ctx) => {
      ctx.fillStyle = tone;
      ctx.fillRect(0, 0, 512, 1024);

      if (kind === "stone") {
        // 细腻石材分缝与层间腰线
        ctx.strokeStyle = "rgba(42, 38, 32, 0.16)";
        ctx.lineWidth = 1;
        for (let y = 0; y < 1024; y += 16) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
          for (let x = (y % 32 ? 0 : 16); x < 512; x += 32) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 16); ctx.stroke();
          }
        }
      } else if (kind === "brick") {
        // 窑变红砖交错砌筑纹理
        for (let y = 0; y < 1024; y += 8) {
          for (let x = (y % 16 ? 0 : 8); x < 512; x += 16) {
            const shift = (random() - 0.5) * 14;
            ctx.fillStyle = shift > 2 ? "rgba(185, 118, 88, 0.14)" : shift < -2 ? "rgba(48, 26, 20, 0.14)" : "transparent";
            if (ctx.fillStyle !== "transparent") ctx.fillRect(x, y, 15, 7);
          }
        }
        ctx.strokeStyle = "rgba(53, 32, 25, 0.26)";
        ctx.lineWidth = 1;
        for (let y = 0; y < 1024; y += 8) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
          for (let x = (y % 16 ? 0 : 8); x < 512; x += 16) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 8); ctx.stroke();
          }
        }
      }

      for (let row = 0; row < 16; row++) {
        const y = row * 64;
        if (kind === "glass") {
          // 玻璃幕墙层间暗梁 (Spandrel panel) 与金属横梁
          ctx.fillStyle = "rgba(16, 28, 34, 0.65)";
          ctx.fillRect(0, y, 512, 10);
          ctx.fillStyle = "rgba(188, 204, 208, 0.24)";
          ctx.fillRect(0, y + 9, 512, 2);
        } else {
          // 石材/砖墙层间装饰腰线
          ctx.fillStyle = kind === "brick" ? "rgba(196, 178, 154, 0.42)" : "rgba(232, 226, 212, 0.38)";
          ctx.fillRect(0, y + 60, 512, 3);
          ctx.fillStyle = "rgba(20, 24, 26, 0.22)";
          ctx.fillRect(0, y + 63, 512, 1);
        }

        for (let col = 0; col < 8; col++) {
          const on = random() > 0.62;
          const blinds = random() > 0.68 ? 0.35 + random() * 0.35 : 0;
          const warm = random();
          lit.push({ on, blinds, warm });
          const x = col * 64;
          const inset = kind === "glass" ? 3 : 13;
          const winY = y + (kind === "glass" ? 11 : 12);
          const winW = 64 - inset * 2;
          const winH = kind === "glass" ? 50 : 40;
          const lightness = 21 + random() * 16;

          ctx.fillStyle = on && kind !== "glass" ? "#89877a" : `hsl(200 16% ${lightness}%)`;
          ctx.fillRect(x + inset, winY, winW, winH);

          if (kind === "glass") {
            const reflection = ctx.createLinearGradient(x, winY, x + 60, winY + winH);
            reflection.addColorStop(0, "rgba(192, 216, 220, 0.30)");
            reflection.addColorStop(0.55, "rgba(50, 82, 100, 0.07)");
            reflection.addColorStop(1, "rgba(214, 184, 142, 0.24)");
            ctx.fillStyle = reflection;
            ctx.fillRect(x + inset, winY, winW, winH);

            if (blinds > 0) {
              const blindH = Math.round(winH * blinds);
              ctx.fillStyle = "rgba(212, 206, 192, 0.22)";
              ctx.fillRect(x + inset + 1, winY, winW - 2, blindH);
            }
            // 竖向副窗梃与铝合金明框
            ctx.fillStyle = "rgba(22, 36, 42, 0.55)";
            ctx.fillRect(x + 31, winY, 2, winH);
            ctx.strokeStyle = "rgba(176, 194, 198, 0.28)";
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + inset, winY, winW, winH);
          } else {
            // 窗洞深凹阴影、十字窗棂与外挑石质窗台
            ctx.fillStyle = "rgba(8, 19, 24, 0.55)";
            ctx.fillRect(x + inset, winY, winW, 4);
            ctx.fillRect(x + inset, winY, 3, winH);
            if (blinds > 0) {
              ctx.fillStyle = "rgba(220, 210, 190, 0.26)";
              ctx.fillRect(x + inset + 3, winY + 4, winW - 6, Math.round(winH * blinds));
            }
            ctx.fillStyle = kind === "brick" ? "#2d3538" : "#dcd6c6";
            ctx.fillRect(x + 31, winY + 2, 2, winH - 2);
            ctx.fillRect(x + inset + 2, winY + Math.round(winH * 0.42), winW - 4, 2);
            ctx.fillStyle = kind === "brick" ? "#b8aa96" : "#ccc6b6";
            ctx.fillRect(x + inset - 3, winY + winH, winW + 6, 4);
            ctx.fillStyle = "rgba(12, 18, 20, 0.32)";
            ctx.fillRect(x + inset - 2, winY + winH + 4, winW + 4, 2);
          }
        }
      }
    });
    const emissiveMap = canvasTexture(512, 1024, (ctx) => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 512, 1024);
      lit.forEach(({ on, blinds, warm }, index) => {
        if (!on) return;
        const col = index % 8;
        const row = Math.floor(index / 8);
        const x = col * 64;
        const y = row * 64;
        const inset = kind === "glass" ? 5 : 15;
        const winY = y + (kind === "glass" ? 13 : 14);
        const winW = 64 - inset * 2;
        const winH = kind === "glass" ? 46 : 36;
        const topColor = warm < 0.22 ? "#c2d4d8" : warm < 0.58 ? "#f4d6a8" : "#e3b582";
        const bottomColor = warm < 0.22 ? "#8daab2" : warm < 0.58 ? "#cf9f68" : "#b87f4c";
        const glow = ctx.createLinearGradient(x, winY, x, winY + winH);
        glow.addColorStop(0, topColor);
        glow.addColorStop(1, bottomColor);
        ctx.fillStyle = glow;
        ctx.fillRect(x + inset, winY, winW, winH);
        if (blinds > 0) {
          ctx.fillStyle = "rgba(25, 22, 18, 0.42)";
          ctx.fillRect(x + inset, winY, winW, Math.round(winH * blinds));
        }
        // 窗框暗格切分，让夜景灯光呈现真实室内分格感
        ctx.fillStyle = "#080c0e";
        ctx.fillRect(x + 31, winY, 2, winH);
        if (kind !== "glass") {
          ctx.fillRect(x + inset, winY + Math.round(winH * 0.42), winW, 2);
        }
      });
    });
    const value = new THREE.MeshStandardMaterial({
      color: "#ffffff", map, emissiveMap, emissive: "#ffe4b5", emissiveIntensity: 0.065,
      roughness: kind === "glass" ? 0.18 : 0.78, metalness: kind === "glass" ? 0.52 : 0.04,
    });
    value.userData.cityGlazing = kind === "glass";
    // 立面UV按实例实际米数铺设，十五米公寓与百米高楼保持同一楼层比例。
    value.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying float vWall;\nvarying vec3 vFacadeWorld;\n${shader.vertexShader}`.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vWall = 1.0 - abs(normal.y);
        #ifdef USE_INSTANCING
          vFacadeWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
        #else
          vFacadeWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        #endif
        #ifdef USE_INSTANCING
          vec3 facadeScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec2 repeats = vec2(abs(normal.x) > 0.5 ? facadeScale.z : facadeScale.x, facadeScale.y) / vec2(24.0, 51.2);
          vMapUv *= repeats;
          vEmissiveMapUv *= repeats;
        #endif`,
      );
      shader.fragmentShader = `varying float vWall;\nvarying vec3 vFacadeWorld;\n${shader.fragmentShader}`
        .replace("diffuseColor *= sampledDiffuseColor;", `diffuseColor *= mix(vec4(0.68, 0.70, 0.67, 1.0), sampledDiffuseColor, vWall);
          // 风化：雨水垂直污渍、勒脚泛潮与逐栋色差，避免立面像刚出厂的 CG 贴图。
          float facadeColumn = floor((vFacadeWorld.x + vFacadeWorld.z) * 1.7);
          float columnSeed = fract(sin(facadeColumn * 12.9898) * 43758.5453);
          float streak = smoothstep(0.62, 1.0, columnSeed) * (0.55 + 0.45 * sin(vFacadeWorld.y * 0.45 + columnSeed * 9.0));
          float plinth = 1.0 - smoothstep(0.6, 4.2, vFacadeWorld.y);
          vec2 lotCell = floor(vFacadeWorld.xz / 27.0);
          float lotTone = fract(sin(dot(lotCell, vec2(41.3, 289.1))) * 15731.743);
          float grime = (streak * 0.11 + plinth * 0.16) * vWall;
          diffuseColor.rgb *= (1.0 - grime) * mix(0.93, 1.05, lotTone);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.96, 0.95, 0.9), plinth * 0.5 * vWall);`)
        .replace("totalEmissiveRadiance *= emissiveColor.rgb;", "totalEmissiveRadiance *= emissiveColor.rgb * vWall;");
    };
    value.customProgramCacheKey = () => "city-facade-metres-v2";
    bindWorldScalePbr(value, facadeMaps[kind], kind === "glass" ? 24 : 4, kind === "glass" ? 51.2 : 4, kind === "glass" ? 0.28 : 0.45);
    if (kind === "glass") facadeInteriors.attach(value);
    materials.add(value);
    nightMaterials.push({ material: value, day: 0.055, night: 1.35 });
    return value;
  };
  const facades = {
    glass: [facade("glass", "#2b5670"), facade("glass", "#32636d"), facade("glass", "#244761")],
    stone: [facade("stone", "#cdbfa6"), facade("stone", "#bdb7ac"), facade("stone", "#d8cfbc")],
    brick: [facade("brick", "#97553f"), facade("brick", "#8c6550"), facade("brick", "#7e4636")],
  };

  // 紧凑高密度海岸岛屿基底，覆盖西侧观海别墅带 (x=-260) 与东侧电力/污水市政园区 (x=316)
  box(soil, 0, -2.2, -160, 860, 4, 580);
  box(grass, 28, 0.08, -57.5, 584, 0.12, 345);
  box(concrete, 120, -1.7, 114, 400, 3, 2.5);
  box(pavement, 120, 0.15, 107, 400, 0.3, 14);
  box(pavement, -152.5, 0.15, 103, 145, 0.3, 6);
  box(curb, -12, 0.27, 112, 136, 0.32, 1.1);
  box(curb, 132, 0.27, 112, 128, 0.32, 1.1);
  box(curb, 271, 0.27, 112, 98, 0.32, 1.1);

  const signalIntersections: { x: number; z: number }[] = [];
  const roadNodes = new Map<string, { x: number; z: number; directions: { x: number; z: number }[] }>();
  for (const road of ROAD_SEGMENTS) {
    const horizontal = road.z1 === road.z2;
    const length = Math.hypot(road.x2 - road.x1, road.z2 - road.z1);
    const x = (road.x1 + road.x2) / 2, z = (road.z1 + road.z2) / 2;
    // 路床略宽于沥青，两侧抬起人行道，路缘石比路面高出约 8 厘米。
    box(curb, x, 0.22, z, horizontal ? length : 11.35, 0.24, horizontal ? 11.35 : length);
    box(asphalt, x, 0.38, z, horizontal ? length : 11, 0.08, horizontal ? 11 : length);
    if (length > 18) {
      const walkLength = Math.max(0.6, length - 16);
      for (const side of [-1, 1]) {
        const lateral = side * 6.7;
        box(
          pavement,
          horizontal ? x : x + lateral,
          0.42,
          horizontal ? z + lateral : z,
          horizontal ? walkLength : 2.15,
          0.16,
          horizontal ? 2.15 : walkLength,
        );
        box(
          curb,
          horizontal ? x : x + side * 5.58,
          0.47,
          horizontal ? z + side * 5.58 : z,
          horizontal ? walkLength : 0.22,
          0.12,
          horizontal ? 0.22 : walkLength,
        );
      }
    }
    // 写实双黄中心线与两侧车道白虚线
    if (length > 20) {
      box(roadYellow, x, 0.432, z, horizontal ? length - 14 : 0.16, 0.024, horizontal ? 0.16 : length - 14);
    }
    for (let offset = 10; offset < length - 8; offset += 8) {
      for (const laneSide of [-2.65, 2.65]) {
        box(
          roadLine,
          road.x1 + (horizontal ? offset : laneSide),
          0.435,
          road.z1 + (horizontal ? laneSide : offset),
          horizontal ? 3.2 : 0.12,
          0.025,
          horizontal ? 0.12 : 3.2,
        );
      }
    }
    for (const end of [0, 1]) {
      const px = end ? road.x2 : road.x1, pz = end ? road.z2 : road.z1;
      const key = `${px}:${pz}`;
      const node = roadNodes.get(key) ?? { x: px, z: pz, directions: [] };
      node.directions.push({ x: horizontal ? end ? -1 : 1 : 0, z: horizontal ? 0 : end ? -1 : 1 });
      roadNodes.set(key, node);
    }
  }
  for (const node of roadNodes.values()) {
    if (node.directions.length < 2) continue;
    box(asphalt, node.x, 0.4, node.z, 15.5, 0.09, 15.5);
    part(darkRoof, cylinderGeometry, node.x + 1.35, 0.455, node.z - 0.8, 0.58, 0.025, 0.58);
    part(metal, cylinderGeometry, node.x + 1.35, 0.47, node.z - 0.8, 0.16, 0.02, 0.16);
    if (node.directions.length >= 3) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        box(pavement, node.x + sx * 6.7, 0.43, node.z + sz * 6.7, 2.35, 0.16, 2.35);
      }
    }
    if (node.directions.length < 3) continue;
    signalIntersections.push({ x: node.x, z: node.z });
    for (const direction of node.directions) {
      // 斑马线与机动车停止线
      box(
        roadLine,
        node.x + direction.x * 8.4,
        0.456,
        node.z + direction.z * 8.4,
        direction.x ? 0.32 : 9.6,
        0.025,
        direction.x ? 9.6 : 0.32,
      );
      for (let i = -3; i <= 3; i++) {
        box(roadLine, node.x + direction.x * 6.8 + direction.z * i * 1.2, 0.457, node.z + direction.z * 6.8 + direction.x * i * 1.2, direction.x ? 2 : 0.55, 0.025, direction.x ? 0.55 : 2);
      }
    }
    // 十字/丁字路口交通信号灯杆与人行护栏柱
    if (node.directions.length >= 3) {
      box(metal, node.x + 6.4, 2.9, node.z + 6.4, 0.16, 5.4, 0.16);
      box(metal, node.x + 4.3, 5.45, node.z + 6.4, 4.2, 0.14, 0.14);
      box(darkRoof, node.x + 2.8, 5.38, node.z + 6.4, 1.25, 0.36, 0.32);
    }
  }
  const lampSpots: { x: number; y: number; z: number }[] = [];
  const streetLamp = (x: number, z: number, turn = 1, y = 0) => {
    lampSpots.push({ x: x + turn * 1.4, y, z });
    box(metal, x, 0.52 + y, z, 0.34, 0.45, 0.34);
    box(metal, x, 3.5 + y, z, 0.17, 7, 0.17);
    box(metal, x + turn * 0.75, 7 + y, z, 1.7, 0.16, 0.2);
    box(lamp, x + turn * 1.4, 6.92 + y, z, 0.9, 0.12, 0.4);
  };
  const trees = (["spreading", "upright", "conifer"] as const).map((form) => {
    const stem = createTreeTrunk(form), crown = createTreeCanopy(form);
    geometries.add(stem);
    geometries.add(crown);
    return { stem, crown };
  });
  const leafMap = canvasTexture(512, 512, paintLeafCluster);
  leafMap.wrapS = leafMap.wrapT = THREE.ClampToEdgeWrapping;
  const canopyMaterials = ["#d0d5a8", "#a7c393", "#a0b786", "#ddc282"].map((color) => {
    const material = new THREE.MeshStandardMaterial({
      color, map: leafMap, vertexColors: true, roughness: 0.92, alphaTest: 0.35, side: THREE.DoubleSide,
    });
    markCitySurface(material, "foliage");
    materials.add(material);
    return material;
  });
  // 反射环境仅供汽车使用，不改变建筑与天空；由画布生成，无外部 HDR 资源或网络请求。
  const vehicleEnvironment = canvasTexture(512, 256, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, "#536c85");
    sky.addColorStop(0.43, "#b8cbd4");
    sky.addColorStop(0.51, "#edf0e7");
    sky.addColorStop(0.55, "#737f78");
    sky.addColorStop(1, "#39403d");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 512, 256);
    for (let index = 0; index < 18; index++) {
      ctx.fillStyle = index % 3 ? "#697b83" : "#9caaa9";
      const height = 12 + (index % 5) * 5;
      ctx.fillRect(index * 31, 140 - height, 13 + (index % 3) * 4, height);
    }
  });
  vehicleEnvironment.mapping = THREE.EquirectangularReflectionMapping;
  const vehicleSurfaces = new Set<THREE.MeshStandardMaterial>();
  const carPaint = (color: THREE.ColorRepresentation): THREE.MeshPhysicalMaterial => {
    const material = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.26, metalness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.14,
      envMap: vehicleEnvironment, envMapIntensity: 0.85,
    });
    materials.add(material);
    vehicleSurfaces.add(material);
    return material;
  };
  // 深色着色玻璃：车窗与车身形成真实的明暗对比，而不是与车漆同亮度的浅蓝色块。
  const vehicleGlass = solid("#1b252c", 0.05, 0.72);
  vehicleGlass.envMap = vehicleEnvironment;
  vehicleGlass.envMapIntensity = 1.15;
  vehicleSurfaces.add(vehicleGlass);
  const vehicleTrim = solid("#23282b", 0.76, 0.06);
  const shells = {
    sedan: createVehicleShell("sedan"),
    hatchback: createVehicleShell("hatchback"),
    van: createVehicleShell("van"),
    suv: createVehicleShell("suv"),
    bus: createVehicleShell("bus"),
    truck: createVehicleShell("truck"),
  } satisfies Record<VehicleKind, VehicleShell>;
  Object.values(shells).forEach((shell) => {
    for (const geometry of [shell.body, shell.glass, shell.trim, shell.chrome]) geometries.add(geometry);
  });
  const { tire: tireGeometry, rim: rimGeometry } = createVehicleWheel();
  geometries.add(tireGeometry);
  geometries.add(rimGeometry);
  // 停放车辆单独成实例场（不进静态合批）：CC0 车型加载后整体重建为模型车壳 + 新轮位。
  type ParkedVehicle = { kind: VehicleKind; color: THREE.Color; x: number; z: number; rot: number };
  const parkedVehicles: ParkedVehicle[] = [];
  const placeVehicle = (shell: VehicleShell, material: THREE.Material, px: number, pz: number, rot: number) => {
    const kind = (Object.keys(shells) as VehicleKind[]).find((key) => shells[key] === shell) ?? "sedan";
    const color = material instanceof THREE.MeshStandardMaterial ? material.color.clone() : new THREE.Color(0xffffff);
    parkedVehicles.push({ kind, color, x: px, z: pz, rot });
  };
  // 树木不进入静态合批：由 TreeField 以实例场绘制，加载模型后切换为两级细节的写实树。
  const treePlacements: TreePlacement[] = [];
  const tree = (x: number, z: number, size = 1, shade = 0, y = 0) => {
    const variant = THREE.MathUtils.euclideanModulo(Math.floor(shade), 4);
    part(soil, cylinderGeometry, x, y + 0.03, z, 1.05 * size, 0.04, 0.95 * size);
    treePlacements.push({ x, y, z, size, yaw: shade * 0.9, variant });
  };
  for (const [index, road] of ROAD_SEGMENTS.entries()) {
    const length = Math.hypot(road.x2 - road.x1, road.z2 - road.z1);
    if (length < 22) continue;
    const horizontal = road.z1 === road.z2;
    const x = (road.x1 + road.x2) / 2, z = (road.z1 + road.z2) / 2;
    for (const side of [-1, 1]) {
      const px = x + (horizontal ? 0 : side * 7.3), pz = z + (horizontal ? side * 7.3 : 0);
      tree(px, pz, 0.72, index % 4);
      if (side === 1) streetLamp(px + (horizontal ? 5 : 0), pz + (horizontal ? 0 : 5), -1);
    }
  }
  for (let x = -210; x <= 210; x += 14) {
    const pavilionClearance = Math.abs(Math.abs(x) - 95) < 12;
    const cruiseClearance = Math.abs(x - 48) < 20;
    const portClearance = x > 196;
    if (!pavilionClearance && !cruiseClearance && !portClearance) {
      tree(x, x < -80 ? 99 : 102, 0.95, Math.abs(x) % 4);
      streetLamp(x + 6, x < -80 ? 104 : 110, -1);
    }
    if (x < -73 || cruiseClearance || portClearance) continue;
    box(metal, x, 0.9, 112.2, 0.14, 1.6, 0.14);
    box(metal, x, 1.65, 112.2, 14, 0.12, 0.12);
    box(railMetal, x, 1.15, 112.2, 14, 0.06, 0.06);
    if (Math.abs(x) % 28 === 0) {
      box(lamp, x, 1.78, 112.2, 0.24, 0.14, 0.24);
    }
  }

  let buildingCount = 0;
  // 街层商铺：帆布遮阳篷、店招灯箱与橱窗，颜色取自真实街景的低饱和色。
  const awnings = ["#7a3b33", "#2f4b5c", "#5d6b3a", "#8a6a3a", "#3d3f44"].map((tone) => solid(tone, 0.9, 0.02));
  // 店招灯箱：白天是低饱和面板，夜间点亮为霓虹色（对应夜景概念图的街面霓虹）。
  const signNeon = ["#ffd9a0", "#38d9ff", "#ff4f8b", "#6dffb0"];
  const signBoards = ["#e9e3d3", "#2d3338", "#b8402f", "#1f4f46"].map((tone, index) => {
    const material = solid(tone, 0.55, 0.08);
    material.emissive.set(signNeon[index]);
    nightMaterials.push({ material, day: 0, night: index === 0 ? 0.9 : 1.7 });
    return material;
  });
  const shopfront = (x: number, z: number, frontage: number, seed: number, id?: PlaceId) => {
    const awning = awnings[seed % awnings.length];
    const sign = signBoards[(seed >> 1) % signBoards.length];
    box(glass, x, 1.75, z + 0.1, frontage - 0.5, 2.3, 0.14, id);
    box(metal, x, 0.62, z + 0.14, frontage - 0.3, 0.32, 0.18, id);
    for (const side of [-1, 1]) box(metal, x + side * (frontage / 2 - 0.2), 1.75, z + 0.16, 0.12, 2.5, 0.16, id);
    box(sign, x, 3.32, z + 0.18, frontage - 0.4, 0.62, 0.16, id);
    part(awning, boxGeometry, x, 2.9, z + 0.85, frontage - 0.3, 0.06, 1.55, id, 0, 0);
    box(awning, x, 2.62, z + 1.6, frontage - 0.3, 0.42, 0.04, id);
  };
  const rooftop = (x: number, z: number, w: number, d: number, height: number, id?: PlaceId) => {
    // 挑檐压顶线脚与女儿墙盖板
    box(lightStone, x, height - 0.12, z, w + 0.55, 0.26, d + 0.55, id);
    box(paleRoof, x, height + 0.28, z, w + 0.35, 0.55, d + 0.35, id);
    for (const dx of [-w / 2, w / 2]) {
      box(concrete, x + dx, height + 0.72, z, 0.35, 0.92, d, id);
      box(lightStone, x + dx, height + 1.22, z, 0.45, 0.14, d + 0.2, id);
    }
    for (const dz of [-d / 2, d / 2]) {
      box(concrete, x, height + 0.72, z + dz, w, 0.92, 0.35, id);
      box(lightStone, x, height + 1.22, z + dz, w + 0.2, 0.14, 0.45, id);
    }
    // 电梯机房与百叶通风冷却机组
    const mechW = Math.max(2.2, w * 0.27);
    const mechD = Math.max(2.2, d * 0.22);
    box(darkRoof, x + w * 0.19, height + 1.15, z + d * 0.14, mechW, 1.5, mechD, id);
    box(lightStone, x + w * 0.19, height + 1.95, z + d * 0.14, mechW + 0.25, 0.15, mechD + 0.25, id);
    box(railMetal, x - w * 0.21, height + 0.8, z - d * 0.19, w * 0.22, 0.6, d * 0.24, id);
    part(darkRoof, cylinderGeometry, x - w * 0.21, height + 1.12, z - d * 0.19, Math.min(w, d) * 0.065, 0.08, Math.min(w, d) * 0.065, id);
    if (w >= 13 && d >= 13) {
      // 屋顶采光天窗或光伏阵列板
      for (const row of [-0.18, 0.06]) {
        box(glass, x - w * 0.16, height + 0.68, z + d * row, w * 0.28, 0.12, 1.15, id);
      }
    }
    // 屋顶水箱（带支腿）与通信天线：按楼体尺寸散列放置，补足天际线的小尺度杂物。
    const roofSeed = Math.abs(Math.round(x * 13 + z * 7)) % 4;
    if (roofSeed !== 3 && w > 9 && d > 9) {
      const tx = x - w * 0.24, tz = z + d * 0.24;
      for (const lx of [-0.75, 0.75]) for (const lz of [-0.75, 0.75]) box(metal, tx + lx, height + 1.2, tz + lz, 0.12, 1.4, 0.12, id);
      part(roofSeed === 0 ? trunk : railMetal, cylinderGeometry, tx, height + 2.75, tz, 1.15, 1.9, 1.15, id);
      part(darkRoof, coneGeometry, tx, height + 3.95, tz, 1.2, 0.5, 1.2, id);
    }
    if (roofSeed === 1 || roofSeed === 2) {
      box(railMetal, x + w * 0.3, height + 2.4, z - d * 0.3, 0.08, 3.6, 0.08, id);
      box(railMetal, x + w * 0.3, height + 3.4, z - d * 0.3, 0.9, 0.05, 0.05, id);
      box(railMetal, x + w * 0.3, height + 2.9, z - d * 0.3, 0.6, 0.05, 0.05, id);
    }
    if (height > 42) {
      box(metal, x - w * 0.25, height + 3.5, z + d * 0.28, 0.14, 7, 0.14, id);
      box(lamp, x - w * 0.25, height + 7.1, z + d * 0.28, 0.28, 0.32, 0.28, id);
    }
  };
  const building = (lot: Building, variant: number) => {
    buildingCount++;
    const { x, z, width: w, depth: d, height: h, id, style } = lot;
    // 应用地标由独立机构模型接管；住宅及公共建筑继续使用城市静态批次。
    if (id && getBuildingExperience(id)) {
      anchors.set(id, new THREE.Vector3(x, h + 8, z));
      return;
    }
    const type = style === "glass" ? "glass" : style === "brick" ? "brick" : "stone";
    const face = facades[type][variant % facades[type].length];
    box(pavement, x, 0.38, z, w + 1.2, 0.25, d + 1.2, id);
    box(lightStone, x, 0.68, z, w + 0.45, 0.38, d + 0.45, id);
    const body = (bx: number, bz: number, bw: number, bd: number, bh: number, base = 0.55) => {
      box(face, bx, base + bh / 2, bz, bw, bh, bd, id);
      rooftop(bx, bz, bw, bd, base + bh, id);
    };
    let roofHeight = h + 0.55;
    if (style === "terrace" && variant % 2 === 0) {
      // 非应用楼的三层退台住宅保留屋顶花园。
      for (let tier = 0; tier < 3; tier++) {
        const tw = w * (1 - tier * 0.2);
        const td = d * (1 - tier * 0.18);
        const th = h / 3;
        const baseH = 0.5 + tier * th;
        body(x - tier * w * 0.035, z - tier * d * 0.035, tw, td, th, baseH);
        box(lightStone, x - tier * w * 0.035, baseH + th, z - tier * d * 0.035, tw + 0.65, 0.35, td + 0.65, id);
        box(turf, x - tier * w * 0.035, baseH + th + 0.6, z + td * 0.36, tw * 0.76, 0.22, 2.6, id);
        box(railMetal, x - tier * w * 0.035, baseH + th + 1.05, z + td * 0.48, tw * 0.82, 0.12, 0.12, id);
        for (let i = 0; i < 3; i++) tree(x + (i - 1) * tw * 0.3, z + td * 0.38, 0.48, i, 1 + (tier + 1) * th);
      }
    } else if (id === "slot-8") {
      // 08 技术手稿馆：底层基座纳入城市静态拾取，整栋高精 3D 钢构展馆、室内微缩模型与观光电梯由 buildArchiveTower3D 独立精细建模
      box(concrete, x, 0.52, z, w + 2.4, 0.36, d + 2.4, id);
      roofHeight = h + 5.5;
    } else if ((variant % 11 === 0 || variant % 13 === 0) && h > 25) {
      body(x, z, w, d, 4.2);
      part(facades.glass[variant % 3], roundTowerGeometry, x, 4.2 + (h - 4.2) / 2, z, w * 0.97, h - 4.2, d * 0.97, id);
      part(paleRoof, cylinderGeometry, x, h + 0.3, z, w * 0.5, 0.6, d * 0.5, id);
      part(glass, cylinderGeometry, x, h + 2, z, w * 0.26, 3, d * 0.26, id);
      box(metal, x, h + 4.7, z, 0.15, 5.3, 0.15, id);
      roofHeight = h + 7.5;
    } else if (variant % 8 === 0 && h > 30) {
      body(x - w * 0.24, z, w * 0.49, d, h);
      body(x + w * 0.28, z - d * 0.08, w * 0.39, d * 0.83, h * 0.81);
      box(glass, x, h * 0.56, z, w * 0.35, 3.2, d * 0.48, id);
    } else if (variant % 8 === 1) {
      body(x, z, w, d, h * 0.78);
      body(x - w * 0.11, z - d * 0.08, w * 0.75, d * 0.72, h * 0.22, h * 0.78);
    } else if (variant % 8 === 2) {
      body(x - w * 0.17, z, w * 0.66, d, h);
      body(x + w * 0.32, z - d * 0.24, w * 0.32, d * 0.53, h * 0.62);
    } else if (variant % 8 === 3 && h > 32) {
      body(x, z, w, d, 6.4);
      body(x, z, w * 0.74, d * 0.76, h - 6.4, 6.4);
      for (let floor = 9.6; floor < h; floor += 6.4) box(lightStone, x, floor, z, w * 0.78, 0.35, d * 0.8, id);
    } else if (variant % 8 === 4) {
      body(x, z, w, d, h);
      for (let floor = 4; floor < h; floor += 3.2) {
        box(concrete, x, floor, z + d / 2 + 0.6, w * 0.87, 0.26, 1.3, id);
        box(railMetal, x, floor + 0.6, z + d / 2 + 1.1, w * 0.88, 0.08, 0.1, id);
      }
    } else if (variant % 8 === 5 && type === "glass") {
      body(x, z, w, d, h * 0.7);
      body(x, z, w * 0.84, d * 0.83, h * 0.22, h * 0.7);
      body(x, z, w * 0.61, d * 0.61, h * 0.08, h * 0.92);
      part(metal, coneGeometry, x, h + 3, z, w * 0.31, 5, d * 0.31, id);
      roofHeight = h + 5.8;
    } else {
      body(x, z, w, d, h);
      if (variant % 8 === 6) {
        for (let i = -1; i <= 1; i++) box(lightStone, x + i * w * 0.33, h / 2, z + d / 2, 0.65, h, 0.8, id);
        box(lightStone, x, h + 1.4, z, w + 1.1, 1.2, d + 1.1, id);
      }
    }
    if (!id && h > 9 && h < 20) {
      const floors = Math.max(2, Math.round(h / 3.2));
      for (let floor = 2; floor < floors; floor++) {
        const fy = 0.7 + floor * 3.15;
        if (variant % 8 !== 4) {
          const balconyW = Math.min(w * 0.78, 8.5);
          box(concrete, x, fy, z + d / 2 + 0.48, balconyW, 0.1, 0.95);
          box(railMetal, x, fy + 0.48, z + d / 2 + 0.9, balconyW, 0.045, 0.045);
          for (const side of [-1, 1]) box(railMetal, x + side * balconyW * 0.5, fy + 0.26, z + d / 2 + 0.9, 0.045, 0.48, 0.045);
        }
        box(metal, x + w * 0.32, fy + 0.42, z + d / 2 + 0.08, 0.62, 0.38, 0.32);
      }
      box(metal, x - w / 2 - 0.06, 0.55 + h * 0.42, z + d / 2 - 0.2, 0.07, h * 0.7, 0.07);
    }
    if (!id && style !== "glass") {
      const frontage = Math.min(5.2, (w - Math.min(w * 0.42, 5.4)) / 2 - 0.8);
      if (frontage > 2.4) {
        for (const side of [-1, 1]) shopfront(x + side * (w / 2 - frontage / 2 - 0.4), z + d / 2 + 0.02, frontage, variant * 3 + (side > 0 ? 1 : 0));
      }
    }
    if (id !== "slot-8") {
      // 街层精装大堂门厅：透光旋转门厅、暖色迎宾灯带、立柱雨篷与两侧迎宾绿植池
      const lobbyW = Math.min(w * 0.42, 5.4);
      const canopyW = Math.min(w * 0.52, 7.4);
      box(glass, x, 2.2, z + d / 2 + 0.12, lobbyW, 3.2, 0.26, id);
      box(lamp, x, 3.55, z + d / 2 + 0.26, lobbyW * 0.82, 0.16, 0.24, id);
      box(darkRoof, x, 3.92, z + d / 2 + 0.82, canopyW, 0.26, 2.1, id);
      box(lightStone, x, 4.08, z + d / 2 + 0.88, canopyW + 0.2, 0.12, 2.2, id);
      for (const side of [-1, 1]) {
        box(lightStone, x + side * (lobbyW / 2 + 0.22), 2.2, z + d / 2 + 0.2, 0.32, 3.3, 0.36, id);
        box(concrete, x + side * (canopyW / 2 + 0.55), 0.72, z + d / 2 + 0.8, 1.1, 0.52, 1.1, id);
        box(leaves[1], x + side * (canopyW / 2 + 0.55), 1.12, z + d / 2 + 0.8, 0.88, 0.45, 0.88, id);
      }
    }
    if (id) anchors.set(id, new THREE.Vector3(x, roofHeight + 3, z));
  };
  cityLots.forEach((lot, index) => building(lot, index));

  // 每个小办公楼带口袋广场，办公与现代高层住宅、泳池别墅区、商业综合体在三个城区交错分布。
  for (const lot of cityLots) {
    if (lot.width > 20) continue;
    box(turf, lot.x, 0.3, lot.z, 29, 0.18, 29);
    box(lightStone, lot.x, 0.42, lot.z, 29.3, 0.12, 29.3);
    box(pavement, lot.x + 11, 0.42, lot.z + 1, 2.6, 0.1, 24);
    box(pavement, lot.x, 0.42, lot.z + 10.5, 26, 0.1, 2.8);
    tree(lot.x + 10.5, lot.z - 10, 0.9, 0);
    tree(lot.x - 10, lot.z + 10, 0.9, 2);
    tree(lot.x - 10.5, lot.z - 9.5, 0.76, 1);
    box(trunk, lot.x + 10, 0.95, lot.z + 4, 0.55, 0.24, 3.2);
    box(trunk, lot.x - 4.5, 0.95, lot.z + 11.8, 3.0, 0.24, 0.55);
    for (const bz of [-3, 8]) {
      box(metal, lot.x + 9.4, 0.72, lot.z + bz, 0.18, 0.65, 0.18);
      box(lamp, lot.x + 9.4, 1.12, lot.z + bz, 0.24, 0.22, 0.24);
    }
  }

  const baseKit = {
    group,
    geometries,
    materials,
    nightMaterials,
    box,
    part,
    beam,
    tree,
    solid,
    canvasTexture,
    vehicle: (kind: VehicleKind, material: THREE.Material, x: number, z: number) => {
      placeVehicle(shells[kind], material, x, z, 0);
      return shells[kind];
    },
    parkVehicle: (kind: "sedan" | "suv" | "truck", colorHex: string, px: number, pz: number, rotY: number) => {
      // 路边停车按位置散列混入两厢车与面包车，避免整排同款轿车。
      const slot = Math.abs(Math.round(px * 7.3 + pz * 3.1)) % 5;
      const parked: VehicleKind = kind === "sedan" ? (slot === 0 || slot === 3 ? "hatchback" : slot === 4 ? "van" : "sedan") : kind;
      placeVehicle(shells[parked], solid(colorHex, 0.28, 0.35), px, pz, rotY);
    },
  };

  const architectureStart = group.children.length;
  const architecture = buildDetailedArchitecture(baseKit, detailBudget);
  const residentialSummary = architecture.summary;
  group.children.slice(architectureStart).forEach(root => root.traverse(object => {
    if (object instanceof THREE.Mesh && ![object.material].flat().every(material => material.transparent)) pickables.push(object);
  }));
  const housingMaterials = residentialSummary.housingMaterials;
  const houseCount = residentialSummary.apartmentCount + residentialSummary.villaCount;
  const shopCount = residentialSummary.commercialCount;
  buildingCount += residentialSummary.totalBuildings;

  const terrainHeight = (x: number, z: number) => {
    const rise = THREE.MathUtils.smoothstep(-z, 225, 480);
    return rise * (34 + 16 * Math.sin(x * 0.008 + z * 0.003) + 12 * Math.cos(z * 0.014)) - 0.15;
  };
  // 城区外围生态林带（避让西海岸泳池别墅特区 x∈[-258,-216] 与东侧发电/污水市政基地 x∈[220,316]）
  const woodlandPatches = [
    { x: -189, z: -222, radius: 24 }, { x: -131, z: -279, radius: 40 },
    { x: -42, z: -259, radius: 27 }, { x: 114, z: -263, radius: 30 },
    { x: -164, z: -372, radius: 40 }, { x: -41, z: -352, radius: 44 },
    { x: 76, z: -365, radius: 35 }, { x: 211, z: -281, radius: 38 },
  ];
  for (const [index, patch] of woodlandPatches.entries()) {
    for (let i = 0; i < 22; i++) {
      const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * patch.radius;
      const x = patch.x + Math.cos(angle) * distance, z = patch.z + Math.sin(angle) * distance;
      if (z < -405 || (z > -216 && x > -82)) continue;
      tree(x, z, 0.9 + random() * 0.85, index + i, Math.max(0, terrainHeight(x, z)));
      if (i % 3 === 0) part(canopyMaterials[(index + 1) % 4], trees[0].crown, x + 2.4, terrainHeight(x + 2.4, z - 1.5) - 0.3, z - 1.5, 0.36, 0.17, 0.28);
    }
  }
  for (const field of [{ x: -112, z: -225, w: 23, d: 17 }, { x: 8, z: -287, w: 25, d: 15 }, { x: 165, z: -247, w: 21, d: 18 }]) {
    const fieldGeometry = new THREE.PlaneGeometry(field.w, field.d, 12, 8);
    fieldGeometry.rotateX(-Math.PI / 2);
    const positions = fieldGeometry.getAttribute("position");
    for (let i = 0; i < positions.count; i++)
      positions.setY(i, Math.max(0.15, terrainHeight(field.x + positions.getX(i), field.z + positions.getZ(i))) + 0.05);
    fieldGeometry.computeVertexNormals();
    geometries.add(fieldGeometry);
    const patch = new THREE.Mesh(fieldGeometry, soil);
    patch.position.set(field.x, 0, field.z);
    patch.receiveShadow = true;
    group.add(patch);
    for (let row = 0; row < 6; row++) for (let plant = 0; plant < 18; plant++) {
      const x = field.x - field.w * 0.43 + plant * field.w * 0.05;
      const z = field.z - field.d * 0.4 + row * field.d * 0.16;
      part(canopyMaterials[row % 3], trees[0].crown, x, Math.max(0.15, terrainHeight(x, z)) - 0.15, z, 0.11, 0.07, 0.09);
    }
  }
  for (let i = 0; i < 42; i++) {
    const side = i % 2 ? -1 : 1;
    const tx = side < 0 ? -(262 + random() * 24) : 316 + random() * 24;
    tree(tx, -168 + random() * 250, 0.9 + random() * 0.5, i);
  }
  group.userData.houseCount = houseCount;
  group.userData.shopCount = shopCount;
  group.userData.districts = districts.map(({ id, name, center }) => ({ id, name, center }));

  const billboardTexture = canvasTexture(2048, 672, (ctx) => {
    const background = ctx.createLinearGradient(0, 0, 2048, 672);
    background.addColorStop(0, "#263034");
    background.addColorStop(0.55, "#11191e");
    background.addColorStop(1, "#1d2529");
    ctx.fillStyle = background; ctx.fillRect(0, 0, 2048, 672);
    ctx.strokeStyle = "#a58160"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(100, 132); ctx.lineTo(1948, 132); ctx.stroke();
    ctx.fillStyle = "#d6b490"; ctx.font = "26px monospace"; ctx.textAlign = "left";
    ctx.fillText("A PERSONAL CITY", 100, 92);
    ctx.textAlign = "right"; ctx.fillText("EST. 2026 / VOL. 01", 1948, 92);
    ctx.textAlign = "center"; ctx.fillStyle = "#f3eee2";
    ctx.font = "900 416px Arial, sans-serif";
    ctx.fillText("SN0VV", 1024, 490);
    ctx.fillStyle = "#d6b490"; ctx.font = "26px monospace";
    ctx.textAlign = "left"; ctx.fillText("IDEAS LIVE HERE.", 100, 603);
    ctx.textAlign = "right"; ctx.fillText("CODE / CREATE / EXPLORE", 1948, 603);
  });
  const billboardMaterial = new THREE.MeshStandardMaterial({
    map: billboardTexture, emissiveMap: billboardTexture, emissive: "#ffffff",
    emissiveIntensity: 0.14, roughness: 0.48, metalness: 0.12,
  });
  materials.add(billboardMaterial);
  nightMaterials.push({ material: billboardMaterial, day: 0.14, night: 0.85 });
  const signGeometry = new THREE.PlaneGeometry(61, 21);
  geometries.add(signGeometry);
  const sign = new THREE.Mesh(signGeometry, billboardMaterial);
  sign.position.set(-25, 22, 111.5);
  sign.userData.place = "quant";
  group.add(sign); pickables.push(sign);
  const billboardMetal = solid("#30383b", 0.34, 0.65);
  const billboardCopper = solid("#b28a60", 0.4, 0.45);
  // 层叠金属框与前置画面留出真实厚度；承重支脚仍贴着步道边缘。
  box(billboardMetal, -25, 22, 110.1, 62.8, 22.8, 1.8, "about");
  box(billboardCopper, -25, 22, 111.12, 62.2, 22.2, 0.28, "about");
  box(billboardMetal, -25, 22, 111.29, 61.5, 21.5, 0.06, "about");
  box(lamp, -25, 11.48, 111.35, 59.6, 0.1, 0.12, "about");
  for (const x of [-45, -5]) {
    box(billboardMetal, x, 6, 110.6, 1.15, 11.6, 1.15, "about");
    box(billboardCopper, x, 1.15, 110.6, 1.45, 0.4, 1.45, "about");
    box(concrete, x, 0.6, 110.6, 2.4, 1.2, 2.4, "about");
  }
  anchors.set("about", new THREE.Vector3(-25, 36, 111.4));

  const publicBuilding = (id: "news" | "guestbook", x: number, title: string) => {
    // 滨海文化驿站：石质台基、古典壁柱、分格暖光橱窗与铜金压顶招牌
    box(concrete, x, 0.42, 105.4, 17.6, 0.35, 9.6, id);
    box(lightStone, x, 3.35, 105, 16, 5.8, 8, id);
    box(glass, x, 2.85, 109.08, 13.4, 4.5, 0.22, id);
    box(lamp, x, 4.65, 108.9, 12.2, 0.22, 0.25, id);
    for (const px of [-6.8, -3.4, 0, 3.4, 6.8]) {
      box(lightStone, x + px, 3.15, 109.12, 0.42, 5.4, 0.38, id);
    }
    box(darkRoof, x, 6.45, 105, 18, 0.5, 9.5, id);
    box(billboardCopper, x, 6.82, 105, 18.3, 0.22, 9.8, id);
    box(orange, x, 5.7, 109.32, 15.2, 0.82, 0.36, id);
    box(billboardMetal, x, 8.1, 106.82, 13.1, 2.75, 0.28, id);
    box(billboardCopper, x, 8.1, 106.92, 12.85, 2.55, 0.14, id);
    for (const lx of [-4.2, 4.2]) {
      box(lamp, x + lx, 9.55, 107.18, 0.9, 0.14, 0.26, id);
      box(concrete, x + lx * 1.75, 0.78, 109.7, 1.1, 0.55, 1.1, id);
      box(leaves[1], x + lx * 1.75, 1.18, 109.7, 0.88, 0.45, 0.88, id);
    }
    const texture = canvasTexture(1024, 192, (ctx) => {
      const bg = ctx.createLinearGradient(0, 0, 1024, 192);
      bg.addColorStop(0, "#233134");
      bg.addColorStop(0.5, "#152024");
      bg.addColorStop(1, "#202d30");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 192);
      ctx.strokeStyle = "#b8936d"; ctx.lineWidth = 3;
      ctx.strokeRect(18, 18, 988, 156);
      ctx.strokeStyle = "rgba(245, 227, 199, 0.28)"; ctx.lineWidth = 1;
      ctx.strokeRect(26, 26, 972, 140);
      ctx.fillStyle = "#d6b490"; ctx.font = "600 20px monospace";
      ctx.textAlign = "left"; ctx.fillText(id === "news" ? "SEASIDE EDITION" : "COASTAL POST", 48, 56);
      ctx.textAlign = "right"; ctx.fillText(id === "news" ? "NO. 02" : "NO. 03", 976, 56);
      ctx.fillStyle = "#f5e8d0"; ctx.font = "bold 74px Georgia, Arial, sans-serif";
      ctx.textAlign = "center"; ctx.fillText(title, 512, 134);
    });
    const material = new THREE.MeshBasicMaterial({ map: texture });
    materials.add(material);
    const geometry = new THREE.PlaneGeometry(12.5, 2.35);
    geometries.add(geometry);
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(x, 8.1, 107.02); panel.userData.place = id;
    group.add(panel); pickables.push(panel);
    anchors.set(id, new THREE.Vector3(x, 11, 104.5));
    buildingCount++;
  };
  publicBuilding("news", -95, "THE CITY PRESS");
  publicBuilding("guestbook", 95, "LETTERS TO SN0VV");

  // 写实多层次海洋着色器：近岸翡翠浅滩、深海蔚蓝渐变、浪峰白沫与阳光碎金反射
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
    vertexShader: `varying vec3 vWorld; varying vec3 vView;
      #include <fog_pars_vertex>
      void main() { vec4 world = modelMatrix * vec4(position, 1.0); vWorld = world.xyz;
        vView = cameraPosition - world.xyz; vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float uTime; uniform float uNight; varying vec3 vWorld; varying vec3 vView;
      #include <fog_pars_fragment>
      void main() {
        float waveA = sin(vWorld.x * 0.14 + vWorld.z * 0.38 + sin(vWorld.x * 0.025) * 2.2 + uTime * 1.05);
        float waveB = sin(vWorld.x * 0.21 + vWorld.z * 0.58 + sin(vWorld.z * 0.021 + vWorld.x * 0.034) * 3.1 + uTime * 1.3);
        float waveC = sin(vWorld.x * 0.032 + vWorld.z * 0.075 + waveA * 0.35 + uTime * 0.45);
        vec3 normal = normalize(vec3(waveA * 0.018 + waveC * 0.008, 1.0, waveB * 0.026));
        vec3 view = normalize(vView);
        float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 2.8);
        float shallows = 1.0 - smoothstep(110.0, 290.0, vWorld.z);
        float shoreFoam = smoothstep(0.68, 0.96, waveA * 0.5 + waveB * 0.5) * (1.0 - smoothstep(110.0, 175.0, vWorld.z));
        vec3 deepWater = vec3(0.022, 0.19, 0.34);
        vec3 shallowWater = vec3(0.065, 0.43, 0.48);
        vec3 day = mix(deepWater, shallowWater, shallows);
        day = mix(day, vec3(0.44, 0.67, 0.80), fresnel * 0.82);
        day += (waveA * 0.005 + waveB * 0.004 + waveC * 0.006);
        day = mix(day, vec3(0.92, 0.96, 0.95), shoreFoam * 0.38);
        vec3 lightDir = normalize(vec3(-0.48, 0.38, 0.68));
        float sunlight = pow(max(dot(reflect(-lightDir, normal), view), 0.0), 110.0);
        day += vec3(1.0, 0.78, 0.46) * sunlight * 1.15;
        vec3 nightColor = mix(vec3(0.010, 0.035, 0.085), vec3(0.09, 0.20, 0.34), fresnel) + waveA * 0.005;
        nightColor += vec3(0.45, 0.62, 0.88) * sunlight * 0.35;
        gl_FragColor = vec4(mix(day, nightColor, uNight), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
  waterMaterial.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, waterMaterial.uniforms]);
  materials.add(waterMaterial);
  const waterGeometry = new THREE.PlaneGeometry(1350, 880);
  geometries.add(waterGeometry);
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2; water.position.set(20, -0.65, 540); group.add(water);

  // 丘陵与林带共享米制高度场，树根和农田实际落在坡面上。
  for (let i = 0; i < 52; i++) {
    const x = -250 + random() * 500;
    const z = -222 - random() * 95;
    tree(x, z, 1.05 + random() * 1.15, i, terrainHeight(x, z));
  }
  const terrainGeometry = new THREE.PlaneGeometry(960, 420, 48, 22);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.getAttribute("position");
  const terrainColors: number[] = [];
  const terrainLow = new THREE.Color("#4d6a3f");
  const terrainHigh = new THREE.Color("#6f7d52");
  for (let index = 0; index < terrainPositions.count; index++) {
    const x = terrainPositions.getX(index);
    const z = terrainPositions.getZ(index) - 435;
    const elevation = terrainHeight(x, z);
    terrainPositions.setY(index, elevation);
    const color = terrainLow.clone().lerp(terrainHigh, Math.max(0, elevation / 60));
    terrainColors.push(color.r, color.g, color.b);
  }
  terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(terrainColors, 3));
  terrainGeometry.computeVertexNormals();
  geometries.add(terrainGeometry);
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  markCitySurface(terrainMaterial, "grass");
  applyCitySurface(terrainMaterial, "grass");
  materials.add(terrainMaterial);
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.position.z = -435; terrain.receiveShadow = true; group.add(terrain);

  // ==================== 社区生活场景 A：FRESH MART 鲜活生活超市 (西城 x=-120, z=81.5 & 东城 x=120, z=81.5) ====================
  const marketGreen = solid("#237a57", 0.45, 0.15);
  const marketRed = solid("#d94838", 0.55);
  const marketGold = solid("#f0be3c", 0.5);
  for (const mx of [-120, 120]) {
    // 超市主体建筑、全景落地玻璃门与绿金发光门头
    box(pavement, mx, 0.36, 82.5, 24, 0.22, 12);
    box(lightStone, mx, 3.1, 80.2, 21.5, 5.4, 7.2);
    box(marketGreen, mx, 5.2, 83.95, 22.2, 1.25, 0.65);
    box(lamp, mx, 5.2, 84.3, 19.5, 0.45, 0.12);
    box(glass, mx, 2.25, 83.85, 18.4, 3.6, 0.18);
    // 条纹遮阳棚与户外生鲜蔬果摊位（红苹果、黄柠檬、翠绿蔬菜箱）
    for (let stall = -2; stall <= 2; stall++) {
      const sx = mx + stall * 3.8;
      box(stall % 2 === 0 ? marketGreen : lightStone, sx, 3.85, 85.1, 3.6, 0.18, 2.2);
      if (stall !== 0) {
        box(trunk, sx, 0.85, 85.2, 2.8, 0.65, 1.35);
        box(marketRed, sx - 0.75, 1.28, 85.2, 0.75, 0.25, 0.95);
        box(marketGold, sx, 1.28, 85.2, 0.75, 0.25, 0.95);
        box(leaves[2], sx + 0.75, 1.28, 85.2, 0.75, 0.25, 0.95);
      }
    }
    // 超市门口手推车停放廊
    box(railMetal, mx - 9.2, 0.95, 86.2, 2.4, 0.9, 1.6);
  }

  // ==================== 社区生活场景 B：十字路口追尾撞车事故与交警勘查现场 (x=-73.8, z=69.5) ====================
  const crashCarRed = solid("#c83e32", 0.25, 0.45);
  const crashCarBlue = solid("#2e5d82", 0.25, 0.45);
  const policeBlue = solid("#1b3b5c", 0.28, 0.4);
  placeVehicle(shells.sedan, crashCarRed, -73.4, 67.6, 0.32);
  placeVehicle(shells.suv, crashCarBlue, -74.2, 71.4, -0.22);
  placeVehicle(shells.sedan, policeBlue, -77.4, 64.2, 0.52);
  // 事故现场橙白反光雪糕筒警戒圈
  for (const [cx, cz] of [[-76.2, 66.8], [-76.0, 69.2], [-75.8, 71.8], [-74.8, 74.2], [-72.2, 73.6], [-71.8, 66.2]] as const) {
    part(orange, coneGeometry, cx, 0.68, cz, 0.28, 0.65, 0.28);
    part(roadLine, cylinderGeometry, cx, 0.66, cz, 0.16, 0.14, 0.16);
  }

  // 公交候车亭、街边长椅与路侧停放车辆增加近景生活尺度。
  for (const x of [-160, -70, 25, 112]) {
    box(glass, x, 1.9, 103.1, 7, 3.1, 0.1);
    box(metal, x, 3.6, 104, 8, 0.2, 2.4);
    for (const dx of [-3.4, 3.4]) box(metal, x + dx, 1.9, 104, 0.13, 3.4, 0.13);
    box(orange, x, 0.9, 104.4, 5, 0.2, 0.6);
  }
  const parkedPalette = [solid("#e4dfd5", 0.28, 0.35), solid("#385d75", 0.28, 0.35), solid("#b84b39", 0.28, 0.35), solid("#476b5e", 0.28, 0.35)];
  const parkedSpots: [number, number, number][] = [
    [-142, 91.2, Math.PI / 2], [-134, 91.2, Math.PI / 2], [-52, 91.2, Math.PI / 2],
    [42, 91.2, Math.PI / 2], [50, 91.2, Math.PI / 2], [132, 91.2, Math.PI / 2],
  ];
  parkedSpots.forEach(([px, pz, rot], idx) => {
    placeVehicle(idx % 5 === 0 ? shells.suv : shells.sedan, parkedPalette[idx % parkedPalette.length], px, pz, rot);
  });
  for (let x = -185; x <= 185; x += 24) {
    if (Math.abs(Math.abs(x) - 135) < 11) continue;
    box(trunk, x, 0.9, 108, 3.2, 0.2, 0.6);
    box(trunk, x, 1.4, 108.35, 3.2, 0.8, 0.15);
    for (const dx of [-1.2, 1.2]) box(metal, x + dx, 0.6, 108, 0.12, 0.7, 0.5);
  }
  const existingMaterials = new Set(materials);
  const firstCivicObject = group.children.length;
  const cityKit = {
    group, geometries, materials, nightMaterials, box, part, beam, tree, solid, canvasTexture,
    vehicle: (kind: VehicleKind, material: THREE.Material, x: number, z: number) => {
      placeVehicle(shells[kind], material, x, z, 0);
      return shells[kind];
    },
  };
  const { landmarks: civicLandmarks, lakeMaterial } = buildCivicDistrict(cityKit);
  const civicMaterials = new Set([...materials].filter((material) => !existingMaterials.has(material)));
  group.children.slice(firstCivicObject).forEach((object) => {
    if (object instanceof THREE.Mesh) pickables.push(object);
  });
  group.userData.civicLandmarks = civicLandmarks;
  const commercialStart = group.children.length;
  const commercial = buildCommercialAndCurtainWalls(cityKit);
  group.children.slice(commercialStart).forEach((root) => root.traverse((object) => {
    if (object instanceof THREE.Mesh && ![object.material].flat().every((material) => material.transparent)) pickables.push(object);
  }));
  const atmosphere = buildSeasonalAtmosphere({ group, geometries, materials });
  const firstCoastObject = group.children.length;
  const materialsBeforeCoast = new Set(materials);
  const coast = buildCityCoast(cityKit);
  const coastMaterials = new Set([...materials].filter((material) => !materialsBeforeCoast.has(material) && !material.transparent));
  // 货轮包含嵌套实例批次，射线列表需展开到实体；透明浪花不遮挡点击。
  group.children.slice(firstCoastObject).forEach((root) => root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    if (meshMaterials.every((material) => !material.transparent)) pickables.push(object);
  }));

  const materialsBeforeUtilities = new Set(materials);
  const utilities = buildCityUtilities(cityKit);
  const utilityMaterials = new Set([...materials].filter((material) => !materialsBeforeUtilities.has(material) && !material.transparent));
  group.userData.windTurbineCount = utilities.windTurbineCount;
  group.userData.clarifierCount = utilities.clarifierCount;

  const firstCruiseObject = group.children.length;
  const materialsBeforeCruise = new Set(materials);
  const cruise = buildCityCruiseHarbor(cityKit);
  const cruiseMaterials = new Set([...materials].filter((material) => !materialsBeforeCruise.has(material) && !material.transparent));
  group.children.slice(firstCruiseObject).forEach((root) => {
    if (root.name.includes("Wake")) return;
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
      if (meshMaterials.every((material) => !material.transparent)) pickables.push(object);
    });
  });

  const events = buildCityEvents(cityKit);
  // v3 生活场景：湖畔垂钓 / 划船 / 天鹅船 / 鸭群，海滩排球 / 日光浴 / 游泳。
  const v3Scenes = buildV3Scenes(lakeMaterial);
  group.add(v3Scenes.group);
  const detailedEnvironment = buildDetailedEnvironment(cityKit, { sites: architecture.sites, budget: detailBudget });
  const life = buildDetailedCityLife(cityKit, {
    sites: architecture.sites,
    budget: detailBudget,
    onFootstep: detailedEnvironment.footstep,
  });

  const drawBatches = new Map<string, { sources: Batch[]; pickable: boolean }>();
  for (const batch of batches.values()) {
    const pickable = batch.parts.some((value) => value.place) || housingMaterials.has(batch.material) || civicMaterials.has(batch.material) || coastMaterials.has(batch.material) || utilityMaterials.has(batch.material) || cruiseMaterials.has(batch.material);
    const material = batch.material;
    let surfaceKey = material.uuid;
    if (material instanceof THREE.MeshStandardMaterial && material.constructor === THREE.MeshStandardMaterial
      && !material.transparent && !material.vertexColors && material.emissive.getHex() === 0
      && !Object.values(material).some((value) => value instanceof THREE.Texture)
      && material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile
      && material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey) {
      // 保留全部表面参数，仅将基础颜色交给实例属性；夜景、纹理与自定义 shader 独立绘制。
      const surface = Object.fromEntries(Object.entries(material.toJSON()).filter(([key]) => !["uuid", "metadata", "color"].includes(key)));
      surfaceKey = JSON.stringify([surface, material.defines, material.userData.citySurface ?? ""]);
    }
    // 拾取边界属于分组条件，树木等背景构件不能因合批进入点击或标签遮挡集合。
    const key = `${batch.geometry.uuid}:${pickable}:${surfaceKey}`;
    const drawBatch = drawBatches.get(key) ?? { sources: [], pickable };
    drawBatch.sources.push(batch);
    drawBatches.set(key, drawBatch);
  }
  for (const { sources, pickable } of drawBatches.values()) {
    const first = sources[0];
    const mergeColors = sources.length > 1;
    const material = mergeColors ? first.material.clone() : first.material;
    if (mergeColors && material instanceof THREE.MeshStandardMaterial) {
      material.color.set(0xffffff);
      materials.add(material);
    }
    const surfaceKind = first.material.userData.citySurface as CitySurface | undefined;
    if (surfaceKind && material instanceof THREE.MeshStandardMaterial) applyCitySurface(material, surfaceKind);
    const count = sources.reduce((total, source) => total + source.parts.length, 0);
    const mesh = new THREE.InstancedMesh(first.geometry, material, count);
    const places: (PlaceId | undefined)[] = [];
    let index = 0;
    for (const source of sources) for (const value of source.parts) {
      mesh.setMatrixAt(index, value.matrix);
      if (mergeColors && source.material instanceof THREE.MeshStandardMaterial) mesh.setColorAt(index, source.material.color);
      places.push(value.place);
      index++;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (pickable) {
      mesh.userData.places = places;
      pickables.push(mesh);
    }
    group.add(mesh);
  }

  const parkedPaint = carPaint("#ffffff");
  const parkedGroup = new THREE.Group();
  parkedGroup.name = "Parked vehicles";
  group.add(parkedGroup);
  const parkedMatrix = new THREE.Matrix4();
  const parkedPosition = new THREE.Vector3();
  const parkedRotation = new THREE.Quaternion();
  const parkedScale = new THREE.Vector3();
  const parkedEuler = new THREE.Euler();
  const buildParkedFleet = () => {
    for (const child of [...parkedGroup.children]) { (child as THREE.InstancedMesh).dispose(); parkedGroup.remove(child); }
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, count: number) => {
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parkedGroup.add(mesh);
      return mesh;
    };
    const put = (mesh: THREE.InstancedMesh, x: number, y: number, z: number, sx: number, sy: number, sz: number, rotY: number, rotZ = 0, color?: THREE.Color) => {
      parkedEuler.set(0, rotY, rotZ);
      parkedRotation.setFromEuler(parkedEuler);
      parkedMatrix.compose(parkedPosition.set(x, y, z), parkedRotation, parkedScale.set(sx, sy, sz));
      mesh.setMatrixAt(mesh.count, parkedMatrix);
      if (color) mesh.setColorAt(mesh.count, color);
      mesh.count++;
    };
    const wheelCount = parkedVehicles.reduce((total, car) => total + shells[car.kind].wheels.length, 0);
    const lampCount = parkedVehicles.reduce((total, car) => total + shells[car.kind].lamps.length, 0);
    const tires = add(tireGeometry, vehicleTrim, wheelCount);
    const rims = add(rimGeometry, railMetal, wheelCount);
    const heads = add(boxGeometry, lamp, lampCount);
    const tails = add(boxGeometry, tailRed, lampCount);
    for (const kind of Object.keys(shells) as VehicleKind[]) {
      const cars = parkedVehicles.filter((car) => car.kind === kind);
      if (!cars.length) continue;
      const shell = shells[kind];
      const body = add(shellParts[kind].body, parkedPaint, cars.length);
      body.name = `Parked · ${kind}`;
      const glass = add(shellParts[kind].glass, vehicleGlass, cars.length);
      const trimMesh = add(shellParts[kind].trim, vehicleTrim, cars.length);
      const chrome = add(shellParts[kind].chrome, railMetal, cars.length);
      for (const car of cars) {
        put(body, car.x, 0.42, car.z, 1, 1, 1, car.rot, 0, car.color);
        for (const mesh of [glass, trimMesh, chrome]) put(mesh, car.x, 0.42, car.z, 1, 1, 1, car.rot);
        const sin = Math.sin(car.rot), cos = Math.cos(car.rot);
        for (const wheel of shell.wheels) {
          const wx = car.x + sin * wheel.z + cos * wheel.x, wz = car.z + cos * wheel.z - sin * wheel.x;
          put(tires, wx, 0.42 + shell.wheelR, wz, shell.wheelR, shell.wheelR, shell.wheelR, car.rot, Math.PI / 2);
          put(rims, wx, 0.42 + shell.wheelR, wz, shell.wheelR, shell.wheelR, shell.wheelR, car.rot, Math.PI / 2);
        }
        for (const light of shell.lamps) {
          const lx = car.x + sin * light.z + cos * light.x, lz = car.z + cos * light.z - sin * light.x;
          put(light.tail ? tails : heads, lx, 0.42 + light.y, lz, 0.32, 0.085, 0.055, car.rot);
        }
      }
    }
    for (const child of parkedGroup.children) {
      const mesh = child as THREE.InstancedMesh;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  };
  const shellParts = Object.fromEntries((Object.keys(shells) as VehicleKind[]).map((kind) => [kind, {
    body: shells[kind].body, glass: shells[kind].glass, trim: shells[kind].trim, chrome: shells[kind].chrome,
  }])) as Record<VehicleKind, { body: THREE.BufferGeometry; glass: THREE.BufferGeometry; trim: THREE.BufferGeometry; chrome: THREE.BufferGeometry }>;
  buildParkedFleet();
  group.userData.parkedVehicleCount = parkedVehicles.length;

  const treeField = new TreeField(group, treePlacements, trees, trunk, canopyMaterials);
  group.userData.treeCount = treeField.treeCount;
  const barkTexture = new THREE.Texture();
  barkTexture.wrapS = barkTexture.wrapT = THREE.RepeatWrapping;
  barkTexture.colorSpace = THREE.SRGBColorSpace;
  const leafAtlas = new THREE.Texture();
  leafAtlas.colorSpace = THREE.SRGBColorSpace;
  leafAtlas.anisotropy = 4;
  // 图集 UV 以图像顶部为 v = 0（与 ImageBitmap 一致，避免不同解码路径翻转不一致把橡树叶采样成松针）。
  leafAtlas.flipY = false;
  const treeBark = new THREE.MeshStandardMaterial({ name: "Tree bark", color: "#d9cfc4", map: barkTexture, vertexColors: true, roughness: 0.92 });
  const treeLeaves = new THREE.MeshStandardMaterial({ name: "Tree leaves", color: "#ffffff", map: leafAtlas, vertexColors: true, roughness: 0.78, alphaTest: 0.42, side: THREE.DoubleSide });
  applyTreeWind(treeBark, false);
  applyTreeWind(treeLeaves, true);
  markCitySurface(treeBark, "bark");
  markCitySurface(treeLeaves, "foliage");
  applyCitySurface(treeBark, "bark");
  applyCitySurface(treeLeaves, "foliage");
  materials.add(treeBark);
  materials.add(treeLeaves);
  if (canLoadCityAssets()) {
    loadTreeModels().then((assets) => {
      barkTexture.image = assets.barkImage;
      barkTexture.needsUpdate = true;
      leafAtlas.image = assets.leafImage;
      leafAtlas.needsUpdate = true;
      for (const model of Object.values(assets.models)) for (const geometry of [...model.bark, ...model.leaves]) geometries.add(geometry);
      treeField.useModels(assets, treeBark, treeLeaves);
    }).catch((error: unknown) => console.warn("[city] tree models unavailable, keeping procedural trees", error));
  }

  const carCount = 60;
  const bodyMaterial = carPaint("#ffffff");
  const classify = (index: number) => {
    // 车流构成：轿车、两厢车、SUV 为主，穿插出租车、厢式面包车/快递车、货车与公交。
    const kind = index % 15 === 0 ? "bus" : index % 11 === 0 ? "truck" : index % 6 === 0 ? "taxi"
      : index % 7 === 0 ? "van" : index % 3 === 0 ? "suv" : index % 4 === 1 || index % 5 === 2 ? "hatchback" : "sedan";
    const shell: VehicleKind = kind === "taxi" ? "sedan" : kind;
    return { kind, shell } as const;
  };
  const shellCounts: Record<VehicleKind, number> = { sedan: 0, hatchback: 0, van: 0, suv: 0, bus: 0, truck: 0 };
  for (let index = 0; index < carCount; index++) shellCounts[classify(index).shell]++;
  const shellBodies = {} as Record<VehicleKind, THREE.InstancedMesh>;
  const shellGlass = {} as Record<VehicleKind, THREE.InstancedMesh>;
  const shellTrim = {} as Record<VehicleKind, THREE.InstancedMesh>;
  const shellChrome = {} as Record<VehicleKind, THREE.InstancedMesh>;
  (Object.keys(shells) as VehicleKind[]).forEach((kind) => {
    shellBodies[kind] = new THREE.InstancedMesh(shells[kind].body, bodyMaterial, Math.max(1, shellCounts[kind]));
    shellGlass[kind] = new THREE.InstancedMesh(shells[kind].glass, vehicleGlass, Math.max(1, shellCounts[kind]));
    shellTrim[kind] = new THREE.InstancedMesh(shells[kind].trim, vehicleTrim, Math.max(1, shellCounts[kind]));
    shellChrome[kind] = new THREE.InstancedMesh(shells[kind].chrome, railMetal, Math.max(1, shellCounts[kind]));
    for (const mesh of [shellBodies[kind], shellGlass[kind], shellTrim[kind], shellChrome[kind]]) mesh.name = `Traffic · ${kind}`;
  });
  // CC0 车型懒加载：就绪后原地替换轿车 / 两厢车 / SUV 的车壳几何与轮位、灯位元数据。
  if (canLoadCityAssets()) {
    loadCarModelsOnce().then((models) => {
      for (const kind of Object.keys(models) as CarModelKind[]) {
        const model = models[kind];
        const shell = shells[kind];
        for (const geometry of [model.body, model.glass, model.trim, model.chrome]) geometries.add(geometry);
        shellBodies[kind].geometry = model.body;
        shellGlass[kind].geometry = model.glass;
        shellTrim[kind].geometry = model.trim;
        shellChrome[kind].geometry = model.chrome;
        shell.length = model.length;
        shell.width = model.width;
        shell.height = model.height;
        shell.wheelR = model.wheelR;
        shell.wheels.splice(0, shell.wheels.length, ...model.wheels);
        shell.lamps.splice(0, shell.lamps.length, ...model.lamps);
        shellParts[kind] = { body: model.body, glass: model.glass, trim: model.trim, chrome: model.chrome };
      }
      buildParkedFleet();
    }).catch((error: unknown) => console.warn("[city] car models unavailable, keeping procedural shells", error));
  }
  const lights = new THREE.InstancedMesh(boxGeometry, lamp, carCount * 2);
  const taillights = new THREE.InstancedMesh(boxGeometry, tailRed, carCount * 2);
  const roofUnits = new THREE.InstancedMesh(boxGeometry, lightStone, carCount);
  const mirrors = new THREE.InstancedMesh(boxGeometry, bodyMaterial, carCount * 2);
  const wheels = new THREE.InstancedMesh(tireGeometry, vehicleTrim, carCount * 4);
  const rims = new THREE.InstancedMesh(rimGeometry, railMetal, carCount * 4);
  // Night light pools: soft additive decals under every street lamp and in front of / behind each car.
  const glowTexture = canvasTexture(128, 128, (ctx) => {
    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.55)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.14)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
  });
  glowTexture.wrapS = glowTexture.wrapT = THREE.ClampToEdgeWrapping;
  const poolGeometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  geometries.add(poolGeometry);
  const poolMaterial = (hex: string, strength: number) => {
    const material = new THREE.MeshBasicMaterial({
      map: glowTexture, color: new THREE.Color(hex).multiplyScalar(strength), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    materials.add(material);
    return material;
  };
  const lampPools = new THREE.InstancedMesh(poolGeometry, poolMaterial("#ffc98a", 0.55), Math.max(1, lampSpots.length));
  lampSpots.forEach((spot, index) => {
    transform.position.set(spot.x, 0.66 + spot.y, spot.z);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(13, 1, 13);
    transform.updateMatrix();
    lampPools.setMatrixAt(index, transform.matrix);
  });
  const headPools = new THREE.InstancedMesh(poolGeometry, poolMaterial("#fff0d2", 1.1), carCount);
  const tailPools = new THREE.InstancedMesh(poolGeometry, poolMaterial("#ff3a24", 0.7), carCount);
  const nightPools = [lampPools, headPools, tailPools];
  nightPools.forEach((mesh) => {
    mesh.name = "Night light pools";
    mesh.visible = false;
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    group.add(mesh);
  });
  const vehicleMeshes = [...Object.values(shellBodies), ...Object.values(shellGlass), ...Object.values(shellTrim), ...Object.values(shellChrome), lights, taillights, roofUnits, mirrors, wheels, rims, headPools, tailPools];
  vehicleMeshes.forEach((mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(mesh);
  });

  // 路口动态红绿灯信号（红/绿交替）+ 追尾事故浓烟 + 警车红蓝爆闪灯与双闪警示灯
  const signalGreen = solid("#30d158", 0.3, 0.1);
  signalGreen.emissive.set("#28cd4f");
  nightMaterials.push({ material: signalGreen, day: 0.85, night: 3.2 });
  const signalAmber = solid("#ffc244", 0.3, 0.1);
  signalAmber.emissive.set("#ffaf1a");
  nightMaterials.push({ material: signalAmber, day: 0.85, night: 3.2 });
  const sirenBlue = solid("#0a84ff", 0.3, 0.1);
  sirenBlue.emissive.set("#0a84ff");
  nightMaterials.push({ material: sirenBlue, day: 0.9, night: 3.5 });
  const smokeMat = solid("#dce2e6", 0.92, 0.0);

  const signalCount = Math.max(1, signalIntersections.length);
  const signalRedMesh = new THREE.InstancedMesh(boxGeometry, tailRed, signalCount);
  const signalGreenMesh = new THREE.InstancedMesh(boxGeometry, signalGreen, signalCount);
  const signalAmberMesh = new THREE.InstancedMesh(boxGeometry, signalAmber, signalCount);
  const smokeCount = 7;
  const crashSmokeMesh = new THREE.InstancedMesh(crownGeometry, smokeMat, smokeCount);
  const strobeRedMesh = new THREE.InstancedMesh(boxGeometry, tailRed, 5);
  const strobeBlueMesh = new THREE.InstancedMesh(boxGeometry, sirenBlue, 2);
  const dynamicSceneMeshes = [signalRedMesh, signalGreenMesh, signalAmberMesh, crashSmokeMesh, strobeRedMesh, strobeBlueMesh];
  dynamicSceneMeshes.forEach((mesh) => {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  // 接近真实车流的车漆分布：白、银、灰、黑占多数，少量深蓝、酒红与墨绿。
  const carPalette = [
    "#e9e8e4", "#a9adb1", "#1d2024", "#5d6268", "#25344c",
    "#e9e8e4", "#7a1f24", "#c7c9cb", "#2c3a33", "#3c4148",
    "#f1efe9", "#8a8f94", "#121416", "#6f5a46",
  ];
  // 严格贴合 ROAD_SEGMENTS 真实道路中心线，100% 避开中央公园 (x:-75..75, z:-115..95)
  const arterialLoops = [
    // 1. 环城滨海大环线 (x=±210, z=-115..95)
    [
      { x: -210, z: 95 }, { x: 210, z: 95 },
      { x: 210, z: -115 }, { x: -210, z: -115 },
    ],
    // 2. 中央公园外围环路 (严格沿公园四条边界大道 x=±75, z=-115, z=95 行驶，绝不穿行公园内部)
    [
      { x: -75, z: 95 }, { x: 75, z: 95 },
      { x: 75, z: -115 }, { x: -75, z: -115 },
    ],
    // 3. 西城核心干道环线 (x=-165..-120, z=-115..65，避开 x=-75,z=69 追尾事故封锁路段)
    [
      { x: -165, z: 65 }, { x: -120, z: 65 },
      { x: -120, z: -115 }, { x: -165, z: -115 },
    ],
    // 4. 东城金融干道环线 (x=75..165, z=-115..65)
    [
      { x: 75, z: 65 }, { x: 165, z: 65 },
      { x: 165, z: -115 }, { x: 75, z: -115 },
    ],
  ];
  // 过滤掉紧邻追尾事故现场 (-75, 69) 的街区支路，避免车辆穿模撞车现场
  const safeBlocks = cityBlocks.filter((b) => !(Math.abs(b.x - -97.5) < 5 && Math.abs(b.z - 42.5) < 5));

  const shellCursor: Record<VehicleKind, number> = { sedan: 0, hatchback: 0, van: 0, suv: 0, bus: 0, truck: 0 };
  const routes = Array.from({ length: carCount }, (_, i) => {
    const { kind, shell } = classify(i);
    const shellSlot = shellCursor[shell]++;
    const bodyColor =
      kind === "bus" ? "#d97736" :
      kind === "taxi" ? "#f0be3c" :
      kind === "truck" ? (i % 2 ? "#dce2e6" : "#c9cdd0") :
      kind === "van" ? (i % 3 === 0 ? "#d9d8d2" : i % 3 === 1 ? "#e8e7e2" : "#8a9096") :
      carPalette[i % carPalette.length];
    const paint = new THREE.Color(bodyColor);
    shellBodies[shell].setColorAt(shellSlot, paint);
    mirrors.setColorAt(i * 2, paint);
    mirrors.setColorAt(i * 2 + 1, paint);

    const points = i < 24
      ? arterialLoops[i % arterialLoops.length].map((p) => ({ ...p }))
      : (() => {
          const block = safeBlocks[(i * 7) % safeBlocks.length];
          return [
            { x: block.x - 22.5, z: block.z - 22.5 },
            { x: block.x + 22.5, z: block.z - 22.5 },
            { x: block.x + 22.5, z: block.z + 22.5 },
            { x: block.x - 22.5, z: block.z + 22.5 },
          ];
        })();
    if (i % 2) points.reverse();

    // 计算精确直线段长度（无样条外凸偏移），并在路口用圆弧插值平滑转向
    const edges = points.map((from, idx) => {
      const to = points[(idx + 1) % points.length];
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const len = Math.hypot(dx, dz);
      return { from, to, ux: dx / len, uz: dz / len, len, heading: Math.atan2(dx, dz) };
    });
    const totalLength = edges.reduce((acc, e) => acc + e.len, 0);
    return {
      edges,
      totalLength,
      offset: random() * totalLength,
      speed: (kind === "bus" ? 6.5 : kind === "truck" ? 7.2 : 8.5 + random() * 4.2),
      kind,
      shell,
      shellSlot,
      phase: random() * Math.PI * 2,
    };
  });
  const traffic = createCityTraffic(routes, signalIntersections);
  const trafficDetails = buildTrafficDetails(cityKit, routes, shells);
  const trafficObstacles = routes.map((_route, index) => ({
    x: traffic.states[index].pose.x,
    z: traffic.states[index].pose.z,
    radius: traffic.specifications[index].length * 0.5,
    speed: 0,
    heading: traffic.states[index].pose.heading,
  }));
  const chassisRotation = new THREE.Quaternion();
  const chassisEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const wheelRotation = new THREE.Quaternion();
  const wheelAxis = new THREE.Vector3(0, 1, 0);
  const localPart = new THREE.Vector3();
  let lastNight: boolean | undefined;
  const yAxis = new THREE.Vector3(0, 1, 0);
  const setNight = (night: boolean) => {
    if (lastNight === night) return;
    lastNight = night;
    nightMaterials.forEach(({ material, day, night: value }) => { material.emissiveIntensity = night ? value : day; });
    vehicleSurfaces.forEach((material) => { material.envMapIntensity = night ? 0.14 : 0.85; });
    waterMaterial.uniforms.uNight.value = night ? 1 : 0;
    lakeMaterial.uniforms.uNight.value = night ? 1 : 0;
    nightPools.forEach((mesh) => { mesh.visible = night; });
  };
  const animate = (seconds: number, night: boolean, seasonMode: SeasonMode = "auto", seasonState?: SeasonState) => {
    const state = seasonState ?? sampleSeasonState(seconds, seasonMode);
    setNight(night);
    weather.update(seconds, state, night);
    facadeInteriors.update(seconds, night);
    detailedEnvironment.animate(seconds, night, state);
    atmosphere.animate(seconds, state);
    for (let index = 0; index < trafficObstacles.length; index++) {
      const car = traffic.states[index];
      const obstacle = trafficObstacles[index];
      obstacle.x = car.pose.x;
      obstacle.z = car.pose.z;
      obstacle.speed = car.speed;
      obstacle.heading = car.pose.heading;
    }
    life.setTrafficObstacles(trafficObstacles);
    life.animate(seconds, night, state);
    const doorOccupants = life.getDoorOccupants();
    architecture.setDoorOccupants(doorOccupants);
    architecture.animate(seconds, night, state.season);
    commercial.animate(seconds, night, doorOccupants);
    coast.animate(seconds);
    utilities.animate(seconds);
    cruise.animate(seconds);
    events.animate(seconds);
    v3Scenes.animate(seconds, night);
    waterMaterial.uniforms.uTime.value = seconds;
    lakeMaterial.uniforms.uTime.value = seconds;

    const signal = sampleSignalPhase(seconds, true).vehicle;
    signalIntersections.forEach((node, idx) => {
      // 悬臂红灯与绿灯位置切换高亮
      transform.position.set(node.x + 2.5, signal === "red" ? 5.38 : -10, node.z + 6.58);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(0.24, 0.24, 0.08);
      transform.updateMatrix();
      signalRedMesh.setMatrixAt(idx, transform.matrix);

      transform.position.set(node.x + 3.08, signal === "green" ? 5.38 : -10, node.z + 6.58);
      transform.scale.set(0.24, 0.24, 0.08);
      transform.updateMatrix();
      signalGreenMesh.setMatrixAt(idx, transform.matrix);
      transform.position.set(node.x + 2.79, signal === "amber" ? 5.38 : -10, node.z + 6.58);
      transform.updateMatrix();
      signalAmberMesh.setMatrixAt(idx, transform.matrix);
    });

    // 追尾事故引擎盖浓烟升腾动画 (-73.9, y, 69.4)
    for (let s = 0; s < smokeCount; s++) {
      const smokeProgress = THREE.MathUtils.euclideanModulo(seconds * 0.55 + s / smokeCount, 1);
      const sy = 1.45 + smokeProgress * 4.2;
      const sx = -73.9 + Math.sin(smokeProgress * 5 + s) * 0.35;
      const sz = 69.4 + Math.cos(smokeProgress * 4 + s) * 0.35;
      const radius = 0.22 + smokeProgress * 0.65 * (1 - smokeProgress * 0.45);
      transform.position.set(sx, sy, sz);
      transform.rotation.set(seconds + s, seconds * 0.7, 0);
      transform.scale.set(radius, radius * 0.82, radius);
      transform.updateMatrix();
      crashSmokeMesh.setMatrixAt(s, transform.matrix);
    }

    // 事故现场警车红蓝交替爆闪顶灯 + 两辆事故车双闪应急灯
    const flashOn = Math.sin(seconds * 12) > 0;
    // 警车红灯 (-77.4, 1.72, 64.2)
    transform.position.set(-77.65, flashOn ? 1.96 : -10, 64.05);
    transform.rotation.set(0, 0.52, 0);
    transform.scale.set(0.42, 0.14, 0.22);
    transform.updateMatrix();
    strobeRedMesh.setMatrixAt(0, transform.matrix);
    // 警车蓝灯
    transform.position.set(-77.15, !flashOn ? 1.96 : -10, 64.35);
    transform.updateMatrix();
    strobeBlueMesh.setMatrixAt(0, transform.matrix);
    strobeBlueMesh.setMatrixAt(1, transform.matrix);
    // 事故车辆高频双闪警示灯
    const hazardPositions: [number, number, number][] = [
      [-72.8, 0.92, 65.6], [-74.0, 0.92, 69.5],
      [-73.5, 0.98, 73.5], [-74.9, 0.98, 73.4],
    ];
    hazardPositions.forEach(([hx, hy, hz], hIdx) => {
      transform.position.set(hx, flashOn ? hy : -10, hz);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(0.32, 0.16, 0.16);
      transform.updateMatrix();
      strobeRedMesh.setMatrixAt(hIdx + 1, transform.matrix);
    });

    const trafficStates = traffic.animate(seconds, {
      night,
      wetness: state.precipitation,
      snow: state.season === "winter" ? state.precipitation : 0,
      temperature: state.temperatureC,
      obstacles: life.getCrossingObstacles(),
    });
    trafficDetails.animate(seconds, trafficStates);
    group.userData.traffic = traffic.snapshot();
    routes.forEach((route, index) => {
      const motion = trafficStates[index];
      const { x, z, heading: angle } = motion.pose;

      const shell = shells[route.shell];
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);
      const pitch = motion.bodyPitch;
      const roll = motion.bodyRoll;
      const heave = motion.bodyHeave;
      chassisRotation.setFromEuler(chassisEuler.set(pitch, angle, roll));
      const placeLocal = (lx: number, ly: number, lz: number) => {
        localPart.set(lx, ly, lz).applyQuaternion(chassisRotation);
        transform.position.set(x + localPart.x, 0.42 + localPart.y + heave, z + localPart.z);
        transform.quaternion.copy(chassisRotation);
        transform.scale.set(1, 1, 1);
      };
      placeLocal(0, 0, 0);
      transform.updateMatrix();
      shellBodies[route.shell].setMatrixAt(route.shellSlot, transform.matrix);
      shellGlass[route.shell].setMatrixAt(route.shellSlot, transform.matrix);
      shellTrim[route.shell].setMatrixAt(route.shellSlot, transform.matrix);
      shellChrome[route.shell].setMatrixAt(route.shellSlot, transform.matrix);

      if (route.kind === "taxi") {
        placeLocal(0, shell.height + 0.06, 0.1);
        transform.scale.set(0.46, 0.12, 0.24);
      } else if (route.kind === "bus") {
        placeLocal(0, shell.height + 0.08, -0.6);
        transform.scale.set(1.6, 0.2, 2.4);
      } else {
        transform.position.set(x, -20, z);
        transform.scale.set(0.001, 0.001, 0.001);
      }
      transform.updateMatrix();
      roofUnits.setMatrixAt(index, transform.matrix);

      for (const side of [-1, 1]) {
        // 车壳已自带带支杆的后视镜，这里的旧方块镜隐藏，避免重复的悬空方块。
        transform.position.set(x, -20, z);
        transform.scale.set(0.001, 0.001, 0.001);
        transform.updateMatrix();
        mirrors.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), transform.matrix);
      }
      for (const lamp of shell.lamps) {
        placeLocal(lamp.x, lamp.y, lamp.z);
        transform.scale.set(lamp.tail ? 0.26 : 0.22, 0.09, 0.08);
        transform.updateMatrix();
        const lane = lamp.x > 0 ? 1 : 0;
        (lamp.tail ? taillights : lights).setMatrixAt(index * 2 + lane, transform.matrix);
      }
      if (lastNight) {
        placeLocal(0, 0.06, shell.length / 2 + 4.6);
        transform.quaternion.setFromAxisAngle(yAxis, angle);
        transform.scale.set(3.6, 1, 9);
        transform.updateMatrix();
        headPools.setMatrixAt(index, transform.matrix);
        placeLocal(0, 0.06, -shell.length / 2 - 1.1);
        transform.quaternion.setFromAxisAngle(yAxis, angle);
        transform.scale.set(2.6, 1, 2.6);
        transform.updateMatrix();
        tailPools.setMatrixAt(index, transform.matrix);
      }
      shell.wheels.forEach((wheel, wheelIndex) => {
        const contactIndex = (wheel.z > 0 ? 0 : 2) + (wheel.x > 0 ? 1 : 0);
        const wx = x + sinA * wheel.z + cosA * wheel.x;
        const wz = z + cosA * wheel.z - sinA * wheel.x;
        transform.position.set(wx, 0.42 + shell.wheelR + motion.wheelHeights[contactIndex], wz);
        transform.rotation.set(0, angle + motion.wheelSteering[contactIndex], Math.PI / 2);
        wheelRotation.setFromAxisAngle(wheelAxis, -motion.travelled / shell.wheelR);
        transform.quaternion.multiply(wheelRotation);
        transform.scale.setScalar(shell.wheelR);
        transform.updateMatrix();
        wheels.setMatrixAt(index * 4 + wheelIndex, transform.matrix);
        rims.setMatrixAt(index * 4 + wheelIndex, transform.matrix);
      });
    });
    vehicleMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
    dynamicSceneMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  };
  // 动态实例的包围球覆盖整条路线，避免离开首帧位置后被视锥误裁剪。
  vehicleMeshes.forEach((mesh) => { mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 65), 390); });
  group.userData.buildingCount = buildingCount + 5;
  group.userData.vehicleCount = carCount;
  materials.forEach((material) => {
    const kind = material.userData.cityWeather ?? material.userData.citySurface;
    if (material instanceof THREE.MeshStandardMaterial && kind)
      weather.attach(material, kind as CitySurface);
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
  });
  animate(0, false);
  return {
    group, billboardSign: sign, anchors, pickables, builtSites: architecture.sites, animate, setNight,
    getLifeSnapshot: life.snapshot,
    dispose: () => {
      treeField.dispose();
      v3Scenes.dispose();
      life.dispose();
      traffic.dispose();
      trafficDetails.dispose();
      detailedEnvironment.dispose();
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      group.traverse((object) => {
        if (object instanceof THREE.InstancedMesh || object instanceof THREE.BatchedMesh) object.dispose();
      });
      group.clear();
      anchors.clear();
      pickables.length = 0;
      geometries.clear();
      materials.clear();
      textures.clear();
    },
  };
}
