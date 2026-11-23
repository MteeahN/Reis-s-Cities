import { Color, Fog, MathUtils, PMREMGenerator, Scene, Vector3, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';

export interface SunSettings {
  elevationDeg: number;
  azimuthDeg: number;
}

/**
 * Physical sky dome + image-based lighting (PMREM) + distance fog that blends
 * terrain into the horizon. The day/night cycle moves the sun and re-bakes
 * the environment map when the sky has changed noticeably.
 */
export class SkyEnvironment {
  readonly sky = new Sky();
  readonly sunDirection = new Vector3();
  readonly fog: Fog;
  private envTarget: WebGLRenderTarget | null = null;
  private readonly pmrem: PMREMGenerator;
  private envIntensity = 0.3;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
  ) {
    this.sky.name = 'sky';
    this.sky.scale.setScalar(50000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 5.5;
    u.rayleigh.value = 1.35;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);

    this.fog = new Fog(new Color(0xbfd3e2), 2600, 14000);
    scene.fog = this.fog;
    this.pmrem = new PMREMGenerator(renderer);
  }

  /** Moves the sun and immediately re-bakes the environment. */
  setSun({ elevationDeg, azimuthDeg }: SunSettings): void {
    this.setSunDirection(elevationDeg, azimuthDeg);
    this.rebuildEnvironment();
  }

  /** Moves the sun in the sky shader only (cheap; call every frame). */
  setSunDirection(elevationDeg: number, azimuthDeg: number): void {
    const phi = MathUtils.degToRad(90 - elevationDeg);
    const theta = MathUtils.degToRad(azimuthDeg);
    this.sunDirection.setFromSphericalCoords(1, phi, theta);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDirection);
  }

  setEnvironmentIntensity(v: number): void {
    this.envIntensity = v;
    this.scene.environmentIntensity = v;
  }

  /** Bakes the current sky into a prefiltered env map for reflections/IBL. */
  rebuildEnvironment(): void {
    const envScene = new Scene();
    const skyCopy = new Sky();
    skyCopy.scale.setScalar(1000);
    const src = this.sky.material.uniforms;
    const dst = skyCopy.material.uniforms;
    for (const key of Object.keys(src)) {
      const v = src[key].value;
      dst[key].value = v && typeof v.clone === 'function' ? v.clone() : v;
    }
    envScene.add(skyCopy);
    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromScene(envScene, 0, 0.1, 2000);
    this.scene.environment = this.envTarget.texture;
    // The physical sky is HDR and very bright; as IBL it must only be a soft fill.
    this.scene.environmentIntensity = this.envIntensity;
    skyCopy.geometry.dispose();
    skyCopy.material.dispose();
  }

  dispose(): void {
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    void this.renderer;
  }
}
