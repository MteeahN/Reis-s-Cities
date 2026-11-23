/**
 * Grouped (cohort) population simulation. Instead of one agent per citizen,
 * every residential building holds a household group with age and
 * education cohorts (fractional counts). City statistics are aggregates.
 */

export const AGE_GROUPS = ['Çocuk', 'Genç', 'Yetişkin', 'Yaşlı'] as const;
export const EDUCATION_LEVELS = ['Eğitimsiz', 'Temel', 'Yüksek'] as const;

export interface Household {
  buildingId: number;
  /** children, teens, adults, seniors */
  ages: [number, number, number, number];
  /** uneducated, basic, higher (adults + seniors) */
  edu: [number, number, number];
  happiness: number;
  /** 0–100; low health raises the death rate. */
  health: number;
}

/** Education tier mix of teenagers who become adults (uneducated / basic / higher). */
export type EduOutcome = (buildingId: number) => [number, number, number];

/** Without schools, new adults have no formal education. */
export const NO_SCHOOLS: EduOutcome = () => [1, 0, 0];

/** Per-day rates (compressed game time). */
export const RATES = {
  birthPerAdult: 0.012,
  childToTeen: 0.05,
  teenToAdult: 0.08,
  adultToSenior: 0.012,
  seniorDeath: 0.035,
};

/** Who moves in: age and education mix of immigrant households. */
export const IMMIGRANT_AGES: [number, number, number, number] = [0.2, 0.1, 0.6, 0.1];
export const IMMIGRANT_EDU: [number, number, number] = [0.35, 0.5, 0.15];

export const residentsOf = (h: Household): number => h.ages[0] + h.ages[1] + h.ages[2] + h.ages[3];

export interface DailyCounters {
  births: number;
  deaths: number;
  moveIns: number;
  moveOuts: number;
}

export interface PopulationSave {
  households: Household[];
  today: DailyCounters;
  yesterday: DailyCounters;
}

export class Population {
  readonly households = new Map<number, Household>();
  /** Running totals for the current game day, and the last completed day. */
  today: DailyCounters = { births: 0, deaths: 0, moveIns: 0, moveOuts: 0 };
  yesterday: DailyCounters = { births: 0, deaths: 0, moveIns: 0, moveOuts: 0 };

  get(buildingId: number): Household {
    let h = this.households.get(buildingId);
    if (!h) {
      h = { buildingId, ages: [0, 0, 0, 0], edu: [0, 0, 0], happiness: 50, health: 60 };
      this.households.set(buildingId, h);
    }
    return h;
  }

  /** Adds `count` immigrants to a building. */
  moveIn(buildingId: number, count: number): void {
    if (count <= 0) return;
    const h = this.get(buildingId);
    for (let k = 0; k < 4; k++) h.ages[k] += count * IMMIGRANT_AGES[k];
    const grown = count * (IMMIGRANT_AGES[2] + IMMIGRANT_AGES[3]);
    for (let k = 0; k < 3; k++) h.edu[k] += grown * IMMIGRANT_EDU[k];
    this.today.moveIns += count;
  }

  /** Removes `count` residents proportionally (emigration). Returns how many left. */
  moveOut(buildingId: number, count: number): number {
    const h = this.households.get(buildingId);
    if (!h) return 0;
    const total = residentsOf(h);
    if (total <= 0) return 0;
    const f = Math.min(1, count / total);
    const adultsBefore = h.ages[2] + h.ages[3];
    for (let k = 0; k < 4; k++) h.ages[k] *= 1 - f;
    const adultsAfter = h.ages[2] + h.ages[3];
    const ef = adultsBefore > 0 ? adultsAfter / adultsBefore : 0;
    for (let k = 0; k < 3; k++) h.edu[k] *= ef;
    const left = total * f;
    this.today.moveOuts += left;
    return left;
  }

  /** Everyone leaves (building demolished or abandoned). */
  evict(buildingId: number): number {
    const h = this.households.get(buildingId);
    if (!h) return 0;
    const n = residentsOf(h);
    this.today.moveOuts += n;
    this.households.delete(buildingId);
    return n;
  }

  /**
   * Ages cohorts and applies births/deaths for `days` (fraction of a game day).
   * `eduOf` decides what education teenagers leave school with (schools, Phase 5).
   */
  age(days: number, capacityOf: (buildingId: number) => number, eduOf: EduOutcome = NO_SCHOOLS): void {
    for (const h of this.households.values()) {
      const [c, t, a, s] = h.ages;
      const room = Math.max(0, capacityOf(h.buildingId) - residentsOf(h));
      const births = Math.min(room, a * RATES.birthPerAdult * days);
      const c2t = c * RATES.childToTeen * days;
      const t2a = t * RATES.teenToAdult * days;
      const a2s = a * RATES.adultToSenior * days;
      // Poor health raises mortality (×0.6 at full health … ×1.6 at zero).
      const deaths = s * RATES.seniorDeath * days * (1.6 - h.health / 100);
      h.ages = [c + births - c2t, t + c2t - t2a, a + t2a - a2s, s + a2s - deaths];
      const totalEdu = h.edu[0] + h.edu[1] + h.edu[2];
      if (totalEdu > 0 && deaths > 0) {
        const f = 1 - deaths / Math.max(deaths, totalEdu);
        for (let k = 0; k < 3; k++) h.edu[k] *= f;
      }
      const mix = eduOf(h.buildingId);
      h.edu[0] += t2a * mix[0];
      h.edu[1] += t2a * mix[1];
      h.edu[2] += t2a * mix[2];
      this.today.births += births;
      this.today.deaths += deaths;
    }
  }

  serialize(): PopulationSave {
    return {
      households: [...this.households.values()].map((h) => ({ ...h, ages: [...h.ages], edu: [...h.edu] }) as Household),
      today: { ...this.today },
      yesterday: { ...this.yesterday },
    };
  }

  restore(s: PopulationSave, buildingExists: (id: number) => boolean): void {
    this.households.clear();
    for (const h of s.households) {
      if (!buildingExists(h.buildingId)) continue;
      this.households.set(h.buildingId, { ...h, ages: [...h.ages], edu: [...h.edu] } as Household);
    }
    this.today = { ...s.today };
    this.yesterday = { ...s.yesterday };
  }

  rollDay(): void {
    this.yesterday = this.today;
    this.today = { births: 0, deaths: 0, moveIns: 0, moveOuts: 0 };
  }

  totals(): { total: number; ages: [number, number, number, number]; edu: [number, number, number]; happiness: number; health: number } {
    const ages: [number, number, number, number] = [0, 0, 0, 0];
    const edu: [number, number, number] = [0, 0, 0];
    let weighted = 0;
    let healthW = 0;
    for (const h of this.households.values()) {
      for (let k = 0; k < 4; k++) ages[k] += h.ages[k];
      for (let k = 0; k < 3; k++) edu[k] += h.edu[k];
      weighted += h.happiness * residentsOf(h);
      healthW += h.health * residentsOf(h);
    }
    const total = ages[0] + ages[1] + ages[2] + ages[3];
    return { total, ages, edu, happiness: total > 0 ? weighted / total : 0, health: total > 0 ? healthW / total : 0 };
  }
}
