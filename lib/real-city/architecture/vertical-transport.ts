import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";

export type LiftPhase = "idle" | "closing" | "accelerating" | "cruising" | "braking" | "levelling" | "opening" | "boarding";

type LiftRequest = {
  floor: number;
  origin: number;
  createdAt: number;
  passengers: number;
};

type LiftState = {
  phase: LiftPhase;
  position: number;
  velocity: number;
  acceleration: number;
  targetFloor: number;
  currentFloor: number;
  direction: number;
  door: number;
  passengers: number;
  dwell: number;
  requests: LiftRequest[];
  served: number;
};

function floorHeight(floor: number, lobbyHeight: number, storeyHeight: number): number {
  return floor === 0 ? 0 : lobbyHeight + (floor - 1) * storeyHeight;
}

function closestFloor(position: number, count: number, lobbyHeight: number, storeyHeight: number): number {
  let closest = 0;
  let distance = Infinity;
  for (let floor = 0; floor <= count; floor++) {
    const gap = Math.abs(position - floorHeight(floor, lobbyHeight, storeyHeight));
    if (gap < distance) {
      distance = gap;
      closest = floor;
    }
  }
  return closest;
}

export class LiftController {
  readonly state: LiftState;
  private lastTime = 0;
  private nextCall = 0;
  private sequence = 0;
  private readonly capacity = 8;
  private readonly speed = 1.5;
  private readonly acceleration = 0.8;
  private readonly jerk = 1.6;

  constructor(readonly floors: number, readonly lobbyHeight: number, readonly storeyHeight: number, readonly seed: number) {
    this.state = {
      phase: "idle",
      position: 0,
      velocity: 0,
      acceleration: 0,
      targetFloor: 0,
      currentFloor: 0,
      direction: 0,
      door: 0,
      passengers: 0,
      dwell: 0,
      requests: [],
      served: 0,
    };
    this.nextCall = 1 + seed % 8;
  }

  request(floor: number, origin: number, passengers: number, seconds: number): boolean {
    if (!Number.isInteger(floor) || floor < 0 || floor > this.floors) return false;
    if (!Number.isInteger(origin) || origin < 0 || origin > this.floors) return false;
    if (floor === origin) return false;
    if (this.state.requests.some(request => request.floor === floor && request.origin === origin)) return false;
    if (this.state.requests.length >= 16) return false;
    this.state.requests.push({ floor, origin, createdAt: seconds, passengers: Math.max(1, Math.min(this.capacity, passengers)) });
    return true;
  }

  private generateCall(seconds: number, night: boolean): void {
    if (seconds < this.nextCall) return;
    const random = Math.sin((this.sequence + this.seed * 17) * 12.9898) * 43758.5453;
    const fraction = random - Math.floor(random);
    const upper = 1 + Math.floor(fraction * this.floors);
    const returning = (this.sequence + this.seed) % 3 !== 0;
    this.request(returning ? upper : 0, returning ? 0 : upper, 1 + this.sequence % 3, seconds);
    this.sequence++;
    this.nextCall = seconds + (night ? 42 : 18) + fraction * 17;
  }

  private chooseTarget(): boolean {
    const state = this.state;
    if (!state.requests.length) return false;
    let chosen = state.requests[0];
    let score = Infinity;
    for (const request of state.requests) {
      const destination = state.passengers > 0 ? request.floor : request.origin;
      const height = floorHeight(destination, this.lobbyHeight, this.storeyHeight);
      const distance = Math.abs(height - state.position);
      const wrongDirection = state.direction !== 0 && Math.sign(height - state.position) !== state.direction;
      const age = Math.max(0, this.lastTime - request.createdAt);
      const rank = distance + (wrongDirection ? 7 : 0) - Math.min(20, age * 0.12);
      if (rank < score) {
        score = rank;
        chosen = request;
      }
    }
    const index = state.requests.indexOf(chosen);
    if (index > 0) {
      state.requests.splice(index, 1);
      state.requests.unshift(chosen);
    }
    state.targetFloor = state.passengers > 0 ? chosen.floor : chosen.origin;
    const targetY = floorHeight(state.targetFloor, this.lobbyHeight, this.storeyHeight);
    state.direction = Math.sign(targetY - state.position);
    if (Math.abs(targetY - state.position) < 0.015) {
      state.currentFloor = state.targetFloor;
      state.phase = "opening";
    } else {
      state.phase = state.door > 0.001 ? "closing" : "accelerating";
    }
    return true;
  }

