import { memo, useId } from 'react';

/** Skyline above the name: [x, width, height, kind] — kind 1 has window rows, 2 a spire. */
const TOWERS: [number, number, number, number][] = [
  [118, 14, 10, 0],
  [134, 26, 30, 1],
  [162, 8, 18, 0],
  [172, 22, 44, 0],
  [196, 8, 24, 0],
  [206, 22, 78, 1],
  [230, 30, 50, 0],
  [262, 30, 120, 2],
  [294, 24, 70, 1],
  [320, 8, 30, 0],
  [330, 24, 62, 0],
  [356, 18, 48, 0],
  [376, 18, 16, 0],
  [396, 16, 9, 0],
];

/**
 * The game's logo: a skyline rising from a horizon arc above the name, set
 * in heavy italic capitals — white "Reis's", blue "Cities" between two rules.
 */
export const MenuLogo = memo(function MenuLogo({ className }: { className?: string }) {
  const base = 172;
  // Ids of its own: two logos on one page (one hidden) must not share gradients.
  const u = useId().replace(/:/g, "");
  return (
    <svg className={className} viewBox="0 0 520 330" role="img" aria-label="Reis's Cities">
      <defs>
        <linearGradient id={`logoTower${u}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#e6eef8" />
          <stop offset="0.56" stopColor="#3f8ee8" />
          <stop offset="1" stopColor="#2a6fc9" />
        </linearGradient>
        <linearGradient id={`logoWhite${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#c9d3df" />
        </linearGradient>
        <linearGradient id={`logoBlue${u}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7cc0ff" />
          <stop offset="1" stopColor="#2f86ea" />
        </linearGradient>
        <linearGradient id={`logoArc${u}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#4da3ff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#7cc0ff" />
          <stop offset="1" stopColor="#4da3ff" stopOpacity="0" />
        </linearGradient>
        <filter id={`logoShadow${u}`} x="-10%" y="-10%" width="120%" height="130%">
          <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#020814" floodOpacity="0.7" />
        </filter>
      </defs>
      <g filter={`url(#logoShadow${u})`}>
        {TOWERS.map(([x, w, h, kind], k) => (
          <g key={k}>
            <rect x={x} y={base - h} width={w} height={h} fill={`url(#logoTower${u})`} />
            {kind === 2 && <rect x={x + w / 2 - 1.2} y={base - h - 26} width={2.4} height={26} fill="#e6eef8" />}
            {kind === 1 &&
              Array.from({ length: Math.floor((h - 8) / 7) }, (_, r) => <rect key={r} x={x + 4} y={base - h + 6 + r * 7} width={w - 8} height={3} fill="#1d4f8f" opacity={0.7} />)}
          </g>
        ))}
        <path d="M 20 196 Q 260 160 500 196 Q 260 172 20 196 Z" fill={`url(#logoArc${u})`} />
        <text x="260" y="262" textAnchor="middle" className="logo-word" fill={`url(#logoWhite${u})`}>
          Reis’s
        </text>
        <rect x="22" y="300" width="74" height="5" rx="2.5" fill="#4da3ff" />
        <rect x="424" y="300" width="74" height="5" rx="2.5" fill="#4da3ff" />
        <text x="260" y="324" textAnchor="middle" className="logo-word" fill={`url(#logoBlue${u})`}>
          Cities
        </text>
      </g>
    </svg>
  );
});
