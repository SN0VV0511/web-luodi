import * as THREE from "three";
import { cityBlocks, cityLots, civicLots, ROAD_SEGMENTS } from "../../city-map";
import type { CityBuiltSite } from "../contracts";
import { centralParkWalks } from "../../city-civic";
import { type GroundSample, type GroundSampler, StaticCollisionWorld } from "../physics/colliders";
import { clamp, layeredNoise, smoothstep } from "../physics/math";
import type { ContactMaterialName } from "../physics/materials";

export type TerrainKind = "road" | "pavement" | "park" | "sand" | "water" | "building" | "hill" | "dock";
export type TerrainPoint = { kind: TerrainKind; height: number; permeability: number; slopeX: number; slopeZ: number; exposed: number };
export type SurfaceWaterReader = (x: number, z: number) => number;

type Footprint = { x: number; z: number; halfWidth: number; halfDepth: number; height: number; material: ContactMaterialName; rotationY?: number; baseY?: number };
const reusable = new THREE.Vector3();
const extent = new THREE.Vector3();
const FOOTPRINT_CELL_SIZE = 24;

export class CityTerrain {
  readonly footprints: Footprint[] = [];
  readonly collisions: StaticCollisionWorld;
  private readonly footprintCells = new Map<string, Footprint[]>();
  private waterReader: SurfaceWaterReader = () => 0;
  private readonly ground = { kind: "park" as TerrainKind, height: 0.24, permeability: 0.8, slopeX: 0, slopeZ: 0, exposed: 1 };
  private readonly roads = ROAD_SEGMENTS.map(road => ({
    ...road,
    horizontal: Math.abs(road.z2 - road.z1) < 0.1,
    minX: Math.min(road.x1, road.x2),
    maxX: Math.max(road.x1, road.x2),
    minZ: Math.min(road.z1, road.z2),
    maxZ: Math.max(road.z1, road.z2),
  }));
  private readonly walkingSegments = centralParkWalks.flatMap(walk => {
    const segments: { x: number; z: number; dx: number; dz: number; lengthSquared: number; halfWidth: number }[] = [];
    for (let index = 0; index < walk.points.length - (walk.closed ? 0 : 1); index++) {
      const from = walk.points[index];
      const to = walk.points[(index + 1) % walk.points.length];
      const dx = to[0] - from[0];
      const dz = to[1] - from[1];
      segments.push({ x: from[0], z: from[1], dx, dz, lengthSquared: dx * dx + dz * dz, halfWidth: walk.width / 2 });
    }
    return segments;
  });

