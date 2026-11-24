/**
 * Data-driven road catalogue. Adding a road type means adding an entry here —
 * the road tool, planner, renderer (lane markings) and UI all read this table.
 */
export interface RoadTypeDef {
  id: string;
  name: string;
  description: string;
  lanes: number;
  oneWay: boolean;
  /** Total width including sidewalks (m). */
  width: number;
  /** Sidewalk width on each side (m); 0 for highways (shoulders instead). */
  sidewalk: number;
  /** Planted median width in the centre (m); 0 for none. */
  median: number;
  /** Centre line style for two-way roads. */
  centerLine: 'dashed' | 'double' | 'none';
  /** Construction cost per metre (₺). */
  costPerMeter: number;
  /** Weekly maintenance per metre (₺). */
  maintenancePerMeter: number;
  /** Approximate vehicle capacity per hour (both directions). */
  capacity: number;
  speedKmh: number;
  /** Max terrain grade (rise/run) the road can follow. */
  maxGrade: number;
  /** Smallest allowed curve radius (m). */
  minRadius: number;
  /** Whether it can span water as a bridge, and the per-metre cost multiplier. */
  allowsBridge: boolean;
  bridgeCostMultiplier: number;
  unlockPopulation: number;
  /** Whether land along this road can be zoned. */
  zoneable: boolean;
  previewColor: number;
  /** Catalogue tab: neighbourhood streets, wide roads or highways. */
  category: RoadCategory;
  /** False for the intercity entry road, which the game lays and players cannot draw. */
  playerBuildable?: boolean;
}

export type RoadCategory = 'street' | 'wide' | 'highway';

export const ROAD_CATEGORIES: { id: RoadCategory; name: string }[] = [
  { id: 'street', name: 'Sokaklar' },
  { id: 'wide', name: 'Geniş yollar' },
  { id: 'highway', name: 'Otoyol' },
];

