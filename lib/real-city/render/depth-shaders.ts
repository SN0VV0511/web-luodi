export const depthReconstruction = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 inverseProjection;
uniform vec2 inverseResolution;
uniform float cameraNear;
uniform float cameraFar;

float linearDepth(float depth) {
  return cameraNear * cameraFar
    / (cameraFar - depth * (cameraFar - cameraNear));
}

vec3 viewPosition(vec2 uv) {
  float depth = texture2D(tDepth, uv).r;
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 view = inverseProjection * clip;
  return view.xyz / view.w;
}

vec3 surfaceNormal(vec2 uv, vec3 center) {
  vec3 left = viewPosition(uv - vec2(inverseResolution.x, 0.0));
  vec3 right = viewPosition(uv + vec2(inverseResolution.x, 0.0));
  vec3 down = viewPosition(uv - vec2(0.0, inverseResolution.y));
  vec3 up = viewPosition(uv + vec2(0.0, inverseResolution.y));
  vec3 dx = abs(left.z - center.z) < abs(right.z - center.z)
    ? center - left : right - center;
  vec3 dy = abs(down.z - center.z) < abs(up.z - center.z)
    ? center - down : up - center;
  vec3 crossProduct = cross(dx, dy);
  float lengthSquared = dot(crossProduct, crossProduct);
  if (lengthSquared < 0.0000001) return vec3(0.0, 0.0, 1.0);
  return crossProduct * inversesqrt(lengthSquared);
}

float screenHash(vec2 pixel) {
  return fract(52.9829189 * fract(dot(pixel, vec2(0.06711056, 0.00583715))));
}
`;

export const contactOcclusionFragment = /* glsl */ `
varying vec2 vUv;
uniform float projectionScale;
uniform float radius;
uniform float strength;
${depthReconstruction}

void main() {
  float centerDepth = texture2D(tDepth, vUv).r;
  if (centerDepth >= 0.99998) {
    gl_FragColor = vec4(1.0);
    return;
  }
  vec3 center = viewPosition(vUv);
  vec3 normal = surfaceNormal(vUv, center);
  float pixelRadius = clamp(radius * projectionScale / max(1.0, -center.z), 1.0, 42.0);
  float rotation = screenHash(gl_FragCoord.xy) * 6.28318530718;
  float total = 0.0;
  float totalWeight = 0.0;
  for (int sampleIndex = 0; sampleIndex < 12; sampleIndex++) {
    float fraction = (float(sampleIndex) + 0.5) / 12.0;
    float angle = float(sampleIndex) * 2.39996322973 + rotation;
    vec2 offset = vec2(cos(angle), sin(angle)) * sqrt(fraction) * pixelRadius;
    vec2 sampleUv = vUv + offset * inverseResolution;
    if (sampleUv.x < 0.0 || sampleUv.x > 1.0 || sampleUv.y < 0.0 || sampleUv.y > 1.0) continue;
    float depth = texture2D(tDepth, sampleUv).r;
    if (depth >= 0.99998) continue;
    vec3 samplePosition = viewPosition(sampleUv);
    vec3 delta = samplePosition - center;
    float separation = length(delta);
    float falloff = 1.0 - smoothstep(radius * 0.15, radius, separation);
    float horizon = max(0.0, dot(normal, delta / max(0.001, separation)) - 0.12);
    total += horizon * falloff;
    totalWeight += 1.0;
  }
  float occlusion = total / max(1.0, totalWeight);
  float value = clamp(1.0 - occlusion * strength, 0.55, 1.0);
  gl_FragColor = vec4(value, value, value, 1.0);
}
`;

export const bilateralOcclusionFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tOcclusion;
uniform vec2 direction;
${depthReconstruction}

void main() {
  float centerDepth = linearDepth(texture2D(tDepth, vUv).r);
  float sum = texture2D(tOcclusion, vUv).r * 0.4;
  float weightSum = 0.4;
  for (int offset = -2; offset <= 2; offset++) {
    if (offset == 0) continue;
    vec2 sampleUv = clamp(vUv + direction * float(offset), vec2(0.0), vec2(1.0));
    float sampleDepth = linearDepth(texture2D(tDepth, sampleUv).r);
    float edgeWeight = exp(-abs(centerDepth - sampleDepth) / max(0.06, centerDepth * 0.0015));
    float spatialWeight = abs(offset) == 1 ? 0.24 : 0.06;
    float weight = edgeWeight * spatialWeight;
    sum += texture2D(tOcclusion, sampleUv).r * weight;
    weightSum += weight;
  }
  float value = sum / weightSum;
  gl_FragColor = vec4(value, value, value, 1.0);
}
`;
