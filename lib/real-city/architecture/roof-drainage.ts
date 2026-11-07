import * as THREE from "three";
import { ArchitectureContext } from "./context";
import type { ArchitecturalMaterials } from "./materials";

export function buildHalfRoundGutter(context: ArchitectureContext, length: number, radius = 0.075, fall = 0.002): void {
  const { aluminum, steel } = context.palette;
  const positions: number[] = [];
  const normals: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const segments = 12;
  for (let end = 0; end < 2; end++) {
    const x = end === 0 ? -length / 2 : length / 2;
    const lowered = -end * length * fall;
    for (let arc = 0; arc <= segments; arc++) {
      const angle = Math.PI + arc / segments * Math.PI;
      const y = Math.sin(angle) * radius + lowered;
      const z = Math.cos(angle) * radius;
      positions.push(x, y, z);
      normals.push(0, -Math.sin(angle), -Math.cos(angle));
      uv.push(end * length, arc / segments);
    }
  }
  for (let arc = 0; arc < segments; arc++) {
    indices.push(arc, arc + segments + 2, arc + segments + 1, arc, arc + 1, arc + segments + 2);
  }
  const geometry = context.geometry(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  context.part(aluminum, geometry, [0, 0, 0]);
  for (const side of [-1, 1]) context.beam(aluminum, [-length / 2, 0, side * radius], [length / 2, -length * fall, side * radius], 0.006);
  const brackets = Math.max(2, Math.ceil(length / 0.65));
  for (let bracket = 0; bracket <= brackets; bracket++) {
    const x = -length / 2 + bracket * length / brackets;
    const y = -(x + length / 2) * fall;
    context.tube(steel, [[x, y + 0.06, -radius - 0.035], [x, y, -radius - 0.005], [x, y - radius - 0.009, 0], [x, y, radius + 0.005]], 0.005);
    context.box(steel, x, y + 0.045, -radius - 0.04, 0.035, 0.12, 0.018);
  }
  if (length > 3.5) {
    const joins = Math.floor(length / 3);
    for (let join = 1; join <= joins; join++) {
      const x = -length / 2 + join * length / (joins + 1);
      const y = -(x + length / 2) * fall;
      context.tube(steel, [[x, y, -radius], [x, y - radius, 0], [x, y, radius]], 0.009);
    }
  }
}

export function buildGutterEndCap(context: ArchitectureContext, radius: number): void {
  const { aluminum } = context.palette;
  const geometry = new THREE.CircleGeometry(radius, 16, Math.PI, Math.PI);
  geometry.rotateY(Math.PI / 2);
  context.part(aluminum, context.geometry(geometry), [0, 0, 0]);
  context.box(aluminum, 0, 0, 0, 0.008, 0.012, radius * 2);
}

export function buildRainwaterHopper(context: ArchitectureContext, width: number, depth: number): void {
  const { aluminum, dark } = context.palette;
  const top = 0.16;
  const bottom = -0.12;
  const outlet = 0.045;
  context.panel(aluminum, [[-width / 2, top, depth / 2], [width / 2, top, depth / 2], [outlet, bottom, outlet], [-outlet, bottom, outlet]]);
  context.panel(aluminum, [[width / 2, top, -depth / 2], [-width / 2, top, -depth / 2], [-outlet, bottom, -outlet], [outlet, bottom, -outlet]]);
  context.panel(aluminum, [[width / 2, top, depth / 2], [width / 2, top, -depth / 2], [outlet, bottom, -outlet], [outlet, bottom, outlet]]);
  context.panel(aluminum, [[-width / 2, top, -depth / 2], [-width / 2, top, depth / 2], [-outlet, bottom, outlet], [-outlet, bottom, -outlet]]);
  context.box(dark, 0, bottom + 0.008, 0, outlet * 1.7, 0.016, outlet * 1.7);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, top, 0, 0.015, 0.025, depth);
    context.box(aluminum, 0, top, side * depth / 2, width, 0.025, 0.015);
  }
  context.disc(aluminum, 0, bottom - 0.075, 0, outlet, 0.15);
}

