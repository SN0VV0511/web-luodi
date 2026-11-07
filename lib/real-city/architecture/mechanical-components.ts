import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";
import type { ArchitecturalMaterials } from "./materials";

function ring(context: ArchitectureContext, material: THREE.Material, radius: number, tube: number, position: Point, yaw = 0): void {
  const geometry = context.geometry(new THREE.TorusGeometry(radius, tube, 6, 16));
  context.part(material, geometry, position, [1, 1, 1], yaw);
}

export function buildPipeFlange(context: ArchitectureContext, radius: number, horizontal = false): void {
  const { steel, aluminum, rubber } = context.palette;
  if (horizontal) {
    context.beam(steel, [0, 0, -0.022], [0, 0, 0.022], radius * 1.65);
    context.beam(rubber, [0, 0, -0.003], [0, 0, 0.003], radius * 1.7);
  } else {
    context.disc(steel, 0, 0, 0, radius * 1.65, 0.044);
    context.disc(rubber, 0, 0, 0, radius * 1.7, 0.006);
  }
  for (let bolt = 0; bolt < 6; bolt++) {
    const angle = bolt * Math.PI / 3;
    const x = Math.cos(angle) * radius * 1.35;
    const other = Math.sin(angle) * radius * 1.35;
    if (horizontal) context.beam(aluminum, [x, other, -0.028], [x, other, 0.028], radius * 0.11);
    else context.disc(aluminum, x, 0, other, radius * 0.11, 0.056);
  }
}

export function buildPipeClamp(context: ArchitectureContext, radius: number, offset = 0.12): void {
  const { steel, aluminum } = context.palette;
  ring(context, steel, radius + 0.008, 0.008, [0, 0, 0]);
  context.box(steel, 0, -radius - offset / 2, 0, 0.018, offset, 0.024);
  context.box(aluminum, 0, -radius - offset, 0, 0.16, 0.018, 0.07);
  for (const side of [-1, 1]) context.disc(steel, side * 0.06, -radius - offset + 0.012, 0, 0.009, 0.018);
}

export function buildPressureGauge(context: ArchitectureContext, reading: () => number, maximum = 6): Animation {
  const { aluminum, white, dark, red, glass } = context.palette;
  context.beam(aluminum, [0, -0.13, 0], [0, -0.045, 0], 0.009);
  context.beam(aluminum, [0, 0, -0.025], [0, 0, 0.025], 0.067);
  context.beam(white, [0, 0, 0.025], [0, 0, 0.029], 0.06);
  for (let tick = 0; tick <= 12; tick++) {
    const angle = -Math.PI * 0.75 + tick * Math.PI * 1.5 / 12;
    const x = Math.sin(angle);
    const y = Math.cos(angle);
    context.beam(dark, [x * 0.046, y * 0.046, 0.032], [x * 0.054, y * 0.054, 0.032], tick % 3 === 0 ? 0.0018 : 0.001);
  }
  const needle = context.moving("Water pressure gauge needle", [0, 0, 0.035], moving => {
    moving.box(red, 0, 0.021, 0, 0.003, 0.044, 0.002);
    moving.beam(dark, [0, 0, -0.001], [0, 0, 0.002], 0.006);
  });
  context.beam(glass, [0, 0, 0.039], [0, 0, 0.041], 0.059);
  return () => {
    const fraction = THREE.MathUtils.clamp(reading() / maximum, 0, 1);
    needle.rotation.z = Math.PI * 0.75 - fraction * Math.PI * 1.5;
  };
}

export function buildGateValve(context: ArchitectureContext, radius: number, open = 1): void {
  const { bronze, steel, red } = context.palette;
  context.beam(bronze, [0, 0, -radius * 1.8], [0, 0, radius * 1.8], radius * 1.15);
  context.oval(bronze, 0, radius * 0.6, 0, radius * 1.1, radius * 1.8, radius);
  context.disc(steel, 0, radius * 2.6, 0, radius * 0.16, radius * 1.8);
  const wheelY = radius * (3.2 + open * 0.45);
  const wheelRadius = radius * 1.85;
  const geometry = context.geometry(new THREE.TorusGeometry(wheelRadius, radius * 0.12, 6, 16));
  geometry.rotateX(Math.PI / 2);
  context.part(red, geometry, [0, wheelY, 0]);
  for (let spoke = 0; spoke < 3; spoke++) {
    const angle = spoke * Math.PI * 2 / 3;
    context.beam(red, [0, wheelY, 0], [Math.cos(angle) * wheelRadius, wheelY, Math.sin(angle) * wheelRadius], radius * 0.09);
  }
  for (const side of [-1, 1]) buildPipeFlange(context.at({ x: 0, y: 0, z: side * radius * 1.5 }), radius, true);
}

