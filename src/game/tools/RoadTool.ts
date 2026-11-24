import type { Vector3 } from 'three';
import { CELL_SIZE } from '../core/config';
import type { RoadMode, RoadPlanView } from '../core/events';
import { MouseButton, type PointerInfo } from '../core/Input';
import { ROAD_TYPES, getRoadType, isRoadTypeUnlocked, type RoadTypeDef } from '../data/roads';
import { sampleBezier, type P2 } from '../entities/road/curve';
import { ELEVATION_STEP, MAX_ELEVATION, NODE_SNAP, OVERPASS_CLEARANCE, anchorElevation, planRoad, type Anchor, type RoadPlan, type UpgradePlan } from './placement/RoadPlanner';
import { RoadPreview } from './placement/RoadPreview';
import { snapSegment, snapToGrid } from './placement/snapping';
import type { Tool, ToolContext } from './Tool';

const DRAG_PX = 12;

/**
 * Road construction.
 *  - Straight: click start → click end (or press-drag-release). Keeps chaining from the end.
 *  - Curve: click start → click control point → click end (quadratic spline).
 *  - Upgrade: click an existing road to convert it to the selected type.
 * Endpoints snap to existing junctions and roads (creating junctions), otherwise
 * to the cell grid; straight segments snap to 15° steps relative to the road
 * being continued. Ctrl disables grid/angle snapping.
 * PageUp / PageDown raise and lower the deck: raised roads stand on pillars
 * and pass over roads at least OVERPASS_CLEARANCE lower; they only snap to
 * roads at about their own height.
 */
export class RoadTool implements Tool {
  readonly id = 'road' as const;
  private readonly preview = new RoadPreview();
  private type: RoadTypeDef = ROAD_TYPES[0];
  private mode: RoadMode = 'straight';
  private start: Anchor | null = null;
  private control: P2 | null = null;
  private cursor: Anchor | null = null;
  private plan: RoadPlan | null = null;
  private upgrade: UpgradePlan | null = null;
  private free = false;
  private dragging = false;
  private downX = 0;
  private downY = 0;
  private rightDownX = 0;
  private rightDownY = 0;
  private lastGround: Vector3 | null = null;
  private elevation = 0;

  constructor(private readonly ctx: ToolContext) {
    ctx.overlay.add(this.preview.group);
  }

  get roadType(): RoadTypeDef {
    return this.type;
  }

  get roadMode(): RoadMode {
    return this.mode;
  }

  setRoadType(id: string): boolean {
    const t = getRoadType(id);
    if (t.playerBuildable === false || !isRoadTypeUnlocked(t, this.ctx.population())) return false;
    this.type = t;
    this.refresh();
    return true;
  }

  get roadElevation(): number {
    return this.elevation;
  }

  /** Height new road ends are built at (snapped to ELEVATION_STEP, 0…MAX_ELEVATION). */
  setElevation(m: number): void {
    const next = Math.max(0, Math.min(MAX_ELEVATION, Math.round(m / ELEVATION_STEP) * ELEVATION_STEP));
    if (next === this.elevation) return;
    this.elevation = next;
    this.ctx.events.emit('roadElevation', next);
    this.refresh();
  }

  setMode(mode: RoadMode): void {
    this.mode = mode;
    this.cancel();
  }

  activate(): void {
    this.refresh();
  }

  deactivate(): void {
    this.cancel();
    this.preview.hide();
  }

  /** Drops the road being drawn (after undo / redo changed the network under it). */
  reset(): void {
    if (this.start || this.control) this.cancel();
  }

  private cancel(): void {
    this.start = null;
    this.control = null;
    this.plan = null;
    this.upgrade = null;
    this.dragging = false;
    this.ctx.events.emit('roadPlan', null);
    this.refresh();
  }

  // ---------------------------------------------------------------- snapping

