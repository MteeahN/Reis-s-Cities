import { getRoadType } from '../../data/roads';
import { bezierLength, bezierPoint, polylineIntersections, sampleBezier, type P2, type QuadBezier } from '../../entities/road/curve';
import type { RoadGraph } from '../../entities/road/RoadGraph';
import { evaluatePath, MIN_EDGE_LENGTH, roadCost, weeklyMaintenance, type PlannerWorld } from './RoadPlanner';

/** Road type of the ring: a two-lane one-way road. */
export const ROUNDABOUT_TYPE = 'oneway2';
/** Widest angle one ring piece may sweep before an extra ring node is added. */
const MAX_ARC = (150 * Math.PI) / 180;
/** Narrowest angle between two neighbouring arms. */
const MIN_ARM_GAP = (30 * Math.PI) / 180;

interface Arm {
  edgeId: number;
  /** Bézier parameter where the arm is cut (the new ring junction). */
  t: number;
  /** The kept part runs from the cut to the arm's far end: true if the junction is the edge's node a. */
  fromA: boolean;
  point: P2;
  angle: number;
}

export interface RoundaboutPlan {
  nodeId: number;
  centre: P2;
  radius: number;
  arms: Arm[];
  /** Ring pieces in driving order (anticlockwise seen from above: the centre on the driver's left). */
  ring: QuadBezier[];
  /** Ring outline for the preview. */
  outline: P2[];
  cost: number;
  weeklyMaintenance: number;
  valid: boolean;
  errors: string[];
}

/** Point at arc length `d` from node a along an edge's polyline. */
function pointAtDistance(poly: { points: P2[]; cum: number[] }, d: number): P2 {
  const { points, cum } = poly;
  let i = 0;
  while (i < points.length - 2 && cum[i + 1] < d) i++;
  const seg = cum[i + 1] - cum[i] || 1;
  const f = Math.max(0, Math.min(1, (d - cum[i]) / seg));
  return { x: points[i].x + (points[i + 1].x - points[i].x) * f, z: points[i].z + (points[i + 1].z - points[i].z) * f };
}

/** Arc of the ring circle from angle a0 to a1 (radians) as a quadratic Bézier. */
function arc(c: P2, r: number, a0: number, a1: number, p0: P2, p2: P2): QuadBezier {
  const mid = (a0 + a1) / 2;
  const k = r / Math.cos((a1 - a0) / 2);
  return { p0, p1: { x: c.x + Math.cos(mid) * k, z: c.z + Math.sin(mid) * k }, p2 };
}

/**
 * Turns a junction of three or more roads into a roundabout: every arm is
 * cut back to a ring around the junction, and a one-way ring road joins the
 * cut ends so traffic circulates with the centre on its left and yields at
 * the entries instead of crossing. Checks land, buildings, water, nearby
 * roads and arm lengths, and prices the ring like any road.
 */
