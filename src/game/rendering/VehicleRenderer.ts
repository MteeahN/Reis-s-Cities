import { type BufferGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, type MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { CAR_COLORS, CAR_MIX, TRUCK_COLORS, carModels, pickWeighted, truckModels, vehicleMaterial } from './VehicleModels';
import { getRoadType } from '../data/roads';
import type { RoadGraph } from '../entities/road/RoadGraph';
import type { TrafficModel, VehiclePath } from '../simulation/traffic/TrafficModel';
import { mulberry32 } from '../world/generation/rng';
import { sampleProfile, type RoadRenderer, type SurfacePoint } from './roads/RoadRenderer';
import type { TrafficSignals } from '../simulation/traffic/Signals';
import { SPACE_LENGTH, type ParkingModel } from '../simulation/Parking';

/** Vehicles shown per vehicle actually on the road (Little's law) near the camera — game time runs
 *  hundreds of times faster than the cars drive, so the visible stream is thickened accordingly. */
export const VISUAL_DENSITY = 5;
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
  /** Seconds waited for a junction that another vehicle is crossing. */
  junctionWait: number;
  /** Seconds standing still (any reason). */
  stall: number;
  /** Where it is now (kept so it can pull over if the road network is rebuilt). */
  edge: number;
  frac: number;
  reverse: boolean;
  /** Turning into a driveway or lot at the end of the trip: 0 → 1 (then it is inside). */
  enter: number;
  /** Parking into a kerb space, or pulling out of one: a curve between the two poses. */
  manoeuvre: Manoeuvre | null;
}

/** A car steering from one pose to another along a smooth S (cubic Bézier), over `dur` game seconds. */
interface Manoeuvre {
  kind: 'in' | 'out';
  t: number;
  dur: number;
  a: LanePoint;
  b: LanePoint;
  /** The space it is parking into (in). */
  space?: Parked;
  /** Where along its link it carries on driving (out). */
  outS?: number;
}

/** A car standing in a space at the kerb (parking lane, or illegally). */
interface Parked {
  edge: number;
  /** Space index along the edge and side (+1 right of a→b, −1 left). */
  slot: number;
  side: 1 | -1;
  illegal: boolean;
  color: number;
  model: number;
}

/**
 * A vehicle that has not moved for this long (game seconds) pulls over and
 * parks at the kerb. Shown vehicles are a sample of the aggregate flow, so a
 * queue that locks in a loop around a block is broken up this way instead of
 * staying frozen forever.
 */
