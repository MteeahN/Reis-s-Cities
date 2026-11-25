import { describe, expect, it } from 'vitest';
import { CELL_SIZE, GRID_CELLS } from '../../src/game/core/config';
import { getRoadType } from '../../src/game/data/roads';
import { ZoneType } from '../../src/game/data/zones';
import { City } from '../../src/game/systems/City';
import { planRoad, type Anchor } from '../../src/game/tools/placement/RoadPlanner';
import { ZoneTool } from '../../src/game/tools/ZoneTool';
import type { ToolContext } from '../../src/game/tools/Tool';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

const worldData = generateWorld(12345);
const free = (x: number, z: number): Anchor => ({ kind: 'free', point: { x, z } });

function newCity(): City {
  const city = new City(new World(worldData));
  city.treasury.restore(1e7, city.treasury.spent, city.treasury.refunded);
  return city;
}

/** A crossing of two streets on gentle, owned land (grid aligned). */
function crossing(): { city: City; cx: number; cz: number } {
  for (let cx = 704; cx < 1340; cx += 40) {
    for (let cz = 704; cz < 1340; cz += 40) {
      const c = newCity();
      const a = planRoad(c.roads, free(cx - 120, cz), free(cx + 120, cz), null, getRoadType('street'), c.plannerWorld, 1e9);
      if (!a.valid) continue;
      c.buildRoad(a);
      const b = planRoad(c.roads, free(cx, cz - 120), free(cx, cz + 120), null, getRoadType('street'), c.plannerWorld, 1e9);
      if (!b.valid) continue;
      c.buildRoad(b);
      return { city: c, cx, cz };
    }
  }
  throw new Error('no spot');
}

function zoneTool(city: City, zone: ZoneType) {
  const tool = new ZoneTool({ city, events: { emit: () => {} } } as unknown as ToolContext);
  tool.state = { ...tool.state, zone, mode: 'fill', depth: 4 };
  return (x: number, z: number): number[] => (tool as unknown as { cellsAt(g: { x: number; z: number }): number[] }).cellsAt({ x, z });
}

const cellOf = (x: number, z: number) => Math.floor(z / CELL_SIZE) * GRID_CELLS + Math.floor(x / CELL_SIZE);

describe('Roadside zoning', () => {
  it("takes only the land facing the pointed road, not the crossing road's frontage", () => {
    const { city, cx, cz } = crossing();
    // Point beside the east-west street, east of the crossing, south side.
    const cells = zoneTool(city, ZoneType.Residential)(cx + 60, cz + 12);
    expect(cells.length).toBeGreaterThan(10);
    for (const k of cells) {
      const x = ((k % GRID_CELLS) + 0.5) * CELL_SIZE;
      const z = (Math.floor(k / GRID_CELLS) + 0.5) * CELL_SIZE;
      expect(z).toBeGreaterThan(cz); // the side pointed at
      // Nearer this street than the north-south one.
      expect(Math.abs(z - cz)).toBeLessThanOrEqual(Math.abs(x - cx) + 0.01);
    }
  });

  it('stops at land zoned as something else and leaves it unchanged', () => {
    const { city, cx, cz } = crossing();
    // Residential strip right along the street (first row), east of the crossing.
    const strip: number[] = [];
    for (let x = cx + 24; x < cx + 100; x += CELL_SIZE) strip.push(cellOf(x, cz + 8));
    city.setZone(strip.filter((k) => city.canZone(k)), ZoneType.Residential);
    const zonedBefore = strip.filter((k) => city.zones.zone[k] === ZoneType.Residential);
    expect(zonedBefore.length).toBeGreaterThan(3);
    const cells = zoneTool(city, ZoneType.Industrial)(cx + 60, cz + 12);
    // Nothing residential is taken…
    for (const k of cells) expect(city.zones.zone[k]).not.toBe(ZoneType.Residential);
    // …and nothing behind the residential strip either (the strip is the border).
    for (const k of zonedBefore) expect(cells).not.toContain(k + GRID_CELLS);
    city.setZone(cells, ZoneType.Industrial);
    for (const k of zonedBefore) expect(city.zones.zone[k]).toBe(ZoneType.Residential);
  });
});

