import { clamp, distance, localPoint, point } from "./math";
import { addItem, arrived, changePhase, enterInterior, facePoint, failTask, finishSatisfied, goTo, leaveInterior, lookAtActor, phaseFinished, phaseProgress, setGesture, stopWalking } from "./actions";
import { simulationSecondsForMinutes } from "./clock";
import type { Actor, ActorTask, LifeContext, LifeSystem } from "./types";
import type { LifePlace } from "./places";

interface Enrollment {
  studentId: number;
  guardianId: number;
  teacherId: number;
  arrivedAt: number;
  departedAt: number;
  checkedIn: boolean;
  checkedOut: boolean;
  guardianVerified: boolean;
  room: number;
  lesson: number;
  attendanceDay: number;
  attention: number;
  participation: number;
  pickupRequestedAt: number;
  lastReminderAt: number;
  eventId: number;
}

interface Lesson {
  id: number;
  teacherId: number;
  kind: "reading" | "garden" | "exercise" | "art";
  students: number[];
  placeId: string;
  startedAt: number;
  endsAt: number;
  phase: "gather" | "teach" | "practice" | "return";
  eventId: number;
  propIds: number[];
  finished: boolean;
}

export class NeighborhoodSchool implements LifeSystem {
  private readonly enrollments = new Map<number, Enrollment>();
  private readonly lessons = new Map<number, Lesson>();
  private readonly teacherLessons = new Map<number, number>();
  private nextLesson = 1;
  private nextOutdoorLesson = 8;
  private readonly target = point();

  reset(context: LifeContext): void {
    this.enrollments.clear();
    this.lessons.clear();
    this.teacherLessons.clear();
    this.nextLesson = 1;
    this.nextOutdoorLesson = context.time.seconds + 12;
    for (const student of context.actors) {
      if (student.occupation !== "student") continue;
      this.enrollments.set(student.id, {
        studentId: student.id,
        guardianId: student.guardianId,
        teacherId: -1,
        arrivedAt: 0,
        departedAt: 0,
        checkedIn: false,
        checkedOut: false,
        guardianVerified: false,
        room: student.id % 3,
        lesson: -1,
        attendanceDay: context.time.day,
        attention: 0.75,
        participation: 0,
        pickupRequestedAt: -1,
        lastReminderAt: 0,
        eventId: -1,
      });
    }
  }

  tick(context: LifeContext): void {
    this.resetDay(context);
    for (const actor of context.actors) {
      if (actor.task?.kind === "school") {
        if (actor.occupation === "teacher") this.teacher(actor, actor.task, context);
        else this.student(actor, actor.task, context);
      } else if (actor.task?.kind === "pickup") {
        if (actor.age === "child") this.waitForGuardian(actor, actor.task, context);
        else this.guardian(actor, actor.task, context);
      }
    }
    this.lessonsTick(context);
    this.safeWaiting(context);
  }

  private resetDay(context: LifeContext): void {
    for (const enrollment of this.enrollments.values()) {
      if (enrollment.attendanceDay === context.time.day) continue;
      enrollment.attendanceDay = context.time.day;
      enrollment.checkedIn = false;
      enrollment.checkedOut = false;
      enrollment.guardianVerified = false;
      enrollment.arrivedAt = 0;
      enrollment.departedAt = 0;
      enrollment.lesson = -1;
      enrollment.participation = 0;
      enrollment.pickupRequestedAt = -1;
      enrollment.teacherId = -1;
    }
  }

  private enrollment(actor: Actor): Enrollment | undefined {
    return this.enrollments.get(actor.id);
  }

  private school(context: LifeContext): LifePlace | undefined {
    return context.places.get("civic-school") ?? context.places.ofKind("school")[0];
  }

