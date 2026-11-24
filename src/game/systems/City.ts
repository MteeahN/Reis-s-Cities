import { archStyleAt, archStyleIndex, type ArchStyle } from '../data/styles';
import { growablePrice, type DistrictRules } from '../data/buildings';
import { CELL_SIZE, GRID_CELLS, START_TILES, TILE_CELLS, WORLD_SIZE, TILES_PER_SIDE } from '../core/config';
import { LINE_TYPES, type LineKind } from '../data/infrastructure';
import { UtilityLines } from '../entities/infra/UtilityLines';
import { sampleBezier, type P2 } from '../entities/road/curve';
import { ServiceCoverage } from '../simulation/Services';
import { computeUtilities, type UtilityResult } from '../simulation/Utilities';
import { getBuilding } from '../data/buildings';
import { getRoadType, type RoadTypeDef } from '../data/roads';
import { getZone, ZoneType, type ZoneKind } from '../data/zones';
import { frontCells, planBuilding, type BuildingPlan, type PlacementWorld, type Rotation } from '../entities/building/BuildingPlacement';
import { BuildingRegistry, type PlacedBuilding } from '../entities/building/BuildingRegistry';
import { RoadGraph, type RoadEdge } from '../entities/road/RoadGraph';
import { LandValueMap, waterProximity } from '../simulation/LandValue';
import type { Lot, LotWorld } from '../simulation/LotFinder';
import { Population } from '../simulation/Population';
import { ATTACH_RADIUS, TrafficModel, type Attach } from '../simulation/traffic/TrafficModel';
import { commitRoad, planRoad, planUpgrade, type Anchor, type PlannerWorld, type RoadPlan, type UpgradePlan } from '../tools/placement/RoadPlanner';
import { commitRoundabout, planRoundabout, type RoundaboutPlan } from '../tools/placement/Roundabout';
import { findRoute, relaxCorners, simplifyRoute, smoothPieces } from './HighwayRoute';
import { Occupancy } from '../world/Occupancy';
import type { World } from '../world/World';
import { ZoneMap } from '../world/ZoneMap';
import { Economy } from './Economy';
import { Treasury } from './Treasury';
import { UndoHistory, type CellZoning, type Spot, type UndoEntry } from './UndoHistory';

export const DEMOLISH_REFUND = 0.5;
export const MIN_LINE_LENGTH = 8;

export interface LinePlan {
  kind: LineKind;
  a: P2;
  b: P2;
  length: number;
  cost: number;
  weeklyMaintenance: number;
  valid: boolean;
  errors: string[];
}

/**
 * The player-built city: road network, zones, buildings, cell occupancy,
 * population, land value and the treasury. All changes go through here so
 * money, occupancy, zones and vegetation always stay consistent.
 */
export class City {
  readonly roads = new RoadGraph();
  readonly buildings = new BuildingRegistry();
  readonly occupancy = new Occupancy();
  readonly zones = new ZoneMap();
  readonly treasury = new Treasury();
  readonly economy = new Economy(this.treasury);
  readonly population = new Population();
  readonly landValue: LandValueMap;
  readonly powerLines = new UtilityLines('power');
  readonly pipes = new UtilityLines('pipe');
  readonly services = new ServiceCoverage();
  readonly traffic = new TrafficModel(this.roads);
  /** Latest utility network solution (recomputed when infrastructure changes). */
  utilities: UtilityResult;
  private utilitiesDirty = true;
  /** Highest population reached (kept in sync by the simulation; drives unlocks). */
  maxPopulation = 0;
  /** Sandbox (creative) mode: unlimited money, every tool and all land unlocked. */
  sandbox = false;
  /**
   * Where the intercity highway meets the map edges: the city's links to the
   * outside world. Immigrants, visitors and freight arrive through them.
   * Empty only for cities saved before the highway existed (no connection rule).
   */
  entries: P2[] = [];
  /** End of the link road from the highway junction into the city (where the first streets start). */
  entryLink: P2 | null = null;
  /** First outside connection (null: none). */
  get entry(): P2 | null {
    return this.entries[0] ?? null;
  }
  private outsideCache: Set<number> | null = null;
  /** Undo / redo of hand-placed buildings. */
  readonly undo = new UndoHistory();
  /** False while undo/redo replays an entry, so it is not recorded again. */
  private recording = true;
  /** Architectural style painted on each cell (index into ARCH_STYLES; 0 = modern). */
  readonly districtStyle = new Uint8Array(GRID_CELLS * GRID_CELLS);
  /** Wealth homes are built for, per cell (0 mixed, 1 modest, 2 middle, 3 wealthy). */
  readonly districtWealth = new Uint8Array(GRID_CELLS * GRID_CELLS);
  /** Height limit per cell (index into HEIGHT_LIMITS: 0 none, 1 low, 2 mid-rise). */
  readonly districtHeight = new Uint8Array(GRID_CELLS * GRID_CELLS);
  private utilityListeners = new Set<(u: UtilityResult) => void>();
  readonly plannerWorld: PlannerWorld;
  readonly placementWorld: PlacementWorld;
  readonly lotWorld: LotWorld;

