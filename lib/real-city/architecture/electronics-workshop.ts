import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDigitalNumber, buildSignalStack } from "./display-instruments";
import { buildOfficeDesk, buildTaskChair } from "./furniture";

export type PrinterStage = "homing" | "heating" | "perimeter" | "infill" | "layer" | "cooling";

type PrinterPose = {
  x: number;
  y: number;
  z: number;
  extruding: boolean;
  layer: number;
  stage: PrinterStage;
  temperature: number;
  progress: number;
};

function roundedSquarePoint(progress: number, radius: number, corner: number): { x: number; z: number } {
  const p = THREE.MathUtils.euclideanModulo(progress, 1) * 4;
  const side = Math.floor(p);
  const along = p - side;
  const straightEnd = 1 - corner / (radius * 2);
  let x: number;
  let z: number;
  if (along < straightEnd) {
    x = -radius + corner + along / straightEnd * (radius * 2 - corner * 2);
    z = radius;
  } else {
    const angle = (along - straightEnd) / (1 - straightEnd) * Math.PI / 2;
    x = radius - corner + Math.sin(angle) * corner;
    z = radius - corner + Math.cos(angle) * corner;
  }
  for (let rotation = 0; rotation < side; rotation++) {
    const previousX = x;
    x = z;
    z = -previousX;
  }
  return { x, z };
}

export function samplePrinterPose(seconds: number, phase: number): PrinterPose {
  const cycle = 128;
  const time = THREE.MathUtils.euclideanModulo(seconds + phase, cycle);
  if (time < 6) {
    const progress = THREE.MathUtils.smoothstep(time, 0, 6);
    return { x: -0.12 * progress, y: 0.09 + (1 - progress) * 0.2, z: -0.12 * progress, extruding: false, layer: 0, stage: "homing", temperature: 25, progress: 0 };
  }
  if (time < 16) {
    return { x: -0.12, y: 0.09, z: -0.12, extruding: false, layer: 0, stage: "heating", temperature: 25 + (time - 6) / 10 * 180, progress: 0 };
  }
  if (time > 116) {
    const progress = THREE.MathUtils.smoothstep(time, 116, 121);
    return { x: -0.12 * progress, y: 0.25 + progress * 0.04, z: -0.12 * progress, extruding: false, layer: 20, stage: "cooling", temperature: 205 - (time - 116) / 12 * 150, progress: 1 };
  }
  const printingTime = time - 16;
  const layer = Math.min(19, Math.floor(printingTime / 5));
  const within = printingTime - layer * 5;
  const y = 0.09 + layer * 0.008;
  if (within < 2.2) {
    const point = roundedSquarePoint(within / 2.2, 0.075, 0.012);
    return { x: point.x, y, z: point.z, extruding: true, layer, stage: "perimeter", temperature: 205 + Math.sin(seconds) * 1.5, progress: printingTime / 100 };
  }
  if (within < 4.7) {
    const progress = (within - 2.2) / 2.5;
    const raster = progress * 8;
    const row = Math.floor(raster);
    const along = raster - row;
    const x = (row % 2 === 0 ? along : 1 - along) * 0.14 - 0.07;
    const z = -0.065 + row / 7 * 0.13;
    return { x, y, z, extruding: true, layer, stage: "infill", temperature: 205, progress: printingTime / 100 };
  }
  const raised = (within - 4.7) / 0.3;
  return { x: -0.07, y: y + raised * 0.008, z: -0.065, extruding: false, layer, stage: "layer", temperature: 205, progress: printingTime / 100 };
}

