import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import { buildDigitalNumber } from "./display-instruments";

type WashPhase = "wash" | "drain" | "rinse" | "spin" | "settle" | "complete";
type LaundryPiece = {
  group: THREE.Group;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  angle: number;
  radius: number;
  width: number;
  resting: boolean;
};

class WasherProgram {
  phase: WashPhase = "wash";
  waterLitres = 5.2;
  waterTemperature = 25;
  drumVelocity = 0;
  drumAngle = 0;
  remainingMinutes = 24;
  locked = true;
  vibration = 0;
  private elapsed = 0;
  private previous = -1;
  private stageTime = 0;
  private cycles = 0;
  private spinTarget = 0;
  private direction = 1;

  private change(phase: WashPhase): void {
    this.phase = phase;
    this.stageTime = 0;
  }

  update(seconds: number, night: boolean, doorOpen: boolean): number {
    if (this.previous >= 0 && seconds < this.previous) {
      this.phase = "wash";
      this.waterLitres = 5.2;
      this.waterTemperature = 25;
      this.elapsed = 0;
      this.stageTime = 0;
      this.cycles = 0;
      this.locked = true;
      this.drumAngle = 0;
      this.spinTarget = 0;
    }
    if (this.previous < 0 || seconds < this.previous) {
      this.previous = seconds;
      this.drumVelocity = 0;
    }
    const dt = Math.min(0.08, Math.max(0, seconds - this.previous));
    this.previous = seconds;
    this.elapsed += dt;
    this.stageTime += dt;
    const washingTime = this.stageTime % 13;
    if (this.phase === "wash") {
      this.locked = true;
      this.waterLitres = Math.min(6, this.waterLitres + dt * 0.08);
      this.waterTemperature += (40 - this.waterTemperature) * dt * 0.018;
      this.direction = Math.floor(this.stageTime / 13) % 2 ? -1 : 1;
      this.spinTarget = washingTime < 8 ? this.direction * 2.8 : 0;
      if (this.stageTime > 72) this.change("drain");
    } else if (this.phase === "drain") {
      this.spinTarget = this.waterLitres > 0.3 ? 0.5 : 0;
      this.waterLitres = Math.max(0, this.waterLitres - dt * 0.32);
      if (this.waterLitres <= 0.02) this.change(this.cycles < 1 ? "rinse" : "spin");
    } else if (this.phase === "rinse") {
      this.waterLitres = Math.min(5.5, this.waterLitres + dt * 0.25);
      this.waterTemperature += (19 - this.waterTemperature) * dt * 0.07;
      this.spinTarget = this.waterLitres > 3 ? Math.sin(this.stageTime * 0.32) * 2.4 : 0;
      if (this.stageTime > 45) {
        this.cycles++;
        this.change("drain");
      }
    } else if (this.phase === "spin") {
      this.spinTarget = night ? 7 : 15;
      if (this.stageTime < 12) this.spinTarget *= this.stageTime / 12;
      this.waterLitres = Math.max(0, this.waterLitres - dt * 0.08);
      if (this.stageTime > 42) this.change("settle");
    } else if (this.phase === "settle") {
      this.spinTarget = 0;
      if (Math.abs(this.drumVelocity) < 0.02 && this.stageTime > 8) this.change("complete");
    } else {
      this.spinTarget = 0;
      this.locked = false;
      if (this.stageTime > 180 && !night && !doorOpen) {
        this.cycles = 0;
        this.elapsed = 0;
        this.change("wash");
      }
    }
    const acceleration = this.phase === "spin" ? 1.5 : 2.2;
    this.drumVelocity += THREE.MathUtils.clamp(this.spinTarget - this.drumVelocity, -acceleration * dt, acceleration * dt);
    this.drumAngle = (this.drumAngle + this.drumVelocity * dt) % (Math.PI * 2);
    this.vibration = Math.max(0, Math.abs(this.drumVelocity) - 5) * 0.00006;
    this.remainingMinutes = this.phase === "complete" ? 0 : Math.max(1, Math.ceil((215 - this.elapsed) / 9));
    return dt;
  }
}

