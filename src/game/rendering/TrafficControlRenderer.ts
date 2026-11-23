import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getRoadType } from '../data/roads';
import type { RoadGraph } from '../entities/road/RoadGraph';
import type { TrafficSignals } from '../simulation/traffic/Signals';
import { CURB_HEIGHT } from './roads/roadGeometry';
import { sampleProfile, type RoadRenderer, type SurfacePoint } from './roads/RoadRenderer';

const ARROW_SPACING = 22;
const LAMP_ON: Record<number, Color> = { 0: new Color(1, 0.12, 0.08), 1: new Color(1, 0.62, 0.05), 2: new Color(0.15, 1, 0.35) };
const LAMP_OFF = new Color(0.08, 0.07, 0.06);

/** A signal head's three lamps (red, amber, green) for one approach. */
interface Head {
  node: number;
  edge: number;
}

/** Signal pole with an arm reaching over the road; local frame: +z faces approaching traffic, −x points over the road. */
function signalPoleGeometry(arm: number): BufferGeometry {
  const parts = [
    new CylinderGeometry(0.12, 0.16, 5.6, 8).translate(0, 2.8, 0),
    new BoxGeometry(arm, 0.14, 0.14).translate(-arm / 2, 5.4, 0),
    new BoxGeometry(0.45, 1.25, 0.32).translate(-(arm - 0.3), 4.55, 0),
    new BoxGeometry(0.62, 1.4, 0.06).translate(-(arm - 0.3), 4.48, -0.17),
    new BoxGeometry(0.32, 0.9, 0.3).translate(0, 2.3, 0.16),
  ];
  return mergeGeometries(parts.map((g) => g.toNonIndexed()))!;
}

function stopSignGeometry(): { pole: BufferGeometry; face: BufferGeometry; rim: BufferGeometry } {
  return {
    pole: new CylinderGeometry(0.05, 0.05, 2.3, 6).translate(0, 1.15, 0),
    face: new CylinderGeometry(0.36, 0.36, 0.04, 8).rotateX(Math.PI / 2).rotateZ(Math.PI / 8).translate(0, 2.25, 0.04),
    rim: new CylinderGeometry(0.4, 0.4, 0.03, 8).rotateX(Math.PI / 2).rotateZ(Math.PI / 8).translate(0, 2.25, 0.01),
  };
}

/** Flat arrow pointing +z, lying on the road. */
function arrowGeometry(): BufferGeometry {
  const s = new Shape();
  s.moveTo(-0.18, -1.4);
  s.lineTo(0.18, -1.4);
  s.lineTo(0.18, 0.3);
  s.lineTo(0.55, 0.3);
  s.lineTo(0, 1.4);
  s.lineTo(-0.55, 0.3);
  s.lineTo(-0.18, 0.3);
  s.closePath();
  return new ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }).rotateX(Math.PI / 2);
}

/**
 * Street furniture for traffic control: signal poles with live lamps at
 * signalised junctions, stop signs, and direction arrows on one-way roads.
 */
