import * as THREE from "three";
import type { LandmarkBuilder } from "./landmark-builders";
import { finish as f } from "./landmark-kit";

/** 光庭：多层石柱廊与中庭水镜，立面和屋顶遮阳片共同转动。 */
export const buildCourtyard: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  kit.box(root, f.stone, 0, h / 2, -d * .43, w, h, .6);
  for (const side of [-1, 1]) {
    kit.box(root, f.stone, side * w * .46, h / 2, 0, .65, h, d * .9);
    for (let i = 0; i < 4; i++) kit.box(root, f.ivory, side * w * .43, h / 2, -d * .36 + i * d * .24, .4, h, .4);
    for (let floor = 1; floor <= 3; floor++) {
      kit.box(root, f.ivory, side * w * .35, floor * h / 3, 0, w * .24, .35, d);
      kit.box(root, f.copper, side * w * .23, floor * h / 3 + .75, 0, .06, .06, d * .85, "metal");
    }
  }
  kit.box(root, f.stone, 0, h, 0, w + .6, .4, d + .6);
  kit.box(root, f.blue, 0, 1.1, 0, w * .39, .12, d * .6, "metal");
  kit.box(root, f.glass, 0, 1.2, 0, w * .38, .06, d * .59, "glass");
  const fins: THREE.Group[] = [];
  for (let i = 0; i < 9; i++) {
    const fin = kit.node(root, `courtyard-fin-${i}`, [-w * .43 + i * w * .107, h / 2 + .7, d * .46]);
    kit.box(fin, f.ivory, 0, 0, 0, w * .105, h - .8, .2);
    kit.box(fin, f.copper, 0, 0, .12, .06, h - 1, .06, "metal");
    fins.push(fin);
  }
  const roofFins: THREE.Group[] = [];
  for (let i = 0; i < 7; i++) {
    const fin = kit.node(root, `courtyard-roof-fin-${i}`, [-w * .39 + i * w * .13, h + .6, 0]);
    kit.box(fin, f.oak, 0, 0, 0, w * .11, .15, d * .9);
    roofFins.push(fin);
  }
  for (const side of [-1, 1]) {
    kit.box(root, f.oak, side * w * .32, 1.7, d * .05, .9, .2, d * .56);
    kit.plant(root, side * w * .31, 1, -d * .34, 1.1);
  }
  return ({ open, feature }) => {
    fins.forEach((fin) => { fin.rotation.y = open * 1.36; });
    roofFins.forEach((fin) => { fin.rotation.z = open * .3 + feature * .7; });
  };
};

/** 折阁：陶土双折翼与可掀起的折纸屋顶，铰链连接保留真实的层级关系。 */
export const buildFold: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  for (let tier = 0; tier <= 3; tier++) kit.box(root, f.ivory, 0, 1 + tier * h / 3, 0, w, .4, d);
  kit.box(root, f.brick, 0, h / 2, -d * .45, w, h, .5);
  for (const side of [-1, 1]) {
    kit.box(root, f.steel, side * w * .45, h / 2, -d * .38, .24, h + 1, .24, "metal");
    kit.box(root, f.steel, side * w * .45, h / 2, d * .4, .24, h + 1, .24, "metal");
    for (let floor = 0; floor < 3; floor++) kit.desk(root, side * w * .24, 1.3 + floor * h / 3, -d * .17, f.warm, 2.6);
  }
  const wings = [-1, 1].map((side) => {
    const inner = kit.node(root, `terracotta-fold-${side}`, [side * w * .47, h / 2 + 1, d * .46]);
    const outer = kit.node(inner, `terracotta-tip-${side}`, [-side * w * .235, 0, 0]);
    for (const [part, offset] of [[inner, -side * w * .1175], [outer, -side * w * .1175]] as const) {
      kit.box(part, f.brick, offset, 0, 0, w * .235, h, .3);
      for (let seam = 0; seam < 18; seam++) kit.box(part, f.copper, offset, -h * .46 + seam * h * .054, .18, w * .22, .05, .04, "metal");
      for (const y of [-h * .42, 0, h * .42]) kit.cylinder(part, f.silver, 0, y, 0, .13, 1);
    }
    return { inner, outer, side };
  });
  const roof = kit.node(root, "folded-roof", [0, h + 1.5, -d * .43]);
  for (const side of [-1, 1]) kit.box(roof, f.copper, side * w * .24, 1, d * .43, w * .52, .24, d, "metal", [0, 0, side * -.28]);
  return ({ open, feature }) => {
    wings.forEach(({ inner, outer, side }) => { inner.rotation.y = side * open * 1.2; outer.rotation.y = -side * open * 1.7; });
    roof.rotation.x = -(open * .12 + feature * .2);
  };
};

