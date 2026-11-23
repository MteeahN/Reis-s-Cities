import { describe, expect, it } from 'vitest';
import { GRID_CELLS } from '../../src/game/core/config';
import { getBuilding, ZONED_BUILDINGS, zonedTemplates } from '../../src/game/data/buildings';
import { ZoneType } from '../../src/game/data/zones';
import { CitySimulation, MILESTONES } from '../../src/game/simulation/CitySimulation';
import { targetDemand, smoothDemand } from '../../src/game/simulation/Demand';
import { LandValueMap } from '../../src/game/simulation/LandValue';
import { findLot, lotAnchor, roadFacings, type LotWorld } from '../../src/game/simulation/LotFinder';
import { Population, residentsOf } from '../../src/game/simulation/Population';
import { City } from '../../src/game/systems/City';
import { ZoneMap } from '../../src/game/world/ZoneMap';
import { IndexedSet } from '../../src/utils/IndexedSet';
import { buildTown } from './helpers/town';

const N = GRID_CELLS;
const K = (i: number, j: number) => j * N + i;

describe('IndexedSet', () => {
  it('adds, removes and picks', () => {
    const s = new IndexedSet();
    [5, 7, 9].forEach((v) => s.add(v));
    s.add(7);
    expect(s.size).toBe(3);
    s.delete(5);
    expect(s.has(5)).toBe(false);
    expect([7, 9]).toContain(s.pick(() => 0.99));
  });
});

describe('ZoneMap', () => {
  it('makes land near roads zoneable and indexes empty zoned cells', () => {
    const z = new ZoneMap();
    z.addEdge(1, [{ x: 400, z: 404 }, { x: 600, z: 404 }], 8);
    expect(z.isZoneable(60, 50)).toBe(true);
    expect(z.isZoneable(60, 54)).toBe(true); // 4th cell beside the road
    expect(z.isZoneable(60, 56)).toBe(false);
    z.set([K(60, 51), K(61, 51)], ZoneType.Residential, () => true);
    expect(z.get(60, 51)).toBe(ZoneType.Residential);
    expect(z.empty[ZoneType.Residential].size).toBe(2);
    z.refresh(K(60, 51), false);
    expect(z.empty[ZoneType.Residential].size).toBe(1);
    const lost = z.removeEdge(1);
    expect(lost).toContain(K(61, 51));
  });
});

describe('building templates', () => {
  it('every zone has level 1–3 templates and each level-1/2 footprint can grow', () => {
    for (const zone of [ZoneType.Residential, ZoneType.Commercial, ZoneType.Industrial]) {
      for (const level of [1, 2, 3]) expect(zonedTemplates(zone, level).length).toBeGreaterThan(0);
      for (const t of [...zonedTemplates(zone, 1), ...zonedTemplates(zone, 2)]) {
        expect(zonedTemplates(zone, (t.level ?? 1) + 1, t.footprint).length).toBeGreaterThan(0);
      }
    }
  });

  it('homes have residents, workplaces have jobs, industry pollutes', () => {
    for (const b of ZONED_BUILDINGS) {
      if (b.zone === ZoneType.Residential) expect(b.residents).toBeGreaterThan(0);
      else expect(b.workers).toBeGreaterThan(0);
      if (b.zone === ZoneType.Industrial) expect(b.pollution).toBeGreaterThan(0);
      expect(b.model.length).toBeGreaterThan(1);
    }
    expect(getBuilding('res3_tower_l').residents).toBeGreaterThan(getBuilding('res1_house_d').residents);
  });
});

