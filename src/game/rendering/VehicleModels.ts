import { BoxGeometry, BufferAttribute, type BufferGeometry, CylinderGeometry, MeshStandardMaterial } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { nightUniform } from './nightUniform';

/** Lamp kinds and their emissive colours (linear RGB). */
type Light = 'head' | 'tail' | 'amber';
const LIGHT_COLOR: Record<Light, [number, number, number]> = { head: [1, 0.92, 0.75], tail: [0.9, 0.05, 0.03], amber: [1, 0.55, 0.1] };

/** Box [w, h, l, x, y, z] with a grey shade (1 = body, takes the instance colour) and an optional lamp. */
type Part = [number, number, number, number, number, number, number, Light?];
interface Wheel {
  x: number;
  z: number;
  r: number;
  w: number;
}

/**
 * Merges box parts and wheels into one geometry with a per-vertex shade and
 * an `aGlow` colour for lamps, which the vehicle material lights after dark.
 * Front faces +z.
 */
function model(parts: Part[], wheels: Wheel[]): BufferGeometry {
  const geos: BufferGeometry[] = [];
  const push = (g: BufferGeometry, shade: number, light?: Light) => {
    const ng = g.index ? g.toNonIndexed() : g;
    ng.deleteAttribute('uv');
    const n = ng.getAttribute('position').count;
    ng.setAttribute('color', new BufferAttribute(new Float32Array(n * 3).fill(shade), 3));
    const glow = new Float32Array(n * 3);
    if (light) for (let i = 0; i < n; i++) glow.set(LIGHT_COLOR[light], i * 3);
    ng.setAttribute('aGlow', new BufferAttribute(glow, 3));
    geos.push(ng);
  };
  for (const [w, h, l, x, y, z, shade, light] of parts) push(new BoxGeometry(w, h, l).translate(x, y, z), shade, light);
  for (const wh of wheels) {
    for (const side of [-1, 1]) push(new CylinderGeometry(wh.r, wh.r, wh.w, 8).rotateZ(Math.PI / 2).translate(side * wh.x, wh.r, wh.z), 0.08);
  }
  const g = mergeGeometries(geos)!;
  g.computeBoundingSphere();
  return g;
}

const GLASS = 0.16;
const TRIM = 0.12;
const LAMP = 0.9;
const TAIL = 0.3;
const pair = (x: number, front: number, back: number, r: number, w = 0.24): Wheel[] => [
  { x, z: front, r, w },
  { x, z: back, r, w },
];
const truckWheels: Wheel[] = [
  { x: 1.0, z: 2.6, r: 0.5, w: 0.3 },
  { x: 1.0, z: -1.6, r: 0.5, w: 0.34 },
  { x: 1.0, z: -2.8, r: 0.5, w: 0.34 },
];

