import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getRoadType, type RoadTypeDef } from '../data/roads';
import type { RoadGraph } from '../entities/road/RoadGraph';
import { broadleafHigh } from '../entities/TreeModels';
import { patchSway } from './foliage';
import { nightUniform } from './nightUniform';
import { sampleProfile, type RoadRenderer, type SurfacePoint } from './roads/RoadRenderer';

/** Keep lamps and trees out of junction areas. */
const END_CLEARANCE = 8;
const LAMP_HEIGHT = 7.2;
const POOL_SIZE = 24;

export interface LampSpot {
  x: number;
  y: number;
  z: number;
  /** Unit vector from the lamp towards the road centre. */
  ix: number;
  iz: number;
}

export interface TreeSpot {
  x: number;
  y: number;
  z: number;
  rot: number;
  scale: number;
}

/** Lamp spacing (m) and sides by road type: small streets get one side, wider roads both (staggered). */
export function lampLayout(type: RoadTypeDef): { spacing: number; offsets: number[] } {
  const half = type.width / 2;
  const kerb = type.sidewalk > 0 ? half - type.sidewalk * 0.45 : half - 0.6;
  if (type.oneWay) return { spacing: 40, offsets: [kerb] };
  if (type.width <= 8) return { spacing: 30, offsets: [kerb] };
  if (type.median >= 2) return { spacing: 34, offsets: [0] }; // double-armed lamps on the median
  return { spacing: 32, offsets: [kerb, -kerb] };
}

/**
 * Street lights along every road and trees on boulevard medians and wide
 * sidewalks. Lamp heads glow after dark and throw an additive light pool on
 * the road. Rebuilt when the road network changes; drawn with a few
 * InstancedMeshes in total.
 */
export class StreetFurniture {
  readonly group = new Group();
  private readonly lampGeo: BufferGeometry;
  private readonly lampMat: MeshStandardMaterial;
  private readonly poolMat: MeshBasicMaterial;
  private readonly treeGeo: BufferGeometry;
  private readonly treeMat: MeshStandardMaterial;
  private lamps: InstancedMesh;
  private pools: InstancedMesh;
  private trees: InstancedMesh;
  private dirty = true;
  private readonly unsub: () => void;
  private readonly pt: SurfacePoint = { x: 0, y: 0, z: 0, tx: 1, tz: 0 };
  lampSpots: LampSpot[] = [];
  treeSpots: TreeSpot[] = [];
  private postsVisible = true;

