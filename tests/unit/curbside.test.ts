import { describe, expect, it } from 'vitest';
import { BUILDABLE_ROAD_TYPES, getRoadType } from '../../src/game/data/roads';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { RoadRenderer } from '../../src/game/rendering/roads/RoadRenderer';
import { StreetFurniture } from '../../src/game/rendering/StreetFurniture';
import { City } from '../../src/game/systems/City';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

describe('Curbside roads', () => {
  it('has a curbside tab with parking, tree walk and wide sidewalk roads whose lanes still fit', () => {
    const curb = BUILDABLE_ROAD_TYPES.filter((t) => t.category === 'curbside');
    expect(curb.length).toBeGreaterThanOrEqual(5);
    expect(curb.some((t) => (t.parking ?? 0) > 0)).toBe(true);
    expect(curb.some((t) => t.trees)).toBe(true);
    expect(curb.some((t) => t.sidewalk >= 4)).toBe(true);
    for (const t of curb) {
      const lane = (t.width - 2 * t.sidewalk - t.median - 2 * (t.parking ?? 0)) / t.lanes;
      expect(lane, t.id).toBeGreaterThanOrEqual(2.6);
    }
  });

  it('parks cars in the parking strips and plants trees along tree walks', () => {
    const g = new RoadGraph();
    const a = g.addNode(100, 100).id;
    const b = g.addNode(400, 100).id;
    const c = g.addNode(100, 300).id;
    const d = g.addNode(400, 300).id;
    g.addEdge(a, b, 'main_street', { x: 250, z: 100 }, 0);
    g.addEdge(c, d, 'tree_street', { x: 250, z: 300 }, 0);
    const rr = new RoadRenderer(g, () => 10);
    const f = new StreetFurniture(g, rr, () => 10);
    const { cars, trees } = f.layout();
    const t = getRoadType('main_street');
    const lane = t.width / 2 - t.sidewalk - t.parking! / 2;
    expect(cars.length).toBeGreaterThan(20);
    for (const car of cars) {
      expect(Math.abs(Math.abs(car.z - 100) - lane)).toBeLessThan(0.01);
      expect(Math.abs(car.dz)).toBeLessThan(1e-6);
    }
    // Both sides get cars, facing their side's traffic.
    expect(cars.some((car) => car.z > 100 && car.dx > 0)).toBe(true);
    expect(cars.some((car) => car.z < 100 && car.dx < 0)).toBe(true);
    const walk = getRoadType('tree_street').width / 2 - getRoadType('tree_street').sidewalk / 2;
    expect(trees.filter((tr) => Math.abs(Math.abs(tr.z - 300) - walk) < 0.01).length).toBeGreaterThan(10);
    rr.dispose();
    f.dispose();
  });

  it('keeps street lamps off the driving surface at a wide crossing', () => {
    const g = new RoadGraph();
    const n = (x: number, z: number) => g.addNode(x, z).id;
    const m = n(250, 250);
    for (const [x, z] of [[100, 250], [400, 250], [250, 100], [250, 400]]) {
      const o = n(x, z);
      g.addEdge(m, o, 'avenue', { x: (x + 250) / 2, z: (z + 250) / 2 }, 0);
    }
    const rr = new RoadRenderer(g, () => 10);
    const f = new StreetFurniture(g, rr, () => 10);
    const { lamps } = f.layout();
    expect(lamps.length).toBeGreaterThan(8);
    const half = getRoadType('avenue').width / 2 - getRoadType('avenue').sidewalk;
    for (const l of lamps) {
      // Outside both carriageways of the crossing.
      const onX = Math.abs(l.z - 250) < half;
      const onZ = Math.abs(l.x - 250) < half;
      expect(onX || onZ).toBe(false);
    }
    rr.dispose();
    f.dispose();
  });
});

describe('Buildings on sloping ground', () => {
  const city = new City(new World(generateWorld(12345)));
  it('low-rise buildings tilt with a gentle slope; tall ones stay upright, set into it down to the low corner', () => {
    let gentle = null as ReturnType<City['groundSeat']>;
    let tall = null as ReturnType<City['groundSeat']>;
    for (let j = 60; j < 200 && (!gentle || !tall); j += 3) {
      for (let i = 60; i < 200 && (!gentle || !tall); i += 3) {
        const g = city.groundSeat('res1_house_a', i, j, 1, 1);
        if (!gentle && g && Math.hypot(g.gx, g.gz) > 0.02 && Math.hypot(g.gx, g.gz) < 0.1) gentle = g;
        const t = city.groundSeat('off3_tower', i, j, 2, 2);
        const h = [city.placementWorld.vertexHeight(i, j), city.placementWorld.vertexHeight(i + 2, j), city.placementWorld.vertexHeight(i, j + 2), city.placementWorld.vertexHeight(i + 2, j + 2)];
        if (!tall && t && Math.max(...h) - Math.min(...h) > 0.5 && Math.max(...h) - Math.min(...h) < 2) {
          tall = t;
          // Upright, base at the lowest corner.
          expect(t.gx).toBe(0);
          expect(t.gz).toBe(0);
          expect(t.y).toBeCloseTo(Math.min(...h), 5);
        }
      }
    }
    expect(gentle).not.toBeNull();
    expect(tall).not.toBeNull();
  });
});
