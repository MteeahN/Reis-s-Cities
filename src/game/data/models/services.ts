import { archZ, beamX, beamZ, bench, box, C, cone, cyl, disc, dome, fenceRect, flagpole, gable, hip, lamp, type Parts, pyramid, tree, vehicle, windowsZ } from './kit';

// ---------------------------------------------------------------- public services

/** Police station (2×2): two-storey block with a blue band, glass entrance, radio mast, patrol cars. */
export function policeModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.3, 15.6], [0, 0, 0], C.concrete);
  box(p, [15.2, 0.06, 6], [0, 0.3, -4.6], C.asphalt);
  box(p, [11, 7.2, 7.5], [-1.2, 0.3, 2.6], '#d9dde1', { facade: 'office' });
  box(p, [11.3, 0.7, 7.8], [-1.2, 3.6, 2.6], C.blue);
  box(p, [11.4, 0.5, 7.9], [-1.2, 7.5, 2.6], '#b9c0c6');
  box(p, [3.6, 3.4, 1.4], [-1.2, 0.3, 6.9], C.glassDark);
  box(p, [4.6, 0.3, 2.2], [-1.2, 3.7, 6.9], C.blue);
  box(p, [3.2, 0.6, 0.1], [-1.2, 4.0, 7.95], C.white);
  // Tower block with the radio mast.
  box(p, [3.6, 9.5, 3.6], [5.6, 0.3, 3.8], '#cfd5da', { facade: 'office' });
  box(p, [3.9, 0.5, 3.9], [5.6, 9.8, 3.8], C.blue);
  cyl(p, 0.25, 9, [5.6, 10.3, 3.8], C.metal, 6);
  for (const y of [13, 16, 18.6]) box(p, [1.4, 0.08, 0.08], [5.6, y, 3.8], C.metal);
  // Roof plant, flag, parked patrol cars and a van.
  box(p, [2.4, 1.2, 1.8], [-3.5, 8.0, 1.5], C.metal);
  flagpole(p, -6.8, 7.3, 8, C.red);
  for (let k = 0; k < 3; k++) vehicle(p, -5 + k * 3.2, -4.6, C.white, C.blue, true);
  vehicle(p, 5.2, -4.6, C.blue, C.white, true, 5, 2);
  fenceRect(p, 15.4, 15.4, 1.4, C.metalDark, 6);
  tree(p, 6.6, 7.2, 0.7);
  return p;
}

/** Fire station (2×2): brick engine house with three bays, hose-drying tower, engines on the apron. */
export function fireStationModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.3, 15.6], [0, 0, 0], C.concrete);
  box(p, [11.5, 0.06, 5.6], [-1.6, 0.3, 4.9], '#8f8a80');
  box(p, [11.5, 6.6, 9], [-1.6, 0.3, -2.4], C.brick);
  box(p, [11.8, 0.5, 9.3], [-1.6, 6.9, -2.4], C.stone);
  gable(p, 11.8, 2.0, 9.3, [-1.6, 7.4, -2.4], C.slate);
  // Three engine bays with red doors and white surrounds.
  for (let k = 0; k < 3; k++) {
    const x = -5.4 + k * 3.8;
    box(p, [3.4, 4.6, 0.12], [x, 0.3, 2.06], C.stone);
    box(p, [3.0, 4.3, 0.14], [x, 0.3, 2.08], '#b23a2b');
    for (let r = 1; r < 5; r++) box(p, [3.0, 0.05, 0.16], [x, 0.3 + r * 0.86, 2.09], '#8e2e22');
  }
  windowsZ(p, 4, 10, -1.6, 5.4, 2.08, 1.0, 0.9, C.glassDark, C.stone);
  box(p, [5, 0.7, 0.1], [-1.6, 6.15, 2.1], C.white);
  // Hose tower with louvres and a pyramid cap.
  box(p, [3.4, 14, 3.4], [5.8, 0.3, -3.5], C.brickDark);
  for (const y of [5, 8.5, 12]) windowsZ(p, 1, 1, 5.8, y, -1.78, 0.6, 1.6, C.dark, C.stone);
  box(p, [3.8, 0.5, 3.8], [5.8, 14.3, -3.5], C.stone);
  pyramid(p, 3.8, 2.4, 3.8, [5.8, 14.8, -3.5], C.slate);
  // Fire engines (with ladders) and a command car.
  for (const k of [0, 1]) {
    const x = -5.4 + k * 3.8;
    vehicle(p, x, 4.9, C.red, '#e8e4dc', true, 6, 2.6);
    box(p, [0.5, 0.15, 4.6], [x, 2.6, 4.7], C.metal);
  }
  vehicle(p, 2.2, 5.6, C.red, C.white, true);
  flagpole(p, 7, 6.8, 8, C.red);
  lamp(p, 7, 2.5, 3.8);
  return p;
}

