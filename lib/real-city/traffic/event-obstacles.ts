/**
 * 城市事件 → 交通 / 行人的共享障碍登记表。
 * 事件导演（快递卸货、交警拦停、出租车接客、消防 / 急救 / 抢修现场、集会人群）每帧发布自己占用的
 * 路面与草坪区域；交通引擎据此减速、绕行或排队，行人则绕开这些区域。
 */
export type EventObstacle = {
  x: number;
  z: number;
  radius: number;
  /** 路过车辆的谨慎限速（m/s）；未设置则只绕行不减速。 */
  slow?: number;
  /** 草坪 / 广场上的人群区域：只影响行人，不进入交通引擎。 */
  zone?: boolean;
};

const sources = new Map<string, readonly EventObstacle[]>();

export function publishEventObstacles(source: string, obstacles: readonly EventObstacle[]): void {
  sources.set(source, obstacles);
}

export function collectEventObstacles(out: EventObstacle[], filter?: (o: EventObstacle) => boolean): EventObstacle[] {
  out.length = 0;
  for (const list of sources.values()) for (const o of list) if (!filter || filter(o)) out.push(o);
  return out;
}

export function clearEventObstacles(): void {
  sources.clear();
}
