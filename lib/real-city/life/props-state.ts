import { clamp, copyPoint, damping, localPoint, point, point3, positiveModulo, type Point2, type Point3 } from "./math";
import type { Actor, ItemKind, LifeContext } from "./types";

export type PropKind = ItemKind | "table" | "chair" | "stool" | "cart" | "bicycle"
  | "stroller" | "bin" | "crate" | "cone" | "barrier" | "tool" | "pump"
  | "flowerpot" | "sign" | "chessboard" | "chesspiece" | "blanket" | "easel"
  | "canvas" | "leash" | "leaves" | "newspaper" | "clipboard" | "tray"
  | "ticket" | "bus-shelter" | "bus-sign" | "taxi-sign" | "garden-bed"
  | "cleaning-cart" | "medical-kit" | "stretcher" | "walker" | "kiosk"
  | "basket" | "traffic-light" | "warning-lamp" | "watering-stream"
  | "wheelbarrow" | "ladder" | "leaf-pile" | "umbrella-stand" | "fountain";
export type PropAttachment = "world" | "left-hand" | "right-hand" | "back" | "hip" | "front";

export interface LifeProp {
  id: number;
  kind: PropKind;
  ownerId: number;
  serviceId: number;
  position: Point3;
  previousPosition: Point3;
  rotation: Point3;
  scale: Point3;
  velocity: Point3;
  attachment: PropAttachment;
  localOffset: Point3;
  visible: boolean;
  color: string;
  accent: string;
  opacity: number;
  progress: number;
  phase: number;
  state: string;
  createdAt: number;
  expiresAt: number;
  physical: boolean;
  restitution: number;
  friction: number;
  groundY: number;
  sleeping: boolean;
  grabbed: boolean;
  label: string;
}

type PropOptions = Partial<Pick<LifeProp, "ownerId" | "serviceId" | "color" | "accent" | "attachment"
  | "physical" | "restitution" | "friction" | "groundY" | "label" | "state">> & {
  y?: number;
  heading?: number;
  duration?: number;
  scale?: number | Point3;
};

export class SceneProps {
  readonly all: LifeProp[] = [];
  private readonly byId = new Map<number, LifeProp>();
  private readonly ownerProps = new Map<number, Set<number>>();
  private nextId = 1;
  private readonly attachmentPoint = point();
  readonly maximum = 384;

  create(kind: PropKind, position: Point2, seconds: number, options: PropOptions = {}): LifeProp | undefined {
    if (this.all.length >= this.maximum) {
      const disposable = this.all.find((prop) => !prop.visible || prop.expiresAt <= seconds);
      if (disposable) this.remove(disposable.id);
      else return undefined;
    }
    const scale = typeof options.scale === "number" ? point3(options.scale, options.scale, options.scale)
      : options.scale ? { ...options.scale } : point3(1, 1, 1);
    const prop: LifeProp = {
      id: this.nextId++,
      kind,
      ownerId: options.ownerId ?? -1,
      serviceId: options.serviceId ?? -1,
      position: point3(position.x, options.y ?? 0.49, position.z),
      previousPosition: point3(position.x, options.y ?? 0.49, position.z),
      rotation: point3(0, options.heading ?? 0, 0),
      scale,
      velocity: point3(),
      attachment: options.attachment ?? "world",
      localOffset: point3(),
      visible: true,
      color: options.color ?? "#93836c",
      accent: options.accent ?? "#424a4c",
      opacity: 1,
      progress: 0,
      phase: 0,
      state: options.state ?? "idle",
      createdAt: seconds,
      expiresAt: options.duration === undefined ? Infinity : seconds + options.duration,
      physical: options.physical ?? false,
      restitution: options.restitution ?? 0.2,
      friction: options.friction ?? 0.7,
      groundY: options.groundY ?? 0.49,
      sleeping: false,
      grabbed: false,
      label: options.label ?? "",
    };
    this.all.push(prop);
    this.byId.set(prop.id, prop);
    if (prop.ownerId >= 0) {
      const set = this.ownerProps.get(prop.ownerId) ?? new Set();
      set.add(prop.id);
      this.ownerProps.set(prop.ownerId, set);
    }
    return prop;
  }

  get(id: number): LifeProp | undefined {
    return this.byId.get(id);
  }

  owned(actorId: number, kind?: PropKind): LifeProp | undefined {
    for (const id of this.ownerProps.get(actorId) ?? []) {
      const prop = this.byId.get(id);
      if (prop && (!kind || prop.kind === kind)) return prop;
    }
    return undefined;
  }

