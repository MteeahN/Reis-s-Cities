import type { Group, Vector3 } from 'three';
import type { EventBus } from '../core/EventBus';
import type { BuildingInfo, GameEvents, RoadInfo, ToolId } from '../core/events';
import type { PointerInfo } from '../core/Input';
import type { ZoneKind } from '../data/zones';
import type { ZoneOverlay } from '../rendering/ZoneOverlay';
import type { InfoLayerId } from '../rendering/InfoLayers';
import type { City } from '../systems/City';
import type { World } from '../world/World';

export interface ToolContext {
  world: World;
  city: City;
  events: EventBus<GameEvents>;
  /** Overlay group for tool previews (added to the scene). */
  overlay: Group;
  /** Ground point under a canvas position, or null. */
  pick(x: number, y: number): Vector3 | null;
  population(): number;
  zoneOverlay: ZoneOverlay;
  isZoneUnlocked(z: ZoneKind): boolean;
  /** Show an info layer while this tool is active (null = back to the user's choice). */
  showLayer(layer: InfoLayerId | null): void;
  /** Current simulation tick (for buildings the player founds). */
  tick(): number;
  /** Whether underground pipes are currently drawn (water / sewage view). */
  pipesVisible(): boolean;
  roadInfo(edgeId: number): RoadInfo | null;
  buildingInfo(id: number): BuildingInfo | null;
  /** Show the bus line routes (transit tool). */
  setTransitRoutes(on: boolean): void;
  /** Follow the vehicle at a ground point with the camera; false if there is none there (any follow stops). */
  followVehicleAt?(x: number, z: number): boolean;
}

/** A player tool. Exactly one is active at a time (managed by ToolManager). */
export interface Tool {
  readonly id: ToolId;
  activate(): void;
  deactivate(): void;
  onPointerDown(p: PointerInfo, ground: Vector3 | null): void;
  onPointerMove(p: PointerInfo, ground: Vector3 | null): void;
  onPointerUp(p: PointerInfo, ground: Vector3 | null): void;
  /** Return true when the key was consumed (e.g. ESC cancelling a plan). */
  onKey(code: string): boolean;
  update(dt: number): void;
}
