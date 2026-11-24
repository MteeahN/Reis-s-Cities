import {
  AmbientLight,
  Color,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  NoToneMapping,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { getBuilding } from '../data/buildings';
import type { ArchStyle } from '../data/styles';
import { buildingGeometry, buildingMaterials } from '../entities/building/BuildingModels';
import { nightUniform } from './nightUniform';

const W = 192;
const H = 144;

/**
 * Small pictures of building models for the catalogue cards, drawn with the
 * game's own renderer and the same inked models the city uses. Pictures are
 * cached per building and style.
 */
export class Thumbnails {
  private readonly cache = new Map<string, string>();
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(24, W / H, 0.5, 4000);
  private readonly target = new WebGLRenderTarget(W, H, { samples: 4 });
  private readonly holder = new Group();
  private readonly pixels = new Uint8Array(W * H * 4);

  constructor(private readonly renderer: WebGLRenderer) {
    this.target.texture.colorSpace = SRGBColorSpace;
    this.scene.add(new HemisphereLight(0xfff6e8, 0x8a8170, 1.6));
    this.scene.add(new AmbientLight(0xffffff, 0.35));
    const sun = new DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(-40, 80, 60);
    this.scene.add(sun);
    this.scene.add(this.holder);
  }

  /** PNG data URL of a building model ('' if it cannot be drawn). */
  get(defId: string, style: ArchStyle = 'modern'): string {
    const key = `${defId}#${style}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    let url = '';
    try {
      url = this.draw(defId, style);
    } catch {
      url = '';
    }
    this.cache.set(key, url);
    return url;
  }

  private draw(defId: string, style: ArchStyle): string {
    const def = getBuilding(defId);
    const geo = buildingGeometry(def, 0, false, def.zone ? style : 'modern');
    const mats = buildingMaterials();
    this.holder.clear();
    if (geo.plain) this.holder.add(new Mesh(geo.plain, mats.plain));
    if (geo.facade) this.holder.add(new Mesh(geo.facade, mats.facade));
    if (geo.detail) this.holder.add(new Mesh(geo.detail, mats.plain));
    const box = new Box3().setFromObject(this.holder);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const radius = Math.max(size.length() / 2, 1);
    const dist = radius / Math.sin((this.camera.fov * Math.PI) / 360) * 0.74;
    const dir = new Vector3(1, 0.85, 1.25).normalize();
    this.camera.position.copy(center).addScaledVector(dir, dist);
    this.camera.near = dist / 20;
    this.camera.far = dist * 4;
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevTone = r.toneMapping;
    const prevNight = nightUniform.value;
    const prevShadow = r.shadowMap.autoUpdate;
    const prevClear = r.getClearColor(new Color());
    const prevAlpha = r.getClearAlpha();
    r.shadowMap.autoUpdate = false;
    nightUniform.value = 0;
    r.toneMapping = NoToneMapping;
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.scene, this.camera);
    r.readRenderTargetPixels(this.target, 0, 0, W, H, this.pixels);
    r.setRenderTarget(prevTarget);
    r.toneMapping = prevTone;
    r.setClearColor(prevClear, prevAlpha);
    r.shadowMap.autoUpdate = prevShadow;
    nightUniform.value = prevNight;
    this.holder.clear();

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const img = ctx.createImageData(W, H);
    // Render targets are bottom-up; flip rows.
    for (let y = 0; y < H; y++) img.data.set(this.pixels.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  dispose(): void {
    this.target.dispose();
  }
}
