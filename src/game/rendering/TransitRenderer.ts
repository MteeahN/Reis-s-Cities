import { BufferAttribute, BufferGeometry, Color, Group, InstancedMesh, Line, LineBasicMaterial, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import type { BuildingPart } from '../data/buildings';
import { getRoadType } from '../data/roads';
import { partsGeometry } from '../entities/building/BuildingModels';
import type { RoadGraph } from '../entities/road/RoadGraph';
import type { Transit } from '../simulation/Transit';
import { patchInk } from './ink';
import { sampleProfile, type RoadRenderer, type SurfacePoint } from './roads/RoadRenderer';

/** Bus speed along its route (m/s of game time at ×1). */
const BUS_SPEED = 9;
/** Seconds a bus waits at each stop. */
export const BUS_DWELL = 8;
const SAMPLE = 3;

const BUS: BuildingPart[] = [
  { shape: 'box', size: [2.5, 2.7, 11], pos: [0, 0.45, 0], color: '#ffffff' },
  { shape: 'box', size: [2.56, 0.95, 9.4], pos: [0, 1.55, -0.3], color: '#3a3f46' },
  { shape: 'box', size: [2.3, 1.1, 0.06], pos: [0, 1.4, 5.5], color: '#3a3f46' },
  { shape: 'box', size: [1.6, 0.35, 2.2], pos: [0, 3.15, -1], color: '#d8d8d8' },
  ...[-3.6, 3.4].flatMap((z) => [-1.15, 1.15].map((x): BuildingPart => ({ shape: 'cylinder', size: [0.95, 0.35, 0.95], pos: [x, 0.47, z], color: '#222222', rot: [0, 0, 90], segments: 10 }))),
];

const SHELTER: BuildingPart[] = [
  { shape: 'box', size: [3.2, 0.12, 1.5], pos: [0, 2.5, 0], color: '#2f6db5' },
  { shape: 'box', size: [3.0, 2.3, 0.06], pos: [0, 0.2, -0.65], color: '#bcd3e0' },
  { shape: 'box', size: [0.08, 2.5, 1.4], pos: [-1.5, 0, 0], color: '#5a6470' },
  { shape: 'box', size: [0.08, 2.5, 1.4], pos: [1.5, 0, 0], color: '#5a6470' },
  { shape: 'box', size: [2.2, 0.08, 0.4], pos: [0, 0.48, -0.4], color: '#9c6b43' },
  { shape: 'cylinder', size: [0.08, 3.2, 0.08], pos: [1.9, 0, 0.5], color: '#5a6470', segments: 5 },
  { shape: 'box', size: [0.5, 0.5, 0.06], pos: [1.9, 2.8, 0.5], color: '#e0a321' },
];

/** A rider waiting at a stop. */
const PERSON: BuildingPart[] = [
  { shape: 'box', size: [0.5, 1.05, 0.32], pos: [0, 0.75, 0], color: '#ffffff' },
  { shape: 'box', size: [0.42, 0.75, 0.26], pos: [0, 0, 0], color: '#3a3f46' },
];
/** Heads drawn apart so clothes colours don't tint the skin. */
const HEAD: BuildingPart[] = [{ shape: 'cylinder', size: [0.34, 0.38, 0.34], pos: [0, 1.8, 0], color: '#d9a982', segments: 8 }];
const WHITE = new Color(1, 1, 1);
const CLOTHES = ['#e5484d', '#2f7dd1', '#2fa36b', '#e0a321', '#8a4fc2', '#e8e6e0', '#3a3f46', '#c2549b', '#1f8f8f'];
/** Riders a day per figure drawn waiting at a stop, and the most figures per stop. */
const RIDERS_PER_FIGURE = 40;
const MAX_FIGURES = 8;

interface StopSpot {
  id: number;
  x: number;
  y: number;
  z: number;
  /** Shelter yaw (back to the buildings). */
  yaw: number;
}

interface LinePath {
  color: Color;
  xs: Float32Array;
  ys: Float32Array;
  zs: Float32Array;
  cum: Float32Array;
  length: number;
  buses: number;
  /** Where along the path the stops are (m, ascending, the first is 0). */
  stops: number[];
}

/**
 * Bus stops (shelters beside the road) and buses running their lines: each
 * line's buses are spaced evenly along its loop and keep to the right lane.
 * While the transit tool is open, every line's route is drawn in its colour.
 * Only the buses the depots house run. Figures wait at each stop, one per
 * RIDERS_PER_FIGURE riders boarding there a day (at most MAX_FIGURES).
 */
export class TransitRenderer {
  readonly group = new Group();
  private readonly material: MeshStandardMaterial;
  private readonly busGeo: BufferGeometry;
  private readonly shelterGeo: BufferGeometry;
  private readonly personGeo: BufferGeometry;
  private readonly headGeo: BufferGeometry;
  private heads: InstancedMesh;
  private buses: InstancedMesh;
  private shelters: InstancedMesh;
  private people: InstancedMesh;
  private spots: StopSpot[] = [];
  private peopleAt = -1;
  private readonly routeGroup = new Group();
  private paths: LinePath[] = [];
  private seen = '';
  private time = 0;
  private readonly pt: SurfacePoint = { x: 0, y: 0, z: 0, tx: 1, tz: 0 };

  constructor(
    private readonly transit: Transit,
    private readonly roads: RoadGraph,
    private readonly roadRenderer: RoadRenderer,
  ) {
    this.group.name = 'transit';
    this.material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.2 });
    patchInk(this.material, { fade: [250, 900], width: 1 });
    this.busGeo = partsGeometry(BUS);
    this.shelterGeo = partsGeometry(SHELTER);
    this.personGeo = partsGeometry(PERSON);
    this.headGeo = partsGeometry(HEAD);
    this.buses = this.mesh(this.busGeo, 16);
    this.shelters = this.mesh(this.shelterGeo, 16);
    this.people = this.mesh(this.personGeo, 32);
    this.heads = this.mesh(this.headGeo, 32);
    this.routeGroup.visible = false;
    this.group.add(this.routeGroup);
  }

  private mesh(geo: BufferGeometry, n: number): InstancedMesh {
    const m = new InstancedMesh(geo, this.material, n);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = true;
    m.setColorAt(0, new Color(1, 1, 1));
    this.group.add(m);
    return m;
  }

  private grow(which: 'buses' | 'shelters' | 'people' | 'heads', n: number): InstancedMesh {
    const cur = this[which];
    if (cur.instanceMatrix.count >= n) return cur;
    this.group.remove(cur);
    cur.dispose();
    const geo = which === 'buses' ? this.busGeo : which === 'shelters' ? this.shelterGeo : which === 'people' ? this.personGeo : this.headGeo;
    this[which] = this.mesh(geo, Math.max(n, cur.instanceMatrix.count * 2));
    return this[which];
  }

  /** Shows the line routes (transit tool open). */
  setRoutesVisible(on: boolean): void {
    this.routeGroup.visible = on;
  }

  private rebuild(): void {
    const t = this.transit;
    // Shelters beside the road, facing it.
    const sm = this.grow('shelters', t.stops.size);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    const p = new Vector3();
    let n = 0;
    this.spots = [];
    this.peopleAt = -1;
    for (const s of t.stops.values()) {
      const at = t.attach(s);
      if (!at) continue;
      const prof = this.roadRenderer.edgeProfile(at.edge.id);
      if (!prof) continue;
      const type = getRoadType(at.edge.typeId);
      sampleProfile(prof, at.t * prof.length, this.pt);
      const off = type.width / 2 - Math.max(0.8, type.sidewalk / 2);
      const nx = -this.pt.tz;
      const nz = this.pt.tx;
      // Back to the buildings, front to the road.
      const yaw = Math.atan2(-nx, -nz);
      q.setFromAxisAngle(up, yaw);
      sm.setMatrixAt(n++, m.compose(p.set(this.pt.x + nx * off, this.pt.y + 0.16, this.pt.z + nz * off), q, one));
      this.spots.push({ id: s.id, x: this.pt.x + nx * off, y: this.pt.y + 0.16, z: this.pt.z + nz * off, yaw });
    }
    sm.count = n;
    sm.instanceMatrix.needsUpdate = true;
    // Line paths: samples along the right-hand lane.
    for (const c of [...this.routeGroup.children]) {
      this.routeGroup.remove(c);
      (c as Line).geometry.dispose();
    }
    this.paths = [];
    for (const line of t.lines.values()) {
      const r = t.route(line);
      if (!r.ok || r.length <= 0) continue;
      const xs: number[] = [];
      const ys: number[] = [];
      const zs: number[] = [];
      const cum: number[] = [];
      let acc = 0;
      for (const leg of r.legs) {
        const prof = this.roadRenderer.edgeProfile(leg.edge);
        const e = this.roads.edges.get(leg.edge);
        if (!prof || !e) continue;
        const type = getRoadType(e.typeId);
        const lane = Math.max(1.6, type.width / 2 - type.sidewalk - (type.parking ?? 0) - 1.6);
        const len = Math.abs(leg.d1 - leg.d0);
        const dir = Math.sign(leg.d1 - leg.d0) || 1;
        const steps = Math.max(1, Math.ceil(len / SAMPLE));
        for (let k = 0; k <= steps; k++) {
          if (k === 0 && xs.length) continue;
          const d = leg.d0 + ((leg.d1 - leg.d0) * k) / steps;
          sampleProfile(prof, (d / e.length) * prof.length, this.pt);
          // Right of the direction of travel.
          const tx = this.pt.tx * dir;
          const tz = this.pt.tz * dir;
          const x = this.pt.x - tz * lane;
          const z = this.pt.z + tx * lane;
          if (xs.length) acc += Math.hypot(x - xs[xs.length - 1], z - zs[zs.length - 1]);
          xs.push(x);
          ys.push(this.pt.y + 0.2);
          zs.push(z);
          cum.push(acc);
        }
      }
      if (xs.length < 2) continue;
      // Stops sit at the same share of the drawn path as of the route.
      const stops = r.stopsAt.map((d) => (d / r.length) * acc);
      const path: LinePath = { color: new Color(line.color), xs: Float32Array.from(xs), ys: Float32Array.from(ys), zs: Float32Array.from(zs), cum: Float32Array.from(cum), length: acc, buses: line.buses, stops };
      path.buses = t.running(line);
      this.paths.push(path);
      const pos = new Float32Array(xs.length * 3);
      xs.forEach((x, k) => pos.set([x, ys[k] + 1.2, zs[k]], k * 3));
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(pos, 3));
      const l = new Line(g, new LineBasicMaterial({ color: path.color, depthTest: false, transparent: true, opacity: 0.95 }));
      l.renderOrder = 9;
      this.routeGroup.add(l);
    }
  }

  update(dt: number, simSpeed: number): void {
    const key = `${this.transit.version}:${this.roads.version}`;
    if (key !== this.seen) {
      this.seen = key;
      this.rebuild();
    }
    this.time += dt * simSpeed;
    this.placePeople();
    const total = this.paths.reduce((s, p) => s + p.buses, 0);
    const bm = this.grow('buses', total);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    const pos = new Vector3();
    let n = 0;
    for (const p of this.paths) {
      const cycle = p.length / BUS_SPEED + p.stops.length * BUS_DWELL;
      for (let k = 0; k < p.buses; k++) {
        const s = busPosition(p.stops, p.length, (this.time + (k * cycle) / p.buses) % cycle);
        let lo = 0;
        let hi = p.cum.length - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (p.cum[mid] <= s) lo = mid;
          else hi = mid;
        }
        const f = (s - p.cum[lo]) / Math.max(1e-6, p.cum[hi] - p.cum[lo]);
        const x = p.xs[lo] + (p.xs[hi] - p.xs[lo]) * f;
        const z = p.zs[lo] + (p.zs[hi] - p.zs[lo]) * f;
        const y = p.ys[lo] + (p.ys[hi] - p.ys[lo]) * f;
        q.setFromAxisAngle(up, Math.atan2(p.xs[hi] - p.xs[lo], p.zs[hi] - p.zs[lo]));
        bm.setMatrixAt(n, m.compose(pos.set(x, y, z), q, one));
        bm.setColorAt(n, p.color);
        n++;
      }
    }
    bm.count = n;
    bm.instanceMatrix.needsUpdate = true;
    if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
  }

  /** Waiting figures at the stops, refreshed about once a second. */
  private placePeople(): void {
    const now = Math.floor(performance.now() / 1000);
    if (now === this.peopleAt) return;
    this.peopleAt = now;
    const riders = this.transit.stopRiders;
    let total = 0;
    const counts = this.spots.map((s) => {
      const r = riders.get(s.id) ?? 0;
      const c = r > 0 ? Math.min(MAX_FIGURES, Math.ceil(r / RIDERS_PER_FIGURE)) : 0;
      total += c;
      return c;
    });
    const pm = this.grow('people', total);
    const hm = this.grow('heads', total);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    const pos = new Vector3();
    const col = new Color();
    let n = 0;
    this.spots.forEach((s, si) => {
      const c = Math.cos(s.yaw);
      const sn = Math.sin(s.yaw);
      for (let k = 0; k < counts[si]; k++) {
        // On the pavement in front of the shelter, facing the road; a fixed scatter per stop.
        const h = Math.sin((s.id * 13 + k * 7) * 12.9898) * 43758.5453;
        const f = h - Math.floor(h);
        const lx = -1.6 + (k % 4) * 1.05 + (f - 0.5) * 0.35;
        const lz = 0.95 + Math.floor(k / 4) * 0.55 + f * 0.15;
        q.setFromAxisAngle(up, s.yaw + (f - 0.5) * 0.8);
        pos.set(s.x + lx * c + lz * sn, s.y, s.z - lx * sn + lz * c);
        pm.setMatrixAt(n, m.compose(pos, q, one));
        hm.setMatrixAt(n, m);
        hm.setColorAt(n, WHITE);
        pm.setColorAt(n, col.set(CLOTHES[(s.id + k * 5) % CLOTHES.length]));
        n++;
      }
    });
    pm.count = n;
    pm.instanceMatrix.needsUpdate = true;
    hm.count = n;
    hm.instanceMatrix.needsUpdate = true;
    if (hm.instanceColor) hm.instanceColor.needsUpdate = true;
    if (pm.instanceColor) pm.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.personGeo.dispose();
    this.headGeo.dispose();
    this.busGeo.dispose();
    this.shelterGeo.dispose();
    this.material.dispose();
    for (const c of this.routeGroup.children) (c as Line).geometry.dispose();
  }
}

/**
 * Where along its loop a bus is `t` seconds into its cycle: it waits
 * BUS_DWELL at each stop, then drives at BUS_SPEED to the next one.
 */
export function busPosition(stops: number[], length: number, t: number): number {
  let rest = t;
  for (let i = 0; i < stops.length; i++) {
    if (rest < BUS_DWELL) return stops[i];
    rest -= BUS_DWELL;
    const next = i + 1 < stops.length ? stops[i + 1] : length;
    const drive = (next - stops[i]) / BUS_SPEED;
    if (rest < drive) return stops[i] + rest * BUS_SPEED;
    rest -= drive;
  }
  return 0;
}
