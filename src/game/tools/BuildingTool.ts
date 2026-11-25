import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, type Vector3 } from 'three';
import { CELL_SIZE } from '../core/config';
import { MouseButton, type PointerInfo } from '../core/Input';
import { buildingsInGroup, getBuilding, type BuildingDef } from '../data/buildings';
import type { ArchStyle } from '../data/styles';
import { layerForBuilding } from '../rendering/InfoLayers';
import { type BuildingPlan, type Rotation } from '../entities/building/BuildingPlacement';
import { gridPlanNear } from './placement/nearLot';
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
  /** Architecture for hand-placed growables. */
  private style: ArchStyle = 'modern';
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

  setStyle(style: ArchStyle): void {
    if (style === this.style) return;
    this.style = style;
    if (this.def.zone) this.rebuildGhost();
  }

  setBuildingType(id: string): void {
    const def = getBuilding(id);
    // The landmark tool also places zoned (growable) buildings by hand.
    const growable = !!def.zone && this.group === 'landmark';
    if (!growable && (def.group ?? 'landmark') !== this.group) return;
    this.def = def;
    this.rebuildGhost();
    this.ctx.showLayer(layerForBuilding(def.id));
    this.refresh();
  }

  private rebuildGhost(): void {
    this.ghost.clear();
    const g = buildingGeometry(this.def, 0, true, this.def.zone ? this.style : 'modern');
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
    // Near an angled or curved road the building is pulled to it (any angle), unless the player turned it by hand.
    const magnet = this.manualRotation ? null : city.magnetPlan(this.def.id, g.x, g.z);
    const plan = magnet ?? gridPlanNear(city, this.def, g.x, g.z, this.rot, this.manualRotation, (i, j, r) => city.planBuilding(this.def.id, i, j, r, true));
    if (!magnet && !this.manualRotation) this.rot = plan.rot;
    this.plan = plan;
    this.ghost.visible = true;
    // Drawn up to the kerb, as the placed building will be.
    if (plan.free) {
      this.ghost.position.set(plan.free.x, plan.baseY + 0.05, plan.free.z);
      this.ghost.rotation.y = plan.free.yaw;
    } else {
      const snap = city.roadSnap(plan.i, plan.j, plan.w, plan.d, plan.rot);
      this.ghost.position.set(plan.centerX + (snap?.x ?? 0), plan.baseY + 0.05, plan.centerZ + (snap?.z ?? 0));
      this.ghost.rotation.y = (plan.rot * Math.PI) / 2 + (snap?.yaw ?? 0);
    }
    const svc = this.def.service;
    const radius = svc ? svc.radius * CELL_SIZE : this.def.landValueEffect ? this.def.landValueEffect.radius * CELL_SIZE : 0;
    this.ring.visible = radius > 0;
    if (radius > 0) {
      this.ring.position.set(plan.centerX, plan.baseY + 1, plan.centerZ);
      this.ring.scale.setScalar(radius);
    }
    // Orange: it can go here, but demolishes what stands on the lot.
    this.ghostMat.color.setHex(!plan.valid ? 0xf87171 : plan.bulldoze?.length ? 0xf59e0b : 0x34d399);
    if (plan.free) this.ctx.world.terrainMaterial.clearHover();
    else this.ctx.world.terrainMaterial.setHover(
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
      bulldoze: plan.bulldoze?.length ?? 0,
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
    const b = this.def.zone
      ? this.ctx.city.placeGrowable(plan, this.style, Math.random(), this.ctx.tick())
      : this.ctx.city.placeBuilding(plan);
    if (b) {
      this.ctx.events.emit('sfx', 'place');
      this.ctx.events.emit('toast', { kind: 'success', text: this.def.zone ? `${this.def.name} inşaatı başladı` : `${this.def.name} inşa edildi` });
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
