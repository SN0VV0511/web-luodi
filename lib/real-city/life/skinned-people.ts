import * as THREE from "three";
import type { Appearance } from "./types";
import { fetchMeshoptContainer } from "../assets/meshopt-container";

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
  normal: THREE.Texture;
  skinRef: THREE.Color;
}

interface HairGroup {
  mesh: THREE.Mesh;
  geometry: THREE.InstancedBufferGeometry;
  slot: THREE.InstancedBufferAttribute;
  hair: THREE.InstancedBufferAttribute;
  used: number;
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
  cut: THREE.InstancedBufferAttribute;
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
attribute vec2 iCut;
mat4 peopleBone(float bone) {
  int x = int(bone + 0.5) * 4;
  int y = int(iSlot + 0.5);
  return mat4(texelFetch(peopleBones, ivec2(x, y), 0), texelFetch(peopleBones, ivec2(x + 1, y), 0), texelFetch(peopleBones, ivec2(x + 2, y), 0), texelFetch(peopleBones, ivec2(x + 3, y), 0));
}
float peopleInflate(vec4 cloth, vec4 style) {
  float zone = floor(cloth.x * 255.0 + 0.5);
  float winter = style.w;
  if (zone == 0.0) return cloth.y >= iCut.x ? iCut.y * smoothstep(iCut.x, iCut.x + 0.16, cloth.y) : 0.0;
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
  let vs = shader.vertexShader.replace("#include <common>", `#include <common>\n${PARS_VERTEX}\n${withColors ? "varying vec4 vPeopleCloth;\nflat varying float vPeopleZone;\nflat varying vec3 vPeopleSkin;\nflat varying vec3 vPeopleCoat;\nflat varying vec3 vPeopleShirt;\nflat varying vec3 vPeoplePants;\nflat varying vec3 vPeopleShoes;\nflat varying vec3 vPeopleHair;\nflat varying vec4 vPeopleStyle;\nflat varying vec2 vPeopleCut;" : ""}`);
  vs = vs.replace("void main() {", SKIN_MAIN + (withColors ? "  vPeopleCloth = aCloth; vPeopleZone = floor(aCloth.x * 255.0 + 0.5); vPeopleSkin = iSkin; vPeopleCoat = iCoat; vPeopleShirt = iShirt; vPeoplePants = iPants; vPeopleShoes = iShoes; vPeopleHair = iHair; vPeopleStyle = iStyle; vPeopleCut = iCut;\n" : ""));
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
flat varying vec2 vPeopleCut;
uniform vec3 peopleSkinRef;
float peopleRough = 0.85;
float peopleSkinMask = 1.0;
vec2 peopleFold = vec2(0.0);
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
  if (zone == 0.0) {
    // 发壳下的头皮底色：平滑过渡（无逐像素硬边），体积与发丝由独立发型网格提供。
    float edge = smoothstep(vPeopleCut.x - 0.05, vPeopleCut.x + 0.08, vPeopleCloth.y);
    col = mix(col, vPeopleHair * 0.7, edge * 0.92);
    peopleRough = mix(peopleRough, 0.6, edge);
  } else if (zone == 1.0) {
    float L = vPeopleCloth.z * 6.0;
    if (L < 1.25) { col = vPeopleShoes; peopleRough = 0.45; peopleSkinMask = 0.0; }
    else if (L < vPeopleStyle.y) { col = mix(skin, vec3(0.04, 0.036, 0.035), 0.7); peopleRough = 0.45; }
    else if (L < vPeopleStyle.z) {
      col = vPeoplePants * weave; peopleRough = 0.88; peopleSkinMask = 0.0;
      // 裤子褶皱：膝窝与脚踝堆褶（横向），裤管纵向垂褶。
      float k = exp(-pow((L - 2.0) / 0.35, 2.0)) + exp(-pow((L - 1.35) / 0.2, 2.0));
      peopleFold = vec2(sin(vMapUv.x * 90.0) * 0.18, sin(L * 34.0 + sin(vMapUv.x * 55.0) * 2.5) * (0.12 + 0.5 * k));
    }
    else if (L < 5.0) {
      col = vPeopleCoat * weave; peopleRough = 0.86; peopleSkinMask = 0.0;
      // 上衣褶皱：腰间与腋下的横向挤压褶 + 前襟的纵向垂坠。
      float waist = exp(-pow((L - 3.9) / 0.3, 2.0)) + 0.6 * exp(-pow((L - 4.6) / 0.15, 2.0));
      peopleFold = vec2(sin(vMapUv.x * 70.0 + L * 3.0) * 0.16, sin(L * 30.0 + sin(vMapUv.x * 48.0) * 2.0) * (0.1 + 0.45 * waist));
      if (L > 4.8 && front > 0.55) col = vPeopleShirt;
      // 腰带
      if (vPeopleStyle.z > 3.0 && L > vPeopleStyle.z && L < vPeopleStyle.z + 0.05) col *= 0.55;
    }
  } else if (zone == 2.0) {
    float A = vPeopleCloth.y * 3.0;
    if (A < vPeopleStyle.x) {
      col = vPeopleCoat * weave; peopleRough = 0.86; peopleSkinMask = 0.0;
      // 袖子：肘弯处的环状堆褶。
      float elbow = exp(-pow((A - 1.0) / 0.18, 2.0)) + 0.5 * exp(-pow((A - vPeopleStyle.x + 0.1) / 0.1, 2.0));
      peopleFold = vec2(0.06 * sin(vMapUv.y * 80.0), sin(A * 42.0 + sin(vMapUv.y * 60.0) * 2.0) * (0.08 + 0.5 * elbow));
      if (vPeopleStyle.x > 1.5 && A > vPeopleStyle.x - 0.07) col = vPeopleShirt;
    }
  } else if (zone == 7.0) {
    col = vPeopleHair; peopleRough = 0.9; peopleSkinMask = 0.0;
  } else if (zone == 8.0) {
    float along = vPeopleCloth.y;
    col = along > 0.93 ? vec3(0.012, 0.01, 0.009) : along > 0.84 ? vec3(0.09, 0.05, 0.03) : vec3(0.62, 0.6, 0.56);
    peopleRough = 0.2; peopleSkinMask = 0.0;
  }
  diffuseColor.rgb *= col;
}
`;

function patchFragment(shader: { fragmentShader: string; uniforms: Record<string, THREE.IUniform> }): void {
  let fs = shader.fragmentShader.replace("#include <common>", `#include <common>\n${FRAGMENT_PARS}`);
  fs = fs.replace("#include <map_fragment>", FRAGMENT_MAP);
  fs = fs.replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = peopleRough;");
  // 皮肤用 UBC 法线贴图（面部五官、锁骨、手指关节）；衣物改用程序化褶皱法线，避免布料下透出肌肉。
  fs = fs.replace("#include <normal_fragment_maps>", `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = texture2D(normalMap, vNormalMapUv).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale * peopleSkinMask;
  mapN.xy += peopleFold;
  normal = normalize(tbn * mapN);
#endif`);
  shader.fragmentShader = fs;
}

