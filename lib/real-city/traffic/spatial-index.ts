import type { TrafficState } from "./types";

export class TrafficSpatialIndex {
  private readonly cells = new Map<number, number[]>();
  private readonly arrays: number[][] = [];
  private readonly seen: Uint32Array;
  private queryRevision = 0;
  private activeArrayCount = 0;

  constructor(readonly vehicleCount: number, readonly cellSize = 24) {
    this.seen = new Uint32Array(vehicleCount);
  }

  rebuild(states: readonly TrafficState[]): void {
    this.cells.clear();
    this.activeArrayCount = 0;
    for (let index = 0; index < states.length; index++) {
      const pose = states[index].pose;
      const column = Math.floor(pose.x / this.cellSize);
      const row = Math.floor(pose.z / this.cellSize);
      const key = this.cellKey(column, row);
      let occupants = this.cells.get(key);
      if (!occupants) {
        occupants = this.takeArray();
        this.cells.set(key, occupants);
      }
      occupants.push(index);
    }
  }

  query(x: number, z: number, radius: number, target: number[]): number[] {
    target.length = 0;
    this.queryRevision++;
    if (this.queryRevision >= 0xfffffff0) {
      this.queryRevision = 1;
      this.seen.fill(0);
    }
    const fromX = Math.floor((x - radius) / this.cellSize);
    const toX = Math.floor((x + radius) / this.cellSize);
    const fromZ = Math.floor((z - radius) / this.cellSize);
    const toZ = Math.floor((z + radius) / this.cellSize);
    for (let row = fromZ; row <= toZ; row++) {
      for (let column = fromX; column <= toX; column++) {
        const occupants = this.cells.get(this.cellKey(column, row));
        if (!occupants) continue;
        for (const index of occupants) {
          if (this.seen[index] === this.queryRevision) continue;
          this.seen[index] = this.queryRevision;
          target.push(index);
        }
      }
    }
    return target;
  }

  querySegment(fromX: number, fromZ: number, toX: number, toZ: number, padding: number, target: number[]): number[] {
    const x = (fromX + toX) * 0.5;
    const z = (fromZ + toZ) * 0.5;
    const radius = Math.hypot(toX - fromX, toZ - fromZ) * 0.5 + padding;
    return this.query(x, z, radius, target);
  }

  clear(): void {
    this.cells.clear();
    for (const occupants of this.arrays) occupants.length = 0;
    this.seen.fill(0);
    this.activeArrayCount = 0;
  }

  private takeArray(): number[] {
    const index = this.activeArrayCount++;
    let array = this.arrays[index];
    if (!array) {
      array = [];
      this.arrays[index] = array;
    }
    array.length = 0;
    return array;
  }

  private cellKey(column: number, row: number): number {
    return (column + 2048) * 4096 + row + 2048;
  }
}
