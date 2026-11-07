import * as THREE from "three";
import { FixedStepClock } from "../physics/clock";

export type DriveThroughCar = {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  speed: number;
  acceleration: number;
  travelled: number;
  station: number;
  serviceRemaining: number;
  orderNumber: number;
  braking: boolean;
};

type Station = {
  distance: number;
  duration: number;
  occupant: number;
  served: number;
};

type InternalCar = {
  absoluteDistance: number;
  nextStations: Float64Array;
  nextStation: number;
  nextStop: number;
  currentStation: number;
  lastService: number;
};

export class DriveThroughTraffic {
  readonly cars: DriveThroughCar[];
  readonly length: number;
  private readonly clock = new FixedStepClock(1 / 60, 12);
  private readonly internal: InternalCar[];
  private readonly stations: Station[];
  private readonly nextSpeed: Float64Array;
  private readonly nextTravel: Float64Array;
  private windowOpen = 0;
  private orderCounter = 100;

  constructor(readonly curve: THREE.CatmullRomCurve3, count: number) {
    this.length = curve.getLength();
    const vehicleCount = Math.max(1, Math.min(6, Math.floor(count)));
    this.cars = Array.from({ length: vehicleCount }, () => ({
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(0, 0, 1),
      speed: 0,
      acceleration: 0,
      travelled: 0,
      station: -1,
      serviceRemaining: 0,
      orderNumber: 0,
      braking: false,
    }));
    this.stations = [
      { distance: this.parameterDistance(0.3), duration: 4.8, occupant: -1, served: 0 },
      { distance: this.parameterDistance(0.4), duration: 6.2, occupant: -1, served: 0 },
    ];
    this.internal = this.cars.map(() => ({
      absoluteDistance: 0,
      nextStations: new Float64Array(this.stations.length),
      nextStation: 0,
      nextStop: 0,
      currentStation: -1,
      lastService: -1,
    }));
    this.nextSpeed = new Float64Array(vehicleCount);
    this.nextTravel = new Float64Array(vehicleCount);
    this.reset();
  }

  update(seconds: number): readonly DriveThroughCar[] {
    const result = this.clock.advance(seconds, (dt, time) => this.step(dt, time));
    if (result.reset) this.reset();
    return this.cars;
  }

  get pickupWindowOpen(): number {
    return this.windowOpen;
  }

  get completedOrders(): number {
    return this.stations[1].served;
  }

  private reset(): void {
    for (const station of this.stations) {
      station.occupant = -1;
      station.served = 0;
    }
    this.windowOpen = 0;
    this.orderCounter = 100;
    for (let index = 0; index < this.cars.length; index++) {
      const car = this.cars[index];
      const internal = this.internal[index];
      internal.absoluteDistance = index / this.cars.length * this.length;
      internal.currentStation = -1;
      internal.lastService = -1;
      car.speed = 0;
      car.acceleration = 0;
      car.travelled = 0;
      car.station = -1;
      car.serviceRemaining = 0;
      car.orderNumber = 0;
      car.braking = false;
      for (let stationIndex = 0; stationIndex < this.stations.length; stationIndex++) {
        let distance = this.stations[stationIndex].distance;
        if (distance < internal.absoluteDistance + 0.5) distance += this.length;
        internal.nextStations[stationIndex] = distance;
      }
      this.chooseNextStation(index);
      this.sampleCar(index);
    }
  }

