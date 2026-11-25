import { getBuilding, type BuildingDef } from '../data/buildings';
import { getRoadType } from '../data/roads';
import { ZoneType } from '../data/zones';
import type { PlacedBuilding } from '../entities/building/BuildingRegistry';
import type { RoadGraph } from '../entities/road/RoadGraph';
import { residentsOf, type Household, type Population } from './Population';

/**
 * Cars and parking.
 *
 * Car ownership: a home's residents form families (FAMILY_SIZE people each);
 * how many cars a family has depends on what the home was built for (modest,
 * middle-income or wealthy), how developed it is (level) and education —
 * wealthy families nearly all drive, modest ones much less. Only trips the
 * family can make by car reach the roads; the rest walk, cycle or ride.
 *
 * Parking: every road segment has spaces — homes' own driveways and garages,
 * parking lots and garages on the street, and the parking lanes of streets
 * that have them. The cars there change with the hour (at home at night, at
 * work and in the shops by day). Cars that find no space park illegally at
 * the kerb; where police patrol (coverage), some of them are fined.
 */

export const FAMILY_SIZE = 2.3;
/** Cars per family by home wealth (1 modest, 2 middle, 3 wealthy) at level 1. */
export const CARS_PER_FAMILY: Record<1 | 2 | 3, number> = { 1: 0.3, 2: 0.55, 3: 0.95 };
/** Length of kerb one parked car takes (m). */
export const SPACE_LENGTH = 6;
/** Spaces in public parking buildings. */
export const PARKING_BUILDINGS: Record<string, number> = { parking_lot: 40, parking_garage: 160 };
/** Fine for an illegally parked car that police write up (₺). */
export const PARKING_FINE = 12;
/** Share of illegally parked cars written up per day at full police coverage. */
export const FINE_RATE = 0.35;

/** Families living in a home and the cars they own. */
export function homeCars(def: BuildingDef, b: PlacedBuilding, hh: Household | undefined): { families: number; cars: number } {
  const residents = hh ? residentsOf(hh) : 0;
  if (residents <= 0) return { families: 0, cars: 0 };
  const families = residents / FAMILY_SIZE;
  const wealth = (def.wealth ?? 2) as 1 | 2 | 3;
  const adults = hh!.edu[0] + hh!.edu[1] + hh!.edu[2];
  const higher = adults > 0 ? hh!.edu[2] / adults : 0;
  const perFamily = Math.min(1.4, CARS_PER_FAMILY[wealth] * (1 + 0.12 * (Math.max(1, b.level) - 1)) + 0.15 * higher);
  return { families, cars: families * perFamily };
}

/** Share of a home's commutes and shopping trips that can be made by car. */
export function carShare(cars: number, workers: number, families: number): { work: number; shop: number } {
  return {
    work: workers > 0 ? Math.min(1, cars / workers) : 0,
    shop: families > 0 ? Math.min(1, cars / families) * 0.85 : 0,
  };
}

/** Share of a home's own spaces (driveway, garage, underground) per car, by building shape. */
function privateSpaces(def: BuildingDef): number {
  switch (def.spec?.style) {
    case 'house':
      return 1.1;
    case 'rowhouse':
      return 0.6;
    case 'apartment':
      return 0.35;
    case 'tower':
    case 'courtyard':
    case 'hotel':
      return 0.7;
    default:
      return 0.2;
  }
}

/** Share of cars at home / at work / at the shops by hour of day. */
function presence(hour: number): { home: number; work: number; shop: number } {
  const day = hour >= 8 && hour < 17 ? 1 : hour >= 7 && hour < 19 ? 0.5 : 0;
  const shop = hour >= 10 && hour < 20 ? (hour >= 17 ? 0.7 : 0.45) : 0.05;
  return { home: 1 - day * 0.6 - shop * 0.15, work: day * 0.9, shop };
}

export interface EdgeParking {
  /** Spaces anyone may use: parking lanes and parking buildings on this road. */
  publicSpaces: number;
  /** Cars parked legally in those public spaces. */
  parked: number;
  /** Cars parked illegally at the kerb. */
  illegal: number;
  /** Cars that found nowhere at all (circling). */
  unmet: number;
  /** Parking-lane spaces along the road (drawn at the kerb). */
  laneSpaces: number;
}

export interface ParkingStats {
  families: number;
  cars: number;
  publicSpaces: number;
  parked: number;
  illegal: number;
  unmet: number;
  /** Fines collected per day (₺). */
  finesPerDay: number;
}

