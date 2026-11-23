import type { ServiceKind } from '../data/buildings';

/**
 * What achievements are judged on. Every field is measured from the running
 * city (see Game.achievementContext); nothing is granted on a timer or for free.
 */
export interface AchievementContext {
  population: number;
  happiness: number;
  unemploymentRate: number;
  roadLength: number;
  roadSegments: number;
  junctions: number;
  zonedCells: number;
  /** Active growable buildings per zone. */
  activeByZone: { residential: number; commercial: number; industrial: number };
  /** Highest level any active growable building has reached. */
  maxLevel: number;
  balance: number;
  /** Best daily net (income − expenses) among closed days, in TL. */
  bestDayNet: number;
  loansRepaid: number;
  powerServed: number;
  waterServed: number;
  sewageServed: number;
  /** Buildings lacking power or water right now. */
  utilityProblems: number;
  /** Service kinds with at least one active building. */
  services: ReadonlySet<ServiceKind>;
  tripsPerHour: number;
  congestedLength: number;
  /** Whole game days since the city was founded. */
  day: number;
}

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  /** 0..1 toward the goal (1 = earned). */
  progress(c: AchievementContext): number;
}

const ratio = (v: number, goal: number) => Math.max(0, Math.min(1, v / goal));
const flag = (b: boolean) => (b ? 1 : 0);
const population = (n: number, title: string): AchievementDef => ({
  id: `pop_${n}`,
  title,
  description: `${n.toLocaleString('tr-TR')} nüfusa ulaş.`,
  progress: (c) => ratio(c.population, n),
});

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first_road', title: 'İlk Adım', description: 'İlk yolunu inşa et.', progress: (c) => flag(c.roadSegments > 0) },
  { id: 'first_zone', title: 'Planlamacı', description: 'İlk bölgeni çiz.', progress: (c) => flag(c.zonedCells > 0) },
  { id: 'first_power', title: 'Işıklar Yandı', description: 'Bir binaya elektrik ulaştır.', progress: (c) => flag(c.powerServed > 0) },
  { id: 'first_water', title: 'Musluktan Su', description: 'Bir binaya su ulaştır.', progress: (c) => flag(c.waterServed > 0) },
  { id: 'first_residents', title: 'Hoş Geldiniz', description: 'İlk sakinler şehre taşınsın.', progress: (c) => flag(c.population >= 1) },
  population(100, 'Kasaba'),
  population(500, 'Küçük Şehir'),
  population(1000, 'Şehir'),
  population(2500, 'Büyük Şehir'),
  population(5000, 'Metropol Adayı'),
  population(10000, 'Metropol'),
  { id: 'road_5km', title: 'Yol Ağı', description: 'Toplam 5 km yol inşa et.', progress: (c) => ratio(c.roadLength, 5000) },
  { id: 'junctions_10', title: 'Kavşak Ustası', description: '10 kavşaklı bir yol ağı kur.', progress: (c) => ratio(c.junctions, 10) },
  {
    id: 'mixed_city',
    title: 'Karma Şehir',
    description: 'Konut, ticaret ve sanayi bölgelerinin hepsinde çalışan bina olsun.',
    progress: (c) => (flag(c.activeByZone.residential > 0) + flag(c.activeByZone.commercial > 0) + flag(c.activeByZone.industrial > 0)) / 3,
  },
  { id: 'sewage', title: 'Temiz Şehir', description: 'Atık suyu bir arıtma tesisinde topla.', progress: (c) => flag(c.sewageServed > 0) },
  {
    id: 'services',
    title: 'Kamu Hizmeti',
    description: 'Polis, itfaiye, sağlık ve eğitim binalarının hepsini çalıştır.',
    progress: (c) => (['police', 'fire', 'health', 'education'] as const).filter((k) => c.services.has(k)).length / 4,
  },
  { id: 'level_3', title: 'Gökdelen Çağı', description: 'Bir binayı 3. seviyeye çıkar.', progress: (c) => (c.maxLevel >= 3 ? 1 : c.maxLevel >= 2 ? 0.5 : 0) },
  {
    id: 'no_outage',
    title: 'Kesintisiz',
    description: '500 nüfusu geçip hiçbir binayı elektriksiz veya susuz bırakma.',
    progress: (c) => (c.utilityProblems > 0 ? 0 : ratio(c.population, 500)),
  },
  {
    id: 'happy',
    title: 'Mutlu Şehir',
    description: '500 nüfusla ortalama mutluluğu %75 üzerine çıkar.',
    progress: (c) => (c.population >= 500 ? ratio(c.happiness, 75) : 0),
  },
  {
    id: 'full_employment',
    title: 'Tam İstihdam',
    description: '1.000 nüfusla işsizliği %5 altına indir.',
    progress: (c) => flag(c.population >= 1000 && c.unemploymentRate < 0.05),
  },
  {
    id: 'smooth_traffic',
    title: 'Akıcı Trafik',
    description: '1.000 nüfusla hiçbir yolu kapasitesinin %90 üzerine çıkarmadan trafiği akıt.',
    progress: (c) => flag(c.population >= 1000 && c.tripsPerHour > 0 && c.congestedLength === 0),
  },
  { id: 'profit_day', title: 'Kârlı Gün', description: 'Bir günü ₺5.000 artıyla kapat.', progress: (c) => ratio(c.bestDayNet, 5000) },
  { id: 'treasury', title: 'Hazine Dolu', description: 'Bütçede ₺500.000 biriktir.', progress: (c) => ratio(c.balance, 500_000) },
  { id: 'debt_free', title: 'Borçsuz', description: 'Bir krediyi tamamen öde.', progress: (c) => flag(c.loansRepaid > 0) },
  { id: 'week', title: 'İlk Hafta', description: 'Şehrini 7 gün yönet.', progress: (c) => ratio(c.day, 7) },
  { id: 'month', title: 'Bir Ay', description: 'Şehrini 30 gün yönet.', progress: (c) => ratio(c.day, 30) },
];

