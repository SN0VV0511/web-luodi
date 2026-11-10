import * as THREE from "three";
import type { CivicKit } from "../../city-civic";
import { createBackpack, createCalf, createForearm, createHair, createHairBun, createHairLong, createHairPonytail, createHand, createHead, createNeck, createPelvis, createSkirt, createShoe, createThigh, createTorso, createUpperArm } from "../../city-figure";
import { angleDelta, lerp, point3, type Point3 } from "./math";
import type { Actor, LifeContext } from "./types";
import { LifePropRenderer } from "./render-props";
import { createVehicleShell, createVehicleWheel, type VehicleShell } from "../../city-vehicles";
import { SkinnedPeople, createWorldPose } from "./skinned-people";

interface BodyBatch {
  mesh: THREE.InstancedMesh;
  used: number;
  capacity: number;
}

type FleetShell = {
  shape: VehicleShell;
  body: BodyBatch;
  glass: BodyBatch;
  trim: BodyBatch;
  chrome: BodyBatch;
};

/** 头部相对姿态骨架的抬升量与五官缩放：骨架仍按 1.76 m 成人计算，头更小、下颌更高。 */
const HEAD_LIFT = 0.022;
const FACE_SCALE = 0.72;
const shirtTones = new Map<string, string>();
/** 由外套色推导略深的翻领/袖口色，领口与袖口不再是统一的白色方片。 */
function shirtTone(coat: string): string {
  let tone = shirtTones.get(coat);
  if (!tone) {
    tone = `#${new THREE.Color(coat).lerp(new THREE.Color("#1c1c1c"), 0.22).getHexString()}`;
    shirtTones.set(coat, tone);
  }
  return tone;
}

