import { CELL_SIZE, GRID_CELLS } from '../../core/config';
import type { LineKind } from '../../data/infrastructure';
import { rasterizePolyline } from '../../world/Occupancy';
import type { P2 } from '../road/curve';

export interface UtilityLine {
  id: number;
  a: P2;
  b: P2;
  length: number;
  /** Construction cost (for demolition refunds). */
  cost: number;
  cells: number[];
}

export interface LineChange {
  added: UtilityLine[];
  removed: UtilityLine[];
}

/**
 * Straight utility segments (power lines or water pipes) and the grid cells
 * they occupy (reference-counted, since segments meet and cross).
 */
export class UtilityLines {
  readonly lines = new Map<number, UtilityLine>();
  readonly cells = new Uint16Array(GRID_CELLS * GRID_CELLS);
  private nextId = 1;
  private listeners = new Set<(c: LineChange) => void>();

  constructor(readonly kind: LineKind) {}

  add(a: P2, b: P2, cost: number, id?: number): UtilityLine {
    if (id !== undefined) this.nextId = Math.max(this.nextId, id + 1);
    const line: UtilityLine = {
      id: id ?? this.nextId++,
      a: { ...a },
      b: { ...b },
      length: Math.hypot(b.x - a.x, b.z - a.z),
      cost,
      // Every cell the segment crosses (centre within half a cell diagonal), so
      // diagonal lines stay 4-connected and form one network.
      cells: rasterizePolyline([a, b], CELL_SIZE * Math.SQRT1_2 + 0.1),
    };
    for (const c of line.cells) this.cells[c]++;
    this.lines.set(line.id, line);
    this.emit({ added: [line], removed: [] });
    return line;
  }

  get nextIdValue(): number {
    return this.nextId;
  }

  /** Restores a saved segment with its id (cells are re-derived). */
  restore(id: number, a: P2, b: P2, cost: number): UtilityLine {
    return this.add(a, b, cost, id);
  }

  setNextId(n: number): void {
    this.nextId = Math.max(this.nextId, n);
  }

  remove(id: number): UtilityLine | null {
    const line = this.lines.get(id);
    if (!line) return null;
    for (const c of line.cells) this.cells[c] = Math.max(0, this.cells[c] - 1);
    this.lines.delete(id);
    this.emit({ added: [], removed: [line] });
    return line;
  }

  has(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < GRID_CELLS && j < GRID_CELLS && this.cells[j * GRID_CELLS + i] > 0;
  }

  /** Closest segment whose centreline is within `radius` metres. */
  nearest(x: number, z: number, radius: number): UtilityLine | null {
    let best: UtilityLine | null = null;
    let bestD = radius;
    for (const l of this.lines.values()) {
      const dx = l.b.x - l.a.x;
      const dz = l.b.z - l.a.z;
      const t = Math.max(0, Math.min(1, ((x - l.a.x) * dx + (z - l.a.z) * dz) / (dx * dx + dz * dz || 1)));
      const d = Math.hypot(x - (l.a.x + dx * t), z - (l.a.z + dz * t));
      if (d <= bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  /** Nearest segment end point within `radius` (for chaining/snapping). */
  nearestEnd(x: number, z: number, radius: number): P2 | null {
    let best: P2 | null = null;
    let bestD = radius;
    for (const l of this.lines.values()) {
      for (const p of [l.a, l.b]) {
        const d = Math.hypot(p.x - x, p.z - z);
        if (d <= bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best;
  }

  totalLength(): number {
    let s = 0;
    for (const l of this.lines.values()) s += l.length;
    return s;
  }

  onChange(fn: (c: LineChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(c: LineChange): void {
    this.listeners.forEach((l) => l(c));
  }
}
