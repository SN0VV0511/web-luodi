import * as THREE from "three";
import { ArchitectureContext } from "./context";
import type { ArchitecturalMaterials } from "./materials";

export function buildStairNosing(context: ArchitectureContext, width: number, depth = 0.055): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(aluminum, 0, 0.003, 0, width, 0.006, depth);
  for (let groove = 0; groove < 3; groove++) context.box(rubber, 0, 0.007, -depth * 0.3 + groove * depth * 0.3, width - 0.03, 0.003, depth * 0.13);
  for (const side of [-1, 1]) context.disc(steel, side * width * 0.4, 0.01, 0, 0.003, 0.003);
}

export function buildGlassStairBracket(context: ArchitectureContext): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(aluminum, 0, 0.045, 0, 0.055, 0.09, 0.07);
  context.box(rubber, 0, 0.055, 0.038, 0.045, 0.06, 0.006);
  for (const side of [-1, 1]) context.beam(steel, [side * 0.015, 0.05, -0.035], [side * 0.015, 0.05, -0.047], 0.005);
  context.box(aluminum, 0, 0, -0.045, 0.09, 0.018, 0.13);
}

export function buildTimberTread(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, closedRiser: boolean, rise: number): void {
  const { steel, oak } = context.palette;
  context.roundedBox(materials.timber, 0, -0.024, 0, width, 0.048, depth, 0.008);
  if (closedRiser) context.box(oak, 0, -rise / 2 - 0.024, -depth / 2 + 0.012, width - 0.02, rise, 0.024);
  buildStairNosing(context.at({ x: 0, y: 0.002, z: depth / 2 - 0.03 }), width - 0.025);
  for (const side of [-1, 1]) {
    context.box(steel, side * width * 0.31, -0.058, 0, 0.12, 0.025, depth * 0.74);
    for (const edge of [-1, 1]) context.disc(steel, side * width * 0.31, -0.077, edge * depth * 0.25, 0.006, 0.012);
  }
}

export function buildWallMountedStairRail(context: ArchitectureContext, rise: number, run: number, height: number): void {
  const { aluminum, steel } = context.palette;
  const start: [number, number, number] = [0, height, 0.2];
  const end: [number, number, number] = [0, rise + height, -run - 0.2];
  context.beam(aluminum, start, end, 0.025);
  const brackets = Math.max(2, Math.ceil(run / 0.85));
  for (let bracket = 0; bracket <= brackets; bracket++) {
    const t = bracket / brackets;
    const y = height + t * rise;
    const z = -t * run;
    context.box(steel, -0.09, y - 0.04, z, 0.018, 0.09, 0.07);
    context.beam(steel, [-0.08, y - 0.04, z], [0, y - 0.04, z], 0.009);
    context.beam(steel, [0, y - 0.04, z], [0, y, z], 0.009);
    for (const boltY of [-0.03, 0.03]) context.beam(aluminum, [-0.102, y - 0.04 + boltY, z], [-0.096, y - 0.04 + boltY, z], 0.004);
  }
}

