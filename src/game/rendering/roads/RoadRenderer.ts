import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { CHUNK_SIZE } from '../../core/config';
import { getRoadType, ROAD_TYPES } from '../../data/roads';
import { directedAngle } from '../../entities/road/curve';
import type { RoadChange, RoadGraph } from '../../entities/road/RoadGraph';
import { createRoadMaterial } from './RoadMaterial';
import { buildEdgeMesh, buildJunctionMesh, nodeSurfaceHeight, ROAD_LIFT, roadProfile, type EdgeMeshData, type JunctionEnd, type MeshArrays } from './roadGeometry';
import type { P2 } from '../../entities/road/curve';

/** Road surface along an edge (a → b): points, cumulative length, surface height. */
export interface EdgeProfile {
  points: P2[];
  tangents: P2[];
  cum: number[];
  heights: number[];
  length: number;
}

export interface SurfacePoint {
  x: number;
  y: number;
  z: number;
  /** Unit tangent in the edge's a → b direction. */
  tx: number;
  tz: number;
}

/** Point on a profile at arc length `u` from node a. */
export function sampleProfile(p: EdgeProfile, u: number, out: SurfacePoint): SurfacePoint {
  const cum = p.cum;
  const n = cum.length - 1;
  const d = Math.max(0, Math.min(p.length, u));
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const f = seg > 1e-6 ? (d - cum[lo]) / seg : 0;
  const a = p.points[lo];
  const b = p.points[hi];
  out.x = a.x + (b.x - a.x) * f;
  out.z = a.z + (b.z - a.z) * f;
  out.y = p.heights[lo] + (p.heights[hi] - p.heights[lo]) * f;
  const ta = p.tangents[lo];
  const tb = p.tangents[hi];
  const tx = ta.x + (tb.x - ta.x) * f;
  const tz = ta.z + (tb.z - ta.z) * f;
  const l = Math.hypot(tx, tz) || 1;
  out.tx = tx / l;
  out.tz = tz / l;
  return out;
}

const JUNCTION = '_junction';

interface EdgeRecord {
  chunk: number;
  typeId: string;
  a: number;
  b: number;
  data: EdgeMeshData;
}

interface NodeRecord {
  chunk: number;
  data: MeshArrays | null;
}

const chunkOf = (x: number, z: number) => Math.floor(x / CHUNK_SIZE) * 1000 + Math.floor(z / CHUNK_SIZE);

/**
 * Turns the road graph into batched meshes: one merged geometry per
 * (map chunk × road type) plus junction caps per chunk. Only chunks touched
 * by a change are rebuilt, and rebuilding happens once per frame.
 */
export class RoadRenderer {
  readonly group = new Group();
  private readonly materials = new Map<string, MeshStandardMaterial>();
  private readonly edges = new Map<number, EdgeRecord>();
  private readonly nodes = new Map<number, NodeRecord>();
  private readonly nodeHeights = new Map<number, number>();
  private readonly chunkMeshes = new Map<string, Mesh>();
  private readonly dirty = new Set<number>();
  private readonly profiles = new Map<number, EdgeProfile>();
  private pillars: InstancedMesh | null = null;
  private pillarsDirty = false;
  private readonly pillarGeo = new CylinderGeometry(0.8, 1.05, 1, 10).translate(0, 0.5, 0);
  private readonly pillarMat = new MeshStandardMaterial({ color: 0x9a968c, roughness: 0.85 });
  private readonly unsub: () => void;

  constructor(
    private readonly graph: RoadGraph,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.group.name = 'roads';
    for (const t of ROAD_TYPES) this.materials.set(t.id, createRoadMaterial(t));
    this.materials.set(JUNCTION, createRoadMaterial(null));
    this.unsub = graph.onChange((c) => this.handleChange(c));
  }

  /** Lift per type so wider roads draw over narrower ones where they overlap. */
  private static liftFor(typeId: string): number {
    return ROAD_LIFT + ROAD_TYPES.findIndex((t) => t.id === typeId) * 0.012;
  }

