import * as THREE from "three";
import type { Appearance } from "./types";

/**
 * 写实蒙皮居民：Quaternius「Universal Base Characters」(CC0) 人体经 scripts/build-people-assets.mjs
 * 重映射到 15 段姿态骨段并简化为两级 LOD。运行时由 ActorPose 的关节点直接构造骨段矩阵，
 * 写入一张 RGBA32F 骨骼纹理（每个居民一行），在顶点着色器中做实例化蒙皮——
 * 一个 draw call 画同一体型/LOD 的全部居民，坐姿、手势与步态沿用原有姿态模拟。
 * 服装（外套、袖长、裤/裙、长大衣、鞋、领口）按顶点分区在片元着色器里按每人外观上色。
 */

const BONES = 15;
const TEXELS_PER_ROW = 64;
const LOD_DISTANCE = 42;
const SEG = { hips: 0, chest: 1, head: 2, upperR: 3, upperL: 4, foreR: 5, foreL: 6, handR: 7, handL: 8, thighR: 9, thighL: 10, calfR: 11, calfL: 12, footR: 13, footL: 14 } as const;

/** 运行时世界空间姿态，由 LifeRenderer 按居民朝向与身高换算后传入。 */
export interface WorldPose {
  hips: THREE.Vector3;
  chest: THREE.Vector3;
  head: THREE.Vector3;
  leftShoulder: THREE.Vector3;
  rightShoulder: THREE.Vector3;
  leftElbow: THREE.Vector3;
  rightElbow: THREE.Vector3;
  leftHand: THREE.Vector3;
  rightHand: THREE.Vector3;
  leftHip: THREE.Vector3;
  rightHip: THREE.Vector3;
  leftKnee: THREE.Vector3;
  rightKnee: THREE.Vector3;
  leftAnkle: THREE.Vector3;
  rightAnkle: THREE.Vector3;
  heading: number;
  headYaw: number;
  headPitch: number;
  leftFootPitch: number;
  rightFootPitch: number;
  scale: number;
}

export function createWorldPose(): WorldPose {
  const v = () => new THREE.Vector3();
  return {
    hips: v(), chest: v(), head: v(), leftShoulder: v(), rightShoulder: v(), leftElbow: v(), rightElbow: v(), leftHand: v(), rightHand: v(),
    leftHip: v(), rightHip: v(), leftKnee: v(), rightKnee: v(), leftAnkle: v(), rightAnkle: v(),
    heading: 0, headYaw: 0, headPitch: 0, leftFootPitch: 0, rightFootPitch: 0, scale: 1,
  };
}

interface BodyAsset {
  geometry: THREE.BufferGeometry;
  lod0: THREE.BufferAttribute;
  lod1: THREE.BufferAttribute;
  inverseBind: THREE.Matrix4[];
  min: THREE.Vector3;
  ext: THREE.Vector3;
  texture: THREE.Texture;
  skinRef: THREE.Color;
}

interface DrawGroup {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  slot: THREE.InstancedBufferAttribute;
  skin: THREE.InstancedBufferAttribute;
  coat: THREE.InstancedBufferAttribute;
  shirt: THREE.InstancedBufferAttribute;
  pants: THREE.InstancedBufferAttribute;
  shoes: THREE.InstancedBufferAttribute;
  hair: THREE.InstancedBufferAttribute;
  style: THREE.InstancedBufferAttribute;
  used: number;
}

const PARS_VERTEX = /* glsl */ `
uniform highp sampler2D peopleBones;
uniform vec3 peoplePosMin;
uniform vec3 peoplePosExt;
attribute vec4 aJoints;
attribute vec4 aWeights;
attribute vec4 aCloth;
attribute float iSlot;
attribute vec3 iSkin;
attribute vec3 iCoat;
attribute vec3 iShirt;
attribute vec3 iPants;
attribute vec3 iShoes;
attribute vec3 iHair;
attribute vec4 iStyle;
mat4 peopleBone(float bone) {
  int x = int(bone + 0.5) * 4;
  int y = int(iSlot + 0.5);
  return mat4(texelFetch(peopleBones, ivec2(x, y), 0), texelFetch(peopleBones, ivec2(x + 1, y), 0), texelFetch(peopleBones, ivec2(x + 2, y), 0), texelFetch(peopleBones, ivec2(x + 3, y), 0));
}
float peopleInflate(vec4 cloth, vec4 style) {
  float zone = floor(cloth.x * 255.0 + 0.5);
  float winter = style.w;
  if (zone == 2.0) return cloth.y * 3.0 < style.x ? 0.01 + winter * 0.016 : 0.0;
  if (zone != 1.0) return 0.0;
  float L = cloth.z * 6.0;
  if (L < 1.25) return 0.016;
  if (L < style.y) return 0.0;
  if (L < style.z) return 0.01;
  if (L < 5.0) return 0.012 + winter * 0.02 + (1.0 - smoothstep(style.z, 3.6, L)) * 0.035 * step(style.z, 3.0);
  return 0.0;
}
`;

