import * as THREE from "three";
import { CITY_DAY_SECONDS } from "../../city-physics";
import { ArchitectureContext, type Animation } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildDigitalNumber } from "./display-instruments";

class DomesticRefrigeration {
  fridgeTemperature = 4.2;
  freezerTemperature = -17.4;
  evaporatorTemperature = -23;
  compressor = false;
  compressorFraction = 0;
  doorAngle = 0;
  frost = 0.12;
  condensate = 0;
  fanAngle = 0;
  private last = -1;
  private compressorTime = 0;
  private sinceDefrost = 0;
  private defrost = false;

  update(seconds: number, demand: number, ambient: number): number {
    if (this.last >= 0 && seconds < this.last) {
      this.fridgeTemperature = 4.2;
      this.freezerTemperature = -17.4;
      this.evaporatorTemperature = -23;
      this.compressor = false;
      this.compressorFraction = 0;
      this.doorAngle = 0;
      this.frost = 0.12;
      this.condensate = 0;
      this.sinceDefrost = 0;
      this.defrost = false;
    }
    if (this.last < 0 || seconds < this.last) this.last = seconds;
    const delta = Math.min(0.1, Math.max(0, seconds - this.last));
    this.last = seconds;
    const requestedAngle = demand > 0.45 ? 1.4 : 0;
    const speed = requestedAngle > this.doorAngle ? 0.8 : this.doorAngle < 0.18 ? 0.12 : 0.55;
    this.doorAngle += THREE.MathUtils.clamp(requestedAngle - this.doorAngle, -speed * delta, speed * delta);
    let remaining = delta * 86400 / CITY_DAY_SECONDS;
    while (remaining > 1e-6) {
      const dt = Math.min(remaining, 2);
      remaining -= dt;
      const aperture = Math.sin(this.doorAngle) * 0.55;
      const wallGain = (ambient - this.fridgeTemperature) * 0.7;
      const openGain = (ambient - this.fridgeTemperature) * aperture * 12;
      const freezerGain = (ambient - this.freezerTemperature) * 0.32;
      if (this.fridgeTemperature > 5.2 || this.freezerTemperature > -16) this.compressor = true;
      if (this.fridgeTemperature < 3.1 && this.freezerTemperature < -18.5) this.compressor = false;
      this.sinceDefrost += dt;
      if (this.frost > 0.65 && this.sinceDefrost > 10800) this.defrost = true;
      if (this.defrost) {
        this.compressor = false;
        const melt = Math.min(this.frost, dt * 0.0007);
        this.frost -= melt;
        this.condensate += melt * 0.15;
        if (this.frost < 0.04) { this.defrost = false; this.sinceDefrost = 0; }
      }
      const target = this.compressor ? 1 : 0;
      this.compressorFraction += (target - this.compressorFraction) * Math.min(1, dt * 0.04);
      const efficiency = 1 - this.frost * 0.25;
      const cooling = this.compressorFraction * 83 * efficiency;
      const exchange = (this.fridgeTemperature - this.freezerTemperature) * 0.45;
      this.fridgeTemperature += (wallGain + openGain - cooling * 0.45 - exchange) / 32000 * dt;
      this.freezerTemperature += (freezerGain + exchange - cooling * 0.55 + (this.defrost ? 110 : 0)) / 27000 * dt;
      const evaporatorTarget = this.compressor ? -29 : this.freezerTemperature + 2;
      this.evaporatorTemperature += (evaporatorTarget - this.evaporatorTemperature) * dt * 0.003;
      if (this.evaporatorTemperature < -5 && aperture > 0.05) this.frost = Math.min(1, this.frost + dt * aperture * 0.00006);
      this.condensate = Math.max(0, this.condensate - dt * (0.00001 + this.compressorFraction * 0.00002));
      if (this.compressor) this.compressorTime += dt;
      this.fridgeTemperature = THREE.MathUtils.clamp(this.fridgeTemperature, -1, ambient);
      this.freezerTemperature = THREE.MathUtils.clamp(this.freezerTemperature, -25, ambient);
    }
    this.fanAngle = (this.fanAngle + delta * this.compressorFraction * (this.doorAngle > 0.1 ? 0 : 21)) % (Math.PI * 2);
    return delta;
  }
}

