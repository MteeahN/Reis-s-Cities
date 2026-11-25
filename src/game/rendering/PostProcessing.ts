import { HalfFloatType, type Camera, type Scene, Vector2, type WebGLRenderer, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { needsGrade, type Look } from './Looks';

/** Saturation, contrast and tint on the final (display) colours. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uSaturation: { value: 1 }, uContrast: { value: 1 }, uTint: { value: [0, 0, 0] } },
  vertexShader: `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
  vec3 col = mix(vec3(l), c.rgb, uSaturation);
  col = (col - 0.5) * uContrast + 0.5 + uTint;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
}`,
};

/**
 * Optional bloom (glow around lit windows, street lamps, headlights and the
 * sun) and colour grading for picture looks. When neither is on the scene
 * renders straight to the canvas with no extra cost. Bloom is gentle by day
 * and stronger at night.
 */
export class PostProcessing {
  enabled = false;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private grade: ShaderPass | null = null;
  private grading = false;
  private look: Look | null = null;
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
    // Grading works on display colours, after tone mapping and sRGB.
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    this.applyLook();
    c.setPixelRatio(this.renderer.getPixelRatio());
    c.setSize(this.width, this.height);
    this.composer = c;
    return c;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (v || this.grading) this.ensure();
    if (this.bloom) this.bloom.enabled = v;
  }

  /** Grading of a picture look (the standard look needs none). */
  setLook(look: Look): void {
    this.look = look;
    this.grading = needsGrade(look);
    if (this.grading) this.ensure();
    this.applyLook();
  }

  private applyLook(): void {
    if (this.bloom) this.bloom.enabled = this.enabled;
    if (!this.grade || !this.look) return;
    this.grade.enabled = this.grading;
    this.grade.uniforms.uSaturation.value = this.look.saturation;
    this.grade.uniforms.uContrast.value = this.look.contrast;
    this.grade.uniforms.uTint.value = this.look.tint;
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
    if (!this.enabled && !this.grading) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const c = this.ensure();
    // Gentle at night: lit windows and lamps glow softly instead of flaring.
    this.bloom!.threshold = 2.6 - 1.3 * night;
    this.bloom!.strength = 0.22 + 0.26 * night;
    c.render();
  }

  dispose(): void {
    this.composer?.dispose();
    this.bloom?.dispose();
    this.grade?.dispose();
  }
}
