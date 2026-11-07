import * as THREE from "three";
import { RigidBody } from "./body";
import { HydrostaticVolume } from "./hydrostatic-volume";
import { MarineDrag } from "./marine-drag";
import { clamp, GRAVITY, WATER_DENSITY } from "./math";

export type WaterSample = { height: number; normal: THREE.Vector3; velocity: THREE.Vector3; foam: number };
export type WaterSampler = (x: number, z: number, seconds: number, result: WaterSample) => WaterSample;
export type BuoyancyPoint = { local: THREE.Vector3; volume: number; radius: number };

export class BuoyancyController {
  private readonly point = new THREE.Vector3();
  private readonly force = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly arm = new THREE.Vector3();
  private readonly sample: WaterSample = { height: 0, normal: new THREE.Vector3(0, 1, 0), velocity: new THREE.Vector3(), foam: 0 };
  private submersion = 0;
  private readonly hydrostatic = new HydrostaticVolume();
  private readonly drag = new MarineDrag();
  private readonly displacement: number;

  constructor(readonly body: RigidBody, readonly points: readonly BuoyancyPoint[], readonly sampleWater: WaterSampler) {
    this.displacement = points.reduce((sum, point) => sum + point.volume, 0);
  }

  step(dt: number, seconds: number): void {
    this.sampleWater(this.body.position.x, this.body.position.z, seconds, this.sample);
    const result = this.hydrostatic.sample(this.body, this.sample.height, this.sample.normal);
    const volumeScale = this.displacement / Math.max(1e-8, result.totalVolume);
    const effectiveVolume = result.submergedVolume * volumeScale;
    this.force.set(0, WATER_DENSITY * GRAVITY * effectiveVolume, 0);
    this.body.applyForceAt(this.force, result.centre);
    const horizontalWavePressure = WATER_DENSITY * GRAVITY * effectiveVolume * 0.12;
    this.force.set(this.sample.normal.x, 0, this.sample.normal.z).multiplyScalar(horizontalWavePressure);
    this.body.applyForceAt(this.force, result.centre);
    this.drag.step(this.body, result, this.sample, dt, volumeScale);
    this.submersion = result.fraction;
    this.body.wetness = Math.max(this.body.wetness, this.submersion);
  }

  reset(): void {
    this.submersion = 0;
    this.drag.reset();
  }

  get submergedFraction(): number {
    return this.submersion;
  }
}

export function boxBuoyancyPoints(halfExtents: THREE.Vector3, volume: number): BuoyancyPoint[] {
  const points: BuoyancyPoint[] = [];
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      points.push({
        local: new THREE.Vector3(x * halfExtents.x * 0.68, -halfExtents.y * 0.45, z * halfExtents.z * 0.68),
        volume: volume / 4,
        radius: Math.max(0.03, halfExtents.y * 0.72),
      });
    }
  }
  return points;
}
