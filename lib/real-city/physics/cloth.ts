import * as THREE from "three";
import { FabricMoistureField, type FabricClimate } from "./fabric-moisture";
import { ClothAerodynamics } from "./cloth-aerodynamics";
import { ClothContactSystem } from "./cloth-contact";
import { createContact, StaticCollisionWorld } from "./colliders";
import { clamp, EPSILON, GRAVITY } from "./math";

type ClothConstraint = { first: number; second: number; length: number; compliance: number; lambda: number };
export type ClothOptions = {
  columns: number;
  rows: number;
  width: number;
  height: number;
  origin: THREE.Vector3;
  horizontal: THREE.Vector3;
  vertical: THREE.Vector3;
  massPerSquareMetre: number;
  pin: (column: number, row: number) => boolean;
  iterations?: number;
};

export class ClothSimulation {
  readonly positions: THREE.Vector3[] = [];
  readonly previous: THREE.Vector3[] = [];
  readonly rest: THREE.Vector3[] = [];
  readonly pinned: boolean[] = [];
  readonly geometry: THREE.BufferGeometry;
  readonly constraints: ClothConstraint[] = [];
  readonly normals: THREE.Vector3[] = [];
  readonly columns: number;
  readonly rows: number;
  readonly iterations: number;
  private readonly inverseMass: number;
  private readonly wind = new THREE.Vector3();
  private readonly acceleration = new THREE.Vector3();
  private readonly delta = new THREE.Vector3();
  private readonly edgeA = new THREE.Vector3();
  private readonly edgeB = new THREE.Vector3();
  private readonly faceNormal = new THREE.Vector3();
  private readonly contact = createContact();
  private wetness = 0;
  readonly moisture: FabricMoistureField;
  readonly aerodynamics: ClothAerodynamics;
  readonly contactSystem: ClothContactSystem;