/** Hospital (3×3): ward tower on a podium, emergency canopy, red crosses, rooftop helipad, ambulances, garden. */
export function hospitalModel(): Parts {
  const p: Parts = [];
  box(p, [23.6, 0.3, 23.6], [0, 0, 0], C.concrete);
  box(p, [23.2, 0.06, 6.5], [0, 0.3, 8.4], C.asphalt);
  // Podium wings and the ward tower.
  box(p, [21, 6.4, 12], [0, 0.3, -2], '#eef0ee', { facade: 'office' });
  box(p, [21.3, 0.5, 12.3], [0, 6.7, -2], '#c9d6d3');
  box(p, [9, 15, 9], [-3.5, 7.2, -3.5], '#f2f4f2', { facade: 'office' });
  for (let k = 0; k < 4; k++) box(p, [9.2, 0.25, 9.2], [-3.5, 9.5 + k * 3.4, -3.5], '#d9e3e0');
  box(p, [9.4, 0.6, 9.4], [-3.5, 22.2, -3.5], '#c9d6d3');
  // Helipad on the tower roof.
  cyl(p, 7.4, 0.3, [-3.5, 22.8, -3.5], '#5e6367', 24);
  for (const x of [-0.8, 0.8]) box(p, [0.5, 0.05, 3], [-3.5 + x, 23.11, -3.5], C.white);
  box(p, [1.6, 0.05, 0.5], [-3.5, 23.11, -3.5], C.white);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    cyl(p, 0.25, 0.2, [-3.5 + Math.cos(a) * 3.5, 23.1, -3.5 + Math.sin(a) * 3.5], '#f4e7c0', 6);
  }
  // Red crosses on the tower and the entrance.
  for (const [w, h] of [[2.8, 0.9], [0.9, 2.8]] as const) {
    box(p, [w, h, 0.12], [-3.5, 18.8 - h / 2 + 0.45, 1.06], C.red);
    box(p, [w * 0.7, h * 0.7, 0.12], [4.5, 5.5 - (h * 0.7) / 2 + 0.3, 4.08], C.red);
  }
  // Emergency entrance canopy, glass lobby, ambulances.
  box(p, [8, 3.6, 2], [4.5, 0.3, 4.9], C.glassDark);
  box(p, [10, 0.4, 5.2], [4.5, 4.0, 6.5], C.white);
  for (const x of [0.2, 8.8]) cyl(p, 0.3, 3.7, [x, 0.3, 8.6], C.white, 8);
  box(p, [5.6, 0.7, 0.12], [4.5, 4.6, 9.12], C.red);
  vehicle(p, 2.5, 8.3, C.white, C.red, true, 5.4, 2.2);
  vehicle(p, 6.5, 8.3, C.white, C.red, true, 5.4, 2.2);
  // Parking row and a garden with benches.
  for (let k = 0; k < 4; k++) vehicle(p, -10 + k * 2.6, 8.6, ['#9aa1a8', '#2b2d31', '#1f4e8c', '#e8e8e4'][k], C.dark, true);
  box(p, [6, 0.1, 6], [7.5, 0.3, -8.4], C.lawn);
  tree(p, 6, -9.5, 0.9);
  tree(p, 9.2, -7.4, 0.8, 'tall');
  bench(p, 7.5, -6.2);
  // Rooftop plant on the podium.
  for (const x of [2, 5, 8]) box(p, [2, 1.4, 2.4], [x, 7.2, -4], C.metal);
  cyl(p, 1.4, 1.6, [8.5, 7.2, -7], C.metalDark, 10);
  return p;
}

