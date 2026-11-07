import * as THREE from "three";
import { clamp } from "../physics/math";

export type GroundImpactKind = "rain" | "foot" | "wheel" | "debris" | "drain";
export type GroundImpact = {
  x: number;
  y: number;
  z: number;
  strength: number;
  radius: number;
  heading: number;
  seconds: number;
  kind: GroundImpactKind;
  sequence: number;
};

export class GroundInteractions {
  readonly impacts: GroundImpact[];
  private cursor = 0;
  private nextSequence = 1;

  constructor(capacity = 96) {
    this.impacts = Array.from({ length: capacity }, () => ({
      x: 0,
      y: 0,
      z: 0,
      strength: 0,
      radius: 0,
      heading: 0,
      seconds: -Infinity,
      kind: "rain" as GroundImpactKind,
      sequence: 0,
    }));
  }

  record(kind: GroundImpactKind, point: THREE.Vector3, strength: number, radius: number, seconds: number, heading = 0): void {
    const impact = this.impacts[this.cursor];
    impact.x = point.x;
    impact.y = point.y;
    impact.z = point.z;
    impact.strength = clamp(strength, 0, 12);
    impact.radius = clamp(radius, 0.005, 2);
    impact.heading = heading;
    impact.seconds = seconds;
    impact.kind = kind;
    impact.sequence = this.nextSequence++;
    this.cursor = (this.cursor + 1) % this.impacts.length;
  }

  since(sequence: number, consume: (impact: GroundImpact) => void): number {
    let latest = sequence;
    for (const impact of this.impacts) {
      if (impact.sequence <= sequence) continue;
      consume(impact);
      latest = Math.max(latest, impact.sequence);
    }
    return latest;
  }

  reset(): void {
    this.cursor = 0;
    this.nextSequence = 1;
    for (const impact of this.impacts) {
      impact.sequence = 0;
      impact.seconds = -Infinity;
    }
  }
}
