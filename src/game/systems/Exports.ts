import type { UtilityStats } from '../simulation/Utilities';

/**
 * Sales to the neighbouring towns: electricity, clean water and sewage
 * treatment the city produces but does not use. The player sets how much to
 * offer; what is actually sold each day is at most the real surplus (what the
 * city's plants produce beyond what its buildings draw), so selling never
 * takes service away from the city — when demand grows, sales shrink first.
 * The neighbours buy up to a fixed amount a day. The lines to them are taken
 * as already laid along the intercity road (no extra building needed).
 */

export type ExportKind = 'power' | 'water' | 'sewage';

export interface ExportDef {
  kind: ExportKind;
  name: string;
  unit: string;
  /** ₺ a day per 1 000 units sold. */
  pricePerThousand: number;
  /** Most the neighbours take a day (units). */
  max: number;
  /** Step of the − / + buttons (units). */
  step: number;
}

export const EXPORTS: readonly ExportDef[] = [
  { kind: 'power', name: 'Elektrik', unit: 'kW', pricePerThousand: 8, max: 20000, step: 500 },
  { kind: 'water', name: 'Temiz su', unit: 'm³', pricePerThousand: 20, max: 3000, step: 100 },
  { kind: 'sewage', name: 'Atık su arıtma', unit: 'm³', pricePerThousand: 15, max: 3000, step: 100 },
];

export const exportDef = (k: ExportKind): ExportDef => EXPORTS.find((d) => d.kind === k)!;

/** Unused production of each utility now. */
export function surplus(s: UtilityStats): Record<ExportKind, number> {
  return {
    power: Math.max(0, s.powerProduced - s.powerServed),
    water: Math.max(0, s.waterProduced - s.waterServed),
    sewage: Math.max(0, s.sewageCapacity - s.sewageServed),
  };
}

export class Exports {
  /** What the player offers a day, per kind. */
  readonly offered: Record<ExportKind, number> = { power: 0, water: 0, sewage: 0 };
  version = 0;

  set(kind: ExportKind, amount: number): void {
    const d = exportDef(kind);
    const v = Math.max(0, Math.min(d.max, Math.round(amount / d.step) * d.step));
    if (v === this.offered[kind]) return;
    this.offered[kind] = v;
    this.version++;
  }

  /** Units actually sold a day, given the utilities now. */
  sold(s: UtilityStats): Record<ExportKind, number> {
    const free = surplus(s);
    return { power: Math.min(this.offered.power, free.power), water: Math.min(this.offered.water, free.water), sewage: Math.min(this.offered.sewage, free.sewage) };
  }

  /** ₺ a day from what is sold. */
  income(s: UtilityStats): number {
    const sold = this.sold(s);
    let sum = 0;
    for (const d of EXPORTS) sum += (sold[d.kind] / 1000) * d.pricePerThousand;
    return sum;
  }

  get any(): boolean {
    return this.offered.power > 0 || this.offered.water > 0 || this.offered.sewage > 0;
  }

  serialize(): Record<ExportKind, number> {
    return { ...this.offered };
  }

  restore(d: Partial<Record<ExportKind, number>> | undefined): void {
    for (const def of EXPORTS) this.offered[def.kind] = 0;
    if (d && typeof d === 'object') for (const def of EXPORTS) this.set(def.kind, Number(d[def.kind]) || 0);
    this.version++;
  }
}
