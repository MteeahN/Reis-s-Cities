import { CELL_SIZE } from '../../core/config';
import { getBuilding } from '../../data/buildings';
import { getRoadType } from '../../data/roads';
import { ZoneType } from '../../data/zones';
import { frontCells } from '../../entities/building/BuildingPlacement';
import type { PlacedBuilding } from '../../entities/building/BuildingRegistry';
import type { RoadGraph } from '../../entities/road/RoadGraph';
import { residentsOf, type Population } from '../Population';

/**
 * Aggregate traffic model (no per-citizen agents).
 *
 *  1. Trip generation: households make commute and shopping trips, industry
 *     sends freight to shops. Daily trips are spread over the day with
 *     hourly profiles (morning / evening rush).
 *  2. Distribution: a gravity model — destinations attract trips by size and
 *     lose them with travel time.
 *  3. Assignment: trips are routed on the directed lane graph by travel time
 *     (Dijkstra, junction delays). Link times follow the BPR congestion curve,
 *     and each step's all-or-nothing result is blended into the running flows,
 *     so congested roads push traffic onto alternative routes over time.
 *
 * Origins and destinations are grouped per road segment to keep it cheap.
 */

/** Delay for passing through a junction of three or more roads (s). */
export const JUNCTION_DELAY = 5;
export const BPR_ALPHA = 0.15;
export const BPR_BETA = 4;
/** Share of each new assignment blended into the running flows per step. */
export const FLOW_BLEND = 0.35;
/** Daily car trips are multiplied by this (visitors, errands, services). */
export const TRIP_SCALE = 3;
export const CAR_SHARE = 0.75;
export const SHOP_TRIPS_PER_RESIDENT = 0.25;
export const FREIGHT_PER_WORKER = 0.4;
/** Travel-time decay of destination choice (s). */
export const DEST_DECAY = 300;
/** How far a building's front may be from the road it uses (m). */
export const ATTACH_RADIUS = 14;

export type Purpose = 'work' | 'shop' | 'freight';
const PURPOSES: Purpose[] = ['work', 'shop', 'freight'];

function profile(peaks: [number, number, number][], base = 0.006): number[] {
  const out = new Array(24).fill(0).map((_, h) => base + peaks.reduce((s, [p, w, k]) => s + k * Math.exp(-((h - p) ** 2) / (2 * w * w)), 0));
  const sum = out.reduce((a, b) => a + b, 0);
  return out.map((v) => v / sum);
}

/** Share of a purpose's daily trips made in each hour (outbound / return). */
export const HOURLY: Record<Purpose, { out: number[]; back: number[] }> = {
  work: { out: profile([[7.5, 1, 1]]), back: profile([[17.5, 1.2, 1]]) },
  shop: { out: profile([[12, 2.5, 0.6], [18, 1.5, 1]]), back: profile([[13.5, 2.5, 0.6], [19.5, 1.5, 1]]) },
  freight: { out: profile([[10, 3, 1]]), back: profile([[13, 3, 1]]) },
};

/** Profile value at a minute of the day (linear between hours). */
export function hourShare(p: number[], minuteOfDay: number): number {
  const h = (((minuteOfDay / 60) % 24) + 24) % 24;
  const h0 = Math.floor(h);
  const f = h - h0;
  return p[h0] * (1 - f) + p[(h0 + 1) % 24] * f;
}

/** Where a building meets the road: edge id and Bézier parameter. */
export interface Attach {
  edge: number;
  s: number;
}

interface Opt {
  node: number;
  link: number;
  cost: number;
  /** Fraction along the link where the vehicle enters (departure) or stops (arrival). */
  frac: number;
}

interface DestGroup {
  edge: number;
  s: number;
  weight: number;
  arr: Opt[];
  dep: Opt[];
}

interface OriginGroup {
  edge: number;
  s: number;
  members: number[];
  /** Daily trips by purpose. */
  trips: Record<Purpose, number>;
  dep: Opt[];
  arr: Opt[];
}

