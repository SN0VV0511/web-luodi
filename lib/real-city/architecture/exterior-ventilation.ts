import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import { buildFaceFastener, buildFoldedFlashing, buildInspectionCover } from "./exterior-fixings";

export function buildBirdMesh(context: ArchitectureContext, width: number, height: number, spacing = 0.045): void {
  const { steel, aluminum } = context.palette;
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, height / 2, 0, 0.016, height, 0.016);
    context.box(aluminum, 0, height / 2 + side * height / 2, 0, width, 0.016, 0.016);
  }
  const columns = Math.max(2, Math.ceil(width / spacing));
  const rows = Math.max(2, Math.ceil(height / spacing));
  for (let column = 1; column < columns; column++) {
    context.box(steel, -width / 2 + column * width / columns, height / 2, 0.008, 0.003, height - 0.012, 0.003);
  }
  for (let row = 1; row < rows; row++) {
    context.box(steel, 0, row * height / rows, 0.01, width - 0.012, 0.003, 0.003);
  }
}

export function buildWeatherLouverBlade(context: ArchitectureContext, width: number, depth: number, rise: number): void {
  const { aluminum, rubber } = context.palette;
  buildFoldedFlashing(context, width, [
    [-rise * 0.45, depth],
    [-rise * 0.45 + 0.012, depth - 0.018],
    [rise * 0.3, depth * 0.32],
    [rise * 0.4, depth * 0.22],
    [rise * 0.4 + 0.018, depth * 0.22],
    [rise * 0.4 + 0.018, depth * 0.12],
    [rise * 0.4, depth * 0.12],
    [rise * 0.45, 0],
  ], 0.003, aluminum);
  context.box(rubber, 0, -rise * 0.45 - 0.004, depth - 0.014, width - 0.01, 0.006, 0.008);
}

export function buildWeatherLouver(context: ArchitectureContext, width: number, height: number, depth = 0.14): void {
  const { aluminum, rubber, steel } = context.palette;
  const rows = Math.max(3, Math.ceil(height / 0.09));
  const pitch = height / rows;
  context.box(rubber, 0, height / 2, -0.025, width, height, 0.014);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * (width / 2 + 0.01), height / 2, depth / 2, 0.025, height + 0.045, depth + 0.035);
    context.box(aluminum, 0, height / 2 + side * height / 2, depth / 2, width + 0.045, 0.025, depth + 0.035);
  }
  for (let row = 0; row < rows; row++) {
    const y = (row + 0.5) * pitch;
    buildWeatherLouverBlade(context.at({ x: 0, y, z: 0 }), width, depth, pitch * 0.83);
  }
  const supports = width > 0.8 ? [-width * 0.25, width * 0.25] : [0];
  for (const x of supports) {
    context.box(steel, x, height / 2, depth * 0.2, 0.012, height, 0.035);
  }
  for (const side of [-1, 1]) {
    for (const y of [0.045, height - 0.045]) buildFaceFastener(context, side * (width / 2 + 0.012), y, depth + 0.021, 0.007);
  }
  buildFoldedFlashing(context.at({ x: 0, y: -0.012, z: 0 }), width + 0.045, [[0, 0], [-0.012, depth + 0.035], [-0.03, depth + 0.035]], 0.004);
}

export function buildAcousticVentBaffles(context: ArchitectureContext, width: number, height: number, depth: number): void {
  const { steel, aluminum, dark } = context.palette;
  const baffles = Math.max(3, Math.ceil(width / 0.14));
  const pitch = width / baffles;
  context.box(dark, 0, height / 2, -0.025, width, height, 0.02);
  for (let baffle = 0; baffle < baffles; baffle++) {
    const x = -width / 2 + (baffle + 0.5) * pitch;
    context.panel(steel, [[x - pitch * 0.18, 0, 0], [x + pitch * 0.15, 0, depth * 0.5], [x + pitch * 0.15, height, depth * 0.5], [x - pitch * 0.18, height, 0]]);
    context.panel(steel, [[x + pitch * 0.15, 0, depth * 0.5], [x - pitch * 0.18, 0, depth], [x - pitch * 0.18, height, depth], [x + pitch * 0.15, height, depth * 0.5]]);
    context.box(aluminum, x - pitch * 0.18, height / 2, depth, 0.012, height, 0.018);
    for (const y of [height * 0.2, height * 0.5, height * 0.8]) {
      context.box(dark, x + pitch * 0.02, y, depth * 0.7, 0.025, 0.006, 0.012);
    }
  }
}

export function buildFanSafetyGuard(context: ArchitectureContext, radius: number): void {
  const { steel, aluminum } = context.palette;
  for (const ringRadius of [radius * 0.28, radius * 0.56, radius * 0.82, radius]) {
    const points: [number, number, number][] = [];
    for (let point = 0; point <= 20; point++) {
      const angle = point * Math.PI * 2 / 20;
      points.push([Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius, 0]);
    }
    context.tube(steel, points, ringRadius === radius ? 0.005 : 0.003);
  }
  for (let spoke = 0; spoke < 6; spoke++) {
    const angle = spoke * Math.PI / 3;
    context.beam(aluminum, [0, 0, -0.005], [Math.cos(angle) * radius, Math.sin(angle) * radius, 0], 0.003);
  }
  for (const side of [-1, 1]) {
    buildFaceFastener(context, side * radius * 0.8, side * radius * 0.6, 0.008, 0.006);
  }
}

