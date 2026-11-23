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

  setRoad(edgeId: number, points: P2[], width: number): void {
    this.clearRoad(edgeId);
    // Half a cell of slack: a cell counts as road when the road covers its centre area.
    const cells = rasterizePolyline(points, width / 2 + 0.5);
    for (const c of cells) this.road[c]++;
    this.roadCells.set(edgeId, cells);
  }

  clearRoad(edgeId: number): void {
    const cells = this.roadCells.get(edgeId);
    if (!cells) return;
    for (const c of cells) this.road[c] = Math.max(0, this.road[c] - 1);
    this.roadCells.delete(edgeId);
  }

  setBuilding(id: number, cells: number[]): void {
    for (const c of cells) this.building[c] = id;
  }

  clearBuilding(id: number, cells: number[]): void {
    for (const c of cells) if (this.building[c] === id) this.building[c] = 0;
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
