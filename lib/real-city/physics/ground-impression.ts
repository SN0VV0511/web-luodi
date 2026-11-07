import { clamp, saturate } from "./math";

export type ImpressionGround = {
  snowDepth: number;
  snowDensity: number;
  snowStrength: number;
  bearingStrength: number;
  saturation: number;
  temperature: number;
  waterDepth: number;
  wetness: number;
  roughness: number;
};

export type ImpressionWeather = {
  rainfall: number;
  snowfall: number;
  temperature: number;
  humidity: number;
  windSpeed: number;
  evaporation: number;
};

export type ImpressionState = {
  indentation: number;
  permanentDepth: number;
  elasticDepth: number;
  rimHeight: number;
  heelDepth: number;
  toeDepth: number;
  width: number;
  length: number;
  water: number;
  ice: number;
  density: number;
  darkness: number;
  contrast: number;
  sharpness: number;
  age: number;
  visible: boolean;
};

type PressureNode = {
  x: number;
  z: number;
  weight: number;
  elastic: number;
  plastic: number;
  maxPressure: number;
};

export class GroundImpression {
  readonly state: ImpressionState = {
    indentation: 0,
    permanentDepth: 0,
    elasticDepth: 0,
    rimHeight: 0,
    heelDepth: 0,
    toeDepth: 0,
    width: 0.12,
    length: 0.28,
    water: 0,
    ice: 0,
    density: 120,
    darkness: 0,
    contrast: 0,
    sharpness: 1,
    age: 0,
    visible: false,
  };
  private readonly nodes: PressureNode[] = [];
  private isSnow = false;
  private originalDepth = 0;
  private yieldStrength = 50000;
  private elasticModulus = 800000;
  private creepRate = 0.01;
  private permeability = 0.000001;
  private saturation = 0;
  private dryDensity = 1200;
  private relaxation = 0.4;
  private shearDisplacement = 0;
  private cohesiveFraction = 0;
  private displacedVolume = 0;
  private initialContrast = 0;

  constructor() {
    const columns = 3;
    const rows = 7;
    for (let row = 0; row < rows; row++) {
      const z = (row / (rows - 1) - 0.5) * 0.28;
      const heel = row < 2;
      const arch = row === 3;
      for (let column = 0; column < columns; column++) {
        const x = (column / (columns - 1) - 0.5) * (heel ? 0.09 : 0.12);
        const edge = column === 1 ? 1 : 0.78;
        const longitudinal = heel ? 1.35 : arch ? 0.2 : row === 5 ? 1.1 : 0.85;
        this.nodes.push({ x, z, weight: edge * longitudinal, elastic: 0, plastic: 0, maxPressure: 0 });
      }
    }
    const total = this.nodes.reduce((sum, node) => sum + node.weight, 0);
    for (const node of this.nodes) node.weight /= total;
  }

  apply(ground: ImpressionGround, force: number, contactTime: number, slip: number): ImpressionState {
    this.reset();
    this.isSnow = ground.snowDepth > 0.002;
    this.originalDepth = this.isSnow ? ground.snowDepth : 0.12;
    this.saturation = saturate(ground.saturation);
    this.dryDensity = this.isSnow ? clamp(ground.snowDensity, 50, 600) : 1350 + this.saturation * 140;
    this.state.density = this.dryDensity;
    this.yieldStrength = Math.max(500, this.isSnow ? ground.snowStrength : ground.bearingStrength);
    this.elasticModulus = this.isSnow
      ? Math.max(12000, 9.5e8 * (this.dryDensity / 917) ** 4)
      : Math.max(100000, this.yieldStrength * (12 - this.saturation * 7));
    this.permeability = this.isSnow ? 0.00008 * (1 - this.dryDensity / 917) ** 3 : 0.000004 * (1 - this.saturation * 0.9);
    this.cohesiveFraction = this.isSnow ? saturate((ground.temperature + 8) / 12) : this.saturation * 0.7;
    this.relaxation = this.isSnow ? 0.15 + this.dryDensity / 1000 : 0.4 + (1 - this.saturation) * 0.8;
    this.creepRate = this.isSnow ? 0.008 * Math.exp(clamp(ground.temperature / 12, -3, 1)) : 0.001 + this.saturation * 0.003;
    this.shearDisplacement = clamp(slip, -0.08, 0.08);
    const load = clamp(force, 50, 2400);
    const duration = clamp(contactTime, 0.03, 1.2);
    const cellArea = this.state.width * this.state.length / this.nodes.length;
    for (const node of this.nodes) {
      const pressure = load * node.weight / cellArea;
      this.loadNode(node, pressure, duration);
    }
    this.aggregate();
    this.state.water = Math.min(ground.waterDepth, Math.max(0.0001, this.state.indentation));
    const snowContrast = saturate(this.state.indentation / Math.max(0.002, ground.snowDepth));
    const transferredFilm = clamp(ground.wetness, 0, 1) * 0.65;
    const wetContrast = Math.max(transferredFilm, saturate(ground.waterDepth * 250 + this.saturation * 0.8));
    this.initialContrast = this.isSnow ? Math.max(0.18, snowContrast) : wetContrast;
    this.state.contrast = this.initialContrast;
    this.state.darkness = this.isSnow ? 0.16 + snowContrast * 0.35 : 0.25 + wetContrast * 0.5;
    this.state.sharpness = clamp(1 - ground.roughness * 3, 0.3, 1);
    this.state.visible = this.initialContrast > 0.04;
    return this.state;
  }

