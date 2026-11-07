import { clamp, distance, positiveModulo, type Point2 } from "./math";
import { hashInteger } from "./random";
import type { Actor, LifeContext, LifeVehicle } from "./types";
import type { PedestrianNetwork, CrossingLocation } from "./navigation";
import { sampleSignalPhase } from "../traffic/signals";

export type PedestrianSignal = "walk" | "clearance" | "stop";

interface CrossingOccupant {
  actorId: number;
  enteredAt: number;
  expectedExit: number;
  start: Point2;
  end: Point2;
  speed: number;
}

export interface CrossingState {
  id: number;
  location: CrossingLocation;
  signal: PedestrianSignal;
  secondsRemaining: number;
  occupants: Map<number, CrossingOccupant>;
  waiting: Set<number>;
  oldestWaitingAt: number;
  extensionUntil: number;
  emergencyUntil: number;
  vehicleYieldUntil: number;
  offset: number;
  phase: number;
  pedestrianDemand: number;
}

export class CrossingSignals {
  readonly states: CrossingState[];
  private readonly actorCrossing = new Map<number, number>();
  private readonly nearbyVehicles: LifeVehicle[] = [];

  constructor(private readonly network: PedestrianNetwork) {
    this.states = network.crossings.map((location) => {
      const junctionX = Math.round(location.center.x / 15);
      const junctionZ = Math.round(location.center.z / 15);
      const offset = hashInteger(junctionX * 31 + junctionZ * 73) % 9;
      return {
        id: location.id,
        location,
        signal: "stop",
        secondsRemaining: 0,
        occupants: new Map(),
        waiting: new Set(),
        oldestWaitingAt: Infinity,
        extensionUntil: 0,
        emergencyUntil: 0,
        vehicleYieldUntil: 0,
        offset,
        phase: 0,
        pedestrianDemand: 0,
      };
    });
  }

  tick(context: LifeContext): void {
    const now = context.time.seconds;
    for (const crossing of this.states) {
      const phase = sampleSignalPhase(now, crossing.location.axis === "x");
      crossing.phase = phase.localSeconds;
      if (crossing.emergencyUntil > now) {
        crossing.signal = "stop";
        crossing.secondsRemaining = crossing.emergencyUntil - now;
      } else if (crossing.extensionUntil > now && phase.pedestrian !== "walk") {
        crossing.signal = "clearance";
        crossing.secondsRemaining = crossing.extensionUntil - now;
      } else {
        crossing.signal = phase.pedestrian;
        crossing.secondsRemaining = phase.pedestrianRemaining;
      }
      crossing.pedestrianDemand = crossing.waiting.size;
      for (const [actorId, occupant] of crossing.occupants) {
        const actor = context.actorById.get(actorId);
        if (!actor || !actor.visible || distance(actor.position, occupant.end) < 0.7) {
          this.exit(actorId);
          continue;
        }
        const remaining = distance(actor.position, occupant.end) / Math.max(0.35, actor.speed);
        occupant.expectedExit = now + remaining;
        crossing.vehicleYieldUntil = Math.max(crossing.vehicleYieldUntil, now + Math.min(8, remaining + 1));
        if (crossing.signal === "clearance" && actor.age === "elder") {
          crossing.extensionUntil = Math.max(crossing.extensionUntil, now + Math.min(7, remaining + 1));
        }
        if (now - occupant.enteredAt > 35) this.exit(actorId);
      }
      for (const actorId of crossing.waiting) {
        const actor = context.actorById.get(actorId);
        if (!actor || !actor.visible || distance(actor.position, crossing.location.center) > crossing.location.length + 4) {
          crossing.waiting.delete(actorId);
        }
      }
      if (crossing.waiting.size === 0) crossing.oldestWaitingAt = Infinity;
    }
  }

  mayEnter(actor: Actor, crossingId: number, start: Point2, end: Point2, context: LifeContext): boolean {
    const crossing = this.states[crossingId];
    if (!crossing) return true;
    if (crossing.occupants.has(actor.id)) return true;
    const now = context.time.seconds;
    crossing.waiting.add(actor.id);
    crossing.oldestWaitingAt = Math.min(crossing.oldestWaitingAt, now);
    if (crossing.signal !== "walk" || crossing.emergencyUntil > now) return false;
    const estimated = distance(start, end) / Math.max(0.45, actor.baseSpeed * 0.85);
    if (estimated > crossing.secondsRemaining + 7) return false;
    context.neighbors.queryVehicles(crossing.location.center, 12, this.nearbyVehicles);
    for (const vehicle of this.nearbyVehicles) {
      const separation = distance(vehicle.position, crossing.location.center);
      if (vehicle.speed > 1.2 && separation < Math.max(4, vehicle.speed * 1.2)) return false;
    }
    for (const vehicle of context.trafficObstacles) {
      const separation = distance(vehicle, crossing.location.center);
      if ((vehicle.speed ?? 0) > 1 && separation < vehicle.radius + 3) return false;
    }
    if (crossing.occupants.size >= Math.max(3, crossing.location.width * 2)) return false;
    this.enter(actor, crossing, start, end, now, estimated);
    return true;
  }

