import { PerspectiveCamera, Vector3 } from 'three';
import { CAMERA, WATER_LEVEL, WORLD_SIZE } from '../core/config';
import { MouseButton, type Input } from '../core/Input';
import { angleDelta, clamp, dampFactor } from '../../utils/math';

export type GroundFn = (x: number, z: number) => number;

/**
 * City-builder camera: orbits a ground focus point.
 *  - WASD / arrows: pan (speed scales with zoom, Shift = fast)
 *  - Q / E: rotate · Right drag: rotate + tilt · Middle drag: grab-pan
 *  - Wheel: zoom toward the cursor
 * All motion is damped toward "desired" values for smooth, frame-rate
 * independent movement; the camera never dips below the terrain.
 */
export class CameraController {
  readonly camera: PerspectiveCamera;
  readonly target = new Vector3(WORLD_SIZE / 2, 10, WORLD_SIZE / 2);
  yaw = Math.PI * 0.25;
  pitch = 0.82;
  distance = 520;

  private readonly desiredTarget = this.target.clone();
  private desiredYaw = this.yaw;
  private desiredPitch = this.pitch;
  private desiredDistance = this.distance;
  private transition = false;
  private readonly tmp = new Vector3();
  private readonly offset = new Vector3();

  constructor(
    aspect: number,
    private readonly ground: GroundFn,
  ) {
    this.camera = new PerspectiveCamera(CAMERA.fov, aspect, 1, 60000);
    this.target.y = this.groundAt(this.target.x, this.target.z);
    this.desiredTarget.copy(this.target);
    this.apply();
  }

  private groundAt(x: number, z: number): number {
    return Math.max(WATER_LEVEL, this.ground(x, z));
  }

  get forwardX(): number {
    return -Math.sin(this.yaw);
  }
  get forwardZ(): number {
    return -Math.cos(this.yaw);
  }

  /** Smoothly fly to a point; optionally change zoom. */
  focusOn(x: number, z: number, distance?: number): void {
    this.desiredTarget.set(x, 0, z);
    if (distance !== undefined) this.desiredDistance = clamp(distance, CAMERA.minDistance, CAMERA.maxDistance);
    this.transition = true;
    this.clampDesired();
  }

  /**
   * Keeps the view on a moving point (a followed vehicle); with `yaw`, it
   * also turns to look that way (from behind it).
   */
  track(x: number, z: number, yaw?: number): void {
    this.desiredTarget.set(x, 0, z);
    if (yaw !== undefined) this.desiredYaw = this.yaw + angleDelta(this.yaw, yaw);
    this.transition = false;
    this.clampDesired();
  }

  /** Jumps straight to a view (loading a saved city). */
  setView(x: number, z: number, yaw: number, pitch: number, distance: number): void {
    this.desiredTarget.set(x, 0, z);
    this.desiredYaw = yaw;
    this.desiredPitch = clamp(pitch, CAMERA.minPitch, CAMERA.maxPitch);
    this.desiredDistance = clamp(distance, CAMERA.minDistance, CAMERA.maxDistance);
    this.clampDesired();
    this.target.set(this.desiredTarget.x, this.groundAt(this.desiredTarget.x, this.desiredTarget.z), this.desiredTarget.z);
    this.yaw = this.desiredYaw;
    this.pitch = this.desiredPitch;
    this.distance = this.desiredDistance;
    this.transition = false;
    this.apply();
  }

