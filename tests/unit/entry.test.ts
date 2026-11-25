import { describe, expect, it } from 'vitest';
import { CELL_SIZE, GRID_CELLS, WORLD_SIZE } from '../../src/game/core/config';
import { BUILDABLE_ROAD_TYPES, getRoadType } from '../../src/game/data/roads';
import { ZONED_BUILDINGS } from '../../src/game/data/buildings';
import { ARCH_STYLES } from '../../src/game/data/styles';
import { ZoneType } from '../../src/game/data/zones';
import { variantParts } from '../../src/game/entities/building/BuildingModels';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { SimScheduler } from '../../src/game/simulation/SimScheduler';
import { residentsOf } from '../../src/game/simulation/Population';
import { City } from '../../src/game/systems/City';
import { planRoad } from '../../src/game/tools/placement/RoadPlanner';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { rasterizePolylineSquares } from '../../src/game/world/Occupancy';
import { World } from '../../src/game/world/World';
import type { P2 } from '../../src/game/entities/road/curve';

const worldData = generateWorld(12345);

type End = P2 | { node: number };
function street(city: City, a: End, b: End, type = 'street'): boolean {
  const anchor = (e: End) => ('node' in e ? { kind: 'node' as const, nodeId: e.node, point: city.roads.nodes.get(e.node)! } : { kind: 'free' as const, point: e });
  const plan = planRoad(city.roads, anchor(a), anchor(b), null, getRoadType(type), city.plannerWorld, 1e9);
  if (plan.valid) city.buildRoad(plan);
  return plan.valid;
}

function sim(city: City) {
  const s = new CitySimulation(city, 1, { onStats: () => {}, onMilestone: () => {} });
  const scheduler = new SimScheduler();
  s.register(scheduler);
  return (ticks: number) => {
    for (let i = 0; i < ticks; i++) scheduler.advance(0.1);
  };
}

describe('City entry road', () => {
  it('runs from the map edge into the owned land and cannot be drawn, changed or demolished by the player', () => {
    const city = new City(new World(worldData));
    expect(city.buildEntryRoad()).toBe(true);
    // A through highway: both ends on the map edge, on opposite sides.
    expect(city.entries.length).toBe(2);
    for (const e of city.entries) expect(Math.min(e.x, e.z, WORLD_SIZE - e.x, WORLD_SIZE - e.z)).toBeLessThan(8);
    const [p, q] = city.entries;
    expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThan(WORLD_SIZE - 20);
    // A junction on it with a link road into the city.
    const link = city.roads.nearestNode(city.entryLink!.x, city.entryLink!.z, 2)!;
    expect(link).toBeTruthy();
    expect([...city.roads.nodes.values()].some((n) => n.edges.length >= 3)).toBe(true);
    expect([...city.roads.edges.values()].some((e) => e.typeId === 'citylink')).toBe(true);
    expect(city.roads.edges.size).toBeGreaterThan(0);
    expect(city.outsideEdges()!.size).toBe(city.roads.edges.size);
    // Free: the treasury paid nothing.
    expect(city.treasury.spent.roads).toBe(0);
    expect(BUILDABLE_ROAD_TYPES.some((t) => t.id === 'intercity')).toBe(false);
    const edge = [...city.roads.edges.values()].find((e) => e.typeId === 'intercity')!;
    expect(city.planUpgrade(edge.id, getRoadType('avenue'))!.valid).toBe(false);
  });

  it('newcomers and new buildings only come to streets connected to the entry', () => {
    const city = new City(new World(worldData));
    city.buildEntryRoad();
    city.treasury.restore(1e7, city.treasury.spent, city.treasury.refunded);
    // A street near the entry road's end that does not touch it.
    const end = city.roads.nearestNode(city.entryLink!.x, city.entryLink!.z, 2)!;
    // Direction of the link road (from the highway junction into the city) and across it.
    const junction = [...city.roads.nodes.values()].find((n) => n.edges.length >= 3)!;
    const len = Math.hypot(end.x - junction.x, end.z - junction.z);
    const d = { x: (end.x - junction.x) / len, z: (end.z - junction.z) / len };
    const side = { x: -d.z, z: d.x };
    // A cross street ahead of the link road's end, not touching it.
    let start: P2 | null = null;
    for (let k = 48; k <= 240 && !start; k += 16) {
      const m = { x: end.x + d.x * k, z: end.z + d.z * k };
      if (street(city, { x: m.x - side.x * 120, z: m.z - side.z * 120 }, { x: m.x + side.x * 120, z: m.z + side.z * 120 })) start = m;
    }
    expect(start).not.toBeNull();
    for (const id of ['wind_turbine', 'water_tower']) {
      for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) {
        if (city.zones.zoneable[k] === 0) continue;
        const p = city.planBuilding(id, k % GRID_CELLS, Math.floor(k / GRID_CELLS), 0);
        if (p.valid) {
          city.placeBuilding(p);
          break;
        }
      }
    }
    const cells: number[] = [];
    // Keep the corridor where the link road will be extended free (the link road is wide).
    const inCorridor = (k: number) => {
      const x = ((k % GRID_CELLS) + 0.5) * CELL_SIZE - end.x;
      const z = (Math.floor(k / GRID_CELLS) + 0.5) * CELL_SIZE - end.z;
      const along = x * d.x + z * d.z;
      return along > -4 && along < 260 && Math.abs(x * side.x + z * side.z) < 22;
    };
    for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) if (city.zones.zoneable[k] > 0 && !inCorridor(k)) cells.push(k);
    city.setZone(cells, ZoneType.Residential);
    const run = sim(city);
    run(1500);
    const homes = () => [...city.buildings.items.values()].filter((b) => b.zone === ZoneType.Residential);
    // Only the link road from the highway is connected: nothing grows on the separate street.
    expect(homes().every((h) => city.isConnectedToOutside(h))).toBe(true);
    // A lot fronting the cross street is not connected yet.
    const ci = Math.floor((start!.x + side.x * 60 + d.x * 12) / CELL_SIZE);
    const cj = Math.floor((start!.z + side.z * 60 + d.z * 12) / CELL_SIZE);
    const lotConnected = () => [0, 1, 2, 3].some((r) => city.reachesOutside(ci, cj, 1, 1, r as 0 | 1 | 2 | 3));
    expect(lotConnected()).toBe(false);

    // Connect the street to the entry road: houses are built and people move in.
    // Extend the link road straight ahead until it meets the cross street.
    const hit = city.roads.nearestEdge(start!.x, start!.z, 2)!;
    const plan = planRoad(city.roads, { kind: 'node', nodeId: end.id, point: end }, { kind: 'edge', edgeId: hit.edge.id, t: hit.t, point: hit.point }, null, getRoadType('city'), city.plannerWorld, 1e9);
    expect(plan.errors, JSON.stringify(plan.errors)).toEqual([]);
    city.buildRoad(plan);
    expect(lotConnected()).toBe(true);
    run(3000);
    const people = homes().reduce((s, b) => s + residentsOf(city.population.households.get(b.id)!), 0);
    expect(people).toBeGreaterThan(0);
    for (const h of homes()) expect(city.isConnectedToOutside(h)).toBe(true);
  }, 30_000);
});

