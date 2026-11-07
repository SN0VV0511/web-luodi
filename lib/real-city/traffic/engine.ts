import { FixedStepClock } from "../physics/clock";
import { VehicleRouteGeometry, wrapDistance } from "./route";
import { TrafficSpatialIndex } from "./spatial-index";
import { TrafficFollowing } from "./following";
import { VehicleDrivetrain } from "./drivetrain";
import { JunctionReservations } from "./junctions";
import { TrafficPedestrianAvoidance } from "./obstacles";
import { tireFriction, vehicleSpecification } from "./specifications";
import { newTrafficPose, newTrafficState } from "./types";
import { VehicleChassis } from "./chassis";
import type { TrafficEnvironment, TrafficLeader, TrafficPoint, TrafficRoute, TrafficSnapshot, TrafficSpecification, TrafficState } from "./types";

export class CityTrafficEngine {
  readonly states: TrafficState[];
  readonly geometry: VehicleRouteGeometry[];
  readonly specifications: TrafficSpecification[];
  private readonly clock = new FixedStepClock(1 / 60, 12);
  private readonly spatial: TrafficSpatialIndex;
  private readonly following: TrafficFollowing;
  private readonly drivetrains: VehicleDrivetrain[];
  private readonly chassis: VehicleChassis[];
  private readonly junctions: JunctionReservations;
  private readonly pedestrians: TrafficPedestrianAvoidance;
  private readonly nextSpeed: Float64Array;
  private readonly nextAcceleration: Float64Array;
  private readonly nextDistance: Float64Array;
  private readonly leader: TrafficLeader = { index: -1, gap: Infinity, speed: 0, stopping: false };
  private readonly environment: TrafficEnvironment = {
    night: false,
    wetness: 0,
    snow: 0,
    temperature: 18,
    windX: 0,
    windZ: 0,
    obstacles: [],
  };
  private readonly result: TrafficSnapshot = {
    moving: 0,
    stopped: 0,
    averageSpeed: 0,
    totalDistance: 0,
    waitingAtSignals: 0,
    yieldingToPeople: 0,
  };

  constructor(readonly routes: readonly TrafficRoute[], intersections: readonly TrafficPoint[]) {
    this.specifications = routes.map(vehicleSpecification);
    this.geometry = routes.map((route, index) => new VehicleRouteGeometry(route, intersections, this.specifications[index].length));
    this.states = routes.map(newTrafficState);
    this.spatial = new TrafficSpatialIndex(routes.length);
    this.following = new TrafficFollowing(routes, this.geometry, this.specifications, this.spatial);
    this.drivetrains = this.specifications.map((specification, index) => new VehicleDrivetrain(specification, index));
    this.chassis = this.specifications.map((specification) => new VehicleChassis(specification));
    this.junctions = new JunctionReservations(this.geometry, this.specifications, intersections);
    this.pedestrians = new TrafficPedestrianAvoidance(routes.length);
    this.nextSpeed = new Float64Array(routes.length);
    this.nextAcceleration = new Float64Array(routes.length);
    this.nextDistance = new Float64Array(routes.length);
    this.reset();
  }

  animate(seconds: number, environment?: Partial<TrafficEnvironment>): readonly TrafficState[] {
    if (environment) {
      if (environment.night !== undefined) this.environment.night = environment.night;
      if (environment.wetness !== undefined) this.environment.wetness = Math.max(0, Math.min(1, environment.wetness));
      if (environment.snow !== undefined) this.environment.snow = Math.max(0, Math.min(1, environment.snow));
      if (environment.temperature !== undefined) this.environment.temperature = Math.max(-40, Math.min(60, environment.temperature));
      if (environment.windX !== undefined) this.environment.windX = environment.windX;
      if (environment.windZ !== undefined) this.environment.windZ = environment.windZ;
      if (environment.obstacles !== undefined) this.environment.obstacles = environment.obstacles;
    }
    const clock = this.clock.advance(seconds, (dt, time) => this.step(dt, time));
    if (clock.reset) this.reset();
    return this.states;
  }

  snapshot(): Readonly<TrafficSnapshot> {
    let moving = 0;
    let speed = 0;
    let distance = 0;
    for (const state of this.states) {
      if (state.speed > 0.2) moving++;
      speed += state.speed;
      distance += state.travelled;
    }
    const waiting = this.junctions.counts();
    this.result.moving = moving;
    this.result.stopped = this.states.length - moving;
    this.result.averageSpeed = speed / Math.max(1, this.states.length);
    this.result.totalDistance = distance;
    this.result.waitingAtSignals = waiting.signals;
    this.result.yieldingToPeople = Math.max(waiting.pedestrians, this.pedestrians.waitingCount);
    return this.result;
  }

