import { MathUtils } from "three";

export const LEG_LENGTH = { thigh: 0.43, calf: 0.43 } as const;
export type WalkingLeg = { thigh: number; calf: number; ankleY: number; ankleZ: number; footPitch: number; planted: boolean };

/**
 * 按支撑相和摆动相求解两段腿部，支撑脚保持鞋底贴地。
 * phase 为弧度、speed 为米/秒、hipY 为局部髋高、cadence 为弧度/秒；可复用 target 避免逐帧分配。
 */
export function sampleWalkingLeg(phase: number, speed: number, hipY: number, cadence: number, target?: WalkingLeg): WalkingLeg {
  if (!Number.isFinite(phase) || !Number.isFinite(speed) || !Number.isFinite(hipY) || !Number.isFinite(cadence)
    || speed < 0 || hipY <= 0.1 || cadence <= 0) {
    throw new RangeError("步态参数必须有限，速度非负，髋高和步频为正");
  }
  const result = target ?? { thigh: 0, calf: 0, ankleY: 0, ankleZ: 0, footPitch: 0, planted: true };
  const cycle = MathUtils.euclideanModulo(phase, Math.PI * 2) / (Math.PI * 2);
  const support = 0.62;
  const halfStride = Math.min(0.28, speed * (Math.PI * 2 / cadence) * support / 2);
  const swing = MathUtils.clamp((cycle - support) / (1 - support), 0, 1);
  const moving = Math.min(1, speed / 0.25);
  const ankleZ = cycle < support ? halfStride * (1 - 2 * cycle / support)
    : MathUtils.lerp(-halfStride, halfStride, MathUtils.smoothstep(swing, 0, 1));
  const ankleY = 0.095 + Math.sin(swing * Math.PI) * 0.095 * moving;
  const vertical = hipY - ankleY;
  const { thigh, calf } = LEG_LENGTH;
  const distance = MathUtils.clamp(Math.hypot(vertical, ankleZ), Math.abs(thigh - calf) + 0.001, thigh + calf - 0.001);
  const offset = Math.acos(MathUtils.clamp((thigh ** 2 + distance ** 2 - calf ** 2) / (2 * thigh * distance), -1, 1));
  result.thigh = -Math.atan2(ankleZ, vertical) - offset;
  result.calf = result.thigh + Math.PI - Math.acos(MathUtils.clamp((thigh ** 2 + calf ** 2 - distance ** 2) / (2 * thigh * calf), -1, 1));
  result.ankleY = hipY - Math.cos(result.thigh) * thigh - Math.cos(result.calf) * calf;
  result.ankleZ = -Math.sin(result.thigh) * thigh - Math.sin(result.calf) * calf;
  result.planted = cycle < support || speed === 0;
  result.footPitch = result.planted ? 0 : Math.sin(swing * Math.PI * 2) * 0.16 * moving;
  return result;
}
