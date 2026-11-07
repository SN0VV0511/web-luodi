import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";

export type WindowOperation = "fixed" | "casement" | "top-hung" | "tilt-turn" | "sliding";

type WindowState = {
  blindHeight: number;
  blindAngle: number;
};

function seasonalWindowTarget(seconds: number, night: boolean, season: string, phase: number): number {
  if (season === "winter") return 0;
  const occupied = Math.sin(seconds * 0.011 + phase) > -0.35;
  if (!occupied) return 0;
  if (night) return season === "summer" ? 0.14 : 0;
  const breeze = 0.4 + Math.sin(seconds * 0.018 + phase) * 0.16;
  return season === "summer" ? breeze * 0.55 : breeze;
}

function buildWindowCorner(context: ArchitectureContext, x: number, y: number, sideX: number, sideY: number): void {
  const { aluminum, steel } = context.palette;
  context.box(aluminum, x + sideX * 0.035, y + sideY * 0.008, 0, 0.08, 0.016, 0.08);
  context.box(aluminum, x + sideX * 0.008, y + sideY * 0.035, 0, 0.016, 0.08, 0.08);
  context.beam(steel, [x + sideX * 0.025, y + sideY * 0.025, 0.041], [x + sideX * 0.025, y + sideY * 0.025, 0.045], 0.003);
}

export function buildGlazingBead(context: ArchitectureContext, width: number, height: number, depth: number): void {
  const { aluminum, rubber } = context.palette;
  for (const side of [-1, 1]) {
    context.box(aluminum, side * (width / 2 - 0.012), height / 2, depth, 0.024, height, 0.025);
    context.box(rubber, side * (width / 2 - 0.026), height / 2, depth + 0.009, 0.005, height - 0.035, 0.012);
    context.box(aluminum, 0, side > 0 ? height - 0.012 : 0.012, depth, width - 0.035, 0.024, 0.025);
    context.box(rubber, 0, side > 0 ? height - 0.026 : 0.026, depth + 0.009, width - 0.05, 0.005, 0.012);
  }
}

export function buildInsulatedGlassUnit(context: ArchitectureContext, width: number, height: number, baseY = 0): void {
  const { glass, aluminum, rubber } = context.palette;
  context.box(glass, 0, baseY + height / 2, -0.014, width, height, 0.006);
  context.box(glass, 0, baseY + height / 2, 0.014, width, height, 0.006);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * (width / 2 - 0.005), baseY + height / 2, 0, 0.008, height - 0.01, 0.022);
    context.box(aluminum, 0, baseY + (side > 0 ? height - 0.005 : 0.005), 0, width - 0.01, 0.008, 0.022);
    context.box(rubber, side * width / 2, baseY + height / 2, 0, 0.004, height, 0.026);
  }
}

export function buildWindowHandle(context: ArchitectureContext, leftHanded = false, x = 0, y = 0, z = 0): void {
  const { aluminum, steel, dark } = context.palette;
  const direction = leftHanded ? -1 : 1;
  context.box(aluminum, x, y, z, 0.025, 0.1, 0.016);
  context.beam(steel, [x, y, z + 0.008], [x, y, z + 0.038], 0.008);
  context.box(aluminum, x, y + direction * 0.045, z + 0.043, 0.014, 0.105, 0.015);
  for (const side of [-1, 1]) context.beam(dark, [x, y + side * 0.033, z + 0.009], [x, y + side * 0.033, z + 0.012], 0.0025);
}

export function buildWindowHinge(context: ArchitectureContext, height: number): void {
  const { aluminum, steel } = context.palette;
  context.box(aluminum, -0.018, 0, 0, 0.04, height, 0.01);
  context.box(aluminum, 0.018, 0, 0.018, 0.04, height, 0.01);
  for (let knuckle = 0; knuckle < 5; knuckle++) context.disc(knuckle % 2 ? steel : aluminum, 0, -height / 2 + (knuckle + 0.5) * height / 5, 0.009, 0.009, height / 5 - 0.001);
  context.disc(steel, 0, height / 2 + 0.003, 0.009, 0.011, 0.006);
}

export function buildWindowTrickleVent(context: ArchitectureContext, width: number): void {
  const { white, dark, aluminum } = context.palette;
  context.box(white, 0, 0, 0, width, 0.055, 0.035);
  context.box(dark, 0, -0.008, 0.021, width - 0.055, 0.018, 0.008);
  const slots = Math.max(4, Math.floor(width / 0.035));
  for (let slot = 0; slot < slots; slot++) context.box(aluminum, -width / 2 + 0.03 + slot * (width - 0.06) / Math.max(1, slots - 1), -0.008, 0.026, 0.008, 0.018, 0.004);
  context.box(white, width / 2 - 0.028, -0.007, 0.03, 0.022, 0.025, 0.012);
}

