import { WORLD_SIZE } from '../core/config';
import { minTurnRadius, type P2 } from '../entities/road/curve';

/** Grid spacing of the route search (m). */
const STEP = 16;
const N = Math.floor(WORLD_SIZE / STEP);

export interface RouteTerrain {
  heightAt(x: number, z: number): number;
  isWaterAt(x: number, z: number): boolean;
}

/** Binary min-heap of node indices keyed by priority. */
class Heap {
  private readonly ids: number[] = [];
  private readonly keys: number[] = [];
  get size(): number {
    return this.ids.length;
  }
  push(id: number, key: number): void {
    let i = this.ids.length;
    this.ids.push(id);
    this.keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.ids[i] = this.ids[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }
  pop(): number {
    const top = this.ids[0];
    const id = this.ids.pop()!;
    const key = this.keys.pop()!;
    if (this.ids.length > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= this.ids.length) break;
        const r = l + 1;
        const c = r < this.ids.length && this.keys[r] < this.keys[l] ? r : l;
        if (this.keys[c] >= key) break;
        this.ids[i] = this.ids[c];
        this.keys[i] = this.keys[c];
        i = c;
      }
      this.ids[i] = id;
      this.keys[i] = key;
    }
    return top;
  }
}

const DIRS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
  [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2],
];

/**
 * Gentlest route over the terrain (A* on a 16 m grid): cost grows with the
 * square of the grade, so the road follows valleys and contours like a real
 * highway; crossing water costs extra (a bridge). `starts` are the allowed
 * first nodes, `isGoal` ends the search, `toGoal` is an admissible estimate.
 * `avoid` (optional) adds a cost per metre at a point, e.g. to keep the road
 * off the city's own land.
 */
export function findRoute(
  t: RouteTerrain,
  starts: P2[],
  isGoal: (p: P2) => boolean,
  toGoal: (p: P2) => number,
  maxGrade: number,
  avoid?: (p: P2) => number,
): P2[] | null {
  const pos = (k: number): P2 => ({ x: (k % N) * STEP + STEP / 2, z: Math.floor(k / N) * STEP + STEP / 2 });
  const h = new Float32Array(N * N);
  const wet = new Uint8Array(N * N);
  const extra = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) {
    const p = pos(k);
    h[k] = t.heightAt(p.x, p.z);
    wet[k] = t.isWaterAt(p.x, p.z) ? 1 : 0;
    if (avoid) extra[k] = avoid(p);
  }
  const g = new Float64Array(N * N).fill(Infinity);
  const from = new Int32Array(N * N).fill(-1);
  const open = new Heap();
  const done = new Uint8Array(N * N);
  for (const s of starts) {
    const i = Math.min(N - 1, Math.max(0, Math.floor(s.x / STEP)));
    const j = Math.min(N - 1, Math.max(0, Math.floor(s.z / STEP)));
    const k = j * N + i;
    if (wet[k]) continue;
    g[k] = 0;
    open.push(k, toGoal(pos(k)));
  }
  while (open.size > 0) {
    const k = open.pop();
    if (done[k]) continue;
    done[k] = 1;
    const p = pos(k);
    if (isGoal(p) && !wet[k]) {
      const path: P2[] = [];
      for (let c = k; c >= 0; c = from[c]) path.push(pos(c));
      return path.reverse();
    }
    const i = k % N;
    const j = Math.floor(k / N);
    for (const [di, dj] of DIRS) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
      const nk = nj * N + ni;
      if (done[nk]) continue;
      const len = Math.hypot(di, dj) * STEP;
      const grade = Math.abs(h[nk] - h[k]) / len;
      if (grade > maxGrade * 2.5) continue;
      let cost = len * (1 + 60 * grade * grade + (grade > maxGrade ? 400 * (grade - maxGrade) : 0));
      if (wet[nk] || wet[k]) cost += len * 3;
      cost += len * extra[nk];
      const ng = g[k] + cost;
      if (ng < g[nk]) {
        g[nk] = ng;
        from[nk] = k;
        open.push(nk, ng + toGoal(pos(nk)));
      }
    }
  }
  return null;
}

/** One smooth road piece: from `a` to `b`, bending through the Bézier control point `c`. */
export interface RoutePiece {
  a: P2;
  b: P2;
  c: P2;
}

/**
 * Smooth pieces through a simplified route (a quadratic B-spline): each corner
 * point becomes the control point of a curve between the midpoints of its two
 * legs, so consecutive pieces meet with the same direction — no sharp kinks.
 */
export function smoothPieces(pts: P2[]): RoutePiece[] {
  const mid = (p: P2, q: P2): P2 => ({ x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 });
  if (pts.length < 2) return [];
  if (pts.length === 2) return [{ a: pts[0], b: pts[1], c: mid(pts[0], pts[1]) }];
  const out: RoutePiece[] = [];
  const n = pts.length - 1;
  for (let i = 1; i < n; i++) {
    const a = i === 1 ? pts[0] : mid(pts[i - 1], pts[i]);
    const b = i === n - 1 ? pts[n] : mid(pts[i], pts[i + 1]);
    out.push({ a, b, c: pts[i] });
  }
  return out;
}

/**
 * Drops route corners whose smooth curve would turn tighter than `minRadius`
 * (the tightest first), so the road sweeps through wide bends.
 */
export function relaxCorners(pts: P2[], minRadius: number): P2[] {
  const out = pts.slice();
  for (let guard = 0; guard < pts.length && out.length > 3; guard++) {
    const pieces = smoothPieces(out);
    let worst = -1;
    let worstR = minRadius;
    for (let i = 0; i < pieces.length; i++) {
      const r = minTurnRadius({ p0: pieces[i].a, p1: pieces[i].c, p2: pieces[i].b });
      if (r < worstR) (worstR = r), (worst = i);
    }
    if (worst < 0) break;
    // Piece i bends through point i + 1.
    out.splice(worst + 1, 1);
  }
  return out;
}

/** Ramer–Douglas–Peucker simplification, then long runs split so each piece stays near the ground. */
export function simplifyRoute(path: P2[], tolerance = 10, maxPiece = 128): P2[] {
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bestD = tolerance;
    const ax = path[a].x;
    const az = path[a].z;
    const dx = path[b].x - ax;
    const dz = path[b].z - az;
    const l = Math.hypot(dx, dz) || 1;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((path[k].x - ax) * dz - (path[k].z - az) * dx) / l;
      if (d > bestD) (bestD = d), (best = k);
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const pts = path.filter((_, k) => keep[k]);
  const out: P2[] = [pts[0]];
  for (let k = 1; k < pts.length; k++) {
    const a = out[out.length - 1];
    const b = pts[k];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / maxPiece);
    for (let s = 1; s <= n; s++) out.push({ x: a.x + ((b.x - a.x) * s) / n, z: a.z + ((b.z - a.z) * s) / n });
  }
  return out;
}
