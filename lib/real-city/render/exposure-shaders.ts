export const exposureMeterFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 inverseMeterSize;

void main() {
  float weightedLog = 0.0;
  float totalWeight = 0.0;
  float highlight = 0.0;
  float shadow = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      vec2 offset = (vec2(float(x), float(y)) + 0.5) / 4.0 - 0.5;
      vec2 uv = clamp(vUv + offset * inverseMeterSize, vec2(0.001), vec2(0.999));
      vec3 radiance = max(texture2D(tColor, uv).rgb, vec3(0.0));
      float luminance = dot(radiance, vec3(0.2126, 0.7152, 0.0722));
      float sky = step(0.99995, texture2D(tDepth, uv).r);
      vec2 centerOffset = (uv - vec2(0.5, 0.48)) * vec2(1.0, 1.15);
      float centerWeight = 0.35 + 0.65 * exp(-dot(centerOffset, centerOffset) * 4.0);
      float skyWeight = mix(1.0, 0.2, sky);
      float lightSourceWeight = 1.0 / (1.0 + max(0.0, luminance - 5.0) * 0.1);
      float weight = centerWeight * skyWeight * lightSourceWeight;
      weightedLog += log2(clamp(luminance, 0.002, 64.0)) * weight;
      totalWeight += weight;
      highlight += smoothstep(1.8, 8.0, luminance) * weight;
      shadow += (1.0 - smoothstep(0.01, 0.06, luminance)) * weight;
    }
  }
  gl_FragColor = vec4(weightedLog, totalWeight, highlight, shadow) / 16.0;
}
`;

export const exposureReduceFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tMeter;

void main() {
  vec4 total = vec4(0.0);
  for (int y = 0; y < 12; y++) {
    for (int x = 0; x < 16; x++) {
      vec2 uv = (vec2(float(x), float(y)) + 0.5) / vec2(16.0, 12.0);
      total += texture2D(tMeter, uv);
    }
  }
  float weight = max(0.0001, total.g);
  float geometricMean = exp2(total.r / weight);
  float highlights = total.b / weight;
  float shadows = total.a / weight;
  gl_FragColor = vec4(geometricMean, highlights, shadows, 1.0);
}
`;

export const exposureAdaptFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tMeasurement;
uniform sampler2D tPrevious;
uniform float elapsed;
uniform float initialized;
uniform float night;
uniform float baseExposure;

void main() {
  vec3 measurement = texture2D(tMeasurement, vec2(0.5)).rgb;
  float meanLuminance = max(0.002, measurement.r * baseExposure);
  float key = mix(0.24, 0.105, night);
  float ratio = key / meanLuminance;
  float desired = pow(max(0.01, ratio), 0.23);
  float highlightProtection = 1.0 - smoothstep(0.1, 0.45, measurement.g) * 0.12;
  desired *= highlightProtection;
  desired = clamp(desired, mix(0.8, 0.85, night), mix(1.25, 1.4, night));
  float previous = texture2D(tPrevious, vec2(0.5)).r;
  float previousLog = log2(max(0.01, previous));
  float desiredLog = log2(desired);
  float brightening = step(previousLog, desiredLog);
  float secondsToAdapt = mix(0.7, 2.6, brightening);
  float blend = 1.0 - exp(-min(elapsed, 0.5) / secondsToAdapt);
  float adapted = exp2(mix(previousLog, desiredLog, blend));
  adapted = mix(desired, adapted, initialized);
  gl_FragColor = vec4(adapted, measurement.r, measurement.g, 1.0);
}
`;
