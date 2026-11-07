import { clamp, damping, distance, point3, type Point3 } from "./math";
import { item, setGesture, worldHand } from "./actions";
import type { Actor, InventoryItem, ItemKind, LifeContext } from "./types";
import type { LifeProp, PropAttachment } from "./props-state";

interface CarryDynamics {
  propId: number;
  ownerId: number;
  anchor: Point3;
  previousAnchor: Point3;
  velocity: Point3;
  pendulumX: number;
  pendulumZ: number;
  pendulumVelocityX: number;
  pendulumVelocityZ: number;
  lastOwnerSpeed: number;
  lastHeading: number;
  graspStrength: number;
  gripWear: number;
  liquid: number;
  temperature: number;
  wheelAngle: number;
  lastGroundContact: number;
  settled: boolean;
}

interface HandAllocation {
  actorId: number;
  left: number;
  right: number;
  both: number;
  lastChanged: number;
  lastGesture: string;
  protectedUntil: number;
}

export class ResidentPossessions {
  private readonly dynamics = new Map<number, CarryDynamics>();
  private readonly allocations = new Map<number, HandAllocation>();
  private readonly point = point3();
  private readonly other = point3();
  private nextAudit = 0;

  reset(): void {
    this.dynamics.clear();
    this.allocations.clear();
    this.nextAudit = 0;
  }

  prepare(context: LifeContext): void {
    for (const actor of context.actors) {
      if (!actor.visible || actor.vehicleId >= 0) continue;
      this.allocateHands(actor, context);
      this.chooseCarryGesture(actor, context);
      this.recoverGrip(actor, context);
    }
    if (context.time.seconds >= this.nextAudit) {
      this.nextAudit = context.time.seconds + 3;
      this.audit(context);
    }
  }

  settle(context: LifeContext): void {
    for (const prop of context.props.all) {
      if (!prop.visible || prop.ownerId < 0 || prop.attachment === "world") continue;
      const actor = context.actorById.get(prop.ownerId);
      if (!actor) continue;
      const dynamics = this.state(prop, actor, context);
      this.updateAnchor(prop, actor, dynamics);
      this.swing(prop, actor, dynamics, context);
      this.orientation(prop, actor, dynamics, context);
      this.liquid(prop, actor, dynamics, context);
      this.wheeled(prop, actor, dynamics, context);
      this.umbrella(prop, actor, dynamics, context);
      this.containGround(prop, actor, dynamics, context);
    }
  }

  private allocation(actor: Actor): HandAllocation {
    let allocation = this.allocations.get(actor.id);
    if (allocation) return allocation;
    allocation = {
      actorId: actor.id,
      left: -1,
      right: -1,
      both: -1,
      lastChanged: 0,
      lastGesture: "neutral",
      protectedUntil: 0,
    };
    this.allocations.set(actor.id, allocation);
    return allocation;
  }

  private allocateHands(actor: Actor, context: LifeContext): void {
    const allocation = this.allocation(actor);
    const held = actor.inventory.filter((entry) => entry.quantity > 0 && context.props.get(entry.propId));
    const gestureChanged = allocation.lastGesture !== actor.gesture.kind;
    const leftStillOwned = held.some((entry) => entry.propId === allocation.left);
    const rightStillOwned = held.some((entry) => entry.propId === allocation.right);
    if (!gestureChanged && leftStillOwned && rightStillOwned && context.time.seconds < allocation.protectedUntil) return;
    const ranked = held.map((entry) => ({ entry, priority: this.priority(entry, actor) })).sort((a, b) => b.priority - a.priority || a.entry.id - b.entry.id);
    allocation.left = -1;
    allocation.right = -1;
    allocation.both = -1;
    const umbrella = context.props.owned(actor.id, "umbrella");
    if (umbrella && actor.umbrellaOpen > 0.35) allocation.left = umbrella.id;
    const cane = context.props.owned(actor.id, "cane");
    if (cane && actor.mobility === "cane") allocation.right = cane.id;
    for (const { entry } of ranked) {
      const prop = context.props.get(entry.propId)!;
      if (entry.kind === "umbrella" || entry.kind === "cane") continue;
      if (entry.kind === "guitar") {
        context.props.attach(prop.id, actor.id, "front");
        allocation.both = prop.id;
        continue;
      }
      if (entry.kind === "parcel" && actor.task?.kind === "delivery" && actor.task.phase !== "travel") {
        context.props.attach(prop.id, actor.id, "front");
        allocation.both = prop.id;
        continue;
      }
      const preferred = this.preferredHand(entry.kind, actor);
      let attachment: PropAttachment;
      if (preferred === "left-hand" && allocation.left < 0) {
        allocation.left = prop.id;
        attachment = "left-hand";
      } else if (allocation.right < 0) {
        allocation.right = prop.id;
        attachment = "right-hand";
      } else if (allocation.left < 0) {
        allocation.left = prop.id;
        attachment = "left-hand";
      } else attachment = entry.kind === "bag" || entry.kind === "grocery" ? "back" : "hip";
      if (allocation.both >= 0 && allocation.both !== prop.id) attachment = "back";
      if (prop.attachment !== attachment) context.props.attach(prop.id, actor.id, attachment);
      if (attachment === "hip") {
        prop.localOffset.x = 0.04 * (entry.id % 3);
        prop.localOffset.z = -0.05;
        prop.scale.x = Math.min(prop.scale.x, 0.7);
        prop.scale.y = Math.min(prop.scale.y, 0.7);
        prop.scale.z = Math.min(prop.scale.z, 0.7);
      } else {
        prop.scale.x = 1;
        prop.scale.y = 1;
        prop.scale.z = 1;
      }
    }
    allocation.lastChanged = context.time.seconds;
    allocation.lastGesture = actor.gesture.kind;
    allocation.protectedUntil = context.time.seconds + 0.75;
  }

