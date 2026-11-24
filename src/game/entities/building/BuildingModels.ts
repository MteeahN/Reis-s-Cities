import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  Euler,
  BoxGeometry,
  LinearMipmapLinearFilter,
  Matrix4,
  MeshStandardMaterial,
  RepeatWrapping,
  RGBAFormat,
  SphereGeometry,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { inkEdges, patchInk } from '../../rendering/ink';
import type { BuildingDef, BuildingPart, FacadeStyle } from '../../data/buildings';
import { HASH_GLSL, nightUniform } from '../../rendering/nightUniform';
import { PROCEDURAL_VARIANTS, proceduralParts, variantSpec } from './ProceduralBuildings';
import type { ArchStyle } from '../../data/styles';

const BAY_WIDTH = 3.2;
const FLOOR_HEIGHT = 3.4;

export interface BuildingGeometry {
  plain: BufferGeometry | null;
  facade: BufferGeometry | null;
  /** Small parts (doors, chimneys, bushes, rooftop units) hidden at a distance (LOD). */
  detail: BufferGeometry | null;
  height: number;
}

/** Atlas tile per facade style (2×2 atlas, tile 0 at the bottom left). */
export const FACADE_TILE: Record<FacadeStyle, number> = { residential: 0, office: 1, shop: 2, industrial: 3 };

/** Triangular prism, ridge along x: width (x), height (y), depth (z). */
function gableGeometry(w: number, h: number, d: number): BufferGeometry {
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  // prettier-ignore
  const v = [
    // slope front (z1 → ridge)
    x0, 0, z1, x1, 0, z1, x1, h, 0,   x0, 0, z1, x1, h, 0, x0, h, 0,
    // slope back
    x1, 0, z0, x0, 0, z0, x0, h, 0,   x1, 0, z0, x0, h, 0, x1, h, 0,
    // gable ends
    x0, 0, z0, x0, 0, z1, x0, h, 0,
    x1, 0, z1, x1, 0, z0, x1, h, 0,
    // bottom
    x0, 0, z0, x1, 0, z0, x1, 0, z1,  x0, 0, z0, x1, 0, z1, x0, 0, z1,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

/** Hipped roof: ridge along x (shorter than the eaves by the depth), all four sides slope. */
export function hipGeometry(w: number, h: number, d: number): BufferGeometry {
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const r = Math.max(0, (w - d) / 2);
  // prettier-ignore
  const v = [
    // front and back slopes (trapezoids)
    x0, 0, z1, x1, 0, z1, r, h, 0,    x0, 0, z1, r, h, 0, -r, h, 0,
    x1, 0, z0, x0, 0, z0, -r, h, 0,   x1, 0, z0, -r, h, 0, r, h, 0,
    // hipped ends (triangles)
    x0, 0, z0, x0, 0, z1, -r, h, 0,
    x1, 0, z1, x1, 0, z0, r, h, 0,
    // bottom
    x0, 0, z0, x1, 0, z0, x1, 0, z1,  x0, 0, z0, x1, 0, z1, x0, 0, z1,
  ];
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(v), 3));
  g.computeVertexNormals();
  return g;
}

function partGeometry(part: BuildingPart): BufferGeometry {
  const [w, h, d] = part.size;
  const seg = part.segments ?? 16;
  let g: BufferGeometry;
  switch (part.shape) {
    case 'box':
      g = new BoxGeometry(w, h, d).translate(0, h / 2, 0);
      if (part.facade) facadeUVs(g, w, h, d);
      break;
    case 'cylinder':
      g = new CylinderGeometry(w / 2, w / 2, h, seg).translate(0, h / 2, 0);
      break;
    case 'cone':
      g = new ConeGeometry(w / 2, h, seg).translate(0, h / 2, 0);
      break;
    case 'pyramid':
      g = new ConeGeometry(Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).scale(w, h, d).translate(0, h / 2, 0);
      break;
    case 'gable':
      g = gableGeometry(w, h, d);
      break;
    case 'hip':
      g = hipGeometry(w, h, d);
      break;
    case 'dome':
      g = new SphereGeometry(0.5, seg, Math.max(4, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2).scale(w, h * 2, d);
      break;
  }
  if (part.rot) {
    const [rx, ry, rz] = part.rot.map((deg) => (deg * Math.PI) / 180);
    g.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(rx, ry, rz)));
  }
  g.translate(part.pos[0], part.pos[1], part.pos[2]);
  return g;
}