export class TrafficControlRenderer {
  readonly group = new Group();
  private readonly poleMat = new MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.6, metalness: 0.4 });
  private readonly whiteMat = new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  private readonly redMat = new MeshStandardMaterial({ color: 0xc0302a, roughness: 0.6 });
  private readonly lampMat = new MeshBasicMaterial({ color: 0xffffff });
  private readonly stopGeo = stopSignGeometry();
  private readonly arrowGeo = arrowGeometry();
  private readonly lampGeo = new SphereGeometry(0.13, 10, 8);
  private meshes: InstancedMesh[] = [];
  private lamps: InstancedMesh | null = null;
  private heads: Head[] = [];
  private dirty = true;
  private readonly pt: SurfacePoint = { x: 0, y: 0, z: 0, tx: 1, tz: 0 };
  private readonly unsubs: (() => void)[];

  constructor(
    private readonly roads: RoadGraph,
    private readonly roadRenderer: RoadRenderer,
    private readonly signals: TrafficSignals,
  ) {
    this.group.name = 'traffic-control';
    const mark = () => (this.dirty = true);
    this.unsubs = [roads.onChange(mark), roads.onControlsChange(mark)];
  }

  /** Point at distance `d` from `nodeId` along `edgeId`, with the unit direction pointing away from the node. */
  private endFrame(nodeId: number, edgeId: number, d: number): SurfacePoint | null {
    const e = this.roads.edges.get(edgeId);
    const prof = this.roadRenderer.edgeProfile(edgeId);
    if (!e || !prof) return null;
    const atA = e.a === nodeId;
    sampleProfile(prof, atA ? d : prof.length - d, this.pt);
    if (!atA) {
      this.pt.tx = -this.pt.tx;
      this.pt.tz = -this.pt.tz;
    }
    return this.pt;
  }

  private rebuild(): void {
    for (const m of this.meshes) {
      this.group.remove(m);
      m.dispose();
    }
    this.meshes = [];
    if (this.lamps) {
      this.group.remove(this.lamps);
      this.lamps.dispose();
      this.lamps = null;
    }
    this.heads = [];
    const poles: { m: Matrix4; arm: number }[] = [];
    const stops: Matrix4[] = [];
    const arrows: Matrix4[] = [];
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    for (const n of this.roads.nodes.values()) {
      if (!n.control) continue;
      for (const eid of n.edges) {
        const e = this.roads.edges.get(eid)!;
        // Only approaches traffic can arrive by.
        const dir = this.roads.direction(e);
        if ((dir === 1 && e.a === n.id) || (dir === -1 && e.b === n.id)) continue;
        const type = getRoadType(e.typeId);
        const half = type.width / 2;
        const f = this.endFrame(n.id, eid, this.roadRenderer.setbackAt(n.id, eid) + 0.6);
        if (!f) continue;
        // Kerb on the drivers' right (−n of the away direction), facing approaching traffic.
        const rx = f.tz;
        const rz = -f.tx;
        const off = half - Math.max(0.5, type.sidewalk * 0.5);
        const x = f.x + rx * off;
        const z = f.z + rz * off;
        const y = f.y + (type.sidewalk > 0 ? CURB_HEIGHT : 0);
        // Local +z → away direction (faces drivers), local +x → the drivers' right (so the arm, along −x, spans the road).
        q.setFromAxisAngle(up, Math.atan2(f.tx, f.tz));
        const m = new Matrix4().compose(new Vector3(x, y, z), q, one);
        if (n.control === 'lights') {
          const arm = Math.min(half, type.oneWay || dir !== 0 ? half : half * 0.55) + 0.2;
          poles.push({ m, arm });
          this.heads.push({ node: n.id, edge: eid });
        } else stops.push(m);
      }
    }
    for (const e of this.roads.edges.values()) {
      const dir = this.roads.direction(e);
      if (dir === 0) continue;
      const prof = this.roadRenderer.edgeProfile(e.id);
      if (!prof) continue;
      const type = getRoadType(e.typeId);
      const sA = this.roadRenderer.setbackAt(e.a, e.id) + 4;
      const sB = prof.length - this.roadRenderer.setbackAt(e.b, e.id) - 4;
      const n = Math.floor((sB - sA) / ARROW_SPACING);
      const lanes = Math.max(1, Math.min(4, type.lanes));
      const laneW = (type.width - 2 * type.sidewalk - type.median) / lanes;
      for (let k = 0; k <= n; k++) {
        const s = n === 0 ? (sA + sB) / 2 : sA + ((sB - sA) * k) / n;
        if (sB - sA < 2) break;
        sampleProfile(prof, s, this.pt);
        const tx = this.pt.tx * dir;
        const tz = this.pt.tz * dir;
        q.setFromAxisAngle(up, Math.atan2(tx, tz));
        for (let l = 0; l < lanes; l++) {
          const o = (l + 0.5 - lanes / 2) * laneW;
          arrows.push(new Matrix4().compose(new Vector3(this.pt.x - this.pt.tz * o, this.pt.y + 0.03, this.pt.z + this.pt.tx * o), q, one));
        }
      }
    }
    // Poles differ by arm length: bucket them (short / long arm).
    const buckets = new Map<number, Matrix4[]>();
    for (const p of poles) {
      const key = Math.round(p.arm * 2) / 2;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(p.m);
    }
    const add = (geo: BufferGeometry, mat: MeshStandardMaterial, list: Matrix4[], shadow = true) => {
      if (!list.length) return;
      const im = new InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = shadow;
      im.computeBoundingSphere();
      this.group.add(im);
      this.meshes.push(im);
    };
    for (const [arm, list] of buckets) add(signalPoleGeometry(arm), this.poleMat, list);
    add(this.stopGeo.pole, this.poleMat, stops);
    add(this.stopGeo.rim, this.whiteMat, stops, false);
    add(this.stopGeo.face, this.redMat, stops, false);
    add(this.arrowGeo, this.whiteMat, arrows, false);
    // Lamps: three per head, placed on the arm-end head (recoloured every frame).
    if (this.heads.length) {
      const lamps = new InstancedMesh(this.lampGeo, this.lampMat, this.heads.length * 3);
      lamps.instanceMatrix.setUsage(DynamicDrawUsage);
      let i = 0;
      for (const p of poles) {
        for (let k = 0; k < 3; k++) {
          const local = new Matrix4().makeTranslation(-(p.arm - 0.3), 5.55 - k * 0.4, 0.17);
          lamps.setMatrixAt(i, p.m.clone().multiply(local));
          lamps.setColorAt(i, LAMP_OFF);
          i++;
        }
      }
      lamps.computeBoundingSphere();
      this.lamps = lamps;
      this.group.add(lamps);
    }
  }

  /** Rebuilds after network edits and recolours the signal lamps. */
  update(): void {
    if (this.dirty) {
      this.dirty = false;
      this.rebuild();
    }
    const lamps = this.lamps;
    if (!lamps) return;
    this.heads.forEach((h, i) => {
      const st = this.signals.state(h.node, h.edge);
      const on = st === 'red' ? 0 : st === 'amber' ? 1 : st === 'green' ? 2 : -1;
      for (let k = 0; k < 3; k++) lamps.setColorAt(i * 3 + k, k === on ? LAMP_ON[k] : LAMP_OFF);
    });
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    for (const m of this.meshes) m.dispose();
    this.lamps?.dispose();
    this.poleMat.dispose();
    this.whiteMat.dispose();
    this.redMat.dispose();
    this.lampMat.dispose();
    this.arrowGeo.dispose();
    this.lampGeo.dispose();
  }
}
