import * as THREE from "three";
import { clamp } from "./math";
import type { WindSampler } from "./world";

export type ClothAerodynamicStatistics = {
  drag: number;
  lift: number;
  projectedArea: number;
  flutterEnergy: number;
};

export class ClothAerodynamics {
  readonly forces: THREE.Vector3[];
  readonly statistics: ClothAerodynamicStatistics = { drag: 0, lift: 0, projectedArea: 0, flutterEnergy: 0 };
  private readonly edgeA = new THREE.Vector3();
  private readonly edgeB = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly wind = new THREE.Vector3();
  private readonly relative = new THREE.Vector3();
  private readonly drag = new THREE.Vector3();
  private readonly lift = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly force = new THREE.Vector3();
  private readonly pressureHistory: Float32Array;
  private readonly vortices: Float32Array;

  constructor(readonly indices: THREE.BufferAttribute, vertexCount: number) {
    this.forces = Array.from({ length: vertexCount }, () => new THREE.Vector3());
    this.pressureHistory = new Float32Array(Math.floor(indices.count / 3));
    this.vortices = new Float32Array(this.pressureHistory.length);
  }

  step(dt: number, seconds: number, positions: readonly THREE.Vector3[], previous: readonly THREE.Vector3[], sampleWind: WindSampler, density: number, wetness: number): void {
    for (const force of this.forces) force.set(0, 0, 0);
    this.statistics.drag = 0;
    this.statistics.lift = 0;
    this.statistics.projectedArea = 0;
    this.statistics.flutterEnergy = 0;
    const inverseDt = 1 / Math.max(0.001, dt);
    for (let face = 0; face < this.pressureHistory.length; face++) {
      const first = this.indices.getX(face * 3);
      const second = this.indices.getX(face * 3 + 1);
      const third = this.indices.getX(face * 3 + 2);
      const a = positions[first];
      const b = positions[second];
      const c = positions[third];
      this.edgeA.copy(b).sub(a);
      this.edgeB.copy(c).sub(a);
      this.normal.crossVectors(this.edgeA, this.edgeB);
      const doubleArea = this.normal.length();
      if (doubleArea < 1e-9) continue;
      this.normal.multiplyScalar(1 / doubleArea);
      const area = doubleArea * 0.5;
      this.centre.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      this.velocity.copy(a).sub(previous[first]);
      this.velocity.add(b).sub(previous[second]);
      this.velocity.add(c).sub(previous[third]);
      this.velocity.multiplyScalar(inverseDt / 3);
      sampleWind(this.centre.x, this.centre.y, this.centre.z, seconds, this.wind);
      this.relative.copy(this.wind).sub(this.velocity);
      const speed = this.relative.length();
      if (speed < 0.005) continue;
      const normalSpeed = this.relative.dot(this.normal);
      const incidence = clamp(normalSpeed / speed, -1, 1);
      const projected = Math.abs(incidence) * area;
      const dynamicPressure = 0.5 * Math.max(0.5, density) * speed * speed;
      const chord = Math.sqrt(area * 2);
      const reynolds = density * speed * chord / 1.81e-5;
      const skinCoefficient = reynolds > 1000 ? 0.074 / Math.pow(reynolds, 0.2) : 1.328 / Math.sqrt(Math.max(1, reynolds));
      const porosity = 0.08 * (1 - wetness * 0.7);
      const pressureCoefficient = (1.05 + Math.abs(incidence) * 0.25) * (1 - porosity);
      this.drag.copy(this.relative).multiplyScalar(dynamicPressure * (projected * pressureCoefficient + area * skinCoefficient) / speed);
      this.tangent.copy(this.relative).addScaledVector(this.normal, -normalSpeed);
      const tangentLength = this.tangent.length();
      if (tangentLength > 1e-6) {
        this.tangent.multiplyScalar(1 / tangentLength);
        this.lift.copy(this.normal).addScaledVector(this.tangent, -normalSpeed / Math.max(0.1, tangentLength));
        this.lift.normalize().multiplyScalar(dynamicPressure * area * incidence * Math.sqrt(Math.max(0, 1 - incidence * incidence)) * 0.6);
      } else this.lift.set(0, 0, 0);
      const pressure = dynamicPressure * incidence * Math.abs(incidence);
      const pressureChange = (pressure - this.pressureHistory[face]) / Math.max(0.001, dt);
      this.pressureHistory[face] += (pressure - this.pressureHistory[face]) * Math.min(1, dt * 12);
      const sheddingFrequency = 0.18 * speed / Math.max(0.03, chord);
      this.vortices[face] += dt * sheddingFrequency * Math.PI * 2;
      const flutter = Math.sin(this.vortices[face]) * Math.min(dynamicPressure * 0.08, Math.abs(pressureChange) * 0.002);
      this.force.copy(this.drag).add(this.lift).addScaledVector(this.normal, flutter * area);
      const maximumForce = dynamicPressure * area * 2;
      this.force.clampLength(0, Math.max(0.0001, maximumForce));
      this.forces[first].addScaledVector(this.force, 1 / 3);
      this.forces[second].addScaledVector(this.force, 1 / 3);
      this.forces[third].addScaledVector(this.force, 1 / 3);
      this.statistics.drag += this.drag.length();
      this.statistics.lift += this.lift.length();
      this.statistics.projectedArea += projected;
      this.statistics.flutterEnergy += Math.abs(flutter) * area;
    }
  }

  reset(): void {
    for (const force of this.forces) force.set(0, 0, 0);
    this.pressureHistory.fill(0);
    this.vortices.fill(0);
    this.statistics.drag = 0;
    this.statistics.lift = 0;
    this.statistics.projectedArea = 0;
    this.statistics.flutterEnergy = 0;
  }
}
