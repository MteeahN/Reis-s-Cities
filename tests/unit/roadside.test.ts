import { describe, expect, it } from 'vitest';
import { CELL_SIZE, GRID_CELLS } from '../../src/game/core/config';
import { getRoadType } from '../../src/game/data/roads';
import { getBuilding } from '../../src/game/data/buildings';
import { ZoneType } from '../../src/game/data/zones';
import { City, quadsOverlap } from '../../src/game/systems/City';
import { planRoad, type Anchor } from '../../src/game/tools/placement/RoadPlanner';
import { ZoneTool } from '../../src/game/tools/ZoneTool';
import type { ToolContext } from '../../src/game/tools/Tool';
import { generateWorld } from '../../src/game/world/generation/generateWorld';
import { World } from '../../src/game/world/World';

const worldData = generateWorld(12345);
const free = (x: number, z: number): Anchor => ({ kind: 'free', point: { x, z } });

function newCity(): City {
  const city = new City(new World(worldData));
  city.treasury.restore(1e7, city.treasury.spent, city.treasury.refunded);
  return city;
}

/** A crossing of two streets on gentle, owned land (grid aligned). */
function crossing(): { city: City; cx: number; cz: number } {
  for (let cx = 704; cx < 1340; cx += 40) {
    for (let cz = 704; cz < 1340; cz += 40) {
      const c = newCity();
      const a = planRoad(c.roads, free(cx - 120, cz), free(cx + 120, cz), null, getRoadType('street'), c.plannerWorld, 1e9);
      if (!a.valid) continue;
      c.buildRoad(a);
      const b = planRoad(c.roads, free(cx, cz - 120), free(cx, cz + 120), null, getRoadType('street'), c.plannerWorld, 1e9);
      if (!b.valid) continue;
      c.buildRoad(b);
      return { city: c, cx, cz };
    }
  }
  throw new Error('no spot');
}

function zoneTool(city: City, zone: ZoneType) {
  const tool = new ZoneTool({ city, events: { emit: () => {} } } as unknown as ToolContext);
  tool.state = { ...tool.state, zone, mode: 'fill', depth: 4 };
  return (x: number, z: number): number[] => (tool as unknown as { cellsAt(g: { x: number; z: number }): number[] }).cellsAt({ x, z });
}

const cellOf = (x: number, z: number) => Math.floor(z / CELL_SIZE) * GRID_CELLS + Math.floor(x / CELL_SIZE);

describe('Roadside zoning', () => {
  it("takes only the land facing the pointed road, not the crossing road's frontage", () => {
    const { city, cx, cz } = crossing();
    // Point beside the east-west street, east of the crossing, south side.
    const cells = zoneTool(city, ZoneType.Residential)(cx + 60, cz + 12);
    expect(cells.length).toBeGreaterThan(10);
    for (const k of cells) {
      const x = ((k % GRID_CELLS) + 0.5) * CELL_SIZE;
      const z = (Math.floor(k / GRID_CELLS) + 0.5) * CELL_SIZE;
      expect(z).toBeGreaterThan(cz); // the side pointed at
      // Nearer this street than the north-south one.
      expect(Math.abs(z - cz)).toBeLessThanOrEqual(Math.abs(x - cx) + 0.01);
    }
  });

  it('stops at land zoned as something else and leaves it unchanged', () => {
    const { city, cx, cz } = crossing();
    // Residential strip right along the street (first row), east of the crossing.
    const strip: number[] = [];
    for (let x = cx + 24; x < cx + 100; x += CELL_SIZE) strip.push(cellOf(x, cz + 8));
    city.setZone(strip.filter((k) => city.canZone(k)), ZoneType.Residential);
    const zonedBefore = strip.filter((k) => city.zones.zone[k] === ZoneType.Residential);
    expect(zonedBefore.length).toBeGreaterThan(3);
    const cells = zoneTool(city, ZoneType.Industrial)(cx + 60, cz + 12);
    // Nothing residential is taken…
    for (const k of cells) expect(city.zones.zone[k]).not.toBe(ZoneType.Residential);
    // …and nothing behind the residential strip either (the strip is the border).
    for (const k of zonedBefore) expect(cells).not.toContain(k + GRID_CELLS);
    city.setZone(cells, ZoneType.Industrial);
    for (const k of zonedBefore) expect(city.zones.zone[k]).toBe(ZoneType.Residential);
  });
});

describe('Buildings drawn up to the kerb', () => {
  it('a lot one strip of grass away from a straight road is drawn against the road edge', () => {
    const { city, cx, cz } = crossing();
    const half = getRoadType('street').width / 2;
    // A lot facing north (rot 2: front towards −z) whose cells start one cell past the road cells.
    const i = Math.floor((cx + 64) / CELL_SIZE);
    let j = Math.floor(cz / CELL_SIZE) + 1;
    while (city.occupancy.road[j * GRID_CELLS + i] > 0) j++;
    const snap = city.roadSnap(i, j, 1, 1, 2);
    const frontZ = j * CELL_SIZE + (snap?.z ?? 0);
    expect(frontZ).toBeCloseTo(cz + half + 0.1, 1);
    // Picking finds it where it is drawn.
    city.buildings.create({ defId: 'res1_house_a', i, j, rot: 2, w: 1, d: 1, baseY: 0, minY: 0, cost: 0, zone: ZoneType.Residential, level: 1, state: 'active', tint: 0, sinceTick: 0 });
    const b = [...city.buildings.items.values()].at(-1)!;
    city.occupancy.setBuilding(b.id, b.cells);
    expect(city.buildingAtWorld((i + 0.5) * CELL_SIZE, frontZ + 1)).toBe(b.id);
  });
});

