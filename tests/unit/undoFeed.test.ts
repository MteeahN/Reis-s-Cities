import { describe, expect, it } from 'vitest';
import { getRoadType } from '../../src/game/data/roads';
import { ZoneType } from '../../src/game/data/zones';
import { buildEdgeMesh } from '../../src/game/rendering/roads/roadGeometry';
import { straightBezier } from '../../src/game/entities/road/curve';
import type { PopulationStats } from '../../src/game/simulation/CitySimulation';
import { CitizenFeed, type FeedContext } from '../../src/game/systems/CitizenFeed';
import { City } from '../../src/game/systems/City';
import { planRoad, type Anchor } from '../../src/game/tools/placement/RoadPlanner';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

const worldData = generateWorld(12345);

function newCity(): City {
  const city = new City(new World(worldData));
  city.treasury.restore(1e7, city.treasury.spent, city.treasury.refunded);
  return city;
}
const free = (x: number, z: number): Anchor => ({ kind: 'free', point: { x, z } });

/** A spot where two crossing streets can be built (owned, dry, gentle). */
function spot(): { cx: number; cz: number } {
  for (let cx = 700; cx < 1340; cx += 40) {
    for (let cz = 700; cz < 1340; cz += 40) {
      const c = newCity();
      const a = planRoad(c.roads, free(cx - 100, cz), free(cx + 100, cz), null, getRoadType('street'), c.plannerWorld, 1e9);
      if (!a.valid) continue;
      c.buildRoad(a);
      if (planRoad(c.roads, free(cx, cz - 100), free(cx, cz + 100), null, getRoadType('street'), c.plannerWorld, 1e9).valid) return { cx, cz };
    }
  }
  throw new Error('no spot');
}

describe('Undo / redo beyond buildings', () => {
  it('undoes and redoes building a road, with the money', () => {
    const { cx, cz } = spot();
    const city = newCity();
    const start = city.treasury.balance;
    const plan = planRoad(city.roads, free(cx - 100, cz), free(cx + 100, cz), null, getRoadType('street'), city.plannerWorld, 1e9);
    city.buildRoad(plan);
    expect(city.roads.edges.size).toBe(1);
    expect(city.treasury.balance).toBe(start - plan.cost);
    expect(city.undoLast()).toBeNull();
    expect(city.roads.edges.size).toBe(0);
    expect(city.treasury.balance).toBe(start);
    expect(city.redoLast()).toBeNull();
    expect(city.roads.edges.size).toBe(1);
    expect(city.treasury.balance).toBe(start - plan.cost);
  });

  it('undoing a crossing road merges the split road back; demolition and one-way are undoable too', () => {
    const { cx, cz } = spot();
    const city = newCity();
    city.buildRoad(planRoad(city.roads, free(cx - 100, cz), free(cx + 100, cz), null, getRoadType('street'), city.plannerWorld, 1e9));
    const first = [...city.roads.edges.keys()];
    city.buildRoad(planRoad(city.roads, free(cx, cz - 100), free(cx, cz + 100), null, getRoadType('street'), city.plannerWorld, 1e9));
    expect(city.roads.edges.size).toBe(4);
    city.undoLast();
    expect([...city.roads.edges.keys()]).toEqual(first);
    expect([...city.roads.nodes.values()].every((n) => n.edges.length === 1)).toBe(true);

    const id = first[0];
    const before = city.treasury.balance;
    const refund = city.demolishRoad(id);
    expect(city.roads.edges.size).toBe(0);
    expect(city.undoLast()).toBeNull();
    expect(city.roads.edges.has(id)).toBe(true);
    expect(city.treasury.balance).toBe(before);
    expect(refund).toBeGreaterThan(0);

    city.editRoads('Tek yön', () => city.roads.setOneWay(id, 1));
    expect(city.roads.direction(city.roads.edges.get(id)!)).toBe(1);
    city.undoLast();
    expect(city.roads.direction(city.roads.edges.get(id)!)).toBe(0);
  });

  it('a road does not come back through a building put up since', () => {
    const { cx, cz } = spot();
    const city = newCity();
    city.buildRoad(planRoad(city.roads, free(cx - 100, cz), free(cx + 100, cz), null, getRoadType('street'), city.plannerWorld, 1e9));
    city.undoLast();
    // A building on the old road's line.
    const i = Math.floor(cx / 8);
    const j = Math.floor(cz / 8);
    city.occupancy.setBuilding(999, [j * 256 + i]);
    expect(city.redoLast()).toBe('Yolun yerinde artık bir bina var');
    expect(city.roads.edges.size).toBe(0);
  });

  it('undoes zoning strokes and utility lines', () => {
    const { cx, cz } = spot();
    const city = newCity();
    city.buildRoad(planRoad(city.roads, free(cx - 100, cz), free(cx + 100, cz), null, getRoadType('street'), city.plannerWorld, 1e9));
    const cells: number[] = [];
    for (let k = 0; k < 256 * 256; k++) if (city.zones.zoneable[k]) cells.push(k);
    city.setZone(cells, ZoneType.Residential);
    expect(city.zones.countZoned()[ZoneType.Residential]).toBeGreaterThan(10);
    expect(city.undo.peekUndo()!.kind).toBe('zone');
    city.undoLast();
    expect(city.zones.countZoned()[ZoneType.Residential] ?? 0).toBe(0);
    city.redoLast();
    expect(city.zones.countZoned()[ZoneType.Residential]).toBeGreaterThan(10);

    const before = city.treasury.balance;
    expect(city.buildLine(city.planLine('power', { x: cx - 60, z: cz + 20 }, { x: cx + 60, z: cz + 20 }))).toBe(true);
    expect(city.powerLines.lines.size).toBe(1);
    city.undoLast();
    expect(city.powerLines.lines.size).toBe(0);
    expect(city.treasury.balance).toBe(before);
  });
});

