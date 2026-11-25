import type { Rotation, FreeSpot } from '../entities/building/BuildingPlacement';
import type { ArchStyle } from '../data/styles';
import type { RoadGraphData } from '../entities/road/RoadGraph';
import type { LineKind } from '../data/infrastructure';
import type { TransitData } from '../simulation/Transit';

/** A decoration standing in the city. */
export interface PlacedProp {
  id: number;
  defId: string;
  x: number;
  z: number;
  /** Rotation (radians). */
  rot: number;
}

/** Where a player building stands. */
export interface Spot {
  i: number;
  j: number;
  rot: Rotation;
  /** Set for a building placed off the grid along a road. */
  free?: FreeSpot;
}

/** Zone and district rules of one cell before / after a zoning stroke. */
export interface CellZoning {
  k: number;
  zone: number;
  style: number;
  wealth: number;
  height: number;
}

/** A power line or pipe segment as built. */
export interface LineRecord {
  id: number;
  a: { x: number; z: number };
  b: { x: number; z: number };
  cost: number;
}

/**
 * One undoable player action: hand-placed buildings (placing, bulldozing,
 * moving — `id` is the building's current id and is rewritten whenever
 * undo/redo recreates it), road network edits (building, upgrading,
 * demolishing, one-way, junction controls, roundabouts — the network before
 * and after), zoning strokes and utility lines. `net` is the treasury
 * change the action caused; undo reverses it, redo applies it again.
 */
export type UndoEntry =
  | { kind: 'place'; id: number; defId: string; at: Spot; cost: number; style?: ArchStyle; tint: number }
  | { kind: 'demolish'; id: number; defId: string; at: Spot; cost: number; refund: number }
  | { kind: 'move'; id: number; defId: string; from: Spot; to: Spot }
  | { kind: 'roads'; label: string; before: RoadGraphData; after: RoadGraphData; net: number }
  | { kind: 'zone'; label: string; before: CellZoning[]; after: CellZoning[] }
  | { kind: 'line'; label: string; lineKind: LineKind; op: 'add' | 'remove'; line: LineRecord; net: number }
  | { kind: 'terrain'; label: string; vertices: number[]; before: number[]; after: number[]; net: number }
  | { kind: 'paint'; label: string; texels: number[]; before: number[]; after: number[]; net: number }
  | { kind: 'prop'; label: string; op: 'place' | 'remove'; prop: PlacedProp; net: number }
  | { kind: 'transit'; label: string; before: TransitData; after: TransitData; net: number }
  | { kind: 'upgrade'; label: string; id: number; from: { defId: string; level: number }; to: { defId: string; level: number }; net: number };

export const UNDO_LIMIT = 50;

/** Undo / redo stacks. The city applies the entries; this only keeps them. */
export class UndoHistory {
  private readonly done: UndoEntry[] = [];
  private readonly undone: UndoEntry[] = [];
  private readonly listeners = new Set<() => void>();

  /** A new action: forgets everything that was undone. */
  push(e: UndoEntry): void {
    this.done.push(e);
    if (this.done.length > UNDO_LIMIT) this.done.shift();
    this.undone.length = 0;
    this.emit();
  }

  peekUndo(): UndoEntry | null {
    return this.done[this.done.length - 1] ?? null;
  }

  peekRedo(): UndoEntry | null {
    return this.undone[this.undone.length - 1] ?? null;
  }

  /** Moves the last done entry to the redo stack. */
  markUndone(): void {
    const e = this.done.pop();
    if (e) this.undone.push(e);
    this.emit();
  }

  /** Moves the last undone entry back to the done stack. */
  markRedone(): void {
    const e = this.undone.pop();
    if (e) this.done.push(e);
    this.emit();
  }

  /** Drops the entry on top of the undo stack (it can no longer be applied). */
  dropUndo(): void {
    this.done.pop();
    this.emit();
  }

  dropRedo(): void {
    this.undone.pop();
    this.emit();
  }

  clear(): void {
    this.done.length = 0;
    this.undone.length = 0;
    this.emit();
  }

  get undoCount(): number {
    return this.done.length;
  }

  get redoCount(): number {
    return this.undone.length;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

/** Player-facing name of an action; `nameOf` gives a building's name from its definition id. */
export function undoLabel(e: UndoEntry, nameOf: (defId: string) => string): string {
  switch (e.kind) {
    case 'place':
      return `${nameOf(e.defId)} yerleştirme`;
    case 'demolish':
      return `${nameOf(e.defId)} yıkımı`;
    case 'move':
      return `${nameOf(e.defId)} taşıma`;
    default:
      return e.label;
  }
}
