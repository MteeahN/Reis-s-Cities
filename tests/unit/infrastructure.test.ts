import { describe, expect, it } from 'vitest';
import { GRID_CELLS } from '../../src/game/core/config';
import { getBuilding } from '../../src/game/data/buildings';
import { PIPE_SERVICE_RADIUS } from '../../src/game/data/infrastructure';
import { planBuilding, type PlacementWorld } from '../../src/game/entities/building/BuildingPlacement';
import type { PlacedBuilding } from '../../src/game/entities/building/BuildingRegistry';
import { UtilityLines } from '../../src/game/entities/infra/UtilityLines';
import { Population, residentsOf } from '../../src/game/simulation/Population';
import { ServiceCoverage } from '../../src/game/simulation/Services';
import { computeUtilities, labelComponents, pipeReach } from '../../src/game/simulation/Utilities';
import { buildTown, placeNearRoad } from './helpers/town';

const N = GRID_CELLS;
const K = (i: number, j: number) => j * N + i;

let nextId = 1;
function mk(defId: string, i: number, j: number, state: PlacedBuilding['state'] = 'active', zone = 0): PlacedBuilding {
  const def = getBuilding(defId);
  const [w, d] = def.footprint;
  const cells: number[] = [];
  for (let y = j; y < j + d; y++) for (let x = i; x < i + w; x++) cells.push(K(x, y));
  return {
    id: nextId++, defId, i, j, rot: 0, w, d, baseY: 0, minY: 0, cost: 0, cells, zone: zone as 0, level: 1, state,
    progress: 1, occupants: 0, tint: 0, sinceTick: 0, noAccessTicks: 0, abandonedTicks: 0, noUtilityTicks: 0, burnTicks: 0,
  };
}

const empty = () => new Uint16Array(N * N);
const line = (cells: Uint16Array, i0: number, i1: number, j: number) => {
  for (let i = i0; i <= i1; i++) cells[K(i, j)] = 1;
};

describe('graph helpers', () => {
  it('labels connected components', () => {
    const m = new Uint8Array(N * N);
    m[K(1, 1)] = m[K(2, 1)] = 1;
    m[K(10, 10)] = 1;
    const r = labelComponents(m);
    expect(r.count).toBe(2);
    expect(r.ids[K(1, 1)]).toBe(r.ids[K(2, 1)]);
    expect(r.ids[K(10, 10)]).not.toBe(r.ids[K(1, 1)]);
  });

  it('measures Chebyshev reach from pipes', () => {
    const ids = new Int32Array(N * N).fill(-1);
    ids[K(50, 50)] = 0;
    const r = pipeReach(ids, 3);
    expect(r.dist[K(53, 52)]).toBe(3);
    expect(r.dist[K(54, 50)]).toBe(255);
  });
});

describe('computeUtilities — electricity', () => {
  it('neighbouring buildings conduct power from a plant; a distant one needs a power line', () => {
    const turbine = mk('wind_turbine', 10, 10);
    const near = mk('res1_house_a', 12, 10); // 1-cell gap: halos touch
    const far = mk('res1_house_a', 40, 10);
    const r = computeUtilities([turbine, near, far], empty(), empty());
    expect(r.power.has(near.id)).toBe(true);
    expect(r.power.has(far.id)).toBe(false);
    const lines = empty();
    line(lines, 12, 40, 10);
    const r2 = computeUtilities([turbine, near, far], lines, empty());
    expect(r2.power.has(far.id)).toBe(true);
    expect(r2.stats.powerServed).toBe(getBuilding('res1_house_a').electricity * 2);
  });

  it('serves consumers only up to the plant output', () => {
    const turbine = mk('wind_turbine', 10, 10);
    const houses = Array.from({ length: 400 }, (_, k) => mk('res3_tower_l', 12 + (k % 20) * 2, 12 + Math.floor(k / 20) * 2));
    const r = computeUtilities([turbine, ...houses], empty(), empty());
    expect(r.stats.powerDemand).toBeGreaterThan(r.stats.powerProduced);
    expect(r.power.size).toBeGreaterThan(0);
    expect(r.power.size).toBeLessThan(houses.length);
    expect(r.stats.powerServed).toBeLessThanOrEqual(getBuilding('wind_turbine').utility!.power!);
  });

  it('abandoned and unfinished buildings neither consume nor produce', () => {
    const turbine = mk('wind_turbine', 10, 10, 'construction');
    const house = mk('res1_house_a', 11, 10);
    expect(computeUtilities([turbine, house], empty(), empty()).power.has(house.id)).toBe(false);
  });
});

