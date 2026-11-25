import type { ArchStyle } from '../../data/styles';
import type { ZoneType } from '../../data/zones';
import type { BuildingPlan, Rotation } from './BuildingPlacement';
import { footprintCells } from './BuildingPlacement';

export type BuildingState = 'construction' | 'active' | 'abandoned' | 'burning';

export interface PlacedBuilding {
  id: number;
  defId: string;
  i: number;
  j: number;
  rot: Rotation;
  w: number;
  d: number;
  baseY: number;
  minY: number;
  cost: number;
  cells: number[];
  /** 0 for player-placed (plop) buildings. */
  zone: ZoneType;
  level: number;
  state: BuildingState;
  /** Construction progress 0..1 (1 when active). */
  progress: number;
  /** Residents living here (homes) or workers employed (workplaces). */
  occupants: number;
  /** Per-instance colour variation 0..1. */
  tint: number;
  /** Simulation tick the building was founded / last changed level. */
  sinceTick: number;
  /** Consecutive ticks without road access. */
  noAccessTicks: number;
  /** Ticks spent abandoned. */
  abandonedTicks: number;
  /** Consecutive ticks without electricity or water. */
  noUtilityTicks: number;
  /** Ticks the current fire has been burning. */
  burnTicks: number;
  /** Architectural style of a growable (absent: modern). */
  style?: ArchStyle;
  /**
   * Drawn this far (m) from its cells, towards the road in front, so the lot
   * meets the kerb without a strip of grass. Visual only; cells stay put.
   */
  ox?: number;
  oz?: number;
  /** Extra turn (radians) so the front faces an angled or curved road. Visual only. */
  oyaw?: number;
  /** How the building sits on sloping ground (visual only): tilt with the slope (gentle, low-rise) or set into it. */
  seat?: GroundSeat;
  /**
   * Placed off the grid along a road (turned to it at any angle): the cells it
   * covers. Its drawn offset (ox, oz, oyaw) is fixed, not snapped.
   */
  free?: number[];
}

/** Visual seating on the terrain: drawn base height, and the ground slope (dh/dx, dh/dz) to tilt with, if any. */
export interface GroundSeat {
  y: number;
  gx: number;
  gz: number;
}

export interface BuildingChange {
  added: PlacedBuilding[];
  removed: PlacedBuilding[];
}

export interface NewBuilding {
  defId: string;
  i: number;
  j: number;
  rot: Rotation;
  w: number;
  d: number;
  baseY: number;
  minY: number;
  cost: number;
  zone: ZoneType;
  level: number;
  state: BuildingState;
  tint: number;
  sinceTick: number;
  style?: ArchStyle;
  /** Off-grid placement: covered cells and the fixed drawn offset. */
  free?: number[];
  ox?: number;
  oz?: number;
  oyaw?: number;
}

/**
 * All buildings (data only; rendering subscribes to changes). Visual changes
 * (level, state, model) are reported as remove+add of the same id.
 */
export class BuildingRegistry {
  readonly items = new Map<number, PlacedBuilding>();
  private nextId = 1;
  private listeners = new Set<(c: BuildingChange) => void>();
  /** Where a new building is drawn relative to its cells (set by the city: towards the road). */
  snapper: ((i: number, j: number, w: number, d: number, rot: Rotation) => { x: number; z: number; yaw?: number } | null) | null = null;
  /** How a new building sits on the ground (set by the city from the terrain). */
  seater: ((defId: string, i: number, j: number, w: number, d: number) => GroundSeat | null) | null = null;

  private snap<T extends { defId: string; i: number; j: number; w: number; d: number; rot: Rotation }>(b: T): T & { ox?: number; oz?: number; oyaw?: number; seat?: GroundSeat } {
    if ((b as { free?: number[] }).free) {
      // Off the grid: drawn where it was placed, upright.
      const kept = { ...b } as T & { ox?: number; oz?: number; oyaw?: number; seat?: GroundSeat };
      delete kept.seat;
      kept.ox = kept.ox || 0;
      kept.oz = kept.oz || 0;
      return kept;
    }
    const s = this.snapper?.(b.i, b.j, b.w, b.d, b.rot);
    const out = { ...b } as T & { ox?: number; oz?: number; oyaw?: number; seat?: GroundSeat };
    delete out.ox;
    delete out.oz;
    delete out.oyaw;
    delete out.seat;
    const seat = this.seater?.(b.defId, b.i, b.j, b.w, b.d);
    if (seat) out.seat = seat;
    // Always written (0 when not moved): a save keeps how each building was drawn.
    out.ox = s?.x || 0;
    out.oz = s?.z || 0;
    if (s?.yaw) out.oyaw = s.yaw;
    return out;
  }

