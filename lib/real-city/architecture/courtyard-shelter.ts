import * as THREE from "three";
import { sampleEarthWind } from "../../city-physics";
import { ArchitectureContext, type Animation, type Point } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDigitalNumber, buildNeedleMeter } from "./display-instruments";

function bicycleWheel(context: ArchitectureContext, x: number, y: number, z: number, radius: number): void {
  const { rubber, aluminum, steel } = context.palette;
  const tire = context.geometry(new THREE.TorusGeometry(radius, 0.024, 5, 24));
  tire.rotateY(Math.PI / 2);
  const rim = context.geometry(new THREE.TorusGeometry(radius - 0.026, 0.009, 4, 24));
  rim.rotateY(Math.PI / 2);
  context.part(rubber, tire, [x, y, z]);
  context.part(aluminum, rim, [x, y, z]);
  context.beam(steel, [x - 0.055, y, z], [x + 0.055, y, z], 0.018);
  for (let spoke = 0; spoke < 12; spoke++) {
    const angle = spoke / 12 * Math.PI * 2;
    const side = spoke % 2 ? 1 : -1;
    const rimY = y + Math.sin(angle) * (radius - 0.03);
    const rimZ = z + Math.cos(angle) * (radius - 0.03);
    context.beam(aluminum, [x + side * 0.035, y, z], [x, rimY, rimZ], 0.0025);
  }
  const reflector = context.at({ x, y: y + radius * 0.43, z: z + radius * 0.42 });
  reflector.box(context.palette.yellow, 0, 0, 0, 0.015, 0.055, 0.045);
}

function buildBicycleDrive(context: ArchitectureContext, bottom: Point, rear: Point): void {
  const { aluminum, steel, rubber, dark } = context.palette;
  const chainX = bottom[0] - 0.065;
  const sprocket = context.geometry(new THREE.TorusGeometry(0.085, 0.008, 4, 16));
  sprocket.rotateY(Math.PI / 2);
  context.part(aluminum, sprocket, [chainX, bottom[1], bottom[2]]);
  const rearSprocket = context.geometry(new THREE.TorusGeometry(0.045, 0.008, 4, 14));
  rearSprocket.rotateY(Math.PI / 2);
  context.part(steel, rearSprocket, [chainX, rear[1], rear[2]]);
  context.tube(dark, [
    [chainX, bottom[1] + 0.085, bottom[2]],
    [chainX, rear[1] + 0.045, rear[2]],
    [chainX, rear[1], rear[2] + 0.045],
    [chainX, rear[1] - 0.045, rear[2]],
    [chainX, bottom[1] - 0.085, bottom[2]],
    [chainX, bottom[1], bottom[2] - 0.085],
  ], 0.004, true);
  context.beam(aluminum, [bottom[0] - 0.13, bottom[1], bottom[2]], [bottom[0] + 0.13, bottom[1], bottom[2]], 0.011);
  for (const side of [-1, 1]) {
    const x = bottom[0] + side * 0.13;
    const pedalY = bottom[1] + side * 0.095;
    const pedalZ = bottom[2] - side * 0.07;
    context.beam(aluminum, [x, bottom[1], bottom[2]], [x, pedalY, pedalZ], 0.011);
    context.box(rubber, x + side * 0.04, pedalY, pedalZ, 0.09, 0.022, 0.07);
    context.box(context.palette.yellow, x + side * 0.04, pedalY + 0.004, pedalZ + 0.037, 0.05, 0.01, 0.004);
  }
}

function buildBicycleAccessories(context: ArchitectureContext, adult: boolean): void {
  const { steel, aluminum, rubber, dark, red, white } = context.palette;
  const rearZ = 0.53;
  context.box(steel, 0, 0.72, rearZ, 0.25, 0.025, 0.4);
  for (const x of [-0.1, 0.1]) {
    context.beam(steel, [x, 0.72, rearZ + 0.16], [x, 0.36, rearZ], 0.008);
    context.beam(steel, [x, 0.72, rearZ - 0.13], [x, 0.53, 0.17], 0.008);
  }
  context.box(red, 0, 0.69, rearZ + 0.22, 0.055, 0.035, 0.018);
  const rearGuard: Point[] = [];
  const frontGuard: Point[] = [];
  for (let step = 0; step <= 12; step++) {
    const angle = 0.2 + step / 12 * Math.PI * 0.9;
    rearGuard.push([0, 0.36 + Math.sin(angle) * 0.365, rearZ + Math.cos(angle) * 0.365]);
    frontGuard.push([0, 0.36 + Math.sin(angle) * 0.365, -0.54 + Math.cos(angle) * 0.365]);
  }
  context.tube(steel, rearGuard, 0.017);
  context.tube(steel, frontGuard, 0.017);
  context.beam(aluminum, [-0.025, 0.29, 0.02], [-0.19, 0.035, 0.12], 0.009);
  context.box(rubber, -0.19, 0.027, 0.12, 0.055, 0.018, 0.035);
  context.box(dark, 0, 1.04, -0.56, 0.08, 0.05, 0.065);
  context.box(white, 0, 1.04, -0.597, 0.055, 0.035, 0.01);
  if (adult) {
    const basket = context.at({ x: 0, y: 0.94, z: -0.69 });
    basket.box(steel, 0, 0, 0, 0.32, 0.018, 0.24);
    for (const side of [-1, 1]) {
      basket.box(steel, side * 0.16, 0.1, 0, 0.012, 0.2, 0.24);
      for (let wire = 0; wire < 5; wire++) {
        const x = -0.13 + wire * 0.065;
        basket.box(steel, x, 0.1, side * 0.12, 0.006, 0.2, 0.006);
      }
      basket.box(steel, 0, 0.2, side * 0.12, 0.33, 0.012, 0.012);
    }
  }
}