/** A routed group of trips kept for vehicle sampling. */
interface Flow {
  out: boolean;
  purpose: Purpose;
  vol: number;
  /** Index into the group's path data. */
  g: number;
  dest: DestGroup;
  opt: Opt;
}

interface GroupTree {
  origin: OriginGroup;
  predLink: Int32Array;
  predFrom: Int32Array;
  succLink: Int32Array;
  succTo: Int32Array;
}

/** A path for one vehicle: directed links in order, with partial first and last links. */
export interface VehiclePath {
  links: number[];
  startFrac: number;
  endFrac: number;
  freight: boolean;
}

export interface TrafficStats {
  /** Vehicles on the roads right now (Little's law over all links). */
  vehicles: number;
  /** Trips per hour at the current time of day. */
  tripsPerHour: number;
  /** Flow-weighted mean volume/capacity ratio. */
  congestion: number;
  /** Flow-weighted mean speed (km/h). */
  avgSpeedKmh: number;
  /** Length of road segments over 90% of capacity (m). */
  congestedLength: number;
  /** Resident-weighted average commute (minutes). */
  commuteMinutes: number;
  /** Daily commute/shopping/freight trips that found no route. */
  unroutable: number;
  /** Worst segments: edge id and v/c ratio. */
  worst: { edge: number; ratio: number }[];
}

export interface EdgeTraffic {
  /** veh/h a→b and b→a (b→a is 0 for one-way roads). */
  forward: number;
  backward: number;
  capacity: number;
  ratio: number;
  speedKmh: number;
  freeSpeedKmh: number;
}

class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  clear(): void {
    this.keys.length = 0;
    this.vals.length = 0;
  }
  push(key: number, val: number): void {
    const k = this.keys;
    const v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.keys;
    const v = this.vals;
    const top = v[0];
    const lastK = k.pop()!;
    const lastV = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && k[r] < k[l] ? r : l;
        if (k[c] >= lastK) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lastK;
      v[i] = lastV;
    }
    return top;
  }
}

export class TrafficModel {
  // Directed links (one per travel direction of each road segment).
  linkEdge = new Int32Array(0);
  linkFrom = new Int32Array(0);
  linkTo = new Int32Array(0);
  linkLen = new Float64Array(0);
  linkT0 = new Float64Array(0);
  linkCap = new Float64Array(0);
  linkFlow = new Float64Array(0);
  linkTime = new Float64Array(0);
  /** Link runs against the edge's a→b direction. */
  linkReverse = new Uint8Array(0);
  private load = new Float64Array(0);
  private nodeIds: number[] = [];
  private nodeIndex = new Map<number, number>();
  private outLinks: number[][] = [];
  private inLinks: number[][] = [];
  private nodeDelay = new Float64Array(0);
  /** edge id → [a→b link, b→a link] (-1 when absent). */
  private edgeLinks = new Map<number, [number, number]>();
  private attachCache = new Map<number, Attach | null>();
  private dirty = true;
  /** Bumped whenever links are renumbered (vehicles drop stale paths). */
  version = 0;

  private trees: GroupTree[] = [];
  private flows: Flow[] = [];
  private flowTotal = 0;
  /** Average commute time (s) per home building; Infinity when no workplace is reachable. */
  readonly commute = new Map<number, number>();
  stats: TrafficStats = { vehicles: 0, tripsPerHour: 0, congestion: 0, avgSpeedKmh: 0, congestedLength: 0, commuteMinutes: 0, unroutable: 0, worst: [] };

  // Dijkstra scratch.
  private dist = new Float64Array(0);
  private order: number[] = [];
  private heap = new MinHeap();

  constructor(private readonly roads: RoadGraph) {
    roads.onChange(() => {
      this.dirty = true;
      this.attachCache.clear();
    });
  }

  /** Buildings changed (placed, removed, re-rotated): forget their road attachments. */
  invalidateBuilding(id: number): void {
    this.attachCache.delete(id);
  }

  // ---------------------------------------------------------------- network