/** Primary school (2×2): L-shaped two-storey school with a pitched roof, playground, court and garden. */
export function schoolModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.3, 15.6], [0, 0, 0], C.lawn);
  box(p, [7, 0.06, 7], [3.6, 0.3, 3.6], '#b5563a');
  // Court markings.
  box(p, [6.4, 0.02, 0.12], [3.6, 0.36, 3.6], C.white);
  cyl(p, 2, 0.02, [3.6, 0.36, 3.6], C.white, 16);
  cyl(p, 1.8, 0.03, [3.6, 0.36, 3.6], '#b5563a', 16);
  for (const z of [0.5, 6.7]) {
    cyl(p, 0.12, 3, [3.6, 0.3, z], C.metal, 6);
    box(p, [1.2, 0.9, 0.06], [3.6, 2.9, z], C.white);
  }
  // L-shaped building.
  box(p, [14, 6.8, 5.5], [0, 0.3, -4.6], '#f0dcc0', { facade: true });
  box(p, [5.5, 6.8, 6.5], [-4.2, 0.3, 1.5], '#f0dcc0', { facade: true });
  box(p, [14.2, 0.5, 5.7], [0, 0.3, -4.6], '#c97c4c');
  box(p, [5.7, 0.5, 6.7], [-4.2, 0.3, 1.5], '#c97c4c');
  gable(p, 14.6, 2.6, 6.1, [0, 7.1, -4.6], '#9c4a3a');
  gable(p, 6.1, 2.6, 6.9, [-4.2, 7.1, 1.6], '#9c4a3a', true);
  box(p, [3, 0.25, 1.6], [-4.2, 3.0, 5.6], '#c97c4c');
  archZ(p, -4.2, 0.3, 4.78, 1.6, 2.4, C.wood);
  // Bell gable and clock over the entrance.
  disc(p, 1.2, 0.1, [-4.2, 8.2, 4.85], C.white);
  // Playground: slide, swings, sandbox.
  box(p, [1.2, 2.2, 1.2], [-1.0, 0.3, 6.2], C.yellow);
  box(p, [0.8, 0.1, 3], [-1.0, 1.4, 4.5], C.red, { rot: [-35, 0, 0] });
  for (const x of [5.8, 7.4]) cyl(p, 0.12, 2.4, [x, 0.3, -1.2], C.blue, 6);
  beamX(p, 0.12, 5.8, 7.4, 2.7, -1.2, C.blue);
  box(p, [2.4, 0.25, 2.4], [1.2, 0.3, -0.6], '#e3d3a4');
  flagpole(p, -6.8, 7, 8, C.red);
  tree(p, 6.8, -6.5, 0.9);
  tree(p, -1, -0.8, 0.7, 'tall');
  fenceRect(p, 15.4, 15.4, 1.2, '#5a6b52', 3);
  return p;
}

