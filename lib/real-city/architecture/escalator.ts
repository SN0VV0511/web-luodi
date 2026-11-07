import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";

type BeltSample = { y: number; z: number; returnRun: boolean };
type PathSegment = {
  length: number;
  start: number;
  sample: (fraction: number, target: BeltSample) => void;
};

class EscalatorStepPath {
  readonly segments: PathSegment[] = [];
  length = 0;
  readonly slopeLength: number;
  readonly landing = 0.62;
  readonly lowerY = 0.18;
  readonly returnOffset = 0.56;

  constructor(readonly rise: number, readonly run: number) {
    this.slopeLength = Math.hypot(rise, run);
    this.line(this.lowerY, this.landing, this.lowerY, 0, false);
    this.line(this.lowerY, 0, this.lowerY + rise, -run, false);
    this.line(this.lowerY + rise, -run, this.lowerY + rise, -run - this.landing, false);
    const radius = this.returnOffset / 2;
    this.arc(this.lowerY + rise - radius, -run - this.landing, radius, 0, Math.PI, true);
    this.line(this.lowerY + rise - this.returnOffset, -run - this.landing, this.lowerY + rise - this.returnOffset, -run, true);
    this.line(this.lowerY + rise - this.returnOffset, -run, this.lowerY - this.returnOffset, 0, true);
    this.line(this.lowerY - this.returnOffset, 0, this.lowerY - this.returnOffset, this.landing, true);
    this.arc(this.lowerY - radius, this.landing, radius, Math.PI, Math.PI * 2, true);
  }

  private line(y0: number, z0: number, y1: number, z1: number, hidden: boolean): void {
    const length = Math.hypot(y1 - y0, z1 - z0);
    const start = this.length;
    this.segments.push({
      length,
      start,
      sample: (fraction, target) => {
        target.y = THREE.MathUtils.lerp(y0, y1, fraction);
        target.z = THREE.MathUtils.lerp(z0, z1, fraction);
        target.returnRun = hidden;
      },
    });
    this.length += length;
  }

  private arc(cy: number, cz: number, radius: number, from: number, to: number, hidden: boolean): void {
    const length = Math.abs(to - from) * radius;
    const start = this.length;
    this.segments.push({
      length,
      start,
      sample: (fraction, target) => {
        const angle = THREE.MathUtils.lerp(from, to, fraction);
        target.y = cy + Math.cos(angle) * radius;
        target.z = cz - Math.sin(angle) * radius;
        target.returnRun = hidden;
      },
    });
    this.length += length;
  }

  sample(distance: number, target: BeltSample): void {
    const wrapped = THREE.MathUtils.euclideanModulo(distance, this.length);
    for (const segment of this.segments) {
      if (wrapped > segment.start + segment.length) continue;
      const fraction = THREE.MathUtils.clamp((wrapped - segment.start) / segment.length, 0, 1);
      segment.sample(fraction, target);
      return;
    }
    this.segments[0].sample(0, target);
  }
}

function buildEscalatorTruss(context: ArchitectureContext, width: number, rise: number, run: number): void {
  const { steel, aluminum, dark } = context.palette;
  const half = width / 2 + 0.12;
  const low: Point = [0, -0.13, 0];
  const high: Point = [0, rise - 0.13, -run];
  for (const side of [-1, 1]) {
    const x = side * half;
    context.rectangularBeam(steel, [x, low[1], low[2]], [x, high[1], high[2]], 0.055, 0.09);
    context.rectangularBeam(steel, [x, low[1] - 0.45, low[2]], [x, high[1] - 0.45, high[2]], 0.055, 0.09);
    const bays = Math.max(4, Math.ceil(run / 0.65));
    for (let bay = 0; bay <= bays; bay++) {
      const fraction = bay / bays;
      const y = low[1] + rise * fraction;
      const z = -run * fraction;
      context.rectangularBeam(steel, [x, y, z], [x, y - 0.45, z], 0.04, 0.04);
      if (bay < bays) {
        const next = (bay + 1) / bays;
        context.rectangularBeam(steel, [x, y, z], [x, low[1] + rise * next - 0.45, -run * next], 0.025, 0.035);
      }
    }
    context.panel(aluminum, [[x, 0.14, 0.65], [x, 0.14, 0], [x, rise + 0.14, -run], [x, rise - 0.5, -run]]);
    context.panel(aluminum, [[x, 0.14, 0.65], [x, rise - 0.5, -run], [x, -0.5, 0], [x, -0.5, 0.65]]);
    context.panel(dark, [[x, rise + 0.14, -run], [x, rise + 0.14, -run - 0.7], [x, rise - 0.5, -run - 0.7], [x, rise - 0.5, -run]]);
  }
  for (const fraction of [0, 0.5, 1]) {
    const y = rise * fraction - 0.48;
    const z = -run * fraction;
    context.box(steel, 0, y, z, width + 0.3, 0.08, 0.1);
  }
  context.panel(dark, [[-half, -0.55, 0], [half, -0.55, 0], [half, rise - 0.55, -run], [-half, rise - 0.55, -run]]);
}