export function buildDesktopPrinter(context: ArchitectureContext, phase: number): Animation[] {
  const { dark, aluminum, steel, glass, yellow, green } = context.palette;
  const animations: Animation[] = [];
  context.box(dark, 0, 0.06, 0, 0.45, 0.12, 0.45);
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.2, 0.2]) context.box(aluminum, x, 0.31, z, 0.025, 0.5, 0.025);
  }
  for (const side of [-1, 1]) {
    context.box(aluminum, 0, 0.56, side * 0.2, 0.425, 0.025, 0.025);
    context.box(aluminum, side * 0.2, 0.56, 0, 0.025, 0.025, 0.425);
    context.box(glass, side * 0.215, 0.33, 0, 0.008, 0.44, 0.4);
    context.beam(steel, [side * 0.15, 0.14, -0.17], [side * 0.15, 0.14, 0.17], 0.006);
  }
  const bed = context.moving("3D printer heated bed", [0, 0.16, 0], moving => {
    moving.box(aluminum, 0, 0, 0, 0.32, 0.015, 0.32);
    moving.box(dark, 0, 0.011, 0, 0.3, 0.006, 0.3);
    for (const x of [-0.13, 0.13]) {
      for (const z of [-0.13, 0.13]) moving.disc(yellow, x, -0.018, z, 0.012, 0.025);
    }
  });
  const crossbar = context.moving("3D printer X gantry", [0, 0.23, 0], moving => {
    moving.box(aluminum, 0, 0, 0, 0.4, 0.025, 0.03);
    moving.beam(steel, [-0.19, -0.018, 0.018], [0.19, -0.018, 0.018], 0.004);
    for (const side of [-1, 1]) moving.box(dark, side * 0.19, 0, 0, 0.045, 0.07, 0.06);
  });
  const nozzle = context.moving("3D printer extruder carriage", [0, 0.23, 0], moving => {
    moving.box(dark, 0, 0.02, 0.025, 0.065, 0.07, 0.065);
    moving.disc(aluminum, 0, -0.032, 0.025, 0.013, 0.035);
    moving.disc(yellow, 0, -0.058, 0.025, 0.006, 0.016);
    moving.beam(steel, [0, 0.021, 0.06], [0, 0.021, 0.066], 0.023);
  });
  const output = context.moving("Printed enclosure layers", [0, 0.176, 0], moving => {
    for (let layer = 0; layer < 20; layer++) {
      const y = layer * 0.008 + 0.004;
      for (const side of [-1, 1]) {
        moving.box(green, side * 0.075, y, 0, 0.008, 0.007, 0.15);
        moving.box(green, 0, y, side * 0.075, 0.15, 0.007, 0.008);
      }
    }
    moving.box(green, 0, 0.004, 0, 0.15, 0.008, 0.15);
  });
  const spool = context.moving("3D printer filament reel", [0.3, 0.4, -0.05], moving => {
    moving.beam(dark, [-0.03, 0, 0], [0.03, 0, 0], 0.11);
    moving.beam(green, [-0.023, 0, 0], [0.023, 0, 0], 0.09);
    moving.box(aluminum, 0.033, 0, 0, 0.006, 0.19, 0.02);
  });
  context.beam(steel, [0.2, 0.4, -0.05], [0.34, 0.4, -0.05], 0.01);
  context.tube(green, [[0.3, 0.49, -0.05], [0.2, 0.65, 0], [0, 0.65, 0], [0, 0.57, 0]], 0.002);
  const temperature = buildDigitalNumber(context.at({ x: 0.08, y: 0.065, z: 0.236 }), 3, 0.014);
  const bedOrigin = bed.position.clone();
  const nozzleOrigin = nozzle.position.clone();
  const gantryOrigin = crossbar.position.clone();
  const outputOrigin = output.position.clone();
  const xDirection = new THREE.Vector3(Math.cos(context.local.yaw ?? 0), 0, -Math.sin(context.local.yaw ?? 0));
  const zDirection = new THREE.Vector3(Math.sin(context.local.yaw ?? 0), 0, Math.cos(context.local.yaw ?? 0));
  let state = samplePrinterPose(0, phase);
  animations.push(seconds => {
    state = samplePrinterPose(seconds, phase);
    bed.position.copy(bedOrigin).addScaledVector(zDirection, -state.z);
    output.position.copy(outputOrigin).addScaledVector(zDirection, -state.z);
    output.scale.y = Math.max(0.01, state.progress);
    nozzle.position.copy(nozzleOrigin).addScaledVector(xDirection, state.x);
    nozzle.position.y = nozzleOrigin.y + state.y - 0.09;
    crossbar.position.copy(gantryOrigin);
    crossbar.position.y = gantryOrigin.y + state.y - 0.09;
    spool.rotation.x = seconds * (state.extruding ? 0.08 : 0);
    temperature.set(state.temperature);
  });
  animations.push(buildSignalStack(context.at({ x: -0.17, y: 0.575, z: -0.16 }), () => state.stage === "heating" ? "amber" : "green"));
  return animations;
}

