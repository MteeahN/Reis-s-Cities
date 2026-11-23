import { describe, expect, it } from 'vitest';
import { CELL_SIZE } from '../../src/game/core/config';
import { ROAD_TYPES, getRoadType, isRoadTypeUnlocked } from '../../src/game/data/roads';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import {
  commitRoad,
  MIN_ROAD_LENGTH,
  planRoad,
  planUpgrade,
  type Anchor,
  type PlannerWorld,
} from '../../src/game/tools/placement/RoadPlanner';
import { headingDeg, snapSegment, snapToGrid } from '../../src/game/tools/placement/snapping';
import { pickGround } from '../../src/game/world/TerrainPicker';

const world = (heightAt: (x: number, z: number) => number = () => 10, opts: { unlocked?: boolean; building?: (i: number, j: number) => number } = {}): PlannerWorld => ({
  heightAt,
  isCellUnlocked: () => opts.unlocked ?? true,
  buildingAt: opts.building ?? (() => 0),
});
const free = (x: number, z: number): Anchor => ({ kind: 'free', point: { x, z } });
const BUDGET = 1e9;
const street = getRoadType('street');
const city = getRoadType('city');

describe('snapping', () => {
  it('snaps points to cell corners', () => {
    expect(snapToGrid({ x: 13, z: 3.9 })).toEqual({ x: 16, z: 0 });
  });

  it('snaps segments to 15° steps and grid-multiple lengths', () => {
    const end = snapSegment({ x: 0, z: 0 }, { x: 100, z: 3 });
    expect(end.z).toBeCloseTo(0);
    expect(end.x).toBeCloseTo(104);
    const diag = snapSegment({ x: 0, z: 0 }, { x: 50, z: 52 });
    expect(headingDeg({ x: 0, z: 0 }, diag)).toBeCloseTo(45);
  });

  it('snaps angles relative to a base direction', () => {
    const base = (10 * Math.PI) / 180;
    const end = snapSegment({ x: 0, z: 0 }, { x: 100, z: 18 }, 15, 8, base);
    expect(headingDeg({ x: 0, z: 0 }, end)).toBeCloseTo(10);
  });
});

describe('road catalogue', () => {
  it('has unique ids and the starting roads unlocked at 0 population', () => {
    expect(new Set(ROAD_TYPES.map((t) => t.id)).size).toBe(ROAD_TYPES.length);
    expect(isRoadTypeUnlocked(street, 0)).toBe(true);
    expect(isRoadTypeUnlocked(getRoadType('avenue'), 0)).toBe(false);
    expect(() => getRoadType('nope')).toThrow();
  });
});

