import { Color } from 'three';
import { GRID_CELLS } from '../core/config';
import { getBuilding, type ServiceKind } from '../data/buildings';
import type { PlacedBuilding } from '../entities/building/BuildingRegistry';
import type { City } from '../systems/City';
import { CELL_SIZE } from '../core/config';
import { DEPOT_ID, WALK } from '../simulation/Transit';

const N = GRID_CELLS;

export type InfoLayerId =
  | 'power'
  | 'water'
  | 'sewage'
  | 'police'
  | 'crime'
  | 'fire'
  | 'health'
  | 'education'
  | 'garbage'
  | 'landValue'
  | 'pollution'
  | 'traffic'
  | 'noise'
  | 'happiness'
  | 'transit';

export interface InfoLayerDef {
  id: InfoLayerId;
  name: string;
  /** Legend entries: colour + label. */
  legend: [string, string][];
}

export const INFO_LAYERS: readonly InfoLayerDef[] = [
  { id: 'power', name: 'Elektrik', legend: [['#ffd23c', 'Şebekede elektrik var'], ['#3fd18a', 'Bina besleniyor'], ['#f05a50', 'Bina elektriksiz']] },
  { id: 'water', name: 'Su', legend: [['#1f5fd0', 'Su borusu'], ['#4aa3ff', 'Su hizmet alanı'], ['#f05a50', 'Bina susuz']] },
  { id: 'sewage', name: 'Kanalizasyon', legend: [['#1f5fd0', 'Boru'], ['#a67c45', 'Kanalizasyon alanı'], ['#f05a50', 'Atık su toplanmıyor']] },
  { id: 'police', name: 'Polis', legend: [['#3fd18a', 'İyi kapsama'], ['#f05a50', 'Kapsama yok']] },
  { id: 'crime', name: 'Suç oranı', legend: [['#3fd18a', 'Düşük'], ['#f05a50', 'Yüksek']] },
  { id: 'fire', name: 'İtfaiye', legend: [['#3fd18a', 'İyi kapsama'], ['#f05a50', 'Kapsama yok']] },
  { id: 'health', name: 'Sağlık', legend: [['#3fd18a', 'Hastane kapsaması / sağlıklı sakinler'], ['#f05a50', 'Kapsama yok / hasta sakinler']] },
  { id: 'education', name: 'Eğitim', legend: [['#3fd18a', 'Okul kapsaması / eğitimli sakinler'], ['#f05a50', 'Kapsama yok / eğitimsiz sakinler']] },
  { id: 'garbage', name: 'Çöp', legend: [['#3fd18a', 'Toplanıyor'], ['#f05a50', 'Toplanmıyor']] },
  { id: 'landValue', name: 'Arazi değeri', legend: [['#f05a50', 'Düşük'], ['#ffd23c', 'Orta'], ['#3fd18a', 'Yüksek']] },
  { id: 'pollution', name: 'Kirlilik', legend: [['#3fd18a', 'Temiz'], ['#8a4fd0', 'Kirli (sanayi, egzoz, atık su)']] },
  { id: 'traffic', name: 'Trafik yoğunluğu', legend: [['#3fd18a', 'Akıcı'], ['#ffd23c', 'Yoğun'], ['#f05a50', 'Kapasite aşıldı'], ['#8e1f1f', 'Tıkalı']] },
  { id: 'noise', name: 'Gürültü', legend: [['#3fd18a', 'Sessiz'], ['#ff8a3c', 'Gürültülü (trafik, sanayi)']] },
  { id: 'transit', name: 'Toplu taşıma', legend: [['#2f7dd1', 'Çalışan hattın durağına yürüme mesafesi'], ['#8a8f96', 'Hatsız / otobüssüz durak çevresi'], ['#3fd18a', 'Otobüse binen haneler']] },
  { id: 'happiness', name: 'Mutluluk', legend: [['#f05a50', 'Mutsuz'], ['#ffd23c', 'Orta'], ['#3fd18a', 'Mutlu']] },
];

const BAD = [240, 90, 80];
const MID = [255, 210, 60];
const GOOD = [63, 209, 138];

