import * as THREE from "three";

type TimerExtension = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

type PendingQuery = {
  query: WebGLQuery;
  frame: number;
};

export class CityGpuTimer {
  private readonly gl: WebGL2RenderingContext;
  private readonly extension: TimerExtension | null;
  private readonly pending: PendingQuery[] = [];
  private readonly durations = new Float32Array(16);
  private readonly sorted = new Float32Array(16);
  private active: WebGLQuery | null = null;
  private frame = 0;
  private count = 0;
  private cursor = 0;
  private latest = 0;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer) {
    const context = renderer.getContext();
    this.gl = context as WebGL2RenderingContext;
    this.extension = "beginQuery" in context
      ? this.gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExtension | null
      : null;
  }

  begin(): void {
    if (this.disposed || !this.extension || this.gl.isContextLost()) return;
    this.frame++;
    this.poll();
    if (this.active || this.pending.length >= 4 || this.frame % 3 !== 0) return;
    if (this.gl.getQuery(this.extension.TIME_ELAPSED_EXT, this.gl.CURRENT_QUERY)) return;
    const query = this.gl.createQuery();
    if (!query) return;
    this.active = query;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
  }

  end(): void {
    if (!this.active || !this.extension) return;
    if (this.gl.isContextLost()) {
      this.active = null;
      return;
    }
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push({ query: this.active, frame: this.frame });
    this.active = null;
  }

  get milliseconds(): number {
    return this.latest;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.active && this.extension && !this.gl.isContextLost()) {
      this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
      this.gl.deleteQuery(this.active);
    }
    this.active = null;
    this.clearPending();
  }

  private poll(): void {
    if (!this.extension) return;
    const disjoint = this.gl.getParameter(this.extension.GPU_DISJOINT_EXT);
    if (disjoint) {
      this.clearPending();
      this.count = 0;
      this.cursor = 0;
      this.latest = 0;
      return;
    }
    let changed = false;
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const pending = this.pending[index];
      const available = this.gl.getQueryParameter(pending.query, this.gl.QUERY_RESULT_AVAILABLE);
      if (!available) {
        if (this.frame - pending.frame > 240) {
          this.gl.deleteQuery(pending.query);
          this.pending.splice(index, 1);
        }
        continue;
      }
      const nanoseconds = this.gl.getQueryParameter(pending.query, this.gl.QUERY_RESULT) as number;
      this.gl.deleteQuery(pending.query);
      this.pending.splice(index, 1);
      const milliseconds = nanoseconds / 1_000_000;
      if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 1000) continue;
      this.durations[this.cursor] = milliseconds;
      this.cursor = (this.cursor + 1) % this.durations.length;
      this.count = Math.min(this.count + 1, this.durations.length);
      changed = true;
    }
    if (!changed || this.count < 4) return;
    this.sorted.set(this.durations.subarray(0, this.count));
    const samples = this.sorted.subarray(0, this.count);
    samples.sort();
    this.latest = samples[Math.floor((this.count - 1) * 0.65)];
  }

  private clearPending(): void {
    for (const pending of this.pending) this.gl.deleteQuery(pending.query);
    this.pending.length = 0;
  }
}