describe('planRoad — validation', () => {
  const g = new RoadGraph();

  it('accepts a flat road on owned land and prices it per metre', () => {
    const plan = planRoad(g, free(800, 800), free(900, 800), null, street, world(), BUDGET);
    expect(plan.errors).toEqual([]);
    expect(plan.length).toBeCloseTo(100, 0);
    expect(plan.cost).toBe(Math.round(plan.length * street.costPerMeter));
  });

  it('rejects short roads, locked land, out of bounds, buildings and missing budget', () => {
    expect(planRoad(g, free(800, 800), free(800 + MIN_ROAD_LENGTH - 2, 800), null, street, world(), BUDGET).valid).toBe(false);
    expect(planRoad(g, free(800, 800), free(900, 800), null, street, world(undefined, { unlocked: false }), BUDGET).errors).toContain('Satın alınmamış arazi');
    expect(planRoad(g, free(50, 50), free(-50, 50), null, street, world(), BUDGET).errors).toContain('Harita sınırlarının dışında');
    const blocked = world(undefined, { building: (i, j) => (i === 106 && j === 100 ? 7 : 0) });
    expect(planRoad(g, free(800, 804), free(900, 804), null, street, blocked, BUDGET).errors).toContain('Yol bir binanın üzerinden geçiyor');
    expect(planRoad(g, free(800, 800), free(900, 800), null, street, world(), 10).errors).toContain('Yetersiz bütçe');
  });

  it('rejects steep grades', () => {
    const plan = planRoad(g, free(800, 800), free(900, 800), null, street, world((x) => x * 0.3), BUDGET);
    expect(plan.valid).toBe(false);
    expect(plan.maxGrade).toBeCloseTo(0.3, 1);
  });

  it('requires a bridge-capable type to cross water and charges for the span', () => {
    const river = world((x) => (x > 840 && x < 860 ? -3 : 8));
    expect(planRoad(g, free(800, 800), free(900, 800), null, street, river, BUDGET).valid).toBe(false);
    const b = planRoad(g, free(800, 800), free(900, 800), null, city, river, BUDGET);
    expect(b.errors).toEqual([]);
    expect(b.bridgeLength).toBeGreaterThan(15);
    expect(b.cost).toBeGreaterThan(100 * city.costPerMeter);
  });

  it('ignores steep river banks at bridge abutments', () => {
    const banks = world((x) => (x > 840 && x < 860 ? -3 : x > 824 && x < 876 ? 8 - (16 - Math.min(Math.abs(x - 840), Math.abs(x - 860))) * 0.5 : 8));
    expect(planRoad(g, free(760, 800), free(940, 800), null, city, banks, BUDGET).errors).toEqual([]);
  });

  it('rejects curves tighter than the type allows', () => {
    const tight = planRoad(g, free(800, 800), free(820, 800), { x: 810, z: 830 }, street, world(), BUDGET);
    expect(tight.errors.some((e) => e.startsWith('Viraj çok keskin'))).toBe(true);
    const gentle = planRoad(g, free(800, 800), free(960, 800), { x: 880, z: 860 }, street, world(), BUDGET);
    expect(gentle.errors).toEqual([]);
  });
});

