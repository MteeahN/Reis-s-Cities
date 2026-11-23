import { BoxGeometry, BufferAttribute, type BufferGeometry, CylinderGeometry, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, SphereGeometry, Vector3 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CELL_SIZE, GRID_CELLS } from '../core/config';
import { getRoadType } from '../data/roads';
import type { BuildingRegistry } from '../entities/building/BuildingRegistry';
import type { RoadEdge, RoadGraph } from '../entities/road/RoadGraph';
import { mulberry32 } from '../world/generation/rng';
import type { Occupancy } from '../world/Occupancy';
import { rasterizePolyline } from '../world/Occupancy';
import { CURB_HEIGHT } from './roads/roadGeometry';
import { sampleProfile, type RoadRenderer, type SurfacePoint } from './roads/RoadRenderer';

/**
 * Share of the people who live or work along a street that are out walking at
 * a given hour (0–24): almost nobody at night, peaks at the morning and evening
 * commutes and around lunch.
 */
export function walkingShare(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  const bump = (c: number, w: number) => Math.exp(-((h - c) ** 2) / (2 * w * w));
  return 0.015 + 0.16 * bump(8, 1.1) + 0.1 * bump(12.5, 1.4) + 0.18 * bump(18, 1.6) + 0.06 * bump(21, 1.5);
}

/** Walkers drawn per person out walking near the camera (one figure stands for several people). */
export const PEOPLE_PER_WALKER = 6;
const WALK_SPEED = 1.35;

/** Body builds; each comes in three walking poses. */
export const BODIES = ['trousers', 'dress', 'backpack', 'handbag'] as const;
export type Body = (typeof BODIES)[number];

type RGB = [number, number, number];
const hex = (h: number): RGB => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const SKINS = [0xf1d3b8, 0xe0b896, 0xc89670, 0xa5704a, 0x7d5035, 0x5c3a26].map(hex);
const HAIR = [0x1d1612, 0x3b2a1e, 0x6b4a2b, 0xa8763e, 0xd9b56a, 0x8a2f1c].map(hex);
const GREY_HAIR = [0xb8b4ae, 0xd8d6d0, 0x8f8b86].map(hex);
const TOPS = [0x2f6db5, 0xb5472f, 0x3d8a4d, 0xe0c23a, 0xe8e6e0, 0x2b2f36, 0x8a4f9e, 0xd9822b, 0x5a8fa8, 0xa83250, 0x6b7b3a, 0xc76b8f, 0x3a4a6b, 0xf2efe8].map(hex);
const BOTTOMS = [0x1f2a44, 0x2b2f36, 0x4a5560, 0x6b5a46, 0x2f4f6f, 0x8a8f94, 0x3d3226, 0xc9b99a].map(hex);
const ELDER_TOPS = [0x5a5046, 0x6b7b8a, 0x7a5a4a, 0x4a5a46, 0x8a8478].map(hex);

/** Vertex part ids: 0 fixed colour (shoes, bag straps), 1 top, 2 bottom, 3 skin, 4 hair. */
const PART_FIXED = 0;
const PART_TOP = 1;
const PART_BOTTOM = 2;
const PART_SKIN = 3;
const PART_HAIR = 4;

