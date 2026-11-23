import { describe, expect, it, vi } from 'vitest';
import { GRID_CELLS } from '../../src/game/core/config';
import { getBuilding } from '../../src/game/data/buildings';
import { LEDGER_HISTORY_DAYS, LOAN_OFFERS, MAX_LOANS, TAX, WAGE_BY_TIER } from '../../src/game/data/economy';
import { getRoadType } from '../../src/game/data/roads';
import { ZoneType } from '../../src/game/data/zones';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { targetDemand } from '../../src/game/simulation/Demand';
import { SimScheduler } from '../../src/game/simulation/SimScheduler';
import { allocateWorkforce, jobsByTier } from '../../src/game/simulation/Workforce';
import { City } from '../../src/game/systems/City';
import { Economy } from '../../src/game/systems/Economy';
import { Treasury } from '../../src/game/systems/Treasury';
import { commitRoad, planRoad } from '../../src/game/tools/placement/RoadPlanner';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

const rates = (over: Partial<Record<string, number>> = {}) => ({
  taxResidential: 0,
  taxCommercial: 0,
  taxIndustrial: 0,
  upkeepRoads: 0,
  upkeepBuildings: 0,
  ...over,
});

describe('Workforce', () => {
  it('fills each tier with its own education first, then with better-educated workers', () => {
    const r = allocateWorkforce([10, 10, 10], [{ id: 1, jobs: [20, 5, 5] }]);
    expect(r.filledByTier).toEqual([20, 5, 5]);
    expect(r.employed).toBe(30);
    expect(r.unemployedByEdu).toEqual([0, 0, 0]);
    // 10 uneducated + 5 basic + 5 higher took the 20 low-skill jobs.
    expect(r.employedByEdu).toEqual([10, 10, 10]);
  });

  it('never places workers above their education', () => {
    const r = allocateWorkforce([50, 0, 0], [{ id: 1, jobs: [0, 0, 20] }]);
    expect(r.employed).toBe(0);
    expect(r.vacancies).toEqual([0, 0, 20]);
    expect(r.unemployedByEdu[0]).toBe(50);
  });

  it('shares a tier proportionally between workplaces and computes the wage bill', () => {
    const r = allocateWorkforce([10, 0, 0], [
      { id: 1, jobs: [10, 0, 0] },
      { id: 2, jobs: [10, 0, 0] },
    ]);
    expect(r.filled.get(1)).toBeCloseTo(5);
    expect(r.filled.get(2)).toBeCloseTo(5);
    expect(r.wageBill).toBeCloseTo(10 * WAGE_BY_TIER[0]);
  });

  it('derives job tiers from category and level', () => {
    const office = getBuilding('com3_office_m');
    const tiers = jobsByTier(office, 3);
    expect(tiers[0] + tiers[1] + tiers[2]).toBeCloseTo(office.workers);
    expect(tiers[2]).toBeGreaterThan(tiers[0]);
    const factory = jobsByTier(getBuilding('ind1_depot'), 1);
    expect(factory[0]).toBeGreaterThan(factory[2]);
  });
});

describe('Treasury', () => {
  it('construction needs funds but upkeep can push the balance negative', () => {
    const t = new Treasury(100);
    expect(t.spend(150, 'roads')).toBe(false);
    t.charge(150, 'upkeepRoads');
    expect(t.balance).toBe(-50);
    t.credit(80, 'taxResidential');
    expect(t.balance).toBe(30);
  });

  it('reports every flow with its sign', () => {
    const t = new Treasury(0);
    const flows: [string, number][] = [];
    t.onFlow((c, a) => flows.push([c, a]));
    t.credit(10, 'taxCommercial');
    t.charge(4, 'upkeepBuildings');
    expect(flows).toEqual([
      ['taxCommercial', 10],
      ['upkeepBuildings', -4],
    ]);
  });
});

