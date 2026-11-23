import { Color, DirectionalLight, HemisphereLight, MathUtils, type Scene, Vector3 } from 'three';
import { clamp } from '../../utils/math';

/**
 * Sun/moon key light (with a shadow frustum that follows the camera focus and scales with
 * zoom) plus a sky/ground hemisphere fill.
 */
export class Lighting {
  readonly sun = new DirectionalLight(new Color(0xfff0db), 2.7);
  readonly hemi = new HemisphereLight(new Color(0xcfe3ff), new Color(0x58663a), 0.55);
  private readonly sunDir = new Vector3(0.5, 0.7, 0.3).normalize();
  private shadowExtent = 0;

  constructor(scene: Scene) {
    this.sun.name = 'sun';
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    const cam = this.sun.shadow.camera;
    cam.near = 10;
    cam.far = 5000;
    scene.add(this.sun, this.sun.target, this.hemi);
  }

  setSunDirection(dir: Vector3): void {
    this.sunDir.copy(dir).normalize();
  }

  /** Key light direction from elevation/azimuth in degrees (sun by day, moon by night). */
  setLightDirection(elevationDeg: number, azimuthDeg: number): void {
    this.sunDir.setFromSphericalCoords(1, MathUtils.degToRad(90 - elevationDeg), MathUtils.degToRad(azimuthDeg));
  }

  setShadowMapSize(size: number): void {
    if (this.sun.shadow.mapSize.x === size) return;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
  }

  /** Keep the shadow frustum tight around what the camera is looking at. */
  update(focus: Vector3, cameraDistance: number): void {
    const extent = clamp(cameraDistance * 0.95, 110, 900);
    // Snap to texel-sized increments so shadows don't shimmer while panning.
    const texel = (extent * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 2000, focus.y + this.sunDir.y * 2000, fz + this.sunDir.z * 2000);
    this.sun.target.updateMatrixWorld();
    if (Math.abs(extent - this.shadowExtent) > 1) {
      const cam = this.sun.shadow.camera;
      cam.left = -extent;
      cam.right = extent;
      cam.top = extent;
      cam.bottom = -extent;
      cam.updateProjectionMatrix();
      this.shadowExtent = extent;
    }
  }
}
