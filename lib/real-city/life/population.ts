import { clamp, point, point3 } from "./math";
import { RandomStream, hashInteger } from "./random";
import type { PlaceDirectory } from "./places";
import type { Actor, ActorPose, AgeGroup, Appearance, LifeStats, Occupation, Personality, Relationship } from "./types";

export function emptyPose(): ActorPose {
  return {
    hips: point3(0, 0.91, 0),
    chest: point3(0, 1.25, 0),
    head: point3(0, 1.66, 0),
    leftShoulder: point3(-0.22, 1.4, 0),
    rightShoulder: point3(0.22, 1.4, 0),
    leftElbow: point3(-0.25, 1.1, 0),
    rightElbow: point3(0.25, 1.1, 0),
    leftHand: point3(-0.25, 0.85, 0),
    rightHand: point3(0.25, 0.85, 0),
    leftKnee: point3(-0.11, 0.5, 0.03),
    rightKnee: point3(0.11, 0.5, 0.03),
    leftAnkle: point3(-0.11, 0.09, 0),
    rightAnkle: point3(0.11, 0.09, 0),
    leftFootPitch: 0,
    rightFootPitch: 0,
    headYaw: 0,
    headPitch: 0,
    chestYaw: 0,
    chestPitch: 0,
    breathing: 0,
    leftFootPlanted: true,
    rightFootPlanted: true,
    eyeBlink: 0,
    browLift: 0,
    mouthOpen: 0,
    smile: 0,
  };
}

function appearance(random: RandomStream, occupation: Occupation, age: AgeGroup): Appearance {
  // 写实城市着装：深色外套、牛仔、卡其与少量暖色单品，饱和度与真实街拍接近。
  const jacket = random.choice([
    "#2f3a4c", "#26282c", "#4a4d52", "#6c7176", "#8e9fb2", "#a8946f", "#55603f", "#6b3238",
    "#3e5674", "#93463a", "#c9c5bb", "#1f2f3f", "#716355", "#b2883e", "#5a4a5e", "#7d8a7a",
  ]);
  const isUniform = occupation === "cleaner" || occupation === "courier" || occupation === "medic" || occupation === "officer";
  let coat = jacket;
  if (occupation === "cleaner") coat = "#c28b43";
  if (occupation === "courier") coat = "#b18b45";
  if (occupation === "medic") coat = "#507c74";
  if (occupation === "officer") coat = "#354c60";
  if (occupation === "gardener") coat = "#748366";
  if (occupation === "cook") coat = "#cecbbb";
  if (occupation === "student") coat = "#5f7786";
  const height = age === "child" ? random.between(1.12, 1.43)
    : age === "elder" ? random.between(1.53, 1.73) : random.between(1.61, 1.88);
  return {
    height,
    shoulderWidth: random.between(0.37, 0.48),
    build: random.between(0.88, 1.16),
    skin: random.choice(["#d3af8f", "#b78f70", "#ddb99a", "#ad8264", "#c59c7c"]),
    hair: age === "elder" ? random.choice(["#8c8980", "#a6a195", "#6d6a63"])
      : random.choice(["#332f2a", "#514537", "#403b35", "#2e2c29"]),
    coat,
    trousers: random.choice(["#2e3c55", "#24272b", "#3c4a62", "#8f7f62", "#5f6266", "#4a3d32", "#33363a", "#6e7a8c"]),
    shoes: random.choice(["#2a2826", "#4a3a2c", "#d9d6cf", "#3b3f45", "#6b4c35"]),
    hairStyle: random.integer(0, 4),
    hat: isUniform || random.probability(0.12),
    glasses: age === "elder" || random.probability(0.24),
    coatLength: occupation === "office" ? 0.66 : 0.56,
    sleeveLength: random.between(0.64, 1),
    winterCoat: false,
  };
}

function personality(random: RandomStream, occupation: Occupation, age: AgeGroup): Personality {
  const serviceRole = occupation === "retail" || occupation === "teacher" || occupation === "medic";
  return {
    sociability: clamp(random.normal(serviceRole ? 0.7 : 0.5, 0.18), 0.15, 0.95),
    patience: clamp(random.normal(age === "elder" ? 0.7 : 0.5, 0.18), 0.12, 0.95),
    diligence: clamp(random.normal(0.65, 0.14), 0.2, 0.95),
    curiosity: clamp(random.normal(occupation === "tourist" ? 0.8 : 0.5, 0.15), 0.1, 0.95),
    generosity: random.between(0.25, 0.9),
    caution: clamp(random.normal(age === "elder" ? 0.8 : 0.6, 0.13), 0.25, 0.95),
    punctuality: clamp(random.normal(occupation === "office" ? 0.78 : 0.55, 0.13), 0.2, 0.98),
    preferredPace: age === "child" ? random.between(0.85, 1.25)
      : age === "elder" ? random.between(0.65, 1.02) : random.between(1.08, 1.52),
  };
}