/** High school (3×3): three-storey teaching block, barrel-roofed sports hall, athletics track and pitch. */
export function highSchoolModel(): Parts {
  const p: Parts = [];
  box(p, [23.6, 0.3, 23.6], [0, 0, 0], C.lawn);
  // Teaching block with stair towers.
  box(p, [20, 10, 6.5], [0, 0.3, -7.8], '#e8d3b8', { facade: true });
  box(p, [20.3, 0.6, 6.8], [0, 10.3, -7.8], '#b37a55');
  for (const x of [-10.2, 10.2]) box(p, [2.2, 12, 3.2], [x * 0.93, 0.3, -7.8], '#b37a55');
  box(p, [4, 0.3, 2.2], [0, 3.4, -3.6], '#b37a55');
  archZ(p, 0, 0.3, -4.48, 2.2, 2.8, C.glassDark);
  // Sports hall with a barrel roof (half cylinder) and clerestory.
  box(p, [9, 6, 9], [-6.6, 0.3, 4.6], '#d6dbe0', { facade: 'industrial' });
  cyl(p, 9, 9, [-6.6, 6.3, 0.1], '#8a97a3', 20, { rot: [90, 0, 0] });
  // Athletics track and pitch.
  box(p, [11, 0.05, 13], [5.6, 0.3, 4.2], '#b5563a');
  box(p, [8.6, 0.06, 10.6], [5.6, 0.31, 4.2], '#5f9a3e');
  box(p, [8.6, 0.02, 0.12], [5.6, 0.38, 4.2], C.white);
  cyl(p, 2.4, 0.02, [5.6, 0.38, 4.2], C.white, 20);
  cyl(p, 2.2, 0.03, [5.6, 0.38, 4.2], '#5f9a3e', 20);
  for (const z of [-0.9, 9.3]) {
    box(p, [2.4, 1.4, 0.08], [5.6, 0.3, z], C.white);
    box(p, [2.4, 0.08, 0.8], [5.6, 1.7, z + (z < 4 ? 0.4 : -0.4)], C.white);
  }
  // Stands along the pitch.
  for (let k = 0; k < 3; k++) box(p, [1, 0.5 + k * 0.5, 9], [11.1 - k, 0.3, 4.2], C.concrete);
  flagpole(p, -2.2, -3.2, 9, C.red);
  tree(p, -11, -2, 0.9);
  tree(p, -1, 10.6, 0.8, 'tall');
  fenceRect(p, 23.4, 23.4, 1.4, '#5a6b52', 4);
  return p;
}

/** Garbage depot (2×2): truck hangar, sorting shed, container rows, garbage trucks, fenced yard. */
export function garbageModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.3, 15.6], [0, 0, 0], C.concreteDark);
  box(p, [9, 6, 8], [-3, 0.3, -3.5], '#8f9a86', { facade: 'industrial' });
  gable(p, 9.4, 1.6, 8.4, [-3, 6.3, -3.5], '#5d6658', true);
  for (let k = 0; k < 2; k++) box(p, [3.4, 4.4, 0.12], [-5.2 + k * 4.4, 0.3, 0.56], C.metalDark);
  // Sorting shed (open, on posts).
  for (const x of [2.6, 7.2]) for (const z of [-7, -1.5]) cyl(p, 0.3, 4.2, [x, 0.3, z], C.metal, 6);
  box(p, [5.4, 0.3, 6.4], [4.9, 4.5, -4.25], '#6c7a6a');
  for (let k = 0; k < 3; k++) box(p, [1.4, 1.2, 1.4], [3.4 + k * 1.6, 0.3, -4.2], ['#3d8a4d', '#2f6db5', '#c79a2a'][k]);
  // Container row along the side, trucks on the yard.
  for (let k = 0; k < 4; k++) box(p, [1.8, 1.5, 2.4], [-6.2 + k * 2.2, 0.3, 5.8], ['#3d8a4d', '#3d8a4d', '#7a7f86', '#2f6db5'][k]);
  vehicle(p, 1.6, 3.2, '#e4e2dc', '#3d8a4d', false, 7, 2.8);
  vehicle(p, 4.6, 5.8, '#e4e2dc', '#3d8a4d', false, 7, 2.8);
  fenceRect(p, 15.4, 15.4, 2, C.metalDark, 5);
  return p;
}

