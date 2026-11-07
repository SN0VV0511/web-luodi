import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDigitalNumber, buildIntercomScreen, buildThermometer } from "./display-instruments";
import { buildTaskChair } from "./furniture";

export function buildMedicineCabinet(context: ArchitectureContext, width: number, height: number, refrigerated = false): void {
  const { white, aluminum, glass, dark, green, red } = context.palette;
  const depth = 0.38;
  context.box(white, 0, height / 2, -depth / 2, width, height, 0.035);
  for (const side of [-1, 1]) context.box(white, side * width / 2, height / 2, 0, 0.035, height, depth);
  context.box(white, 0, 0.03, 0, width, 0.06, depth);
  context.box(white, 0, height - 0.03, 0, width, 0.06, depth);
  const rows = Math.max(3, Math.floor(height / 0.3));
  for (let row = 0; row < rows; row++) {
    const y = 0.12 + row * (height - 0.25) / rows;
    context.box(aluminum, 0, y, 0, width - 0.04, 0.015, depth - 0.04);
    const columns = Math.max(3, Math.floor(width / 0.11));
    for (let column = 0; column < columns; column++) {
      const x = -width / 2 + (column + 0.5) * width / columns;
      if ((column + row) % 3 === 0) {
        context.disc(white, x, y + 0.085, 0, 0.028, 0.14);
        context.disc(aluminum, x, y + 0.165, 0, 0.029, 0.018);
        context.box(row % 2 ? green : red, x, y + 0.08, 0.03, 0.035, 0.045, 0.004);
      } else {
        context.box(white, x, y + 0.095, 0, 0.075, 0.17, 0.095);
        context.box(row % 2 ? green : red, x, y + 0.06, 0.05, 0.075, 0.04, 0.004);
        context.box(dark, x, y + 0.13, 0.05, 0.045, 0.007, 0.004);
      }
    }
  }
  for (const side of [-1, 1]) {
    context.box(glass, side * width * 0.25, height / 2, depth / 2 + 0.015, width * 0.49, height - 0.08, 0.018);
    context.box(aluminum, side * 0.025, height / 2, depth / 2 + 0.035, 0.025, height - 0.05, 0.025);
    context.box(aluminum, side * 0.055, height * 0.48, depth / 2 + 0.07, 0.015, 0.18, 0.025);
  }
  context.beam(dark, [0, height * 0.4, depth / 2 + 0.045], [0, height * 0.4, depth / 2 + 0.055], 0.012);
  if (refrigerated) {
    context.box(aluminum, 0, 0.08, depth / 2 + 0.03, width, 0.12, 0.025);
    for (let grille = 0; grille < 10; grille++) context.box(dark, -width * 0.42 + grille * width * 0.093, 0.08, depth / 2 + 0.047, 0.012, 0.08, 0.003);
  }
}

export function buildPrescriptionCarousel(context: ArchitectureContext, phase: number): Animation {
  const { aluminum, white, dark, green } = context.palette;
  const radius = 0.31;
  context.disc(aluminum, 0, 0.045, 0, radius * 0.9, 0.09);
  context.disc(context.palette.steel, 0, 0.53, 0, 0.035, 1);
  const carousel = context.moving("Prescription storage carousel", [0, 0.15, 0], moving => {
    for (let tier = 0; tier < 4; tier++) {
      const y = tier * 0.23;
      moving.disc(aluminum, 0, y, 0, radius, 0.015);
      for (let bin = 0; bin < 8; bin++) {
        const angle = bin * Math.PI / 4;
        const x = Math.sin(angle) * radius * 0.7;
        const z = Math.cos(angle) * radius * 0.7;
        moving.box(white, x, y + 0.085, z, 0.12, 0.15, 0.16, angle);
        moving.box(green, Math.sin(angle) * radius * 0.98, y + 0.07, Math.cos(angle) * radius * 0.98, 0.085, 0.035, 0.004, angle);
      }
    }
  });
  context.box(dark, radius + 0.08, 0.68, 0, 0.12, 0.16, 0.08);
  return seconds => {
    const stop = Math.floor((seconds + phase) / 12);
    const within = THREE.MathUtils.euclideanModulo(seconds + phase, 12);
    const transition = THREE.MathUtils.smoothstep(within, 0, 1.8);
    carousel.rotation.y = (context.local.yaw ?? 0) + (stop + transition) * Math.PI / 4;
  };
}