  private resolveAnchor(ground: Vector3, forEnd: boolean): Anchor {
    const graph = this.ctx.city.roads;
    const snapR = Math.max(NODE_SNAP, this.type.width * 0.75);
    const level = (y: number) => Math.abs(y - this.elevation) < OVERPASS_CLEARANCE;
    const found = graph.nearestNode(ground.x, ground.z, snapR);
    const node = found && level(found.y ?? 0) ? found : null;
    if (node) return { kind: 'node', nodeId: node.id, point: { x: node.x, z: node.z } };
    // Anywhere on an existing road's surface (plus a little slack) snaps onto it.
    const near = graph.nearestEdge(ground.x, ground.z, snapR * 0.6, true, (e) => level(graph.nodes.get(e.a)?.y ?? 0) || level(graph.nodes.get(e.b)?.y ?? 0));
    const hit = near && level(graph.elevationAt(near.edge, near.t)) ? near : null;
    if (hit) {
      const e = hit.edge;
      const na = graph.nodes.get(e.a)!;
      const nb = graph.nodes.get(e.b)!;
      if (hit.t * e.length < NODE_SNAP) return { kind: 'node', nodeId: na.id, point: { x: na.x, z: na.z } };
      if ((1 - hit.t) * e.length < NODE_SNAP) return { kind: 'node', nodeId: nb.id, point: { x: nb.x, z: nb.z } };
      return { kind: 'edge', edgeId: e.id, t: hit.t, point: hit.point };
    }
    const raw = { x: ground.x, z: ground.z };
    const elev = this.elevation;
    if (this.free) return { kind: 'free', point: raw, elev };
    let p = snapToGrid(raw, CELL_SIZE);
    if (forEnd && this.start && this.mode === 'straight') {
      p = snapSegment(this.start.point, raw, 15, CELL_SIZE, this.continuationAngle());
    }
    return { kind: 'free', point: p, elev };
  }

  /** Direction of the road we're continuing from, so angle snapping is relative to it. */
  private continuationAngle(): number {
    const s = this.start;
    if (!s) return 0;
    const graph = this.ctx.city.roads;
    if (s.kind === 'node') {
      const node = graph.nodes.get(s.nodeId);
      if (node && node.edges.length >= 1) {
        const d = graph.directionFrom(graph.edges.get(node.edges[0])!, s.nodeId);
        return Math.atan2(-d.z, -d.x);
      }
    } else if (s.kind === 'edge') {
      const e = graph.edges.get(s.edgeId);
      if (e) {
        const pts = e.poly.points;
        const a = pts[0];
        const b = pts[pts.length - 1];
        return Math.atan2(b.z - a.z, b.x - a.x);
      }
    }
    return 0;
  }

  // ---------------------------------------------------------------- planning

  private refresh(): void {
    const h = this.ctx.world.heightAt;
    const ground = this.lastGround;
    if (!ground) {
      this.preview.hide();
      return;
    }
    if (this.mode === 'upgrade') {
      this.refreshUpgrade(ground);
      return;
    }
    this.cursor = this.resolveAnchor(ground, true);
    if (!this.start) {
      this.plan = null;
      this.preview.hidePath();
      this.preview.setMarkers([this.cursor.point], this.type.width * 0.6, h, [anchorElevation(this.ctx.city.roads, this.cursor)]);
      this.ctx.events.emit('roadPlan', null);
      return;
    }
    const control = this.mode === 'curve' ? this.control : null;
    this.plan = planRoad(this.ctx.city.roads, this.start, this.cursor, control, this.type, this.ctx.city.plannerWorld, this.ctx.city.treasury.balance);
    const { elevA, elevB } = this.plan;
    this.preview.showPath(this.plan.points, this.type.width, this.plan.valid ? 'valid' : 'invalid', h, (i, n) => elevA + ((elevB - elevA) * i) / Math.max(1, n - 1));
    const markers = control ? [this.start.point, control, this.cursor.point] : [this.start.point, this.cursor.point];
    const raise = control ? [elevA, (elevA + elevB) / 2, elevB] : [elevA, elevB];
    this.preview.setMarkers(markers, this.type.width * 0.6, h, raise);
    this.emitPlan();
  }

  private refreshUpgrade(ground: Vector3): void {
    const h = this.ctx.world.heightAt;
    const hit = this.ctx.city.roads.nearestEdge(ground.x, ground.z, 1, true);
    this.preview.setMarkers([], 1, h);
    if (!hit) {
      this.upgrade = null;
      this.preview.hidePath();
      this.ctx.events.emit('roadPlan', null);
      return;
    }
    const e = hit.edge;
    this.upgrade = this.ctx.city.planUpgrade(e.id, this.type);
    const pts = sampleBezier(this.ctx.city.roads.curveOf(e), 3).points;
    this.preview.showPath(pts, this.type.width, this.upgrade?.valid ? 'upgrade' : 'invalid', h);
    if (!this.upgrade) return;
    const view: RoadPlanView = {
      mode: 'upgrade',
      typeId: this.type.id,
      fromTypeId: e.typeId,
      length: e.length,
      bridgeLength: 0,
      maxGrade: 0,
      cost: this.upgrade.netCost,
      refund: this.upgrade.refund,
      weeklyMaintenance: Math.round(e.length * this.type.maintenancePerMeter),
      junctions: 0,
      valid: this.upgrade.valid,
      errors: this.upgrade.errors,
    };
    this.ctx.events.emit('roadPlan', view);
  }

