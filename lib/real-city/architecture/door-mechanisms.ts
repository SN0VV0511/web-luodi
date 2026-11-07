import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";

type TrackPoint = { y: number; z: number; tangent: number };

class DoorDrive {
  position = 0;
  velocity = 0;
  private previousTime = -1;
  private reverseUntil = 0;
  private stalledFor = 0;
  constructor(
    private readonly travel: number,
    private readonly maximumSpeed: number,
    private readonly acceleration: number,
  ) {}

  step(seconds: number, requested: number, occupied: boolean): number {
    if (this.previousTime < 0 || seconds < this.previousTime) {
      this.previousTime = seconds;
      this.velocity = 0;
      this.stalledFor = 0;
      this.reverseUntil = 0;
      return this.position;
    }
    const dt = Math.min(0.08, seconds - this.previousTime);
    this.previousTime = seconds;
    if (dt <= 0) return this.position;
    if (occupied && requested < this.position && this.position < this.travel * 0.75) {
      this.reverseUntil = seconds + 2.8;
      this.stalledFor = 0;
    }
    const target = seconds < this.reverseUntil ? this.travel : THREE.MathUtils.clamp(requested, 0, this.travel);
    const error = target - this.position;
    const brakingSpeed = Math.sqrt(2 * this.acceleration * Math.abs(error));
    const desiredSpeed = Math.sign(error) * Math.min(this.maximumSpeed, brakingSpeed);
    const change = THREE.MathUtils.clamp(desiredSpeed - this.velocity, -this.acceleration * dt, this.acceleration * dt);
    this.velocity += change;
    const displacement = this.velocity * dt;
    if (Math.abs(displacement) >= Math.abs(error) && displacement * error >= 0) {
      this.position = target;
      this.velocity = 0;
    } else {
      this.position = THREE.MathUtils.clamp(this.position + displacement, 0, this.travel);
    }
    if (Math.abs(error) > 0.03 && Math.abs(this.velocity) < 0.001) this.stalledFor += dt;
    else this.stalledFor = 0;
    if (this.stalledFor > 1) {
      this.reverseUntil = seconds + 1;
      this.stalledFor = 0;
    }
    return this.position;
  }
}

function drumArc(angle: number, radius: number, growth: number): number {
  if (growth < 1e-8) return radius * angle;
  const end = radius + growth * angle;
  const primitive = (value: number) => {
    const root = Math.sqrt(value * value + growth * growth);
    return (value * root + growth * growth * Math.log(value + root)) / (2 * growth);
  };
  return primitive(end) - primitive(radius);
}

function drumAngle(distance: number, radius: number, growth: number): number {
  if (distance <= 0) return 0;
  let angle = distance / Math.max(radius, 0.01);
  for (let iteration = 0; iteration < 5; iteration++) {
    const currentRadius = radius + growth * angle;
    const slope = Math.hypot(currentRadius, growth);
    const correction = (drumArc(angle, radius, growth) - distance) / slope;
    angle = Math.max(0, angle - correction);
    if (Math.abs(correction) < 1e-6) break;
  }
  return angle;
}

function rollingPoint(distance: number, height: number, radius: number, pitch: number, target: TrackPoint): void {
  if (distance <= height) {
    target.y = distance;
    target.z = 0;
    target.tangent = 0;
    return;
  }
  const growth = pitch / (Math.PI * 2);
  const angle = drumAngle(distance - height, radius, growth);
  const radial = radius + growth * angle;
  target.y = height + radial * Math.sin(angle);
  target.z = -radius + radial * Math.cos(angle);
  const dy = growth * Math.sin(angle) + radial * Math.cos(angle);
  const dz = growth * Math.cos(angle) - radial * Math.sin(angle);
  target.tangent = Math.atan2(dz, dy);
}

function setTrackTransform(group: THREE.Group, context: ArchitectureContext, point: TrackPoint, x: number): void {
  context.world([x, point.y, point.z], group.position);
  group.rotation.set(point.tangent, context.local.yaw ?? 0, 0, "YXZ");
}

