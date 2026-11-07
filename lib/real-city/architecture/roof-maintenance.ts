import * as THREE from "three";
import { sampleEarthWind } from "../../city-physics";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildAnchorPlate, buildClevis, buildTensionRod } from "./entrance-details";
import { buildDigitalNumber } from "./display-instruments";

export function buildRoofCageLadder(context: ArchitectureContext, height: number): void {
  const { steel, aluminum, yellow } = context.palette;
  for (const side of [-1, 1]) {
    context.box(steel, side * 0.24, height / 2, 0, 0.035, height, 0.05);
    context.tube(aluminum, [[side * 0.24, height - 0.1, 0], [side * 0.24, height + 0.6, 0], [side * 0.24, height + 0.72, -0.2], [side * 0.24, height + 0.55, -0.35]], 0.018);
    for (const y of [0.2, height * 0.5, height - 0.2]) {
      context.box(steel, side * 0.24, y, -0.1, 0.03, 0.05, 0.2);
      buildAnchorPlate(context.at({ x: side * 0.24, y, z: -0.2 }), 0.1, 0.12);
    }
  }
  const rungs = Math.max(4, Math.ceil(height / 0.28));
  for (let rung = 0; rung < rungs; rung++) {
    const y = 0.14 + rung * (height - 0.28) / Math.max(1, rungs - 1);
    context.beam(aluminum, [-0.24, y, 0], [0.24, y, 0], 0.012);
    for (let grip = 0; grip < 9; grip++) context.box(steel, -0.18 + grip * 0.045, y + 0.012, 0, 0.012, 0.003, 0.02);
  }
  if (height > 2.2) {
    const cages = Math.max(2, Math.ceil((height - 1.4) / 0.6));
    for (let cage = 0; cage < cages; cage++) {
      const y = 1.4 + cage * (height - 1.1) / Math.max(1, cages - 1);
      const points: [number, number, number][] = [];
      for (let arc = 0; arc <= 12; arc++) {
        const angle = Math.PI + arc / 12 * Math.PI;
        points.push([Math.cos(angle) * 0.37, y, -Math.sin(angle) * 0.37]);
      }
      context.tube(steel, points, 0.008);
    }
    for (const angle of [Math.PI * 1.15, Math.PI * 1.5, Math.PI * 1.85]) {
      context.beam(steel, [Math.cos(angle) * 0.37, 1.4, -Math.sin(angle) * 0.37], [Math.cos(angle) * 0.37, height + 0.3, -Math.sin(angle) * 0.37], 0.008);
    }
  }
  context.box(yellow, 0, 1.08, 0.05, 0.42, 0.025, 0.025);
}

export function buildDavitBase(context: ArchitectureContext): void {
  const { steel, concrete, aluminum } = context.palette;
  context.box(concrete, 0, 0.075, 0, 0.6, 0.15, 0.6);
  context.box(steel, 0, 0.17, 0, 0.38, 0.04, 0.38);
  for (const x of [-0.14, 0.14]) {
    for (const z of [-0.14, 0.14]) {
      context.disc(aluminum, x, 0.2, z, 0.018, 0.04);
      context.disc(steel, x, 0.23, z, 0.022, 0.018);
    }
  }
  context.disc(steel, 0, 0.36, 0, 0.095, 0.34);
  context.disc(aluminum, 0, 0.54, 0, 0.11, 0.04);
  context.disc(steel, 0, 0.57, 0, 0.07, 0.05);
}

