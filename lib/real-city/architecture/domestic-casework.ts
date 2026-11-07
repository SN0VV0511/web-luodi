import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";

type CabinetBay = { left: number; right: number; center: number; width: number; sink: boolean; drawers: boolean };
type CabinetOpening = { x: number; z: number; width: number; depth: number; radius: number };

type CabinetAccess = {
  requesting: boolean;
  requestedAt: number;
  updatedAt: number;
  opening: number;
  servedAt: number;
};

class CabinetAccessInterlock {
  private readonly panels = new Map<number, CabinetAccess>();
  private active = -1;
  private previous = -1;

  private panel(id: number, seconds: number): CabinetAccess {
    let panel = this.panels.get(id);
    if (!panel) {
      panel = {
        requesting: false,
        requestedAt: seconds,
        updatedAt: seconds,
        opening: 0,
        servedAt: -Infinity,
      };
      this.panels.set(id, panel);
    }
    return panel;
  }

  private reset(seconds: number): void {
    this.active = -1;
    for (const panel of this.panels.values()) {
      panel.requesting = false;
      panel.requestedAt = seconds;
      panel.updatedAt = seconds;
      panel.opening = 0;
      panel.servedAt = -Infinity;
    }
  }

  request(id: number, requested: boolean, seconds: number): boolean {
    if (this.previous > seconds) this.reset(seconds);
    this.previous = seconds;
    const panel = this.panel(id, seconds);
    if (requested && !panel.requesting) panel.requestedAt = seconds;
    panel.requesting = requested;
    panel.updatedAt = seconds;
    if (this.active >= 0) {
      const owner = this.panels.get(this.active);
      if (!owner || seconds - owner.updatedAt > 2) this.active = -1;
      else if (!owner.requesting && owner.opening < 0.012) {
        owner.servedAt = seconds;
        this.active = -1;
      }
    }
    if (this.active < 0) {
      let selected = -1;
      let earliest = Infinity;
      for (const [candidateId, candidate] of this.panels) {
        if (!candidate.requesting || seconds - candidate.updatedAt > 0.2) continue;
        const order = candidate.requestedAt + (seconds - candidate.servedAt < 1 ? 1 : 0);
        if (order < earliest) {
          selected = candidateId;
          earliest = order;
        }
      }
      this.active = selected;
    }
    return this.active === id && panel.requesting;
  }

  settle(id: number, opening: number, seconds: number): void {
    const panel = this.panel(id, seconds);
    panel.opening = Math.max(0, opening);
    panel.updatedAt = seconds;
    if (this.active !== id && panel.opening > 0.012) {
      const activePanel = this.panels.get(this.active);
      if (!activePanel || activePanel.opening < 0.012) this.active = id;
    }
  }
}

function roundedPath(path: THREE.Shape | THREE.Path, x: number, z: number, width: number, depth: number, radius: number, clockwise: boolean): void {
  const left = x - width / 2;
  const right = x + width / 2;
  const back = z - depth / 2;
  const front = z + depth / 2;
  const r = Math.max(0.001, Math.min(radius, width / 2, depth / 2));
  if (!clockwise) {
    path.moveTo(left + r, back);
    path.lineTo(right - r, back);
    path.quadraticCurveTo(right, back, right, back + r);
    path.lineTo(right, front - r);
    path.quadraticCurveTo(right, front, right - r, front);
    path.lineTo(left + r, front);
    path.quadraticCurveTo(left, front, left, front - r);
    path.lineTo(left, back + r);
    path.quadraticCurveTo(left, back, left + r, back);
  } else {
    path.moveTo(left + r, back);
    path.quadraticCurveTo(left, back, left, back + r);
    path.lineTo(left, front - r);
    path.quadraticCurveTo(left, front, left + r, front);
    path.lineTo(right - r, front);
    path.quadraticCurveTo(right, front, right, front - r);
    path.lineTo(right, back + r);
    path.quadraticCurveTo(right, back, right - r, back);
    path.lineTo(left + r, back);
  }
  path.closePath();
}

