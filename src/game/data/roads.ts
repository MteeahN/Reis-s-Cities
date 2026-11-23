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
}

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
  },
];

export const getRoadType = (id: string): RoadTypeDef => {
  const t = ROAD_TYPES.find((r) => r.id === id);
  if (!t) throw new Error(`Unknown road type: ${id}`);
  return t;
};

export const isRoadTypeUnlocked = (t: RoadTypeDef, population: number): boolean => population >= t.unlockPopulation;
