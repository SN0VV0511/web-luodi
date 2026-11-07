import { clamp, distance, localPoint, point, point3 } from "./math";
import { addItem, arrived, changePhase, consumeItem, facePoint, failTask, finishSatisfied, goTo, item, pay, phaseFinished, phaseProgress, releaseReservation, requestAlternative, reserve, setGesture, stopWalking, useReservation } from "./actions";
import type { Actor, LifeContext, LifeSystem } from "./types";
import type { LifePlace } from "./places";

interface FoodOrder {
  id: number;
  actorId: number;
  placeId: string;
  kind: "meal" | "coffee";
  state: "ordered" | "preparing" | "ready" | "collected" | "cancelled";
  orderedAt: number;
  prepareAt: number;
  readyAt: number;
  price: number;
  paid: boolean;
  takeaway: boolean;
  trayProp: number;
  eventId: number;
}

interface RestaurantState {
  placeId: string;
  orders: number[];
  preparing: number[];
  queueId: string;
  nextCounterClean: number;
  tablesDirty: Map<string, number>;
  served: number;
  waste: number;
}

export class FoodAndCoffee implements LifeSystem {
  private nextOrder = 1;
  private readonly orders = new Map<number, FoodOrder>();
  private readonly actorOrders = new Map<number, number>();
  private readonly restaurants = new Map<string, RestaurantState>();
  private readonly waitingPoint = point();

  reset(context: LifeContext): void {
    this.orders.clear();
    this.actorOrders.clear();
    this.restaurants.clear();
    this.nextOrder = 1;
    for (const place of [...context.places.ofKind("restaurant"), ...context.places.ofKind("cafe")]) {
      const front = place.slots.find((slot) => slot.kind === "queue")?.position ?? place.entrance;
      const queueId = `food-${place.id}`;
      context.queues.ensure(queueId, place.id, front, place.heading, 3.8, 6);
      this.restaurants.set(place.id, {
        placeId: place.id,
        orders: [],
        preparing: [],
        queueId,
        nextCounterClean: 24,
        tablesDirty: new Map(),
        served: 0,
        waste: 0,
      });
      if (!place.stock.has("meal")) place.stock.set("meal", place.kind === "restaurant" ? 24 : 10);
      if (!place.stock.has("coffee")) place.stock.set("coffee", 24);
      const table = place.slots.find((slot) => slot.kind === "table");
      if (table) context.props.create("table", table.position, 0, { y: place.groundY, heading: table.heading, serviceId: -100 - this.restaurants.size });
      for (const seat of place.slots.filter((slot) => slot.kind === "seat")) {
        context.props.create("chair", seat.position, 0, { y: place.groundY, heading: seat.heading, serviceId: -100 - this.restaurants.size });
      }
    }
  }

  tick(context: LifeContext): void {
    this.updateKitchens(context);
    for (const actor of context.actors) {
      if (actor.task?.option === "public-water") continue;
      if (actor.task?.kind === "meal" || actor.task?.kind === "coffee") this.customer(actor, context);
    }
  }

  private customer(actor: Actor, context: LifeContext): void {
    const task = actor.task!;
    const place = context.places.get(task.venueId);
    const restaurant = this.restaurants.get(task.venueId);
    if (!place || !restaurant) {
      if (!requestAlternative(actor, ["restaurant", "cafe"], task.kind, context)) failTask(actor, context, "food-venue-missing");
      return;
    }
    if (task.phase !== "eating" && task.phase !== "clear-table" && !context.places.isOpen(place, context.time)) {
      if (!requestAlternative(actor, ["restaurant", "cafe"], task.kind, context)) failTask(actor, context, "food-venue-closed");
      return;
    }
    switch (task.phase) {
      case "start": this.approach(actor, place, context); break;
      case "approach": this.joinQueue(actor, place, restaurant, context); break;
      case "queue": this.waitForCounter(actor, place, restaurant, context); break;
      case "prepare": this.waitForFood(actor, place, context); break;
      case "collect": this.collect(actor, place, context); break;
      case "find-seat": this.findSeat(actor, place, context); break;
      case "sit-down": this.sitDown(actor, context); break;
      case "eating": this.eat(actor, place, context); break;
      case "clear-table": this.clearTable(actor, place, restaurant, context); break;
      case "takeaway": this.leaveWithTakeaway(actor, context); break;
    }
  }

  private approach(actor: Actor, place: LifePlace, context: LifeContext): void {
    const task = actor.task!;
    task.target.x = place.entrance.x;
    task.target.z = place.entrance.z;
    goTo(actor, task.target, context, 2);
    changePhase(task, "approach", context);
  }

