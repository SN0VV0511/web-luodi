import { clamp, distance, localPoint, point, type Point2 } from "./math";
import { addItem, arrived, changePhase, facePoint, failTask, finishSatisfied, goTo, item, phaseFinished, phaseProgress, removeItem, setGesture, stopWalking } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem } from "./types";
import type { LifePlace, PlaceSlot } from "./places";
import type { LifeObstacles } from "./obstacles";

type ServiceKind = "cleaning" | "gardening" | "repair";
type RepairPart = "lighting" | "bench" | "drain" | "sign" | "door";
interface MaintenanceJob {
  id: number;
  kind: ServiceKind;
  placeId: string;
  target: Point2;
  workerId: number;
  condition: number;
  progress: number;
  created: number;
  deadline: number;
  severity: number;
  reserved: boolean;
  eventId: number;
  obstacleId: number;
  propIds: number[];
  part: RepairPart;
  examined: boolean;
  tested: boolean;
  materials: number;
  waste: number;
}

export class NeighborhoodMaintenance implements LifeSystem {
  private readonly jobs = new Map<number, MaintenanceJob>();
  private readonly workers = new Map<number, number>();
  private nextId = 1;
  private nextInspection = 0;
  private readonly target = point();

  constructor(private readonly obstacles: LifeObstacles) {}

  reset(context: LifeContext): void {
    for (const job of this.jobs.values()) this.removeEquipment(job, context);
    this.jobs.clear();
    this.workers.clear();
    this.nextId = 1;
    this.nextInspection = context.time.seconds;
  }

  tick(context: LifeContext): void {
    if (context.time.seconds >= this.nextInspection) {
      this.inspectDistrict(context);
      this.nextInspection = context.time.seconds + 9;
    }
    this.agePlaces(context);
    for (const actor of context.actors) {
      if (!actor.task) continue;
      if (actor.task.kind !== "cleaning" && actor.task.kind !== "gardening" && actor.task.kind !== "repair") continue;
      this.work(actor, actor.task, context);
    }
    for (const job of this.jobs.values()) {
      if (job.workerId >= 0 && !context.actorById.get(job.workerId)?.task) this.unassign(job, context);
      if (job.workerId < 0 && context.time.seconds > job.deadline) job.severity = Math.min(1, job.severity + context.time.dt * 0.002);
    }
  }

  private agePlaces(context: LifeContext): void {
    if (context.time.tick % 12 !== 0) return;
    const dt = context.time.dt * 12;
    for (const place of context.places.all) {
      const occupied = place.occupants.size;
      const publicPlace = place.kind !== "home" && place.kind !== "office";
      const footfall = publicPlace ? 1 + occupied * 0.2 : occupied * 0.08;
      place.cleanliness = clamp(place.cleanliness - dt * 0.0008 * footfall, 0, 1);
      place.maintenance = clamp(place.maintenance - dt * (context.weather.precipitation * 0.00014 + 0.00004), 0, 1);
      if (place.kind === "park") {
        const moisture = place.stock.get("soil-moisture") ?? 0.55;
        const evaporation = Math.max(0, context.weather.temperature - 9) * 0.00008;
        place.stock.set("soil-moisture", clamp(moisture + (context.weather.precipitation * 0.006 - evaporation) * dt, 0, 1));
      }
      for (const slot of place.slots) {
        if (slot.kind === "seat" && slot.occupants.size > 0) slot.condition = Math.max(0.2, slot.condition - dt * 0.00003);
      }
    }
  }

  private inspectDistrict(context: LifeContext): void {
    for (const place of context.places.all) {
      if (place.cleanliness < 0.86 && place.kind !== "home") this.request("cleaning", place, context);
      if (place.maintenance < 0.91) this.request("repair", place, context);
      const moisture = place.stock.get("soil-moisture") ?? 0.5;
      if (place.kind === "park" && moisture < 0.62) this.request("gardening", place, context);
      if (this.jobs.size >= 28) break;
    }
    if (this.jobs.size === 0) {
      const park = context.places.ofKind("park")[0];
      if (park) this.request("cleaning", park, context);
    }
  }

