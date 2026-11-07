import * as THREE from "three";
import type { CivicKit } from "../../city-civic";
import type { LifeContext } from "./types";
import type { LifeProp } from "./props-state";
import { lerp, point3, type Point3 } from "./math";

interface PrimitiveBatch {
  mesh: THREE.InstancedMesh;
  used: number;
  maximum: number;
}

export class LifePropRenderer {
  private readonly batches: PrimitiveBatch[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly rotation = new THREE.Quaternion();
  private readonly localRotation = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly color = new THREE.Color();
  private readonly origin = point3();
  private current: LifeProp | null = null;
  private boxes: PrimitiveBatch;
  private spheres: PrimitiveBatch;
  private cylinders: PrimitiveBatch;
  private cones: PrimitiveBatch;
  private rings: PrimitiveBatch;
  private bowls: PrimitiveBatch;
  private discs: PrimitiveBatch;
  private canopies: PrimitiveBatch;
  private planes: PrimitiveBatch;

  constructor(private readonly kit: CivicKit, private readonly group: THREE.Group) {
    const material = kit.solid("#ffffff", 0.8, 0.08);
    const cloth = kit.solid("#ffffff", 0.94, 0);
    const metal = kit.solid("#ffffff", 0.45, 0.4);
    this.boxes = this.batch("furniture and objects", new THREE.BoxGeometry(1, 1, 1), material, 1900);
    this.spheres = this.batch("rounded object contours", new THREE.SphereGeometry(1, 10, 7), material, 900);
    this.cylinders = this.batch("object stems and frames", new THREE.CylinderGeometry(1, 1, 1, 9), metal, 1800);
    this.cones = this.batch("tapered containers", new THREE.CylinderGeometry(0.7, 1, 1, 12), material, 256);
    this.rings = this.batch("handles and wheels", new THREE.TorusGeometry(1, 0.075, 6, 16), metal, 360);
    this.bowls = this.batch("cups and pots", new THREE.CylinderGeometry(1, 0.75, 1, 14, 1, true), material, 256);
    this.discs = this.batch("round tabletops", new THREE.CylinderGeometry(1, 1, 1, 18), material, 256);
    this.canopies = this.batch("umbrella fabric", new THREE.SphereGeometry(1, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), cloth, 96);
    this.planes = this.batch("books paper and fabric", new THREE.BoxGeometry(1, 1, 1), cloth, 480);
  }

  private batch(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, maximum: number): PrimitiveBatch {
    this.kit.geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material, maximum);
    mesh.name = `Neighborhood props · ${name}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.group.add(mesh);
    const batch = { mesh, used: 0, maximum };
    this.batches.push(batch);
    return batch;
  }

  render(context: LifeContext, alpha: number): void {
    for (const batch of this.batches) batch.used = 0;
    for (const prop of context.props.all) {
      if (!prop.visible || prop.opacity < 0.05) continue;
      this.current = prop;
      this.origin.x = lerp(prop.previousPosition.x, prop.position.x, alpha);
      this.origin.y = lerp(prop.previousPosition.y, prop.position.y, alpha);
      this.origin.z = lerp(prop.previousPosition.z, prop.position.z, alpha);
      this.euler.set(prop.rotation.x, prop.rotation.y, prop.rotation.z);
      this.rotation.setFromEuler(this.euler);
      this.draw(prop, context);
    }
    for (const batch of this.batches) {
      batch.mesh.count = batch.used;
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
    }
    this.current = null;
  }

  private position(x: number, y: number, z: number, target: THREE.Vector3): THREE.Vector3 {
    const scale = this.current!.scale;
    target.set(x * scale.x, y * scale.y, z * scale.z).applyQuaternion(this.rotation);
    target.x += this.origin.x;
    target.y += this.origin.y;
    target.z += this.origin.z;
    return target;
  }

  private part(batch: PrimitiveBatch, x: number, y: number, z: number, width: number, height: number, depth: number, color: string, rx = 0, ry = 0, rz = 0): void {
    if (batch.used >= batch.maximum || !this.current) return;
    this.position(x, y, z, this.dummy.position);
    this.euler.set(rx, ry, rz);
    this.localRotation.setFromEuler(this.euler);
    this.dummy.quaternion.copy(this.rotation).multiply(this.localRotation);
    this.dummy.scale.set(width * this.current.scale.x, height * this.current.scale.y, depth * this.current.scale.z);
    this.dummy.updateMatrix();
    batch.mesh.setMatrixAt(batch.used, this.dummy.matrix);
    batch.mesh.setColorAt(batch.used, this.color.set(color));
    batch.used++;
  }

  private box(x: number, y: number, z: number, w: number, h: number, d: number, color: string, rx = 0, ry = 0, rz = 0): void {
    this.part(this.boxes, x, y, z, w, h, d, color, rx, ry, rz);
  }

  private sphere(x: number, y: number, z: number, rx: number, ry: number, rz: number, color: string): void {
    this.part(this.spheres, x, y, z, rx, ry, rz, color);
  }

  private cylinder(x: number, y: number, z: number, radius: number, height: number, color: string): void {
    this.part(this.cylinders, x, y, z, radius, height, radius, color);
  }

  private line(a: Point3, b: Point3, radius: number, color: string): void {
    const batch = this.cylinders;
    if (batch.used >= batch.maximum || !this.current) return;
    this.position(a.x, a.y, a.z, this.from);
    this.position(b.x, b.y, b.z, this.to);
    this.dummy.position.copy(this.from).add(this.to).multiplyScalar(0.5);
    this.direction.subVectors(this.to, this.from);
    const length = this.direction.length();
    if (length < 0.0001) return;
    this.dummy.quaternion.setFromUnitVectors(this.up, this.direction.multiplyScalar(1 / length));
    this.dummy.scale.set(radius, length, radius);
    this.dummy.updateMatrix();
    batch.mesh.setMatrixAt(batch.used, this.dummy.matrix);
    batch.mesh.setColorAt(batch.used, this.color.set(color));
    batch.used++;
  }

  private ring(x: number, y: number, z: number, radius: number, color: string, rx = 0, ry = 0): void {
    this.part(this.rings, x, y, z, radius, radius, radius, color, rx, ry);
  }

  private wheel(x: number, y: number, z: number, radius: number, rotation = 0): void {
    this.ring(x, y, z, radius, "#343b3a", 0, Math.PI / 2);
    this.line({ x: x - 0.025, y, z }, { x: x + 0.025, y, z }, radius * 0.17, "#a5a69b");
    for (let spoke = 0; spoke < 4; spoke++) {
      const angle = rotation + spoke * Math.PI / 2;
      this.line({ x, y, z }, { x, y: y + Math.sin(angle) * radius, z: z + Math.cos(angle) * radius }, 0.008, "#979e9b");
    }
  }

  private draw(prop: LifeProp, context: LifeContext): void {
    switch (prop.kind) {
      case "bag": this.bag(prop); break;
      case "briefcase": this.briefcase(prop); break;
      case "phone": this.phone(prop); break;
      case "cup": this.cup(prop); break;
      case "meal": this.meal(prop); break;
      case "book": this.book(prop); break;
      case "parcel": this.parcel(prop); break;
      case "grocery": this.groceries(prop); break;
      case "flowers": this.flowers(prop); break;
      case "umbrella": this.umbrella(prop); break;
      case "cane": this.cane(prop); break;
      case "camera": this.camera(prop); break;
      case "guitar": this.guitar(prop); break;
      case "toolbox": this.toolbox(prop); break;
      case "broom": this.broom(prop); break;
      case "watering-can": this.wateringCan(prop); break;
      case "ball": this.ball(prop); break;
      case "table": this.table(prop); break;
      case "chair": this.chair(prop); break;
      case "stool": this.stool(prop); break;
      case "cart": this.cart(prop); break;
      case "bicycle": this.bicycle(prop); break;
      case "stroller": this.stroller(prop); break;
      case "bin": this.bin(prop); break;
      case "crate": this.crate(prop); break;
      case "cone": this.cone(prop); break;
      case "barrier": this.barrier(prop); break;
      case "tool": this.tool(prop); break;
      case "pump": this.pump(prop); break;
      case "flowerpot": this.flowerpot(prop); break;
      case "sign": this.sign(prop); break;
      case "chessboard": this.chessboard(prop); break;
      case "chesspiece": this.chesspiece(prop); break;
      case "blanket": this.blanket(prop); break;
      case "easel": this.easel(prop); break;
      case "canvas": this.canvas(prop); break;
      case "leash": this.leash(prop); break;
      case "leaves": this.leaves(prop, 6); break;
      case "newspaper": this.newspaper(prop); break;
      case "clipboard": this.clipboard(prop); break;
      case "tray": this.tray(prop); break;
      case "ticket": this.ticket(prop); break;
      case "bus-shelter": this.busShelter(prop); break;
      case "bus-sign": this.busSign(prop); break;
      case "taxi-sign": this.taxiSign(prop); break;
      case "garden-bed": this.gardenBed(prop); break;
      case "cleaning-cart": this.cleaningCart(prop); break;
      case "medical-kit": this.medicalKit(prop); break;
      case "stretcher": this.stretcher(prop); break;
      case "walker": this.walker(prop); break;
      case "kiosk": this.kiosk(prop); break;
      case "basket": this.basket(prop); break;
      case "traffic-light": this.trafficLight(prop, context); break;
      case "warning-lamp": this.warningLamp(prop, context); break;
      case "watering-stream": this.wateringStream(prop, context); break;
      case "wheelbarrow": this.wheelbarrow(prop); break;
      case "ladder": this.ladder(prop); break;
      case "leaf-pile": this.leaves(prop, 18); break;
      case "umbrella-stand": this.umbrellaStand(prop); break;
      case "fountain": this.fountain(prop, context); break;
    }
  }

  private bag(prop: LifeProp): void {
    this.box(0, -0.18, 0, 0.27, 0.32, 0.12, prop.color);
    this.line({ x: -0.075, y: -0.02, z: 0 }, { x: -0.055, y: 0.065, z: 0 }, 0.009, prop.accent);
    this.line({ x: 0.075, y: -0.02, z: 0 }, { x: 0.055, y: 0.065, z: 0 }, 0.009, prop.accent);
    this.line({ x: -0.055, y: 0.065, z: 0 }, { x: 0.055, y: 0.065, z: 0 }, 0.009, prop.accent);
    this.box(0, -0.17, 0.061, 0.11, 0.08, 0.004, "#c6b59a");
  }

  private briefcase(prop: LifeProp): void {
    this.box(0, -0.13, 0, 0.35, 0.25, 0.095, prop.color);
    this.box(0, -0.005, 0, 0.18, 0.02, 0.11, prop.accent);
    this.line({ x: -0.06, y: 0, z: 0 }, { x: -0.06, y: 0.06, z: 0 }, 0.012, prop.accent);
    this.line({ x: 0.06, y: 0, z: 0 }, { x: 0.06, y: 0.06, z: 0 }, 0.012, prop.accent);
    this.line({ x: -0.06, y: 0.06, z: 0 }, { x: 0.06, y: 0.06, z: 0 }, 0.012, prop.accent);
    for (const side of [-1, 1]) this.box(side * 0.1, -0.025, 0.05, 0.025, 0.035, 0.007, "#a5a38e");
  }

  private phone(prop: LifeProp): void {
    this.box(0, 0.025, 0, 0.069, 0.14, 0.013, prop.color);
    this.box(0, 0.027, 0.008, 0.058, 0.115, 0.003, "#78909a");
    this.box(0, 0.084, 0.009, 0.018, 0.003, 0.004, "#26353c");
    this.sphere(0.02, 0.078, -0.009, 0.009, 0.009, 0.003, "#263038");
  }

  private cup(prop: LifeProp): void {
    this.part(this.bowls, 0, 0.04, 0, 0.047, 0.11, 0.047, prop.color);
    this.part(this.discs, 0, 0.096, 0, 0.049, 0.009, 0.049, "#e5dfd0");
    this.part(this.discs, 0, 0.073, 0, 0.04, 0.004, 0.04, "#554334");
    this.part(this.cones, 0, 0.03, 0, 0.048, 0.04, 0.048, "#af8e61");
  }

  private meal(prop: LifeProp): void {
    this.box(0, 0.025, 0, 0.25, 0.05, 0.18, "#c9b489");
    this.box(0, 0.052, -0.09, 0.25, 0.012, 0.18, "#d8c8a8", -0.8);
    this.sphere(-0.05, 0.076, 0, 0.065, 0.032, 0.06, "#be9354");
    this.sphere(-0.05, 0.055, 0, 0.062, 0.009, 0.058, "#6c7850");
    for (let fry = 0; fry < 5; fry++) this.box(0.045 + fry * 0.013, 0.075, -0.01 + fry % 2 * 0.013, 0.009, 0.01, 0.065, "#d4ae63", 0, fry * 0.07);
    if (prop.progress > 0.75) this.box(0, 0.055, 0, 0.14, 0.005, 0.1, "#e6ddcb");
  }

  private book(prop: LifeProp): void {
    const open = prop.state === "reading" || prop.progress > 0;
    this.box(0, 0, 0, open ? 0.3 : 0.15, 0.018, 0.2, prop.color);
    this.box(0, 0.012, 0, open ? 0.286 : 0.139, 0.009, 0.187, "#e2dcc9");
    this.box(0, 0.02, 0, 0.006, 0.005, 0.2, prop.accent);
    if (open) {
      for (let line = 0; line < 5; line++) {
        this.box(-0.073, 0.018, -0.06 + line * 0.024, 0.09, 0.001, 0.003, "#aca99b");
        this.box(0.073, 0.018, -0.06 + line * 0.024, 0.09, 0.001, 0.003, "#aca99b");
      }
    }
  }

  private parcel(prop: LifeProp): void {
    this.box(0, 0.02, 0.03, 0.35, 0.25, 0.27, prop.color);
    this.box(0, 0.147, 0.03, 0.055, 0.005, 0.275, "#bca477");
    this.box(0, 0.025, 0.169, 0.055, 0.25, 0.004, "#bca477");
    this.box(0.08, 0.06, 0.171, 0.09, 0.07, 0.004, "#e3decb");
    for (let line = 0; line < 4; line++) this.box(0.052 + line * 0.017, 0.05, 0.174, 0.005, 0.035, 0.002, "#5e6259");
  }

  private groceries(prop: LifeProp): void {
    this.bag(prop);
    this.sphere(-0.07, -0.015, 0.01, 0.045, 0.045, 0.045, "#9c6550");
    this.sphere(0.065, -0.005, 0.02, 0.055, 0.045, 0.05, "#92985b");
    this.box(0.01, 0.08, -0.015, 0.065, 0.25, 0.045, "#c7ad7d", 0, 0, 0.13);
    for (let leaf = 0; leaf < 3; leaf++) this.sphere(-0.04 + leaf * 0.025, 0.04 + leaf * 0.02, -0.03, 0.02, 0.07, 0.014, "#71805b");
  }

  private flowers(prop: LifeProp): void {
    for (let stem = 0; stem < 5; stem++) {
      const angle = stem * Math.PI * 0.4;
      const x = Math.cos(angle) * 0.07;
      const z = Math.sin(angle) * 0.07;
      const height = 0.25 + stem % 3 * 0.025;
      this.line({ x: 0, y: -0.08, z: 0 }, { x, y: height, z }, 0.005, "#6c7f54");
      for (let petal = 0; petal < 5; petal++) this.sphere(x + Math.cos(petal * 1.256) * 0.022, height, z + Math.sin(petal * 1.256) * 0.022, 0.022, 0.011, 0.022, prop.color);
      this.sphere(x, height + 0.006, z, 0.012, 0.008, 0.012, "#c9a765");
    }
    this.part(this.cones, 0, 0.05, 0, 0.1, 0.22, 0.1, "#d0c0a2");
  }

  private umbrella(prop: LifeProp): void {
    const open = Math.max(0.08, prop.progress);
    const spread = 0.53 * open;
    this.cylinder(0, 0.35, 0, 0.008, 0.72, "#828983");
    this.ring(0.018, -0.025, 0, 0.033, prop.accent);
    this.part(this.canopies, 0, 0.68, 0, spread, 0.18, spread, prop.color);
    this.cylinder(0, 0.87, 0, 0.011, 0.05, prop.accent);
    for (let rib = 0; rib < 8; rib++) {
      const angle = rib * Math.PI / 4;
      this.line({ x: 0, y: 0.83, z: 0 }, { x: Math.cos(angle) * spread, y: 0.68, z: Math.sin(angle) * spread }, 0.004, "#777a73");
    }
  }

  private cane(prop: LifeProp): void {
    this.cylinder(0, -0.43, 0.02, 0.012, 0.84, prop.color);
    this.line({ x: -0.04, y: 0, z: 0.02 }, { x: 0.045, y: 0, z: 0.02 }, 0.019, prop.accent);
    this.cylinder(0, -0.855, 0.02, 0.021, 0.034, "#3e4641");
  }

  private camera(prop: LifeProp): void {
    this.box(0, 0.02, 0.025, 0.14, 0.09, 0.065, prop.color);
    this.part(this.cylinders, 0.01, 0.02, 0.085, 0.037, 0.07, 0.037, "#323c40", Math.PI / 2);
    this.part(this.discs, 0.01, 0.02, 0.122, 0.029, 0.006, 0.029, "#577785", Math.PI / 2);
    this.box(0.035, 0.075, 0.02, 0.035, 0.02, 0.025, "#404946");
    this.box(-0.048, 0.068, 0.025, 0.026, 0.012, 0.018, "#b1b3a5");
  }

  private guitar(prop: LifeProp): void {
    this.sphere(0.02, -0.03, 0.06, 0.16, 0.2, 0.055, prop.color);
    this.sphere(-0.025, 0.16, 0.06, 0.11, 0.13, 0.05, prop.color);
    this.box(-0.04, 0.42, 0.055, 0.045, 0.48, 0.035, "#655040", 0, 0, -0.12);
    this.part(this.discs, 0, 0.07, 0.116, 0.044, 0.004, 0.044, "#352c25", Math.PI / 2);
    this.box(0.025, -0.1, 0.12, 0.1, 0.022, 0.016, "#524136");
    for (let string = 0; string < 4; string++) this.line({ x: -0.02 + string * 0.01, y: -0.1, z: 0.128 }, { x: -0.07 + string * 0.01, y: 0.62, z: 0.078 }, 0.0015, "#c2bd9e");
  }

  private toolbox(prop: LifeProp): void {
    this.box(0, -0.085, 0, 0.38, 0.2, 0.22, prop.color);
    this.box(0, 0.02, 0, 0.4, 0.045, 0.235, prop.accent);
    this.line({ x: -0.08, y: 0.045, z: 0 }, { x: -0.08, y: 0.105, z: 0 }, 0.014, "#858d86");
    this.line({ x: 0.08, y: 0.045, z: 0 }, { x: 0.08, y: 0.105, z: 0 }, 0.014, "#858d86");
    this.line({ x: -0.08, y: 0.105, z: 0 }, { x: 0.08, y: 0.105, z: 0 }, 0.018, "#3e4643");
    for (const side of [-1, 1]) this.box(side * 0.12, -0.005, 0.12, 0.03, 0.05, 0.012, "#a8aaa0");
  }

  private broom(prop: LifeProp): void {
    this.line({ x: 0, y: 0.15, z: 0 }, { x: 0.13, y: -0.8, z: 0.23 }, 0.012, prop.color);
    this.box(0.13, -0.82, 0.23, 0.26, 0.04, 0.07, "#836b49");
    for (let bristle = 0; bristle < 7; bristle++) this.box(0.02 + bristle * 0.036, -0.88, 0.23, 0.028, 0.1, 0.06, "#b49b69", 0, 0, (bristle - 3) * 0.012);
  }

  private wateringCan(prop: LifeProp): void {
    this.part(this.cones, 0, -0.13, 0, 0.11, 0.2, 0.11, prop.color);
    this.ring(0, 0.01, -0.025, 0.09, prop.accent);
    this.line({ x: 0.07, y: -0.16, z: 0.02 }, { x: 0.23, y: -0.07, z: 0.15 }, 0.025, prop.color);
    this.sphere(0.24, -0.06, 0.16, 0.04, 0.024, 0.035, prop.accent);
  }

  private ball(prop: LifeProp): void {
    this.sphere(0, 0, 0, 0.12, 0.12, 0.12, prop.color);
    this.ring(0, 0, 0, 0.121, prop.accent);
    this.ring(0, 0, 0, 0.121, prop.accent, Math.PI / 2);
  }

  private table(prop: LifeProp): void {
    this.part(this.discs, 0, 0.73, 0, 0.47, 0.045, 0.47, prop.color);
    this.cylinder(0, 0.37, 0, 0.045, 0.7, prop.accent);
    this.part(this.discs, 0, 0.035, 0, 0.29, 0.05, 0.29, prop.accent);
  }

  private chair(prop: LifeProp): void {
    this.box(0, 0.44, 0, 0.42, 0.045, 0.4, prop.color);
    this.box(0, 0.7, -0.17, 0.42, 0.36, 0.035, prop.color);
    for (const x of [-0.16, 0.16]) {
      for (const z of [-0.15, 0.15]) this.line({ x, y: 0.02, z }, { x: x * 0.9, y: 0.43, z: z * 0.9 }, 0.018, prop.accent);
      this.line({ x, y: 0.44, z: -0.15 }, { x, y: 0.83, z: -0.18 }, 0.014, prop.accent);
    }
  }

  private stool(prop: LifeProp): void {
    this.part(this.discs, 0, 0.46, 0, 0.19, 0.045, 0.19, prop.color);
    for (let leg = 0; leg < 3; leg++) {
      const a = leg * Math.PI * 2 / 3;
      this.line({ x: Math.cos(a) * 0.16, y: 0.02, z: Math.sin(a) * 0.16 }, { x: Math.cos(a) * 0.13, y: 0.44, z: Math.sin(a) * 0.13 }, 0.018, prop.accent);
    }
    this.ring(0, 0.2, 0, 0.15, prop.accent, Math.PI / 2);
  }

  private cart(prop: LifeProp): void {
    this.box(0, 0.3, 0, 0.6, 0.07, 0.86, prop.color);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) this.wheel(side * 0.29, 0.13, end * 0.3, 0.12, prop.phase);
      this.line({ x: side * 0.27, y: 0.31, z: -0.36 }, { x: side * 0.27, y: 0.98, z: -0.45 }, 0.018, prop.accent);
    }
    this.line({ x: -0.27, y: 0.98, z: -0.45 }, { x: 0.27, y: 0.98, z: -0.45 }, 0.025, prop.accent);
    this.box(0, 0.48, 0.05, 0.45, 0.29, 0.42, "#b89c70");
  }

  private bicycle(prop: LifeProp): void {
    this.wheel(0, 0.34, -0.58, 0.32, prop.phase);
    this.wheel(0, 0.34, 0.58, 0.32, prop.phase);
    const rear = { x: 0, y: 0.34, z: -0.58 };
    const crank = { x: 0, y: 0.29, z: -0.04 };
    const seat = { x: 0, y: 0.83, z: -0.16 };
    const head = { x: 0, y: 0.84, z: 0.41 };
    this.line(rear, crank, 0.018, prop.color);
    this.line(rear, seat, 0.018, prop.color);
    this.line(crank, seat, 0.019, prop.color);
    this.line(seat, head, 0.019, prop.color);
    this.line(crank, head, 0.021, prop.color);
    this.line(head, { x: 0, y: 0.34, z: 0.58 }, 0.018, prop.accent);
    this.line(head, { x: 0, y: 1.01, z: 0.39 }, 0.014, prop.accent);
    this.line({ x: -0.23, y: 1.02, z: 0.39 }, { x: 0.23, y: 1.02, z: 0.39 }, 0.014, prop.accent);
    this.box(0, 0.89, -0.18, 0.16, 0.035, 0.25, "#3d4542");
    this.ring(0.03, 0.29, -0.04, 0.1, "#89928d", 0, Math.PI / 2);
    this.line({ x: -0.12, y: 0.29, z: -0.04 }, { x: 0.12, y: 0.29, z: -0.04 }, 0.014, "#89928d");
  }

  private stroller(prop: LifeProp): void {
    for (const side of [-1, 1]) {
      this.wheel(side * 0.27, 0.13, -0.26, 0.12, prop.phase);
      this.wheel(side * 0.24, 0.1, 0.33, 0.09, prop.phase);
      this.line({ x: side * 0.23, y: 0.12, z: 0.32 }, { x: side * 0.23, y: 0.95, z: -0.38 }, 0.017, prop.accent);
    }
    this.line({ x: -0.23, y: 0.95, z: -0.38 }, { x: 0.23, y: 0.95, z: -0.38 }, 0.024, "#3b4543");
    this.box(0, 0.43, 0, 0.43, 0.08, 0.58, prop.color);
    this.box(0, 0.62, -0.18, 0.43, 0.36, 0.08, prop.color, -0.15);
    this.part(this.canopies, 0, 0.72, -0.03, 0.28, 0.18, 0.34, prop.color);
  }

  private bin(prop: LifeProp): void {
    this.part(this.cones, 0, 0.41, 0, 0.25, 0.78, 0.25, prop.color);
    this.part(this.discs, 0, 0.81, 0, 0.26, 0.035, 0.26, prop.accent);
    this.box(0, 0.65, 0.22, 0.28, 0.12, 0.04, "#333f3b");
    for (let line = 0; line < 10; line++) {
      const a = line * Math.PI / 5;
      this.line({ x: Math.sin(a) * 0.22, y: 0.07, z: Math.cos(a) * 0.22 }, { x: Math.sin(a) * 0.18, y: 0.76, z: Math.cos(a) * 0.18 }, 0.006, prop.accent);
    }
  }

  private crate(prop: LifeProp): void {
    this.box(0, 0.025, 0, 0.53, 0.05, 0.38, prop.color);
    for (const side of [-1, 1]) {
      for (let rail = 0; rail < 3; rail++) this.box(0, 0.07 + rail * 0.09, side * 0.19, 0.53, 0.055, 0.025, prop.color);
      this.box(side * 0.25, 0.16, 0, 0.025, 0.28, 0.38, prop.color);
    }
    for (let produce = 0; produce < 6; produce++) this.sphere(-0.16 + produce % 3 * 0.16, 0.16, -0.08 + Math.floor(produce / 3) * 0.16, 0.065, 0.06, 0.06, produce % 2 ? "#a47654" : "#8d9454");
  }

  private cone(prop: LifeProp): void {
    this.box(0, 0.025, 0, 0.32, 0.05, 0.32, "#434c47");
    this.part(this.cones, 0, 0.25, 0, 0.13, 0.45, 0.13, prop.color);
    this.part(this.cones, 0, 0.28, 0, 0.118, 0.09, 0.118, "#d8d9cb");
  }

  private barrier(prop: LifeProp): void {
    for (const side of [-1, 1]) {
      this.box(side * 0.63, 0.07, 0, 0.17, 0.14, 0.53, prop.accent);
      this.cylinder(side * 0.63, 0.48, 0, 0.028, 0.8, prop.accent);
    }
    this.box(0, 0.74, 0, 1.45, 0.2, 0.07, prop.color);
    for (let stripe = 0; stripe < 7; stripe++) this.box(-0.6 + stripe * 0.2, 0.74, 0.04, 0.07, 0.21, 0.003, "#d6d4bd", 0, 0, -0.35);
  }

  private tool(prop: LifeProp): void {
    this.box(0, 0.015, 0, 0.026, 0.16, 0.025, prop.color);
    this.cylinder(0, 0.14, 0, 0.009, 0.14, "#adb4a9");
    this.box(0, 0.215, 0, 0.022, 0.018, 0.007, "#adb4a9");
  }

  private pump(prop: LifeProp): void {
    this.box(0, 0.025, 0, 0.28, 0.05, 0.12, prop.accent);
    this.cylinder(0, 0.25, 0, 0.035, 0.44, prop.color);
    this.cylinder(0, 0.57 + prop.progress * 0.15, 0, 0.014, 0.3, "#a3aaa1");
    this.line({ x: -0.13, y: 0.73 + prop.progress * 0.15, z: 0 }, { x: 0.13, y: 0.73 + prop.progress * 0.15, z: 0 }, 0.023, prop.accent);
    this.line({ x: 0.04, y: 0.07, z: 0 }, { x: 0.28, y: 0.04, z: 0.2 }, 0.008, "#3b4542");
  }

  private flowerpot(prop: LifeProp): void {
    this.part(this.cones, 0, 0.12, 0, 0.13, 0.24, 0.13, prop.color);
    this.part(this.discs, 0, 0.245, 0, 0.11, 0.015, 0.11, "#65523c");
    for (let stem = 0; stem < 5; stem++) {
      const a = stem * 1.256;
      this.line({ x: 0, y: 0.24, z: 0 }, { x: Math.sin(a) * 0.08, y: 0.4 + stem % 2 * 0.06, z: Math.cos(a) * 0.08 }, 0.006, "#697c51");
      this.sphere(Math.sin(a) * 0.08, 0.4 + stem % 2 * 0.06, Math.cos(a) * 0.08, 0.05, 0.025, 0.04, prop.accent);
    }
  }

  private sign(prop: LifeProp): void {
    this.box(0, 0.02, 0, 0.44, 0.04, 0.35, prop.accent);
    this.cylinder(0, 0.5, 0, 0.023, 0.98, prop.accent);
    this.box(0, 0.86, 0, 0.5, 0.36, 0.035, prop.color);
    for (let line = 0; line < 3; line++) this.box(0, 0.93 - line * 0.07, 0.02, 0.31 - line * 0.04, 0.013, 0.003, "#ddd9c5");
  }

  private chessboard(prop: LifeProp): void {
    this.box(0, 0.015, 0, 0.43, 0.03, 0.43, prop.color);
    for (let x = 0; x < 8; x++) {
      for (let z = 0; z < 8; z++) {
        this.box(-0.175 + x * 0.05, 0.033, -0.175 + z * 0.05, 0.049, 0.004, 0.049, (x + z) % 2 ? "#786750" : "#d3c3a1");
      }
    }
    for (let piece = 0; piece < 10; piece++) {
      const x = -0.175 + (piece * 3 % 8) * 0.05;
      const z = -0.175 + (piece * 5 % 8) * 0.05;
      this.cylinder(x, 0.06, z, 0.014, 0.05, piece < 5 ? "#444844" : "#d4c7aa");
      this.sphere(x, 0.09, z, 0.013, 0.013, 0.013, piece < 5 ? "#444844" : "#d4c7aa");
    }
  }

  private chesspiece(prop: LifeProp): void {
    this.part(this.discs, 0, 0.008, 0, 0.021, 0.016, 0.021, prop.color);
    this.part(this.cones, 0, 0.032, 0, 0.015, 0.045, 0.015, prop.color);
    this.sphere(0, 0.062, 0, 0.016, 0.016, 0.016, prop.color);
  }

  private blanket(prop: LifeProp): void {
    this.part(this.planes, 0, 0.012, 0, 1.75, 0.016, 1.4, prop.color);
    for (let line = 0; line < 6; line++) {
      this.part(this.planes, -0.7 + line * 0.28, 0.022, 0, 0.035, 0.003, 1.4, prop.accent);
      this.part(this.planes, 0, 0.024, -0.56 + line * 0.23, 1.75, 0.003, 0.03, prop.accent);
    }
  }

  private easel(prop: LifeProp): void {
    for (const side of [-1, 1]) this.line({ x: side * 0.36, y: 0, z: 0.1 }, { x: side * 0.13, y: 1.65, z: -0.1 }, 0.022, prop.color);
    this.line({ x: 0, y: 1.4, z: -0.1 }, { x: 0, y: 0, z: -0.55 }, 0.022, prop.color);
    this.box(0, 0.75, 0, 0.78, 0.06, 0.08, prop.accent);
    this.box(0, 1.2, -0.04, 0.65, 0.85, 0.035, "#d5c7ab");
    this.box(0, 1.19, -0.015, 0.58, 0.77, 0.005, "#b4c0ae");
    this.box(0, 1.02, -0.01, 0.56, 0.13, 0.004, "#798f8a");
    this.sphere(0.12, 1.35, 0, 0.065, 0.065, 0.01, "#d4c791");
  }

  private canvas(prop: LifeProp): void {
    this.box(0, 0, 0, 0.5, 0.4, 0.025, prop.color);
    this.box(0, 0, 0.014, 0.46, 0.36, 0.004, "#c3c9b4");
    this.box(0, -0.09, 0.018, 0.44, 0.12, 0.003, "#7f9b96");
    this.sphere(-0.1, 0.08, 0.021, 0.044, 0.044, 0.003, "#d8c795");
  }

  private leash(prop: LifeProp): void {
    this.line({ x: 0, y: 0, z: 0 }, { x: 0, y: -0.2, z: 0.6 }, 0.006, prop.color);
    this.line({ x: 0, y: -0.2, z: 0.6 }, { x: 0, y: -0.3, z: 1.2 }, 0.006, prop.color);
  }

  private leaves(prop: LifeProp, count: number): void {
    for (let leaf = 0; leaf < count; leaf++) {
      const angle = leaf * 2.399;
      const radius = Math.sqrt((leaf + 1) / count) * 0.36;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      this.part(this.planes, x, 0.018 + leaf % 3 * 0.012, z, 0.09, 0.008, 0.043, leaf % 3 ? prop.color : prop.accent, leaf % 2 * 0.1, angle);
    }
  }

  private newspaper(prop: LifeProp): void {
    this.part(this.planes, 0, 0, 0, 0.34, 0.006, 0.27, "#d8d4c4");
    this.box(0, 0.004, -0.085, 0.28, 0.002, 0.025, prop.accent);
    for (let column = 0; column < 3; column++) {
      for (let line = 0; line < 7; line++) this.box(-0.11 + column * 0.11, 0.005, -0.045 + line * 0.022, 0.085, 0.001, 0.003, "#aaa998");
    }
  }

  private clipboard(prop: LifeProp): void {
    this.box(0, 0, 0, 0.21, 0.012, 0.29, prop.color);
    this.box(0, 0.009, 0.005, 0.18, 0.004, 0.25, "#dcd8c8");
    this.box(0, 0.016, -0.12, 0.07, 0.012, 0.025, "#9a9f94");
    for (let line = 0; line < 6; line++) this.box(0, 0.013, -0.075 + line * 0.032, 0.13, 0.001, 0.003, "#b0b3a5");
  }

  private tray(prop: LifeProp): void {
    this.box(0, 0, 0, 0.4, 0.025, 0.3, prop.color);
    for (const side of [-1, 1]) {
      this.box(side * 0.19, 0.018, 0, 0.012, 0.025, 0.3, prop.accent);
      this.box(0, 0.018, side * 0.14, 0.4, 0.025, 0.012, prop.accent);
    }
    this.part(this.bowls, -0.09, 0.065, 0, 0.045, 0.1, 0.045, "#d2c3a4");
    this.box(0.08, 0.045, 0.02, 0.16, 0.055, 0.16, "#b7a478");
  }

  private ticket(prop: LifeProp): void {
    this.part(this.planes, 0, 0, 0, 0.06, 0.003, 0.1, prop.color);
    for (let bar = 0; bar < 4; bar++) this.box(-0.018 + bar * 0.012, 0.003, 0, 0.004, 0.001, 0.028, prop.accent);
  }

  private busShelter(prop: LifeProp): void {
    for (const side of [-1, 1]) {
      this.box(side * 1.6, 1.1, -0.45, 0.06, 2.2, 0.06, prop.accent);
      this.box(side * 1.6, 1.1, 0.4, 0.06, 2.2, 0.06, prop.accent);
    }
    this.box(0, 2.23, -0.02, 3.5, 0.12, 1.4, prop.color);
    this.box(0, 1.1, -0.47, 3.1, 1.95, 0.025, "#a6b6af");
    this.box(0, 0.48, -0.2, 2.5, 0.05, 0.38, "#8b8c75");
    for (const side of [-1, 1]) this.box(side * 0.9, 0.24, -0.2, 0.05, 0.45, 0.3, prop.accent);
  }

  private busSign(prop: LifeProp): void {
    this.cylinder(0, 1.25, 0, 0.035, 2.5, prop.accent);
    this.box(0, 2.05, 0, 0.58, 0.82, 0.045, prop.color);
    this.box(0, 2.23, 0.026, 0.36, 0.2, 0.005, "#e0ded0");
    this.box(0, 2.25, 0.031, 0.28, 0.09, 0.004, "#668487");
    for (let row = 0; row < 4; row++) this.box(0, 2.0 - row * 0.075, 0.027, 0.37, 0.012, 0.003, "#d8d5bf");
  }

  private taxiSign(prop: LifeProp): void {
    this.cylinder(0, 1.1, 0, 0.03, 2.2, prop.accent);
    this.box(0, 1.95, 0, 0.6, 0.42, 0.04, prop.color);
    this.box(0, 1.95, 0.025, 0.36, 0.13, 0.006, "#4e625d");
    for (const side of [-1, 1]) this.sphere(side * 0.12, 1.86, 0.03, 0.035, 0.035, 0.009, "#4e625d");
  }

  private gardenBed(prop: LifeProp): void {
    this.box(0, 0.12, 0, 1.4, 0.24, 0.85, prop.color);
    this.box(0, 0.245, 0, 1.25, 0.02, 0.7, "#665742");
    for (let plant = 0; plant < 8; plant++) {
      const x = -0.5 + plant % 4 * 0.33;
      const z = -0.18 + Math.floor(plant / 4) * 0.35;
      this.cylinder(x, 0.34, z, 0.006, 0.19, "#77835b");
      this.sphere(x, 0.44, z, 0.08, 0.035, 0.08, prop.accent);
    }
  }

  private cleaningCart(prop: LifeProp): void {
    this.box(0, 0.28, 0, 0.55, 0.06, 0.72, prop.accent);
    for (const side of [-1, 1]) {
      this.wheel(side * 0.29, 0.12, -0.23, 0.11, prop.phase);
      this.wheel(side * 0.29, 0.12, 0.24, 0.11, prop.phase);
      this.line({ x: side * 0.22, y: 0.3, z: -0.28 }, { x: side * 0.22, y: 0.9, z: -0.32 }, 0.018, prop.accent);
    }
    this.line({ x: -0.22, y: 0.9, z: -0.32 }, { x: 0.22, y: 0.9, z: -0.32 }, 0.022, prop.accent);
    this.part(this.cones, 0, 0.56, 0.06, 0.2, 0.5, 0.2, prop.color);
    this.box(0, 0.82, 0.05, 0.42, 0.04, 0.38, prop.accent);
    this.cylinder(0.22, 0.72, 0.12, 0.015, 1.1, "#998365");
  }

  private medicalKit(prop: LifeProp): void {
    this.box(0, -0.08, 0, 0.32, 0.22, 0.13, prop.color);
    this.ring(0, 0.065, 0, 0.06, prop.accent);
    this.box(0, -0.08, 0.07, 0.12, 0.035, 0.005, "#d7d9c8");
    this.box(0, -0.08, 0.073, 0.035, 0.12, 0.005, "#d7d9c8");
  }

  private stretcher(prop: LifeProp): void {
    this.box(0, 0.64, 0, 0.65, 0.08, 1.95, prop.color);
    for (const side of [-1, 1]) {
      this.line({ x: side * 0.34, y: 0.64, z: -1.1 }, { x: side * 0.34, y: 0.64, z: 1.1 }, 0.027, prop.accent);
      this.line({ x: side * 0.26, y: 0.6, z: -0.62 }, { x: side * 0.26, y: 0.13, z: 0.62 }, 0.021, prop.accent);
      this.line({ x: side * 0.26, y: 0.6, z: 0.62 }, { x: side * 0.26, y: 0.13, z: -0.62 }, 0.021, prop.accent);
      this.wheel(side * 0.29, 0.1, -0.65, 0.09);
      this.wheel(side * 0.29, 0.1, 0.65, 0.09);
    }
    this.box(0, 0.74, -0.7, 0.5, 0.14, 0.35, "#d6d8cc");
  }

  private walker(prop: LifeProp): void {
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) this.line({ x: side * 0.27, y: 0.03, z: end * 0.25 }, { x: side * 0.24, y: 0.83, z: end * 0.22 }, 0.016, prop.accent);
      this.line({ x: side * 0.24, y: 0.83, z: -0.22 }, { x: side * 0.24, y: 0.83, z: 0.22 }, 0.022, prop.color);
    }
    this.line({ x: -0.24, y: 0.65, z: 0.22 }, { x: 0.24, y: 0.65, z: 0.22 }, 0.016, prop.accent);
    this.line({ x: -0.24, y: 0.3, z: 0.22 }, { x: 0.24, y: 0.3, z: 0.22 }, 0.016, prop.accent);
  }

  private kiosk(prop: LifeProp): void {
    this.box(0, 0.6, 0, 1.4, 1.2, 0.85, prop.color);
    this.box(0, 1.23, 0.18, 1.65, 0.08, 1.2, prop.accent);
    for (const side of [-1, 1]) this.cylinder(side * 0.68, 1.82, -0.32, 0.025, 1.2, prop.accent);
    this.box(0, 2.43, -0.02, 1.8, 0.1, 1.4, prop.color);
    this.box(0, 0.7, 0.44, 0.85, 0.45, 0.015, "#c5b99b");
    for (let item = 0; item < 4; item++) this.box(-0.45 + item * 0.3, 1.33, 0.1, 0.22, 0.14, 0.2, item % 2 ? "#9b7958" : "#9aab86");
  }

  private basket(prop: LifeProp): void {
    this.part(this.cones, 0, -0.09, 0, 0.18, 0.22, 0.18, prop.color);
    this.ring(0, 0.045, 0, 0.16, prop.accent);
    for (let weave = 0; weave < 4; weave++) this.ring(0, -0.17 + weave * 0.05, 0, 0.165 - weave * 0.01, prop.accent, Math.PI / 2);
  }

  private trafficLight(prop: LifeProp, context: LifeContext): void {
    this.cylinder(0, 1.1, 0, 0.035, 2.2, prop.accent);
    this.box(0, 1.94, 0, 0.22, 0.56, 0.17, "#394641");
    for (let lamp = 0; lamp < 3; lamp++) {
      const active = prop.state === "walk" ? lamp === 2 : prop.state === "clearance" ? lamp === 1 && Math.sin(context.time.seconds * 7) > 0 : lamp === 0;
      const tint = active ? lamp === 0 ? "#ba5e46" : lamp === 1 ? "#ceab56" : "#78aa7d" : "#596357";
      this.sphere(0, 2.11 - lamp * 0.17, 0.09, 0.066, 0.066, 0.018, tint);
    }
  }

  private warningLamp(prop: LifeProp, context: LifeContext): void {
    this.part(this.discs, 0, 0.025, 0, 0.12, 0.05, 0.12, prop.accent);
    this.part(this.canopies, 0, 0.05, 0, 0.105, 0.12, 0.105, Math.sin(context.time.seconds * 5 + prop.id) > 0 ? "#d4a052" : "#806f48");
    this.cylinder(0, 0.08, 0, 0.02, 0.08, "#e2c58b");
  }

  private wateringStream(prop: LifeProp, context: LifeContext): void {
    for (let drop = 0; drop < 9; drop++) {
      const t = (context.time.seconds * 1.8 + drop / 9) % 1;
      const x = 0.24 + t * 0.15;
      const y = -0.06 - t * t * 0.6;
      const z = 0.16 + t * 0.22;
      this.sphere(x + Math.sin(drop * 2.3) * 0.01, y, z, 0.008, 0.016, 0.008, "#a4b7b1");
    }
  }

  private wheelbarrow(prop: LifeProp): void {
    this.wheel(0, 0.19, 0.58, 0.18, prop.phase);
    this.box(0, 0.47, 0.08, 0.61, 0.1, 0.82, prop.color);
    for (const side of [-1, 1]) {
      this.box(side * 0.3, 0.62, 0.08, 0.04, 0.3, 0.82, prop.color, 0, 0, side * 0.14);
      this.line({ x: side * 0.23, y: 0.49, z: 0.48 }, { x: side * 0.23, y: 0.78, z: -0.78 }, 0.022, prop.accent);
      this.line({ x: side * 0.22, y: 0.04, z: -0.25 }, { x: side * 0.22, y: 0.46, z: -0.2 }, 0.019, prop.accent);
    }
    this.box(0, 0.62, 0.46, 0.6, 0.3, 0.04, prop.color);
    this.box(0, 0.57, 0.05, 0.49, 0.08, 0.62, "#756044");
  }

  private ladder(prop: LifeProp): void {
    for (const side of [-1, 1]) {
      this.line({ x: side * 0.25, y: 0, z: 0.4 }, { x: side * 0.25, y: 1.9, z: 0 }, 0.024, prop.color);
      this.line({ x: side * 0.25, y: 0, z: -0.4 }, { x: side * 0.25, y: 1.9, z: 0 }, 0.024, prop.color);
    }
    for (let rung = 0; rung < 6; rung++) {
      const y = 0.22 + rung * 0.29;
      const z = 0.4 * (1 - y / 1.9);
      this.line({ x: -0.25, y, z }, { x: 0.25, y, z }, 0.022, prop.accent);
    }
  }

  private umbrellaStand(prop: LifeProp): void {
    this.part(this.bowls, 0, 0.3, 0, 0.21, 0.6, 0.21, prop.color);
    this.part(this.discs, 0, 0.025, 0, 0.21, 0.05, 0.21, prop.accent);
    for (let umbrella = 0; umbrella < 3; umbrella++) {
      const x = -0.1 + umbrella * 0.1;
      this.line({ x, y: 0.08, z: 0 }, { x: x * 1.2, y: 0.9, z: umbrella % 2 * 0.03 }, 0.012, prop.accent);
      this.part(this.cones, x, 0.47, 0, 0.04, 0.6, 0.04, umbrella % 2 ? "#657a78" : "#8c7864");
      this.ring(x * 1.2 + 0.02, 0.9, umbrella % 2 * 0.03, 0.03, prop.accent);
    }
  }

  private fountain(prop: LifeProp, context: LifeContext): void {
    this.part(this.cones, 0, 0.45, 0, 0.16, 0.9, 0.16, prop.color);
    this.part(this.bowls, 0, 0.94, 0, 0.25, 0.09, 0.25, prop.accent);
    this.line({ x: 0.1, y: 0.98, z: -0.08 }, { x: 0.1, y: 1.06, z: -0.08 }, 0.012, "#afb8af");
    this.line({ x: 0.1, y: 1.06, z: -0.08 }, { x: 0.04, y: 1.06, z: -0.02 }, 0.012, "#afb8af");
    this.part(this.discs, 0, 0.035, 0, 0.26, 0.07, 0.26, prop.color);
    if (prop.state === "flowing") {
      for (let drop = 0; drop < 6; drop++) {
        const t = (context.time.seconds * 2 + drop / 6) % 1;
        this.sphere(0.04 - t * 0.06, 1.06 + Math.sin(t * Math.PI) * 0.05 - t * 0.1, -0.02 + t * 0.04, 0.005, 0.01, 0.005, "#b6c9c0");
      }
    }
    if (prop.state === "closed") this.box(0, 0.63, 0.15, 0.13, 0.12, 0.006, "#b59a73");
  }

  dispose(): void {
    for (const batch of this.batches) {
      batch.mesh.removeFromParent();
      batch.mesh.dispose();
    }
    this.batches.length = 0;
  }
}