  private rebuild(): void {
    this.dirty = false;
    this.version++;
    const old = new Map<string, number>();
    for (let l = 0; l < this.linkEdge.length; l++) old.set(`${this.linkEdge[l]}:${this.linkReverse[l]}`, this.linkFlow[l]);

    this.nodeIds = [...this.roads.nodes.keys()];
    this.nodeIndex = new Map(this.nodeIds.map((id, i) => [id, i]));
    const n = this.nodeIds.length;
    this.outLinks = Array.from({ length: n }, () => []);
    this.inLinks = Array.from({ length: n }, () => []);
    this.nodeDelay = new Float64Array(n);
    for (let i = 0; i < n; i++) this.nodeDelay[i] = this.roads.nodes.get(this.nodeIds[i])!.edges.length >= 3 ? JUNCTION_DELAY : 0;

    const links: { edge: number; from: number; to: number; len: number; t0: number; cap: number; rev: number }[] = [];
    this.edgeLinks.clear();
    for (const e of this.roads.edges.values()) {
      const t = getRoadType(e.typeId);
      const v = t.speedKmh / 3.6;
      const a = this.nodeIndex.get(e.a)!;
      const b = this.nodeIndex.get(e.b)!;
      const cap = t.oneWay ? t.capacity : t.capacity / 2;
      const pair: [number, number] = [-1, -1];
      pair[0] = links.length;
      links.push({ edge: e.id, from: a, to: b, len: e.length, t0: e.length / v, cap, rev: 0 });
      if (!t.oneWay) {
        pair[1] = links.length;
        links.push({ edge: e.id, from: b, to: a, len: e.length, t0: e.length / v, cap, rev: 1 });
      }
      this.edgeLinks.set(e.id, pair);
    }
    const m = links.length;
    this.linkEdge = new Int32Array(m);
    this.linkFrom = new Int32Array(m);
    this.linkTo = new Int32Array(m);
    this.linkLen = new Float64Array(m);
    this.linkT0 = new Float64Array(m);
    this.linkCap = new Float64Array(m);
    this.linkFlow = new Float64Array(m);
    this.linkTime = new Float64Array(m);
    this.linkReverse = new Uint8Array(m);
    this.load = new Float64Array(m);
    links.forEach((l, i) => {
      this.linkEdge[i] = l.edge;
      this.linkFrom[i] = l.from;
      this.linkTo[i] = l.to;
      this.linkLen[i] = l.len;
      this.linkT0[i] = l.t0;
      this.linkCap[i] = l.cap;
      this.linkReverse[i] = l.rev;
      this.linkFlow[i] = old.get(`${l.edge}:${l.rev}`) ?? 0;
      this.outLinks[l.from].push(i);
      this.inLinks[l.to].push(i);
    });
    this.updateTimes();
    this.dist = new Float64Array(n);
    this.trees = [];
    this.flows = [];
    this.flowTotal = 0;
  }

  private updateTimes(): void {
    for (let l = 0; l < this.linkEdge.length; l++) {
      const x = this.linkFlow[l] / this.linkCap[l];
      this.linkTime[l] = this.linkT0[l] * (1 + BPR_ALPHA * x ** BPR_BETA);
    }
  }

  /** Road segment (and parameter) a building's traffic enters and leaves by. */
  attach(b: PlacedBuilding): Attach | null {
    if (this.attachCache.has(b.id)) return this.attachCache.get(b.id)!;
    let result: Attach | null = null;
    for (const depth of [1, 2]) {
      const cells = frontCells(b.i, b.j, b.w, b.d, b.rot, depth);
      let x = 0;
      let z = 0;
      for (const [ci, cj] of cells) {
        x += (ci + 0.5) * CELL_SIZE;
        z += (cj + 0.5) * CELL_SIZE;
      }
      x /= cells.length;
      z /= cells.length;
      const hit = this.roads.nearestEdge(x, z, ATTACH_RADIUS, true);
      if (hit) {
        result = { edge: hit.edge.id, s: hit.t };
        break;
      }
    }
    this.attachCache.set(b.id, result);
    return result;
  }

