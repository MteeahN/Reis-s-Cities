import { BoxGeometry, BufferAttribute, type BufferGeometry, CylinderGeometry, ExtrudeGeometry, MeshStandardMaterial, Shape } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { nightUniform } from './nightUniform';

/** Lamp kinds and their emissive colours (linear RGB). */
type Light = 'head' | 'tail' | 'amber';
const LIGHT_COLOR: Record<Light, [number, number, number]> = { head: [1, 0.92, 0.75], tail: [0.9, 0.05, 0.03], amber: [1, 0.55, 0.1] };

/** Box [w, h, l, x, y, z] (y = centre) with a grey shade (1 = body, takes the instance colour) and an optional lamp. */
type Part = [number, number, number, number, number, number, number, Light?];
/** Side silhouette [z, y][] extruded across the width `w` (centred on x), with a shade. */
interface Prism {
  pts: [number, number][];
  w: number;
  shade: number;
  x?: number;
}
interface Wheel {
  x: number;
  z: number;
  r: number;
  w: number;
}

/**
 * Merges silhouettes, box parts and wheels into one geometry with a per-vertex
 * shade and an `aGlow` colour for lamps, which the vehicle material lights
 * after dark. Front faces +z.
 */
function model(prisms: Prism[], parts: Part[], wheels: Wheel[]): BufferGeometry {
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
  for (const p of prisms) {
    const shape = new Shape();
    p.pts.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
    shape.closePath();
    // Shape x → length (world z), extrusion → width (world x).
    const g = new ExtrudeGeometry(shape, { depth: p.w, bevelEnabled: false, curveSegments: 1 })
      .translate(0, 0, -p.w / 2)
      .rotateY(-Math.PI / 2)
      .translate(p.x ?? 0, 0, 0);
    push(g, p.shade);
  }
  for (const [w, h, l, x, y, z, shade, light] of parts) push(new BoxGeometry(w, h, l).translate(x, y, z), shade, light);
  for (const wh of wheels) {
    for (const side of [-1, 1]) {
      push(new CylinderGeometry(wh.r, wh.r, wh.w, 12).rotateZ(Math.PI / 2).translate(side * wh.x, wh.r, wh.z), TYRE);
      push(new CylinderGeometry(wh.r * 0.58, wh.r * 0.58, wh.w + 0.03, 10).rotateZ(Math.PI / 2).translate(side * wh.x, wh.r, wh.z), RIM);
    }
  }
  const g = mergeGeometries(geos)!;
  g.computeBoundingSphere();
  return g;
}

const GLASS = 0.16;
const TRIM = 0.12;
const LAMP = 0.9;
const TAIL = 0.3;
const TYRE = 0.06;
const RIM = 0.62;
const PLATE = 1.4;
const GRILLE = 0.08;
const pair = (x: number, front: number, back: number, r: number, w = 0.24): Wheel[] => [
  { x, z: front, r, w },
  { x, z: back, r, w },
];

/** Bumpers, grille, plates, lamps and mirrors shared by passenger cars. */
function carDetails(o: { w: number; front: number; back: number; lampY: number; tailY: number; mirrorY: number; mirrorZ: number; bumperY: number }): Part[] {
  const { w, front, back } = o;
  const hx = w / 2 - 0.25;
  return [
    [w + 0.04, 0.2, 0.22, 0, o.bumperY, front - 0.05, TRIM],
    [w + 0.04, 0.2, 0.22, 0, o.bumperY, back + 0.05, TRIM],
    [w * 0.42, 0.16, 0.05, 0, o.lampY - 0.02, front + 0.01, GRILLE],
    [0.52, 0.12, 0.03, 0, o.bumperY + 0.02, front + 0.07, PLATE],
    [0.52, 0.12, 0.03, 0, o.bumperY + 0.2, back - 0.04, PLATE],
    [0.38, 0.13, 0.05, -hx, o.lampY, front, LAMP, 'head'],
    [0.38, 0.13, 0.05, hx, o.lampY, front, LAMP, 'head'],
    [0.36, 0.13, 0.05, -hx, o.tailY, back, TAIL, 'tail'],
    [0.36, 0.13, 0.05, hx, o.tailY, back, TAIL, 'tail'],
    [0.08, 0.1, 0.06, -(w / 2 - 0.1), o.lampY, front - 0.2, LAMP, 'amber'],
    [0.08, 0.1, 0.06, w / 2 - 0.1, o.lampY, front - 0.2, LAMP, 'amber'],
    [0.2, 0.12, 0.1, -(w / 2 + 0.08), o.mirrorY, o.mirrorZ, 1],
    [0.2, 0.12, 0.1, w / 2 + 0.08, o.mirrorY, o.mirrorZ, 1],
  ];
}

