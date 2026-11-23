import type { Rotation } from '../entities/building/BuildingPlacement';
import type { ArchStyle } from '../data/styles';

/** Where a player building stands. */
export interface Spot {
  i: number;
  j: number;
  rot: Rotation;
}

/**
 * One undoable player action. Only hand-placed buildings are covered:
 * placing, bulldozing and moving them. `id` is the building's current id and
 * is rewritten whenever undo/redo recreates it.
 */
export type UndoEntry =
  | { kind: 'place'; id: number; defId: string; at: Spot; cost: number; style?: ArchStyle; tint: number }
  | { kind: 'demolish'; id: number; defId: string; at: Spot; cost: number; refund: number }
  | { kind: 'move'; id: number; defId: string; from: Spot; to: Spot };

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

export function undoLabel(e: UndoEntry, name: string): string {
  switch (e.kind) {
    case 'place':
      return `${name} yerleştirme`;
    case 'demolish':
      return `${name} yıkımı`;
    case 'move':
      return `${name} taşıma`;
  }
}
