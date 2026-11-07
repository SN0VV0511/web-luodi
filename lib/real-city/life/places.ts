import { cityBlocks, cityLots, civicLots } from "../../city-map";
import { centralParkBenches, centralParkGatherings } from "../../city-civic";
import { MCDONALDS_SITE, OFFICE_LOBBY_DOORS } from "../../city-mcdonalds";
import { distance, distanceSquared, localPoint, point, type Bounds2, type Point2 } from "./math";
import { minuteInInterval } from "./clock";
import type { Actor, SimulationTime } from "./types";
import type { CityBuiltSite } from "../contracts";

export type PlaceKind = "home" | "office" | "restaurant" | "cafe" | "grocery"
  | "bookshop" | "florist" | "school" | "clinic" | "police" | "workshop"
  | "park" | "bench" | "bus-stop" | "taxi-stand" | "depot" | "promenade"
  | "sports" | "shelter" | "recycling";
export type PlaceFeature = "seat" | "counter" | "door" | "shelter" | "bin"
  | "water" | "parking" | "table" | "stage" | "garden" | "loading" | "queue";

export interface PlaceSlot {
  id: string;
  kind: PlaceFeature;
  position: Point2;
  heading: number;
  capacity: number;
  occupants: Set<number>;
  accessible: boolean;
  indoors: boolean;
  condition: number;
  reservedUntil: number;
}

export interface LifePlace {
  id: string;
  kind: PlaceKind;
  name: string;
  position: Point2;
  entrance: Point2;
  heading: number;
  bounds: Bounds2 | null;
  district: string;
  openMinute: number;
  closeMinute: number;
  weekendOpen: boolean;
  capacity: number;
  occupants: Set<number>;
  slots: PlaceSlot[];
  stock: Map<string, number>;
  cleanliness: number;
  maintenance: number;
  popularity: number;
  covered: number;
  warm: number;
  wheelchairAccess: boolean;
  nodeId: number;
  closing: boolean;
  activeQueue: string;
  lastDelivery: number;
  lastCleaning: number;
  serviceRate: number;
  groundY: number;
}

type PlaceInput = Pick<LifePlace, "id" | "kind" | "name" | "position"> & Partial<LifePlace>;

export class PlaceDirectory {
  readonly all: LifePlace[] = [];
  readonly byId = new Map<string, LifePlace>();
  readonly slots = new Map<string, PlaceSlot>();
  readonly byKind = new Map<PlaceKind, LifePlace[]>();

  constructor(sites: readonly CityBuiltSite[] = []) {
    this.buildOffices();
    this.buildHomes();
    this.buildRetail();
    this.buildCivicPlaces();
    this.buildParks();
    this.buildTransportPlaces();
    this.buildServicePlaces();
    this.alignBuiltSites(sites);
  }

  private add(input: PlaceInput): LifePlace {
    if (this.byId.has(input.id)) throw new Error(`Duplicate life place: ${input.id}`);
    const position = { ...input.position };
    const place: LifePlace = {
      id: input.id,
      kind: input.kind,
      name: input.name,
      position,
      entrance: input.entrance ? { ...input.entrance } : { ...position },
      heading: input.heading ?? Math.PI,
      bounds: input.bounds ?? null,
      district: input.district ?? this.districtAt(position),
      openMinute: input.openMinute ?? 0,
      closeMinute: input.closeMinute ?? 1440,
      weekendOpen: input.weekendOpen ?? true,
      capacity: input.capacity ?? 8,
      occupants: new Set(),
      slots: [],
      stock: new Map(),
      cleanliness: input.cleanliness ?? 0.92,
      maintenance: input.maintenance ?? 0.97,
      popularity: input.popularity ?? 0.5,
      covered: input.covered ?? 0,
      warm: input.warm ?? 0,
      wheelchairAccess: input.wheelchairAccess ?? true,
      nodeId: -1,
      closing: false,
      activeQueue: "",
      lastDelivery: -100,
      lastCleaning: -100,
      serviceRate: input.serviceRate ?? 1,
      groundY: input.groundY ?? 0.49,
    };
    this.all.push(place);
    this.byId.set(place.id, place);
    const group = this.byKind.get(place.kind) ?? [];
    group.push(place);
    this.byKind.set(place.kind, group);
    return place;
  }

