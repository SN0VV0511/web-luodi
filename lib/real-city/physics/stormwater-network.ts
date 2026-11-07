import { clamp, saturate } from "./math";

export type DrainNode = {
  x: number;
  z: number;
  invert: number;
  rim: number;
  area: number;
  storage: number;
  incoming: number;
  surcharge: number;
  outfall: boolean;
  blockage: number;
  sediment: number;
  level: number;
};

export type DrainPipe = {
  from: number;
  to: number;
  length: number;
  diameter: number;
  roughness: number;
  flow: number;
  velocity: number;
  shear: number;
  fullness: number;
  sediment: number;
  initialDiameter: number;
};

export type DrainNetworkBudget = {
  received: number;
  discharged: number;
  surcharged: number;
  stored: number;
  maximumLevel: number;
};

export class StormwaterNetwork {
  readonly nodes: DrainNode[] = [];
  readonly pipes: DrainPipe[] = [];
  readonly budget: DrainNetworkBudget = { received: 0, discharged: 0, surcharged: 0, stored: 0, maximumLevel: 0 };
  private readonly deltas: number[] = [];
  private readonly outgoing: number[] = [];
  private readonly limiters: number[] = [];
  private time = 0;

  addNode(x: number, z: number, surfaceHeight: number, depth: number, area: number, outfall = false): number {
    const index = this.nodes.length;
    this.nodes.push({
      x,
      z,
      invert: surfaceHeight - Math.max(0.2, depth),
      rim: surfaceHeight,
      area: Math.max(0.03, area),
      storage: 0,
      incoming: 0,
      surcharge: 0,
      outfall,
      blockage: 0,
      sediment: 0,
      level: surfaceHeight - Math.max(0.2, depth),
    });
    this.deltas.push(0);
    this.outgoing.push(0);
    this.limiters.push(1);
    return index;
  }

  connect(from: number, to: number, diameter: number, roughness = 0.013): void {
    const first = this.nodes[from];
    const second = this.nodes[to];
    if (!first || !second || from === to) return;
    const length = Math.max(0.5, Math.hypot(first.x - second.x, first.z - second.z));
    this.pipes.push({
      from,
      to,
      length,
      diameter: Math.max(0.04, diameter),
      roughness: Math.max(0.008, roughness),
      flow: 0,
      velocity: 0,
      shear: 0,
      fullness: 0,
      sediment: 0,
      initialDiameter: Math.max(0.04, diameter),
    });
  }

  inflow(nodeIndex: number, cubicMetresPerSecond: number, sedimentConcentration = 0): void {
    const node = this.nodes[nodeIndex];
    if (!node || cubicMetresPerSecond <= 0) return;
    const flow = Math.max(0, cubicMetresPerSecond);
    node.incoming += flow;
    node.sediment += flow * Math.max(0, sedimentConcentration) * 0.1;
  }

  step(dt: number, outfallLevel: number, leafLoading: number): void {
    const duration = clamp(dt, 0, 2);
    if (duration <= 0 || this.nodes.length === 0) return;
    const substeps = Math.max(1, Math.ceil(duration / 0.1));
    const step = duration / substeps;
    for (const node of this.nodes) node.surcharge = 0;
    for (let substep = 0; substep < substeps; substep++) {
      for (let index = 0; index < this.nodes.length; index++) {
        const node = this.nodes[index];
        this.deltas[index] = 0;
        this.outgoing[index] = 0;
        const accepted = node.incoming * step * (1 - node.blockage * 0.85);
        const rejected = node.incoming * step - accepted;
        node.storage += accepted;
        node.surcharge += rejected / duration;
        this.budget.received += accepted + rejected;
        this.budget.surcharged += rejected;
        node.level = node.invert + node.storage / node.area;
        if (node.outfall) node.level = Math.max(node.invert, outfallLevel);
        const deposition = leafLoading * Math.min(0.01, node.incoming) * step * 0.03;
        const flushing = node.storage > 0.02 ? step * 0.0003 : 0;
        node.blockage = clamp(node.blockage + deposition - flushing, 0, 0.85);
      }
      for (const pipe of this.pipes) this.updatePipe(pipe, step);
      for (const pipe of this.pipes) {
        const donor = pipe.flow >= 0 ? pipe.from : pipe.to;
        this.outgoing[donor] += Math.abs(pipe.flow) * step;
      }
      for (let index = 0; index < this.nodes.length; index++) {
        const node = this.nodes[index];
        this.limiters[index] = node.outfall ? 1 : Math.min(1, node.storage / Math.max(1e-9, this.outgoing[index]));
      }
      for (const pipe of this.pipes) {
        const donor = pipe.flow >= 0 ? pipe.from : pipe.to;
        const limited = pipe.flow * this.limiters[donor];
        this.deltas[pipe.from] -= limited * step;
        this.deltas[pipe.to] += limited * step;
        pipe.flow = limited;
      }
      for (let index = 0; index < this.nodes.length; index++) {
        const node = this.nodes[index];
        if (node.outfall) {
          this.budget.discharged += Math.max(0, this.deltas[index]);
          node.storage = 0;
          continue;
        }
        node.storage = Math.max(0, node.storage + this.deltas[index]);
        const capacity = Math.max(0, node.rim - node.invert) * node.area;
        const overflow = Math.max(0, node.storage - capacity);
        if (overflow > 0) {
          node.storage -= overflow;
          node.surcharge += overflow / duration;
          this.budget.surcharged += overflow;
        }
        node.level = node.invert + node.storage / node.area;
      }
    }
    this.budget.stored = 0;
    this.budget.maximumLevel = -Infinity;
    for (const node of this.nodes) {
      node.incoming = 0;
      this.budget.stored += node.storage;
      this.budget.maximumLevel = Math.max(this.budget.maximumLevel, node.level);
    }
    this.time += duration;
  }

