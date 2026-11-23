import type { RoadGraph } from '../../entities/road/RoadGraph';

export type SignalState = 'green' | 'amber' | 'red' | 'none' | 'stop';

/** Signal timing (game seconds). */
export const GREEN_TIME = 14;
export const AMBER_TIME = 3;
export const ALL_RED_TIME = 1.5;
export const CYCLE = 2 * (GREEN_TIME + AMBER_TIME + ALL_RED_TIME);

interface NodePlan {
  /** Approach edge id → phase (0 or 1). */
  phase: Map<number, number>;
  /** Offset into the cycle, so neighbouring junctions do not switch in lock-step. */
  offset: number;
}

/**
 * Traffic signals: a two-phase plan per signalised junction. Approaches that
 * run roughly in line (within 50° of each other's axis) share a phase; the
 * other approaches get the other phase. Pedestrians cross a road while its
 * approach is red. Time advances with game time.
 */
export class TrafficSignals {
  private time = 0;
  private plans = new Map<number, NodePlan>();
  private version = -1;
  private geometryDirty = true;

  constructor(private readonly roads: RoadGraph) {
    roads.onChange(() => (this.geometryDirty = true));
  }

  update(dtGame: number): void {
    this.time += dtGame;
  }

  get clock(): number {
    return this.time;
  }

  private plan(nodeId: number): NodePlan | null {
    if (this.geometryDirty || this.version !== this.roads.controlsVersion) {
      this.plans.clear();
      this.geometryDirty = false;
      this.version = this.roads.controlsVersion;
    }
    let p = this.plans.get(nodeId);
    if (p) return p;
    const n = this.roads.nodes.get(nodeId);
    if (!n || n.control !== 'lights' || n.edges.length < 2) return null;
    const dirs = n.edges.map((id) => {
      const d = this.roads.directionFrom(this.roads.edges.get(id)!, nodeId);
      return { id, a: Math.atan2(d.z, d.x) };
    });
    const axis = dirs[0].a;
    const phase = new Map<number, number>();
    for (const d of dirs) phase.set(d.id, Math.abs(Math.cos(d.a - axis)) >= Math.cos((50 * Math.PI) / 180) ? 0 : 1);
    // A junction where everything lines up still alternates (e.g. a signalised bend).
    if (![...phase.values()].includes(1) && dirs.length > 1) phase.set(dirs[dirs.length - 1].id, 1);
    p = { phase, offset: ((nodeId * 7919) % 97) / 97 * CYCLE };
    this.plans.set(nodeId, p);
    return p;
  }

  /** State facing traffic that arrives at `nodeId` along `edgeId`. */
  state(nodeId: number, edgeId: number): SignalState {
    const n = this.roads.nodes.get(nodeId);
    if (!n || !n.control) return 'none';
    if (n.control === 'stop') return 'stop';
    const p = this.plan(nodeId);
    if (!p) return 'none';
    const ph = p.phase.get(edgeId);
    if (ph === undefined) return 'none';
    const t = (this.time + p.offset) % CYCLE;
    const half = GREEN_TIME + AMBER_TIME + ALL_RED_TIME;
    const local = ph === 0 ? t : (t - half + CYCLE) % CYCLE;
    if (local < GREEN_TIME) return 'green';
    if (local < GREEN_TIME + AMBER_TIME) return 'amber';
    return 'red';
  }

  /**
   * May pedestrians start crossing `edgeId` at a signalised junction?
   * (Its approach is red and the other phase is not about to end.)
   */
  pedestriansMayCross(nodeId: number, edgeId: number): boolean {
    const p = this.plan(nodeId);
    if (!p) return false;
    const ph = p.phase.get(edgeId);
    if (ph === undefined) return false;
    const t = (this.time + p.offset) % CYCLE;
    const half = GREEN_TIME + AMBER_TIME + ALL_RED_TIME;
    const local = ph === 0 ? t : (t - half + CYCLE) % CYCLE;
    // The crossing runs with the other phase's green, leaving a few seconds to clear.
    return local >= half && local < half + GREEN_TIME - 4;
  }
}
