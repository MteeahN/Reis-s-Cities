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

/** Atlas row per facade style (upper floors; ground floors are 4 rows above). */
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
      // +10: the wall stands on the ground (its first floor gets doors and shopfronts).
      facade.push(withTile(g, FACADE_TILE[part.facade === true ? 'residential' : part.facade] + (part.pos[1] < 0.6 ? 10 : 0)));
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
/** Atlas layout: 4 variants (columns) × 8 rows — rows 0–3 upper floors per style, rows 4–7 ground floors. */
const COLS = 4;
const ROWS = 8;

type Painter = (c: CanvasRenderingContext2D, glow: CanvasRenderingContext2D) => void;

// Small painting helpers (tile coordinates, y down; the bottom-left 20 px stay wall colour for roofs).
const rect = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string | CanvasGradient) => {
  c.fillStyle = fill;
  c.fillRect(x, y, w, h);
};
/** Glass pane with a sky reflection gradient and a soft highlight; marks it as lit-able in the glow atlas. */
function glass(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, top = '#6a8297', bottom = '#26313b'): void {
  const grad = c.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bottom);
  rect(c, x, y, w, h, grad);
  c.fillStyle = 'rgba(255,255,255,0.16)';
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x + w * 0.55, y);
  c.lineTo(x, y + h * 0.45);
  c.fill();
  rect(g, x, y, w, h, '#fff');
}
/** Recess shadow below/left of an opening (gives the wall some depth). */
function recess(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  rect(c, x, y, w, 6, 'rgba(0,0,0,0.22)');
  rect(c, x, y, 5, h, 'rgba(0,0,0,0.14)');
}
/** Window with a frame, a mullion and a sill. */
function framedWindow(c: CanvasRenderingContext2D, g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frame = '#e4dfd4', split = 1): void {
  rect(c, x - 8, y - 8, w + 16, h + 16, frame);
  glass(c, g, x, y, w, h);
  recess(c, x, y, w, h);
  for (let k = 1; k <= split; k++) rect(c, x + (w * k) / (split + 1) - 3, y, 6, h, frame);
  rect(c, x - 12, y + h + 6, w + 24, 10, '#cfc9bd');
}
function brickRows(c: CanvasRenderingContext2D, color: string, alpha = 0.12): void {
  c.fillStyle = color;
  c.globalAlpha = alpha;
  for (let y = 0; y < TILE - 24; y += 16) {
    for (let x = (y / 16) % 2 ? -16 : 0; x < TILE; x += 32) c.fillRect(x + 22, y, 28, 2);
    c.fillRect(22, y + 14, TILE - 22, 2);
  }
  c.globalAlpha = 1;
}
function awning(c: CanvasRenderingContext2D, x: number, y: number, w: number, a: string, b: string): void {
  for (let k = 0; k < w; k += 20) rect(c, x + k, y, Math.min(20, w - k), 26, (k / 20) % 2 ? a : b);
  for (let k = 0; k < w; k += 20) {
    c.fillStyle = (k / 20) % 2 ? a : b;
    c.beginPath();
    c.arc(x + k + 10, y + 26, 10, 0, Math.PI);
    c.fill();
  }
  rect(c, x, y + 36, w, 4, 'rgba(0,0,0,0.25)');
}

