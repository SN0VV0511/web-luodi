import * as THREE from "three";
import { RigidBody } from "./body";
import type { ContactMaterial } from "./materials";
import { combineContactMaterials } from "./materials";
import { applyAngularImpulse, applyPointImpulse, inverseInertiaWorld, pointImpulseDenominator, pointVelocity, positionImpulse, tangentBasis } from "./angular-dynamics";
import { clamp } from "./math";

export type ContactConstraintInput = {
  body: RigidBody;
  other?: RigidBody;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  penetration: number;
  surface: ContactMaterial;
  wetness: number;
  collider: number;
  feature: number;
};

type Constraint = {
  body: RigidBody | undefined;
  other: RigidBody | undefined;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  tangentA: THREE.Vector3;
  tangentB: THREE.Vector3;
  anchorA: THREE.Vector3;
  anchorB: THREE.Vector3;
  normalMass: number;
  tangentMassA: number;
  tangentMassB: number;
  angularMass: number;
  normalImpulse: number;
  frictionImpulseA: number;
  frictionImpulseB: number;
  spinImpulse: number;
  bias: number;
  restitution: number;
  penetration: number;
  staticFriction: number;
  dynamicFriction: number;
  rollingResistance: number;
  initialNormalSpeed: number;
  key: string;
  persistent: boolean;
};

type CachedImpulse = {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  tangentImpulse: THREE.Vector3;
  normalImpulse: number;
  spinImpulse: number;
  frame: number;
  dt: number;
};

export type ConstraintStatistics = {
  constraints: number;
  persistent: number;
  normalImpulse: number;
  frictionWork: number;
  maximumPenetration: number;
  iterations: number;
};

export class ContactConstraintSystem {
  readonly statistics: ConstraintStatistics = {
    constraints: 0,
    persistent: 0,
    normalImpulse: 0,
    frictionWork: 0,
    maximumPenetration: 0,
    iterations: 0,
  };
  private readonly constraints: Constraint[];
  private readonly cache = new Map<string, CachedImpulse>();
  private readonly velocityA = new THREE.Vector3();
  private readonly velocityB = new THREE.Vector3();
  private readonly relative = new THREE.Vector3();
  private readonly impulse = new THREE.Vector3();
  private readonly opposite = new THREE.Vector3();
  private readonly angular = new THREE.Vector3();
  private readonly pointA = new THREE.Vector3();
  private readonly pointB = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly inverse = new THREE.Quaternion();
  private count = 0;
  private frame = 0;
  private dt = 1 / 60;

  constructor(readonly capacity: number) {
    this.constraints = Array.from({ length: Math.max(1, capacity) }, () => ({
      body: undefined,
      other: undefined,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      tangentA: new THREE.Vector3(),
      tangentB: new THREE.Vector3(),
      anchorA: new THREE.Vector3(),
      anchorB: new THREE.Vector3(),
      normalMass: 0,
      tangentMassA: 0,
      tangentMassB: 0,
      angularMass: 0,
      normalImpulse: 0,
      frictionImpulseA: 0,
      frictionImpulseB: 0,
      spinImpulse: 0,
      bias: 0,
      restitution: 0,
      penetration: 0,
      staticFriction: 0,
      dynamicFriction: 0,
      rollingResistance: 0,
      initialNormalSpeed: 0,
      key: "",
      persistent: false,
    }));
  }

  begin(dt: number): void {
    this.dt = clamp(dt, 1 / 240, 1 / 15);
    this.count = 0;
    this.frame++;
    this.statistics.constraints = 0;
    this.statistics.persistent = 0;
    this.statistics.normalImpulse = 0;
    this.statistics.frictionWork = 0;
    this.statistics.maximumPenetration = 0;
    this.statistics.iterations = 0;
  }

