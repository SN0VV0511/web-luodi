import { describe, expect, it } from "vitest";
import type * as THREE from "three";
import { CityRenderQuality, frameBudget, initialAutoTier, shouldRenderFrame } from "./quality";

const renderer = (float = true) => ({ extensions: { has: (name: string) => float && name === "EXT_color_buffer_float" } }) as unknown as THREE.WebGLRenderer;

/** 以 hz 的显示器刷新率驱动 rAF，返回一秒内实际绘制的帧数。 */
function renderedPerSecond(hz: number, budget: number): number {
  let last = 0;
  let count = 0;
  for (let frame = 1; frame <= hz; frame++) {
    const now = 1000 + frame * (1000 / hz);
    if (shouldRenderFrame(now, last, budget)) {
      last = now;
      count++;
    }
  }
  return count;
}

describe("city render quality", () => {
  it("caps active rendering at 60fps and idle ambience at 30fps on 60Hz and 120Hz displays", () => {
    const quality = new CityRenderQuality(renderer(), false);
    quality.resize(1440, 900, 2);
    expect(renderedPerSecond(120, frameBudget(quality.state, true, true))).toBe(60);
    expect(renderedPerSecond(60, frameBudget(quality.state, true, true))).toBe(60);
    expect(renderedPerSecond(60, frameBudget(quality.state, false, true))).toBe(30);
    expect(renderedPerSecond(120, frameBudget(quality.state, false, true))).toBe(30);
    expect(renderedPerSecond(60, frameBudget(quality.state, false, false))).toBe(20);
  });

  it("keeps the explicit high preference at 60fps even while idle", () => {
    const quality = new CityRenderQuality(renderer(), false);
    quality.setPreference("high");
    expect(renderedPerSecond(60, frameBudget(quality.state, false, true))).toBe(60);
  });

  it("starts phones and small machines on the medium tier", () => {
    expect(initialAutoTier(true)).toBe("medium");
    expect(initialAutoTier(false, { deviceMemory: 4 })).toBe("medium");
    expect(initialAutoTier(false, { cores: 4 })).toBe("medium");
    expect(initialAutoTier(false, { deviceMemory: 8, cores: 8 })).toBe("high");
  });

  it("scales pixels, shadows and effects down through the tiers", () => {
    const quality = new CityRenderQuality(renderer(), false, { deviceMemory: 16, cores: 12 });
    quality.resize(1440, 900, 2);
    const high = { ...quality.state };
    expect(high.tier).toBe("high");
    expect(high.pixelRatio).toBeCloseTo(Math.min(1.5, Math.sqrt(2_000_000 / (1440 * 900))));
    expect(quality.setPreference("medium")).toBe(true);
    const medium = { ...quality.state };
    expect(medium.pixelRatio).toBeLessThan(high.pixelRatio);
    expect(medium.shadowSize).toBeLessThan(high.shadowSize);
    expect(medium.detailPixels).toBeGreaterThan(high.detailPixels);
    expect(medium.smallShadowCasters).toBe(false);
    quality.setPreference("low");
    expect(quality.state.pixelRatio).toBeLessThanOrEqual(1);
    expect(quality.state.bloom).toBe(false);
    expect(quality.state.contactShadows).toBe(false);
    expect(quality.state.godRays).toBe(false);
    expect(quality.state.wetReflections).toBe(false);
  });

  it("steps the auto tier down when frames stay slow, and never adapts a manual choice", () => {
    const quality = new CityRenderQuality(renderer(), false, { deviceMemory: 16, cores: 12 });
    quality.resize(1440, 900, 1);
    let now = 0;
    const run = (ms: number, seconds: number) => {
      for (let t = 0; t < seconds * 1000; t += ms) { now += ms; if (quality.observe(now, true)) return true; }
      return false;
    };
    // 100ms 一帧：先降分辨率，再降档。
    for (let i = 0; i < 6 && quality.state.tier === "high"; i++) run(100, 20);
    expect(quality.state.tier).toBe("medium");
    const manual = new CityRenderQuality(renderer(), false);
    manual.setPreference("high");
    manual.resize(1440, 900, 1);
    const before = { ...manual.state };
    now = 0;
    for (let t = 0; t < 60_000; t += 100) { now += 100; manual.observe(now, true); }
    expect(manual.state).toEqual(before);
  });
});
