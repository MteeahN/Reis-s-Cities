import type { BuildingPart } from '../../data/buildings';
import { ARCH_STYLE_DEFS, type ArchStyle } from '../../data/styles';
import type { ProceduralSpec } from './ProceduralBuildings';

type Parts = BuildingPart[];
type V3 = [number, number, number];

/** Main volume of a generated building, for style details. */
export interface Block {
  kind: ProceduralSpec['style'];
  cx: number;
  cz: number;
  bw: number;
  bd: number;
  /** Height of the walls (top of the main volume). */
  h: number;
  /** Where roof additions start (top of parapet / crown). */
  top: number;
  floors: number;
  floorH: number;
}

const DARK = '#2e3338';
const GLASS_DARK = '#4e6a80';
const IRON = '#26292c';

const box = (p: Parts, size: V3, pos: V3, color: string, extra: Partial<BuildingPart> = {}) => p.push({ shape: 'box', size, pos, color, ...extra });
const cyl = (p: Parts, d: number, h: number, pos: V3, color: string, segments = 8, extra: Partial<BuildingPart> = {}) =>
  p.push({ shape: 'cylinder', size: [d, h, d], pos, color, segments, ...extra });

function hash(v: number, k: number): number {
  let x = Math.imul(v + 11, 0x9e3779b1) ^ Math.imul(k + 3, 0x85ebca6b);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
}

/** The spec recoloured from the style's palettes (modern keeps the template's own colours). */
export function restyleSpec(s: ProceduralSpec, arch: ArchStyle): ProceduralSpec {
  if (arch === 'modern') return s;
  const d = ARCH_STYLE_DEFS[arch];
  const v = (s.variant ?? 0) + s.footprint[0] * 7 + s.footprint[1] * 13 + s.floors * 3;
  const pick = (list: string[], k: number) => list[Math.floor(hash(v, k) * list.length)];
  const industrial = s.style === 'warehouse' || s.style === 'factory';
  return {
    ...s,
    wall: industrial ? pick(d.industry, 1) : pick(d.walls, 1),
    roof: pick(d.roofs, 2),
    accent: pick(d.accents, 3),
  };
}

/** Upturned eave tips at the four corners of a roof (East Asian roofs). */
function eaveTips(p: Parts, cx: number, cz: number, w: number, d: number, y: number, color: string): void {
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(p, [0.25, 0.9, 0.25], [cx + (sx * w) / 2, y - 0.1, cz + (sz * d) / 2], color, { rot: [sz * -28, 0, sx * 28] });
    }
  }
}

/** Wide-eaved hip roof: an eave slab, the hip, and a ridge cap. */
function eaveHip(p: Parts, cx: number, cz: number, w: number, d: number, y: number, h: number, color: string, overhang: number): void {
  box(p, [w + overhang * 2, 0.22, d + overhang * 2], [cx, y, cz], color);
  p.push({ shape: 'hip', size: [w + overhang * 1.6, h, d + overhang * 1.6], pos: [cx, y + 0.2, cz], color });
}

/** Mansard roof: steep lower slopes (a hip), with dormers on the street side. */
function mansard(p: Parts, cx: number, cz: number, w: number, d: number, y: number, roof: string, wall: string, dormers: number): void {
  box(p, [w + 0.35, 0.35, d + 0.35], [cx, y, cz], '#d8cdb8');
  p.push({ shape: 'hip', size: [w + 0.1, 3.4, d + 0.1], pos: [cx, y + 0.35, cz], color: roof });
  for (let k = 0; k < dormers; k++) {
    const x = cx - w / 2 + (w * (k + 0.5)) / dormers;
    box(p, [1.1, 1.4, 1.0], [x, y + 0.8, cz + d / 2 - 0.9], wall);
    box(p, [0.7, 0.9, 0.06], [x, y + 1.0, cz + d / 2 - 0.38], GLASS_DARK);
    p.push({ shape: 'gable', size: [1.0, 0.6, 1.3], pos: [x, y + 2.2, cz + d / 2 - 0.95], color: roof, rot: [0, 90, 0] });
  }
}

/** Shutters either side of each window bay on the street front. */
function shutters(p: Parts, b: Block, color: string, firstFloor: number): void {
  const bays = Math.max(1, Math.floor(b.bw / 3.2));
  const z = b.cz + b.bd / 2 + 0.05;
  for (let f = firstFloor; f < b.floors; f++) {
    const y = f * b.floorH + 0.1 + b.floorH * 0.28;
    for (let k = 0; k < bays; k++) {
      const x = b.cx - b.bw / 2 + (b.bw * (k + 0.5)) / bays;
      for (const s of [-1, 1]) box(p, [0.32, b.floorH * 0.45, 0.06], [x + s * 0.78, y, z], color);
    }
  }
}

/** Cumba: an overhanging bay window on an upper floor (Ottoman houses). */
function cumba(p: Parts, x: number, y: number, z: number, w: number, h: number, wall: string, wood: string): void {
  box(p, [w, h, 0.9], [x, y, z + 0.45], wall);
  box(p, [w + 0.2, 0.18, 1.1], [x, y - 0.18, z + 0.5], wood);
  box(p, [w + 0.2, 0.15, 1.1], [x, y + h, z + 0.5], wood);
  for (let k = 0; k < 3; k++) box(p, [w * 0.24, h * 0.55, 0.06], [x - w * 0.32 + k * w * 0.32, y + h * 0.25, z + 0.92], GLASS_DARK);
  // Wooden brackets underneath.
  for (const s of [-1, 1]) box(p, [0.15, 0.6, 0.15], [x + (s * w) / 2.4, y - 0.7, z + 0.35], wood, { rot: [40, 0, 0] });
}

