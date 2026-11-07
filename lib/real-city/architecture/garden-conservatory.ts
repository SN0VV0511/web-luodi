import * as THREE from "three";
import { sampleEarthWind, type SeasonId } from "../../city-physics";
import { ArchitectureContext, type Animation, type Point } from "./context";
import type { ArchitecturalMaterials } from "./materials";
import { buildSwingDoor } from "./doors";
import { buildDigitalNumber, buildNeedleMeter } from "./display-instruments";
import { buildGardenHose } from "./courtyard-equipment";

class ConservatoryClimate {
  airTemperature = 22;
  soilTemperature = 20;
  humidity = 0.62;
  soilMoisture = 0.58;
  tankWater = 56;
  ventAngle = 0;
  fanSpeed = 0;
  irrigation = 0;
  condensation = 0;
  private previous = -1;
  private watering = false;
  private thermostat = false;

  constructor(private readonly volume: number, private readonly glazingArea: number) {}

  step(seconds: number, night: boolean, season: SeasonId, wind: number): void {
    if (this.previous < 0 || seconds < this.previous) {
      this.previous = seconds;
      this.airTemperature = season === "winter" ? 13 : season === "summer" ? 29 : 21;
      this.soilTemperature = this.airTemperature - 1;
      this.ventAngle = 0;
      this.fanSpeed = 0;
    }
    let remaining = Math.min(0.2, Math.max(0, seconds - this.previous));
    this.previous = seconds;
    const base = season === "winter" ? 6 : season === "summer" ? 28 : season === "autumn" ? 17 : 19;
    const ambient = base + (night ? -4 : 3);
    const solar = night ? 0 : 340 + 70 * Math.sin(seconds * 0.007);
    while (remaining > 1e-7) {
      const dt = Math.min(remaining, 1 / 30);
      remaining -= dt;
      const airCapacity = Math.max(1, this.volume) * 1200;
      const wallLoss = this.glazingArea * 3.2 * (this.airTemperature - ambient);
      const ventilation = (0.04 + this.ventAngle * 0.28 * (1 + wind * 0.18) + this.fanSpeed * 0.18) * this.volume;
      const ventilationLoss = ventilation * 1200 * (this.airTemperature - ambient);
      const sunlight = solar * this.glazingArea * 0.28;
      const heating = this.airTemperature < 11 ? 600 : this.airTemperature < 14 ? 250 : 0;
      const soilExchange = (this.soilTemperature - this.airTemperature) * 26;
      this.airTemperature += (sunlight + heating + soilExchange - wallLoss - ventilationLoss) / airCapacity * dt;
      this.airTemperature = THREE.MathUtils.clamp(this.airTemperature, -10, 55);
      this.soilTemperature += ((this.airTemperature - this.soilTemperature) * 0.003 + solar * 0.000002) * dt;
      const transpiration = Math.max(0, this.airTemperature - 8) * 0.000002 * this.soilMoisture * (night ? 0.25 : 1);
      const ambientHumidity = night ? 0.76 : season === "summer" ? 0.64 : 0.55;
      const airReplacement = Math.min(0.15, ventilation / Math.max(1, this.volume));
      this.humidity += (transpiration * 10 - (this.humidity - ambientHumidity) * airReplacement) * dt;
      this.humidity = THREE.MathUtils.clamp(this.humidity, 0.15, 0.98);
      const glassTemperature = ambient * 0.65 + this.airTemperature * 0.35;
      const dewPoint = this.airTemperature - (1 - this.humidity) * 20;
      const condensateTarget = THREE.MathUtils.clamp((dewPoint - glassTemperature) * 0.08, 0, 1);
      this.condensation += (condensateTarget - this.condensation) * dt * 0.08;
      if (this.airTemperature > 27 || this.humidity > 0.85) this.thermostat = true;
      if (this.airTemperature < 23 && this.humidity < 0.76) this.thermostat = false;
      const targetVent = this.thermostat && wind < 6 ? THREE.MathUtils.clamp((this.airTemperature - 22) * 0.055, 0.12, 0.65) : 0;
      this.ventAngle += THREE.MathUtils.clamp(targetVent - this.ventAngle, -dt * 0.08, dt * 0.05);
      const targetFan = this.airTemperature > 30 ? 1 : this.humidity > 0.82 ? 0.6 : 0;
      this.fanSpeed += (targetFan - this.fanSpeed) * dt * 0.7;
      if (this.soilMoisture < 0.4 && this.tankWater > 2) this.watering = true;
      if (this.soilMoisture > 0.7 || this.tankWater < 0.5) this.watering = false;
      this.irrigation = this.watering ? 0.028 : 0;
      this.tankWater = THREE.MathUtils.clamp(this.tankWater + dt * (0.004 - this.irrigation), 0, 80);
      this.soilMoisture += (this.irrigation * 0.12 - transpiration * 0.6) * dt;
      this.soilMoisture = THREE.MathUtils.clamp(this.soilMoisture, 0, 1);
    }
  }
}

