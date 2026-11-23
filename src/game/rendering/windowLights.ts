import { ZoneType } from '../data/zones';
import type { BuildingState } from '../entities/building/BuildingRegistry';

export interface LitInput {
  state: BuildingState;
  zone: ZoneType;
  occupants: number;
  capacity: number;
  /** Building needs electricity (consumers) … */
  needsPower: boolean;
  /** … and currently gets it. */
  powered: boolean;
  /** Clock hour 0–23. */
  hour: number;
}

/**
 * Share (0–1) of a building's windows lit after dark. Only active, powered
 * buildings light up: homes by how many people live there (fewer late at
 * night), shops while open, workplaces by their staff, civic buildings
 * partly. A blackout leaves a building dark.
 */
export function windowLitShare(b: LitInput): number {
  if (b.state !== 'active') return 0;
  if (b.needsPower && !b.powered) return 0;
  const h = b.hour;
  const occ = b.capacity > 0 ? Math.min(1, b.occupants / b.capacity) : 1;
  if (b.zone === ZoneType.Residential) return occ * (h >= 1 && h < 5 ? 0.22 : h >= 23 || h < 1 ? 0.5 : 0.85);
  if (b.zone === ZoneType.Commercial) return b.occupants > 0 ? (h >= 22 || h < 6 ? 0.3 : 0.9) : 0;
  if (b.zone === ZoneType.Industrial) return occ * 0.55;
  return 0.6;
}
