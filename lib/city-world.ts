import * as THREE from "three";
import { cityLots, ROAD_SEGMENTS, cityBlocks, districts, civicLots, type CityLot } from "./city-map";
import type { PlaceId } from "./city-content";
import { buildCivicDistrict } from "./city-civic";
import { buildCityLife } from "./city-life";
import { buildCityCoast } from "./city-coast";

export type CityWorld = {
  group: THREE.Group;
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
  const crownGeometry = new THREE.SphereGeometry(1, 10, 8);
  const roundTowerGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 28);
  const roundUv = roundTowerGeometry.getAttribute("uv");
  for (let index = 0; index < roundUv.count; index++) roundUv.setX(index, roundUv.getX(index) * Math.PI);
  const coneGeometry = new THREE.ConeGeometry(1, 1, 8);
  [boxGeometry, cylinderGeometry, crownGeometry, coneGeometry, roundTowerGeometry].forEach((value) => geometries.add(value));
  let seed = 92831;
  const random = () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  const solid = (color: string, roughness = 0.82, metalness = 0.04) => {
    const value = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materials.add(value);
    return value;
  };
  const concrete = solid("#b2afa5");
  const lightStone = solid("#d0c6b1");
  const darkRoof = solid("#505b5b");
  const paleRoof = solid("#9caaa8");
  const pavement = solid("#8c9088");
  const curb = solid("#c2bca9");
  const asphalt = solid("#3d4648", 0.95);
  const roadLine = solid("#d5cfb9");
  const grass = solid("#72885c");
  const turf = solid("#91a66e");
  const soil = solid("#718062");
  const trunk = solid("#665344");
  const leaves = [solid("#354f3a"), solid("#4c6645"), solid("#687547"), solid("#747b48")];
  const metal = solid("#4b5557", 0.48, 0.45);
  const railMetal = solid("#a2aaa4", 0.4, 0.45);
  const glass = solid("#46616b", 0.28, 0.3);
  const orange = solid("#c8753f");
  const lamp = solid("#f7dca3");
  lamp.emissive.set("#ffcc7a");
  nightMaterials.push({ material: lamp, day: 0.1, night: 3.4 });

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
    const lit: boolean[] = [];
    const map = canvasTexture(256, 512, (ctx) => {
      ctx.fillStyle = tone;
      ctx.fillRect(0, 0, 256, 512);
      for (let row = 0; row < 16; row++) {
        for (let col = 0; col < 8; col++) {
          const on = random() > 0.66;
          lit.push(on);
          const x = col * 32;
          const y = row * 32;
          const inset = kind === "glass" ? 1 : 7;
          const lightness = 24 + random() * 17;
          ctx.fillStyle = on && kind !== "glass" ? "#868579" : `hsl(200 14% ${lightness}%)`;
          ctx.fillRect(x + inset, y + (kind === "glass" ? 1 : 6), 32 - inset * 2, kind === "glass" ? 30 : 20);
          if (kind === "glass") {
            const reflection = ctx.createLinearGradient(x, y, x + 30, y + 32);
            reflection.addColorStop(0, "rgba(180,202,205,0.27)");
            reflection.addColorStop(0.6, "rgba(54,84,102,0.06)");
            reflection.addColorStop(1, "rgba(202,175,135,0.22)");
            ctx.fillStyle = reflection;
            ctx.fillRect(x + 1, y + 1, 30, 30);
          } else {
            ctx.fillStyle = "rgba(8,21,25,0.45)";
            ctx.fillRect(x + inset, y + 6, 32 - inset * 2, 2);
            ctx.fillStyle = kind === "brick" ? "#927b67" : "#b9b6a8";
            ctx.fillRect(x + 4, y + 26, 24, 2);
          }
        }
      }
      if (kind === "brick") {
        ctx.strokeStyle = "rgba(53,32,25,0.23)";
        ctx.lineWidth = 1;
        for (let y = 0; y < 512; y += 8) {
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
          for (let x = (y % 16 ? 0 : 8); x < 256; x += 16) {
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 8); ctx.stroke();
          }
        }
      }
    });
    const emissiveMap = canvasTexture(256, 512, (ctx) => {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 256, 512);
      lit.forEach((on, index) => {
        if (!on) return;
        const inset = kind === "glass" ? 3 : 8;
        ctx.fillStyle = index % 5 === 0 ? "#b4c4c7" : index % 3 === 0 ? "#d0a576" : "#e9c899";
        ctx.fillRect(index % 8 * 32 + inset, Math.floor(index / 8) * 32 + 6, 32 - inset * 2, 20);
      });
    });
    const value = new THREE.MeshStandardMaterial({
      color: "#ffffff", map, emissiveMap, emissive: "#ffdfad", emissiveIntensity: 0.055,
      roughness: kind === "glass" ? 0.31 : 0.87, metalness: kind === "glass" ? 0.28 : 0.02,
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
        .replace("diffuseColor *= sampledDiffuseColor;", "diffuseColor *= mix(vec4(0.55, 0.57, 0.54, 1.0), sampledDiffuseColor, vWall);")
        .replace("totalEmissiveRadiance *= emissiveColor.rgb;", "totalEmissiveRadiance *= emissiveColor.rgb * vWall;");
    };
    value.customProgramCacheKey = () => "city-facade-metres-v1";
    materials.add(value);
    nightMaterials.push({ material: value, day: 0.045, night: 1.15 });
    return value;
  };
  const facades = {
    glass: [facade("glass", "#435e68"), facade("glass", "#5a696a"), facade("glass", "#344e5d")],
    stone: [facade("stone", "#b2b0a1"), facade("stone", "#a3a99f"), facade("stone", "#c2b6a0")],
    brick: [facade("brick", "#896958"), facade("brick", "#9b7d66")],
  };

  // 单侧海岸连续延伸至远景；西岸沙滩没有挡墙，海港入口留在东侧。
  box(soil, 0, -2.2, -675, 2200, 4, 1580);
  box(grass, 20, 0.08, -57.5, 500, 0.12, 345);
  box(concrete, 120, -1.7, 114, 400, 3, 2.5);
  box(pavement, 120, 0.15, 107, 400, 0.3, 14);
  box(pavement, -152.5, 0.15, 103, 145, 0.3, 6);
  box(curb, 59, 0.27, 112, 278, 0.32, 1.1);
  box(curb, 271, 0.27, 112, 98, 0.32, 1.1);

  const roadNodes = new Map<string, { x: number; z: number; directions: { x: number; z: number }[] }>();
  for (const road of ROAD_SEGMENTS) {
    const horizontal = road.z1 === road.z2;
    const length = Math.hypot(road.x2 - road.x1, road.z2 - road.z1);
    const x = (road.x1 + road.x2) / 2, z = (road.z1 + road.z2) / 2;
    box(curb, x, 0.2, z, horizontal ? length : 15.4, 0.3, horizontal ? 15.4 : length);
    box(asphalt, x, 0.38, z, horizontal ? length : 11, 0.08, horizontal ? 11 : length);
    for (let offset = 10; offset < length - 8; offset += 8) {
      box(roadLine, road.x1 + (horizontal ? offset : 0), 0.435, road.z1 + (horizontal ? 0 : offset), horizontal ? 3.8 : 0.14, 0.025, horizontal ? 0.14 : 3.8);
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
    for (const direction of node.directions) for (let i = -3; i <= 3; i++) {
      box(roadLine, node.x + direction.x * 6.8 + direction.z * i * 1.2, 0.457, node.z + direction.z * 6.8 + direction.x * i * 1.2, direction.x ? 2 : 0.55, 0.025, direction.x ? 0.55 : 2);
    }
  }
  const streetLamp = (x: number, z: number, turn = 1, y = 0) => {
    box(metal, x, 3.5 + y, z, 0.17, 7, 0.17);
    box(metal, x + turn * 0.75, 7 + y, z, 1.7, 0.16, 0.2);
    box(lamp, x + turn * 1.4, 6.92 + y, z, 0.9, 0.12, 0.4);
  };
  const tree = (x: number, z: number, size = 1, shade = 0, y = 0) => {
    part(trunk, cylinderGeometry, x, y + 1.5 * size, z, 0.19 * size, 3 * size, 0.19 * size);
    part(leaves[shade % leaves.length], crownGeometry, x, y + 4 * size, z, 1.7 * size, 2.5 * size, 1.6 * size);
    part(leaves[(shade + 1) % leaves.length], crownGeometry, x + size * 0.85, y + 3.8 * size, z - size * 0.5, 1.3 * size, 1.7 * size, 1.4 * size);
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
    box(metal, x, 0.9, 112.2, 0.12, 1.6, 0.12);
    box(metal, x, 1.65, 112.2, 14, 0.12, 0.12);
  }

  let buildingCount = 0;
  const rooftop = (x: number, z: number, w: number, d: number, height: number, id?: PlaceId) => {
    box(paleRoof, x, height + 0.28, z, w + 0.35, 0.55, d + 0.35, id);
    for (const dx of [-w / 2, w / 2]) box(concrete, x + dx, height + 0.7, z, 0.35, 0.9, d, id);
    for (const dz of [-d / 2, d / 2]) box(concrete, x, height + 0.7, z + dz, w, 0.9, 0.35, id);
    box(darkRoof, x + w * 0.19, height + 1, z + d * 0.14, Math.max(2, w * 0.26), 1.2, Math.max(2, d * 0.2), id);
    box(railMetal, x - w * 0.21, height + 0.75, z - d * 0.19, w * 0.2, 0.5, d * 0.23, id);
    if (height > 45) box(metal, x - w * 0.25, height + 3.5, z + d * 0.28, 0.13, 7, 0.13, id);
  };
  const building = (lot: Building, variant: number) => {
    buildingCount++;
    const { x, z, width: w, depth: d, height: h, id, style } = lot;
    const type = style === "glass" ? "glass" : style === "brick" ? "brick" : "stone";
    const face = facades[type][variant % facades[type].length];
    box(pavement, x, 0.38, z, w + 0.8, 0.25, d + 0.8, id);
    const body = (bx: number, bz: number, bw: number, bd: number, bh: number, base = 0.55) => {
      box(face, bx, base + bh / 2, bz, bw, bh, bd, id);
      rooftop(bx, bz, bw, bd, base + bh, id);
    };
    let roofHeight = h + 0.55;
    if (id === "agents") {
      // 主塔的三次退台、垂直肋与尖顶构成可辨识的天际线。
      body(x, z, w, d, h * 0.6);
      body(x, z - 1, w * 0.8, d * 0.82, h * 0.29, h * 0.6);
      body(x, z - 1.5, w * 0.58, d * 0.64, h * 0.11, h * 0.89);
      box(lightStone, x, h + 3.8, z - 1.5, w * 0.59, 7, d * 0.65, id);
      part(railMetal, coneGeometry, x, h + 10.5, z - 1.5, 3.1, 13, 3.1, id);
      box(lamp, x, h + 17.2, z - 1.5, 0.4, 0.8, 0.4, id);
      for (const dx of [-w / 2, w / 2]) box(lightStone, x + dx, h * 0.3, z + d / 2, 0.8, h * 0.6, 0.9, id);
      roofHeight = h + 18;
    } else if (id === "quant") {
      body(x, z, w, d, 10);
      body(x - 3.8, z - 1.2, w * 0.55, d * 0.8, h - 10, 10);
      body(x + w * 0.28, z + d * 0.12, w * 0.34, d * 0.67, h * 0.71, 10);
      box(railMetal, x - 3.8, h + 1, z - 1.2, w * 0.56, 1.8, d * 0.81, id);
      for (let i = 0; i < 5; i++) box(railMetal, x - w * 0.4 + i * w * 0.12, h / 2, z + d * 0.36, 0.25, h - 3, 0.45, id);
    } else if (id === "affine" || style === "terrace" && variant % 2 === 0) {
      for (let tier = 0; tier < 3; tier++) {
        const tw = w * (1 - tier * 0.2);
        const td = d * (1 - tier * 0.18);
        const th = h / 3;
        body(x - tier * w * 0.035, z - tier * d * 0.035, tw, td, th, 0.5 + tier * th);
        box(turf, x - tier * w * 0.035, 0.5 + (tier + 1) * th + 0.6, z + td * 0.36, tw * 0.76, 0.2, 2.5, id);
        for (let i = 0; i < 3; i++) tree(x + (i - 1) * tw * 0.3, z + td * 0.38, 0.48, i, 1 + (tier + 1) * th);
      }
    } else if (id === "openclaw") {
      body(x - 2, z, w * 0.78, d, h);
      body(x + w * 0.35, z - d * 0.2, w * 0.28, d * 0.58, h * 1.42);
      for (let i = 0; i < 5; i++) box(lightStone, x - w * 0.39 + i * w * 0.18, h / 2, z + d / 2, 0.65, h, 0.7, id);
      box(glass, x - 2, h + 1.1, z, w * 0.48, 1.6, d * 0.36, id);
      roofHeight = h * 1.42 + 1;
    } else if ((variant % 11 === 0 || variant % 13 === 0) && h > 25) {
      body(x, z, w, d, 4.2);
      part(facades.glass[variant % 3], roundTowerGeometry, x, 4.2 + (h - 4.2) / 2, z, w * 0.97, h - 4.2, d * 0.97, id);
      part(paleRoof, cylinderGeometry, x, h + 0.3, z, w * 0.5, 0.6, d * 0.5, id);
      part(glass, cylinderGeometry, x, h + 2, z, w * 0.26, 3, d * 0.26, id);
      box(metal, x, h + 4.7, z, 0.15, 5.3, 0.15, id);
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
    } else {
      body(x, z, w, d, h);
      if (variant % 8 === 6) {
        for (let i = -1; i <= 1; i++) box(lightStone, x + i * w * 0.33, h / 2, z + d / 2, 0.65, h, 0.8, id);
        box(lightStone, x, h + 1.4, z, w + 1.1, 1.2, d + 1.1, id);
      }
    }
    // 街层门厅与雨篷使缩放到街区时仍有真实尺度。
    box(glass, x, 2.15, z + d / 2 + 0.09, Math.min(w * 0.38, 5), 3.1, 0.22, id);
    box(darkRoof, x, 3.85, z + d / 2 + 0.7, Math.min(w * 0.48, 7), 0.25, 1.9, id);
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
    box(concrete, x, 0.48, z, width + 0.35, 0.3, depth + 0.35);
    box(wall, x, 0.58 + height / 2, z, width, height, depth);
    part(roof, pitchedRoof, x, height + 0.55, z, width + 0.9, 2.1 + width * 0.06, depth + 0.8);
    box(lightStone, x, height + 0.52, z + depth / 2 + 0.15, width + 0.8, 0.24, 0.45);
    box(lightStone, x, height + 0.52, z - depth / 2 - 0.15, width + 0.8, 0.24, 0.45);
    box(roof, x + width * 0.24, height + 2.1, z - depth * 0.27, 0.8, 2.8, 0.85);
    const windowGlass = variant % 3 === 0 ? glass : homeWindow;
    for (let floor = 0; floor < floors; floor++) {
      const y = 2.05 + floor * 3.05;
      for (const side of [-1, 1]) for (const dx of [-width * 0.29, width * 0.29]) {
        box(lightStone, x + dx, y, z + side * (depth / 2 + 0.065), 1.5, 1.65, 0.13);
        box(windowGlass, x + dx, y, z + side * (depth / 2 + 0.145), 1.17, 1.32, 0.07);
        box(lightStone, x + dx, y, z + side * (depth / 2 + 0.195), 0.07, 1.32, 0.08);
      }
      for (const side of [-1, 1]) {
        box(lightStone, x + side * (width / 2 + 0.065), y, z - 0.4, 0.13, 1.65, 1.5);
        box(windowGlass, x + side * (width / 2 + 0.145), y, z - 0.4, 0.07, 1.32, 1.17);
      }
    }
    box(trunk, x, 1.67, z + depth / 2 + 0.13, 1.18, 2.2, 0.19);
    box(lightStone, x, 0.47, z + depth / 2 + 0.7, 2.3, 0.32, 1.3);
    box(darkRoof, x, 2.94, z + depth / 2 + 0.62, 2.6, 0.17, 1.65);
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
    box(glass, x, 2.05, z + 5.1, 8.8, 3, 0.18);
    box(variant % 2 ? leaves[0] : orange, x, 3.72, z + 5.75, 10.2, 0.35, 1.7);
    box(lightStone, x, 4.17, z + 5.15, 9.4, 0.65, 0.2);
    for (const dx of [-3, 3]) {
      part(trunk, cylinderGeometry, x + dx, 0.8, z + 8, 0.85, 0.12, 0.85);
      box(metal, x + dx, 0.43, z + 8, 0.12, 0.75, 0.12);
    }
  };

  // 每个小办公楼带口袋广场，办公与住宅在三个城区中交错分布。
  for (const lot of cityLots) {
    if (lot.width > 20) continue;
    box(turf, lot.x, 0.3, lot.z, 29, 0.18, 29);
    box(pavement, lot.x + 11, 0.42, lot.z + 1, 2.6, 0.1, 24);
    box(pavement, lot.x, 0.42, lot.z + 10.5, 26, 0.1, 2.8);
    tree(lot.x + 10.5, lot.z - 10, 0.9, 0);
    tree(lot.x - 10, lot.z + 10, 0.9, 2);
    box(trunk, lot.x + 10, 0.95, lot.z + 4, 0.5, 0.22, 3.2);
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
  sign.userData.place = "about";
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
    box(lightStone, x, 3.25, 105, 16, 5.8, 8, id);
    box(glass, x, 2.8, 109.1, 13, 4.6, 0.25, id);
    box(darkRoof, x, 6.45, 105, 18, 0.5, 9.5, id);
    box(orange, x, 5.7, 109.3, 15, 0.85, 0.25, id);
    const texture = canvasTexture(512, 96, (ctx) => {
      ctx.fillStyle = "#273538"; ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = "#f5e3c7"; ctx.font = "bold 40px Arial, sans-serif";
      ctx.textAlign = "center"; ctx.fillText(title, 256, 63);
    });
    const material = new THREE.MeshBasicMaterial({ map: texture });
    materials.add(material);
    const geometry = new THREE.PlaneGeometry(12.5, 2.35);
    geometries.add(geometry);
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(x, 8.1, 107); panel.userData.place = id;
    group.add(panel); pickables.push(panel);
    anchors.set(id, new THREE.Vector3(x, 11, 104.5));
    buildingCount++;
  };
  publicBuilding("news", -95, "THE CITY PRESS");
  publicBuilding("guestbook", 95, "LETTERS TO SN0VV");

  // 波纹沿近似同向的涌浪叠加，减弱交叉周期产生的网格感。
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
        float waveA = sin(vWorld.x * 0.13 + vWorld.z * 0.36 + sin(vWorld.x * 0.024) * 2.1 + uTime * 0.9);
        float waveB = sin(vWorld.x * 0.18 + vWorld.z * 0.55 + sin(vWorld.z * 0.019 + vWorld.x * 0.032) * 3.0 + uTime * 1.1);
        float waveC = sin(vWorld.x * 0.025 + vWorld.z * 0.06 + waveA * 0.3 + uTime * 0.35);
        vec3 normal = normalize(vec3(waveA * 0.014, 1.0, waveB * 0.022));
        vec3 view = normalize(vView);
        float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.0);
        float shallows = 1.0 - smoothstep(115.0, 280.0, vWorld.z);
        vec3 day = mix(vec3(0.025, 0.16, 0.27), vec3(0.065, 0.33, 0.37), shallows);
        day = mix(day, vec3(0.36, 0.54, 0.64), fresnel * 0.78);
        day += (waveA * 0.003 + waveB * 0.002 + waveC * 0.004);
        vec3 lightDir = normalize(vec3(-0.5, 0.4, 0.65));
        float sunlight = pow(max(dot(reflect(-lightDir, normal), view), 0.0), 90.0);
        day += vec3(0.90, 0.54, 0.24) * sunlight * 0.75;
        vec3 nightColor = mix(vec3(0.012, 0.032, 0.074), vec3(0.08, 0.17, 0.27), fresnel) + waveA * 0.004;
        gl_FragColor = vec4(mix(day, nightColor, uNight), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
  waterMaterial.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, waterMaterial.uniforms]);
  materials.add(waterMaterial);
  const waterGeometry = new THREE.PlaneGeometry(3200, 2200);
  geometries.add(waterGeometry);
  const water = new THREE.Mesh(waterGeometry, waterMaterial);
  water.rotation.x = -Math.PI / 2; water.position.set(0, -0.65, 1215); group.add(water);

  // 树木与地形网格共用米制高度，避免远景林带被起伏地面掩埋。
  const terrainHeight = (x: number, z: number) => {
    const rise = THREE.MathUtils.smoothstep(-z, 420, 850);
    return rise * (42 + 21 * Math.sin(x * 0.006 + z * 0.002) + 18 * Math.cos(z * 0.011) + 8 * Math.sin(x * 0.017 + z * 0.015)) - 0.15;
  };
  // 海岸公园、远景丘陵与林带在可旋转视角中补足城市边缘。
  for (let i = 0; i < 340; i++) {
    const x = -440 + random() * 880;
    const z = -415 - random() * 180;
    tree(x, z, 1.1 + random() * 1.5, i, z < -415 ? terrainHeight(x, z) : 0);
  }
  const terrainGeometry = new THREE.PlaneGeometry(2300, 1200, 110, 64);
  terrainGeometry.rotateX(-Math.PI / 2);
  const terrainPositions = terrainGeometry.getAttribute("position");
  const terrainColors: number[] = [];
  const terrainLow = new THREE.Color("#65705a");
  const terrainHigh = new THREE.Color("#7c8472");
  for (let index = 0; index < terrainPositions.count; index++) {
    const x = terrainPositions.getX(index);
    const z = terrainPositions.getZ(index) - 1010;
    const elevation = terrainHeight(x, z);
    terrainPositions.setY(index, elevation);
    const color = terrainLow.clone().lerp(terrainHigh, Math.max(0, elevation / 100));
    terrainColors.push(color.r, color.g, color.b);
  }
  terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(terrainColors, 3));
  terrainGeometry.computeVertexNormals();
  geometries.add(terrainGeometry);
  const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  materials.add(terrainMaterial);
  const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
  terrain.position.z = -1010; terrain.receiveShadow = true; group.add(terrain);
  // 一处公交站、街边长椅与停车位增加近景生活尺度。
  for (const x of [-160, -70, 25, 112]) {
    box(glass, x, 1.9, 103.1, 7, 3.1, 0.1);
    box(metal, x, 3.6, 104, 8, 0.2, 2.4);
    for (const dx of [-3.4, 3.4]) box(metal, x + dx, 1.9, 104, 0.13, 3.4, 0.13);
    box(orange, x, 0.9, 104.4, 5, 0.2, 0.6);
  }
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

  const carCount = 36;
  const bodyMaterial = solid("#ffffff", 0.4, 0.2);
  const cars = new THREE.InstancedMesh(boxGeometry, bodyMaterial, carCount);
  const cabins = new THREE.InstancedMesh(boxGeometry, glass, carCount);
  const lights = new THREE.InstancedMesh(boxGeometry, lamp, carCount * 2);
  const wheels = new THREE.InstancedMesh(cylinderGeometry, darkRoof, carCount * 4);
  [cars, cabins, lights, wheels].forEach((mesh) => {
    mesh.castShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(mesh);
  });
  const carPalette = ["#dedad0", "#c8cfcd", "#58717d", "#b16343", "#3d5559", "#b2a382", "#41494e"];
  const routes = Array.from({ length: carCount }, (_, i) => {
    cars.setColorAt(i, new THREE.Color(i % 17 === 0 ? "#ba7443" : carPalette[i % carPalette.length]));
    const block = cityBlocks[i * 7 % cityBlocks.length];
    const points = [
      { x: block.x - 22.5, z: block.z - 22.5 }, { x: block.x + 22.5, z: block.z - 22.5 },
      { x: block.x + 22.5, z: block.z + 22.5 }, { x: block.x - 22.5, z: block.z + 22.5 },
    ];
    if (i % 2) points.reverse();
    return { points, offset: random() * 180, speed: 4 + random() * 5, bus: i % 17 === 0 };
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
    routes.forEach((route, index) => {
      const progress = THREE.MathUtils.euclideanModulo(route.offset + seconds * route.speed, 180);
      const edge = Math.floor(progress / 45), travelled = progress % 45;
      const from = route.points[edge], to = route.points[(edge + 1) % 4];
      const dx = (to.x - from.x) / 45, dz = (to.z - from.z) / 45;
      const x = from.x + dx * travelled + dz * 2.3;
      const z = from.z + dz * travelled - dx * 2.3;
      const y = 1.04 + (route.bus ? 0.5 : 0);
      const angle = Math.atan2(dx, dz);
      const length = route.bus ? 8.5 : 4.2;
      transform.position.set(x, y, z); transform.rotation.set(0, angle, 0);
      transform.scale.set(1.85, route.bus ? 1.9 : 0.85, length); transform.updateMatrix(); cars.setMatrixAt(index, transform.matrix);
      transform.position.y = y + (route.bus ? 0.75 : 0.6);
      transform.scale.set(1.62, route.bus ? 0.78 : 0.55, length * 0.63); transform.updateMatrix(); cabins.setMatrixAt(index, transform.matrix);
      for (const side of [-1, 1]) {
        const sideIndex = side > 0 ? 1 : 0;
        transform.position.set(x + Math.sin(angle) * length / 2 + Math.cos(angle) * side * 0.58, y + 0.1, z + Math.cos(angle) * length / 2 - Math.sin(angle) * side * 0.58);
        transform.scale.set(0.38, 0.18, 0.12); transform.updateMatrix(); lights.setMatrixAt(index * 2 + sideIndex, transform.matrix);
        for (const axle of [-1, 1]) {
          transform.position.set(x + Math.cos(angle) * side * 0.95 + Math.sin(angle) * axle * length * 0.3, y - (route.bus ? 0.77 : 0.27), z - Math.sin(angle) * side * 0.95 + Math.cos(angle) * axle * length * 0.3);
          transform.rotation.set(0, angle, Math.PI / 2); transform.scale.set(0.34, 0.18, 0.34); transform.updateMatrix();
          wheels.setMatrixAt(index * 4 + sideIndex * 2 + (axle > 0 ? 1 : 0), transform.matrix);
        }
        transform.rotation.set(0, angle, 0);
      }
    });
    [cars, cabins, lights, wheels].forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
  };
  // 动态实例的包围球覆盖整条路线，避免离开首帧位置后被视锥误裁剪。
  [cars, cabins, lights, wheels].forEach((mesh) => { mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 5, 65), 390); });
  group.userData.buildingCount = buildingCount + 5;
  group.userData.vehicleCount = carCount;
  animate(0, false);
  return {
    group, anchors, pickables, animate, setNight,
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
