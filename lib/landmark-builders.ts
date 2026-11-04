import * as THREE from "three";
import type { CityLot } from "./city-map";
import { LandmarkKit, finish as f } from "./landmark-kit";

export type LandmarkPose = Readonly<{ open: number; detail: number; feature: number; time: number }>;
export type LandmarkBuilder = (kit: LandmarkKit, root: THREE.Group, lot: CityLot) => (pose: LandmarkPose) => void;

/** 双子研究塔：铜翼门厅、外露斜撑、可伸出的空中连廊和交易圆桌。 */
export const buildExchange: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  const front = d * .42;
  for (const side of [-1, 1]) {
    const x = side * w * .33;
    const top = h * (side === -1 ? 1 : .83);
    kit.box(root, f.dark, x, top / 2 + 1, -d * .08, w * .27, top, d * .75, "metal");
    for (let y = 4; y < top; y += 3.4) {
      kit.box(root, f.blue, x, y, d * .3, w * .25, 2.6, .14, "metal");
      for (const edge of [-1, 1]) {
        kit.box(root, f.blue, x + edge * w * .138, y, -d * .08, .12, 2.6, d * .73, "metal");
        for (let mullion = 0; mullion < 7; mullion++) kit.box(root, f.silver, x + edge * w * .142, y, -d * .4 + mullion * d * .105, .12, 3.4, .08, "metal");
      }
      kit.box(root, f.copper, x, y - 1.5, -d * .08, w * .29, .22, d * .79, "metal");
      for (let column = -2; column <= 2; column++) kit.box(root, f.silver, x + column * w * .05, y, front - 2.6, .1, 3.4, .18, "metal");
      if (Math.round(y) % 3 === 1) kit.box(root, f.warm, x - side * 1.8, y + .8, front - 2.48, 1.2, .08, .04, "light");
    }
    for (const edge of [-1, 1]) {
      const ex = x + edge * w * .14;
      kit.box(root, f.copper, ex, top / 2, front - 2.4, .28, top + 1, .45, "metal");
      for (let y = 2; y < top - 7; y += 9) kit.beam(root, f.silver, [ex, y, -d * .45], [ex, y + 9, d * .28], .14);
    }
    kit.box(root, f.ivory, x, top + 1, -d * .08, w * .3, .4, d * .79);
    kit.ring(root, f.copper, [x, top + 1.35, -d * .08], w * .105);
    kit.box(root, f.steel, x, top + 3.1, -d * .25, .15, 4, .15, "metal");
    kit.cylinder(root, f.warm, x, top + 5.2, -d * .25, .22, .35, "light");
  }
  kit.box(root, f.steel, 0, 13.5, 0, w, .6, d * .85, "metal");
  for (let i = -4; i <= 4; i++) kit.box(root, f.copper, i * w / 10, 13.9, 0, .13, .3, d * .83, "metal");
  const wings = [-1, 1].map((side) => {
    const wing = kit.node(root, `copper-wing-${side}`, [side * w * .47, 1.1, front]);
    kit.box(wing, f.dark, -side * w * .23, 5.8, 0, w * .46, 11.6, .18);
    for (let i = 0; i < 12; i++) for (const face of [-1, 1]) kit.box(wing, f.copper, -side * (.45 + i * w * .039), 5.8, face * .15, .2, 11.4, .32, "metal");
    for (const y of [1, 6, 11]) kit.cylinder(wing, f.silver, 0, y, 0, .23, .6);
    return wing;
  });
  const hall = kit.node(root, "research-hall");
  kit.box(hall, f.ivory, 0, 1.3, 1.3, w * .4, .25, d * .68);
  kit.cylinder(hall, f.steel, 0, 1.8, 1, 3.4, .7);
  kit.ring(hall, f.copper, [0, 2.25, 1], 3.5);
  for (const x of [-2.8, 0, 2.8]) kit.desk(hall, x, 1.5, -.3, f.cyan, 2.2);
  for (const x of [-3, 3]) kit.desk(hall, x, 1.5, 5.1, f.warm);
  const clock = kit.node(hall, "market-clock", [0, 8.8, 1]);
  kit.ring(clock, f.copper, [0, 0, 0], 2.6, [0, 0, 0]);
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6;
    kit.box(clock, f.warm, Math.sin(a) * 2.3, Math.cos(a) * 2.3, .03, .1, .28, .1, "light", [0, 0, -a]);
  }
  const hand = kit.node(clock, "clock-hand");
  kit.box(hand, f.copper, 0, 1, 0, .12, 2, .15, "metal");
  kit.beam(hall, f.silver, [0, 11.6, 1], [0, 13, 1]);
  const bridge = kit.node(root, "extending-skybridge", [0, h * .55, 0]);
  kit.box(bridge, f.steel, 0, 0, 0, w * .55, .5, d * .28, "metal");
  kit.glazing(bridge, 0, 1.7, d * .14, w * .54, 3);
  kit.box(bridge, f.copper, 0, 3.4, 0, w * .57, .3, d * .3, "metal");
  kit.box(bridge, f.warm, 0, -.32, d * .145, w * .54, .1, .1, "light");
  for (const x of [-w * .19, w * .19]) kit.plant(bridge, x, .25, 0, .8);
  return ({ open, feature, time }) => {
    wings.forEach((wing, i) => {
      wing.rotation.y = (i === 0 ? -1 : 1) * open * 1.9;
      wing.position.z = front - open * 2;
    });
    hall.visible = open > .025;
    bridge.position.z = feature * 4.5;
    hand.rotation.z = -time * .2;
  };
};