/** UVs in "window bays": 1 unit = one bay wide × one floor tall; roofs get no windows. */
function facadeUVs(g: BufferGeometry, w: number, h: number, d: number): void {
  const uv = g.getAttribute('uv') as BufferAttribute;
  const nor = g.getAttribute('normal') as BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    if (ny > 0.5) {
      uv.setXY(i, 0.02, 0.02); // plain wall colour
      continue;
    }
    const span = nx > 0.5 ? d : w;
    uv.setXY(i, uv.getX(i) * Math.max(1, Math.round(span / BAY_WIDTH)), uv.getY(i) * Math.max(1, Math.round(h / FLOOR_HEIGHT)));
  }
}

function colorize(g: BufferGeometry, hex: string): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  const c = new Color(hex);
  const n = out.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  out.setAttribute('color', new BufferAttribute(col, 3));
  return out;
}

function withTile(g: BufferGeometry, tile: number): BufferGeometry {
  g.setAttribute('aTile', new BufferAttribute(new Float32Array(g.getAttribute('position').count).fill(tile), 1));
  return g;
}

/** One vertex-coloured, ink-edged geometry from primitive parts (decorations). */
export function partsGeometry(parts: BuildingPart[]): BufferGeometry {
  const geos = parts.map((p) => {
    const g = colorize(partGeometry(p), p.color);
    g.deleteAttribute('uv');
    return g;
  });
  const merged = inkEdges(mergeGeometries(geos)!);
  merged.computeBoundingSphere();
  return merged;
}

/** A part is a "detail" if it is small in every dimension (the LOD drops these far away). */
export const DETAIL_SIZE = 2.6;
export function isDetailPart(part: BuildingPart): boolean {
  return !part.facade && Math.max(...part.size) < DETAIL_SIZE;
}

const cache = new Map<string, BuildingGeometry>();

/** Number of looks a catalogue entry has (growables rotate colours and roofs). */
export function variantCount(def: BuildingDef): number {
  return def.spec ? PROCEDURAL_VARIANTS : 1;
}

/** Parts of a variant: growables re-generate theirs from the spec; authored models have one look. */
export function variantParts(def: BuildingDef, variant: number, arch: ArchStyle = 'modern'): BuildingPart[] {
  if (!def.spec) return def.model;
  if (variant === 0 && arch === 'modern') return def.model;
  return proceduralParts(variant > 0 ? variantSpec(def.spec, variant) : def.spec, arch);
}

/**
 * Builds (and caches) the merged model geometry for a catalogue entry.
 * @param variant look variant (0 = as authored)
 * @param splitDetail put small parts into `detail` (off for construction sites)
 */
