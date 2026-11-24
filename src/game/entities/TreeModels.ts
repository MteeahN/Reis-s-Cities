import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inkEdges } from '../rendering/ink';
import { mulberry32 } from '../world/generation/rng';

/**
 * Procedural, stylised-realistic vegetation models. Each model exists in a
 * high-detail and a low-detail (far LOD) version with baked vertex colours
 * (vertical gradient ≈ ambient occlusion). Per-instance tint adds variety.
 */

type Part = { geo: BufferGeometry; top: number; bottom: number; jitter?: number };

function prepare(part: Part, seed: number): BufferGeometry {
  let g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
  g.deleteAttribute('uv');
  g.computeBoundingBox();
  const pos = g.getAttribute('position') as BufferAttribute;
  const bb = g.boundingBox!;
  const top = new Color(part.top);
  const bottom = new Color(part.bottom);
  const c = new Color();
  const colors = new Float32Array(pos.count * 3);
  const rand = mulberry32(seed);
  if (part.jitter) {
    // Organic silhouettes: displace shared positions consistently.
    const map = new Map<string, [number, number, number]>();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      let d = map.get(key);
      if (!d) {
        d = [(rand() - 0.5) * part.jitter, (rand() - 0.5) * part.jitter, (rand() - 0.5) * part.jitter];
        map.set(key, d);
      }
      pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
    }
    g.computeVertexNormals();
    g.computeBoundingBox();
  }
  const h = Math.max(1e-3, bb.max.y - bb.min.y);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - bb.min.y) / h;
    c.copy(bottom).lerp(top, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g;
}

function build(parts: Part[], seed: number): BufferGeometry {
  const merged = mergeGeometries(parts.map((p, i) => prepare(p, seed + i * 17)));
  if (!merged) throw new Error('Tree model merge failed');
  const inked = inkEdges(merged, 55);
  inked.computeBoundingSphere();
  return inked;
}

const TRUNK_TOP = 0x6b4f36;
const TRUNK_BOTTOM = 0x3e2c1d;

export function pineHigh(): BufferGeometry {
  return build(
    [
      { geo: new CylinderGeometry(0.22, 0.38, 3.2, 6).translate(0, 1.6, 0), top: TRUNK_TOP, bottom: TRUNK_BOTTOM },
      { geo: new ConeGeometry(2.7, 4.4, 9, 1).translate(0, 4.3, 0), top: 0x3f6d3a, bottom: 0x1c3a1f, jitter: 0.35 },
      { geo: new ConeGeometry(2.1, 3.8, 9, 1).translate(0, 6.4, 0), top: 0x4a7a42, bottom: 0x22432a, jitter: 0.3 },
      { geo: new ConeGeometry(1.35, 3.2, 8, 1).translate(0, 8.4, 0), top: 0x5a8a4c, bottom: 0x2a4c2c, jitter: 0.2 },
    ],
    101,
  );
}

export function pineLow(): BufferGeometry {
  return build(
    [
      { geo: new CylinderGeometry(0.25, 0.35, 1.6, 4).translate(0, 0.8, 0), top: TRUNK_TOP, bottom: TRUNK_BOTTOM },
      { geo: new ConeGeometry(2.6, 8.6, 6, 1).translate(0, 5.6, 0), top: 0x4c7c44, bottom: 0x1f3d22 },
    ],
    102,
  );
}

export function broadleafHigh(): BufferGeometry {
  return build(
    [
      { geo: new CylinderGeometry(0.28, 0.45, 3.6, 6).translate(0, 1.8, 0), top: TRUNK_TOP, bottom: TRUNK_BOTTOM },
      { geo: new IcosahedronGeometry(2.9, 1).scale(1, 0.86, 1).translate(0, 5.6, 0), top: 0x6f9a45, bottom: 0x2f5222, jitter: 0.55 },
      // Secondary blobs use the coarser icosahedron: same silhouette, ~60% fewer triangles.
      { geo: new IcosahedronGeometry(1.9, 0).translate(1.7, 4.8, 0.7), top: 0x64903f, bottom: 0x2b4b20, jitter: 0.3 },
      { geo: new IcosahedronGeometry(1.8, 0).translate(-1.4, 5.0, -1.0), top: 0x76a24c, bottom: 0x335826, jitter: 0.3 },
      { geo: new IcosahedronGeometry(1.6, 0).translate(0.3, 7.3, 0.2), top: 0x86b158, bottom: 0x4a7232, jitter: 0.25 },
    ],
    103,
  );
}

export function broadleafLow(): BufferGeometry {
  return build(
    [
      { geo: new CylinderGeometry(0.3, 0.4, 2.4, 4).translate(0, 1.2, 0), top: TRUNK_TOP, bottom: TRUNK_BOTTOM },
      { geo: new IcosahedronGeometry(3.3, 0).scale(1, 0.9, 1).translate(0, 5.6, 0), top: 0x76a04a, bottom: 0x2f5222 },
    ],
    104,
  );
}

/** Tall, narrow poplar-like tree (lighter foliage) for variety among broadleaf woods. */
export function poplarHigh(): BufferGeometry {
  return build(
    [
      { geo: new CylinderGeometry(0.2, 0.34, 3.4, 6).translate(0, 1.7, 0), top: 0x8a7a66, bottom: 0x4a3f33 },
      { geo: new IcosahedronGeometry(1.7, 1).scale(1, 2.5, 1).translate(0, 6.6, 0), top: 0x9ab95a, bottom: 0x3f6428, jitter: 0.4 },
      { geo: new IcosahedronGeometry(1.1, 0).scale(1, 1.7, 1).translate(0.5, 9.4, 0.2), top: 0xa8c466, bottom: 0x52763a, jitter: 0.2 },
    ],
    106,
  );
}

export function poplarLow(): BufferGeometry {
  return build(
    [
      { geo: new CylinderGeometry(0.22, 0.32, 2.4, 4).translate(0, 1.2, 0), top: 0x8a7a66, bottom: 0x4a3f33 },
      { geo: new IcosahedronGeometry(1.8, 0).scale(1, 2.6, 1).translate(0, 6.8, 0), top: 0xa0bd5e, bottom: 0x44682c },
    ],
    107,
  );
}

export function rock(): BufferGeometry {
  return build(
    [{ geo: new DodecahedronGeometry(1, 1).scale(1.35, 0.7, 1.1), top: 0x9a968a, bottom: 0x5e5b53, jitter: 0.28 }],
    105,
  );
}
