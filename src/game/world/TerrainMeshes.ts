import { BufferAttribute, BufferGeometry, Group, Mesh, type Material } from 'three';
import { CELL_SIZE, CHUNKS_PER_SIDE, CHUNK_CELLS, WORLD_SIZE } from '../core/config';
import type { Heightfield } from './Heightfield';
import type { OuterGrid } from './OuterGrid';
import type { TerrainShape } from './generation/TerrainShape';
import { terrainColor } from './terrainColor';

const SKIRT_DEPTH = 40;

/**
 * Builds one mesh per 32×32-cell chunk (64 meshes total). Each chunk has its
 * own bounding sphere, so Three's frustum culling skips off-screen chunks.
 * Normals come from the shared heightfield so chunk seams are invisible.
 */
export function buildTerrainChunks(field: Heightfield, shape: TerrainShape, material: Material): Group {
  const group = new Group();
  group.name = 'terrain-chunks';
  for (let cz = 0; cz < CHUNKS_PER_SIDE; cz++) {
    for (let cx = 0; cx < CHUNKS_PER_SIDE; cx++) {
      const mesh = new Mesh(buildChunkGeometry(field, shape, cx, cz), material);
      mesh.name = `chunk-${cx}-${cz}`;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData.chunk = { cx, cz };
      group.add(mesh);
    }
  }
  return group;
}

/** Geometry of one terrain chunk (rebuilt when the player reshapes the land). */
export function buildChunkGeometry(field: Heightfield, shape: TerrainShape, cx: number, cz: number): BufferGeometry {
  const n = { x: 0, y: 0, z: 0 };
  const vpc = CHUNK_CELLS + 1;
  const edges = {
    w: cx === 0,
    e: cx === CHUNKS_PER_SIDE - 1,
    n: cz === 0,
    s: cz === CHUNKS_PER_SIDE - 1,
  };
  const skirtVerts = (edges.w ? vpc : 0) + (edges.e ? vpc : 0) + (edges.n ? vpc : 0) + (edges.s ? vpc : 0);
  const total = vpc * vpc + skirtVerts;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const indices: number[] = [];

  const i0 = cx * CHUNK_CELLS;
  const j0 = cz * CHUNK_CELLS;
  for (let lj = 0; lj < vpc; lj++) {
    for (let li = 0; li < vpc; li++) {
      const gi = i0 + li;
      const gj = j0 + lj;
      const k = lj * vpc + li;
      const x = gi * CELL_SIZE;
      const z = gj * CELL_SIZE;
      const h = field.vertex(gi, gj);
      pos[k * 3] = x;
      pos[k * 3 + 1] = h;
      pos[k * 3 + 2] = z;
      field.normalAt(gi, gj, n);
      nor[k * 3] = n.x;
      nor[k * 3 + 1] = n.y;
      nor[k * 3 + 2] = n.z;
      const slope = Math.sqrt(Math.max(0, 1 - n.y * n.y)) / n.y;
      terrainColor(col, k * 3, h, slope, shape.moisture(x, z), shape.forestDensity(x, z));
    }
  }
  for (let lj = 0; lj < CHUNK_CELLS; lj++) {
    for (let li = 0; li < CHUNK_CELLS; li++) {
      const a = lj * vpc + li;
      const b = a + 1;
      const c = a + vpc;
      const d = c + 1;
      // Alternate diagonals for a less regular look.
      if ((li + lj) % 2 === 0) indices.push(a, c, b, b, c, d);
      else indices.push(a, c, d, a, d, b);
    }
  }

  // Skirts hide hairline gaps against the coarser outer scenery mesh.
  let next = vpc * vpc;
  const addSkirt = (edgeIndex: (t: number) => number, flip: boolean) => {
    const start = next;
    for (let t = 0; t < vpc; t++) {
      const src = edgeIndex(t);
      pos[next * 3] = pos[src * 3];
      pos[next * 3 + 1] = pos[src * 3 + 1] - SKIRT_DEPTH;
      pos[next * 3 + 2] = pos[src * 3 + 2];
      nor.copyWithin(next * 3, src * 3, src * 3 + 3);
      col.copyWithin(next * 3, src * 3, src * 3 + 3);
      next++;
    }
    for (let t = 0; t < vpc - 1; t++) {
      const a = edgeIndex(t);
      const b = edgeIndex(t + 1);
      const c = start + t;
      const d = start + t + 1;
      if (flip) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  };
  // Winding chosen so every skirt faces away from the map.
  if (edges.n) addSkirt((t) => t, true);
  if (edges.s) addSkirt((t) => CHUNK_CELLS * vpc + t, false);
  if (edges.w) addSkirt((t) => t * vpc, false);
  if (edges.e) addSkirt((t) => t * vpc + CHUNK_CELLS, true);

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setAttribute('normal', new BufferAttribute(nor, 3));
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.setIndex(indices);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  return geo;
}

/** Scenery ring around the playable map (the map square itself is left open). */
export function buildOuterTerrain(outer: OuterGrid, shape: TerrainShape, material: Material): Mesh {
  const { axis, heights, n } = outer;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      pos[k * 3] = axis[i];
      pos[k * 3 + 1] = heights[k];
      pos[k * 3 + 2] = axis[j];
    }
  }
  const indices: number[] = [];
  const eps = 0.01;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const x0 = axis[i];
      const x1 = axis[i + 1];
      const z0 = axis[j];
      const z1 = axis[j + 1];
      const insideMap = x0 >= -eps && x1 <= WORLD_SIZE + eps && z0 >= -eps && z1 <= WORLD_SIZE + eps;
      if (insideMap) continue;
      const a = j * n + i;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(pos, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const nor = geo.getAttribute('normal') as BufferAttribute;
  for (let k = 0; k < n * n; k++) {
    const ny = nor.getY(k);
    const slope = Math.sqrt(Math.max(0, 1 - ny * ny)) / Math.max(ny, 0.05);
    const x = pos[k * 3];
    const z = pos[k * 3 + 2];
    terrainColor(col, k * 3, pos[k * 3 + 1], slope, shape.moisture(x, z), shape.forestDensity(x, z));
  }
  geo.setAttribute('color', new BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mesh = new Mesh(geo, material);
  mesh.name = 'outer-terrain';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
