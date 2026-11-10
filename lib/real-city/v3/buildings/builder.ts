import * as THREE from "three";

/**
 * v3 城市建筑：所有体块写入一份合并几何（位置 / 法线 / 颜色 / 立面坐标 + 三组立面参数），
 * 立面细节（窗格、砖缝、屋瓦、栏杆、夜间亮窗）全部由同一个着色器按顶点参数程序化绘制，
 * 整个街区只有一到两次绘制调用。
 */
export enum FacadeKind {
  Plain = 0,
  Punched = 1,
  Shopfront = 2,
  Curtain = 3,
  Ribbon = 4,
  RoofTiles = 5,
  MetalSeam = 6,
  Fence = 8,
  RollerDoor = 9,
  Lawn = 10,
  Paving = 11,
  Solar = 12,
  Railing = 13,
  Grille = 14,
  Door = 15,
  Hedge = 16,
  StainedGlass = 17,
}

export enum WallTexture { Render = 0, Brick = 1, Siding = 2, Panels = 3, Stone = 4, Timber = 5 }

export type Facade = {
  kind: FacadeKind;
  /** 层高（米）；窗格按层重复。 */
  floorH?: number;
  /** 目标开间宽（米）；实际开间按墙宽取整均分。 */
  bay?: number;
  seed?: number;
  tex?: WallTexture;
  winW?: number;
  winH?: number;
  /** 底层（商铺）高度；Punched 时 >0 表示底层不开窗（由门 / 车库代替）。 */
  groundH?: number;
  /** 立面开窗上限（建筑本地高度）。 */
  top?: number;
  /** 窗框颜色 0 = 白，1 = 深灰，2 = 木色，3 = 黑金属。 */
  frame?: number;
  /** 亮窗比例（夜间）。 */
  lit?: number;
  /** 窗下沿离层底的比例。 */
  sill?: number;
};

const PLAIN: Facade = { kind: FacadeKind.Plain };

export type Frame = { x: number; y: number; z: number; yaw: number };

