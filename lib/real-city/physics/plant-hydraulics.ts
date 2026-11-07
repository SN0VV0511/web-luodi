import { clamp, exponentialApproach, saturate, smoothstep } from "./math";

export type RootWaterSupply = {
  potential: number;
  conductivity: number;
  temperature: number;
  oxygen: number;
  salinity: number;
};

export type PlantHydraulicState = {
  rootPotential: number;
  stemPotential: number;
  leafPotential: number;
  rootFlow: number;
  stemFlow: number;
  leafFlow: number;
  transpiration: number;
  storedWater: number;
  relativeWaterContent: number;
  turgor: number;
  embolism: number;
  conductivity: number;
  wiltAngle: number;
  rootGrowth: number;
  carbonReserve: number;
  canopyDemand: number;
  waterDeficit: number;
};

export class PlantHydraulics {
  readonly state: PlantHydraulicState = {
    rootPotential: -0.2,
    stemPotential: -0.25,
    leafPotential: -0.3,
    rootFlow: 0,
    stemFlow: 0,
    leafFlow: 0,
    transpiration: 0,
    storedWater: 0.15,
    relativeWaterContent: 0.9,
    turgor: 0.8,
    embolism: 0,
    conductivity: 1,
    wiltAngle: 0,
    rootGrowth: 0.2,
    carbonReserve: 0.3,
    canopyDemand: 0,
    waterDeficit: 0,
  };
  private readonly reservoir = new Float64Array(3);
  private readonly capacitance = new Float64Array(3);
  private readonly potential = new Float64Array(3);
  private readonly flux = new Float64Array(3);
  private readonly conductivity = new Float64Array(3);
  private readonly initialStorage = new Float64Array(3);
  private readonly maximumStorage = new Float64Array(3);
  private readonly matrix = new Float64Array(9);
  private readonly right = new Float64Array(3);
  private readonly solution = new Float64Array(3);
  private minimumLeafPotential = -0.3;
  private accumulatedStress = 0;
  private coldDamage = 0;
  private reserveSugar = 0.3;
  private acclimatedRoot = 0.2;
  private priorTemperature = 18;

  constructor(readonly height: number, readonly leafArea: number, readonly evergreen: boolean) {
    const size = Math.max(0.2, height);
    this.capacitance[0] = 0.08 * size;
    this.capacitance[1] = 0.12 * size;
    this.capacitance[2] = 0.025 * Math.max(0.1, leafArea);
    this.maximumStorage[0] = 0.12 * size;
    this.maximumStorage[1] = 0.18 * size;
    this.maximumStorage[2] = 0.045 * Math.max(0.1, leafArea);
    for (let index = 0; index < 3; index++) this.initialStorage[index] = this.maximumStorage[index] * 0.85;
    this.reset();
  }

