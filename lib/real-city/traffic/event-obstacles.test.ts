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

  it("collects published obstacles across sources", () => {
    publishEventObstacles("a", [{ x: 1, z: 2, radius: 1 }]);
    publishEventObstacles("b", [{ x: 3, z: 4, radius: 2, zone: true }]);
    expect(collectEventObstacles([]).length).toBe(2);
    expect(collectEventObstacles([], (o) => !o.zone).length).toBe(1);
    clearEventObstacles();
    expect(collectEventObstacles([]).length).toBe(0);
  });
});
