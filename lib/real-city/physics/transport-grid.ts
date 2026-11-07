import { clamp } from "./math";

export type TransportBounds = {
  minimumX: number;
  minimumZ: number;
  width: number;
  depth: number;
};

export type TransportBudget = {
  before: number;
  after: number;
  injected: number;
  removed: number;
  boundary: number;
  substeps: number;
};

export type TransportBoundarySampler = (x: number, z: number, seconds: number) => number;

export class ConservativeTransportGrid {
  readonly concentration: Float64Array;
  readonly velocityX: Float64Array;
  readonly velocityZ: Float64Array;
  readonly diffusivity: Float64Array;
  readonly source: Float64Array;
  readonly decay: Float64Array;
  readonly porosity: Float64Array;
  readonly cellWidth: number;
  readonly cellDepth: number;
  readonly area: number;
  readonly budget: TransportBudget = { before: 0, after: 0, injected: 0, removed: 0, boundary: 0, substeps: 0 };
  private readonly delta: Float64Array;
  private readonly fluxX: Float64Array;
  private readonly fluxZ: Float64Array;
  private readonly slopesX: Float64Array;
  private readonly slopesZ: Float64Array;
  private readonly outflow: Float64Array;
  private readonly limiter: Float64Array;
  private boundarySampler: TransportBoundarySampler = () => 0;

  constructor(readonly bounds: TransportBounds, readonly columns: number, readonly rows: number) {
    const count = Math.max(1, columns * rows);
    this.cellWidth = bounds.width / columns;
    this.cellDepth = bounds.depth / rows;
    this.area = this.cellWidth * this.cellDepth;
    this.concentration = new Float64Array(count);
    this.velocityX = new Float64Array(count);
    this.velocityZ = new Float64Array(count);
    this.diffusivity = new Float64Array(count);
    this.source = new Float64Array(count);
    this.decay = new Float64Array(count);
    this.porosity = new Float64Array(count).fill(1);
    this.delta = new Float64Array(count);
    this.fluxX = new Float64Array((columns + 1) * rows);
    this.fluxZ = new Float64Array(columns * (rows + 1));
    this.slopesX = new Float64Array(count);
    this.slopesZ = new Float64Array(count);
    this.outflow = new Float64Array(count);
    this.limiter = new Float64Array(count).fill(1);
  }

  setBoundary(sampler: TransportBoundarySampler): void {
    this.boundarySampler = sampler;
  }

  step(dt: number, seconds: number): TransportBudget {
    const elapsed = clamp(dt, 0, 5);
    this.budget.before = this.totalMass();
    this.budget.injected = 0;
    this.budget.removed = 0;
    this.budget.boundary = 0;
    this.budget.substeps = 0;
    if (elapsed <= 0) {
      this.budget.after = this.budget.before;
      return this.budget;
    }
    const stable = this.stableStep();
    const substeps = clamp(Math.ceil(elapsed / stable), 1, 16);
    const step = elapsed / substeps;
    for (let index = 0; index < substeps; index++) {
      const time = seconds - elapsed + (index + 1) * step;
      this.applySources(step);
      this.reconstruct();
      this.computeFluxes(step, time);
      this.limitOutgoingFlux(step);
      this.applyFluxes(step);
      this.budget.substeps++;
    }
    this.budget.after = this.totalMass();
    return this.budget;
  }

  sample(x: number, z: number): number {
    const gx = clamp((x - this.bounds.minimumX) / this.cellWidth - 0.5, 0, this.columns - 1);
    const gz = clamp((z - this.bounds.minimumZ) / this.cellDepth - 0.5, 0, this.rows - 1);
    const left = Math.floor(gx);
    const top = Math.floor(gz);
    const right = Math.min(this.columns - 1, left + 1);
    const bottom = Math.min(this.rows - 1, top + 1);
    const fx = gx - left;
    const fz = gz - top;
    const a = this.concentration[top * this.columns + left];
    const b = this.concentration[top * this.columns + right];
    const c = this.concentration[bottom * this.columns + left];
    const d = this.concentration[bottom * this.columns + right];
    return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
  }

