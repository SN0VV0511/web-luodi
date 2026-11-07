import * as THREE from "three";
import { createRandom, smoothstep } from "../physics/math";

export function createSnowPatch(seed: number): THREE.BufferGeometry {
  const random = createRandom(seed);
  const sides = 18;
  const rings = 5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const contour = Array.from({ length: sides }, () => 0.77 + random() * 0.23);
  for (let ring = 0; ring <= rings; ring++) {
    const radial = ring / rings;
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      const radius = radial * contour[side % sides];
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const crest = Math.sin(angle * 3 + seed) * 0.08 + Math.cos(angle * 5) * 0.04;
      const y = (1 - smoothstep(0.18, 1, radial)) * (0.7 + crest) + Math.sin(radial * Math.PI) * 0.08;
      positions.push(x, y, z);
      uvs.push(x * 0.5 + 0.5, z * 0.5 + 0.5);
      const shade = 0.86 + radial * 0.1;
      colors.push(shade, shade + 0.02, Math.min(1, shade + 0.06));
      if (ring < rings && side < sides) {
        const a = ring * (sides + 1) + side;
        const b = a + 1;
        const c = a + sides + 1;
        indices.push(a, c, b, b, c, c + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createPuddlePatch(seed: number): THREE.BufferGeometry {
  const random = createRandom(seed);
  const shape = new THREE.Shape();
  const segments = 24;
  const radii = Array.from({ length: segments }, () => 0.72 + random() * 0.26);
  const points = radii.map((radius, index) => {
    const angle = index / segments * Math.PI * 2;
    return new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
  const curve = new THREE.SplineCurve([...points, points[0], points[1]]);
  const sampled = curve.getPoints(48).slice(0, 46);
  shape.moveTo(sampled[0].x, sampled[0].y);
  for (let index = 1; index < sampled.length; index++) shape.lineTo(sampled[index].x, sampled[index].y);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 12);
  geometry.rotateX(-Math.PI / 2);
  const uv = geometry.getAttribute("uv");
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < uv.count; index++) uv.setXY(index, positions.getX(index) * 0.5 + 0.5, positions.getZ(index) * 0.5 + 0.5);
  return geometry;
}

export function createRippleRing(): THREE.BufferGeometry {
  const geometry = new THREE.RingGeometry(0.76, 1, 24, 1);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function createRaindropCrown(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const sides = 12;
  for (let side = 0; side <= sides; side++) {
    const angle = side / sides * Math.PI * 2;
    const peak = side % 2 === 0 ? 0.7 : 0.4;
    positions.push(Math.cos(angle) * 0.6, 0, Math.sin(angle) * 0.6);
    positions.push(Math.cos(angle), peak, Math.sin(angle));
    uvs.push(side / sides, 0, side / sides, 1);
    if (side < sides) {
      const a = side * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createFootprintImpression(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.055, -0.14);
  shape.bezierCurveTo(-0.075, -0.12, -0.067, -0.045, -0.061, 0.015);
  shape.bezierCurveTo(-0.07, 0.065, -0.078, 0.15, -0.025, 0.17);
  shape.bezierCurveTo(0.04, 0.185, 0.075, 0.12, 0.063, 0.05);
  shape.bezierCurveTo(0.045, -0.01, 0.055, -0.095, 0.05, -0.14);
  shape.quadraticCurveTo(0, -0.165, -0.055, -0.14);
  const geometry = new THREE.ShapeGeometry(shape, 8);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}