function buildCombPlate(context: ArchitectureContext, width: number, elevated: boolean): void {
  const { aluminum, yellow, dark, steel } = context.palette;
  context.box(aluminum, 0, 0.02, 0, width + 0.18, 0.04, 0.54);
  const ribs = Math.max(12, Math.floor(width / 0.024));
  for (let rib = 0; rib < ribs; rib++) {
    const x = -width / 2 + (rib + 0.5) * width / ribs;
    context.box(dark, x, 0.042, 0.02, 0.006, 0.005, 0.45);
    context.box(yellow, x, 0.036, elevated ? 0.31 : -0.31, width / ribs * 0.45, 0.02, 0.1);
  }
  context.box(yellow, 0, 0.04, elevated ? 0.25 : -0.25, width + 0.025, 0.025, 0.06);
  for (const side of [-1, 1]) {
    context.box(steel, side * (width / 2 + 0.055), 0.03, 0, 0.06, 0.055, 0.5);
    for (const z of [-0.19, 0.19]) context.disc(aluminum, side * (width / 2 + 0.05), 0.062, z, 0.01, 0.012);
  }
}

function buildStep(context: ArchitectureContext, width: number, depth: number, rise: number): THREE.Group {
  const { aluminum, steel, dark, yellow } = context.palette;
  return context.moving("Linked escalator tread", [0, 0, 0], moving => {
    moving.box(steel, 0, -rise / 2, 0, width - 0.025, rise, depth - 0.015);
    moving.box(aluminum, 0, -0.006, 0, width - 0.012, 0.024, depth);
    const grooves = Math.max(14, Math.floor(width / 0.032));
    for (let groove = 0; groove < grooves; groove++) {
      const x = -width / 2 + (groove + 0.5) * width / grooves;
      moving.box(dark, x, 0.008, 0, 0.006, 0.004, depth - 0.025);
      moving.box(aluminum, x, -rise / 2, depth / 2 - 0.01, 0.012, rise - 0.015, 0.01);
    }
    for (const side of [-1, 1]) moving.box(yellow, side * (width / 2 - 0.02), 0.011, 0, 0.025, 0.004, depth - 0.018);
    moving.box(yellow, 0, 0.011, depth / 2 - 0.018, width - 0.02, 0.004, 0.025);
    for (const side of [-1, 1]) {
      moving.box(steel, side * (width / 2 + 0.025), -rise * 0.48, 0, 0.04, 0.06, 0.06);
    }
  });
}

function buildBalustrade(context: ArchitectureContext, width: number, rise: number, run: number): void {
  const { aluminum, glass, rubber } = context.palette;
  const railHeight = 1.04;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.07);
    context.panel(glass, [[x, 0.2, 0.4], [x, railHeight, 0.4], [x, railHeight, 0], [x, 0.2, 0]]);
    context.panel(glass, [[x, 0.2, 0], [x, railHeight, 0], [x, rise + railHeight, -run], [x, rise + 0.2, -run]]);
    context.panel(glass, [[x, rise + 0.2, -run], [x, rise + railHeight, -run], [x, rise + railHeight, -run - 0.4], [x, rise + 0.2, -run - 0.4]]);
    context.rectangularBeam(aluminum, [x, 0.23, 0], [x, rise + 0.23, -run], 0.09, 0.13);
    context.rectangularBeam(rubber, [x - side * 0.05, 0.2, 0], [x - side * 0.05, rise + 0.2, -run], 0.035, 0.045);
    context.box(aluminum, x, 0.22, 0.32, 0.09, 0.13, 0.66);
    context.box(aluminum, x, rise + 0.22, -run - 0.32, 0.09, 0.13, 0.66);
    const brushCount = Math.max(5, Math.ceil(run / 0.16));
    for (let brush = 0; brush < brushCount; brush++) {
      const fraction = (brush + 0.5) / brushCount;
      context.box(rubber, x - side * 0.055, rise * fraction + 0.2, -run * fraction, 0.045, 0.025, run / brushCount * 0.9);
    }
    for (const fraction of [0.12, 0.46, 0.8]) {
      const y = rise * fraction + 0.28;
      const z = -run * fraction;
      context.box(aluminum, x, y, z, 0.1, 0.12, 0.07);
    }
  }
}

function buildHandrailLoop(context: ArchitectureContext, width: number, rise: number, run: number): { markers: THREE.Group[]; paths: THREE.CatmullRomCurve3[] } {
  const markers: THREE.Group[] = [];
  const paths: THREE.CatmullRomCurve3[] = [];
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.075);
    const points: Point[] = [
      [x, 0.48, 0.44],
      [x, 0.58, 0.62],
      [x, 0.89, 0.62],
      [x, 1.04, 0.43],
      [x, 1.04, 0],
      [x, rise + 1.04, -run],
      [x, rise + 1.04, -run - 0.43],
      [x, rise + 0.89, -run - 0.62],
      [x, rise + 0.58, -run - 0.62],
      [x, rise + 0.48, -run - 0.44],
      [x, rise + 0.47, -run],
      [x, 0.47, 0],
    ];
    context.tube(context.palette.rubber, points, 0.034, true);
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), true, "centripetal");
    curve.arcLengthDivisions = 240;
    curve.updateArcLengths();
    paths.push(curve);
    const marker = context.moving("Escalator handrail splice marker", [x, 1.04, 0], moving => {
      moving.box(context.palette.aluminum, 0, 0, 0, 0.068, 0.012, 0.016);
    });
    markers.push(marker);
  }
  return { markers, paths };
}

