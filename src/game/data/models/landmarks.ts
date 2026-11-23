import { archZ, bench, box, C, colonnade, cyl, disc, dome, flagpole, gable, hip, lamp, type Parts, pyramid, tree, windowsX, windowsZ } from './kit';

/** Clock tower (1×1 lot): stone shaft with pilasters, four lit dials, open belfry with a bell, copper spire. */
export function clockTowerModel(): Parts {
  const p: Parts = [];
  box(p, [7.6, 0.35, 7.6], [0, 0, 0], C.paving);
  box(p, [6.4, 0.5, 6.4], [0, 0.35, 0], C.stoneDark);
  box(p, [5.6, 0.4, 5.6], [0, 0.85, 0], C.stone);
  // Rusticated base storey with an arched door.
  box(p, [4.8, 5, 4.8], [0, 1.25, 0], C.stoneDark);
  for (let k = 1; k < 5; k++) box(p, [4.9, 0.08, 4.9], [0, 1.25 + k, 0], '#a49b88');
  archZ(p, 0, 1.25, 2.42, 1.4, 2.4, C.wood);
  box(p, [5.0, 0.4, 5.0], [0, 6.25, 0], C.stone);
  // Shaft with corner pilasters, string courses and slit windows.
  const shaftH = 11;
  box(p, [4.2, shaftH, 4.2], [0, 6.65, 0], C.stoneWarm);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, [0.55, shaftH, 0.55], [sx * 2.0, 6.65, sz * 2.0], C.stone);
  for (const y of [10.2, 13.8]) box(p, [4.5, 0.22, 4.5], [0, y, 0], C.stone);
  for (const y of [7.6, 11.2, 14.8]) {
    windowsZ(p, 1, 1, 0, y, 2.11, 0.45, 1.8);
    windowsZ(p, 1, 1, 0, y, -2.11, 0.45, 1.8);
    windowsX(p, 1, 1, 2.11, y, 0, 0.45, 1.8);
    windowsX(p, 1, 1, -2.11, y, 0, 0.45, 1.8);
  }
  // Clock stage: cornice, four dials with rings and hands (showing ten past ten).
  const cy = 6.65 + shaftH;
  box(p, [4.9, 0.5, 4.9], [0, cy, 0], C.stone);
  box(p, [4.6, 3.8, 4.6], [0, cy + 0.5, 0], '#efe6d2');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, [0.6, 3.8, 0.6], [sx * 2.15, cy + 0.5, sz * 2.15], C.stone);
  const dialY = cy + 2.4;
  const faces: ['+z' | '-z' | '+x' | '-x', number, number][] = [['+z', 0, 2.3], ['-z', 0, -2.3], ['+x', 2.3, 0], ['-x', -2.3, 0]];
  for (const [f, x, z] of faces) {
    disc(p, 3.2, 0.12, [x, dialY, z], C.dark, f);
    disc(p, 2.9, 0.16, [x, dialY, z + (f === '+z' ? 0.03 : f === '-z' ? -0.03 : 0)], '#fbf7ec', f);
    const out = f === '+z' ? 0.12 : f === '-z' ? -0.12 : 0;
    const outX = f === '+x' ? 0.12 : f === '-x' ? -0.12 : 0;
    if (f === '+z' || f === '-z') {
      box(p, [0.1, 1.15, 0.05], [x - 0.3, dialY - 0.1, z + out], C.dark, { rot: [0, 0, 35] });
      box(p, [0.08, 0.8, 0.05], [x + 0.2, dialY - 0.05, z + out], C.dark, { rot: [0, 0, -60] });
    } else {
      box(p, [0.05, 1.15, 0.1], [x + outX, dialY - 0.1, z - 0.3], C.dark, { rot: [35, 0, 0] });
      box(p, [0.05, 0.8, 0.08], [x + outX, dialY - 0.05, z + 0.2], C.dark, { rot: [-60, 0, 0] });
    }
  }
  // Open belfry: corner piers, balustrade and a bronze bell.
  const by = cy + 4.3;
  box(p, [5.0, 0.4, 5.0], [0, by, 0], C.stone);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, [0.8, 3.4, 0.8], [sx * 1.9, by + 0.4, sz * 1.9], C.stoneWarm);
  for (const s of [-1, 1]) {
    box(p, [4.6, 0.7, 0.2], [0, by + 0.4, s * 2.2], C.stone);
    box(p, [0.2, 0.7, 4.6], [s * 2.2, by + 0.4, 0], C.stone);
  }
  cyl(p, 0.12, 0.6, [0, by + 2.9, 0], C.metalDark, 6);
  p.push({ shape: 'cone', size: [1.5, 1.4, 1.5], pos: [0, by + 1.5, 0], color: '#8a6a2e', segments: 14 });
  box(p, [5.2, 0.5, 5.2], [0, by + 3.8, 0], C.stone);
  // Copper spire with a lantern and gilded finial.
  pyramid(p, 4.8, 5.5, 4.8, [0, by + 4.3, 0], C.copper);
  box(p, [1.1, 1.2, 1.1], [0, by + 8.0, 0], C.copper);
  pyramid(p, 1.3, 1.6, 1.3, [0, by + 9.2, 0], C.copper);
  dome(p, 0.4, 0.4, [0, by + 10.6, 0], C.gold, 8);
  cyl(p, 0.08, 1.6, [0, by + 10.9, 0], C.gold, 6);
  // Lamps at the corners of the plinth.
  for (const sx of [-1, 1]) lamp(p, sx * 3.2, 3.2, 3.2);
  return p;
}

