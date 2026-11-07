import * as THREE from "three";
import type { CivicKit } from "../../city-civic";
import type { SeasonState } from "../../city-seasons";
import { cityDetailBudget, type CityBuiltSite, type CityDetailBudget } from "../contracts";
import type { CityLifeSnapshot } from "../snapshot";
import { CityLifeClock } from "./clock";
import { PlaceDirectory } from "./places";
import { PedestrianNetwork } from "./navigation";
import { RoutePlanner } from "./routing";
import { DestinationReservations } from "./reservations";
import { QueueManager } from "./queues";
import { SceneProps } from "./props-state";
import { NeighborhoodEvents } from "./events";
import { SpatialNeighbors } from "./spatial";
import { CrossingSignals } from "./crossings";
import { LifeObstacles } from "./obstacles";
import { createLifeStats, createPopulation, refreshPopulationStats } from "./population";
import { RandomStream } from "./random";
import { ResidentNeeds } from "./needs";
import { ResidentWeather, createLifeWeather } from "./weather";
import { ResidentItineraries } from "./itinerary";
import { WorkAndHome } from "./work";
import { FoodAndCoffee } from "./food";
import { NeighborhoodRetail } from "./retail";
import { NeighborhoodDelivery } from "./delivery";
import { NeighborhoodMaintenance } from "./maintenance";
import { NeighborhoodLeisure } from "./leisure";
import { NeighborhoodSchool } from "./school";
import { NeighborhoodFleet } from "./vehicles";
import { NeighborhoodTransport } from "./transport";
import { NeighborhoodSocial } from "./social";
import { NeighborhoodAssistance } from "./assistance";
import { ResidentAttention } from "./attention";
import { ResidentPossessions } from "./possessions";
import { NeighborhoodParticipation } from "./participation";
import { NeighborhoodSports } from "./sports";
import { BuildingPassages } from "./passages";
import { NeighborhoodHouseholds } from "./households";
import { NeighborhoodAmenities } from "./amenities";
import { PedestrianCourtesy } from "./courtesy";
import { NeighborhoodCycling } from "./cycling";
import { NeighborhoodLostProperty } from "./lost-property";
import { PedestrianMovement } from "./movement";
import { ResidentPoses } from "./pose";
import { LifeRenderer } from "./renderer";
import { clearTransientProps, inventoryReset, leaveInterior, setGesture, stopWalking } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem, TaskKind } from "./types";

export interface DetailedCityLife {
  animate(seconds: number, night: boolean, season: SeasonState): void;
  snapshot(): CityLifeSnapshot;
  getDoorOccupants(): { x: number; y?: number; z: number }[];
  getCrossingObstacles(): { x: number; z: number; radius: number; until: number }[];
  setTrafficObstacles(obstacles: { x: number; z: number; radius: number; speed?: number; heading?: number }[]): void;
  dispose(): void;
}

export interface DetailedLifeOptions {
  sites?: readonly CityBuiltSite[];
  budget?: CityDetailBudget;
  onFootstep?: (position: THREE.Vector3, strength: number, seconds: number, heading: number) => void;
}

