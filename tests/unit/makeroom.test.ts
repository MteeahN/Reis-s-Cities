import { describe, expect, it } from 'vitest';
import { CELL_SIZE, GRID_CELLS } from '../../src/game/core/config';
import { getRoadType } from '../../src/game/data/roads';
import { ZoneType } from '../../src/game/data/zones';
import { City } from '../../src/game/systems/City';
import { planRoad } from '../../src/game/tools/placement/RoadPlanner';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

const worldData = generateWorld(12345);

/** A long street on gentle land with a row of houses along its south side. */
function street(): { city: City; edgeId: number; z: number; houses: number[] } {
  for (let z = 760; z < 1300; z += 40) {
    const city = new City(new World(worldData));
    city.treasury.restore(1e7, city.treasury.spent, city.treasury.refunded);
    const plan = planRoad(city.roads, { kind: 'free', point: { x: 820, z } }, { kind: 'free', point: { x: 1100, z } }, null, getRoadType('street'), city.plannerWorld, 1e9);
    if (!plan.valid) continue;
    city.buildRoad(plan);
    const edgeId = [...city.roads.edges.keys()].at(-1)!;
    const houses: number[] = [];
    for (let x = 840; x < 1080; x += CELL_SIZE) {
      const i = Math.floor(x / CELL_SIZE);
      let j = Math.floor(z / CELL_SIZE);
      while (city.occupancy.road[j * GRID_CELLS + i] > 0) j++;
      const p = city.planBuilding('res1_house_a', i, j, 2);
      if (!p.valid) continue;
      const b = city.placeGrowable(p, 'modern', 0.3, 0);
      if (b) houses.push(b.id);
    }
    if (houses.length >= 6) return { city, edgeId, z, houses };
  }
  throw new Error('no street');
}

describe('Making room', () => {
  it('a service building placed over houses demolishes them (and says so in the plan)', () => {
    const { city, houses } = street();
    const h = city.buildings.items.get(houses[2])!;
    expect(city.planBuilding('garbage_depot', h.i, h.j, 2).valid).toBe(false);
    const plan = city.planBuilding('garbage_depot', h.i, h.j, 2, true);
    expect(plan.valid).toBe(true);
    expect(plan.bulldoze?.length).toBeGreaterThan(0);
    const b = city.placeBuilding(plan);
    expect(b).not.toBeNull();
    for (const id of plan.bulldoze!) expect(city.buildings.items.has(id)).toBe(false);
    for (const k of b!.cells) expect(city.occupancy.building[k]).toBe(b!.id);
  });

  it('a wider road moves the houses in its way back, or demolishes those that cannot move', () => {
    const { city, edgeId, houses } = street();
    const before = new Map(houses.map((id) => [id, { ...city.buildings.items.get(id)! }]));
    const plan = city.planUpgrade(edgeId, getRoadType('boulevard'))!;
    expect(plan.valid).toBe(true);
    expect(plan.displaced?.length).toBeGreaterThan(0);
    expect(city.upgradeRoad(plan)).toBe(true);
    let moved = 0;
    for (const d of plan.displaced!) {
      const b = city.buildings.items.get(d.id);
      if (d.to && b) {
        moved++;
        expect(b.j).toBeGreaterThan(before.get(d.id)!.j); // back, away from the road (south)
        expect(b.zone).toBe(ZoneType.Residential);
        // Off the new road and still facing a road.
        for (const k of b.cells) expect(city.occupancy.road[k]).toBe(0);
        expect(city.roadAccessOf(b)).toBe(true);
      }
    }
    expect(moved).toBeGreaterThan(0);
    // Nothing stands on the widened road.
    for (const b of city.buildings.items.values()) for (const k of b.cells) expect(city.occupancy.road[k]).toBe(0);
  });
});

describe('Footpaths', () => {
  it('a 3 m footpath fits through a one-cell gap between houses; the pedestrian road is narrower than before', () => {
    const { city, houses } = street();
    const a = city.buildings.items.get(houses[1])!;
    // Free the next lot to leave a one-cell gap, then walk a path from the street through it.
    const gapHouse = [...city.buildings.items.values()].find((b) => b.i === a.i + 1 && b.j === a.j);
    if (gapHouse) city.removeGrowable(gapHouse.id);
    const x = (a.i + 1.5) * CELL_SIZE;
    const z0 = a.j * CELL_SIZE + 0.5;
    const plan = planRoad(city.roads, { kind: 'free', point: { x, z: z0 } }, { kind: 'free', point: { x, z: z0 + 40 } }, null, getRoadType('footpath'), city.plannerWorld, 1e9);
    expect(plan.errors).not.toContain('Yol bir binanın üzerinden geçiyor');
    expect(getRoadType('footpath').width).toBe(3);
    expect(getRoadType('footpath').pedestrian).toBe(true);
    expect(getRoadType('pedestrian').width).toBeLessThan(6);
  });
});
