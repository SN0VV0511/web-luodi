import type { TrafficSpecification, TrafficState } from "./types";

type WheelContact = {
  x: number;
  z: number;
  height: number;
  velocity: number;
  roadHeight: number;
  roadVelocity: number;
  compression: number;
  springForce: number;
  normalForce: number;
};

export class VehicleChassis {
  private readonly contacts: WheelContact[];
  private heave = 0;
  private verticalVelocity = 0;
  private pitch = 0;
  private pitchVelocity = 0;
  private roll = 0;
  private rollVelocity = 0;
  private readonly sprungMass: number;
  private readonly wheelMass: number;
  private readonly springRate: number;
  private readonly damperRate: number;
  private readonly tireRate: number;
  private readonly pitchInertia: number;
  private readonly rollInertia: number;
  private readonly centerHeight: number;
  private readonly track: number;
  private readonly preload: number;

  constructor(private readonly specification: TrafficSpecification) {
    const heavy = specification.mass > 5000;
    this.wheelMass = heavy ? 90 : 28;
    this.sprungMass = Math.max(400, specification.mass - this.wheelMass * 4);
    const quarterMass = this.sprungMass * 0.25;
    const frequency = heavy ? 1.35 : 1.65;
    const omega = Math.PI * 2 * frequency;
    this.springRate = omega * omega * quarterMass;
    this.damperRate = 2 * Math.sqrt(this.springRate * quarterMass) * 0.42;
    this.tireRate = heavy ? 600000 : 185000;
    this.track = specification.width * 0.81;
    this.centerHeight = heavy ? 1.15 : specification.mass > 2000 ? 0.68 : 0.52;
    this.pitchInertia = this.sprungMass * specification.wheelbase ** 2 * 0.21;
    this.rollInertia = this.sprungMass * (this.track ** 2 + this.centerHeight ** 2) * 0.18;
    this.preload = quarterMass * 9.80665;
    this.contacts = [];
    for (const front of [true, false]) {
      for (const right of [false, true]) {
        this.contacts.push({
          x: (right ? 1 : -1) * this.track * 0.5,
          z: (front ? 1 : -1) * specification.wheelbase * 0.5,
          height: 0,
          velocity: 0,
          roadHeight: 0,
          roadVelocity: 0,
          compression: 0,
          springForce: this.preload,
          normalForce: this.preload + this.wheelMass * 9.80665,
        });
      }
    }
  }

  update(state: TrafficState, dt: number): void {
    const safeDt = Math.min(1 / 30, Math.max(0, dt));
    if (safeDt === 0) return;
    const steps = Math.max(1, Math.ceil(safeDt / (1 / 240)));
    const step = safeDt / steps;
    const cosine = Math.cos(state.pose.heading);
    const sine = Math.sin(state.pose.heading);
    for (const contact of this.contacts) {
      const x = state.pose.x + contact.x * cosine + contact.z * sine;
      const z = state.pose.z - contact.x * sine + contact.z * cosine;
      const height = this.roadSurface(x, z);
      contact.roadVelocity = Math.max(-0.15, Math.min(0.15, (height - contact.roadHeight) / safeDt));
      contact.roadHeight = height;
    }
    for (let substep = 0; substep < steps; substep++) this.integrate(state, step);
    state.bodyHeave = this.heave;
    state.bodyPitch = this.pitch;
    state.bodyRoll = this.roll;
    const curvature = state.pose.curvature;
    for (let index = 0; index < this.contacts.length; index++) {
      const contact = this.contacts[index];
      state.wheelHeights[index] = contact.height;
      state.wheelLoads[index] = Math.max(0, contact.normalForce);
      const target = contact.z > 0
        ? Math.atan(this.specification.wheelbase * curvature / Math.max(0.3, 1 - contact.x * curvature))
        : 0;
      const current = state.wheelSteering[index];
      const maximumRate = 1.8 * safeDt;
      state.wheelSteering[index] = current + Math.max(-maximumRate, Math.min(maximumRate, target - current));
    }
  }

  reset(): void {
    this.heave = 0;
    this.verticalVelocity = 0;
    this.pitch = 0;
    this.pitchVelocity = 0;
    this.roll = 0;
    this.rollVelocity = 0;
    for (const contact of this.contacts) {
      contact.height = 0;
      contact.velocity = 0;
      contact.roadHeight = 0;
      contact.roadVelocity = 0;
      contact.compression = 0;
      contact.springForce = this.preload;
      contact.normalForce = this.preload + this.wheelMass * 9.80665;
    }
  }

