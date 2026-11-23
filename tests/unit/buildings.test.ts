import { describe, expect, it } from 'vitest';
import { GRID_CELLS } from '../../src/game/core/config';
import { BUILDINGS, getBuilding } from '../../src/game/data/buildings';
import {
  anchorFor,
  bestRotation,
  footprintSize,
  frontCells,
  planBuilding,
  type PlacementWorld,
} from '../../src/game/entities/building/BuildingPlacement';
import { BuildingRegistry } from '../../src/game/entities/building/BuildingRegistry';
import { Treasury } from '../../src/game/systems/Treasury';

/** World with a horizontal road along cell row `roadRow`. */
const world = (roadRow = 103, over: Partial<PlacementWorld> = {}): PlacementWorld => ({
  vertexHeight: () => 10,
  isCellUnlocked: () => true,
  isWater: () => false,
  hasRoad: (_i, j) => j === roadRow,
  buildingAt: () => 0,
  ...over,
});

const hall = getBuilding('city_hall');

describe('building catalogue', () => {
  it('has unique ids, sane footprints and model parts', () => {
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(BUILDINGS.length);
    for (const b of BUILDINGS) {
      expect(b.footprint[0]).toBeGreaterThan(0);
      expect(b.model.length).toBeGreaterThan(0);
      for (const p of b.model) {
        // Parts must stay inside the footprint (front faces +z).
        expect(Math.abs(p.pos[0]) + (p.rot ? 0 : p.size[0] / 2)).toBeLessThanOrEqual((b.footprint[0] * 8) / 2 + 0.01);
      }
    }
  });
});

describe('building placement', () => {
  it('rotated footprints swap width and depth', () => {
    const def = { ...hall, footprint: [3, 2] as [number, number] };
    expect(footprintSize(def, 0)).toEqual([3, 2]);
    expect(footprintSize(def, 1)).toEqual([2, 3]);
  });

  it('front cells follow the rotation', () => {
    expect(frontCells(10, 10, 2, 2, 0)).toEqual([[10, 12], [11, 12]]);
    expect(frontCells(10, 10, 2, 2, 2)).toEqual([[10, 9], [11, 9]]);
    expect(frontCells(10, 10, 2, 2, 1)).toEqual([[12, 10], [12, 11]]);
    expect(frontCells(10, 10, 2, 2, 3)).toEqual([[9, 10], [9, 11]]);
  });

  it('accepts a building facing a road', () => {
    const plan = planBuilding(hall, 100, 100, 0, world(), 1e6, 0);
    expect(plan.errors).toEqual([]);
    expect(plan.roadAccess).toBe(true);
  });

  it('requires road access, owned dry flat land, no overlap, budget and uniqueness', () => {
    expect(planBuilding(hall, 100, 100, 2, world(), 1e6, 0).roadAccess).toBe(false);
    expect(planBuilding(hall, 100, 100, 0, world(103, { isCellUnlocked: () => false }), 1e6, 0).valid).toBe(false);
    expect(planBuilding(hall, 100, 100, 0, world(103, { isWater: (i) => i === 101 }), 1e6, 0).errors).toContain('Su üzerine inşa edilemez');
    expect(planBuilding(hall, 100, 101, 0, world(103), 1e6, 0).errors).toContain('Yolun üzerine inşa edilemez');
    expect(planBuilding(hall, 100, 100, 0, world(103, { buildingAt: (i) => (i === 102 ? 5 : 0) }), 1e6, 0).errors).toContain('Başka bir binayla çakışıyor');
    expect(planBuilding(hall, 100, 100, 0, world(103, { vertexHeight: (i) => i * 3 }), 1e6, 0).errors).toContain('Arazi çok eğimli');
    expect(planBuilding(hall, 100, 100, 0, world(), 10, 0).errors).toContain('Yetersiz bütçe');
    expect(planBuilding(hall, 100, 100, 0, world(), 1e6, 1).valid).toBe(false);
    expect(planBuilding(hall, GRID_CELLS - 1, 100, 0, world(), 1e6, 0).errors).toContain('Harita sınırlarının dışında');
  });

  it('auto-orients to face the nearest road', () => {
    const plaza = getBuilding('plaza');
    // Road above the plaza (row 99) → the plaza should turn its front to −z.
    const w = world(99);
    const rot = bestRotation(plaza, 100 * 8 + 8, 100 * 8 + 8, 0, w);
    expect(rot).toBe(2);
    const { i, j } = anchorFor(plaza, rot, 808, 808);
    expect(planBuilding(plaza, i, j, rot, w, 1e6, 0).roadAccess).toBe(true);
  });

  it('records buildings in the registry with their cells', () => {
    const reg = new BuildingRegistry();
    const b = reg.add(planBuilding(hall, 100, 100, 0, world(), 1e6, 0));
    expect(b.cells).toHaveLength(9);
    expect(reg.countOf('city_hall')).toBe(1);
    reg.remove(b.id);
    expect(reg.countOf('city_hall')).toBe(0);
  });
});

describe('Treasury', () => {
  it('spends only what it has and tracks refunds', () => {
    const t = new Treasury(1000);
    expect(t.spend(400, 'roads')).toBe(true);
    expect(t.spend(700, 'roads')).toBe(false);
    expect(t.balance).toBe(600);
    t.refund(200, 'roads');
    expect(t.balance).toBe(800);
    expect(t.spent.roads).toBe(400);
    expect(t.refunded.roads).toBe(200);
    expect(() => t.spend(-1, 'roads')).toThrow();
  });
});
