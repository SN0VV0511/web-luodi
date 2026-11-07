import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";

export function buildAirHandlingUnit(context: ArchitectureContext, width: number, length: number, height: number, phase: number): Animation {
  const { aluminum, steel, rubber, dark, yellow } = context.palette;
  context.box(steel, 0, 0.11, 0, width + 0.14, 0.22, length + 0.14);
  for (const x of [-width * 0.35, width * 0.35]) {
    context.box(rubber, x, 0.035, -length * 0.35, 0.22, 0.07, 0.22);
    context.box(rubber, x, 0.035, length * 0.35, 0.22, 0.07, 0.22);
  }
  context.box(aluminum, 0, height / 2 + 0.22, 0, width, height, length);
  context.box(steel, 0, height + 0.25, 0, width + 0.08, 0.06, length + 0.08);
  const bays = Math.max(2, Math.round(length / 0.6));
  for (let bay = 0; bay < bays; bay++) {
    const z = -length / 2 + (bay + 0.5) * length / bays;
    for (const side of [-1, 1]) {
      context.box(dark, side * (width / 2 + 0.004), height / 2 + 0.22, z, 0.012, height - 0.11, length / bays - 0.035);
      const louvers = Math.max(4, Math.ceil(height / 0.08));
      for (let louver = 0; louver < louvers; louver++) {
        const y = 0.29 + louver * (height - 0.12) / louvers;
        context.box(aluminum, side * (width / 2 + 0.018), y, z, 0.035, 0.035, length / bays - 0.06);
      }
      context.box(steel, side * (width / 2 + 0.04), 0.7, z + length / bays * 0.35, 0.025, 0.15, 0.025);
    }
  }
  context.box(yellow, width / 2 + 0.025, 0.48, length * 0.23, 0.02, 0.1, 0.1);
  const fan = context.moving("Roof AHU extraction fan", [0, height + 0.3, 0], (moving) => {
    moving.disc(steel, 0, 0, 0, width * 0.12, 0.09);
    for (let blade = 0; blade < 5; blade++) {
      const angle = blade * Math.PI * 2 / 5;
      const inner = width * 0.1;
      const outer = width * 0.37;
      moving.panel(aluminum, [[Math.cos(angle) * inner, 0, Math.sin(angle) * inner], [Math.cos(angle + 0.35) * outer, 0.035, Math.sin(angle + 0.35) * outer], [Math.cos(angle + 0.75) * outer, 0.035, Math.sin(angle + 0.75) * outer], [Math.cos(angle + 0.5) * inner, 0, Math.sin(angle + 0.5) * inner]]);
    }
  });
  for (let bar = -3; bar <= 3; bar++) {
    const z = bar * width * 0.09;
    const half = Math.sqrt(Math.max(0, (width * 0.4) ** 2 - z ** 2));
    context.beam(steel, [-half, height + 0.4, z], [half, height + 0.4, z], 0.008);
  }
  return (seconds, night, season) => {
    const speed = season === "summer" ? 8 : season === "winter" ? 2 : 4;
    fan.rotation.y = (context.local.yaw ?? 0) + seconds * speed + phase;
    fan.visible = !night || season === "summer";
  };
}

export function buildSplitCondenser(context: ArchitectureContext, width = 0.85, height = 0.6): Animation {
  const { white, aluminum, dark, steel } = context.palette;
  context.box(white, 0, height / 2 + 0.07, -0.16, width, height, 0.36);
  context.box(dark, -width * 0.15, height / 2 + 0.07, 0.028, height * 0.8, height * 0.8, 0.012);
  const fan = context.moving("Condenser rotor", [-width * 0.15, height / 2 + 0.07, 0.04], (moving) => {
    moving.oval(steel, 0, 0, 0, 0.045, 0.045, 0.022);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3;
      moving.panel(aluminum, [[Math.cos(a) * 0.035, Math.sin(a) * 0.035, 0], [Math.cos(a + 0.2) * height * 0.31, Math.sin(a + 0.2) * height * 0.31, 0.008], [Math.cos(a + 0.7) * height * 0.31, Math.sin(a + 0.7) * height * 0.31, 0.008], [Math.cos(a + 0.4) * 0.035, Math.sin(a + 0.4) * 0.035, 0]]);
    }
  });
  for (let grille = -3; grille <= 3; grille++) {
    const y = height / 2 + 0.07 + grille * height * 0.09;
    context.box(white, -width * 0.15, y, 0.06, height * 0.75, 0.012, 0.012);
  }
  for (const x of [-width * 0.3, width * 0.3]) {
    context.box(steel, x, 0.025, -0.14, 0.08, 0.05, 0.5);
    context.box(steel, x, 0.12, -0.35, 0.08, 0.22, 0.04);
  }
  context.tube(white, [[width / 2, 0.21, -0.16], [width / 2 + 0.08, 0.21, -0.16], [width / 2 + 0.08, 0.18, -0.4]], 0.023);
  return (seconds, _night, season) => {
    fan.rotation.z = seconds * (season === "summer" ? 11 : season === "winter" ? 6 : 2);
  };
}

