import * as THREE from "three";

/** 用户可选的画质档位；auto 根据设备与实测帧耗时在三档之间自动切换。 */
export type QualityPreference = "auto" | "high" | "medium" | "low";
export type QualityTier = "high" | "medium" | "low";

export type RenderQuality = {
  tier: QualityTier;
  pixelRatio: number;
  contactShadows: boolean;
  bloom: boolean;
  shadowSize: number;
  /** 晨昏体积光（半分辨率径向步进）。 */
  godRays: boolean;
  /** 夜间湿路面 / 水面屏幕空间反射。 */
  wetReflections: boolean;
  /** 近景玻璃与金属的局部立方体反射采集。 */
  localReflections: boolean;
  /** 建筑细部批次的最小屏幕投影尺寸（像素），低于此值的细部不绘制。 */
  detailPixels: number;
  /** 远景时人物、轮胎等细小动态物体是否仍投射阴影（子纹素级，几乎不可见）。 */
  smallShadowCasters: boolean;
  /** 无交互时的环境动画帧率上限；交互、飞行时使用 activeFps。 */
  idleFps: number;
  activeFps: number;
};

export type FrameTiming = {
  median: number;
  percentile90: number;
  samples: number;
};

type TierSettings = {
  ratio: number; compactRatio: number;
  pixels: number; compactPixels: number;
  shadow: number; compactShadow: number;
  effects: boolean; godRays: boolean; wet: boolean; local: boolean;
  detailPixels: number; smallShadowCasters: boolean;
};

export const QUALITY_TIERS: Record<QualityTier, TierSettings> = {
  high: {
    ratio: 1.5, compactRatio: 1.35, pixels: 2_000_000, compactPixels: 1_100_000,
    shadow: 1536, compactShadow: 1024, effects: true, godRays: true, wet: true, local: true,
    detailPixels: 0.85, smallShadowCasters: true,
  },
  medium: {
    ratio: 1.25, compactRatio: 1.2, pixels: 1_450_000, compactPixels: 820_000,
    shadow: 1024, compactShadow: 1024, effects: true, godRays: true, wet: true, local: false,
    detailPixels: 1.6, smallShadowCasters: false,
  },
  low: {
    ratio: 1, compactRatio: 1, pixels: 1_000_000, compactPixels: 560_000,
    shadow: 1024, compactShadow: 768, effects: false, godRays: false, wet: false, local: false,
    detailPixels: 2.6, smallShadowCasters: false,
  },
};

const TIER_ORDER: readonly QualityTier[] = ["low", "medium", "high"];

/** 自动档的起始档位：小屏、内存或核心数偏少的设备从中档起步，台式/笔记本从高档起步。 */
export function initialAutoTier(compact: boolean, hints: { deviceMemory?: number; cores?: number } = {}): QualityTier {
  if (compact) return "medium";
  if (hints.deviceMemory !== undefined && hints.deviceMemory <= 4) return "medium";
  if (hints.cores !== undefined && hints.cores <= 4) return "medium";
  return "high";
}

/** 帧率上限：交互时最多 60fps（高刷屏不再跑 120fps），空闲环境动画按档位降到 30fps，窗口失焦时 20fps。 */
export function frameBudget(state: RenderQuality, interacting: boolean, focused: boolean): number {
  const fps = interacting ? state.activeFps : focused ? state.idleFps : Math.min(state.idleFps, 20);
  return 1000 / fps;
}

/** 判断本次 rAF 是否应绘制：留 2.5ms 容差，使 60Hz 屏上 30fps、120Hz 屏上 60fps 都能稳定隔帧。 */
export function shouldRenderFrame(now: number, lastRendered: number, budget: number): boolean {
  return lastRendered <= 0 || now - lastRendered >= budget - 2.5;
}

export class CityRenderQuality {
  private readonly durations = new Float32Array(90);
  private readonly sorted = new Float32Array(90);
  private sampleCount = 0;
  private sampleCursor = 0;
  private slowWindows = 0;
  private fastWindows = 0;
  private changedAt = 0;
  private evaluatedAt = 0;
  private previousFrame = 0;
  private resolutionScale = 1;
  private width = 1;
  private height = 1;
  private deviceRatio = 1;
  private effects = true;
  private preferenceValue: QualityPreference = "auto";
  private autoTier: QualityTier;
  private readonly compact: boolean;
  private readonly hasFloatTargets: boolean;
  readonly state: RenderQuality;

  constructor(renderer: THREE.WebGLRenderer, compact: boolean, hints: { deviceMemory?: number; cores?: number } = {}) {
    this.compact = compact;
    this.hasFloatTargets = renderer.extensions.has("EXT_color_buffer_float");
    this.autoTier = initialAutoTier(compact, hints);
    this.state = {
      tier: this.autoTier,
      pixelRatio: 1,
      contactShadows: this.hasFloatTargets,
      bloom: this.hasFloatTargets,
      shadowSize: 1024,
      godRays: true,
      wetReflections: true,
      localReflections: true,
      detailPixels: 0.85,
      smallShadowCasters: true,
      idleFps: 30,
      activeFps: 60,
    };
    this.recalculate();
  }

  get preference(): QualityPreference {
    return this.preferenceValue;
  }

  /** 切换档位；返回 true 表示渲染参数有变化，调用方需同步像素比、阴影贴图等。 */
  setPreference(preference: QualityPreference): boolean {
    if (preference === this.preferenceValue) return false;
    this.preferenceValue = preference;
    this.resolutionScale = 1;
    this.effects = true;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.resetSamples();
    return this.recalculate();
  }