interface BodyMeta { bones: number; min: number[]; ext: number[]; frames: number[][] }

async function loadBody(url: string, textureUrl: string, skinRef: THREE.Color): Promise<BodyAsset> {
  const [container, texture, normal] = await Promise.all([
    fetchMeshoptContainer<BodyMeta>(url),
    new THREE.TextureLoader().loadAsync(textureUrl),
    new THREE.TextureLoader().loadAsync(textureUrl.replace(/\.webp$/, "-normal.webp")),
  ]);
  normal.flipY = false;
  normal.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 4;
  const { meta, streams } = container;
  const stream = (name: string) => {
    const data = streams.get(name);
    if (!data) throw new Error(`people asset missing ${name}`);
    return data;
  };
  const view = <T>(name: string, make: (buffer: ArrayBuffer, offset: number, length: number) => T, bytes: number): T => {
    const data = stream(name);
    return make(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength / bytes);
  };
  const min = new THREE.Vector3().fromArray(meta.min);
  const ext = new THREE.Vector3().fromArray(meta.ext);
  const inverseBind = meta.frames.map((frame) => new THREE.Matrix4().fromArray(frame).invert());
  const positions = view("position", (b, o, n) => new Uint16Array(b, o, n), 2);
  const normals = view("normal", (b, o, n) => new Int8Array(b, o, n), 1);
  const uvs = view("uv", (b, o, n) => new Uint16Array(b, o, n), 2);
  const lod0 = view("lod0", (b, o, n) => new Uint16Array(b, o, n), 2);
  const lod1 = view("lod1", (b, o, n) => new Uint16Array(b, o, n), 2);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(positions, 4), 3, 0, true));
  geometry.setAttribute("normal", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(normals, 4), 3, 0, true));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2, true));
  geometry.setAttribute("aJoints", new THREE.BufferAttribute(stream("joints"), 4, false));
  geometry.setAttribute("aWeights", new THREE.BufferAttribute(stream("weights"), 4, true));
  geometry.setAttribute("aCloth", new THREE.BufferAttribute(stream("cloth"), 4, true));
  return { geometry, lod0: new THREE.BufferAttribute(lod0, 1), lod1: new THREE.BufferAttribute(lod1, 1), inverseBind, min, ext, texture, normal, skinRef };
}

