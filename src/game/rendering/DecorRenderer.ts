import { DataTexture, Group, InstancedMesh, Matrix4, MeshStandardMaterial, NearestFilter, Quaternion, RedFormat, UnsignedByteType, Vector3, type BufferGeometry } from 'three';
import { PAINT_RES, PROPS } from '../data/decor';
import { partsGeometry } from '../entities/building/BuildingModels';
import type { City } from '../systems/City';
import { patchInk } from './ink';
import type { TerrainMaterial } from './materials/TerrainMaterial';

/**
 * Draws the city's ground paint (a texture the terrain shader reads) and its
 * decorations (one InstancedMesh per decoration type, rebuilt when they change).
 */
export class DecorRenderer {
  readonly group = new Group();
  private readonly paintTex: DataTexture;
  private paintSeen = -1;
  private readonly geos = new Map<string, BufferGeometry>();
  private readonly meshes = new Map<string, InstancedMesh>();
  private readonly material: MeshStandardMaterial;
  private propsDirty = true;
  private readonly unsub: () => void;

  constructor(
    private readonly city: City,
    terrain: TerrainMaterial,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.group.name = 'decorations';
    // The city's paint array is the texture's data: no copies.
    this.paintTex = new DataTexture(city.paint, PAINT_RES, PAINT_RES, RedFormat, UnsignedByteType);
    this.paintTex.magFilter = NearestFilter;
    this.paintTex.minFilter = NearestFilter;
    this.paintTex.generateMipmaps = false;
    this.paintTex.needsUpdate = true;
    terrain.uniforms.uPaintTex.value = this.paintTex;
    this.material = new MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    patchInk(this.material, { fade: [250, 900], strength: 0.7 });
    this.unsub = city.onPropsChange(() => (this.propsDirty = true));
  }

  /** Geometry of a decoration type (shared with the placement preview). */
  geometryOf(defId: string): BufferGeometry {
    let g = this.geos.get(defId);
    if (!g) {
      g = partsGeometry(PROPS.find((p) => p.id === defId)!.parts);
      this.geos.set(defId, g);
    }
    return g;
  }

  update(): void {
    if (this.city.paintVersion !== this.paintSeen) {
      this.paintSeen = this.city.paintVersion;
      this.paintTex.needsUpdate = true;
    }
    if (!this.propsDirty) return;
    this.propsDirty = false;
    const byDef = new Map<string, { x: number; z: number; rot: number }[]>();
    for (const p of this.city.props.values()) {
      const list = byDef.get(p.defId) ?? [];
      list.push(p);
      byDef.set(p.defId, list);
    }
    const m = new Matrix4();
    const q = new Quaternion();
    const pos = new Vector3();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    for (const def of PROPS) {
      const list = byDef.get(def.id) ?? [];
      let mesh = this.meshes.get(def.id);
      if (!mesh && list.length === 0) continue;
      if (!mesh || mesh.instanceMatrix.count < list.length) {
        if (mesh) {
          this.group.remove(mesh);
          mesh.dispose();
        }
        mesh = new InstancedMesh(this.geometryOf(def.id), this.material, Math.max(16, list.length * 2));
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.meshes.set(def.id, mesh);
      }
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        mesh!.setMatrixAt(i, m.compose(pos.set(p.x, this.heightAt(p.x, p.z), p.z), q, one));
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.unsub();
    for (const g of this.geos.values()) g.dispose();
    for (const m of this.meshes.values()) m.dispose();
    this.material.dispose();
    this.paintTex.dispose();
  }
}
