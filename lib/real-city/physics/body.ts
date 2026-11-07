import * as THREE from "three";
import { angularDragTorque, applyPointImpulse, integrateAngularMomentum, rotationalEnergy } from "./angular-dynamics";
import { AIR_DENSITY, clamp, finiteVector, GRAVITY, orientedHalfExtents } from "./math";
import { contactMaterial, type ContactMaterial, type ContactMaterialName } from "./materials";

export type BodyShape = { kind: "sphere"; radius: number } | { kind: "box"; halfExtents: THREE.Vector3 };
export type BodyOptions = {
  shape: BodyShape;
  position: THREE.Vector3;
  mass: number;
  material: ContactMaterialName;
  dragCoefficient?: number;
  angularDamping?: number;
  gravityScale?: number;
  sleeping?: boolean;
  groundCollision?: boolean;
};

let nextBodyId = 0;
const deltaRotation = new THREE.Quaternion();
const torqueArm = new THREE.Vector3();
const angularImpulse = new THREE.Vector3();
const rotationMatrix = new THREE.Matrix4();
const relativeWind = new THREE.Vector3();
const interpolated = new THREE.Vector3();

export class RigidBody {
  readonly id = nextBodyId++;
  readonly shape: BodyShape;
  readonly position: THREE.Vector3;
  readonly previousPosition: THREE.Vector3;
  readonly initialPosition: THREE.Vector3;
  readonly rotation = new THREE.Quaternion();
  readonly previousRotation = new THREE.Quaternion();
  readonly velocity = new THREE.Vector3();
  readonly angularVelocity = new THREE.Vector3();
  readonly force = new THREE.Vector3();
  readonly torque = new THREE.Vector3();
  readonly halfExtents = new THREE.Vector3();
  readonly inverseInertia = new THREE.Vector3();
  readonly material: ContactMaterial;
  readonly mass: number;
  readonly inverseMass: number;
  readonly dragCoefficient: number;
  readonly angularDamping: number;
  readonly gravityScale: number;
  readonly area: number;
  readonly groundCollision: boolean;
  readonly volume: number;
  enabled = true;
  sleeping = false;
  supported = false;
  wetness = 0;
  sleepSeconds = 0;
  age = 0;

  constructor(options: BodyOptions) {
    this.shape = options.shape.kind === "sphere"
      ? { kind: "sphere", radius: Math.max(0.005, options.shape.radius) }
      : { kind: "box", halfExtents: options.shape.halfExtents.clone() };
    this.position = options.position.clone();
    this.previousPosition = options.position.clone();
    this.initialPosition = options.position.clone();
    this.mass = Math.max(0.0001, options.mass);
    this.inverseMass = 1 / this.mass;
    this.material = contactMaterial(options.material);
    this.dragCoefficient = Math.max(0, options.dragCoefficient ?? 0.47);
    this.angularDamping = Math.max(0, options.angularDamping ?? 0.08);
    this.gravityScale = options.gravityScale ?? 1;
    this.sleeping = options.sleeping ?? false;
    this.groundCollision = options.groundCollision ?? true;
    if (this.shape.kind === "sphere") {
      const r = this.shape.radius;
      this.halfExtents.setScalar(r);
      const inertia = Math.max(1e-8, 0.4 * this.mass * r * r);
      this.inverseInertia.setScalar(1 / inertia);
      this.area = Math.PI * r * r;
      this.volume = 4 / 3 * Math.PI * r * r * r;
    } else {
      const size = this.shape.halfExtents;
      this.halfExtents.copy(size);
      this.inverseInertia.set(
        3 / (this.mass * Math.max(1e-8, size.y * size.y + size.z * size.z)),
        3 / (this.mass * Math.max(1e-8, size.x * size.x + size.z * size.z)),
        3 / (this.mass * Math.max(1e-8, size.x * size.x + size.y * size.y)),
      );
      this.area = 4 * Math.max(size.x * size.y, size.x * size.z, size.y * size.z);
      this.volume = 8 * size.x * size.y * size.z;
    }
  }

  get boundingRadius(): number {
    return this.shape.kind === "sphere" ? this.shape.radius : this.shape.halfExtents.length();
  }

  get kineticEnergy(): number {
    const linear = 0.5 * this.mass * this.velocity.lengthSq();
    const angular = rotationalEnergy(this);
    return linear + angular;
  }