function buildGreenhousePlinth(context: ArchitectureContext, materials: ArchitecturalMaterials, width: number, depth: number): void {
  const { concrete, aluminum, dark } = context.palette;
  context.box(concrete, 0, 0.045, 0, width + 0.16, 0.09, depth + 0.16);
  context.box(materials.terrazzo, 0, 0.1, 0, 0.86, 0.02, depth - 0.1);
  for (const side of [-1, 1]) {
    context.box(concrete, side * width / 2, 0.2, 0, 0.11, 0.25, depth);
    context.box(aluminum, side * width / 2, 0.33, 0, 0.065, 0.035, depth + 0.05);
    context.box(dark, side * width * 0.31, 0.105, 0, width * 0.3, 0.025, depth - 0.16);
  }
  context.box(concrete, 0, 0.2, -depth / 2, width, 0.25, 0.11);
  const sideWidth = (width - 1.05) / 2;
  for (const side of [-1, 1]) context.box(concrete, side * (0.525 + sideWidth / 2), 0.2, depth / 2, sideWidth, 0.25, 0.11);
  const channelX = width / 2 + 0.07;
  context.box(aluminum, channelX, 0.09, 0, 0.09, 0.035, depth + 0.05);
  for (let slot = 0; slot < Math.ceil(depth / 0.2); slot++) {
    context.box(dark, channelX, 0.111, -depth / 2 + 0.1 + slot * 0.2, 0.065, 0.007, 0.045);
  }
  context.box(aluminum, 0, 0.105, depth / 2, 1.02, 0.02, 0.12);
  context.box(context.palette.rubber, 0, 0.1, depth / 2 + 0.23, 0.9, 0.014, 0.34);
}

function buildGreenhouseFrame(context: ArchitectureContext, width: number, depth: number, eaves: number, ridge: number): void {
  const { aluminum, steel, glass, rubber } = context.palette;
  const bays = Math.max(3, Math.ceil(depth / 0.95));
  for (const side of [-1, 1]) {
    const x = side * width / 2;
    context.box(aluminum, x, 0.32, 0, 0.045, 0.05, depth + 0.06);
    context.box(aluminum, x, eaves, 0, 0.055, 0.06, depth + 0.12);
    for (let bay = 0; bay <= bays; bay++) {
      const z = -depth / 2 + bay * depth / bays;
      context.box(aluminum, x, (eaves + 0.3) / 2, z, 0.045, eaves - 0.3, 0.045);
      context.rectangularBeam(aluminum, [x, eaves, z], [0, ridge, z], 0.045, 0.055);
      context.box(steel, x, 0.39, z, 0.075, 0.07, 0.065);
      context.box(steel, x, eaves - 0.03, z, 0.08, 0.09, 0.065);
      if (bay < bays) {
        const centerZ = z + depth / bays / 2;
        context.box(glass, x, (eaves + 0.33) / 2, centerZ, 0.02, eaves - 0.36, depth / bays - 0.05);
        context.box(rubber, x, eaves - 0.055, centerZ, 0.022, 0.009, depth / bays - 0.055);
      }
    }
    for (const z of [-depth / 2, depth / 2]) {
      context.rectangularBeam(steel, [x, 0.4, z], [x, eaves - 0.05, z - Math.sign(z) * depth / bays], 0.014, 0.018);
    }
  }
  context.box(aluminum, 0, ridge, 0, 0.07, 0.075, depth + 0.16);
  for (const end of [-1, 1]) {
    const z = end * depth / 2;
    context.box(aluminum, 0, eaves, z, width, 0.055, 0.045);
    for (const side of [-1, 1]) {
      const openingWidth = end > 0 ? 1.04 : 0;
      const paneWidth = (width - openingWidth) / 2;
      const x = side * (openingWidth / 2 + paneWidth / 2);
      context.box(glass, x, (eaves + 0.33) / 2, z, paneWidth - 0.055, eaves - 0.36, 0.02);
      const triangle = context.geometry(new THREE.BufferGeometry());
      const positions = [0, ridge - 0.04, z, side * width / 2 - side * 0.03, eaves + 0.03, z, 0, eaves + 0.03, z];
      triangle.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      triangle.setAttribute("uv", new THREE.Float32BufferAttribute([0.5, 1, side > 0 ? 1 : 0, 0, 0.5, 0], 2));
      triangle.setIndex(end * side > 0 ? [0, 2, 1] : [0, 1, 2]);
      triangle.computeVertexNormals();
      context.part(glass, triangle, [0, 0, 0]);
    }
    context.box(aluminum, 0, (eaves + ridge) / 2, z, 0.035, ridge - eaves, 0.045);
  }
}

