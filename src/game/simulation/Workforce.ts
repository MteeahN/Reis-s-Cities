import { JOB_EDUCATION, WAGE_BY_TIER } from '../data/economy';
import type { BuildingDef } from '../data/buildings';

export type Tiers = [number, number, number];

export interface WorkplaceJobs {
  id: number;
  /** Job slots by minimum education tier (uneducated / basic / higher). */
  jobs: Tiers;
}

export interface WorkforceResult {
  /** Workers employed per workplace. */
  filled: Map<number, number>;
  filledByTier: Tiers;
  employedByEdu: Tiers;
  unemployedByEdu: Tiers;
  vacancies: Tiers;
  labor: number;
  employed: number;
  jobs: number;
  /** Daily taxable wages of all employed residents. */
  wageBill: number;
}

/** Job-slot education profile of a workplace from its category and level. */
export function jobsByTier(def: BuildingDef, level: number): Tiers {
  const kind = !def.zone ? 'civic' : def.category === 'office' ? 'office' : def.category === 'industrial' ? 'industrial' : 'commercial';
  const table = JOB_EDUCATION[kind];
  const mix = table[Math.min(table.length, Math.max(1, level)) - 1];
  return [def.workers * mix[0], def.workers * mix[1], def.workers * mix[2]];
}

/**
 * Matches the labour force (by education) to jobs (by required education).
 * Each job tier is filled by workers of that tier first, then by more
 * educated workers willing to take it; nobody takes a job above their level.
 * Within a tier, filling is proportional across workplaces.
 */
export function allocateWorkforce(labor: Tiers, workplaces: WorkplaceJobs[]): WorkforceResult {
  const jobs: Tiers = [0, 0, 0];
  for (const w of workplaces) for (let t = 0; t < 3; t++) jobs[t] += w.jobs[t];
  const available: Tiers = [...labor] as Tiers;
  const filledByTier: Tiers = [0, 0, 0];
  const employedByEdu: Tiers = [0, 0, 0];

  const take = (tier: number, edu: number) => {
    const n = Math.min(jobs[tier] - filledByTier[tier], available[edu]);
    if (n <= 0) return;
    filledByTier[tier] += n;
    available[edu] -= n;
    employedByEdu[edu] += n;
  };
  // Highest requirements first so scarce graduates go where only they qualify.
  take(2, 2);
  take(1, 1);
  take(1, 2);
  take(0, 0);
  take(0, 1);
  take(0, 2);

  const ratio = filledByTier.map((f, t) => (jobs[t] > 0 ? f / jobs[t] : 0));
  const filled = new Map<number, number>();
  for (const w of workplaces) filled.set(w.id, w.jobs[0] * ratio[0] + w.jobs[1] * ratio[1] + w.jobs[2] * ratio[2]);

  const employed = filledByTier[0] + filledByTier[1] + filledByTier[2];
  return {
    filled,
    filledByTier,
    employedByEdu,
    unemployedByEdu: available,
    vacancies: [jobs[0] - filledByTier[0], jobs[1] - filledByTier[1], jobs[2] - filledByTier[2]],
    labor: labor[0] + labor[1] + labor[2],
    employed,
    jobs: jobs[0] + jobs[1] + jobs[2],
    wageBill: filledByTier[0] * WAGE_BY_TIER[0] + filledByTier[1] * WAGE_BY_TIER[1] + filledByTier[2] * WAGE_BY_TIER[2],
  };
}
