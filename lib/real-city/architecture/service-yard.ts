import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildGateValve } from "./mechanical-components";
import { buildNeedleMeter } from "./display-instruments";

function castor(context: ArchitectureContext, x: number, z: number, swivel: number): void {
  const { steel, aluminum, rubber } = context.palette;
  const local = context.at({ x, y: 0, z, yaw: swivel });
  local.box(aluminum, 0, 0.12, 0, 0.1, 0.02, 0.1);
  local.disc(steel, 0, 0.104, 0, 0.025, 0.02);
  for (const side of [-1, 1]) local.box(steel, side * 0.032, 0.072, 0.014, 0.012, 0.06, 0.065);
  local.beam(rubber, [-0.028, 0.045, 0.023], [0.028, 0.045, 0.023], 0.045);
  local.beam(aluminum, [-0.039, 0.045, 0.023], [0.039, 0.045, 0.023], 0.009);
}

function buildWasteContainer(context: ArchitectureContext, width: number, color: THREE.Material, label: string): Animation {
  const depth = 0.56;
  const height = 0.88;
  const { steel, rubber, aluminum, dark } = context.palette;
  const topWidth = width;
  const bottomWidth = width * 0.85;
  const topDepth = depth;
  const bottomDepth = depth * 0.82;
  context.box(color, 0, 0.15, 0, bottomWidth, 0.045, bottomDepth);
  for (const side of [-1, 1]) {
    context.panel(color, [[side * bottomWidth / 2, 0.15, -bottomDepth / 2], [side * topWidth / 2, height, -topDepth / 2], [side * topWidth / 2, height, topDepth / 2], [side * bottomWidth / 2, 0.15, bottomDepth / 2]]);
    context.panel(color, [[-bottomWidth / 2, 0.15, side * bottomDepth / 2], [-topWidth / 2, height, side * topDepth / 2], [topWidth / 2, height, side * topDepth / 2], [bottomWidth / 2, 0.15, side * bottomDepth / 2]]);
    context.box(color, side * width / 2, height, 0, 0.025, 0.045, depth + 0.04);
    context.box(color, 0, height, side * depth / 2, width, 0.045, 0.025);
  }
  context.box(dark, 0, 0.71, 0, width * 0.82, 0.045, depth * 0.8);
  const liner = context.moving("Service bin liner contents", [0, 0.76, 0], moving => {
    moving.oval(dark, -width * 0.2, 0, -0.08, width * 0.21, 0.07, 0.13);
    moving.oval(dark, width * 0.15, 0.01, 0.06, width * 0.23, 0.06, 0.12);
    moving.box(context.palette.white, 0.07, 0.065, 0.02, 0.12, 0.018, 0.08, 0.3);
  });
  const lid = context.moving("Service bin hinged lid", [0, height + 0.02, -depth / 2], moving => {
    moving.box(color, 0, 0, depth / 2, width + 0.07, 0.035, depth + 0.07);
    moving.box(rubber, 0, -0.025, depth / 2, width + 0.03, 0.015, depth + 0.03);
    moving.box(color, 0, 0.04, depth - 0.04, width * 0.45, 0.045, 0.065);
    for (const side of [-1, 1]) moving.box(color, side * width * 0.32, 0.024, depth / 2, 0.025, 0.018, depth * 0.8);
  });
  for (const side of [-1, 1]) {
    context.beam(steel, [side * width * 0.36 - 0.04, height + 0.02, -depth / 2], [side * width * 0.36 + 0.04, height + 0.02, -depth / 2], 0.014);
    context.beam(aluminum, [side * width * 0.47, height - 0.1, -0.12], [side * width * 0.47, height - 0.1, 0.12], 0.015);
    for (const z of [-depth * 0.32, depth * 0.32]) castor(context, side * width * 0.34, z, side * 0.15);
  }
  context.label(label, 0, 0.58, depth / 2 - 0.005, width * 0.72, 0.17, "#dce1d1", "#3d4943");
  const sense = context.doorSensor([0, 0, 0.55], 0.85, 1.2);
  const baseYaw = lid.rotation.y;
  let angle = 0;
  let previous = -1;
  return seconds => {
    const dt = previous < 0 ? 0 : Math.min(0.1, Math.max(0, seconds - previous));
    previous = seconds;
    const requested = sense(seconds) > 0.2 ? 1.25 : 0;
    angle += THREE.MathUtils.clamp(requested - angle, -dt * 0.5, dt * 0.9);
    lid.rotation.set(-angle, baseYaw, 0, "YXZ");
    liner.visible = angle > 0.12;
  };
}

function buildYardDrain(context: ArchitectureContext, width: number): void {
  const { dark, aluminum, concrete } = context.palette;
  context.box(concrete, 0, 0.015, 0, width + 0.08, 0.035, 0.19);
  context.box(dark, 0, 0.034, 0, width, 0.012, 0.14);
  for (const side of [-1, 1]) context.box(aluminum, 0, 0.042, side * 0.068, width, 0.016, 0.014);
  const bars = Math.ceil(width / 0.055);
  for (let bar = 0; bar < bars; bar++) {
    const x = -width / 2 + (bar + 0.5) * width / bars;
    context.box(aluminum, x, 0.043, 0, 0.012, 0.016, 0.13);
  }
  const trap = context.at({ x: width / 2 + 0.22, y: 0.02, z: 0 });
  trap.box(concrete, 0, 0, 0, 0.36, 0.04, 0.32);
  trap.box(context.palette.steel, 0, 0.026, 0, 0.28, 0.018, 0.24);
  for (const x of [-0.07, 0.07]) trap.box(dark, x, 0.038, 0, 0.04, 0.005, 0.012);
}