/** 三层书页工作室：铰接立面、书脊、阅览空间、抽拉白板与屋顶花园。 */
export const buildPages: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  kit.box(root, f.oak, 0, h / 2 + 1, -d * .43, w * .9, h, .6);
  for (let tier = 0; tier <= 3; tier++) {
    const y = 1.2 + tier * h / 3;
    kit.box(root, f.ivory, 0, y, -tier * .55, w * (1 - tier * .06), .4, d * (1 - tier * .06));
    for (const side of [-1, 1]) kit.box(root, f.oak, side * w * .44, h / 2, -d * .32, .4, h, .4);
    if (tier > 0) {
      kit.box(root, f.warm, 0, y - .25, d * (.48 - tier * .03), w * (.9 - tier * .06), .07, .08, "light");
      kit.box(root, f.oak, 0, y + 1, d * .36, w * .83, .1, .12);
      for (let post = -6; post <= 6; post++) kit.box(root, f.silver, post * w * .065, y + .55, d * .36, .07, .9, .07, "metal");
    }
  }
  const pages = [-1, 1].map((side) => {
    const page = kit.node(root, `unfolding-page-${side}`, [side * w * .46, h * .48 + 1, d * .44]);
    kit.box(page, f.ivory, -side * w * .23, 0, 0, w * .46, h * .92, .25);
    for (let line = 0; line < 14; line++) kit.box(page, line % 4 === 0 ? f.oak : f.stone, -side * w * .23, h * .38 - line * h * .057, .16, w * (line % 4 === 3 ? .24 : .36), .1, .08);
    for (const y of [-h * .35, 0, h * .35]) kit.cylinder(page, f.copper, 0, y, 0, .23, 1.2);
    return page;
  });
  const interior = kit.node(root, "knowledge-studio");
  for (let tier = 0; tier < 3; tier++) {
    const base = 1.45 + tier * h / 3;
    for (const x of [-w * .3, 0, w * .3]) {
      kit.desk(interior, x, base, -2, tier % 2 === 0 ? f.white : f.green, 3);
      kit.box(interior, f.oak, x, base + 2.4, -d * .36, 4.6, 4.8, .65);
      for (let row = 0; row < 3; row++) {
        kit.box(interior, f.ivory, x, base + 1 + row * 1.4, -d * .31, 4.4, .12, .7);
        for (let book = 0; book < 8; book++) kit.box(interior, [f.green, f.brick, f.ivory, f.blue][book % 4], x - 1.75 + book * .5, base + 1.55 + row * 1.4, -d * .32, .32, .9 + (book % 3) * .13, .55);
      }
    }
  }
  const board = kit.node(interior, "sliding-whiteboard", [0, h * .19, d * .3]);
  kit.box(board, f.oak, 0, 0, 0, w * .4, h * .2, .28);
  kit.box(board, f.white, 0, 0, .16, w * .38, h * .18, .04);
  for (let i = 0; i < 6; i++) kit.box(board, [f.copper, f.green, f.blue][i % 3], (i % 3 - 1) * w * .105, (i < 3 ? 1 : -1) * h * .043, .21, w * .07, h * .055, .05);
  for (const side of [-1, 1]) kit.box(board, f.steel, side * w * .17, -h * .14, 0, .12, h * .16, .12, "metal");
  for (const x of [-w * .29, w * .29]) {
    kit.plant(root, x, h + 1.5, -d * .19, 1.65);
    kit.box(root, f.oak, x, h + 2.2, d * .2, 4.4, .2, 1.1);
    for (const z of [-d * .26, d * .25]) kit.box(root, f.oak, x, h + 3.6, z, .2, 4.6, .2);
  }
  for (let i = -5; i <= 5; i++) kit.box(root, f.oak, i * w * .055, h + 6, 0, .18, .2, d * .58);
  return ({ open, detail, feature }) => {
    pages.forEach((page, i) => {
      page.rotation.y = (i === 0 ? -1 : 1) * open * (1.85 + feature * .12);
      page.position.z = d * .44 - open * d * .2;
    });
    interior.visible = open > .025;
    board.position.z = d * .3 + detail * d * .18;
  };
};