function buildRollerShutterGuide(context: ArchitectureContext, width: number, height: number, drumRadius: number): void {
  const { steel, aluminum, rubber } = context.palette;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.035);
    context.box(aluminum, x, height / 2, -0.022, 0.078, height, 0.025);
    context.box(aluminum, x - side * 0.027, height / 2, 0.014, 0.022, height, 0.08);
    context.box(rubber, x - side * 0.045, height / 2, 0.017, 0.009, height, 0.045);
    context.box(aluminum, x, height + 0.08, -drumRadius, 0.06, drumRadius * 2.7, drumRadius * 2.5);
    for (const y of [0.3, height * 0.5, height - 0.3]) {
      context.box(steel, x, y, -0.045, 0.12, 0.09, 0.018);
      context.disc(steel, x, y + 0.013, 0.055, 0.008, 0.016);
    }
  }
  const bearing = context.geometry(new THREE.CylinderGeometry(1, 1, 1, 10));
  bearing.rotateZ(Math.PI / 2);
  context.part(steel, bearing, [0, height, -drumRadius], [width + 0.12, drumRadius * 0.8, drumRadius * 0.8]);
  context.box(aluminum, 0, height + drumRadius * 1.75, -drumRadius, width + 0.25, 0.035, drumRadius * 2.8);
  context.box(aluminum, 0, height + drumRadius * 0.55, drumRadius * 0.45, width + 0.25, drumRadius * 2.4, 0.025);
  context.box(steel, width / 2 + 0.13, height + 0.02, -drumRadius, 0.16, 0.25, 0.2);
  context.box(rubber, width / 2 + 0.15, height - 0.5, -0.09, 0.016, 0.68, 0.025);
  context.box(aluminum, width / 2 + 0.15, 1.15, 0.045, 0.1, 0.16, 0.045);
  context.box(context.palette.green, width / 2 + 0.15, 1.18, 0.075, 0.035, 0.03, 0.012);
  context.box(context.palette.red, width / 2 + 0.15, 1.12, 0.075, 0.035, 0.03, 0.012);
}

export function buildArticulatedRollerShutter(context: ArchitectureContext, width: number, height: number, phase: number): Animation {
  const { aluminum, steel, rubber, white } = context.palette;
  const count = Math.ceil(height / 0.135);
  const pitch = height / count;
  const radius = 0.13;
  const thickness = 0.014;
  buildRollerShutterGuide(context, width, height, radius);
  const slats: THREE.Group[] = [];
  for (let index = 0; index < count; index++) {
    const slat = context.moving("Articulated rolling shutter slat", [0, (index + 0.5) * pitch, 0], moving => {
      moving.box(aluminum, 0, 0, -0.004, width - 0.025, pitch - 0.009, thickness);
      moving.box(steel, 0, -pitch * 0.46, 0, width - 0.018, 0.012, thickness + 0.006);
      moving.box(aluminum, 0, pitch * 0.46, 0.004, width - 0.022, 0.012, thickness + 0.004);
      if (index % 3 === 1) moving.box(white, 0, pitch * 0.13, 0.006, width - 0.06, 0.008, 0.003);
      if (index === 0) {
        moving.box(steel, 0, -pitch * 0.46, 0, width + 0.015, 0.055, 0.065);
        moving.box(rubber, 0, -pitch * 0.7, 0, width + 0.01, 0.025, 0.055);
        for (const x of [-width * 0.25, width * 0.25]) moving.box(aluminum, x, -pitch * 0.32, 0.043, 0.14, 0.025, 0.025);
      }
    });
    slats.push(slat);
  }
  const drive = new DoorDrive(height + 0.025, 0.22, 0.3);
  const sense = context.doorSensor([0, 0.35, 0.55], Math.max(1.5, width * 0.3), 3);
  const sample: TrackPoint = { y: 0, z: 0, tangent: 0 };
  const status = context.moving("Security shutter motion indicator", [width / 2 + 0.15, 1.24, 0.075], moving => {
    moving.box(context.palette.yellow, 0, 0, 0, 0.03, 0.015, 0.012);
  });
  let initialized = false;
  return (seconds, night) => {
    const presence = sense(seconds) > 0.1;
    const request = !night || presence ? height + 0.025 : 0;
    if (!initialized) {
      drive.position = request;
      initialized = true;
    }
    const lift = drive.step(seconds, request, presence);
    for (let index = 0; index < slats.length; index++) {
      rollingPoint((index + 0.5) * pitch + lift, height, radius, thickness + 0.002, sample);
      setTrackTransform(slats[index], context, sample, 0);
    }
    status.visible = Math.abs(drive.velocity) > 0.002 && Math.sin(seconds * 8 + phase) > 0;
  };
}

