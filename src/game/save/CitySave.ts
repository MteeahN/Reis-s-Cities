import { APP_VERSION, GRID_CELLS, TILES_PER_SIDE, type GameSpeed } from '../core/config';
import { ALL_BUILDINGS } from '../data/buildings';
import { ROAD_TYPES } from '../data/roads';
import { ARCH_STYLES, isArchStyle } from '../data/styles';
import { HEIGHT_LIMITS } from '../data/buildings';
import { ZoneType } from '../data/zones';
import type { PlacedBuilding } from '../entities/building/BuildingRegistry';
import type { RoadGraphData } from '../entities/road/RoadGraph';
import type { SimulationSave } from '../simulation/CitySimulation';
import type { CitySimulation } from '../simulation/CitySimulation';
import type { PopulationSave } from '../simulation/Population';
import type { AchievementsSave } from '../systems/Achievements';
import type { City } from '../systems/City';
import type { EconomySave } from '../systems/Economy';
import type { StatsHistorySave } from '../systems/StatsHistory';
import type { LedgerCategory } from '../systems/Treasury';

export const SAVE_FORMAT = 'reis-cities-save';
export const SAVE_VERSION = 1;

export type SavedBuilding = Omit<PlacedBuilding, 'cells'>;

export interface SavedLine {
  id: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  cost: number;
}

/** Everything about the built city (the terrain itself is regenerated from the seed). */
export interface CityState {
  /** Sandbox (creative) mode; absent in older saves = normal game. */
  sandbox?: boolean;
  /** District architecture per cell, run-length encoded [style, count, …]; absent = all modern. */
  styles?: number[];
  /** District wealth per cell, run-length encoded; absent = mixed. */
  wealth?: number[];
  /** District height limit per cell, run-length encoded; absent = none. */
  heights?: number[];
  roads: RoadGraphData;
  buildings: { nextId: number; items: SavedBuilding[] };
  /** Run-length encoded zone per cell: [value, count, …]. */
  zones: number[];
  lines: { power: { nextId: number; items: SavedLine[] }; pipe: { nextId: number; items: SavedLine[] } };
  treasury: { balance: number; spent: Record<LedgerCategory, number>; refunded: Record<LedgerCategory, number> };
  economy: EconomySave;
  population: PopulationSave;
  simulation: SimulationSave;
  /** Owned land tiles (1 = owned), TILES_PER_SIDE². */
  unlockTiles: number[];
  /** Where the intercity highway meets the map edges; absent in older saves (no connection rule). */
  entries?: { x: number; z: number }[];
  /** End of the highway link road into the city. */
  entryLink?: { x: number; z: number };
  /** Single entry point of saves made before the through highway. */
  entry?: { x: number; z: number };
}

export interface CameraSave {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  distance: number;
}

export interface CitySaveData {
  format: typeof SAVE_FORMAT;
  version: number;
  appVersion: string;
  /** Stable id of this city across saves (a "Save" overwrites this city's slot). */
  cityId: string;
  name: string;
  seed: number;
  savedAt: number;
  clock: { tick: number; gameMinutes: number; speed: GameSpeed; paused: boolean };
  camera: CameraSave | null;
  city: CityState;
  achievements: AchievementsSave;
  history: StatsHistorySave;
}

/** Summary shown in the load list (stored apart from the full data). */
export interface SaveMeta {
  id: string;
  cityId: string;
  name: string;
  seed: number;
  savedAt: number;
  kind: 'manual' | 'auto';
  gameMinutes: number;
  population: number;
  balance: number;
  achievements: number;
  /** Sandbox (creative) mode city. */
  sandbox?: boolean;
  appVersion: string;
  version: number;
  /** Small JPEG data URL of the view at save time (may be empty). */
  thumbnail: string;
}

export class SaveError extends Error {}

// ---------------------------------------------------------------- city ⇄ data

export function serializeCity(city: City, sim: CitySimulation): CityState {
  const lines = (l: City['powerLines']) => ({
    nextId: l.nextIdValue,
    items: [...l.lines.values()].map((x) => ({ id: x.id, ax: x.a.x, az: x.a.z, bx: x.b.x, bz: x.b.z, cost: x.cost })),
  });
  return {
    roads: city.roads.serialize(),
    buildings: {
      nextId: city.buildings.nextIdValue,
      items: [...city.buildings.items.values()].map(({ cells: _cells, ...rest }) => ({ ...rest })),
    },
    zones: city.zones.serialize(),
    lines: { power: lines(city.powerLines), pipe: lines(city.pipes) },
    treasury: { balance: city.treasury.storedBalance, spent: { ...city.treasury.spent }, refunded: { ...city.treasury.refunded } },
    economy: city.economy.serialize(),
    population: city.population.serialize(),
    simulation: sim.serialize(),
    unlockTiles: [...city.world.unlock.tiles],
    sandbox: city.sandbox,
    styles: rle(city.districtStyle),
    wealth: rle(city.districtWealth),
    heights: rle(city.districtHeight),
    ...(city.entries.length ? { entries: city.entries.map((e) => ({ x: e.x, z: e.z })) } : {}),
    ...(city.entryLink ? { entryLink: { x: city.entryLink.x, z: city.entryLink.z } } : {}),
  };
}