  constructor(options: ClothOptions, readonly collisions: StaticCollisionWorld) {
    this.columns = clamp(Math.floor(options.columns), 2, 24);
    this.rows = clamp(Math.floor(options.rows), 2, 16);
    this.iterations = clamp(Math.floor(options.iterations ?? 4), 2, 8);
    const vertexCount = (this.columns + 1) * (this.rows + 1);
    const totalMass = Math.max(0.005, options.width * options.height * options.massPerSquareMetre);
    this.inverseMass = vertexCount / totalMass;
    const coordinates: number[] = [];
    const textureCoordinates: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row <= this.rows; row++) {
      for (let column = 0; column <= this.columns; column++) {
        const position = options.origin.clone()
          .addScaledVector(options.horizontal, column / this.columns * options.width)
          .addScaledVector(options.vertical, row / this.rows * options.height);
        this.positions.push(position);
        this.previous.push(position.clone());
        this.rest.push(position.clone());
        this.pinned.push(options.pin(column, row));
        this.normals.push(new THREE.Vector3(0, 0, 1));
        coordinates.push(position.x, position.y, position.z);
        textureCoordinates.push(column / this.columns, 1 - row / this.rows);
        if (row < this.rows && column < this.columns) {
          const first = row * (this.columns + 1) + column;
          const second = first + 1;
          const third = first + this.columns + 1;
          indices.push(first, third, second, second, third, third + 1);
        }
      }
    }
    for (let row = 0; row <= this.rows; row++) {
      for (let column = 0; column <= this.columns; column++) {
        const current = row * (this.columns + 1) + column;
        if (column < this.columns) this.addConstraint(current, current + 1, 0.000003);
        if (row < this.rows) this.addConstraint(current, current + this.columns + 1, 0.000003);
        if (column < this.columns && row < this.rows) {
          this.addConstraint(current, current + this.columns + 2, 0.00004);
          this.addConstraint(current + 1, current + this.columns + 1, 0.00004);
        }
        if (column + 2 <= this.columns) this.addConstraint(current, current + 2, 0.0008);
        if (row + 2 <= this.rows) this.addConstraint(current, current + (this.columns + 1) * 2, 0.0008);
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(coordinates, 3));
    this.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(textureCoordinates, 2));
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
    this.moisture = new FabricMoistureField(this.columns, this.rows, options.width, options.height, options.massPerSquareMetre);
    this.aerodynamics = new ClothAerodynamics(this.geometry.index!, vertexCount);
    this.contactSystem = new ClothContactSystem(collisions, this.columns);
    this.geometry.setAttribute("color", new THREE.BufferAttribute(new Float32Array(vertexCount * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage));
    (this.geometry.getAttribute("position") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
    (this.geometry.getAttribute("normal") as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  }

  step(dt: number, seconds: number, sampleWind: (x: number, y: number, z: number, seconds: number, target: THREE.Vector3) => THREE.Vector3, rainfall: number, climate?: FabricClimate): void {
    this.wetness = clamp(this.wetness + rainfall * dt * 0.13 - (1 - rainfall) * dt * 0.018, 0, 1);
    if (climate) this.moisture.step(dt, this.positions, this.normals, climate);
    this.aerodynamics.step(dt, seconds, this.positions, this.previous, sampleWind, 1.225, this.wetness);
    const drag = Math.exp(-(0.7 + this.wetness * 0.4) * dt);
    const massFactor = 1 / (1 + this.wetness * 1.8);

    for (let index = 0; index < this.positions.length; index++) {
      if (this.pinned[index]) {
        this.positions[index].copy(this.rest[index]);
        this.previous[index].copy(this.rest[index]);
        continue;
      }
      const point = this.positions[index];
      const old = this.previous[index];
      this.delta.copy(point).sub(old).multiplyScalar(drag);
      old.copy(point);
      this.acceleration.copy(this.aerodynamics.forces[index]).multiplyScalar(this.inverseMass * this.moisture.massFactor[index]);
      this.acceleration.clampLength(0, 28);
      this.acceleration.y -= GRAVITY;
      point.add(this.delta).addScaledVector(this.acceleration, dt * dt);
    }
    for (const constraint of this.constraints) constraint.lambda = 0;
    for (let iteration = 0; iteration < this.iterations; iteration++) {
      for (const constraint of this.constraints) this.solveConstraint(constraint, dt, massFactor);
      for (let index = 0; index < this.positions.length; index++) {
        if (this.pinned[index]) continue;
        const point = this.positions[index];
        if (this.collisions.sphereGround(point, 0.008, this.contact)) {
          point.addScaledVector(this.contact.normal, this.contact.penetration);
          this.previous[index].lerp(point, 0.25);
        }
      }
    }
    this.contactSystem.solve(this.positions, this.previous, this.pinned, this.moisture.massFactor, dt);
    this.updateNormals();
  }

  writeGeometry(): void {
    const position = this.geometry.getAttribute("position");
    const normal = this.geometry.getAttribute("normal");
    const color = this.geometry.getAttribute("color");
    for (let index = 0; index < this.positions.length; index++) {
      const point = this.positions[index];
      const direction = this.normals[index];
      position.setXYZ(index, point.x, point.y, point.z);
      normal.setXYZ(index, direction.x, direction.y, direction.z);
      color.setXYZ(index, this.moisture.color[index * 3], this.moisture.color[index * 3 + 1], this.moisture.color[index * 3 + 2]);
    }
    position.needsUpdate = true;
    normal.needsUpdate = true;
    color.needsUpdate = true;
    this.geometry.computeBoundingSphere();
  }

  movePin(column: number, row: number, point: THREE.Vector3): void {
    const index = row * (this.columns + 1) + column;
    if (!this.pinned[index]) return;
    this.rest[index].copy(point);
    this.positions[index].copy(point);
    this.previous[index].copy(point);
  }

  reset(): void {
    for (let index = 0; index < this.positions.length; index++) {
      this.positions[index].copy(this.rest[index]);
      this.previous[index].copy(this.rest[index]);
    }
    this.wetness = 0;
    this.moisture.reset();
    this.aerodynamics.reset();
    this.contactSystem.reset();
    this.updateNormals();
    this.writeGeometry();
  }

  private addConstraint(first: number, second: number, compliance: number): void {
    this.constraints.push({
      first,
      second,
      length: this.rest[first].distanceTo(this.rest[second]),
      compliance,
      lambda: 0,
    });
  }

  private solveConstraint(constraint: ClothConstraint, dt: number, massFactor: number): void {
    const a = this.positions[constraint.first];
    const b = this.positions[constraint.second];
    const weightA = this.pinned[constraint.first] ? 0 : this.inverseMass * massFactor * this.moisture.massFactor[constraint.first];
    const weightB = this.pinned[constraint.second] ? 0 : this.inverseMass * massFactor * this.moisture.massFactor[constraint.second];
    if (weightA + weightB === 0) return;
    this.delta.copy(b).sub(a);
    const distance = this.delta.length();
    if (distance < EPSILON) return;
    const stiffness = (this.moisture.stiffnessFactor[constraint.first] + this.moisture.stiffnessFactor[constraint.second]) * 0.5;
    const compliance = constraint.compliance / (dt * dt * stiffness);
    const error = distance - constraint.length;
    const lambda = (-error - compliance * constraint.lambda) / (weightA + weightB + compliance);
    constraint.lambda += lambda;
    this.delta.multiplyScalar(lambda / distance);
    a.addScaledVector(this.delta, -weightA);
    b.addScaledVector(this.delta, weightB);
  }

  private updateNormals(): void {
    for (const normal of this.normals) normal.set(0, 0, 0);
    const indices = this.geometry.index!;
    for (let index = 0; index < indices.count; index += 3) {
      const a = indices.getX(index);
      const b = indices.getX(index + 1);
      const c = indices.getX(index + 2);
      this.edgeA.copy(this.positions[b]).sub(this.positions[a]);
      this.edgeB.copy(this.positions[c]).sub(this.positions[a]);
      this.faceNormal.crossVectors(this.edgeA, this.edgeB);
      this.normals[a].add(this.faceNormal);
      this.normals[b].add(this.faceNormal);
      this.normals[c].add(this.faceNormal);
    }
    for (const normal of this.normals) {
      if (normal.lengthSq() < EPSILON) normal.set(0, 0, 1);
      else normal.normalize();
    }
  }
}
