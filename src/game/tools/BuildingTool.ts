import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, type Vector3 } from 'three';
import { CELL_SIZE } from '../core/config';
import { MouseButton, type PointerInfo } from '../core/Input';
import { buildingsInGroup, getBuilding, type BuildingDef } from '../data/buildings';
import { layerForBuilding } from '../rendering/InfoLayers';
import { anchorFor, bestRotation, frontStep, type BuildingPlan, type Rotation } from '../entities/building/BuildingPlacement';
import { buildingGeometry } from '../entities/building/BuildingModels';
import type { Tool, ToolContext } from './Tool';

/**
 * Places catalogue buildings. A translucent ghost follows the cursor snapped
 * to the cell grid; the footprint is highlighted on the terrain in green/red.
 * The building auto-turns to face an adjacent road until R is pressed, after
 * which R rotates it manually in 90° steps.
 */
export class BuildingTool implements Tool {
  private def: BuildingDef;
  private rot: Rotation = 0;
  private manualRotation = false;
  private plan: BuildingPlan | null = null;
  private lastGround: Vector3 | null = null;
  private readonly ghost = new Group();
  private readonly ghostMat = new MeshBasicMaterial({ color: 0x34d399, transparent: true, opacity: 0.45, depthWrite: false });
  /** Coverage radius ring for service buildings. */
  private readonly ring = new Mesh(
    new RingGeometry(0.985, 1, 96).rotateX(-Math.PI / 2),
    new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, depthTest: false, side: DoubleSide }),
  );

  constructor(
    private readonly ctx: ToolContext,
    readonly id: 'building' | 'power' | 'water' | 'services',
    readonly group: NonNullable<BuildingDef['group']>,
  ) {
    this.def = buildingsInGroup(group)[0];
    this.ring.visible = false;
    this.ring.renderOrder = 8;
    ctx.overlay.add(this.ring);
    this.ghost.visible = false;
    this.ghost.renderOrder = 7;
    ctx.overlay.add(this.ghost);
    this.rebuildGhost();
  }

  get buildingType(): string {
    return this.def.id;
  }

  setBuildingType(id: string): void {
    const def = getBuilding(id);
    if ((def.group ?? 'landmark') !== this.group) return;
    this.def = def;
    this.rebuildGhost();
    this.ctx.showLayer(layerForBuilding(def.id));
    this.refresh();
  }

  private rebuildGhost(): void {
    this.ghost.clear();
    const g = buildingGeometry(this.def);
    for (const geo of [g.plain, g.facade, g.detail]) if (geo) this.ghost.add(new Mesh(geo, this.ghostMat));
  }

  activate(): void {
    this.manualRotation = false;
    this.ctx.showLayer(this.group === 'landmark' ? null : layerForBuilding(this.def.id));
    this.ctx.events.emit('buildingType', this.def.id);
    this.refresh();
  }

  deactivate(): void {
    this.ghost.visible = false;
    this.ring.visible = false;
    this.ctx.showLayer(null);
    this.plan = null;
    this.ctx.world.terrainMaterial.clearHover();
    this.ctx.events.emit('buildingPlan', null);
  }

  private refresh(): void {
    const g = this.lastGround;
    if (!g) {
      this.ghost.visible = false;
      this.ctx.world.terrainMaterial.clearHover();
      return;
    }
    const city = this.ctx.city;
    if (!this.manualRotation) this.rot = bestRotation(this.def, g.x, g.z, this.rot, city.placementWorld);
    const { i, j } = anchorFor(this.def, this.rot, g.x, g.z);
    let plan = city.planBuilding(this.def.id, i, j, this.rot);
    if (!plan.roadAccess) {
      // Slide one cell toward the front so the building hugs a nearby road.
      const [si, sj] = frontStep(this.rot);
      const slid = city.planBuilding(this.def.id, i + si, j + sj, this.rot);
      if (slid.roadAccess) plan = slid;
    }
    this.plan = plan;
    this.ghost.visible = true;
    this.ghost.position.set(plan.centerX, plan.baseY + 0.05, plan.centerZ);
    this.ghost.rotation.y = (plan.rot * Math.PI) / 2;
    const svc = this.def.service;
    const radius = svc ? svc.radius * CELL_SIZE : this.def.landValueEffect ? this.def.landValueEffect.radius * CELL_SIZE : 0;
    this.ring.visible = radius > 0;
    if (radius > 0) {
      this.ring.position.set(plan.centerX, plan.baseY + 1, plan.centerZ);
      this.ring.scale.setScalar(radius);
    }
    this.ghostMat.color.setHex(plan.valid ? 0x34d399 : 0xf87171);
    this.ctx.world.terrainMaterial.setHover(
      plan.i * CELL_SIZE,
      plan.j * CELL_SIZE,
      (plan.i + plan.w) * CELL_SIZE,
      (plan.j + plan.d) * CELL_SIZE,
      plan.valid ? 0x34d399 : 0xff6b6b,
    );
    this.ctx.events.emit('buildingPlan', {
      defId: plan.defId,
      valid: plan.valid,
      errors: plan.errors,
      cost: plan.cost,
      rot: plan.rot,
      w: plan.w,
      d: plan.d,
    });
  }

  onPointerMove(_p: PointerInfo, ground: Vector3 | null): void {
    this.lastGround = ground ? ground.clone() : null;
    this.refresh();
  }

  onPointerDown(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button !== MouseButton.Left || !ground) return;
    this.lastGround = ground.clone();
    this.refresh();
    const plan = this.plan;
    if (!plan) return;
    if (!plan.valid) {
      this.ctx.events.emit('toast', { kind: 'error', text: plan.errors[0] });
      return;
    }
    const b = this.ctx.city.placeBuilding(plan);
    if (b) {
      this.ctx.events.emit('sfx', 'place');
      this.ctx.events.emit('toast', { kind: 'success', text: `${this.def.name} inşa edildi` });
    }
    this.refresh();
  }

  onPointerUp(): void {}

  onKey(code: string): boolean {
    if (code === 'KeyR') {
      this.rot = ((this.rot + 1) % 4) as Rotation;
      this.manualRotation = true;
      this.refresh();
      return true;
    }
    return false;
  }

  update(): void {}
}