describe('Buildings on curved roads', () => {
  it('turn to face the curve and meet the kerb with their whole front', () => {
    const city = newCity();
    let built: { cx: number; cz: number } | null = null;
    for (let cx = 760; cx < 1300 && !built; cx += 60) {
      for (let cz = 760; cz < 1300 && !built; cz += 60) {
        const plan = planRoad(city.roads, free(cx - 90, cz), free(cx + 90, cz), { x: cx, z: cz + 80 }, getRoadType('city'), city.plannerWorld, 1e9);
        if (plan.valid) {
          city.buildRoad(plan);
          built = { cx, cz };
        }
      }
    }
    expect(built).not.toBeNull();
    const { cx, cz } = built!;
    const half = getRoadType('city').width / 2;
    let turned = 0;
    let checked = 0;
    // Lots along the outside of the curve, facing it.
    for (let x = cx - 60; x <= cx + 60; x += 8) {
      for (let z = cz + 30; z <= cz + 80; z += 8) {
        const i = Math.floor(x / CELL_SIZE);
        const j = Math.floor(z / CELL_SIZE);
        for (const rot of [0, 1, 2, 3] as const) {
          const p = city.planBuilding('plaza', i, j, rot);
          if (!p.valid) continue;
          const s = city.roadSnap(p.i, p.j, p.w, p.d, p.rot);
          if (!s) continue;
          checked++;
          if (Math.abs(s.yaw) > 0.05) turned++;
          // The turned and moved front touches the kerb (its closest point) without cutting into the road.
          const [sx, sz] = [[0, 1], [1, 0], [0, -1], [-1, 0]][rot];
          const hd = (sx !== 0 ? p.w : p.d) * CELL_SIZE * 0.5;
          const hw = (sx !== 0 ? p.d : p.w) * CELL_SIZE * 0.5 * 0.95;
          const gaps = [0, 1, -1].map((side) => {
            const vx = sx * hd - sz * hw * side;
            const vz = sz * hd + sx * hw * side;
            const fx = p.centerX + s.x + vx * Math.cos(s.yaw) + vz * Math.sin(s.yaw);
            const fz = p.centerZ + s.z - vx * Math.sin(s.yaw) + vz * Math.cos(s.yaw);
            return city.roads.nearestEdge(fx, fz, 30, true)!.dist - half;
          });
          expect(Math.min(...gaps)).toBeGreaterThan(-0.4);
          expect(Math.min(...gaps)).toBeLessThan(0.5);
          // The front lies along the road: both corners equally far from it (not one corner alone).
          expect(Math.abs(gaps[1] - gaps[2])).toBeLessThan(0.6);
        }
      }
    }
    expect(checked).toBeGreaterThan(2);
    expect(turned).toBeGreaterThan(0);
  });
});

describe('Buildings drawn along curves never overlap', () => {
  it('each building, as drawn (turned and moved), stays clear of the others and of the road', () => {
    const city = newCity();
    let built: { cx: number; cz: number } | null = null;
    for (let cx = 760; cx < 1300 && !built; cx += 60) {
      for (let cz = 760; cz < 1300 && !built; cz += 60) {
        const plan = planRoad(city.roads, free(cx - 90, cz), free(cx + 90, cz), { x: cx, z: cz + 80 }, getRoadType('city'), city.plannerWorld, 1e9);
        if (plan.valid) {
          city.buildRoad(plan);
          built = { cx, cz };
        }
      }
    }
    const { cx, cz } = built!;
    // Pack houses and shops along both sides of the curve, the way a player would.
    for (let x = cx - 90; x <= cx + 90; x += 4) {
      for (let z = cz - 30; z <= cz + 100; z += 4) {
        for (const rot of [0, 1, 2, 3] as const) {
          for (const defId of ['res1_house_a', 'plaza']) {
            const p = city.planBuilding(defId, Math.floor(x / CELL_SIZE), Math.floor(z / CELL_SIZE), rot);
            if (p.valid) city.placeBuilding(p);
          }
        }
      }
    }
    const c = city as unknown as { drawnCorners(i: number, j: number, w: number, d: number, s: { x: number; z: number; yaw: number } | null, inset?: number): { x: number; z: number }[] };
    const all = [...city.buildings.items.values()];
    expect(all.length).toBeGreaterThan(10);
    expect(all.some((b) => Math.abs(b.oyaw ?? 0) > 0.05)).toBe(true);
    const quads = all.map((b) => c.drawnCorners(b.i, b.j, b.w, b.d, { x: b.ox ?? 0, z: b.oz ?? 0, yaw: b.oyaw ?? 0 }, 0.3));
    for (let a = 0; a < quads.length; a++) for (let b = a + 1; b < quads.length; b++) expect(quadsOverlap(quads[a], quads[b])).toBe(false);
  });
});

