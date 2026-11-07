import { clamp, GRAVITY, saturate } from "./math";

export type WaveWind = {
  speed: number;
  directionX: number;
  directionZ: number;
  fetch: number;
  temperature: number;
};

export type SpectralWaveSample = {
  elevation: number;
  slopeX: number;
  slopeZ: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  driftX: number;
  driftZ: number;
  breaking: number;
  significantHeight: number;
  peakPeriod: number;
};

type WaveDispersion = { waveNumber: number; groupSpeed: number; phaseSpeed: number };

type SpectralMode = {
  frequency: number;
  bandwidth: number;
  directionOffset: number;
  directionalWeight: number;
  energy: number;
  targetEnergy: number;
  phase: number;
  accumulatedPhase: number;
  directionX: number;
  directionZ: number;
  deepWaveNumber: number;
  dispersionCache: Map<number, WaveDispersion>;
};

export function createSpectralWaveSample(): SpectralWaveSample {
  return {
    elevation: 0,
    slopeX: 0,
    slopeZ: 0,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    driftX: 0,
    driftZ: 0,
    breaking: 0,
    significantHeight: 0,
    peakPeriod: 5,
  };
}

export class DirectionalWaveSpectrum {
  private readonly modes: SpectralMode[] = [];
  private lastSeconds: number | undefined;
  private windAngle = 0;
  private smoothedWind = 2;
  private peakFrequency = 1.1;
  private totalEnergy = 0;
  private whitecapFraction = 0;
  private viscosity = 0.000001;
  private readonly ray = { directionX: 0, directionZ: 1, attenuation: 1 };
  private readonly dispersion = { waveNumber: 0, groupSpeed: 0, phaseSpeed: 0 };

  constructor(readonly frequencyBands = 6, readonly directionsPerBand = 3) {
    const bands = Math.max(3, Math.min(10, Math.floor(frequencyBands)));
    const directions = Math.max(1, Math.min(5, Math.floor(directionsPerBand)));
    const minimum = 0.62;
    const maximum = 7.6;
    const ratio = (maximum / minimum) ** (1 / bands);
    for (let band = 0; band < bands; band++) {
      const lower = minimum * ratio ** band;
      const upper = lower * ratio;
      const frequency = Math.sqrt(lower * upper);
      const dispersionCache = new Map<number, WaveDispersion>();
      let directionalSum = 0;
      const start = this.modes.length;
      for (let direction = 0; direction < directions; direction++) {
        const fraction = directions === 1 ? 0 : direction / (directions - 1) * 2 - 1;
        const angle = fraction * 0.72;
        const weight = Math.cos(angle) ** 6;
        directionalSum += weight;
        this.modes.push({
          frequency,
          bandwidth: upper - lower,
          directionOffset: angle,
          directionalWeight: weight,
          energy: 0,
          targetEnergy: 0,
          phase: ((band * 2.3999632297 + direction * 1.6180339887) % (Math.PI * 2)),
          accumulatedPhase: 0,
          directionX: Math.cos(angle),
          directionZ: Math.sin(angle),
          deepWaveNumber: frequency * frequency / GRAVITY,
          dispersionCache,
        });
      }
      for (let index = start; index < this.modes.length; index++) {
        this.modes[index].directionalWeight /= directionalSum;
      }
    }
  }

