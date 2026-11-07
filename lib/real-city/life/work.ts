import { clamp, distance, localPoint, point } from "./math";
import { addItem, arrived, changePhase, clearTransientProps, enterInterior, failTask, finishSatisfied, goTo, item, leaveInterior, phaseFinished, phaseProgress, releaseReservation, reserve, setGesture, stopWalking, useReservation } from "./actions";
import { simulationSecondsForMinutes } from "./clock";
import type { Actor, LifeContext, LifeSystem } from "./types";
import type { LifePlace } from "./places";

interface WorkShift {
  actorId: number;
  placeId: string;
  startedAt: number;
  endsAt: number;
  nextBreak: number;
  completedMinutes: number;
  stationId: string;
  eventId: number;
  breakCount: number;
  publicFacing: boolean;
}

export class WorkAndHome implements LifeSystem {
  private readonly shifts = new Map<number, WorkShift>();
  private readonly staffByVenue = new Map<string, Set<number>>();
  private readonly patrolPoint = point();

  reset(): void {
    this.shifts.clear();
    this.staffByVenue.clear();
  }

  tick(context: LifeContext): void {
    for (const actor of context.actors) {
      if (actor.task?.kind === "home") this.home(actor, context);
      else if (actor.task?.kind === "work") this.work(actor, context);
    }
    this.updateServiceCapacity(context);
  }

  private work(actor: Actor, context: LifeContext): void {
    const task = actor.task!;
    const place = context.places.get(task.venueId);
    if (!place) {
      failTask(actor, context, "workplace-unavailable");
      return;
    }
    if (!context.places.isOpen(place, context.time) && task.phase !== "leave") {
      if (actor.interiorId) leaveInterior(actor, context);
      context.completeTask(actor, true);
      return;
    }
    switch (task.phase) {
      case "start": {
        if (actor.interiorId) leaveInterior(actor, context);
        if (actor.occupation === "office") addItem(actor, "briefcase", context, 1, "left-hand", "#514d46");
        task.target.x = place.entrance.x;
        task.target.z = place.entrance.z;
        goTo(actor, task.target, context, 4);
        changePhase(task, "arriving", context);
        task.serviceId = context.events.publish(`work-arrival-${actor.id}`, "work",
          { zh: "步行上班，抵达办公楼", en: "Arriving for work" },
          { zh: "通勤者沿人行道来到实际门厅，等候前一位同事通过。", en: "A commuter reaches the real entrance and waits for the person ahead." },
          actor.position, context.time.seconds, 90, [actor.id]);
        break;
      }
      case "arriving": {
        context.events.update(task.serviceId, actor.position, 0.1, context.time.seconds, "arriving");
        if (actor.navigation.failed) {
          failTask(actor, context, "work-route-blocked");
          return;
        }
        if (!arrived(actor, place.entrance, 0.7)) return;
        const door = reserve(actor, place, "door", context, 12, 3);
        if (!door) {
          stopWalking(actor);
          setGesture(actor, "watch", context.time.seconds, 0.3);
          return;
        }
        task.reservationId = door.id;
        changePhase(task, "badge", context, 1.4 + actor.personality.caution);
        stopWalking(actor);
        actor.targetHeading = place.heading;
        setGesture(actor, "scan", context.time.seconds, 0.8);
        context.events.describe(task.serviceId,
          { zh: "在门厅刷卡，确认前方通道空闲后进入。", en: "Checking in at the lobby before entering the clear doorway." });
        break;
      }
      case "badge": {
        context.events.update(task.serviceId, actor.position, 0.25 + phaseProgress(task, context) * 0.25, context.time.seconds, "check-in");
        if (!phaseFinished(task, context)) return;
        releaseReservation(actor, context);
        this.beginShift(actor, place, context);
        break;
      }
      case "working": this.advanceShift(actor, place, context); break;
      case "break-walk": this.approachBreak(actor, place, context); break;
      case "break": this.takeBreak(actor, place, context); break;
      case "return": this.returnFromBreak(actor, place, context); break;
      case "leave": this.leaveShift(actor, place, context); break;
    }
  }

