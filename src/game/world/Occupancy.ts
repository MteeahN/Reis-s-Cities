import { CELL_SIZE, GRID_CELLS } from '../core/config';
import type { P2 } from '../entities/road/curve';

function distToSegment(px: number, pz: number, a: P2, b: P2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - a.x) * dx + (pz - a.z) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + dx * t), pz - (a.z + dz * t));
}

/** Distance from segment AB to the axis-aligned square [x0, x1] × [z0, z1] (0 when they touch). */
export function segmentSquareDistance(a: P2, b: P2, x0: number, z0: number, x1: number, z1: number): number {
  // Liang–Barsky clip: does the segment cross the square?
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const clip = (p: number, q: number) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (clip(-dx, a.x - x0) && clip(dx, x1 - a.x) && clip(-dz, a.z - z0) && clip(dz, z1 - a.z)) return 0;
  const box = (p: P2) => Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.z, 0, p.z - z1));
  return Math.min(box(a), box(b), distToSegment(x0, z0, a, b), distToSegment(x1, z0, a, b), distToSegment(x0, z1, a, b), distToSegment(x1, z1, a, b));
}

/** Cells whose square comes closer than `halfWidth` to the polyline (strictly). */
export function rasterizePolylineSquares(points: P2[], halfWidth: number): number[] {
  if (points.length < 2 || halfWidth <= 0) return [];
  const cells: number[] = [];
  for (const c of rasterizePolyline(points, halfWidth + CELL_SIZE * Math.SQRT1_2)) {
    const i = c % GRID_CELLS;
    const j = Math.floor(c / GRID_CELLS);
    const x0 = i * CELL_SIZE;
    const z0 = j * CELL_SIZE;
    for (let k = 1; k < points.length; k++) {
      if (segmentSquareDistance(points[k - 1], points[k], x0, z0, x0 + CELL_SIZE, z0 + CELL_SIZE) < halfWidth) {
        cells.push(c);
        break;
      }
    }
  }
  return cells;
}

/** Cells whose centre lies within `halfWidth` of the polyline. */
export function rasterizePolyline(points: P2[], halfWidth: number): number[] {
  if (points.length === 0) return [];
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxZ = Math.max(maxZ, p.z);
  }
  const i0 = Math.max(0, Math.floor((minX - halfWidth) / CELL_SIZE));
  const i1 = Math.min(GRID_CELLS - 1, Math.floor((maxX + halfWidth) / CELL_SIZE));
  const j0 = Math.max(0, Math.floor((minZ - halfWidth) / CELL_SIZE));
  const j1 = Math.min(GRID_CELLS - 1, Math.floor((maxZ + halfWidth) / CELL_SIZE));
  const cells: number[] = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * CELL_SIZE;
      const cz = (j + 0.5) * CELL_SIZE;
      for (let k = 1; k < points.length; k++) {
        if (distToSegment(cx, cz, points[k - 1], points[k]) <= halfWidth) {
          cells.push(j * GRID_CELLS + i);
          break;
        }
      }
    }
  }
  return cells;
}

/**
 * What occupies each grid cell: road coverage (reference-counted, since
 * roads overlap at junctions) and building ids. Zoning (Phase 3) builds on it.
 */
export class Occupancy {
  readonly road = new Uint16Array(GRID_CELLS * GRID_CELLS);
  readonly building = new Int32Array(GRID_CELLS * GRID_CELLS);
  private readonly roadCells = new Map<number, number[]>();

  /**
   * A cell also counts as road when any part of its square reaches the road
   * surface (with 0.5 m tolerance), so buildings on curves and diagonals never
   * stand on the road or its sidewalk. Straight grid roads are unchanged.
   */
  setRoad(edgeId: number, points: P2[], width: number): void {
    this.clearRoad(edgeId);
    // Half a cell of slack: a cell counts as road when the road covers its centre area.
    const set = new Set(rasterizePolyline(points, width / 2 + 0.5));
    for (const c of rasterizePolylineSquares(points, width / 2 - 0.5)) set.add(c);
    const cells = [...set];
    for (const c of cells) this.road[c]++;
    this.roadCells.set(edgeId, cells);
  }

  clearRoad(edgeId: number): void {
    const cells = this.roadCells.get(edgeId);
    if (!cells) return;
    for (const c of cells) this.road[c] = Math.max(0, this.road[c] - 1);
    this.roadCells.delete(edgeId);
  }

  /**
   * Cells two or more buildings stand on (each over part of it): buildings
   * turned to an angled road share the cells where their lots meet. `building`
   * holds the latest of them; this keeps them all, so removing one leaves the
   * cell to the others.
   */
  private readonly shared = new Map<number, number[]>();

  setBuilding(id: number, cells: number[]): void {
    for (const c of cells) {
      const was = this.building[c];
      if (was !== 0 && was !== id) {
        const list = this.shared.get(c) ?? [was];
        if (!list.includes(id)) list.push(id);
        this.shared.set(c, list);
      }
      this.building[c] = id;
    }
  }

  clearBuilding(id: number, cells: number[]): void {
    for (const c of cells) {
      const list = this.shared.get(c);
      if (list) {
        const rest = list.filter((x) => x !== id);
        if (rest.length > 1) this.shared.set(c, rest);
        else this.shared.delete(c);
        if (rest.length === 0) this.building[c] = 0;
        else if (this.building[c] === id || !rest.includes(this.building[c])) this.building[c] = rest[rest.length - 1];
      } else if (this.building[c] === id) this.building[c] = 0;
    }
  }

  /** Every building standing on cell k (usually none or one). */
  ownersAt(k: number): number[] {
    return this.shared.get(k) ?? (this.building[k] !== 0 ? [this.building[k]] : []);
  }

  hasRoad(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < GRID_CELLS && j < GRID_CELLS && this.road[j * GRID_CELLS + i] > 0;
  }

  buildingAt(i: number, j: number): number {
    if (i < 0 || j < 0 || i >= GRID_CELLS || j >= GRID_CELLS) return 0;
    return this.building[j * GRID_CELLS + i];
  }

  roadCellCount(): number {
    let n = 0;
    for (const v of this.road) if (v > 0) n++;
    return n;
  }
}