  private step(delta: number): void {
    const state = this.state;
    if (state.phase === "idle") {
      this.chooseTarget();
      return;
    }
    if (state.phase === "closing") {
      state.door = Math.max(0, state.door - delta / 1.8);
      if (state.door === 0) {
        state.phase = "accelerating";
        state.acceleration = 0;
      }
      return;
    }
    if (state.phase === "opening") {
      state.door = Math.min(1, state.door + delta / 1.6);
      if (state.door === 1) {
        state.phase = "boarding";
        state.dwell = 3.5;
      }
      return;
    }
    if (state.phase === "boarding") {
      state.dwell -= delta;
      if (state.dwell > 0) return;
      const request = state.requests[0];
      if (request) {
        if (state.passengers === 0 && request.origin === state.currentFloor) {
          state.passengers = request.passengers;
        } else if (request.floor === state.currentFloor) {
          state.served += state.passengers;
          state.passengers = 0;
          state.requests.shift();
        }
      }
      state.phase = "idle";
      if (!this.chooseTarget()) {
        state.targetFloor = state.currentFloor;
        state.phase = "closing";
      }
      return;
    }
    const targetY = floorHeight(state.targetFloor, this.lobbyHeight, this.storeyHeight);
    const distance = targetY - state.position;
    if (Math.abs(distance) < 0.008 && Math.abs(state.velocity) < 0.04) {
      state.position = targetY;
      state.velocity = 0;
      state.acceleration = 0;
      state.currentFloor = state.targetFloor;
      state.phase = state.requests.length ? "opening" : "idle";
      state.direction = 0;
      return;
    }
    const direction = Math.sign(distance);
    const stoppingDistance = state.velocity * state.velocity / (2 * this.acceleration) + Math.abs(state.velocity) * 0.22;
    const braking = Math.abs(distance) <= stoppingDistance + 0.03;
    const targetSpeed = Math.min(this.speed, Math.sqrt(2 * this.acceleration * Math.abs(distance)));
    let targetAcceleration = direction * this.acceleration;
    if (braking) targetAcceleration = -Math.sign(state.velocity) * this.acceleration;
    else if (Math.abs(state.velocity) >= targetSpeed) targetAcceleration = 0;
    if (Math.abs(distance) < 0.12) {
      state.phase = "levelling";
      state.velocity = direction * Math.min(0.12, Math.abs(distance) * 2.5);
      state.acceleration = 0;
    } else {
      state.phase = braking ? "braking" : Math.abs(state.velocity) < this.speed - 0.02 ? "accelerating" : "cruising";
      state.acceleration = THREE.MathUtils.clamp(targetAcceleration, state.acceleration - this.jerk * delta, state.acceleration + this.jerk * delta);
      state.velocity = THREE.MathUtils.clamp(state.velocity + state.acceleration * delta, -this.speed, this.speed);
    }
    const movement = state.velocity * delta;
    if (Math.abs(movement) > Math.abs(distance) && Math.sign(movement) === direction) {
      state.position = targetY;
      state.velocity = 0;
    } else state.position += movement;
    state.currentFloor = closestFloor(state.position, this.floors, this.lobbyHeight, this.storeyHeight);
  }

  update(seconds: number, night: boolean): void {
    if (!Number.isFinite(seconds)) return;
    if (seconds < this.lastTime) {
      this.lastTime = seconds;
      this.nextCall = seconds + 1;
      this.state.velocity = 0;
      this.state.acceleration = 0;
      return;
    }
    this.generateCall(seconds, night);
    const elapsed = Math.min(0.15, seconds - this.lastTime);
    this.lastTime = seconds;
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 60)));
    for (let step = 0; step < steps; step++) this.step(elapsed / steps);
  }
}

