import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineLoop, type Vector3 } from 'three';
import { CELL_SIZE } from '../core/config';
import type { Selection } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { getRoadType } from '../data/roads';
import { sampleBezier } from '../entities/road/curve';
import { WorldGrid, type CellInfo } from '../world/WorldGrid';
import { RoadPreview } from './placement/RoadPreview';
import type { Tool, ToolContext } from './Tool';

const MARKER_POINTS = 64;

/**
 * Inspect the city: hover highlights a cell; click selects (in priority order)
 * a building, a road segment, or the terrain cell under the cursor.
 */
export class SelectTool implements Tool {
  readonly id = 'select' as const;
  private hoverKey = -1;
  private selected: Selection | null = null;
  private readonly marker: LineLoop;
  private readonly markerPos = new Float32Array(MARKER_POINTS * 3);
  private readonly roadHighlight = new RoadPreview();
  private downX = 0;
  private downY = 0;

  constructor(private readonly ctx: ToolContext) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.markerPos, 3));
    this.marker = new LineLoop(geo, new LineBasicMaterial({ color: 0xffd166, depthTest: false, transparent: true }));
    this.marker.renderOrder = 10;
    this.marker.frustumCulled = false;
    this.marker.visible = false;
    ctx.overlay.add(this.marker, this.roadHighlight.group);
  }

  activate(): void {
    this.showSelection();
  }

  deactivate(): void {
    this.hoverKey = -1;
    this.ctx.world.terrainMaterial.clearHover();
    this.ctx.events.emit('hover', null);
  }

  getSelection(): Selection | null {
    return this.selected;
  }

  clearSelection(): void {
    this.selected = null;
    this.marker.visible = false;
    this.roadHighlight.hide();
    this.ctx.events.emit('selection', null);
  }

  /** Re-resolve the selection after the city changed (it may have been demolished or replaced). */
  revalidate(): void {
    const s = this.selected;
    if (!s) return;
    if (s.kind === 'road') {
      const info = this.ctx.roadInfo(s.road.id);
      if (!info) return this.clearSelection();
      this.selected = { kind: 'road', road: info };
    } else if (s.kind === 'building') {
      const info = this.ctx.buildingInfo(s.building.id);
      if (!info) return this.clearSelection();
      this.selected = { kind: 'building', building: info };
    } else {
      const c = this.ctx.world.grid.info(s.cell.i, s.cell.j);
      if (c) this.selected = this.cellSelection(c);
    }
    this.showSelection();
    this.ctx.events.emit('selection', this.selected);
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    const info = ground ? this.ctx.world.grid.info(Math.floor(ground.x / CELL_SIZE), Math.floor(ground.z / CELL_SIZE)) : null;
    const key = info ? info.j * 100000 + info.i : -1;
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    const mat = this.ctx.world.terrainMaterial;
    if (info) {
      const x0 = info.i * CELL_SIZE;
      const z0 = info.j * CELL_SIZE;
      mat.setHover(x0, z0, x0 + CELL_SIZE, z0 + CELL_SIZE, info.buildable && info.unlocked ? 0xbff7ff : 0xff9f7a);
    } else mat.clearHover();
    this.ctx.events.emit('hover', info);
  }

  onPointerDown(p: PointerInfo): void {
    this.downX = p.x;
    this.downY = p.y;
  }

  onPointerUp(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button !== MouseButton.Left) return;
    if (Math.hypot(p.x - this.downX, p.y - this.downY) > 5) return; // was a drag
    if (!ground) return;
    const city = this.ctx.city;
    const { i, j } = WorldGrid.cellOf(ground.x, ground.z);
    const bid = city.buildingAtWorld(ground.x, ground.z);
    const building = bid ? this.ctx.buildingInfo(bid) : null;
    if (building) {
      this.selected = { kind: 'building', building };
    } else {
      const hit = city.roads.nearestEdge(ground.x, ground.z, 1, true);
      const road = hit ? this.ctx.roadInfo(hit.edge.id) : null;
      if (road) this.selected = { kind: 'road', road };
      else {
        const cell = this.ctx.world.grid.info(i, j);
        if (!cell) return;
        this.selected = this.cellSelection(cell);
      }
    }
    this.showSelection();
    this.ctx.events.emit('selection', this.selected);
  }

  private cellSelection(cell: CellInfo): Selection {
    const city = this.ctx.city;
    return {
      kind: 'cell',
      cell,
      zone: city.zones.get(cell.i, cell.j),
      landValue: city.landValue.valueAt(cell.i, cell.j),
      pollution: city.landValue.pollutionAt(cell.i, cell.j),
    };
  }

  private showSelection(): void {
    const s = this.selected;
    this.marker.visible = false;
    this.roadHighlight.hide();
    if (!s) return;
    if (s.kind === 'road') {
      const e = this.ctx.city.roads.edges.get(s.road.id);
      if (e) {
        const pts = sampleBezier(this.ctx.city.roads.curveOf(e), 3).points;
        this.roadHighlight.showPath(pts, getRoadType(e.typeId).width + 1.5, 'select', this.ctx.world.heightAt);
      }
    } else if (s.kind === 'building') {
      const b = this.ctx.city.buildings.items.get(s.building.id);
      if (b) this.outline(b.i * CELL_SIZE, b.j * CELL_SIZE, (b.i + b.w) * CELL_SIZE, (b.j + b.d) * CELL_SIZE, b.baseY + 0.4);
    } else {
      const x0 = s.cell.i * CELL_SIZE;
      const z0 = s.cell.j * CELL_SIZE;
      this.outline(x0, z0, x0 + CELL_SIZE, z0 + CELL_SIZE);
    }
  }

  /** Rectangle outline draped on the terrain (or at a fixed height). */
  private outline(x0: number, z0: number, x1: number, z1: number, fixedY?: number): void {
    const h = this.ctx.world.heightAt;
    const per = MARKER_POINTS / 4;
    const sides = [
      [x0, z0, x1 - x0, 0],
      [x1, z0, 0, z1 - z0],
      [x1, z1, x0 - x1, 0],
      [x0, z1, 0, z0 - z1],
    ];
    let k = 0;
    for (const [sx, sz, dx, dz] of sides) {
      for (let s = 0; s < per; s++) {
        const t = s / per;
        const x = sx + dx * t;
        const z = sz + dz * t;
        this.markerPos[k++] = x;
        this.markerPos[k++] = fixedY ?? Math.max(0, h(x, z)) + 0.35;
        this.markerPos[k++] = z;
      }
    }
    (this.marker.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    this.marker.visible = true;
  }

  onKey(code: string): boolean {
    if (code === 'Escape' && this.selected) {
      this.clearSelection();
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.roadHighlight.tick(dt);
  }
}