  private emitPlan(): void {
    const p = this.plan;
    if (!p) return;
    this.ctx.events.emit('roadPlan', {
      mode: this.mode,
      typeId: p.typeId,
      length: p.length,
      bridgeLength: p.bridgeLength,
      maxGrade: p.maxGrade,
      cost: p.cost,
      weeklyMaintenance: p.weeklyMaintenance,
      junctions: p.newJunctions,
      elevA: p.elevA,
      elevB: p.elevB,
      valid: p.valid,
      errors: p.errors,
    });
  }

  private commit(): void {
    const plan = this.plan;
    if (!plan) return;
    if (!plan.valid) {
      this.ctx.events.emit('toast', { kind: 'error', text: plan.errors[0] });
      return;
    }
    const endNode = this.ctx.city.buildRoad(plan);
    if (endNode === null) {
      this.ctx.events.emit('toast', { kind: 'error', text: 'Yol inşa edilemedi' });
      return;
    }
    this.ctx.events.emit('sfx', 'road');
    const n = this.ctx.city.roads.nodes.get(endNode)!;
    // Keep drawing from where this road ended.
    this.start = { kind: 'node', nodeId: endNode, point: { x: n.x, z: n.z } };
    this.control = null;
    this.refresh();
  }

  // ---------------------------------------------------------------- input

  onPointerMove(p: PointerInfo, ground: Vector3 | null): void {
    this.free = p.ctrl;
    this.lastGround = ground ? ground.clone() : null;
    this.refresh();
  }

  onPointerDown(p: PointerInfo, ground: Vector3 | null): void {
    if (p.button === MouseButton.Right) {
      this.rightDownX = p.x;
      this.rightDownY = p.y;
      return;
    }
    if (p.button !== MouseButton.Left || !ground) return;
    this.free = p.ctrl;
    this.lastGround = ground.clone();

    if (this.mode === 'upgrade') {
      if (!this.upgrade) return;
      if (!this.upgrade.valid) {
        this.ctx.events.emit('toast', { kind: 'error', text: this.upgrade.errors[0] });
        return;
      }
      if (this.ctx.city.upgradeRoad(this.upgrade)) {
        this.ctx.events.emit('sfx', 'upgrade');
        this.ctx.events.emit('toast', { kind: 'success', text: `Yol ${this.type.name} olarak yenilendi` });
      }
      this.refresh();
      return;
    }

    if (!this.start) {
      this.start = this.resolveAnchor(ground, false);
      this.downX = p.x;
      this.downY = p.y;
      this.dragging = this.mode === 'straight';
      this.refresh();
      return;
    }
    if (this.mode === 'curve' && !this.control) {
      const raw = { x: ground.x, z: ground.z };
      this.control = this.free ? raw : snapToGrid(raw, CELL_SIZE / 2);
      this.refresh();
      return;
    }
    this.commit();
  }

  onPointerUp(p: PointerInfo): void {
    if (p.button === MouseButton.Right) {
      // A right *click* (not a camera drag) cancels the current road.
      if (Math.hypot(p.x - this.rightDownX, p.y - this.rightDownY) < 5 && this.start) this.cancel();
      return;
    }
    if (p.button !== MouseButton.Left || !this.dragging) return;
    this.dragging = false;
    if (Math.hypot(p.x - this.downX, p.y - this.downY) > DRAG_PX) this.commit();
  }

  onKey(code: string): boolean {
    if (code === 'PageUp' || code === 'PageDown') {
      this.setElevation(this.elevation + (code === 'PageUp' ? ELEVATION_STEP : -ELEVATION_STEP));
      return true;
    }
    if (code === 'Escape' && (this.start || this.control)) {
      this.cancel();
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.preview.tick(dt);
  }
}
