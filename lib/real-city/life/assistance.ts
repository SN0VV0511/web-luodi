import { clamp, distance, localPoint, point, type Point2 } from "./math";
import { addItem, arrived, changePhase, enterInterior, facePoint, failTask, finishSatisfied, goTo, item, lookAtActor, phaseFinished, phaseProgress, remember, removeItem, setGesture, stopWalking } from "./actions";
import type { Actor, ActorTask, LifeContext, LifeSystem, LifeVehicle } from "./types";
import { NeighborhoodFleet } from "./vehicles";

interface AssistanceRequest {
  id: number;
  kind: "directions" | "dropped-item" | "tired" | "medical" | "lost-child" | "crossing";
  actorId: number;
  helperId: number;
  position: Point2;
  targetVenue: string;
  reportedAt: number;
  respondedAt: number;
  resolvedAt: number;
  severity: number;
  phase: "reported" | "assigned" | "assisting" | "transport" | "resolved";
  vehicleId: number;
  eventId: number;
  propId: number;
  examined: boolean;
  consented: boolean;
  treatment: number;
  originalTask: string;
}

export class NeighborhoodAssistance implements LifeSystem {
  private readonly requests = new Map<number, AssistanceRequest>();
  private readonly actorRequests = new Map<number, number>();
  private readonly helperRequests = new Map<number, number>();
  private nextId = 1;
  private nextCheck = 7;
  private readonly target = point();
  private readonly patrolTargets = new Map<number, Point2[]>();

  constructor(private readonly fleet: NeighborhoodFleet) {}

  reset(): void {
    this.requests.clear();
    this.actorRequests.clear();
    this.helperRequests.clear();
    this.patrolTargets.clear();
    this.nextId = 1;
    this.nextCheck = 7;
  }

  tick(context: LifeContext): void {
    if (context.time.seconds >= this.nextCheck) {
      this.inspectNeeds(context);
      this.nextCheck = context.time.seconds + 8;
    }
    for (const actor of context.actors) {
      if (!actor.task) continue;
      if (actor.task.option === "returning-property") continue;
      if (actor.task.kind === "help") this.help(actor, actor.task, context);
      else if (actor.task.kind === "medical") this.medic(actor, actor.task, context);
      else if (actor.task.kind === "patrol") this.patrol(actor, actor.task, context);
    }
    for (const request of this.requests.values()) {
      if (request.phase === "resolved") continue;
      this.keepPatientSafe(request, context);
      if (request.helperId < 0) this.dispatch(request, context);
    }
    this.expire(context);
  }

  private inspectNeeds(context: LifeContext): void {
    if (this.requests.size >= 8) return;
    for (const actor of context.actors) {
      if (!actor.visible || actor.vehicleId >= 0 || actor.interiorId || this.actorRequests.has(actor.id)) continue;
      if (actor.task?.priority && actor.task.priority >= 7) continue;
      if (actor.health < 0.65 || actor.needs.energy < 0.12) {
        this.report(actor.health < 0.5 ? "medical" : "tired", actor, context);
        return;
      }
      if (actor.age === "child" && actor.guardianId >= 0) {
        const guardian = context.actorById.get(actor.guardianId);
        if (guardian?.visible && distance(actor.position, guardian.position) > 24 && actor.task?.kind !== "school" && actor.task?.kind !== "pickup") {
          this.report("lost-child", actor, context);
          return;
        }
      }
      if (actor.navigation.failed && actor.occupation === "tourist") {
        this.report("directions", actor, context);
        return;
      }
      if (actor.age === "elder" && actor.navigation.crossingId >= 0 && context.crossings.waitingTime(actor.id, context.time.seconds) > 30) {
        this.report("crossing", actor, context);
        return;
      }
    }
  }

