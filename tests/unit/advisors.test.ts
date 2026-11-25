import { describe, expect, it } from 'vitest';
import type { PopulationStats } from '../../src/game/simulation/CitySimulation';
import { cityAdvice, type AdviceContext } from '../../src/game/systems/Advisors';

function stats(over: Partial<PopulationStats>): PopulationStats {
  return {
    total: 400, households: 100, ages: [0, 0, 0, 0], education: [0, 0, 0], labor: 200, employed: 190, unemployed: 10, unemploymentRate: 0.05,
    jobs: 200, jobsBySector: { commercial: 0, industrial: 0, office: 0, civic: 0 }, income: { low: 0, mid: 0, high: 0 }, happiness: 60,
    housingCapacity: 450, vacantHomes: 50, yesterday: { births: 0, deaths: 0, moveIns: 0, moveOuts: 0 },
    buildingsByZone: { residential: 0, commercial: 0, industrial: 0, office: 0 }, underConstruction: 0, abandoned: 0,
    employedByEdu: [0, 0, 0], unemployedByEdu: [0, 0, 0], vacancies: [0, 0, 0], health: 70, crime: 10,
    coverage: { police: 1, fire: 1, health: 1, education: 1, highEducation: 1, garbage: 1 }, utilities: {} as PopulationStats['utilities'],
    problems: { power: 0, water: 0, sewage: 0, garbage: 0, burning: 0 }, noise: 10,
    traffic: { vehicles: 0, tripsPerHour: 0, congestion: 0, avgSpeedKmh: 0, congestedLength: 0, commuteMinutes: 10, unroutable: 0, worst: [] },
    happinessFactors: [{ label: 'Temel', value: 20 }, { label: 'İşsizlik', value: -8 }, { label: 'Kirlilik', value: -3 }],
    ...over,
  };
}
const ctx = (s: Partial<PopulationStats>, extra: Partial<AdviceContext> = {}): AdviceContext => ({
  stats: stats(s), demand: { residential: 0, commercial: 0, industrial: 0, office: 0 }, taxRates: { residential: 9, commercial: 9, industrial: 9 }, inDebt: false, dailyNet: 100, ...extra,
});

describe('Advisors', () => {
  it('say nothing when the city is fine', () => {
    expect(cityAdvice(ctx({}))).toEqual([]);
  });

  it('speak about real problems, most urgent first, with the figure and the tool to fix it', () => {
    const list = cityAdvice(ctx({ problems: { power: 6, water: 0, sewage: 0, garbage: 0, burning: 0 }, traffic: { vehicles: 0, tripsPerHour: 0, congestion: 0.6, avgSpeedKmh: 0, congestedLength: 0, commuteMinutes: 10, unroutable: 0, worst: [] }, coverage: { police: 0.3, fire: 1, health: 1, education: 1, highEducation: 1, garbage: 1 } }, { dailyNet: -40 }));
    expect(list.map((a) => a.id)).toEqual(['power', 'traffic', 'deficit', 'cover-police']);
    expect(list[0]).toMatchObject({ level: 'high', tool: 'power', metric: '6 bina elektriksiz' });
  });

  it('name what pulls happiness down most', () => {
    const [a] = cityAdvice(ctx({ happiness: 30 }));
    expect(a.id).toBe('happiness');
    expect(a.text).toContain('işsizlik, kirlilik');
  });

  it('read zone demand on its 0–100 scale', () => {
    const quiet = cityAdvice(ctx({ vacantHomes: 0 }, { demand: { residential: 40, commercial: 0, industrial: 0, office: 0 } }));
    expect(quiet.map((a) => a.id)).toEqual([]);
    const [a] = cityAdvice(ctx({ vacantHomes: 0 }, { demand: { residential: 99, commercial: 0, industrial: 0, office: 0 } }));
    expect(a.metric).toBe('talep %99, boş ev 0');
  });
});
