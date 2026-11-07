import { approachAngle, clamp, copyPoint, distance, distanceSquared, dot, finitePoint, heading, limitLength, normalize, point, projectOnSegment, timeToCollision, type Point2 } from "./math";
import { carryingWeight, setGesture, stopWalking } from "./actions";
import type { Actor, LifeContext, LifeVehicle } from "./types";
import type { LifeObstacles } from "./obstacles";

export class PedestrianMovement {
  private readonly neighbors: Actor[] = [];
  private readonly vehicles: LifeVehicle[] = [];
  private readonly relativePosition = point();
  private readonly relativeVelocity = point();
  private readonly direction = point();
  private readonly predicted = point();
  private readonly wallSteering = point();
  private readonly projection = point();
  private readonly edgeOccupancies = new Map<number, number>();

  constructor(private readonly obstacles: LifeObstacles) {}

  tick(context: LifeContext): void {
    const dt = context.time.dt;
    this.edgeOccupancies.clear();
    for (const actor of context.actors) {
      copyPoint(actor.previousPosition, actor.position);
      actor.previousHeading = actor.heading;
      if (!actor.visible || actor.interiorId || actor.vehicleId >= 0) {
        actor.speed = 0;
        actor.velocity.x = 0;
        actor.velocity.z = 0;
        continue;
      }
      this.desiredMovement(actor, context);
      this.avoidNeighbors(actor, context);
      this.avoidVehicles(actor, context);
      this.obstacles.steering(actor.position, actor.desiredVelocity, actor.radius, 0.65, this.wallSteering, actor.id);
      actor.desiredVelocity.x += this.wallSteering.x;
      actor.desiredVelocity.z += this.wallSteering.z;
      const desiredSpeed = this.maximumSpeed(actor, context);
      limitLength(actor.desiredVelocity, desiredSpeed);
      const accelerationX = actor.desiredVelocity.x - actor.velocity.x;
      const accelerationZ = actor.desiredVelocity.z - actor.velocity.z;
      const acceleration = Math.hypot(accelerationX, accelerationZ);
      const maximumDelta = actor.acceleration * dt;
      const factor = acceleration > maximumDelta && acceleration > 0 ? maximumDelta / acceleration : 1;
      actor.velocity.x += accelerationX * factor;
      actor.velocity.z += accelerationZ * factor;
      this.predicted.x = actor.position.x + actor.velocity.x * dt;
      this.predicted.z = actor.position.z + actor.velocity.z * dt;
      const collided = this.obstacles.constrain(this.predicted, actor.radius, actor.id);
      if (collided) {
        actor.velocity.x = (this.predicted.x - actor.position.x) / dt;
        actor.velocity.z = (this.predicted.z - actor.position.z) / dt;
        limitLength(actor.velocity, desiredSpeed);
      }
      actor.position.x = this.predicted.x;
      actor.position.z = this.predicted.z;
      actor.speed = Math.hypot(actor.velocity.x, actor.velocity.z);
      if (actor.speed > 0.08) actor.targetHeading = Math.atan2(actor.velocity.x, actor.velocity.z);
      const turningSpeed = actor.speed > 0.1 ? 4.5 : 2.7;
      actor.heading = approachAngle(actor.heading, actor.targetHeading, dt * turningSpeed);
      actor.strideDistance += actor.speed * dt;
      actor.fatigueDistance += actor.speed * dt;
      actor.gaitPhase += actor.speed * dt * (actor.task?.kind === "jog" ? 8.2 : 6.7) / Math.max(0.8, actor.appearance.height / 1.76);
      this.maintainProgress(actor, context);
      this.correctInvalidPosition(actor, context);
    }
    this.resolveOverlaps(context);
    if (context.time.tick % 6 === 0) context.network.updateCrowding(this.edgeOccupancies, 0.25);
  }

  private maximumSpeed(actor: Actor, context: LifeContext): number {
    let speed = actor.baseSpeed;
    if (actor.task?.kind === "jog") speed *= 1.8;
    if (actor.task?.priority && actor.task.priority > 5 && actor.occupation !== "medic") speed *= 1.2;
    const load = carryingWeight(actor);
    speed *= 1 - Math.min(0.25, load * 0.025);
    speed *= 0.72 + Math.min(0.28, actor.needs.energy * 0.35);
    speed *= 1 - context.weather.snow * 0.28 - context.weather.wetGround * 0.06;
    if (actor.mobility === "cane") speed *= 0.8;
    if (actor.mobility === "stroller") speed *= 0.88;
    if (actor.guardianId >= 0) {
      const guardian = context.actorById.get(actor.guardianId);
      if (guardian && guardian.task?.kind === "pickup") speed = Math.min(speed, guardian.baseSpeed);
    }
    return Math.max(0.35, speed);
  }

