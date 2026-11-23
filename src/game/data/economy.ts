/**
 * Economy tuning data. All money values are ₺ per game day unless noted.
 * Keeping these in one table makes balancing a data change, not a code change.
 */

export type TaxKind = 'residential' | 'commercial' | 'industrial';

export const TAX = {
  default: 9,
  min: 0,
  max: 29,
  /** Rate at which taxes feel "neutral" to citizens and businesses. */
  neutral: 9,
  /** Residential happiness change per percentage point above/below neutral. */
  happinessPerPoint: 1.4,
  /** Demand change per percentage point above/below neutral. */
  demandPerPoint: { residential: 2, commercial: 3, industrial: 3 } as Record<TaxKind, number>,
};

/** Education tiers: 0 = uneducated, 1 = basic, 2 = higher. */
export type EduTier = 0 | 1 | 2;

/** Daily taxable income of a worker by the education tier of their job. */
export const WAGE_BY_TIER: [number, number, number] = [3, 4, 6];

/** Daily taxable business profit per employed worker, by category and level (index level-1). */
export const PROFIT_PER_WORKER: Record<'commercial' | 'office' | 'industrial', [number, number, number]> = {
  commercial: [5, 6.5, 8.5],
  office: [7, 9, 12],
  industrial: [4.5, 5.5, 7],
};

/**
 * Share of a workplace's jobs that require each minimum education tier,
 * by category and level. Higher levels need a more educated workforce.
 */
export const JOB_EDUCATION: Record<'commercial' | 'office' | 'industrial' | 'civic', [number, number, number][]> = {
  industrial: [
    [0.7, 0.3, 0],
    [0.5, 0.4, 0.1],
    [0.3, 0.5, 0.2],
  ],
  commercial: [
    [0.5, 0.5, 0],
    [0.3, 0.6, 0.1],
    [0.2, 0.6, 0.2],
  ],
  office: [
    [0.1, 0.5, 0.4],
    [0, 0.45, 0.55],
    [0, 0.35, 0.65],
  ],
  civic: [[0.2, 0.5, 0.3]],
};

export interface LoanOffer {
  id: string;
  amount: number;
  /** Total interest over the term (fraction). */
  interest: number;
  days: number;
}

export const LOAN_OFFERS: readonly LoanOffer[] = [
  { id: 'small', amount: 20_000, interest: 0.05, days: 90 },
  { id: 'medium', amount: 50_000, interest: 0.08, days: 150 },
  { id: 'large', amount: 100_000, interest: 0.12, days: 240 },
];
export const MAX_LOANS = 2;

/** Happiness penalty while the city is in debt. */
export const DEBT_HAPPINESS_PENALTY = 8;
/** Below this balance the city is warned it is close to bankruptcy. */
export const BANKRUPTCY_WARNING = -25_000;
/** Number of past days kept in the budget history. */
export const LEDGER_HISTORY_DAYS = 14;
