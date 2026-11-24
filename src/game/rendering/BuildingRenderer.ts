import { BoxGeometry, Color, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type BufferGeometry, type Material } from 'three';
import { CELL_SIZE } from '../core/config';
import { getBuilding, type BuildingDef, type BuildingPart } from '../data/buildings';
import { buildingGeometry, buildingMaterials, variantCount } from '../entities/building/BuildingModels';
import type { BuildingChange, BuildingRegistry, PlacedBuilding } from '../entities/building/BuildingRegistry';

/** InstancedMesh with dynamic add/remove (swap-remove keeps the buffer dense). */
class InstancePool {
  mesh: InstancedMesh;
  private readonly indexOf = new Map<number, number>();
  private readonly idAt: number[] = [];

  /** Per-instance share of lit windows at night (facade pools only). */
  private lit: InstancedBufferAttribute | null = null;

  constructor(
    private readonly geo: BufferGeometry,
    private readonly mat: Material,
    private readonly parent: Group,
    capacity = 8,
    withLit = false,
  ) {
    if (withLit) {
      this.lit = new InstancedBufferAttribute(new Float32Array(capacity), 1);
      geo.setAttribute('aLit', this.lit);
    }
    this.mesh = this.create(capacity);
  }

  private create(capacity: number): InstancedMesh {
    const m = new InstancedMesh(this.geo, this.mat, capacity);
    m.count = 0;
    m.visible = false;
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.setColorAt(0, new Color(1, 1, 1)); // allocate the colour buffer
    this.parent.add(m);
    return m;
  }

  add(id: number, matrix: Matrix4, color: Color): void {
    if (this.idAt.length >= this.mesh.instanceMatrix.count) {
      const bigger = this.create(this.mesh.instanceMatrix.count * 2);
      const tmp = new Matrix4();
      const c = new Color();
      for (let i = 0; i < this.idAt.length; i++) {
        this.mesh.getMatrixAt(i, tmp);
        bigger.setMatrixAt(i, tmp);
        this.mesh.getColorAt(i, c);
        bigger.setColorAt(i, c);
      }
      bigger.visible = this.mesh.visible || this.idAt.length > 0;
      this.parent.remove(this.mesh);
      this.mesh.dispose();
      this.mesh = bigger;
      if (this.lit) {
        const grown = new InstancedBufferAttribute(new Float32Array(this.mesh.instanceMatrix.count), 1);
        grown.array.set(this.lit.array as Float32Array);
        this.lit = grown;
        this.geo.setAttribute('aLit', grown);
      }
    }
    const idx = this.idAt.length;
    this.idAt.push(id);
    this.indexOf.set(id, idx);
    this.mesh.setMatrixAt(idx, matrix);
    this.mesh.setColorAt(idx, color);
    if (this.lit) this.lit.setX(idx, 0);
    this.sync();
  }

  remove(id: number): void {
    const idx = this.indexOf.get(id);
    if (idx === undefined) return;
    const last = this.idAt.length - 1;
    if (idx !== last) {
      const tmp = new Matrix4();
      const c = new Color();
      this.mesh.getMatrixAt(last, tmp);
      this.mesh.setMatrixAt(idx, tmp);
      this.mesh.getColorAt(last, c);
      this.mesh.setColorAt(idx, c);
      if (this.lit) this.lit.setX(idx, this.lit.getX(last));
      const movedId = this.idAt[last];
      this.idAt[idx] = movedId;
      this.indexOf.set(movedId, idx);
    }
    this.idAt.pop();
    this.indexOf.delete(id);
    this.sync();
  }

