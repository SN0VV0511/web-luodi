import { clamp, distance, localPoint, point } from "./math";
import { addItem, arrived, changePhase, failTask, finishSatisfied, goTo, pay, phaseFinished, phaseProgress, requestAlternative, setGesture, stopWalking } from "./actions";
import type { Actor, ItemKind, LifeContext, LifeSystem } from "./types";
import type { LifePlace } from "./places";

interface ShoppingVisit {
  actorId: number;
  placeId: string;
  desiredItem: ItemKind;
  stockKey: string;
  quantity: number;
  price: number;
  basketProp: number;
  itemProp: number;
  eventId: number;
  shelfIndex: number;
  inspected: number;
  decision: "browse" | "buy" | "leave";
  paid: boolean;
}

interface ShopDisplay {
  placeId: string;
  props: number[];
  queueId: string;
  shelfPoints: { x: number; z: number }[];
  lastStock: number;
  transactions: number;
  revenue: number;
  restockRequested: number;
}

export class NeighborhoodRetail implements LifeSystem {
  private readonly visits = new Map<number, ShoppingVisit>();
  private readonly displays = new Map<string, ShopDisplay>();
  private readonly displayPoint = point();

  reset(context: LifeContext): void {
    this.visits.clear();
    this.displays.clear();
    const shops = [...context.places.ofKind("grocery"), ...context.places.ofKind("bookshop"), ...context.places.ofKind("florist")];
    for (const place of shops) {
      const front = place.slots.find((slot) => slot.kind === "queue")?.position ?? place.entrance;
      const queueId = `retail-${place.id}`;
      context.queues.ensure(queueId, place.id, front, place.heading, 4, 5);
      const shelfPoints: { x: number; z: number }[] = [];
      const props: number[] = [];
      for (let shelf = 0; shelf < 3; shelf++) {
        localPoint(place.entrance, place.heading, -2.4 + shelf * 1.2, -0.9, this.displayPoint);
        shelfPoints.push({ ...this.displayPoint });
        const furniture = context.props.create(place.kind === "florist" ? "flowerpot" : "crate", this.displayPoint, 0,
          { y: place.groundY, color: place.kind === "bookshop" ? "#75614d" : "#99805b", serviceId: -200 - this.displays.size });
        if (furniture) props.push(furniture.id);
        const kind = place.kind === "florist" ? "flowers" : place.kind === "bookshop" ? "book" : "grocery";
        const goods = context.props.create(kind, this.displayPoint, 0,
          { y: place.groundY + 0.35, color: place.kind === "florist" ? "#ae8b75" : "#8c9270", serviceId: -200 - this.displays.size });
        if (goods) props.push(goods.id);
      }
      this.displays.set(place.id, {
        placeId: place.id,
        props,
        queueId,
        shelfPoints,
        lastStock: -1,
        transactions: 0,
        revenue: 0,
        restockRequested: -100,
      });
    }
  }

  tick(context: LifeContext): void {
    this.refreshDisplays(context);
    for (const actor of context.actors) {
      if (actor.task?.kind === "shopping") this.visit(actor, context);
    }
  }

  private visit(actor: Actor, context: LifeContext): void {
    const task = actor.task!;
    const place = context.places.get(task.venueId);
    const display = this.displays.get(task.venueId);
    if (!place || !display || !context.places.isOpen(place, context.time)) {
      if (!requestAlternative(actor, ["grocery", "bookshop", "florist"], "shopping", context)) failTask(actor, context, "shop-closed");
      return;
    }
    switch (task.phase) {
      case "start": this.begin(actor, place, display, context); break;
      case "approach": this.approachShelf(actor, place, display, context); break;
      case "browse": this.browse(actor, place, display, context); break;
      case "compare": this.compareGoods(actor, place, display, context); break;
      case "checkout": this.checkout(actor, place, display, context); break;
      case "queue": this.waitForCheckout(actor, place, display, context); break;
      case "bagging": this.bagGoods(actor, place, display, context); break;
      case "leaving": this.leaveShop(actor, place, context); break;
    }
  }

  private begin(actor: Actor, place: LifePlace, display: ShopDisplay, context: LifeContext): void {
    const desiredItem: ItemKind = place.kind === "florist" ? "flowers" : place.kind === "bookshop" ? "book" : "grocery";
    const price = desiredItem === "flowers" ? 12 : desiredItem === "book" ? 16 : 14;
    const quantity = desiredItem === "grocery" && actor.occupation === "parent" ? 2 : 1;
    const visit: ShoppingVisit = {
      actorId: actor.id,
      placeId: place.id,
      desiredItem,
      stockKey: desiredItem,
      quantity,
      price,
      basketProp: -1,
      itemProp: -1,
      eventId: -1,
      shelfIndex: actor.id % display.shelfPoints.length,
      inspected: 0,
      decision: "browse",
      paid: false,
    };
    this.visits.set(actor.id, visit);
    goTo(actor, display.shelfPoints[visit.shelfIndex], context, 1);
    changePhase(actor.task!, "approach", context);
  }

