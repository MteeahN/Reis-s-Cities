import {
  Color,
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RedFormat,
  RGBAFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector2,
  Vector4,
} from 'three';
import { WATER_LEVEL, WORLD_SIZE } from '../core/config';
import { mulberry32 } from './generation/rng';

/** Tileable wave normal map built from integer-frequency sinusoids. */
function createWaveNormalMap(size = 256): DataTexture {
  const data = new Uint8Array(size * size * 4);
  // Many random integer-frequency waves (keeps the map tileable) with a
  // falling spectrum → isotropic ripples without a visible lattice.
  const rand = mulberry32(0x5eed);
  const waves: { kx: number; ky: number; a: number; p: number }[] = [];
  for (let n = 0; n < 48; n++) {
    const k = 2 + Math.floor(rand() * 22);
    const ang = rand() * Math.PI * 2;
    const kx = Math.round(Math.cos(ang) * k);
    const ky = Math.round(Math.sin(ang) * k);
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, a: 1.6 / Math.pow(Math.hypot(kx, ky), 1.6), p: rand() * Math.PI * 2 });
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const c = Math.cos(w.kx * u + w.ky * v + w.p) * w.a;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      const nx = -dx * 0.12;
      const ny = -dy * 0.12;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y * size + x) * 4;
      data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** The depth map covers the playable world and one world size around it (the river and lake run on). */
const DEPTH_RES = 768;
const DEPTH_X0 = -WORLD_SIZE;
const DEPTH_SPAN = WORLD_SIZE * 3;

/**
 * One large water plane at WATER_LEVEL covering river, lake and horizon.
 * Terrain carves below it; reflections come from the sky environment map.
 *
 * Its colour comes from how deep the water is (a map of the terrain under
 * it): clear turquoise over the sand of the shallows, dark blue-green where
 * it is deep, and more see-through near the shore; a broken band of foam
 * drifts where it laps the bank. Waves are three layers of the ripple map
 * drifting in different directions (no tiling repeats), calmer by the bank.
 */
export class Water {
  readonly mesh: Mesh;
  private readonly material: MeshStandardMaterial;
  private readonly depthData = new Uint8Array(DEPTH_RES * DEPTH_RES);
  private readonly depthTex: DataTexture;
  private readonly uniforms = {
    uDepth: { value: null as unknown as DataTexture },
    uDepthRect: { value: new Vector4(DEPTH_X0, DEPTH_X0, 1 / DEPTH_SPAN, 0) },
    uTime: { value: 0 },
    uShallow: { value: new Color(0x3c9c92) },
    uMid: { value: new Color(0x1a5a68) },
    uDeep: { value: new Color(0x0a2a3c) },
  };

  constructor() {
    const normalMap = createWaveNormalMap();
    const extent = 40000;
    this.depthData.fill(255);
    this.depthTex = new DataTexture(this.depthData, DEPTH_RES, DEPTH_RES, RedFormat, UnsignedByteType);
    this.depthTex.magFilter = LinearFilter;
    this.depthTex.minFilter = LinearFilter;
    this.depthTex.generateMipmaps = false;
    this.depthTex.needsUpdate = true;
    this.uniforms.uDepth.value = this.depthTex;
    this.material = new MeshStandardMaterial({
      color: new Color(0x1a5466),
      roughness: 0.12,
      metalness: 0.0,
      transparent: true,
      opacity: 1,
      normalMap,
      normalScale: new Vector2(0.55, 0.55),
      envMapIntensity: 0.6,
    });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + WATER_HEADER)
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + WATER_COLOR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.55, wFoam);')
        .replace('#include <normal_fragment_maps>', WATER_NORMAL);
    };
    this.material.customProgramCacheKey = () => 'reis-water-v2';
    const geo = new PlaneGeometry(extent, extent, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'water';
    this.mesh.position.set(WORLD_SIZE / 2, WATER_LEVEL, WORLD_SIZE / 2);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.updateMatrix();
    this.mesh.matrixAutoUpdate = false;
  }

  private heightAt: ((x: number, z: number) => number) | null = null;
  /** Part of the depth map to read again (x0, z0, x1, z1 m), or null. */
  private dirty: [number, number, number, number] | null = null;

  /**
   * How deep the water is comes from the terrain: all of it, or the part
   * between x0..x1, z0..z1 m after the ground was shaped there. Read on the
   * next frame drawn.
   */
  setDepth(heightAt: (x: number, z: number) => number, x0 = DEPTH_X0, z0 = DEPTH_X0, x1 = DEPTH_X0 + DEPTH_SPAN, z1 = DEPTH_X0 + DEPTH_SPAN): void {
    this.heightAt = heightAt;
    const d = this.dirty;
    this.dirty = d ? [Math.min(d[0], x0), Math.min(d[1], z0), Math.max(d[2], x1), Math.max(d[3], z1)] : [x0, z0, x1, z1];
  }

  private readDepth(heightAt: (x: number, z: number) => number, x0: number, z0: number, x1: number, z1: number): void {
    const step = DEPTH_SPAN / DEPTH_RES;
    const i0 = Math.max(0, Math.floor((x0 - DEPTH_X0) / step) - 1);
    const j0 = Math.max(0, Math.floor((z0 - DEPTH_X0) / step) - 1);
    const i1 = Math.min(DEPTH_RES - 1, Math.ceil((x1 - DEPTH_X0) / step) + 1);
    const j1 = Math.min(DEPTH_RES - 1, Math.ceil((z1 - DEPTH_X0) / step) + 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        // Signed depth (m below the surface, negative on land) in 0.1 m steps, so the shore line interpolates true.
        const d = WATER_LEVEL - heightAt(DEPTH_X0 + (i + 0.5) * step, DEPTH_X0 + (j + 0.5) * step);
        this.depthData[j * DEPTH_RES + i] = Math.max(0, Math.min(255, Math.round(128 + d * 10)));
      }
    }
    this.depthTex.needsUpdate = true;
  }

  update(dt: number): void {
    this.uniforms.uTime.value += dt;
    if (this.dirty && this.heightAt) {
      this.readDepth(this.heightAt, ...this.dirty);
      this.dirty = null;
    }
  }

  dispose(): void {
    this.material.normalMap?.dispose();
    this.depthTex.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}

