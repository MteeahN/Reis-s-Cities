import { describe, expect, it } from 'vitest';
import { CELL_SIZE } from '../../src/game/core/config';
import { getProp, getPaint, PAINT_RES, PAINT_STEP, PROPS } from '../../src/game/data/decor';
import { getRoadType } from '../../src/game/data/roads';
import { partsGeometry } from '../../src/game/entities/building/BuildingModels';
import { restoreCity, serializeCity } from '../../src/game/save/CitySave';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { City } from '../../src/game/systems/City';
import { planRoad } from '../../src/game/tools/placement/RoadPlanner';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

const worldData = generateWorld(12345);
const newCity = () => {
  const c = new City(new World(worldData));
  c.treasury.restore(1e7, c.treasury.spent, c.treasury.refunded);
  return c;
};
/** Owned, dry, empty land. */
function spot(city: City): { x: number; z: number } {
  for (let j = 100; j < 160; j += 3) {
    for (let i = 100; i < 160; i += 3) {
      if (!city.world.grid.isWater(i, j) && city.world.field.vertex(i, j) > 3) return { x: (i + 0.5) * CELL_SIZE, z: (j + 0.5) * CELL_SIZE };
    }
  }
  throw new Error('no spot');
}
const sim = (c: City) => new CitySimulation(c, 1, { onStats: () => {}, onMilestone: () => {} });

describe('Ground paint', () => {
  it('paints owned dry land in a round brush, charges per m², undoes and saves', () => {
    const city = newCity();
    const { x, z } = spot(city);
    const money = city.treasury.balance;
    city.beginPaintStroke('Parke taşı döşeme');
    const res = city.paintGround(1, x, z, 4);
    city.endPaintStroke();
    expect(res.error).toBeNull();
    expect(res.changed).toBeGreaterThan(8);
    const k = Math.floor(z / PAINT_STEP) * PAINT_RES + Math.floor(x / PAINT_STEP);
    expect(city.paint[k]).toBe(1);
    expect(money - city.treasury.balance).toBe(res.changed * PAINT_STEP * PAINT_STEP * getPaint(1)!.price);

    const save = serializeCity(city, sim(city));
    const fresh = new City(new World(worldData));
    restoreCity(fresh, sim(fresh), JSON.parse(JSON.stringify(save)), 0, 0);
    expect(fresh.paint[k]).toBe(1);

    city.undoLast();
    expect(city.paint[k]).toBe(0);
    expect(city.treasury.balance).toBe(money);
  });

  it('does not paint land the city does not own', () => {
    const city = newCity();
    expect(city.paintGround(1, 40, 40, 4).error).toBe('Yalnızca şehre ait kuru arazi boyanabilir');
  });
});

describe('Decorations', () => {
  it('every decoration has a model', () => {
    for (const p of PROPS) expect(partsGeometry(p.parts).getAttribute('position').count, p.id).toBeGreaterThan(0);
  });

  it('are placed and bulldozed with half the price back; they cannot overlap or stand on roads', () => {
    const city = newCity();
    const { x, z } = spot(city);
    const money = city.treasury.balance;
    const p = city.placeProp('gazebo', x, z, 0)!;
    expect(p).toBeTruthy();
    expect(city.treasury.balance).toBe(money - getProp('gazebo').cost);
    expect(city.propError('fountain', x + 1, z)).toBe('Başka bir süsle çakışıyor');
    expect(city.propAt(x + 0.5, z)!.id).toBe(p.id);
    const refund = city.removeProp(p.id);
    expect(refund).toBe(Math.round(getProp('gazebo').cost / 2));
    expect(city.props.size).toBe(0);
    city.undoLast();
    expect(city.props.has(p.id)).toBe(true);
  });

  it('are saved, and cleared by a road built over them', () => {
    const city = newCity();
    const { x, z } = spot(city);
    city.placeProp('bench', x, z, 1);
    const save = serializeCity(city, sim(city));
    const fresh = new City(new World(worldData));
    restoreCity(fresh, sim(fresh), JSON.parse(JSON.stringify(save)), 0, 0);
    expect([...fresh.props.values()].map((q) => q.defId)).toEqual(['bench']);
    const plan = planRoad(city.roads, { kind: 'free', point: { x: x - 40, z } }, { kind: 'free', point: { x: x + 40, z } }, null, getRoadType('street'), city.plannerWorld, 1e9);
    if (!plan.valid) return;
    city.buildRoad(plan);
    expect(city.props.size).toBe(0);
  });
});