  inject(x: number, z: number, mass: number, radius: number): void {
    if (!Number.isFinite(mass) || mass <= 0) return;
    const minimumColumn = clamp(Math.floor((x - radius - this.bounds.minimumX) / this.cellWidth), 0, this.columns - 1);
    const maximumColumn = clamp(Math.floor((x + radius - this.bounds.minimumX) / this.cellWidth), 0, this.columns - 1);
    const minimumRow = clamp(Math.floor((z - radius - this.bounds.minimumZ) / this.cellDepth), 0, this.rows - 1);
    const maximumRow = clamp(Math.floor((z + radius - this.bounds.minimumZ) / this.cellDepth), 0, this.rows - 1);
    let weight = 0;
    const denominator = Math.max(radius * radius, this.area * 0.1);
    for (let row = minimumRow; row <= maximumRow; row++) {
      for (let column = minimumColumn; column <= maximumColumn; column++) {
        const dx = this.bounds.minimumX + (column + 0.5) * this.cellWidth - x;
        const dz = this.bounds.minimumZ + (row + 0.5) * this.cellDepth - z;
        weight += Math.exp(-(dx * dx + dz * dz) / denominator);
      }
    }
    if (weight <= 0) return;
    for (let row = minimumRow; row <= maximumRow; row++) {
      for (let column = minimumColumn; column <= maximumColumn; column++) {
        const index = row * this.columns + column;
        const dx = this.bounds.minimumX + (column + 0.5) * this.cellWidth - x;
        const dz = this.bounds.minimumZ + (row + 0.5) * this.cellDepth - z;
        const fraction = Math.exp(-(dx * dx + dz * dz) / denominator) / weight;
        this.concentration[index] += mass * fraction / Math.max(0.0001, this.area * this.porosity[index]);
      }
    }
  }

  remove(index: number, requestedMass: number): number {
    if (index < 0 || index >= this.concentration.length) return 0;
    const volume = this.area * this.porosity[index];
    const removed = Math.min(this.concentration[index] * volume, Math.max(0, requestedMass));
    this.concentration[index] = Math.max(0, this.concentration[index] - removed / Math.max(1e-9, volume));
    return removed;
  }

  totalMass(): number {
    let sum = 0;
    for (let index = 0; index < this.concentration.length; index++) sum += this.concentration[index] * this.porosity[index] * this.area;
    return sum;
  }

  maximum(): number {
    let value = 0;
    for (const concentration of this.concentration) value = Math.max(value, concentration);
    return value;
  }

