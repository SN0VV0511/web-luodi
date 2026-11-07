import { clamp, saturate } from "./math";

export type FoamForcing = {
  temperature: number;
  salinity: number;
  organicMatter: number;
  windSpeed: number;
  rainfall: number;
};

export type FoamSample = {
  coverage: number;
  bubbleRadius: number;
  thickness: number;
  age: number;
  brightness: number;
  persistence: number;
};

export type FoamFlow = {
  velocityX: Float32Array;
  velocityZ: Float32Array;
  depth: Float32Array;
  breaking: Float32Array;
};

export function createFoamSample(): FoamSample {
  return { coverage: 0, bubbleRadius: 0.001, thickness: 0, age: 0, brightness: 1, persistence: 0 };
}

export class FoamPopulation {
  readonly small: Float32Array;
  readonly medium: Float32Array;
  readonly large: Float32Array;
  readonly liquid: Float32Array;
  readonly age: Float32Array;
  readonly coverage: Float32Array;
  private readonly nextSmall: Float32Array;
  private readonly nextMedium: Float32Array;
  private readonly nextLarge: Float32Array;
  private readonly nextLiquid: Float32Array;
  private readonly nextAge: Float32Array;
  private readonly outgoing: Float32Array;
  private accumulated = 0;
  private surfaceTension = 0.072;
  private viscosity = 0.001;
  private surfactant = 0;
  private drainageRate = 0.1;
  private elapsed = 0;
  private readonly smallRadius = 0.00045;
  private readonly mediumRadius = 0.0013;
  private readonly largeRadius = 0.0035;

  constructor(readonly columns: number, readonly rows: number, readonly cellX: number, readonly cellZ: number) {
    const size = columns * rows;
    this.small = new Float32Array(size);
    this.medium = new Float32Array(size);
    this.large = new Float32Array(size);
    this.liquid = new Float32Array(size);
    this.age = new Float32Array(size);
    this.coverage = new Float32Array(size);
    this.nextSmall = new Float32Array(size);
    this.nextMedium = new Float32Array(size);
    this.nextLarge = new Float32Array(size);
    this.nextLiquid = new Float32Array(size);
    this.nextAge = new Float32Array(size);
    this.outgoing = new Float32Array(size);
  }

