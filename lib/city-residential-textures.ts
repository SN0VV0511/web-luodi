import * as THREE from "three";
import type { CivicKit } from "./city-civic";

export type ModernFacadeStyle = "pearl-condo" | "graphite-tower" | "terracotta-modern" | "coastal-residences";

export type RetailBrandId =
  | "coffee"
  | "convenience"
  | "bakery"
  | "pharmacy"
  | "tech"
  | "bistro"
  | "bookstore"
  | "florist";

export type ResidentialMaterialPalette = {
  apartmentFacades: Record<ModernFacadeStyle, THREE.MeshStandardMaterial>;
  retailSigns: Record<RetailBrandId, THREE.MeshStandardMaterial>;
  poolWater: THREE.MeshStandardMaterial;
  solarPanel: THREE.MeshStandardMaterial;
  villaTravertine: THREE.MeshStandardMaterial;
  villaCedar: THREE.MeshStandardMaterial;
  villaBoardConcrete: THREE.MeshStandardMaterial;
  balconyGlass: THREE.MeshStandardMaterial;
  warmInteriorGlow: THREE.MeshStandardMaterial;
};

type BrandTheme = {
  id: RetailBrandId;
  bgTop: string;
  bgBottom: string;
  accent: string;
  text: string;
  sub: string;
  title: string;
  badge: string;
};

const RETAIL_BRANDS: readonly BrandTheme[] = [
  {
    id: "coffee",
    bgTop: "#1f2e2b",
    bgBottom: "#14201d",
    accent: "#dfab68",
    text: "#f8f1e5",
    sub: "SPECIALTY ESPRESSO · ROASTERY",
    title: "AZURE COFFEE",
    badge: "BEAN LAB",
  },
  {
    id: "convenience",
    bgTop: "#173c63",
    bgBottom: "#102845",
    accent: "#4fd190",
    text: "#ffffff",
    sub: "OPEN 24 HOURS · DAILY ESSENTIALS",
    title: "METRO MART 24",
    badge: "24/7",
  },
  {
    id: "bakery",
    bgTop: "#4b2e22",
    bgBottom: "#331d15",
    accent: "#f2c179",
    text: "#fff6ea",
    sub: "SOURDOUGH · PASTRY · PATISSERIE",
    title: "LE LEVAIN D'OR",
    badge: "FRESH",
  },
  {
    id: "pharmacy",
    bgTop: "#13423b",
    bgBottom: "#0c2b26",
    accent: "#66e3b8",
    text: "#f2fbf8",
    sub: "HEALTHCARE · CLINIC · WELLNESS",
    title: "VITA+ PHARMACY",
    badge: "CARE+",
  },
  {
    id: "tech",
    bgTop: "#192231",
    bgBottom: "#0f1520",
    accent: "#63b7ff",
    text: "#eef6ff",
    sub: "DEVICES · AUDIO · SMART HOME",
    title: "NEBULA STUDIO",
    badge: "PRO",
  },
  {
    id: "bistro",
    bgTop: "#2b2029",
    bgBottom: "#1a1218",
    accent: "#e89f65",
    text: "#fceddf",
    sub: "COASTAL SEAFOOD · TAPAS & WINE",
    title: "HARBOR BISTRO",
    badge: "GRILL",
  },
  {
    id: "bookstore",
    bgTop: "#273128",
    bgBottom: "#182019",
    accent: "#d8be84",
    text: "#f6f1e4",
    sub: "INDEPENDENT BOOKS · VINYL · TEA",
    title: "FOLIO & SOUND",
    badge: "READ",
  },
  {
    id: "florist",
    bgTop: "#2f3d34",
    bgBottom: "#1d2721",
    accent: "#f09ea7",
    text: "#fbf7f4",
    sub: "BOTANICALS · BOUQUETS · GARDEN",
    title: "BOTANICA FLORA",
    badge: "BLOOM",
  },
];

