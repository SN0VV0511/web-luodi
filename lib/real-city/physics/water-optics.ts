import * as THREE from "three";
import { clamp } from "./math";

export type WaterOpticalComposition = {
  chlorophyll: number;
  sediment: number;
  dissolvedOrganic: number;
  salinity: number;
  temperature: number;
  depth: number;
  bottomAlbedo: number;
  solarElevation: number;
  bubbles: number;
};

export type WaterOpticalState = {
  color: THREE.Color;
  absorption: THREE.Vector3;
  scattering: THREE.Vector3;
  attenuation: THREE.Vector3;
  secchiDepth: number;
  transparency: number;
  indexOfRefraction: number;
  foamAlbedo: number;
};

export class WaterColumnOptics {
  readonly state: WaterOpticalState = {
    color: new THREE.Color(0.1, 0.3, 0.35),
    absorption: new THREE.Vector3(),
    scattering: new THREE.Vector3(),
    attenuation: new THREE.Vector3(),
    secchiDepth: 4,
    transparency: 0.6,
    indexOfRefraction: 1.333,
    foamAlbedo: 0.8,
  };
  private readonly wavelengths = new Float64Array(9);
  private readonly redResponse = new Float64Array(9);
  private readonly greenResponse = new Float64Array(9);
  private readonly blueResponse = new Float64Array(9);
  private readonly responseSum = new THREE.Vector3();
  private readonly reflectance = new Float64Array(9);
  private readonly absorption = new Float64Array(9);
  private readonly scattering = new Float64Array(9);

  constructor() {
    for (let index = 0; index < this.wavelengths.length; index++) {
      const wavelength = 410 + index * 35;
      this.wavelengths[index] = wavelength;
      this.redResponse[index] = this.gaussian(wavelength, 610, 45);
      this.greenResponse[index] = this.gaussian(wavelength, 545, 35);
      this.blueResponse[index] = this.gaussian(wavelength, 455, 28);
      this.responseSum.x += this.redResponse[index];
      this.responseSum.y += this.greenResponse[index];
      this.responseSum.z += this.blueResponse[index];
    }
  }