export class BuildingMeshBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly uvs: number[] = [];
  private readonly fa: number[] = [];
  private readonly fb: number[] = [];
  private readonly fc: number[] = [];
  private frame: Frame = { x: 0, y: 0, z: 0, yaw: 0 };
  private cos = 1;
  private sin = 0;
  private readonly color = new THREE.Color();

  setFrame(frame: Frame): void {
    this.frame = frame;
    this.cos = Math.cos(frame.yaw);
    this.sin = Math.sin(frame.yaw);
  }

  get vertexCount(): number { return this.positions.length / 3; }

  private push(lx: number, ly: number, lz: number, nx: number, ny: number, nz: number, u: number, v: number, facade: Facade, bay: number): void {
    const { x, y, z } = this.frame;
    // 本地 → 世界：绕 Y 轴旋转 yaw（与 Object3D.rotation.y 相同方向）。
    this.positions.push(x + lx * this.cos + lz * this.sin, y + ly, z - lx * this.sin + lz * this.cos);
    this.normals.push(nx * this.cos + nz * this.sin, ny, -nx * this.sin + nz * this.cos);
    this.colors.push(this.color.r, this.color.g, this.color.b);
    this.uvs.push(u, v);
    this.fa.push(facade.kind, facade.floorH ?? 3, bay, facade.seed ?? 0);
    this.fb.push(facade.tex ?? 0, facade.winW ?? 0.55, facade.winH ?? 0.55, facade.groundH ?? 0);
    this.fc.push(facade.top ?? 999, facade.frame ?? 0, facade.sill ?? 0.3, facade.lit ?? 0.35);
  }

  /**
   * 平面四边形（本地坐标，逆时针朝外）。u 沿 p0→p1 方向（米），v 取各点本地高度（与楼层对齐），
   * 若 flatUv 则按 p0→p3 距离。
   */
  quad(p: readonly (readonly number[])[], color: THREE.ColorRepresentation, facade: Facade = PLAIN, uvMode: "wall" | "flat" = "wall", uOffset = 0): void {
    this.color.set(color);
    const [a, b, , d] = p;
    const e1 = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const e2 = new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    const width = e1.length();
    const target = facade.bay ?? 3;
    const bay = width / Math.max(1, Math.round(width / target));
    const ux = e1.clone().normalize();
    const vx = new THREE.Vector3().crossVectors(n, ux);
    const uvOf = (q: readonly number[]): [number, number] => {
      const r = new THREE.Vector3(q[0] - a[0], q[1] - a[1], q[2] - a[2]);
      if (uvMode === "wall") return [uOffset + r.dot(ux), q[1] - (this.baseY ?? 0)];
      return [uOffset + r.dot(ux), r.dot(vx)];
    };
    const order = [0, 1, 2, 0, 2, 3];
    for (const i of order) {
      const q = p[i];
      const [u, v] = uvOf(q);
      this.push(q[0], q[1], q[2], n.x, n.y, n.z, u, v, facade, bay);
    }
  }

  triangle(p: readonly (readonly number[])[], color: THREE.ColorRepresentation, facade: Facade = PLAIN, uvMode: "wall" | "flat" = "wall"): void {
    this.color.set(color);
    const [a, b, c] = p;
    const e1 = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const e2 = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
    const ux = e1.clone().normalize();
    const vx = new THREE.Vector3().crossVectors(n, ux);
    for (const q of p) {
      const r = new THREE.Vector3(q[0] - a[0], q[1] - a[1], q[2] - a[2]);
      const u = r.dot(ux);
      const v = uvMode === "wall" ? q[1] - (this.baseY ?? 0) : r.dot(vx);
      this.push(q[0], q[1], q[2], n.x, n.y, n.z, u, v, facade, facade.bay ?? 3);
    }
  }

  /** 建筑本地地坪高度：立面 v 坐标从这里起算，层线跨体块对齐。 */
  baseY = 0;

  /**
   * 轴对齐体块（本地坐标中心 x,z；底 y0）。sides 依次为 +z（正面）、+x、-z、-x 四面立面；top 为顶面。
   */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, color: THREE.ColorRepresentation,
    sides: Facade | null | readonly (Facade | null)[] = PLAIN, top: Facade | null = PLAIN, bottom = false, topColor?: THREE.ColorRepresentation): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
    const list: (Facade | null)[] = sides === null ? [null, null, null, null] : Array.isArray(sides) ? [...sides] as (Facade | null)[] : [sides as Facade, sides as Facade, sides as Facade, sides as Facade];
    if (list[0]) this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], color, list[0]);
    if (list[1]) this.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], color, list[1]);
    if (list[2]) this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], color, list[2]);
    if (list[3]) this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], color, list[3]);
    if (top) this.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], topColor ?? color, top, "flat");
    if (bottom) this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], color, PLAIN, "flat");
  }

  /** 双坡屋顶：屋脊沿本地 x（axis = "x"）或 z。山墙面用 gable 立面。 */
  gableRoof(cx: number, y0: number, cz: number, w: number, d: number, rise: number, overhang: number, roofColor: THREE.ColorRepresentation, wallColor: THREE.ColorRepresentation,
    roof: Facade, gable: Facade, axis: "x" | "z" = "x"): void {
    const o = overhang;
    if (axis === "x") {
      const x0 = cx - w / 2 - o, x1 = cx + w / 2 + o, z0 = cz - d / 2 - o, z1 = cz + d / 2 + o, ry = y0 + rise;
      const eave = y0 - o * rise / (d / 2);
      this.quad([[x0, eave, z1], [x1, eave, z1], [x1, ry, cz], [x0, ry, cz]], roofColor, roof, "flat");
      this.quad([[x1, eave, z0], [x0, eave, z0], [x0, ry, cz], [x1, ry, cz]], roofColor, roof, "flat");
      // 屋檐底面
      this.quad([[x0, eave, z0], [x1, eave, z0], [x1, eave, z1], [x0, eave, z1]], "#5a524a", PLAIN, "flat");
      const gx0 = cx - w / 2, gx1 = cx + w / 2;
      this.triangle([[gx1, y0, cz + d / 2], [gx1, y0, cz - d / 2], [gx1, ry, cz]], wallColor, gable);
      this.triangle([[gx0, y0, cz - d / 2], [gx0, y0, cz + d / 2], [gx0, ry, cz]], wallColor, gable);
    } else {
      const x0 = cx - w / 2 - o, x1 = cx + w / 2 + o, z0 = cz - d / 2 - o, z1 = cz + d / 2 + o, ry = y0 + rise;
      const eave = y0 - o * rise / (w / 2);
      this.quad([[x1, eave, z1], [x1, eave, z0], [cx, ry, z0], [cx, ry, z1]], roofColor, roof, "flat");
      this.quad([[x0, eave, z0], [x0, eave, z1], [cx, ry, z1], [cx, ry, z0]], roofColor, roof, "flat");
      this.quad([[x0, eave, z0], [x1, eave, z0], [x1, eave, z1], [x0, eave, z1]], "#5a524a", PLAIN, "flat");
      const gz0 = cz - d / 2, gz1 = cz + d / 2;
      this.triangle([[cx - w / 2, y0, gz1], [cx + w / 2, y0, gz1], [cx, ry, gz1]], wallColor, gable);
      this.triangle([[cx + w / 2, y0, gz0], [cx - w / 2, y0, gz0], [cx, ry, gz0]], wallColor, gable);
    }
  }

  /** 四坡屋顶（屋脊沿较长边；正方形时退化为四角攒尖）。 */
  hipRoof(cx: number, y0: number, cz: number, w: number, d: number, rise: number, overhang: number, roofColor: THREE.ColorRepresentation, roof: Facade): void {
    const x0 = cx - w / 2 - overhang, x1 = cx + w / 2 + overhang, z0 = cz - d / 2 - overhang, z1 = cz + d / 2 + overhang;
    const ww = x1 - x0, dd = z1 - z0;
    const ridge = Math.max(0, Math.abs(ww - dd) / 2);
    const ry = y0 + rise;
    const eave = y0 - overhang * 0.35;
    if (ww >= dd) {
      const r0 = cx - ridge, r1 = cx + ridge;
      this.quad([[x0, eave, z1], [x1, eave, z1], [r1, ry, cz], [r0, ry, cz]], roofColor, roof, "flat");
      this.quad([[x1, eave, z0], [x0, eave, z0], [r0, ry, cz], [r1, ry, cz]], roofColor, roof, "flat");
      this.triangle([[x1, eave, z1], [x1, eave, z0], [r1, ry, cz]], roofColor, roof, "flat");
      this.triangle([[x0, eave, z0], [x0, eave, z1], [r0, ry, cz]], roofColor, roof, "flat");
    } else {
      const r0 = cz - ridge, r1 = cz + ridge;
      this.quad([[x1, eave, z1], [x1, eave, z0], [cx, ry, r0], [cx, ry, r1]], roofColor, roof, "flat");
      this.quad([[x0, eave, z0], [x0, eave, z1], [cx, ry, r1], [cx, ry, r0]], roofColor, roof, "flat");
      this.triangle([[x0, eave, z1], [x1, eave, z1], [cx, ry, r1]], roofColor, roof, "flat");
      this.triangle([[x1, eave, z0], [x0, eave, z0], [cx, ry, r0]], roofColor, roof, "flat");
    }
    this.quad([[x0, eave, z0], [x1, eave, z0], [x1, eave, z1], [x0, eave, z1]], "#5a524a", PLAIN, "flat");
  }

  /** 单坡屋顶：高边在 -z。 */
  shedRoof(cx: number, y0: number, cz: number, w: number, d: number, rise: number, overhang: number, roofColor: THREE.ColorRepresentation, wallColor: THREE.ColorRepresentation, roof: Facade, wall: Facade): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const o = overhang;
    this.quad([[x0 - o, y0, z1 + o], [x1 + o, y0, z1 + o], [x1 + o, y0 + rise, z0 - o], [x0 - o, y0 + rise, z0 - o]], roofColor, roof, "flat");
    this.quad([[x0 - o, y0 - 0.02, z0 - o], [x1 + o, y0 - 0.02, z0 - o], [x1 + o, y0 - 0.02, z1 + o], [x0 - o, y0 - 0.02, z1 + o]], "#5a524a", PLAIN, "flat");
    this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y0 + rise * (d + o) / (d + 2 * o), z0], [x1, y0 + rise * (d + o) / (d + 2 * o), z0]], wallColor, wall);
    this.triangle([[x1, y0, z1], [x1, y0, z0], [x1, y0 + rise * (d + o) / (d + 2 * o), z0]], wallColor, wall);
    this.triangle([[x0, y0, z0], [x0, y0, z1], [x0, y0 + rise * (d + o) / (d + 2 * o), z0]], wallColor, wall);
  }

  /** 四棱锥（尖塔 / 攒尖）。 */
  pyramid(cx: number, y0: number, cz: number, w: number, d: number, h: number, color: THREE.ColorRepresentation, facade: Facade = PLAIN): void {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, apex = [cx, y0 + h, cz];
    this.triangle([[x0, y0, z1], [x1, y0, z1], apex], color, facade, "flat");
    this.triangle([[x1, y0, z1], [x1, y0, z0], apex], color, facade, "flat");
    this.triangle([[x1, y0, z0], [x0, y0, z0], apex], color, facade, "flat");
    this.triangle([[x0, y0, z0], [x0, y0, z1], apex], color, facade, "flat");
  }

  /** 竖直圆柱（可选锥顶）。 */
  cylinder(cx: number, y0: number, cz: number, radius: number, h: number, color: THREE.ColorRepresentation, segments = 10, facade: Facade = PLAIN, cap = true, topRadius = radius): void {
    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
      const p0 = [cx + Math.sin(a0) * radius, y0, cz + Math.cos(a0) * radius];
      const p1 = [cx + Math.sin(a1) * radius, y0, cz + Math.cos(a1) * radius];
      const p2 = [cx + Math.sin(a1) * topRadius, y0 + h, cz + Math.cos(a1) * topRadius];
      const p3 = [cx + Math.sin(a0) * topRadius, y0 + h, cz + Math.cos(a0) * topRadius];
      this.quad([p0, p1, p2, p3], color, facade, "wall", i * (2 * Math.PI * radius / segments));
      if (cap && topRadius > 0.001) this.triangle([p3, p2, [cx, y0 + h, cz]], color, PLAIN, "flat");
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute("fUv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute("fA", new THREE.Float32BufferAttribute(this.fa, 4));
    geometry.setAttribute("fB", new THREE.Float32BufferAttribute(this.fb, 4));
    geometry.setAttribute("fC", new THREE.Float32BufferAttribute(this.fc, 4));
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}