/**
 * Rebuilds a saved city inside a freshly created City (same seed, nothing
 * built yet). Derived data — occupancy, zoneable land, cleared trees, utility
 * networks, service coverage, land value and traffic — is recomputed.
 */
export function restoreCity(city: City, sim: CitySimulation, s: CityState, tick: number, gameMinutes: number): void {
  const tiles = s.unlockTiles;
  for (let z = 0; z < TILES_PER_SIDE; z++) for (let x = 0; x < TILES_PER_SIDE; x++) if (tiles[z * TILES_PER_SIDE + x] === 1) city.world.unlock.unlockTile(x, z);
  city.roads.load(s.roads);
  // Styles that no longer exist (e.g. the retired futuristic style) fall back to modern.
  const items = s.buildings.items.map((b) => (b.style && !isArchStyle(b.style) ? { ...b, style: undefined } : b));
  city.restoreBuildings(items, s.buildings.nextId);
  city.zones.restore(s.zones, (k) => city.occupancy.building[k] === 0 && city.occupancy.road[k] === 0);
  for (const [kind, lines] of [['power', s.lines.power], ['pipe', s.lines.pipe]] as const) {
    const target = city.linesOf(kind);
    for (const l of lines.items) target.restore(l.id, { x: l.ax, z: l.az }, { x: l.bx, z: l.bz }, l.cost);
    target.setNextId(lines.nextId);
  }
  city.treasury.restore(s.treasury.balance, s.treasury.spent, s.treasury.refunded);
  if (s.sandbox === true) city.enableSandbox();
  const pt = (p: unknown): p is { x: number; z: number } => !!p && typeof p === 'object' && Number.isFinite((p as { x: number }).x) && Number.isFinite((p as { z: number }).z);
  const entries = Array.isArray(s.entries) ? s.entries.filter(pt) : pt(s.entry) ? [s.entry] : [];
  if (entries.length) {
    city.entries = entries.map((e) => ({ x: e.x, z: e.z }));
    if (pt(s.entryLink)) city.entryLink = { x: s.entryLink.x, z: s.entryLink.z };
    city.outsideEdges();
  }
  if (Array.isArray(s.styles)) unrle(s.styles, city.districtStyle, ARCH_STYLES.length);
  if (Array.isArray(s.wealth)) unrle(s.wealth, city.districtWealth, 4);
  if (Array.isArray(s.heights)) unrle(s.heights, city.districtHeight, HEIGHT_LIMITS.length);
  city.migrateGrowableZones();
  city.economy.restore(s.economy);
  city.population.restore(s.population, (id) => city.buildings.items.get(id)?.zone === ZoneType.Residential);
  sim.restore(s.simulation, tick, gameMinutes);
}

// ---------------------------------------------------------------- validation

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const fail = (why: string): never => {
  throw new SaveError(`Kayıt dosyası okunamadı: ${why}`);
};

/**
 * Checks untrusted save data (from IndexedDB or an imported file) and drops
 * entries the current game no longer knows (e.g. a removed building type).
 * Throws SaveError with a player-facing message when the data is unusable.
 */
