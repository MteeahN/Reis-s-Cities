import type { Vector3 } from 'three';
import { CELL_SIZE } from '../core/config';
import { MouseButton, type PointerInfo } from '../core/Input';
import { LINE_TYPES, type LineKind } from '../data/infrastructure';
import type { P2 } from '../entities/road/curve';
import type { LinePlan } from '../systems/City';
import { RoadPreview } from './placement/RoadPreview';
import { snapSegment, snapToGrid } from './placement/snapping';
import type { Tool, ToolContext } from './Tool';

const WIDTH: Record<LineKind, number> = { power: 2.5, pipe: 3 };

/**
 * Draws straight power-line or pipe segments: click a start, click an end
 * (keeps chaining from the end). Snaps to existing segment ends, then to the
 * grid and 15° steps; Ctrl draws freely. Right click / ESC stops.
 */
export class LineTool implements Tool {
  private readonly preview = new RoadPreview();
  private start: P2 | null = null;
  private cursor: P2 | null = null;
  private plan: LinePlan | null = null;
  private free = false;
  private rightDown = { x: 0, y: 0 };

  constructor(
    private readonly ctx: ToolContext,
    readonly id: 'powerline' | 'pipe',
    private readonly kind: LineKind,
  ) {
    ctx.overlay.add(this.preview.group);
  }

  activate(): void {
    this.ctx.showLayer(this.kind === 'power' ? 'power' : 'water');
  }

  deactivate(): void {
    this.cancel();
    this.preview.hide();
    this.ctx.showLayer(null);
  }

  private cancel(): void {
    this.start = null;
    this.plan = null;
    this.ctx.events.emit('linePlan', null);
  }

  private snap(ground: Vector3, forEnd: boolean): P2 {
    const lines = this.ctx.city.linesOf(this.kind);
    const end = lines.nearestEnd(ground.x, ground.z, 8);
    if (end) return { ...end };
    // Join onto the middle of an existing segment (a T junction).
    const onLine = lines.nearestPoint(ground.x, ground.z, 6);
    if (onLine) return onLine.p;
    const raw = { x: ground.x, z: ground.z };
    if (this.free) return raw;
    if (forEnd && this.start) return snapSegment(this.start, raw, 15, CELL_SIZE);
    return snapToGrid(raw, CELL_SIZE);
  }

  private refresh(): void {
    const h = this.ctx.world.heightAt;
    if (!this.cursor) {
      this.preview.hide();
      return;
    }
    if (!this.start) {
      this.preview.hidePath();
      this.preview.setMarkers([this.cursor], 3, h);
      return;
    }
    this.plan = this.ctx.city.planLine(this.kind, this.start, this.cursor);
    this.preview.showPath([this.start, this.cursor], WIDTH[this.kind], this.plan.valid ? (this.kind === 'pipe' ? 'upgrade' : 'valid') : 'invalid', h);
    this.preview.setMarkers([this.start, this.cursor], 3, h);
    const p = this.plan;
    if (!p.valid) {
      this.ctx.events.emit('linePlan', { kind: this.kind, length: p.length, cost: p.cost, weeklyMaintenance: p.weeklyMaintenance, valid: false, errors: p.errors, joins: 0, crossings: 0 });
      return;
    }
    const { joins, crossings } = this.connections(this.start, this.cursor);
    this.ctx.events.emit('linePlan', { kind: this.kind, length: p.length, cost: p.cost, weeklyMaintenance: p.weeklyMaintenance, valid: p.valid, errors: p.errors, joins, crossings });
  }

  /** How the planned segment connects to the existing network. */
  private connections(a: P2, b: P2): { joins: number; crossings: number } {
    const lines = this.ctx.city.linesOf(this.kind);
    const touching = new Set<number>();
    let joins = 0;
    for (const p of [a, b]) {
      const hit = lines.nearestPoint(p.x, p.z, 0.5);
      if (hit) {
        joins++;
        touching.add(hit.line.id);
      }
    }
    let crossings = 0;
    for (const l of lines.lines.values()) if (!touching.has(l.id) && segmentsCross(a, b, l.a, l.b)) crossings++;
    return { joins, crossings };
  }

  onPointerMove(p: PointerInfo, ground: Vector3 | null): void {
    this.free = p.ctrl;
    this.cursor = ground ? this.snap(ground, true) : null;
    this.refresh();
  }

  onPointerDown(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button === MouseButton.Right) {
      this.rightDown = { x: p.x, y: p.y };
      return;
    }
    if (p.button !== MouseButton.Left || !ground) return;
    this.free = p.ctrl;
    if (!this.start) {
      this.start = this.snap(ground, false);
      this.cursor = this.start;
      this.refresh();
      return;
    }
    const plan = this.plan;
    if (!plan) return;
    if (!plan.valid) {
      this.ctx.events.emit('toast', { kind: 'error', text: plan.errors[0] });
      return;
    }
    if (this.ctx.city.buildLine(plan)) {
      this.ctx.events.emit('sfx', 'line');
      this.start = { ...plan.b };
      this.refresh();
    }
  }

  onPointerUp(p: PointerInfo): void {
    if (p.button === MouseButton.Right && this.start && Math.hypot(p.x - this.rightDown.x, p.y - this.rightDown.y) < 5) {
      this.cancel();
      this.refresh();
    }
  }

  onKey(code: string): boolean {
    if (code === 'Escape' && this.start) {
      this.cancel();
      this.refresh();
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.preview.tick(dt);
  }

  get lineType() {
    return LINE_TYPES[this.kind];
  }
}

/** True when segments ab and cd properly intersect. */
function segmentsCross(a: P2, b: P2, c: P2, d: P2): boolean {
  const o = (p: P2, q: P2, r: P2) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