  private priority(entry: InventoryItem, actor: Actor): number {
    if (entry.kind === "camera" && actor.gesture.kind === "photo") return 10;
    if (entry.kind === "phone" && ["phone", "type", "pay"].includes(actor.gesture.kind)) return 10;
    if (entry.kind === "book" && actor.gesture.kind === "read") return 10;
    if (entry.kind === "cup" && actor.gesture.kind === "sip") return 10;
    if (entry.kind === "meal" && actor.gesture.kind === "eat") return 9;
    if (entry.kind === "parcel" && actor.task?.kind === "delivery") return 8;
    if (entry.kind === "broom" || entry.kind === "watering-can" || entry.kind === "toolbox") return 8;
    if (entry.kind === "guitar") return 8;
    if (entry.kind === "grocery") return 5;
    if (entry.kind === "flowers") return 4.5;
    if (entry.kind === "briefcase") return 4;
    if (entry.kind === "bag") return 3;
    if (entry.kind === "phone") return 0.5;
    return 2;
  }

  private preferredHand(kind: ItemKind, actor: Actor): PropAttachment {
    if (kind === "book" || kind === "meal" || kind === "toolbox" || kind === "briefcase") return "left-hand";
    if (kind === "cup" && actor.gesture.hand === "left") return "left-hand";
    return "right-hand";
  }

  private chooseCarryGesture(actor: Actor, context: LifeContext): void {
    if (!["neutral", "carry", "cane", "umbrella"].includes(actor.gesture.kind)) return;
    const allocation = this.allocation(actor);
    if (actor.umbrellaOpen > 0.5) {
      setGesture(actor, "umbrella", context.time.seconds, 0.8);
      actor.gesture.hand = "left";
      return;
    }
    if (actor.mobility === "cane") {
      setGesture(actor, "cane", context.time.seconds, 0.8);
      actor.gesture.hand = "right";
      return;
    }
    if (allocation.left >= 0 || allocation.right >= 0 || allocation.both >= 0) {
      setGesture(actor, "carry", context.time.seconds, 0.6);
      actor.gesture.hand = allocation.right >= 0 ? "right" : "left";
    }
  }

  private recoverGrip(actor: Actor, context: LifeContext): void {
    const allocation = this.allocation(actor);
    for (const id of [allocation.left, allocation.right, allocation.both]) {
      const dynamics = this.dynamics.get(id);
      if (!dynamics) continue;
      const working = actor.mode === "working" || actor.mode === "walking";
      const demand = actor.inventory.find((entry) => entry.propId === id)?.weight ?? 0.3;
      dynamics.gripWear = clamp(dynamics.gripWear + context.time.dt * (working ? demand * 0.0005 : -0.001), 0, 1);
      dynamics.graspStrength = clamp(0.95 - dynamics.gripWear * 0.2 + actor.needs.energy * 0.05, 0.6, 1);
      if (dynamics.gripWear > 0.7 && actor.mode === "waiting") {
        dynamics.gripWear *= 0.98;
        dynamics.pendulumVelocityX *= 0.85;
        dynamics.pendulumVelocityZ *= 0.85;
      }
    }
  }