function buildInsulatedCabinet(context: ArchitectureContext, height: number): void {
  const { white, aluminum, rubber, dark } = context.palette;
  const sideThickness = 0.037;
  context.box(white, 0, 0.055, 0, 0.62, 0.07, 0.63);
  context.box(white, 0, height - 0.022, 0, 0.62, 0.045, 0.63);
  context.box(white, 0, height / 2, -0.295, 0.62, height - 0.06, 0.06);
  for (const side of [-1, 1]) {
    context.box(white, side * (0.31 - sideThickness / 2), height / 2, 0, sideThickness, height - 0.04, 0.61);
    context.box(rubber, side * 0.278, height / 2, 0.3, 0.015, height - 0.07, 0.012);
    for (const z of [-0.24, 0.24]) context.disc(dark, side * 0.24, 0.02, z, 0.021, 0.04);
    for (const y of [0.49, 0.72, 0.96, 1.2, 1.44]) {
      if (y < height - 0.14) context.box(aluminum, side * 0.266, y, 0, 0.012, 0.012, 0.4);
    }
  }
  context.box(white, 0, height * 0.26, -0.015, 0.55, 0.06, 0.55);
  context.box(rubber, 0, height * 0.26, 0.3, 0.56, 0.015, 0.012);
  context.box(rubber, 0, height - 0.045, 0.3, 0.56, 0.015, 0.012);
  context.box(aluminum, 0, 0.09, 0.304, 0.55, 0.06, 0.02);
  for (let vent = 0; vent < 9; vent++) context.box(dark, -0.22 + vent * 0.055, 0.09, 0.317, 0.023, 0.03, 0.006);
}

function buildDomesticBottle(context: ArchitectureContext, height: number, color: THREE.Material): void {
  const { white, glass } = context.palette;
  const radius = height * 0.19;
  context.disc(color, 0, height * 0.38, 0, radius, height * 0.69);
  context.oval(color, 0, height * 0.72, 0, radius, height * 0.11, radius);
  context.disc(glass, 0, height * 0.87, 0, radius * 0.44, height * 0.19);
  context.disc(white, 0, height * 0.975, 0, radius * 0.51, height * 0.04);
  context.box(white, 0, height * 0.4, radius + 0.001, radius * 1.3, height * 0.24, 0.003);
}

function buildColdFood(context: ArchitectureContext, height: number): void {
  const { glass, white, green, porcelain, clay, dark } = context.palette;
  const lower = height * 0.3;
  const usable = height - lower - 0.16;
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = lower + usable * (shelf + 0.65) / 3;
    context.box(glass, 0, y, 0.015, 0.52, 0.01, 0.48);
    context.box(white, 0, y + 0.003, 0.25, 0.53, 0.018, 0.025);
    if (shelf === 0) {
      context.box(white, -0.12, y + 0.09, 0.02, 0.18, 0.17, 0.23);
      context.box(green, -0.12, y + 0.09, 0.137, 0.14, 0.05, 0.004);
      buildDomesticBottle(context.at({ x: 0.13, y: y + 0.015, z: 0.07 }), 0.21, white);
    } else if (shelf === 1) {
      for (let cup = 0; cup < 3; cup++) {
        const x = -0.14 + cup * 0.14;
        context.disc(porcelain, x, y + 0.055, 0.08, 0.045, 0.09);
        context.disc(clay, x, y + 0.104, 0.08, 0.046, 0.008);
      }
      context.box(white, 0.05, y + 0.04, -0.12, 0.21, 0.075, 0.12);
    } else {
      context.disc(porcelain, -0.08, y + 0.014, 0.08, 0.11, 0.02);
      context.oval(clay, -0.08, y + 0.055, 0.08, 0.085, 0.032, 0.07);
      context.box(white, 0.15, y + 0.07, -0.07, 0.11, 0.12, 0.15);
    }
  }
  context.box(glass, 0, lower + 0.08, 0.025, 0.5, 0.15, 0.48);
  context.box(white, 0, lower + 0.17, 0.265, 0.46, 0.025, 0.035);
  for (let fruit = 0; fruit < 6; fruit++) {
    const x = -0.16 + fruit % 3 * 0.15;
    const z = -0.09 + Math.floor(fruit / 3) * 0.17;
    context.oval(fruit % 2 ? green : context.palette.red, x, lower + 0.1, z, 0.043, 0.044, 0.043);
    context.beam(dark, [x, lower + 0.14, z], [x + 0.005, lower + 0.16, z], 0.003);
  }
}

