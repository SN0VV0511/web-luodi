import * as THREE from "three";
import type { CityBuiltSite } from "../../contracts";
import { BuildingMeshBuilder, FacadeKind } from "./builder";
import { createFacadeMaterial, facadeUniforms } from "./facade-material";
import { SignAtlas } from "./signs";
import { ARCHETYPES, rngFor, type Archetype, type BuildCtx, type Parcel } from "./archetypes";
import { SHOPS } from "./palette";

import {
  BLOCK_ASSIGNMENT,
  BLOCK_FACE_YAW,
  BLOCK_HALF,
  BLOCK_LAYOUTS,
  layoutFor,
  type BlockFace,
  type BlockLayout,
  type BlockSlot,
} from "./block-layout";

export type { BlockFace, BlockLayout, BlockSlot };
export { BLOCK_ASSIGNMENT, BLOCK_LAYOUTS, layoutFor };

const YAW = BLOCK_FACE_YAW;
const FULL = BLOCK_HALF * 2;

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
