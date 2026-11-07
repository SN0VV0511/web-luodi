import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildCoffeeCup, buildDiningChair, buildCafeTable, buildBookshelf, buildTaskChair } from "./furniture";
import { buildCoffeeMachine, buildSink } from "./kitchens";
import { buildTrackLighting, buildPendantLight } from "./lighting";

export function buildCheckout(context: ArchitectureContext, materials: ArchitecturalMaterials, width = 1.6): void {
  const { oak, dark, aluminum, screen, white } = context.palette;
  context.box(oak, 0, 0.47, 0, width, 0.92, 0.65);
  context.roundedBox(materials.terrazzo, 0, 0.95, 0, width + 0.05, 0.055, 0.71, 0.035);
  context.box(dark, width * 0.23, 1.1, -0.08, 0.025, 0.3, 0.025);
  context.box(dark, width * 0.23, 1.27, -0.04, 0.28, 0.2, 0.035);
  context.box(screen, width * 0.23, 1.27, -0.016, 0.245, 0.165, 0.008);
  context.box(aluminum, width * 0.23, 0.99, -0.05, 0.2, 0.02, 0.18);
  context.box(dark, width * 0.34, 1.015, 0.2, 0.11, 0.06, 0.16);
  context.box(screen, width * 0.34, 1.048, 0.19, 0.065, 0.006, 0.07);
  context.box(white, -width * 0.23, 1.02, -0.05, 0.17, 0.1, 0.2);
  context.box(dark, -width * 0.23, 1.07, -0.01, 0.11, 0.008, 0.025);
}

export function buildBakeryCase(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number): void {
  const { oak, aluminum, glass, porcelain, warmLight } = context.palette;
  const crust = context.material({ color: "#b9773b", roughness: 0.83 });
  const crumb = context.material({ color: "#dfb874", roughness: 0.91 });
  context.box(oak, 0, 0.38, 0, width, 0.76, 0.7);
  context.box(materials.terrazzo, 0, 0.79, 0, width + 0.045, 0.055, 0.75);
  context.panel(glass, [[-width / 2, 0.82, 0.36], [width / 2, 0.82, 0.36], [width / 2, 1.4, 0.21], [-width / 2, 1.4, 0.21]]);
  context.box(glass, 0, 1.42, -0.03, width, 0.025, 0.5);
  for (const side of [-1, 1]) {
    context.panel(glass, [[side * width / 2, 0.82, -0.28], [side * width / 2, 0.82, 0.36], [side * width / 2, 1.4, 0.21], [side * width / 2, 1.4, -0.28]]);
    context.beam(aluminum, [side * width / 2, 0.82, 0.36], [side * width / 2, 1.42, 0.21], 0.012);
  }
  context.box(aluminum, 0, 1.05, -0.03, width - 0.06, 0.018, 0.55);
  context.box(warmLight, 0, 1.4, -0.22, width - 0.12, 0.015, 0.025);
  const trays = Math.max(2, Math.floor(width / 0.4));
  for (let tray = 0; tray < trays; tray++) {
    const x = -width / 2 + (tray + 0.5) * width / trays;
    context.box(porcelain, x, 0.83, 0.02, width / trays - 0.04, 0.018, 0.48);
    for (let row = 0; row < 3; row++) {
      const z = -0.14 + row * 0.15;
      context.oval(tray % 2 ? crust : crumb, x, 0.89, z, 0.09, 0.055, 0.055);
      for (let score = -1; score <= 1; score++) context.box(crumb, x + score * 0.035, 0.943, z, 0.007, 0.003, 0.06, 0.25);
    }
    context.box(porcelain, x, 1.065, 0.05, width / trays - 0.04, 0.015, 0.4);
    context.oval(crust, x, 1.13, 0.05, 0.11, 0.06, 0.14);
  }
}

export function buildCoffeeBar(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number): Animation[] {
  const { oak, aluminum, porcelain } = context.palette;
  const animations: Animation[] = [];
  context.box(oak, 0, 0.5, 0, width, 1, 0.75);
  context.box(materials.terrazzo, 0, 1.02, 0, width + 0.05, 0.04, 0.8);
  for (let slat = 0; slat < Math.ceil(width / 0.12); slat++) context.box(oak, -width / 2 + 0.06 + slat * 0.12, 0.5, 0.39, 0.035, 0.92, 0.04);
  animations.push(buildCoffeeMachine(context.at({ x: -width * 0.18, y: 1.04, z: -0.08 }), true));
  buildSink(context.at({ x: width * 0.3, y: 1.04, z: -0.08 }), 0.45, 0.35);
  for (let cup = 0; cup < 5; cup++) {
    const x = -width * 0.38 + cup * 0.11;
    context.disc(porcelain, x, 1.1, 0.22, 0.035, 0.09);
    context.disc(aluminum, x, 1.153, 0.22, 0.037, 0.012);
  }
  buildTrackLighting(context.at({ x: 0, y: 2.8, z: 0 }), width * 0.85, 4);
  return animations;
}

