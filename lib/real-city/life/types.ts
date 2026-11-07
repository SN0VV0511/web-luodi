import type { SeasonState } from "../../city-seasons";
import type { Point2, Point3 } from "./math";
import type { RandomStream } from "./random";
import type { PedestrianNetwork } from "./navigation";
import type { RoutePlanner } from "./routing";
import type { DestinationReservations } from "./reservations";
import type { QueueManager } from "./queues";
import type { PlaceDirectory } from "./places";
import type { SceneProps } from "./props-state";
import type { NeighborhoodEvents } from "./events";
import type { SpatialNeighbors } from "./spatial";
import type { CrossingSignals } from "./crossings";
import type { BuildingPassages } from "./passages";

export type ActorId = number;
export type Occupation = "office" | "retail" | "cook" | "courier" | "cleaner"
  | "gardener" | "technician" | "teacher" | "student" | "parent"
  | "retired" | "tourist" | "driver" | "medic" | "officer";
export type AgeGroup = "child" | "adult" | "elder";
export type Mobility = "ordinary" | "careful" | "cane" | "stroller";
export type ActorMode = "idle" | "walking" | "waiting" | "queuing" | "working"
  | "talking" | "seated" | "eating" | "shopping" | "boarding" | "riding"
  | "inside" | "assisting" | "resting" | "sheltering" | "performing";
export type TaskKind = "home" | "work" | "meal" | "coffee" | "shopping"
  | "commute" | "bus" | "taxi" | "delivery" | "cleaning" | "repair"
  | "gardening" | "school" | "pickup" | "walk" | "jog" | "exercise"
  | "dog" | "photo" | "music" | "reading" | "chess" | "picnic"
  | "conversation" | "help" | "shelter" | "medical" | "patrol" | "idle" | "cycling";
export type GestureKind = "neutral" | "talk" | "listen" | "wave" | "handshake"
  | "point" | "phone" | "watch" | "carry" | "sip" | "eat" | "read"
  | "type" | "pay" | "scan" | "write" | "sweep" | "mop" | "dig"
  | "water" | "repair" | "lift" | "push" | "kneel" | "sit" | "stretch"
  | "jog" | "guitar" | "photo" | "throw" | "catch" | "umbrella" | "cane";
export type ItemKind = "bag" | "briefcase" | "phone" | "cup" | "meal" | "book"
  | "parcel" | "grocery" | "flowers" | "umbrella" | "cane" | "camera"
  | "guitar" | "toolbox" | "broom" | "watering-can" | "ball";

export interface InventoryItem {
  id: number;
  kind: ItemKind;
  quantity: number;
  weight: number;
  condition: number;
  owner: ActorId;
  acquiredAt: number;
  perishAt: number;
  propId: number;
}

export interface Needs {
  hunger: number;
  thirst: number;
  energy: number;
  social: number;
  comfort: number;
  curiosity: number;
  urgency: number;
  stress: number;
}

export interface Personality {
  sociability: number;
  patience: number;
  diligence: number;
  curiosity: number;
  generosity: number;
  caution: number;
  punctuality: number;
  preferredPace: number;
}

export interface Appearance {
  height: number;
  shoulderWidth: number;
  build: number;
  skin: string;
  hair: string;
  coat: string;
  trousers: string;
  shoes: string;
  hairStyle: number;
  hat: boolean;
  glasses: boolean;
  coatLength: number;
  sleeveLength: number;
  winterCoat: boolean;
}

export interface Relationship {
  actorId: ActorId;
  affinity: number;
  familiarity: number;
  trust: number;
  lastConversation: number;
  sharedActivities: number;
  household: boolean;
  coworker: boolean;
  promisedMeeting: number;
}

export interface ActorMemory {
  eventId: number;
  kind: string;
  actorId: ActorId;
  placeId: string;
  time: number;
  valence: number;
  confidence: number;
}

export interface ScheduleEntry {
  kind: TaskKind;
  minute: number;
  duration: number;
  venueId: string;
  priority: number;
  flexible: number;
  day: number;
  completed: boolean;
}

export interface ActorTask {
  id: number;
  kind: TaskKind;
  phase: string;
  venueId: string;
  target: Point2;
  startedAt: number;
  changedAt: number;
  deadline: number;
  until: number;
  progress: number;
  partnerId: number;
  serviceId: number;
  reservationId: number;
  queueId: string;
  priority: number;
  attempts: number;
  payload: number;
  option: string;
}

export interface ActorNavigation {
  nodePath: number[];
  edgePath: number[];
  points: Point2[];
  cursor: number;
  finalTarget: Point2;
  origin: Point2;
  requestedAt: number;
  arrivedAt: number;
  lastProgressAt: number;
  lastDistance: number;
  distanceRemaining: number;
  plannedDistance: number;
  requestId: number;
  version: number;
  failed: boolean;
  arrived: boolean;
  pending: boolean;
  crossingId: number;
  lane: number;
  yieldUntil: number;
  blockedSince: number;
  repathAfter: number;
  detourCount: number;
}

export interface ActorPose {
  hips: Point3;
  chest: Point3;
  head: Point3;
  leftShoulder: Point3;
  rightShoulder: Point3;
  leftElbow: Point3;
  rightElbow: Point3;
  leftHand: Point3;
  rightHand: Point3;
  leftKnee: Point3;
  rightKnee: Point3;
  leftAnkle: Point3;
  rightAnkle: Point3;
  leftFootPitch: number;
  rightFootPitch: number;
  headYaw: number;
  headPitch: number;
  chestYaw: number;
  chestPitch: number;
  breathing: number;
  leftFootPlanted: boolean;
  rightFootPlanted: boolean;
  eyeBlink: number;
  browLift: number;
  mouthOpen: number;
  smile: number;
}

