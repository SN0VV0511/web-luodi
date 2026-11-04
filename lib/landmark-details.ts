import type * as THREE from "three";
import type { LandmarkKind } from "./building-experience";
import type { CityLot } from "./city-map";
import { LandmarkKit, finish as f } from "./landmark-kit";

/**
 * 为可走近的建筑补齐人尺度细节；全部放入静态实例批次，不增加逐帧机构负担。
 * 楼梯、管路、护栏与设备按建筑用途布置，避免把相同装饰贴到每一栋楼上。
 */
export function buildLandmarkDetails(kit: LandmarkKit, root: THREE.Group, lot: CityLot, kind: LandmarkKind): void {
  const { width: w, depth: d, height: h } = lot;

  const stair = (x: number, y: number, z: number, rise: number, length: number): void => {
    for (let i = 0; i < 16; i++) kit.box(root, f.silver, x, y + i * rise / 16, z - i * length / 16, 1.6, .12, length / 15, "metal");
    for (const side of [-1, 1]) {
      kit.beam(root, f.steel, [x + side * .8, y, z], [x + side * .8, y + rise, z - length], .12);
      kit.beam(root, f.silver, [x + side * .8, y + 1, z], [x + side * .8, y + rise + 1, z - length], .055);
      for (let i = 0; i <= 4; i++) kit.box(root, f.silver, x + side * .8, y + i * rise / 4 + .5, z - i * length / 4, .06, 1, .06, "metal");
    }
  };
  const railing = (y: number, z: number, width: number): void => {
    kit.box(root, f.silver, 0, y + 1.05, z, width, .07, .08, "metal");
    for (let i = -5; i <= 5; i++) kit.box(root, f.silver, i * width / 10, y + .55, z, .055, 1, .055, "metal");
  };
  const vent = (x: number, y: number, z: number, size: number): void => {
    kit.box(root, f.silver, x, y, z, size, .7, size, "metal");
    kit.cylinder(root, f.steel, x, y + .39, z, size * .37, .1);
    kit.ring(root, f.silver, [x, y + .46, z], size * .34);
    for (let blade = 0; blade < 6; blade++) kit.box(root, f.silver, x, y + .45, z, size * .6, .04, .08, "metal", [0, blade * Math.PI / 6, 0]);
  };

  if (kind === "workshop") {
    const mezzanine = h * .49;
    kit.box(root, f.steel, 0, mezzanine, -d * .32, w * .87, .25, d * .2, "metal");
    railing(mezzanine, -d * .22, w * .86);
    stair(w * .37, 1.3, d * .25, mezzanine - 1.3, d * .47);
    // 高处走线与阀门让大面积砖墙具备设备尺度，而不是空的展示盒。
    for (let pipe = 0; pipe < 3; pipe++) {
      const y = h * .56 + pipe * .55;
      kit.beam(root, pipe === 0 ? f.copper : f.silver, [-w * .4, y, -d * .405], [w * .4, y, -d * .405], .1);
      kit.beam(root, f.silver, [-w * (.4 - pipe * .025), 1.2, -d * .405], [-w * (.4 - pipe * .025), y, -d * .405], .1);
      kit.ring(root, f.copper, [-w * .36, y, -d * .385], .32, [0, 0, 0]);
    }
    for (const x of [-w * .4, w * .4]) {
      for (const y of [1.4, h * .65]) {
        kit.box(root, f.steel, x, y, d * .46 + .36, .8, .65, .12, "metal");
        for (const dx of [-.25, .25]) for (const dy of [-.2, .2]) kit.part(root, kit.sphereGeometry, f.silver, [x + dx, y + dy, d * .46 + .44], [.06, .06, .035], "metal");
      }
    }
    for (const x of [-w * .25, w * .23]) vent(x, h * .78 + 1.8, -d * .36, 2);
    for (const x of [-5.8, 6.5]) kit.box(root, f.warm, x, 1.08, 1, .075, .02, 11, "light");
    for (const z of [-4.5, 6.5]) kit.box(root, f.warm, .35, 1.08, z, 12.3, .02, .075, "light");
    kit.box(root, f.steel, -w * .32, 3.8, d * .16, 3, 4.5, .3, "metal");
    for (let tool = 0; tool < 5; tool++) {
      const x = -w * .4 + tool * .55;
      kit.box(root, f.silver, x, 4, d * .16 + .2, .09, 1.1 + tool % 2 * .3, .1, "metal");
      kit.box(root, f.copper, x, 4.65, d * .16 + .2, .4, .12, .12, "metal");
    }
  } else if (kind === "pages" || kind === "fold") {
    const level = h / 3;
    for (let tier = 0; tier < 2; tier++) stair(w * .37, 1.45 + tier * level, d * .25, level, d * .47);
    for (let tier = 0; tier < 3; tier++) {
      const y = 1.45 + tier * level;
      for (const side of [-1, 1]) {
        kit.box(root, f.oak, side * w * .28, y + .7, d * .24, 3.2, .15, .9);
        kit.box(root, f.green, side * w * .28, y + .87, d * .24, 2.9, .2, .72);
        for (const dx of [-1.2, 1.2]) kit.box(root, f.steel, side * w * .28 + dx, y + .35, d * .24, .1, .7, .65, "metal");
      }
      for (let light = -1; light <= 1; light++) {
        kit.beam(root, f.silver, [light * w * .24, y + level - .4, 0], [light * w * .24, y + level - 1.5, 0], .035);
        kit.box(root, f.warm, light * w * .24, y + level - 1.55, 0, 3.2, .1, .14, "light");
      }
    }
  } else if (kind === "exchange") {
    for (const side of [-1, 1]) {
      const top = h * (side === -1 ? 1 : .83);
      vent(side * w * .33, top + 1.6, -d * .28, 2.1);
      kit.box(root, f.steel, side * w * .2, 5, -d * .2, .35, 7.5, d * .6, "metal");
      for (let rail = 0; rail < 8; rail++) kit.box(root, f.copper, side * w * .2, 1.8 + rail * .85, -d * .2, .4, .06, d * .58, "metal");
      for (let light = 0; light < 8; light++) kit.box(root, f.warm, side * w * .19, 12.8, -d * .28 + light * d * .075, .12, .07, .9, "light");
    }
    kit.box(root, f.oak, 0, 2.3, d * .34, 3.3, 2.2, .8);
    kit.box(root, f.copper, 0, 3.5, d * .34, 3.7, .15, 1, "metal");
    kit.box(root, f.cyan, 0, 2.5, d * .385, 1.2, .2, .02, "light");
  } else if (kind === "cinema") {
    for (const side of [-1, 1]) {
      // 吸音墙分块与入口壁灯，避免把放映厅做成明亮的空白石盒。
      for (let bay = 0; bay < 6; bay++) {
        kit.box(root, f.red, side * w * .43, h * .37, -d * .32 + bay * d * .125, .18, h * .5, d * .09);
        kit.box(root, f.warm, side * w * .415, h * .52, -d * .32 + bay * d * .125, .04, .4, .15, "light");
      }
      kit.box(root, f.copper, side * w * .36, h * .46, d * .52, .16, h * .32, .16, "metal");
      kit.ring(root, f.warm, [side * w * .36, h * .56, d * .52], .4, [0, 0, 0], "light");
    }
    railing(h * .88, d * .42, w * .86);
    vent(w * .27, h * .9, -d * .31, 1.1);
  } else if (kind === "post") {
    kit.box(root, f.oak, 0, h * .65, -d * .32, w * .86, .2, d * .18);
    railing(h * .66, -d * .23, w * .85);
    for (const side of [-1, 1]) {
      kit.box(root, f.copper, side * w * .42, h * .39, -d * .3, .12, h * .65, .12, "metal");
      for (let rung = 0; rung < 12; rung++) kit.box(root, f.silver, side * w * .36, 1.4 + rung * .75, -d * .28, .8, .06, .1, "metal");
    }
    for (const z of [-d * .38, d * .38]) {
      kit.box(root, f.copper, 0, h * .87, z, w * .88, .07, .07, "metal");
      for (let post = -4; post <= 4; post++) kit.box(root, f.copper, post * w * .11, h * .835, z, .05, h * .07, .05, "metal");
    }
  }
}
