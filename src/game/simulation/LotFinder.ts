import { GRID_CELLS } from '../core/config';
import { zonedTemplates, type BuildingDef, type DistrictRules } from '../data/buildings';
import type { ZoneKind } from '../data/zones';
import { footprintSize, type FreeSpot, type Rotation } from '../entities/building/BuildingPlacement';

export interface LotWorld {
  zoneAt(i: number, j: number): number;
  hasRoad(i: number, j: number): boolean;
  buildingAt(i: number, j: number): number;
  /** Dry, not too steep, owned. */
  isBuildable(i: number, j: number): boolean;
  vertexHeight(i: number, j: number): number;
  /** District rules (wealth, height limit) at a cell; absent = none. */
  rulesAt?(i: number, j: number): DistrictRules;
}

export interface Lot {
  def: BuildingDef;
  i: number;
  j: number;
  rot: Rotation;
  w: number;
  d: number;
  baseY: number;
  minY: number;
  /** Found along an angled road: built turned to it at this spot (i, j, rot, w, d are its nominal lot). */
  free?: FreeSpot;
}

export const MAX_LOT_SLOPE = 3;

/** Directions to a neighbouring road cell, as the rotation that faces it. */
export function roadFacings(i: number, j: number, world: LotWorld): Rotation[] {
  const out: Rotation[] = [];
  if (world.hasRoad(i, j + 1)) out.push(0);
  if (world.hasRoad(i + 1, j)) out.push(1);
  if (world.hasRoad(i, j - 1)) out.push(2);
  if (world.hasRoad(i - 1, j)) out.push(3);
  return out;
}

/**
 * Anchor (min corner) of a lot whose front row contains (ci, cj) at lateral
 * offset k, for a template of local size lw × ld facing `rot`.
 */
export function lotAnchor(ci: number, cj: number, _lw: number, ld: number, rot: Rotation, k: number): { i: number; j: number } {
  switch (rot) {
    case 0:
      return { i: ci - k, j: cj - ld + 1 };
    case 2:
      return { i: ci - k, j: cj };
    case 1:
      return { i: ci - ld + 1, j: cj - k };
    default:
      return { i: ci, j: cj - k };
  }
}

/** Checks a w×d area for a growable of `zone`; returns base/min heights or null. */
export function checkArea(i: number, j: number, w: number, d: number, zone: number, world: LotWorld): { baseY: number; minY: number } | null {
  if (i < 0 || j < 0 || i + w > GRID_CELLS || j + d > GRID_CELLS) return null;
  for (let dj = 0; dj < d; dj++) {
    for (let di = 0; di < w; di++) {
      const x = i + di;
      const y = j + dj;
      if (world.zoneAt(x, y) !== zone || world.hasRoad(x, y) || world.buildingAt(x, y) !== 0 || !world.isBuildable(x, y)) return null;
    }
  }
  let baseY = -Infinity;
  let minY = Infinity;
  for (let dj = 0; dj <= d; dj++) {
    for (let di = 0; di <= w; di++) {
      const h = world.vertexHeight(i + di, j + dj);
      baseY = Math.max(baseY, h);
      minY = Math.min(minY, h);
    }
  }
  return baseY - minY <= MAX_LOT_SLOPE ? { baseY, minY } : null;
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Finds a lot for a new level-`level` building containing the seed cell,
 * fronting a road. Larger templates are tried first, so streets fill with a
 * natural mix; returns null when nothing fits.
 */
export function findLot(ci: number, cj: number, zone: ZoneKind, level: number, rand: () => number, world: LotWorld): Lot | null {
  if (world.zoneAt(ci, cj) !== zone) return null;
  const facings = roadFacings(ci, cj, world);
  if (facings.length === 0) return null;
  const templates = shuffled(zonedTemplates(zone, level, undefined, world.rulesAt?.(ci, cj)), rand).sort((a, b) => {
    // Mostly prefer bigger lots, with some randomness for variety.
    const area = (d: BuildingDef) => d.footprint[0] * d.footprint[1];
    return area(b) - area(a) + (rand() - 0.5) * 2.5;
  });
  for (const rot of shuffled(facings, rand)) {
    for (const def of templates) {
      const [lw, ld] = def.footprint;
      const [w, d] = footprintSize(def, rot);
      for (let k = 0; k < lw; k++) {
        const { i, j } = lotAnchor(ci, cj, lw, ld, rot, k);
        const area = checkArea(i, j, w, d, zone, world);
        if (area) return { def, i, j, rot, w, d, ...area };
      }
    }
  }
  return null;
}
