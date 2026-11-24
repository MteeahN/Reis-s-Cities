import type { Vector3 } from 'three';
import type { PaintToolState } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { getPaint } from '../data/decor';
import { RoadPreview } from './placement/RoadPreview';
import type { Tool, ToolContext } from './Tool';

/**
 * Ground paint: hold the left button and move to paint the ground with
 * cobbles, tiles, bricks, gravel, sand, lawn, wood decking or asphalt (or
 * erase). Squares, courtyards and paths; purely cosmetic. Each stroke is one
 * undoable action and costs the paint's price per m².
 */
export class PaintTool implements Tool {
  readonly id = 'paint' as const;
  state: PaintToolState = { paint: 1, radius: 4 };
  private readonly preview = new RoadPreview();
  private ground: Vector3 | null = null;
  private pressed = false;
  private warned = false;

  constructor(private readonly ctx: ToolContext) {
    ctx.overlay.add(this.preview.group);
  }

  setState(patch: Partial<PaintToolState>): void {
    this.state = { ...this.state, ...patch };
    this.ctx.events.emit('paintTool', { ...this.state });
    this.draw();
  }

  activate(): void {
    this.ctx.events.emit('paintTool', { ...this.state });
  }

  deactivate(): void {
    this.finish();
    this.preview.hide();
  }

  private draw(): void {
    if (!this.ground) return this.preview.hide();
    this.preview.hidePath();
    this.preview.setMarkers([{ x: this.ground.x, z: this.ground.z }], this.state.radius, this.ctx.world.heightAt);
  }

  private apply(): void {
    if (!this.ground) return;
    const res = this.ctx.city.paintGround(this.state.paint, this.ground.x, this.ground.z, this.state.radius);
    if (res.error && !this.warned) {
      this.warned = true;
      this.ctx.events.emit('toast', { kind: res.error === 'Yetersiz bütçe' ? 'error' : 'warning', text: res.error });
    }
  }

  private finish(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.ctx.city.endPaintStroke();
  }

  onPointerDown(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button !== MouseButton.Left || !ground) return;
    this.ground = ground.clone();
    this.pressed = true;
    this.warned = false;
    const name = this.state.paint ? (getPaint(this.state.paint)?.name ?? 'Kaplama') : 'Kaplama';
    this.ctx.city.beginPaintStroke(this.state.paint ? `${name} döşeme` : 'Kaplamayı silme');
    this.apply();
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    this.ground = ground ? ground.clone() : null;
    if (this.pressed) this.apply();
    this.draw();
  }

  onPointerUp(p: PointerInfo): void {
    if (p.button === MouseButton.Left) this.finish();
  }

  onKey(code: string): boolean {
    const sizes: PaintToolState['radius'][] = [2, 4, 8];
    const i = sizes.indexOf(this.state.radius);
    if (code === 'BracketRight' || code === 'Equal') {
      this.setState({ radius: sizes[Math.min(2, i + 1)] });
      return true;
    }
    if (code === 'BracketLeft' || code === 'Minus') {
      this.setState({ radius: sizes[Math.max(0, i - 1)] });
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.preview.tick(dt);
  }
}
