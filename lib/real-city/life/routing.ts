import { distance, distanceSquared, point, type Point2 } from "./math";
import type { Actor, LifeContext } from "./types";
import type { PedestrianNetwork, WalkEdge } from "./navigation";

interface RouteRequest {
  id: number;
  actorId: number;
  from: Point2;
  to: Point2;
  requestedAt: number;
  priority: number;
  allowCrowds: boolean;
  accessible: boolean;
  retry: number;
}

export interface WalkRoute {
  nodeIds: number[];
  edgeIds: number[];
  points: Point2[];
  length: number;
  estimatedSeconds: number;
  crossings: number;
  accessible: boolean;
  version: number;
}

interface HeapEntry {
  id: number;
  score: number;
}

class RouteHeap {
  private entries: HeapEntry[] = [];

  clear(): void {
    this.entries.length = 0;
  }

  push(id: number, score: number): void {
    const entry = { id, score };
    let index = this.entries.length;
    this.entries.push(entry);
    while (index > 0) {
      const parent = (index - 1) >>> 1;
      if (this.entries[parent].score <= score) break;
      this.entries[index] = this.entries[parent];
      index = parent;
    }
    this.entries[index] = entry;
  }

  pop(): HeapEntry | undefined {
    if (this.entries.length === 0) return undefined;
    const minimum = this.entries[0];
    const last = this.entries.pop()!;
    if (this.entries.length === 0) return minimum;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.entries.length) break;
      const child = right < this.entries.length && this.entries[right].score < this.entries[left].score ? right : left;
      if (this.entries[child].score >= last.score) break;
      this.entries[index] = this.entries[child];
      index = child;
    }
    this.entries[index] = last;
    return minimum;
  }

  get length(): number {
    return this.entries.length;
  }
}

export class RoutePlanner {
  private nextRequest = 1;
  private readonly pending: RouteRequest[] = [];
  private readonly byActor = new Map<number, RouteRequest>();
  private readonly cache = new Map<string, WalkRoute>();
  private readonly open = new RouteHeap();
  private readonly score: Float64Array;
  private readonly parentNode: Int32Array;
  private readonly parentEdge: Int32Array;
  private readonly closed: Uint8Array;
  private cacheVersion = -1;

  constructor(private readonly network: PedestrianNetwork) {
    this.score = new Float64Array(network.nodes.length);
    this.parentNode = new Int32Array(network.nodes.length);
    this.parentEdge = new Int32Array(network.nodes.length);
    this.closed = new Uint8Array(network.nodes.length);
  }

  request(actor: Actor, destination: Point2, seconds: number, priority = 0): number {
    const previous = this.byActor.get(actor.id);
    if (previous && distanceSquared(previous.to, destination) < 0.04) {
      previous.priority = Math.max(previous.priority, priority);
      return previous.id;
    }
    this.cancel(actor.id);
    const request: RouteRequest = {
      id: this.nextRequest++,
      actorId: actor.id,
      from: { ...actor.position },
      to: { ...destination },
      requestedAt: seconds,
      priority,
      allowCrowds: actor.personality.patience > 0.5,
      accessible: actor.mobility !== "ordinary" || actor.age === "elder",
      retry: 0,
    };
    this.pending.push(request);
    this.byActor.set(actor.id, request);
    actor.navigation.pending = true;
    actor.navigation.failed = false;
    actor.navigation.arrived = false;
    actor.navigation.requestId = request.id;
    actor.navigation.requestedAt = seconds;
    actor.navigation.finalTarget.x = destination.x;
    actor.navigation.finalTarget.z = destination.z;
    return request.id;
  }

  cancel(actorId: number): void {
    const request = this.byActor.get(actorId);
    if (!request) return;
    this.byActor.delete(actorId);
    const index = this.pending.indexOf(request);
    if (index >= 0) this.pending.splice(index, 1);
  }