  constructor(sites: readonly CityBuiltSite[] = []) {
    for (const site of sites) {
      this.footprints.push({
        x: site.x, z: site.z, halfWidth: site.width / 2, halfDepth: site.depth / 2,
        height: site.height, material: "concrete", rotationY: site.rotationY, baseY: site.baseY,
      });
    }
    for (const lot of cityLots) {
      if (sites.some(site => Math.abs(site.x - lot.x) < 1 && Math.abs(site.z - lot.z) < 1)) continue;
      this.footprints.push({ x: lot.x, z: lot.z, halfWidth: lot.width / 2, halfDepth: lot.depth / 2, height: lot.height, material: "concrete" });
    }
    for (const lot of civicLots) {
      const width = lot.kind === "stadium" ? 26 : lot.kind === "school" ? 27 : 24;
      const depth = lot.kind === "stadium" ? 30 : 21;
      const height = lot.kind === "stadium" ? 0.2 : lot.kind === "city-hall" ? 15 : 10;
      this.footprints.push({ x: lot.x, z: lot.z, halfWidth: width / 2, halfDepth: depth / 2, height, material: "concrete" });
    }
    for (const block of cityBlocks) {
      if (this.footprints.some(footprint => Math.abs(footprint.x - block.x) < 20 && Math.abs(footprint.z - block.z) < 20)) continue;
      this.footprints.push({ x: block.x, z: block.z, halfWidth: 13.5, halfDepth: 13.5, height: 9.5, material: "stone" });
    }
    const sampler: GroundSampler = (x, z, result) => this.sampleGround(x, z, result);
    this.collisions = new StaticCollisionWorld(sampler, 24);
    for (const footprint of this.footprints) {
      reusable.set(footprint.x, footprint.height / 2 + (footprint.baseY ?? 0.4), footprint.z);
      extent.set(footprint.halfWidth, footprint.height / 2, footprint.halfDepth);
      const collider = this.collisions.addOrientedBox(reusable, extent, footprint.rotationY ?? 0, footprint.material);
      // Keep rotated edges inside the broad phase despite rounding at cell boundaries.
      const minX = Math.floor((collider.minimum.x - 1e-9) / FOOTPRINT_CELL_SIZE);
      const maxX = Math.floor((collider.maximum.x + 1e-9) / FOOTPRINT_CELL_SIZE);
      const minZ = Math.floor((collider.minimum.z - 1e-9) / FOOTPRINT_CELL_SIZE);
      const maxZ = Math.floor((collider.maximum.z + 1e-9) / FOOTPRINT_CELL_SIZE);
      for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
          const key = `${x}:${z}`;
          const entries = this.footprintCells.get(key);
          if (entries) entries.push(footprint);
          else this.footprintCells.set(key, [footprint]);
        }
      }
    }
  }

  setWaterReader(reader: SurfaceWaterReader): void {
    this.waterReader = reader;
  }

  sample(x: number, z: number, result: TerrainPoint): TerrainPoint {
    result.slopeX = 0;
    result.slopeZ = 0;
    result.exposed = 1;
    if (z < -225) {
      result.kind = "hill";
      result.height = this.hillHeight(x, z);
      result.permeability = 0.75;
      result.slopeX = (this.hillHeight(x + 0.2, z) - this.hillHeight(x - 0.2, z)) / 0.4;
      result.slopeZ = (this.hillHeight(x, z + 0.2) - this.hillHeight(x, z - 0.2)) / 0.4;
      return result;
    }
    if (this.inLake(x, z)) {
      result.kind = "water";
      result.height = 0.16;
      result.permeability = 1;
      return result;
    }
    if (z > 137) {
      result.kind = "water";
      result.height = -0.02;
      result.permeability = 1;
      return result;
    }
    if (z > 114 && x < -80) {
      result.kind = "sand";
      result.height = 0.24;
      result.permeability = 0.96;
      result.slopeZ = -0.008;
      return result;
    }
    if (z > 110 && x >= -80) {
      result.kind = z <= 121 ? "dock" : "water";
      result.height = z <= 121 ? 0.36 : -0.02;
      result.permeability = z <= 121 ? 0.35 : 1;
      return result;
    }
    const footprints = this.footprintCells.get(`${Math.floor(x / FOOTPRINT_CELL_SIZE)}:${Math.floor(z / FOOTPRINT_CELL_SIZE)}`);
    if (footprints) {
      for (const footprint of footprints) {
        if (this.inFootprint(x, z, footprint, 0)) {
          result.kind = "building";
          result.height = footprint.height + (footprint.baseY ?? 0.4);
          result.permeability = 0.02;
          result.exposed = 0.75;
          return result;
        }
      }
    }
    let nearestRoad = Infinity;
    for (const road of this.roads) {
      if (x < road.minX - 8.5 || x > road.maxX + 8.5 || z < road.minZ - 8.5 || z > road.maxZ + 8.5) continue;
      const nearestX = clamp(x, road.minX, road.maxX);
      const nearestZ = clamp(z, road.minZ, road.maxZ);
      const distance = Math.hypot(x - nearestX, z - nearestZ);
      nearestRoad = Math.min(nearestRoad, distance);
      if (distance <= 4.5) {
        result.kind = "road";
        result.height = 0.43;
        result.permeability = 0.015;
        const crown = 0.018;
        if (road.horizontal) result.slopeZ = z >= road.z1 ? -crown : crown;
        else result.slopeX = x >= road.x1 ? -crown : crown;
        return result;
      }
    }
    if (nearestRoad <= 8.4) {
      result.kind = "pavement";
      result.height = 0.49;
      result.permeability = 0.13;
      return result;
    }
    const park = Math.abs(x) < 66 && z > -104 && z < 88;
    if (park && this.onParkWalk(x, z)) {
      result.kind = "pavement";
      result.height = 0.39;
      result.permeability = 0.21;
      return result;
    }
    result.kind = "park";
    result.height = park ? 0.24 : 0.31;
    result.permeability = 0.82;
    result.exposed = park ? 0.72 : 0.85;
    result.slopeX = (layeredNoise(x * 0.03, z * 0.03, 14) - 0.5) * 0.014;
    result.slopeZ = (layeredNoise(x * 0.03, z * 0.03, 29) - 0.5) * 0.014;
    return result;
  }

  sampleGround(x: number, z: number, result: GroundSample): GroundSample {
    this.sample(x, z, this.ground);
    // Building volumes are resolved as static colliders, so their roofs are not an infinite ground field.
    result.height = this.ground.kind === "building" ? 0.4 : this.ground.height;
    result.normal.set(-this.ground.slopeX, 1, -this.ground.slopeZ).normalize();
    result.wetness = this.waterReader(x, z);
    switch (this.ground.kind) {
      case "road": result.material = "asphalt"; break;
      case "pavement": result.material = "concrete"; break;
      case "dock": result.material = "wood"; break;
      case "sand": result.material = "sand"; break;
      case "building": result.material = "stone"; break;
      default: result.material = "soil";
    }
    return result;
  }

  clearForPlant(x: number, z: number, clearance: number): boolean {
    this.sample(x, z, this.ground);
    if (this.ground.kind !== "park" && this.ground.kind !== "hill") return false;
    if (this.inLake(x, z, clearance + 1.5)) return false;
    if (this.onParkWalk(x, z, clearance)) return false;
    for (const footprint of this.footprints) {
      if (this.inFootprint(x, z, footprint, clearance)) return false;
    }
    return true;
  }

  inLake(x: number, z: number, padding = 0): boolean {
    const dx = (x + 12) / (28 + padding);
    const dz = (z + 15) / (38 + padding);
    return dx * dx + dz * dz < 1;
  }

  onParkWalk(x: number, z: number, padding = 0): boolean {
    for (const segment of this.walkingSegments) {
      const t = clamp(((x - segment.x) * segment.dx + (z - segment.z) * segment.dz) / Math.max(0.001, segment.lengthSquared), 0, 1);
      const dx = x - segment.x - t * segment.dx;
      const dz = z - segment.z - t * segment.dz;
      const radius = segment.halfWidth + padding;
      if (dx * dx + dz * dz < radius * radius) return true;
    }
    return false;
  }

  private inFootprint(x: number, z: number, footprint: Footprint, padding: number): boolean {
    const angle = footprint.rotationY ?? 0;
    const dx = x - footprint.x;
    const dz = z - footprint.z;
    const localX = Math.cos(angle) * dx - Math.sin(angle) * dz;
    const localZ = Math.sin(angle) * dx + Math.cos(angle) * dz;
    return Math.abs(localX) <= footprint.halfWidth + padding && Math.abs(localZ) <= footprint.halfDepth + padding;
  }

  hillHeight(x: number, z: number): number {
    const rise = smoothstep(225, 480, -z);
    return Math.max(0.15, rise * (34 + 16 * Math.sin(x * 0.008 + z * 0.003) + 12 * Math.cos(z * 0.014)) - 0.15);
  }
}

export function createTerrainPoint(): TerrainPoint {
  return { kind: "park", height: 0.24, permeability: 0.8, slopeX: 0, slopeZ: 0, exposed: 1 };
}