  ensureOwned(actor: Actor, kind: PropKind, seconds: number, attachment: PropAttachment = "right-hand", color?: string): LifeProp | undefined {
    const existing = this.owned(actor.id, kind);
    if (existing) {
      existing.visible = true;
      existing.attachment = attachment;
      existing.expiresAt = Infinity;
      return existing;
    }
    return this.create(kind, actor.position, seconds, { ownerId: actor.id, attachment, color });
  }

  attach(id: number, actorId: number, attachment: PropAttachment, offset?: Point3): void {
    const prop = this.byId.get(id);
    if (!prop) return;
    if (prop.ownerId >= 0) this.ownerProps.get(prop.ownerId)?.delete(id);
    prop.ownerId = actorId;
    prop.attachment = attachment;
    prop.grabbed = attachment !== "world";
    prop.sleeping = false;
    prop.velocity.x = 0;
    prop.velocity.y = 0;
    prop.velocity.z = 0;
    if (offset) {
      prop.localOffset.x = offset.x;
      prop.localOffset.y = offset.y;
      prop.localOffset.z = offset.z;
    }
    const set = this.ownerProps.get(actorId) ?? new Set();
    set.add(id);
    this.ownerProps.set(actorId, set);
  }

  detach(id: number, position?: Point3, physical = false): void {
    const prop = this.byId.get(id);
    if (!prop) return;
    prop.attachment = "world";
    prop.grabbed = false;
    prop.physical = physical;
    prop.sleeping = false;
    if (position) {
      prop.position.x = position.x;
      prop.position.y = position.y;
      prop.position.z = position.z;
    }
  }

  throw(id: number, velocity: Point3): void {
    const prop = this.byId.get(id);
    if (!prop) return;
    this.detach(id, undefined, true);
    prop.velocity.x = velocity.x;
    prop.velocity.y = velocity.y;
    prop.velocity.z = velocity.z;
    prop.sleeping = false;
  }

  transfer(id: number, recipient: Actor, attachment: PropAttachment): void {
    const prop = this.get(id);
    if (!prop) return;
    this.attach(id, recipient.id, attachment);
    prop.serviceId = -1;
    prop.state = "carried";
  }

  hideOwned(actorId: number, kind?: PropKind): void {
    for (const id of this.ownerProps.get(actorId) ?? []) {
      const prop = this.byId.get(id);
      if (prop && (!kind || prop.kind === kind)) prop.visible = false;
    }
  }

  remove(id: number): void {
    const prop = this.byId.get(id);
    if (!prop) return;
    this.byId.delete(id);
    this.ownerProps.get(prop.ownerId)?.delete(id);
    const index = this.all.indexOf(prop);
    if (index >= 0) this.all.splice(index, 1);
  }

  removeOwner(actorId: number): void {
    for (const id of [...(this.ownerProps.get(actorId) ?? [])]) this.remove(id);
    this.ownerProps.delete(actorId);
  }

  removeService(serviceId: number): void {
    for (let index = this.all.length - 1; index >= 0; index--) {
      if (this.all[index].serviceId === serviceId) this.remove(this.all[index].id);
    }
  }

  tick(context: LifeContext): void {
    const dt = context.time.dt;
    const seconds = context.time.seconds;
    for (let index = this.all.length - 1; index >= 0; index--) {
      const prop = this.all[index];
      if (prop.expiresAt <= seconds) {
        this.remove(prop.id);
        continue;
      }
      prop.previousPosition.x = prop.position.x;
      prop.previousPosition.y = prop.position.y;
      prop.previousPosition.z = prop.position.z;
      prop.phase += dt;
      if (prop.attachment !== "world") {
        const actor = context.actorById.get(prop.ownerId);
        if (actor) this.followActor(prop, actor, dt);
        else prop.visible = false;
      } else if (prop.physical && !prop.sleeping) {
        this.integrate(prop, context);
      }
      this.animateState(prop, context);
    }
  }