  private nodeRadius(nodeId: number): number {
    const n = this.graph.nodes.get(nodeId);
    let w = 0;
    for (const eid of n?.edges ?? []) w = Math.max(w, getRoadType(this.graph.edges.get(eid)!.typeId).width);
    return w * 0.72;
  }

  private nodeHeight(nodeId: number): number {
    let h = this.nodeHeights.get(nodeId);
    if (h === undefined) {
      const n = this.graph.nodes.get(nodeId)!;
      h = nodeSurfaceHeight(n, this.nodeRadius(nodeId), this.heightAt);
      this.nodeHeights.set(nodeId, h);
    }
    return h;
  }

  /** Does this node need a cap (ends, junctions, bends, type changes)? */
  private needsCap(nodeId: number): boolean {
    const n = this.graph.nodes.get(nodeId)!;
    if (n.edges.length !== 2) return true;
    const e1 = this.graph.edges.get(n.edges[0])!;
    const e2 = this.graph.edges.get(n.edges[1])!;
    if (e1.typeId !== e2.typeId) return true;
    const ang = directedAngle(this.graph.directionFrom(e1, nodeId), this.graph.directionFrom(e2, nodeId));
    return ang < (170 * Math.PI) / 180;
  }

  /**
   * How far each road at a junction stops short of the node so the roads do
   * not overlap; the junction surface fills the space with curved kerbs.
   * Zero at dead ends and on straight continuations of the same road type.
   */
  private setbacks(nodeId: number): Map<number, number> {
    const out = new Map<number, number>();
    const n = this.graph.nodes.get(nodeId);
    if (!n || n.edges.length < 2 || !this.needsCap(nodeId)) return out;
    const ends = n.edges.map((eid) => {
      const e = this.graph.edges.get(eid)!;
      const d = this.graph.directionFrom(e, nodeId);
      const type = getRoadType(e.typeId);
      return { eid, ang: Math.atan2(d.z, d.x), half: type.width / 2, sw: type.sidewalk, len: this.edgeProfile(eid)?.length ?? 0 };
    });
    ends.sort((a, b) => a.ang - b.ang);
    const m = ends.length;
    const minA = (25 * Math.PI) / 180;
    const maxA = (150 * Math.PI) / 180;
    for (let i = 0; i < m; i++) {
      const me = ends[i];
      let need = 0;
      for (const j of [(i + 1) % m, (i - 1 + m) % m]) {
        if (j === i) continue;
        const o = ends[j];
        let gap = Math.abs(o.ang - me.ang);
        if (gap > Math.PI) gap = Math.PI * 2 - gap;
        const a = Math.min(maxA, Math.max(minA, gap));
        need = Math.max(need, (o.half + me.half * Math.cos(a)) / Math.sin(a));
      }
      const corner = Math.max(me.sw, ...ends.map((e) => e.sw)) + 1.5;
      out.set(me.eid, Math.min(Math.max(0, need) + corner, me.len * 0.45));
    }
    return out;
  }

  private setbackAt(nodeId: number, edgeId: number): number {
    return this.setbacks(nodeId).get(edgeId) ?? 0;
  }

  private junctionMesh(nodeId: number): MeshArrays | null {
    const n = this.graph.nodes.get(nodeId);
    if (!n || n.edges.length < 2 || !this.needsCap(nodeId)) return null;
    const backs = this.setbacks(nodeId);
    const ends: JunctionEnd[] = [];
    const sp = { x: 0, y: 0, z: 0, tx: 0, tz: 0 };
    let lift = ROAD_LIFT;
    for (const eid of n.edges) {
      const e = this.graph.edges.get(eid)!;
      const prof = this.edgeProfile(eid);
      if (!prof) continue;
      const type = getRoadType(e.typeId);
      lift = Math.max(lift, RoadRenderer.liftFor(e.typeId));
      const d = backs.get(eid) ?? 0;
      const atA = e.a === nodeId;
      sampleProfile(prof, atA ? d : prof.length - d, sp);
      ends.push({ frame: { x: sp.x, z: sp.z, y: sp.y, tx: atA ? sp.tx : -sp.tx, tz: atA ? sp.tz : -sp.tz }, width: type.width, sidewalk: type.sidewalk });
    }
    return buildJunctionMesh(n, this.nodeHeight(nodeId) + lift + 0.01, ends, this.heightAt);
  }