  wake(): void {
    this.sleeping = false;
    this.sleepSeconds = 0;
  }

  applyForce(force: THREE.Vector3): void {
    if (!this.enabled) return;
    this.force.add(force);
    if (force.lengthSq() > this.mass * this.mass * 0.02) this.wake();
  }

  applyForceAt(force: THREE.Vector3, point: THREE.Vector3): void {
    this.applyForce(force);
    torqueArm.copy(point).sub(this.position);
    this.torque.add(angularImpulse.crossVectors(torqueArm, force));
  }

  applyImpulse(impulse: THREE.Vector3, point?: THREE.Vector3): void {
    if (!this.enabled) return;
    if (point) applyPointImpulse(this, impulse, point);
    else this.velocity.addScaledVector(impulse, this.inverseMass);
    this.wake();
  }

  addWind(wind: THREE.Vector3, shelter: number, density = AIR_DENSITY): void {
    if (!this.enabled) return;
    relativeWind.copy(wind).sub(this.velocity);
    const speed = relativeWind.length();
    if (speed < 0.001) return;
    const shelterFactor = 1 - clamp(shelter, 0, 0.95);
    const drag = 0.5 * density * this.dragCoefficient * this.area * speed * shelterFactor;
    relativeWind.multiplyScalar(drag);
    this.force.add(relativeWind);
    angularDragTorque(this, density, angularImpulse);
    this.torque.add(angularImpulse);
    if (relativeWind.length() > this.mass * GRAVITY * this.material.staticFriction) this.wake();
  }

  beginStep(): void {
    this.previousPosition.copy(this.position);
    this.previousRotation.copy(this.rotation);
    this.supported = false;
  }

  integrate(dt: number): void {
    if (!this.enabled || this.sleeping) {
      this.clearForces();
      return;
    }
    this.age += dt;
    this.velocity.addScaledVector(this.force, this.inverseMass * dt);
    this.velocity.y -= GRAVITY * this.gravityScale * dt;
    const maximumSpeed = 35;
    if (this.velocity.lengthSq() > maximumSpeed * maximumSpeed) this.velocity.setLength(maximumSpeed);
    this.position.addScaledVector(this.velocity, dt);
    integrateAngularMomentum(this, dt);
    this.angularVelocity.multiplyScalar(Math.exp(-this.angularDamping * dt));
    this.angularVelocity.clampLength(0, 24);
    const angularSpeed = this.angularVelocity.length();
    if (angularSpeed > 0.00001) {
      torqueArm.copy(this.angularVelocity).multiplyScalar(1 / angularSpeed);
      deltaRotation.setFromAxisAngle(torqueArm, Math.min(angularSpeed, 24) * dt);
      this.rotation.premultiply(deltaRotation).normalize();
    }
    this.updateExtents();
    this.clearForces();
    if (!finiteVector(this.position) || !finiteVector(this.velocity)) this.reset();
  }

  endStep(dt: number): void {
    if (!this.enabled || this.sleeping) return;
    if (this.supported && this.velocity.lengthSq() < 0.0025 && this.angularVelocity.lengthSq() < 0.0064) {
      this.sleepSeconds += dt;
      if (this.sleepSeconds > 0.8) {
        this.sleeping = true;
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
      }
    } else this.sleepSeconds = 0;
  }

  reset(position = this.initialPosition): void {
    this.position.copy(position);
    this.previousPosition.copy(position);
    this.rotation.identity();
    this.previousRotation.identity();
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);
    this.age = 0;
    this.wetness = 0;
    this.supported = false;
    this.wake();
    this.updateExtents();
  }

  interpolatedPosition(alpha: number, target: THREE.Vector3): THREE.Vector3 {
    return target.lerpVectors(this.previousPosition, this.position, clamp(alpha, 0, 1));
  }

  renderTo(object: THREE.Object3D, alpha: number): void {
    object.position.copy(this.interpolatedPosition(alpha, interpolated));
    object.quaternion.slerpQuaternions(this.previousRotation, this.rotation, clamp(alpha, 0, 1));
  }

  private updateExtents(): void {
    if (this.shape.kind === "sphere") this.halfExtents.setScalar(this.shape.radius);
    else orientedHalfExtents(this.shape.halfExtents, this.rotation, this.halfExtents, rotationMatrix);
  }

  private clearForces(): void {
    this.force.set(0, 0, 0);
    this.torque.set(0, 0, 0);
  }
}