  step(dt: number, weather: ImpressionWeather): ImpressionState {
    if (!this.state.visible || dt <= 0 || !Number.isFinite(dt)) return this.state;
    const elapsed = Math.min(0.5, dt);
    this.state.age += elapsed;
    const climateTime = elapsed * 12;
    this.recover(elapsed, weather);
    this.fill(climateTime, weather);
    this.phaseChange(climateTime, weather);
    this.erode(climateTime, weather);
    this.aggregate();
    this.appearance(weather);
    return this.state;
  }

  reset(): void {
    for (const node of this.nodes) {
      node.elastic = 0;
      node.plastic = 0;
      node.maxPressure = 0;
    }
    this.state.indentation = 0;
    this.state.permanentDepth = 0;
    this.state.elasticDepth = 0;
    this.state.rimHeight = 0;
    this.state.heelDepth = 0;
    this.state.toeDepth = 0;
    this.state.width = 0.12;
    this.state.length = 0.28;
    this.state.water = 0;
    this.state.ice = 0;
    this.state.density = 120;
    this.state.darkness = 0;
    this.state.contrast = 0;
    this.state.sharpness = 1;
    this.state.age = 0;
    this.state.visible = false;
    this.displacedVolume = 0;
    this.initialContrast = 0;
  }

  private loadNode(node: PressureNode, pressure: number, duration: number): void {
    node.maxPressure = Math.max(node.maxPressure, pressure);
    const strainedDepth = Math.min(this.originalDepth, 0.06);
    const elasticStrain = pressure / this.elasticModulus;
    node.elastic = Math.min(strainedDepth * 0.18, elasticStrain * strainedDepth);
    const excess = Math.max(0, pressure - this.yieldStrength);
    if (excess <= 0) return;
    const compressibility = this.isSnow ? 0.35 : 0.12;
    const hardening = this.isSnow ? 1.6 : 2.4;
    const strain = compressibility * Math.log1p(excess / this.yieldStrength) / hardening;
    const viscous = 1 - Math.exp(-duration * (this.isSnow ? 18 : 8));
    const maximum = this.originalDepth * (this.isSnow ? 0.65 : 0.12);
    node.plastic = Math.min(maximum, strainedDepth * strain * viscous);
    const shearWork = Math.abs(this.shearDisplacement) * pressure;
    const shearIndentation = shearWork / Math.max(10000, this.yieldStrength) * 0.018;
    node.plastic = Math.min(maximum, node.plastic + shearIndentation * (1 - this.cohesiveFraction * 0.5));
    const lateral = node.plastic * (this.isSnow ? 0.18 : 0.4) * (1 - this.saturation * 0.4);
    this.displacedVolume += lateral * this.state.width * this.state.length / this.nodes.length;
  }

  private recover(dt: number, weather: ImpressionWeather): void {
    const frozen = this.state.ice > 0.0002;
    const recovery = Math.exp(-dt * this.relaxation * (frozen ? 0.03 : 1));
    const thermal = Math.exp(clamp((weather.temperature - 5) / 20, -2, 2));
    const creep = this.creepRate * thermal * dt;
    for (const node of this.nodes) {
      node.elastic *= recovery;
      const restored = Math.min(node.plastic, node.plastic * creep * (this.isSnow ? 0.2 : 0.05));
      node.plastic -= restored;
    }
    const rimSlump = dt * 0.015 * (1 - this.cohesiveFraction * 0.75) * (frozen ? 0.05 : 1);
    this.displacedVolume *= Math.exp(-rimSlump);
  }