  request(kind: ServiceKind, place: LifePlace, context: LifeContext): number {
    const existing = [...this.jobs.values()].find((job) => job.kind === kind && job.placeId === place.id);
    if (existing) return existing.id;
    if (this.jobs.size >= 28) return -1;
    const slot = this.chooseWorkSlot(place, kind);
    const target = slot?.position ?? place.entrance;
    const condition = kind === "cleaning" ? place.cleanliness : kind === "gardening" ? place.stock.get("soil-moisture") ?? 0.4 : place.maintenance;
    const id = this.nextId++;
    this.jobs.set(id, {
      id,
      kind,
      placeId: place.id,
      target: { ...target },
      workerId: -1,
      condition,
      progress: 0,
      created: context.time.seconds,
      deadline: context.time.seconds + 240,
      severity: 1 - condition,
      reserved: false,
      eventId: -1,
      obstacleId: -1,
      propIds: [],
      part: context.random.choice<RepairPart>(["lighting", "bench", "drain", "sign", "door"]),
      examined: false,
      tested: false,
      materials: 0,
      waste: 0,
    });
    return id;
  }

  private chooseWorkSlot(place: LifePlace, kind: ServiceKind): PlaceSlot | undefined {
    if (kind === "gardening") return place.slots.find((slot) => slot.kind === "garden");
    if (kind === "cleaning") return place.slots.find((slot) => slot.kind === "bin") ?? place.slots.find((slot) => slot.kind === "table");
    return place.slots.find((slot) => slot.kind === "seat" && slot.occupants.size === 0) ?? place.slots.find((slot) => slot.kind === "door");
  }

  private acquireJob(actor: Actor, context: LifeContext): MaintenanceJob | undefined {
    const kind = actor.task!.kind as ServiceKind;
    let best: MaintenanceJob | undefined;
    let score = -Infinity;
    for (const job of this.jobs.values()) {
      if (job.kind !== kind || job.workerId >= 0) continue;
      const next = job.severity * 80 + (context.time.seconds - job.created) * 0.04 - distance(actor.position, job.target) * 0.15;
      if (next > score) {
        best = job;
        score = next;
      }
    }
    if (!best) {
      const place = context.places.get(actor.task!.venueId) ?? context.places.ofKind("park")[0];
      if (place) {
        const id = this.request(kind, place, context);
        best = this.jobs.get(id);
      }
    }
    if (!best) return undefined;
    best.workerId = actor.id;
    best.reserved = true;
    this.workers.set(actor.id, best.id);
    actor.task!.serviceId = best.id;
    actor.task!.venueId = best.placeId;
    return best;
  }

  private work(actor: Actor, task: ActorTask, context: LifeContext): void {
    const job = this.jobs.get(this.workers.get(actor.id) ?? -1) ?? this.acquireJob(actor, context);
    if (!job) {
      failTask(actor, context, "maintenance-no-job");
      return;
    }
    const place = context.places.get(job.placeId);
    if (!place) {
      failTask(actor, context, "maintenance-place-missing");
      return;
    }
    if (task.phase === "start") {
      this.equip(actor, job, context);
      changePhase(task, "travel", context);
    }
    if (task.phase === "travel") {
      goTo(actor, job.target, context, 3);
      if (arrived(actor, job.target, 0.75)) {
        stopWalking(actor, "working");
        facePoint(actor, place.position);
        changePhase(task, "prepare", context, 3.5);
      }
      return;
    }
    if (task.phase === "prepare") {
      stopWalking(actor, "working");
      setGesture(actor, "kneel", context.time.seconds);
      phaseProgress(task, context);
      if (phaseFinished(task, context)) {
        this.setupEquipment(actor, job, context);
        this.publish(actor, job, place, context);
        changePhase(task, "inspect", context, 4);
      }
      return;
    }
    if (task.phase === "inspect") {
      setGesture(actor, job.kind === "repair" ? "repair" : "point", context.time.seconds, 0.6);
      phaseProgress(task, context);
      if (phaseFinished(task, context)) {
        job.examined = true;
        const duration = job.kind === "repair" ? 24 + job.severity * 35 : job.kind === "gardening" ? 18 : 20 + job.severity * 20;
        changePhase(task, "service", context, duration);
      }
      return;
    }
    if (task.phase === "service") {
      this.service(actor, task, job, place, context);
      if (phaseFinished(task, context)) changePhase(task, "verify", context, 3.5);
      return;
    }
    if (task.phase === "verify") {
      setGesture(actor, "write", context.time.seconds);
      phaseProgress(task, context);
      if (phaseFinished(task, context)) {
        job.tested = true;
        this.applyOutcome(job, place, context);
        changePhase(task, "pack", context, 3);
      }
      return;
    }
    if (task.phase === "pack") {
      setGesture(actor, "lift", context.time.seconds);
      phaseProgress(task, context);
      if (phaseFinished(task, context)) {
        this.removeEquipment(job, context);
        this.jobs.delete(job.id);
        this.workers.delete(actor.id);
        context.events.finish(job.eventId, context.time.seconds);
        context.stats.completedRepairs += job.kind === "repair" ? 1 : 0;
        finishSatisfied(actor, context, `${job.kind}-completed`, 0.35);
      }
    }
  }

