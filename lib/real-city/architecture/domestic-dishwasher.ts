import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import { buildDigitalNumber } from "./display-instruments";

type DishwasherPhase = "wash" | "drain" | "dry" | "complete";

class DishwashingProgram {
  phase: DishwasherPhase = "wash";
  water = 3.5;
  temperature = 36;
  circulation = 0;
  sprayAngle = 0;
  dryingFanAngle = 0;
  doorAngle = 0;
  doorVelocity = 0;
  rackExtension = 0;
  remaining = 18;
  counterbalanceTorque = 0;
  private elapsed = 0;
  private phaseElapsed = 0;
  private last = -1;

  update(seconds: number, presence: number): void {
    if (this.last >= 0 && seconds < this.last) {
      this.phase = "wash";
      this.water = 3.5;
      this.temperature = 36;
      this.elapsed = 0;
      this.phaseElapsed = 0;
      this.circulation = 0;
      this.sprayAngle = 0;
      this.doorAngle = 0;
      this.rackExtension = 0;
    }
    if (this.last < 0 || seconds < this.last) {
      this.last = seconds;
      this.doorVelocity = 0;
    }
    const dt = Math.min(0.06, Math.max(0, seconds - this.last));
    this.last = seconds;
    this.elapsed += dt;
    this.phaseElapsed += dt;
    const canOpen = this.phase === "complete";
    const targetAngle = canOpen ? presence > 0.55 ? 1.48 : 0.12 : 0;
    const gravityTorque = Math.sin(this.doorAngle) * 0.5;
    const doorTorque = (targetAngle - this.doorAngle) * 8 - this.doorVelocity * 5 + gravityTorque - this.counterbalanceTorque;
    this.doorVelocity = THREE.MathUtils.clamp(this.doorVelocity + doorTorque * dt, -0.5, 0.6);
    this.doorAngle += this.doorVelocity * dt;
    if (this.doorAngle < 0) { this.doorAngle = 0; this.doorVelocity = 0; }
    if (this.doorAngle > 1.5) { this.doorAngle = 1.5; this.doorVelocity = 0; }
    const requestRack = this.doorAngle > 1.4 && presence > 0.6 ? 0.3 : 0;
    this.rackExtension += THREE.MathUtils.clamp(requestRack - this.rackExtension, -dt * 0.16, dt * 0.14);
    if (this.rackExtension > 0.02 && this.doorAngle < 1.4) this.doorAngle = 1.4;
    if (this.phase === "wash") {
      this.water = Math.min(4.1, this.water + dt * 0.09);
      this.temperature += (60 - this.temperature) * dt * 0.025;
      this.circulation += (1 - this.circulation) * dt * 0.9;
      if (this.phaseElapsed > 76) { this.phase = "drain"; this.phaseElapsed = 0; }
    } else if (this.phase === "drain") {
      this.water = Math.max(0, this.water - dt * 0.24);
      this.circulation = Math.max(0, this.circulation - dt * 0.4);
      if (this.water < 0.04) { this.phase = "dry"; this.phaseElapsed = 0; }
    } else if (this.phase === "dry") {
      this.temperature += (43 - this.temperature) * dt * 0.014;
      this.dryingFanAngle += dt * 14;
      if (this.phaseElapsed > 42) { this.phase = "complete"; this.phaseElapsed = 0; }
    } else {
      this.temperature += (22 - this.temperature) * dt * (this.doorAngle > 0.5 ? 0.05 : 0.01);
      this.circulation = 0;
    }
    this.sprayAngle = (this.sprayAngle + this.circulation * dt * 5.5) % (Math.PI * 2);
    this.dryingFanAngle %= Math.PI * 2;
    this.remaining = this.phase === "complete" ? 0 : Math.max(1, Math.ceil((136 - this.elapsed) / 7.5));
  }
}