export function buildPerforatedCountertop(context: ArchitectureContext, material: THREE.Material, width: number, depth: number, thickness: number, openings: readonly CabinetOpening[]): void {
  const outline = new THREE.Shape();
  roundedPath(outline, 0, 0, width, depth, 0.018, false);
  for (const opening of openings) {
    const left = Math.max(-width / 2 + 0.015, opening.x - opening.width / 2);
    const right = Math.min(width / 2 - 0.015, opening.x + opening.width / 2);
    const back = Math.max(-depth / 2 + 0.015, opening.z - opening.depth / 2);
    const front = Math.min(depth / 2 - 0.015, opening.z + opening.depth / 2);
    if (right - left < 0.025 || front - back < 0.025) continue;
    const hole = new THREE.Path();
    roundedPath(hole, (left + right) / 2, (back + front) / 2, right - left, front - back, opening.radius, true);
    outline.holes.push(hole);
  }
  const geometry = context.geometry(new THREE.ExtrudeGeometry(outline, { depth: thickness, bevelEnabled: false, curveSegments: 6 }));
  geometry.rotateX(-Math.PI / 2);
  context.part(material, geometry, [0, 0, 0]);
}

function cabinetBays(width: number, ovenX: number, dishwasherX?: number): CabinetBay[] {
  const ovenHalf = 0.315;
  const excluded = [{ left: ovenX - ovenHalf, right: ovenX + ovenHalf }];
  if (dishwasherX !== undefined) excluded.push({ left: dishwasherX - 0.31, right: dishwasherX + 0.31 });
  excluded.sort((a, b) => a.left - b.left);
  const spans: number[][] = [];
  let cursor = -width / 2 + 0.02;
  for (const opening of excluded) {
    if (opening.left > cursor) spans.push([cursor, opening.left]);
    cursor = Math.max(cursor, opening.right);
  }
  if (cursor < width / 2 - 0.02) spans.push([cursor, width / 2 - 0.02]);
  const result: CabinetBay[] = [];
  for (const [start, end] of spans) {
    if (end - start < 0.12) continue;
    const count = Math.max(1, Math.round((end - start) / 0.57));
    for (let index = 0; index < count; index++) {
      const left = start + (end - start) * index / count;
      const right = start + (end - start) * (index + 1) / count;
      const center = (left + right) / 2;
      const sink = Math.abs(center + width * 0.24) < (right - left) / 2 + 0.2;
      result.push({ left, right, center, width: right - left, sink, drawers: !sink && right - left > 0.35 });
    }
  }
  return result;
}

function buildCarcass(context: ArchitectureContext, width: number, height: number, bays: readonly CabinetBay[]): void {
  const { white, dark, aluminum } = context.palette;
  context.box(dark, 0, 0.055, -0.055, width - 0.05, 0.11, 0.47);
  context.box(white, 0, 0.125, -0.015, width, 0.025, 0.55);
  context.box(white, 0, height - 0.04, -0.245, width, 0.055, 0.055);
  context.box(white, 0, height - 0.04, 0.235, width, 0.055, 0.055);
  context.box(white, 0, (height + 0.13) / 2, -0.29, width, height - 0.13, 0.015);
  const boundaries = new Set<number>([-width / 2, width / 2]);
  for (const bay of bays) {
    boundaries.add(bay.left);
    boundaries.add(bay.right);
  }
  for (const x of boundaries) {
    context.box(white, x, (height + 0.13) / 2, -0.015, 0.018, height - 0.13, 0.55);
    for (const y of [0.32, 0.46, 0.6, 0.74]) {
      for (const z of [-0.19, 0.15]) context.box(aluminum, x + 0.009, y, z, 0.004, 0.004, 0.004);
    }
  }
  const feet = Math.max(3, Math.ceil(width / 0.65));
  for (let foot = 0; foot < feet; foot++) {
    const x = -width / 2 + 0.1 + foot * (width - 0.2) / Math.max(1, feet - 1);
    for (const z of [-0.2, 0.2]) context.disc(dark, x, 0.065, z, 0.018, 0.11);
  }
}

