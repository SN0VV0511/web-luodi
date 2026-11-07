import { clamp } from "./math";

export function hashInteger(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

export function hashString(value: string, initial = 2166136261): number {
  let hash = initial >>> 0;
  for (let index = 0; index < value.length; index++) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  }
  return hashInteger(hash);
}

export function randomAt(seed: number, channel: number, occurrence: number): number {
  return hashInteger(seed ^ Math.imul(channel + 1, 0x9e3779b9) ^ Math.imul(occurrence + 1, 0x85ebca6b)) / 4294967296;
}

export class RandomStream {
  private value: number;
  private gaussianSpare: number | undefined;

  constructor(readonly seed: number) {
    this.value = seed >>> 0;
  }

  reset(): void {
    this.value = this.seed >>> 0;
    this.gaussianSpare = undefined;
  }

  next(): number {
    this.value = (this.value + 0x6d2b79f5) >>> 0;
    let value = this.value;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  between(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }

  integer(minimum: number, maximumExclusive: number): number {
    if (maximumExclusive <= minimum) return minimum;
    return minimum + Math.floor(this.next() * (maximumExclusive - minimum));
  }

  probability(chance: number): boolean {
    return this.next() < clamp(chance, 0, 1);
  }

  choice<T>(values: readonly T[]): T {
    if (values.length === 0) throw new Error("A city choice requires at least one candidate");
    return values[this.integer(0, values.length)];
  }

  weighted<T>(values: readonly T[], weight: (value: T) => number): T {
    if (values.length === 0) throw new Error("A weighted city choice requires candidates");
    let total = 0;
    for (const value of values) total += Math.max(0, weight(value));
    if (total <= 0) return this.choice(values);
    let remaining = this.next() * total;
    for (const value of values) {
      remaining -= Math.max(0, weight(value));
      if (remaining <= 0) return value;
    }
    return values[values.length - 1];
  }

  shuffle<T>(values: T[]): void {
    for (let index = values.length - 1; index > 0; index--) {
      const other = this.integer(0, index + 1);
      [values[index], values[other]] = [values[other], values[index]];
    }
  }

  normal(mean = 0, deviation = 1): number {
    if (this.gaussianSpare !== undefined) {
      const spare = this.gaussianSpare;
      this.gaussianSpare = undefined;
      return mean + spare * deviation;
    }
    let u = 0;
    let v = 0;
    let radius = 0;
    do {
      u = this.next() * 2 - 1;
      v = this.next() * 2 - 1;
      radius = u * u + v * v;
    } while (radius <= 1e-8 || radius >= 1);
    const scale = Math.sqrt(-2 * Math.log(radius) / radius);
    this.gaussianSpare = v * scale;
    return mean + u * scale * deviation;
  }

  poisson(mean: number): number {
    if (mean <= 0) return 0;
    if (mean > 20) return Math.max(0, Math.round(this.normal(mean, Math.sqrt(mean))));
    const threshold = Math.exp(-mean);
    let product = 1;
    let count = 0;
    do {
      count++;
      product *= this.next();
    } while (product > threshold);
    return count - 1;
  }

  exponential(mean: number): number {
    return -Math.log(Math.max(1e-9, 1 - this.next())) * Math.max(0, mean);
  }

  fork(label: string): RandomStream {
    return new RandomStream(hashString(label, this.seed));
  }
}

export class ShuffleBag<T> {
  private remaining: T[] = [];
  private last: T | undefined;

  constructor(private readonly source: readonly T[], private readonly random: RandomStream) {}

  next(): T {
    if (this.source.length === 0) throw new Error("Empty city shuffle bag");
    if (this.remaining.length === 0) {
      this.remaining = [...this.source];
      this.random.shuffle(this.remaining);
      const end = this.remaining.length - 1;
      if (end > 0 && this.remaining[end] === this.last) {
        [this.remaining[0], this.remaining[end]] = [this.remaining[end], this.remaining[0]];
      }
    }
    this.last = this.remaining.pop()!;
    return this.last;
  }

  reset(): void {
    this.remaining.length = 0;
    this.last = undefined;
    this.random.reset();
  }
}
