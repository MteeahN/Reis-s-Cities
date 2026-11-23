import { describe, expect, it } from 'vitest';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { CYCLE, TrafficSignals } from '../../src/game/simulation/traffic/Signals';
import { junctionDelay, TrafficModel } from '../../src/game/simulation/traffic/TrafficModel';

/** A plus-shaped junction: centre node with four arms. */
function plus() {
  const g = new RoadGraph();
  const c = g.addNode(500, 500);
  const arms = [
    [600, 500],
    [500, 600],
    [400, 500],
    [500, 400],
  ].map(([x, z]) => {
    const n = g.addNode(x, z);
    return g.addEdge(c.id, n.id, 'street', { x: (500 + x) / 2, z: (500 + z) / 2 }, 100);
  });
  return { g, c, arms };
}

describe('One-way roads', () => {
  it('direction follows the player setting, survives split and save', () => {
    const { g, arms } = plus();
    const e = arms[0];
    expect(g.direction(e)).toBe(0);
    let fired = 0;
    g.onControlsChange(() => fired++);
    g.setOneWay(e.id, -1);
    expect(g.direction(e)).toBe(-1);
    expect(fired).toBe(1);
    const { left, right } = g.splitEdge(e.id, 0.5);
    expect(g.direction(left)).toBe(-1);
    expect(g.direction(right)).toBe(-1);
    const copy = RoadGraph.deserialize(JSON.parse(JSON.stringify(g.serialize())));
    expect(copy.direction(copy.edges.get(left.id)!)).toBe(-1);
    g.setOneWay(left.id, 0);
    expect(g.direction(left)).toBe(0);
  });

  it('the traffic model drops the forbidden direction and gives the road all lanes', () => {
    const { g, arms } = plus();
    const tm = new TrafficModel(g);
    tm.step([], { stats: () => ({}) } as never, 1, 480);
    const before = tm.linksOf(arms[0].id)!;
    expect(before[0]).toBeGreaterThanOrEqual(0);
    expect(before[1]).toBeGreaterThanOrEqual(0);
    const capTwoWay = tm.linkCap[before[0]];
    g.setOneWay(arms[0].id, 1);
    tm.step([], { stats: () => ({}) } as never, 1, 480);
    const after = tm.linksOf(arms[0].id)!;
    expect(after[0]).toBeGreaterThanOrEqual(0);
    expect(after[1]).toBe(-1);
    expect(tm.linkCap[after[0]]).toBeCloseTo(capTwoWay * 2);
  });
});

describe('Junction controls', () => {
  it('signals beat an uncontrolled junction when busy, not when quiet', () => {
    expect(junctionDelay(null, 0.1)).toBeLessThan(junctionDelay('lights', 0.1));
    expect(junctionDelay('lights', 1.2)).toBeLessThan(junctionDelay(null, 1.2));
    expect(junctionDelay('stop', 0.1)).toBeGreaterThan(junctionDelay(null, 0.1));
  });

  it('two-phase signals: crossing roads never both green; pedestrians cross on red', () => {
    const { g, c, arms } = plus();
    g.setControl(c.id, 'lights');
    const s = new TrafficSignals(g);
    let sawGreen = [false, false];
    for (let t = 0; t < CYCLE * 2; t += 0.5) {
      s.update(0.5);
      const ew = s.state(c.id, arms[0].id);
      const ns = s.state(c.id, arms[1].id);
      expect(s.state(c.id, arms[2].id)).toBe(ew); // opposite arms share a phase
      expect(ew === 'green' && ns === 'green').toBe(false);
      if (ew === 'green') sawGreen[0] = true;
      if (ns === 'green') sawGreen[1] = true;
      if (s.pedestriansMayCross(c.id, arms[0].id)) expect(ew).toBe('red');
    }
    expect(sawGreen).toEqual([true, true]);
    g.setControl(c.id, 'stop');
    expect(s.state(c.id, arms[0].id)).toBe('stop');
    g.setControl(c.id, null);
    expect(s.state(c.id, arms[0].id)).toBe('none');
  });

  it('controls are saved with the road network', () => {
    const { g, c } = plus();
    g.setControl(c.id, 'lights');
    const copy = RoadGraph.deserialize(JSON.parse(JSON.stringify(g.serialize())));
    expect(copy.nodes.get(c.id)!.control).toBe('lights');
  });
});
