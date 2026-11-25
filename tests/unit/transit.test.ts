import { describe, expect, it } from 'vitest';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { BUS_PRICE, DEPOT_BUSES, STOP_COST, Transit } from '../../src/game/simulation/Transit';
import { getRoadType } from '../../src/game/data/roads';
import { restoreCity, serializeCity } from '../../src/game/save/CitySave';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { City } from '../../src/game/systems/City';
import { planRoad } from '../../src/game/tools/placement/RoadPlanner';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

/** A square loop of streets, `size` m a side. */
function loop(oneWay = false, size = 200): { g: RoadGraph; corners: number[] } {
  const g = new RoadGraph();
  const pts = [
    [0, 0],
    [size, 0],
    [size, size],
    [0, size],
  ];
  const corners = pts.map(([x, z]) => g.addNode(x, z).id);
  for (let k = 0; k < 4; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 4];
    const na = g.nodes.get(a)!;
    const nb = g.nodes.get(b)!;
    g.addEdge(a, b, oneWay ? 'oneway1' : 'street', { x: (na.x + nb.x) / 2, z: (na.z + nb.z) / 2 }, 0);
  }
  return { g, corners };
}

describe('Bus routes', () => {
  it('a line drives its stops in order and back to the first along the roads', () => {
    const { g } = loop();
    const t = new Transit(g);
    const a = t.addStop(100, 0);
    const b = t.addStop(200, 100);
    const line = t.addLine([a.id, b.id]);
    const r = t.route(line);
    expect(r.ok).toBe(true);
    // A → corner → B is 200 m, and back the shorter way round is another 200 m.
    expect(r.length).toBeCloseTo(400, 0);
  });

  it('one-way roads make the bus go the long way round', () => {
    const { g } = loop(true);
    const t = new Transit(g);
    const a = t.addStop(100, 0);
    const b = t.addStop(200, 100);
    // Forward a→b follows the one-way loop (200 m); returning must go on round (600 m).
    expect(t.route(t.addLine([a.id, b.id])).length).toBeCloseTo(800, 0);
  });

  it('removing a stop shortens its lines; a line under two stops closes', () => {
    const { g } = loop();
    const t = new Transit(g);
    const s = [t.addStop(100, 0), t.addStop(200, 100), t.addStop(100, 200)];
    const line = t.addLine(s.map((x) => x.id));
    t.removeStop(s[2].id);
    expect(t.lines.get(line.id)!.stops.length).toBe(2);
    t.removeStop(s[1].id);
    expect(t.lines.size).toBe(0);
  });
});

describe('Buses in the city', () => {
  const worldData = generateWorld(12345);
  const sim = (c: City) => new CitySimulation(c, 1, { onStats: () => {}, onMilestone: () => {} });

  it('stops and lines cost money, are undoable and saved', () => {
    const city = new City(new World(worldData));
    city.treasury.restore(1e7, city.treasury.spent, city.treasury.refunded);
    let built = false;
    for (let cx = 760; cx < 1300 && !built; cx += 40) {
      const plan = planRoad(city.roads, { kind: 'free', point: { x: cx, z: 900 } }, { kind: 'free', point: { x: cx + 300, z: 900 } }, null, getRoadType('city'), city.plannerWorld, 1e9);
      if (!plan.valid) continue;
      city.buildRoad(plan);
      built = true;
      const money = city.treasury.balance;
      const a = city.addBusStop(cx + 40, 902)!;
      const b = city.addBusStop(cx + 240, 902)!;
      expect(a).not.toBeNull();
      expect(city.treasury.balance).toBe(money - 2 * STOP_COST);
      expect(city.busStopError(cx + 50, 902)).toBe('Yakında başka bir durak var');
      // No depot yet: no buses.
      expect(city.createBusLine([a, b])).toBeNull();
      expect(city.busFleetError(1)).toMatch(/garaj/i);
      city.buildings.create({ defId: 'bus_depot', i: 0, j: 0, rot: 0, w: 3, d: 2, baseY: 0, minY: 0, cost: 0, zone: 0, level: 1, state: 'active', tint: 0, sinceTick: 0 } as never);
      expect(city.busDepotCapacity()).toBe(DEPOT_BUSES);
      const line = city.createBusLine([a, b])!;
      expect(city.treasury.balance).toBe(money - 2 * STOP_COST - BUS_PRICE);
      expect(city.setLineBuses(line, 3)).toBe(true);
      expect(city.transit.lines.get(line)!.buses).toBe(3);
      expect(city.transit.route(city.transit.lines.get(line)!).ok).toBe(true);

      const save = serializeCity(city, sim(city));
      const fresh = new City(new World(worldData));
      restoreCity(fresh, sim(fresh), JSON.parse(JSON.stringify(save)), 0, 0);
      expect(fresh.transit.lines.get(line)!.buses).toBe(3);
      expect(fresh.transit.stops.size).toBe(2);

      city.undoLast(); // buses
      expect(city.transit.lines.get(line)!.buses).toBe(1);
      city.undoLast(); // line
      expect(city.transit.lines.size).toBe(0);
    }
    expect(built).toBe(true);
  });
});

