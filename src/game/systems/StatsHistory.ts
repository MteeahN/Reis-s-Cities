/** One recorded moment of the city (taken every game hour). */
export interface StatsSample {
  /** Game minutes since founding. */
  t: number;
  population: number;
  happiness: number;
  balance: number;
  /** Daily income and expenses at the rates of that hour (TL/day). */
  income: number;
  expenses: number;
  /** 0–1 */
  unemployment: number;
  jobs: number;
  /** Flow-weighted volume/capacity, 0–1+. */
  congestion: number;
  commuteMinutes: number;
  health: number;
  crime: number;
  residential: number;
  commercial: number;
  industrial: number;
}

export type StatsMetric = Exclude<keyof StatsSample, 't'>;

export interface StatsHistorySave {
  samples: StatsSample[];
}

/** Samples are kept at full (hourly) resolution for this long, then thinned. */
export const MAX_SAMPLES = 1200;
export const SAMPLE_MINUTES = 60;

/**
 * Time series of city statistics. When the buffer fills, the older half is
 * thinned to every second sample, so recent history stays hourly and the whole
 * life of the city still fits.
 */
export class StatsHistory {
  samples: StatsSample[] = [];

  /** Records a sample if a new game hour has started since the last one. Returns true when recorded. */
  record(s: StatsSample): boolean {
    const last = this.samples[this.samples.length - 1];
    if (last && Math.floor(s.t / SAMPLE_MINUTES) <= Math.floor(last.t / SAMPLE_MINUTES)) return false;
    this.samples.push(s);
    if (this.samples.length > MAX_SAMPLES) this.thin();
    return true;
  }

  private thin(): void {
    const half = Math.floor(this.samples.length / 2);
    const old = this.samples.slice(0, half).filter((_, i) => i % 2 === 0);
    this.samples = [...old, ...this.samples.slice(half)];
  }

  /** Samples within the last `minutes` game minutes (all when null). */
  range(minutes: number | null): StatsSample[] {
    if (minutes === null || this.samples.length === 0) return this.samples.slice();
    const end = this.samples[this.samples.length - 1].t;
    return this.samples.filter((s) => s.t >= end - minutes);
  }

  serialize(): StatsHistorySave {
    return { samples: this.samples.map((s) => ({ ...s })) };
  }

  restore(s: StatsHistorySave): void {
    this.samples = s.samples
      .filter((x) => x && Number.isFinite(x.t))
      .sort((a, b) => a.t - b.t)
      .slice(-MAX_SAMPLES)
      .map((x) => ({ ...x }));
  }
}