export function buildParkedBicycle(context: ArchitectureContext, variant: number): void {
  const { aluminum, steel, green, red, dark, rubber } = context.palette;
  const frame = variant % 2 ? red : green;
  const bottom: Point = [0, 0.32, 0.03];
  const rear: Point = [0, 0.36, 0.53];
  const front: Point = [0, 0.36, -0.54];
  const saddle: Point = [0, 0.84, 0.12];
  const headLower: Point = [0, 0.66, -0.37];
  const headUpper: Point = [0, 0.89, -0.33];
  bicycleWheel(context, 0, rear[1], rear[2], 0.34);
  bicycleWheel(context, 0, front[1], front[2], 0.34);
  context.beam(frame, bottom, saddle, 0.022);
  context.beam(frame, bottom, headLower, 0.026);
  context.beam(frame, saddle, headUpper, 0.021);
  context.beam(frame, headLower, headUpper, 0.025);
  for (const side of [-1, 1]) {
    context.beam(frame, [side * 0.025, saddle[1] - 0.03, saddle[2]], [side * 0.055, rear[1], rear[2]], 0.012);
    context.beam(frame, [side * 0.025, bottom[1], bottom[2]], [side * 0.055, rear[1], rear[2]], 0.014);
    context.tube(steel, [[side * 0.035, headLower[1], headLower[2]], [side * 0.045, 0.48, -0.48], [side * 0.055, front[1], front[2]]], 0.014);
  }
  context.beam(aluminum, saddle, [0, 0.95, 0.14], 0.014);
  context.roundedBox(rubber, 0, 0.97, 0.17, 0.18, 0.04, 0.27, 0.035);
  context.beam(aluminum, headUpper, [0, 1.09, -0.36], 0.014);
  context.tube(aluminum, [[-0.28, 1.08, -0.31], [-0.18, 1.1, -0.4], [0, 1.09, -0.4], [0.18, 1.1, -0.4], [0.28, 1.08, -0.31]], 0.013);
  for (const side of [-1, 1]) {
    context.beam(rubber, [side * 0.19, 1.09, -0.36], [side * 0.29, 1.08, -0.31], 0.018);
    context.beam(aluminum, [side * 0.19, 1.08, -0.39], [side * 0.27, 1.045, -0.4], 0.006);
    context.tube(dark, [[side * 0.19, 1.08, -0.39], [side * 0.14, 0.96, -0.54], [side * 0.04, 0.75, -0.4]], 0.003);
  }
  buildBicycleDrive(context, bottom, rear);
  buildBicycleAccessories(context, variant % 3 === 0);
  context.tube(rubber, [[-0.04, 0.74, 0.12], [-0.18, 0.7, 0.2], [-0.14, 0.43, 0.26], [0.06, 0.5, 0.14]], 0.014);
}

function buildShelterFoundation(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): void {
  const { concrete, steel, aluminum } = context.palette;
  context.box(materials.terrazzo, 0, 0.025, 0, width + 0.2, 0.05, depth + 0.15);
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const x = side * (width / 2 - 0.12);
      const z = end * (depth / 2 - 0.12);
      context.box(concrete, x, 0.02, z, 0.28, 0.08, 0.28);
      context.box(steel, x, 0.071, z, 0.2, 0.025, 0.2);
      for (const dx of [-0.065, 0.065]) {
        for (const dz of [-0.065, 0.065]) context.disc(aluminum, x + dx, 0.092, z + dz, 0.01, 0.025);
      }
    }
  }
}

