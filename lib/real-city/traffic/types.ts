export type TrafficPoint = { x: number; z: number };

export type TrafficEdge = {
  from: TrafficPoint;
  to: TrafficPoint;
  ux: number;
  uz: number;
  len: number;
  heading: number;
};

export type TrafficRoute = {
  edges: readonly TrafficEdge[];
  totalLength: number;
  offset: number;
  speed: number;
  kind: string;
  shell: string;
};

export type TrafficPose = {
  x: number;
  z: number;
  heading: number;
  curvature: number;
  tangentScale: number;
  edgeIndex: number;
  along: number;
  toCorner: number;
  directionX: number;
  directionZ: number;
};

export type TrafficState = {
  distance: number;
  speed: number;
  acceleration: number;
  travelled: number;
  pose: TrafficPose;
  lateralAcceleration: number;
  braking: number;
  throttle: number;
  gear: number;
  engineRpm: number;
  stoppedSeconds: number;
  turnSignal: -1 | 0 | 1;
  indicatorOn: boolean;
  wiperPhase: number;
  wetTires: number;
  spray: number;
  headlightStrength: number;
  busDoorOpen: number;
  bodyHeave: number;
  bodyPitch: number;
  bodyRoll: number;
  wheelHeights: number[];
  wheelLoads: number[];
  wheelSteering: number[];
};

export type TrafficObstacle = {
  x: number;
  z: number;
  radius: number;
  until: number;
  /** 路边停靠的事件车辆 / 路中执勤人员：可绕行通过（变道让出空间），并按 slow 限速。 */
  passable?: boolean;
  slow?: number;
};

export type TrafficEnvironment = {
  night: boolean;
  wetness: number;
  snow: number;
  temperature: number;
  windX: number;
  windZ: number;
  obstacles: readonly TrafficObstacle[];
};

export type TrafficSpecification = {
  length: number;
  width: number;
  mass: number;
  wheelbase: number;
  wheelRadius: number;
  frontalArea: number;
  dragCoefficient: number;
  rollingResistance: number;
  enginePower: number;
  driveForce: number;
  brakeForce: number;
  comfortableAcceleration: number;
  comfortableBraking: number;
  maximumJerk: number;
  lateralAcceleration: number;
  idleRpm: number;
  maximumRpm: number;
  gearRatios: readonly number[];
  finalDrive: number;
};

export type TrafficLeader = {
  index: number;
  gap: number;
  speed: number;
  stopping: boolean;
};

export type TrafficSnapshot = {
  moving: number;
  stopped: number;
  averageSpeed: number;
  totalDistance: number;
  waitingAtSignals: number;
  yieldingToPeople: number;
};

export function newTrafficPose(): TrafficPose {
  return {
    x: 0,
    z: 0,
    heading: 0,
    curvature: 0,
    tangentScale: 1,
    edgeIndex: 0,
    along: 0,
    toCorner: 0,
    directionX: 0,
    directionZ: 1,
  };
}

export function newTrafficState(): TrafficState {
  return {
    distance: 0,
    speed: 0,
    acceleration: 0,
    travelled: 0,
    pose: newTrafficPose(),
    lateralAcceleration: 0,
    braking: 0,
    throttle: 0,
    gear: 1,
    engineRpm: 800,
    stoppedSeconds: 0,
    turnSignal: 0,
    indicatorOn: false,
    wiperPhase: 0,
    wetTires: 0,
    spray: 0,
    headlightStrength: 0,
    busDoorOpen: 0,
    bodyHeave: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    wheelHeights: [0, 0, 0, 0],
    wheelLoads: [0, 0, 0, 0],
    wheelSteering: [0, 0, 0, 0],
  };
}
