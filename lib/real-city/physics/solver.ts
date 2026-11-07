import * as THREE from "three";
import { RigidBody } from "./body";
import { createContact, createGroundSample, type Contact, type StaticCollider, StaticCollisionWorld } from "./colliders";
import { orientedBoxContact, orientedBoxCorners, sphereOrientedBoxContact, type OrientedBox } from "./oriented-contact";
import { BoxContactManifold } from "./contact-manifold";
import { ContactConstraintSystem, type ContactConstraintInput } from "./contact-constraints";
import { EPSILON } from "./math";

export type SolverStatistics = {
  contacts: number;
  sleeping: number;
  awake: number;
  pairTests: number;
  persistent: number;
  iterations: number;
  frictionWork: number;
  maximumPenetration: number;
};

export class ContactSolver {
  readonly statistics: SolverStatistics = {
    contacts: 0,
    sleeping: 0,
    awake: 0,
    pairTests: 0,
    persistent: 0,
    iterations: 0,
    frictionWork: 0,
    maximumPenetration: 0,
  };
  private readonly contact = createContact();
  private readonly pairContact = createContact();
  private readonly ground = createGroundSample();
  private readonly corners: THREE.Vector3[] = [];
  private readonly colliderBoxes = new Map<number, OrientedBox>();
  private readonly manifold = new BoxContactManifold();
  private readonly constraints: ContactConstraintSystem;
  private readonly bodyBoxA: OrientedBox = { center: new THREE.Vector3(), halfExtents: new THREE.Vector3(), rotation: new THREE.Quaternion() };
  private readonly bodyBoxB: OrientedBox = { center: new THREE.Vector3(), halfExtents: new THREE.Vector3(), rotation: new THREE.Quaternion() };
  private readonly delta = new THREE.Vector3();
  private readonly upward = new THREE.Vector3(0, 1, 0);
  private readonly contactPoint = new THREE.Vector3();
  private readonly groundCandidates = Array.from({ length: 8 }, () => ({
    point: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    penetration: 0,
    wetness: 0,
    feature: 0,
    material: "concrete" as ReturnType<typeof createGroundSample>["material"],
  }));

  constructor(readonly collisionWorld: StaticCollisionWorld, readonly maximumContacts = 192) {
    this.constraints = new ContactConstraintSystem(maximumContacts);
  }

  solve(bodies: readonly RigidBody[], dt: number): void {
    this.statistics.contacts = 0;
    this.statistics.sleeping = 0;
    this.statistics.awake = 0;
    this.statistics.pairTests = 0;
    this.constraints.begin(dt);
    for (const body of bodies) {
      if (!body.enabled) continue;
      if (body.sleeping) this.statistics.sleeping++;
      else this.statistics.awake++;
      this.collectGround(body);
      if (this.statistics.contacts >= this.maximumContacts) break;
      this.collectStatic(body);
    }
    for (let first = 0; first < bodies.length && this.statistics.contacts < this.maximumContacts; first++) {
      const a = bodies[first];
      if (!a.enabled) continue;
      for (let second = first + 1; second < bodies.length && this.statistics.contacts < this.maximumContacts; second++) {
        const b = bodies[second];
        if (!b.enabled || (a.sleeping && b.sleeping)) continue;
        const range = a.boundingRadius + b.boundingRadius;
        if (Math.abs(a.position.x - b.position.x) > range) continue;
        if (Math.abs(a.position.z - b.position.z) > range) continue;
        if (Math.abs(a.position.y - b.position.y) > range) continue;
        this.statistics.pairTests++;
        if (!this.bodyContact(a, b, this.pairContact)) continue;
        if (a.sleeping !== b.sleeping) {
          a.wake();
          b.wake();
        }
        if (a.shape.kind === "box" && b.shape.kind === "box") {
          this.bodyBox(a, this.bodyBoxA);
          this.bodyBox(b, this.bodyBoxB);
          this.manifold.build(this.bodyBoxA, this.bodyBoxB, this.pairContact);
          for (let index = 0; index < this.manifold.count; index++) {
            const point = this.manifold.points[index];
            this.add({
              body: a,
              other: b,
              point: point.position,
              normal: this.pairContact.normal,
              penetration: point.penetration,
              surface: b.material,
              wetness: Math.max(a.wetness, b.wetness),
              collider: -2,
              feature: point.feature,
            });
          }
        } else {
          this.add({
            body: a,
            other: b,
            point: this.pairContact.point,
            normal: this.pairContact.normal,
            penetration: this.pairContact.penetration,
            surface: b.material,
            wetness: Math.max(a.wetness, b.wetness),
            collider: -2,
            feature: 0,
          });
        }
      }
    }
    this.constraints.solve(8);
    const result = this.constraints.statistics;
    this.statistics.persistent = result.persistent;
    this.statistics.iterations = result.iterations;
    this.statistics.frictionWork = result.frictionWork;
    this.statistics.maximumPenetration = result.maximumPenetration;
  }

  reset(): void {
    this.constraints.reset();
    this.colliderBoxes.clear();
  }

