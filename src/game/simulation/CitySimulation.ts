import { GRID_CELLS, START_MINUTE_OFFSET } from '../core/config';
import { buildingCapacity, getBuilding, zonedTemplates } from '../data/buildings';
import { DEBT_HAPPINESS_PENALTY, PROFIT_PER_WORKER, TAX } from '../data/economy';
import { LINE_TYPES } from '../data/infrastructure';
import { getRoadType } from '../data/roads';
import { allocateWorkforce, jobsByTier, type WorkforceResult, type WorkplaceJobs } from './Workforce';
import type { ServiceKind } from '../data/buildings';
import { SERVICE_KINDS } from './Services';
import type { UtilityStats } from './Utilities';
import { ZONES, ZoneType, type ZoneKind } from '../data/zones';
import { hasRoadAccess } from '../entities/building/BuildingPlacement';
import type { PlacedBuilding } from '../entities/building/BuildingRegistry';
import type { City } from '../systems/City';
import { seededRng, type SeededRng } from '../world/generation/rng';
import { smoothDemand, targetDemand, type Demand } from './Demand';
import { findLot } from './LotFinder';
import { residentsOf } from './Population';
import type { SimScheduler } from './SimScheduler';
import type { RoadLoad } from './LandValue';
import type { TrafficStats } from './traffic/TrafficModel';

/** Simulation tick lengths (ticks at SIM_TICK_HZ). */
export const GROWTH_INTERVAL = 5;
export const POPULATION_INTERVAL = 10;
export const SLOW_INTERVAL = 50;
/** Traffic is re-routed every 2 s of real time at normal speed. */
export const TRAFFIC_INTERVAL = 20;
/** Commutes longer than this start to annoy residents (minutes). */
export const COMMUTE_TOLERANCE_MIN = 2;
export const CONSTRUCTION_TICKS = 120;
export const MIN_TICKS_BETWEEN_LEVELS = 600;
export const NO_ACCESS_ABANDON_TICKS = 1200;
export const ABANDONED_REMOVE_TICKS = 1200;
/** Three game days without electricity or water and a building is abandoned. */
export const NO_UTILITY_ABANDON_TICKS = 7200;
/** Chance per game day that an uncovered building catches fire. */
export const FIRE_CHANCE_PER_DAY = 0.004;
/** An unattended fire destroys the building after this many ticks. */
export const BURN_DOWN_TICKS = 150;
const MINUTES_PER_DAY = 1440;

export const LEVEL_REQUIREMENTS: Record<2 | 3, { landValue: number; happiness: number; occupancy: number }> = {
  2: { landValue: 35, happiness: 50, occupancy: 0.8 },
  3: { landValue: 60, happiness: 62, occupancy: 0.85 },
};

export const MILESTONES: { population: number; title: string; unlocks: string }[] = [
  { population: 100, title: 'Kasaba', unlocks: 'Ticaret bölgeleri açıldı' },
  { population: 250, title: 'Büyüyen kasaba', unlocks: 'Sanayi bölgeleri açıldı' },
  { population: 500, title: 'Küçük şehir', unlocks: 'Polis merkezi ve itfaiye açıldı' },
  { population: 1000, title: 'Şehir', unlocks: 'Hastane, ilkokul, lise ve atık su arıtma tesisi açıldı' },
  { population: 2500, title: 'Büyük şehir', unlocks: 'Ana Cadde ve Bulvar açıldı' },
  { population: 5000, title: 'Metropol adayı', unlocks: 'Otoyol açıldı' },
];