  private desiredMovement(actor: Actor, context: LifeContext): void {
    actor.desiredVelocity.x = 0;
    actor.desiredVelocity.z = 0;
    actor.avoidance.x = 0;
    actor.avoidance.z = 0;
    const navigation = actor.navigation;
    if (navigation.pending || navigation.failed || navigation.arrived) return;
    if (actor.mode !== "walking" && actor.mode !== "queuing") return;
    if (navigation.yieldUntil > context.time.seconds) return;
    const points = navigation.points;
    while (navigation.cursor < points.length && distance(actor.position, points[navigation.cursor]) < 0.28) {
      navigation.cursor++;
    }
    if (navigation.cursor >= points.length) {
      this.markArrived(actor, context);
      return;
    }
    const target = points[navigation.cursor];
    const edgeIndex = Math.max(0, navigation.cursor - 1);
    const edgeId = navigation.edgePath[edgeIndex];
    const edge = edgeId === undefined ? undefined : context.network.edges[edgeId];
    if (edge) {
      this.edgeOccupancies.set(edge.id, (this.edgeOccupancies.get(edge.id) ?? 0) + 1);
      if (edge.closedUntil > context.time.seconds) {
        this.requestDetour(actor, context);
        return;
      }
      if (edge.crossingId >= 0) {
        const start = points[Math.max(0, navigation.cursor - 1)];
        if (!context.crossings.mayEnter(actor, edge.crossingId, start, target, context)) {
          actor.mode = "walking";
          setGesture(actor, context.time.tick % 180 < 30 ? "watch" : "neutral", context.time.seconds, 0.4);
          return;
        }
      } else if (navigation.crossingId >= 0) {
        context.crossings.exit(actor.id);
        navigation.crossingId = -1;
      }
    }
    let targetX = target.x;
    let targetZ = target.z;
    if (navigation.cursor > 0 && edge && edge.surface !== "crosswalk" && edge.width > 1.8) {
      const previous = points[navigation.cursor - 1];
      const dx = target.x - previous.x;
      const dz = target.z - previous.z;
      const length = Math.hypot(dx, dz);
      if (length > 0.1) {
        const endpointDistance = distance(actor.position, target);
        const laneFactor = clamp(endpointDistance / 1.5, 0, 1);
        targetX += -dz / length * navigation.lane * laneFactor;
        targetZ += dx / length * navigation.lane * laneFactor;
      }
    }
    normalize(this.direction, targetX - actor.position.x, targetZ - actor.position.z);
    const remaining = distance(actor.position, target);
    const finalPoint = navigation.cursor === points.length - 1;
    const braking = finalPoint ? Math.min(1, remaining / 0.85) : 1;
    const speed = this.maximumSpeed(actor, context) * braking;
    actor.desiredVelocity.x = this.direction.x * speed;
    actor.desiredVelocity.z = this.direction.z * speed;
    if (actor.task?.kind !== "jog" && actor.gesture.kind !== "carry" && actor.gesture.kind !== "umbrella") {
      setGesture(actor, actor.mobility === "cane" ? "cane" : "neutral", context.time.seconds, 0.2);
    }
  }

