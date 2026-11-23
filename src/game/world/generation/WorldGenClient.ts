import { generateWorld, type GeneratedWorld, type ProgressFn } from './generateWorld';
import type { WorldGenRequest, WorldGenResponse } from './protocol';

/** Runs world generation in a Web Worker so the main thread stays responsive. */
export function requestWorld(seed: number, onProgress: ProgressFn): Promise<GeneratedWorld> {
  if (typeof Worker === 'undefined') return Promise.resolve(generateWorld(seed, onProgress));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../../workers/worldgen.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<WorldGenResponse>) => {
      const msg = e.data;
      if (msg.kind === 'progress') onProgress(msg.fraction, msg.label);
      else if (msg.kind === 'done') {
        worker.terminate();
        resolve(msg.world);
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message || 'Dünya oluşturma işçisi başarısız oldu'));
    };
    const req: WorldGenRequest = { seed };
    worker.postMessage(req);
  });
}