function workplaceFor(occupation: Occupation, index: number, places: PlaceDirectory): string {
  if (occupation === "student" || occupation === "teacher" || occupation === "parent") return "civic-school";
  if (occupation === "medic") return "civic-clinic";
  if (occupation === "officer") return "civic-police";
  if (occupation === "courier" || occupation === "driver" || occupation === "cleaner" || occupation === "gardener") return "service-depot";
  if (occupation === "technician") return "repair-workshop";
  if (occupation === "cook") return "restaurant-mcdonalds";
  if (occupation === "retail") {
    const shops = [...places.ofKind("grocery"), ...places.ofKind("cafe"), ...places.ofKind("bookshop"), ...places.ofKind("florist")];
    return shops[index % Math.max(1, shops.length)]?.id ?? "restaurant-mcdonalds";
  }
  const offices = places.ofKind("office");
  return offices[index % Math.max(1, offices.length)]?.id ?? "office-0";
}

function occupationFor(index: number, count: number): Occupation {
  const role = index % 24;
  if (role < 6) return "office";
  if (role === 6 || role === 7) return "retail";
  if (role === 8) return "cook";
  if (role === 9) return "courier";
  if (role === 10) return "cleaner";
  if (role === 11) return "gardener";
  if (role === 12) return "technician";
  if (role === 13) return "teacher";
  if (role === 14 || role === 16) return "parent";
  if (role === 15 || role === 17) return "student";
  if (role === 18 || role === 19) return "retired";
  if (role === 20) return "tourist";
  if (role === 21) return "driver";
  if (role === 22) return "medic";
  return count > 30 ? "officer" : "office";
}

export function createPopulation(places: PlaceDirectory, maximumActors: number): Actor[] {
  const count = Math.max(24, Math.min(96, Math.floor(maximumActors)));
  const homes = places.ofKind("home");
  const actors: Actor[] = [];
  for (let index = 0; index < count; index++) {
    const random = new RandomStream(hashInteger(0x504f50 + index * 97));
    const occupation = occupationFor(index, count);
    const age: AgeGroup = occupation === "student" ? "child" : occupation === "retired" ? "elder" : "adult";
    const home = homes[Math.floor(index / 3) % Math.max(1, homes.length)];
    const traits = personality(random, occupation, age);
    const look = appearance(random, occupation, age);
    const origin = home?.entrance ?? { x: -142.5, z: 59.5 };
    const x = origin.x + (index % 3 - 1) * 0.66;
    const z = origin.z + 0.7 + (Math.floor(index / 3) % 2) * 0.2;
    const mobility = age === "elder" && index % 3 === 0 ? "cane" : age === "elder" ? "careful" : "ordinary";
    const actor: Actor = {
      id: index,
      name: `Resident ${index + 1}`,
      age,
      occupation,
      mobility,
      household: Math.floor(index / 3),
      guardianId: -1,
      dependentId: -1,
      homeId: home?.id ?? "home-0",
      workplaceId: workplaceFor(occupation, index, places),
      position: point(x, z),
      previousPosition: point(x, z),
      velocity: point(),
      desiredVelocity: point(),
      avoidance: point(),
      heading: Math.PI / 2,
      previousHeading: Math.PI / 2,
      targetHeading: Math.PI / 2,
      groundY: 0.49,
      radius: age === "child" ? 0.2 : 0.26,
      speed: 0,
      baseSpeed: traits.preferredPace,
      acceleration: age === "elder" ? 1.5 : 2.2,
      mass: age === "child" ? 29 : 61 + random.next() * 22,
      mode: "idle",
      visible: true,
      interiorId: "",
      vehicleId: -1,
      seatIndex: -1,
      selected: false,
      needs: {
        hunger: random.between(0.15, 0.5),
        thirst: random.between(0.12, 0.4),
        energy: random.between(0.68, 0.95),
        social: random.between(0.2, 0.6),
        comfort: 0.82,
        curiosity: random.between(0.35, 0.75),
        urgency: 0.1,
        stress: random.between(0.05, 0.2),
      },
      personality: traits,
      appearance: look,
      task: null,
      suspendedTask: null,
      schedule: [],
      scheduleDay: -1,
      lastDecision: -100,
      nextDecision: index * 0.09,
      lastTaskCompleted: -100,
      conversationId: -1,
      groupId: -1,
      inventory: [],
      relationships: new Map(),
      memories: [],
      navigation: {
        nodePath: [],
        edgePath: [],
        points: [],
        cursor: 0,
        finalTarget: point(x, z),
        origin: point(x, z),
        requestedAt: -1,
        arrivedAt: -1,
        lastProgressAt: 0,
        lastDistance: 0,
        distanceRemaining: 0,
        plannedDistance: 0,
        requestId: -1,
        version: 0,
        failed: false,
        arrived: true,
        pending: false,
        crossingId: -1,
        lane: 0,
        yieldUntil: 0,
        blockedSince: 0,
        repathAfter: 0,
        detourCount: 0,
      },
      gesture: {
        kind: "neutral",
        previous: "neutral",
        startedAt: 0,
        duration: 1,
        intensity: 0,
        blend: 1,
        hand: "right",
        target: point3(),
        hasTarget: false,
        gazeId: -1,
        gazePoint: point(x, z + 1),
        gazeUntil: 0,
        emotion: "neutral",
      },
      pose: emptyPose(),
      gaitPhase: random.next() * Math.PI * 2,
      strideDistance: 0,
      fatigueDistance: 0,
      wetness: 0,
      warmth: 0.7,
      shelterScore: 0,
      umbrellaOpen: 0,
      greetingCooldown: index * 0.3,
      serviceCooldown: 0,
      budget: 80 + random.next() * 100,
      dailySpending: 0,
      health: 0.95,
      random,
    };
    actors.push(actor);
  }
  assignHouseholds(actors);
  assignRelationships(actors);
  distributeInitialPopulation(actors, places);
  return actors;
}

