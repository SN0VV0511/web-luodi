import * as THREE from "three";
import { ArchitectureContext, openingPulse, type Animation } from "./context";

export function buildSwingDoor(context: ArchitectureContext, width: number, height: number, offset: number, inward = true): Animation {
  const { bronze, aluminum, glass, rubber } = context.palette;
  const leaf = context.moving("Framed entrance door", [-width / 2, 0, 0], (moving) => {
    moving.box(glass, width / 2, height / 2, 0, width - 0.1, height - 0.18, 0.03);
    for (const x of [0.022, width - 0.022]) moving.box(bronze, x, height / 2, 0.01, 0.045, height, 0.075);
    moving.box(bronze, width / 2, 0.06, 0, width, 0.12, 0.075);
    moving.box(bronze, width / 2, height - 0.025, 0, width, 0.05, 0.075);
    moving.box(rubber, width, height / 2, 0, 0.012, height - 0.02, 0.045);
    for (const face of [-1, 1]) {
      moving.beam(aluminum, [width - 0.15, 0.85, face * 0.075], [width - 0.15, 1.35, face * 0.075], 0.012);
      moving.beam(aluminum, [width - 0.15, 0.88, face * 0.075], [width - 0.15, 0.88, 0], 0.009);
      moving.beam(aluminum, [width - 0.15, 1.32, face * 0.075], [width - 0.15, 1.32, 0], 0.009);
    }
    moving.box(aluminum, 0.22, height - 0.075, -0.06, 0.24, 0.055, 0.07);
    moving.box(aluminum, 0.4, height - 0.025, -0.08, 0.38, 0.018, 0.026);
    for (const y of [0.25, height / 2, height - 0.25]) moving.disc(aluminum, 0, y, 0, 0.018, 0.09);
    moving.box(context.palette.white, width / 2, 1.1, 0.02, width - 0.13, 0.025, 0.01);
  });
  const baseYaw = leaf.rotation.y;
  const senseEntrance = context.doorSensor([0, 0, 0], Math.max(2, width * 1.1));
  context.box(rubber, 0, 0.015, 0, width + 0.06, 0.03, 0.11);
  for (const side of [-1, 1]) context.box(bronze, side * (width / 2 + 0.035), height / 2, 0, 0.055, height + 0.06, 0.12);
  context.box(bronze, 0, height + 0.035, 0, width + 0.12, 0.06, 0.12);
  return (seconds) => {
    const open = senseEntrance(seconds);
    leaf.rotation.y = baseYaw + open * (inward ? -1.22 : 1.22);
  };
}

export function buildAutomaticSlidingDoor(context: ArchitectureContext, width: number, height: number, offset: number): Animation {
  const { aluminum, glass, rubber, dark, screen } = context.palette;
  const leaves = [-1, 1].map((side) => {
    return context.moving("Automatic sliding entrance leaf", [side * width / 4, 0, 0], (moving) => {
      const leafWidth = width / 2;
      moving.box(glass, 0, height / 2, 0, leafWidth - 0.06, height - 0.08, 0.028);
      for (const edge of [-1, 1]) moving.box(aluminum, edge * leafWidth / 2, height / 2, 0, 0.035, height, 0.055);
      moving.box(aluminum, 0, 0.025, 0, leafWidth, 0.05, 0.055);
      moving.box(aluminum, 0, height - 0.02, 0, leafWidth, 0.04, 0.055);
      moving.box(rubber, -side * leafWidth / 2, height / 2, 0.01, 0.012, height, 0.035);
      moving.box(context.palette.white, 0, 1.05, 0.022, leafWidth - 0.07, 0.03, 0.008);
    });
  });
  const rest = leaves.map((leaf) => leaf.position.clone());
  const direction = new THREE.Vector3(Math.cos(context.local.yaw ?? 0), 0, -Math.sin(context.local.yaw ?? 0));
  const senseEntrance = context.doorSensor([0, 0, 0], Math.max(2.3, width * 0.8));
  context.box(aluminum, 0, height + 0.09, -0.02, width * 2 + 0.1, 0.18, 0.16);
  context.box(dark, 0, height + 0.12, 0.085, 0.16, 0.075, 0.055);
  context.box(screen, 0, height + 0.115, 0.116, 0.055, 0.025, 0.008);
  context.box(rubber, 0, 0.018, 0, width * 2, 0.035, 0.11);
  for (const side of [-1, 1]) {
    context.box(glass, side * width * 0.75, height / 2, -0.08, width / 2 - 0.06, height - 0.06, 0.028);
    context.box(aluminum, side * width, height / 2, -0.055, 0.045, height, 0.11);
  }
  return (seconds) => {
    const openness = senseEntrance(seconds);
    leaves.forEach((leaf, index) => {
      const side = index === 0 ? -1 : 1;
      leaf.position.copy(rest[index]).addScaledVector(direction, side * openness * width * 0.49);
    });
  };
}