function buildConcealedHinge(context: ArchitectureContext, x: number, y: number, side: number): (angle: number) => void {
  const { aluminum, steel } = context.palette;
  context.box(aluminum, x, y, 0.245, 0.035, 0.065, 0.025);
  context.box(steel, x - side * 0.018, y, 0.215, 0.028, 0.025, 0.06);
  context.box(aluminum, x - side * 0.035, y, 0.19, 0.055, 0.035, 0.022);
  for (const offset of [-0.02, 0.02]) context.box(steel, x, y + offset, 0.26, 0.007, 0.007, 0.003);
  const hingeOrigin = x - 0.015;
  const framePin = new THREE.Vector2(x + 0.007, 0.215);
  const doorPin = new THREE.Vector2();
  const elbow = new THREE.Vector2();
  const firstLength = 0.055;
  const secondLength = 0.062;
  const links = [firstLength, secondLength].map(length => context.moving("Concealed cabinet hinge articulated link", [x, y, 0.23], moving => {
    moving.box(aluminum, 0, 0, 0, 0.012, 0.013, 1);
    moving.box(steel, 0, 0.008, 0, 0.006, 0.004, 0.8);
  }));
  const hingePin = context.moving("Concealed cabinet hinge pivot pin", [x, y, 0.24], moving => {
    moving.disc(aluminum, 0, 0, 0, 0.009, 0.026);
    moving.disc(steel, 0, 0.015, 0, 0.004, 0.004);
  });
  const cup = context.moving("Cabinet hinge door cup", [x, y, 0.26], moving => {
    moving.box(aluminum, 0, 0, 0, 0.045, 0.045, 0.01);
    moving.oval(steel, 0, 0, 0.005, 0.017, 0.017, 0.005);
    moving.box(aluminum, 0, 0.003, 0.009, 0.029, 0.009, 0.012);
  });
  const start = new THREE.Vector3();
  const finish = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const longitudinal = new THREE.Vector3(0, 0, 1);
  const orient = (group: THREE.Group, a: THREE.Vector2, b: THREE.Vector2) => {
    context.world([a.x, y, a.y], start);
    context.world([b.x, y, b.y], finish);
    direction.copy(finish).sub(start);
    const length = direction.length();
    group.position.copy(start).addScaledVector(direction, 0.5);
    if (length > 1e-7) group.quaternion.setFromUnitVectors(longitudinal, direction.divideScalar(length));
    group.scale.z = Math.max(0.001, length);
  };
  return angle => {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    doorPin.set(hingeOrigin + 0.044 * cosine + 0.025 * sine, 0.278 + 0.044 * sine - 0.025 * cosine);
    const dx = doorPin.x - framePin.x;
    const dz = doorPin.y - framePin.y;
    const actualDistance = Math.hypot(dx, dz);
    const reach = THREE.MathUtils.clamp(actualDistance, Math.abs(firstLength - secondLength) + 0.0001, firstLength + secondLength - 0.0001);
    const axisX = actualDistance > 1e-7 ? dx / actualDistance : 1;
    const axisZ = actualDistance > 1e-7 ? dz / actualDistance : 0;
    const along = (firstLength * firstLength - secondLength * secondLength + reach * reach) / (2 * reach);
    const sideways = Math.sqrt(Math.max(0, firstLength * firstLength - along * along));
    elbow.set(framePin.x + axisX * along - axisZ * sideways, framePin.y + axisZ * along + axisX * sideways);
    orient(links[0], framePin, elbow);
    orient(links[1], elbow, doorPin);
    context.world([elbow.x, y, elbow.y], hingePin.position);
    context.world([doorPin.x, y, doorPin.y], cup.position);
    cup.rotation.y = (context.local.yaw ?? 0) - angle;
  };
}