const SKIN_MAIN = /* glsl */ `
void main() {
  mat4 peopleSkin = peopleBone(aJoints.x) * aWeights.x + peopleBone(aJoints.y) * aWeights.y + peopleBone(aJoints.z) * aWeights.z + peopleBone(aJoints.w) * aWeights.w;
  vec3 peopleBind = peoplePosMin + position * peoplePosExt + normal * peopleInflate(aCloth, iStyle);
`;

function patchVertex(shader: { vertexShader: string; uniforms: Record<string, THREE.IUniform> }, uniforms: Record<string, THREE.IUniform>, withColors: boolean): void {
  Object.assign(shader.uniforms, uniforms);
  let vs = shader.vertexShader.replace("#include <common>", `#include <common>\n${PARS_VERTEX}\n${withColors ? "varying vec4 vPeopleCloth;\nflat varying float vPeopleZone;\nflat varying vec3 vPeopleSkin;\nflat varying vec3 vPeopleCoat;\nflat varying vec3 vPeopleShirt;\nflat varying vec3 vPeoplePants;\nflat varying vec3 vPeopleShoes;\nflat varying vec3 vPeopleHair;\nflat varying vec4 vPeopleStyle;" : ""}`);
  vs = vs.replace("void main() {", SKIN_MAIN + (withColors ? "  vPeopleCloth = aCloth; vPeopleZone = floor(aCloth.x * 255.0 + 0.5); vPeopleSkin = iSkin; vPeopleCoat = iCoat; vPeopleShirt = iShirt; vPeoplePants = iPants; vPeopleShoes = iShoes; vPeopleHair = iHair; vPeopleStyle = iStyle;\n" : ""));
  vs = vs.replace("#include <beginnormal_vertex>", "vec3 objectNormal = normalize(mat3(peopleSkin) * normal);");
  vs = vs.replace("#include <begin_vertex>", "vec3 transformed = (peopleSkin * vec4(peopleBind, 1.0)).xyz;");
  shader.vertexShader = vs;
}

const FRAGMENT_PARS = /* glsl */ `
varying vec4 vPeopleCloth;
flat varying float vPeopleZone;
flat varying vec3 vPeopleSkin;
flat varying vec3 vPeopleCoat;
flat varying vec3 vPeopleShirt;
flat varying vec3 vPeoplePants;
flat varying vec3 vPeopleShoes;
flat varying vec3 vPeopleHair;
flat varying vec4 vPeopleStyle;
uniform vec3 peopleSkinRef;
float peopleRough = 0.85;
`;

const FRAGMENT_MAP = /* glsl */ `
{
  vec4 texel = texture2D(map, vMapUv);
  float zone = vPeopleZone;
  float front = vPeopleCloth.w;
  vec3 skin = texel.rgb * (vPeopleSkin / peopleSkinRef);
  float weave = 0.95 + 0.05 * sin(vMapUv.x * 1400.0) * sin(vMapUv.y * 1400.0);
  vec3 col = skin;
  peopleRough = 0.6;
  if (zone == 1.0) {
    float L = vPeopleCloth.z * 6.0;
    if (L < 1.25) { col = vPeopleShoes; peopleRough = 0.45; }
    else if (L < vPeopleStyle.y) { col = mix(skin, vec3(0.04, 0.036, 0.035), 0.7); peopleRough = 0.45; }
    else if (L < vPeopleStyle.z) { col = vPeoplePants * weave; peopleRough = 0.88; }
    else if (L < 5.0) {
      col = vPeopleCoat * weave; peopleRough = 0.86;
      if (L > 4.8 && front > 0.55) col = vPeopleShirt;
      // 腰带
      if (vPeopleStyle.z > 3.0 && L > vPeopleStyle.z && L < vPeopleStyle.z + 0.05) col *= 0.55;
    }
  } else if (zone == 2.0) {
    float A = vPeopleCloth.y * 3.0;
    if (A < vPeopleStyle.x) {
      col = vPeopleCoat * weave; peopleRough = 0.86;
      if (vPeopleStyle.x > 1.5 && A > vPeopleStyle.x - 0.07) col = vPeopleShirt;
    }
  } else if (zone == 7.0) {
    col = vPeopleHair; peopleRough = 0.9;
  } else if (zone == 8.0) {
    float along = vPeopleCloth.y;
    col = along > 0.93 ? vec3(0.012, 0.01, 0.009) : along > 0.84 ? vec3(0.09, 0.05, 0.03) : vec3(0.62, 0.6, 0.56);
    peopleRough = 0.2;
  }
  diffuseColor.rgb *= col;
}
`;