export const HAIR_STYLE_NAMES = ["short", "crop", "long", "bun", "ponytail"] as const;
type HairMeta = { styles: Record<string, { min: number[]; ext: number[] }> };
type HairAsset = { geometry: THREE.BufferGeometry; lod0: THREE.BufferAttribute; lod1: THREE.BufferAttribute; min: THREE.Vector3; ext: THREE.Vector3 };

async function loadHair(url: string): Promise<HairAsset[]> {
  const { meta, streams } = await fetchMeshoptContainer<HairMeta>(url);
  const stream = (name: string) => {
    const data = streams.get(name);
    if (!data) throw new Error(`hair asset missing ${name}`);
    return data;
  };
  return HAIR_STYLE_NAMES.map((style) => {
    const pos = stream(`${style}.position`), nor = stream(`${style}.normal`), flow = stream(`${style}.flow`);
    const i0 = stream(`${style}.lod0`), i1 = stream(`${style}.lod1`);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Uint16Array(pos.buffer as ArrayBuffer, pos.byteOffset, pos.byteLength / 2), 4), 3, 0, true));
    const normals = new THREE.InterleavedBuffer(new Int8Array(nor.buffer as ArrayBuffer, nor.byteOffset, nor.byteLength), 4);
    geometry.setAttribute("normal", new THREE.InterleavedBufferAttribute(normals, 3, 0, true));
    geometry.setAttribute("aLayer", new THREE.InterleavedBufferAttribute(normals, 1, 3, false));
    geometry.setAttribute("uv", new THREE.BufferAttribute(new Uint16Array(flow.buffer as ArrayBuffer, flow.byteOffset, flow.byteLength / 2), 2, true));
    const index = (data: Uint8Array) => new THREE.BufferAttribute(new Uint16Array(data.buffer as ArrayBuffer, data.byteOffset, data.byteLength / 2), 1);
    return { geometry, lod0: index(i0), lod1: index(i1), min: new THREE.Vector3().fromArray(meta.styles[style].min), ext: new THREE.Vector3().fromArray(meta.styles[style].ext) };
  });
}

const HAIR_PARS_VERTEX = /* glsl */ `
uniform highp sampler2D peopleBones;
uniform vec3 hairMin;
uniform vec3 hairExt;
attribute float iSlot;
attribute vec3 iHair;
attribute float aLayer;
varying vec2 vHairFlow;
varying float vHairLayer;
varying vec3 vHairColor;
mat4 hairHeadBone() {
  int y = int(iSlot + 0.5);
  return mat4(texelFetch(peopleBones, ivec2(8, y), 0), texelFetch(peopleBones, ivec2(9, y), 0), texelFetch(peopleBones, ivec2(10, y), 0), texelFetch(peopleBones, ivec2(11, y), 0));
}
`;

function patchHairVertex(shader: THREE.WebGLProgramParametersWithUniforms, uniforms: Record<string, THREE.IUniform>, withNormal: boolean): void {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", `#include <common>\n${HAIR_PARS_VERTEX}`)
    .replace("#include <beginnormal_vertex>", withNormal ? `mat4 hairBone = hairHeadBone();\nvec3 objectNormal = normalize(mat3(hairBone) * normal);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif` : "#include <beginnormal_vertex>")
    .replace("#include <begin_vertex>", `${withNormal ? "" : "mat4 hairBone = hairHeadBone();\n"}vec3 transformed = (hairBone * vec4(hairMin + position * hairExt, 1.0)).xyz;\nvHairFlow = uv;\nvHairLayer = aLayer;\nvHairColor = iHair;`);
  // 骨骼矩阵已是世界变换；网格本身用单位矩阵。
}

/** 发丝着色：u 绕头一周的细条纹 + 簇状深浅；发际与发梢以噪声 alpha 软化，外层发壳只保留稀疏发丝形成蓬松轮廓。 */
const HAIR_FRAGMENT = /* glsl */ `
float hairHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float hairStrands(vec2 f) {
  float lane = f.x * 700.0;
  float id = floor(lane);
  // 发丝小于一个像素时淡出为平均值，避免远处出现摩尔纹 / 木纹条带。
  float blur = clamp((fwidth(lane) - 0.35) / 0.65, 0.0, 1.0);
  float r = hairHash(vec2(id, 3.1));
  float along = f.y * (6.0 + r * 10.0) + r * 7.0;
  float cut = hairHash(vec2(id, floor(along)));
  float across = abs(fract(lane) - 0.5) * 2.0;
  return mix((1.0 - smoothstep(0.35, 1.0, across)) * (0.35 + 0.65 * cut), 0.5, blur);
}
`;