  private state(prop: LifeProp, actor: Actor, context: LifeContext): CarryDynamics {
    let dynamics = this.dynamics.get(prop.id);
    if (dynamics) return dynamics;
    dynamics = {
      propId: prop.id,
      ownerId: actor.id,
      anchor: { ...prop.position },
      previousAnchor: { ...prop.position },
      velocity: point3(),
      pendulumX: 0,
      pendulumZ: 0,
      pendulumVelocityX: 0,
      pendulumVelocityZ: 0,
      lastOwnerSpeed: actor.speed,
      lastHeading: actor.heading,
      graspStrength: 1,
      gripWear: 0,
      liquid: prop.kind === "cup" ? 0.9 : 0,
      temperature: prop.kind === "cup" ? 65 : context.weather.temperature,
      wheelAngle: 0,
      lastGroundContact: context.time.seconds,
      settled: true,
    };
    this.dynamics.set(prop.id, dynamics);
    return dynamics;
  }

  private updateAnchor(prop: LifeProp, actor: Actor, dynamics: CarryDynamics): void {
    dynamics.previousAnchor.x = dynamics.anchor.x;
    dynamics.previousAnchor.y = dynamics.anchor.y;
    dynamics.previousAnchor.z = dynamics.anchor.z;
    if (prop.attachment === "left-hand" || prop.attachment === "right-hand") {
      const hand = worldHand(actor, prop.attachment === "left-hand");
      dynamics.anchor.x = hand.x;
      dynamics.anchor.y = hand.y;
      dynamics.anchor.z = hand.z;
    } else {
      dynamics.anchor.x = prop.position.x;
      dynamics.anchor.y = prop.position.y;
      dynamics.anchor.z = prop.position.z;
    }
    if (dynamics.ownerId !== actor.id) {
      dynamics.ownerId = actor.id;
      dynamics.velocity.x = 0;
      dynamics.velocity.y = 0;
      dynamics.velocity.z = 0;
      dynamics.pendulumX = 0;
      dynamics.pendulumZ = 0;
    }
  }

  private swing(prop: LifeProp, actor: Actor, dynamics: CarryDynamics, context: LifeContext): void {
    const hanging = prop.kind === "bag" || prop.kind === "briefcase" || prop.kind === "grocery" || prop.kind === "basket";
    if (!hanging || prop.attachment === "back" || prop.attachment === "hip") return;
    const dt = context.time.dt;
    const vx = (dynamics.anchor.x - dynamics.previousAnchor.x) / dt;
    const vz = (dynamics.anchor.z - dynamics.previousAnchor.z) / dt;
    const ax = clamp((vx - dynamics.velocity.x) / dt, -6, 6);
    const az = clamp((vz - dynamics.velocity.z) / dt, -6, 6);
    dynamics.velocity.x = damping(dynamics.velocity.x, vx, 12, dt);
    dynamics.velocity.z = damping(dynamics.velocity.z, vz, 12, dt);
    const localX = ax * Math.cos(actor.heading) - az * Math.sin(actor.heading);
    const localZ = az * Math.cos(actor.heading) + ax * Math.sin(actor.heading);
    const length = prop.kind === "briefcase" ? 0.2 : 0.28;
    const stiffness = 9.80665 / length;
    const dampingRate = prop.kind === "grocery" ? 7 : 5;
    dynamics.pendulumVelocityX += (-localX / length - stiffness * dynamics.pendulumX - dampingRate * dynamics.pendulumVelocityX) * dt;
    dynamics.pendulumVelocityZ += (-localZ / length - stiffness * dynamics.pendulumZ - dampingRate * dynamics.pendulumVelocityZ) * dt;
    dynamics.pendulumX = clamp(dynamics.pendulumX + dynamics.pendulumVelocityX * dt, -0.24, 0.24);
    dynamics.pendulumZ = clamp(dynamics.pendulumZ + dynamics.pendulumVelocityZ * dt, -0.3, 0.3);
    prop.rotation.x = dynamics.pendulumZ;
    prop.rotation.z = -dynamics.pendulumX;
    prop.position.x += Math.sin(dynamics.pendulumX) * length * Math.cos(actor.heading);
    prop.position.z -= Math.sin(dynamics.pendulumX) * length * Math.sin(actor.heading);
    dynamics.settled = Math.abs(dynamics.pendulumVelocityX) + Math.abs(dynamics.pendulumVelocityZ) < 0.02;
  }

