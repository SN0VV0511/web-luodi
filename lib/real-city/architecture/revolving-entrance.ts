import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";
import { buildSwingDoor } from "./doors";

function arcPoints(radius: number, start: number, end: number, y: number, segments: number): Point[] {
  const points: Point[] = [];
  for (let index = 0; index <= segments; index++) {
    const angle = THREE.MathUtils.lerp(start, end, index / segments);
    points.push([Math.sin(angle) * radius, y, Math.cos(angle) * radius]);
  }
  return points;
}

function curvedPanel(context: ArchitectureContext, radius: number, height: number, start: number, end: number): void {
  const segments = Math.max(5, Math.ceil((end - start) * 7));
  const positions: number[] = [];
  const normals: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const fraction = index / segments;
    const angle = THREE.MathUtils.lerp(start, end, fraction);
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    positions.push(x, 0.05, z, x, height - 0.05, z);
    normals.push(Math.sin(angle), 0, Math.cos(angle), Math.sin(angle), 0, Math.cos(angle));
    uv.push(fraction, 0, fraction, 1);
    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  }
  const geometry = context.geometry(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  context.part(context.palette.glass, geometry, [0, 0, 0]);
}

function curvedTransom(context: ArchitectureContext, radius: number, height: number, start: number, end: number): void {
  const { aluminum, rubber } = context.palette;
  curvedPanel(context, radius, height, start, end);
  for (const y of [0.04, height - 0.04]) {
    context.tube(aluminum, arcPoints(radius, start, end, y, 14), 0.023);
    context.tube(rubber, arcPoints(radius - 0.014, start, end, y + (y < 1 ? 0.019 : -0.019), 14), 0.008);
  }
  const middle = (start + end) / 2;
  for (const angle of [start, middle, end]) {
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    context.box(aluminum, x, height / 2, z, 0.04, height, 0.04, angle);
    for (const y of [0.08, height - 0.08]) {
      context.box(context.palette.steel, x, y, z, 0.07, 0.055, 0.06, angle);
    }
  }
  for (let stripe = 0; stripe < 7; stripe++) {
    const angle = THREE.MathUtils.lerp(start + 0.06, end - 0.06, stripe / 6);
    const x = Math.sin(angle) * (radius + 0.006);
    const z = Math.cos(angle) * (radius + 0.006);
    context.box(context.palette.white, x, 1.03, z, 0.07, 0.035, 0.006, angle);
  }
}

function buildRevolvingFloor(context: ArchitectureContext, radius: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.disc(steel, 0, 0.007, 0, radius + 0.08, 0.014);
  context.disc(rubber, 0, 0.017, 0, radius + 0.035, 0.012);
  const grooveCount = 11;
  for (let groove = -grooveCount; groove <= grooveCount; groove++) {
    const x = groove * radius / (grooveCount + 1);
    const halfDepth = Math.sqrt(Math.max(0, radius * radius - x * x));
    context.box(aluminum, x, 0.025, 0, 0.012, 0.006, halfDepth * 2);
  }
  const ring = context.geometry(new THREE.TorusGeometry(radius + 0.04, 0.018, 4, 32));
  ring.rotateX(Math.PI / 2);
  context.part(aluminum, ring, [0, 0.026, 0]);
  for (const angle of [0, Math.PI]) {
    const arrow = context.at({ x: Math.sin(angle) * radius * 0.6, y: 0.03, z: Math.cos(angle) * radius * 0.6, yaw: angle });
    arrow.box(context.palette.white, 0, 0, 0, 0.055, 0.004, 0.22);
    arrow.panel(context.palette.white, [[-0.1, 0.002, -0.02], [0.1, 0.002, -0.02], [0.018, 0.002, 0.1], [-0.018, 0.002, 0.1]]);
  }
}

