import { describe, expect, it } from 'vitest';
import { GRID_CELLS } from '../../src/game/core/config';
import { getBuilding } from '../../src/game/data/buildings';
import type { PlacedBuilding } from '../../src/game/entities/building/BuildingRegistry';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { LandValueMap } from '../../src/game/simulation/LandValue';
import { Population } from '../../src/game/simulation/Population';
import { HOURLY, TrafficModel, hourShare } from '../../src/game/simulation/traffic/TrafficModel';
import { buildTown, placeNearRoad } from './helpers/town';

const N = GRID_CELLS;
let nextId = 1;
function mk(defId: string, i: number, j: number, zone: number, occupants = 0): PlacedBuilding {
  const def = getBuilding(defId);
  const [w, d] = def.footprint;
  const cells: number[] = [];
  for (let y = j; y < j + d; y++) for (let x = i; x < i + w; x++) cells.push(y * N + x);
  return {
    id: nextId++, defId, i, j, rot: 0, w, d, baseY: 0, minY: 0, cost: 0, cells, zone: zone as 0, level: 1, state: 'active',
    progress: 1, occupants, tint: 0, sinceTick: 0, noAccessTicks: 0, abandonedTicks: 0, noUtilityTicks: 0, burnTicks: 0,
  };
}

/**
 * Origin street (z = 400) → junction → two routes (north, shorter; south,
 * longer) → junction → destination street. A home sits on the origin street,
 * a workplace on the destination street (fronts face +z onto z = 400).
 */
function diamond() {
  const g = new RoadGraph();
  const n = (x: number, z: number) => g.addNode(x, z).id;
  const mid = (a: number, b: number) => {
    const A = g.nodes.get(a)!;
    const B = g.nodes.get(b)!;
    return { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
  };
  const e = (a: number, b: number, type = 'street') => g.addEdge(a, b, type, mid(a, b), 0).id;
  const n1 = n(40, 400);
  const n2 = n(200, 400);
  const n3 = n(300, 300);
  const n4 = n(400, 400);
  const n5 = n(300, 520);
  const n6 = n(560, 400);
  const origin = e(n1, n2);
  const north = [e(n2, n3), e(n3, n4)];
  const south = [e(n2, n5), e(n5, n4)];
  const dest = e(n4, n6);
  const home = mk('res1_house_a', 13, 49 - getBuilding('res1_house_a').footprint[1], 1);
  const hall = getBuilding('city_hall');
  const work = mk('city_hall', 60, 49 - hall.footprint[1], 0, 400);
  const pop = new Population();
  pop.moveIn(home.id, 4000);
  return { g, origin, north, south, dest, home, work, pop };
}

const flowOn = (m: TrafficModel, edge: number) => {
  const t = m.edgeTraffic(edge)!;
  return t.forward + t.backward;
};

describe('TrafficModel', () => {
  it('routes commuters along the road network to their workplace', () => {
    const d = diamond();
    const m = new TrafficModel(d.g);
    m.step([d.home, d.work], d.pop, 1, 8 * 60);
    expect(m.attach(d.home)?.edge).toBe(d.origin);
    expect(m.attach(d.work)?.edge).toBe(d.dest);
    expect(flowOn(m, d.dest)).toBeGreaterThan(0);
    expect(flowOn(m, d.north[0]) + flowOn(m, d.south[0])).toBeGreaterThan(0);
    expect(m.commute.get(d.home.id)).toBeGreaterThan(0);
    expect(m.stats.vehicles).toBeGreaterThan(0);
  });

  it('congestion pushes traffic onto the alternative route', () => {
    const d = diamond();
    const m = new TrafficModel(d.g);
    m.step([d.home, d.work], d.pop, 1, 8 * 60);
    // First assignment: everything on the shorter northern route.
    expect(flowOn(m, d.south[0])).toBe(0);
    for (let k = 0; k < 40; k++) m.step([d.home, d.work], d.pop, 1, 8 * 60);
    const north = flowOn(m, d.north[0]);
    const south = flowOn(m, d.south[0]);
    expect(north / (north + south)).toBeLessThan(0.75);
    expect(south / (north + south)).toBeGreaterThan(0.25);
    expect(m.edgeTraffic(d.north[0])!.ratio).toBeGreaterThan(1);
    expect(m.edgeTraffic(d.north[0])!.speedKmh).toBeLessThan(m.edgeTraffic(d.north[0])!.freeSpeedKmh);
  });

  it('rush hour carries far more traffic than the night', () => {
    expect(hourShare(HOURLY.work.out, 7.5 * 60)).toBeGreaterThan(hourShare(HOURLY.work.out, 3 * 60) * 10);
    const run = (minute: number) => {
      const d = diamond();
      const m = new TrafficModel(d.g);
      m.step([d.home, d.work], d.pop, 1, minute);
      return m.stats.tripsPerHour;
    };
    expect(run(8 * 60)).toBeGreaterThan(run(3 * 60) * 5);
  });

  it('vehicle paths follow connected links from origin to destination', () => {
    const d = diamond();
    const m = new TrafficModel(d.g);
    for (let k = 0; k < 10; k++) m.step([d.home, d.work], d.pop, 1, 8 * 60);
    let seed = 1;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 50; k++) {
      const p = m.samplePath(rand)!;
      expect(p).not.toBeNull();
      for (let i = 1; i < p.links.length; i++) expect(m.linkFrom[p.links[i]]).toBe(m.linkTo[p.links[i - 1]]);
      const ends = [m.linkEdge[p.links[0]], m.linkEdge[p.links[p.links.length - 1]]];
      expect(ends).toContain(d.origin);
      expect(ends).toContain(d.dest);
    }
  });

  it('one-way roads only carry traffic in their direction', () => {
    const g = new RoadGraph();
    const a = g.addNode(0, 0).id;
    const b = g.addNode(400, 0).id;
    const id = g.addEdge(a, b, 'highway', { x: 200, z: 0 }, 0).id;
    const m = new TrafficModel(g);
    m.step([], new Population(), 0, 0);
    const [f, r] = m.linksOf(id)!;
    expect(f).toBeGreaterThanOrEqual(0);
    expect(r).toBe(-1);
  });

  it('a disconnected workplace leaves commuters without a route', () => {
    const d = diamond();
    // Detach the destination street from the network.
    d.g.removeEdge(d.north[1]);
    d.g.removeEdge(d.south[1]);
    const m = new TrafficModel(d.g);
    m.step([d.home, d.work], d.pop, 1, 8 * 60);
    expect(m.commute.get(d.home.id)).toBe(Infinity);
    expect(m.stats.unroutable).toBeGreaterThan(0);
  });
});