  /** Leaving a point on an edge towards either end. */
  private departures(edge: number, s: number): Opt[] {
    const pair = this.edgeLinks.get(edge);
    if (!pair) return [];
    const out: Opt[] = [];
    const [f, r] = pair;
    if (f >= 0) out.push({ node: this.linkTo[f], link: f, cost: (1 - s) * this.linkTime[f], frac: s });
    if (r >= 0) out.push({ node: this.linkTo[r], link: r, cost: s * this.linkTime[r], frac: 1 - s });
    return out;
  }

  /** Arriving at a point on an edge from either end. */
  private arrivals(edge: number, s: number): Opt[] {
    const pair = this.edgeLinks.get(edge);
    if (!pair) return [];
    const out: Opt[] = [];
    const [f, r] = pair;
    if (f >= 0) out.push({ node: this.linkFrom[f], link: f, cost: s * this.linkTime[f], frac: s });
    if (r >= 0) out.push({ node: this.linkFrom[r], link: r, cost: (1 - s) * this.linkTime[r], frac: 1 - s });
    return out;
  }

  /**
   * Shortest travel times from (forward) or to (reverse) a set of start
   * options. Fills `dist`, the tree arrays and `order` (settle order).
   */
  private dijkstra(starts: Opt[], reverse: boolean, link: Int32Array, next: Int32Array): void {
    const dist = this.dist;
    dist.fill(Infinity);
    link.fill(-1);
    next.fill(-1);
    const order = this.order;
    order.length = 0;
    const heap = this.heap;
    heap.clear();
    for (const o of starts) {
      const c = o.cost + this.nodeDelay[o.node];
      if (c < dist[o.node]) {
        dist[o.node] = c;
        link[o.node] = o.link;
        next[o.node] = -1;
        heap.push(c, o.node);
      }
    }
    const done = new Uint8Array(dist.length);
    while (heap.size > 0) {
      const u = heap.pop();
      if (done[u]) continue;
      done[u] = 1;
      order.push(u);
      const du = dist[u];
      const adj = reverse ? this.inLinks[u] : this.outLinks[u];
      for (const l of adj) {
        const v = reverse ? this.linkFrom[l] : this.linkTo[l];
        if (done[v]) continue;
        // Forward: the junction passed is v; reverse: it is u (already counted in dist[u]), so add v's own delay instead.
        const c = du + this.linkTime[l] + this.nodeDelay[v];
        if (c < dist[v]) {
          dist[v] = c;
          link[v] = l;
          next[v] = u;
          heap.push(c, v);
        }
      }
    }
  }

  // ---------------------------------------------------------------- simulation step