  private equip(actor: Actor, job: MaintenanceJob, context: LifeContext): void {
    if (job.kind === "cleaning") addItem(actor, "broom", context, 1, "right-hand", "#9b805c");
    if (job.kind === "gardening") addItem(actor, "watering-can", context, 1, "right-hand", "#617c62");
    if (job.kind === "repair") addItem(actor, "toolbox", context, 1, "left-hand", "#a66c42");
    setGesture(actor, "carry", context.time.seconds, 0.7);
  }

  private setupEquipment(actor: Actor, job: MaintenanceJob, context: LifeContext): void {
    const forward = localPoint(actor.position, actor.heading, 0.7, 0.5, this.target);
    const equipment = context.props.create(job.kind === "cleaning" ? "cleaning-cart" : job.kind === "gardening" ? "wheelbarrow" : "toolbox", forward, context.time.seconds, { serviceId: job.id, heading: actor.heading });
    if (equipment) job.propIds.push(equipment.id);
    if (job.kind === "repair") {
      job.obstacleId = this.obstacles.addCircle(job.target, 1.1, context.time.seconds, 150, actor.id);
      for (const side of [-1, 1]) {
        const conePosition = localPoint(job.target, actor.heading, side * 1.15, 0.1, this.target);
        const cone = context.props.create("cone", conePosition, context.time.seconds, { serviceId: job.id, color: "#d58242" });
        if (cone) job.propIds.push(cone.id);
      }
      const toolkit = item(actor, "toolbox");
      if (toolkit) {
        context.props.detach(toolkit.propId, { x: forward.x, y: 0.49, z: forward.z });
        context.props.ensureOwned(actor, "tool", context.time.seconds, "right-hand");
      }
    }
    if (job.kind === "cleaning") {
      const leaves = context.props.create("leaf-pile", job.target, context.time.seconds, { serviceId: job.id, color: "#9f7645", scale: 0.7 });
      if (leaves) job.propIds.push(leaves.id);
    }
  }

  private publish(actor: Actor, job: MaintenanceJob, place: LifePlace, context: LifeContext): void {
    const title = job.kind === "cleaning" ? { zh: "环卫工清扫人行道", en: "The sidewalk is being swept" }
      : job.kind === "gardening" ? { zh: "园丁照料花圃", en: "A gardener tends the planting" }
        : { zh: "街区设施检修", en: "Neighborhood fixtures are being repaired" };
    const detail = job.kind === "repair" ? { zh: "工人围好作业区，检查故障、使用工具维修，再测试并收好工具。", en: "A worker secures the work area, diagnoses the fault, repairs it, tests the result and packs the tools." }
      : job.kind === "gardening" ? { zh: "园丁检查土壤湿度、松土并浇水，雨天会减少用水。", en: "The gardener checks soil moisture, loosens the soil and waters only as needed." }
        : { zh: "工人把落叶扫拢、收进清洁车，再恢复步道通行。", en: "Leaves are swept together, collected into the cart and the walkway is cleared." };
    job.eventId = context.events.publish(`maintenance-${job.id}`, "maintenance", title, detail, job.target, context.time.seconds, 60, [actor.id], 2);
    context.events.update(job.eventId, place.entrance, 0, context.time.seconds, "preparing");
  }