const RESIDENTIAL: Painter[] = [
  // framed window with a sill and a mullion
  (c, g) => framedWindow(c, g, 68, 56, 120, 148),
  // shuttered window with a flower box
  (c, g) => {
    framedWindow(c, g, 80, 60, 96, 140, '#ece7dc', 0);
    for (const sx of [44, 182]) {
      rect(c, sx, 52, 30, 156, '#5d7a5a');
      for (let y = 60; y < 200; y += 12) rect(c, sx + 3, y, 24, 4, 'rgba(0,0,0,0.18)');
    }
    rect(c, 74, 208, 108, 18, '#8a5a3c');
    for (let x = 80; x < 176; x += 14) {
      c.fillStyle = x % 28 ? '#d9483b' : '#e8c547';
      c.beginPath();
      c.arc(x + 6, 206, 6, 0, Math.PI * 2);
      c.fill();
    }
  },
  // French window with a small iron balcony
  (c, g) => {
    rect(c, 72, 30, 112, 196, '#e4dfd4');
    glass(c, g, 82, 40, 92, 180);
    recess(c, 82, 40, 92, 180);
    rect(c, 125, 40, 6, 180, '#e4dfd4');
    rect(c, 58, 214, 140, 10, '#bdb6a8');
    for (let x = 60; x <= 194; x += 12) rect(c, x, 164, 3, 52, '#2b2e31');
    rect(c, 58, 160, 140, 6, '#2b2e31');
  },
  // two narrow arched windows
  (c, g) => {
    for (const x of [58, 140]) {
      c.fillStyle = '#e4dfd4';
      c.beginPath();
      c.moveTo(x - 8, 210);
      c.lineTo(x - 8, 86);
      c.arc(x + 29, 86, 37, Math.PI, 0);
      c.lineTo(x + 66, 210);
      c.fill();
      const grad = c.createLinearGradient(0, 50, 0, 200);
      grad.addColorStop(0, '#6a8297');
      grad.addColorStop(1, '#26313b');
      c.fillStyle = grad;
      c.beginPath();
      c.moveTo(x, 200);
      c.lineTo(x, 86);
      c.arc(x + 29, 86, 29, Math.PI, 0);
      c.lineTo(x + 58, 200);
      c.fill();
      g.fillStyle = '#fff';
      g.fillRect(x, 58, 58, 142);
      rect(c, x - 12, 206, 82, 10, '#cfc9bd');
    }
  },
];

const OFFICE: Painter[] = [
  // curtain wall — glass with thin mullions above a spandrel band
  (c, g) => {
    glass(c, g, 22, 0, 234, 206, '#7d98ad', '#3a4b5a');
    rect(c, 124, 0, 8, 206, '#e6e8ea');
    rect(c, 22, 206, 234, 50, '#c8ccd0');
  },
  // ribbon window over a solid band
  (c, g) => {
    rect(c, 22, 0, 234, 70, '#d7d3cc');
    glass(c, g, 22, 70, 234, 110, '#86a2b6', '#34444f');
    for (const x of [88, 160, 230]) rect(c, x, 70, 5, 110, '#9aa3aa');
    rect(c, 22, 180, 234, 76, '#d7d3cc');
    rect(c, 22, 178, 234, 6, 'rgba(0,0,0,0.18)');
  },
  // punched windows in a grid of four panes
  (c, g) => {
    rect(c, 22, 0, 234, 256, '#cfcac0');
    for (const [x, y] of [[36, 24], [140, 24], [36, 122], [140, 122]]) {
      glass(c, g, x, y, 84, 82, '#7590a4', '#2f3d48');
      recess(c, x, y, 84, 82);
    }
  },
  // vertical fins in front of tall glass
  (c, g) => {
    glass(c, g, 22, 0, 234, 230, '#7b97ab', '#2f3e4a');
    for (const x of [26, 84, 142, 200]) {
      rect(c, x, 0, 18, 230, '#e3e1dc');
      rect(c, x + 14, 0, 4, 230, 'rgba(0,0,0,0.2)');
    }
    rect(c, 22, 230, 234, 26, '#bfc3c7');
  },
];

