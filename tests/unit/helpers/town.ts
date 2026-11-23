import { GRID_CELLS } from '../../../src/game/core/config';
import { getRoadType } from '../../../src/game/data/roads';
import { ZoneType } from '../../../src/game/data/zones';
import type { Rotation } from '../../../src/game/entities/building/BuildingPlacement';
import type { P2 } from '../../../src/game/entities/road/curve';
import { CitySimulation } from '../../../src/game/simulation/CitySimulation';
import { SimScheduler } from '../../../src/game/simulation/SimScheduler';
import { City } from '../../../src/game/systems/City';
import { planRoad } from '../../../src/game/tools/placement/RoadPlanner';
import { generateWorld, type GeneratedWorld } from '../../../src/game/world/generation/generateWorld';
import { World } from '../../../src/game/world/World';

let cached: GeneratedWorld | null = null;
const worldData = () => (cached ??= generateWorld(12345));

/** Places a building at the first valid spot near the road (scanning zoneable cells). */
export function placeNearRoad(city: City, defId: string): boolean {
  for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) {
    if (city.zones.zoneable[k] === 0) continue;
    for (const rot of [0, 1, 2, 3] as Rotation[]) {
      const p = city.planBuilding(defId, k % GRID_CELLS, Math.floor(k / GRID_CELLS), rot);
      if (p.valid) return city.placeBuilding(p) !== null;
    }
  }
  return false;
}

export interface TownOptions {
  utilities?: boolean;
  hall?: boolean;
  residentialTax?: number;
}

/** A flat street near the map centre, fully zoned residential; optionally with power and water. */
export function buildTown(opts: TownOptions = {}) {
  const city = new City(new World(worldData()));
  let road: { a: P2; b: P2 } | null = null;
  for (let z = 960; z <= 1100 && !road; z += 24) {
    const a = { x: 880, z };
    const b = { x: 1160, z };
    const plan = planRoad(city.roads, { kind: 'free', point: a }, { kind: 'free', point: b }, null, getRoadType('street'), city.plannerWorld, 1e9);
    if (plan.valid) {
      city.buildRoad(plan);
      road = { a, b };
    }
  }
  if (!road) throw new Error('no flat street found');
  if (opts.hall) placeNearRoad(city, 'city_hall');
  if (opts.utilities !== false) {
    placeNearRoad(city, 'wind_turbine');
    placeNearRoad(city, 'water_tower');
    placeNearRoad(city, 'water_tower');
    // Pipe and power line along the street (both over/under the road).
    city.buildLine(city.planLine('pipe', road.a, road.b));
    city.buildLine(city.planLine('power', road.a, road.b));
  }
  const cells: number[] = [];
  for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) if (city.zones.zoneable[k] > 0) cells.push(k);
  city.setZone(cells, ZoneType.Residential);
  if (opts.residentialTax !== undefined) city.economy.setTax('residential', opts.residentialTax);
  const milestones: number[] = [];
  const sim = new CitySimulation(city, 1, { onStats: () => {}, onMilestone: (m) => milestones.push(m.population) });
  const scheduler = new SimScheduler();
  sim.register(scheduler);
  const run = (ticks: number) => {
    for (let i = 0; i < ticks; i++) scheduler.advance(0.1);
  };
  return { city, sim, scheduler, run, road, milestones };
}