  private handleChange(change: RoadChange): void {
    const affectedNodes = new Set<number>();
    for (const id of change.removed) {
      this.profiles.delete(id);
      const rec = this.edges.get(id);
      if (!rec) continue;
      this.dirty.add(rec.chunk);
      affectedNodes.add(rec.a);
      affectedNodes.add(rec.b);
      this.edges.delete(id);
      this.pillarsDirty = true;
    }
    for (const id of change.added) {
      const e = this.graph.edges.get(id);
      if (!e) continue;
      affectedNodes.add(e.a);
      affectedNodes.add(e.b);
    }
    const edgesToBuild = new Set<number>(change.added);
    for (const nid of affectedNodes) {
      this.nodeHeights.delete(nid);
      const n = this.graph.nodes.get(nid);
      if (n) for (const eid of n.edges) edgesToBuild.add(eid);
    }
    for (const eid of edgesToBuild) this.profiles.delete(eid);
    // Rebuild nodes
    for (const nid of affectedNodes) {
      const old = this.nodes.get(nid);
      if (old) this.dirty.add(old.chunk);
      const n = this.graph.nodes.get(nid);
      if (!n) {
        this.nodes.delete(nid);
        continue;
      }
      const chunk = chunkOf(n.x, n.z);
      const data = this.junctionMesh(nid);
      this.nodes.set(nid, { chunk, data });
      this.dirty.add(chunk);
    }
    // Rebuild edges
    for (const eid of edgesToBuild) {
      const e = this.graph.edges.get(eid);
      if (!e) continue;
      const old = this.edges.get(eid);
      if (old) this.dirty.add(old.chunk);
      const type = getRoadType(e.typeId);
      const curve = this.graph.curveOf(e);
      const mid = e.poly.points[Math.floor(e.poly.points.length / 2)];
      const chunk = chunkOf(mid.x, mid.z);
      const degA = this.graph.nodes.get(e.a)?.edges.length ?? 0;
      const degB = this.graph.nodes.get(e.b)?.edges.length ?? 0;
      const data = buildEdgeMesh(curve, type.width, this.nodeHeight(e.a), this.nodeHeight(e.b), this.heightAt, RoadRenderer.liftFor(e.typeId), {
        sidewalk: type.sidewalk,
        trimA: this.setbackAt(e.a, eid),
        trimB: this.setbackAt(e.b, eid),
        wallA: degA === 1,
        wallB: degB === 1,
      });
      this.edges.set(eid, { chunk, typeId: e.typeId, a: e.a, b: e.b, data });
      this.dirty.add(chunk);
      this.pillarsDirty = true;
    }
  }

  /** Driving surface along an edge (cached until the edge or its junctions change). */
  edgeProfile(edgeId: number): EdgeProfile | null {
    let p = this.profiles.get(edgeId);
    if (p) return p;
    const e = this.graph.edges.get(edgeId);
    if (!e) return null;
    const type = getRoadType(e.typeId);
    const lift = RoadRenderer.liftFor(e.typeId);
    const prof = roadProfile(this.graph.curveOf(e), type.width, this.nodeHeight(e.a), this.nodeHeight(e.b), this.heightAt, 4);
    p = { points: prof.points, tangents: prof.tangents, cum: prof.cum, heights: prof.heights.map((h) => h + lift), length: prof.cum[prof.cum.length - 1] };
    this.profiles.set(edgeId, p);
    return p;
  }

  /** Road surface height at a node (for previews/markers). */
  surfaceHeightAtNode(nodeId: number): number {
    return this.nodeHeight(nodeId) + ROAD_LIFT;
  }

