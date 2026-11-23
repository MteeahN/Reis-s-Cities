import { describe, expect, it } from 'vitest';
import { CELL_SIZE } from '../../src/game/core/config';
import { ALL_BUILDINGS } from '../../src/game/data/buildings';
import { variantCount, variantParts } from '../../src/game/entities/building/BuildingModels';
import { PROCEDURAL_VARIANTS } from '../../src/game/entities/building/ProceduralBuildings';

const growables = ALL_BUILDINGS.filter((d) => d.spec);

describe('Growable building detail', () => {
  it('every variant stays inside its lot', () => {
    const bad: string[] = [];
    for (const def of growables) {
      const W = def.spec!.footprint[0] * CELL_SIZE;
      const D = def.spec!.footprint[1] * CELL_SIZE;
      for (let v = 0; v < variantCount(def); v++) {
        for (const p of variantParts(def, v)) {
          const turned = p.rot && Math.abs(p.rot[1]) === 90;
          const hx = (turned ? p.size[2] : p.size[0]) / 2;
          const hz = (turned ? p.size[0] : p.size[2]) / 2;
          if (Math.abs(p.pos[0]) + hx > W / 2 + 0.3 || Math.abs(p.pos[2]) + hz > D / 2 + 0.3) bad.push(`${def.id}#${v} ${p.shape} @${p.pos.map((n) => n.toFixed(1))}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('variants differ in structure, not only colour', () => {
    for (const def of growables) {
      const shapes = new Set<string>();
      for (let v = 0; v < PROCEDURAL_VARIANTS; v++) shapes.add(variantParts(def, v).map((p) => `${p.shape}:${p.size.map((n) => n.toFixed(1))}`).join('|'));
      expect(shapes.size, def.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('growables carry street-level and rooftop detail', () => {
    for (const def of growables) {
      const n = variantParts(def, 0).length;
      expect(n, def.id).toBeGreaterThanOrEqual(10);
    }
  });
});
