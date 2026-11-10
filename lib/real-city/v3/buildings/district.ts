import * as THREE from "three";
import type { CityBuiltSite } from "../../contracts";
import { BuildingMeshBuilder, FacadeKind } from "./builder";
import { createFacadeMaterial, facadeUniforms } from "./facade-material";
import { SignAtlas } from "./signs";
import { ARCHETYPES, rngFor, type Archetype, type BuildCtx, type Parcel } from "./archetypes";
import { SHOPS } from "./palette";

type Face = "S" | "N" | "E" | "W";
type Slot = { type: Archetype; x: number; z: number; w: number; d: number; face: Face };
export type BlockLayout = "suburban4" | "suburban6" | "rows" | "rowsMixed" | "mainStreet" | "cafeRow" | "mixedBlock" | "downtown" | "downtown2" | "offices" | "industrial" | "church" | "gas" | "apartments" | "construction";

const H = 14.3;
const FULL = H * 2;
const YAW: Record<Face, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };

/** 每种街区布局：地块按朝向（正面朝最近街道）切分，原型组合保证同一街区内不重复。 */
export const BLOCK_LAYOUTS: Record<BlockLayout, Slot[]> = {
  suburban4: [
    { type: "detached", x: -H / 2, z: H / 2, w: H, d: H, face: "S" }, { type: "detached", x: H / 2, z: H / 2, w: H, d: H, face: "S" },
    { type: "detached", x: -H / 2, z: -H / 2, w: H, d: H, face: "N" }, { type: "detached", x: H / 2, z: -H / 2, w: H, d: H, face: "N" },
  ],
  suburban6: [-1, 0, 1].flatMap((i) => [
    { type: "detached" as const, x: i * FULL / 3, z: H / 2, w: FULL / 3, d: H, face: "S" as const },
    { type: "detached" as const, x: i * FULL / 3, z: -H / 2, w: FULL / 3, d: H, face: "N" as const },
  ]),
  rows: [{ type: "townhouses", x: 0, z: H / 2, w: FULL, d: H, face: "S" }, { type: "townhouses", x: 0, z: -H / 2, w: FULL, d: H, face: "N" }],
  rowsMixed: [
    { type: "townhouses", x: 0, z: H / 2, w: FULL, d: H, face: "S" },
    { type: "detached", x: -H / 2, z: -H / 2, w: H, d: H, face: "N" }, { type: "cafe", x: H / 2, z: -H / 2, w: H, d: H, face: "N" },
  ],
  mainStreet: [
    { type: "mixed", x: -H / 2, z: H / 2, w: H, d: H, face: "S" }, { type: "cafe", x: H / 2, z: H / 2, w: H, d: H, face: "S" },
    { type: "lowrise", x: 0, z: -H / 2, w: FULL, d: H, face: "N" },
  ],
  cafeRow: [
    { type: "cafe", x: -H / 2, z: H / 2, w: H, d: H, face: "S" }, { type: "mixed", x: H / 2, z: H / 2, w: H, d: H, face: "S" },
    { type: "midrise", x: 0, z: -H / 2, w: FULL, d: H, face: "N" },
  ],
  mixedBlock: [{ type: "mixed", x: 0, z: H / 2, w: FULL, d: H, face: "S" }, { type: "midrise", x: 0, z: -H / 2, w: FULL, d: H, face: "N" }],
  downtown: [{ type: "tower", x: H / 2, z: 0, w: FULL, d: H, face: "E" }, { type: "office", x: -H / 2, z: 0, w: FULL, d: H, face: "W" }],
  downtown2: [{ type: "tower", x: -H / 2, z: 0, w: FULL, d: H, face: "W" }, { type: "mixed", x: H / 2, z: H / 2, w: H, d: H, face: "E" }, { type: "cafe", x: H / 2, z: -H / 2, w: H, d: H, face: "E" }],
  offices: [{ type: "office", x: 0, z: H / 2, w: FULL, d: H, face: "S" }, { type: "midrise", x: 0, z: -H / 2, w: FULL, d: H, face: "N" }],
  industrial: [{ type: "warehouse", x: 0, z: H / 2, w: FULL, d: H, face: "S" }, { type: "warehouse", x: 0, z: -H / 2, w: FULL, d: H, face: "N" }],
  church: [
    { type: "church", x: -H / 2, z: 0, w: H, d: FULL, face: "S" },
    { type: "detached", x: H / 2, z: H / 2, w: H, d: H, face: "E" }, { type: "detached", x: H / 2, z: -H / 2, w: H, d: H, face: "E" },
  ],
  gas: [
    { type: "gas", x: -H / 2, z: 0, w: H, d: FULL, face: "S" },
    { type: "cafe", x: H / 2, z: H / 2, w: H, d: H, face: "S" }, { type: "lowrise", x: H / 2, z: -H / 2, w: H, d: H, face: "N" },
  ],
  apartments: [{ type: "lowrise", x: 0, z: H / 2, w: FULL, d: H, face: "S" }, { type: "midrise", x: 0, z: -H / 2, w: FULL, d: H, face: "N" }],
  /** 北半块留给在建工地（塔吊与框架由 v3 场景层绘制）。 */
  construction: [{ type: "mixed", x: 0, z: H / 2, w: FULL, d: H, face: "S" }],
};