/** Small park (1×1): winding path, pond, benches, playground spring rider, trees and a lamp. */
export function parkSmallModel(): Parts {
  const p: Parts = [];
  box(p, [7.8, 0.25, 7.8], [0, 0, 0], C.lawn);
  box(p, [1.3, 0.04, 7.8], [0, 0.25, 0], '#cbbf9f');
  box(p, [5, 0.04, 1.3], [1.6, 0.25, 1.2], '#cbbf9f', { rot: [0, 35, 0] });
  cyl(p, 2.6, 0.06, [-2.2, 0.25, -2.0], C.stoneDark, 18);
  cyl(p, 2.3, 0.08, [-2.2, 0.26, -2.0], C.water, 18);
  bench(p, 1.6, -2.4, true);
  bench(p, -1.6, 2.6);
  lamp(p, 0.9, 1.0, 3.2);
  tree(p, 2.6, 2.6, 0.9);
  tree(p, 2.8, -2.6, 0.7, 'cone');
  tree(p, -2.8, 2.6, 0.6, 'tall');
  for (const [x, z] of [[-3.3, 0.2], [3.3, 0.4], [-0.6, -3.4]] as const) dome(p, 0.9, 0.6, [x, 0.25, z], C.greenDark, 8);
  return p;
}

/** Large park (2×2): loop path, lake with a footbridge, pavilion, playground, flower beds and trees. */
export function parkLargeModel(): Parts {
  const p: Parts = [];
  box(p, [15.8, 0.25, 15.8], [0, 0, 0], C.lawn);
  // Loop path.
  for (const s of [-1, 1]) {
    box(p, [12, 0.04, 1.4], [0, 0.25, s * 5.4], '#cbbf9f');
    box(p, [1.4, 0.04, 12], [s * 5.4, 0.25, 0], '#cbbf9f');
  }
  box(p, [1.4, 0.04, 2.6], [0, 0.25, 6.8], '#cbbf9f');
  // Lake with a timber footbridge.
  cyl(p, 6.4, 0.06, [-1.6, 0.25, -1.4], C.stoneDark, 24);
  cyl(p, 6, 0.08, [-1.6, 0.26, -1.4], C.water, 24);
  box(p, [1.4, 0.18, 6.6], [-1.6, 0.6, -1.4], C.wood);
  for (const s of [-1, 1]) box(p, [0.08, 0.8, 6.6], [-1.6 + s * 0.66, 0.78, -1.4], C.wood);
  // Pavilion (gazebo).
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    cyl(p, 0.2, 2.6, [4.2 + Math.cos(a) * 1.6, 0.3, 3.4 + Math.sin(a) * 1.6], C.white, 6);
  }
  cyl(p, 3.6, 0.3, [4.2, 0.25, 3.4], C.stone, 12);
  p.push({ shape: 'cone', size: [4.4, 1.6, 4.4], pos: [4.2, 2.9, 3.4], color: '#7a3b30', segments: 6 });
  // Playground and flower beds.
  box(p, [1.2, 2.2, 1.2], [3.6, 0.25, -3.6], C.yellow);
  box(p, [0.8, 0.1, 3], [3.6, 1.3, -1.9], C.red, { rot: [-35, 0, 0] });
  for (const [x, z, c] of [[-6.6, 6.6, '#d9483b'], [6.6, -6.6, '#e0a321'], [-6.6, -6.6, '#8a4fc2']] as const) {
    cyl(p, 1.8, 0.35, [x, 0.25, z], C.stoneDark, 12);
    dome(p, 1.6, 0.4, [x, 0.55, z], c, 10);
  }
  for (const [x, z, k] of [[6.6, 6.6, 'round'], [-6.8, 2, 'tall'], [2, -6.8, 'cone'], [-3, 6.6, 'round'], [6.8, -2, 'tall']] as const) tree(p, x, z, 1, k);
  bench(p, 0, 4.4);
  bench(p, -4.4, 3, true);
  lamp(p, 5.4, 6.4, 3.4);
  lamp(p, -5.4, -6.4, 3.4);
  return p;
}

// ---------------------------------------------------------------- utilities

