import { CELL_SIZE, GRID_CELLS, WATER_LEVEL, WORLD_SIZE } from '../../core/config';
import { getRoadType, type RoadSurface, type RoadTypeDef } from '../../data/roads';
import {
  bezierLength,
  bezierPoint,
  bezierTangent,
  crossingAngle,
  directedAngle,
  minTurnRadius,
  polylineIntersections,
  sampleBezier,
  straightBezier,
  subBezier,
  type P2,
  type QuadBezier,
} from '../../entities/road/curve';
import type { RoadEdge, RoadGraph } from '../../entities/road/RoadGraph';

/** Minimal world queries the planner needs — keeps it pure and testable. */
export interface PlannerWorld {
  heightAt(x: number, z: number): number;
  isCellUnlocked(i: number, j: number): boolean;
  /** Building id occupying a cell, or 0. */
  buildingAt(i: number, j: number): number;
}

export type Anchor =
  | { kind: 'node'; nodeId: number; point: P2 }
  | { kind: 'edge'; edgeId: number; t: number; point: P2 }
  | { kind: 'free'; point: P2; /** Deck height above the ground (m). */ elev?: number };

interface Cut {
  /** Bézier parameter along the new road. */
  t: number;
  key: string;
  /** Existing node reused at this cut (instead of splitting an edge). */
  nodeId?: number;
}

export interface EdgeSplit {
  edgeId: number;
  t: number;
  key: string;
}

export interface RoadPlan {
  typeId: string;
  /** Paving of the new road (absent: asphalt). */
  surface?: RoadSurface;
  start: Anchor;
  end: Anchor;
  curve: QuadBezier;
  /** Interior junction points along the new road, sorted by t. */
  cuts: Cut[];
  splits: EdgeSplit[];
  points: P2[];
  length: number;
  bridgeLength: number;
  maxGrade: number;
  cost: number;
  weeklyMaintenance: number;
  /** Number of new junctions this road creates with existing roads. */
  newJunctions: number;
  /** Deck height above the ground at the start and end (m). */
  elevA: number;
  elevB: number;
  /** Length raised on pillars over dry land (m). */
  elevatedLength: number;
  valid: boolean;
  errors: string[];
}

export const MIN_ROAD_LENGTH = 12;
export const MIN_EDGE_LENGTH = 8;
export const MIN_CROSSING_ANGLE = (25 * Math.PI) / 180;
export const MAX_BRIDGE_LENGTH = 320;
export const NODE_SNAP = 6;
/** Height steps of the road tool and the highest deck (m). */
export const ELEVATION_STEP = 3;
export const MAX_ELEVATION = 24;
/** Height difference at which roads pass over each other instead of meeting (m). */
export const OVERPASS_CLEARANCE = 6;
/** Deck height above which a road stands on pillars and is built like a bridge (m). */
const RAISED = 2;
const SAMPLE_STEP = 4;
const GRADE_WINDOW = 16;
const ABUTMENT_LENGTH = 24;

const isWaterH = (h: number) => h < WATER_LEVEL + 0.3;

export interface PathMetrics {
  length: number;
  bridgeLength: number;
  elevatedLength: number;
  maxGrade: number;
  errors: string[];
}

/**
 * Terrain/land checks shared by new roads and upgrades: bounds, owned land,
 * buildings in the way, water crossings (bridges), grade and curvature.
 */
