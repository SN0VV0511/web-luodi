import { angleDelta, clamp, damping, lerp, point3, positiveModulo, smoothstep, type Point3 } from "./math";
import { emptyPose } from "./population";
import type { Actor, ActorPose, GestureKind, LifeContext } from "./types";

interface PoseMemory {
  target: ActorPose;
  previousKind: GestureKind;
  lastLeftContact: boolean;
  lastRightContact: boolean;
  leftContact: Point3;
  rightContact: Point3;
  leftAnchor: Point3;
  rightAnchor: Point3;
  filteredSpeed: number;
  turnLean: number;
  torsoLean: number;
  lastFootstep: number;
}

export type FootstepListener = (position: Point3, strength: number, seconds: number, heading: number) => void;

function set(target: Point3, x: number, y: number, z: number): void {
  target.x = x;
  target.y = y;
  target.z = z;
}

function blendPoint(target: Point3, desired: Point3, amount: number): void {
  target.x = lerp(target.x, desired.x, amount);
  target.y = lerp(target.y, desired.y, amount);
  target.z = lerp(target.z, desired.z, amount);
}

function rotateX(target: Point3, angle: number, centerY: number): void {
  const y = target.y - centerY;
  const z = target.z;
  target.y = centerY + y * Math.cos(angle) - z * Math.sin(angle);
  target.z = y * Math.sin(angle) + z * Math.cos(angle);
}

