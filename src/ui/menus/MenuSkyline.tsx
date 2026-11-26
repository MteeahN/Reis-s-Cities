import { memo, type ReactElement } from 'react';

/** Small deterministic random (the picture is the same on every visit). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Block {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  tone: number;
}

/** Isometric projection of (x, y, z): x to the right-down, y to the left-down, z up. */
const iso = (x: number, y: number, z: number): [number, number] => [(x - y) * 0.866, (x + y) * 0.5 - z];

/**
 * The menu's picture: an isometric district drawn in SVG, a grid of streets
 * with blocks of different heights; windows light up one by one as the
 * evening comes on (CSS, paused for reduced motion).
 */
export const MenuSkyline = memo(function MenuSkyline() {
  const rand = rng(20261126);
  const blocks: Block[] = [];
  const G = 6;
  const CELL = 26;
  for (let gx = 0; gx < G; gx++) {
    for (let gy = 0; gy < G; gy++) {
      if ((gx === 2 && gy > 0) || (gy === 3 && gx !== 5)) continue; // streets
      const centre = 1 - Math.hypot(gx - 2.6, gy - 2.6) / 4.2;
      const h = 10 + Math.max(0, centre) * 90 * (0.5 + rand()) + rand() * 14;
      blocks.push({ x: gx * CELL + 3, y: gy * CELL + 3, w: CELL - 6, d: CELL - 6, h, tone: rand() });
    }
  }
  // Painter's order: far to near.
  blocks.sort((a, b) => a.x + a.y - (b.x + b.y));
  const ground = [iso(0, 0, 0), iso(G * CELL, 0, 0), iso(G * CELL, G * CELL, 0), iso(0, G * CELL, 0)];
  const pts = (p: [number, number][]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  let win = 0;
  return (
    <svg className="menu-skyline" viewBox="-150 -120 300 260" role="img" aria-label="İzometrik şehir silüeti">
      <defs>
        <linearGradient id="skyTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9fd8ff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#5e8fb8" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id="skyLeft" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#30506d" />
          <stop offset="1" stopColor="#1a2c3d" />
        </linearGradient>
        <linearGradient id="skyRight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#223c55" />
          <stop offset="1" stopColor="#13202d" />
        </linearGradient>
      </defs>
      <polygon points={pts(ground)} className="sky-ground" />
      {blocks.map((b, k) => {
        const { x, y, w, d, h } = b;
        const top = [iso(x, y, h), iso(x + w, y, h), iso(x + w, y + d, h), iso(x, y + d, h)];
        const left = [iso(x, y + d, h), iso(x + w, y + d, h), iso(x + w, y + d, 0), iso(x, y + d, 0)];
        const right = [iso(x + w, y, h), iso(x + w, y + d, h), iso(x + w, y + d, 0), iso(x + w, y, 0)];
        const floors = Math.floor(h / 7);
        const windows: ReactElement[] = [];
        for (let f = 1; f < floors; f++) {
          for (let c = 0; c < 3; c++) {
            if (rand() < 0.45) continue;
            const wz = f * 7 - 3;
            const wx = x + w * (0.2 + c * 0.3);
            const [px, py] = iso(wx, y + d, wz);
            const i = win++;
            windows.push(<rect key={`${k}-${f}-${c}`} className="sky-win" x={px - 1.1} y={py - 1.6} width={2.2} height={2.4} style={{ animationDelay: `${(i * 0.37) % 9}s` }} />);
          }
        }
        return (
          <g key={k}>
            <polygon points={pts(left)} fill="url(#skyLeft)" />
            <polygon points={pts(right)} fill="url(#skyRight)" />
            <polygon points={pts(top)} fill="url(#skyTop)" opacity={0.25 + b.tone * 0.25} />
            {windows}
          </g>
        );
      })}
    </svg>
  );
});
