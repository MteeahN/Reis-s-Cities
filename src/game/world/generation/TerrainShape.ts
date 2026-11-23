import { WORLD_SIZE } from '../../core/config';
import { clamp, lerp, smoothstep } from '../../../utils/math';
import { SimplexNoise } from './noise';
import { mulberry32 } from './rng';

/**
 * Continuous, deterministic height function for the whole landscape
 * (playable map AND the scenery beyond it). Pure — safe to run in a worker.
 *
 * Layout: gentle plains in the centre (start area), rolling hills toward the
 * map edges, a meandering river crossing west→east, one lake, and mountains
 * rising outside the playable square.
 */
export class TerrainShape {
  readonly seed: number;
  private readonly n1: SimplexNoise;
  private readonly n2: SimplexNoise;
  private readonly riverOffset: number;
  private readonly riverPhase1: number;
  private readonly riverPhase2: number;
  readonly lakeX: number;
  readonly lakeZ: number;
  readonly lakeRadius: number;

  static readonly RIVER_HALF_WIDTH = 16;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.n1 = new SimplexNoise(this.seed);
    this.n2 = new SimplexNoise((this.seed ^ 0x9e3779b9) >>> 0);
    const rand = mulberry32(this.seed ^ 0x51ed270b);
    const side = rand() < 0.5 ? -1 : 1;
    this.riverOffset = side * (260 + rand() * 90);
    this.riverPhase1 = rand() * Math.PI * 2;
    this.riverPhase2 = rand() * Math.PI * 2;

    const half = WORLD_SIZE / 2;
    this.lakeX = half + (rand() < 0.5 ? -1 : 1) * (330 + rand() * 170);
    const rz = this.riverZ(this.lakeX);
    // Place the lake on the opposite side of the river from its offset so it never overlaps.
    this.lakeZ = clamp(rz - side * (380 + rand() * 120), 280, WORLD_SIZE - 280);
    this.lakeRadius = 90 + rand() * 40;
  }

  /** River centreline (z as a function of x). */
  riverZ(x: number): number {
    return (
      WORLD_SIZE / 2 +
      this.riverOffset +
      175 * Math.sin(x * 0.0023 + this.riverPhase1) +
      60 * Math.sin(x * 0.0071 + this.riverPhase2)
    );
  }

  private riverSlope(x: number): number {
    return 175 * 0.0023 * Math.cos(x * 0.0023 + this.riverPhase1) + 60 * 0.0071 * Math.cos(x * 0.0071 + this.riverPhase2);
  }

  /** Approximate perpendicular distance (m) to the river centreline. */
  riverDistance(x: number, z: number): number {
    const s = this.riverSlope(x);
    return Math.abs(z - this.riverZ(x)) / Math.sqrt(1 + s * s);
  }

  /** Forest density in [0, 1] — shared by vegetation scattering and terrain tint. */
  forestDensity(x: number, z: number): number {
    const f = this.n2.fbm(x * 0.0034 + 50, z * 0.0034 - 30, 4);
    return smoothstep(0.02, 0.42, f);
  }

  /** Moisture-like noise used for grass colour variation. */
  moisture(x: number, z: number): number {
    return this.n1.fbm(x * 0.0021 - 300, z * 0.0021 + 170, 3);
  }

  height(x: number, z: number): number {
    const n1 = this.n1;
    const n2 = this.n2;
    const half = WORLD_SIZE / 2;
    const edge = Math.max(Math.abs(x - half), Math.abs(z - half)) / half; // 0 centre, 1 map edge

    const macro = n1.fbm(x * 0.0011, z * 0.0011, 4);
    const detail = n1.fbm(x * 0.008 + 100, z * 0.008, 3);
    const hillMask = clamp(0.22 + smoothstep(0.45, 1.1, edge) * 0.95 + Math.max(0, macro) * 0.7, 0, 1.7);
    const hills = n2.ridged(x * 0.0028, z * 0.0028, 5);

    let h = 10 + macro * 7 + hills * hills * 72 * hillMask + detail * 1.4;

    // Mountains beyond the playable square.
    const outside = Math.max(0, edge - 1) * half;
    if (outside > 0) {
      const m = n2.ridged(x * 0.00085 + 7, z * 0.00085 - 3, 5);
      h += smoothstep(0, 3200, outside) * (m * 560 + 70);
    }

    // Gentle, buildable plains around the city centre.
    const centre = 1 - smoothstep(0.14, 0.5, edge);
    h = lerp(h, 10 + macro * 4 + detail * 0.8, centre * 0.78);

    // Lake basin.
    const ldx = x - this.lakeX;
    const ldz = z - this.lakeZ;
    const ld = Math.sqrt(ldx * ldx + ldz * ldz);
    if (ld < this.lakeRadius * 3) {
      const a = Math.atan2(ldz, ldx);
      const r = this.lakeRadius * (1 + 0.28 * n1.noise2(Math.cos(a) * 1.4 + 11, Math.sin(a) * 1.4 - 4));
      h = lerp(Math.min(h, 6.5 + detail), h, smoothstep(r, r * 2.6, ld));
      h = lerp(-5 + detail * 0.4, h, smoothstep(r * 0.55, r * 1.2, ld));
    }

    // River valley and channel.
    const d = this.riverDistance(x, z);
    if (d < 360) {
      h = lerp(Math.min(h, 5.5 + detail), h, smoothstep(30, 340, d));
      h = lerp(-4.5 + detail * 0.3, h, smoothstep(TerrainShape.RIVER_HALF_WIDTH, 62, d));
    }

    return h;
  }
}