  report(kind: AssistanceRequest["kind"], actor: Actor, context: LifeContext): number {
    const existing = this.actorRequests.get(actor.id);
    if (existing !== undefined) return existing;
    if (this.requests.size >= 8) return -1;
    const id = this.nextId++;
    const target = kind === "medical" ? context.places.ofKind("clinic")[0] : context.places.find(actor, ["bench", "shelter", "park"], context.time);
    const request: AssistanceRequest = {
      id,
      kind,
      actorId: actor.id,
      helperId: -1,
      position: { ...actor.position },
      targetVenue: target?.id ?? actor.homeId,
      reportedAt: context.time.seconds,
      respondedAt: 0,
      resolvedAt: 0,
      severity: kind === "medical" ? 0.85 : kind === "lost-child" ? 0.65 : kind === "tired" ? 0.5 : 0.3,
      phase: "reported",
      vehicleId: -1,
      eventId: -1,
      propId: -1,
      examined: false,
      consented: false,
      treatment: 0,
      originalTask: actor.task?.kind ?? "idle",
    };
    this.requests.set(id, request);
    this.actorRequests.set(actor.id, id);
    request.eventId = context.events.publish(`assistance-${id}`, "assistance", this.title(kind), this.detail(kind), actor.position, context.time.seconds, 100, [actor.id], kind === "medical" ? 3 : 2);
    actor.needs.stress = clamp(actor.needs.stress + 0.04, 0, 1);
    if (kind === "tired" || kind === "medical") stopWalking(actor, "resting");
    return id;
  }

  private title(kind: AssistanceRequest["kind"]): { zh: string; en: string } {
    if (kind === "medical") return { zh: "医护人员为居民提供帮助", en: "A medic assists a resident" };
    if (kind === "tired") return { zh: "帮助疲惫的居民休息", en: "Helping a tired resident find a rest" };
    if (kind === "lost-child") return { zh: "工作人员帮助孩子找到家长", en: "Helping a child reunite with a guardian" };
    if (kind === "crossing") return { zh: "陪伴长者安全过街", en: "Accompanying an older resident across the street" };
    if (kind === "dropped-item") return { zh: "帮忙捡起掉落的物品", en: "Helping recover a dropped item" };
    return { zh: "街坊为游客指路", en: "A resident gives a visitor directions" };
  }

  private detail(kind: AssistanceRequest["kind"]): { zh: string; en: string } {
    if (kind === "medical") return { zh: "医护人员先询问并检查，提供现场帮助；需要时叫车送到诊所。", en: "The medic talks with the resident, checks their condition and provides assistance, arranging a ride to the clinic when needed." };
    if (kind === "lost-child") return { zh: "工作人员陪孩子在安全处等候，核对家长身份后完成交接。", en: "The child waits in a safe place while the helper confirms the guardian and reunites them." };
    if (kind === "crossing") return { zh: "帮扶者在路缘等候通行信号，以长者速度一起通过人行横道。", en: "The helper waits at the curb and matches the resident's pace across the crossing." };
    if (kind === "tired") return { zh: "居民在步道一侧停下，帮扶者找到附近座位并陪同休息。", en: "The resident steps aside while a helper finds a nearby seat and stays for a short rest." };
    if (kind === "dropped-item") return { zh: "帮扶者俯身拾起物品，确认归属后递回原主人。", en: "The helper picks up the item, checks its owner and hands it back." };
    return { zh: "居民先确认目的地，再指向可通行的街道，必要时陪游客走一段。", en: "The resident confirms the destination and points out a connected walking route, accompanying the visitor briefly if needed." };
  }

  private dispatch(request: AssistanceRequest, context: LifeContext): void {
    let best: Actor | undefined;
    let score = Infinity;
    for (const actor of context.actors) {
      if (actor.id === request.actorId || !actor.visible || actor.vehicleId >= 0 || actor.age === "child") continue;
      if (this.helperRequests.has(actor.id) || this.actorRequests.has(actor.id)) continue;
      if (actor.task && actor.task.priority >= 7) continue;
      if (request.kind === "medical" && actor.occupation !== "medic") continue;
      if (request.kind === "lost-child" && actor.occupation !== "officer" && actor.occupation !== "teacher") continue;
      if (request.kind !== "medical" && actor.personality.generosity < 0.4) continue;
      const separation = distance(actor.position, request.position);
      const next = separation - actor.personality.generosity * 10 - (actor.occupation === "officer" ? 5 : 0);
      if (next < score && context.routes.isReachable(actor.position, request.position)) {
        best = actor;
        score = next;
      }
    }
    if (!best) return;
    const kind = request.kind === "medical" ? "medical" : "help";
    const issued = best.task ? context.interruptTask(best, kind, request.targetVenue, 7) : context.issueTask(best, kind, request.targetVenue, 7);
    if (!issued || !best.task) return;
    request.helperId = best.id;
    request.phase = "assigned";
    best.task.serviceId = request.id;
    best.task.partnerId = request.actorId;
    best.task.target = { ...request.position };
    this.helperRequests.set(best.id, request.id);
    context.events.addParticipant(request.eventId, best.id);
  }

