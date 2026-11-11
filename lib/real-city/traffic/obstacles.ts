import type { TrafficEnvironment, TrafficState, TrafficSpecification } from "./types";

export class TrafficPedestrianAvoidance {
  private readonly maximumSeen: Float32Array;
  private readonly holdUntil: Float64Array;
  private readonly heldGap: Float32Array;
  private readonly obstaclesSeen: Uint16Array;
  /** 每车：绕行目标横移量（米，带符号，沿车辆左法线）与当前平滑横移、限速。 */
  readonly swerveTarget: Float32Array;
  readonly swerve: Float32Array;
  readonly speedCap: Float32Array;
  static readonly maximumSwerve = 1.7;

  constructor(vehicleCount: number) {
    this.swerveTarget = new Float32Array(vehicleCount);
    this.swerve = new Float32Array(vehicleCount);
    this.speedCap = new Float32Array(vehicleCount).fill(Infinity);
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
    let swerveTarget = 0;
    let speedCap = Infinity;
    // 横移前的车道中心位置（pose 已含上一帧的绕行偏移）
    const ownSwerve = this.swerve[vehicle];
    const laneX = state.pose.x - state.pose.directionZ * ownSwerve;
    const laneZ = state.pose.z + state.pose.directionX * ownSwerve;
    for (const obstacle of environment.obstacles) {
      if (obstacle.until < seconds) continue;
      const dx = obstacle.x - laneX;
      const dz = obstacle.z - laneZ;
      const along = dx * state.pose.directionX + dz * state.pose.directionZ;
      const signedLateral = dx * state.pose.directionZ - dz * state.pose.directionX;
      const lateral = Math.abs(signedLateral);
      if (obstacle.passable) {
        // 路边事件：提前 18 m 开始向路中让出空间，越过车尾后回到车道；需要的横移超过上限则排队等待。
        if (along < -specification.length * 0.5 - obstacle.radius - 2 || along > Math.max(lookAhead, 22)) continue;
        if (lateral > halfWidth + obstacle.radius + 3.2) continue;
        const need = halfWidth + obstacle.radius + 0.35 - lateral;
        if (Number.isFinite(obstacle.slow ?? Infinity) && lateral < halfWidth + obstacle.radius + 3) {
          const approach = Math.max(0, along - specification.length * 0.5 - obstacle.radius);
          speedCap = Math.min(speedCap, (obstacle.slow ?? 0) + approach * 0.35);
        }
        if (need <= 0) continue;
        if (need <= TrafficPedestrianAvoidance.maximumSwerve) {
          const ramp = along > 0 ? 1 - Math.min(1, Math.max(0, (along - 6) / 12)) : 1;
          const amount = -Math.sign(signedLateral || 1) * need * ramp;
          if (Math.abs(amount) > Math.abs(swerveTarget)) swerveTarget = amount;
          continue;
        }
      }
      if (along < -specification.length * 0.5 || along > lookAhead) continue;
      const turnPadding = Math.min(1.5, Math.abs(state.pose.curvature) * along * along * 0.25);
      if (lateral > halfWidth + obstacle.radius + 0.8 + turnPadding) continue;
      const distance = Math.max(0, along - specification.length * 0.5 - obstacle.radius - 0.7);
      gap = Math.min(gap, distance);
      seen++;
    }
    this.obstaclesSeen[vehicle] = seen;
    this.swerveTarget[vehicle] = swerveTarget;
    this.speedCap[vehicle] = speedCap;
    if (Number.isFinite(gap)) {
      this.heldGap[vehicle] = gap;
      this.holdUntil[vehicle] = seconds + 0.45;
      this.maximumSeen[vehicle] = state.travelled;
    } else if (seconds < this.holdUntil[vehicle]) {
      gap = Math.max(0, this.heldGap[vehicle] - (state.travelled - this.maximumSeen[vehicle]));
    }
    return gap;
  }

  /** 平滑横移并把偏移写入 pose（左法线 = (dirZ, -dirX)），车头随横移速度微微偏转。 */
  applySwerve(vehicle: number, state: TrafficState, dt: number): void {
    const previous = this.swerve[vehicle];
    const target = this.swerveTarget[vehicle];
    const rate = Math.min(1, dt * 1.25);
    const next = previous + (target - previous) * rate;
    this.swerve[vehicle] = Math.abs(next) < 0.002 ? 0 : next;
    const offset = this.swerve[vehicle];
    if (offset === 0) return;
    state.pose.x += state.pose.directionZ * offset;
    state.pose.z -= state.pose.directionX * offset;
    const lateralSpeed = (offset - previous) / Math.max(1e-3, dt);
    state.pose.heading += Math.atan2(lateralSpeed, Math.max(1.5, state.speed)) * 0.8;
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
    this.swerve.fill(0);
    this.swerveTarget.fill(0);
    this.speedCap.fill(Infinity);
  }
}
