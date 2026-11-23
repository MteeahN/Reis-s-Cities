import { CELL_SIZE, CHUNK_CELLS, GRID_CELLS, MAX_BUILDABLE_SLOPE, WATER_LEVEL } from '../core/config';
import type { Heightfield } from './Heightfield';
import type { UnlockMap } from './UnlockMap';

export const TerrainType = { Grass: 0, Shore: 1, Rocky: 2, Water: 3 } as const;
export type TerrainType = (typeof TerrainType)[keyof typeof TerrainType];

export const TERRAIN_TYPE_LABEL: Record<TerrainType, string> = {
  0: 'Çayır',
  1: 'Kıyı',
  2: 'Engebeli arazi',
  3: 'Su',
};

export interface CellInfo {
  i: number;
  j: number;
  chunkX: number;
  chunkZ: number;
  worldX: number;
  worldZ: number;
  height: number;
  slope: number;
  type: TerrainType;
  buildable: boolean;
  unlocked: boolean;
  tileX: number;
  tileZ: number;
}

/**
 * Per-cell static terrain classification for the 256×256 grid. Later phases
 * add occupancy/zoning layers alongside these arrays.
 */
export class WorldGrid {
  readonly slope = new Float32Array(GRID_CELLS * GRID_CELLS);
  readonly type = new Uint8Array(GRID_CELLS * GRID_CELLS);
  readonly buildable = new Uint8Array(GRID_CELLS * GRID_CELLS);

  constructor(
    readonly field: Heightfield,
    readonly unlock: UnlockMap,
  ) {
    for (let j = 0; j < GRID_CELLS; j++) {
      for (let i = 0; i < GRID_CELLS; i++) {
        const k = j * GRID_CELLS + i;
        const s = field.cellSlope(i, j);
        const minH = field.cellMinHeight(i, j);
        this.slope[k] = s;
        let t: TerrainType = TerrainType.Grass;
        if (minH < WATER_LEVEL + 0.25) t = TerrainType.Water;
        else if (minH < WATER_LEVEL + 1.6) t = TerrainType.Shore;
        else if (s > MAX_BUILDABLE_SLOPE) t = TerrainType.Rocky;
        this.type[k] = t;
        this.buildable[k] = t === TerrainType.Water || s > MAX_BUILDABLE_SLOPE ? 0 : 1;
      }
    }
  }

  static inBounds(i: number, j: number): boolean {
    return i >= 0 && j >= 0 && i < GRID_CELLS && j < GRID_CELLS;
  }

  static cellOf(x: number, z: number): { i: number; j: number } {
    return { i: Math.floor(x / CELL_SIZE), j: Math.floor(z / CELL_SIZE) };
  }

  isBuildable(i: number, j: number): boolean {
    return WorldGrid.inBounds(i, j) && this.buildable[j * GRID_CELLS + i] === 1;
  }

  isWater(i: number, j: number): boolean {
    return WorldGrid.inBounds(i, j) && this.type[j * GRID_CELLS + i] === TerrainType.Water;
  }

  info(i: number, j: number): CellInfo | null {
    if (!WorldGrid.inBounds(i, j)) return null;
    const k = j * GRID_CELLS + i;
    const tile = this.unlock.tileOfCell(i, j);
    return {
      i,
      j,
      chunkX: Math.floor(i / CHUNK_CELLS),
      chunkZ: Math.floor(j / CHUNK_CELLS),
      worldX: (i + 0.5) * CELL_SIZE,
      worldZ: (j + 0.5) * CELL_SIZE,
      height: this.field.cellAverageHeight(i, j),
      slope: this.slope[k],
      type: this.type[k] as TerrainType,
      buildable: this.buildable[k] === 1,
      unlocked: this.unlock.isCellUnlocked(i, j),
      tileX: tile.x,
      tileZ: tile.z,
    };
  }

  /** Aggregate stats for the world info panel. */
  stats(): { buildablePct: number; waterPct: number; unlockedPct: number } {
    let b = 0;
    let w = 0;
    let u = 0;
    const total = GRID_CELLS * GRID_CELLS;
    for (let j = 0; j < GRID_CELLS; j++) {
      for (let i = 0; i < GRID_CELLS; i++) {
        const k = j * GRID_CELLS + i;
        if (this.buildable[k]) b++;
        if (this.type[k] === TerrainType.Water) w++;
        if (this.unlock.isCellUnlocked(i, j)) u++;
      }
    }
    return { buildablePct: (b / total) * 100, waterPct: (w / total) * 100, unlockedPct: (u / total) * 100 };
  }
}
