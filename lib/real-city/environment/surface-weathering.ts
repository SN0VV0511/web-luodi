import * as THREE from "three";
import type { EnvironmentContext, EnvironmentLayer } from "./context";
import { MaterialWeathering, type MaterialExposure, type WeatheringSubstrate } from "../physics/material-weathering";
import { bindWeatheredSurface, type WeatheredMaterialBinding } from "./weathered-material-shader";
import { createAerosolSample } from "./aerosol-field";
import { createMicroclimateSample } from "./urban-microclimate";
import { clamp } from "../physics/math";

type WeatheringBinding = {
  model: MaterialWeathering;
  binding: WeatheredMaterialBinding;
  x: number;
  z: number;
  shelter: number;
};

export function buildSurfaceWeatheringLayer(context: EnvironmentContext): EnvironmentLayer {
  const { resources, weather } = context;
  const bindings: WeatheringBinding[] = [];
  resources.forEachMaterial((name, material) => {
    if (!(material instanceof THREE.MeshStandardMaterial)) return;
    const substrate = identifySubstrate(name);
    if (!substrate) return;
    const marine = name.includes("marine") || name.includes("mooring") || name.includes("floating");
    const protectedSurface = name.includes("jacket") || name.includes("trousers") || name.includes("boots");
    bindings.push({
      model: new MaterialWeathering(substrate, marine ? 4.5 : protectedSurface ? 1 : 2.3),
      binding: bindWeatheredSurface(material, substrate),
      x: marine ? 145 : name.includes("garden") ? 20 : -80,
      z: marine ? 132 : name.includes("garden") ? 25 : 40,
      shelter: protectedSurface ? 0.35 : 0.08,
    });
  });
  const exposure: MaterialExposure = {
    temperature: 18,
    humidity: 0.6,
    rain: 0,
    snow: 0,
    sun: 0.8,
    wind: 2,
    salt: 0,
    dust: 0,
    pressure: 101325,
    shelter: 0,
  };
  const aerosol = createAerosolSample();
  const microclimate = createMicroclimateSample();
  let lastSeconds: number | undefined;
  let accumulated = 0;
  return {
    update(seconds) {
      if (lastSeconds === undefined || seconds < lastSeconds) {
        lastSeconds = seconds;
        for (const entry of bindings) entry.binding.update(entry.model.state, seconds);
        return;
      }
      const dt = clamp(seconds - lastSeconds, 0, 0.5);
      lastSeconds = seconds;
      accumulated += dt;
      if (accumulated < 0.25) return;
      const step = accumulated * 36;
      accumulated = 0;
      for (const entry of bindings) {
        weather.microclimate?.sample(entry.x, entry.z, microclimate);
        weather.aerosols?.sample(entry.x, entry.z, aerosol);
        exposure.temperature = weather.state.temperature + microclimate.temperatureOffset;
        exposure.humidity = clamp(weather.state.humidity + microclimate.humidityOffset, 0, 1);
        exposure.rain = weather.localRain(entry.x, entry.z, seconds);
        exposure.snow = weather.localSnow(entry.x, entry.z, seconds);
        exposure.sun = weather.state.sunExposure * (1 - microclimate.shade);
        exposure.wind = weather.state.windSpeed * (1 - microclimate.windShelter * 0.7);
        exposure.salt = aerosol.seaSalt;
        exposure.dust = aerosol.mineralDust + aerosol.soot;
        exposure.pressure = weather.state.pressure * 100;
        exposure.shelter = entry.shelter;
        entry.model.step(step, exposure);
        entry.binding.update(entry.model.state, seconds);
      }
    },
    reset() {
      lastSeconds = undefined;
      accumulated = 0;
      for (const entry of bindings) entry.model.reset();
    },
    dispose() {
      for (const entry of bindings) entry.binding.restore();
    },
  };
}

function identifySubstrate(name: string): WeatheringSubstrate | undefined {
  if (name.includes("steel") || name.includes("cast iron")) return "steel";
  if (name.includes("aluminium") || name.includes("stainless") || name.includes("flag pole")) return "aluminium";
  if (name.includes("zinc")) return "zinc";
  if (name.includes("timber") || name.includes("tool handles")) return "wood";
  if (name.includes("enamel") || name.includes("vehicle paint")) return "paint";
  if (name.includes("rubber") || name.includes("boots")) return "rubber";
  if (name.includes("woven") || name.includes("jacket") || name.includes("trousers")) return "fabric";
  if (name.includes("paper")) return "paper";
  if (name.includes("rope")) return "rope";
  return undefined;
}
