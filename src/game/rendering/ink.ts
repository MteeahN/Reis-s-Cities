import { BufferAttribute, type BufferGeometry, type Material, type MeshStandardMaterial, Vector3 } from 'three';

/**
 * Illustrated look built into the models themselves: every hard edge of a
 * mesh (box corners, roof ridges, window frames, car bodies) is drawn as an
 * ink line, the way a hand-painted city model is outlined.
 *
 * `inkEdges` stores, per triangle corner, a barycentric coordinate in the
 * `aInk` attribute. Edges between nearly coplanar triangles (the diagonal of
 * a quad, a smooth cylinder) are hidden by pushing that coordinate away from
 * zero. `patchInk` then draws a screen-constant line where the coordinate is
 * near zero. Values are offset by +1 so a geometry without the attribute
 * (WebGL reads 0) gets no lines at all.
 */
export function inkEdges(source: BufferGeometry, creaseDeg = 30): BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source;
  const pos = geo.getAttribute('position');
  const triCount = Math.floor(pos.count / 3);
  const cosCrease = Math.cos((creaseDeg * Math.PI) / 180);
  const normals: Vector3[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    normals.push(new Vector3().subVectors(c, b).cross(new Vector3().subVectors(a, b)).normalize());
  }
  // Weld corners by position (0.002 m grid) into integer ids; edges are keyed by the id pair.
  const ids = new Map<string, number>();
  const vid = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 500)},${Math.round(pos.getY(i) * 500)},${Math.round(pos.getZ(i) * 500)}`;
    let id = ids.get(k);
    if (id === undefined) ids.set(k, (id = ids.size));
    vid[i] = id;
  }
  const edgeKey = (i: number, j: number) => (vid[i] < vid[j] ? vid[i] * 4194304 + vid[j] : vid[j] * 4194304 + vid[i]);
  const edges = new Map<number, number[]>();
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      const k = edgeKey(t * 3 + e, t * 3 + ((e + 1) % 3));
      const list = edges.get(k);
      if (list) list.push(t);
      else edges.set(k, [t]);
    }
  }
  const ink = new Float32Array(pos.count * 3);
  for (let t = 0; t < triCount; t++) {
    // Corner v gets 1 in component v; edge (v, v+1) is opposite corner v+2.
    const hide = [0, 0, 0];
    for (let e = 0; e < 3; e++) {
      const list = edges.get(edgeKey(t * 3 + e, t * 3 + ((e + 1) % 3)))!;
      const n = normals[t];
      const smooth = list.length > 1 && list.every((o) => o === t || normals[o].dot(n) > cosCrease);
      if (smooth) hide[(e + 2) % 3] = 1;
    }
    for (let v = 0; v < 3; v++) {
      for (let k = 0; k < 3; k++) ink[(t * 3 + v) * 3 + k] = 1 + (k === v ? 1 : 0) + hide[k];
    }
  }
  geo.setAttribute('aInk', new BufferAttribute(ink, 3));
  return geo;
}

export interface InkOptions {
  /** Line colour (linear RGB). */
  color?: [number, number, number];
  /** Line width in screen pixels. */
  width?: number;
  /** Line opacity. */
  strength?: number;
  /** View distance (m) where lines start to fade, and where they are gone. */
  fade?: [number, number];
}

/** Adds ink lines to a standard material, keeping any shader patch it already has. */
/** Global multiplier of the ink outline strength (picture looks change it). */
export const inkScaleUniform = { value: 1 };

export function patchInk(mat: MeshStandardMaterial, opts: InkOptions = {}): void {
  const color = opts.color ?? [0.07, 0.055, 0.05];
  const width = opts.width ?? 1.15;
  const strength = opts.strength ?? 0.85;
  const fade = opts.fade ?? [600, 2600];
  const prev = mat.onBeforeCompile.bind(mat);
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.uniforms.uInkScale = inkScaleUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 aInk;\nvarying vec3 vInk;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvInk = aInk;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vInk;\nuniform float uInkScale;`).replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
if (vInk.x > 0.5) {
  vec3 inkB = vInk - 1.0;
  float inkD = min(min(inkB.x, inkB.y), inkB.z);
  float inkW = fwidth(inkD) * ${width.toFixed(3)};
  float inkLine = 1.0 - smoothstep(inkW * 0.5, inkW * 1.5, inkD);
  float inkFade = 1.0 - smoothstep(${fade[0].toFixed(1)}, ${fade[1].toFixed(1)}, length(vViewPosition));
  gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(${color.map((v) => v.toFixed(3)).join(', ')}), clamp(inkLine * inkFade * ${strength.toFixed(3)} * uInkScale, 0.0, 1.0));
}`,
    );
  };
  mat.customProgramCacheKey = () => `${prevKey()}|ink2-${width}-${strength}-${fade.join('-')}`;
}

/** True when a material was patched for ink (used by tests). */
export function hasInk(mat: Material): boolean {
  return mat.customProgramCacheKey().includes('|ink2-');
}