function buildCabinetShelfContents(context: ArchitectureContext, bay: CabinetBay): void {
  const { porcelain, aluminum, white, dark, green } = context.palette;
  const shelfY = 0.49;
  context.box(white, bay.center, shelfY, -0.015, bay.width - 0.035, 0.018, 0.49);
  for (let plate = 0; plate < 4; plate++) {
    context.disc(porcelain, bay.center - bay.width * 0.12, shelfY + 0.018 + plate * 0.012, 0.03, Math.min(0.105, bay.width * 0.25), 0.01);
  }
  context.disc(aluminum, bay.center + bay.width * 0.2, 0.225, -0.08, Math.min(0.09, bay.width * 0.2), 0.15);
  context.disc(dark, bay.center + bay.width * 0.2, 0.305, -0.08, Math.min(0.08, bay.width * 0.18), 0.01);
  context.box(green, bay.center - bay.width * 0.23, 0.25, -0.12, bay.width * 0.23, 0.2, 0.13);
  for (const x of [bay.left + 0.045, bay.right - 0.045]) {
    context.box(aluminum, x, shelfY - 0.015, 0.13, 0.018, 0.02, 0.028);
    context.box(aluminum, x, shelfY - 0.015, -0.18, 0.018, 0.02, 0.028);
  }
}

function buildUnderSink(context: ArchitectureContext, bay: CabinetBay): void {
  const { aluminum, white, dark, green } = context.palette;
  const sinkX = THREE.MathUtils.clamp(bay.center, bay.left + 0.12, bay.right - 0.12);
  context.tube(white, [[sinkX, 0.76, 0.03], [sinkX, 0.53, 0.03], [sinkX + 0.07, 0.43, -0.02], [sinkX + 0.14, 0.5, -0.1], [sinkX + 0.14, 0.51, -0.25]], 0.021);
  for (const side of [-1, 1]) {
    const x = sinkX + side * 0.08;
    context.tube(aluminum, [[x, 0.58, -0.25], [x, 0.74, -0.2], [x * 0.5 + sinkX * 0.5, 0.87, -0.16]], 0.006);
    context.box(aluminum, x, 0.58, -0.24, 0.035, 0.035, 0.035);
    context.box(side < 0 ? context.palette.red : context.palette.green, x, 0.6, -0.23, 0.04, 0.012, 0.015);
  }
  context.box(dark, bay.left + bay.width * 0.25, 0.26, 0.03, bay.width * 0.32, 0.23, 0.29);
  context.box(green, bay.right - bay.width * 0.23, 0.25, 0.08, 0.08, 0.22, 0.08);
  context.box(white, bay.right - bay.width * 0.23, 0.37, 0.08, 0.04, 0.035, 0.04);
}

function buildCabinetDoor(context: ArchitectureContext, materials: ArchitecturalMaterials, bay: CabinetBay, height: number, access: CabinetAccessInterlock, panelId: number): Animation {
  const { aluminum, rubber } = context.palette;
  const hingeX = bay.left + 0.01;
  const doorWidth = bay.width - 0.02;
  const leaf = context.moving("Kitchen soft-close cabinet door", [hingeX, 0.14, 0.278], moving => {
    moving.box(materials.timber, doorWidth / 2, (height - 0.16) / 2, 0, doorWidth, height - 0.16, 0.025);
    moving.box(aluminum, doorWidth - 0.055, height * 0.55, 0.031, 0.013, 0.16, 0.022);
    for (const y of [0.13, height - 0.29]) {
      moving.box(aluminum, 0.033, y, -0.017, 0.055, 0.05, 0.016);
      moving.oval(aluminum, 0.045, y, -0.02, 0.018, 0.018, 0.005);
    }
    for (const y of [0.04, height - 0.2]) moving.box(rubber, doorWidth - 0.025, y, -0.017, 0.01, 0.01, 0.008);
  });
  const hinges = [
    buildConcealedHinge(context, bay.left + 0.025, 0.27, -1),
    buildConcealedHinge(context, bay.left + 0.025, height - 0.15, -1),
  ];
  if (bay.sink) buildUnderSink(context, bay);
  else buildCabinetShelfContents(context, bay);
  const sensor = context.doorSensor([bay.center, 0, 0.75], 0.55, 0.8);
  const yaw = leaf.rotation.y;
  let angle = 0;
  let previous = -1;
  return seconds => {
    const dt = previous < 0 ? 0 : Math.min(0.08, Math.max(0, seconds - previous));
    previous = seconds;
    const allowed = access.request(panelId, sensor(seconds) > 0.65, seconds);
    const desired = allowed ? 1.25 : 0;
    const speed = desired > angle ? 0.75 : angle < 0.25 ? 0.15 : 0.7;
    angle += THREE.MathUtils.clamp(desired - angle, -dt * speed, dt * speed);
    leaf.rotation.y = yaw - angle;
    for (const hinge of hinges) hinge(angle);
    access.settle(panelId, angle, seconds);
  };
}