  step(dt: number, supply: RootWaterSupply, transpirationPerArea: number, carbonExport: number, retainedLeaves: number): PlantHydraulicState {
    const duration = clamp(dt, 0, 120);
    if (duration <= 0) return this.state;
    const state = this.state;
    const activeArea = Math.max(0.01, this.leafArea * saturate(retainedLeaves));
    const requestedTranspiration = Math.max(0, transpirationPerArea) * activeArea;
    const thermal = smoothstep(-1, 12, supply.temperature) * (1 - smoothstep(34, 46, supply.temperature));
    const oxygen = clamp(supply.oxygen, 0.05, 1);
    const osmotic = Math.max(0, supply.salinity) * 0.036;
    const soilPotential = clamp(supply.potential - osmotic, -12, 0.2);
    const growthFactor = 0.7 + this.acclimatedRoot * 0.6;
    const rootConductance = Math.max(1e-7, 0.0012 * growthFactor * supply.conductivity * thermal * oxygen);
    const vulnerability = this.vulnerability(state.stemPotential);
    const stemConductance = Math.max(1e-7, 0.0015 * vulnerability * (1 - state.embolism) / Math.max(0.4, this.height));
    const leafConductance = Math.max(1e-7, 0.001 * this.vulnerability(state.leafPotential) * activeArea);
    this.conductivity[0] = rootConductance;
    this.conductivity[1] = stemConductance;
    this.conductivity[2] = leafConductance;
    const gravitationalHead = this.height * 0.00980665;
    const priorRoot = this.potential[0];
    const priorStem = this.potential[1];
    const priorLeaf = this.potential[2];
    this.matrix.fill(0);
    this.matrix[0] = this.capacitance[0] / duration + rootConductance + stemConductance;
    this.matrix[1] = -stemConductance;
    this.matrix[3] = -stemConductance;
    this.matrix[4] = this.capacitance[1] / duration + stemConductance + leafConductance;
    this.matrix[5] = -leafConductance;
    this.matrix[7] = -leafConductance;
    this.matrix[8] = this.capacitance[2] / duration + leafConductance;
    this.right[0] = this.capacitance[0] / duration * priorRoot + rootConductance * soilPotential + stemConductance * gravitationalHead * 0.5;
    this.right[1] = this.capacitance[1] / duration * priorStem + (leafConductance - stemConductance) * gravitationalHead * 0.5;
    this.right[2] = this.capacitance[2] / duration * priorLeaf - leafConductance * gravitationalHead * 0.5 - requestedTranspiration;
    this.solveNetwork();
    for (let index = 0; index < 3; index++) this.potential[index] = clamp(this.solution[index], -12, 0.2);
    this.flux[0] = rootConductance * (soilPotential - this.potential[0]);
    this.flux[1] = stemConductance * (this.potential[0] - this.potential[1] - gravitationalHead * 0.5);
    this.flux[2] = leafConductance * (this.potential[1] - this.potential[2] - gravitationalHead * 0.5);
    const rootChange = (this.flux[0] - this.flux[1]) * duration;
    const stemChange = (this.flux[1] - this.flux[2]) * duration;
    const leafChange = (this.flux[2] - requestedTranspiration) * duration;
    this.reservoir[0] = clamp(this.reservoir[0] + rootChange, 0, this.maximumStorage[0]);
    this.reservoir[1] = clamp(this.reservoir[1] + stemChange, 0, this.maximumStorage[1]);
    this.reservoir[2] = clamp(this.reservoir[2] + leafChange, 0, this.maximumStorage[2]);
    state.rootPotential = this.potential[0];
    state.stemPotential = this.potential[1];
    state.leafPotential = this.potential[2];
    state.rootFlow = this.flux[0];
    state.stemFlow = this.flux[1];
    state.leafFlow = this.flux[2];
    state.transpiration = requestedTranspiration;
    state.storedWater = this.reservoir[0] + this.reservoir[1] + this.reservoir[2];
    const totalCapacity = this.maximumStorage[0] + this.maximumStorage[1] + this.maximumStorage[2];
    const reservoirContent = state.storedWater / totalCapacity;
    const pressureContent = this.relativeContent(state.leafPotential);
    state.relativeWaterContent = saturate(reservoirContent * 0.4 + pressureContent * 0.6);
    state.turgor = this.turgor(state.leafPotential, state.relativeWaterContent);
    this.minimumLeafPotential = Math.min(this.minimumLeafPotential, state.leafPotential);
    const cavitation = saturate((1 - this.vulnerability(state.stemPotential)) - state.embolism);
    state.embolism = clamp(state.embolism + cavitation * duration * 0.0004, 0, 0.95);
    const refill = supply.potential > -0.4 && requestedTranspiration < 0.00001 ? thermal * duration * 0.000015 : 0;
    state.embolism = Math.max(0, state.embolism - refill * this.reserveSugar);
    state.conductivity = stemConductance / Math.max(0.0001, 0.0015 / Math.max(0.4, this.height));
    const wilt = (1 - smoothstep(0.05, 0.7, state.turgor)) * 0.9;
    state.wiltAngle = exponentialApproach(state.wiltAngle, wilt, 0.025, duration);
    const stress = Math.max(0, -state.leafPotential - 1.2);
    this.accumulatedStress += stress * duration;
    this.accumulatedStress *= Math.exp(-duration * 0.0001);
    if (supply.temperature < -4 && this.priorTemperature >= -4) this.coldDamage = Math.min(0.5, this.coldDamage + 0.025);
    this.coldDamage *= Math.exp(-thermal * duration * 0.000005);
    this.priorTemperature = supply.temperature;
    const maintenance = (0.000001 + this.height * 0.0000005) * Math.pow(2, (supply.temperature - 20) / 10);
    const received = Math.max(0, carbonExport) * activeArea;
    this.reserveSugar = clamp(this.reserveSugar + (received - maintenance) * duration, 0, 1);
    const rootAllocation = this.reserveSugar * thermal * oxygen * (0.2 + stress * 0.2) * 0.00001;
    this.acclimatedRoot = clamp(this.acclimatedRoot + rootAllocation * duration - this.coldDamage * duration * 0.00001, 0.05, 1);
    state.rootGrowth = this.acclimatedRoot;
    state.carbonReserve = this.reserveSugar;
    state.canopyDemand = requestedTranspiration;
    state.waterDeficit = saturate(1 - state.relativeWaterContent + this.accumulatedStress * 0.00001);
    return state;
  }