function buildGuideRail(context: ArchitectureContext, x: number, z: number, height: number): void {
  const { steel, aluminum } = context.palette;
  context.box(steel, x, height / 2, z, 0.09, height, 0.018);
  context.box(aluminum, x, height / 2, z + 0.025, 0.016, height, 0.05);
  const brackets = Math.max(2, Math.ceil(height / 2));
  for (let bracket = 0; bracket <= brackets; bracket++) {
    const y = bracket * height / brackets;
    context.box(steel, x, y, z - 0.055, 0.18, 0.035, 0.13);
    for (const side of [-1, 1]) context.disc(aluminum, x + side * 0.065, y + 0.024, z - 0.05, 0.012, 0.018);
  }
}

function buildLiftCabin(context: ArchitectureContext, materials: ArchitecturalMaterials): THREE.Group {
  const { aluminum, steel, glass, white, warmLight, dark } = context.palette;
  return context.moving("Lift cabin", [0, 0, 0], moving => {
    moving.box(steel, 0, -0.09, 0, 1.65, 0.18, 1.7);
    moving.box(materials.terrazzo, 0, 0.015, 0, 1.48, 0.03, 1.5);
    moving.box(aluminum, 0, 2.25, 0, 1.65, 0.09, 1.7);
    moving.box(white, 0, 2.19, 0, 1.49, 0.025, 1.5);
    for (const side of [-1, 1]) {
      moving.box(aluminum, side * 0.78, 1.1, 0, 0.07, 2.2, 1.55);
      moving.box(white, side * 0.738, 1.12, 0, 0.014, 2, 1.42);
      moving.beam(steel, [side * 0.68, 0.9, -0.62], [side * 0.68, 0.9, 0.5], 0.018);
      moving.beam(steel, [side * 0.68, 0.9, -0.5], [side * 0.75, 0.9, -0.5], 0.01);
      moving.beam(steel, [side * 0.68, 0.9, 0.4], [side * 0.75, 0.9, 0.4], 0.01);
      moving.box(aluminum, side * 0.7, 0.08, 0, 0.025, 0.12, 1.48);
    }
    moving.box(glass, 0, 1.25, -0.77, 1.48, 1.8, 0.025);
    moving.box(aluminum, 0, 0.16, -0.76, 1.5, 0.3, 0.04);
    moving.beam(steel, [-0.63, 0.9, -0.68], [0.63, 0.9, -0.68], 0.018);
    for (const side of [-1, 1]) moving.box(warmLight, side * 0.6, 2.17, 0, 0.045, 0.012, 1.2);
    moving.box(dark, 0.69, 1.18, 0.51, 0.02, 0.67, 0.18);
    for (let button = 0; button < 8; button++) {
      const y = 0.93 + Math.floor(button / 2) * 0.09;
      const z = 0.47 + (button % 2) * 0.08;
      moving.beam(aluminum, [0.67, y, z], [0.681, y, z], 0.017);
    }
    moving.box(steel, 0, 2.38, -0.04, 1.75, 0.16, 0.12);
    for (const side of [-1, 1]) {
      moving.box(steel, side * 0.83, 1.1, 0.1, 0.08, 2.5, 0.1);
      moving.box(aluminum, side * 0.86, 2.08, 0.1, 0.12, 0.17, 0.15);
      moving.box(aluminum, side * 0.86, 0.12, 0.1, 0.12, 0.17, 0.15);
    }
  });
}