/** Coal power plant (3×3): boiler house, turbine hall, two banded stacks, cooling tower, coal yard, conveyor. */
export function coalPlantModel(): Parts {
  const p: Parts = [];
  box(p, [23.5, 0.3, 23.5], [0, 0, 0], C.concrete);
  // Turbine hall and boiler house.
  box(p, [14, 9, 8], [-3.5, 0.3, 4.5], '#8f8a80', { facade: 'industrial' });
  gable(p, 14.4, 1.8, 8.4, [-3.5, 9.3, 4.5], '#5d6166');
  box(p, [7, 17, 8], [-6.5, 0.3, -4.5], '#77736c', { facade: 'industrial' });
  box(p, [7.3, 0.6, 8.3], [-6.5, 17.3, -4.5], '#5d6166');
  for (let k = 0; k < 4; k++) box(p, [7.1, 0.2, 8.1], [-6.5, 4 + k * 3.5, -4.5], '#6a665f');
  // Stacks with red/white bands.
  for (const [x, z, h] of [[2.5, -6, 32], [6, -6, 27]] as const) {
    cyl(p, 2.6, h, [x, 0.3, z], '#b5aca0', 14);
    for (const y of [h - 4, h - 1.4]) cyl(p, 2.75, 1.2, [x, y, z], '#b5472f', 14);
    cyl(p, 2.8, 0.4, [x, h + 0.2, z], C.dark, 14);
  }
  // Cooling tower: flared base, waist, flared lip.
  cyl(p, 9, 0.6, [6, 0.3, 5.5], C.concreteDark, 24);
  p.push({ shape: 'cone', size: [9, 14, 9], pos: [6, 0.9, 5.5], color: '#c9c4ba', segments: 24 });
  cyl(p, 5.4, 6, [6, 6.6, 5.5], '#c9c4ba', 24);
  p.push({ shape: 'cone', size: [6.2, 2, 6.2], pos: [6, 14.4, 5.5], color: '#c9c4ba', segments: 24, rot: [180, 0, 0] });
  cyl(p, 6.2, 0.4, [6, 12.4, 5.5], '#b8b2a7', 24);
  // Coal heaps, conveyor and transformer yard.
  cone(p, 6, 3.2, [-7.5, 0.3, -9.8 + 3], '#2a2a2a', 10);
  cone(p, 4.5, 2.4, [-2.5, 0.3, -9], '#2f2f2f', 10);
  box(p, [1.2, 0.8, 9], [-6.5, 2.0, -7.5], C.metalDark, { rot: [-28, 0, 0] });
  for (let k = 0; k < 3; k++) box(p, [1.4, 2.2, 1.2], [3 + k * 2.4, 0.3, 10.6], C.metal);
  for (let k = 0; k < 3; k++) cyl(p, 0.18, 4.5, [3 + k * 2.4, 0.3, 9.4], C.metalDark, 6);
  beamX(p, 0.5, -10, 3, 7.5, -1, C.metalDark);
  return p;
}

/** Wind turbine (1×1): tapered tower in three sections, nacelle, hub and three tapered blades. */
export function windTurbineModel(): Parts {
  const p: Parts = [];
  cyl(p, 4, 0.6, [0, 0, 0], C.concrete, 16);
  cyl(p, 1.5, 9, [0, 0.6, 0], C.white, 14);
  cyl(p, 1.25, 9, [0, 9.6, 0], C.white, 14);
  cyl(p, 1.0, 8.4, [0, 18.6, 0], C.white, 14);
  box(p, [0.5, 2.2, 0.08], [0, 0.6, 0.76], '#c9ccd0');
  // Nacelle and spinner.
  box(p, [1.8, 1.8, 4.2], [0, 26.6, -0.5], C.white);
  box(p, [1.9, 0.12, 4.3], [0, 27.6, -0.5], '#c9ccd0');
  dome(p, 1.4, 1.0, [0, 27.5, 1.6], '#d6d9dc', 12, { rot: [90, 0, 0] });
  // Blades (tapered: root, mid and outer segments, red tips), 120° apart.
  for (const a of [0, 120, 240]) {
    const r = (a * Math.PI) / 180;
    const dx = -Math.sin(r);
    const dy = Math.cos(r);
    const at = (d: number): [number, number, number] => [dx * d, 27.5 + dy * d, 2.04];
    box(p, [1.0, 2.5, 0.35], at(0), C.white, { rot: [0, 0, a] });
    box(p, [0.7, 6, 0.25], at(0), C.white, { rot: [0, 0, a] });
    box(p, [0.45, 5, 0.18], at(5.5), C.white, { rot: [0, 0, a] });
    box(p, [0.3, 1.4, 0.14], at(10.5), '#d64a3a', { rot: [0, 0, a] });
  }
  return p;
}

