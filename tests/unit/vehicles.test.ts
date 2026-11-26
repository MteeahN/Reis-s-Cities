import { describe, expect, it } from 'vitest';
import { getRoadType } from '../../src/game/data/roads';
import { RoadGraph } from '../../src/game/entities/road/RoadGraph';
import { RoadRenderer } from '../../src/game/rendering/roads/RoadRenderer';
import { VehicleRenderer } from '../../src/game/rendering/VehicleRenderer';
import { SPACE_LENGTH } from '../../src/game/simulation/Parking';
import { TrafficSignals } from '../../src/game/simulation/traffic/Signals';
import { TrafficModel } from '../../src/game/simulation/traffic/TrafficModel';

type Space = { n: number; start: number };
type Pose = { x: number; z: number };
interface Inner {
  spacesOf(edgeId: number): Space;
  parkedPose(p: { edge: number; slot: number; side: 1 | -1; illegal: boolean; color: number; model: number }, out: Pose & { y: number; dx: number; dz: number }): Pose | null;
}

/** A fork: one street splitting into two at a sharp angle (the junction surface reaches far along them). */
function fork() {
  const g = new RoadGraph();
  const m = g.addNode(500, 500).id;
  const a = g.addNode(300, 500).id;
  const b = g.addNode(700, 470).id;
  const c = g.addNode(700, 560).id;
  g.addEdge(a, m, 'street', { x: 400, z: 500 }, 0);
  g.addEdge(m, b, 'street', { x: 600, z: 488 }, 0);
  g.addEdge(m, c, 'street', { x: 600, z: 524 }, 0);
  const rr = new RoadRenderer(g, () => 10);
  const vr = new VehicleRenderer(new TrafficModel(g), g, rr, new TrafficSignals(g), 50, null);
  return { g, m, rr, vr: vr as unknown as Inner };
}

describe('Parked cars at junctions', () => {
  it('kerb spaces start past the junction surface at both ends of every street', () => {
    const { g, rr, vr } = fork();
    let checked = 0;
    for (const e of g.edges.values()) {
      const { n, start } = vr.spacesOf(e.id);
      if (n === 0) continue;
      checked++;
      expect(start).toBeGreaterThanOrEqual(rr.setbackAt(e.a, e.id) + 4 - 1e-9);
      expect(start + n * SPACE_LENGTH).toBeLessThanOrEqual(e.length - rr.setbackAt(e.b, e.id) - 4 + 1e-9);
    }
    expect(checked).toBeGreaterThan(1);
  });

  it('no parked car stands on the carriageway of another road (a fork reaches far along its roads)', () => {
    const { g, vr } = fork();
    for (const e of g.edges.values()) {
      const { n } = vr.spacesOf(e.id);
      for (let k = 0; k < n; k++) {
        for (const side of [1, -1] as const) {
          const p = vr.parkedPose({ edge: e.id, slot: k, side, illegal: true, color: 0, model: 0 }, { x: 0, y: 0, z: 0, dx: 0, dz: 1 })!;
          for (const o of g.edges.values()) {
            if (o.id === e.id) continue;
            const hit = g.nearestEdge(p.x, p.z, 40, true, (x) => x.id === o.id);
            if (!hit) continue;
            const t = getRoadType(o.typeId);
            expect(hit.dist, `edge ${e.id} space ${k}`).toBeGreaterThan(t.width / 2 - t.sidewalk);
          }
        }
      }
    }
  });
});

describe('Following a vehicle', () => {
  it('follows only a vehicle near the point clicked, and lets go when its trip is over', () => {
    const { vr } = fork();
    const r = vr as unknown as { vehicles: object[]; followAt(x: number, z: number): boolean; followState(): unknown; stopFollow(): void };
    expect(r.followAt(500, 500)).toBe(false);
    const v = { drawn: { x: 510, y: 10, z: 500, heading: 0 }, path: { links: [0], startFrac: 0, endFrac: 1, freight: false }, idx: 0, s: 0, truck: false, model: 1, speed: 10, manoeuvre: null, enter: 0 };
    r.vehicles.push(v);
    expect(r.followAt(530, 500)).toBe(false); // 20 m away: not this one
    expect(r.followAt(512, 501)).toBe(true);
    const st = r.followState() as { x: number; kmh: number; truck: boolean };
    expect(st.x).toBe(510);
    expect(st.kmh).toBeCloseTo(36);
    expect(st.truck).toBe(false);
    // Its trip ends (parked or arrived): it is no longer on the road, and no longer followed.
    r.vehicles.length = 0;
    expect(r.followState()).toBeNull();
  });
});