export function buildOscilloscope(context: ArchitectureContext, phase: number): Animation {
  const { white, dark, glass, aluminum, green, yellow } = context.palette;
  context.box(white, 0, 0.15, 0, 0.4, 0.3, 0.16);
  context.box(dark, -0.065, 0.17, 0.088, 0.23, 0.2, 0.008);
  context.box(glass, -0.065, 0.17, 0.094, 0.22, 0.19, 0.008);
  for (let line = -3; line <= 3; line++) context.box(aluminum, -0.065 + line * 0.03, 0.17, 0.1, 0.001, 0.18, 0.001);
  for (let line = -2; line <= 2; line++) context.box(aluminum, -0.065, 0.17 + line * 0.034, 0.1, 0.21, 0.001, 0.001);
  const traceSegments: THREE.Group[] = [];
  for (let segment = 0; segment < 24; segment++) {
    traceSegments.push(context.moving("Oscilloscope live waveform segment", [-0.17 + segment * 0.009, 0.17, 0.105], moving => {
      moving.box(green, 0, 0, 0, 0.0095, 0.002, 0.001);
    }));
  }
  const rest = traceSegments.map(segment => segment.position.clone());
  for (const y of [0.08, 0.16, 0.24]) {
    context.beam(aluminum, [0.12, y, 0.085], [0.12, y, 0.11], 0.02);
    context.box(dark, 0.12, y + 0.01, 0.113, 0.004, 0.012, 0.003);
  }
  for (let button = 0; button < 4; button++) context.box(yellow, -0.14 + button * 0.05, 0.035, 0.089, 0.025, 0.012, 0.01);
  context.tube(dark, [[0.12, 0.02, 0.09], [0.15, -0.04, 0.2], [0.05, -0.06, 0.32], [-0.08, -0.03, 0.25]], 0.004);
  return seconds => {
    traceSegments.forEach((segment, index) => {
      const t = index / 23;
      const carrier = Math.sin(t * Math.PI * 5 + seconds * 1.8 + phase);
      const modulation = 0.6 + 0.3 * Math.sin(seconds * 0.3 + phase);
      const y = carrier * 0.063 * modulation;
      segment.position.copy(rest[index]);
      segment.position.y += y;
      segment.rotation.z = Math.atan(Math.cos(t * Math.PI * 5 + seconds * 1.8 + phase) * 0.063 * modulation * Math.PI * 5 / 0.216);
    });
  };
}

export function buildSolderingStation(context: ArchitectureContext, phase: number): Animation[] {
  const { dark, aluminum, steel, yellow, green } = context.palette;
  context.box(dark, 0, 0.065, 0, 0.18, 0.13, 0.2);
  const display = buildDigitalNumber(context.at({ x: 0, y: 0.075, z: 0.11 }), 3, 0.012);
  context.beam(aluminum, [0.055, 0.03, 0.1], [0.055, 0.03, 0.12], 0.015);
  context.box(green, -0.055, 0.03, 0.11, 0.018, 0.012, 0.01);
  context.box(steel, 0.2, 0.014, 0.02, 0.15, 0.028, 0.2);
  const helix: [number, number, number][] = [];
  for (let segment = 0; segment <= 40; segment++) {
    const angle = segment / 40 * Math.PI * 12;
    helix.push([0.2 + Math.cos(angle) * 0.019, 0.07 + segment / 40 * 0.12, -0.02 + Math.sin(angle) * 0.019]);
  }
  context.tube(steel, helix, 0.003);
  context.beam(dark, [0.2, 0.15, -0.02], [0.2, 0.27, -0.02], 0.012);
  context.beam(aluminum, [0.2, 0.15, -0.02], [0.2, 0.06, -0.02], 0.005);
  context.tube(dark, [[0.2, 0.27, -0.02], [0.26, 0.32, -0.06], [0.29, 0.04, -0.15], [0.1, 0.03, -0.12]], 0.004);
  context.box(yellow, 0.2, 0.035, 0.08, 0.1, 0.02, 0.07);
  return [(seconds, night) => display.set(night ? 24 : 345 + Math.sin(seconds * 0.15 + phase) * 5)];
}

