import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";

export function buildAnchorPlate(context: ArchitectureContext, width: number, height: number, count = 4): void {
  const { steel, aluminum } = context.palette;
  context.box(steel, 0, 0, 0, width, height, 0.016);
  for (let bolt = 0; bolt < count; bolt++) {
    const column = bolt % 2;
    const row = Math.floor(bolt / 2);
    const rows = Math.ceil(count / 2);
    const x = (column - 0.5) * width * 0.6;
    const y = rows === 1 ? 0 : -height * 0.32 + row / (rows - 1) * height * 0.64;
    context.beam(aluminum, [x, y, 0.008], [x, y, 0.02], Math.min(width, height) * 0.06);
    context.beam(steel, [x, y, 0.02], [x, y, 0.026], Math.min(width, height) * 0.035);
  }
}

export function buildClevis(context: ArchitectureContext, radius: number): void {
  const { steel, aluminum } = context.palette;
  for (const side of [-1, 1]) context.box(steel, side * radius * 0.65, 0, 0, radius * 0.3, radius * 2, radius * 1.3);
  context.box(steel, 0, -radius * 0.7, 0, radius * 1.5, radius * 0.5, radius * 1.3);
  context.beam(aluminum, [-radius, radius * 0.35, 0], [radius, radius * 0.35, 0], radius * 0.22);
}

export function buildTensionRod(context: ArchitectureContext, start: readonly [number, number, number], end: readonly [number, number, number]): void {
  const { steel, aluminum } = context.palette;
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const length = direction.length();
  if (length < 0.001) return;
  direction.normalize();
  context.beam(steel, start, end, 0.009);
  const center = a.clone().lerp(b, 0.5);
  const turnbuckleStart = center.clone().addScaledVector(direction, -0.055);
  const turnbuckleEnd = center.clone().addScaledVector(direction, 0.055);
  context.beam(aluminum, turnbuckleStart.toArray() as [number, number, number], turnbuckleEnd.toArray() as [number, number, number], 0.018);
  for (const point of [a.clone().addScaledVector(direction, 0.07), b.clone().addScaledVector(direction, -0.07)]) {
    const alongStart = point.clone().addScaledVector(direction, -0.018);
    const alongEnd = point.clone().addScaledVector(direction, 0.018);
    context.beam(aluminum, alongStart.toArray() as [number, number, number], alongEnd.toArray() as [number, number, number], 0.014);
  }
}

export function buildLaminatedCanopy(context: ArchitectureContext, width: number, projection: number, height: number): void {
  const { aluminum, steel, glass, rubber, water } = context.palette;
  const slope = 0.035;
  const frontHeight = height - projection * slope;
  const paneCount = Math.max(2, Math.ceil(width / 1.4));
  const paneWidth = width / paneCount;
  context.box(steel, 0, height + 0.01, -0.025, width + 0.12, 0.075, 0.12);
  for (let pane = 0; pane < paneCount; pane++) {
    const x0 = -width / 2 + pane * paneWidth + 0.006;
    const x1 = x0 + paneWidth - 0.012;
    for (const layer of [-1, 1]) {
      const offset = layer * 0.005;
      context.panel(glass, [[x0, height + offset, 0], [x0, frontHeight + offset, projection], [x1, frontHeight + offset, projection], [x1, height + offset, 0]]);
    }
    context.box(rubber, x0 - 0.004, height - projection * slope / 2, projection / 2, 0.008, 0.012, projection, 0, 0);
    for (const x of [x0 + 0.08, x1 - 0.08]) {
      for (const z of [0.14, projection - 0.14]) {
        const y = height - z * slope;
        context.disc(aluminum, x, y + 0.016, z, 0.026, 0.018);
        context.disc(rubber, x, y, z, 0.03, 0.008);
        context.disc(steel, x, y + 0.03, z, 0.008, 0.014);
      }
    }
  }
  for (const side of [-1, 1]) {
    const x = side * width * 0.36;
    buildAnchorPlate(context.at({ x, y: height + 0.38, z: 0.015 }), 0.12, 0.2);
    buildClevis(context.at({ x, y: height + 0.3, z: 0.06 }), 0.03);
    buildTensionRod(context, [x, height + 0.32, 0.065], [x, frontHeight + 0.03, projection - 0.12]);
    context.rectangularBeam(steel, [x, height - 0.05, 0], [x, frontHeight - 0.05, projection], 0.04, 0.05);
    context.box(aluminum, side * width / 2, frontHeight - 0.008, projection, 0.025, 0.06, 0.04);
  }
  context.box(aluminum, 0, frontHeight - 0.015, projection + 0.025, width + 0.08, 0.06, 0.08);
  context.box(water, 0, frontHeight - 0.001, projection + 0.025, width - 0.05, 0.004, 0.045);
  context.tube(aluminum, [[width / 2 - 0.06, frontHeight - 0.015, projection + 0.025], [width / 2 + 0.08, frontHeight - 0.08, projection], [width / 2 + 0.08, height - 0.25, 0]], 0.02);
}