/** 轨道指挥塔：四肢外骨骼包围任务核心，可分离护甲与旋转工具舱。 */
export const buildCore: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  const radius = w * .32;
  kit.cylinder(root, f.steel, 0, 3, 0, w * .49, 4);
  kit.cylinder(root, f.silver, 0, 5.2, 0, w * .48, .4);
  kit.cylinder(root, f.steel, 0, h * .2, 0, w * .1, h * .32);
  kit.cylinder(root, f.steel, 0, h * .75, 0, w * .09, h * .2);
  kit.glazing(root, 0, h * .45, -d * .33, w * .65, h * .64);
  for (let tier = 0; tier < 3; tier++) {
    const y = 5.5 + tier * 3.3;
    kit.ring(root, f.silver, [0, y, 0], w * .42);
    for (let bay = 0; bay < 10; bay++) {
      const a = bay * Math.PI / 5;
      kit.box(root, f.blue, Math.cos(a) * w * .33, y + 1.1, Math.sin(a) * d * .33, 1.4, 2.3, 1, "metal", [0, -a, 0]);
      kit.box(root, f.cyan, Math.cos(a) * w * .36, y + 1.4, Math.sin(a) * d * .36, .2, .7, .2, "light");
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const x = Math.cos(a) * w * .54;
    const z = Math.sin(a) * d * .54;
    kit.beam(root, f.silver, [x, 2, z], [x * .7, h * .89, z * .7], .52);
    kit.beam(root, f.steel, [x, h * .2, z], [-z * .7, h * .48, x * .7], .18);
    kit.beam(root, f.silver, [x * .7, h * .89, z * .7], [0, h + 2, 0], .27);
    kit.box(root, f.cyan, x * .94, h * .25, z * .94, .13, h * .34, .13, "light");
  }
  for (const y of [h * .2, h * .43, h * .7, h * .87]) {
    kit.ring(root, f.silver, [0, y, 0], radius * 1.22);
    kit.ring(root, f.cyan, [0, y + .35, 0], radius * 1.22, [Math.PI / 2, 0, 0], "light");
    kit.ring(root, f.silver, [0, y + 1.25, 0], radius * 1.22);
    for (let post = 0; post < 16; post++) {
      const a = post * Math.PI / 8;
      kit.box(root, f.silver, Math.cos(a) * radius * 1.22, y + .7, Math.sin(a) * radius * 1.22, .1, 1.2, .1, "metal");
    }
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      kit.beam(root, f.steel, [0, y, 0], [Math.cos(a) * radius * 1.2, y, Math.sin(a) * radius * 1.2], .12);
    }
  }
  const armor = [-1, 1].map((side) => {
    const part = kit.node(root, `core-armor-${side}`, [side * w * .16, h * .43, d * .32]);
    kit.box(part, f.blue, 0, 0, 0, w * .31, h * .55, .6, "metal");
    for (let i = 0; i < 11; i++) {
      kit.box(part, f.steel, 0, -h * .24 + i * h * .047, .4, w * .29, .12, .18, "metal");
      kit.box(part, f.cyan, side * w * .11, -h * .23 + i * h * .047, .51, .12, .8, .08, "light");
    }
    return part;
  });
  const chamber = kit.node(root, "task-chamber", [0, h * .49, 0]);
  const crystal = kit.node(chamber, "task-crystal");
  kit.part(crystal, kit.crystalGeometry, f.cyan, [0, 0, 0], [3.2, 6.6, 3.2], "metal");
  kit.ring(crystal, f.warm, [0, 0, 0], 4.6, [.4, .3, 0], "light");
  const orbit = kit.node(chamber, "tool-orbit");
  kit.ring(orbit, f.silver, [0, 0, 0], radius * .9);
  const pods: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    const pod = kit.node(orbit, `tool-pod-${i}`, [Math.cos(a) * radius * .9, 0, Math.sin(a) * radius * .9]);
    pod.rotation.y = -a;
    kit.box(pod, f.silver, 0, 0, 0, 2.8, 4.8, 2.5, "metal");
    kit.box(pod, f.dark, 0, 0, 1.3, 2.4, 3.7, .16);
    for (let port = 0; port < 4; port++) kit.box(pod, f.cyan, 0, -1.2 + port * .8, 1.4, 1.7, .18, .05, "light");
    kit.cylinder(pod, f.steel, 0, 2.6, 0, 1, .4);
    pods.push(pod);
  }
  kit.cylinder(root, f.silver, 0, h * .94, 0, 2.5, 4);
  kit.part(root, kit.crystalGeometry, f.cyan, [0, h + 2, 0], [1, 2.8, 1], "light");
  return ({ open, detail, feature, time }) => {
    armor.forEach((part, i) => { part.position.x = (i === 0 ? -1 : 1) * (w * .16 + open * w * .24); part.rotation.y = (i === 0 ? 1 : -1) * open * .28; });
    chamber.visible = open > .025;
    crystal.rotation.y = time * .23;
    orbit.rotation.y = detail * time * .14;
    orbit.scale.setScalar(1 + detail * .12);
    pods.forEach((pod, i) => { pod.position.y = feature * (h * .17 + i * 2.2); });
  };
};