  private enter(actor: Actor, crossing: CrossingState, start: Point2, end: Point2, seconds: number, duration: number): void {
    const occupant: CrossingOccupant = {
      actorId: actor.id,
      enteredAt: seconds,
      expectedExit: seconds + duration,
      start: { ...start },
      end: { ...end },
      speed: actor.baseSpeed,
    };
    crossing.occupants.set(actor.id, occupant);
    crossing.waiting.delete(actor.id);
    crossing.vehicleYieldUntil = Math.max(crossing.vehicleYieldUntil, seconds + duration + 1);
    this.actorCrossing.set(actor.id, crossing.id);
    actor.navigation.crossingId = crossing.id;
  }

  exit(actorId: number): void {
    const crossingId = this.actorCrossing.get(actorId);
    if (crossingId === undefined) return;
    this.states[crossingId]?.occupants.delete(actorId);
    this.actorCrossing.delete(actorId);
  }

  releaseActor(actorId: number): void {
    this.exit(actorId);
    for (const crossing of this.states) crossing.waiting.delete(actorId);
  }

  vehicleAllowed(vehicle: LifeVehicle, target: Point2, now: number): boolean {
    const directionX = target.x - vehicle.position.x;
    const directionZ = target.z - vehicle.position.z;
    const length = Math.hypot(directionX, directionZ);
    if (length < 0.1) return true;
    const lookahead = Math.max(6, vehicle.speed * 1.8);
    for (const crossing of this.states) {
      const dx = crossing.location.center.x - vehicle.position.x;
      const dz = crossing.location.center.z - vehicle.position.z;
      const forward = (dx * directionX + dz * directionZ) / length;
      const lateral = Math.abs(dx * directionZ - dz * directionX) / length;
      if (forward < -1 || forward > lookahead || lateral > 4.5) continue;
      if (crossing.occupants.size > 0 || crossing.vehicleYieldUntil > now) return false;
      const vehicleAxis = Math.abs(directionX) > Math.abs(directionZ) ? "x" : "z";
      const crossingConflicts = crossing.location.axis !== vehicleAxis;
      if (crossingConflicts && crossing.signal !== "stop") return false;
    }
    return true;
  }

  requestEmergencyPass(position: Point2, seconds: number, duration: number): void {
    for (const crossing of this.states) {
      if (distance(position, crossing.location.center) > 18) continue;
      if (crossing.occupants.size > 0) continue;
      crossing.emergencyUntil = Math.max(crossing.emergencyUntil, seconds + duration);
    }
  }

  waitingTime(actorId: number, seconds: number): number {
    for (const crossing of this.states) {
      if (crossing.waiting.has(actorId)) return Math.max(0, seconds - crossing.oldestWaitingAt);
    }
    return 0;
  }

  expectedDelay(crossingId: number): number {
    const crossing = this.states[crossingId];
    if (!crossing) return 0;
    if (crossing.signal === "walk") return 0;
    return clamp(crossing.secondsRemaining, 0, 35);
  }

  reset(): void {
    this.actorCrossing.clear();
    for (const crossing of this.states) {
      crossing.occupants.clear();
      crossing.waiting.clear();
      crossing.signal = "stop";
      crossing.secondsRemaining = 0;
      crossing.oldestWaitingAt = Infinity;
      crossing.extensionUntil = 0;
      crossing.emergencyUntil = 0;
      crossing.vehicleYieldUntil = 0;
      crossing.phase = 0;
      crossing.pedestrianDemand = 0;
    }
  }

  obstacles(context: LifeContext): { x: number; z: number; radius: number; until: number }[] {
    const obstacles: { x: number; z: number; radius: number; until: number }[] = [];
    for (const crossing of this.states) {
      for (const occupant of crossing.occupants.values()) {
        const actor = context.actorById.get(occupant.actorId);
        if (!actor?.visible) continue;
        obstacles.push({ x: actor.position.x, z: actor.position.z, radius: actor.radius + 0.3, until: occupant.expectedExit + 0.8 });
      }
    }
    return obstacles;
  }
}
