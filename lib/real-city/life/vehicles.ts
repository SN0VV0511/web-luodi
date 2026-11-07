import { approach, approachAngle, clamp, distance, lerp, point, type Point2 } from "./math";
import { ServiceRoadNetwork, type CurbAccess } from "./service-roads";
import type { LifeContext, LifeVehicle, VehicleKind } from "./types";

interface VehicleControl {
  id: number;
  acceleration: number;
  desiredAcceleration: number;
  routeLength: number;
  routeTravel: number;
  destination: Point2;
  home: Point2;
  assigned: boolean;
  parked: boolean;
  routeFailed: boolean;
  lastMovingAt: number;
  requestAt: number;
  emergencyRequest: boolean;
  doorBlockUntil: number;
  collisionYield: number;
  battery: number;
  fuel: number;
  temperature: number;
  odometer: number;
}

export class NeighborhoodFleet {
  readonly roads = new ServiceRoadNetwork();
  private readonly controls = new Map<number, VehicleControl>();
  private nextId = 1;
  private readonly projected = point();

  reset(context: LifeContext): void {
    context.vehicles.length = 0;
    this.controls.clear();
    this.nextId = 1;
    const stops = context.places.ofKind("bus-stop");
    if (stops.length > 1) {
      this.create("bus", stops[0].entrance, "#a7b5a0", context);
      this.create("bus", stops[Math.floor(stops.length / 2)].entrance, "#b7b19c", context);
    }
    for (const stand of context.places.ofKind("taxi-stand")) this.create("taxi", stand.entrance, "#c9b375", context);
    const clinic = context.places.ofKind("clinic")[0];
    if (clinic) this.create("ambulance", clinic.entrance, "#d6d9ca", context);
    const police = context.places.ofKind("police")[0];
    if (police) this.create("police", police.entrance, "#698392", context);
  }

  create(kind: VehicleKind, origin: Point2, color: string, context: LifeContext): LifeVehicle | undefined {
    if (context.vehicles.length >= 12) return undefined;
    const curb = this.roads.nearestCurb(origin);
    if (!curb || curb.distance > 30) return undefined;
    const id = this.nextId++;
    const vehicle: LifeVehicle = {
      id,
      kind,
      position: { ...curb.road },
      previousPosition: { ...curb.road },
      heading: curb.heading,
      previousHeading: curb.heading,
      velocity: point(),
      speed: 0,
      targetSpeed: 0,
      route: [],
      routeCursor: 0,
      distanceTravelled: 0,
      wheelPhase: 0,
      suspension: 0,
      suspensionVelocity: 0,
      steering: 0,
      brake: 1,
      turnSignal: 0,
      doors: 0,
      doorTarget: 0,
      occupancy: [],
      capacity: kind === "bus" ? 12 : kind === "taxi" ? 3 : kind === "ambulance" ? 2 : 3,
      visible: true,
      interior: false,
      emergency: false,
      siren: false,
      stoppedUntil: context.time.seconds + 2,
      driverId: -1,
      serviceId: -1,
      load: 0,
      color,
    };
    context.vehicles.push(vehicle);
    this.controls.set(id, {
      id,
      acceleration: 0,
      desiredAcceleration: 0,
      routeLength: 0,
      routeTravel: 0,
      destination: { ...curb.road },
      home: { ...origin },
      assigned: false,
      parked: true,
      routeFailed: false,
      lastMovingAt: context.time.seconds,
      requestAt: context.time.seconds,
      emergencyRequest: false,
      doorBlockUntil: 0,
      collisionYield: 0,
      battery: 1,
      fuel: 1,
      temperature: 20,
      odometer: 0,
    });
    return vehicle;
  }

  available(kind: VehicleKind, origin: Point2, context: LifeContext): LifeVehicle | undefined {
    let best: LifeVehicle | undefined;
    let bestDistance = Infinity;
    for (const vehicle of context.vehicles) {
      if (vehicle.kind !== kind || !vehicle.visible || vehicle.occupancy.length >= vehicle.capacity) continue;
      const control = this.controls.get(vehicle.id);
      if (!control || control.assigned || control.fuel < 0.05) continue;
      const separation = distance(origin, vehicle.position);
      if (separation < bestDistance) {
        best = vehicle;
        bestDistance = separation;
      }
    }
    return best;
  }