export function planRoundabout(graph: RoadGraph, nodeId: number, world: PlannerWorld, budget: number): RoundaboutPlan {
  const node = graph.nodes.get(nodeId);
  const errors: string[] = [];
  const type = getRoadType(ROUNDABOUT_TYPE);
  const centre = node ? { x: node.x, z: node.z } : { x: 0, z: 0 };
  const empty: RoundaboutPlan = { nodeId, centre, radius: 0, arms: [], ring: [], outline: [], cost: 0, weeklyMaintenance: 0, valid: false, errors };
  if (!node) {
    errors.push('Kavşak bulunamadı');
    return empty;
  }
  if (node.edges.length < 3) {
    errors.push('Döner kavşak için en az 3 yol birleşmeli');
    return empty;
  }
  if (node.edges.length > 6) {
    errors.push('Döner kavşağa en fazla 6 yol bağlanabilir');
    return empty;
  }
  let widest = 0;
  for (const id of node.edges) {
    const t = getRoadType(graph.edges.get(id)!.typeId);
    if (t.playerBuildable === false) errors.push('Şehir girişi değiştirilemez');
    widest = Math.max(widest, t.width);
  }
  const radius = Math.max(18, widest * 0.6 + type.width / 2 + 6);

  const arms: Arm[] = [];
  let short = false;
  for (const id of node.edges) {
    const e = graph.edges.get(id)!;
    const fromA = e.a === nodeId;
    if (e.length < radius + MIN_EDGE_LENGTH) {
      short = true;
      continue;
    }
    const t = graph.closestOnEdge(e, pointAtDistance(e.poly, fromA ? radius : e.length - radius)).t;
    const p = bezierPoint(graph.curveOf(e), t);
    arms.push({ edgeId: id, t, fromA, point: p, angle: Math.atan2(p.z - centre.z, p.x - centre.x) });
  }
  if (short) errors.push(`Kavşağa bağlanan yollar döner kavşak için çok kısa (en az ${Math.ceil(radius + MIN_EDGE_LENGTH)} m)`);
  if (errors.length) return { ...empty, radius, errors: [...new Set(errors)] };

  arms.sort((a, b) => a.angle - b.angle);
  // Ring stops: the arm cuts, plus extra points on wide gaps (all on the circle, ascending angle).
  const stops: { angle: number; point: P2 }[] = [];
  for (let i = 0; i < arms.length; i++) {
    const a = arms[i];
    const next = arms[(i + 1) % arms.length];
    const gap = (next.angle - a.angle + Math.PI * 2) % (Math.PI * 2) || Math.PI * 2;
    if (gap < MIN_ARM_GAP) errors.push('Yollar kavşağa çok dar açıyla giriyor');
    stops.push({ angle: a.angle, point: a.point });
    const extra = Math.ceil(gap / MAX_ARC) - 1;
    for (let k = 1; k <= extra; k++) {
      const ang = a.angle + (gap * k) / (extra + 1);
      stops.push({ angle: ang, point: { x: centre.x + Math.cos(ang) * radius, z: centre.z + Math.sin(ang) * radius } });
    }
  }
  // Drive with decreasing angle: from stop i+1 to stop i (the centre is then on the left).
  const ring: QuadBezier[] = [];
  for (let i = 0; i < stops.length; i++) {
    const from = stops[(i + 1) % stops.length];
    const to = stops[i];
    let a1 = from.angle;
    const a0 = to.angle;
    if (a1 <= a0) a1 += Math.PI * 2;
    // Arm cuts sit near (not exactly on) the circle: use their mean distance.
    const r = (Math.hypot(from.point.x - centre.x, from.point.z - centre.z) + Math.hypot(to.point.x - centre.x, to.point.z - centre.z)) / 2;
    const q = arc(centre, r, a0, a1, to.point, from.point);
    ring.push({ p0: q.p2, p1: q.p1, p2: q.p0 });
  }

  // Land, buildings, water, slope; no other road may cross the ring.
  const elev = node.y ?? 0;
  const armIds = new Set(node.edges);
  let cost = 0;
  let maintenance = 0;
  const outline: P2[] = [];
  let crossing = false;
  for (const q of ring) {
    const m = evaluatePath(q, { ...type, minRadius: 0 }, world, elev, elev);
    errors.push(...m.errors);
    cost += roadCost(type, m.length, m.bridgeLength + m.elevatedLength);
    maintenance += weeklyMaintenance(type, m.length, m.bridgeLength + m.elevatedLength);
    const pts = sampleBezier(q, 2).points;
    outline.push(...(outline.length ? pts.slice(1) : pts));
    const xs = pts.map((p) => p.x);
    const zs = pts.map((p) => p.z);
    for (const e of graph.edgesInBox(Math.min(...xs) - 2, Math.min(...zs) - 2, Math.max(...xs) + 2, Math.max(...zs) + 2)) {
      if (armIds.has(e.id)) continue;
      if (polylineIntersections(pts, sampleBezier(graph.curveOf(e), 2).points).length) crossing = true;
    }
    if (bezierLength(q) < MIN_EDGE_LENGTH) errors.push('Yollar kavşağa çok dar açıyla giriyor');
  }
  if (crossing) errors.push('Döner kavşak başka bir yolla kesişiyor');
  if (cost > budget) errors.push('Yetersiz bütçe');
  const uniq = [...new Set(errors)];
  return { nodeId, centre, radius, arms, ring, outline, cost, weeklyMaintenance: maintenance, valid: uniq.length === 0, errors: uniq };
}

/** Applies a valid plan: cuts the arms, removes the old junction and builds the ring. */
export function commitRoundabout(graph: RoadGraph, plan: RoundaboutPlan): number[] {
  if (!plan.valid) throw new Error('commitRoundabout: invalid plan');
  const elev = graph.nodes.get(plan.nodeId)?.y ?? 0;
  return graph.batch(() => {
    // Ring stop → node id (arm cuts by their point, extra stops get new nodes).
    const nodeAt = new Map<string, number>();
    const key = (p: P2) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`;
    for (const arm of plan.arms) {
      const { node, left, right } = graph.splitEdge(arm.edgeId, arm.t);
      // Drop the stub between the cut and the old junction.
      graph.removeEdge(arm.fromA ? left.id : right.id);
      nodeAt.set(key(arm.point), node.id);
    }
    const created: number[] = [];
    const total = plan.ring.reduce((s, q) => s + bezierLength(q), 0) || 1;
    const nodeFor = (p: P2) => {
      let id = nodeAt.get(key(p));
      if (id === undefined) {
        id = graph.addNode(p.x, p.z, elev).id;
        nodeAt.set(key(p), id);
      }
      return id;
    };
    for (const q of plan.ring) {
      const e = graph.addEdge(nodeFor(q.p0), nodeFor(q.p2), ROUNDABOUT_TYPE, q.p1, (plan.cost * bezierLength(q)) / total);
      created.push(e.id);
    }
    return created;
  });
}
