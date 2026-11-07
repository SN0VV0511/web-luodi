export const bloomExtractFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 inverseResolution;
uniform float threshold;
uniform float knee;

vec3 thresholdColor(vec3 color) {
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float soft = clamp(luminance - threshold + knee, 0.0, knee * 2.0);
  soft = soft * soft / max(0.00001, 4.0 * knee);
  float contribution = max(luminance - threshold, soft) / max(luminance, 0.00001);
  return color * contribution;
}

void main() {
  vec2 offset = inverseResolution * 0.5;
  vec3 a = thresholdColor(texture2D(tColor, vUv + vec2(-offset.x, -offset.y)).rgb);
  vec3 b = thresholdColor(texture2D(tColor, vUv + vec2(offset.x, -offset.y)).rgb);
  vec3 c = thresholdColor(texture2D(tColor, vUv + vec2(-offset.x, offset.y)).rgb);
  vec3 d = thresholdColor(texture2D(tColor, vUv + vec2(offset.x, offset.y)).rgb);
  float wa = 1.0 / (1.0 + max(max(a.r, a.g), a.b));
  float wb = 1.0 / (1.0 + max(max(b.r, b.g), b.b));
  float wc = 1.0 / (1.0 + max(max(c.r, c.g), c.b));
  float wd = 1.0 / (1.0 + max(max(d.r, d.g), d.b));
  gl_FragColor = vec4((a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd), 1.0);
}
`;

export const bloomBlurFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 direction;

void main() {
  vec3 color = texture2D(tColor, vUv).rgb * 0.227027027;
  color += texture2D(tColor, vUv + direction * 1.3846153846).rgb * 0.3162162162;
  color += texture2D(tColor, vUv - direction * 1.3846153846).rgb * 0.3162162162;
  color += texture2D(tColor, vUv + direction * 3.2307692308).rgb * 0.0702702703;
  color += texture2D(tColor, vUv - direction * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(color, 1.0);
}
`;

export const bloomDownsampleFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 inverseResolution;

void main() {
  vec2 d = inverseResolution;
  vec3 color = texture2D(tColor, vUv).rgb * 0.25;
  color += texture2D(tColor, vUv + vec2(-d.x, 0.0)).rgb * 0.125;
  color += texture2D(tColor, vUv + vec2(d.x, 0.0)).rgb * 0.125;
  color += texture2D(tColor, vUv + vec2(0.0, -d.y)).rgb * 0.125;
  color += texture2D(tColor, vUv + vec2(0.0, d.y)).rgb * 0.125;
  color += texture2D(tColor, vUv + vec2(-d.x, -d.y)).rgb * 0.0625;
  color += texture2D(tColor, vUv + vec2(d.x, -d.y)).rgb * 0.0625;
  color += texture2D(tColor, vUv + vec2(-d.x, d.y)).rgb * 0.0625;
  color += texture2D(tColor, vUv + vec2(d.x, d.y)).rgb * 0.0625;
  gl_FragColor = vec4(color, 1.0);
}
`;