export const STALL_LIMIT = 30;
/** Seconds (game) a car takes to turn from the lane into a driveway or lot. */
const ENTER_TIME = 2.2;
/** Most parked cars drawn at once. */
const MAX_PARKED = 900;

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
 *
 * No car simply vanishes on the road: at the end of its trip it parks in a
 * free space at the kerb (a parking lane, or — where the parking model says
 * the street is full — illegally), or turns into the destination's driveway
 * or lot. A trip that starts where a car is parked pulls that car out. Cars
 * stuck for long pull over, and when the road network is rebuilt the cars
 * driving at that moment park where they are. The parked cars on a street
 * follow the parking model's count for it (drawn 1:1).
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
  private readonly parked: Parked[] = [];
  /** Occupied kerb spaces per edge ("slot:side"). */
  private readonly taken = new Map<number, Set<string>>();
  private readonly seeded = new Set<number>();
  private cx = 0;
  private cz = 0;
  private radius = 0;

  constructor(
    private readonly traffic: TrafficModel,
    private readonly roads: RoadGraph,
    private readonly roadRenderer: RoadRenderer,
    private readonly signals: TrafficSignals,
    capacity = 600,
    private readonly parking: ParkingModel | null = null,
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
    this.cars = carModels().map((g) => make(g, capacity + MAX_PARKED));
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

  /** Cars parked at the kerb near the camera (drawn). */
  get parkedCount(): number {
    return this.parked.length;
  }

  // ---------------------------------------------------------------- parking

  /** Kerb spaces along an edge: count per side, and whether the road has a parking lane. */
  private spacesOf(edgeId: number): { n: number; lane: boolean } {
    const e = this.roads.edges.get(edgeId);
    if (!e) return { n: 0, lane: false };
    const t = getRoadType(e.typeId);
    if (t.pedestrian || t.category === 'highway') return { n: 0, lane: false };
    return { n: Math.max(0, Math.floor((e.length - 16) / SPACE_LENGTH)), lane: !!t.parking };
  }

  /** A free kerb space on an edge nearest to `s` metres from node a, on `side` (both sides if none). */
  private freeSpace(edgeId: number, s: number, side: 1 | -1 | 0, ahead = 0): { slot: number; side: 1 | -1 } | null {
    const { n } = this.spacesOf(edgeId);
    if (n === 0) return null;
    const taken = this.taken.get(edgeId);
    const k0 = Math.round((s - 8 - SPACE_LENGTH / 2) / SPACE_LENGTH);
    for (let d = 0; d < n; d++) {
      for (const k of d === 0 ? [k0] : [k0 + d, k0 - d]) {
        if (k < 0 || k >= n) continue;
        // Driving on: only spaces level with or ahead of the car (+1 towards node b, −1 towards a).
        if (ahead !== 0 && (8 + (k + 0.5) * SPACE_LENGTH - s) * ahead < 6) continue;
        for (const sd of side === 0 ? ([1, -1] as const) : [side]) if (!taken?.has(`${k}:${sd}`)) return { slot: k, side: sd };
      }
      if (d > 6) break; // within ~40 m
    }
    return null;
  }

  private park(edgeId: number, slot: number, side: 1 | -1, illegal: boolean, color: number, model: number): void {
    if (this.parked.length >= MAX_PARKED) return;
    let set = this.taken.get(edgeId);
    if (!set) this.taken.set(edgeId, (set = new Set()));
    set.add(`${slot}:${side}`);
    this.parked.push({ edge: edgeId, slot, side, illegal, color, model });
  }

  private unpark(index: number): Parked {
    const p = this.parked[index];
    this.taken.get(p.edge)?.delete(`${p.slot}:${p.side}`);
    this.parked[index] = this.parked[this.parked.length - 1];
    this.parked.pop();
    return p;
  }

  /**
   * A trip ending (or a car pulling over) on an edge: steer into a kerb space if the street has room
   * (false: none). With `instant` the car is put in the space at once (the network is being rebuilt).
   */
  private parkAt(v: Vehicle, edgeId: number, s: number, kerbOnly: boolean, instant = false): boolean {
    if (v.truck) return false;
    const { lane } = this.spacesOf(edgeId);
    const model = this.parking?.edges.get(edgeId);
    // Streets with a parking lane take the car there; elsewhere it parks at the kerb only if the
    // street is short of spaces (the parking model sends cars there) or it must pull over.
    const illegal = !lane;
    if (illegal && !kerbOnly && !(model && model.illegal > 0)) return false;
    // Drive on the right: the near kerb is the right side of the direction of travel.
    const side: 1 | -1 = v.reverse ? -1 : 1;
    const space = this.freeSpace(edgeId, s, side, instant ? 0 : side);
    if (!space) return false;
    const rec: Parked = { edge: edgeId, slot: space.slot, side: space.side, illegal, color: v.color, model: v.model };
    if (instant) {
      this.park(edgeId, rec.slot, rec.side, illegal, v.color, v.model);
      return true;
    }
    const a = this.placement(v, { x: 0, y: 0, z: 0, dx: 0, dz: 1 });
    const b = this.parkedPose(rec, { x: 0, y: 0, z: 0, dx: 0, dz: 1 });
    if (!a || !b) return false;
    this.reserve(edgeId, rec.slot, rec.side);
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    v.manoeuvre = { kind: 'in', t: 0, dur: Math.max(2.2, Math.min(6, dist / 2.6)), a: { ...a }, b: { ...b }, space: rec };
    return true;
  }

  private reserve(edgeId: number, slot: number, side: 1 | -1): void {
    let set = this.taken.get(edgeId);
    if (!set) this.taken.set(edgeId, (set = new Set()));
    set.add(`${slot}:${side}`);
  }

  /** Where a manoeuvring car is at u (0–1), without its heading. */
  private manoeuvreAt(m: Manoeuvre, u: number): { x: number; z: number } {
    // In the frame of the start pose: forward f, right r = (−dz, dx).
    const fx = m.a.dx;
    const fz = m.a.dz;
    const dx = m.b.x - m.a.x;
    const dz = m.b.z - m.a.z;
    const along = dx * fx + dz * fz;
    const across = dx * -fz + dz * fx;
    const ease = (x: number) => {
      const c = Math.max(0, Math.min(1, x));
      return c * c * (3 - 2 * c);
    };
    // Parking in: roll on along the lane, then ease sideways into the space (clear of the car behind it).
    // Pulling out: ease sideways out of the space first, then roll on along the lane.
    const w = ease(u);
    const side = m.kind === 'in' ? ease((u - 0.3) / 0.7) : ease(u / 0.7);
    return { x: m.a.x + fx * along * w + -fz * across * side, z: m.a.z + fz * along * w + fx * across * side };
  }

  /** Pose on a manoeuvre at its progress: position and heading (from the path's direction). */
  private manoeuvrePose(m: Manoeuvre, out: LanePoint): LanePoint {
    const u = Math.max(0, Math.min(1, m.t));
    const p = this.manoeuvreAt(m, u);
    const q0 = this.manoeuvreAt(m, Math.max(0, u - 0.02));
    const q1 = this.manoeuvreAt(m, Math.min(1, u + 0.02));
    out.x = p.x;
    out.z = p.z;
    out.y = m.a.y + (m.b.y - m.a.y) * u;
    let tx = q1.x - q0.x;
    let tz = q1.z - q0.z;
    const tl = Math.hypot(tx, tz);
    // Standing still at the ends: keep the start / end heading.
    if (tl < 1e-4) (tx = u < 0.5 ? m.a.dx : m.b.dx), (tz = u < 0.5 ? m.a.dz : m.b.dz);
    else (tx /= tl), (tz /= tl);
    // Settle into the space's own heading at the very end (and out of it at the start).
    const settle = m.kind === 'in' ? Math.max(0, (u - 0.85) / 0.15) : Math.max(0, 1 - u / 0.15);
    const hx = m.kind === 'in' ? m.b.dx : m.a.dx;
    const hz = m.kind === 'in' ? m.b.dz : m.a.dz;
    tx += (hx - tx) * settle;
    tz += (hz - tz) * settle;
    const hl = Math.hypot(tx, tz) || 1;
    out.dx = tx / hl;
    out.dz = tz / hl;
    return out;
  }

  /** Streets coming into view get the parked cars the parking model has on them; streets leaving it drop theirs. */
  private syncParked(): void {
    for (let i = this.parked.length - 1; i >= 0; i--) if (!this.visibleEdges.has(this.parked[i].edge)) this.unpark(i);
    for (const id of [...this.seeded]) if (!this.visibleEdges.has(id)) this.seeded.delete(id);
    if (!this.parking) return;
    for (const id of this.visibleEdges) {
      if (this.seeded.has(id)) continue;
      this.seeded.add(id);
      const p = this.parking.edges.get(id);
      if (!p) continue;
      const { n, lane } = this.spacesOf(id);
      if (n === 0) continue;
      const inLane = lane ? Math.min(2 * n, Math.round(Math.min(p.parked, p.laneSpaces))) : 0;
      const illegal = lane ? 0 : Math.min(2 * n, Math.round(p.illegal));
      for (let k = 0; k < inLane + illegal; k++) {
        const space = this.freeSpace(id, 8 + this.rand() * n * SPACE_LENGTH, 0);
        if (!space) break;
        this.park(id, space.slot, space.side, !lane, CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)], pickWeighted(CAR_MIX, this.rand()));
      }
    }
  }

  /** A parked car near `s` on an edge (for a trip starting there), as its index. */
  private parkedNear(edgeId: number, s: number, side: 1 | -1): number {
    let best = -1;
    let bd = 30;
    for (let i = 0; i < this.parked.length; i++) {
      const p = this.parked[i];
      // Only from the kerb of the way it will drive (it pulls straight out into its lane).
      if (p.edge !== edgeId || p.side !== side) continue;
      const d = Math.abs(8 + (p.slot + 0.5) * SPACE_LENGTH - s);
      if (d < bd) (bd = d), (best = i);
    }
    return best;
  }

  /** Where a parked car stands. */
  private parkedPose(p: Parked, out: LanePoint): LanePoint | null {
    const prof = this.roadRenderer.edgeProfile(p.edge);
    const e = this.roads.edges.get(p.edge);
    if (!prof || !e) return null;
    const t = getRoadType(e.typeId);
    const s = 8 + (p.slot + 0.5) * SPACE_LENGTH;
    sampleProfile(prof, (s / e.length) * prof.length, this.pt);
    const kerb = t.width / 2 - t.sidewalk;
    // In a parking lane; or, illegally, half up on the pavement (clear of the traffic lane).
    const off = (t.parking ? kerb - t.parking / 2 : kerb + 0.55) * p.side;
    // Right of a→b is (−tz, tx).
    out.x = this.pt.x - this.pt.tz * off;
    out.y = this.pt.y;
    out.z = this.pt.z + this.pt.tx * off;
    // Parked facing the traffic on its side.
    out.dx = this.pt.tx * p.side;
    out.dz = this.pt.tz * p.side;
    return out;
  }

  /**
   * @param dt real seconds
   * @param simSpeed 0 when paused, otherwise the game speed (vehicles move with game time)
   */
  update(dt: number, simSpeed: number, camX: number, camZ: number, camDistance: number): void {
    const t = this.traffic;
    if (t.version !== this.version) {
      this.version = t.version;
      // The road network was rebuilt: cars driving now pull over where they are.
      for (const v of this.vehicles) {
        const e = this.roads.edges.get(v.edge);
        if (!e || v.enter > 0) continue;
        if (v.manoeuvre?.kind === 'in' && v.manoeuvre.space) {
          const sp = v.manoeuvre.space;
          this.park(sp.edge, sp.slot, sp.side, sp.illegal, sp.color, sp.model);
          continue;
        }
        const s = (v.reverse ? 1 - v.frac : v.frac) * e.length;
        this.parkAt(v, v.edge, s, true, true);
      }
      this.vehicles.length = 0;
      this.taken.clear();
      for (const p of this.parked) this.reserve(p.edge, p.slot, p.side);
    }
    // Close enough to see individual vehicles?
    this.radius = Math.min(900, Math.max(260, camDistance * 1.3));
    this.cx = camX;
    this.cz = camZ;
    if (camDistance > 1600) {
      this.vehicles.length = 0;
      for (let i = this.parked.length - 1; i >= 0; i--) this.unpark(i);
      this.seeded.clear();
      for (const im of [...this.cars, ...this.trucks]) im.count = 0;
      return;
    }
    this.targetTimer -= dt;
    if (this.targetTimer <= 0) {
      this.targetTimer = 0.5;
      this.computeTarget();
      this.syncParked();
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
      let s = initialFill ? from + this.rand() * (to - from) : from;
      const lanesPerDir = this.lanesPerDir(t.linkEdge[path.links[idx]]);
      const truck = path.freight;
      const lane = truck ? 0 : Math.floor(this.rand() * lanesPerDir);
      const link = path.links[idx];
      const edgeId = t.linkEdge[link];
      const reverse = t.linkReverse[link] === 1;
      // A trip that starts here takes a car parked near its start (it pulls out of the space).
      let pullOut: LanePoint | null = null;
      let color = truck ? TRUCK_COLORS[Math.floor(this.rand() * TRUCK_COLORS.length)] : CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)];
      let model = truck ? Math.floor(this.rand() * this.trucks.length) : pickWeighted(CAR_MIX, this.rand());
      if (!truck && idx === 0 && !initialFill) {
        const e = this.roads.edges.get(edgeId);
        const fromA = reverse && e ? e.length - s : s;
        const k = this.parkedNear(edgeId, fromA, reverse ? -1 : 1);
        if (k >= 0) {
          const pose = this.parkedPose(this.parked[k], { x: 0, y: 0, z: 0, dx: 0, dz: 1 });
          const p = this.unpark(k);
          color = p.color;
          model = p.model;
          const at = 8 + (p.slot + 0.5) * SPACE_LENGTH;
          s = Math.max(from, Math.min(to - 1, reverse && e ? e.length - at : at));
          pullOut = pose;
        }
      }
      if (this.blocked(link, lane, s, truck ? TRUCK_GAP : CAR_GAP)) continue;
      const len0 = t.linkLen[link];
      this.vehicles.push({
        path,
        idx,
        s,
        lane,
        speed: t.linkSpeed(link),
        truck,
        color,
        model,
        prevLane: lane,
        stopWait: 0,
        cleared: -1,
        junctionWait: 0,
        stall: 0,
        edge: edgeId,
        frac: len0 > 0 ? s / len0 : 0,
        reverse,
        enter: 0,
        manoeuvre: null,
      });
      if (pullOut) {
        const v = this.vehicles[this.vehicles.length - 1];
        const outS = Math.min(to - 0.5, s + 7);
        const b = this.lanePoint(link, outS, lane, { x: 0, y: 0, z: 0, dx: 0, dz: 1 });
        if (b) v.manoeuvre = { kind: 'out', t: 0, dur: 2.6, a: { ...pullOut }, b: { ...b }, outS };
      }
    }
  }

  private blocked(link: number, lane: number, s: number, gap: number): boolean {
    for (const v of this.vehicles) {
      if (v.path.links[v.idx] === link && v.lane === lane && Math.abs(v.s - s) < gap) return true;
    }
    return false;
  }

  /** Junction → incoming edge of the vehicle crossing it right now (rebuilt every step). */
  private readonly inJunction = new Map<number, number>();

  /** Marks junctions that vehicles are inside: past their stop line, or still in the mouth of the next road. */
  private markJunctions(): void {
    const t = this.traffic;
    this.inJunction.clear();
    for (const v of this.vehicles) {
      const l = v.path.links[v.idx];
      if (v.idx < v.path.links.length - 1) {
        const node = t.linkToNode(l);
        const edge = t.linkEdge[l];
        if (v.s > t.linkLen[l] - this.roadRenderer.setbackAt(node, edge) - 1.1) this.inJunction.set(node, edge);
      }
      if (v.idx > 0) {
        const node = t.linkFromNode(l);
        if (v.s < this.roadRenderer.setbackAt(node, t.linkEdge[l]) + 1) this.inJunction.set(node, t.linkEdge[v.path.links[v.idx - 1]]);
      }
    }
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
    // Junctions without lights: one stream at a time — wait while a vehicle from another road is crossing.
    // (Lights already separate the streams. A long wait lets it go anyway, so a stalled crossing can never lock it.)
    if (!hold && st !== 'green' && st !== 'amber' && v.s > stopLine - 6) {
      const crossing = this.inJunction.get(node);
      if (crossing !== undefined && crossing !== edge && v.junctionWait < 6) {
        v.junctionWait += dt;
        hold = true;
      }
    }
    if (!hold) v.junctionWait = 0;
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
    this.markJunctions();

    const remove = new Set<Vehicle>();
    for (const list of byLane.values()) {
      for (let i = 0; i < list.length; i++) {
        const v = list[i];
        const link = v.path.links[v.idx];
        if (v.manoeuvre) {
          const m = v.manoeuvre;
          m.t += dt / m.dur;
          v.speed = 0;
          if (m.t >= 1) {
            if (m.kind === 'in' && m.space) {
              // In the space: it stands there now.
              this.parked.push(m.space);
              remove.add(v);
            } else {
              v.s = m.outS ?? v.s;
              v.manoeuvre = null;
            }
          }
          continue;
        }
        if (v.enter > 0) {
          // Turning into the driveway / lot: once inside, it is parked there.
          v.enter += dt / ENTER_TIME;
          v.speed = 0;
          if (v.enter >= 1) remove.add(v);
          continue;
        }
        let limit = this.holdLine(v, dt);
        if (i > 0) {
          const lead = list[i - 1];
          limit = Math.min(limit, lead.s - (lead.truck || v.truck ? TRUCK_GAP : CAR_GAP));
        } else if (v.idx < v.path.links.length - 1) {
          // First in its lane: keep the gap to the last vehicle on the road it turns into.
          const next = v.path.links[v.idx + 1];
          const nextLane = Math.min(v.lane, this.lanesPerDir(t.linkEdge[next]) - 1);
          const ahead = byLane.get(next * 8 + nextLane);
          const tail = ahead?.[ahead.length - 1];
          if (tail) limit = Math.min(limit, t.linkLen[link] + tail.s - (tail.truck || v.truck ? TRUCK_GAP : CAR_GAP));
        }
        // Brake smoothly towards the limit (≈3 m/s²), accelerate gently towards the link speed.
        let want = t.linkSpeed(link);
        if (Number.isFinite(limit)) want = Math.min(want, Math.sqrt(Math.max(0, 2 * 3 * (limit - v.s))));
        v.speed += (want - v.speed) * Math.min(1, dt * (want < v.speed ? 4 : 1.2));
        if (v.speed < 0.05 && want < 0.05) v.speed = 0;
        v.stall = v.speed < 0.3 ? v.stall + dt : 0;
        if (v.stall > STALL_LIMIT) {
          // Pulls over at the kerb (or leaves the queue into a side lot if the kerb is full).
          const e = this.roads.edges.get(t.linkEdge[link]);
          const fromA = e ? (t.linkReverse[link] === 1 ? e.length - v.s : v.s) : 0;
          if (!this.parkAt(v, t.linkEdge[link], fromA, true)) v.enter = 1e-6;
          continue;
        }
        v.s = Math.max(v.s, Math.min(v.s + v.speed * dt, limit));
        // Advance through links (the route chooses the turn at each junction).
        for (;;) {
          const l = v.path.links[v.idx];
          const len = t.linkLen[l];
          const last = v.idx === v.path.links.length - 1;
          const end = last ? v.path.endFrac * len : len;
          if (v.s < end) break;
          if (last) {
            // Trip over: park at the kerb if the street has a space for it, else turn into the lot / garage.
            const e = this.roads.edges.get(t.linkEdge[l]);
            const fromA = e ? (t.linkReverse[l] === 1 ? e.length - end : end) : 0;
            v.s = end;
            if (!this.parkAt(v, t.linkEdge[l], fromA, false)) v.enter = 1e-6;
            break;
          }
          v.s -= len;
          v.idx++;
          v.prevLane = v.lane;
          v.stopWait = 0;
          const lanes = this.lanesPerDir(t.linkEdge[v.path.links[v.idx]]);
          if (v.lane >= lanes) v.lane = lanes - 1;
        }
        const cur = v.path.links[v.idx];
        v.edge = t.linkEdge[cur];
        v.reverse = t.linkReverse[cur] === 1;
        v.frac = t.linkLen[cur] > 0 ? Math.min(1, v.s / t.linkLen[cur]) : 0;
        // Left the area around the camera.
        if (!remove.has(v) && v.enter === 0 && !v.manoeuvre && !this.visibleEdges.has(t.linkEdge[v.path.links[v.idx]])) remove.add(v);
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
    const laneW = Math.max(2.6, (type.width - 2 * type.sidewalk - type.median - 2 * (type.parking ?? 0)) / lanes);
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
      const p = v.manoeuvre ? this.manoeuvrePose(v.manoeuvre, this.lp) : this.placement(v, this.lp);
      if (!p) continue;
      let ang = Math.atan2(p.dx, p.dz);
      if (v.enter > 0) {
        // Turn right off the lane, across the pavement and into the lot.
        const w = Math.min(1, v.enter);
        const turn = w * (Math.PI / 2);
        const reach = 2 + 5 * w * w;
        // Right of the direction of travel is (−dz, dx).
        p.x += -p.dz * reach + p.dx * 2 * w;
        p.z += p.dx * reach + p.dz * 2 * w;
        ang -= turn;
        this.scale.setScalar(1 - 0.15 * w);
      } else this.scale.setScalar(1);
      this.pos.set(p.x, p.y, p.z);
      this.q.setFromAxisAngle(this.up, ang);
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
    this.scale.setScalar(1);
    for (const pk of this.parked) {
      const p = this.parkedPose(pk, this.lp);
      if (!p) continue;
      this.pos.set(p.x, p.y, p.z);
      this.q.setFromAxisAngle(this.up, Math.atan2(p.dx, p.dz));
      this.m.compose(this.pos, this.q, this.scale);
      this.color.setHex(pk.color);
      const im = this.cars[pk.model];
      const i = nCar[pk.model];
      if (!im || i >= im.instanceMatrix.count) continue;
      im.setMatrixAt(i, this.m);
      im.setColorAt(i, this.color);
      nCar[pk.model] = i + 1;
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
