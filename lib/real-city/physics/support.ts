import * as THREE from "three";
import { createRayHit, StaticCollisionWorld } from "./colliders";
import { clamp, criticallyDampedStep, GRAVITY, smoothstep } from "./math";

export type FootSupport = { position: THREE.Vector3; normal: THREE.Vector3; planted: boolean; compression: number; wet: boolean };

export class FootContactTracker {
  readonly left: FootSupport = { position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), planted: false, compression: 0, wet: false };
  readonly right: FootSupport = { position: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), planted: false, compression: 0, wet: false };
  private readonly hit = createRayHit();
  private readonly initialLeft = new THREE.Vector3();
  private readonly initialRight = new THREE.Vector3();
  private pelvis = 0;
  private pelvisVelocity = 0;
  private wasLeft = false;
  private wasRight = false;
  onStep?: (point: THREE.Vector3, normal: THREE.Vector3, strength: number) => void;

  constructor(readonly collisions: StaticCollisionWorld) {}

  update(root: THREE.Vector3, heading: number, gaitPhase: number, stride: number, dt: number): number {
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    const phase = gaitPhase % (Math.PI * 2);
    this.solveFoot(this.left, this.initialLeft, root, sin, cos, phase, stride, -1);
    this.solveFoot(this.right, this.initialRight, root, sin, cos, phase + Math.PI, stride, 1);
    const supportedHeight = Math.min(this.left.position.y, this.right.position.y);
    const compression = Math.max(this.left.compression, this.right.compression);
    const target = supportedHeight - root.y - compression * 0.025;
    const next = criticallyDampedStep(this.pelvis, this.pelvisVelocity, target, 6, dt);
    this.pelvis = clamp(next.position, -0.22, 0.3);
    this.pelvisVelocity = next.velocity;
    if (this.left.planted && !this.wasLeft) this.onStep?.(this.left.position, this.left.normal, stride);
    if (this.right.planted && !this.wasRight) this.onStep?.(this.right.position, this.right.normal, stride);
    this.wasLeft = this.left.planted;
    this.wasRight = this.right.planted;
    return this.pelvis;
  }

  private solveFoot(foot: FootSupport, initial: THREE.Vector3, root: THREE.Vector3, sin: number, cos: number, phase: number, stride: number, side: number): void {
    const forward = Math.sin(phase) * stride * 0.5;
    const lateral = side * 0.105;
    const lift = Math.max(0, Math.cos(phase)) * 0.11 * Math.min(1, stride / 0.6);
    const x = root.x + sin * forward + cos * lateral;
    const z = root.z + cos * forward - sin * lateral;
    this.collisions.raycastDown(x, root.y + 0.55, z, 1.05, this.hit);
    const ground = this.hit.hit ? this.hit.point.y : root.y;
    const planted = lift < 0.012;
    if (planted && !foot.planted) initial.set(x, ground, z);
    if (planted) {
      const separation = Math.hypot(initial.x - x, initial.z - z);
      if (separation > 0.4) initial.set(x, ground, z);
      foot.position.copy(initial);
    } else foot.position.set(x, ground + lift, z);
    foot.normal.copy(this.hit.normal);
    foot.planted = planted;
    foot.compression = planted ? 1 - smoothstep(0, 0.012, lift) : 0;
    foot.wet = this.hit.material.wetFrictionMultiplier < 0.7;
  }
}

export type SuspensionWheel = {
  local: THREE.Vector3;
  radius: number;
  restLength: number;
  compression: number;
  velocity: number;
  supported: boolean;
  ground: THREE.Vector3;
};

export class VehicleSuspension {
  readonly wheels: SuspensionWheel[];
  private readonly hit = createRayHit();
  private readonly worldPoint = new THREE.Vector3();
  private pitch = 0;
  private pitchVelocity = 0;
  private roll = 0;
  private rollVelocity = 0;
  private heave = 0;
  private heaveVelocity = 0;

  constructor(readonly collisions: StaticCollisionWorld, wheelLocations: readonly { x: number; z: number }[], radius: number) {
    this.wheels = wheelLocations.map(point => ({
      local: new THREE.Vector3(point.x, 0, point.z),
      radius,
      restLength: 0.22,
      compression: 0,
      velocity: 0,
      supported: false,
      ground: new THREE.Vector3(),
    }));
  }

  update(position: THREE.Vector3, heading: number, acceleration: number, lateralAcceleration: number, dt: number): { pitch: number; roll: number; heave: number } {
    const sin = Math.sin(heading);
    const cos = Math.cos(heading);
    let front = 0;
    let rear = 0;
    let left = 0;
    let right = 0;
    let supported = 0;
    for (const wheel of this.wheels) {
      this.worldPoint.set(
        position.x + cos * wheel.local.x + sin * wheel.local.z,
        position.y + wheel.radius + wheel.restLength,
        position.z - sin * wheel.local.x + cos * wheel.local.z,
      );
      this.collisions.raycastDown(this.worldPoint.x, this.worldPoint.y, this.worldPoint.z, wheel.radius + wheel.restLength + 0.35, this.hit);
      wheel.supported = this.hit.hit;
      const target = wheel.supported ? clamp(wheel.radius + wheel.restLength - this.hit.distance, -0.18, 0.16) : -0.18;
      const next = criticallyDampedStep(wheel.compression, wheel.velocity, target, 5.4, dt);
      wheel.compression = next.position;
      wheel.velocity = next.velocity;
      wheel.ground.copy(this.hit.point);
      if (wheel.supported) supported++;
      if (wheel.local.z > 0) front += wheel.compression;
      else rear += wheel.compression;
      if (wheel.local.x < 0) left += wheel.compression;
      else right += wheel.compression;
    }
    const count = Math.max(1, this.wheels.length / 2);
    const pitchTarget = clamp((rear - front) / count * 0.23 + acceleration / GRAVITY * 0.032, -0.065, 0.065);
    const rollTarget = clamp((right - left) / count * 0.32 - lateralAcceleration / GRAVITY * 0.046, -0.075, 0.075);
    const heaveTarget = supported ? (front + rear) / this.wheels.length : -0.12;
    const pitch = criticallyDampedStep(this.pitch, this.pitchVelocity, pitchTarget, 2.6, dt);
    const roll = criticallyDampedStep(this.roll, this.rollVelocity, rollTarget, 2.8, dt);
    const heave = criticallyDampedStep(this.heave, this.heaveVelocity, heaveTarget, 3.2, dt);
    this.pitch = pitch.position;
    this.pitchVelocity = pitch.velocity;
    this.roll = roll.position;
    this.rollVelocity = roll.velocity;
    this.heave = heave.position;
    this.heaveVelocity = heave.velocity;
    return { pitch: this.pitch, roll: this.roll, heave: this.heave };
  }
}
