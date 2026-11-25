import { bench, box, C, cone, cyl, dome, fenceRect, flagpole, gable, hip, lamp, type Parts, pyramid, tree, vehicle, windowsZ } from './kit';

const CAR_COLORS = ['#c8ccd0', '#2b2f36', '#a83232', '#2f5d9b', '#e8e6e0', '#6b6f45', '#8c8f94', '#b8862f'];

// ---------------------------------------------------------------- education, health, culture

/** Kindergarten (2×2): low, colourful pavilion with a fenced playground and sandpit. */
export function kindergartenModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.25, 15.6], [0, 0, 0], C.lawn);
  box(p, [10, 3.6, 6.5], [-2, 0.25, -3.5], '#f2d79a', { facade: 'residential' });
  hip(p, 10.6, 1.8, 7.1, [-2, 3.85, -3.5], '#c0653a');
  for (const [x, c] of [[-5.5, '#d9483b'], [-2, '#2f7dd1'], [1.5, '#2fa36b']] as const) box(p, [2.2, 2.4, 0.1], [x, 0.25, -0.2], c);
  box(p, [3, 0.25, 2], [-2, 2.6, 0.6], '#2f7dd1');
  // Playground: sandpit, slide, swings.
  box(p, [3.6, 0.3, 3.6], [4.2, 0.25, 3.8], C.wood);
  box(p, [3.2, 0.2, 3.2], [4.2, 0.35, 3.8], '#e6d3a1');
  box(p, [1, 1.8, 1], [-4, 0.25, 4.6], C.yellow);
  box(p, [0.7, 0.1, 2.6], [-4, 1.2, 6.2], C.red, { rot: [-35, 0, 0] });
  for (const x of [0.2, 2.2]) box(p, [0.1, 2.2, 0.1], [x, 0.25, 5], '#2f7dd1');
  box(p, [2.2, 0.1, 0.1], [1.2, 2.4, 5], '#2f7dd1');
  fenceRect(p, 15.4, 15.4, 1.1, '#e8e2d2', 3);
  tree(p, 6, -5.5, 0.9);
  tree(p, -6.4, 1.6, 0.7, 'round');
  return p;
}

/** Health clinic (2×2): white two-storey block with a green cross, canopy and an ambulance bay. */
export function clinicModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.3, 15.6], [0, 0, 0], C.paving);
  box(p, [12, 6.6, 8], [0, 0.3, -2.4], C.white, { facade: 'office' });
  box(p, [12.3, 0.5, 8.3], [0, 6.9, -2.4], '#cfd6dc');
  box(p, [5, 0.3, 3], [0, 3.4, 3.1], '#2fa36b');
  for (const x of [-2.2, 2.2]) cyl(p, 0.25, 3.1, [x, 0.3, 4.3], C.white, 8);
  box(p, [3.2, 3, 0.15], [0, 0.3, 1.66], C.glassDark);
  // Green cross on the facade and on a sign.
  box(p, [0.6, 2, 0.12], [3.8, 4, 1.65], '#2fa36b');
  box(p, [2, 0.6, 0.12], [3.8, 4.7, 1.65], '#2fa36b');
  vehicle(p, -5.2, 5, C.white, '#c0392b', true, 5, 2);
  bench(p, 5, 5.8);
  tree(p, 6.4, 6.4, 0.7);
  tree(p, -6.6, -6.6, 0.8);
  return p;
}

/** Library (2×2): stone reading hall with a copper dome, columned portico and a small square. */
export function libraryModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.3, 15.6], [0, 0, 0], C.paving);
  box(p, [12, 7, 9], [0, 0.3, -2.4], C.stone, { facade: 'office' });
  box(p, [12.4, 0.6, 9.4], [0, 7.3, -2.4], C.stoneDark);
  cyl(p, 6, 1.6, [0, 7.9, -2.4], C.stone, 16);
  dome(p, 6.2, 3, [0, 9.5, -2.4], C.copper, 18);
  cyl(p, 0.3, 1.4, [0, 12.4, -2.4], C.gold, 6);
  // Portico.
  box(p, [8, 0.6, 3], [0, 0.3, 3.4], C.stoneDark);
  for (let k = 0; k < 6; k++) cyl(p, 0.55, 5.4, [-3.4 + k * 1.36, 0.9, 4.4], C.marble, 10);
  box(p, [8.4, 0.7, 3.2], [0, 6.3, 3.4], C.stone);
  gable(p, 8.4, 1.6, 3.2, [0, 7, 3.4], C.stoneDark);
  windowsZ(p, 4, 10, 0, 2.5, 2.12, 1.1, 2.6, C.glassDark, C.stoneDark);
  for (const x of [-5.5, 5.5]) lamp(p, x, 6.6, 3.6);
  bench(p, -3.5, 6.6);
  bench(p, 3.5, 6.6);
  tree(p, 6.6, -6.6, 0.9);
  return p;
}