describe('Buildings drawn up to the kerb', () => {
  it('a lot one strip of grass away from a straight road is drawn against the road edge', () => {
    const { city, cx, cz } = crossing();
    const half = getRoadType('street').width / 2;
    // A lot facing north (rot 2: front towards −z) whose cells start one cell past the road cells.
    const i = Math.floor((cx + 64) / CELL_SIZE);
    let j = Math.floor(cz / CELL_SIZE) + 1;
    while (city.occupancy.road[j * GRID_CELLS + i] > 0) j++;
    const snap = city.roadSnap(i, j, 1, 1, 2);
    const frontZ = j * CELL_SIZE + (snap?.z ?? 0);
    expect(frontZ).toBeCloseTo(cz + half + 0.1, 1);
    // Picking finds it where it is drawn.
    city.buildings.create({ defId: 'res1_house_a', i, j, rot: 2, w: 1, d: 1, baseY: 0, minY: 0, cost: 0, zone: ZoneType.Residential, level: 1, state: 'active', tint: 0, sinceTick: 0 });
    const b = [...city.buildings.items.values()].at(-1)!;
    city.occupancy.setBuilding(b.id, b.cells);
    expect(city.buildingAtWorld((i + 0.5) * CELL_SIZE, frontZ + 1)).toBe(b.id);
  });
});

describe('Buildings on curved roads', () => {
  it('turn to face the curve and meet the kerb with their front', () => {
    const city = newCity();
    let built: { cx: number; cz: number } | null = null;
    for (let cx = 760; cx < 1300 && !built; cx += 60) {
      for (let cz = 760; cz < 1300 && !built; cz += 60) {
        const plan = planRoad(city.roads, free(cx - 90, cz), free(cx + 90, cz), { x: cx, z: cz + 80 }, getRoadType('city'), city.plannerWorld, 1e9);
        if (plan.valid) {
          city.buildRoad(plan);
          built = { cx, cz };
        }
      }
    }
    expect(built).not.toBeNull();
    const { cx, cz } = built!;
    const half = getRoadType('city').width / 2;
    let turned = 0;
    let checked = 0;
    // Lots along the outside of the curve, facing it.
    for (let x = cx - 60; x <= cx + 60; x += 8) {
      for (let z = cz + 30; z <= cz + 80; z += 8) {
        const i = Math.floor(x / CELL_SIZE);
        const j = Math.floor(z / CELL_SIZE);
        for (const rot of [0, 1, 2, 3] as const) {
          const p = city.planBuilding('plaza', i, j, rot);
          if (!p.valid) continue;
          const s = city.roadSnap(p.i, p.j, p.w, p.d, p.rot);
          if (!s) continue;
          checked++;
          if (Math.abs(s.yaw) > 0.05) turned++;
          // The turned and moved front touches the kerb (its closest point) without cutting into the road.
          const [sx, sz] = [[0, 1], [1, 0], [0, -1], [-1, 0]][rot];
          const hd = (sx !== 0 ? p.w : p.d) * CELL_SIZE * 0.5;
          const hw = (sx !== 0 ? p.d : p.w) * CELL_SIZE * 0.5 * 0.95;
          const gaps = [0, 1, -1].map((side) => {
            const vx = sx * hd - sz * hw * side;
            const vz = sz * hd + sx * hw * side;
            const fx = p.centerX + s.x + vx * Math.cos(s.yaw) + vz * Math.sin(s.yaw);
            const fz = p.centerZ + s.z - vx * Math.sin(s.yaw) + vz * Math.cos(s.yaw);
            return city.roads.nearestEdge(fx, fz, 30, true)!.dist - half;
          });
          expect(Math.min(...gaps)).toBeGreaterThan(-0.4);
          expect(Math.min(...gaps)).toBeLessThan(0.5);
        }
      }
    }
    expect(checked).toBeGreaterThan(2);
    expect(turned).toBeGreaterThan(0);
  });
});