export function buildFumeExtractor(context: ArchitectureContext): Animation {
  const { dark, steel, aluminum } = context.palette;
  context.box(dark, 0, 0.13, 0, 0.25, 0.25, 0.08);
  context.box(steel, 0, 0.13, 0.045, 0.2, 0.2, 0.012);
  for (let mesh = -4; mesh <= 4; mesh++) {
    context.box(aluminum, mesh * 0.022, 0.13, 0.055, 0.002, 0.19, 0.002);
    context.box(aluminum, 0, 0.13 + mesh * 0.022, 0.055, 0.19, 0.002, 0.002);
  }
  for (const side of [-1, 1]) {
    context.box(steel, side * 0.11, 0.06, -0.04, 0.015, 0.12, 0.015);
    context.box(steel, side * 0.11, 0.008, -0.04, 0.035, 0.016, 0.18);
  }
  const fan = context.moving("Solder fume extractor fan", [0, 0.13, 0.03], moving => {
    for (let blade = 0; blade < 5; blade++) {
      const angle = blade * Math.PI * 2 / 5;
      moving.box(dark, Math.cos(angle) * 0.04, Math.sin(angle) * 0.04, 0, 0.09, 0.027, 0.006, 0, angle + 0.3);
    }
  });
  return (seconds, night) => { fan.rotation.z = night ? 0 : seconds * 22; };
}

export function buildBenchMicroscope(context: ArchitectureContext): void {
  const { white, aluminum, dark, glass } = context.palette;
  context.roundedBox(white, 0, 0.022, 0, 0.22, 0.045, 0.28, 0.03);
  context.box(dark, 0, 0.05, 0.04, 0.14, 0.012, 0.13);
  context.disc(aluminum, 0, 0.2, -0.09, 0.018, 0.36);
  context.box(white, 0, 0.33, -0.02, 0.13, 0.1, 0.18);
  context.disc(dark, 0, 0.24, 0.04, 0.045, 0.1);
  context.disc(glass, 0, 0.19, 0.04, 0.033, 0.008);
  for (const side of [-1, 1]) {
    context.beam(white, [side * 0.027, 0.36, 0.02], [side * 0.035, 0.43, 0.08], 0.022);
    context.beam(dark, [side * 0.035, 0.43, 0.08], [side * 0.038, 0.45, 0.1], 0.024);
    context.beam(aluminum, [side * 0.06, 0.32, -0.02], [side * 0.085, 0.32, -0.02], 0.025);
  }
}

export function buildCircuitBoard(context: ArchitectureContext, width: number, depth: number, variant: number): void {
  const { green, bronze, aluminum, dark, white } = context.palette;
  context.box(green, 0, 0.003, 0, width, 0.006, depth);
  const tracks = Math.max(4, Math.floor(width / 0.02));
  for (let track = 0; track < tracks; track++) {
    const x = -width / 2 + (track + 0.5) * width / tracks;
    const endZ = depth * (0.15 + (track + variant) % 3 * 0.1);
    context.box(bronze, x, 0.007, -depth * 0.2, 0.0015, 0.001, depth * 0.48);
    context.box(bronze, x + width * 0.06, 0.007, endZ, width * 0.12, 0.001, 0.0015);
  }
  context.box(dark, 0, 0.014, 0, width * 0.32, 0.014, depth * 0.32);
  for (const side of [-1, 1]) {
    for (let pin = 0; pin < 8; pin++) context.box(aluminum, side * width * 0.19, 0.011, -depth * 0.14 + pin * depth * 0.04, width * 0.06, 0.004, 0.003);
    context.disc(aluminum, side * width * 0.35, 0.018, depth * 0.25, 0.007, 0.025);
    context.box(white, side * width * 0.32, 0.012, -depth * 0.3, width * 0.15, 0.01, depth * 0.1);
  }
  for (let connector = 0; connector < 3; connector++) context.box(dark, -width * 0.3 + connector * width * 0.3, 0.02, depth / 2, width * 0.2, 0.025, 0.025);
}

export function buildPartsDrawers(context: ArchitectureContext, width: number, height: number): void {
  const { dark, glass, white, aluminum } = context.palette;
  context.box(dark, 0, height / 2, 0, width, height, 0.22);
  const columns = Math.max(4, Math.floor(width / 0.11));
  const rows = Math.max(3, Math.floor(height / 0.07));
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = -width / 2 + (column + 0.5) * width / columns;
      const y = (row + 0.5) * height / rows;
      context.box(glass, x, y, 0.12, width / columns - 0.008, height / rows - 0.006, 0.025);
      context.box(white, x, y + height / rows * 0.12, 0.136, width / columns * 0.7, height / rows * 0.28, 0.003);
      context.box(aluminum, x, y - height / rows * 0.2, 0.145, width / columns * 0.32, 0.008, 0.015);
    }
  }
}

