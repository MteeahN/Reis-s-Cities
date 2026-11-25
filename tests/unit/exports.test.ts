import { describe, expect, it } from 'vitest';
import { exportDef, Exports } from '../../src/game/systems/Exports';
import type { UtilityStats } from '../../src/game/simulation/Utilities';

const stats = (p: Partial<UtilityStats>): UtilityStats => ({
  powerProduced: 0, powerDemand: 0, powerServed: 0, waterProduced: 0, waterDemand: 0, waterServed: 0,
  sewageCapacity: 0, sewageDemand: 0, sewageServed: 0, powerNetworks: 0, waterNetworks: 0, ...p,
});

describe('Sales to neighbouring towns', () => {
  it('sells at most the real surplus, never what the city uses', () => {
    const e = new Exports();
    e.set('power', 5000);
    expect(e.offered.power).toBe(5000);
    // 3 000 kW unused: only that is sold.
    const s = stats({ powerProduced: 10000, powerServed: 7000 });
    expect(e.sold(s).power).toBe(3000);
    expect(e.income(s)).toBeCloseTo(3 * exportDef('power').pricePerThousand);
    // Demand grows past production: sales stop.
    expect(e.sold(stats({ powerProduced: 10000, powerServed: 10000 })).power).toBe(0);
  });

  it('offers are capped by what the neighbours take, stepped, and saved', () => {
    const e = new Exports();
    e.set('water', 1e9);
    expect(e.offered.water).toBe(exportDef('water').max);
    e.set('sewage', 149);
    expect(e.offered.sewage % exportDef('sewage').step).toBe(0);
    const f = new Exports();
    f.restore(JSON.parse(JSON.stringify(e.serialize())));
    expect(f.serialize()).toEqual(e.serialize());
  });
});