  add(input: ContactConstraintInput): boolean {
    if (this.count >= this.capacity || !input.body.enabled) return false;
    if (!Number.isFinite(input.penetration) || input.normal.lengthSq() < 0.5) return false;
    const constraint = this.constraints[this.count++];
    constraint.body = input.body;
    constraint.other = input.other;
    constraint.point.copy(input.point);
    constraint.normal.copy(input.normal).normalize();
    constraint.penetration = Math.max(0, input.penetration);
    constraint.key = `${input.body.id}:${input.other ? `b${input.other.id}` : `s${input.collider}`}:${input.feature}`;
    const material = combineContactMaterials(input.body.material, input.surface, input.wetness);
    constraint.staticFriction = material.staticFriction;
    constraint.dynamicFriction = material.dynamicFriction;
    constraint.rollingResistance = material.rollingResistance;
    tangentBasis(constraint.normal, constraint.tangentA, constraint.tangentB);
    constraint.normalMass = this.effectiveMass(constraint, constraint.normal);
    constraint.tangentMassA = this.effectiveMass(constraint, constraint.tangentA);
    constraint.tangentMassB = this.effectiveMass(constraint, constraint.tangentB);
    inverseInertiaWorld(input.body, constraint.normal, this.angular);
    let angularDenominator = constraint.normal.dot(this.angular);
    if (input.other) {
      inverseInertiaWorld(input.other, constraint.normal, this.angular);
      angularDenominator += constraint.normal.dot(this.angular);
    }
    constraint.angularMass = angularDenominator > 1e-12 ? 1 / angularDenominator : 0;
    this.relativeVelocity(constraint, this.relative);
    constraint.initialNormalSpeed = this.relative.dot(constraint.normal);
    constraint.restitution = constraint.initialNormalSpeed < -0.65 ? -material.restitution * constraint.initialNormalSpeed : 0;
    constraint.bias = Math.min(1.5, Math.max(0, constraint.penetration - 0.0015) * 0.12 / this.dt);
    this.inverse.copy(input.body.rotation).conjugate();
    constraint.anchorA.copy(input.point).sub(input.body.position).applyQuaternion(this.inverse);
    if (input.other) {
      this.inverse.copy(input.other.rotation).conjugate();
      constraint.anchorB.copy(input.point).sub(input.other.position).applyQuaternion(this.inverse);
    } else constraint.anchorB.copy(input.point);
    const cached = this.cache.get(constraint.key);
    const valid = cached && this.frame - cached.frame <= 2 && cached.normal.dot(constraint.normal) > 0.94 && cached.point.distanceToSquared(constraint.point) < 0.04;
    constraint.persistent = !!valid;
    if (valid && cached) {
      const timeRatio = clamp(this.dt / cached.dt, 0.5, 2);
      constraint.normalImpulse = cached.normalImpulse * timeRatio * 0.82;
      constraint.frictionImpulseA = cached.tangentImpulse.dot(constraint.tangentA) * timeRatio * 0.82;
      constraint.frictionImpulseB = cached.tangentImpulse.dot(constraint.tangentB) * timeRatio * 0.82;
      constraint.spinImpulse = cached.spinImpulse * timeRatio * 0.82;
      this.statistics.persistent++;
    } else {
      constraint.normalImpulse = 0;
      constraint.frictionImpulseA = 0;
      constraint.frictionImpulseB = 0;
      constraint.spinImpulse = 0;
    }
    this.statistics.maximumPenetration = Math.max(this.statistics.maximumPenetration, constraint.penetration);
    if (constraint.normal.y > 0.55) input.body.supported = true;
    if (input.other && constraint.normal.y < -0.55) input.other.supported = true;
    return true;
  }

