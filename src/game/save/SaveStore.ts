import { SaveError, validateSave, type CitySaveData, type SaveMeta } from './CitySave';

/**
 * Key-value storage behind the save system: two collections, the small
 * summaries (for the load list) and the full city data.
 */
export interface SaveBackend {
  listMeta(): Promise<SaveMeta[]>;
  readData(id: string): Promise<unknown>;
  write(meta: SaveMeta, data: CitySaveData): Promise<void>;
  remove(id: string): Promise<void>;
}

const DB_NAME = 'reis-cities';
const DB_VERSION = 1;
const META = 'meta';
const DATA = 'data';

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('aborted'));
  });

/** Browser storage (IndexedDB). Data records are stored as `{ id, data }`. */
export class IndexedDbSaveBackend implements SaveBackend {
  private db: Promise<IDBDatabase> | null = null;

  static available(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(DATA)) db.createObjectStore(DATA, { keyPath: 'id' });
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('blocked'));
    }).catch((e) => {
      this.db = null;
      throw e;
    });
    return this.db;
  }

  async listMeta(): Promise<SaveMeta[]> {
    const db = await this.open();
    return req(db.transaction(META, 'readonly').objectStore(META).getAll() as IDBRequest<SaveMeta[]>);
  }

  async readData(id: string): Promise<unknown> {
    const db = await this.open();
    const rec = (await req(db.transaction(DATA, 'readonly').objectStore(DATA).get(id))) as { data?: unknown } | undefined;
    return rec?.data;
  }

  async write(meta: SaveMeta, data: CitySaveData): Promise<void> {
    const db = await this.open();
    // One transaction: the list never shows a save whose data is missing.
    const tx = db.transaction([META, DATA], 'readwrite');
    tx.objectStore(DATA).put({ id: meta.id, data });
    tx.objectStore(META).put(meta);
    await done(tx);
  }

  async remove(id: string): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([META, DATA], 'readwrite');
    tx.objectStore(DATA).delete(id);
    tx.objectStore(META).delete(id);
    await done(tx);
  }
}

/** In-memory storage (tests, or browsers without IndexedDB). Data is deep-copied like a real store. */
export class MemorySaveBackend implements SaveBackend {
  private meta = new Map<string, SaveMeta>();
  private data = new Map<string, string>();

  async listMeta(): Promise<SaveMeta[]> {
    return [...this.meta.values()].map((m) => ({ ...m }));
  }

  async readData(id: string): Promise<unknown> {
    const d = this.data.get(id);
    return d === undefined ? undefined : JSON.parse(d);
  }

  async write(meta: SaveMeta, data: CitySaveData): Promise<void> {
    this.data.set(meta.id, JSON.stringify(data));
    this.meta.set(meta.id, { ...meta });
  }

  async remove(id: string): Promise<void> {
    this.meta.delete(id);
    this.data.delete(id);
  }
}

/** Turns storage failures into messages the player can act on. */
function storageError(e: unknown): SaveError {
  if (e instanceof SaveError) return e;
  const name = (e as { name?: string })?.name;
  if (name === 'QuotaExceededError') return new SaveError('Tarayıcı depolama alanı dolu: eski kayıtları silin.');
  return new SaveError(`Tarayıcı depolamasına erişilemedi (${name ?? String(e)}).`);
}

/** Save slots: list, read (validated), write, delete. */
export class SaveStore {
  constructor(private readonly backend: SaveBackend) {}

  async list(): Promise<SaveMeta[]> {
    try {
      const all = await this.backend.listMeta();
      return all.sort((a, b) => b.savedAt - a.savedAt);
    } catch (e) {
      throw storageError(e);
    }
  }

  async read(id: string): Promise<{ data: CitySaveData; warnings: string[] }> {
    let raw: unknown;
    try {
      raw = await this.backend.readData(id);
    } catch (e) {
      throw storageError(e);
    }
    if (raw === undefined) throw new SaveError('Kayıt bulunamadı (silinmiş olabilir).');
    return validateSave(raw);
  }

  async write(meta: SaveMeta, data: CitySaveData): Promise<void> {
    try {
      await this.backend.write(meta, data);
    } catch (e) {
      throw storageError(e);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.backend.remove(id);
    } catch (e) {
      throw storageError(e);
    }
  }
}