/** Red → yellow → green for t in 0..1. */
function ramp(t: number, out: number[]): number[] {
  const x = Math.max(0, Math.min(1, t));
  const [a, b, f] = x < 0.5 ? [BAD, MID, x * 2] : [MID, GOOD, (x - 0.5) * 2];
  out[0] = a[0] + (b[0] - a[0]) * f;
  out[1] = a[1] + (b[1] - a[1]) * f;
  out[2] = a[2] + (b[2] - a[2]) * f;
  return out;
}

const COVERAGE: Partial<Record<InfoLayerId, ServiceKind[]>> = {
  police: ['police'],
  fire: ['fire'],
  health: ['health'],
  education: ['education', 'highEducation'],
  garbage: ['garbage'],
};

/** Fills `out` (RGBA per cell) for the layer; alpha 0 means "show terrain". */
export function paintLayer(layer: InfoLayerId, city: City, out: Uint8Array): void {
  out.fill(0);
  const u = city.utilities;
  const relevant = (k: number) => city.zones.zoneable[k] > 0 || city.occupancy.building[k] !== 0;
  const c = [0, 0, 0];
  const set = (k: number, r: number, g: number, b: number, a: number) => {
    const o = k * 4;
    out[o] = r;
    out[o + 1] = g;
    out[o + 2] = b;
    out[o + 3] = a;
  };
  if (layer === 'power') {
    for (let k = 0; k < N * N; k++) {
      if (city.powerLines.cells[k] > 0) set(k, 255, 225, 90, 235);
      else if (u.poweredCells[k]) set(k, 255, 210, 60, 110);
    }
    return;
  }
  if (layer === 'water' || layer === 'sewage') {
    const area = layer === 'water' ? u.waterCells : u.sewageCells;
    const [r, g, b] = layer === 'water' ? [74, 163, 255] : [166, 124, 69];
    for (let k = 0; k < N * N; k++) {
      if (city.pipes.cells[k] > 0) set(k, 31, 95, 208, 240);
      else if (area[k]) set(k, r, g, b, 110);
    }
    return;
  }
  const kinds = COVERAGE[layer];
  if (kinds) {
    for (let k = 0; k < N * N; k++) {
      let v = 0;
      for (const s of kinds) v = Math.max(v, city.services.fields[s][k]);
      if (v <= 0 && !relevant(k)) continue;
      ramp(v, c);
      set(k, c[0], c[1], c[2], v > 0 ? 90 + v * 70 : 90);
    }
    return;
  }
  if (layer === 'crime') {
    for (let k = 0; k < N * N; k++) {
      if (!relevant(k)) continue;
      ramp(1 - city.services.crime[k] / 60, c);
      set(k, c[0], c[1], c[2], 140);
    }
    return;
  }
  if (layer === 'landValue') {
    for (let k = 0; k < N * N; k++) {
      if (!relevant(k)) continue;
      ramp(city.landValue.value[k] / 80, c);
      set(k, c[0], c[1], c[2], 150);
    }
    return;
  }
  if (layer === 'pollution') {
    for (let k = 0; k < N * N; k++) {
      const p = city.landValue.pollution[k];
      if (p < 3) continue;
      set(k, 138, 79, 208, Math.min(220, 40 + p * 2.2));
    }
    return;
  }
  if (layer === 'noise') {
    for (let k = 0; k < N * N; k++) {
      const p = city.landValue.noise[k];
      if (p < 3) continue;
      set(k, 255, 138, 60, Math.min(220, 40 + p * 2.6));
    }
  }
  if (layer === 'transit') {
    // Walking circles around stops: blue where a running line serves the stop.
    const t = city.transit;
    const served = new Set<number>();
    for (const l of t.lines.values()) if (t.route(l).ok && t.running(l) > 0) for (const s of l.stops) served.add(s);
    const r = Math.ceil(WALK / CELL_SIZE);
    for (const s of t.stops.values()) {
      const ci = Math.floor(s.x / CELL_SIZE);
      const cj = Math.floor(s.z / CELL_SIZE);
      const on = served.has(s.id);
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const d = Math.hypot((i + 0.5) * CELL_SIZE - s.x, (j + 0.5) * CELL_SIZE - s.z);
          if (d > WALK) continue;
          const k = j * N + i;
          const a = Math.round(70 + 90 * (1 - d / WALK));
          if (on) {
            const prev = out[k * 4] === 47 ? out[k * 4 + 3] : 0;
            set(k, 47, 125, 209, Math.max(a, prev));
          } else if (out[k * 4 + 3] === 0) set(k, 138, 143, 150, 90);
        }
      }
    }
    return;
  }
  // traffic: strips over the roads (TrafficOverlay); happiness: buildings only.
}