  solve(iterations = 8): void {
    if (this.count === 0) {
      this.prune();
      return;
    }
    this.warmStart();
    const maximumIterations = clamp(Math.round(iterations), 2, 16);
    for (let iteration = 0; iteration < maximumIterations; iteration++) {
      let maximumChange = 0;
      const reversed = iteration % 2 !== 0;
      for (let offset = 0; offset < this.count; offset++) {
        const index = reversed ? this.count - 1 - offset : offset;
        const constraint = this.constraints[index];
        maximumChange = Math.max(maximumChange, this.solveNormal(constraint));
        this.solveFriction(constraint);
        this.solveSpin(constraint);
      }
      this.statistics.iterations = iteration + 1;
      if (iteration >= 3 && maximumChange < 0.00001) break;
    }
    for (let iteration = 0; iteration < 3; iteration++) {
      for (let index = 0; index < this.count; index++) this.solvePosition(this.constraints[index]);
    }
    this.storeCache();
    this.statistics.constraints = this.count;
    this.prune();
  }

  reset(): void {
    this.cache.clear();
    this.count = 0;
    this.frame = 0;
    this.begin(1 / 60);
  }

  private effectiveMass(constraint: Constraint, axis: THREE.Vector3): number {
    const body = constraint.body;
    if (!body) return 0;
    let denominator = pointImpulseDenominator(body, constraint.point, axis);
    if (constraint.other) denominator += pointImpulseDenominator(constraint.other, constraint.point, axis);
    return denominator > 1e-12 ? 1 / denominator : 0;
  }

  private relativeVelocity(constraint: Constraint, target: THREE.Vector3): THREE.Vector3 {
    if (!constraint.body) return target.set(0, 0, 0);
    pointVelocity(constraint.body, constraint.point, this.velocityA);
    if (constraint.other) pointVelocity(constraint.other, constraint.point, this.velocityB);
    else this.velocityB.set(0, 0, 0);
    return target.copy(this.velocityA).sub(this.velocityB);
  }

  private apply(constraint: Constraint, impulse: THREE.Vector3): void {
    if (!constraint.body) return;
    applyPointImpulse(constraint.body, impulse, constraint.point);
    if (constraint.other) {
      this.opposite.copy(impulse).negate();
      applyPointImpulse(constraint.other, this.opposite, constraint.point);
    }
  }

  private warmStart(): void {
    for (let index = 0; index < this.count; index++) {
      const constraint = this.constraints[index];
      if (!constraint.persistent) continue;
      this.impulse.copy(constraint.normal).multiplyScalar(constraint.normalImpulse)
        .addScaledVector(constraint.tangentA, constraint.frictionImpulseA)
        .addScaledVector(constraint.tangentB, constraint.frictionImpulseB);
      this.apply(constraint, this.impulse);
      if (constraint.body && constraint.spinImpulse !== 0) {
        this.impulse.copy(constraint.normal).multiplyScalar(constraint.spinImpulse);
        applyAngularImpulse(constraint.body, this.impulse);
        if (constraint.other) applyAngularImpulse(constraint.other, this.impulse.negate());
      }
    }
  }

  private solveNormal(constraint: Constraint): number {
    this.relativeVelocity(constraint, this.relative);
    const velocity = this.relative.dot(constraint.normal);
    const target = constraint.restitution + constraint.bias;
    const change = (target - velocity) * constraint.normalMass;
    const old = constraint.normalImpulse;
    constraint.normalImpulse = Math.max(0, old + change);
    const applied = constraint.normalImpulse - old;
    this.impulse.copy(constraint.normal).multiplyScalar(applied);
    this.apply(constraint, this.impulse);
    return Math.abs(applied);
  }

  private solveFriction(constraint: Constraint): void {
    this.relativeVelocity(constraint, this.relative);
    const speedA = this.relative.dot(constraint.tangentA);
    const speedB = this.relative.dot(constraint.tangentB);
    const oldA = constraint.frictionImpulseA;
    const oldB = constraint.frictionImpulseB;
    let nextA = oldA - speedA * constraint.tangentMassA;
    let nextB = oldB - speedB * constraint.tangentMassB;
    const magnitude = Math.hypot(nextA, nextB);
    const staticLimit = constraint.staticFriction * constraint.normalImpulse;
    if (magnitude > staticLimit) {
      const dynamicLimit = constraint.dynamicFriction * constraint.normalImpulse;
      const scale = magnitude > 0 ? Math.min(1, dynamicLimit / magnitude) : 0;
      nextA *= scale;
      nextB *= scale;
    }
    constraint.frictionImpulseA = nextA;
    constraint.frictionImpulseB = nextB;
    this.impulse.copy(constraint.tangentA).multiplyScalar(nextA - oldA)
      .addScaledVector(constraint.tangentB, nextB - oldB);
    this.statistics.frictionWork += Math.max(0, -this.impulse.dot(this.relative));
    this.apply(constraint, this.impulse);
  }

