import * as THREE from "three";
import type { SeasonState } from "../../city-seasons";

export class CitySkyEnvironment {
  private readonly generator: THREE.PMREMGenerator;
  private readonly captureScene = new THREE.Scene();
  private readonly captureSky: THREE.Mesh;
  private target: THREE.WebGLRenderTarget;
  private signature = "";
  private lastUpdate = -Infinity;
  private disposed = false;

  constructor(renderer: THREE.WebGLRenderer, geometry: THREE.BufferGeometry, material: THREE.ShaderMaterial) {
    this.generator = new THREE.PMREMGenerator(renderer);
    this.generator.compileCubemapShader();
    this.captureSky = new THREE.Mesh(geometry, material);
    this.captureSky.frustumCulled = false;
    this.captureScene.add(this.captureSky);
    this.target = this.generate();
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  update(scene: THREE.Scene, state: SeasonState, night: boolean, seconds: number, mode = night ? "night" : "day"): boolean {
    if (this.disposed) return false;
    const blendBucket = Math.round(state.blend * 4);
    const signature = `${night ? 1 : 0}:${mode}:${state.season}:${state.nextSeason}:${blendBucket}`;
    if (signature === this.signature) return false;
    const nightChanged = this.signature !== "" && this.signature.split(":").slice(0, 2).join(":") !== `${night ? 1 : 0}:${mode}`;
    if (!nightChanged && seconds >= this.lastUpdate && seconds - this.lastUpdate < 2) return false;
    const replacement = this.generate();
    const previous = this.target;
    this.target = replacement;
    scene.environment = replacement.texture;
    this.signature = signature;
    this.lastUpdate = seconds;
    previous.dispose();
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.target.dispose();
    this.generator.dispose();
    this.captureScene.clear();
  }

  private generate(): THREE.WebGLRenderTarget {
    const target = this.generator.fromScene(this.captureScene, 0.035, 0.1, 3000, { size: 128 });
    target.texture.name = "Seasonal city sky reflection";
    return target;
  }
}
