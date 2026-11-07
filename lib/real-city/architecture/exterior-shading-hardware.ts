import { ArchitectureContext, type Animation } from "./context";
import { sampleEarthWind } from "../../city-physics";
import { buildAnchorPlate, buildFaceFastener, buildGroundBolt, buildProfileEndCap, buildSlottedConnection } from "./exterior-fixings";

export function buildLouverBearing(context: ArchitectureContext, radius = 0.022): void {
  const { aluminum, steel, rubber } = context.palette;
  context.box(aluminum, 0, 0, 0, radius * 2.8, radius * 2.8, radius * 0.7);
  context.oval(rubber, 0, 0, radius * 0.5, radius, radius, radius * 0.35);
  context.oval(steel, 0, 0, radius * 0.75, radius * 0.6, radius * 0.6, radius * 0.4);
  for (const side of [-1, 1]) {
    buildFaceFastener(context, side * radius * 1.05, side * radius * 1.05, radius * 0.5, radius * 0.21);
  }
}

export function buildLouverDriveUnit(context: ArchitectureContext, height = 0.24): void {
  const { aluminum, steel, rubber, yellow } = context.palette;
  context.roundedBox(aluminum, 0, height / 2, 0.045, 0.12, height, 0.09, 0.018);
  context.box(rubber, 0, height / 2, 0.094, 0.105, height - 0.018, 0.004);
  context.roundedBox(aluminum, 0, height / 2, 0.101, 0.1, height - 0.025, 0.014, 0.012);
  for (const y of [0.03, height - 0.03]) {
    buildFaceFastener(context, 0, y, 0.11, 0.006);
  }
  context.box(steel, 0, height * 0.48, 0.111, 0.06, 0.03, 0.003);
  context.box(yellow, 0, height * 0.48, 0.114, 0.045, 0.012, 0.002);
  context.disc(steel, 0, height + 0.022, 0.045, 0.016, 0.044);
  context.disc(rubber, 0, height + 0.005, 0.045, 0.023, 0.01);
  context.tube(steel, [[0.025, 0, 0.04], [0.025, -0.04, 0.04], [0.025, -0.07, 0.015]], 0.006);
  for (const side of [-1, 1]) {
    buildAnchorPlate(context.at({ x: 0, y: height / 2 + side * (height / 2 + 0.025), z: -0.014 }), 0.1, 0.055, 0.012, false);
  }
}

export function buildLouverLinkPin(context: ArchitectureContext): void {
  const { steel, aluminum, rubber } = context.palette;
  context.oval(rubber, 0, 0, 0, 0.015, 0.015, 0.005);
  context.oval(aluminum, 0, 0, 0.009, 0.012, 0.012, 0.008);
  context.box(steel, 0, 0, 0.019, 0.003, 0.017, 0.004);
  context.box(steel, 0.007, 0, 0.017, 0.008, 0.012, 0.003);
}

export function buildAwningShoulderJoint(context: ArchitectureContext): void {
  const { aluminum, steel, rubber } = context.palette;
  buildSlottedConnection(context, 0.12, 0.2, 0.03);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * 0.036, -0.025, 0.06, 0.018, 0.095, 0.12);
  }
  context.box(rubber, 0, -0.025, 0.09, 0.055, 0.045, 0.05);
  context.beam(steel, [-0.055, -0.025, 0.09], [0.055, -0.025, 0.09], 0.012);
  for (const side of [-1, 1]) {
    const bolt = context.at({ x: side * 0.059, y: -0.025, z: 0.09, yaw: side * Math.PI / 2 });
    buildFaceFastener(bolt, 0, 0, 0, 0.014, true);
  }
  context.box(aluminum, 0, -0.081, 0.06, 0.1, 0.018, 0.065);
  buildGroundBolt(context, 0, -0.066, 0.065, 0.012);
}

export function buildAwningElbowJoint(context: ArchitectureContext): void {
  const { aluminum, steel, rubber } = context.palette;
  context.disc(steel, 0, 0, 0, 0.035, 0.048);
  context.disc(rubber, 0, 0.027, 0, 0.034, 0.006);
  context.disc(aluminum, 0, 0.035, 0, 0.03, 0.012);
  context.disc(aluminum, 0, -0.029, 0, 0.03, 0.01);
  buildGroundBolt(context, 0, 0.046, 0, 0.011);
  context.box(aluminum, 0, -0.01, -0.035, 0.04, 0.04, 0.05);
  context.box(aluminum, 0.025, 0.005, 0.025, 0.04, 0.035, 0.05, -0.45);
}

