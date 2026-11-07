import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";

export function buildHandrail(context: ArchitectureContext, length: number, height: number, postSpacing = 1.05): void {
  const { steel, aluminum } = context.palette;
  const posts = Math.max(1, Math.ceil(length / postSpacing));
  for (let i = 0; i <= posts; i++) {
    const x = -length / 2 + i * length / posts;
    context.disc(steel, x, height / 2, 0, 0.022, height);
    context.box(steel, x, 0.02, 0, 0.12, 0.04, 0.12);
    for (const side of [-1, 1]) context.disc(aluminum, x + side * 0.035, 0.043, 0, 0.009, 0.008);
  }
  context.beam(aluminum, [-length / 2 - 0.035, height, 0], [length / 2 + 0.035, height, 0], 0.025);
  context.beam(steel, [-length / 2, height * 0.48, 0], [length / 2, height * 0.48, 0], 0.015);
}

export function buildFlight(context: ArchitectureContext, rise: number, width: number, tread: number, openRisers: boolean): number {
  const { steel, aluminum, concrete, rubber } = context.palette;
  const count = Math.max(2, Math.round(rise / 0.165));
  const riser = rise / count;
  const run = count * tread;
  for (let index = 0; index < count; index++) {
    const y = (index + 1) * riser;
    const z = -index * tread - tread / 2;
    context.box(openRisers ? steel : concrete, 0, y - 0.025, z, width, 0.05, tread + 0.018);
    context.box(openRisers ? aluminum : rubber, 0, y + 0.003, z + tread / 2 - 0.028, width - 0.03, 0.012, 0.055);
    if (!openRisers) context.box(concrete, 0, y - riser / 2 - 0.025, z - tread / 2, width, riser, 0.07);
    if (openRisers) {
      const bars = Math.ceil(width / 0.09);
      for (let bar = 0; bar < bars; bar++) context.box(aluminum, -width / 2 + (bar + 0.5) * width / bars, y + 0.005, z, 0.014, 0.008, tread - 0.04);
    }
  }
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.05);
    context.rectangularBeam(steel, [x, 0.01, tread / 2], [x, rise - 0.08, -run + tread / 2], 0.1, 0.17);
    context.beam(aluminum, [x, 0.96, tread / 2], [x, rise + 0.96, -run + tread / 2], 0.025);
    for (let step = 0; step < count; step += 3) {
      const y = (step + 1) * riser;
      const z = -step * tread;
      context.beam(steel, [x, y - 0.05, z], [x, y + 0.96, z], 0.018);
    }
  }
  return run;
}

export function buildFireEscape(context: ArchitectureContext, floors: number, floorHeight: number, firstFloor: number): void {
  const { steel, aluminum, red, rubber } = context.palette;
  const landingWidth = 1.55;
  const halfRise = floorHeight / 2;
  const tread = 0.24;
  const count = Math.round(halfRise / 0.165);
  const run = count * tread;
  for (const x of [-0.65, 0.65]) {
    for (const z of [0.2, -run - 1.2]) context.box(steel, x, (firstFloor + floors * floorHeight) / 2, z, 0.09, firstFloor + floors * floorHeight, 0.09);
  }
  for (let floor = 0; floor < floors; floor++) {
    const y = firstFloor + floor * floorHeight;
    context.box(steel, 0, y - 0.07, -0.35, landingWidth, 0.14, 1.25);
    context.box(rubber, 0, y + 0.008, -0.35, landingWidth - 0.08, 0.016, 1.18);
    const railing = context.at({ x: -0.66, y, z: -0.35, yaw: Math.PI / 2 });
    buildHandrail(railing, 1.25, 1.06, 0.65);
    if (floor === floors - 1) continue;
    const outbound = context.at({ x: -0.32, y, z: -1.05 });
    buildFlight(outbound, halfRise, 0.62, tread, true);
    context.box(steel, 0, y + halfRise - 0.06, -run - 1.35, landingWidth, 0.12, 0.75);
    const inbound = context.at({ x: 0.32, y: y + halfRise, z: -run - 1.05, yaw: Math.PI });
    buildFlight(inbound, halfRise, 0.62, tread, true);
    const backRailing = context.at({ x: 0, y: y + halfRise, z: -run - 1.72 });
    buildHandrail(backRailing, landingWidth, 1.06, 0.7);
    for (const side of [-1, 1]) {
      context.beam(steel, [side * 0.65, y - 0.05, 0.15], [side * 0.65, y + floorHeight - 0.05, -run - 1.15], 0.025);
    }
  }
  const ladderRungs = Math.max(3, Math.ceil(firstFloor / 0.28));
  for (const side of [-1, 1]) context.beam(steel, [side * 0.22, 0.2, -0.35], [side * 0.22, firstFloor + 0.7, -0.35], 0.02);
  for (let rung = 0; rung < ladderRungs; rung++) context.beam(aluminum, [-0.22, 0.2 + rung * firstFloor / ladderRungs, -0.35], [0.22, 0.2 + rung * firstFloor / ladderRungs, -0.35], 0.013);
}

