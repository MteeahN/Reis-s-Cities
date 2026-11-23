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
}

/**
 * All buildings (data only; rendering subscribes to changes). Visual changes
 * (level, state, model) are reported as remove+add of the same id.
 */
export class BuildingRegistry {
  readonly items = new Map<number, PlacedBuilding>();
  private nextId = 1;
  private listeners = new Set<(c: BuildingChange) => void>();

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
    });
  }

  create(n: NewBuilding): PlacedBuilding {
    const b: PlacedBuilding = {
      ...n,
      id: this.nextId++,
      cells: footprintCells(n.i, n.j, n.w, n.d),
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
      const b: PlacedBuilding = { ...it, cells: footprintCells(it.i, it.j, it.w, it.d) };
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
