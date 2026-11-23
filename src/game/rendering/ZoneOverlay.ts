import { DataTexture, NearestFilter, RGBAFormat } from 'three';
import { GRID_CELLS } from '../core/config';
import type { City } from '../systems/City';
import type { TerrainMaterial } from './materials/TerrainMaterial';

const N = GRID_CELLS;

/**
 * GPU zone overlay: one texel per cell — R zone id, G zoneable, B occupied by
 * a building, A tool preview. Rebuilt at most once per frame when dirty.
 */
export class ZoneOverlay {
  private readonly data = new Uint8Array(N * N * 4);
  readonly texture: DataTexture;
  private dirty = true;
  private preview: number[] = [];
  private readonly unsubs: (() => void)[] = [];

  constructor(
    private readonly city: City,
    private readonly material: TerrainMaterial,
  ) {
    this.texture = new DataTexture(this.data, N, N, RGBAFormat);
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    material.uniforms.uZoneTex.value = this.texture;
    this.unsubs.push(city.zones.onChange(() => (this.dirty = true)));
    this.unsubs.push(city.roads.onChange(() => (this.dirty = true)));
    this.unsubs.push(city.buildings.onChange(() => (this.dirty = true)));
  }

  setMode(active: boolean): void {
    this.material.uniforms.uZoneMode.value = active ? 1 : 0;
  }

  /** Highlights cells (e.g. what a fill/brush would change), coloured. */
  setPreview(cells: number[], color: number): void {
    for (const c of this.preview) this.data[c * 4 + 3] = 0;
    this.preview = cells;
    for (const c of cells) this.data[c * 4 + 3] = 255;
    this.material.uniforms.uPreviewColor.value.setHex(color);
    this.texture.needsUpdate = true;
  }

  clearPreview(): void {
    if (this.preview.length === 0) return;
    this.setPreview([], 0);
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const { zones, occupancy } = this.city;
    const d = this.data;
    for (let k = 0; k < N * N; k++) {
      const o = k * 4;
      d[o] = zones.zone[k] * 60;
      d[o + 1] = zones.zoneable[k] > 0 && occupancy.road[k] === 0 ? 255 : 0;
      d[o + 2] = occupancy.building[k] !== 0 ? 255 : 0;
    }
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.unsubs.forEach((u) => u());
    this.texture.dispose();
  }
}