/** 21 个空余街区的布局：西城以住宅、教堂、加油站为主，东城为商务塔楼与物流，北城学院区混合。 */
export const BLOCK_ASSIGNMENT: Record<string, BlockLayout> = {
  "-187.5,-137.5": "suburban4", "-142.5,-137.5": "rows", "-142.5,-92.5": "church", "-97.5,-92.5": "mainStreet",
  "-187.5,-47.5": "suburban6", "-97.5,-47.5": "mixedBlock", "-142.5,-2.5": "rowsMixed", "-142.5,42.5": "gas",
  "97.5,-92.5": "offices", "187.5,-92.5": "industrial", "142.5,-47.5": "downtown", "97.5,-2.5": "cafeRow",
  "142.5,-2.5": "downtown2", "187.5,42.5": "construction",
  "-52.5,-182.5": "suburban4", "127.5,-182.5": "rows", "172.5,-182.5": "industrial", "-52.5,-137.5": "rowsMixed",
  "-7.5,-137.5": "mainStreet", "82.5,-137.5": "apartments", "172.5,-137.5": "suburban6",
};

export function layoutFor(x: number, z: number, index: number): BlockLayout {
  const key = `${x},${z}`;
  if (BLOCK_ASSIGNMENT[key]) return BLOCK_ASSIGNMENT[key];
  const fallback: BlockLayout[] = ["suburban4", "rows", "mainStreet", "apartments", "rowsMixed"];
  return fallback[index % fallback.length];
}

export type V3District = {
  group: THREE.Group;
  sites: CityBuiltSite[];
  buildingCount: number;
  archetypeCounts: Partial<Record<Archetype, number>>;
  animate: (seconds: number, night: boolean) => void;
  dispose: () => void;
};

export type DistrictOptions = {
  blocks: readonly { x: number; z: number }[];
  /** 额外的独立地块（如海滨别墅带）。 */
  extraParcels?: readonly (Parcel & { type: Archetype })[];
  tree: (x: number, z: number, size: number, shade: number) => void;
  canvasTexture?: (width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) => THREE.Texture;
  groundY?: number;
};

export function buildV3District(options: DistrictOptions): V3District {
  const main = new BuildingMeshBuilder();
  const cut = new BuildingMeshBuilder();
  const signs = new SignAtlas();
  const sites: CityBuiltSite[] = [];
  const last = new Map<string, unknown>();
  let serial = 0;
  let shopCursor = 0;
  const ctx: BuildCtx = {
    main, cut, signs, sites, tree: options.tree,
    pick: (key, list, rng) => {
      const previous = last.get(key);
      let choice = list[Math.floor(rng() * list.length)];
      for (let i = 0; i < 4 && list.length > 1 && choice === previous; i++) choice = list[Math.floor(rng() * list.length)];
      last.set(key, choice);
      return choice;
    },
    shop: (rng) => { shopCursor += 1 + Math.floor(rng() * 3); return SHOPS[shopCursor % SHOPS.length]; },
    serial: () => ++serial,
  };
  const y = options.groundY ?? 0.5;
  const counts: Partial<Record<Archetype, number>> = {};
  let buildingCount = 0;
  options.blocks.forEach((block, index) => {
    const layout = layoutFor(block.x, block.z, index);
    // 街区底：铺装 + 路缘
    main.setFrame({ x: block.x, y, z: block.z, yaw: 0 });
    main.box(0, -0.08, 0, FULL + 0.4, 0.08, FULL + 0.4, "#a9a49a", { kind: FacadeKind.Plain }, { kind: FacadeKind.Paving, seed: index });
    BLOCK_LAYOUTS[layout].forEach((slot, slotIndex) => {
      const yaw = YAW[slot.face];
      const parcel: Parcel = { id: `v3-${layout}-${index}-${slotIndex}`, x: block.x + slot.x, y, z: block.z + slot.z, w: slot.w - 0.3, d: slot.d - 0.3, yaw };
      const rng = rngFor(Math.round((block.x * 31.7 + block.z * 17.3) * 10) + slotIndex * 7919);
      const before = sites.length;
      ARCHETYPES[slot.type](ctx, parcel, rng);
      counts[slot.type] = (counts[slot.type] ?? 0) + 1;
      buildingCount += Math.max(1, sites.length - before);
    });
  });
  for (const extra of options.extraParcels ?? []) {
    ARCHETYPES[extra.type](ctx, extra, rngFor(Math.round(extra.x * 13 + extra.z * 7)));
    counts[extra.type] = (counts[extra.type] ?? 0) + 1;
    buildingCount++;
  }

  const group = new THREE.Group();
  group.name = "v3 district";
  const material = createFacadeMaterial();
  const solid = new THREE.Mesh(main.build(), material);
  solid.name = "v3 district · buildings";
  solid.castShadow = true;
  solid.receiveShadow = true;
  group.add(solid);
  const cutout = new THREE.Mesh(cut.build(), material);
  cutout.name = "v3 district · fences and railings";
  cutout.castShadow = false;
  cutout.receiveShadow = true;
  group.add(cutout);
  let signMaterial: THREE.MeshStandardMaterial | null = null;
  const texture = options.canvasTexture?.(SignAtlas.size.width, SignAtlas.size.height, (context) => signs.draw(context)) ?? null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
  }
  const signMesh = signs.build(texture);
  if (signMesh) { group.add(signMesh.mesh); signMaterial = signMesh.material; }

  let nightLevel = 0;
  return {
    group, sites, buildingCount, archetypeCounts: counts,
    animate: (seconds, night) => {
      nightLevel += ((night ? 1 : 0) - nightLevel) * 0.08;
      if (Math.abs(nightLevel - (night ? 1 : 0)) < 0.002) nightLevel = night ? 1 : 0;
      facadeUniforms.uNight.value = nightLevel;
      facadeUniforms.uTime.value = seconds;
      if (signMaterial) signMaterial.emissiveIntensity = 0.05 + nightLevel * 1.4;
    },
    dispose: () => {
      solid.geometry.dispose();
      cutout.geometry.dispose();
      material.dispose();
      signMesh?.mesh.geometry.dispose();
      signMaterial?.dispose();
      texture?.dispose();
    },
  };
}