function buildGreenhouseRoof(context: ArchitectureContext, width: number, depth: number, eaves: number, ridge: number, climate: ConservatoryClimate): Animation {
  const { glass, aluminum, rubber } = context.palette;
  const bays = Math.max(3, Math.ceil(depth / 0.95));
  const centerBay = Math.floor(bays / 2);
  const bayDepth = depth / bays;
  const ventStart = -depth / 2 + centerBay * bayDepth;
  for (const side of [-1, 1]) {
    for (let bay = 0; bay < bays; bay++) {
      if (side === -1 && bay === centerBay) continue;
      const z0 = -depth / 2 + bay * bayDepth + 0.025;
      const z1 = z0 + bayDepth - 0.05;
      const x = side * (width / 2 - 0.02);
      context.panel(glass, [[0, ridge - 0.014, z0], [x, eaves + 0.006, z0], [x, eaves + 0.006, z1], [0, ridge - 0.014, z1]]);
    }
    const gutterX = side * (width / 2 + 0.055);
    context.box(aluminum, gutterX, eaves - 0.035, 0, 0.1, 0.025, depth + 0.16);
    context.box(aluminum, gutterX + side * 0.043, eaves + 0.005, 0, 0.014, 0.085, depth + 0.16);
    context.box(aluminum, gutterX - side * 0.043, eaves + 0.005, 0, 0.014, 0.085, depth + 0.16);
  }
  const vent = context.moving("Wax-cylinder greenhouse roof vent", [0, ridge, ventStart], moving => {
    moving.panel(glass, [[-0.025, -0.015, 0.02], [-width / 2 + 0.02, eaves - ridge, 0.02], [-width / 2 + 0.02, eaves - ridge, bayDepth - 0.02], [-0.025, -0.015, bayDepth - 0.02]]);
    for (const z of [0.012, bayDepth - 0.012]) {
      moving.rectangularBeam(aluminum, [0, 0, z], [-width / 2, eaves - ridge, z], 0.035, 0.045);
    }
    moving.box(aluminum, -width / 2, eaves - ridge, bayDepth / 2, 0.04, 0.04, bayDepth);
    moving.box(rubber, -width / 2 + 0.01, eaves - ridge - 0.022, bayDepth / 2, 0.015, 0.012, bayDepth);
  });
  const actuator = context.moving("Greenhouse thermal vent actuator", [-width * 0.25, eaves + 0.1, ventStart + bayDepth * 0.6], moving => {
    moving.disc(aluminum, 0, 0.08, 0, 0.025, 0.16);
    moving.disc(context.palette.steel, 0, 0.19, 0, 0.009, 0.1);
  });
  const rest = actuator.position.clone();
  const yaw = context.local.yaw ?? 0;
  return () => {
    vent.rotation.set(0, yaw, -climate.ventAngle, "YXZ");
    actuator.position.copy(rest);
    actuator.scale.y = 1 + climate.ventAngle * 1.5;
    actuator.rotation.set(0, yaw, -climate.ventAngle * 0.4, "YXZ");
  };
}

