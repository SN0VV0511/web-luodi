import * as THREE from "three";
import { bindWorldScalePbr, buildPbrMapsFromField } from "../../city-pbr";
import type { ArchitectureContext } from "./context";

type SurfaceSample = { height: number; roughness: number; color: THREE.Color };

function hash(x: number, y: number, salt: number): number {
  let value = Math.imul(x + salt, 1597334677) ^ Math.imul(y - salt, 3812015801);
  value = Math.imul(value ^ (value >>> 16), 2246822507);
  return ((value ^ (value >>> 13)) >>> 0) / 4294967295;
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function noise(u: number, v: number, frequency: number, seed: number): number {
  const x = u * frequency;
  const y = v * frequency;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(wrap(ix, frequency), wrap(iy, frequency), seed);
  const b = hash(wrap(ix + 1, frequency), wrap(iy, frequency), seed);
  const c = hash(wrap(ix, frequency), wrap(iy + 1, frequency), seed);
  const d = hash(wrap(ix + 1, frequency), wrap(iy + 1, frequency), seed);
  return THREE.MathUtils.lerp(THREE.MathUtils.lerp(a, b, sx), THREE.MathUtils.lerp(c, d, sx), sy);
}

function makeSurface(context: ArchitectureContext, name: string, meters: number, sample: (u: number, v: number) => SurfaceSample): THREE.MeshStandardMaterial {
  const size = 128;
  const albedo = new Uint8Array(size * size * 4);
  const values: SurfaceSample[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = sample(x / size, y / size);
      values.push(value);
      const offset = (y * size + x) * 4;
      albedo[offset] = Math.round(THREE.MathUtils.clamp(value.color.r, 0, 1) * 255);
      albedo[offset + 1] = Math.round(THREE.MathUtils.clamp(value.color.g, 0, 1) * 255);
      albedo[offset + 2] = Math.round(THREE.MathUtils.clamp(value.color.b, 0, 1) * 255);
      albedo[offset + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(albedo, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.LinearSRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  const maps = buildPbrMapsFromField(size, size, 0.85, (u, v) => values[Math.min(size - 1, Math.floor(v * size)) * size + Math.min(size - 1, Math.floor(u * size))]);
  const material = context.material({ color: "#ffffff", map, roughness: 1, metalness: 0 });
  material.name = name;
  bindWorldScalePbr(material, maps, meters, meters, 0.4);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", "#ifdef USE_MAP\n diffuseColor *= texture2D(map, cityWorldUv(vPbrWorldPos, vPbrWorldNormal));\n#endif");
  };
  material.customProgramCacheKey = () => `${previousKey}:architectural-albedo:${name}`;
  return material;
}

export function createTimberFloor(context: ArchitectureContext): THREE.MeshStandardMaterial {
  const heartwood = new THREE.Color("#8f6843");
  const sapwood = new THREE.Color("#bd9d6f");
  const seamColor = new THREE.Color("#534638");
  return makeSurface(context, "Quarter-sawn oak flooring", 2.4, (u, v) => {
    const plank = Math.floor(u * 8);
    const x = (u * 8) % 1;
    const offset = hash(plank, 0, 41) * 0.7;
    const y = (v * 2 + offset) % 1;
    const seam = x < 0.018 || x > 0.982 || y < 0.008 || y > 0.992;
    const curl = noise(u, v, 8, 13) * 0.4;
    const grain = 0.5 + 0.5 * Math.sin((u * 82 + curl + Math.sin(v * Math.PI * 2) * 0.12) * Math.PI * 2);
    const fine = noise(u, v, 64, 14);
    const color = heartwood.clone().lerp(sapwood, grain * 0.55 + hash(plank, 1, 42) * 0.25);
    color.multiplyScalar(0.93 + fine * 0.14);
    return { height: seam ? 0.1 : 0.55 + grain * 0.08, roughness: seam ? 0.95 : 0.5 + fine * 0.15, color: seam ? seamColor : color };
  });
}

export function createTerrazzo(context: ArchitectureContext): THREE.MeshStandardMaterial {
  const base = new THREE.Color("#b7b2a4");
  const limestone = new THREE.Color("#e8e0d0");
  const basalt = new THREE.Color("#575b59");
  const clay = new THREE.Color("#b27f66");
  return makeSurface(context, "Ground limestone terrazzo", 1.5, (u, v) => {
    const x = Math.floor(u * 26);
    const y = Math.floor(v * 26);
    const px = (u * 26) % 1;
    const py = (v * 26) % 1;
    const centerX = 0.2 + hash(x, y, 1) * 0.6;
    const centerY = 0.2 + hash(x, y, 2) * 0.6;
    const radius = 0.16 + hash(x, y, 3) * 0.22;
    const chip = Math.abs(px - centerX) * (0.8 + hash(x, y, 4)) + Math.abs(py - centerY) < radius;
    const aggregate = hash(x, y, 5);
    const color = chip ? aggregate < 0.5 ? limestone : aggregate < 0.8 ? basalt : clay : base;
    const micro = noise(u, v, 64, 9);
    return { height: 0.5 + micro * 0.015, roughness: chip ? 0.3 : 0.48 + micro * 0.1, color: color.clone().multiplyScalar(0.96 + micro * 0.08) };
  });
}

export function createCeramicTile(context: ArchitectureContext, dark = false): THREE.MeshStandardMaterial {
  const base = new THREE.Color(dark ? "#526263" : "#d4d2c5");
  const grout = new THREE.Color(dark ? "#2f3c3c" : "#938f82");
  return makeSurface(context, dark ? "Glazed teal ceramic" : "Matte porcelain tile", 1.2, (u, v) => {
    const x = (u * 4) % 1;
    const y = (v * 4) % 1;
    const border = Math.min(x, y, 1 - x, 1 - y);
    const isGrout = border < 0.016;
    const bevel = THREE.MathUtils.smoothstep(border, 0.016, 0.05);
    const pigment = noise(u, v, 16, 31);
    const tile = hash(Math.floor(u * 4), Math.floor(v * 4), 32);
    return {
      height: isGrout ? 0.15 : 0.4 + bevel * 0.12,
      roughness: isGrout ? 0.95 : dark ? 0.2 + pigment * 0.08 : 0.58 + pigment * 0.12,
      color: isGrout ? grout : base.clone().multiplyScalar(0.88 + tile * 0.18 + pigment * 0.04),
    };
  });
}

export function createBoardFormConcrete(context: ArchitectureContext): THREE.MeshStandardMaterial {
  const cement = new THREE.Color("#a7a79c");
  return makeSurface(context, "Timber-formed concrete", 2, (u, v) => {
    const course = Math.floor(v * 10);
    const seam = (v * 10) % 1 < 0.018;
    const fibers = noise(u, v, 32, 77);
    const plank = hash(course, 0, 91);
    const pore = hash(Math.floor(u * 128), Math.floor(v * 128), 92);
    const tieX = Math.abs((u * 2) % 1 - 0.5);
    const tieY = Math.abs((v * 4) % 1 - 0.5);
    const tie = tieX * tieX + tieY * tieY < 0.0007;
    return { height: tie ? 0.06 : seam ? 0.18 : 0.52 + fibers * 0.08 - (pore > 0.97 ? 0.08 : 0), roughness: 0.82 + fibers * 0.14, color: cement.clone().multiplyScalar(tie ? 0.5 : 0.88 + plank * 0.16 + fibers * 0.08) };
  });
}

export function createWovenUpholstery(context: ArchitectureContext): THREE.MeshStandardMaterial {
  const base = new THREE.Color("#667468");
  return makeSurface(context, "Woven wool upholstery", 0.18, (u, v) => {
    const warp = Math.sin(u * Math.PI * 64);
    const weft = Math.sin(v * Math.PI * 64);
    const crossing = (Math.floor(u * 32) + Math.floor(v * 32)) % 2;
    const height = crossing ? warp * 0.06 : weft * 0.06;
    const fuzz = noise(u, v, 64, 193);
    return { height: 0.5 + height + fuzz * 0.025, roughness: 0.94 + fuzz * 0.05, color: base.clone().multiplyScalar(0.9 + (warp + weft) * 0.04 + fuzz * 0.08) };
  });
}

export function createRoofMembrane(context: ArchitectureContext): THREE.MeshStandardMaterial {
  const base = new THREE.Color("#707774");
  return makeSurface(context, "Mineral roof membrane", 3, (u, v) => {
    const seam = (u * 3) % 1 < 0.028;
    const grit = noise(u, v, 64, 201);
    const weather = noise(u, v, 8, 202);
    return { height: (seam ? 0.68 : 0.5) + grit * 0.09, roughness: 0.84 + grit * 0.14, color: base.clone().multiplyScalar((seam ? 0.83 : 0.92) + grit * 0.08 + weather * 0.12) };
  });
}

export function createRibbedMetal(context: ArchitectureContext): THREE.MeshStandardMaterial {
  const base = new THREE.Color("#9ba39f");
  return makeSurface(context, "Standing-seam galvanized steel", 1.6, (u, v) => {
    const rib = Math.abs((u * 4) % 1 - 0.5);
    const fold = 1 - THREE.MathUtils.smoothstep(rib, 0.012, 0.055);
    const crystal = noise(u, v, 32, 303);
    return { height: 0.4 + fold * 0.5 + crystal * 0.025, roughness: 0.38 + crystal * 0.18, color: base.clone().multiplyScalar(0.9 + crystal * 0.2) };
  });
}

export type ArchitecturalMaterials = ReturnType<typeof createArchitecturalMaterials>;
export function createArchitecturalMaterials(context: ArchitectureContext) {
  return {
    timber: createTimberFloor(context),
    terrazzo: createTerrazzo(context),
    porcelainTile: createCeramicTile(context),
    tealTile: createCeramicTile(context, true),
    boardConcrete: createBoardFormConcrete(context),
    upholstery: createWovenUpholstery(context),
    membrane: createRoofMembrane(context),
    ribbedMetal: createRibbedMetal(context),
  };
}
