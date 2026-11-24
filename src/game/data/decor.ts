/**
 * Ground paints and decorations (benches, gazebos, fountains…): data only.
 * Both are cosmetic: they cost money and make places look lived-in; they do
 * not change land value, happiness or any other simulation number.
 */
import type { BuildingPart } from './buildings';
import { WORLD_SIZE } from '../core/config';

// ---------------------------------------------------------------- ground paint

/** Paint grid: one texel per PAINT_STEP metres. */
export const PAINT_STEP = 2;
export const PAINT_RES = WORLD_SIZE / PAINT_STEP;

export interface PaintDef {
  /** Value stored in the paint grid (1…). */
  id: number;
  key: string;
  name: string;
  /** ₺ per m². */
  price: number;
  /** Swatch colour for the UI. */
  swatch: string;
}

export const PAINTS: readonly PaintDef[] = [
  { id: 1, key: 'stone', name: 'Parke taşı', price: 3, swatch: '#9a968e' },
  { id: 2, key: 'tile', name: 'Karo', price: 4, swatch: '#d8d1c2' },
  { id: 3, key: 'brick', name: 'Tuğla', price: 3, swatch: '#a8452c' },
  { id: 4, key: 'gravel', name: 'Çakıl', price: 1, swatch: '#c9b99a' },
  { id: 5, key: 'sand', name: 'Kum', price: 1, swatch: '#e6d3a1' },
  { id: 6, key: 'lawn', name: 'Biçilmiş çim', price: 1, swatch: '#6fae4a' },
  { id: 7, key: 'wood', name: 'Ahşap döşeme', price: 5, swatch: '#9c6b43' },
  { id: 8, key: 'asphalt', name: 'Asfalt', price: 2, swatch: '#4a4d52' },
];

export const getPaint = (id: number): PaintDef | undefined => PAINTS.find((p) => p.id === id);

// ---------------------------------------------------------------- decorations

export type PropGroup = 'rest' | 'garden' | 'water' | 'play' | 'street';

export const PROP_GROUPS: { id: PropGroup; name: string }[] = [
  { id: 'rest', name: 'Dinlenme' },
  { id: 'garden', name: 'Bahçe' },
  { id: 'water', name: 'Su ve anıt' },
  { id: 'play', name: 'Oyun' },
  { id: 'street', name: 'Sokak' },
];

export interface PropDef {
  id: string;
  name: string;
  group: PropGroup;
  cost: number;
  /** Space it takes (m): props keep this far from each other, roads and buildings. */
  radius: number;
  /** Model: primitive parts around the origin, base at y = 0, front facing +z. */
  parts: BuildingPart[];
}

type V3 = [number, number, number];
const box = (size: V3, pos: V3, color: string, rot?: V3): BuildingPart => ({ shape: 'box', size, pos, color, ...(rot ? { rot } : {}) });
const cyl = (d: number, h: number, pos: V3, color: string, segments = 10, rot?: V3): BuildingPart => ({ shape: 'cylinder', size: [d, h, d], pos, color, segments, ...(rot ? { rot } : {}) });

const WOOD = '#9c6b43';
const IRON = '#2b2e31';
const STONE = '#c9c3b6';
const GREEN = '#4f7f33';
const LEAF = '#5f9a3c';
const WHITE = '#efece4';
const WATER = '#5aa9c9';

function bench(): BuildingPart[] {
  return [
    box([1.8, 0.08, 0.45], [0, 0.42, 0], WOOD),
    box([1.8, 0.4, 0.06], [0, 0.5, -0.22], WOOD, [-12, 0, 0]),
    ...[-0.75, 0.75].map((x) => box([0.08, 0.42, 0.42], [x, 0, 0], IRON)),
  ];
}