function assignHouseholds(actors: Actor[]): void {
  for (const actor of actors) {
    if (actor.occupation !== "student") continue;
    const parent = actors[actor.id - 1];
    if (parent?.occupation !== "parent") continue;
    actor.guardianId = parent.id;
    parent.dependentId = actor.id;
    actor.household = parent.household;
    actor.homeId = parent.homeId;
    actor.position.x = parent.position.x + 0.5;
    actor.position.z = parent.position.z;
    actor.previousPosition.x = actor.position.x;
    actor.previousPosition.z = actor.position.z;
  }
}

function assignRelationships(actors: Actor[]): void {
  for (const actor of actors) {
    for (const other of actors) {
      if (actor.id === other.id) continue;
      const household = actor.household === other.household;
      const coworker = actor.workplaceId === other.workplaceId && actor.occupation === other.occupation;
      const familiarNeighbor = actor.homeId === other.homeId;
      if (!household && !coworker && !familiarNeighbor) continue;
      const relationship: Relationship = {
        actorId: other.id,
        affinity: household ? 0.85 : coworker ? 0.6 : 0.45,
        familiarity: household ? 1 : coworker ? 0.75 : 0.55,
        trust: household ? 0.95 : coworker ? 0.7 : 0.5,
        lastConversation: -100,
        sharedActivities: household ? 8 : 2,
        household,
        coworker,
        promisedMeeting: -1,
      };
      actor.relationships.set(other.id, relationship);
    }
  }
}

function distributeInitialPopulation(actors: Actor[], places: PlaceDirectory): void {
  const parks = [...places.ofKind("park"), ...places.ofKind("promenade")];
  for (const actor of actors) {
    let place = places.get(actor.homeId);
    if (actor.occupation === "retired" || actor.occupation === "tourist") {
      place = parks[actor.id % Math.max(1, parks.length)] ?? place;
    } else if (["retail", "cook", "cleaner", "gardener", "technician", "courier", "medic", "officer"].includes(actor.occupation)) {
      place = places.get(actor.workplaceId) ?? place;
    }
    if (!place) continue;
    const offset = (actor.id % 3 - 1) * 0.68;
    actor.position.x = place.entrance.x + offset;
    actor.position.z = place.entrance.z + 0.75;
    actor.previousPosition.x = actor.position.x;
    actor.previousPosition.z = actor.position.z;
    actor.navigation.finalTarget.x = actor.position.x;
    actor.navigation.finalTarget.z = actor.position.z;
  }
}

export function createLifeStats(): LifeStats {
  return {
    activeActors: 0,
    walkingActors: 0,
    queuedActors: 0,
    seatedActors: 0,
    conversations: 0,
    completedTasks: 0,
    completedTrips: 0,
    completedDeliveries: 0,
    completedRepairs: 0,
    mealsServed: 0,
    missedBuses: 0,
    avoidedCollisions: 0,
    routeFailures: 0,
    droppedTime: 0,
    frameTime: 0,
  };
}

export function refreshPopulationStats(actors: readonly Actor[], stats: LifeStats): void {
  stats.activeActors = 0;
  stats.walkingActors = 0;
  stats.queuedActors = 0;
  stats.seatedActors = 0;
  for (const actor of actors) {
    if (actor.visible) stats.activeActors++;
    if (actor.mode === "walking") stats.walkingActors++;
    if (actor.mode === "queuing") stats.queuedActors++;
    if (actor.mode === "seated" || actor.mode === "eating" || actor.mode === "riding") stats.seatedActors++;
  }
}