export function carModels(): BufferGeometry[] {
  return [
    // Sedan
    model(
      [
        [1.8, 0.62, 4.4, 0, 0.62, 0, 1],
        [1.56, 0.55, 2.2, 0, 1.2, -0.25, GLASS],
        [1.6, 0.08, 1.9, 0, 1.5, -0.3, 1],
        [1.84, 0.22, 0.3, 0, 0.42, 2.2, TRIM],
        [1.84, 0.22, 0.3, 0, 0.42, -2.2, TRIM],
        [0.42, 0.16, 0.06, -0.6, 0.78, 2.21, LAMP, 'head'],
        [0.42, 0.16, 0.06, 0.6, 0.78, 2.21, LAMP, 'head'],
        [0.4, 0.14, 0.06, -0.62, 0.8, -2.21, TAIL, 'tail'],
        [0.4, 0.14, 0.06, 0.62, 0.8, -2.21, TAIL, 'tail'],
      ],
      pair(0.82, 1.35, -1.35, 0.34),
    ),
    // Hatchback
    model(
      [
        [1.72, 0.62, 3.8, 0, 0.62, 0, 1],
        [1.52, 0.62, 2.3, 0, 1.24, -0.45, GLASS],
        [1.56, 0.08, 2.1, 0, 1.58, -0.5, 1],
        [1.76, 0.22, 0.3, 0, 0.42, 1.9, TRIM],
        [0.4, 0.15, 0.06, -0.56, 0.78, 1.91, LAMP, 'head'],
        [0.4, 0.15, 0.06, 0.56, 0.78, 1.91, LAMP, 'head'],
        [0.3, 0.26, 0.06, -0.66, 1.0, -1.91, TAIL, 'tail'],
        [0.3, 0.26, 0.06, 0.66, 1.0, -1.91, TAIL, 'tail'],
      ],
      pair(0.78, 1.2, -1.2, 0.32),
    ),
    // SUV with roof rails
    model(
      [
        [1.92, 0.85, 4.6, 0, 0.78, 0, 1],
        [1.74, 0.7, 3.0, 0, 1.55, -0.35, GLASS],
        [1.78, 0.1, 2.9, 0, 1.94, -0.4, 1],
        [1.2, 0.08, 1.6, 0, 2.0, -0.4, TRIM],
        [1.96, 0.3, 0.3, 0, 0.55, 2.3, TRIM],
        [0.44, 0.18, 0.06, -0.66, 1.0, 2.31, LAMP, 'head'],
        [0.44, 0.18, 0.06, 0.66, 1.0, 2.31, LAMP, 'head'],
        [0.24, 0.42, 0.06, -0.8, 1.15, -2.31, TAIL, 'tail'],
        [0.24, 0.42, 0.06, 0.8, 1.15, -2.31, TAIL, 'tail'],
      ],
      pair(0.86, 1.45, -1.45, 0.4),
    ),
    // Delivery van
    model(
      [
        [1.95, 1.75, 4.9, 0, 1.25, -0.2, 1],
        [1.9, 0.75, 1.0, 0, 0.75, 2.6, 1],
        [1.8, 0.62, 0.9, 0, 1.55, 2.05, GLASS],
        [1.98, 0.25, 0.3, 0, 0.45, 3.05, TRIM],
        [0.4, 0.18, 0.06, -0.66, 0.9, 3.11, LAMP, 'head'],
        [0.4, 0.18, 0.06, 0.66, 0.9, 3.11, LAMP, 'head'],
        [0.2, 0.5, 0.06, -0.86, 1.0, -2.66, TAIL, 'tail'],
        [0.2, 0.5, 0.06, 0.86, 1.0, -2.66, TAIL, 'tail'],
      ],
      pair(0.88, 2.0, -1.6, 0.38),
    ),
  ];
}

/** Share of each car model in traffic (sedan, hatchback, SUV, van). */
export const CAR_MIX = [0.38, 0.27, 0.23, 0.12];

export function truckModels(): BufferGeometry[] {
  const cab: Part[] = [
    [2.25, 1.6, 2.0, 0, 1.55, 2.6, 1],
    [2.1, 0.72, 0.9, 0, 2.1, 2.9, GLASS],
    [2.35, 0.35, 7.6, 0, 0.7, 0, TRIM],
    [0.4, 0.2, 0.06, -0.85, 1.1, 3.61, LAMP, 'head'],
    [0.4, 0.2, 0.06, 0.85, 1.1, 3.61, LAMP, 'head'],
    [0.3, 0.2, 0.06, -0.95, 0.95, -3.81, TAIL, 'tail'],
    [0.3, 0.2, 0.06, 0.95, 0.95, -3.81, TAIL, 'tail'],
    [0.3, 0.12, 0.12, 0, 2.43, 3.25, TAIL, 'amber'],
  ];
  return [
    // Box truck
    model([...cab, [2.35, 2.7, 5.4, 0, 2.05, -1.2, 0.93]], truckWheels),
    // Tanker
    model([...cab, [2.2, 2.0, 5.2, 0, 1.95, -1.3, 0.86], [0.6, 0.25, 4.8, 0, 3.0, -1.3, 0.6]], truckWheels),
  ];
}

export const CAR_COLORS = [0xe8e8e4, 0x2b2d31, 0x9aa1a8, 0xb5312b, 0x1f4e8c, 0x3d6b45, 0xd9b44a, 0x6b4a2f, 0xf2f2f2, 0x4a5560, 0x7a1f2b, 0x2e5d73];
export const TRUCK_COLORS = [0xffffff, 0xe9e4d8, 0x2f6fb2, 0xc9452f, 0x3b7a4b, 0xd7d9db];

/** Vehicle paint material; lamps stay faintly visible by day and shine after dark. */
export function vehicleMaterial(): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.42, metalness: 0.3 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = nightUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * (0.12 + uNight * 4.0);');
  };
  mat.customProgramCacheKey = () => 'reis-vehicle-v1';
  return mat;
}

export function pickWeighted(weights: number[], r: number): number {
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i];
    if (r < acc) return i;
  }
  return weights.length - 1;
}