  update(seconds: number, wind: WaveWind): void {
    if (!Number.isFinite(seconds)) return;
    const first = this.lastSeconds === undefined || seconds < this.lastSeconds;
    const elapsed = first ? 0 : clamp(seconds - (this.lastSeconds ?? seconds), 0, 0.5);
    if (!first && elapsed === 0) return;
    this.lastSeconds = seconds;
    const targetAngle = Math.atan2(wind.directionZ, wind.directionX);
    if (first) {
      this.windAngle = targetAngle;
      this.smoothedWind = Math.max(0.2, wind.speed);
    } else {
      const angleDifference = Math.atan2(Math.sin(targetAngle - this.windAngle), Math.cos(targetAngle - this.windAngle));
      this.windAngle += angleDifference * (1 - Math.exp(-elapsed * 0.08));
      this.smoothedWind += (Math.max(0.2, wind.speed) - this.smoothedWind) * (1 - Math.exp(-elapsed * 0.1));
    }
    const fetch = clamp(wind.fetch, 50, 30000);
    const nondimensionalFetch = GRAVITY * fetch / (this.smoothedWind * this.smoothedWind);
    const peak = 22 * (GRAVITY * GRAVITY / (this.smoothedWind * fetch)) ** (1 / 3);
    this.peakFrequency = clamp(peak, 0.7, 4.8);
    const alpha = clamp(0.076 * nondimensionalFetch ** -0.22, 0.001, 0.012);
    this.viscosity = 0.000001792 * Math.exp(-0.025 * clamp(wind.temperature, -1, 35));
    this.totalEnergy = 0;
    let breakingEnergy = 0;
    for (const mode of this.modes) {
      const density = this.jonswapDensity(mode.frequency, alpha, this.peakFrequency);
      mode.targetEnergy = density * mode.bandwidth * mode.directionalWeight * 0.1;
      const angle = this.windAngle + mode.directionOffset;
      mode.directionX = Math.cos(angle);
      mode.directionZ = Math.sin(angle);
      if (first) {
        mode.energy = mode.targetEnergy;
        mode.accumulatedPhase = (mode.frequency * seconds) % (Math.PI * 2);
      } else {
        const phaseSpeed = GRAVITY / mode.frequency;
        const windRatio = this.smoothedWind / Math.max(0.1, phaseSpeed);
        const inputRate = 0.035 + Math.max(0, windRatio - 0.7) * 0.08;
        const adjustment = mode.targetEnergy > mode.energy ? inputRate : 0.018;
        mode.energy += (mode.targetEnergy - mode.energy) * (1 - Math.exp(-elapsed * adjustment));
        const amplitude = Math.sqrt(Math.max(0, mode.energy) * 2);
        const steepness = amplitude * mode.deepWaveNumber;
        const excess = Math.max(0, steepness - 0.23);
        const viscousDamping = 2 * this.viscosity * mode.deepWaveNumber * mode.deepWaveNumber;
        mode.energy *= Math.exp(-elapsed * (viscousDamping + excess * excess * mode.frequency * 0.4));
        mode.accumulatedPhase = (mode.accumulatedPhase + mode.frequency * elapsed) % (Math.PI * 2);
      }
      this.totalEnergy += mode.energy;
      breakingEnergy += mode.energy * saturate(Math.sqrt(mode.energy * 2) * mode.deepWaveNumber / 0.3);
    }
    this.whitecapFraction = this.totalEnergy > 0 ? breakingEnergy / this.totalEnergy : 0;
  }

  sample(
    x: number,
    z: number,
    depth: number,
    shelter: number,
    gradientX: number,
    gradientZ: number,
    result: SpectralWaveSample,
  ): SpectralWaveSample {
    result.elevation = 0;
    result.slopeX = 0;
    result.slopeZ = 0;
    result.velocityX = 0;
    result.velocityY = 0;
    result.velocityZ = 0;
    result.driftX = 0;
    result.driftZ = 0;
    result.breaking = 0;
    let localVariance = 0;
    const waterDepth = Math.max(0.12, depth);
    const shelterAmplitude = Math.sqrt(Math.max(0.05, 1 - shelter * 0.82));
    for (const mode of this.modes) {
      this.localDispersion(mode, waterDepth);
      const k = this.dispersion.waveNumber;
      const groupSpeed = this.dispersion.groupSpeed;
      const deepGroup = GRAVITY / (2 * mode.frequency);
      const shoaling = clamp(Math.sqrt(deepGroup / Math.max(0.08, groupSpeed)), 0.65, 1.9);
      this.refract(mode.directionX, mode.directionZ, k, waterDepth, gradientX, gradientZ);
      const directionX = this.ray.directionX;
      const directionZ = this.ray.directionZ;
      const offshoreAmplitude = Math.sqrt(mode.energy * 2);
      const transformedAmplitude = offshoreAmplitude * shoaling * shelterAmplitude * this.ray.attenuation;
      const depthLimit = waterDepth * 0.39 / Math.sqrt(this.modes.length);
      const steepnessLimit = 0.3 / (k * Math.sqrt(this.modes.length));
      const amplitude = Math.min(transformedAmplitude, depthLimit, steepnessLimit);
      const removed = Math.max(0, transformedAmplitude - amplitude);
      const phase = k * (x * directionX + z * directionZ) - mode.accumulatedPhase + mode.phase;
      const sine = Math.sin(phase);
      const cosine = Math.cos(phase);
      const kd = Math.min(30, k * waterDepth);
      const hyperbolic = 1 / Math.max(0.08, Math.tanh(kd));
      result.elevation += amplitude * sine;
      result.slopeX += amplitude * k * cosine * directionX;
      result.slopeZ += amplitude * k * cosine * directionZ;
      result.velocityY -= amplitude * mode.frequency * cosine;
      const horizontal = amplitude * mode.frequency * sine * hyperbolic;
      result.velocityX += horizontal * directionX;
      result.velocityZ += horizontal * directionZ;
      const finiteDepthDrift = kd > 10 ? 1 : Math.cosh(2 * kd) / Math.max(0.1, 2 * Math.sinh(kd) ** 2);
      const stokes = amplitude * amplitude * mode.frequency * k * finiteDepthDrift;
      result.driftX += stokes * directionX;
      result.driftZ += stokes * directionZ;
      result.breaking += removed * k * 3 + Math.max(0, sine) * amplitude * k * 0.4;
      localVariance += amplitude * amplitude * 0.5;
    }
    result.significantHeight = 4 * Math.sqrt(localVariance);
    result.peakPeriod = Math.PI * 2 / this.peakFrequency;
    result.breaking = saturate(result.breaking + this.whitecapFraction * (1 - shelter) * 0.12);
    return result;
  }

