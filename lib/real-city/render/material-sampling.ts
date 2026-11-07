import * as THREE from "three";

const specularFilter = /* glsl */ `
  vec3 cityNormalDx = dFdx(normal - nonPerturbedNormal);
  vec3 cityNormalDy = dFdy(normal - nonPerturbedNormal);
  float cityNormalVariance = max(dot(cityNormalDx, cityNormalDx), dot(cityNormalDy, cityNormalDy));
  float cityFilterKernel = min(0.08, cityNormalVariance * 0.45);
  float cityRoughnessSquared = roughnessFactor * roughnessFactor;
  roughnessFactor = sqrt(clamp(cityRoughnessSquared + cityFilterKernel, 0.0, 1.0));
`;

const normalMapVariance = (world: boolean) => /* glsl */ `
  #ifdef USE_NORMALMAP_TANGENTSPACE
    vec2 cityVarianceUv = ${world ? "cityWorldUv(vPbrWorldPos, vPbrWorldNormal)" : "vNormalMapUv"};
    vec3 cityAveragedNormal = texture2D(normalMap, cityVarianceUv).xyz * 2.0 - 1.0;
    float cityNormalLength = clamp(length(cityAveragedNormal), 0.02, 1.0);
    float cityMapVariance = max(0.0, (1.0 - cityNormalLength) / cityNormalLength);
    cityMapVariance *= min(1.0, dot(normalScale, normalScale) * 0.5);
    roughnessFactor = sqrt(clamp(roughnessFactor * roughnessFactor + min(0.08, cityMapVariance), 0.0, 1.0));
  #endif
`;

export type MaterialSamplingSummary = {
  materials: number;
  textures: number;
  filteredNormals: number;
  anisotropy: number;
};

export function configureCityMaterialSampling(root: THREE.Object3D, renderer: THREE.WebGLRenderer, compact: boolean): MaterialSamplingSummary {
  const seenMaterials = new Set<THREE.Material>();
  const seenTextures = new Set<THREE.Texture>();
  const anisotropy = Math.max(1, Math.min(compact ? 4 : 8, renderer.capabilities.getMaxAnisotropy()));
  const summary: MaterialSamplingSummary = { materials: 0, textures: 0, filteredNormals: 0, anisotropy };
  const configureTexture = (texture: THREE.Texture | null): void => {
    if (!texture || seenTextures.has(texture)) return;
    seenTextures.add(texture);
    if (texture.isRenderTargetTexture || texture instanceof THREE.VideoTexture) return;
    if (texture.magFilter === THREE.NearestFilter || texture.minFilter === THREE.NearestFilter) return;
    let changed = false;
    if (texture.anisotropy !== anisotropy) {
      texture.anisotropy = anisotropy;
      changed = true;
    }
    if (texture.generateMipmaps && texture.minFilter === THREE.LinearFilter) {
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      changed = true;
    }
    if (changed) texture.needsUpdate = true;
    summary.textures++;
  };
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (seenMaterials.has(material)) continue;
      seenMaterials.add(material);
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      summary.materials++;
      configureTexture(material.map);
      configureTexture(material.normalMap);
      configureTexture(material.roughnessMap);
      configureTexture(material.metalnessMap);
      configureTexture(material.emissiveMap);
      configureTexture(material.aoMap);
      configureTexture(material.alphaMap);
      configureTexture(material.bumpMap);
      if (!material.normalMap) continue;
      summary.filteredNormals++;
      const previous = material.onBeforeCompile;
      const key = material.customProgramCacheKey();
      const world = material.userData.cityWorldScalePbr === true;
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_fragment>",
          `${specularFilter}\n${normalMapVariance(world)}\n#include <lights_physical_fragment>`);
      };
      material.customProgramCacheKey = () => `${key}:filtered-normal-distribution-v1:${world}`;
      material.needsUpdate = true;
    }
  });
  return summary;
}
