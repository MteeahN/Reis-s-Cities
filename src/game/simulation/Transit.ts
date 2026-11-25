import { CELL_SIZE } from '../core/config';
import { getBuilding } from '../data/buildings';
import { getRoadType } from '../data/roads';
import { ZoneType } from '../data/zones';
import type { PlacedBuilding } from '../entities/building/BuildingRegistry';
import type { RoadEdge, RoadGraph } from '../entities/road/RoadGraph';
import { residentsOf, type Population } from './Population';

/**
 * Bus transit. Stops stand beside roads; a line visits its stops in order and
 * runs back to the first (a loop) along the road network, respecting one-way
 * roads. Ridership is computed from the city as it is: homes within walking
 * distance of a line's stops send part of their commute and shopping trips by
 * bus, more when the line reaches more of the city's jobs and shops and runs
 * more often. Riders pay a fare; every bus costs upkeep; each bus carries at
 * most BUS_DAILY_CAPACITY riders a day, and buses only run while bus depots
 * house them (DEPOT_BUSES each). Riders can change between lines whose stops
 * stand close together. Bus trips are taken off the roads.
 */

export const STOP_COST = 500;
export const BUS_PRICE = 1200;
/** Daily upkeep per bus (₺). */
export const BUS_DAILY_UPKEEP = 60;
/** Fare per ride (₺). */
export const FARE = 2;
/** Walking distance to a stop (m). */
export const WALK = 260;
export const BUS_DAILY_CAPACITY = 600;
/** Buses per km of route for the full service level. */
const FULL_FREQUENCY = 0.6;
/** Largest share of a home's trips that switches to the bus. */
const MAX_SHARE = 0.45;
export const MAX_BUSES = 20;
/** The bus depot building; buses only run while depots house them. */
export const DEPOT_ID = 'bus_depot';
/** Buses one depot houses. */
export const DEPOT_BUSES = 30;
/** Stops of two lines this close (m) let riders change between them. */
export const TRANSFER_WALK = 40;
/** A destination reached by changing lines counts this much (the change costs time). */
const TRANSFER_WEIGHT = 0.7;
export const LINE_COLORS = ['#e5484d', '#2f7dd1', '#2fa36b', '#e0a321', '#8a4fc2', '#1f8f8f', '#e06a2b', '#c2549b'];

export interface BusStop {
  id: number;
  x: number;
  z: number;
}

export interface BusLine {
  id: number;
  name: string;
  color: string;
  stops: number[];
  buses: number;
}

export interface TransitData {
  stops: BusStop[];
  lines: BusLine[];
  nextId: number;
}

/** A stretch of road a route runs along: from d0 to d1 metres from the edge's node a. */
export interface RouteLeg {
  edge: number;
  d0: number;
  d1: number;
}

export interface Route {
  legs: RouteLeg[];
  length: number;
  /** Distance along the route at which each stop is served (the first is 0). */
  stopsAt: number[];
  /** False when some stop can't be reached from the previous one. */
  ok: boolean;
}

export interface LineStats {
  riders: number;
  capacity: number;
  length: number;
  ok: boolean;
  /** Buses actually running (fewer than bought when the depots are full). */
  running: number;
  /** Other lines riders can change to. */
  transfers: number;
}

/** Where a stop meets the road. */
interface StopAttach {
  edge: RoadEdge;
  t: number;
}

export class Transit {
  readonly stops = new Map<number, BusStop>();
  readonly lines = new Map<number, BusLine>();
  private nextId = 1;
  /** Bumped on every change (renderers and caches follow it). */
  version = 0;
  private routeCache = new Map<number, { key: string; route: Route }>();
  /** Share of each home's work / shop trips going by bus (last update). */
  private share = new Map<number, { work: number; shop: number }>();
  readonly lineStats = new Map<number, LineStats>();
  /** Riders boarding at each stop a day (last update). */
  readonly stopRiders = new Map<number, number>();
  ridersPerDay = 0;
  /** Buses the depots can house (set from the city's depots on update). */
  depotCapacity = 0;

  constructor(private readonly roads: RoadGraph) {}

  // ---------------------------------------------------------------- editing

  addStop(x: number, z: number): BusStop {
    const s = { id: this.nextId++, x, z };
    this.stops.set(s.id, s);
    this.version++;
    return s;
  }

