import { clamp, distance, localPoint, point } from "./math";
import { addItem, arrived, changePhase, failTask, facePoint, finishSatisfied, goTo, item, phaseFinished, phaseProgress, releaseReservation, removeItem, reserve, setGesture, stopWalking, transferItem } from "./actions";
import type { Actor, LifeContext, LifeSystem } from "./types";
import type { LifePlace } from "./places";

interface DeliveryJob {
  id: number;
  originId: string;
  destinationId: string;
  recipientId: number;
  item: string;
  quantity: number;
  weight: number;
  priority: number;
  createdAt: number;
  deadline: number;
  assignedTo: number;
  state: "pending" | "assigned" | "loaded" | "arrived" | "delivered" | "failed";
  attempts: number;
  parcelId: number;
  proofAt: number;
}

interface CourierRound {
  actorId: number;
  jobs: number[];
  index: number;
  load: number;
  cartProp: number;
  eventId: number;
  startedAt: number;
  returned: boolean;
}

export class NeighborhoodDelivery implements LifeSystem {
  private nextJob = 1;
  private readonly jobs = new Map<number, DeliveryJob>();
  private readonly rounds = new Map<number, CourierRound>();
  private readonly requestedStock = new Map<string, number>();
  private nextHouseholdParcel = 10;
  private nextStockScan = 3;
  private readonly destination = point();

  reset(context: LifeContext): void {
    this.jobs.clear();
    this.rounds.clear();
    this.requestedStock.clear();
    this.nextJob = 1;
    this.nextHouseholdParcel = 10;
    this.nextStockScan = 3;
    for (const place of context.places.ofKind("grocery")) this.requestStock(place.id, "grocery", 6, context);
    const households = context.actors.filter((actor) => actor.occupation === "office").slice(0, 4);
    for (const actor of households) this.requestParcel(actor, context);
  }

  requestStock(destinationId: string, stock: string, quantity: number, context: LifeContext): number {
    const key = `${destinationId}:${stock}`;
    const previous = this.requestedStock.get(key);
    if (previous && this.jobs.get(previous)?.state !== "delivered" && this.jobs.get(previous)?.state !== "failed") return previous;
    const id = this.createJob("service-depot", destinationId, -1, stock, quantity, stock === "meal" || stock === "coffee" ? 4 : 2, context);
    this.requestedStock.set(key, id);
    return id;
  }

  private requestParcel(actor: Actor, context: LifeContext): number {
    return this.createJob("service-depot", actor.homeId, actor.id, "parcel", 1, 1, context);
  }

  private createJob(originId: string, destinationId: string, recipientId: number, itemName: string, quantity: number, priority: number, context: LifeContext): number {
    const job: DeliveryJob = {
      id: this.nextJob++,
      originId,
      destinationId,
      recipientId,
      item: itemName,
      quantity,
      weight: itemName === "parcel" ? 1.5 : quantity * 0.35,
      priority,
      createdAt: context.time.seconds,
      deadline: context.time.seconds + 180 + (4 - priority) * 25,
      assignedTo: -1,
      state: "pending",
      attempts: 0,
      parcelId: -1,
      proofAt: -1,
    };
    this.jobs.set(job.id, job);
    return job.id;
  }

  tick(context: LifeContext): void {
    this.createDemand(context);
    this.expireJobs(context);
    for (const actor of context.actors) {
      if (actor.task?.kind === "delivery") this.courier(actor, context);
    }
  }

  private createDemand(context: LifeContext): void {
    const now = context.time.seconds;
    if (now >= this.nextStockScan) {
      this.nextStockScan = now + 8;
      for (const place of context.places.all) {
        if (!["restaurant", "cafe", "grocery", "bookshop", "florist"].includes(place.kind)) continue;
        for (const [stock, quantity] of place.stock) {
          if (quantity < 5) this.requestStock(place.id, stock, stock === "meal" ? 18 : 12, context);
        }
      }
    }
    if (now >= this.nextHouseholdParcel) {
      this.nextHouseholdParcel = now + 30 + context.random.next() * 25;
      const candidates = context.actors.filter((actor) => actor.age === "adult" && actor.occupation !== "courier");
      if (candidates.length > 0 && this.pendingCount() < 12) this.requestParcel(context.random.choice(candidates), context);
    }
  }

