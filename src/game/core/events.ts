import type { ArchStyle } from '../data/styles';
import type { Advice } from '../systems/Advisors';
import type { RoadSurface } from '../data/roads';
import type { FeedPost } from '../systems/CitizenFeed';
import type { QualityLevel, QualitySetting } from '../rendering/QualityManager';
import type { SfxId } from '../audio/AudioEngine';
import type { Settings } from './settings';
import type { Demand } from '../simulation/Demand';
import type { TaxKind } from '../data/economy';
import type { ServiceKind } from '../data/buildings';
import type { InfoLayerId } from '../rendering/InfoLayers';
import type { DailyRates, DayLedger, Loan } from '../systems/Economy';
import type { PopulationStats } from '../simulation/CitySimulation';
import type { CellInfo } from '../world/WorldGrid';
import type { GameSpeed } from './config';
import type { AchievementView } from '../systems/Achievements';
import type { StatsSample } from '../systems/StatsHistory';

export type ToolId = 'select' | 'road' | 'building' | 'demolish' | 'zone' | 'power' | 'water' | 'services' | 'powerline' | 'pipe' | 'traffic' | 'move' | 'terrain' | 'paint' | 'decor' | 'transit';

/** Transit tool: placing stops or drawing a line (stops picked so far). */
export interface TransitToolState {
  /** stop: place / remove stops; line: draw a new line; edit: add / take out stops of `editLine`. */
  mode: 'stop' | 'line' | 'edit';
  draft: number[];
  editLine: number | null;
  hint: string | null;
}

/** Sales to the neighbouring towns, per utility. */
export interface ExportRow {
  kind: 'power' | 'water' | 'sewage';
  name: string;
  unit: string;
  offered: number;
  /** Unused production now. */
  surplus: number;
  sold: number;
  /** ₺ a day. */
  income: number;
  max: number;
  step: number;
  pricePerThousand: number;
}

/** A citizen petition, for the HUD. */
export interface PetitionView {
  id: number;
  author: string;
  text: string;
  /** What they ask for ("evimizin yakınında okul"). */
  ask: string;
  state: 'open' | 'promised' | 'kept' | 'broken' | 'refused' | 'expired';
  /** Days left to answer (open) or to keep the promise (promised). */
  daysLeft: number;
}

export interface PetitionsView {
  open: PetitionView | null;
  promised: PetitionView[];
  recent: PetitionView[];
  /** Residents' trust in the mayor, −30…30 (happiness factor). */
  trust: number;
  /** Its happiness effect (points). */
  happiness: number;
}

/** Bus network summary for the panel. */
export interface TransitView {
  stops: number;
  ridersPerDay: number;
  faresPerDay: number;
  upkeepPerDay: number;
  /** Buses bought / the depots' room for them. */
  buses: number;
  depotCapacity: number;
  lines: { id: number; name: string; color: string; stops: number; buses: number; running: number; transfers: number; riders: number; capacity: number; km: number; ok: boolean }[];
}

/** Ground paint brush: paint id (0 erases) and radius (m). */
export interface PaintToolState {
  paint: number;
  radius: 2 | 4 | 8;
}

/** Decoration placement: which one and its rotation (degrees). */
export interface DecorToolState {
  defId: string;
  rot: number;
  /** Why it can't stand under the cursor (null: it can). */
  error: string | null;
}

/** Terrain brush: what it does, its size and strength (0–1). */
export interface TerrainToolState {
  op: 'raise' | 'lower' | 'flatten' | 'smooth' | 'pond';
  size: 'S' | 'M' | 'L';
  strength: number;
}

/** Traffic tool: what a click changes. */
export type TrafficToolMode = 'oneway' | 'lights' | 'stop' | 'roundabout' | 'clear';

export interface TrafficToolState {
  mode: TrafficToolMode;
  /** What is under the cursor and what a click would do. */
  target: { kind: 'road' | 'junction'; name: string; detail: string; action: string; cost: number } | null;
}

