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

/**
 * Road ribbon with side skirts (curbs/embankment walls, or deck sides on
 * bridges). UV: u = 0..1 across the width, v = metres along the road.
 */
export function buildEdgeMesh(curve: QuadBezier, width: number, hA: number, hB: number, heightAt: HeightFn, lift = ROAD_LIFT): EdgeMeshData {
  const prof = roadProfile(curve, width, hA, hB, heightAt);
  const n = prof.points.length - 1;
  const out: EdgeMeshData = { positions: [], normals: [], uvs: [], indices: [], pillars: [] };
  const half = width / 2;
  for (let i = 0; i <= n; i++) {
    const p = prof.points[i];
    const t = prof.tangents[i];
    const nx = -t.z;
    const nz = t.x;
    const y = prof.heights[i] + lift;
    const lx = p.x + nx * half;
    const lz = p.z + nz * half;
    const rx = p.x - nx * half;
    const rz = p.z - nz * half;
    const bridge = prof.heights[i] - prof.ground[i] > 2.5;
    const bl = bridge ? y - DECK_THICKNESS : Math.min(y, heightAt(lx, lz)) - SKIRT_BELOW;
    const br = bridge ? y - DECK_THICKNESS : Math.min(y, heightAt(rx, rz)) - SKIRT_BELOW;
    const v = prof.cum[i];
    // 6 vertices: skirtL bottom/top, surface L/R, skirtR top/bottom
    out.positions.push(lx, bl, lz, lx, y, lz, lx, y, lz, rx, y, rz, rx, y, rz, rx, br, rz);
    out.normals.push(nx, 0, nz, nx, 0, nz, 0, 1, 0, 0, 1, 0, -nx, 0, -nz, -nx, 0, -nz);
    out.uvs.push(0, v, 0, v, 0, v, 1, v, 1, v, 1, v);
  }
  for (let i = 0; i < n; i++) {
    const a = i * 6;
    const b = (i + 1) * 6;
    // left skirt, surface, right skirt (double-sided material, so winding is not critical)
    out.indices.push(a, b, a + 1, a + 1, b, b + 1);
    out.indices.push(a + 2, b + 2, a + 3, a + 3, b + 2, b + 3);
    out.indices.push(a + 4, b + 4, a + 5, a + 5, b + 4, b + 5);
  }
  // Bridge pillars at regular spacing where the deck is high above the ground.
  let nextPillar = PILLAR_SPACING / 2;
  for (let i = 0; i <= n; i++) {
    if (prof.cum[i] < nextPillar) continue;
    const drop = prof.heights[i] - prof.ground[i];
    if (drop > 3) {
      out.pillars.push({ x: prof.points[i].x, z: prof.points[i].z, top: prof.heights[i] + lift - DECK_THICKNESS, bottom: prof.ground[i] - 2 });
      nextPillar = prof.cum[i] + PILLAR_SPACING;
    }
  }
  return out;
}

/** Round junction / road-end cap. */
export function buildNodeMesh(p: P2, radius: number, h: number, heightAt: HeightFn, lift = ROAD_LIFT + 0.03): MeshArrays {
  const seg = 28;
  const out: MeshArrays = { positions: [], normals: [], uvs: [], indices: [] };
  const y = h + lift;
  out.positions.push(p.x, y, p.z);
  out.normals.push(0, 1, 0);
  out.uvs.push(0.5, 0);
  for (let k = 0; k <= seg; k++) {
    const a = (k / seg) * Math.PI * 2;
    const x = p.x + Math.cos(a) * radius;
    const z = p.z + Math.sin(a) * radius;
    const bottom = Math.min(y, heightAt(x, z)) - SKIRT_BELOW;
    // rim top (surface), rim top (skirt), rim bottom (skirt)
    out.positions.push(x, y, z, x, y, z, x, bottom, z);
    out.normals.push(0, 1, 0, Math.cos(a), 0, Math.sin(a), Math.cos(a), 0, Math.sin(a));
    out.uvs.push(0.5, 0, 0.5, 0, 0.5, 0);
  }
  for (let k = 0; k < seg; k++) {
    const r0 = 1 + k * 3;
    const r1 = 1 + (k + 1) * 3;
    out.indices.push(0, r1, r0);
    out.indices.push(r0 + 1, r1 + 1, r0 + 2, r0 + 2, r1 + 1, r1 + 2);
  }
  return out;
}