export function buildSolarArray(context: ArchitectureContext, columns: number, rows: number, tilt = 0.24): void {
  const { reflectiveGlass, aluminum, steel } = context.palette;
  const width = 0.99;
  const length = 1.65;
  const cellMaterial = context.material({ color: "#1e3346", roughness: 0.22, metalness: 0.3 });
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = (column - (columns - 1) / 2) * (width + 0.04);
      const z = (row - (rows - 1) / 2) * (length + 0.35);
      const topY = 0.27 + length * Math.sin(tilt);
      const frontZ = z + length * Math.cos(tilt) / 2;
      const backZ = z - length * Math.cos(tilt) / 2;
      context.panel(cellMaterial, [[x - width / 2, 0.27, frontZ], [x + width / 2, 0.27, frontZ], [x + width / 2, topY, backZ], [x - width / 2, topY, backZ]]);
      for (const side of [-1, 1]) {
        context.rectangularBeam(aluminum, [x + side * width / 2, 0.27, frontZ], [x + side * width / 2, topY, backZ], 0.025, 0.035);
        context.beam(steel, [x + side * width * 0.35, 0.04, backZ], [x + side * width * 0.35, topY - 0.03, backZ], 0.015);
        context.box(steel, x + side * width * 0.35, 0.025, z, 0.09, 0.05, length * 0.92);
      }
      for (let bus = 1; bus < 6; bus++) {
        const bx = x - width / 2 + bus * width / 6;
        context.rectangularBeam(aluminum, [bx, 0.276, frontZ], [bx, topY + 0.006, backZ], 0.003, 0.003);
      }
      for (let cell = 1; cell < 10; cell++) {
        const t = cell / 10;
        context.box(reflectiveGlass, x, 0.277 + (topY - 0.27) * t, frontZ + (backZ - frontZ) * t, width - 0.035, 0.003, 0.008);
      }
    }
  }
}

export function buildRoofDrain(context: ArchitectureContext): void {
  const { steel, aluminum, rubber } = context.palette;
  context.disc(rubber, 0, 0.008, 0, 0.16, 0.016);
  context.disc(steel, 0, 0.02, 0, 0.12, 0.025);
  for (let rib = 0; rib < 8; rib++) {
    const angle = rib * Math.PI / 4;
    context.beam(aluminum, [0, 0.085, 0], [Math.cos(angle) * 0.11, 0.03, Math.sin(angle) * 0.11], 0.007);
  }
}

export function buildLightningProtection(context: ArchitectureContext, width: number, depth: number): void {
  const { aluminum, steel } = context.palette;
  const y = 0.14;
  for (const side of [-1, 1]) {
    context.beam(aluminum, [-width / 2, y, side * depth / 2], [width / 2, y, side * depth / 2], 0.006);
    context.beam(aluminum, [side * width / 2, y, -depth / 2], [side * width / 2, y, depth / 2], 0.006);
    for (const corner of [-1, 1]) {
      context.beam(aluminum, [side * width / 2, 0.02, corner * depth / 2], [side * width / 2, 0.8, corner * depth / 2], 0.01);
      context.box(steel, side * width / 2, 0.035, corner * depth / 2, 0.15, 0.07, 0.15);
    }
  }
}

export function buildRoofAccessHatch(context: ArchitectureContext, width: number, depth: number, phase: number): Animation {
  const { steel, aluminum, rubber } = context.palette;
  context.box(steel, 0, 0.16, 0, width, 0.32, depth);
  context.box(rubber, 0, 0.325, 0, width - 0.03, 0.03, depth - 0.03);
  const lid = context.moving("Roof maintenance hatch", [0, 0.35, -depth / 2], (moving) => {
    moving.box(aluminum, 0, 0.03, depth / 2, width + 0.06, 0.06, depth + 0.06);
    moving.box(steel, 0, 0.075, depth - 0.17, 0.2, 0.03, 0.035);
    for (const side of [-1, 1]) moving.beam(steel, [side * width * 0.32, -0.15, depth * 0.6], [side * width * 0.32, 0, depth * 0.8], 0.01);
  });
  return (seconds, night) => {
    lid.rotation.x = night ? 0 : -openingPulse(seconds, 180, phase, 8, 3) * 1.1;
  };
}

