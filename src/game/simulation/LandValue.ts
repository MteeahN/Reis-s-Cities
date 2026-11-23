import { GRID_CELLS } from '../core/config';
import { getBuilding } from '../data/buildings';
import type { PlacedBuilding } from '../entities/building/BuildingRegistry';
import type { P2 } from '../entities/road/curve';
import { CELL_SIZE } from '../core/config';
import { ZoneType } from '../data/zones';

/** Traffic on one road segment, for noise and exhaust. */
export interface RoadLoad {
  points: P2[];
  /** veh/h, both directions. */
  flow: number;
  /** Worst volume/capacity ratio. */
  ratio: number;
}

/** Noise next to a road per vehicle per hour, and its cap. */
export const NOISE_PER_VEHICLE = 1 / 25;
export const TRAFFIC_NOISE_RADIUS = 3;
/** Exhaust next to a road per vehicle per hour (doubles in stop-and-go traffic). */
export const EXHAUST_PER_VEHICLE = 1 / 70;
export const EXHAUST_RADIUS = 2;

const N = GRID_CELLS;
export const POLLUTION_RADIUS = 7;

/** Distance-to-water bonus, computed once from terrain (cells within 6 of water). */
export function waterProximity(isWater: (i: number, j: number) => boolean): Uint8Array {
  const out = new Uint8Array(N * N);
  const R = 6;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (!isWater(i, j)) continue;
      for (let dj = -R; dj <= R; dj++) {
        for (let di = -R; di <= R; di++) {
          const x = i + di;
          const y = j + dj;
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const d = Math.sqrt(di * di + dj * dj);
          if (d > R) continue;
          const v = Math.round((1 - d / R) * 12);
          const k = y * N + x;
          if (v > out[k]) out[k] = v;
        }
      }
    }
  }
  return out;
}

function stamp(field: Float32Array, ci: number, cj: number, radius: number, amount: number): void {
  const r = Math.ceil(radius);
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const x = ci + di;
      const y = cj + dj;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const d = Math.sqrt(di * di + dj * dj);
      if (d > radius) continue;
      field[y * N + x] += amount * (1 - d / (radius + 1));
    }
  }
}

/** Like stamp, but keeps the maximum (overlapping samples along a road don't add up). */
function stampMax(field: Float32Array, ci: number, cj: number, radius: number, amount: number): void {
  const r = Math.ceil(radius);
  for (let dj = -r; dj <= r; dj++) {
    for (let di = -r; di <= r; di++) {
      const x = ci + di;
      const y = cj + dj;
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const d = Math.sqrt(di * di + dj * dj);
      if (d > radius) continue;
      const v = amount * (1 - d / (radius + 1));
      const k = y * N + x;
      if (v > field[k]) field[k] = v;
    }
  }
}

/**
 * Land value (0–100) and ground pollution (0–100) per cell. Land value rises
 * with road access, water views and nearby landmarks, and falls with
 * pollution from industry. Drives building levels and happiness.
 */
export class LandValueMap {
  readonly value = new Uint8Array(N * N);
  readonly pollution = new Uint8Array(N * N);
  /** Noise (0–100) from traffic, industry and busy shops. */
  readonly noise = new Uint8Array(N * N);
  private readonly tmpValue = new Float32Array(N * N);
  private readonly tmpPollution = new Float32Array(N * N);
  private readonly tmpNoise = new Float32Array(N * N);
  private readonly tmpRoadNoise = new Float32Array(N * N);
  private readonly tmpExhaust = new Float32Array(N * N);

  constructor(private readonly water: Uint8Array) {}