  inletCapacity(nodeIndex: number, pondingDepth: number, grateArea: number): number {
    const node = this.nodes[nodeIndex];
    if (!node || pondingDepth <= 0) return 0;
    const openArea = Math.max(0.001, grateArea) * (1 - node.blockage);
    const freeboard = node.rim - node.level;
    const head = Math.max(0, pondingDepth + Math.min(0, freeboard));
    const orifice = 0.62 * openArea * Math.sqrt(2 * 9.80665 * head);
    const perimeter = Math.sqrt(openArea) * 4;
    const weir = 1.66 * perimeter * Math.pow(head, 1.5);
    return Math.min(orifice, weir);
  }

  clearInlet(nodeIndex: number, fraction: number): void {
    const node = this.nodes[nodeIndex];
    if (!node) return;
    node.blockage *= 1 - saturate(fraction);
    node.sediment *= 1 - saturate(fraction) * 0.7;
  }

  reset(): void {
    this.time = 0;
    this.budget.received = 0;
    this.budget.discharged = 0;
    this.budget.surcharged = 0;
    this.budget.stored = 0;
    this.budget.maximumLevel = 0;
    for (const node of this.nodes) {
      node.storage = 0;
      node.incoming = 0;
      node.surcharge = 0;
      node.blockage = 0;
      node.sediment = 0;
      node.level = node.invert;
    }
    for (const pipe of this.pipes) {
      pipe.flow = 0;
      pipe.velocity = 0;
      pipe.shear = 0;
      pipe.fullness = 0;
      pipe.sediment = 0;
      pipe.diameter = pipe.initialDiameter;
    }
  }

  private updatePipe(pipe: DrainPipe, dt: number): void {
    const first = this.nodes[pipe.from];
    const second = this.nodes[pipe.to];
    const waterDepth = Math.max(0, (first.level - first.invert + second.level - second.invert) * 0.5);
    const relativeDepth = clamp(waterDepth / pipe.diameter, 0, 1);
    const angle = 2 * Math.acos(clamp(1 - 2 * relativeDepth, -1, 1));
    const radius = pipe.diameter * 0.5;
    const area = radius * radius * (angle - Math.sin(angle)) * 0.5;
    const perimeter = radius * angle;
    const hydraulicRadius = area / Math.max(0.0001, perimeter);
    const headDifference = first.level - second.level;
    const gradient = headDifference / pipe.length;
    const velocity = Math.sign(gradient) * Math.pow(Math.max(0, hydraulicRadius), 2 / 3) * Math.sqrt(Math.abs(gradient)) / pipe.roughness;
    const targetFlow = area * velocity;
    const inertialTime = Math.max(0.2, pipe.length / Math.max(0.2, Math.sqrt(9.80665 * pipe.diameter)));
    const relaxation = 1 - Math.exp(-dt / inertialTime);
    pipe.flow += (targetFlow - pipe.flow) * relaxation;
    pipe.velocity = area > 1e-8 ? pipe.flow / area : 0;
    pipe.fullness = relativeDepth;
    pipe.shear = 1000 * 9.80665 * hydraulicRadius * Math.abs(gradient);
    const deposition = Math.max(0, 0.6 - Math.abs(pipe.velocity)) * dt * (first.sediment + second.sediment) * 0.0001;
    const scour = Math.max(0, pipe.shear - 1.5) * dt * 0.00001;
    pipe.sediment = clamp(pipe.sediment + deposition - scour, 0, pipe.initialDiameter * 0.2);
    pipe.diameter = Math.max(pipe.initialDiameter * 0.6, pipe.initialDiameter - pipe.sediment * 2);
  }
}
