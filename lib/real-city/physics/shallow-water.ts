import * as THREE from "three";
import type { WaterSample, WaterSampler } from "./buoyancy";
import { clamp, GRAVITY, smoothstep } from "./math";

export type WaterPatchBounds = { minimumX: number; minimumZ: number; width: number; depth: number };

export class ShallowWaterPatch {
  readonly columns: number;
  readonly rows: number;
  readonly height: Float32Array;
  readonly velocityX: Float32Array;
  readonly velocityZ: Float32Array;
  readonly foam: Float32Array;
  readonly depth: Float32Array;
  readonly obstruction: Uint8Array;
  readonly cellX: number;
  readonly cellZ: number;
  private readonly nextHeight: Float32Array;
  private readonly nextVelocityX: Float32Array;
  private readonly nextVelocityZ: Float32Array;
  private readonly nextFoam: Float32Array;
  private readonly verticalVelocity: Float32Array;
  private readonly analytic: WaterSample = { height: 0, normal: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), foam: 0 };
  private elapsed = 0;
  private initialized = false;

  constructor(
    readonly bounds: WaterPatchBounds,
    columns: number,
    rows: number,
    readonly boundary: WaterSampler,
    sampleDepth: (x: number, z: number) => number,
  ) {
    this.columns = Math.max(8, Math.min(96, Math.floor(columns)));
    this.rows = Math.max(8, Math.min(40, Math.floor(rows)));
    this.cellX = bounds.width / (this.columns - 1);
    this.cellZ = bounds.depth / (this.rows - 1);
    const count = this.columns * this.rows;
    this.height = new Float32Array(count);
    this.velocityX = new Float32Array(count);
    this.velocityZ = new Float32Array(count);
    this.foam = new Float32Array(count);
    this.depth = new Float32Array(count);
    this.obstruction = new Uint8Array(count);
    this.nextHeight = new Float32Array(count);
    this.nextVelocityX = new Float32Array(count);
    this.nextVelocityZ = new Float32Array(count);
    this.nextFoam = new Float32Array(count);
    this.verticalVelocity = new Float32Array(count);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const x = bounds.minimumX + column * this.cellX;
        const z = bounds.minimumZ + row * this.cellZ;
        this.depth[row * this.columns + column] = clamp(sampleDepth(x, z), 0.08, 6);
      }
    }
  }

  contains(x: number, z: number): boolean {
    return x >= this.bounds.minimumX && x <= this.bounds.minimumX + this.bounds.width
      && z >= this.bounds.minimumZ && z <= this.bounds.minimumZ + this.bounds.depth;
  }

  obstacle(x: number, z: number, radius: number): void {
    const centerX = (x - this.bounds.minimumX) / this.cellX;
    const centerZ = (z - this.bounds.minimumZ) / this.cellZ;
    const fromX = Math.max(0, Math.floor(centerX - radius / this.cellX));
    const toX = Math.min(this.columns - 1, Math.ceil(centerX + radius / this.cellX));
    const fromZ = Math.max(0, Math.floor(centerZ - radius / this.cellZ));
    const toZ = Math.min(this.rows - 1, Math.ceil(centerZ + radius / this.cellZ));
    for (let row = fromZ; row <= toZ; row++) {
      for (let column = fromX; column <= toX; column++) {
        const dx = (column - centerX) * this.cellX;
        const dz = (row - centerZ) * this.cellZ;
        if (dx * dx + dz * dz < radius * radius) this.obstruction[row * this.columns + column] = 1;
      }
    }
  }

  impulse(x: number, z: number, amount: number, radius: number): void {
    if (!this.contains(x, z)) return;
    const gridX = (x - this.bounds.minimumX) / this.cellX;
    const gridZ = (z - this.bounds.minimumZ) / this.cellZ;
    const searchX = Math.max(1, Math.ceil(radius / this.cellX));
    const searchZ = Math.max(1, Math.ceil(radius / this.cellZ));
    for (let row = Math.max(1, Math.floor(gridZ) - searchZ); row <= Math.min(this.rows - 2, Math.ceil(gridZ) + searchZ); row++) {
      for (let column = Math.max(1, Math.floor(gridX) - searchX); column <= Math.min(this.columns - 2, Math.ceil(gridX) + searchX); column++) {
        const index = row * this.columns + column;
        if (this.obstruction[index]) continue;
        const dx = (column - gridX) * this.cellX;
        const dz = (row - gridZ) * this.cellZ;
        const distance = Math.hypot(dx, dz);
        const strength = 1 - smoothstep(0, radius, distance);
        this.height[index] += clamp(amount, -0.08, 0.08) * strength;
        this.foam[index] = Math.min(1, this.foam[index] + Math.abs(amount) * strength * 2);
      }
    }
  }

  step(dt: number, seconds: number, windX: number, windZ: number): void {
    if (!this.initialized) this.reset(seconds);
    this.elapsed += dt;
    if (this.elapsed < 1 / 30) return;
    const accepted = Math.min(this.elapsed, 1 / 15);
    this.elapsed = 0;
    const minimumCell = Math.min(this.cellX, this.cellZ);
    const stableDt = minimumCell / (Math.sqrt(GRAVITY * 6) * 2.4);
    const steps = Math.max(1, Math.ceil(accepted / stableDt));
    const substep = accepted / steps;
    for (let step = 0; step < steps; step++) this.integrate(substep, seconds - accepted + (step + 1) * substep, windX, windZ);
  }

  sample(x: number, z: number, seconds: number, result: WaterSample): WaterSample {
    if (!this.initialized || !this.contains(x, z)) return this.boundary(x, z, seconds, result);
    const column = clamp((x - this.bounds.minimumX) / this.cellX, 0, this.columns - 1);
    const row = clamp((z - this.bounds.minimumZ) / this.cellZ, 0, this.rows - 1);
    const c0 = Math.floor(column);
    const r0 = Math.floor(row);
    const c1 = Math.min(this.columns - 1, c0 + 1);
    const r1 = Math.min(this.rows - 1, r0 + 1);
    const fx = column - c0;
    const fz = row - r0;
    const interpolate = (field: Float32Array) => {
      const a = field[r0 * this.columns + c0];
      const b = field[r0 * this.columns + c1];
      const c = field[r1 * this.columns + c0];
      const d = field[r1 * this.columns + c1];
      return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
    };
    result.height = interpolate(this.height);
    result.velocity.set(interpolate(this.velocityX), interpolate(this.verticalVelocity), interpolate(this.velocityZ));
    result.foam = interpolate(this.foam);
    const left = this.height[r0 * this.columns + Math.max(0, c0 - 1)];
    const right = this.height[r0 * this.columns + Math.min(this.columns - 1, c0 + 1)];
    const top = this.height[Math.max(0, r0 - 1) * this.columns + c0];
    const bottom = this.height[Math.min(this.rows - 1, r0 + 1) * this.columns + c0];
    result.normal.set(-(right - left) / (2 * this.cellX), 1, -(bottom - top) / (2 * this.cellZ)).normalize();
    return result;
  }

  reset(seconds = 0): void {
    this.elapsed = 0;
    this.initialized = true;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const x = this.bounds.minimumX + column * this.cellX;
        const z = this.bounds.minimumZ + row * this.cellZ;
        this.boundary(x, z, seconds, this.analytic);
        this.height[index] = this.analytic.height;
        this.velocityX[index] = this.analytic.velocity.x;
        this.velocityZ[index] = this.analytic.velocity.z;
        this.verticalVelocity[index] = this.analytic.velocity.y;
        this.foam[index] = this.analytic.foam;
      }
    }
  }

  private integrate(dt: number, seconds: number, windX: number, windZ: number): void {
    const inverseDoubleX = 1 / (2 * this.cellX);
    const inverseDoubleZ = 1 / (2 * this.cellZ);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const x = this.bounds.minimumX + column * this.cellX;
        const z = this.bounds.minimumZ + row * this.cellZ;
        const boundaryDistance = Math.min(column, row, this.columns - 1 - column, this.rows - 1 - row);
        if (boundaryDistance === 0) {
          this.boundary(x, z, seconds, this.analytic);
          this.nextHeight[index] = this.analytic.height;
          this.nextVelocityX[index] = this.analytic.velocity.x;
          this.nextVelocityZ[index] = this.analytic.velocity.z;
          this.nextFoam[index] = this.analytic.foam;
          continue;
        }
        if (this.obstruction[index]) {
          this.nextHeight[index] = this.height[index];
          this.nextVelocityX[index] = 0;
          this.nextVelocityZ[index] = 0;
          this.nextFoam[index] = this.foam[index] * Math.exp(-dt * 0.8);
          continue;
        }
        const left = index - 1;
        const right = index + 1;
        const top = index - this.columns;
        const bottom = index + this.columns;
        const centerHeight = this.height[index];
        const leftHeight = this.obstruction[left] ? centerHeight : this.height[left];
        const rightHeight = this.obstruction[right] ? centerHeight : this.height[right];
        const topHeight = this.obstruction[top] ? centerHeight : this.height[top];
        const bottomHeight = this.obstruction[bottom] ? centerHeight : this.height[bottom];
        const slopeX = (rightHeight - leftHeight) * inverseDoubleX;
        const slopeZ = (bottomHeight - topHeight) * inverseDoubleZ;
        const depth = this.depth[index];
        const bottomDrag = 0.035 + 0.07 / Math.max(0.2, depth);
        const u = this.velocityX[index];
        const v = this.velocityZ[index];
        const advectionU = u * (this.velocityX[right] - this.velocityX[left]) * inverseDoubleX + v * (this.velocityX[bottom] - this.velocityX[top]) * inverseDoubleZ;
        const advectionV = u * (this.velocityZ[right] - this.velocityZ[left]) * inverseDoubleX + v * (this.velocityZ[bottom] - this.velocityZ[top]) * inverseDoubleZ;
        const viscosityU = (this.velocityX[left] + this.velocityX[right] - 2 * u) / (this.cellX * this.cellX)
          + (this.velocityX[top] + this.velocityX[bottom] - 2 * u) / (this.cellZ * this.cellZ);
        const viscosityV = (this.velocityZ[left] + this.velocityZ[right] - 2 * v) / (this.cellX * this.cellX)
          + (this.velocityZ[top] + this.velocityZ[bottom] - 2 * v) / (this.cellZ * this.cellZ);
        this.nextVelocityX[index] = clamp(u + (-GRAVITY * slopeX - advectionU - bottomDrag * u + viscosityU * 0.025 + windX * 0.0015) * dt, -1.8, 1.8);
        this.nextVelocityZ[index] = clamp(v + (-GRAVITY * slopeZ - advectionV - bottomDrag * v + viscosityV * 0.025 + windZ * 0.0015) * dt, -1.8, 1.8);
        const fluxLeft = this.obstruction[left] ? 0 : this.velocityX[left] * this.depth[left];
        const fluxRight = this.obstruction[right] ? 0 : this.velocityX[right] * this.depth[right];
        const fluxTop = this.obstruction[top] ? 0 : this.velocityZ[top] * this.depth[top];
        const fluxBottom = this.obstruction[bottom] ? 0 : this.velocityZ[bottom] * this.depth[bottom];
        const divergence = (fluxRight - fluxLeft) * inverseDoubleX + (fluxBottom - fluxTop) * inverseDoubleZ;
        const heightViscosity = (leftHeight + rightHeight + topHeight + bottomHeight - 4 * centerHeight) * 0.08;
        this.nextHeight[index] = clamp(centerHeight + (-divergence + heightViscosity) * dt, -0.28, Math.min(0.3, depth * 0.45));
        const curvature = Math.abs(leftHeight + rightHeight + topHeight + bottomHeight - 4 * centerHeight);
        const breaking = smoothstep(0.04, 0.16, Math.hypot(slopeX, slopeZ)) * (1 - smoothstep(0.6, 3, depth));
        const foamSource = breaking * 1.5 + smoothstep(0.02, 0.08, curvature) * 0.25;
        const advectedFoam = this.sampleScalar(this.foam, column - u * dt / this.cellX, row - v * dt / this.cellZ);
        this.nextFoam[index] = clamp(advectedFoam * Math.exp(-dt * 0.34) + foamSource * dt, 0, 1);
        if (boundaryDistance < 4) {
          this.boundary(x, z, seconds, this.analytic);
          const sponge = (1 - boundaryDistance / 4) * Math.min(1, dt * 6);
          this.nextHeight[index] += (this.analytic.height - this.nextHeight[index]) * sponge;
          this.nextVelocityX[index] += (this.analytic.velocity.x - this.nextVelocityX[index]) * sponge;
          this.nextVelocityZ[index] += (this.analytic.velocity.z - this.nextVelocityZ[index]) * sponge;
        }
      }
    }
    for (let index = 0; index < this.height.length; index++) {
      this.verticalVelocity[index] = (this.nextHeight[index] - this.height[index]) / dt;
      this.height[index] = this.nextHeight[index];
      this.velocityX[index] = this.nextVelocityX[index];
      this.velocityZ[index] = this.nextVelocityZ[index];
      this.foam[index] = this.nextFoam[index];
    }
  }

  private sampleScalar(field: Float32Array, column: number, row: number): number {
    const x = clamp(column, 0, this.columns - 1);
    const z = clamp(row, 0, this.rows - 1);
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = Math.min(this.columns - 1, x0 + 1);
    const z1 = Math.min(this.rows - 1, z0 + 1);
    const fx = x - x0;
    const fz = z - z0;
    const first = field[z0 * this.columns + x0] * (1 - fx) + field[z0 * this.columns + x1] * fx;
    const second = field[z1 * this.columns + x0] * (1 - fx) + field[z1 * this.columns + x1] * fx;
    return first * (1 - fz) + second * fz;
  }
}