  step(dt: number, forcing: FoamForcing, flow: FoamFlow): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.accumulated += Math.min(0.25, dt);
    if (this.accumulated < 1 / 12) return;
    const elapsed = Math.min(0.25, this.accumulated);
    this.accumulated = 0;
    this.elapsed += elapsed;
    this.updateLiquidProperties(forcing);
    this.transport(elapsed, flow);
    for (let index = 0; index < this.small.length; index++) {
      const depth = flow.depth[index];
      if (depth <= 0.005) {
        this.dryCell(index, elapsed);
        continue;
      }
      this.injectBreaking(index, flow.breaking[index], forcing, elapsed);
      this.coalesce(index, forcing, elapsed);
      this.fragment(index, flow, forcing, elapsed);
      this.drain(index, forcing, elapsed);
      this.dissolve(index, forcing, elapsed);
      const gasVolume = this.small[index] + this.medium[index] + this.large[index];
      this.age[index] = gasVolume > 0.0000001 ? Math.min(240, this.age[index] + elapsed) : 0;
      this.coverage[index] = this.coverageAt(index);
    }
  }

  sample(column: number, row: number, target: FoamSample): FoamSample {
    const x = clamp(column, 0, this.columns - 1);
    const z = clamp(row, 0, this.rows - 1);
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const x1 = Math.min(this.columns - 1, x0 + 1);
    const z1 = Math.min(this.rows - 1, z0 + 1);
    const fx = x - x0;
    const fz = z - z0;
    const a = z0 * this.columns + x0;
    const b = z0 * this.columns + x1;
    const c = z1 * this.columns + x0;
    const d = z1 * this.columns + x1;
    const interpolate = (field: Float32Array) => {
      const lower = field[a] + (field[b] - field[a]) * fx;
      const upper = field[c] + (field[d] - field[c]) * fx;
      return lower + (upper - lower) * fz;
    };
    const small = interpolate(this.small);
    const medium = interpolate(this.medium);
    const large = interpolate(this.large);
    const gas = small + medium + large;
    const liquid = interpolate(this.liquid);
    target.coverage = interpolate(this.coverage);
    target.bubbleRadius = gas > 0.0000001
      ? (small * this.smallRadius + medium * this.mediumRadius + large * this.largeRadius) / gas
      : this.smallRadius;
    target.thickness = Math.min(0.04, gas + liquid);
    target.age = interpolate(this.age);
    const wetFraction = liquid / Math.max(0.0000001, gas + liquid);
    target.brightness = clamp(0.96 - wetFraction * 0.18 - this.surfactant * 0.08, 0.65, 1);
    target.persistence = clamp(this.surfactant * 0.6 + small / Math.max(0.0000001, gas) * 0.4, 0, 1);
    return target;
  }

  reset(): void {
    this.small.fill(0);
    this.medium.fill(0);
    this.large.fill(0);
    this.liquid.fill(0);
    this.age.fill(0);
    this.coverage.fill(0);
    this.accumulated = 0;
    this.elapsed = 0;
  }

  private updateLiquidProperties(forcing: FoamForcing): void {
    const temperature = clamp(forcing.temperature, -2, 40);
    const salinity = clamp(forcing.salinity, 0, 45);
    const organics = Math.max(0, forcing.organicMatter);
    this.surfactant = saturate(organics / (organics + 1.5));
    const freshTension = 0.0756 - 0.00015 * temperature;
    const saltTension = salinity * 0.000033;
    this.surfaceTension = Math.max(0.025, (freshTension + saltTension) * (1 - this.surfactant * 0.45));
    this.viscosity = 0.001792 * Math.exp(-0.025 * temperature) * (1 + salinity * 0.002);
    this.drainageRate = 0.06 * (0.001 / this.viscosity) / (1 + this.surfactant * 5);
  }

  private transport(dt: number, flow: FoamFlow): void {
    this.nextSmall.set(this.small);
    this.nextMedium.set(this.medium);
    this.nextLarge.set(this.large);
    this.nextLiquid.set(this.liquid);
    for (let index = 0; index < this.small.length; index++) {
      this.nextAge[index] = this.age[index] * this.gasAt(index);
    }
    this.outgoing.fill(0);
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        if (column + 1 < this.columns) {
          const next = index + 1;
          const speed = (flow.velocityX[index] + flow.velocityX[next]) * 0.5;
          this.outgoing[speed >= 0 ? index : next] += Math.abs(speed) * dt / this.cellX;
        }
        if (row + 1 < this.rows) {
          const next = index + this.columns;
          const speed = (flow.velocityZ[index] + flow.velocityZ[next]) * 0.5;
          this.outgoing[speed >= 0 ? index : next] += Math.abs(speed) * dt / this.cellZ;
        }
      }
    }
    for (let row = 0; row < this.rows; row++) {
      for (let column = 0; column < this.columns; column++) {
        const index = row * this.columns + column;
        if (column + 1 < this.columns) {
          const next = index + 1;
          const speed = (flow.velocityX[index] + flow.velocityX[next]) * 0.5;
          this.transfer(index, next, speed * dt / this.cellX);
        }
        if (row + 1 < this.rows) {
          const next = index + this.columns;
          const speed = (flow.velocityZ[index] + flow.velocityZ[next]) * 0.5;
          this.transfer(index, next, speed * dt / this.cellZ);
        }
      }
    }
    for (let index = 0; index < this.small.length; index++) {
      this.small[index] = Math.max(0, this.nextSmall[index]);
      this.medium[index] = Math.max(0, this.nextMedium[index]);
      this.large[index] = Math.max(0, this.nextLarge[index]);
      this.liquid[index] = Math.max(0, this.nextLiquid[index]);
      const gas = this.gasAt(index);
      this.age[index] = gas > 0.0000001 ? Math.max(0, this.nextAge[index] / gas) : 0;
    }
  }

  private transfer(a: number, b: number, fraction: number): void {
    const source = fraction >= 0 ? a : b;
    const destination = fraction >= 0 ? b : a;
    const amount = Math.abs(fraction) / Math.max(1, this.outgoing[source]);
    if (amount <= 0) return;
    const move = (input: Float32Array, output: Float32Array) => {
      const volume = input[source] * amount;
      output[source] -= volume;
      output[destination] += volume;
    };
    move(this.small, this.nextSmall);
    move(this.medium, this.nextMedium);
    move(this.large, this.nextLarge);
    move(this.liquid, this.nextLiquid);
    const ageVolume = this.age[source] * this.gasAt(source) * amount;
    this.nextAge[source] -= ageVolume;
    this.nextAge[destination] += ageVolume;
  }

  private injectBreaking(index: number, breaking: number, forcing: FoamForcing, dt: number): void {
    const gas = this.gasAt(index);
    const capacity = Math.max(0, 0.025 - gas);
    const breaker = saturate(breaking);
    const windInput = Math.max(0, forcing.windSpeed - 5) ** 2 * 0.000002;
    const rainInput = forcing.rainfall * 0.000003;
    const input = Math.min(capacity, (breaker * 0.0008 + windInput + rainInput) * dt);
    const smallFraction = 0.3 + this.surfactant * 0.2;
    const largeFraction = 0.3 - this.surfactant * 0.12;
    this.small[index] += input * smallFraction;
    this.medium[index] += input * (1 - smallFraction - largeFraction);
    this.large[index] += input * largeFraction;
    this.liquid[index] += input * (0.22 + this.surfactant * 0.08);
    this.age[index] *= gas / Math.max(0.0000001, gas + input);
  }

  private coalesce(index: number, forcing: FoamForcing, dt: number): void {
    const gas = this.gasAt(index);
    if (gas < 0.0000001) return;
    const wetness = this.liquid[index] / Math.max(0.0000001, gas);
    const collisionFrequency = (0.04 + forcing.windSpeed * 0.008) * saturate(gas / 0.005);
    const filmProtection = 1 / (1 + this.surfactant * 7 + wetness * 4);
    const smallTransfer = this.small[index] * (1 - Math.exp(-collisionFrequency * filmProtection * dt));
    const mediumTransfer = this.medium[index] * (1 - Math.exp(-collisionFrequency * filmProtection * dt * 0.55));
    this.small[index] -= smallTransfer;
    this.medium[index] += smallTransfer - mediumTransfer;
    this.large[index] += mediumTransfer;
    const ripening = Math.min(this.small[index], this.small[index] * dt * 0.006 / (1 + this.surfactant * 4));
    this.small[index] -= ripening;
    this.large[index] += ripening;
  }

  private fragment(index: number, flow: FoamFlow, forcing: FoamForcing, dt: number): void {
    const column = index % this.columns;
    const row = Math.floor(index / this.columns);
    const left = row * this.columns + Math.max(0, column - 1);
    const right = row * this.columns + Math.min(this.columns - 1, column + 1);
    const below = Math.max(0, row - 1) * this.columns + column;
    const above = Math.min(this.rows - 1, row + 1) * this.columns + column;
    const shearX = (flow.velocityZ[right] - flow.velocityZ[left]) / (2 * this.cellX);
    const shearZ = (flow.velocityX[above] - flow.velocityX[below]) / (2 * this.cellZ);
    const dissipation = (shearX * shearX + shearZ * shearZ) * 0.05 + forcing.windSpeed ** 3 * 0.00002;
    const weber = 1025 * dissipation ** (2 / 3) * (2 * this.largeRadius) ** (5 / 3) / this.surfaceTension;
    const fraction = 1 - Math.exp(-Math.max(0, weber - 0.08) * dt * 4);
    const broken = this.large[index] * fraction;
    this.large[index] -= broken;
    this.medium[index] += broken * 0.65;
    this.small[index] += broken * 0.35;
  }

  private drain(index: number, forcing: FoamForcing, dt: number): void {
    const gas = this.gasAt(index);
    if (gas <= 0) return;
    const liquidFraction = this.liquid[index] / Math.max(0.0000001, gas + this.liquid[index]);
    const gravityDrain = this.drainageRate * liquidFraction * liquidFraction;
    const evaporation = Math.max(0, forcing.temperature) * 0.000001 * (1 + forcing.windSpeed * 0.12);
    const removed = Math.min(this.liquid[index], (gravityDrain * gas + evaporation * this.coverageAt(index)) * dt);
    this.liquid[index] -= removed;
    const filmDryness = saturate(1 - liquidFraction / 0.06);
    const rupture = 1 - Math.exp(-filmDryness * dt * 0.5 / (1 + this.surfactant * 8));
    this.large[index] *= 1 - rupture;
    this.medium[index] *= 1 - rupture * 0.6;
    this.small[index] *= 1 - rupture * 0.25;
  }

  private dissolve(index: number, forcing: FoamForcing, dt: number): void {
    const thermal = Math.exp((clamp(forcing.temperature, -2, 40) - 18) * 0.018);
    const stabilization = 1 + this.surfactant * 8 + forcing.salinity * 0.025;
    const smallRate = 0.018 * thermal / stabilization;
    const mediumRate = 0.009 * thermal / stabilization;
    const largeRate = 0.006 * thermal / stabilization;
    this.small[index] *= Math.exp(-dt * smallRate);
    this.medium[index] *= Math.exp(-dt * mediumRate);
    this.large[index] *= Math.exp(-dt * largeRate);
    this.liquid[index] = Math.min(this.liquid[index], this.gasAt(index) * 0.65);
  }

  private dryCell(index: number, dt: number): void {
    const decay = Math.exp(-dt * 1.4);
    this.small[index] *= decay;
    this.medium[index] *= decay;
    this.large[index] *= decay;
    this.liquid[index] *= decay;
    this.age[index] += dt;
    this.coverage[index] = this.coverageAt(index);
  }

  private gasAt(index: number): number {
    return this.small[index] + this.medium[index] + this.large[index];
  }

  private coverageAt(index: number): number {
    const smallArea = this.small[index] * 3 / (4 * this.smallRadius);
    const mediumArea = this.medium[index] * 3 / (4 * this.mediumRadius);
    const largeArea = this.large[index] * 3 / (4 * this.largeRadius);
    return 1 - Math.exp(-(smallArea + mediumArea + largeArea));
  }
}