  private addSlot(place: LifePlace, feature: PlaceFeature, offsetX: number, offsetZ: number, heading = place.heading, capacity = 1, indoors = false): PlaceSlot {
    const position = localPoint(place.entrance, place.heading, offsetX, offsetZ, point());
    const slot: PlaceSlot = {
      id: `${place.id}:${feature}:${place.slots.length}`,
      kind: feature,
      position,
      heading,
      capacity,
      occupants: new Set(),
      accessible: place.wheelchairAccess,
      indoors,
      condition: 1,
      reservedUntil: 0,
    };
    place.slots.push(slot);
    this.slots.set(slot.id, slot);
    return slot;
  }

  private alignBuiltSites(sites: readonly CityBuiltSite[]): void {
    const unused = new Set(sites.filter((site) => site.entrances.length > 0).map((site) => site.id));
    for (const place of this.all) {
      const desired = place.kind === "home" ? "residential" : place.kind === "office" ? "office"
        : place.kind === "restaurant" ? "restaurant"
          : ["cafe", "grocery", "bookshop", "florist"].includes(place.kind) ? "retail" : null;
      if (!desired) continue;
      const candidates = sites.filter((site) => site.kind === desired && unused.has(site.id) && site.entrances.length > 0);
      candidates.sort((a, b) => distanceSquared(a, place.position) - distanceSquared(b, place.position));
      const site = candidates[0];
      if (!site) continue;
      unused.delete(site.id);
      const entry = site.entrances.find((candidate) => candidate.accessible) ?? site.entrances[0];
      const oldEntrance = { ...place.entrance };
      const oldHeading = place.heading;
      const outward = Math.atan2(entry.outward.x, entry.outward.z);
      place.position.x = site.x;
      place.position.z = site.z;
      place.entrance.x = entry.position.x + entry.outward.x * 0.8;
      place.entrance.z = entry.position.z + entry.outward.z * 0.8;
      place.heading = outward + Math.PI;
      place.groundY = entry.position.y;
      place.wheelchairAccess = entry.accessible;
      place.district = this.districtAt(place.position);
      const cosine = Math.abs(Math.cos(site.rotationY));
      const sine = Math.abs(Math.sin(site.rotationY));
      const width = site.width * cosine + site.depth * sine;
      const depth = site.depth * cosine + site.width * sine;
      place.bounds = { minX: site.x - width / 2, maxX: site.x + width / 2, minZ: site.z - depth / 2, maxZ: site.z + depth / 2 };
      for (const slot of place.slots) {
        const dx = slot.position.x - oldEntrance.x;
        const dz = slot.position.z - oldEntrance.z;
        const localX = dx * Math.cos(oldHeading) - dz * Math.sin(oldHeading);
        const localZ = dz * Math.cos(oldHeading) + dx * Math.sin(oldHeading);
        localPoint(place.entrance, place.heading, localX, localZ, slot.position);
        slot.heading += place.heading - oldHeading;
        slot.accessible = entry.accessible;
      }
    }
  }

  private buildOffices(): void {
    OFFICE_LOBBY_DOORS.forEach((door, index) => {
      const place = this.add({
        id: `office-${index}`,
        kind: "office",
        name: `Office lobby ${index + 1}`,
        position: { x: door.x, z: door.towerZ },
        entrance: { x: door.x, z: door.z + 0.65 },
        bounds: {
          minX: door.x - door.towerW / 2,
          maxX: door.x + door.towerW / 2,
          minZ: door.towerZ - door.towerD / 2,
          maxZ: door.towerZ + door.towerD / 2,
        },
        openMinute: 7 * 60,
        closeMinute: 21 * 60,
        weekendOpen: index === 0,
        capacity: 18,
        covered: 0.7,
        warm: 0.8,
      });
      this.addSlot(place, "door", 0, 0, Math.PI, 2);
      this.addSlot(place, "counter", 0, -0.35, 0, 1, true);
      this.addSlot(place, "shelter", -2.4, 0.2, 0, 3);
      this.addSlot(place, "loading", 3.3, 0.8, 0, 1);
      this.addSlot(place, "queue", 0, 1.15, Math.PI, 4);
    });
  }

