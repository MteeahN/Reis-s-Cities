import { CELL_SIZE, GRID_CELLS, WATER_LEVEL, WORLD_SIZE } from '../../core/config';
import { smoothstep } from '../../../utils/math';
import { Heightfield } from '../Heightfield';
import { OuterGrid, buildOuterAxis } from '../OuterGrid';
import { hash2 } from './rng';
import { TerrainShape } from './TerrainShape';

export const Species = { Pine: 0, Broadleaf: 1, Rock: 2 } as const;
export type Species = (typeof Species)[keyof typeof Species];

/** Instance record stride: x, y, z, scale, rotationY, tint. */
export const VEG_STRIDE = 6;

export interface VegetationSet {
  data: Float32Array;
  species: Uint8Array;
  count: number;
}

export interface GeneratedWorld {
  seed: number;
  heights: Float32Array;
  outerAxis: Float32Array;
  outerHeights: Float32Array;
  vegetation: VegetationSet;
  outerVegetation: VegetationSet;
}

export type ProgressFn = (fraction: number, label: string) => void;

class VegBuilder {
  private data: number[] = [];
  private species: number[] = [];
  push(x: number, y: number, z: number, scale: number, rot: number, tint: number, sp: Species) {
    this.data.push(x, y, z, scale, rot, tint);
    this.species.push(sp);
  }
  build(): VegetationSet {
    return { data: new Float32Array(this.data), species: new Uint8Array(this.species), count: this.species.length };
  }
}

export function generateHeights(shape: TerrainShape): Float32Array {
  const verts = GRID_CELLS + 1;
  const heights = new Float32Array(verts * verts);
  for (let j = 0; j < verts; j++) {
    for (let i = 0; i < verts; i++) heights[j * verts + i] = shape.height(i * CELL_SIZE, j * CELL_SIZE);
  }
  return heights;
}

export function generateOuter(shape: TerrainShape): { axis: Float32Array; heights: Float32Array } {
  const axis = buildOuterAxis();
  const n = axis.length;
  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = shape.height(axis[i], axis[j]);
  return { axis, heights };
}

export function scatterVegetation(shape: TerrainShape, field: Heightfield, seed: number): VegetationSet {
  const out = new VegBuilder();
  const step = 7;
  const half = WORLD_SIZE / 2;
  const n = Math.floor(WORLD_SIZE / step);
  for (let gj = 0; gj < n; gj++) {
    for (let gi = 0; gi < n; gi++) {
      const r0 = hash2(gi, gj, seed);
      const x = (gi + 0.15 + 0.7 * hash2(gi, gj, seed + 1)) * step;
      const z = (gj + 0.15 + 0.7 * hash2(gi, gj, seed + 2)) * step;
      const h = field.sample(x, z);
      if (h < WATER_LEVEL + 1.3) continue;
      const ci = Math.min(GRID_CELLS - 1, Math.floor(x / CELL_SIZE));
      const cj = Math.min(GRID_CELLS - 1, Math.floor(z / CELL_SIZE));
      const slope = field.cellSlope(ci, cj);

      // Rocks on steeper ground.
      if (slope > 0.22 && r0 < 0.03 + slope * 0.05) {
        out.push(x, h - 0.4, z, 0.8 + hash2(gi, gj, seed + 3) * 2.4, r0 * 6.283, hash2(gi, gj, seed + 4), Species.Rock);
        continue;
      }
      if (slope > 0.75) continue;

      const edge = Math.max(Math.abs(x - half), Math.abs(z - half)) / half;
      let density = shape.forestDensity(x, z) * 0.62;
      const rd = shape.riverDistance(x, z);
      density += smoothstep(120, 45, rd) * 0.18; // riparian strip
      density *= 0.3 + 0.7 * smoothstep(0.1, 0.42, edge); // keep the centre open for building
      density = Math.max(density, 0.012); // lone trees in meadows
      if (r0 > density) continue;

      const pineChance = 0.15 + smoothstep(13, 38, h) * 0.65 - smoothstep(120, 40, rd) * 0.3;
      const sp = hash2(gi, gj, seed + 5) < pineChance ? Species.Pine : Species.Broadleaf;
      const scale = 0.75 + hash2(gi, gj, seed + 6) * 0.65;
      out.push(x, h - 0.15, z, scale, hash2(gi, gj, seed + 7) * 6.283, hash2(gi, gj, seed + 8), sp);
    }
  }
  return out.build();
}

export function scatterOuterVegetation(shape: TerrainShape, outer: OuterGrid, seed: number): VegetationSet {
  const out = new VegBuilder();
  const step = 20;
  const min = -2600;
  const max = WORLD_SIZE + 2600;
  const n = Math.floor((max - min) / step);
  for (let gj = 0; gj < n; gj++) {
    for (let gi = 0; gi < n; gi++) {
      const x = min + (gi + 0.1 + 0.8 * hash2(gi, gj, seed + 11)) * step;
      const z = min + (gj + 0.1 + 0.8 * hash2(gi, gj, seed + 12)) * step;
      if (x > -4 && x < WORLD_SIZE + 4 && z > -4 && z < WORLD_SIZE + 4) continue;
      const r0 = hash2(gi, gj, seed + 13);
      let density = shape.forestDensity(x, z) * 0.75 + 0.04;
      const h = outer.sample(x, z);
      if (h < WATER_LEVEL + 1.5 || h > 420) continue;
      density *= 1 - smoothstep(250, 420, h);
      if (r0 > density) continue;
      // Slope estimate from the outer grid itself.
      const s = Math.abs(outer.sample(x + 10, z) - outer.sample(x - 10, z)) / 20 + Math.abs(outer.sample(x, z + 10) - outer.sample(x, z - 10)) / 20;
      if (s > 0.9) continue;
      const pineChance = 0.3 + smoothstep(20, 160, h) * 0.6;
      const sp = hash2(gi, gj, seed + 14) < pineChance ? Species.Pine : Species.Broadleaf;
      out.push(x, h - 0.8, z, 0.9 + hash2(gi, gj, seed + 15) * 0.8, hash2(gi, gj, seed + 16) * 6.283, hash2(gi, gj, seed + 17), sp);
    }
  }
  return out.build();
}

/** Full deterministic world generation. Runs in the world-gen worker. */
export function generateWorld(seed: number, progress: ProgressFn = () => {}): GeneratedWorld {
  const shape = new TerrainShape(seed);
  progress(0.05, 'Arazi şekillendiriliyor');
  const heights = generateHeights(shape);
  const field = new Heightfield(heights);
  progress(0.35, 'Dağlar ve ufuk oluşturuluyor');
  const outerData = generateOuter(shape);
  const outer = new OuterGrid(outerData.axis, outerData.heights);
  progress(0.6, 'Ormanlar yerleştiriliyor');
  const vegetation = scatterVegetation(shape, field, seed);
  progress(0.8, 'Doğal çevre tamamlanıyor');
  const outerVegetation = scatterOuterVegetation(shape, outer, seed);
  progress(1, 'Dünya hazır');
  return { seed, heights, outerAxis: outerData.axis, outerHeights: outerData.heights, vegetation, outerVegetation };
}