  constructor(
    private readonly roads: RoadGraph,
    private readonly roadRenderer: RoadRenderer,
    private readonly groundAt: (x: number, z: number) => number,
  ) {
    this.group.name = 'street-furniture';
    this.lampGeo = StreetFurniture.lampGeometry();
    this.lampMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 });
    this.lampMat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = nightUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying float vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vGlow;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.8, 0.52) * vGlow * uNight * 5.0;');
    };
    this.lampMat.customProgramCacheKey = () => 'reis-lamp-v1';
    this.poolMat = new MeshBasicMaterial({
      color: new Color(0xffc488),
      map: StreetFurniture.poolTexture(),
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
      polygonOffsetUnits: -6,
    });
    this.treeGeo = broadleafHigh();
    this.treeMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
    patchSway(this.treeMat);
    this.lamps = this.mesh(this.lampGeo, this.lampMat, 64, true);
    this.pools = this.mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.poolMat, 64, false);
    this.pools.renderOrder = 3;
    this.trees = this.mesh(this.treeGeo, this.treeMat, 32, true);
    this.unsub = roads.onChange(() => (this.dirty = true));
  }

  private mesh(geo: BufferGeometry, mat: MeshStandardMaterial | MeshBasicMaterial, capacity: number, shadow: boolean): InstancedMesh {
    const m = new InstancedMesh(geo, mat, capacity);
    m.count = 0;
    m.frustumCulled = false;
    m.castShadow = shadow;
    m.receiveShadow = shadow;
    this.group.add(m);
    return m;
  }

  private static lampGeometry(): BufferGeometry {
    const parts: [BufferGeometry, number, number][] = [
      [new CylinderGeometry(0.09, 0.13, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0), 0.32, 0],
      [new CylinderGeometry(0.22, 0.26, 0.5, 6).translate(0, 0.25, 0), 0.28, 0],
      [new BoxGeometry(1.7, 0.1, 0.12).translate(0.8, LAMP_HEIGHT - 0.1, 0), 0.32, 0],
      [new BoxGeometry(0.7, 0.16, 0.34).translate(1.55, LAMP_HEIGHT - 0.22, 0), 0.25, 0],
      [new BoxGeometry(0.6, 0.05, 0.28).translate(1.55, LAMP_HEIGHT - 0.32, 0), 0.95, 1],
    ];
    const geos = parts.map(([g, shade, glow]) => {
      const ng = g.toNonIndexed();
      ng.deleteAttribute('uv');
      const n = ng.getAttribute('position').count;
      ng.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(shade), 3));
      ng.setAttribute('aGlow', new BufferAttribute(new Float32Array(n).fill(glow), 1));
      return ng;
    });
    return mergeGeometries(geos)!;
  }

  private static poolTexture(): CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new CanvasTexture(c);
  }

  /** Lamp and tree positions for the current network (pure placement, no rendering). */
  layout(): { lamps: LampSpot[]; trees: TreeSpot[] } {
    const lamps: LampSpot[] = [];
    const trees: TreeSpot[] = [];
    const pt = this.pt;
    for (const e of this.roads.edges.values()) {
      const prof = this.roadRenderer.edgeProfile(e.id);
      if (!prof || prof.length < END_CLEARANCE * 2 + 4) continue;
      const type = getRoadType(e.typeId);
      const { spacing, offsets } = lampLayout(type);
      const edgeLamps = lamps.length;
      const usable = prof.length - END_CLEARANCE * 2;
      const n = Math.max(1, Math.floor(usable / spacing) + 1);
      const step = n > 1 ? usable / (n - 1) : 0;
      for (let k = 0; k < n; k++) {
        const u = END_CLEARANCE + (n > 1 ? k * step : usable / 2);
        sampleProfile(prof, u, pt);
        // Normal to the right of a → b.
        const nx = -pt.tz;
        const nz = pt.tx;
        offsets.forEach((off, side) => {
          if (offsets.length > 1 && (k + side) % 2 === 1) return; // stagger both sides
          if (off === 0) {
            // Median: one post, arms both ways.
            lamps.push({ x: pt.x, y: pt.y, z: pt.z, ix: nx, iz: nz }, { x: pt.x, y: pt.y, z: pt.z, ix: -nx, iz: -nz });
            return;
          }
          const x = pt.x + nx * off;
          const z = pt.z + nz * off;
          const s = Math.sign(off);
          lamps.push({ x, y: pt.y, z, ix: -nx * s, iz: -nz * s });
        });
      }
      // Trees: boulevard medians and wide sidewalks, never on bridges.
      const treeOffsets = type.median >= 2 ? [0] : type.sidewalk >= 2.5 && type.width >= 16 ? [type.width / 2 - type.sidewalk / 2, -(type.width / 2 - type.sidewalk / 2)] : [];
      if (treeOffsets.length === 0) continue;
      const tn = Math.floor(usable / 15);
      for (let k = 0; k < tn; k++) {
        const u = END_CLEARANCE + 7.5 + k * 15;
        if (u > prof.length - END_CLEARANCE) break;
        sampleProfile(prof, u, pt);
        if (pt.y - this.groundAt(pt.x, pt.z) > 1.2) continue; // bridge
        for (const off of treeOffsets) {
          const x = pt.x - pt.tz * off;
          const z = pt.z + pt.tx * off;
          let clash = false;
          for (let i = edgeLamps; i < lamps.length && !clash; i++) clash = Math.hypot(lamps[i].x - x, lamps[i].z - z) < 4.5;
          if (clash) continue;
          const h = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
          trees.push({ x, y: pt.y, z, rot: Math.abs(h) * Math.PI * 2, scale: 0.5 + Math.abs(h) * 0.15 });
        }
      }
    }
    return { lamps, trees };
  }

  private ensure(which: 'lamps' | 'pools' | 'trees', n: number): InstancedMesh {
    const cur = this[which];
    if (cur.instanceMatrix.count >= n) return cur;
    const bigger = this.mesh(cur.geometry, cur.material as MeshStandardMaterial, Math.max(n, cur.instanceMatrix.count * 2), cur.castShadow);
    bigger.renderOrder = cur.renderOrder;
    bigger.visible = cur.visible;
    this.group.remove(cur);
    cur.dispose();
    this[which] = bigger;
    return bigger;
  }

  private rebuild(): void {
    const { lamps, trees } = this.layout();
    this.lampSpots = lamps;
    this.treeSpots = trees;
    const lm = this.ensure('lamps', lamps.length);
    const pm = this.ensure('pools', lamps.length);
    const tm = this.ensure('trees', trees.length);
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const p = new Vector3();
    const one = new Vector3(1, 1, 1);
    const pool = new Vector3(POOL_SIZE, 1, POOL_SIZE);
    lamps.forEach((l, i) => {
      // Local +x (the arm) points at the road.
      q.setFromAxisAngle(up, Math.atan2(-l.iz, l.ix));
      lm.setMatrixAt(i, m.compose(p.set(l.x, l.y, l.z), q, one));
      pm.setMatrixAt(i, m.compose(p.set(l.x + l.ix * 2.6, l.y + 0.2, l.z + l.iz * 2.6), q.identity(), pool));
    });
    trees.forEach((t, i) => {
      q.setFromAxisAngle(up, t.rot);
      tm.setMatrixAt(i, m.compose(p.set(t.x, t.y, t.z), q, new Vector3(t.scale, t.scale, t.scale)));
    });
    lm.count = lamps.length;
    pm.count = lamps.length;
    tm.count = trees.length;
    for (const im of [lm, pm, tm]) im.instanceMatrix.needsUpdate = true;
  }

  /** @param night 0–1 from the day/night cycle; camDistance for the post LOD. */
  update(night: number, camDistance: number): void {
    if (this.dirty) {
      this.dirty = false;
      this.rebuild();
    }
    this.poolMat.opacity = night * 0.26;
    this.pools.visible = night > 0.02 && this.pools.count > 0;
    const posts = camDistance < 1100;
    if (posts !== this.postsVisible) {
      this.postsVisible = posts;
      this.lamps.visible = posts;
    }
  }

  setShadows(on: boolean): void {
    this.lamps.castShadow = on;
    this.trees.castShadow = on;
  }

  dispose(): void {
    this.unsub();
    this.lampGeo.dispose();
    this.lampMat.dispose();
    this.poolMat.map?.dispose();
    this.poolMat.dispose();
    this.treeGeo.dispose();
    this.treeMat.dispose();
    this.pools.geometry.dispose();
  }
}
