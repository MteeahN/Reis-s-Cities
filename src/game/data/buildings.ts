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
}

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

const STONE = '#e7dfcf';
const STONE_DARK = '#b9b09d';
const ROOF = '#5f6e7d';
const COPPER = '#7fae9c';
const GOLD = '#c9a35a';
const PAVING = '#cbc2ae';
const GREEN = '#5f8f3a';
const WATER = '#4d8fb0';

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
    model: [
      { shape: 'box', size: [22, 1.2, 21], pos: [0, 0, 0], color: STONE_DARK },
      { shape: 'box', size: [19, 9.5, 12], pos: [0, 1.2, -2.5], color: STONE, facade: true },
      { shape: 'box', size: [19.4, 0.8, 12.4], pos: [0, 10.7, -2.5], color: STONE_DARK },
      { shape: 'box', size: [6, 7, 6], pos: [0, 11.5, -2.5], color: STONE, facade: true },
      { shape: 'dome', size: [6.4, 4.2, 6.4], pos: [0, 18.5, -2.5], color: COPPER, segments: 20 },
      { shape: 'cylinder', size: [0.25, 3, 0.25], pos: [0, 22.6, -2.5], color: GOLD },
      { shape: 'box', size: [12, 0.6, 5], pos: [0, 1.2, 6], color: STONE_DARK },
      { shape: 'cylinder', size: [0.9, 7.4, 0.9], pos: [-5, 1.8, 7.6], color: STONE, segments: 10 },
      { shape: 'cylinder', size: [0.9, 7.4, 0.9], pos: [-2.5, 1.8, 7.6], color: STONE, segments: 10 },
      { shape: 'cylinder', size: [0.9, 7.4, 0.9], pos: [0, 1.8, 7.6], color: STONE, segments: 10 },
      { shape: 'cylinder', size: [0.9, 7.4, 0.9], pos: [2.5, 1.8, 7.6], color: STONE, segments: 10 },
      { shape: 'cylinder', size: [0.9, 7.4, 0.9], pos: [5, 1.8, 7.6], color: STONE, segments: 10 },
      { shape: 'box', size: [12.6, 0.9, 5.2], pos: [0, 9.2, 5.9], color: STONE_DARK },
      { shape: 'gable', size: [5.2, 2.4, 12.6], pos: [0, 10.1, 5.9], color: STONE, rot: [0, 90, 0] },
      { shape: 'gable', size: [19.4, 2.2, 12.4], pos: [0, 11.5, -2.5], color: ROOF },
      { shape: 'box', size: [8, 0.3, 3], pos: [0, 1.2, 9.5], color: STONE_DARK },
    ],
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
    model: [
      { shape: 'box', size: [15.6, 0.35, 15.6], pos: [0, 0, 0], color: PAVING },
      { shape: 'cylinder', size: [6.4, 0.7, 6.4], pos: [0, 0.35, 0], color: STONE_DARK, segments: 24 },
      { shape: 'cylinder', size: [5.6, 0.72, 5.6], pos: [0, 0.36, 0], color: WATER, segments: 24 },
      { shape: 'cylinder', size: [0.8, 2.4, 0.8], pos: [0, 0.35, 0], color: STONE, segments: 10 },
      { shape: 'cylinder', size: [2, 0.3, 2], pos: [0, 2.75, 0], color: STONE, segments: 16 },
      { shape: 'box', size: [2, 0.8, 2], pos: [-6, 0.35, -6], color: STONE_DARK },
      { shape: 'dome', size: [1.9, 1.3, 1.9], pos: [-6, 1.15, -6], color: GREEN },
      { shape: 'box', size: [2, 0.8, 2], pos: [6, 0.35, -6], color: STONE_DARK },
      { shape: 'dome', size: [1.9, 1.3, 1.9], pos: [6, 1.15, -6], color: GREEN },
      { shape: 'box', size: [2, 0.8, 2], pos: [-6, 0.35, 6], color: STONE_DARK },
      { shape: 'dome', size: [1.9, 1.3, 1.9], pos: [-6, 1.15, 6], color: GREEN },
      { shape: 'box', size: [2, 0.8, 2], pos: [6, 0.35, 6], color: STONE_DARK },
      { shape: 'dome', size: [1.9, 1.3, 1.9], pos: [6, 1.15, 6], color: GREEN },
      { shape: 'box', size: [3, 0.45, 0.7], pos: [0, 0.35, -5.6], color: '#7a5a3c' },
      { shape: 'box', size: [3, 0.45, 0.7], pos: [-5.6, 0.35, 0], color: '#7a5a3c', rot: [0, 90, 0] },
      { shape: 'box', size: [3, 0.45, 0.7], pos: [5.6, 0.35, 0], color: '#7a5a3c', rot: [0, 90, 0] },
    ],
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
    model: [
      { shape: 'box', size: [6, 1, 6], pos: [0, 0, 0], color: STONE_DARK },
      { shape: 'box', size: [3.8, 15, 3.8], pos: [0, 1, 0], color: '#d9c7a8' },
      { shape: 'box', size: [4.4, 0.6, 4.4], pos: [0, 16, 0], color: STONE_DARK },
      { shape: 'box', size: [4.2, 3.4, 4.2], pos: [0, 16.6, 0], color: '#efe6d2' },
      { shape: 'cylinder', size: [2.6, 0.2, 2.6], pos: [0, 16.9, 2.1], color: '#fbf7ec', rot: [90, 0, 0], segments: 20 },
      { shape: 'cylinder', size: [2.6, 0.2, 2.6], pos: [0, 16.9, -2.1], color: '#fbf7ec', rot: [90, 0, 0], segments: 20 },
      { shape: 'cylinder', size: [2.6, 0.2, 2.6], pos: [2.1, 16.9, 0], color: '#fbf7ec', rot: [0, 0, 90], segments: 20 },
      { shape: 'cylinder', size: [2.6, 0.2, 2.6], pos: [-2.1, 16.9, 0], color: '#fbf7ec', rot: [0, 0, 90], segments: 20 },
      { shape: 'box', size: [4.6, 0.5, 4.6], pos: [0, 20, 0], color: STONE_DARK },
      { shape: 'pyramid', size: [4.4, 5, 4.4], pos: [0, 20.5, 0], color: ROOF },
      { shape: 'cylinder', size: [0.18, 1.6, 0.18], pos: [0, 25.5, 0], color: GOLD },
    ],
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
    model: [
      { shape: 'box', size: [7, 0.5, 7], pos: [0, 0, 0], color: PAVING },
      { shape: 'box', size: [5, 0.6, 5], pos: [0, 0.5, 0], color: STONE_DARK },
      { shape: 'box', size: [3.4, 0.7, 3.4], pos: [0, 1.1, 0], color: STONE },
      { shape: 'box', size: [1.6, 9, 1.6], pos: [0, 1.8, 0], color: '#d8d2c4' },
      { shape: 'pyramid', size: [1.6, 1.4, 1.6], pos: [0, 10.8, 0], color: GOLD },
    ],
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
}

