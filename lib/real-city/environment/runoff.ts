import * as THREE from "three";
import { RoofDrainageModel, OpenDrainChannel, type DrainageWeather } from "../physics/drainage";
import { clamp, GRAVITY } from "../physics/math";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { createTerrainPoint } from "./terrain";
import { StormwaterNetwork } from "../physics/stormwater-network";
import { createSurfaceSample } from "./hydrology";

type RoofOutlet = {
  x: number;
  y: number;
  z: number;
  outwardX: number;
  outwardZ: number;
  rotation: number;
  roof: RoofDrainageModel;
  channel: OpenDrainChannel;
  drainX: number;
  drainZ: number;
  phase: number;
  node: number;
};

export function buildRoofRunoffLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, terrain, physics, weather, water, interactions, budget } = context;
  const count = budget.simulatedHz < 60 ? 5 : 8;
  const outlets: RoofOutlet[] = [];
  const network = new StormwaterNetwork();
  const surface = createSurfaceSample();
  const ground = createTerrainPoint();
  for (const footprint of terrain.footprints) {
    if (outlets.length >= count) break;
    if (footprint.height < 4 || footprint.halfWidth < 4) continue;
    const rotation = footprint.rotationY ?? 0;
    const outwardX = Math.sin(rotation);
    const outwardZ = Math.cos(rotation);
    const cornerX = footprint.halfWidth * 0.73;
    const cornerZ = footprint.halfDepth + 0.09;
    const x = footprint.x + Math.cos(rotation) * cornerX + Math.sin(rotation) * cornerZ;
    const z = footprint.z - Math.sin(rotation) * cornerX + Math.cos(rotation) * cornerZ;
    const drainX = x + outwardX * 0.52;
    const drainZ = z + outwardZ * 0.52;
    terrain.sample(drainX, drainZ, ground);
    if (ground.kind === "building" || ground.kind === "water") continue;
    const base = Math.max(ground.height, footprint.baseY ?? 0.4);
    const catchment = new RoofDrainageModel({
      area: footprint.halfWidth * footprint.halfDepth * 2,
      slope: 0.025,
      outletArea: Math.PI * 0.035 * 0.035,
      storageDepth: 0.018,
      thermalMass: 0.65,
    });
    outlets.push({
      x,
      y: base + 0.48,
      z,
      outwardX,
      outwardZ,
      rotation,
      roof: catchment,
      channel: new OpenDrainChannel(0.8, 0.28, 0.035, 0.018),
      drainX,
      drainZ,
      phase: outlets.length * 1.73,
      node: network.addNode(drainX, drainZ, ground.height, 1.2, 0.24),
    });
  }
  const outfall = network.addNode(200, 145, 0.3, 2.4, 0.7, true);
  for (let index = 0; index < outlets.length; index++) network.connect(outlets[index].node, index + 1 < outlets.length ? outlets[index + 1].node : outfall, 0.22);
  resources.reserveParticles(outlets.length * 2);
  const metal = resources.material("rainwater cast iron", () => new THREE.MeshStandardMaterial({ color: "#4f5857", roughness: 0.73, metalness: 0.6 }));
  const drainPipe = resources.material("rainwater zinc outlet", () => new THREE.MeshStandardMaterial({ color: "#737f7d", roughness: 0.6, metalness: 0.65 }));
  const liquid = resources.material("runoff liquid surface", () => new THREE.MeshPhysicalMaterial({ color: "#b5ced3", roughness: 0.1, metalness: 0.05, clearcoat: 1, transparent: true, opacity: 0.42, depthWrite: false }));
  const iceMaterial = resources.material("roof icicle ice", () => new THREE.MeshPhysicalMaterial({ color: "#c9e0e7", roughness: 0.16, metalness: 0.12, clearcoat: 1, transparent: true, opacity: 0.7 }));
  const grateGeometry = resources.geometry("slotted storm drain", () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.29, -0.19);
    shape.lineTo(0.29, -0.19);
    shape.lineTo(0.29, 0.19);
    shape.lineTo(-0.29, 0.19);
    shape.closePath();
    for (let slot = 0; slot < 7; slot++) {
      const x = -0.245 + slot * 0.075;
      const hole = new THREE.Path();
      hole.moveTo(x, -0.135);
      hole.lineTo(x + 0.04, -0.135);
      hole.lineTo(x + 0.04, 0.135);
      hole.lineTo(x, 0.135);
      hole.closePath();
      shape.holes.push(hole);
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.025, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 1 });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });
  const elbowGeometry = resources.geometry("curved drainage spout", () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.28, -0.07),
      new THREE.Vector3(0, 0.11, -0.07),
      new THREE.Vector3(0, 0.02, -0.025),
      new THREE.Vector3(0, 0, 0.09),
    ]);
    return new THREE.TubeGeometry(curve, 8, 0.037, 8, false);
  });
  const streamGeometry = resources.geometry("ballistic runoff stream", () => {
    const points: THREE.Vector3[] = [];
    const flight = Math.sqrt(2 * 0.45 / GRAVITY);
    for (let index = 0; index <= 12; index++) {
      const t = index / 12 * flight;
      points.push(new THREE.Vector3(0, -0.5 * GRAVITY * t * t, t));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, 0.008, 5, false);
  });
  const icicleGeometry = resources.geometry("tapered freeze drip", () => {
    const geometry = new THREE.LatheGeometry([
      new THREE.Vector2(0.022, 0),
      new THREE.Vector2(0.021, -0.05),
      new THREE.Vector2(0.015, -0.28),
      new THREE.Vector2(0.012, -0.48),
      new THREE.Vector2(0.007, -0.71),
      new THREE.Vector2(0.002, -1),
    ], 9);
    return geometry;
  });
  const dropGeometry = resources.geometry("runoff droplets", () => new THREE.SphereGeometry(0.008, 6, 4));
  const grates = resources.batch("stormwater grates", grateGeometry, metal, Math.max(1, outlets.length));
  const elbows = resources.batch("rainwater outlet elbows", elbowGeometry, drainPipe, Math.max(1, outlets.length));
  const streams = resources.batch("roof drain flow", streamGeometry, liquid, Math.max(1, outlets.length), true);
  const icicles = resources.batch("frozen drain tips", icicleGeometry, iceMaterial, Math.max(1, outlets.length), true);
  const drops = resources.batch("runoff detached droplets", dropGeometry, liquid, Math.max(1, outlets.length * 2), true);
  streams.frustumCulled = false;
  icicles.frustumCulled = false;
  drops.frustumCulled = false;
  streams.count = 0;
  icicles.count = 0;
  drops.count = 0;
  const dummy = new THREE.Object3D();
  outlets.forEach((outlet, index) => {
    terrain.sample(outlet.drainX, outlet.drainZ, ground);
    dummy.position.set(outlet.drainX, ground.height + 0.012, outlet.drainZ);
    dummy.rotation.set(0, outlet.rotation, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    grates.setMatrixAt(index, dummy.matrix);
    dummy.position.set(outlet.x, outlet.y, outlet.z);
    dummy.updateMatrix();
    elbows.setMatrixAt(index, dummy.matrix);
  });
  grates.count = outlets.length;
  elbows.count = outlets.length;
  resources.finalizeBounds(grates);
  resources.finalizeBounds(elbows);
  const climate: DrainageWeather = { rain: 0, snow: 0, temperature: 18, sunlight: 0.8, wind: 2, humidity: 0.6 };
  let accumulated = 0;
  const impactPoint = new THREE.Vector3();
  physics.beforeStep((dt, seconds) => {
    accumulated += dt;
    if (accumulated < 0.1) return;
    const step = Math.min(0.25, accumulated);
    accumulated = 0;
    climate.rain = weather.state.rain;
    climate.snow = weather.state.snow;
    climate.temperature = weather.state.temperature;
    climate.sunlight = weather.state.sunExposure;
    climate.wind = weather.state.windSpeed;
    climate.humidity = weather.state.humidity;
    for (const outlet of outlets) {
      outlet.roof.step(step, climate);
      const flow = outlet.roof.state.outflow;
      const discharged = outlet.channel.step(step * 12, flow, climate.temperature, weather.seasonId === "autumn" ? 0.65 : 0.1);
      if (outlet.channel.state.velocity > 0.4) outlet.channel.clearDebris(step * 0.04);
      water.addWater(outlet.drainX, outlet.drainZ, (flow - discharged) * step / 0.5);
      water.sample(outlet.drainX, outlet.drainZ, surface);
      const ponded = Math.min(surface.water * 0.5 / step, network.inletCapacity(outlet.node, surface.water, 0.075));
      if (ponded > 0) water.addWater(outlet.drainX, outlet.drainZ, -ponded * step / 0.5);
      network.inflow(outlet.node, discharged + ponded, weather.seasonId === "autumn" ? 0.02 : 0.005);
      if (outlet.channel.state.velocity > 0.8) network.clearInlet(outlet.node, step * 0.001);
      if (flow > 0.00006 && Math.sin(seconds * 7 + outlet.phase) > 0.5) {
        terrain.sample(outlet.drainX, outlet.drainZ, ground);
        impactPoint.set(outlet.drainX, ground.height, outlet.drainZ);
        interactions.record("drain", impactPoint, Math.min(4, flow * 1000), 0.12, seconds);
      }
    }
    network.step(step * 12, -0.02 + Math.sin(seconds * Math.PI * 2 / 480) * 0.045, weather.seasonId === "autumn" ? 0.6 : 0.1);
    for (const outlet of outlets) {
      const surcharge = network.nodes[outlet.node].surcharge;
      if (surcharge > 0) water.addWater(outlet.drainX, outlet.drainZ, surcharge * step / 0.5);
    }
  });
  const dropPosition = new THREE.Vector3();
  return {
    update(seconds, night) {
      let streamCount = 0;
      let icicleCount = 0;
      let dropCount = 0;
      for (const outlet of outlets) {
        const flow = outlet.roof.sampleDischarge(0.5);
        const velocity = Math.max(0.35, outlet.roof.state.flowVelocity);
        if (flow > 0.00003) {
          const radius = Math.sqrt(flow / (Math.PI * velocity));
          dummy.position.set(outlet.x + outlet.outwardX * 0.09, outlet.y, outlet.z + outlet.outwardZ * 0.09);
          dummy.rotation.set(0, outlet.rotation, 0);
          dummy.scale.set(clamp(radius / 0.008, 0.2, 2), 1, clamp(velocity, 0.3, 2));
          dummy.updateMatrix();
          streams.setMatrixAt(streamCount++, dummy.matrix);
          for (let drop = 0; drop < 2; drop++) {
            const age = ((seconds * 2.9 + outlet.phase + drop * 0.5) % 1) * 0.34;
            const vertical = 0.5 * GRAVITY * age * age;
            if (vertical > 0.46) continue;
            dropPosition.set(outlet.x + outlet.outwardX * (0.1 + age * velocity), outlet.y - vertical, outlet.z + outlet.outwardZ * (0.1 + age * velocity));
            dummy.position.copy(dropPosition);
            dummy.rotation.set(0, 0, 0);
            dummy.scale.set(1, 1 + age * 3, 1);
            dummy.updateMatrix();
            drops.setMatrixAt(dropCount++, dummy.matrix);
          }
        }
        if (outlet.roof.state.icicleLength > 0.015) {
          dummy.position.set(outlet.x + outlet.outwardX * 0.09, outlet.y, outlet.z + outlet.outwardZ * 0.09);
          dummy.rotation.set(0, outlet.rotation, 0);
          dummy.scale.set(1, outlet.roof.state.icicleLength, 1);
          dummy.updateMatrix();
          icicles.setMatrixAt(icicleCount++, dummy.matrix);
        }
      }
      streams.count = streamCount;
      icicles.count = icicleCount;
      drops.count = dropCount;
      streams.instanceMatrix.needsUpdate = true;
      icicles.instanceMatrix.needsUpdate = true;
      drops.instanceMatrix.needsUpdate = true;
      liquid.envMapIntensity = night ? 0.3 : 0.85;
      resources.group.userData.roofDrainage = outlets.reduce((sum, outlet) => sum + outlet.roof.waterBudget().stored, 0);
    },
    reset() {
      accumulated = 0;
      network.reset();
      for (const outlet of outlets) {
        outlet.roof.reset(weather.state.temperature);
        outlet.channel.reset();
      }
      streams.count = 0;
      icicles.count = 0;
      drops.count = 0;
    },
  };
}
