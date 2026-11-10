/** Procedural authoring source for every shared city model (residents, trees, vehicles).
 * Geometry is authored in metres at runtime; nothing is baked into the bundle and no external asset is used.
 * Fixed tessellation budgets are shared by all instances via InstancedMesh. */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
const figures = (() => {
/** 部件都放在单位盒里：Y 轴为长度，+Y 靠近关节，+Z 为身体前方。 */
function stitch(rings, capEnds = true) {
    const pos = [];
    const center = new THREE.Vector3();
    const push = (a, b, c) => {
        const n = b.clone().sub(a).cross(c.clone().sub(a));
        if (n.lengthSq() < 1e-8)
            return;
        n.normalize();
        const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
        const outward = n.dot(mid.clone().sub(center)) >= 0;
        const tri = outward ? [a, b, c] : [a, c, b];
        for (const p of tri) {
            pos.push(p.x, p.y, p.z);
        }
    };
    for (let s = 0; s < rings.length - 1; s++) {
        const a = rings[s];
        const b = rings[s + 1];
        for (let i = 0; i < a.length; i++) {
            const next = (i + 1) % a.length;
            push(a[i], a[next], b[next]);
            push(a[i], b[next], b[i]);
        }
    }
    if (capEnds) {
        for (const [ring, dir] of [[rings[0], -1], [rings[rings.length - 1], 1]]) {
            const c = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
            c.y += dir * 0.001;
            for (let i = 0; i < ring.length; i++)
                push(c, ring[i], ring[(i + 1) % ring.length]);
        }
    }
    // 共用环带顶点后再计算法线，衣料和肌肉连续过渡，不能把每个三角面当成硬折面。
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    const smooth = mergeVertices(geo, 0.00001);
    geo.dispose();
    smooth.computeVertexNormals();
    return smooth;
}
function ring(y, rx, rz, sides, shape) {
    const points = [];
    for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * Math.PI * 2;
        let x = Math.cos(ang) * rx;
        let z = Math.sin(ang) * rz;
        if (shape)
            [x, z] = shape(ang, x, z);
        points.push(new THREE.Vector3(x, y, z));
    }
    return points;
}
/** 颅骨、下颌和五官采用连续形变，避免按阈值推拉顶点造成额头尖角与脸部硬折面。 */
function createHead() {
    const geometry = new THREE.SphereGeometry(0.5, 24, 18);
    const position = geometry.getAttribute("position");
    const colors = [];
    const gaussian = (value, center, width) => Math.exp(-(((value - center) / width) ** 2));
    for (let index = 0; index < position.count; index++) {
        const nx = position.getX(index) * 2, ny = position.getY(index) * 2, nz = position.getZ(index) * 2;
        const front = THREE.MathUtils.smoothstep(nz, 0.4, 0.85);
        const jaw = 1 - Math.max(0, -ny) * 0.26;
        let x = nx * 0.43 * jaw;
        const y = ny * 0.56;
        let z = nz * 0.43;
        const eyeSocket = gaussian(Math.abs(nx), 0.26, 0.14) * gaussian(ny, 0.06, 0.13);
        const brow = gaussian(ny, 0.22, 0.09) * gaussian(Math.abs(nx), 0.25, 0.2);
        const nose = gaussian(nx, 0, 0.11) * gaussian(ny, -0.05, 0.22);
        const lips = gaussian(nx, 0, 0.16) * gaussian(ny, -0.18, 0.055);
        z += front * (nose * 0.115 - eyeSocket * 0.024 + brow * 0.018 + lips * 0.014);
        z += front * gaussian(ny, -0.5, 0.18) * 0.035;
        const ear = gaussian(Math.abs(nx), 0.99, 0.07) * gaussian(ny, 0, 0.22) * gaussian(nz, 0, 0.24);
        x += Math.sign(nx) * ear * 0.055;
        position.setXYZ(index, x, y, z);
        if (front > 0.7 && eyeSocket > 0.8)
            colors.push(0.22, 0.19, 0.17);
        else if (front > 0.7 && lips > 0.48)
            colors.push(1, 0.72, 0.68);
        else if (front > 0.7 && brow > 0.7)
            colors.push(0.74, 0.66, 0.6);
        else
            colors.push(1, 1, 1);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    return geometry;
}
/** 创建上下略扩张的颈部；返回由调用方统一释放的单位几何体。 */
function createNeck() {
    const rings = [0, 0.35, 0.7, 1].map((t) => {
        const y = -0.5 + t;
        const flare = t < 0.2 ? 0.46 : 0.34 + t * 0.08;
        return ring(y, flare, flare * 0.9, 10);
    });
    return stitch(rings);
}
/** 创建有胸背厚度、肩斜和衣领的上衣；顶点色表达领口与衣料接缝，支持实例染色。 */
function createTorso() {
    const sections = [
        // Tapered waist, fuller chest and sloping trapezius so shoulders read as anatomy rather than a flat box lid.
        { y: -0.5, hw: 0.39, hd: 0.41 },
        { y: -0.34, hw: 0.39, hd: 0.42 },
        { y: -0.08, hw: 0.36, hd: 0.39 },
        { y: 0.15, hw: 0.43, hd: 0.46 },
        { y: 0.29, hw: 0.49, hd: 0.44 },
        { y: 0.36, hw: 0.48, hd: 0.4 },
        { y: 0.42, hw: 0.39, hd: 0.34 },
        { y: 0.465, hw: 0.27, hd: 0.27 },
        { y: 0.5, hw: 0.18, hd: 0.22 },
    ];
    const rings = sections.map((section) => ring(section.y, section.hw, section.hd, 16, (angle, x, z) => {
        // 小幅不规则褶皱保留衣料体积，而非让躯干像收腰的硬塑料外壳。
        const drape = 0.5 + Math.max(0, -section.y);
        const fold = Math.sin(angle * 5 + section.y * 12) * 0.009 * drape
            + Math.sin(angle * 9 - section.y * 18) * 0.004;
        return [x * (1 + fold), z + fold];
    }));
    const geometry = stitch(rings);
    const position = geometry.getAttribute("position");
    const colors = [];
    for (let index = 0; index < position.count; index++) {
        const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
        const collar = y > 0.39 && z > 0.1;
        const seam = Math.abs(x) < 0.025 && z > 0.3;
        const hem = y < -0.45;
        const pocket = x > 0.12 && x < 0.31 && y > 0.09 && y < 0.24 && z > 0.32;
        const tone = collar ? 0.48 : seam ? 0.72 : hem ? 0.82 : pocket ? 0.86 : 1;
        colors.push(tone, tone, tone);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
}
/** 创建连接腰腹与双腿的骨盆裤装，避免两根腿直接插进上衣形成悬空关节。 */
function createPelvis() {
    return stitch([
        ring(-0.5, 0.28, 0.26, 16), ring(-0.28, 0.43, 0.42, 16),
        ring(0.08, 0.48, 0.45, 16), ring(0.4, 0.45, 0.43, 16), ring(0.5, 0.42, 0.41, 16),
    ]);
}
/** 创建圆肩背包；通过与躯干一起旋转的实例摆放，不额外引入骨骼和材质批次。 */
function createBackpack() {
    return stitch([
        ring(-0.5, 0.28, 0.3, 12), ring(-0.4, 0.44, 0.46, 12),
        ring(0.23, 0.44, 0.48, 12), ring(0.4, 0.32, 0.38, 12), ring(0.5, 0.18, 0.22, 12),
    ]);
}
function createLimb(radiusAt, bulge) {
    // Rounded joint domes at both ends let consecutive segments overlap like elbows and knees instead of
    // reading as flat-capped tubes; the shaft keeps the authored muscle profile.
    const stations = [0, 0.025, 0.06, 0.11, 0.22, 0.38, 0.55, 0.72, 0.86, 0.92, 0.96, 0.985, 1];
    const sides = 12;
    const rings = [];
    for (const t of stations) {
        const y = -0.5 + t;
        const edge = Math.min(t, 1 - t);
        const dome = edge >= 0.11 ? 1 : Math.sqrt(Math.max(0.04, 1 - ((0.11 - edge) / 0.11) ** 2));
        const points = [];
        for (let i = 0; i < sides; i++) {
            const ang = (i / sides) * Math.PI * 2;
            const radius = Math.max(0.12, radiusAt(THREE.MathUtils.clamp(t, 0.11, 0.89)) + bulge(t, ang)) * dome;
            points.push(new THREE.Vector3(Math.cos(ang) * radius, y, Math.sin(ang) * radius));
        }
        rings.push(points);
    }
    return stitch(rings);
}
/** 创建带肩部和肱二头肌轮廓的上臂，返回单位几何体。 */
function createUpperArm() {
    return createLimb((t) => 0.28 + t * 0.16 + Math.sin(t * Math.PI) * 0.06, (t, ang) => (t > 0.65 ? 0.08 * (t - 0.65) : 0) + Math.max(0, Math.sin(ang)) * 0.03 * Math.sin(t * Math.PI));
}
/** 创建从肘部向腕部收细的小臂，返回单位几何体。 */
function createForearm() {
    return createLimb((t) => 0.22 + t * 0.14, (t) => Math.sin(Math.min(1, t * 1.4) * Math.PI) * 0.04);
}
/** 创建带前侧肌肉弧度的大腿，返回单位几何体。 */
function createThigh() {
    return createLimb((t) => 0.3 + t * 0.12 + Math.sin(t * Math.PI) * 0.06, (t, ang) => Math.max(0, Math.sin(ang)) * 0.1 * Math.sin(t * Math.PI));
}
/** 创建脚踝收细、后侧鼓起的小腿，返回单位几何体。 */
function createCalf() {
    return createLimb((t) => 0.16 + Math.sin(t * Math.PI) * 0.12 + t * 0.04, (t, ang) => Math.max(0, -Math.sin(ang)) * 0.1 * Math.sin(Math.min(1, t * 1.3) * Math.PI));
}
/** 掌心朝前的对称手，手指朝 -Y，能跟着小臂转动。 */
function createHand() {
    const rings = [];
    const stacks = 7;
    for (let s = 0; s <= stacks; s++) {
        const t = s / stacks;
        const y = 0.5 - t;
        const palm = t > 0.25 && t < 0.7;
        const fingers = t >= 0.7;
        const rx = fingers ? 0.28 - (t - 0.7) * 0.25 : palm ? 0.42 : 0.26;
        const rz = fingers ? 0.16 : palm ? 0.18 : 0.22;
        rings.push(ring(y, rx, rz, 8, (ang, x, z) => {
            if (fingers)
                x += Math.sin(ang * 4) * 0.04;
            if (palm && Math.cos(ang) > 0.4 && t < 0.55)
                x += 0.1;
            return [x, z];
        }));
    }
    return stitch(rings);
}
/** 创建平底、圆鞋头与独立鞋底色的鞋，鞋尖朝 +Z，底面固定在单位高度 -0.5。 */
function createShoe() {
    const sections = [
        { z: -0.48, top: 0.12, width: 0.3 }, { z: -0.28, top: 0.48, width: 0.43 },
        { z: 0, top: 0.37, width: 0.46 }, { z: 0.28, top: 0.15, width: 0.43 },
        { z: 0.48, top: -0.12, width: 0.27 },
    ];
    const geometry = stitch(sections.map((section) => Array.from({ length: 12 }, (_, index) => {
        const angle = index / 12 * Math.PI * 2;
        const y = Math.sin(angle) < 0 ? -0.5 : -0.25 + Math.sin(angle) * (section.top + 0.25);
        return new THREE.Vector3(Math.cos(angle) * section.width, y, section.z);
    })));
    const position = geometry.getAttribute("position");
    const colors = [];
    for (let index = 0; index < position.count; index++) {
        const sole = position.getY(index) < -0.33;
        colors.push(...(sole ? [0.55, 0.52, 0.46] : [0.08, 0.1, 0.115]));
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    return geometry;
}
/** 创建贴合颅骨的发际线、鬓角和后脑包覆，前额留白且不叠一颗悬空的球。 */
function createHair() {
    const geometry = new THREE.SphereGeometry(0.52, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.66);
    const position = geometry.getAttribute("position");
    for (let index = 0; index < position.count; index++) {
        const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
        const azimuth = Math.atan2(z, x);
        const polar = Math.acos(THREE.MathUtils.clamp(y / 0.52, -1, 1));
        const frontal = Math.max(0, Math.sin(azimuth));
        const angle = polar * (1 - frontal * 0.34);
        const radius = 0.52 + Math.sin(azimuth * 3 + polar * 5) * 0.009;
        position.setXYZ(index, Math.cos(azimuth) * Math.sin(angle) * radius * 0.85, Math.cos(angle) * radius * 1.08, Math.sin(azimuth) * Math.sin(angle) * radius * 0.85);
    }
    geometry.computeVertexNormals();
    return geometry;
}
/** Long hair: the short cap plus a curved back panel that falls to the shoulders with a soft, layered hem. */
function createHairLong() {
    const cap = createHair().toNonIndexed();
    const points = [];
    for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        points.push(new THREE.Vector2(0.47 + Math.sin(t * Math.PI) * 0.05 - t * 0.06, 0.12 - t * 0.98));
    }
    const panel = new THREE.LatheGeometry(points, 18, Math.PI * 0.62, Math.PI * 1.76);
    const position = panel.getAttribute("position");
    for (let index = 0; index < position.count; index++) {
        const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
        const azimuth = Math.atan2(x, z);
        const ragged = y < -0.6 ? Math.sin(azimuth * 9) * 0.035 : 0;
        position.setXYZ(index, x, y + ragged, z * 0.92);
    }
    panel.computeVertexNormals();
    const back = panel.toNonIndexed();
    panel.dispose();
    const merged = mergeGeometries([cap, back], false);
    cap.dispose();
    back.dispose();
    if (!merged)
        throw new Error("长发几何合并失败");
    return merged;
}
/** Bun / updo: the short cap with a gathered knot behind the crown. */
function createHairBun() {
    const cap = createHair().toNonIndexed();
    const knot = new THREE.SphereGeometry(0.17, 12, 8);
    knot.scale(1, 0.86, 0.9);
    knot.translate(0, 0.3, -0.42);
    const flatKnot = knot.toNonIndexed();
    knot.dispose();
    const merged = mergeGeometries([cap, flatKnot], false);
    cap.dispose();
    flatKnot.dispose();
    if (!merged)
        throw new Error("发髻几何合并失败");
    return merged;
}
/** Ponytail: short cap plus a tapered tail that hangs from the back of the head. */
function createHairPonytail() {
    const cap = createHair().toNonIndexed();
    const tail = new THREE.LatheGeometry([
        new THREE.Vector2(0.001, 0.06), new THREE.Vector2(0.1, 0.03), new THREE.Vector2(0.13, -0.15),
        new THREE.Vector2(0.11, -0.4), new THREE.Vector2(0.06, -0.62), new THREE.Vector2(0.001, -0.7),
    ], 10);
    tail.rotateX(-0.28);
    tail.translate(0, 0.12, -0.5);
    const flatTail = tail.toNonIndexed();
    tail.dispose();
    const merged = mergeGeometries([cap, flatTail], false);
    cap.dispose();
    flatTail.dispose();
    if (!merged)
        throw new Error("马尾几何合并失败");
    return merged;
}
/** A-line skirt / coat tail in a unit box (+Y waist); pleat folds keep the hem from looking like a cone. */
function createSkirt() {
    const rings = [];
    for (let s = 0; s <= 6; s++) {
        const t = s / 6;
        rings.push(ring(0.5 - t, 0.4 + t * 0.12, 0.38 + t * 0.1, 20, (angle, x, z) => {
            const pleat = 1 + Math.sin(angle * 8) * 0.03 * t;
            return [x * pleat, z * pleat];
        }));
    }
    return stitch(rings, false);
}
/** 创建帽冠与向前伸出的帽檐；临时部件合并后释放，返回独立几何体。 */
function createCap() {
    const crown = new THREE.SphereGeometry(0.46, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const position = crown.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        const seam = Math.cos(Math.atan2(z, x) * 6) * 0.006;
        position.setXYZ(i, x * (1 + seam), y + 0.05, z * (1 + seam));
    }
    crown.computeVertexNormals();
    const brimShape = new THREE.Shape();
    brimShape.moveTo(-0.34, 0.08);
    brimShape.bezierCurveTo(-0.44, 0.29, -0.34, 0.58, 0, 0.61);
    brimShape.bezierCurveTo(0.34, 0.58, 0.44, 0.29, 0.34, 0.08);
    brimShape.quadraticCurveTo(0, 0.28, -0.34, 0.08);
    const brim = new THREE.ExtrudeGeometry(brimShape, { depth: 0.026, bevelEnabled: false, curveSegments: 8 });
    brim.rotateX(Math.PI / 2);
    brim.translate(0, 0.04, 0);
    const flatCrown = crown.toNonIndexed();
    const merged = mergeGeometries([flatCrown, brim], false);
    crown.dispose();
    flatCrown.dispose();
    brim.dispose();
    if (!merged)
        throw new Error("帽子几何合并失败");
    return merged;
}

return { createHead, createNeck, createTorso, createPelvis, createBackpack, createUpperArm, createForearm, createThigh, createCalf, createHand, createShoe, createHair, createCap, createHairLong, createHairBun, createHairPonytail, createSkirt };
})();

const trees = (() => {
function boughs(form) {
    if (form === "conifer") {
        // Whorled conifer: short, slightly drooping tiers that shrink toward a narrow leader.
        return Array.from({ length: 10 }, (_, index) => {
            const angle = index * 2.399963;
            const spread = 1.55 - index * 0.13;
            const y = 1.7 + index * 0.52;
            return {
                base: new THREE.Vector3(0.02, y + 0.12, 0),
                elbow: new THREE.Vector3(Math.cos(angle) * spread * 0.55, y + 0.02, Math.sin(angle) * spread * 0.55),
                tip: new THREE.Vector3(Math.cos(angle) * spread, y - 0.18, Math.sin(angle) * spread),
            };
        });
    }
    return Array.from({ length: 7 }, (_, index) => {
        const angle = index * 2.399963;
        const spread = (1.3 + (index % 3) * 0.24) * (form === "upright" ? 0.72 : 1);
        const y = 4.15 + (index % 4) * 0.45;
        return {
            base: new THREE.Vector3(0.06, 2.05 + index * 0.22, -0.04),
            elbow: new THREE.Vector3(Math.cos(angle) * spread * 0.58, y - 0.55, Math.sin(angle) * spread * 0.58),
            tip: new THREE.Vector3(Math.cos(angle) * spread, y, Math.sin(angle) * spread),
        };
    });
}
function branch(points, bottom, top, segments = 3, sides = 5) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, segments, 1, sides, false);
    const position = geometry.getAttribute("position");
    for (let row = 0; row <= segments; row++) {
        const t = row / segments;
        const center = curve.getPointAt(t);
        const radius = THREE.MathUtils.lerp(bottom, top, t);
        const basalFlare = 1 + Math.exp(-t * 15) * 0.15;
        for (let side = 0; side <= sides; side++) {
            const index = row * (sides + 1) + side;
            position.setXYZ(index, center.x + (position.getX(index) - center.x) * radius * basalFlare * (1 + Math.sin(side * 3.1 + t * 14) * 0.045), center.y + (position.getY(index) - center.y) * radius, center.z + (position.getZ(index) - center.z) * radius * basalFlare * (1 + Math.cos(side * 2.7 - t * 9) * 0.04));
        }
    }
    geometry.computeVertexNormals();
    return geometry;
}
function mergeOwned(parts, label) {
    try {
        const geometry = mergeGeometries(parts, false);
        if (!geometry)
            throw new Error(`${label}几何合并失败`);
        return geometry;
    }
    finally {
        parts.forEach((part) => part.dispose());
    }
}
/** 创建米制乔木的根张、弯曲主干、侧枝和次级枝；树型与树冠共用骨架，资源归调用方。 */
function createTreeTrunk(form = "spreading") {
    const parts = [branch([
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(-0.1, 0.7, 0.04),
            new THREE.Vector3(0.07, 2.4, -0.04), new THREE.Vector3(-0.15, 4.2, 0.1),
            new THREE.Vector3(0.08, 5.6, -0.06),
        ], 0.26, 0.035, 8, 8)];
    for (let root = 0; root < 5; root++) {
        const angle = root * 1.2566;
        parts.push(branch([
            new THREE.Vector3(Math.cos(angle) * 0.58, 0.025, Math.sin(angle) * 0.58),
            new THREE.Vector3(Math.cos(angle) * 0.2, 0.12, Math.sin(angle) * 0.2),
            new THREE.Vector3(-0.06, 0.6, 0.02),
        ], 0.025, 0.14, 2, 5));
    }
    for (const [index, limb] of boughs(form).entries()) {
        parts.push(branch([limb.base, limb.elbow, limb.tip], 0.1 - index * 0.005, 0.025));
        for (const side of [-1, 1]) {
            const tip = limb.tip.clone().add(new THREE.Vector3(side * 0.46, 0.65, side * 0.32));
            parts.push(branch([limb.elbow, limb.tip, tip], 0.028, 0.006, 2, 4));
        }
    }
    return mergeOwned(parts, "乔木枝干");
}
/** 创建分枝端点上的立体小叶簇；折面与不规则冠缘避免大片纸片和圆锥轮廓。 */
function createTreeCanopy(form = "spreading") {
    const cards = [];
    const centers = boughs(form).map((limb) => limb.tip.clone().add(new THREE.Vector3(0, 0.3, 0)));
    centers.push(new THREE.Vector3(0, form === "conifer" ? 7.0 : 5.7, 0));
    const orientation = new THREE.Quaternion();
    const front = new THREE.Vector3(0, 0, 1);
    for (const [cluster, center] of centers.entries()) {
        for (let index = 0; index < 16; index++) {
            const angle = index * 2.399963 + cluster * 0.83;
            const ny = 1 - 2 * (index + 0.5) / 16;
            const ring = Math.sqrt(1 - ny * ny);
            const direction = new THREE.Vector3(Math.cos(angle) * ring, ny, Math.sin(angle) * ring);
            const radius = 0.42 + (index % 3) * 0.17 + Math.sin(cluster * 1.9 + index) * 0.12;
            const card = new THREE.PlaneGeometry(1.05 + (index % 3) * 0.14, 0.96 + (index % 4) * 0.1, 2, 1);
            const position = card.getAttribute("position");
            const colors = [];
            for (let vertex = 0; vertex < position.count; vertex++) {
                const px = position.getX(vertex), py = position.getY(vertex);
                position.setXYZ(vertex, px * (1 + Math.sin(cluster + index * 2.6 + vertex) * 0.08), py, Math.abs(px) < 0.01 ? 0.13 : -0.03 + Math.sin(vertex + index) * 0.035);
                const shade = 0.76 + 0.12 * (direction.y + 1) + (index % 3) * 0.015;
                colors.push(shade, shade, shade * 0.96);
            }
            card.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
            card.computeVertexNormals();
            orientation.setFromUnitVectors(front, direction);
            card.applyQuaternion(orientation);
            card.translate(center.x + direction.x * radius, center.y + direction.y * radius * 0.76, center.z + direction.z * radius);
            cards.push(card);
        }
    }
    return mergeOwned(cards, "乔木叶簇");
}
/** 绘制带叶脉和明暗渐变的小枝叶簇透明贴图；每张叶卡包含细叶，而不是一张巨大叶片。 */
function paintLeafCluster(ctx) {
    const size = ctx.canvas.width;
    ctx.save();
    try {
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, size, size);
        const count = 72;
        for (let index = 0; index < count; index++) {
            const angle = index * 2.399963;
            const radius = size * 0.4 * Math.sqrt((index + 0.5) / count);
            const length = size * (0.061 + (index % 4) * 0.007);
            const width = length * (0.38 + (index % 3) * 0.04);
            ctx.save();
            try {
                ctx.translate(size / 2 + Math.cos(angle) * radius, size / 2 + Math.sin(angle) * radius * 0.91);
                ctx.rotate(angle + Math.sin(index * 3.1) * 0.5);
                const gradient = ctx.createLinearGradient(0, -width, 0, width);
                gradient.addColorStop(0, "#b8ca87");
                gradient.addColorStop(0.48, "#8ca35e");
                gradient.addColorStop(0.53, "#627d40");
                gradient.addColorStop(1, "#9aaf68");
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.moveTo(-length, 0);
                ctx.bezierCurveTo(-length * 0.5, -width, length * 0.35, -width, length, 0);
                ctx.bezierCurveTo(length * 0.35, width, -length * 0.5, width, -length, 0);
                ctx.fill();
                ctx.strokeStyle = "rgba(205,220,155,0.5)";
                ctx.lineWidth = size / 600;
                ctx.beginPath();
                ctx.moveTo(-length, 0);
                ctx.lineTo(length * 0.8, 0);
                for (const point of [-0.5, -0.1, 0.3]) {
                    ctx.moveTo(length * point, 0);
                    ctx.lineTo(length * (point + 0.2), -width * 0.6);
                    ctx.moveTo(length * point, 0);
                    ctx.lineTo(length * (point + 0.2), width * 0.6);
                }
                ctx.stroke();
            }
            finally {
                ctx.restore();
            }
        }
        ctx.globalCompositeOperation = "destination-in";
        const fade = ctx.createRadialGradient(size / 2, size / 2, size * 0.3, size / 2, size / 2, size * 0.5);
        fade.addColorStop(0, "rgba(0,0,0,1)");
        fade.addColorStop(0.7, "rgba(0,0,0,1)");
        fade.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = fade;
        ctx.fillRect(0, 0, size, size);
    }
    finally {
        ctx.restore();
    }
}

