import * as THREE from "three";

export type RenderQuality = {
  pixelRatio: number;
  contactShadows: boolean;
  bloom: boolean;
  shadowSize: number;
};

export type FrameTiming = {
  median: number;
  percentile90: number;
  samples: number;
};

export class CityRenderQuality {
  private readonly durations = new Float32Array(90);
  private readonly sorted = new Float32Array(90);
  private sampleCount = 0;
  private sampleCursor = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private changedAt = 0;
  private evaluatedAt = 0;
  private previousFrame = 0;
  private resolutionScale = 1;
  private width = 1;
  private height = 1;
  private deviceRatio = 1;
  private effects = true;
  private readonly maximumPixels: number;
  private readonly maximumRatio: number;
  private readonly hasFloatTargets: boolean;
  readonly state: RenderQuality;

  constructor(renderer: THREE.WebGLRenderer, compact: boolean) {
    this.maximumPixels = compact ? 1_100_000 : 2_000_000;
    this.maximumRatio = compact ? 1.35 : 1.5;
    this.hasFloatTargets = renderer.extensions.has("EXT_color_buffer_float");
    this.state = {
      pixelRatio: 1,
      contactShadows: this.hasFloatTargets,
      bloom: this.hasFloatTargets,
      shadowSize: compact ? 1024 : 1536,
    };
  }

  resize(width: number, height: number, deviceRatio: number): boolean {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.deviceRatio = Math.max(0.5, Math.min(4, deviceRatio));
    const changed = this.recalculate();
    this.resetSamples();
    return changed;
  }

  observe(now: number, animationActive: boolean, gpuMilliseconds = 0): boolean {
    if (!animationActive) {
      this.previousFrame = 0;
      return false;
    }
    if (this.previousFrame === 0) {
      this.previousFrame = now;
      return false;
    }
    const milliseconds = now - this.previousFrame;
    this.previousFrame = now;
    if (milliseconds <= 0 || milliseconds > 2000) return false;
    this.durations[this.sampleCursor] = Math.min(milliseconds, 250);
    this.sampleCursor = (this.sampleCursor + 1) % this.durations.length;
    this.sampleCount = Math.min(this.sampleCount + 1, this.durations.length);
    if (this.sampleCount < 60 || now - this.evaluatedAt < 2000) return false;
    this.evaluatedAt = now;
    const timing = this.timing();
    const slow = timing.median > 29 || timing.percentile90 > 45 || gpuMilliseconds > 24;
    const fast = timing.median < 18.5 && timing.percentile90 < 23
      && (gpuMilliseconds <= 0 || gpuMilliseconds < 16);
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    this.fastWindows = fast ? this.fastWindows + 1 : 0;
    if (now - this.changedAt < 6000) return false;
    if (this.slowWindows >= 2) {
      if (this.resolutionScale > 0.62) {
        this.resolutionScale = Math.max(0.62, this.resolutionScale - 0.12);
      } else if (this.effects) {
        this.effects = false;
      } else {
        return false;
      }
    } else if (this.fastWindows >= 5) {
      if (!this.effects) {
        this.effects = true;
      } else if (this.resolutionScale < 1) {
        this.resolutionScale = Math.min(1, this.resolutionScale + 0.06);
      } else {
        return false;
      }
    } else {
      return false;
    }
    this.changedAt = now;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.resetSamples();
    return this.recalculate();
  }

  timing(): FrameTiming {
    const count = this.sampleCount;
    if (count === 0) return { median: 0, percentile90: 0, samples: 0 };
    this.sorted.set(this.durations.subarray(0, count));
    const values = this.sorted.subarray(0, count);
    values.sort();
    return {
      median: values[Math.floor((count - 1) * 0.5)],
      percentile90: values[Math.floor((count - 1) * 0.9)],
      samples: count,
    };
  }

  suspend(): void {
    this.previousFrame = 0;
    this.resetSamples();
  }

  private recalculate(): boolean {
    const pixelCap = Math.sqrt(this.maximumPixels / (this.width * this.height));
    const ratio = Math.min(this.deviceRatio, this.maximumRatio, pixelCap) * this.resolutionScale;
    const shadows = this.hasFloatTargets && this.effects;
    const bloom = this.hasFloatTargets && this.effects;
    const changed = Math.abs(ratio - this.state.pixelRatio) > 0.005
      || shadows !== this.state.contactShadows
      || bloom !== this.state.bloom;
    this.state.pixelRatio = ratio;
    this.state.contactShadows = shadows;
    this.state.bloom = bloom;
    return changed;
  }

  private resetSamples(): void {
    this.sampleCount = 0;
    this.sampleCursor = 0;
  }
}