  /**
   * One traffic update: generate trips, route them on current link times and
   * blend the result into the running flows.
   */
  step(buildings: Iterable<PlacedBuilding>, pop: Population, employmentRate: number, minuteOfDay: number): void {
    if (this.dirty) this.rebuild();
    const nLinks = this.linkEdge.length;
    const nNodes = this.nodeIds.length;
    this.load.fill(0);
    this.trees = [];
    this.flows = [];
    this.flowTotal = 0;
    this.commute.clear();
    let unroutable = 0;
    let tripsPerHour = 0;

    // ---- origins and destinations, grouped by road segment
    const origins = new Map<number, OriginGroup>();
    const dests: Record<Purpose, Map<number, DestGroup>> = { work: new Map(), shop: new Map(), freight: new Map() };
    const addDest = (p: Purpose, at: Attach, weight: number) => {
      let g = dests[p].get(at.edge);
      if (!g) dests[p].set(at.edge, (g = { edge: at.edge, s: 0, weight: 0, arr: [], dep: [] }));
      g.s = (g.s * g.weight + at.s * weight) / (g.weight + weight);
      g.weight += weight;
    };
    const addOrigin = (b: PlacedBuilding, at: Attach, p: Purpose, trips: number) => {
      let g = origins.get(at.edge);
      if (!g) origins.set(at.edge, (g = { edge: at.edge, s: at.s, members: [], trips: { work: 0, shop: 0, freight: 0 }, dep: [], arr: [] }));
      const total = g.trips.work + g.trips.shop + g.trips.freight;
      g.s = total + trips > 0 ? (g.s * total + at.s * trips) / (total + trips) : at.s;
      g.trips[p] += trips;
      if (!g.members.includes(b.id)) g.members.push(b.id);
    };
    for (const b of buildings) {
      if (b.state !== 'active') continue;
      const def = getBuilding(b.defId);
      const isHome = b.zone === ZoneType.Residential;
      const isShop = b.zone === ZoneType.Commercial && def.category !== 'office';
      const isWork = def.workers > 0 && b.occupants > 0;
      if (!isHome && !isShop && !isWork) continue;
      const at = this.attach(b);
      if (!at) continue;
      if (isHome) {
        const hh = pop.households.get(b.id);
        if (!hh) continue;
        const residents = residentsOf(hh);
        if (residents <= 0) continue;
        addOrigin(b, at, 'work', hh.ages[2] * employmentRate * CAR_SHARE);
        addOrigin(b, at, 'shop', residents * SHOP_TRIPS_PER_RESIDENT);
      }
      if (isWork) addDest('work', at, b.occupants);
      if (isShop && b.occupants > 0) {
        addDest('shop', at, b.occupants);
        addDest('freight', at, b.occupants);
      }
      if (b.zone === ZoneType.Industrial && b.occupants > 0) addOrigin(b, at, 'freight', b.occupants * FREIGHT_PER_WORKER);
    }
    for (const p of PURPOSES) {
      for (const g of dests[p].values()) {
        g.arr = this.arrivals(g.edge, g.s);
        g.dep = this.departures(g.edge, g.s);
      }
    }
    const destLists: Record<Purpose, DestGroup[]> = { work: [...dests.work.values()], shop: [...dests.shop.values()], freight: [...dests.freight.values()] };

    // ---- per origin group: route, distribute, load
    const accF = new Float64Array(nNodes);
    const accB = new Float64Array(nNodes);
    const fwdDist = new Float64Array(nNodes);
    for (const og of origins.values()) {
      og.dep = this.departures(og.edge, og.s);
      og.arr = this.arrivals(og.edge, og.s);
      if (og.dep.length === 0) continue;
      const tree: GroupTree = {
        origin: og,
        predLink: new Int32Array(nNodes),
        predFrom: new Int32Array(nNodes),
        succLink: new Int32Array(nNodes),
        succTo: new Int32Array(nNodes),
      };
      this.dijkstra(og.dep, false, tree.predLink, tree.predFrom);
      fwdDist.set(this.dist);
      const fwdOrder = this.order.slice();
      this.dijkstra(og.arr, true, tree.succLink, tree.succTo);
      const revDist = this.dist;
      const revOrder = this.order.slice();
      const gIndex = this.trees.length;
      this.trees.push(tree);
      accF.fill(0);
      accB.fill(0);

      for (const p of PURPOSES) {
        const trips = og.trips[p];
        const list = destLists[p];
        if (trips <= 0 || list.length === 0) continue;
        // Cheapest arrival at, and departure from, each destination.
        const costs: number[] = [];
        const arrOpt: (Opt | null)[] = [];
        const depOpt: (Opt | null)[] = [];
        let sum = 0;
        for (const d of list) {
          let best: Opt | null = null;
          let bc = Infinity;
          for (const o of d.arr) {
            const c = fwdDist[o.node] + o.cost;
            if (c < bc) (bc = c), (best = o);
          }
          let bestB: Opt | null = null;
          let bcB = Infinity;
          for (const o of d.dep) {
            const c = revDist[o.node] + o.cost;
            if (c < bcB) (bcB = c), (bestB = o);
          }
          costs.push(bc);
          arrOpt.push(best);
          depOpt.push(bestB);
          if (Number.isFinite(bc)) sum += d.weight * Math.exp(-bc / DEST_DECAY);
        }
        if (sum <= 0) {
          unroutable += trips;
          if (p === 'work') for (const id of og.members) this.commute.set(id, Infinity);
          continue;
        }
        const out = trips * hourShare(HOURLY[p].out, minuteOfDay) * TRIP_SCALE;
        const back = trips * hourShare(HOURLY[p].back, minuteOfDay) * TRIP_SCALE;
        tripsPerHour += out + back;
        let commute = 0;
        list.forEach((d, k) => {
          const c = costs[k];
          if (!Number.isFinite(c)) return;
          const share = (d.weight * Math.exp(-c / DEST_DECAY)) / sum;
          commute += share * c;
          const a = arrOpt[k]!;
          const vo = out * share;
          if (vo > 0) {
            this.load[a.link] += vo;
            accF[a.node] += vo;
            this.flows.push({ out: true, purpose: p, vol: vo, g: gIndex, dest: d, opt: a });
            this.flowTotal += vo;
          }
          const dp = depOpt[k];
          const vb = back * share;
          if (vb > 0 && dp && Number.isFinite(revDist[dp.node])) {
            this.load[dp.link] += vb;
            accB[dp.node] += vb;
            this.flows.push({ out: false, purpose: p, vol: vb, g: gIndex, dest: d, opt: dp });
            this.flowTotal += vb;
          }
        });
        if (p === 'work') for (const id of og.members) this.commute.set(id, commute);
      }
      // Push accumulated volumes back along the trees (farthest nodes first).
      for (let i = fwdOrder.length - 1; i >= 0; i--) {
        const n = fwdOrder[i];
        const v = accF[n];
        if (v <= 0) continue;
        this.load[tree.predLink[n]] += v;
        const from = tree.predFrom[n];
        if (from >= 0) accF[from] += v;
      }
      for (let i = revOrder.length - 1; i >= 0; i--) {
        const n = revOrder[i];
        const v = accB[n];
        if (v <= 0) continue;
        this.load[tree.succLink[n]] += v;
        const to = tree.succTo[n];
        if (to >= 0) accB[to] += v;
      }
    }

    // ---- blend and update congestion
    for (let l = 0; l < nLinks; l++) this.linkFlow[l] += (this.load[l] - this.linkFlow[l]) * FLOW_BLEND;
    this.updateTimes();
    this.computeStats(tripsPerHour, unroutable, pop);
  }