export function buildButterflyValve(context: ArchitectureContext, radius: number, angle = 0): void {
  const { steel, bronze, red } = context.palette;
  context.beam(steel, [0, 0, -0.035], [0, 0, 0.035], radius * 1.45);
  context.disc(bronze, 0, radius * 1.3, 0, radius * 0.22, radius * 0.9);
  context.box(red, Math.sin(angle) * radius * 1.5, radius * 1.8, Math.cos(angle) * radius * 1.5, 0.025, 0.02, radius * 3, angle);
  context.box(steel, 0, radius * 1.68, 0, radius * 0.6, 0.035, radius * 0.65);
  buildPipeFlange(context.at({ x: 0, y: 0, z: -0.04 }), radius, true);
  buildPipeFlange(context.at({ x: 0, y: 0, z: 0.04 }), radius, true);
}

export function buildWaterMeter(context: ArchitectureContext, radius: number): void {
  const { bronze, dark, glass, white } = context.palette;
  context.beam(bronze, [0, 0, -0.13], [0, 0, 0.13], radius);
  context.disc(bronze, 0, 0.06, 0, radius * 1.5, 0.13);
  context.disc(white, 0, 0.13, 0, radius * 1.25, 0.008);
  context.disc(glass, 0, 0.138, 0, radius * 1.3, 0.008);
  context.box(dark, 0, 0.137, 0, radius * 1.7, 0.002, radius * 0.6);
  for (let digit = 0; digit < 5; digit++) context.box(white, -radius * 0.65 + digit * radius * 0.32, 0.14, 0, radius * 0.2, 0.002, radius * 0.32);
  for (const side of [-1, 1]) buildPipeFlange(context.at({ x: 0, y: 0, z: side * 0.1 }), radius, true);
}

export function buildCentrifugalPump(context: ArchitectureContext, drive: () => number): Animation {
  const { steel, green, aluminum, rubber, yellow } = context.palette;
  context.box(steel, 0, 0.035, 0, 0.52, 0.07, 0.85);
  for (const x of [-0.2, 0.2]) {
    for (const z of [-0.34, 0.34]) {
      context.box(rubber, x, 0.015, z, 0.08, 0.03, 0.08);
      context.disc(aluminum, x, 0.084, z, 0.015, 0.018);
    }
  }
  context.beam(green, [0, 0.26, -0.31], [0, 0.26, 0.06], 0.145);
  for (let fin = 0; fin < 12; fin++) {
    const angle = fin * Math.PI / 6;
    context.box(green, Math.cos(angle) * 0.145, 0.26 + Math.sin(angle) * 0.145, -0.14, 0.018, 0.045, 0.3, 0, angle - Math.PI / 2);
  }
  context.box(steel, 0.12, 0.38, -0.13, 0.15, 0.11, 0.16);
  context.box(aluminum, 0.12, 0.44, -0.13, 0.14, 0.012, 0.15);
  context.beam(steel, [0, 0.26, 0.06], [0, 0.26, 0.18], 0.032);
  context.oval(green, 0, 0.25, 0.27, 0.16, 0.19, 0.13);
  context.beam(green, [0, 0.25, 0.27], [0, 0.25, 0.46], 0.055);
  context.beam(green, [0.09, 0.31, 0.27], [0.09, 0.53, 0.27], 0.055);
  buildPipeFlange(context.at({ x: 0, y: 0.25, z: 0.45 }), 0.055, true);
  buildPipeFlange(context.at({ x: 0.09, y: 0.52, z: 0.27 }), 0.055);
  const coupling = context.moving("Pump coupling rotation", [0, 0.26, 0.12], moving => {
    moving.box(yellow, 0, 0, 0, 0.1, 0.025, 0.04);
    moving.box(yellow, 0, 0, 0, 0.025, 0.1, 0.04);
  });
  let previous = 0;
  let rotation = 0;
  return seconds => {
    const delta = seconds >= previous ? Math.min(seconds - previous, 0.1) : 0;
    previous = seconds;
    rotation += delta * 35 * Math.max(0, Math.min(1, drive()));
    coupling.rotation.z = rotation;
  };
}

