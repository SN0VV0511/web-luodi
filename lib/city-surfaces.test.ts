import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { applyCitySurface, markCitySurface, type CitySurface } from "./city-surfaces";

const kinds: CitySurface[] = [
  "asphalt", "concrete", "grass", "stucco", "brick", "roof",
  "foliage", "bark", "path", "sand", "soil",
];

/** 不创建 WebGL 上下文，直接验证标准材质的着色器注入结果。 */
function compile(material: THREE.MeshStandardMaterial): { vertexShader: string; fragmentShader: string } {
  const shader = { ...THREE.ShaderLib.standard, uniforms: {} } as Parameters<THREE.Material["onBeforeCompile"]>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

it.each(kinds)("%s 标记不提前拆分批次，应用后注入世界坐标纹理", (kind) => {
  const material = new THREE.MeshStandardMaterial();
  try {
    const original = material.onBeforeCompile;
    markCitySurface(material, kind);
    expect(material.onBeforeCompile).toBe(original);
    applyCitySurface(material, kind);
    const shader = compile(material);
    expect(shader.vertexShader).toContain("modelMatrix * instanceMatrix");
    expect(shader.fragmentShader).toContain("vec2 w = vCityPos.xz;");
    expect(shader.fragmentShader.match(/varying vec3 vCityPos;/g)).toHaveLength(1);
    expect(shader.fragmentShader).not.toContain("undefined");
    const version = material.version;
    const key = material.customProgramCacheKey();
    applyCitySurface(material, kind);
    expect(material.version).toBe(version);
    expect(material.customProgramCacheKey()).toBe(key);
  } finally {
    material.dispose();
  }
});

it("切换表面不会叠加着色器声明，并保留原有编译钩子", () => {
  const material = new THREE.MeshStandardMaterial();
  const previous = vi.fn<THREE.Material["onBeforeCompile"]>();
  material.onBeforeCompile = previous;
  material.customProgramCacheKey = () => "existing-effect";
  try {
    applyCitySurface(material, "grass");
    const grassKey = material.customProgramCacheKey();
    applyCitySurface(material, "brick");
    const shader = compile(material);
    expect(previous).toHaveBeenCalledTimes(1);
    expect(shader.vertexShader.match(/varying vec3 vCityPos;/g)).toHaveLength(1);
    expect(shader.fragmentShader.match(/float cityHash\(/g)).toHaveLength(1);
    expect(shader.fragmentShader).not.toContain("float lawn");
    expect(shader.fragmentShader).toContain("float mortar");
    expect(material.customProgramCacheKey()).not.toBe(grassKey);
    expect(material.customProgramCacheKey()).toContain("existing-effect");
  } finally {
    material.dispose();
  }
});

it("已应用表面的材质克隆后，仍能重新安装未被 Three.js 复制的编译钩子", () => {
  const original = new THREE.MeshStandardMaterial();
  applyCitySurface(original, "concrete");
  const cloned = original.clone();
  try {
    applyCitySurface(cloned, "concrete");
    expect(compile(cloned).fragmentShader).toContain("vec2 w = vCityPos.xz;");
    expect(cloned.customProgramCacheKey()).toBe(original.customProgramCacheKey());
  } finally {
    original.dispose();
    cloned.dispose();
  }
});

it("所有表面都有独立缓存键，GLSL 平滑区间有序且砖块逐行错缝", () => {
  const materials = kinds.map(() => new THREE.MeshStandardMaterial());
  try {
    const keys = materials.map((material, index) => {
      applyCitySurface(material, kinds[index]);
      const { fragmentShader } = compile(material);
      for (const match of fragmentShader.matchAll(/smoothstep\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?),/g)) {
        expect(Number(match[1])).toBeLessThan(Number(match[2]));
      }
      if (kinds[index] === "brick") {
        expect(fragmentShader).toContain("mod(floor(vCityPos.y * 5.5), 2.0)");
      }
      return material.customProgramCacheKey();
    });
    expect(new Set(keys).size).toBe(kinds.length);
  } finally {
    materials.forEach((material) => material.dispose());
  }
});