  resize(width: number, height: number, deviceRatio: number): boolean {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.deviceRatio = Math.max(0.5, Math.min(4, deviceRatio));
    const changed = this.recalculate();
    this.resetSamples();
    return changed;
  }

  observe(now: number, animationActive: boolean, gpuMilliseconds = 0): boolean {
    if (!animationActive) {
      this.previousFrame = 0;
      return false;
    }
    if (this.previousFrame === 0) {
      this.previousFrame = now;
      return false;
    }
    const milliseconds = now - this.previousFrame;
    this.previousFrame = now;
    if (milliseconds <= 0 || milliseconds > 2000) return false;
    // 手动档位不做自适应：用户的选择优先。
    if (this.preferenceValue !== "auto") return false;
    this.durations[this.sampleCursor] = Math.min(milliseconds, 250);
    this.sampleCursor = (this.sampleCursor + 1) % this.durations.length;
    this.sampleCount = Math.min(this.sampleCount + 1, this.durations.length);
    if (this.sampleCount < 60 || now - this.evaluatedAt < 2000) return false;
    this.evaluatedAt = now;
    const timing = this.timing();
    // 帧间隔会被帧率上限拉长：以当前上限对应的间隔为基准判断是否“慢”。
    const target = 1000 / this.state.idleFps;
    const slow = timing.median > Math.max(29, target * 1.45) || timing.percentile90 > Math.max(45, target * 1.9) || gpuMilliseconds > 24;
    const fast = timing.median < Math.max(18.5, target * 1.12) && timing.percentile90 < Math.max(23, target * 1.3)
      && (gpuMilliseconds <= 0 || gpuMilliseconds < 14);
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    this.fastWindows = fast ? this.fastWindows + 1 : 0;
    if (now - this.changedAt < 6000) return false;
    const tierIndex = TIER_ORDER.indexOf(this.autoTier);
    if (this.slowWindows >= 2) {
      if (this.resolutionScale > 0.75) {
        this.resolutionScale = Math.max(0.75, this.resolutionScale - 0.12);
      } else if (tierIndex > 0) {
        this.autoTier = TIER_ORDER[tierIndex - 1];
        this.resolutionScale = 1;
      } else if (this.resolutionScale > 0.62) {
        this.resolutionScale = Math.max(0.62, this.resolutionScale - 0.13);
      } else if (this.effects) {
        this.effects = false;
      } else {
        return false;
      }
    } else if (this.fastWindows >= 5) {
      if (!this.effects) {
        this.effects = true;
      } else if (this.resolutionScale < 1) {
        this.resolutionScale = Math.min(1, this.resolutionScale + 0.06);
      } else if (gpuMilliseconds > 0 && gpuMilliseconds < 8 && tierIndex < TIER_ORDER.length - 1
        && !(this.compact && TIER_ORDER[tierIndex + 1] === "high")) {
        // 只有拿到 GPU 计时且余量充足时才升档，避免在无法测量的设备上来回抖动。
        this.autoTier = TIER_ORDER[tierIndex + 1];
      } else {
        return false;
      }
    } else {
      return false;
    }
    this.changedAt = now;
    this.slowWindows = 0;
    this.fastWindows = 0;
    this.resetSamples();
    return this.recalculate();
  }

  timing(): FrameTiming {
    const count = this.sampleCount;
    if (count === 0) return { median: 0, percentile90: 0, samples: 0 };
    this.sorted.set(this.durations.subarray(0, count));
    const values = this.sorted.subarray(0, count);
    values.sort();
    return {
      median: values[Math.floor((count - 1) * 0.5)],
      percentile90: values[Math.floor((count - 1) * 0.9)],
      samples: count,
    };
  }

  suspend(): void {
    this.previousFrame = 0;
    this.resetSamples();
  }

  private recalculate(): boolean {
    const tier = this.preferenceValue === "auto" ? this.autoTier : this.preferenceValue;
    const settings = QUALITY_TIERS[tier];
    const maximumPixels = this.compact ? settings.compactPixels : settings.pixels;
    const maximumRatio = this.compact ? settings.compactRatio : settings.ratio;
    const pixelCap = Math.sqrt(maximumPixels / (this.width * this.height));
    const ratio = Math.min(this.deviceRatio, maximumRatio, pixelCap) * this.resolutionScale;
    const effects = this.hasFloatTargets && this.effects && settings.effects;
    const next: RenderQuality = {
      tier,
      pixelRatio: ratio,
      contactShadows: effects,
      bloom: effects,
      shadowSize: this.compact ? settings.compactShadow : settings.shadow,
      godRays: this.hasFloatTargets && settings.godRays && this.effects,
      wetReflections: effects && settings.wet,
      localReflections: effects && settings.local,
      detailPixels: settings.detailPixels,
      smallShadowCasters: settings.smallShadowCasters,
      idleFps: this.preferenceValue === "high" ? 60 : 30,
      activeFps: 60,
    };
    const state = this.state;
    const changed = Math.abs(next.pixelRatio - state.pixelRatio) > 0.005
      || (Object.keys(next) as (keyof RenderQuality)[]).some((key) => key !== "pixelRatio" && next[key] !== state[key]);
    Object.assign(state, next);
    return changed;
  }

  private resetSamples(): void {
    this.sampleCount = 0;
    this.sampleCursor = 0;
  }
}