  /**
   * `extra` adds service bonuses / crime penalties per cell. Both per-cell
   * inputs may be given as arrays (fast path, used by the simulation) or functions.
   */
  recompute(
    buildings: Iterable<PlacedBuilding>,
    nearRoad: ((k: number) => boolean) | ArrayLike<number>,
    extra: ((k: number) => number) | ArrayLike<number> = () => 0,
    roads: Iterable<RoadLoad> = [],
  ): void {
    const v = this.tmpValue;
    const p = this.tmpPollution;
    const nz = this.tmpNoise;
    const rn = this.tmpRoadNoise;
    const ex = this.tmpExhaust;
    p.fill(0);
    v.fill(0);
    nz.fill(0);
    rn.fill(0);
    ex.fill(0);
    for (const r of roads) {
      if (r.flow < 1) continue;
      const noise = Math.min(70, r.flow * NOISE_PER_VEHICLE);
      const exhaust = Math.min(30, r.flow * EXHAUST_PER_VEHICLE * (1 + Math.min(1, Math.max(0, r.ratio - 0.7) * 2)));
      for (let i = 0; i < r.points.length; i += 3) {
        const ci = Math.floor(r.points[i].x / CELL_SIZE);
        const cj = Math.floor(r.points[i].z / CELL_SIZE);
        stampMax(rn, ci, cj, TRAFFIC_NOISE_RADIUS, noise);
        stampMax(ex, ci, cj, EXHAUST_RADIUS, exhaust);
      }
    }
    for (const b of buildings) {
      if (b.state !== 'active') continue;
      const def = getBuilding(b.defId);
      const ci = b.i + (b.w - 1) / 2;
      const cj = b.j + (b.d - 1) / 2;
      if (def.pollution > 0) {
        stamp(p, Math.round(ci), Math.round(cj), POLLUTION_RADIUS + (b.w + b.d) / 2, def.pollution * 1.3);
        stamp(nz, Math.round(ci), Math.round(cj), 4 + (b.w + b.d) / 2, def.pollution * 0.6);
      }
      if (b.zone === ZoneType.Commercial && b.occupants > 0) stamp(nz, Math.round(ci), Math.round(cj), 2, 6 + b.level * 3);
      // Untreated sewage pollutes the shore around the outlet.
      if (def.utility?.waterPollution) stamp(p, Math.round(ci), Math.round(cj), 10, def.utility.waterPollution * 1.3);
      if (def.landValueEffect) stamp(v, Math.round(ci), Math.round(cj), def.landValueEffect.radius + (b.w - 1) / 2, def.landValueEffect.amount * 1.5);
      // Higher-level neighbourhoods are worth more.
      if (b.zone && b.level > 1) stamp(v, Math.round(ci), Math.round(cj), 3, (b.level - 1) * 4);
    }
    const nearFn = typeof nearRoad === 'function' ? nearRoad : null;
    const nearArr = typeof nearRoad === 'function' ? null : nearRoad;
    const extraFn = typeof extra === 'function' ? extra : null;
    const extraArr = typeof extra === 'function' ? null : extra;
    const water = this.water;
    for (let k = 0; k < N * N; k++) {
      const pol = Math.min(100, p[k] + ex[k]);
      this.pollution[k] = pol;
      const noise = Math.min(100, nz[k] + rn[k]);
      this.noise[k] = Math.round(noise);
      const near = nearArr ? nearArr[k] > 0 : nearFn!(k);
      const bonus = extraArr ? extraArr[k] : extraFn!(k);
      const base = 15 + (near ? 10 : 0) + water[k] + v[k] - pol * 0.6 - noise * 0.2 + bonus;
      this.value[k] = Math.max(0, Math.min(100, Math.round(base)));
    }
  }

  valueAt(i: number, j: number): number {
    return i < 0 || j < 0 || i >= N || j >= N ? 0 : this.value[j * N + i];
  }

  pollutionAt(i: number, j: number): number {
    return i < 0 || j < 0 || i >= N || j >= N ? 0 : this.pollution[j * N + i];
  }

  /** Average over a building footprint. */
  averageOver(cells: number[], field: Uint8Array): number {
    let s = 0;
    for (const c of cells) s += field[c];
    return cells.length ? s / cells.length : 0;
  }
}