export function buildTabletCounter(context: ArchitectureContext, phase: number): Animation[] {
  const { white, aluminum, glass, dark, green, porcelain } = context.palette;
  context.box(white, 0, 0.12, 0, 0.5, 0.24, 0.36);
  context.disc(aluminum, -0.08, 0.27, -0.03, 0.18, 0.035);
  const disc = context.moving("Automatic tablet counting disc", [-0.08, 0.294, -0.03], moving => {
    moving.disc(white, 0, 0, 0, 0.16, 0.012);
    for (let tablet = 0; tablet < 18; tablet++) {
      const angle = tablet * Math.PI * 2 / 18;
      moving.oval(porcelain, Math.cos(angle) * 0.13, 0.012, Math.sin(angle) * 0.13, 0.009, 0.005, 0.005);
    }
  });
  context.disc(glass, -0.08, 0.34, -0.03, 0.18, 0.08);
  context.box(aluminum, 0.14, 0.32, 0.06, 0.16, 0.025, 0.06);
  context.box(glass, 0.2, 0.24, 0.07, 0.035, 0.15, 0.035);
  context.disc(white, 0.2, 0.12, 0.07, 0.035, 0.13);
  context.box(dark, 0.12, 0.18, 0.19, 0.2, 0.06, 0.012);
  const display = buildDigitalNumber(context.at({ x: 0.12, y: 0.18, z: 0.205 }), 3, 0.02);
  context.box(green, -0.12, 0.1, 0.19, 0.045, 0.03, 0.012);
  return [(seconds, night) => {
    const time = THREE.MathUtils.euclideanModulo(seconds + phase, 26);
    disc.rotation.y = (context.local.yaw ?? 0) + (night || time > 18 ? 0 : time * 0.75);
    display.set(night ? 0 : Math.min(30, Math.floor(time * 2)));
  }];
}

export function buildConsultationDesk(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number): void {
  const { oak, white, aluminum, dark, green } = context.palette;
  context.roundedBox(materials.terrazzo, 0, 0.75, 0, width, 0.045, 0.65, 0.05);
  for (const side of [-1, 1]) context.box(oak, side * width * 0.39, 0.37, 0, 0.06, 0.74, 0.5);
  context.box(oak, 0, 0.46, -0.22, width * 0.8, 0.36, 0.035);
  context.box(dark, -width * 0.25, 0.87, -0.1, 0.025, 0.24, 0.025);
  context.box(dark, -width * 0.25, 1.04, -0.1, 0.35, 0.23, 0.025);
  context.box(context.palette.screen, -width * 0.25, 1.04, -0.08, 0.31, 0.19, 0.008);
  context.box(aluminum, -width * 0.25, 0.78, -0.1, 0.18, 0.015, 0.16);
  context.box(white, width * 0.2, 0.785, 0.02, 0.21, 0.01, 0.28);
  context.box(green, width * 0.2, 0.793, -0.1, 0.21, 0.008, 0.04);
  context.beam(dark, [width * 0.3, 0.793, 0.03], [width * 0.3, 0.793, 0.17], 0.003);
  buildTaskChair(context.at({ x: 0, y: 0, z: -0.68 }), materials);
  buildTaskChair(context.at({ x: 0, y: 0, z: 0.68, yaw: Math.PI }), materials);
}

export function buildBloodPressureStation(context: ArchitectureContext): Animation {
  const { white, dark, glass, aluminum } = context.palette;
  context.roundedBox(white, 0, 0.09, 0, 0.32, 0.18, 0.26, 0.04);
  context.box(dark, -0.05, 0.185, 0, 0.17, 0.008, 0.14);
  const display = buildDigitalNumber(context.at({ x: -0.04, y: 0.1, z: 0.142 }), 3, 0.025);
  context.beam(aluminum, [0.15, 0.08, 0], [0.22, 0.08, 0], 0.012);
  context.tube(dark, [[0.22, 0.08, 0], [0.3, 0.04, 0.1], [0.4, 0.04, 0.12], [0.42, 0.07, 0]], 0.005);
  const cuff = context.geometry(new THREE.CylinderGeometry(0.065, 0.065, 0.12, 16, 1, true));
  cuff.rotateZ(Math.PI / 2);
  context.part(dark, cuff, [0.42, 0.08, 0]);
  context.box(glass, 0.08, 0.185, 0, 0.045, 0.008, 0.05);
  return seconds => display.set(118 + Math.round(Math.sin(seconds * 0.12) * 2));
}

export function buildPrivacyScreen(context: ArchitectureContext, width: number, height: number): void {
  const { aluminum, white, fabric, rubber } = context.palette;
  const panels = 3;
  const panelWidth = width / panels;
  for (let panel = 0; panel < panels; panel++) {
    const x = -width / 2 + (panel + 0.5) * panelWidth;
    const yaw = panel === 1 ? 0 : panel === 0 ? -0.18 : 0.18;
    const frame = context.at({ x, y: 0, z: panel === 1 ? 0 : 0.05, yaw });
    for (const side of [-1, 1]) {
      frame.beam(aluminum, [side * panelWidth / 2, 0.1, 0], [side * panelWidth / 2, height, 0], 0.012);
      frame.box(aluminum, side * panelWidth / 2, 0.08, 0, 0.025, 0.025, 0.38);
      for (const foot of [-1, 1]) frame.beam(rubber, [side * panelWidth / 2 - 0.015, 0.035, foot * 0.16], [side * panelWidth / 2 + 0.015, 0.035, foot * 0.16], 0.032);
    }
    frame.beam(aluminum, [-panelWidth / 2, height, 0], [panelWidth / 2, height, 0], 0.012);
    frame.box(fabric, 0, height * 0.55, 0, panelWidth - 0.045, height * 0.82, 0.012);
    for (let fold = 0; fold < 7; fold++) frame.box(white, -panelWidth * 0.42 + fold * panelWidth * 0.14, height * 0.55, 0.008, 0.008, height * 0.8, 0.006);
  }
}