/** A low-poly person of the given build in one of three walking poses (stride −1, 0, 1). */
export function figure(body: Body, stride: number): BufferGeometry {
  const parts: { g: BufferGeometry; part: number; color?: RGB }[] = [];
  const shoes: RGB = [0.08, 0.08, 0.08];
  // A box hanging from a pivot (hip / shoulder), swung by `angle` about x; `drop` / `fwd` move it along the limb.
  const limb = (w: number, h: number, d: number, x: number, pivotY: number, angle: number, drop = 0, fwd = 0) =>
    new BoxGeometry(w, h, d).translate(0, -h / 2 - drop, fwd).rotateX(angle).translate(x, pivotY, 0);
  const dress = body === 'dress';
  const swing = (stride * Math.PI) / (dress ? 9 : 7);
  for (const side of [-1, 1]) {
    // Legs: trousers, or bare legs under a dress.
    parts.push({ g: limb(dress ? 0.11 : 0.15, 0.82, dress ? 0.12 : 0.17, side * 0.1, 0.9, side * swing), part: dress ? PART_SKIN : PART_BOTTOM });
    parts.push({ g: limb(0.15, 0.08, 0.26, side * 0.1, 0.9, side * swing, 0.78, 0.04), part: PART_FIXED, color: shoes });
    // Arms: sleeve and hand.
    const armSwing = body === 'handbag' && side === 1 ? 0.05 : -side * swing * 0.8;
    parts.push({ g: limb(0.1, 0.36, 0.12, side * 0.27, 1.46, armSwing), part: PART_TOP });
    parts.push({ g: limb(0.085, 0.26, 0.1, side * 0.27, 1.46, armSwing, 0.36), part: PART_SKIN });
  }
  if (dress) {
    // Flared skirt (a short truncated cone) over the hips.
    parts.push({ g: new CylinderGeometry(0.2, 0.32, 0.55, 8).translate(0, 0.62, 0), part: PART_BOTTOM });
  }
  // Torso, neck, head and hair (long hair for the dress build).
  parts.push({ g: new BoxGeometry(dress ? 0.38 : 0.42, 0.62, 0.24).translate(0, 1.2, 0), part: PART_TOP });
  parts.push({ g: new BoxGeometry(0.12, 0.1, 0.12).translate(0, 1.55, 0), part: PART_SKIN });
  parts.push({ g: new SphereGeometry(0.12, 8, 6).translate(0, 1.69, 0), part: PART_SKIN });
  parts.push({ g: new SphereGeometry(0.128, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.71, -0.01), part: PART_HAIR });
  if (dress) parts.push({ g: new BoxGeometry(0.24, 0.32, 0.08).translate(0, 1.42, -0.12), part: PART_HAIR });
  if (body === 'backpack') {
    parts.push({ g: new BoxGeometry(0.34, 0.42, 0.18).translate(0, 1.08, -0.21), part: PART_FIXED, color: [0.2, 0.25, 0.32] });
  }
  if (body === 'handbag') {
    parts.push({ g: new BoxGeometry(0.08, 0.22, 0.28).translate(0.33, 0.78, 0.02), part: PART_FIXED, color: [0.42, 0.24, 0.14] });
  }
  const geos = parts.map(({ g, part, color }) => {
    const n = g.index ? g.toNonIndexed() : g;
    n.deleteAttribute('uv');
    const c = n.getAttribute('position').count;
    const col = new Float32Array(c * 3);
    for (let i = 0; i < c; i++) col.set(color ?? [1, 1, 1], i * 3);
    n.setAttribute('color', new BufferAttribute(col, 3));
    n.setAttribute('aPart', new BufferAttribute(new Float32Array(c).fill(part), 1));
    return n;
  });
  const g = mergeGeometries(geos)!;
  g.computeBoundingSphere();
  return g;
}

/** Per-person colours come from instanced attributes, picked per vertex by its body part. */
function figureMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute vec3 aTop;\nattribute vec3 aBottom;\nattribute vec3 aSkin;\nattribute vec3 aHair;')
      .replace(
        '#include <color_vertex>',
        `vColor = vec4(color.rgb, 1.0);
  if (aPart > 0.5 && aPart < 1.5) vColor.rgb = aTop;
  else if (aPart > 1.5 && aPart < 2.5) vColor.rgb = aBottom;
  else if (aPart > 2.5 && aPart < 3.5) vColor.rgb = aSkin;
  else if (aPart > 3.5) vColor.rgb = aHair;`,
      );
  };
  mat.customProgramCacheKey = () => 'reis-pedestrian-v2';
  return mat;
}

interface Walker {
  edge: number;
  /** Metres from node a along the edge profile. */
  s: number;
  /** +1 walks a → b, −1 walks b → a. */
  dir: number;
  /** Sidewalk: +1 left, −1 right of the a → b direction. */
  side: number;
  /** Lateral position on the sidewalk (−0.5 … 0.5 of its width). */
  lane: number;
  speed: number;
  phase: number;
  body: number;
  /** 1 adult, ~0.64 child. */
  scale: number;
  top: RGB;
  bottom: RGB;
  skin: RGB;
  hair: RGB;
}

const COLOR_ATTRS = ['aTop', 'aBottom', 'aSkin', 'aHair'] as const;

/**
 * People walking on the sidewalks near the camera. How many walk on each
 * street follows the people who actually live or work in the buildings along
 * it and the hour of the day (walkingShare); one figure stands for
 * PEOPLE_PER_WALKER people. Walkers differ in build (trousers, dress,
 * backpack, handbag), age (children, elderly), skin, hair and clothing; some
 * walk in pairs. They follow the sidewalks and continue onto connected
 * streets at junctions.
 */
export class PedestrianRenderer {
  readonly group = new Group();
  /** Meshes per body × pose (3 poses each). */
  private readonly meshes: InstancedMesh[];
  private readonly material = figureMaterial();
  private readonly walkers: Walker[] = [];
  private readonly rand = mulberry32(0x9ed5);
  private readonly nearCells = new WeakMap<RoadEdge, number[]>();
  private readonly targets = new Map<number, number>();
  private max = 400;
  private timer = 0;
  private readonly pt: SurfacePoint = { x: 0, y: 0, z: 0, tx: 1, tz: 0 };
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly pos = new Vector3();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly up = new Vector3(0, 1, 0);

