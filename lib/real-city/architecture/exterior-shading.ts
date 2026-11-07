import * as THREE from "three";
import { ArchitectureContext, type Animation, type Point } from "./context";
import { buildAnchorPlate, buildFaceFastener, buildSlottedConnection } from "./exterior-fixings";
import { FacadeShadeController } from "./exterior-controls";
import { AwningKinematics } from "./exterior-awning-kinematics";
import { buildShadeControllerEnclosure } from "./exterior-control-enclosure";
import {
  buildAwningElbowJoint,
  buildAwningFrontEnd,
  buildAwningShoulderJoint,
  buildCanopyArmProtectiveBoot,
  buildCassetteEndGearbox,
  buildFabricEdgeRope,
  buildLouverBearing,
  buildLouverDriveUnit,
  buildLouverLinkPin,
  buildShutterGuideShoe,
  buildShutterTrackWheel,
  buildShutterWallStop,
  buildZipScreenGuide,
} from "./exterior-shading-hardware";

type MovingMember = {
  set: (a: Point, b: Point) => void;
};

function movingMember(context: ArchitectureContext, name: string, width: number, depth: number, material: THREE.Material): MovingMember {
  const root = context.moving(name, [0, 0, 0], moving => {
    moving.box(material, 0, 0, 0, width, 1, depth);
  });
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  return {
    set(a, b) {
      context.world(a, start);
      context.world(b, end);
      direction.copy(end).sub(start);
      const length = direction.length();
      root.position.copy(start).addScaledVector(direction, 0.5);
      root.quaternion.setFromUnitVectors(up, direction.normalize());
      root.scale.y = Math.max(0.001, length);
    },
  };
}

function buildAirfoilGeometry(context: ArchitectureContext, length: number, chord: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-chord / 2, 0);
  shape.quadraticCurveTo(-chord * 0.2, chord * 0.09, chord * 0.2, chord * 0.045);
  shape.quadraticCurveTo(chord * 0.42, chord * 0.02, chord / 2, 0);
  shape.quadraticCurveTo(chord * 0.2, -chord * 0.028, -chord * 0.3, -chord * 0.025);
  shape.quadraticCurveTo(-chord * 0.48, -chord * 0.02, -chord / 2, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 4 });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(-length / 2, 0, 0);
  return context.geometry(geometry);
}

export function buildOperableExteriorLouvers(context: ArchitectureContext, width: number, height: number, phase: number): Animation {
  const { aluminum, steel, rubber } = context.palette;
  const railHeight = height + 0.08;
  const railDistance = width / 2 + 0.035;
  const count = Math.max(4, Math.min(12, Math.ceil(height / 0.19)));
  const pitch = height / count;
  const chord = pitch * 1.18;
  const bladeGeometry = buildAirfoilGeometry(context, width - 0.045, chord);
  const blades: THREE.Group[] = [];
  const crankRoots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    context.box(steel, side * railDistance, height / 2, 0.07, 0.042, railHeight, 0.08);
    context.box(aluminum, side * (railDistance + 0.025), height / 2, 0.095, 0.018, railHeight, 0.12);
    for (const y of [0.12, height - 0.12]) {
      buildAnchorPlate(context.at({ x: side * railDistance, y, z: -0.015 }), 0.12, 0.15, 0.014, false);
    }
  }
  context.box(aluminum, 0, height + 0.045, 0.08, width + 0.16, 0.08, 0.17);
  context.box(rubber, 0, height + 0.001, 0.15, width + 0.1, 0.012, 0.015);
  const bladeZ = 0.12;
  for (let blade = 0; blade < count; blade++) {
    const y = (blade + 0.5) * pitch;
    for (const side of [-1, 1]) {
      buildLouverBearing(context.at({ x: side * railDistance, y, z: bladeZ, yaw: side * Math.PI / 2 }), 0.018);
    }
    const root = context.moving("Exterior adjustable airfoil louver", [0, y, bladeZ], moving => {
      moving.part(aluminum, bladeGeometry, [0, 0, 0]);
      for (const side of [-1, 1]) {
        moving.box(steel, side * (width / 2 - 0.008), 0, 0, 0.035, 0.017, 0.017);
        moving.box(rubber, side * (width / 2 - 0.03), 0, 0, 0.012, 0.025, chord * 0.8);
      }
    });
    blades.push(root);
    const crank = context.moving("Louver parallel linkage crank", [railDistance + 0.035, y, bladeZ], moving => {
      moving.box(steel, 0, 0, -0.024, 0.014, 0.016, 0.055);
      buildLouverLinkPin(moving.at({ x: 0, y: 0, z: -0.052, yaw: Math.PI / 2 }));
    });
    crankRoots.push(crank);
  }
  const linkage = context.moving("Louver vertical connecting bar", [railDistance + 0.035, height / 2, bladeZ - 0.052], moving => {
    moving.box(steel, 0, 0, 0, 0.014, height - pitch, 0.014);
  });
  const motorY = Math.min(0.3, height * 0.25);
  buildLouverDriveUnit(context.at({ x: railDistance + 0.065, y: motorY - 0.11, z: 0 }), 0.22);
  const actuator = movingMember(context, "Louver actuator piston", 0.018, 0.018, steel);
  const controller = new FacadeShadeController("louver", { ...context.local, yaw: context.local.yaw ?? 0 }, phase);
  const indicate = buildShadeControllerEnclosure(context.at({ x: railDistance + 0.14, y: Math.max(0.1, height - 0.4), z: 0.015 }), controller);
  const linkageLocation = new THREE.Vector3();
  return (seconds, night, season) => {
    const state = controller.update(seconds, night, season);
    const angle = -0.08 - state.position * 1.14;
    const vibration = Math.sin(seconds * 0.7 + phase) * controller.climate.windAcross * 0.0008;
    for (let blade = 0; blade < blades.length; blade++) {
      blades[blade].rotation.x = angle + vibration;
      crankRoots[blade].rotation.x = angle;
    }
    const linkY = Math.sin(angle) * 0.052;
    const linkZ = -Math.cos(angle) * 0.052;
    context.world([railDistance + 0.035, height / 2 + linkY, bladeZ + linkZ], linkageLocation);
    linkage.position.copy(linkageLocation);
    actuator.set([railDistance + 0.065, motorY + 0.1, 0.04], [railDistance + 0.035, pitch / 2 + linkY, bladeZ + linkZ]);
    indicate(seconds, night, season);
  };
}

