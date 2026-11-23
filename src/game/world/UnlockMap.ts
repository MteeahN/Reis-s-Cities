import { START_TILES, TILE_CELLS, TILES_PER_SIDE } from '../core/config';

/**
 * Which land tiles the city currently owns. Phase 1 starts with the centre
 * 2×2 tiles; purchasing more tiles arrives with the economy.
 */
export class UnlockMap {
  readonly tiles = new Uint8Array(TILES_PER_SIDE * TILES_PER_SIDE);
  private listeners = new Set<() => void>();

  constructor(initial: ReadonlyArray<readonly [number, number]> = START_TILES) {
    for (const [x, z] of initial) this.tiles[z * TILES_PER_SIDE + x] = 1;
  }

  tileOfCell(i: number, j: number): { x: number; z: number } {
    return { x: Math.floor(i / TILE_CELLS), z: Math.floor(j / TILE_CELLS) };
  }

  isTileUnlocked(x: number, z: number): boolean {
    if (x < 0 || z < 0 || x >= TILES_PER_SIDE || z >= TILES_PER_SIDE) return false;
    return this.tiles[z * TILES_PER_SIDE + x] === 1;
  }

  isCellUnlocked(i: number, j: number): boolean {
    const t = this.tileOfCell(i, j);
    return this.isTileUnlocked(t.x, t.z);
  }

  unlockTile(x: number, z: number): void {
    if (this.isTileUnlocked(x, z)) return;
    this.tiles[z * TILES_PER_SIDE + x] = 1;
    this.listeners.forEach((l) => l());
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Centre of the unlocked region, in world cells. */
  unlockedCount(): number {
    let c = 0;
    for (const t of this.tiles) c += t;
    return c;
  }
}
