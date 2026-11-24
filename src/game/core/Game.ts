import { ARCH_STYLE_DEFS } from '../data/styles';
import {
  ACESFilmicToneMapping,
  Group,
  PCFShadowMap,
  Raycaster,
  SRGBColorSpace,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { CameraController } from '../camera/CameraController';
import { BUILDING_CATEGORY_LABEL, getBuilding, HEIGHT_LABEL, WEALTH_LABEL, type ServiceKind } from '../data/buildings';
import { SAVE_FORMAT, SAVE_VERSION, newId, restoreCity, serializeCity, type CitySaveData } from '../save/CitySave';
import { Achievements, cityLevel, rewardOf, xpOf, type AchievementContext } from '../systems/Achievements';
import { StatsHistory, type StatsSample } from '../systems/StatsHistory';
import type { PopulationStats } from '../simulation/CitySimulation';
import type { Demand } from '../simulation/Demand';
import { CitizenFeed } from '../systems/CitizenFeed';
import { getRoadType, isRoadTypeUnlocked, type RoadSurface } from '../data/roads';
import { hasRoadAccess } from '../entities/building/BuildingPlacement';
import { BuildingRenderer } from '../rendering/BuildingRenderer';
import { RoadRenderer } from '../rendering/roads/RoadRenderer';
import { City } from '../systems/City';
import { ZoneOverlay } from '../rendering/ZoneOverlay';
import { DecorRenderer } from '../rendering/DecorRenderer';
import { PowerLineRenderer } from '../rendering/PowerLineRenderer';
import { PipeRenderer } from '../rendering/PipeRenderer';
import { PedestrianRenderer } from '../rendering/PedestrianRenderer';
import { TrafficControlRenderer } from '../rendering/TrafficControlRenderer';
import { TrafficSignals } from '../simulation/traffic/Signals';
import { ProblemIcons } from '../rendering/ProblemIcons';
import { InfoLayerView } from '../rendering/InfoLayerView';
import { TrafficOverlay } from '../rendering/TrafficOverlay';
import { VehicleRenderer } from '../rendering/VehicleRenderer';
import type { InfoLayerId } from '../rendering/InfoLayers';
import { SERVICE_KINDS } from '../simulation/Services';
import { CitySimulation } from '../simulation/CitySimulation';
import type { ZoneToolState, DemolishFilter, TrafficToolMode } from './events';
import { buildingCapacity } from '../data/buildings';
import { undoLabel } from '../systems/UndoHistory';

const nameOfBuilding = (defId: string) => getBuilding(defId).name;
import { ZoneType } from '../data/zones';
import type { TaxKind } from '../data/economy';
import { Lighting } from '../rendering/Lighting';
import { QualityManager, SHADOW_MAP_SIZE, type QualityLevel, type QualitySetting } from '../rendering/QualityManager';
import { DayNightCycle } from '../rendering/DayNight';
import { StreetFurniture } from '../rendering/StreetFurniture';
import { PostProcessing } from '../rendering/PostProcessing';
import { Thumbnails } from '../rendering/Thumbnails';
import type { ArchStyle } from '../data/styles';
import { timeUniform } from '../rendering/nightUniform';
import { windowLitShare } from '../rendering/windowLights';
import { AudioEngine } from '../audio/AudioEngine';
import { DEFAULT_SETTINGS, nextGraphics, presetValues, type AudioSettings, type GameplaySettings, type GraphicsSettings, type Settings } from './settings';
import type { PlacedBuilding } from '../entities/building/BuildingRegistry';
import { SkyEnvironment } from '../rendering/SkyEnvironment';
import { SimScheduler } from '../simulation/SimScheduler';
import { ToolManager } from '../tools/ToolManager';
import { requestWorld } from '../world/generation/WorldGenClient';
import { pickGround } from '../world/TerrainPicker';
import { World } from '../world/World';
import { APP_VERSION, CELL_SIZE, GRID_CELLS, START_MINUTE_OFFSET, WATER_LEVEL, WORLD_SIZE, type GameSpeed } from './config';
import { EventBus } from './EventBus';
import type { BuildingInfo, DecorToolState, GameEvents, PaintToolState, RoadInfo, RoadMode, TerrainToolState, ToolId } from './events';
import { Input, type PointerInfo } from './Input';

export interface GameOptions {
  seed: number;
  cityName: string;
  onProgress?: (fraction: number, label: string) => void;
  /** Saved graphics/audio settings. */
  settings?: Settings;
  /** A saved city to load (its seed and name replace the ones above). */
  save?: CitySaveData;
  /** New city in sandbox mode (ignored when loading a save: the save decides). */
  sandbox?: boolean;
}

/**
 * Root of the game engine. Owns the renderer, scene, camera, world, input,
 * tools and simulation scheduler. Has no React dependency — the UI talks to
 * it through public methods and listens to `events`.
 */
export class Game {
  readonly events = new EventBus<GameEvents>();
  readonly cityName: string;
  readonly seed: number;
  /** Kent Sesi — the citizens' feed. */
  private feed!: CitizenFeed;
  private feedPrimed = false;
  /** Stable id of this city across saves. */
  readonly cityId: string;
  private readonly achievements = new Achievements();
  private readonly history = new StatsHistory();

  private renderer!: WebGLRenderer;
  private scene!: Scene;
  private cameraCtl!: CameraController;
  private lighting!: Lighting;
  private sky!: SkyEnvironment;
  private input!: Input;
  private tools!: ToolManager;
  private world!: World;
  private city!: City;
  private citySim!: CitySimulation;
  private powerLineRenderer!: PowerLineRenderer;
  private pipeRenderer!: PipeRenderer;
  private pedestrians!: PedestrianRenderer;
  private signals!: TrafficSignals;
  private trafficControls!: TrafficControlRenderer;
  private problemIcons!: ProblemIcons;
  private infoView!: InfoLayerView;
  private trafficOverlay!: TrafficOverlay;
  private vehicles!: VehicleRenderer;
  private userLayer: InfoLayerId | null = null;
  private toolLayer: InfoLayerId | null = null;
  private zoneOverlay!: ZoneOverlay;
  /** Ground paint and decorations. */
  decor!: DecorRenderer;
  private selectionRefresh = 1;
  private roadRenderer!: RoadRenderer;
  private buildingRenderer!: BuildingRenderer;
  private quality!: QualityManager;
  private dayNight!: DayNightCycle;
  private furniture!: StreetFurniture;
  private post!: PostProcessing;
  readonly audio: AudioEngine;
  private settings: Settings;
  private ambienceTimer = 0;
  private litHour = -1;
  private readonly unlockAudio = () => this.audio.unlock();
  private readonly sim = new SimScheduler();
  private readonly overlay = new Group();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly pickResult = new Vector3();
  private resizeObs?: ResizeObserver;

  private raf = 0;
  private lastFrame = 0;
  private disposed = false;
  private started = false;

  private speedBeforePause: GameSpeed = 1;
  private gridUser = false;
  private gridOpacity = 0;

  // perf / UI throttling
  private perfFrames = 0;
  private perfTime = 0;
  private perfFrameMsSum = 0;
  private cameraEmitTime = 0;
  private lastMinuteEmitted = -1;
  private lastCamX = NaN;
  private lastCamZ = NaN;
  private lastCamYaw = NaN;
  private lastCamDist = NaN;
  private lastPointer: PointerInfo | null = null;
  private repickTimer = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly options: GameOptions,
  ) {
    this.cityName = options.save?.name ?? options.cityName;
    this.seed = options.save?.seed ?? options.seed;
    this.feed = new CitizenFeed(this.seed ^ 0x5eed);
    this.cityId = options.save?.cityId ?? newId();
    const s = options.settings ?? DEFAULT_SETTINGS;
    this.settings = { graphics: { ...s.graphics }, audio: { ...s.audio }, gameplay: { ...s.gameplay } };
    this.audio = new AudioEngine(this.settings.audio);
  }

  async init(): Promise<void> {
    const progress = this.options.onProgress ?? (() => {});
    progress(0.01, 'Grafik motoru başlatılıyor');

    const renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.domElement.className = 'game-canvas';
    renderer.domElement.tabIndex = 0;
    this.renderer = renderer;
    this.container.appendChild(renderer.domElement);

    this.scene = new Scene();
    this.scene.add(this.overlay);
    this.sky = new SkyEnvironment(renderer, this.scene);
    this.lighting = new Lighting(this.scene);
    this.sky.setSun({ elevationDeg: 38, azimuthDeg: 135 });
    this.lighting.setSunDirection(this.sky.sunDirection);
    this.dayNight = new DayNightCycle(this.sky, this.lighting, renderer, this.scene);
    this.dayNight.mode = this.settings.graphics.dayNight;

    const data = await requestWorld(this.seed, (f, label) => progress(0.05 + f * 0.8, label));
    if (this.disposed) return;
    progress(0.88, 'Sahne kuruluyor');
    this.world = new World(data);
    this.world.addTo(this.scene);

    this.city = new City(this.world);
    if (!this.options.save && this.options.sandbox) this.city.enableSandbox();
    this.roadRenderer = new RoadRenderer(this.city.roads, this.world.heightAt);
    this.buildingRenderer = new BuildingRenderer(this.city.buildings);
    this.furniture = new StreetFurniture(this.city.roads, this.roadRenderer, this.world.heightAt);
    this.scene.add(this.roadRenderer.group, this.buildingRenderer.group, this.furniture.group);
    this.zoneOverlay = new ZoneOverlay(this.city, this.world.terrainMaterial);
    this.decor = new DecorRenderer(this.city, this.world.terrainMaterial, this.world.heightAt);
    this.scene.add(this.decor.group);
    this.powerLineRenderer = new PowerLineRenderer(this.city.powerLines, this.world.heightAt);
    this.pipeRenderer = new PipeRenderer(this.city.pipes, this.world.heightAt);
    this.scene.add(this.pipeRenderer.group);
    this.problemIcons = new ProblemIcons(this.city);
    this.infoView = new InfoLayerView(this.city, this.world.terrainMaterial, this.buildingRenderer);
    this.trafficOverlay = new TrafficOverlay(this.city.traffic, this.city.roads, this.roadRenderer);
    this.signals = new TrafficSignals(this.city.roads);
    this.vehicles = new VehicleRenderer(this.city.traffic, this.city.roads, this.roadRenderer, this.signals);
    this.pedestrians = new PedestrianRenderer(this.city.roads, this.city.buildings, this.city.occupancy, this.roadRenderer, this.signals);
    // Drivers yield to people on crosswalks; people wait for approaching vehicles.
    this.vehicles.crosswalkBusy = (node, edge) => this.pedestrians.isCrossing(node, edge);
    this.pedestrians.vehiclesNear = (node, edge, within) => this.vehicles.approaching(node, edge, within);
    this.trafficControls = new TrafficControlRenderer(this.city.roads, this.roadRenderer, this.signals);
    this.scene.add(this.powerLineRenderer.group, this.problemIcons.group, this.trafficOverlay.mesh, this.vehicles.group, this.pedestrians.group, this.trafficControls.group);
    this.city.onUtilities((u) => {
      this.pipeRenderer.setSupply(u.pipeSupplied);
      this.refreshOverlays();
    });
    this.citySim = new CitySimulation(this.city, this.seed, {
      onStats: (stats, demand) => {
        this.emitEconomy();
        this.refreshOverlays();
        this.events.emit('population', stats);
        this.events.emit('demand', demand);
        this.updateFeed(stats, demand);
        this.events.emit('maxPopulation', this.citySim.maxPopulation);
        this.trackProgress();
      },
      onMilestone: (m) => {
        this.events.emit('sfx', 'milestone');
        this.events.emit('toast', { kind: 'success', text: `${m.population.toLocaleString('tr-TR')} nüfus — ${m.title}! ${m.unlocks}` });
      },
      onNotice: (n) => this.events.emit('toast', n),
    });
    this.citySim.register(this.sim);
    this.city.economy.onNotice((n) => this.events.emit('toast', n));

    this.cameraCtl = new CameraController(1, (x, z) => this.world.heightAt(x, z));
    this.post = new PostProcessing(renderer, this.scene, this.cameraCtl.camera);
    renderer.info.autoReset = false;
    // Sound: effects for player actions, an error tone for refused ones; audio starts on the first gesture.
    this.events.on('sfx', (id) => this.audio.play(id));
    this.events.on('toast', (t) => {
      if (t.kind === 'error') this.audio.play('error');
    });
    renderer.domElement.addEventListener('pointerdown', this.unlockAudio);
    window.addEventListener('keydown', this.unlockAudio);
    this.input = new Input(renderer.domElement);
    this.tools = new ToolManager({
      world: this.world,
      city: this.city,
      events: this.events,
      overlay: this.overlay,
      pick: (x, y) => this.pick(x, y),
      population: () => this.city.unlockLevel,
      zoneOverlay: this.zoneOverlay,
      isZoneUnlocked: (z) => this.citySim.isZoneUnlocked(z),
      showLayer: (layer) => {
        this.toolLayer = layer;
        this.applyLayer();
      },
      pipesVisible: () => this.pipeRenderer.visible,
      tick: () => this.sim.tick,
      roadInfo: (id) => this.roadInfo(id),
      buildingInfo: (id) => this.buildingInfo(id),
    });
    this.city.treasury.onChange((b) => this.events.emit('budget', b));
    const onCityChange = () => {
      this.tools.select.revalidate();
      this.emitCityStats();
    };
    this.city.roads.onChange(onCityChange);
    this.city.buildings.onChange(onCityChange);
    this.city.undo.onChange(() => this.emitUndoState());
    this.input.addListener(this.tools);
    this.input.addListener({
      onKeyDown: (code, e) => this.handleKey(code, e),
      onPointerMove: (p) => (this.lastPointer = p),
    });
    if (this.options.save) {
      progress(0.9, 'Şehir yükleniyor');
      this.restoreSave(this.options.save);
    } else if (this.city.buildEntryRoad()) {
      // Start looking at the highway junction and its link road, where the first streets go.
      const end = this.city.entryLink!;
      const c = this.cameraCtl;
      c.setView(end.x, end.z, c.yaw, c.pitch, 420);
    } else {
      // No side of the map allows a straight road: the city plays without the connection rule.
      console.warn('City entry road could not be laid on this terrain');
    }
    this.pipeRenderer.setSupply(this.city.utilities.pipeSupplied);
    renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);

    this.quality = new QualityManager((level) => this.applyQuality(level));
    const preset = this.settings.graphics.preset;
    if (preset === 'custom') this.quality.adaptive = false;
    else this.quality.setSetting(preset);
    this.applyGraphics(this.settings.graphics, true);
    this.dayNight.update(this.minuteOfDay(), 0, 0, 0);
    this.refreshLighting();

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(this.container);
    this.resize();

    // Warm up: compile shaders before the first visible frame.
    progress(0.95, 'Gölgelendiriciler derleniyor');
    await renderer.compileAsync(this.scene, this.cameraCtl.camera);
    if (this.disposed) return;

    const stats = this.world.grid.stats();
    this.events.emit('worldReady', {
      seed: this.seed,
      ...stats,
      vegetationCount: this.world.vegetation.objectCount,
      minimap: this.world.minimapImage(),
    });
    this.events.emit('speed', { speed: this.sim.speed === 0 ? this.speedBeforePause : this.sim.speed, paused: this.sim.speed === 0 });
    this.events.emit('tool', 'select');
    this.events.emit('roadType', this.tools.road.roadType.id);
    this.events.emit('roadMode', this.tools.road.roadMode);
    this.events.emit('buildingType', this.tools.building.buildingType);
    this.events.emit('budget', this.city.treasury.balance);
    this.events.emit('zoneTool', this.tools.zone.state);
    this.events.emit('demand', this.citySim.demand);
    this.events.emit('maxPopulation', this.citySim.maxPopulation);
    if (this.citySim.stats) this.events.emit('population', this.citySim.stats);
    this.events.emit('achievements', this.achievements.view(this.achievementContext()));
    this.events.emit('cityLevel', cityLevel(this.achievements.xp));
    this.events.emit('history', this.history.samples.slice());
    this.emitEconomy();
    this.emitCityStats();
    this.events.emit('grid', this.gridUser);
    this.events.emit('settings', this.getSettings());
    this.emitUndoState();
    this.emitTime(true);
    progress(1, 'Hazır');

    this.started = true;
    if (import.meta.env.DEV) (window as unknown as { __reis?: unknown }).__reis = { game: this, scene: this.scene, renderer, city: this.city };
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // ---------------------------------------------------------------- save / load

  private readonly onContextLost = (e: Event) => {
    e.preventDefault();
    this.events.emit('fatal', 'Grafik kartı bağlantısı koptu (WebGL bağlamı kayboldu).');
  };

  private restoreSave(save: CitySaveData): void {
    const c = save.clock;
    this.sim.tick = c.tick;
    this.sim.gameMinutes = c.gameMinutes;
    restoreCity(this.city, this.citySim, save.city, c.tick, c.gameMinutes);
    this.achievements.restore(save.achievements);
    this.history.restore(save.history);
    this.speedBeforePause = c.speed;
    this.sim.speed = c.paused ? 0 : c.speed;
    const cam = save.camera;
    if (cam) this.cameraCtl.setView(cam.x, cam.z, cam.yaw, cam.pitch, cam.distance);
  }

  /** Sandbox (creative) mode: unlimited money, everything unlocked. */
  get sandbox(): boolean {
    return this.city?.sandbox ?? false;
  }

  /** Complete state of the city, ready to store. */
  serialize(): CitySaveData {
    const c = this.cameraCtl;
    const paused = this.sim.speed === 0;
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      appVersion: APP_VERSION,
      cityId: this.cityId,
      name: this.cityName,
      seed: this.seed,
      savedAt: Date.now(),
      clock: { tick: this.sim.tick, gameMinutes: this.sim.gameMinutes, speed: paused ? this.speedBeforePause : this.sim.speed, paused },
      camera: { x: c.target.x, z: c.target.z, yaw: c.yaw, pitch: c.pitch, distance: c.distance },
      city: serializeCity(this.city, this.citySim),
      achievements: this.achievements.serialize(),
      history: this.history.serialize(),
    };
  }

  private thumbs: Thumbnails | null = null;

  /** Catalogue picture of a building model (PNG data URL, cached). */
  buildingThumbnail(defId: string, style: ArchStyle = 'modern'): string {
    if (!this.renderer) return '';
    this.thumbs ??= new Thumbnails(this.renderer);
    return this.thumbs.get(defId, style);
  }

  /** Small JPEG of the current view for the load list ('' if the canvas can't be read). */
  captureThumbnail(w = 320, h = 180): string {
    try {
      // Draw right after rendering, while the drawing buffer is still intact.
      this.post.render(this.dayNight.night);
      const src = this.renderer.domElement;
      const out = document.createElement('canvas');
      out.width = w;
      out.height = h;
      const ctx = out.getContext('2d');
      if (!ctx || src.width === 0 || src.height === 0) return '';
      let sw = src.width;
      let sh = src.height;
      if (sw / sh > w / h) sw = sh * (w / h);
      else sh = sw / (w / h);
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, w, h);
      return out.toDataURL('image/jpeg', 0.72);
    } catch {
      return '';
    }
  }

  // ---------------------------------------------------------------- statistics & achievements

  /** After each population step: record history (hourly) and check achievements. */
  private trackProgress(): void {
    const st = this.citySim.stats;
    const m = this.sim.gameMinutes;
    if (st && this.history.record(this.sample(st, m))) this.events.emit('history', this.history.samples.slice());
    const ctx = this.achievementContext();
    // Achievements are not earned in sandbox mode (money and unlocks are free there).
    if (!this.city.sandbox) for (const a of this.achievements.evaluate(ctx, m)) {
      this.events.emit('sfx', 'milestone');
      const reward = rewardOf(a.id);
      this.city.treasury.credit(reward, 'reward');
      this.events.emit('toast', { kind: 'success', text: `Görev tamamlandı: ${a.title} — ödül ₺${reward.toLocaleString('tr-TR')}, +${xpOf(a.id)} XP` });
    }
    this.events.emit('achievements', this.achievements.view(ctx));
    this.events.emit('cityLevel', cityLevel(this.achievements.xp));
  }

  private sample(st: PopulationStats, t: number): StatsSample {
    const r = this.city.economy.rates;
    return {
      t,
      population: st.total,
      happiness: st.happiness,
      balance: this.city.treasury.balance,
      income: r.taxResidential + r.taxCommercial + r.taxIndustrial,
      expenses: r.upkeepRoads + r.upkeepBuildings + r.upkeepPower + r.upkeepWater + r.upkeepServices + r.loanPayments,
      unemployment: st.unemploymentRate,
      jobs: st.jobs,
      congestion: st.traffic.congestion,
      commuteMinutes: st.traffic.commuteMinutes,
      health: st.health,
      crime: st.crime,
      residential: st.buildingsByZone.residential,
      commercial: st.buildingsByZone.commercial,
      industrial: st.buildingsByZone.industrial,
    };
  }

  /** Measures everything achievements are judged on, from the live city. */
  private achievementContext(): AchievementContext {
    const city = this.city;
    const st = this.citySim.stats;
    const roads = city.roads.stats();
    // Missions count the player's own roads, not the entry road the game lays.
    const own = [...city.roads.edges.values()].filter((e) => getRoadType(e.typeId).playerBuildable !== false);
    const zoned = city.zones.countZoned();
    const activeByZone = { residential: 0, commercial: 0, industrial: 0 };
    const services = new Set<ServiceKind>();
    let maxLevel = 0;
    for (const b of city.buildings.items.values()) {
      if (b.state !== 'active') continue;
      const def = getBuilding(b.defId);
      if (def.service) services.add(def.service.kind);
      if (!b.zone) continue;
      maxLevel = Math.max(maxLevel, b.level);
      if (b.zone === ZoneType.Residential) activeByZone.residential++;
      else if (b.zone === ZoneType.Commercial) activeByZone.commercial++;
      else if (b.zone === ZoneType.Industrial) activeByZone.industrial++;
    }
    const u = city.utilities.stats;
    const eco = city.economy;
    return {
      population: st?.total ?? 0,
      happiness: st?.happiness ?? 0,
      unemploymentRate: st?.unemploymentRate ?? 0,
      roadLength: own.reduce((s, e) => s + e.length, 0),
      roadSegments: own.length,
      junctions: roads.junctions,
      zonedCells: zoned[1] + zoned[2] + zoned[3],
      activeByZone,
      maxLevel,
      balance: city.treasury.balance,
      bestDayNet: eco.history.reduce((m, d) => Math.max(m, d.net), 0),
      loansRepaid: eco.loansRepaid,
      powerServed: u.powerServed,
      waterServed: u.waterServed,
      sewageServed: u.sewageServed,
      utilityProblems: st ? st.problems.power + st.problems.water : 0,
      services,
      tripsPerHour: st?.traffic.tripsPerHour ?? 0,
      congestedLength: st?.traffic.congestedLength ?? 0,
      day: Math.floor(this.sim.gameMinutes / 1440),
    };
  }

  // ---------------------------------------------------------------- loop

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const rawDt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    // Clamped both ways: long stalls (hidden tab) and out-of-order timestamps must not explode the smoothing.
    const dt = Math.max(0, Math.min(rawDt, 0.1));
    this.renderer.info.reset();

    // Simulation (fixed step, speed-scaled, independent of rendering)
    if (this.sim.advance(dt) > 0) this.emitTime(false);

    // Camera
    const cursorGround =
      this.input.wheel !== 0 && this.input.pointerInside ? this.pick(this.input.pointerX, this.input.pointerY)?.clone() ?? null : null;
    this.cameraCtl.update(dt, this.input, this.container.clientHeight, cursorGround);
    const cam = this.cameraCtl.camera;
    timeUniform.value = now / 1000;
    this.dayNight.update(this.minuteOfDay(), dt, cam.position.x, cam.position.z);
    this.lighting.update(this.cameraCtl.target, this.cameraCtl.distance);
    this.furniture.update(this.dayNight.night, this.cameraCtl.distance);
    this.buildingRenderer.setDetailVisible(this.cameraCtl.distance < this.settings.graphics.buildingDetail);
    const hour = Math.floor(this.minuteOfDay() / 60);
    if (hour !== this.litHour) this.refreshLighting();
    this.ambienceTimer -= dt;
    if (this.ambienceTimer <= 0) {
      this.ambienceTimer = 0.25;
      this.updateAmbience();
    }
    this.world.vegetation.update(cam.position);
    this.world.water.update(dt);
    this.tools.update(dt);
    this.roadRenderer.update();
    this.signals.update(dt * this.sim.speed);
    this.trafficControls.update();
    this.vehicles.update(dt, this.sim.speed, this.cameraCtl.target.x, this.cameraCtl.target.z, this.cameraCtl.distance);
    this.pedestrians.update(dt, this.sim.speed, this.minuteOfDay() / 60, this.cameraCtl.target.x, this.cameraCtl.target.z, this.cameraCtl.distance);
    this.zoneOverlay.update();
    this.decor.update();
    this.city.refreshUtilities();
    // Keep the inspector's live numbers (residents, construction…) fresh.
    this.selectionRefresh -= dt;
    if (this.selectionRefresh <= 0) {
      this.selectionRefresh = 1;
      this.tools.select.revalidate();
    }

    // Re-evaluate the hovered cell when the camera moves under a still cursor.
    const moved = this.cameraMoved();
    this.repickTimer -= dt;
    if (moved && this.lastPointer && this.input.pointerInside && this.repickTimer <= 0) {
      this.repickTimer = 0.05;
      this.tools.onPointerMove(this.lastPointer);
    }

    // Grid overlay fade
    const t = this.tools.activeId;
    const gridTarget = this.gridUser || t === 'road' || t === 'building' ? 1 : 0;
    this.gridOpacity += (gridTarget - this.gridOpacity) * Math.min(1, dt * 10);
    this.world.terrainMaterial.uniforms.uGridOpacity.value = this.gridOpacity < 0.01 ? 0 : this.gridOpacity;

    this.post.render(this.dayNight.night);

    this.trackPerf(rawDt);
    this.cameraEmitTime -= dt;
    if (moved && this.cameraEmitTime <= 0) {
      this.cameraEmitTime = 0.1;
      this.events.emit('camera', {
        x: this.cameraCtl.target.x,
        z: this.cameraCtl.target.z,
        yaw: this.cameraCtl.yaw,
        distance: this.cameraCtl.distance,
      });
    }
  };

  /** Clock time of day in minutes (0–1440); the city is founded at 08:00. */
  private minuteOfDay(): number {
    return (this.sim.gameMinutes + START_MINUTE_OFFSET) % 1440;
  }

  /** Share of a building's windows lit after dark (see windowLitShare). */
  private litShare(b: PlacedBuilding): number {
    const def = getBuilding(b.defId);
    return windowLitShare({
      state: b.state,
      zone: b.zone,
      occupants: b.occupants,
      capacity: buildingCapacity(def),
      needsPower: def.electricity > 0,
      powered: this.city.utilities.power.has(b.id),
      hour: Math.floor(this.minuteOfDay() / 60),
    });
  }

  private refreshLighting(): void {
    this.litHour = Math.floor(this.minuteOfDay() / 60);
    this.buildingRenderer.setLighting((b) => this.litShare(b));
  }

  /** Feeds the ambience with what is actually around the camera focus. */
  private updateAmbience(): void {
    const c = this.cameraCtl;
    const x = c.target.x;
    const z = c.target.z;
    const r = 320;
    let buildings = 0;
    for (const b of this.city.buildings.items.values()) {
      const bx = (b.i + b.w / 2) * CELL_SIZE - x;
      const bz = (b.j + b.d / 2) * CELL_SIZE - z;
      if (bx * bx + bz * bz < r * r && b.state === 'active') buildings++;
    }
    this.audio.update(0.25, {
      vehicles: this.vehicles.count,
      buildings,
      trees: this.world.vegetation.countNear(x, z, 260),
      cameraDistance: c.distance,
      night: this.dayNight.night,
      paused: this.sim.speed === 0,
    });
  }

  private cameraMoved(): boolean {
    const c = this.cameraCtl;
    const moved =
      Math.abs(c.target.x - this.lastCamX) > 0.05 ||
      Math.abs(c.target.z - this.lastCamZ) > 0.05 ||
      Math.abs(c.yaw - this.lastCamYaw) > 1e-4 ||
      Math.abs(c.distance - this.lastCamDist) > 0.05 ||
      Number.isNaN(this.lastCamX);
    if (moved) {
      this.lastCamX = c.target.x;
      this.lastCamZ = c.target.z;
      this.lastCamYaw = c.yaw;
      this.lastCamDist = c.distance;
    }
    return moved;
  }

  private trackPerf(rawDt: number): void {
    const fps = this.quality.sample(rawDt);
    void fps;
    this.perfFrames++;
    this.perfTime += rawDt;
    this.perfFrameMsSum += rawDt * 1000;
    if (this.perfTime >= 0.5) {
      const info = this.renderer.info.render;
      this.events.emit('perf', {
        fps: this.perfFrames / this.perfTime,
        frameMs: this.perfFrameMsSum / this.perfFrames,
        drawCalls: info.calls,
        triangles: info.triangles,
        quality: this.quality.level,
        qualitySetting: this.quality.setting,
      });
      this.perfFrames = 0;
      this.perfTime = 0;
      this.perfFrameMsSum = 0;
    }
  }

  private emitTime(force: boolean): void {
    const m = Math.floor(this.sim.gameMinutes);
    if (force || m !== this.lastMinuteEmitted) {
      this.lastMinuteEmitted = m;
      this.events.emit('time', this.sim.gameMinutes);
    }
  }

  // ---------------------------------------------------------------- input

  private handleKey(code: string, e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      } else if (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault();
        this.redo();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (code) {
      case 'Escape':
        this.tools.handleKey('Escape');
        break;
      case 'Space':
        this.togglePause();
        break;
      case 'Digit1':
      case 'Numpad1':
        this.setSpeed(1);
        break;
      case 'Digit2':
      case 'Numpad2':
        this.setSpeed(2);
        break;
      case 'Digit3':
      case 'Numpad3':
        this.setSpeed(3);
        break;
      case 'KeyG':
        this.toggleGrid();
        break;
      case 'KeyC':
      case 'Home':
        this.centerCamera();
        break;
      case 'KeyF':
        this.focusSelection();
        break;
      case 'KeyR':
        this.tools.handleKey('KeyR');
        break;
      case 'KeyV':
        this.setTool('select');
        break;
      case 'KeyM':
        this.setTool('move');
        break;
      case 'KeyY':
        this.setTool('road');
        break;
      case 'KeyB':
        this.setTool('building');
        break;
      case 'KeyZ':
        this.setTool('zone');
        break;
      case 'KeyL':
        this.events.emit('toggleLayers', undefined);
        break;
      case 'KeyT':
        this.setInfoLayer(this.userLayer === 'traffic' ? null : 'traffic');
        break;
      case 'KeyP':
        this.setTool('power');
        break;
      case 'KeyU':
        this.setTool('water');
        break;
      case 'KeyJ':
        this.setTool('services');
        break;
      case 'KeyE':
        this.setTool('terrain');
        break;
      case 'KeyQ':
        this.setTool('paint');
        break;
      case 'KeyN':
        this.setTool('decor');
        break;
      case 'KeyK':
        this.setTool('traffic');
        break;
      case 'BracketLeft':
      case 'BracketRight':
      case 'Minus':
      case 'Equal':
        this.tools.handleKey(code);
        break;
      case 'PageUp':
      case 'PageDown':
        e.preventDefault();
        this.tools.handleKey(code);
        break;
      case 'KeyX':
      case 'Delete':
        this.setTool('demolish');
        break;
      case 'KeyH':
      case 'F1':
        e.preventDefault();
        this.events.emit('toggleHelp', undefined);
        break;
      default:
        break;
    }
  }

  private pick(x: number, y: number): Vector3 | null {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return null;
    this.ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.cameraCtl.camera);
    const ray = this.raycaster.ray;
    const hit = pickGround(
      ray.origin,
      ray.direction,
      (px, pz) => Math.max(WATER_LEVEL, this.world.heightAt(px, pz)),
      20000,
      this.pickResult,
    );
    return hit ? this.pickResult : null;
  }

  private resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h);
    this.post?.setSize(w, h);
    this.cameraCtl.setAspect(w / h);
  }

  /** Auto quality stepped to another preset: apply its values (only while the preset is 'auto'). */
  private applyQuality(level: QualityLevel): void {
    if (this.settings.graphics.preset !== 'auto') return;
    this.applyGraphics({ ...this.settings.graphics, ...presetValues(level) });
    this.events.emit('settings', this.getSettings());
  }

  /** Applies effective graphics settings to the renderer and scene. */
  private applyGraphics(g: GraphicsSettings, initial = false): void {
    this.settings.graphics = { ...g };
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, g.resolution));
    const shadows = g.shadows !== 'off';
    this.lighting.sun.castShadow = shadows;
    if (shadows) this.lighting.setShadowMapSize(SHADOW_MAP_SIZE[g.shadows as Exclude<typeof g.shadows, 'off'>]);
    this.world.vegetation.setShadows(shadows);
    this.furniture.setShadows(shadows);
    this.world.vegetation.lodDistance = g.vegetationDistance;
    this.vehicles.setMax(g.vehicles);
    this.furniture.setBrightness(g.streetLights);
    this.pedestrians.setMax(g.vehicles);
    this.post.setEnabled(g.bloom);
    this.dayNight.mode = g.dayNight;
    if (!initial) this.resize();
  }

  /**
   * Changes graphics settings. Picking a preset copies its values; editing
   * any individual value makes the preset 'custom' (auto quality stops).
   */
  setGraphics(patch: Partial<GraphicsSettings>): void {
    const next = nextGraphics(this.settings.graphics, patch, this.quality.level);
    if (patch.preset && patch.preset !== 'custom') this.quality.setSetting(patch.preset);
    else if (next.preset === 'custom') this.quality.adaptive = false;
    this.applyGraphics(next);
    this.events.emit('settings', this.getSettings());
  }

  setAudio(patch: Partial<AudioSettings>): void {
    this.settings.audio = { ...this.settings.audio, ...patch };
    this.audio.setSettings(this.settings.audio);
    this.events.emit('settings', this.getSettings());
  }

  setGameplay(patch: Partial<GameplaySettings>): void {
    this.settings.gameplay = { ...this.settings.gameplay, ...patch };
    this.events.emit('settings', this.getSettings());
  }

  getSettings(): Settings {
    return { graphics: { ...this.settings.graphics }, audio: { ...this.settings.audio }, gameplay: { ...this.settings.gameplay } };
  }

  // ---------------------------------------------------------------- public API (used by the UI)

  get isStarted(): boolean {
    return this.started;
  }

  setTool(id: ToolId): void {
    this.tools.setTool(id);
  }

  /** Citizens react to the city's real state (Kent Sesi). */
  private updateFeed(stats: PopulationStats, demand: Demand): void {
    if (!this.feedPrimed) {
      // A loaded city does not re-announce milestones it passed long ago.
      this.feed.skipMilestonesBelow(stats.total);
      this.feedPrimed = true;
    }
    const fresh = this.feed.update({
      minute: this.sim.gameMinutes,
      stats,
      demand,
      taxRates: { ...this.city.economy.taxRates },
      inDebt: this.city.economy.inDebt,
      spot: (topic) => this.feedSpot(topic),
    });
    if (fresh.length) this.events.emit('feed', { posts: [...this.feed.posts], fresh: fresh.length });
  }

  /** A place in the city that shows a feed topic (the camera goes there when a post is clicked). */
  private feedSpot(topic: string): { x: number; z: number } | null {
    const city = this.city;
    const u = city.utilities;
    const centre = (cells: number[]) => {
      let x = 0;
      let z = 0;
      for (const k of cells) {
        x += ((k % GRID_CELLS) + 0.5) * CELL_SIZE;
        z += (Math.floor(k / GRID_CELLS) + 0.5) * CELL_SIZE;
      }
      return { x: x / Math.max(1, cells.length), z: z / Math.max(1, cells.length) };
    };
    if (topic === 'traffic') {
      const worst = city.traffic.stats.worst[0];
      const e = worst ? city.roads.edges.get(worst.edge) : undefined;
      if (!e) return null;
      const p = e.poly.points[Math.floor(e.poly.points.length / 2)];
      return { x: p.x, z: p.z };
    }
    for (const b of city.buildings.items.values()) {
      const def = getBuilding(b.defId);
      const hit =
        (topic === 'fire' && b.state === 'burning') ||
        (topic === 'abandoned' && b.state === 'abandoned') ||
        (b.state === 'active' &&
          ((topic === 'power' && def.electricity > 0 && !def.utility?.power && !u.power.has(b.id)) ||
            (topic === 'water' && def.water > 0 && !def.utility && !u.water.has(b.id)) ||
            (topic === 'sewage' && def.water > 0 && !def.utility && !u.sewage.has(b.id)) ||
            (topic === 'garbage' && !!b.zone && city.services.average('garbage', b.cells) < 0.3)));
      if (hit) return centre(b.cells);
    }
    return null;
  }

  /** Camera to a feed post's place. */
  focusPoint(x: number, z: number): void {
    this.cameraCtl.focusOn(x, z, 180);
  }

  /** Undoes the last action (buildings, roads, zoning, lines). */
  undo(): void {
    // A road being drawn may start on a junction the undo removes.
    this.tools.road.reset();
    const e = this.city.undo.peekUndo();
    const label = e ? undoLabel(e, nameOfBuilding) : '';
    const err = this.city.undoLast();
    this.events.emit('toast', err ? { kind: 'warning', text: err } : { kind: 'info', text: `Geri alındı: ${label}` });
    if (!err) this.events.emit('sfx', 'place');
  }

  redo(): void {
    this.tools.road.reset();
    const e = this.city.undo.peekRedo();
    const label = e ? undoLabel(e, nameOfBuilding) : '';
    const err = this.city.redoLast();
    this.events.emit('toast', err ? { kind: 'warning', text: err } : { kind: 'info', text: `Yinelendi: ${label}` });
    if (!err) this.events.emit('sfx', 'place');
  }

  private emitUndoState(): void {
    const u = this.city.undo.peekUndo();
    const r = this.city.undo.peekRedo();
    this.events.emit('undoState', {
      undo: u ? undoLabel(u, nameOfBuilding) : null,
      redo: r ? undoLabel(r, nameOfBuilding) : null,
    });
  }

  setRoadType(id: string): void {
    const t = getRoadType(id);
    if (!isRoadTypeUnlocked(t, this.city.unlockLevel)) {
      this.events.emit('toast', { kind: 'warning', text: `${t.name} ${t.unlockPopulation.toLocaleString('tr-TR')} nüfusta açılır.` });
      return;
    }
    if (this.tools.road.setRoadType(id)) this.events.emit('roadType', id);
  }

  setSpeed(speed: GameSpeed): void {
    if (speed === 0) {
      this.togglePause(true);
      return;
    }
    this.sim.speed = speed;
    this.speedBeforePause = speed;
    this.events.emit('speed', { speed, paused: false });
  }

  togglePause(forcePause?: boolean): void {
    const paused = this.sim.speed === 0;
    if (paused && !forcePause) {
      this.sim.speed = this.speedBeforePause;
      this.events.emit('speed', { speed: this.sim.speed, paused: false });
    } else if (!paused) {
      this.speedBeforePause = this.sim.speed;
      this.sim.speed = 0;
      this.events.emit('speed', { speed: this.speedBeforePause, paused: true });
    }
  }

  toggleGrid(): void {
    this.gridUser = !this.gridUser;
    this.events.emit('grid', this.gridUser);
  }

  centerCamera(): void {
    this.cameraCtl.resetView();
  }

  focusSelection(): void {
    const sel = this.tools.select.getSelection();
    if (!sel) return;
    if (sel.kind === 'cell') this.cameraCtl.focusOn(sel.cell.worldX, sel.cell.worldZ, 160);
    else if (sel.kind === 'road') this.cameraCtl.focusOn(sel.road.centerX, sel.road.centerZ, Math.max(160, sel.road.length * 1.2));
    else this.cameraCtl.focusOn(sel.building.centerX, sel.building.centerZ, 140);
  }

  setTrafficMode(mode: TrafficToolMode): void {
    this.tools.traffic.setMode(mode);
  }

  setDemolishFilter(filter: DemolishFilter): void {
    this.tools.demolish.setFilter(filter);
  }

  /** Height the road tool builds at (m above the ground). */
  setRoadElevation(m: number): void {
    this.tools.road.setElevation(m);
  }

  setPaintTool(patch: Partial<PaintToolState>): void {
    this.tools.paint.setState(patch);
  }

  setDecorTool(patch: Partial<DecorToolState>): void {
    this.tools.decor.setState(patch);
  }

  setTerrainTool(patch: Partial<TerrainToolState>): void {
    this.tools.terrain.setState(patch);
  }

  setRoadSurface(s: RoadSurface): void {
    this.tools.road.setSurface(s);
  }

  setRoadMode(mode: RoadMode): void {
    this.tools.road.setMode(mode);
    this.events.emit('roadMode', mode);
  }

  setBuildingType(id: string): void {
    const t = this.tools.activeId;
    const tool = t === 'power' ? this.tools.power : t === 'water' ? this.tools.water : t === 'services' ? this.tools.services : this.tools.building;
    tool.setBuildingType(id);
    this.events.emit('buildingType', tool.buildingType);
  }

  /** User-selected info layer (a tool may temporarily show its own). */
  setInfoLayer(layer: InfoLayerId | null): void {
    this.userLayer = layer;
    this.applyLayer();
  }

  private applyLayer(): void {
    const layer = this.toolLayer ?? this.userLayer;
    this.infoView.set(layer);
    this.trafficOverlay.setVisible(layer === 'traffic');
    this.pipeRenderer.setVisible(layer === 'water' || layer === 'sewage');
    this.events.emit('infoLayer', layer);
  }

  private refreshOverlays(): void {
    this.infoView.refresh();
    this.refreshLighting();
    this.trafficOverlay.refresh();
    const total = this.citySim.stats?.total ?? 0;
    this.problemIcons.refresh(total > 300, (id) => {
      const b = this.city.buildings.items.get(id);
      return !!b && hasRoadAccess(b.i, b.j, b.w, b.d, b.rot, this.city.placementWorld);
    });
  }

  private roadInfo(id: number): RoadInfo | null {
    const g = this.city.roads;
    const e = g.edges.get(id);
    if (!e) return null;
    const t = getRoadType(e.typeId);
    const mid = e.poly.points[Math.floor(e.poly.points.length / 2)];
    return {
      id,
      typeId: t.id,
      name: t.name,
      length: e.length,
      lanes: t.lanes,
      oneWay: t.oneWay,
      width: t.width,
      capacity: t.capacity,
      speedKmh: t.speedKmh,
      weeklyMaintenance: Math.round(e.length * t.maintenancePerMeter),
      cost: Math.round(e.cost),
      degreeA: g.nodes.get(e.a)?.edges.length ?? 0,
      degreeB: g.nodes.get(e.b)?.edges.length ?? 0,
      centerX: mid.x,
      centerZ: mid.z,
      traffic: (() => {
        const tr = this.city.traffic.edgeTraffic(id);
        return tr ? { forward: tr.forward, backward: tr.backward, ratio: tr.ratio, speedKmh: tr.speedKmh } : null;
      })(),
    };
  }

  private buildingInfo(id: number): BuildingInfo | null {
    const b = this.city.buildings.items.get(id);
    if (!b) return null;
    const def = getBuilding(b.defId);
    return {
      id,
      defId: def.id,
      name: def.name,
      category: BUILDING_CATEGORY_LABEL[def.category],
      styleName: def.spec ? ARCH_STYLE_DEFS[b.style ?? 'modern'].name : undefined,
      wealthName: def.zone === ZoneType.Residential ? WEALTH_LABEL[def.wealth ?? 2] : undefined,
      heightLimit: b.zone && this.city.districtHeight[b.j * GRID_CELLS + b.i] ? HEIGHT_LABEL[this.city.districtHeight[b.j * GRID_CELLS + b.i]] : undefined,
      w: b.w,
      d: b.d,
      cost: b.cost,
      maintenance: def.maintenance,
      workers: def.workers,
      residents: def.residents,
      electricity: def.electricity,
      water: def.water,
      pollution: def.pollution,
      roadAccess: hasRoadAccess(b.i, b.j, b.w, b.d, b.rot, this.city.placementWorld),
      centerX: (b.i + b.w / 2) * CELL_SIZE + (b.ox ?? 0),
      centerZ: (b.j + b.d / 2) * CELL_SIZE + (b.oz ?? 0),
      zone: b.zone,
      level: b.level,
      state: b.state,
      progress: b.progress,
      occupants: b.occupants,
      capacity: buildingCapacity(def),
      landValue: Math.round(this.city.landValue.averageOver(b.cells, this.city.landValue.value)),
      groundPollution: Math.round(this.city.landValue.averageOver(b.cells, this.city.landValue.pollution)),
      happiness: b.zone === ZoneType.Residential ? Math.round(this.city.population.households.get(id)?.happiness ?? 0) : null,
      levelBlockers: this.citySim.levelBlockers(b),
      dailyTax: b.zone ? (this.citySim.buildingTax.get(id) ?? 0) : null,
      ...this.serviceInfo(b.id),
    };
  }

  private serviceInfo(id: number) {
    const b = this.city.buildings.items.get(id)!;
    const def = getBuilding(b.defId);
    const u = this.city.utilities;
    const consumer = !def.utility;
    const coverage: Partial<Record<(typeof SERVICE_KINDS)[number], number>> = {};
    if (b.zone) for (const k of SERVICE_KINDS) coverage[k] = this.city.services.average(k, b.cells);
    const infra: { label: string; value: string }[] = [];
    const s = u.stats;
    if (def.utility?.power) infra.push({ label: 'Üretim', value: `${(def.utility.power / 1000).toFixed(1)} MW` }, { label: 'Şehir tüketimi', value: `${(s.powerServed / 1000).toFixed(1)} / ${(s.powerProduced / 1000).toFixed(1)} MW` });
    if (def.utility?.water) infra.push({ label: 'Su üretimi', value: `${def.utility.water} m³/gün` }, { label: 'Şehir tüketimi', value: `${Math.round(s.waterServed)} / ${s.waterProduced} m³` });
    if (def.utility?.sewage) infra.push({ label: 'Arıtma kapasitesi', value: `${def.utility.sewage} m³/gün` }, { label: 'Toplanan atık su', value: `${Math.round(s.sewageServed)} m³` });
    if ((def.utility?.water || def.utility?.sewage) && u.pipeNetwork[b.cells[0]] < 0) {
      const near = b.cells.some((k) => u.pipeNetwork[k] >= 0);
      if (!near) infra.push({ label: 'Boru bağlantısı', value: 'Yok — yakına boru döşeyin' });
    }
    const load = this.city.services.loads.get(id);
    if (def.service) {
      infra.push({ label: 'Kapsama yarıçapı', value: `${def.service.radius * CELL_SIZE} m` });
      if (load) infra.push({ label: def.service.kind.includes('ducation') ? 'Öğrenci' : 'Hizmet verilen', value: `${Math.round(load.served)} / ${load.capacity}` }, { label: 'Etkinlik', value: `%${Math.round(load.effectiveness * 100)}` });
    }
    const hh = this.city.population.households.get(id);
    return {
      utilities: {
        power: consumer && def.electricity > 0 ? u.power.has(id) : null,
        water: consumer && def.water > 0 ? u.water.has(id) : null,
        sewage: consumer && def.water > 0 ? u.sewage.has(id) : null,
      },
      coverage,
      health: hh ? Math.round(hh.health) : null,
      crime: Math.round(this.city.services.crimeAt(b.cells)),
      infra,
      noise: Math.round(this.city.landValue.averageOver(b.cells, this.city.landValue.noise)),
      commuteMinutes: (() => {
        const c = this.city.traffic.commute.get(id);
        return c === undefined ? null : Number.isFinite(c) ? c / 60 : Infinity;
      })(),
    };
  }


  private emitEconomy(): void {
    const e = this.city.economy;
    this.events.emit('economy', {
      balance: this.city.treasury.balance,
      taxRates: { ...e.taxRates },
      rates: { ...e.rates },
      projectedDaily: e.projectedDailyNet(),
      today: { ...e.today, lines: { ...e.today.lines } },
      history: e.history.map((d) => ({ ...d, lines: { ...d.lines } })),
      loans: e.loans.map((l) => ({ ...l })),
      inDebt: e.inDebt,
      daysInDebt: e.daysInDebt,
    });
  }

  setTaxRate(kind: TaxKind, value: number): void {
    this.city.economy.setTax(kind, value);
    this.emitEconomy();
  }

  takeLoan(offerId: string): void {
    const loan = this.city.economy.takeLoan(offerId);
    this.events.emit('toast', loan ? { kind: 'success', text: `Kredi alındı: +₺${loan.amount.toLocaleString('tr-TR')}` } : { kind: 'warning', text: 'En fazla 2 kredi alınabilir' });
    this.emitEconomy();
  }

  repayLoan(id: number): void {
    if (!this.city.economy.repayLoan(id)) this.events.emit('toast', { kind: 'warning', text: 'Krediyi kapatmak için bütçe yetersiz' });
    this.emitEconomy();
  }

  setZoneTool(patch: Partial<ZoneToolState>): void {
    this.tools.zone.setState(patch);
    if (patch.style) this.tools.building.setStyle(patch.style);
  }

  private emitCityStats(): void {
    const s = this.city.stats();
    this.events.emit('cityStats', {
      roadLength: s.totalLength,
      roadSegments: s.edges,
      junctions: s.junctions,
      deadEnds: s.deadEnds,
      buildings: s.buildings,
      spentRoads: s.spentRoads,
      spentBuildings: s.spentBuildings,
    });
  }

  focusWorldPoint(x: number, z: number): void {
    this.cameraCtl.focusOn(Math.min(Math.max(x, 0), WORLD_SIZE), Math.min(Math.max(z, 0), WORLD_SIZE));
  }

  clearSelection(): void {
    this.tools.select.clearSelection();
  }

  setQuality(setting: QualitySetting): void {
    this.setGraphics({ preset: setting });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.input?.dispose();
    this.renderer?.domElement.removeEventListener('pointerdown', this.unlockAudio);
    this.renderer?.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    window.removeEventListener('keydown', this.unlockAudio);
    this.audio.dispose();
    this.furniture?.dispose();
    this.dayNight?.dispose();
    this.post?.dispose();
    this.thumbs?.dispose();
    this.roadRenderer?.dispose();
    this.powerLineRenderer?.dispose();
    this.pipeRenderer?.dispose();
    this.pedestrians?.dispose();
    this.buildingRenderer?.dispose();
    this.zoneOverlay?.dispose();
    this.decor?.dispose();
    this.trafficOverlay?.dispose();
    this.trafficControls?.dispose();
    this.vehicles?.dispose();
    this.world?.dispose();
    this.sky?.dispose();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.events.clear();
  }
}
