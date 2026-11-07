export const cityAntialiasFragment = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 inverseResolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float subpixelStrength;

float perceptualLuma(vec3 color) {
  return dot(color, vec3(0.299, 0.587, 0.114));
}

vec3 colorAt(vec2 uv) {
  return texture2D(tColor, clamp(uv, inverseResolution * 0.5,
    vec2(1.0) - inverseResolution * 0.5)).rgb;
}

float lumaAt(vec2 uv) {
  return perceptualLuma(colorAt(uv));
}

float distanceAt(vec2 uv) {
  float depth = texture2D(tDepth, uv).r;
  return cameraNear * cameraFar
    / max(0.0001, cameraFar - depth * (cameraFar - cameraNear));
}

void main() {
  vec3 centerColor = colorAt(vUv);
  float center = perceptualLuma(centerColor);
  vec2 east = vec2(inverseResolution.x, 0.0);
  vec2 north = vec2(0.0, inverseResolution.y);
  float left = lumaAt(vUv - east);
  float right = lumaAt(vUv + east);
  float down = lumaAt(vUv - north);
  float up = lumaAt(vUv + north);
  float lowest = min(center, min(min(left, right), min(down, up)));
  float highest = max(center, max(max(left, right), max(down, up)));
  float contrast = highest - lowest;
  if (contrast < max(0.025, highest * 0.125)) {
    gl_FragColor = vec4(centerColor, 1.0);
    return;
  }

  float upperLeft = lumaAt(vUv - east + north);
  float upperRight = lumaAt(vUv + east + north);
  float lowerLeft = lumaAt(vUv - east - north);
  float lowerRight = lumaAt(vUv + east - north);
  float horizontalEdge = abs(upperLeft + lowerLeft - left * 2.0)
    + 2.0 * abs(up + down - center * 2.0)
    + abs(upperRight + lowerRight - right * 2.0);
  float verticalEdge = abs(upperLeft + upperRight - up * 2.0)
    + 2.0 * abs(left + right - center * 2.0)
    + abs(lowerLeft + lowerRight - down * 2.0);
  bool horizontal = horizontalEdge >= verticalEdge;
  float first = horizontal ? down : left;
  float second = horizontal ? up : right;
  float firstGradient = first - center;
  float secondGradient = second - center;
  bool firstSteeper = abs(firstGradient) >= abs(secondGradient);
  float gradient = max(abs(firstGradient), abs(secondGradient));
  float perpendicularStep = horizontal ? inverseResolution.y : inverseResolution.x;
  if (firstSteeper) perpendicularStep = -perpendicularStep;
  float edgeLuma = 0.5 * (center + (firstSteeper ? first : second));
  vec2 perpendicular = horizontal ? vec2(0.0, perpendicularStep)
    : vec2(perpendicularStep, 0.0);
  vec2 along = horizontal ? east : north;
  vec2 edgeCenter = vUv + perpendicular * 0.5;
  vec2 start = edgeCenter - along;
  vec2 end = edgeCenter + along;
  float startDelta = lumaAt(start) - edgeLuma;
  float endDelta = lumaAt(end) - edgeLuma;
  float gradientThreshold = gradient * 0.25;
  bool startReached = abs(startDelta) >= gradientThreshold;
  bool endReached = abs(endDelta) >= gradientThreshold;
  float searchStep = 1.0;
  for (int iteration = 0; iteration < 8; iteration++) {
    if (startReached && endReached) break;
    if (iteration >= 4) searchStep = 2.0;
    if (iteration >= 6) searchStep = 4.0;
    if (!startReached) {
      start -= along * searchStep;
      startDelta = lumaAt(start) - edgeLuma;
      startReached = abs(startDelta) >= gradientThreshold;
    }
    if (!endReached) {
      end += along * searchStep;
      endDelta = lumaAt(end) - edgeLuma;
      endReached = abs(endDelta) >= gradientThreshold;
    }
  }
  float distanceStart = horizontal ? vUv.x - start.x : vUv.y - start.y;
  float distanceEnd = horizontal ? end.x - vUv.x : end.y - vUv.y;
  bool startNearer = distanceStart < distanceEnd;
  float closestDistance = min(distanceStart, distanceEnd);
  float edgeLength = max(distanceStart + distanceEnd, 0.000001);
  float edgeOffset = 0.5 - closestDistance / edgeLength;
  float nearestDelta = startNearer ? startDelta : endDelta;
  if ((nearestDelta < 0.0) == (center < edgeLuma)) edgeOffset = 0.0;

  float neighborhood = (2.0 * (left + right + down + up)
    + upperLeft + upperRight + lowerLeft + lowerRight) / 12.0;
  float subpixel = clamp(abs(neighborhood - center) / max(contrast, 0.0001), 0.0, 1.0);
  subpixel = subpixel * subpixel * (3.0 - 2.0 * subpixel);
  subpixel = subpixel * subpixel * subpixelStrength;
  float offset = max(edgeOffset, subpixel);
  vec2 sampleUv = vUv + perpendicular * offset;
  float centerDistance = distanceAt(vUv);
  float filteredDistance = distanceAt(sampleUv);
  float depthDiscontinuity = abs(centerDistance - filteredDistance)
    / max(0.2, min(centerDistance, filteredDistance));
  float silhouette = smoothstep(0.02, 0.3, depthDiscontinuity);
  float safeOffset = min(offset, mix(0.75, 0.5, silhouette));
  vec3 result = colorAt(vUv + perpendicular * safeOffset);
  vec3 localMin = min(centerColor, min(colorAt(vUv - perpendicular), colorAt(vUv + perpendicular)));
  vec3 localMax = max(centerColor, max(colorAt(vUv - perpendicular), colorAt(vUv + perpendicular)));
  result = clamp(result, localMin, localMax);
  gl_FragColor = vec4(result, 1.0);
}
`;