export interface PopulationStats {
  total: number;
  households: number;
  ages: [number, number, number, number];
  education: [number, number, number];
  labor: number;
  employed: number;
  unemployed: number;
  unemploymentRate: number;
  jobs: number;
  jobsBySector: { commercial: number; industrial: number; office: number; civic: number };
  income: { low: number; mid: number; high: number };
  happiness: number;
  housingCapacity: number;
  vacantHomes: number;
  yesterday: { births: number; deaths: number; moveIns: number; moveOuts: number };
  buildingsByZone: { residential: number; commercial: number; industrial: number };
  underConstruction: number;
  abandoned: number;
  /** Workers by own education tier (uneducated / basic / higher). */
  employedByEdu: [number, number, number];
  unemployedByEdu: [number, number, number];
  /** Unfilled job slots by required education tier. */
  vacancies: [number, number, number];
  /** Resident-weighted averages (0–100). */
  health: number;
  crime: number;
  /** Share of residents (0–1) living where each service covers at least 30%. */
  coverage: Record<ServiceKind, number>;
  utilities: UtilityStats;
  /** Buildings currently lacking each utility. */
  problems: { power: number; water: number; sewage: number; garbage: number; burning: number };
  /** Resident-weighted average noise (0–100). */
  noise: number;
  traffic: TrafficStats;
  /** Resident-weighted average contribution of each factor to happiness (sums to the target). */
  happinessFactors: { label: string; value: number }[];
}

export interface SimulationSave {
  demand: Demand;
  maxPopulation: number;
  lastDay: number;
  /** Last statistics snapshot, shown until the first population step after loading. */
  stats: PopulationStats | null;
  employment?: CitySimulation['employment'];
  /** Random stream position, so a loaded city continues exactly as it would have. */
  rngState?: number;
}

export interface SimCallbacks {
  onStats(stats: PopulationStats, demand: Demand): void;
  onMilestone(m: (typeof MILESTONES)[number]): void;
  onNotice?(n: { kind: 'info' | 'warning' | 'error' | 'success'; text: string }): void;
}

/**
 * Drives the city simulation on the fixed-step scheduler:
 *  - every 5 ticks: new buildings on zoned lots, construction progress
 *  - every 10 ticks: migration, ageing, employment, happiness, demand
 *  - every 50 ticks: land value & pollution, levelling up, abandonment
 */
export class CitySimulation {
  demand: Demand = { residential: 70, commercial: 0, industrial: 0 };
  /** Highest population reached — unlocks are never taken away. */
  maxPopulation = 0;
  private readonly rand: SeededRng;
  private lastDay = 0;
  stats: PopulationStats | null = null;
  /** Latest workforce allocation (null before the first population step). */
  workforce: WorkforceResult | null = null;
  /** Daily tax paid by each building (residential: its households' income tax). */
  readonly buildingTax = new Map<number, number>();
  /** Scratch: per-cell service bonus for land value. */
  private readonly landBonus = new Float32Array(GRID_CELLS * GRID_CELLS);
  /** Latest employment snapshot. */
  employment = { labor: 0, employed: 0, jobs: 0, rate: 0, commercialJobs: 0, industrialJobs: 0 };

  constructor(
    private readonly city: City,
    private readonly seed: number,
    private readonly cb: SimCallbacks,
  ) {
    this.rand = seededRng(seed ^ 0xc17c);
  }

  serialize(): SimulationSave {
    return { demand: { ...this.demand }, maxPopulation: this.maxPopulation, lastDay: this.lastDay, stats: this.stats, employment: { ...this.employment }, rngState: this.rand.state };
  }

  /**
   * Restores saved simulation state. The random stream is re-seeded from the
   * tick, and the derived fields (utilities, services, land value, traffic) are
   * recomputed from the restored city.
   */
  restore(s: SimulationSave, tick: number, gameMinutes: number): void {
    this.demand = { ...s.demand };
    this.maxPopulation = s.maxPopulation;
    this.city.maxPopulation = s.maxPopulation;
    this.lastDay = s.lastDay;
    this.stats = s.stats;
    if (s.employment) this.employment = { ...s.employment };
    this.rand.state = typeof s.rngState === 'number' ? s.rngState >>> 0 : (this.seed ^ 0xc17c ^ Math.imul(tick, 0x9e3779b1)) >>> 0;
    this.city.refreshUtilities(true);
    this.recomputeFields();
    this.trafficStep(gameMinutes);
  }

  register(s: SimScheduler): void {
    s.register({ name: 'growth', interval: GROWTH_INTERVAL, update: (t) => this.growth(t) });
    s.register({ name: 'population', interval: POPULATION_INTERVAL, update: (t, m) => this.populationStep(t, m) });
    s.register({ name: 'slow', interval: SLOW_INTERVAL, update: (t) => this.slowStep(t) });
    s.register({ name: 'traffic', interval: TRAFFIC_INTERVAL, update: (_t, m) => this.trafficStep(m) });
  }

