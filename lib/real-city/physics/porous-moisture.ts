import { clamp, saturate } from "./math";

export type PorousSubstrate = "wood" | "paper" | "fabric" | "rope";

export type PorousBoundary = {
  humidity: number;
  temperature: number;
  surfaceTemperature: number;
  film: number;
  wind: number;
  salt: number;
  shelter: number;
};

export type PorousMoistureSample = {
  surfaceWater: number;
  coreWater: number;
  boundWater: number;
  freeWater: number;
  iceFraction: number;
  swelling: number;
  curvature: number;
  stress: number;
  damage: number;
  absorbedFilm: number;
  evaporatedWater: number;
  exudedWater: number;
  latentHeat: number;
  waterMass: number;
};

type PorousLayer = {
  thickness: number;
  porosity: number;
  dryDensity: number;
  boundCapacity: number;
  permeability: number;
  vaporDiffusivity: number;
  capillaryEntry: number;
  retentionExponent: number;
  elasticModulus: number;
  expansion: number;
  boundWater: number;
  liquidWater: number;
  ice: number;
  vapor: number;
  temperature: number;
  damage: number;
  crystallizedSalt: number;
  dissolvedSalt: number;
  swelling: number;
  lastSwelling: number;
};

export class PorousMoistureColumn {
  readonly sample: PorousMoistureSample = {
    surfaceWater: 0,
    coreWater: 0,
    boundWater: 0,
    freeWater: 0,
    iceFraction: 0,
    swelling: 0,
    curvature: 0,
    stress: 0,
    damage: 0,
    absorbedFilm: 0,
    evaporatedWater: 0,
    exudedWater: 0,
    latentHeat: 0,
    waterMass: 0,
  };
  private readonly layers: PorousLayer[] = [];
  private readonly liquidDelta: Float64Array;
  private readonly vaporDelta: Float64Array;
  private readonly saltDelta: Float64Array;
  private readonly flux: Float64Array;
  private readonly vaporFlux: Float64Array;
  private readonly outgoing: Float64Array;
  private readonly incoming: Float64Array;
  private readonly temperatureNext: Float64Array;
  private wetting = false;
  private previousMass = 0;
  private elapsed = 0;
  private initialMass = 0;
  private enteredWater = 0;
  private leftWater = 0;
  private accumulatedDamage = 0;
  private readonly nominalThickness: number;
  private readonly thermalConductivity: number;
  private readonly dryHeatCapacity: number;

