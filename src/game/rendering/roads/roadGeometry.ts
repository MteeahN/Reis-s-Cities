import { WATER_LEVEL } from '../../core/config';
import { bezierTangent, sampleBezier, type P2, type QuadBezier } from '../../entities/road/curve';

export const ROAD_LIFT = 0.16;
export const BRIDGE_DECK = 4.5;
export const RAMP_GRADE = 0.1;
const SKIRT_BELOW = 0.6;
const DECK_THICKNESS = 1.4;
const PILLAR_SPACING = 28;

type HeightFn = (x: number, z: number) => number;

const isWater = (h: number) => h < WATER_LEVEL + 0.3;

export interface MeshArrays {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

export interface Pillar {
  x: number;
  z: number;
  top: number;
  bottom: number;
}

export interface EdgeMeshData extends MeshArrays {
  pillars: Pillar[];
}

/** Surface height at a junction: highest ground under it, or the bridge deck over water. */
export function nodeSurfaceHeight(p: P2, radius: number, heightAt: HeightFn): number {
  let h = heightAt(p.x, p.z);
  const centreWater = isWater(h);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    h = Math.max(h, heightAt(p.x + Math.cos(a) * radius * 0.8, p.z + Math.sin(a) * radius * 0.8));
  }
  return centreWater ? Math.max(h, WATER_LEVEL + BRIDGE_DECK) : h;
}

/**
 * Longitudinal road profile: follows the highest ground across the road
 * width, lifts to a deck over water, limits ramps to RAMP_GRADE, smooths,
 * and is pinned to the junction heights at both ends so edges meet exactly.
 */
export function roadProfile(
  curve: QuadBezier,
  width: number,
  hA: number,
  hB: number,
  heightAt: HeightFn,
  step = 3,
): { points: P2[]; tangents: P2[]; cum: number[]; heights: number[]; ground: number[] } {
  const poly = sampleBezier(curve, step);
  const n = poly.points.length - 1;
  const tangents: P2[] = [];
  const heights: number[] = [];
  const ground: number[] = [];
  const half = (width / 2) * 0.9;
  for (let i = 0; i <= n; i++) {
    const p = poly.points[i];
    const t = bezierTangent(curve, i / Math.max(1, n));
    tangents.push(t);
    const hc = heightAt(p.x, p.z);
    const hl = heightAt(p.x - t.z * half, p.z + t.x * half);
    const hr = heightAt(p.x + t.z * half, p.z - t.x * half);
    let h = Math.max(hc, hl, hr);
    ground.push(hc);
    if (isWater(hc)) h = Math.max(h, WATER_LEVEL + BRIDGE_DECK);
    heights.push(h);
  }
  // Ramp limiting (forward + backward) — embankments up to bridges and over dips.
  for (let i = 1; i <= n; i++) {
    const ds = poly.cum[i] - poly.cum[i - 1];
    heights[i] = Math.max(heights[i], heights[i - 1] - RAMP_GRADE * ds);
  }
  for (let i = n - 1; i >= 0; i--) {
    const ds = poly.cum[i + 1] - poly.cum[i];
    heights[i] = Math.max(heights[i], heights[i + 1] - RAMP_GRADE * ds);
  }
  // Light smoothing, never sinking below the ground.
  const floor = heights.slice();
  for (let pass = 0; pass < 2; pass++) {
    const prev = heights.slice();
    for (let i = 1; i < n; i++) heights[i] = Math.max(floor[i] - 0.05, (prev[i - 1] + 2 * prev[i] + prev[i + 1]) / 4);
  }
  // Pin both ends to the shared junction heights.
  const oA = hA - heights[0];
  const oB = hB - heights[n];
  const len = poly.length || 1;
  for (let i = 0; i <= n; i++) {
    const f = poly.cum[i] / len;
    heights[i] += oA * (1 - f) + oB * f;
  }
  return { points: poly.points, tangents, cum: poly.cum, heights, ground };
}