/** Water pump (2×2): pump house, intake pipes to the shore, surge tanks, valve chamber. */
export function waterPumpModel(): Parts {
  const p: Parts = [];
  box(p, [15.5, 0.3, 15.5], [0, 0, 0], C.concrete);
  box(p, [7, 5.6, 6], [-2.5, 0.3, -1], '#b8c4c9', { facade: 'industrial' });
  gable(p, 7.4, 1.8, 6.4, [-2.5, 5.9, -1], '#4f6b7a');
  archZ(p, -2.5, 0.3, 2.06, 1.6, 2.4, C.metalDark);
  // Intake pipes running to the lot edge (shore side).
  for (const x of [-4, -1]) {
    beamZ(p, 1.0, -7.7, -4, 1.0, x, '#3f6d8a', 12);
    cyl(p, 1.5, 0.4, [x, 0.5, -7.6], C.concreteDark, 12);
  }
  // Surge tanks and the outlet main.
  for (const x of [3.2, 6]) {
    cyl(p, 2.4, 5, [x, 0.3, -2.5], '#d8dfe3', 16);
    dome(p, 2.4, 0.7, [x, 5.3, -2.5], '#d8dfe3', 16);
  }
  beamX(p, 0.8, 1.0, 7.5, 1.3, 2, '#3f6d8a', 10);
  box(p, [2.6, 1.2, 2.6], [4.6, 0.3, 4.8], C.concreteDark);
  cyl(p, 0.8, 0.4, [4.6, 1.5, 4.8], C.blue, 10);
  fenceRect(p, 15.3, 15.3, 1.6, C.metalDark, 4);
  return p;
}

/** Water tower (1×1): steel legs with cross braces, round tank with a domed top, ladder and catwalk. */
export function waterTowerModel(): Parts {
  const p: Parts = [];
  box(p, [7.6, 0.3, 7.6], [0, 0, 0], C.concrete);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(p, [0.8, 0.6, 0.8], [sx * 2.4, 0.3, sz * 2.4], C.concreteDark);
    cyl(p, 0.4, 13, [sx * 2.4, 0.9, sz * 2.4], C.metal, 8);
  }
  for (const y of [5, 9.5]) {
    for (const s of [-1, 1]) {
      beamX(p, 0.18, -2.4, 2.4, y, s * 2.4, C.metalDark);
      beamZ(p, 0.18, -2.4, 2.4, y, s * 2.4, C.metalDark);
    }
  }
  cyl(p, 0.9, 12.8, [0, 0.9, 0], '#5f7f99', 10);
  // Tank: conical bottom, drum, catwalk ring, domed roof.
  p.push({ shape: 'cone', size: [6.6, 2.0, 6.6], pos: [0, 14.0, 0], color: '#cfd9e0', segments: 20, rot: [180, 0, 0] });
  cyl(p, 6.6, 4.6, [0, 14.0, 0], '#cfd9e0', 20);
  cyl(p, 7.4, 0.2, [0, 14.0, 0], C.metalDark, 20);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    cyl(p, 0.08, 1.0, [Math.cos(a) * 3.65, 14.2, Math.sin(a) * 3.65], C.metalDark, 4);
  }
  dome(p, 6.6, 1.6, [0, 18.6, 0], '#b9c6cf', 20);
  box(p, [3.4, 0.9, 0.1], [0, 16.0, 3.31], C.blue);
  // Ladder up one leg.
  for (const x of [-0.25, 0.25]) box(p, [0.06, 13, 0.06], [2.4 + x, 0.9, 2.9], C.metalDark);
  for (let y = 1.5; y < 14; y += 0.9) box(p, [0.5, 0.05, 0.06], [2.4, y, 2.9], C.metalDark);
  cyl(p, 0.3, 1.4, [0, 20.2, 0], C.metalDark, 6);
  return p;
}