export function buildAwningFrontEnd(context: ArchitectureContext, height: number): void {
  const { aluminum, rubber, steel } = context.palette;
  buildProfileEndCap(context, 0.075, height, 0.008);
  context.box(rubber, 0, -height / 2 - 0.007, 0.012, 0.065, 0.008, 0.024);
  context.box(aluminum, 0, -height / 2 + 0.006, -0.015, 0.085, 0.014, 0.025);
  context.box(steel, 0, 0, 0.017, 0.012, 0.012, 0.012);
}

export function buildFabricEdgeRope(context: ArchitectureContext, width: number, depth: number, slope: number): void {
  const { fabric, white, aluminum } = context.palette;
  for (const side of [-1, 1]) {
    context.rectangularBeam(white, [side * width / 2, 0, 0], [side * width / 2, -slope * depth, depth], 0.009, 0.007);
    context.rectangularBeam(fabric, [side * (width / 2 - 0.025), 0, 0], [side * (width / 2 - 0.025), -slope * depth, depth], 0.004, 0.003);
  }
  context.beam(aluminum, [-width / 2, 0.003, 0], [width / 2, 0.003, 0], 0.009);
  context.beam(aluminum, [-width / 2, -slope * depth, depth], [width / 2, -slope * depth, depth], 0.009);
}

export function buildCassetteEndGearbox(context: ArchitectureContext, radius = 0.065): void {
  const { aluminum, steel, rubber } = context.palette;
  context.roundedBox(aluminum, 0, 0, 0.02, radius * 2.25, radius * 2.1, 0.045, 0.025);
  context.oval(rubber, 0, 0, 0.046, radius, radius, 0.004);
  context.oval(aluminum, 0, 0, 0.052, radius * 0.86, radius * 0.86, 0.008);
  for (let screw = 0; screw < 3; screw++) {
    const angle = screw * Math.PI * 2 / 3;
    buildFaceFastener(context, Math.cos(angle) * radius * 0.65, Math.sin(angle) * radius * 0.65, 0.061, 0.006);
  }
  context.box(steel, 0, -radius * 0.9, 0.06, 0.018, 0.035, 0.016);
  context.tube(steel, [[0, -radius, 0.045], [0, -radius - 0.045, 0.045], [0, -radius - 0.065, 0.015]], 0.006);
}

export function buildShutterTrackWheel(context: ArchitectureContext, radius = 0.026): void {
  const { steel, aluminum, rubber } = context.palette;
  context.oval(steel, 0, 0, 0, radius, radius, 0.012);
  context.oval(rubber, 0, 0, 0.012, radius * 0.78, radius * 0.78, 0.004);
  context.oval(aluminum, 0, 0, 0.018, radius * 0.4, radius * 0.4, 0.008);
  context.box(steel, 0, -radius, -0.01, 0.024, radius * 2, 0.028);
  buildFaceFastener(context, 0, 0, 0.028, 0.006, true);
}

export function buildShutterGuideShoe(context: ArchitectureContext, width: number, height = 0.06): void {
  const { aluminum, rubber, steel } = context.palette;
  context.box(aluminum, 0, height / 2, 0, width, height, 0.09);
  context.box(rubber, 0, height + 0.005, 0, width - 0.012, 0.01, 0.075);
  context.box(steel, 0, height + 0.023, 0, 0.015, 0.04, 0.065);
  for (const side of [-1, 1]) buildGroundBolt(context, side * width * 0.32, height + 0.01, 0.028, 0.007);
}

export function buildShutterWallStop(context: ArchitectureContext): void {
  const { steel, rubber, aluminum } = context.palette;
  context.box(steel, 0, 0, 0.014, 0.07, 0.11, 0.028);
  context.box(aluminum, 0, -0.018, 0.075, 0.035, 0.04, 0.12);
  context.box(rubber, 0, -0.018, 0.14, 0.06, 0.06, 0.035);
  buildFaceFastener(context, 0, 0.035, 0.031, 0.008, true);
  buildFaceFastener(context, 0, -0.035, 0.031, 0.008, true);
}