  setColor(id: number, color: Color): void {
    const idx = this.indexOf.get(id);
    if (idx === undefined) return;
    this.mesh.setColorAt(idx, color);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  setLit(id: number, v: number): void {
    const idx = this.indexOf.get(id);
    if (idx === undefined || !this.lit) return;
    if (this.lit.getX(idx) !== v) {
      this.lit.setX(idx, v);
      this.lit.needsUpdate = true;
    }
  }

  /** Detail pools are hidden by the LOD even when they hold instances. */
  hidden = false;

  private sync(): void {
    this.mesh.count = this.idAt.length;
    this.mesh.visible = this.idAt.length > 0 && !this.hidden;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (this.lit) this.lit.needsUpdate = true;
  }

  setHidden(h: boolean): void {
    if (this.hidden === h) return;
    this.hidden = h;
    this.mesh.visible = this.idAt.length > 0 && !h;
  }
}

/** Gentle colour variations multiplied over template colours. */
const TINTS = [0xffffff, 0xfff1e0, 0xe8f0ff, 0xfff8d6, 0xf6e6e6, 0xe9f5e4].map((h) => new Color(h));
const WHITE = new Color(0xffffff);
const ABANDONED = new Color(0x77736c);
const BURNING = new Color(0xff6a2a);

/** Unit construction site (one 8×8 m cell); scaled to the lot per instance. */
const SITE_PARTS: BuildingPart[] = [
  { shape: 'box', size: [7.6, 0.25, 7.6], pos: [0, 0, 0], color: '#8a6f52' },
  { shape: 'box', size: [5.2, 2.2, 5.2], pos: [0, 0.25, -0.6], color: '#a8a39a' },
  { shape: 'cylinder', size: [0.18, 6, 0.18], pos: [-3, 0.25, -3.4], color: '#d9a531', segments: 5 },
  { shape: 'cylinder', size: [0.18, 6, 0.18], pos: [3, 0.25, -3.4], color: '#d9a531', segments: 5 },
  { shape: 'cylinder', size: [0.18, 6, 0.18], pos: [-3, 0.25, 2.2], color: '#d9a531', segments: 5 },
  { shape: 'cylinder', size: [0.18, 6, 0.18], pos: [3, 0.25, 2.2], color: '#d9a531', segments: 5 },
  { shape: 'box', size: [6.2, 0.15, 0.15], pos: [0, 3.2, 2.2], color: '#d9a531' },
  { shape: 'box', size: [6.2, 0.15, 0.15], pos: [0, 5.6, 2.2], color: '#d9a531' },
  { shape: 'box', size: [1.4, 0.9, 1], pos: [2.4, 0.25, 3], color: '#c2c0ba' },
];
const SITE_DEF = { id: '__construction_site', model: SITE_PARTS } as unknown as BuildingDef;

interface PoolSet {
  all: InstancePool[];
  facade: InstancePool | null;
  detail: InstancePool | null;
}

/**
 * Renders all buildings: instance pools per template look (variant) and part
 * group — plain, facade (window atlas, lit at night) and detail (LOD) — plus
 * foundations and construction sites.
 */
export class BuildingRenderer {
  readonly group = new Group();
  /** Pools per "defId#variant". */
  private readonly pools = new Map<string, PoolSet>();
  private readonly mats: { plain: MeshStandardMaterial; facade: MeshStandardMaterial };
  private readonly detailPools: InstancePool[] = [];
  private detailVisible = true;
  private litFn: ((b: PlacedBuilding) => number) | null = null;
  private readonly foundation: InstancePool;
  private readonly site: InstancePool;
  private readonly foundationGeo = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private readonly foundationMat = new MeshStandardMaterial({ color: 0x9c968a, roughness: 0.95 });
  private readonly unsub: () => void;
  private readonly tmpColor = new Color();
  private override: ((b: PlacedBuilding) => Color) | null = null;

  constructor(private readonly registry: BuildingRegistry) {
    this.group.name = 'buildings';
    const mats = buildingMaterials();
    this.mats = mats;
    this.site = new InstancePool(buildingGeometry(SITE_DEF, 0, false).plain!, mats.plain, this.group, 16);
    this.foundation = new InstancePool(this.foundationGeo, this.foundationMat, this.group, 32);
    // Render what already exists, then follow changes.
    this.handle({ added: [...registry.items.values()], removed: [] });
    this.unsub = registry.onChange((c) => this.handle(c));
  }