  private computeStats(tripsPerHour: number, unroutable: number, pop: Population): void {
    let flowSum = 0;
    let ratioSum = 0;
    let vkm = 0;
    let vhours = 0;
    let vehicles = 0;
    const edgeRatio = new Map<number, number>();
    for (let l = 0; l < this.linkEdge.length; l++) {
      const f = this.linkFlow[l];
      const r = f / this.linkCap[l];
      const e = this.linkEdge[l];
      edgeRatio.set(e, Math.max(edgeRatio.get(e) ?? 0, r));
      if (f <= 0) continue;
      flowSum += f;
      ratioSum += f * r;
      vkm += f * this.linkLen[l];
      vhours += f * this.linkTime[l];
      vehicles += (f * this.linkTime[l]) / 3600;
    }
    let congestedLength = 0;
    const worst: { edge: number; ratio: number }[] = [];
    for (const [edge, ratio] of edgeRatio) {
      if (ratio > 0.9) congestedLength += this.roads.edges.get(edge)?.length ?? 0;
      if (ratio > 0.05) worst.push({ edge, ratio });
    }
    worst.sort((a, b) => b.ratio - a.ratio);
    let cSum = 0;
    let cN = 0;
    for (const [id, s] of this.commute) {
      if (!Number.isFinite(s)) continue;
      const hh = pop.households.get(id);
      const n = hh ? hh.ages[2] : 0;
      cSum += s * n;
      cN += n;
    }
    this.stats = {
      vehicles,
      tripsPerHour,
      congestion: flowSum > 0 ? ratioSum / flowSum : 0,
      avgSpeedKmh: vhours > 0 ? (vkm / vhours) * 3.6 : 0,
      congestedLength,
      commuteMinutes: cN > 0 ? cSum / cN / 60 : 0,
      unroutable,
      worst: worst.slice(0, 5),
    };
  }

