import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildSplitCondenser } from "./roof-plant";

export function buildBalconyGlazingNodes(context: ArchitectureContext, width: number, depth: number, height = 1.08): void {
  const { aluminum, steel, rubber } = context.palette;
  const panelCount = Math.max(2, Math.ceil(width / 1.1));
  for (let node = 0; node <= panelCount; node++) {
    const x = -width / 2 + node * width / panelCount;
    context.box(aluminum, x, 0.12, depth, 0.045, 0.24, 0.08);
    context.box(rubber, x, 0.14, depth - 0.045, 0.035, 0.1, 0.006);
    for (const y of [0.08, 0.18]) context.beam(steel, [x, y, depth + 0.04], [x, y, depth + 0.05], 0.006);
    context.box(aluminum, x, 0.015, depth - 0.045, 0.13, 0.03, 0.16);
    for (const side of [-1, 1]) context.disc(steel, x + side * 0.04, 0.033, depth - 0.08, 0.006, 0.008);
  }
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, height, depth * 0.5, 0.04, 0.04, depth);
    context.box(aluminum, side * width / 2, height / 2, 0.02, 0.04, height, 0.04);
    context.box(steel, side * width / 2, height * 0.7, -0.01, 0.12, 0.07, 0.018);
    for (const y of [0.08, height * 0.7]) context.beam(steel, [side * width / 2, y, -0.02], [side * width / 2, y, 0.055], 0.006);
  }
}

export function buildBalconyDrain(context: ArchitectureContext, width: number): void {
  const { aluminum, dark, steel } = context.palette;
  context.box(dark, 0, 0.008, 0, width, 0.016, 0.09);
  context.box(aluminum, 0, 0.018, -0.042, width, 0.012, 0.008);
  context.box(aluminum, 0, 0.018, 0.042, width, 0.012, 0.008);
  const bars = Math.max(4, Math.ceil(width / 0.028));
  for (let bar = 0; bar < bars; bar++) context.box(aluminum, -width / 2 + (bar + 0.5) * width / bars, 0.019, 0, 0.01, 0.012, 0.075);
  context.disc(steel, width / 2 - 0.06, -0.055, 0, 0.025, 0.11);
}

export function buildBalconyDeck(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): void {
  const { oak, dark, steel } = context.palette;
  context.box(dark, 0, 0.025, depth / 2, width, 0.025, depth);
  const boards = Math.max(4, Math.ceil(width / 0.13));
  for (let board = 0; board < boards; board++) {
    const x = -width / 2 + (board + 0.5) * width / boards;
    context.box(materials.timber, x, 0.045, depth / 2, width / boards - 0.006, 0.025, depth - 0.02);
    for (const z of [0.1, depth - 0.1]) {
      for (const side of [-1, 1]) context.disc(steel, x + side * width / boards * 0.3, 0.059, z, 0.002, 0.002);
    }
  }
  context.box(oak, 0, 0.03, depth, width, 0.07, 0.025);
  buildBalconyDrain(context.at({ x: 0, y: 0.05, z: 0.065 }), width - 0.08);
}