/** City hall (3×3): two-storey wings, portico with pediment, drum and dome, flags, lawns and fountains. */
export function cityHallModel(): Parts {
  const p: Parts = [];
  box(p, [23.6, 0.3, 23.6], [0, 0, 0], C.paving);
  // Lawns either side of the entrance path.
  for (const sx of [-1, 1]) {
    box(p, [8.2, 0.12, 6.5], [sx * 7.3, 0.3, 8.2], C.lawn);
    tree(p, sx * 10.2, 10, 1, 'tall');
    tree(p, sx * 4.8, 10.6, 0.7, 'round');
  }
  // Podium and steps.
  box(p, [21, 1.2, 14.5], [0, 0.3, -3.5], C.stoneDark);
  for (let k = 0; k < 4; k++) box(p, [11 - k * 0.4, 0.3, 1.2], [0, 0.3 + k * 0.3, 4.4 - k * 0.45], C.stone);
  // Main block and wings.
  box(p, [20, 9, 12], [0, 1.5, -4], C.stone, { facade: true });
  box(p, [20.4, 0.6, 12.4], [0, 10.5, -4], C.stoneDark);
  box(p, [20.6, 0.35, 12.6], [0, 4.6, -4], C.stoneDark);
  for (const sx of [-1, 1]) {
    // Pavilion ends.
    box(p, [4.2, 10, 12.8], [sx * 8.2, 1.5, -4], C.marble);
    box(p, [4.6, 0.6, 13.2], [sx * 8.2, 11.5, -4], C.stoneDark);
    hip(p, 4.6, 2.2, 13.2, [sx * 8.2, 12.1, -4], C.slate);
    windowsZ(p, 1, 2, sx * 8.2, 2.6, 2.45, 1.1, 2.4, C.glassDark, C.stoneDark);
    windowsZ(p, 1, 2, sx * 8.2, 6.5, 2.45, 1.1, 2.6, C.glassDark, C.stoneDark);
  }
  gable(p, 12, 2.4, 12.4, [0, 11.1, -4], C.slate);
  // Portico: six columns, entablature and a pediment with a gilded emblem.
  colonnade(p, 6, -5, 5, 3.6, 1.5, 8.2, 0.9, C.marble);
  box(p, [12, 1.0, 3.2], [0, 9.7, 3.2], C.stone);
  gable(p, 12.2, 2.6, 3.4, [0, 10.7, 3.2], C.marble);
  disc(p, 1.3, 0.12, [0, 11.7, 4.9], C.gold);
  archZ(p, 0, 1.5, 2.08, 2.2, 3.2, C.wood);
  // Drum with pilasters, dome, lantern and finial.
  cyl(p, 7.6, 1, [0, 11.1, -4], C.stoneDark, 24);
  cyl(p, 7, 4.2, [0, 12.1, -4], C.stone, 24);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    box(p, [0.5, 4.2, 0.4], [Math.cos(a) * 3.55, 12.1, -4 + Math.sin(a) * 3.55], C.marble, { rot: [0, (-a * 180) / Math.PI, 0] });
  }
  cyl(p, 7.6, 0.5, [0, 16.3, -4], C.stoneDark, 24);
  dome(p, 7.2, 4.6, [0, 16.8, -4], C.copper, 24);
  cyl(p, 1.4, 1.4, [0, 21.1, -4], C.stone, 12);
  dome(p, 1.6, 0.9, [0, 22.5, -4], C.copper, 12);
  dome(p, 0.5, 0.5, [0, 23.3, -4], C.gold, 8);
  // Flags and fountains on the forecourt.
  flagpole(p, -2.6, 9.2, 9, C.red);
  flagpole(p, 2.6, 9.2, 9, C.blue, C.yellow);
  for (const sx of [-1, 1]) {
    cyl(p, 3.2, 0.5, [sx * 7.3, 0.42, 7.4], C.stoneDark, 20);
    cyl(p, 2.8, 0.52, [sx * 7.3, 0.43, 7.4], C.water, 20);
    cyl(p, 0.4, 1.4, [sx * 7.3, 0.42, 7.4], C.stone, 8);
  }
  lamp(p, -6.5, 11.2, 4.2);
  lamp(p, 6.5, 11.2, 4.2);
  return p;
}