  private avoidNeighbors(actor: Actor, context: LifeContext): void {
    if (actor.mode !== "walking" && actor.mode !== "queuing") return;
    context.neighbors.query(actor.position, 3.2, this.neighbors, actor.id);
    let slowDown = 1;
    for (const other of this.neighbors) {
      const dx = other.position.x - actor.position.x;
      const dz = other.position.z - actor.position.z;
      const separation = Math.hypot(dx, dz);
      if (separation < 1e-5) continue;
      const combined = actor.radius + other.radius + 0.15;
      this.relativePosition.x = dx;
      this.relativePosition.z = dz;
      this.relativeVelocity.x = other.velocity.x - actor.velocity.x;
      this.relativeVelocity.z = other.velocity.z - actor.velocity.z;
      const collisionTime = timeToCollision(this.relativePosition, this.relativeVelocity, combined);
      const movingToward = dot(actor.desiredVelocity, this.relativePosition) > 0;
      if (separation < combined * 1.1) {
        const pressure = (combined * 1.1 - separation) / Math.max(0.1, combined);
        actor.avoidance.x -= dx / separation * pressure * 2;
        actor.avoidance.z -= dz / separation * pressure * 2;
        context.stats.avoidedCollisions++;
      } else if (collisionTime < 2.2 && movingToward) {
        const forwardX = actor.desiredVelocity.x;
        const forwardZ = actor.desiredVelocity.z;
        const passingSide = actor.id < other.id ? 1 : -1;
        const influence = (1 - collisionTime / 2.2) * 0.75;
        const perpendicularX = -forwardZ;
        const perpendicularZ = forwardX;
        const perpendicularLength = Math.max(0.1, Math.hypot(perpendicularX, perpendicularZ));
        actor.avoidance.x += perpendicularX / perpendicularLength * influence * passingSide;
        actor.avoidance.z += perpendicularZ / perpendicularLength * influence * passingSide;
        if (collisionTime < 0.8) slowDown = Math.min(slowDown, 0.35 + collisionTime * 0.55);
      }
      if (other.mode === "queuing" && movingToward && separation < 1.1) slowDown = Math.min(slowDown, separation - 0.35);
      if ((other.age === "child" || other.mobility === "cane") && movingToward && separation < 1.6) {
        slowDown = Math.min(slowDown, 0.6);
      }
    }
    actor.desiredVelocity.x = actor.desiredVelocity.x * clamp(slowDown, 0, 1) + actor.avoidance.x;
    actor.desiredVelocity.z = actor.desiredVelocity.z * clamp(slowDown, 0, 1) + actor.avoidance.z;
  }

  private avoidVehicles(actor: Actor, context: LifeContext): void {
    for (const vehicle of context.trafficObstacles) {
      const dx = actor.position.x - vehicle.x;
      const dz = actor.position.z - vehicle.z;
      const separation = Math.hypot(dx, dz);
      const safeDistance = vehicle.radius + actor.radius + 0.6;
      if (separation > safeDistance + Math.min(2, vehicle.speed ?? 0)) continue;
      if ((vehicle.speed ?? 0) > 0.4) {
        actor.desiredVelocity.x *= 0.15;
        actor.desiredVelocity.z *= 0.15;
        actor.navigation.yieldUntil = context.time.seconds + 0.25;
      }
      if (separation < safeDistance && separation > 0.001) {
        actor.desiredVelocity.x += dx / separation * 0.8;
        actor.desiredVelocity.z += dz / separation * 0.8;
      }
    }
    context.neighbors.queryVehicles(actor.position, 8, this.vehicles);
    for (const vehicle of this.vehicles) {
      const dx = actor.position.x - vehicle.position.x;
      const dz = actor.position.z - vehicle.position.z;
      const sin = Math.sin(vehicle.heading);
      const cos = Math.cos(vehicle.heading);
      const lateral = dx * cos - dz * sin;
      const forward = dx * sin + dz * cos;
      const halfLength = vehicle.kind === "bus" ? 4.3 : 2.4;
      const halfWidth = vehicle.kind === "bicycle" ? 0.35 : 1.1;
      if (Math.abs(lateral) > halfWidth + 0.8 || Math.abs(forward) > halfLength + 1.4) continue;
      if (vehicle.speed > 0.4 && forward > -halfLength) {
        actor.desiredVelocity.x *= 0.1;
        actor.desiredVelocity.z *= 0.1;
        actor.navigation.yieldUntil = context.time.seconds + 0.25;
      }
      if (Math.abs(lateral) < halfWidth + actor.radius && Math.abs(forward) < halfLength + actor.radius) {
        const side = lateral < 0 ? -1 : 1;
        actor.desiredVelocity.x += cos * side * 0.7;
        actor.desiredVelocity.z -= sin * side * 0.7;
      }
    }
  }

  private markArrived(actor: Actor, context: LifeContext): void {
    actor.navigation.arrived = true;
    actor.navigation.arrivedAt = context.time.seconds;
    actor.navigation.distanceRemaining = 0;
    actor.navigation.blockedSince = 0;
    actor.navigation.crossingId = -1;
    context.crossings.exit(actor.id);
    stopWalking(actor);
    context.stats.completedTrips++;
  }