export function buildingGeometry(def: BuildingDef, variant = 0, splitDetail = true, arch: ArchStyle = 'modern'): BuildingGeometry {
  const key = `${def.id}#${variant}#${splitDetail ? 1 : 0}#${def.spec ? arch : 'modern'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const plain: BufferGeometry[] = [];
  const facade: BufferGeometry[] = [];
  const detail: BufferGeometry[] = [];
  let height = 0;
  for (const part of variantParts(def, variant, arch)) {
    const g = colorize(partGeometry(part), part.color);
    if (part.facade && part.shape === 'box') {
      facade.push(withTile(g, FACADE_TILE[part.facade === true ? 'residential' : part.facade]));
    } else {
      g.deleteAttribute('uv');
      (splitDetail && isDetailPart(part) ? detail : plain).push(g);
    }
    height = Math.max(height, part.pos[1] + part.size[1]);
  }
  const result: BuildingGeometry = {
    plain: plain.length ? inkEdges(mergeGeometries(plain)!) : null,
    facade: facade.length ? inkEdges(mergeGeometries(facade)!) : null,
    detail: detail.length ? inkEdges(mergeGeometries(detail)!) : null,
    height,
  };
  result.plain?.computeBoundingSphere();
  result.facade?.computeBoundingSphere();
  result.detail?.computeBoundingSphere();
  cache.set(key, result);
  return result;
}

// ---------------------------------------------------------------- facade atlas

const TILE = 256;

type Painter = (c: CanvasRenderingContext2D, glow: CanvasRenderingContext2D) => void;

/**
 * Each painter draws one bay (one window wide, one floor tall) into a
 * 256×256 tile. The bottom-left corner stays wall colour: roofs sample it.
 * The glow canvas marks the glass that lights up at night.
 */
const PAINTERS: Painter[] = [
  // 0 residential: framed window with a sill and a mullion
  (c, g) => {
    c.fillStyle = '#d9d4ca';
    c.fillRect(56, 44, 144, 172);
    const grad = c.createLinearGradient(0, 56, 0, 204);
    grad.addColorStop(0, '#5b7186');
    grad.addColorStop(1, '#27323d');
    c.fillStyle = grad;
    c.fillRect(68, 56, 120, 148);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(68, 56, 120, 22);
    c.fillStyle = '#d9d4ca';
    c.fillRect(124, 56, 8, 148);
    c.fillStyle = '#cfc9bd';
    c.fillRect(48, 214, 160, 12);
    g.fillStyle = '#fff';
    g.fillRect(68, 56, 56, 148);
    g.fillRect(132, 56, 56, 148);
  },
  // 1 office: curtain wall — glass with thin mullions above a spandrel band
  (c, g) => {
    const grad = c.createLinearGradient(0, 0, TILE, TILE);
    grad.addColorStop(0, '#7d98ad');
    grad.addColorStop(1, '#3a4b5a');
    c.fillStyle = grad;
    c.fillRect(10, 0, 236, 206);
    c.fillStyle = 'rgba(255,255,255,0.14)';
    c.beginPath();
    c.moveTo(10, 0);
    c.lineTo(120, 0);
    c.lineTo(10, 120);
    c.fill();
    c.fillStyle = '#e6e8ea';
    c.fillRect(124, 0, 8, 206);
    c.fillStyle = '#c8ccd0';
    c.fillRect(0, 206, TILE, 50);
    g.fillStyle = '#fff';
    g.fillRect(10, 0, 114, 206);
    g.fillRect(132, 0, 114, 206);
  },
  // 2 shop: large display window above a plinth
  (c, g) => {
    const grad = c.createLinearGradient(0, 30, 0, 200);
    grad.addColorStop(0, '#6f8ba0');
    grad.addColorStop(1, '#2d3944');
    c.fillStyle = grad;
    c.fillRect(18, 30, 220, 176);
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.fillRect(18, 30, 220, 26);
    c.fillStyle = '#bdb7ab';
    c.fillRect(18, 206, 220, 32);
    g.fillStyle = '#fff';
    g.fillRect(18, 30, 220, 176);
  },
  // 3 industrial: corrugated cladding with a high strip window
  (c, g) => {
    for (let x = 0; x < TILE; x += 16) {
      c.fillStyle = x % 32 === 0 ? '#e8e8e8' : '#cfcfcf';
      c.fillRect(x, 0, 16, TILE);
    }
    c.fillStyle = '#a9b6bf';
    c.fillRect(0, 22, TILE, 44);
    c.fillStyle = '#4b5966';
    c.fillRect(8, 28, 240, 32);
    c.fillStyle = '#e8e8e8';
    c.fillRect(0, 230, TILE, 26);
    g.fillStyle = '#fff';
    g.fillRect(8, 28, 240, 32);
  },
];

/** Canvas top-left of a tile. flipY puts uv (0,0) at the canvas' bottom left, so tile row 0 is the bottom row. */
function tileOrigin(tile: number): [number, number] {
  return [(tile % 2) * TILE, TILE * 2 - (Math.floor(tile / 2) + 1) * TILE];
}

function createAtlases(): { color: Texture; glow: Texture } {
  if (typeof document === 'undefined') {
    const mk = () => {
      const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
      t.needsUpdate = true;
      return t;
    };
    return { color: mk(), glow: mk() };
  }
  const make = (fill: string) => {
    const c = document.createElement('canvas');
    c.width = c.height = TILE * 2;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, TILE * 2, TILE * 2);
    return { c, ctx };
  };
  const color = make('#ffffff');
  const glow = make('#000000');
  PAINTERS.forEach((paint, tile) => {
    const [ox, oy] = tileOrigin(tile);
    for (const t of [color.ctx, glow.ctx]) {
      t.save();
      t.translate(ox, oy);
      t.beginPath();
      t.rect(0, 0, TILE, TILE);
      t.clip();
    }
    paint(color.ctx, glow.ctx);
    color.ctx.restore();
    glow.ctx.restore();
  });
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    if (srgb) t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = 4;
    return t;
  };
  return { color: tex(color.c, true), glow: tex(glow.c, false) };
}

/**
 * Facade shading: picks the style's atlas tile per vertex (`aTile`), repeats
 * bays with `fract` (gradients from the untiled UV keep mipmapping seamless)
 * and lights windows after dark. Whether a window is lit comes from a hash
 * of its bay and the instance position compared with the building's `aLit`
 * share, which the renderer sets from occupancy and power supply.
 */
function patchFacade(mat: MeshStandardMaterial, glow: Texture): void {
  const uniforms = { uNight: nightUniform, uGlowAtlas: { value: glow } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aTile;
attribute float aLit;
flat varying float vTile;
flat varying float vLit;
flat varying vec2 vSeed;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vTile = aTile;
#ifdef USE_INSTANCING
vLit = aLit;
vSeed = instanceMatrix[3].xz;
#else
vLit = 0.0;
vSeed = vec2(0.0);
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uNight;
uniform sampler2D uGlowAtlas;
flat varying float vTile;
flat varying float vLit;
flat varying vec2 vSeed;
${HASH_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 reisCell = floor(vMapUv);
vec2 reisTile = vec2(mod(vTile, 2.0), floor(vTile * 0.5 + 0.01)) * 0.5;
vec2 reisUv = reisTile + (fract(vMapUv) * 0.96 + 0.02) * 0.5;
vec2 reisDx = dFdx(vMapUv) * 0.48;
vec2 reisDy = dFdy(vMapUv) * 0.48;
diffuseColor *= textureGrad(map, reisUv, reisDx, reisDy);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float reisGlow = textureGrad(uGlowAtlas, reisUv, reisDx, reisDy).r;
// Building position folded into a small range first, so the hash stays precise.
float reisH = reisHash(reisCell + fract(vSeed * 0.0137) * 97.0 + vTile * 3.1);
float reisOn = step(reisH, vLit) * reisGlow * uNight;
vec3 reisWarm = mix(vec3(1.0, 0.7, 0.36), vec3(0.8, 0.88, 1.0), step(0.78, fract(reisH * 17.0)));
totalEmissiveRadiance += reisWarm * reisOn * 1.7;`,
      );
  };
  mat.customProgramCacheKey = () => 'reis-facade-v3';
}

let materials: { plain: MeshStandardMaterial; facade: MeshStandardMaterial } | null = null;

export function buildingMaterials(): { plain: MeshStandardMaterial; facade: MeshStandardMaterial } {
  if (!materials) {
    const atlas = createAtlases();
    const facade = new MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.06, map: atlas.color });
    patchFacade(facade, atlas.glow);
    patchInk(facade);
    const plain = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.02 });
    patchInk(plain);
    materials = { plain, facade };
  }
  return materials;
}