/** Vertical neon shop sign. */
function neonSign(p: Parts, x: number, y: number, z: number, h: number, color: string): void {
  box(p, [0.5, h, 0.18], [x, y, z], color);
  box(p, [0.08, h, 0.4], [x, y, z - 0.25], IRON);
}

/** Roof for a house in a non-modern style (replaces the template's own roof). */
export function styledHouseRoof(p: Parts, arch: ArchStyle, b: Block, s: ProceduralSpec, v: number): void {
  const { cx, cz, bw, bd, h } = b;
  const y = h + 0.1;
  switch (arch) {
    case 'european': {
      const steep = 3.4;
      if (v % 3 === 2) p.push({ shape: 'hip', size: [bw + 0.6, steep, bd + 0.6], pos: [cx, y, cz], color: s.roof });
      else p.push({ shape: 'gable', size: [bw + 0.6, steep, bd + 0.6], pos: [cx, y, cz], color: s.roof });
      // Dormers and a tall brick chimney.
      for (const dx of bw > 6 ? [-0.25, 0.2] : [0]) {
        box(p, [1.2, 1.2, 1.1], [cx + bw * dx, y + 0.5, cz + bd * 0.2], s.wall);
        p.push({ shape: 'gable', size: [1.1, 0.7, 1.4], pos: [cx + bw * dx, y + 1.7, cz + bd * 0.2], color: s.roof, rot: [0, 90, 0] });
        box(p, [0.7, 0.8, 0.06], [cx + bw * dx, y + 0.7, cz + bd * 0.2 + 0.56], GLASS_DARK);
      }
      box(p, [0.7, 2.6, 0.7], [cx - bw * 0.32, y + 1.2, cz - bd * 0.15], '#8f4430');
      break;
    }
    case 'asian':
      eaveHip(p, cx, cz, bw, bd, y, 1.8, s.roof, 1.1);
      eaveTips(p, cx, cz, bw + 2.2, bd + 2.2, y + 0.3, s.roof);
      box(p, [bw * 0.55, 0.3, 0.3], [cx, y + 2.0, cz], s.roof);
      break;
    case 'mediterranean':
      if (v % 2 === 0) {
        // Flat roof terrace with a parapet and a small vaulted stair house.
        box(p, [bw + 0.25, 0.6, bd + 0.25], [cx, y, cz], s.wall);
        box(p, [2, 1.6, 2], [cx - bw * 0.25, y + 0.6, cz - bd * 0.2], s.wall);
        p.push({ shape: 'dome', size: [1.9, 0.8, 1.9], pos: [cx - bw * 0.25, y + 2.2, cz - bd * 0.2], color: s.wall, segments: 10 });
      } else {
        p.push({ shape: 'hip', size: [bw + 0.8, 1.4, bd + 0.8], pos: [cx, y, cz], color: s.roof });
      }
      break;
    case 'ottoman':
      eaveHip(p, cx, cz, bw, bd, y, 2.0, s.roof, 0.9);
      box(p, [0.6, 1.6, 0.6], [cx + bw * 0.3, y + 1.0, cz - bd * 0.1], '#efe3c8');
      break;
    case 'nordic': {
      // Steep, eaveless gable; some are turf roofs.
      const turf = v % 3 === 1;
      p.push({ shape: 'gable', size: [bw + 0.2, 4.0, bd + 0.2], pos: [cx, y, cz], color: turf ? '#5e7f3f' : s.roof });
      box(p, [0.6, 1.8, 0.6], [cx + bw * 0.25, y + 2.2, cz], '#f2f0ea');
      break;
    }
    case 'arabic':
      flatParapet(p, cx, cz, bw, bd, y, s.wall, true);
      if (v % 2 === 0) windTower(p, cx - bw * 0.25, cz - bd * 0.2, y + 0.6, s.wall);
      break;
    case 'slavic':
      p.push({ shape: 'hip', size: [bw + 0.8, 2.8, bd + 0.8], pos: [cx, y, cz], color: s.roof });
      box(p, [bw * 0.35, 0.15, 0.15], [cx, y + 2.75, cz], s.accent);
      break;
    case 'american': {
      // Side-gabled roof with a front porch roof.
      p.push({ shape: 'gable', size: [bw + 0.6, 2.4, bd + 0.6], pos: [cx, y, cz], color: s.roof });
      box(p, [0.7, 2.2, 0.7], [cx - bw * 0.35, y + 0.8, cz - bd * 0.2], '#8a4a36');
      break;
    }
    case 'medieval':
      p.push({ shape: 'gable', size: [bw + 0.5, 4.6, bd + 0.5], pos: [cx, y, cz], color: s.roof });
      box(p, [0.8, 3.0, 0.8], [cx - bw * 0.3, y + 1.0, cz], '#8a8070');
      break;
    default:
      break;
  }
}