  private requestForHelper(actor: Actor): AssistanceRequest | undefined {
    return this.requests.get(this.helperRequests.get(actor.id) ?? actor.task?.serviceId ?? -1);
  }

  private help(actor: Actor, task: ActorTask, context: LifeContext): void {
    let request = this.requestForHelper(actor);
    if (!request) {
      const person = this.findHelpCandidate(actor, context);
      if (!person) {
        finishSatisfied(actor, context, "assistance-no-need", 0.1);
        return;
      }
      const id = this.report(person.age === "elder" ? "tired" : "directions", person, context);
      request = this.requests.get(id);
      if (!request) return;
      request.helperId = actor.id;
      this.helperRequests.set(actor.id, id);
      task.serviceId = id;
      task.partnerId = person.id;
    }
    const recipient = context.actorById.get(request.actorId);
    if (!recipient) {
      failTask(actor, context, "assistance-recipient-missing");
      return;
    }
    if (task.phase === "start") changePhase(task, "approach", context);
    if (task.phase === "approach") {
      localPoint(recipient.position, recipient.heading, 0.8, 0.3, this.target);
      goTo(actor, this.target, context, 7);
      if (arrived(actor, this.target, 0.6)) {
        request.respondedAt = context.time.seconds;
        request.phase = "assisting";
        changePhase(task, "ask", context, 3.5);
      }
      return;
    }
    if (task.phase === "ask") {
      stopWalking(actor, "assisting");
      facePoint(actor, recipient.position);
      facePoint(recipient, actor.position);
      setGesture(actor, "talk", context.time.seconds, 0.65);
      setGesture(recipient, "listen", context.time.seconds, 0.4);
      lookAtActor(actor, recipient, context);
      if (phaseFinished(task, context)) {
        request.consented = true;
        changePhase(task, request.kind === "directions" ? "directions" : request.kind === "lost-child" ? "find-guardian" : request.kind === "dropped-item" ? "retrieve" : "escort", context, 12);
      }
      return;
    }
    if (task.phase === "directions") {
      const destination = context.places.get(recipient.task?.venueId ?? request.targetVenue);
      if (destination) {
        facePoint(actor, destination.entrance);
        setGesture(actor, "point", context.time.seconds, 0.8);
        recipient.navigation.failed = false;
        recipient.navigation.repathAfter = 0;
        if (phaseFinished(task, context)) {
          goTo(recipient, destination.entrance, context, 4);
          this.resolve(request, actor, recipient, context);
        }
      } else this.resolve(request, actor, recipient, context);
      return;
    }
    if (task.phase === "find-guardian") {
      this.reunite(actor, recipient, request, task, context);
      return;
    }
    if (task.phase === "retrieve") {
      setGesture(actor, "kneel", context.time.seconds, 0.8);
      if (phaseProgress(task, context) > 0.6) setGesture(actor, "carry", context.time.seconds, 0.6);
      if (phaseFinished(task, context)) {
        if (request.propId >= 0) context.props.transfer(request.propId, recipient, "right-hand");
        this.resolve(request, actor, recipient, context);
      }
      return;
    }
    if (task.phase === "escort") {
      this.escortToRest(actor, recipient, request, task, context);
      return;
    }
    if (task.phase === "rest") {
      stopWalking(actor, "assisting");
      stopWalking(recipient, "seated");
      setGesture(actor, "talk", context.time.seconds, 0.4);
      setGesture(recipient, "sit", context.time.seconds, 0.3);
      recipient.needs.energy = clamp(recipient.needs.energy + context.time.dt * 0.008, 0, 1);
      recipient.needs.stress = clamp(recipient.needs.stress - context.time.dt * 0.004, 0, 1);
      if (phaseFinished(task, context)) this.resolve(request, actor, recipient, context);
    }
  }