/** Kerb height of raised sidewalks (m). */
export const CURB_HEIGHT = 0.16;
/** Vertices per cross-section row of an edge ribbon. */
export const EDGE_ROW = 14;

/** A point on a road end: position, surface height, unit tangent pointing away from the junction into the road. */
export interface EndFrame {
  x: number;
  z: number;
  y: number;
  tx: number;
  tz: number;
}

export interface EdgeMeshOptions {
  /** Sidewalk width per side (m); raised by CURB_HEIGHT with a kerb face. */
  sidewalk?: number;
  /** Metres cut off the ribbon at node a / b (the junction surface fills that part). */
  trimA?: number;
  trimB?: number;
  /** Close the ribbon end with a wall (dead ends). */
  wallA?: boolean;
  wallB?: boolean;
  /**
   * Mitre direction at an untrimmed end where the road continues into another
   * road of the same type at a slight bend (unit vector, along a → b). The end
   * row is turned to it and widened so both ribbons share the same edge line.
   */
  joinA?: P2;
  joinB?: P2;
}

interface Row {
  p: P2;
  t: P2;
  h: number;
  g: number;
  v: number;
}

/** Profile rows between arc lengths `from` and `to`, with interpolated boundary rows. */
function trimRows(prof: ReturnType<typeof roadProfile>, from: number, to: number): Row[] {
  const n = prof.points.length - 1;
  const at = (d: number): Row => {
    let i = 0;
    while (i < n - 1 && prof.cum[i + 1] < d) i++;
    const seg = prof.cum[i + 1] - prof.cum[i] || 1;
    const f = Math.max(0, Math.min(1, (d - prof.cum[i]) / seg));
    const a = prof.points[i];
    const b = prof.points[i + 1];
    const ta = prof.tangents[i];
    const tb = prof.tangents[i + 1];
    const tx = ta.x + (tb.x - ta.x) * f;
    const tz = ta.z + (tb.z - ta.z) * f;
    const tl = Math.hypot(tx, tz) || 1;
    return {
      p: { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f },
      t: { x: tx / tl, z: tz / tl },
      h: prof.heights[i] + (prof.heights[i + 1] - prof.heights[i]) * f,
      g: prof.ground[i] + (prof.ground[i + 1] - prof.ground[i]) * f,
      v: d,
    };
  };
  const rows: Row[] = [at(from)];
  for (let i = 0; i <= n; i++) {
    const d = prof.cum[i];
    if (d > from + 0.05 && d < to - 0.05) rows.push({ p: prof.points[i], t: prof.tangents[i], h: prof.heights[i], g: prof.ground[i], v: d });
  }
  rows.push(at(to));
  return rows;
}

/**
 * Road ribbon: carriageway, raised sidewalks with kerb faces, and side skirts
 * (embankment walls, or deck sides on bridges). The ribbon may be trimmed at
 * either end where a junction surface takes over. UV: u = 0..1 across the
 * width (the material draws sidewalks, kerbs and lane markings from it),
 * v = metres along the road.
 */