const SHOP: Painter[] = [
  // large display window above a plinth
  (c, g) => {
    glass(c, g, 22, 30, 216, 176, '#6f8ba0', '#2d3944');
    rect(c, 22, 206, 216, 32, '#bdb7ab');
  },
  // display window under a striped awning
  (c, g) => {
    glass(c, g, 26, 70, 206, 140, '#6f8ba0', '#2d3944');
    awning(c, 22, 20, 214, '#c8463a', '#f1ece2');
    rect(c, 22, 210, 216, 28, '#bdb7ab');
  },
  // sign band over a window
  (c, g) => {
    rect(c, 22, 18, 216, 44, '#2f5d4f');
    rect(c, 50, 32, 160, 14, '#f2e6c4');
    glass(c, g, 30, 74, 200, 136, '#7a95a9', '#2b3640');
    rect(c, 22, 210, 216, 28, '#a9a296');
  },
  // arcade: glass between pilasters
  (c, g) => {
    rect(c, 22, 0, 234, 256, '#e3ddd1');
    glass(c, g, 54, 40, 150, 172, '#7390a5', '#2a3641');
    rect(c, 22, 0, 30, 230, '#d6cfc1');
    rect(c, 206, 0, 30, 230, '#d6cfc1');
    rect(c, 22, 20, 214, 14, '#cfc8ba');
  },
];

const INDUSTRIAL: Painter[] = [
  // corrugated cladding with a high strip window
  (c, g) => {
    for (let x = 22; x < TILE; x += 16) rect(c, x, 0, 16, TILE, x % 32 === 6 ? '#e8e8e8' : '#cfcfcf');
    rect(c, 22, 22, 234, 44, '#a9b6bf');
    glass(c, g, 28, 28, 222, 32, '#617384', '#3a4550');
    rect(c, 22, 230, 234, 26, '#e8e8e8');
  },
  // brick with small high windows
  (c, g) => {
    brickRows(c, '#5a3a2a', 0.2);
    for (const x of [44, 148]) {
      rect(c, x - 6, 34, 76, 70, '#d8d2c6');
      glass(c, g, x, 40, 64, 58, '#647686', '#353f49');
    }
  },
  // vertical panels and a square window
  (c, g) => {
    for (let x = 22; x < TILE; x += 40) rect(c, x, 0, 3, TILE, 'rgba(0,0,0,0.12)');
    rect(c, 70, 50, 116, 100, '#9aa3aa');
    glass(c, g, 78, 58, 100, 84, '#647a8c', '#323e48');
  },
  // precast concrete panels
  (c, g) => {
    rect(c, 22, 0, 234, 256, '#d4d0c8');
    for (const y of [0, 128]) rect(c, 22, y + 124, 234, 4, 'rgba(0,0,0,0.16)');
    rect(c, 136, 0, 4, 256, 'rgba(0,0,0,0.12)');
    glass(c, g, 40, 150, 80, 44, '#647686', '#353f49');
  },
];