  constructor(readonly substrate: PorousSubstrate, layerCount = 8) {
    const count = Math.max(4, Math.min(16, Math.floor(layerCount)));
    this.nominalThickness = substrate === "wood" ? 0.025 : substrate === "rope" ? 0.014 : substrate === "paper" ? 0.0008 : 0.002;
    this.thermalConductivity = substrate === "wood" ? 0.13 : substrate === "paper" ? 0.09 : 0.055;
    this.dryHeatCapacity = substrate === "wood" ? 1700 : substrate === "paper" ? 1400 : 1300;
    const cellThickness = this.nominalThickness / count;
    for (let index = 0; index < count; index++) {
      const center = (index + 0.5) / count;
      const surface = index === 0;
      const density = substrate === "wood" ? 530 : substrate === "rope" ? 420 : substrate === "paper" ? 680 : 210;
      const porosity = substrate === "wood" ? 0.5 : substrate === "paper" ? 0.48 : substrate === "rope" ? 0.64 : 0.78;
      const binding = substrate === "wood" ? 0.28 : substrate === "paper" ? 0.32 : 0.2;
      const permeability = substrate === "wood" ? 0.000000000000002 : substrate === "paper" ? 0.000000000000006 : 0.0000000000001;
      const diffusivity = substrate === "wood" ? 0.00000008 : substrate === "paper" ? 0.0000004 : 0.000002;
      const capillary = substrate === "wood" ? 12000 : substrate === "paper" ? 18000 : 2200;
      const modulus = substrate === "wood" ? 850000000 : substrate === "paper" ? 350000000 : 12000000;
      const expansion = substrate === "wood" ? 0.14 : substrate === "paper" ? 0.28 : 0.07;
      const grain = substrate === "wood" ? 0.8 + Math.sin(center * 10) * 0.2 : 1;
      this.layers.push({
        thickness: cellThickness,
        porosity: porosity * (surface ? 0.96 : 1),
        dryDensity: density * grain,
        boundCapacity: density * binding,
        permeability: permeability * (surface ? 0.7 : 1) / grain,
        vaporDiffusivity: diffusivity / grain,
        capillaryEntry: capillary * grain,
        retentionExponent: substrate === "wood" ? 2.4 : 1.8,
        elasticModulus: modulus * grain,
        expansion,
        boundWater: 0,
        liquidWater: 0,
        ice: 0,
        vapor: 0,
        temperature: 18,
        damage: 0,
        crystallizedSalt: 0,
        dissolvedSalt: 0,
        swelling: 0,
        lastSwelling: 0,
      });
    }
    this.liquidDelta = new Float64Array(count);
    this.vaporDelta = new Float64Array(count);
    this.saltDelta = new Float64Array(count);
    this.flux = new Float64Array(count - 1);
    this.vaporFlux = new Float64Array(count - 1);
    this.outgoing = new Float64Array(count);
    this.incoming = new Float64Array(count);
    this.temperatureNext = new Float64Array(count);
    this.reset();
  }

  step(seconds: number, boundary: PorousBoundary): PorousMoistureSample {
    const elapsed = clamp(seconds, 0, 60);
    if (elapsed <= 0) return this.sample;
    this.sample.absorbedFilm = 0;
    this.sample.evaporatedWater = 0;
    this.sample.exudedWater = 0;
    this.sample.latentHeat = 0;
    const substeps = Math.max(1, Math.min(24, Math.ceil(elapsed / 1.5)));
    const dt = elapsed / substeps;
    for (let iteration = 0; iteration < substeps; iteration++) {
      this.elapsed += dt;
      this.surfaceExchange(dt, boundary);
      this.liquidTransport(dt);
      this.vaporTransport(dt);
      this.sorption(dt);
      this.thermalRelaxation(dt, boundary);
      this.phaseChange(dt);
      this.saltEquilibrium(dt);
      this.mechanicalResponse(dt);
    }
    this.aggregate();
    this.wetting = this.sample.waterMass > this.previousMass + 0.0000001;
    this.previousMass = this.sample.waterMass;
    return this.sample;
  }

  reset(humidity = 0.55, temperature = 18): void {
    this.wetting = false;
    this.elapsed = 0;
    this.enteredWater = 0;
    this.leftWater = 0;
    this.accumulatedDamage = 0;
    for (const layer of this.layers) {
      const moisture = this.sorptionIsotherm(humidity, temperature, false);
      layer.boundWater = layer.boundCapacity * moisture;
      layer.liquidWater = 0;
      layer.ice = 0;
      layer.vapor = this.saturatedVaporDensity(temperature) * humidity;
      layer.temperature = temperature;
      layer.damage = 0;
      layer.crystallizedSalt = 0;
      layer.dissolvedSalt = 0;
      layer.swelling = 0;
      layer.lastSwelling = 0;
    }
    this.sample.absorbedFilm = 0;
    this.sample.evaporatedWater = 0;
    this.sample.exudedWater = 0;
    this.sample.latentHeat = 0;
    this.aggregate();
    this.initialMass = this.sample.waterMass;
    this.previousMass = this.initialMass;
  }

