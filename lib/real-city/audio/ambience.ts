/**
 * 城市环境音（默认静音，由底栏按钮开启）：全部用 WebAudio 实时合成，不加载任何音频文件。
 *  - 城市底噪：低通布朗噪声（远处车流 / 空调外机），镜头越低、越靠近街道越响；
 *  - 风 / 海浪：带通噪声 + 0.08–0.12 Hz 的缓慢起伏，靠近海边或升到高空时加强；
 *  - 白天鸟鸣：随机的短促正弦滑音；夜晚蟋蟀：高频脉冲；
 *  - 雨：高通噪声，随降水强度渐入。
 */
export type AmbienceMix = {
  night: boolean;
  rain: number;
  /** 镜头离地高度（米）。 */
  height: number;
  /** 0..1：离海 / 湖的接近程度。 */
  water: number;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export class CityAmbience {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private city: GainNode | null = null;
  private wind: GainNode | null = null;
  private waves: GainNode | null = null;
  private rain: GainNode | null = null;
  private crickets: GainNode | null = null;
  private birdsLevel = 0;
  private birdTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = false;

  get active(): boolean {
    return this.enabled;
  }

  async enable(): Promise<void> {
    if (this.enabled) return;
    const Context = typeof window !== "undefined" ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Context) return;
    this.enabled = true;
    if (!this.context) this.build(new Context());
    const context = this.context!;
    if (context.state === "suspended") await context.resume().catch(() => undefined);
    this.master!.gain.setTargetAtTime(0.55, context.currentTime, 0.8);
    this.scheduleBird();
  }

  disable(): void {
    this.enabled = false;
    if (this.birdTimer) clearTimeout(this.birdTimer);
    this.birdTimer = null;
    const context = this.context;
    if (!context || !this.master) return;
    this.master.gain.setTargetAtTime(0, context.currentTime, 0.25);
    setTimeout(() => { if (!this.enabled) context.suspend().catch(() => undefined); }, 900);
  }

  update(mix: AmbienceMix): void {
    const context = this.context;
    if (!context || !this.enabled) return;
    const t = context.currentTime;
    const altitude = clamp01((mix.height - 8) / 140);
    const street = 1 - altitude;
    this.city!.gain.setTargetAtTime((mix.night ? 0.32 : 0.5) * (0.35 + street * 0.65) * (1 - mix.water * 0.5), t, 1.2);
    this.wind!.gain.setTargetAtTime(0.06 + altitude * 0.32 + mix.rain * 0.1, t, 1.5);
    this.waves!.gain.setTargetAtTime(mix.water * 0.55, t, 1.2);
    this.rain!.gain.setTargetAtTime(clamp01(mix.rain) * 0.42, t, 1.5);
    this.crickets!.gain.setTargetAtTime(mix.night && mix.rain < 0.2 ? 0.05 * (0.4 + street * 0.6) : 0, t, 2);
    this.birdsLevel = mix.night || mix.rain > 0.3 ? 0 : 0.12 * (0.3 + street * 0.7) * (1 - mix.water * 0.3);
  }

  dispose(): void {
    this.disable();
    this.context?.close().catch(() => undefined);
    this.context = null;
  }

  private noise(context: AudioContext, colour: "white" | "brown"): AudioBufferSourceNode {
    const length = context.sampleRate * 4;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (colour === "white") data[i] = white;
      else { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; }
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    return source;
  }

  private build(context: AudioContext): void {
    this.context = context;
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);
    this.master = master;
    const layer = (colour: "white" | "brown", filter: BiquadFilterType, frequency: number, q = 0.7) => {
      const source = this.noise(context, colour);
      const biquad = context.createBiquadFilter();
      biquad.type = filter;
      biquad.frequency.value = frequency;
      biquad.Q.value = q;
      const gain = context.createGain();
      gain.gain.value = 0;
      source.connect(biquad).connect(gain).connect(master);
      source.start();
      return { gain, biquad };
    };
    this.city = layer("brown", "lowpass", 420).gain;
    const wind = layer("white", "bandpass", 520, 0.6);
    this.wind = wind.gain;
    // 风声的“呼呼”起伏：调制带通中心频率
    const windLfo = context.createOscillator();
    windLfo.frequency.value = 0.11;
    const windDepth = context.createGain();
    windDepth.gain.value = 260;
    windLfo.connect(windDepth).connect(wind.biquad.frequency);
    windLfo.start();
    // 海浪：低通噪声按 ~9 s 周期涨落
    const waves = layer("brown", "lowpass", 900);
    const swell = context.createGain();
    swell.gain.value = 0.5;
    waves.gain.disconnect();
    waves.gain.connect(swell).connect(master);
    const waveLfo = context.createOscillator();
    waveLfo.frequency.value = 0.11;
    const waveDepth = context.createGain();
    waveDepth.gain.value = 0.45;
    waveLfo.connect(waveDepth).connect(swell.gain);
    waveLfo.start();
    this.waves = waves.gain;
    this.rain = layer("white", "highpass", 2600).gain;
    // 蟋蟀：4.4 kHz 正弦，经 ~18 Hz 方波门控的颤音
    const cricket = context.createOscillator();
    cricket.frequency.value = 4400;
    const chirpGate = context.createGain();
    chirpGate.gain.value = 0;
    const chirp = context.createOscillator();
    chirp.type = "square";
    chirp.frequency.value = 18;
    const chirpDepth = context.createGain();
    chirpDepth.gain.value = 0.5;
    chirp.connect(chirpDepth).connect(chirpGate.gain);
    const crickets = context.createGain();
    crickets.gain.value = 0;
    cricket.connect(chirpGate).connect(crickets).connect(master);
    cricket.start();
    chirp.start();
    this.crickets = crickets;
  }

  private scheduleBird(): void {
    if (!this.enabled) return;
    this.birdTimer = setTimeout(() => {
      this.chirp();
      this.scheduleBird();
    }, 900 + Math.random() * 3800);
  }

  private chirp(): void {
    const context = this.context;
    if (!context || !this.master || this.birdsLevel <= 0.001) return;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2400 + Math.random() * 2200;
    const pan = context.createStereoPanner();
    pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.master);
    for (let n = 0; n < notes; n++) {
      const start = context.currentTime + n * (0.09 + Math.random() * 0.05);
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base * (1 + Math.random() * 0.15), start);
      osc.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.6), start + 0.07);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(this.birdsLevel, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.08);
      osc.connect(gain).connect(pan);
      osc.start(start);
      osc.stop(start + 0.1);
    }
  }
}