export interface LinePlanView {
  kind: 'power' | 'pipe';
  length: number;
  cost: number;
  weeklyMaintenance: number;
  valid: boolean;
  errors: string[];
  /** Ends of the new segment that land on an existing line (0–2). */
  joins: number;
  /** Existing lines the new segment crosses (they connect too). */
  crossings: number;
}

export interface ZoneToolState {
  /** 0 = erase, 1–4 = residential / commercial / industrial / office. */
  zone: number;
  mode: 'brush' | 'fill';
  /** Brush radius in cells (1 → 1×1, 2 → 3×3, 3 → 5×5). */
  brush: number;
  /** Parcel depth in cells for road fill. */
  depth: number;
  /** Architecture painted with the zone (also used for hand-placed buildings). */
  style: ArchStyle;
  /** Wealth homes are built for: 0 mixed, 1 modest, 2 middle, 3 wealthy. */
  wealth: number;
  /** Height limit: 0 none, 1 low (≤ 3 storeys), 2 mid-rise (≤ 7). */
  height: number;
}
export type RoadMode = 'straight' | 'curve' | 'free' | 'arc' | 'upgrade';

export interface PerfStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  quality: QualityLevel;
  qualitySetting: QualitySetting;
}

export interface CameraState {
  x: number;
  z: number;
  yaw: number;
  distance: number;
}

export interface WorldSummary {
  seed: number;
  buildablePct: number;
  waterPct: number;
  unlockedPct: number;
  vegetationCount: number;
  minimap: Uint8ClampedArray;
}

export interface RoadInfo {
  id: number;
  typeId: string;
  name: string;
  length: number;
  lanes: number;
  oneWay: boolean;
  width: number;
  capacity: number;
  speedKmh: number;
  weeklyMaintenance: number;
  cost: number;
  /** Number of roads meeting at each end (1 = dead end). */
  degreeA: number;
  degreeB: number;
  centerX: number;
  centerZ: number;
  /** Current traffic (null before the first traffic update). */
  traffic: { forward: number; backward: number; ratio: number; speedKmh: number } | null;
}

export interface BuildingInfo {
  id: number;
  defId: string;
  name: string;
  category: string;
  /** Architectural style name (growables). */
  styleName?: string;
  /** Who the home is built for (homes only). */
  wealthName?: string;
  /** District height limit at the building, when there is one. */
  heightLimit?: string;
  w: number;
  d: number;
  cost: number;
  maintenance: number;
  workers: number;
  residents: number;
  electricity: number;
  water: number;
  pollution: number;
  roadAccess: boolean;
  centerX: number;
  centerZ: number;
  /** Growables only (zone 0 = player-placed). */
  zone: number;
  level: number;
  state: 'construction' | 'active' | 'abandoned' | 'burning';
  progress: number;
  occupants: number;
  capacity: number;
  landValue: number;
  /** Ground pollution at the building (0–100). */
  groundPollution: number;
  happiness: number | null;
  /** Why it can't level up yet (empty when it can, or at max level). */
  levelBlockers: string[];
  /** Price to upgrade now (null: not ready). */
  upgradePrice: number | null;
  /** Tax this building pays per game day (null for civic buildings). */
  dailyTax: number | null;
  /** Utility service at this building (null for producers / non-consumers). */
  utilities: { power: boolean | null; water: boolean | null; sewage: boolean | null };
  /** Service coverage at the building, 0–1 (growables). */
  coverage: Partial<Record<ServiceKind, number>>;
  health: number | null;
  crime: number;
  /** Extra lines for infrastructure/service buildings (production, load). */
  infra: { label: string; value: string }[];
  /** Noise at the building (0–100). */
  noise: number;
  /** Residents' average trip to work in minutes (null: not a home / no data; Infinity: no route). */
  commuteMinutes: number | null;
}

export interface EconomyStats {
  balance: number;
  taxRates: Record<TaxKind, number>;
  /** Current per-day rates (income and expense lines). */
  rates: DailyRates;
  projectedDaily: number;
  today: DayLedger;
  history: DayLedger[];
  loans: Loan[];
  inDebt: boolean;
  daysInDebt: number;
}