function buildYardScreen(context: ArchitectureContext, width: number, depth: number): void {
  const { steel, oak, aluminum } = context.palette;
  const height = 1.8;
  for (const side of [-1, 1]) {
    context.box(steel, side * width / 2, height / 2, -depth / 2, 0.065, height, 0.065);
    context.box(steel, side * width / 2, height / 2, depth / 2, 0.065, height, 0.065);
    const slats = Math.max(6, Math.ceil(depth / 0.12));
    for (let slat = 0; slat < slats; slat++) {
      const z = -depth / 2 + (slat + 0.5) * depth / slats;
      context.box(oak, side * width / 2, height / 2, z, 0.035, height - 0.08, 0.07, side * 0.3);
    }
    for (const y of [0.22, 1.52]) context.box(steel, side * width / 2, y, 0, 0.045, 0.04, depth);
    for (const end of [-1, 1]) {
      context.box(steel, side * width / 2, 0.025, end * depth / 2, 0.16, 0.03, 0.16);
      for (const x of [-0.05, 0.05]) context.disc(aluminum, side * width / 2 + x, 0.05, end * depth / 2, 0.008, 0.02);
    }
  }
  for (let plank = 0; plank < 7; plank++) context.box(oak, 0, 0.15 + plank * 0.22, -depth / 2, width - 0.08, 0.16, 0.035);
  context.box(steel, 0, height + 0.03, -depth / 2, width + 0.1, 0.075, 0.1);
}

function buildWashdownPoint(context: ArchitectureContext): Animation[] {
  const { aluminum, steel, white, rubber, green } = context.palette;
  context.box(white, 0, 0.48, 0, 0.5, 0.65, 0.33);
  context.box(aluminum, 0, 0.81, 0.03, 0.54, 0.03, 0.42);
  context.box(steel, 0, 0.825, 0.03, 0.42, 0.01, 0.31);
  context.box(aluminum, -0.23, 0.89, 0.03, 0.025, 0.18, 0.42);
  context.box(aluminum, 0.23, 0.89, 0.03, 0.025, 0.18, 0.42);
  context.box(aluminum, 0, 0.89, 0.23, 0.48, 0.18, 0.025);
  context.box(aluminum, 0, 0.97, -0.18, 0.5, 0.3, 0.025);
  context.tube(aluminum, [[0, 0.83, -0.15], [0, 1.18, -0.15], [0, 1.21, 0.02], [0, 1.1, 0.06]], 0.013);
  buildGateValve(context.at({ x: -0.16, y: 0.99, z: -0.11 }), 0.018);
  context.tube(aluminum, [[0, 0.8, 0.04], [0, 0.63, 0.04], [0, 0.54, -0.03], [0, 0.63, -0.14], [0, 0.24, -0.14]], 0.02);
  context.box(green, 0.19, 1.12, -0.13, 0.07, 0.14, 0.045);
  context.box(rubber, 0.19, 1.2, -0.11, 0.035, 0.02, 0.05);
  const flow = context.moving("Service sink tap stream", [0, 0.965, 0.06], moving => {
    moving.disc(context.palette.water, 0, 0, 0, 0.004, 0.27);
  });
  const sensor = context.doorSensor([0, 0, 0.5], 0.6, 1.2);
  let demand = 0;
  return [
    seconds => { demand = sensor(seconds); flow.visible = demand > 0.25; },
    buildNeedleMeter(context.at({ x: -0.28, y: 0.52, z: 0.2 }), 0.065, 0.025, () => 0.7 - demand * 0.2),
  ];
}

function buildDeliveryDolly(context: ArchitectureContext): void {
  const { steel, aluminum, rubber, oak } = context.palette;
  context.box(aluminum, 0, 0.1, 0, 0.46, 0.025, 0.32);
  for (const side of [-1, 1]) {
    context.beam(steel, [side * 0.19, 0.11, -0.12], [side * 0.19, 1.06, -0.2], 0.018);
    context.beam(rubber, [side * 0.19 - 0.028, 0.1, -0.18], [side * 0.19 + 0.028, 0.1, -0.18], 0.09);
    context.beam(aluminum, [side * 0.19, 0.33, -0.13], [side * 0.19, 0.19, -0.31], 0.013);
  }
  for (const y of [0.3, 0.53, 0.76]) context.beam(steel, [-0.19, y, -0.14 - y * 0.05], [0.19, y, -0.14 - y * 0.05], 0.014);
  context.tube(steel, [[-0.19, 1.04, -0.2], [-0.16, 1.14, -0.21], [0.16, 1.14, -0.21], [0.19, 1.04, -0.2]], 0.018);
  context.beam(rubber, [-0.12, 1.14, -0.21], [0.12, 1.14, -0.21], 0.023);
  context.box(oak, 0, 0.28, 0.015, 0.36, 0.3, 0.27);
  context.box(context.palette.white, 0, 0.43, 0.015, 0.035, 0.005, 0.27);
  context.box(context.palette.dark, 0.01, 0.27, 0.154, 0.14, 0.08, 0.005);
}

