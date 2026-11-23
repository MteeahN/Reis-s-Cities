import { describe, expect, it } from 'vitest';
import { buildingsInGroup, ZONED_BUILDINGS } from '../../src/game/data/buildings';
import { ZoneType } from '../../src/game/data/zones';
import { filterCatalog } from '../../src/ui/toolbar/catalog';

describe('Building catalogue', () => {
  const landmarks = buildingsInGroup('landmark');

  it('search matches names case-insensitively (Turkish letters too)', () => {
    const hit = filterCatalog(landmarks, 'SAAT', 'default', false);
    expect(hit.some((b) => b.id === 'clock_tower')).toBe(true);
    expect(hit.every((b) => (b.name + ' ' + (b.description ?? '')).toLocaleLowerCase('tr-TR').includes('saat'))).toBe(true);
    expect(filterCatalog(landmarks, 'zzzz-yok', 'default', false)).toEqual([]);
  });

  it('sorts by price, size and name', () => {
    const homes = ZONED_BUILDINGS.filter((b) => b.zone === ZoneType.Residential);
    const bySize = filterCatalog(homes, '', 'size', false).map((b) => b.footprint[0] * b.footprint[1]);
    expect(bySize).toEqual([...bySize].sort((a, b) => a - b));
    const byPrice = filterCatalog(landmarks, '', 'price', false).map((b) => b.cost);
    expect(byPrice).toEqual([...byPrice].sort((a, b) => a - b));
    const byName = filterCatalog(landmarks, '', 'name', false).map((b) => b.name);
    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b, 'tr-TR')));
    // The source list is never reordered.
    expect(filterCatalog(landmarks, '', 'default', false)).toEqual(landmarks);
  });

  it('favourites filter keeps only starred entries', () => {
    const favs = new Set(['plaza', 'clock_tower']);
    expect(filterCatalog(landmarks, '', 'default', true, favs).map((b) => b.id).sort()).toEqual(['clock_tower', 'plaza']);
  });
});
