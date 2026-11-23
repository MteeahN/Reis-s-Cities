import { type BufferGeometry, Color, DynamicDrawUsage, Group, InstancedMesh, Matrix4, type MeshStandardMaterial, Quaternion, Vector3 } from 'three';
import { CAR_COLORS, CAR_MIX, TRUCK_COLORS, carModels, pickWeighted, truckModels, vehicleMaterial } from './VehicleModels';
import { getRoadType } from '../data/roads';
import type { RoadGraph } from '../entities/road/RoadGraph';
import type { TrafficModel, VehiclePath } from '../simulation/traffic/TrafficModel';
import { mulberry32 } from '../world/generation/rng';
import { sampleProfile, type RoadRenderer, type SurfacePoint } from './roads/RoadRenderer';

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
      const type = getRoadType(this.roads.edges.get(t.linkEdge[path.links[idx]])!.typeId);
      const lanesPerDir = type.oneWay ? type.lanes : Math.max(1, type.lanes / 2);
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
      });
    }
  }

  private blocked(link: number, lane: number, s: number, gap: number): boolean {
    for (const v of this.vehicles) {
      if (v.path.links[v.idx] === link && v.lane === lane && Math.abs(v.s - s) < gap) return true;
    }
    return false;
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
        const want = t.linkSpeed(link);
        v.speed += (want - v.speed) * Math.min(1, dt * 1.5);
        let s = v.s + v.speed * dt;
        if (i > 0) {
          const lead = list[i - 1];
          const gap = lead.truck || v.truck ? TRUCK_GAP : CAR_GAP;
          s = Math.min(s, lead.s - gap);
        }
        v.s = Math.max(v.s, s);
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
          const next = v.path.links[v.idx];
          const type = getRoadType(this.roads.edges.get(t.linkEdge[next])?.typeId ?? 'street');
          const lanes = type.oneWay ? type.lanes : Math.max(1, type.lanes / 2);
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

  private draw(): void {
    const t = this.traffic;
    const nCar = this.cars.map(() => 0);
    const nTruck = this.trucks.map(() => 0);
    for (const v of this.vehicles) {
      const l = v.path.links[v.idx];
      const edgeId = t.linkEdge[l];
      const prof = this.roadRenderer.edgeProfile(edgeId);
      const e = this.roads.edges.get(edgeId);
      if (!prof || !e) continue;
      const type = getRoadType(e.typeId);
      const len = t.linkLen[l];
      const rev = t.linkReverse[l] === 1;
      const f = Math.max(0, Math.min(1, v.s / len));
      sampleProfile(prof, (rev ? 1 - f : f) * prof.length, this.pt);
      const dx = rev ? -this.pt.tx : this.pt.tx;
      const dz = rev ? -this.pt.tz : this.pt.tz;
      // Drive on the right.
      const lanes = type.lanes;
      const laneW = Math.max(2.6, (type.width - 2 * type.sidewalk - type.median) / lanes);
      const offset = type.oneWay ? (v.lane + 0.5 - lanes / 2) * laneW : type.median / 2 + (v.lane + 0.5) * laneW;
      this.pos.set(this.pt.x - dz * offset, this.pt.y, this.pt.z + dx * offset);
      this.q.setFromAxisAngle(this.up, Math.atan2(dx, dz));
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