class SectionalTrack {
  readonly bendStart: number;
  readonly bendLength: number;
  constructor(readonly height: number, readonly radius: number) {
    this.bendStart = height - radius;
    this.bendLength = radius * Math.PI * 0.5;
  }

  sample(distance: number, target: TrackPoint): void {
    if (distance < this.bendStart) {
      target.y = distance;
      target.z = 0;
      target.tangent = 0;
      return;
    }
    const curved = distance - this.bendStart;
    if (curved < this.bendLength) {
      const angle = curved / this.radius;
      target.y = this.bendStart + this.radius * Math.sin(angle);
      target.z = -this.radius + this.radius * Math.cos(angle);
      target.tangent = -angle;
      return;
    }
    target.y = this.height;
    target.z = -this.radius - (curved - this.bendLength);
    target.tangent = -Math.PI / 2;
  }

  panel(lower: number, length: number, target: TrackPoint): number {
    const bottom: TrackPoint = { y: 0, z: 0, tangent: 0 };
    const top: TrackPoint = { y: 0, z: 0, tangent: 0 };
    this.sample(lower, bottom);
    let arcLength = length;
    for (let iteration = 0; iteration < 4; iteration++) {
      this.sample(lower + arcLength, top);
      const chord = Math.hypot(top.y - bottom.y, top.z - bottom.z);
      if (chord < 1e-7) break;
      const error = length - chord;
      arcLength += error;
      if (Math.abs(error) < 1e-5) break;
    }
    this.sample(lower + arcLength, top);
    target.y = (bottom.y + top.y) / 2;
    target.z = (bottom.z + top.z) / 2;
    target.tangent = Math.atan2(top.z - bottom.z, top.y - bottom.y);
    return lower + arcLength;
  }
}

function buildSectionalTracks(context: ArchitectureContext, width: number, height: number, depth: number, track: SectionalTrack): void {
  const { steel, aluminum, rubber } = context.palette;
  for (const side of [-1, 1]) {
    const x = side * (width / 2 + 0.045);
    const path: Point[] = [[x, 0, 0], [x, track.bendStart, 0]];
    for (let step = 1; step <= 10; step++) {
      const point: TrackPoint = { y: 0, z: 0, tangent: 0 };
      track.sample(track.bendStart + track.bendLength * step / 10, point);
      path.push([x, point.y, point.z]);
    }
    path.push([x, height, -depth]);
    context.tube(aluminum, path, 0.026);
    const inner: Point[] = path.map(([px, py, pz]) => [px - side * 0.04, py, pz]);
    context.tube(steel, inner, 0.012);
    context.box(rubber, x - side * 0.075, track.bendStart / 2, 0.052, 0.02, track.bendStart, 0.015);
    for (const z of [-0.65, -depth * 0.52, -depth + 0.08]) {
      context.box(steel, x, height + 0.14, z, 0.045, 0.28, 0.05);
      context.box(steel, x, height + 0.27, z, 0.18, 0.02, 0.13);
      for (const dx of [-0.055, 0.055]) context.disc(aluminum, x + dx, height + 0.285, z, 0.009, 0.015);
    }
    context.box(steel, x, track.bendStart * 0.5, -0.055, 0.06, track.bendStart, 0.025);
    context.box(aluminum, x, 0.025, -0.025, 0.14, 0.05, 0.14);
    context.box(rubber, x, height, -depth - 0.035, 0.09, 0.07, 0.08);
  }
}

