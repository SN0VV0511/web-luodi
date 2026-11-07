import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";

export type DigitalDisplay = {
  set: (value: number) => void;
  setEnabled: (enabled: boolean) => void;
};

export function buildDigitalNumber(context: ArchitectureContext, digits: number, height: number, decimalPlaces = 0): DigitalDisplay {
  const count = Math.max(1, Math.min(7, digits));
  const cellWidth = height * 0.64;
  const width = cellWidth * count;
  const thickness = height * 0.065;
  const { dark, screen, aluminum } = context.palette;
  context.box(aluminum, 0, 0, 0, width + height * 0.2, height * 1.25, 0.025);
  context.box(dark, 0, 0, 0.018, width + height * 0.12, height * 1.12, 0.012);
  const segments: THREE.Group[][] = [];
  const decimalDots: THREE.Group[] = [];
  const numericMasks = [63, 6, 91, 79, 102, 109, 125, 7, 127, 111];
  const centers: [number, number, boolean][] = [
    [0, 0.44, true],
    [0.24, 0.22, false],
    [0.24, -0.22, false],
    [0, -0.44, true],
    [-0.24, -0.22, false],
    [-0.24, 0.22, false],
    [0, 0, true],
  ];
  for (let digit = 0; digit < count; digit++) {
    const digitX = (digit - (count - 1) / 2) * cellWidth;
    segments.push(centers.map(([x, y, horizontal]) => context.moving("Instrument numeric segment", [digitX + x * height, y * height, 0.028], moving => {
      moving.box(screen, 0, 0, 0, horizontal ? height * 0.41 : thickness, horizontal ? thickness : height * 0.35, 0.006);
    })));
    decimalDots.push(context.moving("Instrument decimal point", [digitX + cellWidth * 0.46, -height * 0.43, 0.028], moving => {
      moving.box(screen, 0, 0, 0, thickness, thickness, 0.006);
    }));
  }
  let enabled = true;
  let previousText = "";
  let currentValue = 0;
  const set = (value: number) => {
    currentValue = value;
    const safeValue = Number.isFinite(value) ? Math.abs(value) : 0;
    const maximum = Math.pow(10, count) - 1;
    const rounded = Math.min(maximum, Math.round(safeValue * Math.pow(10, decimalPlaces)));
    const text = String(rounded).padStart(count, " ");
    if (text === previousText) return;
    previousText = text;
    for (let digit = 0; digit < count; digit++) {
      const character = text[digit];
      const mask = character === " " ? 0 : numericMasks[Number(character)];
      for (let segment = 0; segment < 7; segment++) segments[digit][segment].visible = enabled && (mask & (1 << segment)) !== 0;
      decimalDots[digit].visible = enabled && decimalPlaces > 0 && digit === count - decimalPlaces - 1;
    }
  };
  const setEnabled = (value: boolean) => {
    if (value === enabled) return;
    enabled = value;
    previousText = "";
    set(currentValue);
  };
  set(0);
  return { set, setEnabled };
}

export function buildAnalogClock(context: ArchitectureContext, radius: number, offsetHours = 0): Animation {
  const { white, dark, aluminum, red, glass } = context.palette;
  context.beam(aluminum, [0, 0, -0.025], [0, 0, 0.025], radius);
  context.beam(white, [0, 0, 0.027], [0, 0, 0.03], radius * 0.93);
  for (let tick = 0; tick < 60; tick++) {
    const angle = tick / 60 * Math.PI * 2;
    const major = tick % 5 === 0;
    const inside = radius * (major ? 0.76 : 0.84);
    const outside = radius * 0.89;
    context.beam(dark, [Math.sin(angle) * inside, Math.cos(angle) * inside, 0.034], [Math.sin(angle) * outside, Math.cos(angle) * outside, 0.034], radius * (major ? 0.015 : 0.006));
  }
  const hour = context.moving("Clock hour hand", [0, 0, 0.041], moving => {
    moving.box(dark, 0, radius * 0.21, 0, radius * 0.05, radius * 0.55, 0.008);
  });
  const minute = context.moving("Clock minute hand", [0, 0, 0.052], moving => {
    moving.box(dark, 0, radius * 0.32, 0, radius * 0.034, radius * 0.76, 0.006);
  });
  const second = context.moving("Clock second hand", [0, 0, 0.061], moving => {
    moving.box(red, 0, radius * 0.27, 0, radius * 0.012, radius * 0.94, 0.004);
    moving.beam(red, [0, 0, -0.002], [0, 0, 0.004], radius * 0.055);
  });
  context.beam(glass, [0, 0, 0.068], [0, 0, 0.071], radius * 0.94);
  return seconds => {
    const localSeconds = seconds * 30 + offsetHours * 3600;
    hour.rotation.z = -localSeconds / 43200 * Math.PI * 2;
    minute.rotation.z = -localSeconds / 3600 * Math.PI * 2;
    second.rotation.z = -localSeconds / 60 * Math.PI * 2;
  };
}

