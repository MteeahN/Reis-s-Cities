import { describe, expect, it } from 'vitest';
import { SAVE_FORMAT, SAVE_VERSION, makeMeta, restoreCity, serializeCity, validateSave, type CitySaveData } from '../../src/game/save/CitySave';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { SimScheduler } from '../../src/game/simulation/SimScheduler';
import { City } from '../../src/game/systems/City';
import { Treasury } from '../../src/game/systems/Treasury';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';
import { ZoneType } from '../../src/game/data/zones';

const worldData = generateWorld(4242);

function sandboxCity() {
  const city = new City(new World(worldData));
  city.enableSandbox();
  const sim = new CitySimulation(city, 1, { onStats: () => {}, onMilestone: () => {} });
  const scheduler = new SimScheduler();
  sim.register(scheduler);
  return { city, sim, scheduler };
}

describe('Sandbox mode', () => {
  it('treasury is unlimited: everything is affordable and spending does not move the balance', () => {
    const t = new Treasury(1000);
    t.setUnlimited();
    expect(t.balance).toBe(Infinity);
    expect(t.canAfford(1e12)).toBe(true);
    const flows: number[] = [];
    t.onFlow((_c, a) => flows.push(a));
    expect(t.spend(5_000_000, 'buildings')).toBe(true);
    t.charge(300, 'upkeepRoads');
    expect(t.storedBalance).toBe(1000);
    expect(flows).toEqual([-5_000_000, -300]);
  });

  it('unlocks every tile, zone, road type and building', () => {
    const { city, sim } = sandboxCity();
    expect(city.world.unlock.unlockedCount()).toBe(16);
    expect(city.unlockLevel).toBe(Infinity);
    expect(sim.isZoneUnlocked(ZoneType.Industrial)).toBe(true);
    expect(city.economy.takeLoan('small')).toBeNull();
  });

  it('survives a save round trip', () => {
    const { city, sim, scheduler } = sandboxCity();
    const data: CitySaveData = {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      appVersion: 'test',
      cityId: 'sb',
      name: 'Sandbox',
      seed: 4242,
      savedAt: 1,
      clock: { tick: scheduler.tick, gameMinutes: scheduler.gameMinutes, speed: 1, paused: false },
      camera: null,
      city: serializeCity(city, sim),
      achievements: { earned: [] },
      history: { samples: [] },
    };
    const json = JSON.parse(JSON.stringify(data));
    const valid = validateSave(json).data;
    expect(valid.city.sandbox).toBe(true);
    expect(Number.isFinite(valid.city.treasury.balance)).toBe(true);
    expect(makeMeta(valid, 'x', 'manual', '').sandbox).toBe(true);

    const loaded = new City(new World(worldData));
    const lsim = new CitySimulation(loaded, 1, { onStats: () => {}, onMilestone: () => {} });
    restoreCity(loaded, lsim, valid.city, 0, 0);
    expect(loaded.sandbox).toBe(true);
    expect(loaded.treasury.balance).toBe(Infinity);
  });
});