  static modelMatrix(b: PlacedBuilding, out = new Matrix4(), scale = new Vector3(1, 1, 1)): Matrix4 {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (b.rot * Math.PI) / 2);
    const seat = b.seat;
    if (seat && (seat.gx !== 0 || seat.gz !== 0)) {
      // Tilt so the lot lies on the slope: local up becomes the ground normal.
      const n = new Vector3(-seat.gx, 1, -seat.gz).normalize();
      q.premultiply(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), n));
    }
    return out.compose(new Vector3((b.i + b.w / 2) * CELL_SIZE + (b.ox ?? 0), seat ? seat.y : b.baseY, (b.j + b.d / 2) * CELL_SIZE + (b.oz ?? 0)), q, scale);
  }

  /** Which look (colour/roof variant) a building uses — stable per building. */
  static variantOf(b: PlacedBuilding): number {
    const n = variantCount(getBuilding(b.defId));
    return n > 1 ? Math.floor(b.tint * 7919) % n : 0;
  }

  /** Instance pools for a building's look (template × variant × style), created on first use. */
  private poolsOf(b: PlacedBuilding): PoolSet | undefined {
    const def = getBuilding(b.defId);
    const style = def.spec ? (b.style ?? 'modern') : 'modern';
    const v = BuildingRenderer.variantOf(b);
    const key = `${def.id}#${v}#${style}`;
    let set = this.pools.get(key);
    if (set) return set;
    const g = buildingGeometry(def, v, true, style);
    const mats = this.mats;
    set = { all: [], facade: null, detail: null };
    if (g.plain) set.all.push(new InstancePool(g.plain, mats.plain, this.group));
    if (g.facade) set.all.push((set.facade = new InstancePool(g.facade, mats.facade, this.group, 8, true)));
    if (g.detail) {
      set.all.push((set.detail = new InstancePool(g.detail, mats.plain, this.group)));
      set.detail.setHidden(!this.detailVisible);
      this.detailPools.push(set.detail);
    }
    this.pools.set(key, set);
    return set;
  }

  private colorFor(b: PlacedBuilding): Color {
    if (b.state === 'burning') return BURNING;
    if (this.override) return this.override(b);
    if (b.state === 'abandoned') return ABANDONED;
    if (!b.zone) return WHITE;
    return this.tmpColor.copy(TINTS[Math.floor(b.tint * 101) % TINTS.length]);
  }

  private handle(c: BuildingChange): void {
    for (const b of c.removed) {
      for (const pool of this.poolsOf(b)?.all ?? []) pool.remove(b.id);
      this.site.remove(b.id);
      this.foundation.remove(b.id);
    }
    for (const b of c.added) {
      const def = getBuilding(b.defId);
      if (b.state === 'construction') {
        const m = BuildingRenderer.modelMatrix(b, new Matrix4(), new Vector3(def.footprint[0], 1, def.footprint[1]));
        this.site.add(b.id, m, WHITE);
      } else {
        const m = BuildingRenderer.modelMatrix(b);
        const color = this.colorFor(b);
        const set = this.poolsOf(b);
        for (const pool of set?.all ?? []) pool.add(b.id, m, color);
        if (this.litFn) set?.facade?.setLit(b.id, this.litFn(b));
      }
      // Foundation plinth from the lowest ground corner up to the base (none when the building
      // tilts with the slope or is set into it down to its lowest corner).
      const base = b.seat ? b.seat.y : b.baseY;
      const tilted = !!b.seat && (b.seat.gx !== 0 || b.seat.gz !== 0);
      if (!tilted && base - b.minY > 0.05) {
        const depth = base - b.minY + 0.6;
        const f = new Matrix4().compose(
          new Vector3((b.i + b.w / 2) * CELL_SIZE + (b.ox ?? 0), base - depth + 0.05, (b.j + b.d / 2) * CELL_SIZE + (b.oz ?? 0)),
          new Quaternion(),
          new Vector3(b.w * CELL_SIZE - 0.4, depth, b.d * CELL_SIZE - 0.4),
        );
        this.foundation.add(b.id, f, WHITE);
      }
    }
  }

  /** Tints every building with `fn` (info layers); null restores normal colours. */
  setColorOverride(fn: ((b: PlacedBuilding) => Color) | null): void {
    this.override = fn;
    for (const b of this.registry.items.values()) {
      if (b.state === 'construction') continue;
      const c = this.colorFor(b);
      for (const pool of this.poolsOf(b)?.all ?? []) pool.setColor(b.id, c);
    }
  }

  /** Share (0–1) of each building's windows lit after dark; re-evaluated on every call. */
  setLighting(fn: (b: PlacedBuilding) => number): void {
    this.litFn = fn;
    for (const b of this.registry.items.values()) {
      if (b.state === 'construction') continue;
      this.poolsOf(b)?.facade?.setLit(b.id, fn(b));
    }
  }

  /** LOD: small parts (doors, chimneys, rooftop units, bushes) only near the camera. */
  setDetailVisible(v: boolean): void {
    if (v === this.detailVisible) return;
    this.detailVisible = v;
    for (const p of this.detailPools) p.setHidden(!v);
  }

  dispose(): void {
    this.unsub();
    this.foundationGeo.dispose();
    this.foundationMat.dispose();
  }
}
