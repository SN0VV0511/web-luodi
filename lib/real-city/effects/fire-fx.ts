import * as THREE from "three";

/**
 * GPU fire for the building-fire incident: noise-shaped flame sheets licking out of windows,
 * glowing interiors, embers, a rising smoke column with fire-lit underside, steam once hoses
 * hit the flames, two arcing water streams, soot scorch on the facade and a flickering point light.
 * Every particle is animated in the vertex shader from one time uniform, so the CPU only
 * updates a handful of uniforms per frame.
 */

const noiseGlsl = /* glsl */ `
float fxHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float fxNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fxHash(i), fxHash(i + vec2(1.0, 0.0)), u.x), mix(fxHash(i + vec2(0.0, 1.0)), fxHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fxFbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * fxNoise(p); p = p * 2.03 + vec2(3.1, 1.7); a *= 0.5; }
  return v;
}
float fxRand(float s) { return fract(sin(s * 91.345 + 7.13) * 47453.5453); }
`;

const billboardGlsl = /* glsl */ `
vec3 fxCameraRight() { return vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); }
vec3 fxCameraUp() { return vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
`;

const flameVertex = /* glsl */ `
attribute vec4 aFlame; // xyz base position (world), w seed
attribute vec2 aSize;  // width, height in metres
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying float vSeed;
${billboardGlsl}
void main() {
  vUv = uv;
  vSeed = aFlame.w;
  vec3 right = fxCameraRight();
  right = normalize(vec3(right.x, 0.0, right.z) + 1e-5);
  float lick = 0.75 + 0.35 * sin(uTime * (2.3 + vSeed * 1.7) + vSeed * 20.0);
  float height = aSize.y * uIntensity * lick;
  vec3 offset = right * (position.x * aSize.x * (0.6 + 0.4 * uIntensity));
  offset.y += position.y * height;
  // Flames lean away from the wall and sway with the draught.
  offset += vec3(sin(uTime * 3.1 + vSeed * 9.0) * 0.25, 0.0, 0.45) * position.y * position.y * height * 0.35;
  vec4 world = vec4(aFlame.xyz + offset, 1.0);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const flameFragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
uniform float uBrightness;
varying vec2 vUv;
varying float vSeed;
${noiseGlsl}
void main() {
  vec2 q = vec2(vUv.x - 0.5, vUv.y);
  // Domain-warped turbulence scrolling upward gives separate tongues instead of a solid sheet.
  vec2 warp = vec2(fxFbm(vec2(q.x * 3.0 + vSeed * 5.0, q.y * 2.0 - uTime * 1.7)), 0.0) - 0.5;
  float n = fxFbm(vec2((q.x + warp.x * 0.45) * 4.6 + vSeed * 11.0, q.y * 3.4 - uTime * 3.2));
  float taper = abs(q.x + warp.x * 0.3 * q.y) * 2.0 / (1.05 - q.y * 0.85);
  float shape = 1.0 - smoothstep(0.35, 1.0, taper);
  float density = shape * (n * 1.55 - q.y * 1.05 + 0.18) * smoothstep(0.0, 0.22, q.y);
  float heat = clamp(density * 1.7, 0.0, 1.0);
  if (heat < 0.03) discard;
  vec3 color = mix(vec3(0.45, 0.03, 0.0), vec3(1.0, 0.28, 0.02), smoothstep(0.03, 0.35, heat));
  color = mix(color, vec3(1.0, 0.62, 0.16), smoothstep(0.35, 0.7, heat));
  color = mix(color, vec3(1.0, 0.9, 0.62), smoothstep(0.75, 1.0, heat));
  gl_FragColor = vec4(color * pow(heat, 1.3) * uBrightness * uIntensity, 1.0);
}
`;

