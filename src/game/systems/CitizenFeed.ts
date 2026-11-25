import type { PopulationStats } from '../simulation/CitySimulation';
import type { Demand } from '../simulation/Demand';
import type { TaxKind } from '../data/economy';

/**
 * "Kent Sesi": the citizens' social feed. Posts are written only from the
 * city's real state (statistics the simulation computed) — a complaint about
 * power means buildings really are without power, a thank-you means it was
 * fixed. Each topic posts when it starts, repeats every few game days while it
 * lasts, and (for problems) thanks the city once it is solved.
 */

export type PostKind = 'complaint' | 'request' | 'praise' | 'news';

export interface FeedPost {
  id: number;
  /** Game minute it was posted. */
  minute: number;
  kind: PostKind;
  topic: string;
  author: string;
  handle: string;
  /** Avatar colour. */
  color: string;
  text: string;
  /** How many people or buildings the post is about (real counts). */
  affected: string | null;
  /** Where to look (camera), when the topic has a place. */
  focus: { x: number; z: number } | null;
}

export interface FeedContext {
  minute: number;
  stats: PopulationStats;
  /** Zone demand, 0–100 per zone. */
  demand: Demand;
  taxRates: Record<TaxKind, number>;
  inDebt: boolean;
  /** A place that shows the problem of a topic (e.g. a building without power), or null. */
  spot(topic: string): { x: number; z: number } | null;
}

interface Topic {
  id: string;
  kind: PostKind;
  /** Is the condition true now? */
  active(c: FeedContext): boolean;
  texts: string[];
  affected?(c: FeedContext): string | null;
  /** Thank-you posted once when an active problem is solved. */
  solved?: string[];
}

const DAY = 1440;
/** Game days between repeats of a lasting topic. */
const REPEAT_DAYS = 3;
export const FEED_LIMIT = 80;
const MILESTONES = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

const n = (v: number) => Math.round(v).toLocaleString('tr-TR');
const people = (c: FeedContext) => c.stats.total;

