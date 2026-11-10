import * as THREE from "three";
import type { Frame } from "./builder";

export type SignStyle = { text: string; sub?: string; bg: string; fg: string; font?: "sans" | "serif" | "script" };

const COLS = 4, ROWS = 16, CELL_W = 512, CELL_H = 128;

/** 招牌图集：每块招牌占 512×128 一格，白天为贴图，夜间同一贴图作自发光。 */
export class SignAtlas {
  readonly styles: SignStyle[] = [];
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];

  add(style: SignStyle): number {
    const existing = this.styles.findIndex((s) => s.text === style.text && s.bg === style.bg && s.sub === style.sub);
    if (existing >= 0) return existing;
    if (this.styles.length >= COLS * ROWS) return this.styles.length - 1;
    this.styles.push(style);
    return this.styles.length - 1;
  }

  /** 竖直招牌面（本地坐标中心，朝本地 +z），宽 w 高 h；frame 为所在建筑坐标系。 */
  place(frame: Frame, index: number, cx: number, cy: number, cz: number, w: number, h: number, facing = 0): void {
    const col = index % COLS, row = Math.floor(index / COLS);
    const u0 = col / COLS, u1 = (col + 1) / COLS;
    const v1 = 1 - row / ROWS, v0 = 1 - (row + 1) / ROWS;
    const c = Math.cos(frame.yaw + facing), s = Math.sin(frame.yaw + facing);
    const fc = Math.cos(frame.yaw), fs = Math.sin(frame.yaw);
    const wx = frame.x + cx * fc + cz * fs, wz = frame.z - cx * fs + cz * fc, wy = frame.y + cy;
    const corner = (dx: number, dy: number) => [wx + dx * c, wy + dy, wz - dx * s];
    const p = [corner(-w / 2, -h / 2), corner(w / 2, -h / 2), corner(w / 2, h / 2), corner(-w / 2, h / 2)];
    const uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.positions.push(...p[i]);
      this.normals.push(s, 0, c);
      this.uvs.push(...uv[i]);
    }
  }

  draw(context: CanvasRenderingContext2D): void {
    this.styles.forEach((style, index) => {
      const x = (index % COLS) * CELL_W, y = Math.floor(index / COLS) * CELL_H;
      context.fillStyle = style.bg;
      context.fillRect(x, y, CELL_W, CELL_H);
      context.strokeStyle = "rgba(255,255,255,0.25)";
      context.lineWidth = 4;
      context.strokeRect(x + 6, y + 6, CELL_W - 12, CELL_H - 12);
      context.fillStyle = style.fg;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const family = style.font === "serif" ? "Georgia, 'Noto Serif SC', serif" : style.font === "script" ? "'Brush Script MT', cursive" : "'Helvetica Neue', Arial, 'Noto Sans SC', 'PingFang SC', sans-serif";
      const size = style.sub ? 52 : 64;
      context.font = `700 ${size}px ${family}`;
      const metrics = context.measureText(style.text);
      const scale = Math.min(1, (CELL_W - 48) / Math.max(metrics.width, 1));
      context.save();
      context.translate(x + CELL_W / 2, y + (style.sub ? CELL_H * 0.4 : CELL_H / 2));
      context.scale(scale, 1);
      context.fillText(style.text, 0, 0);
      context.restore();
      if (style.sub) {
        context.font = `500 26px ${family}`;
        context.fillText(style.sub, x + CELL_W / 2, y + CELL_H * 0.8);
      }
    });
  }

  build(texture: THREE.Texture | null): { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial } | null {
    if (!this.positions.length) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    const material = new THREE.MeshStandardMaterial({ name: "v3 signage", map: texture, emissiveMap: texture, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0.05, roughness: 0.45, metalness: 0.1 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "v3 district · signage";
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    return { mesh, material };
  }

  static readonly size = { width: COLS * CELL_W, height: ROWS * CELL_H };
}