/** 工业实验工坊：可抬升厂门、锯齿天窗、带双指夹爪的关节机械臂。 */
export const buildWorkshop: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  const roofY = h * .72;
  kit.box(root, f.brick, 0, roofY / 2, -d * .44, w * .95, roofY, .65);
  for (const side of [-1, 1]) {
    kit.box(root, f.brick, side * w * .46, roofY / 2, 0, .65, roofY, d * .9);
    for (let row = 0; row < 24; row++) {
      kit.box(root, "#895949", side * (w * .46 + .33), .8 + row * .55, 0, .02, .025, d * .87);
      for (let joint = 0; joint < 12; joint++) kit.box(root, "#895949", side * (w * .46 + .34), .55 + row * .55, -d * .41 + (joint + row % 2 * .5) * d * .072, .02, .5, .02);
    }
    for (let bay = 0; bay < 5; bay++) {
      const z = -d * .4 + bay * d * .2;
      kit.box(root, f.steel, side * w * .47, roofY / 2, z, .35, roofY + .7, .35, "metal");
      kit.beam(root, f.silver, [side * w * .47, 1, z], [side * w * .47, roofY - 1, z + d * .18], .1);
    }
  }
  const skylights: THREE.Group[] = [];
  for (let bay = 0; bay < 4; bay++) {
    const z = -d * .34 + bay * d * .22;
    kit.beam(root, f.steel, [-w * .47, roofY, z], [w * .47, roofY, z], .17);
    for (let i = -3; i <= 3; i++) kit.beam(root, f.copper, [i * w * .13, roofY, z], [(i + .5) * w * .13, roofY + 2.1, z], .1);
    const roof = kit.node(root, `sawtooth-roof-${bay}`, [0, roofY + 2.1, z]);
    kit.box(roof, f.steel, 0, -1, d * .055, w * .96, .18, d * .23, "metal", [-.35, 0, 0]);
    kit.glazing(roof, 0, -.9, -d * .055, w * .94, 1.8);
    skylights.push(roof);
  }
  for (const x of [-w * .43, w * .43]) kit.box(root, f.copper, x, roofY / 2, d * .45, .7, roofY, .65, "metal");
  const door = kit.node(root, "folding-hangar-door", [0, roofY, d * .46]);
  const lowerDoor = kit.node(door, "folding-hangar-lower", [0, -roofY * .44, 0]);
  for (const panel of [door, lowerDoor]) {
    kit.box(panel, f.steel, 0, -roofY * .22, 0, w * .82, roofY * .44, .3, "metal");
    for (let i = 0; i < 6; i++) kit.box(panel, f.silver, 0, -.6 - i * roofY * .07, .2, w * .8, .09, .12, "metal");
    for (const side of [-1, 1]) kit.cylinder(panel, f.copper, side * w * .4, 0, 0, .19, .5);
  }
  for (let i = -5; i <= 5; i++) kit.box(root, i % 2 ? f.dark : f.copper, i * w * .075, 1.05, d * .48, w * .07, .06, .6);
  const shop = kit.node(root, "assembly-shop");
  for (const x of [-w * .34, w * .34]) {
    kit.desk(shop, x, 1.3, -d * .18, f.warm, 3.7);
    kit.box(shop, f.steel, x, 3.8, -d * .37, 4.4, 5.4, 1.2, "metal");
    for (let shelf = 0; shelf < 4; shelf++) kit.box(shop, f.copper, x, 1.5 + shelf * 1.35, -d * .29, 4, .12, .25, "metal");
  }
  kit.cylinder(shop, f.steel, -2, 1.8, -1, 2.1, 1.2);
  const shoulder = kit.node(shop, "robot-shoulder", [-2, 2.5, -1]);
  kit.cylinder(shoulder, f.copper, 0, .6, 0, 1.1, 1.2);
  kit.box(shoulder, f.copper, 0, 3, 0, .9, 4.4, .95, "metal");
  kit.part(shoulder, kit.cylinderGeometry, f.silver, [0, 5.2, 0], [.8, 1.3, .8], "metal", [Math.PI / 2, 0, 0]);
  const elbow = kit.node(shoulder, "robot-elbow", [0, 5.2, 0]);
  kit.box(elbow, f.copper, 2.1, 0, 0, 4.2, .8, .85, "metal");
  kit.box(elbow, f.steel, 1.9, .5, 0, 3.2, .18, .35, "metal");
  const gripper = kit.node(elbow, "robot-gripper", [4.2, -.5, 0]);
  kit.box(gripper, f.silver, 0, 0, 0, 1.2, .65, 1.2, "metal");
  const fingers = [-1, 1].map((side) => {
    const finger = kit.node(gripper, `gripper-finger-${side}`, [side * .65, -.8, 0]);
    kit.box(finger, f.steel, 0, 0, 0, .2, 1.2, .3, "metal");
    kit.box(finger, f.copper, -side * .2, -.55, 0, .5, .2, .35, "metal");
    return finger;
  });
  kit.box(shop, f.silver, 2.5, 2.2, 3.4, 5.2, .45, 6.5, "metal");
  for (let roller = 0; roller < 12; roller++) kit.part(shop, kit.cylinderGeometry, f.steel, [2.5, 2.5, .4 + roller * .56], [.15, 4.8, .15], "metal", [0, 0, Math.PI / 2]);
  const trolley = kit.node(shop, "dispatch-trolley", [2.5, 2.8, 3]);
  kit.box(trolley, f.copper, 0, .6, 0, 1.8, 1.2, 1.7, "metal");
  kit.box(trolley, f.cyan, 0, 1.25, 0, 1.4, .12, 1.3, "light");
  return ({ open, detail, feature, time }) => {
    door.rotation.x = -open * 1.57;
    lowerDoor.rotation.x = open * Math.PI;
    skylights.forEach((roof) => { roof.rotation.x = -open * .16; });
    shop.visible = open > .025;
    shoulder.rotation.y = detail * (.35 + Math.sin(time * .7) * .35);
    elbow.rotation.z = -detail * (.32 + Math.sin(time * .7 + .8) * .22);
    fingers.forEach((finger, i) => { finger.position.x = (i === 0 ? -1 : 1) * (.65 - detail * (.15 + Math.sin(time * .7) * .1)); });
    trolley.position.z = 3 + feature * (d * .35 + Math.sin(time * .5) * .5);
  };
};

