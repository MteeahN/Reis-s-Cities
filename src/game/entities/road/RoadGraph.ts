import { getRoadType } from '../../data/roads';
import {
  bezierLength,
  bezierTangent,
  closestOnBezier,
  sampleBezier,
  splitBezier,
  type P2,
  type Polyline,
  type QuadBezier,
} from './curve';

export interface RoadNode {
  id: number;
  x: number;
  z: number;
  edges: number[];
}

export interface RoadEdge {
  id: number;
  a: number;
  b: number;
  typeId: string;
  /** Bézier control point (the midpoint for straight roads). */
  c: P2;
  length: number;
  /** Construction cost paid (used for demolition refunds). */
  cost: number;
  /** Cached polyline (≈4 m spacing). */
  poly: Polyline;
}

export interface RoadChange {
  added: number[];
  removed: number[];
}

export interface RoadGraphData {
  version: 1;
  nodes: { id: number; x: number; z: number }[];
  edges: { id: number; a: number; b: number; typeId: string; cx: number; cz: number; cost: number }[];
  nextId: number;
}

const BUCKET = 64;

/**
 * The road network: nodes (junctions / ends) connected by curved edges.
 * Provides spatial queries and topology edits; batches changes into a single
 * notification so renderers and occupancy update once per operation.
 */
export class RoadGraph {
  readonly nodes = new Map<number, RoadNode>();
  readonly edges = new Map<number, RoadEdge>();
  private nextId = 1;
  private readonly buckets = new Map<number, Set<number>>();
  private readonly edgeBuckets = new Map<number, number[]>();
  private listeners = new Set<(c: RoadChange) => void>();
  private batchDepth = 0;
  private pending: RoadChange = { added: [], removed: [] };

  // ---------------------------------------------------------------- events