  resetView(): void {
    this.desiredYaw = this.yaw + angleDelta(this.yaw, Math.PI * 0.25);
    this.desiredPitch = 0.82;
    this.focusOn(WORLD_SIZE / 2, WORLD_SIZE / 2, 520);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private clampDesired(): void {
    const m = CAMERA.boundsMargin;
    this.desiredTarget.x = clamp(this.desiredTarget.x, -m, WORLD_SIZE + m);
    this.desiredTarget.z = clamp(this.desiredTarget.z, -m, WORLD_SIZE + m);
    this.desiredPitch = clamp(this.desiredPitch, CAMERA.minPitch, CAMERA.maxPitch);
    this.desiredDistance = clamp(this.desiredDistance, CAMERA.minDistance, CAMERA.maxDistance);
  }

  /**
   * @param cursorGround ground point under the cursor (for zoom-to-cursor), if any
   */
  update(dt: number, input: Input, viewportHeight: number, cursorGround: Vector3 | null): void {
    const { dx, dy, wheel } = input.consume();
    const fast = input.isDown('ShiftLeft') || input.isDown('ShiftRight');

    // Keyboard pan
    let mx = 0;
    let mz = 0;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) mz += 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) mz -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) mx += 1;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) mx -= 1;
    if (mx !== 0 || mz !== 0) {
      const len = Math.hypot(mx, mz);
      const speed = (this.desiredDistance * 1.15 + 40) * (fast ? 2.6 : 1) * dt;
      const fx = this.forwardX;
      const fz = this.forwardZ;
      // right = (cos yaw, -sin yaw)
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      this.desiredTarget.x += ((fx * mz + rx * mx) / len) * speed;
      this.desiredTarget.z += ((fz * mz + rz * mx) / len) * speed;
      this.transition = false;
    }

    // Keyboard rotate
    const rotSpeed = 1.7 * dt;
    if (input.isDown('KeyQ')) this.desiredYaw += rotSpeed;
    if (input.isDown('KeyE')) this.desiredYaw -= rotSpeed;

    // Mouse drags
    if (input.buttons.has(MouseButton.Right)) {
      this.desiredYaw -= dx * 0.0055;
      this.desiredPitch += dy * 0.0042;
    } else if (input.buttons.has(MouseButton.Middle)) {
      const worldPerPx = (2 * this.distance * Math.tan((CAMERA.fov * Math.PI) / 360)) / Math.max(1, viewportHeight);
      const rx = Math.cos(this.yaw);
      const rz = -Math.sin(this.yaw);
      const tilt = 1 / Math.max(0.35, Math.sin(this.pitch));
      this.desiredTarget.x += -rx * dx * worldPerPx + this.forwardX * dy * worldPerPx * tilt;
      this.desiredTarget.z += -rz * dx * worldPerPx + this.forwardZ * dy * worldPerPx * tilt;
      this.transition = false;
    }

    // Zoom toward cursor
    if (wheel !== 0) {
      const old = this.desiredDistance;
      this.desiredDistance = clamp(old * Math.exp(wheel * 0.0011), CAMERA.minDistance, CAMERA.maxDistance);
      if (cursorGround) {
        const f = 1 - this.desiredDistance / old;
        this.desiredTarget.x += (cursorGround.x - this.desiredTarget.x) * f;
        this.desiredTarget.z += (cursorGround.z - this.desiredTarget.z) * f;
      }
      this.transition = false;
    }

    this.clampDesired();

    // Damping
    const kMove = dampFactor(this.transition ? 4.5 : 11, dt);
    const kRot = dampFactor(13, dt);
    const kZoom = dampFactor(this.transition ? 4.5 : 10, dt);
    this.target.x += (this.desiredTarget.x - this.target.x) * kMove;
    this.target.z += (this.desiredTarget.z - this.target.z) * kMove;
    const gy = this.groundAt(this.target.x, this.target.z);
    this.target.y += (gy - this.target.y) * dampFactor(6, dt);
    this.yaw += (this.desiredYaw - this.yaw) * kRot;
    this.pitch += (this.desiredPitch - this.pitch) * kRot;
    this.distance += (this.desiredDistance - this.distance) * kZoom;
    if (this.transition && Math.hypot(this.desiredTarget.x - this.target.x, this.desiredTarget.z - this.target.z) < 1) {
      this.transition = false;
    }

    this.apply();
  }

  private apply(): void {
    const cp = Math.cos(this.pitch);
    this.offset.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.distance);
    const pos = this.tmp.copy(this.target).add(this.offset);
    const minY = this.groundAt(pos.x, pos.z) + 4;
    if (pos.y < minY) pos.y = minY;
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
    const near = clamp(this.distance * 0.012, 0.5, 12);
    if (Math.abs(near - this.camera.near) > 0.05) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
  }
}