function buildPottingBench(context: ArchitectureContext, materials: ArchitecturalMaterials, length: number, climate: ConservatoryClimate): Animation {
  const { aluminum, oak, dark, clay, green, steel } = context.palette;
  context.box(aluminum, 0, 0.84, 0, length, 0.04, 0.66);
  context.box(dark, 0, 0.86, 0, length - 0.04, 0.01, 0.61);
  for (const x of [-length / 2 + 0.1, length / 2 - 0.1]) {
    for (const z of [-0.25, 0.25]) context.box(aluminum, x, 0.43, z, 0.035, 0.82, 0.035);
    context.box(aluminum, x, 0.25, 0, 0.025, 0.03, 0.58);
  }
  context.box(oak, 0, 0.28, 0, length - 0.08, 0.025, 0.58);
  const rows = 2;
  const columns = Math.max(4, Math.floor(length / 0.24));
  const leaves = context.moving("Conservatory seedling canopy", [0, 0.87, 0], moving => {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = -length / 2 + (column + 0.5) * length / columns;
        const z = (row - 0.5) * 0.27;
        const plantHeight = 0.12 + column % 3 * 0.025;
        moving.beam(green, [x, 0.05, z], [x, plantHeight, z], 0.004);
        for (let leaf = 0; leaf < 4; leaf++) {
          const angle = leaf * Math.PI / 2 + column;
          const leafX = x + Math.cos(angle) * 0.035;
          const leafZ = z + Math.sin(angle) * 0.035;
          moving.oval(green, leafX, plantHeight * (0.55 + leaf * 0.08), leafZ, 0.035, 0.01, 0.02);
        }
      }
    }
  });
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const x = -length / 2 + (column + 0.5) * length / columns;
      const z = (row - 0.5) * 0.27;
      context.disc(clay, x, 0.9, z, 0.07, 0.1);
      context.disc(dark, x, 0.954, z, 0.062, 0.007);
      context.box(oak, x + 0.045, 1.035, z - 0.035, 0.025, 0.15, 0.003);
    }
    context.beam(steel, [-length / 2 + 0.05, 0.958, (row - 0.5) * 0.27], [length / 2 - 0.05, 0.958, (row - 0.5) * 0.27], 0.005);
  }
  for (let stack = 0; stack < 4; stack++) {
    const x = -length * 0.36 + stack * length * 0.24;
    for (let pot = 0; pot < 3; pot++) context.disc(clay, x, 0.31 + pot * 0.06, 0, 0.08 + pot * 0.003, 0.08);
  }
  context.box(materials.upholstery, length * 0.24, 0.37, 0.14, 0.18, 0.12, 0.2);
  return () => {
    const wilt = THREE.MathUtils.clamp((0.35 - climate.soilMoisture) * 0.5, 0, 0.12);
    leaves.scale.y = 1 - wilt;
  };
}

function buildGrowingBed(context: ArchitectureContext, width: number, depth: number): void {
  const { oak, dark, green, aluminum, red } = context.palette;
  context.box(dark, 0, 0.32, 0, width - 0.06, 0.05, depth - 0.05);
  for (const side of [-1, 1]) {
    for (let plank = 0; plank < 3; plank++) {
      context.box(oak, side * width / 2, 0.07 + plank * 0.11, 0, 0.03, 0.1, depth);
      context.box(oak, 0, 0.07 + plank * 0.11, side * depth / 2, width, 0.1, 0.03);
    }
  }
  const plants = Math.max(3, Math.floor(depth / 0.55));
  for (let plant = 0; plant < plants; plant++) {
    const z = -depth / 2 + (plant + 0.5) * depth / plants;
    context.beam(oak, [0, 0.34, z], [0.035, 1.65, z], 0.009);
    const stem: Point[] = [[0, 0.34, z], [0.035, 0.66, z + 0.02], [0.01, 1, z - 0.02], [0.04, 1.45, z]];
    context.tube(green, stem, 0.006);
    for (let branch = 0; branch < 5; branch++) {
      const side = branch % 2 ? -1 : 1;
      const y = 0.55 + branch * 0.16;
      context.beam(green, [0.02, y, z], [side * 0.15, y + 0.04, z + side * 0.07], 0.004);
      context.oval(green, side * 0.17, y + 0.04, z + side * 0.07, 0.08, 0.015, 0.04);
      if (branch % 2 === 0) {
        context.oval(red, side * 0.12, y - 0.04, z + 0.06, 0.028, 0.028, 0.028);
        context.oval(red, side * 0.15, y - 0.065, z + 0.03, 0.022, 0.022, 0.022);
      }
    }
    context.beam(aluminum, [-width * 0.3, 0.355, z], [0, 0.355, z], 0.005);
    context.disc(context.palette.dark, -width * 0.3, 0.36, z, 0.009, 0.016);
  }
  context.beam(context.palette.dark, [-width * 0.3, 0.35, -depth / 2], [-width * 0.3, 0.35, depth / 2], 0.009);
}

