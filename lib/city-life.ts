import * as THREE from "three";
import { centralParkWalks, centralParkBenches, centralParkGatherings } from "./city-civic";

type RouteSegment = {
  x: number;
  z: number;
  dx: number;
  dz: number;
  length: number;
  end: number;
  heading: number;
};
type Route = {
  segments: RouteSegment[];
  length: number;
  closed: boolean;
  ground: number;
  population: number;
};
type RouteSpec = {
  points: readonly (readonly [number, number])[];
  closed?: boolean;
  ground: number;
  population: number;
};
type Resident = {
  route?: Route;
  x: number;
  z: number;
  heading: number;
  scale: number;
  speed: number;
  offset: number;
  lane: number;
  phase: number;
  activity: "walk" | "talk" | "sit";
};

/**
 * 创建确定性的步行、交谈和休憩人群；传入城市共用的资源集合，以便统一释放。
 * animate 接受城市累计秒数，相同秒数总是产生相同姿态，暂停无需单独的计时器。
 */
export function buildCityLife({
  group,
  geometries,
  materials,
}: {
  group: THREE.Group;
  geometries: Set<THREE.BufferGeometry>;
  materials: Set<THREE.Material>;
}): { animate: (seconds: number) => void } {
  let seed = 81927;
  const random = (): number => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296);
  // 与公园铺装共用曲线，采样成按弧长行走的折线，环湖者不会切穿湖面。
  const parkRoutes: RouteSpec[] = centralParkWalks
    .filter((walk) => ["lakeside", "south", "east", "west", "north"].includes(walk.id))
    .map((walk) => {
      const curve = new THREE.CatmullRomCurve3(walk.points.map(([x, z]) => new THREE.Vector3(x, 0, z)), walk.closed);
      return {
        points: curve.getSpacedPoints(80).map((point) => [point.x, point.z] as const),
        closed: walk.closed,
        ground: 0.39,
        population: walk.id === "lakeside" ? 32 : 4,
      };
    });
  // ponytail: 城区短路线止于路口前，不引入过街寻路；扩建城区时补安全人行路段。
  const streetSegments = [
    [-157.2, -151, -157.2, -128], [-154, -107.2, -131, -107.2], [-112.2, -60, -112.2, -36],
    [112.2, -106, 112.2, -82], [132, -17.2, 155, -17.2], [172.8, 29, 172.8, 53],
    [-22.2, -196, -22.2, -172], [25, -152.2, 49, -152.2], [157.8, -151, 157.8, -127],
  ] as const;
  const routeSpecs: RouteSpec[] = [
    ...parkRoutes,
    ...streetSegments.map(([x, z, endX, endZ]) => ({ points: [[x, z], [endX, endZ]] as const, population: 2, ground: 0.35 })),
    { points: [[-108, 10.5], [-88, 10.5]], population: 4, ground: 0.35 },
    { points: [[177.5, 10.5], [189.5, 10.5]], population: 4, ground: 0.35 },
    { points: [[-77, 109], [-36, 109]], population: 4, ground: 0.3 },
    { points: [[9, 109], [78, 109]], population: 4, ground: 0.3 },
    { points: [[-180, 125], [-110, 125]], population: 6, ground: 0.25 },
  ];
  const routes: Route[] = routeSpecs.map((spec) => {
    const points = spec.closed ? [...spec.points, spec.points[0]] : spec.points;
    const segments: RouteSegment[] = [];
    let total = 0;
    for (let index = 1; index < points.length; index++) {
      const [x, z] = points[index - 1];
      const dx = points[index][0] - x;
      const dz = points[index][1] - z;
      const length = Math.hypot(dx, dz);
      if (length < 0.00001) continue;
      total += length;
      segments.push({ x, z, dx: dx / length, dz: dz / length, length, end: total, heading: Math.atan2(dx, dz) });
    }
    if (!segments.length) throw new Error("行人路线必须包含两个不同的位置");
    return { segments, length: total, closed: Boolean(spec.closed), ground: spec.ground, population: spec.population };
  });
  const residents: Resident[] = [];
  for (const route of routes) {
    for (let pair = 0; pair < route.population / 2; pair++) {
      const speed = 0.65 + random() * 0.3;
      const offset = route.length * (pair + 0.2) / (route.population / 2);
      for (const lane of [-0.39, 0.39]) {
        residents.push({ route, x: route.segments[0].x, z: route.segments[0].z, heading: route.segments[0].heading, scale: 0.94 + random() * 0.13, speed, offset, lane, phase: random() * Math.PI * 2, activity: "walk" });
      }
    }
  }
  for (const { x: centerX, z: centerZ } of centralParkGatherings.slice(0, 2)) {
    for (let index = 0; index < 3; index++) {
      const angle = index * Math.PI * 2 / 3;
      const x = centerX + Math.cos(angle) * 0.9;
      const z = centerZ + Math.sin(angle) * 0.9;
      residents.push({ x, z, heading: Math.atan2(centerX - x, centerZ - z), scale: 0.94 + random() * 0.1, speed: 0, offset: 0, lane: 0, phase: random() * 6, activity: "talk" });
    }
  }
  for (const { x, z, angle } of centralParkBenches.slice(0, 3)) {
    residents.push({ x, z, heading: angle, scale: 1, speed: 0, offset: 0, lane: 0, phase: random() * 6, activity: "sit" });
  }

  const sphere = new THREE.SphereGeometry(1, 8, 6);
  const cap = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  const cylinder = new THREE.CylinderGeometry(0.5, 0.46, 1, 7);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  for (const geometry of [sphere, cap, cylinder, cube]) geometries.add(geometry);
  const batch = (name: string, geometry: THREE.BufferGeometry, count: number, color: string): THREE.InstancedMesh => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    materials.add(material);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = name;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // 人群只有五个绘制批次；路线会移动，不能沿用首帧的静态实例包围球。
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  };
  const count = residents.length;
  const skin = batch("Residents · heads and hands", sphere, count * 3, "#ffffff");
  const clothes = batch("Residents · coats and sleeves", cylinder, count * 5, "#ffffff");
  const trousers = batch("Residents · articulated legs", cube, count * 4, "#ffffff");
  const shoes = batch("Residents · shoes", cube, count * 2, "#303638");
  const hair = batch("Residents · hair", cap, count, "#ffffff");
  const meshes = [skin, clothes, trousers, shoes, hair];
  const color = new THREE.Color();
  const coats = ["#c46d4b", "#d3ac5b", "#6084a1", "#e0d6be", "#cf9891", "#527b70", "#647783", "#9986a8"];
  const skins = ["#d8a57f", "#bd8b68", "#edc8a4", "#91644e"];
  const pants = ["#394957", "#53524c", "#34545d", "#84765e"];
  const hairs = ["#3c342e", "#6c4d39", "#bab5a4", "#34393b"];
  residents.forEach((_, index) => {
    color.set(skins[Math.floor(random() * skins.length)]);
    for (let part = 0; part < 3; part++) skin.setColorAt(index * 3 + part, color);
    color.set(coats[Math.floor(random() * coats.length)]);
    for (let part = 0; part < 5; part++) clothes.setColorAt(index * 5 + part, color);
    color.set(pants[Math.floor(random() * pants.length)]);
    for (let part = 0; part < 4; part++) trousers.setColorAt(index * 4 + part, color);
    hair.setColorAt(index, color.set(hairs[Math.floor(random() * hairs.length)]));
  });

  const transform = new THREE.Object3D();
  transform.rotation.order = "YXZ";
  let originX = 0;
  let originY = 0;
  let originZ = 0;
  let heading = 0;
  let cosine = 1;
  let sine = 0;
  let scale = 1;
  function place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, width: number, height: number, depth: number, pitch = 0): void {
    transform.position.set(originX + (cosine * x + sine * z) * scale, originY + y * scale, originZ + (-sine * x + cosine * z) * scale);
    transform.rotation.set(pitch, heading, 0);
    transform.scale.set(width * scale, height * scale, depth * scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  }
  function limb(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, length: number, thickness: number, angle: number): void {
    place(mesh, index, x, y - Math.cos(angle) * length / 2, z - Math.sin(angle) * length / 2, thickness, length, thickness, angle);
  }

  function animate(seconds: number): void {
    residents.forEach((resident, index) => {
      const walking = resident.activity === "walk";
      const seated = resident.activity === "sit";
      const phase = seconds * resident.speed * 5.5 + resident.phase;
      const stride = walking ? Math.sin(phase) * 0.43 : 0;
      const route = resident.route;
      originX = resident.x;
      originZ = resident.z;
      heading = resident.heading;
      originY = seated ? 0 : route?.ground ?? 0.32;
      scale = resident.scale;
      if (route) {
        const travel = THREE.MathUtils.euclideanModulo(seconds * resident.speed + resident.offset, route.length * (route.closed ? 1 : 2));
        const returning = !route.closed && travel > route.length;
        const distance = returning ? route.length * 2 - travel : travel;
        const segment = route.segments.find((part) => distance <= part.end) ?? route.segments[route.segments.length - 1];
        const along = distance - (segment.end - segment.length);
        originX = segment.x + segment.dx * along + segment.dz * resident.lane;
        originZ = segment.z + segment.dz * along - segment.dx * resident.lane;
        heading = segment.heading + (returning ? Math.PI : 0);
      }
      cosine = Math.cos(heading);
      sine = Math.sin(heading);
      const bob = walking ? Math.abs(Math.cos(phase)) * 0.026 : 0;
      const hipShift = seated ? -0.05 : bob;
      place(clothes, index * 5, 0, 1.26 + hipShift, 0, 0.56, 0.65, 0.36);
      place(skin, index * 3, 0, 1.8 + hipShift, 0, 0.17, 0.22, 0.175);
      place(hair, index, 0, 1.85 + hipShift, 0, 0.18, 0.18, 0.184);
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const legAngle = seated ? -Math.PI / 2 : sign * stride;
        const kneeAngle = seated ? 0 : legAngle + Math.max(0, Math.sin(phase) * sign) * 0.58;
        const hipY = 0.94 + hipShift;
        const kneeY = hipY - Math.cos(legAngle) * 0.41;
        const kneeZ = -Math.sin(legAngle) * 0.41;
        const lowerLegLength = seated ? 0.46 : 0.41;
        const ankleY = kneeY - Math.cos(kneeAngle) * lowerLegLength;
        const ankleZ = kneeZ - Math.sin(kneeAngle) * lowerLegLength;
        limb(trousers, index * 4 + side * 2, sign * 0.135, hipY, 0, 0.41, 0.16, legAngle);
        limb(trousers, index * 4 + side * 2 + 1, sign * 0.135, kneeY, kneeZ, lowerLegLength, 0.135, kneeAngle);
        place(shoes, index * 2 + side, sign * 0.135, ankleY - 0.055, ankleZ + 0.045, 0.18, 0.11, 0.29);
        const talking = resident.activity === "talk" && side === 1;
        const armAngle = seated ? -0.45 : talking ? -0.42 + Math.sin(seconds * 1.2 + resident.phase) * 0.14 : -sign * stride * 0.72;
        const forearmAngle = seated ? -0.15 : talking ? armAngle - 0.9 : armAngle - 0.18;
        const elbowY = 1.53 + hipShift - Math.cos(armAngle) * 0.31;
        const elbowZ = -Math.sin(armAngle) * 0.31;
        limb(clothes, index * 5 + 1 + side * 2, sign * 0.32, 1.53 + hipShift, 0, 0.31, 0.18, armAngle);
        limb(clothes, index * 5 + 2 + side * 2, sign * 0.32, elbowY, elbowZ, 0.3, 0.15, forearmAngle);
        place(skin, index * 3 + 1 + side, sign * 0.32, elbowY - Math.cos(forearmAngle) * 0.31, elbowZ - Math.sin(forearmAngle) * 0.31, 0.072, 0.09, 0.072);
      }
    });
    for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
  }
  group.userData.pedestrianCount = count;
  group.userData.pedestrianRouteCount = routes.length;
  animate(0);
  return { animate };
}