  private beginShift(actor: Actor, place: LifePlace, context: LifeContext): void {
    const task = actor.task!;
    const publicFacing = actor.occupation === "retail" || actor.occupation === "cook"
      || actor.occupation === "technician" || actor.occupation === "teacher";
    const intendedDuration = task.payload > 0 ? simulationSecondsForMinutes(task.payload) : 42 + actor.personality.diligence * 24;
    const duration = Math.max(24, Math.min(130, intendedDuration));
    const shift: WorkShift = {
      actorId: actor.id,
      placeId: place.id,
      startedAt: context.time.seconds,
      endsAt: context.time.seconds + duration,
      nextBreak: context.time.seconds + 20 + actor.id % 8,
      completedMinutes: 0,
      stationId: "",
      eventId: task.serviceId,
      breakCount: 0,
      publicFacing,
    };
    this.shifts.set(actor.id, shift);
    const staff = this.staffByVenue.get(place.id) ?? new Set();
    staff.add(actor.id);
    this.staffByVenue.set(place.id, staff);
    if (publicFacing) {
      const station = reserve(actor, place, "counter", context, duration + 15, 4);
      if (station) {
        shift.stationId = station.slotId;
        actor.position.x = station.position.x;
        actor.position.z = station.position.z;
        actor.groundY = place.groundY;
        context.reservations.arrive(station.id, actor.id, context.time.seconds);
      }
      actor.visible = true;
      stopWalking(actor, "working");
      actor.targetHeading = place.heading + Math.PI;
      setGesture(actor, actor.occupation === "cook" ? "carry" : "scan", context.time.seconds, 0.7);
      if (actor.occupation === "cook") context.props.ensureOwned(actor, "tray", context.time.seconds, "left-hand", "#b3b3a8");
    } else {
      enterInterior(actor, place, context);
      context.events.finish(task.serviceId, context.time.seconds);
      context.props.hideOwned(actor.id);
    }
    changePhase(task, "working", context, duration);
  }

  private advanceShift(actor: Actor, place: LifePlace, context: LifeContext): void {
    const task = actor.task!;
    const shift = this.shifts.get(actor.id);
    if (!shift) {
      changePhase(task, "start", context);
      return;
    }
    shift.completedMinutes += context.time.dt * 2;
    task.progress = clamp((context.time.seconds - shift.startedAt) / (shift.endsAt - shift.startedAt), 0, 1);
    if (shift.publicFacing) {
      actor.mode = "working";
      const cadence = Math.floor((context.time.seconds - shift.startedAt) / 3) % 4;
      const gesture = actor.occupation === "cook" ? ["carry", "write", "lift", "carry"] as const
        : ["scan", "pay", "talk", "write"] as const;
      setGesture(actor, gesture[cadence], context.time.seconds, 0.65);
      context.events.update(shift.eventId, actor.position, task.progress, context.time.seconds, "serving");
    }
    if (context.time.seconds >= shift.endsAt || actor.needs.hunger > 0.92) {
      if (actor.interiorId) leaveInterior(actor, context);
      releaseReservation(actor, context);
      changePhase(task, "leave", context, 2.2);
      setGesture(actor, "wave", context.time.seconds, 0.45);
      return;
    }
    if (context.time.seconds >= shift.nextBreak && shift.breakCount < 2) {
      if (shift.publicFacing && this.staffCount(place.id) <= 1 && context.time.lunchRush > 0.5) {
        shift.nextBreak += 8;
        return;
      }
      this.beginBreak(actor, place, shift, context);
    }
  }

  private beginBreak(actor: Actor, place: LifePlace, shift: WorkShift, context: LifeContext): void {
    const task = actor.task!;
    if (actor.interiorId) leaveInterior(actor, context);
    releaseReservation(actor, context);
    this.staffByVenue.get(place.id)?.delete(actor.id);
    localPoint(place.entrance, place.heading, 2 + actor.id % 2 * 0.8, -1.4, this.patrolPoint);
    task.target.x = this.patrolPoint.x;
    task.target.z = this.patrolPoint.z;
    goTo(actor, task.target, context, 1);
    shift.breakCount++;
    changePhase(task, "break-walk", context);
    task.serviceId = context.events.publish(`work-break-${actor.id}`, "work",
      { zh: "工作间隙，走到楼下透口气", en: "A short break outside the office" },
      { zh: "同事从门厅出来，喝水、活动肩颈，之后回到岗位。", en: "A worker steps outside, takes a drink and stretches before returning." },
      place.entrance, context.time.seconds, 18, [actor.id]);
  }

  private approachBreak(actor: Actor, place: LifePlace, context: LifeContext): void {
    const task = actor.task!;
    if (actor.navigation.failed || arrived(actor, task.target, 0.6)) {
      stopWalking(actor, "resting");
      setGesture(actor, "stretch", context.time.seconds, 0.55);
      changePhase(task, "break", context, 6 + actor.personality.sociability * 7);
    }
    context.events.update(task.serviceId, actor.position, 0.15, context.time.seconds);
  }

