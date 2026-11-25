import { getLook, type Look } from './Looks';
import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Points, PointsMaterial, type Scene, type WebGLRenderer } from 'three';
import { mulberry32 } from '../world/generation/rng';
import type { Lighting } from './Lighting';
import { nightUniform } from './nightUniform';
import type { SkyEnvironment } from './SkyEnvironment';

export type DayNightMode = 'cycle' | 'morning' | 'day' | 'evening' | 'night';

export const SUNRISE_HOUR = 6;
export const SUNSET_HOUR = 20;
const MAX_ELEVATION = 62;
const NIGHT_DEPTH = 28;

/** Everything the renderer needs for one moment of the day. Colours are hex. */
export interface SkyState {
  /** Sun elevation above the horizon (degrees, negative at night). */
  sunElevation: number;
  sunAzimuth: number;
  /** Direction the key light comes from: the sun by day, the moon by night. */
  lightElevation: number;
  lightAzimuth: number;
  lightColor: number;
  lightIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  envIntensity: number;
  fogColor: number;
  exposure: number;
  /** 0 = full daylight, 1 = full night (drives street lights, windows, headlights). */
  night: number;
  /** Star visibility 0–1. */
  stars: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mixHex = (a: number, b: number, t: number) => new Color(a).lerp(new Color(b), t).getHex();

/**
 * Height of the sun's arc (0–1) at a share t of the day: a sine, flattened
 * near the horizon so dawn and dusk last longer (the sun climbs at about
 * half the rate a plain sine would give there).
 */
const arc = (t: number) => {
  const s = Math.sin(Math.PI * t);
  return s * (0.55 + 0.45 * s);
};

/** Sun elevation and azimuth for a minute of the day (0–1440). */
export function sunPosition(minuteOfDay: number): { elevation: number; azimuth: number } {
  const h = (((minuteOfDay / 60) % 24) + 24) % 24;
  const dayLen = SUNSET_HOUR - SUNRISE_HOUR;
  if (h >= SUNRISE_HOUR && h <= SUNSET_HOUR) {
    const t = (h - SUNRISE_HOUR) / dayLen;
    return { elevation: MAX_ELEVATION * arc(t), azimuth: 90 + t * 180 };
  }
  const nightLen = 24 - dayLen;
  const t = ((h - SUNSET_HOUR + 24) % 24) / nightLen;
  return { elevation: -NIGHT_DEPTH * arc(t), azimuth: 270 + t * 180 };
}

/** The lighting state for a minute of the day. Pure, so it can be unit tested. */
export function skyStateAt(minuteOfDay: number): SkyState {
  const { elevation, azimuth } = sunPosition(minuteOfDay);
  // Wide, overlapping ranges: dawn and dusk blend over a long stretch of the day.
  const day = smooth(-9, 16, elevation); // 0 night … 1 day
  const golden = 1 - smooth(3, 30, elevation); // warm, low sun (also at dusk)
  const twilight = smooth(-12, 0, elevation) * (1 - smooth(0, 12, elevation));
  const sunI = 2.7 * Math.pow(day, 1.5);
  const moonI = 0.5 * (1 - day);
  // The key light hands over from the sun to the moon gradually (no jump in direction or colour).
  const sunW = smooth(-5, 5, elevation);
  const moonAz = (azimuth + 180) % 360;
  const dAz = ((((azimuth - moonAz) % 360) + 540) % 360) - 180;
  const sunColor = mixHex(0xfff0db, 0xff9a52, golden * day);
  return {
    sunElevation: elevation,
    sunAzimuth: azimuth,
    lightElevation: 42 + (Math.max(4, elevation) - 42) * sunW,
    lightAzimuth: (moonAz + dAz * sunW + 360) % 360,
    lightColor: mixHex(0x9fb4ff, sunColor, sunW),
    lightIntensity: sunI * sunW + moonI * (1 - sunW) + Math.min(sunI, moonI) * 0.6 * (1 - Math.abs(2 * sunW - 1)),
    hemiSky: mixHex(mixHex(0x34507e, 0xcfe3ff, day), 0xf0b48c, twilight * 0.65),
    hemiGround: mixHex(0x1a2026, 0x58663a, day),
    hemiIntensity: 0.42 + 0.13 * day,
    envIntensity: 0.1 + 0.2 * day,
    fogColor: mixHex(mixHex(0x0b1322, 0xbfd3e2, day), 0xd6a084, twilight * 0.75),
    exposure: 0.95 + 0.15 * (1 - day),
    night: 1 - smooth(-6, 9, elevation),
    stars: 1 - smooth(-14, -3, elevation),
  };
}

const FIXED_MINUTE: Record<Exclude<DayNightMode, 'cycle'>, number> = { morning: 7 * 60 + 20, day: 13 * 60, evening: 18 * 60 + 50, night: 23 * 60 };

/**
 * Applies the time of day to the sky, sun/moon light, fog, exposure, stars
 * and the shared night factor used by emissive windows, street lights and
 * headlights. The sky's image-based lighting is re-baked only when the sun
 * has moved noticeably (it costs a few milliseconds).
 */
export class DayNightCycle {
  mode: DayNightMode = 'cycle';
  /** Picture look applied on top of the time of day. */
  look: Look = getLook('standard');
  private readonly baseFogNear: number;
  state: SkyState = skyStateAt(FIXED_MINUTE.day);
  private readonly stars: Points;
  private lastEnvElevation = Infinity;
  private lastEnvAzimuth = Infinity;
  private envCooldown = 0;
  private readonly tmp = new Color();

