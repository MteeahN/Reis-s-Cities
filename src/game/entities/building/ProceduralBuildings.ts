import { CELL_SIZE } from '../../core/config';
import type { BuildingPart } from '../../data/buildings';

export type ProceduralStyle = 'house' | 'apartment' | 'tower' | 'shop' | 'office' | 'mall' | 'warehouse' | 'factory';

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
const GLASS = '#7f9db3';

/**
 * Turns a spec into primitive parts (same format as hand-authored catalogue
 * models), so zoned buildings render through the same instanced pipeline.
 */
export function proceduralParts(s: ProceduralSpec): BuildingPart[] {
  const W = s.footprint[0] * CELL_SIZE;
  const D = s.footprint[1] * CELL_SIZE;
  const v = s.variant ?? 0;
  const parts: BuildingPart[] = [{ shape: 'box', size: [W - 0.3, 0.12, D - 0.3], pos: [0, 0, 0], color: GROUND[s.ground] }];
  const front = D / 2;

  switch (s.style) {
    case 'house': {
      const bw = Math.min(W - 2.4, 6.5 + (W > 8 ? 4 : 0));
      const bd = Math.min(D - 3.2, 6 + (D > 8 ? 3 : 0));
      const h = s.floors * 3;
      const cz = front - 2.2 - bd / 2;
      const cx = W > 8 ? -1.5 : 0;
      parts.push({ shape: 'box', size: [bw, h, bd], pos: [cx, 0.1, cz], color: s.wall, facade: true });
      if (v % 3 === 2) parts.push({ shape: 'hip', size: [bw + 0.7, 2.2, bd + 0.7], pos: [cx, h + 0.1, cz], color: s.roof });
      else parts.push({ shape: 'gable', size: [bw + 0.7, 2.4, bd + 0.7], pos: [cx, h + 0.1, cz], color: s.roof, rot: v % 2 ? [0, 90, 0] : undefined });
      parts.push({ shape: 'box', size: [1.1, 2.1, 0.2], pos: [cx + bw * 0.2, 0.1, cz + bd / 2 + 0.05], color: DOOR });
      parts.push({ shape: 'box', size: [0.7, 1.8, 0.7], pos: [cx - bw * 0.3, h + 1, cz - bd * 0.2], color: '#7d6b5d' });
      parts.push({ shape: 'box', size: [1.2, 0.8, 0.6], pos: [-W / 2 + 1.2, 0.1, front - 0.8], color: GREEN });
      if (W > 8) {
        parts.push({ shape: 'box', size: [3.6, 2.6, 5], pos: [W / 2 - 2.4, 0.1, front - 4], color: s.accent });
        parts.push({ shape: 'box', size: [2.8, 2, 0.15], pos: [W / 2 - 2.4, 0.1, front - 1.45], color: '#d8d4cc' });
      }
      if (D > 8) {
        parts.push({ shape: 'cylinder', size: [0.4, 2.2, 0.4], pos: [W / 2 - 2, 0.1, -D / 2 + 3], color: '#5a4330' });
        parts.push({ shape: 'dome', size: [3, 2.6, 3], pos: [W / 2 - 2, 2, -D / 2 + 3], color: GREEN });
      }
      break;
    }
    case 'apartment': {
      const bw = W - 1.8;
      const bd = D - 3;
      const h = s.floors * 3.2;
      const cz = front - 2 - bd / 2;
      parts.push({ shape: 'box', size: [bw, h, bd], pos: [0, 0.1, cz], color: s.wall, facade: true });
      parts.push({ shape: 'box', size: [bw + 0.3, 0.6, bd + 0.3], pos: [0, h + 0.1, cz], color: s.accent });
      parts.push({ shape: 'box', size: [Math.min(3, bw * 0.4), 1.6, 2], pos: [bw * 0.2, h + 0.7, cz - bd * 0.1], color: '#9a958c' });
      parts.push({ shape: 'box', size: [2.6, 0.25, 1.6], pos: [0, 2.8, cz + bd / 2 + 0.8], color: s.accent });
      parts.push({ shape: 'box', size: [1.6, 2.4, 0.2], pos: [0, 0.1, cz + bd / 2 + 0.05], color: DARK });
      // Balcony slabs every other floor on wide buildings.
      if (bw > 9) {
        for (let f = 1; f < s.floors; f += 2) parts.push({ shape: 'box', size: [bw * 0.8, 0.2, 1], pos: [0, f * 3.2 + 0.1, cz + bd / 2 + 0.5], color: s.accent });
      }
      break;
    }
    case 'tower': {
      const pw = W - 1.6;
      const pd = D - 2.6;
      const tw = pw * 0.72;
      const td = pd * 0.72;
      const cz = front - 1.8 - pd / 2;
      const th = s.floors * 3.2;
      parts.push({ shape: 'box', size: [pw, 4.4, pd], pos: [0, 0.1, cz], color: s.accent, facade: 'shop' });
      parts.push({ shape: 'box', size: [tw, th, td], pos: [0, 4.5, cz], color: s.wall, facade: v % 2 ? 'office' : 'residential' });
      parts.push({ shape: 'box', size: [tw + 0.4, 1.2, td + 0.4], pos: [0, 4.5 + th, cz], color: s.accent });
      parts.push({ shape: 'box', size: [tw * 0.4, 2.2, td * 0.4], pos: [0, 5.7 + th, cz], color: '#8d8a84' });
      if (v % 2) parts.push({ shape: 'cylinder', size: [0.25, 6, 0.25], pos: [tw * 0.2, 7.9 + th, cz], color: '#c9c9c9' });
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
      }
      parts.push({ shape: 'box', size: [bw + 0.2, 0.5, bd + 0.2], pos: [0, h + 0.1, cz], color: '#d6d0c4' });
      parts.push({ shape: 'box', size: [bw * 0.92, 0.25, 1.8], pos: [0, 2.9, cz + bd / 2 + 0.9], color: s.accent, rot: [8, 0, 0] });
      parts.push({ shape: 'box', size: [bw * 0.7, 2.3, 0.15], pos: [0, 0.1, cz + bd / 2 + 0.05], color: GLASS });
      parts.push({ shape: 'box', size: [bw * 0.6, 1.1, 0.3], pos: [0, h + 0.6, cz + bd / 2 - 0.2], color: s.accent });
      break;
    }
    case 'office': {
      const bw = W - 2;
      const bd = D - 3;
      const h = s.floors * 3.4;
      const cz = front - 2 - bd / 2;
      parts.push({ shape: 'box', size: [bw, h, bd], pos: [0, 0.1, cz], color: s.wall, facade: 'office' });
      parts.push({ shape: 'box', size: [bw * 0.75, h * 0.25, bd * 0.75], pos: [0, h + 0.1, cz], color: s.wall, facade: 'office' });
      parts.push({ shape: 'box', size: [bw * 0.75 + 0.3, 0.8, bd * 0.75 + 0.3], pos: [0, h * 1.25 + 0.1, cz], color: s.accent });
      parts.push({ shape: 'box', size: [4, 3, 2], pos: [0, 0.1, cz + bd / 2 + 1], color: GLASS });
      break;
    }
    case 'mall': {
      const bw = W - 1.4;
      const bd = D - 4;
      const h = s.floors * 4.5;
      const cz = front - 3 - bd / 2;
      parts.push({ shape: 'box', size: [bw, h, bd], pos: [0, 0.1, cz], color: s.wall, facade: 'shop' });
      parts.push({ shape: 'box', size: [bw + 0.4, 0.8, bd + 0.4], pos: [0, h + 0.1, cz], color: s.accent });
      parts.push({ shape: 'box', size: [6, h + 1.5, 3], pos: [0, 0.1, cz + bd / 2 + 1.2], color: GLASS });
      parts.push({ shape: 'box', size: [7, 1.4, 0.4], pos: [0, h + 1, cz + bd / 2 + 2.6], color: s.accent });
      parts.push({ shape: 'box', size: [3, 1.6, 3], pos: [-bw * 0.25, h + 0.9, cz - bd * 0.2], color: '#8f8b84' });
      parts.push({ shape: 'box', size: [3, 1.6, 3], pos: [bw * 0.25, h + 0.9, cz - bd * 0.2], color: '#8f8b84' });
      break;
    }
    case 'warehouse': {
      const bw = W - 2;
      const bd = D - 4;
      const h = 4 + s.floors * 1.6;
      const cz = front - 3 - bd / 2;
      parts.push({ shape: 'box', size: [bw, h, bd], pos: [0, 0.1, cz], color: s.wall, facade: 'industrial' });
      parts.push({ shape: 'gable', size: [bw + 0.4, 1.6, bd + 0.4], pos: [0, h + 0.1, cz], color: s.roof, rot: [0, 90, 0] });
      const doors = Math.max(1, Math.floor(bw / 5));
      for (let k = 0; k < doors; k++) {
        const x = -bw / 2 + (bw / doors) * (k + 0.5);
        parts.push({ shape: 'box', size: [3, 3.4, 0.2], pos: [x, 0.1, cz + bd / 2 + 0.05], color: '#6f7479' });
      }
      parts.push({ shape: 'box', size: [bw, 0.15, 2.6], pos: [0, 0.1, cz + bd / 2 + 1.3], color: GROUND.concrete });
      break;
    }
    case 'factory': {
      const bw = W - 2;
      const bd = D - 3.5;
      const h = 5 + s.floors * 1.8;
      const cz = front - 2.5 - bd / 2;
      parts.push({ shape: 'box', size: [bw * 0.7, h, bd], pos: [-bw * 0.15, 0.1, cz], color: s.wall, facade: 'industrial' });
      parts.push({ shape: 'box', size: [bw * 0.7 + 0.3, 0.6, bd + 0.3], pos: [-bw * 0.15, h + 0.1, cz], color: s.roof });
      parts.push({ shape: 'box', size: [bw * 0.3, h * 0.6, bd * 0.45], pos: [bw * 0.35, 0.1, cz + bd * 0.25], color: s.accent, facade: 'office' });
      const stacks = s.floors >= 3 ? 2 : 1;
      for (let k = 0; k < stacks; k++) {
        parts.push({ shape: 'cylinder', size: [1.4, h + 9 + k * 3, 1.4], pos: [-bw * 0.35 + k * 3, 0.1, cz - bd * 0.25], color: '#8a7f75', segments: 10 });
        parts.push({ shape: 'cylinder', size: [1.6, 0.8, 1.6], pos: [-bw * 0.35 + k * 3, h + 8.4 + k * 3, cz - bd * 0.25], color: '#b5472f', segments: 10 });
      }
      if (D >= 16) {
        parts.push({ shape: 'cylinder', size: [3.4, 4.5, 3.4], pos: [bw * 0.33, 0.1, cz - bd * 0.25], color: '#c9c4ba', segments: 14 });
        parts.push({ shape: 'dome', size: [3.4, 0.8, 3.4], pos: [bw * 0.33, 4.6, cz - bd * 0.25], color: '#c9c4ba' });
      }
      break;
    }
  }
  return parts;
}