  private step(dt: number, seconds: number): void {
    for (let index = 0; index < this.cars.length; index++) {
      const car = this.cars[index];
      const internal = this.internal[index];
      this.nextSpeed[index] = 0;
      this.nextTravel[index] = 0;
      if (internal.currentStation >= 0) {
        car.serviceRemaining = Math.max(0, car.serviceRemaining - dt);
        if (car.serviceRemaining === 0) this.finishService(index, seconds);
        continue;
      }
      let gap = Infinity;
      let leadingSpeed = 4.2;
      for (let other = 0; other < this.cars.length; other++) {
        if (other === index) continue;
        let ahead = (this.internal[other].absoluteDistance - internal.absoluteDistance) % this.length;
        if (ahead <= 0) ahead += this.length;
        const bumperGap = ahead - 5;
        if (bumperGap < gap) {
          gap = Math.max(0, bumperGap);
          leadingSpeed = this.cars[other].speed;
        }
      }
      const stationGap = internal.nextStop - internal.absoluteDistance;
      if (stationGap < gap) {
        gap = Math.max(0, stationGap + 1.1);
        leadingSpeed = 0;
      }
      const closing = car.speed - leadingSpeed;
      const desiredGap = 1.1 + Math.max(0, car.speed * 0.8 + car.speed * closing / (2 * Math.sqrt(1.2 * 1.8)));
      const following = Number.isFinite(gap) ? (desiredGap / Math.max(0.05, gap)) ** 2 : 0;
      let acceleration = 1.2 * (1 - (car.speed / 4.2) ** 4 - following);
      acceleration = Math.max(-3.2, Math.min(1.2, acceleration));
      if (gap > car.speed * car.speed / 5 + 0.5) {
        acceleration = Math.max(car.acceleration - dt * 3, Math.min(car.acceleration + dt * 2, acceleration));
      }
      let speed = Math.max(0, car.speed + acceleration * dt);
      let advance = (speed + car.speed) * dt * 0.5;
      if (advance > Math.max(0, gap - 0.1)) {
        advance = Math.max(0, gap - 0.1);
        speed = Math.max(0, advance / dt);
      }
      if (stationGap < 0.08 && car.speed < 0.16 && this.stations[internal.nextStation].occupant < 0) {
        this.beginService(index, seconds);
        speed = 0;
        advance = 0;
      }
      this.nextSpeed[index] = speed;
      this.nextTravel[index] = advance;
    }
    for (let index = 0; index < this.cars.length; index++) {
      const car = this.cars[index];
      const internal = this.internal[index];
      car.acceleration = (this.nextSpeed[index] - car.speed) / dt;
      car.speed = this.nextSpeed[index];
      car.braking = car.acceleration < -0.2;
      car.travelled += this.nextTravel[index];
      internal.absoluteDistance += this.nextTravel[index];
      this.sampleCar(index);
    }
    const servingPickup = this.stations[1].occupant >= 0;
    const target = servingPickup ? 1 : 0;
    const rate = servingPickup ? 2.4 : 1.6;
    this.windowOpen += Math.sign(target - this.windowOpen) * Math.min(Math.abs(target - this.windowOpen), dt * rate);
  }

  private chooseNextStation(index: number): void {
    const internal = this.internal[index];
    let nearest = Infinity;
    let station = 0;
    for (let candidate = 0; candidate < internal.nextStations.length; candidate++) {
      if (internal.nextStations[candidate] >= nearest) continue;
      nearest = internal.nextStations[candidate];
      station = candidate;
    }
    internal.nextStop = nearest;
    internal.nextStation = station;
  }

  private beginService(index: number, seconds: number): void {
    const car = this.cars[index];
    const internal = this.internal[index];
    const station = this.stations[internal.nextStation];
    station.occupant = index;
    internal.currentStation = internal.nextStation;
    internal.lastService = seconds;
    car.station = internal.currentStation;
    car.serviceRemaining = station.duration + ((index + station.served) % 3) * 0.7;
    if (internal.currentStation === 0) car.orderNumber = ++this.orderCounter;
  }

  private finishService(index: number, seconds: number): void {
    const internal = this.internal[index];
    const stationIndex = internal.currentStation;
    if (stationIndex < 0) return;
    const station = this.stations[stationIndex];
    station.occupant = -1;
    station.served++;
    internal.nextStations[stationIndex] += this.length;
    internal.currentStation = -1;
    internal.lastService = seconds;
    this.cars[index].station = -1;
    this.chooseNextStation(index);
  }

  private sampleCar(index: number): void {
    const internal = this.internal[index];
    const car = this.cars[index];
    const distance = ((internal.absoluteDistance % this.length) + this.length) % this.length;
    const fraction = distance / this.length;
    this.curve.getPointAt(fraction, car.position);
    this.curve.getTangentAt(fraction, car.tangent);
  }

  private parameterDistance(parameter: number): number {
    const lengths = this.curve.getLengths(600);
    const position = parameter * 600;
    const lower = Math.floor(position);
    const upper = Math.min(600, lower + 1);
    return THREE.MathUtils.lerp(lengths[lower], lengths[upper], position - lower);
  }
}