function tree(x: number, z: number, s: number): BuildingPart[] {
  return [cyl(0.25 * s, 1.6 * s, [x, 0, z], '#5a4330', 6), { shape: 'dome', size: [2.2 * s, 1.8 * s, 2.2 * s], pos: [x, 1.4 * s, z], color: LEAF, segments: 8 }];
}

export const PROPS: readonly PropDef[] = [
  { id: 'bench', name: 'Park bankı', group: 'rest', cost: 200, radius: 1.2, parts: bench() },
  {
    id: 'bench_pair',
    name: 'Karşılıklı banklar',
    group: 'rest',
    cost: 450,
    radius: 2,
    parts: [...bench().map((p) => ({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2] - 1.1] as V3 })), ...bench().map((p) => ({ ...p, pos: [p.pos[0], p.pos[1], -p.pos[2] + 1.1] as V3, rot: p.rot ? ([-p.rot[0], 0, 0] as V3) : undefined })), cyl(0.5, 0.9, [0, 0, 0], IRON, 8)],
  },
  {
    id: 'picnic',
    name: 'Piknik masası',
    group: 'rest',
    cost: 260,
    radius: 1.6,
    parts: [box([1.8, 0.07, 0.8], [0, 0.72, 0], WOOD), box([1.8, 0.06, 0.3], [0, 0.42, 0.62], WOOD), box([1.8, 0.06, 0.3], [0, 0.42, -0.62], WOOD), ...[-0.7, 0.7].map((x) => box([0.08, 0.72, 1.5], [x, 0, 0], WOOD))],
  },
  {
    id: 'cafe_set',
    name: 'Kafe masası ve sandalyeler',
    group: 'rest',
    cost: 300,
    radius: 1.4,
    parts: [cyl(0.7, 0.04, [0, 0.72, 0], WHITE, 12), cyl(0.06, 0.72, [0, 0, 0], IRON, 6), ...[[-0.7, 0], [0.7, 0]].flatMap(([x, z]) => [box([0.42, 0.05, 0.42], [x, 0.45, z], WOOD), box([0.42, 0.45, 0.05], [x + (x < 0 ? -0.2 : 0.2), 0.45, z], WOOD, [0, 90, 0]), ...[-0.18, 0.18].map((dz) => box([0.04, 0.45, 0.04], [x, 0, z + dz], IRON))]), { shape: 'cone', size: [2.2, 0.6, 2.2], pos: [0, 2.0, 0], color: '#c0392b', segments: 8 }, cyl(0.05, 2.0, [0, 0, 0], '#d0ccc4', 4)],
  },
  { id: 'deckchairs', name: 'Şezlonglar', group: 'rest', cost: 160, radius: 1.6, parts: [-0.6, 0.6].flatMap((x) => [box([0.55, 0.06, 1.6], [x, 0.3, 0], '#e9e2cf', [8, 0, 0]), box([0.55, 0.05, 0.6], [x, 0.55, -0.6], '#2f6db5', [-45, 0, 0]), box([0.06, 0.3, 1.4], [x - 0.25, 0, 0], WOOD), box([0.06, 0.3, 1.4], [x + 0.25, 0, 0], WOOD)]) },
  {
    id: 'gazebo',
    name: 'Çardak',
    group: 'garden',
    cost: 1500,
    radius: 2.8,
    parts: [cyl(4.2, 0.25, [0, 0, 0], STONE, 8), ...Array.from({ length: 6 }, (_, k) => cyl(0.18, 2.4, [Math.cos((k / 6) * Math.PI * 2) * 1.8, 0.25, Math.sin((k / 6) * Math.PI * 2) * 1.8], WHITE, 6)), { shape: 'cone', size: [4.8, 1.6, 4.8], pos: [0, 2.65, 0], color: '#3f6b5a', segments: 6 }, cyl(0.14, 0.6, [0, 4.25, 0], '#d4b04a', 6), box([1.6, 0.08, 0.4], [0, 0.65, -1.2], WOOD)],
  },
  {
    id: 'pergola',
    name: 'Sarmaşıklı pergola',
    group: 'garden',
    cost: 1600,
    radius: 2.6,
    parts: [...[-1.8, 1.8].flatMap((x) => [-1.1, 1.1].map((z) => box([0.2, 2.5, 0.2], [x, 0, z], WHITE))), ...[-1.1, 1.1].map((z) => box([4.2, 0.18, 0.2], [0, 2.5, z], WHITE)), ...[-1.6, -0.8, 0, 0.8, 1.6].map((x) => box([0.12, 0.12, 2.8], [x, 2.68, 0], WOOD)), box([3.6, 0.35, 2.4], [0, 2.8, 0], LEAF)],
  },
  { id: 'flowerbed', name: 'Çiçek tarhı', group: 'garden', cost: 120, radius: 1.3, parts: [box([2.2, 0.3, 1.2], [0, 0, 0], STONE), box([2.0, 0.25, 1.0], [0, 0.3, 0], '#5c3a2a'), ...[-0.7, -0.2, 0.3, 0.8].map((x, k) => ({ shape: 'dome', size: [0.5, 0.4, 0.5], pos: [x, 0.5, (k % 2) * 0.3 - 0.15], color: ['#d9483b', '#e0a321', '#c2549b', '#f2f0ea'][k], segments: 6 }) as BuildingPart)] },
  { id: 'hedge', name: 'Budanmış çit', group: 'garden', cost: 90, radius: 1.6, parts: [box([3, 1.1, 0.7], [0, 0, 0], GREEN)] },
  { id: 'planter_tree', name: 'Saksıda ağaç', group: 'garden', cost: 180, radius: 1, parts: [box([1, 0.6, 1], [0, 0, 0], STONE), ...tree(0, 0, 0.8).map((p) => ({ ...p, pos: [p.pos[0], p.pos[1] + 0.6, p.pos[2]] as V3 }))] },
  { id: 'shed', name: 'Bahçe kulübesi', group: 'garden', cost: 1500, radius: 2, parts: [box([2.6, 2, 2], [0, 0, 0], '#8a5a3c'), { shape: 'gable', size: [2.9, 1, 2.3], pos: [0, 2, 0], color: '#5a3a2a' }, box([0.8, 1.6, 0.05], [0.4, 0, 1.01], '#4a3020')] },
  {
    id: 'fountain',
    name: 'Süs havuzu',
    group: 'water',
    cost: 2200,
    radius: 2.6,
    parts: [cyl(4.6, 0.55, [0, 0, 0], STONE, 18), cyl(4.0, 0.1, [0, 0.45, 0], WATER, 18), cyl(1.2, 0.9, [0, 0.5, 0], STONE, 10), cyl(1.6, 0.15, [0, 1.4, 0], STONE, 12), cyl(0.3, 0.8, [0, 1.55, 0], STONE, 8)],
  },
  { id: 'statue', name: 'Heykel', group: 'water', cost: 1800, radius: 1.3, parts: [box([1.4, 1.2, 1.4], [0, 0, 0], STONE), box([1.2, 0.15, 1.2], [0, 1.2, 0], '#b5ad9e'), cyl(0.5, 1.4, [0, 1.35, 0], '#7a8a7a', 8), { shape: 'dome', size: [0.45, 0.5, 0.45], pos: [0, 2.75, 0], color: '#7a8a7a', segments: 8 }] },
  {
    id: 'bandstand',
    name: 'Müzik köşkü',
    group: 'water',
    cost: 5200,
    radius: 3.6,
    parts: [cyl(6.4, 0.8, [0, 0, 0], STONE, 8), ...Array.from({ length: 8 }, (_, k) => cyl(0.2, 2.8, [Math.cos((k / 8) * Math.PI * 2) * 2.8, 0.8, Math.sin((k / 8) * Math.PI * 2) * 2.8], WHITE, 6)), cyl(6.6, 0.25, [0, 3.6, 0], WHITE, 8), { shape: 'dome', size: [6.2, 2, 6.2], pos: [0, 3.85, 0], color: '#3f6b5a', segments: 8 }, cyl(0.12, 0.8, [0, 5.8, 0], '#d4b04a', 6)],
  },
  { id: 'slide', name: 'Kaydırak', group: 'play', cost: 900, radius: 2.4, parts: [box([1, 2, 1], [0, 0, -1.2], '#e0a321'), box([1, 0.1, 1], [0, 2, -1.2], '#e0a321'), box([0.7, 0.12, 3], [0, 1, 0.6], '#d9483b', [-35, 0, 0]), box([0.5, 2, 0.1], [0, 0, -1.75], IRON, [15, 0, 0])] },
  { id: 'swing', name: 'Salıncak', group: 'play', cost: 800, radius: 2.2, parts: [...[-1.6, 1.6].flatMap((x) => [box([0.12, 2.5, 0.12], [x, 0, -0.6], '#2f6db5', [-12, 0, 0]), box([0.12, 2.5, 0.12], [x, 0, 0.6], '#2f6db5', [12, 0, 0])]), box([3.4, 0.12, 0.12], [0, 2.42, 0], '#2f6db5'), ...[-0.6, 0.6].flatMap((x) => [box([0.03, 1.8, 0.03], [x, 0.6, 0], IRON), box([0.5, 0.05, 0.25], [x, 0.55, 0], '#d9483b')])] },
  { id: 'sandbox', name: 'Kum havuzu', group: 'play', cost: 400, radius: 1.8, parts: [box([3, 0.3, 3], [0, 0, 0], WOOD), box([2.7, 0.2, 2.7], [0, 0.12, 0], '#e6d3a1')] },
  { id: 'kiosk', name: 'Gazete köşkü', group: 'street', cost: 1100, radius: 1.8, parts: [cyl(2.2, 2.4, [0, 0, 0], '#2f5d4a', 8), { shape: 'cone', size: [2.8, 1, 2.8], pos: [0, 2.4, 0], color: '#2f5d4a', segments: 8 }, box([1.2, 0.8, 0.1], [0, 1.2, 1.1], '#efe3c4')] },
  { id: 'flower_stall', name: 'Çiçekçi tezgâhı', group: 'street', cost: 900, radius: 1.8, parts: [box([2.4, 0.9, 1], [0, 0, 0], WOOD), ...[-0.8, 0, 0.8].map((x, k) => ({ shape: 'dome', size: [0.6, 0.5, 0.6], pos: [x, 0.9, 0], color: ['#d9483b', '#e0a321', '#c2549b'][k], segments: 6 }) as BuildingPart), box([2.6, 0.08, 1.4], [0, 2.1, 0], '#c0392b', [8, 0, 0]), ...[-1.1, 1.1].map((x) => box([0.06, 2.1, 0.06], [x, 0, 0.5], IRON))] },
  { id: 'bike_rack', name: 'Bisiklet parkı', group: 'street', cost: 150, radius: 1.4, parts: [box([2.4, 0.08, 0.6], [0, 0, 0], '#9aa1a8'), ...[-0.9, -0.3, 0.3, 0.9].map((x) => box([0.06, 0.8, 0.5], [x, 0.08, 0], IRON))] },
  { id: 'trash_bin', name: 'Çöp kutusu', group: 'street', cost: 60, radius: 0.6, parts: [cyl(0.55, 0.9, [0, 0, 0], '#3c6b45', 10), cyl(0.6, 0.06, [0, 0.9, 0], IRON, 10)] },
];

export const getProp = (id: string): PropDef => {
  const p = PROPS.find((d) => d.id === id);
  if (!p) throw new Error(`Unknown prop: ${id}`);
  return p;
};
export const isPropId = (id: unknown): id is string => PROPS.some((p) => p.id === id);