  /** Removes a stop and takes it out of every line (lines left with fewer than two stops are removed). */
  removeStop(id: number): void {
    if (!this.stops.delete(id)) return;
    for (const [lid, l] of this.lines) {
      l.stops = l.stops.filter((s) => s !== id);
      if (l.stops.length < 2) this.lines.delete(lid);
    }
    this.version++;
  }

  addLine(stops: number[]): BusLine {
    const n = this.lines.size;
    const used = new Set([...this.lines.values()].map((l) => l.color));
    const color = LINE_COLORS.find((c) => !used.has(c)) ?? LINE_COLORS[n % LINE_COLORS.length];
    let num = 1;
    const names = new Set([...this.lines.values()].map((l) => l.name));
    while (names.has(`Hat ${num}`)) num++;
    const line: BusLine = { id: this.nextId++, name: `Hat ${num}`, color, stops: [...stops], buses: 1 };
    this.lines.set(line.id, line);
    this.version++;
    return line;
  }

  removeLine(id: number): void {
    if (this.lines.delete(id)) this.version++;
  }

  setBuses(id: number, n: number): void {
    const l = this.lines.get(id);
    if (!l) return;
    l.buses = Math.max(0, Math.min(MAX_BUSES, Math.round(n)));
    this.version++;
  }

  /** Changes the stops a line visits (at least two, all existing). */
  setLineStops(id: number, stops: number[]): boolean {
    const l = this.lines.get(id);
    if (!l || stops.length < 2 || stops.some((s) => !this.stops.has(s))) return false;
    l.stops = [...stops];
    this.version++;
    return true;
  }

  renameLine(id: number, name: string): void {
    const l = this.lines.get(id);
    const n = name.trim().slice(0, 24);
    if (!l || !n || n === l.name) return;
    l.name = n;
    this.version++;
  }

  setLineColor(id: number, color: string): void {
    const l = this.lines.get(id);
    if (!l || l.color === color) return;
    l.color = color;
    this.version++;
  }

  get busCount(): number {
    let n = 0;
    for (const l of this.lines.values()) n += l.buses;
    return n;
  }

  /** Buses of a line that run: all of them while the depots have room, else a fair share. */
  running(l: BusLine): number {
    const total = this.busCount;
    if (total <= this.depotCapacity) return l.buses;
    return total > 0 ? Math.floor((l.buses * this.depotCapacity) / total) : 0;
  }

  /** Lines riders of `id` can change to (stops within TRANSFER_WALK), directly or through others. */
  connected(id: number): Set<number> {
    const out = new Set<number>([id]);
    const queue = [id];
    const pts = (l: BusLine) => l.stops.map((s) => this.stops.get(s)).filter((s): s is BusStop => !!s);
    while (queue.length) {
      const a = this.lines.get(queue.pop()!);
      if (!a) continue;
      const pa = pts(a);
      for (const b of this.lines.values()) {
        if (out.has(b.id)) continue;
        if (pts(b).some((s) => pa.some((t) => Math.hypot(s.x - t.x, s.z - t.z) <= TRANSFER_WALK))) {
          out.add(b.id);
          queue.push(b.id);
        }
      }
    }
    return out;
  }

  /** Where a new stop best goes into a line (index), adding the least straight-line detour. */
  insertIndex(l: BusLine, stop: BusStop): number {
    let best = l.stops.length;
    let bestCost = Infinity;
    const n = l.stops.length;
    for (let k = 0; k < n; k++) {
      const a = this.stops.get(l.stops[k]);
      const b = this.stops.get(l.stops[(k + 1) % n]);
      if (!a || !b) continue;
      const cost = Math.hypot(a.x - stop.x, a.z - stop.z) + Math.hypot(stop.x - b.x, stop.z - b.z) - Math.hypot(a.x - b.x, a.z - b.z);
      if (cost < bestCost) (bestCost = cost), (best = k + 1);
    }
    return best;
  }