  tick(context: LifeContext): void {
    if (this.network.version !== this.cacheVersion) {
      this.cache.clear();
      this.cacheVersion = this.network.version;
    }
    if (this.pending.length === 0) return;
    this.pending.sort((a, b) => {
      const ageA = (context.time.seconds - a.requestedAt) * 0.1;
      const ageB = (context.time.seconds - b.requestedAt) * 0.1;
      return b.priority + ageB - a.priority - ageA || a.id - b.id;
    });
    let budget = 3;
    while (budget-- > 0 && this.pending.length > 0) {
      const request = this.pending.shift()!;
      this.byActor.delete(request.actorId);
      const actor = context.actorById.get(request.actorId);
      if (!actor || actor.navigation.requestId !== request.id) continue;
      request.from.x = actor.position.x;
      request.from.z = actor.position.z;
      const route = this.findRoute(request.from, request.to, context.time.seconds, request.accessible, request.allowCrowds, actor.baseSpeed);
      actor.navigation.pending = false;
      if (!route) {
        actor.navigation.failed = true;
        actor.navigation.repathAfter = context.time.seconds + 8;
        actor.navigation.nodePath.length = 0;
        actor.navigation.edgePath.length = 0;
        actor.navigation.points.length = 0;
        actor.mode = "waiting";
        context.stats.routeFailures++;
        continue;
      }
      this.assign(actor, route, context.time.seconds);
    }
  }

  private assign(actor: Actor, route: WalkRoute, seconds: number): void {
    const navigation = actor.navigation;
    navigation.nodePath = [...route.nodeIds];
    navigation.edgePath = [...route.edgeIds];
    navigation.points = route.points.map((position) => ({ ...position }));
    navigation.cursor = 0;
    navigation.origin.x = actor.position.x;
    navigation.origin.z = actor.position.z;
    navigation.plannedDistance = route.length;
    navigation.distanceRemaining = route.length;
    navigation.lastDistance = route.length;
    navigation.lastProgressAt = seconds;
    navigation.version = route.version;
    navigation.failed = false;
    navigation.arrived = route.length < 0.2;
    navigation.arrivedAt = navigation.arrived ? seconds : -1;
    navigation.crossingId = -1;
    navigation.blockedSince = 0;
    navigation.lane = actor.id % 2 === 0 ? 0.22 : -0.22;
    if (!navigation.arrived) actor.mode = "walking";
  }

  findRoute(from: Point2, to: Point2, seconds: number, accessible = false, allowCrowds = true, speed = 1.3): WalkRoute | undefined {
    const start = this.network.nearest(from, (node) => (!accessible || node.accessible)
      && this.network.walkableSegment(from, node.position));
    if (!start) return undefined;
    const end = this.network.nearest(to, (node) => node.component === start.component
      && (!accessible || node.accessible) && this.network.walkableSegment(node.position, to));
    if (!end) return undefined;
    if (distance(end.position, to) > 28) return undefined;
    if (distance(from, to) < 2 && this.network.walkableSegment(from, to)) {
      return {
        nodeIds: [start.id],
        edgeIds: [],
        points: [{ ...to }],
        length: distance(from, to),
        estimatedSeconds: distance(from, to) / speed,
        crossings: 0,
        accessible,
        version: this.network.version,
      };
    }
    const key = `${start.id}:${end.id}:${accessible ? 1 : 0}:${allowCrowds ? 1 : 0}`;
    const cached = this.cache.get(key);
    if (cached && cached.version === this.network.version && this.routeIsOpen(cached, seconds)) {
      return this.withEndpoints(cached, from, to, speed);
    }
    const route = this.search(start.id, end.id, seconds, accessible, allowCrowds, speed);
    if (!route) return undefined;
    if (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, route);
    return this.withEndpoints(route, from, to, speed);
  }

  private search(start: number, end: number, seconds: number, accessible: boolean, allowCrowds: boolean, speed: number): WalkRoute | undefined {
    this.score.fill(Infinity);
    this.parentNode.fill(-1);
    this.parentEdge.fill(-1);
    this.closed.fill(0);
    this.open.clear();
    this.score[start] = 0;
    const target = this.network.nodes[end];
    this.open.push(start, distance(this.network.nodes[start].position, target.position));
    let visited = 0;
    while (this.open.length > 0 && visited < 2400) {
      const entry = this.open.pop()!;
      if (this.closed[entry.id]) continue;
      if (entry.id === end) return this.reconstruct(start, end, speed, accessible);
      this.closed[entry.id] = 1;
      visited++;
      const current = this.network.nodes[entry.id];
      for (const edgeId of current.edges) {
        const edge = this.network.edges[edgeId];
        if (edge.closedUntil > seconds) continue;
        if (accessible && (!edge.accessible || Math.abs(edge.slope) > 0.08)) continue;
        const neighborId = this.network.other(edge, current.id);
        const neighbor = this.network.nodes[neighborId];
        if (this.closed[neighborId] || (accessible && !neighbor.accessible)) continue;
        const cost = this.edgeCost(edge, allowCrowds, accessible);
        const candidate = this.score[current.id] + cost;
        if (candidate >= this.score[neighborId]) continue;
        this.score[neighborId] = candidate;
        this.parentNode[neighborId] = current.id;
        this.parentEdge[neighborId] = edge.id;
        const heuristic = distance(neighbor.position, target.position);
        this.open.push(neighborId, candidate + heuristic);
      }
    }
    return undefined;
  }