export type Selection =
  | { kind: 'cell'; cell: CellInfo; zone: number; landValue: number; pollution: number }
  | { kind: 'road'; road: RoadInfo }
  | { kind: 'building'; building: BuildingInfo };

/** UI summary of what the road tool would do right now. */
export interface RoadPlanView {
  mode: RoadMode;
  typeId: string;
  length: number;
  bridgeLength: number;
  maxGrade: number;
  cost: number;
  weeklyMaintenance: number;
  junctions: number;
  valid: boolean;
  errors: string[];
  /** Deck height above the ground at the start and end (m). */
  elevA?: number;
  elevB?: number;
  /** Upgrade mode only. */
  fromTypeId?: string;
  refund?: number;
}

export interface BuildingPlanView {
  defId: string;
  valid: boolean;
  errors: string[];
  cost: number;
  rot: number;
  w: number;
  d: number;
}

/** What the bulldozer may pick: everything, or one kind only. */
export type DemolishFilter = 'all' | 'road' | 'building' | 'powerline' | 'pipe' | 'prop';

export interface DemolishTarget {
  kind: 'road' | 'building' | 'powerline' | 'pipe' | 'prop';
  id: number;
  name: string;
  refund: number;
}

export interface CityStats {
  roadLength: number;
  roadSegments: number;
  junctions: number;
  deadEnds: number;
  buildings: number;
  spentRoads: number;
  spentBuildings: number;
}

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export type GameEvents = {
  worldReady: WorldSummary;
  hover: CellInfo | null;
  selection: Selection | null;
  roadPlan: RoadPlanView | null;
  roadMode: RoadMode;
  roadType: string;
  /** Height the road tool builds at (m above the ground). */
  roadElevation: number;
  /** Paving the road tool builds with. */
  roadSurface: RoadSurface;
  buildingType: string;
  buildingPlan: BuildingPlanView | null;
  demolishTarget: DemolishTarget | null;
  demolishFilter: DemolishFilter;
  trafficTool: TrafficToolState;
  terrainTool: TerrainToolState;
  paintTool: PaintToolState;
  transitTool: TransitToolState;
  transit: TransitView;
  /** What the advisors say now (most urgent first). */
  advice: Advice[];
  petitions: PetitionsView;
  exports: ExportRow[];
  /** First-person walking mode is on. */
  walking: boolean;
  decorTool: DecorToolState;
  budget: number;
  cityStats: CityStats;
  tool: ToolId;
  speed: { speed: GameSpeed; paused: boolean };
  time: number;
  perf: PerfStats;
  camera: CameraState;
  grid: boolean;
  toast: { kind: ToastKind; text: string };
  /** City level from mission experience. */
  cityLevel: { level: number; xp: number; base: number; next: number | null };
  /** What undo / redo would do next (null = nothing). */
  undoState: { undo: string | null; redo: string | null };
  toggleHelp: undefined;
  toggleLayers: undefined;
  zoneTool: ZoneToolState;
  demand: Demand;
  population: PopulationStats;
  /** Citizens' feed: every post (newest first) and how many arrived just now. */
  feed: { posts: FeedPost[]; fresh: number };
  /** Highest population reached (drives unlocks). */
  maxPopulation: number;
  economy: EconomyStats;
  linePlan: LinePlanView | null;
  /** Active info layer (user-chosen or shown by the current tool). */
  infoLayer: InfoLayerId | null;
  /** A sound effect for something the player did. */
  sfx: SfxId;
  /** Current graphics/audio settings (effective values; also persisted by the UI layer). */
  settings: Settings;
  /** Unrecoverable engine failure (e.g. lost WebGL context); the UI saves and shows an error. */
  fatal: string;
  /** Full achievement list with progress (on every simulation step). */
  achievements: AchievementView[];
  /** Statistics time series (when a new sample is recorded). */
  history: StatsSample[];
};
