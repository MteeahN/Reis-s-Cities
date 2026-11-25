import { describe, expect, it } from 'vitest';
import { CELL_SIZE, GRID_CELLS } from '../../src/game/core/config';
import { getBuilding } from '../../src/game/data/buildings';
import { getRoadType } from '../../src/game/data/roads';
import { ZoneType } from '../../src/game/data/zones';
import type { PlacedBuilding } from '../../src/game/entities/building/BuildingRegistry';
import { restoreCity, serializeCity } from '../../src/game/save/CitySave';
import { CitySimulation } from '../../src/game/simulation/CitySimulation';
import { City, quadsOverlap } from '../../src/game/systems/City';
import { planRoad, type Anchor } from '../../src/game/tools/placement/RoadPlanner';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { Occupancy } from '../../src/game/world/Occupancy';
import { World } from '../../src/game/world/World';

const worldData = generateWorld(12345);
const free = (x: number, z: number): Anchor => ({ kind: 'free', point: { x, z } });
type Drawn = { drawnCorners(i: number, j: number, w: number, d: number, s: { x: number; z: number; yaw: number } | null, inset?: number): { x: number; z: number }[] };

function newCity(): City {
  const city = new City(new World(worldData));
  city.treasury.restore(1e7, city.treasury.spent, city.treasury.refunded);
  return city;
}

/** A straight street at 30° to the grid, on gentle owned land. */
function angledStreet(): { city: City; a: { x: number; z: number }; t: { x: number; z: number }; n: { x: number; z: number }; length: number } {
  const length = 220;
  const t = { x: Math.cos(Math.PI / 6), z: -Math.sin(Math.PI / 6) };
  for (let x = 760; x < 1200; x += 40) {
    for (let z = 900; z < 1300; z += 40) {
      const city = newCity();
      const plan = planRoad(city.roads, free(x, z), free(x + t.x * length, z + t.z * length), null, getRoadType('street'), city.plannerWorld, 1e9);
      if (!plan.valid) continue;
      city.buildRoad(plan);
      return { city, a: { x, z }, t, n: { x: -t.z, z: t.x }, length };
    }
  }
  throw new Error('no spot');
}

const quadOf = (city: City, b: PlacedBuilding, inset = 0) => (city as unknown as Drawn).drawnCorners(b.i, b.j, b.w, b.d, { x: b.ox ?? 0, z: b.oz ?? 0, yaw: b.oyaw ?? 0 }, inset);

/** Shortest distance between two drawn footprints (0 when they touch). */
function quadDistance(a: { x: number; z: number }[], b: { x: number; z: number }[]): number {
  const seg = (p: { x: number; z: number }, u: { x: number; z: number }, v: { x: number; z: number }) => {
    const dx = v.x - u.x;
    const dz = v.z - u.z;
    const l = dx * dx + dz * dz;
    const s = Math.max(0, Math.min(1, l ? ((p.x - u.x) * dx + (p.z - u.z) * dz) / l : 0));
    return Math.hypot(p.x - u.x - dx * s, p.z - u.z - dz * s);
  };
  let m = Infinity;
  for (const [p, q] of [
    [a, b],
    [b, a],
  ])
    for (const c of p) for (let k = 0; k < 4; k++) m = Math.min(m, seg(c, q[k], q[(k + 1) % 4]));
  return m;
}

/** Gap from the drawn front (centre and both corners) to the kerb: the smallest (or the largest). */
function frontGap(city: City, b: PlacedBuilding, largest = false): number {
  const yaw = (b.rot * Math.PI) / 2 + (b.oyaw ?? 0);
  const fp = getBuilding(b.defId).footprint;
  const hw = (fp[0] * CELL_SIZE) / 2;
  const hd = (fp[1] * CELL_SIZE) / 2;
  const cx = (b.i + b.w / 2) * CELL_SIZE + (b.ox ?? 0);
  const cz = (b.j + b.d / 2) * CELL_SIZE + (b.oz ?? 0);
  return (largest ? Math.max : Math.min)(
    ...[0, 0.95, -0.95].map((s) => {
      const x = cx + Math.sin(yaw) * hd + Math.cos(yaw) * hw * s;
      const z = cz + Math.cos(yaw) * hd - Math.sin(yaw) * hw * s;
      const near = city.roads.nearestEdge(x, z, 40, true)!;
      return near.dist - getRoadType(near.edge.typeId).width / 2;
    }),
  );
}