  private buildHomes(): void {
    const occupied = new Set([
      ...cityLots.map((site) => `${site.x}:${site.z}`),
      ...civicLots.map((site) => `${site.x}:${site.z}`),
    ]);
    const candidates = cityBlocks.filter((site) => !occupied.has(`${site.x}:${site.z}`));
    candidates.slice(0, 14).forEach((site, index) => {
      const place = this.add({
        id: `home-${index}`,
        kind: "home",
        name: `Neighborhood home ${index + 1}`,
        position: { x: site.x, z: site.z },
        entrance: { x: site.x, z: site.z + 17.2 },
        district: site.district,
        capacity: 6,
        covered: 0.65,
        warm: 0.9,
        bounds: { minX: site.x - 13, maxX: site.x + 13, minZ: site.z - 13, maxZ: site.z + 13 },
      });
      this.addSlot(place, "door", 0, 0, Math.PI, 2);
      this.addSlot(place, "bin", -2.1, 0.8, 0);
      this.addSlot(place, "loading", 2, 1, 0);
    });
  }

  private buildRetail(): void {
    const restaurant = this.add({
      id: "restaurant-mcdonalds",
      kind: "restaurant",
      name: "McDonald's",
      position: { x: MCDONALDS_SITE.x, z: MCDONALDS_SITE.z },
      entrance: { x: MCDONALDS_SITE.doorX, z: MCDONALDS_SITE.doorZ + 0.65 },
      capacity: 14,
      covered: 0.8,
      warm: 0.8,
      popularity: 0.92,
      serviceRate: 1.2,
    });
    this.addSlot(restaurant, "door", 0, 0, Math.PI, 2);
    this.addSlot(restaurant, "counter", 0, -0.5, Math.PI, 1, true);
    this.addSlot(restaurant, "queue", 0, 1.1, Math.PI, 5);
    this.addSlot(restaurant, "loading", -5, 1, 0);
    this.addSlot(restaurant, "bin", 3.1, 1.4, 0);
    for (let index = 0; index < 4; index++) {
      this.addSlot(restaurant, "seat", -4.5 + (index % 2) * 2, 2.2 + Math.floor(index / 2) * 1.2, index % 2 ? -Math.PI / 2 : Math.PI / 2);
    }
    restaurant.stock.set("meal", 24);
    restaurant.stock.set("drink", 30);
    const retail: { kind: PlaceKind; x: number; z: number; name: string; opens: number; closes: number }[] = [
      { kind: "cafe", x: -106, z: 87.5, name: "Promenade coffee", opens: 6.5, closes: 20 },
      { kind: "grocery", x: -128, z: 88.2, name: "Fresh neighborhood market", opens: 7, closes: 22 },
      { kind: "bookshop", x: -148, z: 88, name: "Corner bookshop", opens: 9, closes: 21 },
      { kind: "florist", x: -91, z: 87.2, name: "Flowers by the bay", opens: 8, closes: 19 },
      { kind: "cafe", x: 105.5, z: 59, name: "East Bay coffee", opens: 7, closes: 21 },
      { kind: "grocery", x: 187.5, z: 59.5, name: "East Bay provisions", opens: 7, closes: 22 },
    ];
    retail.forEach((site, index) => {
      const place = this.add({
        id: `${site.kind}-${index}`,
        kind: site.kind,
        name: site.name,
        position: { x: site.x, z: site.z },
        openMinute: site.opens * 60,
        closeMinute: site.closes * 60,
        capacity: site.kind === "grocery" ? 10 : 6,
        covered: 0.65,
        warm: 0.6,
        popularity: 0.6 + index * 0.04,
      });
      this.addSlot(place, "door", 0, 0, Math.PI, 1);
      this.addSlot(place, "counter", 0, -0.45, Math.PI, 1);
      this.addSlot(place, "queue", -0.6, 0.8, Math.PI, 4);
      this.addSlot(place, "loading", 2.6, 0.6, 0);
      this.addSlot(place, "bin", -3, 0.5, 0);
      if (site.kind === "cafe") {
        this.addSlot(place, "seat", -2.2, 1.4, Math.PI / 2);
        this.addSlot(place, "seat", -0.8, 1.4, -Math.PI / 2);
        this.addSlot(place, "table", -1.5, 1.4, 0, 2);
        place.stock.set("coffee", 20);
        place.stock.set("pastry", 12);
      } else if (site.kind === "grocery") {
        place.stock.set("grocery", 28);
        place.stock.set("fruit", 18);
        place.stock.set("water", 24);
      } else if (site.kind === "bookshop") {
        place.stock.set("book", 18);
      } else {
        place.stock.set("flowers", 14);
      }
    });
  }