/** University (4×4): main hall with a clock tower, two faculty wings, a green quad and trees. */
export function universityModel(): Parts {
  const p: Parts = [];
  const S = 31.6;
  box(p, [S, 0.3, S], [0, 0, 0], C.lawn);
  // Paths across the quad.
  box(p, [2.2, 0.05, S - 2], [0, 0.3, 0], C.paving);
  box(p, [S - 10, 0.05, 2.2], [0, 0.3, 2], C.paving);
  // Main hall at the back.
  box(p, [22, 10, 8], [0, 0.3, -10.5], C.brick, { facade: 'office' });
  box(p, [22.4, 0.6, 8.4], [0, 10.3, -10.5], C.stone);
  gable(p, 22.4, 3, 8.4, [0, 10.9, -10.5], C.slate);
  // Clock tower.
  box(p, [4.4, 20, 4.4], [0, 0.3, -6], C.brickDark);
  box(p, [4.8, 0.6, 4.8], [0, 20.3, -6], C.stone);
  cyl(p, 2.2, 0.1, [0, 16, -3.76], C.white, 18, { rot: [90, 0, 0] });
  pyramid(p, 4.8, 5, 4.8, [0, 20.9, -6], C.copper);
  // Faculty wings.
  for (const sx of [-1, 1]) {
    box(p, [7, 8, 16], [sx * 11.5, 0.3, 2], '#c98a6a', { facade: 'office' });
    hip(p, 7.6, 2.2, 16.6, [sx * 11.5, 8.3, 2], C.slate);
  }
  box(p, [6, 3.6, 1.6], [0, 0.3, -5.6], C.glassDark);
  flagpole(p, -3.5, 10, 9, C.blue);
  for (const [x, z] of [[-5, 8], [5, 8], [-5, 13], [5, 13], [-12, 13], [12, 13]] as const) tree(p, x, z, 1.1);
  for (const x of [-3, 3]) bench(p, x, 5.5);
  lamp(p, -2, 10, 3.6);
  lamp(p, 2, 10, 3.6);
  return p;
}

// ---------------------------------------------------------------- parking

/** Surface car park (2×2): marked bays in two rows with parked cars, a pay machine and trees. */
export function parkingLotModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.22, 15.6], [0, 0, 0], C.asphalt);
  for (const z of [-4.2, 4.2]) {
    for (let k = 0; k <= 5; k++) box(p, [0.12, 0.02, 5], [-6.25 + k * 2.5, 0.22, z], C.white);
  }
  box(p, [13, 0.02, 0.12], [0, 0.22, -6.7], C.white);
  box(p, [13, 0.02, 0.12], [0, 0.22, 6.7], C.white);
  for (let k = 0; k < 5; k++) {
    if (k !== 2) vehicle(p, -5 + k * 2.5, -4.2, CAR_COLORS[k % CAR_COLORS.length], C.dark, true);
    if (k !== 4) vehicle(p, -5 + k * 2.5, 4.2, CAR_COLORS[(k + 3) % CAR_COLORS.length], C.dark, true);
  }
  box(p, [0.5, 1.4, 0.4], [7, 0.22, 0], C.metalDark);
  for (const x of [-7.2, 7.2]) tree(p, x, -7.2, 0.6);
  lamp(p, 0, 0, 5);
  return p;
}