export function buildSteelStringerStair(context: ArchitectureContext, materials: ArchitecturalMaterials, rise: number, width: number, run: number): void {
  const { steel, aluminum, glass, rubber } = context.palette;
  const count = Math.max(3, Math.ceil(rise / 0.175));
  const stepRise = rise / count;
  const stepRun = run / count;
  for (let step = 0; step < count; step++) {
    const y = (step + 1) * stepRise;
    const z = -(step + 0.5) * stepRun;
    buildTimberTread(context.at({ x: 0, y, z }), materials, width, stepRun + 0.018, false, stepRise);
    for (const side of [-1, 1]) {
      context.rectangularBeam(steel, [side * width * 0.3, y - 0.09, z - stepRun * 0.3], [side * width * 0.3, y - 0.2, z], 0.04, 0.04);
    }
  }
  for (const side of [-1, 1]) {
    context.rectangularBeam(steel, [side * width * 0.3, -0.08, 0], [side * width * 0.3, rise - 0.08, -run], 0.06, 0.16);
    context.box(steel, side * width * 0.3, 0.012, 0.05, 0.2, 0.025, 0.22);
    for (const offset of [-1, 1]) context.disc(aluminum, side * width * 0.3 + offset * 0.06, 0.032, 0.06, 0.008, 0.014);
  }
  const panelCount = Math.max(2, Math.ceil(run / 1.1));
  for (let panel = 0; panel < panelCount; panel++) {
    const start = panel / panelCount;
    const end = (panel + 1) / panelCount;
    const x = width / 2 + 0.025;
    context.panel(glass, [[x, start * rise + 0.06, -start * run], [x, start * rise + 1.02, -start * run], [x, end * rise + 1.02, -end * run], [x, end * rise + 0.06, -end * run]]);
    for (const t of [start + 0.04, end - 0.04]) buildGlassStairBracket(context.at({ x, y: t * rise + 0.03, z: -t * run, yaw: Math.PI / 2 }));
  }
  context.beam(aluminum, [width / 2 + 0.025, 1.03, 0.16], [width / 2 + 0.025, rise + 1.03, -run - 0.16], 0.025);
  context.beam(rubber, [width / 2 + 0.025, 1.01, 0], [width / 2 + 0.025, rise + 1.01, -run], 0.008);
  buildWallMountedStairRail(context.at({ x: -width / 2 + 0.05, y: 0, z: 0 }), rise, run, 0.9);
  for (let step = 1; step < count; step += 3) context.box(context.palette.warmLight, -width / 2 + 0.01, step * stepRise + 0.14, -step * stepRun, 0.025, 0.045, 0.12);
}

function spiralTreadGeometry(context: ArchitectureContext, innerRadius: number, outerRadius: number, angle: number, thickness: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const segments = 8;
  shape.moveTo(Math.sin(0) * innerRadius, Math.cos(0) * innerRadius);
  for (let segment = 0; segment <= segments; segment++) {
    const theta = segment / segments * angle;
    shape.lineTo(Math.sin(theta) * outerRadius, Math.cos(theta) * outerRadius);
  }
  for (let segment = segments; segment >= 0; segment--) {
    const theta = segment / segments * angle;
    shape.lineTo(Math.sin(theta) * innerRadius, Math.cos(theta) * innerRadius);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 4 });
  geometry.rotateX(Math.PI / 2);
  return context.geometry(geometry);
}

export function buildSpiralStair(context: ArchitectureContext, materials: ArchitecturalMaterials, rise: number, radius: number, startAngle = -Math.PI / 2): void {
  const { steel, aluminum, oak, rubber } = context.palette;
  const count = Math.max(12, Math.ceil(rise / 0.18));
  const stepRise = rise / count;
  const totalAngle = Math.PI * 2 + 0.3;
  const increment = totalAngle / count;
  const inner = 0.14;
  const tread = spiralTreadGeometry(context, inner, radius, increment + 0.035, 0.045);
  context.disc(steel, 0, rise / 2, 0, 0.075, rise + 0.08);
  context.disc(aluminum, 0, 0.025, 0, 0.19, 0.05);
  for (let anchor = 0; anchor < 6; anchor++) {
    const angle = anchor * Math.PI / 3;
    context.disc(steel, Math.cos(angle) * 0.145, 0.057, Math.sin(angle) * 0.145, 0.008, 0.012);
  }
  const railPoints: [number, number, number][] = [];
  const innerPoints: [number, number, number][] = [];
  for (let step = 0; step < count; step++) {
    const angle = startAngle + step * increment;
    const y = (step + 1) * stepRise;
    context.part(materials.timber, tread, [0, y, 0], [1, 1, 1], angle);
    context.disc(steel, 0, y - stepRise / 2, 0, 0.09, stepRise - 0.015);
    const supportAngle = angle + increment * 0.5;
    context.beam(steel, [Math.sin(supportAngle) * 0.08, y - 0.07, Math.cos(supportAngle) * 0.08], [Math.sin(supportAngle) * radius * 0.82, y - 0.07, Math.cos(supportAngle) * radius * 0.82], 0.018);
    const handAngle = angle + increment * 0.85;
    const x = Math.sin(handAngle) * (radius - 0.015);
    const z = Math.cos(handAngle) * (radius - 0.015);
    context.beam(aluminum, [x, y - 0.025, z], [x, y + 0.93, z], 0.012);
    context.disc(steel, x, y, z, 0.025, 0.03);
    context.beam(rubber, [Math.sin(angle + increment) * inner, y + 0.006, Math.cos(angle + increment) * inner], [Math.sin(angle + increment) * radius, y + 0.006, Math.cos(angle + increment) * radius], 0.004);
    railPoints.push([x, y + 0.94, z]);
    innerPoints.push([Math.sin(handAngle) * 0.23, y + 0.78, Math.cos(handAngle) * 0.23]);
  }
  context.tube(oak, railPoints, 0.025);
  context.tube(aluminum, innerPoints, 0.014);
  context.disc(aluminum, 0, rise + 0.035, 0, 0.095, 0.03);
  context.box(context.palette.warmLight, 0, rise + 0.75, 0, 0.08, 0.08, 0.08);
}