export function buildExpansionVessel(context: ArchitectureContext, radius = 0.22, height = 0.75): void {
  const { red, steel, aluminum } = context.palette;
  const bodyHeight = height - radius;
  context.disc(red, 0, height / 2, 0, radius, bodyHeight);
  context.oval(red, 0, height / 2 + bodyHeight / 2, 0, radius, radius / 2, radius);
  context.oval(red, 0, height / 2 - bodyHeight / 2, 0, radius, radius / 2, radius);
  context.disc(aluminum, 0, height + 0.025, 0, 0.015, 0.05);
  context.disc(steel, 0, 0.06, 0, 0.025, 0.12);
  for (const side of [-1, 1]) context.box(steel, side * radius * 0.65, 0.08, 0, 0.035, 0.16, radius * 0.9);
  const seam = context.geometry(new THREE.TorusGeometry(radius + 0.003, 0.006, 6, 16));
  seam.rotateX(Math.PI / 2);
  context.part(steel, seam, [0, height * 0.5, 0]);
  context.box(context.palette.white, 0, height * 0.59, radius + 0.006, radius * 0.85, height * 0.13, 0.004);
}

export function buildDomesticWaterTank(context: ArchitectureContext, radius: number, height: number, fill: () => number): Animation {
  const { aluminum, steel, glass, water, white } = context.palette;
  context.disc(aluminum, 0, height / 2 + 0.12, 0, radius, height);
  context.oval(aluminum, 0, height + 0.12, 0, radius, radius * 0.18, radius);
  for (const side of [-1, 1]) context.box(steel, side * radius * 0.65, 0.08, 0, 0.08, 0.16, radius * 1.2);
  for (const fraction of [0.15, 0.5, 0.85]) {
    const band = context.geometry(new THREE.TorusGeometry(radius + 0.012, 0.012, 6, 20));
    band.rotateX(Math.PI / 2);
    context.part(steel, band, [0, 0.12 + height * fraction, 0]);
  }
  const sightX = radius * 0.72;
  const sightZ = radius * 0.74;
  context.disc(glass, sightX, height / 2 + 0.12, sightZ, 0.025, height * 0.78);
  context.box(white, sightX + 0.05, height / 2 + 0.12, sightZ - 0.008, 0.04, height * 0.82, 0.012);
  for (let tick = 0; tick <= 8; tick++) context.box(steel, sightX + 0.05, 0.12 + height * (0.11 + tick * 0.0975), sightZ + 0.004, tick % 2 === 0 ? 0.035 : 0.02, 0.006, 0.004);
  const level = context.moving("Tank level sight glass", [sightX, 0.12 + height * 0.11, sightZ], moving => {
    moving.disc(water, 0, height * 0.39, 0, 0.021, height * 0.78);
  });
  context.tube(steel, [[0, height + 0.2, 0], [0, height + 0.42, 0], [radius + 0.25, height + 0.42, 0], [radius + 0.25, height * 0.8, 0]], 0.035);
  context.beam(steel, [0, 0.2, radius], [0, 0.2, radius + 0.3], 0.04);
  buildGateValve(context.at({ x: 0, y: 0.2, z: radius + 0.23 }), 0.04);
  return () => {
    level.scale.y = Math.max(0.005, Math.min(1, fill()));
  };
}

export function buildPlateHeatExchanger(context: ArchitectureContext, width = 0.4, height = 0.85): void {
  const { steel, aluminum, bronze } = context.palette;
  for (const side of [-1, 1]) context.box(steel, 0, height / 2, side * 0.2, width, height, 0.045);
  for (let plate = 0; plate < 16; plate++) context.box(aluminum, 0, height / 2, -0.16 + plate * 0.021, width * 0.86, height * 0.86, 0.012);
  for (const x of [-width * 0.4, width * 0.4]) {
    for (const y of [0.15, height - 0.15]) {
      context.beam(steel, [x, y, -0.28], [x, y, 0.28], 0.012);
      context.beam(bronze, [x * 0.65, y, 0.2], [x * 0.65, y, 0.34], 0.03);
      buildPipeFlange(context.at({ x: x * 0.65, y, z: 0.32 }), 0.03, true);
    }
  }
  context.box(steel, 0, 0.03, 0, width * 1.3, 0.06, 0.65);
}