  private approachShelf(actor: Actor, place: LifePlace, display: ShopDisplay, context: LifeContext): void {
    const visit = this.visits.get(actor.id);
    if (!visit) {
      changePhase(actor.task!, "start", context);
      return;
    }
    if (actor.navigation.failed) {
      failTask(actor, context, "shop-route-blocked");
      return;
    }
    const shelf = display.shelfPoints[visit.shelfIndex];
    if (!arrived(actor, shelf, 0.65)) return;
    stopWalking(actor, "shopping");
    actor.targetHeading = place.heading;
    const basket = context.props.ensureOwned(actor, "basket", context.time.seconds, "left-hand", "#7b816f");
    visit.basketProp = basket?.id ?? -1;
    visit.eventId = context.events.publish(`shopping-${actor.id}`, "retail",
      { zh: place.kind === "florist" ? "挑一束花带回家" : place.kind === "bookshop" ? "在街角书店翻阅新书" : "街坊来采购日常食材", en: place.kind === "florist" ? "Choosing flowers for home" : place.kind === "bookshop" ? "Browsing the neighborhood bookshop" : "Shopping for daily groceries" },
      { zh: "顾客走到货架前查看商品，挑选后排队结账。", en: "The shopper examines items, makes a choice and joins the checkout queue." },
      actor.position, context.time.seconds, 65, [actor.id]);
    actor.task!.serviceId = visit.eventId;
    setGesture(actor, place.kind === "bookshop" ? "read" : "lift", context.time.seconds, 0.6);
    changePhase(actor.task!, "browse", context, 4 + actor.personality.curiosity * 8);
  }

  private browse(actor: Actor, place: LifePlace, display: ShopDisplay, context: LifeContext): void {
    const task = actor.task!;
    const visit = this.visits.get(actor.id)!;
    const progress = phaseProgress(task, context);
    actor.mode = "shopping";
    setGesture(actor, place.kind === "bookshop" ? "read" : progress < 0.5 ? "lift" : "point", context.time.seconds, 0.55);
    context.events.update(visit.eventId, actor.position, 0.15 + progress * 0.2, context.time.seconds, "browsing");
    if (visit.itemProp < 0 && progress > 0.2) {
      const prop = context.props.create(visit.desiredItem, actor.position, context.time.seconds,
        { ownerId: actor.id, attachment: "right-hand", duration: 35, color: "#b19c78" });
      visit.itemProp = prop?.id ?? -1;
    }
    if (!phaseFinished(task, context)) return;
    visit.inspected++;
    const stock = place.stock.get(visit.stockKey) ?? 0;
    if (stock < visit.quantity) {
      visit.decision = "leave";
      context.events.describe(visit.eventId,
        { zh: "想买的商品暂时缺货，顾客放回购物篮离开。", en: "The requested item is out of stock, so the shopper returns the basket." });
      changePhase(task, "leaving", context, 2);
      return;
    }
    if (actor.budget < visit.price * visit.quantity) {
      visit.quantity = 1;
      if (actor.budget < visit.price) {
        visit.decision = "leave";
        changePhase(task, "leaving", context, 2);
        return;
      }
    }
    if (visit.inspected < 2 && actor.personality.curiosity > 0.6) {
      visit.shelfIndex = (visit.shelfIndex + 1) % display.shelfPoints.length;
      goTo(actor, display.shelfPoints[visit.shelfIndex], context, 1);
      changePhase(task, "compare", context);
    } else {
      visit.decision = "buy";
      changePhase(task, "checkout", context);
    }
  }

  private compareGoods(actor: Actor, place: LifePlace, display: ShopDisplay, context: LifeContext): void {
    const visit = this.visits.get(actor.id)!;
    if (!arrived(actor, display.shelfPoints[visit.shelfIndex], 0.65) && !actor.navigation.failed) return;
    stopWalking(actor, "shopping");
    actor.targetHeading = place.heading;
    changePhase(actor.task!, "browse", context, 3 + actor.personality.curiosity * 3);
  }

  private checkout(actor: Actor, place: LifePlace, display: ShopDisplay, context: LifeContext): void {
    const task = actor.task!;
    const entry = context.queues.join(display.queueId, actor, context.time.seconds, actor.age === "elder" ? 1 : 0);
    if (!entry) {
      task.attempts++;
      if (task.attempts > 8) failTask(actor, context, "checkout-queue-full");
      return;
    }
    goTo(actor, entry.target, context, 2);
    task.queueId = display.queueId;
    changePhase(task, "queue", context);
    context.events.describe(task.serviceId,
      { zh: "商品放入购物篮，顾客遵守队列间距，依次向收银台移动。", en: "The shopper puts the items in a basket and keeps their place in line." });
  }

