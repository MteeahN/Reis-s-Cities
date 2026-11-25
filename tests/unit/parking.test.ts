import { describe, expect, it } from 'vitest';
import { getBuilding } from '../../src/game/data/buildings';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { carShare, FAMILY_SIZE, homeCars, ParkingModel } from '../../src/game/simulation/Parking';

const hh = (adults: number, higher = 0) => ({ buildingId: 1, ages: [1, 1, adults, 0] as [number, number, number, number], edu: [adults - higher, 0, higher] as [number, number, number], happiness: 60, health: 70 });
const home = (id: number, defId: string, level = 1) => ({ id, defId, state: 'active', zone: 1, level, occupants: 10, i: 0, j: 0, w: 1, d: 1 });

describe('Car ownership', () => {
  it('families are residents / family size; wealthy families own far more cars than modest ones', () => {
    const modest = homeCars(getBuilding('res1_row'), home(1, 'res1_row') as never, hh(8) as never);
    const wealthy = homeCars(getBuilding('res1_house_d'), home(2, 'res1_house_d') as never, hh(8) as never);
    expect(modest.families).toBeCloseTo(10 / FAMILY_SIZE, 5);
    expect(wealthy.cars).toBeGreaterThan(modest.cars * 2.5);
    // Not every family has a car: ~1000 people (~435 families) in modest and middle homes own well under one each.
    expect(modest.cars / modest.families).toBeLessThan(0.5);
  });

  it('only as many commutes and shopping trips go by car as there are cars', () => {
    expect(carShare(2, 8, 4).work).toBeCloseTo(0.25);
    expect(carShare(10, 8, 4).work).toBe(1);
    expect(carShare(0, 8, 4)).toEqual({ work: 0, shop: 0 });
  });
});

describe('Parking', () => {
  function street(typeId: string) {
    const g = new RoadGraph();
    const a = g.addNode(0, 0).id;
    const b = g.addNode(200, 0).id;
    const e = g.addEdge(a, b, typeId, { x: 100, z: 0 }, 0);
    return { g, e };
  }
  const flats = (n: number) =>
    Array.from({ length: n }, (_, k) => ({ id: k + 1, defId: 'res2_apt_l', state: 'active', zone: 1, level: 2, occupants: 40, i: 0, j: 0, w: 2, d: 2 }));
  const pop = (n: number) => ({ households: new Map(Array.from({ length: n }, (_, k) => [k + 1, hh(30, 6)])) });

  it('streets with a parking lane take cars legally; without one the overflow parks illegally and police fine it', () => {
    const lane = street('parking_street');
    const plain = street('street');
    const run = (s: { g: RoadGraph; e: { id: number } }, police: number) => {
      const m = new ParkingModel(s.g);
      m.update(flats(6) as never, pop(6) as never, 0.9, 22, () => ({ edge: s.e.id }), () => police);
      return m;
    };
    const withLane = run(lane, 1);
    const p1 = withLane.edges.get(lane.e.id)!;
    expect(p1.laneSpaces).toBeGreaterThan(40);
    expect(p1.parked).toBeGreaterThan(0);
    const without = run(plain, 1);
    const p2 = without.edges.get(plain.e.id)!;
    expect(p2.publicSpaces).toBe(0);
    expect(p2.illegal).toBeGreaterThan(0);
    expect(without.stats.finesPerDay).toBeGreaterThan(0);
    // No police: no fines, the cars are still there.
    const unpoliced = run(plain, 0);
    expect(unpoliced.stats.finesPerDay).toBe(0);
    expect(unpoliced.stats.illegal).toBeCloseTo(without.stats.illegal);
    expect(withLane.stats.illegal).toBeLessThan(without.stats.illegal);
  });

  it('a parking garage on the street absorbs the overflow', () => {
    const s = street('street');
    const m = new ParkingModel(s.g);
    const garage = { id: 99, defId: 'parking_garage', state: 'active', zone: 0, level: 1, occupants: 7, i: 0, j: 0, w: 2, d: 2 };
    m.update([...flats(6), garage] as never, pop(6) as never, 0.9, 22, () => ({ edge: s.e.id }), () => 1);
    expect(m.edges.get(s.e.id)!.publicSpaces).toBe(160);
    expect(m.stats.illegal).toBe(0);
  });
});