/** Flat roof with a parapet (crenellated: Arabic houses and fortifications). */
function flatParapet(p: Parts, cx: number, cz: number, w: number, d: number, y: number, wall: string, crenels: boolean): void {
  box(p, [w + 0.2, 0.6, d + 0.2], [cx, y, cz], wall);
  if (!crenels) return;
  const n = Math.max(3, Math.floor(w / 1.2));
  for (let k = 0; k < n; k += 2) {
    const x = cx - w / 2 + (w * (k + 0.5)) / n;
    for (const sz of [-1, 1]) box(p, [w / n, 0.5, 0.3], [x, y + 0.6, cz + (sz * d) / 2], wall);
  }
}

/** Wind catcher tower (badgir) with slotted openings. */
function windTower(p: Parts, x: number, z: number, y: number, wall: string): void {
  box(p, [1.4, 2.6, 1.4], [x, y, z], wall);
  for (const sx of [-1, 1]) box(p, [0.06, 1.2, 0.9], [x + sx * 0.71, y + 1.2, z], DARK);
  box(p, [1.6, 0.25, 1.6], [x, y + 2.6, z], wall);
}

/** Onion dome on a drum, with a gilded spire. */
function onionDome(p: Parts, x: number, z: number, y: number, d: number, color: string): void {
  cyl(p, d * 0.7, d * 0.5, [x, y, z], '#f2f0ea', 12);
  p.push({ shape: 'dome', size: [d, d * 0.7, d], pos: [x, y + d * 0.5, z], color, segments: 12 });
  p.push({ shape: 'cone', size: [d * 0.62, d * 0.8, d * 0.62], pos: [x, y + d * 1.1, z], color, segments: 12 });
  cyl(p, 0.1, d * 0.7, [x, y + d * 1.85, z], '#d4b04a', 5);
}

/** Half-timbering on the street front: posts, a rail per floor and braces. */
function halfTimber(p: Parts, b: Block, color: string, fromY: number): void {
  const front = b.cz + b.bd / 2 + 0.04;
  const posts = Math.max(2, Math.floor(b.bw / 1.8));
  for (let k = 0; k <= posts; k++) box(p, [0.18, b.h - fromY, 0.06], [b.cx - b.bw / 2 + (b.bw * k) / posts, fromY, front], color);
  for (let f = Math.ceil(fromY / b.floorH); f <= b.floors; f++) box(p, [b.bw, 0.18, 0.06], [b.cx, Math.min(b.h - 0.2, f * b.floorH), front], color);
  for (let k = 0; k < posts; k += 2) {
    const x = b.cx - b.bw / 2 + (b.bw * (k + 0.5)) / posts;
    box(p, [0.14, Math.min(2.2, b.floorH * 0.8), 0.06], [x, fromY + 0.3, front], color, { rot: [0, 0, 35] });
  }
}