export function buildInsulatedDuct(context: ArchitectureContext, width: number, height: number, length: number): void {
  const { aluminum, steel } = context.palette;
  context.box(aluminum, 0, 0, 0, width, height, length);
  const joints = Math.max(1, Math.ceil(length / 1.2));
  for (let joint = 0; joint <= joints; joint++) {
    const z = -length / 2 + joint * length / joints;
    for (const side of [-1, 1]) {
      context.box(steel, side * width / 2, 0, z, 0.018, height + 0.03, 0.035);
      context.box(steel, 0, side * height / 2, z, width + 0.03, 0.018, 0.035);
    }
  }
  for (const side of [-1, 1]) {
    context.beam(steel, [side * width * 0.42, height / 2, -length * 0.3], [side * width * 0.42, height / 2 + 0.25, -length * 0.3], 0.008);
    context.beam(steel, [side * width * 0.42, height / 2, length * 0.3], [side * width * 0.42, height / 2 + 0.25, length * 0.3], 0.008);
  }
}

export function buildDuctTransition(context: ArchitectureContext, width: number, height: number, radius: number, length: number): void {
  const { aluminum } = context.palette;
  const positions: number[] = [];
  const count = 16;
  for (let segment = 0; segment < count; segment++) {
    const a = segment * Math.PI * 2 / count;
    const b = (segment + 1) * Math.PI * 2 / count;
    const edge = (angle: number): Point => {
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const scale = Math.min(width / 2 / Math.max(0.0001, Math.abs(cosine)), height / 2 / Math.max(0.0001, Math.abs(sine)));
      return [cosine * scale, sine * scale, 0];
    };
    const first = edge(a);
    const second = edge(b);
    const third: Point = [Math.cos(b) * radius, Math.sin(b) * radius, length];
    const fourth: Point = [Math.cos(a) * radius, Math.sin(a) * radius, length];
    positions.push(...first, ...second, ...third, ...first, ...third, ...fourth);
  }
  const geometry = context.geometry(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Array(positions.length / 3 * 2).fill(0), 2));
  geometry.computeVertexNormals();
  context.part(aluminum, geometry, [0, 0, 0]);
}

export function buildMotorizedDamper(context: ArchitectureContext, width: number, height: number, openness: () => number): Animation {
  const { aluminum, steel, yellow } = context.palette;
  for (const side of [-1, 1]) {
    context.box(steel, side * width / 2, 0, 0, 0.035, height, 0.18);
    context.box(steel, 0, side * height / 2, 0, width, 0.035, 0.18);
  }
  const bladeCount = Math.max(2, Math.ceil(height / 0.12));
  const blades: THREE.Group[] = [];
  for (let blade = 0; blade < bladeCount; blade++) {
    const y = -height / 2 + (blade + 0.5) * height / bladeCount;
    blades.push(context.moving("Air volume damper blade", [0, y, 0], moving => {
      moving.box(aluminum, 0, 0, 0, width - 0.04, height / bladeCount - 0.004, 0.008);
      moving.beam(steel, [-width / 2, 0, 0], [width / 2, 0, 0], 0.006);
    }));
  }
  context.box(yellow, width / 2 + 0.065, 0, 0, 0.11, 0.16, 0.1);
  context.box(steel, width / 2 + 0.065, 0, 0.056, 0.05, 0.06, 0.015);
  return () => {
    const angle = Math.max(0, Math.min(1, openness())) * Math.PI * 0.48;
    for (const blade of blades) blade.rotation.x = angle;
  };
}

export function buildRoofExhaustCowl(context: ArchitectureContext, radius: number, height: number): void {
  const { aluminum, steel } = context.palette;
  context.disc(aluminum, 0, height / 2, 0, radius, height);
  context.disc(steel, 0, 0.06, 0, radius * 1.5, 0.12);
  context.disc(aluminum, 0, height + radius * 0.15, 0, radius * 1.55, radius * 0.15);
  const cap = context.geometry(new THREE.ConeGeometry(radius * 1.55, radius * 0.55, 20, 1, true));
  context.part(aluminum, cap, [0, height + radius * 0.48, 0]);
  for (let strut = 0; strut < 3; strut++) {
    const angle = strut * Math.PI * 2 / 3;
    context.beam(steel, [Math.cos(angle) * radius, height - 0.04, Math.sin(angle) * radius], [Math.cos(angle) * radius * 1.25, height + radius * 0.45, Math.sin(angle) * radius * 1.25], 0.012);
  }
}