  private student(actor: Actor, task: ActorTask, context: LifeContext): void {
    const school = this.school(context);
    const enrollment = this.enrollment(actor);
    if (!school || !enrollment) {
      failTask(actor, context, "school-unavailable");
      return;
    }
    if (task.phase === "start") {
      addItem(actor, "bag", context, 1, "back", "#668293");
      enrollment.checkedOut = false;
      changePhase(task, "arrive", context);
    }
    if (task.phase === "arrive") {
      const guardian = context.actorById.get(enrollment.guardianId);
      if (guardian?.task?.kind === "pickup" && distance(actor.position, guardian.position) > 3) {
        goTo(actor, guardian.position, context, 6);
        return;
      }
      goTo(actor, school.entrance, context, 6);
      if (arrived(actor, school.entrance, 1.2)) {
        stopWalking(actor, "waiting");
        changePhase(task, "check-in", context, 3.5);
        enrollment.eventId = context.events.publish(`school-arrival-${actor.id}`, "school",
          { zh: "学生到校，老师迎接", en: "Students arrive and greet their teacher" },
          { zh: "学生在校门前等候登记，家长确认交接后才离开。", en: "Students wait at the gate while the teacher records their arrival and the guardian confirms the handover." },
          school.entrance, context.time.seconds, 18, [actor.id]);
      }
      return;
    }
    if (task.phase === "check-in") {
      const teacher = this.availableTeacher(context, school);
      if (teacher) {
        enrollment.teacherId = teacher.id;
        lookAtActor(actor, teacher, context);
        facePoint(actor, teacher.position);
        setGesture(actor, "wave", context.time.seconds, 0.6);
      } else setGesture(actor, "watch", context.time.seconds, 0.4);
      if (!phaseFinished(task, context)) return;
      enrollment.checkedIn = true;
      enrollment.arrivedAt = context.time.seconds;
      const duration = Math.max(25, simulationSecondsForMinutes(task.payload || 90));
      if (enterInterior(actor, school, context)) {
        changePhase(task, "lesson", context, duration);
        context.events.finish(enrollment.eventId, context.time.seconds);
      }
      return;
    }
    if (task.phase === "lesson") {
      const progress = phaseProgress(task, context);
      enrollment.attention = clamp(enrollment.attention + (0.8 - actor.needs.stress - actor.needs.hunger * 0.4 - enrollment.attention) * context.time.dt * 0.03, 0.1, 1);
      enrollment.participation += context.time.dt * enrollment.attention * 0.01;
      actor.needs.curiosity = clamp(actor.needs.curiosity - context.time.dt * 0.001, 0, 1);
      if (enrollment.lesson >= 0) return;
      if (context.time.hour >= 15.5 || phaseFinished(task, context) && progress >= 1) {
        leaveInterior(actor, context);
        changePhase(task, "dismiss", context, 4);
      }
      return;
    }
    if (task.phase === "dismiss") {
      setGesture(actor, "wave", context.time.seconds, 0.7);
      if (phaseFinished(task, context)) {
        context.completeTask(actor, true);
        context.issueTask(actor, "pickup", school.id, 6);
      }
    }
  }

  private teacher(actor: Actor, task: ActorTask, context: LifeContext): void {
    const school = this.school(context);
    if (!school) {
      failTask(actor, context, "school-missing");
      return;
    }
    if (task.phase === "start") {
      addItem(actor, "book", context, 1, "left-hand", "#8c795e");
      changePhase(task, "arrive", context);
    }
    if (task.phase === "arrive") {
      localPoint(school.entrance, school.heading, -0.85, 0.1, this.target);
      goTo(actor, this.target, context, 5);
      if (arrived(actor, this.target, 0.5)) changePhase(task, "supervise", context, 200);
      return;
    }
    if (task.phase === "supervise") {
      stopWalking(actor, "working");
      setGesture(actor, "listen", context.time.seconds, 0.5);
      const arriving = context.actors.find((student) => student.task?.kind === "school" && student.task.phase === "check-in" && distance(student.position, actor.position) < 4);
      if (arriving) {
        facePoint(actor, arriving.position);
        setGesture(actor, "wave", context.time.seconds, 0.6);
      }
      if (!this.teacherLessons.has(actor.id) && context.time.seconds >= this.nextOutdoorLesson && context.weather.outdoorComfort > 0.45) {
        if (this.beginLesson(actor, school, context)) this.nextOutdoorLesson = context.time.seconds + 75;
      }
      if (context.time.hour >= 17.5 || phaseFinished(task, context)) {
        if (!this.teacherLessons.has(actor.id)) finishSatisfied(actor, context, "teaching-completed", 0.25);
      }
    }
  }