export function buildNeedleMeter(context: ArchitectureContext, width: number, height: number, value: () => number, maxValue = 1): Animation {
  const { white, aluminum, dark, red, glass } = context.palette;
  context.box(aluminum, 0, 0, 0, width, height, 0.06);
  context.box(white, 0, 0, 0.035, width * 0.9, height * 0.82, 0.012);
  const radius = width * 0.37;
  for (let tick = 0; tick <= 10; tick++) {
    const angle = -Math.PI * 0.31 + tick * Math.PI * 0.62 / 10;
    const major = tick % 5 === 0;
    context.beam(dark, [Math.sin(angle) * radius, -height * 0.3 + Math.cos(angle) * radius, 0.045], [Math.sin(angle) * (radius - height * (major ? 0.1 : 0.055)), -height * 0.3 + Math.cos(angle) * (radius - height * (major ? 0.1 : 0.055)), 0.045], 0.002);
  }
  const needle = context.moving("Analog meter needle", [0, -height * 0.3, 0.049], moving => {
    moving.box(red, 0, radius * 0.45, 0, 0.004, radius * 0.9, 0.003);
    moving.beam(dark, [0, 0, -0.002], [0, 0, 0.004], 0.012);
  });
  context.box(glass, 0, 0, 0.056, width * 0.91, height * 0.84, 0.008);
  let shown = 0;
  let previous = 0;
  return seconds => {
    const delta = Math.max(0, Math.min(0.15, seconds - previous));
    previous = seconds;
    shown += (THREE.MathUtils.clamp(value() / maxValue, 0, 1) - shown) * (1 - Math.exp(-delta * 7));
    needle.rotation.z = Math.PI * 0.31 - shown * Math.PI * 0.62;
  };
}

export function buildBarGraph(context: ArchitectureContext, width: number, height: number, value: () => number, segments = 10): Animation {
  const { dark, green, yellow, red, screen } = context.palette;
  const count = Math.max(3, Math.min(24, segments));
  context.box(dark, 0, 0, 0, width + 0.04, height + 0.04, 0.025);
  const bars: THREE.Group[] = [];
  for (let segment = 0; segment < count; segment++) {
    const x = -width / 2 + (segment + 0.5) * width / count;
    const color = segment >= count * 0.85 ? red : segment >= count * 0.65 ? yellow : green;
    context.box(color, x, 0, 0.017, width / count * 0.7, height, 0.008);
    bars.push(context.moving("Power meter bar", [x, 0, 0.023], moving => {
      moving.box(screen, 0, 0, 0, width / count * 0.6, height * 0.82, 0.005);
    }));
  }
  return () => {
    const lit = Math.round(THREE.MathUtils.clamp(value(), 0, 1) * count);
    bars.forEach((bar, index) => { bar.visible = index < lit; });
  };
}

