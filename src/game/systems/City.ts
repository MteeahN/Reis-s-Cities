import { CELL_SIZE, GRID_CELLS, WORLD_SIZE, TILES_PER_SIDE } from '../core/config';
import { LINE_TYPES, type LineKind } from '../data/infrastructure';
import { UtilityLines } from '../entities/infra/UtilityLines';
import type { P2 } from '../entities/road/curve';
import { ServiceCoverage } from '../simulation/Services';
import { computeUtilities, type UtilityResult } from '../simulation/Utilities';
import { getBuilding } from '../data/buildings';
import { getRoadType, type RoadTypeDef } from '../data/roads';
import { ZoneType } from '../data/zones';
import { planBuilding, type BuildingPlan, type PlacementWorld, type Rotation } from '../entities/building/BuildingPlacement';
import { BuildingRegistry, type PlacedBuilding } from '../entities/building/BuildingRegistry';
import { RoadGraph, type RoadEdge } from '../entities/road/RoadGraph';
import { LandValueMap, waterProximity } from '../simulation/LandValue';
import type { Lot, LotWorld } from '../simulation/LotFinder';
import { Population } from '../simulation/Population';
import { TrafficModel } from '../simulation/traffic/TrafficModel';
import { commitRoad, planUpgrade, type PlannerWorld, type RoadPlan, type UpgradePlan } from '../tools/placement/RoadPlanner';
import { Occupancy } from '../world/Occupancy';
import type { World } from '../world/World';
import { ZoneMap } from '../world/ZoneMap';
import { Economy } from './Economy';
import { Treasury } from './Treasury';

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
    };

    this.roads.onChange((c) => {
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
        if (type.zoneable) this.zones.addEdge(id, e.poly.points, type.width);
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
    this.linesOf(plan.kind).add(fresh.a, fresh.b, fresh.cost);
    return true;
  }

  lineRefund(kind: LineKind, id: number): number {
    const l = this.linesOf(kind).lines.get(id);
    return l ? Math.round(l.cost * DEMOLISH_REFUND) : 0;
  }

  demolishLine(kind: LineKind, id: number): number {
    const refund = this.lineRefund(kind, id);
    if (!this.linesOf(kind).remove(id)) return 0;
    this.treasury.refund(refund, 'infra');
    return refund;
  }

  // ---------------------------------------------------------------- roads

  /** Builds a validated plan; returns the end node id (for chaining) or null. */
  buildRoad(plan: RoadPlan): number | null {
    if (!plan.valid || !this.treasury.canAfford(plan.cost)) return null;
    this.treasury.spend(plan.cost, 'roads');
    return commitRoad(this.roads, plan).endNode;
  }

  planUpgrade(edgeId: number, type: RoadTypeDef): UpgradePlan | null {
    const e = this.roads.edges.get(edgeId);
    return e ? planUpgrade(this.roads, e, type, this.plannerWorld, this.treasury.balance) : null;
  }

  upgradeRoad(plan: UpgradePlan): boolean {
    if (!plan.valid || !this.roads.edges.has(plan.edgeId)) return false;
    if (!this.treasury.spend(plan.netCost, 'roads')) return false;
    const e = this.roads.edges.get(plan.edgeId)!;
    this.roads.setEdgeType(plan.edgeId, plan.toTypeId, plan.cost - e.cost);
    return true;
  }

  roadRefund(edgeId: number): number {
    const e = this.roads.edges.get(edgeId);
    return e ? Math.round(e.cost * DEMOLISH_REFUND) : 0;
  }

  demolishRoad(edgeId: number): number {
    const refund = this.roadRefund(edgeId);
    if (!this.roads.edges.has(edgeId)) return 0;
    this.roads.removeEdge(edgeId);
    this.treasury.refund(refund, 'roads');
    return refund;
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
  setZone(cells: Iterable<number>, type: ZoneType): number {
    const valid: number[] = [];
    const bulldoze = new Set<number>();
    for (const k of cells) {
      if (type !== ZoneType.None && !this.canZone(k)) continue;
      if (this.zones.zone[k] === type) continue;
      const bid = this.occupancy.building[k];
      const b = bid ? this.buildings.items.get(bid) : undefined;
      if (b && !b.zone) continue; // never touch player buildings
      if (b && b.zone !== type) bulldoze.add(b.id);
      valid.push(k);
    }
    for (const id of bulldoze) this.removeGrowable(id);
    return this.zones.set(valid, type, (k) => this.isCellFree(k)).length;
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
    if (def.unlockPopulation > this.unlockLevel) {
      plan.errors.unshift(`Kilitli: ${def.unlockPopulation.toLocaleString('tr-TR')} nüfusta açılır`);
      plan.valid = false;
    }
    return plan;
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
      this.removeGrowable(id);
      return 0;
    }
    const refund = this.buildingRefund(id);
    this.buildings.remove(id);
    this.occupancy.clearBuilding(id, b.cells);
    this.treasury.refund(refund, (getBuilding(b.defId).group ?? 'landmark') === 'landmark' ? 'buildings' : 'infra');
    return refund;
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