  // ---------------------------------------------------------------- queries

  edgeTraffic(edgeId: number): EdgeTraffic | null {
    if (this.dirty) return null;
    const pair = this.edgeLinks.get(edgeId);
    if (!pair) return null;
    const [f, r] = pair;
    const t = getRoadType(this.roads.edges.get(edgeId)!.typeId);
    const forward = f >= 0 ? this.linkFlow[f] : 0;
    const backward = r >= 0 ? this.linkFlow[r] : 0;
    let ratio = 0;
    let time = 0;
    let len = 0;
    for (const l of pair) {
      if (l < 0) continue;
      ratio = Math.max(ratio, this.linkFlow[l] / this.linkCap[l]);
      time += this.linkTime[l];
      len += this.linkLen[l];
    }
    return { forward, backward, capacity: t.capacity, ratio, speedKmh: time > 0 ? (len / time) * 3.6 : t.speedKmh, freeSpeedKmh: t.speedKmh };
  }

  /** Volume/capacity of a directed link. */
  linkRatio(l: number): number {
    return this.linkFlow[l] / this.linkCap[l];
  }

  /** Current speed on a directed link (m/s). */
  linkSpeed(l: number): number {
    return this.linkLen[l] / Math.max(1e-6, this.linkTime[l]);
  }

  /** Links of an edge ([a→b, b→a], -1 when absent). */
  linksOf(edgeId: number): [number, number] | undefined {
    return this.edgeLinks.get(edgeId);
  }

  /** Total flow on each edge (veh/h, both directions). */
  forEachEdgeFlow(fn: (edgeId: number, flow: number, ratio: number) => void): void {
    if (this.dirty) return;
    for (const [edge, [f, r]] of this.edgeLinks) {
      const flow = (f >= 0 ? this.linkFlow[f] : 0) + (r >= 0 ? this.linkFlow[r] : 0);
      const ratio = Math.max(f >= 0 ? this.linkFlow[f] / this.linkCap[f] : 0, r >= 0 ? this.linkFlow[r] / this.linkCap[r] : 0);
      fn(edge, flow, ratio);
    }
  }

  /**
   * A path drawn from the current routed trips, weighted by volume — the
   * actual route (and junction turns) the assignment gives those trips.
   */
  samplePath(rand: () => number): VehiclePath | null {
    if (this.flows.length === 0 || this.flowTotal <= 0 || this.dirty) return null;
    let x = rand() * this.flowTotal;
    let flow = this.flows[this.flows.length - 1];
    for (const f of this.flows) {
      x -= f.vol;
      if (x <= 0) {
        flow = f;
        break;
      }
    }
    const tree = this.trees[flow.g];
    const og = tree.origin;
    const links: number[] = [];
    let startFrac = 0;
    let endFrac = 0;
    if (flow.out) {
      // Back-track from the destination's arrival node to the origin.
      links.push(flow.opt.link);
      endFrac = flow.opt.frac;
      let n = flow.opt.node;
      for (let guard = 0; n >= 0 && guard < 10_000; guard++) {
        links.push(tree.predLink[n]);
        n = tree.predFrom[n];
      }
      links.reverse();
      const dep = og.dep.find((o) => o.link === links[0]);
      startFrac = dep ? dep.frac : 0;
    } else {
      links.push(flow.opt.link);
      startFrac = flow.opt.frac;
      let n = flow.opt.node;
      for (let guard = 0; n >= 0 && guard < 10_000; guard++) {
        links.push(tree.succLink[n]);
        n = tree.succTo[n];
      }
      const arr = og.arr.find((o) => o.link === links[links.length - 1]);
      endFrac = arr ? arr.frac : 1;
    }
    if (links.some((l) => l < 0)) return null;
    return { links, startFrac, endFrac, freight: flow.purpose === 'freight' };
  }
}