function buildDrawerRail(context: ArchitectureContext, x: number, y: number): (extension: number) => void {
  const { aluminum, steel } = context.palette;
  context.box(aluminum, x, y, -0.015, 0.018, 0.035, 0.46);
  context.box(steel, x, y + 0.014, -0.015, 0.01, 0.008, 0.42);
  for (const z of [-0.2, 0, 0.19]) context.box(steel, x + 0.008, y, z, 0.004, 0.012, 0.012);
  const middle = context.moving("Drawer telescopic intermediate slide", [x, y - 0.003, -0.015], moving => {
    moving.box(aluminum, 0, 0, 0, 0.012, 0.024, 0.4);
    for (const side of [-1, 1]) moving.box(steel, 0, side * 0.011, 0, 0.012, 0.006, 0.4);
    for (const z of [-0.16, -0.08, 0, 0.08, 0.16]) moving.oval(aluminum, 0, 0.006, z, 0.005, 0.005, 0.005);
  });
  const inner = context.moving("Drawer telescopic inner slide", [x, y - 0.007, -0.015], moving => {
    moving.box(steel, 0, 0, 0, 0.008, 0.014, 0.37);
    moving.box(context.palette.dark, 0.006, 0.002, 0.16, 0.008, 0.018, 0.035);
    moving.box(aluminum, 0.009, 0.016, 0.02, 0.025, 0.016, 0.1);
  });
  const piston = context.moving("Drawer soft-close damper rod", [x, y - 0.015, -0.15], moving => {
    moving.box(aluminum, 0, 0, 0.06, 0.006, 0.006, 0.12);
  });
  context.box(context.palette.dark, x, y - 0.015, -0.2, 0.023, 0.025, 0.12);
  const middleRest = middle.position.clone();
  const innerRest = inner.position.clone();
  const pistonRest = piston.position.clone();
  const forward = new THREE.Vector3(Math.sin(context.local.yaw ?? 0), 0, Math.cos(context.local.yaw ?? 0));
  return extension => {
    const travel = THREE.MathUtils.clamp(extension, 0, 0.38);
    middle.position.copy(middleRest).addScaledVector(forward, travel * 0.5);
    inner.position.copy(innerRest).addScaledVector(forward, travel);
    piston.position.copy(pistonRest).addScaledVector(forward, Math.min(0.07, travel));
  };
}

function buildCutleryTray(context: ArchitectureContext, width: number): void {
  const { oak, aluminum, dark } = context.palette;
  context.box(oak, 0, 0, 0, width, 0.014, 0.35);
  for (let channel = 0; channel < 4; channel++) {
    const x = -width / 2 + (channel + 0.5) * width / 4;
    if (channel > 0) context.box(oak, x - width / 8, 0.02, 0, 0.008, 0.04, 0.35);
    for (let utensil = 0; utensil < 2; utensil++) {
      const offset = (utensil - 0.5) * 0.02;
      context.box(aluminum, x + offset, 0.016, 0, 0.008, 0.004, 0.21);
      if (channel % 2) context.oval(aluminum, x + offset, 0.019, -0.12, 0.012, 0.004, 0.022);
      else context.box(dark, x + offset, 0.017, 0.08, 0.012, 0.008, 0.08);
    }
  }
}