export function buildRetailShelving(context: ArchitectureContext, width: number, height: number, depth: number, category: "grocery" | "pharmacy" | "technology"): void {
  const { white, aluminum, steel, green, red, yellow, dark } = context.palette;
  context.box(white, 0, height / 2, -depth / 2, width, height, 0.035);
  for (const side of [-1, 1]) context.box(steel, side * width / 2, height / 2, -depth / 2, 0.035, height, 0.06);
  const shelfCount = Math.max(3, Math.floor(height / 0.36));
  const spacing = height / shelfCount;
  const productCount = Math.max(3, Math.floor(width / 0.15));
  for (let shelf = 0; shelf < shelfCount; shelf++) {
    const y = 0.08 + shelf * spacing;
    context.box(aluminum, 0, y, 0, width + 0.03, 0.025, depth);
    context.box(white, 0, y - 0.02, depth / 2, width, 0.045, 0.02);
    for (let product = 0; product < productCount; product++) {
      const x = -width / 2 + (product + 0.5) * width / productCount;
      const material = [green, red, yellow, white][(shelf + product) % 4];
      if (category === "grocery") {
        context.disc(material, x, y + 0.11, 0.02, 0.045, 0.19);
        context.disc(aluminum, x, y + 0.212, 0.02, 0.045, 0.015);
        context.box(white, x, y + 0.11, depth * 0.21, 0.055, 0.09, 0.006);
      } else if (category === "pharmacy") {
        context.box(white, x, y + 0.12, 0, 0.09, 0.21, 0.1);
        context.box(material, x, y + 0.08, 0.057, 0.09, 0.055, 0.008);
        context.box(dark, x, y + 0.17, 0.057, 0.05, 0.008, 0.008);
      } else {
        context.roundedBox(dark, x, y + 0.1, 0.02, 0.09, 0.16, 0.012, 0.01);
        context.box(context.palette.screen, x, y + 0.1, 0.032, 0.07, 0.125, 0.004);
        context.box(white, x, y + 0.016, 0.07, 0.1, 0.018, 0.11);
      }
    }
  }
}

export function buildChilledDisplay(context: ArchitectureContext, width: number): void {
  const { white, steel, aluminum, glass, warmLight, green, yellow } = context.palette;
  const height = 1.95;
  context.box(white, 0, height / 2, -0.1, width, height, 0.72);
  context.box(steel, 0, 1.05, 0.27, width - 0.1, 1.58, 0.045);
  context.box(glass, 0, 1.04, 0.31, width - 0.08, 1.57, 0.025);
  context.box(aluminum, 0, 1.04, 0.34, 0.025, 1.55, 0.045);
  for (const side of [-1, 1]) context.box(aluminum, side * width * 0.1, 1.05, 0.38, 0.015, 0.38, 0.03);
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = 0.35 + shelf * 0.37;
    context.box(aluminum, 0, y, 0.08, width - 0.1, 0.02, 0.37);
    for (let bottle = 0; bottle < Math.floor(width / 0.11); bottle++) {
      const x = -width / 2 + 0.08 + bottle * 0.11;
      context.disc(bottle % 3 ? green : yellow, x, y + 0.115, 0.14, 0.033, 0.2);
      context.disc(white, x, y + 0.225, 0.14, 0.018, 0.025);
    }
  }
  context.box(warmLight, 0, 1.84, 0.3, width - 0.15, 0.018, 0.025);
  for (let grille = 0; grille < 9; grille++) context.box(steel, -width * 0.42 + grille * width * 0.105, 0.12, 0.27, 0.012, 0.1, 0.02);
}

export function buildProduceBin(context: ArchitectureContext, width: number, variety: number): void {
  const { oak, green, red, yellow } = context.palette;
  context.box(oak, 0, 0.46, 0, width, 0.84, 0.65);
  context.box(context.palette.dark, 0, 0.9, 0, width - 0.06, 0.08, 0.58);
  for (const side of [-1, 1]) context.box(oak, side * width / 2, 0.98, 0, 0.035, 0.18, 0.68);
  context.box(oak, 0, 0.96, 0.32, width, 0.14, 0.04);
  const columns = Math.max(3, Math.floor(width / 0.1));
  for (let column = 0; column < columns; column++) {
    for (let row = 0; row < 4; row++) {
      const x = -width / 2 + (column + 0.5) * width / columns;
      const z = -0.21 + row * 0.14;
      const produce = variety % 3 === 0 ? red : variety % 3 === 1 ? yellow : green;
      context.oval(produce, x, 0.98 + (column % 2) * 0.025, z, 0.043, 0.045, 0.043);
      context.box(oak, x, 1.028 + (column % 2) * 0.025, z, 0.004, 0.012, 0.004);
    }
  }
}

