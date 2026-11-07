import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { CivicKit } from "../../city-civic";
import type { SeasonId } from "../../city-physics";
import { bindWorldScalePbr, createAshlarStonePbr, createBrushedMetalPbr } from "../../city-pbr";
import { ArchitectureLabelAtlas } from "./label-atlas";
import { buildCityModelBatches, setCityModelPartVisible, type CityModelPart } from "../render/model-batches";

export type Point = readonly [number, number, number];
export type Animation = (seconds: number, night: boolean, season: SeasonId) => void;
export type Palette = ReturnType<typeof makePalette>;
export type Section = { x: number; y: number; z: number; yaw?: number };
type MovingGeometry = { root: THREE.Group; geometry: THREE.BufferGeometry };
type MovingInstance = { root: THREE.Group; mesh: THREE.BatchedMesh; id: number; previous: THREE.Matrix4; visible: boolean };
export type DoorOccupant = { x: number; y?: number; z: number };
type DoorOccupancy = { points: readonly DoorOccupant[] };

function makePalette(kit: CivicKit) {
  const limestone = kit.solid("#c9c4b7", 0.86, 0.01);
  const concrete = kit.solid("#aaa99f", 0.9, 0.01);
  const steel = kit.solid("#464d50", 0.48, 0.72);
  const aluminum = kit.solid("#b4b9b8", 0.3, 0.82);
  const bronze = kit.solid("#75604b", 0.42, 0.7);
  const oak = kit.solid("#96734e", 0.72, 0.02);
  const rubber = kit.solid("#24282a", 0.98, 0);
  const porcelain = kit.solid("#e6e1d6", 0.23, 0.02);
  const clay = kit.solid("#a86b51", 0.88, 0);
  const white = kit.solid("#d7d5cc", 0.66, 0);
  const fabric = kit.solid("#6f796f", 0.96, 0);
  const dark = kit.solid("#333a3a", 0.74, 0.04);
  const red = kit.solid("#ab4538", 0.56, 0.08);
  const green = kit.solid("#3e6959", 0.64, 0.04);
  green.side = THREE.DoubleSide;
  const yellow = kit.solid("#d8ac4e", 0.66, 0.06);
  const water = new THREE.MeshPhysicalMaterial({ color: "#a4bec2", roughness: 0.12, transparent: true, opacity: 0.3, depthWrite: false, metalness: 0, ior: 1.33 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#b4c8c7", roughness: 0.11, metalness: 0.03, transparent: true, opacity: 0.3, depthWrite: false, ior: 1.52, clearcoat: 0.6, side: THREE.DoubleSide });
  const reflectiveGlass = new THREE.MeshPhysicalMaterial({ color: "#839ea7", roughness: 0.09, metalness: 0.18, transparent: true, opacity: 0.72, depthWrite: false, ior: 1.52, envMapIntensity: 1.2 });
  const warmLight = kit.solid("#f0d6a7", 0.52, 0);
  warmLight.emissive.set("#f0c17d");
  kit.nightMaterials.push({ material: warmLight, day: 0.22, night: 2.6 });
  const screen = kit.solid("#d4e0d9", 0.3, 0.04);
  screen.emissive.set("#b7d2c3");
  kit.nightMaterials.push({ material: screen, day: 0.35, night: 1.15 });
  kit.materials.add(glass);
  kit.materials.add(reflectiveGlass);
  kit.materials.add(water);
  bindWorldScalePbr(limestone, createAshlarStonePbr(), 1.2, 0.8, 0.4);
  bindWorldScalePbr(aluminum, createBrushedMetalPbr(), 2, 2, 0.22);
  return { limestone, concrete, steel, aluminum, bronze, oak, rubber, porcelain, clay, white, fabric, dark, red, green, yellow, water, glass, reflectiveGlass, warmLight, screen };
}

export class ArchitectureContext {
  readonly palette: Palette;
  readonly cube: THREE.BoxGeometry;
  readonly cylinder: THREE.CylinderGeometry;
  readonly sphere: THREE.SphereGeometry;
  readonly animations: Animation[] = [];
  readonly local: Section;
  private readonly unitY = new THREE.Vector3(0, 1, 0);
  private readonly unitZ = new THREE.Vector3(0, 0, 1);
  private readonly scratch = new THREE.Object3D();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly rootInverse = new THREE.Matrix4();
  private readonly partWorldMatrix = new THREE.Matrix4();
  private readonly movingParts?: Map<THREE.Material, THREE.BufferGeometry[]>;
  private readonly movingRoot?: THREE.Group;
  private readonly shapeCache: Map<string, THREE.BufferGeometry>;
  private readonly staticDetails: Map<THREE.Material, CityModelPart[]>;
  private readonly movingGeometry: Map<THREE.Material, MovingGeometry[]>;
  private readonly movingInstances: Map<THREE.Group, MovingInstance[]>;
  private readonly movingRoots: THREE.Group[];
  private readonly doorOccupancy: DoorOccupancy;
  private readonly labelAtlas: ArchitectureLabelAtlas;

  constructor(readonly kit: CivicKit, local: Section = { x: 0, y: 0, z: 0 }, shared?: ArchitectureContext, movingRoot?: THREE.Group) {
    this.local = local;
    this.shapeCache = shared?.shapeCache ?? new Map();
    this.staticDetails = shared?.staticDetails ?? new Map();
    this.movingGeometry = shared?.movingGeometry ?? new Map();
    this.movingInstances = shared?.movingInstances ?? new Map();
    this.movingRoots = shared?.movingRoots ?? [];
    this.doorOccupancy = shared?.doorOccupancy ?? { points: [] };
    this.labelAtlas = shared?.labelAtlas ?? new ArchitectureLabelAtlas(kit);
    this.palette = shared?.palette ?? makePalette(kit);
    this.cube = shared?.cube ?? this.geometry(new THREE.BoxGeometry(1, 1, 1));
    this.cylinder = shared?.cylinder ?? this.geometry(new THREE.CylinderGeometry(1, 1, 1, 16));
    this.sphere = shared?.sphere ?? this.geometry(new THREE.SphereGeometry(1, 12, 8));
    this.movingRoot = movingRoot;
    if (movingRoot) this.movingParts = shared?.movingRoot === movingRoot ? shared.movingParts : new Map();
  }

  geometry<T extends THREE.BufferGeometry>(geometry: T): T {
    this.kit.geometries.add(geometry);
    return geometry;
  }

  material(parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial(parameters);
    this.kit.materials.add(material);
    return material;
  }

  world(point: Point, target = new THREE.Vector3()): THREE.Vector3 {
    const yaw = this.local.yaw ?? 0;
    const cosine = Math.cos(yaw);
    const sine = Math.sin(yaw);
    return target.set(this.local.x + point[0] * cosine + point[2] * sine, this.local.y + point[1], this.local.z - point[0] * sine + point[2] * cosine);
  }

  at(section: Section): ArchitectureContext {
    const position = this.world([section.x, section.y, section.z]);
    return new ArchitectureContext(this.kit, { x: position.x, y: position.y, z: position.z, yaw: (this.local.yaw ?? 0) + (section.yaw ?? 0) }, this, this.movingRoot);
  }

  box(material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number, yaw = 0, roll = 0): void {
    this.part(material, this.cube, [x, y, z], [width, height, depth], yaw, roll);
  }

  part(material: THREE.Material, geometry: THREE.BufferGeometry, position: Point, scale: Point = [1, 1, 1], yaw = 0, roll = 0): void {
    if (this.movingParts) {
      this.world(position, this.scratch.position);
      this.scratch.rotation.set(0, yaw + (this.local.yaw ?? 0), roll);
      this.scratch.scale.set(...scale);
      this.scratch.updateMatrix();
      const transformed = geometry.clone().applyMatrix4(this.scratch.matrix);
      const parts = this.movingParts.get(material) ?? [];
      parts.push(transformed);
      this.movingParts.set(material, parts);
      return;
    }
    const location = this.world(position, this.from);
    this.scratch.position.copy(location);
    this.scratch.rotation.set(0, yaw + (this.local.yaw ?? 0), roll);
    this.scratch.scale.set(...scale);
    this.scratch.updateMatrix();
    this.queueStatic(material, geometry, this.scratch.matrix);
  }

  disc(material: THREE.Material, x: number, y: number, z: number, radius: number, height: number): void {
    this.part(material, this.cylinder, [x, y, z], [radius, height, radius]);
  }

  oval(material: THREE.Material, x: number, y: number, z: number, rx: number, ry: number, rz: number): void {
    this.part(material, this.sphere, [x, y, z], [rx, ry, rz]);
  }

  beam(material: THREE.Material, a: Point, b: Point, radius = 0.025): void {
    if (this.movingParts) {
      this.world(a, this.from);
      this.world(b, this.to).sub(this.from);
      this.scratch.position.copy(this.from).addScaledVector(this.to, 0.5);
      this.scratch.quaternion.setFromUnitVectors(this.unitY, this.to.clone().normalize());
      this.scratch.scale.set(radius, this.to.length(), radius);
      this.scratch.updateMatrix();
      const transformed = this.cylinder.clone().applyMatrix4(this.scratch.matrix);
      const parts = this.movingParts.get(material) ?? [];
      parts.push(transformed);
      this.movingParts.set(material, parts);
      return;
    }
    this.world(a, this.from);
    this.world(b, this.to).sub(this.from);
    this.scratch.position.copy(this.from).addScaledVector(this.to, 0.5);
    this.scratch.quaternion.setFromUnitVectors(this.unitY, this.to.clone().normalize());
    this.scratch.scale.set(radius, this.to.length(), radius);
    this.scratch.updateMatrix();
    this.queueStatic(material, this.cylinder, this.scratch.matrix);
  }

  rectangularBeam(material: THREE.Material, a: Point, b: Point, width: number, depth: number): void {
    const aVector = new THREE.Vector3(...a);
    const direction = new THREE.Vector3(...b).sub(aVector);
    const geometry = this.cube.clone();
    geometry.scale(width, depth, direction.length());
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(this.unitZ, direction.normalize()));
    geometry.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    this.geometry(geometry);
    this.part(material, geometry, [0, 0, 0]);
  }

  tube(material: THREE.Material, points: readonly Point[], radius: number, closed = false): void {
    const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), closed, "centripetal");
    const geometry = this.geometry(new THREE.TubeGeometry(curve, Math.max(8, points.length * 5), radius, 6, closed));
    this.part(material, geometry, [0, 0, 0]);
  }

  panel(material: THREE.Material, corners: readonly [Point, Point, Point, Point]): void {
    const positions = corners.flat();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    this.part(material, this.geometry(geometry), [0, 0, 0]);
  }

  profile(material: THREE.Material, outline: readonly (readonly [number, number])[], depth: number, position: Point, yaw = 0): void {
    const shape = new THREE.Shape();
    outline.forEach(([x, y], index) => index ? shape.lineTo(x, y) : shape.moveTo(x, y));
    shape.closePath();
    const geometry = this.geometry(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 }));
    this.part(material, geometry, position, [1, 1, 1], yaw);
  }

  roundedBox(material: THREE.Material, x: number, y: number, z: number, width: number, height: number, depth: number, radius = 0.04, yaw = 0): void {
    const r = Math.min(radius, width / 3, depth / 3);
    const key = `rounded:${width}:${height}:${depth}:${r}`;
    let geometry = this.shapeCache.get(key);
    if (!geometry) {
      const shape = new THREE.Shape();
      const left = -width / 2;
      const right = width / 2;
      const bottom = -depth / 2;
      const top = depth / 2;
      shape.moveTo(left + r, bottom);
      shape.lineTo(right - r, bottom);
      shape.quadraticCurveTo(right, bottom, right, bottom + r);
      shape.lineTo(right, top - r);
      shape.quadraticCurveTo(right, top, right - r, top);
      shape.lineTo(left + r, top);
      shape.quadraticCurveTo(left, top, left, top - r);
      shape.lineTo(left, bottom + r);
      shape.quadraticCurveTo(left, bottom, left + r, bottom);
      geometry = this.geometry(new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 4 }));
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, -height / 2, 0);
      this.shapeCache.set(key, geometry);
    }
    this.part(material, geometry, [x, y, z], [1, 1, 1], yaw);
  }

  label(text: string, x: number, y: number, z: number, width: number, height: number, foreground = "#e7e2d4", background = "#283d36", yaw = 0): void {
    const tile = this.labelAtlas.label(text, foreground, background);
    const geometry = this.geometry(this.labelAtlas.geometry(width, height, tile));
    this.box(this.palette.dark, x, y, z, width, height, 0.025, yaw);
    this.part(tile.material, geometry, [x + Math.sin(yaw) * 0.014, y, z + Math.cos(yaw) * 0.014], [1, 1, 1], yaw);
  }

  setDoorOccupants(points: readonly DoorOccupant[]): void {
    this.doorOccupancy.points = points;
  }

  doorSensor(location: Point, radius = 2, holdSeconds = 2.2): (seconds: number) => number {
    const center = this.world(location);
    const radiusSquared = radius * radius;
    let openness = 0;
    let lastTime = 0;
    let holdUntil = -Infinity;
    return seconds => {
      const delta = seconds >= lastTime ? Math.min(seconds - lastTime, 0.15) : 0;
      if (seconds < lastTime) holdUntil = seconds;
      lastTime = seconds;
      let occupied = false;
      for (const person of this.doorOccupancy.points) {
        if (person.y !== undefined && Math.abs(person.y - center.y) > 1.5) continue;
        const dx = person.x - center.x;
        const dz = person.z - center.z;
        if (dx * dx + dz * dz <= radiusSquared) {
          occupied = true;
          break;
        }
      }
      if (occupied) holdUntil = seconds + holdSeconds;
      const target = occupied || seconds < holdUntil ? 1 : 0;
      const speed = target > openness ? 1.8 : 0.8;
      openness += Math.sign(target - openness) * Math.min(Math.abs(target - openness), delta * speed);
      return THREE.MathUtils.smoothstep(openness, 0, 1);
    };
  }

  moving(name: string, location: Point, build: (context: ArchitectureContext) => void): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    group.position.copy(this.world(location));
    group.rotation.y = this.local.yaw ?? 0;
    const context = new ArchitectureContext(this.kit, { x: 0, y: 0, z: 0 }, this, group);
    build(context);
    context.flush();
    (this.movingRoot ?? this.kit.group).add(group);
    if (!this.movingRoot) this.movingRoots.push(group);
    return group;
  }

  finishStaticDetails(): void {
    buildCityModelBatches(this.kit, this.staticDetails);
    this.staticDetails.clear();
  }

  finishMovingDetails(): void {
    this.kit.group.updateMatrixWorld(true);
    this.rootInverse.copy(this.kit.group.matrixWorld).invert();
    const moving = new Map<THREE.Material, CityModelPart[]>();
    for (const [material, parts] of this.movingGeometry) {
      const records: CityModelPart[] = [];
      for (const part of parts) {
        const matrix = new THREE.Matrix4().multiplyMatrices(this.rootInverse, part.root.matrixWorld);
        records.push({ geometry: part.geometry, matrix, root: part.root });
      }
      moving.set(material, records);
    }
    for (const instance of buildCityModelBatches(this.kit, moving)) {
      const instances = this.movingInstances.get(instance.root);
      if (instances) instances.push(instance);
      else this.movingInstances.set(instance.root, [instance]);
    }
    for (const parts of this.movingGeometry.values()) for (const part of parts) part.geometry.dispose();
    this.movingGeometry.clear();
  }

  updateMovingDetails(): void {
    this.kit.group.updateWorldMatrix(true, false);
    for (const root of this.movingRoots) root.updateMatrixWorld(true);
    this.rootInverse.copy(this.kit.group.matrixWorld).invert();
    for (const [part, instances] of this.movingInstances) {
      this.partWorldMatrix.multiplyMatrices(this.rootInverse, part.matrixWorld);
      let visible = true;
      let root: THREE.Object3D | null = part;
      while (root && root !== this.kit.group) {
        if (!root.visible) { visible = false; break; }
        root = root.parent;
      }
      for (const instance of instances) {
        if (!instance.previous.equals(this.partWorldMatrix)) {
          instance.mesh.setMatrixAt(instance.id, this.partWorldMatrix);
          instance.mesh.userData.cityDetailMatrixVersion = Number(instance.mesh.userData.cityDetailMatrixVersion ?? 0) + 1;
          instance.previous.copy(this.partWorldMatrix);
        }
        if (instance.visible !== visible) {
          setCityModelPartVisible(instance.mesh, instance.id, visible);
          instance.visible = visible;
        }
      }
    }
  }

  private queueStatic(material: THREE.Material, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
    let parts = this.staticDetails.get(material);
    if (!parts) {
      parts = [];
      this.staticDetails.set(material, parts);
    }
    parts.push({ geometry, matrix: matrix.clone() });
  }

  private flush(): void {
    if (!this.movingRoot || !this.movingParts) return;
    for (const [material, parts] of this.movingParts) {
      const normalized = parts.map((part) => part.index ? part.toNonIndexed() : part);
      const geometry = mergeGeometries(normalized, false);
      if (!geometry) throw new Error("建筑活动构件合并失败");
      const partsForMaterial = this.movingGeometry.get(material) ?? [];
      partsForMaterial.push({ root: this.movingRoot, geometry });
      this.movingGeometry.set(material, partsForMaterial);
      normalized.forEach((part, index) => { if (part !== parts[index]) part.dispose(); });
      parts.forEach((part) => part.dispose());
    }
    this.movingParts.clear();
  }
}

export function openingPulse(seconds: number, period: number, offset: number, hold: number, ramp = 0.8): number {
  const time = THREE.MathUtils.euclideanModulo(seconds - offset, period);
  if (time < ramp) return THREE.MathUtils.smoothstep(time, 0, ramp);
  if (time < ramp + hold) return 1;
  if (time < ramp * 2 + hold) return 1 - THREE.MathUtils.smoothstep(time - ramp - hold, 0, ramp);
  return 0;
}