function patchFragment(shader: { fragmentShader: string; uniforms: Record<string, THREE.IUniform> }): void {
  let fs = shader.fragmentShader.replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`);
  fs = fs.replace("#include <map_fragment>", FRAGMENT_MAP);
  fs = fs.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = peopleRough;");
  shader.fragmentShader = fs;
}

async function loadBody(url: string, textureUrl: string, skinRef: THREE.Color): Promise<BodyAsset> {
  const [buffer, texture] = await Promise.all([
    fetch(url).then((response) => {
      if (!response.ok) throw new Error(`people asset ${url}: ${response.status}`);
      return response.arrayBuffer();
    }),
    new THREE.TextureLoader().loadAsync(textureUrl),
  ]);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 4;
  const header = new Uint32Array(buffer, 0, 8);
  if (header[0] !== 0x4c44504c) throw new Error("bad people asset");
  const vertices = header[2];
  const lod0Count = header[3];
  const lod1Count = header[4];
  const bones = header[5];
  let offset = 32;
  const floats = new Float32Array(buffer, offset, 6 + bones * 16);
  offset += floats.byteLength;
  const min = new THREE.Vector3(floats[0], floats[1], floats[2]);
  const ext = new THREE.Vector3(floats[3], floats[4], floats[5]);
  const inverseBind: THREE.Matrix4[] = [];
  for (let bone = 0; bone < bones; bone++) inverseBind.push(new THREE.Matrix4().fromArray(floats, 6 + bone * 16).invert());
  const take = <T extends ArrayBufferView>(make: (b: ArrayBuffer, o: number, n: number) => T, count: number, bytes: number): T => {
    const view = make(buffer, offset, count);
    offset += Math.ceil((count * bytes) / 4) * 4;
    return view;
  };
  const positions = take((b, o, n) => new Uint16Array(b, o, n), vertices * 4, 2);
  const normals = take((b, o, n) => new Int8Array(b, o, n), vertices * 4, 1);
  const uvs = take((b, o, n) => new Uint16Array(b, o, n), vertices * 2, 2);
  const joints = take((b, o, n) => new Uint8Array(b, o, n), vertices * 4, 1);
  const weights = take((b, o, n) => new Uint8Array(b, o, n), vertices * 4, 1);
  const cloth = take((b, o, n) => new Uint8Array(b, o, n), vertices * 4, 1);
  const lod0 = take((b, o, n) => new Uint16Array(b, o, n), lod0Count, 2);
  const lod1 = take((b, o, n) => new Uint16Array(b, o, n), lod1Count, 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(positions, 4), 3, 0, true));
  geometry.setAttribute("normal", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(normals, 4), 3, 0, true));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2, true));
  geometry.setAttribute("aJoints", new THREE.BufferAttribute(joints, 4, false));
  geometry.setAttribute("aWeights", new THREE.BufferAttribute(weights, 4, true));
  geometry.setAttribute("aCloth", new THREE.BufferAttribute(cloth, 4, true));
  return { geometry, lod0: new THREE.BufferAttribute(lod0, 1), lod1: new THREE.BufferAttribute(lod1, 1), inverseBind, min, ext, texture, skinRef };
}

export class SkinnedPeople {
  ready = false;
  failed = false;
  private readonly bones: Float32Array;
  private readonly boneTexture: THREE.DataTexture;
  private readonly groups: DrawGroup[] = [];
  private readonly bodies: BodyAsset[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly viewer = new THREE.Vector3(0, 1e6, 0);
  private slot = 0;
  private readonly color = new THREE.Color();
  private readonly frame = new THREE.Matrix4();
  private readonly bone = new THREE.Matrix4();
  private readonly rotation = new THREE.Matrix4();
  private readonly pitch = new THREE.Matrix4();
  private readonly scaleMatrix = new THREE.Matrix4();
  private readonly a = new THREE.Vector3();
  private readonly x = new THREE.Vector3();
  private readonly z = new THREE.Vector3();
  private readonly ref = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly upAxis = new THREE.Vector3(0, 1, 0);
  private readonly wrist = new THREE.Vector3();
  private readonly handTip = new THREE.Vector3();
  private readonly chestSide = new THREE.Vector3();
  private disposed = false;

  constructor(private readonly parent: THREE.Object3D, private readonly capacity: number, baseUrl = "/models/people/") {
    this.bones = new Float32Array(TEXELS_PER_ROW * 4 * capacity);
    this.boneTexture = new THREE.DataTexture(this.bones, TEXELS_PER_ROW, capacity, THREE.RGBAFormat, THREE.FloatType);
    this.boneTexture.minFilter = THREE.NearestFilter;
    this.boneTexture.magFilter = THREE.NearestFilter;
    this.boneTexture.generateMipmaps = false;
    this.boneTexture.needsUpdate = true;
    if (typeof window === "undefined" || typeof fetch !== "function" || typeof document === "undefined" || !("WebGL2RenderingContext" in window)) {
      this.failed = true;
      return;
    }
    Promise.all([
      loadBody(`${baseUrl}body-male.bin`, `${baseUrl}body-male.webp`, new THREE.Color().setRGB(0.703, 0.535, 0.36, THREE.SRGBColorSpace)),
      loadBody(`${baseUrl}body-female.bin`, `${baseUrl}body-female.webp`, new THREE.Color().setRGB(0.708, 0.545, 0.366, THREE.SRGBColorSpace)),
    ]).then((bodies) => {
      if (this.disposed) {
        for (const body of bodies) { body.geometry.dispose(); body.texture.dispose(); }
        return;
      }
      this.bodies.push(...bodies);
      for (const body of bodies) for (const lod of [body.lod0, body.lod1]) this.groups.push(this.createGroup(body, lod));
      this.ready = true;
    }).catch((error: unknown) => {
      this.failed = true;
      if (typeof console !== "undefined") console.warn("[city] skinned people unavailable, keeping procedural figures", error);
    });
  }

  private createGroup(body: BodyAsset, index: THREE.BufferAttribute): DrawGroup {
    const geometry = new THREE.InstancedBufferGeometry();
    for (const [name, attribute] of Object.entries(body.geometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(index);
    const capacity = this.capacity;
    const add = (name: string, size: number) => {
      const attribute = new THREE.InstancedBufferAttribute(new Float32Array(capacity * size), size);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      return attribute;
    };
    const group: DrawGroup = {
      mesh: undefined as unknown as THREE.Mesh, geometry,
      slot: add("iSlot", 1), skin: add("iSkin", 3), coat: add("iCoat", 3), shirt: add("iShirt", 3), pants: add("iPants", 3), shoes: add("iShoes", 3), hair: add("iHair", 3), style: add("iStyle", 4),
      used: 0,
    };
    geometry.instanceCount = 0;
    const uniforms = {
      peopleBones: { value: this.boneTexture },
      peoplePosMin: { value: body.min },
      peoplePosExt: { value: body.ext },
      peopleSkinRef: { value: body.skinRef },
    };
    const material = new THREE.MeshStandardMaterial({ map: body.texture, roughness: 0.8, metalness: 0 });
    material.name = "Realistic resident";
    material.onBeforeCompile = (shader) => {
      patchVertex(shader, uniforms, true);
      patchFragment(shader);
    };
    material.customProgramCacheKey = () => "skinned-people-v3";
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (shader) => patchVertex(shader, uniforms, false);
    depth.customProgramCacheKey = () => "skinned-people-depth-v1";
    const distance = new THREE.MeshDistanceMaterial();
    distance.onBeforeCompile = (shader) => patchVertex(shader, uniforms, false);
    distance.customProgramCacheKey = () => "skinned-people-distance-v1";
    this.materials.push(material, depth, distance);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Neighborhood · realistic residents";
    mesh.customDepthMaterial = depth;
    mesh.customDistanceMaterial = distance;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      this.viewer.setFromMatrixPosition(camera.matrixWorld);
    };
    this.parent.add(mesh);
    group.mesh = mesh;
    return group;
  }

  begin(): void {
    this.slot = 0;
    for (const group of this.groups) group.used = 0;
  }

  /** 写入一位居民；返回 false 时调用方应退回程序化人形。 */
  add(pose: WorldPose, appearance: Appearance): boolean {
    if (!this.ready || this.slot >= this.capacity) return false;
    const female = appearance.skirt === true || appearance.hairStyle >= 2;
    const far = pose.hips.distanceToSquared(this.viewer) > LOD_DISTANCE * LOD_DISTANCE;
    const group = this.groups[(female ? 2 : 0) + (far ? 1 : 0)];
    const body = this.bodies[female ? 1 : 0];
    const slot = this.slot++;
    this.writeBones(slot, pose, appearance, body);
    const i = group.used++;
    group.slot.setX(i, slot);
    const set = (attribute: THREE.InstancedBufferAttribute, hex: string) => {
      this.color.set(hex);
      attribute.setXYZ(i, this.color.r, this.color.g, this.color.b);
    };
    set(group.skin, appearance.skin);
    set(group.coat, appearance.coat);
    set(group.shirt, appearance.shirt ?? appearance.coat);
    set(group.pants, appearance.trousers);
    set(group.shoes, appearance.shoes);
    set(group.hair, appearance.hair);
    // 地标单位：躯干/腿 0 地面…1 踝…2 膝…3 髋…4 腰带…5 颈；手臂 0 肩…1 肘…2 腕。
    const sleeve = appearance.sleeveLength > 0.7 || appearance.winterCoat ? 1.96 : 0.5;
    const bareTop = appearance.skirt ? 2.15 : 1.25;
    const coatBottom = appearance.winterCoat || appearance.coatLength > 0.62 ? Math.max(2.15, 3.2 - appearance.coatLength * 1.1) : 3.62;
    group.style.setXYZW(i, sleeve, bareTop, coatBottom, appearance.winterCoat ? 1 : 0);
    return true;
  }

  end(): void {
    for (const group of this.groups) {
      group.geometry.instanceCount = group.used;
      group.mesh.visible = group.used > 0;
      if (group.used === 0) continue;
      for (const attribute of [group.slot, group.skin, group.coat, group.shirt, group.pants, group.shoes, group.hair, group.style]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, group.used * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    }
    if (this.slot > 0) {
      this.boneTexture.needsUpdate = true;
    }
  }

  private limb(origin: THREE.Vector3, tip: THREE.Vector3, thickness: number): THREE.Matrix4 {
    this.a.subVectors(tip, origin);
    const length = Math.max(1e-4, this.a.length());
    this.a.multiplyScalar(1 / length);
    const t = Math.min(1, Math.max(0, (Math.abs(this.a.dot(this.forward)) - 0.6) / 0.35));
    const k = t * t * (3 - 2 * t);
    this.ref.copy(this.forward).multiplyScalar(1 - k).addScaledVector(this.upAxis, k).normalize();
    this.x.copy(this.ref).addScaledVector(this.a, -this.ref.dot(this.a)).normalize();
    this.z.crossVectors(this.x, this.a);
    return this.frame.set(
      this.x.x * thickness, this.a.x * length, this.z.x * thickness, origin.x,
      this.x.y * thickness, this.a.y * length, this.z.y * thickness, origin.y,
      this.x.z * thickness, this.a.z * length, this.z.z * thickness, origin.z,
      0, 0, 0, 1,
    );
  }

  private torso(origin: THREE.Vector3, tip: THREE.Vector3, side: THREE.Vector3, width: number, depth: number): THREE.Matrix4 {
    this.a.subVectors(tip, origin);
    const length = Math.max(1e-4, this.a.length());
    this.a.multiplyScalar(1 / length);
    this.x.copy(side).addScaledVector(this.a, -side.dot(this.a)).normalize();
    this.z.crossVectors(this.x, this.a);
    return this.frame.set(
      this.x.x * width, this.a.x * length, this.z.x * depth, origin.x,
      this.x.y * width, this.a.y * length, this.z.y * depth, origin.y,
      this.x.z * width, this.a.z * length, this.z.z * depth, origin.z,
      0, 0, 0, 1,
    );
  }

  private rigid(origin: THREE.Vector3, yaw: number, pitch: number, scale: number): THREE.Matrix4 {
    this.rotation.makeRotationY(yaw);
    this.pitch.makeRotationX(pitch);
    this.scaleMatrix.makeScale(scale, scale, scale);
    return this.frame.copy(this.rotation).multiply(this.pitch).multiply(this.scaleMatrix).setPosition(origin);
  }

  private store(slot: number, bone: number, frame: THREE.Matrix4, body: BodyAsset): void {
    this.bone.multiplyMatrices(frame, body.inverseBind[bone]);
    this.bone.toArray(this.bones, (slot * TEXELS_PER_ROW + bone * 4) * 4);
  }

  private writeBones(slot: number, pose: WorldPose, appearance: Appearance, body: BodyAsset): void {
    const s = pose.scale;
    this.forward.set(Math.sin(pose.heading), 0, Math.cos(pose.heading));
    this.side.set(Math.cos(pose.heading), 0, -Math.sin(pose.heading));
    const build = appearance.build;
    const shoulderSpan = pose.leftShoulder.distanceTo(pose.rightShoulder) / Math.max(0.01, s);
    const width = s * Math.min(1.12, Math.max(0.82, shoulderSpan / 0.424)) * 0.94;
    this.store(slot, SEG.hips, this.torso(pose.hips, pose.chest, this.side, width * 0.97, s * build * 0.9), body);
    const chestSide = this.chestSide.subVectors(pose.rightShoulder, pose.leftShoulder);
    if (chestSide.lengthSq() < 1e-6) chestSide.copy(this.side);
    chestSide.normalize();
    this.store(slot, SEG.chest, this.torso(pose.chest, pose.head, chestSide, width, s * build * 0.9), body);
    this.store(slot, SEG.head, this.rigid(pose.head, pose.heading + pose.headYaw, pose.headPitch, s * 0.94), body);
    const limbs: Array<[THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3, number, number, number, number, number, number, number]> = [
      [pose.rightShoulder, pose.rightElbow, pose.rightHand, pose.rightHip, pose.rightKnee, pose.rightAnkle, SEG.upperR, SEG.foreR, SEG.handR, SEG.thighR, SEG.calfR, SEG.footR, pose.rightFootPitch],
      [pose.leftShoulder, pose.leftElbow, pose.leftHand, pose.leftHip, pose.leftKnee, pose.leftAnkle, SEG.upperL, SEG.foreL, SEG.handL, SEG.thighL, SEG.calfL, SEG.footL, pose.leftFootPitch],
    ];
    const arm = s * 0.84 * (0.9 + build * 0.1);
    const legThickness = s * 0.9 * build;
    for (const [shoulder, elbow, hand, hip, knee, ankle, upper, fore, palm, thigh, calf, foot, footPitch] of limbs) {
      this.store(slot, upper, this.limb(shoulder, elbow, arm), body);
      // 运行时 hand 是手掌中心；绑定骨段以腕关节为起点，故沿前臂回退约 6 cm。
      this.a.subVectors(hand, elbow);
      const forearm = this.a.length();
      this.wrist.copy(elbow).addScaledVector(this.a, Math.max(0.4, (forearm - 0.06 * s) / Math.max(1e-4, forearm)));
      this.store(slot, fore, this.limb(elbow, this.wrist, arm), body);
      this.a.subVectors(this.wrist, elbow).normalize();
      this.handTip.copy(this.wrist).addScaledVector(this.a, 0.116 * s);
      this.store(slot, palm, this.limb(this.wrist, this.handTip, s * 0.92), body);
      this.store(slot, thigh, this.limb(hip, knee, legThickness), body);
      this.store(slot, calf, this.limb(knee, ankle, legThickness), body);
      this.store(slot, foot, this.rigid(ankle, pose.heading, footPitch, s), body);
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const group of this.groups) {
      group.mesh.removeFromParent();
      group.geometry.dispose();
    }
    for (const body of this.bodies) {
      body.geometry.dispose();
      body.texture.dispose();
    }
    for (const material of this.materials) material.dispose();
    this.boneTexture.dispose();
    this.groups.length = 0;
  }
}
