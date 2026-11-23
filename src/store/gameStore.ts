import { create } from 'zustand';
import { STARTING_BUDGET, type GameSpeed } from '../game/core/config';
import type {
  BuildingPlanView,
  CameraState,
  CityStats,
  DemolishTarget,
  EconomyStats,
  LinePlanView,
  PerfStats,
  RoadMode,
  RoadPlanView,
  Selection,
  ToastKind,
  ToolId,
  WorldSummary,
  ZoneToolState,
  DemolishFilter,
  TrafficToolState,
} from '../game/core/events';
import type { PopulationStats } from '../game/simulation/CitySimulation';
import type { Demand } from '../game/simulation/Demand';
import type { QualitySetting } from '../game/rendering/QualityManager';
import { loadSettings, type Settings } from '../game/core/settings';
import type { InfoLayerId } from '../game/rendering/InfoLayers';
import type { CellInfo } from '../game/world/WorldGrid';
import type { CitySaveData, SaveMeta } from '../game/save/CitySave';
import type { AchievementView } from '../game/systems/Achievements';
import type { StatsSample } from '../game/systems/StatsHistory';

export type Screen = 'menu' | 'loading' | 'playing' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

/**
 * UI-facing state. The engine pushes into it via the bridge; components
 * subscribe with narrow selectors so a clock tick only re-renders the clock.
 */
export interface GameUIState {
  screen: Screen;
  cityName: string;
  seedText: string;
  loading: { fraction: number; label: string };
  error: string | null;

  speed: GameSpeed;
  paused: boolean;
  minutes: number;
  budget: number;
  tool: ToolId;
  roadType: string;
  roadMode: RoadMode;
  buildingType: string;
  grid: boolean;
  hover: CellInfo | null;
  selection: Selection | null;
  roadPlan: RoadPlanView | null;
  buildingPlan: BuildingPlanView | null;
  demolishTarget: DemolishTarget | null;
  demolishFilter: DemolishFilter;
  trafficTool: TrafficToolState;
  cityStats: CityStats | null;
  zoneTool: ZoneToolState;
  demand: Demand;
  population: PopulationStats | null;
  maxPopulation: number;
  /** Running city is in sandbox mode. */
  sandbox: boolean;
  /** Main-menu choice for the next new city. */
  newSandbox: boolean;
  economy: EconomyStats | null;
  linePlan: LinePlanView | null;
  infoLayer: InfoLayerId | null;
  layersOpen: boolean;
  perf: PerfStats | null;
  camera: CameraState | null;
  world: WorldSummary | null;
  toasts: Toast[];
  helpOpen: boolean;
  settingsOpen: boolean;
  qualitySetting: QualitySetting;
  /** Graphics/audio settings (persisted in localStorage). */
  settings: Settings;
  leftPanelOpen: boolean;

  /** Save slots in browser storage (newest first). */
  saves: SaveMeta[];
  savesLoaded: boolean;
  /** False when the browser offers no IndexedDB (saves last only this session). */
  storagePersistent: boolean;
  /** A city chosen in the load menu, handed to the engine on start. */
  pendingLoad: CitySaveData | null;
  /** Manual save slot of the running city ("Kaydet" overwrites it). */
  currentSlot: string | null;
  saving: boolean;
  lastSavedAt: number | null;
  achievements: AchievementView[];
  history: StatsSample[];
  /** Open HUD popup (achievements or statistics). */
  popup: 'achievements' | 'stats' | null;

  set: (partial: Partial<GameUIState>) => void;
  pushToast: (kind: ToastKind, text: string) => void;
  dismissToast: (id: number) => void;
}

let toastId = 0;

export const INITIAL_GAME_STATE = {
  speed: 1 as GameSpeed,
  paused: false,
  minutes: 0,
  budget: STARTING_BUDGET,
  tool: 'select' as ToolId,
  roadType: 'street',
  roadMode: 'straight' as RoadMode,
  buildingType: 'city_hall',
  hover: null,
  selection: null,
  roadPlan: null,
  buildingPlan: null,
  demolishTarget: null,
  demolishFilter: 'all' as DemolishFilter,
  trafficTool: { mode: 'oneway', target: null } as TrafficToolState,
  cityStats: null,
  zoneTool: { zone: 1, mode: 'fill', brush: 1, depth: 4, style: 'modern' } as ZoneToolState,
  demand: { residential: 70, commercial: 0, industrial: 0 } as Demand,
  population: null as PopulationStats | null,
  maxPopulation: 0,
  sandbox: false,
  economy: null as EconomyStats | null,
  linePlan: null as LinePlanView | null,
  infoLayer: null as InfoLayerId | null,
  layersOpen: false,
  perf: null,
  camera: null,
  world: null,
  saving: false,
  lastSavedAt: null as number | null,
  achievements: [] as AchievementView[],
  history: [] as StatsSample[],
  popup: null as GameUIState['popup'],
};

export const useGameStore = create<GameUIState>((set) => ({
  screen: 'menu',
  cityName: 'Yeni Şehir',
  seedText: '',
  newSandbox: false,
  loading: { fraction: 0, label: '' },
  error: null,
  ...INITIAL_GAME_STATE,
  grid: false,
  toasts: [],
  helpOpen: false,
  settingsOpen: false,
  qualitySetting: 'auto',
  settings: loadSettings(),
  leftPanelOpen: true,
  saves: [],
  savesLoaded: false,
  storagePersistent: true,
  pendingLoad: null,
  currentSlot: null,

  set: (partial) => set(partial),
  pushToast: (kind, text) => {
    const id = ++toastId;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