  reset(): void {
    for (let index = 0; index < this.states.length; index++) {
      const state = this.states[index];
      Object.assign(state, newTrafficState());
      state.distance = wrapDistance(this.routes[index].offset, this.routes[index].totalLength);
      state.engineRpm = this.specifications[index].idleRpm;
      this.geometry[index].sample(state.distance, state.pose);
      this.drivetrains[index].reset();
      this.chassis[index].reset();
    }
    this.separateInitialVehicles();
    this.junctions.reset();
    this.pedestrians.reset();
    this.spatial.rebuild(this.states);
  }

  dispose(): void {
    this.spatial.clear();
    this.junctions.reset();
    this.pedestrians.reset();
    this.environment.obstacles = [];
  }

  private step(dt: number, seconds: number): void {
    this.spatial.rebuild(this.states);
    this.junctions.update(this.states, this.environment, seconds, dt);
    const friction = tireFriction(this.environment);
    for (let index = 0; index < this.states.length; index++) {
      const state = this.states[index];
      const specification = this.specifications[index];
      const geometry = this.geometry[index];
      const route = this.routes[index];
      const turn = geometry.upcomingTurn(state.pose.edgeIndex);
      const lateralLimit = Math.min(specification.lateralAcceleration, friction * 9.80665 * 0.4);
      const cornerSpeed = Math.sqrt(geometry.cornerRadius(state.pose.edgeIndex) * lateralLimit);
      const slowingDistance = Math.max(0, state.pose.toCorner - geometry.turnZone);
      const cornerApproach = Math.sqrt(cornerSpeed * cornerSpeed + 2 * specification.comfortableBraking * slowingDistance);
      const currentCurve = Math.abs(state.pose.curvature) > 0.001
        ? Math.sqrt(lateralLimit / Math.abs(state.pose.curvature))
        : Infinity;
      const desired = Math.max(0.2, Math.min(route.speed, cornerApproach, currentCurve));
      const nearest = this.following.find(index, this.states, Math.max(30, state.speed * 4));
      this.leader.index = nearest.index;
      this.leader.gap = nearest.gap;
      this.leader.speed = nearest.speed;
      this.leader.stopping = nearest.stopping;
      const signalGap = this.junctions.stopGap(index);
      const pedestrianGap = this.pedestrians.gap(index, state, specification, this.environment, seconds);
      const obstacleGap = Math.min(signalGap, pedestrianGap);
      if (obstacleGap < this.leader.gap) {
        this.leader.index = -1;
        this.leader.gap = obstacleGap;
        this.leader.speed = 0;
        this.leader.stopping = true;
      }
      const requested = this.following.acceleration(state, desired, this.leader, specification, this.environment, index);
      const advanced = this.drivetrains[index].integrate(state, requested, this.leader.gap, this.environment, dt);
      this.nextSpeed[index] = advanced.speed;
      this.nextAcceleration[index] = advanced.acceleration;
      this.nextDistance[index] = advanced.metres;
      const signaling = state.pose.toCorner < Math.max(16, state.speed * 3.2) || state.pose.curvature !== 0;
      state.turnSignal = signaling ? Math.sign(turn) as -1 | 0 | 1 : 0;
      state.indicatorOn = state.turnSignal !== 0 && ((seconds + index * 0.13) % 0.88) < 0.44;
    }
    for (let index = 0; index < this.states.length; index++) {
      const state = this.states[index];
      const metres = this.nextDistance[index];
      const virtualDistance = metres / Math.max(0.2, state.pose.tangentScale);
      state.distance = wrapDistance(state.distance + virtualDistance, this.routes[index].totalLength);
      state.travelled += metres;
      state.speed = this.nextSpeed[index];
      state.acceleration = this.nextAcceleration[index];
      this.geometry[index].sample(state.distance, state.pose);
      this.chassis[index].update(state, dt);
    }
  }

  private separateInitialVehicles(): void {
    const candidate = newTrafficPose();
    for (let index = 1; index < this.states.length; index++) {
      const state = this.states[index];
      for (let attempt = 0; attempt < this.states.length * 2; attempt++) {
        this.geometry[index].sample(state.distance, candidate);
        let retreat = 0;
        for (let previous = 0; previous < index; previous++) {
          const other = this.states[previous];
          const heading = candidate.directionX * other.pose.directionX + candidate.directionZ * other.pose.directionZ;
          if (heading < 0.7) continue;
          const dx = other.pose.x - candidate.x;
          const dz = other.pose.z - candidate.z;
          const lateral = Math.abs(dx * candidate.directionZ - dz * candidate.directionX);
          if (lateral > 1.1) continue;
          const along = dx * candidate.directionX + dz * candidate.directionZ;
          const clearance = (this.specifications[index].length + this.specifications[previous].length) * 0.5 + 2;
          if (Math.abs(along) < clearance) retreat = Math.max(retreat, clearance - along);
        }
        if (retreat === 0) break;
        state.distance = wrapDistance(state.distance - retreat - 0.2, this.routes[index].totalLength);
      }
      this.geometry[index].sample(state.distance, state.pose);
    }
  }
}
