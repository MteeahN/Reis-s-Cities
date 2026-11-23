import type { AudioSettings } from '../core/settings';

export type SfxId = 'road' | 'place' | 'line' | 'demolish' | 'zone' | 'error' | 'milestone' | 'click' | 'upgrade';

/** What the listener (camera) is near right now — all measured from the real city. */
export interface AmbienceInput {
  /** Vehicles currently driving on the roads around the camera. */
  vehicles: number;
  /** Buildings within earshot of the camera focus. */
  buildings: number;
  /** Trees within earshot of the camera focus. */
  trees: number;
  /** Camera distance from its focus (m). */
  cameraDistance: number;
  /** 0 day … 1 night. */
  night: number;
  /** True while the simulation is paused (traffic stands still). */
  paused: boolean;
}

export interface AmbienceMix {
  traffic: number;
  city: number;
  wind: number;
  birds: number;
  crickets: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * Ambience levels (0–1) from what is around the camera. Pure: the sound
 * follows the city — busy roads rumble, dense blocks hum, woods have birds
 * by day and crickets by night, and zooming out leaves mostly wind.
 */
export function ambienceMix(i: AmbienceInput): AmbienceMix {
  const near = 1 - smooth(250, 1300, i.cameraDistance);
  const urban = clamp01(i.buildings / 60);
  const nature = clamp01(i.trees / 120) * (1 - urban * 0.7);
  return {
    traffic: Math.pow(clamp01(i.vehicles / 90), 0.7) * near * (i.paused ? 0.12 : 1),
    city: urban * near * (1 - i.night * 0.45),
    wind: 0.18 + 0.55 * smooth(350, 1500, i.cameraDistance) + 0.15 * (1 - urban),
    birds: nature * (1 - i.night) * near,
    crickets: nature * i.night * near,
  };
}

/** Effective gain of a channel after master volume and mute. */
export function channelGain(s: AudioSettings, channel: 'ambience' | 'effects'): number {
  return s.muted ? 0 : s.master * s[channel];
}

/**
 * Procedural game audio with the Web Audio API — no sample files. Looping
 * filtered-noise beds (traffic, city hum, wind) follow `ambienceMix`; birds
 * and crickets are scheduled synthetic calls; effects are short synthesized
 * sounds for building, demolishing, zoning, errors and milestones. The
 * context starts on the first user gesture (browser autoplay rules).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private ambienceBus!: GainNode;
  private effectsBus!: GainNode;
  private noise!: AudioBuffer;
  private beds: Partial<Record<'traffic' | 'city' | 'wind', { gain: GainNode; filter: BiquadFilterNode }>> = {};
  private mix: AmbienceMix = { traffic: 0, city: 0, wind: 0.2, birds: 0, crickets: 0 };
  private birdTimer = 2;
  private cricketTimer = 1;
  private windPhase = 0;
  private lastSfx = new Map<SfxId, number>();
  settings: AudioSettings;

  constructor(settings: AudioSettings) {
    this.settings = { ...settings };
  }

  get running(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Creates/resumes the audio context; call from a user gesture. */
  unlock(): void {
    const Ctor = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
    if (!Ctor) return;
    if (!this.ctx) {
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.build();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private build(): void {
    const ctx = this.ctx!;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.ambienceBus = ctx.createGain();
    this.effectsBus = ctx.createGain();
    this.ambienceBus.connect(this.master);
    this.effectsBus.connect(this.master);
    // 3 s of pink-ish noise, looped by every bed.
    const len = ctx.sampleRate * 3;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
    const bed = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      src.loopStart = Math.random();
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      filter.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.ambienceBus);
      src.start();
      return { gain, filter };
    };
    this.beds.traffic = bed('lowpass', 420, 0.6);
    this.beds.city = bed('bandpass', 260, 0.8);
    this.beds.wind = bed('bandpass', 520, 0.45);
    this.applyVolumes();
  }