function buildConservatoryWater(context: ArchitectureContext, climate: ConservatoryClimate): Animation[] {
  const { green, steel, aluminum, rubber, glass, water } = context.palette;
  context.disc(green, 0, 0.58, 0, 0.3, 0.96);
  context.oval(green, 0, 1.06, 0, 0.3, 0.09, 0.3);
  context.disc(steel, 0, 1.15, 0, 0.12, 0.035);
  context.disc(aluminum, 0, 0.065, 0, 0.34, 0.13);
  for (const y of [0.21, 0.93]) {
    const ring = context.geometry(new THREE.TorusGeometry(0.304, 0.012, 4, 18));
    ring.rotateX(Math.PI / 2);
    context.part(steel, ring, [0, y, 0]);
  }
  context.box(glass, 0, 0.6, 0.31, 0.035, 0.8, 0.025);
  const gauge = context.moving("Irrigation tank sight-glass level", [0, 0.2, 0.312], moving => {
    moving.box(water, 0, 0.4, 0, 0.027, 0.8, 0.018);
  });
  context.tube(rubber, [[0.18, 0.15, 0.15], [0.4, 0.15, 0.15], [0.4, 0.09, 0.5], [0.8, 0.09, 0.5]], 0.013);
  context.tube(aluminum, [[0, 1.1, -0.15], [0, 1.42, -0.15], [-0.18, 1.42, -0.15]], 0.025);
  context.box(steel, 0.36, 0.2, 0.16, 0.12, 0.11, 0.1);
  const valve = context.moving("Greenhouse irrigation solenoid flag", [0.36, 0.26, 0.16], moving => {
    moving.box(context.palette.yellow, 0, 0, 0, 0.09, 0.012, 0.02);
  });
  const pressure = buildNeedleMeter(context.at({ x: 0.36, y: 0.36, z: 0.19 }), 0.075, 0.04, () => climate.irrigation > 0 ? 0.65 : 0.1);
  return [
    pressure,
    () => {
      gauge.scale.y = climate.tankWater / 80;
      valve.rotation.y = (context.local.yaw ?? 0) + (climate.irrigation > 0 ? Math.PI / 2 : 0);
    },
  ];
}

function buildConservatoryVentilation(context: ArchitectureContext, climate: ConservatoryClimate): Animation {
  const { aluminum, steel, rubber } = context.palette;
  context.box(aluminum, 0, 0, 0, 0.48, 0.48, 0.12);
  context.disc(rubber, 0, 0, 0.065, 0.19, 0.04);
  const hub = context.moving("Greenhouse extraction fan", [0, 0, 0.09], moving => {
    moving.oval(steel, 0, 0, 0, 0.045, 0.045, 0.025);
    for (let blade = 0; blade < 5; blade++) {
      const angle = blade * Math.PI * 2 / 5;
      moving.box(aluminum, Math.cos(angle) * 0.1, Math.sin(angle) * 0.1, 0, 0.14, 0.045, 0.015, 0, angle + 0.35);
    }
  });
  for (let bar = -3; bar <= 3; bar++) {
    const x = bar * 0.05;
    const halfHeight = Math.sqrt(Math.max(0, 0.18 * 0.18 - x * x));
    context.box(steel, x, 0, 0.12, 0.006, halfHeight * 2, 0.006);
  }
  const yaw = context.local.yaw ?? 0;
  let angle = 0;
  let last = 0;
  return seconds => {
    const dt = Math.min(0.08, Math.max(0, seconds - last));
    last = seconds;
    angle = (angle + dt * climate.fanSpeed * 19) % (Math.PI * 2);
    hub.rotation.set(0, yaw, angle, "YXZ");
  };
}