  private followActor(prop: LifeProp, actor: Actor, dt: number): void {
    prop.visible = actor.visible && actor.vehicleId < 0;
    let local = actor.pose.rightHand;
    if (prop.attachment === "left-hand") local = actor.pose.leftHand;
    const scale = actor.appearance.height / 1.76;
    let x = local.x * scale + prop.localOffset.x;
    let y = local.y * scale + prop.localOffset.y;
    let z = local.z * scale + prop.localOffset.z;
    if (prop.attachment === "back") {
      x = 0;
      y = 1.22 * scale;
      z = -0.22;
    } else if (prop.attachment === "hip") {
      x = 0.29;
      y = 0.88 * scale;
      z = -0.05;
    } else if (prop.attachment === "front") {
      x = 0;
      y = 0.8 * scale;
      z = 0.8;
    }
    localPoint(actor.position, actor.heading, x, z, this.attachmentPoint);
    prop.position.x = this.attachmentPoint.x;
    prop.position.y = actor.groundY + y;
    prop.position.z = this.attachmentPoint.z;
    prop.rotation.y = actor.heading;
    const sway = Math.sin(actor.gaitPhase) * Math.min(0.12, actor.speed * 0.07);
    if (prop.kind === "bag" || prop.kind === "briefcase" || prop.kind === "grocery") {
      prop.rotation.z = damping(prop.rotation.z, sway, 7, dt);
      prop.position.y -= 0.12;
    }
    if (prop.kind === "umbrella") {
      prop.position.y += 0.48;
      prop.progress = actor.umbrellaOpen;
      prop.rotation.z = clamp(contextFreeWind(actor.id, prop.phase) * 0.035, -0.09, 0.09);
    }
    if (prop.kind === "cane") prop.position.y = actor.groundY + 0.48;
    if (prop.kind === "cart" || prop.kind === "stroller" || prop.kind === "cleaning-cart") {
      prop.position.y = actor.groundY;
      prop.phase += actor.speed * dt * 3;
    }
  }

  private integrate(prop: LifeProp, context: LifeContext): void {
    const dt = context.time.dt;
    const drag = prop.kind === "leaves" ? 0.6 : 0.06;
    prop.velocity.x += (context.weather.windX * drag - prop.velocity.x * drag) * dt;
    prop.velocity.z += (context.weather.windZ * drag - prop.velocity.z * drag) * dt;
    prop.velocity.y -= 9.80665 * dt;
    prop.position.x += prop.velocity.x * dt;
    prop.position.y += prop.velocity.y * dt;
    prop.position.z += prop.velocity.z * dt;
    const radius = prop.kind === "ball" ? 0.12 : prop.kind === "parcel" ? 0.12 : 0.035;
    const floor = prop.groundY + radius;
    if (prop.position.y < floor) {
      prop.position.y = floor;
      prop.velocity.y = Math.abs(prop.velocity.y) * prop.restitution;
      const friction = Math.max(0, 1 - prop.friction * dt * 8);
      prop.velocity.x *= friction;
      prop.velocity.z *= friction;
      if (Math.abs(prop.velocity.y) < 0.12 && Math.hypot(prop.velocity.x, prop.velocity.z) < 0.08) {
        prop.sleeping = true;
        prop.velocity.x = 0;
        prop.velocity.y = 0;
        prop.velocity.z = 0;
      }
    }
    if (prop.kind === "ball") {
      prop.rotation.x += prop.velocity.z * dt / 0.12;
      prop.rotation.z -= prop.velocity.x * dt / 0.12;
    } else {
      prop.rotation.x += prop.velocity.z * dt * 0.12;
      prop.rotation.z -= prop.velocity.x * dt * 0.12;
    }
  }

  private animateState(prop: LifeProp, context: LifeContext): void {
    if (prop.kind === "warning-lamp") prop.progress = Math.sin(context.time.seconds * 7 + prop.id) > 0 ? 1 : 0.15;
    if (prop.kind === "watering-stream") {
      prop.progress = positiveModulo(context.time.seconds * 1.7 + prop.id * 0.13, 1);
      prop.opacity = prop.state === "pouring" ? 0.6 : 0;
    }
    if (prop.kind === "leaf-pile") prop.rotation.y += context.weather.gust * context.time.dt * 0.015;
    if (prop.kind === "phone" && prop.state === "ringing") {
      prop.rotation.z = Math.sin(context.time.seconds * 35) * 0.025;
    }
  }

  reset(): void {
    this.all.length = 0;
    this.byId.clear();
    this.ownerProps.clear();
    this.nextId = 1;
  }
}

function contextFreeWind(id: number, seconds: number): number {
  return Math.sin(seconds * 0.6 + id) + Math.sin(seconds * 1.7 + id * 0.7) * 0.35;
}