export function buildWallRadiator(context: ArchitectureContext, width = 0.85, height = 0.55): void {
  const { white, aluminum, steel } = context.palette;
  context.box(white, 0, height / 2 + 0.12, 0, width, height, 0.09);
  const flutes = Math.max(6, Math.round(width / 0.055));
  for (let flute = 0; flute < flutes; flute++) {
    const x = -width / 2 + (flute + 0.5) * width / flutes;
    context.box(white, x, height / 2 + 0.12, 0.053, width / flutes * 0.6, height - 0.04, 0.016);
  }
  for (const side of [-1, 1]) {
    context.tube(aluminum, [[side * (width / 2 + 0.05), 0, -0.03], [side * (width / 2 + 0.05), 0.15, -0.03], [side * width / 2, 0.15, 0]], 0.012);
    context.disc(steel, side * (width / 2 + 0.05), 0.17, -0.03, 0.018, 0.04);
  }
  context.beam(white, [width / 2 + 0.04, height - 0.03, 0], [width / 2 + 0.13, height - 0.03, 0], 0.028);
  for (let slot = 0; slot < 6; slot++) context.box(steel, -0.15 + slot * 0.06, height + 0.13, 0, 0.02, 0.002, 0.07);
}

export function buildFanCoilGrille(context: ArchitectureContext, width: number, depth: number): void {
  const { white, dark, aluminum } = context.palette;
  context.box(white, 0, 0, 0, width + 0.06, 0.025, depth + 0.06);
  context.box(dark, 0, -0.016, 0, width, 0.008, depth);
  const fins = Math.max(4, Math.round(width / 0.035));
  for (let fin = 0; fin < fins; fin++) context.box(aluminum, -width / 2 + (fin + 0.5) * width / fins, -0.023, 0, 0.012, 0.018, depth - 0.02);
}

export function buildHeatPumpCabinet(context: ArchitectureContext, demand: () => number): Animation {
  const { white, aluminum, steel, dark } = context.palette;
  context.box(white, 0, 0.75, 0, 1.05, 1.35, 0.5);
  context.box(aluminum, 0, 1.44, 0, 1.1, 0.04, 0.55);
  for (const side of [-1, 1]) context.box(steel, side * 0.37, 0.05, 0, 0.14, 0.1, 0.65);
  for (const y of [0.43, 1.04]) {
    context.beam(dark, [0, y, 0.25], [0, y, 0.26], 0.25);
    for (let rim = 0; rim < 4; rim++) ring(context, aluminum, 0.075 + rim * 0.05, 0.004, [0, y, 0.3]);
    for (let spoke = 0; spoke < 8; spoke++) {
      const angle = spoke * Math.PI / 4;
      context.beam(aluminum, [0, y, 0.3], [Math.cos(angle) * 0.245, y + Math.sin(angle) * 0.245, 0.3], 0.004);
    }
  }
  const fans = [0.43, 1.04].map(y => context.moving("Heat pump condenser fan", [0, y, 0.275], moving => {
    for (let blade = 0; blade < 3; blade++) {
      const angle = blade * Math.PI * 2 / 3;
      moving.box(steel, Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, 0, 0.22, 0.065, 0.012, 0, angle);
    }
    moving.beam(aluminum, [0, 0, -0.01], [0, 0, 0.01], 0.035);
  }));
  context.box(dark, 0.45, 0.85, 0.26, 0.035, 0.12, 0.01);
  context.tube(steel, [[0.5, 0.15, -0.15], [0.65, 0.15, -0.15], [0.65, 0.15, -0.6]], 0.025);
  context.tube(aluminum, [[0.5, 0.23, -0.15], [0.72, 0.23, -0.15], [0.72, 0.15, -0.6]], 0.018);
  return seconds => {
    const speed = Math.max(0, Math.min(1, demand()));
    for (const fan of fans) fan.rotation.z = seconds * (4 + speed * 22);
  };
}

