import { describe, expect, it } from 'vitest';
import { Petitions, PETITION_MIN_POPULATION, PROMISE_DAYS, TRUST_HAPPINESS, type PetitionNeed, type PetitionWorld } from '../../src/game/systems/Petitions';

const DAY = 1440;

function world(lacks: PetitionNeed[], state: { met: boolean; exists?: boolean } = { met: false }): PetitionWorld {
  return {
    homes: [{ id: 7, x: 100, z: 200, residents: 12, lacks }],
    exists: () => state.exists ?? true,
    met: () => state.met,
  };
}

describe('Citizen petitions', () => {
  it('a home that lacks something asks for it, once the town is big enough', () => {
    const p = new Petitions(3);
    expect(p.update(3 * DAY, 1, PETITION_MIN_POPULATION - 1, world(['police']))).toEqual([]);
    const [raised] = p.update(3 * DAY, 1, 500, world(['police']));
    expect(raised.need).toBe('police');
    expect(raised.buildingId).toBe(7);
    expect(p.open?.id).toBe(raised.id);
    // Nothing lacking: nothing to ask.
    const q = new Petitions(3);
    expect(q.update(3 * DAY, 1, 500, world([]))).toEqual([]);
  });

  it('a kept promise raises trust and happiness; a broken one costs more', () => {
    const p = new Petitions(1);
    const state = { met: false };
    const [a] = p.update(3 * DAY, 0, 500, world(['health'], state));
    p.promise(a.id, 3 * DAY);
    expect(p.promised.length).toBe(1);
    state.met = true;
    p.update(4 * DAY, 0, 500, world(['health'], state));
    expect(p.list.find((x) => x.id === a.id)!.state).toBe('kept');
    expect(p.trust).toBeGreaterThan(0);
    expect(p.happinessTerm()).toBeCloseTo(p.trust * TRUST_HAPPINESS);

    const q = new Petitions(1);
    const [b] = q.update(3 * DAY, 0, 500, world(['bus']));
    q.promise(b.id, 3 * DAY);
    q.update(3 * DAY + PROMISE_DAYS * DAY + 1, 0, 500, world(['bus']));
    expect(q.list.find((x) => x.id === b.id)!.state).toBe('broken');
    expect(q.trust).toBeLessThan(-p.trust);
  });

  it('unanswered petitions expire, refusals cost a little, demolished homes are dropped, and it is all saved', () => {
    const p = new Petitions(2);
    const [a] = p.update(3 * DAY, 0, 500, world(['fire']));
    p.update(5 * DAY, 0, 500, world(['fire']));
    expect(p.list.find((x) => x.id === a.id)!.state).toBe('expired');
    const [b] = p.update(9 * DAY, 0, 500, world(['fire']));
    expect(b).toBeDefined();
    p.refuse(b.id, 9 * DAY);
    expect(p.trust).toBeLessThan(0);
    const [c] = p.update(20 * DAY, 0, 500, world(['fire']));
    p.update(20 * DAY + 10, 0, 500, world(['fire'], { met: false, exists: false }));
    expect(p.list.some((x) => x.id === c.id)).toBe(false);

    const copy = new Petitions(2);
    copy.restore(JSON.parse(JSON.stringify(p.serialize())));
    expect(copy.serialize()).toEqual(p.serialize());
  });

  it('trust fades back towards zero over time', () => {
    const p = new Petitions(1);
    const [a] = p.update(3 * DAY, 0, 500, world(['police'], { met: false }));
    p.promise(a.id, 3 * DAY);
    p.update(3 * DAY + 10, 0, 500, world(['police'], { met: true }));
    const t = p.trust;
    p.update(3 * DAY + 20, 30, 0, world([]));
    expect(p.trust).toBeLessThan(t * 0.5);
  });
});