function buildBicycleShelterFrame(context: ArchitectureContext, width: number, depth: number, height: number): void {
  const { steel, aluminum, glass, rubber } = context.palette;
  const frontHeight = height + 0.13;
  const rearHeight = height - 0.13;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.12);
    context.box(steel, x, frontHeight / 2, depth / 2 - 0.12, 0.065, frontHeight, 0.065);
    context.box(steel, x, rearHeight / 2, -depth / 2 + 0.12, 0.065, rearHeight, 0.065);
    context.rectangularBeam(steel, [x, rearHeight, -depth / 2 - 0.1], [x, frontHeight, depth / 2 + 0.1], 0.075, 0.1);
    context.box(aluminum, x, 1.05, -depth / 2 + 0.1, 0.12, 1.9, 0.035);
    for (const y of [0.14, 1.05, rearHeight - 0.12]) {
      context.box(aluminum, x, y, -depth / 2 + 0.065, 0.14, 0.075, 0.045);
    }
  }
  context.box(steel, 0, rearHeight, -depth / 2 + 0.1, width, 0.07, 0.07);
  context.box(steel, 0, frontHeight, depth / 2 - 0.1, width, 0.07, 0.07);
  context.box(glass, 0, 1.07, -depth / 2 + 0.09, width - 0.25, 1.9, 0.018);
  context.box(rubber, 0, 0.12, -depth / 2 + 0.065, width - 0.25, 0.015, 0.02);
  const panels = Math.max(2, Math.ceil(width / 0.9));
  for (let panel = 0; panel < panels; panel++) {
    const x0 = -width / 2 + panel * width / panels;
    const x1 = x0 + width / panels;
    context.panel(glass, [[x0 + 0.01, rearHeight + 0.04, -depth / 2 - 0.12], [x1 - 0.01, rearHeight + 0.04, -depth / 2 - 0.12], [x1 - 0.01, frontHeight + 0.04, depth / 2 + 0.12], [x0 + 0.01, frontHeight + 0.04, depth / 2 + 0.12]]);
    context.rectangularBeam(aluminum, [x0, rearHeight + 0.045, -depth / 2 - 0.12], [x0, frontHeight + 0.045, depth / 2 + 0.12], 0.025, 0.035);
  }
  context.box(aluminum, 0, rearHeight - 0.04, -depth / 2 - 0.15, width + 0.15, 0.025, 0.12);
  context.box(aluminum, 0, rearHeight + 0.005, -depth / 2 - 0.2, width + 0.15, 0.1, 0.018);
  context.box(aluminum, width / 2 - 0.08, rearHeight / 2, -depth / 2 - 0.16, 0.045, rearHeight, 0.045);
  context.box(rubber, width / 2 - 0.08, 0.07, -depth / 2 - 0.16, 0.07, 0.12, 0.07);
}

function buildWheelStand(context: ArchitectureContext): void {
  const { steel, aluminum } = context.palette;
  const points: Point[] = [[-0.065, 0.04, 0.31], [-0.065, 0.47, 0.14], [0, 0.54, 0.11], [0.065, 0.47, 0.14], [0.065, 0.04, 0.31]];
  context.tube(steel, points, 0.014);
  context.tube(steel, [[-0.065, 0.04, -0.31], [-0.065, 0.47, -0.14], [0, 0.54, -0.11], [0.065, 0.47, -0.14], [0.065, 0.04, -0.31]], 0.014);
  for (const z of [-0.31, 0.31]) {
    context.box(aluminum, 0, 0.025, z, 0.24, 0.035, 0.08);
    for (const x of [-0.09, 0.09]) context.disc(steel, x, 0.05, z, 0.008, 0.012);
  }
}