export function buildDavitArm(context: ArchitectureContext, reach: number): void {
  const { steel, aluminum, yellow } = context.palette;
  context.box(steel, 0, 1.13, 0, 0.1, 1.15, 0.12);
  context.rectangularBeam(steel, [0, 1.65, -0.35], [0, 1.45, reach], 0.09, 0.13);
  context.rectangularBeam(steel, [0, 0.84, 0], [0, 1.48, reach * 0.68], 0.055, 0.055);
  context.box(yellow, 0, 1.47, reach - 0.05, 0.12, 0.15, 0.24);
  context.beam(aluminum, [-0.08, 1.47, reach], [0.08, 1.47, reach], 0.06);
  context.beam(steel, [-0.085, 1.47, reach], [0.085, 1.47, reach], 0.012);
  buildClevis(context.at({ x: 0, y: 1.66, z: -0.3 }), 0.045);
  buildTensionRod(context, [0, 1.67, -0.3], [0, 1.45, reach * 0.7]);
  context.box(steel, 0, 1.5, -0.46, 0.25, 0.12, 0.38);
  for (let weight = 0; weight < 3; weight++) context.box(context.palette.concrete, 0, 1.59 + weight * 0.05, -0.46, 0.29, 0.045, 0.35);
}

function buildFacadeCradle(context: ArchitectureContext, width: number): THREE.Group {
  const { steel, aluminum, dark, yellow } = context.palette;
  return context.moving("Facade maintenance suspended cradle", [0, -1.1, 0], moving => {
    moving.box(aluminum, 0, 0, 0, width, 0.06, 0.65);
    moving.box(dark, 0, 0.035, 0, width - 0.05, 0.01, 0.58);
    for (let tread = 0; tread < 18; tread++) moving.box(aluminum, -width / 2 + (tread + 0.5) * width / 18, 0.043, 0, 0.025, 0.004, 0.55);
    for (const x of [-width / 2, width / 2]) {
      for (const z of [-0.3, 0.3]) moving.box(steel, x, 0.55, z, 0.035, 1.1, 0.035);
      moving.box(aluminum, x, 1.08, 0, 0.04, 0.04, 0.64);
      moving.box(aluminum, x, 0.6, 0, 0.025, 0.025, 0.6);
      moving.box(yellow, x, 0.18, 0, 0.06, 0.26, 0.65);
      moving.box(steel, x, 0.45, -0.1, 0.2, 0.35, 0.22);
      moving.beam(aluminum, [x - 0.11, 0.5, -0.1], [x + 0.11, 0.5, -0.1], 0.08);
    }
    for (const side of [-1, 1]) {
      moving.box(aluminum, 0, 1.08, side * 0.3, width, 0.04, 0.04);
      moving.box(aluminum, 0, 0.6, side * 0.3, width, 0.025, 0.025);
      moving.box(yellow, 0, 0.13, side * 0.31, width, 0.2, 0.02);
    }
    moving.box(dark, width * 0.33, 0.85, 0.26, 0.16, 0.2, 0.07);
    moving.box(context.palette.green, width * 0.3, 0.88, 0.305, 0.035, 0.035, 0.012);
    moving.box(context.palette.red, width * 0.37, 0.88, 0.305, 0.035, 0.035, 0.012);
    for (const side of [-1, 1]) moving.beam(dark, [side * width * 0.4, 0.24, -0.36], [side * width * 0.4, 0.24, -0.42], 0.065);
  });
}