export function buildFixedSolarFins(context: ArchitectureContext, width: number, height: number, projection: number, vertical = false): void {
  const { aluminum, steel, rubber } = context.palette;
  if (vertical) {
    const count = Math.max(3, Math.ceil(width / 0.48));
    const pitch = width / count;
    for (let fin = 0; fin <= count; fin++) {
      const x = -width / 2 + fin * pitch;
      context.box(aluminum, x, height / 2, projection / 2, 0.035, height + 0.1, projection, -0.2);
      for (const y of [0.08, height - 0.08]) {
        context.box(steel, x, y, -0.015, 0.085, 0.08, 0.06);
        buildFaceFastener(context, x, y, 0.019, 0.008, true);
      }
      context.box(rubber, x, height / 2, -0.005, 0.045, height, 0.015);
    }
    return;
  }
  const count = Math.max(2, Math.ceil(height / 0.72));
  for (let fin = 0; fin < count; fin++) {
    const y = height - fin * height / count;
    context.panel(aluminum, [
      [-width / 2 - 0.08, y + 0.01, 0],
      [width / 2 + 0.08, y + 0.01, 0],
      [width / 2 + 0.08, y - 0.055, projection],
      [-width / 2 - 0.08, y - 0.055, projection],
    ]);
    context.box(aluminum, 0, y - 0.065, projection, width + 0.16, 0.025, 0.02);
    for (const side of [-1, 1]) {
      const x = side * width * 0.37;
      context.rectangularBeam(steel, [x, y - 0.025, 0], [x, y - 0.075, projection - 0.025], 0.025, 0.03);
      buildSlottedConnection(context.at({ x, y: y - 0.08, z: -0.008 }), 0.085, 0.15, 0.025);
    }
  }
}