  constructor(
    private readonly sky: SkyEnvironment,
    private readonly lighting: Lighting,
    private readonly renderer: WebGLRenderer,
    scene: Scene,
  ) {
    const rand = mulberry32(0x57a25);
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // Uniform on the upper hemisphere (slightly below the horizon is hidden by fog/terrain).
      const u = rand();
      const y = 0.03 + u * 0.97;
      const r = Math.sqrt(1 - y * y);
      const a = rand() * Math.PI * 2;
      pos.set([Math.cos(a) * r * 20000, y * 20000, Math.sin(a) * r * 20000], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    this.stars = new Points(
      g,
      new PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: AdditiveBlending }),
    );
    this.stars.name = 'stars';
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -1;
    this.stars.visible = false;
    scene.add(this.stars);
    this.baseFogNear = sky.fog.near;
  }

  /** @param minuteOfDay game clock (0–1440), ignored unless the mode is 'cycle'. */
  update(minuteOfDay: number, dt: number, cameraX: number, cameraZ: number): void {
    const minute = this.mode === 'cycle' ? minuteOfDay : FIXED_MINUTE[this.mode];
    const s = skyStateAt(minute);
    this.state = s;

    this.sky.setSunDirection(s.sunElevation, s.sunAzimuth);
    this.envCooldown -= dt;
    const moved = Math.abs(s.sunElevation - this.lastEnvElevation) + Math.abs(s.sunAzimuth - this.lastEnvAzimuth) * 0.3;
    if (moved > 1.5 && this.envCooldown <= 0) {
      this.sky.rebuildEnvironment();
      this.lastEnvElevation = s.sunElevation;
      this.lastEnvAzimuth = s.sunAzimuth;
      this.envCooldown = 0.5;
    }
    const look = this.look;
    this.sky.setEnvironmentIntensity(s.envIntensity * look.sky);
    this.sky.fog.color.setHex(s.fogColor);
    if (look.fogMix > 0) this.sky.fog.color.lerp(this.tmp.setHex(look.fogTint), look.fogMix * (1 - s.night * 0.7));
    this.sky.fog.near = this.baseFogNear * look.fogNear;

    this.lighting.setLightDirection(s.lightElevation, s.lightAzimuth);
    this.lighting.sun.color.setHex(s.lightColor);
    this.lighting.sun.intensity = s.lightIntensity * look.sun;
    this.lighting.hemi.color.setHex(s.hemiSky);
    this.lighting.hemi.groundColor.setHex(s.hemiGround);
    this.lighting.hemi.intensity = s.hemiIntensity * look.sky;
    this.renderer.toneMappingExposure = s.exposure * look.exposure;

    nightUniform.value = s.night;
    const mat = this.stars.material as PointsMaterial;
    mat.opacity = s.stars;
    this.stars.visible = s.stars > 0.01;
    this.stars.position.set(cameraX, 0, cameraZ);
  }

  get night(): number {
    return this.state.night;
  }

  dispose(): void {
    this.stars.geometry.dispose();
    (this.stars.material as PointsMaterial).dispose();
  }
}