  evaluate(composition: WaterOpticalComposition): WaterOpticalState {
    const chlorophyll = Math.max(0, composition.chlorophyll);
    const suspended = Math.max(0, composition.sediment);
    const organic = Math.max(0, composition.dissolvedOrganic);
    const depth = clamp(composition.depth, 0.01, 100);
    const solar = clamp(composition.solarElevation, 0.05, 1);
    const refractedCosine = Math.sqrt(1 - (1 - solar * solar) / (1.333 * 1.333));
    let red = 0;
    let green = 0;
    let blue = 0;
    let absorptionRed = 0;
    let absorptionGreen = 0;
    let absorptionBlue = 0;
    let scatterRed = 0;
    let scatterGreen = 0;
    let scatterBlue = 0;
    for (let index = 0; index < this.wavelengths.length; index++) {
      const wavelength = this.wavelengths[index];
      const pureWater = this.pureWaterAbsorption(wavelength, composition.temperature);
      const chlorophyllAbsorption = chlorophyll * (0.018 * this.gaussian(wavelength, 440, 28) + 0.014 * this.gaussian(wavelength, 675, 20) + 0.0015);
      const organicAbsorption = organic * 0.12 * Math.exp(-0.017 * (wavelength - 440));
      const mineralAbsorption = suspended * 0.032 * Math.exp(-0.011 * (wavelength - 440));
      const absorption = pureWater + chlorophyllAbsorption + organicAbsorption + mineralAbsorption;
      const molecularScatter = 0.00288 * (500 / wavelength) ** 4.32 * (1 + composition.salinity * 0.0003);
      const particleScatter = suspended * 0.055 * (550 / wavelength) ** 0.8 + chlorophyll * 0.012 * (550 / wavelength) ** 0.4;
      const bubbleScatter = composition.bubbles * 0.18;
      const scattering = molecularScatter + particleScatter + bubbleScatter;
      const backscatter = molecularScatter * 0.5 + particleScatter * 0.018 + bubbleScatter * 0.08;
      const ratio = backscatter / Math.max(0.0001, absorption + backscatter);
      const infiniteReflectance = 0.089 * ratio + 0.125 * ratio * ratio;
      const attenuation = absorption + scattering * 0.3;
      const opticalPath = depth * (1 / refractedCosine + 1.1);
      const bottomTransmission = Math.exp(-attenuation * opticalPath);
      const bottomColor = composition.bottomAlbedo * this.bottomSpectrum(wavelength);
      const reflectance = infiniteReflectance * (1 - bottomTransmission) + bottomColor * bottomTransmission * 0.2;
      this.reflectance[index] = reflectance;
      this.absorption[index] = absorption;
      this.scattering[index] = scattering;
      red += reflectance * this.redResponse[index];
      green += reflectance * this.greenResponse[index];
      blue += reflectance * this.blueResponse[index];
      absorptionRed += absorption * this.redResponse[index];
      absorptionGreen += absorption * this.greenResponse[index];
      absorptionBlue += absorption * this.blueResponse[index];
      scatterRed += scattering * this.redResponse[index];
      scatterGreen += scattering * this.greenResponse[index];
      scatterBlue += scattering * this.blueResponse[index];
    }
    const scale = 6;
    this.state.color.setRGB(
      clamp(red / this.responseSum.x * scale, 0.015, 0.7),
      clamp(green / this.responseSum.y * scale, 0.025, 0.8),
      clamp(blue / this.responseSum.z * scale, 0.035, 0.85),
    );
    this.state.absorption.set(absorptionRed / this.responseSum.x, absorptionGreen / this.responseSum.y, absorptionBlue / this.responseSum.z);
    this.state.scattering.set(scatterRed / this.responseSum.x, scatterGreen / this.responseSum.y, scatterBlue / this.responseSum.z);
    this.state.attenuation.copy(this.state.absorption).addScaledVector(this.state.scattering, 0.3);
    const photopicAttenuation = this.state.attenuation.dot(new THREE.Vector3(0.2126, 0.7152, 0.0722));
    this.state.secchiDepth = clamp(1.7 / Math.max(0.01, photopicAttenuation), 0.1, 50);
    this.state.transparency = Math.exp(-photopicAttenuation * depth);
    this.state.indexOfRefraction = 1.333 + composition.salinity * 0.00018 - (composition.temperature - 20) * 0.00009;
    this.state.foamAlbedo = clamp(0.86 - organic * 0.015 - suspended * 0.005, 0.55, 0.9);
    return this.state;
  }

  fresnel(cosine: number): number {
    const refractive = this.state.indexOfRefraction;
    const c = clamp(Math.abs(cosine), 0, 1);
    const transmittedSquared = 1 - (1 - c * c) / (refractive * refractive);
    if (transmittedSquared <= 0) return 1;
    const transmitted = Math.sqrt(transmittedSquared);
    const perpendicular = (c - refractive * transmitted) / Math.max(1e-9, c + refractive * transmitted);
    const parallel = (refractive * c - transmitted) / Math.max(1e-9, refractive * c + transmitted);
    return clamp((perpendicular * perpendicular + parallel * parallel) * 0.5, 0, 1);
  }

  private pureWaterAbsorption(wavelength: number, temperature: number): number {
    const blue = 0.007 + 0.008 * this.gaussian(wavelength, 410, 25);
    const green = Math.max(0, wavelength - 490) * 0.00022;
    const red = Math.max(0, wavelength - 550) ** 2 * 0.000022;
    const thermal = 1 + Math.max(0, wavelength - 600) * (temperature - 20) * 0.000002;
    return (blue + green + red) * thermal;
  }

  private bottomSpectrum(wavelength: number): number {
    const redRise = clamp((wavelength - 420) / 300, 0, 1);
    return 0.55 + redRise * 0.4;
  }

  private gaussian(value: number, centre: number, width: number): number {
    const distance = (value - centre) / width;
    return Math.exp(-0.5 * distance * distance);
  }
}
