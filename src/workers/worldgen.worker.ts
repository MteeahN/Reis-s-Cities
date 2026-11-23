/// <reference lib="webworker" />
import { generateWorld } from '../game/world/generation/generateWorld';
import type { WorldGenRequest, WorldGenResponse } from '../game/world/generation/protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<WorldGenRequest>) => {
  const { seed } = e.data;
  try {
    const world = generateWorld(seed, (fraction, label) => {
      const msg: WorldGenResponse = { kind: 'progress', fraction, label };
      ctx.postMessage(msg);
    });
    const msg: WorldGenResponse = { kind: 'done', world };
    ctx.postMessage(msg, [
      world.heights.buffer,
      world.outerAxis.buffer,
      world.outerHeights.buffer,
      world.vegetation.data.buffer,
      world.vegetation.species.buffer,
      world.outerVegetation.data.buffer,
      world.outerVegetation.species.buffer,
    ]);
  } catch (err) {
    const msg: WorldGenResponse = { kind: 'error', message: err instanceof Error ? err.message : String(err) };
    ctx.postMessage(msg);
  }
};