  centroid(target: { x: number; z: number }): typeof target {
    let mass = 0;
    let weightedX = 0;
    let weightedZ = 0;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const local = this.concentration[index] * this.porosity[index];
        mass += local;
        weightedX += (this.bounds.minimumX + (column + 0.5) * this.cellWidth) * local;
        weightedZ += (this.bounds.minimumZ + (row + 0.5) * this.cellDepth) * local;
      }
    }
    target.x = mass > 0 ? weightedX / mass : this.bounds.minimumX + this.bounds.width * 0.5;
    target.z = mass > 0 ? weightedZ / mass : this.bounds.minimumZ + this.bounds.depth * 0.5;
    return target;
  }

  reset(value = 0): void {
    this.concentration.fill(Math.max(0, value));
    this.delta.fill(0);
    this.fluxX.fill(0);
    this.fluxZ.fill(0);
    this.outflow.fill(0);
  }

  private stableStep(): number {
    let inverse = 0;
    for (let index = 0; index < this.concentration.length; index++) {
      const advection = Math.abs(this.velocityX[index]) / this.cellWidth + Math.abs(this.velocityZ[index]) / this.cellDepth;
      const diffusion = 2 * this.diffusivity[index] * (1 / this.cellWidth ** 2 + 1 / this.cellDepth ** 2);
      inverse = Math.max(inverse, (advection + diffusion) / Math.max(0.1, this.porosity[index]));
    }
    return inverse > 0 ? Math.max(0.001, 0.45 / inverse) : 5;
  }

  private applySources(dt: number): void {
    for (let index = 0; index < this.concentration.length; index++) {
      const volume = this.area * this.porosity[index];
      const injected = Math.max(0, this.source[index]) * dt;
      const before = this.concentration[index] + injected;
      const after = before * Math.exp(-Math.max(0, this.decay[index]) * dt);
      this.concentration[index] = Math.max(0, after);
      this.budget.injected += injected * volume;
      this.budget.removed += (before - after) * volume;
    }
  }

  private reconstruct(): void {
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const centre = this.concentration[index];
        const left = column > 0 ? this.concentration[index - 1] : centre;
        const right = column < this.columns - 1 ? this.concentration[index + 1] : centre;
        const top = row > 0 ? this.concentration[index - this.columns] : centre;
        const bottom = row < this.rows - 1 ? this.concentration[index + this.columns] : centre;
        this.slopesX[index] = this.minmod(centre - left, right - centre);
        this.slopesZ[index] = this.minmod(centre - top, bottom - centre);
      }
    }
  }

  private computeFluxes(dt: number, seconds: number): void {
    for (let row = 0; row < this.rows; row++) {
      for (let face = 0; face <= this.columns; face++) {
        const left = row * this.columns + face - 1;
        const right = row * this.columns + face;
        const faceIndex = row * (this.columns + 1) + face;
        const x = this.bounds.minimumX + face * this.cellWidth;
        const z = this.bounds.minimumZ + (row + 0.5) * this.cellDepth;
        const outside = this.boundarySampler(x, z, seconds);
        const leftValue = face === 0 ? outside : this.concentration[left];
        const rightValue = face === this.columns ? outside : this.concentration[right];
        const velocity = face === 0 ? this.velocityX[right] : face === this.columns ? this.velocityX[left] : (this.velocityX[left] + this.velocityX[right]) * 0.5;
        const diffusivity = face === 0 ? this.diffusivity[right] : face === this.columns ? this.diffusivity[left] : Math.min(this.diffusivity[left], this.diffusivity[right]);
        const courant = clamp(Math.abs(velocity) * dt / this.cellWidth, 0, 1);
        const reconstructed = velocity >= 0
          ? leftValue + (face > 0 ? this.slopesX[left] * 0.5 * (1 - courant) : 0)
          : rightValue - (face < this.columns ? this.slopesX[right] * 0.5 * (1 - courant) : 0);
        const diffusion = -diffusivity * (rightValue - leftValue) / this.cellWidth;
        this.fluxX[faceIndex] = velocity * Math.max(0, reconstructed) + diffusion;
      }
    }
    for (let face = 0; face <= this.rows; face++) {
      for (let column = 0; column < this.columns; column++) {
        const top = (face - 1) * this.columns + column;
        const bottom = face * this.columns + column;
        const faceIndex = face * this.columns + column;
        const x = this.bounds.minimumX + (column + 0.5) * this.cellWidth;
        const z = this.bounds.minimumZ + face * this.cellDepth;
        const outside = this.boundarySampler(x, z, seconds);
        const topValue = face === 0 ? outside : this.concentration[top];
        const bottomValue = face === this.rows ? outside : this.concentration[bottom];
        const velocity = face === 0 ? this.velocityZ[bottom] : face === this.rows ? this.velocityZ[top] : (this.velocityZ[top] + this.velocityZ[bottom]) * 0.5;
        const diffusivity = face === 0 ? this.diffusivity[bottom] : face === this.rows ? this.diffusivity[top] : Math.min(this.diffusivity[top], this.diffusivity[bottom]);
        const courant = clamp(Math.abs(velocity) * dt / this.cellDepth, 0, 1);
        const reconstructed = velocity >= 0
          ? topValue + (face > 0 ? this.slopesZ[top] * 0.5 * (1 - courant) : 0)
          : bottomValue - (face < this.rows ? this.slopesZ[bottom] * 0.5 * (1 - courant) : 0);
        const diffusion = -diffusivity * (bottomValue - topValue) / this.cellDepth;
        this.fluxZ[faceIndex] = velocity * Math.max(0, reconstructed) + diffusion;
      }
    }
  }

  private limitOutgoingFlux(dt: number): void {
    this.outflow.fill(0);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const west = this.fluxX[row * (this.columns + 1) + column];
        const east = this.fluxX[row * (this.columns + 1) + column + 1];
        const north = this.fluxZ[row * this.columns + column];
        const south = this.fluxZ[(row + 1) * this.columns + column];
        const outgoing = (Math.max(0, east) + Math.max(0, -west)) / this.cellWidth
          + (Math.max(0, south) + Math.max(0, -north)) / this.cellDepth;
        this.outflow[index] = outgoing * dt;
        const available = this.concentration[index] * this.porosity[index];
        this.limiter[index] = outgoing > 0 ? Math.min(1, available / Math.max(1e-12, outgoing * dt)) : 1;
      }
    }
    for (let row = 0; row < this.rows; row++) {
      for (let face = 0; face <= this.columns; face++) {
        const index = row * (this.columns + 1) + face;
        const flux = this.fluxX[index];
        const donor = flux >= 0 ? face - 1 : face;
        if (donor >= 0 && donor < this.columns) this.fluxX[index] *= this.limiter[row * this.columns + donor];
      }
    }
    for (let face = 0; face <= this.rows; face++) {
      for (let column = 0; column < this.columns; column++) {
        const index = face * this.columns + column;
        const flux = this.fluxZ[index];
        const donor = flux >= 0 ? face - 1 : face;
        if (donor >= 0 && donor < this.rows) this.fluxZ[index] *= this.limiter[donor * this.columns + column];
      }
    }
  }

  private applyFluxes(dt: number): void {
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const west = this.fluxX[row * (this.columns + 1) + column];
        const east = this.fluxX[row * (this.columns + 1) + column + 1];
        const north = this.fluxZ[row * this.columns + column];
        const south = this.fluxZ[(row + 1) * this.columns + column];
        const change = ((west - east) / this.cellWidth + (north - south) / this.cellDepth) * dt;
        this.delta[index] = change / Math.max(0.001, this.porosity[index]);
        if (column === 0) this.budget.boundary += west * this.cellDepth * dt;
        if (column === this.columns - 1) this.budget.boundary -= east * this.cellDepth * dt;
        if (row === 0) this.budget.boundary += north * this.cellWidth * dt;
        if (row === this.rows - 1) this.budget.boundary -= south * this.cellWidth * dt;
      }
    }
    for (let index = 0; index < this.concentration.length; index++) this.concentration[index] = Math.max(0, this.concentration[index] + this.delta[index]);
  }

  private minmod(a: number, b: number): number {
    if (a * b <= 0) return 0;
    return Math.sign(a) * Math.min(Math.abs(a), Math.abs(b));
  }
}
