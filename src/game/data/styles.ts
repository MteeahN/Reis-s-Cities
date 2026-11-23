/** Architectural styles a district (zoned cells) can be given; growable buildings take their lot's style. */
export const ARCH_STYLES = ['modern', 'european', 'asian', 'mediterranean', 'ottoman', 'nordic', 'arabic', 'slavic', 'american', 'medieval', 'futuristic'] as const;
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
  nordic: {
    id: 'nordic',
    name: 'İskandinav',
    description: 'Koyu kırmızı, hardal ve beyaz ahşap kaplamalar, beyaz köşe pervazları, dik ve saçaksız çatılar, yeşil (çimen) çatılar.',
    swatch: ['#8e2a22', '#2f3336', '#f2f0ea'],
    walls: ['#8e2a22', '#d9a441', '#f2f0ea', '#3e4a52', '#a8b5a2', '#7a2a24', '#e8e2d2'],
    roofs: ['#2f3336', '#3a3f44', '#4a3f3a', '#5e6b4f'],
    accents: ['#f2f0ea', '#e8e4da', '#2f3336'],
    industry: ['#8e2a22', '#3e4a52', '#a3a8ad'],
  },
  arabic: {
    id: 'arabic',
    name: 'Arap',
    description: 'Kum rengi kerpiç duvarlar, mazgallı düz çatılar, ahşap kafesli (meşrebiye) cumbalar, sivri kemerler, rüzgâr kuleleri ve kubbeler.',
    swatch: ['#e2c79a', '#b88a52', '#1f6f78'],
    walls: ['#e2c79a', '#d9b98a', '#efdcb8', '#cfa978', '#e8d2aa', '#f0e4cc'],
    roofs: ['#b88a52', '#c99a62', '#a87a48'],
    accents: ['#1f6f78', '#7a4a2a', '#2f5a8a', '#5a3a24'],
    industry: ['#d9b98a', '#cfa978', '#c4a070'],
  },
  slavic: {
    id: 'slavic',
    name: 'Slav',
    description: 'Pastel sıvalar (nane, pembe, sarı), oymalı beyaz pencere süsleri, yeşil saç çatılar, soğan kubbeli kuleler.',
    swatch: ['#a8d5c2', '#2f6b4f', '#f2f0ea'],
    walls: ['#a8d5c2', '#f2c6c2', '#f0d98a', '#c9d8ef', '#efe3cf', '#d9c2e6'],
    roofs: ['#2f6b4f', '#3a5a7a', '#7a2a2a', '#4f5a60'],
    accents: ['#f2f0ea', '#e8e4da', '#c9a35a'],
    industry: ['#b5472f', '#a3a8ad', '#c4b49a'],
  },
  american: {
    id: 'american',
    name: 'Amerikan',
    description: 'Yatay ahşap kaplamalı verandalı evler, kahverengi taş merdivenli apartmanlar, yangın merdivenleri, çatıda su tankları ve reklam panoları.',
    swatch: ['#8a4a36', '#3f4448', '#e8e4da'],
    walls: ['#8a4a36', '#e8e4da', '#c9d6df', '#efe3c4', '#b9704f', '#d6dcd0', '#7a5a4a'],
    roofs: ['#3f4448', '#4f5a60', '#5c4a3f', '#2f3336'],
    accents: ['#e8e4da', '#2b2e31', '#7a3b2e', '#3a4a5a'],
    industry: ['#9c4a32', '#8f4430', '#a3a8ad'],
  },
  medieval: {
    id: 'medieval',
    name: 'Orta Çağ',
    description: 'Taş zemin kat üstünde koyu ahşap çatkılı (yarım ahşap) beyaz duvarlar, çıkma üst katlar, çok dik kiremit ve arduvaz çatılar, köşe kuleleri.',
    swatch: ['#efe9dc', '#3a2a20', '#6b4a3a'],
    walls: ['#efe9dc', '#e8dcc4', '#f2ead8', '#e6d6b8', '#ddd2bc'],
    roofs: ['#6b4a3a', '#8f4430', '#4a4f55', '#5a3a2a'],
    accents: ['#3a2a20', '#4a3020', '#2e2620'],
    industry: ['#9a8f80', '#8a8070', '#a89f92'],
  },
  futuristic: {
    id: 'futuristic',
    name: 'Fütüristik',
    description: 'Beyaz ve gümüş yuvarlak hatlar, camekân cepheler, turkuaz ışık şeritleri, çatı kubbeleri, halkalar ve güneş kanatları.',
    swatch: ['#eef2f5', '#9aa7b0', '#2fd5e0'],
    walls: ['#eef2f5', '#dfe6ea', '#e6ecef', '#c9d3da', '#f4f6f7'],
    roofs: ['#9aa7b0', '#7f8c94', '#b8c2c9'],
    accents: ['#2fd5e0', '#56e0b0', '#7a8cff', '#2fa8e0'],
    industry: ['#c9d3da', '#b8c2c9', '#dfe6ea'],
  },
};

export const archStyleIndex = (s: ArchStyle): number => ARCH_STYLES.indexOf(s);
export const archStyleAt = (i: number): ArchStyle => ARCH_STYLES[i] ?? 'modern';
export const isArchStyle = (v: unknown): v is ArchStyle => (ARCH_STYLES as readonly string[]).includes(v as string);