function patchHairFragment(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>\nvarying vec2 vHairFlow;\nvarying float vHairLayer;\nvarying vec3 vHairColor;\n${HAIR_FRAGMENT}`)
    .replace("#include <map_fragment>", `
      float hs = hairStrands(vHairFlow);
      float clump = 0.8 + 0.2 * sin(vHairFlow.x * 140.0 + sin(vHairFlow.y * 9.0) * 2.0);
      float layer = floor(vHairLayer + 0.5);
      float hairAlpha;
      if (layer < 0.5) hairAlpha = smoothstep(0.0, 0.2, vHairFlow.y + (hs - 0.5) * 0.25);
      else if (layer < 1.5) hairAlpha = smoothstep(0.42, 0.62, hs) * smoothstep(0.06, 0.3, vHairFlow.y);
      else if (layer < 2.5) hairAlpha = smoothstep(0.6, 0.78, hs) * smoothstep(0.12, 0.4, vHairFlow.y);
      else hairAlpha = smoothstep(0.0, 0.16, vHairFlow.y - (1.0 - hs) * 0.14);
      diffuseColor.rgb = vHairColor * (0.74 + 0.36 * hs) * clump * (0.84 + 0.16 * vHairFlow.y + layer * 0.04);
      diffuseColor.a = hairAlpha;
    `)
    .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      // 发丝法线：沿发丝横向的条纹起伏，产生各向异性般的高光带。
      normal = normalize(normal + (hs - 0.5) * 0.22 * normalize(cross(normal, vec3(0.0, 1.0, 0.0)) + 1e-4));`);
}

