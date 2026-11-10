import type { CityBuiltSite } from "../../contracts";
import { BuildingMeshBuilder, FacadeKind, WallTexture, type Facade, type Frame } from "./builder";
import { SignAtlas } from "./signs";
import * as P from "./palette";

export type Rng = () => number;
export function rngFor(seed: number): Rng {
  let a = (seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Parcel = { id: string; x: number; y: number; z: number; w: number; d: number; yaw: number };

export type BuildCtx = {
  main: BuildingMeshBuilder;
  cut: BuildingMeshBuilder;
  signs: SignAtlas;
  tree: (x: number, z: number, size: number, shade: number) => void;
  sites: CityBuiltSite[];
  /** 从调色板挑选，避免与上一次同键结果相同（邻居不同色）。 */
  pick: <T>(key: string, list: readonly T[], rng: Rng) => T;
  shop: (rng: Rng) => (typeof P.SHOPS)[number];
  serial: () => number;
};

export type Archetype =
  | "detached" | "townhouses" | "lowrise" | "midrise" | "mixed" | "office" | "tower"
  | "warehouse" | "church" | "gas" | "cafe";

const range = (rng: Rng, a: number, b: number) => a + (b - a) * rng();
const int = (rng: Rng, a: number, b: number) => Math.floor(range(rng, a, b + 1));
const chance = (rng: Rng, p: number) => rng() < p;

function frameOf(parcel: Parcel): Frame { return { x: parcel.x, y: parcel.y, z: parcel.z, yaw: parcel.yaw }; }
function world(parcel: Parcel, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(parcel.yaw), s = Math.sin(parcel.yaw);
  return { x: parcel.x + lx * c + lz * s, z: parcel.z - lx * s + lz * c };
}
function begin(ctx: BuildCtx, parcel: Parcel): void {
  ctx.main.setFrame(frameOf(parcel));
  ctx.cut.setFrame(frameOf(parcel));
}

function addSite(ctx: BuildCtx, parcel: Parcel, kind: CityBuiltSite["kind"], zh: string, en: string, lx: number, lz: number, w: number, d: number, h: number, doorX: number, doorZ: number): void {
  const center = world(parcel, lx, lz);
  const door = world(parcel, doorX, doorZ + 0.6);
  const outward = { x: Math.sin(parcel.yaw), z: Math.cos(parcel.yaw) };
  const id = `${parcel.id}-${ctx.sites.length}`;
  ctx.sites.push({
    id, kind, name: { zh, en },
    x: center.x, z: center.z, width: w, depth: d, height: h, rotationY: parcel.yaw, baseY: parcel.y,
    entrances: [{ id: `${id}-door`, position: { x: door.x, y: parcel.y, z: door.z }, outward, width: 1.2, accessible: true }],
  });
}

// ---------- 通用构件 ----------
const PLAIN: Facade = { kind: FacadeKind.Plain };
const plainTex = (tex: WallTexture, seed: number): Facade => ({ kind: FacadeKind.Plain, tex, seed });

function door(b: BuildingMeshBuilder, x: number, y: number, z: number, color: string, w = 1.0, h = 2.2): void {
  b.box(x, y, z + 0.04, w + 0.16, h + 0.1, 0.1, "#e9e5dc", [PLAIN, PLAIN, null, PLAIN], PLAIN);
  b.box(x, y, z + 0.1, w, h, 0.04, color, [{ kind: FacadeKind.Door }, null, null, null], null);
}

function acUnit(b: BuildingMeshBuilder, x: number, y: number, z: number): void {
  b.box(x, y, z + 0.17, 0.82, 0.56, 0.34, "#d9d9d4", [{ kind: FacadeKind.Grille }, PLAIN, null, PLAIN], PLAIN, true);
  b.box(x, y - 0.06, z + 0.16, 0.9, 0.04, 0.4, "#8a8d90", PLAIN, PLAIN);
}

/** 双面镂空栏杆 / 栅栏（cut 网格，不投影）。p0→p1 为底边，高 h。 */
function screen(cut: BuildingMeshBuilder, x0: number, z0: number, x1: number, z1: number, y: number, h: number, color: string, kind: FacadeKind, seed = 0): void {
  const f: Facade = { kind, seed };
  cut.quad([[x0, y, z0], [x1, y, z1], [x1, y + h, z1], [x0, y + h, z0]], color, f, "flat");
  cut.quad([[x1, y, z1], [x0, y, z0], [x0, y + h, z0], [x1, y + h, z1]], color, f, "flat");
}

function balcony(b: BuildingMeshBuilder, cut: BuildingMeshBuilder, x: number, y: number, z: number, w: number, depth: number, slab: string, rail: string, glassRail: boolean): void {
  b.box(x, y - 0.18, z + depth / 2, w, 0.18, depth, slab, PLAIN, PLAIN, true);
  const x0 = x - w / 2, x1 = x + w / 2, zf = z + depth;
  if (glassRail) {
    b.box(x, y, zf - 0.03, w, 1.0, 0.04, "#6f8590", [{ kind: FacadeKind.Plain, tex: WallTexture.Render }, PLAIN, PLAIN, PLAIN], PLAIN);
    b.box(x, y + 1.0, zf - 0.03, w, 0.05, 0.07, rail, PLAIN, PLAIN);
  } else {
    screen(cut, x0, zf, x1, zf, y, 1.05, rail, FacadeKind.Railing);
    screen(cut, x1, zf, x1, z, y, 1.05, rail, FacadeKind.Railing);
    screen(cut, x0, z, x0, zf, y, 1.05, rail, FacadeKind.Railing);
  }
}

function awning(b: BuildingMeshBuilder, x: number, y: number, z: number, w: number, depth: number, color: string): void {
  const x0 = x - w / 2, x1 = x + w / 2;
  b.quad([[x0, y - 0.7, z + depth], [x1, y - 0.7, z + depth], [x1, y, z], [x0, y, z]], color, PLAIN, "flat");
  b.quad([[x1, y - 0.72, z + depth], [x0, y - 0.72, z + depth], [x0, y, z], [x1, y, z]], color, PLAIN, "flat");
  b.box(x, y - 1.0, z + depth, w, 0.3, 0.03, color, [PLAIN, PLAIN, PLAIN, PLAIN], null);
}

/** 平屋顶：女儿墙 + 屋面设备（空调外机、风管、水箱、太阳能板），按随机数取舍。 */
function flatRoof(b: BuildingMeshBuilder, cx: number, cz: number, w: number, d: number, h: number, wallColor: string, rng: Rng, opts: { tank?: boolean; solar?: boolean; lift?: boolean } = {}): void {
  const t = 0.25, ph = range(rng, 0.6, 1.1);
  b.box(cx, h - 0.02, cz, w - 0.05, 0.06, d - 0.05, "#7c7b78", null, { kind: FacadeKind.Paving, seed: rng() * 9 });
  b.box(cx, h, cz + d / 2 - t / 2, w, ph, t, wallColor, PLAIN, PLAIN);
  b.box(cx, h, cz - d / 2 + t / 2, w, ph, t, wallColor, PLAIN, PLAIN);
  b.box(cx - w / 2 + t / 2, h, cz, t, ph, d - 2 * t, wallColor, PLAIN, PLAIN);
  b.box(cx + w / 2 - t / 2, h, cz, t, ph, d - 2 * t, wallColor, PLAIN, PLAIN);
  b.box(cx, h + ph, cz, w + 0.12, 0.08, d + 0.12, "#d8d4cc", PLAIN, PLAIN);
  const units = int(rng, 1, Math.max(1, Math.floor(w * d / 60)));
  for (let i = 0; i < units; i++) {
    const ux = cx + range(rng, -w / 2 + 1.5, w / 2 - 1.5), uz = cz + range(rng, -d / 2 + 1.5, d / 2 - 1.5);
    const big = chance(rng, 0.4);
    b.box(ux, h, uz, big ? 2.4 : 1.1, big ? 1.4 : 0.9, big ? 1.6 : 0.8, "#c9cbc8", [{ kind: FacadeKind.Grille }, PLAIN, { kind: FacadeKind.Grille }, PLAIN], { kind: FacadeKind.Grille });
  }
  for (let i = 0; i < int(rng, 1, 3); i++) b.cylinder(cx + range(rng, -w / 2 + 1, w / 2 - 1), h, cz + range(rng, -d / 2 + 1, d / 2 - 1), 0.12, range(rng, 0.8, 1.6), "#9a9c9e", 6);
  if (opts.lift) b.box(cx + w * 0.18, h, cz - d * 0.12, Math.min(4, w * 0.3), 2.8, Math.min(3.5, d * 0.3), wallColor, plainTex(WallTexture.Render, 1), PLAIN);
  if (opts.tank) {
    const tx = cx - w * 0.22, tz = cz + d * 0.1;
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(tx + dx * 0.9, h, tz + dz * 0.9, 0.15, 2.2, 0.15, "#4a4038", PLAIN, null);
    b.cylinder(tx, h + 2.2, tz, 1.35, 2.4, "#6b5442", 12, { kind: FacadeKind.Plain, tex: WallTexture.Timber }, true, 1.3);
    b.cylinder(tx, h + 4.6, tz, 1.4, 0.7, "#3a3634", 12, PLAIN, true, 0.05);
  }
  if (opts.solar) {
    const rows = Math.max(1, Math.floor((d - 3) / 2.4));
    for (let r = 0; r < Math.min(rows, 3); r++) {
      const z = cz - d / 2 + 2 + r * 2.4, x0 = cx - w / 2 + 1.5, x1 = cx + w / 2 - 1.5;
      b.quad([[x0, h + 0.4, z + 0.8], [x1, h + 0.4, z + 0.8], [x1, h + 1.1, z - 0.6], [x0, h + 1.1, z - 0.6]], "#1a2440", { kind: FacadeKind.Solar }, "flat");
    }
  }
}

/** 斜屋面上的平板（太阳能板）：沿 front 坡面 t0..t1 区间。 */
function slopePanel(b: BuildingMeshBuilder, x0: number, x1: number, eaveY: number, eaveZ: number, ridgeY: number, ridgeZ: number, t0: number, t1: number): void {
  const lerp = (t: number) => [eaveY + (ridgeY - eaveY) * t + 0.07, eaveZ + (ridgeZ - eaveZ) * t];
  const [ya, za] = lerp(t0), [yb, zb] = lerp(t1);
  b.quad([[x0, ya, za], [x1, ya, za], [x1, yb, zb], [x0, yb, zb]], "#18213a", { kind: FacadeKind.Solar }, "flat");
}

function lawn(b: BuildingMeshBuilder, cx: number, cz: number, w: number, d: number, seed: number): void {
  b.box(cx, 0, cz, w, 0.05, d, "#4a6b30", null, { kind: FacadeKind.Lawn, seed });
}
function paving(b: BuildingMeshBuilder, cx: number, cz: number, w: number, d: number, color: string, seed: number, y = 0): void {
  b.box(cx, y, cz, w, 0.07, d, color, PLAIN, { kind: FacadeKind.Paving, seed });
}
function hedge(b: BuildingMeshBuilder, cx: number, cz: number, w: number, d: number, h: number): void {
  const f: Facade = { kind: FacadeKind.Hedge, seed: cx * 0.3 + cz };
  b.box(cx, 0, cz, w, h, d, "#2f5020", f, f);
}

const wallFacade = (kind: FacadeKind, tex: WallTexture, seed: number, rng: Rng, extra: Partial<Facade> = {}): Facade => ({
  kind, tex, seed, floorH: 3, bay: range(rng, 2.4, 3.4), winW: range(rng, 0.42, 0.62), winH: range(rng, 0.45, 0.6), sill: range(rng, 0.26, 0.34),
  frame: Math.floor(rng() * 4), lit: range(rng, 0.25, 0.55), ...extra,
});

function wallMaterial(ctx: BuildCtx, rng: Rng, allowed: readonly WallTexture[]): { tex: WallTexture; color: string } {
  const tex = ctx.pick("tex", allowed, rng);
  const color = tex === WallTexture.Brick ? ctx.pick("brick", P.BRICK_COLORS, rng)
    : tex === WallTexture.Siding || tex === WallTexture.Timber ? ctx.pick("siding", P.SIDING_COLORS, rng)
    : tex === WallTexture.Panels ? ctx.pick("concrete", P.CONCRETE_COLORS, rng)
    : tex === WallTexture.Stone ? ctx.pick("stone", ["#cfc6b5", "#bdb3a2", "#d9d0bf", "#a89d8c"], rng)
    : ctx.pick("render", P.RENDER_COLORS, rng);
  return { tex, color };
}

// ---------- 原型 ----------

/** 独立住宅：坡顶 / 四坡 / 单坡 / 现代平顶，前院草坪、栅栏或绿篱、车库、门廊、烟囱、太阳能板。 */
export function detachedHouse(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main;
  const seed = ctx.serial() * 1.618;
  lawn(b, 0, 0, p.w - 0.2, p.d - 0.2, seed);
  const bw = Math.min(p.w - 3, range(rng, 7, 10.5)), bd = Math.min(p.d - 5.5, range(rng, 6.5, 9));
  const bx = range(rng, -1, 1) * Math.max(0, (p.w - bw) / 2 - 2.2);
  const front = p.d / 2 - range(rng, 3.6, 5);
  const bz = front - bd / 2;
  const roofStyle = ctx.pick("roof-style", ["gable-x", "gable-z", "hip", "shed", "flat", "gable-x", "hip"] as const, rng);
  const storeys = roofStyle === "flat" ? int(rng, 2, 3) : chance(rng, 0.3) ? 1 : 2;
  const floorH = range(rng, 2.8, 3.1);
  const wallH = storeys * floorH + 0.3;
  const { tex, color } = wallMaterial(ctx, rng, roofStyle === "flat" ? [WallTexture.Render, WallTexture.Timber, WallTexture.Render] : [WallTexture.Render, WallTexture.Siding, WallTexture.Brick, WallTexture.Timber, WallTexture.Siding]);
  const facade = wallFacade(FacadeKind.Punched, tex, seed, rng, { floorH, bay: range(rng, 2.3, 3), winW: roofStyle === "flat" ? 0.75 : range(rng, 0.38, 0.55), winH: roofStyle === "flat" ? 0.62 : 0.5, top: wallH - 0.2 });
  // 基座 + 主体
  b.box(bx, 0, bz, bw + 0.2, 0.45, bd + 0.2, "#8d877d", plainTex(WallTexture.Stone, seed), PLAIN);
  b.box(bx, 0.45, bz, bw, wallH - 0.45, bd, color, facade, roofStyle === "flat" || roofStyle === "shed" ? PLAIN : null);
  const roofColor = ctx.pick("roof", P.ROOF_COLORS, rng);
  const roofF: Facade = { kind: chance(rng, 0.75) ? FacadeKind.RoofTiles : FacadeKind.MetalSeam, seed };
  const gableF: Facade = { ...facade, top: wallH + 0.9 };
  let ridgeTop = wallH;
  if (roofStyle === "gable-x") {
    const rise = bd * range(rng, 0.32, 0.45);
    b.gableRoof(bx, wallH, bz, bw, bd, rise, 0.45, roofColor, color, roofF, gableF, "x");
    ridgeTop = wallH + rise;
    if (chance(rng, 0.45)) slopePanel(b, bx - bw * 0.35, bx + bw * 0.15, wallH, bz + bd / 2, wallH + rise, bz, 0.2, 0.75);
    if (chance(rng, 0.4)) {
      // 老虎窗
      const dx = bx + bw * 0.22, dz = bz + bd * 0.18;
      b.box(dx, wallH + rise * 0.15, dz, 1.6, rise * 0.55, 1.4, color, [{ ...facade, kind: FacadeKind.Punched, bay: 1.6, winW: 0.6, winH: 0.6, floorH: 1.2, sill: 0.2, groundH: wallH + rise * 0.15 }, PLAIN, null, PLAIN], null);
      b.gableRoof(dx, wallH + rise * 0.7, dz, 1.6, 1.4, 0.55, 0.12, roofColor, color, roofF, PLAIN, "z");
    }
  } else if (roofStyle === "gable-z") {
    const rise = bw * range(rng, 0.3, 0.42);
    b.gableRoof(bx, wallH, bz, bw, bd, rise, 0.45, roofColor, color, roofF, gableF, "z");
    ridgeTop = wallH + rise;
  } else if (roofStyle === "hip") {
    const rise = Math.min(bw, bd) * range(rng, 0.28, 0.38);
    b.hipRoof(bx, wallH, bz, bw, bd, rise, 0.55, roofColor, roofF);
    ridgeTop = wallH + rise;
  } else if (roofStyle === "shed") {
    const rise = range(rng, 1.2, 2.2);
    b.shedRoof(bx, wallH, bz, bw, bd, rise, 0.5, roofColor, color, { kind: FacadeKind.MetalSeam, seed }, plainTex(tex, seed));
    ridgeTop = wallH + rise;
    if (chance(rng, 0.6)) {
      const o = 0.5, z0 = bz - bd / 2 - o, z1 = bz + bd / 2 + o;
      slopePanel(b, bx - bw * 0.4, bx + bw * 0.4, wallH, z1, wallH + rise, z0, 0.15, 0.8);
    }
  } else {
    flatRoof(b, bx, bz, bw, bd, wallH, color, rng, { solar: chance(rng, 0.5) });
    // 现代住宅：错层体块 + 大面玻璃
    const cw = bw * 0.45;
    b.box(bx - bw / 2 + cw / 2, 0.45, bz + bd / 2 + 1.2, cw, floorH - 0.2, 2.4, "#2d3033", [{ kind: FacadeKind.Curtain, floorH: 9, bay: 1.6, seed, groundH: 0.2, frame: 3 }, { kind: FacadeKind.Curtain, floorH: 9, bay: 1.6, seed, groundH: 0.2, frame: 3 }, null, PLAIN], PLAIN, false, "#5c5f60");
  }
  // 烟囱
  if (roofStyle !== "flat" && roofStyle !== "shed" && chance(rng, 0.65)) {
    b.box(bx + bw * range(rng, -0.35, 0.35), wallH, bz - bd * 0.2, 0.7, ridgeTop - wallH + 0.9, 0.7, ctx.pick("brick", P.BRICK_COLORS, rng), plainTex(WallTexture.Brick, seed), PLAIN);
  }
  // 门 + 门廊
  const doorX = bx + range(rng, -0.25, 0.25) * bw;
  const frontZ = bz + bd / 2;
  b.box(doorX, 0, frontZ + 0.7, 2.2, 0.45, 1.4, "#9a948a", plainTex(WallTexture.Stone, seed), PLAIN);
  door(b, doorX, 0.45, frontZ, ctx.pick("door", P.DOOR_COLORS, rng));
  if (chance(rng, 0.7)) {
    const porchW = range(rng, 2.4, 3.4);
    for (const s of [-1, 1]) b.box(doorX + s * (porchW / 2 - 0.12), 0.45, frontZ + 1.25, 0.16, 2.45, 0.16, "#efece6", PLAIN, null);
    if (chance(rng, 0.5)) b.gableRoof(doorX, 2.9, frontZ + 0.7, porchW, 1.5, 0.6, 0.1, roofColor, "#efece6", roofF, PLAIN, "z");
    else b.box(doorX, 2.9, frontZ + 0.75, porchW, 0.14, 1.6, "#efece6", PLAIN, PLAIN);
  }
  // 车库
  const garageSide = bx > 0 ? -1 : 1;
  if (p.w - bw > 6 && chance(rng, 0.75)) {
    const gw = 3.4, gx = bx + garageSide * (bw / 2 + gw / 2), gz = frontZ - 3;
    b.box(gx, 0, gz, gw, 2.9, 6, color, [null, PLAIN, PLAIN, PLAIN].map((f, i) => (i === 0 ? plainTex(tex, seed) : f)) as Facade[], null);
    b.box(gx, 2.9, gz, gw + 0.2, 0.2, 6.2, "#5d5853", PLAIN, PLAIN);
    b.box(gx, 0, gz + 3.02, gw - 0.6, 2.3, 0.04, "#e8e6e0", [{ kind: FacadeKind.RollerDoor }, null, null, null], null);
    paving(b, gx, gz + 3 + (p.d / 2 - (gz + 3)) / 2, gw - 0.4, p.d / 2 - (gz + 3), "#8f8c86", seed, 0.02);
    if (chance(rng, 0.5)) acUnit(b, gx - garageSide * 0.3, 0.5, gz + 3);
  }
  // 入户小径
  paving(b, doorX, (frontZ + 1.4 + p.d / 2) / 2, 1.2, p.d / 2 - frontZ - 1.4, "#b5ada0", seed, 0.02);
  // 前院边界
  const edge = p.d / 2 - 0.25;
  const fenceStyle = ctx.pick("fence", ["picket", "hedge", "wall", "none", "picket", "hedge"] as const, rng);
  const fenceColor = ctx.pick("fence-color", ["#f2f0ea", "#6b4a2f", "#3a3a3a", "#e6dcc8"], rng);
  for (const [x0, x1] of [[-p.w / 2 + 0.2, doorX - 0.8], [doorX + 0.8, p.w / 2 - 0.2]]) {
    if (x1 - x0 < 0.4) continue;
    if (fenceStyle === "picket") screen(ctx.cut, x0, edge, x1, edge, 0, 1.05, fenceColor, FacadeKind.Fence, seed);
    else if (fenceStyle === "hedge") hedge(b, (x0 + x1) / 2, edge, x1 - x0, 0.7, range(rng, 0.8, 1.3));
    else if (fenceStyle === "wall") b.box((x0 + x1) / 2, 0, edge, x1 - x0, 0.7, 0.3, color, plainTex(tex === WallTexture.Brick ? WallTexture.Brick : WallTexture.Stone, seed), PLAIN);
  }
  // 树
  const t1 = world(p, -p.w / 2 + range(rng, 1.8, 3), -p.d / 2 + range(rng, 1.8, 3));
  ctx.tree(t1.x, t1.z, range(rng, 0.7, 1.05), int(rng, 0, 3));
  if (chance(rng, 0.55)) {
    const t2 = world(p, p.w / 2 - range(rng, 1.5, 2.5), p.d / 2 - range(rng, 1.4, 2.2));
    ctx.tree(t2.x, t2.z, range(rng, 0.5, 0.75), int(rng, 0, 3));
  }
  addSite(ctx, p, "residential", "独栋住宅", "House", bx, bz, bw, bd, ridgeTop, doorX, frontZ);
}

/** 联排住宅：逐户宽度、层数、颜色、屋顶（平顶檐口 / 山墙 / 孟莎式）、凸窗、台阶各不相同。 */
export function townhouseRow(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main;
  const depth = Math.min(p.d - 3, range(rng, 9.5, 11.5));
  const front = p.d / 2 - range(rng, 1.6, 2.4);
  const bz = front - depth / 2;
  lawn(b, 0, -p.d / 4, p.w - 0.2, p.d / 2, ctx.serial());
  paving(b, 0, (front + p.d / 2) / 2, p.w, p.d / 2 - front, "#b8b1a5", ctx.serial(), 0.01);
  let x = -p.w / 2;
  const units: number[] = [];
  while (p.w / 2 - x > 4.4) {
    const w = Math.min(p.w / 2 - x, range(rng, 4.6, 6.6));
    if (p.w / 2 - x - w < 4.4) { units.push(p.w / 2 - x); break; }
    units.push(w);
    x += w;
  }
  x = -p.w / 2;
  const style = ctx.pick("row-style", ["flat", "gable", "mansard", "mixed"] as const, rng);
  for (const [i, w] of units.entries()) {
    const seed = ctx.serial() * 2.3;
    const cx = x + w / 2;
    x += w;
    const floors = int(rng, 2, 4);
    const floorH = range(rng, 2.9, 3.3);
    const h = 0.6 + floors * floorH;
    const tex = ctx.pick("row-tex", [WallTexture.Brick, WallTexture.Render, WallTexture.Render, WallTexture.Siding, WallTexture.Brick], rng);
    const color = tex === WallTexture.Brick ? ctx.pick("brick", P.BRICK_COLORS, rng) : ctx.pick("townhouse", P.TOWNHOUSE_COLORS, rng);
    const f = wallFacade(FacadeKind.Punched, tex, seed, rng, { floorH, bay: w / 2, winW: range(rng, 0.42, 0.58), winH: range(rng, 0.52, 0.66), groundH: 0.6, top: h - 0.3 });
    b.box(cx, 0, bz, w, h, depth, color, [f, i === units.length - 1 ? f : null, plainTex(tex, seed), i === 0 ? f : null], null);
    const unitStyle = style === "mixed" ? ctx.pick("row-unit", ["flat", "gable", "mansard"] as const, rng) : style;
    const roofColor = ctx.pick("roof", P.ROOF_COLORS, rng);
    if (unitStyle === "flat") {
      b.box(cx, h, bz, w, 0.02, depth, "#6e6c68", null, { kind: FacadeKind.Paving, seed });
      b.box(cx, h, bz + depth / 2 - 0.15, w, range(rng, 0.5, 1.0), 0.3, color, plainTex(tex, seed), PLAIN);
      b.box(cx, h - 0.35, bz + depth / 2 + 0.12, w, 0.3, 0.25, "#ece8df", PLAIN, PLAIN, true);
    } else if (unitStyle === "gable") {
      b.gableRoof(cx, h, bz, w, depth, w * range(rng, 0.38, 0.55), 0.15, roofColor, color, { kind: FacadeKind.RoofTiles, seed }, { ...f, top: h + 1.5 }, "z");
    } else {
      // 孟莎式：陡坡四坡 + 屋面老虎窗
      b.hipRoof(cx, h, bz, w, depth, 2.6, 0.12, roofColor, { kind: FacadeKind.RoofTiles, seed });
      b.box(cx, h + 0.4, bz + depth / 2 - 0.9, Math.min(1.6, w * 0.4), 1.4, 0.9, color, [{ kind: FacadeKind.Punched, floorH: 1.4, bay: 2, winW: 0.7, winH: 0.7, sill: 0.15, groundH: h + 0.4, seed }, PLAIN, null, PLAIN], PLAIN);
    }
    // 台阶 + 门
    const doorX = cx + (rng() < 0.5 ? -1 : 1) * (w / 2 - 1.1);
    for (let s = 0; s < 3; s++) b.box(doorX, 0, bz + depth / 2 + 0.3 + (2 - s) * 0.3, 1.5, 0.2 * (s + 1), 0.32, "#bdb6aa", plainTex(WallTexture.Stone, seed), PLAIN);
    door(b, doorX, 0.6, bz + depth / 2, ctx.pick("door", P.DOOR_COLORS, rng));
    b.box(doorX, 3.0, bz + depth / 2 + 0.35, 1.5, 0.12, 0.7, "#eeeae2", PLAIN, PLAIN);
    // 凸窗
    if (chance(rng, 0.55)) {
      const bxw = Math.min(2.4, w - 2.6);
      const bxx = cx - (doorX - cx) * 0.8;
      if (bxw > 1.2) {
        const by = chance(rng, 0.5) ? 0.6 : 0.6 + floorH;
        b.box(bxx, by, bz + depth / 2 + 0.4, bxw, floorH - 0.2, 0.8, color, [{ ...f, bay: bxw, winW: 0.8, groundH: by, top: by + floorH }, { ...f, bay: 0.8, winW: 0.7, groundH: by, top: by + floorH }, null, { ...f, bay: 0.8, winW: 0.7, groundH: by, top: by + floorH }], PLAIN);
      }
    }
    if (chance(rng, 0.35)) acUnit(b, cx + (doorX - cx) * -0.4, 0.6 + floorH * 1.05, bz + depth / 2);
    // 后院分隔栅栏
    if (i > 0) screen(ctx.cut, cx - w / 2, bz - depth / 2, cx - w / 2, -p.d / 2 + 0.3, 0, 1.6, "#7a5a3a", FacadeKind.Fence, seed);
    if (chance(rng, 0.5)) { const t = world(p, cx, -p.d / 2 + 2.2); ctx.tree(t.x, t.z, range(rng, 0.55, 0.8), int(rng, 0, 3)); }
    addSite(ctx, p, "residential", "联排住宅", "Townhouse", cx, bz, w, depth, h, doorX, bz + depth / 2);
  }
}

/** 多层住宅（3–5 层）：阳台按开间交错、入口雨棚、屋面设备、空调外机。 */
export function lowRiseApartment(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main, seed = ctx.serial() * 3.1;
  const bw = p.w - range(rng, 1.5, 3), bd = Math.min(p.d - 4.5, range(rng, 11, 14));
  const front = p.d / 2 - range(rng, 2.5, 4);
  const bz = front - bd / 2;
  const floors = int(rng, 3, 5), floorH = range(rng, 2.95, 3.15);
  const h = floors * floorH + 0.4;
  const { tex, color } = wallMaterial(ctx, rng, [WallTexture.Brick, WallTexture.Render, WallTexture.Panels, WallTexture.Render]);
  const f = wallFacade(FacadeKind.Punched, tex, seed, rng, { floorH, groundH: 0.4, top: h - 0.3 });
  paving(b, 0, 0, p.w - 0.2, p.d - 0.2, "#a9a397", seed);
  b.box(0, 0, bz, bw, h, bd, color, f, null);
  flatRoof(b, 0, bz, bw, bd, h, color, rng, { solar: chance(rng, 0.4), lift: true });
  const bays = Math.max(2, Math.round(bw / (f.bay ?? 3)));
  const bay = bw / bays;
  const slab = ctx.pick("concrete", P.CONCRETE_COLORS, rng);
  const rail = ctx.pick("rail", ["#2d2f31", "#e9e7e1", "#5a4a3a", "#3c4a5a"], rng);
  const glassRail = chance(rng, 0.35);
  const pattern = int(rng, 0, 2);
  for (let fl = 1; fl < floors; fl++) {
    for (let i = 0; i < bays; i++) {
      const on = pattern === 0 ? i % 2 === fl % 2 : pattern === 1 ? i % 2 === 0 : i % 3 !== 1;
      if (!on) continue;
      const x = -bw / 2 + (i + 0.5) * bay;
      balcony(b, ctx.cut, x, 0.4 + fl * floorH, bz + bd / 2, bay * 0.86, 1.3, slab, rail, glassRail);
      if (chance(rng, 0.3)) acUnit(b, x + bay * 0.3, 0.4 + fl * floorH + 0.05, bz + bd / 2 + 1.0);
    }
  }
  // 入口
  const doorX = range(rng, -0.2, 0.2) * bw;
  b.box(doorX, 3.0, bz + bd / 2 + 1.1, 3.4, 0.18, 2.2, "#e6e3dc", PLAIN, PLAIN);
  for (const s of [-1, 1]) door(b, doorX + s * 0.55, 0.4, bz + bd / 2, "#30363b", 1.0, 2.4);
  const num = ctx.signs.add({ text: `${int(rng, 1, 88)}号`, sub: "RESIDENCE", bg: "#22303a", fg: "#ffffff" });
  ctx.signs.place(frameOf(p), num, doorX, 3.45, bz + bd / 2 + 2.22, 1.6, 0.4);
  hedge(b, -bw / 4 - 1, front + 1.2, bw / 2 - 3, 0.8, 0.9);
  hedge(b, bw / 4 + 1, front + 1.2, bw / 2 - 3, 0.8, 0.9);
  for (const sx of [-1, 1]) { const t = world(p, sx * (p.w / 2 - 2), -p.d / 2 + 2); ctx.tree(t.x, t.z, range(rng, 0.7, 1), int(rng, 0, 3)); }
  addSite(ctx, p, "residential", "多层公寓", "Apartments", 0, bz, bw, bd, h, doorX, bz + bd / 2);
}

/** 中高层住宅（6–11 层）：通长阳台、顶层退台、屋顶水箱 / 电梯机房，底层可带商铺。 */
export function midRise(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main, seed = ctx.serial() * 4.7;
  const bw = p.w - range(rng, 1, 2.5), bd = Math.min(p.d - 3, range(rng, 12, 16));
  const front = p.d / 2 - range(rng, 1.5, 3);
  const bz = front - bd / 2;
  const floors = int(rng, 6, 11), floorH = 3.05;
  const shops = chance(rng, 0.5);
  const groundH = shops ? 4.4 : 0.4;
  const h = groundH + (floors - 1) * floorH;
  const { tex, color } = wallMaterial(ctx, rng, [WallTexture.Panels, WallTexture.Render, WallTexture.Brick, WallTexture.Stone]);
  const f = wallFacade(shops ? FacadeKind.Shopfront : FacadeKind.Punched, tex, seed, rng, { floorH, groundH, top: h - 0.3, winW: range(rng, 0.5, 0.72), winH: range(rng, 0.5, 0.62) });
  paving(b, 0, 0, p.w - 0.2, p.d - 0.2, "#aaa498", seed);
  b.box(0, 0, bz, bw, h, bd, color, [f, { ...f, kind: FacadeKind.Punched }, { ...f, kind: FacadeKind.Punched }, { ...f, kind: FacadeKind.Punched }], null);
  // 顶层退台
  const tw = bw - 3, td = bd - 3;
  b.box(0, h, bz - 0.8, tw, floorH, td, color, { ...f, kind: FacadeKind.Ribbon, groundH: h, winH: 0.55, sill: 0.25, top: h + floorH }, null);
  flatRoof(b, 0, bz - 0.8, tw, td, h + floorH, color, rng, { tank: chance(rng, 0.6), lift: true });
  b.box(0, h, bz, bw, 0.12, bd, "#d0ccc4", PLAIN, PLAIN);
  const slab = ctx.pick("concrete", P.CONCRETE_COLORS, rng);
  const rail = ctx.pick("rail", ["#2d2f31", "#e9e7e1", "#5a4a3a", "#3c4a5a"], rng);
  const continuous = chance(rng, 0.5);
  const glassRail = chance(rng, 0.5);
  const bays = Math.max(2, Math.round(bw / (f.bay ?? 3)));
  for (let fl = 1; fl < floors; fl++) {
    const y = groundH + (fl - 1) * floorH;
    if (continuous) balcony(b, ctx.cut, 0, y, bz + bd / 2, bw - 0.6, 1.4, slab, rail, glassRail);
    else for (let i = 0; i < bays; i += 2) balcony(b, ctx.cut, -bw / 2 + (i + 1) * (bw / bays), y, bz + bd / 2, bw / bays * 1.7, 1.2, slab, rail, glassRail);
    if (chance(rng, 0.5)) acUnit(b, range(rng, -bw / 2 + 1, bw / 2 - 1), y + 0.05, bz + bd / 2 + 1.05);
  }
  if (shops) {
    const count = Math.max(1, Math.floor(bw / 7));
    for (let i = 0; i < count; i++) {
      const x = -bw / 2 + (i + 0.5) * (bw / count);
      const shop = ctx.shop(rng);
      const index = ctx.signs.add(shop);
      ctx.signs.place(frameOf(p), index, x, groundH - 0.42, bz + bd / 2 + 0.06, Math.min(5, bw / count - 1), 0.62);
      if (chance(rng, 0.6)) awning(b, x, groundH - 0.85, bz + bd / 2, Math.min(4.6, bw / count - 1.2), 1.3, ctx.pick("awning", P.AWNING_COLORS, rng));
      addSite(ctx, p, shop.kind, shop.sub ?? shop.text, shop.text, x, bz + bd / 2 - 3, bw / count, 6, groundH, x, bz + bd / 2);
    }
  }
  door(b, bw / 2 - 1.6, 0.0, bz + bd / 2, "#2a2f33", 1.2, 2.5);
  const t = world(p, -p.w / 2 + 1.6, p.d / 2 - 1.2);
  ctx.tree(t.x, t.z, 0.75, int(rng, 0, 3));
  addSite(ctx, p, "residential", "住宅楼", "Residential Tower", 0, bz, bw, bd, h + floorH, bw / 2 - 1.6, bz + bd / 2);
}

/** 底商上住：沿街橱窗、遮阳篷、招牌（每家不同），上部住宅，檐口线脚。 */
export function mixedUse(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main, seed = ctx.serial() * 5.3;
  const bw = p.w - 0.4, bd = Math.min(p.d - 1.5, range(rng, 11, 15));
  const front = p.d / 2 - 0.6;
  const bz = front - bd / 2;
  const floors = int(rng, 3, 6), floorH = 3.1, groundH = range(rng, 4.2, 4.8);
  const h = groundH + (floors - 1) * floorH;
  const { tex, color } = wallMaterial(ctx, rng, [WallTexture.Brick, WallTexture.Render, WallTexture.Stone, WallTexture.Brick]);
  const f = wallFacade(FacadeKind.Shopfront, tex, seed, rng, { floorH, groundH, top: h - 0.6, winW: range(rng, 0.42, 0.55), winH: range(rng, 0.55, 0.68), bay: range(rng, 2.6, 3.4) });
  paving(b, 0, 0, p.w, p.d, "#b4aea2", seed);
  b.box(0, 0, bz, bw, h, bd, color, [f, f, { ...f, kind: FacadeKind.Punched }, f], null);
  // 底层石材基座线 + 檐口
  b.box(0, groundH - 0.05, bz, bw + 0.15, 0.25, bd + 0.15, "#e7e1d4", PLAIN, null);
  b.box(0, h - 0.4, bz, bw + 0.4, 0.4, bd + 0.4, "#ebe6dc", PLAIN, null);
  if (chance(rng, 0.4)) b.hipRoof(0, h, bz, bw, bd, 2.2, 0.15, ctx.pick("roof", P.ROOF_COLORS, rng), { kind: FacadeKind.MetalSeam, seed });
  else flatRoof(b, 0, bz, bw, bd, h, color, rng, { tank: chance(rng, 0.3) });
  // 上层法式阳台
  if (chance(rng, 0.6)) {
    const bays = Math.max(2, Math.round(bw / (f.bay ?? 3)));
    for (let fl = 1; fl < floors; fl++) for (let i = 0; i < bays; i++) {
      const x = -bw / 2 + (i + 0.5) * (bw / bays);
      screen(ctx.cut, x - 0.7, bz + bd / 2 + 0.35, x + 0.7, bz + bd / 2 + 0.35, groundH + (fl - 1) * floorH + 0.15, 0.95, "#1f2224", FacadeKind.Railing);
      b.box(x, groundH + (fl - 1) * floorH, bz + bd / 2 + 0.18, 1.6, 0.12, 0.36, "#d9d4ca", PLAIN, PLAIN, true);
    }
  }
  const count = Math.max(1, Math.round(bw / 6.5));
  for (let i = 0; i < count; i++) {
    const x = -bw / 2 + (i + 0.5) * (bw / count);
    const shop = ctx.shop(rng);
    const index = ctx.signs.add(shop);
    ctx.signs.place(frameOf(p), index, x, groundH - 0.42, bz + bd / 2 + 0.06, Math.min(5.2, bw / count - 0.8), 0.66);
    if (chance(rng, 0.75)) awning(b, x, groundH - 0.85, bz + bd / 2, bw / count - 1, range(rng, 1.2, 1.8), ctx.pick("awning", P.AWNING_COLORS, rng));
    door(b, x + (bw / count) * 0.3, 0, bz + bd / 2, "#25292c", 1.1, 2.5);
    // 吊牌
    if (chance(rng, 0.4)) {
      const blade = ctx.signs.add({ text: shop.text.split(" ")[0], bg: shop.bg, fg: shop.fg });
      b.box(x - bw / count / 2 + 0.3, groundH + 0.6, bz + bd / 2 + 0.5, 0.06, 0.06, 1.0, "#222", PLAIN, PLAIN);
      ctx.signs.place(frameOf(p), blade, x - bw / count / 2 + 0.3, groundH + 0.2, bz + bd / 2 + 0.75, 0.9, 0.5, Math.PI / 2);
      ctx.signs.place(frameOf(p), blade, x - bw / count / 2 + 0.3, groundH + 0.2, bz + bd / 2 + 0.75, 0.9, 0.5, -Math.PI / 2);
    }
    addSite(ctx, p, shop.kind, shop.sub ?? shop.text, shop.text, x, bz + bd / 2 - 3, bw / count, 6, groundH, x + (bw / count) * 0.3, bz + bd / 2);
  }
  for (let i = 0; i < int(rng, 1, 3); i++) acUnit(b, range(rng, -bw / 2 + 1, bw / 2 - 1), groundH + int(rng, 0, floors - 2) * floorH + 0.3, bz + bd / 2);
  addSite(ctx, p, "residential", "沿街住宅", "Flats", 0, bz, bw, bd, h, bw / 2 - 0.8, bz + bd / 2);
}

/** 写字楼：玻璃幕墙 / 条带窗、双层通高门厅、雨棚、屋面设备与楼顶标识。 */
export function office(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main, seed = ctx.serial() * 6.1;
  const bw = p.w - range(rng, 2, 4), bd = p.d - range(rng, 4, 7);
  const bz = p.d / 2 - range(rng, 2, 3.5) - bd / 2;
  const floors = int(rng, 5, 12), floorH = 3.7, groundH = 5.2;
  const h = groundH + (floors - 1) * floorH;
  const curtain = chance(rng, 0.5);
  const color = curtain ? ctx.pick("glass", P.GLASS_TINTS, rng) : ctx.pick("concrete", P.CONCRETE_COLORS, rng);
  const f: Facade = curtain
    ? { kind: FacadeKind.Curtain, floorH, bay: range(rng, 2.6, 3.6), seed, groundH, frame: int(rng, 0, 3), lit: range(rng, 0.3, 0.6) }
    : { kind: FacadeKind.Ribbon, floorH, bay: 3, seed, groundH, winH: range(rng, 0.5, 0.65), sill: range(rng, 0.22, 0.3), frame: int(rng, 0, 3), lit: 0.5, tex: WallTexture.Panels };
  paving(b, 0, 0, p.w, p.d, "#c2bdb2", seed);
  b.box(0, groundH, bz, bw, h - groundH, bd, color, { ...f, groundH }, null);
  // 门厅：内退的通高玻璃
  b.box(0, 0, bz, bw - 1.2, groundH, bd - 1.2, "#5a6a74", { kind: FacadeKind.Curtain, floorH: groundH * 2, bay: 2.2, seed, groundH: 0.1, frame: 3, lit: 0.9 }, null);
  for (let i = 0; i <= 4; i++) b.box(-bw / 2 + 0.6 + i * (bw - 1.2) / 4, 0, bz + bd / 2 - 0.6, 0.5, groundH, 0.5, "#d6d2ca", plainTex(WallTexture.Stone, seed), null);
  b.box(0, groundH - 0.6, bz + bd / 2 + 1.0, bw * 0.4, 0.25, 3, "#2b2e31", PLAIN, PLAIN, true);
  for (const s of [-1, 1]) door(b, s * 0.6, 0, bz + bd / 2 - 0.6, "#1b1f22", 1.1, 2.6);
  flatRoof(b, 0, bz, bw, bd, h, curtain ? "#8a9296" : color, rng, { lift: true });
  const names = ["SN0VV TECH", "海湾传媒", "NORTHWIND", "蓝湾资本", "ORBIT LABS", "云杉设计", "HARBOR LAW", "PIXELWORKS"];
  const name = ctx.pick("office-name", names, rng);
  const index = ctx.signs.add({ text: name, bg: "#101418", fg: ctx.pick("office-fg", ["#ffffff", "#7fd3ff", "#ffcf6a", "#a8ffcf"], rng) });
  ctx.signs.place(frameOf(p), index, 0, h + 1.2, bz + bd / 2 - 0.3, Math.min(10, bw * 0.6), Math.min(10, bw * 0.6) / 4);
  for (const sx of [-1, 1]) { const t = world(p, sx * (p.w / 2 - 1.6), p.d / 2 - 1.2); ctx.tree(t.x, t.z, 0.8, int(rng, 0, 3)); }
  addSite(ctx, p, "office", name, name, 0, bz, bw, bd, h, 0.6, bz + bd / 2 - 0.6);
}

/** 高层塔楼：1–3 段退台、幕墙，楼冠六选一（尖顶、灯笼、斜顶、停机坪、阶梯、环形冠），航空障碍灯。 */
export function tower(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main, seed = ctx.serial() * 7.7;
  let w = Math.min(p.w - 3, 22), d = Math.min(p.d - 3, 22);
  const floors = int(rng, 16, 32), floorH = 3.6;
  const tiers = int(rng, 1, 3);
  const color = ctx.pick("glass", P.GLASS_TINTS, rng);
  const frame = int(rng, 0, 3);
  paving(b, 0, 0, p.w, p.d, "#c7c2b8", seed);
  // 裙楼
  const podiumH = 6.5;
  b.box(0, 0, 0, w + 2, podiumH, d + 2, ctx.pick("stone", ["#cfc6b5", "#bdb3a2", "#3a3d40", "#d9d0bf"], rng), { kind: FacadeKind.Shopfront, floorH: 3.2, bay: 3, groundH: podiumH - 0.6, seed, frame, tex: WallTexture.Stone }, PLAIN);
  let y = podiumH;
  let remaining = floors;
  for (let t = 0; t < tiers; t++) {
    const n = t === tiers - 1 ? remaining : Math.floor(remaining * range(rng, 0.45, 0.65));
    remaining -= n;
    const h = n * floorH;
    const f: Facade = { kind: chance(rng, 0.8) ? FacadeKind.Curtain : FacadeKind.Ribbon, floorH, bay: range(rng, 2.8, 3.8), seed: seed + t, groundH: y, frame, lit: range(rng, 0.35, 0.6), tex: WallTexture.Panels, winH: 0.62, sill: 0.2 };
    b.box(0, y, 0, w, h, d, color, f, PLAIN, false, "#5e6366");
    // 竖向装饰肋
    if (chance(rng, 0.5)) for (const s of [-1, 1]) b.box(s * w / 2, y, d / 2, 0.5, h, 0.5, "#d8d8d4", PLAIN, null);
    y += h;
    if (t < tiers - 1) { w *= range(rng, 0.72, 0.85); d *= range(rng, 0.72, 0.85); }
  }
  const crown = ctx.pick("crown", ["spire", "lantern", "slope", "helipad", "stepped", "ring"] as const, rng);
  if (crown === "spire") {
    b.box(0, y, 0, w * 0.7, 3, d * 0.7, "#9aa2a8", { kind: FacadeKind.Grille }, PLAIN);
    b.pyramid(0, y + 3, 0, w * 0.5, d * 0.5, range(rng, 8, 14), "#c9ced2", { kind: FacadeKind.MetalSeam });
    b.cylinder(0, y + 10, 0, 0.18, range(rng, 10, 18), "#d0d0d0", 6);
  } else if (crown === "lantern") {
    b.box(0, y, 0, w * 0.8, 6, d * 0.8, "#cfe8ff", { kind: FacadeKind.Curtain, floorH: 12, bay: 1.2, groundH: y, seed, frame: 1, lit: 1 }, PLAIN);
    b.box(0, y + 6, 0, w * 0.86, 0.6, d * 0.86, "#e0e0dc", PLAIN, PLAIN);
  } else if (crown === "slope") {
    b.shedRoof(0, y, 0, w, d, range(rng, 6, 10), 0.1, color, color, { kind: FacadeKind.Curtain, floorH: 4, bay: 3, seed, frame }, { kind: FacadeKind.Curtain, floorH, bay: 3, seed, groundH: y, frame });
  } else if (crown === "helipad") {
    b.box(0, y, 0, w * 0.5, 3.5, d * 0.5, "#8c9296", PLAIN, PLAIN);
    b.cylinder(0, y + 3.5, 0, Math.min(w, d) * 0.48, 0.35, "#3b3f42", 16);
    b.box(0, y + 3.86, 0, 1.0, 0.02, 4.0, "#f2f2f2", null, PLAIN);
    b.box(-1.4, y + 3.86, 0, 0.6, 0.02, 4.0, "#f2f2f2", null, PLAIN);
    b.box(1.4, y + 3.86, 0, 0.6, 0.02, 4.0, "#f2f2f2", null, PLAIN);
  } else if (crown === "stepped") {
    let sw = w, sd = d, sy = y;
    for (let i = 0; i < 3; i++) { sw *= 0.78; sd *= 0.78; b.box(0, sy, 0, sw, 3.2, sd, color, { kind: FacadeKind.Curtain, floorH: 3.2, bay: 2.5, seed, groundH: sy, frame, lit: 0.7 }, PLAIN); sy += 3.2; }
    b.cylinder(0, sy, 0, 0.15, 12, "#d0d0d0", 6);
  } else {
    flatRoof(b, 0, 0, w, d, y, "#9aa0a4", rng, { lift: true });
    for (const [dx, dz, ww, dd] of [[0, d / 2, w, 0.4], [0, -d / 2, w, 0.4], [w / 2, 0, 0.4, d], [-w / 2, 0, 0.4, d]]) b.box(dx, y + 2.5, dz, ww, 1.6, dd, "#e8e8e4", PLAIN, PLAIN, true);
    for (const [dx, dz] of [[w / 2, d / 2], [-w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]]) b.box(dx, y, dz, 0.4, 2.5, 0.4, "#e8e8e4", PLAIN, null);
  }
  const names = ["BAYVIEW TOWER", "海湾中心", "AURORA", "云帆大厦", "MERIDIAN", "星港金融"];
  const name = ctx.pick("tower-name", names, rng);
  const index = ctx.signs.add({ text: name, bg: "#0b0d10", fg: "#ffffff" });
  ctx.signs.place(frameOf(p), index, 0, podiumH + 0.9, (Math.min(p.d - 3, 22) + 2) / 2 + 0.05, 8, 1.6);
  for (const sx of [-1, 1]) { const t = world(p, sx * (p.w / 2 - 1.4), p.d / 2 - 1.1); ctx.tree(t.x, t.z, 0.85, int(rng, 0, 3)); }
  addSite(ctx, p, "office", name, name, 0, 0, w, d, y, 0, (Math.min(p.d - 3, 22) + 2) / 2);
}

/** 仓库 / 物流中心：压型钢板、低坡屋顶、卷帘门、装卸平台、办公附楼与企业标识。 */
export function warehouse(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main, seed = ctx.serial() * 8.3;
  const bw = p.w - 2, bd = p.d - range(rng, 6, 8);
  const bz = p.d / 2 - range(rng, 5, 6.5) - bd / 2;
  const h = range(rng, 7, 9.5);
  const color = ctx.pick("warehouse", ["#c9cdd0", "#8fa3b0", "#d7c9a8", "#9aa69a", "#b7b0a5", "#6f8796"], rng);
  const wall: Facade = { kind: FacadeKind.MetalSeam, seed };
  paving(b, 0, 0, p.w, p.d, "#7d7b77", seed);
  b.box(0, 0, bz, bw, 1.2, bd, "#9b9890", plainTex(WallTexture.Panels, seed), null);
  b.box(0, 1.2, bz, bw, h - 1.2, bd, color, wall, null);
  b.gableRoof(0, h, bz, bw, bd, 1.6, 0.3, "#8a8e90", color, { kind: FacadeKind.MetalSeam, seed }, wall, "x");
  // 采光带
  b.box(0, h + 0.2, bz + bd * 0.25, bw * 0.9, 0.05, 1.2, "#dfe8ec", null, PLAIN);
  const doors = Math.max(2, Math.floor(bw / 6));
  b.box(0, 0, bz + bd / 2 + 1.5, bw * 0.9, 1.2, 3, "#8c8a85", plainTex(WallTexture.Panels, seed), { kind: FacadeKind.Paving, seed });
  for (let i = 0; i < doors; i++) {
    const x = -bw * 0.45 + (i + 0.5) * (bw * 0.9 / doors);
    b.box(x, 1.2, bz + bd / 2 + 0.03, 3.4, 3.6, 0.05, ctx.pick("roller", ["#e2e2de", "#5a6a7a", "#c99a3a", "#e2e2de"], rng), [{ kind: FacadeKind.RollerDoor }, null, null, null], null);
    b.box(x, 4.9, bz + bd / 2 + 0.6, 4, 0.12, 1.2, "#4a4e52", PLAIN, PLAIN);
    for (const s of [-1, 1]) b.box(x + s * 1.9, 0.2, bz + bd / 2 + 3.05, 0.25, 1, 0.12, "#1d1d1d", PLAIN, PLAIN);
  }
  // 办公附楼
  const ow = Math.min(8, bw * 0.3);
  b.box(bw / 2 - ow / 2, 0, bz + bd / 2 + 1.5, ow, 6.4, 3, "#eceae4", [{ kind: FacadeKind.Ribbon, floorH: 3.2, bay: 3, seed, groundH: 0.2, winH: 0.55, sill: 0.3, frame: 1, lit: 0.6 }, PLAIN, null, PLAIN], PLAIN);
  const brand = ctx.pick("logistics", [{ text: "SWIFT 物流", bg: "#0d3b66", fg: "#f4d35e" }, { text: "海港冷链", sub: "COLD CHAIN", bg: "#e8f1f2", fg: "#13315c" }, { text: "BAYWORKS", sub: "仓储 · 配送", bg: "#2f2f2f", fg: "#ff7f11" }], rng);
  const index = ctx.signs.add(brand);
  ctx.signs.place(frameOf(p), index, -bw * 0.15, h - 1.4, bz + bd / 2 + 0.06, Math.min(12, bw * 0.45), Math.min(12, bw * 0.45) / 4);
  // 围栏
  screen(ctx.cut, -p.w / 2 + 0.3, p.d / 2 - 0.3, -2.5, p.d / 2 - 0.3, 0, 1.9, "#4a5560", FacadeKind.Railing);
  screen(ctx.cut, 2.5, p.d / 2 - 0.3, p.w / 2 - 0.3, p.d / 2 - 0.3, 0, 1.9, "#4a5560", FacadeKind.Railing);
  addSite(ctx, p, "service", brand.text, brand.text, 0, bz, bw, bd, h, bw / 2 - ow / 2, bz + bd / 2 + 3);
}

/** 教堂：石砌中殿（山墙朝街）、彩色玻璃尖窗、钟楼尖塔、圆花窗、拱门。 */
export function church(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main, seed = ctx.serial() * 9.1;
  lawn(b, 0, 0, p.w, p.d, seed);
  const nw = Math.min(p.w - 5, 10), nd = Math.min(p.d - 6, 20);
  const front = p.d / 2 - 4;
  const bz = front - nd / 2;
  const stone = ctx.pick("church-stone", ["#cfc4ae", "#b9ab92", "#d8cfbd"], rng);
  const wall = plainTex(WallTexture.Stone, seed);
  const wallH = 8.5;
  b.box(0, 0, bz, nw, wallH, nd, stone, wall, null);
  b.gableRoof(0, wallH, bz, nw, nd, 5.2, 0.3, "#3d4448", stone, { kind: FacadeKind.RoofTiles, seed }, wall, "z");
  // 侧窗（彩色玻璃）
  for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
    const z = bz - nd / 2 + 2.5 + i * (nd - 5) / 4;
    const x = side * (nw / 2 + 0.03);
    const y0 = 2.2, y1 = 6.6;
    const q = side > 0 ? [[x, y0, z + 0.55], [x, y0, z - 0.55], [x, y1, z - 0.55], [x, y1, z + 0.55]] : [[x, y0, z - 0.55], [x, y0, z + 0.55], [x, y1, z + 0.55], [x, y1, z - 0.55]];
    b.quad(q, "#ffffff", { kind: FacadeKind.StainedGlass }, "flat");
    b.triangle(side > 0 ? [[x, y1, z + 0.55], [x, y1, z - 0.55], [x, y1 + 0.8, z]] : [[x, y1, z - 0.55], [x, y1, z + 0.55], [x, y1 + 0.8, z]], "#ffffff", { kind: FacadeKind.StainedGlass }, "flat");
    b.box(x + side * 0.3, 0, z + 1.5, 0.6, wallH - 0.5, 0.6, stone, wall, PLAIN);
  }
  // 圆花窗（八边形）
  const fz = bz + nd / 2 + 0.04;
  const rose = 1.4, ry = wallH + 1.2;
  for (let i = 0; i < 8; i++) {
    const a0 = i / 8 * Math.PI * 2, a1 = (i + 1) / 8 * Math.PI * 2;
    b.triangle([[0, ry, fz], [Math.sin(a0) * rose, ry + Math.cos(a0) * rose, fz], [Math.sin(a1) * rose, ry + Math.cos(a1) * rose, fz]].reverse(), "#ffffff", { kind: FacadeKind.StainedGlass }, "flat");
  }
  door(b, -0.6, 0, bz + nd / 2, "#5a3a22", 1.15, 3.2);
  door(b, 0.6, 0, bz + nd / 2, "#5a3a22", 1.15, 3.2);
  b.gableRoof(0, 3.4, bz + nd / 2 + 0.5, 3.4, 1.0, 1.2, 0.05, stone, stone, wall, wall, "z");
  // 钟楼
  const tx = -nw / 2 - 1.6, tz = bz + nd / 2 - 2.4, tw = 4.2;
  b.box(tx, 0, tz, tw, 18, tw, stone, wall, null);
  for (const [qx, qz, nx] of [[0, tw / 2 + 0.02, 0], [tw / 2 + 0.02, 0, 1], [0, -tw / 2 - 0.02, 2], [-tw / 2 - 0.02, 0, 3]] as const) {
    const y0 = 13.5, y1 = 16.5, hw = 0.8;
    const pts = nx === 0 ? [[tx - hw, y0, tz + qz], [tx + hw, y0, tz + qz], [tx + hw, y1, tz + qz], [tx - hw, y1, tz + qz]]
      : nx === 1 ? [[tx + qx, y0, tz + hw], [tx + qx, y0, tz - hw], [tx + qx, y1, tz - hw], [tx + qx, y1, tz + hw]]
      : nx === 2 ? [[tx + hw, y0, tz + qz], [tx - hw, y0, tz + qz], [tx - hw, y1, tz + qz], [tx + hw, y1, tz + qz]]
      : [[tx + qx, y0, tz - hw], [tx + qx, y0, tz + hw], [tx + qx, y1, tz + hw], [tx + qx, y1, tz - hw]];
    b.quad(pts, "#141414", PLAIN, "flat");
  }
  b.box(tx, 18, tz, tw + 0.5, 0.5, tw + 0.5, stone, wall, PLAIN);
  b.pyramid(tx, 18.5, tz, tw, tw, 11, "#3c5a52", { kind: FacadeKind.MetalSeam });
  b.box(tx, 29.4, tz, 0.12, 1.8, 0.12, "#c9a74a", PLAIN, PLAIN);
  b.box(tx, 30.4, tz, 0.9, 0.12, 0.12, "#c9a74a", PLAIN, PLAIN);
  // 钟面
  b.box(tx, 10.4, tz + tw / 2 + 0.06, 1.5, 1.5, 0.06, "#f1ead8", PLAIN, PLAIN);
  paving(b, 0, (front + p.d / 2) / 2 + 0.5, 4.5, p.d / 2 - front, "#c9c0ae", seed, 0.02);
  b.box(0, 0, p.d / 2 - 0.4, p.w - 0.4, 0.8, 0.4, stone, wall, PLAIN);
  for (const sx of [-1, 1]) for (const sz of [-0.3, 0.2]) { const t = world(p, sx * (p.w / 2 - 2), sz * p.d); ctx.tree(t.x, t.z, range(rng, 0.8, 1.1), int(rng, 0, 3)); }
  addSite(ctx, p, "service", "圣玛丽教堂", "St. Mary's Church", 0, bz, nw, nd, 30, 0, bz + nd / 2);
}

/** 加油站：罩棚 + 立柱、加油岛、便利店、价格立牌。 */
export function gasStation(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main, seed = ctx.serial() * 10.3;
  paving(b, 0, 0, p.w, p.d, "#5d5f61", seed);
  const brand = { text: "SN0VV FUEL", sub: "加油站 · 24H", bg: "#0f6b3a", fg: "#ffffff" };
  const accent = "#0f6b3a";
  const cw = Math.min(p.w - 3, 13), cd = 8, cz = p.d / 2 - 6;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.box(sx * (cw / 2 - 1.2), 0, cz + sz * (cd / 2 - 1.2), 0.45, 5.0, 0.45, "#e9e9e6", PLAIN, null);
  b.box(0, 5.0, cz, cw, 0.9, cd, "#f4f4f1", PLAIN, PLAIN, true);
  b.box(0, 5.25, cz + cd / 2 + 0.01, cw, 0.4, 0.04, accent, PLAIN, null);
  b.box(0, 5.25, cz - cd / 2 - 0.01, cw, 0.4, 0.04, accent, PLAIN, null);
  const index = ctx.signs.add(brand);
  ctx.signs.place(frameOf(p), index, 0, 5.62, cz + cd / 2 + 0.04, 4.8, 0.5);
  for (const sx of [-1, 1]) {
    b.box(sx * 2.6, 0, cz, 1.2, 0.25, 5.4, "#c9c6bf", PLAIN, PLAIN);
    for (const sz of [-1.4, 1.4]) {
      b.box(sx * 2.6, 0.25, cz + sz, 0.8, 1.75, 0.55, "#f2f2ee", [{ kind: FacadeKind.Plain }, PLAIN, PLAIN, PLAIN], PLAIN);
      b.box(sx * 2.6, 1.55, cz + sz + 0.285, 0.6, 0.35, 0.02, "#16181a", PLAIN, null);
      b.box(sx * 2.6, 0.25, cz + sz, 0.84, 0.25, 0.6, accent, PLAIN, null);
    }
  }
  // 便利店
  const sw = Math.min(p.w - 4, 12), sd = 7, sz = -p.d / 2 + sd / 2 + 1.5;
  b.box(0, 0, sz, sw, 4.2, sd, "#eceae5", [{ kind: FacadeKind.Shopfront, groundH: 4.2, bay: 3, seed, frame: 1 }, PLAIN, PLAIN, PLAIN], PLAIN);
  b.box(0, 3.6, sz + sd / 2 + 0.02, sw, 0.6, 0.06, accent, PLAIN, null);
  const shopSign = ctx.signs.add({ text: "便利店 MART", bg: accent, fg: "#ffffff" });
  ctx.signs.place(frameOf(p), shopSign, 0, 3.9, sz + sd / 2 + 0.07, 4.2, 0.5);
  door(b, sw / 2 - 1.5, 0, sz + sd / 2, "#20262a", 1.2, 2.4);
  // 价格立牌
  const px = p.w / 2 - 1.5, pz = p.d / 2 - 1.2;
  b.box(px, 0, pz, 0.35, 6.5, 0.35, "#3a3a3a", PLAIN, PLAIN);
  b.box(px, 4.2, pz, 2.0, 2.6, 0.4, accent, PLAIN, PLAIN);
  const price = ctx.signs.add({ text: "92# 7.68", sub: "95# 8.21 · 98# 9.05", bg: "#111", fg: "#ffb000" });
  ctx.signs.place(frameOf(p), index, px, 6.2, pz + 0.21, 1.8, 0.45);
  ctx.signs.place(frameOf(p), price, px, 5.0, pz + 0.21, 1.8, 0.9);
  ctx.signs.place(frameOf(p), price, px, 5.0, pz - 0.21, 1.8, 0.9, Math.PI);
  addSite(ctx, p, "retail", "SN0VV 加油站", "SN0VV Fuel", 0, sz, sw, sd, 6, sw / 2 - 1.5, sz + sd / 2);
}

/** 街角咖啡馆：通透橱窗、条纹遮阳篷、外摆桌椅与遮阳伞、花箱。 */
export function cafe(ctx: BuildCtx, p: Parcel, rng: Rng): void {
  begin(ctx, p);
  const b = ctx.main, seed = ctx.serial() * 11.9;
  paving(b, 0, 0, p.w, p.d, "#c4b9a6", seed);
  const bw = Math.min(p.w - 2, range(rng, 8, 11)), bd = Math.min(p.d - 6, range(rng, 7, 9));
  const bz = -p.d / 2 + bd / 2 + 1;
  const two = chance(rng, 0.5);
  const h = two ? 7 : 4;
  const { tex, color } = wallMaterial(ctx, rng, [WallTexture.Brick, WallTexture.Timber, WallTexture.Render]);
  b.box(0, 0, bz, bw, h, bd, color, [{ kind: FacadeKind.Shopfront, groundH: 4, floorH: 3, bay: 2.6, seed, tex, frame: 2, top: h - 0.4, winW: 0.6, winH: 0.6 }, { kind: FacadeKind.Shopfront, groundH: 4, floorH: 3, bay: 2.6, seed, tex, frame: 2, top: h - 0.4 }, plainTex(tex, seed), plainTex(tex, seed)], null);
  if (chance(rng, 0.5)) b.gableRoof(0, h, bz, bw, bd, 2.4, 0.3, ctx.pick("roof", P.ROOF_COLORS, rng), color, { kind: FacadeKind.RoofTiles, seed }, plainTex(tex, seed), "x");
  else flatRoof(b, 0, bz, bw, bd, h, color, rng);
  const shop = ctx.shop(rng);
  const index = ctx.signs.add(shop);
  ctx.signs.place(frameOf(p), index, 0, 3.6, bz + bd / 2 + 0.06, Math.min(5, bw - 2), 0.62);
  awning(b, 0, 3.15, bz + bd / 2, bw - 0.6, 2.2, ctx.pick("awning", P.AWNING_COLORS, rng));
  door(b, bw / 2 - 1.4, 0, bz + bd / 2, "#3a2a1f", 1.1, 2.4);
  // 外摆
  const umbrella = ctx.pick("umbrella", ["#f2efe6", "#c0392b", "#2c6e49", "#1f4e79"], rng);
  const tables = Math.max(2, Math.floor((p.w - 3) / 3.2));
  for (let i = 0; i < tables; i++) {
    const tx = -p.w / 2 + 2 + i * (p.w - 4) / Math.max(1, tables - 1), tz = bz + bd / 2 + 4;
    b.cylinder(tx, 0, tz, 0.05, 0.74, "#2b2b2b", 6, PLAIN, false);
    b.cylinder(tx, 0.74, tz, 0.4, 0.04, "#e9e4da", 10);
    for (const s of [-1, 1]) {
      b.box(tx + s * 0.62, 0, tz, 0.42, 0.45, 0.42, "#3a2e25", PLAIN, PLAIN);
      b.box(tx + s * 0.8, 0.45, tz, 0.05, 0.42, 0.42, "#3a2e25", PLAIN, PLAIN);
    }
    if (i % 2 === 0) {
      b.cylinder(tx, 0.78, tz, 0.03, 1.6, "#ddd", 5, PLAIN, false);
      b.cylinder(tx, 2.1, tz, 1.4, 0.45, umbrella, 8, PLAIN, true, 0.02);
    }
  }
  for (const sx of [-1, 1]) hedge(b, sx * (p.w / 2 - 0.8), bz + bd / 2 + 4, 0.6, 3.5, 0.75);
  const t = world(p, p.w / 2 - 1.5, p.d / 2 - 1.2);
  ctx.tree(t.x, t.z, 0.8, int(rng, 0, 3));
  addSite(ctx, p, shop.kind === "restaurant" ? "restaurant" : "retail", shop.sub ?? shop.text, shop.text, 0, bz, bw, bd, h, bw / 2 - 1.4, bz + bd / 2);
}

export const ARCHETYPES: Record<Archetype, (ctx: BuildCtx, p: Parcel, rng: Rng) => void> = {
  detached: detachedHouse, townhouses: townhouseRow, lowrise: lowRiseApartment, midrise: midRise, mixed: mixedUse,
  office, tower, warehouse, church, gas: gasStation, cafe,
};