export function buildAccessibleRamp(context: ArchitectureContext, rise: number, width: number, run: number): void {
  const { concrete, aluminum, steel, rubber } = context.palette;
  context.profile(concrete, [[-run / 2, 0], [run / 2, 0], [run / 2, rise], [-run / 2, 0.04]], width, [0, 0, -width / 2]);
  for (const side of [-1, 1]) {
    const z = side * (width / 2 - 0.08);
    context.rectangularBeam(concrete, [-run / 2, 0.08, z], [run / 2, rise + 0.08, z], 0.08, 0.15);
    for (const height of [0.65, 0.9]) context.beam(aluminum, [-run / 2 - 0.3, height, z], [run / 2 + 0.3, rise + height, z], 0.022);
    const posts = Math.ceil(run / 1.1);
    for (let post = 0; post <= posts; post++) {
      const t = post / posts;
      const x = THREE.MathUtils.lerp(-run / 2, run / 2, t);
      const y = rise * t;
      context.beam(steel, [x, y, z], [x, y + 0.9, z], 0.018);
    }
  }
  const strips = Math.ceil(run / 0.4);
  for (let strip = 0; strip < strips; strip++) {
    const t = (strip + 0.5) / strips;
    context.box(rubber, -run / 2 + run * t, rise * t + 0.042, 0, 0.025, 0.008, width - 0.28);
  }
}

export function buildTactilePaving(context: ArchitectureContext, length: number, width: number, warning = false): void {
  const { yellow, concrete } = context.palette;
  context.box(concrete, 0, 0.008, 0, length + 0.04, 0.016, width + 0.04);
  context.box(yellow, 0, 0.02, 0, length, 0.02, width);
  const columns = Math.floor(length / 0.12);
  const rows = Math.floor(width / 0.12);
  for (let x = 0; x < columns; x++) {
    for (let z = 0; z < rows; z++) {
      const px = -length / 2 + (x + 0.5) * length / columns;
      const pz = -width / 2 + (z + 0.5) * width / rows;
      if (warning) context.disc(yellow, px, 0.037, pz, 0.025, 0.014);
      else context.box(yellow, px, 0.037, pz, length / columns - 0.024, 0.014, 0.025);
    }
  }
}

export function buildBicycleRamp(context: ArchitectureContext, rise: number, run: number): void {
  const { steel, aluminum } = context.palette;
  context.rectangularBeam(steel, [0, 0.04, 0], [0, rise + 0.04, -run], 0.16, 0.035);
  for (const side of [-1, 1]) context.rectangularBeam(aluminum, [side * 0.075, 0.08, 0], [side * 0.075, rise + 0.08, -run], 0.018, 0.07);
  const ribs = Math.ceil(run / 0.18);
  for (let rib = 0; rib < ribs; rib++) {
    const t = rib / ribs;
    context.box(steel, 0, rise * t + 0.064, -run * t, 0.13, 0.008, 0.015);
  }
}

export function buildParkingBarrier(context: ArchitectureContext, armLength: number, phase: number): Animation {
  const { steel, red, white, rubber, screen } = context.palette;
  context.box(steel, 0, 0.55, 0, 0.34, 1.1, 0.3);
  context.box(rubber, 0, 0.025, 0, 0.4, 0.05, 0.38);
  context.box(screen, 0, 0.85, 0.16, 0.13, 0.16, 0.02);
  const arm = context.moving("Parking barrier arm", [0.1, 1.02, 0], (moving) => {
    moving.box(white, armLength / 2, 0, 0, armLength, 0.075, 0.065);
    const stripes = Math.floor(armLength / 0.5);
    for (let i = 0; i < stripes; i++) moving.box(red, 0.25 + i * 0.5, 0, 0.036, 0.18, 0.075, 0.008);
    moving.disc(steel, 0, 0, 0, 0.11, 0.12);
  });
  return (seconds) => {
    arm.rotation.z = openingPulse(seconds, 52, phase, 7, 1.8) * Math.PI * 0.48;
  };
}