function roundFront(context: ArchitectureContext): THREE.BufferGeometry {
  const outline = new THREE.Shape();
  const width = 0.6;
  const height = 0.73;
  outline.moveTo(-width / 2, -height / 2);
  outline.lineTo(width / 2, -height / 2);
  outline.lineTo(width / 2, height / 2);
  outline.lineTo(-width / 2, height / 2);
  outline.closePath();
  const opening = new THREE.Path();
  opening.absarc(0, 0.015, 0.19, 0, Math.PI * 2, true);
  outline.holes.push(opening);
  const geometry = context.geometry(new THREE.ExtrudeGeometry(outline, { depth: 0.022, bevelEnabled: false, curveSegments: 18 }));
  geometry.computeVertexNormals();
  return geometry;
}

function buildWasherHousing(context: ArchitectureContext): void {
  const { white, dark, aluminum, rubber } = context.palette;
  context.box(white, 0, 0.835, 0, 0.61, 0.035, 0.62);
  context.box(white, 0, 0.045, 0, 0.59, 0.05, 0.59);
  context.box(white, 0, 0.43, -0.3, 0.6, 0.78, 0.025);
  for (const side of [-1, 1]) {
    context.box(white, side * 0.29, 0.43, 0, 0.025, 0.78, 0.59);
    for (const z of [-0.24, 0.24]) {
      context.disc(rubber, side * 0.24, 0.015, z, 0.026, 0.03);
      context.disc(aluminum, side * 0.24, 0.04, z, 0.018, 0.025);
    }
  }
  context.part(white, roundFront(context), [0, 0.4, 0.296]);
  context.box(dark, 0, 0.09, 0.309, 0.54, 0.07, 0.015);
  context.box(white, 0, 0.085, 0.322, 0.53, 0.055, 0.015);
  context.box(aluminum, 0.22, 0.08, 0.334, 0.035, 0.007, 0.006);
  context.box(dark, -0.16, 0.77, 0.313, 0.19, 0.075, 0.018);
  context.box(white, -0.16, 0.77, 0.328, 0.18, 0.065, 0.018);
  context.box(aluminum, -0.16, 0.755, 0.342, 0.13, 0.009, 0.014);
  context.tube(rubber, [[-0.2, 0.63, -0.315], [-0.26, 0.55, -0.39], [-0.23, 0.18, -0.4], [-0.12, 0.07, -0.37]], 0.013);
  context.tube(aluminum, [[0.19, 0.65, -0.315], [0.23, 0.73, -0.34], [0.25, 0.76, -0.36]], 0.01);
}

function buildWasherDoor(context: ArchitectureContext): THREE.Group {
  const { aluminum, white, rubber, glass, dark } = context.palette;
  const outerRing = context.geometry(new THREE.TorusGeometry(0.205, 0.022, 6, 28));
  const innerRing = context.geometry(new THREE.TorusGeometry(0.176, 0.009, 5, 28));
  const seal = context.geometry(new THREE.TorusGeometry(0.185, 0.015, 5, 28));
  context.part(rubber, seal, [0, 0.415, 0.314]);
  for (const y of [0.31, 0.51]) context.box(aluminum, -0.19, y, 0.321, 0.035, 0.045, 0.035);
  return context.moving("Laundry porthole door", [-0.197, 0.415, 0.326], moving => {
    moving.part(white, outerRing, [0.197, 0, 0.012]);
    moving.part(aluminum, innerRing, [0.197, 0, 0.017]);
    moving.oval(glass, 0.197, 0, -0.005, 0.172, 0.172, 0.025);
    moving.box(dark, 0.373, 0.005, 0.023, 0.04, 0.12, 0.025);
    moving.box(aluminum, 0.383, 0.005, 0.042, 0.015, 0.09, 0.035);
    moving.box(rubber, 0.386, 0.005, 0.065, 0.012, 0.065, 0.008);
  });
}