function buildPumpRepairStation(context: ArchitectureContext): Animation[] {
  const { steel, green, aluminum, rubber, dark } = context.palette;
  context.box(steel, 0, 0.03, 0, 0.42, 0.06, 0.36);
  context.box(green, 0, 0.65, 0, 0.16, 1.25, 0.18);
  context.box(aluminum, 0, 1.28, 0, 0.21, 0.04, 0.22);
  context.box(rubber, 0, 1.31, 0.16, 0.3, 0.03, 0.28);
  context.box(steel, 0, 1.31, 0.3, 0.32, 0.06, 0.035);
  context.box(steel, 0.2, 0.29, 0, 0.08, 0.55, 0.08);
  const handle = context.moving("Bicycle service pump handle", [0.2, 0.55, 0], moving => {
    moving.disc(aluminum, 0, 0.09, 0, 0.011, 0.18);
    moving.box(rubber, 0, 0.19, 0, 0.24, 0.025, 0.03);
  });
  const rest = handle.position.clone();
  context.tube(rubber, [[0.24, 0.1, 0.03], [0.38, 0.07, 0.12], [0.44, 0.2, 0.15], [0.34, 0.58, 0.13], [0.13, 0.68, 0.12]], 0.009);
  context.box(aluminum, 0.13, 0.68, 0.12, 0.055, 0.02, 0.025);
  for (let tool = 0; tool < 3; tool++) {
    const x = -0.07 + tool * 0.07;
    context.tube(dark, [[x, 1.1, 0.1], [x - 0.025, 0.78, 0.17], [x, 0.61, 0.13]], 0.003);
    context.box(aluminum, x, 0.55, 0.13, 0.018, 0.13, 0.009);
    context.box(aluminum, x, 0.49, 0.13, 0.045, 0.02, 0.01);
  }
  context.label("CYCLE REPAIR", 0, 0.97, 0.096, 0.13, 0.07, "#e1e4d6", "#3c6657");
  const sensor = context.doorSensor([0, 0, 0.4], 0.8, 0.6);
  let pressure = 0.15;
  const meter = buildNeedleMeter(context.at({ x: 0.2, y: 0.24, z: 0.055 }), 0.075, 0.03, () => pressure);
  let previous = -1;
  let stroke = 0;
  let direction = -1;
  return [
    seconds => {
      const dt = previous < 0 ? 0 : Math.min(0.08, Math.max(0, seconds - previous));
      previous = seconds;
      const use = sensor(seconds) > 0.5;
      if (use) {
        stroke += direction * dt * 0.3;
        if (stroke < -0.15) { stroke = -0.15; direction = 1; pressure = Math.min(0.8, pressure + 0.035); }
        if (stroke > 0) { stroke = 0; direction = -1; }
      } else stroke += Math.min(-stroke, dt * 0.08);
      pressure = Math.max(0.15, pressure - dt * 0.002);
      handle.position.copy(rest);
      handle.position.y += stroke;
    },
    meter,
  ];
}

function buildShelterSolarLight(context: ArchitectureContext, width: number, height: number): Animation {
  const { steel, reflectiveGlass, aluminum, warmLight } = context.palette;
  context.box(steel, 0, height + 0.095, -0.05, 0.84, 0.045, 0.5);
  context.box(reflectiveGlass, 0, height + 0.124, -0.05, 0.79, 0.012, 0.46);
  for (let cell = 1; cell < 6; cell++) context.box(aluminum, -0.4 + cell * 0.8 / 6, height + 0.132, -0.05, 0.003, 0.003, 0.45);
  context.box(steel, width / 2 - 0.14, 1.65, -0.71, 0.22, 0.3, 0.12);
  context.box(aluminum, 0, height - 0.08, -0.22, width * 0.72, 0.055, 0.07);
  const light = context.moving("Bicycle shelter presence lighting", [0, height - 0.115, -0.22], moving => {
    moving.box(warmLight, 0, 0, 0, width * 0.69, 0.014, 0.045);
  });
  const sense = context.doorSensor([0, 0, 0.2], width * 0.65, 9);
  let battery = 0.75;
  let previous = -1;
  return (seconds, night) => {
    const dt = previous < 0 ? 0 : Math.min(0.2, Math.max(0, seconds - previous));
    previous = seconds;
    const occupied = sense(seconds) > 0.1;
    const powered = night && occupied && battery > 0.08;
    battery = THREE.MathUtils.clamp(battery + dt * (night ? powered ? -0.0001 : -0.00001 : 0.00025), 0, 1);
    light.visible = powered;
  };
}

export function buildCourtyardBicycleShelter(context: ArchitectureContext, materials: ArchitecturalMaterials, variant: number): Animation[] {
  const width = 4.15;
  const depth = 1.75;
  const height = 2.27;
  buildShelterFoundation(context, materials, width, depth);
  buildBicycleShelterFrame(context, width, depth, height);
  for (let slot = 0; slot < 4; slot++) {
    const x = -1.2 + slot * 0.8;
    buildWheelStand(context.at({ x, y: 0.05, z: -0.25 }));
    if (slot === 1 || slot === 3) buildParkedBicycle(context.at({ x, y: 0.055, z: -0.06, yaw: slot % 2 ? 0.04 : -0.04 }), variant + slot);
    context.label(String(slot + 1).padStart(2, "0"), x, 0.32, -depth / 2 + 0.105, 0.14, 0.075);
  }
  const animations = buildPumpRepairStation(context.at({ x: -width / 2 - 0.32, y: 0.05, z: 0.15 }));
  animations.push(buildShelterSolarLight(context, width, height));
  return animations;
}