describe('LotFinder', () => {
  // Road along row 50; residential zone on rows 51–54, columns 40–60.
  const world = (over: Partial<LotWorld> = {}): LotWorld => ({
    zoneAt: (i, j) => (j >= 51 && j <= 54 && i >= 40 && i <= 60 ? ZoneType.Residential : 0),
    hasRoad: (_i, j) => j === 50,
    buildingAt: () => 0,
    isBuildable: () => true,
    vertexHeight: () => 10,
    ...over,
  });

  it('detects which side the road is on', () => {
    expect(roadFacings(45, 51, world())).toEqual([2]);
    expect(roadFacings(45, 49, world())).toEqual([0]);
  });

  it('anchors lots so the front row holds the seed cell', () => {
    expect(lotAnchor(10, 10, 2, 2, 2, 0)).toEqual({ i: 10, j: 10 });
    expect(lotAnchor(10, 10, 2, 2, 0, 1)).toEqual({ i: 9, j: 9 });
    expect(lotAnchor(10, 10, 1, 2, 1, 0)).toEqual({ i: 9, j: 10 });
  });

  it('fits a template facing the road inside the zone', () => {
    const lot = findLot(45, 51, ZoneType.Residential, 1, () => 0.3, world())!;
    expect(lot).not.toBeNull();
    expect(lot.rot).toBe(2);
    expect(lot.j).toBe(51);
    expect(lot.def.zone).toBe(ZoneType.Residential);
    for (let dj = 0; dj < lot.d; dj++) for (let di = 0; di < lot.w; di++) expect(world().zoneAt(lot.i + di, lot.j + dj)).toBe(ZoneType.Residential);
  });

  it('refuses cells without road frontage, other zones, buildings or steep ground', () => {
    expect(findLot(45, 53, ZoneType.Residential, 1, Math.random, world())).toBeNull();
    expect(findLot(45, 51, ZoneType.Commercial, 1, Math.random, world())).toBeNull();
    expect(findLot(45, 51, ZoneType.Residential, 1, Math.random, world({ buildingAt: () => 3 }))).toBeNull();
    expect(findLot(45, 51, ZoneType.Residential, 1, Math.random, world({ vertexHeight: (i) => i * 5 }))).toBeNull();
  });
});

describe('Demand', () => {
  const base = { population: 0, labor: 0, housingCapacity: 0, commercialJobs: 0, industrialJobs: 0, totalJobs: 0, commercialUnlocked: true, industrialUnlocked: true };

  it('a new town wants housing but no locked zones', () => {
    const d = targetDemand({ ...base, commercialUnlocked: false, industrialUnlocked: false });
    expect(d.residential).toBeGreaterThan(60);
    expect(d.commercial).toBe(0);
    expect(d.industrial).toBe(0);
  });

  it('empty homes lower residential demand; residents raise commercial demand', () => {
    const full = targetDemand({ ...base, population: 500, labor: 300, housingCapacity: 500, totalJobs: 300 });
    const empty = targetDemand({ ...base, population: 500, labor: 300, housingCapacity: 1500, totalJobs: 300 });
    expect(empty.residential).toBeLessThan(full.residential);
    expect(full.commercial).toBeGreaterThan(50);
    const served = targetDemand({ ...base, population: 500, labor: 300, housingCapacity: 500, totalJobs: 300, commercialJobs: 200 });
    expect(served.commercial).toBeLessThan(full.commercial);
  });

  it('smooths toward the target', () => {
    const s = smoothDemand({ residential: 0, commercial: 0, industrial: 0 }, { residential: 100, commercial: 50, industrial: 0 }, 0.5);
    expect(s.residential).toBe(50);
  });
});

describe('Population cohorts', () => {
  it('immigrants arrive with the age/education mix, are capped by capacity and can leave', () => {
    const p = new Population();
    p.moveIn(1, 10);
    const h = p.get(1);
    expect(residentsOf(h)).toBeCloseTo(10);
    expect(h.ages[2]).toBeCloseTo(6);
    for (let d = 0; d < 50; d++) p.age(1, () => 10);
    expect(residentsOf(p.get(1))).toBeLessThanOrEqual(10.01);
    p.moveOut(1, 4);
    expect(residentsOf(p.get(1))).toBeLessThan(7);
    expect(p.evict(1)).toBeGreaterThan(0);
    expect(p.households.size).toBe(0);
  });
});