export function buildWindowSill(context: ArchitectureContext, width: number, projection = 0.18): void {
  const { limestone, aluminum, rubber } = context.palette;
  context.panel(limestone, [[-width / 2 - 0.06, -0.035, -0.08], [width / 2 + 0.06, -0.035, -0.08], [width / 2 + 0.06, -0.052, projection], [-width / 2 - 0.06, -0.052, projection]]);
  context.box(limestone, 0, -0.07, projection - 0.015, width + 0.12, 0.035, 0.035);
  context.box(rubber, 0, -0.087, projection - 0.055, width + 0.05, 0.006, 0.006);
  context.box(aluminum, 0, -0.018, -0.045, width + 0.02, 0.035, 0.012);
  for (const side of [-1, 1]) context.box(aluminum, side * (width / 2 + 0.045), -0.012, projection * 0.35, 0.018, 0.05, projection * 1.1);
}

function buildSashLeaf(context: ArchitectureContext, width: number, height: number, hinge: "side" | "top" | "bottom", side: number): THREE.Group {
  const { aluminum, rubber } = context.palette;
  const originX = hinge === "side" ? side * width / 2 : 0;
  const originY = hinge === "top" ? height : 0;
  const localX = -originX;
  const localY = -originY;
  return context.moving("Operable insulated window sash", [originX, originY, 0.025], moving => {
    for (const edge of [-1, 1]) {
      moving.box(aluminum, localX + edge * (width / 2 - 0.025), localY + height / 2, 0, 0.05, height, 0.065);
      moving.box(aluminum, localX, localY + (edge > 0 ? height - 0.025 : 0.025), 0, width - 0.06, 0.05, 0.065);
      moving.box(rubber, localX + edge * (width / 2 - 0.054), localY + height / 2, 0.024, 0.008, height - 0.08, 0.012);
    }
    moving.box(context.palette.glass, localX, localY + height / 2, -0.012, width - 0.11, height - 0.1, 0.006);
    moving.box(context.palette.glass, localX, localY + height / 2, 0.012, width - 0.11, height - 0.1, 0.006);
    const handleX = hinge === "side" ? -side * (width - 0.08) : width * 0.3;
    const handleY = hinge === "side" ? height * 0.45 : hinge === "top" ? -height + 0.07 : height - 0.07;
    buildWindowHandle(moving, side < 0, handleX, handleY, -0.065);
  });
}

export function buildOperableGlazedPanel(context: ArchitectureContext, width: number, height: number, operation: WindowOperation, phase: number): Animation {
  const { aluminum, rubber, steel } = context.palette;
  for (const side of [-1, 1]) {
    context.box(aluminum, side * (width / 2 + 0.025), height / 2, 0, 0.05, height + 0.1, 0.1);
    context.box(aluminum, 0, side > 0 ? height + 0.025 : -0.025, 0, width + 0.1, 0.05, 0.1);
    context.box(rubber, side * width / 2, height / 2, 0.022, 0.008, height, 0.018);
  }
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) buildWindowCorner(context, x * width / 2, y > 0 ? height : 0, -x, -y);
  }
  for (const side of [-1, 1]) context.box(rubber, side * width * 0.3, -0.026, 0.054, 0.034, 0.008, 0.004);
  if (operation === "fixed") {
    buildInsulatedGlassUnit(context, width - 0.015, height - 0.015, 0.008);
    buildGlazingBead(context, width, height, 0.025);
    return () => {};
  }
  const hinge = operation === "casement" ? "side" : operation === "top-hung" ? "top" : operation === "tilt-turn" ? "bottom" : "side";
  const side = Math.floor(phase) % 2 ? 1 : -1;
  const leaf = buildSashLeaf(context, width, height, hinge, side);
  const yaw = leaf.rotation.y;
  const position = leaf.position.clone();
  const horizontal = new THREE.Vector3(Math.cos(context.local.yaw ?? 0), 0, -Math.sin(context.local.yaw ?? 0));
  if (hinge === "side") {
    buildWindowHinge(context.at({ x: side * width / 2, y: height * 0.22, z: 0.055 }), 0.09);
    buildWindowHinge(context.at({ x: side * width / 2, y: height * 0.78, z: 0.055 }), 0.09);
  } else {
    for (const x of [-1, 1]) context.box(steel, x * width * 0.32, hinge === "top" ? height : 0, 0.025, 0.08, 0.018, 0.065);
  }
  const frictionArm = context.moving("Window opening restrictor", [0, hinge === "top" ? height * 0.9 : height * 0.1, -0.025], moving => {
    moving.box(steel, 0, 0, 0.09, 0.018, 0.012, 0.18);
    moving.beam(aluminum, [0, -0.008, 0.17], [0, 0.008, 0.17], 0.014);
  });
  let openness = 0;
  let previous = 0;
  return (seconds, night, season) => {
    const delta = Math.max(0, Math.min(0.15, seconds - previous));
    previous = seconds;
    const target = seasonalWindowTarget(seconds, night, season, phase);
    openness += (target - openness) * (1 - Math.exp(-delta * 0.45));
    if (operation === "sliding") {
      leaf.position.copy(position).addScaledVector(horizontal, side * openness * width * 0.6);
    } else if (operation === "casement") leaf.rotation.y = yaw + side * openness * 0.95;
    else leaf.rotation.x = (operation === "top-hung" ? -1 : 1) * openness * 0.45;
    frictionArm.scale.z = 0.15 + openness * 1.5;
    frictionArm.visible = openness > 0.02;
  };
}

