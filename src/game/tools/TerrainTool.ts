import type { Vector3 } from 'three';
import type { TerrainToolState } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { TERRAIN_PRICE, type TerrainOp } from '../systems/City';
import { RoadPreview } from './placement/RoadPreview';
import type { Tool, ToolContext } from './Tool';

/** Brush radius (m) per size. */
export const TERRAIN_BRUSH: Record<TerrainToolState['size'], number> = { S: 12, M: 24, L: 40 };
/** Metres per second the brush raises / lowers at full strength. */
const RATE = 3;
/** Applications per second while the button is held. */
const TICKS = 8;

const LABEL: Record<TerrainOp, string> = {
  raise: 'Araziyi yükseltme',
  lower: 'Araziyi alçaltma',
  flatten: 'Araziyi düzleme',
  smooth: 'Araziyi yumuşatma',
  pond: 'Gölet kazma',
};

/**
 * Terrain shaping: hold the left button and move to raise, lower, flatten
 * (to the height where the stroke started), smooth, or dig a pond (below the
 * water level, so it fills with water). Roads, buildings, land not owned and
 * the map edge are left alone. Each stroke is one undoable action and costs
 * by the earth it moves.
 */
export class TerrainTool implements Tool {
  readonly id = 'terrain' as const;
  state: TerrainToolState = { op: 'raise', size: 'M', strength: 0.5 };
  private readonly preview = new RoadPreview();
  private ground: Vector3 | null = null;
  private pressed = false;
  private target = 0;
  private acc = 0;
  private warned = false;

  constructor(private readonly ctx: ToolContext) {
    ctx.overlay.add(this.preview.group);
  }

  setState(patch: Partial<TerrainToolState>): void {
    this.state = { ...this.state, ...patch };
    this.ctx.events.emit('terrainTool', { ...this.state });
    this.drawBrush();
  }

  activate(): void {
    this.ctx.events.emit('terrainTool', { ...this.state });
    this.drawBrush();
  }

  deactivate(): void {
    this.finish();
    this.preview.hide();
  }

  private drawBrush(): void {
    if (!this.ground) {
      this.preview.hide();
      return;
    }
    this.preview.hidePath();
    this.preview.setMarkers([{ x: this.ground.x, z: this.ground.z }], TERRAIN_BRUSH[this.state.size], this.ctx.world.heightAt);
  }

  private apply(dt: number): void {
    if (!this.ground) return;
    const amount = RATE * this.state.strength * dt;
    const res = this.ctx.city.editTerrain(this.state.op, this.ground.x, this.ground.z, TERRAIN_BRUSH[this.state.size], amount, this.target);
    if (res.error && !this.warned) {
      this.warned = true;
      this.ctx.events.emit('toast', { kind: res.error === 'Yetersiz bütçe' ? 'error' : 'warning', text: res.error });
    }
  }

  private finish(): void {
    if (!this.pressed) return;
    this.pressed = false;
    this.ctx.city.endTerrainStroke();
  }

  onPointerDown(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button !== MouseButton.Left || !ground) return;
    this.ground = ground.clone();
    this.pressed = true;
    this.warned = false;
    this.target = this.ctx.world.heightAt(ground.x, ground.z);
    this.ctx.city.beginTerrainStroke(LABEL[this.state.op]);
    this.acc = 0;
    this.apply(1 / TICKS);
    this.ctx.events.emit('sfx', 'zone');
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    this.ground = ground ? ground.clone() : null;
    this.drawBrush();
  }

  onPointerUp(p: PointerInfo): void {
    if (p.button === MouseButton.Left) this.finish();
  }

  onKey(code: string): boolean {
    const sizes: TerrainToolState['size'][] = ['S', 'M', 'L'];
    const i = sizes.indexOf(this.state.size);
    if (code === 'BracketRight' || code === 'Equal') {
      this.setState({ size: sizes[Math.min(2, i + 1)] });
      return true;
    }
    if (code === 'BracketLeft' || code === 'Minus') {
      this.setState({ size: sizes[Math.max(0, i - 1)] });
      return true;
    }
    if (code === 'Escape' && this.pressed) {
      this.finish();
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.preview.tick(dt);
    if (!this.pressed) return;
    this.acc += dt;
    const step = 1 / TICKS;
    while (this.acc >= step) {
      this.acc -= step;
      this.apply(step);
    }
    this.drawBrush();
  }
}

export { TERRAIN_PRICE };