const TOPICS: Topic[] = [
  {
    id: 'power',
    kind: 'complaint',
    active: (c) => c.stats.problems.power > 0,
    texts: [
      'Evde elektrik yok! Buzdolabındaki her şey bozulacak. Belediye ne zaman santral kuracak? #elektrik',
      'Akşam oldu, hâlâ mum ışığında oturuyoruz. Elektrik hattı bizim sokağa da gelsin artık.',
      'İşyerimizde elektrik yok, kepenk kapattık. Bu böyle gitmez.',
    ],
    affected: (c) => `${n(c.stats.problems.power)} bina elektriksiz`,
    solved: ['Elektrik geldi! Işıklar yandı, teşekkürler belediye 💡', 'Sonunda elektriğe kavuştuk. Emeği geçenlere teşekkürler.'],
  },
  {
    id: 'water',
    kind: 'complaint',
    active: (c) => c.stats.problems.water > 0,
    texts: [
      'Musluktan su akmıyor. Bulaşıklar birikti, çocuklar banyo yapamıyor. #susuzluk',
      'Su yok! Pompa istasyonu ve boru hattı bekliyoruz.',
      'Komşulardan su taşıyoruz, bu 21. yüzyılda kabul edilemez.',
    ],
    affected: (c) => `${n(c.stats.problems.water)} bina susuz`,
    solved: ['Su geldi! Bir bardak temiz su bu kadar güzel olabilir mi 💧'],
  },
  {
    id: 'sewage',
    kind: 'complaint',
    active: (c) => c.stats.problems.sewage > 0,
    texts: ['Kanalizasyon bağlı değil, koku dayanılmaz halde. Atık su arıtma tesisi şart!', 'Lağım suyu nereye gidiyor kimse bilmiyor. Arıtma istiyoruz.'],
    affected: (c) => `${n(c.stats.problems.sewage)} bina atık susuz`,
    solved: ['Kanalizasyon bağlandı, koku gitti. Sağ olun!'],
  },
  {
    id: 'garbage',
    kind: 'complaint',
    active: (c) => c.stats.problems.garbage > 0,
    texts: ['Çöpler günlerdir toplanmadı, sokak kokuyor. Çöp toplama merkezi nerede?', 'Kapının önünde çöp dağı oluştu. #çöp'],
    affected: (c) => `${n(c.stats.problems.garbage)} bina`,
    solved: ['Çöp kamyonu geldi, sokaklar tertemiz 👏'],
  },
  {
    id: 'fire',
    kind: 'news',
    active: (c) => c.stats.problems.burning > 0,
    texts: ['Mahallede yangın var! Duman her yeri sardı. İtfaiye nerede? 🔥', 'Karşı binada yangın çıktı, herkes sokakta.'],
    affected: (c) => `${n(c.stats.problems.burning)} bina yanıyor`,
    solved: ['Yangın söndü, çok şükür kimse zarar görmedi.'],
  },
  {
    id: 'jobs',
    kind: 'complaint',
    active: (c) => people(c) >= 50 && c.stats.unemploymentRate > 0.1,
    texts: ['Aylardır iş arıyorum, bu şehirde iş yok. Fabrika, dükkân, ofis… ne olursa! #işsizlik', 'Diplomam var ama iş bulamıyorum. Ticaret ve ofis bölgeleri lazım.'],
    affected: (c) => `${n(c.stats.unemployed)} kişi işsiz (%${Math.round(c.stats.unemploymentRate * 100)})`,
    solved: ['Yeni işime başladım! Şehir büyüyor 💼'],
  },
  {
    id: 'workers',
    kind: 'request',
    active: (c) => people(c) >= 50 && c.stats.vacancies.reduce((a, b) => a + b, 0) > 30 && c.stats.unemploymentRate < 0.04,
    texts: ['Dükkânıma eleman arıyorum ama başvuran yok. Şehre daha çok insan gelmeli.', 'Fabrikada vardiyalar boş kalıyor. Konut bölgesi açılsın, işçi lazım!'],
    affected: (c) => `${n(c.stats.vacancies.reduce((a, b) => a + b, 0))} boş iş`,
  },
  {
    id: 'housing',
    kind: 'request',
    active: (c) => people(c) > 0 && c.demand.residential > 60 && c.stats.vacantHomes < 5,
    texts: ['Kiralık ev bulamıyorum, her yer dolu. Yeni konut alanı açılsın lütfen 🏠', 'Kuzenim şehre taşınmak istiyor ama boş ev yok.'],
    affected: (c) => `talep %${Math.round(c.demand.residential)}`,
  },
  {
    id: 'shops',
    kind: 'request',
    active: (c) => people(c) >= 100 && c.demand.commercial > 60,
    texts: ['Ekmek almak için şehrin öbür ucuna gidiyorum. Mahalleye market açılsın!', 'Kafe, lokanta, mağaza… bu şehirde alışveriş yapacak yer yok. #ticaret'],
    affected: (c) => `talep %${Math.round(c.demand.commercial)}`,
  },
  {
    id: 'traffic',
    kind: 'complaint',
    active: (c) => people(c) >= 100 && c.stats.traffic.congestion > 0.45,
    texts: ['Trafik kilit! 10 dakikalık yolu 40 dakikada aldım 🚗🚗🚗', 'Bu kavşak her sabah tıkanıyor. Trafik lambası ya da döner kavşak lazım.', 'Yollar dar, araba çok. Geniş cadde yapılsın.'],
    affected: (c) => `yoğunluk %${Math.round(c.stats.traffic.congestion * 100)}`,
    solved: ['Trafik rahatladı, işe vaktinde yetiştim 🙌'],
  },
  {
    id: 'parking',
    kind: 'complaint',
    active: (c) => people(c) >= 100 && (c.stats.parking?.unmet ?? 0) >= 5,
    texts: [
      'Akşam eve geldim, sokakta park yeri yok. Yarım saat dönüp durdum 🚗',
      'Dükkânın önünde park yeri yok, müşteriler gelip geri dönüyor. Otopark ya da otoparklı sokak lazım.',
      'Arabalar kaldırıma kadar dizilmiş, yürüyecek yer kalmadı.',
    ],
    affected: (c) => `${Math.round(c.stats.parking?.unmet ?? 0)} araç park yeri bulamıyor`,
    solved: ['Sonunda park yeri bulmak kolaylaştı, teşekkürler 🅿️'],
  },
  {
    id: 'commute',
    kind: 'complaint',
    active: (c) => people(c) >= 100 && c.stats.traffic.commuteMinutes > 35,
    texts: ['İşe gidiş-geliş her gün bir saati buluyor. Evlerle iş yerleri çok uzak.'],
    affected: (c) => `ortalama ${Math.round(c.stats.traffic.commuteMinutes)} dk`,
  },
  {
    id: 'police',
    kind: 'request',
    active: (c) => people(c) >= 300 && c.stats.coverage.police < 0.5,
    texts: ['Gece sokakta yürümeye korkuyorum. Mahalleye karakol yapılsın 🚓'],
    affected: (c) => `nüfusun %${Math.round((1 - c.stats.coverage.police) * 100)}'i karakolsuz`,
  },
  {
    id: 'crime',
    kind: 'complaint',
    active: (c) => people(c) >= 100 && c.stats.crime > 40,
    texts: ['Arabamın camını kırdılar! Suç arttı, polis yetersiz.', 'Bu hafta sokağımızda iki hırsızlık oldu.'],
    affected: (c) => `suç ${Math.round(c.stats.crime)}/100`,
    solved: ['Mahalle sakinleşti, devriyeler işe yarıyor 👮'],
  },
  {
    id: 'firedept',
    kind: 'request',
    active: (c) => people(c) >= 300 && c.stats.coverage.fire < 0.5,
    texts: ['Yakınımızda itfaiye yok. Bir yangın çıksa ne olacak?'],
    affected: (c) => `nüfusun %${Math.round((1 - c.stats.coverage.fire) * 100)}'i itfaiyesiz`,
  },
  {
    id: 'health',
    kind: 'request',
    active: (c) => people(c) >= 300 && c.stats.coverage.health < 0.5,
    texts: ['En yakın sağlık ocağı çok uzak. Hastaneye ihtiyacımız var 🏥'],
    affected: (c) => `nüfusun %${Math.round((1 - c.stats.coverage.health) * 100)}'i sağlık hizmetsiz`,
  },
  {
    id: 'sick',
    kind: 'complaint',
    active: (c) => people(c) >= 100 && c.stats.health < 45,
    texts: ['Herkes hasta, kirlilik ve ilgisizlikten bıktık.'],
    affected: (c) => `sağlık ${Math.round(c.stats.health)}/100`,
  },
  {
    id: 'school',
    kind: 'request',
    active: (c) => people(c) >= 300 && c.stats.coverage.education < 0.5,
    texts: ['Çocuğumu okula göndermek için her sabah servis bekliyoruz. Mahalleye okul! 📚'],
    affected: (c) => `nüfusun %${Math.round((1 - c.stats.coverage.education) * 100)}'i okulsuz`,
  },
  {
    id: 'noise',
    kind: 'complaint',
    active: (c) => people(c) >= 100 && c.stats.noise > 45,
    texts: ['Gürültüden uyuyamıyorum. Yol ve fabrikalar evlerin dibinde. 😩'],
    affected: (c) => `gürültü ${Math.round(c.stats.noise)}/100`,
  },
  {
    id: 'abandoned',
    kind: 'complaint',
    active: (c) => c.stats.abandoned > 0,
    texts: ['Sokağımızda terk edilmiş binalar var, camları kırık. Mahalle çöküyor.'],
    affected: (c) => `${n(c.stats.abandoned)} terk edilmiş bina`,
  },
  {
    id: 'taxHigh',
    kind: 'complaint',
    active: (c) => people(c) >= 50 && Math.max(c.taxRates.residential, c.taxRates.commercial, c.taxRates.industrial) >= 14,
    texts: ['Vergiler yine arttı! Maaşın yarısı belediyeye gidiyor. #vergi', 'Bu vergilerle dükkân işletmek imkânsız.'],
    affected: (c) => `en yüksek vergi %${Math.max(c.taxRates.residential, c.taxRates.commercial, c.taxRates.industrial)}`,
    solved: ['Vergiler indi, nefes aldık. Teşekkürler!'],
  },
  {
    id: 'happy',
    kind: 'praise',
    active: (c) => people(c) >= 50 && c.stats.happiness >= 75,
    texts: ['Bu şehirde yaşamak harika! Parklar, okullar, temiz sokaklar 😊 #mutlukent', 'Taşındığıma hiç pişman değilim, komşular da çok iyi.'],
    affected: (c) => `mutluluk ${Math.round(c.stats.happiness)}/100`,
  },
  {
    id: 'unhappy',
    kind: 'complaint',
    active: (c) => people(c) >= 50 && c.stats.happiness < 40,
    texts: ['Bu şehirden taşınmayı düşünüyorum. Hiçbir şey yolunda gitmiyor.', 'Belediyeye mesajım var: bizi dinleyin!'],
    affected: (c) => `mutluluk ${Math.round(c.stats.happiness)}/100`,
  },
  {
    id: 'debt',
    kind: 'news',
    active: (c) => c.inDebt,
    texts: ['Haber: Belediye bütçesi eksiye düştü. Muhalefet "israf" diyor. 📉'],
    affected: () => null,
    solved: ['Haber: Belediye borçtan çıktı, kasa yeniden artıda. 📈'],
  },
];