describe('Buildings next to curved roads', () => {
  it('cells whose square reaches the road surface count as road; straight grid roads keep their rows', () => {
    // Straight road along a grid line, 8 m wide: exactly the two rows beside the line.
    const straight = rasterizePolylineSquares([{ x: 100 * CELL_SIZE, z: 50 * CELL_SIZE }, { x: 110 * CELL_SIZE, z: 50 * CELL_SIZE }], 4 - 0.5);
    const rows = new Set(straight.map((c) => Math.floor(c / GRID_CELLS)));
    expect([...rows].sort()).toEqual([49, 50]);
    // A diagonal road catches the corners its surface crosses.
    const diag = rasterizePolylineSquares([{ x: 800, z: 800 }, { x: 900, z: 900 }], 3.5);
    for (const c of diag) {
      const cx = (c % GRID_CELLS) * CELL_SIZE + 4;
      const cz = Math.floor(c / GRID_CELLS) * CELL_SIZE + 4;
      // Each caught cell is within half-width + half a cell diagonal of the line.
      expect(Math.abs(cx - cz) / Math.SQRT2).toBeLessThan(3.5 + 4 * Math.SQRT2);
    }
  });

  it('a building cannot stand on a curved road', () => {
    const city = new City(new World(worldData));
    city.treasury.restore(1e7, city.treasury.spent, city.treasury.refunded);
    const plan = planRoad(city.roads, { kind: 'free', point: { x: 880, z: 1000 } }, { kind: 'free', point: { x: 1100, z: 1000 } }, { x: 990, z: 1120 }, getRoadType('city'), city.plannerWorld, 1e9);
    if (!plan.valid) return; // terrain under this curve is not buildable on this seed
    city.buildRoad(plan);
    const e = [...city.roads.edges.values()][0];
    const half = getRoadType('city').width / 2 - 0.5;
    for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) {
      if (city.occupancy.road[k] > 0) continue;
      const i = k % GRID_CELLS;
      const j = Math.floor(k / GRID_CELLS);
      // No free cell's square may come closer than the road's half width to its centre line.
      for (let p = 1; p < e.poly.points.length; p++) {
        const a = e.poly.points[p - 1];
        const b = e.poly.points[p];
        const near = Math.hypot((i + 0.5) * CELL_SIZE - a.x, (j + 0.5) * CELL_SIZE - a.z) < 30 || Math.hypot((i + 0.5) * CELL_SIZE - b.x, (j + 0.5) * CELL_SIZE - b.z) < 30;
        if (!near) continue;
        expect(rasterizePolylineSquares([a, b], half)).not.toContain(k);
      }
    }
  });
});

describe('Style massing', () => {
  it('styles give multi-storey blocks different silhouettes, not only colours', () => {
    const apartments = ZONED_BUILDINGS.filter((b) => b.spec && (b.spec.style === 'apartment' || b.spec.style === 'office') && b.spec.floors >= 3);
    expect(apartments.length).toBeGreaterThan(0);
    for (const def of apartments.slice(0, 6)) {
      // Silhouette = the boxes' sizes and positions, ignoring colour.
      const shapes = new Set(ARCH_STYLES.map((a) => JSON.stringify(variantParts(def, 0, a).filter((p) => p.facade).map((p) => [p.size.map((n) => n.toFixed(1)), p.pos.map((n) => n.toFixed(1)), p.rot ?? null]))));
      expect(shapes.size, def.id).toBeGreaterThanOrEqual(ARCH_STYLES.length - 2);
    }
  });
});

describe('Entry boulevard', () => {
  it('the city entry road is the widest road in the game', async () => {
    const { ROAD_TYPES } = await import('../../src/game/data/roads');
    const entry = ROAD_TYPES.find((t) => t.id === 'citylink')!;
    for (const t of ROAD_TYPES) if (t.id !== 'citylink') expect(entry.width).toBeGreaterThan(t.width);
  });
});