  private findHelpCandidate(actor: Actor, context: LifeContext): Actor | undefined {
    let best: Actor | undefined;
    let score = -Infinity;
    for (const person of context.actors) {
      if (person.id === actor.id || !person.visible || person.vehicleId >= 0 || person.age === "child") continue;
      if (person.occupation === "medic" || person.occupation === "officer" || this.actorRequests.has(person.id)) continue;
      if (person.task && person.task.priority > 4) continue;
      const need = person.needs.stress + (1 - person.needs.energy) + (person.occupation === "tourist" ? 0.5 : 0);
      const next = need - distance(actor.position, person.position) * 0.03;
      if (next > score && distance(actor.position, person.position) < 18) {
        best = person;
        score = next;
      }
    }
    return score > 0.2 ? best : undefined;
  }

  private escortToRest(helper: Actor, recipient: Actor, request: AssistanceRequest, task: ActorTask, context: LifeContext): void {
    const place = context.places.get(request.targetVenue);
    if (!place) {
      this.resolve(request, helper, recipient, context);
      return;
    }
    if (distance(helper.position, recipient.position) > 2.1) {
      stopWalking(helper, "waiting");
      goTo(recipient, helper.position, context, 7);
      return;
    }
    const seat = place.slots.find((slot) => slot.kind === "seat" && slot.occupants.size === 0);
    const destination = seat?.position ?? place.entrance;
    goTo(helper, destination, context, 7);
    localPoint(helper.position, helper.heading, -0.7, -0.2, this.target);
    goTo(recipient, this.target, context, 7);
    helper.baseSpeed = Math.min(helper.baseSpeed, recipient.baseSpeed);
    if (arrived(helper, destination, 0.8) && distance(helper.position, recipient.position) < 2) changePhase(task, "rest", context, 14);
  }

  private reunite(helper: Actor, child: Actor, request: AssistanceRequest, task: ActorTask, context: LifeContext): void {
    const guardian = context.actorById.get(child.guardianId);
    if (!guardian) {
      const school = context.places.ofKind("school")[0];
      if (school) {
        request.targetVenue = school.id;
        changePhase(task, "escort", context);
      }
      return;
    }
    stopWalking(child, "waiting");
    setGesture(helper, "phone", context.time.seconds, 0.6);
    goTo(guardian, request.position, context, 7);
    if (distance(guardian.position, child.position) < 2) {
      setGesture(child, "wave", context.time.seconds, 0.9);
      setGesture(guardian, "wave", context.time.seconds, 0.8);
      child.needs.stress = Math.max(0, child.needs.stress - 0.2);
      this.resolve(request, helper, child, context);
    }
  }