const WATER_HEADER = /* glsl */ `
varying vec3 vWPos;
uniform sampler2D uDepth;
uniform vec4 uDepthRect;
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uMid;
uniform vec3 uDeep;
float wFoam = 0.0;
float wDepth = 30.0;
float wHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

const WATER_COLOR = /* glsl */ `
{
  vec2 duv = (vWPos.xz - uDepthRect.xy) * uDepthRect.z;
  float inside = step(0.0, duv.x) * step(duv.x, 1.0) * step(0.0, duv.y) * step(duv.y, 1.0);
  wDepth = mix(30.0, (texture2D(uDepth, duv).r * 255.0 - 128.0) / 10.0, inside);
  float d = max(wDepth, 0.0);
  vec3 col = mix(uShallow, uMid, 1.0 - exp(-d * 0.5));
  col = mix(col, uDeep, 1.0 - exp(-d * 0.09));
  // Foam where it laps the bank: a broken band drifting with the waves.
  float fn = wNoise(vWPos.xz * 0.32 + vec2(uTime * 0.22, uTime * 0.15)) * 0.6 + wNoise(vWPos.xz * 1.3 - vec2(uTime * 0.31, -uTime * 0.2)) * 0.4;
  float band = 1.0 - smoothstep(0.0, 0.75, d);
  wFoam = band * smoothstep(0.42, 0.68, fn + (1.0 - smoothstep(0.0, 0.2, d)) * 0.45);
  diffuseColor.rgb = mix(col, vec3(0.82, 0.88, 0.88), wFoam * 0.8);
  // Clear over the shallows, opaque where deep.
  diffuseColor.a = max(mix(0.42, 0.94, 1.0 - exp(-d * 0.55)), wFoam * 0.9);
}
`;

const WATER_NORMAL = /* glsl */ `
{
  // Three layers of ripples drifting different ways; the finest fade out with distance (no shimmer).
  vec2 wp = vWPos.xz;
  vec3 n1 = texture2D(normalMap, wp / 150.0 + vec2(uTime * 0.010, uTime * 0.006)).xyz * 2.0 - 1.0;
  vec3 n2 = texture2D(normalMap, wp / 53.0 + vec2(-uTime * 0.008, uTime * 0.013)).xyz * 2.0 - 1.0;
  vec3 n3 = texture2D(normalMap, wp / 13.0 + vec2(uTime * 0.021, -uTime * 0.011)).xyz * 2.0 - 1.0;
  float fine = 1.0 - smoothstep(0.15, 1.2, length(fwidth(wp)));
  // Calmer in the shallows by the bank.
  float calm = mix(0.45, 1.0, smoothstep(0.0, 2.0, wDepth));
  vec2 sl = (n1.xy * 0.6 + n2.xy * 0.45 + n3.xy * 0.3 * fine) * normalScale * calm;
  vec3 nw = normalize(vec3(sl.x, 1.0, sl.y));
  normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
}
`;
