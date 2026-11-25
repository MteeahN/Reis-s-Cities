// Dev helper (paste in the browser console after "Şehri Kur"): builds a road grid
// near the map centre, zones it and grows ~300 buildings, for visual and performance checks.
export async function stressCity() {
  const { planRoad } = await import('/src/game/tools/placement/RoadPlanner.ts');
  const { getRoadType } = await import('/src/game/data/roads.ts');
  const c = window.__reis.city;
  const g = window.__reis.game;
  const cs = g.citySim;
  c.enableSandbox();
  const type = getRoadType('city');
  const anchor = (x, z) => {
    const n = [...c.roads.nodes.values()].find((q) => Math.hypot(q.x - x, q.z - z) < 2);
    if (n) return { kind: 'node', nodeId: n.id, point: { x: n.x, z: n.z } };
    const e = c.roads.nearestEdge(x, z, 2);
    if (e) return { kind: 'edge', edgeId: e.edge.id, t: e.t, point: e.point };
    return { kind: 'free', point: { x, z } };
  };
  const V = [];
  for (let v = 840; v <= 1160; v += 56) V.push(v);
  for (const z of V) for (let k = 0; k < V.length - 1; k++) { const p = planRoad(c.roads, anchor(V[k], z), anchor(V[k + 1], z), null, type, c.plannerWorld, 1e12); if (p.valid) c.buildRoad(p); }
  for (const x of V) for (let k = 0; k < V.length - 1; k++) { const p = planRoad(c.roads, anchor(x, V[k]), anchor(x, V[k + 1]), null, type, c.plannerWorld, 1e12); if (p.valid) c.buildRoad(p); }
  // Link the grid to the intercity road (builders come in by it).
  const target = c.entryLink ?? c.entries[0];
  const inGrid = (n) => n.x >= 835 && n.x <= 1165 && n.z >= 835 && n.z <= 1165;
  const outs = [...c.roads.nodes.values()].filter((n) => !inGrid(n)).sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z)).slice(0, 3);
  const ins = [...c.roads.nodes.values()].filter(inGrid).sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z)).slice(0, 10);
  link: for (const o of outs) for (const gn of ins) for (const tn of ['city', 'street']) {
    const p = planRoad(c.roads, { kind: 'node', nodeId: gn.id, point: { x: gn.x, z: gn.z } }, { kind: 'node', nodeId: o.id, point: { x: o.x, z: o.z } }, null, getRoadType(tn), c.plannerWorld, 1e12);
    if (p.valid) { c.buildRoad(p); break link; }
  }
  const N = 256;
  const cells = { 1: [], 2: [], 3: [], 4: [] };
  for (let k = 0; k < N * N; k++) {
    if (c.zones.zoneable[k] === 0) continue;
    const i = k % N, j = Math.floor(k / N);
    cells[i < 125 ? 1 : j < 125 ? 2 : i > 135 ? 3 : 4].push(k);
  }
  for (const z of [1, 2, 3, 4]) c.setZone(cells[z], z);
  let t = g.sim.tick + 10000;
  for (let k = 0; k < 6000; k++) {
    t += 5;
    cs.demand = { residential: 100, commercial: 100, industrial: 100, office: 100 };
    cs.growth(t);
    if (k % 10 === 0) for (const b of c.buildings.items.values()) if (b.state === 'construction') c.buildings.replace(b.id, { state: 'active', progress: 1 });
  }
  for (const b of c.buildings.items.values()) if (b.state === 'construction') c.buildings.replace(b.id, { state: 'active', progress: 1 });
  return c.buildings.items.size;
}