export function buildSignalStack(context: ArchitectureContext, active: () => "green" | "amber" | "red"): Animation {
  const { steel, green, yellow, red, screen } = context.palette;
  context.disc(steel, 0, 0.04, 0, 0.045, 0.08);
  const colors = [green, yellow, red];
  const lenses: THREE.Group[] = [];
  for (let light = 0; light < 3; light++) {
    const y = 0.13 + light * 0.09;
    context.disc(colors[light], 0, y, 0, 0.038, 0.075);
    context.disc(steel, 0, y + 0.042, 0, 0.041, 0.012);
    lenses.push(context.moving("Equipment status lamp", [0, y, 0], moving => {
      moving.disc(screen, 0, 0, 0, 0.04, 0.045);
    }));
  }
  return seconds => {
    const value = active();
    const index = value === "red" ? 2 : value === "amber" ? 1 : 0;
    for (let light = 0; light < lenses.length; light++) lenses[light].visible = light === index && (index !== 1 || Math.floor(seconds * 2) % 2 === 0);
  };
}

export function buildRotameter(context: ArchitectureContext, flow: () => number): Animation {
  const { aluminum, glass, dark, red, white } = context.palette;
  const height = 0.32;
  context.box(aluminum, 0, 0, 0, 0.08, height + 0.06, 0.06);
  context.box(white, 0, 0, 0.035, 0.065, height, 0.008);
  context.disc(glass, 0, 0, 0.055, 0.018, height * 0.95);
  for (let tick = 0; tick <= 8; tick++) context.box(dark, 0.022, -height * 0.42 + tick * height * 0.105, 0.052, tick % 2 === 0 ? 0.026 : 0.015, 0.004, 0.004);
  const float = context.moving("Flow indicator float", [0, -height * 0.4, 0.055], moving => {
    moving.oval(red, 0, 0, 0, 0.013, 0.013, 0.013);
  });
  const rest = float.position.clone();
  return () => {
    float.position.copy(rest);
    float.position.y += THREE.MathUtils.clamp(flow(), 0, 1) * height * 0.8;
  };
}

export function buildThermometer(context: ArchitectureContext, temperature: () => number): Animation {
  const { white, aluminum, red, glass, dark } = context.palette;
  const height = 0.3;
  context.box(aluminum, 0, 0, 0, 0.07, height + 0.05, 0.02);
  context.box(white, 0, 0, 0.014, 0.06, height + 0.035, 0.008);
  context.disc(glass, -0.012, 0, 0.025, 0.006, height * 0.86);
  context.oval(red, -0.012, -height * 0.44, 0.025, 0.012, 0.012, 0.005);
  const column = context.moving("Temperature capillary column", [-0.012, -height * 0.42, 0.026], moving => {
    moving.box(red, 0, height * 0.4, 0, 0.004, height * 0.8, 0.003);
  });
  for (let tick = 0; tick <= 12; tick++) context.box(dark, 0.014, -height * 0.4 + tick * height * 0.8 / 12, 0.02, tick % 3 === 0 ? 0.025 : 0.012, 0.003, 0.003);
  return () => { column.scale.y = Math.max(0.005, Math.min(1, (temperature() + 20) / 70)); };
}

export function buildIntercomScreen(context: ArchitectureContext, active: () => boolean): Animation {
  const { dark, aluminum, screen, green, red } = context.palette;
  context.box(aluminum, 0, 0, 0, 0.23, 0.42, 0.035);
  context.box(dark, 0, 0.08, 0.025, 0.18, 0.17, 0.008);
  const display = context.moving("Intercom display", [0, 0.08, 0.032], moving => {
    moving.box(screen, 0, 0, 0, 0.15, 0.14, 0.006);
    moving.oval(dark, 0, 0.02, 0.006, 0.023, 0.023, 0.002);
    moving.box(dark, 0, -0.025, 0.006, 0.055, 0.035, 0.004);
  });
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 3; column++) context.box(dark, -0.055 + column * 0.055, -0.055 - row * 0.044, 0.026, 0.035, 0.026, 0.012);
  }
  context.box(green, -0.055, -0.185, 0.027, 0.035, 0.02, 0.012);
  context.box(red, 0.055, -0.185, 0.027, 0.035, 0.02, 0.012);
  for (let grille = 0; grille < 4; grille++) context.box(dark, -0.045 + grille * 0.03, 0.185, 0.024, 0.012, 0.02, 0.005);
  return () => { display.visible = active(); };
}