  private collectGround(body: RigidBody): void {
    if (!body.groundCollision) return;
    if (body.shape.kind === "sphere") {
      if (!this.collisionWorld.sphereGround(body.position, body.shape.radius, this.contact)) return;
      if (body.sleeping) {
        body.supported = this.contact.normal.y > 0.55;
        return;
      }
      this.add({
        body,
        point: this.contact.point,
        normal: this.contact.normal,
        penetration: this.contact.penetration,
        surface: this.contact.material,
        wetness: Math.max(body.wetness, this.contact.wetness),
        collider: -1,
        feature: 0,
      });
      return;
    }
    this.bodyBox(body, this.bodyBoxA);
    orientedBoxCorners(this.bodyBoxA, this.corners);
    let count = 0;
    for (let index = 0; index < this.corners.length; index++) {
      const corner = this.corners[index];
      this.collisionWorld.sampleGround(corner.x, corner.z, this.ground);
      const penetration = this.ground.height - corner.y;
      if (penetration < -0.0005) continue;
      if (body.sleeping) {
        body.supported = true;
        return;
      }
      const candidate = this.groundCandidates[count++];
      candidate.point.set(corner.x, this.ground.height, corner.z);
      candidate.normal.copy(this.ground.normal);
      candidate.penetration = Math.max(0, penetration);
      candidate.wetness = this.ground.wetness;
      candidate.material = this.ground.material;
      candidate.feature = index;
    }
    for (let index = 0; index < count && index < 4; index++) {
      let deepest = index;
      for (let next = index + 1; next < count; next++) {
        if (this.groundCandidates[next].penetration > this.groundCandidates[deepest].penetration) deepest = next;
      }
      if (deepest !== index) {
        const swap = this.groundCandidates[index];
        this.groundCandidates[index] = this.groundCandidates[deepest];
        this.groundCandidates[deepest] = swap;
      }
      const point = this.groundCandidates[index];
      this.add({
        body,
        point: point.point,
        normal: point.normal,
        penetration: point.penetration,
        surface: this.collisionWorld.groundMaterial(point.material),
        wetness: Math.max(body.wetness, point.wetness),
        collider: -1,
        feature: point.feature,
      });
    }
  }

  private collectStatic(body: RigidBody): void {
    if (body.sleeping) return;
    const extent = body.halfExtents;
    const candidates = this.collisionWorld.query(
      body.position.x - extent.x,
      body.position.x + extent.x,
      body.position.z - extent.z,
      body.position.z + extent.z,
    );
    for (const collider of candidates) {
      if (collider.maximum.y < body.position.y - extent.y) continue;
      if (collider.minimum.y > body.position.y + extent.y) continue;
      if (body.shape.kind === "sphere") {
        if (!this.collisionWorld.sphereBox(body.position, body.shape.radius, collider, this.contact)) continue;
        this.add({
          body,
          point: this.contact.point,
          normal: this.contact.normal,
          penetration: this.contact.penetration,
          surface: collider.material,
          wetness: Math.max(body.wetness, collider.wetness),
          collider: collider.id,
          feature: 0,
        });
      } else {
        this.bodyBox(body, this.bodyBoxA);
        const box = this.colliderBox(collider);
        if (!orientedBoxContact(this.bodyBoxA, box, this.contact)) continue;
        this.manifold.build(this.bodyBoxA, box, this.contact);
        for (let index = 0; index < this.manifold.count; index++) {
          const point = this.manifold.points[index];
          this.add({
            body,
            point: point.position,
            normal: this.contact.normal,
            penetration: point.penetration,
            surface: collider.material,
            wetness: Math.max(body.wetness, collider.wetness),
            collider: collider.id,
            feature: point.feature,
          });
        }
      }
      if (this.statistics.contacts >= this.maximumContacts) break;
    }
  }

  private add(input: ContactConstraintInput): void {
    if (this.constraints.add(input)) this.statistics.contacts++;
  }

  private bodyContact(a: RigidBody, b: RigidBody, result: Contact): boolean {
    this.delta.copy(a.position).sub(b.position);
    if (a.shape.kind === "sphere" && b.shape.kind === "sphere") {
      const combined = a.shape.radius + b.shape.radius;
      const distanceSquared = this.delta.lengthSq();
      if (distanceSquared >= combined * combined) return false;
      const distance = Math.sqrt(distanceSquared);
      result.normal.copy(distance > EPSILON ? this.delta.multiplyScalar(1 / distance) : this.upward);
      result.penetration = combined - distance;
      result.point.copy(b.position).addScaledVector(result.normal, b.shape.radius - result.penetration * 0.5);
      return true;
    }
    if (a.shape.kind === "box" && b.shape.kind === "box") {
      this.bodyBox(a, this.bodyBoxA);
      this.bodyBox(b, this.bodyBoxB);
      return orientedBoxContact(this.bodyBoxA, this.bodyBoxB, result);
    }
    if (a.shape.kind === "sphere" && b.shape.kind === "box") {
      this.bodyBox(b, this.bodyBoxB);
      return sphereOrientedBoxContact(a.position, a.shape.radius, this.bodyBoxB, result);
    }
    if (a.shape.kind === "box" && b.shape.kind === "sphere") {
      this.bodyBox(a, this.bodyBoxA);
      const hit = sphereOrientedBoxContact(b.position, b.shape.radius, this.bodyBoxA, result);
      if (hit) result.normal.negate();
      return hit;
    }
    return false;
  }

  private bodyBox(body: RigidBody, target: OrientedBox): void {
    target.center.copy(body.position);
    target.rotation.copy(body.rotation);
    if (body.shape.kind === "box") target.halfExtents.copy(body.shape.halfExtents);
    else target.halfExtents.setScalar(body.shape.radius);
  }

  private colliderBox(collider: StaticCollider): OrientedBox {
    let box = this.colliderBoxes.get(collider.id);
    if (!box) {
      box = {
        center: collider.center?.clone() ?? collider.minimum.clone().add(collider.maximum).multiplyScalar(0.5),
        halfExtents: collider.halfExtents?.clone() ?? collider.maximum.clone().sub(collider.minimum).multiplyScalar(0.5),
        rotation: new THREE.Quaternion().setFromAxisAngle(this.upward, collider.rotationY ?? 0),
      };
      this.colliderBoxes.set(collider.id, box);
    }
    return box;
  }
}