  private service(actor: Actor, task: ActorTask, job: MaintenanceJob, place: LifePlace, context: LifeContext): void {
    stopWalking(actor, "working");
    const progress = phaseProgress(task, context);
    job.progress = progress;
    if (job.kind === "cleaning") {
      setGesture(actor, progress < 0.75 ? "sweep" : "lift", context.time.seconds, 0.8);
      job.waste += context.time.dt * 0.025;
      const pile = job.propIds.map((id) => context.props.get(id)).find((prop) => prop?.kind === "leaf-pile");
      if (pile) {
        pile.scale.x = 0.7 * (1 - progress * 0.95);
        pile.scale.z = pile.scale.x;
        pile.scale.y = 0.7 + progress * 0.2;
      }
      place.cleanliness = clamp(job.condition + (1 - job.condition) * progress, 0, 1);
    } else if (job.kind === "gardening") {
      setGesture(actor, progress < 0.35 ? "dig" : "water", context.time.seconds, 0.8);
      if (progress > 0.35 && context.weather.precipitation < 0.4) {
        const stream = context.props.ensureOwned(actor, "watering-stream", context.time.seconds, "right-hand");
        if (stream) stream.progress = Math.sin(context.time.seconds * 5) * 0.5 + 0.5;
        job.materials += context.time.dt * 0.04;
      }
    } else {
      const stage = Math.floor(progress * 4);
      setGesture(actor, stage === 0 ? "kneel" : stage === 1 ? "repair" : stage === 2 ? "lift" : "repair", context.time.seconds, 0.6 + job.severity * 0.4);
      job.materials = Math.floor(progress * 3);
      if (job.part === "door") actor.targetHeading = place.heading + Math.PI;
    }
    context.events.update(job.eventId, actor.position, progress, context.time.seconds, "working");
  }

  private applyOutcome(job: MaintenanceJob, place: LifePlace, context: LifeContext): void {
    if (!job.examined || !job.tested) return;
    if (job.kind === "cleaning") {
      place.cleanliness = 1;
      place.lastCleaning = context.time.seconds;
      place.stock.set("collected-waste", (place.stock.get("collected-waste") ?? 0) + job.waste);
    }
    if (job.kind === "repair") {
      place.maintenance = 1;
      for (const slot of place.slots) slot.condition = Math.max(slot.condition, 0.95);
    }
    if (job.kind === "gardening") {
      place.stock.set("soil-moisture", Math.min(0.9, 0.65 + job.materials * 0.1));
      place.stock.set("garden-condition", Math.min(1, (place.stock.get("garden-condition") ?? 0.7) + 0.2));
    }
  }

  private removeEquipment(job: MaintenanceJob, context: LifeContext): void {
    if (job.obstacleId >= 0) this.obstacles.remove(job.obstacleId);
    for (const id of job.propIds) context.props.remove(id);
    job.propIds.length = 0;
    const actor = context.actorById.get(job.workerId);
    if (actor) {
      for (const kind of ["broom", "watering-can", "toolbox"] as const) {
        const carried = item(actor, kind);
        if (carried) removeItem(actor, carried.id, context);
      }
      const stream = context.props.owned(actor.id, "watering-stream");
      if (stream) context.props.remove(stream.id);
      const tool = context.props.owned(actor.id, "tool");
      if (tool) context.props.remove(tool.id);
    }
  }

  private unassign(job: MaintenanceJob, context: LifeContext): void {
    this.removeEquipment(job, context);
    this.workers.delete(job.workerId);
    job.workerId = -1;
    job.reserved = false;
    context.events.finish(job.eventId, context.time.seconds);
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const job = this.jobs.get(this.workers.get(actor.id) ?? -1);
    if (job) this.unassign(job, context);
  }
}