describe('Cells shared by buildings turned to a road', () => {
  it('keeps every owner of a shared cell; removing one leaves it to the other', () => {
    const o = new Occupancy();
    o.setBuilding(1, [10, 11]);
    o.setBuilding(2, [11, 12]);
    expect(o.ownersAt(11).sort()).toEqual([1, 2]);
    expect(o.ownersAt(10)).toEqual([1]);
    o.clearBuilding(2, [11, 12]);
    expect(o.buildingAt(11, 0)).toBe(1);
    expect(o.ownersAt(12)).toEqual([]);
    // Planning a move clears and sets the same building again: still both.
    o.setBuilding(2, [11]);
    o.clearBuilding(1, [10, 11]);
    o.setBuilding(1, [10, 11]);
    expect(o.ownersAt(11).sort()).toEqual([1, 2]);
    o.clearBuilding(1, [10, 11]);
    o.clearBuilding(2, [11]);
    expect(o.ownersAt(11)).toEqual([]);
    expect(o.building[11]).toBe(0);
  });
});

describe('Growth along an angled road', () => {
  /** A zoned angled street, grown full; `old`: grown square on the grid, the way cities saved before grew. */
  function grown(old = false) {
    const s = angledStreet();
    const { city } = s;
    const patched = city as unknown as Record<string, unknown>;
    if (old) (patched.growAlongRoad = () => null), (patched.freeLotAt = () => null);
    const cells: number[] = [];
    for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) if (city.zones.zoneable[k] > 0) cells.push(k);
    city.setZone(cells, ZoneType.Residential);
    const sim = new CitySimulation(city, 1, { onStats: () => {}, onMilestone: () => {} });
    for (let tick = 10; tick < 4000; tick += 5) {
      sim.demand = { residential: 100, commercial: 0, industrial: 0, office: 0 };
      sim.growth(tick);
      for (const b of city.buildings.items.values()) if (b.state === 'construction') city.buildings.replace(b.id, { state: 'active', progress: 1 });
    }
    delete patched.growAlongRoad;
    delete patched.freeLotAt;
    return { ...s, sim, all: [...city.buildings.items.values()] };
  }

  it('builds houses turned to the road, their fronts at the kerb, side by side and never overlapping', () => {
    const { city, all } = grown();
    expect(all.length).toBeGreaterThan(10);
    // Turned to the road (off the grid), not a stair of squares.
    const turned = all.filter((b) => b.free && Math.abs(b.oyaw ?? 0) > 0.3);
    expect(turned.length / all.length).toBeGreaterThan(0.75);
    // Every front meets the kerb.
    for (const b of all) {
      expect(frontGap(city, b)).toBeGreaterThan(-0.5);
      expect(frontGap(city, b)).toBeLessThan(1);
    }
    // Clear of each other as drawn, and mostly touching a neighbour.
    const quads = all.map((b) => quadOf(city, b, 0.3));
    for (let a = 0; a < quads.length; a++) for (let b = a + 1; b < quads.length; b++) expect(quadsOverlap(quads[a], quads[b])).toBe(false);
    const full = all.map((b) => quadOf(city, b));
    const touching = full.filter((q, k) => full.some((o, m) => m !== k && quadDistance(q, o) < 0.75)).length;
    expect(touching / all.length).toBeGreaterThan(0.6);
    // Only on cells of their zone; each covered cell knows the building.
    for (const b of turned) {
      for (const k of b.cells) {
        expect(city.zones.zone[k]).toBe(ZoneType.Residential);
        expect(city.occupancy.ownersAt(k)).toContain(b.id);
      }
      expect(city.roadAccessOf(b)).toBe(true);
    }
  });

  it('a save brings them back where they stood', () => {
    const { city, sim, all } = grown();
    const data = JSON.parse(JSON.stringify(serializeCity(city, sim)));
    const loaded = new City(new World(worldData));
    restoreCity(loaded, new CitySimulation(loaded, 1, { onStats: () => {}, onMilestone: () => {} }), data, 0, 0);
    for (const b of all) {
      const l = loaded.buildings.items.get(b.id)!;
      expect({ ox: l.ox, oz: l.oz, oyaw: l.oyaw, cells: [...l.cells].sort() }).toEqual({ ox: b.ox, oz: b.oz, oyaw: b.oyaw, cells: [...b.cells].sort() });
      for (const k of l.cells) expect(loaded.occupancy.ownersAt(k)).toContain(l.id);
    }
  });

  it('an older save: houses grown square on the grid are turned to the road and moved to the kerb, keeping who lives there', () => {
    const { city, sim, all } = grown(true);
    // Off the kerb: a square lot on the diagonal touches it with one corner at most.
    const loose = all.filter((b) => frontGap(city, b, true) >= 1.5);
    expect(loose.length).toBeGreaterThan(10);
    for (const b of all) b.occupants = (b.id % 4) + 1;
    const data = JSON.parse(JSON.stringify(serializeCity(city, sim)));
    const loaded = new City(new World(worldData));
    restoreCity(loaded, new CitySimulation(loaded, 1, { onStats: () => {}, onMilestone: () => {} }), data, 0, 0);
    const moved = loaded.fitGrowablesToRoads();
    // Most come to the kerb; the rest are a second row behind houses already at it (no room in front).
    expect(moved).toBeGreaterThan(loose.length * 0.4);
    const after = [...loaded.buildings.items.values()];
    expect(after.length).toBe(all.length);
    const still = after.filter((b) => frontGap(loaded, b, true) >= 1.5);
    expect(still.length).toBeLessThan(loose.length * 0.6);
    // Laid along the road, the whole front meets the kerb (but past the end of a street).
    for (const b of after.filter((x) => x.free)) {
      const end = loaded.roads.nearestEdge((b.i + b.w / 2) * CELL_SIZE + (b.ox ?? 0), (b.j + b.d / 2) * CELL_SIZE + (b.oz ?? 0), 60, true)!;
      if (end.t > 0.001 && end.t < 0.999) expect(frontGap(loaded, b, true)).toBeLessThan(1.5);
    }
    // The same buildings: id, template, level and residents kept.
    for (const b of all) {
      const l = loaded.buildings.items.get(b.id)!;
      expect({ defId: l.defId, level: l.level, occupants: l.occupants, state: l.state }).toEqual({ defId: b.defId, level: b.level, occupants: b.occupants, state: b.state });
    }
    // Clear of each other as drawn; every covered cell knows its buildings and nothing else.
    const quads = after.map((b) => quadOf(loaded, b, 0.3));
    for (let a = 0; a < quads.length; a++) for (let b = a + 1; b < quads.length; b++) expect(quadsOverlap(quads[a], quads[b])).toBe(false);
    for (const b of after) for (const k of b.cells) expect(loaded.occupancy.ownersAt(k)).toContain(b.id);
    for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) for (const id of loaded.occupancy.ownersAt(k)) expect(loaded.buildings.items.get(id)!.cells).toContain(k);
    // The cells a house left are free to grow on again; a second load changes nothing.
    for (const k of loaded.zones.empty[ZoneType.Residential].values()) expect(loaded.occupancy.ownersAt(k)).toEqual([]);
    expect(loaded.fitGrowablesToRoads()).toBe(0);
  });
});