describe('Road magnet (hand placement along curved roads)', () => {
  function curvedCity() {
    const city = newCity();
    let built: { cx: number; cz: number } | null = null;
    for (let cx = 760; cx < 1300 && !built; cx += 60) {
      for (let cz = 760; cz < 1300 && !built; cz += 60) {
        const plan = planRoad(city.roads, free(cx - 90, cz), free(cx + 90, cz), { x: cx, z: cz + 80 }, getRoadType('city'), city.plannerWorld, 1e9);
        if (plan.valid) {
          city.buildRoad(plan);
          built = { cx, cz };
        }
      }
    }
    return { city, ...built! };
  }
  const half = getRoadType('city').width / 2;
  /** Gaps of the front centre and corners to the kerb, for a free plan. */
  function frontGaps(city: City, defId: string, s: { x: number; z: number; yaw: number }) {
    const fp = getBuilding(defId).footprint;
    const hw = (fp[0] * CELL_SIZE) / 2;
    const hd = (fp[1] * CELL_SIZE) / 2;
    const f = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
    const p = { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) };
    return [0, 1, -1].map((side) => {
      const x = s.x + f.x * hd + p.x * hw * 0.95 * side;
      const z = s.z + f.z * hd + p.z * hw * 0.95 * side;
      return city.roads.nearestEdge(x, z, 30, true)!.dist - half;
    });
  }

  it('pulls the building to the road, turned to it, its whole front at the kerb', () => {
    const { city, cx, cz } = curvedCity();
    let seen = 0;
    for (let x = cx - 70; x <= cx + 70; x += 10) {
      // A point 9 m off the kerb, on the outside and the inside of the bend.
      for (const sgn of [1, -1]) {
        const t = city.roads.nearestEdge(x, cz + 60, 200, true)!;
        const nx = (x - t.point.x) / t.dist;
        const nz = (cz + 60 - t.point.z) / t.dist;
        const px = t.point.x + nx * sgn * (half + 9);
        const pz = t.point.z + nz * sgn * (half + 9);
        const plan = city.magnetPlan('res1_house_a', px, pz);
        if (!plan || !plan.valid || !plan.free) continue;
        seen++;
        const g = frontGaps(city, 'res1_house_a', plan.free);
        expect(Math.min(...g)).toBeGreaterThan(-0.3);
        expect(Math.min(...g)).toBeLessThan(0.4);
        expect(Math.abs(g[1] - g[2])).toBeLessThan(0.6);
      }
    }
    expect(seen).toBeGreaterThan(4);
  });

  it('neighbours line up without overlapping; saves and undo keep them where they were placed', async () => {
    const { city, cx, cz } = curvedCity();
    const placed: number[] = [];
    for (let x = cx - 80; x <= cx + 80; x += 3) {
      const t = city.roads.nearestEdge(x, cz + 70, 200, true)!;
      const nx = (x - t.point.x) / t.dist;
      const nz = (cz + 70 - t.point.z) / t.dist;
      const plan = city.magnetPlan('res1_house_a', t.point.x + nx * (half + 6), t.point.z + nz * (half + 6));
      if (plan?.valid && plan.free) {
        const b = city.placeBuilding(plan);
        if (b) placed.push(b.id);
      }
    }
    expect(placed.length).toBeGreaterThan(4);
    const all = [...city.buildings.items.values()];
    expect(all.every((b) => b.free && b.free.length > 0)).toBe(true);
    const c = city as unknown as { drawnCorners(i: number, j: number, w: number, d: number, s: { x: number; z: number; yaw: number } | null, inset?: number): { x: number; z: number }[] };
    const quads = all.map((b) => c.drawnCorners(b.i, b.j, b.w, b.d, { x: b.ox ?? 0, z: b.oz ?? 0, yaw: b.oyaw ?? 0 }, 0.3));
    for (let a = 0; a < quads.length; a++) for (let b = a + 1; b < quads.length; b++) expect(quadsOverlap(quads[a], quads[b])).toBe(false);
    // Each building owns the cells it covers; a grid building can't go there.
    for (const b of all) for (const k of b.free!) expect(city.occupancy.building[k]).toBe(b.id);
    // Undo and redo put it back exactly.
    const last = city.buildings.items.get(placed.at(-1)!)!;
    const where = { ox: last.ox, oz: last.oz, oyaw: last.oyaw, cells: [...last.cells] };
    city.undoLast();
    expect(city.buildings.items.has(last.id)).toBe(false);
    city.redoLast();
    const again = [...city.buildings.items.values()].at(-1)!;
    expect({ ox: again.ox, oz: again.oz, oyaw: again.oyaw, cells: [...again.cells] }).toEqual(where);
    // Road access counts the kerb it stands at.
    expect(city.roadAccessOf(again)).toBe(true);
  });
});