  private surfaceExchange(dt: number, boundary: PorousBoundary): void {
    const surface = this.layers[0];
    const exposed = 1 - saturate(boundary.shelter);
    const liquidCapacity = this.liquidCapacity(surface);
    const saturation = this.liquidSaturation(surface);
    const viscosity = this.waterViscosity(surface.temperature);
    const suction = -this.capillaryPressure(surface);
    const conductiveIntake = surface.permeability / viscosity * suction / Math.max(0.0001, surface.thickness) * 1000;
    const supply = Math.max(0, boundary.film * 0.12 * exposed - this.sample.absorbedFilm);
    const intake = Math.min(supply, Math.max(0, liquidCapacity - surface.liquidWater) * surface.thickness, conductiveIntake * dt);
    if (intake > 0) {
      surface.liquidWater += intake / surface.thickness;
      surface.dissolvedSalt += intake * Math.max(0, boundary.salt) / surface.thickness;
      this.sample.absorbedFilm += intake;
      this.enteredWater += intake;
    }
    const ambientDensity = this.saturatedVaporDensity(boundary.temperature) * clamp(boundary.humidity, 0.01, 1);
    const waterActivity = this.waterActivity(surface);
    const equilibriumVapor = this.saturatedVaporDensity(surface.temperature) * waterActivity;
    const boundaryTransfer = (0.001 + Math.sqrt(Math.max(0, boundary.wind)) * 0.0008) * exposed;
    const vaporMass = (equilibriumVapor - ambientDensity) * boundaryTransfer * dt;
    if (vaporMass > 0) {
      let remaining = vaporMass;
      const evaporatedLiquid = Math.min(surface.liquidWater * surface.thickness, remaining);
      surface.liquidWater -= evaporatedLiquid / surface.thickness;
      remaining -= evaporatedLiquid;
      const evaporatedBound = Math.min(surface.boundWater * surface.thickness * 0.05, remaining);
      surface.boundWater -= evaporatedBound / surface.thickness;
      const removed = evaporatedLiquid + evaporatedBound;
      this.sample.evaporatedWater += removed;
      this.sample.latentHeat -= removed * 2450000;
      this.leftWater += removed;
    } else {
      const condensed = Math.min(-vaporMass, Math.max(0, liquidCapacity - surface.liquidWater) * surface.thickness);
      surface.liquidWater += condensed / surface.thickness;
      this.sample.latentHeat += condensed * 2450000;
      this.enteredWater += condensed;
    }
    const poreVolume = Math.max(0.01, surface.porosity * (1 - saturation));
    const vaporRelaxation = 1 - Math.exp(-dt * boundaryTransfer / (surface.thickness * poreVolume));
    const previous = surface.vapor;
    surface.vapor += (ambientDensity - surface.vapor) * vaporRelaxation;
    const exchanged = (surface.vapor - previous) * poreVolume * surface.thickness;
    if (exchanged >= 0) this.enteredWater += exchanged;
    else this.leftWater -= exchanged;
  }