  onChange(fn: (c: RoadChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  batch<T>(fn: () => T): T {
    this.batchDepth++;
    try {
      return fn();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0) this.flush();
    }
  }

  /**
   * Emits one change set per batch. `removed` lists ids listeners knew before
   * (or replaced in place, e.g. a type change); `added` lists ids that exist now.
   * An edge both created and deleted inside the batch is reported in neither.
   */
  private flush(): void {
    const created = new Set(this.pending.added);
    const added = [...created].filter((id) => this.edges.has(id));
    const removed = [...new Set(this.pending.removed)].filter((id) => !(created.has(id) && !this.edges.has(id)));
    this.pending = { added: [], removed: [] };
    if (added.length === 0 && removed.length === 0) return;
    const change: RoadChange = { added, removed };
    this.listeners.forEach((l) => l(change));
  }

  private record(kind: 'added' | 'removed', id: number): void {
    this.pending[kind].push(id);
    if (this.batchDepth === 0) this.flush();
  }

  // ---------------------------------------------------------------- geometry

  curveOf(e: RoadEdge): QuadBezier {
    const a = this.nodes.get(e.a)!;
    const b = this.nodes.get(e.b)!;
    return { p0: { x: a.x, z: a.z }, p1: e.c, p2: { x: b.x, z: b.z } };
  }

  /** Unit direction leaving `nodeId` along edge `e`. */
  directionFrom(e: RoadEdge, nodeId: number): P2 {
    const curve = this.curveOf(e);
    if (e.a === nodeId) return bezierTangent(curve, 0);
    const t = bezierTangent(curve, 1);
    return { x: -t.x, z: -t.z };
  }

  // ---------------------------------------------------------------- edits

  addNode(x: number, z: number): RoadNode {
    const node: RoadNode = { id: this.nextId++, x, z, edges: [] };
    this.nodes.set(node.id, node);
    return node;
  }

  addEdge(a: number, b: number, typeId: string, c: P2, cost: number, id?: number): RoadEdge {
    const na = this.nodes.get(a);
    const nb = this.nodes.get(b);
    if (!na || !nb) throw new Error('addEdge: unknown node');
    if (a === b) throw new Error('addEdge: self loop');
    getRoadType(typeId); // validates
    const curve: QuadBezier = { p0: { x: na.x, z: na.z }, p1: { x: c.x, z: c.z }, p2: { x: nb.x, z: nb.z } };
    const edge: RoadEdge = {
      id: id ?? this.nextId++,
      a,
      b,
      typeId,
      c: { x: c.x, z: c.z },
      length: bezierLength(curve),
      cost,
      poly: sampleBezier(curve, 4),
    };
    if (id !== undefined) this.nextId = Math.max(this.nextId, id + 1);
    this.edges.set(edge.id, edge);
    na.edges.push(edge.id);
    nb.edges.push(edge.id);
    this.index(edge);
    this.record('added', edge.id);
    return edge;
  }

  /** Removes an edge; nodes left without edges are removed too. */
  removeEdge(id: number, keepOrphans = false): void {
    const e = this.edges.get(id);
    if (!e) return;
    this.unindex(e);
    this.edges.delete(id);
    for (const nid of [e.a, e.b]) {
      const n = this.nodes.get(nid);
      if (!n) continue;
      n.edges = n.edges.filter((x) => x !== id);
      if (n.edges.length === 0 && !keepOrphans) this.nodes.delete(nid);
    }
    this.record('removed', id);
  }

  setEdgeType(id: number, typeId: string, extraCost: number): void {
    const e = this.edges.get(id);
    if (!e) return;
    getRoadType(typeId);
    e.typeId = typeId;
    e.cost += extraCost;
    // Re-index (width may differ) and notify as replace.
    this.unindex(e);
    this.index(e);
    this.record('removed', id);
    this.record('added', id);
  }

  /**
   * Splits an edge at parameter t, inserting a junction node.
   * Returns the new node and the two edges ([0,t] and [t,1]).
   */
  splitEdge(id: number, t: number): { node: RoadNode; left: RoadEdge; right: RoadEdge } {
    const e = this.edges.get(id);
    if (!e) throw new Error('splitEdge: unknown edge');
    return this.batch(() => {
      const [L, R] = splitBezier(this.curveOf(e), t);
      const node = this.addNode(L.p2.x, L.p2.z);
      const lenL = bezierLength(L);
      const lenR = bezierLength(R);
      const share = lenL / Math.max(1e-6, lenL + lenR);
      const { a, b, typeId, cost } = e;
      this.removeEdge(id, true);
      const left = this.addEdge(a, node.id, typeId, L.p1, cost * share);
      const right = this.addEdge(node.id, b, typeId, R.p1, cost * (1 - share));
      return { node, left, right };
    });
  }

  // ---------------------------------------------------------------- spatial index

  private static key(bx: number, bz: number): number {
    return (bx + 1000) * 4096 + (bz + 1000);
  }

  private index(e: RoadEdge): void {
    const w = getRoadType(e.typeId).width / 2 + 2;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const p of e.poly.points) {
      minX = Math.min(minX, p.x);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxZ = Math.max(maxZ, p.z);
    }
    const keys: number[] = [];
    for (let bx = Math.floor((minX - w) / BUCKET); bx <= Math.floor((maxX + w) / BUCKET); bx++) {
      for (let bz = Math.floor((minZ - w) / BUCKET); bz <= Math.floor((maxZ + w) / BUCKET); bz++) {
        const k = RoadGraph.key(bx, bz);
        let set = this.buckets.get(k);
        if (!set) this.buckets.set(k, (set = new Set()));
        set.add(e.id);
        keys.push(k);
      }
    }
    this.edgeBuckets.set(e.id, keys);
  }

  private unindex(e: RoadEdge): void {
    for (const k of this.edgeBuckets.get(e.id) ?? []) this.buckets.get(k)?.delete(e.id);
    this.edgeBuckets.delete(e.id);
  }