  private availableTeacher(context: LifeContext, school: LifePlace): Actor | undefined {
    let nearest: Actor | undefined;
    let best = 12;
    for (const actor of context.actors) {
      if (actor.occupation !== "teacher" || !actor.visible || actor.vehicleId >= 0) continue;
      const separation = distance(actor.position, school.entrance);
      if (separation < best) {
        nearest = actor;
        best = separation;
      }
    }
    return nearest;
  }

  private guardian(actor: Actor, task: ActorTask, context: LifeContext): void {
    const school = this.school(context);
    const child = context.actorById.get(actor.dependentId);
    const enrollment = child ? this.enrollments.get(child.id) : undefined;
    if (!school || !child || !enrollment) {
      failTask(actor, context, "guardian-child-unavailable");
      return;
    }
    const morning = context.time.hour < 11;
    if (task.phase === "start") {
      task.partnerId = child.id;
      if (child.interiorId && morning) leaveInterior(child, context);
      changePhase(task, "meet-child", context);
    }
    if (task.phase === "meet-child") {
      if (morning && !enrollment.checkedIn) {
        goTo(actor, child.position, context, 6);
        if (!arrived(actor, child.position, 1.4)) return;
        if (child.task?.kind !== "school") {
          if (child.task) context.completeTask(child, false);
          context.issueTask(child, "school", school.id, 6);
        }
      }
      changePhase(task, "walk-school", context);
      return;
    }
    if (task.phase === "walk-school") {
      goTo(actor, school.entrance, context, 6);
      if (morning && !enrollment.checkedIn && child.visible) this.escort(actor, child, context);
      if (arrived(actor, school.entrance, 1.2)) {
        stopWalking(actor, "waiting");
        changePhase(task, morning ? "handover" : "request-child", context, 4);
      }
      return;
    }
    if (task.phase === "handover") {
      setGesture(actor, "talk", context.time.seconds, 0.5);
      const teacher = this.availableTeacher(context, school);
      if (teacher) lookAtActor(actor, teacher, context);
      if (enrollment.checkedIn || phaseFinished(task, context) && child.interiorId === school.id) {
        enrollment.guardianVerified = true;
        setGesture(actor, "wave", context.time.seconds, 0.6);
        finishSatisfied(actor, context, "school-dropoff", 0.3);
      }
      return;
    }
    if (task.phase === "request-child") {
      enrollment.pickupRequestedAt = context.time.seconds;
      enrollment.guardianVerified = actor.id === enrollment.guardianId;
      setGesture(actor, "talk", context.time.seconds, 0.6);
      if (!enrollment.guardianVerified) {
        failTask(actor, context, "guardian-verification-failed");
        return;
      }
      if (child.interiorId && enrollment.lesson < 0) leaveInterior(child, context);
      if (child.task?.kind !== "pickup" && enrollment.lesson < 0) {
        if (child.task) context.completeTask(child, true);
        context.issueTask(child, "pickup", school.id, 6);
      }
      if (child.visible && distance(child.position, actor.position) < 2) changePhase(task, "reunite", context, 4);
      return;
    }
    if (task.phase === "reunite") {
      facePoint(actor, child.position);
      facePoint(child, actor.position);
      setGesture(actor, "wave", context.time.seconds, 0.7);
      setGesture(child, "wave", context.time.seconds, 0.8);
      if (phaseFinished(task, context)) {
        enrollment.checkedOut = true;
        enrollment.departedAt = context.time.seconds;
        changePhase(task, "walk-home", context);
        const home = context.places.get(actor.homeId);
        if (home) task.target = { ...home.entrance };
      }
      return;
    }
    if (task.phase === "walk-home") {
      goTo(actor, task.target, context, 6);
      this.escort(actor, child, context);
      if (arrived(actor, task.target, 0.8) && distance(actor.position, child.position) < 2) {
        if (child.task) context.completeTask(child, true);
        context.issueTask(child, "home", child.homeId, 5);
        finishSatisfied(actor, context, "school-pickup", 0.4);
      }
    }
  }