export function evaluatePath(curve: QuadBezier, type: RoadTypeDef, world: PlannerWorld, elevA = 0, elevB = 0): PathMetrics {
  const poly = sampleBezier(curve, SAMPLE_STEP);
  const pts = poly.points;
  const n = pts.length - 1;
  const step = poly.length / Math.max(1, n);
  const errors: string[] = [];
  const heights: number[] = [];
  const ground: number[] = [];
  let bridgeLength = 0;
  let elevatedLength = 0;
  let outOfBounds = false;
  let locked = false;
  let building = false;
  const half = type.width / 2;
  const tan = { x: 0, z: 0 };

  for (let s = 0; s <= n; s++) {
    const p = pts[s];
    if (p.x < 0 || p.z < 0 || p.x > WORLD_SIZE || p.z > WORLD_SIZE) {
      outOfBounds = true;
      heights.push(WATER_LEVEL + 1);
      ground.push(WATER_LEVEL + 1);
      continue;
    }
    const ci = Math.min(Math.floor(p.x / CELL_SIZE), GRID_CELLS - 1);
    const cj = Math.min(Math.floor(p.z / CELL_SIZE), GRID_CELLS - 1);
    if (!world.isCellUnlocked(ci, cj)) locked = true;
    bezierTangent(curve, s / Math.max(1, n), tan);
    // Centre and both edges of the carriageway must be clear of buildings.
    for (const off of [-half + 0.5, 0, half - 0.5]) {
      const x = p.x - tan.z * off;
      const z = p.z + tan.x * off;
      const bi = Math.floor(x / CELL_SIZE);
      const bj = Math.floor(z / CELL_SIZE);
      if (bi >= 0 && bj >= 0 && bi < GRID_CELLS && bj < GRID_CELLS && world.buildingAt(bi, bj) !== 0) building = true;
    }
    const h = world.heightAt(p.x, p.z);
    const elev = elevA + ((elevB - elevA) * s) / Math.max(1, n);
    if (isWaterH(h) && s > 0) bridgeLength += step;
    else if (elev >= RAISED && s > 0) elevatedLength += step;
    ground.push(h);
    heights.push(h + elev);
  }

  // Grade over a sliding window; bridge spans and abutments are excluded.
  const abut = Math.ceil(ABUTMENT_LENGTH / step);
  const nearWater = new Uint8Array(n + 1);
  for (let s = 0; s <= n; s++) {
    if (isWaterH(ground[s])) {
      for (let k = Math.max(0, s - abut); k <= Math.min(n, s + abut); k++) nearWater[k] = 1;
    }
  }
  let maxGrade = 0;
  const win = Math.max(1, Math.round(GRADE_WINDOW / step));
  for (let s = 0; s + win <= n; s++) {
    if (nearWater[s] || nearWater[s + win]) continue;
    maxGrade = Math.max(maxGrade, Math.abs(heights[s + win] - heights[s]) / (step * win));
  }

  if (outOfBounds) errors.push('Harita sınırlarının dışında');
  if (locked) errors.push('Satın alınmamış arazi');
  if (building) errors.push('Yol bir binanın üzerinden geçiyor');
  if (bridgeLength > 0 && !type.allowsBridge) errors.push(`${type.name} suyu geçemez (köprü için Şehir Yolu seçin)`);
  if (elevatedLength > 0 && !type.allowsBridge) errors.push(`${type.name} yükseltilemez (Şehir Yolu veya daha geniş bir yol seçin)`);
  if (bridgeLength > MAX_BRIDGE_LENGTH) errors.push(`Köprü çok uzun (en fazla ${MAX_BRIDGE_LENGTH} m)`);
  if (maxGrade > type.maxGrade) errors.push(`Eğim çok yüksek (%${Math.round(maxGrade * 100)} > %${Math.round(type.maxGrade * 100)})`);
  const radius = minTurnRadius(curve);
  if (radius < type.minRadius) errors.push(`Viraj çok keskin (yarıçap ${Math.round(radius)} m < ${type.minRadius} m)`);

  return { length: poly.length, bridgeLength, elevatedLength, maxGrade, errors };
}

export function roadCost(type: RoadTypeDef, length: number, bridgeLength: number): number {
  const land = Math.max(0, length - bridgeLength);
  return Math.round(land * type.costPerMeter + bridgeLength * type.costPerMeter * type.bridgeCostMultiplier);
}

export function weeklyMaintenance(type: RoadTypeDef, length: number, bridgeLength: number): number {
  return Math.round(length * type.maintenancePerMeter * (1 + (bridgeLength / Math.max(1, length)) * 1.5));
}

/** Deck height above the ground at an anchor (m). */
export function anchorElevation(graph: RoadGraph, a: Anchor): number {
  if (a.kind === 'node') return graph.nodes.get(a.nodeId)?.y ?? 0;
  if (a.kind === 'edge') {
    const e = graph.edges.get(a.edgeId);
    return e ? graph.elevationAt(e, a.t) : 0;
  }
  return Math.max(0, a.elev ?? 0);
}

function incidentEdgeIds(graph: RoadGraph, a: Anchor): Set<number> {
  if (a.kind === 'node') return new Set(graph.nodes.get(a.nodeId)?.edges ?? []);
  if (a.kind === 'edge') return new Set([a.edgeId]);
  return new Set();
}