  constructor(
    private readonly roads: RoadGraph,
    private readonly buildings: BuildingRegistry,
    private readonly occupancy: Occupancy,
    private readonly roadRenderer: RoadRenderer,
    capacity = 600,
  ) {
    this.group.name = 'pedestrians';
    this.meshes = [];
    for (const body of BODIES) {
      for (const stride of [-1, 0, 1]) {
        const geo = figure(body, stride);
        for (const a of COLOR_ATTRS) geo.setAttribute(a, new InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(DynamicDrawUsage));
        const im = new InstancedMesh(geo, this.material, capacity);
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = true;
        this.group.add(im);
        this.meshes.push(im);
      }
    }
    this.max = capacity;
  }

  setMax(n: number): void {
    this.max = Math.min(n, this.meshes[0].instanceMatrix.count);
    if (this.walkers.length > this.max) this.walkers.length = this.max;
  }

  get count(): number {
    return this.walkers.length;
  }

  /** People living or working in active buildings along an edge (within two cells of its sidewalks). */
  peopleAlong(e: RoadEdge): number {
    let cells = this.nearCells.get(e);
    if (!cells) {
      cells = rasterizePolyline(e.poly.points, getRoadType(e.typeId).width / 2 + CELL_SIZE * 2);
      this.nearCells.set(e, cells);
    }
    const seen = new Set<number>();
    let people = 0;
    for (const k of cells) {
      const id = this.occupancy.buildingAt(k % GRID_CELLS, Math.floor(k / GRID_CELLS));
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const b = this.buildings.items.get(id);
      if (b && b.state === 'active') people += b.occupants;
    }
    return people;
  }