  private orientation(prop: LifeProp, actor: Actor, dynamics: CarryDynamics, context: LifeContext): void {
    const kind = actor.gesture.kind;
    if (prop.kind === "phone") {
      prop.rotation.x = kind === "phone" ? 0 : kind === "type" ? -0.65 : 0.15;
      prop.rotation.y = actor.heading + (kind === "phone" ? Math.PI / 2 : 0);
      prop.state = kind === "phone" ? "calling" : kind === "type" ? "active" : "idle";
    }
    if (prop.kind === "book") {
      prop.rotation.x = kind === "read" ? 0.3 : 1.1;
      prop.state = kind === "read" ? "reading" : "closed";
      if (kind === "read") prop.progress = 0.5;
    }
    if (prop.kind === "camera") {
      prop.rotation.y = actor.heading + actor.pose.headYaw * 0.4;
      prop.rotation.x = kind === "photo" ? actor.pose.headPitch * 0.4 : -0.15;
    }
    if (prop.kind === "guitar") {
      prop.position.x = actor.position.x + Math.sin(actor.heading) * 0.24;
      prop.position.y = actor.groundY + actor.pose.chest.y * actor.appearance.height / 1.76 - 0.3;
      prop.position.z = actor.position.z + Math.cos(actor.heading) * 0.24;
      prop.rotation.z = -0.65;
    }
    if (prop.kind === "parcel" && prop.attachment === "front") {
      const left = worldHand(actor, true);
      const right = worldHand(actor, false);
      prop.position.x = (left.x + right.x) * 0.5;
      prop.position.y = (left.y + right.y) * 0.5;
      prop.position.z = (left.z + right.z) * 0.5;
    }
    if (prop.kind === "watering-can") {
      prop.rotation.z = kind === "water" ? 0.35 : 0;
      prop.state = kind === "water" ? "pouring" : "carrying";
    }
    if (prop.kind === "watering-stream") {
      prop.state = kind === "water" ? "pouring" : "idle";
      prop.opacity = kind === "water" ? 0.6 : 0;
    }
    dynamics.lastHeading = actor.heading;
    dynamics.lastOwnerSpeed = actor.speed;
    if (prop.kind === "meal") prop.progress = clamp((context.time.seconds - prop.createdAt) / 80, 0, 1);
  }

  private liquid(prop: LifeProp, actor: Actor, dynamics: CarryDynamics, context: LifeContext): void {
    if (prop.kind !== "cup") return;
    const dt = context.time.dt;
    const sipping = actor.gesture.kind === "sip";
    const hand = prop.attachment === "left-hand" ? actor.pose.leftHand : actor.pose.rightHand;
    const nearMouth = hand.y > actor.pose.head.y - 0.18;
    prop.rotation.x = damping(prop.rotation.x, sipping && nearMouth ? -0.3 : 0, 8, dt);
    dynamics.temperature += (context.weather.temperature - dynamics.temperature) * dt * 0.006;
    if (sipping && nearMouth) {
      dynamics.liquid = Math.max(0, dynamics.liquid - dt * 0.018);
      actor.needs.thirst = clamp(actor.needs.thirst - dt * 0.012, 0, 1);
    }
    const acceleration = Math.hypot(actor.desiredVelocity.x - actor.velocity.x, actor.desiredVelocity.z - actor.velocity.z);
    const spill = acceleration > 2.5 && dynamics.liquid > 0.7 ? dt * 0.002 : 0;
    dynamics.liquid = Math.max(0, dynamics.liquid - spill);
    prop.progress = dynamics.liquid;
    if (dynamics.liquid < 0.05) prop.state = "empty";
    else prop.state = dynamics.temperature > 45 ? "hot" : "cool";
  }

