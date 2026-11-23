import type { Vector3 } from 'three';
import { CELL_SIZE, GRID_CELLS } from '../core/config';
import type { ZoneToolState } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { getRoadType } from '../data/roads';
import { getZone, ZoneType, type ZoneKind } from '../data/zones';
import { rasterizePolyline } from '../world/Occupancy';
import type { Tool, ToolContext } from './Tool';

const ERASE_COLOR = 0xff6b6b;

/**
 * Zoning.
 *  - Brush: press and drag to paint square brushes of 1/3/5 cells.
 *  - Roadside: point at the empty land beside a road — that side of the road
 *    is selected up to the chosen parcel depth (both sides when pointing at
 *    the road itself). Click, or press and drag along several streets.
 * Zone "None" erases. Zoning is free; repainting a lot with a different zone
 * replaces the growable building on it.
 */
export class ZoneTool implements Tool {
  readonly id = 'zone' as const;
  state: ZoneToolState = { zone: ZoneType.Residential, mode: 'fill', brush: 1, depth: 4 };
  private painting = false;
  private preview: number[] = [];
  private lastGround: Vector3 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  setState(patch: Partial<ZoneToolState>): void {
    this.state = { ...this.state, ...patch };
    this.ctx.events.emit('zoneTool', this.state);
    this.refresh();
  }

  activate(): void {
    this.ctx.zoneOverlay.setMode(true);
    this.refresh();
  }

  deactivate(): void {
    this.painting = false;
    this.ctx.zoneOverlay.setMode(false);
    this.ctx.zoneOverlay.clearPreview();
    this.ctx.world.terrainMaterial.clearHover();
  }

  private color(): number {
    return this.state.zone === ZoneType.None ? ERASE_COLOR : getZone(this.state.zone as ZoneKind).color;
  }

  /** Cells the current action would affect at the cursor. */
  private cellsAt(ground: Vector3): number[] {
    const city = this.ctx.city;
    const erase = this.state.zone === ZoneType.None;
    const keep = (k: number) => (erase ? city.zones.zone[k] !== ZoneType.None : city.canZone(k) && city.zones.zone[k] !== this.state.zone);
    if (this.state.mode === 'brush') {
      const r = this.state.brush - 1;
      const ci = Math.floor(ground.x / CELL_SIZE);
      const cj = Math.floor(ground.z / CELL_SIZE);
      const out: number[] = [];
      for (let j = cj - r; j <= cj + r; j++) {
        for (let i = ci - r; i <= ci + r; i++) {
          if (i < 0 || j < 0 || i >= GRID_CELLS || j >= GRID_CELLS) continue;
          const k = j * GRID_CELLS + i;
          if (keep(k)) out.push(k);
        }
      }
      return out;
    }
    const reach = this.state.depth * CELL_SIZE;
    const hit = city.roads.nearestEdge(ground.x, ground.z, reach + 8, true);
    if (!hit) return [];
    const half = getRoadType(hit.edge.typeId).width / 2;
    if (hit.dist > half + reach) return [];
    const pts = hit.edge.poly.points;
    const cells = rasterizePolyline(pts, half + reach).filter(keep);
    if (hit.dist <= half) return cells;
    // Only the side of the road the cursor is on.
    const side = sideOf(pts, ground.x, ground.z);
    return cells.filter((k) => sideOf(pts, ((k % GRID_CELLS) + 0.5) * CELL_SIZE, (Math.floor(k / GRID_CELLS) + 0.5) * CELL_SIZE) === side);
  }

  private refresh(): void {
    const g = this.lastGround;
    const mat = this.ctx.world.terrainMaterial;
    if (!g) {
      this.ctx.zoneOverlay.clearPreview();
      mat.clearHover();
      return;
    }
    this.preview = this.cellsAt(g);
    this.ctx.zoneOverlay.setPreview(this.preview, this.color());
    if (this.state.mode === 'brush') {
      const r = this.state.brush - 1;
      const ci = Math.floor(g.x / CELL_SIZE);
      const cj = Math.floor(g.z / CELL_SIZE);
      mat.setHover((ci - r) * CELL_SIZE, (cj - r) * CELL_SIZE, (ci + r + 1) * CELL_SIZE, (cj + r + 1) * CELL_SIZE, this.color());
    } else mat.clearHover();
  }

  private apply(): void {
    const zone = this.state.zone;
    if (zone !== ZoneType.None && !this.ctx.isZoneUnlocked(zone as ZoneKind)) {
      const def = getZone(zone as ZoneKind);
      this.ctx.events.emit('toast', { kind: 'warning', text: `${def.name} bölgeleri ${def.unlockPopulation} nüfusta açılır` });
      this.painting = false;
      return;
    }
    if (this.preview.length === 0) return;
    this.ctx.city.setZone(this.preview, zone as ZoneType);
    this.ctx.events.emit('sfx', 'zone');
    this.refresh();
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    this.lastGround = ground ? ground.clone() : null;
    this.refresh();
    if (this.painting) this.apply();
  }

  onPointerDown(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button !== MouseButton.Left || !ground) return;
    this.lastGround = ground.clone();
    this.refresh();
    this.painting = true;
    this.apply();
  }

  onPointerUp(p: PointerInfo): void {
    if (p.button === MouseButton.Left) this.painting = false;
  }

  onKey(code: string): boolean {
    if (code === 'BracketRight' || code === 'Equal') {
      this.setState(this.state.mode === 'brush' ? { brush: Math.min(3, this.state.brush + 1) } : { depth: Math.min(4, this.state.depth + 1) });
      return true;
    }
    if (code === 'BracketLeft' || code === 'Minus') {
      this.setState(this.state.mode === 'brush' ? { brush: Math.max(1, this.state.brush - 1) } : { depth: Math.max(1, this.state.depth - 1) });
      return true;
    }
    return false;
  }

  update(): void {}
}

/** Which side (+1 / −1) of a polyline the point lies on, measured at its closest segment. */
export function sideOf(points: { x: number; z: number }[], x: number, z: number): number {
  let best = Infinity;
  let sign = 1;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    const px = a.x + dx * t;
    const pz = a.z + dz * t;
    const d = (x - px) ** 2 + (z - pz) ** 2;
    if (d < best) {
      best = d;
      sign = dx * (z - a.z) - dz * (x - a.x) >= 0 ? 1 : -1;
    }
  }
  return sign;
}