function buildDoorStorage(context: ArchitectureContext, width: number, height: number): void {
  const { white, glass, green, aluminum } = context.palette;
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 0.14 + shelf * height * 0.29;
    context.box(white, -width / 2, y, -0.07, width - 0.045, 0.018, 0.11);
    context.box(glass, -width / 2, y + 0.06, -0.123, width - 0.055, 0.1, 0.014);
    for (const x of [-width + 0.045, -0.045]) context.box(white, x, y + 0.06, -0.07, 0.018, 0.1, 0.11);
    for (let bottle = 0; bottle < 3; bottle++) {
      const x = -width + 0.1 + bottle * (width - 0.2) / 2;
      buildDomesticBottle(context.at({ x, y: y + 0.015, z: -0.065 }), shelf === 0 ? 0.19 : 0.12, shelf % 2 ? green : white);
    }
  }
  context.box(aluminum, -width / 2, height - 0.1, -0.025, width - 0.05, 0.035, 0.025);
}

function buildFridgeDoors(context: ArchitectureContext, materials: ArchitecturalMaterials, height: number): { upper: THREE.Group; lower: THREE.Group } {
  const { white, rubber, aluminum } = context.palette;
  const divider = height * 0.26;
  const upperHeight = height - divider - 0.025;
  const upper = context.moving("Domestic refrigerator main door", [0.295, divider + 0.012, 0.325], moving => {
    moving.roundedBox(materials.ribbedMetal, -0.295, upperHeight / 2, 0, 0.6, upperHeight, 0.055, 0.024);
    moving.box(white, -0.295, upperHeight / 2, -0.037, 0.54, upperHeight - 0.06, 0.026);
    for (const x of [-0.57, -0.02]) moving.box(rubber, x, upperHeight / 2, -0.054, 0.012, upperHeight - 0.04, 0.012);
    for (const y of [0.023, upperHeight - 0.023]) moving.box(rubber, -0.295, y, -0.054, 0.55, 0.012, 0.012);
    moving.box(aluminum, -0.53, upperHeight * 0.45, 0.065, 0.018, 0.36, 0.025);
    for (const y of [upperHeight * 0.45 - 0.15, upperHeight * 0.45 + 0.15]) moving.box(aluminum, -0.53, y, 0.043, 0.018, 0.018, 0.045);
    buildDoorStorage(moving, 0.56, upperHeight);
  });
  const lower = context.moving("Domestic refrigerator freezer drawer", [0, 0.095, 0.325], moving => {
    moving.roundedBox(materials.ribbedMetal, 0, (divider - 0.11) / 2, 0, 0.6, divider - 0.11, 0.055, 0.024);
    moving.box(aluminum, 0, divider - 0.19, 0.059, 0.35, 0.018, 0.026);
    moving.box(white, 0, 0.03, -0.24, 0.51, 0.025, 0.45);
    for (const side of [-1, 1]) moving.box(white, side * 0.25, 0.14, -0.24, 0.018, 0.23, 0.45);
    moving.box(white, 0, 0.14, -0.46, 0.5, 0.23, 0.018);
    moving.box(context.palette.green, -0.12, 0.09, -0.18, 0.18, 0.09, 0.24);
    moving.box(white, 0.12, 0.12, -0.26, 0.2, 0.14, 0.18);
  });
  for (const y of [divider + 0.06, height - 0.04]) {
    context.box(aluminum, 0.29, y, 0.285, 0.045, 0.035, 0.08);
    context.disc(aluminum, 0.295, y, 0.325, 0.008, 0.05);
  }
  return { upper, lower };
}