export class SkinnedPeople {
  ready = false;
  failed = false;
  private readonly bones: Float32Array;
  private readonly boneTexture: THREE.DataTexture;
  private readonly groups: DrawGroup[] = [];
  private readonly bodies: BodyAsset[] = [];
  /** [female][style][lod] 发型实例组。 */
  private readonly hairGroups: HairGroup[][][] = [];
  private readonly hairs: HairAsset[][] = [];
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
      loadHair(`${baseUrl}hair-male.bin`),
      loadHair(`${baseUrl}hair-female.bin`),
    ]).then(([male, female, maleHair, femaleHair]) => {
      const bodies = [male, female];
      if (this.disposed) {
        for (const body of bodies) { body.geometry.dispose(); body.texture.dispose(); body.normal.dispose(); }
        for (const hair of [...maleHair, ...femaleHair]) hair.geometry.dispose();
        return;
      }
      this.bodies.push(...bodies);
      for (const body of bodies) for (const lod of [body.lod0, body.lod1]) this.groups.push(this.createGroup(body, lod));
      this.hairs.push(maleHair, femaleHair);
      for (const set of this.hairs) this.hairGroups.push(set.map((hair) => [this.createHairGroup(hair, hair.lod0), this.createHairGroup(hair, hair.lod1)]));
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
      slot: add("iSlot", 1), skin: add("iSkin", 3), coat: add("iCoat", 3), shirt: add("iShirt", 3), pants: add("iPants", 3), shoes: add("iShoes", 3), hair: add("iHair", 3), style: add("iStyle", 4), cut: add("iCut", 2),
      used: 0,
    };
    geometry.instanceCount = 0;
    const uniforms = {
      peopleBones: { value: this.boneTexture },
      peoplePosMin: { value: body.min },
      peoplePosExt: { value: body.ext },
      peopleSkinRef: { value: body.skinRef },
    };
    const material = new THREE.MeshStandardMaterial({ map: body.texture, normalMap: body.normal, normalScale: new THREE.Vector2(1, -1), roughness: 0.8, metalness: 0 });
    material.name = "Realistic resident";
    material.onBeforeCompile = (shader) => {
      patchVertex(shader, uniforms, true);
      patchFragment(shader);
    };
    material.customProgramCacheKey = () => "skinned-people-v5";
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (shader) => patchVertex(shader, uniforms, false);
    depth.customProgramCacheKey = () => "skinned-people-depth-v2";
    const distance = new THREE.MeshDistanceMaterial();
    distance.onBeforeCompile = (shader) => patchVertex(shader, uniforms, false);
    distance.customProgramCacheKey = () => "skinned-people-distance-v2";
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

  private createHairGroup(hair: HairAsset, index: THREE.BufferAttribute): HairGroup {
    const geometry = new THREE.InstancedBufferGeometry();
    for (const [name, attribute] of Object.entries(hair.geometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(index);
    const add = (name: string, size: number) => {
      const attribute = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * size), size);
      attribute.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute(name, attribute);
      return attribute;
    };
    const group: HairGroup = { mesh: undefined as unknown as THREE.Mesh, geometry, slot: add("iSlot", 1), hair: add("iHair", 3), used: 0 };
    geometry.instanceCount = 0;
    const uniforms = { peopleBones: { value: this.boneTexture }, hairMin: { value: hair.min }, hairExt: { value: hair.ext } };
    const material = new THREE.MeshStandardMaterial({ roughness: 0.52, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
    material.name = "Resident hair";
    material.onBeforeCompile = (shader) => { patchHairVertex(shader, uniforms, true); patchHairFragment(shader); };
    material.customProgramCacheKey = () => "people-hair-v2";
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = (shader) => patchHairVertex(shader, uniforms, false);
    depth.customProgramCacheKey = () => "people-hair-depth-v1";
    this.materials.push(material, depth);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Neighborhood · resident hair";
    // 调试 / 截图：按骨骼槽位取头部世界位置与朝向（绑定空间头部中心 × 头部骨矩阵）。
    mesh.userData.head = (slot: number, center: number[]) => {
      const m = new THREE.Matrix4().fromArray(this.bones, (slot * TEXELS_PER_ROW + 2 * 4) * 4);
      const c = new THREE.Vector3().fromArray(center).applyMatrix4(m);
      const f = new THREE.Vector3(0, 0, 1).transformDirection(m);
      return [c.x, c.y, c.z, f.x, f.z];
    };
    mesh.customDepthMaterial = depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    this.parent.add(mesh);
    group.mesh = mesh;
    return group;
  }

  begin(): void {
    this.slot = 0;
    for (const group of this.groups) group.used = 0;
    for (const sex of this.hairGroups) for (const style of sex) for (const group of style) group.used = 0;
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
    // 发型阈值（越小发际越低）与发量；戴帽时只留帽下鬓角，不鼓出以免顶穿帽子。
    // 头皮着色只作为发壳下的深色底层（不再鼓出）；体积发型由独立的发壳/发帘网格提供，戴帽时省略。
    const hs = Math.min(4, Math.max(0, appearance.hairStyle | 0));
    const cut = appearance.hat ? 0.5 : hs === 1 ? 0.58 : hs >= 2 ? 0.45 : 0.51;
    group.cut.setXY(i, cut, 0);
    if (!appearance.hat) {
      const hairGroup = this.hairGroups[female ? 1 : 0]?.[hs]?.[far ? 1 : 0];
      if (hairGroup) {
        const h = hairGroup.used++;
        hairGroup.slot.setX(h, slot);
        this.color.set(appearance.hair);
        hairGroup.hair.setXYZ(h, this.color.r, this.color.g, this.color.b);
      }
    }
    return true;
  }

  end(): void {
    for (const sex of this.hairGroups) for (const style of sex) for (const group of style) {
      group.geometry.instanceCount = group.used;
      group.mesh.visible = group.used > 0;
      if (group.used === 0) continue;
      for (const attribute of [group.slot, group.hair]) {
        attribute.clearUpdateRanges();
        attribute.addUpdateRange(0, group.used * attribute.itemSize);
        attribute.needsUpdate = true;
      }
    }
    for (const group of this.groups) {
      group.geometry.instanceCount = group.used;
      group.mesh.visible = group.used > 0;
      if (group.used === 0) continue;
      for (const attribute of [group.slot, group.skin, group.coat, group.shirt, group.pants, group.shoes, group.hair, group.style, group.cut]) {
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
    for (const sex of this.hairGroups) for (const style of sex) for (const group of style) { group.mesh.removeFromParent(); group.geometry.dispose(); }
    for (const set of this.hairs) for (const hair of set) hair.geometry.dispose();
    this.hairGroups.length = 0;
    for (const body of this.bodies) {
      body.geometry.dispose();
      body.texture.dispose();
      body.normal.dispose();
    }
    for (const material of this.materials) material.dispose();
    this.boneTexture.dispose();
    this.groups.length = 0;
  }
}
