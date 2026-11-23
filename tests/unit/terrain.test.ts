import { describe, expect, it } from 'vitest';
import { CELL_SIZE, GRID_CELLS, WATER_LEVEL, WORLD_SIZE } from '../../src/game/core/config';
import { SimplexNoise } from '../../src/game/world/generation/noise';
import { TerrainShape } from '../../src/game/world/generation/TerrainShape';
import { generateHeights, generateWorld, Species, VEG_STRIDE } from '../../src/game/world/generation/generateWorld';
import { Heightfield } from '../../src/game/world/Heightfield';
import { OuterGrid, buildOuterAxis } from '../../src/game/world/OuterGrid';
import { UnlockMap } from '../../src/game/world/UnlockMap';
import { TerrainType, WorldGrid } from '../../src/game/world/WorldGrid';

describe('SimplexNoise', () => {
  it('is deterministic per seed and bounded', () => {
    const a = new SimplexNoise(42);
    const b = new SimplexNoise(42);
    const c = new SimplexNoise(43);
    let differs = false;
    for (let i = 0; i < 500; i++) {
      const x = i * 0.137;
      const y = i * 0.291;
      const v = a.noise2(x, y);
      expect(v).toBe(b.noise2(x, y));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
      if (v !== c.noise2(x, y)) differs = true;
    }
    expect(differs).toBe(true);
  });

  it('ridged noise stays in [0,1]', () => {
    const n = new SimplexNoise(7);
    for (let i = 0; i < 300; i++) {
      const v = n.ridged(i * 0.31, i * 0.17, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('TerrainShape', () => {
  const shape = new TerrainShape(12345);

  it('carves the river below water level along its centreline', () => {
    for (const x of [200, 700, 1024, 1500, 1900]) {
      expect(shape.height(x, shape.riverZ(x))).toBeLessThan(WATER_LEVEL);
    }
  });

  it('carves the lake below water level at its centre', () => {
    expect(shape.height(shape.lakeX, shape.lakeZ)).toBeLessThan(WATER_LEVEL);
  });

  it('keeps land outside water above sea level in the start area', () => {
    const field = new Heightfield(generateHeights(shape));
    const grid = new WorldGrid(field, new UnlockMap());
    const s = grid.stats();
    expect(s.buildablePct).toBeGreaterThan(50);
    expect(s.waterPct).toBeGreaterThan(1);
    expect(s.waterPct).toBeLessThan(20);
    expect(s.unlockedPct).toBeCloseTo(25, 5);
  });

  it('raises mountains outside the playable map', () => {
    let outside = 0;
    let inside = 0;
    for (let k = 0; k < 40; k++) {
      outside += shape.height(-3500 - k * 50, 400 + k * 30);
      inside += shape.height(900 + k * 5, 1000 + k * 5);
    }
    expect(outside / 40).toBeGreaterThan(inside / 40 + 50);
  });
});

describe('Heightfield', () => {
  const verts = GRID_CELLS + 1;
  const heights = new Float32Array(verts * verts);
  for (let j = 0; j < verts; j++) for (let i = 0; i < verts; i++) heights[j * verts + i] = i * 0.5; // ramp along x

  const field = new Heightfield(heights);

  it('samples bilinearly between vertices', () => {
    expect(field.sample(0, 0)).toBeCloseTo(0);
    expect(field.sample(CELL_SIZE * 10, 100)).toBeCloseTo(5);
    expect(field.sample(CELL_SIZE * 10.5, 100)).toBeCloseTo(5.25);
  });

  it('computes cell slope as rise over run', () => {
    expect(field.cellSlope(3, 3)).toBeCloseTo(0.5 / CELL_SIZE);
  });

  it('produces normals tilted against the slope', () => {
    const n = { x: 0, y: 0, z: 0 };
    field.normalAt(10, 10, n);
    expect(n.x).toBeLessThan(0);
    expect(n.y).toBeGreaterThan(0.9);
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1);
  });

  it('rejects wrong-sized input', () => {
    expect(() => new Heightfield(new Float32Array(10))).toThrow();
  });
});

describe('OuterGrid', () => {
  it('builds a symmetric axis that contains the map edges exactly', () => {
    const axis = buildOuterAxis();
    expect(Array.from(axis)).toContain(0);
    expect(Array.from(axis)).toContain(WORLD_SIZE);
    for (let i = 1; i < axis.length; i++) expect(axis[i]).toBeGreaterThan(axis[i - 1]);
    expect(axis[0]).toBeLessThan(-10000);
    expect(axis[axis.length - 1]).toBeGreaterThan(WORLD_SIZE + 10000);
  });

  it('samples bilinearly on the non-uniform grid', () => {
    const axis = buildOuterAxis();
    const n = axis.length;
    const h = new Float32Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = axis[i] * 0.01 + axis[j] * 0.02;
    const g = new OuterGrid(axis, h);
    expect(g.sample(-5000, 300)).toBeCloseTo(-50 + 6, 3);
    expect(g.sample(3000, -7777)).toBeCloseTo(30 - 155.54, 2);
  });
});

describe('WorldGrid & UnlockMap', () => {
  it('classifies water and steep cells as not buildable', () => {
    const verts = GRID_CELLS + 1;
    const heights = new Float32Array(verts * verts).fill(10);
    heights[0] = -3; // cell (0,0) touches water
    heights[5 * verts + 20] = 40; // spike makes neighbouring cells steep
    const grid = new WorldGrid(new Heightfield(heights), new UnlockMap());
    expect(grid.type[0]).toBe(TerrainType.Water);
    expect(grid.isBuildable(0, 0)).toBe(false);
    expect(grid.isBuildable(20, 5)).toBe(false);
    expect(grid.isBuildable(100, 100)).toBe(true);
  });

  it('starts with the centre tiles unlocked and can unlock more', () => {
    const u = new UnlockMap();
    expect(u.isCellUnlocked(128, 128)).toBe(true);
    expect(u.isCellUnlocked(10, 10)).toBe(false);
    let changed = 0;
    u.onChange(() => changed++);
    u.unlockTile(0, 0);
    expect(u.isCellUnlocked(10, 10)).toBe(true);
    expect(changed).toBe(1);
    expect(u.unlockedCount()).toBe(5);
  });
});

describe('generateWorld', () => {
  it('is deterministic and produces vegetation on land only', () => {
    const a = generateWorld(777);
    const b = generateWorld(777);
    expect(a.heights).toEqual(b.heights);
    expect(a.vegetation.count).toBe(b.vegetation.count);
    expect(a.vegetation.count).toBeGreaterThan(2000);
    expect(a.outerVegetation.count).toBeGreaterThan(1000);
    const field = new Heightfield(a.heights);
    for (let k = 0; k < a.vegetation.count; k += 7) {
      const o = k * VEG_STRIDE;
      const x = a.vegetation.data[o];
      const z = a.vegetation.data[o + 2];
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(WORLD_SIZE);
      if (a.vegetation.species[k] !== Species.Rock) expect(field.sample(x, z)).toBeGreaterThan(WATER_LEVEL + 1);
    }
  }, 30_000);
});