  constructor(readonly world: World) {
    this.landValue = new LandValueMap(waterProximity((i, j) => world.grid.isWater(i, j)));
    this.buildings.onChange((c) => {
      for (const b of c.removed) this.traffic.invalidateBuilding(b.id);
    });
    this.plannerWorld = {
      heightAt: world.heightAt,
      isCellUnlocked: world.isCellUnlocked,
      buildingAt: (i, j) => this.occupancy.buildingAt(i, j),
    };
    this.placementWorld = {
      vertexHeight: (i, j) => world.field.vertex(i, j),
      isCellUnlocked: world.isCellUnlocked,
      isWater: (i, j) => world.grid.isWater(i, j),
      hasRoad: (i, j) => this.occupancy.hasRoad(i, j),
      buildingAt: (i, j) => this.occupancy.buildingAt(i, j),
    };
    this.lotWorld = {
      zoneAt: (i, j) => this.zones.get(i, j),
      hasRoad: (i, j) => this.occupancy.hasRoad(i, j),
      buildingAt: (i, j) => this.occupancy.buildingAt(i, j),
      isBuildable: (i, j) => world.grid.isBuildable(i, j) && world.isCellUnlocked(i, j),
      vertexHeight: (i, j) => world.field.vertex(i, j),
      rulesAt: (i, j) => this.rulesAt(i, j),
    };

    this.roads.onChange((c) => {
      this.outsideCache = null;

      for (const id of c.removed) {
        this.occupancy.clearRoad(id);
        // Land that is no longer near any road loses its (empty) zoning.
        const lost = this.zones.removeEdge(id).filter((k) => this.occupancy.building[k] === 0);
        if (lost.length) this.zones.set(lost, ZoneType.None, () => false);
      }
      for (const id of c.added) {
        const e = this.roads.edges.get(id);
        if (!e) continue;
        const type = getRoadType(e.typeId);
        this.occupancy.setRoad(id, e.poly.points, type.width);
        // Raised roads have no street frontage.
        if (type.zoneable && !this.roads.isElevated(e)) this.zones.addEdge(id, e.poly.points, type.width);
        this.clearVegetationAlong(e);
      }
      // Road cells can't be zoned: clear zoning under roads, refresh the lot index.
      const underRoad: number[] = [];
      for (let k = 0; k < GRID_CELLS * GRID_CELLS; k++) {
        if (this.zones.zone[k] && this.occupancy.road[k] > 0) underRoad.push(k);
      }
      if (underRoad.length) this.zones.set(underRoad, ZoneType.None, () => false);
    });

    this.utilities = computeUtilities([], this.powerLines.cells, this.pipes.cells);
    const dirty = () => (this.utilitiesDirty = true);
    this.powerLines.onChange(dirty);
    this.pipes.onChange(dirty);
    this.buildings.onChange(dirty);

    this.buildings.onChange((c) => {
      const cells: number[] = [];
      for (const b of c.removed) for (const k of b.cells) cells.push(k);
      for (const b of c.added) for (const k of b.cells) cells.push(k);
      for (const k of cells) this.zones.refresh(k, this.isCellFree(k));
      this.zones.touch(cells);
    });
  }

  private isCellFree(k: number): boolean {
    return this.occupancy.building[k] === 0 && this.occupancy.road[k] === 0;
  }