describe('Hand placement along an angled road', () => {
  it('parking lots placed one after another stand side by side, no gap between them', () => {
    const { city, a, t, n } = angledStreet();
    const ids: number[] = [];
    for (const s of [60, 76, 92, 108]) {
      const plan = city.magnetPlan('parking_lot', a.x + t.x * s - n.x * 14, a.z + t.z * s - n.z * 14);
      expect(plan?.valid).toBe(true);
      ids.push(city.placeBuilding(plan!)!.id);
    }
    const qs = ids.map((id) => quadOf(city, city.buildings.items.get(id)!));
    for (let k = 1; k < qs.length; k++) expect(quadDistance(qs[k - 1], qs[k])).toBeLessThan(0.75);
    const inset = ids.map((id) => quadOf(city, city.buildings.items.get(id)!, 0.3));
    for (let x = 0; x < inset.length; x++) for (let y = x + 1; y < inset.length; y++) expect(quadsOverlap(inset[x], inset[y])).toBe(false);
  });

  it('a moved building is pulled to the road like a new one, turned to face it; undo and redo keep that', () => {
    const { city, a, t, n } = angledStreet();
    city.enableSandbox(); // the police station opens at 500 people
    const first = city.magnetPlan('police_station', a.x + t.x * 40 + n.x * 14, a.z + t.z * 40 + n.z * 14)!;
    expect(first.valid).toBe(true);
    const b = city.placeBuilding(first)!;
    // Across the road, further along.
    const plan = city.magnetMove(b.id, a.x + t.x * 150 - n.x * 14, a.z + t.z * 150 - n.z * 14)!;
    expect(plan.valid).toBe(true);
    expect(plan.cost).toBe(0);
    expect(plan.free).toBeTruthy();
    const moved = city.moveBuilding(b.id, plan.i, plan.j, plan.rot, plan.free)!;
    expect(moved.free).toBeTruthy();
    expect(frontGap(city, moved)).toBeLessThan(0.5);
    expect(city.roadAccessOf(moved)).toBe(true);
    const where = { ox: moved.ox, oz: moved.oz, oyaw: moved.oyaw };
    expect(city.undoLast()).toBeNull();
    const back = [...city.buildings.items.values()].find((x) => x.defId === 'police_station')!;
    expect(frontGap(city, back)).toBeLessThan(0.5);
    expect(city.redoLast()).toBeNull();
    const again = [...city.buildings.items.values()].find((x) => x.defId === 'police_station')!;
    expect({ ox: again.ox, oz: again.oz, oyaw: again.oyaw }).toEqual(where);
  });
});
