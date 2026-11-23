/**
 * Quadratic Bézier helpers for road splines (pure math, no Three.js).
 * A straight road is a Bézier whose control point is the segment midpoint.
 */
export interface P2 {
  x: number;
  z: number;
}

export interface QuadBezier {
  p0: P2;
  p1: P2;
  p2: P2;
}

export const straightBezier = (a: P2, b: P2): QuadBezier => ({
  p0: { x: a.x, z: a.z },
  p1: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
  p2: { x: b.x, z: b.z },
});

export function bezierPoint(b: QuadBezier, t: number, out: P2 = { x: 0, z: 0 }): P2 {
  const u = 1 - t;
  out.x = u * u * b.p0.x + 2 * u * t * b.p1.x + t * t * b.p2.x;
  out.z = u * u * b.p0.z + 2 * u * t * b.p1.z + t * t * b.p2.z;
  return out;
}

/** Unit tangent (direction of travel) at t. */
export function bezierTangent(b: QuadBezier, t: number, out: P2 = { x: 0, z: 0 }): P2 {
  let dx = 2 * (1 - t) * (b.p1.x - b.p0.x) + 2 * t * (b.p2.x - b.p1.x);
  let dz = 2 * (1 - t) * (b.p1.z - b.p0.z) + 2 * t * (b.p2.z - b.p1.z);
  let len = Math.hypot(dx, dz);
  if (len < 1e-9) {
    dx = b.p2.x - b.p0.x;
    dz = b.p2.z - b.p0.z;
    len = Math.hypot(dx, dz) || 1;
  }
  out.x = dx / len;
  out.z = dz / len;
  return out;
}

export function bezierLength(b: QuadBezier, segments = 32): number {
  let len = 0;
  let px = b.p0.x;
  let pz = b.p0.z;
  const p = { x: 0, z: 0 };
  for (let i = 1; i <= segments; i++) {
    bezierPoint(b, i / segments, p);
    len += Math.hypot(p.x - px, p.z - pz);
    px = p.x;
    pz = p.z;
  }
  return len;
}

/** De Casteljau split at t → [0,t] and [t,1], both exact quadratics. */
export function splitBezier(b: QuadBezier, t: number): [QuadBezier, QuadBezier] {
  const a = { x: b.p0.x + (b.p1.x - b.p0.x) * t, z: b.p0.z + (b.p1.z - b.p0.z) * t };
  const c = { x: b.p1.x + (b.p2.x - b.p1.x) * t, z: b.p1.z + (b.p2.z - b.p1.z) * t };
  const m = { x: a.x + (c.x - a.x) * t, z: a.z + (c.z - a.z) * t };
  return [
    { p0: { ...b.p0 }, p1: a, p2: { ...m } },
    { p0: { ...m }, p1: c, p2: { ...b.p2 } },
  ];
}

/** The part of the curve between parameters t0 < t1. */
export function subBezier(b: QuadBezier, t0: number, t1: number): QuadBezier {
  if (t1 <= 1e-9) return { p0: { ...b.p0 }, p1: { ...b.p0 }, p2: { ...b.p0 } };
  const [left] = splitBezier(b, t1);
  if (t0 <= 1e-9) return left;
  return splitBezier(left, t0 / t1)[1];
}

export interface Polyline {
  points: P2[];
  /** Cumulative arc length at each point. */
  cum: number[];
  length: number;
}

/** Samples at uniform t with roughly `step` metres between points. */
export function sampleBezier(b: QuadBezier, step = 4): Polyline {
  const approx = bezierLength(b, 16);
  const n = Math.max(1, Math.ceil(approx / step));
  const points: P2[] = [];
  const cum: number[] = [];
  let acc = 0;
  for (let i = 0; i <= n; i++) {
    const p = bezierPoint(b, i / n);
    if (i > 0) acc += Math.hypot(p.x - points[i - 1].x, p.z - points[i - 1].z);
    points.push(p);
    cum.push(acc);
  }
  return { points, cum, length: acc };
}

export interface ClosestResult {
  t: number;
  point: P2;
  dist: number;
}

