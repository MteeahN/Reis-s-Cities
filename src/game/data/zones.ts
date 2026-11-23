/** Zone catalogue (data-driven). Zone ids are stored per cell as small integers. */
export const ZoneType = { None: 0, Residential: 1, Commercial: 2, Industrial: 3 } as const;
export type ZoneType = (typeof ZoneType)[keyof typeof ZoneType];
export type ZoneKind = Exclude<ZoneType, 0>;

export interface ZoneDef {
  type: ZoneKind;
  id: 'residential' | 'commercial' | 'industrial';
  name: string;
  short: string;
  description: string;
  /** Overlay colour (hex). */
  color: number;
  unlockPopulation: number;
}

export const ZONES: readonly ZoneDef[] = [
  {
    type: ZoneType.Residential,
    id: 'residential',
    name: 'Konut',
    short: 'K',
    description: 'Evler ve apartmanlar. Nüfus oluşturur.',
    color: 0x4ade80,
    unlockPopulation: 0,
  },
  {
    type: ZoneType.Commercial,
    id: 'commercial',
    name: 'Ticaret',
    short: 'T',
    description: 'Marketler, mağazalar ve işletmeler. Hizmet ve iş sağlar.',
    color: 0x60a5fa,
    unlockPopulation: 100,
  },
  {
    type: ZoneType.Industrial,
    id: 'industrial',
    name: 'Sanayi',
    short: 'S',
    description: 'Fabrikalar ve depolar. Çok iş sağlar, kirlilik üretir.',
    color: 0xfacc15,
    unlockPopulation: 250,
  },
];

export const getZone = (t: ZoneKind): ZoneDef => ZONES.find((z) => z.type === t)!;

/** Max distance from a road (in cells) at which land can be zoned. */
export const ZONE_DEPTH = 4;
