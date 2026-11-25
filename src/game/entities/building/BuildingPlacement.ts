import { CELL_SIZE, GRID_CELLS } from '../../core/config';
import type { BuildingDef } from '../../data/buildings';

/** Rotation in quarter turns. 0 → front faces +z, 1 → +x, 2 → −z, 3 → −x. */
export type Rotation = 0 | 1 | 2 | 3;

export interface PlacementWorld {
  vertexHeight(i: number, j: number): number;
  isCellUnlocked(i: number, j: number): boolean;
  isWater(i: number, j: number): boolean;
  hasRoad(i: number, j: number): boolean;
  buildingAt(i: number, j: number): number;
}

/** A building placed off the grid: drawn centre (m) and absolute turn (radians, as the renderer turns it). */
export interface FreeSpot {
  x: number;
  z: number;
  yaw: number;
}

export interface BuildingPlan {
  defId: string;
  i: number;
  j: number;
  rot: Rotation;
  w: number;
  d: number;
  /** Ground level the building stands on (highest footprint corner). */
  baseY: number;
  /** Lowest footprint corner (foundation depth). */
  minY: number;
  centerX: number;
  centerZ: number;
  cost: number;
  roadAccess: boolean;
  valid: boolean;
  errors: string[];
  /** Buildings standing on the lot that placing this one demolishes (zoned buildings and other player buildings). */
  bulldoze?: number[];
  /** Placed off the grid along a road: where it is drawn, its offset from the filed grid lot, and the cells it covers. */
  free?: FreeSpot & { cells: number[]; ox: number; oz: number; oyaw: number };
}

export const MAX_FOUNDATION_DROP = 6;

export function footprintSize(def: BuildingDef, rot: Rotation): [number, number] {
  const [w, d] = def.footprint;
  return rot % 2 === 0 ? [w, d] : [d, w];
}

export function footprintCells(i: number, j: number, w: number, d: number): number[] {
  const out: number[] = [];
  for (let dj = 0; dj < d; dj++) for (let di = 0; di < w; di++) out.push((j + dj) * GRID_CELLS + (i + di));
  return out;
}

/** Cells in front of the building's front face, `depth` rows out (1 = directly adjacent). */
export function frontCells(i: number, j: number, w: number, d: number, rot: Rotation, depth = 1): [number, number][] {
  const out: [number, number][] = [];
  const o = depth - 1;
  if (rot === 0) for (let k = 0; k < w; k++) out.push([i + k, j + d + o]);
  else if (rot === 2) for (let k = 0; k < w; k++) out.push([i + k, j - 1 - o]);
  else if (rot === 1) for (let k = 0; k < d; k++) out.push([i + w + o, j + k]);
  else for (let k = 0; k < d; k++) out.push([i - 1 - o, j + k]);
  return out;
}

/** Unit cell step in the direction the front faces. */
export function frontStep(rot: Rotation): [number, number] {
  return rot === 0 ? [0, 1] : rot === 1 ? [1, 0] : rot === 2 ? [0, -1] : [-1, 0];
}

/** Anchor cell (min corner) so the footprint is centred on a world point. */
export function anchorFor(def: BuildingDef, rot: Rotation, x: number, z: number): { i: number; j: number } {
  const [w, d] = footprintSize(def, rot);
  return { i: Math.round(x / CELL_SIZE - w / 2), j: Math.round(z / CELL_SIZE - d / 2) };
}

/**
 * A road must run within two cells of the front face. (Diagonal/curved roads
 * rarely line up with whole cells, so one cell of slack keeps placement natural.)
 */
export function hasRoadAccess(i: number, j: number, w: number, d: number, rot: Rotation, world: PlacementWorld): boolean {
  for (const depth of [1, 2]) {
    if (frontCells(i, j, w, d, rot, depth).some(([fi, fj]) => world.hasRoad(fi, fj))) return true;
  }
  return false;
}