export function buildDetailedDownpipe(context: ArchitectureContext, height: number, radius = 0.045, offset = 0.16): void {
  const { aluminum, steel, rubber } = context.palette;
  context.disc(aluminum, 0, height / 2, offset, radius, height);
  const joints = Math.max(1, Math.floor(height / 2.8));
  for (let joint = 0; joint <= joints; joint++) {
    const y = 0.12 + joint * (height - 0.24) / joints;
    context.disc(aluminum, 0, y, offset, radius + 0.006, 0.06);
    context.disc(rubber, 0, y + 0.026, offset, radius + 0.007, 0.008);
    context.box(steel, 0, y, offset / 2, 0.025, 0.04, offset);
    context.box(steel, 0, y, 0.006, 0.12, 0.09, 0.012);
    for (const side of [-1, 1]) context.beam(aluminum, [side * 0.04, y, 0.012], [side * 0.04, y, 0.024], 0.004);
  }
  context.tube(aluminum, [[0, height, offset], [0, height + 0.12, offset + 0.02], [0, height + 0.25, offset + 0.12]], radius);
  context.tube(aluminum, [[0, 0.08, offset], [0, 0.02, offset + 0.04], [0, 0.01, offset + 0.2]], radius);
  context.beam(rubber, [0, 0.01, offset + 0.195], [0, 0.01, offset + 0.205], radius * 0.8);
  context.beam(aluminum, [0, 0.36, offset], [0, 0.36, offset + radius + 0.012], radius * 0.6);
  context.beam(steel, [0, 0.36, offset + radius + 0.013], [0, 0.36, offset + radius + 0.025], radius * 0.72);
}

export function buildLeafGuard(context: ArchitectureContext, radius: number): void {
  const { steel } = context.palette;
  for (let spoke = 0; spoke < 10; spoke++) {
    const angle = spoke * Math.PI / 5;
    const x = Math.cos(angle);
    const z = Math.sin(angle);
    context.tube(steel, [[x * radius, 0, z * radius], [x * radius * 0.8, radius * 0.7, z * radius * 0.8], [x * radius * 0.2, radius * 1.1, z * radius * 0.2]], 0.003);
  }
  for (const fraction of [0.25, 0.65]) {
    const geometry = context.geometry(new THREE.TorusGeometry(radius * (1 - fraction * 0.4), 0.003, 4, 16));
    geometry.rotateX(Math.PI / 2);
    context.part(steel, geometry, [0, radius * fraction, 0]);
  }
}

export function buildSumpDrain(context: ArchitectureContext, size = 0.32): void {
  const { dark, aluminum, steel } = context.palette;
  context.box(dark, 0, 0.006, 0, size, 0.012, size);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * size / 2, 0.018, 0, 0.018, 0.024, size + 0.02);
    context.box(aluminum, 0, 0.018, side * size / 2, size, 0.024, 0.018);
  }
  for (let bar = 0; bar < 7; bar++) context.box(steel, -size * 0.4 + bar * size * 0.133, 0.025, 0, 0.014, 0.02, size - 0.025);
  buildLeafGuard(context.at({ x: 0, y: 0.025, z: 0 }), size * 0.28);
}

export function buildOverflowScupper(context: ArchitectureContext, width = 0.22): void {
  const { aluminum, dark } = context.palette;
  context.box(dark, 0, 0, 0, width, 0.09, 0.012);
  context.box(aluminum, 0, -0.05, 0.08, width + 0.04, 0.016, 0.18);
  for (const side of [-1, 1]) context.box(aluminum, side * (width / 2 + 0.01), -0.005, 0.08, 0.016, 0.1, 0.18);
  context.box(aluminum, 0, -0.06, 0.16, width + 0.04, 0.03, 0.016);
}