function buildWasherDrum(context: ArchitectureContext): THREE.Group {
  const { aluminum, dark, white } = context.palette;
  const inner = context.geometry(new THREE.CylinderGeometry(0.177, 0.177, 0.31, 20, 1, true));
  inner.rotateX(Math.PI / 2);
  const back = context.geometry(new THREE.CircleGeometry(0.177, 20));
  return context.moving("Laundry stainless drum", [0, 0.415, 0.14], moving => {
    moving.part(aluminum, inner, [0, 0, 0]);
    moving.part(aluminum, back, [0, 0, -0.155]);
    moving.oval(dark, 0, 0, -0.149, 0.025, 0.025, 0.008);
    for (let baffle = 0; baffle < 3; baffle++) {
      const angle = baffle * Math.PI * 2 / 3;
      const x = Math.cos(angle) * 0.155;
      const y = Math.sin(angle) * 0.155;
      moving.box(white, x, y, 0, 0.025, 0.035, 0.28, 0, angle);
    }
    for (let ring = 0; ring < 3; ring++) {
      const radius = 0.06 + ring * 0.04;
      for (let hole = 0; hole < 10; hole++) {
        const angle = hole * Math.PI * 2 / 10 + ring * 0.15;
        moving.oval(dark, Math.cos(angle) * radius, Math.sin(angle) * radius, -0.147, 0.0035, 0.0035, 0.001);
      }
    }
  });
}

function buildLaundryPiece(context: ArchitectureContext, index: number): LaundryPiece {
  const width = 0.055 + index % 3 * 0.011;
  const material = index % 3 === 0 ? context.palette.white : index % 3 === 1 ? context.palette.fabric : context.palette.green;
  const group = context.moving("Loose cloth inside washing drum", [0, 0.415, 0.23], moving => {
    moving.roundedBox(material, 0, 0, 0, width, width * 0.7, 0.055, 0.013);
    moving.box(material, width * 0.12, -width * 0.32, 0.005, width * 0.6, 0.014, 0.052, 0, 0.25);
    moving.box(material, -width * 0.18, width * 0.3, 0, width * 0.5, 0.012, 0.045, 0, -0.2);
  });
  return {
    group,
    x: Math.sin(index * 2.4) * 0.08,
    y: -0.07 + index * 0.012,
    vx: 0,
    vy: 0,
    spin: 0,
    angle: index * 1.3,
    radius: 0.165 - width * 0.42,
    width,
    resting: false,
  };
}

function settleLaundry(pieces: LaundryPiece[], program: WasherProgram, delta: number): void {
  let remaining = delta;
  while (remaining > 1e-7) {
    const dt = Math.min(remaining, 1 / 90);
    remaining -= dt;
    for (const piece of pieces) {
      const radius = Math.hypot(piece.x, piece.y);
      const touching = radius >= piece.radius - 0.006;
      const tangentX = -piece.y * program.drumVelocity;
      const tangentY = piece.x * program.drumVelocity;
      const waterLevel = -0.15 + program.waterLitres * 0.008;
      const submerged = piece.y < waterLevel;
      const drag = submerged ? 4 : 0.4;
      piece.vy -= (submerged ? 1.8 : 3.2) * dt;
      piece.vx *= Math.exp(-drag * dt);
      piece.vy *= Math.exp(-drag * dt);
      if (touching) {
        const coupling = Math.min(1, dt * (Math.abs(program.drumVelocity) > 6 ? 35 : 11));
        piece.vx += (tangentX - piece.vx) * coupling;
        piece.vy += (tangentY - piece.vy) * coupling;
      }
      piece.x += piece.vx * dt;
      piece.y += piece.vy * dt;
      const nextRadius = Math.hypot(piece.x, piece.y);
      if (nextRadius > piece.radius) {
        const nx = piece.x / nextRadius;
        const ny = piece.y / nextRadius;
        piece.x = nx * piece.radius;
        piece.y = ny * piece.radius;
        const normalSpeed = piece.vx * nx + piece.vy * ny;
        if (normalSpeed > 0) {
          piece.vx -= normalSpeed * nx * 1.05;
          piece.vy -= normalSpeed * ny * 1.05;
        }
      }
      piece.spin += (program.drumVelocity * (touching ? 0.8 : 0.12) - piece.spin) * dt * 3;
      piece.angle += piece.spin * dt;
      piece.resting = Math.abs(piece.vx) + Math.abs(piece.vy) < 0.01;
    }
    for (let a = 0; a < pieces.length; a++) {
      for (let b = a + 1; b < pieces.length; b++) {
        const first = pieces[a];
        const second = pieces[b];
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        const minimum = (first.width + second.width) * 0.3;
        if (distance >= minimum || distance < 1e-7) continue;
        const correction = (minimum - distance) * 0.35;
        const nx = dx / distance;
        const ny = dy / distance;
        first.x -= nx * correction;
        first.y -= ny * correction;
        second.x += nx * correction;
        second.y += ny * correction;
        const approach = (second.vx - first.vx) * nx + (second.vy - first.vy) * ny;
        if (approach < 0) {
          first.vx += approach * nx * 0.3;
          first.vy += approach * ny * 0.3;
          second.vx -= approach * nx * 0.3;
          second.vy -= approach * ny * 0.3;
        }
      }
    }
  }
}