export function buildWallAxialExtractor(context: ArchitectureContext, radius = 0.18): Animation {
  const { aluminum, steel, dark, rubber } = context.palette;
  const size = radius * 2.45;
  context.box(rubber, 0, 0, -0.012, size + 0.025, size + 0.025, 0.02);
  context.box(aluminum, 0, 0, 0.025, size, size, 0.06);
  context.oval(dark, 0, 0, 0.059, radius, radius, 0.008);
  const sleeve = new THREE.CylinderGeometry(radius, radius, 0.12, 20, 1, true);
  sleeve.rotateX(Math.PI / 2);
  context.part(aluminum, context.geometry(sleeve), [0, 0, 0.075]);
  for (const side of [-1, 1]) {
    for (const vertical of [-1, 1]) buildFaceFastener(context, side * size * 0.41, vertical * size * 0.41, 0.061, 0.009, true);
  }
  const fan = context.moving("Facade axial ventilation impeller", [0, 0, 0.091], moving => {
    moving.oval(aluminum, 0, 0, 0, radius * 0.18, radius * 0.18, 0.028);
    for (let blade = 0; blade < 5; blade++) {
      const angle = blade * Math.PI * 2 / 5;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const transform = (x: number, y: number, z: number): [number, number, number] => [x * cosine - y * sine, x * sine + y * cosine, z];
      moving.panel(steel, [
        transform(radius * 0.15, -radius * 0.04, 0.005),
        transform(radius * 0.84, -radius * 0.18, -0.02),
        transform(radius * 0.88, radius * 0.15, 0.022),
        transform(radius * 0.19, radius * 0.12, 0.015),
      ]);
    }
  });
  buildFanSafetyGuard(context.at({ x: 0, y: 0, z: 0.145 }), radius + 0.005);
  let speed = 0;
  let angle = 0;
  let lastTime = -Infinity;
  return (seconds, night, season) => {
    const target = (season === "summer" ? 13 : season === "winter" ? 3.5 : 8) * (night ? 0.5 : 1);
    const dt = Number.isFinite(lastTime) && seconds >= lastTime ? Math.min(0.2, seconds - lastTime) : 0;
    if (!Number.isFinite(lastTime) || seconds < lastTime) {
      speed = target;
      angle = seconds * target;
    } else {
      speed += (target - speed) * Math.min(1, dt * 1.8);
      angle += speed * dt;
    }
    lastTime = seconds;
    fan.rotation.z = angle % (Math.PI * 2);
  };
}

export function buildHingedVentAccess(context: ArchitectureContext, width: number, height: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(rubber, 0, height / 2, 0, width + 0.035, height + 0.035, 0.025);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, height / 2, 0.02, 0.025, height, 0.04);
    context.box(aluminum, 0, height / 2 + side * height / 2, 0.02, width + 0.025, 0.025, 0.04);
  }
  buildBirdMesh(context.at({ x: 0, y: 0.02, z: 0.035 }), width - 0.04, height - 0.04, 0.05);
  for (const y of [height * 0.2, height * 0.8]) {
    context.box(steel, -width / 2 - 0.012, y, 0.025, 0.035, 0.065, 0.045);
    context.disc(aluminum, -width / 2 - 0.016, y, 0.048, 0.009, 0.065);
    buildFaceFastener(context, -width / 2 + 0.018, y, 0.051, 0.006);
  }
  context.box(aluminum, width / 2 - 0.02, height * 0.5, 0.064, 0.022, 0.08, 0.025);
  context.box(rubber, width / 2 - 0.02, height * 0.5, 0.079, 0.007, 0.03, 0.006);
}

export function buildDuctCorner(context: ArchitectureContext, width: number, height: number, projection: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(aluminum, -width / 2, height / 2, projection / 2, 0.015, height, projection);
  context.box(aluminum, width / 2, height / 2, projection / 2, 0.015, height, projection);
  context.box(aluminum, 0, height, projection / 2, width, 0.015, projection);
  context.box(aluminum, 0, height / 2, projection, width, height, 0.015);
  context.box(rubber, 0, height / 2, 0.008, width + 0.025, height + 0.025, 0.018);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * (width / 2 + 0.018), height / 2, 0.018, 0.025, height + 0.055, 0.025);
    for (const y of [0.035, height - 0.035]) buildFaceFastener(context, side * (width / 2 + 0.018), y, 0.034, 0.007);
  }
  context.box(aluminum, 0, -0.008, projection / 2, width + 0.025, 0.016, projection + 0.025);
}

export function buildWallVentilationAssembly(context: ArchitectureContext, variant: number): Animation[] {
  const animations: Animation[] = [];
  if (variant % 3 === 0) {
    buildWeatherLouver(context, 0.52, 0.42, 0.13);
    buildBirdMesh(context.at({ x: 0, y: 0.018, z: 0.01 }), 0.49, 0.38, 0.065);
  } else if (variant % 3 === 1) {
    animations.push(buildWallAxialExtractor(context.at({ x: 0, y: 0.21, z: 0.02 }), 0.175));
    buildFoldedFlashing(context.at({ x: 0, y: 0.45, z: 0.02 }), 0.55, [[0.035, 0], [0.01, 0.2], [-0.02, 0.21]], 0.004);
  } else {
    buildDuctCorner(context, 0.48, 0.4, 0.16);
    buildAcousticVentBaffles(context.at({ x: 0, y: 0.02, z: 0.172 }), 0.44, 0.36, 0.1);
    buildHingedVentAccess(context.at({ x: 0, y: 0.008, z: 0.28 }), 0.49, 0.39);
    buildInspectionCover(context.at({ x: 0, y: 0.2, z: 0.171 }), 0.16, 0.11, 0.008);
  }
  return animations;
}
