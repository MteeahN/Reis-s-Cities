import { Group, Mesh, MeshBasicMaterial, type Vector3 } from 'three';
import { CELL_SIZE, GRID_CELLS } from '../core/config';
import { MouseButton, type PointerInfo } from '../core/Input';
import { getBuilding } from '../data/buildings';
import { anchorFor, type BuildingPlan, type Rotation } from '../entities/building/BuildingPlacement';
import { buildingGeometry } from '../entities/building/BuildingModels';
import type { Tool, ToolContext } from './Tool';

/**
 * Moves hand-placed buildings (landmarks, services, utilities) for free:
 * click a building to pick it up, a ghost follows the cursor (R rotates),
 * click again to drop it. Right click or ESC puts it back. Zoned buildings
 * grow where they stand and cannot be moved.
 */
export class MoveTool implements Tool {
  readonly id = 'move' as const;
  private picked: number | null = null;
  private rot: Rotation = 0;
  private plan: BuildingPlan | null = null;
  private lastGround: Vector3 | null = null;
  private readonly ghost = new Group();
  private readonly ghostMat = new MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.45, depthWrite: false });

  constructor(private readonly ctx: ToolContext) {
    this.ghost.visible = false;
    this.ghost.renderOrder = 7;
    ctx.overlay.add(this.ghost);
  }

  activate(): void {
    this.drop();
    this.ctx.events.emit('toast', { kind: 'info', text: 'Taşımak istediğiniz binaya tıklayın (bölge binaları taşınamaz)' });
  }

  deactivate(): void {
    this.drop();
  }

  private drop(): void {
    this.picked = null;
    this.plan = null;
    this.ghost.visible = false;
    this.ctx.world.terrainMaterial.clearHover();
  }

  private pickUp(id: number): void {
    const b = this.ctx.city.buildings.items.get(id);
    if (!b) return;
    if (b.zone) {
      this.ctx.events.emit('toast', { kind: 'warning', text: 'Bölge binaları taşınamaz; yıkıp yeniden yerleştirin' });
      return;
    }
    this.picked = id;
    this.rot = b.rot;
    this.ghost.clear();
    const g = buildingGeometry(getBuilding(b.defId), 0, true, 'modern');
    for (const geo of [g.plain, g.facade, g.detail]) if (geo) this.ghost.add(new Mesh(geo, this.ghostMat));
    this.refresh();
  }

  private refresh(): void {
    const g = this.lastGround;
    if (this.picked === null || !g) {
      this.ghost.visible = false;
      return;
    }
    const b = this.ctx.city.buildings.items.get(this.picked);
    if (!b) return this.drop();
    const { i, j } = anchorFor(getBuilding(b.defId), this.rot, g.x, g.z);
    const plan = this.ctx.city.planMove(this.picked, i, j, this.rot);
    this.plan = plan;
    if (!plan) return;
    this.ghost.visible = true;
    this.ghost.position.set(plan.centerX, plan.baseY + 0.05, plan.centerZ);
    this.ghost.rotation.y = (plan.rot * Math.PI) / 2;
    this.ghostMat.color.setHex(plan.valid ? 0x34d399 : 0xf87171);
    this.ctx.world.terrainMaterial.setHover(plan.i * CELL_SIZE, plan.j * CELL_SIZE, (plan.i + plan.w) * CELL_SIZE, (plan.j + plan.d) * CELL_SIZE, plan.valid ? 0x34d399 : 0xff6b6b);
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    this.lastGround = ground ? ground.clone() : null;
    this.refresh();
  }

  onPointerDown(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button === MouseButton.Right) {
      if (this.picked !== null) this.drop();
      return;
    }
    if (p.button !== MouseButton.Left || !ground) return;
    this.lastGround = ground.clone();
    if (this.picked === null) {
      const i = Math.floor(ground.x / CELL_SIZE);
      const j = Math.floor(ground.z / CELL_SIZE);
      if (i < 0 || j < 0 || i >= GRID_CELLS || j >= GRID_CELLS) return;
      const id = this.ctx.city.occupancy.buildingAt(i, j);
      if (id) this.pickUp(id);
      return;
    }
    this.refresh();
    const plan = this.plan;
    if (!plan) return;
    if (!plan.valid) {
      this.ctx.events.emit('toast', { kind: 'error', text: plan.errors[0] });
      return;
    }
    const name = getBuilding(plan.defId).name;
    if (this.ctx.city.moveBuilding(this.picked, plan.i, plan.j, plan.rot)) {
      this.ctx.events.emit('sfx', 'place');
      this.ctx.events.emit('toast', { kind: 'success', text: `${name} taşındı` });
    }
    this.drop();
  }

  onPointerUp(): void {}

  onKey(code: string): boolean {
    if (code === 'KeyR' && this.picked !== null) {
      this.rot = ((this.rot + 1) % 4) as Rotation;
      this.refresh();
      return true;
    }
    if (code === 'Escape' && this.picked !== null) {
      this.drop();
      return true;
    }
    return false;
  }

  update(): void {}
}
