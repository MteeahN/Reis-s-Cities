import { CELL_SIZE } from '../../core/config';
import type { BuildingPart } from '../../data/buildings';
import { ARCH_STYLE_DEFS, type ArchStyle } from '../../data/styles';
import { decorate, reshapeMassing, restyleSpec, styledHouseRoof, type Block } from './styleDecor';

export type ProceduralStyle = 'house' | 'rowhouse' | 'courtyard' | 'apartment' | 'tower' | 'shop' | 'office' | 'mall' | 'hotel' | 'casino' | 'warehouse' | 'factory';

/** Compact, data-file friendly description of a zoned building's look. */
export interface ProceduralSpec {
  style: ProceduralStyle;
  /** Lot in cells: width along the road (x), depth away from it (z). Front faces +z. */
  footprint: [number, number];
  floors: number;
  wall: string;
  accent: string;
  roof: string;
  /** Lot surface: grass / paving / concrete. */
  ground: 'grass' | 'paving' | 'concrete';
  variant?: number;
}

const GROUND = { grass: '#6f9a4a', paving: '#bdb6a6', concrete: '#a29d93' };
const DOOR = '#4a3a2c';
const DARK = '#2e3338';
const GREEN = '#4f7f33';
const GREEN_DARK = '#3d6a2a';
const GLASS = '#7f9db3';
const GLASS_DARK = '#4e6a80';
const METAL = '#9a9ea3';
const METAL_DARK = '#6c7177';
const CONCRETE = '#b9b4aa';
const PATH = '#c9c1b0';
const ASPHALT = '#55585c';
const SOLAR = '#24344d';
const TRUNK = '#5a4330';
const IRON_RAIL = '#2b2e31';
const CAR_COLORS = ['#c8ccd0', '#2b2f36', '#a83232', '#2f5d9b', '#e8e6e0', '#6b6f45', '#8c8f94', '#b8862f'];
const CONTAINER_COLORS = ['#b5472f', '#2f6db5', '#3d8a4d', '#c79a2a', '#7a7f86', '#8a4f9e'];

type Parts = BuildingPart[];

const box = (parts: Parts, size: [number, number, number], pos: [number, number, number], color: string, extra: Partial<BuildingPart> = {}) =>
  parts.push({ shape: 'box', size, pos, color, ...extra });
const cyl = (parts: Parts, d: number, h: number, pos: [number, number, number], color: string, segments = 8, extra: Partial<BuildingPart> = {}) =>
  parts.push({ shape: 'cylinder', size: [d, h, d], pos, color, segments, ...extra });

/** Deterministic 0..1 value for feature `k` of variant `v` (looks stay stable per variant). */
function hash(v: number, k: number): number {
  let x = Math.imul(v + 1, 0x9e3779b1) ^ Math.imul(k + 7, 0x85ebca6b);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
}

function tree(parts: Parts, x: number, z: number, size = 1, conifer = false): void {
  cyl(parts, 0.35 * size, 1.6 * size, [x, 0.1, z], TRUNK, 6);
  if (conifer) parts.push({ shape: 'cone', size: [2 * size, 3.6 * size, 2 * size], pos: [x, 1.2 * size, z], color: GREEN_DARK, segments: 7 });
  else parts.push({ shape: 'dome', size: [2.4 * size, 1.6 * size, 2.4 * size], pos: [x, 1.4 * size, z], color: GREEN, segments: 8 });
}

/** A parked car facing along x (rot 90 → along z). */
function car(parts: Parts, x: number, z: number, color: string, alongZ = false, y = 0): void {
  const rot: [number, number, number] | undefined = alongZ ? [0, 90, 0] : undefined;
  box(parts, [4.2, 0.75, 1.8], [x, y + 0.35, z], color, { rot });
  box(parts, [2.2, 0.6, 1.6], [x, y + 1.1, z], DARK, { rot });
}

function truck(parts: Parts, x: number, z: number, trailer: string, alongZ = false): void {
  const rot: [number, number, number] | undefined = alongZ ? [0, 90, 0] : undefined;
  const o = (d: number): [number, number] => (alongZ ? [x, z + d] : [x + d, z]);
  const [cx, cz] = o(3.4);
  box(parts, [2.2, 2.6, 2.3], [cx, 0.3, cz], '#e4e2dc', { rot });
  const [tx, tz] = o(-1.1);
  box(parts, [6.6, 2.9, 2.4], [tx, 0.6, tz], trailer, { rot });
}

/** Low fence along the lot front with a gap for the entrance. */
function frontFence(parts: Parts, W: number, front: number, gapX: number, gap: number, color: string, h = 0.9): void {
  const left = -W / 2 + 0.3;
  const right = W / 2 - 0.3;
  const a = gapX - gap / 2;
  const b = gapX + gap / 2;
  if (a - left > 0.4) box(parts, [a - left, h, 0.12], [(left + a) / 2, 0.1, front - 0.35], color);
  if (right - b > 0.4) box(parts, [right - b, h, 0.12], [(b + right) / 2, 0.1, front - 0.35], color);
}

function rooftopUnits(parts: Parts, n: number, y: number, cx: number, cz: number, spanX: number, spanZ: number, v: number): void {
  for (let k = 0; k < n; k++) {
    const x = cx + (hash(v, 40 + k) - 0.5) * spanX;
    const z = cz + (hash(v, 60 + k) - 0.5) * spanZ;
    if (hash(v, 80 + k) < 0.5) box(parts, [1.4, 0.9, 1.1], [x, y, z], METAL);
    else cyl(parts, 1.1, 0.8, [x, y, z], METAL_DARK, 8);
  }
}

function antenna(parts: Parts, x: number, y: number, z: number, h: number): void {
  cyl(parts, 0.18, h, [x, y, z], '#c9c9c9', 5);
  box(parts, [1.2, 0.08, 0.08], [x, y + h * 0.7, z], '#c9c9c9');
}

function solarPanels(parts: Parts, x: number, y: number, z: number, w: number, d: number, tilt: number): void {
  box(parts, [w, 0.12, d], [x, y, z], SOLAR, { rot: [tilt, 0, 0] });
}

/**
 * Turns a spec into primitive parts (same format as hand-authored catalogue
 * models), so zoned buildings render through the same instanced pipeline.
 * The variant drives structure too (roof shapes, setbacks, balconies, porches,
 * rooftop equipment, yards), not only colours.
 */