  private escort(parent: Actor, child: Actor, context: LifeContext): void {
    const separation = distance(parent.position, child.position);
    if (separation > 2.5) {
      stopWalking(parent, "waiting");
      setGesture(parent, "wave", context.time.seconds, 0.4);
      goTo(child, parent.position, context, 7);
      return;
    }
    if (parent.mode === "walking") {
      localPoint(parent.position, parent.heading, -0.6, -0.4, this.target);
      goTo(child, this.target, context, 7);
      child.baseSpeed = Math.min(1.35, parent.baseSpeed);
    }
    lookAtActor(parent, child, context, 1);
  }

  private waitForGuardian(actor: Actor, task: ActorTask, context: LifeContext): void {
    const enrollment = this.enrollment(actor);
    const school = this.school(context);
    if (!enrollment || !school) {
      failTask(actor, context, "pickup-school-missing");
      return;
    }
    const guardian = context.actorById.get(enrollment.guardianId);
    if (enrollment.checkedOut && guardian) {
      if (guardian.task?.phase === "walk-home") return;
      if (guardian.task?.kind === "home") {
        context.completeTask(actor, true);
        context.issueTask(actor, "home", actor.homeId, 5);
      }
      return;
    }
    localPoint(school.entrance, school.heading, (actor.id % 4 - 1.5) * 0.65, 0.8, this.target);
    goTo(actor, this.target, context, 6);
    if (arrived(actor, this.target, 0.4)) {
      stopWalking(actor, "waiting");
      setGesture(actor, "watch", context.time.seconds, 0.3);
    }
    if (guardian && distance(guardian.position, actor.position) < 4 && guardian.task?.kind === "pickup") {
      lookAtActor(actor, guardian, context);
      setGesture(actor, "wave", context.time.seconds, 0.7);
    }
    task.progress = clamp((context.time.seconds - task.startedAt) / 90, 0, 0.95);
    task.deadline = Math.max(task.deadline, context.time.seconds + 60);
  }

  private beginLesson(teacher: Actor, school: LifePlace, context: LifeContext): boolean {
    const students = [...this.enrollments.values()].filter((entry) => entry.checkedIn && !entry.checkedOut && entry.lesson < 0).slice(0, 4);
    if (students.length < 2) return false;
    const id = this.nextLesson++;
    const kind = context.random.choice<Lesson["kind"]>(["reading", "garden", "exercise", "art"]);
    const lesson: Lesson = {
      id,
      teacherId: teacher.id,
      kind,
      students: students.map((entry) => entry.studentId),
      placeId: school.id,
      startedAt: context.time.seconds,
      endsAt: context.time.seconds + 48,
      phase: "gather",
      eventId: -1,
      propIds: [],
      finished: false,
    };
    for (const enrollment of students) {
      enrollment.lesson = id;
      enrollment.teacherId = teacher.id;
      const actor = context.actorById.get(enrollment.studentId);
      if (actor?.interiorId) leaveInterior(actor, context);
    }
    lesson.eventId = context.events.publish(`school-lesson-${id}`, "school",
      { zh: "老师带学生进行户外活动", en: "A teacher leads an outdoor lesson" },
      { zh: "学生先集合、听老师讲解，再分组练习，最后按队返回校门。", en: "Students gather, listen to the teacher, practice in small groups and return through the school entrance." },
      school.entrance, context.time.seconds, 50, [teacher.id, ...lesson.students], 2);
    this.lessons.set(id, lesson);
    this.teacherLessons.set(teacher.id, id);
    return true;
  }

