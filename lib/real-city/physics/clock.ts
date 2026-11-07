import { clamp } from "./math";

export type FixedStepResult = { reset: boolean; steps: number; interpolation: number; seconds: number; skipped: number };

export class FixedStepClock {
  readonly stepSeconds: number;
  readonly maximumSteps: number;
  private previous: number | undefined;
  private accumulated = 0;
  private simulationSeconds = 0;
  private totalSkipped = 0;

  constructor(stepSeconds = 1 / 60, maximumSteps = 12) {
    this.stepSeconds = clamp(stepSeconds, 1 / 240, 1 / 15);
    this.maximumSteps = Math.max(1, Math.min(60, Math.floor(maximumSteps)));
  }

  reset(seconds: number): void {
    this.previous = seconds;
    this.simulationSeconds = seconds;
    this.accumulated = 0;
    this.totalSkipped = 0;
  }

  advance(seconds: number, step: (dt: number, time: number) => void): FixedStepResult {
    if (!Number.isFinite(seconds)) return this.result(false, 0);
    if (this.previous === undefined || seconds < this.previous) {
      this.reset(seconds);
      return this.result(true, 0);
    }
    const elapsed = seconds - this.previous;
    this.previous = seconds;
    if (elapsed === 0) return this.result(false, 0);
    const maximumDelta = this.stepSeconds * this.maximumSteps;
    const accepted = Math.min(elapsed, maximumDelta);
    if (elapsed > accepted) {
      this.totalSkipped += elapsed - accepted;
      this.simulationSeconds = seconds - accepted - this.accumulated;
    }
    this.accumulated += accepted;
    let steps = 0;
    while (this.accumulated + 1e-9 >= this.stepSeconds && steps < this.maximumSteps) {
      this.simulationSeconds += this.stepSeconds;
      step(this.stepSeconds, this.simulationSeconds);
      this.accumulated = Math.max(0, this.accumulated - this.stepSeconds);
      steps++;
    }
    return this.result(false, steps);
  }

  private result(reset: boolean, steps: number): FixedStepResult {
    return {
      reset,
      steps,
      interpolation: clamp(this.accumulated / this.stepSeconds, 0, 1),
      seconds: this.simulationSeconds,
      skipped: this.totalSkipped,
    };
  }
}