function buildKitchenDrawers(context: ArchitectureContext, materials: ArchitecturalMaterials, bay: CabinetBay, height: number, access: CabinetAccessInterlock, panelId: number): Animation {
  const drawers: THREE.Group[] = [];
  const origins: THREE.Vector3[] = [];
  const railUpdates: ((extension: number) => void)[][] = [];
  const count = 3;
  const drawerHeight = (height - 0.17) / count;
  for (let row = 0; row < count; row++) {
    const y = 0.15 + row * drawerHeight;
    const drawer = context.moving("Kitchen full-extension drawer", [bay.center, y, 0.27], moving => {
      moving.box(materials.timber, 0, drawerHeight / 2, 0, bay.width - 0.022, drawerHeight - 0.012, 0.025);
      moving.box(context.palette.white, 0, 0.018, -0.22, bay.width - 0.065, 0.018, 0.43);
      for (const side of [-1, 1]) moving.box(context.palette.aluminum, side * (bay.width / 2 - 0.033), drawerHeight * 0.3, -0.22, 0.012, drawerHeight * 0.55, 0.43);
      moving.box(context.palette.white, 0, drawerHeight * 0.3, -0.425, bay.width - 0.065, drawerHeight * 0.55, 0.015);
      moving.box(context.palette.aluminum, 0, drawerHeight * 0.72, 0.028, bay.width * 0.5, 0.012, 0.027);
      if (row === count - 1) buildCutleryTray(moving.at({ x: 0, y: 0.03, z: -0.22 }), bay.width - 0.09);
      else {
        for (let item = 0; item < 3; item++) moving.disc(row === 0 ? context.palette.aluminum : context.palette.porcelain, (item - 1) * bay.width * 0.2, 0.08, -0.18, Math.min(0.07, bay.width * 0.15), 0.1);
      }
    });
    drawers.push(drawer);
    origins.push(drawer.position.clone());
    railUpdates.push([
      buildDrawerRail(context, bay.left + 0.028, y + 0.05),
      buildDrawerRail(context, bay.right - 0.028, y + 0.05),
    ]);
  }
  const direction = new THREE.Vector3(Math.sin(context.local.yaw ?? 0), 0, Math.cos(context.local.yaw ?? 0));
  const sensor = context.doorSensor([bay.center, 0, 0.75], 0.5, 1.1);
  let extension = 0;
  let previous = -1;
  return seconds => {
    const dt = previous < 0 ? 0 : Math.min(0.08, Math.max(0, seconds - previous));
    previous = seconds;
    const allowed = access.request(panelId, sensor(seconds) > 0.65, seconds);
    const target = allowed ? 0.35 : 0;
    const speed = target < extension && extension < 0.07 ? 0.04 : 0.23;
    extension += THREE.MathUtils.clamp(target - extension, -speed * dt, speed * dt);
    drawers[count - 1].position.copy(origins[count - 1]).addScaledVector(direction, extension);
    for (let row = 0; row < count; row++) {
      for (const update of railUpdates[row]) update(row === count - 1 ? extension : 0);
    }
    access.settle(panelId, extension, seconds);
  };
}

export function buildDetailedKitchenCasework(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, height = 0.9, dishwasherX?: number): Animation[] {
  const ovenX = width * 0.25;
  const bays = cabinetBays(width, ovenX, dishwasherX);
  buildCarcass(context, width, height, bays);
  const animations: Animation[] = [];
  const access = new CabinetAccessInterlock();
  for (let index = 0; index < bays.length; index++) {
    const bay = bays[index];
    if (bay.drawers) animations.push(buildKitchenDrawers(context, materials, bay, height, access, index));
    else animations.push(buildCabinetDoor(context, materials, bay, height, access, index));
  }
  buildPerforatedCountertop(context.at({ x: 0, y: height, z: 0 }), materials.porcelainTile, width + 0.04, 0.64, 0.04, [
    { x: -width * 0.24, z: 0, width: 0.5, depth: 0.38, radius: 0.055 },
    { x: ovenX, z: 0, width: 0.53, depth: 0.45, radius: 0.018 },
  ]);
  context.box(context.palette.aluminum, 0, height + 0.055, -0.305, width, 0.03, 0.015);
  for (const side of [-1, 1]) context.box(materials.timber, side * width / 2, height / 2 + 0.06, -0.015, 0.025, height - 0.11, 0.59);
  return animations;
}
