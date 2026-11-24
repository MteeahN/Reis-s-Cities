import { BoxGeometry, CylinderGeometry, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { getRoadType, ROAD_CATEGORIES, ROAD_TYPES } from '../../src/game/data/roads';
import { buildingGeometry, buildingMaterials } from '../../src/game/entities/building/BuildingModels';
import { getBuilding } from '../../src/game/data/buildings';
import { hasInk, inkEdges, patchInk } from '../../src/game/rendering/ink';

/** Number of triangle edges drawn as ink lines (a coordinate equal to 1 means "on a line"). */
function drawnEdges(g: ReturnType<typeof inkEdges>): number {
  const a = g.getAttribute('aInk');
  let n = 0;
  for (let t = 0; t < a.count / 3; t++) {
    for (let k = 0; k < 3; k++) {
      // Component k is the edge opposite corner k: drawn when it is 1 at the two other corners.
      const others = [0, 1, 2].filter((v) => v !== k);
      if (others.every((v) => a.getComponent(t * 3 + v, k) === 1)) n++;
    }
  }
  return n;
}

describe('Ink edges', () => {
  it('draws the 12 edges of a box (each seen from both faces) and hides quad diagonals', () => {
    const g = inkEdges(new BoxGeometry(2, 3, 4));
    expect(g.index).toBeNull();
    // 12 cube edges × 2 adjacent faces; the 6 diagonals are hidden.
    expect(drawnEdges(g)).toBe(24);
  });

  it('hides the facets of a smooth cylinder but keeps its rims', () => {
    const g = inkEdges(new CylinderGeometry(1, 1, 2, 16, 1, false), 30);
    // Rims: 16 segments on the side (top + bottom) and 16 on each cap.
    expect(drawnEdges(g)).toBe(64);
  });

  it('values are offset so a mesh without the attribute gets no lines', () => {
    const a = inkEdges(new BoxGeometry()).getAttribute('aInk');
    for (let i = 0; i < a.count * 3; i++) expect((a.array as Float32Array)[i]).toBeGreaterThanOrEqual(1);
  });

  it('building models carry ink edges and their materials draw them', () => {
    const g = buildingGeometry(getBuilding('clock_tower'));
    for (const part of [g.plain, g.facade, g.detail]) if (part) expect(part.getAttribute('aInk')).toBeTruthy();
    const m = buildingMaterials();
    expect(hasInk(m.plain)).toBe(true);
    expect(hasInk(m.facade)).toBe(true);
    const plain = new MeshStandardMaterial();
    patchInk(plain);
    expect(hasInk(plain)).toBe(true);
    expect(hasInk(new MeshStandardMaterial())).toBe(false);
  });
});

describe('Road catalogue', () => {
  it('has one-way streets and puts every type in a tab', () => {
    const one = getRoadType('oneway1');
    const two = getRoadType('oneway2');
    expect(one.oneWay && two.oneWay).toBe(true);
    expect([one.lanes, two.lanes]).toEqual([1, 2]);
    expect(two.capacity).toBeGreaterThan(getRoadType('street').capacity);
    const ids = new Set(ROAD_CATEGORIES.map((c) => c.id));
    for (const t of ROAD_TYPES) expect(ids.has(t.category)).toBe(true);
    // Older types keep their place (the list order sets each type's render lift).
    expect(ROAD_TYPES.slice(0, 5).map((t) => t.id)).toEqual(['street', 'city', 'avenue', 'boulevard', 'highway']);
  });
});
