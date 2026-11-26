import { Group, Mesh, MeshBasicMaterial, type Vector3 } from 'three';
import { CELL_SIZE, GRID_CELLS } from '../core/config';
import { MouseButton, type PointerInfo } from '../core/Input';
import { getBuilding } from '../data/buildings';
import { type BuildingPlan, type Rotation } from '../entities/building/BuildingPlacement';
import { buildingGeometry } from '../entities/building/BuildingModels';
import { gridPlanNear } from './placement/nearLot';
import type { Tool, ToolContext } from './Tool';

/**
 * Moves hand-placed buildings (landmarks, services, utilities) for free:
 * click a building to pick it up, a ghost follows the cursor (R rotates),
 * click again to drop it. Right click or ESC puts it back. Like a new
 * building it turns to face the nearest road and is pulled to an angled or
 * curved road's kerb (R turns it by hand, which stops both). Zoned buildings
 * move too, with their residents or jobs, level and style; the cells they
 * land on take their zone.
 */
export class MoveTool implements Tool {
  readonly id = 'move' as const;
  private picked: number | null = null;
  private rot: Rotation = 0;
  /** Turned with R: keep that turn, no road magnet. */
  private manualRotation = false;
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
    this.ctx.events.emit('toast', { kind: 'info', text: 'Taşımak istediğiniz binaya tıklayın' });
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
    this.picked = id;
    this.rot = b.rot;
    this.manualRotation = false;
    this.ghost.clear();
    const def = getBuilding(b.defId);
    const g = buildingGeometry(def, 0, true, def.zone ? (b.style ?? 'modern') : 'modern');
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
    const city = this.ctx.city;
    const id = this.picked;
    const def = getBuilding(b.defId);
    // Pulled to an angled road like a new building, else the nearest lot facing a road.
    const magnet = this.manualRotation ? null : city.magnetMove(id, g.x, g.z);
    const plan = magnet ?? gridPlanNear(city, def, g.x, g.z, this.rot, this.manualRotation, (i, j, r) => city.planMove(id, i, j, r)!);
    if (!magnet && !this.manualRotation) this.rot = plan.rot;
    this.plan = plan;
    this.ghost.visible = true;
    // Drawn where it will stand: at the kerb (turned to an angled road, or moved up to a straight one).
    if (plan.free) {
      this.ghost.position.set(plan.free.x, plan.baseY + 0.05, plan.free.z);
      this.ghost.rotation.y = plan.free.yaw;
    } else {
      const snap = city.roadSnap(plan.i, plan.j, plan.w, plan.d, plan.rot);
      this.ghost.position.set(plan.centerX + (snap?.x ?? 0), plan.baseY + 0.05, plan.centerZ + (snap?.z ?? 0));
      this.ghost.rotation.y = (plan.rot * Math.PI) / 2 + (snap?.yaw ?? 0);
    }
    this.ghostMat.color.setHex(plan.valid ? 0x34d399 : 0xf87171);
    if (plan.free) this.ctx.world.terrainMaterial.clearHover();
    else this.ctx.world.terrainMaterial.setHover(plan.i * CELL_SIZE, plan.j * CELL_SIZE, (plan.i + plan.w) * CELL_SIZE, (plan.j + plan.d) * CELL_SIZE, plan.valid ? 0x34d399 : 0xff6b6b);
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
      const id = this.ctx.city.buildingAtWorld(ground.x, ground.z);
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
    if (this.ctx.city.moveBuilding(this.picked, plan.i, plan.j, plan.rot, plan.free)) {
      this.ctx.events.emit('sfx', 'place');
      this.ctx.events.emit('toast', { kind: 'success', text: `${name} taşındı` });
    }
    this.drop();
  }

  onPointerUp(): void {}

  onKey(code: string): boolean {
    if (code === 'KeyR' && this.picked !== null) {
      this.rot = ((this.rot + 1) % 4) as Rotation;
      this.manualRotation = true;
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
