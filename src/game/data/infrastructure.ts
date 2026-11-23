import type { BuildingDef } from './buildings';
import { coalPlantModel, fireStationModel, garbageModel, highSchoolModel, hospitalModel, parkLargeModel, parkSmallModel, policeModel, schoolModel, sewageOutletModel, waterPumpModel, waterTowerModel, waterTreatmentModel, windTurbineModel } from './models/services';

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
    model: coalPlantModel(),
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
    model: windTurbineModel(),
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
    model: waterPumpModel(),
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
    model: waterTowerModel(),
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
    model: sewageOutletModel(),
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
    model: waterTreatmentModel(),
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
    model: policeModel(),
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
    model: fireStationModel(),
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
    model: hospitalModel(),
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
    model: schoolModel(),
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
    model: highSchoolModel(),
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
    model: garbageModel(),
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
    model: parkSmallModel(),
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
    model: parkLargeModel(),
  }),
];