export function buildRainwaterFilter(context: ArchitectureContext): void {
  const { steel, green, aluminum, glass } = context.palette;
  context.box(steel, 0, 0.05, 0, 0.48, 0.1, 0.32);
  for (const side of [-1, 1]) {
    context.disc(green, side * 0.13, 0.4, 0, 0.095, 0.48);
    context.disc(aluminum, side * 0.13, 0.67, 0, 0.105, 0.06);
    context.disc(glass, side * 0.13, 0.37, 0, 0.098, 0.34);
  }
  context.beam(steel, [-0.3, 0.67, 0], [0.3, 0.67, 0], 0.025);
  context.tube(steel, [[-0.3, 0.67, 0], [-0.35, 0.67, 0], [-0.35, 0.13, 0]], 0.025);
  buildGateValve(context.at({ x: 0.3, y: 0.67, z: 0, yaw: Math.PI / 2 }), 0.025);
}

export function buildMechanicalPlant(context: ArchitectureContext, materials: ArchitecturalMaterials, seed: number): Animation[] {
  const animations: Animation[] = [];
  let demand = 0.5;
  let pressure = 2.5;
  let fill = 0.75;
  let lastSeconds = 0;
  const update: Animation = (seconds, night, season) => {
    const delta = seconds >= lastSeconds ? Math.min(0.1, seconds - lastSeconds) : 0;
    lastSeconds = seconds;
    const seasonalDemand = season === "winter" ? 0.83 : season === "summer" ? 0.71 : 0.34;
    const occupiedDemand = night ? 0.23 : 0.58 + Math.sin(seconds * 0.013 + seed) * 0.16;
    const target = Math.min(1, seasonalDemand * 0.62 + occupiedDemand * 0.38);
    demand += (target - demand) * (1 - Math.exp(-delta / 4));
    const pump = fill < 0.55 ? 1 : fill > 0.88 ? 0 : demand;
    fill = THREE.MathUtils.clamp(fill + (pump * 0.008 - occupiedDemand * 0.006) * delta, 0.05, 0.95);
    pressure += ((2.1 + pump * 1.2) - pressure) * (1 - Math.exp(-delta * 0.7));
  };
  animations.push(update);
  context.box(materials.boardConcrete, 0, 0.035, 0, 3.2, 0.07, 2.2);
  animations.push(buildHeatPumpCabinet(context.at({ x: -0.85, y: 0.07, z: -0.45 }), () => demand));
  animations.push(buildDomesticWaterTank(context.at({ x: 0.65, y: 0.07, z: -0.48 }), 0.33, 1.4, () => fill));
  animations.push(buildCentrifugalPump(context.at({ x: 0.7, y: 0.07, z: 0.52, yaw: Math.PI / 2 }), () => demand));
  buildExpansionVessel(context.at({ x: -0.2, y: 0.07, z: 0.52 }), 0.18, 0.6);
  buildRainwaterFilter(context.at({ x: 1.25, y: 0.07, z: -0.35, yaw: -Math.PI / 2 }));
  context.tube(context.palette.steel, [[-0.32, 0.23, -0.6], [0.1, 0.23, -0.6], [0.1, 0.23, 0.57], [0.72, 0.23, 0.57]], 0.035);
  context.tube(context.palette.aluminum, [[0.65, 1.55, -0.48], [0.65, 1.7, -0.48], [1.2, 1.7, -0.48], [1.2, 0.25, 0.57]], 0.03);
  animations.push(buildPressureGauge(context.at({ x: 0.2, y: 0.5, z: 0.57 }), () => pressure));
  buildWaterMeter(context.at({ x: 0.45, y: 0.23, z: 0.57, yaw: Math.PI / 2 }), 0.025);
  buildButterflyValve(context.at({ x: 0.1, y: 0.23, z: 0.2 }), 0.035, Math.PI / 2);
  buildPipeClamp(context.at({ x: 0.1, y: 0.23, z: -0.1 }), 0.035, 0.12);
  buildPlateHeatExchanger(context.at({ x: -1.15, y: 0.07, z: 0.55 }), 0.35, 0.72);
  buildInsulatedDuct(context.at({ x: -0.85, y: 1.75, z: -0.4 }), 0.45, 0.3, 0.8);
  buildDuctTransition(context.at({ x: -0.85, y: 1.75, z: 0 }), 0.45, 0.3, 0.13, 0.3);
  animations.push(buildMotorizedDamper(context.at({ x: -0.85, y: 1.75, z: 0.31 }), 0.25, 0.25, () => demand));
  buildRoofExhaustCowl(context.at({ x: -1.4, y: 0.07, z: -0.75 }), 0.12, 0.85);
  return animations;
}
