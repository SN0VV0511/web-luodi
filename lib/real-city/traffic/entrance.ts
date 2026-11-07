export type EntranceOccupant = { x: number; y?: number; z: number };

export class EntrancePresence {
  private holdUntil = -Infinity;
  private lastSeconds: number | undefined;
  private openness = 0;
  private velocity = 0;

  constructor(readonly x: number, readonly y: number, readonly z: number, readonly radius = 2.6) {}

  update(seconds: number, occupants: readonly EntranceOccupant[]): number {
    if (this.lastSeconds === undefined || seconds < this.lastSeconds) {
      this.lastSeconds = seconds;
      this.openness = 0;
      this.velocity = 0;
      this.holdUntil = -Infinity;
    }
    const elapsed = Math.min(0.3, Math.max(0, seconds - this.lastSeconds));
    this.lastSeconds = seconds;
    for (const person of occupants) {
      if (person.y !== undefined && Math.abs(person.y - this.y) > 2.2) continue;
      const dx = person.x - this.x;
      const dz = person.z - this.z;
      if (dx * dx + dz * dz < this.radius * this.radius) this.holdUntil = seconds + 2.3;
    }
    const target = seconds < this.holdUntil ? 1 : 0;
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 60)));
    const dt = elapsed / steps;
    for (let index = 0; index < steps; index++) {
      const stiffness = target > this.openness ? 64 : this.openness < 0.15 ? 7 : 13;
      const damping = target > this.openness ? 13 : 7;
      const acceleration = (target - this.openness) * stiffness - this.velocity * damping;
      this.velocity += acceleration * dt;
      this.openness += this.velocity * dt;
      if (this.openness < 0) {
        this.openness = 0;
        this.velocity = 0;
      } else if (this.openness > 1.025) {
        this.openness = 1.025;
        this.velocity = Math.min(0, this.velocity);
      }
    }
    return this.openness;
  }
}

export class RevolvingEntranceMotion {
  private readonly presence: EntrancePresence;
  private lastSeconds: number | undefined;
  private rotation = 0;
  private speed = 0;

  constructor(x: number, y: number, z: number, readonly leafCount = 4) {
    this.presence = new EntrancePresence(x, y, z, 3.1);
  }

  update(seconds: number, occupants: readonly EntranceOccupant[]): number {
    if (this.lastSeconds === undefined || seconds < this.lastSeconds) {
      this.lastSeconds = seconds;
      this.rotation = 0;
      this.speed = 0;
    }
    const dt = Math.min(0.2, Math.max(0, seconds - this.lastSeconds));
    this.lastSeconds = seconds;
    const active = this.presence.update(seconds, occupants);
    const quadrant = Math.PI * 2 / this.leafCount;
    const remaining = quadrant - ((this.rotation % quadrant) + quadrant) % quadrant;
    const target = active > 0.05 ? 0.54 : remaining < 0.025 ? 0 : Math.min(0.38, remaining * 1.6);
    this.speed += (target - this.speed) * Math.min(1, dt * 3.5);
    const advance = this.speed * dt;
    if (active < 0.05 && advance > remaining) {
      this.rotation += remaining;
      this.speed = 0;
    } else this.rotation += advance;
    return this.rotation;
  }
}