function buildRotor(context: ArchitectureContext, radius: number, height: number): THREE.Group {
  const { aluminum, glass, rubber, white, steel } = context.palette;
  return context.moving("Four-wing revolving entrance rotor", [0, 0.035, 0], moving => {
    moving.disc(aluminum, 0, height / 2, 0, 0.055, height - 0.08);
    moving.disc(steel, 0, 0.025, 0, 0.11, 0.05);
    moving.disc(steel, 0, height - 0.08, 0, 0.1, 0.04);
    for (let wing = 0; wing < 4; wing++) {
      const angle = wing * Math.PI / 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const midpoint = radius * 0.51;
      moving.box(glass, cosine * midpoint, height / 2, -sine * midpoint, radius - 0.13, height - 0.16, 0.025, angle);
      moving.box(aluminum, cosine * radius * 0.96, height / 2, -sine * radius * 0.96, 0.035, height - 0.05, 0.06, angle);
      moving.box(rubber, cosine * radius * 0.985, height / 2, -sine * radius * 0.985, 0.015, height - 0.05, 0.035, angle);
      for (const y of [0.065, height - 0.08]) {
        moving.box(aluminum, cosine * midpoint, y, -sine * midpoint, radius - 0.08, 0.035, 0.05, angle);
      }
      moving.box(white, cosine * midpoint, 1.04, -sine * midpoint, radius - 0.14, 0.028, 0.028, angle);
      for (const face of [-1, 1]) {
        const handleX = cosine * radius * 0.57 + sine * face * 0.075;
        const handleZ = -sine * radius * 0.57 + cosine * face * 0.075;
        moving.box(aluminum, handleX, 1.04, handleZ, radius * 0.55, 0.025, 0.025, angle);
        for (const t of [0.34, 0.8]) {
          moving.box(aluminum, cosine * radius * t + sine * face * 0.04, 1.04, -sine * radius * t + cosine * face * 0.04, 0.02, 0.02, 0.075, angle);
        }
      }
      const edgeX = cosine * radius * 0.94;
      const edgeZ = -sine * radius * 0.94;
      moving.box(steel, edgeX, 0.13, edgeZ, 0.04, 0.075, 0.07, angle);
      moving.box(steel, edgeX, height - 0.16, edgeZ, 0.04, 0.075, 0.07, angle);
    }
  });
}

function buildCanopyDrive(context: ArchitectureContext, radius: number, height: number): { arrow: THREE.Group; light: THREE.Group } {
  const { aluminum, steel, rubber, warmLight, green } = context.palette;
  context.disc(aluminum, 0, height + 0.06, 0, radius + 0.065, 0.16);
  context.disc(steel, 0, height - 0.025, 0, radius + 0.01, 0.02);
  context.disc(aluminum, 0, height + 0.16, 0, radius * 0.34, 0.035);
  context.disc(rubber, 0, height + 0.19, 0, radius * 0.2, 0.035);
  for (let lamp = 0; lamp < 6; lamp++) {
    const angle = lamp / 6 * Math.PI * 2;
    context.disc(warmLight, Math.sin(angle) * radius * 0.72, height - 0.035, Math.cos(angle) * radius * 0.72, 0.055, 0.018);
  }
  for (const side of [-1, 1]) {
    context.box(steel, 0, height - 0.08, side * radius * 0.98, 0.18, 0.07, 0.055);
    context.box(rubber, 0, height - 0.09, side * radius * 1.015, 0.1, 0.025, 0.015);
    const sensor = context.at({ x: side * radius * 0.77, y: 0.19, z: side * radius * 0.65, yaw: side > 0 ? Math.PI / 4 : -Math.PI / 4 });
    sensor.box(aluminum, 0, 0, 0, 0.045, 0.13, 0.04);
    sensor.box(rubber, 0, 0.02, 0.025, 0.023, 0.035, 0.01);
  }
  const arrow = context.moving("Revolving entrance running indicator", [radius * 0.78, 1.35, radius * 0.68], moving => {
    moving.box(green, 0, 0, 0, 0.04, 0.02, 0.012);
    moving.box(green, 0.018, 0.012, 0, 0.028, 0.012, 0.012, 0, -Math.PI / 4);
    moving.box(green, 0.018, -0.012, 0, 0.028, 0.012, 0.012, 0, Math.PI / 4);
  });
  const light = context.moving("Revolving door safety lamp", [-radius * 0.78, 1.35, radius * 0.68], moving => {
    moving.box(context.palette.yellow, 0, 0, 0, 0.045, 0.02, 0.012);
  });
  return { arrow, light };
}