  private integrate(state: TrafficState, dt: number): void {
    for (const contact of this.contacts) {
      const bodyHeight = this.heave - this.pitch * contact.z + this.roll * contact.x;
      const bodyVelocity = this.verticalVelocity - this.pitchVelocity * contact.z + this.rollVelocity * contact.x;
      const compression = contact.height - bodyHeight;
      const relativeVelocity = contact.velocity - bodyVelocity;
      const bumpStop = this.bumpStopForce(compression);
      const damping = relativeVelocity > 0 ? this.damperRate * 0.85 : this.damperRate * 1.15;
      contact.compression = compression;
      contact.springForce = this.preload + this.springRate * compression
        + damping * relativeVelocity + bumpStop;
    }
    this.applyAntiRoll(0, 1);
    this.applyAntiRoll(2, 3);
    let verticalForce = -this.sprungMass * 9.80665;
    let pitchTorque = -Math.max(-9, Math.min(5, state.acceleration)) * this.sprungMass * this.centerHeight;
    let rollTorque = Math.max(-6, Math.min(6, state.lateralAcceleration)) * this.sprungMass * this.centerHeight;
    for (const contact of this.contacts) {
      const spring = Math.max(-this.preload * 0.2, Math.min(this.preload * 3.5, contact.springForce));
      contact.springForce = spring;
      verticalForce += spring;
      pitchTorque -= spring * contact.z;
      rollTorque += spring * contact.x;
      const tireCompression = contact.roadHeight - contact.height;
      const tireVelocity = contact.roadVelocity - contact.velocity;
      const tireDamping = this.wheelMass * 12;
      const tireForce = this.preload + this.wheelMass * 9.80665
        + this.tireRate * tireCompression + tireDamping * tireVelocity;
      contact.normalForce = Math.max(0, tireForce);
      const wheelAcceleration = (contact.normalForce - spring - this.wheelMass * 9.80665) / this.wheelMass;
      contact.velocity += wheelAcceleration * dt;
      contact.height += contact.velocity * dt;
      if (Math.abs(contact.height) > 0.08) {
        contact.height = Math.max(-0.08, Math.min(0.08, contact.height));
        contact.velocity *= 0.2;
      }
    }
    this.verticalVelocity += verticalForce / this.sprungMass * dt;
    this.pitchVelocity += pitchTorque / this.pitchInertia * dt;
    this.rollVelocity += rollTorque / this.rollInertia * dt;
    this.heave += this.verticalVelocity * dt;
    this.pitch += this.pitchVelocity * dt;
    this.roll += this.rollVelocity * dt;
    this.constrainTravel();
  }

  private applyAntiRoll(left: number, right: number): void {
    const a = this.contacts[left];
    const b = this.contacts[right];
    const differential = a.compression - b.compression;
    const force = differential * this.springRate * 0.28;
    a.springForce += force;
    b.springForce -= force;
  }

  private bumpStopForce(compression: number): number {
    const limit = compression > 0 ? 0.055 : 0.07;
    const excess = Math.max(0, Math.abs(compression) - limit);
    return Math.sign(compression) * this.springRate * excess * (2 + excess * 60);
  }

  private constrainTravel(): void {
    if (this.heave < -0.07 || this.heave > 0.07) {
      this.heave = Math.max(-0.07, Math.min(0.07, this.heave));
      this.verticalVelocity *= 0.3;
    }
    if (this.pitch < -0.08 || this.pitch > 0.08) {
      this.pitch = Math.max(-0.08, Math.min(0.08, this.pitch));
      this.pitchVelocity *= 0.3;
    }
    if (this.roll < -0.09 || this.roll > 0.09) {
      this.roll = Math.max(-0.09, Math.min(0.09, this.roll));
      this.rollVelocity *= 0.3;
    }
  }

  private roadSurface(x: number, z: number): number {
    const aggregate = Math.sin(x * 7.13 + z * 3.77) * 0.0009
      + Math.sin(x * 2.17 - z * 4.13) * 0.0011;
    const settlement = Math.sin(x * 0.17 + z * 0.11) * 0.0015;
    return aggregate + settlement;
  }
}