export function buildEdgeMesh(
  curve: QuadBezier,
  width: number,
  hA: number,
  hB: number,
  heightAt: HeightFn,
  lift = ROAD_LIFT,
  opts: EdgeMeshOptions = {},
): EdgeMeshData {
  const prof = roadProfile(curve, width, hA, hB, heightAt);
  const len = prof.cum[prof.cum.length - 1];
  let trimA = Math.max(0, opts.trimA ?? 0);
  let trimB = Math.max(0, opts.trimB ?? 0);
  if (trimA + trimB > len - 0.5) {
    const k = Math.max(0, len - 0.5) / (trimA + trimB || 1);
    trimA *= k;
    trimB *= k;
  }
  const rows = trimRows(prof, trimA, len - trimB);
  // Mitred ends: turn the end row to the shared direction and widen it by 1 / cos(half the bend).
  const widen = rows.map(() => 1);
  const mitre = (idx: number, m: P2 | undefined) => {
    if (!m) return;
    const r = rows[idx];
    const c = r.t.x * m.x + r.t.z * m.z;
    if (c < 0.5) return;
    rows[idx] = { ...r, t: { x: m.x, z: m.z } };
    widen[idx] = 1 / c;
  };
  if (trimA === 0) mitre(0, opts.joinA);
  if (trimB === 0) mitre(rows.length - 1, opts.joinB);
  const out: EdgeMeshData = { positions: [], normals: [], uvs: [], indices: [], pillars: [] };
  const baseHalf = width / 2;
  const baseSw = Math.min(opts.sidewalk ?? 0, baseHalf * 0.45);
  const curb = baseSw > 0 ? CURB_HEIGHT : 0;
  const us = baseSw / width;
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    const { p, t } = r;
    const half = baseHalf * widen[ri];
    const sw = baseSw * widen[ri];
    const nx = -t.z;
    const nz = t.x;
    const y = r.h + lift;
    const ys = y + curb;
    const lx = p.x + nx * half;
    const lz = p.z + nz * half;
    const rx = p.x - nx * half;
    const rz = p.z - nz * half;
    const ilx = p.x + nx * (half - sw);
    const ilz = p.z + nz * (half - sw);
    const irx = p.x - nx * (half - sw);
    const irz = p.z - nz * (half - sw);
    const bridge = r.h - r.g > 2.5;
    const bl = bridge ? y - DECK_THICKNESS : Math.min(y, heightAt(lx, lz)) - SKIRT_BELOW;
    const br = bridge ? y - DECK_THICKNESS : Math.min(y, heightAt(rx, rz)) - SKIRT_BELOW;
    const v = r.v;
    // skirtL bottom/top, sidewalkL outer/inner, kerbL top/bottom, road L/R, kerbR bottom/top, sidewalkR inner/outer, skirtR top/bottom
    out.positions.push(
      lx, bl, lz, lx, ys, lz,
      lx, ys, lz, ilx, ys, ilz,
      ilx, ys, ilz, ilx, y, ilz,
      ilx, y, ilz, irx, y, irz,
      irx, y, irz, irx, ys, irz,
      irx, ys, irz, rx, ys, rz,
      rx, ys, rz, rx, br, rz,
    );
    out.normals.push(
      nx, 0, nz, nx, 0, nz,
      0, 1, 0, 0, 1, 0,
      -nx, 0, -nz, -nx, 0, -nz,
      0, 1, 0, 0, 1, 0,
      nx, 0, nz, nx, 0, nz,
      0, 1, 0, 0, 1, 0,
      -nx, 0, -nz, -nx, 0, -nz,
    );
    out.uvs.push(0, v, 0, v, 0, v, us, v, us, v, us, v, us, v, 1 - us, v, 1 - us, v, 1 - us, v, 1 - us, v, 1, v, 1, v, 1, v);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * EDGE_ROW;
    const b = (i + 1) * EDGE_ROW;
    for (let k = 0; k < EDGE_ROW; k += 2) out.indices.push(a + k, b + k, a + k + 1, a + k + 1, b + k, b + k + 1);
  }
  // Dead ends: close the cross-section with a wall down to the skirt.
  const wall = (rowIndex: number) => {
    const base = rowIndex * EDGE_ROW;
    const P = out.positions;
    const outline = [2, 3, 5, 7, 10, 11];
    const bottom = Math.min(P[base * 3 + 1], P[(base + 13) * 3 + 1]);
    const r = rows[rowIndex];
    const dir = rowIndex === 0 ? -1 : 1;
    for (let k = 0; k < outline.length - 1; k++) {
      const v0 = out.positions.length / 3;
      for (const idx of [outline[k], outline[k + 1]]) {
        const o = (base + idx) * 3;
        const u = out.uvs[(base + idx) * 2];
        out.positions.push(P[o], P[o + 1], P[o + 2], P[o], bottom, P[o + 2]);
        out.normals.push(r.t.x * dir, 0, r.t.z * dir, r.t.x * dir, 0, r.t.z * dir);
        out.uvs.push(u, r.v, u, r.v);
      }
      out.indices.push(v0, v0 + 1, v0 + 2, v0 + 2, v0 + 1, v0 + 3);
    }
  };
  if (opts.wallA) wall(0);
  if (opts.wallB) wall(rows.length - 1);
  // Bridge pillars at regular spacing where the deck is high above the ground.
  let nextPillar = PILLAR_SPACING / 2;
  for (let i = 0; i <= prof.points.length - 1; i++) {
    if (prof.cum[i] < nextPillar) continue;
    const drop = prof.heights[i] - prof.ground[i];
    if (drop > 3) {
      out.pillars.push({ x: prof.points[i].x, z: prof.points[i].z, top: prof.heights[i] + lift - DECK_THICKNESS, bottom: prof.ground[i] - 2 });
      nextPillar = prof.cum[i] + PILLAR_SPACING;
    }
  }
  return out;
}