/** Sewage outfall (1×1): concrete headwall with a pipe mouth, grate, valve house and warning sign. */
export function sewageOutletModel(): Parts {
  const p: Parts = [];
  box(p, [7.6, 0.3, 7.6], [0, 0, 0], C.concreteDark);
  box(p, [6.4, 2.6, 1.4], [0, 0.3, -3], C.concrete);
  for (const s of [-1, 1]) box(p, [1.0, 2.2, 3.2], [s * 3.3, 0.3, -2.1], C.concrete, { rot: [0, s * 15, 0] });
  disc(p, 1.8, 0.4, [0, 1.4, -2.2], '#3a3e40', '-z', 16);
  disc(p, 1.4, 0.45, [0, 1.4, -2.25], '#4f5a3a', '-z', 16);
  beamZ(p, 1.6, -2.2, 2.0, 1.4, 0, C.concreteDark, 12);
  box(p, [3, 2.6, 2.6], [0, 0.3, 2.2], '#a8b0a0');
  gable(p, 3.3, 1, 2.9, [0, 2.9, 2.2], '#5d6658');
  box(p, [0.08, 1.6, 0.08], [2.8, 0.3, 3], C.metalDark);
  box(p, [0.9, 0.7, 0.05], [2.8, 1.6, 3.05], C.yellow);
  // Grate over the channel, railing and a manhole.
  for (let k = 0; k < 5; k++) box(p, [1.6, 0.06, 0.12], [0, 0.32, -1.6 + k * 0.5], C.metalDark);
  for (const s of [-1, 1]) box(p, [0.06, 1.0, 3.6], [s * 1.6, 0.3, -1.2], C.yellow);
  cyl(p, 0.9, 0.06, [-2.4, 0.3, 1.6], C.metalDark, 12);
  return p;
}

/** Water treatment plant (3×3): round clarifiers with bridges, aeration basins, control building, tanks. */
export function waterTreatmentModel(): Parts {
  const p: Parts = [];
  box(p, [23.5, 0.3, 23.5], [0, 0, 0], C.concrete);
  // Two round clarifiers with rotating bridges.
  for (const [x, z] of [[-6, -5.5], [5, -5.5]] as const) {
    cyl(p, 9.2, 1.8, [x, 0.3, z], C.concreteDark, 28);
    cyl(p, 8.6, 1.82, [x, 0.31, z], '#5f8a7a', 28);
    cyl(p, 1, 2.6, [x, 0.3, z], C.metal, 10);
    box(p, [9, 0.3, 0.8], [x, 2.6, z], C.metalDark);
    for (const s of [-1, 1]) box(p, [9, 0.6, 0.06], [x, 2.9, z + s * 0.4], C.yellow);
  }
  // Rectangular aeration basins.
  for (let k = 0; k < 3; k++) {
    box(p, [4.2, 1.6, 7.5], [-8 + k * 4.6, 0.3, 5.6], C.concreteDark);
    box(p, [3.8, 1.62, 7.1], [-8 + k * 4.6, 0.31, 5.6], '#7a8a5a');
  }
  // Control building, chemical tanks, pipe rack.
  box(p, [7, 5, 6], [7.4, 0.3, 6.2], '#d2d8da', { facade: 'office' });
  hip(p, 7.4, 1.6, 6.4, [7.4, 5.3, 6.2], '#4f6b7a');
  for (const x of [3.2, 5]) cyl(p, 1.4, 4, [x, 0.3, 9.6], '#e6ecef', 12);
  beamX(p, 0.6, -10, 10, 3.2, 1.0, '#3f6d8a', 10);
  for (const x of [-9, -3, 3, 9]) cyl(p, 0.25, 3.2, [x, 0.3, 1.0], C.metalDark, 6);
  fenceRect(p, 23.3, 23.3, 1.8, C.metalDark, 5);
  return p;
}
