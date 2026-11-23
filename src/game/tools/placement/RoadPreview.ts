import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
} from 'three';
import { WATER_LEVEL } from '../../core/config';
import type { P2 } from '../../entities/road/curve';

const MAX_POINTS = 1600;
const LIFT = 0.55;

export type PreviewState = 'valid' | 'invalid' | 'select' | 'demolish' | 'upgrade';

const COLORS: Record<PreviewState, Color> = {
  valid: new Color(0x34d399),
  invalid: new Color(0xf87171),
  select: new Color(0xffd166),
  demolish: new Color(0xff5a5a),
  upgrade: new Color(0x60a5fa),
};

type HeightFn = (x: number, z: number) => number;

/**
 * Terrain-draped ghost ribbon for any road path (straight or curved) plus
 * up to three markers (start, control, end). Buffers are preallocated and
 * rewritten in place — no per-frame allocations.
 */
export class RoadPreview {
  readonly group = new Group();
  private readonly geo = new BufferGeometry();
  private readonly pos = new Float32Array(MAX_POINTS * 2 * 3);
  private readonly uv = new Float32Array(MAX_POINTS * 2 * 2);
  private readonly material: ShaderMaterial;
  private readonly ribbon: Mesh;
  private readonly markers: Mesh[] = [];
  private readonly markerMat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide });
  private readonly tmpColor = new Color();

  constructor() {
    this.group.name = 'road-preview';
    const index = new Uint32Array((MAX_POINTS - 1) * 6);
    for (let s = 0; s < MAX_POINTS - 1; s++) {
      const a = s * 2;
      index.set([a, a + 2, a + 1, a + 1, a + 2, a + 3], s * 6);
    }
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new BufferAttribute(this.uv, 2));
    this.geo.setIndex(new BufferAttribute(index, 1));
    this.material = new ShaderMaterial({
      uniforms: { uColor: { value: COLORS.valid.clone() }, uTime: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uAlpha;
        varying vec2 vUv;
        void main() {
          float edge = smoothstep(0.1, 0.0, vUv.x) + smoothstep(0.9, 1.0, vUv.x);
          float centre = (1.0 - smoothstep(0.0, 0.03, abs(vUv.x - 0.5))) * step(0.5, fract(vUv.y / 6.0 - uTime * 0.6));
          float alpha = (0.32 + edge * 0.55 + centre * 0.45) * uAlpha;
          gl_FragColor = vec4(mix(uColor, vec3(1.0), centre * 0.6 + edge * 0.2), alpha);
        }`,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
    });
    this.ribbon = new Mesh(this.geo, this.material);
    this.ribbon.frustumCulled = false;
    this.ribbon.renderOrder = 5;
    this.group.add(this.ribbon);

    const ring = new RingGeometry(0.72, 1, 40);
    ring.rotateX(-Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(ring, this.markerMat);
      m.renderOrder = 6;
      m.visible = false;
      this.markers.push(m);
      this.group.add(m);
    }
    this.group.visible = false;
  }

  private deck(h: number): number {
    return h < WATER_LEVEL + 0.3 ? WATER_LEVEL + 4.5 : h;
  }

  /** Draws a ribbon of `width` along `points` (≥2). */
  showPath(points: P2[], width: number, state: PreviewState, heightAt: HeightFn): void {
    this.group.visible = true;
    const n = Math.min(points.length, MAX_POINTS);
    if (n < 2) {
      this.ribbon.visible = false;
      return;
    }
    this.ribbon.visible = true;
    const half = width / 2;
    let v = 0;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      const a = points[Math.max(0, i - 1)];
      const b = points[Math.min(n - 1, i + 1)];
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      tx /= len;
      tz /= len;
      const nx = -tz * half;
      const nz = tx * half;
      if (i > 0) v += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
      const hc = this.deck(heightAt(p.x, p.z));
      const hl = Math.max(hc, this.deck(heightAt(p.x + nx, p.z + nz)));
      const hr = Math.max(hc, this.deck(heightAt(p.x - nx, p.z - nz)));
      const o = i * 6;
      this.pos[o] = p.x + nx;
      this.pos[o + 1] = hl + LIFT;
      this.pos[o + 2] = p.z + nz;
      this.pos[o + 3] = p.x - nx;
      this.pos[o + 4] = hr + LIFT;
      this.pos[o + 5] = p.z - nz;
      const u = i * 4;
      this.uv[u] = 0;
      this.uv[u + 1] = v;
      this.uv[u + 2] = 1;
      this.uv[u + 3] = v;
    }
    (this.geo.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('uv') as BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
    this.material.uniforms.uColor.value.copy(COLORS[state]);
    this.tmpColor.copy(COLORS[state]).lerp(COLORS.select, 0).lerp(new Color(0xffffff), 0.4);
    this.markerMat.color.copy(this.tmpColor);
  }

  hidePath(): void {
    this.ribbon.visible = false;
  }

  /** Places markers (start, control, end…); pass fewer points to hide the rest. */
  setMarkers(points: P2[], size: number, heightAt: HeightFn): void {
    this.group.visible = true;
    this.markers.forEach((m, i) => {
      const p = points[i];
      m.visible = !!p;
      if (!p) return;
      m.position.set(p.x, this.deck(heightAt(p.x, p.z)) + LIFT + 0.05, p.z);
      m.scale.setScalar(Math.max(3, size));
    });
  }

  tick(dt: number): void {
    this.material.uniforms.uTime.value += dt;
  }

  hide(): void {
    this.group.visible = false;
    this.ribbon.visible = false;
    this.markers.forEach((m) => (m.visible = false));
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
    this.markerMat.dispose();
    this.markers[0]?.geometry.dispose();
  }
}
