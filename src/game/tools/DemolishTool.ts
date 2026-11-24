import type { Vector3 } from 'three';
import { CELL_SIZE } from '../core/config';
import type { DemolishFilter, DemolishTarget } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { getBuilding } from '../data/buildings';
import { getRoadType } from '../data/roads';
import { LINE_TYPES } from '../data/infrastructure';
import { sampleBezier } from '../entities/road/curve';
import { RoadPreview } from './placement/RoadPreview';
import type { Tool, ToolContext } from './Tool';

/**
 * Bulldozer: hover highlights a road segment, building, power line or pipe in
 * red, click removes it (refund). A filter limits picking to one kind. With
 * "all", a power line wins over the road under it when the cursor is on the
 * line, and pipes are picked only while they are visible (water view).
 */
export class DemolishTool implements Tool {
  readonly id = 'demolish' as const;
  private readonly preview = new RoadPreview();
  private target: DemolishTarget | null = null;
  private downX = 0;
  private downY = 0;
  filter: DemolishFilter = 'all';

  constructor(private readonly ctx: ToolContext) {
    ctx.overlay.add(this.preview.group);
  }

  activate(): void {
    this.applyLayer();
  }

  setFilter(f: DemolishFilter): void {
    this.filter = f;
    this.ctx.events.emit('demolishFilter', f);
    this.applyLayer();
    this.setTarget(null);
  }

  /** Pipes are underground: show the water view while pipes may be picked. */
  private applyLayer(): void {
    this.ctx.showLayer(this.filter === 'pipe' ? 'water' : this.filter === 'powerline' ? 'power' : null);
  }

  deactivate(): void {
    this.setTarget(null);
    this.ctx.showLayer(null);
  }

  private setTarget(t: DemolishTarget | null): void {
    this.target = t;
    if (!t) {
      this.preview.hide();
      this.ctx.world.terrainMaterial.clearHover();
    }
    this.ctx.events.emit('demolishTarget', t);
  }

  private find(ground: Vector3 | null): DemolishTarget | null {
    if (!ground) return null;
    const city = this.ctx.city;
    const f = this.filter;
    const allow = (k: DemolishFilter) => f === 'all' || f === k;
    const powerTarget = (radius: number): DemolishTarget | null => {
      const line = city.powerLines.nearest(ground.x, ground.z, radius);
      return line ? { kind: 'powerline', id: line.id, name: LINE_TYPES.power.name, refund: city.lineRefund('power', line.id) } : null;
    };
    const pipeTarget = (radius: number): DemolishTarget | null => {
      const pipe = city.pipes.nearest(ground.x, ground.z, radius);
      return pipe ? { kind: 'pipe', id: pipe.id, name: LINE_TYPES.pipe.name, refund: city.lineRefund('pipe', pipe.id) } : null;
    };
    if (f === 'powerline') return powerTarget(8);
    if (f === 'pipe') return pipeTarget(8);
    // A power line hangs above roads and lots: right on the line, the line is the target.
    if (f === 'all') {
      const onLine = powerTarget(2.5);
      if (onLine) return onLine;
      if (this.ctx.pipesVisible()) {
        const onPipe = pipeTarget(2.5);
        if (onPipe) return onPipe;
      }
    }
    const i = Math.floor(ground.x / CELL_SIZE);
    const j = Math.floor(ground.z / CELL_SIZE);
    const bid = allow('building') ? city.occupancy.buildingAt(i, j) : 0;
    if (bid) {
      const b = city.buildings.items.get(bid)!;
      return { kind: 'building', id: bid, name: getBuilding(b.defId).name, refund: city.buildingRefund(bid) };
    }
    if (allow('road')) {
      const hit = city.roads.nearestEdge(ground.x, ground.z, f === 'road' ? 4 : 1, true);
      // The city entry road is never a demolish target.
      if (hit && getRoadType(hit.edge.typeId).playerBuildable === false) return null;
      if (hit) return { kind: 'road', id: hit.edge.id, name: getRoadType(hit.edge.typeId).name, refund: city.roadRefund(hit.edge.id) };
    }
    if (f !== 'all') return null;
    return powerTarget(4) ?? (this.ctx.pipesVisible() ? pipeTarget(4) : null);
  }

  private highlight(t: DemolishTarget): void {
    const city = this.ctx.city;
    const mat = this.ctx.world.terrainMaterial;
    if (t.kind === 'powerline' || t.kind === 'pipe') {
      const l = city.linesOf(t.kind === 'powerline' ? 'power' : 'pipe').lines.get(t.id)!;
      mat.clearHover();
      this.preview.showPath([l.a, l.b], 4, 'demolish', this.ctx.world.heightAt);
    } else if (t.kind === 'road') {
      const e = city.roads.edges.get(t.id)!;
      mat.clearHover();
      this.preview.showPath(sampleBezier(city.roads.curveOf(e), 3).points, getRoadType(e.typeId).width + 1, 'demolish', this.ctx.world.heightAt);
    } else {
      const b = city.buildings.items.get(t.id)!;
      this.preview.hide();
      mat.setHover(b.i * CELL_SIZE, b.j * CELL_SIZE, (b.i + b.w) * CELL_SIZE, (b.j + b.d) * CELL_SIZE, 0xff4d4d);
    }
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    const t = this.find(ground);
    if (t?.kind === this.target?.kind && t?.id === this.target?.id) return;
    this.setTarget(t);
    if (t) this.highlight(t);
  }

  onPointerDown(p: PointerInfo): void {
    this.downX = p.x;
    this.downY = p.y;
  }

  onPointerUp(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button !== MouseButton.Left || Math.hypot(p.x - this.downX, p.y - this.downY) > 5) return;
    const t = this.find(ground);
    if (!t) {
      const hit = ground ? this.ctx.city.roads.nearestEdge(ground.x, ground.z, 4, true) : null;
      if (hit && getRoadType(hit.edge.typeId).playerBuildable === false) {
        this.ctx.events.emit('toast', { kind: 'warning', text: 'Şehir girişi yıkılamaz: göçmenler, ziyaretçiler ve yük kamyonları bu yoldan gelir.' });
      }
      return;
    }
    const city = this.ctx.city;
    const refund =
      t.kind === 'road'
        ? city.demolishRoad(t.id)
        : t.kind === 'building'
          ? city.demolishBuilding(t.id)
          : city.demolishLine(t.kind === 'powerline' ? 'power' : 'pipe', t.id);
    this.ctx.events.emit('sfx', 'demolish');
    this.ctx.events.emit('toast', { kind: 'info', text: `${t.name} yıkıldı (+₺${refund.toLocaleString('tr-TR')} iade)` });
    this.setTarget(null);
    this.onPointerMove(p, ground);
  }

  onKey(code: string): boolean {
    // Tab cycles the filter.
    if (code === 'Tab') {
      const order: DemolishFilter[] = ['all', 'road', 'building', 'powerline', 'pipe'];
      this.setFilter(order[(order.indexOf(this.filter) + 1) % order.length]);
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.preview.tick(dt);
  }
}
