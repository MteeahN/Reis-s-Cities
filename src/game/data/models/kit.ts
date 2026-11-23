import type { BuildingPart } from '../buildings';

/**
 * Small modelling kit for hand-authored buildings: every helper appends
 * primitive parts (the same format the instanced building renderer merges).
 * Coordinates: metres, footprint centre at the origin, y = part bottom,
 * the front (street side) faces +z.
 */
export type V3 = [number, number, number];
export type Parts = BuildingPart[];

export const C = {
  stone: '#e3d9c3',
  stoneDark: '#b9b09d',
  stoneWarm: '#d9c7a8',
  marble: '#efe9dc',
  brick: '#a5553a',
  brickDark: '#7d3f2b',
  roof: '#5f6e7d',
  slate: '#4b5560',
  copper: '#7fae9c',
  gold: '#c9a35a',
  paving: '#cbc2ae',
  pavingDark: '#a89f8c',
  concrete: '#a8a397',
  concreteDark: '#8b867c',
  asphalt: '#55585c',
  white: '#eef0f2',
  glass: '#7f9db3',
  glassDark: '#4e6a80',
  green: '#5f8f3a',
  greenDark: '#3d6a2a',
  lawn: '#6f9a4a',
  water: '#4d8fb0',
  trunk: '#5a4330',
  wood: '#7a5a3c',
  metal: '#9a9ea3',
  metalDark: '#6c7177',
  dark: '#2e3338',
  red: '#c0392b',
  blue: '#2f5d9b',
  yellow: '#e0b23a',
};

export function box(p: Parts, size: V3, pos: V3, color: string, extra: Partial<BuildingPart> = {}): void {
  p.push({ shape: 'box', size, pos, color, ...extra });
}

export function cyl(p: Parts, d: number, h: number, pos: V3, color: string, segments = 12, extra: Partial<BuildingPart> = {}): void {
  p.push({ shape: 'cylinder', size: [d, h, d], pos, color, segments, ...extra });
}

export function cone(p: Parts, d: number, h: number, pos: V3, color: string, segments = 12): void {
  p.push({ shape: 'cone', size: [d, h, d], pos, color, segments });
}

export function dome(p: Parts, d: number, h: number, pos: V3, color: string, segments = 16, extra: Partial<BuildingPart> = {}): void {
  p.push({ shape: 'dome', size: [d, h, d], pos, color, segments, ...extra });
}

export function pyramid(p: Parts, w: number, h: number, d: number, pos: V3, color: string): void {
  p.push({ shape: 'pyramid', size: [w, h, d], pos, color });
}

/** Gable roof; `alongZ` turns the ridge to run front-to-back (sizes are given as the covered w × d). */
export function gable(p: Parts, w: number, h: number, d: number, pos: V3, color: string, alongZ = false): void {
  p.push({ shape: 'gable', size: alongZ ? [d, h, w] : [w, h, d], pos, color, rot: alongZ ? [0, 90, 0] : undefined });
}

export function hip(p: Parts, w: number, h: number, d: number, pos: V3, color: string): void {
  p.push({ shape: 'hip', size: [w, h, d], pos, color });
}

/** A disc facing +z (or ±x with `axis` 'x'), e.g. a clock face; `pos` is the disc centre. */
export function disc(p: Parts, d: number, t: number, pos: V3, color: string, facing: '+z' | '-z' | '+x' | '-x' = '+z', segments = 24): void {
  const [x, y, z] = pos;
  if (facing === '+z') cyl(p, d, t, [x, y, z - t / 2], color, segments, { rot: [90, 0, 0] });
  else if (facing === '-z') cyl(p, d, t, [x, y, z + t / 2], color, segments, { rot: [-90, 0, 0] });
  else if (facing === '+x') cyl(p, d, t, [x - t / 2, y, z], color, segments, { rot: [0, 0, -90] });
  else cyl(p, d, t, [x + t / 2, y, z], color, segments, { rot: [0, 0, 90] });
}

/** Horizontal pipe/cylinder along x (from x0 to x1) or z. */
export function beamX(p: Parts, d: number, x0: number, x1: number, y: number, z: number, color: string, segments = 8): void {
  cyl(p, d, x1 - x0, [x0, y, z], color, segments, { rot: [0, 0, -90] });
}
export function beamZ(p: Parts, d: number, z0: number, z1: number, y: number, x: number, color: string, segments = 8): void {
  cyl(p, d, z1 - z0, [x, y, z0], color, segments, { rot: [90, 0, 0] });
}

export function tree(p: Parts, x: number, z: number, s = 1, kind: 'round' | 'cone' | 'tall' = 'round'): void {
  cyl(p, 0.35 * s, 1.8 * s, [x, 0.1, z], C.trunk, 6);
  if (kind === 'cone') cone(p, 2.2 * s, 4.2 * s, [x, 1.2 * s, z], C.greenDark, 8);
  else if (kind === 'tall') {
    dome(p, 1.8 * s, 1.6 * s, [x, 1.6 * s, z], C.green, 8);
    dome(p, 1.4 * s, 1.4 * s, [x, 3.2 * s, z], C.greenDark, 8);
  } else dome(p, 2.6 * s, 2.2 * s, [x, 1.5 * s, z], '#4f8a35', 8);
}