export class LifeRenderer {
  private readonly group = new THREE.Group();
  private readonly batches: BodyBatch[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly from = new THREE.Vector3();
  private readonly to = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly color = new THREE.Color();
  private readonly wheelRotation = new THREE.Quaternion();
  private readonly local = point3();
  private readonly actorPosition = point3();
  private readonly props: LifePropRenderer;
  private activeActor: Actor | null = null;
  private activeHeading = 0;
  private activeScale = 1;
  private heads: BodyBatch;
  private necks: BodyBatch;
  private hairLong: BodyBatch;
  private hairBun: BodyBatch;
  private hairPonytail: BodyBatch;
  private skirts: BodyBatch;
  private coatTails: BodyBatch;
  private backpacks: BodyBatch;
  private hair: BodyBatch;
  private torsos: BodyBatch;
  private pelvis: BodyBatch;
  private upperArms: BodyBatch;
  private forearms: BodyBatch;
  private hands: BodyBatch;
  private thighs: BodyBatch;
  private calves: BodyBatch;
  private shoes: BodyBatch;
  private eyes: BodyBatch;
  private noses: BodyBatch;
  private mouths: BodyBatch;
  private brows: BodyBatch;
  private ears: BodyBatch;
  private collars: BodyBatch;
  private cuffs: BodyBatch;
  private buttons: BodyBatch;
  private hats: BodyBatch;
  private brims: BodyBatch;
  private glasses: BodyBatch;
  private dogBodies: BodyBatch;
  private dogHeads: BodyBatch;
  private dogLegs: BodyBatch;
  private dogTails: BodyBatch;
  private birdBodies: BodyBatch;
  private birdWings: BodyBatch;
  private animalEyes: BodyBatch;
  private leashes: BodyBatch;
  private readonly vehicleShells: Record<"sedan" | "suv" | "bus", FleetShell>;
  private vehicleWheels: BodyBatch;
  private vehicleRims: BodyBatch;
  private vehicleLamps: BodyBatch;
  private vehicleDoors: BodyBatch;
  /** 写实蒙皮人体（CC0 模型，懒加载）；加载完成前与失败时继续使用程序化人形。 */
  private readonly people: SkinnedPeople;
  private readonly worldPose = createWorldPose();

  constructor(private readonly kit: CivicKit, maximumActors: number) {
    this.group.name = "Detailed neighborhood residents";
    kit.group.add(this.group);
    this.people = new SkinnedPeople(this.group, maximumActors);
    const skin = kit.solid("#ffffff", 0.77, 0);
    const cloth = kit.solid("#ffffff", 0.94, 0);
    const hair = kit.solid("#ffffff", 0.96, 0);
    const rubber = kit.solid("#292d2d", 0.88, 0.01);
    const eye = kit.solid("#252729", 0.35, 0.05);
    const glass = kit.solid("#1e2a31", 0.06, 0.7);
    const metal = kit.solid("#9b9b94", 0.35, 0.6);
    const vehicle = kit.solid("#ffffff", 0.38, 0.24);
    const light = kit.solid("#f7e5bd", 0.3, 0.15);
    this.heads = this.batch("faces", createHead(), skin, maximumActors);
    this.necks = this.batch("necks", createNeck(), skin, maximumActors);
    this.hair = this.batch("hair", createHair(), hair, maximumActors);
    this.hairLong = this.batch("long hair", createHairLong(), hair, maximumActors);
    this.hairBun = this.batch("hair buns", createHairBun(), hair, maximumActors);
    this.hairPonytail = this.batch("ponytails", createHairPonytail(), hair, maximumActors);
    this.skirts = this.batch("skirts", createSkirt(), cloth, maximumActors);
    this.coatTails = this.batch("coat tails", createSkirt(), cloth, maximumActors);
    this.backpacks = this.batch("backpacks", createBackpack(), kit.solid("#ffffff", 0.82, 0.02), maximumActors);
    this.torsos = this.batch("tailored jackets", createTorso(), cloth, maximumActors);
    this.pelvis = this.batch("trousers", createPelvis(), cloth, maximumActors);
    this.upperArms = this.batch("upper sleeves", createUpperArm(), cloth, maximumActors * 2);
    this.forearms = this.batch("forearms", createForearm(), skin, maximumActors * 2);
    this.hands = this.batch("hands", createHand(), skin, maximumActors * 2);
    this.thighs = this.batch("upper trousers", createThigh(), cloth, maximumActors * 2);
    this.calves = this.batch("lower trousers", createCalf(), cloth, maximumActors * 2);
    this.shoes = this.batch("shoes", createShoe(), rubber, maximumActors * 2);
    this.eyes = this.batch("eyes", new THREE.SphereGeometry(1, 8, 6), eye, maximumActors * 2);
    this.noses = this.batch("nose contours", new THREE.SphereGeometry(1, 8, 6), skin, maximumActors);
    this.mouths = this.batch("expressions", new THREE.SphereGeometry(1, 8, 6), skin, maximumActors);
    this.brows = this.batch("brows", new THREE.BoxGeometry(1, 1, 1), hair, maximumActors * 2);
    this.ears = this.batch("ears", new THREE.SphereGeometry(1, 8, 6), skin, maximumActors * 2);
    this.collars = this.batch("shirt collars", new THREE.BoxGeometry(1, 1, 1), cloth, maximumActors * 2);
    this.cuffs = this.batch("shirt cuffs", new THREE.CylinderGeometry(0.5, 0.5, 1, 10), cloth, maximumActors * 2);
    this.buttons = this.batch("coat fasteners", new THREE.SphereGeometry(1, 6, 4), metal, maximumActors * 3);
    this.hats = this.batch("hat crowns", new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cloth, maximumActors);
    this.brims = this.batch("hat brims", new THREE.CylinderGeometry(1, 1, 1, 16), cloth, maximumActors);
    this.glasses = this.batch("spectacle frames", new THREE.TorusGeometry(1, 0.12, 5, 10), metal, maximumActors * 2);
    this.dogBodies = this.batch("dog bodies", new THREE.SphereGeometry(1, 14, 10), cloth, 10);
    this.dogHeads = this.batch("dog heads", new THREE.SphereGeometry(1, 12, 8), cloth, 30);
    this.dogLegs = this.batch("dog legs", new THREE.CapsuleGeometry(0.5, 0.5, 3, 8), cloth, 40);
    this.dogTails = this.batch("dog tails", new THREE.CylinderGeometry(0.35, 0.65, 1, 7), cloth, 10);
    this.birdBodies = this.batch("birds", new THREE.SphereGeometry(1, 10, 6), cloth, 24);
    this.birdWings = this.batch("bird wings", new THREE.SphereGeometry(1, 8, 6), cloth, 48);
    this.animalEyes = this.batch("animal eyes", new THREE.SphereGeometry(1, 6, 4), eye, 68);
    this.leashes = this.batch("dog leads", new THREE.CylinderGeometry(1, 1, 1, 5), rubber, 20);
    const fleetShell = (kind: "sedan" | "suv" | "bus"): FleetShell => {
      const shape = createVehicleShell(kind);
      return {
        shape,
        body: this.batch(`service ${kind} body`, shape.body, vehicle, 12),
        glass: this.batch(`service ${kind} glazing`, shape.glass, glass, 12),
        trim: this.batch(`service ${kind} seals`, shape.trim, rubber, 12),
        chrome: this.batch(`service ${kind} metalwork`, shape.chrome, metal, 12),
      };
    };
    this.vehicleShells = { sedan: fleetShell("sedan"), suv: fleetShell("suv"), bus: fleetShell("bus") };
    const fleetWheels = createVehicleWheel();
    this.vehicleWheels = this.batch("service vehicle tires", fleetWheels.tire, rubber, 48);
    this.vehicleRims = this.batch("service vehicle rims", fleetWheels.rim, metal, 48);
    this.vehicleLamps = this.batch("service vehicle lamps", new THREE.BoxGeometry(1, 1, 1), light, 48);
    this.vehicleDoors = this.batch("bus boarding doors", new THREE.BoxGeometry(1, 1, 1), glass, 8);
    this.props = new LifePropRenderer(kit, this.group);
  }

  private batch(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, count: number): BodyBatch {
    this.kit.geometries.add(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `Neighborhood · ${name}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.group.add(mesh);
    const batch = { mesh, used: 0, capacity: count };
    this.batches.push(batch);
    return batch;
  }

  render(context: LifeContext, alpha: number): void {
    for (const batch of this.batches) batch.used = 0;
    this.people.begin();
    for (const actor of context.actors) {
      if (!actor.visible || actor.interiorId || actor.vehicleId >= 0) continue;
      this.drawActor(actor, alpha);
    }
    this.activeActor = null;
    this.people.end();
    this.drawAnimals(context, alpha);
    this.drawVehicles(context, alpha);
    for (const batch of this.batches) {
      batch.mesh.count = batch.used;
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
    }
    this.props.render(context, alpha);
  }

  private stamp(batch: BodyBatch, position: Point3, sx: number, sy: number, sz: number, tint: string, rx = 0, ry = 0, rz = 0): void {
    if (batch.used >= batch.capacity) return;
    this.dummy.position.set(position.x, position.y, position.z);
    this.dummy.rotation.set(rx, ry, rz);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    batch.mesh.setMatrixAt(batch.used, this.dummy.matrix);
    batch.mesh.setColorAt(batch.used, this.color.set(tint));
    batch.used++;
  }

  private world(local: Point3, target: THREE.Vector3): THREE.Vector3 {
    target.set(
      this.actorPosition.x + (local.x * Math.cos(this.activeHeading) + local.z * Math.sin(this.activeHeading)) * this.activeScale,
      this.actorPosition.y + local.y * this.activeScale,
      this.actorPosition.z + (local.z * Math.cos(this.activeHeading) - local.x * Math.sin(this.activeHeading)) * this.activeScale,
    );
    return target;
  }

  private part(batch: BodyBatch, local: Point3, sx: number, sy: number, sz: number, tint: string, pitch = 0, yaw = 0, roll = 0): void {
    this.world(local, this.from);
    this.stamp(batch, this.from, sx * this.activeScale, sy * this.activeScale, sz * this.activeScale, tint, pitch, this.activeHeading + yaw, roll);
  }

  private segment(batch: BodyBatch, a: Point3, b: Point3, thickness: number, tint: string): void {
    if (batch.used >= batch.capacity) return;
    this.world(a, this.from);
    this.world(b, this.to);
    this.segmentWorld(batch, this.from, this.to, thickness * this.activeScale, tint);
  }

  private segmentWorld(batch: BodyBatch, a: Point3, b: Point3, thickness: number, tint: string): void {
    if (batch.used >= batch.capacity) return;
    this.dummy.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
    this.direction.set(b.x - a.x, b.y - a.y, b.z - a.z);
    const length = this.direction.length();
    if (length < 0.0001) return;
    this.dummy.quaternion.setFromUnitVectors(this.up, this.direction.multiplyScalar(1 / length));
    this.dummy.scale.set(thickness, length, thickness);
    this.dummy.updateMatrix();
    batch.mesh.setMatrixAt(batch.used, this.dummy.matrix);
    batch.mesh.setColorAt(batch.used, this.color.set(tint));
    batch.used++;
  }

  private drawActor(actor: Actor, alpha: number): void {
    this.activeActor = actor;
    this.activeHeading = actor.previousHeading + angleDelta(actor.previousHeading, actor.heading) * alpha;
    this.activeScale = actor.appearance.height / 1.76;
    this.actorPosition.x = lerp(actor.previousPosition.x, actor.position.x, alpha);
    this.actorPosition.y = actor.groundY;
    this.actorPosition.z = lerp(actor.previousPosition.z, actor.position.z, alpha);
    const p = actor.pose;
    const a = actor.appearance;
    const width = a.shoulderWidth;
    const bulk = a.winterCoat ? 1.12 : 1;
    if (this.drawSkinned(actor)) return;
    // 写实比例：头高约为身高的 1/7.5（约 0.24 m），颈部可见，躯干厚度接近真人胸廓。
    this.local.x = p.head.x;
    this.local.y = p.head.y + HEAD_LIFT;
    this.local.z = p.head.z;
    this.part(this.heads, this.local, 0.185, 0.215, 0.2, a.skin, p.headPitch, p.headYaw);
    this.local.y += 0.006;
    // 发型：0/1 短发，2 及肩长发，3 盘发，4 马尾；戴帽者统一压成短发。
    const style = a.hat ? 0 : a.hairStyle;
    const hairBatch = style === 2 ? this.hairLong : style === 3 ? this.hairBun : style === 4 ? this.hairPonytail : this.hair;
    this.part(hairBatch, this.local, 0.19, style === 1 ? 0.212 : 0.219, style === 1 ? 0.198 : 0.205, a.hair, p.headPitch, p.headYaw);
    this.local.y = p.head.y + HEAD_LIFT - 0.15;
    this.local.z = p.head.z * 0.6 + p.chest.z * 0.4 - 0.01;
    this.part(this.necks, this.local, 0.12, 0.13, 0.125, a.skin, p.headPitch * 0.5);
    this.part(this.torsos, p.chest, width * 0.94 * bulk, 0.57 + a.coatLength * 0.035, 0.255 * a.build * bulk, a.coat, p.chestPitch, p.chestYaw);
    this.part(this.pelvis, p.hips, width * 0.74, 0.25, 0.25 * a.build, a.trousers);
    const legTone = a.skirt ? "#3a3534" : a.trousers;
    if (a.skirt) {
      this.local.x = p.hips.x;
      this.local.y = p.hips.y - 0.2;
      this.local.z = p.hips.z;
      this.part(this.skirts, this.local, width * 0.86, 0.46, 0.27 * a.build, a.trousers);
    }
    if (a.coatLength > 0.62 || a.winterCoat) {
      // 长款大衣下摆从腰线垂到膝上，替代上衣在胯部的硬切口。
      this.local.x = p.chest.x;
      this.local.y = p.hips.y - 0.08;
      this.local.z = p.hips.z;
      this.part(this.coatTails, this.local, width * 0.92 * bulk, 0.42, 0.29 * a.build * bulk, a.coat, p.chestPitch * 0.5, p.chestYaw);
    }
    if (a.backpack) {
      this.local.x = p.chest.x;
      this.local.y = p.chest.y + 0.02;
      this.local.z = p.chest.z - 0.2 * a.build;
      this.part(this.backpacks, this.local, 0.3, 0.38, 0.16, shirtTone(a.shoes === "#d9d6cf" ? "#46566b" : "#6b3a32"), p.chestPitch, p.chestYaw);
    }
    for (const side of [-1, 1]) {
      const left = side < 0;
      const shoulder = left ? p.leftShoulder : p.rightShoulder;
      const elbow = left ? p.leftElbow : p.rightElbow;
      const hand = left ? p.leftHand : p.rightHand;
      const knee = left ? p.leftKnee : p.rightKnee;
      const ankle = left ? p.leftAnkle : p.rightAnkle;
      this.segment(this.upperArms, shoulder, elbow, 0.13 * bulk, a.coat);
      this.segment(this.forearms, elbow, hand, 0.105 * bulk, a.sleeveLength > 0.7 ? a.coat : a.skin);
      this.part(this.hands, hand, 0.085, 0.125, 0.066, a.skin);
      this.local.x = p.hips.x + side * 0.09;
      this.local.y = p.hips.y;
      this.local.z = p.hips.z;
      this.segment(this.thighs, this.local, knee, 0.17 * a.build, a.skirt ? legTone : a.trousers);
      this.segment(this.calves, knee, ankle, (a.skirt ? 0.11 : 0.128) * a.build, legTone);
      this.local.x = ankle.x;
      this.local.y = ankle.y - 0.018;
      this.local.z = ankle.z + 0.065;
      this.part(this.shoes, this.local, 0.12, 0.11, 0.27, a.shoes, left ? p.leftFootPitch : p.rightFootPitch);
      this.faceDetail(actor, side);
      this.local.x = p.chest.x + side * 0.055;
      this.local.y = p.chest.y + 0.2;
      this.local.z = p.chest.z + 0.112;
      // 翻领由躯干网格的领口顶点色表达；独立的平板领片在近景里会读成胸前的浅色方块，已移除。
      if (a.sleeveLength > 0.7) {
        this.local.x = lerp(elbow.x, hand.x, 0.91);
        this.local.y = lerp(elbow.y, hand.y, 0.91);
        this.local.z = lerp(elbow.z, hand.z, 0.91);
        this.part(this.cuffs, this.local, 0.112, 0.022, 0.112, a.shirt ?? shirtTone(a.coat));
      }
    }
    for (let button = 0; button < 3; button++) {
      this.local.x = p.chest.x;
      this.local.y = p.chest.y + 0.12 - button * 0.11;
      this.local.z = p.chest.z + 0.132 * a.build;
      this.part(this.buttons, this.local, 0.009, 0.009, 0.007, "#5d5e58");
    }
    if (a.hat) {
      this.local.x = p.head.x;
      this.local.y = p.head.y + HEAD_LIFT + 0.075;
      this.local.z = p.head.z;
      this.part(this.hats, this.local, 0.106, 0.095, 0.112, a.coat);
      this.local.y -= 0.004;
      this.local.z += 0.012;
      this.part(this.brims, this.local, 0.135, 0.012, 0.145, a.coat);
    }
  }

  /** 头部局部偏移（右 dx、上 dy、前 dz）按点头与转头换算到居民局部坐标，配件随头部转动。 */
  private headPoint(p: Actor["pose"], dx: number, dy: number, dz: number): Point3 {
    const pitch = p.headPitch;
    const y = dy * Math.cos(pitch) - dz * Math.sin(pitch);
    const z = dy * Math.sin(pitch) + dz * Math.cos(pitch);
    const yaw = p.headYaw;
    this.local.x = p.head.x + dx * Math.cos(yaw) + z * Math.sin(yaw);
    this.local.y = p.head.y + HEAD_LIFT + y;
    this.local.z = p.head.z + z * Math.cos(yaw) - dx * Math.sin(yaw);
    return this.local;
  }

  /** 写实人体：身体由蒙皮网格绘制，这里只补发型、帽子、眼镜与背包等配件。 */
  private drawSkinned(actor: Actor): boolean {
    const p = actor.pose;
    const a = actor.appearance;
    const w = this.worldPose;
    this.world(p.hips, w.hips);
    this.world(p.chest, w.chest);
    this.local.x = p.head.x;
    this.local.y = p.head.y + HEAD_LIFT;
    this.local.z = p.head.z;
    this.world(this.local, w.head);
    this.world(p.leftShoulder, w.leftShoulder);
    this.world(p.rightShoulder, w.rightShoulder);
    this.world(p.leftElbow, w.leftElbow);
    this.world(p.rightElbow, w.rightElbow);
    this.world(p.leftHand, w.leftHand);
    this.world(p.rightHand, w.rightHand);
    this.world(p.leftKnee, w.leftKnee);
    this.world(p.rightKnee, w.rightKnee);
    this.world(p.leftAnkle, w.leftAnkle);
    this.world(p.rightAnkle, w.rightAnkle);
    this.local.y = p.hips.y;
    this.local.z = p.hips.z;
    this.local.x = p.hips.x - 0.105;
    this.world(this.local, w.leftHip);
    this.local.x = p.hips.x + 0.105;
    this.world(this.local, w.rightHip);
    w.heading = this.activeHeading;
    w.headYaw = p.headYaw;
    w.headPitch = p.headPitch;
    w.leftFootPitch = p.leftFootPitch;
    w.rightFootPitch = p.rightFootPitch;
    w.scale = this.activeScale;
    if (!this.people.add(w, a)) return false;
    // 短发直接由头部网格的头皮分区着色并鼓出发量；只有长发/发髻/马尾补挂下垂发束，
    // 发束自带的发帽略小于鼓出的头皮，藏在头发里面，帽子与头发不再互相穿插。
    const style = a.hat ? 0 : a.hairStyle;
    if (style >= 2) {
      const hairBatch = style === 2 ? this.hairLong : style === 3 ? this.hairBun : this.hairPonytail;
      this.headPoint(p, 0, 0.026, -0.012);
      this.part(hairBatch, this.local, 0.17, 0.19, 0.19, a.hair, p.headPitch, p.headYaw);
    }
    if (a.skirt) {
      this.local.x = p.hips.x;
      this.local.y = p.hips.y - 0.17;
      this.local.z = p.hips.z;
      this.part(this.skirts, this.local, a.shoulderWidth * 0.82, 0.42, 0.25 * a.build, a.trousers);
    }
    if (a.backpack) {
      this.local.x = p.chest.x;
      this.local.y = p.chest.y + 0.02;
      this.local.z = p.chest.z - 0.19 * a.build;
      this.part(this.backpacks, this.local, 0.3, 0.38, 0.16, shirtTone(a.shoes === "#d9d6cf" ? "#46566b" : "#6b3a32"), p.chestPitch, p.chestYaw);
    }
    if (a.glasses) {
      for (const side of [-1, 1]) {
        this.headPoint(p, side * 0.034, 0.02, 0.1);
        this.part(this.glasses, this.local, 0.026, 0.018, 0.012, "#4f4c47", p.headPitch, p.headYaw);
      }
    }
    if (a.hat) {
      // 帽冠包住头顶（比头部宽 1 cm），帽檐落在额头上方。
      this.headPoint(p, 0, 0.032, -0.004);
      this.part(this.hats, this.local, 0.102, 0.088, 0.122, a.coat, p.headPitch, p.headYaw);
      this.headPoint(p, 0, 0.034, 0.014);
      this.part(this.brims, this.local, 0.135, 0.01, 0.15, a.coat, p.headPitch, p.headYaw);
    }
    return true;
  }

  private faceDetail(actor: Actor, side: number): void {
    const p = actor.pose;
    const yaw = p.headYaw;
    const k = FACE_SCALE;
    const headY = p.head.y + HEAD_LIFT;
    const eyeX = side * 0.052 * k;
    const eyeZ = 0.126 * k;
    this.local.x = p.head.x + eyeX * Math.cos(yaw) + eyeZ * Math.sin(yaw);
    this.local.y = headY + 0.036 * k;
    this.local.z = p.head.z + eyeZ * Math.cos(yaw) - eyeX * Math.sin(yaw);
    // 头部网格已用形变与顶点色塑造眼窝、鼻梁、耳廓与嘴唇；这里只保留眨眼时的眼睑和眉毛，不再叠加小球五官。
    if (p.eyeBlink > 0.5) this.part(this.eyes, this.local, 0.011, 0.004, 0.004, actor.appearance.skin, p.headPitch, yaw);
    if (actor.appearance.glasses) this.part(this.glasses, this.local, 0.026, 0.018, 0.014, "#4f4c47", p.headPitch, yaw);
    this.local.y += (0.028 + p.browLift * 0.008) * k;
    this.part(this.brows, this.local, 0.024, 0.0045, 0.004, actor.appearance.hair, p.headPitch, yaw, side * p.browLift * -0.15);
    this.local.x = p.head.x + side * 0.126 * k * Math.cos(yaw);
    this.local.y = headY + 0.005 * k;
    this.local.z = p.head.z - side * 0.126 * k * Math.sin(yaw);

    if (side < 0) {
      this.local.x = p.head.x + 0.147 * k * Math.sin(yaw);
      this.local.y = headY - 0.003 * k;
      this.local.z = p.head.z + 0.147 * k * Math.cos(yaw);

      this.local.x = p.head.x + 0.131 * k * Math.sin(yaw);
      this.local.y = headY - (0.055 - p.smile * 0.003) * k;
      this.local.z = p.head.z + 0.131 * k * Math.cos(yaw);
      if (p.mouthOpen > 0.3) this.part(this.mouths, this.local, 0.018, 0.004 + p.mouthOpen * 0.006, 0.003, "#5a3a32", p.headPitch, yaw);
    }
  }

  private drawAnimals(context: LifeContext, alpha: number): void {
    for (const animal of context.animals) {
      if (!animal.visible) continue;
      this.actorPosition.x = lerp(animal.previousPosition.x, animal.position.x, alpha);
      this.actorPosition.y = 0.49 + animal.height;
      this.actorPosition.z = lerp(animal.previousPosition.z, animal.position.z, alpha);
      this.activeHeading = animal.heading;
      this.activeScale = animal.scale;
      if (animal.kind === "dog") this.drawDog(animal, context);
      else this.drawBird(animal);
    }
  }

  private drawDog(animal: LifeContext["animals"][number], context: LifeContext): void {
    this.part(this.dogBodies, { x: 0, y: 0.37, z: 0 }, 0.17, 0.19, 0.34, animal.color);
    this.part(this.dogHeads, { x: 0, y: 0.52, z: 0.27 }, 0.135, 0.14, 0.16, animal.color);
    this.part(this.dogHeads, { x: 0, y: 0.48, z: 0.4 }, 0.09, 0.075, 0.12, "#bfa780");
    for (const side of [-1, 1]) {
      this.part(this.dogHeads, { x: side * 0.1, y: 0.54, z: 0.26 }, 0.06, 0.13, 0.07, animal.color);
      this.part(this.animalEyes, { x: side * 0.072, y: 0.55, z: 0.39 }, 0.012, 0.012, 0.01, "#282623");
      for (const end of [-1, 1]) {
        const stride = Math.sin(animal.gaitPhase + (side === end ? 0 : Math.PI)) * Math.min(0.15, Math.hypot(animal.velocity.x, animal.velocity.z) * 0.1);
        const top = { x: side * 0.1, y: 0.32, z: end * 0.2 };
        const bottom = { x: side * 0.11, y: 0.055, z: end * 0.2 + stride };
        this.segment(this.dogLegs, top, bottom, 0.07, animal.color);
      }
    }
    this.segment(this.dogTails, { x: 0, y: 0.42, z: -0.29 }, { x: Math.sin(animal.tailPhase) * 0.14, y: 0.65, z: -0.43 }, 0.055, animal.color);
    const owner = context.actorById.get(animal.ownerId);
    if (owner?.visible) {
      const hand = owner.pose.leftHand;
      const scale = owner.appearance.height / 1.76;
      const start = {
        x: owner.position.x + (hand.x * Math.cos(owner.heading) + hand.z * Math.sin(owner.heading)) * scale,
        y: owner.groundY + hand.y * scale,
        z: owner.position.z + (hand.z * Math.cos(owner.heading) - hand.x * Math.sin(owner.heading)) * scale,
      };
      const end = { x: animal.position.x, y: 0.49 + animal.height + 0.48 * animal.scale, z: animal.position.z };
      const middle = { x: (start.x + end.x) * 0.5, y: Math.min(start.y, end.y) - 0.12, z: (start.z + end.z) * 0.5 };
      this.segmentWorld(this.leashes, start, middle, 0.007, "#705942");
      this.segmentWorld(this.leashes, middle, end, 0.007, "#705942");
    }
  }

  private drawBird(animal: LifeContext["animals"][number]): void {
    this.part(this.birdBodies, { x: 0, y: 0.12, z: 0 }, 0.07, 0.085, 0.13, animal.color);
    const flying = animal.state === "flying";
    for (const side of [-1, 1]) {
      const spread = flying ? 0.18 : 0.045;
      const flap = flying ? Math.sin(animal.gaitPhase) * 0.12 : 0;
      this.part(this.birdWings, { x: side * spread, y: 0.13 + flap, z: -0.01 }, flying ? 0.17 : 0.04, 0.014, 0.085, animal.color, 0, 0, side * (flying ? flap * 2 : 0.1));
      this.part(this.animalEyes, { x: side * 0.036, y: 0.18, z: 0.095 }, 0.008, 0.008, 0.008, "#252521");
    }
  }

  private drawVehicles(context: LifeContext, alpha: number): void {
    for (const vehicle of context.vehicles) {
      if (!vehicle.visible || vehicle.interior) continue;
      this.actorPosition.x = lerp(vehicle.previousPosition.x, vehicle.position.x, alpha);
      this.actorPosition.y = 0.42 + vehicle.suspension;
      this.actorPosition.z = lerp(vehicle.previousPosition.z, vehicle.position.z, alpha);
      this.activeHeading = vehicle.previousHeading + angleDelta(vehicle.previousHeading, vehicle.heading) * alpha;
      this.activeScale = 1;
      const bus = vehicle.kind === "bus";
      const fleet = this.vehicleShells[bus ? "bus" : vehicle.kind === "ambulance" ? "suv" : "sedan"];
      const shape = fleet.shape;
      const length = bus ? 9.2 : vehicle.kind === "ambulance" ? 5.1 : 4.3;
      const height = bus ? 2.7 : vehicle.kind === "ambulance" ? 1.82 : 1.45;
      const width = bus ? 2.35 : 1.85;
      const sx = width / shape.width;
      const sy = height / shape.height;
      const sz = length / shape.length;
      const origin = { x: 0, y: 0, z: 0 };
      this.part(fleet.body, origin, sx, sy, sz, vehicle.color);
      this.part(fleet.glass, origin, sx, sy, sz, "#607d8b");
      this.part(fleet.trim, origin, sx, sy, sz, "#252b2d");
      this.part(fleet.chrome, origin, sx, sy, sz, "#b2bbb9");
      const radius = shape.wheelR * sy;
      for (const wheel of shape.wheels) {
        const position = { x: wheel.x * sx, y: radius - vehicle.suspension, z: wheel.z * sz };
        const steering = wheel.z > 0 ? vehicle.steering : 0;
        this.drawFleetWheel(position, radius, steering, vehicle.wheelPhase);
      }
      for (const lamp of shape.lamps) {
        const position = { x: lamp.x * sx, y: lamp.y * sy, z: lamp.z * sz };
        const tint = lamp.tail ? vehicle.brake > 0.2 ? "#c64233" : "#772e28" : "#f3e2b4";
        this.part(this.vehicleLamps, position, 0.24, 0.1, 0.07, tint);
      }
      if (bus) {
        this.part(this.vehicleDoors, { x: width * 0.502, y: height * 0.5, z: 3.1 + vehicle.doors * 0.4 }, 0.04, 1.9, 0.85, "#445a63");
      }
      if (vehicle.kind === "taxi") this.part(this.vehicleLamps, { x: 0, y: height + 0.18, z: 0 }, 0.55, 0.17, 0.22, vehicle.occupancy.length ? "#797465" : "#d9bf59");
      if (vehicle.emergency) {
        const flash = Math.sin(context.time.seconds * 9) > 0;
        this.part(this.vehicleLamps, { x: -0.28, y: height + 0.2, z: 0.6 }, 0.35, 0.17, 0.25, flash ? "#d44a3f" : "#53443d");
        this.part(this.vehicleLamps, { x: 0.28, y: height + 0.2, z: 0.6 }, 0.35, 0.17, 0.25, flash ? "#374c63" : "#4b82bd");
      }
    }
  }

  private drawFleetWheel(position: Point3, radius: number, steering: number, phase: number): void {
    this.world(position, this.from);
    this.dummy.position.copy(this.from);
    this.dummy.rotation.set(0, this.activeHeading + steering, Math.PI / 2);
    this.wheelRotation.setFromAxisAngle(this.up, -phase);
    this.dummy.quaternion.multiply(this.wheelRotation);
    this.dummy.scale.setScalar(radius);
    this.dummy.updateMatrix();
    for (const batch of [this.vehicleWheels, this.vehicleRims]) {
      if (batch.used >= batch.capacity) continue;
      batch.mesh.setMatrixAt(batch.used, this.dummy.matrix);
      batch.mesh.setColorAt(batch.used, this.color.set(batch === this.vehicleWheels ? "#292d2d" : "#b3bab9"));
      batch.used++;
    }
  }

  dispose(): void {
    this.props.dispose();
    this.people.dispose();
    this.kit.group.remove(this.group);
    for (const batch of this.batches) {
      batch.mesh.removeFromParent();
      batch.mesh.dispose();
    }
    this.batches.length = 0;
  }
}
