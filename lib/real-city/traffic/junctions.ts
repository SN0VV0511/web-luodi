import { mustStopForSignal, sampleSignalPhase } from "./signals";
import { VehicleRouteGeometry, type RouteStopLine } from "./route";
import type { TrafficEnvironment, TrafficPoint, TrafficSpecification, TrafficState } from "./types";

type JunctionReservation = {
  vehicle: number;
  granted: number;
  entered: boolean;
  progress: number;
};

type JunctionRequest = {
  vehicle: number;
  stop: RouteStopLine;
  distance: number;
  score: number;
};

type Junction = {
  point: TrafficPoint;
  reservation: JunctionReservation | null;
  request: JunctionRequest | null;
  occupiedByPerson: boolean;
};

export class JunctionReservations {
  private readonly junctions = new Map<string, Junction>();
  private readonly deniedGap: Float32Array;
  private readonly requestWait: Float32Array;
  private readonly signalWait: Uint8Array;
  private readonly pedestrianWait: Uint8Array;

  constructor(
    readonly geometry: readonly VehicleRouteGeometry[],
    readonly specifications: readonly TrafficSpecification[],
    intersections: readonly TrafficPoint[],
  ) {
    this.deniedGap = new Float32Array(geometry.length);
    this.requestWait = new Float32Array(geometry.length);
    this.signalWait = new Uint8Array(geometry.length);
    this.pedestrianWait = new Uint8Array(geometry.length);
    for (const point of intersections) {
      this.junctions.set(this.key(point), {
        point,
        reservation: null,
        request: null,
        occupiedByPerson: false,
      });
    }
  }

  update(states: readonly TrafficState[], environment: TrafficEnvironment, seconds: number, dt: number): void {
    this.deniedGap.fill(Infinity);
    this.signalWait.fill(0);
    this.pedestrianWait.fill(0);
    for (const junction of this.junctions.values()) {
      junction.request = null;
      junction.occupiedByPerson = false;
      for (const obstacle of environment.obstacles) {
        if (obstacle.until < seconds) continue;
        if (Math.abs(obstacle.x - junction.point.x) < 10 + obstacle.radius
          && Math.abs(obstacle.z - junction.point.z) < 10 + obstacle.radius) {
          junction.occupiedByPerson = true;
          break;
        }
      }
      this.refreshReservation(junction, states, seconds);
      if (!junction.reservation) this.captureExistingOccupant(junction, states, seconds);
    }
    for (let vehicle = 0; vehicle < states.length; vehicle++) {
      const state = states[vehicle];
      const geometry = this.geometry[vehicle];
      const specification = this.specifications[vehicle];
      const lookAhead = Math.max(18, state.speed * 3 + 8);
      for (const stop of geometry.stopLines) {
        const distance = geometry.aheadDistance(state.distance, stop.distance);
        if (distance > lookAhead) continue;
        const junction = this.junctions.get(this.key(stop.node));
        if (!junction) continue;
        const signal = sampleSignalPhase(seconds, stop.horizontal).vehicle;
        const stopForSignal = mustStopForSignal(signal, state.speed, distance, specification.comfortableBraking);
        if (stopForSignal) {
          this.deniedGap[vehicle] = Math.min(this.deniedGap[vehicle], distance + 1.8);
          this.signalWait[vehicle] = 1;
          continue;
        }
        if (junction.occupiedByPerson) {
          this.deniedGap[vehicle] = Math.min(this.deniedGap[vehicle], distance + 1.8);
          this.pedestrianWait[vehicle] = 1;
          continue;
        }
        if (junction.reservation?.vehicle === vehicle) continue;
        if (distance > Math.max(9, state.speed * 1.6)) continue;
        const score = distance / Math.max(1.2, state.speed) - Math.min(8, this.requestWait[vehicle]) * 0.15;
        const request = junction.request;
        if (!request || score < request.score || score === request.score && vehicle < request.vehicle) {
          junction.request = { vehicle, stop, distance, score };
        }
      }
    }
    for (const junction of this.junctions.values()) {
      if (!junction.reservation && junction.request && !junction.occupiedByPerson) {
        const request = junction.request;
        junction.reservation = {
          vehicle: request.vehicle,
          granted: seconds,
          entered: false,
          progress: states[request.vehicle].travelled,
        };
      }
    }
    for (let vehicle = 0; vehicle < states.length; vehicle++) {
      const state = states[vehicle];
      const geometry = this.geometry[vehicle];
      for (const stop of geometry.stopLines) {
        const distance = geometry.aheadDistance(state.distance, stop.distance);
        if (distance > Math.max(18, state.speed * 3 + 8)) continue;
        const junction = this.junctions.get(this.key(stop.node));
        if (!junction?.reservation || junction.reservation.vehicle === vehicle) continue;
        this.deniedGap[vehicle] = Math.min(this.deniedGap[vehicle], distance + 1.8);
      }
      const waiting = Number.isFinite(this.deniedGap[vehicle]) && state.speed < 0.4;
      this.requestWait[vehicle] = waiting ? this.requestWait[vehicle] + dt : Math.max(0, this.requestWait[vehicle] - dt * 2);
    }
  }

  stopGap(vehicle: number): number {
    return this.deniedGap[vehicle];
  }

  counts(): { signals: number; pedestrians: number } {
    let signals = 0;
    let pedestrians = 0;
    for (let index = 0; index < this.signalWait.length; index++) {
      signals += this.signalWait[index];
      pedestrians += this.pedestrianWait[index];
    }
    return { signals, pedestrians };
  }

  reset(): void {
    this.deniedGap.fill(Infinity);
    this.requestWait.fill(0);
    this.signalWait.fill(0);
    this.pedestrianWait.fill(0);
    for (const junction of this.junctions.values()) {
      junction.reservation = null;
      junction.request = null;
      junction.occupiedByPerson = false;
    }
  }

  private refreshReservation(junction: Junction, states: readonly TrafficState[], seconds: number): void {
    const reservation = junction.reservation;
    if (!reservation) return;
    const state = states[reservation.vehicle];
    const specification = this.specifications[reservation.vehicle];
    const dx = state.pose.x - junction.point.x;
    const dz = state.pose.z - junction.point.z;
    const distance = Math.hypot(dx, dz);
    const occupancyRadius = 9 + specification.length * 0.5;
    if (distance < occupancyRadius) reservation.entered = true;
    if (reservation.entered && distance > occupancyRadius + 2) {
      junction.reservation = null;
      return;
    }
    const moved = state.travelled - reservation.progress;
    if (!reservation.entered && seconds - reservation.granted > 6 && moved < 0.5) {
      junction.reservation = null;
      return;
    }
    if (seconds - reservation.granted > 20 && distance > occupancyRadius) junction.reservation = null;
  }

  private key(point: TrafficPoint): string {
    return `${point.x}:${point.z}`;
  }

  private captureExistingOccupant(junction: Junction, states: readonly TrafficState[], seconds: number): void {
    for (let vehicle = 0; vehicle < states.length; vehicle++) {
      const state = states[vehicle];
      const halfLength = this.specifications[vehicle].length * 0.5;
      const dx = Math.abs(state.pose.x - junction.point.x);
      const dz = Math.abs(state.pose.z - junction.point.z);
      const extentX = 8.1 + halfLength * Math.abs(state.pose.directionX);
      const extentZ = 8.1 + halfLength * Math.abs(state.pose.directionZ);
      if (dx > extentX || dz > extentZ) continue;
      junction.reservation = {
        vehicle,
        granted: seconds,
        entered: true,
        progress: state.travelled,
      };
      return;
    }
  }
}