/** Multi-storey car park (2×2): four open decks with cars, a ramp tower and an entry barrier. */
export function parkingGarageModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.25, 15.6], [0, 0, 0], C.concrete);
  const levels = 4;
  for (let l = 0; l < levels; l++) {
    const y = 0.25 + l * 3;
    box(p, [12, 0.4, 13], [-1.2, y + 2.6, -0.5], C.concrete);
    // Parapets with gaps (open deck).
    for (const z of [-7, 6]) box(p, [12, 1, 0.3], [-1.2, y + 3, z], C.concreteDark);
    for (let k = 0; k < 3; k++) vehicle(p, -5 + k * 3.2, -4 + (l % 2) * 6, CAR_COLORS[(k + l) % CAR_COLORS.length], C.dark, true);
  }
  for (const [x, z] of [[-7, -6.8], [4.6, -6.8], [-7, 5.8], [4.6, 5.8]] as const) box(p, [0.6, levels * 3 + 0.6, 0.6], [x, 0.25, z], C.concreteDark);
  // Ramp tower and stair core.
  box(p, [3, levels * 3 + 1.2, 4], [6.4, 0.25, -3], '#d0d4d8');
  box(p, [2.6, 0.5, 1.2], [6.4, levels * 3 + 1.4, -3], '#2f6db5');
  box(p, [2.4, 1.2, 0.1], [6.4, levels * 3 + 0.2, -0.96], '#2f6db5');
  box(p, [0.15, 1.1, 0.15], [4.8, 0.25, 7], C.metalDark);
  box(p, [3, 0.12, 0.12], [3.3, 1.2, 7], '#e0b23a');
  return p;
}

// ---------------------------------------------------------------- parks

/** Formal garden (2×2): clipped hedges in a cross, a central fountain, gravel walks and urns. */
export function formalGardenModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.25, 15.6], [0, 0, 0], '#d8cba8');
  for (const [x, z] of [[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]] as const) {
    box(p, [6, 0.12, 6], [x, 0.25, z], C.lawn);
    box(p, [6, 0.9, 0.5], [x, 0.25, z + (z > 0 ? 2.75 : -2.75)], C.greenDark);
    box(p, [0.5, 0.9, 6], [x + (x > 0 ? 2.75 : -2.75), 0.25, z], C.greenDark);
    cone(p, 1, 2.2, [x, 0.37, z], C.greenDark, 8);
  }
  cyl(p, 3.6, 0.6, [0, 0.25, 0], C.stone, 18);
  cyl(p, 3.1, 0.12, [0, 0.75, 0], C.water, 18);
  cyl(p, 0.8, 1.2, [0, 0.85, 0], C.stone, 10);
  for (const [x, z] of [[-1.6, 7.2], [1.6, 7.2]] as const) cyl(p, 0.7, 1, [x, 0.25, z], C.stoneDark, 8);
  bench(p, 0, -6.6);
  return p;
}

/** Park with a carousel (2×2): striped-roof merry-go-round, paths, benches and trees. */
export function carouselParkModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.25, 15.6], [0, 0, 0], C.lawn);
  cyl(p, 9, 0.05, [0, 0.25, 0], C.paving, 24);
  cyl(p, 6.4, 0.5, [0, 0.3, 0], '#e8e2d2', 18);
  cyl(p, 0.6, 4.4, [0, 0.8, 0], C.gold, 8);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    cyl(p, 0.12, 3, [Math.cos(a) * 2.5, 0.8, Math.sin(a) * 2.5], C.gold, 5);
    box(p, [0.4, 1, 1.2], [Math.cos(a) * 2.5, 1.4, Math.sin(a) * 2.5], k % 2 ? '#f2f0ea' : '#c0392b', { rot: [0, (-a * 180) / Math.PI, 0] });
  }
  p.push({ shape: 'cone', size: [7.4, 2, 7.4], pos: [0, 3.8, 0], color: '#c0392b', segments: 16 });
  cyl(p, 7.2, 0.4, [0, 3.6, 0], '#f2f0ea', 16);
  cyl(p, 0.2, 1.2, [0, 5.8, 0], C.gold, 6);
  for (const [x, z] of [[-6.4, -6.4], [6.4, -6.4], [-6.4, 6.4], [6.4, 6.4]] as const) tree(p, x, z, 0.9);
  bench(p, 0, 6.8);
  bench(p, -6.8, 0, true);
  lamp(p, 4.6, 4.6, 3.4);
  return p;
}