describe('Traffic in the city', () => {
  it('commutes, noise and the happiness breakdown come from real traffic', () => {
    const t = buildTown();
    t.city.maxPopulation = 1000;
    expect(placeNearRoad(t.city, 'police_station')).toBe(true);
    t.run(3200); // 16:00 on day 2 (the clock starts at 08:00) — evening rush
    const s = t.sim.stats!;
    expect(s.total).toBeGreaterThan(20);
    expect(s.traffic.tripsPerHour).toBeGreaterThan(0);
    expect(s.traffic.commuteMinutes).toBeGreaterThan(0);
    const labels = s.happinessFactors.map((f) => f.label);
    expect(labels).toContain('İşe ulaşım');
    expect(labels).toContain('Gürültü');
    const sum = s.happinessFactors.reduce((a, f) => a + f.value, 0);
    expect(sum).toBeGreaterThan(0);
    expect(t.city.traffic.stats.vehicles).toBeGreaterThan(0);
  }, 60_000);
});

describe('Traffic noise and exhaust', () => {
  const run = (flow: number, ratio: number) => {
    const lv = new LandValueMap(new Uint8Array(N * N));
    const points = Array.from({ length: 41 }, (_, k) => ({ x: 400 + k * 5, z: 804 }));
    lv.recompute([], () => true, () => 0, [{ points, flow, ratio }]);
    const at = (i: number, j: number) => ({ noise: lv.noise[j * N + i], pollution: lv.pollution[j * N + i], value: lv.value[j * N + i] });
    return { road: at(62, 100), near: at(62, 102), far: at(62, 110) };
  };
  it('busy roads are loud next to them and quiet further away', () => {
    const r = run(800, 0.5);
    expect(r.road.noise).toBeGreaterThan(20);
    expect(r.near.noise).toBeGreaterThan(0);
    expect(r.near.noise).toBeLessThan(r.road.noise);
    expect(r.far.noise).toBe(0);
    expect(r.road.value).toBeLessThan(run(0, 0).road.value);
  });
  it('stop-and-go traffic pollutes more than free-flowing traffic', () => {
    expect(run(800, 1.4).road.pollution).toBeGreaterThan(run(800, 0.3).road.pollution);
  });
});

describe('Traffic performance', () => {
  it('routes a 20×20 grid with hundreds of origin groups quickly', () => {
    const g = new RoadGraph();
    const S = 20;
    const ids: number[][] = [];
    for (let y = 0; y < S; y++) {
      ids.push([]);
      for (let x = 0; x < S; x++) ids[y].push(g.addNode(100 + x * 90, 100 + y * 90).id);
    }
    const mid = (a: number, b: number) => {
      const A = g.nodes.get(a)!;
      const B = g.nodes.get(b)!;
      return { x: (A.x + B.x) / 2, z: (A.z + B.z) / 2 };
    };
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (x + 1 < S) g.addEdge(ids[y][x], ids[y][x + 1], 'city', mid(ids[y][x], ids[y][x + 1]), 0);
        if (y + 1 < S) g.addEdge(ids[y][x], ids[y + 1][x], 'city', mid(ids[y][x], ids[y + 1][x]), 0);
      }
    // A home and a workplace on every horizontal street (fronts face +z onto z = 100 + y·90).
    const pop = new Population();
    const buildings: PlacedBuilding[] = [];
    for (let y = 1; y < S; y++)
      for (let x = 0; x < S - 1; x++) {
        const zRow = Math.round((100 + y * 90) / 8) - 1;
        const i = Math.round((100 + x * 90 + 30) / 8);
        const home = mk('res1_house_a', i, zRow - getBuilding('res1_house_a').footprint[1] + 1, 1);
        pop.moveIn(home.id, 20);
        buildings.push(home, mk('city_hall', i + 4, zRow - getBuilding('city_hall').footprint[1] + 1, 0, 30));
      }
    const m = new TrafficModel(g);
    m.step(buildings, pop, 0.9, 8 * 60);
    // Best of 5: other test files run in parallel, so the fastest run is the fair measure.
    let ms = Infinity;
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now();
      m.step(buildings, pop, 0.9, 8 * 60);
      ms = Math.min(ms, performance.now() - t0);
    }
    expect(m.stats.tripsPerHour).toBeGreaterThan(0);
    expect(ms).toBeLessThan(250);
  });
});
