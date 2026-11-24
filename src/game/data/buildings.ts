/**
 * Data-driven building catalogue. Each entry fully describes a building —
 * gameplay stats and its procedural 3D model (a list of primitive parts) —
 * so adding a building needs no engine code changes.
 *
 * Phase 2 ships player-placed ("plop") civic buildings. Zoned buildings that
 * grow automatically (houses, shops, factories…) are added in Phase 3 with
 * `placement: 'zone'` and per-level models.
 */
import { proceduralParts, type ProceduralSpec } from '../entities/building/ProceduralBuildings';
import { ZoneType, type ZoneKind } from './zones';
import { INFRA_BUILDINGS } from './infrastructure';
import { cityHallModel, clockTowerModel, monumentModel, plazaModel } from './models/landmarks';

export type BuildingCategory = 'residential' | 'commercial' | 'industrial' | 'office' | 'civic' | 'landmark';

export type PartShape = 'box' | 'cylinder' | 'cone' | 'pyramid' | 'gable' | 'hip' | 'dome';

/** Window/cladding style taken from the facade texture atlas. */
export type FacadeStyle = 'residential' | 'office' | 'shop' | 'industrial';

export interface BuildingPart {
  shape: PartShape;
  /** Width (x), height (y), depth (z) in metres. Cylinders/cones/domes use x as diameter. */
  size: [number, number, number];
  /** Base centre position relative to the footprint centre (y = bottom). */
  pos: [number, number, number];
  color: string;
  /** Rotation in degrees. */
  rot?: [number, number, number];
  /** Apply a window facade from the texture atlas (boxes only); `true` = residential windows. */
  facade?: boolean | FacadeStyle;
  segments?: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  description: string;
  category: BuildingCategory;
  placement: 'plop' | 'zone';
  /** Zone this template grows in (zoned buildings only). */
  zone?: ZoneKind;
  /** Development level 1–3 (zoned buildings only). */
  level?: number;
  /** Footprint in cells (x, z) at rotation 0; the front faces +z. */
  footprint: [number, number];
  unique: boolean;
  cost: number;
  /** Weekly upkeep (charged from Phase 4). */
  maintenance: number;
  residents: number;
  workers: number;
  /** kW */
  electricity: number;
  /** m³ / day */
  water: number;
  /** 0–100 */
  pollution: number;
  /** Weekly tax contribution at level 1. */
  taxContribution: number;
  maxLevel: number;
  unlockPopulation: number;
  /** Raises land value around the building (landmarks, civic buildings). */
  landValueEffect?: { amount: number; radius: number };
  /** Toolbar group for player-placed buildings (default: landmark). */
  group?: 'landmark' | 'power' | 'water' | 'service';
  /** Utility production/capacity (power plants, pumps, sewage). */
  utility?: UtilitySpec;
  /** Public service coverage (police, fire, health, education, garbage). */
  service?: ServiceSpec;
  model: BuildingPart[];
  /** Procedural spec of growable buildings (lets the renderer build colour/roof variants). */
  spec?: ProceduralSpec;
  /** Who a growable is built for: 1 modest, 2 middle, 3 wealthy (zoned buildings only). */
  wealth?: Wealth;
}

/** Household wealth a growable is built for. */
export type Wealth = 1 | 2 | 3;

export interface UtilitySpec {
  /** Electricity produced (kW). */
  power?: number;
  /** Fresh water produced (m³/day). */
  water?: number;
  /** Sewage processed (m³/day). */
  sewage?: number;
  /** Must touch a river or lake (pumps, outlets). */
  requiresShore?: boolean;
  /** Ground/water pollution caused around it (0–100), e.g. untreated outlets. */
  waterPollution?: number;
}

export type ServiceKind = 'police' | 'fire' | 'health' | 'education' | 'highEducation' | 'garbage';

export interface ServiceSpec {
  kind: ServiceKind;
  /** Coverage radius in cells. */
  radius: number;
  /** People (residents, or students for schools) it can serve. */
  capacity: number;
}