  claim(vehicle: LifeVehicle, serviceId: number): boolean {
    const control = this.controls.get(vehicle.id);
    if (!control || control.assigned) return false;
    control.assigned = true;
    vehicle.serviceId = serviceId;
    return true;
  }

  release(vehicle: LifeVehicle, context: LifeContext, returnHome = false): void {
    const control = this.controls.get(vehicle.id);
    if (!control) return;
    control.assigned = false;
    control.emergencyRequest = false;
    vehicle.serviceId = -1;
    vehicle.emergency = false;
    vehicle.siren = false;
    vehicle.doorTarget = 0;
    if (returnHome && vehicle.occupancy.length === 0) this.driveTo(vehicle, control.home, context);
  }

  driveTo(vehicle: LifeVehicle, target: Point2, context: LifeContext, emergency = false): boolean {
    const control = this.controls.get(vehicle.id);
    if (!control) return false;
    const destination = this.roads.nearestCurb(target);
    if (!destination) return false;
    const route = this.roads.route(vehicle.position, target);
    if (route.length < 2) {
      control.routeFailed = true;
      return false;
    }
    vehicle.route = route;
    vehicle.routeCursor = 1;
    vehicle.doorTarget = 0;
    vehicle.stoppedUntil = Math.max(vehicle.stoppedUntil, context.time.seconds + Math.max(0.5, vehicle.doors * 1.5));
    control.destination = { ...destination.road };
    control.routeLength = this.roads.routeLength(route);
    control.routeTravel = 0;
    control.routeFailed = false;
    control.parked = false;
    control.requestAt = context.time.seconds;
    control.emergencyRequest = emergency;
    vehicle.emergency = emergency;
    vehicle.siren = emergency;
    return true;
  }

  curb(position: Point2): CurbAccess | undefined {
    return this.roads.nearestCurb(position);
  }

  atDestination(vehicle: LifeVehicle): boolean {
    const control = this.controls.get(vehicle.id);
    return !!control?.parked && vehicle.speed < 0.1;
  }

  progress(vehicle: LifeVehicle): number {
    const control = this.controls.get(vehicle.id);
    if (!control) return 0;
    if (control.parked) return 1;
    return clamp(control.routeTravel / Math.max(1, control.routeLength), 0, 1);
  }

  failed(vehicle: LifeVehicle): boolean {
    return this.controls.get(vehicle.id)?.routeFailed ?? true;
  }

  openDoors(vehicle: LifeVehicle, context: LifeContext, duration = 5): boolean {
    if (vehicle.speed > 0.08) return false;
    vehicle.doorTarget = 1;
    vehicle.stoppedUntil = Math.max(vehicle.stoppedUntil, context.time.seconds + duration);
    const control = this.controls.get(vehicle.id);
    if (control) control.doorBlockUntil = context.time.seconds + duration;
    return vehicle.doors > 0.85;
  }

  closeDoors(vehicle: LifeVehicle): void {
    vehicle.doorTarget = 0;
  }

  board(vehicle: LifeVehicle, actorId: number, context: LifeContext): boolean {
    const actor = context.actorById.get(actorId);
    if (!actor || vehicle.speed > 0.08 || vehicle.doors < 0.8) return false;
    if (vehicle.occupancy.includes(actorId)) return true;
    if (vehicle.occupancy.length >= vehicle.capacity) return false;
    vehicle.occupancy.push(actorId);
    actor.vehicleId = vehicle.id;
    actor.seatIndex = vehicle.occupancy.length - 1;
    actor.mode = "riding";
    actor.visible = false;
    actor.navigation.pending = false;
    actor.navigation.points.length = 0;
    actor.velocity.x = 0;
    actor.velocity.z = 0;
    context.routes.cancel(actor.id);
    context.crossings.releaseActor(actor.id);
    context.queues.leave(actor.id);
    context.reservations.releaseActor(actor.id);
    return true;
  }

