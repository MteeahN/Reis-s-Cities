import { describe, expect, it } from 'vitest';
import { GRID_CELLS } from '../../src/game/core/config';
import { ZoneType } from '../../src/game/data/zones';
import type { Rotation } from '../../src/game/entities/building/BuildingPlacement';
import { UNDO_LIMIT, UndoHistory } from '../../src/game/systems/UndoHistory';
import { buildTown, placeNearRoad } from './helpers/town';

type Town = ReturnType<typeof buildTown>;
const only = (t: Town, defId: string) => [...t.city.buildings.items.values()].filter((b) => b.defId === defId);

/** Another valid spot for building `id` (other than where it stands). */
function otherSpot(t: Town, id: number) {
  const b = t.city.buildings.items.get(id)!;
  for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) {
    if (!t.city.zones.zoneable[k]) continue;
    const i = k % GRID_CELLS;
    const j = Math.floor(k / GRID_CELLS);
    if (Math.abs(i - b.i) < 6 && Math.abs(j - b.j) < 6) continue;
    for (const rot of [0, 1, 2, 3] as Rotation[]) {
      const p = t.city.planMove(id, i, j, rot);
      if (p?.valid) return p;
    }
  }
  return null;
}

describe('Undo history', () => {
  it('keeps at most UNDO_LIMIT entries and a new action clears redo', () => {
    const h = new UndoHistory();
    for (let n = 0; n < UNDO_LIMIT + 5; n++) h.push({ kind: 'move', id: n, defId: 'plaza', from: { i: 0, j: 0, rot: 0 }, to: { i: 1, j: 1, rot: 0 } });
    expect(h.undoCount).toBe(UNDO_LIMIT);
    h.markUndone();
    expect(h.redoCount).toBe(1);
    h.push({ kind: 'move', id: 99, defId: 'plaza', from: { i: 0, j: 0, rot: 0 }, to: { i: 1, j: 1, rot: 0 } });
    expect(h.redoCount).toBe(0);
  });
});

describe('Undo / redo of buildings', () => {
  it('undoing a placement removes it and gives the whole price back; redo pays again', () => {
    const t = buildTown();
    const before = t.city.treasury.balance;
    expect(placeNearRoad(t.city, 'plaza')).toBe(true);
    const cost = only(t, 'plaza')[0].cost;
    expect(t.city.treasury.balance).toBe(before - cost);
    expect(t.city.undoLast()).toBeNull();
    expect(only(t, 'plaza')).toHaveLength(0);
    expect(t.city.treasury.balance).toBe(before);
    expect(t.city.redoLast()).toBeNull();
    expect(only(t, 'plaza')).toHaveLength(1);
    expect(t.city.treasury.balance).toBe(before - cost);
  });

  it('undoing a demolition rebuilds it for the refund that was paid out', () => {
    const t = buildTown();
    placeNearRoad(t.city, 'plaza');
    const b = only(t, 'plaza')[0];
    const cells = [...b.cells];
    const afterBuild = t.city.treasury.balance;
    const refund = t.city.demolishBuilding(b.id);
    expect(refund).toBeGreaterThan(0);
    expect(t.city.undoLast()).toBeNull();
    const back = only(t, 'plaza');
    expect(back).toHaveLength(1);
    expect(back[0].cells).toEqual(cells);
    expect(back[0].cost).toBe(b.cost);
    expect(t.city.treasury.balance).toBe(afterBuild);
    for (const k of cells) expect(t.city.occupancy.building[k]).toBe(back[0].id);
  });

  it('moves a building for free, keeps occupancy right, and undo puts it back', () => {
    const t = buildTown();
    placeNearRoad(t.city, 'plaza');
    const b = only(t, 'plaza')[0];
    const oldCells = [...b.cells];
    const plan = otherSpot(t, b.id)!;
    expect(plan).not.toBeNull();
    const money = t.city.treasury.balance;
    const moved = t.city.moveBuilding(b.id, plan.i, plan.j, plan.rot)!;
    expect(moved).not.toBeNull();
    expect(t.city.treasury.balance).toBe(money);
    for (const k of oldCells) expect(t.city.occupancy.building[k]).toBe(0);
    for (const k of moved.cells) expect(t.city.occupancy.building[k]).toBe(moved.id);
    expect(t.city.undoLast()).toBeNull();
    const back = only(t, 'plaza')[0];
    expect(back.cells).toEqual(oldCells);
    expect(t.city.redoLast()).toBeNull();
    expect(only(t, 'plaza')[0].cells).toEqual(moved.cells);
  });

  it('refuses to move zoned buildings or onto occupied cells', () => {
    const t = buildTown();
    t.run(1500);
    const grown = [...t.city.buildings.items.values()].find((b) => b.zone === ZoneType.Residential);
    expect(grown).toBeDefined();
    expect(t.city.planMove(grown!.id, grown!.i, grown!.j, grown!.rot)).toBeNull();
    placeNearRoad(t.city, 'plaza');
    const p = only(t, 'plaza')[0];
    expect(t.city.planMove(p.id, grown!.i, grown!.j, 0)?.valid).toBe(false);
  });

  it('an undo that no longer fits fails and is dropped', () => {
    const t = buildTown();
    placeNearRoad(t.city, 'plaza');
    const b = only(t, 'plaza')[0];
    const cells = [...b.cells];
    t.city.demolishBuilding(b.id);
    // Something else now stands there.
    t.city.occupancy.setBuilding(9999, cells);
    const entries = t.city.undo.undoCount;
    const money = t.city.treasury.balance;
    expect(t.city.undoLast()).toBe('Başka bir binayla çakışıyor');
    expect(t.city.treasury.balance).toBe(money);
    expect(only(t, 'plaza')).toHaveLength(0);
    expect(t.city.undo.undoCount).toBe(entries - 1);
    expect(t.city.undo.redoCount).toBe(0);
  });
});

describe('Mission rewards and city level', async () => {
  const { ACHIEVEMENTS, cityLevel, rewardOf, xpOf, LEVEL_XP } = await import('../../src/game/systems/Achievements');
  it('every mission pays a reward and XP; levels follow XP', () => {
    for (const a of ACHIEVEMENTS) {
      expect(rewardOf(a.id)).toBeGreaterThan(0);
      expect(xpOf(a.id)).toBeGreaterThan(0);
    }
    expect(cityLevel(0).level).toBe(1);
    expect(cityLevel(LEVEL_XP[1]).level).toBe(2);
    expect(cityLevel(LEVEL_XP[1] - 1).level).toBe(1);
    expect(cityLevel(1e9).next).toBeNull();
    // All missions together reach the top level.
    expect(cityLevel(ACHIEVEMENTS.reduce((s, a) => s + xpOf(a.id), 0)).level).toBe(LEVEL_XP.length);
  });
});