  private wheeled(prop: LifeProp, actor: Actor, dynamics: CarryDynamics, context: LifeContext): void {
    if (!["cart", "cleaning-cart", "stroller", "wheelbarrow", "bicycle"].includes(prop.kind)) return;
    prop.position.y = actor.groundY;
    const distanceMoved = distance(dynamics.anchor, dynamics.previousAnchor);
    const radius = prop.kind === "bicycle" ? 0.32 : prop.kind === "wheelbarrow" ? 0.18 : 0.12;
    dynamics.wheelAngle += distanceMoved / radius;
    prop.phase = dynamics.wheelAngle;
    const handle = prop.kind === "stroller" ? 0.95 : prop.kind === "wheelbarrow" ? 0.78 : 0.98;
    const scale = actor.appearance.height / 1.76;
    if (actor.gesture.kind === "push") {
      actor.pose.leftHand.y = handle / scale;
      actor.pose.rightHand.y = handle / scale;
    }
    const bump = Math.sin((prop.position.x + prop.position.z) * 3.5) * Math.min(0.006, actor.speed * 0.003);
    prop.rotation.x = damping(prop.rotation.x, bump, 8, context.time.dt);
  }

  private umbrella(prop: LifeProp, actor: Actor, dynamics: CarryDynamics, context: LifeContext): void {
    if (prop.kind !== "umbrella") return;
    const hand = worldHand(actor, prop.attachment === "left-hand");
    prop.position.x = hand.x;
    prop.position.y = hand.y;
    prop.position.z = hand.z;
    const localWindX = context.weather.windX * Math.cos(actor.heading) - context.weather.windZ * Math.sin(actor.heading);
    const localWindZ = context.weather.windZ * Math.cos(actor.heading) + context.weather.windX * Math.sin(actor.heading);
    const bendX = clamp(localWindX * 0.012, -0.17, 0.17) * actor.umbrellaOpen;
    const bendZ = clamp(localWindZ * 0.012, -0.17, 0.17) * actor.umbrellaOpen;
    dynamics.pendulumVelocityX += ((bendX - dynamics.pendulumX) * 35 - dynamics.pendulumVelocityX * 8) * context.time.dt;
    dynamics.pendulumVelocityZ += ((bendZ - dynamics.pendulumZ) * 35 - dynamics.pendulumVelocityZ * 8) * context.time.dt;
    dynamics.pendulumX = clamp(dynamics.pendulumX + dynamics.pendulumVelocityX * context.time.dt, -0.22, 0.22);
    dynamics.pendulumZ = clamp(dynamics.pendulumZ + dynamics.pendulumVelocityZ * context.time.dt, -0.22, 0.22);
    prop.rotation.x = dynamics.pendulumZ;
    prop.rotation.z = -dynamics.pendulumX;
    prop.progress = actor.umbrellaOpen;
    prop.visible = actor.umbrellaOpen > 0.03;
  }

  private containGround(prop: LifeProp, actor: Actor, dynamics: CarryDynamics, context: LifeContext): void {
    let bottom = 0;
    if (prop.kind === "bag" || prop.kind === "grocery") bottom = 0.34;
    if (prop.kind === "briefcase") bottom = 0.26;
    if (prop.kind === "toolbox") bottom = 0.2;
    if (prop.kind === "cane") {
      prop.position.y = actor.groundY + 0.87;
      dynamics.lastGroundContact = context.time.seconds;
      return;
    }
    if (bottom > 0 && prop.position.y - bottom < actor.groundY + 0.03) {
      prop.position.y = actor.groundY + bottom + 0.03;
      dynamics.pendulumVelocityX *= 0.6;
      dynamics.pendulumVelocityZ *= 0.6;
      dynamics.lastGroundContact = context.time.seconds;
    }
  }

  private audit(context: LifeContext): void {
    const liveProps = new Set(context.props.all.map((prop) => prop.id));
    for (const id of this.dynamics.keys()) if (!liveProps.has(id)) this.dynamics.delete(id);
    for (const actor of context.actors) {
      const seen = new Set<number>();
      for (let index = actor.inventory.length - 1; index >= 0; index--) {
        const entry = actor.inventory[index];
        if (seen.has(entry.id) || entry.quantity <= 0) {
          actor.inventory.splice(index, 1);
          continue;
        }
        seen.add(entry.id);
        entry.owner = actor.id;
        const prop = context.props.get(entry.propId);
        if (prop) {
          if (prop.ownerId !== actor.id) context.props.transfer(prop.id, actor, "right-hand");
          continue;
        }
        const replacement = context.props.ensureOwned(actor, entry.kind, context.time.seconds, "hip");
        if (replacement) entry.propId = replacement.id;
      }
      const umbrella = item(actor, "umbrella");
      if (umbrella) {
        const prop = context.props.get(umbrella.propId);
        if (prop) prop.visible = actor.visible && actor.umbrellaOpen > 0.03;
      }
    }
  }
}
