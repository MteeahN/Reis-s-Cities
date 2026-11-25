import type { ToolId } from '../core/events';
import type { TaxKind } from '../data/economy';
import type { PopulationStats } from '../simulation/CitySimulation';
import type { Demand } from '../simulation/Demand';

/**
 * Advisors: what the city needs most right now, worked out from the
 * simulation's own numbers, each with the tool that fixes it. Nothing here
 * is invented — every item states the measured figure it reacts to.
 */

export type AdviceLevel = 'high' | 'medium' | 'low';

export interface Advice {
  id: string;
  level: AdviceLevel;
  /** Which advisor speaks. */
  advisor: string;
  title: string;
  text: string;
  /** The measured figure behind it. */
  metric: string;
  /** Tool to open for the fix (none: use the panels). */
  tool?: ToolId;
}

export interface AdviceContext {
  stats: PopulationStats;
  /** Zone demand, 0–100 per zone. */
  demand: Demand;
  taxRates: Record<TaxKind, number>;
  inDebt: boolean;
  /** Projected net per day (₺). */
  dailyNet: number;
  /** Buses bought and the bus depots' room for them (optional). */
  buses?: { bought: number; depotCapacity: number };
}

const n = (v: number) => Math.round(v).toLocaleString('tr-TR');
const pct = (v: number) => `%${Math.round(v * 100)}`;
const ORDER: Record<AdviceLevel, number> = { high: 0, medium: 1, low: 2 };