/** Colour palettes that growable variants rotate through (data, not engine logic). */
const PALETTES: Record<ProceduralStyle, { wall: string[]; roof: string[]; accent: string[] }> = {
  house: {
    wall: ['#efe3cf', '#e5d2bd', '#dbe5ea', '#f2eee6', '#e7cec3', '#d9d0b8'],
    roof: ['#9c4a3a', '#6b4f3f', '#5c6b7a', '#8a5a44', '#7a3b30', '#4f5a60'],
    accent: ['#a89f92', '#9a8f80', '#b0a493'],
  },
  apartment: { wall: ['#efe3cf', '#e5d2bd', '#dbe5ea', '#f2eee6', '#e7cec3', '#cfd6cf'], roof: ['#777'], accent: ['#b3aa9c', '#a39a8c', '#8f9aa3', '#9c8574'] },
  tower: { wall: ['#e9edf0', '#dfe6ea', '#eef1f3', '#e6e2da'], roof: ['#777'], accent: ['#5f6b75', '#4d5a64', '#3f4b55', '#6b5f55'] },
  shop: { wall: ['#efe7da', '#e6e1d8', '#f1ece2', '#e9dccb', '#dde3e6'], roof: ['#777'], accent: ['#d9483b', '#2f7dd1', '#e0a321', '#2fa36b', '#8a4fc2'] },
  office: { wall: ['#cfdbe4', '#b9cfdd', '#aac4d6', '#c9d2cf'], roof: ['#777'], accent: ['#5b6770', '#44515b', '#3d4a54'] },
  mall: { wall: ['#e8e2d6', '#e1e6ea', '#ece4d4'], roof: ['#777'], accent: ['#d9483b', '#2f7dd1', '#2fa36b'] },
  warehouse: { wall: ['#b8b3a7', '#a3a8ad', '#c4b49a', '#9fa79b'], roof: ['#6d7378', '#5f666c', '#7a6e5e', '#5a6a72'], accent: ['#777'] },
  factory: { wall: ['#b8b3a7', '#a3a8ad', '#c4b49a', '#c9cdd1'], roof: ['#6b6f73', '#5a5f64', '#6f655a'], accent: ['#d8d2c6', '#e4e1da'] },
};

/** Distinct looks per growable template (colours, roof shape). */
export const PROCEDURAL_VARIANTS = 3;

/** Variant `k` of a spec: rotates wall/roof/accent colours and the roof shape. Variant 0 is the spec itself. */
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
    wall: pick(p.wall, s.wall, k * 2),
    roof: pick(p.roof, s.roof, k),
    accent: pick(p.accent, s.accent, k),
  };
}
