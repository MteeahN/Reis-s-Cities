import { clamp } from '../../utils/math';
import { TAX } from '../data/economy';

export interface DemandInputs {
  population: number;
  /** Working-age residents. */
  labor: number;
  housingCapacity: number;
  commercialJobs: number;
  industrialJobs: number;
  /** All jobs incl. civic buildings. */
  totalJobs: number;
  commercialUnlocked: boolean;
  industrialUnlocked: boolean;
  /** Tax rate minus the neutral rate, per zone (positive = taxed above neutral). */
  taxPressure?: { residential: number; commercial: number; industrial: number };
}

export interface Demand {
  residential: number;
  commercial: number;
  industrial: number;
}

/** Commercial jobs a healthy city needs per resident, and industrial jobs per worker. */
export const COMMERCIAL_JOBS_PER_RESIDENT = 0.12;
export const INDUSTRIAL_JOBS_PER_WORKER = 0.3;

/**
 * Target RCI demand (0–100). Residents come when there are jobs and few
 * empty homes; shops follow residents; industry follows the labour force.
 */
export function targetDemand(d: DemandInputs): Demand {
  const vacantHomes = Math.max(0, d.housingCapacity - d.population);
  const vacancyRatio = vacantHomes / Math.max(20, d.housingCapacity);
  // Small towns commute to jobs outside the map; local unemployment matters as the city grows.
  const maturity = Math.min(1, d.population / 400);
  const unemployed = Math.max(0, d.labor - d.totalJobs) * maturity;
  const vacantJobs = Math.max(0, d.totalJobs - d.labor);
  const early = d.population < 400 ? 25 * (1 - d.population / 400) : 0;
  const tp = d.taxPressure ?? { residential: 0, commercial: 0, industrial: 0 };
  const residential = clamp(
    50 + (120 * (vacantJobs - unemployed)) / Math.max(60, d.labor) - 80 * vacancyRatio + early - tp.residential * TAX.demandPerPoint.residential,
    0,
    100,
  );

  const targetC = d.population * COMMERCIAL_JOBS_PER_RESIDENT + d.industrialJobs * 0.1;
  const commercial = d.commercialUnlocked
    ? clamp(50 + (100 * (targetC - d.commercialJobs)) / Math.max(15, targetC) - tp.commercial * TAX.demandPerPoint.commercial, 0, 100)
    : 0;

  const targetI = d.labor * INDUSTRIAL_JOBS_PER_WORKER;
  const industrial = d.industrialUnlocked
    ? clamp(50 + (100 * (targetI - d.industrialJobs)) / Math.max(20, targetI) - tp.industrial * TAX.demandPerPoint.industrial, 0, 100)
    : 0;

  return { residential, commercial, industrial };
}

/** Exponential smoothing toward the target so demand bars move gradually. */
export function smoothDemand(current: Demand, target: Demand, k = 0.15): Demand {
  return {
    residential: current.residential + (target.residential - current.residential) * k,
    commercial: current.commercial + (target.commercial - current.commercial) * k,
    industrial: current.industrial + (target.industrial - current.industrial) * k,
  };
}
