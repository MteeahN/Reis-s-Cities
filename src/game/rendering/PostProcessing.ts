import { HalfFloatType, type Camera, type Scene, Vector2, type WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Optional bloom (glow around lit windows, street lamps, headlights and the
 * sun). When disabled the scene renders straight to the canvas with no extra
 * cost. Bloom is gentle by day and stronger at night.
 */
export class PostProcessing {
  enabled = false;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private width = 1;
  private height = 1;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {}

  private ensure(): EffectComposer {
    if (this.composer) return this.composer;
    const target = new WebGLRenderTarget(this.width, this.height, { type: HalfFloatType, samples: 4 });
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(this.width, this.height), 0.4, 0.45, 2.4);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    c.setPixelRatio(this.renderer.getPixelRatio());
    c.setSize(this.width, this.height);
    this.composer = c;
    return c;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (v) this.ensure();
  }

  setSize(w: number, h: number): void {
    this.width = w;
    this.height = h;
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  /** @param night 0–1: lowers the threshold and raises the strength after dark. */
  render(night: number): void {
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const c = this.ensure();
    this.bloom!.threshold = 2.6 - 1.7 * night;
    this.bloom!.strength = 0.22 + 0.5 * night;
    c.render();
  }

  dispose(): void {
    this.composer?.dispose();
    this.bloom?.dispose();
  }
}
