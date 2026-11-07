import * as THREE from "three";
import type { CivicKit } from "../../city-civic";

type AtlasPage = {
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  material: THREE.MeshStandardMaterial;
  used: number;
};

export type LabelTile = {
  material: THREE.MeshStandardMaterial;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
};

export class ArchitectureLabelAtlas {
  private readonly pages: AtlasPage[] = [];
  private readonly tiles = new Map<string, LabelTile>();
  private readonly size = 2048;
  private readonly tileWidth = 512;
  private readonly tileHeight = 128;
  private readonly columns = 4;
  private readonly rows = 16;

  constructor(private readonly kit: CivicKit) {}

  private page(): AtlasPage {
    const current = this.pages[this.pages.length - 1];
    if (current && current.used < this.columns * this.rows) return current;
    let canvasContext: CanvasRenderingContext2D | undefined;
    const texture = this.kit.canvasTexture(this.size, this.size, context => {
      canvasContext = context;
      context.fillStyle = "#283d36";
      context.fillRect(0, 0, this.size, this.size);
    });
    if (!canvasContext) throw new Error("建筑标识纹理画布不可用");
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.63, metalness: 0 });
    material.name = `Architectural label atlas ${this.pages.length + 1}`;
    this.kit.materials.add(material);
    const page = { context: canvasContext, texture, material, used: 0 };
    this.pages.push(page);
    return page;
  }

  label(text: string, foreground: string, background: string): LabelTile {
    const key = `${foreground}\u0000${background}\u0000${text}`;
    const cached = this.tiles.get(key);
    if (cached) return cached;
    const page = this.page();
    const column = page.used % this.columns;
    const row = Math.floor(page.used / this.columns);
    page.used++;
    const x = column * this.tileWidth;
    const y = row * this.tileHeight;
    const context = page.context;
    context.save();
    context.beginPath();
    context.rect(x, y, this.tileWidth, this.tileHeight);
    context.clip();
    context.fillStyle = background;
    context.fillRect(x, y, this.tileWidth, this.tileHeight);
    context.fillStyle = foreground;
    context.textAlign = "center";
    context.textBaseline = "middle";
    const preferredSize = text.length < 5 ? 66 : text.length < 14 ? 50 : 44;
    context.font = `500 ${preferredSize}px sans-serif`;
    context.fillText(text, x + this.tileWidth / 2, y + this.tileHeight * 0.52, this.tileWidth - 44);
    context.restore();
    page.texture.needsUpdate = true;
    const inset = 2;
    const tile = {
      material: page.material,
      u0: (x + inset) / this.size,
      v0: 1 - (y + this.tileHeight - inset) / this.size,
      u1: (x + this.tileWidth - inset) / this.size,
      v1: 1 - (y + inset) / this.size,
    };
    this.tiles.set(key, tile);
    return tile;
  }

  geometry(width: number, height: number, tile: LabelTile): THREE.PlaneGeometry {
    const geometry = new THREE.PlaneGeometry(width, height);
    const uv = geometry.getAttribute("uv");
    for (let vertex = 0; vertex < uv.count; vertex++) {
      const u = uv.getX(vertex);
      const v = uv.getY(vertex);
      uv.setXY(vertex, THREE.MathUtils.lerp(tile.u0, tile.u1, u), THREE.MathUtils.lerp(tile.v0, tile.v1, v));
    }
    return geometry;
  }
}
