import { describe, expect, it } from "vitest";
import { LEG_LENGTH, sampleWalkingLeg, type WalkingLeg } from "./city-gait";

describe("两段腿部步态", () => {
  it.each([0.6, 0.9, 1.1])("速度 %s 的支撑脚贴地，摆动脚抬起且关节保持固定长度", (speed) => {
    let lifted = false;
    for (let step = 0; step < 120; step++) {
      const phase = step / 120 * Math.PI * 2;
      const hipY = 0.89 + Math.abs(Math.cos(phase)) * 0.015;
      const pose = sampleWalkingLeg(phase, speed, hipY, 4.7 + speed * 2.3);
      const kneeY = hipY - Math.cos(pose.thigh) * LEG_LENGTH.thigh;
      const kneeZ = -Math.sin(pose.thigh) * LEG_LENGTH.thigh;
      expect(Math.hypot(hipY - kneeY, kneeZ)).toBeCloseTo(LEG_LENGTH.thigh, 8);
      expect(Math.hypot(kneeY - pose.ankleY, kneeZ - pose.ankleZ)).toBeCloseTo(LEG_LENGTH.calf, 8);
      expect(pose.ankleY).toBeGreaterThanOrEqual(0.095 - 1e-8);
      if (pose.planted) {
        expect(pose.ankleY).toBeCloseTo(0.095, 8);
        expect(pose.footPitch).toBe(0);
      } else lifted ||= pose.ankleY > 0.16;
    }
    expect(lifted).toBe(true);
  });

  it("周期接缝连续、暂停可重复，调用方可以复用同一姿态对象", () => {
    const target: WalkingLeg = { thigh: 0, calf: 0, ankleY: 0, ankleZ: 0, footPitch: 0, planted: true };
    const pose = sampleWalkingLeg(1.3, 0.9, 0.9, 6.8, target);
    expect(pose).toBe(target);
    expect({ ...pose }).toEqual(sampleWalkingLeg(1.3, 0.9, 0.9, 6.8));
    const before = sampleWalkingLeg(-0.00001, 0.9, 0.9, 6.8);
    const after = sampleWalkingLeg(0.00001, 0.9, 0.9, 6.8);
    expect(before.ankleY).toBeCloseTo(after.ankleY, 4);
    expect(before.ankleZ).toBeCloseTo(after.ankleZ, 4);
    expect(before.thigh).toBeCloseTo(after.thigh, 4);
  });

  it("驻足时不抬脚，极远目标被限制在腿长范围内而不是产生 NaN", () => {
    const idle = sampleWalkingLeg(5, 0, 0.89, 6);
    expect(idle.planted).toBe(true);
    expect(idle.ankleY).toBeCloseTo(0.095, 8);
    expect(idle.ankleZ).toBeCloseTo(0, 8);
    const far = sampleWalkingLeg(2, 4, 3, 1);
    expect([far.thigh, far.calf, far.ankleY, far.ankleZ].every(Number.isFinite)).toBe(true);
  });

  it.each([
    [NaN, 1, 0.9, 6], [0, -1, 0.9, 6], [0, 1, 0, 6], [0, 1, 0.9, 0], [Infinity, 1, 0.9, 6],
  ])("非法步态参数 %j 明确报错", (phase, speed, hipY, cadence) => {
    expect(() => sampleWalkingLeg(phase, speed, hipY, cadence)).toThrow(RangeError);
  });
});
