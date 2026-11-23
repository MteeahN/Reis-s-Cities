import { describe, expect, it } from 'vitest';
import { GRID_CELLS } from '../../src/game/core/config';
import { UtilityLines } from '../../src/game/entities/infra/UtilityLines';
import { labelComponents } from '../../src/game/simulation/Utilities';

function components(lines: UtilityLines): number {
  const mask = new Uint8Array(GRID_CELLS * GRID_CELLS);
  for (let k = 0; k < mask.length; k++) mask[k] = lines.cells[k] > 0 ? 1 : 0;
  return labelComponents(mask).count;
}

describe('Pipe joining', () => {
  it('finds the closest point in the middle of a segment', () => {
    const l = new UtilityLines('pipe');
    l.add({ x: 400, z: 400 }, { x: 600, z: 400 }, 0);
    const hit = l.nearestPoint(503, 404, 6);
    expect(hit).not.toBeNull();
    expect(hit!.p.x).toBeCloseTo(503);
    expect(hit!.p.z).toBeCloseTo(400);
    expect(l.nearestPoint(503, 420, 6)).toBeNull();
  });

  it('a pipe started on the middle of another forms one network (T junction)', () => {
    const l = new UtilityLines('pipe');
    l.add({ x: 400, z: 400 }, { x: 600, z: 400 }, 0);
    const far = new UtilityLines('pipe');
    far.add({ x: 400, z: 400 }, { x: 600, z: 400 }, 0);
    far.add({ x: 500, z: 440 }, { x: 500, z: 600 }, 0);
    expect(components(far)).toBe(2);

    const joint = l.nearestPoint(501, 402, 6)!.p;
    l.add(joint, { x: 500, z: 600 }, 0);
    expect(components(l)).toBe(1);
  });

  it('crossing pipes connect, also diagonally', () => {
    const l = new UtilityLines('pipe');
    l.add({ x: 300, z: 300 }, { x: 700, z: 700 }, 0);
    l.add({ x: 300, z: 700 }, { x: 700, z: 300 }, 0);
    expect(components(l)).toBe(1);
  });
});