return { createTreeTrunk, createTreeCanopy, paintLeafCluster };
})();

const vehicles = (() => {
const profiles = {
    sedan: {
        // Modern saloon proportions: long low bonnet, steeply raked screens, fastback C-pillar and a rising waistline.
        length: 4.7, wheelR: 0.335, axles: [-1.4, 1.45], cabin: [0.2, 0.77], roof: [0.38, 0.58], pillars: [0.48],
        sections: [
            { t: 0, roof: 0.82, belt: 0.7, width: 0.82, roofWidth: 0.72 },
            { t: 0.05, roof: 0.95, belt: 0.87, width: 0.9, roofWidth: 0.82 },
            { t: 0.16, roof: 1.0, belt: 0.94, width: 0.92, roofWidth: 0.83 },
            { t: 0.21, roof: 1.05, belt: 0.96, width: 0.92, roofWidth: 0.8 },
            { t: 0.38, roof: 1.42, belt: 0.95, width: 0.92, roofWidth: 0.7 },
            { t: 0.48, roof: 1.45, belt: 0.94, width: 0.92, roofWidth: 0.71 },
            { t: 0.58, roof: 1.42, belt: 0.93, width: 0.92, roofWidth: 0.7 },
            { t: 0.77, roof: 0.97, belt: 0.9, width: 0.92, roofWidth: 0.83 },
            { t: 0.85, roof: 0.92, belt: 0.85, width: 0.91, roofWidth: 0.84 },
            { t: 0.96, roof: 0.79, belt: 0.69, width: 0.86, roofWidth: 0.78 },
            { t: 1, roof: 0.65, belt: 0.55, width: 0.78, roofWidth: 0.68 },
        ],
    },
    hatchback: {
        // Compact five-door: short bonnet, long roof and a near-vertical tailgate.
        length: 4.05, wheelR: 0.31, axles: [-1.24, 1.28], cabin: [0.06, 0.76], roof: [0.12, 0.58], pillars: [0.46],
        sections: [
            { t: 0, roof: 1.05, belt: 0.86, width: 0.84, roofWidth: 0.74 },
            { t: 0.04, roof: 1.3, belt: 0.93, width: 0.89, roofWidth: 0.74 },
            { t: 0.1, roof: 1.42, belt: 0.95, width: 0.9, roofWidth: 0.71 },
            { t: 0.3, roof: 1.47, belt: 0.95, width: 0.9, roofWidth: 0.71 },
            { t: 0.58, roof: 1.44, belt: 0.94, width: 0.9, roofWidth: 0.7 },
            { t: 0.76, roof: 1.0, belt: 0.92, width: 0.9, roofWidth: 0.82 },
            { t: 0.86, roof: 0.94, belt: 0.86, width: 0.89, roofWidth: 0.82 },
            { t: 0.96, roof: 0.8, belt: 0.7, width: 0.85, roofWidth: 0.76 },
            { t: 1, roof: 0.66, belt: 0.56, width: 0.77, roofWidth: 0.68 },
        ],
    },
    van: {
        // Panel/minivan: tall boxy body, steep screen and a stubby bonnet; rear quarter is solid panel.
        length: 5.1, wheelR: 0.36, axles: [-1.7, 1.55], cabin: [0.55, 0.9], roof: [0.6, 0.84], pillars: [0.7],
        sections: [
            { t: 0, roof: 1.92, belt: 1.02, width: 0.95, roofWidth: 0.9 },
            { t: 0.03, roof: 2.0, belt: 1.05, width: 0.98, roofWidth: 0.93 },
            { t: 0.5, roof: 2.02, belt: 1.05, width: 0.98, roofWidth: 0.93 },
            { t: 0.8, roof: 1.98, belt: 1.03, width: 0.98, roofWidth: 0.9 },
            { t: 0.86, roof: 1.32, belt: 1.0, width: 0.97, roofWidth: 0.88 },
            { t: 0.95, roof: 1.08, belt: 0.92, width: 0.94, roofWidth: 0.85 },
            { t: 1, roof: 0.9, belt: 0.76, width: 0.86, roofWidth: 0.78 },
        ],
    },
    suv: {
        length: 4.8, wheelR: 0.38, axles: [-1.42, 1.47], cabin: [0.12, 0.77], roof: [0.22, 0.62], pillars: [0.34, 0.5],
        sections: [
            { t: 0, roof: 1.02, belt: 0.87, width: 0.89, roofWidth: 0.81 },
            { t: 0.07, roof: 1.24, belt: 1.03, width: 0.97, roofWidth: 0.85 },
            { t: 0.22, roof: 1.72, belt: 1.05, width: 0.97, roofWidth: 0.75 },
            { t: 0.45, roof: 1.76, belt: 1.04, width: 0.98, roofWidth: 0.76 },
            { t: 0.62, roof: 1.73, belt: 1.03, width: 0.97, roofWidth: 0.75 },
            { t: 0.77, roof: 1.11, belt: 1, width: 0.97, roofWidth: 0.88 },
            { t: 0.94, roof: 1.03, belt: 0.89, width: 0.95, roofWidth: 0.86 },
            { t: 1, roof: 0.87, belt: 0.71, width: 0.85, roofWidth: 0.77 },
        ],
    },
    bus: {
        length: 8.8, wheelR: 0.46, axles: [-2.7, 2.55], cabin: [0.04, 0.98], roof: [0.08, 0.94], pillars: [0.19, 0.34, 0.49, 0.64, 0.8],
        sections: [
            { t: 0, roof: 2.55, belt: 1.14, width: 1.03, roofWidth: 0.96 },
            { t: 0.05, roof: 2.86, belt: 1.25, width: 1.19, roofWidth: 1.08 },
            { t: 0.5, roof: 2.91, belt: 1.25, width: 1.19, roofWidth: 1.08 },
            { t: 0.94, roof: 2.85, belt: 1.25, width: 1.19, roofWidth: 1.08 },
            { t: 1, roof: 2.53, belt: 1.07, width: 1.04, roofWidth: 0.97 },
        ],
    },
    truck: {
        length: 6.7, wheelR: 0.43, axles: [-1.85, 2.15], cabin: [0.64, 0.96], roof: [0.68, 0.9], pillars: [],
        sections: [
            { t: 0, roof: 2.44, belt: 1.1, width: 1.08, roofWidth: 1.04 },
            { t: 0.025, roof: 2.5, belt: 1.12, width: 1.1, roofWidth: 1.06 },
            { t: 0.57, roof: 2.5, belt: 1.12, width: 1.1, roofWidth: 1.06 },
            { t: 0.61, roof: 2.43, belt: 1.12, width: 1.04, roofWidth: 1 },
            { t: 0.64, roof: 2.05, belt: 1.02, width: 0.97, roofWidth: 0.87 },
            { t: 0.72, roof: 2.17, belt: 1.02, width: 0.99, roofWidth: 0.87 },
            { t: 0.9, roof: 2.12, belt: 1.02, width: 0.98, roofWidth: 0.86 },
            { t: 0.96, roof: 1.31, belt: 0.98, width: 0.95, roofWidth: 0.88 },
            { t: 1, roof: 1.08, belt: 0.88, width: 0.89, roofWidth: 0.82 },
        ],
    },
};
function sample(profile, t) {
    let index = 0;
    while (index < profile.sections.length - 2 && t > profile.sections[index + 1].t)
        index++;
    const a = profile.sections[index], b = profile.sections[index + 1];
    const linear = (t - a.t) / (b.t - a.t);
    const f = linear * linear * (3 - 2 * linear);
    const mix = (from, to) => THREE.MathUtils.lerp(from, to, f);
    return { t, roof: mix(a.roof, b.roof), belt: mix(a.belt, b.belt), width: mix(a.width, b.width), roofWidth: mix(a.roofWidth, b.roofWidth) };
}
function crossSection(profile, t) {
    const section = sample(profile, t);
    const z = (t - 0.5) * profile.length;
    let arch = 0.22;
    for (const axle of profile.axles) {
        const distance = Math.abs(z - axle);
        const clearance = profile.wheelR + 0.065;
        if (distance < clearance)
            arch = Math.max(arch, profile.wheelR + Math.sqrt(clearance ** 2 - distance ** 2));
    }
    const { width: w, roofWidth: rw, roof, belt } = section;
    const hoodCrease = Math.exp(-(((t - 0.84) / 0.14) ** 2)) * 0.018;
    const right = [
        new THREE.Vector3(0, 0.22, z),
        new THREE.Vector3(w * 0.7, 0.22, z),
        new THREE.Vector3(w * 0.98, arch, z),
        new THREE.Vector3(w, Math.max(arch + 0.03, belt * 0.78), z),
        new THREE.Vector3(w * 0.985, Math.max(arch + 0.06, belt), z),
        new THREE.Vector3(w * 0.94, Math.max(arch + 0.08, belt + 0.025), z),
        new THREE.Vector3(rw, roof - 0.065, z),
        new THREE.Vector3(rw * 0.91, roof - 0.006 + hoodCrease, z),
        new THREE.Vector3(0, roof + 0.025, z),
    ];
    return [...right, ...right.slice(1, 8).reverse().map((p) => new THREE.Vector3(-p.x, p.y, p.z))];
}
function normalized(geometry) {
    const result = geometry.index ? geometry.toNonIndexed() : geometry;
    if (result !== geometry)
        geometry.dispose();
    result.deleteAttribute("uv");
    return result;
}
function mergeOwned(parts) {
    try {
        const result = mergeGeometries(parts, false);
        if (!result)
            throw new Error("车辆细节几何合并失败");
        return result;
    }
    finally {
        parts.forEach((part) => part.dispose());
    }
}
function detailBox(width, height, depth, x, y, z) {
    const geometry = normalized(new THREE.BoxGeometry(width, height, depth));
    geometry.translate(x, y, z);
    return geometry;
}
/** 创建四类米制车辆；圆角截面、前后风挡、侧窗和车柱共享接缝，返回资源由调用方释放。 */
function createVehicleShell(kind) {
    const profile = profiles[kind];
    const positions = [];
    const bodyIndices = [], glassIndices = [], trimIndices = [];
    const cuts = new Set(Array.from({ length: 61 }, (_, index) => index / 60));
    profile.sections.forEach((section) => cuts.add(section.t));
    [...profile.cabin, ...profile.roof].forEach((t) => cuts.add(t));
    profile.pillars.forEach((t) => { cuts.add(t - 0.009); cuts.add(t + 0.009); });
    const samples = [...cuts].sort((a, b) => a - b);
    const rings = samples.map((t) => crossSection(profile, t));
    rings.forEach((ring) => ring.forEach((point) => positions.push(point.x, point.y, point.z)));
    const sides = rings[0].length;
    for (let row = 0; row < rings.length - 1; row++) {
        const t = (samples[row] + samples[row + 1]) / 2;
        const section = sample(profile, t);
        const cabin = t > profile.cabin[0] && t < profile.cabin[1] && section.roof - section.belt > 0.15;
        const pillar = profile.pillars.some((center) => Math.abs(t - center) < 0.009);
        const windshield = cabin && (t < profile.roof[0] || t > profile.roof[1]);
        for (let side = 0; side < sides; side++) {
            const sideWindow = [5, 6, 9, 10].includes(side);
            const topWindow = side === 7 || side === 8;
            const target = cabin && sideWindow && pillar ? trimIndices
                : cabin && ((sideWindow && !pillar) || (topWindow && windshield)) ? glassIndices : bodyIndices;
            const a = row * sides + side, b = row * sides + (side + 1) % sides;
            const c = b + sides, d = a + sides;
            target.push(a, b, c, a, c, d);
        }
    }
    const cap = (row, polygon, target, front) => {
        const center = polygon.reduce((sum, index) => sum.add(rings[row][index]), new THREE.Vector3()).divideScalar(polygon.length);
        const centerIndex = positions.length / 3;
        positions.push(center.x, center.y, center.z);
        for (let i = 0; i < polygon.length; i++) {
            const a = row * sides + polygon[i], b = row * sides + polygon[(i + 1) % polygon.length];
            target.push(centerIndex, front ? a : b, front ? b : a);
        }
    };
    for (const row of [0, rings.length - 1]) {
        if (kind === "bus") {
            cap(row, [0, 1, 2, 3, 4, 5, 11, 12, 13, 14, 15], bodyIndices, row > 0);
            cap(row, [5, 6, 7, 8, 9, 10, 11], glassIndices, row > 0);
        }
        else
            cap(row, Array.from({ length: sides }, (_, i) => i), bodyIndices, row > 0);
    }
    const all = new THREE.BufferGeometry();
    all.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    all.setIndex([...bodyIndices, ...glassIndices, ...trimIndices]);
    all.computeVertexNormals();
    const select = (indices) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", all.getAttribute("position"));
        geometry.setAttribute("normal", all.getAttribute("normal"));
        geometry.setIndex(indices);
        return normalized(geometry);
    };
    const body = select(bodyIndices), glass = select(glassIndices);
    const trimParts = trimIndices.length ? [select(trimIndices)] : [];
    all.dispose();
    const width = Math.max(...profile.sections.map((section) => section.width)) * 2;
    const height = Math.max(...profile.sections.map((section) => section.roof));
    const half = profile.length / 2;
    trimParts.push(detailBox(width * 0.63, 0.16, 0.035, 0, 0.45, half + 0.005), detailBox(width * 0.72, 0.1, 0.04, 0, 0.31, -half - 0.005));
    const chromeParts = [
        detailBox(0.39, 0.11, 0.045, 0, 0.59, half + 0.01),
        detailBox(0.39, 0.11, 0.045, 0, 0.59, -half - 0.012),
    ];
    for (const side of [-1, 1]) {
        const doorStops = kind === "truck" ? [0.69, 0.91] : kind === "bus" ? [0.17, 0.83] : kind === "van" ? [0.3, 0.56, 0.84] : kind === "hatchback" ? [0.2, 0.47, 0.72] : [0.3, 0.49, 0.7];
        for (const t of doorStops) {
            const section = sample(profile, t);
            trimParts.push(detailBox(0.012, section.belt - 0.26, 0.012, side * section.width * 1.003, (section.belt + 0.26) / 2, (t - 0.5) * profile.length));
            if (t !== doorStops[doorStops.length - 1]) {
                chromeParts.push(detailBox(0.038, 0.035, 0.18, side * section.width * 1.004, section.belt - 0.075, (t - 0.5) * profile.length + 0.22));
            }
        }
        // Mirror shells have rounded caps and a separate reflective face; their mounting stems follow the A pillars.
        const mirrorT = kind === "bus" ? 0.94 : kind === "truck" ? 0.9 : kind === "van" ? 0.84 : 0.7;
        const mirrorSection = sample(profile, mirrorT);
        const mirrorZ = (mirrorT - 0.5) * profile.length;
        const mirror = normalized(new THREE.SphereGeometry(1, 10, 6));
        mirror.scale(0.15, 0.085, 0.16);
        mirror.translate(side * (mirrorSection.width + 0.15), mirrorSection.belt + 0.13, mirrorZ);
        trimParts.push(mirror);
        trimParts.push(detailBox(0.17, 0.035, 0.045, side * (mirrorSection.width + 0.045), mirrorSection.belt + 0.1, mirrorZ));
        chromeParts.push(detailBox(0.19, 0.11, 0.018, side * (mirrorSection.width + 0.16), mirrorSection.belt + 0.13, mirrorZ - 0.12));
        if (kind === "suv")
            chromeParts.push(detailBox(0.055, 0.06, 1.9, side * 0.6, height + 0.05, -0.18));
    }
    // Wraparound bumpers, lamp housings and rocker panels give the body a real lower structure.
    const noseBelt = sample(profile, 1).belt, tailBelt = sample(profile, 0).belt;
    const noseWidth = sample(profile, 0.99).width * 2, tailWidth = sample(profile, 0.01).width * 2;
    trimParts.push(
        detailBox(noseWidth * 0.98, 0.2, 0.16, 0, 0.36, half - 0.02),
        detailBox(tailWidth * 0.98, 0.2, 0.16, 0, 0.36, -half + 0.02),
        detailBox(noseWidth * 0.5, 0.05, 0.05, 0, 0.27, half + 0.05),
    );
    for (const side of [-1, 1]) {
        trimParts.push(detailBox(0.06, 0.1, profile.length * 0.42, side * (width / 2 - 0.01), 0.3, (profile.axles[0] + profile.axles[1]) / 2));
        chromeParts.push(
            detailBox(noseWidth * 0.2, 0.09, 0.03, side * noseWidth * 0.32, noseBelt - 0.05, half + 0.035),
            detailBox(tailWidth * 0.18, 0.12, 0.03, side * tailWidth * 0.34, tailBelt - 0.02, -half - 0.035),
            detailBox(0.12, 0.05, 0.02, side * noseWidth * 0.36, 0.33, half + 0.07),
        );
    }
    // Radiator slats, tailgate handle and twin exhaust exits survive street-level views.
    for (let slot = -3; slot <= 3; slot++) {
        chromeParts.push(detailBox(0.026, 0.12, 0.024, slot * width * 0.061, 0.43, half + 0.029));
    }
    chromeParts.push(detailBox(0.22, 0.034, 0.026, 0, sample(profile, 0).belt - 0.03, -half - 0.025));
    for (const side of [-1, 1]) {
        const pipe = normalized(new THREE.CylinderGeometry(0.038, 0.038, 0.14, 8));
        pipe.rotateX(Math.PI / 2);
        pipe.translate(side * width * 0.29, 0.25, -half - 0.012);
        chromeParts.push(pipe);
    }
    const track = width / 2 - 0.09;
    return {
        body, glass, trim: mergeOwned(trimParts), chrome: mergeOwned(chromeParts),
        length: profile.length, width, height, wheelR: profile.wheelR,
        wheels: profile.axles.flatMap((z) => [-track, track].map((x) => ({ x, z }))),
        lamps: [-1, 1].flatMap((side) => [
            { x: side * width * 0.32, y: sample(profile, 1).belt + 0.02, z: half + 0.025, tail: false },
            { x: side * width * 0.33, y: sample(profile, 0).belt + 0.04, z: -half - 0.025, tail: true },
        ]),
    };
}
/** 创建半径为 1、轮轴沿 Y 的胎肩侧壁与五辐轮毂；统一按实际轮胎半径缩放。 */
function createVehicleWheel() {
    const tire = new THREE.LatheGeometry([
        new THREE.Vector2(0.59, -0.34), new THREE.Vector2(0.84, -0.34),
        new THREE.Vector2(0.96, -0.26), new THREE.Vector2(1, -0.14),
        new THREE.Vector2(1, 0.14), new THREE.Vector2(0.96, 0.26),
        new THREE.Vector2(0.84, 0.34), new THREE.Vector2(0.59, 0.34), new THREE.Vector2(0.59, -0.34),
    ], 20);
    const parts = [normalized(new THREE.LatheGeometry([
            new THREE.Vector2(0.55, -0.34), new THREE.Vector2(0.63, -0.34),
            new THREE.Vector2(0.63, 0.34), new THREE.Vector2(0.55, 0.34),
        ], 20)), normalized(new THREE.CylinderGeometry(0.16, 0.16, 0.72, 12))];
    for (const side of [-1, 1])
        for (let spoke = 0; spoke < 5; spoke++) {
            const geometry = detailBox(0.105, 0.055, 0.48, 0, side * 0.32, 0.34);
            geometry.rotateY(spoke * Math.PI * 2 / 5 + side * 0.12);
            parts.push(geometry);
        }
    return { tire, rim: mergeOwned(parts) };
}

return { createVehicleShell, createVehicleWheel };
})();

export function authorCityMeshes() {
const meshes = new Map();
for (const [name, create] of Object.entries(figures)) meshes.set(name.slice(6).toLowerCase(), create());
for (const form of ['spreading', 'upright', 'conifer']) {
  meshes.set(`${form}Trunk`, trees.createTreeTrunk(form));
  meshes.set(`${form}Canopy`, trees.createTreeCanopy(form));
}
const vehicleMetadata = {};
for (const kind of ['sedan', 'hatchback', 'van', 'suv', 'bus', 'truck']) {
  const shell = vehicles.createVehicleShell(kind);
  for (const part of ['body', 'glass', 'trim', 'chrome']) meshes.set(`${kind}${part}`, shell[part]);
  vehicleMetadata[kind] = Object.fromEntries(Object.entries(shell).filter(([key]) => !['body', 'glass', 'trim', 'chrome'].includes(key)));
}
const wheels = vehicles.createVehicleWheel();
meshes.set('tire', wheels.tire);
meshes.set('rim', wheels.rim);
return { meshes, vehicleMetadata };
}