export function validateSave(raw: unknown): { data: CitySaveData; warnings: string[] } {
  if (!isObj(raw)) fail('geçerli bir JSON nesnesi değil');
  const r = raw as Record<string, unknown>;
  if (r.format !== SAVE_FORMAT) fail("bu bir Reis's Cities kaydı değil");
  if (!num(r.version)) fail('sürüm bilgisi yok');
  if ((r.version as number) > SAVE_VERSION) fail(`kayıt daha yeni bir oyun sürümüyle (${String(r.appVersion)}) yapılmış`);
  if (!num(r.seed) || typeof r.name !== 'string' || typeof r.cityId !== 'string') fail('şehir bilgisi eksik');
  if (!isObj(r.clock) || !num(r.clock.tick) || !num(r.clock.gameMinutes)) fail('oyun saati eksik');
  const c = r.city;
  if (!isObj(c)) fail('şehir verisi eksik');
  const city = c as Record<string, unknown>;
  for (const k of ['roads', 'buildings', 'lines', 'treasury', 'economy', 'population', 'simulation'] as const) if (!isObj(city[k])) fail(`"${k}" bölümü eksik`);
  if (!Array.isArray(city.zones) || !Array.isArray(city.unlockTiles)) fail('bölge verisi eksik');

  const warnings: string[] = [];
  const data = structuredClone(raw) as unknown as CitySaveData;
  const s = data.city;

  // Roads: unknown types or dangling edges are dropped.
  const roadTypes = new Set(ROAD_TYPES.map((t) => t.id));
  if (!Array.isArray(s.roads.nodes) || !Array.isArray(s.roads.edges)) fail('yol verisi bozuk');
  s.roads.nodes = s.roads.nodes.filter((n) => num(n.id) && num(n.x) && num(n.z));
  const nodeIds = new Set(s.roads.nodes.map((n) => n.id));
  const edgesBefore = s.roads.edges.length;
  s.roads.edges = s.roads.edges.filter(
    (e) => num(e.id) && roadTypes.has(e.typeId) && nodeIds.has(e.a) && nodeIds.has(e.b) && e.a !== e.b && num(e.cx) && num(e.cz) && num(e.cost),
  );
  if (s.roads.edges.length < edgesBefore) warnings.push(`${edgesBefore - s.roads.edges.length} yol parçası tanınmadı ve atlandı`);

  // Buildings: unknown models are dropped (and their households with them).
  const defs = new Set(ALL_BUILDINGS.map((b) => b.id));
  if (!Array.isArray(s.buildings.items)) fail('bina verisi bozuk');
  const before = s.buildings.items.length;
  const inside = (b: SavedBuilding) => b.i >= 0 && b.j >= 0 && b.i + b.w <= GRID_CELLS && b.j + b.d <= GRID_CELLS;
  s.buildings.items = s.buildings.items.filter((b) => isObj(b) && num(b.id) && defs.has(b.defId) && num(b.i) && num(b.j) && num(b.w) && num(b.d) && inside(b));
  if (s.buildings.items.length < before) warnings.push(`${before - s.buildings.items.length} bina tanınmadı ve atlandı`);

  for (const kind of ['power', 'pipe'] as const) {
    const l = s.lines[kind];
    if (!isObj(l) || !Array.isArray(l.items)) fail('hat verisi bozuk');
    l.items = l.items.filter((x) => num(x.id) && num(x.ax) && num(x.az) && num(x.bx) && num(x.bz) && num(x.cost));
  }
  if (!num(s.treasury.balance)) fail('bütçe bilgisi bozuk');
  if (!Array.isArray(s.population.households)) fail('nüfus verisi bozuk');
  if (!Array.isArray(s.economy.history) || !Array.isArray(s.economy.loans) || !isObj(s.economy.taxRates)) fail('ekonomi verisi bozuk');
  data.achievements = isObj(data.achievements) && Array.isArray(data.achievements.earned) ? data.achievements : { earned: [] };
  data.history = isObj(data.history) && Array.isArray(data.history.samples) ? data.history : { samples: [] };
  if (!isObj(data.camera)) data.camera = null;
  const speed = data.clock.speed;
  data.clock.speed = speed === 1 || speed === 2 || speed === 3 ? speed : 1;
  data.clock.paused = data.clock.paused === true;
  return { data, warnings };
}

export function makeMeta(data: CitySaveData, id: string, kind: SaveMeta['kind'], thumbnail: string): SaveMeta {
  const pop = data.city.simulation.stats?.total ?? 0;
  return {
    id,
    cityId: data.cityId,
    name: data.name,
    seed: data.seed,
    savedAt: data.savedAt,
    kind,
    gameMinutes: data.clock.gameMinutes,
    population: Math.round(pop),
    balance: data.city.treasury.balance,
    achievements: data.achievements.earned.length,
    sandbox: data.city.sandbox === true,
    appVersion: APP_VERSION,
    version: SAVE_VERSION,
    thumbnail,
  };
}

/** Random id for a new city / save slot. */
export function newId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Run-length encodes a byte grid as [value, count, …]. */
function rle(a: Uint8Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let n = 1;
    while (i + n < a.length && a[i + n] === v) n++;
    out.push(v, n);
    i += n;
  }
  return out;
}

/** Decodes [value, count, …] into `into`, ignoring values ≥ `max` and overflow. */
function unrle(data: number[], into: Uint8Array, max: number): void {
  let k = 0;
  for (let p = 0; p + 1 < data.length && k < into.length; p += 2) {
    const v = Number.isInteger(data[p]) && data[p] >= 0 && data[p] < max ? data[p] : 0;
    const n = Math.max(0, Math.min(into.length - k, Math.floor(data[p + 1])));
    into.fill(v, k, k + n);
    k += n;
  }
}
