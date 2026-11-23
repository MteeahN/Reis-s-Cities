/** Small, fast, deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  return seededRng(seed);
}

/** mulberry32 whose internal state can be read and restored (saved games continue the same stream). */
export interface SeededRng {
  (): number;
  state: number;
}

export function seededRng(seed: number): SeededRng {
  const f = (() => {
    f.state = (f.state + 0x6d2b79f5) >>> 0;
    let t = f.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as SeededRng;
  f.state = seed >>> 0;
  return f;
}

/** Turns any string (e.g. a city name/seed text) into a 32-bit seed. */
export function hashString(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Stateless hash of two integers to [0,1). Used for per-cell jitter. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