export function buildRollerShutter(context: ArchitectureContext, width: number, height: number, phase: number): Animation {
  const { steel, aluminum, rubber } = context.palette;
  context.box(steel, 0, height + 0.18, -0.05, width + 0.2, 0.36, 0.36);
  for (const side of [-1, 1]) {
    context.box(steel, side * (width / 2 + 0.035), height / 2, 0, 0.07, height, 0.11);
    context.box(rubber, side * width / 2, height / 2, 0.04, 0.012, height, 0.025);
  }
  const slats = context.moving("Rolling security shutter", [0, height, 0], (moving) => {
    const count = Math.ceil(height / 0.075);
    for (let i = 0; i < count; i++) {
      const y = -(i + 0.5) * height / count;
      moving.box(aluminum, 0, y, 0, width, height / count - 0.007, 0.026);
      moving.box(steel, 0, y - height / count / 2, 0.014, width, 0.007, 0.012);
    }
    moving.box(steel, 0, -height, 0, width + 0.02, 0.065, 0.08);
  });
  return (seconds, night) => {
    const evening = THREE.MathUtils.euclideanModulo(seconds + phase, 240);
    const closed = night ? 0.98 : 0.06 + openingPulse(evening, 240, 208, 12, 5) * 0.91;
    slats.scale.y = closed;
  };
}

export function buildSectionalGarageDoor(context: ArchitectureContext, width: number, height: number, phase: number): Animation {
  const { steel, aluminum, white, glass, rubber } = context.palette;
  const panelHeight = height / 5;
  const panels = Array.from({ length: 5 }, (_, index) => context.moving("Sectional garage panel", [0, index * panelHeight, 0], (moving) => {
    moving.box(white, 0, panelHeight / 2, 0, width - 0.07, panelHeight - 0.015, 0.065);
    moving.box(rubber, 0, 0.008, 0.02, width - 0.04, 0.016, 0.025);
    for (const side of [-1, 1]) moving.box(aluminum, side * width * 0.35, panelHeight / 2, -0.045, 0.07, panelHeight, 0.035);
    if (index === 3) {
      for (const column of [-1, 0, 1]) {
        moving.box(rubber, column * width * 0.26, panelHeight / 2, 0.044, width * 0.2, panelHeight * 0.66, 0.012);
        moving.box(glass, column * width * 0.26, panelHeight / 2, 0.054, width * 0.18, panelHeight * 0.55, 0.016);
      }
    }
  }));
  const rest = panels.map((panel) => panel.position.clone());
  const backwards = new THREE.Vector3(-Math.sin(context.local.yaw ?? 0), 0, -Math.cos(context.local.yaw ?? 0));
  for (const side of [-1, 1]) {
    context.box(steel, side * (width / 2 + 0.06), height / 2, -0.06, 0.07, height, 0.09);
    context.box(steel, side * (width / 2 + 0.06), height + 0.18, -height / 2, 0.07, 0.09, height + 0.1);
    context.beam(steel, [side * width / 2, height + 0.18, -height], [side * width / 2, height + 0.65, -height], 0.015);
  }
  context.box(aluminum, 0, height + 0.2, -0.08, width + 0.2, 0.11, 0.14);
  context.box(steel, 0, height + 0.25, -height * 0.8, 0.25, 0.15, 0.3);
  return (seconds) => {
    const lift = openingPulse(seconds, 65, phase, 12, 4) * (height + 0.65);
    panels.forEach((panel, index) => {
      const raised = index * panelHeight + lift;
      const bend = THREE.MathUtils.clamp((raised - height + 0.25) / 0.5, 0, 1);
      panel.position.copy(rest[index]);
      panel.position.y = context.local.y + Math.min(height + 0.2, raised);
      panel.position.addScaledVector(backwards, Math.max(0, raised - height + 0.25));
      panel.rotation.x = -bend * Math.PI / 2;
    });
  };
}

export function buildFireExit(context: ArchitectureContext, width: number, height: number): void {
  const { steel, red, aluminum, green, screen } = context.palette;
  context.box(steel, 0, height / 2, -0.035, width + 0.12, height + 0.08, 0.12);
  context.box(red, 0, height / 2, 0.035, width - 0.025, height - 0.04, 0.065);
  context.box(aluminum, 0, 1.03, 0.095, width * 0.72, 0.035, 0.045);
  for (const side of [-1, 1]) context.box(aluminum, side * width * 0.32, 1.03, 0.075, 0.055, 0.1, 0.075);
  for (const y of [0.2, height / 2, height - 0.2]) context.disc(aluminum, -width / 2 + 0.03, y, 0.055, 0.015, 0.09);
  context.box(green, 0, height + 0.25, 0.025, 0.45, 0.17, 0.05);
  context.box(screen, -0.11, height + 0.25, 0.055, 0.05, 0.1, 0.015);
  context.box(screen, 0.04, height + 0.25, 0.055, 0.16, 0.02, 0.015);
  context.box(screen, 0.11, height + 0.265, 0.055, 0.055, 0.02, 0.015, 0, -Math.PI / 4);
  context.box(screen, 0.11, height + 0.235, 0.055, 0.055, 0.02, 0.015, 0, Math.PI / 4);
}