export function buildFacadeMaintenanceRig(context: ArchitectureContext, buildingHeight: number, phase: number): Animation {
  const { steel, aluminum } = context.palette;
  const width = 1.8;
  const reach = 1.65;
  for (const side of [-1, 1]) {
    const davit = context.at({ x: side * width / 2, y: 0, z: 0 });
    buildDavitBase(davit);
    buildDavitArm(davit, reach);
  }
  const cradleContext = context.at({ x: 0, y: 0, z: reach });
  const cradle = buildFacadeCradle(cradleContext, width);
  const cradleBase = cradle.position.clone();
  const ropes: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    for (const rope of [-1, 1]) {
      ropes.push(context.moving("Facade cradle suspension rope", [side * width / 2 + rope * 0.025, 1.43, reach], moving => {
        moving.disc(steel, 0, -0.5, 0, 0.003, 1);
      }));
    }
  }
  context.box(aluminum, -width / 2 - 0.2, 0.5, -0.2, 0.18, 0.28, 0.12);
  let elevation = -1.1;
  let verticalVelocity = 0;
  let sway = 0;
  let angularVelocity = 0;
  let previous = 0;
  return (seconds, night, season) => {
    const delta = Math.max(0, Math.min(0.1, seconds - previous));
    previous = seconds;
    const wind = sampleEarthWind(seconds, context.local.x, context.local.z, season);
    const windSpeed = Math.hypot(wind.x, wind.z);
    const safeToOperate = !night && season !== "winter" && windSpeed < 6;
    const cycle = (Math.sin(seconds * 0.007 + phase) + 1) / 2;
    const target = safeToOperate ? -1.1 - cycle * Math.max(0, buildingHeight - 7) : -1.1;
    const desiredVelocity = THREE.MathUtils.clamp((target - elevation) * 0.15, -0.14, 0.14);
    verticalVelocity += (desiredVelocity - verticalVelocity) * (1 - Math.exp(-delta * 1.5));
    elevation += verticalVelocity * delta;
    const suspendedLength = Math.max(1, 1.43 - elevation);
    angularVelocity += (wind.x * 0.0009 - sway * 9.80665 / suspendedLength - angularVelocity * 0.45) * delta;
    sway += angularVelocity * delta;
    cradle.position.copy(cradleBase);
    cradle.position.y = context.local.y + elevation;
    cradle.rotation.z = sway;
    for (const rope of ropes) rope.scale.y = Math.max(0.15, 1.43 - elevation - 0.6);
  };
}

export function buildWeatherMast(context: ArchitectureContext, phase: number): Animation[] {
  const { aluminum, steel, white, dark, red } = context.palette;
  const height = 2.2;
  context.disc(aluminum, 0, height / 2, 0, 0.022, height);
  context.box(steel, 0, 0.02, 0, 0.3, 0.04, 0.3);
  for (const side of [-1, 1]) {
    context.beam(steel, [0, height * 0.72, 0], [side * 0.45, 0.05, 0.15], 0.006);
    context.box(steel, side * 0.45, 0.025, 0.15, 0.12, 0.05, 0.12);
  }
  context.beam(aluminum, [-0.4, 1.5, 0], [0.4, 1.5, 0], 0.015);
  for (let plate = 0; plate < 7; plate++) context.disc(white, -0.3, 1.25 + plate * 0.034, 0, 0.08, 0.018);
  context.disc(white, -0.3, 1.5, 0, 0.09, 0.025);
  context.disc(white, 0.3, 1.63, 0, 0.07, 0.23);
  const funnel = context.geometry(new THREE.ConeGeometry(0.075, 0.1, 16, 1, true));
  funnel.rotateX(Math.PI);
  context.part(white, funnel, [0.3, 1.78, 0]);
  const anemometer = context.moving("Rooftop cup anemometer", [0, height, 0], moving => {
    for (let arm = 0; arm < 3; arm++) {
      const angle = arm * Math.PI * 2 / 3;
      const x = Math.cos(angle) * 0.17;
      const z = Math.sin(angle) * 0.17;
      moving.beam(steel, [0, 0, 0], [x, 0, z], 0.004);
      moving.oval(dark, x, 0, z, 0.045, 0.035, 0.045);
    }
  });
  const vane = context.moving("Rooftop weather vane", [0, 1.95, 0], moving => {
    moving.box(aluminum, 0, 0, 0, 0.42, 0.012, 0.012);
    moving.box(red, -0.15, 0.02, 0, 0.12, 0.1, 0.008);
    moving.box(aluminum, 0.19, 0, 0, 0.06, 0.035, 0.012);
  });
  let rotation = phase;
  let bearing = 0;
  let previous = 0;
  const screen = buildDigitalNumber(context.at({ x: 0.03, y: 0.9, z: 0.055 }), 3, 0.022, 1);
  return [(seconds, _night, season) => {
    const delta = Math.max(0, Math.min(0.15, seconds - previous));
    previous = seconds;
    const wind = sampleEarthWind(seconds, context.local.x, context.local.z, season);
    const speed = Math.hypot(wind.x, wind.z);
    rotation += speed * delta * 3.4;
    const target = Math.atan2(wind.z, wind.x);
    const difference = Math.atan2(Math.sin(target - bearing), Math.cos(target - bearing));
    bearing += difference * (1 - Math.exp(-delta * 1.3));
    anemometer.rotation.y = rotation;
    vane.rotation.y = -bearing;
    screen.set(speed);
  }];
}