export interface ActorGesture {
  kind: GestureKind;
  previous: GestureKind;
  startedAt: number;
  duration: number;
  intensity: number;
  blend: number;
  hand: "left" | "right" | "both";
  target: Point3;
  hasTarget: boolean;
  gazeId: number;
  gazePoint: Point2;
  gazeUntil: number;
  emotion: "neutral" | "happy" | "concerned" | "focused" | "tired";
}

export interface Actor {
  id: ActorId;
  name: string;
  age: AgeGroup;
  occupation: Occupation;
  mobility: Mobility;
  household: number;
  guardianId: number;
  dependentId: number;
  homeId: string;
  workplaceId: string;
  position: Point2;
  previousPosition: Point2;
  velocity: Point2;
  desiredVelocity: Point2;
  avoidance: Point2;
  heading: number;
  previousHeading: number;
  targetHeading: number;
  groundY: number;
  radius: number;
  speed: number;
  baseSpeed: number;
  acceleration: number;
  mass: number;
  mode: ActorMode;
  visible: boolean;
  interiorId: string;
  vehicleId: number;
  seatIndex: number;
  selected: boolean;
  needs: Needs;
  personality: Personality;
  appearance: Appearance;
  task: ActorTask | null;
  suspendedTask: ActorTask | null;
  schedule: ScheduleEntry[];
  scheduleDay: number;
  lastDecision: number;
  nextDecision: number;
  lastTaskCompleted: number;
  conversationId: number;
  groupId: number;
  inventory: InventoryItem[];
  relationships: Map<ActorId, Relationship>;
  memories: ActorMemory[];
  navigation: ActorNavigation;
  gesture: ActorGesture;
  pose: ActorPose;
  gaitPhase: number;
  strideDistance: number;
  fatigueDistance: number;
  wetness: number;
  warmth: number;
  shelterScore: number;
  umbrellaOpen: number;
  greetingCooldown: number;
  serviceCooldown: number;
  budget: number;
  dailySpending: number;
  health: number;
  random: RandomStream;
}

export interface SimulationTime {
  seconds: number;
  dt: number;
  tick: number;
  day: number;
  minute: number;
  hour: number;
  weekday: number;
  weekend: boolean;
  night: boolean;
  dawn: number;
  dusk: number;
  daylight: number;
  rush: number;
  lunchRush: number;
  schoolRush: number;
}

export interface LifeWeather {
  season: SeasonState["season"];
  temperature: number;
  precipitation: number;
  windX: number;
  windZ: number;
  gust: number;
  visibility: number;
  wetGround: number;
  snow: number;
  heatStress: number;
  coldStress: number;
  outdoorComfort: number;
}

export type VehicleKind = "bus" | "taxi" | "delivery" | "maintenance" | "ambulance" | "police" | "bicycle";
export interface LifeVehicle {
  id: number;
  kind: VehicleKind;
  position: Point2;
  previousPosition: Point2;
  heading: number;
  previousHeading: number;
  velocity: Point2;
  speed: number;
  targetSpeed: number;
  route: Point2[];
  routeCursor: number;
  distanceTravelled: number;
  wheelPhase: number;
  suspension: number;
  suspensionVelocity: number;
  steering: number;
  brake: number;
  turnSignal: number;
  doors: number;
  doorTarget: number;
  occupancy: number[];
  capacity: number;
  visible: boolean;
  interior: boolean;
  emergency: boolean;
  siren: boolean;
  stoppedUntil: number;
  driverId: number;
  serviceId: number;
  load: number;
  color: string;
}

export interface LifeAnimal {
  id: number;
  kind: "dog" | "bird";
  ownerId: number;
  position: Point2;
  previousPosition: Point2;
  velocity: Point2;
  heading: number;
  height: number;
  scale: number;
  gaitPhase: number;
  tailPhase: number;
  state: "following" | "sniffing" | "sitting" | "flying" | "pecking";
  stateUntil: number;
  target: Point2;
  color: string;
  visible: boolean;
}

export interface LifeStats {
  activeActors: number;
  walkingActors: number;
  queuedActors: number;
  seatedActors: number;
  conversations: number;
  completedTasks: number;
  completedTrips: number;
  completedDeliveries: number;
  completedRepairs: number;
  mealsServed: number;
  missedBuses: number;
  avoidedCollisions: number;
  routeFailures: number;
  droppedTime: number;
  frameTime: number;
}

export interface LifeContext {
  actors: Actor[];
  actorById: Map<number, Actor>;
  vehicles: LifeVehicle[];
  trafficObstacles: { x: number; z: number; radius: number; speed?: number; heading?: number }[];
  animals: LifeAnimal[];
  time: SimulationTime;
  weather: LifeWeather;
  places: PlaceDirectory;
  network: PedestrianNetwork;
  routes: RoutePlanner;
  reservations: DestinationReservations;
  queues: QueueManager;
  props: SceneProps;
  events: NeighborhoodEvents;
  neighbors: SpatialNeighbors;
  crossings: CrossingSignals;
  passages: BuildingPassages;
  stats: LifeStats;
  random: RandomStream;
  issueTask: (actor: Actor, kind: TaskKind, venueId: string, priority?: number) => boolean;
  completeTask: (actor: Actor, success?: boolean) => void;
  interruptTask: (actor: Actor, kind: TaskKind, venueId: string, priority: number) => boolean;
}

export interface LifeSystem {
  reset(context: LifeContext): void;
  tick(context: LifeContext): void;
  releaseActor(actor: Actor, context: LifeContext): void;
}