  private liquidTransport(dt: number): void {
    this.liquidDelta.fill(0);
    this.saltDelta.fill(0);
    this.outgoing.fill(0);
    this.incoming.fill(0);
    for (let index = 0; index < this.layers.length - 1; index++) {
      const a = this.layers[index];
      const b = this.layers[index + 1];
      const distance = (a.thickness + b.thickness) * 0.5;
      const mobilityA = this.hydraulicMobility(a);
      const mobilityB = this.hydraulicMobility(b);
      const mobility = 2 * mobilityA * mobilityB / Math.max(1e-30, mobilityA + mobilityB);
      const pressureDifference = this.capillaryPressure(b) - this.capillaryPressure(a);
      const mass = -mobility * pressureDifference / distance * 1000 * dt;
      this.flux[index] = mass;
      const source = mass >= 0 ? index : index + 1;
      const destination = mass >= 0 ? index + 1 : index;
      this.outgoing[source] += Math.abs(mass);
      this.incoming[destination] += Math.abs(mass);
    }
    for (let index = 0; index < this.flux.length; index++) {
      const flux = this.flux[index];
      const sourceIndex = flux >= 0 ? index : index + 1;
      const destinationIndex = flux >= 0 ? index + 1 : index;
      const source = this.layers[sourceIndex];
      const destination = this.layers[destinationIndex];
      const available = source.liquidWater * source.thickness;
      const capacity = Math.max(0, this.liquidCapacity(destination) - destination.liquidWater) * destination.thickness;
      const outgoingLimit = Math.min(1, available / Math.max(1e-20, this.outgoing[sourceIndex]));
      const incomingLimit = Math.min(1, capacity / Math.max(1e-20, this.incoming[destinationIndex]));
      const moved = Math.abs(flux) * Math.min(outgoingLimit, incomingLimit);
      this.liquidDelta[sourceIndex] -= moved / source.thickness;
      this.liquidDelta[destinationIndex] += moved / destination.thickness;
      const concentration = source.dissolvedSalt / Math.max(0.000001, source.liquidWater);
      const salt = Math.min(source.dissolvedSalt * source.thickness, moved * concentration);
      this.saltDelta[sourceIndex] -= salt / source.thickness;
      this.saltDelta[destinationIndex] += salt / destination.thickness;
    }
    for (let index = 0; index < this.layers.length; index++) {
      this.layers[index].liquidWater = Math.max(0, this.layers[index].liquidWater + this.liquidDelta[index]);
      this.layers[index].dissolvedSalt = Math.max(0, this.layers[index].dissolvedSalt + this.saltDelta[index]);
    }
  }

  private vaporTransport(dt: number): void {
    this.vaporDelta.fill(0);
    this.outgoing.fill(0);
    for (let index = 0; index < this.layers.length - 1; index++) {
      const a = this.layers[index];
      const b = this.layers[index + 1];
      const distance = (a.thickness + b.thickness) * 0.5;
      const gasA = this.gasPorosity(a);
      const gasB = this.gasPorosity(b);
      const coefficientA = a.vaporDiffusivity * gasA ** 1.5;
      const coefficientB = b.vaporDiffusivity * gasB ** 1.5;
      const diffusion = 2 * coefficientA * coefficientB / Math.max(1e-20, coefficientA + coefficientB);
      const mass = diffusion * (a.vapor - b.vapor) / distance * dt;
      this.vaporFlux[index] = mass;
      this.outgoing[mass >= 0 ? index : index + 1] += Math.abs(mass);
    }
    for (let index = 0; index < this.vaporFlux.length; index++) {
      const flux = this.vaporFlux[index];
      const sourceIndex = flux >= 0 ? index : index + 1;
      const destinationIndex = flux >= 0 ? index + 1 : index;
      const source = this.layers[sourceIndex];
      const destination = this.layers[destinationIndex];
      const sourceVolume = this.gasPorosity(source) * source.thickness;
      const destinationVolume = this.gasPorosity(destination) * destination.thickness;
      const available = source.vapor * sourceVolume;
      const limit = Math.min(1, available / Math.max(1e-20, this.outgoing[sourceIndex]));
      const mass = Math.abs(flux) * limit;
      this.vaporDelta[sourceIndex] -= mass / sourceVolume;
      this.vaporDelta[destinationIndex] += mass / destinationVolume;
    }
    for (let index = 0; index < this.layers.length; index++) {
      this.layers[index].vapor = Math.max(0, this.layers[index].vapor + this.vaporDelta[index]);
    }
  }