describe('planRoad + commitRoad — network topology', () => {
  it('crossing two roads creates a 4-way junction', () => {
    const g = new RoadGraph();
    commitRoad(g, planRoad(g, free(800, 900), free(1000, 900), null, street, world(), BUDGET));
    const plan = planRoad(g, free(900, 800), free(900, 1000), null, street, world(), BUDGET);
    expect(plan.errors).toEqual([]);
    expect(plan.newJunctions).toBe(1);
    commitRoad(g, plan);
    expect(g.edges.size).toBe(4);
    const junction = [...g.nodes.values()].find((n) => n.edges.length === 4)!;
    expect(junction).toBeDefined();
    expect(junction.x).toBeCloseTo(900, 0);
    expect(junction.z).toBeCloseTo(900, 0);
    expect(g.stats().junctions).toBe(1);
    expect(g.stats().deadEnds).toBe(4);
  });

  it('connecting onto the middle of a road splits it into a T-junction', () => {
    const g = new RoadGraph();
    commitRoad(g, planRoad(g, free(800, 900), free(1000, 900), null, street, world(), BUDGET));
    const e = [...g.edges.values()][0];
    const t = g.closestOnEdge(e, { x: 900, z: 900 });
    const plan = planRoad(g, { kind: 'edge', edgeId: e.id, t: t.t, point: t.point }, free(900, 1000), null, street, world(), BUDGET);
    expect(plan.errors).toEqual([]);
    commitRoad(g, plan);
    expect(g.edges.size).toBe(3);
    expect([...g.nodes.values()].some((n) => n.edges.length === 3)).toBe(true);
  });

  it('chains from an existing end node without duplicating it', () => {
    const g = new RoadGraph();
    const first = commitRoad(g, planRoad(g, free(800, 900), free(900, 900), null, street, world(), BUDGET));
    const n = g.nodes.get(first.endNode)!;
    commitRoad(g, planRoad(g, { kind: 'node', nodeId: n.id, point: { x: n.x, z: n.z } }, free(1000, 960), null, street, world(), BUDGET));
    expect(g.nodes.size).toBe(3);
    expect(g.nodes.get(first.endNode)!.edges.length).toBe(2);
  });

  it('crossing one road twice with a curve splits it at both points', () => {
    const g = new RoadGraph();
    commitRoad(g, planRoad(g, free(700, 900), free(1100, 900), null, street, world(), BUDGET));
    const plan = planRoad(g, free(780, 860), free(1020, 860), { x: 900, z: 1000 }, street, world(), BUDGET);
    expect(plan.errors).toEqual([]);
    expect(plan.cuts.length).toBe(2);
    commitRoad(g, plan);
    expect([...g.nodes.values()].filter((n) => n.edges.length === 4).length).toBe(2);
    expect(g.edges.size).toBe(6);
  });

  it('rejects junctions that are too close together or at sharp angles', () => {
    const g = new RoadGraph();
    commitRoad(g, planRoad(g, free(800, 900), free(1000, 900), null, street, world(), BUDGET));
    // Starts 3 m before crossing an existing road: the junction would sit on the road end.
    const close = planRoad(g, free(900, 897), free(900, 1000), null, street, world(), BUDGET);
    expect(close.errors).toContain('Kavşaklar birbirine çok yakın');
    // A parallel road 6 m away overlaps the 8 m-wide road.
    expect(planRoad(g, free(800, 906), free(1000, 906), null, street, world(), BUDGET).errors).toContain('Mevcut bir yolla çakışıyor');
    const shallow = planRoad(g, free(850, 880), free(1000, 920), null, street, world(), BUDGET);
    expect(shallow.errors.some((e) => e.startsWith('Yollar çok dar açıyla'))).toBe(true);
  });

  it('rejects a free end that touches a road without connecting to it', () => {
    const g = new RoadGraph();
    commitRoad(g, planRoad(g, free(800, 900), free(1000, 900), null, street, world(), BUDGET));
    const plan = planRoad(g, free(900, 907), free(900, 1000), null, street, world(), BUDGET);
    expect(plan.errors.some((e) => e.startsWith('Yol ucu mevcut bir yola değiyor'))).toBe(true);
    // Clearly separate ends are fine.
    expect(planRoad(g, free(900, 920), free(900, 1000), null, street, world(), BUDGET).errors).toEqual([]);
  });

  it('rejects a road laid on top of an existing one', () => {
    const g = new RoadGraph();
    commitRoad(g, planRoad(g, free(800, 900), free(1000, 900), null, street, world(), BUDGET));
    const dup = planRoad(g, free(780, 902), free(1020, 902), null, street, world(), BUDGET);
    expect(dup.valid).toBe(false);
  });

  it('shares the cost across the new pieces', () => {
    const g = new RoadGraph();
    commitRoad(g, planRoad(g, free(800, 900), free(1000, 900), null, street, world(), BUDGET));
    const before = [...g.edges.values()].reduce((s, e) => s + e.cost, 0);
    const plan = planRoad(g, free(900, 800), free(900, 1000), null, street, world(), BUDGET);
    commitRoad(g, plan);
    const after = [...g.edges.values()].reduce((s, e) => s + e.cost, 0);
    expect(after).toBeCloseTo(before + plan.cost, 0);
  });
});

describe('planUpgrade', () => {
  it('charges the new road minus a 50% refund of the old one', () => {
    const g = new RoadGraph();
    commitRoad(g, planRoad(g, free(800, 900), free(1000, 900), null, street, world(), BUDGET));
    const e = [...g.edges.values()][0];
    const up = planUpgrade(g, e, city, world(), BUDGET);
    expect(up.valid).toBe(true);
    expect(up.refund).toBe(Math.round(e.cost / 2));
    expect(up.netCost).toBe(up.cost - up.refund);
    expect(planUpgrade(g, e, street, world(), BUDGET).valid).toBe(false); // same type
  });
});

describe('pickGround', () => {
  it('hits a flat plane exactly', () => {
    const hit = pickGround({ x: 0, y: 100, z: 0 }, { x: 0.6, y: -0.8, z: 0 }, () => 20);
    expect(hit!.x).toBeCloseTo(60, 1);
    expect(hit!.y).toBeCloseTo(20);
  });

  it('returns null for rays pointing to the sky', () => {
    expect(pickGround({ x: 0, y: 50, z: 0 }, { x: 0, y: 1, z: 0 }, () => 0)).toBeNull();
  });
});

void CELL_SIZE;