export function buildBreadRack(context: ArchitectureContext, width: number): void {
  const { oak, limestone, yellow } = context.palette;
  for (const side of [-1, 1]) context.box(oak, side * width / 2, 0.95, 0, 0.055, 1.9, 0.35);
  const loaves = Math.max(3, Math.floor(width / 0.3));
  for (let row = 0; row < 4; row++) {
    const shelfY = 0.18 + row * 0.43;
    context.box(oak, 0, shelfY, 0, width, 0.035, 0.36);
    for (let loaf = 0; loaf < loaves; loaf++) {
      const x = -width / 2 + (loaf + 0.5) * width / loaves;
      context.oval(yellow, x, shelfY + 0.09, 0, 0.1, 0.075, 0.14);
      for (let score = 0; score < 3; score++) context.box(limestone, x - 0.055 + score * 0.055, shelfY + 0.16, 0, 0.007, 0.003, 0.11, 0.18);
    }
  }
}

export function buildBakeryInterior(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  const animations: Animation[] = [];
  buildBakeryCase(context.at({ x: -width * 0.2, y: 0, z: -depth * 0.15 }), materials, width * 0.5);
  buildCheckout(context.at({ x: width * 0.3, y: 0, z: -depth * 0.15 }), materials, width * 0.3);
  buildBreadRack(context.at({ x: -width * 0.2, y: 0, z: -depth / 2 + 0.2 }), width * 0.7);
  for (const x of [-width * 0.3, width * 0.3]) {
    buildCafeTable(context.at({ x, y: 0, z: depth * 0.25 }), 0.38);
    buildDiningChair(context.at({ x: x - 0.58, y: 0, z: depth * 0.25, yaw: Math.PI / 2 }), materials);
    buildDiningChair(context.at({ x: x + 0.58, y: 0, z: depth * 0.25, yaw: -Math.PI / 2 }), materials);
    buildCoffeeCup(context.at({ x: x + 0.13, y: 0.78, z: depth * 0.25 }));
    buildPendantLight(context.at({ x, y: 2.9, z: depth * 0.25 }), 0.72, 0.2);
  }
  buildTrackLighting(context.at({ x: 0, y: 2.9, z: -depth * 0.12 }), width * 0.8, 4);
  return animations;
}

export function buildGroceryInterior(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  buildChilledDisplay(context.at({ x: -width * 0.24, y: 0, z: -depth / 2 + 0.42 }), width * 0.42);
  buildRetailShelving(context.at({ x: width * 0.25, y: 0, z: -depth / 2 + 0.25 }), width * 0.43, 1.9, 0.4, "grocery");
  buildCheckout(context.at({ x: width * 0.3, y: 0, z: depth * 0.25 }), materials, Math.min(1.6, width * 0.4));
  for (let bin = 0; bin < 3; bin++) buildProduceBin(context.at({ x: -width * 0.24, y: 0, z: -depth * 0.12 + bin * 0.95 }), Math.min(1.3, width * 0.37), bin);
  for (const x of [-width * 0.25, width * 0.25]) buildTrackLighting(context.at({ x, y: 2.9, z: 0, yaw: Math.PI / 2 }), depth * 0.8, 3);
  return [];
}

export function buildPharmacyInterior(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): Animation[] {
  buildRetailShelving(context.at({ x: 0, y: 0, z: -depth / 2 + 0.22 }), width - 0.25, 2.15, 0.35, "pharmacy");
  buildCheckout(context.at({ x: 0, y: 0, z: -depth * 0.14 }), materials, width * 0.75);
  for (const side of [-1, 1]) buildRetailShelving(context.at({ x: side * (width / 2 - 0.23), y: 0, z: depth * 0.18, yaw: -side * Math.PI / 2 }), depth * 0.55, 1.45, 0.35, "pharmacy");
  buildTaskChair(context.at({ x: 0, y: 0, z: -depth * 0.3 }), materials);
  buildTrackLighting(context.at({ x: 0, y: 2.95, z: depth * 0.2 }), width * 0.8, 4);
  return [];
}