  reset(): void {
    this.reservoir.set(this.initialStorage);
    this.potential.set([-0.2, -0.25, -0.3]);
    this.flux.fill(0);
    this.minimumLeafPotential = -0.3;
    this.accumulatedStress = 0;
    this.coldDamage = 0;
    this.reserveSugar = 0.3;
    this.acclimatedRoot = 0.2;
    this.priorTemperature = 18;
    this.state.rootPotential = -0.2;
    this.state.stemPotential = -0.25;
    this.state.leafPotential = -0.3;
    this.state.rootFlow = 0;
    this.state.stemFlow = 0;
    this.state.leafFlow = 0;
    this.state.transpiration = 0;
    this.state.storedWater = this.initialStorage[0] + this.initialStorage[1] + this.initialStorage[2];
    this.state.relativeWaterContent = 0.9;
    this.state.turgor = 0.8;
    this.state.embolism = 0;
    this.state.conductivity = 1;
    this.state.wiltAngle = 0;
    this.state.rootGrowth = 0.2;
    this.state.carbonReserve = 0.3;
    this.state.canopyDemand = 0;
    this.state.waterDeficit = 0;
  }

  private vulnerability(potential: number): number {
    const midpoint = this.evergreen ? -3.4 : -2.3;
    const slope = this.evergreen ? 1.8 : 2.3;
    return 1 / (1 + Math.exp(-(potential - midpoint) * slope));
  }

  private relativeContent(potential: number): number {
    const osmoticPotential = this.evergreen ? -1.8 : -1.35;
    if (potential > osmoticPotential) return clamp(0.82 + (potential - osmoticPotential) * 0.12, 0, 1);
    return clamp(osmoticPotential / Math.min(-0.01, potential) * 0.82, 0, 0.82);
  }

  private turgor(potential: number, relativeContent: number): number {
    const osmotic = (this.evergreen ? -1.8 : -1.35) / Math.max(0.2, relativeContent);
    return clamp(potential - osmotic, 0, 2.5);
  }

  private solveNetwork(): void {
    const a = this.matrix;
    const b = this.right;
    const lowerMultiplier = a[3] / Math.max(1e-12, a[0]);
    a[4] -= lowerMultiplier * a[1];
    b[1] -= lowerMultiplier * b[0];
    const bottomMultiplier = a[7] / Math.max(1e-12, a[4]);
    a[8] -= bottomMultiplier * a[5];
    b[2] -= bottomMultiplier * b[1];
    this.solution[2] = b[2] / Math.max(1e-12, a[8]);
    this.solution[1] = (b[1] - a[5] * this.solution[2]) / Math.max(1e-12, a[4]);
    this.solution[0] = (b[0] - a[1] * this.solution[1]) / Math.max(1e-12, a[0]);
  }
}
