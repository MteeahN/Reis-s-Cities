import type { P2 } from '../../entities/road/curve';
import { relaxCorners, simplifyRoute, smoothPieces, type RoutePiece } from '../../systems/HighwayRoute';

/** Minimum spacing (m) of the points kept from a freehand stroke. */
const STROKE_SPACING = 14;

/**
 * Smooth road pieces along a freehand stroke: the stroke is thinned and
 * simplified, corners tighter than `minRadius` are dropped, and the rest
 * becomes a chain of curves that meet with the same direction.
 */
export function freehandPieces(stroke: P2[], minRadius: number): RoutePiece[] {
  if (stroke.length < 2) return [];
  const kept: P2[] = [stroke[0]];
  for (let k = 1; k < stroke.length - 1; k++) {
    const last = kept[kept.length - 1];
    if (Math.hypot(stroke[k].x - last.x, stroke[k].z - last.z) >= STROKE_SPACING) kept.push(stroke[k]);
  }
  const end = stroke[stroke.length - 1];
  const last = kept[kept.length - 1];
  // The end point always stays; a too-close previous point gives way to it.
  if (kept.length > 1 && Math.hypot(end.x - last.x, end.z - last.z) < STROKE_SPACING) kept.pop();
  kept.push(end);
  if (kept.length < 2 || Math.hypot(end.x - kept[0].x, end.z - kept[0].z) < 1) return [];
  const pts = relaxCorners(simplifyRoute(kept, 2, 80), Math.max(12, minRadius * 1.3));
  return smoothPieces(pts);
}

/** Centre of the circle through three points, or null when they are (nearly) on a line. */
export function circleThrough(a: P2, b: P2, c: P2): P2 | null {
  const d = 2 * (a.x * (b.z - c.z) + b.x * (c.z - a.z) + c.x * (a.z - b.z));
  if (Math.abs(d) < 1e-6) return null;
  const a2 = a.x * a.x + a.z * a.z;
  const b2 = b.x * b.x + b.z * b.z;
  const c2 = c.x * c.x + c.z * c.z;
  return {
    x: (a2 * (b.z - c.z) + b2 * (c.z - a.z) + c2 * (a.z - b.z)) / d,
    z: (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d,
  };
}

const TAU = Math.PI * 2;
/** Largest turn of one piece of an arc (quadratic curves stay close to the circle). */
const ARC_PIECE = Math.PI / 3;

/**
 * A circular arc from `a` to `b` passing through (or bulging towards) `via`,
 * as quadratic pieces of at most 60° each. Nearly straight → one straight
 * piece. The sweep is limited to 270°.
 */
export function arcPieces(a: P2, b: P2, via: P2): RoutePiece[] {
  const straight = (): RoutePiece[] => [{ a, b, c: { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 } }];
  const o = circleThrough(a, b, via);
  if (!o) return straight();
  const r = Math.hypot(a.x - o.x, a.z - o.z);
  if (r > 5000) return straight();
  const ang = (p: P2) => Math.atan2(p.z - o.z, p.x - o.x);
  const ta = ang(a);
  const span = (((ang(b) - ta) % TAU) + TAU) % TAU;
  const toVia = (((ang(via) - ta) % TAU) + TAU) % TAU;
  // Go the way round that passes the bulge point.
  let sweep = toVia < span ? span : span - TAU;
  const clamped = Math.abs(sweep) > Math.PI * 1.5;
  if (clamped) sweep = Math.sign(sweep) * Math.PI * 1.5;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_PIECE));
  const step = sweep / n;
  const at = (t: number): P2 => ({ x: o.x + Math.cos(t) * r, z: o.z + Math.sin(t) * r });
  const out: RoutePiece[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = ta + step * k;
    const t1 = t0 + step;
    const mid = (t0 + t1) / 2;
    const reach = r / Math.cos(step / 2);
    out.push({
      a: k === 0 ? a : at(t0),
      b: k === n - 1 && !clamped ? b : at(t1),
      c: { x: o.x + Math.cos(mid) * reach, z: o.z + Math.sin(mid) * reach },
    });
  }
  return out;
}