/** Style details around a generated building's main volume (facades, roofs, signs, greenery). */
export function decorate(p: Parts, arch: ArchStyle, b: Block, s: ProceduralSpec, v: number): void {
  if (arch === 'modern') return;
  const front = b.cz + b.bd / 2;
  const industrial = b.kind === 'warehouse' || b.kind === 'factory';
  switch (arch) {
    case 'european': {
      if (industrial) {
        // Brick hall: arched windows along the front.
        const n = Math.max(2, Math.floor(b.bw / 2.6));
        for (let k = 0; k < n; k++) {
          const x = b.cx - b.bw / 2 + (b.bw * (k + 0.5)) / n;
          box(p, [1.0, 1.6, 0.08], [x, b.h * 0.55, front + 0.04], GLASS_DARK);
          cyl(p, 1.0, 0.08, [x, b.h * 0.55 + 1.6, front], GLASS_DARK, 10, { rot: [90, 0, 0] });
        }
        break;
      }
      if (b.kind !== 'house') {
        box(p, [b.bw + 0.4, 0.35, b.bd + 0.4], [b.cx, b.h - 0.2, b.cz], '#d8cdb8');
        mansard(p, b.cx, b.cz, b.bw * 0.96, b.bd * 0.96, b.top, s.roof, s.wall, Math.max(1, Math.floor(b.bw / 3.4)));
      }
      shutters(p, b, s.accent, b.kind === 'shop' || b.kind === 'mall' ? 1 : 0);
      // Wrought-iron balconies on the first floors.
      if (b.floors >= 2 && b.kind !== 'house') {
        for (let f = 1; f < Math.min(b.floors, 4); f++) {
          box(p, [b.bw * 0.7, 0.12, 0.7], [b.cx, f * b.floorH + 0.1, front + 0.35], '#d8cdb8');
          box(p, [b.bw * 0.7, 0.8, 0.04], [b.cx, f * b.floorH + 0.22, front + 0.7], IRON);
        }
      }
      if (b.kind === 'shop' || b.kind === 'mall') {
        // Striped awning.
        const n = Math.max(3, Math.floor(b.bw / 0.9));
        for (let k = 0; k < n; k++) box(p, [b.bw / n, 0.12, 1.5], [b.cx - b.bw / 2 + (b.bw * (k + 0.5)) / n, 3.05, front + 0.75], k % 2 ? '#f2efe8' : s.accent, { rot: [12, 0, 0] });
        for (const sx of [-1, 1]) box(p, [0.9, 0.35, 0.35], [b.cx + sx * b.bw * 0.3, 1.0, front + 0.2], '#c0392b');
      }
      break;
    }
    case 'asian': {
      if (industrial) {
        eaveTips(p, b.cx, b.cz, b.bw + 0.4, b.bd + 0.4, b.h + 0.4, s.roof);
        break;
      }
      if (b.kind !== 'house') {
        // Tiered roof crowns: one tier for low buildings, a pagoda for towers.
        const tiers = b.kind === 'tower' || b.kind === 'office' ? 3 : 1;
        let w = Math.min(b.bw, 12);
        let d = Math.min(b.bd, 12);
        let y = b.top;
        for (let k = 0; k < tiers; k++) {
          if (k > 0) box(p, [w * 0.75, 1.6, d * 0.75], [b.cx, y, b.cz], s.wall);
          if (k > 0) y += 1.6;
          eaveHip(p, b.cx, b.cz, w * (k > 0 ? 0.75 : 1), d * (k > 0 ? 0.75 : 1), y, 1.4, s.roof, 0.9);
          eaveTips(p, b.cx, b.cz, w * (k > 0 ? 0.75 : 1) + 1.8, d * (k > 0 ? 0.75 : 1) + 1.8, y + 0.25, s.roof);
          y += 1.6;
          w *= 0.75;
          d *= 0.75;
        }
        cyl(p, 0.14, 2.2, [b.cx, y, b.cz], '#c9a35a', 6);
      }
      // Red lanterns at the entrance, vertical neon signs on shops.
      for (const sx of [-1, 1]) {
        box(p, [0.04, 0.35, 0.04], [b.cx + sx * 1.3, 2.75, front + 0.6], IRON);
        cyl(p, 0.42, 0.55, [b.cx + sx * 1.3, 2.2, front + 0.6], '#d12a1f', 10);
      }
      if (b.kind === 'shop' || b.kind === 'mall' || (b.kind === 'apartment' && v % 2 === 0)) {
        const colors = ['#ff4d6d', '#ffd23f', '#3fd2ff', '#7cff6b', '#ff8c42'];
        const n = b.bw > 10 ? 3 : 2;
        // Tall buildings carry them on the facade, low shops on the roof edge.
        const tall = b.h > 6;
        for (let k = 0; k < n; k++) neonSign(p, b.cx - b.bw / 2 + 0.6 + k * ((b.bw - 1.2) / Math.max(1, n - 1)), tall ? 3.6 : b.top, front + 0.45, tall ? Math.min(b.h - 3.8, 5 + k) : 2.2, colors[(v + k) % colors.length]);
      }
      if (b.kind === 'apartment' || b.kind === 'tower') {
        // Air-conditioner units on the facade.
        for (let f = 1; f < Math.min(b.floors, 10); f++) {
          box(p, [0.8, 0.5, 0.45], [b.cx + (f % 2 ? 1 : -1) * b.bw * 0.3, f * b.floorH + 0.3, front + 0.22], '#e4e4e0');
        }
      }
      break;
    }
    case 'mediterranean': {
      if (industrial) break;
      if (b.kind !== 'house') {
        box(p, [b.bw + 0.2, 0.7, b.bd + 0.2], [b.cx, b.top, b.cz], s.wall);
        // Pergola on the roof terrace.
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) cyl(p, 0.16, 2.2, [b.cx + sx * Math.min(2, b.bw * 0.2), b.top + 0.7, b.cz + sz * Math.min(1.6, b.bd * 0.2)], '#7a5a3c', 6);
        for (let k = 0; k < 5; k++) box(p, [0.12, 0.12, Math.min(3.6, b.bd * 0.45)], [b.cx - Math.min(2, b.bw * 0.2) + k * Math.min(1, b.bw * 0.1), b.top + 2.9, b.cz], '#7a5a3c');
      }
      // Arched ground-floor openings, blue shutters, bougainvillea.
      const n = Math.max(1, Math.floor(b.bw / 3));
      for (let k = 0; k < n; k++) {
        const x = b.cx - b.bw / 2 + (b.bw * (k + 0.5)) / n;
        cyl(p, 1.4, 0.1, [x, 2.2, front], DARK, 12, { rot: [90, 0, 0] });
      }
      shutters(p, b, s.accent, 1);
      for (const sx of [-1, 1]) p.push({ shape: 'dome', size: [1.8, 1.4, 0.9], pos: [b.cx + sx * (b.bw / 2 - 0.6), Math.min(b.h - 1.2, 3.2), front + 0.2], color: '#c2347a', segments: 8 });
      break;
    }
    case 'ottoman': {
      if (industrial) break;
      if (b.kind !== 'house' && b.kind !== 'mall') {
        eaveHip(p, b.cx, b.cz, b.bw, b.bd, b.top, Math.min(3, 1.6 + b.bw * 0.08), s.roof, 1.0);
      }
      if (b.kind === 'mall' || (b.kind === 'shop' && b.bw > 10)) {
        // Covered bazaar: a row of small domes.
        const n = Math.max(2, Math.floor(b.bw / 3.6));
        for (let k = 0; k < n; k++) {
          const x = b.cx - b.bw / 2 + (b.bw * (k + 0.5)) / n;
          cyl(p, 2.6, 0.6, [x, b.top, b.cz], s.wall, 12);
          p.push({ shape: 'dome', size: [2.6, 1.3, 2.6], pos: [x, b.top + 0.6, b.cz], color: '#8a9a9e', segments: 12 });
        }
      }
      // Cumbas (overhanging bays) on the upper floors, timber framing lines.
      if (b.floors >= 2) {
        const bays = b.bw > 9 ? [-b.bw * 0.25, b.bw * 0.25] : [0];
        for (let f = 1; f < Math.min(b.floors, 6); f++) for (const x of bays) cumba(p, b.cx + x, f * b.floorH + 0.4, front, Math.min(2.8, b.bw * 0.4), b.floorH * 0.8, s.wall, s.accent);
      }
      if (b.h > 3.5) for (let k = 0; k <= Math.floor(b.bw / 2.2); k++) box(p, [0.12, b.h - 3, 0.05], [b.cx - b.bw / 2 + k * 2.2, 3.1, front + 0.03], s.accent);
      box(p, [b.bw + 0.1, 3, 0.05], [b.cx, 0.1, front + 0.02], '#cfc3a8');
      break;
    }
    case 'nordic': {
      // White corner boards and window trims; turf or a steep gable on low blocks.
      for (const sx of [-1, 1]) box(p, [0.3, b.h, 0.3], [b.cx + (sx * b.bw) / 2, 0.1, front - 0.1], '#f2f0ea');
      if (industrial) break;
      const bays = Math.max(1, Math.floor(b.bw / 3));
      for (let f = 0; f < Math.min(b.floors, 8); f++) {
        for (let k = 0; k < bays; k++) {
          const x = b.cx - b.bw / 2 + (b.bw * (k + 0.5)) / bays;
          box(p, [1.4, 0.12, 0.1], [x, f * b.floorH + b.floorH * 0.25 + 0.1, front + 0.05], '#f2f0ea');
          box(p, [1.4, 0.12, 0.1], [x, f * b.floorH + b.floorH * 0.8 + 0.1, front + 0.05], '#f2f0ea');
        }
      }
      if (b.kind !== 'house') {
        if (b.h < 14) p.push({ shape: 'gable', size: [Math.min(b.bw, 14) + 0.2, 3.4, b.bd + 0.2], pos: [b.cx, b.top, b.cz], color: s.roof });
        else box(p, [b.bw * 0.9, 0.4, b.bd * 0.9], [b.cx, b.top, b.cz], '#5e7f3f');
        // Glazed timber balconies.
        for (let f = 1; f < Math.min(b.floors, 6); f++) box(p, [Math.min(3, b.bw * 0.35), 1.0, 0.8], [b.cx + (f % 2 ? 1 : -1) * b.bw * 0.22, f * b.floorH + 0.15, front + 0.4], '#c9a37a');
      }
      break;
    }
    case 'arabic': {
      if (b.kind !== 'house') flatParapet(p, b.cx, b.cz, b.bw, b.bd, b.top, s.wall, true);
      if (industrial) break;
      // Mashrabiya: wooden lattice bays on the upper floors.
      if (b.floors >= 2) {
        const bays = b.bw > 9 ? [-b.bw * 0.25, b.bw * 0.25] : [0];
        for (let f = 1; f < Math.min(b.floors, 6); f++) {
          for (const x of bays) {
            box(p, [Math.min(2.4, b.bw * 0.35), b.floorH * 0.7, 0.7], [b.cx + x, f * b.floorH + 0.4, front + 0.35], s.accent);
            for (let k = 0; k < 4; k++) box(p, [Math.min(2.4, b.bw * 0.35) + 0.04, 0.05, 0.05], [b.cx + x, f * b.floorH + 0.6 + k * b.floorH * 0.15, front + 0.72], '#3a2a1a');
          }
        }
      }
      // Pointed-arch entrance, wind tower on low roofs, a dome on bazaars.
      box(p, [1.8, 2.6, 0.08], [b.cx, 0.1, front + 0.04], DARK);
      p.push({ shape: 'pyramid', size: [1.8, 0.9, 0.12], pos: [b.cx, 2.7, front + 0.04], color: DARK });
      if (b.kind === 'mall' || (b.kind === 'shop' && b.bw > 10)) {
        cyl(p, 4, 0.8, [b.cx, b.top + 0.6, b.cz], s.wall, 14);
        p.push({ shape: 'dome', size: [4, 2.4, 4], pos: [b.cx, b.top + 1.4, b.cz], color: '#1f6f78', segments: 14 });
      } else if (b.kind !== 'house' && b.h < 16 && v % 2 === 0) windTower(p, b.cx + b.bw * 0.3, b.cz - b.bd * 0.2, b.top + 0.6, s.wall);
      break;
    }
    case 'slavic': {
      if (industrial) break;
      // Carved white window frames with a little pediment.
      const bays = Math.max(1, Math.floor(b.bw / 3));
      for (let f = 0; f < Math.min(b.floors, 8); f++) {
        for (let k = 0; k < bays; k++) {
          const x = b.cx - b.bw / 2 + (b.bw * (k + 0.5)) / bays;
          const y = f * b.floorH + b.floorH * 0.25 + 0.1;
          for (const sx of [-1, 1]) box(p, [0.18, b.floorH * 0.55, 0.08], [x + sx * 0.75, y, front + 0.04], s.accent);
          p.push({ shape: 'gable', size: [1.8, 0.4, 0.12], pos: [x, y + b.floorH * 0.55, front + 0.05], color: s.accent });
        }
      }
      if (b.kind !== 'house') {
        p.push({ shape: 'hip', size: [b.bw + 0.6, 2.4, b.bd + 0.6], pos: [b.cx, b.top, b.cz], color: s.roof });
        // Onion domes crown towers, malls and big blocks.
        if (b.kind === 'tower' || b.kind === 'mall' || b.kind === 'office' || b.bw > 12) onionDome(p, b.cx, b.cz, b.top + 2.2, Math.min(3.2, b.bw * 0.3), v % 2 ? '#d4b04a' : s.roof);
      }
      break;
    }
    case 'american': {
      if (industrial) {
        // Painted brick sign along the top.
        box(p, [b.bw * 0.7, 1.2, 0.06], [b.cx, b.h - 1.6, front + 0.04], '#e8e4da');
        break;
      }
      if (b.kind === 'house') {
        // Clapboard lines and a deep front porch with columns.
        for (let y = 0.6; y < b.h - 0.2; y += 0.6) box(p, [b.bw + 0.06, 0.05, 0.05], [b.cx, y, front + 0.03], '#d8d4cc');
        box(p, [b.bw * 0.9, 0.2, 1.4], [b.cx, 2.6, front + 0.7], s.roof);
        for (const sx of [-0.4, 0, 0.4]) cyl(p, 0.2, 2.5, [b.cx + sx * b.bw, 0.1, front + 1.3], '#f2f0ea', 6);
        box(p, [b.bw * 0.9, 0.3, 1.4], [b.cx, 0.1, front + 0.7], '#a89f92');
        break;
      }
      // Stoop, cornice, fire escapes, a water tower or a billboard on the roof.
      box(p, [b.bw + 0.4, 0.5, b.bd + 0.4], [b.cx, b.h - 0.3, b.cz], s.accent);
      box(p, [2.2, 1.2, 1.4], [b.cx, 0.1, front + 0.7], '#8a6a56');
      if (b.floors >= 3) {
        const x = b.cx + b.bw * 0.28;
        for (let f = 1; f < Math.min(b.floors, 12); f++) {
          box(p, [2.4, 0.1, 0.9], [x, f * b.floorH + 0.1, front + 0.45], IRON);
          box(p, [2.4, 0.7, 0.04], [x, f * b.floorH + 0.2, front + 0.9], IRON);
          box(p, [0.08, b.floorH, 0.9], [x - 0.9, f * b.floorH + 0.1, front + 0.45], IRON, { rot: [0, 0, 30] });
        }
      }
      if (b.kind === 'shop' || b.kind === 'mall') {
        box(p, [Math.min(6, b.bw * 0.6), 2.4, 0.2], [b.cx, b.top + 0.6, b.cz], '#f4f1ea');
        box(p, [0.2, 0.7, 0.2], [b.cx, b.top, b.cz], IRON);
      } else if (b.h < 40) {
        const x = b.cx - b.bw * 0.25;
        for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) box(p, [0.12, 1.6, 0.12], [x + sx, b.top, b.cz + sz], IRON);
        cyl(p, 1.8, 2.2, [x, b.top + 1.6, b.cz], '#7a5a3c', 10);
        p.push({ shape: 'cone', size: [2, 0.8, 2], pos: [x, b.top + 3.8, b.cz], color: '#4a4f55', segments: 10 });
      }
      break;
    }
    case 'medieval': {
      if (industrial) {
        box(p, [b.bw * 0.4, 0.6, 0.06], [b.cx, b.h * 0.6, front + 0.04], '#3a2a20');
        break;
      }
      // Stone ground floor, timber framing above, jettied first floor.
      box(p, [b.bw + 0.12, Math.min(3, b.h), 0.08], [b.cx, 0.1, front + 0.02], '#a89f92');
      if (b.h > 3.4) {
        halfTimber(p, b, s.accent, 3);
        box(p, [b.bw + 0.3, 0.35, 0.6], [b.cx, 3.0, front + 0.25], s.accent);
      }
      if (b.kind !== 'house') {
        p.push({ shape: 'gable', size: [Math.min(b.bw, 14) + 0.4, Math.min(6, 2.5 + b.bd * 0.3), b.bd + 0.4], pos: [b.cx, b.top, b.cz], color: s.roof });
        if (b.bw > 10 || b.kind === 'tower') {
          // Corner turret with a conical roof.
          const tx = b.cx + b.bw / 2 - 1.2;
          cyl(p, 2.2, 3, [tx, b.top, front - 1.2], '#a89f92', 12);
          p.push({ shape: 'cone', size: [2.6, 3, 2.6], pos: [tx, b.top + 3, front - 1.2], color: s.roof, segments: 12 });
        }
      }
      break;
    }
    default:
      break;
  }
}