describe('Road joints', () => {
  it('two roads of the same type meeting at a slight bend share their end edge (no gap)', () => {
    const h = () => 1;
    const m = { x: Math.cos(0.04), z: Math.sin(0.04) };
    const a = buildEdgeMesh(straightBezier({ x: 0, z: 0 }, { x: 50, z: 0 }), 8, 1, 1, h, 0.16, { sidewalk: 2, joinB: m });
    const b = buildEdgeMesh(straightBezier({ x: 50, z: 0 }, { x: 99.6, z: 4 }), 8, 1, 1, h, 0.16, { sidewalk: 2, joinA: m });
    const row = 14;
    const endA = a.positions.slice(a.positions.length - row * 3);
    const startB = b.positions.slice(0, row * 3);
    // The same 14 vertices, in the same order (both rows run left → right of the direction of travel).
    for (let k = 0; k < endA.length; k++) expect(startB[k]).toBeCloseTo(endA[k], 3);
  });
});

function stats(over: Partial<PopulationStats>): PopulationStats {
  return {
    total: 400,
    households: 100,
    ages: [0, 0, 0, 0],
    education: [0, 0, 0],
    labor: 200,
    employed: 190,
    unemployed: 10,
    unemploymentRate: 0.05,
    jobs: 200,
    jobsBySector: { commercial: 0, industrial: 0, office: 0, civic: 0 },
    income: { low: 0, mid: 0, high: 0 },
    happiness: 60,
    housingCapacity: 450,
    vacantHomes: 50,
    yesterday: { births: 0, deaths: 0, moveIns: 0, moveOuts: 0 },
    buildingsByZone: { residential: 0, commercial: 0, industrial: 0, office: 0 },
    underConstruction: 0,
    abandoned: 0,
    employedByEdu: [0, 0, 0],
    unemployedByEdu: [0, 0, 0],
    vacancies: [0, 0, 0],
    health: 70,
    crime: 10,
    coverage: { police: 1, fire: 1, health: 1, education: 1, highEducation: 1, garbage: 1 },
    utilities: {} as PopulationStats['utilities'],
    problems: { power: 0, water: 0, sewage: 0, garbage: 0, burning: 0 },
    noise: 10,
    traffic: { vehicles: 0, tripsPerHour: 0, congestion: 0, avgSpeedKmh: 0, congestedLength: 0, commuteMinutes: 10, unroutable: 0, worst: [] },
    happinessFactors: [],
    ...over,
  };
}

describe('Kent Sesi (citizens feed)', () => {
  const ctx = (minute: number, s: Partial<PopulationStats>): FeedContext => ({
    minute,
    stats: stats(s),
    demand: { residential: 0, commercial: 0, industrial: 0, office: 0 },
    taxRates: { residential: 9, commercial: 9, industrial: 9 },
    inDebt: false,
    spot: (t) => (t === 'power' ? { x: 10, z: 20 } : null),
  });

  it('posts only about what is really happening, repeats lasting problems, and thanks when solved', () => {
    const feed = new CitizenFeed(1);
    feed.skipMilestonesBelow(400);
    expect(feed.update(ctx(0, {})).map((p) => p.topic)).toEqual([]);
    const outage = feed.update(ctx(1000, { problems: { power: 7, water: 0, sewage: 0, garbage: 0, burning: 0 } }));
    expect(outage.map((p) => p.topic)).toEqual(['power']);
    expect(outage[0].kind).toBe('complaint');
    expect(outage[0].affected).toBe('7 bina elektriksiz');
    expect(outage[0].focus).toEqual({ x: 10, z: 20 });
    // Still out a day later: no repeat yet; three days later: a repeat.
    expect(feed.update(ctx(2440, { problems: { power: 7, water: 0, sewage: 0, garbage: 0, burning: 0 } }))).toEqual([]);
    expect(feed.update(ctx(1000 + 3 * 1440, { problems: { power: 3, water: 0, sewage: 0, garbage: 0, burning: 0 } })).length).toBe(1);
    const fixed = feed.update(ctx(1000 + 4 * 1440, {}));
    expect(fixed.map((p) => [p.topic, p.kind])).toEqual([['power', 'praise']]);
  });

  it('announces population milestones once', () => {
    const feed = new CitizenFeed(2);
    feed.skipMilestonesBelow(400);
    expect(feed.update(ctx(0, { total: 400 })).filter((p) => p.topic === 'milestone')).toEqual([]);
    const m = feed.update(ctx(10, { total: 520 })).filter((p) => p.topic === 'milestone');
    expect(m.length).toBe(1);
    expect(feed.update(ctx(20, { total: 530 })).filter((p) => p.topic === 'milestone')).toEqual([]);
  });
});
