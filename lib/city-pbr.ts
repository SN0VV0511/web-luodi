import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export type PbrMapPair = {
  normalMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
};

function hash2(ix: number, iy: number, seed: number): number {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177) >>> 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function tileNoise(u: number, v: number, periodX: number, periodY: number, seed: number): number {
  const x = u * periodX;
  const y = v * periodY;
  const ix0 = Math.floor(x);
  const iy0 = Math.floor(y);
  const fx = x - ix0;
  const fy = y - iy0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wrapX = (i: number) => ((i % periodX) + periodX) % periodX;
  const wrapY = (i: number) => ((i % periodY) + periodY) % periodY;
  const n00 = hash2(wrapX(ix0), wrapY(iy0), seed);
  const n10 = hash2(wrapX(ix0 + 1), wrapY(iy0), seed);
  const n01 = hash2(wrapX(ix0), wrapY(iy0 + 1), seed);
  const n11 = hash2(wrapX(ix0 + 1), wrapY(iy0 + 1), seed);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return nx0 + (nx1 - nx0) * sy;
}

function tileFbm(u: number, v: number, basePeriod: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let freq = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += amp * tileNoise(u, v, freq, freq, seed + o * 31);
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum / Math.max(1e-5, norm);
}

/**
 * 从无缝高度场与粗糙度场生成标准切线空间法线贴图 (RGBA DataTexture) 与粗糙度贴图。
 */