export function buildSanitizerStation(context: ArchitectureContext): void {
  const { aluminum, white, dark, green } = context.palette;
  context.box(aluminum, 0, 0.025, 0, 0.28, 0.05, 0.28);
  context.box(aluminum, 0, 0.58, 0, 0.035, 1.1, 0.035);
  context.roundedBox(white, 0, 1.1, 0.035, 0.12, 0.22, 0.09, 0.02);
  context.box(dark, 0, 1.05, 0.087, 0.035, 0.025, 0.008);
  context.box(green, 0, 1.15, 0.087, 0.04, 0.05, 0.006);
  context.box(aluminum, 0, 0.9, 0.05, 0.16, 0.012, 0.14);
}

export function buildMedicalWasteBin(context: ArchitectureContext): void {
  const { yellow, dark, aluminum } = context.palette;
  context.roundedBox(yellow, 0, 0.24, 0, 0.28, 0.48, 0.28, 0.035);
  context.roundedBox(yellow, 0, 0.495, 0, 0.3, 0.03, 0.3, 0.035);
  context.box(aluminum, 0, 0.035, 0.18, 0.12, 0.025, 0.09);
  context.box(dark, 0, 0.27, 0.147, 0.1, 0.1, 0.004);
  context.box(yellow, 0, 0.27, 0.151, 0.055, 0.014, 0.003);
  context.box(yellow, 0, 0.27, 0.151, 0.014, 0.055, 0.003);
}

export function buildQueueTicketMachine(context: ArchitectureContext, phase: number): Animation[] {
  const { dark, aluminum, white, green } = context.palette;
  context.box(aluminum, 0, 0.04, 0, 0.3, 0.08, 0.3);
  context.box(dark, 0, 0.6, 0, 0.08, 1.12, 0.08);
  context.roundedBox(white, 0, 1.2, 0, 0.28, 0.28, 0.2, 0.03);
  const display = buildDigitalNumber(context.at({ x: 0, y: 1.24, z: 0.112 }), 3, 0.025);
  context.box(green, 0, 1.14, 0.115, 0.06, 0.035, 0.015);
  context.box(dark, 0, 1.08, 0.11, 0.12, 0.012, 0.005);
  const ticket = context.moving("Pharmacy queue ticket", [0, 1.07, 0.12], moving => {
    moving.box(white, 0, -0.03, 0, 0.095, 0.06, 0.002);
    moving.box(dark, 0, -0.02, 0.002, 0.05, 0.008, 0.001);
  });
  return [seconds => {
    const count = Math.floor((seconds + phase) / 35);
    display.set(101 + count % 300);
    ticket.scale.y = 0.02 + openingPulse(seconds, 35, phase + 2, 7, 0.8) * 0.98;
  }];
}

export function buildPharmacyWorkroom(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number, phase: number): Animation[] {
  const animations: Animation[] = [];
  const back = -depth / 2 + 0.25;
  buildMedicineCabinet(context.at({ x: -width * 0.3, y: 0, z: back }), Math.min(1.35, width * 0.28), 2, true);
  buildMedicineCabinet(context.at({ x: width * 0.28, y: 0, z: back }), Math.min(1.6, width * 0.3), 2.2);
  context.box(materials.terrazzo, 0, 0.88, back + 0.15, Math.min(1.8, width * 0.32), 0.05, 0.64);
  for (const side of [-1, 1]) context.box(context.palette.white, side * width * 0.12, 0.43, back + 0.15, 0.08, 0.86, 0.56);
  animations.push(...buildTabletCounter(context.at({ x: 0, y: 0.91, z: back + 0.15 }), phase));
  animations.push(buildPrescriptionCarousel(context.at({ x: width * 0.42, y: 0, z: depth * 0.2 }), phase));
  animations.push(buildThermometer(context.at({ x: -width * 0.3, y: 1.7, z: back + 0.23 }), () => 4.2));
  if (depth > 3) {
    buildConsultationDesk(context.at({ x: -width * 0.2, y: 0, z: depth * 0.22 }), materials, 1.45);
    animations.push(buildBloodPressureStation(context.at({ x: -width * 0.2 + 0.32, y: 0.78, z: depth * 0.22 })));
    buildPrivacyScreen(context.at({ x: width * 0.12, y: 0, z: depth * 0.2, yaw: Math.PI / 2 }), 1.6, 1.75);
    buildSanitizerStation(context.at({ x: -width * 0.42, y: 0, z: depth * 0.38 }));
    buildMedicalWasteBin(context.at({ x: -width * 0.05, y: 0, z: depth * 0.37 }));
  }
  animations.push(...buildQueueTicketMachine(context.at({ x: -width * 0.42, y: 0, z: depth * 0.1 }), phase));
  animations.push(buildIntercomScreen(context.at({ x: width * 0.42, y: 1.8, z: back + 0.22 }), () => false));
  return animations;
}