  private edgeCost(edge: WalkEdge, allowCrowds: boolean, accessible: boolean): number {
    const congestion = edge.crowd * (allowCrowds ? 1.5 : 3.5);
    const narrow = Math.max(0, 2.1 - edge.width) * (accessible ? 2.2 : 0.7);
    const crossing = edge.surface === "crosswalk" ? (accessible ? 5 : 3) : 0;
    const slope = Math.abs(edge.slope) * (accessible ? 30 : 8);
    return edge.distance * (1 + congestion + narrow + slope) + crossing;
  }

  private reconstruct(start: number, end: number, speed: number, accessible: boolean): WalkRoute | undefined {
    const nodeIds: number[] = [end];
    const edgeIds: number[] = [];
    let current = end;
    let length = 0;
    let crossingCount = 0;
    while (current !== start) {
      const edgeId = this.parentEdge[current];
      const previous = this.parentNode[current];
      if (edgeId < 0 || previous < 0) return undefined;
      const edge = this.network.edges[edgeId];
      length += edge.distance;
      if (edge.crossingId >= 0) crossingCount++;
      edgeIds.push(edgeId);
      nodeIds.push(previous);
      current = previous;
      if (nodeIds.length > this.network.nodes.length) return undefined;
    }
    nodeIds.reverse();
    edgeIds.reverse();
    return {
      nodeIds,
      edgeIds,
      points: nodeIds.map((id) => ({ ...this.network.nodes[id].position })),
      length,
      estimatedSeconds: length / Math.max(0.4, speed) + crossingCount * 2,
      crossings: crossingCount,
      accessible,
      version: this.network.version,
    };
  }

  private withEndpoints(route: WalkRoute, from: Point2, to: Point2, speed: number): WalkRoute {
    const points = route.points.map((position) => ({ ...position }));
    let length = route.length;
    if (points.length > 0) {
      length += distance(from, points[0]);
      length += distance(points[points.length - 1], to);
      if (distanceSquared(points[points.length - 1], to) > 0.04) points.push({ ...to });
    } else {
      points.push({ ...to });
      length = distance(from, to);
    }
    return {
      ...route,
      points,
      length,
      estimatedSeconds: length / Math.max(0.4, speed) + route.crossings * 2,
    };
  }

  private routeIsOpen(route: WalkRoute, seconds: number): boolean {
    for (const edgeId of route.edgeIds) {
      if (this.network.edges[edgeId].closedUntil > seconds) return false;
    }
    return true;
  }

  estimate(from: Point2, to: Point2, speed: number): number {
    const direct = distance(from, to);
    const correction = this.network.walkableSegment(from, to) ? 1.12 : 1.5;
    return direct * correction / Math.max(0.4, speed);
  }

  isReachable(from: Point2, to: Point2): boolean {
    const start = this.network.nearest(from);
    const end = this.network.nearest(to);
    return Boolean(start && end && this.network.reachable(start.id, end.id));
  }

  nearestReachableTarget(actor: Actor, targets: readonly Point2[]): Point2 | undefined {
    let best: Point2 | undefined;
    let score = Infinity;
    for (const target of targets) {
      const candidate = distanceSquared(actor.position, target);
      if (candidate >= score || !this.isReachable(actor.position, target)) continue;
      best = target;
      score = candidate;
    }
    return best;
  }

  reset(): void {
    this.pending.length = 0;
    this.byActor.clear();
    this.cache.clear();
    this.nextRequest = 1;
    this.cacheVersion = this.network.version;
  }

  get pendingCount(): number {
    return this.pending.length;
  }
}