/** Playground (1×1): climbing frame with a slide, swings, sandpit and soft surfacing. */
export function playgroundModel(): Parts {
  const p: Parts = [];
  box(p, [7.8, 0.25, 7.8], [0, 0, 0], C.lawn);
  box(p, [6.6, 0.06, 6.6], [0, 0.25, 0], '#c96a4a');
  box(p, [1.6, 2, 1.6], [-1.6, 0.31, -1.6], C.yellow);
  pyramid(p, 1.9, 1, 1.9, [-1.6, 2.31, -1.6], C.red);
  box(p, [0.8, 0.1, 2.8], [-1.6, 1.2, 0.4], '#2f7dd1', { rot: [-35, 0, 0] });
  for (const x of [1, 2.8]) box(p, [0.1, 2.2, 0.1], [x, 0.31, -2], '#2fa36b');
  box(p, [2, 0.1, 0.1], [1.9, 2.5, -2], '#2fa36b');
  box(p, [2.4, 0.25, 2.4], [1.8, 0.31, 1.8], C.wood);
  box(p, [2.1, 0.1, 2.1], [1.8, 0.45, 1.8], '#e6d3a1');
  bench(p, -2.6, 3.1);
  tree(p, 3.2, -3.2, 0.6);
  return p;
}

/** Allotment gardens (2×2): fenced vegetable plots with little sheds and a water butt. */
export function allotmentsModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.25, 15.6], [0, 0, 0], C.lawn);
  box(p, [1.6, 0.05, 15], [0, 0.25, 0], '#cbbf9f');
  const crops = ['#6f9a4a', '#a8c46a', '#5c3a2a', '#c9a35a', '#4f7f33', '#8a5a3c'];
  for (let k = 0; k < 6; k++) {
    const x = k % 2 ? 4 : -4;
    const z = -5 + Math.floor(k / 2) * 5;
    box(p, [5.4, 0.18, 4], [x, 0.25, z], crops[k]);
    for (let r = 0; r < 4; r++) box(p, [5, 0.18, 0.25], [x, 0.43, z - 1.5 + r], '#3d6a2a');
    if (k % 3 === 0) {
      box(p, [1.6, 1.8, 1.4], [x + (x > 0 ? 1.7 : -1.7), 0.25, z + 1.2], C.wood);
      gable(p, 1.9, 0.6, 1.6, [x + (x > 0 ? 1.7 : -1.7), 2.05, z + 1.2], '#5a3a2a');
    }
  }
  cyl(p, 0.8, 1, [0.9, 0.25, 6.6], '#2f5d4a', 10);
  fenceRect(p, 15.4, 15.4, 1, C.wood, 2);
  return p;
}

/** Sports field (3×2): football pitch with lines and goals, a small stand and floodlights. */
export function sportsFieldModel(): Parts {
  const p: Parts = [];
  box(p, [23.6, 0.25, 15.6], [0, 0, 0], '#5f9a3c');
  box(p, [20, 0.04, 11], [0, 0.25, -1], '#6faa48');
  for (const z of [-6.5, 4.5]) box(p, [20, 0.03, 0.2], [0, 0.29, z], C.white);
  for (const x of [-10, 10]) box(p, [0.2, 0.03, 11], [x, 0.29, -1], C.white);
  box(p, [0.2, 0.03, 11], [0, 0.29, -1], C.white);
  cyl(p, 3.6, 0.03, [0, 0.27, -1], C.white, 20);
  cyl(p, 3.2, 0.04, [0, 0.28, -1], '#6faa48', 20);
  for (const sx of [-1, 1]) {
    box(p, [0.15, 2.2, 0.15], [sx * 9.8, 0.25, -2.8], C.white);
    box(p, [0.15, 2.2, 0.15], [sx * 9.8, 0.25, 0.8], C.white);
    box(p, [0.15, 0.15, 3.8], [sx * 9.8, 2.4, -1], C.white);
  }
  // Stand along the front.
  for (let r = 0; r < 3; r++) box(p, [12, 0.5, 0.9], [0, 0.25 + r * 0.5, 6 + r * 0.8], r % 2 ? '#2f5d9b' : '#c0392b');
  for (const [x, z] of [[-11.2, -7.2], [11.2, -7.2], [-11.2, 7], [11.2, 7]] as const) {
    cyl(p, 0.3, 9, [x, 0.25, z], C.metal, 6);
    box(p, [1.6, 0.8, 0.4], [x, 9.2, z], C.metalDark);
  }
  return p;
}