const tmp = new Color();
const NEUTRAL = new Color(0x8a8f96);
const rgb = (a: number[]) => tmp.setRGB(a[0] / 255, a[1] / 255, a[2] / 255, 'srgb');

/** Building tint for the layer (null keeps the normal look). */
export function buildingLayerColor(layer: InfoLayerId, b: PlacedBuilding, city: City): Color {
  const def = getBuilding(b.defId);
  const u = city.utilities;
  const c = [0, 0, 0];
  if (b.state === 'abandoned') return NEUTRAL;
  switch (layer) {
    case 'power':
      if (def.utility?.power) return rgb(MID);
      if (def.electricity <= 0 || b.state !== 'active') return NEUTRAL;
      return rgb(u.power.has(b.id) ? GOOD : BAD);
    case 'water':
      if (def.utility?.water) return tmp.set(0x4aa3ff);
      if (def.water <= 0 || def.utility || b.state !== 'active') return NEUTRAL;
      return u.water.has(b.id) ? tmp.set(0x4aa3ff) : rgb(BAD);
    case 'sewage':
      if (def.utility?.sewage) return tmp.set(0xa67c45);
      if (def.water <= 0 || def.utility || b.state !== 'active') return NEUTRAL;
      return u.sewage.has(b.id) ? tmp.set(0xa67c45) : rgb(BAD);
    case 'crime':
      return rgb(ramp(1 - city.services.crimeAt(b.cells) / 60, c));
    case 'landValue':
      return rgb(ramp(city.landValue.averageOver(b.cells, city.landValue.value) / 80, c));
    case 'pollution':
      return rgb(ramp(1 - city.landValue.averageOver(b.cells, city.landValue.pollution) / 60, c));
    case 'noise':
      return rgb(ramp(1 - city.landValue.averageOver(b.cells, city.landValue.noise) / 60, c));
    case 'traffic':
      return NEUTRAL;
    case 'transit': {
      if (b.defId === DEPOT_ID) return tmp.set(0xffffff);
      if (b.zone !== 1) return NEUTRAL;
      const sh = city.transit.shareOf(b.id);
      return sh.work + sh.shop > 0 ? rgb(GOOD) : NEUTRAL;
    }
    case 'happiness': {
      const hh = city.population.households.get(b.id);
      if (b.zone !== 1 || !hh) return NEUTRAL;
      return rgb(ramp((hh.happiness - 20) / 60, c));
    }
    case 'health': {
      const hh = city.population.households.get(b.id);
      if (b.zone === 1 && hh) return rgb(ramp((hh.health - 30) / 55, c));
      if (def.service?.kind === 'health') return tmp.set(0xffffff);
      return NEUTRAL;
    }
    case 'education': {
      const hh = city.population.households.get(b.id);
      if (b.zone === 1 && hh) {
        const total = hh.edu[0] + hh.edu[1] + hh.edu[2];
        return rgb(ramp(total > 0 ? (hh.edu[1] * 0.6 + hh.edu[2]) / total : 0, c));
      }
      if (def.service?.kind === 'education' || def.service?.kind === 'highEducation') return tmp.set(0xffffff);
      return NEUTRAL;
    }
    default: {
      const kinds = COVERAGE[layer] ?? [];
      if (def.service && kinds.includes(def.service.kind)) return tmp.set(0xffffff);
      if (!b.zone) return NEUTRAL;
      let v = 0;
      for (const s of kinds) v = Math.max(v, city.services.average(s, b.cells));
      return rgb(ramp(v, c));
    }
  }
}

/** Which layer a tool should show automatically for a building it places. */
export function layerForBuilding(defId: string): InfoLayerId | null {
  const def = getBuilding(defId);
  if (defId === DEPOT_ID) return 'transit';
  if (def.group === 'power') return 'power';
  if (def.group === 'water') return def.utility?.sewage ? 'sewage' : 'water';
  if (def.service) {
    const k = def.service.kind;
    return k === 'highEducation' ? 'education' : (k as InfoLayerId);
  }
  if (def.landValueEffect) return 'landValue';
  return null;
}