export function buildZipScreenGuide(context: ArchitectureContext, height: number): void {
  const { aluminum, rubber } = context.palette;
  context.box(aluminum, 0, height / 2, 0, 0.035, height, 0.06);
  for (const side of [-1, 1]) {
    context.box(rubber, side * 0.007, height / 2, 0.034, 0.006, height, 0.018);
    context.box(aluminum, side * 0.015, height / 2, 0.042, 0.006, height, 0.025);
  }
  const retainers = Math.max(2, Math.ceil(height / 0.6));
  for (let retainer = 0; retainer < retainers; retainer++) {
    const y = 0.08 + retainer * (height - 0.16) / (retainers - 1);
    context.box(aluminum, -0.035, y, -0.004, 0.035, 0.055, 0.018);
    buildFaceFastener(context, -0.035, y, 0.008, 0.006);
  }
  buildProfileEndCap(context.at({ x: 0, y: 0.012, z: 0, yaw: 0 }), 0.035, 0.024, 0.035, false);
}

export function buildShadeWindSensor(context: ArchitectureContext): Animation {
  const { white, aluminum, steel, dark } = context.palette;
  context.box(aluminum, 0, 0, 0.01, 0.075, 0.12, 0.02);
  context.beam(aluminum, [0, 0, 0.02], [0, 0, 0.2], 0.011);
  context.disc(aluminum, 0, 0.05, 0.2, 0.016, 0.1);
  context.disc(steel, 0, 0.11, 0.2, 0.024, 0.025);
  for (const y of [-0.04, 0.04]) buildFaceFastener(context, 0, y, 0.023, 0.006);
  const cups = context.moving("Facade awning anemometer cups", [0, 0.135, 0.2], moving => {
    moving.disc(steel, 0, 0, 0, 0.018, 0.018);
    for (let arm = 0; arm < 3; arm++) {
      const angle = arm * Math.PI * 2 / 3;
      const x = Math.cos(angle) * 0.075;
      const z = Math.sin(angle) * 0.075;
      moving.beam(aluminum, [0, 0, 0], [x, 0, z], 0.004);
      moving.oval(white, x, 0, z, 0.024, 0.016, 0.024);
      moving.oval(dark, x + Math.sin(angle) * 0.01, 0.008, z - Math.cos(angle) * 0.01, 0.017, 0.007, 0.017);
    }
  });
  const localYaw = context.local.yaw ?? 0;
  let lastTime = -Infinity;
  let rotation = 0;
  return (seconds, _night, season) => {
    const wind = sampleEarthWind(seconds, context.local.x, context.local.z, season);
    const speed = Math.hypot(wind.x, wind.z) / 0.075 * 0.23;
    if (!Number.isFinite(lastTime) || seconds < lastTime) rotation = 0;
    else rotation += speed * Math.min(0.2, seconds - lastTime);
    lastTime = seconds;
    cups.rotation.y = localYaw + rotation;
  };
}

export function buildShadeIrradianceSensor(context: ArchitectureContext): void {
  const { aluminum, dark, glass, green } = context.palette;
  context.box(aluminum, 0, 0, 0.025, 0.07, 0.09, 0.05);
  context.oval(dark, 0, 0.012, 0.058, 0.022, 0.022, 0.009);
  context.oval(glass, 0, 0.012, 0.066, 0.022, 0.022, 0.011);
  context.oval(green, 0, -0.025, 0.053, 0.004, 0.004, 0.003);
  context.tube(aluminum, [[0, -0.045, 0.018], [0, -0.07, 0.018], [0, -0.08, 0]], 0.004);
}

export function buildCanopyArmProtectiveBoot(context: ArchitectureContext, length = 0.07): void {
  const { rubber, aluminum } = context.palette;
  context.roundedBox(rubber, 0, 0, 0, 0.055, 0.055, length, 0.012);
  const ribs = Math.max(3, Math.floor(length / 0.012));
  for (let rib = 0; rib < ribs; rib++) {
    const z = -length / 2 + (rib + 0.5) * length / ribs;
    context.box(aluminum, 0, 0.028, z, 0.045, 0.003, 0.003);
  }
}
