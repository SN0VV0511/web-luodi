import type { TrafficEnvironment, TrafficState, TrafficSpecification } from "./types";
import { TRAFFIC_LANE_OFFSET } from "./route";

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

  gap(vehicle: number, state: TrafficState, specification: TrafficSpecification, environment: TrafficEnvironment, seconds: number, others: readonly TrafficState[] = []): number {
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
          // 车道左法线 n = (dirZ, -dirX)：道路中线在 -n 方向 TRAFFIC_LANE_OFFSET 处。
          // 只在本车道内让出时直接绕行；需要压过中线时，对向车道必须空出整个超越距离，否则排队等候。
          const centreRoom = TRAFFIC_LANE_OFFSET - halfWidth - 0.15;
          const crossesCentre = amount < 0 && need > centreRoom;
          const committed = ownSwerve < -centreRoom * 0.85;
          if (!crossesCentre || committed || this.oncomingClear(vehicle, state, others, laneX, laneZ, Math.max(0, along) + obstacle.radius + specification.length + 2)) {
            if (Math.abs(amount) > Math.abs(swerveTarget)) swerveTarget = amount;
            if (crossesCentre) speedCap = Math.min(speedCap, 4.5);
            continue;
          }
          // 对向来车：在本车道内最多让到中线前，并停在事件车辆后方排队。
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

  /**
   * 对向车道在超越距离内是否空闲：对向行驶（航向相反）、横向位于中线另一侧的车辆，
   * 若在「本车完成绕行所需时间」内会进入超越区段，则视为不安全。
   */
  oncomingClear(vehicle: number, state: TrafficState, others: readonly TrafficState[], laneX: number, laneZ: number, passLength: number): boolean {
    const dirX = state.pose.directionX, dirZ = state.pose.directionZ;
    const passTime = passLength / Math.max(2.5, Math.min(state.speed, 4.5)) + 1.5;
    for (let index = 0; index < others.length; index++) {
      if (index === vehicle) continue;
      const other = others[index];
      if (other.pose.directionX * dirX + other.pose.directionZ * dirZ > -0.7) continue;
      const dx = other.pose.x - laneX, dz = other.pose.z - laneZ;
      const lateral = dx * dirZ - dz * dirX;
      if (lateral > -TRAFFIC_LANE_OFFSET + 0.3 || lateral < -TRAFFIC_LANE_OFFSET * 3) continue;
      const along = dx * dirX + dz * dirZ;
      if (along > -6 && along < passLength + 8 + other.speed * passTime) return false;
    }
    return true;
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