const FIRST = ['Ayşe', 'Mehmet', 'Zeynep', 'Mustafa', 'Elif', 'Ahmet', 'Fatma', 'Emre', 'Selin', 'Burak', 'Deniz', 'Can', 'Ece', 'Hakan', 'Merve', 'Murat', 'Gizem', 'Oğuz', 'Derya', 'Kerem', 'Leyla', 'Yusuf', 'Seda', 'Tolga', 'Nur', 'Barış', 'İrem', 'Serkan', 'Melis', 'Onur'];
const LAST = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Öztürk', 'Aydın', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özdemir', 'Polat', 'Erdem', 'Güneş'];
const COLORS = ['#e76f51', '#2a9d8f', '#e9c46a', '#264653', '#8a5cf6', '#d1495b', '#00798c', '#edae49', '#3d5a80', '#6a994e'];
const ASCII: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', İ: 'i', ö: 'o', ş: 's', ü: 'u', Ç: 'c', Ğ: 'g', Ö: 'o', Ş: 's', Ü: 'u' };
const ascii = (s: string) => s.replace(/[çğıİöşüÇĞÖŞÜ]/g, (ch) => ASCII[ch] ?? ch).toLowerCase();

interface TopicState {
  active: boolean;
  /** Minute of the last post about it (−∞: never). */
  last: number;
  posts: number;
}

