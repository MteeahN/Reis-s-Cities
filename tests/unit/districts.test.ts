import { describe, expect, it } from 'vitest';
import { GRID_CELLS } from '../../src/game/core/config';
import { getBuilding, HEIGHT_LIMITS, storeysOf, ZONED_BUILDINGS, zonedTemplates } from '../../src/game/data/buildings';
import { ZoneType } from '../../src/game/data/zones';
import { variantParts } from '../../src/game/entities/building/BuildingModels';
import { targetDemand } from '../../src/game/simulation/Demand';
import { findLot, type LotWorld } from '../../src/game/simulation/LotFinder';
import { SAVE_FORMAT, SAVE_VERSION, restoreCity, serializeCity, validateSave } from '../../src/game/save/CitySave';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { City } from '../../src/game/systems/City';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';
import { buildTown } from './helpers/town';

/** A flat open field zoned `zone`, with a road along j = 10. */
function field(zone: number, rules = { wealth: 0, height: 0 }): LotWorld {
  return {
    zoneAt: (_i, j) => (j < 10 ? zone : 0),
    hasRoad: (_i, j) => j === 10,
    buildingAt: () => 0,
    isBuildable: () => true,
    vertexHeight: () => 0,
    rulesAt: () => rules,
  };
}

describe('Office zone', () => {
  it('has its own templates at every level, none left in the commercial zone', () => {
    for (const level of [1, 2, 3]) expect(zonedTemplates(ZoneType.Office, level).length).toBeGreaterThan(0);
    expect(ZONED_BUILDINGS.filter((b) => b.zone === ZoneType.Commercial && b.category === 'office')).toEqual([]);
    expect(ZONED_BUILDINGS.filter((b) => b.zone === ZoneType.Office).every((b) => b.category === 'office' && b.pollution === 0)).toBe(true);
  });

  it('demand follows the educated labour force and falls as offices fill it', () => {
    const base = { population: 2000, labor: 1200, housingCapacity: 2100, commercialJobs: 240, industrialJobs: 300, totalJobs: 1200, commercialUnlocked: true, industrialUnlocked: true, officeUnlocked: true };
    const none = targetDemand({ ...base, educatedLabor: 0, officeJobs: 0 });
    const want = targetDemand({ ...base, educatedLabor: 800, officeJobs: 0 });
    const full = targetDemand({ ...base, educatedLabor: 800, officeJobs: 400 });
    expect(want.office).toBeGreaterThan(none.office);
    expect(full.office).toBeLessThan(want.office);
    expect(targetDemand({ ...base, educatedLabor: 800, officeUnlocked: false }).office).toBe(0);
  });

  it('old saves: offices that grew in commercial zones move to the office zone', () => {
    const t = buildTown();
    t.city.enableSandbox();
    let plan = null;
    for (let k = 0; k < GRID_CELLS * GRID_CELLS && !plan; k++) {
      if (!t.city.zones.zoneable[k] || t.city.occupancy.building[k]) continue;
      for (const rot of [0, 1, 2, 3] as const) {
        const p = t.city.planBuilding('com2_office', k % GRID_CELLS, Math.floor(k / GRID_CELLS), rot);
        if (p.valid) {
          plan = p;
          break;
        }
      }
    }
    const b = t.city.placeGrowable(plan!, 'modern', 0, 0)!;
    // Pretend it was saved by an older version, as a commercial building on commercial land.
    b.zone = ZoneType.Commercial;
    t.city.zones.set(b.cells, ZoneType.Commercial, () => false);
    t.city.migrateGrowableZones();
    expect(b.zone).toBe(ZoneType.Office);
    for (const k of b.cells) expect(t.city.zones.zone[k]).toBe(ZoneType.Office);
  });
});

