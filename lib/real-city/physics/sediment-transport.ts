import { ConservativeTransportGrid, type TransportBounds } from "./transport-grid";
import { clamp, saturate } from "./math";

export type SedimentSample = {
  sand: number;
  silt: number;
  clay: number;
  turbidity: number;
  bedChange: number;
  roughness: number;
  shear: number;
  deposition: number;
  scour: number;
};

export type SedimentFlowSampler = (x: number, z: number, result: { x: number; z: number; depth: number; foam: number }) => void;

type SedimentFraction = {
  diameter: number;
  density: number;
  settling: number;
  criticalShear: number;
  transport: ConservativeTransportGrid;
  bedMass: Float64Array;
  initialBed: Float64Array;
};

export function createSedimentSample(): SedimentSample {
  return { sand: 0, silt: 0, clay: 0, turbidity: 0, bedChange: 0, roughness: 0.002, shear: 0, deposition: 0, scour: 0 };
}

export class SedimentTransport {
  readonly sand: SedimentFraction;
  readonly silt: SedimentFraction;
  readonly clay: SedimentFraction;
  readonly bedChange: Float64Array;
  readonly bedRoughness: Float64Array;
  readonly bedShear: Float64Array;
  readonly deposition: Float64Array;
  readonly scour: Float64Array;
  private readonly fractions: SedimentFraction[];
  private readonly depths: Float64Array;
  private readonly bedDelta: Float64Array;
  private readonly flow = { x: 0, z: 0, depth: 1, foam: 0 };
  private readonly initialTotal: Float64Array;
  private elapsed = 0;

  constructor(readonly bounds: TransportBounds, readonly columns: number, readonly rows: number) {
    this.sand = this.createFraction(0.00028, 2650, 0.16, 18);
    this.silt = this.createFraction(0.000025, 2650, 0.09, 4);
    this.clay = this.createFraction(0.000003, 2650, 0.16, 1.5);
    this.fractions = [this.sand, this.silt, this.clay];
    const count = columns * rows;
    this.bedChange = new Float64Array(count);
    this.bedRoughness = new Float64Array(count).fill(0.002);
    this.bedShear = new Float64Array(count);
    this.deposition = new Float64Array(count);
    this.scour = new Float64Array(count);
    this.depths = new Float64Array(count).fill(1);
    this.bedDelta = new Float64Array(count);
    this.initialTotal = new Float64Array(count);
    for (let index = 0; index < count; index++) {
      for (const fraction of this.fractions) this.initialTotal[index] += fraction.bedMass[index];
    }
  }

