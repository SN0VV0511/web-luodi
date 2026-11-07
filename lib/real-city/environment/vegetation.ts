import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { createBotanicalLeaf, createFlowerHead, createGrassTuft, createWoodyStem } from "./plant-geometry";
import { createBotanicalMaterials } from "./plant-materials";
import { createRandom } from "../physics/math";
import { PlantPhysiology } from "./plant-physiology";
import { BranchDynamics } from "../physics/branch-dynamics";
import { createTerrainPoint } from "./terrain";

type ShrubSite = { x: number; y: number; z: number; size: number; yaw: number; evergreen: boolean };

export function buildBotanicalGroundLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, terrain, weather, budget } = context;
  const random = createRandom(37914);
  const compact = budget.simulatedHz < 60;
  const materials = createBotanicalMaterials(resources, weather);
  const dummy = new THREE.Object3D();
  const normal = new THREE.Vector3();
  const upright = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  const ground = createTerrainPoint();
  const sites: ShrubSite[] = [];
  const grassSites: { x: number; y: number; z: number; scale: number; yaw: number }[] = [];
  const maximumGrass = compact ? 700 : 1350;
  const maximumShrubs = compact ? 22 : 38;
  for (let attempt = 0; attempt < maximumGrass * 7 && grassSites.length < maximumGrass; attempt++) {
    const clustered = attempt % 3 !== 0;
    const x = clustered ? -59 + random() * 118 : -215 + random() * 430;
    const z = clustered ? -99 + random() * 180 : -220 + random() * 320;
    if (!terrain.clearForPlant(x, z, 0.32)) continue;
    terrain.sample(x, z, ground);
    if (ground.kind !== "park") continue;
    grassSites.push({ x, y: ground.height + 0.008, z, scale: 0.65 + random() * 0.7, yaw: random() * Math.PI * 2 });
  }
  for (let attempt = 0; attempt < 600 && sites.length < maximumShrubs; attempt++) {
    const x = -58 + random() * 116;
    const z = -97 + random() * 174;
    if (!terrain.clearForPlant(x, z, 1.2)) continue;
    if (sites.some(site => Math.hypot(site.x - x, site.z - z) < 5)) continue;
    terrain.sample(x, z, ground);
    sites.push({ x, y: ground.height, z, size: 0.7 + random() * 0.6, yaw: random() * Math.PI * 2, evergreen: sites.length % 3 === 0 });
  }
  const grassGeometry = resources.geometry("individual grass blades", () => createGrassTuft(4912, 5));
  const grassMesh = resources.batch("park grass tufts", grassGeometry, materials.grass, grassSites.length);
  grassSites.forEach((site, index) => {
    dummy.position.set(site.x, site.y, site.z);
    dummy.rotation.set(0, site.yaw, 0);
    dummy.scale.setScalar(site.scale);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(index, dummy.matrix);
    color.setHSL(0.2 + random() * 0.045, 0.22 + random() * 0.14, 0.63 + random() * 0.22);
    grassMesh.setColorAt(index, color);
  });
  resources.finalizeBounds(grassMesh);
  const stemGeometry = resources.geometry("branching shrubs", () => createWoodyStem(809, 1.25, 0.45));
  const stems = resources.batch("shrub woody stems", stemGeometry, materials.bark, sites.length);
  const evergreenSites = sites.filter(site => site.evergreen);
  const deciduousSites = sites.filter(site => !site.evergreen);
  const leavesPerShrub = compact ? 18 : 28;
  const evergreenGeometry = resources.geometry("evergreen botanical leaf", () => createBotanicalLeaf("lanceolate"));
  const deciduousGeometry = resources.geometry("deciduous botanical leaf", () => createBotanicalLeaf("ovate"));
  const evergreenLeaves = resources.batch("evergreen shrub leaves", evergreenGeometry, materials.evergreen, Math.max(1, evergreenSites.length * leavesPerShrub));
  const deciduousLeaves = resources.batch("deciduous shrub leaves", deciduousGeometry, materials.deciduous, Math.max(1, deciduousSites.length * leavesPerShrub));
  const deciduousMatrices: THREE.Matrix4[] = [];
  const leafSizes: number[] = [];
  const evergreenMatrices: THREE.Matrix4[] = [];
  const evergreenRoots: number[] = [];
  const deciduousRoots: number[] = [];
  const stemMatrices: THREE.Matrix4[] = [];
  const physiology = new PlantPhysiology(sites, context.water, weather);
  const mechanics = new BranchDynamics(sites.map(site => ({
    x: site.x, y: site.y, z: site.z, height: site.size * 1.25,
    crownArea: 0.18 * site.size * site.size, stiffness: 7.5 * site.size,
    mass: 0.7 * site.size,
  })));
  context.physics.beforeStep((dt, seconds) => {
    for (let index = 0; index < sites.length; index++) mechanics.setCanopy(index, physiology.states[index].retainedLeaves, physiology.states[index].snowLoad);
    mechanics.step(dt, seconds, weather.wind);
  });
  sites.forEach((site, index) => {
    dummy.position.set(site.x, site.y, site.z);
    dummy.rotation.set(0, site.yaw, 0);
    dummy.scale.setScalar(site.size);
    dummy.updateMatrix();
    stems.setMatrixAt(index, dummy.matrix);
    stemMatrices.push(dummy.matrix.clone());
  });
  const placeLeaves = (chosen: ShrubSite[], mesh: THREE.InstancedMesh, record: boolean) => {
    let cursor = 0;
    for (const site of chosen) {
      for (let leaf = 0; leaf < leavesPerShrub; leaf++) {
        const branch = leaf % 5;
        const angle = branch * 2.399963 + site.yaw;
        const growth = 0.35 + (leaf / leavesPerShrub) * 0.6;
        const reach = (0.18 + random() * 0.35) * site.size;
        const x = site.x + Math.cos(angle) * reach;
        const z = site.z + Math.sin(angle) * reach;
        const y = site.y + (0.5 + growth * 0.76) * site.size;
        dummy.position.set(x, y, z);
        normal.set(Math.cos(angle) * 0.7, 0.4 + random() * 0.6, Math.sin(angle) * 0.7).normalize();
        dummy.quaternion.setFromUnitVectors(upright, normal);
        dummy.rotateY(random() * Math.PI * 2);
        const size = (0.12 + random() * 0.14) * site.size;
        dummy.scale.set(size, size * 1.1, size);
        dummy.updateMatrix();
        mesh.setMatrixAt(cursor, dummy.matrix);
        color.setRGB(0.7 + random() * 0.3, 0.8 + random() * 0.2, 0.65 + random() * 0.25);
        mesh.setColorAt(cursor, color);
        if (record) {
          deciduousMatrices.push(dummy.matrix.clone());
          leafSizes.push(size);
          deciduousRoots.push(sites.indexOf(site));
        } else {
          evergreenMatrices.push(dummy.matrix.clone());
          evergreenRoots.push(sites.indexOf(site));
        }
        cursor++;
      }
    }
    mesh.count = cursor;
    resources.finalizeBounds(mesh);
  };
  placeLeaves(evergreenSites, evergreenLeaves, false);
  placeLeaves(deciduousSites, deciduousLeaves, true);
  resources.finalizeBounds(stems);

  const reedGeometry = resources.geometry("lakeside reed blades", () => createBotanicalLeaf("reed"));
  const reeds = resources.batch("lakeside reeds", reedGeometry, materials.reed, compact ? 100 : 190);
  let reedCount = 0;
  for (let attempt = 0; attempt < 800 && reedCount < reeds.instanceMatrix.count; attempt++) {
    const angle = random() * Math.PI * 2;
    const ring = 1.04 + random() * 0.05;
    const x = -12 + Math.cos(angle) * 28 * ring;
    const z = -15 + Math.sin(angle) * 38 * ring;
    if (terrain.onParkWalk(x, z, 0.3)) continue;
    dummy.position.set(x, 0.21, z);
    dummy.rotation.set((random() - 0.5) * 0.35, angle + random(), (random() - 0.5) * 0.35);
    const height = 0.65 + random() * 0.7;
    dummy.scale.set(height, height, height);
    dummy.updateMatrix();
    reeds.setMatrixAt(reedCount++, dummy.matrix);
  }
  reeds.count = reedCount;
  resources.finalizeBounds(reeds);

  const flowerGeometry = resources.geometry("small park flowers", () => createFlowerHead(5));
  const flowers = resources.batch("seasonal meadow flowers", flowerGeometry, materials.flowers, compact ? 48 : 90);
  const flowerMatrices: THREE.Matrix4[] = [];
  let flowerCount = 0;
  for (let attempt = 0; attempt < grassSites.length && flowerCount < flowers.instanceMatrix.count; attempt++) {
    const site = grassSites[(attempt * 17) % grassSites.length];
    if (!site || terrain.inLake(site.x, site.z, 5)) continue;
    dummy.position.set(site.x, site.y + 0.19 + random() * 0.1, site.z);
    dummy.rotation.set((random() - 0.5) * 0.3, site.yaw, (random() - 0.5) * 0.3);
    dummy.scale.setScalar(0.6 + random() * 0.8);
    dummy.updateMatrix();
    flowers.setMatrixAt(flowerCount, dummy.matrix);
    flowerMatrices.push(dummy.matrix.clone());
    color.set(flowerCount % 3 === 0 ? "#e3c99d" : flowerCount % 3 === 1 ? "#e0d5cb" : "#b99fac");
    flowers.setColorAt(flowerCount, color);
    flowerCount++;
  }
  flowers.count = flowerCount;
  resources.finalizeBounds(flowers);
  let previousMechanicalUpdate = -1;
  const bentMatrix = new THREE.Matrix4();
  const motionVelocity = new THREE.Vector3();
  const bentPosition = new THREE.Vector3();
  let previousFlowerFactor = -1;
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const position = new THREE.Vector3();
  return {
    update(seconds, night, season) {
      materials.update(seconds, night, season);
      physiology.update(seconds, season);
      if (seconds - previousMechanicalUpdate >= 1 / 24 || seconds < previousMechanicalUpdate) {
        for (let index = 0; index < grassSites.length; index++) {
          const site = grassSites[index];
          const shade = physiology.canopy.shadeAt(site.x, site.z);
          color.setRGB(1 - shade * 0.18, 1 - shade * 0.1, 1 - shade * 0.2);
          grassMesh.setColorAt(index, color);
        }
        if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
      }
      if (seconds - previousMechanicalUpdate >= 1 / 24 || seconds < previousMechanicalUpdate) {
        previousMechanicalUpdate = seconds;
        stemMatrices.forEach((matrix, index) => {
          mechanics.transformMatrix(index, matrix, bentMatrix);
          stems.setMatrixAt(index, bentMatrix);
        });
        evergreenMatrices.forEach((matrix, index) => {
          const root = evergreenRoots[index];
          mechanics.transformMatrix(root, matrix, bentMatrix, 0.75);
          evergreenLeaves.setMatrixAt(index, bentMatrix);
          physiology.tint(root, color);
          evergreenLeaves.setColorAt(index, color);
        });
        for (let index = 0; index < deciduousMatrices.length; index++) {
          const root = deciduousRoots[index];
          const state = physiology.states[root];
          deciduousMatrices[index].decompose(position, quaternion, scale);
          mechanics.transformPoint(root, position, bentPosition);
          mechanics.angularVelocityAt(root, position, motionVelocity);
          const retained = (index * 0.61803398875) % 1 < state.retainedLeaves;
          dummy.position.copy(bentPosition);
          dummy.quaternion.copy(quaternion);
          dummy.rotateZ(motionVelocity.x * 0.03 + state.wiltAngle * 0.7);
          dummy.rotateX(state.wiltAngle * 0.35);
          dummy.scale.setScalar(retained ? leafSizes[index] * (0.82 + state.growth * 0.18) : 0);
          dummy.updateMatrix();
          deciduousLeaves.setMatrixAt(index, dummy.matrix);
          physiology.tint(root, color);
          deciduousLeaves.setColorAt(index, color);
        }
        stems.instanceMatrix.needsUpdate = true;
        evergreenLeaves.instanceMatrix.needsUpdate = true;
        deciduousLeaves.instanceMatrix.needsUpdate = true;
        if (evergreenLeaves.instanceColor) evergreenLeaves.instanceColor.needsUpdate = true;
        if (deciduousLeaves.instanceColor) deciduousLeaves.instanceColor.needsUpdate = true;
      }
      const flowerFactor = physiology.meanFlowers();
      if (Math.abs(flowerFactor - previousFlowerFactor) > 0.04) {
        previousFlowerFactor = flowerFactor;
        for (let index = 0; index < flowerMatrices.length; index++) {
          flowerMatrices[index].decompose(position, quaternion, scale);
          dummy.position.copy(position);
          dummy.quaternion.copy(quaternion);
          dummy.scale.copy(scale).multiplyScalar(flowerFactor);
          dummy.updateMatrix();
          flowers.setMatrixAt(index, dummy.matrix);
        }
        flowers.instanceMatrix.needsUpdate = true;
      }
    },
    reset() {
      previousFlowerFactor = -1;
      previousMechanicalUpdate = -1;
      physiology.reset();
      mechanics.reset();
    },
  };
}
