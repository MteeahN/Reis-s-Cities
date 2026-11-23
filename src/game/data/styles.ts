/** Architectural styles a district (zoned cells) can be given; growable buildings take their lot's style. */
export const ARCH_STYLES = ['modern', 'european', 'asian', 'mediterranean', 'ottoman'] as const;
export type ArchStyle = (typeof ARCH_STYLES)[number];

export interface ArchStyleDef {
  id: ArchStyle;
  name: string;
  description: string;
  /** Swatch colours for the UI (wall, roof, accent). */
  swatch: [string, string, string];
  /** Palettes the growables of this style draw from (modern keeps each template's own colours). */
  walls: string[];
  roofs: string[];
  accents: string[];
  /** Industrial walls (brick, render or cladding). */
  industry: string[];
}

export const ARCH_STYLE_DEFS: Record<ArchStyle, ArchStyleDef> = {
  modern: {
    id: 'modern',
    name: 'Modern',
    description: 'Düz çatılar, cam ve sıva cepheler, çağdaş kuleler.',
    swatch: ['#e9edf0', '#5f6b75', '#2f7dd1'],
    walls: [],
    roofs: [],
    accents: [],
    industry: [],
  },
  european: {
    id: 'european',
    name: 'Avrupa',
    description: 'Kiremit çatılar, sarı-krem sıvalar, panjurlar, mansart çatılı apartmanlar, çizgili tenteler.',
    swatch: ['#e8c98f', '#b5552f', '#3f5a3a'],
    walls: ['#e8c98f', '#efe3c4', '#e3b49a', '#f0dba0', '#d9b38c', '#efe9dc', '#e6c6a8'],
    roofs: ['#b5552f', '#a34a2a', '#c0653a', '#8f3f26', '#5f6670'],
    accents: ['#3f5a3a', '#6b4a2f', '#7a3b2e', '#2f4a5a', '#5a6b3a'],
    industry: ['#9c4a32', '#8f4430', '#a85a3c'],
  },
  asian: {
    id: 'asian',
    name: 'Asya',
    description: 'Geniş saçaklı, uçları kalkık kiremit çatılar, ahşap verandalar, fenerler, dikey neon tabelalar, pagoda tepeli kuleler.',
    swatch: ['#f2efe6', '#3d4750', '#b3261e'],
    walls: ['#f2efe6', '#e8e2d4', '#d9cbb0', '#ece6da', '#cdbfa6'],
    roofs: ['#3d4750', '#4a3f3a', '#2f3a44', '#5a4a3a', '#7a2a24'],
    accents: ['#b3261e', '#8a5a3c', '#2b2f36', '#c9a35a', '#6b2f2a'],
    industry: ['#b8b3a7', '#a3a8ad', '#9fa79b'],
  },
  mediterranean: {
    id: 'mediterranean',
    name: 'Akdeniz',
    description: 'Beyaz badanalı duvarlar, mavi panjurlar, kemerler, düz teras çatılar, begonviller ve pergolalar.',
    swatch: ['#f6f3ec', '#c0653a', '#2f6db5'],
    walls: ['#f6f3ec', '#f1ebe0', '#efe2c8', '#e9d9bc', '#f3efe4'],
    roofs: ['#c0653a', '#b5552f', '#d07a45'],
    accents: ['#2f6db5', '#1f8f8f', '#3d8a4d', '#5a8fa8', '#2a5a8a'],
    industry: ['#e9e2d2', '#d9cfbc', '#cfc4ae'],
  },
  ottoman: {
    id: 'ottoman',
    name: 'Osmanlı',
    description: 'Taş zemin kat üstünde çıkmalı (cumbalı) ahşap katlar, geniş saçaklı kırma çatılar, kubbeli çarşılar.',
    swatch: ['#efe3c8', '#a34a2a', '#6b4a2f'],
    walls: ['#efe3c8', '#e6d2b0', '#f2e8d4', '#d9c3a0', '#ead8bd', '#c9a37a'],
    roofs: ['#a34a2a', '#8f3f26', '#b5552f', '#9a4a30'],
    accents: ['#6b4a2f', '#5a3a24', '#7a5a3c', '#4a3020'],
    industry: ['#b59a7a', '#a88c6a', '#c4a985'],
  },
};

export const archStyleIndex = (s: ArchStyle): number => ARCH_STYLES.indexOf(s);
export const archStyleAt = (i: number): ArchStyle => ARCH_STYLES[i] ?? 'modern';
export const isArchStyle = (v: unknown): v is ArchStyle => (ARCH_STYLES as readonly string[]).includes(v as string);