  private takeBreak(actor: Actor, place: LifePlace, context: LifeContext): void {
    const task = actor.task!;
    const progress = phaseProgress(task, context);
    setGesture(actor, progress < 0.45 ? "stretch" : "phone", context.time.seconds, 0.6);
    actor.needs.stress = Math.max(0, actor.needs.stress - context.time.dt * 0.012);
    actor.needs.energy = Math.min(1, actor.needs.energy + context.time.dt * 0.005);
    context.events.update(task.serviceId, actor.position, 0.2 + progress * 0.65, context.time.seconds, "break");
    if (!phaseFinished(task, context)) return;
    goTo(actor, place.entrance, context, 2);
    changePhase(task, "return", context);
  }

  private returnFromBreak(actor: Actor, place: LifePlace, context: LifeContext): void {
    if (!arrived(actor, place.entrance, 0.7) && !actor.navigation.failed) return;
    const shift = this.shifts.get(actor.id);
    if (!shift) {
      context.completeTask(actor, true);
      return;
    }
    shift.nextBreak = context.time.seconds + 28;
    const staff = this.staffByVenue.get(place.id) ?? new Set();
    staff.add(actor.id);
    this.staffByVenue.set(place.id, staff);
    context.events.finish(actor.task!.serviceId, context.time.seconds);
    if (shift.publicFacing) {
      actor.mode = "working";
      const station = reserve(actor, place, "counter", context, shift.endsAt - context.time.seconds + 10, 4);
      if (station) useReservation(actor, station, context, "working");
    } else enterInterior(actor, place, context);
    changePhase(actor.task!, "working", context, Math.max(1, shift.endsAt - context.time.seconds));
  }

  private leaveShift(actor: Actor, place: LifePlace, context: LifeContext): void {
    const task = actor.task!;
    if (!phaseFinished(task, context)) return;
    this.staffByVenue.get(place.id)?.delete(actor.id);
    this.shifts.delete(actor.id);
    actor.budget = Math.min(250, actor.budget + 14);
    clearTransientProps(actor, context);
    context.events.finish(task.serviceId, context.time.seconds);
    finishSatisfied(actor, context, "shift-completed", 0.25);
  }

  private home(actor: Actor, context: LifeContext): void {
    const task = actor.task!;
    const place = context.places.get(actor.homeId);
    if (!place) {
      context.completeTask(actor, false);
      return;
    }
    if (task.phase === "start") {
      if (actor.interiorId && actor.interiorId !== actor.homeId) leaveInterior(actor, context);
      goTo(actor, place.entrance, context, 2);
      changePhase(task, "approach", context);
    } else if (task.phase === "approach") {
      if (actor.navigation.failed) {
        failTask(actor, context, "home-route-blocked");
        return;
      }
      if (!arrived(actor, place.entrance, 0.6)) return;
      const door = reserve(actor, place, "door", context, 10);
      if (!door) return;
      stopWalking(actor);
      actor.targetHeading = place.heading;
      setGesture(actor, "scan", context.time.seconds, 0.5);
      changePhase(task, "unlock", context, 1.4);
    } else if (task.phase === "unlock") {
      if (!phaseFinished(task, context)) return;
      releaseReservation(actor, context);
      if (!enterInterior(actor, place, context)) return;
      context.props.hideOwned(actor.id);
      for (const carried of [...actor.inventory]) {
        if (carried.kind === "grocery" || carried.kind === "parcel" || carried.kind === "flowers") {
          const index = actor.inventory.indexOf(carried);
          actor.inventory.splice(index, 1);
          context.props.remove(carried.propId);
        }
      }
      changePhase(task, "rest", context, context.time.night ? 55 : 22);
    } else if (task.phase === "rest") {
      task.progress = phaseProgress(task, context);
      if (!phaseFinished(task, context)) return;
      leaveInterior(actor, context);
      context.completeTask(actor, true);
      actor.nextDecision = context.time.seconds + (context.time.night ? 18 : 2);
    }
  }

  private updateServiceCapacity(context: LifeContext): void {
    for (const place of context.places.all) {
      if (!["restaurant", "cafe", "grocery", "bookshop", "florist"].includes(place.kind)) continue;
      const count = this.staffCount(place.id);
      place.serviceRate = 0.75 + Math.min(2, count) * 0.35;
    }
  }

  staffCount(placeId: string): number {
    return this.staffByVenue.get(placeId)?.size ?? 0;
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const shift = this.shifts.get(actor.id);
    if (shift) {
      this.staffByVenue.get(shift.placeId)?.delete(actor.id);
      context.events.finish(shift.eventId, context.time.seconds);
      this.shifts.delete(actor.id);
    }
  }
}