/** One road arriving at a junction. */
export interface JunctionEnd {
  frame: EndFrame;
  width: number;
  sidewalk: number;
}

/** Where line p + s·d meets line q + t·e (s, t ≥ 0 and not too far), else null. */
function meet(p: P2, d: P2, q: P2, e: P2, maxDist: number): P2 | null {
  const den = d.x * e.z - d.z * e.x;
  if (Math.abs(den) < 1e-4) return null;
  const s = ((q.x - p.x) * e.z - (q.z - p.z) * e.x) / den;
  const t = ((q.x - p.x) * d.z - (q.z - p.z) * d.x) / den;
  if (s < -0.01 || t < -0.01 || s > maxDist || t > maxDist) return null;
  return { x: p.x + d.x * s, z: p.z + d.z * s };
}

/** Quadratic curve from a to b bending toward `c` (straight if c is null). */
function corner(a: P2, b: P2, c: P2 | null, n: number): P2[] {
  const ctrl = c ?? { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  const pts: P2[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * ctrl.x + t * t * b.x, z: u * u * a.z + 2 * u * t * ctrl.z + t * t * b.z });
  }
  return pts;
}

const CORNER_STEPS = 8;

/**
 * Junction surface where trimmed roads meet: an asphalt polygon bounded by
 * the road ends and curved kerb corners between neighbouring roads, with
 * raised sidewalk corners that continue each road's sidewalks. No round caps:
 * the shape follows the roads that meet there.
 * UV.y marks the part for the junction material: 0 asphalt, −1 sidewalk, −2 kerb/skirt,
 * −3 zebra crossing (UV.x = metres across the carriageway).
 */