/**
 * Style massing: reshapes the main volume of multi-storey blocks so styles
 * differ in silhouette, not only in colour and trim. Every rule keeps the
 * street front plane and stays inside the original envelope (a jetty moves
 * at most 0.9 m forward), so lots never grow. Returns the block that the
 * style's trim and roof should follow.
 */
export function reshapeMassing(p: Parts, arch: ArchStyle, b: Block, s: ProceduralSpec, v: number): Block {
  if (b.kind !== 'apartment' && b.kind !== 'office' && b.kind !== 'shop') return b;
  // The main volume: the tallest facade box centred on the block.
  let idx = -1;
  for (let k = 0; k < p.length; k++) {
    const q = p[k];
    if (q.shape !== 'box' || !q.facade || Math.abs(q.pos[0] - b.cx) > 0.01 || Math.abs(q.pos[2] - b.cz) > 0.01) continue;
    if (idx < 0 || q.size[1] > p[idx].size[1]) idx = k;
  }
  if (idx < 0) return b;
  const main = p[idx];
  const [w, , d] = main.size;
  let h = main.size[1];
  const y0 = main.pos[1];
  const fh = b.floorH;
  // Volumes stacked on the main one (a recessed top floor) become part of the reshaped mass.
  const stackedIdx: number[] = [];
  if (arch !== 'european' && arch !== 'slavic') {
    for (let k = 0; k < p.length; k++) {
      const q = p[k];
      if (k === idx || q.shape !== 'box' || !q.facade || q.pos[1] < y0 + h - 0.5) continue;
      if (Math.abs(q.pos[0] - b.cx) > w / 2 || Math.abs(q.pos[2] - b.cz) > d / 2) continue;
      stackedIdx.push(k);
      h = Math.max(h, q.pos[1] + q.size[1] - y0);
    }
  }
  const floors = Math.round(h / fh);
  if (floors < 2) return b;
  const front = b.cz + d / 2;
  const facade = main.facade;
  const color = main.color;
  /** A facade volume `fl` floors tall starting at floor `from`, front flush with the street front. */
  const vol = (fl: number, from: number, vw: number, vd: number, x: number, c = color) =>
    p.push({ shape: 'box', size: [vw, fl * fh, vd], pos: [x, y0 + from * fh, front - vd / 2], color: c, facade });
  const remove = () => {
    for (const k of [idx, ...stackedIdx].sort((x, y) => y - x)) p.splice(k, 1);
  };
  const side = v % 2 ? 1 : -1;

  switch (arch) {
    case 'modern': {
      if (v % 4 === 1) {
        // L-shape: a full-depth wing and a shallow street wing one floor lower.
        remove();
        vol(floors, 0, w * 0.55, d, b.cx + side * w * 0.225);
        vol(floors - 1, 0, w * 0.45, d * 0.6, b.cx - side * w * 0.275);
        box(p, [w * 0.45, 0.4, d * 0.6], [b.cx - side * w * 0.275, y0 + (floors - 1) * fh, front - d * 0.3], s.accent);
        return { ...b, cx: b.cx + side * w * 0.225, bw: w * 0.55 };
      }
      if (v % 4 === 2 && floors >= 3) {
        // Tall slab with a low side pavilion.
        remove();
        vol(floors, 0, w * 0.62, d, b.cx + side * w * 0.19);
        vol(Math.max(1, floors - 2), 0, w * 0.38, d * 0.85, b.cx - side * w * 0.31);
        return { ...b, cx: b.cx + side * w * 0.19, bw: w * 0.62 };
      }
      return b;
    }
    case 'european': {
      // Oriel bays rising up the street front, and a corner turret on wide blocks.
      const bays = w > 10 ? [-w * 0.3, w * 0.3] : [0];
      const ow = Math.min(2.6, w * 0.22);
      for (const x of bays) {
        p.push({ shape: 'box', size: [ow, (floors - 1) * fh - 0.4, 0.9], pos: [b.cx + x, y0 + fh, front + 0.45], color, facade });
        box(p, [ow + 0.3, 0.3, 1.2], [b.cx + x, y0 + floors * fh - 0.4, front + 0.5], s.accent);
      }
      if (w > 9) {
        const tx = b.cx + side * (w / 2 - 1.3);
        cyl(p, 2.8, h + 1.4, [tx, y0, front - 1.3], color, 12);
        p.push({ shape: 'cone', size: [3.3, 3.2, 3.3], pos: [tx, y0 + h + 1.4, front - 1.3], color: s.roof, segments: 12 });
      }
      return b;
    }
    case 'asian': {
      // Stacked tiers, two floors each, with an eave slab between them.
      remove();
      let tw = w;
      let last = w;
      for (let f = 0; f < floors; f += 2) {
        const fl = Math.min(2, floors - f);
        vol(fl, f, tw, d, b.cx);
        if (f + fl < floors) box(p, [tw + 1.4, 0.25, d + 1.2], [b.cx, y0 + (f + fl) * fh - 0.1, front - d / 2 + 0.2], s.roof);
        last = tw;
        tw *= 0.92;
      }
      return { ...b, bw: last };
    }
    case 'mediterranean': {
      // Whitewashed cubes stepping up to one side, a terrace on each step.
      remove();
      const steps = Math.min(3, floors);
      let fl0 = 0;
      let cw = w;
      let cx = b.cx;
      let top = { cx, cw };
      for (let k = 0; k < steps; k++) {
        const fl = k === steps - 1 ? floors - fl0 : Math.max(1, Math.round(floors / steps));
        vol(fl, fl0, cw, d, cx);
        if (k < steps - 1) box(p, [cw + 0.2, 0.5, d + 0.2], [cx, y0 + (fl0 + fl) * fh, front - d / 2], color);
        top = { cx, cw };
        fl0 += fl;
        const nw = cw * 0.72;
        cx += (side * (cw - nw)) / 2;
        cw = nw;
      }
      return { ...b, cx: top.cx, bw: top.cw };
    }
    case 'ottoman': {
      // Jettied upper floors over a recessed stone ground floor, carried on brackets.
      remove();
      p.push({ shape: 'box', size: [w * 0.92, fh, d - 0.6], pos: [b.cx, y0, front - 0.6 - (d - 0.6) / 2], color: '#cfc3a8', facade });
      p.push({ shape: 'box', size: [w, (floors - 1) * fh, d], pos: [b.cx, y0 + fh, front + 0.6 - d / 2], color, facade });
      const n = Math.max(1, Math.floor(w / 2));
      for (let k = 0; k <= n; k++) box(p, [0.18, 0.7, 0.8], [b.cx - w / 2 + 0.3 + (k * (w - 0.6)) / n, y0 + fh - 0.75, front + 0.2], s.accent, { rot: [35, 0, 0] });
      return { ...b, cz: b.cz + 0.6 };
    }
    case 'nordic': {
      // Two narrow gabled houses side by side, one a floor taller.
      remove();
      const wa = w * 0.55;
      const wb = w - wa;
      const xa = b.cx - w / 2 + wa / 2;
      const xb = b.cx + w / 2 - wb / 2;
      vol(floors, 0, wa, d, xa);
      vol(floors - 1, 0, wb, d, xb, s.accent);
      if (h < 16) p.push({ shape: 'gable', size: [wb + 0.2, 3.0, d + 0.2], pos: [xb, y0 + (floors - 1) * fh, b.cz], color: s.roof });
      else box(p, [wb + 0.2, 0.5, d + 0.2], [xb, y0 + (floors - 1) * fh, b.cz], s.roof);
      return { ...b, cx: xa, bw: wa };
    }
    case 'arabic': {
      // A tall block and a lower wing with a crenellated roof terrace.
      remove();
      const wa = w * 0.6;
      vol(floors, 0, wa, d, b.cx + (side * (w - wa)) / 2);
      const low = Math.max(1, Math.ceil(floors * 0.5));
      vol(low, 0, w - wa, d * 0.8, b.cx - (side * wa) / 2);
      flatParapet(p, b.cx - (side * wa) / 2, front - d * 0.4, w - wa, d * 0.8, y0 + low * fh, color, true);
      return { ...b, cx: b.cx + (side * (w - wa)) / 2, bw: wa };
    }
    case 'slavic': {
      // A corner tower with a tent roof rises above the block.
      const tw = Math.min(3, w * 0.28);
      const tx = b.cx + side * (w / 2 - tw / 2);
      p.push({ shape: 'box', size: [tw, h + fh, tw], pos: [tx, y0, front - tw / 2 + 0.3], color, facade });
      p.push({ shape: 'pyramid', size: [tw + 0.4, 3.6, tw + 0.4], pos: [tx, y0 + h + fh, front - tw / 2 + 0.3], color: s.roof });
      return b;
    }
    case 'american': {
      remove();
      if (floors < 5) {
        // Brick walk-up with a lower bay on one side.
        vol(floors, 0, w * 0.7, d, b.cx + side * w * 0.15);
        vol(floors - 1, 0, w * 0.3, d, b.cx - side * w * 0.35);
        return { ...b, cx: b.cx + side * w * 0.15, bw: w * 0.7 };
      }
      // Wedding-cake setbacks.
      const f1 = Math.round(floors * 0.6);
      const f2 = Math.max(f1 + 1, Math.round(floors * 0.85));
      vol(f1, 0, w, d, b.cx);
      vol(f2 - f1, f1, w * 0.78, d * 0.85, b.cx);
      if (floors > f2) vol(floors - f2, f2, w * 0.56, d * 0.7, b.cx);
      box(p, [w + 0.2, 0.4, d + 0.2], [b.cx, y0 + f1 * fh, front - d / 2], s.accent);
      box(p, [w * 0.78 + 0.2, 0.4, d * 0.85 + 0.2], [b.cx, y0 + f2 * fh, front - d * 0.425], s.accent);
      return { ...b, bw: floors > f2 ? w * 0.56 : w * 0.78 };
    }
    case 'medieval': {
      // Each upper floor oversails the one below.
      remove();
      p.push({ shape: 'box', size: [w * 0.94, fh, d - 0.9], pos: [b.cx, y0, front - 0.9 - (d - 0.9) / 2], color: '#a89f92', facade });
      for (let f = 1; f < floors; f++) {
        const out = Math.min(3, f) * 0.3;
        const fd = d - 0.9 + out;
        p.push({ shape: 'box', size: [w, fh, fd], pos: [b.cx, y0 + f * fh, front - 0.9 + out - fd / 2], color, facade });
        box(p, [w + 0.1, 0.22, 0.3], [b.cx, y0 + f * fh - 0.1, front - 0.9 + out], s.accent);
      }
      return b;
    }
    default:
      return b;
  }
}