export const BUILDINGS: readonly BuildingDef[] = [
  {
    id: 'city_hall',
    name: 'Belediye Binası',
    description: 'Şehir yönetiminin merkezi. Her şehirde yalnızca bir tane bulunabilir.',
    category: 'civic',
    placement: 'plop',
    footprint: [3, 3],
    unique: true,
    cost: 6000,
    maintenance: 350,
    residents: 0,
    workers: 30,
    electricity: 40,
    water: 12,
    pollution: 0,
    taxContribution: 0,
    maxLevel: 1,
    unlockPopulation: 0,
    landValueEffect: { amount: 20, radius: 8 },
    model: cityHallModel(),
  },
  {
    id: 'plaza',
    name: 'Kent Meydanı',
    description: 'Fıskiyeli taş meydan. Şehir merkezine karakter katar.',
    category: 'landmark',
    placement: 'plop',
    footprint: [2, 2],
    unique: false,
    cost: 1800,
    maintenance: 120,
    residents: 0,
    workers: 2,
    electricity: 5,
    water: 6,
    pollution: 0,
    taxContribution: 0,
    maxLevel: 1,
    unlockPopulation: 0,
    landValueEffect: { amount: 25, radius: 6 },
    model: plazaModel(),
  },
  {
    id: 'clock_tower',
    name: 'Saat Kulesi',
    description: 'Uzaktan görülebilen tarihi saat kulesi.',
    category: 'landmark',
    placement: 'plop',
    footprint: [1, 1],
    unique: false,
    cost: 2400,
    maintenance: 80,
    residents: 0,
    workers: 1,
    electricity: 3,
    water: 0,
    pollution: 0,
    taxContribution: 0,
    maxLevel: 1,
    unlockPopulation: 0,
    landValueEffect: { amount: 15, radius: 5 },
    model: clockTowerModel(),
  },
  {
    id: 'monument',
    name: 'Cumhuriyet Anıtı',
    description: 'Basamaklı kaide üzerinde dikilitaş.',
    category: 'landmark',
    placement: 'plop',
    footprint: [1, 1],
    unique: false,
    cost: 1200,
    maintenance: 50,
    residents: 0,
    workers: 0,
    electricity: 1,
    water: 0,
    pollution: 0,
    taxContribution: 0,
    maxLevel: 1,
    unlockPopulation: 0,
    landValueEffect: { amount: 12, radius: 4 },
    model: monumentModel(),
  },
];

// ---------------------------------------------------------------- zoned (growable) templates

const RES_WALLS = ['#efe3cf', '#e5d2bd', '#dbe5ea', '#f2eee6', '#e7cec3'];
const RES_ROOFS = ['#9c4a3a', '#6b4f3f', '#5c6b7a', '#8a5a44'];
const COM_ACCENTS = ['#d9483b', '#2f7dd1', '#e0a321', '#2fa36b'];
const IND_WALLS = ['#b8b3a7', '#a3a8ad', '#c4b49a'];

interface TemplateArgs {
  id: string;
  name: string;
  zone: ZoneKind;
  level: number;
  spec: ProceduralSpec;
  residents?: number;
  workers?: number;
  pollution?: number;
  /** Default: middle (2). */
  wealth?: Wealth;
  /** Raises land value around it (villas, landmark offices). */
  landValue?: { amount: number; radius: number };
}

/** Builds a growable catalogue entry; its model is generated from the compact spec. */
function zoned(a: TemplateArgs): BuildingDef {
  const occupants = (a.residents ?? 0) + (a.workers ?? 0);
  const category: BuildingCategory =
    a.zone === ZoneType.Residential ? 'residential' : a.zone === ZoneType.Industrial ? 'industrial' : a.zone === ZoneType.Office ? 'office' : 'commercial';
  return {
    id: a.id,
    name: a.name,
    description: `${a.level}. seviye ${({ residential: 'konut', commercial: 'ticaret', industrial: 'sanayi', office: 'ofis' } as Record<string, string>)[category]} binası${a.zone === ZoneType.Residential ? ` (${['', 'mütevazı', 'orta gelirli', 'varlıklı'][a.wealth ?? 2]} haneler)` : ''}.`,
    category,
    placement: 'zone',
    zone: a.zone,
    level: a.level,
    footprint: a.spec.footprint,
    unique: false,
    cost: 0, // built by private developers
    maintenance: 0,
    residents: a.residents ?? 0,
    workers: a.workers ?? 0,
    electricity: Math.round(occupants * (a.zone === ZoneType.Industrial ? 2.5 : 1.2)),
    water: Math.round(occupants * (a.zone === ZoneType.Residential ? 0.25 : 0.15) * 10) / 10,
    pollution: a.pollution ?? 0,
    taxContribution: Math.round((a.residents ?? 0) * 1.5 + (a.workers ?? 0) * 2.5),
    maxLevel: 3,
    unlockPopulation: 0,
    model: proceduralParts(a.spec),
    spec: a.spec,
    wealth: a.wealth ?? 2,
    landValueEffect: a.landValue,
  };
}

