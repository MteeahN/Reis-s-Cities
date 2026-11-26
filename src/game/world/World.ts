import { Group, type Scene } from 'three';
import { CELL_SIZE, GRID_CELLS, WORLD_SIZE } from '../core/config';
import { TerrainMaterial } from '../rendering/materials/TerrainMaterial';
import type { GeneratedWorld } from './generation/generateWorld';
import { TerrainShape } from './generation/TerrainShape';
import { Heightfield } from './Heightfield';
import { OuterGrid } from './OuterGrid';
import { buildChunkGeometry, buildOuterTerrain, buildTerrainChunks } from './TerrainMeshes';
import type { Mesh } from 'three';
import { CHUNK_CELLS } from '../core/config';
import { UnlockMap } from './UnlockMap';
import { Vegetation } from './Vegetation';
import { Water } from './Water';
import { WorldGrid } from './WorldGrid';
import { terrainColor } from './terrainColor';

/**
 * Owns the static world: data (heightfield, cell grid, land ownership) and
 * its render objects (terrain chunks, scenery ring, water, vegetation).
 */
export class World {
  readonly seed: number;
  readonly shape: TerrainShape;
  readonly field: Heightfield;
  readonly outer: OuterGrid;
  readonly unlock = new UnlockMap();
  readonly grid: WorldGrid;
  readonly terrainMaterial: TerrainMaterial;
  readonly water = new Water();
  readonly vegetation = new Vegetation();
  readonly root = new Group();
  private readonly chunks: Group;

  constructor(data: GeneratedWorld) {
    this.seed = data.seed;
    this.shape = new TerrainShape(data.seed);
    this.field = new Heightfield(data.heights);
    this.outer = new OuterGrid(data.outerAxis, data.outerHeights);
    this.grid = new WorldGrid(this.field, this.unlock);
    this.terrainMaterial = new TerrainMaterial(this.unlock);

    this.root.name = 'world';
    this.chunks = buildTerrainChunks(this.field, this.shape, this.terrainMaterial);
    this.root.add(this.chunks);
    this.root.add(buildOuterTerrain(this.outer, this.shape, this.terrainMaterial));
    this.root.add(this.water.mesh);
    this.water.setDepth(this.heightAt);
    // 256 m cells: fine-grained LOD switching and frustum/shadow culling.
    this.vegetation.addSet(data.vegetation, 256, true, true);
    this.vegetation.addSet(data.outerVegetation, 1400, false);
    this.root.add(this.vegetation.group);
  }

  /**
   * After the heightfield changed over cells i0..i1 × j0..j1: re-classifies
   * those cells (water, slope, buildable) and rebuilds the terrain chunks that
   * show them (one cell of margin for the shared normals).
   */
  refreshTerrain(i0: number, j0: number, i1: number, j1: number): void {
    this.grid.refresh(i0 - 1, j0 - 1, i1 + 1, j1 + 1);
    const c0x = Math.max(0, Math.floor((i0 - 1) / CHUNK_CELLS));
    const c0z = Math.max(0, Math.floor((j0 - 1) / CHUNK_CELLS));
    const c1x = Math.floor((i1 + 1) / CHUNK_CELLS);
    const c1z = Math.floor((j1 + 1) / CHUNK_CELLS);
    for (const child of this.chunks.children) {
      const mesh = child as Mesh;
      const c = mesh.userData.chunk as { cx: number; cz: number };
      if (c.cx < c0x || c.cx > c1x || c.cz < c0z || c.cz > c1z) continue;
      mesh.geometry.dispose();
      mesh.geometry = buildChunkGeometry(this.field, this.shape, c.cx, c.cz);
    }
    // The water's depth (its colour, the shallows and foam) follows the new ground.
    this.water.setDepth(this.heightAt, (i0 - 1) * CELL_SIZE, (j0 - 1) * CELL_SIZE, (i1 + 2) * CELL_SIZE, (j1 + 2) * CELL_SIZE);
  }

  addTo(scene: Scene): void {
    scene.add(this.root);
  }

  /** Terrain height anywhere (playable heightfield inside, scenery grid outside). */
  heightAt = (x: number, z: number): number => {
    if (x >= 0 && z >= 0 && x <= WORLD_SIZE && z <= WORLD_SIZE) return this.field.sample(x, z);
    return this.outer.sample(x, z);
  };

  isCellUnlocked = (i: number, j: number): boolean => this.unlock.isCellUnlocked(i, j);

  /** RGBA top-down map image (GRID_CELLS²) for the minimap. */
  minimapImage(): Uint8ClampedArray {
    const img = new Uint8ClampedArray(GRID_CELLS * GRID_CELLS * 4);
    const rgb = new Float32Array(3);
    const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;
    for (let j = 0; j < GRID_CELLS; j++) {
      for (let i = 0; i < GRID_CELLS; i++) {
        const x = (i + 0.5) * 8;
        const z = (j + 0.5) * 8;
        const h = this.field.cellAverageHeight(i, j);
        const o = (j * GRID_CELLS + i) * 4;
        if (h < 0.2) {
          img[o] = 52;
          img[o + 1] = 112;
          img[o + 2] = 140;
        } else {
          terrainColor(rgb, 0, h, this.grid.slope[j * GRID_CELLS + i], this.shape.moisture(x, z), this.shape.forestDensity(x, z));
          // Hill shading from the east-facing slope.
          const shade = 1 + (this.field.vertex(i, j) - this.field.vertex(i + 1, j + 1)) * 0.03;
          const lockedDim = this.unlock.isCellUnlocked(i, j) ? 1 : 0.62;
          img[o] = toSrgb(rgb[0]) * shade * lockedDim;
          img[o + 1] = toSrgb(rgb[1]) * shade * lockedDim;
          img[o + 2] = toSrgb(rgb[2]) * shade * lockedDim;
        }
        img[o + 3] = 255;
      }
    }
    return img;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as { geometry?: { dispose(): void } };
      m.geometry?.dispose();
    });
    this.terrainMaterial.dispose();
    this.water.dispose();
    this.vegetation.dispose();
  }
}