class RevolvingDrive {
  angle = Math.PI / 4;
  speed = 0;
  private last = -1;
  private activeUntil = 0;
  private restingAngle = Math.PI / 4;

  update(seconds: number, demand: number, night: boolean): void {
    if (this.last < 0 || seconds < this.last) {
      this.last = seconds;
      this.activeUntil = seconds;
      this.speed = 0;
    }
    const dt = Math.min(0.06, Math.max(0, seconds - this.last));
    this.last = seconds;
    if (demand > 0.12) this.activeUntil = seconds + 3;
    const active = seconds < this.activeUntil;
    const maximum = night ? 0.3 : 0.42;
    let target = active ? maximum : 0;
    if (active) {
      const completed = Math.floor((this.angle - Math.PI / 4) / (Math.PI / 2));
      this.restingAngle = Math.PI / 4 + (completed + 1) * Math.PI / 2;
    } else {
      const remaining = this.restingAngle - this.angle;
      target = Math.min(maximum * 0.6, Math.sqrt(Math.max(0, remaining) * 0.45));
      if (remaining < 0.002) {
        this.angle = this.restingAngle;
        this.speed = 0;
        return;
      }
    }
    const acceleration = active ? 0.22 : 0.32;
    this.speed += THREE.MathUtils.clamp(target - this.speed, -acceleration * dt, acceleration * dt);
    const next = this.angle + this.speed * dt;
    if (!active && next > this.restingAngle) {
      this.angle = this.restingAngle;
      this.speed = 0;
    } else this.angle = next;
    if (this.angle > Math.PI * 200) {
      this.angle -= Math.PI * 200;
      this.restingAngle -= Math.PI * 200;
    }
  }
}

export function buildRevolvingVestibule(context: ArchitectureContext, height: number): Animation[] {
  const radius = 0.96;
  const center = context.at({ x: -0.45, y: 0.02, z: 0 });
  const start = Math.PI * 0.22;
  const end = Math.PI * 0.78;
  curvedTransom(center, radius, height, start, end);
  curvedTransom(center, radius, height, start + Math.PI, end + Math.PI);
  buildRevolvingFloor(center, radius);
  const rotor = buildRotor(center, radius - 0.025, height);
  const canopy = buildCanopyDrive(center, radius, height);
  const drive = new RevolvingDrive();
  const sensor = center.doorSensor([0, 0, 0], 2.25, 1.5);
  const baseYaw = rotor.rotation.y;
  const accessible = context.at({ x: 1.34, y: 0.02, z: 0.04 });
  const swing = buildSwingDoor(accessible, 0.96, height - 0.05, 0);
  const { aluminum, glass, steel, screen } = context.palette;
  context.box(aluminum, 0.75, height / 2, 0, 0.08, height + 0.08, 0.14);
  context.box(glass, -1.72, height / 2, 0, 0.48, height - 0.08, 0.026);
  context.box(aluminum, -1.99, height / 2, 0, 0.045, height + 0.08, 0.1);
  context.box(aluminum, 1.99, height / 2, 0, 0.045, height + 0.08, 0.1);
  context.box(aluminum, 0, height + 0.035, 0, 4.04, 0.07, 0.14);
  context.box(steel, 1.93, 0.94, 0.13, 0.09, 0.15, 0.04);
  context.box(screen, 1.93, 0.94, 0.155, 0.06, 0.06, 0.01);
  context.label("ACCESS", 1.34, height - 0.18, 0.05, 0.52, 0.1, "#deded1", "#426453");
  return [
    swing,
    (seconds, night) => {
      const demand = sensor(seconds);
      drive.update(seconds, demand, night);
      rotor.rotation.y = baseYaw + drive.angle;
      canopy.arrow.visible = drive.speed > 0.01;
      canopy.light.visible = drive.speed < 0.01 && demand > 0.1;
    },
  ];
}