function createFabricStrip(context: ArchitectureContext, width: number, height: number, phase: number): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const rows = 6;
  const columns = 4;
  for (let row = 0; row <= rows; row++) {
    const v = row / rows;
    for (let column = 0; column <= columns; column++) {
      const u = column / columns;
      const wrinkle = Math.sin(u * Math.PI * 4 + phase) * 0.012 * v + Math.sin(v * Math.PI * 3) * 0.014;
      const sag = Math.sin(u * Math.PI) * 0.012;
      positions.push((u - 0.5) * width, -v * height - sag, wrinkle);
      uv.push(u, v);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column;
      indices.push(a, a + columns + 2, a + 1, a, a + columns + 1, a + columns + 2);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return context.geometry(geometry);
}

export function buildHangingTowel(context: ArchitectureContext, width: number, height: number, phase: number, striped = false): Animation {
  const { fabric, white, oak } = context.palette;
  const segments = 4;
  const strips: THREE.Group[] = [];
  for (let strip = 0; strip < segments; strip++) {
    const x = -width / 2 + (strip + 0.5) * width / segments;
    const geometry = createFabricStrip(context, width / segments + 0.002, height, phase + strip * 0.5);
    strips.push(context.moving("Balcony drying towel", [x, 0, 0], moving => {
      moving.part(striped && strip % 2 === 0 ? white : fabric, geometry, [0, 0, 0]);
      moving.box(white, 0, -height + 0.035, 0.013, width / segments, 0.028, 0.004);
    }));
  }
  for (const side of [-1, 1]) context.box(oak, side * width * 0.4, 0.015, 0.007, 0.012, 0.055, 0.018, 0, side * 0.06);
  let angle = 0;
  let velocity = 0;
  let previous = 0;
  return (seconds, _night, season) => {
    const delta = Math.max(0, Math.min(0.1, seconds - previous));
    previous = seconds;
    const gust = Math.sin(seconds * 0.85 + phase) * 0.15 + Math.sin(seconds * 1.7 + phase * 0.3) * 0.055;
    velocity += (gust - angle * 3.4 - velocity * 1.7) * delta;
    angle += velocity * delta;
    strips.forEach((strip, index) => {
      strip.visible = season !== "winter";
      strip.rotation.x = angle + Math.sin(seconds * 1.1 + index * 0.7 + phase) * 0.018;
      strip.rotation.z = Math.sin(seconds * 0.7 + phase + index * 0.2) * 0.009;
    });
  };
}

export function buildHangingShirt(context: ArchitectureContext, phase: number, color: THREE.Material): Animation {
  const { steel, oak, white } = context.palette;
  context.tube(steel, [[0, 0.04, 0], [0.025, 0.07, 0], [0.025, 0.1, 0], [0, 0.115, 0], [-0.02, 0.09, 0]], 0.003);
  context.beam(oak, [0, 0.04, 0], [-0.16, -0.03, 0], 0.009);
  context.beam(oak, [0, 0.04, 0], [0.16, -0.03, 0], 0.009);
  context.beam(oak, [-0.16, -0.03, 0], [0.16, -0.03, 0], 0.005);
  const shirt = context.moving("Balcony drying shirt", [0, -0.015, 0], moving => {
    const torso = createFabricStrip(moving, 0.3, 0.43, phase);
    moving.part(color, torso, [0, 0, 0]);
    moving.box(color, -0.19, -0.055, 0, 0.14, 0.14, 0.018, 0, -0.35);
    moving.box(color, 0.19, -0.055, 0, 0.14, 0.14, 0.018, 0, 0.35);
    moving.box(white, 0, -0.02, 0.01, 0.075, 0.025, 0.004);
    for (let button = 0; button < 4; button++) moving.box(white, 0, -0.1 - button * 0.07, 0.014, 0.005, 0.005, 0.003);
  });
  let sway = 0;
  let previous = 0;
  return (seconds, _night, season) => {
    const delta = Math.max(0, Math.min(0.15, seconds - previous));
    previous = seconds;
    const target = Math.sin(seconds * 0.78 + phase) * 0.1 + Math.sin(seconds * 1.4 + phase) * 0.025;
    sway += (target - sway) * (1 - Math.exp(-delta * 2.5));
    shirt.rotation.x = sway;
    shirt.rotation.z = Math.sin(seconds * 0.4 + phase) * 0.025;
    shirt.visible = season !== "winter";
  };
}

export function buildClothesAirer(context: ArchitectureContext, width: number, phase: number): Animation[] {
  const { aluminum, steel, white, red } = context.palette;
  const height = 1.1;
  const depth = 0.44;
  for (const side of [-1, 1]) {
    context.beam(aluminum, [side * width * 0.38, 0.03, -depth / 2], [side * width * 0.24, height, depth / 2], 0.012);
    context.beam(aluminum, [side * width * 0.38, 0.03, depth / 2], [side * width * 0.24, height, -depth / 2], 0.012);
    context.beam(steel, [side * width * 0.32, height * 0.5, -0.01], [side * width * 0.32, height * 0.5, 0.01], 0.02);
    context.beam(aluminum, [-width / 2, height, side * depth / 2], [width / 2, height, side * depth / 2], 0.01);
  }
  for (let line = 0; line < 5; line++) {
    const z = -depth / 2 + line * depth / 4;
    context.beam(aluminum, [-width / 2, height, z], [width / 2, height, z], 0.004);
  }
  const animations: Animation[] = [];
  animations.push(buildHangingTowel(context.at({ x: -width * 0.24, y: height, z: -0.1 }), width * 0.35, 0.65, phase, true));
  animations.push(buildHangingShirt(context.at({ x: width * 0.2, y: height - 0.06, z: 0.1 }), phase + 1, white));
  if (width > 1.2) animations.push(buildHangingShirt(context.at({ x: -width * 0.25, y: height - 0.06, z: 0.2 }), phase + 2, red));
  return animations;
}

export function buildFoldingBalconyChair(context: ArchitectureContext): void {
  const { oak, steel, fabric } = context.palette;
  context.box(fabric, 0, 0.44, 0.03, 0.39, 0.025, 0.35);
  context.panel(fabric, [[-0.195, 0.48, -0.16], [0.195, 0.48, -0.16], [0.195, 0.86, -0.25], [-0.195, 0.86, -0.25]]);
  for (const side of [-1, 1]) {
    context.rectangularBeam(oak, [side * 0.22, 0.02, -0.22], [side * 0.22, 0.58, 0.21], 0.025, 0.035);
    context.rectangularBeam(oak, [side * 0.22, 0.02, 0.24], [side * 0.22, 0.87, -0.25], 0.025, 0.035);
    context.beam(steel, [side * 0.2, 0.38, 0.02], [side * 0.24, 0.38, 0.02], 0.012);
  }
  context.box(oak, 0, 0.86, -0.25, 0.46, 0.035, 0.035);
}

export function buildFoldDownBalconyTable(context: ArchitectureContext, width: number): void {
  const { oak, steel, aluminum } = context.palette;
  context.roundedBox(oak, 0, 0.72, 0.22, width, 0.035, 0.43, 0.05);
  for (const side of [-1, 1]) {
    context.box(steel, side * width * 0.3, 0.55, 0.02, 0.025, 0.34, 0.025);
    context.beam(steel, [side * width * 0.3, 0.42, 0.02], [side * width * 0.3, 0.7, 0.34], 0.01);
    context.box(aluminum, side * width * 0.3, 0.69, 0.01, 0.07, 0.06, 0.02);
  }
  context.disc(context.palette.porcelain, -width * 0.18, 0.77, 0.22, 0.04, 0.07);
  context.disc(context.palette.dark, -width * 0.18, 0.807, 0.22, 0.034, 0.003);
}

export function buildBalconyPlanterBrackets(context: ArchitectureContext, width: number): void {
  const { steel, oak, dark, green, clay } = context.palette;
  context.box(oak, 0, 0.88, 0.12, width, 0.25, 0.24);
  context.box(dark, 0, 1.015, 0.12, width - 0.04, 0.015, 0.2);
  for (const side of [-1, 1]) {
    context.tube(steel, [[side * width * 0.35, 0.74, 0.21], [side * width * 0.35, 0.74, -0.04], [side * width * 0.35, 1.12, -0.04], [side * width * 0.35, 1.12, 0.02]], 0.008);
  }
  const blooms = Math.max(4, Math.round(width / 0.15));
  for (let bloom = 0; bloom < blooms; bloom++) {
    const x = -width * 0.4 + bloom * width * 0.8 / Math.max(1, blooms - 1);
    const y = 1.12 + bloom % 3 * 0.045;
    context.beam(green, [x, 1.01, 0.12], [x, y, 0.12], 0.004);
    context.oval(green, x - 0.025, y - 0.055, 0.12, 0.035, 0.01, 0.02);
    context.oval(green, x + 0.025, y - 0.035, 0.12, 0.035, 0.01, 0.02);
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      context.oval(clay, x + Math.cos(angle) * 0.016, y, 0.12 + Math.sin(angle) * 0.016, 0.013, 0.006, 0.013);
    }
  }
}

