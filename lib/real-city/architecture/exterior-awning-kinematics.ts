import type { Point } from "./context";

type MutablePoint = [number, number, number];

export type AwningArmPose = {
  shoulder: MutablePoint;
  elbow: MutablePoint;
  wrist: MutablePoint;
  cableStart: MutablePoint;
  cableEnd: MutablePoint;
  shoulderYaw: number;
  elbowYaw: number;
};

function makeArm(): AwningArmPose {
  return {
    shoulder: [0, 0, 0],
    elbow: [0, 0, 0],
    wrist: [0, 0, 0],
    cableStart: [0, 0, 0],
    cableEnd: [0, 0, 0],
    shoulderYaw: 0,
    elbowYaw: 0,
  };
}

function assign(point: MutablePoint, x: number, y: number, z: number): void {
  point[0] = x;
  point[1] = y;
  point[2] = z;
}

export class AwningKinematics {
  readonly left = makeArm();
  readonly right = makeArm();
  readonly front: MutablePoint = [0, 0, 0];
  readonly maximumProjection: number;
  readonly slope: number;
  readonly upperArmLength: number;
  readonly lowerArmLength: number;
  extension = 0;
  frontRoll = 0;
  frontPitch = 0;
  private readonly shoulderDistance: number;
  private readonly minimumReach: number;
  private windDeflection = 0;
  private lastSeconds = -Infinity;

  constructor(readonly width: number, requestedProjection: number, slope = 0.16) {
    this.maximumProjection = Math.min(requestedProjection, Math.max(0.3, width * 0.53));
    this.slope = Math.max(0.08, Math.min(0.3, slope));
    this.upperArmLength = this.maximumProjection * 0.535;
    this.lowerArmLength = this.maximumProjection * 0.535;
    this.shoulderDistance = width * 0.32;
    this.minimumReach = Math.max(0.035, Math.abs(this.upperArmLength - this.lowerArmLength) + 0.01);
  }

  update(fraction: number, acrossWind: number, normalWind: number, seconds: number): void {
    const reset = !Number.isFinite(this.lastSeconds) || seconds < this.lastSeconds;
    const dt = reset ? 0 : Math.max(0, Math.min(0.2, seconds - this.lastSeconds));
    this.lastSeconds = seconds;
    this.extension = Math.max(this.minimumReach, Math.min(this.maximumProjection, fraction * this.maximumProjection));
    const totalLength = this.upperArmLength + this.lowerArmLength;
    const maximumReach = Math.sqrt(Math.max(0.01, totalLength * totalLength - Math.pow(this.extension * this.slope + 0.025, 2)));
    this.extension = Math.min(this.extension, maximumReach * 0.985);
    const pressure = 0.5 * 1.225 * normalWind * Math.abs(normalWind);
    const exposedArea = this.width * this.extension;
    const restoringStiffness = 900 + 240 * this.width;
    const desiredDeflection = Math.max(-0.018, Math.min(0.018, pressure * exposedArea / restoringStiffness));
    if (reset) this.windDeflection = desiredDeflection;
    else this.windDeflection += (desiredDeflection - this.windDeflection) * Math.min(1, dt * 2.1);
    const drop = -this.extension * this.slope + this.windDeflection;
    assign(this.front, 0, drop - 0.025, 0.1 + this.extension);
    this.frontRoll = Math.max(-0.006, Math.min(0.006, acrossWind * this.extension / this.width * 0.0015));
    this.frontPitch = Math.atan2(-drop, this.extension);
    this.solveArm(-1, this.left, drop);
    this.solveArm(1, this.right, drop);
  }

  private solveArm(side: number, arm: AwningArmPose, drop: number): void {
    const x = side * this.shoulderDistance;
    const shoulderY = -0.08;
    const shoulderZ = 0.08;
    const wristY = drop - 0.055 + side * Math.sin(this.frontRoll) * this.shoulderDistance;
    const wristZ = 0.1 + this.extension;
    const dy = wristY - shoulderY;
    const dz = wristZ - shoulderZ;
    const distance = Math.max(0.001, Math.hypot(dy, dz));
    const along = (this.upperArmLength * this.upperArmLength - this.lowerArmLength * this.lowerArmLength + distance * distance) / (2 * distance);
    const lateral = Math.sqrt(Math.max(0, this.upperArmLength * this.upperArmLength - along * along));
    const elbowX = x - side * lateral;
    const elbowY = shoulderY + dy / distance * along;
    const elbowZ = shoulderZ + dz / distance * along;
    assign(arm.shoulder, x, shoulderY, shoulderZ);
    assign(arm.elbow, elbowX, elbowY, elbowZ);
    assign(arm.wrist, x, wristY, wristZ);
    assign(arm.cableStart, x, shoulderY + 0.005, shoulderZ);
    assign(arm.cableEnd, elbowX, elbowY - 0.025, elbowZ);
    arm.shoulderYaw = Math.atan2(elbowX - x, elbowZ - shoulderZ);
    arm.elbowYaw = Math.atan2(x - elbowX, wristZ - elbowZ);
  }

  canvasScale(): Point {
    return [1, Math.max(0.001, (this.extension * this.slope - this.windDeflection) / this.slope), this.extension];
  }
}