export function buildSatelliteDish(context: ArchitectureContext, radius: number, yaw: number): void {
  const { white, aluminum, steel, dark } = context.palette;
  const position = context.at({ x: 0, y: 0, z: 0, yaw });
  position.box(steel, 0, 0.025, 0, radius * 0.75, 0.05, radius * 0.75);
  position.disc(aluminum, 0, 0.32, 0, 0.025, 0.6);
  const points: THREE.Vector2[] = [];
  for (let ring = 0; ring <= 16; ring++) {
    const r = ring / 16 * radius;
    points.push(new THREE.Vector2(r, r * r / (radius * 2.2)));
  }
  const geometry = position.geometry(new THREE.LatheGeometry(points, 24));
  geometry.rotateX(Math.PI * 0.32);
  position.part(white, geometry, [0, 0.7, 0]);
  position.beam(aluminum, [0, 0.48, -0.05], [0, 0.68, radius * 0.7], 0.014);
  position.beam(aluminum, [0, 0.68, radius * 0.7], [0, 0.9, radius * 0.78], 0.014);
  position.box(dark, 0, 0.9, radius * 0.78, 0.055, 0.045, 0.1);
  position.tube(dark, [[0, 0.9, radius * 0.78], [0.02, 0.68, radius * 0.7], [0.03, 0.42, 0], [0.03, 0.05, -0.12]], 0.004);
}

export function buildTelecomCabinet(context: ArchitectureContext): void {
  const { white, aluminum, steel, dark, green } = context.palette;
  context.box(white, 0, 0.72, 0, 0.65, 1.35, 0.4);
  context.box(aluminum, 0, 1.42, 0.015, 0.72, 0.045, 0.48);
  context.box(steel, 0, 0.045, 0, 0.7, 0.09, 0.46);
  context.box(aluminum, 0.25, 0.75, 0.215, 0.02, 0.18, 0.025);
  for (const y of [0.23, 1.18]) {
    for (let grille = 0; grille < 8; grille++) context.box(dark, -0.2 + grille * 0.057, y, 0.206, 0.018, 0.13, 0.004);
  }
  context.box(green, -0.2, 0.93, 0.213, 0.012, 0.012, 0.004);
  for (const side of [-1, 1]) context.tube(dark, [[side * 0.2, 0.1, -0.18], [side * 0.2, 0.08, -0.32], [side * 0.2, 0.05, -0.55]], 0.015);
}

export function buildRoofPipeBridge(context: ArchitectureContext, width: number, length: number): void {
  const { steel, aluminum, yellow } = context.palette;
  const height = 0.48;
  context.box(steel, 0, height, 0, width, 0.045, length);
  const bars = Math.max(5, Math.ceil(length / 0.08));
  for (let bar = 0; bar < bars; bar++) context.box(aluminum, 0, height + 0.027, -length / 2 + (bar + 0.5) * length / bars, width - 0.04, 0.012, 0.025);
  for (const side of [-1, 1]) {
    for (let step = 0; step < 3; step++) {
      const y = (step + 1) * height / 3;
      const z = side * (length / 2 + (3 - step) * 0.22 - 0.1);
      context.box(steel, 0, y - 0.02, z, width, 0.04, 0.22);
      context.box(yellow, 0, y + 0.004, z + side * 0.08, width - 0.06, 0.008, 0.025);
    }
    context.beam(aluminum, [side * width / 2, height, -length / 2], [side * width / 2, height + 0.9, -length / 2], 0.018);
    context.beam(aluminum, [side * width / 2, height, length / 2], [side * width / 2, height + 0.9, length / 2], 0.018);
    context.beam(aluminum, [side * width / 2, height + 0.9, -length / 2], [side * width / 2, height + 0.9, length / 2], 0.018);
  }
}

