import { DataTexture, NearestFilter, RGBAFormat, SRGBColorSpace } from 'three';
import { GRID_CELLS } from '../core/config';
import type { City } from '../systems/City';
import type { BuildingRenderer } from './BuildingRenderer';
import { buildingLayerColor, paintLayer, type InfoLayerId } from './InfoLayers';
import type { TerrainMaterial } from './materials/TerrainMaterial';

/**
 * Shows one info layer at a time: terrain cells coloured from simulation data
 * (via a per-cell texture) and buildings tinted to match.
 */
export class InfoLayerView {
  private readonly data = new Uint8Array(GRID_CELLS * GRID_CELLS * 4);
  private readonly texture: DataTexture;
  layer: InfoLayerId | null = null;

  constructor(
    private readonly city: City,
    private readonly material: TerrainMaterial,
    private readonly buildings: BuildingRenderer,
  ) {
    this.texture = new DataTexture(this.data, GRID_CELLS, GRID_CELLS, RGBAFormat);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    material.uniforms.uInfoTex.value = this.texture;
  }

  set(layer: InfoLayerId | null): void {
    if (layer === this.layer) return;
    this.layer = layer;
    this.material.uniforms.uInfoMode.value = layer ? 1 : 0;
    this.refresh();
  }

  /** Repaint from current data (call when the simulation updates). */
  refresh(): void {
    const layer = this.layer;
    if (!layer) {
      this.buildings.setColorOverride(null);
      return;
    }
    paintLayer(layer, this.city, this.data);
    this.texture.needsUpdate = true;
    this.buildings.setColorOverride((b) => buildingLayerColor(layer, b, this.city));
  }

  dispose(): void {
    this.texture.dispose();
  }
}