/**
 * Plans a road from `start` to `end` (optionally curved through `control`):
 * finds every crossing with the existing network (each becomes a junction),
 * checks geometry/terrain/land rules and computes the cost.
 */
export function planRoad(
  graph: RoadGraph,
  start: Anchor,
  end: Anchor,
  control: P2 | null,
  type: RoadTypeDef,
  world: PlannerWorld,
  budget: number,
): RoadPlan {
  const curve: QuadBezier = control
    ? { p0: { ...start.point }, p1: { ...control }, p2: { ...end.point } }
    : straightBezier(start.point, end.point);
  const elevA = anchorElevation(graph, start);
  const elevB = anchorElevation(graph, end);
  const elevAt = (t: number) => elevA + (elevB - elevA) * t;
  const metrics = evaluatePath(curve, type, world, elevA, elevB);
  const errors = [...metrics.errors];
  const poly = sampleBezier(curve, 2);
  const length = metrics.length;

  if (length < MIN_ROAD_LENGTH) errors.unshift(`Yol çok kısa (en az ${MIN_ROAD_LENGTH} m)`);
  if (start.kind === 'node' && end.kind === 'node' && start.nodeId === end.nodeId) errors.push('Yol aynı noktada başlayıp bitemez');

  // ---- crossings with existing roads
  const cuts: Cut[] = [];
  const splits: EdgeSplit[] = [];
  const startIgnore = incidentEdgeIds(graph, start);
  const endIgnore = incidentEdgeIds(graph, end);
  const endpointZone = Math.max(4, type.width * 0.6);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const p of poly.points) {
    minX = Math.min(minX, p.x);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxZ = Math.max(maxZ, p.z);
  }
  let tooClose = false;
  let sharpCrossing = false;
  let junctionOnBridge = false;
  let lowClearance = false;
  const tanNew = { x: 0, z: 0 };
  const tanOld = { x: 0, z: 0 };
  let k = 0;
  for (const e of graph.edgesInBox(minX - 2, minZ - 2, maxX + 2, maxZ + 2)) {
    const ecurve = graph.curveOf(e);
    const epoly = sampleBezier(ecurve, 2);
    for (const hit of polylineIntersections(poly.points, epoly.points)) {
      const dStart = hit.ta * length;
      const dEnd = (1 - hit.ta) * length;
      const atStart = dStart < endpointZone;
      const atEnd = dEnd < endpointZone;
      if ((atStart && startIgnore.has(e.id)) || (atEnd && endIgnore.has(e.id))) continue;
      // Different heights: an overpass, not a junction.
      const dy = Math.abs(elevAt(hit.ta) - graph.elevationAt(e, hit.tb));
      if (dy >= OVERPASS_CLEARANCE) continue;
      if (dy > 0.5) {
        lowClearance = true;
        continue;
      }
      if (atStart || atEnd) {
        tooClose = true;
        continue;
      }
      bezierTangent(curve, hit.ta, tanNew);
      bezierTangent(ecurve, hit.tb, tanOld);
      if (crossingAngle(tanNew, tanOld) < MIN_CROSSING_ANGLE) sharpCrossing = true;
      if (isWaterH(world.heightAt(hit.point.x, hit.point.z))) junctionOnBridge = true;
      const key = `x${k++}`;
      const dA = hit.tb * e.length;
      const dB = (1 - hit.tb) * e.length;
      if (dA < NODE_SNAP) cuts.push({ t: hit.ta, key, nodeId: e.a });
      else if (dB < NODE_SNAP) cuts.push({ t: hit.ta, key, nodeId: e.b });
      else {
        cuts.push({ t: hit.ta, key });
        splits.push({ edgeId: e.id, t: hit.tb, key });
      }
    }
  }
  cuts.sort((a, b) => a.t - b.t);
  // Merge cuts that reuse the same existing node.
  for (let i = cuts.length - 1; i > 0; i--) {
    if (cuts[i].nodeId !== undefined && cuts[i].nodeId === cuts[i - 1].nodeId) cuts.splice(i, 1);
  }

  // Endpoint anchors on edges split those edges too.
  if (start.kind === 'edge') splits.push({ edgeId: start.edgeId, t: start.t, key: 'start' });
  if (end.kind === 'edge') splits.push({ edgeId: end.edgeId, t: end.t, key: 'end' });

  // ---- piece lengths along the new road
  const ts = [0, ...cuts.map((c) => c.t), 1];
  for (let i = 1; i < ts.length; i++) {
    if (bezierLength(subBezier(curve, ts[i - 1], ts[i]), 8) < MIN_EDGE_LENGTH) tooClose = true;
  }
  // ---- piece lengths on split existing edges
  const byEdge = new Map<number, number[]>();
  for (const s of splits) {
    const list = byEdge.get(s.edgeId) ?? [];
    list.push(s.t);
    byEdge.set(s.edgeId, list);
  }
  for (const [edgeId, list] of byEdge) {
    const e = graph.edges.get(edgeId)!;
    const sorted = [0, ...list.sort((a, b) => a - b), 1];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - sorted[i - 1]) * e.length < MIN_EDGE_LENGTH * 0.75) tooClose = true;
    }
  }

  // ---- connection angles at the endpoints
  const checkEndpoint = (a: Anchor, dirOut: P2) => {
    if (a.kind === 'node') {
      const node = graph.nodes.get(a.nodeId);
      for (const eid of node?.edges ?? []) {
        const e = graph.edges.get(eid)!;
        if (directedAngle(dirOut, graph.directionFrom(e, a.nodeId)) < MIN_CROSSING_ANGLE) sharpCrossing = true;
      }
    } else if (a.kind === 'edge') {
      const e = graph.edges.get(a.edgeId)!;
      if (crossingAngle(dirOut, bezierTangent(graph.curveOf(e), a.t)) < MIN_CROSSING_ANGLE) sharpCrossing = true;
    }
  };
  const t0 = bezierTangent(curve, 0);
  const t1 = bezierTangent(curve, 1);
  if (length >= MIN_ROAD_LENGTH) {
    checkEndpoint(start, t0);
    checkEndpoint(end, { x: -t1.x, z: -t1.z });
  }

  // ---- running along (overlapping) an existing road
  if (length >= MIN_ROAD_LENGTH) {
    const avoid = [0, ...cuts.map((c) => c.t), 1].map((t) => t * length);
    const p = { x: 0, z: 0 };
    const samples = Math.ceil(length / 4);
    let overlap = 0;
    for (let s = 1; s < samples; s++) {
      const t = s / samples;
      const d = t * length;
      if (avoid.some((a) => Math.abs(a - d) < Math.max(16, type.width * 1.5))) continue;
      bezierPoint(curve, t, p);
      const near = graph.nearestEdge(p.x, p.z, type.width * 0.3, true);
      if (near && Math.abs(graph.elevationAt(near.edge, near.t) - elevAt(t)) < OVERPASS_CLEARANCE) overlap += length / samples;
    }
    if (overlap > 6) errors.push('Mevcut bir yolla çakışıyor');
  }

  // A free end must not sit on (or right next to) a road it doesn't connect to.
  for (const a of [start, end]) {
    if (a.kind !== 'free') continue;
    const near = graph.nearestEdge(a.point.x, a.point.z, type.width / 2, true);
    if (near && Math.abs(graph.elevationAt(near.edge, near.t) - anchorElevation(graph, a)) < OVERPASS_CLEARANCE) errors.push('Yol ucu mevcut bir yola değiyor — bağlamak için yolun üzerine tıklayın');
  }

  if (tooClose) errors.push('Kavşaklar birbirine çok yakın');
  if (sharpCrossing) errors.push('Yollar çok dar açıyla birleşiyor (en az 25°)');
  if (junctionOnBridge) errors.push('Köprü üzerinde kavşak kurulamaz');
  if (lowClearance) errors.push(`Üst geçit için yükseklik farkı en az ${OVERPASS_CLEARANCE} m olmalı`);

  const cost = roadCost(type, length, metrics.bridgeLength + metrics.elevatedLength);
  if (cost > budget) errors.push('Yetersiz bütçe');

  return {
    typeId: type.id,
    start,
    end,
    curve,
    cuts,
    splits,
    points: poly.points,
    length,
    bridgeLength: metrics.bridgeLength,
    maxGrade: metrics.maxGrade,
    cost,
    weeklyMaintenance: weeklyMaintenance(type, length, metrics.bridgeLength + metrics.elevatedLength),
    newJunctions: cuts.length + (start.kind === 'edge' ? 1 : 0) + (end.kind === 'edge' ? 1 : 0),
    elevA,
    elevB,
    elevatedLength: metrics.elevatedLength,
    valid: errors.length === 0,
    errors: [...new Set(errors)],
  };
}

