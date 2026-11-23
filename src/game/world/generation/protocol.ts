import type { GeneratedWorld } from './generateWorld';

export interface WorldGenRequest {
  seed: number;
}

export type WorldGenResponse =
  | { kind: 'progress'; fraction: number; label: string }
  | { kind: 'done'; world: GeneratedWorld }
  | { kind: 'error'; message: string };