export function proceduralParts(spec: ProceduralSpec, arch: ArchStyle = 'modern'): BuildingPart[] {
  const s = restyleSpec(spec, arch);
  const W = s.footprint[0] * CELL_SIZE;
  const D = s.footprint[1] * CELL_SIZE;
  const v = s.variant ?? 0;
  const parts: Parts = [{ shape: 'box', size: [W - 0.3, 0.12, D - 0.3], pos: [0, 0, 0], color: GROUND[s.ground] }];
  const front = D / 2;
  const r = (k: number) => hash(v, k);
  let block: Block | null = null;

  switch (s.style) {
    case 'house': {
      const wide = W > 8;
      const deep = D > 8;
      const bw = Math.min(W - 2.4, 6.5 + (wide ? 4 : 0));
      const bd = Math.min(D - 3.2, 6 + (deep ? 3 : 0));
      const h = s.floors * 3;
      const cz = front - 2.2 - bd / 2;
      const cx = wide ? -1.5 : 0;
      const modern = arch === 'modern' && v % 6 === 5;
      parts.push({ shape: 'box', size: [bw, h, bd], pos: [cx, 0.1, cz], color: s.wall, facade: true });
      // Plinth course.
      box(parts, [bw + 0.15, 0.45, bd + 0.15], [cx, 0.1, cz], s.accent);
      if (arch !== 'modern') {
        block = { kind: 'house', cx, cz, bw, bd, h, top: h + 0.1, floors: s.floors, floorH: 3 };
        styledHouseRoof(parts, arch, block, s, v);
      } else if (modern) {
        // Flat roof with parapet and a roof terrace.
        box(parts, [bw + 0.3, 0.5, bd + 0.3], [cx, h + 0.1, cz], '#e6e3dc');
        box(parts, [bw * 0.45, 0.9, bd * 0.4], [cx - bw * 0.2, h + 0.6, cz - bd * 0.2], s.wall);
        solarPanels(parts, cx + bw * 0.2, h + 0.7, cz, Math.min(2.4, bw * 0.4), 1.6, -18);
      } else if (v % 3 === 2) {
        parts.push({ shape: 'hip', size: [bw + 0.7, 2.2, bd + 0.7], pos: [cx, h + 0.1, cz], color: s.roof });
      } else {
        const turned = v % 2 === 1;
        // A turned ridge swaps the gable's own axes so it still covers bw × bd.
        parts.push({ shape: 'gable', size: turned ? [bd + 0.7, 2.4, bw + 0.7] : [bw + 0.7, 2.4, bd + 0.7], pos: [cx, h + 0.1, cz], color: s.roof, rot: turned ? [0, 90, 0] : undefined });
        // Dormer on the road side of two-storey houses.
        if (s.floors >= 2 && !turned && bw > 5) {
          box(parts, [1.4, 1.1, 1.2], [cx - bw * 0.15, h + 0.7, cz + bd * 0.18], s.wall);
          parts.push({ shape: 'gable', size: [1.7, 0.7, 1.5], pos: [cx - bw * 0.15, h + 1.8, cz + bd * 0.18], color: s.roof, rot: [0, 90, 0] });
        }
      }
      // Gutters / eaves line.
      box(parts, [bw + 0.5, 0.15, 0.15], [cx, h + 0.05, cz + bd / 2 + 0.3], '#d8d4cc');
      // Door and porch.
      const doorX = cx + bw * 0.2;
      box(parts, [1.1, 2.1, 0.2], [doorX, 0.1, cz + bd / 2 + 0.05], DOOR);
      if (v % 2 === 0) {
        box(parts, [2.4, 0.18, 1.5], [doorX, 2.5, cz + bd / 2 + 0.75], s.accent);
        cyl(parts, 0.16, 2.4, [doorX - 1.05, 0.1, cz + bd / 2 + 1.35], '#e8e4dc', 6);
        cyl(parts, 0.16, 2.4, [doorX + 1.05, 0.1, cz + bd / 2 + 1.35], '#e8e4dc', 6);
        box(parts, [2.4, 0.25, 1.5], [doorX, 0.1, cz + bd / 2 + 0.75], CONCRETE);
      } else {
        box(parts, [1.6, 0.12, 0.9], [doorX, 2.4, cz + bd / 2 + 0.45], s.accent);
      }
      // Path to the street.
      const pathLen = front - (cz + bd / 2) - 0.2;
      if (pathLen > 0.4) box(parts, [1.1, 0.06, pathLen], [doorX, 0.12, front - pathLen / 2 - 0.15], PATH);
      // Chimney.
      if (!modern && arch === 'modern') box(parts, [0.7, 1.8, 0.7], [cx - bw * 0.3, h + 1, cz - bd * 0.2], v % 4 === 1 ? '#8a5a44' : '#7d6b5d');
      // Solar panels on some pitched roofs.
      if (!modern && arch === 'modern' && v % 4 === 3) solarPanels(parts, cx + bw * 0.1, h + 0.9, cz - bd * 0.22, Math.min(2.6, bw * 0.45), 1.6, -26);
      // Front fence or hedge.
      if (r(1) < 0.5) frontFence(parts, W, front, doorX, 1.4, '#e8e4dc', 0.8);
      else frontFence(parts, W, front, doorX, 1.4, GREEN_DARK, 1.0);
      box(parts, [1.2, 0.8, 0.6], [-W / 2 + 1.2, 0.1, front - 1.2], GREEN);
      // Mailbox.
      box(parts, [0.35, 1.1, 0.3], [doorX + 1.1, 0.1, front - 0.6], '#3b4a5a');
      if (wide) {
        // Garage with driveway, often a car on it.
        box(parts, [3.6, 2.6, 5], [W / 2 - 2.4, 0.1, front - 4], s.accent);
        box(parts, [3.9, 0.25, 5.3], [W / 2 - 2.4, 2.7, front - 4], s.roof);
        box(parts, [2.8, 2, 0.15], [W / 2 - 2.4, 0.1, front - 1.45], '#d8d4cc');
        box(parts, [3, 0.06, 1.3], [W / 2 - 2.4, 0.12, front - 0.75], ASPHALT);
        if (r(2) < 0.7) car(parts, W / 2 - 2.4, front - 0.8, CAR_COLORS[Math.floor(r(3) * CAR_COLORS.length)]);
      }
      if (deep) {
        tree(parts, W / 2 - 2, -D / 2 + 3, 1.2);
        if (r(4) < 0.6) tree(parts, -W / 2 + 2, -D / 2 + 2.4, 0.9, r(5) < 0.4);
        // Back garden: shed or a small pool.
        if (r(6) < 0.5) {
          box(parts, [2, 2, 1.8], [cx, 0.1, -D / 2 + 1.6], '#8a6a4a');
          parts.push({ shape: 'gable', size: [2.3, 0.8, 2.1], pos: [cx, 2.1, -D / 2 + 1.6], color: s.roof });
        } else {
          box(parts, [3.4, 0.08, 2], [cx, 0.12, -D / 2 + 1.8], '#4fb3d9');
          box(parts, [3.8, 0.1, 2.4], [cx, 0.1, -D / 2 + 1.8], '#e6e1d6');
        }
      } else if (r(4) < 0.5) {
        tree(parts, -W / 2 + 1.4, -D / 2 + 1.4, 0.75);
      }
      break;
    }
    case 'apartment': {
      const bw = W - 1.8;
      const bd = D - 3;
      const fh = 3.2;
      const h = s.floors * fh;
      const cz = front - 2 - bd / 2;
      const setback = v % 3 === 1 && s.floors >= 4;
      const lower = setback ? h - fh : h;
      parts.push({ shape: 'box', size: [bw, lower, bd], pos: [0, 0.1, cz], color: s.wall, facade: true });
      if (setback) {
        // Recessed top floor with a terrace in front.
        parts.push({ shape: 'box', size: [bw * 0.8, fh, bd * 0.75], pos: [0, lower + 0.1, cz - bd * 0.1], color: s.wall, facade: true });
        box(parts, [bw + 0.2, 0.9, 0.15], [0, lower + 0.1, cz + bd / 2], s.accent);
      }
      box(parts, [bw + 0.3, 0.6, bd + 0.3], [0, h + 0.1, cz], s.accent);
      // Ground-floor plinth and floor bands.
      box(parts, [bw + 0.12, 0.6, bd + 0.12], [0, 0.1, cz], s.accent);
      if (v % 2 === 0) for (let f = 2; f < s.floors; f += 2) box(parts, [bw + 0.1, 0.18, bd + 0.1], [0, f * fh + 0.05, cz], s.accent);
      // Stair / lift housing, water tanks and AC units on the roof.
      box(parts, [Math.min(3, bw * 0.4), 2.2, 2.2], [bw * 0.2, h + 0.7, cz - bd * 0.1], '#9a958c');
      cyl(parts, 1.3, 1.4, [-bw * 0.25, h + 0.7, cz - bd * 0.25], '#d6d2ca', 10);
      if (bw > 8) cyl(parts, 1.3, 1.4, [-bw * 0.25 + 1.6, h + 0.7, cz - bd * 0.25], '#d6d2ca', 10);
      rooftopUnits(parts, 2 + (v % 3), h + 0.7, 0, cz, bw * 0.6, bd * 0.5, v);
      if (r(7) < 0.5) antenna(parts, -bw * 0.3, h + 0.7, cz + bd * 0.2, 3);
      // Entrance canopy and door.
      box(parts, [2.6, 0.25, 1.6], [0, 2.8, cz + bd / 2 + 0.8], s.accent);
      box(parts, [1.6, 2.4, 0.2], [0, 0.1, cz + bd / 2 + 0.05], DARK);
      box(parts, [2, 0.06, front - (cz + bd / 2) - 0.2], [0, 0.12, (front + cz + bd / 2) / 2], PATH);
      // Balconies with railings: every floor (v even) or every other floor.
      const step = v % 2 === 0 ? 1 : 2;
      const balW = bw > 9 ? bw * 0.8 : Math.min(2.4, bw * 0.35);
      const bal = bw > 9 ? [0] : [-bw * 0.28, bw * 0.28];
      for (let f = 1; f < (setback ? s.floors - 1 : s.floors); f += step) {
        for (const bx of bal) {
          box(parts, [balW, 0.2, 1], [bx, f * fh + 0.1, cz + bd / 2 + 0.5], s.accent);
          box(parts, [balW, 0.9, 0.08], [bx, f * fh + 0.3, cz + bd / 2 + 0.97], v % 4 < 2 ? '#d9d6cf' : GLASS);
        }
      }
      // Side yard: trees, bikes, parking.
      tree(parts, -W / 2 + 1, front - 1, 0.8);
      if (W > 8) tree(parts, W / 2 - 1, front - 1, 0.8, r(8) < 0.3);
      block = { kind: 'apartment', cx: 0, cz, bw, bd, h, top: h + 0.7, floors: s.floors, floorH: fh };
      break;
    }
    case 'tower': {
      const pw = W - 1.6;
      const pd = D - 2.6;
      const cz = front - 1.8 - pd / 2;
      const th = s.floors * 3.2;
      const facade = v % 2 ? 'office' : 'residential';
      parts.push({ shape: 'box', size: [pw, 4.4, pd], pos: [0, 0.1, cz], color: s.accent, facade: 'shop' });
      box(parts, [pw + 0.3, 0.4, pd + 0.3], [0, 4.5, cz], s.accent);
      // Tower massing: straight, two tiers or three stepped tiers.
      const tiers = 1 + (v % 3);
      let y = 4.5;
      let tw = pw * 0.72;
      let td = pd * 0.72;
      let left = th;
      for (let t = 0; t < tiers; t++) {
        const hh = t === tiers - 1 ? left : Math.round((th / tiers) * (t === 0 ? 1.2 : 1));
        left -= hh;
        parts.push({ shape: 'box', size: [tw, hh, td], pos: [0, y, cz], color: s.wall, facade });
        y += hh;
        box(parts, [tw + 0.3, 0.35, td + 0.3], [0, y, cz], s.accent);
        tw *= 0.82;
        td *= 0.82;
      }
      // Corner fins in the accent colour.
      const fw = pw * 0.72;
      const fd = pd * 0.72;
      if (v % 4 !== 3) {
        const finH = Math.round(th / tiers * 1.2);
        for (const sx of [-1, 1]) box(parts, [0.4, finH, 0.4], [(sx * fw) / 2, 4.5, cz + fd / 2], s.accent);
      }
      // Balconies on residential towers.
      if (facade === 'residential') {
        for (let f = 1; f < Math.min(s.floors, Math.round(th / tiers * 1.2 / 3.2)); f += 2) box(parts, [fw * 0.5, 0.18, 0.9], [0, 4.5 + f * 3.2, cz + fd / 2 + 0.45], '#d9d6cf');
      }
      // Crown and roof.
      box(parts, [tw + 0.2, 1.2, td + 0.2], [0, y + 0.35, cz], s.accent);
      box(parts, [tw * 0.45, 2.2, td * 0.45], [0, y + 1.55, cz], '#8d8a84');
      if (W >= 16 && D >= 16 && v % 2 === 0) {
        cyl(parts, Math.min(tw, td) * 0.7, 0.3, [0, y + 1.55, cz], '#5e6367', 16);
        box(parts, [0.4, 0.05, 2.4], [-0.6, y + 1.86, cz], '#e8e8e8');
        box(parts, [0.4, 0.05, 2.4], [0.6, y + 1.86, cz], '#e8e8e8');
        box(parts, [1.2, 0.05, 0.4], [0, y + 1.86, cz], '#e8e8e8');
      } else {
        rooftopUnits(parts, 2, y + 1.55, 0, cz, tw * 0.6, td * 0.6, v);
      }
      if (v % 2) antenna(parts, tw * 0.2, y + 3.7, cz, 6);
      // Podium entrance canopy and street trees.
      box(parts, [Math.min(6, pw * 0.5), 0.3, 1.8], [0, 3.6, cz + pd / 2 + 0.9], GLASS_DARK);
      tree(parts, -W / 2 + 1, front - 0.9, 0.7);
      tree(parts, W / 2 - 1, front - 0.9, 0.7);
      block = { kind: 'tower', cx: 0, cz, bw: tw / 0.82, bd: td / 0.82, h: y, top: y + 3.75, floors: s.floors, floorH: 3.2 };
      break;
    }
    case 'shop': {
      const bw = W - 1.2;
      const bd = D - 3.5;
      const h = s.floors * 3.6;
      const cz = front - 2.6 - bd / 2;
      if (s.floors <= 1) parts.push({ shape: 'box', size: [bw, h, bd], pos: [0, 0.1, cz], color: s.wall, facade: 'shop' });
      else {
        // Shop front on the ground floor, flats or offices above.
        parts.push({ shape: 'box', size: [bw, 3.6, bd], pos: [0, 0.1, cz], color: s.wall, facade: 'shop' });
        parts.push({ shape: 'box', size: [bw, h - 3.6, bd], pos: [0, 3.7, cz], color: s.wall, facade: 'residential' });
        box(parts, [bw + 0.15, 0.25, bd + 0.15], [0, 3.6, cz], s.accent);
        // Bay windows / small balconies above the shop.
        if (v % 2 === 1) for (const bx of [-bw * 0.28, bw * 0.28]) box(parts, [1.8, 1.6, 0.6], [bx, 4.6, cz + bd / 2 + 0.3], s.wall);
      }
      box(parts, [bw + 0.2, 0.5, bd + 0.2], [0, h + 0.1, cz], '#d6d0c4');
      // Awning: sloped canopy (v even) or a flat one with a fascia.
      if (v % 2 === 0) box(parts, [bw * 0.92, 0.25, 1.8], [0, 2.9, cz + bd / 2 + 0.9], s.accent, { rot: [8, 0, 0] });
      else {
        box(parts, [bw * 0.95, 0.2, 1.4], [0, 3.0, cz + bd / 2 + 0.7], s.accent);
        box(parts, [bw * 0.95, 0.5, 0.1], [0, 2.7, cz + bd / 2 + 1.4], s.accent);
      }
      box(parts, [bw * 0.7, 2.3, 0.15], [0, 0.1, cz + bd / 2 + 0.05], GLASS);
      // Sign board on the roof edge.
      box(parts, [bw * 0.6, 1.1, 0.3], [0, h + 0.6, cz + bd / 2 - 0.2], s.accent);
      box(parts, [bw * 0.5, 0.6, 0.05], [0, h + 0.85, cz + bd / 2 - 0.02], '#f4f1ea');
      rooftopUnits(parts, 1 + (v % 3), h + 0.6, 0, cz - bd * 0.15, bw * 0.6, bd * 0.4, v);
      // Street furniture: café tables, planters, bike rack.
      const sz = front - 0.9;
      if (v % 3 === 0) {
        for (const tx of [-bw * 0.3, 0, bw * 0.3]) {
          cyl(parts, 0.9, 0.75, [tx, 0.1, sz], '#f0ede6', 8);
          parts.push({ shape: 'cone', size: [1.8, 0.7, 1.8], pos: [tx, 2.0, sz], color: s.accent, segments: 8 });
          cyl(parts, 0.08, 1.9, [tx, 0.1, sz], '#d0ccc4', 4);
        }
      } else {
        for (const px of [-bw * 0.4, bw * 0.4]) {
          box(parts, [0.9, 0.6, 0.9], [px, 0.1, sz], CONCRETE);
          parts.push({ shape: 'dome', size: [0.9, 0.5, 0.9], pos: [px, 0.7, sz], color: GREEN, segments: 6 });
        }
        if (v % 3 === 1) box(parts, [1.6, 0.8, 0.1], [0, 0.1, sz], METAL_DARK);
      }
      // Waste bins at the side.
      box(parts, [0.8, 1.1, 0.7], [-W / 2 + 0.6, 0.1, front - 2.2], '#3c6b45');
      block = { kind: 'shop', cx: 0, cz, bw, bd, h, top: h + 0.6, floors: s.floors, floorH: 3.6 };
      break;
    }
    case 'office': {
      const bw = W - 2;
      const bd = D - 3;
      const h = s.floors * 3.4;
      const cz = front - 2 - bd / 2;
      const glassy = v % 3 === 2;
      parts.push({ shape: 'box', size: [bw, h, bd], pos: [0, 0.1, cz], color: glassy ? GLASS : s.wall, facade: 'office' });
      // Upper setback block or a slim crown.
      if (v % 2 === 0) {
        parts.push({ shape: 'box', size: [bw * 0.75, h * 0.25, bd * 0.75], pos: [0, h + 0.1, cz], color: s.wall, facade: 'office' });
        box(parts, [bw * 0.75 + 0.3, 0.8, bd * 0.75 + 0.3], [0, h * 1.25 + 0.1, cz], s.accent);
        rooftopUnits(parts, 2, h * 1.25 + 0.9, 0, cz, bw * 0.4, bd * 0.4, v);
      } else {
        box(parts, [bw + 0.3, 1.2, bd + 0.3], [0, h + 0.1, cz], s.accent);
        box(parts, [bw * 0.5, 2.4, bd * 0.5], [0, h + 1.3, cz], '#8d8a84');
        rooftopUnits(parts, 3, h + 1.3, 0, cz, bw * 0.7, bd * 0.6, v);
      }
      // Vertical fins across the front.
      if (!glassy) {
        const fins = Math.max(2, Math.floor(bw / 3));
        for (let k = 0; k <= fins; k++) box(parts, [0.3, h - 4, 0.5], [-bw / 2 + (bw / fins) * k, 4.1, cz + bd / 2 + 0.25], s.accent);
      }
      // Glass lobby, plaza, flag poles, trees.
      box(parts, [4, 3.6, 2], [0, 0.1, cz + bd / 2 + 1], GLASS_DARK);
      box(parts, [4.6, 0.3, 2.4], [0, 3.7, cz + bd / 2 + 1.1], s.accent);
      box(parts, [W - 1.2, 0.06, front - (cz + bd / 2) - 0.3], [0, 0.12, (front + cz + bd / 2) / 2 + 0.1], PATH);
      if (v % 3 !== 1) for (let k = 0; k < 3; k++) cyl(parts, 0.1, 6, [-bw / 2 + 1 + k * 0.9, 0.1, front - 0.6], '#d8d8d8', 4);
      tree(parts, bw / 2 - 0.4, front - 0.9, 0.75);
      block = { kind: 'office', cx: 0, cz, bw: v % 2 === 0 ? bw * 0.75 : bw, bd: v % 2 === 0 ? bd * 0.75 : bd, h, top: v % 2 === 0 ? h * 1.25 + 0.9 : h + 1.3, floors: s.floors, floorH: 3.4 };
      break;
    }
    case 'rowhouse': {
      // Terraced houses: narrow attached units, each with its own colour, door and roof.
      const units = Math.max(2, Math.floor((W - 1) / 5.2));
      const uw = (W - 1) / units;
      const bd = Math.min(D - 4, 9);
      const h = s.floors * 3;
      const cz = front - 2.6 - bd / 2;
      const walls = arch === 'modern' ? PALETTES.house.wall : ARCH_STYLE_DEFS[arch].walls;
      for (let u = 0; u < units; u++) {
        const ux = -W / 2 + 0.5 + uw * (u + 0.5);
        const wall = u === 0 ? s.wall : walls[Math.floor(hash(v + u * 17, 90) * walls.length)];
        const tall = h + (u % 2 === 1 && v % 2 === 0 ? 0.6 : 0);
        parts.push({ shape: 'box', size: [uw - 0.05, tall, bd], pos: [ux, 0.1, cz], color: wall, facade: true });
        box(parts, [uw, 0.4, bd + 0.1], [ux, 0.1, cz], s.accent);
        const ublock: Block = { kind: 'house', cx: ux, cz, bw: uw - 0.05, bd, h: tall, top: tall + 0.1, floors: s.floors, floorH: 3 };
        if (arch !== 'modern') styledHouseRoof(parts, arch, ublock, s, v + u);
        else if (v % 3 === 2) box(parts, [uw, 0.5, bd + 0.2], [ux, tall + 0.1, cz], '#e6e3dc');
        else parts.push({ shape: 'gable', size: [uw + 0.02, 2.2, bd + 0.6], pos: [ux, tall + 0.1, cz], color: s.roof });
        // Door with a step, a bay window on alternate units, a small front garden.
        const dx = ux + uw * 0.25 * (u % 2 ? 1 : -1);
        box(parts, [1.0, 2.1, 0.2], [dx, 0.1, cz + bd / 2 + 0.05], DOOR);
        box(parts, [1.4, 0.25, 0.8], [dx, 0.1, cz + bd / 2 + 0.4], CONCRETE);
        if (u % 2 === 0 && s.floors >= 2) box(parts, [1.6, 2.4, 0.7], [ux - uw * 0.2 * (u % 2 ? 1 : -1), 0.5, cz + bd / 2 + 0.35], wall);
        box(parts, [uw - 1.6, 0.5, 1.4], [ux - (dx - ux) * 0.6, 0.1, front - 1.1], GREEN);
        if (arch === 'modern' && v % 3 !== 2) box(parts, [0.6, 1.4, 0.6], [ux + uw * 0.35, tall + 1.2, cz - bd * 0.15], '#7d6b5d');
      }
      frontFence(parts, W, front, 0, 0.1, v % 2 ? '#e8e4dc' : IRON_RAIL, 0.9);
      if (D > 12) for (let u = 0; u < units; u += 2) tree(parts, -W / 2 + 0.5 + uw * (u + 0.5), -D / 2 + 2.2, 0.9);
      block = { kind: 'house', cx: 0, cz, bw: W - 1, bd, h, top: h + 0.1, floors: s.floors, floorH: 3 };
      break;
    }
    case 'courtyard': {
      // Perimeter block: four wings around a green inner court, entered through an archway.
      const bw = W - 1.6;
      const bd = D - 2.4;
      const wd = Math.min(5, bw * 0.3);
      const fh = 3.2;
      const h = s.floors * fh;
      const cz = front - 1.6 - bd / 2;
      const gate = 3.2;
      const fz = cz + bd / 2 - wd / 2;
      // Front wing in two halves with the gate between, a lintel above it.
      const half = (bw - gate) / 2;
      for (const sx of [-1, 1]) parts.push({ shape: 'box', size: [half, h, wd], pos: [sx * (gate / 2 + half / 2), 0.1, fz], color: s.wall, facade: true });
      parts.push({ shape: 'box', size: [gate, h - 4.2, wd], pos: [0, 4.3, fz], color: s.wall, facade: true });
      box(parts, [gate + 0.4, 0.5, 0.3], [0, 4.0, cz + bd / 2 + 0.1], s.accent);
      // Back and side wings.
      parts.push({ shape: 'box', size: [bw, h, wd], pos: [0, 0.1, cz - bd / 2 + wd / 2], color: s.wall, facade: true });
      for (const sx of [-1, 1]) parts.push({ shape: 'box', size: [wd, h, bd - wd * 2], pos: [sx * (bw / 2 - wd / 2), 0.1, cz], color: s.wall, facade: true });
      // Plinth and cornice all round.
      box(parts, [bw + 0.15, 0.7, 0.2], [0, 0.1, cz + bd / 2 + 0.02], s.accent);
      const roofY = h + 0.1;
      if (arch === 'modern') {
        for (const [w, d, x, z] of [
          [bw + 0.3, wd + 0.3, 0, fz],
          [bw + 0.3, wd + 0.3, 0, cz - bd / 2 + wd / 2],
          [wd + 0.3, bd - wd * 2, -(bw / 2 - wd / 2), cz],
          [wd + 0.3, bd - wd * 2, bw / 2 - wd / 2, cz],
        ] as const) box(parts, [w, 0.6, d], [x, roofY, z], s.accent);
        rooftopUnits(parts, 2, roofY + 0.6, 0, cz - bd / 2 + wd / 2, bw * 0.6, 1, v);
      } else {
        // Pitched roofs on every wing (ridge along the wing).
        parts.push({ shape: 'gable', size: [bw + 0.4, 2.4, wd + 0.8], pos: [0, roofY, fz], color: s.roof });
        parts.push({ shape: 'gable', size: [bw + 0.4, 2.4, wd + 0.8], pos: [0, roofY, cz - bd / 2 + wd / 2], color: s.roof });
        for (const sx of [-1, 1]) parts.push({ shape: 'gable', size: [bd - wd * 2, 2.4, wd + 0.8], pos: [sx * (bw / 2 - wd / 2), roofY, cz], color: s.roof, rot: [0, 90, 0] });
      }
      // Inner court: lawn, a tree, benches, a play area on some variants.
      box(parts, [bw - wd * 2 - 0.4, 0.06, bd - wd * 2 - 0.4], [0, 0.12, cz], '#7aa85a');
      tree(parts, 0, cz - 0.5, 1.1);
      if (v % 2 === 0) box(parts, [2.2, 0.3, 2.2], [-(bw / 2 - wd) + 1.6, 0.14, cz + 1.5], '#d9c38a');
      for (const sx of [-1, 1]) box(parts, [1.4, 0.45, 0.45], [sx * 1.8, 0.14, cz + 1.8], '#7a5a3c');
      // Street trees in front.
      tree(parts, -W / 2 + 1, front - 0.6, 0.7);
      tree(parts, W / 2 - 1, front - 0.6, 0.7);
      block = { kind: 'house', cx: 0, cz: fz, bw, bd: wd, h, top: h + 0.1, floors: s.floors, floorH: fh };
      break;
    }
    case 'mall': {
      const bw = W - 1.4;
      const bd = D - 4;
      const h = s.floors * 4.5;
      const cz = front - 3 - bd / 2;
      parts.push({ shape: 'box', size: [bw, h, bd], pos: [0, 0.1, cz], color: s.wall, facade: 'shop' });
      box(parts, [bw + 0.4, 0.8, bd + 0.4], [0, h + 0.1, cz], s.accent);
      // Atrium entrance with a big sign.
      box(parts, [6, h + 1.5, 3], [0, 0.1, cz + bd / 2 + 1.2], GLASS);
      box(parts, [7, 1.4, 0.4], [0, h + 1, cz + bd / 2 + 2.6], s.accent);
      box(parts, [6, 0.8, 0.05], [0, h + 1.3, cz + bd / 2 + 2.82], '#f4f1ea');
      // Side entrances.
      for (const sx of [-1, 1]) box(parts, [3, 3.2, 1.6], [sx * bw * 0.36, 0.1, cz + bd / 2 + 0.8], GLASS_DARK);
      // Roof: plant rooms and skylights (or a roof car park).
      box(parts, [3, 1.6, 3], [-bw * 0.25, h + 0.9, cz - bd * 0.2], '#8f8b84');
      box(parts, [3, 1.6, 3], [bw * 0.25, h + 0.9, cz - bd * 0.2], '#8f8b84');
      if (v % 2 === 0) {
        for (const sx of [-0.25, 0, 0.25]) parts.push({ shape: 'pyramid', size: [2.6, 1.2, 2.6], pos: [bw * sx, h + 0.9, cz + bd * 0.15], color: GLASS });
      } else {
        for (let k = 0; k < 5; k++) car(parts, -bw * 0.35 + (bw * 0.7 * k) / 4, cz + bd * 0.15, CAR_COLORS[Math.floor(r(50 + k) * CAR_COLORS.length)], true, h + 0.9);
      }
      rooftopUnits(parts, 3, h + 0.9, 0, cz - bd * 0.3, bw * 0.6, bd * 0.2, v);
      // Front plaza: trees and lamp posts.
      for (const sx of [-0.4, -0.15, 0.15, 0.4]) tree(parts, bw * sx, front - 1, 0.7);
      block = { kind: 'mall', cx: 0, cz, bw, bd, h, top: h + 0.9, floors: s.floors, floorH: 4.5 };
      break;
    }
    case 'hotel': {
      // Two-storey podium (lobby, restaurants) with a slim guest-room tower set back on it.
      const pw = W - 1.4;
      const pd = D - 4.2;
      const cz = front - 3.2 - pd / 2;
      const podH = 7.2;
      parts.push({ shape: 'box', size: [pw, podH, pd], pos: [0, 0.1, cz], color: s.wall, facade: 'shop' });
      box(parts, [pw + 0.4, 0.45, pd + 0.4], [0, podH + 0.1, cz], s.accent);
      const wide = W > 10;
      const tw = pw * (wide ? 0.6 : 0.8);
      const td = Math.min(pd * 0.55, 7);
      const tcz = cz - pd * 0.1;
      const fh = 3.1;
      const th = s.floors * fh;
      const y0 = podH + 0.55;
      parts.push({ shape: 'box', size: [tw, th, td], pos: [0, y0, tcz], color: s.wall, facade: 'residential' });
      const rounded = wide && v % 2 === 0;
      if (rounded) {
        // Rounded glass ends.
        for (const sx of [-1, 1]) cyl(parts, td, th, [(sx * tw) / 2, y0, tcz], GLASS, 16);
      } else {
        // A full-height accent spine on the front.
        box(parts, [1.4, th + 1.2, 0.6], [0, y0, tcz + td / 2 + 0.3], s.accent);
      }
      if (wide || v % 2 === 1) {
        // Balcony bands every other floor.
        for (let f = 1; f < s.floors; f += 2) box(parts, [tw * 0.86, 0.16, 0.8], [0, y0 + f * fh, tcz + td / 2 + 0.4], '#ebe7de');
      } else {
        // Bay windows stacked up the front, either side of the spine.
        for (const sx of [-1, 1]) box(parts, [tw * 0.28, th - 1, 0.7], [sx * tw * 0.3, y0 + 0.5, tcz + td / 2 + 0.35], GLASS_DARK);
      }
      let top = y0 + th;
      if (v % 3 === 1) {
        // Set-back penthouse floors.
        parts.push({ shape: 'box', size: [tw * 0.7, fh * 2, td * 0.75], pos: [0, top, tcz], color: s.wall, facade: 'residential' });
        box(parts, [tw * 0.7 + 0.3, 0.3, td * 0.75 + 0.3], [0, top + fh * 2, tcz], s.accent);
        top += fh * 2 + 0.3;
      }
      // Crown: a lit hotel sign, then a rooftop pool or a helipad.
      box(parts, [tw + (rounded ? td : 0) + 0.3, 1.4, td + 0.3], [0, top, tcz], s.accent);
      box(parts, [tw * 0.62, 1.8, 0.3], [0, top + 1.4, tcz + td / 2 - 0.1], s.accent);
      box(parts, [tw * 0.54, 1.1, 0.06], [0, top + 1.75, tcz + td / 2 + 0.07], '#fff1c9');
      if (wide && v % 3 === 0) {
        cyl(parts, Math.min(tw, td) * 0.9, 0.3, [0, top + 1.4, tcz - 0.4], '#5e6367', 16);
        box(parts, [0.4, 0.05, 2.4], [-0.6, top + 1.72, tcz - 0.4], '#e8e8e8');
        box(parts, [0.4, 0.05, 2.4], [0.6, top + 1.72, tcz - 0.4], '#e8e8e8');
        box(parts, [1.2, 0.05, 0.4], [0, top + 1.72, tcz - 0.4], '#e8e8e8');
      } else {
        box(parts, [tw * 0.6, 0.3, td * 0.45], [0, top + 1.4, tcz - td * 0.15], '#4fb3d9');
        for (let k = 0; k < 3; k++) box(parts, [0.6, 0.25, 1.6], [-tw * 0.25 + k * tw * 0.25, top + 1.4, tcz + td * 0.25], '#f2efe8');
      }
      // Porte-cochère over the drop-off, glass doors, flags and planters.
      const ccz = cz + pd / 2 + 1.5;
      box(parts, [Math.min(9, pw * 0.62), 0.4, 3.2], [0, 4.0, ccz], s.accent);
      for (const sx of [-1, 1]) cyl(parts, 0.45, 3.9, [sx * Math.min(4, pw * 0.27), 0.1, ccz + 1.1], '#ebe7de', 10);
      box(parts, [3.2, 3, 0.2], [0, 0.1, cz + pd / 2 + 0.1], GLASS_DARK);
      box(parts, [W - 1.2, 0.06, 3.1], [0, 0.12, front - 1.6], PATH);
      const flagColors = ['#c0392b', '#2f6db5', '#e0a321'];
      for (let k = 0; k < 3; k++) {
        const fx = -pw / 2 + 0.6 + k * 0.9;
        cyl(parts, 0.1, 7, [fx, 0.1, front - 0.5], '#d8d8d8', 4);
        box(parts, [0.06, 1.0, 1.4], [fx, 5.8, front - 1.25], flagColors[(v + k) % 3]);
      }
      tree(parts, pw / 2 - 0.6, front - 0.8, 0.7);
      break;
    }
    case 'casino': {
      // A wide, gilded gaming hall with a domed entrance and a hotel tower behind it.
      const pw = W - 1.2;
      const pd = D - 5;
      const cz = front - 3.6 - pd / 2;
      const podH = 8;
      const gold = '#d4af37';
      parts.push({ shape: 'box', size: [pw, podH, pd], pos: [0, 0.1, cz], color: s.wall, facade: 'shop' });
      box(parts, [pw + 0.3, 0.55, pd + 0.3], [0, podH, cz], gold);
      box(parts, [pw + 0.3, 0.3, pd + 0.3], [0, 3.8, cz], gold);
      // Hotel tower at the back of the lot.
      const tw = pw * 0.56;
      const td = Math.min(pd * 0.48, 6.5);
      const tcz = cz - pd / 2 + td / 2 + 0.6;
      const fh = 3.1;
      const th = s.floors * fh;
      const y0 = podH + 0.55;
      parts.push({ shape: 'box', size: [tw, th, td], pos: [0, y0, tcz], color: v % 2 ? GLASS : s.wall, facade: v % 2 ? 'office' : 'residential' });
      for (const sx of [-1, 1]) box(parts, [0.35, th + 2, 0.35], [(sx * tw) / 2, y0, tcz + td / 2], s.accent);
      box(parts, [tw + 0.3, 0.8, td + 0.3], [0, y0 + th, tcz], gold);
      // Crown: a gilded pyramid, a glass dome or stepped lanterns.
      const crown = y0 + th + 0.8;
      if (v % 3 === 0) parts.push({ shape: 'pyramid', size: [tw * 0.8, 4.5, td * 0.8], pos: [0, crown, tcz], color: gold });
      else if (v % 3 === 1) parts.push({ shape: 'dome', size: [Math.min(tw, td) * 0.9, 3.2, Math.min(tw, td) * 0.9], pos: [0, crown, tcz], color: '#bfe3ee', segments: 18 });
      else {
        box(parts, [tw * 0.7, 2.4, td * 0.7], [0, crown, tcz], s.accent);
        box(parts, [tw * 0.4, 2.4, td * 0.4], [0, crown + 2.4, tcz], gold);
        cyl(parts, 0.25, 4, [0, crown + 4.8, tcz], gold, 6);
      }
      const ez = cz + pd / 2 - 3.2;
      if (v % 2 === 0) {
        // Domed entrance on a drum, with a spire.
        cyl(parts, 6.2, 2.2, [0, podH + 0.5, ez], s.wall, 20);
        parts.push({ shape: 'dome', size: [6, 3.4, 6], pos: [0, podH + 2.7, ez], color: gold, segments: 20 });
        cyl(parts, 0.2, 2.6, [0, podH + 6, ez], gold, 6);
      } else {
        // A tall illuminated fascia over the entrance.
        box(parts, [pw * 0.6, 4, 0.6], [0, podH + 0.5, cz + pd / 2 - 0.3], s.accent);
        box(parts, [pw * 0.52, 2.6, 0.08], [0, podH + 1.2, cz + pd / 2 + 0.02], '#ffe27a');
      }
      // Arched glass portal and a row of marquee bulbs along the front.
      box(parts, [6, 5, 1.2], [0, 0.1, cz + pd / 2 + 0.6], GLASS_DARK);
      cyl(parts, 6, 1.2, [0, 5.1, cz + pd / 2 + 0.6], s.accent, 16, { rot: [90, 0, 0] });
      const bulbs = Math.floor(pw / 1.1);
      for (let k = 0; k <= bulbs; k++) cyl(parts, 0.32, 0.32, [-pw / 2 + (pw * k) / bulbs, podH + 0.55, cz + pd / 2 + 0.2], '#fff1a8', 6);
      // Lit sign on posts by the road.
      const mx = pw * 0.3;
      for (const sx of [-1, 1]) cyl(parts, 0.35, 5, [mx + sx * 2.4, 0.1, front - 0.9], IRON_RAIL, 8);
      box(parts, [5.6, 2.2, 0.5], [mx, 5, front - 0.9], s.accent);
      box(parts, [5, 1.6, 0.08], [mx, 5.3, front - 0.62], '#ffe27a');
      // Forecourt fountain and palms.
      const fx = -pw * 0.3;
      cyl(parts, 3.2, 0.5, [fx, 0.1, front - 1.9], '#cfcac0', 16);
      cyl(parts, 2.7, 0.15, [fx, 0.6, front - 1.9], '#6fb7d9', 16);
      cyl(parts, 0.3, 1.8, [fx, 0.6, front - 1.9], '#cfcac0', 8);
      for (const px of [-pw / 2 + 0.6, pw / 2 - 0.6]) {
        cyl(parts, 0.3, 4.2, [px, 0.1, front - 0.7], '#8a6a48', 6);
        for (let k = 0; k < 5; k++) box(parts, [2.2, 0.12, 0.5], [px, 4.2, front - 0.7], GREEN, { rot: [0, k * 36, -18] });
      }
      break;
    }
    case 'warehouse': {
      const bw = W - 2;
      const bd = D - 4;
      const h = 4 + s.floors * 1.6;
      const cz = front - 3 - bd / 2;
      parts.push({ shape: 'box', size: [bw, h, bd], pos: [0, 0.1, cz], color: s.wall, facade: 'industrial' });
      if (v % 3 === 1) {
        // Barrel / sawtooth roof as a row of small gables.
        const n = Math.max(2, Math.round(bw / 4));
        for (let k = 0; k < n; k++) parts.push({ shape: 'gable', size: [bw / n + 0.05, 1.3, bd + 0.4], pos: [-bw / 2 + (bw / n) * (k + 0.5), h + 0.1, cz], color: s.roof });
      } else {
        parts.push({ shape: 'gable', size: [bd + 0.4, 1.6, bw + 0.4], pos: [0, h + 0.1, cz], color: s.roof, rot: [0, 90, 0] });
      }
      // Roof vents.
      for (let k = 0; k < 2 + (v % 2); k++) cyl(parts, 0.7, 0.9, [-bw * 0.3 + k * (bw * 0.3), h + 1.2, cz], METAL, 8);
      // Loading docks with a canopy.
      const doors = Math.max(1, Math.floor(bw / 5));
      for (let k = 0; k < doors; k++) {
        const x = -bw / 2 + (bw / doors) * (k + 0.5);
        box(parts, [3, 3.4, 0.2], [x, 0.1, cz + bd / 2 + 0.05], '#6f7479');
        box(parts, [3.4, 1.0, 1.0], [x, 0.1, cz + bd / 2 + 0.5], CONCRETE);
      }
      box(parts, [bw, 0.2, 2], [0, 3.8, cz + bd / 2 + 1], METAL_DARK);
      box(parts, [bw, 0.15, 2.6], [0, 0.1, cz + bd / 2 + 1.3], GROUND.concrete);
      // Yard: a truck (wide lots) or pallets.
      if (r(11) < 0.6 && W >= 16) truck(parts, bw * 0.15, front - 1.3, CONTAINER_COLORS[Math.floor(r(12) * CONTAINER_COLORS.length)]);
      else {
        for (let k = 0; k < 3; k++) box(parts, [1.2, 0.9 + (k % 2) * 0.5, 1.2], [W / 2 - 1.2 - k * 1.4, 0.1, front - 1], '#a08560');
      }
      // Chain-link fence along the sides.
      box(parts, [0.08, 1.8, D - 1], [-W / 2 + 0.3, 0.1, 0], '#8a9096');
      box(parts, [0.08, 1.8, D - 1], [W / 2 - 0.3, 0.1, 0], '#8a9096');
      block = { kind: 'warehouse', cx: 0, cz, bw, bd, h, top: h + 1.7, floors: 1, floorH: h };
      break;
    }
    case 'factory': {
      const bw = W - 2;
      const bd = D - 3.5;
      const h = 5 + s.floors * 1.8;
      const cz = front - 2.5 - bd / 2;
      parts.push({ shape: 'box', size: [bw * 0.7, h, bd], pos: [-bw * 0.15, 0.1, cz], color: s.wall, facade: 'industrial' });
      if (v % 2 === 1) {
        // Sawtooth roof lights.
        const n = Math.max(2, Math.round(bd / 3.5));
        for (let k = 0; k < n; k++) parts.push({ shape: 'box', size: [bw * 0.7, 1.4, 0.15], pos: [-bw * 0.15, h + 0.1, cz - bd / 2 + (bd / n) * (k + 0.5)], color: GLASS, rot: [-35, 0, 0] });
        box(parts, [bw * 0.7 + 0.3, 0.3, bd + 0.3], [-bw * 0.15, h + 0.1, cz], s.roof);
      } else {
        box(parts, [bw * 0.7 + 0.3, 0.6, bd + 0.3], [-bw * 0.15, h + 0.1, cz], s.roof);
      }
      parts.push({ shape: 'box', size: [bw * 0.3, h * 0.6, bd * 0.45], pos: [bw * 0.35, 0.1, cz + bd * 0.25], color: s.accent, facade: 'office' });
      const stacks = s.floors >= 3 ? 2 : 1;
      for (let k = 0; k < stacks; k++) {
        const sx = -bw * 0.35 + k * 3;
        cyl(parts, 1.4, h + 9 + k * 3, [sx, 0.1, cz - bd * 0.25], '#8a7f75', 10);
        cyl(parts, 1.6, 0.8, [sx, h + 8.4 + k * 3, cz - bd * 0.25], '#b5472f', 10);
        cyl(parts, 1.55, 0.4, [sx, h + 6 + k * 3, cz - bd * 0.25], '#e8e4dc', 10);
      }
      // Tanks / silos and the pipe bridge between them and the hall.
      const silos = D >= 16 ? 2 : v % 3 === 0 ? 1 : 0;
      const sd = Math.min(3.2, bw * 0.28);
      const sx = bw * 0.36;
      for (let k = 0; k < silos; k++) {
        const sz = cz - bd * 0.38 + k * (sd + 0.4);
        const sh = 5 + (k % 2) * 2;
        cyl(parts, sd, sh, [sx, 0.1, sz], '#c9c4ba', 14);
        parts.push({ shape: 'dome', size: [sd, 0.8, sd], pos: [sx, sh + 0.1, sz], color: '#c9c4ba', segments: 12 });
      }
      // Pipe bridge from the hall to the silos.
      if (silos > 0) cyl(parts, 0.45, bw * 0.3, [bw * 0.2, 4.2, cz - bd * 0.38], METAL_DARK, 6, { rot: [0, 0, 90] });
      // Rooftop ducts and fans.
      rooftopUnits(parts, 2 + (v % 3), h + 0.7, -bw * 0.15, cz, bw * 0.5, bd * 0.6, v);
      // A truck at the gate on wide lots.
      if (W >= 16 && r(17) < 0.6) truck(parts, -bw * 0.1, front - 1.2, CONTAINER_COLORS[Math.floor(r(14) * CONTAINER_COLORS.length)]);
      // Perimeter fence.
      box(parts, [W - 0.6, 2, 0.08], [0, 0.1, -D / 2 + 0.3], '#8a9096');
      box(parts, [0.08, 2, D - 1], [-W / 2 + 0.3, 0.1, 0], '#8a9096');
      block = { kind: 'factory', cx: -bw * 0.15, cz, bw: bw * 0.7, bd, h, top: h + 0.7, floors: 1, floorH: h };
      break;
    }
  }
  if (block) decorate(parts, arch, reshapeMassing(parts, arch, block, s, v), s, v);
  return parts;
}

