import * as THREE from "three";
import { RigidBody, type BodyOptions } from "./body";
import { StaticCollisionWorld } from "./colliders";
import { ContactSolver } from "./solver";
import { ParticlePool } from "./particles";
import { ContinuousContactGuard } from "./continuous-contact";
import { clamp } from "./math";

export type WindSampler = (x: number, y: number, z: number, seconds: number, target: THREE.Vector3) => THREE.Vector3;
export type PhysicsStepListener = (dt: number, seconds: number) => void;

export class EarthPhysicsWorld {
  readonly bodies: RigidBody[] = [];
  readonly particles: ParticlePool;
  readonly solver: ContactSolver;
  readonly continuous: ContinuousContactGuard;
  private readonly preStep: PhysicsStepListener[] = [];
  private readonly postStep: PhysicsStepListener[] = [];
  private readonly wind = new THREE.Vector3();
  private readonly sheltered = new Float32Array(128);
  private shelterCursor = 0;
  private shelterTime = 0;
  private steps = 0;
  private energy = 0;

  constructor(readonly collisions: StaticCollisionWorld, readonly maximumBodies: number, maximumParticles: number) {
    this.particles = new ParticlePool(maximumParticles, collisions);
    this.solver = new ContactSolver(collisions, maximumBodies * 5);
    this.continuous = new ContinuousContactGuard(collisions);
  }

  createBody(options: BodyOptions): RigidBody {
    if (this.bodies.length >= this.maximumBodies) throw new Error("Earth physics active-body budget exceeded");
    const body = new RigidBody(options);
    this.bodies.push(body);
    return body;
  }

  beforeStep(listener: PhysicsStepListener): void {
    this.preStep.push(listener);
  }

  afterStep(listener: PhysicsStepListener): void {
    this.postStep.push(listener);
  }

  step(dt: number, seconds: number, sampleWind: WindSampler, wetness: number, airDensity: number): void {
    this.shelterTime += dt;
    for (const body of this.bodies) body.beginStep();
    for (const listener of this.preStep) listener(dt, seconds);
    if (this.shelterTime >= 0.1 && this.bodies.length > 0) {
      this.shelterTime = 0;
      for (let count = 0; count < Math.min(6, this.bodies.length); count++) {
        const index = this.shelterCursor % this.bodies.length;
        const body = this.bodies[index];
        sampleWind(body.position.x, body.position.y, body.position.z, seconds, this.wind);
        this.sheltered[index] = this.collisions.shelteredFromWind(body.position, this.wind, 12);
        this.shelterCursor++;
      }
    }
    this.energy = 0;
    for (let index = 0; index < this.bodies.length; index++) {
      const body = this.bodies[index];
      if (!body.enabled) continue;
      sampleWind(body.position.x, body.position.y, body.position.z, seconds, this.wind);
      body.wetness += (wetness - body.wetness) * clamp(dt * 0.25, 0, 1);
      body.addWind(this.wind, this.sheltered[index], airDensity);
      body.integrate(dt);
      this.continuous.constrain(body);
      if (body.position.y < -12 || Math.abs(body.position.x) > 500 || Math.abs(body.position.z) > 600) body.reset();
    }
    this.solver.solve(this.bodies, dt);
    for (const body of this.bodies) {
      body.endStep(dt);
      this.energy += body.kineticEnergy;
    }
    this.particles.step(dt, seconds, sampleWind, wetness);
    for (const listener of this.postStep) listener(dt, seconds);
    this.steps++;
  }

  reset(): void {
    for (const body of this.bodies) body.reset();
    this.particles.reset();
    this.solver.reset();
    this.sheltered.fill(0);
    this.shelterTime = 0;
    this.shelterCursor = 0;
    this.steps = 0;
    this.energy = 0;
  }

  snapshot(): { bodies: number; awake: number; particles: number; contacts: number; energy: number; steps: number } {
    return {
      bodies: this.bodies.length,
      awake: this.solver.statistics.awake,
      particles: this.particles.activeCount,
      contacts: this.solver.statistics.contacts,
      energy: this.energy,
      steps: this.steps,
    };
  }

  dispose(): void {
    this.bodies.length = 0;
    this.preStep.length = 0;
    this.postStep.length = 0;
    this.particles.reset();
    this.solver.reset();
  }
}
