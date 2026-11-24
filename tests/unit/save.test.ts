import { describe, expect, it } from 'vitest';
import { GRID_CELLS } from '../../src/game/core/config';
import { SAVE_FORMAT, SAVE_VERSION, SaveError, makeMeta, restoreCity, serializeCity, validateSave, type CitySaveData } from '../../src/game/save/CitySave';
import { MemorySaveBackend, SaveStore } from '../../src/game/save/SaveStore';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { SimScheduler } from '../../src/game/simulation/SimScheduler';
import { City } from '../../src/game/systems/City';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';
import { buildTown } from './helpers/town';

const worldData = generateWorld(12345);

function grownTown() {
  const t = buildTown({ hall: true });
  t.run(3000);
  return t;
}

function wrap(city: City, sim: CitySimulation, s: SimScheduler): CitySaveData {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    appVersion: 'test',
    cityId: 'c1',
    name: 'Test',
    seed: 12345,
    savedAt: 1,
    clock: { tick: s.tick, gameMinutes: s.gameMinutes, speed: 1, paused: false },
    camera: null,
    city: serializeCity(city, sim),
    achievements: { earned: [] },
    history: { samples: [] },
  };
}

function load(data: CitySaveData) {
  const city = new City(new World(worldData));
  const sim = new CitySimulation(city, 1, { onStats: () => {}, onMilestone: () => {} });
  const scheduler = new SimScheduler();
  sim.register(scheduler);
  scheduler.tick = data.clock.tick;
  scheduler.gameMinutes = data.clock.gameMinutes;
  restoreCity(city, sim, data.city, data.clock.tick, data.clock.gameMinutes);
  return { city, sim, scheduler, run: (n: number) => { for (let i = 0; i < n; i++) scheduler.advance(0.1); } };
}

describe('Save / load', { timeout: 20_000 }, () => {
  it('a loaded city has the same roads, buildings, zones, money and people', () => {
    const t = grownTown();
    expect(t.sim.stats!.total).toBeGreaterThan(10);
    const data = validateSave(JSON.parse(JSON.stringify(wrap(t.city, t.sim, t.scheduler)))).data;
    const l = load(data);

    expect(l.city.roads.edges.size).toBe(t.city.roads.edges.size);
    expect(l.city.buildings.items.size).toBe(t.city.buildings.items.size);
    for (const [id, b] of t.city.buildings.items) expect(l.city.buildings.items.get(id)).toEqual(b);
    expect(l.city.zones.countZoned()).toEqual(t.city.zones.countZoned());
    for (let z = 1; z <= 3; z++) expect(l.city.zones.empty[z].size).toBe(t.city.zones.empty[z].size);
    expect([...l.city.occupancy.building]).toEqual([...t.city.occupancy.building]);
    expect([...l.city.occupancy.road]).toEqual([...t.city.occupancy.road]);
    expect([...l.city.zones.zoneable]).toEqual([...t.city.zones.zoneable]);
    expect(l.city.treasury.balance).toBe(t.city.treasury.balance);
    expect(l.city.population.totals()).toEqual(t.city.population.totals());
    expect(l.city.powerLines.totalLength()).toBeCloseTo(t.city.powerLines.totalLength());
    expect(l.city.utilities.stats).toEqual(t.city.utilities.stats);
    // Trees under roads and buildings are cleared again.
    expect(l.city.world.vegetation.objectCount).toBe(t.city.world.vegetation.objectCount);
    // Saving the loaded city gives the same data.
    const again = wrap(l.city, l.sim, l.scheduler);
    expect(again.city).toEqual(data.city);
  });

  it('a loaded city continues exactly like the original', () => {
    const t = grownTown();
    const l = load(validateSave(JSON.parse(JSON.stringify(wrap(t.city, t.sim, t.scheduler)))).data);
    t.run(1500);
    l.run(1500);
    expect(l.scheduler.gameMinutes).toBeCloseTo(t.scheduler.gameMinutes);
    expect(l.city.buildings.items.size).toBe(t.city.buildings.items.size);
    expect(l.sim.stats!.total).toBeCloseTo(t.sim.stats!.total, 6);
    expect(l.city.treasury.balance).toBeCloseTo(t.city.treasury.balance, 4);
  });

  it('new ids never collide with restored ones', () => {
    const t = grownTown();
    const l = load(wrap(t.city, t.sim, t.scheduler));
    const maxBuilding = Math.max(...l.city.buildings.items.keys());
    const maxEdge = Math.max(...l.city.roads.edges.keys(), ...l.city.roads.nodes.keys());
    const n = l.city.roads.addNode(10, 10);
    expect(n.id).toBeGreaterThan(maxEdge);
    expect(l.city.buildings.nextIdValue).toBeGreaterThan(maxBuilding);
    const line = l.city.pipes.add({ x: 900, z: 900 }, { x: 950, z: 900 }, 1);
    expect(t.city.pipes.lines.has(line.id)).toBe(false);
  });

  it('rejects files that are not saves, and newer save versions', () => {
    expect(() => validateSave('hello')).toThrow(SaveError);
    expect(() => validateSave({ format: 'other' })).toThrow(/Reis's Cities/);
    const t = buildTown();
    const d = wrap(t.city, t.sim, t.scheduler);
    expect(() => validateSave({ ...d, version: SAVE_VERSION + 1 })).toThrow(/daha yeni/);
    expect(() => validateSave({ ...d, city: { ...d.city, roads: null } })).toThrow(/roads/);
  });

  it('drops unknown building and road types with a warning', () => {
    const t = grownTown();
    const d = JSON.parse(JSON.stringify(wrap(t.city, t.sim, t.scheduler))) as CitySaveData;
    d.city.buildings.items[0].defId = 'no_such_building';
    d.city.roads.edges[0].typeId = 'hyperloop';
    const { data, warnings } = validateSave(d);
    expect(warnings).toHaveLength(2);
    expect(data.city.buildings.items.length).toBe(t.city.buildings.items.size - 1);
    const l = load(data);
    expect(l.city.buildings.items.size).toBe(t.city.buildings.items.size - 1);
    // Zones stay within the grid.
    expect(l.city.zones.zone.length).toBe(GRID_CELLS * GRID_CELLS);
  });
});

describe('Save store', () => {
  it('writes, lists newest first, reads and deletes slots', async () => {
    const store = new SaveStore(new MemorySaveBackend());
    const t = buildTown();
    const d = wrap(t.city, t.sim, t.scheduler);
    await store.write(makeMeta({ ...d, savedAt: 10 }, 'a', 'manual', ''), { ...d, savedAt: 10 });
    await store.write(makeMeta({ ...d, savedAt: 20, name: 'İkinci' }, 'b', 'auto', ''), { ...d, savedAt: 20, name: 'İkinci' });
    const list = await store.list();
    expect(list.map((m) => m.id)).toEqual(['b', 'a']);
    expect(list[0].kind).toBe('auto');
    const read = await store.read('a');
    expect(read.data.city.roads).toEqual(d.city.roads);
    await store.remove('a');
    expect((await store.list()).map((m) => m.id)).toEqual(['b']);
    await expect(store.read('a')).rejects.toThrow(SaveError);
  });
});