/** 天穹台：百叶基座、分瓣穹顶与带黄铜轨道的机械天球仪。 */
export const buildOrrery: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  kit.cylinder(root, f.dark, 0, h * .32, 0, w * .4, h * .6);
  for (let floor = 0; floor < 9; floor++) {
    const y = 1.2 + floor * h * .067;
    kit.ring(root, f.blue, [0, y, 0], w * .43);
    if (floor % 3 === 0) kit.ring(root, f.cyan, [0, y + .2, 0], w * .41, [Math.PI / 2, 0, 0], "light");
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    kit.beam(root, f.silver, [Math.cos(a) * w * .42, 1, Math.sin(a) * d * .42], [Math.cos(a) * w * .34, h * .66, Math.sin(a) * d * .34], .12);
  }
  kit.cylinder(root, f.silver, 0, h * .64, 0, w * .49, .4);
  const dome = [-1, 1].map((side) => {
    const shell = kit.node(root, `dome-shell-${side}`, [0, h * .65, 0]);
    const start = side < 0 ? -Math.PI / 2 : Math.PI / 2;
    const geometry = kit.geometry(new THREE.SphereGeometry(1, 24, 12, start, Math.PI, 0, Math.PI / 2));
    kit.part(shell, geometry, f.blue, [0, 0, 0], [w * .51, h * .29, d * .51], "metal");
    for (let rib = 0; rib <= 6; rib++) {
      const phi = start + rib * Math.PI / 6;
      for (let segment = 0; segment < 8; segment++) {
        const a = segment * Math.PI / 16;
        const b = (segment + 1) * Math.PI / 16;
        kit.beam(shell, f.silver,
          [-Math.cos(phi) * Math.sin(a) * w * .515, Math.cos(a) * h * .294, Math.sin(phi) * Math.sin(a) * d * .515],
          [-Math.cos(phi) * Math.sin(b) * w * .515, Math.cos(b) * h * .294, Math.sin(phi) * Math.sin(b) * d * .515], .055);
      }
    }
    return shell;
  });
  const orrery = kit.node(root, "celestial-orrery", [0, h * .79, 0]);
  kit.part(orrery, kit.sphereGeometry, f.warm, [0, 0, 0], [1.5, 1.5, 1.5], "light");
  for (let ring = 0; ring < 3; ring++) {
    const radius = w * (.19 + ring * .085);
    kit.ring(orrery, f.copper, [0, 0, 0], radius, [Math.PI * (.3 + ring * .16), ring * .5, ring * .25]);
    kit.part(orrery, kit.sphereGeometry, [f.blue, f.ivory, f.green][ring], [radius, 0, 0], [.4, .4, .4], "metal");
  }
  kit.ring(root, f.silver, [0, h * .92, 0], w * .47, [Math.PI / 2, 0, 0]);
  return ({ open, feature, time }) => {
    dome.forEach((shell, i) => { shell.position.x = (i === 0 ? -1 : 1) * w * open * .31; shell.rotation.z = (i === 0 ? 1 : -1) * open * .35; });
    orrery.visible = open > .025;
    orrery.rotation.y = time * .12;
    orrery.rotation.z = feature * .25;
  };
};

/** 生长院：木结构温室、种植台、可开启的双坡玻璃天窗。 */
export const buildGreenhouse: LandmarkBuilder = (kit, root, { width: w, depth: d, height: h }) => {
  for (let tier = 0; tier <= 2; tier++) {
    const y = 1 + tier * h * .36;
    kit.box(root, f.ivory, 0, y, 0, w, .35, d);
    for (const side of [-1, 1]) {
      kit.box(root, f.oak, side * w * .45, h * .38, 0, .25, h * .76, .25);
      kit.box(root, f.green, side * w * .34, y + .4, -d * .1, w * .19, .7, d * .6);
      for (let plant = 0; plant < 3; plant++) kit.plant(root, side * w * .34, y + .8, -d * .3 + plant * d * .22, .65 + tier * .08);
    }
  }
  kit.box(root, f.oak, 0, h * .4, -d * .45, w, h * .8, .35);
  for (let bay = 0; bay < 5; bay++) {
    const z = -d * .44 + bay * d * .22;
    for (const side of [-1, 1]) {
      kit.beam(root, f.oak, [side * w * .47, 1, z], [side * w * .47, h * .74, z], .14);
      kit.beam(root, f.oak, [side * w * .47, h * .74, z], [0, h, z], .16);
    }
  }
  kit.glazing(root, 0, h * .37 + .8, d * .46, w * .94, h * .73);
  const leaves = [-1, 1].map((side) => {
    const leaf = kit.node(root, `greenhouse-vent-${side}`, [0, h, 0]);
    const angle = side * -.74;
    leaf.rotation.z = angle;
    kit.box(leaf, f.glass, side * w * .29, 0, 0, w * .58, .12, d, "glass");
    for (let beam = 0; beam < 6; beam++) kit.box(leaf, f.oak, side * w * .29, .07, -d * .46 + beam * d * .184, w * .58, .14, .12);
    kit.box(leaf, f.oak, side * w * .58, 0, 0, .16, .16, d);
    return { leaf, side, angle };
  });
  for (const y of [1.35, h * .36 + 1.35]) {
    kit.box(root, f.oak, 0, y + .75, 0, w * .35, .15, .85);
    for (const x of [-w * .13, w * .13]) kit.box(root, f.steel, x, y + .35, 0, .12, .7, .7, "metal");
  }
  return ({ open, feature }) => {
    leaves.forEach(({ leaf, side, angle }) => { leaf.rotation.z = angle + side * (open * .6 + feature * .35); });
  };
};
