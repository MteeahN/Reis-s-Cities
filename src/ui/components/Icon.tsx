import type { SVGProps } from 'react';

/** Consistent 24×24 stroke icon set for the HUD. */
const PATHS = {
  cursor: 'M5 3l13 7-6 1.5L9.5 18z',
  road: 'M8 3L4 21M16 3l4 18M12 4v3M12 10.5v3M12 17v3',
  zone: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  building: 'M4 21V7l6-3v17M10 21V9l10 3v9M3 21h18M13 14h1M17 14h1M13 17h1M17 17h1M6 10h1M6 13h1M6 16h1',
  power: 'M13 2L5 14h6l-1 8 8-12h-6z',
  water: 'M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z',
  services: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z M9 12l2 2 4-4',
  tree: 'M12 2l5 7h-3l4 6H6l4-6H7zM12 15v7',
  demolish: 'M4 20h16M6 20l2-9h8l2 9M9 11V7a3 3 0 016 0v4M14 4l4-2',
  traffic: 'M9 2h6a1 1 0 011 1v14a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1zM12 6.5h0M12 10h0M12 13.5h0M12 18v4',
  warning: 'M12 3l9 16H3zM12 9v4M12 16h0',
  pause: 'M8 5v14M16 5v14',
  play: 'M7 4l12 8-12 8z',
  fast: 'M4 5l8 7-8 7zM12 5l8 7-8 7z',
  faster: 'M2 5l6 7-6 7zM9 5l6 7-6 7zM16 5l6 7-6 7z',
  grid: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  home: 'M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5',
  settings:
    'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  help: 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01',
  people: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M16 3.1a4 4 0 010 7.8M22 21v-1a6 6 0 00-4-5.6',
  money: 'M3 6h18v12H3zM12 15a3 3 0 100-6 3 3 0 000 6zM6 9v.01M18 15v.01',
  smile: 'M12 22a10 10 0 100-20 10 10 0 000 20zM8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  chart: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  save: 'M5 3h11l4 4v14H5zM8 3v6h8V3M8 21v-7h8v7',
  folder: 'M3 6h6l2 2h10v12H3z',
  trophy: 'M8 4h8v5a4 4 0 01-8 0zM8 6H4v1a4 4 0 004 4M16 6h4v1a4 4 0 01-4 4M12 13v4M8 21h8M9 17h6',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  upload: 'M12 20V9M7 14l5-5 5 5M4 4h16',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  close: 'M6 6l12 12M18 6L6 18',
  target: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z',
  layers: 'M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5',
  globe: 'M12 22a10 10 0 100-20 10 10 0 000 20zM2 12h20M12 2a15 15 0 010 20M12 2a15 15 0 000 20',
  gauge: 'M12 14l4-4M3.3 17a10 10 0 1117.4 0z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  dice: 'M4 4h16v16H4zM8.5 8.5h.01M15.5 15.5h.01M15.5 8.5h.01M8.5 15.5h.01M12 12h.01',
  curve: 'M4 20C4 10 10 4 20 4M4 20h.01M20 4h.01',
  upgrade: 'M12 19V5M5 12l7-7 7 7',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 000 11H13',
  move: 'M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
  rotate: 'M3 12a9 9 0 0115.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 01-15.5 6.2L3 16M3 21v-5h5',
  junction: 'M12 3v18M3 12h18M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight: 'M9 18l6-6-6-6',
  chevronUp: 'M6 15l6-6 6 6',
  chat: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  freehand: 'M3 17c3-6 5 2 8-4s5 1 7-5M18 8l3-1-1 3',
  arc: 'M4 19A15 15 0 0 1 19 4M4 19h.01M19 4h.01',
  terrain: 'M2 19l6-9 4 5 3-4 7 8zM8 10l2-3',
  brush: 'M14 4l6 6-8 8H6v-6zM4 20c0-2 1-3 2-3',
  bench: 'M3 11h18M4 15h16M6 11V8h12v3M6 15v4M18 15v4',
  advisor: 'M12 3a4 4 0 110 8 4 4 0 010-8zM4 21c0-4 3.6-7 8-7s8 3 8 7M17 3l1.5 1.5L21 2',
  bus: 'M5 4h14a1 1 0 011 1v11H4V5a1 1 0 011-1zM4 11h16M7 19v-3M17 19v-3M7 14h.01M17 14h.01',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  chevronDown: 'M6 9l6 6 6-6',
  elevated: 'M2 9h20M2 12h20M6 12v9M18 12v9M12 12v9',
  roundabout: 'M12 7a5 5 0 105 5M17 12l-2-2M17 12l2-2M12 2v5M12 17v5M2 12h5M17 12h5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