const truckWheels: Wheel[] = [
  { x: 1.0, z: 2.6, r: 0.5, w: 0.3 },
  { x: 1.0, z: -1.6, r: 0.5, w: 0.34 },
  { x: 1.0, z: -2.8, r: 0.5, w: 0.34 },
];

export function carModels(): BufferGeometry[] {
  return [
    // Sedan: three-box silhouette with a sloped windscreen and a boot.
    model(
      [
        { pts: [[-2.25, 0.28], [2.25, 0.28], [2.28, 0.6], [2.12, 0.78], [1.2, 0.9], [-1.65, 0.92], [-2.2, 0.86], [-2.3, 0.6]], w: 1.8, shade: 1 },
        { pts: [[1.18, 0.9], [0.42, 1.36], [-0.95, 1.38], [-1.62, 0.92]], w: 1.66, shade: GLASS },
        { pts: [[0.5, 1.31], [0.36, 1.43], [-0.95, 1.45], [-1.08, 1.33]], w: 1.62, shade: 1 },
      ],
      carDetails({ w: 1.8, front: 2.26, back: -2.28, lampY: 0.68, tailY: 0.76, mirrorY: 0.98, mirrorZ: 0.95, bumperY: 0.38 }),
      pair(0.8, 1.35, -1.35, 0.33),
    ),
    // Hatchback: short nose, steep tailgate.
    model(
      [
        { pts: [[-1.9, 0.28], [1.9, 0.28], [1.95, 0.6], [1.76, 0.8], [0.95, 0.92], [-1.86, 0.96], [-1.96, 0.6]], w: 1.72, shade: 1 },
        { pts: [[0.92, 0.92], [0.22, 1.44], [-1.6, 1.46], [-1.85, 0.96]], w: 1.58, shade: GLASS },
        { pts: [[0.3, 1.39], [0.16, 1.51], [-1.58, 1.53], [-1.7, 1.4]], w: 1.54, shade: 1 },
      ],
      carDetails({ w: 1.72, front: 1.94, back: -1.95, lampY: 0.7, tailY: 0.98, mirrorY: 1.0, mirrorZ: 0.7, bumperY: 0.38 }),
      pair(0.76, 1.2, -1.2, 0.32),
    ),
    // SUV: tall body, upright glass, roof rails.
    model(
      [
        { pts: [[-2.3, 0.36], [2.3, 0.36], [2.36, 0.8], [2.16, 1.02], [1.4, 1.12], [-2.26, 1.16], [-2.36, 0.8]], w: 1.92, shade: 1 },
        { pts: [[1.36, 1.12], [0.78, 1.7], [-2.04, 1.74], [-2.25, 1.16]], w: 1.78, shade: GLASS },
        { pts: [[0.86, 1.66], [0.72, 1.79], [-2.02, 1.82], [-2.12, 1.67]], w: 1.74, shade: 1 },
      ],
      [
        ...carDetails({ w: 1.92, front: 2.34, back: -2.34, lampY: 0.92, tailY: 1.1, mirrorY: 1.22, mirrorZ: 1.15, bumperY: 0.5 }),
        [0.06, 0.06, 2.4, -0.7, 1.86, -0.6, TRIM],
        [0.06, 0.06, 2.4, 0.7, 1.86, -0.6, TRIM],
        [1.96, 0.16, 3.0, 0, 0.44, 0, TRIM],
      ],
      pair(0.84, 1.45, -1.45, 0.4, 0.28),
    ),
    // Delivery van: short bonnet, tall cargo box with a split windscreen.
    model(
      [
        { pts: [[-2.6, 0.34], [2.88, 0.34], [2.96, 0.74], [2.76, 1.0], [2.2, 1.14], [-2.6, 1.18]], w: 1.96, shade: 1 },
        { pts: [[2.18, 1.14], [1.58, 1.9], [1.0, 1.96], [1.0, 1.14]], w: 1.84, shade: GLASS },
        { pts: [[-2.6, 1.14], [1.05, 1.14], [1.05, 2.0], [0.95, 2.36], [-2.6, 2.36]], w: 1.98, shade: 1 },
      ],
      [
        [2.0, 0.22, 0.24, 0, 0.45, 2.92, TRIM],
        [2.0, 0.22, 0.24, 0, 0.45, -2.62, TRIM],
        [0.8, 0.18, 0.04, 0, 0.82, 2.96, GRILLE],
        [0.52, 0.12, 0.03, 0, 0.47, 3.05, PLATE],
        [0.4, 0.17, 0.05, -0.68, 0.86, 2.94, LAMP, 'head'],
        [0.4, 0.17, 0.05, 0.68, 0.86, 2.94, LAMP, 'head'],
        [0.18, 0.5, 0.05, -0.88, 1.0, -2.62, TAIL, 'tail'],
        [0.18, 0.5, 0.05, 0.88, 1.0, -2.62, TAIL, 'tail'],
        [0.04, 2.0, 0.04, 0, 1.36, -2.62, TRIM],
        [0.22, 0.16, 0.1, -1.08, 1.5, 1.9, 1],
        [0.22, 0.16, 0.1, 1.08, 1.5, 1.9, 1],
        [2.0, 0.04, 3.4, 0, 1.6, -0.8, TRIM],
      ],
      pair(0.88, 2.0, -1.6, 0.38, 0.26),
    ),
  ];
}