/** 微缩电影院：阶梯座席、可收拢帷幕、胶片卷盘和本地几何片头。 */
export const buildCinema: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  for (const side of [-1, 1]) {
    kit.box(root, f.ivory, side * w * .46, h * .43, 0, .7, h * .86, d);
    for (let pilaster = 0; pilaster < 5; pilaster++) kit.box(root, f.copper, side * w * .49, h * .43, -d * .4 + pilaster * d * .2, .12, h * .78, .22, "metal");
  }
  kit.box(root, f.dark, 0, h * .43, -d * .46, w, h * .86, .45);
  kit.box(root, f.red, 0, h * .86, 0, w + .5, .5, d + .4);
  kit.box(root, f.copper, 0, h * .65, d * .54, w + .8, .7, 2.2, "metal");
  for (let i = 0; i < 20; i++) kit.part(root, kit.sphereGeometry, f.warm, [-w * .47 + i * w * .049, h * .65 - .4, d * .62], [.09, .09, .09], "light");
  const theater = kit.node(root, "screening-room");
  kit.box(theater, f.ivory, 0, h * .43, -d * .41, w * .82, h * .38, .16);
  kit.box(theater, f.dark, 0, h * .43, -d * .4, w * .77, h * .33, .05);
  const title = kit.node(theater, "local-film-title", [0, h * .43, -d * .39]);
  kit.ring(title, f.warm, [0, 0, .05], h * .1, [0, 0, 0], "light");
  kit.part(title, kit.crystalGeometry, f.white, [0, 0, .08], [.5, .7, .1], "light");
  for (const side of [-1, 1]) kit.box(title, f.copper, side * w * .27, 0, .06, w * .16, .06, .04, "light");
  for (let row = 0; row < 4; row++) {
    const z = -d * .12 + row * d * .16;
    const y = 1.1 + row * .6;
    kit.box(theater, f.dark, 0, y, z, w * .86, .5 + row * .6, d * .15);
    for (let seat = -3; seat <= 3; seat++) {
      if (seat === 0) continue;
      const x = seat * w * .112;
      kit.box(theater, f.red, x, y + .6, z, w * .08, .3, .8);
      kit.box(theater, f.red, x, y + 1.1, z + .4, w * .08, 1.2, .2);
      kit.box(theater, f.copper, x + w * .045, y + .95, z + .1, .08, .1, .8, "metal");
    }
    kit.box(theater, f.warm, 0, y + .3, z, .1, .07, d * .14, "light");
  }
  const curtains = [-1, 1].map((side) => {
    const curtain = kit.node(root, `velvet-curtain-${side}`, [side * w * .24, h * .33 + 1, d * .46]);
    for (let pleat = 0; pleat < 12; pleat++) kit.cylinder(curtain, pleat % 2 ? f.red : "#602638", -w * .225 + pleat * w * .041, 0, 0, w * .025, h * .6, "stone");
    return curtain;
  });
  const projector = kit.node(theater, "projector", [0, h * .64, d * .33]);
  kit.box(projector, f.steel, 0, 0, 0, 1.4, .9, 1.7, "metal");
  kit.part(projector, kit.cylinderGeometry, f.warm, [0, 0, -.95], [.3, .3, .3], "light", [Math.PI / 2, 0, 0]);
  // 四棱锥仅表达投影光路，端点与银幕对齐，不使用额外实时光源。
  const beamGeometry = kit.geometry(new THREE.ConeGeometry(1, 1, 4, 1, true).rotateY(Math.PI / 4));
  const beamHeight = h * .21;
  const beamDepth = d * .71;
  kit.part(projector, beamGeometry, f.warm, [0, -beamHeight / 2, -beamDepth / 2], [w * .48, Math.hypot(beamHeight, beamDepth), h * .24], "glass", [Math.atan2(beamDepth, beamHeight), 0, 0]);
  const moonShape = new THREE.Shape();
  const outerAngle = Math.acos((2.7 ** 2 - 2.5 ** 2 + 1.1 ** 2) / (2 * 1.1 * 2.7));
  const innerAngle = Math.acos((2.7 * Math.cos(outerAngle) - 1.1) / 2.5);
  moonShape.absarc(0, 0, 2.7, outerAngle, Math.PI * 2 - outerAngle, false);
  moonShape.absarc(1.1, 0, 2.5, Math.PI * 2 - innerAngle, innerAngle, true);
  moonShape.closePath();
  const moonGeometry = kit.geometry(new THREE.ExtrudeGeometry(moonShape, { depth: .18, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .05, bevelThickness: .05, curveSegments: 24 }));
  kit.part(root, moonGeometry, f.warm, [0, h + 2, -d * .18], [1, 1, 1], "light");
  kit.beam(root, f.copper, [0, h * .87, -d * .18], [0, h + 1, -d * .18], .08);
  const reels: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const reel = kit.node(root, `film-reel-${side}`, [side * w * .31, h * .97, -d * .2]);
    kit.ring(reel, f.copper, [0, 0, 0], 1.6, [0, 0, 0]);
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      kit.beam(reel, f.silver, [0, 0, 0], [Math.sin(a) * 1.5, Math.cos(a) * 1.5, 0], .08);
    }
    reels.push(reel);
    kit.box(root, f.oak, side * w * .3, h * .89, d * .22, w * .26, .25, .7);
  }
  return ({ open, detail, time }) => {
    curtains.forEach((curtain, i) => {
      curtain.position.x = (i === 0 ? -1 : 1) * w * (.24 + open * .2);
      curtain.scale.x = 1 - open * .82;
    });
    theater.visible = open > .025;
    projector.visible = detail > .1;
    title.rotation.z = Math.sin(time * .15) * .08;
    reels.forEach((reel) => { reel.rotation.z = time * .14 * open; });
  };
};

