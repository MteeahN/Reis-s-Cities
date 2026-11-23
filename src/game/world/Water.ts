import {
  Color,
  DataTexture,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RGBAFormat,
  RepeatWrapping,
  Vector2,
} from 'three';
import { WATER_LEVEL, WORLD_SIZE } from '../core/config';
import { mulberry32 } from './generation/rng';

/** Tileable wave normal map built from integer-frequency sinusoids. */
function createWaveNormalMap(size = 256): DataTexture {
  const data = new Uint8Array(size * size * 4);
  // Many random integer-frequency waves (keeps the map tileable) with a
  // falling spectrum → isotropic ripples without a visible lattice.
  const rand = mulberry32(0x5eed);
  const waves: { kx: number; ky: number; a: number; p: number }[] = [];
  for (let n = 0; n < 48; n++) {
    const k = 2 + Math.floor(rand() * 22);
    const ang = rand() * Math.PI * 2;
    const kx = Math.round(Math.cos(ang) * k);
    const ky = Math.round(Math.sin(ang) * k);
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, a: 1.6 / Math.pow(Math.hypot(kx, ky), 1.6), p: rand() * Math.PI * 2 });
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * Math.PI * 2;
      const v = (y / size) * Math.PI * 2;
      let dx = 0;
      let dy = 0;
      for (const w of waves) {
        const c = Math.cos(w.kx * u + w.ky * v + w.p) * w.a;
        dx += c * w.kx;
        dy += c * w.ky;
      }
      const nx = -dx * 0.12;
      const ny = -dy * 0.12;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      const o = (y * size + x) * 4;
      data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[o + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  }
  const tex = new DataTexture(data, size, size, RGBAFormat);
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * One large water plane at WATER_LEVEL covering river, lake and horizon.
 * Terrain carves below it; reflections come from the sky environment map.
 */
export class Water {
  readonly mesh: Mesh;
  private readonly material: MeshStandardMaterial;
  private time = 0;

  constructor() {
    const normalMap = createWaveNormalMap();
    const extent = 40000;
    normalMap.repeat.set(extent / 160, extent / 160);
    this.material = new MeshStandardMaterial({
      color: new Color(0x1a5466),
      roughness: 0.16,
      metalness: 0.0,
      transparent: true,
      opacity: 0.9,
      normalMap,
      normalScale: new Vector2(0.5, 0.5),
      envMapIntensity: 0.55,
    });
    const geo = new PlaneGeometry(extent, extent, 1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new Mesh(geo, this.material);
    this.mesh.name = 'water';
    this.mesh.position.set(WORLD_SIZE / 2, WATER_LEVEL, WORLD_SIZE / 2);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.updateMatrix();
    this.mesh.matrixAutoUpdate = false;
  }

  update(dt: number): void {
    this.time += dt;
    const nm = this.material.normalMap!;
    nm.offset.set(this.time * 0.004, this.time * 0.0025);
  }

  dispose(): void {
    this.material.normalMap?.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