/**
 * Applies a valid plan to the graph in one batch: splits crossed edges into
 * junctions, then creates the new road pieces between consecutive junctions.
 * Returns the ids of the newly built edges and the end node id.
 */
export function commitRoad(graph: RoadGraph, plan: RoadPlan): { edges: number[]; endNode: number } {
  if (!plan.valid) throw new Error('commitRoad: invalid plan');
  return graph.batch(() => {
    const nodeFor = new Map<string, number>();
    if (plan.start.kind === 'node') nodeFor.set('start', plan.start.nodeId);
    if (plan.end.kind === 'node') nodeFor.set('end', plan.end.nodeId);

    // Split existing edges; per edge process descending t so earlier params stay valid.
    const byEdge = new Map<number, EdgeSplit[]>();
    for (const s of plan.splits) {
      const list = byEdge.get(s.edgeId) ?? [];
      list.push(s);
      byEdge.set(s.edgeId, list);
    }
    for (const [edgeId, list] of byEdge) {
      list.sort((a, b) => b.t - a.t);
      let cur = edgeId;
      let curEnd = 1;
      for (const s of list) {
        const local = s.t / curEnd;
        const res = graph.splitEdge(cur, local);
        nodeFor.set(s.key, res.node.id);
        cur = res.left.id;
        curEnd = s.t;
      }
    }
    if (plan.start.kind === 'free') nodeFor.set('start', graph.addNode(plan.start.point.x, plan.start.point.z, plan.elevA).id);
    if (plan.end.kind === 'free') nodeFor.set('end', graph.addNode(plan.end.point.x, plan.end.point.z, plan.elevB).id);

    const stops: { t: number; node: number }[] = [{ t: 0, node: nodeFor.get('start')! }];
    for (const c of plan.cuts) stops.push({ t: c.t, node: c.nodeId ?? nodeFor.get(c.key)! });
    stops.push({ t: 1, node: nodeFor.get('end')! });

    const created: number[] = [];
    for (let i = 1; i < stops.length; i++) {
      const a = stops[i - 1];
      const b = stops[i];
      if (a.node === b.node) continue;
      const sub = subBezier(plan.curve, a.t, b.t);
      const share = (b.t - a.t) * plan.cost;
      const edge = graph.addEdge(a.node, b.node, plan.typeId, sub.p1, share);
      if (plan.surface && plan.surface !== 'asphalt') edge.surface = plan.surface;
      created.push(edge.id);
    }
    return { edges: created, endNode: nodeFor.get('end')! };
  });
}