describe('Ridership', () => {
  it('homes near a line that reaches jobs send trips by bus, more with more buses, capped by capacity', () => {
    const { g } = loop();
    const t = new Transit(g);
    const a = t.addStop(100, 0);
    const b = t.addStop(100, 200);
    const line = t.addLine([a.id, b.id]);
    // A home by stop A (cell 12,1), a workplace by stop B (cell 12,24); a far-away home.
    const home = { id: 1, defId: 'res2_apt_m', state: 'active', i: 12, j: 1, w: 1, d: 2, zone: 1, occupants: 20 };
    const far = { id: 3, defId: 'res2_apt_m', state: 'active', i: 120, j: 120, w: 1, d: 2, zone: 1, occupants: 20 };
    const work = { id: 2, defId: 'com3_office_m', state: 'active', i: 12, j: 24, w: 1, d: 2, zone: 4, occupants: 60 };
    const pop = { households: new Map([[1, { ages: [2, 2, 16, 0] }], [3, { ages: [2, 2, 16, 0] }]]) };
    const depot = { id: 9, defId: 'bus_depot', state: 'active', i: 150, j: 150, w: 3, d: 2, zone: 0, occupants: 0 };
    const run = () => t.update([home, far, work, depot] as never, pop as never, 0.9);
    run();
    const one = t.shareOf(1).work;
    expect(one).toBeGreaterThan(0);
    expect(t.shareOf(3).work).toBe(0);
    expect(t.lineStats.get(line.id)!.riders).toBeGreaterThan(0);
    t.setBuses(line.id, 0);
    run();
    expect(t.shareOf(1).work).toBe(0);
    expect(t.ridersPerDay).toBe(0);
    t.setBuses(line.id, 4);
    run();
    expect(t.shareOf(1).work).toBeGreaterThanOrEqual(one);
    expect(t.lineStats.get(line.id)!.riders).toBeLessThanOrEqual(t.lineStats.get(line.id)!.capacity);
  });
});

describe('Depots, transfers and line editing', () => {
  const home = { id: 1, defId: 'res2_apt_m', state: 'active', i: 12, j: 1, w: 1, d: 2, zone: 1, occupants: 20 };
  const work = { id: 2, defId: 'com3_office_m', state: 'active', i: 24, j: 24, w: 1, d: 2, zone: 4, occupants: 60 };
  const depot = { id: 9, defId: 'bus_depot', state: 'active', i: 150, j: 150, w: 3, d: 2, zone: 0, occupants: 0 };
  const pop = { households: new Map([[1, { ages: [2, 2, 16, 0] }]]) };

  it('buses only run while depots house them', () => {
    const { g } = loop();
    const t = new Transit(g);
    const line = t.addLine([t.addStop(100, 0).id, t.addStop(100, 200).id]);
    t.setBuses(line.id, 3);
    t.update([home, work] as never, pop as never, 0.9);
    expect(t.lineStats.get(line.id)!.running).toBe(0);
    expect(t.ridersPerDay).toBe(0);
    t.update([home, work, depot] as never, pop as never, 0.9);
    expect(t.lineStats.get(line.id)!.running).toBe(3);
  });

  it('riders change lines at stops close together, reaching jobs the first line does not', () => {
    // A 1 km loop. Line A: by the home (south) to the east side; line B: east side to the north side by the far work.
    const { g } = loop(false, 1000);
    const t = new Transit(g);
    const h = { ...home, i: 62, j: 0 };
    const nearA = { ...work, id: 4, i: 122, j: 62 };
    const farWork = { ...work, i: 62, j: 123 };
    const all = [h, nearA, farWork, depot] as never;
    const a1 = t.addStop(500, 0);
    const a2 = t.addStop(1000, 500);
    const lineA = t.addLine([a1.id, a2.id]);
    t.update(all, pop as never, 0.9);
    const alone = t.shareOf(1).work;
    expect(alone).toBeGreaterThan(0);
    const b1 = t.addStop(1000, 520); // 20 m from a2
    const b2 = t.addStop(500, 1000);
    const lineB = t.addLine([b1.id, b2.id]);
    expect(t.connected(lineA.id).has(lineB.id)).toBe(true);
    t.update(all, pop as never, 0.9);
    expect(t.lineStats.get(lineA.id)!.transfers).toBe(1);
    expect(t.shareOf(1).work).toBeGreaterThan(alone);
    // Riders board by the home and, coming back, by the work.
    expect(t.stopRiders.get(a1.id) ?? 0).toBeGreaterThan(0);
    expect(t.stopRiders.get(b2.id) ?? 0).toBeGreaterThan(0);
  });

  it('a stop joins a line where it adds the least detour, and can be taken out again', () => {
    const { g } = loop();
    const t = new Transit(g);
    const s = [t.addStop(100, 0), t.addStop(200, 100), t.addStop(0, 100)];
    const line = t.addLine([s[0].id, s[1].id, s[2].id]);
    const extra = t.addStop(200, 190);
    const at = t.insertIndex(line, extra);
    expect(at).toBe(2); // between the east stop and the west stop
    expect(t.setLineStops(line.id, [s[0].id])).toBe(false);
    t.renameLine(line.id, '  Sahil  ');
    expect(t.lines.get(line.id)!.name).toBe('Sahil');
  });
});