function buildGarageOperator(context: ArchitectureContext, width: number, height: number, depth: number): { trolley: THREE.Group; indicator: THREE.Group; rest: THREE.Vector3 } {
  const { steel, aluminum, rubber, white, warmLight } = context.palette;
  const rear = -Math.min(depth - 0.15, height + 0.7);
  context.box(steel, 0, height + 0.15, rear / 2, 0.065, 0.08, -rear);
  context.box(rubber, 0, height + 0.192, rear / 2, 0.016, 0.014, -rear - 0.1);
  context.roundedBox(white, 0, height + 0.16, rear, 0.34, 0.2, 0.42, 0.07);
  context.box(warmLight, 0, height + 0.045, rear + 0.07, 0.26, 0.02, 0.19);
  context.box(aluminum, 0, height + 0.28, rear, 0.4, 0.05, 0.1);
  for (const x of [-0.16, 0.16]) context.box(aluminum, x, height + 0.37, rear, 0.025, 0.17, 0.045);
  const trolley = context.moving("Garage operator belt trolley", [0, height + 0.12, -0.12], moving => {
    moving.box(aluminum, 0, 0, 0, 0.14, 0.08, 0.22);
    moving.beam(steel, [0, -0.035, 0.03], [0, -0.23, 0.2], 0.018);
    moving.box(context.palette.red, 0, -0.46, 0.11, 0.04, 0.1, 0.04);
    moving.beam(rubber, [0, -0.04, 0.09], [0, -0.41, 0.11], 0.004);
  });
  const indicator = context.moving("Garage operator status lamp", [width / 2 + 0.14, 1.35, 0.05], moving => {
    moving.box(context.palette.green, 0, 0, 0, 0.035, 0.018, 0.018);
  });
  context.box(steel, width / 2 + 0.14, 1.28, 0.03, 0.09, 0.18, 0.045);
  context.box(white, width / 2 + 0.14, 1.26, 0.058, 0.055, 0.055, 0.015);
  return { trolley, indicator, rest: trolley.position.clone() };
}

function buildTorsionCounterbalance(context: ArchitectureContext, width: number, height: number): { axle: THREE.Group; cables: THREE.Group[]; cableRest: THREE.Vector3[] } {
  const { steel, aluminum, rubber } = context.palette;
  const geometry = context.geometry(new THREE.CylinderGeometry(1, 1, 1, 12));
  geometry.rotateZ(Math.PI / 2);
  const axle = context.moving("Sectional door torsion shaft", [0, height + 0.05, -0.28], moving => {
    moving.part(aluminum, geometry, [0, 0, 0], [width + 0.1, 0.018, 0.018]);
    for (const side of [-1, 1]) {
      moving.part(steel, geometry, [side * width * 0.44, 0, 0], [0.1, 0.08, 0.08]);
      moving.part(aluminum, geometry, [side * width * 0.44, 0, 0], [0.012, 0.087, 0.087]);
      moving.box(context.palette.yellow, side * width * 0.44, 0.082, 0, 0.09, 0.008, 0.018);
    }
  });
  const springPoints: Point[] = [];
  const turns = 18;
  for (let index = 0; index <= turns * 6; index++) {
    const phase = index / 6 * Math.PI * 2;
    springPoints.push([-0.5 + index / (turns * 6), Math.cos(phase) * 0.055 + height + 0.05, Math.sin(phase) * 0.055 - 0.28]);
  }
  context.tube(steel, springPoints, 0.009);
  for (const x of [-width * 0.47, 0, width * 0.47]) {
    context.box(steel, x, height + 0.05, -0.37, 0.075, 0.16, 0.08);
    context.box(aluminum, x, height + 0.05, -0.435, 0.16, 0.24, 0.025);
  }
  const cables = [-1, 1].map(side => context.moving("Sectional door lifting cable", [side * width * 0.44, height + 0.05, -0.2], moving => {
    moving.box(rubber, 0, -0.5, 0, 0.008, 1, 0.008);
  }));
  return { axle, cables, cableRest: cables.map(cable => cable.position.clone()) };
}

