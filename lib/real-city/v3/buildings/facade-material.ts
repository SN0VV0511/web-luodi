import * as THREE from "three";

/** 立面着色器共享的时间 / 昼夜 uniform。 */
export const facadeUniforms = { uNight: { value: 0 }, uTime: { value: 0 }, uWet: { value: 0 } };

const COMMON = /* glsl */ `
varying vec2 vFUv;
varying vec4 vFA;
varying vec4 vFB;
varying vec4 vFC;
varying vec3 vFWorld;
uniform float uNight;
uniform float uTime;
uniform float uWet;
float fh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float fnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(fh21(i), fh21(i + vec2(1.0, 0.0)), f.x), mix(fh21(i + vec2(0.0, 1.0)), fh21(i + vec2(1.0)), f.x), f.y);
}
float fbox(vec2 p, vec2 lo, vec2 hi) { return step(lo.x, p.x) * step(p.x, hi.x) * step(lo.y, p.y) * step(p.y, hi.y); }
vec3 frameColor(float id) {
  if (id < 0.5) return vec3(0.86, 0.86, 0.84);
  if (id < 1.5) return vec3(0.09, 0.1, 0.11);
  if (id < 2.5) return vec3(0.33, 0.2, 0.11);
  return vec3(0.03, 0.03, 0.035);
}
`;