  private joinQueue(actor: Actor, place: LifePlace, restaurant: RestaurantState, context: LifeContext): void {
    const task = actor.task!;
    if (actor.navigation.failed) {
      failTask(actor, context, "food-route-unavailable");
      return;
    }
    if (!arrived(actor, place.entrance, 1)) return;
    const stock = place.stock.get(task.kind === "coffee" ? "coffee" : "meal") ?? 0;
    if (stock <= 0) {
      if (!requestAlternative(actor, ["restaurant", "cafe"], task.kind, context)) failTask(actor, context, "food-sold-out");
      return;
    }
    const estimatedWait = context.queues.estimateWait(restaurant.queueId);
    if (estimatedWait > 15 + actor.personality.patience * 30) {
      if (requestAlternative(actor, ["restaurant", "cafe"], task.kind, context)) return;
    }
    const entry = context.queues.join(restaurant.queueId, actor, context.time.seconds, actor.age === "elder" ? 1 : 0);
    if (!entry) {
      task.attempts++;
      if (task.attempts > 8) failTask(actor, context, "food-queue-full");
      return;
    }
    task.queueId = restaurant.queueId;
    changePhase(task, "queue", context);
    goTo(actor, entry.target, context, 2);
    task.serviceId = context.events.publish(`food-${actor.id}`, "food",
      { zh: task.kind === "coffee" ? "街角咖啡，排队点单" : "午餐时分，排队点餐", en: task.kind === "coffee" ? "Ordering a coffee" : "Joining the lunch queue" },
      { zh: "顾客依次排队，前一人完成付款后再向柜台移动。", en: "Customers advance only after the person ahead finishes ordering." },
      place.entrance, context.time.seconds, 90, [actor.id]);
  }

  private waitForCounter(actor: Actor, place: LifePlace, restaurant: RestaurantState, context: LifeContext): void {
    const task = actor.task!;
    if (context.queues.takeAbandoned(actor.id)) {
      failTask(actor, context, "food-wait-abandoned");
      return;
    }
    if (context.queues.isActive(actor.id)) {
      setGesture(actor, "pay", context.time.seconds, 0.75);
      actor.mode = "shopping";
    } else if (actor.mode === "queuing") {
      setGesture(actor, actor.id % 3 === 0 ? "phone" : "neutral", context.time.seconds, 0.35);
    }
    context.events.update(task.serviceId, actor.position, 0.15, context.time.seconds, "ordering");
    if (!context.queues.takeCompleted(actor.id)) return;
    const kind = task.kind === "coffee" ? "coffee" : "meal";
    const price = kind === "coffee" ? 8 : 18;
    if (!pay(actor, price)) {
      failTask(actor, context, "food-budget-low");
      return;
    }
    const stock = place.stock.get(kind) ?? 0;
    if (stock <= 0) {
      actor.budget += price;
      actor.dailySpending -= price;
      failTask(actor, context, "food-unavailable-after-order");
      return;
    }
    place.stock.set(kind, stock - 1);
    const order: FoodOrder = {
      id: this.nextOrder++,
      actorId: actor.id,
      placeId: place.id,
      kind,
      state: "ordered",
      orderedAt: context.time.seconds,
      prepareAt: 0,
      readyAt: Infinity,
      price,
      paid: true,
      takeaway: actor.needs.urgency > 0.5 || actor.random.probability(kind === "coffee" ? 0.45 : 0.3),
      trayProp: -1,
      eventId: task.serviceId,
    };
    this.orders.set(order.id, order);
    this.actorOrders.set(actor.id, order.id);
    restaurant.orders.push(order.id);
    localPoint(place.entrance, place.heading, 1.3 + actor.id % 2 * 0.6, -0.8, this.waitingPoint);
    goTo(actor, this.waitingPoint, context, 1);
    changePhase(task, "prepare", context);
    context.events.describe(task.serviceId,
      { zh: kind === "coffee" ? "咖啡师制作饮品，顾客在取餐侧等候。" : "厨房按订单顺序备餐，顾客移至取餐处。", en: "The order is prepared while the customer waits clear of the ordering queue." });
  }

  private waitForFood(actor: Actor, place: LifePlace, context: LifeContext): void {
    const order = this.orderFor(actor.id);
    if (!order) {
      failTask(actor, context, "food-order-missing");
      return;
    }
    if (actor.navigation.arrived) {
      stopWalking(actor);
      setGesture(actor, "phone", context.time.seconds, 0.4);
    }
    const progress = order.state === "preparing"
      ? clamp((context.time.seconds - order.prepareAt) / (order.readyAt - order.prepareAt), 0, 1) : 0;
    context.events.update(order.eventId, actor.position, 0.25 + progress * 0.2, context.time.seconds, "preparing");
    if (order.state === "ready") {
      const counter = place.slots.find((slot) => slot.kind === "counter")?.position ?? place.entrance;
      goTo(actor, counter, context, 2);
      changePhase(actor.task!, "collect", context);
    }
  }