function buildCoolingMachinery(context: ArchitectureContext, height: number): THREE.Group {
  const { steel, aluminum, dark, white } = context.palette;
  context.oval(steel, 0.12, 0.17, -0.3, 0.1, 0.12, 0.1);
  const coilPoints: [number, number, number][] = [];
  const rows = Math.max(8, Math.floor((height - 0.4) / 0.09));
  for (let row = 0; row < rows; row++) {
    const y = 0.32 + row * (height - 0.47) / rows;
    const side = row % 2 ? 1 : -1;
    coilPoints.push([side * 0.25, y, -0.336], [-side * 0.25, y + 0.025, -0.336]);
  }
  context.tube(dark, coilPoints, 0.006);
  for (let wire = 0; wire < 8; wire++) context.box(steel, -0.23 + wire * 0.46 / 7, height / 2, -0.344, 0.004, height - 0.3, 0.004);
  context.tube(aluminum, [[0.12, 0.17, -0.33], [0.24, 0.18, -0.35], [0.25, 0.29, -0.336]], 0.005);
  context.box(white, 0, height - 0.17, -0.24, 0.35, 0.2, 0.05);
  const fan = context.moving("Domestic evaporator circulation fan", [0, height - 0.17, -0.204], moving => {
    moving.oval(aluminum, 0, 0, 0, 0.025, 0.025, 0.01);
    for (let blade = 0; blade < 5; blade++) {
      const angle = blade * Math.PI * 2 / 5;
      moving.box(white, Math.cos(angle) * 0.045, Math.sin(angle) * 0.045, 0, 0.055, 0.025, 0.009, 0, angle + 0.4);
    }
  });
  for (let slat = 0; slat < 6; slat++) context.box(aluminum, 0, height - 0.23 + slat * 0.024, -0.189, 0.22, 0.007, 0.008);
  context.box(white, -0.1, 0.19, -0.32, 0.17, 0.035, 0.17);
  return fan;
}

function buildFridgeHingeCam(context: ArchitectureContext, height: number): (angle: number) => number {
  const divider = height * 0.26;
  const { aluminum, steel, rubber } = context.palette;
  const base = context.at({ x: 0.296, y: divider + 0.025, z: 0.325 });
  base.disc(aluminum, 0, 0, 0, 0.022, 0.018);
  base.disc(steel, 0, 0.015, 0, 0.007, 0.038);
  const positions: number[] = [];
  const normals: number[] = [];
  const uv: number[] = [];
  const indices: number[] = [];
  const segments = 24;
  for (let segment = 0; segment <= segments; segment++) {
    const angle = segment / segments * Math.PI * 2;
    const elevation = 0.004 * Math.pow(Math.sin(angle * 0.5), 2);
    for (const radius of [0.009, 0.022]) {
      positions.push(Math.cos(angle) * radius, 0.011 + elevation, Math.sin(angle) * radius);
      normals.push(0, 1, 0);
      uv.push(segment / segments, radius === 0.009 ? 0 : 1);
    }
    if (segment < segments) {
      const offset = segment * 2;
      indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    }
  }
  const track = base.geometry(new THREE.BufferGeometry());
  track.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  track.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  track.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  track.setIndex(indices);
  base.part(steel, track, [0, 0, 0]);
  const follower = base.moving("Refrigerator self-closing hinge follower", [0, 0.022, 0], moving => {
    moving.box(aluminum, -0.012, 0.008, 0, 0.045, 0.018, 0.035);
    moving.oval(rubber, 0.016, -0.005, 0, 0.006, 0.006, 0.009);
    moving.disc(aluminum, 0, 0.011, 0, 0.012, 0.009);
  });
  const followerRest = follower.position.clone();
  const upper = context.at({ x: 0.296, y: height - 0.025, z: 0.325 });
  upper.box(aluminum, -0.022, 0.018, -0.018, 0.075, 0.025, 0.065);
  upper.disc(steel, 0, 0, 0, 0.007, 0.045);
  for (const x of [-0.045, -0.012]) upper.disc(steel, x, 0.035, -0.025, 0.005, 0.008);
  return angle => {
    const lift = 0.004 * Math.pow(Math.sin(angle * 0.5), 2);
    follower.position.copy(followerRest);
    follower.position.y += lift;
    follower.rotation.y = (context.local.yaw ?? 0) + angle;
    return lift;
  };
}

function buildFreezerSlides(context: ArchitectureContext): (extension: number) => void {
  const { aluminum, steel, white } = context.palette;
  const sliders: THREE.Group[] = [];
  const rests: THREE.Vector3[] = [];
  for (const side of [-1, 1]) {
    const x = side * 0.259;
    context.box(aluminum, x, 0.18, -0.02, 0.014, 0.03, 0.43);
    context.box(steel, x, 0.19, -0.02, 0.014, 0.007, 0.4);
    const middle = context.moving("Freezer drawer intermediate runner", [x, 0.178, -0.02], moving => {
      moving.box(aluminum, 0, 0, 0, 0.012, 0.018, 0.39);
      for (const z of [-0.15, 0.15]) moving.oval(white, 0, 0, z, 0.007, 0.013, 0.013);
    });
    const inner = context.moving("Freezer drawer inner runner", [x, 0.17, -0.02], moving => {
      moving.box(steel, 0, 0, 0, 0.009, 0.014, 0.36);
      moving.box(aluminum, -side * 0.012, 0.015, 0.13, 0.03, 0.015, 0.08);
    });
    sliders.push(middle, inner);
    rests.push(middle.position.clone(), inner.position.clone());
  }
  const forward = new THREE.Vector3(Math.sin(context.local.yaw ?? 0), 0, Math.cos(context.local.yaw ?? 0));
  return extension => {
    for (let index = 0; index < sliders.length; index++) {
      const fraction = index % 2 ? 1 : 0.5;
      sliders[index].position.copy(rests[index]).addScaledVector(forward, extension * fraction);
    }
  };
}