  private fill(dt: number, weather: ImpressionWeather): void {
    const rainDepth = weather.rainfall * 0.000032 * dt;
    const snowDepth = weather.snowfall * 0.00011 * dt;
    if (snowDepth > 0) {
      for (const node of this.nodes) node.plastic = Math.max(0, node.plastic - snowDepth);
      this.state.sharpness *= Math.exp(-snowDepth * 150);
    }
    this.state.water += rainDepth;
    const head = this.state.water + 0.002;
    const infiltration = this.permeability * (1 - this.saturation) * head / 0.02 * dt;
    const evaporation = weather.evaporation * 0.00002 * dt;
    this.state.water = Math.max(0, this.state.water - infiltration - evaporation);
    this.state.water = Math.min(this.state.water, Math.max(0.00005, this.state.indentation));
    this.saturation = clamp(this.saturation + infiltration * 40 - evaporation * 10, 0, 1);
  }

  private phaseChange(dt: number, weather: ImpressionWeather): void {
    if (weather.temperature < -0.2) {
      const frozen = Math.min(this.state.water, -weather.temperature * 0.000004 * dt);
      this.state.water -= frozen;
      this.state.ice += frozen * 1000 / 917;
      this.state.sharpness = Math.min(1, this.state.sharpness + frozen * 12);
    } else {
      const melted = Math.min(this.state.ice, Math.max(0, weather.temperature) * 0.000006 * dt);
      this.state.ice -= melted;
      this.state.water += melted * 917 / 1000;
    }
    if (!this.isSnow || weather.temperature <= 0) return;
    const melt = weather.temperature * 0.000004 * dt;
    for (const node of this.nodes) node.plastic = Math.max(0, node.plastic - melt);
    this.originalDepth = Math.max(0.0001, this.originalDepth - melt);
    this.state.water += melt * this.state.density / 1000;
  }

  private erode(dt: number, weather: ImpressionWeather): void {
    const rainErosion = weather.rainfall * dt * 0.000015 * (1 - this.cohesiveFraction * 0.65);
    const windThreshold = this.isSnow ? 4 + this.state.density * 0.008 : 8 + this.saturation * 8;
    const windErosion = Math.max(0, weather.windSpeed - windThreshold) ** 2 * dt * 0.0000007;
    const erosion = rainErosion + windErosion;
    if (erosion <= 0) return;
    const average = this.nodes.reduce((sum, node) => sum + node.plastic, 0) / this.nodes.length;
    for (const node of this.nodes) {
      const smoothing = (average - node.plastic) * saturate(erosion * 100);
      node.plastic = Math.max(0, node.plastic + smoothing - erosion * 0.2);
    }
    this.state.sharpness *= Math.exp(-erosion * 160);
    this.displacedVolume *= Math.exp(-erosion * 250);
  }

  private aggregate(): void {
    let permanent = 0;
    let elastic = 0;
    let heel = 0;
    let toe = 0;
    let heelWeight = 0;
    let toeWeight = 0;
    for (const node of this.nodes) {
      permanent += node.plastic * node.weight;
      elastic += node.elastic * node.weight;
      if (node.z < -0.05) {
        heel += (node.plastic + node.elastic) * node.weight;
        heelWeight += node.weight;
      } else if (node.z > 0.04) {
        toe += (node.plastic + node.elastic) * node.weight;
        toeWeight += node.weight;
      }
    }
    this.state.permanentDepth = permanent;
    this.state.elasticDepth = elastic;
    this.state.indentation = permanent + elastic;
    this.state.heelDepth = heel / Math.max(0.001, heelWeight);
    this.state.toeDepth = toe / Math.max(0.001, toeWeight);
    const rimArea = 2 * (this.state.width + this.state.length) * 0.018;
    this.state.rimHeight = Math.min(0.018, this.displacedVolume / rimArea);
    this.state.width = 0.12 + permanent * 0.5;
    this.state.length = 0.28 + Math.abs(this.shearDisplacement) * 0.7;
    const compression = this.originalDepth / Math.max(this.originalDepth * 0.2, this.originalDepth - permanent);
    this.state.density = Math.min(this.isSnow ? 650 : 1900, this.dryDensity * compression);
  }

  private appearance(weather: ImpressionWeather): void {
    const snowRelief = saturate(this.state.indentation / 0.008);
    const waterRelief = saturate(this.state.water / 0.001);
    const moisture = saturate(this.saturation + waterRelief * 0.5);
    const dryDecay = Math.exp(-this.state.age * (0.035 + weather.evaporation * 0.04));
    const snowDecay = Math.exp(-this.state.age * (0.006 + weather.snowfall * 0.05));
    this.state.contrast = this.isSnow
      ? this.initialContrast * snowRelief * snowDecay
      : this.initialContrast * dryDecay * (0.3 + moisture * 0.7);
    this.state.darkness = this.isSnow
      ? 0.2 + snowRelief * 0.35 - saturate(this.state.ice * 300) * 0.1
      : 0.25 + moisture * 0.5;
    this.state.contrast *= 0.35 + this.state.sharpness * 0.65;
    this.state.visible = this.state.contrast > 0.015 && this.state.age < 180;
  }
}
