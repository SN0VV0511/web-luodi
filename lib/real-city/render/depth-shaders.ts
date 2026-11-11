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

// 深度纹理是最近邻采样：重建位置必须使用被取样纹素的中心坐标，否则 uv 与深度错开
// 半个纹素，平坦地面 / 湖面会被重建成倾斜面，AO 在近景整片变暗并形成一条水平“暗缝”。
vec2 depthTexelUv(vec2 uv) {
  vec2 size = vec2(textureSize(tDepth, 0));
  return (floor(uv * size) + 0.5) / size;
}

vec3 viewPosition(vec2 uv) {
  uv = depthTexelUv(uv);
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
  vec3 dl = center - left, dr = right - center, dd = center - down, du = up - center;
  // 选深度差更小的一侧，但跳过与中心同一纹素（零向量）的退化邻居。
  bool useLeft = abs(dl.z) < abs(dr.z) && dot(dl, dl) > 1e-10 || dot(dr, dr) <= 1e-10;
  bool useDown = abs(dd.z) < abs(du.z) && dot(dd, dd) > 1e-10 || dot(du, du) <= 1e-10;
  vec3 dx = useLeft ? dl : dr;
  vec3 dy = useDown ? dd : du;
  vec3 crossProduct = cross(dx, dy);
  float lengthSquared = dot(crossProduct, crossProduct);
  // 近景地面相邻像素只相距几毫米，叉积长度平方可低至 1e-9：旧阈值 1e-7 会把整片近地面
  // 误判为退化并回落成“朝向相机”的法线 → AO 在某一屏幕行以下整片变暗（湖面直线暗缝）。
  if (lengthSquared < 1e-24) return vec3(0.0, 0.0, 1.0);
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
    // 只有明显高出切平面的样本才算遮挡：平坦地面 / 水面在掠射角下的深度量化
    // 不会再在固定屏幕行上形成一条“暗缝”（像素半径钳位处）。
    float planeEpsilon = 0.01 + 0.002 * -center.z;
    float lift = dot(normal, delta) - planeEpsilon;
    float horizon = lift > 0.0 ? max(0.0, lift / max(0.001, separation) - 0.12) : 0.0;
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
