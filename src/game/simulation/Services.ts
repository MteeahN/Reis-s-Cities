import { GRID_CELLS } from '../core/config';
import { getBuilding, type ServiceKind } from '../data/buildings';
import { ZoneType } from '../data/zones';
import type { PlacedBuilding } from '../entities/building/BuildingRegistry';
import type { Household } from './Population';

const N = GRID_CELLS;

export const SERVICE_KINDS: ServiceKind[] = ['police', 'fire', 'health', 'education', 'highEducation', 'garbage'];

export const SERVICE_LABEL: Record<ServiceKind, string> = {
  police: 'Polis',
  fire: 'İtfaiye',
  health: 'Sağlık',
  education: 'İlkokul',
  highEducation: 'Lise',
  garbage: 'Çöp toplama',
};

export interface StationLoad {
  kind: ServiceKind;
  served: number;
  capacity: number;
  /** capacity / served, capped at 1. */
  effectiveness: number;
}

const center = (b: PlacedBuilding) => ({ x: b.i + b.w / 2, y: b.j + b.d / 2 });

/**
 * Coverage fields (0–1 per cell) for each public service. A station covers
 * cells within its radius (full strength in the inner 60%, fading outward);
 * if more people live in range than it can serve, its strength drops in
 * proportion. Also derives a crime field from police coverage and jobs.
 */
export class ServiceCoverage {
  readonly fields = Object.fromEntries(SERVICE_KINDS.map((k) => [k, new Float32Array(N * N)])) as Record<ServiceKind, Float32Array>;
  readonly crime = new Uint8Array(N * N);
  readonly loads = new Map<number, StationLoad>();

  recompute(buildings: Iterable<PlacedBuilding>, households: Map<number, Household>, unemploymentRate: number, maturity: number): void {
    const all = [...buildings];
    const homes = all.filter((b) => b.zone === ZoneType.Residential && b.state === 'active');
    const workplaces = all.filter((b) => b.state === 'active' && getBuilding(b.defId).workers > 0);
    for (const k of SERVICE_KINDS) this.fields[k].fill(0);
    this.loads.clear();

    for (const s of all) {
      if (s.state !== 'active') continue;
      const svc = getBuilding(s.defId).service;
      if (!svc) continue;
      const c = center(s);
      const r = svc.radius;
      const inRange = (b: PlacedBuilding) => {
        const p = center(b);
        return Math.hypot(p.x - c.x, p.y - c.y) <= r;
      };
      let served = 0;
      for (const h of homes) {
        if (!inRange(h)) continue;
        const hh = households.get(h.id);
        if (!hh) continue;
        if (svc.kind === 'education') served += hh.ages[0];
        else if (svc.kind === 'highEducation') served += hh.ages[1];
        else served += hh.ages[0] + hh.ages[1] + hh.ages[2] + hh.ages[3];
      }
      if (svc.kind === 'garbage') for (const w of workplaces) if (inRange(w)) served += w.occupants;
      const effectiveness = Math.min(1, svc.capacity / Math.max(1, served));
      this.loads.set(s.id, { kind: svc.kind, served, capacity: svc.capacity, effectiveness });

      const field = this.fields[svc.kind];
      const r0 = Math.ceil(r);
      for (let dy = -r0; dy <= r0; dy++) {
        for (let dx = -r0; dx <= r0; dx++) {
          const x = Math.floor(c.x + dx);
          const y = Math.floor(c.y + dy);
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const d = Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y);
          if (d > r) continue;
          const falloff = d <= r * 0.6 ? 1 : 1 - ((d - r * 0.6) / (r * 0.4)) * 0.7;
          const v = falloff * effectiveness;
          const k = y * N + x;
          if (v > field[k]) field[k] = v;
        }
      }
    }

    // Crime rises with unemployment (in a grown city) and falls with police coverage.
    const police = this.fields.police;
    // Villages are calm; crime grows with the city and with joblessness.
    const base = 12 + 18 * maturity + 40 * unemploymentRate * maturity;
    for (let k = 0; k < N * N; k++) this.crime[k] = Math.max(0, Math.min(100, Math.round(base - 35 * police[k])));
  }

  /** Mean coverage of a service over a set of cells. */
  average(kind: ServiceKind, cells: number[]): number {
    const f = this.fields[kind];
    let s = 0;
    for (const c of cells) s += f[c];
    return cells.length ? s / cells.length : 0;
  }

  crimeAt(cells: number[]): number {
    let s = 0;
    for (const c of cells) s += this.crime[c];
    return cells.length ? s / cells.length : 0;
  }
}
