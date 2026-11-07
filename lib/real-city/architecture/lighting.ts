import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";

export function buildRecessedDownlight(context: ArchitectureContext, radius = 0.055): void {
  const { aluminum, dark, warmLight } = context.palette;
  context.disc(aluminum, 0, 0, 0, radius, 0.018);
  context.disc(dark, 0, -0.012, 0, radius * 0.82, 0.015);
  context.disc(warmLight, 0, -0.022, 0, radius * 0.62, 0.01);
}

export function buildPendantLight(context: ArchitectureContext, cableLength: number, radius: number): void {
  const { steel, porcelain, warmLight } = context.palette;
  context.disc(steel, 0, 0, 0, 0.055, 0.025);
  context.beam(steel, [0, -0.015, 0], [0, -cableLength, 0], 0.003);
  const profile = [new THREE.Vector2(radius, 0), new THREE.Vector2(radius * 0.92, 0.04), new THREE.Vector2(radius * 0.68, radius * 0.46), new THREE.Vector2(radius * 0.2, radius * 0.72), new THREE.Vector2(radius * 0.11, radius * 0.78)];
  const shade = context.geometry(new THREE.LatheGeometry(profile, 20));
  context.part(porcelain, shade, [0, -cableLength - radius * 0.3, 0]);
  context.disc(warmLight, 0, -cableLength - radius * 0.3, 0, radius * 0.5, 0.018);
}

export function buildWallSconce(context: ArchitectureContext, height = 0.28): void {
  const { bronze, glass, warmLight } = context.palette;
  context.box(bronze, 0, 0, -0.02, 0.13, height * 0.72, 0.045);
  context.beam(bronze, [0, -height * 0.15, 0], [0, -height * 0.15, 0.12], 0.012);
  context.disc(bronze, 0, -height / 2, 0.12, 0.07, 0.025);
  context.disc(bronze, 0, height / 2, 0.12, 0.07, 0.025);
  context.part(glass, context.cylinder, [0, 0, 0.12], [0.065, height, 0.065]);
  context.oval(warmLight, 0, 0, 0.12, 0.025, height * 0.33, 0.025);
}

export function buildTrackLighting(context: ArchitectureContext, length: number, heads: number): void {
  const { steel, aluminum, warmLight } = context.palette;
  context.box(steel, 0, 0, 0, length, 0.025, 0.03);
  for (let index = 0; index < heads; index++) {
    const x = -length / 2 + (index + 0.5) * length / heads;
    context.box(aluminum, x, -0.04, 0, 0.035, 0.08, 0.035);
    context.box(steel, x, -0.1, 0.025, 0.075, 0.1, 0.1, 0, -0.2);
    context.box(warmLight, x, -0.154, 0.03, 0.055, 0.012, 0.06);
  }
}

export function buildFloorLamp(context: ArchitectureContext, bend = false): void {
  const { steel, bronze, warmLight, porcelain } = context.palette;
  context.disc(steel, 0, 0.035, 0, 0.15, 0.065);
  if (bend) {
    context.tube(bronze, [[0, 0.065, 0], [0, 1.35, 0], [0.16, 1.66, 0], [0.48, 1.72, 0], [0.62, 1.65, 0]], 0.013);
    context.oval(porcelain, 0.62, 1.62, 0, 0.14, 0.11, 0.14);
    context.disc(warmLight, 0.62, 1.54, 0, 0.1, 0.016);
  } else {
    context.beam(bronze, [0, 0.06, 0], [0, 1.36, 0], 0.013);
    const cone = context.geometry(new THREE.CylinderGeometry(0.11, 0.19, 0.29, 20, 1, true));
    context.part(porcelain, cone, [0, 1.4, 0]);
    context.oval(warmLight, 0, 1.35, 0, 0.038, 0.055, 0.038);
  }
}

export function buildExteriorBollard(context: ArchitectureContext): void {
  const { steel, glass, warmLight, aluminum } = context.palette;
  context.disc(steel, 0, 0.035, 0, 0.09, 0.07);
  context.disc(steel, 0, 0.35, 0, 0.055, 0.63);
  context.disc(glass, 0, 0.7, 0, 0.056, 0.17);
  context.disc(warmLight, 0, 0.7, 0, 0.033, 0.15);
  context.disc(aluminum, 0, 0.8, 0, 0.071, 0.035);
  for (const y of [0.64, 0.7, 0.76]) context.disc(steel, 0, y, 0, 0.062, 0.012);
}

export function buildCeilingFan(context: ArchitectureContext, radius = 0.57): Animation {
  const { aluminum, oak, steel } = context.palette;
  context.disc(aluminum, 0, 0, 0, 0.08, 0.055);
  context.beam(steel, [0, -0.025, 0], [0, -0.22, 0], 0.012);
  const fan = context.moving("Ceiling fan rotor", [0, -0.23, 0], (moving) => {
    moving.oval(aluminum, 0, 0, 0, 0.09, 0.06, 0.09);
    for (let blade = 0; blade < 3; blade++) {
      const a = blade * Math.PI * 2 / 3;
      const inner = radius * 0.12;
      const outer = radius;
      moving.panel(oak, [[Math.cos(a) * inner, 0, Math.sin(a) * inner], [Math.cos(a + 0.15) * outer, 0.02, Math.sin(a + 0.15) * outer], [Math.cos(a + 0.36) * outer, 0.02, Math.sin(a + 0.36) * outer], [Math.cos(a + 0.56) * inner, 0, Math.sin(a + 0.56) * inner]]);
    }
  });
  return (seconds, night, season) => {
    fan.rotation.y = (context.local.yaw ?? 0) + seconds * (season === "summer" ? night ? 2.4 : 4.2 : season === "winter" ? 0 : 1.2);
  };
}

export function buildWallControls(context: ArchitectureContext, position: Point): void {
  const { white, dark, screen } = context.palette;
  const controls = context.at({ x: position[0], y: position[1], z: position[2] });
  controls.roundedBox(white, 0, 0, 0, 0.086, 0.086, 0.014, 0.008);
  controls.box(white, 0, 0, 0.012, 0.055, 0.06, 0.01);
  controls.roundedBox(white, 0.14, 0.08, 0, 0.095, 0.1, 0.018, 0.008);
  controls.box(dark, 0.14, 0.09, 0.014, 0.065, 0.046, 0.005);
  controls.box(screen, 0.14, 0.09, 0.018, 0.05, 0.03, 0.004);
}

export function buildSocket(context: ArchitectureContext): void {
  const { white, dark } = context.palette;
  context.roundedBox(white, 0, 0, 0, 0.086, 0.086, 0.012, 0.009);
  for (const side of [-1, 1]) context.box(dark, side * 0.015, 0.008, 0.01, 0.007, 0.014, 0.003);
  context.box(dark, 0, -0.014, 0.01, 0.007, 0.014, 0.003);
}

export function buildSmokeDetector(context: ArchitectureContext): void {
  const { white, dark, red } = context.palette;
  context.disc(white, 0, -0.012, 0, 0.055, 0.024);
  context.disc(white, 0, -0.027, 0, 0.044, 0.025);
  for (let slot = 0; slot < 8; slot++) {
    const angle = slot * Math.PI / 4;
    context.box(dark, Math.cos(angle) * 0.035, -0.04, Math.sin(angle) * 0.035, 0.009, 0.004, 0.004, -angle);
  }
  context.disc(red, 0.025, -0.043, 0, 0.003, 0.003);
}