function buildLiftDoorLeaf(context: ArchitectureContext, x: number, y: number, material: THREE.Material, cabin: boolean): THREE.Group {
  const { aluminum, rubber } = context.palette;
  return context.moving(cabin ? "Lift cabin sliding leaf" : "Lift landing sliding leaf", [x, y, 0.86], moving => {
    moving.box(material, 0, 1.05, 0, 0.57, 2.1, 0.035);
    moving.box(aluminum, 0, 0.08, 0.025, 0.57, 0.12, 0.012);
    moving.box(aluminum, 0, 2.075, 0.025, 0.57, 0.045, 0.012);
    moving.box(rubber, x > 0 ? -0.287 : 0.287, 1.05, 0, 0.012, 2.1, 0.045);
    if (!cabin) {
      moving.box(context.palette.glass, 0, 1.4, 0.028, 0.38, 0.63, 0.008);
      for (const side of [-1, 1]) moving.box(aluminum, side * 0.2, 1.4, 0.034, 0.02, 0.67, 0.016);
    }
  });
}

function buildCallButton(context: ArchitectureContext, up: boolean, down: boolean): void {
  const { aluminum, dark, screen } = context.palette;
  context.box(aluminum, 0, 0, 0, 0.12, 0.28, 0.025);
  context.box(dark, 0, 0.06, 0.017, 0.085, 0.07, 0.008);
  if (up) {
    context.box(screen, -0.012, 0.06, 0.024, 0.028, 0.008, 0.005, 0, Math.PI / 4);
    context.box(screen, 0.012, 0.06, 0.024, 0.028, 0.008, 0.005, 0, -Math.PI / 4);
  }
  if (down) {
    context.box(dark, 0, -0.065, 0.017, 0.085, 0.07, 0.008);
    context.box(screen, -0.012, -0.065, 0.024, 0.028, 0.008, 0.005, 0, -Math.PI / 4);
    context.box(screen, 0.012, -0.065, 0.024, 0.028, 0.008, 0.005, 0, Math.PI / 4);
  }
}

function buildFloorIndicator(context: ArchitectureContext, controller: LiftController): Animation {
  const { dark, screen } = context.palette;
  context.box(dark, 0, 0, 0, 0.32, 0.16, 0.025);
  const groups: THREE.Group[] = [];
  const positions: readonly [number, number, boolean][] = [
    [0, 0.048, true],
    [0.033, 0.026, false],
    [0.033, -0.026, false],
    [0, -0.048, true],
    [-0.033, -0.026, false],
    [-0.033, 0.026, false],
    [0, 0, true],
  ];
  for (let digit = 0; digit < 2; digit++) {
    for (let segment = 0; segment < positions.length; segment++) {
      const [x, y, horizontal] = positions[segment];
      groups.push(context.moving("Lift seven-segment indicator", [x + (digit - 0.5) * 0.1, y, 0.018], moving => {
        moving.box(screen, 0, 0, 0, horizontal ? 0.057 : 0.008, horizontal ? 0.008 : 0.042, 0.005);
      }));
    }
  }
  const masks = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
  return () => {
    const value = controller.state.currentFloor;
    const digits = [Math.floor(value / 10), value % 10];
    for (let digit = 0; digit < 2; digit++) {
      for (let segment = 0; segment < 7; segment++) groups[digit * 7 + segment].visible = digit !== 0 || value >= 10 ? (masks[digits[digit]] & (1 << segment)) !== 0 : false;
    }
  };
}