/** Colour palettes that growable variants rotate through (data, not engine logic). */
const PALETTES: Record<ProceduralStyle, { wall: string[]; roof: string[]; accent: string[] }> = {
  house: {
    wall: ['#efe3cf', '#e5d2bd', '#dbe5ea', '#f2eee6', '#e7cec3', '#d9d0b8', '#cfdcc8', '#e9dcc6', '#c9c3bb', '#f0d9b8'],
    roof: ['#9c4a3a', '#6b4f3f', '#5c6b7a', '#8a5a44', '#7a3b30', '#4f5a60', '#3f4448', '#a05a3c'],
    accent: ['#a89f92', '#9a8f80', '#b0a493', '#8c7b6b', '#c2b8a8'],
  },
  rowhouse: {
    wall: ['#e3b49a', '#efe3c4', '#d9b38c', '#c98a6a', '#e8d8c8', '#b9704f', '#efe9dc'],
    roof: ['#6b4f3f', '#5c6b7a', '#8a5a44', '#3f4448', '#9c4a3a'],
    accent: ['#efe9dc', '#a89f92', '#8c7b6b'],
  },
  courtyard: {
    wall: ['#e8d8c8', '#d8c3a8', '#c98a6a', '#e3e0d8', '#cfd6cf', '#b9704f'],
    roof: ['#6b4f3f', '#5c6b7a', '#3f4448', '#8a5a44'],
    accent: ['#b3aa9c', '#9c8574', '#7d8a7a', '#efe9dc'],
  },
  apartment: {
    wall: ['#efe3cf', '#e5d2bd', '#dbe5ea', '#f2eee6', '#e7cec3', '#cfd6cf', '#d8c3a8', '#c9cfd6', '#e8d8c8'],
    roof: ['#777'],
    accent: ['#b3aa9c', '#a39a8c', '#8f9aa3', '#9c8574', '#7d8a7a', '#b07a5e'],
  },
  tower: { wall: ['#e9edf0', '#dfe6ea', '#eef1f3', '#e6e2da', '#d8dee3', '#c7d3dc'], roof: ['#777'], accent: ['#5f6b75', '#4d5a64', '#3f4b55', '#6b5f55', '#7a6a58', '#2f3a44'] },
  shop: { wall: ['#efe7da', '#e6e1d8', '#f1ece2', '#e9dccb', '#dde3e6', '#e2d1bd', '#d6dccd'], roof: ['#777'], accent: ['#d9483b', '#2f7dd1', '#e0a321', '#2fa36b', '#8a4fc2', '#e06a2b', '#1f8f8f'] },
  office: { wall: ['#cfdbe4', '#b9cfdd', '#aac4d6', '#c9d2cf', '#d6d2c8', '#b8c2c9'], roof: ['#777'], accent: ['#5b6770', '#44515b', '#3d4a54', '#6b5f55', '#2f3a44'] },
  hotel: { wall: ['#f2efe8', '#e9e2d4', '#e3e8ec', '#efe6d8', '#dfe3e0'], roof: ['#777'], accent: ['#7a2a2a', '#2f4a5a', '#3f4448', '#8a6a3c', '#2f5a4a'] },
  casino: { wall: ['#f4ead8', '#efe2c8', '#e8e0f0', '#f2e6e0'], roof: ['#777'], accent: ['#b3261e', '#6a2a8a', '#1f5f8f', '#a0522d'] },
  mall: { wall: ['#e8e2d6', '#e1e6ea', '#ece4d4', '#dcd6cc'], roof: ['#777'], accent: ['#d9483b', '#2f7dd1', '#2fa36b', '#e0a321'] },
  warehouse: { wall: ['#b8b3a7', '#a3a8ad', '#c4b49a', '#9fa79b', '#c7c2b6', '#8f9aa6'], roof: ['#6d7378', '#5f666c', '#7a6e5e', '#5a6a72', '#4f6b5a', '#7d4e3c'], accent: ['#777'] },
  factory: { wall: ['#b8b3a7', '#a3a8ad', '#c4b49a', '#c9cdd1', '#a8a294', '#b5bcc2'], roof: ['#6b6f73', '#5a5f64', '#6f655a', '#4f5a52'], accent: ['#d8d2c6', '#e4e1da', '#cfd6dc'] },
};

/** Distinct looks per growable template (colours plus structure: roofs, setbacks, balconies, yards). */
export const PROCEDURAL_VARIANTS = 6;

/** Variant `k` of a spec: rotates wall/roof/accent colours and the structure. Variant 0 is the spec itself. */
export function variantSpec(s: ProceduralSpec, k: number): ProceduralSpec {
  if (k === 0) return s;
  const p = PALETTES[s.style];
  const pick = (list: string[], cur: string, step: number) => {
    const i = Math.max(0, list.indexOf(cur));
    return list[(i + step) % list.length];
  };
  return {
    ...s,
    variant: (s.variant ?? 0) + k,
    wall: pick(p.wall, s.wall, k * 2 + 1),
    roof: pick(p.roof, s.roof, k),
    accent: pick(p.accent, s.accent, k),
  };
}