function buildCondensateSystem(context: ArchitectureContext, model: DomesticRefrigeration): () => void {
  const { white, aluminum, rubber, water } = context.palette;
  context.tube(white, [[0, 0.51, -0.25], [0, 0.41, -0.27], [-0.08, 0.32, -0.32], [-0.08, 0.23, -0.32]], 0.006);
  context.disc(aluminum, 0, 0.512, -0.25, 0.013, 0.006);
  for (const side of [-1, 1]) {
    context.box(white, -0.1 + side * 0.09, 0.2, -0.32, 0.015, 0.055, 0.17);
    context.box(white, -0.1, 0.2, -0.32 + side * 0.08, 0.18, 0.055, 0.015);
  }
  const surface = context.moving("Refrigerator condensate evaporation tray", [-0.1, 0.18, -0.32], moving => {
    moving.box(water, 0, 0, 0, 0.155, 0.004, 0.14);
  });
  const surfaceRest = surface.position.clone();
  const grommets = context.moving("Refrigerator compressor resilient mounts", [0.12, 0.07, -0.3], moving => {
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) moving.disc(rubber, side * 0.065, 0, end * 0.05, 0.014, 0.025);
    }
  });
  return () => {
    surface.position.copy(surfaceRest);
    surface.position.y += Math.min(0.025, model.condensate * 0.5);
    surface.visible = model.condensate > 0.001;
    grommets.scale.y = 1 - model.compressorFraction * 0.06;
  };
}

export function buildDetailedDomesticFridge(context: ArchitectureContext, materials: ArchitecturalMaterials, height = 1.82): Animation {
  const model = new DomesticRefrigeration();
  buildInsulatedCabinet(context, height);
  buildColdFood(context, height);
  const doors = buildFridgeDoors(context, materials, height);
  const upperRest = doors.upper.position.clone();
  const hinge = buildFridgeHingeCam(context, height);
  const slides = buildFreezerSlides(context);
  const condensate = buildCondensateSystem(context, model);
  const fan = buildCoolingMachinery(context, height);
  const light = context.moving("Domestic fridge interior lamp", [-0.26, height * 0.72, -0.08], moving => {
    moving.box(context.palette.warmLight, 0, 0, 0, 0.014, 0.31, 0.07);
  });
  context.box(context.palette.dark, 0.16, height - 0.09, 0.27, 0.14, 0.06, 0.025);
  const temperature = buildDigitalNumber(context.at({ x: 0.16, y: height - 0.09, z: 0.29 }), 1, 0.026);
  const sensor = context.doorSensor([0, 0, 0.75], 0.68, 2.8);
  const yaw = context.local.yaw ?? 0;
  const lowerRest = doors.lower.position.clone();
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  let elapsedPresence = 0;
  let freezerExtension = 0;
  return (seconds, night, season) => {
    const demand = sensor(seconds);
    const ambient = season === "summer" ? 26 : season === "winter" ? 19 : 22;
    const dt = model.update(seconds, demand, ambient);
    elapsedPresence = demand > 0.7 ? elapsedPresence + dt : 0;
    const freezerTarget = elapsedPresence > 9 && model.doorAngle > 1 ? 0.27 : 0;
    freezerExtension += THREE.MathUtils.clamp(freezerTarget - freezerExtension, -dt * 0.2, dt * 0.2);
    doors.upper.rotation.y = yaw + model.doorAngle;
    doors.upper.position.copy(upperRest);
    doors.upper.position.y += hinge(model.doorAngle);
    doors.lower.position.copy(lowerRest).addScaledVector(forward, freezerExtension);
    slides(freezerExtension);
    condensate();
    fan.rotation.set(0, yaw, model.fanAngle, "YXZ");
    light.visible = model.doorAngle > 0.08;
    temperature.set(Math.round(model.fridgeTemperature));
  };
}