export class CitizenFeed {
  readonly posts: FeedPost[] = [];
  private nextId = 1;
  private readonly state = new Map<string, TopicState>();
  private milestone = 0;
  private rng: number;

  constructor(seed: number) {
    this.rng = (seed >>> 0) || 1;
  }

  private rand(): number {
    // xorshift32
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 4294967296;
  }

  private pick<T>(list: T[]): T {
    return list[Math.floor(this.rand() * list.length)];
  }

  private post(c: FeedContext, kind: PostKind, topic: string, text: string, affected: string | null): FeedPost {
    const first = this.pick(FIRST);
    const last = this.pick(LAST);
    const p: FeedPost = {
      id: this.nextId++,
      minute: c.minute,
      kind,
      topic,
      author: `${first} ${last}`,
      handle: `@${ascii(first)}${ascii(last).slice(0, 3)}${Math.floor(this.rand() * 90 + 10)}`,
      color: this.pick(COLORS),
      text,
      affected,
      focus: c.spot(topic),
    };
    this.posts.unshift(p);
    if (this.posts.length > FEED_LIMIT) this.posts.length = FEED_LIMIT;
    return p;
  }

  /** Reads the city's current state; returns the posts it caused (newest first). */
  update(c: FeedContext): FeedPost[] {
    const made: FeedPost[] = [];
    for (const t of TOPICS) {
      const st = this.state.get(t.id) ?? { active: false, last: -Infinity, posts: 0 };
      const on = t.active(c);
      // New topics wait half a day after the last post about them (no flapping), lasting ones repeat.
      if (on && c.minute - st.last >= (st.active ? REPEAT_DAYS * DAY : DAY / 2)) {
        made.push(this.post(c, t.kind, t.id, t.texts[st.posts % t.texts.length], t.affected ? t.affected(c) : null));
        st.last = c.minute;
        st.posts++;
      } else if (!on && st.active && t.solved && st.posts > 0) {
        made.push(this.post(c, 'praise', t.id, this.pick(t.solved), null));
      }
      st.active = on;
      this.state.set(t.id, st);
    }
    // Population milestones (news), once each.
    const reached = MILESTONES.filter((m) => m > this.milestone && c.stats.total >= m).pop();
    if (reached !== undefined) {
      // Several passed at once: only the highest is news.
      this.milestone = reached;
      made.push(this.post(c, 'news', 'milestone', `Haber: Şehrimizin nüfusu ${n(reached)} kişiyi geçti! 🎉`, `${n(c.stats.total)} kişi`));
    }
    return made;
  }

  /** Marks the milestones already passed (e.g. after loading) so they are not announced again. */
  skipMilestonesBelow(population: number): void {
    for (const m of MILESTONES) if (population >= m) this.milestone = m;
  }
}
