import {
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { CELL_SIZE, GRID_CELLS } from '../core/config';
import type { UtilityLines } from '../entities/infra/UtilityLines';
import type { P2 } from '../entities/road/curve';

/** Visual radius (exaggerated so pipes read from city-view distances). */
const RADIUS = 1.0;
/** Pipe centre height above the terrain (clears road decks). */
const LIFT = 1.2;
/** Pipes follow the terrain in pieces of at most this length. */
const PIECE = 12;

export const PIPE_COLOR_SUPPLIED = 0x1763c4;
export const PIPE_COLOR_DRY = 0xd0503c;

/**
 * Underground water pipes, drawn as tubes over the terrain while the water or
 * sewage view is open (pipe tool, water buildings, info layer). Each piece is
 * coloured by its network: blue = fed by a water source, red = not connected
 * to any source. Joints and junctions get a valve so connections are visible.
 */
export class PipeRenderer {
  readonly group = new Group();
  private tubes: InstancedMesh | null = null;
  private joints: InstancedMesh | null = null;
  private readonly tubeGeo = new CylinderGeometry(1, 1, 1, 10, 1, true);
  private readonly jointGeo = new SphereGeometry(1, 12, 8);
  private readonly mat = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.35, emissive: 0x0b1a2a });
  private readonly unsub: () => void;
  private supplied: Uint8Array | null = null;

  constructor(
    private readonly lines: UtilityLines,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.group.name = 'pipes';
    this.group.visible = false;
    this.unsub = lines.onChange(() => this.rebuild());
    this.rebuild();
  }

  /** Per-cell 1 = pipe whose network has a water supply (from the utility solver). */
  setSupply(supplied: Uint8Array): void {
    this.supplied = supplied;
    this.rebuild();
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  get visible(): boolean {
    return this.group.visible;
  }

  private colorAt(x: number, z: number): number {
    if (!this.supplied) return PIPE_COLOR_DRY;
    const i = Math.min(GRID_CELLS - 1, Math.max(0, Math.floor(x / CELL_SIZE)));
    const j = Math.min(GRID_CELLS - 1, Math.max(0, Math.floor(z / CELL_SIZE)));
    return this.supplied[j * GRID_CELLS + i] ? PIPE_COLOR_SUPPLIED : PIPE_COLOR_DRY;
  }

  private y(x: number, z: number): number {
    return Math.max(0, this.heightAt(x, z)) + LIFT;
  }

  private rebuild(): void {
    for (const m of [this.tubes, this.joints]) {
      if (!m) continue;
      this.group.remove(m);
      m.dispose();
    }
    this.tubes = this.joints = null;

    const tubes: { a: Vector3; b: Vector3; color: number }[] = [];
    const joints = new Map<string, { p: Vector3; r: number; color: number }>();
    const addJoint = (p: P2, r: number) => {
      const key = `${Math.round(p.x * 2)},${Math.round(p.z * 2)}`;
      const prev = joints.get(key);
      if (!prev || prev.r < r) joints.set(key, { p: new Vector3(p.x, this.y(p.x, p.z), p.z), r, color: this.colorAt(p.x, p.z) });
    };
    for (const l of this.lines.lines.values()) {
      const n = Math.max(1, Math.ceil(l.length / PIECE));
      let prev = new Vector3(l.a.x, this.y(l.a.x, l.a.z), l.a.z);
      for (let s = 1; s <= n; s++) {
        const x = l.a.x + ((l.b.x - l.a.x) * s) / n;
        const z = l.a.z + ((l.b.z - l.a.z) * s) / n;
        const cur = new Vector3(x, this.y(x, z), z);
        tubes.push({ a: prev, b: cur, color: this.colorAt((prev.x + x) / 2, (prev.z + z) / 2) });
        // Small joints hide the seams where the pipe bends with the terrain.
        if (s < n) addJoint({ x, z }, RADIUS * 1.02);
        prev = cur;
      }
      // Segment ends: a valve (bigger) — this is where pipes join.
      addJoint(l.a, RADIUS * 1.7);
      addJoint(l.b, RADIUS * 1.7);
    }

    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const dir = new Vector3();
    const mid = new Vector3();
    const scale = new Vector3();
    const color = new Color();
    if (tubes.length) {
      const mesh = new InstancedMesh(this.tubeGeo, this.mat, tubes.length);
      tubes.forEach((t, i) => {
        dir.subVectors(t.b, t.a);
        const len = dir.length();
        q.setFromUnitVectors(up, dir.normalize());
        mid.addVectors(t.a, t.b).multiplyScalar(0.5);
        mesh.setMatrixAt(i, m.compose(mid, q, scale.set(RADIUS, len, RADIUS)));
        mesh.setColorAt(i, color.setHex(t.color));
      });
      mesh.computeBoundingSphere();
      this.tubes = mesh;
      this.group.add(mesh);
    }
    if (joints.size) {
      const list = [...joints.values()];
      const mesh = new InstancedMesh(this.jointGeo, this.mat, list.length);
      q.identity();
      list.forEach((j, i) => {
        mesh.setMatrixAt(i, m.compose(j.p, q, scale.set(j.r, j.r, j.r)));
        mesh.setColorAt(i, color.setHex(j.color).multiplyScalar(j.r > RADIUS * 1.5 ? 0.75 : 1));
      });
      mesh.computeBoundingSphere();
      this.joints = mesh;
      this.group.add(mesh);
    }
  }

  /** Number of drawn pipe pieces and valves (for tests / diagnostics). */
  get counts(): { tubes: number; joints: number } {
    return { tubes: this.tubes?.count ?? 0, joints: this.joints?.count ?? 0 };
  }

  dispose(): void {
    this.unsub();
    this.tubes?.dispose();
    this.joints?.dispose();
    this.tubeGeo.dispose();
    this.jointGeo.dispose();
    this.mat.dispose();
  }
}
