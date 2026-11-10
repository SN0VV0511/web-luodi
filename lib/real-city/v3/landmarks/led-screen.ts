import * as THREE from "three";

/**
 * LED 显示屏材质：把任意画布纹理量化为 LED 像素点阵（RGB 子像素 + 圆点掩膜 + 模组拼缝），
 * 远距离按屏幕导数自动过渡为平滑画面避免摩尔纹；带刷新扫描线、暗场黑电平与轻微光晕。
 */
export function createLedMaterial(map: THREE.Texture, columns = 384, rows = 132, options: { modules?: [number, number]; brightness?: number } = {}): THREE.ShaderMaterial {
  const [mx, my] = options.modules ?? [12, 4];
  const material = new THREE.ShaderMaterial({
    name: "v3 LED screen",
    uniforms: {
      map: { value: map },
      uTime: { value: 0 },
      uNight: { value: 0 },
      uGrid: { value: new THREE.Vector2(columns, rows) },
      uModules: { value: new THREE.Vector2(mx, my) },
      uBrightness: { value: options.brightness ?? 1.35 },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vView;
      void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vView = cameraPosition - w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D map; uniform float uTime; uniform float uNight; uniform vec2 uGrid; uniform vec2 uModules; uniform float uBrightness;
      varying vec2 vUv; varying vec3 vView;
      void main() {
        vec2 g = vUv * uGrid;
        vec2 cell = floor(g);
        vec2 f = fract(g);
        vec3 pix = texture2D(map, (cell + 0.5) / uGrid).rgb;
        vec3 smooth_ = texture2D(map, vUv).rgb;
        // 子像素：三列 RGB 发光点
        float sub = f.x * 3.0;
        vec3 mask = vec3(step(sub, 1.0), step(1.0, sub) * step(sub, 2.0), step(2.0, sub));
        vec2 sf = vec2(fract(sub), f.y);
        float dot_ = 1.0 - smoothstep(0.28, 0.48, length(sf - 0.5) * vec2(1.0, 1.0).x);
        // 子像素分色只在近距离（每 LED ≥ 4 像素）显现，避免中距离彩虹摩尔纹
        vec2 d = fwidth(g);
        float px = max(d.x, d.y);
        vec3 subMask = mix(mask * 3.0, vec3(1.0), smoothstep(0.12, 0.25, px));
        vec3 led = pix * subMask * mix(dot_, 1.0, smoothstep(0.2, 0.4, px)) * mix(1.0, 1.25, 1.0 - smoothstep(0.2, 0.4, px));
        // 屏幕上每个 LED 所占像素数：小于 ~1.5 像素时过渡到平滑画面
        float far = smoothstep(0.4, 0.9, px);
        vec3 col = mix(led, smooth_, far);
        // 模组拼缝
        vec2 m = fract(vUv * uModules);
        float seam = (1.0 - step(0.004, m.x) * step(m.x, 0.996)) + (1.0 - step(0.008, m.y) * step(m.y, 0.992));
        col *= 1.0 - clamp(seam, 0.0, 1.0) * 0.55 * (1.0 - far);
        // 刷新扫描带 + 黑电平 + 视角衰减
        float scan = 0.94 + 0.06 * smoothstep(0.0, 0.03, abs(fract(vUv.y - uTime * 0.35) - 0.5));
        float view = mix(0.75, 1.0, clamp(normalize(vView).z * 1.2, 0.0, 1.0));
        col = col * scan * view * uBrightness * mix(1.15, 0.9, uNight) + vec3(0.012, 0.014, 0.016);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: false,
  });
  return material;
}