/** Outdoor swimming pool (2×2): pool hall, a big pool and a paddling pool, deck chairs and umbrellas. */
export function swimmingPoolModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.3, 15.6], [0, 0, 0], '#e8e2d2');
  box(p, [14, 4, 4], [0, 0.3, -5.6], C.white, { facade: 'shop' });
  box(p, [14.4, 0.4, 4.4], [0, 4.3, -5.6], '#2f7dd1');
  box(p, [10, 0.12, 6], [-1.4, 0.3, 1.4], '#2f6db5');
  box(p, [9.6, 0.14, 5.6], [-1.4, 0.32, 1.4], '#5fc3e4');
  for (let k = 1; k < 5; k++) box(p, [9.6, 0.02, 0.08], [-1.4, 0.47, -1.4 + k * 1.12], C.white);
  cyl(p, 3, 0.1, [5.4, 0.3, 4.4], '#5fc3e4', 16);
  for (let k = 0; k < 4; k++) {
    box(p, [0.6, 0.2, 1.8], [-6 + k * 2.2, 0.3, 6.4], '#f2f0ea', { rot: [8, 0, 0] });
    if (k % 2 === 0) {
      cyl(p, 0.08, 2.2, [-6 + k * 2.2 + 1.1, 0.3, 6.6], C.metal, 4);
      p.push({ shape: 'cone', size: [2.4, 0.6, 2.4], pos: [-6 + k * 2.2 + 1.1, 2.3, 6.6], color: k ? '#e0a321' : '#c0392b', segments: 8 });
    }
  }
  box(p, [1, 3.4, 1], [3.4, 0.3, -1.4], C.white);
  box(p, [1, 0.12, 2], [3.4, 3.4, -0.6], '#2f7dd1');
  tree(p, 7, -1, 0.7);
  return p;
}

// ---------------------------------------------------------------- transport

/** A parked city bus (11 m) along z, centred at (x, z). */
function parkedBus(p: Parts, x: number, z: number, stripe: string): void {
  box(p, [2.5, 2.6, 11], [x, 0.55, z], '#f1f1ee');
  box(p, [2.56, 0.9, 9.6], [x, 1.6, z - 0.3], C.glassDark);
  box(p, [2.56, 0.35, 11], [x, 0.9, z], stripe);
  box(p, [2.3, 0.3, 10.4], [x, 3.15, z], stripe);
  box(p, [1.6, 0.35, 2.4], [x, 3.45, z - 1], '#d8d8d8');
  for (const dz of [-3.6, 3.4]) for (const dx of [-1.2, 1.2]) cyl(p, 0.95, 0.35, [x + dx, 0.55, z + dz], '#222222', 10, { rot: [0, 0, 90] });
}

/** Bus depot (3×2): sawtooth-roofed garage with three bays, office, fuel island, bus yard, fenced gate. */
export function busDepotModel(): Parts {
  const p: Parts = [];
  box(p, [23.6, 0.3, 15.6], [0, 0, 0], C.concreteDark);
  // Garage hall along the back.
  box(p, [17, 6.2, 7.2], [-3, 0.3, -4], '#c9c4b8', { facade: 'industrial' });
  for (let k = 0; k < 4; k++) {
    box(p, [4.25, 1.4, 7.2], [-9.4 + k * 4.25, 6.5, -4], '#6f767c', { rot: [0, 0, 18] });
    box(p, [0.2, 1.4, 7.2], [-7.4 + k * 4.25, 6.5, -4], C.glass);
  }
  for (let k = 0; k < 3; k++) {
    box(p, [3.6, 4.6, 0.12], [-8.4 + k * 5.4, 0.3, -0.36], k === 1 ? C.dark : '#8c949b');
    box(p, [3.9, 0.3, 0.3], [-8.4 + k * 5.4, 4.95, -0.3], '#e0a321');
  }
  parkedBus(p, -3, -2.3, '#2f7dd1'); // pulling out of the middle bay
  // Office with a sign.
  box(p, [5.2, 5, 6], [8.6, 0.3, -4.6], '#e6e1d4', { facade: 'office' });
  box(p, [5.6, 0.4, 6.4], [8.6, 5.3, -4.6], '#5f666c');
  box(p, [3.6, 0.9, 0.12], [8.6, 3.9, -1.5], '#2f7dd1');
  // Fuel island with a canopy.
  for (const x of [6.4, 10.8]) cyl(p, 0.25, 4.4, [x, 0.3, 3.4], C.metal, 6);
  box(p, [5.6, 0.35, 3.2], [8.6, 4.7, 3.4], '#e5484d');
  for (const x of [7.4, 9.8]) box(p, [0.7, 1.5, 0.5], [x, 0.3, 3.4], C.metalDark);
  // Bus yard: painted bays, buses parked nose-out.
  for (const x of [-10.5, -7.65, -4.85, -0.1, 2.9]) box(p, [0.12, 0.03, 7], [x, 0.3, 3.8], '#f2f0e8');
  parkedBus(p, -9, 2.6, '#e5484d');
  parkedBus(p, -6.3, 2.6, '#2fa36b');
  parkedBus(p, 1.4, 2.8, '#e0a321');
  lamp(p, 3.4, 6.8, 5);
  tree(p, 11, -7, 0.7, 'cone');
  fenceRect(p, 23.4, 15.4, 1.6, C.metalDark, 7);
  return p;
}

