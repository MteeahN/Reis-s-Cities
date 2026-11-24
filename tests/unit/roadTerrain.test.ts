import { describe, expect, it } from 'vitest';
import { CELL_SIZE, GRID_CELLS, WATER_LEVEL } from '../../src/game/core/config';
import { getRoadType } from '../../src/game/data/roads';
import { minTurnRadius, type P2 } from '../../src/game/entities/road/curve';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { createRoadMaterial } from '../../src/game/rendering/roads/RoadMaterial';
import { City } from '../../src/game/systems/City';
import { arcPieces, circleThrough, freehandPieces } from '../../src/game/tools/placement/pathShapes';
import { planRoad, type Anchor } from '../../src/game/tools/placement/RoadPlanner';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';
import { restoreCity, serializeCity } from '../../src/game/save/CitySave';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';

const worldData = generateWorld(12345);
const newCity = () => {
  const c = new City(new World(worldData));
  c.treasury.restore(1e7, c.treasury.spent, c.treasury.refunded);
  return c;
};
const free = (x: number, z: number): Anchor => ({ kind: 'free', point: { x, z } });

describe('Freehand and arc roads', () => {
  it('a wobbly stroke becomes a few smooth pieces that meet end to end', () => {
    const stroke: P2[] = [];
    for (let k = 0; k <= 90; k++) stroke.push({ x: 100 + k * 4, z: 100 + Math.sin(k / 12) * 30 + (k % 2) * 1.5 });
    const pieces = freehandPieces(stroke, 16);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces[0].a).toEqual(stroke[0]);
    expect(pieces[pieces.length - 1].b).toEqual(stroke[stroke.length - 1]);
    for (let k = 1; k < pieces.length; k++) expect(pieces[k].a).toEqual(pieces[k - 1].b);
    for (const q of pieces) expect(minTurnRadius({ p0: q.a, p1: q.c, p2: q.b })).toBeGreaterThanOrEqual(16);
  });

  it('an arc follows the circle through start, end and the bend point', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 100, z: 0 };
    const via = { x: 50, z: 40 };
    const o = circleThrough(a, b, via)!;
    const r = Math.hypot(a.x - o.x, a.z - o.z);
    const pieces = arcPieces(a, b, via);
    expect(pieces[0].a).toEqual(a);
    expect(pieces[pieces.length - 1].b).toEqual(b);
    // Every piece's ends lie on the circle; the arc bulges towards +z.
    for (const q of pieces) expect(Math.hypot(q.b.x - o.x, q.b.z - o.z)).toBeCloseTo(r, 6);
    expect(pieces.some((q) => q.b.z > 30 || q.a.z > 30)).toBe(true);
    // Straight when the bend point is on the line.
    expect(arcPieces(a, b, { x: 50, z: 0 }).length).toBe(1);
  });

  it('builds the pieces as one undoable action, or nothing at all', () => {
    const city = newCity();
    let ok = false;
    for (let cx = 760; cx < 1300 && !ok; cx += 40) {
      for (let cz = 760; cz < 1300 && !ok; cz += 40) {
        const pieces = arcPieces({ x: cx - 80, z: cz }, { x: cx + 80, z: cz }, { x: cx, z: cz + 50 });
        const res = city.buildRoadPath(getRoadType('city'), pieces, free(cx - 80, cz), null, 'cobble', 0);
        if (res.error) {
          // A failed path leaves nothing behind.
          expect(city.roads.edges.size).toBe(0);
          continue;
        }
        ok = true;
        expect(city.roads.edges.size).toBe(pieces.length);
        expect([...city.roads.edges.values()].every((e) => e.surface === 'cobble')).toBe(true);
        city.undoLast();
        expect(city.roads.edges.size).toBe(0);
      }
    }
    expect(ok).toBe(true);
  });
});

