import * as THREE from "three";

/**
 * Lit interiors behind every glazed facade at night.
 * Windows are generated in world space (3.3 m storeys, 1.8 m bays) so towers of any size share one
 * believable rhythm; each bay picks its own warmth and occupancy from a hash, and the lit share drifts
 * slowly so the skyline never looks like a uniform grid.
 */
const nightWindowFunctions = /* glsl */ `
uniform float cityNightWindows;
uniform float cityNightTime;
varying vec3 vNightWorldPosition;
varying vec3 vNightWorldNormal;
varying vec3 vNightObjectOrigin;
float nightHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
vec3 cityWindowGlow() {
  if (cityNightWindows <= 0.001) return vec3(0.0);
  vec3 n = normalize(vNightWorldNormal);
  if (abs(n.y) > 0.35 || vNightWorldPosition.y < 2.6) return vec3(0.0);
  vec2 tangent = normalize(vec2(-n.z, n.x) + 1e-5);
  float along = dot(vNightWorldPosition.xz, tangent);
  float storey = vNightWorldPosition.y / 3.3;
  float bay = along / 1.8;
  // Room identity comes from the object origin and the facade orientation, never from the
  // fragment's depth along the normal: a facade lying exactly on a cell boundary used to flip
  // rooms per pixel and turn lit panes into salt-and-pepper noise.
  float face = mod(floor(atan(n.z, n.x) * 0.6366 + 0.31), 4.0);
  vec3 cell = vec3(floor(bay), floor(storey), face + floor(vNightObjectOrigin.x * 0.37) * 7.0 + floor(vNightObjectOrigin.z * 0.29) * 13.0);
  float seed = nightHash(cell + 17.0);
  // About half the rooms are occupied; a slow per-room phase lets lights switch over the evening.
  float occupied = step(0.46 + 0.08 * sin(cityNightTime * 0.02 + seed * 40.0), nightHash(cell + 3.0));
  vec2 inRoom = vec2(fract(bay), fract(storey));
  // Anti-aliased pane mask; the frame fades to its average once a room is only a few pixels.
  vec2 span = max(fwidth(vec2(bay, storey)), vec2(1e-4));
  vec2 lo = vec2(0.07, 0.16), hi = vec2(0.93, 0.9);
  vec2 inside = smoothstep(lo - span, lo + span, inRoom) * (1.0 - smoothstep(hi - span, hi + span, inRoom));
  float far = smoothstep(0.18, 0.45, max(span.x, span.y));
  float frame = mix(inside.x * inside.y, (hi.x - lo.x) * (hi.y - lo.y), far);
  vec3 warm = mix(vec3(1.0, 0.68, 0.38), vec3(1.0, 0.86, 0.66), nightHash(cell + 9.0));
  vec3 cool = vec3(0.7, 0.82, 1.0);
  float tvRoom = step(0.9, nightHash(cell + 21.0));
  vec3 tint = mix(warm, cool, step(0.8, seed));
  // Flickering blue TV light in a few rooms.
  tint = mix(tint, vec3(0.45, 0.6, 1.0) * (0.75 + 0.25 * sin(cityNightTime * 7.0 + seed * 30.0)), tvRoom * 0.7);
  // Curtains: a drawn fabric panel glows dimmer and warmer, with a soft gap where they meet.
  float curtainKind = nightHash(cell + 31.0);
  float gapCentre = 0.3 + 0.4 * nightHash(cell + 41.0);
  float gap = smoothstep(0.03 + span.x, 0.0, abs(inRoom.x - gapCentre) - 0.06);
  float curtain = step(0.55, curtainKind) * (1.0 - gap) * (1.0 - far);
  vec3 fabric = mix(vec3(1.0, 0.62, 0.32), vec3(0.95, 0.8, 0.6), nightHash(cell + 51.0)) * 0.45;
  tint = mix(tint, fabric, curtain);
  // Ceiling-lit rooms are brighter near the top of the window.
  float falloff = mix(0.65, 1.0, inRoom.y * (1.0 - far) + far * 0.5);
  float brightness = mix(1.4 + seed * 1.6, 2.2, far * 0.5);
  return tint * occupied * frame * falloff * brightness * cityNightWindows;
}
`;

export class CityNightWindows {
  readonly uniforms = {
    cityNightWindows: { value: 0 },
    cityNightTime: { value: 0 },
  };
  private readonly materials = new Set<THREE.MeshStandardMaterial>();

  constructor(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const list = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of list) {
        if (!(material instanceof THREE.MeshStandardMaterial) || this.materials.has(material)) continue;
        if (CityNightWindows.isFacadeGlass(material)) this.attach(material);
      }
    });
  }

  static isFacadeGlass(material: THREE.MeshStandardMaterial): boolean {
    if (/water|puddle|foam|wave|ice|liquid|vehicle|car|windshield/i.test(material.name)) return false;
    // Facades that already paint their own lit rooms keep them.
    if (material.emissiveMap) return false;
    if (material.userData.cityGlazing === true) return true;
    const physical = material as THREE.MeshPhysicalMaterial;
    return Boolean(physical.isMeshPhysicalMaterial && physical.ior > 1.4 && physical.ior < 1.65 && physical.roughness < 0.3);
  }

  get count(): number {
    return this.materials.size;
  }

  update(night: boolean, seconds: number): void {
    this.uniforms.cityNightWindows.value = night ? 1 : 0;
    this.uniforms.cityNightTime.value = seconds;
  }

  private attach(material: THREE.MeshStandardMaterial): void {
    this.materials.add(material);
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>
          varying vec3 vNightWorldPosition;
          varying vec3 vNightWorldNormal;
          varying vec3 vNightObjectOrigin;`)
        .replace("#include <project_vertex>", `
          mat4 nightTransform = modelMatrix;
          #ifdef USE_INSTANCING
            nightTransform *= instanceMatrix;
          #endif
          #ifdef USE_BATCHING
            nightTransform *= batchingMatrix;
          #endif
          vNightWorldPosition = (nightTransform * vec4(transformed, 1.0)).xyz;
          vNightWorldNormal = normalize(mat3(nightTransform) * objectNormal);
          vNightObjectOrigin = nightTransform[3].xyz;
          #include <project_vertex>`);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${nightWindowFunctions}`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          vec3 cityWindow = cityWindowGlow();
          totalEmissiveRadiance += cityWindow;
          // A lit room reads through the glass instead of being washed out by transparency.
          diffuseColor.a = mix(diffuseColor.a, 1.0, clamp(dot(cityWindow, vec3(0.33)) * 0.8, 0.0, 0.85));`);
    };
    material.customProgramCacheKey = () => `${key}:night-windows-v2`;
    material.needsUpdate = true;
  }
}
