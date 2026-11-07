import * as THREE from "three";
import { createContact, createGroundSample, StaticCollisionWorld } from "./colliders";
import { clamp, GRAVITY } from "./math";
import { contactMaterial, type ContactMaterialName } from "./materials";

export type ParticleOptions = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  radius: number;
  mass: number;
  lifetime: number;
  drag: number;
  material: ContactMaterialName;
  buoyancy?: number;
};
export type Particle = {
  position: THREE.Vector3;
  previous: THREE.Vector3;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  radius: number;
  mass: number;
  drag: number;
  lifetime: number;
  age: number;
  active: boolean;
  grounded: boolean;
  material: ContactMaterialName;
  buoyancy: number;
  wetness: number;
  collisionCount: number;
};
export type ParticleImpact = { position: THREE.Vector3; speed: number; material: ContactMaterialName; radius: number };

export class ParticlePool {
  readonly particles: Particle[];
  private cursor = 0;
  private readonly contact = createContact();
  private readonly ground = createGroundSample();
  private readonly wind = new THREE.Vector3();
  private readonly relative = new THREE.Vector3();
  private readonly impact: ParticleImpact = { position: new THREE.Vector3(), speed: 0, material: "soil", radius: 0 };
  private readonly physicalMaterials = new Map<ContactMaterialName, ReturnType<typeof contactMaterial>>();
  onImpact?: (impact: ParticleImpact) => void;

  constructor(readonly capacity: number, readonly collisions: StaticCollisionWorld) {
    this.particles = Array.from({ length: Math.max(1, capacity) }, () => ({
      position: new THREE.Vector3(),
      previous: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      spin: new THREE.Vector3(),
      radius: 0.02,
      mass: 0.001,
      drag: 1,
      lifetime: 1,
      age: 0,
      active: false,
      grounded: false,
      material: "leaf" as ContactMaterialName,
      buoyancy: 0,
      wetness: 0,
      collisionCount: 0,
    }));
  }

  emit(options: ParticleOptions): Particle {
    let particle = this.particles[this.cursor];
    for (let offset = 0; offset < this.particles.length; offset++) {
      const index = (this.cursor + offset) % this.particles.length;
      if (!this.particles[index].active) {
        particle = this.particles[index];
        this.cursor = (index + 1) % this.particles.length;
        break;
      }
    }
    if (particle.active) this.cursor = (this.cursor + 1) % this.particles.length;
    particle.position.copy(options.position);
    particle.previous.copy(options.position);
    particle.velocity.copy(options.velocity);
    particle.spin.set(0, 0, 0);
    particle.radius = Math.max(0.002, options.radius);
    particle.mass = Math.max(0.00001, options.mass);
    particle.drag = Math.max(0, options.drag);
    particle.lifetime = Math.max(0.05, options.lifetime);
    particle.material = options.material;
    particle.age = 0;
    particle.active = true;
    particle.grounded = false;
    particle.buoyancy = options.buoyancy ?? 0;
    particle.wetness = 0;
    particle.collisionCount = 0;
    return particle;
  }