export function buildPassengerLift(context: ArchitectureContext, materials: ArchitecturalMaterials, floors: number, lobbyHeight: number, storeyHeight: number, seed: number): Animation[] {
  const animations: Animation[] = [];
  const { steel, concrete, glass, aluminum, rubber, yellow } = context.palette;
  const controller = new LiftController(floors, lobbyHeight, storeyHeight, seed);
  const top = floorHeight(floors, lobbyHeight, storeyHeight);
  const shaftHeight = top + 3.4;
  const cabin = buildLiftCabin(context, materials);
  const cabinBase = cabin.position.clone();
  const cabinDoors = [-1, 1].map(side => buildLiftDoorLeaf(context, side * 0.285, 0, aluminum, true));
  const cabinDoorRest = cabinDoors.map(door => door.position.clone());
  const horizontal = new THREE.Vector3(Math.cos(context.local.yaw ?? 0), 0, -Math.sin(context.local.yaw ?? 0));
  for (const side of [-1, 1]) {
    context.box(concrete, side * 1.02, shaftHeight / 2, 0, 0.12, shaftHeight, 2.02);
    buildGuideRail(context, side * 0.9, 0.1, shaftHeight - 0.4);
    context.box(glass, side * 0.54, shaftHeight / 2, -0.99, 1.02, shaftHeight, 0.025);
    context.box(aluminum, side * 1.04, shaftHeight / 2, -1, 0.035, shaftHeight, 0.04);
  }
  context.box(concrete, 0, -0.24, 0, 2.16, 0.2, 2.12);
  context.box(steel, 0, shaftHeight, 0, 2.15, 0.15, 0.2);
  for (const side of [-1, 1]) {
    context.disc(rubber, side * 0.48, -0.09, 0, 0.07, 0.16);
    context.disc(yellow, side * 0.48, -0.14, 0, 0.1, 0.05);
  }
  const counterweight = context.moving("Lift counterweight", [0, top, -0.87], moving => {
    for (const side of [-1, 1]) moving.box(steel, side * 0.3, 0.8, 0, 0.05, 1.6, 0.16);
    for (let plate = 0; plate < 12; plate++) moving.box(concrete, 0, 0.11 + plate * 0.115, 0, 0.55, 0.105, 0.12);
    moving.box(steel, 0, 1.59, 0, 0.65, 0.06, 0.18);
    moving.box(steel, 0, 0.03, 0, 0.65, 0.06, 0.18);
  });
  const counterRest = counterweight.position.clone();
  const ropes = [-1, 1].map(side => context.moving("Lift suspension cable", [side * 0.06, shaftHeight - 0.25, 0], moving => {
    moving.disc(steel, 0, -0.5, 0, 0.008, 1);
  }));
  const landingDoors: { floor: number; leaves: THREE.Group[]; rest: THREE.Vector3[] }[] = [];
  for (let floor = 0; floor <= floors; floor++) {
    const level = floorHeight(floor, lobbyHeight, storeyHeight);
    const landing = context.at({ x: 0, y: level, z: 0.07 });
    for (const side of [-1, 1]) landing.box(aluminum, side * 0.68, 1.1, 0.86, 0.16, 2.2, 0.16);
    landing.box(aluminum, 0, 2.18, 0.86, 1.52, 0.16, 0.16);
    landing.box(steel, 0, 0.012, 0.86, 1.52, 0.024, 0.22);
    for (let groove = 0; groove < 4; groove++) landing.box(rubber, 0, 0.026, 0.79 + groove * 0.045, 1.45, 0.005, 0.006);
    const leaves = [-1, 1].map(side => buildLiftDoorLeaf(landing, side * 0.285, 0, aluminum, false));
    landingDoors.push({ floor, leaves, rest: leaves.map(leaf => leaf.position.clone()) });
    buildCallButton(landing.at({ x: 0.86, y: 1.13, z: 0.96 }), floor < floors, floor > 0);
    landing.label(String(floor).padStart(2, "0"), -0.85, 1.55, 0.96, 0.18, 0.16, "#e8e8dc", "#3a4644");
    if (floor === 0) animations.push(buildFloorIndicator(landing.at({ x: 0, y: 2.38, z: 0.94 }), controller));
    context.box(steel, 0, level + 2.5, 0.9, 1.9, 0.08, 0.08);
  }
  const drive = context.moving("Lift traction sheave", [0, shaftHeight - 0.3, 0], moving => {
    moving.beam(steel, [-0.12, 0, 0], [0.12, 0, 0], 0.24);
    moving.box(yellow, -0.125, 0, 0, 0.008, 0.36, 0.035);
    moving.box(yellow, -0.125, 0, 0, 0.008, 0.035, 0.36);
  });
  context.box(steel, 0.3, shaftHeight - 0.3, 0, 0.28, 0.32, 0.4);
  const operation: Animation = (seconds, night) => {
    controller.update(seconds, night);
    const state = controller.state;
    cabin.position.copy(cabinBase);
    cabin.position.y += state.position;
    const doorOpen = THREE.MathUtils.smoothstep(state.door, 0, 1);
    cabinDoors.forEach((door, index) => {
      door.position.copy(cabinDoorRest[index]).addScaledVector(horizontal, (index === 0 ? -1 : 1) * doorOpen * 0.56);
      door.position.y += state.position;
    });
    for (const landing of landingDoors) {
      const opening = Math.abs(state.position - floorHeight(landing.floor, lobbyHeight, storeyHeight)) < 0.03 ? doorOpen : 0;
      landing.leaves.forEach((leaf, index) => leaf.position.copy(landing.rest[index]).addScaledVector(horizontal, (index === 0 ? -1 : 1) * opening * 0.56));
    }
    counterweight.position.copy(counterRest);
    counterweight.position.y -= state.position;
    for (const rope of ropes) rope.scale.y = Math.max(0.15, shaftHeight - 2.7 - state.position);
    drive.rotation.x = state.position / 0.24;
  };
  animations.unshift(operation);
  return animations;
}