  private clearVegetationAlong(e: RoadEdge): void {
    const half = getRoadType(e.typeId).width / 2 + 2;
    const pts = e.poly.points;
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minZ = Math.min(minZ, p.z);
      maxX = Math.max(maxX, p.x);
      maxZ = Math.max(maxZ, p.z);
    }
    this.world.vegetation.clearWhere(minX - half, minZ - half, maxX + half, maxZ + half, (x, z) => {
      for (let k = 1; k < pts.length; k++) {
        const a = pts[k - 1];
        const b = pts[k];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
        if (Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) < half) return true;
      }
      return false;
    });
  }

  private clearVegetationRect(i: number, j: number, w: number, d: number): void {
    this.world.vegetation.clearWhere(i * CELL_SIZE - 1, j * CELL_SIZE - 1, (i + w) * CELL_SIZE + 1, (j + d) * CELL_SIZE + 1, () => true);
  }

  // ---------------------------------------------------------------- utilities

  /** Re-solves power/water/sewage networks if anything changed (or when forced). */
  refreshUtilities(force = false): UtilityResult {
    if (this.utilitiesDirty || force) {
      this.utilitiesDirty = false;
      this.utilities = computeUtilities(this.buildings.items.values(), this.powerLines.cells, this.pipes.cells);
      this.utilityListeners.forEach((l) => l(this.utilities));
    }
    return this.utilities;
  }

  onUtilities(fn: (u: UtilityResult) => void): () => void {
    this.utilityListeners.add(fn);
    return () => this.utilityListeners.delete(fn);
  }

  linesOf(kind: LineKind): UtilityLines {
    return kind === 'power' ? this.powerLines : this.pipes;
  }

  /** Validates a straight power line / pipe segment. */
  planLine(kind: LineKind, a: P2, b: P2): LinePlan {
    const type = LINE_TYPES[kind];
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const errors: string[] = [];
    if (length < MIN_LINE_LENGTH) errors.push(`Hat çok kısa (en az ${MIN_LINE_LENGTH} m)`);
    const steps = Math.max(1, Math.ceil(length / 4));
    let outside = false;
    let locked = false;
    for (let s = 0; s <= steps; s++) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const z = a.z + ((b.z - a.z) * s) / steps;
      if (x < 0 || z < 0 || x > WORLD_SIZE || z > WORLD_SIZE) outside = true;
      else if (!this.world.isCellUnlocked(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE))) locked = true;
    }
    if (outside) errors.push('Harita sınırlarının dışında');
    if (locked) errors.push('Satın alınmamış arazi');
    const cost = Math.round(length * type.costPerMeter);
    if (cost > this.treasury.balance) errors.push('Yetersiz bütçe');
    return { kind, a: { ...a }, b: { ...b }, length, cost, weeklyMaintenance: Math.round(length * type.maintenancePerMeter), valid: errors.length === 0, errors };
  }

  buildLine(plan: LinePlan): boolean {
    const fresh = this.planLine(plan.kind, plan.a, plan.b);
    if (!fresh.valid || !this.treasury.spend(fresh.cost, 'infra')) return false;
    const l = this.linesOf(plan.kind).add(fresh.a, fresh.b, fresh.cost);
    if (this.recording) {
      this.undo.push({ kind: 'line', label: `${LINE_TYPES[plan.kind].name} yapımı`, lineKind: plan.kind, op: 'add', line: { id: l.id, a: l.a, b: l.b, cost: l.cost }, net: -fresh.cost });
    }
    return true;
  }

  lineRefund(kind: LineKind, id: number): number {
    const l = this.linesOf(kind).lines.get(id);
    return l ? Math.round(l.cost * DEMOLISH_REFUND) : 0;
  }

  demolishLine(kind: LineKind, id: number): number {
    const refund = this.lineRefund(kind, id);
    const l = this.linesOf(kind).remove(id);
    if (!l) return 0;
    this.treasury.refund(refund, 'infra');
    if (this.recording) {
      this.undo.push({ kind: 'line', label: `${LINE_TYPES[kind].name} yıkımı`, lineKind: kind, op: 'remove', line: { id: l.id, a: l.a, b: l.b, cost: l.cost }, net: refund });
    }
    return refund;
  }

  // ---------------------------------------------------------------- roads

  /**
   * Runs a player edit of the road network and records it for undo: the
   * network before and after, and what it cost. Nothing is recorded if the
   * network did not change.
   */
  editRoads<T>(label: string, fn: () => T): T {
    if (!this.recording) return fn();
    const before = this.roads.serialize();
    const version = this.roads.version;
    const balance = this.treasury.balance;
    const out = fn();
    if (this.roads.version !== version) this.undo.push({ kind: 'roads', label, before, after: this.roads.serialize(), net: this.treasury.balance - balance });
    return out;
  }

  /** Builds a validated plan; returns the end node id (for chaining) or null. */
  buildRoad(plan: RoadPlan): number | null {
    if (!plan.valid || !this.treasury.canAfford(plan.cost)) return null;
    return this.editRoads(`${getRoadType(plan.typeId).name} yapımı`, () => {
      this.treasury.spend(plan.cost, 'roads');
      return commitRoad(this.roads, plan).endNode;
    });
  }

  planRoundabout(nodeId: number): RoundaboutPlan {
    return planRoundabout(this.roads, nodeId, this.plannerWorld, this.treasury.balance);
  }

  /** Builds a validated roundabout (pays for the ring); false if it can no longer be built. */
  buildRoundabout(plan: RoundaboutPlan): boolean {
    const fresh = this.planRoundabout(plan.nodeId);
    if (!fresh.valid || !this.treasury.canAfford(fresh.cost)) return false;
    return this.editRoads('Döner kavşak', () => {
      this.treasury.spend(fresh.cost, 'roads');
      commitRoundabout(this.roads, fresh);
      return true;
    });
  }

  planUpgrade(edgeId: number, type: RoadTypeDef): UpgradePlan | null {
    const e = this.roads.edges.get(edgeId);
    return e ? planUpgrade(this.roads, e, type, this.plannerWorld, this.treasury.balance) : null;
  }

  upgradeRoad(plan: UpgradePlan): boolean {
    if (!plan.valid || !this.roads.edges.has(plan.edgeId)) return false;
    if (!this.treasury.canAfford(plan.netCost)) return false;
    return this.editRoads(`${getRoadType(plan.toTypeId).name} olarak yenileme`, () => {
      this.treasury.spend(plan.netCost, 'roads');
      const e = this.roads.edges.get(plan.edgeId)!;
      this.roads.setEdgeType(plan.edgeId, plan.toTypeId, plan.cost - e.cost);
      return true;
    });
  }

  roadRefund(edgeId: number): number {
    const e = this.roads.edges.get(edgeId);
    return e ? Math.round(e.cost * DEMOLISH_REFUND) : 0;
  }

  demolishRoad(edgeId: number): number {
    const refund = this.roadRefund(edgeId);
    const e = this.roads.edges.get(edgeId);
    if (!e) return 0;
    return this.editRoads(`${getRoadType(e.typeId).name} yıkımı`, () => {
      this.roads.removeEdge(edgeId);
      this.treasury.refund(refund, 'roads');
      return refund;
    });
  }

  // ---------------------------------------------------------------- outside connection

  /**
   * Lays the intercity highway across the whole map (new cities): from one
   * map edge to the opposite one, passing outside the owned land. The route
   * is searched over the terrain so it follows the gentlest ground, bridges
   * short stretches of water and keeps off the city's land; it is drawn as
   * smooth curves. A single link road leaves it at a junction and enters the
   * city, where the first streets start. Free of charge; returns false if no
   * route works.
   */
  buildEntryRoad(): boolean {
    const hwy: RoadTypeDef = { ...getRoadType('intercity'), maxGrade: 1, minRadius: 0 };
    const anywhere: PlannerWorld = { ...this.plannerWorld, isCellUnlocked: () => true };
    const wet = (x: number, z: number) => this.world.grid.isWater(Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE));
    const terrain = { heightAt: this.world.heightAt, isWaterAt: wet };
    const lo = Math.min(...START_TILES.map(([x]) => x)) * TILE_CELLS * CELL_SIZE;
    const hi = (Math.max(...START_TILES.map(([x]) => x)) + 1) * TILE_CELLS * CELL_SIZE;
    const mid = (lo + hi) / 2;
    const M = WORLD_SIZE;
    // Keep the highway off the city's own land (and a margin around it).
    const margin = 40;
    const avoid = (p: P2) => (p.x > lo - margin && p.x < hi + margin && p.z > lo - margin && p.z < hi + margin ? 40 : 0);
    const GAP = 80;
    const options: { w: P2; alongX: boolean; into: P2 }[] = [];
    for (const shift of [0, -192, 192, -320, 320]) {
      options.push(
        { w: { x: mid + shift, z: lo - GAP }, alongX: true, into: { x: 0, z: 1 } },
        { w: { x: mid + shift, z: hi + GAP }, alongX: true, into: { x: 0, z: -1 } },
        { w: { x: lo - GAP, z: mid + shift }, alongX: false, into: { x: 1, z: 0 } },
        { w: { x: hi + GAP, z: mid + shift }, alongX: false, into: { x: -1, z: 0 } },
      );
    }
    for (const { w, alongX, into } of options) {
      if (wet(w.x, w.z)) continue;
      const starts: P2[] = [];
      for (let c = 8; c < M; c += 16) starts.push(alongX ? { x: 8, z: c } : { x: c, z: 8 });
      const first = findRoute(terrain, starts, (p) => Math.hypot(p.x - w.x, p.z - w.z) < 12, (p) => Math.hypot(p.x - w.x, p.z - w.z), hwy.maxGrade, avoid);
      const second = findRoute(terrain, [w], (p) => (alongX ? p.x : p.z) >= M - 16, (p) => M - (alongX ? p.x : p.z), hwy.maxGrade, avoid);
      if (!first || !second) continue;
      const route = [...first, ...second.slice(1)];
      // Run the ends right up to the map edge.
      const a = route[0];
      const b = route[route.length - 1];
      route[0] = alongX ? { x: 4, z: a.z } : { x: a.x, z: 4 };
      route[route.length - 1] = alongX ? { x: M - 4, z: b.z } : { x: b.x, z: M - 4 };
      const pieces = smoothPieces(relaxCorners(simplifyRoute(route, 14, 120), 60));
      const before = new Set(this.roads.edges.keys());
      const rollback = () => {
        for (const id of [...this.roads.edges.keys()]) if (!before.has(id)) this.roads.removeEdge(id);
      };
      let anchor: Anchor = { kind: 'free', point: pieces[0].a };
      let ok = true;
      for (const piece of pieces) {
        const plan = planRoad(this.roads, anchor, { kind: 'free', point: piece.b }, piece.c, hwy, anywhere, Infinity);
        if (!plan.valid) {
          ok = false;
          break;
        }
        const node = this.roads.nodes.get(commitRoad(this.roads, plan).endNode);
        if (!node) {
          ok = false;
          break;
        }
        anchor = { kind: 'node', nodeId: node.id, point: { x: node.x, z: node.z } };
      }
      const link = ok ? this.buildEntryLink(w, into, anywhere) : null;
      if (!link) {
        rollback();
        continue;
      }
      this.entries = [pieces[0].a, pieces[pieces.length - 1].b];
      this.entryLink = link;
      this.outsideCache = null;
      this.outsideEdges();
      return true;
    }
    return false;
  }

  /**
   * Junction on the highway near `w` and the city's single link road from it
   * into the owned land (direction `into`), preferably without a bridge;
   * returns the link road's end.
   */
  private buildEntryLink(w: P2, into: P2, world: PlannerWorld): P2 | null {
    const type = getRoadType('citylink');
    const hit = this.roads.nearestEdge(w.x, w.z, 48, true);
    if (!hit || hit.edge.typeId !== 'intercity') return null;
    for (const dry of [true, false]) {
      for (const reach of [176, 160, 192, 144, 208]) {
        const end = { x: hit.point.x + into.x * reach, z: hit.point.z + into.z * reach };
        const plan = planRoad(this.roads, { kind: 'edge', edgeId: hit.edge.id, t: hit.t, point: hit.point }, { kind: 'free', point: end }, null, type, world, Infinity);
        if (!plan.valid || (dry && plan.bridgeLength > 0)) continue;
        commitRoad(this.roads, plan);
        return end;
      }
    }
    return null;
  }

  /** Road edges that reach the outside world through the entry road (null: no entry road in this city). */
  outsideEdges(): Set<number> | null {
    if (this.entries.length === 0) return null;
    if (this.outsideCache) return this.outsideCache;
    const reach = new Set<number>();
    const outside: Attach[] = [];
    this.traffic.outside = outside;
    for (const entry of this.entries) {
      const start = this.roads.nearestNode(entry.x, entry.z, 6);
      if (!start) continue;
      const byNode = new Map<number, RoadEdge[]>();
      for (const e of this.roads.edges.values()) {
        for (const n of [e.a, e.b]) {
          let l = byNode.get(n);
          if (!l) byNode.set(n, (l = []));
          l.push(e);
        }
      }
      const seen = new Set<number>([start.id]);
      const stack = [start.id];
      while (stack.length) {
        const n = stack.pop()!;
        for (const e of byNode.get(n) ?? []) {
          reach.add(e.id);
          if (n === start.id && !outside.some((o) => o.edge === e.id)) outside.push({ edge: e.id, s: e.a === n ? 0 : 1 });
          const o = e.a === n ? e.b : e.a;
          if (!seen.has(o)) {
            seen.add(o);
            stack.push(o);
          }
        }
      }
    }
    this.outsideCache = reach;
    return reach;
  }

  /** Whether the road in front of a footprint reaches the city entry (always true in cities without one). */
  reachesOutside(i: number, j: number, w: number, d: number, rot: Rotation): boolean {
    const reach = this.outsideEdges();
    if (!reach) return true;
    for (const depth of [1, 2]) {
      const cells = frontCells(i, j, w, d, rot, depth);
      let x = 0;
      let z = 0;
      for (const [ci, cj] of cells) {
        x += (ci + 0.5) * CELL_SIZE;
        z += (cj + 0.5) * CELL_SIZE;
      }
      const hit = this.roads.nearestEdge(x / cells.length, z / cells.length, ATTACH_RADIUS, true, (e) => !this.roads.isElevated(e));
      if (hit) return reach.has(hit.edge.id);
    }
    return false;
  }

  isConnectedToOutside(b: PlacedBuilding): boolean {
    return this.reachesOutside(b.i, b.j, b.w, b.d, b.rot);
  }

  // ---------------------------------------------------------------- zoning

  /** Can this cell be zoned right now? */
  canZone(k: number): boolean {
    const i = k % GRID_CELLS;
    const j = Math.floor(k / GRID_CELLS);
    if (this.zones.zoneable[k] === 0 || this.occupancy.road[k] > 0) return false;
    if (!this.world.isCellUnlocked(i, j) || !this.world.grid.isBuildable(i, j)) return false;
    const bid = this.occupancy.building[k];
    if (bid && !this.buildings.items.get(bid)?.zone) return false; // player-placed building
    return true;
  }

  /**
   * Zones (or with ZoneType.None, un-zones) cells. Growable buildings of a
   * different zone standing on changed cells are bulldozed (no refund — they
   * were privately built). Returns the number of cells changed.
   */
  /**
   * Zones cells; with a style, also paints the district's architecture
   * (re-zoning cells to their current zone only changes the style, and
   * buildings already standing there take the new style).
   */
  setZone(cells: Iterable<number>, type: ZoneType, style?: ArchStyle, rules?: DistrictRules): number {
    if (!this.recording) return this.applyZone(cells, type, style, rules);
    const list = [...cells];
    const snap = (k: number): CellZoning => ({ k, zone: this.zones.zone[k], style: this.districtStyle[k], wealth: this.districtWealth[k], height: this.districtHeight[k] });
    const before = list.map(snap);
    const n = this.applyZone(list, type, style, rules);
    const changed = before.filter((b) => {
      const a = snap(b.k);
      return a.zone !== b.zone || a.style !== b.style || a.wealth !== b.wealth || a.height !== b.height;
    });
    if (changed.length) {
      const label = type === ZoneType.None ? 'Bölge kaldırma' : `${getZone(type).name} bölgeleme`;
      this.undo.push({ kind: 'zone', label, before: changed, after: changed.map((b) => snap(b.k)) });
    }
    return n;
  }

  /** Puts cells back to recorded zoning (undo / redo of a zoning stroke). */
  private restoreZoning(cells: CellZoning[]): void {
    const byZone = new Map<number, number[]>();
    for (const c of cells) {
      const list = byZone.get(c.zone) ?? [];
      list.push(c.k);
      byZone.set(c.zone, list);
      this.districtWealth[c.k] = c.wealth;
      this.districtHeight[c.k] = c.height;
    }
    for (const [zone, list] of byZone) this.applyZone(list, zone as ZoneType);
    const byStyle = new Map<number, number[]>();
    for (const c of cells) {
      const list = byStyle.get(c.style) ?? [];
      list.push(c.k);
      byStyle.set(c.style, list);
    }
    for (const [s, list] of byStyle) this.paintStyle(list, archStyleAt(s));
  }

  private applyZone(cells: Iterable<number>, type: ZoneType, style?: ArchStyle, rules?: DistrictRules): number {
    const valid: number[] = [];
    const restyle: number[] = [];
    const bulldoze = new Set<number>();
    const sIdx = style && type !== ZoneType.None ? archStyleIndex(style) : -1;
    for (const k of cells) {
      if (type !== ZoneType.None && !this.canZone(k)) continue;
      if (this.zones.zone[k] === type) {
        if ((sIdx >= 0 && this.districtStyle[k] !== sIdx) || this.rulesDiffer(k, rules)) restyle.push(k);
        continue;
      }
      const bid = this.occupancy.building[k];
      const b = bid ? this.buildings.items.get(bid) : undefined;
      if (b && !b.zone) continue; // never touch player buildings
      if (b && b.zone !== type) bulldoze.add(b.id);
      valid.push(k);
    }
    for (const id of bulldoze) this.removeGrowable(id);
    const changed = this.zones.set(valid, type, (k) => this.isCellFree(k)).length;
    if (sIdx >= 0) this.paintStyle([...valid, ...restyle], style!);
    if (rules && type !== ZoneType.None) {
      for (const k of [...valid, ...restyle]) {
        if (rules.wealth !== undefined) this.districtWealth[k] = rules.wealth;
        if (rules.height !== undefined) this.districtHeight[k] = rules.height;
      }
      if (sIdx < 0) this.zones.touch(restyle);
    }
    return changed + restyle.length;
  }

  private rulesDiffer(k: number, rules?: DistrictRules): boolean {
    if (!rules) return false;
    return (rules.wealth !== undefined && this.districtWealth[k] !== rules.wealth) || (rules.height !== undefined && this.districtHeight[k] !== rules.height);
  }

  /**
   * Older saves grew offices in commercial zones; offices now have their own
   * zone. Buildings whose template moved take their template's zone (and so
   * does their lot).
   */
  migrateGrowableZones(): void {
    for (const b of this.buildings.items.values()) {
      if (!b.zone) continue;
      const def = getBuilding(b.defId);
      if (def.zone && def.zone !== b.zone) {
        b.zone = def.zone;
        this.zones.set(b.cells, def.zone, () => false);
      }
    }
  }

  /** District rules (wealth, height limit) of the cell at (i, j). */
  rulesAt(i: number, j: number): DistrictRules {
    const k = j * GRID_CELLS + i;
    return { wealth: this.districtWealth[k], height: this.districtHeight[k] };
  }

  /** Sets the district style of cells and restyles the growables standing on them. */
  paintStyle(cells: number[], style: ArchStyle): void {
    const sIdx = archStyleIndex(style);
    const touched = new Set<number>();
    for (const k of cells) {
      this.districtStyle[k] = sIdx;
      const bid = this.occupancy.building[k];
      if (bid) touched.add(bid);
    }
    for (const id of touched) {
      const b = this.buildings.items.get(id);
      if (b && b.zone && (b.style ?? 'modern') !== style) this.buildings.replace(id, { style });
    }
    this.zones.touch(cells);
  }

  /** Style most of a lot's cells are painted with. */
  styleOfLot(i: number, j: number, w: number, d: number): ArchStyle {
    const count = new Map<number, number>();
    for (let y = j; y < j + d; y++) for (let x = i; x < i + w; x++) {
      const s = this.districtStyle[y * GRID_CELLS + x];
      count.set(s, (count.get(s) ?? 0) + 1);
    }
    let best = 0;
    let n = -1;
    for (const [s, c] of count) if (c > n) [best, n] = [s, c];
    return archStyleAt(best);
  }

  // ---------------------------------------------------------------- growables

  spawnGrowable(lot: Lot, tick: number, tint: number): PlacedBuilding {
    const b = this.buildings.create({
      defId: lot.def.id,
      i: lot.i,
      j: lot.j,
      rot: lot.rot,
      w: lot.w,
      d: lot.d,
      baseY: lot.baseY,
      minY: lot.minY,
      cost: 0,
      zone: lot.def.zone!,
      level: lot.def.level ?? 1,
      state: 'construction',
      tint,
      sinceTick: tick,
      style: this.styleOfLot(lot.i, lot.j, lot.w, lot.d),
    });
    this.occupancy.setBuilding(b.id, b.cells);
    for (const k of b.cells) this.zones.refresh(k, false);
    this.clearVegetationRect(b.i, b.j, b.w, b.d);
    return b;
  }

  /** Restores saved buildings (save system): occupancy, zoning index and cleared trees follow. */
  restoreBuildings(items: Parameters<BuildingRegistry['restore']>[0], nextId: number): void {
    const added = this.buildings.restore(items, nextId);
    for (const b of added) {
      this.occupancy.setBuilding(b.id, b.cells);
      this.clearVegetationRect(b.i, b.j, b.w, b.d);
    }
  }

  removeGrowable(id: number): void {
    const b = this.buildings.items.get(id);
    if (!b || !b.zone) return;
    this.population.evict(id);
    this.occupancy.clearBuilding(id, b.cells);
    this.buildings.remove(id);
    for (const k of b.cells) this.zones.refresh(k, this.isCellFree(k));
  }

  // ---------------------------------------------------------------- sandbox

  enableSandbox(): void {
    if (this.sandbox) return;
    this.sandbox = true;
    this.treasury.setUnlimited();
    for (let z = 0; z < TILES_PER_SIDE; z++) for (let x = 0; x < TILES_PER_SIDE; x++) this.world.unlock.unlockTile(x, z);
  }

  /** Population level used for unlock checks (everything in sandbox mode). */
  get unlockLevel(): number {
    return this.sandbox ? Infinity : this.maxPopulation;
  }

  // ---------------------------------------------------------------- player buildings

  planBuilding(defId: string, i: number, j: number, rot: Rotation): BuildingPlan {
    const def = getBuilding(defId);
    const plan = planBuilding(def, i, j, rot, this.placementWorld, this.treasury.balance, this.buildings.countOf(defId));
    if (def.zone) {
      // Hand-placed growable: the developer's price, and its zone must be open.
      plan.cost = growablePrice(def);
      plan.errors = plan.errors.filter((e) => e !== 'Yetersiz bütçe');
      if (!this.treasury.canAfford(plan.cost)) plan.errors.push('Yetersiz bütçe');
      const zoneDef = getZone(def.zone as ZoneKind);
      if (zoneDef.unlockPopulation > this.unlockLevel) plan.errors.unshift(`Kilitli: ${zoneDef.name} ${zoneDef.unlockPopulation.toLocaleString('tr-TR')} nüfusta açılır`);
      plan.valid = plan.errors.length === 0;
    }
    if (def.unlockPopulation > this.unlockLevel) {
      plan.errors.unshift(`Kilitli: ${def.unlockPopulation.toLocaleString('tr-TR')} nüfusta açılır`);
      plan.valid = false;
    }
    return plan;
  }

  /**
   * Places a zoned (growable) building by hand: the player pays the developer
   * price, the lot is zoned to match, and from then on the building lives like
   * any growable (construction, residents or jobs, levelling up).
   */
  placeGrowable(plan: BuildingPlan, style: ArchStyle, tint: number, tick: number): PlacedBuilding | null {
    const def = getBuilding(plan.defId);
    if (!def.zone) return null;
    const fresh = this.planBuilding(plan.defId, plan.i, plan.j, plan.rot);
    if (!fresh.valid || !this.treasury.spend(fresh.cost, 'buildings')) return null;
    const b = this.buildings.create({
      defId: def.id,
      i: fresh.i,
      j: fresh.j,
      rot: fresh.rot,
      w: fresh.w,
      d: fresh.d,
      baseY: fresh.baseY,
      minY: fresh.minY,
      cost: fresh.cost,
      zone: def.zone,
      level: def.level ?? 1,
      state: 'construction',
      tint,
      sinceTick: tick,
      style,
    });
    this.zones.set(b.cells, def.zone, () => false);
    for (const k of b.cells) this.districtStyle[k] = archStyleIndex(style);
    this.occupancy.setBuilding(b.id, b.cells);
    for (const k of b.cells) this.zones.refresh(k, false);
    this.clearVegetationRect(b.i, b.j, b.w, b.d);
    if (this.recording) this.undo.push({ kind: 'place', id: b.id, defId: def.id, at: spotOf(b), cost: b.cost, style, tint });
    return b;
  }

  placeBuilding(plan: BuildingPlan): PlacedBuilding | null {
    const fresh = this.planBuilding(plan.defId, plan.i, plan.j, plan.rot);
    if (!fresh.valid) return null;
    const group = getBuilding(plan.defId).group ?? 'landmark';
    if (!this.treasury.spend(fresh.cost, group === 'landmark' ? 'buildings' : 'infra')) return null;
    const b = this.buildings.add(fresh);
    this.occupancy.setBuilding(b.id, b.cells);
    // A player building replaces any zoning under it.
    this.zones.set(b.cells, ZoneType.None, () => false);
    this.clearVegetationRect(b.i, b.j, b.w, b.d);
    if (this.recording) this.undo.push({ kind: 'place', id: b.id, defId: b.defId, at: spotOf(b), cost: b.cost, tint: b.tint });
    return b;
  }

  buildingRefund(id: number): number {
    const b = this.buildings.items.get(id);
    return b ? Math.round(b.cost * DEMOLISH_REFUND) : 0;
  }

  /** Bulldozes any building; player buildings refund 50%, growables refund nothing. */
  demolishBuilding(id: number): number {
    const b = this.buildings.items.get(id);
    if (!b) return 0;
    if (b.zone) {
      // Hand-placed growables refund half their price; grown ones nothing.
      const refund = this.buildingRefund(id);
      this.removeGrowable(id);
      if (refund > 0) this.treasury.refund(refund, 'buildings');
      return refund;
    }
    const refund = this.buildingRefund(id);
    this.buildings.remove(id);
    this.occupancy.clearBuilding(id, b.cells);
    this.treasury.refund(refund, ledgerOf(b.defId));
    if (this.recording) this.undo.push({ kind: 'demolish', id, defId: b.defId, at: spotOf(b), cost: b.cost, refund });
    return refund;
  }

  // ---------------------------------------------------------------- moving

  /** Can player building `id` stand at (i, j, rot)? Its own cells count as free. Moving is free. */
  planMove(id: number, i: number, j: number, rot: Rotation): BuildingPlan | null {
    const b = this.buildings.items.get(id);
    if (!b || b.zone) return null;
    this.occupancy.clearBuilding(id, b.cells);
    const plan = planBuilding(getBuilding(b.defId), i, j, rot, this.placementWorld, Infinity, 0);
    this.occupancy.setBuilding(id, b.cells);
    plan.cost = 0;
    plan.errors = plan.errors.filter((e) => e !== 'Yetersiz bütçe' && !e.startsWith('Bu binadan'));
    plan.valid = plan.errors.length === 0;
    return plan;
  }

  /** Moves a hand-placed (non-zoned) building. Returns the building at its new spot. */
  moveBuilding(id: number, i: number, j: number, rot: Rotation): PlacedBuilding | null {
    const b = this.buildings.items.get(id);
    const plan = this.planMove(id, i, j, rot);
    if (!b || !plan?.valid) return null;
    const from = spotOf(b);
    this.buildings.remove(id);
    this.occupancy.clearBuilding(id, b.cells);
    const moved = this.buildings.add({ ...plan, cost: b.cost });
    this.occupancy.setBuilding(moved.id, moved.cells);
    this.zones.set(moved.cells, ZoneType.None, () => false);
    this.clearVegetationRect(moved.i, moved.j, moved.w, moved.d);
    if (this.recording) this.undo.push({ kind: 'move', id: moved.id, defId: b.defId, from, to: spotOf(moved) });
    return moved;
  }

  // ---------------------------------------------------------------- undo / redo

  /** Undoes the last building action. Returns a player-facing error, or null on success. */
  undoLast(): string | null {
    const e = this.undo.peekUndo();
    if (!e) return 'Geri alınacak işlem yok';
    const err = this.replay(e, 'undo');
    if (err) this.undo.dropUndo();
    else this.undo.markUndone();
    return err;
  }

  redoLast(): string | null {
    const e = this.undo.peekRedo();
    if (!e) return 'Yinelenecek işlem yok';
    const err = this.replay(e, 'redo');
    if (err) this.undo.dropRedo();
    else this.undo.markRedone();
    return err;
  }

  /** Applies a treasury change again (redo) or reverses it (undo); false if it cannot be paid. */
  private settle(net: number, dir: 'undo' | 'redo', ledger: 'roads' | 'infra'): boolean {
    const delta = dir === 'undo' ? -net : net;
    if (delta < 0) return this.treasury.spend(-delta, ledger);
    if (delta > 0) this.treasury.refund(delta, ledger);
    return true;
  }

  private replay(e: UndoEntry, dir: 'undo' | 'redo'): string | null {
    this.recording = false;
    try {
      if (e.kind === 'roads') {
        const target = dir === 'undo' ? e.before : e.after;
        // Roads that come back must not run through buildings put up since.
        for (const curve of this.roads.missingEdges(target)) {
          for (const p of sampleBezier(curve, 4).points) {
            const i = Math.floor(p.x / CELL_SIZE);
            const j = Math.floor(p.z / CELL_SIZE);
            if (i >= 0 && j >= 0 && i < GRID_CELLS && j < GRID_CELLS && this.occupancy.building[j * GRID_CELLS + i] !== 0) return 'Yolun yerinde artık bir bina var';
          }
        }
        if (!this.treasury.canAfford(Math.max(0, dir === 'undo' ? e.net : -e.net))) return 'Yetersiz bütçe';
        this.settle(e.net, dir, 'roads');
        this.roads.applySnapshot(target);
        return null;
      }
      if (e.kind === 'zone') {
        this.restoreZoning(dir === 'undo' ? e.before : e.after);
        return null;
      }
      if (e.kind === 'line') {
        const lines = this.linesOf(e.lineKind);
        const add = (e.op === 'add') === (dir === 'redo');
        if (!this.treasury.canAfford(Math.max(0, dir === 'undo' ? e.net : -e.net))) return 'Yetersiz bütçe';
        if (add) {
          if (lines.lines.has(e.line.id)) return 'Hat zaten var';
          lines.add(e.line.a, e.line.b, e.line.cost, e.line.id);
        } else if (!lines.remove(e.line.id)) return 'Hat artık yok';
        this.settle(e.net, dir, 'infra');
        return null;
      }
      if (e.kind === 'move') {
        const to = dir === 'undo' ? e.from : e.to;
        const moved = this.buildings.items.has(e.id) ? this.moveBuilding(e.id, to.i, to.j, to.rot) : null;
        if (!moved) return 'Bina eski yerine sığmıyor';
        e.id = moved.id;
        return null;
      }
      const remove = (e.kind === 'place') === (dir === 'undo');
      if (remove) {
        const b = this.buildings.items.get(e.id);
        if (!b) return 'Bina artık yok';
        if (e.kind === 'place') {
          // Undoing a placement gives the whole price back.
          if (b.zone) this.removeGrowable(e.id);
          else {
            this.buildings.remove(e.id);
            this.occupancy.clearBuilding(e.id, b.cells);
          }
          this.treasury.refund(e.cost, ledgerOf(e.defId));
        } else this.demolishBuilding(e.id);
        return null;
      }
      // Rebuild: a placement pays its price again, an undone demolition pays back the refund.
      const price = e.kind === 'place' ? e.cost : e.refund;
      const plan = this.planBuilding(e.defId, e.at.i, e.at.j, e.at.rot);
      const blocking = plan.errors.filter((x) => x !== 'Yetersiz bütçe' && !x.startsWith('Kilitli'));
      if (blocking.length > 0) return blocking[0];
      if (!this.treasury.canAfford(price)) return 'Yetersiz bütçe';
      let b: PlacedBuilding | null;
      if (e.kind === 'place' && e.style) {
        b = this.placeGrowable(plan, e.style, e.tint, 0);
      } else {
        this.treasury.spend(price, ledgerOf(e.defId));
        b = this.buildings.add({ ...plan, cost: e.cost });
        this.occupancy.setBuilding(b.id, b.cells);
        this.zones.set(b.cells, ZoneType.None, () => false);
        this.clearVegetationRect(b.i, b.j, b.w, b.d);
      }
      if (!b) return 'Bina yeniden kurulamadı';
      e.id = b.id;
      return null;
    } finally {
      this.recording = true;
    }
  }

  stats() {
    const r = this.roads.stats();
    return {
      ...r,
      buildings: this.buildings.items.size,
      spentRoads: this.treasury.spent.roads,
      spentBuildings: this.treasury.spent.buildings,
      spentInfra: this.treasury.spent.infra,
      powerLineLength: this.powerLines.totalLength(),
      pipeLength: this.pipes.totalLength(),
    };
  }
}

const spotOf = (b: PlacedBuilding): Spot => ({ i: b.i, j: b.j, rot: b.rot });
const ledgerOf = (defId: string) => ((getBuilding(defId).group ?? 'landmark') === 'landmark' ? 'buildings' : 'infra') as 'buildings' | 'infra';
