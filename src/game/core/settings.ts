import type { DayNightMode } from '../rendering/DayNight';
import { QUALITY_PRESETS, type QualityLevel, type QualitySetting, type ShadowQuality } from '../rendering/QualityManager';

/** What the player chose in the graphics menu. Preset values are copied into the fields; editing a field makes it 'custom'. */
export interface GraphicsSettings {
  preset: QualitySetting | 'custom';
  shadows: ShadowQuality;
  /** Maximum device pixel ratio used for rendering (render resolution). */
  resolution: number;
  /** Distance (m) within which trees use their detailed model. */
  vegetationDistance: number;
  /** Most vehicles drawn at once. */
  vehicles: number;
  /** Camera distance (m) below which small building details are drawn. */
  buildingDetail: number;
  bloom: boolean;
  dayNight: DayNightMode;
  /** Street lamp brightness at night, 0–1 (independent of presets). */
  streetLights: number;
}

export interface AudioSettings {
  master: number;
  ambience: number;
  effects: number;
  muted: boolean;
}

export interface GameplaySettings {
  autosave: boolean;
  /** Real-time minutes between autosaves. */
  autosaveMinutes: number;
  /** Interface (HUD) size multiplier. */
  uiScale: number;
  /** Show the step-by-step tutorial for new cities. */
  tutorial: boolean;
}

export const AUTOSAVE_MINUTES = [1, 3, 5, 10] as const;
export const UI_SCALES = [0.85, 1, 1.15, 1.3] as const;

export interface Settings {
  graphics: GraphicsSettings;
  audio: AudioSettings;
  gameplay: GameplaySettings;
}

export function presetValues(level: QualityLevel): Omit<GraphicsSettings, 'preset' | 'dayNight' | 'streetLights'> {
  const p = QUALITY_PRESETS[level];
  return {
    shadows: p.shadows,
    resolution: p.pixelRatioCap,
    vegetationDistance: p.vegetationLod,
    vehicles: p.vehicles,
    buildingDetail: p.buildingDetail,
    bloom: p.bloom,
  };
}

/**
 * Graphics settings after a change. Picking a preset copies its values (for
 * 'auto', those of the level auto quality is currently on); editing any
 * individual value makes the preset 'custom'. The day/night mode is
 * independent of presets.
 */
export function nextGraphics(cur: GraphicsSettings, patch: Partial<GraphicsSettings>, autoLevel: QualityLevel): GraphicsSettings {
  const next: GraphicsSettings = { ...cur, ...patch };
  if (patch.preset && patch.preset !== 'custom') return { ...next, ...presetValues(patch.preset === 'auto' ? autoLevel : patch.preset) };
  if (Object.keys(patch).some((k) => k !== 'preset' && k !== 'dayNight' && k !== 'streetLights')) next.preset = 'custom';
  return next;
}

export const DEFAULT_SETTINGS: Settings = {
  graphics: { preset: 'auto', ...presetValues('high'), dayNight: 'cycle', streetLights: 0.45 },
  audio: { master: 0.8, ambience: 0.7, effects: 0.8, muted: false },
  gameplay: { autosave: true, autosaveMinutes: 3, uiScale: 1, tutorial: true },
};

const KEY = 'reis.settings.v1';
const clamp = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

/** Validates untrusted (stored) data, falling back to defaults field by field. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw ?? {}) as { graphics?: Partial<GraphicsSettings>; audio?: Partial<AudioSettings>; gameplay?: Partial<GameplaySettings> };
  const g = r.graphics ?? {};
  const a = r.audio ?? {};
  const p = r.gameplay ?? {};
  const dp = DEFAULT_SETTINGS.gameplay;
  const dg = DEFAULT_SETTINGS.graphics;
  const da = DEFAULT_SETTINGS.audio;
  return {
    graphics: {
      preset: oneOf(g.preset, ['auto', 'high', 'medium', 'low', 'custom'] as const, dg.preset),
      shadows: oneOf(g.shadows, ['off', 'low', 'medium', 'high'] as const, dg.shadows),
      resolution: clamp(g.resolution, 0.5, 2, dg.resolution),
      vegetationDistance: clamp(g.vegetationDistance, 150, 1000, dg.vegetationDistance),
      vehicles: Math.round(clamp(g.vehicles, 0, 600, dg.vehicles)),
      buildingDetail: clamp(g.buildingDetail, 200, 1600, dg.buildingDetail),
      bloom: typeof g.bloom === 'boolean' ? g.bloom : dg.bloom,
      dayNight: oneOf(g.dayNight, ['cycle', 'day', 'night'] as const, dg.dayNight),
      streetLights: clamp(g.streetLights, 0, 1, dg.streetLights),
    },
    audio: {
      master: clamp(a.master, 0, 1, da.master),
      ambience: clamp(a.ambience, 0, 1, da.ambience),
      effects: clamp(a.effects, 0, 1, da.effects),
      muted: typeof a.muted === 'boolean' ? a.muted : da.muted,
    },
    gameplay: {
      autosave: typeof p.autosave === 'boolean' ? p.autosave : dp.autosave,
      autosaveMinutes: (AUTOSAVE_MINUTES as readonly number[]).includes(p.autosaveMinutes as number) ? (p.autosaveMinutes as number) : dp.autosaveMinutes,
      uiScale: (UI_SCALES as readonly number[]).includes(p.uiScale as number) ? (p.uiScale as number) : dp.uiScale,
      tutorial: typeof p.tutorial === 'boolean' ? p.tutorial : dp.tutorial,
    },
  };
}

export function loadSettings(): Settings {
  try {
    const s = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    return sanitizeSettings(s ? JSON.parse(s) : null);
  } catch {
    return sanitizeSettings(null);
  }
}

export function saveSettings(s: Settings): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked: settings simply don't persist.
  }
}