describe('Economy', () => {
  it('applies daily rates proportionally and records them in the ledger', () => {
    const t = new Treasury(1000);
    const e = new Economy(t);
    e.apply(rates({ taxResidential: 240, upkeepRoads: 48 }), 0.5);
    expect(t.balance).toBeCloseTo(1000 + 120 - 24);
    expect(e.today.lines.taxResidential).toBeCloseTo(120);
    expect(e.today.lines.upkeepRoads).toBeCloseTo(-24);
    expect(e.today.net).toBeCloseTo(96);
    expect(e.projectedDailyNet()).toBeCloseTo(192);
  });

  it('keeps a bounded day history', () => {
    const e = new Economy(new Treasury(0));
    for (let d = 1; d <= LEDGER_HISTORY_DAYS + 5; d++) e.rollDay(d);
    expect(e.history).toHaveLength(LEDGER_HISTORY_DAYS);
  });

  it('clamps tax rates and reports pressure relative to neutral', () => {
    const e = new Economy(new Treasury(0));
    e.setTax('residential', 99);
    expect(e.taxRates.residential).toBe(TAX.max);
    e.setTax('commercial', 4);
    expect(e.taxPressure('commercial')).toBe(4 - TAX.neutral);
  });

  it('loans add money now and are repaid with interest over their term', () => {
    const t = new Treasury(0);
    const e = new Economy(t);
    const offer = LOAN_OFFERS[0];
    const loan = e.takeLoan(offer.id)!;
    expect(t.balance).toBe(offer.amount);
    for (let d = 0; d < offer.days; d++) e.apply(rates(), 1);
    expect(e.loans).toHaveLength(0);
    expect(t.balance).toBeCloseTo(offer.amount - offer.amount * (1 + offer.interest), 0);
    void loan;
    for (let k = 0; k < MAX_LOANS; k++) e.takeLoan(offer.id);
    expect(e.takeLoan(offer.id)).toBeNull();
  });

  it('repaying early needs the funds', () => {
    const t = new Treasury(0);
    const e = new Economy(t);
    const loan = e.takeLoan('small')!;
    expect(e.repayLoan(loan.id)).toBe(false); // owes principal + interest
    t.credit(10_000, 'taxResidential');
    expect(e.repayLoan(loan.id)).toBe(true);
    expect(e.loans).toHaveLength(0);
  });

  it('warns once when the city falls into debt', () => {
    const t = new Treasury(10);
    const e = new Economy(t);
    const fn = vi.fn();
    e.onNotice(fn);
    t.charge(50, 'upkeepRoads');
    t.charge(5, 'upkeepRoads');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(e.inDebt).toBe(true);
    e.rollDay(1);
    e.rollDay(2);
    e.rollDay(3);
    expect(e.daysInDebt).toBe(3);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('Taxes affect demand', () => {
  it('higher taxes lower the matching demand', () => {
    const base = { population: 500, labor: 300, housingCapacity: 520, commercialJobs: 40, industrialJobs: 60, totalJobs: 300, commercialUnlocked: true, industrialUnlocked: true };
    const neutral = targetDemand(base);
    const high = targetDemand({ ...base, taxPressure: { residential: 10, commercial: 10, industrial: 10 } });
    expect(high.residential).toBeLessThan(neutral.residential);
    expect(high.commercial).toBeLessThan(neutral.commercial);
    expect(high.industrial).toBeLessThan(neutral.industrial);
  });
});

describe('Economy in the full simulation', () => {
  function grow(residentialTax: number) {
    const world = new World(generateWorld(12345));
    const city = new City(world);
    for (let z = 960; z <= 1100; z += 24) {
      const plan = planRoad(city.roads, { kind: 'free', point: { x: 880, z } }, { kind: 'free', point: { x: 1160, z } }, null, getRoadType('street'), city.plannerWorld, 1e9);
      if (plan.valid) {
        city.buildRoad(plan);
        break;
      }
    }
    // A City Hall provides 30 jobs, so residents earn taxable wages.
    let hall = false;
    for (let k = 0; k < GRID_CELLS * GRID_CELLS && !hall; k++) {
      if (city.zones.zoneable[k] === 0) continue;
      for (const rot of [0, 1, 2, 3] as const) {
        const p = city.planBuilding('city_hall', k % GRID_CELLS, Math.floor(k / GRID_CELLS), rot);
        if (p.valid) {
          hall = city.placeBuilding(p) !== null;
          break;
        }
      }
    }
    expect(hall).toBe(true);
    const cells: number[] = [];
    for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) if (city.zones.zoneable[k] > 0) cells.push(k);
    city.setZone(cells, ZoneType.Residential);
    city.economy.setTax('residential', residentialTax);
    const sim = new CitySimulation(city, 1, { onStats: () => {}, onMilestone: () => {} });
    const s = new SimScheduler();
    sim.register(s);
    const balanceAfterRoad = city.treasury.balance;
    for (let i = 0; i < 4000; i++) s.advance(0.1);
    return { city, sim, balanceAfterRoad };
  }

  it('collects upkeep from day one and income tax from employed residents; high tax makes people unhappier', () => {
    const low = grow(5);
    const high = grow(25);
    const eco = low.city.economy;
    // Road and City Hall upkeep are charged, and logged in the ledger.
    expect(eco.rates.upkeepRoads).toBeGreaterThan(0);
    expect(eco.rates.upkeepBuildings).toBeCloseTo(getBuilding('city_hall').maintenance / 7);
    const days = [...eco.history, eco.today];
    expect(days.reduce((s, d) => s + (d.lines.upkeepRoads ?? 0), 0)).toBeLessThan(0);
    // Employed residents pay income tax; a higher rate collects more per worker.
    expect(low.sim.stats!.employed).toBeGreaterThan(0);
    expect(eco.rates.taxResidential).toBeGreaterThan(0);
    expect(days.reduce((s, d) => s + (d.lines.taxResidential ?? 0), 0)).toBeGreaterThan(0);
    const perWorker = (r: ReturnType<typeof grow>) => r.city.economy.rates.taxResidential / Math.max(1, r.sim.stats!.employed);
    expect(perWorker(high)).toBeGreaterThan(perWorker(low) * 3);
    // …but makes residents unhappier, so far fewer people move in.
    expect(high.sim.stats!.happiness).toBeLessThan(low.sim.stats!.happiness);
    // (Without utilities both towns stay tiny, so only the direction is compared.)
    expect(high.sim.stats!.total).toBeLessThan(low.sim.stats!.total);
  }, 90_000);
});

void commitRoad;
