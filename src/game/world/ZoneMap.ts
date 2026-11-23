import { CELL_SIZE, GRID_CELLS } from '../core/config';
import { ZONE_COUNT, ZONE_DEPTH, ZoneType } from '../data/zones';
import type { P2 } from '../entities/road/curve';
import { IndexedSet } from '../../utils/IndexedSet';
import { rasterizePolyline } from './Occupancy';

/**
 * Per-cell zoning. Land within ZONE_DEPTH cells of a zoneable road is
 * "zoneable" (reference-counted per road edge). Also indexes empty zoned
 * cells per zone type so the growth system can pick lots in O(1).
 */
export class ZoneMap {
  readonly zone = new Uint8Array(GRID_CELLS * GRID_CELLS);
  readonly zoneable = new Uint16Array(GRID_CELLS * GRID_CELLS);
  /** Empty (no building, no road) zoned cells, per zone type (index 1..4). */
  readonly empty: IndexedSet[] = [new IndexedSet(), new IndexedSet(), new IndexedSet(), new IndexedSet(), new IndexedSet()];
  private readonly edgeCells = new Map<number, number[]>();
  private listeners = new Set<(cells: number[]) => void>();
  version = 0;

  onChange(fn: (cells: number[]) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(cells: number[]): void {
    this.version++;
    if (cells.length) this.listeners.forEach((l) => l(cells));
  }

  get(i: number, j: number): ZoneType {
    if (i < 0 || j < 0 || i >= GRID_CELLS || j >= GRID_CELLS) return ZoneType.None;
    return this.zone[j * GRID_CELLS + i] as ZoneType;
  }

  isZoneable(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= GRID_CELLS || j >= GRID_CELLS) return false;
    return this.zoneable[j * GRID_CELLS + i] > 0;
  }

  /** Marks land along a road edge as zoneable. */
  addEdge(edgeId: number, points: P2[], width: number): void {
    this.removeEdge(edgeId);
    const cells = rasterizePolyline(points, width / 2 + ZONE_DEPTH * CELL_SIZE);
    for (const c of cells) this.zoneable[c]++;
    this.edgeCells.set(edgeId, cells);
  }

  /** Removes an edge's zoneable area; returns cells that lost zoneability (their zone is cleared). */
  removeEdge(edgeId: number): number[] {
    const cells = this.edgeCells.get(edgeId);
    if (!cells) return [];
    this.edgeCells.delete(edgeId);
    const lost: number[] = [];
    for (const c of cells) {
      this.zoneable[c] = Math.max(0, this.zoneable[c] - 1);
      if (this.zoneable[c] === 0 && this.zone[c] !== ZoneType.None) lost.push(c);
    }
    return lost;
  }

  /**
   * Sets the zone of cells. `isFree(c)` says whether the cell is free of
   * buildings/roads (to keep the empty-lot index correct). Returns changed cells.
   */
  set(cells: Iterable<number>, type: ZoneType, isFree: (c: number) => boolean): number[] {
    const changed: number[] = [];
    for (const c of cells) {
      if (this.zone[c] === type) continue;
      const old = this.zone[c];
      if (old) this.empty[old].delete(c);
      this.zone[c] = type;
      if (type && isFree(c)) this.empty[type].add(c);
      changed.push(c);
    }
    this.emit(changed);
    return changed;
  }

  /** Re-index a cell after a building/road appeared or disappeared on it. */
  refresh(c: number, free: boolean): void {
    const z = this.zone[c];
    if (!z) return;
    if (free) this.empty[z].add(c);
    else this.empty[z].delete(c);
  }

  /** Notify listeners that the overlay should redraw these cells (e.g. building changes). */
  touch(cells: number[]): void {
    this.emit(cells);
  }

  countZoned(): Record<1 | 2 | 3 | 4, number> {
    const out = { 1: 0, 2: 0, 3: 0, 4: 0 } as Record<1 | 2 | 3 | 4, number>;
    for (const z of this.zone) if (z) out[z as 1 | 2 | 3 | 4]++;
    return out;
  }

  /** Restores run-length encoded zoning (see serialize). */
  restore(rle: readonly number[], isFree: (c: number) => boolean): void {
    const cells: number[][] = [[], [], [], [], []];
    let k = 0;
    for (let r = 0; r + 1 < rle.length && k < this.zone.length; r += 2) {
      const v = rle[r];
      const n = rle[r + 1];
      for (let c = 0; c < n && k < this.zone.length; c++, k++) if (v >= 1 && v <= ZONE_COUNT) cells[v].push(k);
    }
    for (let z = 1; z <= ZONE_COUNT; z++) if (cells[z].length) this.set(cells[z], z as ZoneType, isFree);
  }

  serialize(): number[] {
    // Run-length encoding [value, count, value, count...]
    const out: number[] = [];
    let prev = this.zone[0];
    let n = 0;
    for (const z of this.zone) {
      if (z === prev) n++;
      else {
        out.push(prev, n);
        prev = z;
        n = 1;
      }
    }
    out.push(prev, n);
    return out;
  }
}