  step(dt: number, seconds: number, sampleFlow: SedimentFlowSampler, waveOrbitalSpeed: number, rainfall: number): void {
    this.elapsed += clamp(dt, 0, 0.5);
    if (this.elapsed < 0.2) return;
    const duration = Math.min(0.5, this.elapsed);
    this.elapsed = 0;
    this.deposition.fill(0);
    this.scour.fill(0);
    const grid = this.sand.transport;
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        const x = this.bounds.minimumX + (column + 0.5) * grid.cellWidth;
        const z = this.bounds.minimumZ + (row + 0.5) * grid.cellDepth;
        sampleFlow(x, z, this.flow);
        const depth = Math.max(0.12, this.flow.depth - this.bedChange[index]);
        this.depths[index] = depth;
        const currentSpeed = Math.hypot(this.flow.x, this.flow.z);
        const logDepth = Math.log(Math.max(1.1, depth / Math.max(0.0001, this.bedRoughness[index])));
        const friction = 0.41 * 0.41 / Math.max(1, logDepth * logDepth);
        const currentShear = 1025 * friction * currentSpeed * currentSpeed;
        const waveShear = 0.5 * 1025 * 0.015 * waveOrbitalSpeed * waveOrbitalSpeed * Math.exp(-depth * 0.35);
        const combinedShear = Math.sqrt(currentShear * currentShear + waveShear * waveShear + currentShear * waveShear * 1.2);
        this.bedShear[index] = combinedShear;
        for (const fraction of this.fractions) {
          const transport = fraction.transport;
          transport.velocityX[index] = this.flow.x;
          transport.velocityZ[index] = this.flow.z;
          transport.diffusivity[index] = 0.015 + Math.sqrt(combinedShear / 1025) * depth * 0.15;
          transport.porosity[index] = depth;
          const available = fraction.bedMass[index];
          const armor = 1 + this.sand.bedMass[index] / Math.max(0.01, this.silt.bedMass[index] + this.clay.bedMass[index]) * 0.015;
          const critical = fraction.criticalShear * armor;
          const excess = Math.max(0, combinedShear / Math.max(0.001, critical) - 1);
          const entrainment = Math.min(available / duration * 0.02, excess ** 1.5 * 0.00008);
          const suspended = transport.concentration[index];
          const settling = fraction.settling * suspended * (1 - saturate(combinedShear / Math.max(0.001, critical)));
          const deposited = Math.min(suspended * depth / duration, Math.max(0, settling));
          fraction.bedMass[index] += (deposited - entrainment) * duration;
          transport.source[index] = entrainment / depth + (row === 0 ? rainfall * 0.000001 / depth : 0);
          transport.decay[index] = suspended > 1e-12 ? deposited / (suspended * depth) : 0;
          this.deposition[index] += deposited;
          this.scour[index] += entrainment;
        }
      }
    }
    for (const fraction of this.fractions) fraction.transport.step(duration, seconds);
    this.transportBedLoad(duration, sampleFlow);
    this.relaxBedSlope(duration);
    for (let index = 0; index < this.bedChange.length; index++) {
      let totalBed = 0;
      let weightedDiameter = 0;
      for (const fraction of this.fractions) {
        fraction.bedMass[index] = Math.max(0, fraction.bedMass[index]);
        totalBed += fraction.bedMass[index];
        weightedDiameter += fraction.diameter * fraction.bedMass[index];
      }
      this.bedChange[index] = clamp((totalBed - this.initialTotal[index]) / (2650 * 0.6), -0.12, 0.12);
      const meanGrain = totalBed > 0 ? weightedDiameter / totalBed : 0.00028;
      const rippleRoughness = Math.min(0.025, this.bedShear[index] * 0.0015);
      this.bedRoughness[index] = 2.5 * meanGrain + rippleRoughness;
    }
  }

  sample(x: number, z: number, result: SedimentSample): SedimentSample {
    result.sand = this.sand.transport.sample(x, z);
    result.silt = this.silt.transport.sample(x, z);
    result.clay = this.clay.transport.sample(x, z);
    const index = this.indexAt(x, z);
    result.turbidity = result.sand * 80 + result.silt * 450 + result.clay * 1100;
    result.bedChange = this.bedChange[index];
    result.roughness = this.bedRoughness[index];
    result.shear = this.bedShear[index];
    result.deposition = this.deposition[index];
    result.scour = this.scour[index];
    return result;
  }

  reset(): void {
    this.elapsed = 0;
    this.bedChange.fill(0);
    this.bedRoughness.fill(0.002);
    this.bedShear.fill(0);
    this.deposition.fill(0);
    this.scour.fill(0);
    for (const fraction of this.fractions) {
      fraction.transport.reset(0.000002);
      fraction.bedMass.set(fraction.initialBed);
    }
  }

  private createFraction(diameter: number, density: number, criticalShear: number, initialBed: number): SedimentFraction {
    const transport = new ConservativeTransportGrid(this.bounds, this.columns, this.rows);
    transport.reset(0.000002);
    transport.setBoundary(() => 0.000002);
    const relativeDensity = density / 1025 - 1;
    const viscosity = 1.05e-6;
    const denominator = 18 * viscosity + Math.sqrt(0.75 * relativeDensity * 9.80665 * diameter ** 3);
    const settling = relativeDensity * 9.80665 * diameter * diameter / denominator;
    const bed = new Float64Array(this.columns * this.rows).fill(initialBed);
    return { diameter, density, settling, criticalShear, transport, bedMass: bed, initialBed: bed.slice() };
  }

  private transportBedLoad(dt: number, sampleFlow: SedimentFlowSampler): void {
    this.bedDelta.fill(0);
    const grid = this.sand.transport;
    for (let row = 1; row < this.rows - 1; row++) {
      for (let column = 1; column < this.columns - 1; column++) {
        const index = row * this.columns + column;
        const shear = this.bedShear[index];
        if (shear <= this.sand.criticalShear) continue;
        const x = this.bounds.minimumX + (column + 0.5) * grid.cellWidth;
        const z = this.bounds.minimumZ + (row + 0.5) * grid.cellDepth;
        sampleFlow(x, z, this.flow);
        const speed = Math.hypot(this.flow.x, this.flow.z);
        if (speed < 0.001) continue;
        const excess = shear - this.sand.criticalShear;
        const mobility = Math.min(this.sand.bedMass[index] * 0.05, excess ** 1.5 * dt * 0.001);
        const horizontalFraction = Math.abs(this.flow.x) / (Math.abs(this.flow.x) + Math.abs(this.flow.z));
        const neighborX = index + (this.flow.x >= 0 ? 1 : -1);
        const neighborZ = index + (this.flow.z >= 0 ? this.columns : -this.columns);
        this.bedDelta[index] -= mobility;
        this.bedDelta[neighborX] += mobility * horizontalFraction;
        this.bedDelta[neighborZ] += mobility * (1 - horizontalFraction);
      }
    }
    for (let index = 0; index < this.bedDelta.length; index++) this.sand.bedMass[index] = Math.max(0, this.sand.bedMass[index] + this.bedDelta[index]);
  }

  private relaxBedSlope(dt: number): void {
    const grid = this.sand.transport;
    const maximumSlope = Math.tan(32 * Math.PI / 180);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        if (column < this.columns - 1) this.relaxPair(index, index + 1, grid.cellWidth, maximumSlope, dt);
        if (row < this.rows - 1) this.relaxPair(index, index + this.columns, grid.cellDepth, maximumSlope, dt);
      }
    }
  }

  private relaxPair(first: number, second: number, distance: number, maximumSlope: number, dt: number): void {
    const difference = this.bedChange[first] - this.bedChange[second];
    const excess = Math.abs(difference) - distance * maximumSlope;
    if (excess <= 0) return;
    const donor = difference > 0 ? first : second;
    const recipient = difference > 0 ? second : first;
    const moved = Math.min(this.sand.bedMass[donor] * 0.2, excess * 2650 * 0.6 * Math.min(0.5, dt));
    this.sand.bedMass[donor] -= moved;
    this.sand.bedMass[recipient] += moved;
  }

  private indexAt(x: number, z: number): number {
    const column = clamp(Math.floor((x - this.bounds.minimumX) / this.bounds.width * this.columns), 0, this.columns - 1);
    const row = clamp(Math.floor((z - this.bounds.minimumZ) / this.bounds.depth * this.rows), 0, this.rows - 1);
    return row * this.columns + column;
  }
}