  private sorption(dt: number): void {
    for (const layer of this.layers) {
      const saturationDensity = this.saturatedVaporDensity(layer.temperature);
      const humidity = clamp(layer.vapor / Math.max(0.000001, saturationDensity), 0, 1);
      const equilibrium = this.sorptionIsotherm(humidity, layer.temperature, this.wetting) * layer.boundCapacity;
      const rate = this.substrate === "wood" ? 0.015 : this.substrate === "rope" ? 0.04 : 0.12;
      const exchange = (equilibrium - layer.boundWater) * (1 - Math.exp(-dt * rate));
      if (exchange > 0) {
        const fromLiquid = Math.min(layer.liquidWater, exchange);
        layer.liquidWater -= fromLiquid;
        layer.boundWater += fromLiquid;
        const fromVapor = Math.min(layer.vapor * this.gasPorosity(layer), exchange - fromLiquid);
        layer.vapor -= fromVapor / this.gasPorosity(layer);
        layer.boundWater += fromVapor;
        this.sample.latentHeat += (fromLiquid * 80000 + fromVapor * 2530000) * layer.thickness;
      } else {
        const released = Math.min(layer.boundWater, -exchange);
        layer.boundWater -= released;
        layer.vapor += released / this.gasPorosity(layer);
        this.sample.latentHeat -= released * 2530000 * layer.thickness;
      }
      const vaporExcess = Math.max(0, layer.vapor - saturationDensity);
      if (vaporExcess > 0) {
        const condensed = vaporExcess * this.gasPorosity(layer);
        layer.vapor -= vaporExcess;
        layer.liquidWater += condensed;
        this.sample.latentHeat += condensed * layer.thickness * 2450000;
      }
      const overfill = Math.max(0, layer.liquidWater - this.liquidCapacity(layer));
      if (overfill > 0) {
        layer.liquidWater -= overfill;
        const exuded = overfill * layer.thickness;
        this.sample.exudedWater += exuded;
        this.leftWater += exuded;
      }
    }
  }

  private thermalRelaxation(dt: number, boundary: PorousBoundary): void {
    for (let index = 0; index < this.layers.length; index++) {
      const layer = this.layers[index];
      const heatCapacity = layer.dryDensity * this.dryHeatCapacity + (layer.boundWater + layer.liquidWater) * 4180 + layer.ice * 2100;
      const conductivity = this.thermalConductivity * (1 + this.liquidSaturation(layer) * 3);
      const diffusion = conductivity / Math.max(1, heatCapacity);
      const below = index + 1 < this.layers.length ? this.layers[index + 1].temperature : boundary.temperature;
      const above = index > 0 ? this.layers[index - 1].temperature : boundary.surfaceTemperature;
      const ratio = diffusion * dt / (layer.thickness * layer.thickness);
      const target = (above + below) * 0.5;
      this.temperatureNext[index] = layer.temperature + (target - layer.temperature) * (1 - Math.exp(-2 * ratio));
    }
    for (let index = 0; index < this.layers.length; index++) this.layers[index].temperature = this.temperatureNext[index];
  }

  private phaseChange(dt: number): void {
    for (const layer of this.layers) {
      const concentration = layer.dissolvedSalt / Math.max(0.001, layer.liquidWater);
      const freezingPoint = -Math.min(12, concentration * 58);
      const poreDepression = layer.capillaryEntry * 0.0000008;
      const transition = freezingPoint - poreDepression;
      const frozenFraction = saturate((transition - layer.temperature) / 2);
      const mobile = layer.liquidWater + layer.ice;
      const desiredIce = mobile * frozenFraction;
      const difference = (desiredIce - layer.ice) * (1 - Math.exp(-dt * 0.035));
      if (difference > 0) {
        const freeze = Math.min(layer.liquidWater, difference);
        layer.liquidWater -= freeze;
        layer.ice += freeze;
        this.sample.latentHeat += freeze * layer.thickness * 334000;
        const expansion = freeze / 917 - freeze / 1000;
        const filledPores = saturate((layer.liquidWater / 1000 + layer.ice / 917) / layer.porosity);
        const pressure = expansion * filledPores ** 4 * 2200000000;
        const strength = layer.elasticModulus * 0.004;
        const damage = Math.max(0, pressure - strength) / Math.max(1, layer.elasticModulus) * 0.002;
        layer.damage = saturate(layer.damage + damage);
      } else {
        const melt = Math.min(layer.ice, -difference);
        layer.ice -= melt;
        layer.liquidWater += melt;
        this.sample.latentHeat -= melt * layer.thickness * 334000;
      }
    }
  }