export function bench(p: Parts, x: number, z: number, alongZ = false): void {
  const rot: V3 | undefined = alongZ ? [0, 90, 0] : undefined;
  box(p, [1.8, 0.1, 0.5], [x, 0.5, z], C.wood, { rot });
  box(p, [1.8, 0.5, 0.08], alongZ ? [x - 0.22, 0.6, z] : [x, 0.6, z - 0.22], C.wood, { rot });
  box(p, [0.1, 0.5, 0.45], alongZ ? [x, 0.05, z - 0.8] : [x - 0.8, 0.05, z], C.metalDark, { rot });
  box(p, [0.1, 0.5, 0.45], alongZ ? [x, 0.05, z + 0.8] : [x + 0.8, 0.05, z], C.metalDark, { rot });
}

export function lamp(p: Parts, x: number, z: number, h = 4): void {
  cyl(p, 0.16, h, [x, 0.1, z], C.dark, 6);
  dome(p, 0.6, 0.35, [x, h + 0.1, z], C.dark, 8);
  cyl(p, 0.3, 0.3, [x, h - 0.2, z], '#f4e7c0', 8);
}

export function flagpole(p: Parts, x: number, z: number, h: number, flag: string, flag2 = C.white): void {
  cyl(p, 0.14, h, [x, 0.1, z], '#d8d8d8', 6);
  // Flies toward the lot centre (x side) so it never leaves the lot.
  const dir = x > 0 ? -1 : 1;
  box(p, [1.6, 1.0, 0.04], [x + dir * 0.82, h - 1.1, z], flag);
  box(p, [0.3, 0.3, 0.05], [x + dir * 0.5, h - 0.8, z], flag2);
}

/** A row of round columns along x at z, from x0 to x1. */
export function colonnade(p: Parts, n: number, x0: number, x1: number, z: number, y: number, h: number, d: number, color: string): void {
  for (let k = 0; k < n; k++) {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * k) / (n - 1);
    box(p, [d * 1.3, 0.3, d * 1.3], [x, y, z], color);
    cyl(p, d, h - 0.6, [x, y + 0.3, z], color, 12);
    box(p, [d * 1.3, 0.3, d * 1.3], [x, y + h - 0.3, z], color);
  }
}

/** Dark window slits on a wall facing +z: n windows across `span`, at height y. */
export function windowsZ(p: Parts, n: number, span: number, x: number, y: number, z: number, w: number, h: number, color = C.glassDark, sill = C.stoneDark): void {
  for (let k = 0; k < n; k++) {
    const wx = x - span / 2 + (span * (k + 0.5)) / n;
    box(p, [w, h, 0.1], [wx, y, z], color);
    box(p, [w + 0.25, 0.12, 0.25], [wx, y - 0.1, z], sill);
  }
}

/** Same for a wall facing +x. */
export function windowsX(p: Parts, n: number, span: number, x: number, y: number, z: number, w: number, h: number, color = C.glassDark, sill = C.stoneDark): void {
  for (let k = 0; k < n; k++) {
    const wz = z - span / 2 + (span * (k + 0.5)) / n;
    box(p, [0.1, h, w], [x, y, wz], color);
    box(p, [0.25, 0.12, w + 0.25], [x, y - 0.1, wz], sill);
  }
}

/** Arched opening (door/window) on a wall facing +z: rectangle plus a half disc. */
export function archZ(p: Parts, x: number, y: number, z: number, w: number, h: number, color = C.dark): void {
  box(p, [w, h, 0.12], [x, y, z], color);
  disc(p, w, 0.12, [x, y + h, z + 0.06], color, '+z', 16);
}

/** Car parked along x (alongZ: along z); a lighter cabin colour gives police / ambulance livery. */
export function vehicle(p: Parts, x: number, z: number, body: string, cabin = C.dark, alongZ = false, len = 4.4, h = 1.4): void {
  const rot: V3 | undefined = alongZ ? [0, 90, 0] : undefined;
  box(p, [len, h * 0.5, 1.8], [x, 0.35, z], body, { rot });
  box(p, [len * 0.55, h * 0.42, 1.6], [x, 0.35 + h * 0.5, z], cabin, { rot });
}

export function fenceRect(p: Parts, w: number, d: number, h: number, color: string, gapFront = 0): void {
  box(p, [0.1, h, d], [-w / 2, 0.1, 0], color);
  box(p, [0.1, h, d], [w / 2, 0.1, 0], color);
  box(p, [w, h, 0.1], [0, 0.1, -d / 2], color);
  if (gapFront > 0) {
    const side = (w - gapFront) / 2;
    box(p, [side, h, 0.1], [-w / 2 + side / 2, 0.1, d / 2], color);
    box(p, [side, h, 0.1], [w / 2 - side / 2, 0.1, d / 2], color);
  } else box(p, [w, h, 0.1], [0, 0.1, d / 2], color);
}