export class ParkingModel {
  readonly edges = new Map<number, EdgeParking>();
  stats: ParkingStats = { families: 0, cars: 0, publicSpaces: 0, parked: 0, illegal: 0, unmet: 0, finesPerDay: 0 };
  /** Bumped on every update (renderers follow it). */
  version = 0;

  constructor(private readonly roads: RoadGraph) {}

  /**
   * @param attach the road segment a building uses (null: none)
   * @param police police coverage 0–1 at a point
   */
  update(
    buildings: Iterable<PlacedBuilding>,
    pop: Population,
    employmentRate: number,
    hour: number,
    attach: (b: PlacedBuilding) => { edge: number } | null,
    police: (x: number, z: number) => number,
  ): void {
    this.edges.clear();
    const at = presence(hour);
    const demand = new Map<number, number>();
    const add = (edge: number, n: number) => demand.set(edge, (demand.get(edge) ?? 0) + n);
    let families = 0;
    let cars = 0;
    let commuterCars = 0;
    let jobs = 0;
    const workplaces: { b: PlacedBuilding; edge: number; workers: number; shop: boolean; def: BuildingDef }[] = [];
    for (const b of buildings) {
      if (b.state !== 'active') continue;
      const a = attach(b);
      if (!a) continue;
      const def = getBuilding(b.defId);
      const spaces = PARKING_BUILDINGS[def.id];
      if (spaces) this.edgeOf(a.edge).publicSpaces += spaces;
      if (b.zone === ZoneType.Residential) {
        const hh = pop.households.get(b.id);
        const own = homeCars(def, b, hh);
        families += own.families;
        cars += own.cars;
        const workers = hh ? hh.ages[2] * employmentRate : 0;
        commuterCars += Math.min(own.cars, workers);
        // Cars at home beyond the home's own spaces need the street.
        const home = own.cars * at.home;
        add(a.edge, Math.max(0, home - own.cars * privateSpaces(def)));
      } else if (def.workers > 0 && b.occupants > 0) {
        jobs += b.occupants;
        workplaces.push({ b, edge: a.edge, workers: b.occupants, shop: b.zone === ZoneType.Commercial, def });
      }
    }
    // Commuters' cars spread over the jobs; customers' cars over the shops.
    const perJob = jobs > 0 ? commuterCars / jobs : 0;
    for (const w of workplaces) {
      const own = privateSpaces(w.def);
      add(w.edge, w.workers * perJob * at.work * (1 - own));
      if (w.shop) add(w.edge, w.workers * 0.6 * at.shop);
    }
    // Parking lanes along the streets.
    for (const e of this.roads.edges.values()) {
      const t = getRoadType(e.typeId);
      if (!t.parking) continue;
      const lane = Math.max(0, Math.floor((e.length - 16) / SPACE_LENGTH)) * (this.roads.direction(e) === 0 ? 2 : 1);
      const p = this.edgeOf(e.id);
      p.laneSpaces = lane;
      p.publicSpaces += lane;
    }
    const s: ParkingStats = { families, cars, publicSpaces: 0, parked: 0, illegal: 0, unmet: 0, finesPerDay: 0 };
    for (const [edgeId, d] of demand) {
      const e = this.roads.edges.get(edgeId);
      if (!e) continue;
      const p = this.edgeOf(edgeId);
      const t = getRoadType(e.typeId);
      p.parked = Math.min(d, p.publicSpaces);
      const over = d - p.parked;
      // Illegal kerb parking: along both kerbs of roads without parking lanes (none on highways or footpaths).
      const kerb = t.pedestrian || t.category === 'highway' ? 0 : Math.floor(e.length / SPACE_LENGTH) * 2;
      p.illegal = Math.min(over, kerb);
      p.unmet = over - p.illegal;
      const mid = e.poly.points[Math.floor(e.poly.points.length / 2)];
      s.finesPerDay += p.illegal * police(mid.x, mid.z) * FINE_RATE * PARKING_FINE;
    }
    for (const p of this.edges.values()) {
      s.publicSpaces += p.publicSpaces;
      s.parked += p.parked;
      s.illegal += p.illegal;
      s.unmet += p.unmet;
    }
    this.stats = s;
    this.version++;
  }

  private edgeOf(id: number): EdgeParking {
    let p = this.edges.get(id);
    if (!p) this.edges.set(id, (p = { publicSpaces: 0, parked: 0, illegal: 0, unmet: 0, laneSpaces: 0 }));
    return p;
  }
}