function buildDishwasherTub(context: ArchitectureContext): void {
  const { aluminum, white, dark, rubber } = context.palette;
  context.box(aluminum, 0, 0.04, 0, 0.595, 0.08, 0.57);
  context.box(aluminum, 0, 0.805, 0, 0.595, 0.03, 0.57);
  context.box(aluminum, 0, 0.43, -0.275, 0.595, 0.75, 0.025);
  for (const side of [-1, 1]) {
    context.box(aluminum, side * 0.286, 0.43, 0, 0.022, 0.75, 0.55);
    context.box(rubber, side * 0.278, 0.43, 0.276, 0.013, 0.73, 0.012);
    for (const z of [-0.22, 0.22]) {
      context.disc(dark, side * 0.24, -0.02, z, 0.025, 0.04);
      context.box(white, side * 0.24, 0.015, z, 0.075, 0.035, 0.06);
    }
  }
  context.box(rubber, 0, 0.79, 0.276, 0.55, 0.013, 0.012);
  context.disc(dark, -0.1, 0.09, -0.08, 0.065, 0.018);
  for (let bar = 0; bar < 6; bar++) context.box(aluminum, -0.145 + bar * 0.018, 0.103, -0.08, 0.006, 0.005, 0.1);
  context.disc(white, 0.14, 0.105, -0.12, 0.045, 0.025);
  context.box(dark, 0.14, 0.12, -0.12, 0.045, 0.004, 0.012);
  context.box(aluminum, 0, 0.095, 0.16, 0.52, 0.025, 0.05);
}

function buildDishwasherDoor(context: ArchitectureContext): { group: THREE.Group; display: ReturnType<typeof buildDigitalNumber> } {
  const { aluminum, dark, white, rubber } = context.palette;
  for (const side of [-1, 1]) {
    context.box(aluminum, side * 0.27, 0.105, 0.25, 0.035, 0.13, 0.11);
    context.beam(aluminum, [side * 0.27 - 0.015, 0.11, 0.285], [side * 0.27 + 0.015, 0.11, 0.285], 0.018);
  }
  let display!: ReturnType<typeof buildDigitalNumber>;
  const group = context.moving("Counterbalanced dishwasher door", [0, 0.105, 0.285], moving => {
    moving.box(aluminum, 0, 0.345, 0, 0.59, 0.69, 0.045);
    moving.box(dark, 0, 0.64, 0.029, 0.56, 0.065, 0.018);
    moving.box(aluminum, 0, 0.565, 0.05, 0.39, 0.023, 0.04);
    moving.box(aluminum, 0, 0.32, -0.03, 0.52, 0.55, 0.018);
    for (const side of [-1, 1]) moving.box(rubber, side * 0.265, 0.33, -0.048, 0.01, 0.63, 0.008);
    moving.box(white, -0.12, 0.33, -0.052, 0.18, 0.13, 0.028);
    moving.box(dark, -0.12, 0.33, -0.07, 0.14, 0.085, 0.012);
    moving.box(white, -0.12, 0.34, -0.079, 0.135, 0.08, 0.012);
    moving.box(aluminum, -0.045, 0.33, -0.083, 0.015, 0.025, 0.015);
    moving.oval(white, 0.12, 0.33, -0.057, 0.045, 0.045, 0.015);
    moving.box(dark, 0.12, 0.33, -0.075, 0.04, 0.008, 0.006);
    moving.box(aluminum, 0, 0.08, -0.05, 0.5, 0.025, 0.045);
    display = buildDigitalNumber(moving.at({ x: 0.12, y: 0.645, z: 0.041 }), 2, 0.021);
  });
  return { group, display };
}