export function buildTrackedGarageDoor(context: ArchitectureContext, width: number, height: number, phase: number): Animation {
  const { steel, aluminum, white, glass, rubber } = context.palette;
  const panelCount = 5;
  const panelHeight = height / panelCount;
  const trackHeight = height + 0.12;
  const track = new SectionalTrack(trackHeight, 0.28);
  const depth = height + 0.65;
  buildSectionalTracks(context, width, trackHeight, depth, track);
  const operator = buildGarageOperator(context, width, trackHeight, depth);
  const counterbalance = buildTorsionCounterbalance(context, width, height);
  const rollerGeometry = context.geometry(new THREE.CylinderGeometry(1, 1, 1, 8));
  rollerGeometry.rotateZ(Math.PI / 2);
  const panels: THREE.Group[] = [];
  for (let index = 0; index < panelCount; index++) {
    panels.push(context.moving("Rigid sectional garage panel", [0, (index + 0.5) * panelHeight, 0], moving => {
      if (index !== 3) moving.box(white, 0, 0, 0, width - 0.035, panelHeight - 0.015, 0.055);
      else {
        const bandHeight = panelHeight * 0.22;
        for (const side of [-1, 1]) moving.box(white, 0, side * panelHeight * 0.38, 0, width - 0.035, bandHeight, 0.055);
        const holes = [-1, 0, 1].map(column => ({ left: column * width * 0.26 - width * 0.1, right: column * width * 0.26 + width * 0.1 }));
        let left = -width / 2 + 0.0175;
        for (const hole of holes) {
          moving.box(white, (left + hole.left) / 2, 0, 0, hole.left - left, panelHeight * 0.56, 0.055);
          left = hole.right;
        }
        moving.box(white, (left + width / 2 - 0.0175) / 2, 0, 0, width / 2 - 0.0175 - left, panelHeight * 0.56, 0.055);
      }
      moving.box(rubber, 0, -panelHeight * 0.48, 0.002, width - 0.015, 0.016, 0.045);
      for (const side of [-1, 1]) {
        moving.box(aluminum, side * width * 0.43, 0, -0.038, 0.065, panelHeight - 0.03, 0.025);
        for (const y of [-panelHeight * 0.45, panelHeight * 0.45]) {
          moving.part(steel, rollerGeometry, [side * (width / 2 + 0.025), y, 0], [0.055, 0.029, 0.029]);
          moving.box(aluminum, side * width * 0.45, y, -0.045, 0.09, 0.055, 0.02);
        }
      }
      for (const x of [-width * 0.25, 0, width * 0.25]) {
        moving.box(steel, x, panelHeight * 0.43, -0.045, 0.05, 0.06, 0.024);
        moving.box(aluminum, x, panelHeight * 0.48, -0.057, 0.075, 0.025, 0.025);
      }
      if (index === 3) {
        for (const column of [-1, 0, 1]) {
          for (const edge of [-1, 1]) {
            moving.box(rubber, column * width * 0.26 + edge * width * 0.095, 0, 0.029, 0.018, panelHeight * 0.57, 0.02);
            moving.box(rubber, column * width * 0.26, edge * panelHeight * 0.265, 0.029, width * 0.2, 0.018, 0.02);
          }
          moving.box(glass, column * width * 0.26, 0, 0.048, width * 0.18, panelHeight * 0.45, 0.018);
        }
      } else {
        for (const column of [-1, 1]) {
          moving.box(aluminum, column * width * 0.24, panelHeight * 0.26, 0.033, width * 0.42, 0.009, 0.008);
          moving.box(aluminum, column * width * 0.24, -panelHeight * 0.26, 0.033, width * 0.42, 0.009, 0.008);
        }
      }
      if (index === 0) {
        moving.box(rubber, 0, -panelHeight * 0.5, 0, width, 0.025, 0.07);
        moving.box(aluminum, 0, 0.05, 0.065, 0.16, 0.025, 0.03);
      }
    }));
  }
  const maximumTravel = track.bendStart + track.bendLength + 0.035;
  const drive = new DoorDrive(maximumTravel, 0.23, 0.32);
  const sense = context.doorSensor([0, 0.4, 0.5], Math.max(1.7, width * 0.55), 5);
  const sample: TrackPoint = { y: 0, z: 0, tangent: 0 };
  const backward = new THREE.Vector3(-Math.sin(context.local.yaw ?? 0), 0, -Math.cos(context.local.yaw ?? 0));
  const shaftYaw = counterbalance.axle.rotation.y;
  return seconds => {
    const requested = sense(seconds);
    const travel = drive.step(seconds, requested * maximumTravel, requested > 0.1);
    let panelStart = travel;
    for (let index = 0; index < panels.length; index++) {
      panelStart = track.panel(panelStart, panelHeight, sample);
      setTrackTransform(panels[index], context, sample, 0);
    }
    operator.trolley.position.copy(operator.rest).addScaledVector(backward, travel * (depth - 0.25) / maximumTravel);
    operator.indicator.visible = Math.abs(drive.velocity) < 0.003 || Math.sin(seconds * 7 + phase) > 0;
    counterbalance.axle.rotation.set(travel / 0.08, shaftYaw, 0, "YXZ");
    const cableLength = Math.max(0.08, height - Math.min(travel, height));
    for (let index = 0; index < counterbalance.cables.length; index++) {
      counterbalance.cables[index].position.copy(counterbalance.cableRest[index]);
      counterbalance.cables[index].scale.y = cableLength;
    }
  };
}
