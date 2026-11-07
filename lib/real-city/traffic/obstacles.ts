import type { TrafficEnvironment, TrafficState, TrafficSpecification } from "./types";

export class TrafficPedestrianAvoidance {
  private readonly maximumSeen: Float32Array;
  private readonly holdUntil: Float64Array;
  private readonly heldGap: Float32Array;
  private readonly obstaclesSeen: Uint16Array;

  constructor(vehicleCount: number) {
    this.maximumSeen = new Float32Array(vehicleCount);
    this.holdUntil = new Float64Array(vehicleCount);
    this.heldGap = new Float32Array(vehicleCount);
    this.heldGap.fill(Infinity);
    this.obstaclesSeen = new Uint16Array(vehicleCount);
  }

  gap(vehicle: number, state: TrafficState, specification: TrafficSpecification, environment: TrafficEnvironment, seconds: number): number {
    const lookAhead = Math.max(10, state.speed * 2.6 + 7);
    const halfWidth = specification.width * 0.5;
    let gap = Infinity;
    let seen = 0;
    for (const obstacle of environment.obstacles) {
      if (obstacle.until < seconds) continue;
      const dx = obstacle.x - state.pose.x;
      const dz = obstacle.z - state.pose.z;
      const along = dx * state.pose.directionX + dz * state.pose.directionZ;
      const lateral = Math.abs(dx * state.pose.directionZ - dz * state.pose.directionX);
      if (along < -specification.length * 0.5 || along > lookAhead) continue;
      const turnPadding = Math.min(1.5, Math.abs(state.pose.curvature) * along * along * 0.25);
      if (lateral > halfWidth + obstacle.radius + 0.8 + turnPadding) continue;
      const distance = Math.max(0, along - specification.length * 0.5 - obstacle.radius - 0.7);
      gap = Math.min(gap, distance);
      seen++;
    }
    this.obstaclesSeen[vehicle] = seen;
    if (Number.isFinite(gap)) {
      this.heldGap[vehicle] = gap;
      this.holdUntil[vehicle] = seconds + 0.45;
      this.maximumSeen[vehicle] = state.travelled;
    } else if (seconds < this.holdUntil[vehicle]) {
      gap = Math.max(0, this.heldGap[vehicle] - (state.travelled - this.maximumSeen[vehicle]));
    }
    return gap;
  }

  get waitingCount(): number {
    let count = 0;
    for (const seen of this.obstaclesSeen) if (seen > 0) count++;
    return count;
  }

  reset(): void {
    this.maximumSeen.fill(0);
    this.holdUntil.fill(0);
    this.heldGap.fill(Infinity);
    this.obstaclesSeen.fill(0);
  }
}