/** Share of each car model in traffic (sedan, hatchback, SUV, van). */
export const CAR_MIX = [0.38, 0.27, 0.23, 0.12];

export function truckModels(): BufferGeometry[] {
  // Cab-over tractor with a raked windscreen, sun visor, mirrors, fuel tanks and chassis.
  const cabShape: Prism[] = [
    { pts: [[1.6, 0.75], [3.62, 0.75], [3.66, 1.6], [3.5, 2.7], [1.6, 2.75]], w: 2.3, shade: 1 },
    { pts: [[3.52, 1.7], [3.66, 1.72], [3.5, 2.6], [3.36, 2.6]], w: 2.1, shade: GLASS },
  ];
  const cab: Part[] = [
    [2.35, 0.3, 7.6, 0, 0.62, 0, TRIM],
    [2.4, 0.3, 0.3, 0, 0.7, 3.66, TRIM],
    [1.2, 0.5, 0.05, 0, 1.15, 3.66, GRILLE],
    [2.2, 0.1, 0.35, 0, 2.72, 3.62, TRIM],
    [0.4, 0.2, 0.05, -0.85, 1.0, 3.68, LAMP, 'head'],
    [0.4, 0.2, 0.05, 0.85, 1.0, 3.68, LAMP, 'head'],
    [0.3, 0.2, 0.05, -0.95, 0.95, -3.82, TAIL, 'tail'],
    [0.3, 0.2, 0.05, 0.95, 0.95, -3.82, TAIL, 'tail'],
    [0.3, 0.12, 0.12, -0.5, 2.85, 3.3, TAIL, 'amber'],
    [0.3, 0.12, 0.12, 0.5, 2.85, 3.3, TAIL, 'amber'],
    [0.1, 0.5, 0.12, -1.3, 2.1, 3.2, TRIM],
    [0.1, 0.5, 0.12, 1.3, 2.1, 3.2, TRIM],
    [0.5, 0.5, 1.1, -0.95, 0.85, 1.2, RIM],
    [0.5, 0.5, 1.1, 0.95, 0.85, 1.2, RIM],
    [2.36, 0.3, 0.1, 0, 0.6, -3.8, TRIM],
  ];
  return [
    // Box truck with ribbed sides.
    model(
      cabShape,
      [
        ...cab,
        [2.4, 2.7, 5.5, 0, 2.15, -1.15, 0.93],
        ...[-3.4, -2.2, -1.0, 0.2].map((z): Part => [2.46, 2.6, 0.08, 0, 2.15, z, 0.8]),
        [2.42, 0.1, 5.5, 0, 3.52, -1.15, TRIM],
      ],
      truckWheels,
    ),
    // Tanker: cylindrical tank on a frame, with a walkway.
    model(
      cabShape,
      [...cab, [0.6, 0.18, 4.8, 0, 3.12, -1.3, 0.6]],
      truckWheels,
    ),
  ].map((g, i) => {
    if (i !== 1) return g;
    // The tank itself (a lying cylinder) is merged separately so it stays round.
    const tank = new CylinderGeometry(1.1, 1.1, 5.0, 14).rotateX(Math.PI / 2).translate(0, 1.95, -1.3);
    const n = tank.toNonIndexed();
    n.deleteAttribute('uv');
    const c = n.getAttribute('position').count;
    n.setAttribute('color', new BufferAttribute(new Float32Array(c * 3).fill(0.9), 3));
    n.setAttribute('aGlow', new BufferAttribute(new Float32Array(c * 3), 3));
    const merged = mergeGeometries([g, n])!;
    merged.computeBoundingSphere();
    return merged;
  });
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
  mat.customProgramCacheKey = () => 'reis-vehicle-v2';
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
