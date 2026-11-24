import {
  Color,
  DataTexture,
  MeshStandardMaterial,
  NearestFilter,
  RedFormat,
  UnsignedByteType,
  Vector4,
  type IUniform,
} from 'three';
import { CELL_SIZE, CHUNK_CELLS, TILES_PER_SIDE, WORLD_SIZE } from '../../core/config';
import type { UnlockMap } from '../../world/UnlockMap';
import { nightUniform } from '../nightUniform';

export interface TerrainUniforms {
  uGridOpacity: IUniform<number>;
  uHoverRect: IUniform<Vector4>;
  uHoverColor: IUniform<Color>;
  uUnlockMask: IUniform<DataTexture>;
  /** Zone overlay (see ZoneOverlay): R zone, G zoneable, B built, A preview. */
  uZoneTex: IUniform<DataTexture>;
  /** 0 = normal view, 1 = zoning tool active (stronger overlay). */
  uZoneMode: IUniform<number>;
  uPreviewColor: IUniform<Color>;
  /** Info layer colours (RGBA per cell; alpha = strength). */
  uInfoTex: IUniform<DataTexture>;
  uInfoMode: IUniform<number>;
  /** 0 day … 1 night: dims the self-lit overlays so they don't glow in the dark. */
  uNight: IUniform<number>;
  /** Ground paint (one texel per PAINT_STEP m; R = paint id). */
  uPaintTex: IUniform<DataTexture>;
}

/**
 * Terrain shading is a MeshStandardMaterial (so it gets PBR lighting, shadows
 * and fog for free) with shader injections for: fine surface detail noise,
 * the build grid, the hover/footprint highlight, locked-land tint and the
 * owned-land border. All overlays are GPU-side — no extra geometry.
 */
export class TerrainMaterial extends MeshStandardMaterial {
  readonly uniforms: TerrainUniforms;
  private readonly maskData: Uint8Array;

  constructor(private readonly unlock: UnlockMap) {
    super({ vertexColors: true, roughness: 0.96, metalness: 0 });
    this.maskData = new Uint8Array(TILES_PER_SIDE * TILES_PER_SIDE);
    const mask = new DataTexture(this.maskData, TILES_PER_SIDE, TILES_PER_SIDE, RedFormat, UnsignedByteType);
    mask.magFilter = NearestFilter;
    mask.minFilter = NearestFilter;
    mask.generateMipmaps = false;
    this.uniforms = {
      uGridOpacity: { value: 0 },
      uHoverRect: { value: new Vector4(1, 1, 0, 0) },
      uHoverColor: { value: new Color(0x4fe3b0) },
      uUnlockMask: { value: mask },
      uZoneTex: { value: emptyZoneTex() },
      uZoneMode: { value: 0 },
      uPreviewColor: { value: new Color(0x4ade80) },
      uInfoTex: { value: emptyZoneTex() },
      uInfoMode: { value: 0 },
      uNight: nightUniform,
      uPaintTex: { value: emptyZoneTex() },
    };
    this.syncUnlockMask();
    unlock.onChange(() => this.syncUnlockMask());

    this.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAGMENT_HEADER}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAGMENT_COLOR}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FRAGMENT_EMISSIVE}`);
    };
    this.customProgramCacheKey = () => 'reis-terrain-v4';
  }

  private syncUnlockMask(): void {
    // DataTexture row 0 is v=0 → z=0, matching world z mapping in the shader.
    for (let z = 0; z < TILES_PER_SIDE; z++) {
      for (let x = 0; x < TILES_PER_SIDE; x++) {
        this.maskData[z * TILES_PER_SIDE + x] = this.unlock.isTileUnlocked(x, z) ? 255 : 0;
      }
    }
    this.uniforms.uUnlockMask.value.needsUpdate = true;
  }

  setHover(minX: number, minZ: number, maxX: number, maxZ: number, color: Color | number): void {
    this.uniforms.uHoverRect.value.set(minX, minZ, maxX, maxZ);
    if (typeof color === 'number') this.uniforms.uHoverColor.value.setHex(color);
    else this.uniforms.uHoverColor.value.copy(color);
  }

  clearHover(): void {
    this.uniforms.uHoverRect.value.set(1, 1, 0, 0);
  }
}

/** 1×1 placeholder until the city's zone overlay is attached. */
function emptyZoneTex(): DataTexture {
  const t = new DataTexture(new Uint8Array(4), 1, 1);
  t.needsUpdate = true;
  return t;
}

const FRAGMENT_HEADER = /* glsl */ `
varying vec3 vWorldPos;
uniform float uGridOpacity;
uniform vec4 uHoverRect;
uniform vec3 uHoverColor;
uniform sampler2D uUnlockMask;
uniform sampler2D uZoneTex;
uniform float uZoneMode;
uniform vec3 uPreviewColor;
uniform sampler2D uInfoTex;
uniform float uInfoMode;
uniform float uNight;
uniform sampler2D uPaintTex;
const float WORLD = ${WORLD_SIZE.toFixed(1)};
const float CELL = ${CELL_SIZE.toFixed(1)};
const float CHUNK = ${(CELL_SIZE * CHUNK_CELLS).toFixed(1)};

float rcHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float rcNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rcHash(i), rcHash(i + vec2(1.0, 0.0)), u.x),
             mix(rcHash(i + vec2(0.0, 1.0)), rcHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float rcUnlocked(vec2 p) {
  if (p.x < 0.0 || p.y < 0.0 || p.x > WORLD || p.y > WORLD) return 0.0;
  return texture2D(uUnlockMask, p / WORLD).r;
}
/** Ground paint patterns in world space (ids as in data/decor PAINTS). */
vec3 rcPaint(float id, vec2 p) {
  float g = rcNoise(p * 3.1) * 0.5 + rcNoise(p * 0.6) * 0.5;
  if (id > 3.5 && id < 5.5) {
    // Gravel (4) and sand (5): speckled.
    vec3 base = id < 4.5 ? vec3(0.36, 0.31, 0.23) : vec3(0.55, 0.47, 0.30);
    return base * (0.82 + 0.3 * rcNoise(p * 9.0) + 0.1 * g);
  }
  if (id > 5.5 && id < 6.5) {
    // Lawn: mowing stripes.
    float stripe = step(0.5, fract(p.x / 3.0));
    return vec3(0.12, 0.27, 0.06) * (0.85 + 0.18 * stripe + 0.15 * g);
  }
  if (id > 7.5) return vec3(0.05, 0.052, 0.056) * (0.85 + 0.3 * g);
  if (id > 6.5) {
    // Wood deck: boards along x.
    float row = floor(p.y / 0.22);
    float seam = 1.0 - smoothstep(0.0, 0.02 + fwidth(p.y), min(fract(p.y / 0.22), 1.0 - fract(p.y / 0.22)) * 0.22);
    float tone = rcHash(vec2(row, floor((p.x + row * 1.7) / 2.4)));
    return mix(vec3(0.30, 0.17, 0.08) * (0.8 + 0.35 * tone), vec3(0.08, 0.05, 0.03), seam);
  }
  vec2 size = id < 1.5 ? vec2(0.45) : id < 2.5 ? vec2(1.0) : vec2(0.5, 0.25);
  vec2 q = p / size;
  if (id < 1.5 || id > 2.5) q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
  vec2 f = fract(q);
  float edge = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
  float stone = smoothstep(0.012, 0.03 + fwidth(p.x), edge);
  float tone = rcHash(floor(q));
  vec3 face = id < 1.5 ? vec3(0.19, 0.185, 0.17) * (0.75 + 0.5 * tone)
    : id < 2.5 ? (mod(floor(q.x) + floor(q.y), 2.0) < 0.5 ? vec3(0.42, 0.40, 0.36) : vec3(0.34, 0.31, 0.27)) * (0.95 + 0.1 * g)
    : vec3(0.30, 0.11, 0.07) * (0.75 + 0.45 * tone);
  return mix(vec3(0.07, 0.066, 0.06), face, stone);
}

float rcGridLine(vec2 coord) {
  vec2 w = fwidth(coord);
  vec2 l = abs(fract(coord - 0.5) - 0.5) / max(w, vec2(1e-4));
  return 1.0 - min(min(l.x, l.y), 1.0);
}
`;

const FRAGMENT_COLOR = /* glsl */ `
{
  vec2 p = vWorldPos.xz;
  float n = rcNoise(p * 0.42) * 0.35 + rcNoise(p * 0.11) * 0.35 + rcNoise(p * 0.023) * 0.3;
  diffuseColor.rgb *= 0.84 + 0.3 * n;
  if (p.x >= 0.0 && p.y >= 0.0 && p.x <= WORLD && p.y <= WORLD) {
    float pid = floor(texture2D(uPaintTex, p / WORLD).r * 255.0 + 0.5);
    if (pid > 0.5) diffuseColor.rgb = rcPaint(pid, p);
  }

  float ul = rcUnlocked(p);
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  vec3 locked = mix(vec3(lum), diffuseColor.rgb, 0.62) * 0.86;
  diffuseColor.rgb = mix(locked, diffuseColor.rgb, ul);

  if (p.x >= 0.0 && p.y >= 0.0 && p.x <= WORLD && p.y <= WORLD) {
    vec4 zt = texture2D(uZoneTex, p / WORLD);
    float zid = floor(zt.r * 255.0 / 60.0 + 0.5);
    float cellEdge = rcGridLine(p / CELL);
    if (uInfoMode < 0.5 && zid > 0.5 && zt.b < 0.5) {
      vec3 zcol = zid < 1.5 ? vec3(0.10, 0.62, 0.22) : zid < 2.5 ? vec3(0.12, 0.36, 0.85) : zid < 3.5 ? vec3(0.85, 0.62, 0.02) : vec3(0.55, 0.36, 0.92);
      diffuseColor.rgb = mix(diffuseColor.rgb, zcol, 0.32 + uZoneMode * 0.18 + cellEdge * 0.3);
    } else if (uInfoMode < 0.5 && uZoneMode > 0.5 && zt.g > 0.5 && zt.b < 0.5) {
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), 0.1 + cellEdge * 0.22);
    }
  }
  if (uInfoMode > 0.5) {
    float l2 = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = mix(vec3(l2), diffuseColor.rgb, 0.3) * 0.7;
    if (p.x >= 0.0 && p.y >= 0.0 && p.x <= WORLD && p.y <= WORLD) {
      vec4 info = texture2D(uInfoTex, p / WORLD);
      diffuseColor.rgb = mix(diffuseColor.rgb, info.rgb, info.a);
    }
  }

  if (uGridOpacity > 0.001) {
    float inMap = step(0.0, p.x) * step(p.x, WORLD) * step(0.0, p.y) * step(p.y, WORLD);
    vec2 g = p / CELL;
    float fade = 1.0 - smoothstep(0.3, 0.85, max(fwidth(g.x), fwidth(g.y)));
    float minor = rcGridLine(g) * fade * ul;
    float major = rcGridLine(p / CHUNK) * inMap;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.97, 1.0), uGridOpacity * (minor * 0.15 + major * 0.32));
  }
}
`;

const FRAGMENT_EMISSIVE = /* glsl */ `
{
  vec2 p = vWorldPos.xz;
  if (uHoverRect.x <= uHoverRect.z) {
    vec2 ins2 = step(uHoverRect.xy, p) * step(p, uHoverRect.zw);
    float ins = ins2.x * ins2.y;
    vec2 dmin = p - uHoverRect.xy;
    vec2 dmax = uHoverRect.zw - p;
    float edgeD = min(min(dmin.x, dmin.y), min(dmax.x, dmax.y));
    float edgeW = fwidth(p.x) * 1.6 + 0.3;
    float edge = ins * (1.0 - smoothstep(0.0, edgeW, edgeD));
    totalEmissiveRadiance += uHoverColor * (ins * 0.18 + edge * 0.85);
  }
  if (p.x >= 0.0 && p.y >= 0.0 && p.x <= WORLD && p.y <= WORLD) {
    vec4 zt = texture2D(uZoneTex, p / WORLD);
    if (zt.a > 0.5) totalEmissiveRadiance += uPreviewColor * 0.35;
    float zid = floor(zt.r * 255.0 / 60.0 + 0.5);
    if (uInfoMode < 0.5 && zid > 0.5 && zt.b < 0.5) {
      vec3 zglow = zid < 1.5 ? vec3(0.05, 0.55, 0.12) : zid < 2.5 ? vec3(0.06, 0.25, 0.75) : zid < 3.5 ? vec3(0.7, 0.5, 0.0) : vec3(0.42, 0.22, 0.8);
      // Zones glow softly; at night only while the zoning tool is open.
      totalEmissiveRadiance += zglow * (0.05 + uZoneMode * 0.12 + rcGridLine(p / CELL) * 0.1) * mix(1.0, 0.12 + uZoneMode * 0.5, uNight);
    }
  }
  float e = max(2.0, fwidth(p.x) * 1.5);
  float c = rcUnlocked(p);
  float diff = abs(c - rcUnlocked(p + vec2(e, 0.0))) + abs(c - rcUnlocked(p - vec2(e, 0.0)))
             + abs(c - rcUnlocked(p + vec2(0.0, e))) + abs(c - rcUnlocked(p - vec2(0.0, e)));
  totalEmissiveRadiance += vec3(1.0, 0.82, 0.42) * min(diff, 1.0) * mix(0.5, 0.2, uNight);
}
`;