describe('District rules', () => {
  it('a height limit keeps every template under it', () => {
    for (const zone of [ZoneType.Residential, ZoneType.Commercial, ZoneType.Industrial, ZoneType.Office]) {
      for (const level of [1, 2, 3]) {
        for (const h of [1, 2]) for (const b of zonedTemplates(zone, level, undefined, { height: h })) expect(storeysOf(b)).toBeLessThanOrEqual(HEIGHT_LIMITS[h]);
      }
    }
    // Low-rise homes still exist at every level, so a low district keeps developing.
    for (const level of [1, 2, 3]) expect(zonedTemplates(ZoneType.Residential, level, undefined, { height: 1 }).length).toBeGreaterThan(0);
    // Towers only grow without a limit.
    expect(zonedTemplates(ZoneType.Residential, 3, [2, 2], { height: 1 }).some((b) => b.id === 'res3_tower_l')).toBe(false);
  });

  it('wealth picks who the homes are for, falling back when nothing of that wealth fits', () => {
    const rich = zonedTemplates(ZoneType.Residential, 2, undefined, { wealth: 3 });
    expect(rich.length).toBeGreaterThan(0);
    expect(rich.every((b) => b.wealth === 3)).toBe(true);
    const modest = zonedTemplates(ZoneType.Residential, 3, undefined, { wealth: 1 });
    expect(modest.every((b) => b.wealth === 1)).toBe(true);
    // Per resident, wealthy homes take far more land than modest ones.
    const density = (list: typeof rich) => list.reduce((s, b) => s + b.residents, 0) / list.reduce((s, b) => s + b.footprint[0] * b.footprint[1], 0);
    expect(density(modest)).toBeGreaterThan(density(zonedTemplates(ZoneType.Residential, 3, undefined, { wealth: 3 })) * 3);
    // No wealthy 1×1 template at level 1: other homes are used instead of nothing.
    expect(zonedTemplates(ZoneType.Residential, 1, [1, 1], { wealth: 3 }).length).toBeGreaterThan(0);
    // Wealth only steers homes.
    expect(zonedTemplates(ZoneType.Commercial, 1, undefined, { wealth: 3 })).toEqual(zonedTemplates(ZoneType.Commercial, 1));
  });

  it('the lot finder grows buildings that obey the district', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let n = 0; n < 40; n++) {
      const lot = findLot(20 + (n % 5), 9, ZoneType.Residential, 3, rand, field(ZoneType.Residential, { wealth: 3, height: 1 }));
      expect(lot).not.toBeNull();
      expect(storeysOf(lot!.def)).toBeLessThanOrEqual(3);
      expect(lot!.def.wealth).toBe(3);
    }
  });

  it('zoning paints wealth and height; they are saved and restored', () => {
    const t = buildTown();
    const cells: number[] = [];
    for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) if (t.city.zones.zone[k] === ZoneType.Residential) cells.push(k);
    t.city.setZone(cells, ZoneType.Residential, 'nordic', { wealth: 1, height: 1 });
    expect(cells.every((k) => t.city.districtWealth[k] === 1 && t.city.districtHeight[k] === 1)).toBe(true);
    t.run(2500);
    const grown = [...t.city.buildings.items.values()].filter((b) => b.zone === ZoneType.Residential);
    expect(grown.length).toBeGreaterThan(0);
    expect(grown.every((b) => storeysOf(getBuilding(b.defId)) <= 3 && b.style === 'nordic')).toBe(true);
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
    expect([...loaded.districtWealth]).toEqual([...t.city.districtWealth]);
    expect([...loaded.districtHeight]).toEqual([...t.city.districtHeight]);
  });
});

describe('New building kinds', () => {
  it('terraces and courtyard blocks build in every style', () => {
    for (const id of ['res1_row', 'res2_court', 'res3_court', 'off3_tower']) {
      const def = getBuilding(id);
      for (const arch of ['modern', 'nordic', 'arabic', 'slavic', 'american', 'medieval', 'futuristic'] as const) {
        expect(variantParts(def, 2, arch).length).toBeGreaterThan(10);
      }
    }
  });
});
