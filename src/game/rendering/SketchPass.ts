import { ShaderMaterial, Vector2, type PerspectiveCamera, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

/**
 * Hand-drawn look: ink outlines from depth and colour edges, a softened
 * watercolour fill, pencil hatching in shadows and a paper grain. Works on the
 * linear HDR image straight after the scene render (before bloom and tone
 * mapping), so it must sit right after the RenderPass, where the read buffer
 * still holds the scene depth.
 */
const SketchShader = {
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uResolution;
    uniform float uNear;
    uniform float uFar;
    uniform float uNight;
    uniform float uPixel;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float linearDepth(vec2 uv) {
      float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    // Linear HDR luminance mapped to a 0–1 "ink value".
    float tone(vec3 c) { float l = lum(c); return l / (l + 0.35); }

    void main() {
      vec2 px = gl_FragCoord.xy / uPixel;
      // Pencil wobble: sample the edges slightly off the true position.
      vec2 wob = (vec2(noise(px * 0.06), noise(px * 0.06 + 17.0)) - 0.5) * 1.6 / uResolution;
      vec2 t = 1.5 * uPixel / uResolution;
      vec2 uv = vUv + wob;

      // Depth edges (silhouettes), relative to distance so far buildings keep thin lines.
      float d = linearDepth(uv);
      float dl = linearDepth(uv - vec2(t.x, 0.0));
      float dr = linearDepth(uv + vec2(t.x, 0.0));
      float du = linearDepth(uv + vec2(0.0, t.y));
      float dd = linearDepth(uv - vec2(0.0, t.y));
      float lap = abs(dl + dr + du + dd - 4.0 * d) / max(d, 1.0);
      float depthEdge = smoothstep(0.012, 0.05, lap);

      // Colour edges (windows, road markings, roof lines).
      float c0 = tone(texture2D(tDiffuse, uv).rgb);
      float cx = tone(texture2D(tDiffuse, uv + vec2(t.x, 0.0)).rgb) - tone(texture2D(tDiffuse, uv - vec2(t.x, 0.0)).rgb);
      float cy = tone(texture2D(tDiffuse, uv + vec2(0.0, t.y)).rgb) - tone(texture2D(tDiffuse, uv - vec2(0.0, t.y)).rgb);
      float colorEdge = smoothstep(0.08, 0.22, length(vec2(cx, cy)));

      bool sky = texture2D(tDepth, vUv).x > 0.99999;
      // Lines fade with distance so the horizon does not turn grey.
      float far = smoothstep(2500.0, 9000.0, d);
      float ink = max(depthEdge, colorEdge * 0.7) * (1.0 - far * 0.85);
      // Broken strokes: lines skip here and there like a real pen.
      ink *= 0.75 + 0.25 * noise(px * 0.35);
      if (sky) ink = 0.0;

      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float v = tone(col);

      // Watercolour fill: lighter, less saturated, slightly posterized.
      vec3 hue = col / max(lum(col), 1e-4) * 0.5;
      float steps = 5.0;
      float vq = floor(v * steps + 0.5) / steps;
      float vf = mix(v, vq, 0.45);
      vec3 paper = mix(vec3(0.93, 0.89, 0.80), vec3(0.11, 0.13, 0.19), uNight);
      vec3 wash = mix(paper, clamp(hue * vf * 1.7, 0.0, 4.0), 0.8 + 0.15 * uNight);
      // Pigment pooling: blotchy density like wet paint.
      wash *= 0.94 + 0.12 * noise(px * 0.012 + noise(px * 0.05));

      // Cross hatching in shadows, drawn in screen space at two angles.
      float s1 = sin((px.x + px.y) * 0.9);
      float s2 = sin((px.x - px.y) * 0.9);
      float h1 = smoothstep(0.55, 0.2, v) * smoothstep(0.35, 0.9, s1);
      float h2 = smoothstep(0.32, 0.08, v) * smoothstep(0.35, 0.9, s2);
      float hatch = max(h1, h2) * (1.0 - far) * (1.0 - uNight * 0.7);
      if (sky) hatch = 0.0;

      vec3 inkColor = mix(vec3(0.16, 0.13, 0.12), vec3(0.85, 0.82, 0.72), uNight * 0.15);
      vec3 outc = sky ? mix(paper, col, 0.25 + 0.5 * uNight) : wash;
      outc = mix(outc, inkColor, hatch * 0.3);
      outc = mix(outc, inkColor, clamp(ink, 0.0, 1.0) * 0.9);
      // Paper grain over everything.
      outc *= 0.96 + 0.06 * hash(floor(px));
      // Lit windows and lamps keep their glow at night.
      outc = max(outc, col * uNight * smoothstep(0.6, 1.4, lum(col)));
      gl_FragColor = vec4(outc, 1.0);
    }
  `,
};

export class SketchPass extends Pass {
  private readonly material: ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(private readonly camera: PerspectiveCamera) {
    super();
    this.material = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uResolution: { value: new Vector2(1, 1) },
        uNear: { value: 1 },
        uFar: { value: 60000 },
        uNight: { value: 0 },
        uPixel: { value: 1 },
      },
      vertexShader: SketchShader.vertexShader,
      fragmentShader: SketchShader.fragmentShader,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
  }

  set night(v: number) {
    this.material.uniforms.uNight.value = v;
  }

  override setSize(w: number, h: number): void {
    this.material.uniforms.uResolution.value.set(w, h);
  }

  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget): void {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    u.uPixel.value = renderer.getPixelRatio();
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose(): void {
    this.material.dispose();
    this.quad.dispose();
  }
}