  private solveSpin(constraint: Constraint): void {
    const body = constraint.body;
    if (!body) return;
    const relativeSpin = body.angularVelocity.dot(constraint.normal) - (constraint.other?.angularVelocity.dot(constraint.normal) ?? 0);
    const radius = Math.max(0.005, Math.min(body.boundingRadius, constraint.other?.boundingRadius ?? body.boundingRadius));
    const limit = constraint.rollingResistance * constraint.normalImpulse * radius;
    const old = constraint.spinImpulse;
    constraint.spinImpulse = clamp(old - relativeSpin * constraint.angularMass, -limit, limit);
    const applied = constraint.spinImpulse - old;
    this.impulse.copy(constraint.normal).multiplyScalar(applied);
    applyAngularImpulse(body, this.impulse);
    if (constraint.other) applyAngularImpulse(constraint.other, this.impulse.negate());
  }

  private solvePosition(constraint: Constraint): void {
    const body = constraint.body;
    if (!body) return;
    this.pointA.copy(constraint.anchorA).applyQuaternion(body.rotation).add(body.position);
    if (constraint.other) this.pointB.copy(constraint.anchorB).applyQuaternion(constraint.other.rotation).add(constraint.other.position);
    else this.pointB.copy(constraint.anchorB);
    const separation = this.delta.copy(this.pointA).sub(this.pointB).dot(constraint.normal);
    const remaining = Math.max(0, constraint.penetration - separation - 0.001);
    if (remaining <= 0) return;
    const magnitude = Math.min(0.03, remaining * 0.18) * constraint.normalMass;
    this.impulse.copy(constraint.normal).multiplyScalar(magnitude);
    positionImpulse(body, constraint.point, this.impulse, 0.025);
    if (constraint.other) positionImpulse(constraint.other, constraint.point, this.impulse.negate(), 0.025);
  }

  private storeCache(): void {
    for (let index = 0; index < this.count; index++) {
      const constraint = this.constraints[index];
      let cached = this.cache.get(constraint.key);
      if (!cached) {
        cached = {
          point: new THREE.Vector3(),
          normal: new THREE.Vector3(),
          tangentImpulse: new THREE.Vector3(),
          normalImpulse: 0,
          spinImpulse: 0,
          frame: 0,
          dt: this.dt,
        };
        this.cache.set(constraint.key, cached);
      }
      cached.point.copy(constraint.point);
      cached.normal.copy(constraint.normal);
      cached.tangentImpulse.copy(constraint.tangentA).multiplyScalar(constraint.frictionImpulseA)
        .addScaledVector(constraint.tangentB, constraint.frictionImpulseB);
      cached.normalImpulse = constraint.normalImpulse;
      cached.spinImpulse = constraint.spinImpulse;
      cached.frame = this.frame;
      cached.dt = this.dt;
      this.statistics.normalImpulse += constraint.normalImpulse;
      if (constraint.body && constraint.initialNormalSpeed < -0.25) constraint.body.wake();
      if (constraint.other && constraint.initialNormalSpeed < -0.25) constraint.other.wake();
    }
  }

  private prune(): void {
    if (this.frame % 30 !== 0 && this.cache.size <= this.capacity * 2) return;
    for (const [key, cached] of this.cache) {
      if (this.frame - cached.frame > 3) this.cache.delete(key);
    }
  }
}
