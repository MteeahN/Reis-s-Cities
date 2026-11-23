/**
 * Global world constants. Every system derives its dimensions from here so
 * the map can be resized/expanded without touching gameplay code.
 */
export const GRID_CELLS = 256; // cells per side
export const CELL_SIZE = 8; // metres per cell
export const WORLD_SIZE = GRID_CELLS * CELL_SIZE; // 2048 m
export const CHUNK_CELLS = 32; // cells per chunk side
export const CHUNKS_PER_SIDE = GRID_CELLS / CHUNK_CELLS; // 8
export const CHUNK_SIZE = CHUNK_CELLS * CELL_SIZE; // 256 m

/** Purchasable land tiles (2x2 chunks each). */
export const TILE_CELLS = 64;
export const TILES_PER_SIDE = GRID_CELLS / TILE_CELLS; // 4
/** Tiles unlocked at the start of a new city (centre 2x2). */
export const START_TILES: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
];

export const WATER_LEVEL = 0;
/** Max per-cell slope (rise/run) that still counts as buildable. */
export const MAX_BUILDABLE_SLOPE = 0.32;

/** Outer scenery ring — spacing grows geometrically away from the map. */
export const OUTER_BASE_STEP = 32;
export const OUTER_GROWTH = 1.07;
export const OUTER_EXTENT = 16000;

/** Simulation runs at a fixed tick rate independent of rendering. */
export const SIM_TICK_HZ = 10;
/** Game minutes that pass per real second at 1x speed (1 day ≈ 4 min). */
export const GAME_MINUTES_PER_SECOND = 6;
export const GAME_SPEEDS = [0, 1, 2, 3] as const;
export type GameSpeed = (typeof GAME_SPEEDS)[number];

export const CAMERA = {
  minDistance: 25,
  maxDistance: 1600,
  minPitch: (14 * Math.PI) / 180,
  maxPitch: (86 * Math.PI) / 180,
  fov: 45,
  boundsMargin: 128,
} as const;

export const STARTING_BUDGET = 70_000;

/** The city is founded at 08:00 on day one (game minute 0 shows as 08:00). */
export const START_MINUTE_OFFSET = 8 * 60;

/** Shown in menus and written into save files. */
export const APP_VERSION = '0.8.0';
