import type { Vector3 } from 'three';
import type { ToolId } from '../core/events';
import type { InputListener, PointerInfo } from '../core/Input';
import { BuildingTool } from './BuildingTool';
import { DemolishTool } from './DemolishTool';
import { RoadTool } from './RoadTool';
import { SelectTool } from './SelectTool';
import { ZoneTool } from './ZoneTool';
import { LineTool } from './LineTool';
import { TrafficTool } from './TrafficTool';
import { MoveTool } from './MoveTool';
import type { Tool, ToolContext } from './Tool';

/** Routes pointer/key input to the single active tool. */
export class ToolManager implements InputListener {
  readonly select: SelectTool;
  readonly road: RoadTool;
  readonly building: BuildingTool;
  readonly demolish: DemolishTool;
  readonly zone: ZoneTool;
  readonly power: BuildingTool;
  readonly water: BuildingTool;
  readonly services: BuildingTool;
  readonly powerline: LineTool;
  readonly pipe: LineTool;
  readonly traffic: TrafficTool;
  readonly move: MoveTool;
  private active: Tool;
  private readonly tools: Record<ToolId, Tool>;

  constructor(private readonly ctx: ToolContext) {
    this.select = new SelectTool(ctx);
    this.road = new RoadTool(ctx);
    this.building = new BuildingTool(ctx, 'building', 'landmark');
    this.power = new BuildingTool(ctx, 'power', 'power');
    this.water = new BuildingTool(ctx, 'water', 'water');
    this.services = new BuildingTool(ctx, 'services', 'service');
    this.powerline = new LineTool(ctx, 'powerline', 'power');
    this.pipe = new LineTool(ctx, 'pipe', 'pipe');
    this.demolish = new DemolishTool(ctx);
    this.zone = new ZoneTool(ctx);
    this.traffic = new TrafficTool(ctx);
    this.move = new MoveTool(ctx);
    this.tools = {
      select: this.select,
      road: this.road,
      building: this.building,
      demolish: this.demolish,
      zone: this.zone,
      power: this.power,
      water: this.water,
      services: this.services,
      powerline: this.powerline,
      pipe: this.pipe,
      traffic: this.traffic,
      move: this.move,
    };
    this.active = this.select;
    this.active.activate();
  }

  get activeId(): ToolId {
    return this.active.id;
  }

  setTool(id: ToolId): void {
    if (this.active.id === id) return;
    this.active.deactivate();
    this.active = this.tools[id];
    this.active.activate();
    this.ctx.events.emit('tool', id);
  }

  private ground(p: PointerInfo): Vector3 | null {
    return this.ctx.pick(p.x, p.y);
  }

  onPointerDown(p: PointerInfo): void {
    this.active.onPointerDown(p, this.ground(p));
  }
  onPointerMove(p: PointerInfo): void {
    this.active.onPointerMove(p, this.ground(p));
  }
  onPointerUp(p: PointerInfo): void {
    this.active.onPointerUp(p, this.ground(p));
  }

  /** Tools get keys first; ESC then falls back to the select tool. */
  handleKey(code: string): boolean {
    if (this.active.onKey(code)) return true;
    if (code === 'Escape' && this.active.id !== 'select') {
      this.setTool('select');
      return true;
    }
    return false;
  }

  update(dt: number): void {
    this.active.update(dt);
  }
}