export function buildPleatedCurtain(context: ArchitectureContext, width: number, height: number, phase: number): Animation {
  const { fabric, steel, aluminum } = context.palette;
  const count = Math.max(5, Math.ceil(width / 0.1));
  const panels: THREE.Group[] = [];
  const bases: THREE.Vector3[] = [];
  for (let pleat = 0; pleat < count; pleat++) {
    const x = -width / 2 + (pleat + 0.5) * width / count;
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [];
    const uv: number[] = [];
    const indices: number[] = [];
    const rows = 8;
    for (let row = 0; row <= rows; row++) {
      const y = -row * height / rows;
      const foldDepth = 0.025 + row / rows * 0.014;
      for (let column = 0; column <= 4; column++) {
        const across = column / 4;
        positions.push((across - 0.5) * width / count, y, Math.cos(across * Math.PI * 2) * foldDepth);
        uv.push(across, row / rows);
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < 4; column++) {
        const a = row * 5 + column;
        indices.push(a, a + 6, a + 1, a, a + 5, a + 6);
      }
    }
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    context.geometry(geometry);
    const panel = context.moving("Window curtain pleat", [x, height, 0], moving => {
      moving.part(fabric, geometry, [0, 0, 0]);
      moving.box(fabric, 0, -height + 0.025, 0, width / count, 0.05, 0.012);
    });
    panels.push(panel);
    bases.push(panel.position.clone());
    context.beam(aluminum, [x, height + 0.025, -0.01], [x, height - 0.015, -0.01], 0.004);
  }
  context.beam(steel, [-width / 2 - 0.08, height + 0.03, 0], [width / 2 + 0.08, height + 0.03, 0], 0.012);
  const horizontal = new THREE.Vector3(Math.cos(context.local.yaw ?? 0), 0, -Math.sin(context.local.yaw ?? 0));
  let closure = 0.2;
  let previous = 0;
  return (seconds, night, season) => {
    const delta = Math.max(0, Math.min(0.15, seconds - previous));
    previous = seconds;
    const target = night ? 1 : season === "summer" ? 0.55 : 0.16;
    closure += (target - closure) * (1 - Math.exp(-delta * 0.15));
    panels.forEach((panel, index) => {
      const half = index < count / 2 ? -1 : 1;
      const baseX = -width / 2 + (index + 0.5) * width / count;
      const gatheredX = half * width * 0.48 + (baseX - half * width * 0.25) * 0.16;
      const desiredX = THREE.MathUtils.lerp(gatheredX, baseX, closure);
      panel.position.copy(bases[index]).addScaledVector(horizontal, desiredX - baseX);
      panel.scale.x = 0.16 + closure * 0.84;
      panel.rotation.x = Math.sin(seconds * 0.7 + phase + index * 0.24) * (night ? 0.002 : 0.012) * (season === "winter" ? 0.1 : 1);
    });
  };
}