export function buildServiceStair(context: ArchitectureContext, materials: ArchitecturalMaterials, floors: number, firstHeight: number, storeyHeight: number): void {
  const { concrete, steel, aluminum, yellow, warmLight } = context.palette;
  const width = 2.5;
  const depth = 4.8;
  for (let floor = 0; floor < floors; floor++) {
    const level = floorHeight(floor, firstHeight, storeyHeight);
    const rise = floor === 0 ? firstHeight : storeyHeight;
    const halfRise = rise / 2;
    const steps = Math.ceil(halfRise / 0.175);
    const tread = 0.265;
    const run = steps * tread;
    for (const side of [-1, 1]) {
      const x = side * width * 0.25;
      const direction = side === -1 ? -1 : 1;
      const baseY = level + (side === -1 ? 0 : halfRise);
      for (let step = 0; step < steps; step++) {
        const y = baseY + (step + 0.5) * halfRise / steps;
        const z = direction * ((step + 0.5) * tread - run / 2);
        context.box(concrete, x, y, z, 1.12, halfRise / steps, tread + 0.01);
        context.box(materials.terrazzo, x, y + halfRise / steps / 2 + 0.006, z, 1.1, 0.012, tread);
        context.box(yellow, x, y + halfRise / steps / 2 + 0.014, z + direction * tread * 0.4, 1.07, 0.004, 0.025);
        if (step % 3 === 0 || step === steps - 1) {
          context.beam(steel, [x - side * 0.5, y, z], [x - side * 0.5, y + 0.95, z], 0.018);
        }
      }
      context.beam(aluminum, [x - side * 0.5, baseY + 0.95, -direction * run / 2], [x - side * 0.5, baseY + halfRise + 0.95, direction * run / 2], 0.025);
      context.beam(aluminum, [x + side * 0.5, baseY + 0.95, -direction * run / 2], [x + side * 0.5, baseY + halfRise + 0.95, direction * run / 2], 0.025);
      context.rectangularBeam(concrete, [x, baseY - 0.1, -direction * run / 2], [x, baseY + halfRise - 0.1, direction * run / 2], 1.1, 0.12);
    }
    context.box(concrete, 0, level + halfRise - 0.08, -depth / 2 + 0.55, width, 0.16, 1.1);
    context.box(concrete, 0, level + rise - 0.08, depth / 2 - 0.55, width, 0.16, 1.1);
    context.box(warmLight, -width / 2 + 0.04, level + 1.7, 0, 0.035, 0.12, 0.26);
    context.label(`F${floor + 1}`, width / 2 - 0.03, level + rise - 0.6, 1.8, 0.28, 0.22, "#eeeece", "#355746", -Math.PI / 2);
  }
}
