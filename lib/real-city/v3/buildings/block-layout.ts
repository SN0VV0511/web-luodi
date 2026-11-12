import type { Archetype } from "./archetypes";

export type BlockFace = "S" | "N" | "E" | "W";
export type BlockSlot = { type: Archetype; x: number; z: number; w: number; d: number; face: BlockFace };
export type BlockLayout =
  | "suburban4"
  | "suburban6"
  | "rows"
  | "rowsMixed"
  | "mainStreet"
  | "cafeRow"
  | "mixedBlock"
  | "downtown"
  | "downtown2"
  | "offices"
  | "industrial"
  | "church"
  | "gas"
  | "apartments"
  | "construction";

export const BLOCK_HALF = 14.3;
const H = BLOCK_HALF;
const FULL = H * 2;

export const BLOCK_FACE_YAW: Record<BlockFace, number> = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
export const BLOCK_FACE_OUT: Record<BlockFace, { x: number; z: number }> = {
  S: { x: 0, z: 1 },
  N: { x: 0, z: -1 },
  E: { x: 1, z: 0 },
  W: { x: -1, z: 0 },
};

/** 每种街区布局：地块按朝向（正面朝最近街道）切分，原型组合保证同一街区内不重复。 */
export const BLOCK_LAYOUTS: Record<BlockLayout, BlockSlot[]> = {
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

/** 街区中心到四周道路中心线的标准间距。 */
export const BLOCK_TO_ROAD = 22.5;