function createSeededRandom(initialSeed: number): () => number {
  let state = initialSeed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * 构建《城市：天际线》风格的现代高层住宅立面、别墅石木饰面、泳池焦散水面、
 * 光伏板阵列以及商业街发光店招材质集。所有纹理均通过本地 Canvas 生成并纳入统一释放集合。
 */
export function buildResidentialMaterials(kit: CivicKit): ResidentialMaterialPalette {
  const { materials, nightMaterials, canvasTexture, solid } = kit;
  const rand = createSeededRandom(447921);

  const applyWorldFacadeUv = (material: THREE.MeshStandardMaterial, scaleX = 20.0, scaleY = 48.0, roofTint = "0.74, 0.76, 0.75") => {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = `varying float vResWall;\n${shader.vertexShader}`.replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        vResWall = 1.0 - abs(normal.y);
        #ifdef USE_INSTANCING
          vec3 instScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vec2 uvRepeats = vec2(abs(normal.x) > 0.5 ? instScale.z : instScale.x, instScale.y) / vec2(${scaleX.toFixed(1)}, ${scaleY.toFixed(1)});
          vMapUv *= uvRepeats;
          vEmissiveMapUv *= uvRepeats;
        #endif`,
      );
      shader.fragmentShader = `varying float vResWall;\n${shader.fragmentShader}`
        .replace(
          "diffuseColor *= sampledDiffuseColor;",
          `diffuseColor *= mix(vec4(${roofTint}, 1.0), sampledDiffuseColor, vResWall);`,
        )
        .replace(
          "totalEmissiveRadiance *= emissiveColor.rgb;",
          "totalEmissiveRadiance *= emissiveColor.rgb * vResWall;",
        );
    };
    material.customProgramCacheKey = () => `skylines-res-facade-${scaleX}-${scaleY}`;
  };

  const makeApartmentFacade = (
    style: ModernFacadeStyle,
    wallHex: string,
    spandrelHex: string,
    mullionHex: string,
    glassTintHex: string,
  ): THREE.MeshStandardMaterial => {
    const windowStates: {
      lit: boolean;
      curtainLeft: number;
      curtainRight: number;
      warmth: number;
      hasPlant: boolean;
    }[] = [];

    const map = canvasTexture(512, 1024, (ctx) => {
      ctx.fillStyle = wallHex;
      ctx.fillRect(0, 0, 512, 1024);

      // 细腻建筑外墙预制板接缝与微质感阴影
      ctx.strokeStyle = "rgba(22, 28, 34, 0.14)";
      ctx.lineWidth = 1;
      for (let x = 0; x <= 512; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 1024);
        ctx.stroke();
      }

      const rows = 16;
      const cols = 4;
      const cellW = 512 / cols;
      const cellH = 1024 / rows;

      for (let row = 0; row < rows; row++) {
        const y = row * cellH;
        // 现代住宅层间铝板/石材横梁与滴水线
        ctx.fillStyle = spandrelHex;
        ctx.fillRect(0, y, 512, 13);
        ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
        ctx.fillRect(0, y + 12, 512, 2);
        ctx.fillStyle = "rgba(10, 16, 22, 0.28)";
        ctx.fillRect(0, y + cellH - 3, 512, 3);

        for (let col = 0; col < cols; col++) {
          const lit = rand() > 0.44;
          const curtainLeft = 0.16 + rand() * 0.22;
          const curtainRight = rand() > 0.35 ? 0.14 + rand() * 0.22 : 0;
          const warmth = rand();
          const hasPlant = rand() > 0.55;
          windowStates.push({ lit, curtainLeft, curtainRight, warmth, hasPlant });

          const x = col * cellW;
          const padX = style === "graphite-tower" ? 8 : 12;
          const winX = x + padX;
          const winY = y + 15;
          const winW = cellW - padX * 2;
          const winH = cellH - 20;

          // 窗框外立面深凹立体阴影
          ctx.fillStyle = "rgba(10, 16, 22, 0.46)";
          ctx.fillRect(winX - 2, winY - 2, winW + 4, winH + 4);

          // 现代推拉落地玻璃底色
          ctx.fillStyle = glassTintHex;
          ctx.fillRect(winX, winY, winW, winH);

          if (typeof ctx.createLinearGradient === "function") {
            const skyGrad = ctx.createLinearGradient(winX, winY, winX + winW, winY + winH);
            skyGrad.addColorStop(0, "rgba(205, 232, 246, 0.34)");
            skyGrad.addColorStop(0.5, "rgba(44, 78, 98, 0.10)");
            skyGrad.addColorStop(1, "rgba(235, 204, 164, 0.22)");
            ctx.fillStyle = skyGrad;
            ctx.fillRect(winX, winY, winW, winH);
          }

          // 室内纱帘细节，赋予普通居民楼真实居家生活气息
          ctx.fillStyle = lit ? "rgba(246, 238, 222, 0.44)" : "rgba(216, 224, 228, 0.28)";
          const leftW = Math.round(winW * curtainLeft);
          ctx.fillRect(winX + 2, winY + 2, leftW, winH - 4);
          if (curtainRight > 0) {
            const rightW = Math.round(winW * curtainRight);
            ctx.fillRect(winX + winW - rightW - 2, winY + 2, rightW, winH - 4);
          }

          // 阳台绿植剪影点缀
          if (hasPlant) {
            ctx.fillStyle = "rgba(56, 108, 68, 0.72)";
            ctx.fillRect(winX + winW * 0.56, winY + winH - 11, 18, 8);
            ctx.fillStyle = "rgba(148, 98, 68, 0.78)";
            ctx.fillRect(winX + winW * 0.58, winY + winH - 5, 14, 4);
          }

          // 断桥铝中梃与玻璃护栏横杆
          ctx.fillStyle = mullionHex;
          ctx.fillRect(winX + Math.round(winW * 0.5) - 1, winY, 3, winH);
          ctx.fillRect(winX, winY + Math.round(winH * 0.64), winW, 2);
          ctx.strokeStyle = mullionHex;
          ctx.lineWidth = 2;
          ctx.strokeRect(winX, winY, winW, winH);
        }
      }
    });

    const emissiveMap = canvasTexture(512, 1024, (ctx) => {
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, 512, 1024);
      const rows = 16;
      const cols = 4;
      const cellW = 512 / cols;
      const cellH = 1024 / rows;

      windowStates.forEach((state, idx) => {
        if (!state.lit) return;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const padX = style === "graphite-tower" ? 10 : 14;
        const winX = col * cellW + padX;
        const winY = row * cellH + 17;
        const winW = cellW - padX * 2;
        const winH = cellH - 24;

        const topGlow =
          state.warmth < 0.2
            ? "#cbe4f5" // 书房/电视冷白光
            : state.warmth < 0.68
              ? "#ffe0ae" // 客厅暖白吸顶灯
              : "#f6ba78"; // 卧室温馨暖黄床头灯
        const btmGlow =
          state.warmth < 0.2
            ? "#7fa8c4"
            : state.warmth < 0.68
              ? "#d89f5e"
              : "#b9763c";

        if (typeof ctx.createLinearGradient === "function") {
          const grad = ctx.createLinearGradient(winX, winY, winX, winY + winH);
          grad.addColorStop(0, topGlow);
          grad.addColorStop(1, btmGlow);
          ctx.fillStyle = grad;
        } else {
          ctx.fillStyle = topGlow;
        }
        ctx.fillRect(winX, winY, winW, winH);

        // 窗帘遮光层次与断桥铝窗框暗线
        ctx.fillStyle = "rgba(28, 22, 18, 0.34)";
        ctx.fillRect(winX, winY, Math.round(winW * state.curtainLeft * 0.7), winH);
        ctx.fillStyle = "#090d11";
        ctx.fillRect(winX + Math.round(winW * 0.5) - 1, winY, 3, winH);
        ctx.fillRect(winX, winY + Math.round(winH * 0.64), winW, 2);
      });
    });

    const material = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map,
      emissiveMap,
      emissive: "#ffe5ba",
      emissiveIntensity: 0.06,
      roughness: style === "graphite-tower" ? 0.28 : 0.62,
      metalness: style === "graphite-tower" ? 0.36 : 0.1,
    });
    applyWorldFacadeUv(material, 18.0, 51.2);
    materials.add(material);
    nightMaterials.push({ material, day: 0.05, night: 1.48 });
    return material;
  };

  const apartmentFacades: Record<ModernFacadeStyle, THREE.MeshStandardMaterial> = {
    "pearl-condo": makeApartmentFacade("pearl-condo", "#ebe6dc", "#c9c2b4", "#46525a", "#2f5368"),
    "graphite-tower": makeApartmentFacade("graphite-tower", "#455058", "#2b343b", "#aebac2", "#25495e"),
    "terracotta-modern": makeApartmentFacade("terracotta-modern", "#dfd1c0", "#b87a5e", "#3d464c", "#315364"),
    "coastal-residences": makeApartmentFacade("coastal-residences", "#e4ecee", "#9eb4bd", "#52646e", "#295872"),
  };

  const retailSigns = {} as Record<RetailBrandId, THREE.MeshStandardMaterial>;
  for (const brand of RETAIL_BRANDS) {
    const tex = canvasTexture(512, 128, (ctx) => {
      if (typeof ctx.createLinearGradient === "function") {
        const bg = ctx.createLinearGradient(0, 0, 512, 128);
        bg.addColorStop(0, brand.bgTop);
        bg.addColorStop(1, brand.bgBottom);
        ctx.fillStyle = bg;
      } else {
        ctx.fillStyle = brand.bgTop;
      }
      ctx.fillRect(0, 0, 512, 128);

      ctx.strokeStyle = brand.accent;
      ctx.lineWidth = 3;
      ctx.strokeRect(8, 8, 496, 112);

      ctx.fillStyle = brand.accent;
      ctx.fillRect(22, 24, 84, 80);
      ctx.fillStyle = brand.bgBottom;
      ctx.font = "800 22px monospace";
      ctx.textAlign = "center";
      ctx.fillText(brand.badge, 64, 72);

      ctx.textAlign = "left";
      ctx.fillStyle = brand.text;
      ctx.font = "800 40px Arial, sans-serif";
      ctx.fillText(brand.title, 124, 66);

      ctx.fillStyle = brand.accent;
      ctx.font = "600 15px monospace";
      ctx.fillText(brand.sub, 126, 96);
    });
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    const mat = new THREE.MeshStandardMaterial({
      color: "#ffffff",
      map: tex,
      emissiveMap: tex,
      emissive: "#ffffff",
      emissiveIntensity: 0.22,
      roughness: 0.36,
      metalness: 0.14,
    });
    materials.add(mat);
    nightMaterials.push({ material: mat, day: 0.22, night: 1.35 });
    retailSigns[brand.id] = mat;
  }

  // 别墅私家泳池马赛克焦散碧水材质
  const poolTex = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#1aa6b8";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 256; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
    // 水波焦散亮斑
    ctx.strokeStyle = "rgba(218, 252, 255, 0.45)";
    ctx.lineWidth = 2.2;
    for (let w = 0; w < 14; w++) {
      const cx = (w * 53) % 240;
      const cy = (w * 79) % 240;
      ctx.beginPath();
      if (typeof ctx.arc === "function") {
        ctx.arc(cx, cy, 14 + (w % 4) * 6, 0, Math.PI * 1.35);
      }
      ctx.stroke();
    }
  });
  const poolWater = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: poolTex,
    emissive: "#1cc8dc",
    emissiveIntensity: 0.18,
    roughness: 0.08,
    metalness: 0.22,
  });
  materials.add(poolWater);
  nightMaterials.push({ material: poolWater, day: 0.16, night: 1.25 });

  // 单晶硅光伏太阳能电池板纹理
  const solarTex = canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = "#132946";
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(176, 212, 245, 0.42)";
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, 250, 250);
    ctx.strokeStyle = "rgba(148, 192, 232, 0.26)";
    ctx.lineWidth = 1;
    for (let x = 32; x < 256; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 4);
      ctx.lineTo(x, 252);
      ctx.stroke();
    }
    for (let y = 24; y < 256; y += 24) {
      ctx.beginPath();
      ctx.moveTo(4, y);
      ctx.lineTo(252, y);
      ctx.stroke();
    }
  });
  const solarPanel = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    map: solarTex,
    roughness: 0.16,
    metalness: 0.58,
  });
  materials.add(solarPanel);

  const villaTravertine = solid("#e8dfd0", 0.66, 0.04);
  const villaCedar = solid("#9c6844", 0.68, 0.05);
  const villaBoardConcrete = solid("#c6c9c8", 0.72, 0.06);
  const balconyGlass = solid("#4a7d96", 0.14, 0.48);
  const warmInteriorGlow = solid("#5b7482", 0.22, 0.24);
  warmInteriorGlow.emissive.set("#ffd394");
  nightMaterials.push({ material: warmInteriorGlow, day: 0.08, night: 1.55 });

  return {
    apartmentFacades,
    retailSigns,
    poolWater,
    solarPanel,
    villaTravertine,
    villaCedar,
    villaBoardConcrete,
    balconyGlass,
    warmInteriorGlow,
  };
}