export interface UpgradePlan {
  edgeId: number;
  fromTypeId: string;
  toTypeId: string;
  /** Paving after the change. */
  toSurface: RoadSurface;
  cost: number;
  refund: number;
  netCost: number;
  valid: boolean;
  errors: string[];
}

/**
 * Changing an existing road's type: new construction minus 50% refund of the
 * old road. Keeping the type and changing only the paving (resurfacing)
 * costs 30% of building it new, with no refund.
 */
export function planUpgrade(graph: RoadGraph, edge: RoadEdge, type: RoadTypeDef, world: PlannerWorld, budget: number, surface: RoadSurface = 'asphalt'): UpgradePlan {
  const errors: string[] = [];
  const repave = edge.typeId === type.id;
  if (repave && (edge.surface ?? 'asphalt') === surface) errors.push('Yol zaten bu türde ve bu kaplamada');
  if (getRoadType(edge.typeId).playerBuildable === false || type.playerBuildable === false) errors.push('Şehir girişi değiştirilemez');
  const m = evaluatePath(graph.curveOf(edge), type, world, graph.nodes.get(edge.a)?.y ?? 0, graph.nodes.get(edge.b)?.y ?? 0);
  errors.push(...m.errors.filter((e) => !e.startsWith('Satın alınmamış')));
  const full = roadCost(type, m.length, m.bridgeLength + m.elevatedLength);
  const cost = repave ? Math.round(full * 0.3) : full;
  const refund = repave ? 0 : Math.round(edge.cost * 0.5);
  const netCost = Math.max(0, cost - refund);
  if (netCost > budget) errors.push('Yetersiz bütçe');
  return { edgeId: edge.id, fromTypeId: edge.typeId, toTypeId: type.id, toSurface: surface, cost, refund, netCost, valid: errors.length === 0, errors };
}
