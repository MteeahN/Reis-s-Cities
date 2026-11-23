import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, Achievements, type AchievementContext } from '../../src/game/systems/Achievements';
import { MAX_SAMPLES, StatsHistory, type StatsSample } from '../../src/game/systems/StatsHistory';

const empty: AchievementContext = {
  population: 0,
  happiness: 0,
  unemploymentRate: 0,
  roadLength: 0,
  roadSegments: 0,
  junctions: 0,
  zonedCells: 0,
  activeByZone: { residential: 0, commercial: 0, industrial: 0 },
  maxLevel: 0,
  balance: 70000,
  bestDayNet: 0,
  loansRepaid: 0,
  powerServed: 0,
  waterServed: 0,
  sewageServed: 0,
  utilityProblems: 0,
  services: new Set(),
  tripsPerHour: 0,
  congestedLength: 0,
  day: 0,
};

describe('Achievements', () => {
  it('a new city has earned nothing', () => {
    const a = new Achievements();
    expect(a.evaluate(empty, 0)).toEqual([]);
    expect(a.view(empty).every((v) => v.earnedAt === null && v.progress < 1)).toBe(true);
  });

  it('are earned once, from measured values, and keep their time', () => {
    const a = new Achievements();
    const ctx = { ...empty, roadSegments: 1, roadLength: 2500, population: 120 };
    const got = a.evaluate(ctx, 300).map((x) => x.id);
    expect(got).toEqual(expect.arrayContaining(['first_road', 'first_residents', 'pop_100']));
    expect(got).not.toContain('pop_500');
    expect(a.evaluate(ctx, 400)).toEqual([]); // not twice
    const v = a.view(ctx);
    expect(v.find((x) => x.id === 'road_5km')!.progress).toBeCloseTo(0.5);
    expect(v.find((x) => x.id === 'first_road')!.earnedAt).toBe(300);
    // Earned achievements stay earned when the city shrinks.
    expect(a.view(empty).find((x) => x.id === 'pop_100')!.earnedAt).toBe(300);
  });

  it('conditional goals need their population threshold', () => {
    const a = new Achievements();
    expect(a.evaluate({ ...empty, population: 200, happiness: 90 }, 0).map((x) => x.id)).not.toContain('happy');
    expect(a.evaluate({ ...empty, population: 600, happiness: 90 }, 0).map((x) => x.id)).toContain('happy');
    expect(a.evaluate({ ...empty, population: 600, utilityProblems: 3 }, 0).map((x) => x.id)).not.toContain('no_outage');
  });

  it('save and restore keep earned ones and drop unknown ids', () => {
    const a = new Achievements();
    a.evaluate({ ...empty, roadSegments: 1 }, 50);
    const b = new Achievements();
    b.restore({ earned: [...a.serialize().earned, { id: 'removed_one', at: 1 }] });
    expect(b.count).toBe(1);
    expect(b.has('first_road')).toBe(true);
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(20);
  });
});

const sample = (t: number, population = t): StatsSample => ({
  t,
  population,
  happiness: 50,
  balance: 0,
  income: 0,
  expenses: 0,
  unemployment: 0,
  jobs: 0,
  congestion: 0,
  commuteMinutes: 0,
  health: 0,
  crime: 0,
  residential: 0,
  commercial: 0,
  industrial: 0,
});

describe('Statistics history', () => {
  it('records at most one sample per game hour', () => {
    const h = new StatsHistory();
    expect(h.record(sample(0))).toBe(true);
    expect(h.record(sample(30))).toBe(false);
    expect(h.record(sample(61))).toBe(true);
    expect(h.samples).toHaveLength(2);
  });

  it('thins old samples when full but keeps recent ones hourly and the start', () => {
    const h = new StatsHistory();
    for (let i = 0; i <= MAX_SAMPLES * 3; i++) h.record(sample(i * 60));
    expect(h.samples.length).toBeLessThanOrEqual(MAX_SAMPLES);
    expect(h.samples[0].t).toBe(0);
    const n = h.samples.length;
    expect(h.samples[n - 1].t - h.samples[n - 2].t).toBe(60);
    for (let i = 1; i < n; i++) expect(h.samples[i].t).toBeGreaterThan(h.samples[i - 1].t);
  });

  it('range filters to the last N minutes; restore sorts and validates', () => {
    const h = new StatsHistory();
    for (let i = 0; i < 100; i++) h.record(sample(i * 60));
    expect(h.range(1440).length).toBe(25);
    const r = new StatsHistory();
    r.restore({ samples: [sample(120), sample(60), { ...sample(0), t: Number.NaN }] });
    expect(r.samples.map((s) => s.t)).toEqual([60, 120]);
  });
});
