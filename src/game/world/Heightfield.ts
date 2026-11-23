import { CELL_SIZE, GRID_CELLS } from '../core/config';
import { clamp } from '../../utils/math';

/**
 * Vertex heights for the playable map: (GRID_CELLS+1)² samples on cell corners.
 * Index = j * verts + i  →  world (i*CELL_SIZE, j*CELL_SIZE).
 */
export class Heightfield {
  readonly verts = GRID_CELLS + 1;
  constructor(readonly heights: Float32Array) {
    if (heights.length !== this.verts * this.verts) {
      throw new Error(`Heightfield: expected ${this.verts * this.verts} samples, got ${heights.length}`);
    }
  }

  vertex(i: number, j: number): number {
    const v = this.verts - 1;
    return this.heights[clamp(j, 0, v) * this.verts + clamp(i, 0, v)];
  }

  /** Bilinear height at world position (clamped to the map). */
  sample(x: number, z: number): number {
    const fx = clamp(x / CELL_SIZE, 0, GRID_CELLS - 1e-4);
    const fz = clamp(z / CELL_SIZE, 0, GRID_CELLS - 1e-4);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const tx = fx - i;
    const tz = fz - j;
    const v = this.verts;
    const h = this.heights;
    const a = h[j * v + i];
    const b = h[j * v + i + 1];
    const c = h[(j + 1) * v + i];
    const d = h[(j + 1) * v + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  }

  /** Unit surface normal at a vertex via central differences (seamless across chunks). */
  normalAt(i: number, j: number, out: { x: number; y: number; z: number }): void {
    const dx = (this.vertex(i + 1, j) - this.vertex(i - 1, j)) / (2 * CELL_SIZE);
    const dz = (this.vertex(i, j + 1) - this.vertex(i, j - 1)) / (2 * CELL_SIZE);
    const len = Math.sqrt(dx * dx + 1 + dz * dz);
    out.x = -dx / len;
    out.y = 1 / len;
    out.z = -dz / len;
  }

  /** Max rise/run across a cell's four corners. */
  cellSlope(ci: number, cj: number): number {
    const a = this.vertex(ci, cj);
    const b = this.vertex(ci + 1, cj);
    const c = this.vertex(ci, cj + 1);
    const d = this.vertex(ci + 1, cj + 1);
    const max = Math.max(a, b, c, d);
    const min = Math.min(a, b, c, d);
    return (max - min) / CELL_SIZE;
  }

  cellMinHeight(ci: number, cj: number): number {
    return Math.min(this.vertex(ci, cj), this.vertex(ci + 1, cj), this.vertex(ci, cj + 1), this.vertex(ci + 1, cj + 1));
  }

  cellAverageHeight(ci: number, cj: number): number {
    return (this.vertex(ci, cj) + this.vertex(ci + 1, cj) + this.vertex(ci, cj + 1) + this.vertex(ci + 1, cj + 1)) / 4;
  }
}