export function buildArticulatedAwning(context: ArchitectureContext, width: number, projection: number, phase: number): Animation {
  const { aluminum, steel, fabric, white, rubber } = context.palette;
  const cassetteDepth = 0.18;
  const slope = 0.16;
  const kinematics = new AwningKinematics(width, projection, slope);
  context.roundedBox(aluminum, 0, 0.025, 0.018, width + 0.19, 0.18, cassetteDepth, 0.035);
  context.box(rubber, 0, -0.034, 0.112, width + 0.12, 0.018, 0.025);
  for (const side of [-1, 1]) {
    buildAnchorPlate(context.at({ x: side * width * 0.34, y: -0.02, z: -0.1 }), 0.19, 0.2, 0.018);
    buildAwningShoulderJoint(context.at({ x: side * width * 0.34, y: -0.02, z: -0.02 }));
    buildCassetteEndGearbox(context.at({ x: side * (width / 2 + 0.085), y: 0.025, z: 0.02, yaw: side * Math.PI / 2 }));
  }
  const roll = context.moving("Awning fabric roll", [0, 0.025, 0.035], moving => {
    moving.rectangularBeam(fabric, [-width / 2, 0, 0], [width / 2, 0, 0], 0.11, 0.11);
  });
  const canvas = context.moving("Tensioned retractable awning canvas", [0, -0.025, 0.1], moving => {
    const stripes = Math.max(4, Math.ceil(width / 0.3));
    for (let stripe = 0; stripe < stripes; stripe++) {
      const left = -width / 2 + stripe * width / stripes;
      const right = left + width / stripes;
      moving.panel(stripe % 2 ? fabric : white, [[left, 0, 0], [right, 0, 0], [right, -slope, 1], [left, -slope, 1]]);
      moving.rectangularBeam(stripe % 2 ? white : fabric, [left + 0.005, -0.002, 0], [left + 0.005, -slope - 0.002, 1], 0.003, 0.003);
    }
    buildFabricEdgeRope(moving, width, 1, slope);
  });
  const front = context.moving("Awning rigid front bar and valance", [0, -projection * slope, projection], moving => {
    moving.box(aluminum, 0, 0, 0, width + 0.055, 0.065, 0.07);
    moving.box(fabric, 0, -0.1, 0.008, width, 0.14, 0.008);
    moving.box(white, 0, -0.165, 0.015, width, 0.012, 0.007);
    for (const side of [-1, 1]) buildAwningFrontEnd(moving.at({ x: side * width / 2, y: 0, z: 0, yaw: side * Math.PI / 2 }), 0.065);
  });
  const armPairs = [-1, 1].map(side => {
    const shoulder = movingMember(context, "Awning shoulder arm", 0.038, 0.045, aluminum);
    const forearm = movingMember(context, "Awning forearm", 0.031, 0.04, aluminum);
    const cable = movingMember(context, "Awning tension cable", 0.008, 0.008, steel);
    const elbow = context.moving("Awning elbow hinge", [0, 0, 0], moving => {
      buildAwningElbowJoint(moving);
      buildCanopyArmProtectiveBoot(moving.at({ x: 0, y: -0.01, z: -0.06 }), 0.05);
    });
    return { side, shoulder, forearm, cable, elbow };
  });
  const controller = new FacadeShadeController("awning", { ...context.local, yaw: context.local.yaw ?? 0 }, phase);
  const endpoint = new THREE.Vector3();
  return (seconds, night, season) => {
    const state = controller.update(seconds, night, season);
    kinematics.update(state.position, controller.climate.windAcross, controller.climate.windNormal, seconds);
    const extension = kinematics.extension;
    canvas.scale.set(...kinematics.canvasScale());
    roll.rotation.x = extension / 0.055;
    context.world(kinematics.front, endpoint);
    front.position.copy(endpoint);
    for (const arm of armPairs) {
      const pose = arm.side < 0 ? kinematics.left : kinematics.right;
      arm.shoulder.set(pose.shoulder, pose.elbow);
      arm.forearm.set(pose.elbow, pose.wrist);
      arm.cable.set(pose.cableStart, pose.cableEnd);
      context.world(pose.elbow, endpoint);
      arm.elbow.position.copy(endpoint);
      arm.elbow.rotation.y = (context.local.yaw ?? 0) + pose.elbowYaw;
    }
    front.rotation.z = kinematics.frontRoll;
  };
}

export function buildSlidingExteriorShutters(context: ArchitectureContext, width: number, height: number, phase: number): Animation {
  const { oak, aluminum, steel, rubber } = context.palette;
  const panelWidth = width / 2 + 0.035;
  context.box(aluminum, 0, height + 0.08, 0.035, width * 1.95, 0.055, 0.08);
  context.box(rubber, 0, height + 0.05, 0.061, width * 1.91, 0.012, 0.024);
  for (const side of [-1, 1]) {
    buildAnchorPlate(context.at({ x: side * width * 0.75, y: height + 0.08, z: -0.008 }), 0.14, 0.15, 0.012, false);
    context.box(aluminum, side * width * 0.95, height + 0.08, 0.065, 0.04, 0.08, 0.07);
    context.box(rubber, side * width * 0.93, height + 0.08, 0.065, 0.02, 0.07, 0.06);
    buildShutterGuideShoe(context.at({ x: side * width * 0.46, y: -0.06, z: 0.11 }), 0.12);
    buildShutterWallStop(context.at({ x: side * width * 0.9, y: height * 0.3, z: -0.015 }));
  }
  const shutters = [-1, 1].map(side => {
    const group = context.moving("Exterior sliding timber shutter", [side * width / 4, height / 2, 0.14], moving => {
      for (const edge of [-1, 1]) {
        moving.box(oak, edge * panelWidth / 2, 0, 0, 0.048, height, 0.045);
        moving.box(oak, 0, edge * height / 2, 0, panelWidth + 0.05, 0.055, 0.045);
      }
      const slats = Math.max(6, Math.ceil(height / 0.12));
      for (let slat = 0; slat < slats; slat++) {
        const y = -height / 2 + (slat + 0.5) * height / slats;
        moving.panel(oak, [
          [-panelWidth / 2 + 0.02, y - 0.025, 0.027],
          [panelWidth / 2 - 0.02, y - 0.025, 0.027],
          [panelWidth / 2 - 0.02, y + 0.025, -0.025],
          [-panelWidth / 2 + 0.02, y + 0.025, -0.025],
        ]);
      }
      for (const hanger of [-1, 1]) {
        const x = hanger * panelWidth * 0.31;
        moving.box(steel, x, height / 2 + 0.025, -0.055, 0.025, 0.09, 0.035);
        buildShutterTrackWheel(moving.at({ x, y: height / 2 + 0.07, z: -0.07 }), 0.023);
        buildFaceFastener(moving, x, height / 2 - 0.025, 0.026, 0.008, true);
      }
      moving.box(aluminum, -side * (panelWidth / 2 - 0.07), -0.08, 0.045, 0.025, 0.14, 0.025);
    });
    return { side, group };
  });
  const world = new THREE.Vector3();
  const controller = new FacadeShadeController("shutter", { ...context.local, yaw: context.local.yaw ?? 0 }, phase);
  return (seconds, night, season) => {
    const state = controller.update(seconds, night, season);
    const stagger = Math.sin(phase) * 0.025;
    for (const shutter of shutters) {
      const open = Math.min(1, Math.max(0, state.position + shutter.side * stagger));
      const x = shutter.side * (width / 4 + open * panelWidth * 0.94);
      context.world([x, height / 2, 0.14], world);
      shutter.group.position.copy(world);
    }
  };
}