/** A rotation whose front faces a road at this spot, preferring `preferred`. */
export function bestRotation(def: BuildingDef, x: number, z: number, preferred: Rotation, world: PlacementWorld): Rotation {
  const order: Rotation[] = [preferred, ((preferred + 1) % 4) as Rotation, ((preferred + 3) % 4) as Rotation, ((preferred + 2) % 4) as Rotation];
  for (const rot of order) {
    const [w, d] = footprintSize(def, rot);
    const { i, j } = anchorFor(def, rot, x, z);
    const [si, sj] = frontStep(rot);
    if (hasRoadAccess(i, j, w, d, rot, world) || hasRoadAccess(i + si, j + sj, w, d, rot, world)) return rot;
  }
  return preferred;
}

/** Is there water within two cells of the footprint (for pumps and outlets)? */
export function touchesWater(i: number, j: number, w: number, d: number, world: PlacementWorld): boolean {
  for (let y = j - 2; y < j + d + 2; y++) {
    for (let x = i - 2; x < i + w + 2; x++) {
      if (x >= i && x < i + w && y >= j && y < j + d) continue;
      if (world.isWater(x, y)) return true;
    }
  }
  return false;
}

/** Validates a placement: land ownership, terrain, collisions, road access, uniqueness and budget. */
export function planBuilding(
  def: BuildingDef,
  i: number,
  j: number,
  rot: Rotation,
  world: PlacementWorld,
  budget: number,
  existingOfType: number,
): BuildingPlan {
  const [w, d] = footprintSize(def, rot);
  const errors: string[] = [];
  let outOfBounds = false;
  let locked = false;
  let water = false;
  let road = false;
  let building = false;
  for (let dj = 0; dj < d; dj++) {
    for (let di = 0; di < w; di++) {
      const ci = i + di;
      const cj = j + dj;
      if (ci < 0 || cj < 0 || ci >= GRID_CELLS || cj >= GRID_CELLS) {
        outOfBounds = true;
        continue;
      }
      if (!world.isCellUnlocked(ci, cj)) locked = true;
      if (world.isWater(ci, cj)) water = true;
      if (world.hasRoad(ci, cj)) road = true;
      if (world.buildingAt(ci, cj) !== 0) building = true;
    }
  }
  let baseY = -Infinity;
  let minY = Infinity;
  if (!outOfBounds) {
    for (let dj = 0; dj <= d; dj++) {
      for (let di = 0; di <= w; di++) {
        const h = world.vertexHeight(i + di, j + dj);
        baseY = Math.max(baseY, h);
        minY = Math.min(minY, h);
      }
    }
  } else {
    baseY = minY = 0;
  }
  const roadAccess = !outOfBounds && hasRoadAccess(i, j, w, d, rot, world);

  if (outOfBounds) errors.push('Harita sınırlarının dışında');
  if (locked) errors.push('Satın alınmamış arazi');
  if (water) errors.push('Su üzerine inşa edilemez');
  if (road) errors.push('Yolun üzerine inşa edilemez');
  if (building) errors.push('Başka bir binayla çakışıyor');
  if (baseY - minY > MAX_FOUNDATION_DROP) errors.push('Arazi çok eğimli');
  if (!roadAccess) errors.push('Ön cephe bir yola bakmalı (R ile döndürün)');
  if (def.utility?.requiresShore && !outOfBounds && !touchesWater(i, j, w, d, world)) errors.push('Nehir veya göl kıyısına kurulmalı');
  if (def.unique && existingOfType > 0) errors.push(`${def.name} zaten inşa edildi`);
  if (def.cost > budget) errors.push('Yetersiz bütçe');

  return {
    defId: def.id,
    i,
    j,
    rot,
    w,
    d,
    baseY,
    minY,
    centerX: (i + w / 2) * CELL_SIZE,
    centerZ: (j + d / 2) * CELL_SIZE,
    cost: def.cost,
    roadAccess,
    valid: errors.length === 0,
    errors,
  };
}