  /** Re-routes trips for the current time of day (rush hours shift the load). */
  trafficStep(gameMinutes: number): void {
    const c = this.city;
    const e = this.employment;
    const employedShare = e.labor > 0 ? e.employed / e.labor : 0;
    // Clock time of day (the city is founded at 08:00).
    c.traffic.step(c.buildings.items.values(), c.population, employedShare, (gameMinutes + START_MINUTE_OFFSET) % MINUTES_PER_DAY);
  }

  isZoneUnlocked(z: ZoneKind): boolean {
    return Math.max(this.maxPopulation, this.city.unlockLevel) >= ZONES.find((d) => d.type === z)!.unlockPopulation;
  }

  // ---------------------------------------------------------------- growth

  private underConstruction(): number {
    let n = 0;
    for (const b of this.city.buildings.items.values()) if (b.state === 'construction') n++;
    return n;
  }

  growth(tick: number): void {
    const city = this.city;
    // Construction progress.
    for (const b of city.buildings.items.values()) {
      if (b.state !== 'construction') continue;
      const progress = Math.min(1, b.progress + GROWTH_INTERVAL / CONSTRUCTION_TICKS);
      if (progress >= 1) city.buildings.replace(b.id, { state: 'active', progress: 1, sinceTick: tick });
      else b.progress = progress;
    }
    // New buildings where demand exists.
    const maxBuilding = 4 + Math.floor((this.stats?.total ?? 0) / 150);
    let building = this.underConstruction();
    const zones: [ZoneKind, number][] = [
      [ZoneType.Residential, this.demand.residential],
      [ZoneType.Commercial, this.demand.commercial],
      [ZoneType.Industrial, this.demand.industrial],
    ];
    for (const [zone, d] of zones) {
      if (d < 15 || !this.isZoneUnlocked(zone) || building >= maxBuilding) continue;
      if (this.rand() > (d - 15) / 85) continue;
      const empty = city.zones.empty[zone];
      for (let attempt = 0; attempt < 8 && empty.size > 0; attempt++) {
        const k = empty.pick(this.rand)!;
        const lot = findLot(k % 256, Math.floor(k / 256), zone, 1, this.rand, city.lotWorld);
        if (lot) {
          city.spawnGrowable(lot, tick, this.rand());
          building++;
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------- population & economy of people

  private workplaces(): PlacedBuilding[] {
    const out: PlacedBuilding[] = [];
    for (const b of this.city.buildings.items.values()) {
      if (b.state === 'active' && getBuilding(b.defId).workers > 0) out.push(b);
    }
    return out;
  }

  private homes(): PlacedBuilding[] {
    const out: PlacedBuilding[] = [];
    for (const b of this.city.buildings.items.values()) {
      if (b.state === 'active' && b.zone === ZoneType.Residential) out.push(b);
    }
    return out;
  }

  populationStep(tick: number, gameMinutes: number): void {
    const city = this.city;
    const pop = city.population;
    const days = (POPULATION_INTERVAL * 0.6) / MINUTES_PER_DAY; // a tick is 0.6 game minutes
    void tick;

    const homes = this.homes();
    const capacity = new Map<number, number>();
    let housingCapacity = 0;
    for (const h of homes) {
      const c = getBuilding(h.defId).residents;
      capacity.set(h.id, c);
      housingCapacity += c;
    }

    // Ageing, births, deaths. Teenagers leave school educated only if schools cover their home.
    const homeById = new Map(homes.map((h) => [h.id, h]));
    pop.age(
      days,
      (id) => capacity.get(id) ?? 0,
      (id) => {
        const h = homeById.get(id);
        if (!h) return [1, 0, 0];
        const high = city.services.average('highEducation', h.cells) * 0.85;
        const basic = (1 - high) * city.services.average('education', h.cells);
        return [1 - high - basic, basic, high];
      },
    );

    // Immigration into vacant homes depends on how attractive the city is
    // (happiness and job prospects) — not on developer demand, which is about
    // building *new* homes and naturally drops while homes stand empty.
    let total = pop.totals().total;
    const free = Math.max(0, housingCapacity - total);
    const attract = this.attractiveness(total);
    if (free > 0 && attract > 0.05) {
      let arrivals = Math.min(free, (1 + free * 0.6 * days * 24) * attract);
      const vacant = homes.filter((h) => residentsOf(pop.get(h.id)) < (capacity.get(h.id) ?? 0) - 0.5);
      while (arrivals > 0.5 && vacant.length > 0) {
        const idx = Math.floor(this.rand() * vacant.length);
        const h = vacant[idx];
        const room = (capacity.get(h.id) ?? 0) - residentsOf(pop.get(h.id));
        const group = Math.min(room, arrivals, 2 + this.rand() * 2);
        pop.moveIn(h.id, group);
        arrivals -= group;
        if (room - group < 0.5) vacant.splice(idx, 1);
      }
    }

    // Employment: the labour force (by education) is matched to jobs (by required education).
    const workplaces = this.workplaces();
    let commercialJobs = 0;
    let industrialJobs = 0;
    const slots: WorkplaceJobs[] = [];
    for (const w of workplaces) {
      const def = getBuilding(w.defId);
      slots.push({ id: w.id, jobs: jobsByTier(def, w.level) });
      if (w.zone === ZoneType.Commercial) commercialJobs += def.workers;
      if (w.zone === ZoneType.Industrial) industrialJobs += def.workers;
    }
    const t0 = pop.totals();
    const eduTotal = t0.edu[0] + t0.edu[1] + t0.edu[2];
    const labor = t0.ages[2];
    const laborByEdu: [number, number, number] =
      eduTotal > 0 ? [labor * (t0.edu[0] / eduTotal), labor * (t0.edu[1] / eduTotal), labor * (t0.edu[2] / eduTotal)] : [labor, 0, 0];
    const wf = allocateWorkforce(laborByEdu, slots);
    const jobs = wf.jobs;
    const employed = wf.employed;
    const bySector = { commercial: 0, industrial: 0, office: 0, civic: 0 };
    for (const w of workplaces) {
      const def = getBuilding(w.defId);
      w.occupants = Math.round(wf.filled.get(w.id) ?? 0);
      const sector = !w.zone ? 'civic' : w.zone === ZoneType.Industrial ? 'industrial' : def.category === 'office' ? 'office' : 'commercial';
      bySector[sector] += w.occupants;
    }
    const unemploymentRate = labor > 0 ? (labor - employed) / labor : 0;
    this.employment = { labor, employed, jobs, rate: unemploymentRate, commercialJobs, industrialJobs };
    this.workforce = wf;

    // Economy: taxes from wages and business profits, upkeep for roads and civic buildings.
    const eco = city.economy;
    const customers = Math.max(0.4, Math.min(1.2, (t0.total * 0.12) / Math.max(1, commercialJobs)));
    let taxC = 0;
    let taxI = 0;
    this.buildingTax.clear();
    for (const w of workplaces) {
      if (!w.zone) continue;
      const def = getBuilding(w.defId);
      const lvl = Math.min(3, Math.max(1, w.level)) - 1;
      if (w.zone === ZoneType.Commercial) {
        const profit = w.occupants * PROFIT_PER_WORKER[def.category === 'office' ? 'office' : 'commercial'][lvl] * customers;
        const tax = (profit * eco.taxRates.commercial) / 100;
        taxC += tax;
        this.buildingTax.set(w.id, tax);
      } else if (w.zone === ZoneType.Industrial) {
        const tax = (w.occupants * PROFIT_PER_WORKER.industrial[lvl] * eco.taxRates.industrial) / 100;
        taxI += tax;
        this.buildingTax.set(w.id, tax);
      }
    }
    const taxR = (wf.wageBill * eco.taxRates.residential) / 100;
    const wagePerWorker = employed > 0 ? wf.wageBill / employed : 0;
    for (const h of homes) {
      const hh = pop.get(h.id);
      // Household share of the city's employed adults.
      const share = labor > 0 ? hh.ages[2] / labor : 0;
      this.buildingTax.set(h.id, (share * employed * wagePerWorker * eco.taxRates.residential) / 100);
    }
    let upkeepRoads = 0;
    for (const e of city.roads.edges.values()) upkeepRoads += (e.length * getRoadType(e.typeId).maintenancePerMeter) / 7;
    const upkeep = { landmark: 0, power: 0, water: 0, service: 0 };
    for (const b of city.buildings.items.values()) {
      if (b.zone) continue;
      const def = getBuilding(b.defId);
      upkeep[def.group ?? 'landmark'] += def.maintenance / 7;
    }
    upkeep.power += (city.powerLines.totalLength() * LINE_TYPES.power.maintenancePerMeter) / 7;
    upkeep.water += (city.pipes.totalLength() * LINE_TYPES.pipe.maintenancePerMeter) / 7;
    eco.apply(
      {
        taxResidential: taxR,
        taxCommercial: taxC,
        taxIndustrial: taxI,
        upkeepRoads,
        upkeepBuildings: upkeep.landmark,
        upkeepPower: upkeep.power,
        upkeepWater: upkeep.water,
        upkeepServices: upkeep.service,
      },
      days,
    );

    // Happiness per household: land value, pollution, jobs, shops nearby in the city.
    const shopSupply = Math.min(1, commercialJobs / Math.max(1, t0.total * 0.1));
    // A young town's residents commute to jobs and shops elsewhere: penalties phase in with size.
    const maturity = Math.min(1, t0.total / 400);
    const jobsTerm = 10 - 45 * Math.max(0, unemploymentRate - 0.08) * maturity;
    const shopsTerm = (shopSupply * 16 - 8) * maturity;
    // Taxes above the neutral rate make residents unhappy (below it, happier); debt hurts too.
    const taxTerm = -eco.taxPressure('residential') * TAX.happinessPerPoint;
    const debtTerm = eco.inDebt ? -DEBT_HAPPINESS_PENALTY : 0;
    const util = city.utilities;
    const svc = city.services;
    const garbageMatters = t0.total > 300;
    const traffic = city.traffic;
    const anyWorkplace = workplaces.some((w) => w.occupants > 0);
    const factorSum = new Map<string, number>();
    let factorWeight = 0;
    let noiseSum = 0;
    for (const h of homes) {
      const hh = pop.get(h.id);
      const lv = city.landValue.averageOver(h.cells, city.landValue.value);
      const pol = city.landValue.averageOver(h.cells, city.landValue.pollution);
      const access = hasRoadAccess(h.i, h.j, h.w, h.d, h.rot, city.placementWorld) ? 0 : -25;
      const noWater = !util.water.has(h.id);
      const noSewage = !util.sewage.has(h.id);
      const noGarbage = garbageMatters && svc.average('garbage', h.cells) < 0.3;
      // Health: hospitals help; pollution, dirty water, sewage and garbage hurt.
      const noise = city.landValue.averageOver(h.cells, city.landValue.noise);
      const healthTarget =
        55 + svc.average('health', h.cells) * 35 - pol * 0.4 - noise * 0.1 - (noWater ? 15 : 0) - (noSewage ? 10 : 0) - (noGarbage ? 8 : 0);
      hh.health += (Math.max(0, Math.min(100, healthTarget)) - hh.health) * 0.2;
      const utilityTerm = (util.power.has(h.id) ? 0 : -15) + (noWater ? -20 : 0) + (noSewage ? -10 : 0);
      const healthTerm = (hh.health - 50) * 0.2;
      const crimeTerm = -svc.crimeAt(h.cells) * 0.15;
      const garbageTerm = noGarbage ? -8 : 0;
      // Commute: long or congested trips to work annoy; no route to any job is worse.
      const commute = traffic.commute.get(h.id);
      const commuteTerm =
        commute === undefined || !anyWorkplace
          ? 0
          : Number.isFinite(commute)
            ? -Math.min(15, Math.max(0, commute / 60 - COMMUTE_TOLERANCE_MIN) * 3)
            : -8;
      const noiseTerm = -noise * 0.15;
      const terms: [string, number][] = [
        ['Temel', 45],
        ['Arazi değeri', lv * 0.35],
        ['Kirlilik', -pol * 0.6],
        ['Gürültü', noiseTerm],
        ['İş imkânı', jobsTerm],
        ['Alışveriş', shopsTerm],
        ['Vergiler', taxTerm],
        ['Bütçe açığı', debtTerm],
        ['Yol erişimi', access],
        ['Elektrik, su, kanalizasyon', utilityTerm],
        ['Sağlık', healthTerm],
        ['Suç', crimeTerm],
        ['Çöp', garbageTerm],
        ['İşe ulaşım', commuteTerm],
      ];
      let target = 0;
      const n = residentsOf(hh);
      for (const [label, v] of terms) {
        target += v;
        factorSum.set(label, (factorSum.get(label) ?? 0) + v * n);
      }
      factorWeight += n;
      noiseSum += noise * n;
      hh.happiness += (Math.max(0, Math.min(100, target)) - hh.happiness) * 0.2;
      h.occupants = Math.round(residentsOf(hh));
      // Unhappy households leave.
      if (hh.happiness < 35) pop.moveOut(h.id, residentsOf(hh) * ((35 - hh.happiness) / 35) * 0.25 * days * 24);
    }

    // Demand.
    const t = pop.totals();
    total = t.total;
    this.demand = smoothDemand(
      this.demand,
      targetDemand({
        population: total,
        labor,
        housingCapacity,
        commercialJobs,
        industrialJobs,
        totalJobs: jobs,
        commercialUnlocked: this.isZoneUnlocked(ZoneType.Commercial),
        industrialUnlocked: this.isZoneUnlocked(ZoneType.Industrial),
        taxPressure: {
          residential: eco.taxPressure('residential'),
          commercial: eco.taxPressure('commercial'),
          industrial: eco.taxPressure('industrial'),
        },
      }),
    );

    // Day rollover & milestones.
    const day = Math.floor(gameMinutes / MINUTES_PER_DAY);
    if (day !== this.lastDay) {
      this.lastDay = day;
      pop.rollDay();
      eco.rollDay(day);
    }
    const rounded = Math.round(total);
    if (rounded > this.maxPopulation) {
      for (const m of MILESTONES) if (this.maxPopulation < m.population && rounded >= m.population) this.cb.onMilestone(m);
      this.maxPopulation = rounded;
      city.maxPopulation = rounded;
    }

    // Income levels: industry → low, shops/civic → mid, offices → high; unemployed count as low.
    const lowIncome = bySector.industrial + (labor - employed);
    const income = { low: lowIncome, mid: bySector.commercial + bySector.civic, high: bySector.office };

    let res = 0;
    let com = 0;
    let ind = 0;
    let abandoned = 0;
    let construction = 0;
    for (const b of city.buildings.items.values()) {
      if (b.state === 'abandoned') abandoned++;
      if (b.state === 'construction') construction++;
      if (b.zone === ZoneType.Residential) res++;
      else if (b.zone === ZoneType.Commercial) com++;
      else if (b.zone === ZoneType.Industrial) ind++;
    }

    const happinessFactors = [...factorSum].map(([label, v]) => ({ label, value: factorWeight > 0 ? v / factorWeight : 0 }));
    this.stats = {
      total,
      households: homes.length,
      ages: t.ages,
      education: t.edu,
      labor,
      employed,
      unemployed: labor - employed,
      unemploymentRate,
      jobs,
      jobsBySector: bySector,
      income,
      happiness: t.happiness,
      housingCapacity,
      vacantHomes: Math.max(0, housingCapacity - total),
      yesterday: { ...pop.yesterday },
      buildingsByZone: { residential: res, commercial: com, industrial: ind },
      underConstruction: construction,
      abandoned,
      employedByEdu: wf.employedByEdu,
      unemployedByEdu: wf.unemployedByEdu,
      vacancies: wf.vacancies,
      ...this.serviceStats(homes, t.total),
      noise: factorWeight > 0 ? noiseSum / factorWeight : 0,
      traffic: { ...city.traffic.stats, worst: city.traffic.stats.worst.map((w) => ({ ...w })) },
      happinessFactors,
    };
    this.cb.onStats(this.stats, this.demand);
  }

  private serviceStats(homes: PlacedBuilding[], total: number) {
    const city = this.city;
    const pop = city.population;
    const coverage = Object.fromEntries(SERVICE_KINDS.map((k) => [k, 0])) as Record<ServiceKind, number>;
    let crime = 0;
    let health = 0;
    for (const h of homes) {
      const hh = pop.households.get(h.id);
      if (!hh) continue;
      const n = residentsOf(hh);
      health += hh.health * n;
      crime += city.services.crimeAt(h.cells) * n;
      for (const k of SERVICE_KINDS) if (city.services.average(k, h.cells) >= 0.3) coverage[k] += n;
    }
    if (total > 0) for (const k of SERVICE_KINDS) coverage[k] /= total;
    const u = city.utilities;
    const problems = { power: 0, water: 0, sewage: 0, garbage: 0, burning: 0 };
    for (const b of city.buildings.items.values()) {
      if (b.state === 'burning') problems.burning++;
      if (b.state !== 'active') continue;
      const def = getBuilding(b.defId);
      if (def.electricity > 0 && !def.utility?.power && !u.power.has(b.id)) problems.power++;
      if (def.water > 0 && !def.utility && !u.water.has(b.id)) problems.water++;
      if (def.water > 0 && !def.utility && !u.sewage.has(b.id)) problems.sewage++;
      if (b.zone && total > 300 && city.services.average('garbage', b.cells) < 0.3) problems.garbage++;
    }
    return {
      health: total > 0 ? health / total : 0,
      crime: total > 0 ? crime / total : 0,
      coverage,
      utilities: { ...u.stats },
      problems,
    };
  }

  /**
   * 0..1 pull on newcomers: happy residents and available jobs attract more.
   * Small towns get a grace period (residents can commute to jobs elsewhere).
   */
  attractiveness(population: number): number {
    const happiness = population >= 1 && this.stats ? this.stats.happiness : 60;
    const happy = Math.max(0, Math.min(1, (happiness - 25) / 45));
    const maturity = Math.min(1, population / 400);
    const jobs = 1 - Math.max(0, Math.min(1, (this.employment.rate - 0.1) * 2.5)) * maturity;
    return happy * (0.35 + 0.65 * jobs);
  }

  // ---------------------------------------------------------------- land value, levels, abandonment

  /** Service coverage, crime and land value / pollution / noise fields. */
  private recomputeFields(): void {
    const city = this.city;
    const maturity = Math.min(1, (this.stats?.total ?? 0) / 400);
    city.services.recompute(city.buildings.items.values(), city.population.households, this.employment.rate, maturity);
    const svc = city.services;
    // Services raise land value; crime and missing garbage collection lower it.
    const { police, fire, health, education, highEducation, garbage } = svc.fields;
    const crime = svc.crime;
    const garbageMatters = (this.stats?.total ?? 0) > 300;
    const bonus = this.landBonus;
    for (let k = 0; k < bonus.length; k++) {
      bonus[k] =
        police[k] * 5 +
        fire[k] * 4 +
        health[k] * 6 +
        Math.max(education[k], highEducation[k]) * 6 -
        crime[k] * 0.15 -
        (garbageMatters && garbage[k] < 0.3 ? 6 : 0);
    }
    city.landValue.recompute(city.buildings.items.values(), city.zones.zoneable, bonus, this.roadLoads());
  }

  slowStep(tick: number): void {
    const city = this.city;
    // Re-solved only if buildings or lines changed since the last solve (every change marks it dirty).
    const util = city.refreshUtilities();
    this.recomputeFields();
    const svc = city.services;

    const days = (SLOW_INTERVAL * 0.6) / MINUTES_PER_DAY;
    for (const b of [...city.buildings.items.values()]) {
      if (!b.zone) continue;
      const access = hasRoadAccess(b.i, b.j, b.w, b.d, b.rot, city.placementWorld);
      if (b.state === 'abandoned') {
        b.abandonedTicks += SLOW_INTERVAL;
        if (b.abandonedTicks >= ABANDONED_REMOVE_TICKS) city.removeGrowable(b.id);
        continue;
      }
      if (b.state === 'burning') {
        this.burn(b);
        continue;
      }
      if (b.state !== 'active') continue;

      // Fires: rarer under fire-station coverage.
      const fireCov = svc.average('fire', b.cells);
      if (this.rand() < FIRE_CHANCE_PER_DAY * days * (1 - 0.85 * fireCov)) {
        b.burnTicks = 0;
        city.buildings.replace(b.id, { state: 'burning' });
        continue;
      }

      b.noAccessTicks = access ? 0 : b.noAccessTicks + SLOW_INTERVAL;
      const hasUtilities = util.power.has(b.id) && util.water.has(b.id);
      b.noUtilityTicks = hasUtilities ? 0 : b.noUtilityTicks + SLOW_INTERVAL;
      if (b.noAccessTicks >= NO_ACCESS_ABANDON_TICKS || b.noUtilityTicks >= NO_UTILITY_ABANDON_TICKS) {
        city.population.evict(b.id);
        b.occupants = 0;
        city.buildings.replace(b.id, { state: 'abandoned' });
        continue;
      }
      this.tryLevelUp(b, tick);
    }
  }

  /** Current traffic per road segment, for noise and exhaust. */
  private roadLoads(): RoadLoad[] {
    const out: RoadLoad[] = [];
    const roads = this.city.roads;
    this.city.traffic.forEachEdgeFlow((id, flow, ratio) => {
      const e = roads.edges.get(id);
      if (e && flow >= 1) out.push({ points: e.poly.points, flow, ratio });
    });
    return out;
  }

  /** A burning building is put out if a fire station covers it, otherwise it burns down. */
  private burn(b: PlacedBuilding): void {
    const city = this.city;
    b.burnTicks += SLOW_INTERVAL;
    const fireCov = city.services.average('fire', b.cells);
    if (fireCov >= 0.3 && b.burnTicks >= SLOW_INTERVAL) {
      city.buildings.replace(b.id, { state: 'active' });
      return;
    }
    if (b.burnTicks >= BURN_DOWN_TICKS) {
      const name = getBuilding(b.defId).name;
      city.removeGrowable(b.id);
      this.cb.onNotice?.({ kind: 'error', text: `Yangın: bir ${name} yanarak yıkıldı. İtfaiye kapsamı yok.` });
    }
  }

  /** What still blocks this building from reaching its next level (empty when it can level up). */
  levelBlockers(b: PlacedBuilding): string[] {
    if (!b.zone || b.level >= 3 || b.state !== 'active') return [];
    const req = LEVEL_REQUIREMENTS[(b.level + 1) as 2 | 3];
    const city = this.city;
    const out: string[] = [];
    const u = city.utilities;
    if (!u.power.has(b.id)) out.push('Elektrik yok');
    if (!u.water.has(b.id)) out.push('Su yok');
    if (b.level + 1 === 3) {
      if (!u.sewage.has(b.id)) out.push('Kanalizasyon yok');
      const covered = (['police', 'fire', 'health', 'education'] as const).filter((k) => city.services.average(k, b.cells) >= 0.3).length;
      if (covered < 2) out.push(`Kamu hizmeti ${covered} / 2 (polis, itfaiye, sağlık, okul)`);
    }
    const lv = city.landValue.averageOver(b.cells, city.landValue.value);
    if (lv < req.landValue) out.push(`Arazi değeri ${Math.round(lv)} / ${req.landValue}`);
    const cap = buildingCapacity(getBuilding(b.defId));
    if (cap > 0 && b.occupants / cap < req.occupancy) out.push(`Doluluk %${Math.round((b.occupants / cap) * 100)} / %${Math.round(req.occupancy * 100)}`);
    if (b.zone === ZoneType.Residential) {
      const h = city.population.households.get(b.id)?.happiness ?? 0;
      if (h < req.happiness) out.push(`Mutluluk ${Math.round(h)} / ${req.happiness}`);
    }
    return out;
  }

  private tryLevelUp(b: PlacedBuilding, tick: number): void {
    if (b.level >= 3 || tick - b.sinceTick < MIN_TICKS_BETWEEN_LEVELS) return;
    if (this.levelBlockers(b).length > 0) return;
    const def = getBuilding(b.defId);
    const next = zonedTemplates(b.zone as ZoneKind, b.level + 1, def.footprint);
    if (next.length === 0) return;
    const pick = next[Math.floor(this.rand() * next.length)];
    this.city.buildings.replace(b.id, { defId: pick.id, level: b.level + 1, sinceTick: tick });
  }
}