function buildDishRack(context: ArchitectureContext, upper: boolean): THREE.Group {
  const width = 0.48;
  const depth = 0.46;
  const { aluminum, porcelain, white, glass } = context.palette;
  return context.moving(upper ? "Dishwasher upper sliding rack" : "Dishwasher lower sliding rack", [0, upper ? 0.55 : 0.23, -0.005], moving => {
    for (let wire = 0; wire < 7; wire++) {
      const x = -width / 2 + wire * width / 6;
      moving.beam(aluminum, [x, 0, -depth / 2], [x, 0, depth / 2], 0.003);
    }
    for (let wire = 0; wire < 7; wire++) {
      const z = -depth / 2 + wire * depth / 6;
      moving.beam(aluminum, [-width / 2, 0, z], [width / 2, 0, z], 0.003);
      for (const side of [-1, 1]) {
        moving.beam(aluminum, [side * width / 2, 0, z], [side * width / 2, 0.085, z], 0.003);
      }
    }
    for (const side of [-1, 1]) {
      moving.beam(aluminum, [side * width / 2, 0.085, -depth / 2], [side * width / 2, 0.085, depth / 2], 0.004);
      for (const z of [-0.17, 0.17]) moving.oval(white, side * (width / 2 + 0.015), 0, z, 0.009, 0.018, 0.018);
    }
    if (upper) {
      for (let row = 0; row < 2; row++) {
        for (let cup = 0; cup < 3; cup++) {
          const x = -0.16 + cup * 0.16;
          const z = -0.11 + row * 0.21;
          moving.disc(row ? glass : porcelain, x, 0.055, z, 0.035, 0.09);
          moving.disc(aluminum, x, 0.01, z, 0.025, 0.005);
        }
      }
    } else {
      const plate = moving.geometry(new THREE.CylinderGeometry(0.095, 0.095, 0.009, 18));
      plate.rotateX(Math.PI / 2);
      for (let dish = 0; dish < 5; dish++) {
        const z = -0.14 + dish * 0.07;
        moving.part(porcelain, plate, [-0.08, 0.095, z], [1, 1, 1], 0, 0.05);
        for (const x of [-0.14, -0.02]) moving.beam(aluminum, [x, 0.006, z - 0.02], [x, 0.08, z - 0.035], 0.003);
      }
      moving.box(white, 0.15, 0.055, 0.04, 0.12, 0.11, 0.24);
      for (let slot = 0; slot < 4; slot++) {
        const z = -0.04 + slot * 0.05;
        moving.box(aluminum, 0.13, 0.14, z, 0.008, 0.2, 0.008);
        moving.oval(aluminum, 0.13, 0.245, z, 0.012, 0.023, 0.004);
      }
    }
    moving.box(white, 0, 0.09, depth / 2 + 0.012, 0.13, 0.025, 0.025);
  });
}

function buildDishwasherRails(context: ArchitectureContext): void {
  const { aluminum, dark } = context.palette;
  for (const y of [0.23, 0.55]) {
    for (const side of [-1, 1]) {
      context.box(aluminum, side * 0.258, y, -0.02, 0.025, 0.025, 0.47);
      context.box(dark, side * 0.253, y - 0.006, -0.02, 0.009, 0.008, 0.43);
      for (const z of [-0.18, 0.16]) {
        context.box(aluminum, side * 0.27, y - 0.03, z, 0.02, 0.07, 0.04);
      }
    }
  }
}

function buildSprayArm(context: ArchitectureContext, height: number, span: number): THREE.Group {
  const { aluminum, dark } = context.palette;
  return context.moving("Dishwasher reaction-driven spray arm", [0, height, -0.03], moving => {
    moving.disc(aluminum, 0, 0, 0, 0.025, 0.03);
    moving.box(aluminum, 0, 0.01, 0, span, 0.018, 0.035);
    for (let jet = 0; jet < 6; jet++) {
      const x = -span / 2 + 0.025 + jet * (span - 0.05) / 5;
      const z = jet % 2 ? 0.009 : -0.009;
      moving.disc(dark, x, 0.023, z, 0.003, 0.003);
    }
    for (const side of [-1, 1]) moving.box(aluminum, side * span * 0.47, 0.01, side * 0.015, 0.025, 0.015, 0.035, side * 0.35);
  });
}