const smokeVertex = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform float uRate;
uniform vec3 uOrigin;
uniform vec3 uWind;
uniform float uRise;
uniform float uSpread;
uniform float uStartSize;
uniform float uEndSize;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
${noiseGlsl}
${billboardGlsl}
void main() {
  vUv = uv;
  vSeed = aSeed;
  float age = fract(uTime * uRate * (0.85 + fxRand(aSeed) * 0.3) + aSeed);
  vAge = age;
  vec3 jitter = vec3(fxRand(aSeed + 1.0) - 0.5, 0.0, fxRand(aSeed + 2.0) - 0.5) * uSpread;
  vec3 centre = uOrigin + jitter * (0.4 + age * 1.6)
    + vec3(0.0, age * uRise, 0.0)
    + uWind * pow(age, 1.5)
    + vec3(sin(uTime * 0.7 + aSeed * 30.0), 0.0, cos(uTime * 0.6 + aSeed * 21.0)) * age * 1.4;
  float size = mix(uStartSize, uEndSize, pow(age, 0.7)) * (0.75 + fxRand(aSeed + 3.0) * 0.5);
  float spin = aSeed * 6.283 + uTime * (fxRand(aSeed + 4.0) - 0.5) * 0.4;
  vec2 corner = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * position.xy;
  vec3 world = centre + (fxCameraRight() * corner.x + fxCameraUp() * corner.y) * size;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const smokeFragment = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uDark;
uniform vec3 uLight;
uniform vec3 uGlow;
uniform float uGlowStrength;
uniform float uAmbient;
varying vec2 vUv;
varying float vAge;
varying float vSeed;
${noiseGlsl}
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float billow = fxFbm(vUv * 2.6 + vec2(vSeed * 13.0, -uTime * 0.08 + vSeed * 5.0));
  float puff = smoothstep(1.0, 0.25, r + (billow - 0.5) * 0.9);
  float fade = smoothstep(0.0, 0.08, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
  float alpha = puff * fade * uOpacity;
  if (alpha < 0.004) discard;
  // Billows are darker in their cores; the underside near the fire carries its orange light.
  float shade = mix(0.55, 1.15, billow) * mix(1.0, 0.75, puff);
  vec3 color = mix(uDark, uLight, smoothstep(0.0, 1.0, vAge)) * shade * uAmbient;
  color += uGlow * pow(1.0 - vAge, 9.0) * uGlowStrength * (0.6 + 0.4 * billow);
  gl_FragColor = vec4(color, alpha);
}
`;

const emberVertex = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform vec3 uOrigin;
uniform vec3 uWind;
uniform float uIntensity;
varying float vLife;
varying vec2 vUv;
${noiseGlsl}
${billboardGlsl}
void main() {
  vUv = uv;
  float age = fract(uTime * (0.22 + fxRand(aSeed) * 0.2) + aSeed);
  vLife = age;
  vec3 start = uOrigin + vec3(fxRand(aSeed + 1.0) - 0.5, 0.0, fxRand(aSeed + 2.0) - 0.5) * vec3(6.0, 0.0, 2.0);
  vec3 drift = vec3(sin(uTime * 2.0 + aSeed * 40.0) * 1.2, age * (9.0 + fxRand(aSeed + 3.0) * 10.0), cos(uTime * 1.7 + aSeed * 33.0) * 1.2) * age;
  vec3 centre = start + drift + uWind * age * age * 0.6;
  float size = 0.09 * (1.0 - age * 0.6) * step(0.05, uIntensity);
  vec3 world = centre + (fxCameraRight() * position.x + fxCameraUp() * position.y) * size;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const emberFragment = /* glsl */ `
uniform float uTime;
varying float vLife;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float core = smoothstep(1.0, 0.0, d);
  float flicker = 0.6 + 0.4 * sin(uTime * 23.0 + vLife * 90.0);
  vec3 color = mix(vec3(1.0, 0.8, 0.35), vec3(1.0, 0.25, 0.02), vLife) * 9.0 * flicker * (1.0 - vLife);
  gl_FragColor = vec4(color * core, 1.0);
}
`;

const waterVertex = /* glsl */ `
attribute float aSeed;
attribute float aStream;
uniform float uTime;
uniform vec3 uStartA;
uniform vec3 uEndA;
uniform vec3 uStartB;
uniform vec3 uEndB;
uniform float uSpray;
varying float vT;
varying vec2 vUv;
${noiseGlsl}
${billboardGlsl}
void main() {
  vUv = uv;
  float t = fract(uTime * 0.9 + aSeed);
  vT = t;
  vec3 a = mix(uStartA, uStartB, aStream);
  vec3 b = mix(uEndA, uEndB, aStream);
  float lift = distance(a.xz, b.xz) * 0.28 + 1.5;
  vec3 centre = mix(a, b, t) + vec3(0.0, sin(t * 3.14159) * lift, 0.0);
  centre += (vec3(fxRand(aSeed + 1.0), fxRand(aSeed + 2.0), fxRand(aSeed + 3.0)) - 0.5) * (0.1 + t * t * 1.6);
  float size = (0.18 + t * 0.55) * step(0.01, uSpray);
  vec3 world = centre + (fxCameraRight() * position.x + fxCameraUp() * position.y) * size;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const waterFragment = /* glsl */ `
uniform float uSpray;
uniform float uAmbient;
varying float vT;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float alpha = smoothstep(1.0, 0.2, d) * (0.75 - vT * 0.45) * uSpray;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vec3(0.82, 0.9, 0.96) * uAmbient, alpha);
}
`;

const glowFragment = /* glsl */ `
uniform float uTime;
uniform float uIntensity;
varying vec2 vUv;
varying float vSeed;
${noiseGlsl}
void main() {
  vec2 p = vUv;
  float frame = smoothstep(0.0, 0.08, p.x) * smoothstep(1.0, 0.92, p.x) * smoothstep(0.0, 0.08, p.y) * smoothstep(1.0, 0.92, p.y);
  float flicker = 0.7 + 0.3 * fxNoise(vec2(uTime * 7.0 + vSeed * 13.0, vSeed));
  float gradient = mix(1.25, 0.6, p.y);
  vec3 color = mix(vec3(0.9, 0.22, 0.02), vec3(1.0, 0.55, 0.15), fxFbm(p * 3.0 + vec2(0.0, -uTime)));
  gl_FragColor = vec4(color * frame * flicker * gradient * uIntensity * 2.0, 1.0);
}
`;

const glowVertex = /* glsl */ `
attribute vec4 aWindow; // xyz centre, w seed
uniform vec3 uNormal;
uniform vec2 uWindowSize;
varying vec2 vUv;
varying float vSeed;
void main() {
  vUv = uv;
  vSeed = aWindow.w;
  vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), uNormal));
  vec3 world = aWindow.xyz + tangent * position.x * uWindowSize.x + vec3(0.0, position.y * uWindowSize.y, 0.0) + uNormal * 0.06;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const scorchVertex = /* glsl */ `
uniform vec3 uCentre;
uniform vec3 uNormal;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), uNormal));
  vec3 world = uCentre + tangent * position.x * uSize.x + vec3(0.0, (position.y + 0.5) * uSize.y, 0.0) + uNormal * 0.04;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}
