export type QualityLevel = 'high' | 'medium' | 'low';
export type QualitySetting = QualityLevel | 'auto';
export type ShadowQuality = 'off' | 'low' | 'medium' | 'high';

export const SHADOW_MAP_SIZE: Record<Exclude<ShadowQuality, 'off'>, number> = { low: 1024, medium: 2048, high: 4096 };

export interface QualityPreset {
  pixelRatioCap: number;
  shadows: ShadowQuality;
  vegetationLod: number;
  /** Most vehicles drawn at once. */
  vehicles: number;
  /** Camera distance below which small building details are drawn. */
  buildingDetail: number;
  bloom: boolean;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  high: { pixelRatioCap: 1.5, shadows: 'high', vegetationLod: 380, vehicles: 600, buildingDetail: 900, bloom: true },
  medium: { pixelRatioCap: 1.25, shadows: 'medium', vegetationLod: 280, vehicles: 350, buildingDetail: 600, bloom: false },
  low: { pixelRatioCap: 0.85, shadows: 'off', vegetationLod: 200, vehicles: 150, buildingDetail: 350, bloom: false },
};

const ORDER: QualityLevel[] = ['high', 'medium', 'low'];

/**
 * Dynamic graphics quality: in 'auto' mode it samples frame times and steps
 * the preset down when the frame rate stays low (and back up when there is
 * sustained headroom). Pure logic — the Game applies the chosen preset.
 */
export class QualityManager {
  setting: QualitySetting = 'auto';
  /** When false (fixed preset or custom settings) the level never changes on its own. */
  adaptive = true;
  level: QualityLevel = 'high';
  private accTime = 0;
  private frames = 0;
  private goodWindows = 0;
  private cooldown = 2; // seconds to ignore after start/changes
  private readonly tooHeavy = new Set<QualityLevel>();

  constructor(private readonly onChange: (level: QualityLevel) => void) {}

  setSetting(s: QualitySetting): void {
    this.setting = s;
    this.adaptive = s === 'auto';
    if (s !== 'auto') this.apply(s);
    else this.cooldown = 2;
  }

  private apply(level: QualityLevel): void {
    if (level === this.level) return;
    this.level = level;
    this.cooldown = 3;
    this.accTime = 0;
    this.frames = 0;
    this.goodWindows = 0;
    this.onChange(level);
  }

  /** Feed real frame delta (seconds). Returns the averaged FPS when a window closes. */
  sample(dt: number): number | null {
    if (this.cooldown > 0) {
      this.cooldown -= dt;
      return null;
    }
    // A >250 ms gap means the tab was throttled/backgrounded or the main thread
    // stalled (e.g. a GC or shader compile) — not a rendering-load signal.
    if (dt > 0.25) {
      this.accTime = 0;
      this.frames = 0;
      return null;
    }
    this.accTime += dt;
    this.frames++;
    if (this.accTime < 2.5) return null;
    const fps = this.frames / this.accTime;
    this.accTime = 0;
    this.frames = 0;
    const hidden = typeof document !== 'undefined' && document.hidden;
    if (this.setting === 'auto' && this.adaptive && !hidden) {
      const idx = ORDER.indexOf(this.level);
      if (fps < 42 && idx < ORDER.length - 1) {
        this.tooHeavy.add(this.level); // never climb back to a level that proved too slow
        this.apply(ORDER[idx + 1]);
      } else if (fps > 58) {
        this.goodWindows++;
        if (this.goodWindows >= 6 && idx > 0 && !this.tooHeavy.has(ORDER[idx - 1])) this.apply(ORDER[idx - 1]);
      } else {
        this.goodWindows = 0;
      }
    }
    return fps;
  }
}
