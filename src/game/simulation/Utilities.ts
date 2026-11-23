import { GRID_CELLS } from '../core/config';
import { getBuilding } from '../data/buildings';
import { PIPE_CONNECT_RADIUS, PIPE_SERVICE_RADIUS } from '../data/infrastructure';
import type { PlacedBuilding } from '../entities/building/BuildingRegistry';

const N = GRID_CELLS;

export interface UtilityStats {
  powerProduced: number;
  powerDemand: number;
  powerServed: number;
  waterProduced: number;
  waterDemand: number;
  waterServed: number;
  sewageCapacity: number;
  sewageDemand: number;
  sewageServed: number;
  powerNetworks: number;
  waterNetworks: number;
}

export interface UtilityResult {
  power: Set<number>;
  water: Set<number>;
  sewage: Set<number>;
  stats: UtilityStats;
  /** Cells that are part of an energised power network. */
  poweredCells: Uint8Array;
  /** Cells within service range of a pipe network that has a water supply. */
  waterCells: Uint8Array;
  /** Cells within service range of a pipe network that has sewage capacity. */
  sewageCells: Uint8Array;
  /** Pipe/connection network id per cell (−1 none), for diagnostics. */
  pipeNetwork: Int32Array;
  /** 1 on pipe cells whose network is fed by a water source (drawn blue). */
  pipeSupplied: Uint8Array;
}

export const SEWAGE_PER_WATER = 0.9;

// Scratch buffers reused by every solve (the solver runs often; full-grid allocations add GC pauses).
const scratchQueue = new Int32Array(N * N);
const scratchConduct = new Uint8Array(N * N);
const scratchPipeMask = new Uint8Array(N * N);
const scratchPowerIds = new Int32Array(N * N);
const scratchPipeIds = new Int32Array(N * N);

/**
 * Labels 4-connected components of `mask` cells. Returns ids (−1 = not in mask) and the count.
 * `out` may be passed to reuse an id buffer.
 */
export function labelComponents(mask: Uint8Array, out?: Int32Array): { ids: Int32Array; count: number } {
  const ids = (out ?? new Int32Array(N * N)).fill(-1);
  const queue = scratchQueue;
  let count = 0;
  for (let start = 0; start < N * N; start++) {
    if (!mask[start] || ids[start] !== -1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    ids[start] = count;
    while (head < tail) {
      const k = queue[head++];
      const i = k % N;
      const j = (k - i) / N;
      if (i > 0 && mask[k - 1] && ids[k - 1] === -1) (ids[k - 1] = count), (queue[tail++] = k - 1);
      if (i < N - 1 && mask[k + 1] && ids[k + 1] === -1) (ids[k + 1] = count), (queue[tail++] = k + 1);
      if (j > 0 && mask[k - N] && ids[k - N] === -1) (ids[k - N] = count), (queue[tail++] = k - N);
      if (j < N - 1 && mask[k + N] && ids[k + N] === -1) (ids[k + N] = count), (queue[tail++] = k + N);
    }
    count++;
  }
  return { ids, count };
}

/**
 * Multi-source BFS (8-neighbour → Chebyshev distance) from all pipe cells up
 * to `maxDist`, carrying the pipe network id of the nearest pipe.
 */
export function pipeReach(pipeIds: Int32Array, maxDist: number): { dist: Uint8Array; net: Int32Array } {
  const dist = new Uint8Array(N * N).fill(255);
  const net = new Int32Array(N * N).fill(-1);
  const queue = scratchQueue;
  let head = 0;
  let tail = 0;
  for (let k = 0; k < N * N; k++) {
    if (pipeIds[k] >= 0) {
      dist[k] = 0;
      net[k] = pipeIds[k];
      queue[tail++] = k;
    }
  }
  while (head < tail) {
    const k = queue[head++];
    const d = dist[k];
    if (d >= maxDist) continue;
    const i = k % N;
    const j = (k - i) / N;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const x = i + di;
        const y = j + dj;
        if (x < 0 || y < 0 || x >= N || y >= N) continue;
        const n = y * N + x;
        if (dist[n] !== 255) continue;
        dist[n] = d + 1;
        net[n] = net[k];
        queue[tail++] = n;
      }
    }
  }
  return { dist, net };
}

/** Serves consumers (in id order) from a pool per network until it runs dry. */
function allocate(consumers: { id: number; net: number; amount: number }[], supply: Map<number, number>, served: Set<number>): number {
  consumers.sort((a, b) => a.id - b.id);
  let total = 0;
  for (const c of consumers) {
    const left = supply.get(c.net) ?? 0;
    if (c.net < 0 || left < c.amount) continue;
    supply.set(c.net, left - c.amount);
    served.add(c.id);
    total += c.amount;
  }
  return total;
}

/**
 * Electricity: power flows through power-line cells and through buildings
 * (each footprint plus a one-cell halo conducts), so neighbouring buildings
 * share power. Water & sewage: pipes form networks; buildings within
 * PIPE_SERVICE_RADIUS of a pipe are served, producers/outlets connect
 * within PIPE_CONNECT_RADIUS. Each network has its own supply.
 */