export function buildFlatRoofFalls(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): void {
  const rise = Math.min(0.12, depth * 0.012);
  const center = 0.035 + rise;
  const edge = 0.035;
  context.panel(materials.membrane, [[-width / 2, edge, -depth / 2], [-width / 2, center, 0], [width / 2, center, 0], [width / 2, edge, -depth / 2]]);
  context.panel(materials.membrane, [[-width / 2, center, 0], [-width / 2, edge, depth / 2], [width / 2, edge, depth / 2], [width / 2, center, 0]]);
  for (const side of [-1, 1]) {
    const y = edge + 0.006;
    context.box(context.palette.rubber, 0, y, side * (depth / 2 - 0.05), width - 0.1, 0.008, 0.055);
    buildSumpDrain(context.at({ x: width / 2 - 0.4, y: y + 0.008, z: side * (depth / 2 - 0.35) }), 0.28);
    buildOverflowScupper(context.at({ x: width / 2 + 0.01, y: 0.18, z: side * (depth / 2 - 0.4), yaw: Math.PI / 2 }));
  }
  const seams = Math.max(2, Math.ceil(width / 1));
  for (let seam = 1; seam < seams; seam++) {
    const x = -width / 2 + seam * width / seams;
    context.beam(context.palette.rubber, [x, edge + 0.006, -depth / 2], [x, center + 0.006, 0], 0.003);
    context.beam(context.palette.rubber, [x, center + 0.006, 0], [x, edge + 0.006, depth / 2], 0.003);
  }
}

export function buildParapetCoping(context: ArchitectureContext, width: number, depth: number, height: number): void {
  const { aluminum, steel, rubber } = context.palette;
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, height + 0.02, 0, 0.28, 0.035, depth + 0.28);
    context.box(aluminum, 0, height + 0.02, side * depth / 2, width, 0.035, 0.28);
    context.box(aluminum, side * (width / 2 + 0.14), height - 0.018, 0, 0.012, 0.09, depth + 0.28);
    context.box(aluminum, 0, height - 0.018, side * (depth / 2 + 0.14), width, 0.09, 0.012);
    const longJoints = Math.max(1, Math.ceil(depth / 2));
    for (let joint = 1; joint < longJoints; joint++) {
      const z = -depth / 2 + joint * depth / longJoints;
      context.box(rubber, side * width / 2, height + 0.04, z, 0.28, 0.004, 0.008);
      context.disc(steel, side * width / 2, height + 0.044, z + 0.04, 0.004, 0.004);
    }
    const shortJoints = Math.max(1, Math.ceil(width / 2));
    for (let joint = 1; joint < shortJoints; joint++) context.box(rubber, -width / 2 + joint * width / shortJoints, height + 0.04, side * depth / 2, 0.008, 0.004, 0.28);
  }
}

export function buildGreenRoofTray(context: ArchitectureContext, width: number, depth: number, phase: number): void {
  const { dark, steel, green, clay } = context.palette;
  context.box(dark, 0, 0.045, 0, width, 0.09, depth);
  for (const side of [-1, 1]) {
    context.box(steel, side * width / 2, 0.06, 0, 0.012, 0.12, depth);
    context.box(steel, 0, 0.06, side * depth / 2, width, 0.12, 0.012);
  }
  const columns = Math.max(3, Math.ceil(width / 0.2));
  const rows = Math.max(2, Math.ceil(depth / 0.2));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = -width / 2 + (column + 0.5) * width / columns;
      const z = -depth / 2 + (row + 0.5) * depth / rows;
      const seed = row * 31 + column * 17 + phase;
      const radius = 0.055 + (seed % 4) * 0.009;
      context.oval(seed % 7 === 0 ? clay : green, x, 0.105, z, radius, 0.04, radius);
      for (let leaf = 0; leaf < 4; leaf++) {
        const angle = leaf * Math.PI / 2 + seed;
        context.oval(green, x + Math.cos(angle) * radius * 0.5, 0.14, z + Math.sin(angle) * radius * 0.5, radius * 0.5, 0.018, radius * 0.28);
      }
    }
  }
}