export function buildRecessedEntranceMat(context: ArchitectureContext, width: number, depth: number): void {
  const { aluminum, dark, oak, rubber } = context.palette;
  context.box(dark, 0, 0.008, 0, width, 0.016, depth);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, 0.014, 0, 0.018, 0.028, depth + 0.035);
    context.box(aluminum, 0, 0.014, side * depth / 2, width, 0.028, 0.018);
  }
  const slats = Math.max(5, Math.ceil(depth / 0.045));
  for (let slat = 0; slat < slats; slat++) {
    const z = -depth / 2 + (slat + 0.5) * depth / slats;
    context.box(aluminum, 0, 0.017, z, width - 0.03, 0.016, depth / slats * 0.92);
    context.box(slat % 3 === 0 ? rubber : oak, 0, 0.027, z, width - 0.04, 0.012, depth / slats * 0.64);
  }
  for (const side of [-1, 1]) context.box(aluminum, side * width * 0.31, 0.02, 0, 0.008, 0.006, depth - 0.03);
}

export function buildEntranceChannelDrain(context: ArchitectureContext, width: number): void {
  const { dark, aluminum, steel } = context.palette;
  context.box(dark, 0, -0.012, 0, width, 0.035, 0.12);
  for (const side of [-1, 1]) context.box(aluminum, 0, 0.008, side * 0.056, width, 0.016, 0.008);
  const bars = Math.max(8, Math.round(width / 0.032));
  for (let bar = 0; bar < bars; bar++) context.box(aluminum, -width / 2 + (bar + 0.5) * width / bars, 0.008, 0, 0.012, 0.016, 0.105);
  for (const x of [-width / 2 + 0.045, width / 2 - 0.045]) {
    context.disc(steel, x, 0.018, 0.035, 0.005, 0.004);
    context.disc(steel, x, 0.018, -0.035, 0.005, 0.004);
  }
}

export function buildStonePortal(context: ArchitectureContext, width: number, height: number, reveal: number): void {
  const { limestone, dark, aluminum } = context.palette;
  const jambWidth = 0.24;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + jambWidth / 2);
    context.box(limestone, x, height / 2, 0, jambWidth, height, reveal);
    const courses = Math.max(2, Math.ceil(height / 0.65));
    for (let course = 1; course < courses; course++) context.box(dark, x, course * height / courses, reveal / 2 + 0.003, jambWidth, 0.008, 0.004);
    context.box(aluminum, side * width / 2, height / 2, -reveal / 2 + 0.025, 0.015, height, 0.05);
  }
  context.box(limestone, 0, height + 0.12, 0, width + jambWidth * 2, 0.24, reveal + 0.04);
  context.box(dark, 0, height - 0.006, reveal / 2 - 0.035, width + jambWidth * 2, 0.008, 0.008);
  context.box(limestone, 0, -0.025, 0, width + 0.1, 0.05, reveal + 0.2);
}

export function buildThresholdStrip(context: ArchitectureContext, width: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(aluminum, 0, 0.009, 0, width, 0.018, 0.16);
  for (let groove = 0; groove < 5; groove++) context.box(rubber, 0, 0.019, -0.06 + groove * 0.03, width - 0.03, 0.004, 0.008);
  const fixings = Math.max(3, Math.ceil(width / 0.4));
  for (let fixing = 0; fixing < fixings; fixing++) context.disc(steel, -width / 2 + (fixing + 0.5) * width / fixings, 0.022, 0.045, 0.004, 0.004);
}

export function buildDoorCloserArm(context: ArchitectureContext, width: number, opening: () => number): Animation {
  const { aluminum, steel } = context.palette;
  context.box(aluminum, -width * 0.26, 0, 0, 0.23, 0.055, 0.065);
  const armA = context.moving("Entrance door closer primary arm", [-width * 0.24, 0.025, 0.04], moving => {
    moving.box(steel, 0.13, 0, 0, 0.26, 0.015, 0.02);
  });
  const armB = context.moving("Entrance door closer secondary arm", [0.02, 0.025, 0.04], moving => {
    moving.box(steel, 0.1, 0, 0, 0.2, 0.015, 0.02);
  });
  const rest = armB.position.clone();
  const yaw = context.local.yaw ?? 0;
  const xAxis = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const zAxis = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  return () => {
    const angle = THREE.MathUtils.clamp(opening(), 0, 1) * 1.2;
    armA.rotation.y = yaw + angle;
    armB.position.copy(rest).addScaledVector(xAxis, Math.cos(angle) * 0.26 - 0.26).addScaledVector(zAxis, -Math.sin(angle) * 0.26);
    armB.rotation.y = yaw - angle * 0.8;
  };
}

