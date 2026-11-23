import {
  Box3,
  BufferGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { broadleafHigh, broadleafLow, pineHigh, pineLow, poplarHigh, poplarLow, rock } from '../entities/TreeModels';
import { patchSway } from '../rendering/foliage';
import { Species, VEG_STRIDE, type VegetationSet } from './generation/generateWorld';

interface VegCell {
  bounds: Box3;
  high: InstancedMesh[];
  low: InstancedMesh[];
}

interface Models {
  pineHigh: BufferGeometry;
  pineLow: BufferGeometry;
  broadHigh: BufferGeometry;
  broadLow: BufferGeometry;
  poplarHigh: BufferGeometry;
  poplarLow: BufferGeometry;
  rock: BufferGeometry;
}

const ZERO_MATRIX = new Matrix4().makeScale(0, 0, 0);

const PINE_TINTS: [Color, Color] = [new Color(0xd8ffd8), new Color(0x9fc49a)];
const BROAD_TINTS: [Color, Color] = [new Color(0xfff6c8), new Color(0xa9d08c)];
const POPLAR_TINTS: [Color, Color] = [new Color(0xf4ffd0), new Color(0xbcd890)];
const ROCK_TINTS: [Color, Color] = [new Color(0xffffff), new Color(0xb9b2a4)];

/**
 * Instanced vegetation split into spatial cells. Each cell owns a high and a
 * low LOD InstancedMesh per model; only one LOD is visible at a time and each
 * cell is frustum-culled via its instance bounding sphere. Draw calls stay
 * bounded regardless of tree count.
 */
export class Vegetation {
  readonly group = new Group();
  private readonly cells: VegCell[] = [];
  private readonly material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  private readonly models: Models;
  lodDistance = 700;
  private readonly tmpV = new Vector3();
  /** Removable objects: xz positions, spatial hash, and [mesh, index, mesh, index…] per object. */
  private readonly positions: number[] = [];
  private readonly hash = new Map<number, number[]>();
  private readonly refs: (InstancedMesh | number)[][] = [];
  private readonly removed = new Set<number>();

  constructor() {
    this.group.name = 'vegetation';
    patchSway(this.material);
    this.models = {
      pineHigh: pineHigh(),
      pineLow: pineLow(),
      broadHigh: broadleafHigh(),
      broadLow: broadleafLow(),
      poplarHigh: poplarHigh(),
      poplarLow: poplarLow(),
      rock: rock(),
    };
  }

  /** Adds a vegetation set binned into square cells of `cellSize` metres. */
  addSet(set: VegetationSet, cellSize: number, withHighLod: boolean, removable = false): void {
    this.objectCount += set.count;
    const bins = new Map<string, number[]>();
    const d = set.data;
    const base = this.positions.length / 2;
    for (let k = 0; k < set.count; k++) {
      const x = d[k * VEG_STRIDE];
      const z = d[k * VEG_STRIDE + 2];
      if (removable) {
        this.positions.push(x, z);
        const hk = Vegetation.hashKey(x, z);
        let list = this.hash.get(hk);
        if (!list) this.hash.set(hk, (list = []));
        list.push(base + k);
      }
      const key = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
      let arr = bins.get(key);
      if (!arr) bins.set(key, (arr = []));
      arr.push(k);
    }

    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const p = new Vector3();
    const s = new Vector3();
    const c = new Color();

    for (const indices of bins.values()) {
      const bySpecies: number[][] = [[], [], []];
      for (const k of indices) bySpecies[set.species[k]].push(k);
      const cell: VegCell = { bounds: new Box3(), high: [], low: [] };

      const make = (geo: BufferGeometry, list: number[], tints: [Color, Color], highLod: boolean, rockScale = false) => {
        if (list.length === 0) return null;
        const mesh = new InstancedMesh(geo, this.material, list.length);
        list.forEach((k, idx) => {
          if (removable) {
            const gk = base + k;
            (this.refs[gk] ??= []).push(mesh, idx);
          }
          const o = k * VEG_STRIDE;
          const sc = d[o + 3];
          p.set(d[o], d[o + 1], d[o + 2]);
          q.setFromAxisAngle(up, d[o + 4]);
          if (rockScale) s.set(sc, sc * (0.6 + d[o + 5] * 0.6), sc);
          else s.set(sc, sc * (0.9 + d[o + 5] * 0.25), sc);
          m.compose(p, q, s);
          mesh.setMatrixAt(idx, m);
          c.copy(tints[0]).lerp(tints[1], d[o + 5]);
          mesh.setColorAt(idx, c);
          cell.bounds.expandByPoint(p);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = highLod;
        mesh.receiveShadow = highLod;
        mesh.matrixAutoUpdate = false;
        this.group.add(mesh);
        return mesh;
      };

      const pines = bySpecies[Species.Pine];
      // A share of broadleaf trees are slender poplars (chosen by the stored variation value).
      const allBroad = bySpecies[Species.Broadleaf];
      const broads = allBroad.filter((k) => d[k * VEG_STRIDE + 5] >= 0.28);
      const poplars = allBroad.filter((k) => d[k * VEG_STRIDE + 5] < 0.28);
      const rocks = bySpecies[Species.Rock];
      if (withHighLod) {
        const h1 = make(this.models.pineHigh, pines, PINE_TINTS, true);
        const h2 = make(this.models.broadHigh, broads, BROAD_TINTS, true);
        const h3 = make(this.models.poplarHigh, poplars, POPLAR_TINTS, true);
        if (h1) cell.high.push(h1);
        if (h2) cell.high.push(h2);
        if (h3) cell.high.push(h3);
      }
      const l1 = make(this.models.pineLow, pines, PINE_TINTS, false);
      const l2 = make(this.models.broadLow, broads, BROAD_TINTS, false);
      const l3 = make(this.models.poplarLow, poplars, POPLAR_TINTS, false);
      if (l1) cell.low.push(l1);
      if (l2) cell.low.push(l2);
      if (l3) cell.low.push(l3);
      // Rocks are cheap: a single LOD that is visible at all distances.
      make(this.models.rock, rocks, ROCK_TINTS, true, true);

      cell.bounds.expandByScalar(12);
      this.cells.push(cell);
    }
  }

  // ---------------------------------------------------------------- clearing

  private static readonly HASH = 16;
  private static hashKey(x: number, z: number): number {
    return Math.floor(x / Vegetation.HASH) * 100000 + Math.floor(z / Vegetation.HASH);
  }

  /**
   * Hides every removable object inside the box for which `test(x, z)` holds
   * (e.g. under a new road or building). Returns how many were removed.
   */
  clearWhere(minX: number, minZ: number, maxX: number, maxZ: number, test: (x: number, z: number) => boolean): number {
    let removed = 0;
    const H = Vegetation.HASH;
    const dirty = new Set<InstancedMesh>();
    for (let hx = Math.floor(minX / H); hx <= Math.floor(maxX / H); hx++) {
      for (let hz = Math.floor(minZ / H); hz <= Math.floor(maxZ / H); hz++) {
        const list = this.hash.get(hx * 100000 + hz);
        if (!list) continue;
        for (const gk of list) {
          if (this.removed.has(gk)) continue;
          const x = this.positions[gk * 2];
          const z = this.positions[gk * 2 + 1];
          if (x < minX || x > maxX || z < minZ || z > maxZ || !test(x, z)) continue;
          const refs = this.refs[gk] ?? [];
          for (let r = 0; r < refs.length; r += 2) {
            const mesh = refs[r] as InstancedMesh;
            mesh.setMatrixAt(refs[r + 1] as number, ZERO_MATRIX);
            dirty.add(mesh);
          }
          this.removed.add(gk);
          removed++;
        }
      }
    }
    dirty.forEach((m) => (m.instanceMatrix.needsUpdate = true));
    this.objectCount -= removed;
    return removed;
  }

  /** Trees/rocks still standing within `r` metres of (x, z) — used by the ambience. */
  countNear(x: number, z: number, r: number): number {
    const H = Vegetation.HASH;
    let n = 0;
    for (let hx = Math.floor((x - r) / H); hx <= Math.floor((x + r) / H); hx++) {
      for (let hz = Math.floor((z - r) / H); hz <= Math.floor((z + r) / H); hz++) {
        const list = this.hash.get(hx * 100000 + hz);
        if (!list) continue;
        for (const gk of list) {
          if (this.removed.has(gk)) continue;
          const dx = this.positions[gk * 2] - x;
          const dz = this.positions[gk * 2 + 1] - z;
          if (dx * dx + dz * dz <= r * r) n++;
        }
      }
    }
    return n;
  }

  /** Ids of cleared objects (for the save system). */
  get clearedIds(): number[] {
    return [...this.removed];
  }

  /** Switches LOD per cell by distance from the camera to the cell bounds. */
  update(cameraPos: Vector3): void {
    for (const cell of this.cells) {
      if (cell.high.length === 0) continue;
      cell.bounds.clampPoint(cameraPos, this.tmpV);
      const near = this.tmpV.distanceTo(cameraPos) < this.lodDistance;
      for (const mesh of cell.high) mesh.visible = near;
      for (const mesh of cell.low) mesh.visible = !near;
    }
  }

  setShadows(enabled: boolean): void {
    for (const cell of this.cells) for (const mesh of cell.high) mesh.castShadow = enabled;
  }

  /** Number of trees/rocks placed (independent of LOD copies). */
  objectCount = 0;

  dispose(): void {
    for (const g of Object.values(this.models)) g.dispose();
    this.material.dispose();
    this.group.children.forEach((o) => (o as InstancedMesh).dispose?.());
  }
}