  private buildCivicPlaces(): void {
    for (const site of civicLots) {
      const kind: PlaceKind | null = site.kind === "school" ? "school"
        : site.kind === "hospital" ? "clinic"
          : site.kind === "police" ? "police"
            : site.kind === "stadium" ? "sports" : null;
      if (!kind) continue;
      const place = this.add({
        id: `civic-${kind}`,
        kind,
        name: site.name,
        position: { x: site.x, z: site.z },
        entrance: { x: site.x, z: site.z + 16.7 },
        bounds: { minX: site.x - 12, maxX: site.x + 12, minZ: site.z - 12, maxZ: site.z + 12 },
        openMinute: kind === "school" ? 7.5 * 60 : 0,
        closeMinute: kind === "school" ? 17.5 * 60 : 1440,
        weekendOpen: kind !== "school",
        capacity: 18,
        covered: 0.8,
        warm: 0.85,
      });
      this.addSlot(place, "door", 0, 0, Math.PI, 2);
      this.addSlot(place, "queue", -1.2, 1, Math.PI, 5);
      this.addSlot(place, "shelter", 2.4, 0.8, 0, 4);
      this.addSlot(place, "loading", 4, 1, 0);
      if (kind === "school") {
        this.addSlot(place, "garden", -5, 0.8, 0, 2);
        this.addSlot(place, "seat", -3, 0.8, Math.PI / 2);
      }
    }
  }

  private buildParks(): void {
    centralParkGatherings.forEach((site, index) => {
      const place = this.add({
        id: `park-${index}`,
        kind: "park",
        name: `Central park gathering ${index + 1}`,
        position: { x: site.x, z: site.z },
        capacity: 8,
        popularity: 0.75,
        covered: index === 2 ? 0.8 : 0.12,
      });
      this.addSlot(place, "stage", 0, 0, 0, 1);
      this.addSlot(place, "garden", 1.8, 1, 0, 2);
      this.addSlot(place, "bin", -2, 0, 0);
      this.addSlot(place, "water", -1.2, 0, 0);
      for (let seat = 0; seat < 4; seat++) {
        this.addSlot(place, "seat", Math.cos(seat * Math.PI / 2) * 1.3, Math.sin(seat * Math.PI / 2) * 1.3, -seat * Math.PI / 2, 1);
      }
    });
    centralParkBenches.forEach((site, index) => {
      const place = this.add({
        id: `bench-${index}`,
        kind: "bench",
        name: `Park bench ${index + 1}`,
        position: { x: site.x, z: site.z },
        heading: site.angle,
        capacity: 2,
        covered: 0.22,
      });
      this.addSlot(place, "seat", -0.45, 0, site.angle);
      this.addSlot(place, "seat", 0.45, 0, site.angle);
    });
    for (let index = 0; index < 3; index++) {
      const place = this.add({
        id: `promenade-${index}`,
        kind: "promenade",
        name: `Waterfront promenade ${index + 1}`,
        position: { x: -54 + index * 80, z: 102.5 },
        capacity: 8,
        popularity: 0.85,
      });
      this.addSlot(place, "stage", 0, 0, Math.PI, 1);
      this.addSlot(place, "seat", -2.4, 0, Math.PI);
      this.addSlot(place, "seat", 2.4, 0, Math.PI);
      this.addSlot(place, "bin", -3.2, 0, 0);
    }
  }

  private buildTransportPlaces(): void {
    const stops = [
      { x: -170.5, z: 11, district: "west" },
      { x: -79.8, z: 80, district: "west" },
      { x: 114.5, z: 8, district: "east" },
      { x: 170.5, z: 56, district: "east" },
      { x: 49, z: -165.5, district: "north" },
      { x: -20, z: -120.5, district: "north" },
    ];
    stops.forEach((site, index) => {
      const place = this.add({
        id: `bus-stop-${index}`,
        kind: "bus-stop",
        name: `Neighborhood bus stop ${index + 1}`,
        position: { x: site.x, z: site.z },
        district: site.district,
        capacity: 8,
        covered: 0.85,
        heading: index === 4 || index === 5 ? 0 : Math.PI / 2,
      });
      this.addSlot(place, "queue", 0, 0, place.heading, 6);
      this.addSlot(place, "seat", -1.1, 0.6, place.heading);
      this.addSlot(place, "seat", -0.4, 0.6, place.heading);
      this.addSlot(place, "shelter", 0, 0.6, place.heading, 4);
      this.addSlot(place, "parking", 0, -2.8, place.heading, 1);
    });
    for (const [index, site] of [{ x: 137, z: 59 }, { x: -105, z: 88 }].entries()) {
      const place = this.add({ id: `taxi-stand-${index}`, kind: "taxi-stand", name: "Taxi pickup", position: site, capacity: 3 });
      this.addSlot(place, "parking", 0, -2.8, Math.PI / 2, 1);
      this.addSlot(place, "queue", 0, 0, 0, 3);
    }
  }