export function buildAirConditionerCondensate(context: ArchitectureContext, phase: number): Animation[] {
  const { white, steel, rubber, water } = context.palette;
  const animations: Animation[] = [buildSplitCondenser(context)];
  context.tube(rubber, [[0.44, 0.35, -0.1], [0.55, 0.35, -0.15], [0.55, 0.1, -0.15], [0.55, 0.1, -0.3]], 0.018);
  context.tube(white, [[0.3, 0.1, 0], [0.4, 0.08, 0.03], [0.4, -0.3, 0.03], [0.46, -0.3, 0.1]], 0.012);
  for (const y of [0.15, -0.16]) context.box(steel, 0.4, y, 0.03, 0.035, 0.018, 0.035);
  const drops: THREE.Group[] = [];
  for (let drop = 0; drop < 3; drop++) drops.push(context.moving("Air conditioner condensation drop", [0.46, -0.3, 0.1], moving => moving.oval(water, 0, 0, 0, 0.006, 0.009, 0.006)));
  const bases = drops.map(drop => drop.position.clone());
  animations.push((seconds, night, season) => {
    const active = season === "summer" && !night;
    drops.forEach((drop, index) => {
      const elapsed = THREE.MathUtils.euclideanModulo(seconds + phase + index * 0.37, 1.1);
      const fall = 4.903325 * elapsed * elapsed;
      drop.visible = active && fall < 0.36;
      drop.position.copy(bases[index]);
      drop.position.y -= fall;
      drop.scale.y = 1 + Math.min(0.8, elapsed * 2);
    });
  });
  return animations;
}

export function buildBalconyLife(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, phase: number, detailed: boolean): Animation[] {
  const animations: Animation[] = [];
  buildBalconyDeck(context, materials, width - 0.08, depth - 0.02);
  buildBalconyGlazingNodes(context, width, depth);
  if (phase % 3 === 0) animations.push(...buildClothesAirer(context.at({ x: -width * 0.22, y: 0.065, z: depth * 0.52 }), Math.min(1.25, width * 0.44), phase));
  else {
    buildFoldingBalconyChair(context.at({ x: -width * 0.27, y: 0.06, z: depth * 0.55, yaw: Math.PI / 2 }));
    buildFoldDownBalconyTable(context.at({ x: -width * 0.27, y: 0.06, z: depth - 0.05, yaw: Math.PI }), Math.min(0.65, width * 0.3));
  }
  buildBalconyPlanterBrackets(context.at({ x: width * 0.22, y: 0, z: depth + 0.02 }), Math.min(0.9, width * 0.3));
  if (detailed && width > 3.8) animations.push(...buildAirConditionerCondensate(context.at({ x: width / 2 - 0.47, y: 0.72, z: depth * 0.35, yaw: -Math.PI / 2 }), phase));
  return animations;
}