export const WEALTH_LABEL: Record<Wealth, string> = { 1: 'Mütevazı', 2: 'Orta', 3: 'Varlıklı' };

/** Storeys a growable rises to (roughly what a passer-by would count). */
export function storeysOf(def: BuildingDef): number {
  const s = def.spec;
  if (!s) return 1;
  if (s.style === 'warehouse' || s.style === 'factory') return 1 + Math.floor(s.floors / 2);
  if (s.style === 'tower') return s.floors + 1;
  // Hotels and casinos: two podium storeys under the tower.
  if (s.style === 'hotel' || s.style === 'casino') return s.floors + 2;
  if (s.style === 'office' && (s.variant ?? 0) % 2 === 0) return Math.ceil(s.floors * 1.25);
  return Math.max(1, s.floors);
}

/** Height limits a district can be zoned with: 0 none, 1 low (≤ 3 storeys), 2 mid-rise (≤ 7). */
export const HEIGHT_LIMITS = [Infinity, 3, 7] as const;
export const HEIGHT_LABEL = ['Sınırsız', 'Alçak (≤ 3 kat)', 'Orta (≤ 7 kat)'] as const;

const R = ZoneType.Residential;
const C = ZoneType.Commercial;
const I = ZoneType.Industrial;
const O = ZoneType.Office;

