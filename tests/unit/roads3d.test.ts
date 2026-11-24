import { describe, expect, it } from 'vitest';
import { CELL_SIZE, GRID_CELLS, START_TILES, TILE_CELLS } from '../../src/game/core/config';
import { getRoadType } from '../../src/game/data/roads';
import { HEIGHT_LIMITS, storeysOf, zonedTemplates } from '../../src/game/data/buildings';
import { ARCH_STYLES } from '../../src/game/data/styles';
import { ZoneType } from '../../src/game/data/zones';
import { minTurnRadius, sampleBezier, type P2 } from '../../src/game/entities/road/curve';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { City } from '../../src/game/systems/City';
import { relaxCorners, smoothPieces } from '../../src/game/systems/HighwayRoute';
import { planRoad, type Anchor } from '../../src/game/tools/placement/RoadPlanner';
import { ROUNDABOUT_TYPE } from '../../src/game/tools/placement/Roundabout';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

const worldData = generateWorld(12345);

function newCity(): City {
  const city = new City(new World(worldData));
  city.treasury.restore(1e7, city.treasury.spent, city.treasury.refunded);
  return city;
}

const free = (x: number, z: number, elev = 0): Anchor => ({ kind: 'free', point: { x, z }, elev });

function build(city: City, a: Anchor, b: Anchor, type: string) {
  const plan = planRoad(city.roads, a, b, null, getRoadType(type), city.plannerWorld, 1e9);
  if (plan.valid) city.buildRoad(plan);
  return plan;
}

/** A spot on owned land where a 200 m crossing of `type` roads can be built. */
function crossingSpot(type: string): { cx: number; cz: number } {
  for (let cx = 700; cx < 1340; cx += 40) {
    for (let cz = 700; cz < 1340; cz += 40) {
      const c = newCity();
      if (!build(c, free(cx - 100, cz), free(cx + 100, cz), type).valid) continue;
      if (build(c, free(cx, cz - 100), free(cx, cz + 100), type).valid) return { cx, cz };
    }
  }
  throw new Error('no flat spot');
}

describe('Intercity highway', () => {
  it('is drawn as smooth curves around the owned land with a single road into the city', () => {
    const city = newCity();
    expect(city.buildEntryRoad()).toBe(true);
    const lo = Math.min(...START_TILES.map(([x]) => x)) * TILE_CELLS * CELL_SIZE;
    const hi = (Math.max(...START_TILES.map(([x]) => x)) + 1) * TILE_CELLS * CELL_SIZE;
    const inside = (p: P2) => p.x > lo && p.x < hi && p.z > lo && p.z < hi;
    const highway = [...city.roads.edges.values()].filter((e) => e.typeId === 'intercity');
    for (const e of highway) {
      // Wide bends, no kinks between pieces.
      expect(minTurnRadius(city.roads.curveOf(e))).toBeGreaterThan(40);
      for (const p of e.poly.points) expect(inside(p)).toBe(false);
    }
    // Consecutive highway pieces leave a shared node in the same direction (G1 continuity).
    for (const n of city.roads.nodes.values()) {
      const hw = n.edges.map((id) => city.roads.edges.get(id)!).filter((e) => e.typeId === 'intercity');
      if (hw.length !== 2) continue;
      const d1 = city.roads.directionFrom(hw[0], n.id);
      const d2 = city.roads.directionFrom(hw[1], n.id);
      expect(d1.x * d2.x + d1.z * d2.z).toBeLessThan(-0.97);
    }
    // Exactly one road enters the city: the link road.
    const entering = [...city.roads.edges.values()].filter((e) => e.poly.points.some(inside));
    expect(entering.map((e) => e.typeId)).toEqual(['citylink']);
  });

  it('smoothing keeps the ends and drops corners that would be too tight', () => {
    const zig: P2[] = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 110, z: 12 }, { x: 120, z: 0 }, { x: 300, z: 0 }];
    const relaxed = relaxCorners(zig, 60);
    expect(relaxed[0]).toEqual(zig[0]);
    expect(relaxed[relaxed.length - 1]).toEqual(zig[zig.length - 1]);
    const pieces = smoothPieces(relaxed);
    for (const q of pieces) expect(minTurnRadius({ p0: q.a, p1: q.c, p2: q.b })).toBeGreaterThanOrEqual(60);
    for (let i = 1; i < pieces.length; i++) expect(pieces[i].a).toEqual(pieces[i - 1].b);
  });
});