  private expireJobs(context: LifeContext): void {
    for (const job of this.jobs.values()) {
      if (job.state === "delivered" && context.time.seconds - job.proofAt > 50) {
        this.jobs.delete(job.id);
        continue;
      }
      if (job.deadline < context.time.seconds && job.state === "pending") {
        job.priority = Math.min(5, job.priority + 1);
        job.deadline = context.time.seconds + 90;
      }
      if (job.state === "failed" && context.time.seconds - job.createdAt > 300) this.jobs.delete(job.id);
    }
  }

  private courier(actor: Actor, context: LifeContext): void {
    const task = actor.task!;
    switch (task.phase) {
      case "start": this.assignRound(actor, context); break;
      case "depot": this.reachDepot(actor, context); break;
      case "loading": this.loadRound(actor, context); break;
      case "travel": this.travel(actor, context); break;
      case "doorbell": this.waitAtDoor(actor, context); break;
      case "handoff": this.handoff(actor, context); break;
      case "signature": this.signature(actor, context); break;
      case "unloading": this.unloadStock(actor, context); break;
      case "next": this.nextStop(actor, context); break;
      case "return": this.returnToDepot(actor, context); break;
    }
  }

  private assignRound(actor: Actor, context: LifeContext): void {
    const depot = context.places.get("service-depot");
    if (!depot) {
      context.completeTask(actor, false);
      return;
    }
    const candidates = [...this.jobs.values()].filter((job) => job.state === "pending");
    candidates.sort((a, b) => b.priority - a.priority || a.deadline - b.deadline);
    const selected: number[] = [];
    let load = 0;
    let current = depot.entrance;
    while (selected.length < 3 && candidates.length > 0) {
      candidates.sort((a, b) => {
        const placeA = context.places.get(a.destinationId);
        const placeB = context.places.get(b.destinationId);
        const scoreA = placeA ? distance(current, placeA.entrance) - a.priority * 30 : Infinity;
        const scoreB = placeB ? distance(current, placeB.entrance) - b.priority * 30 : Infinity;
        return scoreA - scoreB;
      });
      const job = candidates.shift()!;
      const target = context.places.get(job.destinationId);
      if (!target || load + job.weight > 14 || !context.routes.isReachable(current, target.entrance)) continue;
      selected.push(job.id);
      job.assignedTo = actor.id;
      job.state = "assigned";
      load += job.weight;
      current = target.entrance;
    }
    if (selected.length === 0) {
      actor.serviceCooldown = context.time.seconds + 8;
      context.completeTask(actor, true);
      return;
    }
    const round: CourierRound = { actorId: actor.id, jobs: selected, index: 0, load, cartProp: -1, eventId: -1, startedAt: context.time.seconds, returned: false };
    this.rounds.set(actor.id, round);
    goTo(actor, depot.entrance, context, 3);
    changePhase(actor.task!, "depot", context);
  }

  private reachDepot(actor: Actor, context: LifeContext): void {
    const depot = context.places.get("service-depot")!;
    if (actor.navigation.failed) {
      failTask(actor, context, "depot-route-blocked");
      return;
    }
    if (!arrived(actor, depot.entrance, 0.7)) return;
    const dock = reserve(actor, depot, "loading", context, 20, 3);
    if (!dock) return;
    stopWalking(actor, "working");
    setGesture(actor, "lift", context.time.seconds, 0.8);
    changePhase(actor.task!, "loading", context, 4 + this.rounds.get(actor.id)!.jobs.length);
  }