export function buildVenetianBlindAssembly(context: ArchitectureContext, width: number, height: number, phase: number): Animation {
  const { aluminum, white, dark, steel } = context.palette;
  context.box(white, 0, height + 0.035, 0, width + 0.08, 0.07, 0.075);
  const count = Math.max(8, Math.ceil(height / 0.055));
  const blades: THREE.Group[] = [];
  const origins: THREE.Vector3[] = [];
  for (let blade = 0; blade < count; blade++) {
    const y = height - (blade + 0.5) * height / count;
    const group = context.moving("Adjustable Venetian blind blade", [0, y, 0], moving => {
      moving.box(aluminum, 0, 0, 0, width, 0.006, 0.052);
    });
    blades.push(group);
    origins.push(group.position.clone());
  }
  for (const side of [-1, 1]) {
    context.beam(dark, [side * width * 0.35, 0.02, 0], [side * width * 0.35, height, 0], 0.002);
    context.beam(steel, [side * width * 0.35, 0.02, 0.02], [side * width * 0.35, height, 0.02], 0.0015);
  }
  context.beam(white, [width / 2 + 0.04, height - 0.05, 0], [width / 2 + 0.04, height * 0.4, 0], 0.004);
  context.disc(white, width / 2 + 0.04, height * 0.38, 0, 0.008, 0.045);
  const state: WindowState = { blindHeight: 0.8, blindAngle: 0.5 };
  let last = 0;
  return (seconds, night, season) => {
    const delta = Math.max(0, Math.min(0.15, seconds - last));
    last = seconds;
    const sunFacing = (Math.sin(seconds * 0.009 + phase) + 1) / 2;
    const targetHeight = night ? 1 : season === "summer" ? 0.85 : 0.45;
    const targetAngle = night ? 1.42 : season === "summer" ? 0.85 + sunFacing * 0.4 : 0.1 + sunFacing * 0.45;
    state.blindHeight += (targetHeight - state.blindHeight) * (1 - Math.exp(-delta * 0.12));
    state.blindAngle += (targetAngle - state.blindAngle) * (1 - Math.exp(-delta * 0.2));
    blades.forEach((blade, index) => {
      blade.position.copy(origins[index]);
      blade.position.y = context.local.y + height - (index + 0.5) * (height * state.blindHeight / count + 0.007 * (1 - state.blindHeight));
      blade.rotation.x = state.blindAngle;
    });
  };
}

export function buildInsectScreen(context: ArchitectureContext, width: number, height: number): void {
  const { steel, aluminum } = context.palette;
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, height / 2, 0, 0.02, height, 0.015);
    context.box(aluminum, 0, side > 0 ? height : 0, 0, width, 0.02, 0.015);
  }
  const columns = Math.max(6, Math.ceil(width / 0.05));
  const rows = Math.max(8, Math.ceil(height / 0.06));
  for (let column = 1; column < columns; column++) context.box(steel, -width / 2 + column * width / columns, height / 2, 0, 0.0015, height - 0.03, 0.0015);
  for (let row = 1; row < rows; row++) context.box(steel, 0, row * height / rows, 0, width - 0.03, 0.0015, 0.0015);
}

export function buildDetailedWindowWall(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, height: number, phase: number, curtains = true): Animation[] {
  const animations: Animation[] = [];
  const columns = Math.max(2, Math.round(width / 1.3));
  const columnWidth = width / columns;
  for (let column = 0; column < columns; column++) {
    const x = -width / 2 + (column + 0.5) * columnWidth;
    const panel = context.at({ x, y: 0, z: 0 });
    const operation: WindowOperation = column === 0 ? (Math.floor(phase) % 2 === 0 ? "tilt-turn" : "top-hung") : column === columns - 1 ? (Math.floor(phase) % 3 === 0 ? "sliding" : "casement") : "fixed";
    animations.push(buildOperableGlazedPanel(panel, columnWidth - 0.08, height, operation, phase + column));
    if (column === 0) buildInsectScreen(panel.at({ x: 0, y: 0.04, z: -0.07 }), columnWidth - 0.16, height - 0.08);
    if (column % 2 === 0) buildWindowTrickleVent(panel.at({ x: 0, y: height - 0.07, z: -0.06 }), Math.min(0.36, columnWidth * 0.6));
    if (curtains && column > 0) animations.push(buildPleatedCurtain(panel.at({ x: 0, y: 0.02, z: -0.15 }), columnWidth - 0.06, height - 0.05, phase + column));
    else if (column > 0) animations.push(buildVenetianBlindAssembly(panel.at({ x: 0, y: 0.01, z: -0.12 }), columnWidth - 0.08, height - 0.04, phase + column));
  }
  buildWindowSill(context, width, 0.18);
  context.box(materials.boardConcrete, 0, height + 0.1, -0.03, width + 0.24, 0.12, 0.26);
  context.box(context.palette.rubber, 0, height + 0.037, 0.07, width + 0.18, 0.005, 0.006);
  return animations;
}