export function cityAdvice(c: AdviceContext): Advice[] {
  const s = c.stats;
  const out: Advice[] = [];
  const add = (a: Advice) => out.push(a);
  const pop = s.total;

  if (s.problems.power > 0) add({ id: 'power', level: 'high', advisor: 'Altyapı', title: 'Elektriksiz binalar', text: 'Bir santral (ör. rüzgâr türbini) kurun ve elektrik hattıyla binalara bağlayın. Elektriksiz binalar zamanla terk edilir.', metric: `${n(s.problems.power)} bina elektriksiz`, tool: 'power' });
  if (s.problems.water > 0) add({ id: 'water', level: 'high', advisor: 'Altyapı', title: 'Susuz binalar', text: 'Kıyıya su pompası ya da bir su kulesi kurun, borularla binalara ulaştırın.', metric: `${n(s.problems.water)} bina susuz`, tool: 'water' });
  if (s.problems.sewage > 0) add({ id: 'sewage', level: 'medium', advisor: 'Altyapı', title: 'Atık su gitmiyor', text: 'Atık su tesisi kurup boru ağına bağlayın.', metric: `${n(s.problems.sewage)} bina atık susuz`, tool: 'water' });
  if (s.problems.burning > 0) add({ id: 'fire', level: 'high', advisor: 'Güvenlik', title: 'Yangın var', text: 'İtfaiye kapsaması olmayan yerlerde yangın büyür. İtfaiye istasyonu kurun.', metric: `${n(s.problems.burning)} bina yanıyor`, tool: 'services' });
  if (s.problems.garbage > 0) add({ id: 'garbage', level: 'medium', advisor: 'Altyapı', title: 'Çöp toplanmıyor', text: 'Çöp toplama merkezi kurun; toplanmayan çöp arazi değerini düşürür.', metric: `${n(s.problems.garbage)} bina`, tool: 'services' });

  if (pop >= 50 && s.unemploymentRate > 0.1) add({ id: 'jobs', level: 'high', advisor: 'Ekonomi', title: 'İşsizlik yüksek', text: 'Ticaret, ofis ya da sanayi bölgesi açın; işsiz sakinler şehirden taşınır.', metric: `${n(s.unemployed)} işsiz (${pct(s.unemploymentRate)})`, tool: 'zone' });
  const vacancies = s.vacancies.reduce((a, b) => a + b, 0);
  if (pop >= 50 && vacancies > 40 && s.unemploymentRate < 0.04) add({ id: 'workers', level: 'medium', advisor: 'Ekonomi', title: 'İşyerleri çalışan bulamıyor', text: 'Konut bölgesi açın ya da eğitim binaları kurun (boş işlerin bir kısmı eğitim istiyor).', metric: `${n(vacancies)} boş iş`, tool: 'zone' });
  if (c.demand.residential > 60 && s.vacantHomes < 5) add({ id: 'housing', level: 'medium', advisor: 'İmar', title: 'Konut talebi yüksek', text: 'Yeni konut bölgesi açın; boş ev yokken kimse taşınamaz.', metric: `talep %${Math.round(c.demand.residential)}, boş ev ${n(s.vacantHomes)}`, tool: 'zone' });
  if (pop >= 100 && c.demand.commercial > 60) add({ id: 'shops', level: 'low', advisor: 'İmar', title: 'Dükkân talebi yüksek', text: 'Ticaret bölgesi açın; sakinler alışveriş edecek yer arıyor.', metric: `talep %${Math.round(c.demand.commercial)}`, tool: 'zone' });
  if (pop >= 100 && c.demand.industrial > 60) add({ id: 'industry', level: 'low', advisor: 'İmar', title: 'Sanayi talebi yüksek', text: 'Konutlardan uzak bir sanayi bölgesi açın.', metric: `talep %${Math.round(c.demand.industrial)}`, tool: 'zone' });
  if (pop >= 300 && c.demand.office > 60) add({ id: 'office', level: 'low', advisor: 'İmar', title: 'Ofis talebi yüksek', text: 'Eğitimli çalışanlar için ofis bölgesi açın.', metric: `talep %${Math.round(c.demand.office)}`, tool: 'zone' });

  if (pop >= 300) {
    const svc: [keyof PopulationStats['coverage'], string, string][] = [
      ['police', 'Güvenlik', 'Polis karakolu'],
      ['fire', 'Güvenlik', 'İtfaiye istasyonu'],
      ['health', 'Sağlık', 'Sağlık ocağı ya da hastane'],
      ['education', 'Eğitim', 'Okul'],
    ];
    for (const [k, advisor, what] of svc) {
      const cov = s.coverage[k];
      if (cov < 0.5) add({ id: `cover-${k}`, level: cov < 0.25 ? 'medium' : 'low', advisor, title: `${what} eksik`, text: `${what} kurun; kapsama dışındaki sakinler daha mutsuz.`, metric: `nüfusun ${pct(1 - cov)}'i kapsama dışında`, tool: 'services' });
    }
  }
  if (pop >= 100 && s.crime > 40) add({ id: 'crime', level: 'medium', advisor: 'Güvenlik', title: 'Suç artıyor', text: 'Polis kapsamasını genişletin; işsizlik de suçu artırır.', metric: `suç ${n(s.crime)}/100`, tool: 'services' });
  if (pop >= 100 && s.health < 45) add({ id: 'health', level: 'medium', advisor: 'Sağlık', title: 'Halk sağlığı kötü', text: 'Sağlık hizmeti kurun, kirliliği konutlardan uzak tutun.', metric: `sağlık ${n(s.health)}/100`, tool: 'services' });
  if (pop >= 100 && s.traffic.congestion > 0.45) add({ id: 'traffic', level: 'medium', advisor: 'Ulaşım', title: 'Trafik sıkışık', text: 'Yoğun kavşaklara lamba ya da döner kavşak kurun, ana akslar için daha geniş yollar yapın.', metric: `yoğunluk ${pct(s.traffic.congestion)}`, tool: 'traffic' });
  if (pop >= 100 && s.noise > 45) add({ id: 'noise', level: 'low', advisor: 'Sağlık', title: 'Gürültü yüksek', text: 'Sanayiyi ve geniş yolları konutlardan uzaklaştırın; parklar gürültüyü azaltmaz ama mutluluğu artırır.', metric: `gürültü ${n(s.noise)}/100`, tool: 'zone' });
  if (c.buses && c.buses.bought > c.buses.depotCapacity) add({ id: 'depot', level: 'medium', advisor: 'Ulaşım', title: c.buses.depotCapacity === 0 ? 'Otobüs garajı yok' : 'Otobüs garajları dolu', text: 'Otobüsler yalnız garajda yeri olunca çalışır. Toplu taşıma aracından bir otobüs garajı kurun.', metric: `${n(c.buses.bought)} otobüs, garajlarda ${n(c.buses.depotCapacity)} yer`, tool: 'transit' });
  if (s.abandoned > 0) add({ id: 'abandoned', level: 'medium', advisor: 'İmar', title: 'Terk edilmiş binalar', text: 'Binaların yol erişimi, elektrik ve suyu olduğundan emin olun; terk edilen binalar bir süre sonra yıkılır.', metric: `${n(s.abandoned)} bina`, tool: 'select' });

  if (c.inDebt) add({ id: 'debt', level: 'high', advisor: 'Bütçe', title: 'Kasa eksiye düştü', text: 'Vergileri artırın, gereksiz binaları yıkın ya da Bütçe sekmesinden kredi alın.', metric: `günlük net ${c.dailyNet >= 0 ? '+' : ''}${n(c.dailyNet)} ₺` });
  else if (c.dailyNet < 0 && pop >= 50) add({ id: 'deficit', level: 'medium', advisor: 'Bütçe', title: 'Bütçe açık veriyor', text: 'Giderler gelirleri aşıyor: vergileri biraz artırın ya da bakımı pahalı yapıları gözden geçirin.', metric: `günlük net ${n(c.dailyNet)} ₺` });
  const maxTax = Math.max(c.taxRates.residential, c.taxRates.commercial, c.taxRates.industrial);
  if (pop >= 50 && maxTax >= 14) add({ id: 'tax', level: 'low', advisor: 'Bütçe', title: 'Vergiler yüksek', text: 'Yüksek vergi mutluluğu ve talebi düşürür.', metric: `en yüksek vergi %${maxTax}` });

  if (pop >= 50 && s.happiness < 45) {
    const worst = [...s.happinessFactors].sort((a, b) => a.value - b.value).slice(0, 2).map((f) => f.label.toLocaleLowerCase('tr-TR'));
    add({ id: 'happiness', level: s.happiness < 35 ? 'high' : 'medium', advisor: 'Halkla ilişkiler', title: 'Sakinler mutsuz', text: `Mutluluğu en çok aşağı çekenler: ${worst.join(', ')}.`, metric: `mutluluk ${n(s.happiness)}/100` });
  }
  return out.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}