  step(dt: number, seconds: number, sampleWind: (x: number, y: number, z: number, seconds: number, target: THREE.Vector3) => THREE.Vector3, wetness: number): void {
    for (const particle of this.particles) {
      if (!particle.active) continue;
      particle.previous.copy(particle.position);
      particle.age += dt;
      if (particle.age >= particle.lifetime) {
        particle.active = false;
        continue;
      }
      sampleWind(particle.position.x, particle.position.y, particle.position.z, seconds, this.wind);
      particle.wetness += (wetness - particle.wetness) * Math.min(1, dt * 0.35);
      const effectiveMass = particle.mass * (1 + particle.wetness * 1.8);
      const surface = this.material(particle.material);
      const liftThreshold = effectiveMass * GRAVITY * surface.staticFriction;
      this.relative.copy(this.wind).sub(particle.velocity);
      const speed = this.relative.length();
      const area = Math.PI * particle.radius * particle.radius;
      const dragForce = 0.6125 * particle.drag * area * speed;
      const windForce = dragForce * speed;
      if (particle.grounded && windForce < liftThreshold) {
        particle.velocity.multiplyScalar(Math.exp(-8 * dt));
        if (particle.velocity.lengthSq() < 0.0001) particle.velocity.set(0, 0, 0);
        continue;
      }
      if (particle.grounded) particle.velocity.y = Math.min(0.35, windForce / effectiveMass * 0.01);
      const dragAcceleration = Math.min(12, dragForce / effectiveMass);
      particle.velocity.addScaledVector(this.relative, dragAcceleration * dt);
      particle.velocity.y -= GRAVITY * (1 - particle.buoyancy) * dt;
      if (particle.material === "leaf" || particle.material === "paper") {
        const flutter = Math.sin(seconds * 7.1 + particle.age * 4.3 + particle.radius * 100);
        particle.velocity.x += flutter * 0.34 * dt;
        particle.velocity.z += Math.cos(seconds * 5.8 + particle.age * 3.1) * 0.22 * dt;
        particle.spin.x += flutter * dt * 1.5;
        particle.spin.z += Math.cos(particle.age * 4.6) * dt;
      }
      particle.velocity.clampLength(0, 22);
      particle.position.addScaledVector(particle.velocity, dt);
      particle.grounded = false;
      if (this.collisions.sphereGround(particle.position, particle.radius, this.contact)) this.resolve(particle);
      const candidates = this.collisions.query(
        particle.position.x - particle.radius,
        particle.position.x + particle.radius,
        particle.position.z - particle.radius,
        particle.position.z + particle.radius,
      );
      for (const collider of candidates) {
        if (this.collisions.sphereBox(particle.position, particle.radius, collider, this.contact)) this.resolve(particle);
      }
      if (particle.position.y < -5 || Math.abs(particle.position.x) > 350 || particle.position.z > 400 || particle.position.z < -300) particle.active = false;
    }
  }

  reset(): void {
    this.cursor = 0;
    for (const particle of this.particles) {
      particle.active = false;
      particle.age = 0;
      particle.velocity.set(0, 0, 0);
    }
  }

  get activeCount(): number {
    let count = 0;
    for (const particle of this.particles) if (particle.active) count++;
    return count;
  }

  private resolve(particle: Particle): void {
    const incoming = particle.velocity.dot(this.contact.normal);
    particle.position.addScaledVector(this.contact.normal, Math.max(0, this.contact.penetration));
    if (incoming < 0) {
      const surface = this.material(particle.material);
      const restitution = Math.min(surface.restitution, this.contact.material.restitution);
      particle.velocity.addScaledVector(this.contact.normal, -(1 + restitution) * incoming);
      const tangentFactor = clamp(1 - this.contact.material.dynamicFriction * 0.3, 0, 1);
      particle.velocity.x *= tangentFactor;
      particle.velocity.z *= tangentFactor;
      if (this.contact.normal.y > 0.65 && Math.abs(particle.velocity.y) < 0.08) {
        particle.velocity.y = 0;
        particle.grounded = true;
      }
      particle.collisionCount++;
      if (incoming < -0.2 && particle.collisionCount <= 4 && this.onImpact) {
        this.impact.position.copy(this.contact.point);
        this.impact.speed = -incoming;
        this.impact.material = particle.material;
        this.impact.radius = particle.radius;
        this.onImpact(this.impact);
      }
    }
    this.collisions.sampleGround(particle.position.x, particle.position.z, this.ground);
    particle.wetness = Math.max(particle.wetness, this.ground.wetness * 0.6);
  }

  private material(name: ContactMaterialName): ReturnType<typeof contactMaterial> {
    let value = this.physicalMaterials.get(name);
    if (!value) {
      value = contactMaterial(name);
      this.physicalMaterials.set(name, value);
    }
    return value;
  }
}
