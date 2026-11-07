export const cityOutputFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tOcclusion;
uniform sampler2D tBloomNear;
uniform sampler2D tBloomFar;
uniform sampler2D tExposure;
uniform float occlusionEnabled;
uniform float bloomStrength;
uniform float exposure;
uniform float ditherStrength;
uniform vec2 resolution;

vec3 acesFilm(vec3 color) {
  mat3 inputMatrix = mat3(
    0.59719, 0.07600, 0.02840,
    0.35458, 0.90834, 0.13383,
    0.04823, 0.01566, 0.83777
  );
  mat3 outputMatrix = mat3(
    1.60475, -0.10208, -0.00327,
    -0.53108, 1.10813, -0.07276,
    -0.07367, -0.00605, 1.07602
  );
  color = inputMatrix * (color * exposure / 0.6);
  vec3 a = color * (color + 0.0245786) - 0.000090537;
  vec3 b = color * (0.983729 * color + 0.4329510) + 0.238081;
  return clamp(outputMatrix * (a / b), 0.0, 1.0);
}

vec3 linearToSrgb(vec3 value) {
  vec3 low = value * 12.92;
  vec3 high = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
  return mix(low, high, step(vec3(0.0031308), value));
}

float dither(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715)))) - 0.5;
}

void main() {
  vec3 color = texture2D(tColor, vUv).rgb;
  float occlusion = mix(1.0, texture2D(tOcclusion, vUv).r, occlusionEnabled);
  float bright = smoothstep(0.8, 3.0, dot(color, vec3(0.2126, 0.7152, 0.0722)));
  color *= mix(occlusion, 1.0, bright * 0.75);
  vec3 bloomNear = texture2D(tBloomNear, vUv).rgb;
  vec3 bloomFar = texture2D(tBloomFar, vUv).rgb;
  color += (bloomNear * 0.72 + bloomFar * 0.28) * bloomStrength;
  color *= texture2D(tExposure, vec2(0.5)).r;
  color = linearToSrgb(acesFilm(color));
  color += dither(vUv * resolution) * ditherStrength / 255.0;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