  edgesInBox(minX: number, minZ: number, maxX: number, maxZ: number): RoadEdge[] {
    const ids = new Set<number>();
    for (let bx = Math.floor(minX / BUCKET); bx <= Math.floor(maxX / BUCKET); bx++) {
      for (let bz = Math.floor(minZ / BUCKET); bz <= Math.floor(maxZ / BUCKET); bz++) {
        const set = this.buckets.get(RoadGraph.key(bx, bz));
        if (set) set.forEach((id) => ids.add(id));
      }
    }
    return [...ids].map((id) => this.edges.get(id)!).filter(Boolean);
  }

  nearestNode(x: number, z: number, radius: number): RoadNode | null {
    let best: RoadNode | null = null;
    let bestD = radius;
    // Nodes are endpoints of indexed edges, so query edges near the point.
    for (const e of this.edgesInBox(x - radius, z - radius, x + radius, z + radius)) {
      for (const nid of [e.a, e.b]) {
        const n = this.nodes.get(nid)!;
        const d = Math.hypot(n.x - x, n.z - z);
        if (d <= bestD) {
          bestD = d;
          best = n;
        }
      }
    }
    return best;
  }

  /** Closest edge whose centreline is within `radius` (+ its half width when `includeWidth`). */
  nearestEdge(
    x: number,
    z: number,
    radius: number,
    includeWidth = false,
  ): { edge: RoadEdge; t: number; point: P2; dist: number } | null {
    let best: { edge: RoadEdge; t: number; point: P2; dist: number } | null = null;
    const pad = includeWidth ? 14 : 0;
    for (const e of this.edgesInBox(x - radius - pad, z - radius - pad, x + radius + pad, z + radius + pad)) {
      const r = this.closestOnEdge(e, { x, z });
      const limit = radius + (includeWidth ? getRoadType(e.typeId).width / 2 : 0);
      if (r.dist <= limit && (!best || r.dist < best.dist)) best = { edge: e, ...r };
    }
    return best;
  }

  closestOnEdge(e: RoadEdge, p: P2): { t: number; point: P2; dist: number } {
    return closestOnBezier(this.curveOf(e), p);
  }

  // ---------------------------------------------------------------- stats & persistence

  stats(): { edges: number; nodes: number; junctions: number; deadEnds: number; totalLength: number } {
    let junctions = 0;
    let deadEnds = 0;
    for (const n of this.nodes.values()) {
      if (n.edges.length >= 3) junctions++;
      else if (n.edges.length === 1) deadEnds++;
    }
    let totalLength = 0;
    for (const e of this.edges.values()) totalLength += e.length;
    return { edges: this.edges.size, nodes: this.nodes.size, junctions, deadEnds, totalLength };
  }

  serialize(): RoadGraphData {
    return {
      version: 1,
      nodes: [...this.nodes.values()].map((n) => ({ id: n.id, x: n.x, z: n.z })),
      edges: [...this.edges.values()].map((e) => ({ id: e.id, a: e.a, b: e.b, typeId: e.typeId, cx: e.c.x, cz: e.c.z, cost: e.cost })),
      nextId: this.nextId,
    };
  }

  static deserialize(data: RoadGraphData): RoadGraph {
    const g = new RoadGraph();
    g.load(data);
    return g;
  }

  /** Loads saved roads into this (empty) graph; listeners get one change set. */
  load(data: RoadGraphData): void {
    if (this.edges.size || this.nodes.size) throw new Error('RoadGraph.load: graph is not empty');
    this.batch(() => {
      for (const n of data.nodes) this.nodes.set(n.id, { id: n.id, x: n.x, z: n.z, edges: [] });
      for (const e of data.edges) this.addEdge(e.a, e.b, e.typeId, { x: e.cx, z: e.cz }, e.cost, e.id);
      for (const n of data.nodes) this.nextId = Math.max(this.nextId, n.id + 1);
      this.nextId = Math.max(this.nextId, data.nextId);
      // Nodes without edges are never kept by the editor.
      for (const [id, n] of this.nodes) if (n.edges.length === 0) this.nodes.delete(id);
    });
  }
}
