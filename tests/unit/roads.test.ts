import { describe, expect, it, vi } from 'vitest';
import {
  bezierLength,
  bezierPoint,
  closestOnBezier,
  minTurnRadius,
  polylineIntersections,
  splitBezier,
  straightBezier,
  subBezier,
  type QuadBezier,
} from '../../src/game/entities/road/curve';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { buildEdgeMesh, nodeSurfaceHeight, roadProfile, BRIDGE_DECK } from '../../src/game/rendering/roads/roadGeometry';
import { Occupancy, rasterizePolyline } from '../../src/game/world/Occupancy';

const arc: QuadBezier = { p0: { x: 0, z: 0 }, p1: { x: 50, z: 100 }, p2: { x: 100, z: 0 } };

describe('Bézier curves', () => {
  it('straight Bézier has the segment length and infinite radius', () => {
    const b = straightBezier({ x: 0, z: 0 }, { x: 30, z: 40 });
    expect(bezierLength(b)).toBeCloseTo(50, 3);
    expect(minTurnRadius(b)).toBe(Infinity);
  });

  it('split halves reproduce the original curve', () => {
    const [l, r] = splitBezier(arc, 0.3);
    const p = bezierPoint(arc, 0.15);
    const q = bezierPoint(l, 0.5);
    expect(q.x).toBeCloseTo(p.x);
    expect(q.z).toBeCloseTo(p.z);
    expect(bezierLength(l) + bezierLength(r)).toBeCloseTo(bezierLength(arc), 1);
  });

  it('subBezier extracts the requested interval', () => {
    const s = subBezier(arc, 0.25, 0.75);
    const a = bezierPoint(arc, 0.25);
    const b = bezierPoint(arc, 0.75);
    expect(s.p0.x).toBeCloseTo(a.x);
    expect(s.p2.x).toBeCloseTo(b.x);
    expect(bezierPoint(s, 0.5).z).toBeCloseTo(bezierPoint(arc, 0.5).z);
  });

  it('finds the closest point on the curve', () => {
    const r = closestOnBezier(arc, { x: 50, z: 80 });
    expect(r.t).toBeCloseTo(0.5, 2);
    expect(r.dist).toBeCloseTo(30, 1);
  });

  it('finds polyline crossings', () => {
    const a = [{ x: 0, z: 0 }, { x: 10, z: 10 }];
    const b = [{ x: 0, z: 10 }, { x: 10, z: 0 }];
    const hits = polylineIntersections(a, b);
    expect(hits).toHaveLength(1);
    expect(hits[0].point.x).toBeCloseTo(5);
    expect(hits[0].ta).toBeCloseTo(0.5);
  });
});

describe('RoadGraph', () => {
  it('adds, queries and removes edges, cleaning up orphan nodes', () => {
    const g = new RoadGraph();
    const a = g.addNode(0, 0);
    const b = g.addNode(100, 0);
    const e = g.addEdge(a.id, b.id, 'street', { x: 50, z: 0 }, 1200);
    expect(e.length).toBeCloseTo(100);
    expect(g.nearestNode(98, 3, 6)?.id).toBe(b.id);
    expect(g.nearestEdge(50, 3, 5)?.edge.id).toBe(e.id);
    expect(g.nearestEdge(50, 30, 5)).toBeNull();
    g.removeEdge(e.id);
    expect(g.edges.size).toBe(0);
    expect(g.nodes.size).toBe(0);
  });

  it('splits an edge into two with a shared junction and proportional cost', () => {
    const g = new RoadGraph();
    const a = g.addNode(0, 0);
    const b = g.addNode(100, 0);
    const e = g.addEdge(a.id, b.id, 'street', { x: 50, z: 0 }, 1000);
    const { node, left, right } = g.splitEdge(e.id, 0.25);
    expect(node.x).toBeCloseTo(25);
    expect(node.edges).toHaveLength(2);
    expect(left.cost).toBeCloseTo(250);
    expect(right.cost).toBeCloseTo(750);
    expect(g.edges.has(e.id)).toBe(false);
  });

  it('batches change notifications', () => {
    const g = new RoadGraph();
    const fn = vi.fn();
    g.onChange(fn);
    const a = g.addNode(0, 0);
    const b = g.addNode(100, 0);
    const e = g.addEdge(a.id, b.id, 'street', { x: 50, z: 0 }, 1000);
    expect(fn).toHaveBeenCalledTimes(1);
    g.splitEdge(e.id, 0.5);
    expect(fn).toHaveBeenCalledTimes(2);
    const change = fn.mock.calls[1][0];
    expect(change.removed).toEqual([e.id]);
    expect(change.added).toHaveLength(2);
  });

  it('round-trips through serialization', () => {
    const g = new RoadGraph();
    const a = g.addNode(0, 0);
    const b = g.addNode(100, 40);
    g.addEdge(a.id, b.id, 'city', { x: 60, z: 0 }, 2000);
    const copy = RoadGraph.deserialize(JSON.parse(JSON.stringify(g.serialize())));
    expect(copy.edges.size).toBe(1);
    const e = [...copy.edges.values()][0];
    expect(e.typeId).toBe('city');
    expect(e.length).toBeCloseTo([...g.edges.values()][0].length);
    expect(copy.addNode(1, 1).id).toBeGreaterThan(Math.max(a.id, b.id));
  });
});

describe('road geometry', () => {
  it('lifts the profile to a bridge deck over water with limited ramps', () => {
    const heightAt = (x: number) => (x > 90 && x < 150 ? -3 : 6);
    const prof = roadProfile(straightBezier({ x: 0, z: 0 }, { x: 240, z: 0 }), 12, 6, 6, heightAt);
    const mid = prof.heights[Math.floor(prof.heights.length / 2)];
    expect(mid).toBeGreaterThanOrEqual(BRIDGE_DECK - 0.5);
    for (let i = 1; i < prof.heights.length; i++) {
      const grade = Math.abs(prof.heights[i] - prof.heights[i - 1]) / (prof.cum[i] - prof.cum[i - 1]);
      expect(grade).toBeLessThan(0.16);
    }
    expect(prof.heights[0]).toBeCloseTo(6);
  });

  it('builds a ribbon mesh with pillars for long bridges', () => {
    const heightAt = (x: number) => (x > 60 && x < 200 ? -4 : 6);
    const mesh = buildEdgeMesh(straightBezier({ x: 0, z: 0 }, { x: 260, z: 0 }), 12, 6, 6, heightAt);
    expect(mesh.positions.length % 18).toBe(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.pillars.length).toBeGreaterThan(1);
  });

  it('junction height covers the highest ground under it', () => {
    expect(nodeSurfaceHeight({ x: 0, z: 0 }, 6, (x) => 5 + x * 0.1)).toBeGreaterThan(5.3);
  });
});

describe('Occupancy', () => {
  it('rasterizes a road onto the cells it covers and ref-counts overlaps', () => {
    const cells = rasterizePolyline([{ x: 100, z: 104 }, { x: 200, z: 104 }], 4.5);
    expect(cells.length).toBeGreaterThanOrEqual(12);
    const o = new Occupancy();
    o.setRoad(1, [{ x: 100, z: 104 }, { x: 200, z: 104 }], 8);
    o.setRoad(2, [{ x: 150, z: 60 }, { x: 150, z: 160 }], 8);
    expect(o.hasRoad(18, 13)).toBe(true); // x=148..156, z=104..112
    o.clearRoad(1);
    expect(o.hasRoad(18, 13)).toBe(true); // still covered by road 2
    o.clearRoad(2);
    expect(o.hasRoad(18, 13)).toBe(false);
  });
});