/** 信号观测站：分开的接收机柜、环形维护栈道与可转向的抛物天线。 */
export const buildObservatory: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  kit.cylinder(root, f.steel, 0, h * .28, 0, w * .43, h * .5);
  for (let tier = 0; tier < 6; tier++) {
    kit.ring(root, f.silver, [0, 1.3 + tier * h * .08, 0], w * .45);
    kit.ring(root, tier % 2 ? f.blue : f.cyan, [0, 1.5 + tier * h * .08, 0], w * .43, [Math.PI / 2, 0, 0], tier % 2 ? "metal" : "light");
  }
  const racks = [-1, 1].map((side) => {
    const rack = kit.node(root, `receiver-shell-${side}`, [side * w * .22, h * .28, d * .34]);
    kit.box(rack, f.blue, 0, 0, 0, w * .41, h * .46, 1.1, "metal");
    for (let row = 0; row < 9; row++) {
      kit.box(rack, f.silver, 0, -h * .2 + row * h * .047, .6, w * .38, .12, .18, "metal");
      kit.box(rack, f.warm, -side * w * .13, -h * .18 + row * h * .047, .72, .1, .3, .05, "light");
    }
    return rack;
  });
  const room = kit.node(root, "source-reading-room", [0, 0, d * .45]);
  kit.box(room, f.steel, 0, 1.3, 0, w * .72, .3, d * .4, "metal");
  for (const x of [-w * .22, 0, w * .22]) kit.desk(room, x, 1.5, 0, f.cyan, 2);
  kit.cylinder(root, f.silver, 0, h * .57, 0, w * .47, .4);
  kit.cylinder(root, f.steel, 0, h * .67, 0, 1.4, h * .2);
  const azimuth = kit.node(root, "antenna-azimuth", [0, h * .77, 0]);
  const elevation = kit.node(azimuth, "antenna-elevation");
  kit.part(elevation, kit.dishGeometry, f.ivory, [0, 0, 0], [w * .46, w * .24, w * .46], "metal", [Math.PI / 2, 0, 0]);
  kit.ring(elevation, f.silver, [0, 0, w * .1], w * .43, [0, 0, 0]);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    kit.beam(elevation, f.steel, [Math.cos(a) * w * .4, Math.sin(a) * w * .4, w * .1], [0, 0, w * .47], .07);
  }
  kit.part(elevation, kit.sphereGeometry, f.cyan, [0, 0, w * .47], [.32, .32, .5], "light");
  const lens = kit.node(root, "signal-lens", [0, h * .77, d * .48]);
  kit.ring(lens, f.cyan, [0, 0, 0], 2.7, [0, 0, 0], "light");
  kit.ring(lens, f.silver, [0, 0, 0], 3.1, [0, 0, 0]);
  for (const side of [-1, 1]) kit.beam(root, f.steel, [side * w * .36, h * .57, 0], [side * w * .36, h * .7, d * .28], .1);
  return ({ open, detail, feature, time }) => {
    racks.forEach((rack, i) => { rack.position.x = (i === 0 ? -1 : 1) * w * (.22 + open * .26); rack.rotation.y = (i === 0 ? -1 : 1) * open * .35; });
    room.visible = open > .025;
    azimuth.rotation.y = (1 - feature) * detail * Math.sin(time * .42) * .8;
    elevation.rotation.x = -.8 + open * .55 + feature * .25;
    lens.visible = feature > .05;
    lens.scale.setScalar(.5 + feature * .5);
  };
};