function buildWallHose(context: ArchitectureContext): void {
  const { green, steel, aluminum } = context.palette;
  context.box(steel, 0, 0, 0, 0.18, 0.22, 0.035);
  context.box(steel, 0, -0.05, 0.12, 0.24, 0.045, 0.26);
  for (let loop = 0; loop < 4; loop++) {
    const z = 0.07 + loop * 0.021;
    const points: Point[] = [];
    for (let segment = 0; segment <= 24; segment++) {
      const angle = segment / 24 * Math.PI * 2;
      points.push([Math.cos(angle) * 0.13, Math.sin(angle) * 0.25 - 0.2, z]);
    }
    context.tube(green, points, 0.009, true);
  }
  context.tube(green, [[0.11, -0.23, 0.14], [0.2, -0.44, 0.1], [0.18, -0.65, 0.07]], 0.009);
  context.box(aluminum, 0.18, -0.69, 0.07, 0.035, 0.09, 0.025);
  context.box(steel, 0.21, -0.65, 0.07, 0.04, 0.06, 0.015, 0, -0.3);
}

function buildServiceCanopy(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): void {
  const { steel, aluminum, white } = context.palette;
  const rearHeight = 2.22;
  const frontHeight = 2.12;
  for (const side of [-1, 1]) {
    context.box(steel, side * width / 2, frontHeight / 2, depth / 2, 0.05, frontHeight, 0.05);
    context.rectangularBeam(steel, [side * width / 2, rearHeight, -depth / 2], [side * width / 2, frontHeight, depth / 2], 0.06, 0.07);
    context.rectangularBeam(aluminum, [side * width / 2, frontHeight - 0.35, depth / 2], [side * width / 2, frontHeight + 0.03, depth * 0.15], 0.025, 0.035);
  }
  context.panel(materials.ribbedMetal, [[-width / 2 - 0.1, rearHeight + 0.03, -depth / 2 - 0.1], [width / 2 + 0.1, rearHeight + 0.03, -depth / 2 - 0.1], [width / 2 + 0.1, frontHeight + 0.03, depth / 2 + 0.13], [-width / 2 - 0.1, frontHeight + 0.03, depth / 2 + 0.13]]);
  context.box(aluminum, 0, frontHeight - 0.01, depth / 2 + 0.13, width + 0.25, 0.025, 0.12);
  context.box(aluminum, 0, frontHeight + 0.03, depth / 2 + 0.18, width + 0.25, 0.08, 0.015);
  context.box(white, 0, frontHeight - 0.08, 0, 0.54, 0.04, 0.1);
  context.box(context.palette.warmLight, 0, frontHeight - 0.103, 0, 0.5, 0.012, 0.075);
  context.box(aluminum, width / 2 + 0.07, frontHeight / 2, depth / 2 + 0.13, 0.04, frontHeight, 0.04);
}

export function buildRetailServiceYard(context: ArchitectureContext, materials: ArchitecturalMaterials, foodService: boolean): Animation[] {
  const width = 3.15;
  const depth = 2.2;
  const animations: Animation[] = [];
  context.box(materials.boardConcrete, 0, 0.02, 0, width + 0.16, 0.04, depth + 0.14);
  buildYardScreen(context, width, depth);
  buildServiceCanopy(context, materials, width, depth);
  buildYardDrain(context.at({ x: 0, y: 0, z: depth / 2 - 0.1 }), width - 0.7);
  animations.push(buildWasteContainer(context.at({ x: -0.93, y: 0.02, z: -0.45 }), 0.58, context.palette.dark, "GENERAL"));
  animations.push(buildWasteContainer(context.at({ x: -0.24, y: 0.02, z: -0.45 }), 0.58, context.palette.green, "RECYCLE"));
  animations.push(buildWasteContainer(context.at({ x: 0.45, y: 0.02, z: -0.45 }), 0.58, foodService ? context.palette.clay : context.palette.aluminum, foodService ? "FOOD" : "PAPER"));
  animations.push(...buildWashdownPoint(context.at({ x: 1.13, y: 0.02, z: -0.75 })));
  buildWallHose(context.at({ x: 1.5, y: 1.35, z: 0.28, yaw: -Math.PI / 2 }));
  buildDeliveryDolly(context.at({ x: -1.23, y: 0.02, z: 0.57, yaw: Math.PI / 2 }));
  context.label("SERVICE YARD", 0, 1.87, -depth / 2 + 0.02, 1, 0.13, "#e2e1d1", "#4b5650");
  for (const side of [-1, 1]) context.box(context.palette.yellow, side * (width / 2 - 0.11), 0.043, 0.55, 0.04, 0.004, 0.6);
  return animations;
}