  alight(vehicle: LifeVehicle, actorId: number, destination: Point2, context: LifeContext): boolean {
    const actor = context.actorById.get(actorId);
    const index = vehicle.occupancy.indexOf(actorId);
    if (!actor || index < 0 || vehicle.speed > 0.08 || vehicle.doors < 0.8) return false;
    vehicle.occupancy.splice(index, 1);
    actor.vehicleId = -1;
    actor.seatIndex = -1;
    actor.visible = true;
    actor.mode = "idle";
    actor.position.x = destination.x + (index % 2 - 0.5) * 0.45;
    actor.position.z = destination.z;
    actor.previousPosition.x = actor.position.x;
    actor.previousPosition.z = actor.position.z;
    actor.heading = vehicle.heading + Math.PI / 2;
    actor.previousHeading = actor.heading;
    actor.targetHeading = actor.heading;
    actor.navigation.arrived = true;
    actor.navigation.failed = false;
    actor.navigation.pending = false;
    actor.navigation.points.length = 0;
    actor.navigation.cursor = 0;
    for (let seat = 0; seat < vehicle.occupancy.length; seat++) {
      const occupant = context.actorById.get(vehicle.occupancy[seat]);
      if (occupant) occupant.seatIndex = seat;
    }
    context.stats.completedTrips++;
    return true;
  }

  tick(context: LifeContext): void {
    for (const vehicle of context.vehicles) {
      const control = this.controls.get(vehicle.id);
      if (!control || !vehicle.visible) continue;
      vehicle.previousPosition.x = vehicle.position.x;
      vehicle.previousPosition.z = vehicle.position.z;
      vehicle.previousHeading = vehicle.heading;
      vehicle.doors = approach(vehicle.doors, vehicle.doorTarget, context.time.dt * 1.1);
      if (control.parked) this.parkedTick(vehicle, control, context);
      else this.driveTick(vehicle, control, context);
      this.suspensionTick(vehicle, control, context);
      this.energyTick(vehicle, control, context);
      this.passengersTick(vehicle, context);
    }
  }

  private parkedTick(vehicle: LifeVehicle, control: VehicleControl, context: LifeContext): void {
    vehicle.targetSpeed = 0;
    vehicle.speed = approach(vehicle.speed, 0, context.time.dt * 3);
    vehicle.velocity.x = 0;
    vehicle.velocity.z = 0;
    vehicle.brake = 1;
    vehicle.turnSignal = 0;
    control.acceleration = approach(control.acceleration, 0, context.time.dt);
    if (vehicle.doorTarget > 0 && context.time.seconds > control.doorBlockUntil && vehicle.kind !== "bus") vehicle.doorTarget = 0;
  }