  private waitForCheckout(actor: Actor, place: LifePlace, display: ShopDisplay, context: LifeContext): void {
    const task = actor.task!;
    const visit = this.visits.get(actor.id)!;
    if (context.queues.takeAbandoned(actor.id)) {
      failTask(actor, context, "checkout-wait-abandoned");
      return;
    }
    if (context.queues.isActive(actor.id)) {
      setGesture(actor, "pay", context.time.seconds, 0.75);
      actor.mode = "shopping";
    } else if (actor.mode === "queuing") setGesture(actor, "carry", context.time.seconds, 0.55);
    context.events.update(visit.eventId, actor.position, 0.55, context.time.seconds, "checkout");
    if (!context.queues.takeCompleted(actor.id)) return;
    const stock = place.stock.get(visit.stockKey) ?? 0;
    if (stock < visit.quantity || !pay(actor, visit.price * visit.quantity)) {
      failTask(actor, context, "checkout-unavailable");
      return;
    }
    place.stock.set(visit.stockKey, stock - visit.quantity);
    visit.paid = true;
    display.transactions++;
    display.revenue += visit.price * visit.quantity;
    changePhase(task, "bagging", context, 2.1 + visit.quantity * 0.4);
    stopWalking(actor, "shopping");
    setGesture(actor, "lift", context.time.seconds, 0.8);
  }

  private bagGoods(actor: Actor, place: LifePlace, display: ShopDisplay, context: LifeContext): void {
    const task = actor.task!;
    const visit = this.visits.get(actor.id)!;
    context.events.update(visit.eventId, actor.position, 0.65 + phaseProgress(task, context) * 0.2, context.time.seconds, "bagging");
    if (!phaseFinished(task, context)) return;
    if (visit.itemProp >= 0) context.props.remove(visit.itemProp);
    if (visit.basketProp >= 0) context.props.remove(visit.basketProp);
    visit.itemProp = -1;
    visit.basketProp = -1;
    addItem(actor, visit.desiredItem, context, visit.quantity, "left-hand", visit.desiredItem === "flowers" ? "#b39780" : "#b49a70");
    localPoint(place.entrance, place.heading, 3, -1.5, this.displayPoint);
    goTo(actor, this.displayPoint, context, 1);
    changePhase(task, "leaving", context, 10);
    context.events.describe(visit.eventId,
      { zh: "付款完成，顾客提着购物袋离店，把人行道留给后来的人。", en: "Payment complete, the shopper leaves with a bag and clears the entrance." });
  }

  private leaveShop(actor: Actor, place: LifePlace, context: LifeContext): void {
    const task = actor.task!;
    const visit = this.visits.get(actor.id);
    if (!visit) {
      context.completeTask(actor, true);
      return;
    }
    if (visit.decision === "leave" && task.changedAt + 1 < context.time.seconds) {
      this.releaseActor(actor, context);
      context.completeTask(actor, false);
      return;
    }
    context.events.update(visit.eventId, actor.position, 0.9, context.time.seconds, "leaving");
    if (!arrived(actor) && !phaseFinished(task, context)) return;
    context.events.finish(visit.eventId, context.time.seconds);
    this.visits.delete(actor.id);
    finishSatisfied(actor, context, "shopping-complete", 0.35);
  }

  private refreshDisplays(context: LifeContext): void {
    if (context.time.tick % 12 !== 0) return;
    for (const display of this.displays.values()) {
      const place = context.places.get(display.placeId)!;
      const stockKey = place.kind === "florist" ? "flowers" : place.kind === "bookshop" ? "book" : "grocery";
      const stock = place.stock.get(stockKey) ?? 0;
      if (stock !== display.lastStock) {
        display.lastStock = stock;
        const filled = Math.ceil(stock / 8);
        display.props.forEach((id, index) => {
          const prop = context.props.get(id);
          if (prop && index % 2 === 1) prop.visible = index / 2 < filled;
        });
      }
      const queue = context.queues.queues.get(display.queueId);
      if (queue) queue.serviceDuration = 4.8 / Math.max(0.6, place.serviceRate);
    }
  }

  releaseActor(actor: Actor, context: LifeContext): void {
    const visit = this.visits.get(actor.id);
    if (!visit) return;
    if (visit.basketProp >= 0) context.props.remove(visit.basketProp);
    if (visit.itemProp >= 0) context.props.remove(visit.itemProp);
    context.events.finish(visit.eventId, context.time.seconds);
    context.queues.leave(actor.id);
    this.visits.delete(actor.id);
  }
}