  private loadRound(actor: Actor, context: LifeContext): void {
    const round = this.rounds.get(actor.id)!;
    const progress = phaseProgress(actor.task!, context);
    if (round.cartProp < 0 && progress > 0.2) {
      const cart = context.props.ensureOwned(actor, "cart", context.time.seconds, "front", "#6f7d7d");
      round.cartProp = cart?.id ?? -1;
    }
    if (!phaseFinished(actor.task!, context)) return;
    for (const id of round.jobs) {
      const job = this.jobs.get(id);
      if (job) job.state = "loaded";
    }
    releaseReservation(actor, context);
    round.eventId = context.events.publish(`delivery-${actor.id}`, "delivery",
      { zh: "快递员开始街区配送", en: "A neighborhood delivery round" },
      { zh: "包裹装上手推车，按目的地距离与时限安排配送顺序。", en: "Parcels are loaded onto a trolley and stops are ordered by distance and urgency." },
      actor.position, context.time.seconds, 200, [actor.id], 2);
    actor.task!.serviceId = round.eventId;
    this.setDestination(actor, context);
  }

  private setDestination(actor: Actor, context: LifeContext): void {
    const round = this.rounds.get(actor.id)!;
    const job = this.jobs.get(round.jobs[round.index]);
    const place = job ? context.places.get(job.destinationId) : undefined;
    if (!job || !place) {
      changePhase(actor.task!, "next", context);
      return;
    }
    actor.task!.venueId = place.id;
    goTo(actor, place.entrance, context, job.priority);
    setGesture(actor, "push", context.time.seconds, 0.75);
    changePhase(actor.task!, "travel", context);
  }

  private travel(actor: Actor, context: LifeContext): void {
    const round = this.rounds.get(actor.id)!;
    const job = this.jobs.get(round.jobs[round.index]);
    if (!job) {
      changePhase(actor.task!, "next", context);
      return;
    }
    const place = context.places.get(job.destinationId)!;
    const progress = (round.index + Math.max(0, 1 - actor.navigation.distanceRemaining / Math.max(1, actor.navigation.plannedDistance)) * 0.6) / round.jobs.length;
    context.events.update(round.eventId, actor.position, progress, context.time.seconds, "en-route");
    if (actor.navigation.failed) {
      job.attempts++;
      job.state = job.attempts >= 2 ? "failed" : "pending";
      job.assignedTo = -1;
      changePhase(actor.task!, "next", context);
      return;
    }
    if (!arrived(actor, place.entrance, 0.7)) return;
    const dock = reserve(actor, place, "loading", context, 25, job.priority);
    if (!dock) {
      if (context.time.seconds - actor.navigation.arrivedAt > 12) changePhase(actor.task!, "next", context);
      return;
    }
    job.state = "arrived";
    stopWalking(actor, "working");
    actor.targetHeading = place.heading;
    setGesture(actor, job.recipientId >= 0 ? "point" : "lift", context.time.seconds, 0.7);
    if (job.recipientId >= 0) changePhase(actor.task!, "doorbell", context, 5);
    else changePhase(actor.task!, "unloading", context, 3 + job.quantity * 0.2);
  }

  private waitAtDoor(actor: Actor, context: LifeContext): void {
    const round = this.rounds.get(actor.id)!;
    const job = this.jobs.get(round.jobs[round.index])!;
    const recipient = context.actorById.get(job.recipientId);
    const place = context.places.get(job.destinationId)!;
    if (recipient && recipient.interiorId === place.id) {
      recipient.interiorId = "";
      recipient.visible = true;
      recipient.position.x = place.entrance.x + 0.65;
      recipient.position.z = place.entrance.z;
      recipient.previousPosition.x = recipient.position.x;
      recipient.previousPosition.z = recipient.position.z;
      stopWalking(recipient);
      facePoint(recipient, actor.position);
    }
    if (recipient?.visible && distance(recipient.position, actor.position) < 2) {
      addItem(actor, "parcel", context, 1, "right-hand", "#b6986b");
      actor.task!.partnerId = recipient.id;
      facePoint(actor, recipient.position);
      setGesture(actor, "carry", context.time.seconds, 0.9);
      setGesture(recipient, "carry", context.time.seconds, 0.7);
      changePhase(actor.task!, "handoff", context, 2.4);
      return;
    }
    if (!phaseFinished(actor.task!, context)) return;
    const parcel = context.props.create("parcel", { x: place.entrance.x + 1.1, z: place.entrance.z }, context.time.seconds,
      { y: place.groundY + 0.14, duration: 100, serviceId: job.id, color: "#b3986f" });
    job.parcelId = parcel?.id ?? -1;
    setGesture(actor, "photo", context.time.seconds, 0.6);
    changePhase(actor.task!, "signature", context, 2);
    context.events.describe(round.eventId,
      { zh: "收件人暂未到门口，包裹放在门侧指定位置并拍照记录。", en: "With the recipient absent, the parcel is placed beside the door and recorded." });
  }

