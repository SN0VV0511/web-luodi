import * as THREE from "three";
import { ArchitectureContext, type Animation } from "./context";
import { FacadeShadeController } from "./exterior-controls";
import { buildFaceFastener, buildFoldedFlashing } from "./exterior-fixings";

function buildCableGland(context: ArchitectureContext, radius: number): void {
  const { aluminum, rubber, steel } = context.palette;
  context.disc(aluminum, 0, 0, 0, radius * 1.4, 0.018);
  context.disc(rubber, 0, -0.013, 0, radius * 1.15, 0.012);
  context.disc(steel, 0, -0.027, 0, radius, 0.018);
  context.disc(rubber, 0, -0.041, 0, radius * 0.65, 0.014);
}

function buildStatusLens(context: ArchitectureContext, color: THREE.Material): THREE.Group {
  const { rubber, glass, aluminum } = context.palette;
  context.oval(rubber, 0, 0, 0, 0.011, 0.011, 0.006);
  context.oval(aluminum, 0, 0, 0.006, 0.009, 0.009, 0.004);
  context.oval(glass, 0, 0, 0.013, 0.007, 0.007, 0.005);
  return context.moving("Shade actuator status lamp", [0, 0, 0.011], moving => {
    moving.oval(color, 0, 0, 0, 0.006, 0.006, 0.005);
  });
}

function buildSelectorDial(context: ArchitectureContext): THREE.Group {
  const { aluminum, rubber, white } = context.palette;
  context.oval(aluminum, 0, 0, 0, 0.023, 0.023, 0.008);
  context.oval(rubber, 0, 0, 0.008, 0.019, 0.019, 0.009);
  for (const position of [-1, 0, 1]) {
    const angle = position * Math.PI / 3;
    const x = Math.sin(angle) * 0.028;
    const y = Math.cos(angle) * 0.028;
    context.box(white, x, y, 0.006, 0.004, 0.007, 0.003, 0, -angle);
  }
  return context.moving("Shade control position dial", [0, 0, 0.021], moving => {
    moving.box(rubber, 0, 0, 0, 0.012, 0.034, 0.012);
    moving.box(white, 0, 0.012, 0.008, 0.004, 0.009, 0.003);
  });
}

function buildTravelScale(context: ArchitectureContext, width: number): THREE.Group {
  const { aluminum, dark, white, yellow } = context.palette;
  context.box(aluminum, 0, 0, 0, width + 0.015, 0.042, 0.012);
  context.box(dark, 0, 0, 0.009, width, 0.03, 0.008);
  for (let tick = 0; tick <= 4; tick++) {
    const x = -width / 2 + tick * width / 4;
    context.box(white, x, -0.01, 0.016, 0.002, tick % 2 ? 0.006 : 0.01, 0.002);
  }
  return context.moving("Shade travel position indicator", [0, 0.004, 0.019], moving => {
    moving.box(yellow, 0, 0, 0, 0.005, 0.016, 0.003);
  });
}

function buildCurrentGauge(context: ArchitectureContext): THREE.Group {
  const { dark, aluminum, white } = context.palette;
  context.oval(aluminum, 0, 0, 0, 0.034, 0.034, 0.005);
  context.oval(dark, 0, 0, 0.006, 0.029, 0.029, 0.004);
  for (let tick = 0; tick < 7; tick++) {
    const angle = -Math.PI * 0.65 + tick * Math.PI * 1.3 / 6;
    const x = Math.sin(angle) * 0.023;
    const y = Math.cos(angle) * 0.023;
    context.box(white, x, y, 0.012, 0.002, 0.005, 0.002, 0, -angle);
  }
  return context.moving("Shade actuator current gauge needle", [0, 0, 0.015], moving => {
    moving.box(context.palette.red, 0, 0.009, 0, 0.002, 0.022, 0.002);
    moving.oval(aluminum, 0, 0, 0.002, 0.004, 0.004, 0.002);
  });
}

function buildWeatherproofButton(context: ArchitectureContext, color: THREE.Material): void {
  const { aluminum, rubber } = context.palette;
  context.oval(aluminum, 0, 0, 0, 0.014, 0.014, 0.006);
  context.oval(rubber, 0, 0, 0.006, 0.011, 0.011, 0.007);
  context.oval(color, 0, 0, 0.013, 0.008, 0.008, 0.006);
  context.box(aluminum, 0, 0.022, 0.011, 0.035, 0.008, 0.025);
}