export const ZONED_BUILDINGS: readonly BuildingDef[] = [
  // Residential — level 1: detached houses
  zoned({ id: 'res1_house_a', name: 'Müstakil Ev', zone: R, level: 1, residents: 4, spec: { style: 'house', footprint: [1, 1], floors: 1, wall: RES_WALLS[0], accent: '#a89f92', roof: RES_ROOFS[0], ground: 'grass' } }),
  zoned({ id: 'res1_house_b', name: 'İki Katlı Ev', zone: R, level: 1, residents: 5, spec: { style: 'house', footprint: [1, 1], floors: 2, wall: RES_WALLS[2], accent: '#a89f92', roof: RES_ROOFS[2], ground: 'grass', variant: 1 } }),
  zoned({ id: 'res1_house_c', name: 'Bahçeli Ev', zone: R, level: 1, residents: 6, spec: { style: 'house', footprint: [1, 2], floors: 2, wall: RES_WALLS[1], accent: '#a89f92', roof: RES_ROOFS[1], ground: 'grass' } }),
  zoned({ id: 'res1_house_d', name: 'Villa', zone: R, level: 1, residents: 8, wealth: 3, landValue: { amount: 4, radius: 3 }, spec: { style: 'house', footprint: [2, 2], floors: 2, wall: RES_WALLS[3], accent: '#9a8f80', roof: RES_ROOFS[3], ground: 'grass', variant: 1 } }),
  // Residential — level 2: apartments
  zoned({ id: 'res2_apt_s', name: 'Apartman', zone: R, level: 2, residents: 12, spec: { style: 'apartment', footprint: [1, 1], floors: 3, wall: RES_WALLS[4], accent: '#b3aa9c', roof: '#777', ground: 'grass' } }),
  zoned({ id: 'res2_apt_m', name: 'Apartman', zone: R, level: 2, residents: 24, spec: { style: 'apartment', footprint: [1, 2], floors: 4, wall: RES_WALLS[0], accent: '#a39a8c', roof: '#777', ground: 'grass' } }),
  zoned({ id: 'res2_apt_l', name: 'Site Apartmanı', zone: R, level: 2, residents: 48, wealth: 1, spec: { style: 'apartment', footprint: [2, 2], floors: 5, wall: RES_WALLS[2], accent: '#8f9aa3', roof: '#777', ground: 'grass' } }),
  // Residential — level 3: modern housing / towers
  zoned({ id: 'res3_tower_s', name: 'Modern Konut', zone: R, level: 3, residents: 30, spec: { style: 'tower', footprint: [1, 1], floors: 6, wall: '#e9edf0', accent: '#5f6b75', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'res3_tower_m', name: 'Modern Konut', zone: R, level: 3, residents: 60, spec: { style: 'tower', footprint: [1, 2], floors: 9, wall: '#dfe6ea', accent: '#4d5a64', roof: '#777', ground: 'paving', variant: 1 } }),
  // Residential — more kinds: terraces, perimeter blocks, villas and social housing.
  zoned({ id: 'res1_row', name: 'Sıra Evler', zone: R, level: 1, residents: 9, wealth: 1, spec: { style: 'rowhouse', footprint: [2, 1], floors: 2, wall: '#e3b49a', accent: '#efe9dc', roof: '#6b4f3f', ground: 'grass' } }),
  zoned({ id: 'res1_row_deep', name: 'Bahçeli Sıra Evler', zone: R, level: 1, residents: 10, spec: { style: 'rowhouse', footprint: [2, 2], floors: 2, wall: '#efe3c4', accent: '#a89f92', roof: '#5c6b7a', ground: 'grass', variant: 1 } }),
  zoned({ id: 'res1_cottage', name: 'Tek Katlı Ev', zone: R, level: 1, residents: 3, wealth: 1, spec: { style: 'house', footprint: [1, 1], floors: 1, wall: '#e7cec3', accent: '#9a8f80', roof: '#8a5a44', ground: 'grass', variant: 3 } }),
  zoned({ id: 'res2_row', name: 'Kent Evleri', zone: R, level: 2, residents: 16, spec: { style: 'rowhouse', footprint: [2, 1], floors: 3, wall: '#d9b38c', accent: '#efe9dc', roof: '#3f4448', ground: 'grass', variant: 2 } }),
  zoned({ id: 'res2_row_deep', name: 'Kent Evleri', zone: R, level: 2, residents: 18, spec: { style: 'rowhouse', footprint: [2, 2], floors: 3, wall: '#c98a6a', accent: '#efe9dc', roof: '#6b4f3f', ground: 'grass', variant: 4 } }),
  zoned({ id: 'res2_court', name: 'Avlulu Blok', zone: R, level: 2, residents: 44, spec: { style: 'courtyard', footprint: [2, 2], floors: 3, wall: '#e8d8c8', accent: '#9c8574', roof: '#6b4f3f', ground: 'grass' } }),
  zoned({ id: 'res2_mansion', name: 'Konak', zone: R, level: 2, residents: 10, wealth: 3, landValue: { amount: 6, radius: 3 }, spec: { style: 'house', footprint: [2, 2], floors: 3, wall: '#f2eee6', accent: '#8c7b6b', roof: '#5c6b7a', ground: 'grass', variant: 2 } }),
  zoned({ id: 'res2_villa', name: 'Bahçeli Villa', zone: R, level: 2, residents: 6, wealth: 3, landValue: { amount: 4, radius: 2 }, spec: { style: 'house', footprint: [1, 2], floors: 2, wall: '#efe3cf', accent: '#c2b8a8', roof: '#3f4448', ground: 'grass', variant: 5 } }),
  zoned({ id: 'res2_lodge', name: 'Lojman', zone: R, level: 2, residents: 16, wealth: 1, spec: { style: 'apartment', footprint: [1, 1], floors: 4, wall: '#cfd6cf', accent: '#7d8a7a', roof: '#777', ground: 'grass', variant: 1 } }),
  zoned({ id: 'res3_row', name: 'Lüks Kent Evleri', zone: R, level: 3, residents: 18, wealth: 3, landValue: { amount: 5, radius: 3 }, spec: { style: 'rowhouse', footprint: [2, 1], floors: 3, wall: '#efe9dc', accent: '#8c7b6b', roof: '#5c6b7a', ground: 'grass', variant: 5 } }),
  zoned({ id: 'res3_row_deep', name: 'Lüks Kent Evleri', zone: R, level: 3, residents: 22, wealth: 3, landValue: { amount: 5, radius: 3 }, spec: { style: 'rowhouse', footprint: [2, 2], floors: 3, wall: '#e8d8c8', accent: '#a89f92', roof: '#3f4448', ground: 'grass', variant: 3 } }),
  zoned({ id: 'res3_court', name: 'Büyük Avlulu Blok', zone: R, level: 3, residents: 80, spec: { style: 'courtyard', footprint: [2, 2], floors: 6, wall: '#d8c3a8', accent: '#b3aa9c', roof: '#5c6b7a', ground: 'grass', variant: 1 } }),
  zoned({ id: 'res3_estate', name: 'Toplu Konut Bloğu', zone: R, level: 3, residents: 140, wealth: 1, spec: { style: 'apartment', footprint: [2, 2], floors: 10, wall: '#c9cfd6', accent: '#8f9aa3', roof: '#777', ground: 'grass', variant: 2 } }),
  zoned({ id: 'res3_mansion', name: 'Malikâne', zone: R, level: 3, residents: 12, wealth: 3, landValue: { amount: 8, radius: 4 }, spec: { style: 'house', footprint: [2, 2], floors: 3, wall: '#efe9dc', accent: '#b0a493', roof: '#3f4448', ground: 'grass', variant: 4 } }),
  zoned({ id: 'res3_villa', name: 'Modern Villa', zone: R, level: 3, residents: 7, wealth: 3, landValue: { amount: 5, radius: 2 }, spec: { style: 'house', footprint: [1, 2], floors: 2, wall: '#f2eee6', accent: '#5f6b75', roof: '#3f4448', ground: 'grass', variant: 11 } }),
  zoned({ id: 'res3_lowrise', name: 'Bahçe Apartmanı', zone: R, level: 3, residents: 18, spec: { style: 'apartment', footprint: [1, 1], floors: 3, wall: '#e8d8c8', accent: '#b07a5e', roof: '#777', ground: 'grass', variant: 4 } }),
  zoned({ id: 'res3_lowrise_m', name: 'Bahçe Apartmanı', zone: R, level: 3, residents: 30, spec: { style: 'apartment', footprint: [1, 2], floors: 3, wall: '#d8c3a8', accent: '#9c8574', roof: '#777', ground: 'grass', variant: 6 } }),
  zoned({ id: 'res3_tower_l', name: 'Rezidans Kulesi', zone: R, level: 3, residents: 120, wealth: 3, spec: { style: 'tower', footprint: [2, 2], floors: 14, wall: '#eef1f3', accent: '#3f4b55', roof: '#777', ground: 'paving', variant: 1 } }),

  // Commercial — level 1: shops & markets
  zoned({ id: 'com1_shop', name: 'Bakkal', zone: C, level: 1, workers: 4, spec: { style: 'shop', footprint: [1, 1], floors: 1, wall: '#efe7da', accent: COM_ACCENTS[0], roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com1_store', name: 'Mağaza', zone: C, level: 1, workers: 8, spec: { style: 'shop', footprint: [1, 2], floors: 2, wall: '#e6e1d8', accent: COM_ACCENTS[1], roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com1_market', name: 'Market', zone: C, level: 1, workers: 14, spec: { style: 'shop', footprint: [2, 2], floors: 1, wall: '#f1ece2', accent: COM_ACCENTS[3], roof: '#777', ground: 'paving' } }),
  // Commercial — level 2: restaurants, larger stores, small offices
  zoned({ id: 'com2_shop', name: 'Restoran', zone: C, level: 2, workers: 10, spec: { style: 'shop', footprint: [1, 1], floors: 3, wall: '#e9dccb', accent: COM_ACCENTS[2], roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com2_office', name: 'Büro Binası', zone: O, level: 2, workers: 24, spec: { style: 'office', footprint: [1, 2], floors: 4, wall: '#cfdbe4', accent: '#5b6770', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com2_store_l', name: 'Büyük Mağaza', zone: C, level: 2, workers: 36, spec: { style: 'shop', footprint: [2, 2], floors: 3, wall: '#ebe5da', accent: COM_ACCENTS[1], roof: '#777', ground: 'paving' } }),
  // Commercial — level 3: offices and shopping mall
  zoned({ id: 'com3_office_s', name: 'Ofis Binası', zone: O, level: 3, workers: 40, spec: { style: 'office', footprint: [1, 1], floors: 8, wall: '#b9cfdd', accent: '#44515b', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com3_office_m', name: 'İş Merkezi', zone: O, level: 3, workers: 80, spec: { style: 'office', footprint: [1, 2], floors: 10, wall: '#aac4d6', accent: '#3d4a54', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com1_row', name: 'Dükkân Sırası', zone: C, level: 1, workers: 10, spec: { style: 'shop', footprint: [2, 1], floors: 1, wall: '#e9dccb', accent: COM_ACCENTS[3], roof: '#777', ground: 'paving', variant: 3 } }),
  zoned({ id: 'com1_cafe', name: 'Kafe', zone: C, level: 1, workers: 5, spec: { style: 'shop', footprint: [1, 1], floors: 1, wall: '#f1ece2', accent: COM_ACCENTS[2], roof: '#777', ground: 'paving', variant: 6 } }),
  zoned({ id: 'com2_row', name: 'Çarşı Sırası', zone: C, level: 2, workers: 20, spec: { style: 'shop', footprint: [2, 1], floors: 2, wall: '#efe7da', accent: COM_ACCENTS[0], roof: '#777', ground: 'paving', variant: 1 } }),
  zoned({ id: 'com2_bistro', name: 'Lokanta', zone: C, level: 2, workers: 18, spec: { style: 'shop', footprint: [1, 2], floors: 2, wall: '#e2d1bd', accent: COM_ACCENTS[2], roof: '#777', ground: 'paving', variant: 4 } }),
  zoned({ id: 'com3_boutique', name: 'Butik Mağaza', zone: C, level: 3, workers: 16, spec: { style: 'shop', footprint: [1, 1], floors: 4, wall: '#dde3e6', accent: '#8a4fc2', roof: '#777', ground: 'paving', variant: 5 } }),
  zoned({ id: 'com3_arcade', name: 'Pasajlı Çarşı', zone: C, level: 3, workers: 44, spec: { style: 'shop', footprint: [1, 2], floors: 5, wall: '#e9dccb', accent: COM_ACCENTS[1], roof: '#777', ground: 'paving', variant: 2 } }),
  zoned({ id: 'com3_row', name: 'Mağazalar Caddesi', zone: C, level: 3, workers: 36, spec: { style: 'shop', footprint: [2, 1], floors: 4, wall: '#d6dccd', accent: '#1f8f8f', roof: '#777', ground: 'paving', variant: 7 } }),
  // Commercial — level 3: high-rise hotels and casinos.
  zoned({ id: 'com3_hotel_s', name: 'Butik Otel', zone: C, level: 3, workers: 40, spec: { style: 'hotel', footprint: [1, 2], floors: 10, wall: '#f2efe8', accent: '#2f4a5a', roof: '#777', ground: 'paving', variant: 1 } }),
  zoned({ id: 'com3_hotel', name: 'Otel', zone: C, level: 3, workers: 110, landValue: { amount: 4, radius: 4 }, spec: { style: 'hotel', footprint: [2, 2], floors: 16, wall: '#e9e2d4', accent: '#7a2a2a', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com3_hotel_l', name: 'Lüks Otel Kulesi', zone: C, level: 3, workers: 160, landValue: { amount: 6, radius: 5 }, spec: { style: 'hotel', footprint: [2, 2], floors: 24, wall: '#e3e8ec', accent: '#3f4448', roof: '#777', ground: 'paving', variant: 3 } }),
  zoned({ id: 'com3_casino', name: 'Kumarhane', zone: C, level: 3, workers: 150, spec: { style: 'casino', footprint: [2, 2], floors: 12, wall: '#f4ead8', accent: '#b3261e', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com3_casino_l', name: 'Kumarhane Oteli', zone: C, level: 3, workers: 210, spec: { style: 'casino', footprint: [2, 2], floors: 20, wall: '#e8e0f0', accent: '#6a2a8a', roof: '#777', ground: 'paving', variant: 1 } }),
  zoned({ id: 'com3_mall', name: 'Alışveriş Merkezi', zone: C, level: 3, workers: 120, spec: { style: 'mall', footprint: [2, 2], floors: 2, wall: '#e8e2d6', accent: COM_ACCENTS[0], roof: '#777', ground: 'paving' } }),

  // Office — level 1: small practices; level 2: office buildings; level 3: business towers.
  zoned({ id: 'off1_studio', name: 'Stüdyo Ofis', zone: O, level: 1, workers: 10, spec: { style: 'office', footprint: [1, 1], floors: 2, wall: '#d6d2c8', accent: '#6b5f55', roof: '#777', ground: 'paving', variant: 1 } }),
  zoned({ id: 'off1_practice', name: 'Büro', zone: O, level: 1, workers: 18, spec: { style: 'office', footprint: [1, 2], floors: 3, wall: '#c9d2cf', accent: '#5b6770', roof: '#777', ground: 'paving', variant: 3 } }),
  zoned({ id: 'off1_campus', name: 'Teknoloji Atölyesi', zone: O, level: 1, workers: 30, spec: { style: 'office', footprint: [2, 2], floors: 2, wall: '#b8c2c9', accent: '#2f3a44', roof: '#777', ground: 'paving', variant: 5 } }),
  zoned({ id: 'off2_small', name: 'Ofis', zone: O, level: 2, workers: 22, spec: { style: 'office', footprint: [1, 1], floors: 5, wall: '#cfdbe4', accent: '#44515b', roof: '#777', ground: 'paving', variant: 2 } }),
  zoned({ id: 'off2_large', name: 'Ofis Kompleksi', zone: O, level: 2, workers: 70, spec: { style: 'office', footprint: [2, 2], floors: 5, wall: '#aac4d6', accent: '#3d4a54', roof: '#777', ground: 'paving', variant: 1 } }),
  zoned({ id: 'off3_tower', name: 'İş Kulesi', zone: O, level: 3, workers: 220, landValue: { amount: 6, radius: 5 }, spec: { style: 'office', footprint: [2, 2], floors: 16, wall: '#b9cfdd', accent: '#2f3a44', roof: '#777', ground: 'paving', variant: 2 } }),
  zoned({ id: 'off3_lowrise', name: 'Ofis Parkı', zone: O, level: 3, workers: 30, spec: { style: 'office', footprint: [1, 1], floors: 3, wall: '#d6d2c8', accent: '#6b5f55', roof: '#777', ground: 'paving', variant: 3 } }),
  zoned({ id: 'off3_lowrise_m', name: 'Ofis Parkı', zone: O, level: 3, workers: 48, spec: { style: 'office', footprint: [1, 2], floors: 3, wall: '#c9d2cf', accent: '#44515b', roof: '#777', ground: 'paving', variant: 5 } }),
  zoned({ id: 'off3_lowrise_l', name: 'Kampüs Ofis', zone: O, level: 3, workers: 90, spec: { style: 'office', footprint: [2, 2], floors: 3, wall: '#b8c2c9', accent: '#2f3a44', roof: '#777', ground: 'paving', variant: 1 } }),

  // Industrial — level 1: workshops and warehouses
  zoned({ id: 'ind1_workshop', name: 'Atölye', zone: I, level: 1, workers: 6, pollution: 20, spec: { style: 'warehouse', footprint: [1, 1], floors: 0, wall: IND_WALLS[0], accent: '#777', roof: '#6d7378', ground: 'concrete' } }),
  zoned({ id: 'ind1_depot', name: 'Depo', zone: I, level: 1, workers: 12, pollution: 25, spec: { style: 'warehouse', footprint: [1, 2], floors: 1, wall: IND_WALLS[1], accent: '#777', roof: '#5f666c', ground: 'concrete' } }),
  zoned({ id: 'ind1_logistics', name: 'Lojistik Deposu', zone: I, level: 1, workers: 22, pollution: 30, spec: { style: 'warehouse', footprint: [2, 2], floors: 1, wall: IND_WALLS[2], accent: '#777', roof: '#7a6e5e', ground: 'concrete' } }),
  // Industrial — level 2: factories
  zoned({ id: 'ind2_works', name: 'İmalathane', zone: I, level: 2, workers: 12, pollution: 35, spec: { style: 'warehouse', footprint: [1, 1], floors: 2, wall: IND_WALLS[1], accent: '#777', roof: '#59606a', ground: 'concrete' } }),
  zoned({ id: 'ind2_factory_m', name: 'Fabrika', zone: I, level: 2, workers: 24, pollution: 45, spec: { style: 'factory', footprint: [1, 2], floors: 2, wall: IND_WALLS[0], accent: '#d8d2c6', roof: '#6b6f73', ground: 'concrete' } }),
  zoned({ id: 'ind2_factory_l', name: 'Fabrika', zone: I, level: 2, workers: 40, pollution: 50, spec: { style: 'factory', footprint: [2, 2], floors: 2, wall: IND_WALLS[2], accent: '#d8d2c6', roof: '#6b6f73', ground: 'concrete' } }),
  // Industrial — level 3: large / modern plants
  zoned({ id: 'ind3_plant_s', name: 'Üretim Tesisi', zone: I, level: 3, workers: 20, pollution: 40, spec: { style: 'factory', footprint: [1, 1], floors: 3, wall: '#c9cdd1', accent: '#e4e1da', roof: '#5a5f64', ground: 'concrete' } }),
  zoned({ id: 'ind3_plant_m', name: 'Modern Fabrika', zone: I, level: 3, workers: 40, pollution: 50, spec: { style: 'factory', footprint: [1, 2], floors: 3, wall: '#c5cbd0', accent: '#e4e1da', roof: '#5a5f64', ground: 'concrete' } }),
  zoned({ id: 'ind3_plant_l', name: 'Büyük Fabrika', zone: I, level: 3, workers: 70, pollution: 60, spec: { style: 'factory', footprint: [2, 2], floors: 3, wall: '#bfc5ca', accent: '#e4e1da', roof: '#5a5f64', ground: 'concrete' } }),
];

/** Every building the renderer and lookups know about. */
export const ALL_BUILDINGS: readonly BuildingDef[] = [...BUILDINGS, ...INFRA_BUILDINGS, ...ZONED_BUILDINGS];

/** Player-placed buildings of a toolbar group. */
export const buildingsInGroup = (group: NonNullable<BuildingDef['group']>): BuildingDef[] =>
  [...BUILDINGS, ...INFRA_BUILDINGS].filter((b) => (b.group ?? 'landmark') === group);

const byId = new Map(ALL_BUILDINGS.map((b) => [b.id, b]));

export const getBuilding = (id: string): BuildingDef => {
  const b = byId.get(id);
  if (!b) throw new Error(`Unknown building: ${id}`);
  return b;
};

/**
 * Price (₺) to have a growable built by hand instead of waiting for a
 * developer: per lot cell, rising with level; workplaces cost more.
 */
export function growablePrice(def: BuildingDef): number {
  const cells = def.footprint[0] * def.footprint[1];
  const level = def.level ?? 1;
  const kind = def.zone === ZoneType.Residential ? 1 : def.zone === ZoneType.Commercial ? 1.3 : def.zone === ZoneType.Office ? 1.6 : 1.5;
  return Math.round((400 * cells * (0.5 + level * 0.75) * kind) / 10) * 10;
}

/** What a district asks of the buildings that grow in it. */
export interface DistrictRules {
  /** 0 any, else the wealth buildings are built for (homes only). */
  wealth?: number;
  /** Index into HEIGHT_LIMITS. */
  height?: number;
}

/**
 * Growable templates for a zone/level, optionally restricted to a footprint
 * and to a district's rules. The height limit is strict; the wealth is a
 * preference (other homes are used when none of that wealth fits the lot).
 */
export function zonedTemplates(zone: ZoneKind, level: number, footprint?: [number, number], rules?: DistrictRules): BuildingDef[] {
  const cap = HEIGHT_LIMITS[rules?.height ?? 0] ?? Infinity;
  const all = ZONED_BUILDINGS.filter(
    (b) =>
      b.zone === zone &&
      b.level === level &&
      (!footprint || (b.footprint[0] === footprint[0] && b.footprint[1] === footprint[1])) &&
      storeysOf(b) <= cap,
  );
  const w = rules?.wealth ?? 0;
  if (!w || zone !== ZoneType.Residential) return all;
  const matching = all.filter((b) => b.wealth === w);
  return matching.length ? matching : all;
}

/** Residents (for homes) or job slots (for workplaces). */
export const buildingCapacity = (b: BuildingDef): number => b.residents + b.workers;

export const BUILDING_CATEGORY_LABEL: Record<BuildingCategory, string> = {
  residential: 'Konut',
  commercial: 'Ticaret',
  industrial: 'Sanayi',
  office: 'Ofis',
  civic: 'Belediye',
  landmark: 'Simge yapı',
};
