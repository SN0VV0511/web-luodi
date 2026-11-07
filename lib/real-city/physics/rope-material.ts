import { clamp, exponentialApproach, saturate, smoothstep } from "./math";

export type RopeClimate = {
  wetness: number;
  temperature: number;
  salt: number;
  ultraviolet: number;
};

export type RopeMaterialState = {
  wetness: number;
  absorbedMass: number;
  lengthScale: number;
  radiusScale: number;
  stiffness: number;
  damping: number;
  breakingLoad: number;
  fatigue: number;
  creep: number;
  ice: number;
  fray: number;
  strainEnergy: number;
};

export class BraidedRopeMaterial {
  readonly state: RopeMaterialState = {
    wetness: 0,
    absorbedMass: 0,
    lengthScale: 1,
    radiusScale: 1,
    stiffness: 12000,
    damping: 1.5,
    breakingLoad: 4500,
    fatigue: 0,
    creep: 0,
    ice: 0,
    fray: 0,
    strainEnergy: 0,
  };
  private previousTension = 0;
  private tensionRate = 0;
  private cycleMaximum = 0;
  private cycleMinimum = 0;
  private priorDirection = 0;
  private ultravioletDose = 0;
  private saltLoading = 0;
  private abrasion = 0;
  private readonly area: number;
  private readonly baseStiffness: number;
  private readonly baseBreakingLoad: number;

  constructor(readonly radius: number, readonly naturalFibre = true) {
    this.area = Math.PI * radius * radius;
    this.baseStiffness = this.area * (naturalFibre ? 1.2e7 : 3.2e7);
    this.baseBreakingLoad = this.area * (naturalFibre ? 4.5e6 : 1.2e7);
    this.state.stiffness = this.baseStiffness;
    this.state.breakingLoad = this.baseBreakingLoad;
  }

  step(dt: number, tension: number, climate: RopeClimate): RopeMaterialState {
    const duration = clamp(dt, 0, 1);
    const state = this.state;
    const targetWetness = saturate(climate.wetness);
    const absorptionRate = targetWetness > state.wetness ? 0.035 : 0.004;
    state.wetness = exponentialApproach(state.wetness, targetWetness, absorptionRate, duration);
    state.absorbedMass = state.wetness * (this.naturalFibre ? 0.65 : 0.12);
    const cold = 1 - smoothstep(-5, 0.5, climate.temperature);
    state.ice = exponentialApproach(state.ice, state.wetness * cold, cold > 0.5 ? 0.06 : 0.1, duration);
    const normalizedTension = Math.max(0, tension) / Math.max(1, this.baseBreakingLoad);
    const creepRate = Math.max(0, normalizedTension - 0.05) ** 2 * (1 + state.wetness * 0.6) * 0.00002;
    const recovery = Math.max(0, 0.03 - normalizedTension) * state.creep * 0.0001;
    state.creep = clamp(state.creep + (creepRate - recovery) * duration, 0, 0.08);
    this.detectFatigue(tension, duration);
    this.ultravioletDose += Math.max(0, climate.ultraviolet) * duration;
    this.saltLoading = clamp(this.saltLoading + Math.max(0, climate.salt) * duration - state.wetness * duration * 0.00001, 0, 1);
    const uvLoss = 1 - Math.exp(-this.ultravioletDose * (this.naturalFibre ? 0.0000003 : 0.0000006));
    const moistureStrength = this.naturalFibre ? 1 - state.wetness * 0.15 : 1 - state.wetness * 0.05;
    const weatherStrength = (1 - uvLoss * 0.5) * (1 - this.saltLoading * 0.1) * (1 - state.fatigue * 0.7);
    state.breakingLoad = Math.max(this.baseBreakingLoad * 0.15, this.baseBreakingLoad * moistureStrength * weatherStrength);
    const crimp = 1 - Math.exp(-normalizedTension * 12);
    const wetSoftening = this.naturalFibre ? 1 - state.wetness * 0.3 : 1 - state.wetness * 0.1;
    state.stiffness = this.baseStiffness * (0.35 + crimp * 0.65) * wetSoftening * (1 + state.ice * 3);
    state.damping = 1.2 + state.wetness * 1.4 + state.fatigue * 0.6;
    state.lengthScale = 1 + state.creep + state.wetness * (this.naturalFibre ? -0.008 : 0.004);
    const poisson = 0.32;
    const elasticStrain = tension / Math.max(1, state.stiffness);
    state.radiusScale = clamp(1 + state.wetness * 0.035 + state.ice * 0.05 - elasticStrain * poisson, 0.85, 1.12);
    state.fray = saturate(state.fatigue * 0.7 + this.abrasion * 0.4 + uvLoss * 0.2);
    state.strainEnergy = tension * tension / Math.max(2, state.stiffness * 2);
    this.previousTension = tension;
    return state;
  }

  recordAbrasion(normalForce: number, slidingDistance: number, surfaceRoughness: number): void {
    const energy = Math.max(0, normalForce) * Math.max(0, slidingDistance) * Math.max(0, surfaceRoughness);
    this.abrasion = clamp(this.abrasion + energy / Math.max(1, this.baseBreakingLoad * 100), 0, 1);
  }

  compliance(segmentLength: number): number {
    return Math.max(1e-9, segmentLength / Math.max(1, this.state.stiffness));
  }

  reset(): void {
    this.state.wetness = 0;
    this.state.absorbedMass = 0;
    this.state.lengthScale = 1;
    this.state.radiusScale = 1;
    this.state.stiffness = this.baseStiffness;
    this.state.damping = 1.5;
    this.state.breakingLoad = this.baseBreakingLoad;
    this.state.fatigue = 0;
    this.state.creep = 0;
    this.state.ice = 0;
    this.state.fray = 0;
    this.state.strainEnergy = 0;
    this.previousTension = 0;
    this.tensionRate = 0;
    this.cycleMaximum = 0;
    this.cycleMinimum = 0;
    this.priorDirection = 0;
    this.ultravioletDose = 0;
    this.saltLoading = 0;
    this.abrasion = 0;
  }

  private detectFatigue(tension: number, dt: number): void {
    const change = tension - this.previousTension;
    this.tensionRate = exponentialApproach(this.tensionRate, change / Math.max(0.001, dt), 8, dt);
    const direction = Math.sign(this.tensionRate);
    if (direction !== 0 && direction !== this.priorDirection) {
      if (this.priorDirection > 0) this.cycleMaximum = this.previousTension;
      else if (this.priorDirection < 0) {
        this.cycleMinimum = this.previousTension;
        const range = Math.max(0, this.cycleMaximum - this.cycleMinimum);
        const relative = range / Math.max(1, this.baseBreakingLoad);
        const damage = Math.pow(relative, 3.5) * 0.0005;
        this.state.fatigue = saturate(this.state.fatigue + damage);
      }
      this.priorDirection = direction;
    }
  }
}