function buildEscalatorControls(context: ArchitectureContext, width: number, rise: number, run: number): { arrows: THREE.Group[]; stopped: THREE.Group[] } {
  const arrows: THREE.Group[] = [];
  const stopped: THREE.Group[] = [];
  for (const top of [false, true]) {
    const y = top ? rise : 0;
    const z = top ? -run - 0.62 : 0.62;
    const wall = context.at({ x: width / 2 + 0.12, y, z, yaw: top ? Math.PI : 0 });
    wall.box(context.palette.steel, 0, 0.58, 0, 0.11, 0.3, 0.08);
    wall.box(context.palette.yellow, 0, 0.67, 0.045, 0.06, 0.06, 0.015);
    wall.box(context.palette.red, 0, 0.67, 0.056, 0.035, 0.035, 0.015);
    wall.box(context.palette.dark, 0, 0.51, 0.045, 0.07, 0.07, 0.012);
    const arrow = wall.moving("Escalator direction indication", [0, 0.51, 0.055], moving => {
      moving.box(context.palette.green, 0, -0.004, 0, 0.012, 0.045, 0.008);
      moving.box(context.palette.green, -0.01, 0.011, 0, 0.025, 0.009, 0.008, 0, Math.PI / 4);
      moving.box(context.palette.green, 0.01, 0.011, 0, 0.025, 0.009, 0.008, 0, -Math.PI / 4);
    });
    const halt = wall.moving("Escalator stopped indication", [0, 0.51, 0.056], moving => {
      moving.box(context.palette.red, 0, 0, 0, 0.045, 0.01, 0.008);
    });
    arrows.push(arrow);
    stopped.push(halt);
    wall.label(top ? "EXIT" : "UP", 0, 0.82, 0.02, 0.16, 0.075);
  }
  return { arrows, stopped };
}

export function buildRetailEscalator(context: ArchitectureContext, rise: number, width: number, run: number): Animation {
  const path = new EscalatorStepPath(rise, run);
  const stepPitch = 0.35;
  const count = Math.ceil(path.length / stepPitch);
  const actualPitch = path.length / count;
  const stepDepth = actualPitch * run / Math.hypot(run, rise) + 0.012;
  const stepRise = actualPitch * rise / Math.hypot(run, rise);
  buildEscalatorTruss(context, width, rise, run);
  buildBalustrade(context, width, rise, run);
  buildCombPlate(context.at({ x: 0, y: 0.15, z: 0.76 }), width, false);
  buildCombPlate(context.at({ x: 0, y: rise + 0.15, z: -run - 0.76 }), width, true);
  const steps: THREE.Group[] = [];
  for (let index = 0; index < count; index++) steps.push(buildStep(context, width, stepDepth, stepRise));
  const handrail = buildHandrailLoop(context, width, rise, run);
  const controls = buildEscalatorControls(context, width, rise, run);
  const bottomSensor = context.doorSensor([0, 0, 1.1], 1.8, 9);
  const topSensor = context.doorSensor([0, rise, -run - 1.1], 1.8, 9);
  const sample: BeltSample = { y: 0, z: 0, returnRun: false };
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  let previous = -1;
  let phase = 0;
  let speed = 0;
  return (seconds, night) => {
    if (previous < 0 || seconds < previous) {
      previous = seconds;
      speed = 0;
      phase = 0;
    }
    const dt = Math.min(0.08, Math.max(0, seconds - previous));
    previous = seconds;
    const occupied = bottomSensor(seconds) > 0.1 || topSensor(seconds) > 0.1;
    const target = occupied ? 0.45 : night ? 0 : 0.08;
    speed += THREE.MathUtils.clamp(target - speed, -dt * 0.14, dt * 0.12);
    phase = (phase + speed * dt) % path.length;
    for (let index = 0; index < steps.length; index++) {
      path.sample(index * actualPitch + phase, sample);
      context.world([0, sample.y, sample.z], steps[index].position);
      steps[index].visible = !sample.returnRun;
    }
    for (let side = 0; side < handrail.markers.length; side++) {
      const curve = handrail.paths[side];
      const t = THREE.MathUtils.euclideanModulo(phase / curve.getLength(), 1);
      curve.getPointAt(t, point);
      curve.getTangentAt(t, tangent);
      context.world([point.x, point.y, point.z], handrail.markers[side].position);
      handrail.markers[side].rotation.set(-Math.atan2(tangent.y, -tangent.z), context.local.yaw ?? 0, 0, "YXZ");
    }
    for (let index = 0; index < controls.arrows.length; index++) {
      controls.arrows[index].visible = speed > 0.01;
      controls.stopped[index].visible = speed <= 0.01;
    }
  };
}