/** Builds a growable catalogue entry; its model is generated from the compact spec. */
function zoned(a: TemplateArgs): BuildingDef {
  const occupants = (a.residents ?? 0) + (a.workers ?? 0);
  const category: BuildingCategory =
    a.zone === ZoneType.Residential ? 'residential' : a.zone === ZoneType.Industrial ? 'industrial' : a.spec.style === 'office' ? 'office' : 'commercial';
  return {
    id: a.id,
    name: a.name,
    description: `${a.level}. seviye ${category === 'residential' ? 'konut' : category === 'industrial' ? 'sanayi' : 'ticaret'} binası.`,
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
  };
}

const R = ZoneType.Residential;
const C = ZoneType.Commercial;
const I = ZoneType.Industrial;

export const ZONED_BUILDINGS: readonly BuildingDef[] = [
  // Residential — level 1: detached houses
  zoned({ id: 'res1_house_a', name: 'Müstakil Ev', zone: R, level: 1, residents: 4, spec: { style: 'house', footprint: [1, 1], floors: 1, wall: RES_WALLS[0], accent: '#a89f92', roof: RES_ROOFS[0], ground: 'grass' } }),
  zoned({ id: 'res1_house_b', name: 'İki Katlı Ev', zone: R, level: 1, residents: 5, spec: { style: 'house', footprint: [1, 1], floors: 2, wall: RES_WALLS[2], accent: '#a89f92', roof: RES_ROOFS[2], ground: 'grass', variant: 1 } }),
  zoned({ id: 'res1_house_c', name: 'Bahçeli Ev', zone: R, level: 1, residents: 6, spec: { style: 'house', footprint: [1, 2], floors: 2, wall: RES_WALLS[1], accent: '#a89f92', roof: RES_ROOFS[1], ground: 'grass' } }),
  zoned({ id: 'res1_house_d', name: 'Geniş Müstakil Ev', zone: R, level: 1, residents: 8, spec: { style: 'house', footprint: [2, 2], floors: 2, wall: RES_WALLS[3], accent: '#9a8f80', roof: RES_ROOFS[3], ground: 'grass', variant: 1 } }),
  // Residential — level 2: apartments
  zoned({ id: 'res2_apt_s', name: 'Apartman', zone: R, level: 2, residents: 12, spec: { style: 'apartment', footprint: [1, 1], floors: 3, wall: RES_WALLS[4], accent: '#b3aa9c', roof: '#777', ground: 'grass' } }),
  zoned({ id: 'res2_apt_m', name: 'Apartman', zone: R, level: 2, residents: 24, spec: { style: 'apartment', footprint: [1, 2], floors: 4, wall: RES_WALLS[0], accent: '#a39a8c', roof: '#777', ground: 'grass' } }),
  zoned({ id: 'res2_apt_l', name: 'Site Apartmanı', zone: R, level: 2, residents: 48, spec: { style: 'apartment', footprint: [2, 2], floors: 5, wall: RES_WALLS[2], accent: '#8f9aa3', roof: '#777', ground: 'grass' } }),
  // Residential — level 3: modern housing / towers
  zoned({ id: 'res3_tower_s', name: 'Modern Konut', zone: R, level: 3, residents: 30, spec: { style: 'tower', footprint: [1, 1], floors: 6, wall: '#e9edf0', accent: '#5f6b75', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'res3_tower_m', name: 'Modern Konut', zone: R, level: 3, residents: 60, spec: { style: 'tower', footprint: [1, 2], floors: 9, wall: '#dfe6ea', accent: '#4d5a64', roof: '#777', ground: 'paving', variant: 1 } }),
  zoned({ id: 'res3_tower_l', name: 'Konut Kulesi', zone: R, level: 3, residents: 120, spec: { style: 'tower', footprint: [2, 2], floors: 14, wall: '#eef1f3', accent: '#3f4b55', roof: '#777', ground: 'paving', variant: 1 } }),

  // Commercial — level 1: shops & markets
  zoned({ id: 'com1_shop', name: 'Bakkal', zone: C, level: 1, workers: 4, spec: { style: 'shop', footprint: [1, 1], floors: 1, wall: '#efe7da', accent: COM_ACCENTS[0], roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com1_store', name: 'Mağaza', zone: C, level: 1, workers: 8, spec: { style: 'shop', footprint: [1, 2], floors: 2, wall: '#e6e1d8', accent: COM_ACCENTS[1], roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com1_market', name: 'Market', zone: C, level: 1, workers: 14, spec: { style: 'shop', footprint: [2, 2], floors: 1, wall: '#f1ece2', accent: COM_ACCENTS[3], roof: '#777', ground: 'paving' } }),
  // Commercial — level 2: restaurants, larger stores, small offices
  zoned({ id: 'com2_shop', name: 'Restoran', zone: C, level: 2, workers: 10, spec: { style: 'shop', footprint: [1, 1], floors: 3, wall: '#e9dccb', accent: COM_ACCENTS[2], roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com2_office', name: 'Ofis', zone: C, level: 2, workers: 24, spec: { style: 'office', footprint: [1, 2], floors: 4, wall: '#cfdbe4', accent: '#5b6770', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com2_store_l', name: 'Büyük Mağaza', zone: C, level: 2, workers: 36, spec: { style: 'shop', footprint: [2, 2], floors: 3, wall: '#ebe5da', accent: COM_ACCENTS[1], roof: '#777', ground: 'paving' } }),
  // Commercial — level 3: offices and shopping mall
  zoned({ id: 'com3_office_s', name: 'Ofis Binası', zone: C, level: 3, workers: 40, spec: { style: 'office', footprint: [1, 1], floors: 8, wall: '#b9cfdd', accent: '#44515b', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com3_office_m', name: 'Ofis Binası', zone: C, level: 3, workers: 80, spec: { style: 'office', footprint: [1, 2], floors: 10, wall: '#aac4d6', accent: '#3d4a54', roof: '#777', ground: 'paving' } }),
  zoned({ id: 'com3_mall', name: 'Alışveriş Merkezi', zone: C, level: 3, workers: 120, spec: { style: 'mall', footprint: [2, 2], floors: 2, wall: '#e8e2d6', accent: COM_ACCENTS[0], roof: '#777', ground: 'paving' } }),

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

/** Growable templates for a zone/level, optionally restricted to a footprint. */
export function zonedTemplates(zone: ZoneKind, level: number, footprint?: [number, number]): BuildingDef[] {
  return ZONED_BUILDINGS.filter(
    (b) => b.zone === zone && b.level === level && (!footprint || (b.footprint[0] === footprint[0] && b.footprint[1] === footprint[1])),
  );
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
