import { OUTER_BASE_STEP, OUTER_EXTENT, OUTER_GROWTH, WORLD_SIZE } from '../core/config';

/**
 * Non-uniform axis coordinates for the scenery ring around the map:
 * fixed spacing across the map, geometrically growing spacing outside it.
 * Lets one modest mesh reach the horizon with detail where it matters.
 */
export function buildOuterAxis(): Float32Array {
  const inner: number[] = [];
  for (let x = 0; x <= WORLD_SIZE; x += OUTER_BASE_STEP) inner.push(x);
  const outer: number[] = [];
  let step = OUTER_BASE_STEP;
  let d = 0;
  while (d < OUTER_EXTENT) {
    d += step;
    outer.push(d);
    step *= OUTER_GROWTH;
  }
  const axis: number[] = [];
  for (let k = outer.length - 1; k >= 0; k--) axis.push(-outer[k]);
  axis.push(...inner);
  for (const o of outer) axis.push(WORLD_SIZE + o);
  return new Float32Array(axis);
}

/** Height grid on the outer axis (same axis for x and z). */
export class OuterGrid {
  readonly n: number;
  constructor(
    readonly axis: Float32Array,
    readonly heights: Float32Array,
  ) {
    this.n = axis.length;
  }

  private find(v: number): number {
    const a = this.axis;
    let lo = 0;
    let hi = a.length - 2;
    if (v <= a[0]) return 0;
    if (v >= a[hi + 1]) return hi;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (a[mid] <= v) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  sample(x: number, z: number): number {
    const i = this.find(x);
    const j = this.find(z);
    const a = this.axis;
    const tx = Math.min(1, Math.max(0, (x - a[i]) / (a[i + 1] - a[i])));
    const tz = Math.min(1, Math.max(0, (z - a[j]) / (a[j + 1] - a[j])));
    const n = this.n;
    const h = this.heights;
    const h00 = h[j * n + i];
    const h10 = h[j * n + i + 1];
    const h01 = h[(j + 1) * n + i];
    const h11 = h[(j + 1) * n + i + 1];
    return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
  }
}