export function buildDetailedCityLife(kit: CivicKit, options: DetailedLifeOptions = {}): DetailedCityLife {
  const sites = options.sites ?? [];
  const budget = options.budget ?? cityDetailBudget();
  const maximumActors = Math.max(24, Math.min(96, Math.floor(budget.movingPeople)));
  const clock = new CityLifeClock();
  const places = new PlaceDirectory(sites);
  const network = new PedestrianNetwork(places);
  const routes = new RoutePlanner(network);
  const reservations = new DestinationReservations(places);
  const queues = new QueueManager();
  const props = new SceneProps();
  const events = new NeighborhoodEvents();
  const neighbors = new SpatialNeighbors();
  const crossings = new CrossingSignals(network);
  const passages = new BuildingPassages(places, sites);
  const obstacles = new LifeObstacles(network, sites);
  const actors = createPopulation(places, maximumActors);
  const needs = new ResidentNeeds();
  const weather = new ResidentWeather();
  const itineraries = new ResidentItineraries(needs);
  const movement = new PedestrianMovement(obstacles);
  const attention = new ResidentAttention();
  const possessions = new ResidentPossessions();
  const courtesy = new PedestrianCourtesy();
  const footstepPosition = new THREE.Vector3();
  const poses = new ResidentPoses(options.onFootstep ? (position, strength, seconds, heading) => {
    footstepPosition.set(position.x, position.y, position.z);
    options.onFootstep!(footstepPosition, strength, seconds, heading);
  } : undefined);
  const renderer = new LifeRenderer(kit, maximumActors);
  const fleet = new NeighborhoodFleet();
  const cycling = new NeighborhoodCycling();
  const systems: LifeSystem[] = [
    new WorkAndHome(),
    new NeighborhoodAmenities(),
    new FoodAndCoffee(),
    new NeighborhoodRetail(),
    new NeighborhoodDelivery(),
    new NeighborhoodMaintenance(obstacles),
    new NeighborhoodSports(),
    new NeighborhoodLeisure(),
    new NeighborhoodSchool(),
    new NeighborhoodTransport(fleet),
    new NeighborhoodSocial(),
    new NeighborhoodAssistance(fleet),
    new NeighborhoodParticipation(),
    new NeighborhoodHouseholds(),
    cycling,
    new NeighborhoodLostProperty(),
  ];
  let nextTask = 1;
  let disposed = false;
  const releasing = new Set<number>();
  let lastSnapshotAt = -1;
  let lastSnapshot: CityLifeSnapshot = { residents: actors.length, activeActivities: [] };
  const doorOccupants: { x: number; y?: number; z: number }[] = [];
  const context: LifeContext = {
    actors,
    actorById: new Map(actors.map((actor) => [actor.id, actor])),
    vehicles: [],
    trafficObstacles: [],
    animals: [],
    time: clock.time,
    weather: createLifeWeather(),
    places,
    network,
    routes,
    reservations,
    queues,
    props,
    events,
    neighbors,
    crossings,
    passages,
    stats: createLifeStats(),
    random: new RandomStream(0x4c494645),
    issueTask,
    completeTask,
    interruptTask,
  };

  function issueTask(actor: Actor, kind: TaskKind, venueId: string, priority = 1): boolean {
    if (disposed || actor.task || actor.vehicleId >= 0) return false;
    const place = places.get(venueId);
    if (!place) return false;
    if (actor.interiorId) leaveInterior(actor, context);
    actor.task = {
      id: nextTask++,
      kind,
      phase: "start",
      venueId,
      target: { ...place.entrance },
      startedAt: context.time.seconds,
      changedAt: context.time.seconds,
      deadline: context.time.seconds + 300,
      until: context.time.seconds,
      progress: 0,
      partnerId: -1,
      serviceId: -1,
      reservationId: -1,
      queueId: "",
      priority,
      attempts: 0,
      payload: 0,
      option: "",
    };
    actor.visible = true;
    actor.mode = "idle";
    actor.navigation.failed = false;
    actor.navigation.arrived = false;
    actor.navigation.pending = false;
    actor.navigation.points.length = 0;
    actor.navigation.nodePath.length = 0;
    actor.navigation.edgePath.length = 0;
    actor.navigation.cursor = 0;
    actor.navigation.requestId = -1;
    actor.navigation.repathAfter = 0;
    actor.navigation.detourCount = 0;
    return true;
  }

  function releaseTask(actor: Actor): void {
    if (releasing.has(actor.id)) return;
    releasing.add(actor.id);
    for (const system of systems) system.releaseActor(actor, context);
    reservations.releaseActor(actor.id);
    queues.leave(actor.id);
    routes.cancel(actor.id);
    crossings.releaseActor(actor.id);
    passages.release(actor.id);
    obstacles.removeOwner(actor.id);
    events.finishActor(actor.id, context.time.seconds);
    clearTransientProps(actor, context);
    actor.navigation.points.length = 0;
    actor.navigation.nodePath.length = 0;
    actor.navigation.edgePath.length = 0;
    actor.navigation.pending = false;
    actor.navigation.failed = false;
    actor.navigation.arrived = true;
    actor.navigation.crossingId = -1;
    actor.conversationId = -1;
    actor.groupId = -1;
    actor.task = null;
    releasing.delete(actor.id);
  }

  function completeTask(actor: Actor, success = true): void {
    if (!actor.task || releasing.has(actor.id)) return;
    const previous = actor.task;
    releaseTask(actor);
    actor.lastTaskCompleted = context.time.seconds;
    actor.nextDecision = context.time.seconds + 1 + actor.id % 4 * 0.2;
    stopWalking(actor, actor.interiorId ? "inside" : "idle");
    setGesture(actor, "neutral", context.time.seconds, 0);
    if (success) context.stats.completedTasks++;
    else itineraries.recordFailure(actor, previous.venueId, context);
    if (actor.suspendedTask) {
      const suspended = actor.suspendedTask;
      actor.suspendedTask = null;
      if (suspended.deadline > context.time.seconds && places.get(suspended.venueId)) {
        issueTask(actor, suspended.kind, suspended.venueId, suspended.priority);
        if (actor.task) {
          const resumed = actor.task as ActorTask;
          resumed.option = suspended.option;
          resumed.payload = suspended.payload;
          resumed.deadline = suspended.deadline;
        }
      }
    }
  }

  function interruptTask(actor: Actor, kind: TaskKind, venueId: string, priority: number): boolean {
    if (actor.vehicleId >= 0 || actor.task && actor.task.priority >= priority) return false;
    const previous = actor.task ? { ...actor.task, target: { ...actor.task.target } } : null;
    if (actor.task) releaseTask(actor);
    if (!issueTask(actor, kind, venueId, priority)) {
      if (previous) issueTask(actor, previous.kind, previous.venueId, previous.priority);
      return false;
    }
    actor.suspendedTask = previous;
    return true;
  }

  function initialize(): void {
    lastSnapshotAt = -Infinity;
    lastSnapshot = { residents: actors.length, activeActivities: [] };
    inventoryReset();
    needs.reset();
    weather.reset(context);
    itineraries.reset(context);
    fleet.reset(context);
    for (const system of systems) system.reset(context);
    neighbors.rebuild(actors, context.vehicles);
    poses.tick(context);
    attention.tick(context);
    cycling.pose(context);
    renderer.render(context, 1);
  }

  function expireTasks(): void {
    for (const actor of actors) {
      if (!actor.task) continue;
      if (actor.task.deadline > context.time.seconds && !actor.navigation.failed) continue;
      if (actor.navigation.failed && actor.task.attempts < 2) {
        actor.task.attempts++;
        actor.navigation.failed = false;
        actor.navigation.repathAfter = context.time.seconds + 1;
        routes.request(actor, actor.task.target, context.time.seconds, actor.task.priority);
        continue;
      }
      completeTask(actor, false);
    }
  }

  function tick(): void {
    clock.step();
    network.clearExpiredClosures(context.time.seconds);
    reservations.tick(context.time.seconds);
    obstacles.tick(context.time.seconds);
    neighbors.rebuild(actors, context.vehicles);
    crossings.tick(context);
    passages.tick(context);
    weather.tick(context);
    needs.tick(context);
    itineraries.tick(context);
    events.tick(context);
    for (const system of systems) system.tick(context);
    fleet.tick(context);
    queues.tick(context);
    routes.tick(context);
    courtesy.tick(context);
    movement.tick(context);
    possessions.prepare(context);
    poses.tick(context);
    attention.tick(context);
    cycling.pose(context);
    props.tick(context);
    possessions.settle(context);
    cycling.renderState(context);
    expireTasks();
    refreshPopulationStats(actors, context.stats);
  }

  initialize();

  return {
    animate(seconds, night, season) {
      if (disposed) return;
      const start = typeof performance !== "undefined" ? performance.now() : 0;
      weather.setSeason(season);
      const advance = clock.advance(seconds, night, season.season);
      context.stats.droppedTime += advance.discarded;
      if (advance.reset) {
        for (const actor of actors) {
          if (actor.task) releaseTask(actor);
          actor.suspendedTask = null;
          actor.nextDecision = context.time.seconds + actor.id * 0.02;
        }
        network.reset();
        routes.reset();
        reservations.reset();
        queues.reset();
        props.reset();
        events.reset();
        crossings.reset();
        passages.reset();
        movement.reset();
        poses.reset();
        attention.reset();
        possessions.reset();
        courtesy.reset();
        initialize();
      }
      for (let step = 0; step < advance.steps; step++) tick();
      renderer.render(context, advance.alpha);
      context.stats.frameTime = typeof performance !== "undefined" ? performance.now() - start : 0;
    },
    snapshot() {
      if (context.time.seconds - lastSnapshotAt < 0.45) return lastSnapshot;
      lastSnapshotAt = context.time.seconds;
      lastSnapshot = {
        residents: actors.filter((actor) => actor.visible && !actor.interiorId).length,
        activeActivities: events.snapshot(context.time.seconds),
      };
      return lastSnapshot;
    },
    getCrossingObstacles() {
      if (disposed) return [];
      return [...crossings.obstacles(context), ...fleet.obstacles(context)];
    },
    getDoorOccupants() {
      if (disposed) { doorOccupants.length = 0; return doorOccupants; }
      return passages.sensorPositions(context);
    },
    setTrafficObstacles(incoming) {
      if (disposed) return;
      context.trafficObstacles.length = 0;
      for (const obstacle of incoming) {
        if (!Number.isFinite(obstacle.x) || !Number.isFinite(obstacle.z) || !Number.isFinite(obstacle.radius)) continue;
        if (obstacle.radius <= 0) continue;
        context.trafficObstacles.push({ ...obstacle, radius: Math.min(12, obstacle.radius) });
        if (context.trafficObstacles.length >= 160) break;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const actor of actors) if (actor.task) releaseTask(actor);
      for (const system of systems) system.reset(context);
      props.reset();
      routes.reset();
      reservations.reset();
      queues.reset();
      events.reset();
      crossings.reset();
      renderer.dispose();
      actors.length = 0;
      context.actorById.clear();
      context.vehicles.length = 0;
      context.animals.length = 0;
      context.trafficObstacles.length = 0;
    },
  };
}