  /** Apply pending rebuilds (call once per frame). */
  update(): void {
    if (this.dirty.size > 0) {
      for (const chunk of this.dirty) this.rebuildChunk(chunk);
      this.dirty.clear();
    }
    if (this.pillarsDirty) {
      this.rebuildPillars();
      this.pillarsDirty = false;
    }
  }

  private rebuildChunk(chunk: number): void {
    const groups = new Map<string, MeshArrays[]>();
    for (const rec of this.edges.values()) {
      if (rec.chunk !== chunk) continue;
      let list = groups.get(rec.typeId);
      if (!list) groups.set(rec.typeId, (list = []));
      list.push(rec.data);
    }
    for (const rec of this.nodes.values()) {
      if (rec.chunk !== chunk || !rec.data) continue;
      let list = groups.get(JUNCTION);
      if (!list) groups.set(JUNCTION, (list = []));
      list.push(rec.data);
    }
    for (const key of [...ROAD_TYPES.map((t) => t.id), JUNCTION]) {
      const meshKey = `${chunk}:${key}`;
      const existing = this.chunkMeshes.get(meshKey);
      const parts = groups.get(key);
      if (!parts || parts.length === 0) {
        if (existing) {
          this.group.remove(existing);
          existing.geometry.dispose();
          this.chunkMeshes.delete(meshKey);
        }
        continue;
      }
      const geo = mergeArrays(parts);
      if (existing) {
        existing.geometry.dispose();
        existing.geometry = geo;
      } else {
        const mesh = new Mesh(geo, this.materials.get(key)!);
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = key === JUNCTION ? 2 : 1;
        mesh.name = `roads-${meshKey}`;
        this.group.add(mesh);
        this.chunkMeshes.set(meshKey, mesh);
      }
    }
  }

  private rebuildPillars(): void {
    const all = [];
    for (const rec of this.edges.values()) all.push(...rec.data.pillars);
    if (!this.pillars || this.pillars.instanceMatrix.count < all.length) {
      if (this.pillars) {
        this.group.remove(this.pillars);
        this.pillars.dispose();
      }
      this.pillars = new InstancedMesh(this.pillarGeo, this.pillarMat, Math.max(16, all.length * 2));
      this.pillars.castShadow = true;
      this.pillars.receiveShadow = true;
      this.pillars.frustumCulled = false;
      this.group.add(this.pillars);
    }
    const m = new Matrix4();
    const q = new Quaternion();
    const p = new Vector3();
    const s = new Vector3();
    all.forEach((pl, i) => {
      p.set(pl.x, pl.bottom, pl.z);
      s.set(1, Math.max(0.1, pl.top - pl.bottom), 1);
      m.compose(p, q, s);
      this.pillars!.setMatrixAt(i, m);
    });
    this.pillars.count = all.length;
    this.pillars.instanceMatrix.needsUpdate = true;
  }

  stats(): { meshes: number } {
    return { meshes: this.chunkMeshes.size };
  }

  dispose(): void {
    this.unsub();
    for (const m of this.chunkMeshes.values()) m.geometry.dispose();
    this.materials.forEach((m) => m.dispose());
    this.pillarGeo.dispose();
    this.pillarMat.dispose();
    this.pillars?.dispose();
  }
}

function mergeArrays(parts: MeshArrays[]): BufferGeometry {
  let vCount = 0;
  let iCount = 0;
  for (const p of parts) {
    vCount += p.positions.length / 3;
    iCount += p.indices.length;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uv = new Float32Array(vCount * 2);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const p of parts) {
    pos.set(p.positions, vo * 3);
    nor.set(p.normals, vo * 3);
    uv.set(p.uvs, vo * 2);
    for (let k = 0; k < p.indices.length; k++) idx[io + k] = p.indices[k] + vo;
    vo += p.positions.length / 3;
    io += p.indices.length;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('normal', new BufferAttribute(nor, 3));
  geo.setAttribute('roadUv', new BufferAttribute(uv, 2));
  geo.setIndex(new BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}
