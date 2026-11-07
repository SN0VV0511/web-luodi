import * as THREE from "three";
import { CITY_DAY_SECONDS, CITY_DAY_START_HOUR } from "../../city-physics";

const interiorFunctions = /* glsl */ `
uniform float cityInteriorHour;
uniform float cityInteriorNight;
uniform float cityInteriorDay;

float interiorHash(vec2 cell) {
  vec3 p = fract(vec3(cell.xyx) * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}

float interiorRectangle(vec2 point, vec2 low, vec2 high) {
  vec2 pixel = max(fwidth(point), vec2(0.0001));
  vec2 a = smoothstep(low - pixel, low + pixel, point);
  vec2 b = 1.0 - smoothstep(high - pixel, high + pixel, point);
  return a.x * a.y * b.x * b.y;
}

float interiorLine(float coordinate, float center, float width) {
  float pixel = max(fwidth(coordinate), 0.0001);
  return 1.0 - smoothstep(width - pixel, width + pixel, abs(coordinate - center));
}

float interiorBoxDistance(vec3 point, vec3 direction, vec3 extent) {
  vec3 safeDirection = sign(direction) * max(abs(direction), vec3(0.00001));
  safeDirection.x = abs(direction.x) < 0.00001 ? 0.00001 : safeDirection.x;
  safeDirection.y = abs(direction.y) < 0.00001 ? 0.00001 : safeDirection.y;
  vec3 low = -point / safeDirection;
  vec3 high = (extent - point) / safeDirection;
  vec3 farDistance = max(low, high);
  return max(0.0, min(farDistance.x, min(farDistance.y, farDistance.z)));
}

vec3 interiorWallColor(vec3 hit, vec3 extent, float roomSeed) {
  vec3 plaster = mix(vec3(0.28, 0.26, 0.22), vec3(0.36, 0.38, 0.34), roomSeed);
  float ceiling = step(extent.y - 0.001, hit.y);
  float floor = 1.0 - step(0.001, hit.y);
  vec3 floorColor = mix(vec3(0.16, 0.105, 0.055), vec3(0.12, 0.15, 0.16), step(0.6, roomSeed));
  float plank = interiorLine(fract(hit.x * 9.0 + floor(hit.z * 4.0) * 0.5), 0.5, 0.015);
  floorColor *= 1.0 - plank * 0.2;
  vec3 result = mix(plaster, floorColor, floor);
  result = mix(result, vec3(0.42, 0.405, 0.37), ceiling);
  float sideDistance = min(hit.x, extent.x - hit.x);
  float cornerDistance = min(sideDistance, min(hit.y, extent.y - hit.y));
  float cornerShadow = smoothstep(0.0, 0.16, cornerDistance);
  result *= 0.7 + 0.3 * cornerShadow;
  return result;
}

vec3 interiorBackWall(vec2 point, float roomSeed, float occupied) {
  vec3 result = vec3(0.34, 0.32, 0.28);
  float frame = interiorRectangle(point, vec2(0.1, 0.46), vec2(0.36, 0.78));
  float picture = interiorRectangle(point, vec2(0.12, 0.48), vec2(0.34, 0.76));
  result = mix(result, vec3(0.07, 0.055, 0.045), frame);
  vec3 art = mix(vec3(0.12, 0.23, 0.27), vec3(0.34, 0.18, 0.1), roomSeed);
  art *= 0.7 + 0.3 * sin(point.y * 23.0 + point.x * 7.0);
  result = mix(result, art, picture);
  float shelves = interiorRectangle(point, vec2(0.62, 0.08), vec2(0.91, 0.84));
  float openings = interiorRectangle(point, vec2(0.64, 0.1), vec2(0.89, 0.82));
  float horizontal = interiorLine(fract(point.y * 5.0), 0.0, 0.035);
  result = mix(result, vec3(0.18, 0.11, 0.055), shelves);
  result = mix(result, vec3(0.06, 0.05, 0.04), openings * (1.0 - horizontal));
  float book = step(0.2, fract(point.x * 39.0)) * step(0.22, fract(point.y * 5.0));
  vec3 bookColor = mix(vec3(0.24, 0.07, 0.035), vec3(0.05, 0.15, 0.21),
    interiorHash(vec2(floor(point.x * 39.0), floor(point.y * 5.0))));
  result = mix(result, bookColor, openings * book * (1.0 - horizontal));
  float screenFrame = interiorRectangle(point, vec2(0.38, 0.27), vec2(0.59, 0.46));
  float screen = interiorRectangle(point, vec2(0.392, 0.285), vec2(0.578, 0.447));
  result = mix(result, vec3(0.025), screenFrame);
  float screenText = step(0.55, fract(point.y * 64.0))
    * interiorRectangle(point, vec2(0.4, 0.3), vec2(0.54, 0.43));
  vec3 displayColor = vec3(0.05, 0.15, 0.22) + screenText * vec3(0.12, 0.17, 0.18);
  result = mix(result, displayColor, screen * occupied);
  float desktop = interiorRectangle(point, vec2(0.28, 0.22), vec2(0.64, 0.25));
  float deskLegs = interiorLine(point.x, 0.32, 0.009) + interiorLine(point.x, 0.6, 0.009);
  deskLegs *= 1.0 - smoothstep(0.2, 0.23, point.y);
  result = mix(result, vec3(0.12, 0.08, 0.045), max(desktop, clamp(deskLegs, 0.0, 1.0)));
  float door = interiorRectangle(point, vec2(0.015, 0.04), vec2(0.17, 0.64));
  result = mix(result, vec3(0.2, 0.16, 0.11), door * step(0.7, roomSeed));
  return result;
}

vec3 interiorPlant(vec3 color, vec2 point, float seed) {
  vec2 center = vec2(0.2 + seed * 0.3, 0.19);
  vec2 p = point - center;
  float pot = interiorRectangle(point, center + vec2(-0.045, -0.11), center + vec2(0.045, -0.02));
  color = mix(color, vec3(0.26, 0.16, 0.105), pot);
  float stem = interiorLine(p.x, 0.0, 0.004) * step(-0.02, p.y) * step(p.y, 0.22);
  color = mix(color, vec3(0.07, 0.095, 0.035), stem);
  for (int leaf = 0; leaf < 4; leaf++) {
    float height = 0.035 + float(leaf) * 0.045;
    float side = mod(float(leaf), 2.0) * 2.0 - 1.0;
    vec2 leafPoint = p - vec2(side * 0.026, height);
    float distance = length(leafPoint * vec2(20.0, 45.0));
    float edge = max(fwidth(distance), 0.01);
    float mask = 1.0 - smoothstep(0.9 - edge, 0.9 + edge, distance);
    color = mix(color, vec3(0.055, 0.14, 0.045), mask);
  }
  return color;
}

vec4 interiorRadiance(vec2 mappedUv, vec3 worldPosition, vec3 worldNormal) {
  vec2 cells = mappedUv * vec2(8.0, 16.0);
  vec2 window = fract(cells);
  vec2 room = floor(cells) + floor(worldPosition.xz * 0.02) * 79.0;
  float pixelSpan = max(length(dFdx(cells)), length(dFdy(cells)));
  float resolution = 1.0 - smoothstep(0.1, 0.55, pixelSpan);
  float wall = 1.0 - smoothstep(0.15, 0.6, abs(worldNormal.y));
  float opening = interiorRectangle(window, vec2(0.065, 0.07), vec2(0.935, 0.81));
  float mask = opening * wall * resolution;
  if (mask < 0.001) return vec4(0.0);
  float seed = interiorHash(room);
  float start = 7.3 + seed * 2.2;
  float end = 16.8 + interiorHash(room + 19.0) * 3.4;
  float weekday = 1.0 - step(5.5, mod(cityInteriorDay + 1.0, 7.0));
  float occupied = smoothstep(start - 0.4, start + 0.2, cityInteriorHour)
    * (1.0 - smoothstep(end - 0.2, end + 0.5, cityInteriorHour));
  occupied *= mix(0.18, 1.0, weekday);
  occupied = max(occupied, cityInteriorNight * step(0.67, seed));
  vec3 n = normalize(worldNormal);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), n));
  vec3 up = normalize(cross(n, right));
  vec3 incident = normalize(worldPosition - cameraPosition);
  vec3 ray = vec3(dot(incident, right) / 3.0, dot(incident, up) / 3.2,
    max(0.03, -dot(incident, n)) / 3.5);
  vec3 origin = vec3(clamp((window - vec2(0.065, 0.07)) / vec2(0.87, 0.74),
    vec2(0.001), vec2(0.999)), 0.001);
  vec3 extent = vec3(1.0, 1.0, 0.7 + seed * 0.6);
  float distance = interiorBoxDistance(origin, ray, extent);
  vec3 hit = clamp(origin + ray * distance, vec3(0.0), extent);
  vec3 color = interiorWallColor(hit, extent, seed);
  float back = step(extent.z - 0.002, hit.z);
  color = mix(color, interiorBackWall(hit.xy, seed, occupied), back);
  color = mix(color, interiorPlant(color, hit.xy, seed), back * step(0.35, seed));
  float ceilingLamp = interiorRectangle(hit.xz / extent.xz,
    vec2(0.25, 0.24), vec2(0.75, 0.45)) * step(0.998, hit.y);
  color += ceilingLamp * occupied * vec3(0.6, 0.5, 0.34);
  float blindAmount = interiorHash(room + 37.0) * 0.65;
  float blinds = smoothstep(1.0 - blindAmount - 0.025, 1.0 - blindAmount, origin.y);
  float slats = 0.84 + 0.16 * cos(origin.y * 170.0);
  float slatVisible = 1.0 - smoothstep(1.0, 6.0, fwidth(origin.y * 170.0));
  slats = mix(0.84, slats, slatVisible);
  vec3 blindColor = vec3(0.35, 0.33, 0.27) * slats;
  color = mix(color, blindColor, blinds * 0.88);
  vec3 ambient = mix(vec3(0.34, 0.39, 0.44), vec3(0.035, 0.05, 0.075), cityInteriorNight);
  vec3 lamp = vec3(0.72, 0.53, 0.3) * occupied * mix(0.28, 0.95, cityInteriorNight);
  color *= ambient + lamp;
  float fresnel = pow(1.0 - max(0.0, -dot(incident, n)), 5.0);
  mask *= (1.0 - fresnel) * 0.72;
  return vec4(color, mask);
}
`;