describe('LandValueMap', () => {
  it('landmarks raise value and industry pollutes nearby land', () => {
    const lv = new LandValueMap(new Uint8Array(N * N));
    const base = (id: number, defId: string, i: number, j: number, zone = 0) => ({
      id, defId, i, j, rot: 0 as const, w: 1, d: 1, baseY: 0, minY: 0, cost: 0, cells: [K(i, j)], zone: zone as 0, level: 1,
      state: 'active' as const, progress: 1, occupants: 0, tint: 0, sinceTick: 0, noAccessTicks: 0, abandonedTicks: 0, noUtilityTicks: 0, burnTicks: 0,
    });
    lv.recompute([base(1, 'plaza', 50, 50), base(2, 'ind3_plant_l', 150, 150, 3)], () => true);
    expect(lv.valueAt(51, 50)).toBeGreaterThan(lv.valueAt(100, 100) + 15);
    expect(lv.pollutionAt(151, 150)).toBeGreaterThan(30);
    expect(lv.valueAt(151, 150)).toBeLessThan(lv.valueAt(100, 100));
  });
});

describe('CitySimulation.attractiveness', () => {
  it('happy cities with jobs attract more newcomers than unhappy or jobless ones', () => {
    const sim = new CitySimulation({} as City, 1, { onStats: () => {}, onMilestone: () => {} });
    const set = (happiness: number, rate: number) => {
      sim.stats = { happiness } as never;
      sim.employment = { ...sim.employment, rate };
    };
    set(75, 0.02);
    const good = sim.attractiveness(1000);
    set(30, 0.02);
    const unhappy = sim.attractiveness(1000);
    set(75, 0.5);
    const jobless = sim.attractiveness(1000);
    expect(good).toBeGreaterThan(0.8);
    expect(unhappy).toBeLessThan(good / 4);
    expect(jobless).toBeLessThan(good / 2);
    // A small town is forgiven for missing jobs.
    expect(sim.attractiveness(50)).toBeGreaterThan(jobless);
  });
});

describe('CitySimulation — full growth on a generated world', () => {
  it('zoned streets with power and water grow houses that people move into', () => {
    const t = buildTown();
    const { city, sim, milestones } = t;
    const edge = [...city.roads.edges.values()][0];
    expect(city.zones.countZoned()[1]).toBeGreaterThan(40);
    t.run(3000); // ~5 game hours

    const homes = [...city.buildings.items.values()].filter((b) => b.zone === ZoneType.Residential);
    expect(homes.length).toBeGreaterThan(5);
    expect(homes.some((b) => b.state === 'active')).toBe(true);
    for (const b of homes) for (const k of b.cells) expect(city.zones.zone[k]).toBe(ZoneType.Residential);
    expect(sim.stats!.total).toBeGreaterThan(20);
    expect(sim.stats!.housingCapacity).toBeGreaterThan(0);
    // No sewage and no local jobs yet: happiness settles near the emigration threshold, where arrivals and departures balance.
    expect(sim.stats!.happiness).toBeGreaterThan(28);
    expect(sim.stats!.problems.power).toBe(0);
    expect(sim.stats!.problems.water).toBe(0);
    expect(sim.stats!.problems.sewage).toBeGreaterThan(0);
    if (sim.maxPopulation >= 100) expect(milestones).toContain(MILESTONES[0].population);

    // Removing the road takes zoning away from empty lots and strands the houses.
    city.demolishRoad(edge.id);
    expect(city.zones.empty[ZoneType.Residential].size).toBe(0);
    t.run(3000);
    const left = [...city.buildings.items.values()].filter((b) => b.zone === ZoneType.Residential);
    expect(left.every((b) => b.state === 'abandoned') || left.length === 0).toBe(true);
  }, 60_000);

  it('without electricity and water residents are unhappy and the town stays empty', () => {
    const t = buildTown({ utilities: false });
    t.run(3000);
    expect(t.sim.stats!.problems.power).toBeGreaterThan(0);
    expect(t.sim.stats!.total).toBeLessThan(15);
  }, 60_000);
});