  private lessonsTick(context: LifeContext): void {
    for (const lesson of this.lessons.values()) {
      if (lesson.finished) continue;
      const teacher = context.actorById.get(lesson.teacherId);
      const school = context.places.get(lesson.placeId);
      if (!teacher || !school || teacher.task?.kind !== "school") {
        this.finishLesson(lesson, context);
        continue;
      }
      const elapsed = context.time.seconds - lesson.startedAt;
      lesson.phase = elapsed < 9 ? "gather" : elapsed < 19 ? "teach" : elapsed < 39 ? "practice" : "return";
      setGesture(teacher, lesson.phase === "teach" ? "point" : "listen", context.time.seconds, 0.7);
      for (let index = 0; index < lesson.students.length; index++) {
        const student = context.actorById.get(lesson.students[index]);
        if (!student) continue;
        const enrollment = this.enrollments.get(student.id)!;
        if (lesson.phase === "return") {
          goTo(student, school.entrance, context, 6);
          if (arrived(student, school.entrance, 1)) enterInterior(student, school, context);
          continue;
        }
        localPoint(school.entrance, school.heading, -2.4 + index * 0.75, 2, this.target);
        goTo(student, this.target, context, 5);
        if (!arrived(student, this.target, 0.5)) continue;
        stopWalking(student, "performing");
        facePoint(student, teacher.position);
        const gesture = lesson.phase === "gather" ? "wave" : lesson.phase === "teach" ? "listen" : lesson.kind === "exercise" ? "stretch" : lesson.kind === "garden" ? "dig" : lesson.kind === "art" ? "write" : "read";
        setGesture(student, gesture, context.time.seconds, 0.65);
        enrollment.participation += context.time.dt * 0.025;
        enrollment.attention = clamp(enrollment.attention + context.time.dt * 0.001, 0, 1);
      }
      context.events.update(lesson.eventId, school.entrance, elapsed / 48, context.time.seconds, lesson.phase);
      if (context.time.seconds >= lesson.endsAt) this.finishLesson(lesson, context);
    }
  }

  private finishLesson(lesson: Lesson, context: LifeContext): void {
    lesson.finished = true;
    this.teacherLessons.delete(lesson.teacherId);
    for (const id of lesson.students) {
      const enrollment = this.enrollments.get(id);
      if (enrollment) enrollment.lesson = -1;
      const actor = context.actorById.get(id);
      const place = context.places.get(lesson.placeId);
      if (actor && place && !actor.interiorId && actor.task?.kind === "school") {
        if (distance(actor.position, place.entrance) < 5) enterInterior(actor, place, context);
      }
    }
    for (const id of lesson.propIds) context.props.remove(id);
    context.events.finish(lesson.eventId, context.time.seconds);
    this.lessons.delete(lesson.id);
  }

  private safeWaiting(context: LifeContext): void {
    for (const enrollment of this.enrollments.values()) {
      const student = context.actorById.get(enrollment.studentId);
      if (!student || student.task?.kind !== "pickup" || enrollment.checkedOut) continue;
      const waited = context.time.seconds - student.task.startedAt;
      if (waited < 35 || context.time.seconds - enrollment.lastReminderAt < 30) continue;
      enrollment.lastReminderAt = context.time.seconds;
      const guardian = context.actorById.get(enrollment.guardianId);
      if (guardian && guardian.vehicleId < 0 && (!guardian.task || guardian.task.priority < 6)) {
        if (guardian.task) context.interruptTask(guardian, "pickup", student.task.venueId, 6);
        else context.issueTask(guardian, "pickup", student.task.venueId, 6);
      }
      student.needs.stress = Math.min(0.6, student.needs.stress + 0.02);
    }
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const teacherLesson = this.teacherLessons.get(actor.id);
    if (teacherLesson !== undefined) {
      const lesson = this.lessons.get(teacherLesson);
      if (lesson) this.finishLesson(lesson, context);
    }
    const enrollment = this.enrollment(actor);
    if (enrollment && actor.task?.kind !== "school") enrollment.lesson = -1;
    if (enrollment?.eventId) context.events.finish(enrollment.eventId, context.time.seconds);
  }
}