describe('Elevated roads', () => {
  it('pass over a lower road without a junction, on pillars, at bridge prices and without frontage', () => {
    const { cx, cz } = crossingSpot('city');
    const city = newCity();
    expect(build(city, free(cx - 100, cz), free(cx + 100, cz), 'city').valid).toBe(true);
    const ground = planRoad(city.roads, free(cx, cz - 100), free(cx, cz + 100), null, getRoadType('city'), city.plannerWorld, 1e9);
    const over = build(city, free(cx, cz - 100, 9), free(cx, cz + 100, 9), 'city');
    expect(over.errors).toEqual([]);
    // No junction: the ground road is not split, the raised one is a single piece.
    expect([...city.roads.nodes.values()].every((n) => n.edges.length < 3)).toBe(true);
    expect(city.roads.edges.size).toBe(2);
    expect(over.elevatedLength).toBeGreaterThan(150);
    expect(over.cost).toBeGreaterThan(ground.cost);
    const raised = [...city.roads.edges.values()].find((e) => city.roads.isElevated(e))!;
    expect(city.roads.elevationAt(raised, 0.5)).toBe(9);
    // No zoning along the raised road.
    const mid = raised.poly.points[Math.floor(raised.poly.points.length / 4)];
    const k = Math.floor(mid.z / CELL_SIZE) * GRID_CELLS + Math.floor((mid.x + 16) / CELL_SIZE);
    expect(city.zones.zoneable[k]).toBe(0);
    // Saved and loaded with its height.
    const copy = RoadGraph.deserialize(JSON.parse(JSON.stringify(city.roads.serialize())));
    expect([...copy.nodes.values()].filter((n) => n.y === 9).length).toBe(2);
  });

  it('roads too close in height can neither cross nor meet; narrow streets cannot be raised', () => {
    const { cx, cz } = crossingSpot('city');
    const city = newCity();
    build(city, free(cx - 100, cz), free(cx + 100, cz), 'city');
    const low = planRoad(city.roads, free(cx, cz - 100, 3), free(cx, cz + 100, 3), null, getRoadType('city'), city.plannerWorld, 1e9);
    expect(low.errors.some((e) => e.includes('Üst geçit'))).toBe(true);
    const street = planRoad(city.roads, free(cx + 300, cz - 100, 6), free(cx + 300, cz + 100, 6), null, getRoadType('street'), city.plannerWorld, 1e9);
    expect(street.errors.some((e) => e.includes('yükseltilemez'))).toBe(true);
  });
});

describe('Roundabouts', () => {
  it('turn a four-way crossing into a one-way ring that keeps every arm connected', () => {
    const { cx, cz } = crossingSpot('street');
    const city = newCity();
    build(city, free(cx - 100, cz), free(cx + 100, cz), 'street');
    build(city, free(cx, cz - 100), free(cx, cz + 100), 'street');
    const centre = [...city.roads.nodes.values()].find((n) => n.edges.length === 4)!;
    const ends = [...city.roads.nodes.values()].filter((n) => n.edges.length === 1).map((n) => n.id);
    const plan = city.planRoundabout(centre.id);
    expect(plan.errors).toEqual([]);
    const before = city.treasury.balance;
    expect(city.buildRoundabout(plan)).toBe(true);
    expect(city.treasury.balance).toBeLessThan(before);
    expect(city.roads.nodes.has(centre.id)).toBe(false);
    const ring = [...city.roads.edges.values()].filter((e) => e.typeId === ROUNDABOUT_TYPE);
    expect(ring.length).toBe(4);
    expect([...city.roads.nodes.values()].filter((n) => n.edges.length === 3).length).toBe(4);
    // Following the one-way ring from any arm reaches every other arm end.
    const reach = (from: number) => {
      const seen = new Set([from]);
      const todo = [from];
      while (todo.length) {
        const n = todo.pop()!;
        for (const id of city.roads.nodes.get(n)!.edges) {
          const e = city.roads.edges.get(id)!;
          const dir = city.roads.direction(e);
          const next = e.a === n ? (dir === -1 ? null : e.b) : dir === 1 ? null : e.a;
          if (next !== null && !seen.has(next)) seen.add(next), todo.push(next);
        }
      }
      return seen;
    };
    for (const a of ends) for (const b of ends) expect(reach(a).has(b)).toBe(true);
    // Traffic circulates with the centre on the driver's left (anticlockwise seen from above).
    for (const e of ring) {
      const p = sampleBezier(city.roads.curveOf(e), 2).points;
      const m = p[Math.floor(p.length / 2)];
      const t = { x: p[Math.floor(p.length / 2) + 1].x - m.x, z: p[Math.floor(p.length / 2) + 1].z - m.z };
      const toCentre = { x: cx - m.x, z: cz - m.z };
      // Left of travel direction (dx, dz) is (dz, −dx).
      expect(t.z * toCentre.x - t.x * toCentre.z).toBeGreaterThan(0);
    }
  });

  it('needs a junction of three or more roads', () => {
    const { cx, cz } = crossingSpot('street');
    const city = newCity();
    build(city, free(cx - 100, cz), free(cx + 100, cz), 'street');
    const end = [...city.roads.nodes.values()][0];
    expect(city.planRoundabout(end.id).valid).toBe(false);
  });
});

describe('Building catalogue', () => {
  it('has no futuristic style any more', () => {
    expect((ARCH_STYLES as readonly string[]).includes('futuristic')).toBe(false);
  });

  it('commercial districts grow high-rise hotels and casinos, kept out of height-limited districts', () => {
    const tall = zonedTemplates(ZoneType.Commercial, 3, [2, 2]).filter((b) => b.spec?.style === 'hotel' || b.spec?.style === 'casino');
    expect(tall.some((b) => b.spec!.style === 'hotel')).toBe(true);
    expect(tall.some((b) => b.spec!.style === 'casino')).toBe(true);
    for (const b of tall) expect(storeysOf(b)).toBeGreaterThan(HEIGHT_LIMITS[2]);
    const midRise = zonedTemplates(ZoneType.Commercial, 3, [2, 2], { height: 2 });
    expect(midRise.some((b) => b.spec?.style === 'hotel' || b.spec?.style === 'casino')).toBe(false);
  });
});