export const ROAD_TYPES: readonly RoadTypeDef[] = [
  {
    id: 'street',
    name: 'Mahalle Yolu',
    description: 'İki şeritli dar konut sokağı. Düşük kapasite, ucuz bakım.',
    lanes: 2,
    oneWay: false,
    width: 8,
    sidewalk: 1.5,
    median: 0,
    centerLine: 'dashed',
    costPerMeter: 12,
    maintenancePerMeter: 0.25,
    capacity: 600,
    speedKmh: 40,
    maxGrade: 0.14,
    minRadius: 12,
    allowsBridge: false,
    bridgeCostMultiplier: 1,
    unlockPopulation: 0,
    zoneable: true,
    previewColor: 0x5eead4,
    category: 'street',
  },
  {
    id: 'city',
    name: 'Şehir Yolu',
    description: 'Çift yönlü, kaldırımlı şehir yolu. Köprü olarak suyu geçebilir.',
    lanes: 2,
    oneWay: false,
    width: 12,
    sidewalk: 2.5,
    median: 0,
    centerLine: 'double',
    costPerMeter: 20,
    maintenancePerMeter: 0.4,
    capacity: 1100,
    speedKmh: 50,
    maxGrade: 0.12,
    minRadius: 16,
    allowsBridge: true,
    bridgeCostMultiplier: 4,
    unlockPopulation: 0,
    zoneable: true,
    previewColor: 0x60a5fa,
    category: 'street',
  },
  {
    id: 'avenue',
    name: 'Ana Cadde',
    description: 'Dört şeritli geniş cadde. Yüksek kapasiteli ana arter.',
    lanes: 4,
    oneWay: false,
    width: 16,
    sidewalk: 2.5,
    median: 0,
    centerLine: 'double',
    costPerMeter: 38,
    maintenancePerMeter: 0.7,
    capacity: 2400,
    speedKmh: 60,
    maxGrade: 0.1,
    minRadius: 24,
    allowsBridge: true,
    bridgeCostMultiplier: 4,
    unlockPopulation: 2500,
    zoneable: true,
    previewColor: 0xa78bfa,
    category: 'wide',
  },
  {
    id: 'boulevard',
    name: 'Bulvar',
    description: 'Orta refüjlü altı şeritli bulvar. Arazi değerini artırır.',
    lanes: 6,
    oneWay: false,
    width: 24,
    sidewalk: 3,
    median: 3,
    centerLine: 'none',
    costPerMeter: 60,
    maintenancePerMeter: 1.1,
    capacity: 3600,
    speedKmh: 60,
    maxGrade: 0.09,
    minRadius: 32,
    allowsBridge: true,
    bridgeCostMultiplier: 4.5,
    unlockPopulation: 2500,
    zoneable: true,
    previewColor: 0xf472b6,
    category: 'wide',
  },
  {
    id: 'highway',
    name: 'Otoyol',
    description: 'Tek yönlü, hızlı yol. Bölgeleme yapılamaz.',
    lanes: 3,
    oneWay: true,
    width: 16,
    sidewalk: 0,
    median: 0,
    centerLine: 'none',
    costPerMeter: 75,
    maintenancePerMeter: 1.4,
    capacity: 5400,
    speedKmh: 100,
    maxGrade: 0.07,
    minRadius: 80,
    allowsBridge: true,
    bridgeCostMultiplier: 5,
    unlockPopulation: 5000,
    zoneable: false,
    previewColor: 0xfbbf24,
    category: 'highway',
  },
  // New types go at the end: the list order sets each type's small render lift.
  {
    id: 'oneway1',
    name: 'Tek Yön Sokak',
    description: 'Tek şeritli, tek yönlü dar sokak. Kavşaklarda daha az çakışma; çift yöne çevrilemez.',
    lanes: 1,
    oneWay: true,
    width: 7,
    sidewalk: 1.5,
    median: 0,
    centerLine: 'none',
    costPerMeter: 10,
    maintenancePerMeter: 0.2,
    capacity: 450,
    speedKmh: 40,
    maxGrade: 0.14,
    minRadius: 10,
    allowsBridge: false,
    bridgeCostMultiplier: 1,
    unlockPopulation: 0,
    zoneable: true,
    previewColor: 0x34d399,
    category: 'street',
  },
  {
    id: 'oneway2',
    name: 'Tek Yön Cadde',
    description: 'İki şeritli, tek yönlü cadde. Aynı genişlikte çift yönlü yoldan daha yüksek akış.',
    lanes: 2,
    oneWay: true,
    width: 10,
    sidewalk: 2,
    median: 0,
    centerLine: 'none',
    costPerMeter: 16,
    maintenancePerMeter: 0.32,
    capacity: 1300,
    speedKmh: 50,
    maxGrade: 0.12,
    minRadius: 14,
    allowsBridge: true,
    bridgeCostMultiplier: 4,
    unlockPopulation: 0,
    zoneable: true,
    previewColor: 0x38bdf8,
    category: 'street',
  },
  {
    id: 'intercity',
    name: 'Şehirlerarası Yol',
    description: 'Haritanın kenarından şehre gelen giriş yolu. Göçmenler, ziyaretçiler ve yük kamyonları bu yoldan gelir.',
    lanes: 4,
    oneWay: false,
    width: 18,
    sidewalk: 1,
    median: 2,
    centerLine: 'none',
    costPerMeter: 0,
    maintenancePerMeter: 0,
    capacity: 3200,
    speedKmh: 80,
    maxGrade: 0.12,
    minRadius: 60,
    allowsBridge: true,
    bridgeCostMultiplier: 1,
    unlockPopulation: 0,
    zoneable: false,
    previewColor: 0xe2c044,
    category: 'highway',
    playerBuildable: false,
  },
  {
    id: 'citylink',
    name: 'Şehir Bağlantı Yolu',
    description: 'Şehirlerarası yolun kavşağından şehre giren yol. Oyunla birlikte gelir; ilk sokaklar buradan başlar.',
    lanes: 2,
    oneWay: false,
    width: 12,
    sidewalk: 2.5,
    median: 0,
    centerLine: 'double',
    costPerMeter: 0,
    maintenancePerMeter: 0,
    capacity: 1100,
    speedKmh: 50,
    maxGrade: 0.12,
    minRadius: 16,
    allowsBridge: true,
    bridgeCostMultiplier: 1,
    unlockPopulation: 0,
    zoneable: true,
    previewColor: 0x60a5fa,
    category: 'street',
    playerBuildable: false,
  },
];

/** Road types the player can pick in the road tool. */
export const BUILDABLE_ROAD_TYPES = ROAD_TYPES.filter((t) => t.playerBuildable !== false);

export const getRoadType = (id: string): RoadTypeDef => {
  const t = ROAD_TYPES.find((r) => r.id === id);
  if (!t) throw new Error(`Unknown road type: ${id}`);
  return t;
};

export const isRoadTypeUnlocked = (t: RoadTypeDef, population: number): boolean => population >= t.unlockPopulation;
