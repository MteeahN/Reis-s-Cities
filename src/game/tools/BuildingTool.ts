import { DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, type Vector3 } from 'three';
import { CELL_SIZE, GRID_CELLS } from '../core/config';
import { MouseButton, type PointerInfo } from '../core/Input';
import { buildingsInGroup, getBuilding, type BuildingDef } from '../data/buildings';
import type { ArchStyle } from '../data/styles';
import { layerForBuilding } from '../rendering/InfoLayers';
import { anchorFor, bestRotation, frontCells, frontStep, type BuildingPlan, type Rotation } from '../entities/building/BuildingPlacement';
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
    if (!this.manualRotation) this.rot = bestRotation(this.def, g.x, g.z, this.rot, city.placementWorld);
    const { i, j } = anchorFor(this.def, this.rot, g.x, g.z);
    let plan = city.planBuilding(this.def.id, i, j, this.rot);
    if (!plan.valid) {
      // Curved and diagonal roads rarely line up with whole cells: try the
      // nearby lots (and turns, unless the player chose one) and take the
      // closest that fits and faces a road.
      const rots: Rotation[] = this.manualRotation ? [this.rot] : [this.rot, ((this.rot + 1) % 4) as Rotation, ((this.rot + 3) % 4) as Rotation, ((this.rot + 2) % 4) as Rotation];
      let best: typeof plan | null = null;
      let bestD = Infinity;
      for (const r of rots) {
        const a = anchorFor(this.def, r, g.x, g.z);
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            const p = city.planBuilding(this.def.id, a.i + di, a.j + dj, r);
            if (!p.valid) continue;
            // Prefer lots whose front meets the road: straight up against it, or turned and moved to its kerb.
            const flush = frontCells(p.i, p.j, p.w, p.d, p.rot, 1).every(([ci, cj]) => city.occupancy.road[cj * GRID_CELLS + ci] > 0);
            const meets = flush || city.roadSnap(p.i, p.j, p.w, p.d, p.rot) !== null;
            const dd = Math.hypot(p.centerX - g.x, p.centerZ - g.z) + (r === this.rot ? 0 : 2) + (meets ? 0 : 6);
            if (dd < bestD) (bestD = dd), (best = p);
          }
        }
      }
      if (best) {
        plan = best;
        if (!this.manualRotation) this.rot = best.rot;
      } else if (!plan.roadAccess) {
        // Slide one cell toward the front so the building hugs a nearby road.
        const [si, sj] = frontStep(this.rot);
        const slid = city.planBuilding(this.def.id, i + si, j + sj, this.rot);
        if (slid.roadAccess) plan = slid;
      }
    }
    this.plan = plan;
    this.ghost.visible = true;
    // Drawn up to the kerb, as the placed building will be.
    const snap = city.roadSnap(plan.i, plan.j, plan.w, plan.d, plan.rot);
    this.ghost.position.set(plan.centerX + (snap?.x ?? 0), plan.baseY + 0.05, plan.centerZ + (snap?.z ?? 0));
    this.ghost.rotation.y = (plan.rot * Math.PI) / 2 + (snap?.yaw ?? 0);
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