  private collect(actor: Actor, place: LifePlace, context: LifeContext): void {
    const order = this.orderFor(actor.id);
    if (!order) {
      failTask(actor, context, "food-order-lost");
      return;
    }
    const counter = place.slots.find((slot) => slot.kind === "counter")?.position ?? place.entrance;
    if (!arrived(actor, counter, 0.7)) return;
    stopWalking(actor);
    setGesture(actor, "carry", context.time.seconds, 0.7);
    const carried = addItem(actor, order.kind === "coffee" ? "cup" : "meal", context, 1, "right-hand", order.kind === "coffee" ? "#d3c8af" : "#bba47e");
    if (!carried) {
      failTask(actor, context, "food-hands-full");
      return;
    }
    order.state = "collected";
    if (order.trayProp >= 0) context.props.remove(order.trayProp);
    context.stats.mealsServed++;
    context.events.describe(order.eventId,
      { zh: order.takeaway ? "拿到外带纸袋，离开柜台后沿街步行。" : "端着餐盘寻找空座，坐下后用餐。", en: order.takeaway ? "Collecting a takeaway bag and clearing the counter." : "Taking the order to an available seat." });
    if (order.takeaway) {
      localPoint(place.entrance, place.heading, 3.5, -2.1, this.waitingPoint);
      goTo(actor, this.waitingPoint, context, 1);
      changePhase(actor.task!, "takeaway", context, 12);
    } else changePhase(actor.task!, "find-seat", context, 8);
  }

  private findSeat(actor: Actor, place: LifePlace, context: LifeContext): void {
    const task = actor.task!;
    const seat = reserve(actor, place, "seat", context, 65);
    if (seat) {
      goTo(actor, seat.position, context, 1);
      changePhase(task, "sit-down", context);
      return;
    }
    if (!phaseFinished(task, context)) {
      setGesture(actor, "carry", context.time.seconds, 0.65);
      return;
    }
    const order = this.orderFor(actor.id);
    if (order) order.takeaway = true;
    localPoint(place.entrance, place.heading, 3.5, -2.1, this.waitingPoint);
    goTo(actor, this.waitingPoint, context, 1);
    changePhase(task, "takeaway", context, 10);
  }

  private sitDown(actor: Actor, context: LifeContext): void {
    const task = actor.task!;
    const seat = context.reservations.get(task.reservationId);
    if (!seat) {
      changePhase(task, "find-seat", context, 5);
      return;
    }
    if (!useReservation(actor, seat, context, "seated")) return;
    setGesture(actor, "sit", context.time.seconds, 1);
    const duration = task.kind === "coffee" ? 10 + actor.personality.patience * 8 : 16 + actor.personality.patience * 14;
    changePhase(task, "eating", context, duration);
  }

  private eat(actor: Actor, place: LifePlace, context: LifeContext): void {
    const task = actor.task!;
    const progress = phaseProgress(task, context);
    actor.mode = "eating";
    setGesture(actor, task.kind === "coffee" ? "sip" : "eat", context.time.seconds, 0.8);
    actor.needs.hunger = Math.max(task.kind === "coffee" ? 0.2 : 0.08, actor.needs.hunger - context.time.dt * (task.kind === "coffee" ? 0.003 : 0.028));
    actor.needs.thirst = Math.max(0.05, actor.needs.thirst - context.time.dt * 0.022);
    actor.needs.energy = Math.min(1, actor.needs.energy + context.time.dt * 0.004);
    context.events.update(task.serviceId, actor.position, 0.55 + progress * 0.35, context.time.seconds, "eating");
    if (!phaseFinished(task, context)) return;
    const order = this.orderFor(actor.id);
    const restaurant = this.restaurants.get(place.id);
    if (restaurant && task.reservationId >= 0) {
      const seat = context.reservations.get(task.reservationId);
      if (seat) restaurant.tablesDirty.set(seat.slotId, context.time.seconds);
    }
    if (order) consumeItem(actor, order.kind === "coffee" ? "cup" : "meal", context);
    releaseReservation(actor, context);
    const bin = place.slots.find((slot) => slot.kind === "bin");
    if (bin) {
      goTo(actor, bin.position, context, 1);
      changePhase(task, "clear-table", context);
    } else this.finishCustomer(actor, context);
  }