  reset(): void {
    this.lastSeconds = undefined;
    this.totalEnergy = 0;
    this.whitecapFraction = 0;
    for (const mode of this.modes) {
      mode.energy = 0;
      mode.targetEnergy = 0;
      mode.accumulatedPhase = 0;
    }
  }

  private jonswapDensity(frequency: number, alpha: number, peak: number): number {
    const ratio = peak / frequency;
    const sigma = frequency <= peak ? 0.07 : 0.09;
    const peakShape = Math.exp(-((frequency - peak) ** 2) / (2 * sigma * sigma * peak * peak));
    const phillips = alpha * GRAVITY * GRAVITY * frequency ** -5;
    const lowFrequency = Math.exp(-1.25 * ratio ** 4);
    const enhancement = 3.3 ** peakShape;
    return phillips * lowFrequency * enhancement;
  }

  private localDispersion(mode: SpectralMode, depth: number): void {
    const cache = mode.dispersionCache;
    const cached = cache.get(depth);
    if (cached) {
      cache.delete(depth);
      cache.set(depth, cached);
      this.dispersion.waveNumber = cached.waveNumber;
      this.dispersion.groupSpeed = cached.groupSpeed;
      this.dispersion.phaseSpeed = cached.phaseSpeed;
      return;
    }
    const quantizedDepth = Math.round(depth * 10) / 10;
    let k = Math.max(mode.deepWaveNumber, mode.frequency / Math.sqrt(GRAVITY * Math.max(0.1, quantizedDepth)));
    for (let iteration = 0; iteration < 5; iteration++) {
      const kd = Math.min(30, k * Math.max(0.1, quantizedDepth));
      const tanh = Math.tanh(kd);
      const derivative = GRAVITY * (tanh + kd * (1 - tanh * tanh));
      const residual = GRAVITY * k * tanh - mode.frequency * mode.frequency;
      const next = k - residual / Math.max(0.01, derivative);
      k = clamp(next, mode.deepWaveNumber, mode.deepWaveNumber * 30);
      if (Math.abs(residual) < 0.00001) break;
    }
    const kd = Math.min(30, k * depth);
    const phaseSpeed = mode.frequency / k;
    const ratio = kd > 15 ? 0 : 2 * kd / Math.max(0.0001, Math.sinh(2 * kd));
    const groupSpeed = phaseSpeed * 0.5 * (1 + ratio);
    if (cache.size >= 2048) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(depth, { waveNumber: k, groupSpeed, phaseSpeed });
    this.dispersion.waveNumber = k;
    this.dispersion.groupSpeed = groupSpeed;
    this.dispersion.phaseSpeed = phaseSpeed;
  }

  private refract(
    directionX: number,
    directionZ: number,
    waveNumber: number,
    depth: number,
    gradientX: number,
    gradientZ: number,
  ): void {
    const gradientLength = Math.hypot(gradientX, gradientZ);
    if (gradientLength < 0.00001) {
      this.ray.directionX = directionX;
      this.ray.directionZ = directionZ;
      this.ray.attenuation = 1;
      return;
    }
    const normalX = gradientX / gradientLength;
    const normalZ = gradientZ / gradientLength;
    const tangentX = -normalZ;
    const tangentZ = normalX;
    const incidentTangent = directionX * tangentX + directionZ * tangentZ;
    const incidentNormal = directionX * normalX + directionZ * normalZ;
    const depthFactor = Math.sqrt(Math.tanh(waveNumber * depth));
    const refractedTangent = clamp(incidentTangent * depthFactor, -0.99, 0.99);
    const refractedNormal = Math.sqrt(1 - refractedTangent * refractedTangent) * (incidentNormal >= 0 ? 1 : -1);
    const blend = saturate(gradientLength * 5) * (1 - Math.exp(-1 / Math.max(0.1, depth)));
    let dx = directionX + (refractedTangent * tangentX + refractedNormal * normalX - directionX) * blend;
    let dz = directionZ + (refractedTangent * tangentZ + refractedNormal * normalZ - directionZ) * blend;
    const length = Math.max(0.0001, Math.hypot(dx, dz));
    dx /= length;
    dz /= length;
    this.ray.directionX = dx;
    this.ray.directionZ = dz;
    this.ray.attenuation = clamp(Math.sqrt((Math.abs(incidentNormal) + 0.1) / (Math.abs(refractedNormal) + 0.1)), 0.6, 1.3);
  }
}