describe('computeUtilities — water and sewage', () => {
  it('pipes serve buildings within range once a source is connected', () => {
    const pipes = empty();
    line(pipes, 20, 60, 30);
    const tower = mk('water_tower', 18, 31); // within 2 cells of the pipe end
    const near = mk('res1_house_a', 40, 30 + PIPE_SERVICE_RADIUS);
    const tooFar = mk('res1_house_a', 40, 30 + PIPE_SERVICE_RADIUS + 2);
    const r = computeUtilities([tower, near, tooFar], empty(), pipes);
    expect(r.water.has(near.id)).toBe(true);
    expect(r.water.has(tooFar.id)).toBe(false);
    expect(r.sewage.has(near.id)).toBe(false); // no outlet yet
    const outlet = mk('sewage_outlet', 61, 31);
    const r2 = computeUtilities([tower, near, outlet], empty(), pipes);
    expect(r2.sewage.has(near.id)).toBe(true);
    expect(r2.stats.sewageCapacity).toBe(getBuilding('sewage_outlet').utility!.sewage);
  });

  it('a pump that is not near any pipe supplies nobody', () => {
    const pipes = empty();
    line(pipes, 20, 60, 30);
    const tower = mk('water_tower', 18, 40);
    const house = mk('res1_house_a', 40, 31);
    const r = computeUtilities([tower, house], empty(), pipes);
    expect(r.stats.waterProduced).toBeGreaterThan(0);
    expect(r.water.has(house.id)).toBe(false);
  });
});

describe('ServiceCoverage', () => {
  it('covers cells around a station and weakens when overloaded', () => {
    const svc = new ServiceCoverage();
    const station = mk('police_station', 100, 100);
    const home = mk('res1_house_a', 104, 100, 'active', 1);
    const pop = new Population();
    pop.moveIn(home.id, 4);
    svc.recompute([station, home], pop.households, 0, 1);
    expect(svc.fields.police[K(101, 101)]).toBeCloseTo(1);
    expect(svc.fields.police[K(200, 200)]).toBe(0);
    // Crime is lower under police coverage.
    expect(svc.crime[K(101, 101)]).toBeLessThan(svc.crime[K(200, 200)]);
    // Far more residents than capacity → reduced strength.
    pop.moveIn(home.id, 10_000);
    svc.recompute([station, home], pop.households, 0, 1);
    expect(svc.fields.police[K(101, 101)]).toBeLessThan(0.5);
  });

  it('schools count children, high schools count teenagers', () => {
    const svc = new ServiceCoverage();
    const school = mk('school', 100, 100);
    const home = mk('res1_house_a', 104, 100, 'active', 1);
    const pop = new Population();
    pop.moveIn(home.id, 10);
    svc.recompute([school, home], pop.households, 0, 1);
    expect(svc.loads.get(school.id)!.served).toBeCloseTo(pop.get(home.id).ages[0]);
  });
});

describe('Population education from schools', () => {
  it('teenagers graduate as their schools allow', () => {
    const p = new Population();
    p.moveIn(1, 100);
    p.moveIn(2, 100);
    const start = [...p.get(1).edu];
    for (let d = 0; d < 20; d++) {
      p.age(1, () => 1000, (id) => (id === 1 ? [0, 0.2, 0.8] : [1, 0, 0]));
    }
    expect(p.get(1).edu[2] - start[2]).toBeGreaterThan(p.get(2).edu[2] - start[2] + 5);
    expect(p.get(2).edu[0]).toBeGreaterThan(p.get(1).edu[0]);
    expect(residentsOf(p.get(1))).toBeGreaterThan(0);
  });

  it('poor health raises senior deaths', () => {
    const run = (health: number) => {
      const p = new Population();
      p.moveIn(1, 100);
      p.get(1).health = health;
      for (let d = 0; d < 10; d++) p.age(1, () => 100);
      return p.today.deaths;
    };
    expect(run(10)).toBeGreaterThan(run(95) * 1.5);
  });
});

