import { Mesh, MeshBasicMaterial, type Vector3 } from 'three';
import type { DecorToolState } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { getProp, PROPS } from '../data/decor';
import { partsGeometry } from '../entities/building/BuildingModels';
import type { Tool, ToolContext } from './Tool';

/** Rotation step (degrees) for R. */
const ROT_STEP = 45;

/**
 * Decorations: a translucent preview follows the cursor (green: fits, red:
 * not here); click to place, R to rotate. Benches, gazebos, fountains,
 * playground sets, kiosks… purely cosmetic; each placement is undoable and
 * the bulldozer gives half the price back.
 */
export class DecorTool implements Tool {
  readonly id = 'decor' as const;
  state: DecorToolState = { defId: PROPS[0].id, rot: 0, error: null };
  private readonly ghostMat = new MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.55, depthWrite: false });
  private ghost: Mesh;
  private ground: Vector3 | null = null;
  private downX = 0;
  private downY = 0;

  constructor(private readonly ctx: ToolContext) {
    this.ghost = new Mesh(partsGeometry(getProp(this.state.defId).parts), this.ghostMat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 7;
    ctx.overlay.add(this.ghost);
  }

  setState(patch: Partial<DecorToolState>): void {
    const prev = this.state.defId;
    this.state = { ...this.state, ...patch };
    if (this.state.defId !== prev) {
      this.ghost.geometry.dispose();
      this.ghost.geometry = partsGeometry(getProp(this.state.defId).parts);
    }
    this.refresh();
  }

  activate(): void {
    this.refresh();
  }

  deactivate(): void {
    this.ghost.visible = false;
  }

  private refresh(): void {
    const g = this.ground;
    let error: string | null = null;
    if (g) {
      error = this.ctx.city.propError(this.state.defId, g.x, g.z);
      this.ghost.visible = true;
      this.ghost.position.set(g.x, this.ctx.world.heightAt(g.x, g.z) + 0.02, g.z);
      this.ghost.rotation.y = (this.state.rot * Math.PI) / 180;
      this.ghostMat.color.setHex(error ? 0xef4444 : 0x34d399);
    } else this.ghost.visible = false;
    this.state = { ...this.state, error };
    this.ctx.events.emit('decorTool', { ...this.state });
  }

  onPointerDown(p: PointerInfo): void {
    this.downX = p.x;
    this.downY = p.y;
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    this.ground = ground ? ground.clone() : null;
    this.refresh();
  }

  onPointerUp(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button !== MouseButton.Left || !ground || Math.hypot(p.x - this.downX, p.y - this.downY) > 5) return;
    const def = getProp(this.state.defId);
    const err = this.ctx.city.propError(def.id, ground.x, ground.z);
    if (err) {
      this.ctx.events.emit('toast', { kind: 'error', text: err });
      return;
    }
    if (this.ctx.city.placeProp(def.id, ground.x, ground.z, (this.state.rot * Math.PI) / 180)) this.ctx.events.emit('sfx', 'place');
    this.refresh();
  }

  onKey(code: string): boolean {
    if (code === 'KeyR') {
      this.setState({ rot: (this.state.rot + ROT_STEP) % 360 });
      return true;
    }
    return false;
  }

  update(): void {}
}