  private buildServicePlaces(): void {
    const depot = this.add({ id: "service-depot", kind: "depot", name: "Neighborhood service depot", position: { x: -198, z: 57.8 }, capacity: 8, covered: 0.8 });
    this.addSlot(depot, "loading", 0, 0, 0, 2);
    this.addSlot(depot, "parking", -3.3, 1.2, Math.PI / 2, 2);
    this.addSlot(depot, "counter", 0, -0.6, 0, 2);
    const workshop = this.add({ id: "repair-workshop", kind: "workshop", name: "Local repair workshop", position: { x: -177, z: 59 }, capacity: 6, covered: 0.85 });
    this.addSlot(workshop, "counter", 0, 0, 0, 1);
    this.addSlot(workshop, "loading", 2.3, 0, 0, 1);
    for (const [index, location] of [{ x: -182, z: 12.8 }, { x: 198, z: 12.8 }, { x: 131, z: -122 }].entries()) {
      const place = this.add({ id: `recycling-${index}`, kind: "recycling", name: "Recycling collection point", position: location, capacity: 2 });
      this.addSlot(place, "bin", -0.5, 0, 0);
      this.addSlot(place, "bin", 0.5, 0, 0);
      this.addSlot(place, "loading", 1.6, 0, 0);
    }
  }

  districtAt(position: Point2): string {
    if (position.z < -110) return "north";
    if (position.x < -70) return "west";
    if (position.x > 70) return "east";
    return position.z > 90 ? "coast" : "park";
  }

  get(id: string): LifePlace | undefined {
    return this.byId.get(id);
  }

  ofKind(kind: PlaceKind): readonly LifePlace[] {
    return this.byKind.get(kind) ?? [];
  }

  isOpen(place: LifePlace, time: SimulationTime): boolean {
    if (place.closing || place.maintenance < 0.12) return false;
    if (time.weekend && !place.weekendOpen) return false;
    return minuteInInterval(time.minute, place.openMinute, place.closeMinute);
  }

  hasCapacity(place: LifePlace): boolean {
    return place.occupants.size < place.capacity;
  }

  find(actor: Actor, kinds: readonly PlaceKind[], time: SimulationTime, predicate?: (place: LifePlace) => boolean): LifePlace | undefined {
    let best: LifePlace | undefined;
    let bestScore = Infinity;
    for (const kind of kinds) {
      for (const place of this.ofKind(kind)) {
        if (!this.isOpen(place, time) || !this.hasCapacity(place)) continue;
        if (actor.mobility !== "ordinary" && !place.wheelchairAccess) continue;
        if (predicate && !predicate(place)) continue;
        const travel = distance(actor.position, place.entrance);
        const crowding = place.occupants.size / Math.max(1, place.capacity);
        const comfort = actor.needs.comfort * (1 - place.covered) * 8;
        const score = travel + crowding * 18 + comfort - place.popularity * 5;
        if (score < bestScore) {
          best = place;
          bestScore = score;
        }
      }
    }
    return best;
  }

  enter(placeId: string, actorId: number): boolean {
    const place = this.get(placeId);
    if (!place || (!place.occupants.has(actorId) && !this.hasCapacity(place))) return false;
    place.occupants.add(actorId);
    return true;
  }

  leave(placeId: string, actorId: number): void {
    const place = this.get(placeId);
    if (!place) return;
    place.occupants.delete(actorId);
    for (const slot of place.slots) slot.occupants.delete(actorId);
  }

  releaseActor(actorId: number): void {
    for (const place of this.all) {
      place.occupants.delete(actorId);
      for (const slot of place.slots) slot.occupants.delete(actorId);
    }
  }

  reset(): void {
    for (const place of this.all) {
      place.occupants.clear();
      place.cleanliness = 0.92;
      place.maintenance = 0.97;
      place.closing = false;
      place.lastCleaning = -100;
      place.lastDelivery = -100;
      for (const slot of place.slots) {
        slot.occupants.clear();
        slot.condition = 1;
        slot.reservedUntil = 0;
      }
    }
  }
}
