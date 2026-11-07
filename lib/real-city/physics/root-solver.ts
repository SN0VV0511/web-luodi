import { clamp } from "./math";

export type RootSolution = {
  value: number;
  residual: number;
  iterations: number;
  converged: boolean;
  bracketed: boolean;
};

export class SafeguardedRootSolver {
  readonly result: RootSolution = { value: 0, residual: 0, iterations: 0, converged: false, bracketed: false };

  solve(evaluate: (value: number) => number, minimum: number, maximum: number, guess: number, tolerance = 1e-6, maximumIterations = 24): RootSolution {
    let low = Math.min(minimum, maximum);
    let high = Math.max(minimum, maximum);
    let lowValue = this.evaluateFinite(evaluate, low);
    let highValue = this.evaluateFinite(evaluate, high);
    let current = clamp(guess, low, high);
    let value = this.evaluateFinite(evaluate, current);
    this.result.value = current;
    this.result.residual = value;
    this.result.iterations = 0;
    this.result.converged = false;
    this.result.bracketed = lowValue * highValue <= 0;
    if (Math.abs(lowValue) < tolerance) return this.finish(low, lowValue, 0, true);
    if (Math.abs(highValue) < tolerance) return this.finish(high, highValue, 0, true);
    if (!this.result.bracketed) {
      let previous = low;
      let previousValue = lowValue;
      const segments = 8;
      for (let index = 1; index <= segments; index++) {
        const next = low + (high - low) * index / segments;
        const nextValue = this.evaluateFinite(evaluate, next);
        if (previousValue * nextValue <= 0) {
          low = previous;
          high = next;
          lowValue = previousValue;
          highValue = nextValue;
          this.result.bracketed = true;
          current = clamp(current, low, high);
          value = this.evaluateFinite(evaluate, current);
          break;
        }
        previous = next;
        previousValue = nextValue;
      }
    }
    let best = current;
    let bestValue = value;
    for (let iteration = 0; iteration < maximumIterations; iteration++) {
      if (Math.abs(value) < tolerance) return this.finish(current, value, iteration, true);
      if (Math.abs(value) < Math.abs(bestValue)) {
        best = current;
        bestValue = value;
      }
      const width = high - low;
      if (width < tolerance * Math.max(1, Math.abs(current))) return this.finish(current, value, iteration, true);
      const derivativeStep = Math.max(1e-6, Math.abs(current) * 1e-4, width * 1e-4);
      const first = Math.max(low, current - derivativeStep);
      const second = Math.min(high, current + derivativeStep);
      const derivative = second > first ? (this.evaluateFinite(evaluate, second) - this.evaluateFinite(evaluate, first)) / (second - first) : 0;
      const newton = Math.abs(derivative) > 1e-10 ? current - value / derivative : NaN;
      let next: number;
      const interior = Math.min(width * 0.05, tolerance * 10);
      if (Number.isFinite(newton) && newton > low + interior && newton < high - interior) next = newton;
      else if (this.result.bracketed && Math.abs(highValue - lowValue) > 1e-12) {
        const secant = low - lowValue * width / (highValue - lowValue);
        next = secant > low + width * 0.15 && secant < high - width * 0.15 ? secant : (low + high) * 0.5;
      } else next = (low + high) * 0.5;
      const nextValue = this.evaluateFinite(evaluate, next);
      if (this.result.bracketed) {
        if (lowValue * nextValue <= 0) {
          high = next;
          highValue = nextValue;
        } else {
          low = next;
          lowValue = nextValue;
        }
      } else {
        if (next < current) {
          if (Math.abs(nextValue) < Math.abs(value)) high = current;
          else low = next;
        } else {
          if (Math.abs(nextValue) < Math.abs(value)) low = current;
          else high = next;
        }
      }
      current = next;
      value = nextValue;
      this.result.iterations = iteration + 1;
    }
    if (Math.abs(value) < Math.abs(bestValue)) return this.finish(current, value, maximumIterations, false);
    return this.finish(best, bestValue, maximumIterations, false);
  }

  private evaluateFinite(evaluate: (value: number) => number, value: number): number {
    const result = evaluate(value);
    if (Number.isNaN(result)) return Number.MAX_VALUE * 0.001;
    return clamp(result, -1e100, 1e100);
  }

  private finish(value: number, residual: number, iterations: number, converged: boolean): RootSolution {
    this.result.value = value;
    this.result.residual = residual;
    this.result.iterations = iterations;
    this.result.converged = converged;
    return this.result;
  }
}