export class CityFacadeInteriors {
  private readonly uniforms = {
    cityInteriorHour: { value: 7 + 35 / 60 },
    cityInteriorNight: { value: 0 },
    cityInteriorDay: { value: 0 },
  };
  private readonly attached = new WeakSet<THREE.Material>();

  attach(material: THREE.MeshStandardMaterial): void {
    if (this.attached.has(material)) return;
    this.attached.add(material);
    const previous = material.onBeforeCompile;
    const key = material.customProgramCacheKey();
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer);
      Object.assign(shader.uniforms, this.uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${interiorFunctions}`)
        .replace("#include <lights_physical_fragment>", `
          vec4 cityInterior = interiorRadiance(vMapUv, vPbrWorldPos, vPbrWorldNormal);
          diffuseColor.rgb *= 1.0 - cityInterior.a * 0.25;
          totalEmissiveRadiance = mix(totalEmissiveRadiance,
            cityInterior.rgb, cityInterior.a);
          #include <lights_physical_fragment>`);
    };
    material.customProgramCacheKey = () => `${key}:city-parallax-rooms-v1`;
    material.needsUpdate = true;
  }

  update(seconds: number, night: boolean): void {
    const absoluteHour = CITY_DAY_START_HOUR + seconds / CITY_DAY_SECONDS * 24;
    this.uniforms.cityInteriorHour.value = ((absoluteHour % 24) + 24) % 24;
    this.uniforms.cityInteriorDay.value = Math.floor(absoluteHour / 24);
    this.uniforms.cityInteriorNight.value = night ? 1 : 0;
  }
}