export function computeUtilities(buildings: Iterable<PlacedBuilding>, powerLineCells: Uint16Array, pipeCells: Uint16Array): UtilityResult {
  const list = [...buildings].filter((b) => b.state !== 'abandoned');

  // ---- electricity
  const conduct = scratchConduct;
  for (let k = 0; k < N * N; k++) conduct[k] = powerLineCells[k] > 0 ? 1 : 0;
  for (const b of list) {
    for (let y = b.j - 1; y <= b.j + b.d; y++) {
      for (let x = b.i - 1; x <= b.i + b.w; x++) if (x >= 0 && y >= 0 && x < N && y < N) conduct[y * N + x] = 1;
    }
  }
  const power = labelComponents(conduct, scratchPowerIds);
  const powerSupply = new Map<number, number>();
  const powerConsumers: { id: number; net: number; amount: number }[] = [];
  let powerProduced = 0;
  let powerDemand = 0;
  for (const b of list) {
    const def = getBuilding(b.defId);
    const net = power.ids[b.cells[0]];
    if (b.state === 'active' && def.utility?.power) {
      powerSupply.set(net, (powerSupply.get(net) ?? 0) + def.utility.power);
      powerProduced += def.utility.power;
    } else if (b.state === 'active' && def.electricity > 0) {
      powerConsumers.push({ id: b.id, net, amount: def.electricity });
      powerDemand += def.electricity;
    }
  }
  const energised = new Set([...powerSupply.entries()].filter(([, v]) => v > 0).map(([k]) => k));
  const poweredSet = new Set<number>();
  const powerServed = allocate(powerConsumers, new Map(powerSupply), poweredSet);
  const poweredCells = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) if (power.ids[k] >= 0 && energised.has(power.ids[k])) poweredCells[k] = 1;

  // ---- water & sewage
  const pipeMask = scratchPipeMask;
  for (let k = 0; k < N * N; k++) pipeMask[k] = pipeCells[k] > 0 ? 1 : 0;
  const pipes = labelComponents(pipeMask, scratchPipeIds);
  const reach = pipeReach(pipes.ids, Math.max(PIPE_SERVICE_RADIUS, PIPE_CONNECT_RADIUS));
  const netNear = (b: PlacedBuilding, radius: number): number => {
    let best = -1;
    let bestD = radius + 1;
    for (const k of b.cells) {
      if (reach.dist[k] <= radius && reach.dist[k] < bestD) {
        bestD = reach.dist[k];
        best = reach.net[k];
      }
    }
    return best;
  };
  const waterSupply = new Map<number, number>();
  const sewageSupply = new Map<number, number>();
  const waterConsumers: { id: number; net: number; amount: number }[] = [];
  const sewageConsumers: { id: number; net: number; amount: number }[] = [];
  let waterProduced = 0;
  let sewageCapacity = 0;
  let waterDemand = 0;
  for (const b of list) {
    if (b.state !== 'active') continue;
    const def = getBuilding(b.defId);
    const u = def.utility;
    if (u?.water || u?.sewage) {
      const net = netNear(b, PIPE_CONNECT_RADIUS);
      if (u.water) {
        waterProduced += u.water;
        if (net >= 0) waterSupply.set(net, (waterSupply.get(net) ?? 0) + u.water);
      }
      if (u.sewage) {
        sewageCapacity += u.sewage;
        if (net >= 0) sewageSupply.set(net, (sewageSupply.get(net) ?? 0) + u.sewage);
      }
      continue;
    }
    if (def.water > 0) {
      const net = netNear(b, PIPE_SERVICE_RADIUS);
      waterConsumers.push({ id: b.id, net, amount: def.water });
      sewageConsumers.push({ id: b.id, net, amount: def.water * SEWAGE_PER_WATER });
      waterDemand += def.water;
    }
  }
  const waterSet = new Set<number>();
  const sewageSet = new Set<number>();
  const waterServed = allocate(waterConsumers, new Map(waterSupply), waterSet);
  const sewageServed = allocate(sewageConsumers, new Map(sewageSupply), sewageSet);
  const waterCells = new Uint8Array(N * N);
  const sewageCells = new Uint8Array(N * N);
  const pipeSupplied = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) if (pipes.ids[k] >= 0 && (waterSupply.get(pipes.ids[k]) ?? 0) > 0) pipeSupplied[k] = 1;
  for (let k = 0; k < N * N; k++) {
    if (reach.dist[k] > PIPE_SERVICE_RADIUS) continue;
    if ((waterSupply.get(reach.net[k]) ?? 0) > 0) waterCells[k] = 1;
    if ((sewageSupply.get(reach.net[k]) ?? 0) > 0) sewageCells[k] = 1;
  }

  return {
    power: poweredSet,
    water: waterSet,
    sewage: sewageSet,
    stats: {
      powerProduced,
      powerDemand,
      powerServed,
      waterProduced,
      waterDemand,
      waterServed,
      sewageCapacity,
      sewageDemand: waterDemand * SEWAGE_PER_WATER,
      sewageServed,
      powerNetworks: energised.size,
      waterNetworks: pipes.count,
    },
    poweredCells,
    waterCells,
    sewageCells,
    pipeNetwork: reach.net,
    pipeSupplied,
  };
}