  private driveTick(vehicle: LifeVehicle, control: VehicleControl, context: LifeContext): void {
    const target = vehicle.route[vehicle.routeCursor];
    if (!target) {
      control.parked = true;
      vehicle.speed = 0;
      vehicle.targetSpeed = 0;
      return;
    }
    const dx = target.x - vehicle.position.x;
    const dz = target.z - vehicle.position.z;
    const distanceToTarget = Math.hypot(dx, dz);
    if (distanceToTarget < Math.max(0.35, vehicle.speed * context.time.dt * 1.3)) {
      vehicle.routeCursor++;
      if (vehicle.routeCursor >= vehicle.route.length) {
        vehicle.position.x = target.x;
        vehicle.position.z = target.z;
        control.parked = true;
        vehicle.speed = 0;
        vehicle.velocity.x = 0;
        vehicle.velocity.z = 0;
        return;
      }
    }
    const unitX = distanceToTarget > 0.001 ? dx / distanceToTarget : Math.sin(vehicle.heading);
    const unitZ = distanceToTarget > 0.001 ? dz / distanceToTarget : Math.cos(vehicle.heading);
    const desiredHeading = Math.atan2(unitX, unitZ);
    const turning = Math.acos(clamp(Math.sin(vehicle.heading) * unitX + Math.cos(vehicle.heading) * unitZ, -1, 1));
    const maximumSpeed = vehicle.kind === "bus" ? 6.8 : control.emergencyRequest ? 9 : 7.8;
    let desiredSpeed = maximumSpeed * (1 - context.weather.wetGround * 0.2 - context.weather.snow * 0.35);
    if (turning > 0.15) desiredSpeed = Math.min(desiredSpeed, 2.8 + 2 / (1 + turning * 4));
    const remaining = this.remainingDistance(vehicle);
    desiredSpeed = Math.min(desiredSpeed, Math.sqrt(Math.max(0, remaining * 3)));
    if (!context.crossings.vehicleAllowed(vehicle, target, context.time.seconds)) desiredSpeed = 0;
    if (control.emergencyRequest) context.crossings.requestEmergencyPass(vehicle.position, context.time.seconds, 3);
    const headway = this.nearestObstacle(vehicle, unitX, unitZ, context);
    if (headway < 40) desiredSpeed = Math.min(desiredSpeed, Math.sqrt(Math.max(0, (headway - 2.5) * 3)));
    if (vehicle.doors > 0.03 || vehicle.stoppedUntil > context.time.seconds) desiredSpeed = 0;
    if (control.collisionYield > context.time.seconds) desiredSpeed = 0;
    if (control.fuel <= 0.01) desiredSpeed = 0;
    vehicle.targetSpeed = Math.max(0, desiredSpeed);
    const maxAcceleration = vehicle.kind === "bus" ? 1.0 : 1.6;
    const maxBraking = headway < 3 ? 5 : 2.5;
    control.desiredAcceleration = clamp((vehicle.targetSpeed - vehicle.speed) * 1.7, -maxBraking, maxAcceleration);
    control.acceleration = approach(control.acceleration, control.desiredAcceleration, context.time.dt * 3.4);
    vehicle.speed = Math.max(0, vehicle.speed + control.acceleration * context.time.dt);
    vehicle.brake = clamp(-control.acceleration / maxBraking, 0, 1);
    vehicle.heading = approachAngle(vehicle.heading, desiredHeading, context.time.dt * (0.45 + vehicle.speed * 0.11));
    vehicle.steering = lerp(vehicle.steering, clamp(turning * Math.sign(unitX * Math.cos(vehicle.heading) - unitZ * Math.sin(vehicle.heading)), -0.6, 0.6), context.time.dt * 5);
    const travel = Math.min(distanceToTarget, vehicle.speed * context.time.dt);
    vehicle.velocity.x = unitX * vehicle.speed;
    vehicle.velocity.z = unitZ * vehicle.speed;
    vehicle.position.x += unitX * travel;
    vehicle.position.z += unitZ * travel;
    vehicle.distanceTravelled += travel;
    control.routeTravel += travel;
    control.odometer += travel;
    vehicle.wheelPhase += travel / (vehicle.kind === "bus" ? 0.44 : 0.34);
    vehicle.turnSignal = turning > 0.18 ? Math.sign(vehicle.steering) : 0;
    if (vehicle.speed > 0.1) control.lastMovingAt = context.time.seconds;
    else if (context.time.seconds - control.lastMovingAt > 70 && headway > 5) {
      control.lastMovingAt = context.time.seconds;
      this.driveTo(vehicle, control.destination, context, control.emergencyRequest);
    }
  }

  private nearestObstacle(vehicle: LifeVehicle, dx: number, dz: number, context: LifeContext): number {
    let nearest = Infinity;
    const halfLength = vehicle.kind === "bus" ? 4.6 : 2.5;
    for (const other of context.vehicles) {
      if (other.id === vehicle.id || !other.visible) continue;
      const rx = other.position.x - vehicle.position.x;
      const rz = other.position.z - vehicle.position.z;
      const forward = rx * dx + rz * dz;
      const lateral = Math.abs(rx * dz - rz * dx);
      const otherLength = other.kind === "bus" ? 4.6 : 2.5;
      if (forward > 0 && lateral < 2.1) nearest = Math.min(nearest, forward - halfLength - otherLength);
    }
    for (const obstacle of context.trafficObstacles) {
      const rx = obstacle.x - vehicle.position.x;
      const rz = obstacle.z - vehicle.position.z;
      const forward = rx * dx + rz * dz;
      const lateral = Math.abs(rx * dz - rz * dx);
      if (forward > 0 && lateral < 1.2 + Math.min(obstacle.radius, 1.8)) nearest = Math.min(nearest, forward - halfLength - obstacle.radius);
    }
    for (const actor of context.actors) {
      if (!actor.visible || actor.vehicleId >= 0) continue;
      const rx = actor.position.x - vehicle.position.x;
      const rz = actor.position.z - vehicle.position.z;
      const forward = rx * dx + rz * dz;
      const lateral = Math.abs(rx * dz - rz * dx);
      if (forward > 0 && lateral < 1.2 + actor.radius) nearest = Math.min(nearest, forward - halfLength - actor.radius - 0.5);
    }
    return nearest;
  }

