/**
 * Picture looks — the mood of the whole image, on top of the time of day.
 * Each look scales the sun and sky light and the exposure, tints the fog,
 * sets how strong the drawn ink outlines are, and grades the final image
 * (saturation, contrast, warm / cool tint). "Standard" changes nothing and
 * costs nothing; the others add one cheap full-screen pass.
 */

export type LookId = 'standard' | 'soft' | 'gloomy' | 'vivid';

export interface Look {
  id: LookId;
  name: string;
  description: string;
  sun: number;
  sky: number;
  exposure: number;
  /** Fog colour blended towards this (0xrrggbb) by `fogMix`. */
  fogTint: number;
  fogMix: number;
  /** Fog starts nearer (< 1) for a hazier look. */
  fogNear: number;
  ink: number;
  saturation: number;
  contrast: number;
  /** Added to the final colour (small, signed): warm > 0 red, cool > 0 blue. */
  tint: [number, number, number];
}

export const LOOKS: readonly Look[] = [
  { id: 'standard', name: 'Standart', description: 'Oyunun olağan görünümü.', sun: 1, sky: 1, exposure: 1, fogTint: 0xbfd3e2, fogMix: 0, fogNear: 1, ink: 1, saturation: 1, contrast: 1, tint: [0, 0, 0] },
  { id: 'soft', name: 'Yumuşak', description: 'Sıcak, yumuşak ışık; gölgeler hafif, çizgiler ince.', sun: 0.82, sky: 1.25, exposure: 1.06, fogTint: 0xf1e2cf, fogMix: 0.35, fogNear: 0.8, ink: 0.55, saturation: 0.92, contrast: 0.9, tint: [0.025, 0.012, -0.01] },
  { id: 'gloomy', name: 'Kasvetli', description: 'Bulutlu, soğuk ve soluk bir gün.', sun: 0.45, sky: 0.95, exposure: 0.9, fogTint: 0x9aa4ad, fogMix: 0.7, fogNear: 0.45, ink: 0.85, saturation: 0.62, contrast: 1.05, tint: [-0.012, -0.004, 0.02] },
  { id: 'vivid', name: 'Canlı', description: 'Doygun renkler ve belirgin kontur çizgileri: çizgi film gibi.', sun: 1.1, sky: 1.05, exposure: 1.04, fogTint: 0xcfe6ff, fogMix: 0.25, fogNear: 1.2, ink: 1.35, saturation: 1.32, contrast: 1.08, tint: [0, 0.005, 0.012] },
];

export const getLook = (id: LookId): Look => LOOKS.find((l) => l.id === id) ?? LOOKS[0];

/** Does the look need the grading pass? */
export const needsGrade = (l: Look): boolean => l.saturation !== 1 || l.contrast !== 1 || l.tint.some((v) => v !== 0);