/** Small street car park (1×2): eight bays either side of a drive aisle, a pay machine and a hedge. */
export function parkingSmallModel(): Parts {
  const p: Parts = [];
  box(p, [7.6, 0.22, 15.6], [0, 0, 0], C.asphalt);
  // Two rows of parallel bays along the lot, the drive aisle between them.
  for (const x of [-2.45, 2.45]) for (const z of [-7.6, -2.6, 2.6]) box(p, [1.9, 0.02, 0.12], [x, 0.22, z], C.white);
  box(p, [0.12, 0.02, 13], [0, 0.22, 0], '#e0b23a');
  for (let k = 0; k < 3; k++) {
    if (k !== 1) vehicle(p, -2.45, -5.1 + k * 5.2, CAR_COLORS[(k + 2) % CAR_COLORS.length], C.dark, true, 4.2, 1.4);
    if (k !== 2) vehicle(p, 2.45, -5.1 + k * 5.2, CAR_COLORS[(k + 5) % CAR_COLORS.length], C.dark, true, 4.2, 1.4);
  }
  box(p, [0.4, 1.3, 0.3], [3.4, 0.22, 7.2], C.metalDark);
  box(p, [0.32, 0.4, 0.06], [3.4, 1.1, 7.36], '#2f6db5');
  box(p, [7.4, 0.9, 0.5], [0, 0.22, -7.5], C.greenDark);
  lamp(p, -3.4, 7.2, 4.5);
  return p;
}

/** Underground car park (2×2): a small park on the roof, the ramp down, a stair kiosk and vents. */
export function parkingUndergroundModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.25, 15.6], [0, 0, 0], C.lawn);
  // Ramp down with walls and a height bar.
  box(p, [4.2, 0.06, 9.5], [5, 0.25, 2.2], C.asphalt);
  for (const x of [2.8, 7.2]) box(p, [0.3, 1.0, 9.5], [x, 0.25, 2.2], C.concrete);
  box(p, [4.6, 0.25, 0.25], [5, 2.6, 6.8], '#e0b23a');
  for (const x of [2.9, 7.1]) box(p, [0.2, 2.6, 0.2], [x, 0.25, 6.8], C.metalDark);
  box(p, [3.6, 0.04, 2.4], [5, 0.31, -2.6], '#1d2024');
  box(p, [1.6, 1.5, 0.08], [5, 0.25, -1.4], '#2f6db5');
  box(p, [0.9, 0.9, 0.06], [5, 1.0, -1.34], C.white);
  // Stair kiosk and ventilation stacks.
  box(p, [2.6, 2.8, 2.6], [-5, 0.25, 4.8], C.concreteDark);
  box(p, [3.0, 0.3, 3.0], [-5, 3.05, 4.8], '#5d6166');
  box(p, [1.2, 2.0, 0.08], [-5, 0.25, 6.12], C.glassDark);
  for (const [x, z] of [[-6, -5.5], [-2.5, -5.5]] as const) {
    box(p, [1.2, 1.4, 1.2], [x, 0.25, z], C.concrete);
    box(p, [1.3, 0.2, 1.3], [x, 1.65, z], C.metalDark);
  }
  // The roof garden: paths, benches, trees.
  box(p, [1.4, 0.04, 15.6], [0.4, 0.26, 0], C.paving);
  box(p, [8.6, 0.04, 1.4], [-3.4, 0.26, 0.6], C.paving);
  bench(p, -3, 2.2);
  bench(p, -5.8, -2.2, true);
  tree(p, -6.4, 1.6, 0.8);
  tree(p, -1.6, -3.2, 0.9, 'round');
  tree(p, -6.2, -7.0, 0.7, 'cone');
  lamp(p, -0.8, 6.6, 4);
  return p;
}