  private remainingDistance(vehicle: LifeVehicle): number {
    let remaining = 0;
    let previous = vehicle.position;
    for (let index = vehicle.routeCursor; index < vehicle.route.length; index++) {
      remaining += distance(previous, vehicle.route[index]);
      previous = vehicle.route[index];
    }
    return remaining;
  }

  private suspensionTick(vehicle: LifeVehicle, control: VehicleControl, context: LifeContext): void {
    const roadVibration = Math.sin(vehicle.distanceTravelled * 2.2) * Math.sin(vehicle.distanceTravelled * 0.7) * Math.min(0.012, vehicle.speed * 0.002);
    const target = roadVibration - Math.min(0.015, vehicle.occupancy.length * 0.001);
    const acceleration = (target - vehicle.suspension) * 75 - vehicle.suspensionVelocity * 13;
    vehicle.suspensionVelocity += acceleration * context.time.dt;
    vehicle.suspension = clamp(vehicle.suspension + vehicle.suspensionVelocity * context.time.dt, -0.04, 0.04);
    if (Math.abs(control.acceleration) > 2.5) vehicle.suspension += Math.sin(context.time.seconds * 7) * 0.001;
  }

  private energyTick(vehicle: LifeVehicle, control: VehicleControl, context: LifeContext): void {
    const load = 1 + vehicle.occupancy.length * 0.02;
    const consumption = vehicle.speed * 0.0000018 * load + Math.max(0, control.acceleration) * 0.000003;
    control.fuel = Math.max(0, control.fuel - consumption * context.time.dt);
    control.temperature += ((vehicle.speed > 0 ? 64 : context.weather.temperature) - control.temperature) * context.time.dt * 0.005;
    if (control.parked && distance(vehicle.position, control.home) < 15 && !control.assigned) control.fuel = Math.min(1, control.fuel + context.time.dt * 0.0004);
    if (vehicle.siren) control.battery = Math.max(0.1, control.battery - context.time.dt * 0.00002);
    else control.battery = Math.min(1, control.battery + context.time.dt * 0.00003);
  }

  private passengersTick(vehicle: LifeVehicle, context: LifeContext): void {
    for (const id of vehicle.occupancy) {
      const actor = context.actorById.get(id);
      if (!actor) continue;
      actor.previousPosition.x = actor.position.x;
      actor.previousPosition.z = actor.position.z;
      actor.position.x = vehicle.position.x;
      actor.position.z = vehicle.position.z;
      actor.needs.energy = Math.min(1, actor.needs.energy + context.time.dt * 0.001);
      actor.needs.comfort = clamp(actor.needs.comfort + context.time.dt * (Math.abs(vehicle.steering) > 0.35 ? -0.002 : 0.0007), 0, 1);
    }
  }

  obstacles(context: LifeContext): { x: number; z: number; radius: number; until: number }[] {
    const result: { x: number; z: number; radius: number; until: number }[] = [];
    for (const vehicle of context.vehicles) {
      if (!vehicle.visible) continue;
      const spacing = vehicle.kind === "bus" ? 2.8 : 1.25;
      for (const offset of [-spacing, 0, spacing]) result.push({
        x: vehicle.position.x + Math.sin(vehicle.heading) * offset,
        z: vehicle.position.z + Math.cos(vehicle.heading) * offset,
        radius: vehicle.kind === "bus" ? 1.35 : 1.1,
        until: context.time.seconds + 0.3,
      });
    }
    return result;
  }
}