export function buildVentilatingSkylight(context: ArchitectureContext, width: number, depth: number, phase: number): Animation {
  const { aluminum, steel, rubber, glass } = context.palette;
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, 0.16, 0, 0.08, 0.32, depth + 0.08);
    context.box(aluminum, 0, 0.16, side * depth / 2, width, 0.32, 0.08);
    context.box(rubber, side * width / 2, 0.326, 0, 0.07, 0.012, depth);
    context.box(rubber, 0, 0.326, side * depth / 2, width, 0.012, 0.07);
  }
  const lid = context.moving("Roof vent skylight glazing", [0, 0.34, -depth / 2], moving => {
    moving.box(glass, 0, 0.012, depth / 2, width - 0.06, 0.012, depth - 0.06);
    moving.box(glass, 0, 0.04, depth / 2, width - 0.06, 0.008, depth - 0.06);
    for (const side of [-1, 1]) {
      moving.box(aluminum, side * width / 2, 0.025, depth / 2, 0.065, 0.06, depth);
      moving.box(aluminum, 0, 0.025, side > 0 ? depth : 0, width, 0.06, 0.065);
    }
  });
  const actuators = [-1, 1].map(side => context.moving("Skylight chain actuator", [side * width * 0.3, 0.22, depth / 2 - 0.04], moving => {
    moving.box(steel, 0, 0.18, 0, 0.02, 0.36, 0.02);
    moving.box(aluminum, 0, 0, 0, 0.15, 0.06, 0.08);
  }));
  let openness = 0;
  let previous = 0;
  return (seconds, night, season) => {
    const delta = Math.max(0, Math.min(0.15, seconds - previous));
    previous = seconds;
    const target = night || season === "winter" ? 0 : season === "summer" ? 0.25 : 0.12 + Math.sin(seconds * 0.015 + phase) * 0.03;
    openness += (target - openness) * (1 - Math.exp(-delta * 0.15));
    lid.rotation.x = -openness;
    for (const actuator of actuators) actuator.scale.y = Math.max(0.02, Math.sin(openness) * depth / 0.36);
  };
}

export function buildRoofMaintenanceArea(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, height: number, phase: number): Animation[] {
  const animations: Animation[] = [];
  animations.push(buildFacadeMaintenanceRig(context.at({ x: width * 0.28, y: 0.03, z: depth / 2 - 0.2 }), height, phase));
  animations.push(...buildWeatherMast(context.at({ x: -width / 2 + 0.8, y: 0.1, z: depth / 2 - 0.7 }), phase));
  buildSatelliteDish(context.at({ x: -width * 0.22, y: 0.12, z: -depth / 2 + 0.8 }), 0.34, -0.65);
  buildTelecomCabinet(context.at({ x: -width * 0.35, y: 0.12, z: -depth * 0.1 }));
  buildRoofCageLadder(context.at({ x: -width * 0.25, y: 0.02, z: -depth * 0.18 + 1.2 }), 1.9);
  buildRoofPipeBridge(context.at({ x: width * 0.1, y: 0.12, z: -depth * 0.1 }), 0.65, 0.65);
  context.box(materials.boardConcrete, -width * 0.35, 0.065, -depth * 0.1, 0.9, 0.13, 0.65);
  return animations;
}