export function buildRoofWalkway(context: ArchitectureContext, width: number, length: number): void {
  const { concrete, rubber, aluminum } = context.palette;
  const slabs = Math.max(2, Math.ceil(length / 0.5));
  for (let slab = 0; slab < slabs; slab++) {
    const z = -length / 2 + (slab + 0.5) * length / slabs;
    for (const x of [-width * 0.35, width * 0.35]) {
      for (const edge of [-1, 1]) context.disc(rubber, x, 0.025, z + edge * length / slabs * 0.3, 0.04, 0.05);
    }
    context.box(concrete, 0, 0.065, z, width, 0.04, length / slabs - 0.015);
    context.box(aluminum, -width / 2 - 0.012, 0.063, z, 0.015, 0.04, length / slabs);
  }
}

export function buildRoofFallProtection(context: ArchitectureContext, width: number, depth: number): void {
  const { steel, aluminum, yellow } = context.palette;
  const corners: [number, number][] = [[-width / 2, -depth / 2], [width / 2, -depth / 2], [width / 2, depth / 2], [-width / 2, depth / 2]];
  for (const [x, z] of corners) {
    context.box(steel, x, 0.02, z, 0.22, 0.04, 0.22);
    context.disc(aluminum, x, 0.25, z, 0.025, 0.46);
    context.disc(yellow, x, 0.48, z, 0.032, 0.035);
    for (const side of [-1, 1]) context.disc(aluminum, x + side * 0.075, 0.046, z + side * 0.075, 0.006, 0.012);
  }
  for (let edge = 0; edge < corners.length; edge++) {
    const a = corners[edge];
    const b = corners[(edge + 1) % corners.length];
    context.tube(steel, [[a[0], 0.48, a[1]], [(a[0] + b[0]) / 2, 0.44, (a[1] + b[1]) / 2], [b[0], 0.48, b[1]]], 0.003);
  }
}

export function buildPitchedRoofDrainage(context: ArchitectureContext, width: number, depth: number, eaveHeight: number): void {
  for (const side of [-1, 1]) {
    const eave = context.at({ x: side * (width / 2 + 0.16), y: eaveHeight - 0.04, z: 0, yaw: Math.PI / 2 });
    buildHalfRoundGutter(eave, depth + 0.4, 0.065);
    buildGutterEndCap(eave.at({ x: -depth / 2 - 0.2, y: 0, z: 0, yaw: Math.PI }), 0.065);
    buildGutterEndCap(eave.at({ x: depth / 2 + 0.2, y: -(depth + 0.4) * 0.002, z: 0 }), 0.065);
    buildRainwaterHopper(context.at({ x: side * (width / 2 + 0.16), y: eaveHeight - 0.28, z: -depth / 2 + 0.16 }), 0.18, 0.16);
    buildDetailedDownpipe(context.at({ x: side * (width / 2 + 0.08), y: 0.02, z: -depth / 2 + 0.16, yaw: side * Math.PI / 2 }), eaveHeight - 0.58, 0.035, 0.08);
  }
}

export function buildRoofDrainageSystem(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, parapetHeight: number, phase: number): void {
  buildFlatRoofFalls(context, materials, width - 0.3, depth - 0.3);
  buildParapetCoping(context, width, depth, parapetHeight);
  buildRoofWalkway(context.at({ x: -width * 0.08, y: 0.13, z: -depth * 0.1 }), 0.65, depth * 0.6);
  buildRoofFallProtection(context.at({ x: 0, y: 0.12, z: 0 }), width - 0.8, depth - 0.8);
  if (width > 7 && depth > 6) {
    buildGreenRoofTray(context.at({ x: -width * 0.3, y: 0.12, z: depth * 0.27 }), Math.min(2.4, width * 0.28), Math.min(1.3, depth * 0.2), phase);
  }
}