  private maintainProgress(actor: Actor, context: LifeContext): void {
    const navigation = actor.navigation;
    if (navigation.arrived || navigation.pending || navigation.failed) return;
    const target = navigation.points[navigation.cursor];
    if (!target) return;
    let remaining = distance(actor.position, target);
    for (let index = navigation.cursor + 1; index < navigation.points.length; index++) {
      remaining += distance(navigation.points[index - 1], navigation.points[index]);
    }
    navigation.distanceRemaining = remaining;
    if (remaining < navigation.lastDistance - 0.1) {
      navigation.lastProgressAt = context.time.seconds;
      navigation.lastDistance = remaining;
      navigation.blockedSince = 0;
      return;
    }
    if (navigation.crossingId >= 0 || context.crossings.waitingTime(actor.id, context.time.seconds) > 0) return;
    const stalled = context.time.seconds - navigation.lastProgressAt;
    if (stalled > 3 && navigation.blockedSince === 0) navigation.blockedSince = context.time.seconds;
    if (stalled > 7 && navigation.repathAfter < context.time.seconds) {
      this.requestDetour(actor, context);
    }
  }

  private requestDetour(actor: Actor, context: LifeContext): void {
    const navigation = actor.navigation;
    navigation.detourCount++;
    navigation.repathAfter = context.time.seconds + 8;
    navigation.lastProgressAt = context.time.seconds;
    if (navigation.detourCount > 4) {
      navigation.failed = true;
      navigation.points.length = 0;
      stopWalking(actor);
      return;
    }
    context.routes.request(actor, navigation.finalTarget, context.time.seconds, 3);
  }

  private resolveOverlaps(context: LifeContext): void {
    context.neighbors.forEachPair(0.8, (first, second) => {
      if (!first.visible || !second.visible || first.vehicleId >= 0 || second.vehicleId >= 0) return;
      if (first.mode === "inside" || second.mode === "inside") return;
      const dx = second.position.x - first.position.x;
      const dz = second.position.z - first.position.z;
      const separation = Math.hypot(dx, dz);
      const required = first.radius + second.radius;
      if (separation >= required || separation < 0.00001) return;
      const correction = Math.min(0.08, (required - separation) * 0.5);
      const firstMoving = first.mode === "walking";
      const secondMoving = second.mode === "walking";
      const firstWeight = firstMoving && !secondMoving ? 1 : secondMoving && !firstMoving ? 0 : 0.5;
      const secondWeight = 1 - firstWeight;
      first.position.x -= dx / separation * correction * firstWeight;
      first.position.z -= dz / separation * correction * firstWeight;
      second.position.x += dx / separation * correction * secondWeight;
      second.position.z += dz / separation * correction * secondWeight;
      this.obstacles.constrain(first.position, first.radius, first.id);
      this.obstacles.constrain(second.position, second.radius, second.id);
    });
  }

  private correctInvalidPosition(actor: Actor, context: LifeContext): void {
    if (finitePoint(actor.position) && Math.abs(actor.position.x) < 1000 && Math.abs(actor.position.z) < 1000) return;
    const home = context.places.get(actor.homeId);
    const safe = home?.entrance ?? context.network.nodes[0]?.position ?? point();
    copyPoint(actor.position, safe);
    copyPoint(actor.previousPosition, safe);
    actor.velocity.x = 0;
    actor.velocity.z = 0;
    actor.speed = 0;
    actor.navigation.failed = true;
    actor.navigation.pending = false;
    actor.navigation.points.length = 0;
    context.routes.cancel(actor.id);
    context.crossings.releaseActor(actor.id);
  }

  followLeader(actor: Actor, leader: Actor, context: LifeContext, separation: number, side: number): void {
    const sin = Math.sin(leader.heading);
    const cos = Math.cos(leader.heading);
    this.projection.x = leader.position.x - sin * separation + cos * side;
    this.projection.z = leader.position.z - cos * separation - sin * side;
    if (distance(actor.position, this.projection) < 0.45) {
      actor.targetHeading = leader.heading;
      stopWalking(actor, leader.mode === "walking" ? "walking" : "waiting");
      return;
    }
    if (!actor.navigation.pending && distance(actor.navigation.finalTarget, this.projection) > 1.2) {
      context.routes.request(actor, this.projection, context.time.seconds, 3);
    }
  }

  reset(): void {
    this.edgeOccupancies.clear();
    this.neighbors.length = 0;
    this.vehicles.length = 0;
  }
}
