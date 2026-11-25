import { Game } from '../game/core/Game';
import { hashString } from '../game/world/generation/rng';
import { INITIAL_GAME_STATE, useGameStore } from './gameStore';
import { saveSettings } from '../game/core/settings';
import { saveCity, startAutosave, stopAutosave } from './saveManager';

// Keep the running engine across Vite hot updates of this module (dev only);
// otherwise a re-instantiated bridge would hand the UI a null game.
let game: Game | null = (import.meta.hot?.data.game as Game | undefined) ?? null;
import.meta.hot?.dispose((data) => {
  data.game = game;
});

/** The running engine instance (null on the menu). */
export const getGame = (): Game | null => game;

export function seedFromText(text: string): number {
  const t = text.trim();
  if (t === '') return (Math.random() * 0xffffffff) >>> 0;
  return /^\d+$/.test(t) ? Number(t) >>> 0 : hashString(t);
}

/** Creates the engine inside `container` and wires its events into the store. */
export async function startGame(container: HTMLElement): Promise<void> {
  stopGame();
  useGameStore.setState(INITIAL_GAME_STATE);
  const store = useGameStore.getState();
  // Cleared only once this engine has started (React may mount, unmount and remount the view).
  const save = store.pendingLoad;
  const seed = save ? save.seed : seedFromText(store.seedText);
  const g = new Game(container, {
    seed,
    cityName: store.cityName,
    settings: store.settings,
    save: save ?? undefined,
    sandbox: store.newSandbox,
    onProgress: (fraction, label) => useGameStore.setState({ loading: { fraction, label } }),
  });
  game = g;
  const set = useGameStore.setState;
  const ev = g.events;
  ev.on('worldReady', (world) => set({ world }));
  ev.on('hover', (hover) => set({ hover }));
  ev.on('selection', (selection) => set({ selection }));
  ev.on('roadPlan', (roadPlan) => set({ roadPlan }));
  ev.on('tool', (tool) => set({ tool, roadPlan: null, buildingPlan: null, demolishTarget: null, linePlan: null }));
  ev.on('roadType', (roadType) => set({ roadType }));
  ev.on('roadElevation', (roadElevation) => set({ roadElevation }));
  ev.on('roadSurface', (roadSurface) => set({ roadSurface }));
  ev.on('roadMode', (roadMode) => set({ roadMode }));
  ev.on('buildingType', (buildingType) => set({ buildingType }));
  ev.on('buildingPlan', (buildingPlan) => set({ buildingPlan }));
  ev.on('demolishTarget', (demolishTarget) => set({ demolishTarget }));
  ev.on('demolishFilter', (demolishFilter) => set({ demolishFilter }));
  ev.on('trafficTool', (trafficTool) => set({ trafficTool }));
  ev.on('terrainTool', (terrainTool) => set({ terrainTool }));
  ev.on('paintTool', (paintTool) => set({ paintTool }));
  ev.on('transitTool', (transitTool) => set({ transitTool }));
  ev.on('transit', (transit) => set({ transit }));
  ev.on('advice', (advice) => set({ advice }));
  ev.on('petitions', (petitions) => set({ petitions }));
  ev.on('exports', (exports) => set({ exports }));
  ev.on('walking', (walking) => set({ walking }));
  ev.on('decorTool', (decorTool) => set({ decorTool }));
  ev.on('budget', (budget) => set({ budget }));
  ev.on('cityStats', (cityStats) => set({ cityStats }));
  ev.on('zoneTool', (zoneTool) => set({ zoneTool }));
  ev.on('demand', (demand) => set({ demand }));
  ev.on('population', (population) => set({ population }));
  ev.on('maxPopulation', (maxPopulation) => set({ maxPopulation }));
  ev.on('economy', (economy) => set({ economy, budget: economy.balance }));
  ev.on('linePlan', (linePlan) => set({ linePlan }));
  ev.on('infoLayer', (infoLayer) => set({ infoLayer }));
  ev.on('speed', ({ speed, paused }) => set({ speed, paused }));
  ev.on('time', (minutes) => set({ minutes }));
  ev.on('perf', (perf) => set({ perf, qualitySetting: perf.qualitySetting }));
  ev.on('camera', (camera) => set({ camera }));
  ev.on('grid', (grid) => set({ grid }));
  ev.on('undoState', (undoState) => set({ undoState }));
  ev.on('cityLevel', (cityLevel) => set({ cityLevel }));
  ev.on('settings', (settings) => {
    const before = useGameStore.getState().settings.gameplay;
    saveSettings(settings);
    set({ settings });
    const after = settings.gameplay;
    if (game === g && g.isStarted && (before.autosave !== after.autosave || before.autosaveMinutes !== after.autosaveMinutes)) startAutosave();
  });
  ev.on('achievements', (achievements) => set({ achievements }));
  ev.on('feed', ({ posts, fresh }) => {
    const s = useGameStore.getState();
    set({ feed: posts, feedUnread: s.popup === 'feed' ? 0 : s.feedUnread + fresh });
  });
  ev.on('history', (history) => set({ history }));
  ev.on('fatal', (reason) => {
    // Keep the city: write the autosave slot, then show the error.
    void saveCity('auto').then((ok) => {
      if (game !== g) return;
      const note = ok ? 'Şehriniz otomatik kaydedildi; sayfayı yenileyip kayıttan devam edebilirsiniz.' : 'Şehir kaydedilemedi.';
      set({ screen: 'error', error: reason + ' ' + note });
      stopGame();
    });
  });
  ev.on('toast', ({ kind, text }) => useGameStore.getState().pushToast(kind, text));
  ev.on('toggleHelp', () => set((s) => ({ helpOpen: !s.helpOpen })));
  ev.on('toggleLayers', () => set((s) => ({ layersOpen: !s.layersOpen })));

  try {
    await g.init();
    if (game === g) {
      set({ screen: 'playing', cityName: g.cityName, pendingLoad: null, sandbox: g.sandbox });
      startAutosave();
    }
  } catch (err) {
    console.error(err);
    if (game === g) {
      set({ screen: 'error', error: err instanceof Error ? err.message : String(err) });
      stopGame();
    }
  }
}

export function stopGame(): void {
  stopAutosave();
  game?.dispose();
  game = null;
}