export function closestOnBezier(b: QuadBezier, p: P2, coarse = 24): ClosestResult {
  const q = { x: 0, z: 0 };
  let bestT = 0;
  let best = Infinity;
  for (let i = 0; i <= coarse; i++) {
    const t = i / coarse;
    bezierPoint(b, t, q);
    const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d < best) {
      best = d;
      bestT = t;
    }
  }
  // Refine with ternary search in the neighbouring interval.
  let lo = Math.max(0, bestT - 1 / coarse);
  let hi = Math.min(1, bestT + 1 / coarse);
  for (let k = 0; k < 30; k++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    bezierPoint(b, m1, q);
    const d1 = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    bezierPoint(b, m2, q);
    const d2 = (q.x - p.x) ** 2 + (q.z - p.z) ** 2;
    if (d1 < d2) hi = m2;
    else lo = m1;
  }
  const t = (lo + hi) / 2;
  const point = bezierPoint(b, t);
  return { t, point, dist: Math.hypot(point.x - p.x, point.z - p.z) };
}

/** Segment a1→a2 vs b1→b2. Returns fractions along each, or null. */
export function segmentIntersection(a1: P2, a2: P2, b1: P2, b2: P2): { fa: number; fb: number } | null {
  const rx = a2.x - a1.x;
  const rz = a2.z - a1.z;
  const sx = b2.x - b1.x;
  const sz = b2.z - b1.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-9) return null; // parallel
  const qx = b1.x - a1.x;
  const qz = b1.z - a1.z;
  const fa = (qx * sz - qz * sx) / den;
  const fb = (qx * rz - qz * rx) / den;
  if (fa < 0 || fa > 1 || fb < 0 || fb > 1) return null;
  return { fa, fb };
}

export interface CrossPoint {
  /** Parameter along polyline A in [0,1] (index-based, i.e. uniform-t of the source curve). */
  ta: number;
  tb: number;
  point: P2;
}

/** All crossings between two polylines sampled at uniform t. */
export function polylineIntersections(a: P2[], b: P2[]): CrossPoint[] {
  const out: CrossPoint[] = [];
  const na = a.length - 1;
  const nb = b.length - 1;
  for (let i = 0; i < na; i++) {
    const a1 = a[i];
    const a2 = a[i + 1];
    const minAx = Math.min(a1.x, a2.x);
    const maxAx = Math.max(a1.x, a2.x);
    const minAz = Math.min(a1.z, a2.z);
    const maxAz = Math.max(a1.z, a2.z);
    for (let j = 0; j < nb; j++) {
      const b1 = b[j];
      const b2 = b[j + 1];
      if (Math.max(b1.x, b2.x) < minAx || Math.min(b1.x, b2.x) > maxAx) continue;
      if (Math.max(b1.z, b2.z) < minAz || Math.min(b1.z, b2.z) > maxAz) continue;
      const hit = segmentIntersection(a1, a2, b1, b2);
      if (!hit) continue;
      out.push({
        ta: (i + hit.fa) / na,
        tb: (j + hit.fb) / nb,
        point: { x: a1.x + (a2.x - a1.x) * hit.fa, z: a1.z + (a2.z - a1.z) * hit.fa },
      });
    }
  }
  // Remove duplicates produced at shared sample vertices.
  out.sort((p, q) => p.ta - q.ta);
  const dedup: CrossPoint[] = [];
  for (const c of out) {
    const last = dedup[dedup.length - 1];
    if (last && Math.hypot(last.point.x - c.point.x, last.point.z - c.point.z) < 0.5) continue;
    dedup.push(c);
  }
  return dedup;
}

/** Smallest turning radius along the curve (Infinity for straight lines). */
export function minTurnRadius(b: QuadBezier, samples = 24): number {
  const ddx = 2 * (b.p0.x - 2 * b.p1.x + b.p2.x);
  const ddz = 2 * (b.p0.z - 2 * b.p1.z + b.p2.z);
  let minR = Infinity;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const dx = 2 * (1 - t) * (b.p1.x - b.p0.x) + 2 * t * (b.p2.x - b.p1.x);
    const dz = 2 * (1 - t) * (b.p1.z - b.p0.z) + 2 * t * (b.p2.z - b.p1.z);
    const speed = Math.hypot(dx, dz);
    const cross = Math.abs(dx * ddz - dz * ddx);
    if (cross < 1e-9 || speed < 1e-6) continue;
    minR = Math.min(minR, (speed * speed * speed) / cross);
  }
  return minR;
}

/** Acute angle (radians, 0..π/2) between two undirected directions. */
export function crossingAngle(a: P2, b: P2): number {
  const dot = Math.abs(a.x * b.x + a.z * b.z);
  return Math.acos(Math.min(1, dot));
}

/** Angle (radians, 0..π) between two directed vectors. */
export function directedAngle(a: P2, b: P2): number {
  const dot = a.x * b.x + a.z * b.z;
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}