`;

const scorchFragment = /* glsl */ `
uniform float uAmount;
varying vec2 vUv;
${noiseGlsl}
void main() {
  vec2 p = vUv - vec2(0.5, 0.0);
  float plume = smoothstep(0.5, 0.05, abs(p.x) / mix(0.35, 1.0, vUv.y)) * smoothstep(1.0, 0.25, vUv.y);
  float grain = fxFbm(vUv * vec2(6.0, 9.0));
  float alpha = plume * (0.55 + grain * 0.6) * uAmount;
  gl_FragColor = vec4(vec3(0.03, 0.025, 0.02), clamp(alpha, 0.0, 0.88));
}
`;

export type FireFrame = {
  seconds: number;
  /** World point at the burning facade, roughly mid-storey of the fire floor. */
  origin: THREE.Vector3;
  /** Unit horizontal facade normal pointing out toward the street. */
  normal: THREE.Vector3;
  intensity: number;
  /** 0 → 1 over the incident; scorch grows and stays while cooling. */
  progress: number;
  spraying: boolean;
  nozzle: THREE.Vector3;
  hose: THREE.Vector3;
  night: boolean;
};

const FLAME_COUNT = 16;
const WINDOW_COUNT = 5;
const SMOKE_COUNT = 96;
const STEAM_COUNT = 28;
const EMBER_COUNT = 140;
const WATER_COUNT = 220;

export class CityFireEffect {
  readonly group = new THREE.Group();
  private readonly flames: THREE.Mesh;
  private readonly windows: THREE.Mesh;
  private readonly smoke: THREE.Mesh;
  private readonly steam: THREE.Mesh;
  private readonly embers: THREE.Mesh;
  private readonly water: THREE.Mesh;
  private readonly scorch: THREE.Mesh;
  readonly light = new THREE.PointLight("#ff7a2e", 0, 70, 1.7);
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly time = { value: 0 };
  private readonly intensity = { value: 0 };
  private readonly flameData: Float32Array;
  private readonly windowData: Float32Array;
  private layoutKey = "";

  constructor() {
    this.group.name = "Events · GPU fire";
    const quad = new THREE.PlaneGeometry(1, 1);
    const flameQuad = new THREE.PlaneGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
    this.geometries.push(quad, flameQuad);

    // Flames: instanced sheets sharing one quad.
    const flameGeometry = new THREE.InstancedBufferGeometry().copy(flameQuad as unknown as THREE.InstancedBufferGeometry);
    this.flameData = new Float32Array(FLAME_COUNT * 4);
    const sizes = new Float32Array(FLAME_COUNT * 2);
    flameGeometry.setAttribute("aFlame", new THREE.InstancedBufferAttribute(this.flameData, 4));
    flameGeometry.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 2));
    flameGeometry.instanceCount = FLAME_COUNT;
    this.flames = this.mesh("Fire flames", flameGeometry, this.material(flameVertex, flameFragment, {
      uBrightness: { value: 2.6 },
    }, THREE.AdditiveBlending), 6);

    const windowGeometry = new THREE.InstancedBufferGeometry().copy(quad as unknown as THREE.InstancedBufferGeometry);
    this.windowData = new Float32Array(WINDOW_COUNT * 4);
    windowGeometry.setAttribute("aWindow", new THREE.InstancedBufferAttribute(this.windowData, 4));
    windowGeometry.instanceCount = WINDOW_COUNT;
    this.windows = this.mesh("Fire window glow", windowGeometry, this.material(glowVertex, glowFragment, {
      uNormal: { value: new THREE.Vector3(0, 0, 1) },
      uWindowSize: { value: new THREE.Vector2(2.2, 2.0) },
    }, THREE.AdditiveBlending), 4);

    this.smoke = this.mesh("Fire smoke column", this.seeded(quad, SMOKE_COUNT), this.material(smokeVertex, smokeFragment, {
      uRate: { value: 0.07 },
      uOrigin: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector3(9, 4, -3) },
      uRise: { value: 34 },
      uSpread: { value: 6 },
      uStartSize: { value: 4 },
      uEndSize: { value: 22 },
      uOpacity: { value: 0 },
      uDark: { value: new THREE.Color("#141312") },
      uLight: { value: new THREE.Color("#4c4945") },
      uGlow: { value: new THREE.Color("#ff6a1c") },
      uGlowStrength: { value: 2.2 },
      uAmbient: { value: 1 },
    }, THREE.NormalBlending), 5);

    this.steam = this.mesh("Fire steam", this.seeded(quad, STEAM_COUNT), this.material(smokeVertex, smokeFragment, {
      uRate: { value: 0.16 },
      uOrigin: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector3(5, 2, -2) },
      uRise: { value: 14 },
      uSpread: { value: 5 },
      uStartSize: { value: 2 },
      uEndSize: { value: 9 },
      uOpacity: { value: 0 },
      uDark: { value: new THREE.Color("#c9cdd0") },
      uLight: { value: new THREE.Color("#eef1f3") },
      uGlow: { value: new THREE.Color("#ff9a50") },
      uGlowStrength: { value: 0.4 },
      uAmbient: { value: 1 },
    }, THREE.NormalBlending), 5);

    this.embers = this.mesh("Fire embers", this.seeded(quad, EMBER_COUNT), this.material(emberVertex, emberFragment, {
      uOrigin: { value: new THREE.Vector3() },
      uWind: { value: new THREE.Vector3(9, 4, -3) },
    }, THREE.AdditiveBlending), 7);

    const waterGeometry = this.seeded(quad, WATER_COUNT);
    const streams = new Float32Array(WATER_COUNT);
    for (let i = 0; i < WATER_COUNT; i++) streams[i] = i < WATER_COUNT * 0.62 ? 0 : 1;
    waterGeometry.setAttribute("aStream", new THREE.InstancedBufferAttribute(streams, 1));
    this.water = this.mesh("Fire hose water", waterGeometry, this.material(waterVertex, waterFragment, {
      uStartA: { value: new THREE.Vector3() },
      uEndA: { value: new THREE.Vector3() },
      uStartB: { value: new THREE.Vector3() },
      uEndB: { value: new THREE.Vector3() },
      uSpray: { value: 0 },
      uAmbient: { value: 1 },
    }, THREE.NormalBlending), 5);

    this.scorch = this.mesh("Fire facade scorch", quad, this.material(scorchVertex, scorchFragment, {
      uCentre: { value: new THREE.Vector3() },
      uNormal: { value: new THREE.Vector3(0, 0, 1) },
      uSize: { value: new THREE.Vector2(9, 14) },
      uAmount: { value: 0 },
    }, THREE.NormalBlending), 3);

    this.light.castShadow = false;
    this.group.add(this.light);
  }

  update(frame: FireFrame): void {
    const burning = frame.intensity > 0.01;
    const smoking = frame.progress < 0.97 && (burning || frame.progress > 0.1);
    this.time.value = frame.seconds;
    this.intensity.value = frame.intensity;
    this.layout(frame);

    const ambient = frame.night ? 0.35 : 1;
    const smoke = this.smoke.material as THREE.ShaderMaterial;
    smoke.uniforms.uOrigin.value.copy(frame.origin).addScaledVector(frame.normal, 1.2).add(new THREE.Vector3(0, 2.5, 0));
    smoke.uniforms.uOpacity.value = smoking ? Math.max(0.25, frame.intensity) : 0;
    smoke.uniforms.uAmbient.value = ambient;
    smoke.uniforms.uGlowStrength.value = frame.intensity * (frame.night ? 1.0 : 0.25);
    const steam = this.steam.material as THREE.ShaderMaterial;
    steam.uniforms.uOrigin.value.copy(frame.origin).addScaledVector(frame.normal, 1.6);
    steam.uniforms.uOpacity.value = frame.spraying ? 0.5 : 0;
    steam.uniforms.uAmbient.value = frame.night ? 0.3 : 1;
    const embers = this.embers.material as THREE.ShaderMaterial;
    embers.uniforms.uOrigin.value.copy(frame.origin).addScaledVector(frame.normal, 0.8);
    const water = this.water.material as THREE.ShaderMaterial;
    water.uniforms.uSpray.value = frame.spraying ? 1 : 0;
    water.uniforms.uStartA.value.copy(frame.nozzle);
    water.uniforms.uEndA.value.copy(frame.origin).addScaledVector(frame.normal, 0.4);
    water.uniforms.uStartB.value.copy(frame.hose);
    water.uniforms.uEndB.value.copy(frame.origin).addScaledVector(frame.normal, 0.4).add(new THREE.Vector3(1.5, -2.5, 0));
    water.uniforms.uAmbient.value = frame.night ? 0.4 : 1.1;
    const scorch = this.scorch.material as THREE.ShaderMaterial;
    scorch.uniforms.uAmount.value = THREE.MathUtils.smoothstep(frame.progress, 0.02, 0.4);

    this.flames.visible = burning;
    this.windows.visible = burning;
    this.embers.visible = burning;
    this.smoke.visible = smoking;
    this.steam.visible = frame.spraying;
    this.water.visible = frame.spraying;
    this.scorch.visible = frame.progress > 0.02;

    const flicker = 0.78 + 0.14 * Math.sin(frame.seconds * 17.3) + 0.08 * Math.sin(frame.seconds * 41.7 + 1.3);
    this.light.intensity = burning ? frame.intensity * flicker * (frame.night ? 2200 : 600) : 0;
    this.light.position.copy(frame.origin).addScaledVector(frame.normal, 4).add(new THREE.Vector3(0, 1.5, 0));
  }

  /** Hand GPU resources to the city's shared registries so the normal teardown frees them. */
  register(materials: Set<THREE.Material>, geometries: Set<THREE.BufferGeometry>): void {
    this.materials.forEach((material) => materials.add(material));
    this.geometries.forEach((geometry) => geometries.add(geometry));
  }

  dispose(): void {
    this.materials.forEach((material) => material.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
    this.group.clear();
  }

  /** Place burning windows and flame sheets along the facade; only recomputed when the site changes. */
  private layout(frame: FireFrame): void {
    const key = `${frame.origin.x.toFixed(1)}:${frame.origin.y.toFixed(1)}:${frame.origin.z.toFixed(1)}:${frame.normal.x.toFixed(2)}:${frame.normal.z.toFixed(2)}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const tangent = new THREE.Vector3(0, 1, 0).cross(frame.normal).normalize();
    // Two floors burning: three windows on the fire floor, two on the floor above.
    const windows: [number, number][] = [[-3.2, 0], [0, 0], [3.2, 0], [-1.6, 3.3], [1.6, 3.3]];
    windows.forEach(([along, up], index) => {
      const point = frame.origin.clone().addScaledVector(tangent, along).add(new THREE.Vector3(0, up - 1, 0));
      this.windowData.set([point.x, point.y, point.z, index * 1.37 + 0.2], index * 4);
    });
    (this.windows.geometry.getAttribute("aWindow") as THREE.BufferAttribute).needsUpdate = true;
    const sizes = this.flames.geometry.getAttribute("aSize") as THREE.BufferAttribute;
    for (let i = 0; i < FLAME_COUNT; i++) {
      const [along, up] = windows[i % windows.length];
      const layer = Math.floor(i / windows.length);
      const jitter = [0, 0.8, -0.8, 0.3][layer] ?? 0;
      const base = frame.origin.clone().addScaledVector(tangent, along + jitter).add(new THREE.Vector3(0, up - 2.2, 0)).addScaledVector(frame.normal, 0.25 + layer * 0.35);
      this.flameData.set([base.x, base.y, base.z, i * 0.731 + 0.11], i * 4);
      const upper = up > 0;
      sizes.setXY(i, [3.6, 2.6, 2.6, 2.0][layer] ?? 2.4, (upper ? 8.5 : 7.2) * ([1, 0.8, 0.75, 0.6][layer] ?? 0.6));
    }
    (this.flames.geometry.getAttribute("aFlame") as THREE.BufferAttribute).needsUpdate = true;
    sizes.needsUpdate = true;
    const glow = this.windows.material as THREE.ShaderMaterial;
    glow.uniforms.uNormal.value.copy(frame.normal);
    const scorch = this.scorch.material as THREE.ShaderMaterial;
    scorch.uniforms.uCentre.value.copy(frame.origin).add(new THREE.Vector3(0, 1.2, 0));
    scorch.uniforms.uNormal.value.copy(frame.normal);
  }

  private seeded(quad: THREE.BufferGeometry, count: number): THREE.InstancedBufferGeometry {
    const geometry = new THREE.InstancedBufferGeometry().copy(quad as unknown as THREE.InstancedBufferGeometry);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) seeds[i] = (i * 0.61803398875) % 1;
    geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.instanceCount = count;
    this.geometries.push(geometry);
    return geometry;
  }

  private material(vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending): THREE.ShaderMaterial {
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: { uTime: this.time, uIntensity: this.intensity, ...uniforms },
      transparent: true,
      depthWrite: false,
      blending,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    this.materials.push(material);
    return material;
  }

  private mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.ShaderMaterial, order: number): THREE.Mesh {
    if (!this.geometries.includes(geometry)) this.geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    mesh.visible = false;
    this.group.add(mesh);
    return mesh;
  }
}