function buildWasherControls(context: ArchitectureContext, program: WasherProgram): Animation {
  const { aluminum, dark, screen, green, yellow } = context.palette;
  context.box(dark, 0.065, 0.768, 0.323, 0.22, 0.065, 0.02);
  const minutes = buildDigitalNumber(context.at({ x: 0.045, y: 0.768, z: 0.338 }), 2, 0.022);
  context.label("MIN", 0.13, 0.768, 0.34, 0.043, 0.02, "#cfddcf", "#333a3a");
  const dial = context.geometry(new THREE.CylinderGeometry(0.029, 0.029, 0.02, 14));
  dial.rotateX(Math.PI / 2);
  context.part(aluminum, dial, [0.23, 0.77, 0.333]);
  context.box(dark, 0.23, 0.788, 0.347, 0.004, 0.012, 0.004);
  context.box(screen, -0.033, 0.77, 0.337, 0.006, 0.025, 0.003);
  const lock = context.moving("Washing machine door lock indicator", [-0.038, 0.735, 0.335], moving => {
    moving.box(yellow, 0, 0, 0, 0.012, 0.009, 0.005);
  });
  const done = context.moving("Washing machine cycle complete indicator", [0.15, 0.735, 0.335], moving => {
    moving.box(green, 0, 0, 0, 0.012, 0.009, 0.005);
  });
  return () => {
    minutes.set(program.remainingMinutes);
    lock.visible = program.locked;
    done.visible = program.phase === "complete";
  };
}

export function buildDetailedLaundryMachine(context: ArchitectureContext): Animation {
  const program = new WasherProgram();
  buildWasherHousing(context);
  const drum = buildWasherDrum(context);
  const door = buildWasherDoor(context);
  const controls = buildWasherControls(context, program);
  const sense = context.doorSensor([0, 0, 0.7], 0.65, 1.8);
  const pieces: LaundryPiece[] = [];
  for (let index = 0; index < 5; index++) pieces.push(buildLaundryPiece(context, index));
  const water = context.moving("Washing machine water surface", [0, 0.27, 0.17], moving => {
    moving.box(context.palette.water, 0, 0, 0, 0.22, 0.008, 0.25);
  });
  const waterOrigin = water.position.clone();
  const yaw = context.local.yaw ?? 0;
  let doorAngle = 0;
  return (seconds, night, season) => {
    const present = sense(seconds);
    const dt = program.update(seconds, night, doorAngle > 0.1);
    settleLaundry(pieces, program, dt);
    drum.rotation.set(0, yaw, program.drumAngle, "YXZ");
    const targetDoor = !program.locked && present > 0.2 ? 1.5 : 0;
    doorAngle += THREE.MathUtils.clamp(targetDoor - doorAngle, -dt * 0.5, dt * 0.6);
    door.rotation.y = yaw - doorAngle;
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index];
      context.world([piece.x, 0.415 + piece.y, 0.24 + (index % 2) * 0.035], piece.group.position);
      piece.group.rotation.set(0, yaw, piece.angle, "YXZ");
      piece.group.scale.y = piece.resting ? 0.85 : 1;
    }
    water.position.copy(waterOrigin);
    water.position.y += program.waterLitres * 0.008;
    water.visible = program.waterLitres > 0.1 && doorAngle < 0.1;
    controls(seconds, night, season);
  };
}