  setSettings(s: AudioSettings): void {
    this.settings = { ...s };
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.master, t, 0.05);
    this.ambienceBus.gain.setTargetAtTime(this.settings.ambience, t, 0.05);
    this.effectsBus.gain.setTargetAtTime(this.settings.effects, t, 0.05);
  }

  /** Called a few times per second with what is around the camera. */
  update(dt: number, input: AmbienceInput): void {
    this.mix = ambienceMix(input);
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const m = this.mix;
    this.beds.traffic!.gain.gain.setTargetAtTime(m.traffic * 0.55, t, 0.6);
    this.beds.city!.gain.gain.setTargetAtTime(m.city * 0.22, t, 0.8);
    this.windPhase += dt;
    const gust = 0.75 + 0.25 * Math.sin(this.windPhase * 0.4) * Math.sin(this.windPhase * 0.13);
    this.beds.wind!.gain.gain.setTargetAtTime(m.wind * 0.3 * gust, t, 1.2);
    this.beds.wind!.filter.frequency.setTargetAtTime(420 + 260 * gust, t, 1.5);
    // Calls are scheduled more often the stronger the layer is.
    this.birdTimer -= dt;
    if (m.birds > 0.05 && this.birdTimer <= 0) {
      this.birdTimer = 0.8 + Math.random() * 4 / (0.3 + m.birds);
      this.bird(m.birds);
    }
    this.cricketTimer -= dt;
    if (m.crickets > 0.05 && this.cricketTimer <= 0) {
      this.cricketTimer = 0.4 + Math.random() * 1.6 / (0.3 + m.crickets);
      this.cricket(m.crickets);
    }
  }

  get currentMix(): AmbienceMix {
    return this.mix;
  }

  // ---------------------------------------------------------------- synth helpers

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number): void {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(type: OscillatorType, f0: number, f1: number, t: number, dur: number, peak: number, bus: GainNode): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, Math.min(0.01, dur * 0.2), dur);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(t: number, dur: number, peak: number, type: BiquadFilterType, freq: number, bus: GainNode, freqEnd?: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1.6;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    this.env(g, t, peak, 0.01, dur);
    src.connect(f).connect(g).connect(bus);
    src.start(t, Math.random() * 2);
    src.stop(t + dur + 0.05);
  }

  private bird(level: number): void {
    const t = this.ctx!.currentTime + 0.02;
    const base = 2400 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.09 + Math.random() * 0.05);
      this.tone('sine', base * (0.9 + Math.random() * 0.2), base * (1.15 + Math.random() * 0.3), s, 0.07, 0.05 * level, this.ambienceBus);
    }
  }

  private cricket(level: number): void {
    const t = this.ctx!.currentTime + 0.02;
    const f = 4300 + Math.random() * 500;
    for (let i = 0; i < 6; i++) this.tone('triangle', f, f * 0.98, t + i * 0.035, 0.025, 0.02 * level, this.ambienceBus);
  }

  /** One-shot effect. Rapid repeats of the same effect are throttled. */
  play(id: SfxId): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const minGap = id === 'zone' ? 0.09 : 0.05;
    if (now - (this.lastSfx.get(id) ?? -1) < minGap) return;
    this.lastSfx.set(id, now);
    const bus = this.effectsBus;
    const t = now + 0.005;
    switch (id) {
      case 'road':
        this.tone('sine', 110, 48, t, 0.28, 0.5, bus);
        this.burst(t, 0.35, 0.18, 'lowpass', 1400, bus, 300);
        break;
      case 'upgrade':
        this.tone('sine', 140, 60, t, 0.25, 0.4, bus);
        this.tone('triangle', 520, 780, t + 0.08, 0.14, 0.12, bus);
        break;
      case 'place':
        this.tone('sine', 95, 45, t, 0.3, 0.55, bus);
        this.tone('triangle', 320, 260, t + 0.11, 0.12, 0.2, bus);
        this.tone('triangle', 420, 340, t + 0.22, 0.1, 0.16, bus);
        break;
      case 'line':
        this.burst(t, 0.16, 0.14, 'bandpass', 900, bus, 2600);
        this.tone('triangle', 660, 990, t, 0.1, 0.08, bus);
        break;
      case 'demolish':
        this.burst(t, 0.9, 0.42, 'lowpass', 1800, bus, 160);
        this.tone('sine', 70, 35, t, 0.6, 0.45, bus);
        break;
      case 'zone':
        this.tone('sine', 1250, 1150, t, 0.05, 0.08, bus);
        break;
      case 'error':
        this.tone('square', 240, 230, t, 0.1, 0.06, bus);
        this.tone('square', 180, 170, t + 0.12, 0.14, 0.06, bus);
        break;
      case 'milestone':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone('triangle', f, f, t + i * 0.12, 0.5, 0.14, bus));
        break;
      case 'click':
        this.tone('sine', 1800, 1500, t, 0.03, 0.05, bus);
        break;
    }
  }

  dispose(): void {
    void this.ctx?.close();
    this.ctx = null;
  }
}
