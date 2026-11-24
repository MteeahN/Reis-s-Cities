import { useEffect, useState } from 'react';
import { growablePrice, type BuildingDef } from '../../game/data/buildings';
import type { ArchStyle } from '../../game/data/styles';
import { getGame } from '../../store/gameBridge';
import { Icon } from '../components/Icon';

// Thumbnails are drawn one per frame so opening a long list never stalls the game.
const thumbQueue: (() => void)[] = [];
let pumping = false;
function pump(): void {
  if (pumping) return;
  pumping = true;
  const step = () => {
    const job = thumbQueue.shift();
    if (!job) {
      pumping = false;
      return;
    }
    job();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** 3D picture of a building model on a catalogue card. */
export function Thumb({ id, style = 'modern' }: { id: string; style?: ArchStyle }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    thumbQueue.push(() => {
      if (live) setUrl(getGame()?.buildingThumbnail(id, style) ?? '');
    });
    pump();
    return () => {
      live = false;
    };
  }, [id, style]);
  return <span className="card-thumb" aria-hidden>{url ? <img src={url} alt="" draggable={false} /> : null}</span>;
}

export type CatalogSort = 'default' | 'name' | 'price' | 'size';

const SORTS: { id: CatalogSort; name: string }[] = [
  { id: 'default', name: 'Varsayılan' },
  { id: 'name', name: 'Ada göre' },
  { id: 'price', name: 'Fiyata göre' },
  { id: 'size', name: 'Boyuta göre' },
];

const FAV_KEY = 'reis-cities:favorites';

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

let favorites = loadFavorites();
const favListeners = new Set<() => void>();

export function isFavorite(id: string): boolean {
  return favorites.has(id);
}

export function toggleFavorite(id: string): void {
  favorites = new Set(favorites);
  if (favorites.has(id)) favorites.delete(id);
  else favorites.add(id);
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favorites]));
  } catch {
    // Storage full or blocked: favourites still work for this session.
  }
  for (const fn of favListeners) fn();
}

const priceOf = (b: BuildingDef) => (b.zone ? growablePrice(b) : b.cost);
const fold = (s: string) => s.toLocaleLowerCase('tr-TR');

/** Filters and sorts a catalogue list by the search text, favourites and sort order. */
export function filterCatalog(list: BuildingDef[], query: string, sort: CatalogSort, favOnly: boolean, favs: ReadonlySet<string> = favorites): BuildingDef[] {
  const q = fold(query.trim());
  const out = list.filter((b) => (!favOnly || favs.has(b.id)) && (!q || fold(b.name).includes(q) || fold(b.description ?? '').includes(q)));
  if (sort === 'name') out.sort((a, b) => a.name.localeCompare(b.name, 'tr-TR'));
  else if (sort === 'price') out.sort((a, b) => priceOf(a) - priceOf(b));
  else if (sort === 'size') out.sort((a, b) => a.footprint[0] * a.footprint[1] - b.footprint[0] * b.footprint[1]);
  return out;
}

/** Search box, sort menu and favourites toggle shared by every building picker. */
export function useCatalog(list: BuildingDef[]) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<CatalogSort>('default');
  const [favOnly, setFavOnly] = useState(false);
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    favListeners.add(fn);
    return () => {
      favListeners.delete(fn);
    };
  }, []);
  const items = filterCatalog(list, query, sort, favOnly);
  const controls = (
    <div className="catalog-controls">
      <label className="catalog-search">
        <Icon name="search" size={14} />
        <input
          type="search"
          value={query}
          placeholder="Bina ara…"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          aria-label="Katalogda ara"
          data-testid="catalog-search"
        />
      </label>
      <select value={sort} onChange={(e) => setSort(e.target.value as CatalogSort)} aria-label="Sıralama" data-testid="catalog-sort">
        {SORTS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        className={`mode-btn ${favOnly ? 'active' : ''}`}
        onClick={() => setFavOnly(!favOnly)}
        title="Yalnızca favoriler"
        aria-pressed={favOnly}
        data-testid="catalog-favorites"
      >
        <Icon name="star" size={14} />
        <span>Favoriler</span>
      </button>
    </div>
  );
  const empty = items.length === 0 ? <div className="subtoolbar-note">{favOnly ? 'Bu listede favori yok. Kartlardaki ★ ile ekleyin.' : 'Aramaya uyan bina yok.'}</div> : null;
  return { items, controls, empty };
}

/** Star on a card: toggles the favourite without picking the building. */
export function FavStar({ id }: { id: string }) {
  const on = isFavorite(id);
  return (
    <span
      role="button"
      tabIndex={0}
      className={`fav-star ${on ? 'on' : ''}`}
      title={on ? 'Favorilerden çıkar' : 'Favorilere ekle'}
      aria-pressed={on}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleFavorite(id);
        }
      }}
      data-testid={`fav-${id}`}
    >
      ★
    </span>
  );
}