/** Ground floors: columns 0–1 windows, 2–3 entrances. */
const GROUND: Painter[][] = [
  // residential
  [
    (c, g) => {
      framedWindow(c, g, 68, 70, 120, 120);
      rect(c, 50, 226, 156, 30, '#6f9a4a');
      for (let x = 56; x < 200; x += 18) {
        c.fillStyle = '#4f7f33';
        c.beginPath();
        c.arc(x + 8, 226, 10, Math.PI, 0);
        c.fill();
      }
    },
    (c, g) => {
      framedWindow(c, g, 74, 60, 108, 140, '#e9e4d8', 0);
      rect(c, 22, 230, 234, 26, '#b9b2a4');
    },
    (c, g) => {
      // wooden door with a fanlight, step and lamp
      rect(c, 78, 36, 100, 200, '#e4dfd4');
      glass(c, g, 92, 46, 72, 26);
      rect(c, 92, 78, 72, 158, '#6b4a33');
      for (const y of [92, 160]) rect(c, 100, y, 56, 56, 'rgba(0,0,0,0.12)');
      rect(c, 150, 156, 6, 6, '#e6c25c');
      rect(c, 66, 236, 124, 14, '#c9c1b0');
      rect(c, 190, 92, 12, 18, '#2b2e31');
      rect(c, 192, 110, 8, 10, '#f5d37a');
      rect(g, 192, 110, 8, 10, '#fff');
    },
    (c, g) => {
      // glazed door with side light
      rect(c, 70, 40, 120, 196, '#e4dfd4');
      glass(c, g, 82, 52, 60, 184);
      rect(c, 82, 140, 60, 6, '#e4dfd4');
      glass(c, g, 150, 52, 30, 120);
      rect(c, 60, 236, 140, 14, '#c9c1b0');
    },
  ],
  // office
  [
    (c, g) => {
      glass(c, g, 22, 10, 234, 230, '#7f99ad', '#2c3a45');
      for (const x of [86, 150, 214]) rect(c, x, 10, 6, 230, '#d9dcdf');
    },
    (c, g) => {
      rect(c, 22, 0, 234, 256, '#bfc3c7');
      glass(c, g, 40, 30, 200, 200, '#7a95a9', '#2b3640');
      rect(c, 40, 120, 200, 5, '#d9dcdf');
    },
    (c, g) => {
      // lobby doors under a canopy band
      glass(c, g, 22, 40, 234, 200, '#86a0b3', '#2c3944');
      rect(c, 22, 20, 234, 22, '#3a4148');
      for (const x of [96, 128, 160]) rect(c, x, 110, 4, 130, '#d9dcdf');
      rect(c, 92, 106, 76, 6, '#d9dcdf');
    },
    (c, g) => {
      // revolving door
      glass(c, g, 22, 40, 234, 200, '#86a0b3', '#2c3944');
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.arc(128, 240, 60, Math.PI, 0);
      c.fill();
      rect(c, 126, 180, 4, 60, '#d9dcdf');
      rect(c, 22, 20, 234, 20, '#3a4148');
    },
  ],
  // shop
  [
    (c, g) => {
      glass(c, g, 26, 74, 206, 150, '#6f8ba0', '#2d3944');
      awning(c, 22, 22, 214, '#2f6db5', '#f1ece2');
      rect(c, 22, 224, 216, 16, '#a9a296');
    },
    (c, g) => {
      rect(c, 22, 16, 216, 40, '#7a2f2a');
      rect(c, 44, 28, 172, 14, '#f2e6c4');
      glass(c, g, 30, 66, 196, 160, '#7a95a9', '#2b3640');
      for (let y = 110; y < 220; y += 40) rect(c, 40, y, 176, 4, '#a07a52');
    },
    (c, g) => {
      // shop door with a sign above
      rect(c, 22, 16, 216, 40, '#2f5d4f');
      rect(c, 60, 28, 140, 14, '#f2e6c4');
      glass(c, g, 30, 66, 100, 160);
      rect(c, 140, 66, 92, 174, '#5b4636');
      glass(c, g, 150, 76, 72, 90);
    },
    (c, g) => {
      glass(c, g, 26, 74, 206, 166, '#6f8ba0', '#2d3944');
      awning(c, 22, 22, 214, '#2fa36b', '#f1ece2');
      rect(c, 120, 120, 6, 120, '#d9d4c8');
    },
  ],
  // industrial
  [
    (c, g) => {
      for (let x = 22; x < TILE; x += 16) rect(c, x, 0, 16, TILE, x % 32 === 6 ? '#e2e2e2' : '#c9c9c9');
      glass(c, g, 70, 60, 116, 70, '#617384', '#3a4550');
    },
    (c, g) => {
      brickRows(c, '#5a3a2a', 0.2);
      glass(c, g, 70, 70, 116, 80, '#647686', '#353f49');
    },
    (c, g) => {
      // roll-up loading door
      rect(c, 30, 30, 196, 210, '#8c949b');
      for (let y = 36; y < 236; y += 12) rect(c, 36, y, 184, 6, '#a7aeb4');
      rect(c, 26, 22, 204, 10, '#e0b23a');
      rect(c, 30, 236, 196, 6, '#2b2e31');
      void g;
    },
    (c, g) => {
      // personnel door and a small window
      rect(c, 22, 0, 234, 256, '#d4d0c8');
      rect(c, 50, 70, 70, 170, '#3d5a73');
      glass(c, g, 60, 82, 50, 50);
      glass(c, g, 150, 90, 80, 60, '#647686', '#353f49');
    },
  ],
];

const UPPER: Painter[][] = [RESIDENTIAL, OFFICE, SHOP, INDUSTRIAL];

