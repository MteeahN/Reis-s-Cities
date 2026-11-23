import type { BuildingDef, BuildingPart } from './buildings';

/**
 * Infrastructure and public-service buildings (Phase 5). Same data-driven
 * format as the rest of the catalogue: stats + a primitive-part model.
 */

export type LineKind = 'power' | 'pipe';

export interface LineTypeDef {
  kind: LineKind;
  name: string;
  description: string;
  costPerMeter: number;
  /** Weekly upkeep per metre. */
  maintenancePerMeter: number;
}

export const LINE_TYPES: Record<LineKind, LineTypeDef> = {
  power: {
    kind: 'power',
    name: 'Elektrik Hattı',
    description: 'Elektrik şebekesinin ayrı parçalarını birbirine bağlar.',
    costPerMeter: 4,
    maintenancePerMeter: 0.06,
  },
  pipe: {
    kind: 'pipe',
    name: 'Su Borusu',
    description: 'Yeraltı borusu: temiz su dağıtır ve atık suyu toplar. Çevresindeki 5 hücreye hizmet verir.',
    costPerMeter: 5,
    maintenancePerMeter: 0.08,
  },
};

/** Buildings within this many cells of a pipe get water and sewage service. */
export const PIPE_SERVICE_RADIUS = 5;
/** A producer/treatment building connects to pipes within this many cells. */
export const PIPE_CONNECT_RADIUS = 2;

type Infra = Omit<BuildingDef, 'placement' | 'unique' | 'residents' | 'electricity' | 'water' | 'taxContribution' | 'maxLevel' | 'category'> &
  Partial<Pick<BuildingDef, 'unique' | 'category'>>;

const infra = (d: Infra): BuildingDef => ({
  placement: 'plop',
  unique: false,
  residents: 0,
  electricity: 0,
  water: 0,
  taxContribution: 0,
  maxLevel: 1,
  category: 'civic',
  ...d,
});

const CONCRETE = '#a8a397';
const CONCRETE_DARK = '#8b867c';
const WHITE = '#eef0f2';
const GRASS = '#5f9a3e';
const PATH = '#cbbf9f';
const WATER = '#4d8fb0';

const tree = (x: number, z: number, s = 1): BuildingPart[] => [
  { shape: 'cylinder', size: [0.35 * s, 2 * s, 0.35 * s], pos: [x, 0.2, z], color: '#5a4330' },
  { shape: 'dome', size: [2.6 * s, 2.4 * s, 2.6 * s], pos: [x, 1.8 * s, z], color: '#4f8a35' },
];