  private clearTable(actor: Actor, place: LifePlace, restaurant: RestaurantState, context: LifeContext): void {
    const bin = place.slots.find((slot) => slot.kind === "bin");
    if (bin && !arrived(actor, bin.position, 0.6) && !actor.navigation.failed) return;
    setGesture(actor, "lift", context.time.seconds, 0.4);
    restaurant.waste += 0.03;
    place.cleanliness = Math.max(0.3, place.cleanliness - 0.008);
    this.finishCustomer(actor, context);
  }

  private leaveWithTakeaway(actor: Actor, context: LifeContext): void {
    const task = actor.task!;
    context.events.update(task.serviceId, actor.position, 0.85, context.time.seconds, "takeaway");
    if (arrived(actor) || phaseFinished(task, context)) {
      actor.needs.hunger = Math.max(0.08, actor.needs.hunger - 0.3);
      actor.needs.thirst = Math.max(0.05, actor.needs.thirst - 0.25);
      this.finishCustomer(actor, context);
    }
  }

  private finishCustomer(actor: Actor, context: LifeContext): void {
    const order = this.orderFor(actor.id);
    if (order) {
      context.events.finish(order.eventId, context.time.seconds);
      const restaurant = this.restaurants.get(order.placeId);
      if (restaurant) restaurant.served++;
      this.orders.delete(order.id);
      this.actorOrders.delete(actor.id);
    }
    finishSatisfied(actor, context, "meal-served", 0.45);
  }

  private updateKitchens(context: LifeContext): void {
    for (const restaurant of this.restaurants.values()) {
      const place = context.places.get(restaurant.placeId)!;
      const queue = context.queues.queues.get(restaurant.queueId);
      if (queue) queue.serviceDuration = 4.5 / Math.max(0.5, place.serviceRate);
      restaurant.preparing = restaurant.preparing.filter((id) => this.orders.get(id)?.state === "preparing");
      const capacity = place.kind === "restaurant" ? 2 : 1;
      for (const id of restaurant.orders) {
        const order = this.orders.get(id);
        if (!order) continue;
        if (order.state === "ordered" && restaurant.preparing.length < capacity) {
          order.state = "preparing";
          order.prepareAt = context.time.seconds;
          order.readyAt = context.time.seconds + (order.kind === "coffee" ? 5 : 8) / Math.max(0.6, place.serviceRate);
          restaurant.preparing.push(id);
        }
        if (order.state === "preparing" && order.readyAt <= context.time.seconds) {
          order.state = "ready";
          const counter = place.slots.find((slot) => slot.kind === "counter")?.position ?? place.entrance;
          const tray = context.props.create(order.kind === "coffee" ? "cup" : "tray", counter, context.time.seconds,
            { y: place.groundY + 0.96, duration: 30, serviceId: order.id, color: "#c4b799" });
          order.trayProp = tray?.id ?? -1;
        }
        if (order.state === "ready" && context.time.seconds - order.readyAt > 45) {
          order.state = "cancelled";
          restaurant.waste += 0.1;
          if (order.trayProp >= 0) context.props.remove(order.trayProp);
        }
      }
      restaurant.orders = restaurant.orders.filter((id) => {
        const state = this.orders.get(id)?.state;
        return state && state !== "cancelled" && state !== "collected";
      });
      if (restaurant.nextCounterClean <= context.time.seconds) {
        restaurant.nextCounterClean = context.time.seconds + 22;
        for (const [slot, time] of restaurant.tablesDirty) {
          if (context.time.seconds - time > 12) restaurant.tablesDirty.delete(slot);
        }
        place.cleanliness = Math.min(1, place.cleanliness + 0.02 * place.serviceRate);
      }
    }
  }

  private orderFor(actorId: number): FoodOrder | undefined {
    const id = this.actorOrders.get(actorId);
    return id === undefined ? undefined : this.orders.get(id);
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const order = this.orderFor(actor.id);
    if (!order) return;
    if (order.paid && order.state === "ordered") {
      actor.budget += order.price;
      actor.dailySpending = Math.max(0, actor.dailySpending - order.price);
      const place = context.places.get(order.placeId);
      if (place) place.stock.set(order.kind, (place.stock.get(order.kind) ?? 0) + 1);
    }
    if (order.trayProp >= 0) context.props.remove(order.trayProp);
    context.events.finish(order.eventId, context.time.seconds);
    this.orders.delete(order.id);
    this.actorOrders.delete(actor.id);
    context.queues.leave(actor.id);
  }
}