  private saltEquilibrium(dt: number): void {
    for (const layer of this.layers) {
      const solubility = 0.26 + Math.max(0, layer.temperature) * 0.0003;
      const dissolvedCapacity = layer.liquidWater * solubility;
      const excess = layer.dissolvedSalt - dissolvedCapacity;
      if (excess > 0) {
        const crystallized = Math.min(layer.dissolvedSalt, excess * (1 - Math.exp(-dt * 0.08)));
        layer.dissolvedSalt -= crystallized;
        layer.crystallizedSalt += crystallized;
        const crystallizationPressure = crystallized / Math.max(0.001, layer.porosity) * 18000;
        const damage = crystallizationPressure / Math.max(100000, layer.elasticModulus) * 0.0002;
        layer.damage = saturate(layer.damage + damage);
      } else {
        const dissolved = Math.min(layer.crystallizedSalt, -excess * (1 - Math.exp(-dt * 0.12)));
        layer.crystallizedSalt -= dissolved;
        layer.dissolvedSalt += dissolved;
      }
    }
  }

  private mechanicalResponse(dt: number): void {
    let totalStiffness = 0;
    let weightedStrain = 0;
    for (const layer of this.layers) {
      const moistureRatio = layer.boundWater / Math.max(1, layer.dryDensity);
      const referenceMoisture = 0.12;
      const swelling = (moistureRatio - referenceMoisture) * layer.expansion;
      const iceSwelling = layer.ice / 917 * 0.09;
      layer.lastSwelling = layer.swelling;
      layer.swelling = swelling + iceSwelling;
      const stiffness = layer.elasticModulus * (1 - layer.damage) * layer.thickness;
      totalStiffness += stiffness;
      weightedStrain += layer.swelling * stiffness;
    }
    const sharedStrain = weightedStrain / Math.max(1, totalStiffness);
    let maximumStress = 0;
    for (const layer of this.layers) {
      const constrainedStrain = sharedStrain - layer.swelling;
      const modulus = layer.elasticModulus * (1 - layer.damage * 0.8);
      const relaxation = Math.exp(-dt * (0.001 + layer.boundWater / layer.boundCapacity * 0.004));
      const stress = Math.abs(constrainedStrain * modulus) * relaxation;
      maximumStress = Math.max(maximumStress, stress);
      const tensileLimit = modulus * (this.substrate === "wood" ? 0.006 : 0.02);
      const overstress = Math.max(0, stress - tensileLimit);
      const fatigue = Math.abs(layer.swelling - layer.lastSwelling) * 0.001;
      layer.damage = saturate(layer.damage + overstress / Math.max(1, modulus) * dt * 0.00002 + fatigue);
    }
    this.sample.stress = maximumStress;
    this.sample.swelling = sharedStrain;
    this.sample.curvature = (this.layers[0].swelling - this.layers[this.layers.length - 1].swelling) / this.nominalThickness;
  }

  private aggregate(): void {
    let totalDry = 0;
    let bound = 0;
    let liquid = 0;
    let ice = 0;
    let vapor = 0;
    let damage = 0;
    for (const layer of this.layers) {
      totalDry += layer.dryDensity * layer.thickness;
      bound += layer.boundWater * layer.thickness;
      liquid += layer.liquidWater * layer.thickness;
      ice += layer.ice * layer.thickness;
      vapor += layer.vapor * this.gasPorosity(layer) * layer.thickness;
      damage += layer.damage * layer.thickness / this.nominalThickness;
    }
    const surface = this.layers[0];
    const core = this.layers[this.layers.length - 1];
    this.sample.surfaceWater = clamp((surface.boundWater + surface.liquidWater) / surface.dryDensity, 0, 1);
    this.sample.coreWater = clamp((core.boundWater + core.liquidWater) / core.dryDensity, 0, 1);
    this.sample.boundWater = bound / Math.max(0.001, totalDry);
    this.sample.freeWater = liquid / Math.max(0.001, totalDry);
    this.sample.iceFraction = ice / Math.max(0.000001, bound + liquid + ice);
    this.sample.damage = damage;
    this.sample.waterMass = bound + liquid + ice + vapor;
    this.accumulatedDamage = Math.max(this.accumulatedDamage, damage);
    const expected = this.initialMass + this.enteredWater - this.leftWater;
    const rounding = this.sample.waterMass - expected;
    if (this.elapsed > 0 && Math.abs(rounding) < 0.000001) this.enteredWater += rounding;
  }