export function buildPbrMapsFromField(
  width: number,
  height: number,
  normalStrength: number,
  sample: (u: number, v: number) => { height: number; roughness: number },
): PbrMapPair {
  const heights = new Float32Array(width * height);
  const roughData = new Uint8Array(width * height * 4);
  const normalData = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y++) {
    const v = y / height;
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const s = sample(u, v);
      const idx = y * width + x;
      heights[idx] = s.height;
      const rByte = Math.round(THREE.MathUtils.clamp(s.roughness, 0.02, 1) * 255);
      const o = idx * 4;
      roughData[o] = rByte;
      roughData[o + 1] = rByte;
      roughData[o + 2] = rByte;
      roughData[o + 3] = 255;
    }
  }

  const hAt = (x: number, y: number): number => {
    const wx = ((x % width) + width) % width;
    const wy = ((y % height) + height) % height;
    return heights[wy * width + wx];
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Sobel 3x3 梯度算子，获得平滑无锯齿的切线法线边缘
      const tl = hAt(x - 1, y - 1);
      const tc = hAt(x, y - 1);
      const tr = hAt(x + 1, y - 1);
      const ml = hAt(x - 1, y);
      const mr = hAt(x + 1, y);
      const bl = hAt(x - 1, y + 1);
      const bc = hAt(x, y + 1);
      const br = hAt(x + 1, y + 1);

      const dX = ((tr + 2 * mr + br) - (tl + 2 * ml + bl)) * normalStrength;
      const dY = ((bl + 2 * bc + br) - (tl + 2 * tc + tr)) * normalStrength;

      let nx = -dX;
      let ny = dY;
      let nz = 1.0;
      const invLen = 1 / Math.hypot(nx, ny, nz);
      nx *= invLen;
      ny *= invLen;
      nz *= invLen;

      const o = (y * width + x) * 4;
      normalData[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normalData[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalData[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalData[o + 3] = 255;
    }
  }

  const configure = (data: Uint8Array): THREE.DataTexture => {
    const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    tex.colorSpace = THREE.NoColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  };

  return {
    normalMap: configure(normalData),
    roughnessMap: configure(roughData),
  };
}

/**
 * 现代超高层建筑【单元式玻璃幕墙 (Unitized Structural Glass Curtain Wall)】PBR 法线与粗糙度贴图：
 * - 凸起的阳极氧化铝竖向主梃 (Mullion) 与横向层间压梁 (Transom)
 * - 层间暗梁槽口 (Spandrel shadow-box)
 * - 真实钢化幕墙玻璃单块微曲率热应力形变 (Glass Pane Pillow Warble)，让相邻玻璃反射天空/云层时呈现真实错动高光！
 */
export function createGlassCurtainWallPbr(cols = 8, rows = 16): PbrMapPair {
  return buildPbrMapsFromField(256, 512, 2.8, (u, v) => {
    const cellX = u * cols;
    const cellY = v * rows;
    const colIdx = Math.floor(cellX);
    const rowIdx = Math.floor(cellY);
    const fx = cellX - colIdx;
    const fy = cellY - rowIdx;

    const mullion = fx < 0.055 || fx > 0.945;
    const subMullion = Math.abs(fx - 0.5) < 0.018;
    const spandrel = fy < 0.16;
    const transom = Math.abs(fy - 0.16) < 0.025 || fy > 0.965;

    // 每块钢化玻璃独立的微弧面张力倾角 + 热弯波形
    const paneSeed = hash2(colIdx, rowIdx, 701);
    const tiltX = (paneSeed - 0.5) * 0.14 * (fx - 0.5);
    const tiltY = (hash2(colIdx, rowIdx, 919) - 0.5) * 0.14 * (fy - 0.58);
    const pillow = Math.sin(fx * Math.PI) * Math.sin(Math.max(0, (fy - 0.16) / 0.84) * Math.PI) * 0.085;

    if (mullion || transom) {
      return { height: 0.92, roughness: 0.34 };
    }
    if (subMullion) {
      return { height: 0.72, roughness: 0.38 };
    }
    if (spandrel) {
      const groove = Math.sin(fy * Math.PI * 36) * 0.03;
      return { height: 0.36 + groove, roughness: 0.24 };
    }
    return {
      height: 0.48 + pillow + tiltX + tiltY,
      roughness: 0.045 + (paneSeed * 0.03),
    };
  });
}

/**
 * 天然洞石 / 花岗岩干挂石材幕墙 PBR 法线与粗糙度贴图（错缝切角灰缝 + 岩石矿物微孔）。
 */
export function createAshlarStonePbr(): PbrMapPair {
  return buildPbrMapsFromField(256, 256, 2.35, (u, v) => {
    const rows = 8;
    const cols = 4;
    const ry = v * rows;
    const row = Math.floor(ry);
    const fy = ry - row;
    const stagger = (row % 2) * 0.5;
    const cx = u * cols + stagger;
    const col = Math.floor(cx);
    const fx = cx - col;

    const seamX = Math.min(fx, 1 - fx);
    const seamY = Math.min(fy, 1 - fy);
    const bevel = THREE.MathUtils.smoothstep(seamX, 0.0, 0.055) * THREE.MathUtils.smoothstep(seamY, 0.0, 0.085);
    const grain = tileFbm(u, v, 16, 3, 211);
    const pores = tileNoise(u, v, 64, 64, 509);
    const blockTone = (hash2(col, row, 337) - 0.5) * 0.08;

    return {
      height: bevel * (0.72 + grain * 0.2 + (pores > 0.82 ? -0.14 : 0) + blockTone),
      roughness: bevel < 0.35 ? 0.92 : THREE.MathUtils.clamp(0.56 + grain * 0.24 + (1 - pores) * 0.12, 0.42, 0.88),
    };
  });
}

/**
 * 阳极氧化拉丝铝板与氟碳金属幕墙 PBR 贴图（拉丝微纹理 + 扣板折边拼缝）。
 */
export function createBrushedMetalPbr(): PbrMapPair {
  return buildPbrMapsFromField(256, 256, 1.85, (u, v) => {
    const panelX = (u * 4) % 1;
    const panelY = (v * 4) % 1;
    const seam =
      THREE.MathUtils.smoothstep(Math.min(panelX, 1 - panelX), 0.0, 0.03) *
      THREE.MathUtils.smoothstep(Math.min(panelY, 1 - panelY), 0.0, 0.03);
    const brush = tileNoise(u, v, 8, 128, 883) * 0.08;
    const oilCanning = Math.sin(panelX * Math.PI) * Math.sin(panelY * Math.PI) * 0.05;
    return {
      height: seam * (0.78 + brush + oilCanning),
      roughness: seam < 0.4 ? 0.62 : 0.22 + brush * 1.1,
    };
  });
}

/**
 * 城市级粗粒式改性沥青路面 PBR 贴图（玄武岩碎石骨料凸起 + 车轮碾压抛光带）。
 */
export function createAsphaltPbr(): PbrMapPair {
  return buildPbrMapsFromField(256, 256, 2.4, (u, v) => {
    const coarse = tileNoise(u, v, 48, 48, 101);
    const fine = tileNoise(u, v, 112, 112, 173);
    const macro = tileFbm(u, v, 8, 3, 251);
    const height = coarse * 0.55 + fine * 0.3 + macro * 0.15;
    const roughness = THREE.MathUtils.clamp(0.66 + (1 - coarse) * 0.22 - macro * 0.1, 0.45, 0.94);
    return { height, roughness };
  });
}

/**
 * 花岗岩人行道透水砖 PBR 贴图（工字铺贴倒角砖缝 + 火烧面防滑颗粒）。
 */
export function createSidewalkPaverPbr(): PbrMapPair {
  return buildPbrMapsFromField(256, 256, 2.2, (u, v) => {
    const rows = 8;
    const cols = 4;
    const ry = v * rows;
    const row = Math.floor(ry);
    const fy = ry - row;
    const fx = (u * cols + (row % 2) * 0.5) % 1;
    const grout =
      THREE.MathUtils.smoothstep(Math.min(fx, 1 - fx), 0.008, 0.05) *
      THREE.MathUtils.smoothstep(Math.min(fy, 1 - fy), 0.012, 0.07);
    const flameGrain = tileNoise(u, v, 64, 64, 617) * 0.18;
    return {
      height: grout * (0.8 + flameGrain),
      roughness: grout < 0.4 ? 0.94 : 0.68 + flameGrain * 0.6,
    };
  });
}

/**
 * 为共享或实例化材质注入基于世界坐标米制尺度的切线法线与粗糙度采样，
 * 避免长方体缩放后法线贴图被拉伸成卡通条纹。
 */
export function bindWorldScalePbr(
  material: THREE.MeshStandardMaterial,
  maps: PbrMapPair,
  tileMetersX = 6,
  tileMetersY = 6,
  normalScale = 0.65,
): void {
  material.normalMap = maps.normalMap;
  material.userData.cityWorldScalePbr = true;
  material.roughnessMap = maps.roughnessMap;
  material.normalScale = new THREE.Vector2(normalScale, normalScale);

  const prevCompile = material.onBeforeCompile;
  const prevKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    prevCompile.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vPbrWorldPos;\nvarying vec3 vPbrWorldNormal;",
      )
      .replace(
        "#include <defaultnormal_vertex>",
        `#include <defaultnormal_vertex>
        vPbrWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        mat4 pbrM = modelMatrix;
        #ifdef USE_INSTANCING
          pbrM *= instanceMatrix;
        #endif
        #ifdef USE_BATCHING
          pbrM *= batchingMatrix;
        #endif
        vPbrWorldPos = (pbrM * vec4(transformed, 1.0)).xyz;
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec3 vPbrWorldPos;
        varying vec3 vPbrWorldNormal;
        vec2 cityWorldUv(vec3 wp, vec3 wn) {
          vec3 an = abs(wn);
          if (an.y > 0.65) return wp.xz / vec2(${tileMetersX.toFixed(2)}, ${tileMetersY.toFixed(2)});
          if (an.x > an.z) return vec2(wp.z, wp.y) / vec2(${tileMetersX.toFixed(2)}, ${tileMetersY.toFixed(2)});
          return vec2(wp.x, wp.y) / vec2(${tileMetersX.toFixed(2)}, ${tileMetersY.toFixed(2)});
        }
        mat3 cityTangentFrame(vec3 eyePosition, vec3 surfaceNormal, vec2 uv) {
          vec3 q0 = dFdx(eyePosition);
          vec3 q1 = dFdy(eyePosition);
          vec2 st0 = dFdx(uv);
          vec2 st1 = dFdy(uv);
          vec3 q1perp = cross(q1, surfaceNormal);
          vec3 q0perp = cross(surfaceNormal, q0);
          vec3 tangent = q1perp * st0.x + q0perp * st1.x;
          vec3 bitangent = q1perp * st0.y + q0perp * st1.y;
          float scale = inversesqrt(max(1e-10, max(dot(tangent, tangent), dot(bitangent, bitangent))));
          return mat3(tangent * scale, bitangent * scale, surfaceNormal);
        }`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `float roughnessFactor = roughness;
        #ifdef USE_ROUGHNESSMAP
          vec4 texelRoughness = texture2D(roughnessMap, cityWorldUv(vPbrWorldPos, vPbrWorldNormal));
          roughnessFactor = max(0.045, roughnessFactor * texelRoughness.g);
        #endif`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `#ifdef USE_NORMALMAP_TANGENTSPACE
          vec2 pbrUv = cityWorldUv(vPbrWorldPos, vPbrWorldNormal);
          vec3 mapN = texture2D(normalMap, pbrUv).xyz * 2.0 - 1.0;
          mapN.xy *= normalScale;
          normal = normalize(cityTangentFrame(-vViewPosition, normal, pbrUv) * mapN);
        #endif`,
      );
  };
  material.customProgramCacheKey = () => `${prevKey}:world-pbr-v3:${tileMetersX}x${tileMetersY}`;
  material.needsUpdate = true;
}

/**
 * 创建自然分枝簇生灌木几何体（彻底替代方块绿篱与低模正二十面体圆球树丛）。
 */
export function createOrganicShrubGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const golden = 2.39996323;
  const orient = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i < 22; i++) {
    const t = (i + 0.5) / 22;
    const angle = i * golden;
    const r = Math.sqrt(t) * 0.42;
    const y = 0.16 + (1 - t * 0.55) * 0.36 + (i % 3) * 0.04;
    const dir = new THREE.Vector3(Math.cos(angle) * 0.72, 0.68 + (1 - t) * 0.4, Math.sin(angle) * 0.72).normalize();

    const leafBlade = new THREE.ConeGeometry(0.19 + (i % 3) * 0.035, 0.34, 5, 1);
    leafBlade.scale(1.15, 0.72, 0.68);
    orient.setFromUnitVectors(up, dir);
    leafBlade.applyQuaternion(orient);
    leafBlade.translate(Math.cos(angle) * r, y, Math.sin(angle) * r);
    parts.push(leafBlade);
  }

  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error("灌木几何合并失败");
  merged.computeVertexNormals();
  return merged;
}