/** 消息驿站：折门、投递格、分拣信封与塔顶信标，不读取或发送真实消息。 */
export const buildPost: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  kit.box(root, f.green, 0, h * .38, -d * .43, w, h * .76, .5);
  for (const side of [-1, 1]) {
    kit.box(root, f.ivory, side * w * .47, h * .38, 0, .5, h * .76, d * .9);
    for (let z = -d * .35; z <= d * .35; z += d * .175) kit.box(root, f.copper, side * w * .49, h * .4, z, .12, h * .65, .12, "metal");
  }
  kit.box(root, f.green, 0, h * .79, 0, w + .6, .5, d + .6);
  kit.box(root, f.copper, 0, h * .8, d * .49, w, .12, .2, "metal");
  const doors = [-1, 1].map((side) => {
    const door = kit.node(root, `post-shutter-${side}`, [side * w * .46, h * .36 + .5, d * .45]);
    kit.box(door, f.green, -side * w * .23, 0, 0, w * .46, h * .66, .2);
    for (let i = 0; i < 13; i++) kit.box(door, f.ivory, -side * w * .23, -h * .29 + i * h * .048, .18, w * .43, .12, .2);
    kit.box(door, f.copper, -side * w * .39, 0, .32, .12, 1.1, .15, "metal");
    return door;
  });
  const interior = kit.node(root, "postal-interior");
  for (let col = -3; col <= 3; col++) for (let row = 0; row < 4; row++) {
    const x = col * w * .12;
    const y = 2.5 + row * h * .12;
    kit.box(interior, f.oak, x, y, -d * .36, w * .11, h * .11, .8);
    kit.box(interior, f.dark, x, y, -d * .32, w * .09, h * .085, .1);
    kit.box(interior, f.warm, x, y - h * .035, -d * .3, .5, .1, .08, "light");
  }
  kit.box(interior, f.oak, 0, 2.8, 1.2, w * .76, .3, 2.6);
  for (const x of [-w * .32, w * .32]) kit.box(interior, f.green, x, 1.8, 1.2, .5, 2, 2.1);
  kit.box(interior, f.steel, 0, 3, 1.2, w * .73, .12, 1.2, "metal");
  const letters: THREE.Group[] = [];
  for (let i = 0; i < 4; i++) {
    const letter = kit.node(interior, `sorted-envelope-${i}`);
    kit.box(letter, f.ivory, 0, 0, 0, 1.35, .85, .14);
    kit.beam(letter, f.copper, [-.65, .38, .09], [0, -.1, .09], .025);
    kit.beam(letter, f.copper, [0, -.1, .09], [.65, .38, .09], .025);
    kit.box(letter, f.green, .4, .18, .09, .18, .22, .02);
    letters.push(letter);
  }
  kit.cylinder(root, f.green, -w * .31, 2.1, d * .55, .7, 2.3, "stone");
  kit.box(root, f.dark, -w * .31, 2.8, d * .55 + .68, .85, .18, .08);
  const beaconY = h + 2;
  kit.cylinder(root, f.copper, w * .17, h * .93, -d * .17, .5, h * .3);
  kit.part(root, kit.sphereGeometry, f.warm, [w * .17, beaconY, -d * .17], [.65, .65, .65], "light");
  const waves = kit.node(root, "message-signal", [w * .17, beaconY, -d * .17]);
  for (let i = 1; i <= 3; i++) kit.ring(waves, f.cyan, [0, i * .65, 0], i * .85, [Math.PI / 2, 0, 0], "light");
  kit.box(root, f.oak, 0, h * .84, d * .21, w * .4, .2, .8);
  kit.plant(root, -w * .3, h * .82, -d * .25, 1.1);
  return ({ open, detail, feature, time }) => {
    doors.forEach((door, i) => { door.rotation.y = (i === 0 ? -1 : 1) * open * 2; });
    interior.visible = open > .025;
    letters.forEach((letter, i) => {
      const travel = ((time * .12 + i / 4) % 1);
      letter.position.set((detail > .02 ? travel - .5 : i / 4 - .4) * w * .65, 3.6 + (i === 3 ? feature * h * .74 : 0), 1.2);
      letter.rotation.z = Math.sin(time + i) * .06 * detail;
    });
    waves.visible = feature > .025;
    waves.scale.setScalar(feature * (1 + Math.sin(time * 1.6) * .12));
  };
};