/** Canvas top-left of a tile. flipY puts uv (0,0) at the canvas' bottom left, so tile row 0 is the bottom row. */
function tileOrigin(col: number, row: number): [number, number] {
  return [col * TILE, (ROWS - 1 - row) * TILE];
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
    c.width = TILE * COLS;
    c.height = TILE * ROWS;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, c.width, c.height);
    return { c, ctx };
  };
  const color = make('#ffffff');
  const glow = make('#000000');
  const paintAt = (paint: Painter, col: number, row: number) => {
    const [ox, oy] = tileOrigin(col, row);
    for (const t of [color.ctx, glow.ctx]) {
      t.save();
      t.translate(ox, oy);
      t.beginPath();
      t.rect(0, 0, TILE, TILE);
      t.clip();
    }
    paint(color.ctx, glow.ctx);
    // Keep the bottom-left corner plain wall colour (roofs and plain faces sample it).
    color.ctx.fillStyle = '#ffffff';
    color.ctx.fillRect(0, TILE - 20, 20, 20);
    glow.ctx.fillStyle = '#000000';
    glow.ctx.fillRect(0, TILE - 20, 20, 20);
    color.ctx.restore();
    glow.ctx.restore();
  };
  UPPER.forEach((list, style) => list.forEach((p, v) => paintAt(p, v, style)));
  GROUND.forEach((list, style) => list.forEach((p, v) => paintAt(p, v, style + 4)));
  const tex = (c: HTMLCanvasElement, srgb: boolean) => {
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    if (srgb) t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = 8;
    return t;
  };
  return { color: tex(color.c, true), glow: tex(glow.c, false) };
}

/**
 * Facade shading: picks the style's atlas tile per vertex (`aTile`: style
 * 0–3, +10 for walls standing on the ground), one of four window designs per
 * building (from its position), a ground-floor design with entrances on some
 * bays for walls that reach the ground, repeats bays with `fract` (gradients
 * from the untiled UV keep mipmapping seamless) and lights windows after
 * dark. Whether a window is lit comes from a hash of its bay and the instance
 * position compared with the building's `aLit` share, which the renderer
 * sets from occupancy and power supply.
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
float reisStyle = mod(vTile, 10.0);
vec2 reisSeed = fract(vSeed * 0.0137) * 97.0;
float reisVariant = floor(reisHash(reisSeed + reisStyle * 7.3) * 3.999);
float reisGround = step(9.5, vTile) * step(reisCell.y, 0.5);
float reisDoor = step(reisHash(vec2(reisCell.x * 1.7, 5.3) + reisSeed), 0.28);
float reisCol = mix(reisVariant, reisDoor * 2.0 + mod(reisVariant, 2.0), reisGround);
float reisRow = reisStyle + reisGround * 4.0;
vec2 reisTileSize = vec2(${(1 / COLS).toFixed(4)}, ${(1 / ROWS).toFixed(4)});
vec2 reisUv = vec2(reisCol, reisRow) * reisTileSize + (fract(vMapUv) * 0.96 + 0.02) * reisTileSize;
vec2 reisDx = dFdx(vMapUv) * reisTileSize * 0.96;
vec2 reisDy = dFdy(vMapUv) * reisTileSize * 0.96;
diffuseColor *= textureGrad(map, reisUv, reisDx, reisDy);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
float reisGlow = textureGrad(uGlowAtlas, reisUv, reisDx, reisDy).r;
// Building position folded into a small range first, so the hash stays precise.
float reisH = reisHash(reisCell + reisSeed + vTile * 3.1);
float reisOn = step(reisH, vLit) * reisGlow * uNight;
vec3 reisWarm = mix(vec3(1.0, 0.7, 0.36), vec3(0.8, 0.88, 1.0), step(0.78, fract(reisH * 17.0)));
totalEmissiveRadiance += reisWarm * reisOn * 1.7;`,
      );
  };
  mat.customProgramCacheKey = () => 'reis-facade-v4';
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