function length(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export class ResidentPoses {
  private readonly memories = new Map<number, PoseMemory>();
  private readonly forward = point3();

  constructor(private readonly footstep?: FootstepListener) {}

  reset(): void {
    this.memories.clear();
  }

  tick(context: LifeContext): void {
    for (const actor of context.actors) {
      if (!actor.visible) continue;
      const memory = this.memory(actor);
      const dt = context.time.dt;
      memory.filteredSpeed = damping(memory.filteredSpeed, actor.speed, 7, dt);
      const turnRate = angleDelta(actor.previousHeading, actor.heading) / Math.max(dt, 0.001);
      memory.turnLean = damping(memory.turnLean, clamp(turnRate * memory.filteredSpeed * 0.04, -0.12, 0.12), 6, dt);
      const acceleration = (actor.speed - Math.hypot(actor.velocity.x, actor.velocity.z)) / Math.max(dt, 0.001);
      memory.torsoLean = damping(memory.torsoLean, clamp(acceleration * 0.02, -0.07, 0.1), 5, dt);
      this.neutral(actor, memory.target, context);
      this.walk(actor, memory, context);
      this.gesture(actor, memory.target, context);
      this.gaze(actor, memory.target, context);
      this.balance(actor, memory, context);
      this.solveLimbs(actor, memory.target);
      this.blend(actor, memory, context);
      this.contact(actor, memory, context);
      memory.previousKind = actor.gesture.kind;
    }
  }

  private memory(actor: Actor): PoseMemory {
    let value = this.memories.get(actor.id);
    if (value) return value;
    value = {
      target: emptyPose(),
      previousKind: actor.gesture.kind,
      lastLeftContact: true,
      lastRightContact: true,
      leftContact: point3(),
      rightContact: point3(),
      leftAnchor: point3(),
      rightAnchor: point3(),
      filteredSpeed: 0,
      turnLean: 0,
      torsoLean: 0,
      lastFootstep: -1,
    };
    this.memories.set(actor.id, value);
    return value;
  }

  private neutral(actor: Actor, pose: ActorPose, context: LifeContext): void {
    const breath = Math.sin(context.time.seconds * (actor.needs.stress > 0.6 ? 2.8 : 1.6) + actor.id * 0.77) * 0.004;
    const slump = (1 - actor.needs.energy) * 0.035;
    const shoulder = actor.appearance.shoulderWidth * 0.5;
    set(pose.hips, 0, 0.94, 0);
    set(pose.chest, 0, 1.3 + breath - slump, 0.015 + slump);
    set(pose.head, 0, 1.63 + breath - slump, 0.015 + slump * 2);
    set(pose.leftShoulder, -shoulder, 1.43 + breath - slump, 0.005);
    set(pose.rightShoulder, shoulder, 1.43 + breath - slump, 0.005);
    set(pose.leftElbow, -shoulder - 0.035, 1.13, 0.01);
    set(pose.rightElbow, shoulder + 0.035, 1.13, 0.01);
    set(pose.leftHand, -shoulder - 0.015, 0.85, 0.045);
    set(pose.rightHand, shoulder + 0.015, 0.85, 0.045);
    set(pose.leftKnee, -0.095, 0.51, 0.035);
    set(pose.rightKnee, 0.095, 0.51, 0.035);
    set(pose.leftAnkle, -0.105, 0.09, 0);
    set(pose.rightAnkle, 0.105, 0.09, 0);
    pose.leftFootPitch = 0;
    pose.rightFootPitch = 0;
    pose.leftFootPlanted = true;
    pose.rightFootPlanted = true;
    pose.headYaw = 0;
    pose.headPitch = slump;
    pose.chestYaw = 0;
    pose.chestPitch = slump;
    pose.breathing = breath;
  }

  private walk(actor: Actor, memory: PoseMemory, context: LifeContext): void {
    const pose = memory.target;
    if (actor.mode !== "walking" || memory.filteredSpeed < 0.05) return;
    const speed = memory.filteredSpeed;
    const running = actor.task?.kind === "jog" || actor.gesture.kind === "jog";
    const stride = clamp(speed / (running ? 3.5 : 3.1), 0.08, running ? 0.62 : 0.42);
    const phase = actor.gaitPhase;
    const bounce = Math.cos(phase * 2) * (running ? 0.045 : 0.018);
    const sway = Math.sin(phase) * 0.014;
    pose.hips.y += bounce;
    pose.hips.x += sway;
    pose.chest.y += bounce * 0.85;
    pose.head.y += bounce * 0.55;
    pose.chestYaw = Math.sin(phase) * 0.045;
    pose.chestPitch = running ? 0.15 : 0.035;
    this.walkLeg(pose.leftAnkle, pose.leftKnee, phase, stride, running, -1);
    this.walkLeg(pose.rightAnkle, pose.rightKnee, phase + Math.PI, stride, running, 1);
    const leftCycle = positiveModulo(phase, Math.PI * 2);
    const rightCycle = positiveModulo(phase + Math.PI, Math.PI * 2);
    pose.leftFootPlanted = leftCycle >= Math.PI;
    pose.rightFootPlanted = rightCycle >= Math.PI;
    pose.leftFootPitch = pose.leftFootPlanted ? Math.max(0, Math.sin(leftCycle) * -0.1) : Math.sin(leftCycle) * -0.12;
    pose.rightFootPitch = pose.rightFootPlanted ? Math.max(0, Math.sin(rightCycle) * -0.1) : Math.sin(rightCycle) * -0.12;
    const armSwing = Math.sin(phase) * stride * 0.85;
    pose.leftHand.z -= armSwing;
    pose.rightHand.z += armSwing;
    pose.leftElbow.z -= armSwing * 0.45;
    pose.rightElbow.z += armSwing * 0.45;
    if (running) {
      pose.leftHand.y = 1.16;
      pose.rightHand.y = 1.16;
      pose.leftElbow.y = 1.08;
      pose.rightElbow.y = 1.08;
      pose.leftHand.z += 0.15;
      pose.rightHand.z += 0.15;
    }
    if (actor.mobility === "cane") {
      pose.rightHand.x = 0.29;
      pose.rightHand.y = 0.94;
      pose.rightHand.z = 0.2 + armSwing * 0.15;
      pose.leftAnkle.y = Math.min(pose.leftAnkle.y, 0.12);
    }
    if (actor.mobility === "stroller") {
      pose.leftHand.x = -0.23;
      pose.rightHand.x = 0.23;
      pose.leftHand.y = 0.98;
      pose.rightHand.y = 0.98;
      pose.leftHand.z = 0.48;
      pose.rightHand.z = 0.48;
    }
    if (context.weather.snow > 0.4) {
      pose.leftAnkle.x -= 0.025;
      pose.rightAnkle.x += 0.025;
      pose.leftKnee.z += 0.035;
      pose.rightKnee.z += 0.035;
    }
  }

  private walkLeg(ankle: Point3, knee: Point3, phase: number, stride: number, running: boolean, side: number): void {
    const cycle = positiveModulo(phase, Math.PI * 2);
    const swing = cycle < Math.PI;
    const progress = swing ? cycle / Math.PI : (cycle - Math.PI) / Math.PI;
    ankle.x = side * 0.105;
    ankle.z = swing ? lerp(-stride, stride, smoothstep(progress)) : lerp(stride, -stride, progress);
    ankle.y = 0.09 + (swing ? Math.sin(progress * Math.PI) * (running ? 0.21 : 0.095) : 0);
    knee.x = side * 0.105;
    knee.z = ankle.z * 0.4 + (swing ? Math.sin(progress * Math.PI) * 0.11 : 0.04);
    knee.y = 0.52 + (swing ? Math.sin(progress * Math.PI) * 0.055 : 0);
  }

  private gesture(actor: Actor, pose: ActorPose, context: LifeContext): void {
    const gesture = actor.gesture;
    const elapsed = context.time.seconds - gesture.startedAt;
    const intensity = clamp(gesture.intensity, 0, 1);
    const swing = Math.sin(elapsed * 2.1 + actor.id * 0.8);
    const fast = Math.sin(elapsed * 5);
    const hand = gesture.hand === "left" ? pose.leftHand : pose.rightHand;
    const other = gesture.hand === "left" ? pose.rightHand : pose.leftHand;
    const side = gesture.hand === "left" ? -1 : 1;
    if (actor.mode === "seated" || gesture.kind === "sit" || actor.mode === "eating") this.sit(pose);
    switch (gesture.kind) {
      case "talk":
        hand.x = side * (0.28 + swing * 0.06 * intensity);
        hand.y = 1.12 + swing * 0.055;
        hand.z = 0.28 + Math.cos(elapsed * 1.7) * 0.07;
        other.y = 0.97;
        other.z = 0.16;
        pose.headPitch = Math.sin(elapsed * 3.2) * 0.025;
        break;
      case "listen":
        pose.headPitch = Math.max(0, Math.sin(elapsed * 1.4)) * 0.045;
        pose.headYaw = Math.sin(elapsed * 0.7) * 0.025;
        break;
      case "wave":
        hand.x = side * (0.39 + fast * 0.075);
        hand.y = 1.83 + Math.cos(elapsed * 5) * 0.025;
        hand.z = 0.08;
        break;
      case "handshake":
        hand.x = side * 0.12;
        hand.y = 1.08 + Math.sin(elapsed * 7) * 0.025;
        hand.z = 0.48;
        pose.chestPitch = 0.035;
        break;
      case "point":
        hand.x = side * 0.18;
        hand.y = 1.36;
        hand.z = 0.6;
        pose.headYaw = side * 0.12;
        break;
      case "phone":
        hand.x = side * 0.16;
        hand.y = 1.62;
        hand.z = 0.08;
        other.y = 1.02 + swing * 0.06;
        other.z = 0.16;
        pose.headPitch = 0.03;
        break;
      case "watch":
        hand.x = -side * 0.03;
        hand.y = 1.22;
        hand.z = 0.32;
        pose.headPitch = 0.26;
        break;
      case "carry":
        hand.x = side * 0.26;
        hand.y = 0.84;
        hand.z = 0.04;
        if (actor.inventory.some((entry) => entry.kind === "parcel")) {
          pose.leftHand.x = -0.17;
          pose.rightHand.x = 0.17;
          pose.leftHand.y = 1.08;
          pose.rightHand.y = 1.08;
          pose.leftHand.z = 0.34;
          pose.rightHand.z = 0.34;
        }
        break;
      case "sip": {
        const lift = Math.pow((Math.sin(elapsed * 1.25) + 1) * 0.5, 3);
        hand.x = side * lerp(0.19, 0.07, lift);
        hand.y = lerp(1.08, 1.53, lift);
        hand.z = lerp(0.28, 0.18, lift);
        pose.headPitch = -lift * 0.06;
        break;
      }
      case "eat": {
        const bite = Math.max(0, Math.sin(elapsed * 1.8));
        hand.x = side * 0.11;
        hand.y = lerp(1.05, 1.48, bite);
        hand.z = lerp(0.35, 0.18, bite);
        other.y = 0.98;
        other.z = 0.28;
        pose.headPitch = 0.08;
        break;
      }
      case "read":
        pose.leftHand.x = -0.14;
        pose.rightHand.x = 0.14;
        pose.leftHand.y = 1.12;
        pose.rightHand.y = 1.12;
        pose.leftHand.z = 0.32;
        pose.rightHand.z = 0.32;
        pose.headPitch = 0.22;
        if (positiveModulo(elapsed, 7) > 6.2) pose.rightHand.x -= Math.sin(positiveModulo(elapsed, 7) / 0.8 * Math.PI) * 0.1;
        break;
      case "type":
        pose.leftHand.x = -0.08;
        pose.rightHand.x = 0.08;
        pose.leftHand.y = 1.08 + fast * 0.008;
        pose.rightHand.y = 1.08 - fast * 0.008;
        pose.leftHand.z = 0.33;
        pose.rightHand.z = 0.33;
        pose.headPitch = 0.28;
        break;
      case "pay":
      case "scan":
        hand.x = side * 0.15;
        hand.y = 1.03;
        hand.z = 0.48 + swing * 0.025;
        pose.headPitch = 0.13;
        break;
      case "write":
        hand.x = side * 0.035 + fast * 0.015;
        hand.y = 1.15;
        hand.z = 0.33 + Math.cos(elapsed * 4) * 0.01;
        other.x = -side * 0.11;
        other.y = 1.13;
        other.z = 0.32;
        pose.headPitch = 0.24;
        break;
      case "sweep":
      case "mop":
        pose.leftHand.x = -0.08 + swing * 0.12;
        pose.rightHand.x = 0.12 + swing * 0.12;
        pose.leftHand.y = 1.12;
        pose.rightHand.y = 0.88;
        pose.leftHand.z = 0.3 + swing * 0.08;
        pose.rightHand.z = 0.48 + swing * 0.1;
        pose.chestYaw = swing * 0.06;
        pose.chestPitch = 0.12;
        pose.headPitch = 0.2;
        break;
      case "dig":
        this.kneel(pose);
        hand.y = 0.35;
        hand.z = 0.53 + swing * 0.08;
        other.y = 0.53;
        other.z = 0.31;
        break;
      case "water":
        hand.x = side * 0.22;
        hand.y = 0.91;
        hand.z = 0.38;
        pose.chestPitch = 0.08;
        pose.headPitch = 0.26;
        break;
      case "repair":
        this.kneel(pose);
        hand.y = 0.55;
        hand.z = 0.47 + fast * 0.025;
        other.y = 0.58;
        other.z = 0.45;
        pose.headPitch = 0.2;
        break;
      case "lift": {
        const bend = (Math.sin(elapsed * 1.4) + 1) * 0.5;
        pose.hips.y -= bend * 0.2;
        pose.chest.y -= bend * 0.3;
        pose.head.y -= bend * 0.3;
        pose.chestPitch = bend * 0.2;
        pose.leftHand.y = 0.95 - bend * 0.45;
        pose.rightHand.y = pose.leftHand.y;
        pose.leftHand.z = 0.35;
        pose.rightHand.z = 0.35;
        pose.leftKnee.z += bend * 0.16;
        pose.rightKnee.z += bend * 0.16;
        break;
      }
      case "push":
        pose.leftHand.x = -0.24;
        pose.rightHand.x = 0.24;
        pose.leftHand.y = 1.0;
        pose.rightHand.y = 1.0;
        pose.leftHand.z = 0.48;
        pose.rightHand.z = 0.48;
        pose.chestPitch = 0.05;
        break;
      case "kneel":
        this.kneel(pose);
        break;
      case "stretch":
        this.stretch(pose, elapsed);
        break;
      case "guitar":
        pose.leftHand.x = -0.38;
        pose.leftHand.y = 1.2;
        pose.leftHand.z = 0.19;
        pose.rightHand.x = 0.08;
        pose.rightHand.y = 1.02 + fast * 0.055;
        pose.rightHand.z = 0.26;
        pose.chestYaw = Math.sin(elapsed) * 0.025;
        break;
      case "photo":
        pose.leftHand.x = -0.105;
        pose.rightHand.x = 0.105;
        pose.leftHand.y = 1.57;
        pose.rightHand.y = 1.57;
        pose.leftHand.z = 0.22;
        pose.rightHand.z = 0.22;
        pose.headPitch = 0.02;
        break;
      case "throw":
        hand.x = side * 0.22;
        hand.y = 1.2 + Math.sin(elapsed * 3) * 0.3;
        hand.z = Math.sin(elapsed * 3) * 0.45;
        pose.chestYaw = Math.sin(elapsed * 3) * 0.08;
        break;
      case "catch":
        pose.leftHand.x = -0.16;
        pose.rightHand.x = 0.16;
        pose.leftHand.y = 1.15;
        pose.rightHand.y = 1.15;
        pose.leftHand.z = 0.45;
        pose.rightHand.z = 0.45;
        break;
      case "umbrella":
        hand.x = side * 0.17;
        hand.y = 1.3;
        hand.z = 0.16;
        break;
      case "cane":
        hand.x = side * 0.29;
        hand.y = 0.94;
        hand.z = 0.2;
        break;
      default:
        break;
    }
    if (actor.umbrellaOpen > 0.25) {
      pose.leftHand.x = -0.17;
      pose.leftHand.y = 1.3;
      pose.leftHand.z = 0.16;
    }
    if (gesture.hasTarget) this.applyTarget(actor, pose, intensity);
  }

  private sit(pose: ActorPose): void {
    const drop = 0.47;
    pose.hips.y -= drop;
    pose.chest.y -= drop;
    pose.head.y -= drop;
    pose.leftShoulder.y -= drop;
    pose.rightShoulder.y -= drop;
    pose.leftElbow.y -= drop;
    pose.rightElbow.y -= drop;
    pose.leftHand.y = 0.62;
    pose.rightHand.y = 0.62;
    pose.leftHand.z = 0.3;
    pose.rightHand.z = 0.3;
    set(pose.leftKnee, -0.13, 0.48, 0.4);
    set(pose.rightKnee, 0.13, 0.48, 0.4);
    set(pose.leftAnkle, -0.13, 0.09, 0.43);
    set(pose.rightAnkle, 0.13, 0.09, 0.43);
  }

  private kneel(pose: ActorPose): void {
    const drop = 0.35;
    pose.hips.y -= drop;
    pose.chest.y -= drop;
    pose.head.y -= drop;
    pose.leftShoulder.y -= drop;
    pose.rightShoulder.y -= drop;
    pose.chestPitch = 0.16;
    set(pose.leftKnee, -0.13, 0.12, -0.08);
    set(pose.rightKnee, 0.15, 0.44, 0.35);
    set(pose.leftAnkle, -0.13, 0.09, -0.38);
    set(pose.rightAnkle, 0.15, 0.09, 0.39);
    set(pose.leftHand, -0.17, 0.64, 0.35);
    set(pose.rightHand, 0.17, 0.58, 0.45);
  }

  private stretch(pose: ActorPose, elapsed: number): void {
    const phase = elapsed * 0.4;
    const reach = (Math.sin(phase) + 1) * 0.5;
    pose.leftHand.x = -lerp(0.38, 0.56, reach);
    pose.rightHand.x = lerp(0.38, 0.56, reach);
    pose.leftHand.y = 1.3 + Math.sin(phase + 0.6) * 0.28;
    pose.rightHand.y = 1.3 + Math.sin(phase - 0.6) * 0.28;
    pose.leftHand.z = 0.15 + Math.cos(phase) * 0.16;
    pose.rightHand.z = 0.15 + Math.cos(phase + 1) * 0.16;
    pose.hips.x = Math.sin(phase) * 0.065;
    pose.chest.x = pose.hips.x * 0.7;
    pose.head.x = pose.hips.x * 0.5;
    pose.leftAnkle.x = -0.23;
    pose.rightAnkle.x = 0.23;
    pose.leftKnee.x = -0.21;
    pose.rightKnee.x = 0.21;
  }

  private applyTarget(actor: Actor, pose: ActorPose, intensity: number): void {
    const scale = 1.76 / actor.appearance.height;
    const dx = (actor.gesture.target.x - actor.position.x) * scale;
    const dz = (actor.gesture.target.z - actor.position.z) * scale;
    const target = this.forward;
    target.x = dx * Math.cos(actor.heading) - dz * Math.sin(actor.heading);
    target.z = dz * Math.cos(actor.heading) + dx * Math.sin(actor.heading);
    target.y = (actor.gesture.target.y - actor.groundY) * scale;
    if (actor.gesture.hand !== "right") blendPoint(pose.leftHand, target, intensity);
    if (actor.gesture.hand !== "left") blendPoint(pose.rightHand, target, intensity);
  }

  private gaze(actor: Actor, pose: ActorPose, context: LifeContext): void {
    if (actor.gesture.gazeUntil <= context.time.seconds) return;
    const targetActor = context.actorById.get(actor.gesture.gazeId);
    const target = targetActor?.visible ? targetActor.position : actor.gesture.gazePoint;
    const dx = target.x - actor.position.x;
    const dz = target.z - actor.position.z;
    if (Math.hypot(dx, dz) < 0.05) return;
    const targetYaw = angleDelta(actor.heading, Math.atan2(dx, dz));
    pose.headYaw = clamp(targetYaw, -0.85, 0.85);
    if (Math.abs(targetYaw) > 0.8) pose.chestYaw += clamp(targetYaw * 0.18, -0.18, 0.18);
    if (targetActor) pose.headPitch += clamp((actor.appearance.height - targetActor.appearance.height) * 0.5, -0.2, 0.25);
  }

  private balance(actor: Actor, memory: PoseMemory, context: LifeContext): void {
    const pose = memory.target;
    pose.chest.x -= memory.turnLean;
    pose.head.x -= memory.turnLean * 1.4;
    pose.chestPitch += memory.torsoLean;
    const wind = context.weather.windX * Math.cos(actor.heading) - context.weather.windZ * Math.sin(actor.heading);
    const windLean = clamp(wind * 0.0015 * (actor.umbrellaOpen > 0.5 ? 2 : 1), -0.035, 0.035);
    pose.chest.x += windLean;
    pose.head.x += windLean * 1.3;
    const chestDrop = pose.chest.y - 1.3;
    pose.leftShoulder.y = 1.43 + chestDrop;
    pose.rightShoulder.y = 1.43 + chestDrop;
    pose.leftShoulder.x = pose.chest.x - actor.appearance.shoulderWidth * 0.5;
    pose.rightShoulder.x = pose.chest.x + actor.appearance.shoulderWidth * 0.5;
    pose.leftShoulder.z = pose.chest.z;
    pose.rightShoulder.z = pose.chest.z;
    rotateX(pose.head, pose.chestPitch * 0.5, pose.hips.y);
    rotateX(pose.leftShoulder, pose.chestPitch * 0.5, pose.hips.y);
    rotateX(pose.rightShoulder, pose.chestPitch * 0.5, pose.hips.y);
  }

  private solveLimbs(actor: Actor, pose: ActorPose): void {
    this.solveArm(pose.leftShoulder, pose.leftHand, pose.leftElbow, -1, actor.appearance.build);
    this.solveArm(pose.rightShoulder, pose.rightHand, pose.rightElbow, 1, actor.appearance.build);
    this.clampLeg(pose.hips, pose.leftAnkle, pose.leftKnee, -1);
    this.clampLeg(pose.hips, pose.rightAnkle, pose.rightKnee, 1);
  }

  private solveArm(shoulder: Point3, hand: Point3, elbow: Point3, side: number, build: number): void {
    const upper = 0.285;
    const lower = 0.275;
    let span = length(shoulder, hand);
    if (span > upper + lower - 0.004) {
      const ratio = (upper + lower - 0.004) / span;
      hand.x = shoulder.x + (hand.x - shoulder.x) * ratio;
      hand.y = shoulder.y + (hand.y - shoulder.y) * ratio;
      hand.z = shoulder.z + (hand.z - shoulder.z) * ratio;
      span = upper + lower - 0.004;
    }
    if (span < 0.04) span = 0.04;
    const along = (upper * upper - lower * lower + span * span) / (2 * span);
    const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
    const dx = (hand.x - shoulder.x) / span;
    const dy = (hand.y - shoulder.y) / span;
    const dz = (hand.z - shoulder.z) / span;
    const poleX = side * (0.7 + build * 0.1);
    const poleY = -0.6;
    const poleZ = -0.25;
    const projection = poleX * dx + poleY * dy + poleZ * dz;
    const bx = poleX - projection * dx;
    const by = poleY - projection * dy;
    const bz = poleZ - projection * dz;
    const magnitude = Math.max(0.001, Math.hypot(bx, by, bz));
    elbow.x = shoulder.x + dx * along + bx / magnitude * bend;
    elbow.y = shoulder.y + dy * along + by / magnitude * bend;
    elbow.z = shoulder.z + dz * along + bz / magnitude * bend;
  }

  private clampLeg(hips: Point3, ankle: Point3, knee: Point3, side: number): void {
    const hip = this.forward;
    hip.x = hips.x + side * 0.1;
    hip.y = hips.y;
    hip.z = hips.z;
    const upper = 0.44;
    const lower = 0.43;
    const span = length(hip, ankle);
    if (span > upper + lower) {
      const ratio = (upper + lower) / span;
      ankle.x = hip.x + (ankle.x - hip.x) * ratio;
      ankle.y = Math.max(0.08, hip.y + (ankle.y - hip.y) * ratio);
      ankle.z = hip.z + (ankle.z - hip.z) * ratio;
    }
    if (hips.y > 0.8) {
      const adjustedSpan = Math.max(0.05, length(hip, ankle));
      const along = (upper * upper - lower * lower + adjustedSpan * adjustedSpan) / (2 * adjustedSpan);
      const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
      const ratio = along / adjustedSpan;
      knee.x = lerp(hip.x, ankle.x, ratio);
      knee.y = lerp(hip.y, ankle.y, ratio);
      knee.z = lerp(hip.z, ankle.z, ratio) + bend;
    }
  }

  private blend(actor: Actor, memory: PoseMemory, context: LifeContext): void {
    const target = memory.target;
    const pose = actor.pose;
    const amount = 1 - Math.exp(-context.time.dt * (actor.mode === "walking" ? 18 : 9));
    const keys: (keyof Pick<ActorPose, "hips" | "chest" | "head" | "leftShoulder" | "rightShoulder" | "leftElbow" | "rightElbow" | "leftHand" | "rightHand" | "leftKnee" | "rightKnee" | "leftAnkle" | "rightAnkle">)[] = ["hips", "chest", "head", "leftShoulder", "rightShoulder", "leftElbow", "rightElbow", "leftHand", "rightHand", "leftKnee", "rightKnee", "leftAnkle", "rightAnkle"];
    for (const key of keys) blendPoint(pose[key], target[key], amount);
    pose.headYaw = lerp(pose.headYaw, target.headYaw, amount);
    pose.headPitch = lerp(pose.headPitch, target.headPitch, amount);
    pose.chestYaw = lerp(pose.chestYaw, target.chestYaw, amount);
    pose.chestPitch = lerp(pose.chestPitch, target.chestPitch, amount);
    pose.leftFootPitch = lerp(pose.leftFootPitch, target.leftFootPitch, amount);
    pose.rightFootPitch = lerp(pose.rightFootPitch, target.rightFootPitch, amount);
    pose.leftFootPlanted = target.leftFootPlanted;
    pose.rightFootPlanted = target.rightFootPlanted;
    pose.breathing = target.breathing;
    actor.gesture.blend = Math.min(1, actor.gesture.blend + context.time.dt * 4);
  }

  private contact(actor: Actor, memory: PoseMemory, context: LifeContext): void {
    if (actor.task?.kind === "cycling" && ["ride", "return-bike"].includes(actor.task.phase)) return;
    const scale = actor.appearance.height / 1.76;
    const placeContact = (local: Point3, target: Point3) => {
      target.x = actor.position.x + (local.x * Math.cos(actor.heading) + local.z * Math.sin(actor.heading)) * scale;
      target.y = actor.groundY + 0.015;
      target.z = actor.position.z + (local.z * Math.cos(actor.heading) - local.x * Math.sin(actor.heading)) * scale;
    };
    placeContact(actor.pose.leftAnkle, memory.leftContact);
    placeContact(actor.pose.rightAnkle, memory.rightContact);
    const leftLanded = actor.pose.leftFootPlanted && !memory.lastLeftContact;
    const rightLanded = actor.pose.rightFootPlanted && !memory.lastRightContact;
    if ((leftLanded || rightLanded) && actor.speed > 0.2 && context.time.seconds - memory.lastFootstep > 0.13) {
      const strength = clamp(actor.mass / 75 * (0.4 + actor.speed * 0.25), 0.2, 1.4);
      this.footstep?.(leftLanded ? memory.leftContact : memory.rightContact, strength, context.time.seconds, actor.heading);
      memory.lastFootstep = context.time.seconds;
    }
    memory.lastLeftContact = actor.pose.leftFootPlanted;
    memory.lastRightContact = actor.pose.rightFootPlanted;
  }

  release(actorId: number): void {
    this.memories.delete(actorId);
  }
}
