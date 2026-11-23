import { type BufferGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, type MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { CAR_COLORS, CAR_MIX, TRUCK_COLORS, carModels, pickWeighted, truckModels, vehicleMaterial } from './VehicleModels';
import { getRoadType } from '../data/roads';
import type { RoadGraph } from '../entities/road/RoadGraph';
import type { TrafficModel, VehiclePath } from '../simulation/traffic/TrafficModel';
import { mulberry32 } from '../world/generation/rng';
import { sampleProfile, type RoadRenderer, type SurfacePoint } from './roads/RoadRenderer';
import type { TrafficSignals } from '../simulation/traffic/Signals';

/** Vehicles shown per vehicle actually on the road (Little's law) near the camera — game time runs
 *  hundreds of times faster than the cars drive, so the visible stream is thickened accordingly. */
export const VISUAL_DENSITY = 12;
const CAR_GAP = 7.5;
const TRUCK_GAP = 11;

interface Vehicle {
  path: VehiclePath;
  idx: number;
  /** Metres travelled along the current link (in travel direction). */
  s: number;
  lane: number;
  speed: number;
  truck: boolean;
  color: number;
  /** Index into the car or truck model list. */
  model: number;
  /** Lane on the previous link (for the curve through a junction). */
  prevLane: number;
  /** Seconds halted at a stop sign. */
  stopWait: number;
  /** Junction this vehicle may now enter (stop sign served). */
  cleared: number;
}

interface LanePoint {
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
}

/**
 * Real 3D vehicles near the camera. Each one drives an actual routed path
 * from the traffic model (so its turns at junctions are the assignment's),
 * at the link's congested speed, keeping a gap to the vehicle ahead in its
 * lane. Their number follows the vehicles actually on the visible roads.
 */
export class VehicleRenderer {
  readonly group = new Group();
  private readonly cars: InstancedMesh[];
  private readonly trucks: InstancedMesh[];
  private readonly material: MeshStandardMaterial;
  private readonly vehicles: Vehicle[] = [];
  private readonly rand = mulberry32(0x7a11c);
  private version = -1;
  private target = 0;
  private targetTimer = 0;
  private max = 400;
  private readonly pt: SurfacePoint = { x: 0, y: 0, z: 0, tx: 1, tz: 0 };
  private readonly p0: LanePoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1 };
  private readonly p2: LanePoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1 };
  private readonly lp: LanePoint = { x: 0, y: 0, z: 0, dx: 0, dz: 1 };
  /** Pedestrians on a crosswalk (set by the game): vehicles yield to them. */
  crosswalkBusy: (nodeId: number, edgeId: number) => boolean = () => false;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);
  private readonly color = new Color();
  private readonly visibleEdges = new Set<number>();
  private cx = 0;
  private cz = 0;
  private radius = 0;

  constructor(
    private readonly traffic: TrafficModel,
    private readonly roads: RoadGraph,
    private readonly roadRenderer: RoadRenderer,
    private readonly signals: TrafficSignals,
    capacity = 600,
  ) {
    this.group.name = 'vehicles';
    this.material = vehicleMaterial();
    const make = (geo: BufferGeometry, n: number) => {
      const im = new InstancedMesh(geo, this.material, n);
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      im.castShadow = true;
      im.setColorAt(0, new Color(1, 1, 1));
      this.group.add(im);
      return im;
    };
    this.cars = carModels().map((g) => make(g, capacity));
    this.trucks = truckModels().map((g) => make(g, Math.ceil(capacity / 2)));
    this.max = capacity;
  }

  /** Cap on simultaneous vehicles (graphics quality). */
  setMax(n: number): void {
    this.max = Math.min(n, this.cars[0].instanceMatrix.count);
    if (this.vehicles.length > this.max) this.vehicles.length = this.max;
  }

  get count(): number {
    return this.vehicles.length;
  }

  /**
   * @param dt real seconds
   * @param simSpeed 0 when paused, otherwise the game speed (vehicles move with game time)
   */
  update(dt: number, simSpeed: number, camX: number, camZ: number, camDistance: number): void {
    const t = this.traffic;
    if (t.version !== this.version) {
      this.version = t.version;
      this.vehicles.length = 0;
    }
    // Close enough to see individual vehicles?
    this.radius = Math.min(900, Math.max(260, camDistance * 1.3));
    this.cx = camX;
    this.cz = camZ;
    if (camDistance > 1600) {
      this.vehicles.length = 0;
      for (const im of [...this.cars, ...this.trucks]) im.count = 0;
      return;
    }
    this.targetTimer -= dt;
    if (this.targetTimer <= 0) {
      this.targetTimer = 0.5;
      this.computeTarget();
    }
    if (simSpeed > 0) this.spawn();
    this.move(dt * simSpeed);
    this.draw();
  }

  /** Vehicles on the visible roads right now: Σ flow × travel time over visible links. */
  private computeTarget(): void {
    const t = this.traffic;
    const r = this.radius;
    this.visibleEdges.clear();
    let n = 0;
    for (const e of this.roads.edgesInBox(this.cx - r, this.cz - r, this.cx + r, this.cz + r)) {
      const mid = e.poly.points[Math.floor(e.poly.points.length / 2)];
      if (Math.hypot(mid.x - this.cx, mid.z - this.cz) > r) continue;
      this.visibleEdges.add(e.id);
      const pair = t.linksOf(e.id);
      if (!pair) continue;
      for (const l of pair) if (l >= 0) n += (t.linkFlow[l] * t.linkTime[l]) / 3600;
    }
    this.target = Math.min(this.max, Math.round(n * VISUAL_DENSITY));
  }

  private spawn(): void {
    const t = this.traffic;
    const initialFill = this.vehicles.length < this.target * 0.5;
    for (let attempt = 0; attempt < 24 && this.vehicles.length < this.target; attempt++) {
      const path = t.samplePath(this.rand);
      if (!path) return;
      // Enter where the route first reaches the visible area.
      const idx = path.links.findIndex((l) => this.visibleEdges.has(t.linkEdge[l]));
      if (idx < 0) continue;
      const len = t.linkLen[path.links[idx]];
      const last = idx === path.links.length - 1;
      const from = idx === 0 ? path.startFrac * len : 0;
      const to = last ? path.endFrac * len : len;
      if (to - from < 1) continue;
      const s = initialFill ? from + this.rand() * (to - from) : from;
      const lanesPerDir = this.lanesPerDir(t.linkEdge[path.links[idx]]);
      const truck = path.freight;
      const lane = truck ? 0 : Math.floor(this.rand() * lanesPerDir);
      if (this.blocked(path.links[idx], lane, s, truck ? TRUCK_GAP : CAR_GAP)) continue;
      this.vehicles.push({
        path,
        idx,
        s,
        lane,
        speed: t.linkSpeed(path.links[idx]),
        truck,
        color: truck ? TRUCK_COLORS[Math.floor(this.rand() * TRUCK_COLORS.length)] : CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)],
        model: truck ? Math.floor(this.rand() * this.trucks.length) : pickWeighted(CAR_MIX, this.rand()),
        prevLane: lane,
        stopWait: 0,
        cleared: -1,
      });
    }
  }

  private blocked(link: number, lane: number, s: number, gap: number): boolean {
    for (const v of this.vehicles) {
      if (v.path.links[v.idx] === link && v.lane === lane && Math.abs(v.s - s) < gap) return true;
    }
    return false;
  }

  /** Lanes per travel direction on an edge (a one-way road uses all of them). */
  private lanesPerDir(edgeId: number): number {
    const e = this.roads.edges.get(edgeId);
    if (!e) return 1;
    const type = getRoadType(e.typeId);
    return this.roads.direction(e) !== 0 ? type.lanes : Math.max(1, type.lanes / 2);
  }

  /**
   * Does a vehicle on `link` (at `s`) have to hold at the stop line ahead?
   * Red / amber signals, stop signs (halt, then go) and pedestrians on the
   * crosswalks it is about to cross.
   */
  private holdLine(v: Vehicle, dt: number): number {
    const t = this.traffic;
    if (v.idx >= v.path.links.length - 1) return Infinity;
    const l = v.path.links[v.idx];
    const node = t.linkToNode(l);
    if (v.cleared === node) return Infinity;
    const edge = t.linkEdge[l];
    const nextEdge = t.linkEdge[v.path.links[v.idx + 1]];
    const stopLine = t.linkLen[l] - this.roadRenderer.setbackAt(node, edge) - 1.5;
    if (v.s > stopLine + 0.4) return Infinity; // already in the junction
    const st = this.signals.state(node, edge);
    let hold = false;
    if (st === 'red') hold = true;
    else if (st === 'amber') hold = stopLine - v.s > 8;
    else if (st === 'stop') {
      if (stopLine - v.s < 0.6 && v.speed < 0.4) {
        v.stopWait += dt;
        if (v.stopWait > 1.5) v.cleared = node;
        else hold = true;
      } else hold = true;
    }
    if (!hold && (this.crosswalkBusy(node, edge) || this.crosswalkBusy(node, nextEdge))) hold = true;
    return hold ? stopLine : Infinity;
  }

  private move(dt: number): void {
    if (dt <= 0) return;
    const t = this.traffic;
    // Leaders per link+lane: sort by position so followers keep their gap.
    const byLane = new Map<number, Vehicle[]>();
    for (const v of this.vehicles) {
      const key = v.path.links[v.idx] * 8 + v.lane;
      let list = byLane.get(key);
      if (!list) byLane.set(key, (list = []));
      list.push(v);
    }
    for (const list of byLane.values()) list.sort((a, b) => b.s - a.s);

    const remove = new Set<Vehicle>();
    for (const list of byLane.values()) {
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        const link = v.path.links[v.idx];
        let limit = this.holdLine(v, dt);
        if (i > 0) {
          const lead = list[i - 1];
          limit = Math.min(limit, lead.s - (lead.truck || v.truck ? TRUCK_GAP : CAR_GAP));
        }
        // Brake smoothly towards the limit (≈3 m/s²), accelerate gently towards the link speed.
        let want = t.linkSpeed(link);
        if (Number.isFinite(limit)) want = Math.min(want, Math.sqrt(Math.max(0, 2 * 3 * (limit - v.s))));
        v.speed += (want - v.speed) * Math.min(1, dt * (want < v.speed ? 4 : 1.2));
        if (v.speed < 0.05 && want < 0.05) v.speed = 0;
        v.s = Math.max(v.s, Math.min(v.s + v.speed * dt, limit));
        // Advance through links (the route chooses the turn at each junction).
        for (;;) {
          const l = v.path.links[v.idx];
          const len = t.linkLen[l];
          const last = v.idx === v.path.links.length - 1;
          const end = last ? v.path.endFrac * len : len;
          if (v.s < end) break;
          if (last) {
            remove.add(v);
            break;
          }
          v.s -= len;
          v.idx++;
          v.prevLane = v.lane;
          v.stopWait = 0;
          const lanes = this.lanesPerDir(t.linkEdge[v.path.links[v.idx]]);
          if (v.lane >= lanes) v.lane = lanes - 1;
        }
        // Left the area around the camera.
        if (!remove.has(v) && !this.visibleEdges.has(t.linkEdge[v.path.links[v.idx]])) remove.add(v);
      }
    }
    if (remove.size > 0) {
      let w = 0;
      for (const v of this.vehicles) if (!remove.has(v)) this.vehicles[w++] = v;
      this.vehicles.length = w;
    }
  }

  /** Lane centre and travel direction at `s` metres along a link. */
  private lanePoint(l: number, s: number, lane: number, out: LanePoint): LanePoint | null {
    const t = this.traffic;
    const edgeId = t.linkEdge[l];
    const prof = this.roadRenderer.edgeProfile(edgeId);
    const e = this.roads.edges.get(edgeId);
    if (!prof || !e) return null;
    const type = getRoadType(e.typeId);
    const len = t.linkLen[l];
    const rev = t.linkReverse[l] === 1;
    const f = Math.max(0, Math.min(1, s / len));
    sampleProfile(prof, (rev ? 1 - f : f) * prof.length, this.pt);
    const dx = rev ? -this.pt.tx : this.pt.tx;
    const dz = rev ? -this.pt.tz : this.pt.tz;
    // Drive on the right.
    const oneWay = this.roads.direction(e) !== 0;
    const lanes = type.lanes;
    const laneW = Math.max(2.6, (type.width - 2 * type.sidewalk - type.median) / lanes);
    const offset = oneWay ? (lane + 0.5 - lanes / 2) * laneW : type.median / 2 + (lane + 0.5) * laneW;
    out.x = this.pt.x - dz * offset;
    out.y = this.pt.y;
    out.z = this.pt.z + dx * offset;
    out.dx = dx;
    out.dz = dz;
    return out;
  }

  /**
   * Where a vehicle is drawn: on its lane, or — inside a junction — on a
   * smooth curve from the lane it arrives in to the lane it leaves by.
   */
  private placement(v: Vehicle, out: LanePoint): LanePoint | null {
    const t = this.traffic;
    const links = v.path.links;
    const l = links[v.idx];
    const len = t.linkLen[l];
    let from: { l: number; s: number; lane: number } | null = null;
    let to: { l: number; s: number; lane: number } | null = null;
    let u = 0;
    if (v.idx < links.length - 1) {
      const node = t.linkToNode(l);
      const inLen = this.roadRenderer.setbackAt(node, t.linkEdge[l]);
      if (inLen > 0.5 && v.s > len - inLen) {
        const next = links[v.idx + 1];
        const outLen = this.roadRenderer.setbackAt(node, t.linkEdge[next]);
        from = { l, s: len - inLen, lane: v.lane };
        to = { l: next, s: outLen, lane: Math.min(v.lane, this.lanesPerDir(t.linkEdge[next]) - 1) };
        u = (v.s - (len - inLen)) / (inLen + outLen);
      }
    }
    if (!from && v.idx > 0) {
      const node = t.linkFromNode(l);
      const outLen = this.roadRenderer.setbackAt(node, t.linkEdge[l]);
      if (outLen > 0.5 && v.s < outLen) {
        const prev = links[v.idx - 1];
        const inLen = this.roadRenderer.setbackAt(node, t.linkEdge[prev]);
        from = { l: prev, s: t.linkLen[prev] - inLen, lane: v.prevLane };
        to = { l, s: outLen, lane: v.lane };
        u = (inLen + v.s) / (inLen + outLen);
      }
    }
    if (!from || !to) return this.lanePoint(l, v.s, v.lane, out);
    const a = this.lanePoint(from.l, from.s, from.lane, this.p0);
    const b = this.lanePoint(to.l, to.s, to.lane, this.p2);
    if (!a || !b) return this.lanePoint(l, v.s, v.lane, out);
    // Control point: where the arriving and leaving lane lines meet (straight through: the midpoint).
    let cx = (a.x + b.x) / 2;
    let cz = (a.z + b.z) / 2;
    const den = a.dx * b.dz - a.dz * b.dx;
    if (Math.abs(den) > 1e-3) {
      const k = ((b.x - a.x) * b.dz - (b.z - a.z) * b.dx) / den;
      const gap = Math.hypot(b.x - a.x, b.z - a.z);
      if (k > 0 && k < gap * 1.5) {
        cx = a.x + a.dx * k;
        cz = a.z + a.dz * k;
      }
    }
    const w = Math.max(0, Math.min(1, u));
    const iw = 1 - w;
    out.x = iw * iw * a.x + 2 * iw * w * cx + w * w * b.x;
    out.z = iw * iw * a.z + 2 * iw * w * cz + w * w * b.z;
    out.y = a.y + (b.y - a.y) * w;
    const tx = 2 * iw * (cx - a.x) + 2 * w * (b.x - cx);
    const tz = 2 * iw * (cz - a.z) + 2 * w * (b.z - cz);
    const tl = Math.hypot(tx, tz) || 1;
    out.dx = tx / tl;
    out.dz = tz / tl;
    return out;
  }

  /** Vehicles near a junction on one of its roads (approaching it, or just leaving into that road). */
  approaching(nodeId: number, edgeId: number, within: number): boolean {
    const t = this.traffic;
    for (const v of this.vehicles) {
      const l = v.path.links[v.idx];
      if (t.linkEdge[l] !== edgeId) continue;
      if (t.linkToNode(l) === nodeId && t.linkLen[l] - v.s < within && v.speed > 0.5) return true;
      if (t.linkFromNode(l) === nodeId && v.s < 5) return true;
    }
    return false;
  }

  private draw(): void {
    const nCar = this.cars.map(() => 0);
    const nTruck = this.trucks.map(() => 0);
    for (const v of this.vehicles) {
      const p = this.placement(v, this.lp);
      if (!p) continue;
      this.pos.set(p.x, p.y, p.z);
      this.q.setFromAxisAngle(this.up, Math.atan2(p.dx, p.dz));
      this.m.compose(this.pos, this.q, this.scale);
      this.color.setHex(v.color);
      const list = v.truck ? this.trucks : this.cars;
      const counts = v.truck ? nTruck : nCar;
      const im = list[v.model];
      const i = counts[v.model];
      if (i >= im.instanceMatrix.count) continue;
      im.setMatrixAt(i, this.m);
      im.setColorAt(i, this.color);
      counts[v.model] = i + 1;
    }
    this.cars.forEach((im, k) => (im.count = nCar[k]));
    this.trucks.forEach((im, k) => (im.count = nTruck[k]));
    for (const im of [...this.cars, ...this.trucks]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  dispose(): void {
    for (const im of [...this.cars, ...this.trucks]) im.geometry.dispose();
    this.material.dispose();
  }
}
