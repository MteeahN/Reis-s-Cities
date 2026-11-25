/**
 * Citizen petitions. Now and then the residents of a real home ask the mayor
 * for something their home really lacks (police, fire or health cover, a
 * school, a bus stop within walking distance). The mayor answers within a
 * day: a promise must be kept within PROMISE_DAYS — checked against the city
 * itself, the same coverage the simulation uses — or it counts as broken.
 * Kept promises build trust, broken ones and refusals cost it; trust is a
 * happiness factor for every household ("Belediyeye güven").
 */

export type PetitionNeed = 'police' | 'fire' | 'health' | 'education' | 'bus';
export type PetitionState = 'open' | 'promised' | 'kept' | 'broken' | 'refused' | 'expired';

export interface Petition {
  id: number;
  buildingId: number;
  need: PetitionNeed;
  x: number;
  z: number;
  author: string;
  text: string;
  /** Game minute it was made. */
  created: number;
  /** Answer by (open) / keep by (promised), game minute. */
  deadline: number;
  state: PetitionState;
  /** When it was settled (kept / broken / refused / expired). */
  settled?: number;
}

export interface PetitionData {
  list: Petition[];
  trust: number;
  nextId: number;
  nextAt: number;
}

/** A home that may petition, and what it lacks. */
export interface PetitionHome {
  id: number;
  x: number;
  z: number;
  residents: number;
  lacks: PetitionNeed[];
}

export interface PetitionWorld {
  homes: PetitionHome[];
  /** Does the building still stand? (Petitions of demolished homes are dropped.) */
  exists(buildingId: number): boolean;
  /** Is the need met at this building now? */
  met(buildingId: number, need: PetitionNeed): boolean;
}

const DAY = 1440;
/** Days to answer a petition. */
export const ANSWER_DAYS = 1;
/** Days to keep a promise. */
export const PROMISE_DAYS = 7;
/** Days between petitions (at least). */
const GAP_DAYS = 2;
/** A town needs this many people before petitions start. */
export const PETITION_MIN_POPULATION = 100;
export const TRUST_LIMIT = 30;
const KEPT = 8;
const BROKEN = -12;
const REFUSED = -3;
const EXPIRED = -2;
/** Happiness per trust point. */
export const TRUST_HAPPINESS = 0.3;
const KEEP_HISTORY = 12;

const NAMES = ['Ayşe', 'Mehmet', 'Fatma', 'Ali', 'Zeynep', 'Mustafa', 'Elif', 'Hasan', 'Emine', 'Hüseyin', 'Selin', 'Burak', 'Derya', 'Kemal', 'Hatice', 'Murat'];
const ROLES = ['Komşu', 'Esnaf', 'Öğretmen', 'Emekli', 'Muhtar', 'Öğrenci', 'Hemşire', 'Şoför'];

export const NEED_TEXT: Record<PetitionNeed, { ask: string; texts: string[] }> = {
  police: { ask: 'evimizin yakınında polis karakolu', texts: ['Gece sokağımızda kimse yok, polis çağırınca çok geç geliyor. Yakına bir karakol istiyoruz.', 'Mahallede hırsızlık arttı. Bir karakol olsa içimiz rahat eder.'] },
  fire: { ask: 'evimizin yakınında itfaiye', texts: ['Yangın çıksa itfaiye bize yetişemez. Yakına bir istasyon şart.', 'Geçen hafta bacadan duman çıktı, itfaiyenin buraya ulaşması uzun sürüyor.'] },
  health: { ask: 'evimizin yakınında sağlık ocağı ya da hastane', texts: ['Çocuk hastalanınca şehrin öbür ucuna gidiyoruz. Yakına bir sağlık ocağı lazım.', 'Yaşlılarımız doktora ulaşamıyor. Mahalleye bir klinik açılsın.'] },
  education: { ask: 'evimizin yakınında okul', texts: ['Çocuklar okula çok uzak, sabahları yollardalar. Mahalleye bir okul istiyoruz.', 'Okul yakında olsa çocuklar yürüyerek gider. Lütfen bir okul açın.'] },
  bus: { ask: 'evimize yürüme mesafesinde otobüs durağı ve hat', texts: ['Arabası olmayan komşular işe gidemiyor. Sokağımıza bir otobüs hattı gelsin.', 'En yakın otobüs durağı çok uzak. Yakına durak ve hat istiyoruz.'] },
};