  private medic(actor: Actor, task: ActorTask, context: LifeContext): void {
    const request = this.requestForHelper(actor);
    if (!request) {
      this.clinicDuty(actor, task, context);
      return;
    }
    const patient = context.actorById.get(request.actorId);
    if (!patient) {
      failTask(actor, context, "patient-unavailable");
      return;
    }
    if (task.phase === "start") {
      context.props.ensureOwned(actor, "medical-kit", context.time.seconds, "left-hand", "#8d6758");
      changePhase(task, "approach", context);
    }
    if (task.phase === "approach") {
      goTo(actor, patient.position, context, 8);
      if (arrived(actor, patient.position, 1.2)) {
        stopWalking(actor, "assisting");
        request.phase = "assisting";
        request.respondedAt = context.time.seconds;
        changePhase(task, "consult", context, 4);
      }
      return;
    }
    if (task.phase === "consult") {
      facePoint(actor, patient.position);
      lookAtActor(actor, patient, context);
      setGesture(actor, "talk", context.time.seconds, 0.6);
      setGesture(patient, "listen", context.time.seconds, 0.3);
      if (phaseFinished(task, context)) {
        request.consented = true;
        changePhase(task, "examine", context, 7);
      }
      return;
    }
    if (task.phase === "examine") {
      setGesture(actor, "kneel", context.time.seconds, 0.7);
      if (phaseFinished(task, context)) {
        request.examined = true;
        changePhase(task, "treat", context, 12);
      }
      return;
    }
    if (task.phase === "treat") {
      if (!request.consented || !request.examined) return;
      setGesture(actor, "repair", context.time.seconds, 0.4);
      request.treatment = phaseProgress(task, context);
      patient.health = clamp(patient.health + context.time.dt * 0.008, 0, 1);
      patient.needs.stress = clamp(patient.needs.stress - context.time.dt * 0.006, 0, 1);
      if (phaseFinished(task, context)) {
        if (patient.health < 0.72) changePhase(task, "call-vehicle", context, 35);
        else this.resolve(request, actor, patient, context);
      }
      return;
    }
    if (task.phase === "call-vehicle") {
      this.callAmbulance(actor, patient, request, task, context);
      return;
    }
    if (task.phase === "accompany") {
      this.medicalTransport(actor, patient, request, task, context);
    }
  }

  private clinicDuty(actor: Actor, task: ActorTask, context: LifeContext): void {
    const clinic = context.places.get(task.venueId);
    if (!clinic) {
      failTask(actor, context, "clinic-unavailable");
      return;
    }
    if (task.phase === "start") changePhase(task, "clinic-arrive", context);
    if (task.phase === "clinic-arrive") {
      goTo(actor, clinic.entrance, context, 4);
      if (arrived(actor, clinic.entrance, 0.75)) changePhase(task, "clinic-duty", context, 24);
      return;
    }
    stopWalking(actor, "working");
    setGesture(actor, Math.floor(context.time.seconds / 5) % 2 ? "write" : "listen", context.time.seconds, 0.4);
    if (phaseFinished(task, context)) finishSatisfied(actor, context, "clinic-duty-completed", 0.2);
  }

  private callAmbulance(actor: Actor, patient: Actor, request: AssistanceRequest, task: ActorTask, context: LifeContext): void {
    setGesture(actor, "phone", context.time.seconds, 0.7);
    let vehicle = context.vehicles.find((candidate) => candidate.id === request.vehicleId);
    if (!vehicle) {
      vehicle = this.fleet.available("ambulance", patient.position, context);
      if (vehicle && this.fleet.claim(vehicle, request.id) && this.fleet.driveTo(vehicle, patient.position, context, true)) request.vehicleId = vehicle.id;
    }
    if (!vehicle) {
      if (phaseFinished(task, context)) {
        request.targetVenue = context.places.ofKind("clinic")[0]?.id ?? patient.homeId;
        changePhase(task, "escort", context, 30);
        task.kind = "help";
      }
      return;
    }
    if (this.fleet.atDestination(vehicle) && this.fleet.openDoors(vehicle, context, 8)) {
      if (this.fleet.board(vehicle, patient.id, context)) {
        this.fleet.board(vehicle, actor.id, context);
        request.phase = "transport";
        const clinic = context.places.get(request.targetVenue);
        if (clinic) this.fleet.driveTo(vehicle, clinic.entrance, context, true);
        changePhase(task, "accompany", context, 180);
      }
    }
  }

  private medicalTransport(actor: Actor, patient: Actor, request: AssistanceRequest, task: ActorTask, context: LifeContext): void {
    const vehicle = context.vehicles.find((candidate) => candidate.id === request.vehicleId);
    const clinic = context.places.get(request.targetVenue);
    if (!vehicle || !clinic) return;
    context.events.update(request.eventId, vehicle.position, 0.65 + this.fleet.progress(vehicle) * 0.3, context.time.seconds, "transport");
    task.deadline = Math.max(task.deadline, context.time.seconds + 30);
    if (this.fleet.atDestination(vehicle) && this.fleet.openDoors(vehicle, context, 5)) {
      this.fleet.alight(vehicle, patient.id, clinic.entrance, context);
      this.fleet.alight(vehicle, actor.id, clinic.entrance, context);
      this.fleet.release(vehicle, context, true);
      patient.health = Math.max(patient.health, 0.8);
      this.resolve(request, actor, patient, context);
      if (!patient.task) context.issueTask(patient, "home", patient.homeId, 5);
    }
  }

