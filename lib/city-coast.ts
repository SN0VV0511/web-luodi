import * as THREE from "three";
import type { CivicKit } from "./city-civic";

/** 沙滩、公共海岸与货运港共用城市材质和实例批次；船只作为刚体沿近海航线移动。 */
export function buildCityCoast(kit: CivicKit): { animate: (seconds: number) => void } {
  const { box, part, beam, solid, geometries, materials, group } = kit;
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => { geometries.add(value); return value; };
  const cube = geometry(new THREE.BoxGeometry(1, 1, 1));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 12));
  const sand = solid("#d8bd89");
  const wetSand = solid("#a99370", 0.6);
  const timber = solid("#9e7650");
  const white = solid("#e4e0cc");
  const blue = solid("#477e91");
  const coral = solid("#bd7157");
  const teal = solid("#507c76");
  const dark = solid("#343f42");
  const steel = solid("#667b7d", 0.45, 0.5);
  const paving = solid("#a4a59a");
  const yellow = solid("#d5aa52");
  const glass = solid("#345865", 0.26, 0.25);
  const leaf = solid("#477753");
  leaf.side = THREE.DoubleSide;
  const line = (a: [number, number, number], b: [number, number, number], radius = 0.08, material = steel) => beam(new THREE.Vector3(...a), new THREE.Vector3(...b), radius, material);

  // 沙岸轮廓渐渐没入海面，留出连续滨海步道，避免整齐的矩形沙盘边。
  const shore = (inset: number) => {
    const shape = new THREE.Shape();
    shape.moveTo(-228, -106);
    shape.lineTo(-77, -106);
    for (let index = 0; index <= 36; index++) {
      const x = -77 - index / 36 * 151;
      const progress = index / 36;
      const z = 112 + Math.sin(progress * Math.PI) * (47 + inset) + Math.sin(progress * Math.PI * 3) * 3;
      shape.lineTo(x, -z);
    }
    shape.closePath();
    const value = geometry(new THREE.ShapeGeometry(shape, 36));
    value.rotateX(-Math.PI / 2);
    return value;
  };
  part(wetSand, shore(5), 0, -0.12, 0, 1, 1, 1);
  part(sand, shore(0), 0, 0.25, 0, 1, 1, 1);
  const surfPoints = Array.from({ length: 37 }, (_, index) => {
    const progress = index / 36;
    return new THREE.Vector3(-77 - progress * 151, -0.48, 118 + Math.sin(progress * Math.PI) * 52 + Math.sin(progress * Math.PI * 3) * 3);
  });
  const surfGeometry = geometry(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(surfPoints), 96, 0.38, 4, false));
  const surfMaterial = new THREE.MeshBasicMaterial({ color: "#e7eee2", transparent: true, opacity: 0.3, depthWrite: false });
  materials.add(surfMaterial);
  group.add(new THREE.Mesh(surfGeometry, surfMaterial));
  box(timber, -151, 0.45, 109.5, 147, 0.22, 3.4);
  for (let x = -222; x < -80; x += 2.7) box(dark, x, 0.57, 109.5, 0.045, 0.015, 3.4);
  box(timber, -139, 0.49, 119, 3.1, 0.2, 19);
  // 同一片弯曲叶网格重复七次：叶尖收细并自然下垂，不再用直锥体充当叶片。
  const leafPositions: number[] = [];
  const leafIndices: number[] = [];
  const leafSegments = 14;
  for (let index = 0; index <= leafSegments; index++) {
    const t = index / leafSegments;
    const width = Math.pow(Math.sin(t * Math.PI), 0.8) * (0.65 - t * 0.2);
    const x = t * 4.7;
    const y = Math.sin(t * Math.PI) * 1.05 - t * t * 1.65;
    const bend = Math.sin(t * Math.PI * 1.2) * 0.16;
    leafPositions.push(x, y - width * 0.24, bend - width, x, y, bend, x, y - width * 0.24, bend + width);
    if (index === leafSegments) continue;
    const base = index * 3;
    leafIndices.push(base, base + 3, base + 1, base + 1, base + 3, base + 4, base + 1, base + 4, base + 2, base + 2, base + 4, base + 5);
  }
  const frond = geometry(new THREE.BufferGeometry());
  frond.name = "Curved palm frond";
  frond.setAttribute("position", new THREE.Float32BufferAttribute(leafPositions, 3));
  frond.setIndex(leafIndices);
  frond.computeVertexNormals();
  for (const [palmIndex, x] of [-181, -155, -121, -80].entries()) {
    part(timber, cylinder, x, 4, 107, 0.26, 7.6, 0.26);
    for (let index = 0; index < 7; index++) {
      const angle = index * Math.PI * 2 / 7 + palmIndex * 0.31 + Math.sin(index * 3) * 0.08;
      const scale = 0.94 + Math.sin(index * 1.9 + palmIndex) * 0.12;
      part(leaf, frond, x, 7.7, 107, scale, 0.9 + index % 3 * 0.08, scale, undefined, angle, Math.sin(index + palmIndex) * 0.045);
    }
  }
  const parasol = geometry(new THREE.ConeGeometry(2.5, 1.2, 12, 1, true));
  for (const [index, point] of [[-198, 126], [-176, 137], [-151, 144], [-121, 134], [-100, 122]].entries()) {
    const [x, z] = point;
    part(index % 2 ? coral : blue, parasol, x, 3.4, z, 1, 1, 1);
    part(white, cylinder, x, 1.9, z, 0.07, 3.3, 0.07);
    for (const dx of [-1.6, 1.6]) {
      box(white, x + dx, 0.64, z + 1.7, 0.85, 0.11, 2.25);
      part(index % 2 ? teal : coral, cube, x + dx, 0.97, z + 0.8, 0.8, 0.14, 0.9, undefined, 0, 0.05);
      for (const dz of [-0.8, 0.8]) box(timber, x + dx, 0.42, z + 1.7 + dz, 0.7, 0.4, 0.1);
    }
  }
  // 救生亭、冲淋架与排球场使海岸成为可游逛的公共空间。
  for (const dx of [-1.5, 1.5]) for (const dz of [-1.1, 1.1]) box(timber, -204 + dx, 1.7, 114 + dz, 0.18, 3, 0.18);
  box(white, -204, 3.8, 114, 3.8, 2.2, 3);
  box(coral, -204, 5, 114, 4.7, 0.25, 3.9);
  box(glass, -204, 4, 115.55, 2.8, 0.9, 0.09);
  line([-203, 0.3, 118], [-203, 3, 115.5], 0.07, timber);
  line([-205, 0.3, 118], [-205, 3, 115.5], 0.07, timber);
  for (let i = 0; i < 7; i++) box(timber, -204, 0.6 + i * 0.34, 117.8 - i * 0.32, 2, 0.12, 0.25);
  for (const x of [-179, -165]) {
    box(white, x, 1.8, 119, 0.08, 3.2, 0.08);
    box(white, x, 0.28, 113.5, 0.08, 0.025, 11);
  }
  for (const z of [114, 124]) box(white, -172, 0.28, z, 14, 0.025, 0.08);
  for (let i = 0; i < 11; i++) line([-179 + i * 1.4, 1.6, 119], [-179 + i * 1.4, 3.1, 119], 0.014, white);
  for (let i = 0; i < 5; i++) line([-179, 1.6 + i * 0.375, 119], [-165, 1.6 + i * 0.375, 119], 0.014, white);

  // 港区是独立的工作岸线，和沙滩之间隔着城市海滨步道。
  box(paving, 232, 0.1, 148, 134, 1.6, 76);
  // 入口从主路标高 0.445 米连续升到港区路面 1.005 米，坡体落地且路面有实体厚度。
  const approachLength = 17;
  const rampBase = geometry(new THREE.BoxGeometry(12, 1, approachLength));
  const basePositions = rampBase.getAttribute("position");
  for (let index = 0; index < basePositions.count; index++) {
    const rise = (basePositions.getZ(index) + approachLength / 2) / approachLength * 0.56;
    basePositions.setY(index, basePositions.getY(index) > 0 ? 0.385 + rise : -0.3);
  }
  rampBase.computeVertexNormals();
  const rampRoad = geometry(new THREE.BoxGeometry(10, 0.06, approachLength));
  const roadPositions = rampRoad.getAttribute("position");
  for (let index = 0; index < roadPositions.count; index++) {
    const rise = (roadPositions.getZ(index) + approachLength / 2) / approachLength * 0.56;
    roadPositions.setY(index, roadPositions.getY(index) + 0.415 + rise);
  }
  rampRoad.computeVertexNormals();
  part(paving, rampBase, 210, 0, 103.5, 1, 1, 1);
  part(dark, rampRoad, 210, 0, 103.5, 1, 1, 1);
  box(dark, 210, 0.945, 134.5, 10, 0.12, 45);
  box(paving, 278, 0.18, 209, 25, 1.8, 104);
  box(paving, 192, 0.18, 207, 22, 1.8, 100);
  for (const x of [181, 203, 265, 290]) {
    for (let z = 166; z < 254; z += 9) {
      box(yellow, x, 1.2, z, 0.35, 0.3, 3);
      part(dark, cylinder, x, 0.75, z + 3, 0.55, 0.7, 0.55, undefined, 0, Math.PI / 2);
    }
  }
  const containers = [solid("#a8624d"), solid("#4a6e83"), solid("#6c8270"), solid("#b3a77b")];
  function container(x: number, y: number, z: number, colorIndex: number) {
    const material = containers[colorIndex % containers.length];
    box(material, x, y, z, 2.65, 2.7, 10.3);
    for (let i = -4; i <= 4; i++) for (const side of [-1, 1]) box(material, x + side * 1.34, y, z + i * 1.05, 0.08, 2.56, 0.08);
    for (const dx of [-1.2, 1.2]) box(steel, x + dx, y, z + 5.17, 0.06, 2.6, 0.05);
  }
  for (let row = 0; row < 4; row++) for (let col = 0; col < 8; col++) {
    const stacks = 1 + (row + col) % 3;
    for (let level = 0; level < stacks; level++) container(221 + col * 3, 2.42 + level * 2.76, 121 + row * 14, row + col + level);
  }
  box(white, 177, 5.8, 130, 17, 9.2, 26);
  box(blue, 177, 10.55, 130, 19, 0.65, 28);
  for (let z = 121; z <= 139; z += 6) box(dark, 185.6, 3.3, z, 0.14, 4.5, 4.5);
  function crane(x: number, z: number, direction: number) {
    for (const dx of [-6, 6]) for (const dz of [-5, 5]) {
      box(blue, x + dx, 15.8, z + dz, 0.8, 29.5, 0.8);
      part(dark, cylinder, x + dx, 1.4, z + dz, 0.8, 1.4, 0.8, undefined, 0, Math.PI / 2);
    }
    box(blue, x, 30.3, z, 14, 1.4, 12.5);
    for (const dz of [-2, 2]) {
      box(blue, x + direction * 7, 34, z + dz, 36, 0.9, 0.6);
      line([x - direction * 7, 41, z + dz], [x + direction * 24, 34, z + dz], 0.12, steel);
      box(blue, x - direction * 7, 37, z + dz, 0.7, 10, 0.7);
    }
    box(yellow, x + direction * 13, 32.7, z, 3, 1.2, 5);
    for (const dz of [-2, 2]) line([x + direction * 13, 32, z + dz], [x + direction * 13, 13, z + dz], 0.06);
    box(yellow, x + direction * 13, 12.8, z, 3.2, 0.7, 5.4);
    box(white, x - direction * 4, 32, z + 4, 3.5, 3, 3);
    box(glass, x - direction * 4, 32.3, z + 5.53, 2.9, 1.8, 0.08);
  }
  crane(279, 193, -1);
  crane(190, 224, 1);
  // 外海防波堤，留出两座码头之间的船舶回旋水域。
  for (let i = 0; i < 19; i++) {
    const x = 312 + i * 3.6, z = 169 + i * 4.4;
    part(paving, cube, x, 0.1, z, 7, 3.4, 7, undefined, i * 0.43);
  }
  part(white, cylinder, 381, 5, 253, 2.2, 9, 2.2);
  part(coral, cylinder, 381, 9.5, 253, 2.4, 1.1, 2.4);
  part(glass, cylinder, 381, 10.3, 253, 1.8, 1, 1.8);

  function cargoShip(length: number, width: number): THREE.Group {
    const ship = new THREE.Group();
    const outline = new THREE.Shape();
    outline.moveTo(-width * 0.46, length * 0.43);
    outline.lineTo(-width * 0.5, -length * 0.29);
    outline.quadraticCurveTo(-width * 0.44, -length * 0.43, 0, -length * 0.5);
    outline.quadraticCurveTo(width * 0.44, -length * 0.43, width * 0.5, -length * 0.29);
    outline.lineTo(width * 0.46, length * 0.43);
    outline.quadraticCurveTo(0, length * 0.48, -width * 0.46, length * 0.43);
    const hullGeometry = geometry(new THREE.ExtrudeGeometry(outline, { depth: 6, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.5, bevelSegments: 2, steps: 1 }));
    hullGeometry.rotateX(-Math.PI / 2);
    const hull = new THREE.Mesh(hullGeometry, dark);
    hull.position.y = -3;
    hull.castShadow = true; hull.receiveShadow = true; ship.add(hull);
    const batchParts = new Map<THREE.Material, THREE.Matrix4[]>();
    const transform = new THREE.Object3D();
    const shipBox = (material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
      transform.position.set(x, y, z); transform.rotation.set(0, 0, 0); transform.scale.set(w, h, d); transform.updateMatrix();
      const batch = batchParts.get(material) ?? []; batch.push(transform.matrix.clone()); batchParts.set(material, batch);
    };
    shipBox(coral, 0, 2.4, 0, width * 0.96, 1.3, length * 0.78);
    shipBox(paving, 0, 3.2, 0, width * 0.91, 0.25, length * 0.79);
    for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) {
      const levels = 2 + (row + col) % 2;
      for (let level = 0; level < levels; level++) {
        const x = (col - 1.5) * 2.85, z = -length * 0.24 + row * 10.8;
        shipBox(containers[(row + col + level) % 4], x, 4.72 + level * 2.76, z, 2.65, 2.7, 10.3);
        for (const side of [-1, 1]) for (let rib = -4; rib <= 4; rib++) shipBox(containers[(row + col + level) % 4], x + side * 1.34, 4.72 + level * 2.76, z + rib * 1.05, 0.07, 2.6, 0.07);
      }
    }
    const aft = -length * 0.365;
    shipBox(white, 0, 9.2, aft, width * 0.78, 11.6, 9);
    shipBox(glass, 0, 13.2, aft + 4.6, width * 0.83, 1.5, 0.2);
    shipBox(white, 0, 14.5, aft, width * 0.86, 0.65, 10);
    shipBox(coral, -3, 17.3, aft - 2, 3.3, 5, 3.5);
    shipBox(dark, -3, 20, aft - 2, 3.5, 0.55, 3.7);
    shipBox(steel, 4, 19, aft, 0.16, 10, 0.16);
    for (const side of [-1, 1]) shipBox(steel, side * width * 0.45, 4.2, 0, 0.08, 1.7, length * 0.78);
    for (const [material, matrices] of batchParts) {
      const mesh = new THREE.InstancedMesh(cube, material, matrices.length);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.castShadow = true; mesh.receiveShadow = true; ship.add(mesh);
    }
    group.add(ship);
    return ship;
  }
  const moored = cargoShip(90, 18);
  moored.position.set(248, -0.65, 234);
  const offshore = cargoShip(104, 20);
  offshore.rotation.y = Math.PI / 2;
  const animate = (seconds: number) => {
    moored.position.y = -0.65 + Math.sin(seconds * 0.4) * 0.04;
    offshore.position.set(THREE.MathUtils.euclideanModulo(seconds * 1.25 + 520, 1100) - 550, -0.65 + Math.sin(seconds * 0.5) * 0.07, 320);
  };
  group.userData.cargoShipCount = 2;
  animate(0);
  return { animate };
}