  private sorptionIsotherm(humidity: number, temperature: number, wetting: boolean): number {
    const activity = clamp(humidity, 0.001, 0.995);
    const kelvin = clamp(temperature + 273.15, 230, 340);
    const c = 8 * Math.exp(1200 * (1 / kelvin - 1 / 293.15));
    const k = 0.85;
    const numerator = c * k * activity;
    const denominator = (1 - k * activity) * (1 - k * activity + c * k * activity);
    const monolayer = this.substrate === "wood" ? 0.18 : 0.22;
    const hysteresis = wetting ? 0.93 : 1.07;
    return clamp(monolayer * numerator / Math.max(0.001, denominator) * hysteresis, 0, 1);
  }

  private capillaryPressure(layer: PorousLayer): number {
    const saturation = clamp(this.liquidSaturation(layer), 0.005, 0.999);
    const exponent = layer.retentionExponent;
    const m = 1 - 1 / exponent;
    const pressure = -layer.capillaryEntry * (saturation ** (-1 / m) - 1) ** (1 / exponent);
    return Math.max(-1500000, pressure);
  }

  private hydraulicMobility(layer: PorousLayer): number {
    const saturation = clamp(this.liquidSaturation(layer), 0.001, 1);
    const m = 1 - 1 / layer.retentionExponent;
    const relative = Math.sqrt(saturation) * (1 - (1 - saturation ** (1 / m)) ** m) ** 2;
    const iceBlockage = (1 - saturate(layer.ice / (layer.porosity * 917))) ** 4;
    const cracks = 1 + layer.damage * 20;
    return layer.permeability * relative * iceBlockage * cracks / this.waterViscosity(layer.temperature);
  }

  private liquidCapacity(layer: PorousLayer): number {
    return Math.max(0, (layer.porosity - layer.ice / 917) * 1000);
  }

  private liquidSaturation(layer: PorousLayer): number {
    return saturate(layer.liquidWater / Math.max(0.001, this.liquidCapacity(layer)));
  }

  private gasPorosity(layer: PorousLayer): number {
    return Math.max(0.01, layer.porosity - layer.liquidWater / 1000 - layer.ice / 917);
  }

  private waterActivity(layer: PorousLayer): number {
    if (layer.liquidWater > 0.01) {
      const saltFraction = layer.dissolvedSalt / Math.max(0.001, layer.liquidWater);
      return clamp(1 - saltFraction * 0.65, 0.6, 1);
    }
    const target = layer.boundWater / Math.max(0.001, layer.boundCapacity);
    let lower = 0;
    let upper = 1;
    for (let iteration = 0; iteration < 10; iteration++) {
      const middle = (lower + upper) * 0.5;
      if (this.sorptionIsotherm(middle, layer.temperature, this.wetting) < target) lower = middle;
      else upper = middle;
    }
    return (lower + upper) * 0.5;
  }

  private saturatedVaporDensity(temperature: number): number {
    const celsius = clamp(temperature, -45, 70);
    const pressure = 610.94 * Math.exp(17.625 * celsius / (celsius + 243.04));
    return pressure / (461.5 * (celsius + 273.15));
  }

  private waterViscosity(temperature: number): number {
    return 0.001792 * Math.exp(-0.025 * clamp(temperature, -2, 50));
  }
}
