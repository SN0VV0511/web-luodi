export const cityFilteredSurfaceFunctions = /* glsl */ `
float cityRawHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float cityPixelFootprint(vec2 p) {
  vec2 dx = dFdx(p);
  vec2 dy = dFdy(p);
  return sqrt(max(dot(dx, dx), dot(dy, dy)));
}

float cityResolutionWeight(vec2 p) {
  return 1.0 - smoothstep(0.32, 1.5, cityPixelFootprint(p));
}

float cityRawNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 fraction = fract(p);
  vec2 blend = fraction * fraction * (3.0 - 2.0 * fraction);
  float a = cityRawHash(cell);
  float b = cityRawHash(cell + vec2(1.0, 0.0));
  float c = cityRawHash(cell + vec2(0.0, 1.0));
  float d = cityRawHash(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}

float cityNoise(vec2 p) {
  return mix(0.5, cityRawNoise(p), cityResolutionWeight(p));
}

float cityCellNoise(vec2 p) {
  return mix(0.5, cityRawHash(floor(p)), cityResolutionWeight(p));
}

float cityHash(vec2 p) {
  return cityRawHash(p);
}

float cityFilteredSine(float phase) {
  float footprint = max(abs(dFdx(phase)), abs(dFdy(phase)));
  float attenuation = 1.0 - smoothstep(1.0, 6.2831853, footprint);
  return sin(phase) * attenuation;
}

float cityIntegralStripe(float position, float width) {
  float cell = floor(position);
  float within = fract(position);
  return cell * width + min(within, width);
}

float cityStripe(float coordinate, float width) {
  float footprint = max(abs(dFdx(coordinate)), abs(dFdy(coordinate)));
  footprint = max(footprint, 0.0001);
  float start = coordinate - footprint * 0.5;
  float end = coordinate + footprint * 0.5;
  return clamp((cityIntegralStripe(end, width) - cityIntegralStripe(start, width))
    / footprint, 0.0, 1.0);
}

float citySeam(float coordinate, float width) {
  return cityStripe(coordinate + width * 0.5, width);
}

float cityGridJoint(vec2 p, vec2 widths) {
  float vertical = citySeam(p.x, widths.x);
  float horizontal = citySeam(p.y, widths.y);
  return 1.0 - (1.0 - vertical) * (1.0 - horizontal);
}

float cityCrack(vec2 p, float width) {
  float pixelWidth = max(0.0001, cityPixelFootprint(p));
  if (pixelWidth >= 0.6) return 0.0;
  vec2 cell = floor(p);
  vec2 fraction = fract(p);
  float nearest = 8.0;
  float nextNearest = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = vec2(cityRawHash(cell + neighbor),
        cityRawHash(cell + neighbor + vec2(17.0, 3.0)));
      vec2 delta = neighbor + point - fraction;
      float distanceSquared = dot(delta, delta);
      if (distanceSquared < nearest) {
        nextNearest = nearest;
        nearest = distanceSquared;
      } else if (distanceSquared < nextNearest) {
        nextNearest = distanceSquared;
      }
    }
  }
  float edge = sqrt(nextNearest) - sqrt(nearest);
  float crack = 1.0 - smoothstep(width - pixelWidth, width + pixelWidth, edge);
  return crack * (1.0 - smoothstep(0.12, 0.6, pixelWidth));
}

vec2 cityWallCoordinates(vec3 position) {
  vec3 dx = dFdx(position);
  vec3 dy = dFdy(position);
  vec3 normal = abs(cross(dx, dy));
  if (normal.y > max(normal.x, normal.z)) return position.xz;
  if (normal.x > normal.z) return position.zy;
  return position.xy;
}

float cityGrain(vec2 p) {
  float coarse = cityNoise(p);
  float fine = cityNoise(p * 3.7 + vec2(8.1, 3.2));
  float micro = cityCellNoise(p * 11.3);
  return coarse * 0.64 + fine * 0.26 + micro * 0.1;
}

float cityDirectionalGrain(vec2 p, vec2 direction, float frequency) {
  vec2 perpendicular = vec2(-direction.y, direction.x);
  float along = dot(p, direction);
  float across = dot(p, perpendicular);
  float warp = cityNoise(vec2(across * 0.9, along * 0.15)) * 0.8;
  float ring = cityFilteredSine((across * frequency + warp) * 6.2831853);
  return 0.5 + ring * 0.3 + (cityNoise(p * frequency * 0.5) - 0.5) * 0.4;
}

float cityBrickMortar(vec2 p, vec2 brickSize, float mortarWidth) {
  vec2 courses = p / brickSize;
  float course = floor(courses.y);
  float offset = mod(course, 2.0) * 0.5;
  float bed = citySeam(courses.y, mortarWidth / brickSize.y);
  float head = citySeam(courses.x + offset, mortarWidth / brickSize.x);
  float resolution = 1.0 - smoothstep(0.6, 2.0, cityPixelFootprint(courses));
  float average = 1.0 - (1.0 - mortarWidth / brickSize.x)
    * (1.0 - mortarWidth / brickSize.y);
  return mix(average, max(bed, head), resolution);
}

float cityBrickTone(vec2 p, vec2 brickSize) {
  vec2 courses = p / brickSize;
  courses.x += mod(floor(courses.y), 2.0) * 0.5;
  return cityCellNoise(courses);
}
`;