/** Town square (2×2): patterned paving, three-tier fountain, statue, benches, lamps, trees in planters. */
export function plazaModel(): Parts {
  const p: Parts = [];
  box(p, [15.6, 0.3, 15.6], [0, 0, 0], C.paving);
  // Paving pattern: border band and diagonal-free cross paths.
  box(p, [15.6, 0.02, 1.2], [0, 0.3, 0], C.pavingDark);
  box(p, [1.2, 0.02, 15.6], [0, 0.3, 0], C.pavingDark);
  cyl(p, 9.6, 0.03, [0, 0.3, 0], C.pavingDark, 32);
  cyl(p, 8.6, 0.04, [0, 0.31, 0], C.paving, 32);
  // Fountain: basin, two bowls and a jet.
  cyl(p, 6.4, 0.7, [0, 0.3, 0], C.stoneDark, 28);
  cyl(p, 5.8, 0.72, [0, 0.31, 0], C.water, 28);
  cyl(p, 0.9, 2.6, [0, 0.3, 0], C.stone, 12);
  cyl(p, 2.6, 0.3, [0, 2.6, 0], C.stone, 18);
  cyl(p, 2.3, 0.32, [0, 2.61, 0], C.water, 18);
  cyl(p, 0.5, 1.2, [0, 2.9, 0], C.stone, 10);
  cyl(p, 1.3, 0.25, [0, 4.0, 0], C.stone, 14);
  p.push({ shape: 'cone', size: [0.5, 1.4, 0.5], pos: [0, 4.2, 0], color: '#cfe6f2', segments: 8 });
  // Planters with trees at the corners, benches facing the fountain.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      box(p, [2.4, 0.7, 2.4], [sx * 5.8, 0.3, sz * 5.8], C.stoneDark);
      box(p, [2.1, 0.72, 2.1], [sx * 5.8, 0.31, sz * 5.8], '#5a4a36');
      tree(p, sx * 5.8, sz * 5.8, 0.9, 'round');
      lamp(p, sx * 3.3, sz * 6.8, 3.6);
    }
    bench(p, sx * 4.4, 0, true);
    bench(p, 0, sx * 4.4);
  }
  // A small statue on a plinth near the back.
  box(p, [1.4, 1.2, 1.4], [0, 0.3, -6.3], C.stoneDark);
  cyl(p, 0.5, 1.6, [0, 1.5, -6.3], '#6e7c6a', 8);
  dome(p, 0.5, 0.35, [0, 3.1, -6.3], '#6e7c6a', 8);
  return p;
}

/** Republic monument (1×1): stepped base, obelisk with bands, bronze reliefs, flags, bollards with chains. */
export function monumentModel(): Parts {
  const p: Parts = [];
  box(p, [7.6, 0.3, 7.6], [0, 0, 0], C.paving);
  box(p, [7, 0.1, 7], [0, 0.3, 0], C.lawn);
  box(p, [5.4, 0.5, 5.4], [0, 0.4, 0], C.stoneDark);
  box(p, [4.4, 0.5, 4.4], [0, 0.9, 0], C.stone);
  box(p, [3.4, 0.6, 3.4], [0, 1.4, 0], C.stoneDark);
  box(p, [2.4, 2.2, 2.4], [0, 2.0, 0], C.marble);
  // Bronze reliefs on two faces.
  box(p, [1.6, 1.2, 0.1], [0, 2.5, 1.22], '#8a6a3a');
  box(p, [1.6, 1.2, 0.1], [0, 2.5, -1.22], '#8a6a3a');
  box(p, [2.7, 0.3, 2.7], [0, 4.2, 0], C.stoneDark);
  // Obelisk (tapering in two steps) with bands and a gilded tip.
  box(p, [1.7, 5, 1.7], [0, 4.5, 0], '#ddd6c6');
  box(p, [1.8, 0.2, 1.8], [0, 9.5, 0], C.stoneDark);
  box(p, [1.45, 4, 1.45], [0, 9.7, 0], '#ddd6c6');
  pyramid(p, 1.45, 1.4, 1.45, [0, 13.7, 0], C.gold);
  // Wreath (laurel ring) on the front.
  disc(p, 1.0, 0.12, [0, 6.2, 0.9], C.greenDark, '+z', 16);
  disc(p, 0.6, 0.14, [0, 6.2, 0.92], '#ddd6c6', '+z', 12);
  // Bollards with chains around the base.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      cyl(p, 0.28, 0.9, [sx * 3.2, 0.3, sz * 3.2], C.dark, 8);
      dome(p, 0.3, 0.15, [sx * 3.2, 1.2, sz * 3.2], C.gold, 6);
    }
    box(p, [6.4, 0.06, 0.06], [0, 0.95, sx * 3.2], C.dark);
    box(p, [0.06, 0.06, 6.4], [sx * 3.2, 0.95, 0], C.dark);
  }
  flagpole(p, -3.4, 2.8, 8, C.red);
  flagpole(p, 3.4, 2.8, 8, C.red);
  return p;
}