  private handoff(actor: Actor, context: LifeContext): void {
    if (!phaseFinished(actor.task!, context)) return;
    const recipient = context.actorById.get(actor.task!.partnerId);
    if (recipient) {
      transferItem(actor, recipient, "parcel", context, "left-hand");
      setGesture(recipient, "write", context.time.seconds, 0.7);
    }
    setGesture(actor, "write", context.time.seconds, 0.6);
    changePhase(actor.task!, "signature", context, 2.1);
  }

  private signature(actor: Actor, context: LifeContext): void {
    if (!phaseFinished(actor.task!, context)) return;
    const round = this.rounds.get(actor.id)!;
    const job = this.jobs.get(round.jobs[round.index])!;
    this.completeDelivery(actor, job, context);
  }

  private unloadStock(actor: Actor, context: LifeContext): void {
    const task = actor.task!;
    const round = this.rounds.get(actor.id)!;
    const job = this.jobs.get(round.jobs[round.index])!;
    const place = context.places.get(job.destinationId)!;
    setGesture(actor, "lift", context.time.seconds, 0.8);
    context.events.update(round.eventId, actor.position, (round.index + phaseProgress(task, context)) / round.jobs.length, context.time.seconds, "unloading");
    if (!phaseFinished(task, context)) return;
    place.stock.set(job.item, (place.stock.get(job.item) ?? 0) + job.quantity);
    place.lastDelivery = context.time.seconds;
    this.completeDelivery(actor, job, context);
  }

  private completeDelivery(actor: Actor, job: DeliveryJob, context: LifeContext): void {
    job.state = "delivered";
    job.proofAt = context.time.seconds;
    const round = this.rounds.get(actor.id)!;
    round.load = Math.max(0, round.load - job.weight);
    context.stats.completedDeliveries++;
    releaseReservation(actor, context);
    setGesture(actor, "wave", context.time.seconds, 0.4);
    changePhase(actor.task!, "next", context, 0.7);
  }

  private nextStop(actor: Actor, context: LifeContext): void {
    if (!phaseFinished(actor.task!, context)) return;
    const round = this.rounds.get(actor.id)!;
    round.index++;
    if (round.index < round.jobs.length) {
      this.setDestination(actor, context);
      return;
    }
    const depot = context.places.get("service-depot")!;
    goTo(actor, depot.entrance, context, 1);
    changePhase(actor.task!, "return", context);
  }

  private returnToDepot(actor: Actor, context: LifeContext): void {
    const round = this.rounds.get(actor.id)!;
    context.events.update(round.eventId, actor.position, 0.97, context.time.seconds, "returning");
    if (!arrived(actor) && !actor.navigation.failed) return;
    round.returned = true;
    if (round.cartProp >= 0) context.props.remove(round.cartProp);
    context.events.finish(round.eventId, context.time.seconds);
    this.rounds.delete(actor.id);
    actor.serviceCooldown = context.time.seconds + 5;
    finishSatisfied(actor, context, "delivery-round-complete", 0.3);
  }

  pendingCount(): number {
    let count = 0;
    for (const job of this.jobs.values()) if (job.state === "pending") count++;
    return count;
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const round = this.rounds.get(actor.id);
    if (!round) return;
    for (const id of round.jobs) {
      const job = this.jobs.get(id);
      if (!job || job.state === "delivered") continue;
      job.state = "pending";
      job.assignedTo = -1;
    }
    if (round.cartProp >= 0) context.props.remove(round.cartProp);
    context.events.finish(round.eventId, context.time.seconds);
    this.rounds.delete(actor.id);
  }
}