function buildControlCable(context: ArchitectureContext, drop: number, offset: number): void {
  const { steel, rubber, aluminum } = context.palette;
  buildCableGland(context, 0.009);
  const length = Math.max(0.08, drop);
  context.tube(rubber, [[0, -0.04, 0], [0, -0.075, 0], [offset * 0.3, -length * 0.55, -0.025], [offset, -length, -0.035]], 0.005);
  const clips = Math.max(1, Math.ceil(length / 0.25));
  for (let clip = 0; clip < clips; clip++) {
    const fraction = (clip + 0.5) / clips;
    const y = -0.06 - fraction * Math.max(0.02, length - 0.08);
    const x = offset * fraction * fraction;
    context.box(steel, x, y, -0.03, 0.025, 0.018, 0.015);
    context.box(aluminum, x, y, -0.019, 0.018, 0.018, 0.008);
    buildFaceFastener(context, x + 0.008, y, -0.012, 0.004);
  }
}

export function buildShadeControllerEnclosure(context: ArchitectureContext, controller: FacadeShadeController): Animation {
  const { aluminum, rubber, steel, green, red, yellow } = context.palette;
  const width = 0.21;
  const height = 0.31;
  context.box(rubber, 0, height / 2, -0.003, width + 0.012, height + 0.012, 0.016);
  context.roundedBox(aluminum, 0, height / 2, 0.036, width, height, 0.072, 0.012);
  context.box(rubber, 0, height / 2, 0.075, width - 0.012, height - 0.012, 0.008);
  context.roundedBox(aluminum, 0, height / 2, 0.083, width - 0.019, height - 0.019, 0.014, 0.008);
  for (const side of [-1, 1]) {
    for (const y of [0.025, height - 0.025]) buildFaceFastener(context, side * (width / 2 - 0.023), y, 0.094, 0.006);
  }
  buildFoldedFlashing(context.at({ x: 0, y: height + 0.012, z: -0.006 }), width + 0.035, [[0.02, 0], [0.006, 0.11], [-0.012, 0.115]], 0.003);
  const face = context.at({ x: 0, y: 0, z: 0.094 });
  const normal = buildStatusLens(face.at({ x: -0.05, y: 0.25, z: 0 }), green);
  const moving = buildStatusLens(face.at({ x: 0, y: 0.25, z: 0 }), yellow);
  const fault = buildStatusLens(face.at({ x: 0.05, y: 0.25, z: 0 }), red);
  const travelContext = face.at({ x: 0, y: 0.205, z: 0 });
  const travel = buildTravelScale(travelContext, 0.12);
  const gauge = buildCurrentGauge(face.at({ x: -0.045, y: 0.13, z: 0 }));
  const selector = buildSelectorDial(face.at({ x: 0.047, y: 0.13, z: 0 }));
  buildWeatherproofButton(face.at({ x: -0.04, y: 0.055, z: 0 }), green);
  buildWeatherproofButton(face.at({ x: 0.04, y: 0.055, z: 0 }), red);
  context.box(steel, 0, 0.012, 0.048, 0.055, 0.025, 0.055);
  buildControlCable(context.at({ x: -0.045, y: 0, z: 0.025 }), 0.16, -0.03);
  buildControlCable(context.at({ x: 0.045, y: 0, z: 0.025 }), 0.24, 0.02);
  const travelPosition = new THREE.Vector3();
  return (seconds) => {
    const state = controller.state;
    normal.visible = !state.windLocked && !state.cooling;
    moving.visible = state.running && Math.floor(seconds * 3) % 2 === 0;
    fault.visible = state.windLocked || state.cooling;
    travelContext.world([-0.06 + state.position * 0.12, 0.004, 0.019], travelPosition);
    travel.position.copy(travelPosition);
    gauge.rotation.z = Math.PI * 0.65 - Math.min(1.2, state.motorLoad) / 1.2 * Math.PI * 1.3;
    selector.rotation.z = state.windLocked ? Math.PI / 3 : state.cooling ? -Math.PI / 3 : 0;
  };
}
