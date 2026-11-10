export const cityOutputFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tOcclusion;
uniform sampler2D tBloomNear;
uniform sampler2D tBloomFar;
uniform sampler2D tExposure;
uniform sampler2D tDepth;
uniform sampler2D tBlur;
uniform float occlusionEnabled;
uniform float bloomStrength;
uniform float exposure;
uniform float ditherStrength;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 hazeColor;
uniform float hazeDensity;
uniform float hazeStart;
uniform float hazeMax;
uniform float saturation;
uniform float contrast;
uniform vec3 shadowTint;
uniform vec3 highlightTint;
uniform float vignette;
uniform float tiltShift;
uniform float focusDistance;
uniform float focusY;

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

float viewDistance(float depth) {
  return (cameraNear * cameraFar) / max(1e-6, cameraFar - depth * (cameraFar - cameraNear));
}

void main() {
  float depth = texture2D(tDepth, vUv).r;
  bool sky = depth >= 0.99999;
  float distance = viewDistance(depth);
  vec3 color = texture2D(tColor, vUv).rgb;

  // Tilt-shift: blur grows away from the focus band and with depth separation from the focus plane.
  if (tiltShift > 0.5) {
    float band = smoothstep(0.16, 0.5, abs(vUv.y - focusY));
    float separation = sky ? 0.7 : smoothstep(0.35, 1.4, abs(log(distance / max(focusDistance, 1.0))));
    float circle = clamp(max(band, separation * 0.7), 0.0, 1.0);
    color = mix(color, texture2D(tBlur, vUv).rgb, circle);
  }

  float occlusion = mix(1.0, texture2D(tOcclusion, vUv).r, occlusionEnabled);
  float bright = smoothstep(0.8, 3.0, dot(color, vec3(0.2126, 0.7152, 0.0722)));
  color *= mix(occlusion, 1.0, bright * 0.75);

  // Aerial perspective: distant geometry fades toward the atmosphere colour (the sky already carries it).
  if (!sky) {
    float haze = 1.0 - exp(-max(distance - hazeStart, 0.0) * hazeDensity);
    color = mix(color, hazeColor, clamp(haze, 0.0, hazeMax));
  }

  vec3 bloomNear = texture2D(tBloomNear, vUv).rgb;
  vec3 bloomFar = texture2D(tBloomFar, vUv).rgb;
  color += (bloomNear * 0.72 + bloomFar * 0.28) * bloomStrength;
  color *= texture2D(tExposure, vec2(0.5)).r;
  color = acesFilm(color);

  // Photographic grade in display-referred space: split tone, contrast S-curve, saturation, vignette.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  // Tints carry hue only: normalise them to unit luminance so toning never darkens the frame.
  vec3 shadowHue = shadowTint / max(dot(shadowTint, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  vec3 highlightHue = highlightTint / max(dot(highlightTint, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  color = mix(color, color * shadowHue, (1.0 - smoothstep(0.0, 0.4, luma)) * 0.16);
  color = mix(color, color * highlightHue, smoothstep(0.4, 1.0, luma) * 0.18);
  color = clamp((color - 0.5) * contrast + 0.5, 0.0, 1.0);
  luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = clamp(mix(vec3(luma), color, saturation), 0.0, 1.0);
  vec2 centred = vUv - 0.5;
  color *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(centred, centred) * 2.2);

  color = linearToSrgb(color);
  color += dither(vUv * resolution) * ditherStrength / 255.0;
  gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;