export function buildStairwellGuard(context: ArchitectureContext, width: number, depth: number, entranceSide: "left" | "front" = "left"): void {
  const { glass, aluminum, steel, rubber } = context.palette;
  const height = 1.05;
  const sides = entranceSide === "left" ? ["back", "right", "front"] : ["left", "back", "right"];
  for (const side of sides) {
    const horizontal = side === "front" || side === "back";
    const sign = side === "left" || side === "back" ? -1 : 1;
    const length = horizontal ? width : depth;
    const local = context.at({ x: horizontal ? 0 : sign * width / 2, y: 0, z: horizontal ? sign * depth / 2 : 0, yaw: horizontal ? 0 : Math.PI / 2 });
    local.box(glass, 0, height / 2, 0, length, height, 0.012);
    local.box(aluminum, 0, height + 0.018, 0, length + 0.03, 0.035, 0.035);
    local.box(rubber, 0, 0.035, 0, length, 0.045, 0.018);
    for (const x of [-length * 0.38, length * 0.38]) {
      buildGlassStairBracket(local.at({ x, y: 0, z: 0 }));
      local.box(steel, x, -0.04, 0, 0.07, 0.08, 0.07);
    }
  }
}

export function buildStairLandingLight(context: ArchitectureContext, radius = 0.26): void {
  const { steel, bronze, warmLight } = context.palette;
  context.disc(steel, 0, -0.018, 0, 0.055, 0.035);
  context.beam(steel, [0, -0.03, 0], [0, -0.58, 0], 0.003);
  const points: THREE.Vector2[] = [];
  for (let segment = 0; segment <= 12; segment++) {
    const t = segment / 12;
    points.push(new THREE.Vector2(radius * (0.2 + Math.sin(t * Math.PI / 2) * 0.8), -0.16 * t));
  }
  const shade = context.geometry(new THREE.LatheGeometry(points, 20));
  context.part(bronze, shade, [0, -0.58, 0]);
  context.disc(warmLight, 0, -0.74, 0, radius * 0.86, 0.008);
}

export function buildVillaStaircase(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, rise: number): void {
  const centerX = width * 0.41 - 1;
  const centerZ = depth * 0.22 - 1.2;
  const stair = context.at({ x: centerX, y: 0.035, z: centerZ });
  buildSpiralStair(stair, materials, rise - 0.035, 0.82);
  buildStairwellGuard(stair.at({ x: 0, y: rise - 0.035, z: 0 }), 1.86, 1.86, "left");
  buildStairLandingLight(stair.at({ x: 0, y: rise + 2.65, z: 0 }), 0.22);
}
