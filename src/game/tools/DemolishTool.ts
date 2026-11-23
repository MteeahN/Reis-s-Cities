import type { Vector3 } from 'three';
import { CELL_SIZE } from '../core/config';
import type { DemolishTarget } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { getBuilding } from '../data/buildings';
import { getRoadType } from '../data/roads';
import { LINE_TYPES } from '../data/infrastructure';
import { sampleBezier } from '../entities/road/curve';
import { RoadPreview } from './placement/RoadPreview';
import type { Tool, ToolContext } from './Tool';

/** Bulldozer: hover highlights a road segment or building in red, click removes it (50% refund). */
export class DemolishTool implements Tool {
  readonly id = 'demolish' as const;
  private readonly preview = new RoadPreview();
  private target: DemolishTarget | null = null;
  private downX = 0;
  private downY = 0;

  constructor(private readonly ctx: ToolContext) {
    ctx.overlay.add(this.preview.group);
  }

  activate(): void {}

  deactivate(): void {
    this.setTarget(null);
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
    const i = Math.floor(ground.x / CELL_SIZE);
    const j = Math.floor(ground.z / CELL_SIZE);
    const bid = city.occupancy.buildingAt(i, j);
    if (bid) {
      const b = city.buildings.items.get(bid)!;
      return { kind: 'building', id: bid, name: getBuilding(b.defId).name, refund: city.buildingRefund(bid) };
    }
    const hit = city.roads.nearestEdge(ground.x, ground.z, 1, true);
    if (hit) return { kind: 'road', id: hit.edge.id, name: getRoadType(hit.edge.typeId).name, refund: city.roadRefund(hit.edge.id) };
    const line = city.powerLines.nearest(ground.x, ground.z, 4);
    if (line) return { kind: 'powerline', id: line.id, name: LINE_TYPES.power.name, refund: city.lineRefund('power', line.id) };
    const pipe = city.pipes.nearest(ground.x, ground.z, 4);
    if (pipe) return { kind: 'pipe', id: pipe.id, name: LINE_TYPES.pipe.name, refund: city.lineRefund('pipe', pipe.id) };
    return null;
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
    if (!t) return;
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

  onKey(): boolean {
    return false;
  }

  update(dt: number): void {
    this.preview.tick(dt);
  }
}