const FRAGMENT = /* glsl */ `
{
  vec2 fp = vFUv;
  float kind = vFA.x;
  float floorH = max(vFA.y, 0.5);
  float bay = max(vFA.z, 0.3);
  float seed = vFA.w;
  float tex = vFB.x;
  float winW = vFB.y;
  float winH = vFB.z;
  float groundH = vFB.w;
  float topLimit = vFC.x;
  float frameId = vFC.y;
  float sill = vFC.z;
  float litP = vFC.w;
  vec3 base = diffuseColor.rgb;
  float fr = 0.86;
  float fm = 0.0;
  vec3 fe = vec3(0.0);
  // 屏幕像素对应的立面米数：远处把细碎纹理淡出为平均色，避免闪烁。
  float aa = max(length(fwidth(fp)), 1e-4);
  float detail = 1.0 - smoothstep(0.02, 0.09, aa);
  // ---- 墙面材质 ----
  if (kind < 4.5 || kind > 16.5) {
    if (tex > 0.5 && tex < 1.5) {
      vec2 b = fp / vec2(0.24, 0.075);
      float row = floor(b.y);
      b.x += mod(row, 2.0) * 0.5;
      vec2 f = fract(b), id = floor(b);
      float mortar = max(step(f.x, 0.05), step(f.y, 0.13));
      vec3 brick = base * (0.78 + 0.36 * fh21(id + seed));
      vec3 c = mix(brick, vec3(0.55, 0.53, 0.5) * 0.85, mortar);
      base = mix(base * 0.94, c, detail);
      fr = 0.92;
    } else if (tex > 1.5 && tex < 2.5) {
      float f = fract(fp.y / 0.2);
      float shade = 1.0 - 0.18 * smoothstep(0.78, 1.0, f) + 0.05 * step(f, 0.1);
      base *= mix(0.97, shade, detail);
      fr = 0.7;
    } else if (tex > 2.5 && tex < 3.5) {
      vec2 g = fp / vec2(bay, floorH);
      vec2 f = fract(g);
      float joint = max(step(f.x, 0.012), step(f.y, 0.02));
      base *= (0.92 + 0.12 * fh21(floor(g) + seed)) * (1.0 - joint * 0.35 * detail);
      fr = 0.8;
    } else if (tex > 3.5 && tex < 4.5) {
      vec2 b = fp / vec2(0.62, 0.38);
      b.x += mod(floor(b.y), 2.0) * 0.37;
      vec2 f = fract(b);
      float joint = max(step(f.x, 0.025), step(f.y, 0.04));
      base *= (0.86 + 0.22 * fh21(floor(b) + seed)) * (1.0 - joint * 0.25 * detail);
      fr = 0.9;
    } else if (tex > 4.5) {
      float f = fract(fp.x / 0.16);
      base *= mix(1.0, (0.86 + 0.14 * fnoise(vec2(fp.x * 6.0, fp.y * 0.6))) * (1.0 - 0.25 * step(0.93, f)), detail);
      fr = 0.8;
    } else {
      base *= 0.95 + 0.08 * fnoise(fp * 1.7 + seed) * detail;
    }
    // 底部泛潮与雨痕
    base *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.6, fp.y));
  }
  // ---- 窗 ----
  bool glazed = false;
  vec2 cell = vec2(0.0);
  vec2 local = vec2(0.0);
  float winMask = 0.0;
  float frameMask = 0.0;
  if (kind > 0.5 && kind < 4.5 && fp.y < topLimit) {
    float y = fp.y;
    float cx = floor(fp.x / bay);
    float ux = fract(fp.x / bay);
    if (kind > 1.5 && kind < 2.5 && y < groundH) {
      // 商铺橱窗：开间之间留石材壁柱，上部招牌带。
      float hi = groundH - 0.75;
      winMask = fbox(vec2(ux, y), vec2(0.07, 0.12), vec2(0.93, hi));
      float inner = fbox(vec2(ux, y), vec2(0.1, 0.16), vec2(0.9, hi - 0.05));
      frameMask = winMask - inner;
      winMask = inner;
      cell = vec2(cx, -1.0);
      local = vec2((ux - 0.1) / 0.8, (y - 0.16) / max(hi - 0.21, 0.1));
      if (winMask > 0.5) {
        vec3 shop = mix(vec3(0.18, 0.16, 0.13), vec3(0.42, 0.36, 0.28), fnoise(vec2(cx * 3.1, y * 2.0) + seed));
        base = mix(vec3(0.06, 0.07, 0.08), shop, 0.45);
        fr = 0.06; fm = 0.35;
        fe = vec3(1.0, 0.82, 0.58) * (0.35 + uNight * 1.6) * (0.5 + 0.5 * fh21(vec2(cx, seed))) * (0.15 + 0.85 * uNight);
        glazed = true;
      } else if (frameMask > 0.5) {
        base = frameColor(frameId); fr = 0.4; fm = 0.5;
      }
    } else if (kind > 2.5 && kind < 3.5) {
      // 玻璃幕墙：竖梃每半开间，楼层处深色层间板。
      float fy = fract((y - groundH) / floorH);
      float fl = floor((y - groundH) / floorH);
      float mull = step(fract(fp.x / (bay * 0.5)), 0.035);
      float spandrel = step(fy, 0.22);
      cell = vec2(floor(fp.x / (bay * 0.5)), fl);
      if (spandrel > 0.5) {
        base = mix(base * 0.35, vec3(0.06, 0.07, 0.08), 0.6); fr = 0.3; fm = 0.4;
      } else if (mull > 0.5) {
        base = frameColor(frameId); fr = 0.35; fm = 0.6;
      } else {
        vec3 tint = mix(vec3(0.07, 0.11, 0.13), base * 0.25, 0.5);
        base = tint * (0.85 + 0.3 * fh21(cell + seed));
        fr = 0.04 + 0.05 * fh21(cell.yx + seed); fm = 0.72;
        glazed = true; winMask = 1.0;
        local = vec2(fract(fp.x / (bay * 0.5)), (fy - 0.22) / 0.78);
      }
    } else if (y > groundH) {
      float yy = y - groundH;
      float fl = floor(yy / floorH);
      float fy = fract(yy / floorH);
      cell = vec2(cx, fl);
      if (kind > 3.5) {
        // 条带窗：每层一条连续玻璃带，1.5 米竖梃。
        winMask = step(sill, fy) * step(fy, sill + winH);
        float m = step(fract(fp.x / 1.5), 0.03);
        frameMask = winMask * m + (step(sill - 0.025, fy) - step(sill, fy)) + (step(sill + winH, fy) - step(sill + winH + 0.02, fy));
        winMask *= 1.0 - m;
        cell = vec2(floor(fp.x / 1.5), fl);
        local = vec2(fract(fp.x / 1.5), (fy - sill) / winH);
      } else {
        vec2 lo = vec2(0.5 - winW * 0.5, sill);
        vec2 hi = vec2(0.5 + winW * 0.5, sill + winH);
        float outer = fbox(vec2(ux, fy), lo - vec2(0.035, 0.03), hi + vec2(0.035, 0.02));
        float inner = fbox(vec2(ux, fy), lo, hi);
        winMask = inner;
        frameMask = outer - inner;
        local = vec2((ux - lo.x) / max(hi.x - lo.x, 0.01), (fy - lo.y) / max(hi.y - lo.y, 0.01));
        // 窗台：窗下方一条浅色石材
        float sillBand = fbox(vec2(ux, fy), vec2(lo.x - 0.06, lo.y - 0.07), vec2(hi.x + 0.06, lo.y - 0.03));
        base = mix(base, vec3(0.78, 0.76, 0.72), sillBand * detail);
      }
      if (frameMask > 0.5) { base = frameColor(frameId); fr = 0.45; fm = 0.2; }
      if (winMask > 0.5) glazed = true;
    }
    if (glazed && !(kind > 1.5 && kind < 2.5 && fp.y < groundH)) {
      float r = fh21(cell + seed * 1.37);
      float r2 = fh21(cell.yx * 1.7 + seed);
      if (kind < 2.5 || kind > 3.5) {
        // 普通窗：深色室内 + 窗格十字 + 部分窗帘 / 百叶。
        vec3 interior = mix(vec3(0.035, 0.04, 0.05), vec3(0.16, 0.13, 0.1), r2 * 0.6);
        float curtain = step(0.62, r) * step(1.0 - (0.25 + r2 * 0.5), local.y);
        vec3 fabric = mix(vec3(0.82, 0.78, 0.7), vec3(0.55, 0.62, 0.68), fh21(cell * 3.3));
        base = mix(interior, fabric * 0.55, curtain);
        float muntin = (step(abs(local.x - 0.5), 0.025) + step(abs(local.y - 0.62), 0.02) * step(0.5, fract(seed * 5.1))) * detail;
        base = mix(base, frameColor(frameId), clamp(muntin, 0.0, 1.0));
        // 窗洞上沿阴影（假凹进）
        base *= 1.0 - 0.45 * smoothstep(0.82, 1.0, local.y);
        fr = mix(0.05, 0.7, curtain); fm = mix(0.55, 0.0, curtain);
      }
      // 夜间亮窗：每格独立概率与色温。
      float on = step(r2, litP) * uNight;
      vec3 warm = mix(vec3(1.0, 0.72, 0.42), vec3(0.75, 0.85, 1.0), step(0.8, r));
      fe += warm * on * (0.6 + 1.1 * fh21(cell * 2.9 + seed)) * (1.0 - 0.35 * smoothstep(0.7, 1.0, local.y));
    }
  }
  // 玻璃：程序化天空 / 街景反射 + 菲涅耳，避免整片黑窗；夜间反射压暗，由亮窗主导。
  if (glazed) {
    vec3 gn = normalize(vNormal);
    vec3 gv = normalize(vViewPosition);
    float fres = pow(1.0 - clamp(abs(dot(gn, gv)), 0.0, 1.0), 4.0);
    vec3 rw = inverseTransformDirection(reflect(-gv, gn), viewMatrix);
    float wobble = (fh21(cell * 5.3 + seed) - 0.5) * 0.18;
    float ry = rw.y + wobble;
    vec3 sky = ry > 0.0 ? mix(vec3(0.72, 0.78, 0.83), vec3(0.34, 0.49, 0.69), sqrt(clamp(ry, 0.0, 1.0)))
                        : mix(vec3(0.46, 0.47, 0.45), vec3(0.2, 0.21, 0.2), clamp(sqrt(-ry) * 1.6, 0.0, 1.0));
    sky *= mix(1.0, 0.05, uNight);
    float reflectivity = (kind > 2.5 && kind < 3.5) ? 0.75 : 0.5;
    base = mix(base, sky, clamp(0.16 + 0.6 * fres, 0.0, 0.8) * reflectivity * (1.0 - step(0.7, fr)));
    fm = min(fm, 0.12);
    fr = max(fr, 0.14);
  }
  // ---- 屋面 / 其他 ----
  if (kind > 4.5 && kind < 5.5) {
    vec2 t = fp / vec2(0.32, 0.3);
    t.x += mod(floor(t.y), 2.0) * 0.5;
    vec2 f = fract(t);
    float shade = 0.82 + 0.3 * fh21(floor(t) + seed);
    float edge = smoothstep(0.75, 1.0, f.y);
    base *= mix(0.95, shade * (1.0 - 0.28 * edge) * (1.0 - 0.15 * step(f.x, 0.04)), detail);
    base *= 0.85 + 0.25 * fnoise(fp * 0.5 + seed);
    fr = 0.78;
  } else if (kind > 5.5 && kind < 6.5) {
    float f = fract(fp.x / 0.45);
    base *= mix(0.96, 1.0 - 0.3 * step(0.92, f) + 0.1 * step(f, 0.06), detail);
    fr = 0.42; fm = 0.55;
  } else if (kind > 7.5 && kind < 8.5) {
    // 木栅栏：竖板之间镂空。
    float f = fract(fp.x / 0.14);
    float rail = step(abs(fp.y - 0.25), 0.04) + step(abs(fp.y - 0.85), 0.04);
    if (f > 0.66 && rail < 0.5) discard;
    float tip = fp.y - (1.0 - abs(f - 0.33) * 0.6);
    if (tip > 0.0 && rail < 0.5) discard;
    base *= 0.9 + 0.15 * fh21(vec2(floor(fp.x / 0.14), seed));
  } else if (kind > 8.5 && kind < 9.5) {
    float f = fract(fp.y / 0.12);
    base *= 1.0 - 0.25 * smoothstep(0.7, 1.0, f) * detail;
    fr = 0.5; fm = 0.4;
  } else if (kind > 9.5 && kind < 10.5) {
    float n = fnoise(fp * 1.3 + seed) * 0.6 + fnoise(fp * 7.0) * 0.4;
    base = mix(vec3(0.1, 0.2, 0.05), vec3(0.2, 0.33, 0.09), n);
    fr = 0.95;
  } else if (kind > 10.5 && kind < 11.5) {
    vec2 g = fp / vec2(0.6, 0.6);
    vec2 f = fract(g);
    float joint = max(step(f.x, 0.03), step(f.y, 0.03));
    base *= (0.9 + 0.14 * fh21(floor(g) + seed)) * (1.0 - joint * 0.3 * detail);
    fr = 0.85;
  } else if (kind > 11.5 && kind < 12.5) {
    vec2 g = fract(fp / vec2(1.0, 1.65));
    float cellLine = max(step(g.x, 0.03), step(g.y, 0.02));
    float sub = step(fract(fp.x / 0.166), 0.06) * detail;
    base = mix(vec3(0.03, 0.05, 0.11), vec3(0.75), cellLine) + sub * 0.03;
    fr = 0.12; fm = 0.6;
  } else if (kind > 12.5 && kind < 13.5) {
    // 栏杆：顶扶手 + 竖向栏杆，其余镂空。
    float top = step(0.9, fp.y);
    float bottom = step(fp.y, 0.08);
    float post = step(fract(fp.x / 0.12), 0.22);
    if (top + bottom + post < 0.5) discard;
    fr = 0.4; fm = 0.6;
  } else if (kind > 13.5 && kind < 14.5) {
    vec2 c = fract(fp / vec2(0.55, 0.55)) - 0.5;
    float fan = smoothstep(0.26, 0.2, length(c)) * (0.6 + 0.4 * step(0.5, fract(atan(c.y, c.x) * 1.27 + uTime * 6.0)));
    base *= 1.0 - fan * 0.55;
    fr = 0.5; fm = 0.3;
  } else if (kind > 14.5 && kind < 15.5) {
    float glass = fbox(fp, vec2(0.15, 1.15), vec2(0.85, 1.95));
    float panel = fbox(fp, vec2(0.15, 0.2), vec2(0.85, 0.95));
    base = mix(base, base * 0.7, panel * 0.6);
    base = mix(base, vec3(0.04, 0.05, 0.06), glass);
    fe += vec3(1.0, 0.75, 0.45) * glass * uNight * 0.8;
    float knob = smoothstep(0.05, 0.03, length(fp - vec2(0.85, 1.05)));
    base = mix(base, vec3(0.8, 0.7, 0.35), knob);
    fr = mix(0.6, 0.1, glass);
  } else if (kind > 15.5 && kind < 16.5) {
    float n = fnoise(fp * 3.0 + seed) * 0.5 + fnoise(fp * 11.0) * 0.5;
    base = mix(vec3(0.05, 0.13, 0.04), vec3(0.16, 0.3, 0.08), n);
    fr = 0.95;
  } else if (kind > 16.5 && kind < 17.5) {
    // 彩色玻璃（教堂）：按小格随机色。
    vec2 g = floor(fp / 0.22);
    vec3 col = 0.5 + 0.5 * cos(6.2831 * (fh21(g) + vec3(0.0, 0.33, 0.67)));
    float lead = max(step(fract(fp.x / 0.22), 0.08), step(fract(fp.y / 0.22), 0.08));
    base = mix(col * 0.35, vec3(0.04), lead);
    fe += col * (1.0 - lead) * (0.08 + uNight * 0.9);
    fr = 0.1;
  }
  // 雨天湿润：变暗、更光滑
  base *= 1.0 - uWet * 0.18;
  fr = mix(fr, fr * 0.45, uWet);
  diffuseColor.rgb = base;
  facadeRough = fr;
  facadeMetal = fm;
  facadeEmit = fe;
}
`;

export function createFacadeMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ name: "v3 facade", vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.FrontSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, facadeUniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec2 fUv;
attribute vec4 fA;
attribute vec4 fB;
attribute vec4 fC;
varying vec2 vFUv;
varying vec4 vFA;
varying vec4 vFB;
varying vec4 vFC;
varying vec3 vFWorld;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vFUv = fUv; vFA = fA; vFB = fB; vFC = fC;
vFWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\n${COMMON}\nfloat facadeRough = 0.86; float facadeMetal = 0.0; vec3 facadeEmit = vec3(0.0);`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAGMENT}`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = facadeRough;")
      .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor = facadeMetal;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += facadeEmit;");
  };
  material.customProgramCacheKey = () => "v3-facade-2";
  return material;
}
