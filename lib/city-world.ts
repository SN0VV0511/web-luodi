import * as THREE from "three";
import { cityLots, ROAD_SEGMENTS, cityBlocks, districts, civicLots, type CityLot } from "./city-map";
import type { PlaceId } from "./city-content";
import { buildCivicDistrict } from "./city-civic";
import { buildCityLife } from "./city-life";
import { buildCityCoast } from "./city-coast";

export type CityWorld = {
  group: THREE.Group;
  billboardSign: THREE.Mesh;
  anchors: Map<PlaceId, THREE.Vector3>;
  pickables: THREE.Object3D[];
  animate: (seconds: number, night: boolean) => void;
  setNight: (night: boolean) => void;
  dispose: () => void;
};
type Part = { matrix: THREE.Matrix4; place?: PlaceId };
type Batch = { geometry: THREE.BufferGeometry; material: THREE.Material; parts: Part[] };
type Building = Pick<CityLot, "x" | "z" | "width" | "depth" | "height" | "style"> & { id?: PlaceId };

/** 米制街区、独立楼宇与公共设施。重复构件按材质实例化，避免逐窗生成对象。 */
export function buildCityWorld(): CityWorld {
  const group = new THREE.Group();
  group.name = "SN0VV Coastal City";
  const anchors = new Map<PlaceId, THREE.Vector3>();
  const pickables: THREE.Object3D[] = [];
  const batches = new Map<string, Batch>();
  const textures = new Set<THREE.Texture>();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const nightMaterials: { material: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
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
  const concrete = solid("#d2cec2", 0.78);
  const lightStone = solid("#e8e0cf", 0.72);
  const darkRoof = solid("#364147", 0.62, 0.18);
  const paleRoof = solid("#aeb8bd", 0.58, 0.14);
  const pavement = solid("#b2b0a6", 0.8);
  const curb = solid("#dcd6c8", 0.74);
  const asphalt = solid("#272e33", 0.82, 0.06);
  const roadLine = solid("#f2efe6", 0.65);
  const roadYellow = solid("#e6b245", 0.65);
  const grass = solid("#628e54", 0.88);
  const turf = solid("#7ca866", 0.84);
  const soil = solid("#687c58", 0.92);
  const trunk = solid("#634c3b", 0.88);
  const leaves = [
    solid("#2b5838"), solid("#3f7245"), solid("#588a4d"),
    solid("#6f9954"), solid("#d49b3d"), solid("#c96b70"),
  ];
  const metal = solid("#3e494d", 0.38, 0.58);
  const railMetal = solid("#b2babd", 0.3, 0.62);
  const glass = solid("#2b5872", 0.16, 0.62);
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
    // 立面UV按实例实际米数铺设，十五米公寓与百米高楼保持同一楼层比例。
    value.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying float vWall;\n${shader.vertexShader}`.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vWall = 1.0 - abs(normal.y);
        #ifdef USE_INSTANCING
          vec3 facadeScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec2 repeats = vec2(abs(normal.x) > 0.5 ? facadeScale.z : facadeScale.x, facadeScale.y) / vec2(24.0, 51.2);
          vMapUv *= repeats;
          vEmissiveMapUv *= repeats;
        #endif`,
      );
      shader.fragmentShader = `varying float vWall;\n${shader.fragmentShader}`
        .replace("diffuseColor *= sampledDiffuseColor;", "diffuseColor *= mix(vec4(0.68, 0.70, 0.67, 1.0), sampledDiffuseColor, vWall);")
        .replace("totalEmissiveRadiance *= emissiveColor.rgb;", "totalEmissiveRadiance *= emissiveColor.rgb * vWall;");
    };
    value.customProgramCacheKey = () => "city-facade-metres-v1";
    materials.add(value);
    nightMaterials.push({ material: value, day: 0.055, night: 1.35 });
    return value;
  };
  const facades = {
    glass: [facade("glass", "#2b5670"), facade("glass", "#32636d"), facade("glass", "#244761")],
    stone: [facade("stone", "#ded6c5"), facade("stone", "#d4cbb8"), facade("stone", "#e5dfd1")],
    brick: [facade("brick", "#a85c46"), facade("brick", "#9a6c54")],
  };

  // 紧凑高密度海岸岛屿基底，大幅削减无意义的超远景面积以提升60FPS流畅度
  box(soil, 0, -2.2, -160, 860, 4, 580);
  box(grass, 20, 0.08, -57.5, 500, 0.12, 345);
  box(concrete, 120, -1.7, 114, 400, 3, 2.5);
  box(pavement, 120, 0.15, 107, 400, 0.3, 14);
  box(pavement, -152.5, 0.15, 103, 145, 0.3, 6);
  box(curb, 59, 0.27, 112, 278, 0.32, 1.1);
  box(curb, 271, 0.27, 112, 98, 0.32, 1.1);

  const signalIntersections: { x: number; z: number }[] = [];
  const roadNodes = new Map<string, { x: number; z: number; directions: { x: number; z: number }[] }>();
  for (const road of ROAD_SEGMENTS) {
    const horizontal = road.z1 === road.z2;
    const length = Math.hypot(road.x2 - road.x1, road.z2 - road.z1);
    const x = (road.x1 + road.x2) / 2, z = (road.z1 + road.z2) / 2;
    box(curb, x, 0.2, z, horizontal ? length : 15.4, 0.3, horizontal ? 15.4 : length);
    box(asphalt, x, 0.38, z, horizontal ? length : 11, 0.08, horizontal ? 11 : length);
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
  const streetLamp = (x: number, z: number, turn = 1, y = 0) => {
    box(metal, x, 0.52 + y, z, 0.34, 0.45, 0.34);
    box(metal, x, 3.5 + y, z, 0.17, 7, 0.17);
    box(metal, x + turn * 0.75, 7 + y, z, 1.7, 0.16, 0.2);
    box(lamp, x + turn * 1.4, 6.92 + y, z, 0.9, 0.12, 0.4);
  };
  const tree = (x: number, z: number, size = 1, shade = 0, y = 0) => {
    // 树根基座、主干与左右分叉枝干，告别单调圆柱+绿椭圆体
    part(trunk, cylinderGeometry, x, y + 0.35 * size, z, 0.28 * size, 0.7 * size, 0.28 * size);
    part(trunk, cylinderGeometry, x, y + 1.45 * size, z, 0.18 * size, 2.7 * size, 0.18 * size);
    part(trunk, cylinderGeometry, x - 0.38 * size, y + 2.55 * size, z + 0.15 * size, 0.09 * size, 1.3 * size, 0.09 * size, undefined, 0.4, 0.48);
    part(trunk, cylinderGeometry, x + 0.36 * size, y + 2.65 * size, z - 0.18 * size, 0.09 * size, 1.25 * size, 0.09 * size, undefined, -0.35, -0.45);
    const leafA = leaves[shade % leaves.length];
    const leafB = leaves[(shade + 1) % leaves.length];
    if (shade % 3 === 0) {
      // 针叶松柏树种：三层叠落伞状塔冠
      part(leafA, coneGeometry, x, y + 3.1 * size, z, 1.85 * size, 2.2 * size, 1.85 * size, undefined, shade * 0.7);
      part(leafB, coneGeometry, x, y + 4.35 * size, z, 1.42 * size, 1.95 * size, 1.42 * size, undefined, shade * 1.3);
      part(leafA, coneGeometry, x, y + 5.45 * size, z, 0.95 * size, 1.55 * size, 0.95 * size, undefined, shade * 2.1);
    } else {
      // 阔叶乔木/秋色银杏/花木：多簇错落多面体树冠团块，受光棱角分明
      part(leafA, crownGeometry, x, y + 4.15 * size, z, 1.55 * size, 1.35 * size, 1.5 * size, undefined, shade * 0.8);
      part(leafB, crownGeometry, x - 0.85 * size, y + 3.45 * size, z + 0.38 * size, 1.15 * size, 1.02 * size, 1.12 * size, undefined, shade * 1.4);
      part(leafB, crownGeometry, x + 0.82 * size, y + 3.6 * size, z - 0.42 * size, 1.18 * size, 1.08 * size, 1.15 * size, undefined, shade * 2.1);
      part(leafA, crownGeometry, x + 0.18 * size, y + 3.3 * size, z + 0.78 * size, 1.05 * size, 0.92 * size, 1.05 * size, undefined, shade * 2.8);
    }
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
    const portClearance = x > 196;
    if (!pavilionClearance && !portClearance) {
      tree(x, x < -80 ? 99 : 102, 0.95, Math.abs(x) % 4);
      streetLamp(x + 6, x < -80 ? 104 : 110, -1);
    }
    if (x < -73 || portClearance) continue;
    box(metal, x, 0.9, 112.2, 0.14, 1.6, 0.14);
    box(metal, x, 1.65, 112.2, 14, 0.12, 0.12);
    box(railMetal, x, 1.15, 112.2, 14, 0.06, 0.06);
    if (Math.abs(x) % 28 === 0) {
      box(lamp, x, 1.78, 112.2, 0.24, 0.14, 0.24);
    }
  }

  let buildingCount = 0;
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
    if (height > 42) {
      box(metal, x - w * 0.25, height + 3.5, z + d * 0.28, 0.14, 7, 0.14, id);
      box(lamp, x - w * 0.25, height + 7.1, z + d * 0.28, 0.28, 0.32, 0.28, id);
    }
  };
  const building = (lot: Building, variant: number) => {
    buildingCount++;
    const { x, z, width: w, depth: d, height: h, id, style } = lot;
    const type = style === "glass" ? "glass" : style === "brick" ? "brick" : "stone";
    const face = facades[type][variant % facades[type].length];
    box(pavement, x, 0.38, z, w + 1.2, 0.25, d + 1.2, id);
    box(lightStone, x, 0.68, z, w + 0.45, 0.38, d + 0.45, id);
    const body = (bx: number, bz: number, bw: number, bd: number, bh: number, base = 0.55) => {
      box(face, bx, base + bh / 2, bz, bw, bh, bd, id);
      rooftop(bx, bz, bw, bd, base + bh, id);
    };
    let roofHeight = h + 0.55;
    if (id === "agents") {
      // 03 Agent Base：智能体总部地标摩天楼，三段退台 + 竖向发光翼肋 + 玻璃观景冠 + 信号尖塔
      body(x, z, w, d, h * 0.6);
      body(x, z - 1, w * 0.8, d * 0.82, h * 0.29, h * 0.6);
      body(x, z - 1.5, w * 0.58, d * 0.64, h * 0.11, h * 0.89);
      box(lightStone, x, h + 3.8, z - 1.5, w * 0.59, 7, d * 0.65, id);
      box(glass, x, h + 4.2, z - 1.5, w * 0.61, 3.8, d * 0.67, id);
      box(lamp, x, h + 6.6, z - 1.5, w * 0.56, 0.28, d * 0.62, id);
      part(railMetal, coneGeometry, x, h + 10.5, z - 1.5, 3.1, 13, 3.1, id);
      part(lightStone, cylinderGeometry, x, h + 8.4, z - 1.5, 2.3, 0.45, 2.3, id);
      part(lightStone, cylinderGeometry, x, h + 12.2, z - 1.5, 1.35, 0.35, 1.35, id);
      box(lamp, x, h + 17.2, z - 1.5, 0.42, 0.85, 0.42, id);
      for (const dx of [-w / 2, w / 2]) {
        box(lightStone, x + dx, h * 0.3, z + d / 2, 0.85, h * 0.6, 0.95, id);
        box(lamp, x + dx * 0.92, h * 0.44, z + d / 2 + 0.12, 0.18, h * 0.82, 0.18, id);
      }
      for (const dx of [-w * 0.38, w * 0.38]) {
        box(railMetal, x + dx, h * 0.74, z - 1 + d * 0.41, 0.45, h * 0.28, 0.55, id);
      }
      roofHeight = h + 18;
    } else if (id === "quant") {
      // 01 慢慢事务所：量化交易金融双子塔，裙房柱廊 + 铜金竖向遮阳翼 + 空中行情连廊 + 屋顶停机坪
      body(x, z, w, d, 10);
      box(lightStone, x, 10.7, z, w + 0.8, 0.55, d + 0.8, id);
      body(x - 3.8, z - 1.2, w * 0.55, d * 0.8, h - 10, 10);
      body(x + w * 0.28, z + d * 0.12, w * 0.34, d * 0.67, h * 0.71, 10);
      // 空中玻璃交易连廊与暖金行情灯带
      box(glass, x + 1.2, h * 0.52, z + 0.8, w * 0.42, 3.6, d * 0.48, id);
      box(lamp, x - 3.8, h * 0.52, z - 1.2, w * 0.57, 0.28, d * 0.82, id);
      box(railMetal, x - 3.8, h + 1.1, z - 1.2, w * 0.56, 1.9, d * 0.81, id);
      box(glass, x - 3.8, h + 1.1, z - 1.2, w * 0.58, 1.1, d * 0.83, id);
      for (let i = 0; i < 6; i++) {
        const fx = x - w * 0.42 + i * w * 0.11;
        box(i % 2 === 0 ? orange : railMetal, fx, h / 2, z + d * 0.36, 0.28, h - 2, 0.52, id);
      }
      // 主塔顶信标双桅杆
      box(metal, x - 5.2, h + 4.8, z - 2.4, 0.18, 6.2, 0.18, id);
      box(lamp, x - 5.2, h + 8.0, z - 2.4, 0.34, 0.42, 0.34, id);
      roofHeight = h + 8.5;
    } else if (id === "affine" || style === "terrace" && variant % 2 === 0) {
      // 02 AFFiNE：知识工作室，三层退台空中花园 + 廊架 + 采光天窗
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
      if (id === "affine") {
        box(glass, x - w * 0.07, h + 1.4, z - d * 0.07, w * 0.34, 1.5, d * 0.32, id);
        box(lamp, x - w * 0.07, h + 0.85, z - d * 0.07, w * 0.32, 0.18, d * 0.3, id);
        roofHeight = h + 2.6;
      }
    } else if (id === "openclaw") {
      // 04 OpenClaw：实验工坊，红砖锯齿天窗厂房 + 外露钢构桁架 + 机械臂橙色龙门架
      body(x - 2, z, w * 0.78, d, h);
      body(x + w * 0.35, z - d * 0.2, w * 0.28, d * 0.58, h * 1.42);
      for (let i = 0; i < 5; i++) {
        box(lightStone, x - w * 0.39 + i * w * 0.18, h / 2, z + d / 2, 0.68, h, 0.75, id);
      }
      for (let bay = -1; bay <= 1; bay++) {
        box(darkRoof, x - 2 + bay * 4.8, h + 1.25, z - 1, 3.8, 1.5, d * 0.52, id);
        box(glass, x - 2 + bay * 4.8, h + 1.25, z + d * 0.27 - 1, 3.6, 1.3, 0.22, id);
      }
      // 屋顶机械工坊橙色龙门横梁与信标
      box(orange, x + w * 0.35, h * 1.42 + 1.8, z - d * 0.2, w * 0.24, 0.38, d * 0.46, id);
      for (const dz of [-d * 0.2, d * 0.2]) {
        box(metal, x + w * 0.35, h * 1.42 + 1.1, z - d * 0.2 + dz, 0.28, 1.5, 0.28, id);
      }
      box(lamp, x + w * 0.35, h * 1.42 + 2.2, z - d * 0.2, 0.35, 0.35, 0.35, id);
      roofHeight = h * 1.42 + 2.6;
    } else if (id === "slot-5") {
      // 05 LunaTV：影视剧场中心，阶梯放映厅 + 暖光剧院门头灯箱 + 屋顶卫星接收天线阵
      body(x, z, w, d, h * 0.68);
      body(x, z - 0.8, w * 0.82, d * 0.8, h * 0.32, h * 0.68);
      box(orange, x, 4.9, z + d / 2 + 0.85, w * 0.76, 0.85, 1.8, id);
      box(lamp, x, 4.88, z + d / 2 + 1.72, w * 0.7, 0.36, 0.14, id);
      for (let i = -2; i <= 2; i++) {
        box(lightStone, x + i * (w * 0.19), h * 0.35, z + d / 2 + 0.08, 0.35, h * 0.62, 0.35, id);
      }
      part(railMetal, coneGeometry, x + 2.2, h + 2.1, z - 1.5, 1.45, 0.9, 1.45, id);
      box(metal, x - 2.2, h + 3.1, z - 1.5, 0.16, 4.8, 0.16, id);
      box(lamp, x - 2.2, h + 5.6, z - 1.5, 0.3, 0.3, 0.3, id);
      roofHeight = h + 6;
    } else if (id === "slot-6") {
      // 06 LunaTV 源浏览器：媒体检索数据塔，水平遮阳百叶 + 悬挑玻璃数据魔方
      body(x, z, w, d, h);
      for (let floor = 4.5; floor < h - 1; floor += 3.4) {
        box(railMetal, x, floor, z, w + 0.55, 0.18, d + 0.55, id);
      }
      box(glass, x + 1.2, h * 0.72, z + 1.2, w * 0.62, 4.2, d * 0.62, id);
      box(lamp, x + 1.2, h * 0.72, z + 1.2 + d * 0.32, w * 0.54, 0.24, 0.16, id);
      box(metal, x, h + 2.8, z, 0.16, 4.2, 0.16, id);
      box(lamp, x, h + 5.0, z, 0.28, 0.28, 0.28, id);
      roofHeight = h + 5.4;
    } else if (id === "slot-7") {
      // 07 微信推送：消息驿站，双层空中绿植露台 + 信号中继信标塔
      body(x, z, w, d, h * 0.62);
      body(x - 0.6, z - 0.6, w * 0.76, d * 0.76, h * 0.38, h * 0.62);
      box(turf, x, h * 0.62 + 0.65, z + d * 0.32, w * 0.84, 0.24, 2.2, id);
      box(leaves[1], x, h * 0.62 + 0.95, z + d * 0.36, w * 0.76, 0.45, 0.65, id);
      box(metal, x - 0.6, h + 3.2, z - 0.6, 0.18, 5.2, 0.18, id);
      part(railMetal, cylinderGeometry, x - 0.6, h + 3.8, z - 0.6, 0.9, 0.14, 0.9, id);
      box(lamp, x - 0.6, h + 5.9, z - 0.6, 0.34, 0.34, 0.34, id);
      roofHeight = h + 6.3;
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
    if (id) anchors.set(id, new THREE.Vector3(x, roofHeight + 3, z));
  };
  cityLots.forEach((lot, index) => building(lot, index));

  // 坡顶住宅使用真正三角棱柱，区别于办公楼幕墙；门廊、花园和围栏保持街道尺度。
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-0.5, 0); roofShape.lineTo(0, 1); roofShape.lineTo(0.5, 0); roofShape.closePath();
  const pitchedRoof = new THREE.ExtrudeGeometry(roofShape, { depth: 1, bevelEnabled: false });
  pitchedRoof.translate(0, 0, -0.5);
  geometries.add(pitchedRoof);
  const homeWalls = [solid("#d8d6c9"), solid("#c3cbc3"), solid("#e0d2b7"), solid("#b99782")];
  const roofTiles = [solid("#9b563f"), solid("#556369"), solid("#95604c")];
  const housingMaterials = new Set<THREE.Material>([...homeWalls, ...roofTiles]);
  const homeWindow = solid("#465b60", 0.32, 0.13);
  homeWindow.emissive.set("#ffd29a");
  nightMaterials.push({ material: homeWindow, day: 0, night: 1.15 });
  let houseCount = 0;
  let shopCount = 0;
  const cottage = (x: number, z: number, width: number, floors: number, variant: number, gardenWidth = 14) => {
    houseCount++; buildingCount++;
    const depth = variant % 3 === 0 ? 10 : 9;
    const height = floors * 3.05;
    const wall = homeWalls[variant % homeWalls.length];
    const roof = roofTiles[variant % roofTiles.length];
    box(turf, x, 0.27, z + 2.8, gardenWidth, 0.15, 27);
    box(concrete, x, 0.48, z, width + 0.45, 0.34, depth + 0.45);
    box(wall, x, 0.58 + height / 2, z, width, height, depth);
    part(roof, pitchedRoof, x, height + 0.55, z, width + 0.95, 2.15 + width * 0.06, depth + 0.85);
    box(lightStone, x, height + 0.52, z + depth / 2 + 0.15, width + 0.85, 0.24, 0.45);
    box(lightStone, x, height + 0.52, z - depth / 2 - 0.15, width + 0.85, 0.24, 0.45);
    box(roof, x + width * 0.24, height + 2.1, z - depth * 0.27, 0.85, 2.85, 0.88);
    box(lightStone, x + width * 0.24, height + 3.55, z - depth * 0.27, 1.02, 0.18, 1.04);
    const windowGlass = variant % 3 === 0 ? glass : homeWindow;
    for (let floor = 0; floor < floors; floor++) {
      const y = 2.05 + floor * 3.05;
      for (const side of [-1, 1]) for (const dx of [-width * 0.29, width * 0.29]) {
        box(lightStone, x + dx, y, z + side * (depth / 2 + 0.065), 1.5, 1.65, 0.13);
        box(windowGlass, x + dx, y, z + side * (depth / 2 + 0.145), 1.17, 1.32, 0.07);
        box(lightStone, x + dx, y, z + side * (depth / 2 + 0.195), 0.07, 1.32, 0.08);
        if (side === 1 && floor === 0) {
          // 一层正面窗下木质花箱与绿植
          box(trunk, x + dx, y - 0.92, z + depth / 2 + 0.24, 1.42, 0.24, 0.32);
          box(leaves[(variant + 1) % leaves.length], x + dx, y - 0.72, z + depth / 2 + 0.24, 1.32, 0.25, 0.28);
        }
      }
      for (const side of [-1, 1]) {
        box(lightStone, x + side * (width / 2 + 0.065), y, z - 0.4, 0.13, 1.65, 1.5);
        box(windowGlass, x + side * (width / 2 + 0.145), y, z - 0.4, 0.07, 1.32, 1.17);
      }
    }
    box(trunk, x, 1.67, z + depth / 2 + 0.13, 1.18, 2.2, 0.19);
    box(lightStone, x, 0.47, z + depth / 2 + 0.7, 2.4, 0.32, 1.4);
    box(darkRoof, x, 2.94, z + depth / 2 + 0.62, 2.7, 0.18, 1.7);
    box(lamp, x, 2.78, z + depth / 2 + 0.32, 0.28, 0.14, 0.18);
    for (const side of [-1, 1]) box(trunk, x + side, 1.65, z + depth / 2 + 1.13, 0.1, 2.3, 0.1);
    box(pavement, x, 0.38, z + 10.8, 1.7, 0.08, 8.4);
    // 花园留真实出入口，围栏不会横穿入户步道。
    for (const side of [-1, 1]) {
      const fx = x + side * (gardenWidth / 2 - 0.3);
      box(trunk, fx, 1, z + 2.4, 0.1, 0.8, 26);
      for (let dz = -10; dz <= 14; dz += 4) box(lightStone, fx, 0.95, z + dz, 0.2, 1.25, 0.2);
      const frontWidth = gardenWidth / 2 - 1.3;
      box(trunk, x + side * (gardenWidth / 4 + 0.5), 1, z + 15, frontWidth, 0.8, 0.12);
    }
    box(trunk, x, 1, z - 10.6, gardenWidth - 0.6, 0.8, 0.12);
    tree(x + gardenWidth * 0.28, z + 11.5, 0.64, variant);
    if (gardenWidth >= 13 && variant % 2 === 0) {
      box(soil, x - gardenWidth * 0.29, 0.42, z + 10.4, 2.6, 0.22, 4.8);
      for (let row = 0; row < 4; row++) box(leaves[2], x - gardenWidth * 0.29, 0.72, z + 8.6 + row * 1.05, 2.2, 0.45, 0.55);
    }
  };
  const shop = (x: number, z: number, variant: number) => {
    buildingCount++; shopCount++;
    box(homeWalls[variant % 4], x, 2.55, z, 10, 4.2, 10);
    box(darkRoof, x, 4.78, z, 10.8, 0.35, 10.8);
    box(lightStone, x, 5.02, z, 11.0, 0.18, 11.0);
    box(homeWindow, x, 2.05, z + 5.1, 8.8, 3, 0.18);
    for (const mx of [-2.9, 0, 2.9]) box(darkRoof, x + mx, 2.05, z + 5.18, 0.14, 3, 0.12);
    box(variant % 2 ? leaves[0] : orange, x, 3.72, z + 5.75, 10.2, 0.35, 1.7);
    box(lightStone, x, 3.68, z + 6.58, 10.2, 0.18, 0.14);
    box(lightStone, x, 4.17, z + 5.15, 9.4, 0.65, 0.2);
    box(lamp, x, 3.48, z + 5.25, 7.6, 0.12, 0.16);
    // 屋顶空调外机与街角露天咖啡遮阳伞座
    box(railMetal, x - 2.8, 5.3, z - 2.4, 1.6, 0.75, 1.2);
    for (const dx of [-3, 3]) {
      part(trunk, cylinderGeometry, x + dx, 0.8, z + 8, 0.85, 0.12, 0.85);
      box(metal, x + dx, 1.45, z + 8, 0.08, 1.9, 0.08);
      part(variant % 2 ? orange : lightStone, coneGeometry, x + dx, 2.45, z + 8, 1.35, 0.65, 1.35);
      for (const sx of [-0.95, 0.95]) box(trunk, x + dx + sx, 0.56, z + 8, 0.36, 0.42, 0.36);
    }
  };

  // 每个小办公楼带口袋广场，办公与住宅在三个城区中交错分布。
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
    // 口袋广场暖光庭院矮柱灯
    for (const bz of [-3, 8]) {
      box(metal, lot.x + 9.4, 0.72, lot.z + bz, 0.18, 0.65, 0.18);
      box(lamp, lot.x + 9.4, 1.12, lot.z + bz, 0.24, 0.22, 0.24);
    }
  }
  const residentialBlocks = cityBlocks.filter((block) =>
    ![...cityLots, ...civicLots].some((reserved) => reserved.x === block.x && reserved.z === block.z));
  const districtApartments = new Map<string, number>();
  residentialBlocks.forEach((block, index) => {
    box(turf, block.x, 0.27, block.z, 29, 0.15, 29);
    const apartments = districtApartments.get(block.district) ?? 0;
    if (apartments < 2) {
      // 每区两栋低中层公寓，楼下有商店，相邻一户带花园的独立住宅。
      districtApartments.set(block.district, apartments + 1);
      building({ x: block.x - 7, z: block.z - 6, width: 12, depth: 12, height: 11.2 + apartments * 3.2, style: "stone" }, index);
      cottage(block.x + 8, block.z - 3.5, 7.2, 2, houseCount, 12);
      shop(block.x - 7, block.z + 8.5, shopCount);
    } else if ([3, 7, 12, 18].includes(index)) {
      for (const dx of [-9.4, 0, 9.4]) cottage(block.x + dx, block.z - 3.5, 6.6, 2, houseCount, 8.8);
    } else {
      cottage(block.x - 7.2, block.z - 3.5, 7.5, index % 4 === 0 ? 1 : 2, houseCount);
      cottage(block.x + 7.2, block.z - 3.5, 7.5, 2, houseCount);
    }
  });
  // 城区之外直接过渡为不规则林地和少量菜田，不再生成第四片空路网。
  const woodlandPatches = [
    { x: -189, z: -222, radius: 24 }, { x: -131, z: -279, radius: 40 },
    { x: -42, z: -259, radius: 27 }, { x: 114, z: -263, radius: 30 },
    { x: -164, z: -372, radius: 40 }, { x: -41, z: -352, radius: 44 },
    { x: 76, z: -365, radius: 35 }, { x: 211, z: -281, radius: 38 },
  ];
  for (const [index, patch] of woodlandPatches.entries()) {
    for (let i = 0; i < 25; i++) {
      const angle = random() * Math.PI * 2, distance = Math.sqrt(random()) * patch.radius;
      const x = patch.x + Math.cos(angle) * distance, z = patch.z + Math.sin(angle) * distance;
      if (z < -405 || z > -216 && x > -82) continue;
      tree(x, z, 0.9 + random() * 0.85, index + i);
      if (i % 3 === 0) part(leaves[(index + 1) % 4], crownGeometry, x + 2.4, 0.45, z - 1.5, 2.5, 0.75, 1.8);
    }
  }
  for (const field of [{ x: -112, z: -225, w: 23, d: 17 }, { x: 8, z: -287, w: 25, d: 15 }, { x: 165, z: -247, w: 21, d: 18 }]) {
    box(soil, field.x, 0.2, field.z, field.w, 0.12, field.d);
    for (let row = 0; row < 6; row++) box(leaves[row % 3], field.x, 0.43, field.z - field.d * 0.4 + row * field.d * 0.16, field.w - 1.6, 0.35, 0.65);
  }
  for (let i = 0; i < 65; i++) {
    const side = i % 2 ? -1 : 1;
    tree(side * (233 + random() * 30), -168 + random() * 250, 0.9 + random() * 0.5, i);
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

  // 紧凑北侧丘陵与林带：削减80%远景冗余顶点与实例，保障60FPS丝滑帧率
  const terrainHeight = (x: number, z: number) => {
    const rise = THREE.MathUtils.smoothstep(-z, 225, 480);
    return rise * (34 + 16 * Math.sin(x * 0.008 + z * 0.003) + 12 * Math.cos(z * 0.014)) - 0.15;
  };
  for (let i = 0; i < 52; i++) {
    const x = -250 + random() * 500;
    const z = -222 - random() * 95;
    tree(x, z, 1.05 + random() * 1.15, i, terrainHeight(x, z));
  }
  const terrainGeometry = new THREE.PlaneGeometry(960, 420, 48, 22);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.getAttribute("position");
  const terrainColors: number[] = [];
  const terrainLow = new THREE.Color("#52784a");
  const terrainHigh = new THREE.Color("#738f5d");
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
  // 前车（红色轿车，被追尾后向右前方偏斜）
  part(crashCarRed, boxGeometry, -73.4, 0.86, 67.6, 1.85, 0.68, 4.2, undefined, 0.32);
  part(crashCarRed, boxGeometry, -73.4, 1.34, 67.6, 1.56, 0.48, 2.2, undefined, 0.32);
  part(glass, boxGeometry, -73.4, 1.35, 67.6, 1.6, 0.42, 2.35, undefined, 0.32);
  // 后车（蓝色SUV，追尾撞上前车尾部，引擎盖翘起受损）
  part(crashCarBlue, boxGeometry, -74.2, 0.92, 71.4, 1.92, 0.76, 4.5, undefined, -0.22);
  part(crashCarBlue, boxGeometry, -74.2, 1.44, 71.2, 1.66, 0.56, 2.7, undefined, -0.22);
  part(glass, boxGeometry, -74.2, 1.45, 71.2, 1.7, 0.48, 2.8, undefined, -0.22);
  part(crashCarBlue, boxGeometry, -73.9, 1.42, 69.5, 1.75, 0.12, 1.35, undefined, -0.22, 0.38);
  // 现场勘查警车（斜停在路口北侧拦住车流）
  part(lightStone, boxGeometry, -77.4, 0.88, 64.2, 1.9, 0.7, 4.4, undefined, 0.52);
  part(policeBlue, boxGeometry, -77.4, 1.36, 64.2, 1.6, 0.5, 2.3, undefined, 0.52);
  part(glass, boxGeometry, -77.4, 1.37, 64.2, 1.64, 0.42, 2.4, undefined, 0.52);
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
    const mat = parkedPalette[idx % parkedPalette.length];
    part(mat, boxGeometry, px, 0.85, pz, 1.82, 0.68, 4.1, undefined, rot);
    part(mat, boxGeometry, px, 1.32, pz, 1.54, 0.48, 2.2, undefined, rot);
    part(glass, boxGeometry, px, 1.33, pz, 1.58, 0.42, 2.35, undefined, rot);
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
  };
  const { landmarks: civicLandmarks } = buildCivicDistrict(cityKit);
  const civicMaterials = new Set([...materials].filter((material) => !existingMaterials.has(material)));
  group.children.slice(firstCivicObject).forEach((object) => {
    if (object instanceof THREE.Mesh) pickables.push(object);
  });
  group.userData.civicLandmarks = civicLandmarks;
  const life = buildCityLife({ group, geometries, materials });
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

  const drawBatches = new Map<string, { sources: Batch[]; pickable: boolean }>();
  for (const batch of batches.values()) {
    const pickable = batch.parts.some((value) => value.place) || housingMaterials.has(batch.material) || civicMaterials.has(batch.material) || coastMaterials.has(batch.material);
    const material = batch.material;
    let surfaceKey = material.uuid;
    if (material instanceof THREE.MeshStandardMaterial && material.constructor === THREE.MeshStandardMaterial
      && !material.transparent && !material.vertexColors && material.emissive.getHex() === 0
      && !Object.values(material).some((value) => value instanceof THREE.Texture)
      && material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile
      && material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey) {
      // 保留全部表面参数，仅将基础颜色交给实例属性；夜景、纹理与自定义 shader 独立绘制。
      const surface = Object.fromEntries(Object.entries(material.toJSON()).filter(([key]) => !["uuid", "metadata", "color"].includes(key)));
      surfaceKey = JSON.stringify([surface, material.defines]);
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

  const carCount = 60;
  const bodyMaterial = solid("#ffffff", 0.24, 0.42);
  const cars = new THREE.InstancedMesh(boxGeometry, bodyMaterial, carCount);
  const cabins = new THREE.InstancedMesh(boxGeometry, bodyMaterial, carCount);
  const windshields = new THREE.InstancedMesh(boxGeometry, glass, carCount);
  const lights = new THREE.InstancedMesh(boxGeometry, lamp, carCount * 2);
  const taillights = new THREE.InstancedMesh(boxGeometry, tailRed, carCount * 2);
  const roofUnits = new THREE.InstancedMesh(boxGeometry, lightStone, carCount);
  const wheels = new THREE.InstancedMesh(cylinderGeometry, darkRoof, carCount * 4);
  const rims = new THREE.InstancedMesh(cylinderGeometry, railMetal, carCount * 4);
  const vehicleMeshes = [cars, cabins, windshields, lights, taillights, roofUnits, wheels, rims];
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
  const sirenBlue = solid("#0a84ff", 0.3, 0.1);
  sirenBlue.emissive.set("#0a84ff");
  nightMaterials.push({ material: sirenBlue, day: 0.9, night: 3.5 });
  const smokeMat = solid("#dce2e6", 0.92, 0.0);

  const signalCount = Math.max(1, signalIntersections.length);
  const signalRedMesh = new THREE.InstancedMesh(boxGeometry, tailRed, signalCount);
  const signalGreenMesh = new THREE.InstancedMesh(boxGeometry, signalGreen, signalCount);
  const smokeCount = 7;
  const crashSmokeMesh = new THREE.InstancedMesh(crownGeometry, smokeMat, smokeCount);
  const strobeRedMesh = new THREE.InstancedMesh(boxGeometry, tailRed, 5);
  const strobeBlueMesh = new THREE.InstancedMesh(boxGeometry, sirenBlue, 2);
  const dynamicSceneMeshes = [signalRedMesh, signalGreenMesh, crashSmokeMesh, strobeRedMesh, strobeBlueMesh];
  dynamicSceneMeshes.forEach((mesh) => {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
  });

  const carPalette = [
    "#f2efe9", "#d6dce0", "#2f5d7c", "#c84b38", "#2d6a62",
    "#d8b056", "#313a42", "#728c9c", "#9c4138", "#e8e2d5",
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

  const routes = Array.from({ length: carCount }, (_, i) => {
    const kind: "bus" | "truck" | "taxi" | "suv" | "sedan" =
      i % 15 === 0 ? "bus" : i % 11 === 0 ? "truck" : i % 6 === 0 ? "taxi" : i % 3 === 0 ? "suv" : "sedan";
    const bodyColor =
      kind === "bus" ? "#d97736" :
      kind === "taxi" ? "#f0be3c" :
      kind === "truck" ? "#dce2e6" :
      carPalette[i % carPalette.length];
    const paint = new THREE.Color(bodyColor);
    cars.setColorAt(i, paint);
    cabins.setColorAt(i, paint);

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
      phase: random() * Math.PI * 2,
    };
  });
  let lastNight: boolean | undefined;
  const setNight = (night: boolean) => {
    if (lastNight === night) return;
    lastNight = night;
    nightMaterials.forEach(({ material, day, night: value }) => { material.emissiveIntensity = night ? value : day; });
    waterMaterial.uniforms.uNight.value = night ? 1 : 0;
  };
  const animate = (seconds: number, night: boolean) => {
    setNight(night);
    life.animate(seconds);
    coast.animate(seconds);
    waterMaterial.uniforms.uTime.value = seconds;

    // 10秒周期交通信号灯切换：0..10s 东西向绿灯/南北向红灯；10..20s 东西向红灯/南北向绿灯
    const cycle = THREE.MathUtils.euclideanModulo(seconds, 20);
    const ewGreen = cycle < 10;
    signalIntersections.forEach((node, idx) => {
      // 悬臂红灯与绿灯位置切换高亮
      transform.position.set(node.x + 2.5, ewGreen ? -10 : 5.38, node.z + 6.58);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(0.24, 0.24, 0.08);
      transform.updateMatrix();
      signalRedMesh.setMatrixAt(idx, transform.matrix);

      transform.position.set(node.x + 3.08, ewGreen ? 5.38 : -10, node.z + 6.58);
      transform.scale.set(0.24, 0.24, 0.08);
      transform.updateMatrix();
      signalGreenMesh.setMatrixAt(idx, transform.matrix);
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
    transform.position.set(-77.65, flashOn ? 1.68 : -10, 64.05);
    transform.rotation.set(0, 0.52, 0);
    transform.scale.set(0.42, 0.14, 0.22);
    transform.updateMatrix();
    strobeRedMesh.setMatrixAt(0, transform.matrix);
    // 警车蓝灯
    transform.position.set(-77.15, !flashOn ? 1.68 : -10, 64.35);
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

    routes.forEach((route, index) => {
      let distance = THREE.MathUtils.euclideanModulo(route.offset + seconds * route.speed, route.totalLength);
      let edgeIdx = 0;
      let along = distance;
      for (let e = 0; e < route.edges.length; e++) {
        if (along <= route.edges[e].len || e === route.edges.length - 1) {
          edgeIdx = e;
          break;
        }
        along -= route.edges[e].len;
      }
      const edge = route.edges[edgeIdx];
      const nextEdge = route.edges[(edgeIdx + 1) % route.edges.length];
      const isHorizontal = Math.abs(edge.ux) > 0.5;
      const redLight = isHorizontal ? !ewGreen : ewGreen;
      const distToCorner = edge.len - along;

      // 红灯停车逻辑：当车辆接近路口停止线 (9m..16m) 且当前方向为红灯时，平稳停在斑马线停止线前等待绿灯
      if (redLight && distToCorner > 8.2 && distToCorner < 16.5) {
        along = edge.len - 8.8;
      }

      // 车道右侧通行偏移 (2.35m)，在路口前 3.2m 内平滑转向下一条道路方向，杜绝直角瞬移和冲出路面
      const turnZone = 3.2;
      const turnBlend = along > edge.len - turnZone ? (along - (edge.len - turnZone)) / turnZone : 0;
      const laneOffset = 2.35;
      const baseX = edge.from.x + edge.ux * along + edge.uz * laneOffset;
      const baseZ = edge.from.z + edge.uz * along - edge.ux * laneOffset;
      const nextStartX = nextEdge.from.x + nextEdge.uz * laneOffset;
      const nextStartZ = nextEdge.from.z - nextEdge.ux * laneOffset;
      const x = turnBlend > 0 ? THREE.MathUtils.lerp(baseX, nextStartX, turnBlend * 0.45) : baseX;
      const z = turnBlend > 0 ? THREE.MathUtils.lerp(baseZ, nextStartZ, turnBlend * 0.45) : baseZ;

      let angleDiff = nextEdge.heading - edge.heading;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      const angle = edge.heading + angleDiff * (turnBlend * turnBlend * (3 - 2 * turnBlend));

      const isBus = route.kind === "bus";
      const isTruck = route.kind === "truck";
      const isSuv = route.kind === "suv";
      const isTaxi = route.kind === "taxi";
      const length = isBus ? 8.6 : isTruck ? 6.6 : isSuv ? 4.65 : 4.35;
      const width = isBus ? 2.15 : isTruck ? 2.05 : 1.86;
      const bodyH = isBus ? 1.85 : isTruck ? 0.78 : isSuv ? 0.76 : 0.66;
      const y = 0.88 + (isBus ? 0.56 : isTruck ? 0.12 : 0);
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);

      // 1. 车身底盘与流线型下车体
      transform.position.set(x, y, z);
      transform.rotation.set(0, angle, 0);
      transform.scale.set(width, bodyH, length);
      transform.updateMatrix();
      cars.setMatrixAt(index, transform.matrix);

      // 2. 乘员舱上车体 / 驾驶室
      const cabinZOffset = isTruck ? length * 0.26 : isBus ? 0 : -length * 0.05;
      const cabinLen = isBus ? length * 0.94 : isTruck ? length * 0.34 : isSuv ? length * 0.64 : length * 0.54;
      const cabinH = isBus ? 0.72 : isTruck ? 1.05 : isSuv ? 0.58 : 0.48;
      const cabinY = y + bodyH * 0.5 + cabinH * 0.46;
      transform.position.set(x + sinA * cabinZOffset, cabinY, z + cosA * cabinZOffset);
      transform.scale.set(width * 0.86, cabinH, cabinLen);
      transform.updateMatrix();
      cabins.setMatrixAt(index, transform.matrix);

      // 3. 环绕式深色反光车窗与前后挡风玻璃
      transform.position.set(x + sinA * cabinZOffset, cabinY - 0.02, z + cosA * cabinZOffset);
      transform.scale.set(width * 0.89, cabinH * 0.78, cabinLen * 1.03);
      transform.updateMatrix();
      windshields.setMatrixAt(index, transform.matrix);

      // 4. 车顶构件：出租车顶灯、巴士空调包、货车白色高顶货厢或SUV行李架
      if (isTruck) {
        const boxOffset = -length * 0.18;
        transform.position.set(x + sinA * boxOffset, y + 0.95, z + cosA * boxOffset);
        transform.scale.set(width * 0.98, 1.65, length * 0.58);
      } else if (isTaxi) {
        transform.position.set(x + sinA * cabinZOffset, cabinY + cabinH * 0.58, z + cosA * cabinZOffset);
        transform.scale.set(0.62, 0.2, 0.28);
      } else if (isBus) {
        transform.position.set(x - sinA * 0.8, cabinY + cabinH * 0.56, z - cosA * 0.8);
        transform.scale.set(1.4, 0.22, 2.6);
      } else if (isSuv) {
        transform.position.set(x + sinA * cabinZOffset, cabinY + cabinH * 0.54, z + cosA * cabinZOffset);
        transform.scale.set(width * 0.68, 0.08, cabinLen * 0.72);
      } else {
        transform.position.set(x, -10, z);
        transform.scale.set(0.001, 0.001, 0.001);
      }
      transform.updateMatrix();
      roofUnits.setMatrixAt(index, transform.matrix);

      // 5. 前大灯、红宝石尾灯、轮胎与银色铝合金轮毂
      for (const side of [-1, 1]) {
        const sideIndex = side > 0 ? 1 : 0;
        const lampLateral = width * 0.34 * side;
        transform.position.set(
          x + sinA * (length / 2) + cosA * lampLateral,
          y + 0.06,
          z + cosA * (length / 2) - sinA * lampLateral,
        );
        transform.rotation.set(0, angle, 0);
        transform.scale.set(0.36, 0.16, 0.12);
        transform.updateMatrix();
        lights.setMatrixAt(index * 2 + sideIndex, transform.matrix);

        transform.position.set(
          x - sinA * (length / 2) + cosA * lampLateral,
          y + 0.08,
          z - cosA * (length / 2) - sinA * lampLateral,
        );
        transform.scale.set(0.4, 0.15, 0.1);
        transform.updateMatrix();
        taillights.setMatrixAt(index * 2 + sideIndex, transform.matrix);

        for (const axle of [-1, 1]) {
          const wheelIdx = index * 4 + sideIndex * 2 + (axle > 0 ? 1 : 0);
          const wx = x + cosA * side * (width * 0.5) + sinA * axle * (length * 0.31);
          const wy = y - (isBus ? 0.82 : 0.3);
          const wz = z - sinA * side * (width * 0.5) + cosA * axle * (length * 0.31);
          transform.position.set(wx, wy, wz);
          transform.rotation.set(0, angle, Math.PI / 2);
          transform.scale.set(0.36, 0.2, 0.36);
          transform.updateMatrix();
          wheels.setMatrixAt(wheelIdx, transform.matrix);

          transform.position.set(wx + cosA * side * 0.02, wy, wz - sinA * side * 0.02);
          transform.scale.set(0.21, 0.21, 0.21);
          transform.updateMatrix();
          rims.setMatrixAt(wheelIdx, transform.matrix);
        }
        transform.rotation.set(0, angle, 0);
      }
    });
    vehicleMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
    dynamicSceneMeshes.forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  };
  // 动态实例的包围球覆盖整条路线，避免离开首帧位置后被视锥误裁剪。
  vehicleMeshes.forEach((mesh) => { mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 65), 390); });
  group.userData.buildingCount = buildingCount + 5;
  group.userData.vehicleCount = carCount;
  animate(0, false);
  return {
    group, billboardSign: sign, anchors, pickables, animate, setNight,
    dispose: () => {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
      textures.forEach((texture) => texture.dispose());
      group.traverse((object) => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
      group.clear();
      anchors.clear();
      pickables.length = 0;
      geometries.clear();
      materials.clear();
      textures.clear();
    },
  };
}