export function buildElectronicsBench(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, phase: number): Animation[] {
  const animations: Animation[] = [];
  const { aluminum, green, steel, yellow } = context.palette;
  context.box(materials.timber, 0, 0.9, 0, width, 0.045, 0.8);
  context.box(green, 0, 0.926, 0.06, width - 0.15, 0.004, 0.6);
  for (const x of [-width * 0.43, width * 0.43]) {
    for (const z of [-0.32, 0.32]) context.box(steel, x, 0.45, z, 0.035, 0.9, 0.035);
  }
  context.box(aluminum, 0, 0.38, -0.2, width - 0.1, 0.025, 0.4);
  context.box(steel, 0, 1.4, -0.38, width, 0.035, 0.2);
  for (const side of [-1, 1]) context.box(steel, side * width * 0.46, 1.1, -0.38, 0.025, 0.65, 0.025);
  animations.push(buildOscilloscope(context.at({ x: -width * 0.27, y: 0.93, z: -0.1 }), phase));
  animations.push(...buildSolderingStation(context.at({ x: width * 0.12, y: 0.93, z: -0.08 }), phase));
  animations.push(buildFumeExtractor(context.at({ x: width * 0.28, y: 0.93, z: -0.2 })));
  buildCircuitBoard(context.at({ x: 0, y: 0.93, z: 0.13 }), 0.2, 0.15, phase);
  buildPartsDrawers(context.at({ x: -width * 0.2, y: 1.42, z: -0.36 }), width * 0.5, 0.35);
  context.box(yellow, width * 0.36, 0.94, 0.24, 0.1, 0.015, 0.12);
  context.beam(aluminum, [width * 0.21, 0.94, 0.15], [width * 0.29, 0.94, 0.25], 0.004);
  return animations;
}

export function buildCableTestRack(context: ArchitectureContext, phase: number): Animation[] {
  const { steel, dark, aluminum, yellow, red, green } = context.palette;
  const animations: Animation[] = [];
  context.box(steel, 0, 0.8, -0.15, 0.55, 1.6, 0.08);
  for (const side of [-1, 1]) context.box(aluminum, side * 0.28, 0.8, 0, 0.035, 1.6, 0.38);
  for (let unit = 0; unit < 5; unit++) {
    const y = 0.25 + unit * 0.25;
    context.box(dark, 0, y, 0, 0.51, 0.2, 0.33);
    const display = buildDigitalNumber(context.at({ x: -0.1, y: y + 0.02, z: 0.18 }), 3, 0.02, unit % 2);
    animations.push(seconds => display.set(unit % 2 ? 12.1 + Math.sin(seconds + phase + unit) * 0.1 : 220 + unit * 3));
    for (let connector = 0; connector < 3; connector++) {
      const x = 0.07 + connector * 0.065;
      context.beam(connector === 0 ? red : connector === 1 ? yellow : green, [x, y - 0.02, 0.17], [x, y - 0.02, 0.19], 0.012);
      context.tube(connector === 0 ? red : dark, [[x, y - 0.02, 0.195], [x + 0.03, y - 0.13, 0.25], [x - 0.04, y - 0.17, 0.24]], 0.003);
    }
  }
  return animations;
}

export function buildTechnologyWorkshop(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, phase: number): Animation[] {
  const animations: Animation[] = [];
  const benchWidth = Math.min(2.2, width * 0.38);
  const back = -depth / 2 + 0.45;
  animations.push(...buildElectronicsBench(context.at({ x: -width * 0.24, y: 0, z: back }), materials, benchWidth, phase));
  buildOfficeDesk(context.at({ x: width * 0.25, y: 0, z: back }), materials, Math.min(1.6, width * 0.28));
  animations.push(...buildDesktopPrinter(context.at({ x: width * 0.25, y: 0.82, z: back }), phase));
  buildBenchMicroscope(context.at({ x: -width * 0.24 + benchWidth * 0.35, y: 0.93, z: back + 0.1 }));
  buildTaskChair(context.at({ x: -width * 0.24, y: 0, z: back + 0.9, yaw: Math.PI }), materials);
  if (depth > 3) {
    animations.push(...buildCableTestRack(context.at({ x: width * 0.38, y: 0, z: depth * 0.2 }), phase));
    buildOfficeDesk(context.at({ x: -width * 0.2, y: 0, z: depth * 0.25, yaw: Math.PI }), materials, 1.6);
    buildTaskChair(context.at({ x: -width * 0.2, y: 0, z: depth * 0.25 - 0.75 }), materials);
    buildPartsDrawers(context.at({ x: width * 0.08, y: 0.8, z: depth * 0.24 }), 0.8, 0.65);
  }
  return animations;
}