export function buildRetractableSecurityBollard(context: ArchitectureContext): Animation {
  const { steel, aluminum, red, dark } = context.palette;
  context.disc(steel, 0, 0.015, 0, 0.17, 0.03);
  for (let bolt = 0; bolt < 6; bolt++) {
    const angle = bolt * Math.PI / 3;
    context.disc(aluminum, Math.cos(angle) * 0.13, 0.034, Math.sin(angle) * 0.13, 0.008, 0.008);
  }
  const post = context.moving("Retractable service bollard", [0, 0, 0], moving => {
    moving.disc(aluminum, 0, 0.37, 0, 0.11, 0.74);
    moving.disc(red, 0, 0.64, 0, 0.112, 0.07);
    moving.disc(dark, 0, 0.744, 0, 0.111, 0.008);
  });
  const base = post.position.y;
  const sensor = context.doorSensor([0, 0, 0], 1.4, 3);
  return seconds => { post.position.y = base - sensor(seconds) * 0.71; };
}

export function buildParcelDrop(context: ArchitectureContext, width: number): Animation {
  const { steel, aluminum, dark, green } = context.palette;
  context.box(steel, 0, 0.53, 0, width, 1.06, 0.42);
  context.box(aluminum, 0, 1.08, 0.025, width + 0.035, 0.035, 0.49);
  context.box(green, 0, 0.84, 0.221, width - 0.06, 0.24, 0.018);
  const flap = context.moving("Parcel locker drop flap", [0, 0.95, 0.238], moving => {
    moving.box(aluminum, 0, -0.1, 0, width - 0.1, 0.2, 0.025);
    moving.box(dark, 0, -0.12, 0.025, width * 0.4, 0.025, 0.025);
  });
  context.box(green, 0, 0.38, 0.22, width - 0.06, 0.58, 0.018);
  context.box(aluminum, width * 0.25, 0.45, 0.25, 0.018, 0.16, 0.025);
  const sensor = context.doorSensor([0, 0, 0.6], 0.75, 2);
  return seconds => { flap.rotation.x = -sensor(seconds) * 0.45; };
}

export function buildUmbrellaStand(context: ArchitectureContext, width = 0.45): void {
  const { steel, aluminum, dark, fabric } = context.palette;
  context.box(steel, 0, 0.028, 0, width, 0.055, 0.25);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * width / 2, 0.3, 0, 0.018, 0.55, 0.25);
    context.box(aluminum, 0, 0.56, side * 0.125, width, 0.025, 0.018);
  }
  for (let slot = 0; slot < 4; slot++) {
    const x = -width * 0.35 + slot * width * 0.23;
    context.box(aluminum, x, 0.55, 0, 0.012, 0.02, 0.25);
    if (slot < 3) {
      context.beam(dark, [x, 0.08, 0], [x, 0.68, 0], 0.004);
      context.oval(fabric, x, 0.35, 0, 0.022, 0.24, 0.025);
      context.tube(dark, [[x, 0.68, 0], [x, 0.73, 0], [x + 0.03, 0.75, 0], [x + 0.05, 0.72, 0]], 0.007);
    }
  }
}

export function buildEntranceDirectory(context: ArchitectureContext, floors: number, name: string): void {
  const { bronze, glass, white } = context.palette;
  context.box(bronze, 0, 0, 0, 0.65, 0.95, 0.045);
  context.box(white, 0, 0, 0.026, 0.58, 0.88, 0.01);
  context.label(name, 0, 0.34, 0.034, 0.52, 0.1, "#3d4843", "#dddacb");
  const listed = Math.min(7, floors);
  for (let floor = 0; floor < listed; floor++) {
    const y = 0.19 - floor * 0.072;
    context.label(`${String(floor + 1).padStart(2, "0")}    ${101 + floor * 100} – ${104 + floor * 100}`, 0, y, 0.034, 0.5, 0.048, "#46504a", "#dddacb");
  }
  context.box(glass, 0, 0, 0.055, 0.58, 0.88, 0.008);
}

export function buildAccessibleEntryDetails(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, height: number, name: string, floors: number): Animation[] {
  const animations: Animation[] = [];
  buildRecessedEntranceMat(context.at({ x: 0, y: 0.016, z: -0.45 }), width * 0.82, 0.75);
  buildThresholdStrip(context, width);
  buildEntranceChannelDrain(context.at({ x: 0, y: 0.01, z: 0.85 }), width + 0.3);
  buildStonePortal(context.at({ x: 0, y: 0, z: -0.06 }), width + 0.16, height + 0.08, 0.26);
  buildEntranceDirectory(context.at({ x: -width / 2 - 0.52, y: 1.45, z: 0.12 }), floors, name);
  buildUmbrellaStand(context.at({ x: width / 2 + 0.35, y: 0.02, z: -0.25 }));
  animations.push(buildParcelDrop(context.at({ x: -width / 2 - 1.05, y: 0.02, z: 0.24 }), 0.44));
  for (const side of [-1, 1]) animations.push(buildRetractableSecurityBollard(context.at({ x: side * (width / 2 + 0.4), y: 0.02, z: 1.25 })));
  const sensor = context.doorSensor([0, 0, 0], 2.1, 2.2);
  let openness = 0;
  animations.push(seconds => { openness = sensor(seconds); });
  animations.push(buildDoorCloserArm(context.at({ x: 0, y: height - 0.08, z: -0.04 }), width / 2, () => openness));
  context.box(materials.terrazzo, 0, 0.008, 0.4, width + 0.5, 0.016, 0.8);
  return animations;
}