function buildDishwasherPlumbing(context: ArchitectureContext): { fan: THREE.Group; surface: THREE.Group } {
  const { dark, aluminum, white, rubber, water } = context.palette;
  context.oval(dark, 0.1, 0.04, -0.12, 0.08, 0.055, 0.09);
  context.tube(rubber, [[0.1, 0.04, -0.15], [0.23, 0.045, -0.24], [0.26, 0.19, -0.32], [0.15, 0.45, -0.34]], 0.014);
  context.tube(white, [[-0.2, 0.08, -0.32], [-0.2, 0.4, -0.32], [-0.15, 0.65, -0.3]], 0.011);
  context.disc(aluminum, -0.2, 0.09, -0.31, 0.025, 0.05);
  context.box(white, 0.2, 0.65, -0.245, 0.11, 0.14, 0.035);
  const fan = context.moving("Dishwasher drying fan", [0.2, 0.65, -0.221], moving => {
    for (let blade = 0; blade < 4; blade++) {
      const angle = blade * Math.PI / 2;
      moving.box(aluminum, Math.cos(angle) * 0.025, Math.sin(angle) * 0.025, 0, 0.035, 0.015, 0.006, 0, angle + 0.25);
    }
  });
  for (let grille = 0; grille < 5; grille++) context.box(aluminum, 0.2, 0.605 + grille * 0.022, -0.21, 0.09, 0.005, 0.006);
  const surface = context.moving("Dishwasher sump water level", [0, 0.08, 0], moving => {
    moving.box(water, 0, 0, 0, 0.46, 0.006, 0.43);
  });
  return { fan, surface };
}

function buildDoorCounterbalance(context: ArchitectureContext, program: DishwashingProgram): () => void {
  const { steel, aluminum, rubber } = context.palette;
  const springs: THREE.Group[] = [];
  const ropes: THREE.Group[] = [];
  const arms: THREE.Group[] = [];
  const pulleys: THREE.Group[] = [];
  const springOrigins: THREE.Vector3[] = [];
  const longitudinal = new THREE.Vector3(0, 0, 1);
  const first = new THREE.Vector3();
  const second = new THREE.Vector3();
  const direction = new THREE.Vector3();
  for (const side of [-1, 1]) {
    const x = side * 0.28;
    context.box(steel, x, 0.045, -0.22, 0.04, 0.045, 0.04);
    const spring = context.moving("Dishwasher tension counterbalance spring", [x, 0.05, -0.22], moving => {
      const points: [number, number, number][] = [];
      for (let segment = 0; segment <= 48; segment++) {
        const t = segment / 48;
        const angle = t * Math.PI * 16;
        points.push([Math.sin(angle) * 0.011, Math.cos(angle) * 0.011, t]);
      }
      moving.tube(steel, points, 0.0025);
    });
    springs.push(spring);
    springOrigins.push(spring.position.clone());
    const rope = context.moving("Dishwasher counterbalance tension cable", [x, 0.05, 0.1], moving => {
      moving.box(rubber, 0, 0, 0, 0.004, 0.004, 1);
    });
    ropes.push(rope);
    const arm = context.moving("Dishwasher door hinge lever", [x, 0.105, 0.285], moving => {
      moving.box(aluminum, 0, -0.055, -0.025, 0.012, 0.13, 0.035, 0, -0.25);
      moving.box(steel, 0, -0.105, -0.05, 0.018, 0.025, 0.025);
    });
    arms.push(arm);
    const pulley = context.moving("Dishwasher counterbalance cable pulley", [x, 0.06, 0.17], moving => {
      moving.beam(aluminum, [-0.011, 0, 0], [0.011, 0, 0], 0.025);
      moving.beam(steel, [-0.013, 0, 0], [0.013, 0, 0], 0.008);
      moving.box(rubber, 0.013, 0.016, 0, 0.004, 0.009, 0.009);
    });
    pulleys.push(pulley);
  }
  return () => {
    const angle = program.doorAngle;
    const extension = 0.12 + Math.sin(angle) * 0.055;
    for (let index = 0; index < springs.length; index++) {
      const x = (index ? 1 : -1) * 0.28;
      springs[index].position.copy(springOrigins[index]);
      springs[index].scale.z = extension;
      context.world([x, 0.05, -0.22 + extension], first);
      context.world([x, 0.06, 0.17], second);
      direction.copy(second).sub(first);
      const length = direction.length();
      ropes[index].position.copy(first).addScaledVector(direction, 0.5);
      ropes[index].quaternion.setFromUnitVectors(longitudinal, direction.normalize());
      ropes[index].scale.z = length;
      arms[index].rotation.set(angle, context.local.yaw ?? 0, 0, "YXZ");
      pulleys[index].rotation.set(angle * 2, context.local.yaw ?? 0, 0, "YXZ");
    }
    program.counterbalanceTorque = Math.max(0, extension - 0.12) * 9.05;
  };
}

