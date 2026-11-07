import { clamp } from "./math";

export type ContactMaterialName = "asphalt" | "concrete" | "stone" | "soil" | "sand" | "wood" | "metal" | "rubber" | "paper" | "leaf" | "cloth" | "snow" | "ice";

export type ContactMaterial = {
  staticFriction: number;
  dynamicFriction: number;
  restitution: number;
  rollingResistance: number;
  wetFrictionMultiplier: number;
  density: number;
};

export function contactMaterial(name: ContactMaterialName): ContactMaterial {
  switch (name) {
    case "asphalt":
      return { staticFriction: 0.8, dynamicFriction: 0.64, restitution: 0.06, rollingResistance: 0.018, wetFrictionMultiplier: 0.62, density: 2300 };
    case "concrete":
      return { staticFriction: 0.76, dynamicFriction: 0.58, restitution: 0.08, rollingResistance: 0.014, wetFrictionMultiplier: 0.71, density: 2400 };
    case "stone":
      return { staticFriction: 0.66, dynamicFriction: 0.49, restitution: 0.12, rollingResistance: 0.012, wetFrictionMultiplier: 0.6, density: 2600 };
    case "soil":
      return { staticFriction: 0.88, dynamicFriction: 0.72, restitution: 0.02, rollingResistance: 0.12, wetFrictionMultiplier: 0.68, density: 1500 };
    case "sand":
      return { staticFriction: 0.92, dynamicFriction: 0.81, restitution: 0.01, rollingResistance: 0.22, wetFrictionMultiplier: 0.83, density: 1600 };
    case "wood":
      return { staticFriction: 0.52, dynamicFriction: 0.39, restitution: 0.22, rollingResistance: 0.023, wetFrictionMultiplier: 0.59, density: 620 };
    case "metal":
      return { staticFriction: 0.44, dynamicFriction: 0.3, restitution: 0.34, rollingResistance: 0.009, wetFrictionMultiplier: 0.65, density: 7800 };
    case "rubber":
      return { staticFriction: 0.96, dynamicFriction: 0.78, restitution: 0.72, rollingResistance: 0.025, wetFrictionMultiplier: 0.67, density: 1100 };
    case "paper":
      return { staticFriction: 0.43, dynamicFriction: 0.32, restitution: 0.03, rollingResistance: 0.12, wetFrictionMultiplier: 1.2, density: 760 };
    case "leaf":
      return { staticFriction: 0.48, dynamicFriction: 0.31, restitution: 0.02, rollingResistance: 0.19, wetFrictionMultiplier: 0.8, density: 520 };
    case "cloth":
      return { staticFriction: 0.62, dynamicFriction: 0.49, restitution: 0.015, rollingResistance: 0.3, wetFrictionMultiplier: 1.12, density: 340 };
    case "snow":
      return { staticFriction: 0.39, dynamicFriction: 0.24, restitution: 0.01, rollingResistance: 0.17, wetFrictionMultiplier: 0.72, density: 180 };
    case "ice":
      return { staticFriction: 0.09, dynamicFriction: 0.035, restitution: 0.13, rollingResistance: 0.004, wetFrictionMultiplier: 0.6, density: 917 };
  }
}

export function combineContactMaterials(a: ContactMaterial, b: ContactMaterial, wetness: number): ContactMaterial {
  const water = clamp(wetness, 0, 1);
  const wetA = 1 + (a.wetFrictionMultiplier - 1) * water;
  const wetB = 1 + (b.wetFrictionMultiplier - 1) * water;
  return {
    staticFriction: Math.sqrt(a.staticFriction * b.staticFriction * wetA * wetB),
    dynamicFriction: Math.sqrt(a.dynamicFriction * b.dynamicFriction * wetA * wetB),
    restitution: Math.min(a.restitution, b.restitution),
    rollingResistance: Math.max(a.rollingResistance, b.rollingResistance),
    wetFrictionMultiplier: 1,
    density: Math.sqrt(a.density * b.density),
  };
}

export function dampingFromSurface(material: ContactMaterial, supportedWeight: number, speed: number): number {
  if (speed <= 0 || supportedWeight <= 0) return 0;
  const rolling = material.rollingResistance * supportedWeight;
  const speedDependence = 1 + Math.min(10, speed) * 0.025;
  return rolling * speedDependence;
}