describe('Road types and paving', () => {
  it('pedestrian streets carry no vehicles; ramps are one-way highway links', () => {
    expect(getRoadType('pedestrian').pedestrian).toBe(true);
    expect(getRoadType('ramp').oneWay).toBe(true);
    expect(getRoadType('ramp').category).toBe('highway');
  });

  it('paving is kept through splits, saved, and repaving costs less than rebuilding', () => {
    const g = new RoadGraph();
    const a = g.addNode(0, 0).id;
    const b = g.addNode(100, 0).id;
    const e = g.addEdge(a, b, 'street', { x: 50, z: 0 }, 1000);
    g.setSurface(e.id, 'brick');
    const { left, right } = g.splitEdge(e.id, 0.5);
    expect(left.surface).toBe('brick');
    expect(right.surface).toBe('brick');
    const copy = RoadGraph.deserialize(JSON.parse(JSON.stringify(g.serialize())));
    expect([...copy.edges.values()].every((x) => x.surface === 'brick')).toBe(true);
    expect(createRoadMaterial(getRoadType('street'), 'cobble')).toBeTruthy();

    const city = newCity();
    let edgeId = -1;
    for (let cx = 760; cx < 1300 && edgeId < 0; cx += 40) {
      const plan = planRoad(city.roads, free(cx, 900), free(cx + 100, 900), null, getRoadType('street'), city.plannerWorld, 1e9);
      if (plan.valid) {
        city.buildRoad(plan);
        edgeId = [...city.roads.edges.keys()][0];
      }
    }
    const repave = city.planUpgrade(edgeId, getRoadType('street'), 'cobble')!;
    const rebuild = city.planUpgrade(edgeId, getRoadType('city'), 'asphalt')!;
    expect(repave.valid).toBe(true);
    expect(repave.netCost).toBeLessThan(repave.cost + 1);
    expect(repave.cost).toBeLessThan(rebuild.cost);
    expect(city.upgradeRoad(repave)).toBe(true);
    expect(city.roads.edges.get(edgeId)!.surface).toBe('cobble');
    expect(city.roads.edges.get(edgeId)!.typeId).toBe('street');
    expect(city.planUpgrade(edgeId, getRoadType('street'), 'cobble')!.valid).toBe(false);
  });
});

describe('Terrain tool', () => {
  const spot = (city: City) => {
    // Owned, dry, empty land.
    for (let j = 100; j < 160; j += 4) {
      for (let i = 100; i < 160; i += 4) {
        if (!city.world.grid.isWater(i, j) && city.world.field.vertex(i, j) > 4) return { x: i * CELL_SIZE, z: j * CELL_SIZE };
      }
    }
    throw new Error('no spot');
  };

  it('raises and lowers the land, charges for the earth moved, and undoes it', () => {
    const city = newCity();
    const { x, z } = spot(city);
    const h0 = city.world.heightAt(x, z);
    const money = city.treasury.balance;
    city.beginTerrainStroke('Araziyi yükseltme');
    for (let k = 0; k < 5; k++) city.editTerrain('raise', x, z, 24, 1);
    city.endTerrainStroke();
    expect(city.world.heightAt(x, z)).toBeGreaterThan(h0 + 3);
    expect(city.treasury.balance).toBeLessThan(money);
    city.undoLast();
    expect(city.world.heightAt(x, z)).toBeCloseTo(h0, 4);
    expect(city.treasury.balance).toBe(money);
  });

  it('digs a pond that fills with water, and never touches roads', () => {
    const city = newCity();
    const { x, z } = spot(city);
    for (let k = 0; k < 6; k++) city.editTerrain('pond', x, z, 24, 1);
    expect(city.world.heightAt(x, z)).toBeLessThan(WATER_LEVEL);
    expect(city.world.grid.isWater(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE))).toBe(true);

    const c2 = newCity();
    const p = spot(c2);
    const plan = planRoad(c2.roads, free(p.x - 60, p.z), free(p.x + 60, p.z), null, getRoadType('street'), c2.plannerWorld, 1e9);
    if (!plan.valid) return;
    c2.buildRoad(plan);
    const roadCell = [...Array(GRID_CELLS * GRID_CELLS).keys()].find((k) => c2.occupancy.road[k] > 0)!;
    const vi = roadCell % GRID_CELLS;
    const vj = Math.floor(roadCell / GRID_CELLS);
    const before = c2.world.field.vertex(vi, vj);
    c2.editTerrain('raise', vi * CELL_SIZE, vj * CELL_SIZE, 12, 2);
    expect(c2.world.field.vertex(vi, vj)).toBe(before);
  });

  it('reshaped land is saved and restored', () => {
    const city = newCity();
    const { x, z } = spot(city);
    city.editTerrain('lower', x, z, 24, 2);
    const h = city.world.heightAt(x, z);
    const sim = (c: City) => new CitySimulation(c, 1, { onStats: () => {}, onMilestone: () => {} });
    const save = serializeCity(city, sim(city));
    expect(save.terrain!.length).toBeGreaterThan(0);
    const fresh = new City(new World(worldData));
    restoreCity(fresh, sim(fresh), JSON.parse(JSON.stringify(save)), 0, 0);
    expect(fresh.world.heightAt(x, z)).toBeCloseTo(h, 1);
  });
});