function buildDishwasherSpray(context: ArchitectureContext, program: DishwashingProgram): (seconds: number) => void {
  const drops: THREE.Group[] = [];
  for (let index = 0; index < 12; index++) {
    drops.push(context.moving("Dishwasher wash-water jet droplet", [0, 0.2, 0], moving => {
      moving.oval(context.palette.water, 0, 0, 0, 0.003, 0.008, 0.003);
    }));
  }
  return seconds => {
    const active = program.circulation > 0.15 && program.water > 0.5;
    for (let index = 0; index < drops.length; index++) {
      const drop = drops[index];
      drop.visible = active;
      if (!active) continue;
      const elapsed = THREE.MathUtils.euclideanModulo(seconds + index * 0.027, 0.21);
      const armAngle = program.sprayAngle + (index % 2 ? Math.PI : 0);
      const radius = 0.07 + index % 3 * 0.04;
      const speed = 1.7 * program.circulation;
      const x = Math.cos(armAngle) * (radius + elapsed * 0.15);
      const z = -0.03 + Math.sin(armAngle) * (radius + elapsed * 0.15);
      const y = 0.17 + speed * elapsed - 4.903325 * elapsed * elapsed;
      context.world([x, Math.max(0.12, y), z], drop.position);
      drop.scale.y = 0.5 + Math.abs(speed - 9.80665 * elapsed) * 0.4;
    }
  };
}

export function buildDetailedDishwasher(context: ArchitectureContext): Animation {
  const program = new DishwashingProgram();
  buildDishwasherTub(context);
  const door = buildDishwasherDoor(context);
  buildDishwasherRails(context);
  const lower = buildDishRack(context, false);
  const upper = buildDishRack(context, true);
  const lowerRest = lower.position.clone();
  const upperRest = upper.position.clone();
  const arms = [buildSprayArm(context, 0.14, 0.4), buildSprayArm(context, 0.47, 0.38)];
  const plumbing = buildDishwasherPlumbing(context);
  const counterbalance = buildDoorCounterbalance(context, program);
  const spray = buildDishwasherSpray(context, program);
  const yaw = context.local.yaw ?? 0;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const sense = context.doorSensor([0, 0, 0.85], 0.67, 2.4);
  const status = context.moving("Dishwasher floor status projection", [0, -0.035, 0.66], moving => {
    moving.disc(context.palette.red, 0, 0, 0, 0.022, 0.002);
  });
  return seconds => {
    program.update(seconds, sense(seconds));
    counterbalance();
    spray(seconds);
    door.group.rotation.set(program.doorAngle, yaw, 0, "YXZ");
    lower.position.copy(lowerRest).addScaledVector(forward, program.rackExtension);
    upper.position.copy(upperRest).addScaledVector(forward, program.rackExtension * 0.7);
    for (let index = 0; index < arms.length; index++) arms[index].rotation.y = yaw + program.sprayAngle * (index % 2 ? -1 : 1);
    plumbing.fan.rotation.set(0, yaw, program.dryingFanAngle, "YXZ");
    plumbing.surface.visible = program.water > 0.1;
    plumbing.surface.position.y = context.local.y + 0.08 + program.water * 0.006;
    status.visible = program.phase !== "complete" && program.doorAngle < 0.05;
    door.display.set(program.remaining);
  };
}
