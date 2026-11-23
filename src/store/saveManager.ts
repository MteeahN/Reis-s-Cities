import { SaveError, makeMeta, newId, validateSave, type CitySaveData, type SaveMeta } from '../game/save/CitySave';
import { IndexedDbSaveBackend, MemorySaveBackend, SaveStore } from '../game/save/SaveStore';
import { getGame } from './gameBridge';
import { useGameStore } from './gameStore';

const persistent = IndexedDbSaveBackend.available();
const store = new SaveStore(persistent ? new IndexedDbSaveBackend() : new MemorySaveBackend());
useGameStore.setState({ storagePersistent: persistent });

const toast = (kind: 'success' | 'error' | 'warning' | 'info', text: string) => useGameStore.getState().pushToast(kind, text);
const message = (e: unknown) => (e instanceof SaveError ? e.message : `Beklenmeyen hata: ${e instanceof Error ? e.message : String(e)}`);

export const autosaveSlot = (cityId: string) => `auto-${cityId}`;

/** Reloads the slot list from storage. */
export async function refreshSaves(): Promise<SaveMeta[]> {
  try {
    const saves = await store.list();
    useGameStore.setState({ saves, savesLoaded: true });
    return saves;
  } catch (e) {
    useGameStore.setState({ savesLoaded: true });
    toast('error', message(e));
    return [];
  }
}

let inFlight: Promise<boolean> | null = null;

/**
 * Saves the running city. Manual saves overwrite this city's slot (or create
 * one; `asNew` always creates one); autosaves keep one slot per city.
 */
export function saveCity(kind: 'manual' | 'auto', asNew = false): Promise<boolean> {
  // Never run two writes at once (e.g. Ctrl+S during an autosave).
  if (inFlight) return inFlight.then(() => saveCity(kind, asNew));
  const game = getGame();
  if (!game?.isStarted) return Promise.resolve(false);
  const s = useGameStore.getState();
  const id = kind === 'auto' ? autosaveSlot(game.cityId) : asNew || !s.currentSlot ? newId() : s.currentSlot;
  const data = game.serialize();
  const meta = makeMeta(data, id, kind, game.captureThumbnail());
  useGameStore.setState({ saving: true });
  inFlight = store
    .write(meta, data)
    .then(() => {
      useGameStore.setState({ lastSavedAt: data.savedAt, ...(kind === 'manual' ? { currentSlot: id } : {}) });
      if (kind === 'manual') toast('success', `“${data.name}” kaydedildi`);
      void refreshSaves();
      return true;
    })
    .catch((e) => {
      toast('error', `Kayıt başarısız. ${message(e)}`);
      return false;
    })
    .finally(() => {
      inFlight = null;
      useGameStore.setState({ saving: false });
    });
  return inFlight;
}

/** Opens a saved city: the engine is (re)started with it. */
export async function loadSave(id: string): Promise<void> {
  try {
    const { data, warnings } = await store.read(id);
    const saves = useGameStore.getState().saves;
    const meta = saves.find((m) => m.id === id);
    // Loading an autosave: later manual saves go to the city's newest manual slot.
    const slot = meta?.kind === 'manual' ? id : (saves.find((m) => m.kind === 'manual' && m.cityId === data.cityId)?.id ?? null);
    startWith(data, slot);
    for (const w of warnings) toast('warning', w);
  } catch (e) {
    toast('error', message(e));
    void refreshSaves();
  }
}

function startWith(data: CitySaveData, slot: string | null): void {
  useGameStore.setState({
    pendingLoad: data,
    currentSlot: slot,
    cityName: data.name,
    seedText: String(data.seed),
    screen: 'loading',
    loading: { fraction: 0, label: 'Kayıt açılıyor' },
    error: null,
    settingsOpen: false,
    popup: null,
  });
}

export async function deleteSave(id: string): Promise<void> {
  try {
    await store.remove(id);
    if (useGameStore.getState().currentSlot === id) useGameStore.setState({ currentSlot: null });
  } catch (e) {
    toast('error', message(e));
  }
  await refreshSaves();
}

const fileName = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'sehir'}.reiscity.json`;

function download(data: CitySaveData): void {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName(data.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Downloads a stored save, or the running city when no id is given, as a .json file. */
export async function exportSave(id?: string): Promise<void> {
  try {
    if (id) download((await store.read(id)).data);
    else {
      const game = getGame();
      if (game?.isStarted) download(game.serialize());
    }
  } catch (e) {
    toast('error', message(e));
  }
}

/** Reads a .json save file, checks it and stores it as a new manual slot. */
export async function importSave(file: File): Promise<boolean> {
  try {
    if (file.size > 64 * 1024 * 1024) throw new SaveError('Dosya çok büyük.');
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      throw new SaveError('Kayıt dosyası okunamadı: geçerli bir JSON dosyası değil');
    }
    const { data, warnings } = validateSave(raw);
    await store.write(makeMeta(data, newId(), 'manual', ''), data);
    toast('success', `“${data.name}” içe aktarıldı`);
    for (const w of warnings) toast('warning', w);
    await refreshSaves();
    return true;
  } catch (e) {
    toast('error', message(e));
    return false;
  }
}

// ---------------------------------------------------------------- autosave

let timer: ReturnType<typeof setInterval> | null = null;
let lastAuto = 0;

function autosave(): void {
  const s = useGameStore.getState();
  if (s.screen !== 'playing' || !s.settings.gameplay.autosave) return;
  lastAuto = Date.now();
  void saveCity('auto');
}

const onHidden = () => {
  // Leaving the tab: save if the last autosave is more than 30 s old.
  if (document.visibilityState === 'hidden' && Date.now() - lastAuto > 30_000) autosave();
};

/** (Re)starts the autosave timer with the current settings. */
export function startAutosave(): void {
  stopAutosave();
  const minutes = useGameStore.getState().settings.gameplay.autosaveMinutes;
  lastAuto = Date.now();
  timer = setInterval(autosave, minutes * 60_000);
  document.addEventListener('visibilitychange', onHidden);
}

export function stopAutosave(): void {
  if (timer) clearInterval(timer);
  timer = null;
  document.removeEventListener('visibilitychange', onHidden);
}

/** Saves (autosave slot) before leaving the city, so nothing is lost. */
export async function saveBeforeLeaving(): Promise<void> {
  const s = useGameStore.getState();
  if (s.screen === 'playing' && s.settings.gameplay.autosave) await saveCity('auto');
}
