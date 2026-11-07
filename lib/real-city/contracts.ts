export type CityWorldPoint = { x: number; y: number; z: number };

/** Metre-scale footprint shared by buildings, contact physics and pedestrian navigation. */
export type CityBuiltSite = {
  id: string;
  kind: "residential" | "retail" | "restaurant" | "office" | "service";
  name: { zh: string; en: string };
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotationY: number;
  baseY: number;
  entrances: {
    id: string;
    position: CityWorldPoint;
    outward: { x: number; z: number };
    width: number;
    accessible: boolean;
  }[];
};

export type CityDetailBudget = {
  movingPeople: number;
  activeRigidBodies: number;
  airborneParticles: number;
  nearSurfaceParticles: number;
  simulatedHz: number;
};

/** Scene allocations are deliberately bounded even as the behavior library grows. */
export function cityDetailBudget(compact = false): CityDetailBudget {
  if (compact) return {
    movingPeople: 48,
    activeRigidBodies: 36,
    airborneParticles: 240,
    nearSurfaceParticles: 96,
    simulatedHz: 30,
  };
  return {
    movingPeople: 96,
    activeRigidBodies: 72,
    airborneParticles: 480,
    nearSurfaceParticles: 192,
    simulatedHz: 60,
  };
}
