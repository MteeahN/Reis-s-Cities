import { DepthTexture, HalfFloatType, type PerspectiveCamera, type Scene, UnsignedIntType, Vector2, type WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SketchPass } from './SketchPass';

export type ArtStyle = 'sketch' | 'realistic';

/**
 * Screen effects. Bloom (glow around lit windows, lamps and the sun) is
 * optional; the sketch art style draws the scene as an inked, watercoloured
 * drawing. With both off the scene renders straight to the canvas.
 */
export class PostProcessing {
  bloomEnabled = false;
  style: ArtStyle = 'sketch';
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private sketch: SketchPass | null = null;
  private width = 1;
  private height = 1;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: PerspectiveCamera,
  ) {}

  private get active(): boolean {
    return this.bloomEnabled || this.style === 'sketch';
  }

  private ensure(): EffectComposer {
    if (this.composer) return this.composer;
    const target = new WebGLRenderTarget(this.width, this.height, { type: HalfFloatType, samples: 4 });
    // The sketch pass reads scene depth for its outlines.
    target.depthTexture = new DepthTexture(this.width, this.height, UnsignedIntType);
    const c = new EffectComposer(this.renderer, target);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.sketch = new SketchPass(this.camera);
    c.addPass(this.sketch);
    this.bloom = new UnrealBloomPass(new Vector2(this.width, this.height), 0.4, 0.45, 2.4);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    c.setPixelRatio(this.renderer.getPixelRatio());
    c.setSize(this.width, this.height);
    this.composer = c;
    return c;
  }

  setBloom(v: boolean): void {
    this.bloomEnabled = v;
    if (this.active) this.ensure();
  }

  setStyle(s: ArtStyle): void {
    this.style = s;
    if (this.active) this.ensure();
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
    if (!this.active) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const c = this.ensure();
    this.sketch!.enabled = this.style === 'sketch';
    this.sketch!.night = night;
    this.bloom!.enabled = this.bloomEnabled;
    // Gentle at night: lit windows and lamps glow softly instead of flaring.
    this.bloom!.threshold = 2.6 - 1.3 * night;
    this.bloom!.strength = 0.22 + 0.26 * night;
    c.render();
  }

  dispose(): void {
    this.composer?.dispose();
    this.bloom?.dispose();
    this.sketch?.dispose();
  }
}
