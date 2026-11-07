import * as THREE from "three";
import { BraidedRopeMaterial, type RopeClimate } from "./rope-material";
import { ParallelTransportFrames } from "./curve-frames";
import type { WaterSampler, WaterSample } from "./buoyancy";
import { clamp, EPSILON, GRAVITY } from "./math";
import { createContact, StaticCollisionWorld } from "./colliders";

export type CableOptions = {
  start: THREE.Vector3;
  end: THREE.Vector3;
  slack: number;
  segments: number;
  mass: number;
  radius: number;
  endPinned: boolean;
};

export class CableSimulation {
  readonly points: THREE.Vector3[] = [];
  readonly previous: THREE.Vector3[] = [];
  readonly initial: THREE.Vector3[] = [];
  readonly geometry: THREE.BufferGeometry;
  readonly segments: number;
  readonly restLength: number;
  private readonly radius: number;
  private readonly endPinned: boolean;
  private readonly inverseMass: number;
  private readonly wind = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly contact = createContact();
  readonly material: BraidedRopeMaterial;
  private readonly frames: ParallelTransportFrames;
  private readonly multipliers: Float64Array;
  private readonly tension: Float64Array;
  private readonly water: WaterSample = { height: 0, normal: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), foam: 0 };
  private climate: RopeClimate = { wetness: 0, temperature: 18, salt: 0, ultraviolet: 0.5 };
  private waterSampler: WaterSampler | undefined;
  private priorDt = 1 / 60;
  private maximumTension = 0;

  constructor(options: CableOptions, readonly collisions: StaticCollisionWorld) {
    this.segments = clamp(Math.floor(options.segments), 4, 40);
    this.radius = Math.max(0.004, options.radius);
    this.endPinned = options.endPinned;
    this.inverseMass = this.segments / Math.max(0.01, options.mass);
    const straightLength = options.start.distanceTo(options.end);
    this.restLength = straightLength * Math.max(1, options.slack) / this.segments;
    this.material = new BraidedRopeMaterial(this.radius);
    this.frames = new ParallelTransportFrames(this.segments + 1);
    this.multipliers = new Float64Array(this.segments);
    this.tension = new Float64Array(this.segments);
    const sag = straightLength * Math.sqrt(Math.max(0, options.slack - 1)) * 0.35;
    for (let index = 0; index <= this.segments; index++) {
      const t = index / this.segments;
      const point = options.start.clone().lerp(options.end, t);
      point.y -= Math.sin(t * Math.PI) * sag;
      this.points.push(point);
      this.previous.push(point.clone());
      this.initial.push(point.clone());
    }
    const vertices = new Float32Array((this.segments + 1) * 6 * 3);
    const normals = new Float32Array(vertices.length);
    const uvs = new Float32Array((this.segments + 1) * 6 * 2);
    const indices: number[] = [];
    for (let row = 0; row <= this.segments; row++) {
      for (let side = 0; side < 6; side++) {
        uvs[(row * 6 + side) * 2] = side / 6;
        uvs[(row * 6 + side) * 2 + 1] = row / this.segments * straightLength;
        if (row < this.segments) {
          const a = row * 6 + side;
          const b = row * 6 + (side + 1) % 6;
          indices.push(a, b, b + 6, a, b + 6, a + 6);
        }
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
    this.writeGeometry();
  }

  setWaterSampler(sampler: WaterSampler): void {
    this.waterSampler = sampler;
  }

  setClimate(climate: RopeClimate): void {
    this.climate = climate;
  }

  step(dt: number, seconds: number, sampleWind: (x: number, y: number, z: number, seconds: number, target: THREE.Vector3) => THREE.Vector3): void {
    this.material.step(dt, this.maximumTension, this.climate);
    this.priorDt = dt;
    this.multipliers.fill(0);
    const ropeState = this.material.state;
    for (let index = 1; index <= this.segments; index++) {
      if (index === this.segments && this.endPinned) continue;
      const point = this.points[index];
      const previous = this.previous[index];
      this.delta.copy(point).sub(previous).multiplyScalar(Math.exp(-ropeState.damping * dt));
      previous.copy(point);
      sampleWind(point.x, point.y, point.z, seconds, this.wind);
      const windScale = Math.min(3, this.inverseMass * this.radius * this.restLength * 0.65);
      point.add(this.delta).addScaledVector(this.wind, windScale * dt * dt);
      point.y -= GRAVITY * dt * dt;
      if (this.waterSampler) {
        this.waterSampler(point.x, point.z, seconds, this.water);
        const submerged = clamp((this.water.height - point.y + this.radius) / (this.radius * 2), 0, 1);
        if (submerged > 0) {
          const displacedMass = Math.PI * this.radius * this.radius * this.restLength * 1000 * submerged;
          point.y += displacedMass * this.inverseMass / (1 + ropeState.absorbedMass) * GRAVITY * dt * dt;
          this.wind.copy(this.water.velocity).multiplyScalar(dt).sub(this.delta);
          point.addScaledVector(this.wind, Math.min(0.4, dt * 4 * submerged));
        }
      }
    }
    for (let iteration = 0; iteration < 5; iteration++) {
      for (let index = 0; index < this.segments; index++) {
        const a = this.points[index];
        const b = this.points[index + 1];
        const pinnedA = index === 0;
        const pinnedB = index + 1 === this.segments && this.endPinned;
        this.delta.copy(b).sub(a);
        const distance = this.delta.length();
        if (distance < EPSILON) continue;
        const weightA = pinnedA ? 0 : this.inverseMass / (1 + ropeState.absorbedMass);
        const weightB = pinnedB ? 0 : this.inverseMass / (1 + ropeState.absorbedMass);
        const compliance = this.material.compliance(this.restLength) / (dt * dt);
        const extension = distance - this.restLength * ropeState.lengthScale;
        const previous = this.multipliers[index];
        const proposed = previous + (-extension - compliance * previous) / Math.max(1e-8, weightA + weightB + compliance);
        this.multipliers[index] = Math.min(0, proposed);
        const change = this.multipliers[index] - previous;
        this.delta.multiplyScalar(1 / distance);
        if (!pinnedA) a.addScaledVector(this.delta, -change * weightA);
        if (!pinnedB) b.addScaledVector(this.delta, change * weightB);
      }
      for (let index = 1; index <= this.segments; index++) {
        if (index === this.segments && this.endPinned) continue;
        if (this.collisions.sphereGround(this.points[index], this.radius, this.contact)) {
          this.points[index].addScaledVector(this.contact.normal, this.contact.penetration);
          const sliding = this.points[index].distanceTo(this.previous[index]);
          this.material.recordAbrasion(this.contact.penetration / Math.max(0.0001, dt * dt * this.inverseMass), sliding, this.contact.material.dynamicFriction);
          this.previous[index].lerp(this.points[index], 0.3);
        }
      }
    }
    this.maximumTension = 0;
    for (let index = 0; index < this.segments; index++) {
      this.tension[index] = -this.multipliers[index] / Math.max(1e-8, dt * dt);
      this.maximumTension = Math.max(this.maximumTension, this.tension[index]);
    }
  }

  moveStart(point: THREE.Vector3): void {
    this.points[0].copy(point);
    this.previous[0].copy(point);
  }

  moveEnd(point: THREE.Vector3): void {
    if (!this.endPinned) return;
    this.points[this.segments].copy(point);
    this.previous[this.segments].copy(point);
  }

  endpointForce(target: THREE.Vector3, stiffness: number): THREE.Vector3 {
    const endpoint = this.points[this.segments];
    const previous = this.points[this.segments - 1];
    target.copy(previous).sub(endpoint);
    const distance = target.length();
    if (distance < EPSILON) return target.set(0, 0, 0);
    const residual = Math.max(0, distance - this.restLength * this.material.state.lengthScale) * stiffness;
    const solved = -this.multipliers[this.segments - 1] / Math.max(1e-8, this.priorDt * this.priorDt);
    const force = Math.min(this.material.state.breakingLoad, Math.max(residual, solved));
    return target.multiplyScalar(force / distance);
  }

  writeGeometry(): void {
    const positions = this.geometry.getAttribute("position");
    const normals = this.geometry.getAttribute("normal");
    this.frames.update(this.points);
    for (let index = 0; index <= this.segments; index++) {
      const curvature = this.frames.curvature(index);
      const bendRadius = this.radius * this.material.state.radiusScale * (1 - Math.min(0.08, curvature * this.radius * 0.1));
      const point = this.points[index];
      for (let side = 0; side < 6; side++) {
        const angle = side / 6 * Math.PI * 2;
        this.frames.offset(index, angle, 1, this.delta);
        const offset = index * 6 + side;
        positions.setXYZ(offset, point.x + this.delta.x * bendRadius, point.y + this.delta.y * bendRadius, point.z + this.delta.z * bendRadius);
        normals.setXYZ(offset, this.delta.x, this.delta.y, this.delta.z);
      }
    }
    positions.needsUpdate = true;
    normals.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  reset(): void {
    this.material.reset();
    this.frames.reset();
    this.multipliers.fill(0);
    this.tension.fill(0);
    this.maximumTension = 0;
    for (let index = 0; index < this.points.length; index++) {
      this.points[index].copy(this.initial[index]);
      this.previous[index].copy(this.initial[index]);
    }
    this.writeGeometry();
  }
}