export function buildRetractableSolarScreen(context: ArchitectureContext, width: number, height: number): Animation {
  const { aluminum, fabric, steel, rubber } = context.palette;
  const drumRadius = 0.055;
  context.box(aluminum, 0, height + 0.065, 0.035, width + 0.11, 0.13, 0.14);
  for (const side of [-1, 1]) {
    buildZipScreenGuide(context.at({ x: side * (width / 2 + 0.024), y: 0, z: 0.04 }), height);
    buildCassetteEndGearbox(context.at({ x: side * (width / 2 + 0.055), y: height + 0.065, z: 0.035, yaw: side * Math.PI / 2 }), 0.05);
  }
  const screen = context.moving("Exterior zip-guided solar screen", [0, height, 0.062], moving => {
    moving.box(fabric, 0, -0.5, 0, width, 1, 0.006);
    for (const side of [-1, 1]) moving.box(steel, side * width / 2, -0.5, 0.005, 0.006, 1, 0.006);
  });
  const bottom = context.moving("Solar screen weighted bottom rail", [0, height, 0.065], moving => {
    moving.box(aluminum, 0, -0.025, 0, width + 0.02, 0.05, 0.04);
    moving.box(rubber, 0, -0.052, 0, width + 0.02, 0.008, 0.034);
  });
  const drum = context.moving("Solar screen winding drum", [0, height + 0.065, 0.04], moving => {
    moving.rectangularBeam(steel, [-width / 2, 0, 0], [width / 2, 0, 0], drumRadius, drumRadius);
  });
  const bottomPosition = new THREE.Vector3();
  const controller = new FacadeShadeController("screen", { ...context.local, yaw: context.local.yaw ?? 0 });
  return (seconds, night, season) => {
    const state = controller.update(seconds, night, season);
    const length = height * Math.max(0.025, state.position);
    screen.scale.y = length;
    drum.rotation.x = length / drumRadius;
    context.world([0, height - length, 0.065], bottomPosition);
    bottom.position.copy(bottomPosition);
  };
}

export function buildBriseSoleilShelf(context: ArchitectureContext, width: number, projection: number): void {
  const { aluminum, steel, rubber } = context.palette;
  const blades = Math.max(3, Math.ceil(projection / 0.14));
  const spacing = projection / blades;
  for (let blade = 0; blade < blades; blade++) {
    const z = (blade + 0.5) * spacing;
    context.box(aluminum, 0, -0.018 - z * 0.035, z, width, 0.025, spacing * 0.72);
    context.box(rubber, 0, -0.034 - z * 0.035, z + spacing * 0.3, width - 0.025, 0.007, 0.007);
  }
  const supports = Math.max(2, Math.ceil(width / 1.1));
  for (let support = 0; support < supports; support++) {
    const x = -width / 2 + 0.06 + support * (width - 0.12) / (supports - 1);
    context.rectangularBeam(steel, [x, -0.055, 0], [x, -0.055 - projection * 0.035, projection], 0.035, 0.055);
    buildAnchorPlate(context.at({ x, y: -0.06, z: -0.01 }), 0.1, 0.2, 0.014, false);
    context.rectangularBeam(steel, [x, -0.15, 0], [x, -0.06, projection * 0.72], 0.018, 0.025);
  }
  context.box(aluminum, 0, -0.05 - projection * 0.035, projection, width + 0.05, 0.07, 0.035);
}