  /** The stop near a point (within `radius` m), if any. */
  stopAt(x: number, z: number, radius = 8): BusStop | null {
    let best: BusStop | null = null;
    let bd = radius;
    for (const s of this.stops.values()) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) (bd = d), (best = s);
    }
    return best;
  }

  serialize(): TransitData {
    return { stops: [...this.stops.values()].map((s) => ({ ...s })), lines: [...this.lines.values()].map((l) => ({ ...l, stops: [...l.stops] })), nextId: this.nextId };
  }

  restore(d: TransitData): void {
    this.stops.clear();
    this.lines.clear();
    for (const s of d.stops ?? []) if (Number.isFinite(s.x) && Number.isFinite(s.z)) this.stops.set(s.id, { id: s.id, x: s.x, z: s.z });
    for (const l of d.lines ?? []) {
      const stops = (l.stops ?? []).filter((s) => this.stops.has(s));
      if (stops.length >= 2) this.lines.set(l.id, { id: l.id, name: String(l.name ?? 'Hat'), color: String(l.color ?? LINE_COLORS[0]), stops, buses: Math.max(0, Math.min(MAX_BUSES, Math.round(Number(l.buses) || 0))) });
    }
    this.nextId = Math.max(Number(d.nextId) || 1, ...[...this.stops.keys(), ...this.lines.keys()].map((k) => k + 1), 1);
    this.version++;
  }

  // ---------------------------------------------------------------- routing

  /** The road a stop serves: the nearest road vehicles may use. */
  attach(s: BusStop): StopAttach | null {
    const hit = this.roads.nearestEdge(s.x, s.z, 14, true, (e) => !getRoadType(e.typeId).pedestrian);
    return hit ? { edge: hit.edge, t: hit.t } : null;
  }

  /** The loop a line drives: stop to stop along the roads, then back to the first stop. */
  route(line: BusLine): Route {
    const key = `${this.roads.version}:${this.version}`;
    const hit = this.routeCache.get(line.id);
    if (hit && hit.key === key) return hit.route;
    const legs: RouteLeg[] = [];
    const stopsAt: number[] = [];
    let ok = line.stops.length >= 2;
    const n = line.stops.length;
    let run = 0;
    for (let k = 0; k < n && ok; k++) {
      stopsAt.push(run);
      const a = this.stops.get(line.stops[k]);
      const b = this.stops.get(line.stops[(k + 1) % n]);
      const pa = a && this.attach(a);
      const pb = b && this.attach(b);
      const part = pa && pb ? this.path(pa, pb) : null;
      if (!part) ok = false;
      else {
        legs.push(...part);
        for (const l of part) run += Math.abs(l.d1 - l.d0);
      }
    }
    const route: Route = { legs: ok ? legs : [], length: ok ? run : 0, stopsAt: ok ? stopsAt : [], ok };
    this.routeCache.set(line.id, { key, route });
    return route;
  }

  /** Shortest drive from one stop to the next (Dijkstra over junctions, one-way aware). */
  private path(from: StopAttach, to: StopAttach): RouteLeg[] | null {
    const roads = this.roads;
    const lenOf = (e: RoadEdge) => e.length;
    const da = from.t * lenOf(from.edge);
    const db = to.t * lenOf(to.edge);
    const dirA = roads.direction(from.edge);
    // Same road, reachable straight ahead.
    if (from.edge.id === to.edge.id && ((db >= da && dirA >= 0) || (db <= da && dirA <= 0))) return [{ edge: from.edge.id, d0: da, d1: db }];
    const dist = new Map<number, number>();
    const prev = new Map<number, { node: number; leg: RouteLeg } | null>();
    const open: { node: number; d: number }[] = [];
    const push = (node: number, d: number, p: { node: number; leg: RouteLeg } | null) => {
      if (d >= (dist.get(node) ?? Infinity)) return;
      dist.set(node, d);
      prev.set(node, p);
      open.push({ node, d });
    };
    const startLegs = new Map<number, RouteLeg>();
    if (dirA >= 0) {
      push(from.edge.b, lenOf(from.edge) - da, null);
      startLegs.set(from.edge.b, { edge: from.edge.id, d0: da, d1: lenOf(from.edge) });
    }
    if (dirA <= 0 && da < (dist.get(from.edge.a) ?? Infinity)) {
      push(from.edge.a, da, null);
      startLegs.set(from.edge.a, { edge: from.edge.id, d0: da, d1: 0 });
    }
    const dirB = roads.direction(to.edge);
    const done = new Set<number>();
    while (open.length) {
      open.sort((x, y) => x.d - y.d);
      const { node, d } = open.shift()!;
      if (done.has(node) || d > (dist.get(node) ?? Infinity)) continue;
      done.add(node);
      const n = roads.nodes.get(node);
      if (!n) continue;
      for (const eid of n.edges) {
        const e = roads.edges.get(eid)!;
        if (getRoadType(e.typeId).pedestrian) continue;
        const dir = roads.direction(e);
        const forward = e.a === node;
        if ((forward && dir < 0) || (!forward && dir > 0)) continue;
        const other = forward ? e.b : e.a;
        push(other, d + lenOf(e), { node, leg: { edge: e.id, d0: forward ? 0 : lenOf(e), d1: forward ? lenOf(e) : 0 } });
      }
    }
    // Enter the last road from whichever end is allowed and cheaper.
    let best = Infinity;
    let endNode = -1;
    let lastLeg: RouteLeg | null = null;
    const L = lenOf(to.edge);
    if (dirB >= 0 && (dist.get(to.edge.a) ?? Infinity) + db < best) {
      best = dist.get(to.edge.a)! + db;
      endNode = to.edge.a;
      lastLeg = { edge: to.edge.id, d0: 0, d1: db };
    }
    if (dirB <= 0 && (dist.get(to.edge.b) ?? Infinity) + (L - db) < best) {
      best = dist.get(to.edge.b)! + (L - db);
      endNode = to.edge.b;
      lastLeg = { edge: to.edge.id, d0: L, d1: db };
    }
    if (!lastLeg || !Number.isFinite(best)) return null;
    const legs: RouteLeg[] = [lastLeg];
    let cur = endNode;
    for (;;) {
      const p = prev.get(cur);
      if (!p) break;
      legs.push(p.leg);
      cur = p.node;
    }
    const first = startLegs.get(cur);
    if (first) legs.push(first);
    return legs.reverse();
  }

  // ---------------------------------------------------------------- ridership

  /**
   * Recomputes who rides. Buses run only while depots house them. For each
   * line, the share of the city's jobs and shops within walking distance of
   * its stops (and, at a discount, of the lines riders can change to) and its
   * service level give the share of trips homes near its stops make by bus;
   * each line carries at most its running buses' capacity. Riders board at
   * the stop nearest their home and, coming back, at the stops near where
   * they work and shop.
   */
  update(buildings: Iterable<PlacedBuilding>, pop: Population, employmentRate: number): void {
    this.share.clear();
    this.lineStats.clear();
    this.stopRiders.clear();
    this.ridersPerDay = 0;
    const all = [...buildings];
    this.depotCapacity = all.filter((b) => b.defId === DEPOT_ID && b.state === 'active').length * DEPOT_BUSES;
    const lines = [...this.lines.values()];
    if (lines.length === 0) return;
    const centre = (b: PlacedBuilding) => ({ x: (b.i + b.w / 2) * CELL_SIZE, z: (b.j + b.d / 2) * CELL_SIZE });
    const lineStops = lines.map((l) => l.stops.map((id) => this.stops.get(id)!).filter(Boolean));
    const near = (k: number, p: { x: number; z: number }) => lineStops[k].some((s) => Math.hypot(s.x - p.x, s.z - p.z) <= WALK);
    // Lines reachable from each line by changing (index sets).
    const index = new Map(lines.map((l, k) => [l.id, k]));
    const groups = lines.map((l) => [...this.connected(l.id)].map((id) => index.get(id)!).filter((k) => k !== undefined));
    const running = lines.map((l) => this.running(l));
    let jobs = 0;
    let shops = 0;
    const jobsNear = new Array(lines.length).fill(0);
    const shopsNear = new Array(lines.length).fill(0);
    // Where riders come back from: destinations near each stop.
    const destNear = new Map<number, number>();
    const homes: { b: PlacedBuilding; p: { x: number; z: number }; work: number; shop: number }[] = [];
    const reach = (p: { x: number; z: number }, amount: number, into: number[]) => {
      const direct = lines.map((_, k) => near(k, p));
      lines.forEach((_, k) => {
        if (direct[k]) into[k] += amount;
        else if (groups[k].some((o) => o !== k && direct[o] && running[o] > 0)) into[k] += amount * TRANSFER_WEIGHT;
      });
      for (const s of this.stops.values()) if (Math.hypot(s.x - p.x, s.z - p.z) <= WALK) destNear.set(s.id, (destNear.get(s.id) ?? 0) + amount);
    };
    for (const b of all) {
      if (b.state !== 'active') continue;
      const def = getBuilding(b.defId);
      const p = centre(b);
      if (def.workers > 0 && b.occupants > 0) {
        jobs += b.occupants;
        reach(p, b.occupants, jobsNear);
      }
      if (b.zone === ZoneType.Commercial && b.occupants > 0) {
        shops += b.occupants;
        reach(p, b.occupants, shopsNear);
      }
      if (b.zone === ZoneType.Residential) {
        const hh = pop.households.get(b.id);
        if (!hh || residentsOf(hh) <= 0) continue;
        homes.push({ b, p, work: hh.ages[2] * employmentRate, shop: residentsOf(hh) * 0.25 });
      }
    }
    // Service level and reach per line.
    const level = lines.map((l, k) => {
      const r = this.route(l);
      if (!r.ok || running[k] <= 0 || r.length <= 0) return { work: 0, shop: 0, route: r };
      const freq = Math.min(1, running[k] / ((r.length / 1000) * FULL_FREQUENCY));
      return {
        work: jobs > 0 ? Math.min(MAX_SHARE, 0.6 * freq * Math.sqrt(Math.min(1, jobsNear[k] / jobs))) : 0,
        shop: shops > 0 ? Math.min(MAX_SHARE, 0.6 * freq * Math.sqrt(Math.min(1, shopsNear[k] / shops))) : 0,
        route: r,
      };
    });
    // Each home rides its best line; riders per line (both ways).
    const pick = new Map<number, number>();
    const demand = new Array(lines.length).fill(0);
    for (const h of homes) {
      let best = -1;
      let bestV = 0;
      lines.forEach((_, k) => {
        const v = level[k].work * h.work + level[k].shop * h.shop;
        if (v > bestV && near(k, h.p)) (bestV = v), (best = k);
      });
      if (best < 0) continue;
      pick.set(h.b.id, best);
      demand[best] += 2 * (level[best].work * h.work + level[best].shop * h.shop);
    }
    // Capacity: a full line turns riders away (they drive).
    const scale = lines.map((_, k) => {
      const cap = running[k] * BUS_DAILY_CAPACITY;
      return demand[k] > cap && demand[k] > 0 ? cap / demand[k] : 1;
    });
    const board = (id: number, n: number) => this.stopRiders.set(id, (this.stopRiders.get(id) ?? 0) + n);
    for (const h of homes) {
      const k = pick.get(h.b.id);
      if (k === undefined) continue;
      const sh = { work: level[k].work * scale[k], shop: level[k].shop * scale[k] };
      this.share.set(h.b.id, sh);
      // Outbound: the stop nearest home.
      let home = lineStops[k][0];
      let hd = Infinity;
      for (const s of lineStops[k]) {
        const d = Math.hypot(s.x - h.p.x, s.z - h.p.z);
        if (d < hd) (hd = d), (home = s);
      }
      if (home) board(home.id, sh.work * h.work + sh.shop * h.shop);
    }
    lines.forEach((l, k) => {
      const riders = demand[k] * scale[k];
      // Return trips board where the destinations are (stops of the line and those it connects to).
      const back = groups[k].flatMap((o) => lineStops[o]);
      const weight = back.reduce((s, st) => s + (destNear.get(st.id) ?? 0), 0);
      if (weight > 0) for (const st of back) board(st.id, ((riders / 2) * (destNear.get(st.id) ?? 0)) / weight);
      this.lineStats.set(l.id, { riders, capacity: running[k] * BUS_DAILY_CAPACITY, length: level[k].route.length, ok: level[k].route.ok, running: running[k], transfers: groups[k].length - 1 });
      this.ridersPerDay += riders;
    });
  }

  /** Share of a home's work / shop trips made by bus (0 when not served). */
  shareOf(buildingId: number): { work: number; shop: number } {
    return this.share.get(buildingId) ?? { work: 0, shop: 0 };
  }
}
