import { GRID_CELLS } from '../../core/config';
import type { BuildingDef } from '../../data/buildings';
import { anchorFor, bestRotation, frontCells, frontStep, type BuildingPlan, type Rotation } from '../../entities/building/BuildingPlacement';
import type { City } from '../../systems/City';

/**
 * Where a building held at (x, z) goes on the grid: turned to face a road
 * (unless the player turned it by hand), on the lot under the cursor if it
 * fits; else the closest lot within two cells (and other turns) that fits,
 * preferring lots whose front meets a road — straight up against it, or
 * turned and moved to its kerb. `planAt` validates one lot (placing new, or
 * moving an existing building).
 */
export function gridPlanNear(city: City, def: BuildingDef, x: number, z: number, rot: Rotation, manual: boolean, planAt: (i: number, j: number, r: Rotation) => BuildingPlan): BuildingPlan {
  const turn = manual ? rot : bestRotation(def, x, z, rot, city.placementWorld);
  const { i, j } = anchorFor(def, turn, x, z);
  const plan = planAt(i, j, turn);
  if (plan.valid) return plan;
  // Curved and diagonal roads rarely line up with whole cells.
  const rots: Rotation[] = manual ? [turn] : [turn, ((turn + 1) % 4) as Rotation, ((turn + 3) % 4) as Rotation, ((turn + 2) % 4) as Rotation];
  let best: BuildingPlan | null = null;
  let bestD = Infinity;
  for (const r of rots) {
    const a = anchorFor(def, r, x, z);
    for (let dj = -2; dj <= 2; dj++) {
      for (let di = -2; di <= 2; di++) {
        const p = planAt(a.i + di, a.j + dj, r);
        if (!p.valid) continue;
        const flush = frontCells(p.i, p.j, p.w, p.d, p.rot, 1).every(([ci, cj]) => city.occupancy.road[cj * GRID_CELLS + ci] > 0);
        const meets = flush || city.roadSnap(p.i, p.j, p.w, p.d, p.rot) !== null;
        const dd = Math.hypot(p.centerX - x, p.centerZ - z) + (r === turn ? 0 : 2) + (meets ? 0 : 6) + (p.bulldoze?.length ? 8 : 0);
        if (dd < bestD) (bestD = dd), (best = p);
      }
    }
  }
  if (best) return best;
  if (!plan.roadAccess) {
    // Slide one cell toward the front so the building hugs a nearby road.
    const [si, sj] = frontStep(turn);
    const slid = planAt(i + si, j + sj, turn);
    if (slid.roadAccess) return slid;
  }
  return plan;
}
