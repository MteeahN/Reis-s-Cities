import { describe, expect, it } from 'vitest';
import { settlementOf } from '../../src/game/data/settlement';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { City } from '../../src/game/systems/City';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

describe('Settlement', () => {
  it('is named by the real population', () => {
    expect(settlementOf(0).name).toBe('Köy');
    expect(settlementOf(499).name).toBe('Köy');
    expect(settlementOf(500).name).toBe('Belde');
    expect(settlementOf(2500).name).toBe('Kasaba');
    expect(settlementOf(12000).name).toBe('Şehir');
    expect(settlementOf(60000).name).toBe('Büyükşehir');
    expect(settlementOf(1e6)).toEqual({ name: 'Metropol', next: null });
  });
});

describe('Upgrading now', () => {
  it('is refused for a building that does not exist', () => {
    const city = new City(new World(generateWorld(12345)));
    const s = new CitySimulation(city, 1, { onStats: () => {}, onMilestone: () => {} });
    expect(s.upgradeNow(12345)).toBe('Bina yok');
  });
});
