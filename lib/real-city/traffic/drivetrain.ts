import { aerodynamicResistance, tireFriction } from "./specifications";
import type { TrafficEnvironment, TrafficSpecification, TrafficState } from "./types";

export type VehicleAdvance = {
  speed: number;
  acceleration: number;
  metres: number;
};

export class VehicleDrivetrain {
  private readonly result: VehicleAdvance = { speed: 0, acceleration: 0, metres: 0 };
  private shiftTime = 0;
  private wiperTravel = 0;

  constructor(readonly specification: TrafficSpecification, readonly driverIndex: number) {}

  integrate(state: TrafficState, requestedAcceleration: number, maximumTravel: number, environment: TrafficEnvironment, dt: number): VehicleAdvance {
    const specification = this.specification;
    const friction = tireFriction(environment);
    const resistance = aerodynamicResistance(state.speed, state.pose.directionX, state.pose.directionZ, specification, environment);
    const rolling = state.speed > 0.01 ? specification.rollingResistance * specification.mass * 9.80665 : 0;
    const availablePower = specification.enginePower * (this.shiftTime > 0 ? 0.45 : 1);
    const forceByPower = availablePower / Math.max(2, state.speed);
    const forceByGrip = specification.mass * 9.80665 * friction;
    const driveLimit = Math.min(specification.driveForce, forceByPower, forceByGrip * 0.65);
    const brakeLimit = Math.min(specification.brakeForce, forceByGrip);
    const maxAcceleration = Math.max(0.1, (driveLimit - resistance - rolling) / specification.mass);
    const maxBraking = Math.max(0.5, (brakeLimit + resistance + rolling) / specification.mass);
    let requested = Math.max(-maxBraking, Math.min(maxAcceleration, requestedAcceleration));
    const urgent = maximumTravel < state.speed * state.speed / (2 * maxBraking) + state.speed * 0.25;
    if (!urgent) {
      const jerk = specification.maximumJerk * dt;
      requested = Math.max(state.acceleration - jerk, Math.min(state.acceleration + jerk, requested));
    }
    let speed = Math.max(0, state.speed + requested * dt);
    let metres = Math.max(0, (state.speed + speed) * dt * 0.5);
    const allowed = Math.max(0, maximumTravel - 0.15);
    if (metres > allowed) {
      metres = allowed;
      speed = Math.max(0, 2 * metres / dt - state.speed);
    }
    this.result.speed = speed;
    this.result.metres = metres;
    this.result.acceleration = (speed - state.speed) / dt;
    state.throttle = Math.max(0, Math.min(1, requested / maxAcceleration));
    state.braking = Math.max(0, Math.min(1, -this.result.acceleration / maxBraking));
    state.lateralAcceleration = speed * speed * state.pose.curvature;
    state.stoppedSeconds = speed < 0.08 ? state.stoppedSeconds + dt : 0;
    this.updateGear(state, dt);
    this.updateWeatherEquipment(state, environment, dt);
    return this.result;
  }

  reset(): void {
    this.shiftTime = 0;
    this.wiperTravel = 0;
  }

  private updateGear(state: TrafficState, dt: number): void {
    const specification = this.specification;
    const rotations = state.speed / (Math.PI * 2 * specification.wheelRadius) * 60;
    const ratios = specification.gearRatios;
    this.shiftTime = Math.max(0, this.shiftTime - dt);
    const currentGear = Math.max(0, Math.min(ratios.length - 1, state.gear - 1));
    const predicted = rotations * ratios[currentGear] * specification.finalDrive;
    const upshiftRpm = specification.maximumRpm * (state.throttle > 0.7 ? 0.67 : 0.45);
    const downshiftRpm = specification.idleRpm * 1.4;
    if (this.shiftTime === 0) {
      if (predicted > upshiftRpm && state.gear < ratios.length) {
        state.gear++;
        this.shiftTime = 0.42;
      } else if (predicted < downshiftRpm && state.gear > 1) {
        state.gear--;
        this.shiftTime = 0.32;
      }
    }
    const ratio = ratios[Math.max(0, Math.min(ratios.length - 1, state.gear - 1))];
    const target = Math.max(specification.idleRpm, rotations * ratio * specification.finalDrive + state.throttle * 450);
    const clamped = Math.min(specification.maximumRpm, target);
    state.engineRpm += (clamped - state.engineRpm) * (1 - Math.exp(-dt * 8));
  }

  private updateWeatherEquipment(state: TrafficState, environment: TrafficEnvironment, dt: number): void {
    const wetTarget = Math.max(environment.wetness, environment.snow * 0.3);
    state.wetTires += (wetTarget - state.wetTires) * (1 - Math.exp(-dt * 0.7));
    state.spray = Math.max(0, state.wetTires - 0.25) * Math.min(1, state.speed / 10);
    if (wetTarget > 0.2) {
      const frequency = wetTarget > 0.65 ? 1.25 : wetTarget > 0.4 ? 0.8 : 0.35;
      this.wiperTravel += dt * frequency;
      const cycle = this.wiperTravel % 1;
      state.wiperPhase = cycle < 0.5 ? Math.sin(cycle * Math.PI * 2) : 0;
    } else {
      this.wiperTravel = 0;
      state.wiperPhase += (0 - state.wiperPhase) * Math.min(1, dt * 6);
    }
    const headlightTarget = environment.night ? 1 : wetTarget > 0.6 ? 0.5 : 0.12;
    state.headlightStrength += (headlightTarget - state.headlightStrength) * Math.min(1, dt * 4);
  }
}