export interface EarnedAchievement {
  id: string;
  /** Game minutes since founding when it was earned. */
  at: number;
}

export interface AchievementsSave {
  earned: EarnedAchievement[];
}

export interface AchievementView {
  id: string;
  title: string;
  description: string;
  progress: number;
  earnedAt: number | null;
}

/** Tracks which achievements this city has earned (saved with the city). */
export class Achievements {
  private readonly earned = new Map<string, number>();

  /** Evaluates every achievement; returns the ones earned just now. */
  evaluate(c: AchievementContext, gameMinutes: number): AchievementDef[] {
    const fresh: AchievementDef[] = [];
    for (const a of ACHIEVEMENTS) {
      if (this.earned.has(a.id)) continue;
      if (a.progress(c) >= 1) {
        this.earned.set(a.id, gameMinutes);
        fresh.push(a);
      }
    }
    return fresh;
  }

  has(id: string): boolean {
    return this.earned.has(id);
  }

  get count(): number {
    return this.earned.size;
  }

  view(c: AchievementContext | null): AchievementView[] {
    return ACHIEVEMENTS.map((a) => {
      const at = this.earned.get(a.id);
      return {
        id: a.id,
        title: a.title,
        description: a.description,
        progress: at !== undefined ? 1 : c ? Math.min(0.99, a.progress(c)) : 0,
        earnedAt: at ?? null,
      };
    });
  }

  serialize(): AchievementsSave {
    return { earned: [...this.earned].map(([id, at]) => ({ id, at })) };
  }

  restore(s: AchievementsSave): void {
    this.earned.clear();
    const known = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const e of s.earned) if (known.has(e.id) && Number.isFinite(e.at)) this.earned.set(e.id, e.at);
  }
}
