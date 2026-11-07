import * as THREE from "three";
import type { SeasonId } from "../../city-physics";
import { clamp, createRandom, smoothstep, wrap } from "../physics/math";

export type FrontKind = "sea-breeze" | "passing-shower" | "cold-front" | "dry-gust" | "snow-band" | "coastal-mist";
export type WeatherFront = {
  kind: FrontKind;
  center: THREE.Vector2;
  direction: THREE.Vector2;
  width: number;
  length: number;
  speed: number;
  duration: number;
  phase: number;
  intensity: number;
  seed: number;
};
export type FrontInfluence = {
  temperature: number;
  humidity: number;
  rain: number;
  snow: number;
  windX: number;
  windZ: number;
  cloud: number;
  gust: number;
  mist: number;
};

export class CoastalWeatherFronts {
  readonly fronts: WeatherFront[] = [];
  private season: SeasonId = "spring";
  private epoch = -1;
  private previousSeconds: number | undefined;
  private readonly delta = new THREE.Vector2();

  update(seconds: number, season: SeasonId): void {
    const epoch = Math.floor(Math.max(0, seconds) / 96);
    if (epoch !== this.epoch || season !== this.season || (this.previousSeconds !== undefined && seconds < this.previousSeconds)) {
      this.epoch = epoch;
      this.season = season;
      this.rebuild(epoch, season);
    }
    this.previousSeconds = seconds;
  }

  sample(x: number, z: number, seconds: number, result: FrontInfluence): FrontInfluence {
    result.temperature = 0;
    result.humidity = 0;
    result.rain = 0;
    result.snow = 0;
    result.windX = 0;
    result.windZ = 0;
    result.cloud = 0;
    result.gust = 0;
    result.mist = 0;
    const localTime = wrap(seconds, 96);
    for (const front of this.fronts) {
      const age = localTime - front.phase;
      if (age < 0 || age > front.duration) continue;
      const progress = age / front.duration;
      const envelope = smoothstep(0, 0.15, progress) * (1 - smoothstep(0.72, 1, progress));
      const centerX = front.center.x + front.direction.x * front.speed * age;
      const centerZ = front.center.y + front.direction.y * front.speed * age;
      this.delta.set(x - centerX, z - centerZ);
      const along = this.delta.dot(front.direction) / front.length;
      const across = (this.delta.x * front.direction.y - this.delta.y * front.direction.x) / front.width;
      const coverage = Math.exp(-(along * along + across * across) * 1.6) * envelope * front.intensity;
      if (coverage < 0.0005) continue;
      switch (front.kind) {
        case "sea-breeze":
          result.temperature -= coverage * 1.1;
          result.humidity += coverage * 0.08;
          result.windX += front.direction.x * coverage * 1.4;
          result.windZ += front.direction.y * coverage * 1.4;
          result.cloud += coverage * 0.05;
          break;
        case "passing-shower":
          result.temperature -= coverage * 1.8;
          result.humidity += coverage * 0.19;
          result.rain += coverage * 0.42;
          result.cloud += coverage * 0.26;
          result.gust += coverage * 0.6;
          break;
        case "cold-front":
          result.temperature -= coverage * 2.8;
          result.humidity += coverage * 0.11;
          result.rain += coverage * 0.2;
          result.cloud += coverage * 0.18;
          result.windX += front.direction.x * coverage * 2;
          result.windZ += front.direction.y * coverage * 2;
          result.gust += coverage * 0.75;
          break;
        case "dry-gust":
          result.temperature += coverage * 0.7;
          result.humidity -= coverage * 0.12;
          result.cloud -= coverage * 0.08;
          result.windX += front.direction.x * coverage * 2.1;
          result.windZ += front.direction.y * coverage * 2.1;
          result.gust += coverage;
          break;
        case "snow-band":
          result.temperature -= coverage * 1.6;
          result.humidity += coverage * 0.14;
          result.snow += coverage * 0.4;
          result.cloud += coverage * 0.26;
          result.gust += coverage * 0.4;
          break;
        case "coastal-mist":
          result.temperature -= coverage * 0.65;
          result.humidity += coverage * 0.23;
          result.cloud += coverage * 0.09;
          result.mist += coverage * 0.6;
          break;
      }
    }
    result.rain = clamp(result.rain, 0, 0.65);
    result.snow = clamp(result.snow, 0, 0.65);
    result.cloud = clamp(result.cloud, -0.15, 0.45);
    result.humidity = clamp(result.humidity, -0.2, 0.3);
    result.gust = clamp(result.gust, 0, 1.2);
    return result;
  }

  currentKinds(seconds: number): FrontKind[] {
    const time = wrap(seconds, 96);
    return this.fronts.filter(front => time >= front.phase && time <= front.phase + front.duration).map(front => front.kind);
  }

  private rebuild(epoch: number, season: SeasonId): void {
    this.fronts.length = 0;
    const seasonSeed = season === "spring" ? 113 : season === "summer" ? 271 : season === "autumn" ? 409 : 557;
    const random = createRandom(87631 + epoch * 137 + seasonSeed);
    for (let index = 0; index < 3; index++) {
      const choice = random();
      const kind: FrontKind = season === "summer"
        ? choice < 0.55 ? "passing-shower" : "sea-breeze"
        : season === "winter"
          ? choice < 0.6 ? "snow-band" : "coastal-mist"
          : season === "autumn"
            ? choice < 0.55 ? "dry-gust" : "cold-front"
            : choice < 0.4 ? "passing-shower" : choice < 0.75 ? "sea-breeze" : "coastal-mist";
      const angle = kind === "sea-breeze" ? -Math.PI / 2 + (random() - 0.5) * 0.5 : -0.2 + (random() - 0.5) * 1.2;
      this.fronts.push({
        kind,
        center: new THREE.Vector2(-160 + random() * 200, kind === "sea-breeze" ? 150 : -160 + random() * 220),
        direction: new THREE.Vector2(Math.cos(angle), Math.sin(angle)),
        width: 50 + random() * 80,
        length: 110 + random() * 120,
        speed: 1.8 + random() * 2.4,
        duration: 27 + random() * 20,
        phase: index * 22 + random() * 5,
        intensity: 0.45 + random() * 0.45,
        seed: seasonSeed + index,
      });
    }
  }
}

export function createFrontInfluence(): FrontInfluence {
  return { temperature: 0, humidity: 0, rain: 0, snow: 0, windX: 0, windZ: 0, cloud: 0, gust: 0, mist: 0 };
}
