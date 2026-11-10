#!/usr/bin/env node
/**
 * 把 Quaternius「LowPoly / Realistic Car Pack」(CC0) 的 OBJ 车型烘焙成交通车流使用的紧凑网格。
 *
 * 用法：node scripts/build-vehicle-assets.mjs "<Realistic Car Pack - Nov 2018>/OBJ"
 *
 * - 按材质拆成 车漆 / 玻璃 / 饰件(黑色塑料) / 镀铬 四组，与程序化车壳的 InstancedMesh 分组一致，
 *   车漆颜色仍由每辆车的实例颜色决定；
 * - 车轮对象被剥离，只导出轮心与半径：运行时继续使用可转动的程序化轮胎；
 * - 前后灯取灯组材质的左右质心，供夜间灯光与路面光斑定位。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeContainer } from "./meshopt-container.mjs";

const source = process.argv[2];
if (!source) throw new Error("usage: build-vehicle-assets.mjs <OBJ directory>");
const outDir = join(process.cwd(), "public/models/vehicles");
mkdirSync(outDir, { recursive: true });

const MODELS = { sedan: "NormalCar1", hatchback: "NormalCar2", suv: "SUV" };
const GROUP = (material) => material === "Windows" ? "glass" : material === "Black" ? "trim" : material === "Grey" || material === "Material.007" ? "chrome"
  : material === "Headlights" ? "head" : material === "TailLights" ? "tail" : "body";

const streams = {};
const manifest = {};
for (const [kind, name] of Object.entries(MODELS)) {
  const text = readFileSync(join(source, `${name}.obj`), "utf8").split("\n");
  const v = [], vn = [];
  const faces = []; // { object, material, corners: [[vi, ni]] }
  let object = "", material = "";
  for (const line of text) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === "v") v.push(parts.slice(1, 4).map(Number));
    else if (parts[0] === "vn") vn.push(parts.slice(1, 4).map(Number));
    else if (parts[0] === "o") object = parts[1];
    else if (parts[0] === "usemtl") material = parts[1];
    else if (parts[0] === "f") faces.push({ object, material, corners: parts.slice(1).map((c) => { const [a, , b] = c.split("/"); return [Number(a) - 1, Number(b) - 1]; }) });
  }
  // 车头朝向：前灯质心应在 +z。
  const centroid = (filter) => { let s = [0, 0, 0], n = 0; for (const f of faces) if (filter(f)) for (const [a] of f.corners) { s = s.map((x, i) => x + v[a][i]); n++; } return s.map((x) => x / Math.max(1, n)); };
  const flip = centroid((f) => f.material === "Headlights")[2] < 0;
  const P = (p) => flip ? [-p[0], p[1], -p[2]] : p;
  // 车轮：按对象与左右拆分，取包围盒中心与半径。
  const wheelGroups = new Map();
  for (const f of faces) {
    if (!/Wheel/i.test(f.object)) continue;
    for (const [a] of f.corners) {
      const p = P(v[a]);
      const key = `${f.object}:${p[0] > 0 ? "R" : "L"}`;
      const box = wheelGroups.get(key) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], p[i]); box.max[i] = Math.max(box.max[i], p[i]); }
      wheelGroups.set(key, box);
    }
  }
  const wheels = [...wheelGroups.values()].map((b) => ({ x: (b.min[0] + b.max[0]) / 2, y: (b.min[1] + b.max[1]) / 2, z: (b.min[2] + b.max[2]) / 2, r: (b.max[1] - b.min[1]) / 2 }));
  const wheelR = wheels.reduce((s, w) => s + w.r, 0) / wheels.length;
  // 轮胎触地点在 y=0。
  const lift = -Math.min(...wheels.map((w) => w.y - w.r));
  const groups = { body: [], glass: [], trim: [], chrome: [] };
  const lampPoints = { head: [], tail: [] };
  for (const f of faces) {
    if (/Wheel/i.test(f.object)) continue;
    const g = GROUP(f.material);
    if (g === "head" || g === "tail") {
      for (const [a] of f.corners) lampPoints[g].push(P(v[a]));
      groups.chrome.push(f); // 灯罩本体作为镀铬/透明件，夜间发光由灯块实例负责
      continue;
    }
    groups[g].push(f);
  }
  const lamps = [];
  for (const [g, tail] of [["head", false], ["tail", true]]) {
    for (const side of [-1, 1]) {
      const pts = lampPoints[g].filter((p) => Math.sign(p[0]) === side);
      if (!pts.length) continue;
      const c = pts.reduce((s, p) => s.map((x, i) => x + p[i]), [0, 0, 0]).map((x) => x / pts.length);
      lamps.push({ x: c[0], y: c[1] + lift, z: c[2] + (tail ? -0.02 : 0.02), tail });
    }
  }
  const entry = {};
  for (const [g, list] of Object.entries(groups)) {
    const map = new Map(), pos = [], nor = [], idx = [];
    for (const f of list) {
      const ids = f.corners.map(([a, n]) => {
        const key = `${a}/${n}`;
        let id = map.get(key);
        if (id === undefined) {
          id = pos.length / 3; map.set(key, id);
          const p = P(v[a]); pos.push(p[0], p[1] + lift, p[2]);
          const nn = P(vn[n] ?? [0, 1, 0]); nor.push(Math.round(nn[0] * 127), Math.round(nn[1] * 127), Math.round(nn[2] * 127), 0);
        }
        return id;
      });
      for (let i = 1; i < ids.length - 1; i++) idx.push(ids[0], ids[i], ids[i + 1]);
    }
    streams[`${kind}.${g}.position`] = { kind: "v", data: new Float32Array(pos), count: pos.length / 3, size: 12 };
    streams[`${kind}.${g}.normal`] = { kind: "v", data: new Int8Array(nor), count: pos.length / 3, size: 4 };
    streams[`${kind}.${g}.index`] = { kind: "i", data: new Uint16Array(idx), count: idx.length, size: 2 };
  }
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const f of faces) for (const [a] of f.corners) { const p = P(v[a]); for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); } }
  entry.length = max[2] - min[2];
  entry.width = max[0] - min[0];
  entry.height = max[1] + lift;
  entry.wheelR = wheelR;
  entry.wheels = wheels.map((w) => ({ x: w.x, z: w.z }));
  entry.lamps = lamps;
  entry.source = `${name}.obj`;
  manifest[kind] = entry;
  console.log(kind, name, "len", entry.length.toFixed(2), "wheels", entry.wheels.length, "lamps", lamps.length, "flip", flip);
}
const blob = await writeContainer(manifest, streams);
writeFileSync(join(outDir, "cars.bin"), blob);
console.log("bytes", blob.length);