  /** Snaps a placed building again (its surroundings changed). */
  resnap(id: number): void {
    const b = this.items.get(id);
    if (!b || b.free) return;
    const before = { ...b };
    const s = this.snap(b);
    delete b.oyaw;
    Object.assign(b, { ox: s.ox, oz: s.oz, ...(s.oyaw ? { oyaw: s.oyaw } : {}) });
    if (before.ox === b.ox && before.oz === b.oz && before.oyaw === b.oyaw) return;
    this.emit({ added: [b], removed: [before] });
  }

  /** Adds a player-placed building from a validated plan. */
  add(plan: BuildingPlan): PlacedBuilding {
    return this.create({
      defId: plan.defId,
      i: plan.i,
      j: plan.j,
      rot: plan.rot,
      w: plan.w,
      d: plan.d,
      baseY: plan.baseY,
      minY: plan.minY,
      cost: plan.cost,
      zone: 0,
      level: 1,
      state: 'active',
      tint: 0,
      sinceTick: 0,
      ...(plan.free ? { free: plan.free.cells, ox: plan.free.ox, oz: plan.free.oz, ...(plan.free.oyaw ? { oyaw: plan.free.oyaw } : {}) } : {}),
    });
  }

  create(n: NewBuilding): PlacedBuilding {
    const b: PlacedBuilding = {
      ...this.snap(n),
      id: this.nextId++,
      cells: n.free ? [...n.free] : footprintCells(n.i, n.j, n.w, n.d),
      progress: n.state === 'construction' ? 0 : 1,
      occupants: 0,
      noAccessTicks: 0,
      abandonedTicks: 0,
      noUtilityTicks: 0,
      burnTicks: 0,
    };
    this.items.set(b.id, b);
    this.emit({ added: [b], removed: [] });
    return b;
  }

  /** Applies a change that alters how the building looks (state, level, model). */
  replace(id: number, patch: Partial<Pick<PlacedBuilding, 'defId' | 'level' | 'state' | 'progress' | 'sinceTick' | 'style'>>): void {
    const b = this.items.get(id);
    if (!b) return;
    const before = { ...b };
    Object.assign(b, patch);
    // A new template (level up) may be taller: re-seat it on the ground.
    if (patch.defId && this.seater) {
      const seat = this.seater(b.defId, b.i, b.j, b.w, b.d);
      if (seat) b.seat = seat;
      else delete b.seat;
    }
    this.emit({ added: [b], removed: [before] });
  }

  remove(id: number): PlacedBuilding | null {
    const b = this.items.get(id);
    if (!b) return null;
    this.items.delete(id);
    this.emit({ added: [], removed: [b] });
    return b;
  }

  /** Next id that will be assigned (saved so ids stay stable across loads). */
  get nextIdValue(): number {
    return this.nextId;
  }

  /** Restores saved buildings (keeping their ids) in one change notification. */
  restore(items: Omit<PlacedBuilding, 'cells'>[], nextId: number): PlacedBuilding[] {
    const added: PlacedBuilding[] = [];
    for (const it of items) {
      // Saved snap offsets are kept as they were (older saves without them are snapped now).
      const snapped = this.snap(it);
      if (typeof it.ox === 'number' && typeof it.oz === 'number') {
        snapped.ox = it.ox;
        snapped.oz = it.oz;
        if (it.oyaw) snapped.oyaw = it.oyaw;
        else delete snapped.oyaw;
      }
      const b: PlacedBuilding = { ...snapped, cells: it.free ? [...it.free] : footprintCells(it.i, it.j, it.w, it.d) };
      this.items.set(b.id, b);
      this.nextId = Math.max(this.nextId, b.id + 1);
      added.push(b);
    }
    this.nextId = Math.max(this.nextId, nextId);
    if (added.length) this.emit({ added, removed: [] });
    return added;
  }

  countOf(defId: string): number {
    let n = 0;
    for (const b of this.items.values()) if (b.defId === defId) n++;
    return n;
  }

  onChange(fn: (c: BuildingChange) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(c: BuildingChange): void {
    this.listeners.forEach((l) => l(c));
  }
}
