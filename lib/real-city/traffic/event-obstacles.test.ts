import { describe, expect, it } from "vitest";
import { TrafficPedestrianAvoidance } from "./obstacles";
import { newTrafficState, type TrafficEnvironment, type TrafficSpecification } from "./types";
import { collectEventObstacles, clearEventObstacles, publishEventObstacles } from "./event-obstacles";

const spec = { length: 4.5, width: 1.8 } as TrafficSpecification;
const env = (obstacles: TrafficEnvironment["obstacles"]): TrafficEnvironment => ({ night: false, wetness: 0, snow: 0, temperature: 20, windX: 0, windZ: 0, obstacles });

function carHeadingNorth(speed = 8) {
  const state = newTrafficState();
  state.pose.x = 0; state.pose.z = 0; state.pose.directionX = 0; state.pose.directionZ = 1; state.pose.heading = 0;
  state.speed = speed;
  return state;
}

describe("event obstacles in traffic", () => {
  it("swerves and slows past a vehicle stopped at the curb instead of stopping", () => {
    const avoid = new TrafficPedestrianAvoidance(1);
    const state = carHeadingNorth();
    // 路边停车：车道中心右侧 1.85 m（左法线为 (dirZ, -dirX) = (1, 0)，因此右侧 x 为负）
    const gap = avoid.gap(0, state, spec, env([{ x: -1.85, z: 10, radius: 1.15, until: 99, passable: true, slow: 3 }]), 0);
    expect(gap).toBe(Infinity);
    expect(avoid.swerveTarget[0]).toBeGreaterThan(0.2);
    expect(avoid.speedCap[0]).toBeLessThan(8);
  });

  it("queues behind an event that blocks the whole lane", () => {
    const avoid = new TrafficPedestrianAvoidance(1);
    const state = carHeadingNorth();
    const gap = avoid.gap(0, state, spec, env([{ x: 0, z: 12, radius: 1.2, until: 99, passable: true, slow: 3 }]), 0);
    expect(gap).toBeLessThan(12);
  });

  it("crosses the centre line around a wide curbside event only when the oncoming lane is clear", () => {
    // 车道左法线 n = (1, 0)：中线在 x = -2.35，路缘在 +x。宽车辆停在路缘一侧，需要 ~1.6 m 横移（越过中线）。
    const wide = [{ x: 1.3, z: 6, radius: 1.6, until: 99, passable: true, slow: 3 }];
    const clear = new TrafficPedestrianAvoidance(2);
    const me = carHeadingNorth();
    const far = carHeadingNorth(8);
    far.pose.x = -4.7; far.pose.z = 160; far.pose.directionZ = -1;
    expect(clear.gap(0, me, spec, env(wide), 0, [me, far])).toBe(Infinity);
    expect(clear.swerveTarget[0]).toBeLessThan(-1.3);

    const blocked = new TrafficPedestrianAvoidance(2);
    const oncoming = carHeadingNorth(8);
    oncoming.pose.x = -4.7; oncoming.pose.z = 30; oncoming.pose.directionZ = -1;
    const gap = blocked.gap(0, me, spec, env(wide), 0, [me, oncoming]);
    expect(gap).toBeLessThan(6);
    expect(blocked.swerveTarget[0]).toBeGreaterThanOrEqual(-1.3);
  });

  it("collects published obstacles across sources", () => {
    publishEventObstacles("a", [{ x: 1, z: 2, radius: 1 }]);
    publishEventObstacles("b", [{ x: 3, z: 4, radius: 2, zone: true }]);
    expect(collectEventObstacles([]).length).toBe(2);
    expect(collectEventObstacles([], (o) => !o.zone).length).toBe(1);
    clearEventObstacles();
    expect(collectEventObstacles([]).length).toBe(0);
  });
});
