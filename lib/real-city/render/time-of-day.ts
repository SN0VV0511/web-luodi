import * as THREE from "three";

export type TimeOfDay = "day" | "golden" | "night";

/** Photographic grade applied after tone mapping, per time-of-day preset. */
export type CityGrade = {
  /** Multiplies saturation around luminance; 1 keeps the scene unchanged. */
  saturation: number;
  /** S-curve strength around mid grey. */
  contrast: number;
  /** Colour pushed into the shadows (split toning). */
  shadowTint: THREE.Color;
  /** Colour pushed into the highlights (split toning). */
  highlightTint: THREE.Color;
  /** Corner darkening, 0 to 1. */
  vignette: number;
  /** Distance haze colour (linear) and its density per metre for aerial perspective. */
  hazeColor: THREE.Color;
  hazeDensity: number;
  /** Upper bound on the haze mix so lit windows and lamps survive in the distance. */
  hazeMax: number;
  /** Scale on the bloom contribution. */
  bloom: number;
};

export type TimeOfDayLighting = {
  /** Unit direction pointing from the ground toward the sun or moon. */
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  hemisphereSky: THREE.Color;
  hemisphereGround: THREE.Color;
  hemisphereIntensity: number;
  fillIntensity: number;
  exposure: number;
  environmentIntensity: number;
  fogColor: THREE.Color;
  fogDensity: number;
  skyZenith: THREE.Color;
  skyHorizon: THREE.Color;
  skyGround: THREE.Color;
  grade: CityGrade;
};

const grade = (values: Omit<CityGrade, "shadowTint" | "highlightTint" | "hazeColor"> & { shadowTint: string; highlightTint: string; hazeColor: string }): CityGrade => ({
  ...values,
  shadowTint: new THREE.Color(values.shadowTint),
  highlightTint: new THREE.Color(values.highlightTint),
  hazeColor: new THREE.Color(values.hazeColor),
});

/**
 * Golden hour and night are authored presets; daytime keeps the seasonal sun from city-seasons
 * and only receives the photographic grade, so the seasonal cycle still reads.
 */
export const TIME_OF_DAY_GRADES: Record<TimeOfDay, CityGrade> = {
  day: grade({
    saturation: 1.05, contrast: 1.04, shadowTint: "#203448", highlightTint: "#fff4e2",
    vignette: 0.18, hazeColor: "#b9c9d8", hazeDensity: 0.0014, hazeMax: 0.6, bloom: 1,
  }),
  golden: grade({
    saturation: 1.04, contrast: 1.05, shadowTint: "#2d2a4a", highlightTint: "#ffc98a",
    vignette: 0.26, hazeColor: "#e7b27d", hazeDensity: 0.002, hazeMax: 0.62, bloom: 2.4,
  }),
  night: grade({
    saturation: 1.08, contrast: 1.06, shadowTint: "#0b1a33", highlightTint: "#ffd7a1",
    vignette: 0.32, hazeColor: "#152238", hazeDensity: 0.0008, hazeMax: 0.35, bloom: 1.6,
  }),
};

export function goldenHourLighting(): Omit<TimeOfDayLighting, "grade"> {
  return {
    // Low western sun about eight degrees above the horizon: long shadows across the avenues.
    sunDirection: new THREE.Vector3(-0.86, 0.15, 0.48).normalize(),
    sunColor: new THREE.Color("#ffb46e"),
    sunIntensity: 3.1,
    hemisphereSky: new THREE.Color("#c5b4c8"),
    hemisphereGround: new THREE.Color("#5a4a3c"),
    hemisphereIntensity: 0.62,
    fillIntensity: 0.16,
    exposure: 1.0,
    environmentIntensity: 0.48,
    fogColor: new THREE.Color("#d9a780"),
    fogDensity: 0.00125,
    skyZenith: new THREE.Color("#3d5f93"),
    skyHorizon: new THREE.Color("#ffbf7f"),
    skyGround: new THREE.Color("#8c7468"),
  };
}
