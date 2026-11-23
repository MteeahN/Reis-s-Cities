import { describe, expect, it } from 'vitest';
import { CELL_SIZE, GRID_CELLS } from '../../src/game/core/config';
import { getBuilding, growablePrice, ZONED_BUILDINGS } from '../../src/game/data/buildings';
import { ARCH_STYLES } from '../../src/game/data/styles';
import { ZoneType } from '../../src/game/data/zones';
import { variantParts } from '../../src/game/entities/building/BuildingModels';
import { SAVE_FORMAT, SAVE_VERSION, restoreCity, serializeCity, validateSave } from '../../src/game/save/CitySave';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { City } from '../../src/game/systems/City';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';
import { buildTown } from './helpers/town';

describe('Architectural styles', () => {
  it('every style changes the look of every growable and stays on its lot', () => {
    const bad: string[] = [];
    for (const def of ZONED_BUILDINGS) {
      const W = def.footprint[0] * CELL_SIZE;
      const D = def.footprint[1] * CELL_SIZE;
      const modern = JSON.stringify(variantParts(def, 1, 'modern'));
      for (const arch of ARCH_STYLES) {
        const parts = variantParts(def, 1, arch);
        if (arch !== 'modern') expect(JSON.stringify(parts), `${def.id} ${arch}`).not.toBe(modern);
        for (const p of parts) {
          if (p.rot && (p.rot[0] !== 0 || p.rot[2] !== 0)) continue;
          const turned = p.rot && Math.abs(p.rot[1]) === 90;
          const hx = (turned ? p.size[2] : p.size[0]) / 2;
          const hz = (turned ? p.size[0] : p.size[2]) / 2;
          // Eaves may overhang a little; nothing may reach into the street.
          if (Math.abs(p.pos[0]) + hx > W / 2 + 1.2 || Math.abs(p.pos[2]) + hz > D / 2 + 1.2) bad.push(`${def.id} ${arch} ${p.shape}@${p.pos.map((n) => n.toFixed(1))}`);
          for (const n of [...p.size, ...p.pos]) if (!Number.isFinite(n)) bad.push(`${def.id} ${arch} NaN`);
          if (p.size.some((n) => n < 0)) bad.push(`${def.id} ${arch} negative size ${p.shape}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('zoning paints the style; growth and restyling follow it; it is saved', () => {
    const t = buildTown();
    const cells: number[] = [];
    for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) if (t.city.zones.zone[k] === ZoneType.Residential) cells.push(k);
    t.city.setZone(cells, ZoneType.Residential, 'european');
    t.run(2500);
    const grown = [...t.city.buildings.items.values()].filter((b) => b.zone === ZoneType.Residential);
    expect(grown.length).toBeGreaterThan(0);
    expect(grown.every((b) => b.style === 'european')).toBe(true);
    // Re-painting the same zone in another style restyles what stands there.
    t.city.setZone(cells, ZoneType.Residential, 'ottoman');
    expect([...t.city.buildings.items.values()].filter((b) => b.zone === ZoneType.Residential).every((b) => b.style === 'ottoman')).toBe(true);

    const data = {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      appVersion: 't',
      cityId: 'c',
      name: 'n',
      seed: 12345,
      savedAt: 1,
      clock: { tick: t.scheduler.tick, gameMinutes: t.scheduler.gameMinutes, speed: 1, paused: false },
      camera: null,
      city: serializeCity(t.city, t.sim),
      achievements: { earned: [] },
      history: { samples: [] },
    };
    const valid = validateSave(JSON.parse(JSON.stringify(data))).data;
    const loaded = new City(new World(generateWorld(12345)));
    restoreCity(loaded, new CitySimulation(loaded, 1, { onStats: () => {}, onMilestone: () => {} }), valid.city, 0, 0);
    expect([...loaded.districtStyle]).toEqual([...t.city.districtStyle]);
    expect([...loaded.buildings.items.values()].filter((b) => b.zone).every((b) => b.style === 'ottoman')).toBe(true);
  });

  it('a growable can be placed by hand: paid, zoned, under construction, half refunded', () => {
    const t = buildTown({ utilities: true });
    const def = getBuilding('res2_apt_s');
    let plan = null;
    for (let k = 0; k < GRID_CELLS * GRID_CELLS && !plan; k++) {
      if (!t.city.zones.zoneable[k] || t.city.occupancy.building[k]) continue;
      for (const rot of [0, 1, 2, 3] as const) {
        const p = t.city.planBuilding(def.id, k % GRID_CELLS, Math.floor(k / GRID_CELLS), rot);
        if (p.valid) {
          plan = p;
          break;
        }
      }
    }
    expect(plan).not.toBeNull();
    expect(plan!.cost).toBe(growablePrice(def));
    const before = t.city.treasury.balance;
    const b = t.city.placeGrowable(plan!, 'asian', 0.3, 0)!;
    expect(b).not.toBeNull();
    expect(t.city.treasury.balance).toBeCloseTo(before - plan!.cost);
    expect(b.state).toBe('construction');
    expect(b.style).toBe('asian');
    for (const k of b.cells) expect(t.city.zones.zone[k]).toBe(ZoneType.Residential);
    const refund = t.city.demolishBuilding(b.id);
    expect(refund).toBe(Math.round(plan!.cost * 0.5));
  });
});