describe('placement and lines', () => {
  const world = (water: (i: number, j: number) => boolean): PlacementWorld => ({
    vertexHeight: () => 10,
    isCellUnlocked: () => true,
    isWater: water,
    hasRoad: (_i, j) => j === 103,
    buildingAt: () => 0,
  });

  it('pumps and outlets must be on a shore', () => {
    const pump = getBuilding('water_pump');
    expect(planBuilding(pump, 100, 101, 0, world(() => false), 1e6, 0).errors).toContain('Nehir veya göl kıyısına kurulmalı');
    expect(planBuilding(pump, 100, 101, 0, world((i) => i === 98), 1e6, 0).valid).toBe(true);
  });

  it('utility lines track their cells with reference counting', () => {
    const l = new UtilityLines('power');
    const a = l.add({ x: 100, z: 100 }, { x: 300, z: 100 }, 800);
    const b = l.add({ x: 200, z: 20 }, { x: 200, z: 200 }, 720);
    expect(l.has(25, 12)).toBe(true);
    l.remove(a.id);
    expect(l.has(25, 12)).toBe(true); // still crossed by b
    l.remove(b.id);
    expect(l.has(25, 12)).toBe(false);
    expect(l.nearest(150, 101, 4)).toBeNull();
  });

  it('a diagonal line forms one connected network', () => {
    for (const end of [{ x: 600, z: 340 }, { x: 600, z: 600 }, { x: 330, z: 700 }]) {
      const l = new UtilityLines('pipe');
      l.add({ x: 100, z: 100 }, end, 0);
      const mask = new Uint8Array(N * N);
      for (let k = 0; k < mask.length; k++) mask[k] = l.cells[k] > 0 ? 1 : 0;
      expect(labelComponents(mask).count).toBe(1);
    }
  });
});

describe('Infrastructure in the city', () => {
  it('lines cost money, refund half, and buildings unlock with population', () => {
    const { city, road } = buildTown({ utilities: false });
    const before = city.treasury.balance;
    const plan = city.planLine('power', road.a, road.b);
    expect(plan.valid).toBe(true);
    expect(city.buildLine(plan)).toBe(true);
    expect(city.treasury.balance).toBeCloseTo(before - plan.cost);
    const id = [...city.powerLines.lines.keys()][0];
    expect(city.demolishLine('power', id)).toBe(Math.round(plan.cost / 2));
    expect(placeNearRoad(city, 'hospital')).toBe(false); // locked below 1,000
    city.maxPopulation = 1000;
    expect(placeNearRoad(city, 'hospital')).toBe(true);
  }, 60_000);

  it('a fire is put out under fire-station coverage and destroys an uncovered building', () => {
    const t = buildTown();
    t.run(2500);
    const { city } = t;
    const homes = [...city.buildings.items.values()].filter((b) => b.zone === 1 && b.state === 'active');
    expect(homes.length).toBeGreaterThan(2);
    const victim = homes[0];
    city.buildings.replace(victim.id, { state: 'burning' });
    t.run(400);
    expect(city.buildings.items.has(victim.id)).toBe(false); // burned down

    city.maxPopulation = 1000;
    expect(placeNearRoad(city, 'fire_station')).toBe(true);
    t.run(200); // station becomes active coverage on the next slow step
    const covered = [...city.buildings.items.values()].find((b) => b.zone === 1 && b.state === 'active' && city.services.average('fire', b.cells) >= 0.3)!;
    expect(covered).toBeDefined();
    city.buildings.replace(covered.id, { state: 'burning' });
    t.run(400);
    expect(city.buildings.items.get(covered.id)?.state).toBe('active');
  }, 60_000);

  it('upkeep for power, water and services shows up in the budget', () => {
    const t = buildTown();
    t.city.maxPopulation = 1000;
    placeNearRoad(t.city, 'police_station');
    t.run(300);
    const r = t.city.economy.rates;
    expect(r.upkeepPower).toBeGreaterThan(0);
    expect(r.upkeepWater).toBeGreaterThan(0);
    expect(r.upkeepServices).toBeCloseTo(getBuilding('police_station').maintenance / 7, 1);
  }, 60_000);
});
