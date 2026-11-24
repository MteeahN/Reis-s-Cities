import { DoubleSide, MeshStandardMaterial } from 'three';
import type { RoadSurface, RoadTypeDef } from '../../data/roads';

const SURFACE_INDEX: Record<RoadSurface, number> = { asphalt: 0, cobble: 1, brick: 2, concrete: 3 };

/**
 * Asphalt + sidewalks + lane markings drawn procedurally from the road's
 * data (width, lanes, median, centre-line style) — no textures needed, and
 * every road type in the catalogue gets correct markings automatically.
 * `type === null` produces the plain asphalt used for junction caps.
 */
export function createRoadMaterial(type: RoadTypeDef | null, surface: RoadSurface = 'asphalt'): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: type ? -1 : -2,
    polygonOffsetUnits: type ? -2 : -4,
  });
  const uniforms = {
    uWidth: { value: type?.width ?? 8 },
    uSidewalk: { value: type?.sidewalk ?? 0 },
    uMedian: { value: type?.median ?? 0 },
    uLanes: { value: type?.lanes ?? 2 },
    uParking: { value: type?.parking ?? 0 },
    uSurface: { value: SURFACE_INDEX[surface] },
    uOneWay: { value: type?.oneWay ? 1 : 0 },
    uCenter: { value: type ? (type.centerLine === 'double' ? 2 : type.centerLine === 'dashed' ? 1 : 0) : 0 },
    uJunction: { value: type ? 0 : 1 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 roadUv;\nvarying vec2 vRoadUv;\nvarying vec3 vRoadWorld;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRoadUv = roadUv;\nvRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEADER}`)
      .replace('#include <map_fragment>', BODY);
  };
  mat.customProgramCacheKey = () => (type ? 'reis-road-v2' : 'reis-junction-v2');
  return mat;
}

const HEADER = /* glsl */ `
varying vec2 vRoadUv;
varying vec3 vRoadWorld;
uniform float uWidth;
uniform float uSidewalk;
uniform float uMedian;
uniform float uLanes;
uniform float uParking;
uniform float uSurface;
uniform float uOneWay;
uniform float uCenter;
uniform float uJunction;
float rdHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float rdNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(rdHash(i), rdHash(i + vec2(1, 0)), u.x), mix(rdHash(i + vec2(0, 1)), rdHash(i + vec2(1, 1)), u.x), u.y);
}
float rdLine(float x, float c, float w, float fw) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + fw, abs(x - c)); }
float rdDash(float y, float period, float duty) { return step(fract(y / period), duty); }
`;

const BODY = /* glsl */ `
{
  vec2 wp = vRoadWorld.xz;
  float grain = rdNoise(wp * 2.3) * 0.5 + rdNoise(wp * 0.35) * 0.5;
  vec3 asphalt = vec3(0.052, 0.054, 0.058) * (0.85 + 0.3 * grain);
  if (uSurface > 0.5) {
    // Paving laid in world space: cobbles, bricks (running bond) or concrete slabs.
    vec2 size = uSurface < 1.5 ? vec2(0.45) : uSurface < 2.5 ? vec2(0.5, 0.25) : vec2(3.0);
    vec2 q = wp / size;
    if (uSurface < 2.5) q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 f = fract(q);
    float edge = min(min(f.x, 1.0 - f.x) * size.x, min(f.y, 1.0 - f.y) * size.y);
    float fwq = max(fwidth(wp.x), 0.01);
    float stone = smoothstep(0.015, 0.015 + fwq + 0.03, edge);
    float tone = rdHash(floor(q));
    vec3 face = uSurface < 1.5 ? vec3(0.17, 0.165, 0.155) * (0.75 + 0.5 * tone)
      : uSurface < 2.5 ? vec3(0.30, 0.11, 0.07) * (0.75 + 0.45 * tone)
      : vec3(0.28, 0.28, 0.27) * (0.9 + 0.15 * tone + 0.1 * grain);
    vec3 gap = uSurface < 2.5 ? vec3(0.06, 0.058, 0.055) : vec3(0.16, 0.16, 0.155);
    asphalt = mix(gap, face, stone);
  }
  vec3 col = asphalt;
  if (uJunction > 0.5 && vRoadUv.y < -2.5) {
    // Zebra crossing: white bars across the carriageway.
    float u = vRoadUv.x;
    float bar = step(0.5, fract(u / 1.1 + 0.25));
    float wear = 0.75 + 0.25 * rdNoise(wp * 1.3);
    col = mix(asphalt, vec3(0.74, 0.74, 0.72), bar * wear);
  } else if (uJunction > 0.5 && vRoadUv.y < -0.5) {
    // Junction corners: raised sidewalk (v = −1) and kerb faces / skirts (v = −2).
    col = vec3(0.30, 0.295, 0.28) * (0.9 + 0.15 * grain);
    vec2 jg = fract(wp);
    float joint = max(rdLine(jg.x, 0.0, 0.05, fwidth(wp.x)), rdLine(jg.y, 0.0, 0.05, fwidth(wp.y)));
    col *= 1.0 - joint * 0.25;
    if (vRoadUv.y < -1.5) col = vec3(0.42, 0.41, 0.39) * (0.9 + 0.1 * grain);
  }
  if (uJunction < 0.5) {
    float x = clamp(vRoadUv.x, 0.0, 1.0) * uWidth;
    float y = vRoadUv.y;
    float fw = max(fwidth(x), 0.02);
    float sw = uSidewalk;
    if (sw > 0.0 && (x < sw || x > uWidth - sw)) {
      col = vec3(0.30, 0.295, 0.28) * (0.9 + 0.15 * grain);
      // paving joints every metre
      float joint = rdLine(fract(y), 0.0, 0.05, fwidth(y)) + rdLine(fract(y), 1.0, 0.05, fwidth(y));
      col *= 1.0 - joint * 0.25;
    }
    if (sw > 0.0) {
      float curb = rdLine(x, sw, 0.22, fw) + rdLine(x, uWidth - sw, 0.22, fw);
      col = mix(col, vec3(0.42, 0.41, 0.39), clamp(curb, 0.0, 1.0));
    }
    // Parking strips between the kerb and the lanes: bays marked every 6 m.
    float bay = uWidth - 2.0 * sw;
    float bx = x - sw;
    if (uParking > 0.0 && bx > 0.0 && bx < bay && (bx < uParking || bx > bay - uParking)) {
      col = asphalt * 1.12;
      float inner = bx < uParking ? uParking : bay - uParking;
      float edge = rdLine(bx, inner, 0.12, fw);
      float tick = rdLine(fract(y / 6.0) * 6.0, 0.0, 0.12, fwidth(y)) * step(min(bx, bay - bx), uParking);
      float wear = 0.75 + 0.25 * rdNoise(wp * 1.1);
      col = mix(col, vec3(0.72, 0.72, 0.70), clamp(edge + tick, 0.0, 1.0) * wear);
    }
    float carriage = bay - 2.0 * uParking;
    float cx = bx - uParking;
    if (cx > 0.0 && cx < carriage) {
      float mid = carriage * 0.5;
      float white = 0.0;
      float yel = 0.0;
      if (uOneWay > 0.5) {
        float lw = carriage / uLanes;
        for (int k = 1; k < 6; k++) {
          if (float(k) >= uLanes) break;
          white += rdLine(cx, lw * float(k), 0.14, fw) * rdDash(y, 9.0, 0.4);
        }
        white += rdLine(cx, 0.45, 0.16, fw) + rdLine(cx, carriage - 0.45, 0.16, fw);
      } else {
        float side = (carriage - uMedian) * 0.5;
        float perDir = max(1.0, uLanes * 0.5);
        float lw = side / perDir;
        for (int k = 1; k < 4; k++) {
          if (float(k) >= perDir) break;
          white += (rdLine(cx, lw * float(k), 0.13, fw) + rdLine(cx, carriage - lw * float(k), 0.13, fw)) * rdDash(y, 9.0, 0.4);
        }
        if (uCenter > 1.5) yel += rdLine(cx, mid - 0.17, 0.12, fw) + rdLine(cx, mid + 0.17, 0.12, fw);
        else if (uCenter > 0.5) white += rdLine(cx, mid, 0.13, fw) * rdDash(y, 7.0, 0.45);
        if (uLanes >= 4.0) white += rdLine(cx, 0.4, 0.14, fw) + rdLine(cx, carriage - 0.4, 0.14, fw);
        if (uMedian > 0.0 && abs(cx - mid) < uMedian * 0.5) {
          col = vec3(0.07, 0.14, 0.035) * (0.8 + 0.4 * grain);
          float kerb = rdLine(abs(cx - mid), uMedian * 0.5, 0.25, fw);
          col = mix(col, vec3(0.42, 0.41, 0.39), kerb);
          white = 0.0;
          yel = 0.0;
        }
      }
      float wear = 0.75 + 0.25 * rdNoise(wp * 1.1);
      col = mix(col, vec3(0.72, 0.72, 0.70), clamp(white, 0.0, 1.0) * wear);
      col = mix(col, vec3(0.78, 0.52, 0.10), clamp(yel, 0.0, 1.0) * wear);
    }
  }
  diffuseColor.rgb = col;
}
`;
