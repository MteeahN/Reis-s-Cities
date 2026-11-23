import { BufferAttribute, BufferGeometry, Color, Mesh, MeshBasicMaterial } from 'three';
import { getRoadType } from '../data/roads';
import type { RoadGraph } from '../entities/road/RoadGraph';
import type { TrafficModel } from '../simulation/traffic/TrafficModel';
import type { RoadRenderer } from './roads/RoadRenderer';

const FREE = new Color(0x3fd18a);
const BUSY = new Color(0xffd23c);
const JAM = new Color(0xf05a50);
const STOP = new Color(0x8e1f1f);
const EMPTY = new Color(0x6f7782);

/** Colour for a volume/capacity ratio: green → yellow → red → dark red. */
export function congestionColor(ratio: number, out: Color): Color {
  if (ratio < 0.02) return out.copy(EMPTY);
  if (ratio < 0.6) return out.copy(FREE).lerp(BUSY, ratio / 0.6);
  if (ratio < 1) return out.copy(BUSY).lerp(JAM, (ratio - 0.6) / 0.4);
  return out.copy(JAM).lerp(STOP, Math.min(1, ratio - 1));
}

/**
 * Traffic density map: a coloured strip over every road, one per travel
 * direction (on its side of the road), from the traffic model's flows.
 */
export class TrafficOverlay {
  readonly mesh: Mesh;
  private visible = false;
  private readonly c = new Color();

  constructor(
    private readonly traffic: TrafficModel,
    private readonly roads: RoadGraph,
    private readonly roadRenderer: RoadRenderer,
  ) {
    this.mesh = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    this.mesh.name = 'traffic-overlay';
    this.mesh.visible = false;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.mesh.visible = v;
    if (v) this.refresh();
  }

  refresh(): void {
    if (!this.visible) return;
    const pos: number[] = [];
    const col: number[] = [];
    const t = this.traffic;
    for (const e of this.roads.edges.values()) {
      const pair = t.linksOf(e.id);
      const prof = this.roadRenderer.edgeProfile(e.id);
      if (!pair || !prof) continue;
      const type = getRoadType(e.typeId);
      const half = type.width / 2 - type.sidewalk;
      for (const l of pair) {
        if (l < 0) continue;
        congestionColor(t.linkRatio(l), this.c);
        // Strip across the half of the road this direction drives on (whole road if one-way).
        const rev = t.linkReverse[l] === 1;
        const inner = type.oneWay ? -half * 0.85 : type.median / 2 + 0.4;
        const outer = half * 0.85;
        const sign = rev ? -1 : 1; // right-hand side of the travel direction
        const pts = prof.points;
        for (let i = 0; i < pts.length - 1; i++) {
          const quad: number[][] = [];
          for (const k of [i, i + 1]) {
            const p = pts[k];
            const tg = prof.tangents[k];
            // Right of the a→b direction is (-tz, tx); flip for b→a.
            const rx = -tg.z * sign;
            const rz = tg.x * sign;
            const y = prof.heights[k] + 0.12;
            quad.push([p.x + rx * inner, y, p.z + rz * inner], [p.x + rx * outer, y, p.z + rz * outer]);
          }
          const [a, b, c, d] = quad;
          for (const v of [a, b, c, b, d, c]) {
            pos.push(v[0], v[1], v[2]);
            col.push(this.c.r, this.c.g, this.c.b);
          }
        }
      }
    }
    const g = this.mesh.geometry;
    g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
    g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
    g.computeBoundingSphere();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