export function buildJunctionMesh(centre: P2, centreY: number, ends: JunctionEnd[], heightAt: HeightFn): MeshArrays {
  const out: MeshArrays = { positions: [], normals: [], uvs: [], indices: [] };
  if (ends.length < 2) return out;
  const sorted = ends.slice().sort((a, b) => Math.atan2(a.frame.tz, a.frame.tx) - Math.atan2(b.frame.tz, b.frame.tx));
  // Side points of each end: +n side ("left") faces the next road counter-clockwise.
  const sides = sorted.map((e) => {
    const f = e.frame;
    const nx = -f.tz;
    const nz = f.tx;
    const h = e.width / 2;
    const sw = Math.min(e.sidewalk, h * 0.45);
    return {
      e,
      t: { x: f.tx, z: f.tz },
      lo: { x: f.x + nx * h, z: f.z + nz * h },
      li: { x: f.x + nx * (h - sw), z: f.z + nz * (h - sw) },
      ri: { x: f.x - nx * (h - sw), z: f.z - nz * (h - sw) },
      ro: { x: f.x - nx * h, z: f.z - nz * h },
      curb: sw > 0 ? CURB_HEIGHT : 0,
    };
  });
  const boundary: { p: P2; y: number }[] = [];
  for (let i = 0; i < sides.length; i++) {
    const a = sides[i];
    const b = sides[(i + 1) % sides.length];
    const ya = a.e.frame.y;
    const yb = b.e.frame.y;
    // Corners run backward along each road (−t) until the kerb lines meet.
    const back = (v: P2) => ({ x: -v.x, z: -v.z });
    const maxD = Math.max(a.e.width, b.e.width) * 2.5;
    const inner = corner(a.li, b.ri, meet(a.li, back(a.t), b.ri, back(b.t), maxD), CORNER_STEPS);
    const outer = corner(a.lo, b.ro, meet(a.lo, back(a.t), b.ro, back(b.t), maxD), CORNER_STEPS);
    boundary.push({ p: a.ri, y: ya }, { p: a.li, y: ya });
    for (let k = 1; k < CORNER_STEPS; k++) boundary.push({ p: inner[k], y: ya + ((yb - ya) * k) / CORNER_STEPS });
    // Sidewalk corner (raised), kerb face and outer skirt.
    const curb = Math.max(a.curb, b.curb);
    if (curb > 0 || a.e.sidewalk > 0 || b.e.sidewalk > 0) {
      const base = out.positions.length / 3;
      for (let k = 0; k <= CORNER_STEPS; k++) {
        const y = ya + ((yb - ya) * k) / CORNER_STEPS;
        const o = outer[k];
        const n = inner[k];
        const g = Math.min(y, heightAt(o.x, o.z)) - SKIRT_BELOW;
        // sidewalk outer/inner (top), kerb top/bottom, skirt top/bottom
        out.positions.push(o.x, y + curb, o.z, n.x, y + curb, n.z, n.x, y + curb, n.z, n.x, y, n.z, o.x, y + curb, o.z, o.x, g, o.z);
        const dx = o.x - n.x;
        const dz = o.z - n.z;
        const dl = Math.hypot(dx, dz) || 1;
        out.normals.push(0, 1, 0, 0, 1, 0, -dx / dl, 0, -dz / dl, -dx / dl, 0, -dz / dl, dx / dl, 0, dz / dl, dx / dl, 0, dz / dl);
        out.uvs.push(0, -1, 0, -1, 0, -2, 0, -2, 0, -2, 0, -2);
      }
      for (let k = 0; k < CORNER_STEPS; k++) {
        const r0 = base + k * 6;
        const r1 = r0 + 6;
        for (const s of [0, 2, 4]) out.indices.push(r0 + s, r1 + s, r0 + s + 1, r0 + s + 1, r1 + s, r1 + s + 1);
      }
    }
  }
  // Zebra crossings across each urban road where it enters the junction.
  for (const sd of sides) {
    if (sd.e.sidewalk <= 0) continue;
    const t = sd.t;
    const y = Math.max(sd.e.frame.y, centreY) + 0.015;
    const span = Math.hypot(sd.li.x - sd.ri.x, sd.li.z - sd.ri.z);
    const near = 0.5;
    const far = 3.3;
    const base = out.positions.length / 3;
    for (const [p, u] of [[sd.ri, 0], [sd.li, span]] as const) {
      out.positions.push(p.x - t.x * near, y, p.z - t.z * near, p.x - t.x * far, y, p.z - t.z * far);
      out.normals.push(0, 1, 0, 0, 1, 0);
      out.uvs.push(u, -3, u, -3);
    }
    out.indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  // Asphalt fan from the centre.
  const c = out.positions.length / 3;
  out.positions.push(centre.x, centreY, centre.z);
  out.normals.push(0, 1, 0);
  out.uvs.push(0.5, 0);
  const first = out.positions.length / 3;
  for (const b of boundary) {
    out.positions.push(b.p.x, b.y, b.p.z);
    out.normals.push(0, 1, 0);
    out.uvs.push(0.5, 0);
  }
  const m = boundary.length;
  for (let k = 0; k < m; k++) out.indices.push(c, first + k, first + ((k + 1) % m));
  return out;
}