export const INFRA_BUILDINGS: readonly BuildingDef[] = [
  // ---------------------------------------------------------------- power
  infra({
    id: 'coal_plant',
    name: 'Kömür Santrali',
    description: 'Yüksek kapasiteli ama kirletici elektrik üretimi.',
    group: 'power',
    footprint: [3, 3],
    cost: 12000,
    maintenance: 600,
    workers: 30,
    pollution: 80,
    unlockPopulation: 0,
    utility: { power: 20000 },
    model: [
      { shape: 'box', size: [23.5, 0.3, 23.5], pos: [0, 0, 0], color: CONCRETE },
      { shape: 'box', size: [14, 10, 10], pos: [-3.5, 0.3, -4], color: '#8f8a80', facade: true },
      { shape: 'gable', size: [14.4, 2, 10.4], pos: [-3.5, 10.3, -4], color: '#5d6166' },
      { shape: 'box', size: [6, 16, 7], pos: [6, 0.3, -5], color: '#77736c' },
      { shape: 'cylinder', size: [2.6, 30, 2.6], pos: [7, 0.3, 6], color: '#b5aca0', segments: 14 },
      { shape: 'cylinder', size: [2.8, 1.4, 2.8], pos: [7, 25, 6], color: '#b5472f', segments: 14 },
      { shape: 'cylinder', size: [2.2, 24, 2.2], pos: [3, 0.3, 7], color: '#b5aca0', segments: 14 },
      { shape: 'cylinder', size: [2.4, 1.2, 2.4], pos: [3, 20, 7], color: '#b5472f', segments: 14 },
      { shape: 'cone', size: [8, 3.6, 8], pos: [-6.5, 0.3, 6.5], color: '#2a2a2a', segments: 10 },
      { shape: 'box', size: [9, 0.8, 1.2], pos: [-1.5, 4, 2.5], color: '#5d6166', rot: [0, 0, -20] },
    ],
  }),
  infra({
    id: 'wind_turbine',
    name: 'Rüzgâr Türbini',
    description: 'Temiz ama düşük kapasiteli elektrik üretimi.',
    group: 'power',
    footprint: [1, 1],
    cost: 2500,
    maintenance: 80,
    workers: 0,
    pollution: 0,
    unlockPopulation: 0,
    utility: { power: 1500 },
    model: [
      { shape: 'cylinder', size: [3, 0.6, 3], pos: [0, 0, 0], color: CONCRETE, segments: 12 },
      { shape: 'cylinder', size: [1.1, 26, 1.1], pos: [0, 0.6, 0], color: WHITE, segments: 10 },
      { shape: 'box', size: [1.6, 1.6, 3.6], pos: [0, 26.4, 0], color: WHITE },
      { shape: 'cylinder', size: [1, 0.8, 1], pos: [0, 27.2, 1.6], color: '#d6d9dc', rot: [90, 0, 0], segments: 10 },
      { shape: 'box', size: [0.7, 11, 0.25], pos: [0, 27.2, 2.2], color: WHITE },
      { shape: 'box', size: [0.7, 11, 0.25], pos: [0, 27.2, 2.2], color: WHITE, rot: [0, 0, 120] },
      { shape: 'box', size: [0.7, 11, 0.25], pos: [0, 27.2, 2.2], color: WHITE, rot: [0, 0, 240] },
    ],
  }),
  // ---------------------------------------------------------------- water & sewage
  infra({
    id: 'water_pump',
    name: 'Su Pompası',
    description: 'Nehir veya gölden temiz su çeker. Kıyıya kurulmalı.',
    group: 'water',
    footprint: [2, 2],
    cost: 3500,
    maintenance: 150,
    workers: 5,
    pollution: 0,
    unlockPopulation: 0,
    utility: { water: 1500, requiresShore: true },
    model: [
      { shape: 'box', size: [15.5, 0.3, 15.5], pos: [0, 0, 0], color: CONCRETE },
      { shape: 'box', size: [8, 5, 7], pos: [-2.5, 0.3, -2], color: '#d9d4c8', facade: true },
      { shape: 'gable', size: [8.4, 1.6, 7.4], pos: [-2.5, 5.3, -2], color: '#5f6e7d' },
      { shape: 'cylinder', size: [5, 4.5, 5], pos: [4, 0.3, -3], color: '#6f8fa3', segments: 16 },
      { shape: 'dome', size: [5, 1, 5], pos: [4, 4.8, -3], color: '#6f8fa3' },
      { shape: 'cylinder', size: [1.2, 9, 1.2], pos: [0, 1, 5], color: '#7d8a94', rot: [0, 0, 90], segments: 10 },
    ],
  }),
  infra({
    id: 'water_tower',
    name: 'Su Kulesi',
    description: 'Kıyı gerektirmeyen, düşük kapasiteli su kaynağı.',
    group: 'water',
    footprint: [1, 1],
    cost: 2000,
    maintenance: 90,
    workers: 0,
    pollution: 0,
    unlockPopulation: 0,
    utility: { water: 300 },
    model: [
      { shape: 'box', size: [7.6, 0.3, 7.6], pos: [0, 0, 0], color: CONCRETE },
      { shape: 'cylinder', size: [0.5, 12, 0.5], pos: [-2, 0.3, -2], color: '#8d969c', segments: 6 },
      { shape: 'cylinder', size: [0.5, 12, 0.5], pos: [2, 0.3, -2], color: '#8d969c', segments: 6 },
      { shape: 'cylinder', size: [0.5, 12, 0.5], pos: [-2, 0.3, 2], color: '#8d969c', segments: 6 },
      { shape: 'cylinder', size: [0.5, 12, 0.5], pos: [2, 0.3, 2], color: '#8d969c', segments: 6 },
      { shape: 'cylinder', size: [6.4, 4.2, 6.4], pos: [0, 12.2, 0], color: '#a9bfcc', segments: 18 },
      { shape: 'dome', size: [6.4, 1.6, 6.4], pos: [0, 16.4, 0], color: '#8fa8b6' },
    ],
  }),
  infra({
    id: 'sewage_outlet',
    name: 'Kanalizasyon Çıkışı',
    description: 'Atık suyu arıtmadan suya boşaltır; çevreyi kirletir. Kıyıya kurulmalı.',
    group: 'water',
    footprint: [1, 1],
    cost: 1500,
    maintenance: 60,
    workers: 0,
    pollution: 0,
    unlockPopulation: 0,
    utility: { sewage: 1500, requiresShore: true, waterPollution: 45 },
    model: [
      { shape: 'box', size: [7, 1.2, 7], pos: [0, 0, 0], color: CONCRETE_DARK },
      { shape: 'box', size: [3, 2.4, 3], pos: [-1.5, 1.2, -1.5], color: '#9a958a' },
      { shape: 'cylinder', size: [1.8, 6, 1.8], pos: [0, 1.4, 1], color: '#6e6a63', rot: [90, 0, 0], segments: 12 },
    ],
  }),
  infra({
    id: 'water_treatment',
    name: 'Atık Su Arıtma Tesisi',
    description: 'Atık suyu temizleyerek boşaltır, kirlilik yaratmaz. Kıyıya kurulmalı.',
    group: 'water',
    footprint: [3, 3],
    cost: 10000,
    maintenance: 450,
    workers: 15,
    pollution: 0,
    unlockPopulation: 1000,
    utility: { sewage: 1800, requiresShore: true },
    model: [
      { shape: 'box', size: [23.5, 0.3, 23.5], pos: [0, 0, 0], color: CONCRETE },
      { shape: 'cylinder', size: [7, 1.8, 7], pos: [-6, 0.3, -6], color: '#5f7d8c', segments: 24 },
      { shape: 'cylinder', size: [6.2, 1.86, 6.2], pos: [-6, 0.3, -6], color: '#7aa3b5', segments: 24 },
      { shape: 'cylinder', size: [7, 1.8, 7], pos: [3, 0.3, -6], color: '#5f7d8c', segments: 24 },
      { shape: 'cylinder', size: [6.2, 1.86, 6.2], pos: [3, 0.3, -6], color: '#7aa3b5', segments: 24 },
      { shape: 'cylinder', size: [7, 1.8, 7], pos: [-6, 0.3, 3], color: '#5f7d8c', segments: 24 },
      { shape: 'cylinder', size: [6.2, 1.86, 6.2], pos: [-6, 0.3, 3], color: '#7aa3b5', segments: 24 },
      { shape: 'box', size: [8, 5, 6], pos: [5, 0.3, 5], color: '#e4e1d8', facade: true },
    ],
  }),
  // ---------------------------------------------------------------- services
  infra({
    id: 'police_station',
    name: 'Polis Merkezi',
    description: 'Çevresindeki suç oranını düşürür.',
    group: 'service',
    footprint: [2, 2],
    cost: 5000,
    maintenance: 280,
    workers: 20,
    pollution: 0,
    unlockPopulation: 500,
    service: { kind: 'police', radius: 30, capacity: 3000 },
    landValueEffect: { amount: 5, radius: 12 },
    model: [
      { shape: 'box', size: [15.5, 0.3, 15.5], pos: [0, 0, 0], color: '#bdb6a6' },
      { shape: 'box', size: [12, 7, 9], pos: [0, 0.3, -2.5], color: '#e3e8ee', facade: true },
      { shape: 'box', size: [12.2, 0.9, 9.2], pos: [0, 5.2, -2.5], color: '#2f5fb3' },
      { shape: 'box', size: [12.4, 0.6, 9.4], pos: [0, 7.3, -2.5], color: '#c9ced4' },
      { shape: 'box', size: [3, 1.2, 0.3], pos: [0, 3.2, 2.1], color: '#2f5fb3' },
      { shape: 'box', size: [2, 1.4, 4], pos: [-3.5, 0.3, 5], color: '#f2f4f6' },
      { shape: 'box', size: [2, 1.4, 4], pos: [0, 0.3, 5], color: '#2f5fb3' },
    ],
  }),
  infra({
    id: 'fire_station',
    name: 'İtfaiye',
    description: 'Yangınları söndürür ve yangın riskini azaltır.',
    group: 'service',
    footprint: [2, 2],
    cost: 5000,
    maintenance: 280,
    workers: 20,
    pollution: 0,
    unlockPopulation: 500,
    service: { kind: 'fire', radius: 30, capacity: 3000 },
    model: [
      { shape: 'box', size: [15.5, 0.3, 15.5], pos: [0, 0, 0], color: '#bdb6a6' },
      { shape: 'box', size: [13, 7, 9], pos: [-0.5, 0.3, -2.5], color: '#b8463a', facade: true },
      { shape: 'box', size: [13.2, 0.6, 9.2], pos: [-0.5, 7.3, -2.5], color: '#d8d2c6' },
      { shape: 'box', size: [3.2, 4, 0.2], pos: [-4.5, 0.3, 2.05], color: '#eceae4' },
      { shape: 'box', size: [3.2, 4, 0.2], pos: [-0.5, 0.3, 2.05], color: '#eceae4' },
      { shape: 'box', size: [3.2, 4, 0.2], pos: [3.5, 0.3, 2.05], color: '#eceae4' },
      { shape: 'box', size: [3, 13, 3], pos: [5.8, 0.3, -5.5], color: '#a53f34' },
      { shape: 'box', size: [2.4, 1.8, 5], pos: [-2.5, 0.3, 5], color: '#d6362a' },
    ],
  }),
  infra({
    id: 'hospital',
    name: 'Hastane',
    description: 'Vatandaş sağlığını iyileştirir.',
    group: 'service',
    footprint: [3, 3],
    cost: 9000,
    maintenance: 500,
    workers: 40,
    pollution: 0,
    unlockPopulation: 1000,
    service: { kind: 'health', radius: 36, capacity: 4000 },
    landValueEffect: { amount: 6, radius: 14 },
    model: [
      { shape: 'box', size: [23.5, 0.3, 23.5], pos: [0, 0, 0], color: '#c4bdae' },
      { shape: 'box', size: [18, 13, 11], pos: [0, 0.3, -4], color: '#f1f3f5', facade: true },
      { shape: 'box', size: [8, 7, 8], pos: [-5, 0.3, 5], color: '#e7eaed', facade: true },
      { shape: 'box', size: [18.4, 0.6, 11.4], pos: [0, 13.3, -4], color: '#c9ced4' },
      { shape: 'cylinder', size: [7, 0.2, 7], pos: [3, 13.9, -4], color: '#3a7d44', segments: 20 },
      { shape: 'box', size: [3.4, 1, 0.3], pos: [0, 9.5, 1.6], color: '#d33a2c' },
      { shape: 'box', size: [1, 3.4, 0.3], pos: [0, 8.3, 1.6], color: '#d33a2c' },
      { shape: 'box', size: [5, 3, 4], pos: [5, 0.3, 6], color: '#dfe3e6' },
    ],
  }),
  infra({
    id: 'school',
    name: 'İlkokul',
    description: 'Çocuklara temel eğitim verir.',
    group: 'service',
    footprint: [2, 2],
    cost: 6000,
    maintenance: 320,
    workers: 25,
    pollution: 0,
    unlockPopulation: 1000,
    service: { kind: 'education', radius: 26, capacity: 600 },
    landValueEffect: { amount: 5, radius: 10 },
    model: [
      { shape: 'box', size: [15.5, 0.2, 15.5], pos: [0, 0, 0], color: '#bdb6a6' },
      { shape: 'box', size: [13, 7, 6], pos: [0, 0.2, -4.5], color: '#e8c99b', facade: true },
      { shape: 'gable', size: [13.4, 2, 6.4], pos: [0, 7.2, -4.5], color: '#9c4a3a' },
      { shape: 'box', size: [5, 6, 6], pos: [-4, 0.2, 1.5], color: '#e2c08f', facade: true },
      { shape: 'box', size: [8, 0.12, 5.5], pos: [3, 0.2, 3.5], color: '#3f8f4f' },
      { shape: 'cylinder', size: [0.2, 8, 0.2], pos: [6.5, 0.2, -0.5], color: '#d6d6d6' },
      { shape: 'box', size: [1.6, 1, 0.05], pos: [5.7, 7, -0.5], color: '#d33a2c' },
    ],
  }),
  infra({
    id: 'high_school',
    name: 'Lise',
    description: 'Gençlere ileri eğitim verir; ofisler için nitelikli iş gücü yetiştirir.',
    group: 'service',
    footprint: [3, 3],
    cost: 9000,
    maintenance: 450,
    workers: 35,
    pollution: 0,
    unlockPopulation: 1000,
    service: { kind: 'highEducation', radius: 32, capacity: 800 },
    landValueEffect: { amount: 6, radius: 12 },
    model: [
      { shape: 'box', size: [23.5, 0.2, 23.5], pos: [0, 0, 0], color: '#bdb6a6' },
      { shape: 'box', size: [18, 10, 8], pos: [0, 0.2, -6], color: '#d9b48a', facade: true },
      { shape: 'box', size: [18.4, 0.6, 8.4], pos: [0, 10.2, -6], color: '#b9a081' },
      { shape: 'box', size: [8, 7, 9], pos: [-6, 0.2, 3], color: '#cfa77d' },
      { shape: 'gable', size: [8.4, 2.4, 9.4], pos: [-6, 7.2, 3], color: '#5f6e7d', rot: [0, 90, 0] },
      { shape: 'box', size: [11, 0.12, 9], pos: [5, 0.2, 5], color: '#3f8f4f' },
      { shape: 'box', size: [9, 0.13, 0.25], pos: [5, 0.2, 5], color: '#f0f0f0' },
    ],
  }),
  infra({
    id: 'garbage_depot',
    name: 'Çöp Toplama Tesisi',
    description: 'Çevresindeki binaların çöpünü toplar. Biraz kirletir.',
    group: 'service',
    footprint: [2, 2],
    cost: 4000,
    maintenance: 250,
    workers: 15,
    pollution: 25,
    unlockPopulation: 0,
    service: { kind: 'garbage', radius: 40, capacity: 4000 },
    model: [
      { shape: 'box', size: [15.5, 0.3, 15.5], pos: [0, 0, 0], color: CONCRETE },
      { shape: 'box', size: [10, 6, 8], pos: [-2, 0.3, -3], color: '#7d8a6a' },
      { shape: 'gable', size: [10.4, 1.8, 8.4], pos: [-2, 6.3, -3], color: '#5d6166' },
      { shape: 'box', size: [2.2, 1.6, 1.6], pos: [5, 0.3, -4], color: '#3e7b48' },
      { shape: 'box', size: [2.2, 1.6, 1.6], pos: [5, 0.3, -1.8], color: '#2f5fb3' },
      { shape: 'box', size: [2.2, 1.6, 1.6], pos: [5, 0.3, 0.4], color: '#c79a2a' },
      { shape: 'box', size: [2.6, 2.4, 5.5], pos: [-1, 0.3, 4.5], color: '#e0e0dc' },
    ],
  }),
  infra({
    id: 'park_small',
    name: 'Mahalle Parkı',
    description: 'Yakınındaki arazi değerini ve yaşam kalitesini artırır.',
    group: 'service',
    footprint: [1, 1],
    cost: 600,
    maintenance: 30,
    workers: 0,
    pollution: 0,
    unlockPopulation: 0,
    landValueEffect: { amount: 12, radius: 4 },
    model: [
      { shape: 'box', size: [7.6, 0.2, 7.6], pos: [0, 0, 0], color: GRASS },
      { shape: 'box', size: [7.6, 0.22, 1.2], pos: [0, 0, 0], color: PATH },
      { shape: 'box', size: [1.2, 0.22, 7.6], pos: [0, 0, 0], color: PATH },
      ...tree(-2.3, -2.3),
      ...tree(2.4, 2.2, 0.9),
      { shape: 'box', size: [1.8, 0.45, 0.5], pos: [2.3, 0.2, -1.6], color: '#7a5a3c' },
    ],
  }),
  infra({
    id: 'park_large',
    name: 'Şehir Parkı',
    description: 'Gölcüklü büyük park; geniş bir alanda arazi değerini artırır.',
    group: 'service',
    footprint: [2, 2],
    cost: 2000,
    maintenance: 90,
    workers: 2,
    pollution: 0,
    unlockPopulation: 0,
    landValueEffect: { amount: 22, radius: 7 },
    model: [
      { shape: 'box', size: [15.6, 0.2, 15.6], pos: [0, 0, 0], color: GRASS },
      { shape: 'cylinder', size: [6, 0.24, 6], pos: [-2.5, 0, -2.5], color: WATER, segments: 24 },
      { shape: 'box', size: [15.6, 0.22, 1.4], pos: [0, 0, 3], color: PATH },
      { shape: 'box', size: [1.4, 0.22, 15.6], pos: [3, 0, 0], color: PATH },
      ...tree(-5.5, 5.5),
      ...tree(6, 6, 1.1),
      ...tree(6, -5.5, 0.9),
      ...tree(-6, -6.2, 0.8),
      ...tree(-1, 6.3, 1.2),
      { shape: 'cylinder', size: [3.4, 2.4, 3.4], pos: [6, 0.2, -1.2], color: '#d8d2c4', segments: 8 },
      { shape: 'cone', size: [4.4, 1.8, 4.4], pos: [6, 2.6, -1.2], color: '#7a4f36', segments: 8 },
    ],
  }),
];