function buildConservatoryControls(context: ArchitectureContext, climate: ConservatoryClimate): Animation {
  const { white, dark, aluminum, green, red } = context.palette;
  context.box(white, 0, 0, 0, 0.32, 0.42, 0.1);
  context.box(dark, 0, 0.09, 0.06, 0.25, 0.16, 0.025);
  const temperature = buildDigitalNumber(context.at({ x: -0.045, y: 0.11, z: 0.079 }), 2, 0.031);
  context.label("°C", 0.085, 0.11, 0.082, 0.065, 0.045, "#d1d6c6", "#333a3a");
  context.label("CLIMATE", 0, 0.24, 0.05, 0.3, 0.055);
  for (const x of [-0.085, 0.085]) {
    context.box(aluminum, x, -0.075, 0.06, 0.055, 0.055, 0.018);
    context.box(x < 0 ? green : red, x, -0.075, 0.075, 0.025, 0.025, 0.008);
  }
  context.box(context.palette.rubber, 0, -0.33, -0.01, 0.025, 0.26, 0.025);
  const status = context.moving("Irrigation controller status", [0, -0.14, 0.065], moving => {
    moving.box(green, 0, 0, 0, 0.08, 0.012, 0.012);
  });
  return seconds => {
    temperature.set(Math.round(climate.airTemperature));
    status.visible = climate.irrigation > 0 || Math.sin(seconds * 0.5) > 0.93;
  };
}

export function buildGardenConservatory(context: ArchitectureContext, materials: ArchitecturalMaterials, width = 3.4, depth = 4.8): Animation[] {
  const eaves = 1.95;
  const ridge = 2.7;
  const volume = width * depth * (eaves + (ridge - eaves) * 0.5);
  const surface = 2 * depth * eaves + 2 * width * eaves + width * depth;
  const climate = new ConservatoryClimate(volume, surface);
  buildGreenhousePlinth(context, materials, width, depth);
  buildGreenhouseFrame(context, width, depth, eaves, ridge);
  const animations: Animation[] = [
    (seconds, night, season) => {
      const wind = sampleEarthWind(seconds, context.local.x, context.local.z, season);
      climate.step(seconds, night, season, Math.hypot(wind.x, wind.z));
    },
  ];
  animations.push(buildGreenhouseRoof(context, width, depth, eaves, ridge, climate));
  animations.push(buildSwingDoor(context.at({ x: 0, y: 0.1, z: depth / 2 + 0.02 }), 0.98, eaves - 0.12, 0));
  animations.push(buildPottingBench(context.at({ x: -width / 2 + 0.43, y: 0.1, z: 0, yaw: Math.PI / 2 }), materials, depth - 0.55, climate));
  buildGrowingBed(context.at({ x: width / 2 - 0.45, y: 0.1, z: 0 }), 0.65, depth - 0.5);
  animations.push(...buildConservatoryWater(context.at({ x: -width / 2 - 0.5, y: 0.02, z: -depth / 2 + 0.5 }), climate));
  animations.push(buildConservatoryVentilation(context.at({ x: 0, y: 1.45, z: -depth / 2 - 0.015, yaw: Math.PI }), climate));
  animations.push(buildConservatoryControls(context.at({ x: -0.67, y: 1.28, z: depth / 2 + 0.045 }), climate));
  buildGardenHose(context.at({ x: width / 2 + 0.3, y: 0.02, z: -depth / 2 + 0.5 }));
  context.label("GARDEN ROOM", 0, eaves + 0.12, depth / 2 + 0.03, 0.8, 0.1, "#dadfd1", "#486252");
  return animations;
}