/** Small deterministic hash → [0, 1). */
function rand(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export class Petitions {
  list: Petition[] = [];
  /** −TRUST_LIMIT … TRUST_LIMIT. */
  trust = 0;
  private nextId = 1;
  private nextAt = DAY * GAP_DAYS;
  /** Bumped on every change. */
  version = 0;

  constructor(public seed = 1) {}

  /** The petition waiting for an answer, if any. */
  get open(): Petition | undefined {
    return this.list.find((p) => p.state === 'open');
  }

  get promised(): Petition[] {
    return this.list.filter((p) => p.state === 'promised');
  }

  /** Happiness term from trust in the mayor. */
  happinessTerm(): number {
    return this.trust * TRUST_HAPPINESS;
  }

  private settle(p: Petition, state: PetitionState, minute: number, delta: number): void {
    p.state = state;
    p.settled = minute;
    this.trust = Math.max(-TRUST_LIMIT, Math.min(TRUST_LIMIT, this.trust + delta));
    this.version++;
  }

  promise(id: number, minute: number): boolean {
    const p = this.list.find((q) => q.id === id && q.state === 'open');
    if (!p) return false;
    p.state = 'promised';
    p.deadline = minute + PROMISE_DAYS * DAY;
    this.version++;
    return true;
  }

  refuse(id: number, minute: number): boolean {
    const p = this.list.find((q) => q.id === id && q.state === 'open');
    if (!p) return false;
    this.settle(p, 'refused', minute, REFUSED);
    return true;
  }

  /**
   * Checks deadlines and kept promises, lets trust drift back towards zero
   * (`days` passed) and, when it is time, raises a new petition from a home
   * that lacks something. Returns petitions whose state changed (for notices).
   */
  update(minute: number, days: number, population: number, world: PetitionWorld): Petition[] {
    const changed: Petition[] = [];
    const before = this.list.length;
    this.list = this.list.filter((p) => (p.state !== 'open' && p.state !== 'promised') || world.exists(p.buildingId));
    if (this.list.length !== before) this.version++;
    for (const p of this.list) {
      if (p.state === 'open' && minute > p.deadline) {
        this.settle(p, 'expired', minute, EXPIRED);
        changed.push(p);
      } else if (p.state === 'promised') {
        if (world.met(p.buildingId, p.need)) {
          this.settle(p, 'kept', minute, KEPT);
          changed.push(p);
        } else if (minute > p.deadline) {
          this.settle(p, 'broken', minute, BROKEN);
          changed.push(p);
        }
      }
    }
    // Memory fades: about 3 % a day.
    if (this.trust !== 0 && days > 0) {
      this.trust *= Math.pow(0.97, days);
      if (Math.abs(this.trust) < 0.05) this.trust = 0;
    }
    if (!this.open && minute >= this.nextAt && population >= PETITION_MIN_POPULATION) {
      const p = this.raise(minute, world);
      if (p) changed.push(p);
      this.nextAt = minute + DAY * (GAP_DAYS + rand(this.seed + minute) * 2);
    }
    // Keep a short history.
    const settled = this.list.filter((p) => p.state !== 'open' && p.state !== 'promised');
    if (settled.length > KEEP_HISTORY) {
      const drop = new Set(settled.slice(0, settled.length - KEEP_HISTORY).map((p) => p.id));
      this.list = this.list.filter((p) => !drop.has(p.id));
    }
    return changed;
  }

  private raise(minute: number, world: PetitionWorld): Petition | null {
    const busy = new Set(this.list.filter((p) => p.state === 'promised').map((p) => `${p.buildingId}:${p.need}`));
    const candidates: { h: PetitionHome; need: PetitionNeed }[] = [];
    for (const h of world.homes) for (const need of h.lacks) if (!busy.has(`${h.id}:${need}`)) candidates.push({ h, need });
    if (candidates.length === 0) return null;
    // Bigger households speak up more often.
    const total = candidates.reduce((s, c) => s + Math.max(1, c.h.residents), 0);
    let r = rand(this.seed * 31 + minute) * total;
    let pick = candidates[0];
    for (const c of candidates) {
      r -= Math.max(1, c.h.residents);
      if (r <= 0) {
        pick = c;
        break;
      }
    }
    const k = Math.floor(rand(this.seed + minute * 7) * 1e6);
    const texts = NEED_TEXT[pick.need].texts;
    const p: Petition = {
      id: this.nextId++,
      buildingId: pick.h.id,
      need: pick.need,
      x: pick.h.x,
      z: pick.h.z,
      author: `${ROLES[k % ROLES.length]} ${NAMES[(k >> 4) % NAMES.length]}`,
      text: texts[(k >> 8) % texts.length],
      created: minute,
      deadline: minute + ANSWER_DAYS * DAY,
      state: 'open',
    };
    this.list.push(p);
    this.version++;
    return p;
  }

  serialize(): PetitionData {
    return { list: this.list.map((p) => ({ ...p })), trust: this.trust, nextId: this.nextId, nextAt: this.nextAt };
  }

  restore(d: PetitionData | undefined): void {
    this.list = [];
    this.trust = 0;
    this.nextId = 1;
    this.nextAt = DAY * GAP_DAYS;
    if (d && typeof d === 'object') {
      const states: PetitionState[] = ['open', 'promised', 'kept', 'broken', 'refused', 'expired'];
      for (const p of Array.isArray(d.list) ? d.list : []) {
        if (!p || !(p.need in NEED_TEXT) || !states.includes(p.state) || !Number.isFinite(p.deadline)) continue;
        this.list.push({ ...p });
      }
      this.trust = Math.max(-TRUST_LIMIT, Math.min(TRUST_LIMIT, Number(d.trust) || 0));
      this.nextId = Math.max(Number(d.nextId) || 1, ...this.list.map((p) => p.id + 1), 1);
      this.nextAt = Number.isFinite(d.nextAt) ? d.nextAt : this.nextAt;
    }
    this.version++;
  }
}