  private patrol(actor: Actor, task: ActorTask, context: LifeContext): void {
    if (task.phase === "start") {
      const candidates = [...context.places.ofKind("bus-stop"), ...context.places.ofKind("park"), ...context.places.ofKind("promenade")];
      candidates.sort((a, b) => distance(actor.position, a.entrance) - distance(actor.position, b.entrance));
      const route = candidates.slice(0, 4).map((place) => ({ ...place.entrance }));
      this.patrolTargets.set(actor.id, route);
      task.payload = 0;
      changePhase(task, "patrol-walk", context, 120);
    }
    const route = this.patrolTargets.get(actor.id);
    const target = route?.[task.payload];
    if (!target) {
      finishSatisfied(actor, context, "patrol-completed", 0.25);
      return;
    }
    if (task.phase === "patrol-walk") {
      goTo(actor, target, context, 3);
      if (arrived(actor, target, 0.7)) changePhase(task, "observe", context, 5);
      return;
    }
    if (task.phase === "observe") {
      stopWalking(actor, "working");
      setGesture(actor, "watch", context.time.seconds, 0.5);
      actor.targetHeading += Math.sin(context.time.seconds) * context.time.dt * 0.12;
      if (phaseFinished(task, context)) {
        task.payload++;
        changePhase(task, "patrol-walk", context);
      }
    }
  }

  private keepPatientSafe(request: AssistanceRequest, context: LifeContext): void {
    const actor = context.actorById.get(request.actorId);
    if (!actor) return;
    if (request.kind === "medical" && actor.vehicleId < 0) {
      stopWalking(actor, "resting");
      actor.navigation.pending = false;
      actor.navigation.points.length = 0;
      actor.nextDecision = context.time.seconds + 5;
      setGesture(actor, "sit", context.time.seconds, 0.2);
    }
    if (request.phase !== "transport") context.events.update(request.eventId, actor.position, request.phase === "reported" ? 0.05 : request.phase === "assigned" ? 0.2 : 0.35 + request.treatment * 0.3, context.time.seconds, request.phase);
  }

  private resolve(request: AssistanceRequest, helper: Actor, recipient: Actor, context: LifeContext): void {
    request.phase = "resolved";
    request.resolvedAt = context.time.seconds;
    recipient.needs.stress = clamp(recipient.needs.stress - 0.12, 0, 1);
    recipient.nextDecision = context.time.seconds + 2;
    setGesture(recipient, "wave", context.time.seconds, 0.7);
    remember(recipient, `received-${request.kind}-help`, request.targetVenue, context, 0.6, helper.id, request.eventId);
    remember(helper, `provided-${request.kind}-help`, request.targetVenue, context, 0.45, recipient.id, request.eventId);
    context.events.finish(request.eventId, context.time.seconds);
    this.helperRequests.delete(helper.id);
    this.actorRequests.delete(recipient.id);
    finishSatisfied(helper, context, "assistance-completed", 0.4);
  }

  private expire(context: LifeContext): void {
    for (const [id, request] of this.requests) {
      if (request.phase === "resolved" && context.time.seconds - request.resolvedAt > 5) this.requests.delete(id);
      else if (request.helperId < 0 && context.time.seconds - request.reportedAt > 120 && request.kind !== "medical") {
        this.actorRequests.delete(request.actorId);
        context.events.finish(request.eventId, context.time.seconds);
        this.requests.delete(id);
      }
    }
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    this.patrolTargets.delete(actor.id);
    const request = this.requestForHelper(actor);
    if (!request || request.phase === "resolved") return;
    if (request.helperId === actor.id) {
      request.helperId = -1;
      request.phase = "reported";
      this.helperRequests.delete(actor.id);
    }
    const medicalKit = context.props.owned(actor.id, "medical-kit");
    if (medicalKit) context.props.remove(medicalKit.id);
  }
}