  /**
   * @param dt real seconds
   * @param simSpeed 0 when paused (people stand still)
   * @param hour hour of the game day (fractional)
   */
  update(dt: number, simSpeed: number, hour: number, camX: number, camZ: number, camDistance: number): void {
    if (camDistance > 700 || this.max === 0) {
      this.walkers.length = 0;
      for (const im of this.meshes) im.count = 0;
      return;
    }
    const radius = Math.min(420, Math.max(160, camDistance * 1.2));
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 1;
      this.computeTargets(camX, camZ, radius, hour);
    }
    // Leave streets that are out of view or now have too many walkers.
    const per = new Map<number, number>();
    let w = 0;
    for (const p of this.walkers) {
      const n = per.get(p.edge) ?? 0;
      if (!this.roads.edges.has(p.edge) || n >= (this.targets.get(p.edge) ?? 0)) continue;
      per.set(p.edge, n + 1);
      this.walkers[w++] = p;
    }
    this.walkers.length = w;
    this.spawn(per);
    this.move(dt * Math.min(simSpeed, 1.5));
    this.draw();
  }

  private computeTargets(cx: number, cz: number, r: number, hour: number): void {
    this.targets.clear();
    const share = walkingShare(hour);
    const want: { id: number; n: number }[] = [];
    let total = 0;
    for (const e of this.roads.edgesInBox(cx - r, cz - r, cx + r, cz + r)) {
      const type = getRoadType(e.typeId);
      if (type.sidewalk <= 0) continue;
      const mid = e.poly.points[Math.floor(e.poly.points.length / 2)];
      if (Math.hypot(mid.x - cx, mid.z - cz) > r) continue;
      const len = this.roadRenderer.edgeProfile(e.id)?.length ?? 0;
      const n = Math.min(Math.floor(len / 3), Math.round((this.peopleAlong(e) * share) / PEOPLE_PER_WALKER));
      if (n > 0) {
        want.push({ id: e.id, n });
        total += n;
      }
    }
    const scale = total > this.max ? this.max / total : 1;
    for (const { id, n } of want) this.targets.set(id, Math.floor(n * scale));
  }

  /** A new person: age group, build and colours. */
  private person(edge: number, s: number, dir: number, side: number, lane: number): Walker {
    const r = this.rand;
    const pick = <T>(list: T[]) => list[Math.floor(r() * list.length)];
    const age = r();
    const child = age < 0.14;
    const elder = !child && age > 0.86;
    const u = r();
    const body = child ? (u < 0.4 ? 2 : u < 0.7 ? 1 : 0) : u < 0.32 ? 1 : u < 0.5 ? 2 : u < 0.65 ? 3 : 0;
    return {
      edge,
      s,
      dir,
      side,
      lane,
      speed: WALK_SPEED * (elder ? 0.7 : child ? 0.9 : 0.85 + r() * 0.35),
      phase: r() * 10,
      body,
      scale: child ? 0.62 + r() * 0.08 : 0.94 + r() * 0.12,
      top: elder ? pick(ELDER_TOPS) : pick(TOPS),
      bottom: pick(BOTTOMS),
      skin: pick(SKINS),
      hair: elder ? pick(GREY_HAIR) : pick(HAIR),
    };
  }

  private spawn(per: Map<number, number>): void {
    for (const [edge, target] of this.targets) {
      let have = per.get(edge) ?? 0;
      const prof = this.roadRenderer.edgeProfile(edge);
      if (!prof) continue;
      while (have < target && this.walkers.length < this.max) {
        const dir = this.rand() < 0.5 ? 1 : -1;
        const side = this.rand() < 0.5 ? 1 : -1;
        const s = this.rand() * prof.length;
        const lead = this.person(edge, s, dir, side, (this.rand() - 0.5) * 0.6);
        this.walkers.push(lead);
        have++;
        // Some walk together: a companion beside them at the same pace (children always have one).
        if ((lead.scale < 0.8 || this.rand() < 0.22) && have < target && this.walkers.length < this.max) {
          const mate = this.person(edge, s + 0.3 * dir, dir, side, lead.lane > 0 ? lead.lane - 0.5 : lead.lane + 0.5);
          if (lead.scale < 0.8 && mate.scale < 0.8) mate.scale = 1;
          mate.speed = lead.speed = Math.min(lead.speed, mate.speed);
          mate.phase = lead.phase + 0.5;
          this.walkers.push(mate);
          have++;
        }
      }
      per.set(edge, have);
    }
  }

  private move(dt: number): void {
    if (dt <= 0) return;
    for (const p of this.walkers) {
      p.phase += (dt * p.speed * 1.6) / p.scale;
      const prof = this.roadRenderer.edgeProfile(p.edge);
      if (!prof) continue;
      p.s += p.dir * p.speed * dt;
      if (p.s >= 0 && p.s <= prof.length) continue;
      // Reached a junction: carry on along another street's sidewalk, or turn back.
      const e = this.roads.edges.get(p.edge)!;
      const node = p.s > prof.length ? e.b : e.a;
      const options = (this.roads.nodes.get(node)?.edges ?? []).filter((id) => id !== p.edge && getRoadType(this.roads.edges.get(id)!.typeId).sidewalk > 0 && this.targets.has(id));
      if (options.length === 0) {
        p.dir = -p.dir;
        p.s = Math.max(0, Math.min(prof.length, p.s));
        p.side = -p.side;
        continue;
      }
      // Pairs choose the same street: the choice depends only on where and when they arrive.
      const next = this.roads.edges.get(options[(node + Math.floor(p.phase / 7)) % options.length])!;
      const nprof = this.roadRenderer.edgeProfile(next.id);
      p.edge = next.id;
      p.dir = next.a === node ? 1 : -1;
      p.s = p.dir === 1 ? 0 : (nprof?.length ?? 0);
    }
  }

  private draw(): void {
    const counts = this.meshes.map(() => 0);
    for (const p of this.walkers) {
      const prof = this.roadRenderer.edgeProfile(p.edge);
      const e = this.roads.edges.get(p.edge);
      if (!prof || !e) continue;
      const type = getRoadType(e.typeId);
      sampleProfile(prof, p.s, this.pt);
      const sw = Math.min(type.sidewalk, type.width * 0.225);
      const off = (type.width / 2 - sw / 2 + p.lane * sw * 0.6) * p.side;
      this.pos.set(this.pt.x - this.pt.tz * off, this.pt.y + CURB_HEIGHT, this.pt.z + this.pt.tx * off);
      this.q.setFromAxisAngle(this.up, Math.atan2(this.pt.tx * p.dir, this.pt.tz * p.dir));
      this.scale.setScalar(p.scale);
      this.m.compose(this.pos, this.q, this.scale);
      const pose = Math.floor(p.phase) % 4;
      const k = p.body * 3 + (pose === 0 ? 0 : pose === 2 ? 2 : 1);
      const im = this.meshes[k];
      const i = counts[k];
      if (i >= im.instanceMatrix.count) continue;
      im.setMatrixAt(i, this.m);
      const g = im.geometry;
      (g.getAttribute('aTop') as InstancedBufferAttribute).set(p.top, i * 3);
      (g.getAttribute('aBottom') as InstancedBufferAttribute).set(p.bottom, i * 3);
      (g.getAttribute('aSkin') as InstancedBufferAttribute).set(p.skin, i * 3);
      (g.getAttribute('aHair') as InstancedBufferAttribute).set(p.hair, i * 3);
      counts[k] = i + 1;
    }
    this.meshes.forEach((im, k) => {
      im.count = counts[k];
      im.instanceMatrix.needsUpdate = true;
      for (const a of COLOR_ATTRS) (im.geometry.getAttribute(a) as InstancedBufferAttribute).needsUpdate = true;
    });
  }

  dispose(): void {
    for (const im of this.meshes) im.geometry.dispose();
    this.material.dispose();
  }
}
